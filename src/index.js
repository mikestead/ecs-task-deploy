'use strict'

const AWS = require('aws-sdk')
const assert = require('assert')
const merge = Object.assign

module.exports = execute

function execute(options) {
  return verifyOptions(options).then(deployTaskDefinition)
}

function verifyOptions(options) {
  try {
    assert.ok(options.awsAccessKey, 'AWS access key missing')
    assert.ok(options.awsSecretKey, 'AWS secret key missing')
    assert.ok(options.region, 'AWS region missing')
    assert.ok(options.cluster, 'ECS cluster name missing')
    assert.ok(options.service, 'ECS service name missing')
    assert.ok(options.image, 'ECS image name missing')

    process.env.AWS_ACCESS_KEY_ID = options.awsAccessKey
    process.env.AWS_SECRET_ACCESS_KEY = options.awsSecretKey
    options.image = parseImagePath(options.image)
    if (!options.timeout) options.timeout = 180

    return Promise.resolve(options)
  } catch (e) {
    return Promise.reject(e)
  }
}

function deployTaskDefinition(options) {
  const ecs = new AWS.ECS({ region: options.region, apiVersion: '2014-11-13' })
  return getService(ecs, { errors: [] }, options)
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
      assert.ok(
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
  assert.ok(
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
  return updateService(ecs, ctx, options)
    .then(context => checkForTaskKill(ecs, ctx, options))
    .then(context => waitForServiceUpdate(ecs, ctx, options))
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
    .then(data => ({ info: data.service, taskDef }))
}

function createServiceOptions(taskDef, options) {
  return {
    cluster: options.cluster,
    service: options.service,
    taskDefinition: taskDef.taskDefinitionArn
  }
}

function checkForTaskKill(ecs, ctx, options) {
  if (options.killTask) {
    if (options.verbose) console.info('searching for running task to stop')
    return ecs
      .listTasks({ cluster: options.cluster, serviceName: options.service })
      .promise()
      .then(
        data => {
          if (data && data.taskArns && data.taskArns.length) {
            const task = data.taskArns[0]
            if (options.verbose) console.info(`stopping task '${task}'`)
            return ecs
              .stopTask({
                cluster: options.cluster,
                task,
                reason: 'Making room for blue/green deployment'
              })
              .promise()
              .then(
                () => {
                  if (options.verbose) console.info(`task '${task}' stopped`)
                },
                error => {
                  console.warn(`failed to stop task '${task}'`, error)
                }
              )
          } else {
            console.info('failed to find a running task to stop')
          }
        },
        error => {
          console.warn(
            `failed to list tasks under service '${options.service}' in cluster '${options.cluster}'`,
            error
          )
        }
      )
      .then(() => ctx)
      .catch(() => ctx)
  }
  return ctx
}

function waitForServiceUpdate(ecs, ctx, options) {
  return new Promise(resolve => {
    const WAIT_TIME = 1000
    const MAX_TIMEOUT = options.timeout * 1000
    const START_TIME = Date.now()

    function wait() {
      if (options.verbose) {
        const remaining = MAX_TIMEOUT - (Date.now() - START_TIME)
        console.info(
          `waiting for service update, ${Math.round(remaining / 1000)}s remaining...`
        )
      }
      ecs
        .listTasks({
          cluster: service.info.clusterArn,
          serviceName: service.info.serviceName,
          desiredStatus: 'RUNNING'
        })
        .promise()
        .then(res => {
          const tasks = data.taskArns || []
          if (tasks.length) {
            ecs
              .describeTasks({
                tasks,
                cluster: service.info.clusterArn
              })
              .promise()
              .then(res => {
                const newTask = data.tasks.find(
                  task =>
                    task.taskDefinitionArn === service.taskDef.taskDefinitionArn
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
              .catch(e => resolve(merge(ctx, { error: e })))
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
