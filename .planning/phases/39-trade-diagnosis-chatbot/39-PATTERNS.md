# Phase 39: 매매진단 챗봇 - Pattern Map

**Mapped:** 2026-11-05
**Files analyzed:** 27 (신규 13 · 수정 14)
**Analogs found:** 25 / 27

> 디코더 정정(RESEARCH): A3/B6 디코더는 `packages/shared/src/ticks/{framing,layouts,decode}.ts` 다. `krxTick.ts` 는 호가 단위 표 — 쓰지 않는다.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/src/services/specialists/diagnosis/diagnosis-specialist.ts` (신규) | service (LLM 전문가 · 다중 라운드) | request-response loop | `server/src/services/specialists/limitup-specialist.ts` + 팀장 루프 `server/src/services/chat-service.ts:380-500` | role-match (내부 도구 루프는 첫 사례 — 팀장 루프가 구조 analog) |
| `server/src/services/specialists/diagnosis/diagnosis-tools.ts` (신규) | utility (Tool 정의 + 디스패치) | request-response | `server/src/services/chat-orchestrator.ts:58-163` (`SPECIALIST_TOOLS` · `runSpecialist`) | exact |
| `server/src/services/specialists/diagnosis/diagnosis-order-log.ts` (신규) | service (RPC 1회 → 텍스트) | CRUD read / transform | `server/src/services/ticks.ts:200` `getTickOwn` + `packages/shared/src/strategy-event-text.ts:501` `orderLogLineText` | role-match |
| `server/src/services/specialists/diagnosis/diagnosis-market.ts` (신규) | service (바이트 → 디코드 → 창 → 한 줄) | file-I/O / transform | `workers/tick-convert/src/modes/promote.ts:131-136` + `workers/tick-convert/src/tickgw-live.ts:173` `fetchLiveDay` + `server/src/services/ticks.ts:134` `openTick` | role-match |
| `server/src/services/specialists/diagnosis/diagnosis-knowledge.ts` (신규) | config (프롬프트 상수) | — | `server/src/services/chat-prompts.ts` (`LIMITUP_SPECIALIST_PROMPT`) | exact |
| `server/src/services/tick-live-fetch.ts` (선택 · 신규) | service | streaming (offset 폴링) | `workers/tick-convert/src/tickgw-live.ts:173-` | exact (서버판 복제) |
| `server/src/services/chat-service.ts` (수정) | service (팀장 루프) | streaming SSE | 자기 자신 `:453-482` | — |
| `server/src/services/chat-orchestrator.ts` (수정) | utility | request-response | 자기 자신 `:134-163` | — |
| `server/src/services/chat-prompts.ts` (수정) | config | — | 자기 자신 | — |
| `server/src/config.ts` (수정) | config | — | 자기 자신 `:116-124` | — |
| `server/src/routes/chat.ts` (수정 — `app.locals` 의존성 전달) | route | request-response | 자기 자신 `:95-100` · `server/src/routes/ticks.ts:113-121,181` | — |
| `packages/shared/src/chat.ts` (수정) | model (타입 · 사전) | — | 자기 자신 `:16-33` | — |
| `packages/shared/src/strategy-event.ts` (수정 — `StateTransition = 9`) | model | — | 자기 자신 `:20` `STRATEGY_EVENT_KIND` | — |
| `packages/shared/src/strategy-event-labels.ts` (수정) | model (라벨 사전) | transform | 자기 자신 `:19-40` · `:226-238` · `AUTO_SELL_PAUSE_LABELS` | — |
| `packages/shared/src/strategy-event-text.ts` (수정 — case 9) | utility | transform | 자기 자신 `case 13/14` (`:160-185`) | — |
| `webapp/src/lib/order-log-feed.ts` (수정 — `'state'` 필터) | utility | transform | 자기 자신 `:38-62` · `:109-128` | — |
| 주문로그 탭 행 컴포넌트 (회색 kind 9 행) | component | — | 기존 시세 행(`isMarketStrategyEvent` 분기) | role-match |
| `webapp/src/components/chat/agent-progress.tsx` (수정) | component | — | 자기 자신 `:27-33` | — |
| `webapp/src/components/chat/message-assistant.tsx` (수정 — 내부 링크 같은 탭) | component | — | 자기 자신 `:68-77` | — |
| `supabase/migrations/2026110xxxxxxx_dma_diagnosis_for_user.sql` (신규) | migration (RPC) | CRUD read | `supabase/migrations/20261104100000_tick_own_for_user.sql` | exact |
| `supabase/tests/dma_diagnosis.test.sql` (신규) | test (pgTAP) | — | `supabase/tests/tick_own.test.sql` | exact |
| `server/src/services/specialists/__tests__/diagnosis.test.ts` (신규) | test | — | `server/src/services/specialists/__tests__/specialists.test.ts` | role-match |
| `server/src/services/specialists/__tests__/diagnosis-tools.test.ts` (신규) | test | — | 같은 위 + `server/src/services/__tests__/chat-orchestrator.test.ts` | role-match |
| `server/src/services/specialists/__tests__/diagnosis-market.test.ts` (신규) | test (골든) | — | `packages/shared/src/__fixtures__/ticks/cut1300-krx.ticks.zst` 사용 테스트 · `workers/tick-convert` 테스트 | partial |
| `server/src/services/__tests__/anthropic-mock.ts` (수정 — 다중 라운드 · thinking · refusal 팩토리) | test helper | — | 자기 자신 `:19-79` | — |
| 기존 테스트 갱신: `packages/shared/src/__tests__/strategy-event-{labels,text}.test.ts` · `webapp/src/lib/__tests__/order-log-feed.test.ts` · `webapp/src/components/chat/__tests__/message-render.test.tsx` · `server/src/services/__tests__/chat-service.test.ts` | test | — | 각 자기 자신 | — |
| gh-trade 노트 `../gh-trade/docs/inbox/from-gh-radar/YYMMDD-chatbot-kind9-mapping.md` | doc (외부 계약) | — | `scripts/trade-handoff.sh` + `docs/inbox/trade-handoff-template.md` · gh-trade `261027-launch-gate-contract.md`(43칸 선례) | exact |
| `docs/inbox/from-gh-trade/261105-chatbot-diagnosis-kind9.md` (`status: done`) | doc | — | `docs/inbox/from-gh-trade/README.md` | exact |

## Pattern Assignments

### `server/src/services/specialists/diagnosis/diagnosis-specialist.ts` (service, 다중 라운드 루프)

**Analog A:** `server/src/services/specialists/limitup-specialist.ts` — 가드 · 클라이언트 · 무로그 금지 · usage 로그 꼴.

Imports (lines 1-17) — 상대경로가 한 단계 더 깊어진다(`../../../config.js`):
```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadConfig } from "../../config.js";
import { logger } from "../../logger.js";
import { LIMITUP_SPECIALIST_PROMPT } from "../chat-prompts.js";
import { getChatAnthropicClient } from "./anthropic-client.js";
import { specialistText, SPECIALIST_UNAVAILABLE } from "./helpers.js";
```

가드 + 무로그 금지 + usage 로그 (lines 95-129):
```typescript
const cfg = loadConfig();
if (!cfg.anthropicApiKey) return SPECIALIST_UNAVAILABLE;
...
const text = specialistText(res);
if (!text) {
  // 무로그 fail-safe 금지 (프로젝트 lesson) — max_tokens 절단 등 원인 추적용 (WR-08).
  logger.warn({ code: input.code, stopReason: res.stop_reason, usage: res.usage },
    "limitup specialist empty text — fallback");
  return SPECIALIST_UNAVAILABLE;
}
logger.info({ code: input.code, model: cfg.chatSpecialistModel, usage: res.usage },
  "[chat] limitup specialist usage");
