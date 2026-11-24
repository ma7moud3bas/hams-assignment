import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useUiStore } from '../../store/uiStore'
import { FakeEventSource } from '../../test/fakeEventSource'
import { makeConversation, makeMessage, msgEvt, startEvt, tokenEvt } from '../../test/fixtures'
import { createTestApi, createTestRuntime, renderWithRuntime } from '../../test/testRuntime'
import { ConversationList } from './ConversationList'

const conversations = [
  makeConversation({ id: 'c-1', customer: 'Sara Alqahtani', status: 'ai', lastMessage: 'Any update?', unread: 2 }),
  makeConversation({ id: 'c-2', customer: 'محمد العتيبي', status: 'needs_human', lastMessage: 'طلبي ما وصل', unread: 0 }),
  makeConversation({ id: 'c-3', customer: 'John Carter', status: 'human', lastMessage: 'Thanks', unread: 0 }),
  makeConversation({ id: 'c-4', customer: 'Daniel Kim', status: 'closed', lastMessage: 'Bye', unread: 1 }),
]

async function setup() {
  FakeEventSource.reset()
  const rt = createTestRuntime(createTestApi(conversations))
  await rt.sync.start()
  const es = FakeEventSource.latest()
  es.open()
  renderWithRuntime(<ConversationList />, rt)
  await screen.findAllByRole('option')
  return { rt, es }
}

const option = (name: string) => screen.getByRole('option', { name: new RegExp(name) })

describe('ConversationList', () => {
  it('renders name, status label, last message and unread for each conversation', async () => {
    await setup()
    expect(screen.getAllByRole('option')).toHaveLength(4)
    const sara = option('Sara Alqahtani')
    expect(within(sara).getByText('AI handling')).toBeInTheDocument()
    expect(within(sara).getByText('Any update?')).toBeInTheDocument()
    expect(within(sara).getByLabelText('2 unread')).toBeInTheDocument()
    expect(within(option('محمد العتيبي')).getByText('Needs human')).toBeInTheDocument()
    expect(within(option('محمد العتيبي')).queryByLabelText(/unread/)).toBeNull()
    expect(within(option('John Carter')).getByText('Human handling')).toBeInTheDocument()
    expect(within(option('Daniel Kim')).getByText('Closed')).toBeInTheDocument()
  })

  it('updates preview, unread and order live', async () => {
    const { es } = await setup()
    act(() => {
      es.emit(msgEvt(101, 'c-4', makeMessage({ id: 'm-9', conversationId: 'c-4', role: 'customer', text: 'Hello again' })))
    })
    await waitFor(() => expect(screen.getAllByRole('option')[0]).toHaveTextContent('Daniel Kim'))
    const first = screen.getAllByRole('option')[0]!
    expect(within(first).getByText('Hello again')).toBeInTheDocument()
    expect(within(first).getByLabelText('2 unread')).toBeInTheDocument()
  })

  it('shows the streaming draft as the preview', async () => {
    const { es } = await setup()
    act(() => es.emit(startEvt(101, 'c-3', 'm-50')))
    expect(await within(option('John Carter')).findByText('AI is typing…')).toBeInTheDocument()
    act(() => es.emit(tokenEvt(102, 'c-3', 'm-50', 'Hi')))
    expect(await within(option('John Carter')).findByText('Hi')).toBeInTheDocument()
  })

  it('selecting a conversation marks it selected and clears its unread badge', async () => {
    await setup()
    await userEvent.click(option('Sara Alqahtani'))
    expect(option('Sara Alqahtani')).toHaveAttribute('aria-selected', 'true')
    expect(useUiStore.getState().selectedId).toBe('c-1')
    expect(within(option('Sara Alqahtani')).queryByLabelText(/unread/)).toBeNull()
  })

  it('ArrowDown selects the next conversation', async () => {
    await setup()
    await userEvent.click(option('Sara Alqahtani'))
    await userEvent.keyboard('{ArrowDown}')
    expect(useUiStore.getState().selectedId).toBe('c-2')
    expect(option('محمد العتيبي')).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(useUiStore.getState().selectedId).toBe('c-4')
  })

  it('keeps updating after the server restarts', async () => {
    FakeEventSource.reset()
    const api = createTestApi(conversations, 500)
    const rt = createTestRuntime(api)
    await rt.sync.start()
    FakeEventSource.latest().open()
    renderWithRuntime(<ConversationList />, rt)
    await screen.findAllByRole('option')

    api.getConversations.mockResolvedValue({ lastEventId: 7, conversations })
    act(() => FakeEventSource.latest().emit(msgEvt(1, 'c-4', makeMessage({ id: 'm-1', conversationId: 'c-4' }))))
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2))
    const restarted = FakeEventSource.latest()
    restarted.open()
    act(() =>
      restarted.emit(msgEvt(8, 'c-4', makeMessage({ id: 'm-2', conversationId: 'c-4', text: 'live after restart' }))),
    )
    expect(await within(option('Daniel Kim')).findByText('live after restart')).toBeInTheDocument()
  })

  it('shows an error with Retry when loading fails', async () => {
    const api = createTestApi(conversations)
    api.getConversations.mockRejectedValueOnce(new Error('offline'))
    const rt = createTestRuntime(api)
    renderWithRuntime(<ConversationList />, rt)
    expect(await screen.findByText("Couldn't load conversations")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findAllByRole('option')).toHaveLength(4)
  })

  it('renders labels in Arabic when the layout is RTL', async () => {
    useUiStore.setState({ locale: 'ar' })
    const { es } = await setup()
    expect(screen.getByRole('listbox', { name: 'المحادثات' })).toBeInTheDocument()
    expect(within(option('محمد العتيبي')).getByText('تحتاج موظفًا')).toBeInTheDocument()
    expect(within(option('Sara Alqahtani')).getByLabelText('2 غير مقروءة')).toBeInTheDocument()
    act(() => es.emit(startEvt(101, 'c-3', 'm-50')))
    expect(await within(option('John Carter')).findByText('الذكاء الاصطناعي يكتب…')).toBeInTheDocument()
  })
})
