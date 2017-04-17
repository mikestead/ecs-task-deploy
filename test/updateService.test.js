const { updateService } = require('../src')

const options = {}

test('should update service with new task definition', () => {
  const service = {
    name: 'webapp'
  }

  const ecs = {
    updateService: serviceOptions => ({
      promise: p => Promise.resolve({ service })
    })
  }

  const ctx = {
    targetTaskDef: {
      taskDefinitionArn: 'arn'
    }
  }

  return updateService(ecs, ctx, options).then(ctx2 => {
    expect(ctx2.updatedService).toEqual(service)
  })
})
