#!/usr/bin/env node
'use strict'

const program = require('commander')
const chalk = require('chalk')
const execute = require('./index')
const env = process.env

program
	.version(require('./../package.json').version)
	.option('-k, --aws-access-key <k>', 'AWS access key. Can be defined via AWS_ACCESS_KEY_ID env variable', String, env.AWS_ACCESS_KEY_ID)
	.option('-s, --aws-secret-key <k>', 'AWS secret key. Can be defined via AWS_SECRET_ACCESS_KEY env variable', String, env.AWS_SECRET_ACCESS_KEY)
	.option('-r, --region <r>', 'AWS region. Can be defined via AWS_DEFAULT_REGION env variable', String, env.AWS_DEFAULT_REGION)
	.option('-c, --cluster <c>', 'ECS cluster. Can be defined via AWS_ECS_CLUSTER env variable', String, env.AWS_ECS_CLUSTER)
	.option('-n, --service <n>', 'ECS service. Can be defined via AWS_ECS_SERVICE_NAME env variable', String, env.AWS_ECS_SERVICE_NAME)
	.option('-i, --image <i>', 'Docker image to use in new task definition e.g. user/image:tag. Can be defined via AWS_ECS_TASK_IMAGE env variable', String, env.AWS_ECS_TASK_IMAGE)
	.option('-t, --timeout <t>', 'Maximum timeout (sec) to wait for ECS service to launch new task. Defaults to 90', parseInt, '90')
	.option('-v, --verbose', 'Enable verbose logging')
	.parse(process.argv)

execute(program)
	.then(newTask => complete(newTask), e => error(e))

function complete(newTask) {
	console.info(chalk.bold.cyan(`Task '${newTask.taskDefinitionArn}' created and deployed`))
	process.exit(0)
}

function error(e) {
	const msg = (e instanceof Error) ? e.message : e
	console.error(chalk.red(msg))
	process.exit(1)
}