...
} catch (err) {
  logger.warn({ code: input.code, err: (err as Error).message }, "limitup specialist haiku failed");
  return SPECIALIST_UNAVAILABLE;
}
```
차이: `thinking: { type: "disabled" }` 를 **넣지 않는다**(Opus 5.5 는 400). `model: cfg.chatDiagnosisModel` · `output_config: { effort }` 은 SDK 0.65 타입에 없으므로 요청 객체에 타입 단언으로 싣는다. `stop_reason === "refusal"` 분기 로그 추가. 라운드별 로그에 도구 이름 · usage(입력/출력/cache_read/cache_creation).

**Analog B (루프 구조):** `server/src/services/chat-service.ts:380-500` — 스트림 + `finalMessage()` + append-only messages + tool_use 분기.
```typescript
const stream = client.messages.stream({
  model: cfg.chatLeadModel,
  max_tokens: 8192,
  system: [{ type: "text" as const, text: LEAD_PROMPT, cache_control: { type: "ephemeral" as const } }],
  tools: SPECIALIST_TOOLS.map((t, idx) =>
    idx === SPECIALIST_TOOLS.length - 1 ? { ...t, cache_control: { type: "ephemeral" as const } } : t),
  messages: workingMessages,
}, { signal: effectiveSignal });
...
finalMessage = await stream.finalMessage();
...
workingMessages.push({ role: "assistant", content: finalMessage.content });  // thinking 블록 보존
if (finalMessage.stop_reason === "tool_use") {
  const calls = finalMessage.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const toolResults = await Promise.all(calls.map(async (b) => ({ type: "tool_result" as const, tool_use_id: b.id, content })));
  workingMessages.push({ role: "user", content: toolResults });
} else { finalText = ...; break; }
```
**복제 금지:** `chat-service.ts:501-556` 「tools 빼고 강제 요약 1콜」 — Opus preserved thinking 이 깨진다(RESEARCH Pitfall 1). 마무리 콜은 tools 그대로 + `tool_choice: {type:"none"}`. 재시도 헬퍼 `isRetryableError` · `sleep` (`chat-service.ts:210-220`) 재사용 가능. `signal` 은 팀장 `effectiveSignal` 을 ctx 로 받아 전달.

---

### `server/src/services/specialists/diagnosis/diagnosis-tools.ts` (Tool 정의 + 디스패치)

**Analog:** `server/src/services/chat-orchestrator.ts`

Tool 정의 꼴 (lines 58-68):
```typescript
export const SPECIALIST_TOOLS: Anthropic.Tool[] = [
  {
    name: SPECIALIST_TOOL_NAMES.quote,
    description: "특정 종목의 ... 종목 코드(code)가 특정되지 않으면 호출하지 말 것.",
    input_schema: {
      type: "object",
      properties: { code: { type: "string" }, question: { type: "string" } },
      required: ["question"],
    },
  },
```
디스패치 꼴 (lines 134-163) — 미지 이름은 throw 대신 안내 텍스트:
```typescript
const UNKNOWN_TOOL = "해당 전문가를 찾을 수 없습니다.";
export async function runSpecialist(name, input, supabase): Promise<SpecialistRunResult> {
  const id = toolNameToSpecialistId(name);
  if (id === null) return { text: UNKNOWN_TOOL };
  switch (id) { case "quote": return { text: await consultQuoteSpecialist(supabase, input) }; ... default: return { text: UNKNOWN_TOOL }; }
}
```
진단판: 4 도구(`search_stock` · `get_order_log` · `get_market_ticks`) 스키마에 **계좌·사용자·서버 칸 0** · `ctx.userId` 클로저로 RPC 에 주입 · zod 검증 실패 → `{ type:"tool_result", is_error: true, content: 사유 }` · 도구별 호출 상한 카운터.

`search_stock` 쿼리 analog: `server/src/routes/stocks.ts:40-75` — `SearchQuery` · `sanitizeSearchTerm(parsed.data.q)` · `supabase.from("stocks")` · name/code ilike · ETP·상폐 제외 블랙리스트(같은 조건 그대로 복사).

---

### `server/src/services/specialists/diagnosis/diagnosis-order-log.ts`

**Analog:** `server/src/services/ticks.ts:134-150` (`openTick` RPC 호출 + 게이트 + 모양 검사)
```typescript
const { data, error } = await supabase.rpc("tick_open_for_user", {
  p_user_id: userId, p_date: q.d, p_isin: q.isin, p_ex: q.ex,
});
if (error) throw DbError(FAIL, causeOf(error));
const out = gate("tick_open_for_user", data);
```
진단판은 throw 대신 도구 응답 텍스트(「DMA 계좌 매핑 없음」 · 「조회 실패」) 로 바꾸되 로그는 남긴다. `access:false` 처리 동일.

직렬화: `packages/shared/src/strategy-event-text.ts:501-509` `orderLogLineText(ev, stockName)` 를 그대로 호출(웹과 같은 문장) 뒤에 `사유="…" 임계=… 실측=… 누적=… t=…` 부착. 행 변환은 shared `toStrategyEventRow`(RPC 원소가 `to_jsonb(e) - 'dma_user_id' - 'applied_at' || {stock_code}` 꼴일 때 그대로).

---

### `server/src/services/specialists/diagnosis/diagnosis-market.ts` (+ 선택 `server/src/services/tick-live-fetch.ts`)

**Analog 1 — 다중 zstd 프레임 해제:** `workers/tick-convert/src/modes/promote.ts:131-136`
```typescript
/** 이어붙인 zstd 프레임 전부를 푼다(프레임마다 · 37-02 함정). */
export function decompressFrames(buf: Uint8Array): Uint8Array {
  const frames = splitZstdFrames(buf);
  if (frames.length === 1) return new Uint8Array(zlib.zstdDecompressSync(frames[0]!));
  return concatBytes(frames.map((f) => new Uint8Array(zlib.zstdDecompressSync(f))));
}
```
`splitZstdFrames` 는 `packages/shared/src/ticks/framing.ts:98`. 레코드 순회 `iterRecords` · 디코드 `decodeAny`(`ticks/decode.ts:204-212`) · 필드 이름 `ticks/layouts.ts:85-136`.

**Analog 2 — 오늘(tickgw offset 루프):** `workers/tick-convert/src/tickgw-live.ts:173-215` `fetchLiveDay` — 마감 검사 · 409 epoch 재시작(`LIVE_MAX_CONFLICTS`) · `offset = r.offsetEnd` · 실패는 `{kind:"failed", reason}` 반환(throw 아님 · 401 만 throw). 서버 클라이언트는 `server/src/services/tickgw-client.ts` `TickgwClient.live({isin, ex, epoch, offset})` (`routes/ticks.ts:121` 호출 꼴). tickgw 없음 → `routes/ticks.ts:113-114` 의 `TicksLiveUnavailable` 판정 그대로 「자료 없음: 당일 경로 꺼짐」.

**Analog 3 — 과거(격자):** `server/src/services/ticks.ts:134-160` `openTick` → `raw.object_path` → 서버는 서명 URL 대신 `supabase.storage.from(TICK_GRID_BUCKET).download(path)`. 격자 없음 → `requestTickConvert(supabase, userId, {d, isin, ex}, { trigger, dailyCap })` (`ticks.ts:261-`) · capped → 「오늘 변환 한도 소진」.

주의: `parseStr` 가 오른쪽 공백을 지워 bs `' '` → `""` — 포맷에서 `b_` 로 표기(Pitfall 5). 상한 N=60초 · M=400건 · 잘림 문구.

---

### `server/src/services/specialists/diagnosis/diagnosis-knowledge.ts`

**Analog:** `server/src/services/chat-prompts.ts` — 전문가 프롬프트 상수 export 꼴 + 기존 `[프롬프트 인젝션 방어]` 절 복제. gh-trade 원문 커밋 표기 주석.

---

### `server/src/services/chat-service.ts` (수정)

연결점 `:453-482`(위 Analog B 의 `Promise.all` 블록):
```typescript
if (agentId) sendSSE(res, "agent_start", { agent: agentId, label: SPECIALIST_LABELS[agentId] });
const out = await runSpecialist(b.name, b.input as { code?: string; question: string }, supabase);
if (agentId) sendSSE(res, "agent_end", { agent: agentId });
...
let content = out.text;
if (content.length > MAX_TOOL_RESULT_CHARS) content = content.slice(0, MAX_TOOL_RESULT_CHARS) + "...(truncated)";
```
변경: `runSpecialist` 4번째 인자 `ctx{ userId, signal, diagnosisDeps }` · 진단이면 `sendSSE(res, "text", { text: 진단문 })` + `accumulatedText += 진단문`(WR-03 「클라이언트 누적 == accumulatedText」 유지 — 재시도 시 `text_clear` 후 `accumulatedText` 재전송 로직 `:422-428` 이 그대로 맞물린다) · tool_result 머리 「[이미 화면에 그대로 표시됨 — 재서술 금지]」 · 진단 결과에는 8,000자 절단을 적용하지 않거나 별도 한도. 병렬 호출 시 진단문 emit 순서 주의. `[chat] usage` 로그에 `models` 맵(모델별 토큰).

`HandleChatOptions` 확장 → `server/src/routes/chat.ts:95-100`:
```typescript
await handleChatStream(res, supabase, clientAbort.signal, {
  userId: req.userId!, conversationId, message, stockCode,
});
```
여기에 `diagnosisDeps: { tickgw: req.app.locals.tickgw, trigger: req.app.locals.tickConvertTrigger, dailyCap: req.app.locals.tickRequestDailyCap }` 추가 (`server/src/app.ts:86-89` · `routes/ticks.ts:181` 의 `{ trigger, dailyCap }` 꼴).

### `server/src/services/chat-orchestrator.ts` (수정)
`SPECIALIST_TOOLS` 끝에 `consult_diagnosis_specialist`(input_schema `{ question }` 만 · `code` 없음) — 끝 원소라 `cache_control` 이 이동(무해). `runSpecialist` switch 에 `case "diagnosis"`. `TOOL_NAME_TO_ID` 는 shared 에서 자동.

### `server/src/config.ts` (수정, lines 116-124)
```typescript
chatSpecialistModel: process.env.CHAT_SPECIALIST_MODEL ?? "claude-sonnet-5",
chatWebSearchModel: process.env.CHAT_WEBSEARCH_MODEL ?? "claude-sonnet-5",
```
같은 꼴로 `chatDiagnosisModel: process.env.CHAT_DIAGNOSIS_MODEL ?? "claude-opus-5-5"` · `chatDiagnosisEffort` · 마감 초 등. 기본값은 코드에(deploy-server.sh 에 CHAT_ env 없음).

### `packages/shared/src/chat.ts` (수정, lines 16-33)
```typescript
export type SpecialistId = "quote" | "theme" | "news" | "limitup" | "websearch";
export const SPECIALIST_TOOL_NAMES: Record<SpecialistId, string> = { ..., websearch: "consult_websearch_specialist" };
export const SPECIALIST_LABELS: Record<SpecialistId, string> = { ..., websearch: "실시간 검색 전문가" };
```
세 곳에 `diagnosis` · `"consult_diagnosis_specialist"` · `"주문 진단 전문가"`. `Record<SpecialistId,…>` 라 누락 시 타입 오류로 잡힌다.

### `packages/shared/src/strategy-event-labels.ts` (수정)
lines 19-40 의 주석 `// 9 — gh-radar 「상태전이」 예약(표에 없다 — 오면 원문 숫자).` 자리에 `9: "상태전이",`. reason_code 사전은 `AUTO_SELL_PAUSE_LABELS` 와 같은 `Readonly<Record<…, string>>` 상수(`STATE_REASON_LABELS`). `strategyEventSide`(lines 226-238) — kind 9 는 group 과 무관하게 `null` 을 **함수 첫 줄**에서 반환(현재는 group 1~9 가 먼저 방향을 정해 버림 — RESEARCH Pitfall).

### `packages/shared/src/strategy-event-text.ts` (수정)
`strategyEventParts` switch 의 `case 13` / `case 14`(lines ~174-185) 꼴로 `case 9`:
```typescript
case 14:
  return { ...orderBadge(ev),
    action: AUTO_SELL_PAUSE_LABELS[ev.condActual] ?? String(ev.condActual),
    body: autoSellPauseBody(ev), cum };
```
→ kind 9 는 `action: STATE_REASON_LABELS[...] ?? 원문` · 모르는 값은 D-10 폴백(`unknownKindParts`). `orderLogLineText`(501) · `timelineStrategyText`(519) 는 parts 를 공유하므로 case 하나로 둘 다 처리.

### `webapp/src/lib/order-log-feed.ts` (수정)
- line 38 `OrderLogKindFilter` 에 `'state'` · lines 50-62 `ORDER_LOG_KIND_FILTERS` 에 `{ value: 'state', label: '상태전이' }`.
- `matchesKind`(123-128) 는 group 기반이므로 `'state'` 는 `market` 처럼 kind 로 분기:
```typescript
if (kind === 'market') return market;
return !market && KIND_GROUPS[kind].includes(row.group);
```
→ `if (kind === 'state') return row.kind === 9;` 를 `market` 옆에, `KIND_GROUPS` 의 `Exclude<…, 'all' | 'market'>` 에 `'state'` 추가. 그룹 칩(pre 등)에서 kind 9 를 뺄지 UI-SPEC 확인. `side` 필터(158-180) 도 kind 9 = null 방향 처리.

### 주문로그 탭 kind 9 행 (component)
analog: 같은 탭의 시세 행 분기(`isMarketStrategyEvent(row.kind)` · 방향 색 없음). `strategyEventSide` null → 회색 톤.

### `webapp/src/components/chat/agent-progress.tsx` (lines 27-33)
```typescript
const STEP_ORDER: SpecialistId[] = ["quote", "theme", "news", "limitup", "websearch"];
```
`"diagnosis"` 추가 — 없으면 표시에서 빠진다.

### `webapp/src/components/chat/message-assistant.tsx` (lines 68-77)
```typescript
a: ({ href, children }) => (
  <a href={href} target="_blank" rel="noreferrer" className="text-[var(--primary)] underline underline-offset-2">
```
`href?.startsWith("/analytics/ticks?")` 이면 같은 탭(`next/link` 또는 target 생략), 그 밖 내부 경로는 링크 해제 · 외부는 현행. URL 빌더 정본 `webapp/src/lib/ticks/tick-url.ts`.

---

### `supabase/migrations/2026110xxxxxxx_dma_diagnosis_for_user.sql`

**Analog:** `supabase/migrations/20261104100000_tick_own_for_user.sql`

머리 · 게이트 · 가시 키 (lines 44-70):
```sql
BEGIN;
CREATE FUNCTION public.tick_own_for_user(p_user_id uuid, p_date text, p_isin text, p_ex text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE v_day date := to_date(p_date, 'YYYYMMDD'); v_vis text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  END IF;
  SELECT coalesce(array_agg(v.gateway || '|' || v.account_no), ARRAY[]::text[]) INTO v_vis
    FROM public.dma_visible_accounts(p_user_id) v;
```
배열 꼴 + 켜진 서버 조인 (lines 80-97):
```sql
'fills', (SELECT coalesce(jsonb_agg(jsonb_build_object(...) ORDER BY j.gw_time, j.gateway, j.seq), '[]'::jsonb)
          FROM public.dma_journal_events j
          JOIN public.dma_servers s ON s.key = j.gateway AND s.enabled
         WHERE j.trade_date = v_day AND j.notice_type = 'E' AND j.exec_qty > 0
           AND (v_admin OR (j.gateway || '|' || j.account_no) = ANY (v_vis))),
```
권한 · 인덱스 · reload (lines 150-168):
```sql
REVOKE EXECUTE ON FUNCTION public.tick_own_for_user(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_own_for_user(uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_own_for_user(uuid, text, text, text) TO service_role;
CREATE INDEX IF NOT EXISTS idx_dma_strategy_events_order_isin_day
  ON public.dma_strategy_events (trade_date, isin, exchange) WHERE kind IN (3, 6);
NOTIFY pgrst, 'reload schema';
COMMIT;
```
차이: **`v_admin` 분기 제거**(웹 주문로그 RPC 범위 — Open Q1) · `p_trade_date date, p_isin text DEFAULT NULL` · `p_isin IS NULL OR e.isin = p_isin` · events 원소는 `to_jsonb(e) - 'dma_user_id' - 'applied_at' || jsonb_build_object('stock_code', st.code)` (`20261018120000_dma_strategy_events_accum_signal.sql:43-45` 꼴) · kind 조건: 주문 이벤트(9 포함)는 가시 계좌 일치, 시세 1·2·10 은 맥락으로, 15~18 제외 · 새 부분 인덱스 `WHERE kind NOT IN (15, 16)` · 파일 머리 롤백 주석(lines 1-42 꼴).

### `supabase/tests/dma_diagnosis.test.sql`

**Analog:** `supabase/tests/tick_own.test.sql`
- 머리 주석(lines 1-31): 잠그는 것 · 실행 `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_diagnosis.test.sql` · 사용자 표.
- 골격(33-60): `BEGIN; CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions; SET LOCAL search_path = public, extensions; SELECT plan(N);` → `auth.users` · `dma_users` · `app_users` INSERT → `SELECT public.dma_journal_sync_access('KB120', '[...]'::jsonb);`.
- 단언(161-197): `has_function(...)` · `ok(NOT (SELECT bool_or(has_function_privilege(r, '…', 'EXECUTE')) …))` anon/authenticated · `has_function_privilege('service_role', …)` · `is(…, '{"access": false}'::jsonb, …)` (NULL · 매핑 없음).
- 추가할 절: U1↔U2 상호 불가시(SC-2) · **어드민도 남의 계좌 안 보임**(tick_own D 절과 반대) · kind 9 행이 가시 계좌 소유자에게 보이고 빈 계좌 kind 9 는 안 보임 · 꺼진 서버 제외 · `dma_user_id` 키 없음 · `dma_strategy_events_for_user_json` 이 kind 9 를 돌려줌(D-11 고정) · 양성 대조.

---

### 서버 테스트 3종 (`server/src/services/specialists/__tests__/diagnosis*.test.ts`)

**Analog:** `server/src/services/specialists/__tests__/specialists.test.ts:1-30`
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeCreateResponse } from "../../__tests__/anthropic-mock";
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock("../anthropic-client", () => ({
  getChatAnthropicClient: () => ({ messages: { create: createMock } }),
  __resetChatClientForTests: () => {},
}));
// mock 이후 import
```
진단 루프는 `stream` 을 쓰므로 mock 에 `stream: streamMock` 추가 · 파일이 `diagnosis/` 하위면 상대경로 `../diagnosis/...` 조정. 단언: 요청에 `thinking` 없음 · `tool_choice` 강제값 없음 · `output_config.effort` · 모델 `claude-opus-5-5` · 도구 스키마에 account/user/gateway 키 0 · RPC 호출 인자 `p_user_id === ctx.userId` · refusal/빈 텍스트 시 `logger.warn` 에 `stopReason` · 마감 시 마무리 콜이 tools 유지.

### `server/src/services/__tests__/anthropic-mock.ts` (수정)
`makeMessageSkeleton(content, stopReason)` (32-46) · `makeStreamMock({ textDeltas, finalMessage })` (59-79) 를 재사용해 `makeToolUseMessage(calls)` · `makeThinkingBlock()` · `makeRefusalMessage()` · 라운드 배열을 순서대로 내주는 `makeStreamSequence([...])` 추가. `model` 기본 `"claude-sonnet-5"` 는 인자로 바꿀 수 있게.

### gh-trade 노트
`scripts/trade-handoff.sh chatbot-kind9-mapping` 실행 → `<gh-trade>/docs/inbox/from-gh-radar/YYMMDD-chatbot-kind9-mapping.md`(템플릿 4토큰 치환 · 덮어쓰기 안 함 · gh-radar 트리 무변경) → TODO 채움(43칸 · reason_code 대역 · 1차/2차 표기). 커밋은 gh-trade 세션. 그 뒤 `docs/inbox/from-gh-trade/261105-chatbot-diagnosis-kind9.md` frontmatter `status: done` · `done_commit` (형식 정본 `docs/inbox/from-gh-trade/README.md`).

## Shared Patterns

### 계좌 범위 강제
**Source:** `tick_own_for_user.sql:58-70` + `server/src/routes/chat.ts`(`req.userId!`)
**Apply to:** 진단 RPC · `diagnosis-tools.ts` · 모든 진단 테스트 — 서버는 `p_user_id` 하나만 넘기고 판정은 RPC 안 `dma_visible_accounts`. 모델 입력 스키마에 계좌 칸 없음.

### 무로그 fail-safe 금지
**Source:** `limitup-specialist.ts:112-128`
**Apply to:** 진단 루프 모든 종료 경로(빈 텍스트 · max_tokens · refusal · 마감 · 예외) — `stopReason` + `usage` 로깅 후 `SPECIALIST_UNAVAILABLE` 또는 고정 문구.

### 프롬프트 캐시
**Source:** `chat-service.ts:390-401` — `system` 블록 `cache_control: { type: "ephemeral" as const }` + tools 마지막 원소 부착.
**Apply to:** 진단 루프(+ 마지막 user 블록 증분 캐시).

### RPC 권한 3줄 + reload
**Source:** `tick_own_for_user.sql:153-155,166`
**Apply to:** 신규 마이그레이션 전부.

### 도구/전문가 실패는 throw 대신 텍스트
**Source:** `chat-orchestrator.ts:41-44,140,160` (`UNKNOWN_TOOL` · `CODE_REQUIRED_SKIP`)
**Apply to:** 진단 도구 응답(「자료 없음: 사유」 · 「상태전이 기록 없음(아직 미적재)」 · 「잘렸음 · 범위 좁혀 다시」).

### 라벨 정본 한 곳
**Source:** `packages/shared/src/strategy-event-labels.ts` · `strategy-event-text.ts`
**Apply to:** 진단 직렬화 · 웹 kind 9 행 — 같은 함수 호출, 문구 복제 금지.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| 진단 루프의 Opus 특유 부분(`output_config.effort` 단언 · refusal · preserved thinking 마무리 콜 `tool_choice:{type:"none"}`) | service | loop | 저장소 첫 「도구 가진 전문가」 — RESEARCH §Pattern 2 표를 따른다 |
| SSE 직접 전달(D-01 진단문을 `text` 로 흘리고 tool_result 에 재서술 금지 머리) | service | streaming | 기존 전문가 결과는 전부 팀장만 본다 — RESEARCH Summary 2문단 · 다이어그램 따름 |

## Metadata

**Analog search scope:** `server/src/services/**` · `server/src/routes/{chat,ticks,stocks}.ts` · `packages/shared/src/{chat,strategy-event*,ticks/*}.ts` · `webapp/src/{lib/order-log-feed.ts,components/chat/*}` · `supabase/{migrations,tests}` · `workers/tick-convert/src/*` · `scripts/trade-handoff.sh`
**Files scanned:** ~25 (모두 git 추적 원본 — 미러 경로 없음)
**Pattern extraction date:** 2026-11-05
