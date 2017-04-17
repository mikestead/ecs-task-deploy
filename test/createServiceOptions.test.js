const { createServiceOptions } = require('../src')

const taskDef = {
  taskDefinitionArn: 'arn'
}

test('should build service options from taskdef and user options', () => {
  const options = {
    cluster: 'cluster',
    service: 'service',
    desiredCount: 4,
    minPercent: 100,
    maxPercent: 200
  }
  const serviceOpts = createServiceOptions(taskDef, options)
  expect(serviceOpts).toEqual({
    cluster: options.cluster,
    service: options.service,
    taskDefinition: taskDef.taskDefinitionArn,
    desiredCount: options.desiredCount,
    minimumHealthyPercent: options.minPercent,
    maximumPercent: options.maxPercent
  })
})

test('should omit service options not included by user', () => {
  const options = {
    cluster: 'cluster',
    service: 'service'
  }
  const serviceOpts = createServiceOptions(taskDef, options)
  expect(serviceOpts).toEqual({
    cluster: options.cluster,
    service: options.service,
    taskDefinition: taskDef.taskDefinitionArn
  })
})
