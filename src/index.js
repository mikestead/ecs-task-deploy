'use strict'

const AWS = require('aws-sdk-promise')
const assert = require('assert')

module.exports = execute

function execute(options) {
  return verifyOptions(options)
    .then(deployTaskDefinition)
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

    // convert our env variable map into an array to closer match ECS task def format
    options.env = options.env
        ? Object.keys(options.env).map(name => ({ name, value: options.env[name] }))
        : []

    return Promise.resolve(options)
  } catch(e) {
    return Promise.reject(e)
  }
}

function deployTaskDefinition(options) {
  const ecs = new AWS.ECS({ region: options.region })
  return getService(ecs, options)
    .then(service => getActiveTaskDefinition(ecs, service, options))
    .then(taskDef => addNewTaskDefinition(ecs, taskDef, options))
    .then(taskDef => updateService(ecs, taskDef, options))
    .then(service => checkForTaskKill(ecs, service, options))
    .then(service => waitForServiceUpdate(ecs, service, options))
}

function getService(ecs, options) {
  return ecs.describeServices({ cluster: options.cluster, services: [ options.service ] }).promise()
      .then(res => res.data.services.find(service => service.serviceName == options.service))
}

function getActiveTaskDefinition(ecs, service, options) {
  if (options.verbose) console.info('get active task definition')
  return ecs.describeTaskDefinition({ taskDefinition: service.taskDefinition }).promise().then(res => res.data.taskDefinition)
}

function addNewTaskDefinition(ecs, template, options) {
  if (options.verbose) console.info(`registering new task definition with image '${options.image.uri}'`)
  const newTaskDef = newTaskDefinition(template, options)
  return ecs.registerTaskDefinition(newTaskDef).promise().then(res => res.data.taskDefinition)
}

function newTaskDefinition(template, options) {
  const containerDefinitions = template.containerDefinitions.map(c => Object.assign({}, c))
  const containers = containerDefinitions.filter(c => parseImagePath(c.image).id === options.image.id)
  assert.ok(containers.length, `No container definitions found with image '${options.image.id}', aborting.`)
  containers.forEach(c => {
    c.image = options.image.uri
    c.environment = getEnvVariables(c.environment, options)
  })

  return {
    family: template.family,
    volumes: template.volumes,
    containerDefinitions,
	  taskRoleArn: template.taskRoleArn
  }
}
/*
Overwrites an env variable if it exists, adds it if it doesn't
*/
function getEnvVariables(existing, options) {
  if (!options.env.length) return existing
  const vars = existing || []
  options.env.forEach(env => {
    const copy = Object.assign({}, env)
    const i = vars.findIndex(v => v.name === copy.name)
    if (~i) vars[i] = copy
    else vars.push(copy)
  })
  return vars
}

function parseImagePath(uri) {
  const segments = (uri || '').split('/')
  const last = segments.pop()
  const parts = last.split(':')
  const tag = parts.length > 1 ? parts.pop() : ''
  const id = segments.concat([ parts.join(':') ]).join('/')
  return { uri, id, tag }
}

function updateService(ecs, taskDef, options) {
  if (options.verbose) console.info(`update service with new task definition '${taskDef.taskDefinitionArn}'`)
  const serviceOptions = createServiceOptions(taskDef, options)
  return ecs.updateService(serviceOptions).promise().then(res => ({ info: res.data.service, taskDef }))
}

function createServiceOptions(taskDef, options) {
  return {
    cluster: options.cluster,
    service: options.service,
    taskDefinition: taskDef.taskDefinitionArn
  }
}

function checkForTaskKill(ecs, service, options) {
  if (options.killTask) {
    if (options.verbose) console.info('searching for running task to stop')
    return ecs.listTasks({ cluster: options.cluster, serviceName: options.service }).promise().then(res => {
      if (res.data && res.data.taskArns && res.data.taskArns.length) {
        const task = res.data.taskArns[0]
        if (options.verbose) console.info(`stopping task '${task}'`)
        return ecs.stopTask({ cluster: options.cluster, task, reason: 'Making room for blue/green deployment' }).promise()
          .then(() => {
            if (options.verbose) console.info(`task '${task}' stopped`)
          }, (error) => {
            console.warn(`failed to stop task '${task}'`, error)
          })
      } else {
        console.info('failed to find a running task to stop')
      }
    }, (error) => {
      console.warn(`failed to list tasks under service '${options.service}' in cluster '${options.cluster}'`, error)
    })
    .then(() => service)
    .catch(() => service)
  }
  return service
}

function waitForServiceUpdate(ecs, service, options) {
  return new Promise((resolve, reject) => {
    const WAIT_TIME = 1000
    const MAX_TIMEOUT = options.timeout * 1000
    const START_TIME = Date.now()

    function wait() {
      if (options.verbose) {
        const remaining = MAX_TIMEOUT - (Date.now() - START_TIME)
        console.info(`waiting for service update, ${Math.round(remaining / 1000)}s remaining...`)
      }
      ecs.listTasks({
        cluster: service.info.clusterArn,
        serviceName: service.info.serviceName,
        desiredStatus: 'RUNNING'
      }).promise().then(res => {
        const tasks = res.data.taskArns || []
        if (tasks.length) {
          ecs.describeTasks({
            tasks,
            cluster: service.info.clusterArn
          }).promise().then(res => {
            const task = res.data.tasks.find(task => task.taskDefinitionArn === service.taskDef.taskDefinitionArn)
            if (task) {
              resolve(task)
            } else if (Date.now() - START_TIME > MAX_TIMEOUT) {
              reject(new Error('timeout waiting for service to launch new task definition'))
            } else {
              setTimeout(wait, WAIT_TIME)
            }
          })
          .catch(e => reject(e))
        } else if (Date.now() - START_TIME > MAX_TIMEOUT) {
          reject(new Error('timeout waiting for service to launch new task definition'))
        } else {
          setTimeout(wait, WAIT_TIME)
        }
      })
    }
    wait()
  })
}
