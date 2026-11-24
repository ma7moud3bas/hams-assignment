# Hams.AI live conversation monitor

A supervisor screen for watching AI-handled conversations live and stepping in when the AI asks for a human. Built with React 19 and TypeScript (strict), using TanStack Query for server state, Zustand for live and UI state, and TanStack Virtual for the 5,000-message thread.

## Run it

Requires Node 22.22+, 24.15+ or 26+ (developed on Node 22.23). That is the minimum for the toolchain (Vite 8, Vitest 5, jsdom); the mock server on its own runs on Node 18.

```bash
npm install
npm start            # mock server on :4000 + Vite dev server on :5173
```

Open http://localhost:5173. To run the pieces separately: `npm run mock` and `npm run dev`. To point the app at another server: `VITE_API_URL=http://localhost:5000 npm run dev`.

| Command | What it checks |
| --- | --- |
| `npm test` | Unit and component tests (Vitest + Testing Library, about 1 s) |
| `npm run test:soak` | The real mock and the app's real data layer through at least 2 forced drops, then compares client state with the server (about 1 min) |
| `npm run e2e` | Playwright smoke tests in Chromium, against their own mock (:4100) and dev server (:5174) (about 1.5 min). Run `npx playwright install chromium` first. |
| `npm run typecheck` / `npm run lint` / `npm run build` | `tsc -b`, oxlint, production build |

`mock-server.mjs` is the assessment's file, unchanged.

## What it does

- **List (left).** Each conversation shows the customer, a status badge (AI handling, Needs human, Human handling, Closed), the last message and an unread count. The preview shows the AI reply as it streams ("AI is typing…" first). The list re-sorts by latest activity. It supports arrow, Home and End keys.
- **Thread (right).** Messages are virtualized. The AI reply streams in word by word with a caret. The view sticks to the bottom while you're there; if you scroll up, a "New messages ↓" button appears.
- **Connection badge.** Shows "Connected" or "Reconnecting…". Its tooltip shows the last applied event id.
- **Hand-off.**
  - A `transfer_to_human` tool call adds a "Transferred to a human · reason" row at the right place in the thread and marks the conversation "Needs human" straight away. The `status` event that follows confirms it, so a drop between the two doesn't leave the Take over button missing.
  - A banner with the reason and a **Take over** button appears.
  - After taking over, replies appear immediately ("Sending…"). If the server rejects one, it is removed and an error with **Retry** and **Dismiss** is shown.
- **Languages: English (LTR) and Arabic (RTL).** A language menu in the header switches the whole interface; the layout direction comes from the language, so choosing Arabic mirrors it. The first visit uses the browser's preferred language if it's supported, and the choice is remembered across reloads. Each message, name and reason also has `dir="auto"`, so Arabic text reads right-to-left in the English layout and English text left-to-right in the Arabic one.
  - **Adding a language** takes one file and one line. Write `src/i18n/locales/<code>.ts` typed as `Strings` (a missing key is a type error), then register it in `LOCALES` in `src/i18n/locales.ts` with its name and direction. The menu, the document's `lang` and `dir`, and the saved preference all follow from that table. Components read text through `useT()`.

## How server state and live state are split

The rule: **if the REST API can return it, it lives in the TanStack Query cache. If only this browser knows it, it lives in Zustand.**

| TanStack Query cache (server data) | Zustand (client-only state) |
| --- | --- |
| `['conversations']`: the list snapshot, including status, last message, unread and the streaming preview | `liveStore`: connection state, last applied event id, hand-off reasons and where they sit in the thread, the reply outbox, send errors |
| `['messages', id]`: each thread, including the reply that is still streaming | `uiStore`: selected conversation, interface language (saved in `localStorage`), "read up to" counts |

Live events update the query cache directly (`setQueryData`) rather than a separate overlay store. That gives each piece of server data exactly one copy, with one marker saying how up to date it is (below). This is what makes the snapshot + stream merge correct.

Tokens go into the cache too. That doesn't mean every message re-renders on every token:
- The thread is virtualized, so about 20 rows are in the DOM.
- A token replaces only its own message object.
- `MessageRow` is memoized on that object, so only the streaming row re-renders. A unit test counts renders, and a browser check confirmed only one row's DOM changes while a reply streams.
- The thread's item list (`buildThreadItems`) is still rebuilt on each token, which is O(n). For c-1 that measured about 0.1 ms per token, against 60–160 ms between tokens. Reusing item objects through a `WeakMap` measured no faster, so it stays simple.

Hand-off reasons are in Zustand because REST never returns `tool_call` events. The outbox is in Zustand because an unconfirmed reply is not server data yet. Keeping it out of the cache means a refetch can't wipe it.

## How resuming after a drop works

