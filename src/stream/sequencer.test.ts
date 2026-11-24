import { createSequencer } from './sequencer'

describe('createSequencer', () => {
  it('applies consecutive events and advances the cursor', () => {
    const s = createSequencer(10)
    expect([s.accept({ id: 11 }), s.accept({ id: 12 })]).toEqual(['apply', 'apply'])
    expect(s.cursor).toBe(12)
  })

  it('drops the 3-event replay overlap after a resume', () => {
    const s = createSequencer(10)
    expect([8, 9, 10].map((id) => s.accept({ id }))).toEqual(['duplicate', 'duplicate', 'duplicate'])
    expect(s.accept({ id: 11 })).toBe('apply')
  })

  it('drops an event delivered twice', () => {
    const s = createSequencer(10)
    expect(s.accept({ id: 11 })).toBe('apply')
    expect(s.accept({ id: 11 })).toBe('duplicate')
    expect(s.cursor).toBe(11)
  })

  it('reports a gap without advancing', () => {
    const s = createSequencer(10)
    expect(s.accept({ id: 13 })).toBe('gap')
    expect(s.cursor).toBe(10)
    expect(s.accept({ id: 11 })).toBe('apply')
  })

  it('reports reset when ids go below the replay window (server restarted)', () => {
    const s = createSequencer(500)
    expect(s.accept({ id: 1 })).toBe('reset')
    expect(s.accept({ id: 497 })).toBe('reset')
    expect(s.accept({ id: 498 })).toBe('duplicate')
  })
})
