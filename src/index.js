'use strict'

const AWS = require('aws-sdk')
const merge = Object.assign

module.exports = exports = execute

function execute(options) {
  return verifyOptions(options).then(() => {
    const ecs = new AWS.ECS({
      region: options.region,
      apiVersion: '2014-11-13'
    })
    const ctx = { errors: [] }
    return deployTaskDefinition(ecs, ctx, options)
  })
}

function verifyOptions(options) {
  try {
    assert(options.awsAccessKey, 'AWS access key missing')
    assert(options.awsSecretKey, 'AWS secret key missing')
    assert(options.region, 'AWS region missing')
    assert(options.cluster, 'ECS cluster name missing')
    assert(options.service, 'ECS service name missing')
    assert(options.image, 'ECS image name missing')

    process.env.AWS_ACCESS_KEY_ID = options.awsAccessKey
    process.env.AWS_SECRET_ACCESS_KEY = options.awsSecretKey
    options.image = parseImagePath(options.image)
    if (!options.timeout) options.timeout = 180

    return Promise.resolve(options)
  } catch (e) {
    return Promise.reject(e)
  }
}

function deployTaskDefinition(ecs, ctx, options) {
  return getService(ecs, ctx, options)
    .then(ctx => getActiveTaskDefinition(ecs, ctx, options))
    .then(ctx => addNewTaskDefinition(ecs, ctx, options))
    .then(ctx => updateServiceTaskDef(ecs, ctx, options))
    .then(ctx => checkForRollback(ecs, ctx, options))
    .then(ctx => checkRollbackOutcome(ecs, ctx, options))
}

function getService(ecs, ctx, options) {
  return ecs
    .describeServices({ cluster: options.cluster, services: [options.service] })
    .promise()
    .then(data => {
      const service = data.services.find(
        service => service.serviceName == options.service
      )
      assert(
        service,
        `Failed to find ECS service with name "${options.service}"`
      )
      return merge(ctx, { service })
    })
}

function getActiveTaskDefinition(ecs, ctx, options) {
  if (options.verbose) console.info('get active task definition')
  return ecs
    .describeTaskDefinition({ taskDefinition: ctx.service.taskDefinition })
    .promise()
    .then(data => merge(ctx, { originalTaskDef: data.taskDefinition }))
}

function addNewTaskDefinition(ecs, ctx, options) {
  if (options.verbose)
    console.info(
      `registering new task definition with image '${options.image.uri}'`
    )
  const newTaskDef = newTaskDefinition(ctx.originalTaskDef, options)
  return ecs.registerTaskDefinition(newTaskDef).promise().then(data =>
    merge(ctx, {
      newTaskDef: data.taskDefinition,
      targetTaskDef: data.taskDefinition
    })
  )
}

function newTaskDefinition(template, options) {
  const containerDefinitions = template.containerDefinitions.map(c =>
    Object.assign({}, c)
  )
  const containers = containerDefinitions.filter(
    c => parseImagePath(c.image).id === options.image.id
  )
  assert(
    containers.length,
    `No container definitions found with image '${options.image.id}', aborting.`
  )
  containers.forEach(c => c.image = options.image.uri)

  return {
    family: template.family,
    volumes: template.volumes,
    containerDefinitions
  }
}

function parseImagePath(uri) {
  const segments = (uri || '').split('/')
  const last = segments.pop()
  const parts = last.split(':')
  const tag = parts.length > 1 ? parts.pop() : ''
  const id = segments.concat([parts.join(':')]).join('/')
  return { uri, id, tag }
}

function updateServiceTaskDef(ecs, ctx, options) {
  return updateService(ecs, ctx, options).then(context =>
    waitForServiceUpdate(ecs, ctx, options)
  )
}

function updateService(ecs, ctx, options) {
  if (options.verbose)
    console.info(
      `update service with new task definition '${ctx.targetTaskDef.taskDefinitionArn}'`
    )
  const serviceOptions = createServiceOptions(ctx.targetTaskDef, options)
  return ecs
    .updateService(serviceOptions)
    .promise()
    .then(data => merge(ctx, { updatedService: data.service }))
}