The code is in `src/stream/`.

1. **Each snapshot records how far it is up to date.** Every cache entry keeps the REST response's `lastEventId`. The reducers (`reducers.ts`) skip any event at or below that number, and move it forward with each event they apply. So applying an event twice changes nothing, whether the snapshot is behind the stream, ahead of it, or the stream replays.
2. **The stream opens from the list snapshot.** `sync.ts` fetches `/conversations`, then opens `GET /events?since=<its lastEventId>`.
3. **Checking each event** (`sequencer.ts`). Ids rise by exactly one, so each event is one of four cases:
   - `id = cursor + 1` → **apply** it and move the cursor.
   - In the 3-event window the mock re-sends on purpose → **duplicate**, ignored. The client keeps the raw frames of the last 3 events it applied, and those are exactly the ids every resume replays. If a replayed id arrives with a different frame, it came from a different server run, so it counts as a restart (below).
   - Higher than expected → **gap**: reconnect from the cursor rather than apply out of order.
   - Far below the cursor, or a replayed id that doesn't match → the mock **restarted** (its ids reset). The app throws away its state and reloads from fresh snapshots, so you don't have to reload the page. If the server isn't reachable yet, startup keeps retrying with backoff.
   - A frame that can't be parsed but whose SSE `id` is the next one is stepped over and logged, and every snapshot is refetched to cover whatever it changed. Ignoring it would make the next event a gap, and each reconnect would replay the same frame forever.
4. **Reconnecting** (`streamClient.ts`). On any error the client closes the `EventSource` straight away and reopens it with `since=<last applied id>`, waiting 0.5 s, 1 s, 2 s and so on up to 10 s. It never relies on the browser's own retry: that retry reuses the original URL, and the mock prefers that URL's old `?since=` over `Last-Event-ID`, so it would replay everything since page load.
5. **Snapshots that arrive mid-stream** (`eventBuffer.ts`, `queries/options.ts`). Opening a thread fetches its messages while tokens are still arriving. Every applied event is also kept in a ring buffer (the last 5,000). Each query function replays the buffered events newer than its snapshot's `lastEventId` before the result reaches the cache. No `await` sits between that replay and the cache write, so no stream event can slip in between and be lost.
   - `/conversations` doesn't include a reply that is still streaming. So when the list is refetched mid-reply, `seedDrafts` rebuilds that reply's preview from the buffered `message_start` and tokens, and only does so when the buffer reaches exactly the snapshot's `lastEventId`. Without this, the preview would go stale and the reply's `message_end` would trigger another refetch, which could itself land mid-reply. The very first snapshot has no buffer behind it, so a reply already streaming at page load still costs one refetch when it ends.
6. **Ordering rule.** The stream's starting point is never newer than any cached snapshot. After a restart it is opened before thread snapshots are refetched.

Tests that cover this:
- `sequencer.test.ts` and `streamClient.test.ts`: replay overlap, gaps, restart (including one detected by a mismatched replay), unreadable frames, closing the native retry, backoff.
- `reducers.test.ts`: ordering, the up-to-date marker, interleaved conversations.
- `sync.test.ts`:
  - A replayed token is never applied twice after a resume.
  - Tokens that arrive while a thread request is in flight are kept.
  - A snapshot that is ahead of the stream doesn't get tokens twice.
  - The hand-off event marks the conversation and records the reason, even before the `status` event arrives.
  - A list refetch that lands mid-reply keeps the preview and needs no further refetch.
  - StrictMode mount, unmount and mount opens exactly one stream.
  - A server restart triggers a full reload of state.
- The soak test and the e2e drop test then check the real thing against the real mock with `checkConsistency`. To show the soak test can fail, I added a bug on purpose (resume from `cursor + 5`). It failed with `c-4: missing m-5153`, an ordering error and an unread mismatch. Turning off only the duplicate check did *not* break it: each entry's up-to-date marker filters replays on its own. That's a second layer of protection, not a gap in the test.

## Hand-off details

- A hand-off row is placed right after the last message seen in that conversation before the `tool_call`. If none was seen yet, it goes right before the next one. Without either, it goes at the end. Event ids give exact ordering, so no timestamps are needed.
- **Take over** calls `POST /takeover` and shows the new status from the response at once. The `status` event confirms it shortly after.
- **Optimistic replies.** Each reply gets a `crypto.randomUUID()` `clientMessageId`.
  - It stays in the outbox ("Sending…", then "Sent") until the stream's `message` event with the same id arrives. The real message then takes its place, in the server's order. Keeping the same row key avoids a flicker.
  - A 500, a 409 or a network error removes it and shows the server's error. **Retry** resends with the same `clientMessageId`.
  - If the echo arrives before the POST resolves, there is still only one bubble.
