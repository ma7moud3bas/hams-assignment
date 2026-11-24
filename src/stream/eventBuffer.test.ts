import { tokenEvt } from '../test/fixtures'
import { createEventBuffer } from './eventBuffer'

describe('createEventBuffer', () => {
  it('returns events newer than id, in order, optionally per conversation', () => {
    const b = createEventBuffer()
    b.push(tokenEvt(1, 'c-1', 'm-1', 'a'))
    b.push(tokenEvt(2, 'c-2', 'm-2', 'b'))
    b.push(tokenEvt(3, 'c-1', 'm-1', 'c'))
    b.push(tokenEvt(4, 'c-2', 'm-2', 'd'))
    expect(b.after(1)?.map((e) => e.id)).toEqual([2, 3, 4])
    expect(b.after(2, 'c-1')?.map((e) => e.id)).toEqual([3])
  })

  it('returns [] when empty', () => {
    expect(createEventBuffer().after(100)).toEqual([])
  })

  it('returns null when the window was evicted past id', () => {
    const b = createEventBuffer(3)
    ;[1, 2, 3, 4, 5].forEach((id) => b.push(tokenEvt(id, 'c-1', 'm-1', 'x')))
    expect(b.after(2)?.map((e) => e.id)).toEqual([3, 4, 5])
    expect(b.after(1)).toBeNull()
  })

  it('upTo returns events at or below id, in order', () => {
    const b = createEventBuffer()
    ;[1, 2, 3].forEach((id) => b.push(tokenEvt(id, 'c-1', 'm-1', 'x')))
    expect(b.upTo(2).map((e) => e.id)).toEqual([1, 2])
  })

  it('clear() empties the buffer', () => {
    const b = createEventBuffer()
    b.push(tokenEvt(1, 'c-1', 'm-1', 'a'))
    b.clear()
    expect(b.after(0)).toEqual([])
  })
})
