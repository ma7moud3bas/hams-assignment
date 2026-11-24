import { render } from '@testing-library/react'
import type { Message } from '../../api/types'
import { makeMessage } from '../../test/fixtures'
import { stubLayout } from '../../test/testRuntime'
import type { ThreadItem } from './buildThreadItems'
import { MessageList } from './MessageList'

const bubbleRenders = vi.hoisted(() => ({ count: 0 }))

vi.mock('./MessageBubble', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./MessageBubble')>()
  return {
    ...actual,
    MessageBubble: (props: Parameters<typeof actual.MessageBubble>[0]) => {
      bubbleRenders.count++
      return actual.MessageBubble(props)
    },
  }
})

const toItems = (messages: Message[]): ThreadItem[] =>
  messages.map((message) => ({ kind: 'message', key: `m:${message.id}`, message }))

function manyMessages(n: number, last?: Partial<Message>): Message[] {
  return Array.from({ length: n }, (_, i) =>
    makeMessage({ id: `m-${i}`, role: i % 2 ? 'ai' : 'customer', text: `message ${i}`, ...(i === n - 1 ? last : {}) }),
  )
}

beforeEach(() => {
  bubbleRenders.count = 0
  stubLayout()
})
afterEach(() => vi.restoreAllMocks())

describe('MessageList', () => {
  it('renders only a window of a 5,000-message thread', () => {
    const { container } = render(<MessageList items={toItems(manyMessages(5000))} />)
    const rows = container.querySelectorAll('[data-index]')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThan(60)
  })

  it('a new token re-renders only the streaming row', () => {
    const messages = manyMessages(5000, { role: 'ai', text: 'Hello', streaming: true })
    const { rerender, container } = render(<MessageList items={toItems(messages)} />)
    const before = bubbleRenders.count
    const visible = container.querySelectorAll('[data-index]').length
    expect(visible).toBeGreaterThan(1)

    const last = messages.at(-1)!
    const next = messages.with(-1, { ...last, text: 'Hello world' })
    rerender(<MessageList items={toItems(next)} />)

    expect(bubbleRenders.count).toBe(before + 1)
    expect(container).toHaveTextContent('Hello world')
  })

  it('renders message text with dir="auto" and marks streaming replies', () => {
    const { container } = render(
      <MessageList items={toItems([makeMessage({ id: 'm-1', role: 'ai', text: 'مرحبا', streaming: true })])} />,
    )
    const text = container.querySelector('.bubble p')!
    expect(text).toHaveAttribute('dir', 'auto')
    expect(text).toHaveTextContent('مرحبا')
    expect(container.querySelector('[data-streaming="true"]')).not.toBeNull()
  })
})
