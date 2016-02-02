#!/usr/bin/env node
'use strict'

const AWS = require('aws-sdk-promise')
const program = require('commander')
const chalk = require('chalk')
const assert = require('assert')
const env = process.env

program
	.version(require('./package.json').version)
	.option('-k, --aws-access-key <k>', 'AWS access key. Can be defined via AWS_ACCESS_KEY_ID env variable', String, env.AWS_ACCESS_KEY_ID)
	.option('-s, --aws-secret-key <k>', 'AWS secret key. Can be defined via AWS_SECRET_ACCESS_KEY env variable', String, env.AWS_SECRET_ACCESS_KEY)
	.option('-r, --region <r>', 'AWS region. Can be defined via AWS_DEFAULT_REGION env variable', String, env.AWS_DEFAULT_REGION)
	.option('-c, --cluster <c>', 'ECS cluster. Can be defined via AWS_ECS_CLUSTER env variable', String, env.AWS_ECS_CLUSTER)
	.option('-n, --service <n>', 'ECS service. Can be defined via AWS_ECS_SERVICE_NAME env variable', String, env.AWS_ECS_SERVICE_NAME)
	.option('-i, --image <i>', 'Docker image to use in new task definition e.g. user/image:tag. Can be defined via AWS_ECS_TASK_IMAGE env variable', String, env.AWS_ECS_TASK_IMAGE)
	.option('-v, --verbose', 'Enable verbose logging')
	.parse(process.argv)

execute(program)

function execute(options) {
	return verifyOptions(options)
		.then(deployTaskDefinition)
		.then(end)
		.catch(end)
}

function verifyOptions(options) {
	try {
		assert.ok(options.awsAccessKey, 'AWS access key missing')
		assert.ok(options.awsSecretKey, 'AWS secret key missing')
		assert.ok(options.region, 'AWS region missing')
		assert.ok(options.cluster, 'ECS cluster name missing')
		assert.ok(options.service, 'ECS service name missing')
		assert.ok(options.image, 'ECS image name missing')

		env.AWS_ACCESS_KEY_ID = options.awsAccessKey
		env.AWS_SECRET_ACCESS_KEY = options.awsSecretKey
		options.image = parseImagePath(options.image)

		return Promise.resolve(options)
	} catch(e) {
		return Promise.reject(e)
	}
}

function deployTaskDefinition(options) {
	const ecs = new AWS.ECS({ region: options.region })
	return getService(ecs, options)
		.then(service => getActiveTaskDefinition(ecs, service, options))
		.then(taskDef => updateTaskDefinition(ecs, taskDef, options))
		//.then(taskDef => updateService(ecs, taskDef, options))
		//.then(service => waitForServiceUpdate(ecs, service, options))
}

function getService(ecs, options) {
	return ecs.describeServices({ cluster: options.cluster, services: [ options.service ] }).promise()
			.then(res => res.data.services.find(service => service.serviceName == options.service))
}

function getActiveTaskDefinition(ecs, service, options) {
	return ecs.describeTaskDefinition({ taskDefinition: service.taskDefinition }).promise().then(res => res.data.taskDefinition)
}

function updateTaskDefinition(ecs, template, options) {
	console.log('getActiveTaskDefinition')
	const newTaskDef = newTaskDefinition(template, options)
	console.log(newTaskDef)
	//return ecs.registerTaskDefinition(newTaskDef).promise()
}

function newTaskDefinition(template, options) {
	return {
		family: template.family,
		volumes: template.volumes,
		containerDefinitions:
			template.containerDefinitions.map(c => newContainerDefinition(c, options))
	}
}

function newContainerDefinition(container, options) {
	const image = parseImagePath(container.image)
	if (image.id === options.image.id) {
		container.image = options.image.uri
	}
	return container
}

function parseImagePath(uri) {
	const segments = (uri || '').split('/')
	const last = segments.pop()
	const parts = last.split(':')
	const tag = parts.length > 1 ? parts.pop() : ''
	const id = segments.concat([parts.join(':')]).join('/')
	return { uri, id, tag }
}

function updateService(ecs, taskDef, options) {
	const serviceOptions = createServiceOptions(res.taskDefinition, options)
	return ecs.updateService(serviceOptions).promise().then(info => ({ info, taskDef }))
}

function createServiceOptions(taskDefinition, options) {
	return {
		cluster: options.cluster,
		service: options.service,
		taskDefinition: taskDefinition.taskDefinitionArn
	}
}

function waitForServiceUpdate(ecs, service, options) {
	return ecs.listTasks({
		cluster: service.info.clusterArn,
		serviceName: service.info.serviceName,
		desiredStatus: 'RUNNING'
	}).promise().then(res => {
		if (res.taskArns.some(arn => arn === service.taskDef.taskDefinitionArn)) {
			return true
		} else {
			return waitForServiceUpdate(ecs, service, options)
		}
	})
}

function end(result) {
	if (result instanceof Error) {
		console.error(chalk.red(result.message))
		process.exist(1)
	} else {
		console.info('Deployment complete')
		process.exist(0)
	}
}
