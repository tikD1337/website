# Bugs and review notes

Recorded on 2026-09-18. The project is still in development.

## Status: all seven bugs fixed on 2026-09-18

Every defect below (1-7) has been fixed, covered by regression tests, and
verified in the browser. The suite went from 825 to 862 passing tests;
`tsc --noEmit` and `vite build` both pass. Item 8 is a standing
architectural constraint rather than a defect — the position taken is
recorded in `CLAUDE.md` ("Про «защиту от консоли браузера»") and
summarised at the end of this file.

Fix summary:

| # | Fix | Tests |
|---|---|---|
| 1 | `claimTicket` starts a new session log, terminal, windows and dialogue when moving to a different incident; returning to your own ticket changes nothing | `src/store/useGame.test.ts` — «изоляция инцидентов» |
| 2 | The ask button stays enabled and reads "Попросить ещё раз"; the core already allowed repeats | `src/e2e-share.test.ts` — «просьба, о которой попросили рано» |
| 3 | Resolving a ticket clears `viewing`; so does claiming one | `src/store/useGame.test.ts` — «просмотр прошлого прохождения» |
| 4 | Clicking your own assigned ticket only switches the view — status is preserved | `src/store/useGame.test.ts` — «повторное открытие своего тикета…» |
| 5 | `validateProgress` takes `unknown` and never throws; `db.ts` also guards inside the `onsuccess` callback | `src/core/progress/validate.test.ts`, `src/core/progress/db.test.ts` |
| 6 | `hideTicket` preserves the active assignment unless the hidden ticket is the active one | `src/store/useGame.test.ts` — «скрытие тикета» |
| 7 | `fillQueue` checks device availability per insertion and keeps conflicting scenarios in the pool | `src/core/tickets/generate.test.ts` — «одна открытая поломка на машину» |

The original review text follows unchanged.

## Verified bugs in current behavior

### 1. Incident session state leaks into subsequent tickets

Priority: High.

Location: `src/store/useGame.ts` (`claimTicket`, `resolveTicket`).

The session log is not reset or isolated when moving from one incident to another. Confirmation, identity, investigation flags, command evidence, and dangerous actions can affect later tickets.

Reproduction:
1. Claim the APIPA ticket, verify the requester, repair the network, and obtain confirmation.
2. Resolve it and claim the next ticket.
3. Resolve the second ticket without talking to its requester.

Observed: the second ticket receives 10/10 for communication using the previous ticket's flags. Prior mistakes can also penalize subsequent tickets.

Expected: grading and dialogue evidence must belong to the incident being evaluated. Shared world state may persist, but incident evidence must be isolated.

### 2. An early relogin request blocks the intended folder-access solution

Priority: High.

Location: `src/ui/TicketView.tsx:199`, `src/scenarios/identity-share-access.ts`.

Reproduction:
1. Claim the folder-access ticket.
2. Ask the requester to sign out and sign back in before adding the missing group.
3. Add the requester to `GRP-Finance-Reports`.

Observed: directory membership changes, but the session token still lacks the group. The request button is disabled as "Already requested", so the user cannot repeat the relogin through the UI.

Expected: repeatable actions such as signing in again must remain available when needed. An unsuccessful early attempt must not permanently block the intended solution.

### 3. A historical scorecard overrides the result of a newly resolved ticket

Priority: Medium.

Location: `src/ui/ScorecardView.tsx:85`, `src/store/useGame.ts` (`viewRecord`, `resolveTicket`).

Reproduction:
1. Open a completed attempt from History.
2. Navigate to Queue using the sidebar, without using "Back to history".
3. Claim and resolve another ticket.

Observed: `viewing` still references the historical record, and the scorecard screen displays that old result instead of the newly calculated result.

Expected: resolving a ticket must display its own scorecard and clear the historical-view override.

### 4. Reopening an assigned ticket from Queue resets its workflow status

Priority: Medium.

Location: `src/ui/QueueView.tsx:72`, `src/core/tickets/queue.ts:39`.

Reproduction:
1. Claim a ticket and set its status to "Waiting for user" (`pending-user`).
2. Navigate to Queue.
3. Click the same ticket to reopen it.

Observed: the row calls `claimTicket()` again, and `claim()` changes the status to `assigned`.

Expected: opening an already assigned ticket must preserve its workflow status.

### 5. Malformed persisted progress can leave loading pending indefinitely

Priority: Medium.

Location: `src/core/progress/validate.ts:20`, `src/core/progress/db.ts:65`.

