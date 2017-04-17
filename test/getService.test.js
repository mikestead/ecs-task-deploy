const { getService } = require('../src')

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