function createServiceOptions(taskDef, options) {
  const opts = {
    cluster: options.cluster,
    service: options.service,
    taskDefinition: taskDef.taskDefinitionArn
  }
  if (options.desiredCount !== undefined) {
    opts.desiredCount = options.desiredCount
  }
  if (options.minPercent !== undefined) {
    opts.minimumHealthyPercent = options.minPercent
  }
  if (options.maxPercent !== undefined) {
    opts.maximumPercent = options.maxPercent
  }
  return opts
}

function waitForServiceUpdate(ecs, ctx, options) {
  return new Promise(resolve => {
    const WAIT_TIME = 1000
    const MAX_TIMEOUT = options.timeout * 1000
    const START_TIME = Date.now()
    const updatedService = ctx.updatedService

    function wait() {
      if (options.verbose) {
        const remaining = MAX_TIMEOUT - (Date.now() - START_TIME)
        console.info(
          `waiting for service update, ${Math.round(remaining / 1000)}s remaining...`
        )
      }
      ecs
        .listTasks({
          cluster: updatedService.clusterArn,
          serviceName: updatedService.serviceName,
          desiredStatus: 'RUNNING'
        })
        .promise()
        .then(data => {
          const tasks = data.taskArns || []
          if (tasks.length) {
            ecs
              .describeTasks({
                tasks,
                cluster: updatedService.clusterArn
              })
              .promise()
              .then(data => {
                const newTask = data.tasks.find(
                  task =>
                    task.taskDefinitionArn ===
                    ctx.targetTaskDef.taskDefinitionArn
                )
                if (newTask) {
                  resolve(merge(ctx, { newTask }))
                } else if (Date.now() - START_TIME > MAX_TIMEOUT) {
                  ctx.errors.push(new TimeoutError())
                  resolve(ctx)
                } else {
                  setTimeout(wait, WAIT_TIME)
                }
              })
              .catch(e => {
                ctx.errors.push(e)
                resolve(ctx)
              })
          } else if (Date.now() - START_TIME > MAX_TIMEOUT) {
            ctx.errors.push(new TimeoutError())
            resolve(ctx)
          } else {
            setTimeout(wait, WAIT_TIME)
          }
        })
    }
    wait()
  })
}

function checkForRollback(ecs, ctx, options) {
  if (ctx.errors.length) {
    console.warn(
      'service update failed using new task definition, rolling back to previous task definition'
    )
    ctx.rollback = true
    ctx.targetTaskDef = ctx.originalTaskDef
    return updateServiceTaskDef(ecs, ctx, options)
  }
  return ctx
}

function checkRollbackOutcome(ecs, ctx, options) {
  if (!ctx.rollback) return ctx
  if (
    ctx.newTask &&
    ctx.newTask.taskDefinitionArn === ctx.originalTaskDef.taskDefinitionArn
  ) {
    if (options.verbose)
      console.info(
        `rollback to task definition "${ctx.originalTaskDef.taskDefinitionArn}" successful`
      )
  } else {
    if (options.verbose)
      console.warn(
        `rollback to task definition "${ctx.originalTaskDef.taskDefinitionArn}" failed`
      )
    ctx.errors.push(
      new Error(
        `failed rollback to previous task definition "${ctx.originalTaskDef.taskDefinitionArn}"`
      )
    )
  }
  return ctx
}

function TimeoutError(message) {
  this.message =
    message || 'timeout waiting for service to launch new task definition'
  this.name = this.constructor.name
  this.stack = new Error().stack
}
TimeoutError.prototype = Object.create(Error.prototype)

function AssertionError(message) {
  this.message = message
  this.name = this.constructor.name
  this.stack = new Error().stack
}
AssertionError.prototype = Object.create(Error.prototype)

function assert(value, message) {
  if (!value) throw new AssertionError(message)
}

if (typeof process !== 'undefined' && !!process.env.TEST) {
  exports.getService = getService
  exports.getActiveTaskDefinition = getActiveTaskDefinition
  exports.addNewTaskDefinition = addNewTaskDefinition
  exports.newTaskDefinition = newTaskDefinition
  exports.parseImagePath = parseImagePath
  exports.updateServiceTaskDef = updateServiceTaskDef
  exports.updateService = updateService
  exports.createServiceOptions = createServiceOptions
  exports.waitForServiceUpdate = waitForServiceUpdate
}