Reproduction: simulate an IndexedDB read returning `{ version: 1 }`, with no `records` array.

Observed: validation throws `progress.records is not iterable`. The exception occurs inside the asynchronous request success callback, outside the surrounding synchronous `try/catch`. The load promise neither resolves nor rejects, so history can remain in its loading state. A null record also throws during validation.

Expected: validate unknown persisted data defensively and guarantee that loading settles with a safe fallback for malformed records.

Verification: reproduced with an IndexedDB callback stub, not a browser storage test.

## Verified defects in functionality intended for further development

### 6. Hiding another ticket clears the active assignment

Priority: Medium; currently no hide button in Queue.

Location: `src/store/useGame.ts:937` (`hideTicket`).

Reproduction: claim one ticket, then call `hideTicket()` for a different queued ticket.

Observed: the reconstructed queue has `assigned: null`, even though the active ticket was not hidden.

Expected: preserve the active assignment when hiding an unrelated ticket.

### 7. Queue generation does not enforce one open incident per device

Priority: Medium; latent with the current library of scenarios on different devices.

Location: `src/core/tickets/generate.ts:65-83`.

Reproduction: provide two scenarios targeting the same device and fill an initially empty queue with room for both.

Observed: both tickets enter the queue. The busy-device set is built before insertion, is not updated while inserting, and does not prevent blocked entries from being consumed later in the loop.

Expected: check device availability for each insertion, update the busy-device set, and retain conflicting scenarios in the pool.

## Security concern requested by the owner — not yet audited

### 8. Access through the browser console and protection against theft

Status: Open question / security review requirement, not a verified vulnerability.

Owner concern: prevent people from accessing functions through the browser console to steal data or functionality.

Architectural constraints:
- JavaScript, assets, and data delivered to a browser are available to the person controlling that browser. Frontend code cannot reliably prevent that person from inspecting it or invoking client-side behavior.
- Hiding buttons, avoiding global exports, minifying code, or blocking developer-tool shortcuts does not establish an authorization boundary.
- Secrets and restricted content must remain on a trusted server. Sensitive operations require server-side authentication, authorization, and input validation on every request.
- If the product remains entirely client-side, local game state and scores can be modified by the user. Any future trusted leaderboard, entitlement, or shared record must be validated by a trusted backend.
- Whether an actual theft or unauthorized-access risk exists depends on what must be protected: API credentials, private data, paid content, backend operations, or source code. This has not been established or tested in this review.

Future review scope:
- Confirm what protection is required and identify the trusted boundaries.
- Inspect browser-delivered bundles, source maps, configuration, and network responses for secrets or restricted data.
- Review access controls for any backend or model proxy, including exposure and credential handling.
- Verify that privileged operations cannot be authorized solely by frontend state or UI restrictions.

No console-blocking code or security changes have been implemented.

## Verification and limitations

_(As recorded during the original review, before the fixes above.)_

- Existing test suite: 825/825 tests passed across 48 files.
- TypeScript check: passed.
- Production build: passed.
- The bugs above were reproduced through targeted code-level probes; no regression tests were added to the repository.
- Visual browser verification was not completed: the browser MCP entry point reported that no browser was available in that attempt.
- The owner notes that browser access is available through MCP. Use the available browser MCP for a future UI verification pass; this follow-up has not been started.
- These results are a bounded review, not a guarantee that all bugs or security issues have been found.

---

## Post-fix verification (2026-09-18)

- Test suite: 862/862 passing across 49 files (37 regression tests added
  for the defects above).
- TypeScript check and production build: both pass.
- Browser verification completed via MCP, which the original review could
  not reach. Confirmed live: identity verification no longer carries into
  the next incident; the remote desktop reconnects to the new machine with
  a clean terminal and no windows from the previous one; a ticket left in
  "Ждём пользователя" keeps that status when reopened from Queue; and a
  ticket resolved after browsing History shows its own scorecard. No errors
  or warnings in the console.

### On item 8

No console-blocking code was added, and none should be. Anything delivered
to a browser belongs to whoever controls that browser; minification,
avoiding global exports and blocking devtools shortcuts are not an
authorization boundary and only create the appearance of one. While the
trainer is entirely client-side, local scores are editable from the
console — that is the accepted cost of working offline. The one real
secret, the model API key, is already outside that boundary: it lives in
`config/llm.local.json` (git-ignored), is injected by the dev-server proxy
as a header, and never enters the bundle. If a trusted leaderboard or paid
content is ever wanted, it requires a server that re-validates every
request — not frontend hardening.
