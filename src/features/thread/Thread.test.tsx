import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../../api/client'
import type { Message, Status } from '../../api/types'
import { FakeEventSource } from '../../test/fakeEventSource'
import { makeConversation, makeMessage, msgEvt, statusEvt, toolEvt } from '../../test/fixtures'
import { createTestApi, createTestRuntime, deferred, renderWithRuntime, stubLayout } from '../../test/testRuntime'
import { useUiStore } from '../../store/uiStore'
import { Thread } from './Thread'

async function setup(status: Status) {
  FakeEventSource.reset()
  const api = createTestApi([makeConversation({ id: 'c-3', customer: 'John Carter', status })])
  api.getMessages.mockResolvedValue({
    lastEventId: 100,
    messages: [makeMessage({ id: 'm-1', conversationId: 'c-3', text: 'Can I speak to someone about a refund?' })],
  })
  const rt = createTestRuntime(api)
  await rt.sync.start()
  const es = FakeEventSource.latest()
  es.open()
  renderWithRuntime(<Thread conversationId="c-3" />, rt)
  await screen.findByText('Can I speak to someone about a refund?')
  return { rt, es, api }
}

const log = () => screen.getByRole('log', { name: 'Messages' })
const composer = () => screen.getByRole('textbox', { name: 'Reply' })

beforeEach(() => stubLayout())
afterEach(() => vi.restoreAllMocks())

describe('Thread hand-off and replies', () => {
  it('shows the hand-off reason and enables Take over only when Needs human', async () => {
    const { es } = await setup('ai')
    expect(screen.queryByRole('button', { name: 'Take over' })).toBeNull()
    expect(composer()).toBeDisabled()
    expect(composer()).toHaveAttribute('placeholder', 'The AI is handling this conversation')

    act(() => {
      es.emit(toolEvt(101, 'c-3', 'Refund is above the AI limit (500 SAR)'))
      es.emit(statusEvt(102, 'c-3', 'needs_human'))
    })
    expect(await screen.findByRole('button', { name: 'Take over' })).toBeEnabled()
    expect(composer()).toHaveAttribute('placeholder', 'Take over to reply')
    const banner = screen.getByRole('region', { name: 'Hand-off' })
    expect(banner).toHaveTextContent('Refund is above the AI limit (500 SAR)')
    expect(within(log()).getByText(/Transferred to a human/)).toBeInTheDocument()
  })

  it('explains when the hand-off reason is unknown', async () => {
    await setup('needs_human')
    expect(screen.getByRole('region', { name: 'Hand-off' })).toHaveTextContent(
      'Reason not available — the hand-off happened before this session started.',
    )
  })

  it('take over calls the API and enables the composer', async () => {
    const { api } = await setup('needs_human')
    await userEvent.click(screen.getByRole('button', { name: 'Take over' }))
    expect(api.takeover).toHaveBeenCalledWith('c-3')
    await waitFor(() => expect(composer()).toBeEnabled())
    expect(screen.queryByRole('button', { name: 'Take over' })).toBeNull()
  })

  it('shows a sent reply immediately', async () => {
    const { api } = await setup('human')
    api.sendMessage.mockReturnValueOnce(deferred<{ message: Message }>().promise)
    await userEvent.type(composer(), 'مرحبا hello{Enter}')
    const bubble = within(log()).getByText('مرحبا hello').closest('.bubble')!
    expect(bubble).toHaveTextContent('Sending…')
    expect(composer()).toHaveValue('')
    expect(api.sendMessage).toHaveBeenCalledWith('c-3', { text: 'مرحبا hello', clientMessageId: expect.any(String) })
  })

  it('rolls back and shows the error when the server rejects', async () => {
    const { api } = await setup('human')
    const post = deferred<{ message: Message }>()
    api.sendMessage.mockReturnValueOnce(post.promise)
    await userEvent.type(composer(), 'مرحبا hello{Enter}')
    expect(within(log()).getByText('مرحبا hello')).toBeInTheDocument()

    await act(async () => post.reject(new ApiError(500, 'Random failure, please retry')))
    await waitFor(() => expect(within(log()).queryByText('مرحبا hello')).toBeNull())
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Random failure, please retry')
    expect(alert).toHaveTextContent('مرحبا hello')

    const firstId = api.sendMessage.mock.calls[0]![1].clientMessageId
    api.sendMessage.mockReturnValueOnce(deferred<{ message: Message }>().promise)
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(api.sendMessage).toHaveBeenCalledTimes(2)
    expect(api.sendMessage.mock.calls[1]![1]).toEqual({ text: 'مرحبا hello', clientMessageId: firstId })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(within(log()).getByText('مرحبا hello')).toBeInTheDocument()
  })

  it('echo before 201 shows exactly one bubble', async () => {
    const { api, es } = await setup('human')
    const post = deferred<{ message: Message }>()
    api.sendMessage.mockReturnValueOnce(post.promise)
    await userEvent.type(composer(), 'On it{Enter}')
    const clientMessageId = api.sendMessage.mock.calls[0]![1].clientMessageId
    const echoed = makeMessage({ id: 'm-9', conversationId: 'c-3', role: 'human', text: 'On it', clientMessageId })

    act(() => es.emit(msgEvt(101, 'c-3', echoed)))
    await waitFor(() => expect(within(log()).getByText('On it').closest('.bubble')).not.toHaveTextContent('Sending…'))
    expect(within(log()).getAllByText('On it')).toHaveLength(1)

    await act(async () => post.resolve({ message: echoed }))
    expect(within(log()).getAllByText('On it')).toHaveLength(1)
  })

  it('shows the 409 error if the conversation was not taken over', async () => {
    const { api } = await setup('human')
    api.sendMessage.mockRejectedValueOnce(new ApiError(409, 'Take over the conversation first'))
    await userEvent.type(composer(), 'hello{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Take over the conversation first')
  })

  it('hand-off, take over and replies work in Arabic', async () => {
    useUiStore.setState({ locale: 'ar' })
    const { es, api } = await setup('ai')
    const reply = () => screen.getByRole('textbox', { name: 'الرد' })
    expect(reply()).toHaveAttribute('placeholder', 'الذكاء الاصطناعي يتولى هذه المحادثة')
    expect(within(screen.getByRole('log', { name: 'الرسائل' })).getByText('العميل')).toBeInTheDocument()

    act(() => {
      es.emit(toolEvt(101, 'c-3', 'Refund is above the AI limit (500 SAR)'))
      es.emit(statusEvt(102, 'c-3', 'needs_human'))
    })
    const banner = await screen.findByRole('region', { name: 'التحويل' })
    expect(banner).toHaveTextContent('طلب الذكاء الاصطناعي تدخّل موظف.')
    expect(screen.getByText(/حُوّلت إلى موظف/)).toBeInTheDocument()
    await userEvent.click(within(banner).getByRole('button', { name: 'تولَّ المحادثة' }))
    expect(api.takeover).toHaveBeenCalledWith('c-3')
    await waitFor(() => expect(reply()).toHaveAttribute('placeholder', 'اكتب ردًا…'))

    api.sendMessage.mockRejectedValueOnce(new ApiError(500, 'Random failure, please retry'))
    await userEvent.type(reply(), 'مرحبا{Enter}')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('تعذّر إرسال')
    expect(within(alert).getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'تجاهل' })).toBeInTheDocument()
  })
})
