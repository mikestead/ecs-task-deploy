const { waitForServiceUpdate } = require('../src')

let ctx
beforeEach(() => {
  ctx = {
    targetTaskDef: {
      taskDefinitionArn: 'arn'
    },
    updatedService: {
      clusterArn: 'clusterArn',
      serviceName: 'serviceName'
    },
    errors: []
  }
})

test('should wait for service to update with new task definition', () => {
  const options = {
    timeout: 2
  }

  const listTasks1 = jest.fn()
  listTasks1.mockReturnValueOnce({
    promise: p => Promise.resolve({ taskArns: [] })
  })
  listTasks1.mockReturnValueOnce({
    promise: p => Promise.resolve({ taskArns: ['arn'] })
  })
  const describeTasks = jest.fn()
  describeTasks.mockReturnValueOnce({
    promise: p =>
      Promise.resolve({
        tasks: [
          {
            taskDefinitionArn: 'arn'
          }
        ]
      })
  })

  const ecs = {
    listTasks: listTasks1,
    describeTasks
  }

  return waitForServiceUpdate(ecs, ctx, options).then(ctx2 => {
    expect(ctx2.newTask).toBeDefined()
    expect(ctx2.errors.length).toBe(0)
  })
})

test('should timeout if service is not running new task with task definition', () => {
  const options = {
    timeout: 0
  }

  const listTasks = jest.fn(() => ({
    promise: p => Promise.resolve({ taskArns: [] })
  }))

  const ecs = {
    listTasks
  }

  return waitForServiceUpdate(ecs, ctx, options).then(ctx2 => {
    expect(ctx2.newTask).toBeUndefined()
    expect(ctx2.errors.length).toBe(1)
  })
})

test("should timeout if can't describe new task", () => {
  const options = {
    timeout: 0
  }

  const listTasks = jest.fn().mockReturnValue({
    promise: p =>
      Promise.resolve({
        tasks: [
          {
            taskDefinitionArn: 'arn-unknown'
          }
        ]
      })
  })

  const describeTasks = jest.fn({
    promise: p =>
      Promise.resolve({
        tasks: [
          {
            taskDefinitionArn: 'arn-unknown'
          }
        ]
      })
  })

  const ecs = {
    listTasks,
    describeTasks
  }

  return waitForServiceUpdate(ecs, ctx, options).then(ctx2 => {
    expect(ctx2.newTask).toBeUndefined()
    expect(ctx2.errors.length).toBe(1)
  })
})
