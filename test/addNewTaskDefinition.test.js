const { addNewTaskDefinition } = require('../src')

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
    expect(ctx.newTaskDef.containerDefinitions[0].image).toBe(options.image.uri)
    expect(ctx.newTaskDef.containerDefinitions[1].image).toBe(
      ctx.originalTaskDef.containerDefinitions[1].image
    )
    expect(ctx.newTaskDef.containerDefinitions[2].image).toBe(options.image.uri)
  })
})
