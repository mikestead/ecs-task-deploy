const { newTaskDefinition } = require('../src')

const template = {
  family: 'family',
  volumes: [],
  containerDefinitions: [
    {
      name: 'webapp',
      image: 'stead/ecs-task-deploy:0.0.1',
      environment: [],
      links: [],
      memory: 512,
      cpu: 300,
      portMappings: [
        {
          hostPort: 0,
          containerPort: 80,
          protocol: 'tcp'
        }
      ]
    },
    {
      name: 'nginx',
      image: 'nginx:2.5.1'
    },
    {
      name: 'webapp',
      image: 'stead/ecs-task-deploy:0.0.1',
      environment: [],
      links: [],
      memory: 512,
      cpu: 300,
      portMappings: [
        {
          hostPort: 0,
          containerPort: 80,
          protocol: 'tcp'
        }
      ]
    }
  ]
}

const options = {
  image: {
    uri: 'stead/ecs-task-deploy:1.0.0',
    id: 'stead/ecs-task-deploy',
    tag: '1.0.0'
  }
}

test('', () => {
  const taskDef = newTaskDefinition(template, options)
  expect(taskDef).toBeDefined()
  expect(taskDef.containerDefinitions.length).toBe(
    template.containerDefinitions.length
  )
  expect(taskDef.containerDefinitions[0].image).toEqual(options.image.uri)
  expect(taskDef.containerDefinitions[1].image).toEqual(
    template.containerDefinitions[1].image
  )
  expect(taskDef.containerDefinitions[2].image).toEqual(options.image.uri)
})
