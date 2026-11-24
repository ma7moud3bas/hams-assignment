import { parseStreamEvent } from './parseEvent'

describe('parseStreamEvent', () => {
  it('parses a token event', () => {
    const raw = '{"id":5,"type":"token","conversationId":"c-1","messageId":"m-9","text":" hi"}'
    expect(parseStreamEvent(raw)).toEqual({
      id: 5,
      type: 'token',
      conversationId: 'c-1',
      messageId: 'm-9',
      text: ' hi',
    })
  })

  it('parses a message event', () => {
    const message = { id: 'm-1', conversationId: 'c-1', role: 'customer', text: 'hi', createdAt: '2026-01-01T00:00:00.000Z' }
    const raw = JSON.stringify({ id: 7, type: 'message', conversationId: 'c-1', message })
    expect(parseStreamEvent(raw)).toEqual({ id: 7, type: 'message', conversationId: 'c-1', message })
  })

  it('parses a tool_call event', () => {
    const raw = JSON.stringify({
      id: 8,
      type: 'tool_call',
      conversationId: 'c-3',
      name: 'transfer_to_human',
      args: { reason: 'Customer asked to speak to a person' },
    })
    expect(parseStreamEvent(raw)).toMatchObject({ type: 'tool_call', args: { reason: 'Customer asked to speak to a person' } })
  })

  it.each([
    'not json',
    '{"id":"5","type":"token","conversationId":"c-1","messageId":"m-9","text":"x"}',
    '{"id":5,"type":"bogus","conversationId":"c-1"}',
    '{"id":5,"type":"token","conversationId":"c-1","messageId":"m-9"}',
    '{"id":5,"type":"tool_call","conversationId":"c-1","name":"transfer_to_human","args":{}}',
    '{"id":5,"type":"status","conversationId":"c-1","status":"weird"}',
    '{"id":5,"type":"message","conversationId":"c-1","message":{"id":"m-1"}}',
    'null',
  ])('rejects malformed frame %s', (raw) => {
    expect(parseStreamEvent(raw)).toBeNull()
  })
})
