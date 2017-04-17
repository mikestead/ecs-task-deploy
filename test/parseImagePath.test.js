const { parseImagePath } = require('../src')

const uris = [
  {
    uri: 'nginx:3.2.1',
    id: 'nginx',
    tag: '3.2.1'
  },
  {
    uri: '3512304872.dte.ecr.us-east-1.amazonaws.com/webapp:1.2.3',
    id: '3512304872.dte.ecr.us-east-1.amazonaws.com/webapp',
    tag: '1.2.3'
  },
  {
    uri: 'stead/ecs-task-deploy:0.0.1',
    id: 'stead/ecs-task-deploy',
    tag: '0.0.1'
  },
  {
    uri: 'stead/ecs-task-deploy',
    id: 'stead/ecs-task-deploy',
    tag: ''
  },
  {
    uri: 'stead/ecs-task-deploy:latest',
    id: 'stead/ecs-task-deploy',
    tag: 'latest'
  }
]

test('should parse id and tag from uri', () => {
  uris.forEach(src => {
    const parsed = parseImagePath(src.uri)
    expect(parsed.uri).toBe(src.uri)
    expect(parsed.id).toBe(src.id)
    expect(parsed.tag).toBe(src.tag)
  })
})
