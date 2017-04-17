const { getActiveTaskDefinition } = require('../src')

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
      promise: () => Promise.reject(new Error('failed to find active task def'))
    })
  }
  return getActiveTaskDefinition(ecs, ctx, {}).then(
    data => {
      throw new Error('Expected error but none found')
    },
    e => expect(e).toBeDefined()
  )
})