- The composer is enabled only while the status is Human handling. Otherwise its placeholder says why.

## Testing

- **About 130 unit and component tests**, written test-first:
  - Pure stream logic: sequencer, buffer, reducers, consistency checker.
  - The stream client, using a fake `EventSource`.
  - The sync layer, using a real `QueryClient`.
  - Stores.
  - Components: list, thread, hand-off and send flow, virtualized list render counts, language menu, and the same flows in Arabic.
  - Every language has every English key and translates every string; Arabic is in Arabic script. Saved preferences migrate and fall back safely.
- **Soak test.** The real mock, the real `eventsource` client in Node, and the same `createRuntime` the browser uses. It covers all 8 threads through 2 or more drops, and also checks the list's status, unread count and last message.
- **Playwright** (5 tests):
  - The 5,000-message thread stays virtualized (fewer than 100 DOM rows) and can scroll to message 0.
  - Two real drops, then the cache is compared with the server.
  - A forced 500 rolls back, then Retry delivers the reply.
  - A live hand-off shows its reason.
  - Switching to Arabic gives the mirrored RTL interface, and it survives a reload.

## Skipped and trade-offs

- **Hand-offs from before the page loaded have no reason.** REST doesn't return tool calls, so c-7's initial hand-off shows "Reason not available — the hand-off happened before this session started."
- **Unread counting.** There is no mark-read endpoint, so the server's unread only grows. The client remembers the count you last saw for each conversation and shows the difference. These markers are not saved across reloads and are cleared on a restart, because they only make sense for the server run they came from. A marker above the server's count is treated as left over from an earlier run.
- **Restart detection has a small blind spot.** The replay check needs the replayed ids to be events this client applied. Right after the stream opens, the first replay window was covered by the snapshot, not the stream. A restart in that moment, when the new server is also already past the client's id, isn't noticed. Reload the page in that case.
- **An unreadable event is skipped, not applied.** Whatever it changed comes back through the refetch it triggers. The mock never sends one.
- **No message pagination.** c-1 loads all 5,000 messages (about 0.9 MB) at once. Rendering is virtualized; fetching is not.
- **No live demo link.** It would need the mock server hosted as well.
- **When the mock restarts**, a reply still in the outbox is dropped along with other live state.
- **Direction follows language**; there is no separate direction switch. Text from the server stays as sent: conversation content, hand-off reasons and the mock's English error messages (for example "Random failure, please retry"). Numbers use Western digits in both languages.

## With more time

- Paginated or windowed message loading (an API change), plus "load older" at the top.
- Server-side handling of a repeated `clientMessageId`, so Retry after a network timeout can't create a duplicate.
- Return hand-off reasons from REST (or put them in the event log by conversation), so a reload keeps them.
- A mark-read endpoint, so unread counts stay correct across devices.
- Storybook stories for the bubble, list and banner states, and visual regression tests in both directions.
- A screen-reader announcement for new hand-offs, and a better layout on small screens.

## Notes on the mock server

Each of these was checked against `mock-server.mjs`. Line numbers refer to that file.

1. **`?since=` overrides `Last-Event-ID`** (`:187`). The browser's `EventSource` retries with its original URL, so it would replay from the old `since`. Checked: `?since=<latest>` plus `Last-Event-ID: 5` replays about 12 events, not about 1,900. The app reconnects itself with a fresh `since`.
2. **A non-number `since` replays nothing, silently** (`:190–191`). `?since=abc` gives `NaN`, and the replay loop sends 0 events.
3. **After a restart, a `since` larger than the server's last id replays nothing** and gives no signal. The client spots ids going backwards instead.
4. **Unread only ever grows** (`:115`). There is no way to mark a conversation read.
5. **`events` is never trimmed** (`:63`), so memory grows for as long as the mock runs. `/messages` has no pagination.
6. **Taking over mid-reply doesn't stop the AI.** `streamAiReply` checks the status only before it starts (`:85`), so tokens keep arriving after a human has taken over. The app shows them, because that's what the server recorded.
7. **`tool_call` events have no timestamp**, and REST never returns past hand-off reasons.
8. **`/takeover` also works when the status is `ai`** (`:224`). The UI only offers it for Needs human, as the brief describes.

## Project layout

```
src/api/        types, REST client, SSE event parser
src/stream/     sequencer, event buffer, reducers, stream client, sync, consistency checker
src/store/      liveStore (connection, hand-offs, outbox), uiStore (selection, language, read counts)
src/queries/    query options with the rebase step, take-over and send mutations
src/i18n/       locale table (name, direction), English and Arabic strings, useT() hook
src/features/   conversations/, thread/, shell/ (badge, language menu)
soak/           soak test against the real mock
e2e/            Playwright tests
```
