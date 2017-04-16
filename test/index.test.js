const rewire = require('rewire')
const index = rewire('./src/index')
const get = member => index.__get__(member)

describe('getService', () => {
  const getService = get('getService')

  test('should find service with defined name', () => {
    const serviceName = 'sn'
    const service = { serviceName }
    const otherService = { serviceName: 'other' }
    const options = { service: serviceName }

    const ecs = {
      describeServices: p => ({
        promise: () => Promise.resolve({ services: [otherService, service] })
      })
    }
    return getService(ecs, {}, options).then(ctx => {
      expect(ctx.service).toBe(service)
    })
  })

  test('should throw if service with defined name not found', () => {
    const serviceName = 'sn'
    const service = { serviceName }
    const otherService = { serviceName: 'other' }
    const options = { service: 'incorrect' }

    const ecs = {
      describeServices: p => ({
        promise: () => Promise.resolve({ services: [otherService, service] })
      })
    }
    return getService(ecs, {}, options).then(
      data => {
        throw new Error('Expected error but none found')
      },
      e => expect(e).toBeDefined()
    )
  })
})

describe('getActiveTaskDefinition', () => {
  const getActiveTaskDefinition = get('getActiveTaskDefinition')

  test('should find and return the active task definition', () => {
    const taskDefId = 'taskDefId'
    const ctx = {
      service: {
        taskDefinition: taskDefId
      }
    }
    const taskDefinition = {}
    const ecs = {
      describeTaskDefinition: p => ({
        promise: () => Promise.resolve({ taskDefinition })
      })
    }
    return getActiveTaskDefinition(ecs, ctx, {}).then(ctx => {
      expect(ctx.originalTaskDef).toBe(taskDefinition)
    })
  })

  test('should throw if fails to find active task definition', () => {
    const taskDefId = 'taskDefId'
    const ctx = {
      service: {
        taskDefinition: taskDefId
      }
    }
    const taskDefinition = {}
    const ecs = {
      describeTaskDefinition: p => ({
        promise: () =>
          Promise.reject(new Error('failed to find active task def'))
      })
    }
    return getActiveTaskDefinition(ecs, ctx, {}).then(
      data => {
        throw new Error('Expected error but none found')
      },
      e => expect(e).toBeDefined()
    )
  })
})

describe('addNewTaskDefinition', () => {
  const addNewTaskDefinition = get('addNewTaskDefinition')
  const ctx = {
    originalTaskDef: {
      containerDefinitions: [
        {
          image: 'stead/ecs-task-deploy:0.0.1'
        },
        {
          image: '3512304872.dte.ecr.us-east-1.amazonaws.com/webapp:1.2.3'
        },
        {
          image: 'stead/ecs-task-deploy:0.0.1'
        }
      ]
    }
  }
  test('should create, update and register new taskdef', () => {
    const options = {
      image: {
        uri: 'stead/ecs-task-deploy:0.0.2',
        id: 'stead/ecs-task-deploy',
        tag: '0.0.1'
      }
    }
    const ecs = {
      registerTaskDefinition: taskDefinition => ({
        promise: p => Promise.resolve({ taskDefinition })
      })
    }

    return addNewTaskDefinition(ecs, ctx, options).then(ctx => {
      expect(ctx.newTaskDef).toBeDefined()
      expect(ctx.newTaskDef).toBe(ctx.targetTaskDef)
      expect(ctx.newTaskDef.containerDefinitions[0].image).toBe(
        options.image.uri
      )
      expect(ctx.newTaskDef.containerDefinitions[1].image).toBe(
        ctx.originalTaskDef.containerDefinitions[1].image
      )
      expect(ctx.newTaskDef.containerDefinitions[2].image).toBe(
        options.image.uri
      )
    })
  })
})
