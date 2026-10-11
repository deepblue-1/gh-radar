---
phase: 30-kb-ip-mac
reviewed: 2026-10-11T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - packages/shared/src/order-endpoint.ts
  - packages/shared/src/admin.ts
  - packages/shared/src/index.ts
  - relay/src/admin/admin-api.ts
  - relay/src/admin/dispatcher.ts
  - relay/src/admin/planner.ts
  - server/src/routes/admin.ts
  - server/src/schemas/admin.ts
  - server/src/services/relay-admin-client.ts
  - webapp/src/components/admin/account-editor.tsx
  - webapp/src/components/admin/user-sheet.tsx
  - webapp/src/components/admin/users-client.tsx
findings:
  critical: 0
  warning: 4
  info: 6
  total: 10
status: issues_found
---

# Phase 30: Code Review Report

**Reviewed:** 2026-10-11
**Depth:** standard
**Files Reviewed:** 12 source files. The listed test files were read for context only.
**Status:** issues_found

## Summary

I reviewed the phase-30 diff (`901861e3..HEAD`). It covers the shared IP/MAC normalize/format/validate/summarize helpers, the relay op 5 re-read and re-plan (R3-01), copying another user's IP/MAC into a newly added shared account (R3-02), the PUT override and the `GET /order-endpoints` read, the Express overview join and PUT passthrough, and the webapp card edit mode. `tsc --noEmit` passes for shared, relay, server and webapp.

The core write path looks correct:
- The override only touches active rows of the target account.
- `sameValues` normalizes only the intent side and falls back to the raw text on failure, so the code 13 path still works.
- The re-read fails closed: no 44 is sent when op 5 fails.
- The re-plan uses the fresh `usersRev`.
- Values stay out of audit lines and logs.
- `withServerEndpoint` priority is intent > own 87 > other user's 87 > empty.

I found no blockers. The warnings are about robustness of the overview read path and two UI state leaks in the edit card.

## Warnings

### WR-01: `GET /api/admin/users` now blocks on the relay for up to `RELAY_ADMIN_TIMEOUT_MS` (15 s)

**File:** `server/src/routes/admin.ts:190-215` (`fetchOrderEndpoints`, `Promise.all`)
**Issue:** The overview used to need only the RPC. It now waits on `relay.orderEndpoints()` through the shared axios instance, whose timeout is 15 s. That value was sized for write requests: relay deadline 10 s plus margin. If the relay VM is unreachable (Cloud Run VPC egress to a stopped VM, or a silently dropped SYN), every admin overview load stalls about 15 s before falling back to "확인 전". The comment promises the overview stays 200, and it does, but the latency regression is large. The read is a pure memory read on the relay, so it should either answer quickly or be abandoned.
**Fix:** Give this read its own short timeout, e.g. let `request()` accept a per-call timeout:
```ts
// relay-admin-client.ts
async function request<T>(method, path, adminEmail, body?, opts?: { timeoutMs?: number }) {
  ... http.request({ method, url: path, data: body, timeout: opts?.timeoutMs ?? undefined, ... })
}
orderEndpoints: (adminEmail) =>
  request<AdminOrderEndpointsRaw>("GET", "/internal/admin/order-endpoints", adminEmail, undefined, { timeoutMs: 2_000 }),
```

### WR-02: The shape check in `fetchOrderEndpoints` is shallow, so a malformed row turns the overview into a 500

**File:** `server/src/routes/admin.ts:358-359`; consumed at `packages/shared/src/admin.ts:686-695` (`indexOrderEndpoints`)
**Issue:** The doc says relay "모양 위반은 null(전 서버 「확인 전」) — 개요는 200 유지". However, only the top-level `servers` is checked (object, not array). Some payloads break that promise:
- `{ servers: { KB120: null } }` or `{ servers: { KB120: {} } }`: `for (const r of rows)` throws `TypeError: rows is not iterable`.
- A row without `accountNo`: `normalizeAccountNo(undefined)` throws on `.length`.

That throw happens inside `deriveAdminUsersOverview`, after the `try`-wrapped fetch, so the whole admin user list becomes a 500. This can happen during version skew between relay and server, or with a partial or compromised relay response.
**Fix:** Validate per server and per row, and drop anything malformed. For example, in `fetchOrderEndpoints`:
```ts
const out: AdminOrderEndpointsRaw["servers"] = {};
for (const [k, rows] of Object.entries(servers)) {
  if (!Array.isArray(rows)) continue;
  out[k] = rows.filter((r): r is AdminOrderEndpointRow =>
    r != null && typeof r.dmaUserId === "string" && typeof r.accountNo === "string" &&
    typeof r.orderIp === "string" && typeof r.orderMac === "string");
}
return { servers: out };
```
Alternatively, parse the response with a small zod schema and return null when parsing fails.

### WR-03: A server toggle during an in-flight edit save persists the not-yet-confirmed draft name

**File:** `webapp/src/components/admin/account-editor.tsx:620-626` (toggle body); edit card at `:733-912`
**Issue:** The toggle PUT uses `name: editSave.value?.account.name ?? account.name`. `useFieldSave.run()` sets `value` synchronously when the request starts (`retain` defaults to true), not when it succeeds. The server checkboxes, the order-server control and "제거" are not disabled while the card is editing or saving. So if an admin toggles a server while the edit save is still in flight:
1. The toggle PUT writes the new name to the DB intent and 87 (op 3).
2. If the edit PUT then fails at the HTTP level (502, 409 `NO_DMA_USER`, network error), `editSave.value` is reset to `undefined`, the card shows the error and keeps edit mode open, but the name change has already been committed by the toggle.

