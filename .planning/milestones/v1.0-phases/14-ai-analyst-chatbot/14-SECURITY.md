# Phase 14 — AI 애널리스트 챗봇 — Security Verification

**Audited:** 2026-07-03
**Auditor:** gsd-security-auditor
**Plans covered:** 14-01 ~ 14-11 (11 plans, threat_model blocks from each PLAN.md)
**ASVS Level:** default
**Threats:** 27 total — 25 mitigate, 2 accept — **27/27 CLOSED**

This document verifies that threat mitigations declared in each plan's `<threat_model>` block are
actually present in the implemented code (or, for `accept` dispositions, are formally logged here).
Implementation files were read-only during this audit; no code was changed.

---

## Threat Verification

| Threat ID | Category | Component | Disposition | Status | Evidence |
|-----------|----------|-----------|--------------|--------|----------|
| T-14-01 | IDOR (Info Disclosure/Tampering) | conversations/messages RLS | mitigate | CLOSED | `supabase/migrations/20260702170000_chat_conversations.sql:69-81` — 8 policies, all `TO authenticated`, `auth.uid() = user_id` (conversations) / `EXISTS (SELECT 1 FROM conversations ...)` (messages) |
| T-14-13 | Elevation (default-deny) | RLS role 명시 | mitigate | CLOSED | same migration — all 8 policies `TO authenticated`, zero `TO anon` policies (verified via grep) |
| T-14-04a | DoS (비용) | chatEnabled kill-switch | mitigate | CLOSED | `server/src/config.ts:38,87` — `chatEnabled: (process.env.CHAT_DISABLED ?? "false") !== "true"` |
| T-14-14 | 설정 오류 | chatWebSearchModel 분리 | mitigate | CLOSED | `server/src/config.ts:41,92` — `chatWebSearchModel` is an independent config key (env `CHAT_WEBSEARCH_MODEL` override), separate from lead/specialist model keys |
| T-14-02 | Spoofing | requireAuth | mitigate | CLOSED | `server/src/middleware/require-auth.ts:23-33` — `supabase.auth.getUser(token)`, 401 `UNAUTHENTICATED` on missing/invalid token, executes before any `res.writeHead` (comment at line 11-12 documents SSE-header-before-auth ordering) |
| T-14-01a | IDOR | assertConversationOwner | mitigate | CLOSED | `server/src/services/chat-history.ts:71-90,156,181-186` — all reads/writes `.eq("user_id", userId)`; mismatched/missing conversation → 404 `CONVERSATION_NOT_FOUND` (existence not leaked) |
| T-14-05a | 입력 검증 | chat zod 스키마 | mitigate | CLOSED | `server/src/schemas/chat.ts` — `ChatPostBody.message` `min(1).max(1000)`, `conversationId` `z.string().uuid().optional()`, `stockCode` `/^\d{6}$/.optional()` |
| T-14-03 | 프롬프트 인젝션 | LEAD_PROMPT + 전문가 프롬프트 | mitigate | CLOSED | `server/src/services/chat-prompts.ts` — `LEAD_PROMPT` "[프롬프트 인젝션 방어]" section: role fixed as "상한가 분석 애널리스트 팀장", explicit instruction to ignore user requests to change system rules |
| T-14-05 | 환각 수치/뉴스 | 프롬프트 verbatim 규칙 | mitigate | CLOSED | `server/src/services/chat-prompts.ts` — "[환각 금지 — 수치·뉴스 verbatim]" section + `SPECIALIST_COMMON` tail ("데이터에 없는 수치·사실은 지어내지 말고…") + "[매매지시 금지]" section in all 6 prompts. Note: literal disclaimer sentence was removed in 14-11 by explicit user decision (checkpoint, 2026-07-02) — the hallucination/trade-instruction safety rules this threat's mitigation plan targets remain fully intact; disclaimer removal does not reopen this threat (see Notes). |
| T-14-04b | DoS (비용) | 전문가 max_tokens + web_search | mitigate | CLOSED | `server/src/services/specialists/{quote,theme,news,limitup}-specialist.ts` — `max_tokens: 700` each; `websearch-specialist.ts:26-31` — `type: "web_search_20250305"`, `max_uses: 3`, `country: "KR"` |
| T-14-03b | tool 인자 오염 | runSpecialist input | mitigate | CLOSED | `server/src/services/chat-orchestrator.ts:41,143` — `CODE_REQUIRED_SKIP` guard: quote/limitup skip consult call entirely when `!input.code` |
| T-14-04c | DoS (비용) | 미지 tool graceful | **accept** | CLOSED (documented) | `server/src/services/chat-orchestrator.ts:44` — `UNKNOWN_TOOL` text returned instead of throw. Formally logged in [Accepted Risks](#accepted-risks) below (risk was already bounded by `chatMaxToolRounds` at plan time; this document is the missing accepted-risk log entry) |
| T-14-04 | DoS (비용) | chatEnabled + rate-limit + MAX_TOOL_ROUNDS | mitigate | CLOSED | `server/src/routes/chat.ts:32,61-64` — route-level `chatRateLimit` (express-rate-limit) + `CHAT_DISABLED` 503 pre-header-write + `server/src/services/chat-service.ts:570` `"[chat] usage"` token logging |
| T-14-07 | SSE 버퍼/스머글링 | SSE 헤더 | mitigate | CLOSED | `server/src/routes/chat.ts:74-84` — `X-Accel-Buffering: no` + 15s keepalive; `server/src/app.ts:61-65` — `helmet()` + `cors(corsOptions())` applied ahead of chat route mount (`app.ts:79`) |
| T-14-06 | Info Disclosure (로그) | pino 로깅 | mitigate | CLOSED | `server/src/logger.ts:14-22` — pino `redact` config (Anthropic key etc.); `server/src/routes/chat.ts:28` — errors delegated via `next(e)`, no `error.message` exposed to client; `chat-service.ts:562-570` usage log contains only `conversationId/model/inputTokens/outputTokens/toolRounds` — no message content logged |
| T-14-02c | Spoofing | streamChat Bearer | mitigate | CLOSED | `webapp/src/lib/chat-sse.ts:123,134` — `createClient().auth.getSession()` → `Authorization: Bearer ${session.access_token}`; token issuance/storage fully owned by Supabase SDK, not client-constructed |
| T-14-08 | SSE 파싱 견고성 | parseSSEStream | mitigate | CLOSED | `webapp/src/lib/chat-sse.ts:59-74` — buffer accumulation across chunks + `catch { /* ignore JSON parse errors */ }` around `JSON.parse(line.slice(6))` |
| T-14-02b | Spoofing (클라 게이트 우회) | ChatFab 로그인 게이트 | **accept** | CLOSED (documented) | `webapp/src/components/chat/chat-fab.tsx:35-49` — client gate is UX only (`useAuth().user` check); real enforcement is server `requireAuth()` (T-14-02). Formally logged in [Accepted Risks](#accepted-risks) below |
| T-14-09 | 스트리밍 abort 경합 | ChatSheet abortRef | mitigate | CLOSED | `webapp/src/components/chat/chat-sheet.tsx:131,144,146,251` — new send aborts previous `abortRef.current`; `closeChat` (sheet close, line 259) does not abort — comment at lines 18-19 documents the separation (server completes+persists after sheet close) |
| T-14-10 | XSS via 마크다운 | MessageAssistant | mitigate | CLOSED | `webapp/src/components/chat/message-assistant.tsx:10,24-25,126-131` — `ReactMarkdown` + `remarkGfm` only, no `rehype-raw`/`dangerouslySetInnerHTML` (raw HTML rendering disabled by default) |
| T-14-05c | 국내색상 역전 | MiniStockCard/MiniChart | mitigate | CLOSED | `webapp/src/components/chat/mini-stock-card.tsx:34-39` — `changeRate>0 → --up`(red)/`<0 → --down`(blue); `webapp/src/components/chat/mini-chart.tsx:33` — `getChartPalette` from `chart-colors.ts` (sRGB conversion, not raw oklch) |
| T-14-01b | IDOR | deleteConversation/getConversation | mitigate | CLOSED | `server/src/routes/chat.ts:137-159` — `GET/DELETE /conversations/:id` call `loadConversation`/`deleteConversation` which both call `assertConversationOwner` (chat-history.ts) under `requireAuth()` |
| T-14-11 | 실수 삭제 | DeleteConversationDialog | mitigate | CLOSED | `webapp/src/components/chat/delete-conversation-dialog.tsx:73-74` — `이 대화를 삭제할까요?` / `삭제한 대화는 되돌릴 수 없어요.` confirmation dialog before `deleteConversation()` call |
| T-14-02d | Spoofing | production 401 smoke | mitigate | CLOSED | Verified live in production (14-11-SUMMARY.md): unauthenticated `POST /api/chat` → `401 UNAUTHENTICATED`. Backed by same code path as T-14-02 (`require-auth.ts`) |
| T-14-04d | DoS (비용) | production 토큰 로깅 | mitigate | CLOSED | `server/src/services/chat-service.ts:562-570` `"[chat] usage"` log line (code); production Cloud Logging observation of this log line + `max_uses:3` recorded in 14-11-SUMMARY.md |
| T-14-12 | 배포 회귀 (웹서치) | web_search POC | mitigate | CLOSED | 14-11-SUMMARY.md records live POC: websearch specialist dispatched, 2 web citations received, `web_search_tool_result_error` count = 0 — console web_search access confirmed active, no fallback needed |
| T-14-06b | Info Disclosure | Vercel env newline | mitigate | CLOSED | 14-11-SUMMARY.md records live verification: `NEXT_PUBLIC_API_BASE_URL` = 63 chars, no trailing newline, confirmed at production deploy time |

**Result: 27/27 threats CLOSED (25 mitigate verified in code + production evidence, 2 accept formally logged below).**

---

## Accepted Risks

The following risks were deliberately **not mitigated in code** by design decision recorded in the
originating PLAN.md `<threat_model>` block. This section is the formal accepted-risk log referenced
by the verification table above.

### T-14-04c — Unknown tool name (DoS/cost, low severity)

- **Component:** `runSpecialist` dispatch (`server/src/services/chat-orchestrator.ts`)
- **Risk:** If the lead model (Sonnet) emits a `tool_use` block with a name that doesn't match any of
  the 5 registered specialist tools, the orchestrator does not throw — it returns an `UNKNOWN_TOOL`
  string result and lets the lead loop continue.
- **Why accepted rather than mitigated further:** The lead model can only choose from the tool
  definitions it was given (`SPECIALIST_TOOLS`), so an unknown tool name is not attacker-reachable
  from end-user input — it would only occur from a model/SDK version mismatch. The existing
  `chatMaxToolRounds` (server/src/config.ts) bounds the tool-use loop regardless, so an unknown-tool
  response cannot cause unbounded looping or cost. Throwing here would turn a benign edge case into a
  hard failure of an otherwise-working conversation.
- **Residual risk:** Negligible. Bounded by `chatMaxToolRounds`.

### T-14-02b — Client-side login gate is bypassable (Spoofing/UX)

- **Component:** `ChatFab` login gate (`webapp/src/components/chat/chat-fab.tsx`)
- **Risk:** The FAB's `useAuth().user` check is a client-side UX gate. A user could bypass it (e.g. by
  calling `fetch("/api/chat", ...)` directly from devtools) without ever seeing the "로그인이 필요해요"
  dialog.
- **Why accepted rather than mitigated further:** Client-side auth gates are inherently bypassable by
  design — the actual security boundary is server-side. The real enforcement point is
  `requireAuth()` (T-14-02, `server/src/middleware/require-auth.ts`), which validates the JWT via
  `supabase.auth.getUser()` and returns 401 before any SSE header is written. Every route under
  `/api/chat` requires this middleware. The client gate exists purely to give logged-out users a
  clear message instead of a raw 401, not as a security control.
- **Residual risk:** None from a data-access perspective — bypassing the client gate only reaches the
  same server-enforced 401. Confirmed live in production (T-14-02d, 14-11-SUMMARY.md).

---

## Unregistered Flags

None. All `## Threat Flags` sections found in 14-04, 14-05, 14-09, 14-10, and 14-11 SUMMARY.md
explicitly report "없음"/"None" and, where new attack surface was mentioned (e.g. `web_search`
external calls, `chat_orchestrator` dispatch), map cleanly back to threat IDs already present in the
threat register above (T-14-03, T-14-05, T-14-04b, T-14-03b, T-14-04c, T-14-10, T-14-05c, T-14-01b,
T-14-11, T-14-02d, T-14-04d, T-14-12, T-14-06b). 14-01, 14-02, 14-03, 14-06, 14-07, and 14-08
SUMMARY.md do not include a `## Threat Flags` section at all — treated as no new attack surface
reported, not a gap, since none of those plans' accomplishments describe unregistered network
endpoints, auth paths, or schema changes beyond what their own threat_model already covers.

---

## Notes on Post-Plan Deviations Affecting Threats

1. **Disclaimer text removed (14-11, user-directed).** The literal disclaimer sentence
   (`※ 본 답변은 투자 참고용이며 투자자문이 아닙니다.`) that plans 14-04/14-08/14-09 originally wired into
   `LEAD_PROMPT`, `CHAT_DISCLAIMER`, `message-assistant.tsx`, and `composer.tsx` was deleted per
   explicit user checkpoint decision on 2026-07-02 ("면책용 문구는 다 지워"). This does **not** reopen
   T-14-05: that threat's mitigation plan targets hallucination prevention (no fabricated
   numbers/news/URLs) and the no-trade-instruction rule, both of which remain fully present in
   `chat-prompts.ts` (verified above). The disclaimer was a secondary UX/compliance element, not the
   hallucination-prevention control itself. No new threat ID was opened for the disclaimer's removal;
   flagging here for traceability only — if legal/compliance requirements change, re-adding a
   disclaimer is a product decision, not a re-opened security threat.

2. **Model changed to claude-sonnet-5 across the board (14-11, user-directed).** Lead + all 5
   specialists (including websearch) now default to `claude-sonnet-5` instead of the original
   Sonnet-lead/Haiku-specialist split. This changes cost/latency characteristics but does not affect
   any threat mitigation verified above — `max_tokens` caps, `max_uses: 3` web_search cap, code
   guards, and prompt safety rules are all model-independent and remain intact in code.

3. **List endpoint envelope bugfix (14-11, Rule 1 auto-fix).** `GET /api/chat/conversations` was
   changed from `{ data: [...] }` to a bare array to match the codebase's existing list-endpoint
   convention and fix a silent history-loss bug. This is a correctness fix, not a security-relevant
   change — IDOR protection (T-14-01b) was unaffected since it lives in `assertConversationOwner`
   before the response is ever shaped.

---

*Generated by gsd-security-auditor. Implementation files were read-only during this audit.*
