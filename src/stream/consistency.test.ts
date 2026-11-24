import { makeMessage } from '../test/fixtures'
import { checkConsistency } from './consistency'

const m = (id: string, text: string, streaming?: true) => makeMessage({ id, text, ...(streaming ? { streaming } : {}) })

describe('checkConsistency', () => {
  it('accepts a client that is the server plus newer messages', () => {
    const server = { lastEventId: 10, messages: [m('m-1', 'a'), m('m-2', 'Hello', true)] }
    const client = { lastEventId: 14, messages: [m('m-1', 'a'), m('m-2', 'Hello world'), m('m-3', 'new')] }
    expect(checkConsistency(server, client)).toEqual([])
  })

  it('reports duplicate ids', () => {
    const server = { lastEventId: 10, messages: [m('m-1', 'a')] }
    const client = { lastEventId: 10, messages: [m('m-1', 'a'), m('m-3', 'x'), m('m-3', 'x')] }
    expect(checkConsistency(server, client)).toEqual(['duplicate id m-3'])
  })

  it('reports missing messages', () => {
    const server = { lastEventId: 10, messages: [m('m-1', 'a'), m('m-4', 'b')] }
    const client = { lastEventId: 10, messages: [m('m-1', 'a')] }
    expect(checkConsistency(server, client)).toEqual(['missing m-4'])
  })

  it('reports a doubled token as a text mismatch', () => {
    const server = { lastEventId: 10, messages: [m('m-1', 'Hello world')] }
    const client = { lastEventId: 10, messages: [m('m-1', 'Hello Hello world')] }
    expect(checkConsistency(server, client)).toEqual(['text mismatch m-1: "Hello Hello world" ≠ "Hello world"'])
  })

  it('reports a streaming message whose client text does not extend the server text', () => {
    const server = { lastEventId: 10, messages: [m('m-1', 'Hello wor', true)] }
    const client = { lastEventId: 12, messages: [m('m-1', 'Hello')] }
    expect(checkConsistency(server, client)).toEqual(['text mismatch m-1: "Hello" does not extend "Hello wor"'])
  })

  it('reports out-of-order messages', () => {
    const server = { lastEventId: 10, messages: [m('m-1', 'a'), m('m-2', 'b')] }
    const client = { lastEventId: 10, messages: [m('m-2', 'b'), m('m-1', 'a')] }
    expect(checkConsistency(server, client)).toEqual(['order: expected m-1 at 0, found m-2'])
  })
})