The block comment (line 54) says the new name should be carried only "이름 저장 성공 뒤 재조회 전", which the code does not enforce.
**Fix:** Carry the edited name only after the edit save has succeeded. Either:
- gate on state: `name: editSave.state !== "saving" && editSave.value ? editSave.value.account.name : account.name`, or
- disable the toggles, the order-server control and "제거" while `editSaving` (simplest, and consistent with the inputs being `readOnly` during save).

### WR-04: Failures from an edit save disappear from `BusyLines` for good, even after the edit card closes

**File:** `webapp/src/components/admin/account-editor.tsx:1336-1341` (`if (chip?.source === "edit") continue;`); `cancelEdit` / `clearEditResult` at `:442-446`
**Issue:** Chips that come from an edit save are tagged `source: "edit"` and skipped in `BusyLines`, because the card's result lines already show the message. But the result lines are cleared on "취소", on the next "편집" open, and on any input change. The overlay chip, however, stays tagged `"edit"` until some later write replaces that slot.

So after a partial failure (for example `KB121 실패: <gh-trade code 13 문구>`), if the admin presses "취소", the server message is no longer visible anywhere on the page. It survives only as the chip `title` tooltip, which cannot be reached on touch devices, and the mobile admin is a supported layout. The non-edit paths always keep the message in `BusyLines`.
**Fix:** Suppress only while that card's edit is open. Options:
- Drop the `source` tag in the overlay when the edit closes (`onEditEnd` → rewrite that account's overlay chips without `source`).
- Pass `editingKey` into the `shownChips` loop and skip only `chip.source === "edit" && editingKey === k`.

## Info

### IN-01: The save button can be disabled with no visible reason when the initial 87 value fails web validation

**File:** `webapp/src/components/admin/account-editor.tsx:422-427`
**Issue:** `validation` runs on the draft IP/MAC even when the admin only changed the name. `shownInvalid` is shown only when `endpointEdited`. Some initial values from the summary fail `validateOrderEndpointInput`:
- a half-set pair (`stateOf` returns `"set"` if either field is non-empty),
- a legacy value that cannot be normalized.

In that case `canSave` is false for a name-only edit, and no error line explains why. gh-trade's pair and normalize rules make this unlikely, but nothing here enforces it.
**Fix:** For the validity gate, compute `endpointValid` only when `endpointEdited || mismatched`, or show the error line whenever validation fails.

### IN-02: The shared-holder note approximates gh-trade's propagation set

**File:** `packages/shared/src/admin.ts:869-887` (`findSharedAccountHolders`)
**Issue:** `theirs` is built from active servers plus `serverOnlyOn`, so it is off in both directions:
- It excludes the other user's `removing` servers where the account is still in 87. gh-trade will propagate to those, but the note does not list them.
- It includes active rows that are still pending and not yet in 87. gh-trade will not propagate to those, but the note lists them.

The note is advisory only. It should be documented as an approximation, or use the 87-reflected state (chip tone `ok`) plus removing-but-present servers.

### IN-03: R3-02 copies the first other user that has IP/MAC set and ignores other users that are explicitly unset

**File:** `relay/src/admin/planner.ts:117-125`
**Issue:** `otherByNo` skips other users' accounts where both fields are empty. In a legacy inconsistent server (user A unset, user B set, for the same account), the planner copies B's value. gh-trade code 7 or D-18 propagation then acts on that choice. The data cannot be consistent anyway in that case. Either document the tie-break, or skip the copy and log a warning when the other holders disagree with each other.

### IN-04: The overview ships KYOBO accounts' 87 IP/MAC to the browser

**File:** `relay/src/admin/admin-api.ts:670-688`; `packages/shared/src/admin.ts:759-767`
**Issue:** `GET /order-endpoints` returns every enabled server, KYOBO included. `orderEndpointsOf` fills `orderEndpoints` for every account with intent, regardless of broker. The webapp only uses this for KB. These values identify user PCs, so data that is never rendered should not leave the server.
**Fix:** In the relay, skip servers whose `brokerOfServerKey(row.key) !== "KB"`, or return `{}` from `orderEndpointsOf` when `d.broker !== "KB"`.

### IN-05: The R3-01 re-read uses the request deadline before any op is sent

**File:** `relay/src/admin/dispatcher.ts:309-321`
**Issue:** The op 5 round-trip, up to `ADMIN_COMMAND_TIMEOUT_MS` (5 s), now comes before op 1 or op 3 within the 10 s `deadlineAt`. A slow 87 makes it more likely that the HTTP answer is `timeout` while the background run still finishes the ops. The result is correct, because a retry is idempotent through `sameValues`, but the UI will show "응답 없음" more often for writes that later succeed. Consider documenting this in the deadline budget comment.

### IN-06: When the state is "확인 전" (unknown), there is no way to express "clear to 미설정"

**File:** `webapp/src/components/admin/account-editor.tsx:429-436`, `:309-334`
**Issue:** For the `unknown` state the initial values are `""`/`""`. Leaving both fields empty therefore counts as "no change", and no `orderEndpoint` is sent. If the 87 value is actually set but unknown at the time (for example the relay restarted, or the overview's relay read failed), the admin cannot clear it until the value becomes known. This is acceptable as a fail-safe, but worth noting in the UI-SPEC.

---

_Reviewed: 2026-10-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
