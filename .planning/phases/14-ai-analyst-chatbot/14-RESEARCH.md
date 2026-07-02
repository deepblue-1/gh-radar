# Phase 14: AI 애널리스트 챗봇 (멀티에이전트) - Research

**Researched:** 2026-07-02
**Domain:** Anthropic multi-agent orchestration (Sonnet 팀장 + Haiku 전문가) · Express SSE 스트리밍 · Next.js SSE 소비 · Supabase 대화 히스토리 + RLS · 서버 JWT 검증
**Confidence:** HIGH (이식 원본 코드 + 기존 gh-radar 패턴 + 공식 Anthropic 문서 교차검증) · web_search 모델지원은 MEDIUM

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01: 로그인 필수.** 비로그인 FAB/입력 시 로그인 유도. 비로그인 체험 모드 없음.
- **D-02: 서버 JWT 검증 신설.** 웹앱이 Supabase access token 을 `Authorization: Bearer` 로 전달 → 서버가 `supabase.auth.getUser(jwt)` 로 검증 후 히스토리 로드/저장을 모두 서버(서비스롤)가 전담. 클라이언트 위변조 불가. gh-radar 서버 최초의 사용자 인증 패턴 — 챗 라우트 한정. conversations/messages 테이블 자체에는 RLS(`TO authenticated`, `auth.uid() = user_id`) 정상 적용(watchlists mirror — 서비스롤 bypass).
- **D-03: 종목상세 챗 = 해당 종목 최근 대화 자동 이어가기** + '새 대화' 버튼.
- **D-04: 에이전트별 단계 표시.** "테마 전문가 분석 중…" 식 (ww-bot `tool_start`/`tool_end` SSE 확장).
- **D-05: 팀장 종합 답변만 노출.** 전문가 개별 의견/전문 미표시. 의견 충돌 시 팀장이 본문에서 언급.
- **D-06: 중단 버튼 + 새 질문 시 자동 중단.** 시트 닫아도 서버는 응답 완료 후 저장.
- **D-07: 미니 종목 카드 인라인 삽입** (종목명+현재가+등락률, 클릭 시 `/stocks/[code]`).
- **D-08: 근거 출처 링크 인용.** DB 뉴스=제목+출처+URL verbatim, 웹서치=Anthropic citations. 크롤링 5원칙 #5.
- **D-09: 풀 마크다운 렌더링** (react-markdown 계열, somi-chat 라이트 변환 폐기).
- **D-10: 차트 임베드 = 기존 lightweight-charts 재사용** (Phase 09.2, oklch 직접 주입 금지).
- **D-11: v1 사용자별 턴 제한 없음.** 기존 글로벌 IP rate limit(200req/60s)만.
- **D-12: 웹서치 전문가는 팀장 판단으로 필요 시만 호출** (web_search $10/1,000회 — 가장 비싼 전문가).
- **D-13: 대화 목록/종목 필터 UI는 `/chat` 페이지에서만.** FAB 시트는 현재 대화 + '새 대화'만.

### Claude's Discretion
- conversations/messages 정확 스키마 (제목 자동 생성, 컬럼, 인덱스)
- 대화 보존 정책 (기본 무기한, 삭제 UI 여부), 메시지 길이 제한 (~1,000자)
- 서버 인메모리 동시성 가드 세부 (busy/interrupt/턴 상한 — ww-bot MAX_TURNS/MAX_HISTORY 참고)
- 에이전트 실패/타임아웃 처리 (일부 전문가 실패 시 가용 의견 + 본문 고지)
- **팀장-전문가 오케스트레이션 구현 형태** (전문가를 팀장의 tool 로 노출 vs 별도 fan-out 오케스트레이터)
- SSE 이벤트 정확 스펙 (SSEEventMap 확장: agent_start/agent_end, stock 카드, chart 카드)
- 모델 config 키 설계 (chatLeadModel=Sonnet, chatSpecialistModel=Haiku), 프롬프트 캐싱
- 면책 문구 (투자자문 아님) 표시 위치/방식

### Deferred Ideas (OUT OF SCOPE)
- 사용자별 일일 quota (v1 무제한 D-11)
- 비로그인 체험 모드
- 전문가 의견 개별 카드 노출 (v1 팀장 종합만 D-05)
- FAB 시트 내 대화 전환 UI (v1 /chat 페이지만 D-13)
</user_constraints>

<phase_requirements>
## Phase Requirements

REQUIREMENTS.md 에 아직 매핑된 requirement ID 없음 (ROADMAP "Requirements: TBD"). 신규 요구사항 후보를 planner/insert-phase 가 확정할 것:

| 후보 ID | 설명 | Research Support |
|---------|------|------------------|
| CHAT-01 (제안) | 팀장(Sonnet)+전문가 5(Haiku) 멀티에이전트 AI 애널리스트 챗봇, 로그인 사용자별·종목별 히스토리 | 아래 전 섹션 |

**주의:** planner 는 REQUIREMENTS.md 에 CHAT-01 을 추가하고 Traceability 표를 갱신하는 task 를 포함해야 함 (기존 phase 관례 — 예: HOME-01/LIMIT-01 추가 방식).
</phase_requirements>

## Summary

이 phase 는 **완전히 새로운 기능(greenfield)이 아니라 이식(port) 중심**이다. `../weekly-wine-bot` 이 이미 프로덕션에서 검증한 **SSE 스트리밍 + Anthropic tool-use 루프 + 세션/interrupt 가드 + sanitizeMessages + 429/529 retry + 프롬프트 캐싱** 전부를 gh-radar 서버로 옮기고, gh-radar 도메인(상한가 따라잡기)에 맞게 tool 과 시스템 프롬프트를 교체하는 작업이다. 프론트도 `../weekly-wine-cafe24` 의 somi-chat FAB+시트 상태머신을 React/shadcn 으로 포팅한다. `packages/somi-chat-core` 의 `SSEEventMap` + `parseSSEStream` 는 SSE 프로토콜의 검증된 계약이므로 그대로 참조한다.

gh-radar 고유의 신규 요소는 세 가지다. (1) **멀티에이전트** — ww-bot 은 단일 에이전트지만 CONTEXT 는 팀장(Sonnet)+전문가 5(Haiku) 를 잠갔다. 권장 구현은 **agent-as-tool (orchestrator-workers)** — 각 전문가를 팀장의 tool 로 노출해 팀장이 질문 성격에 따라 선택적·병렬 호출(한 turn 에 여러 tool_use → `Promise.all` 병렬 실행). (2) **서버 JWT 검증** — gh-radar 서버 최초의 사용자 인증(D-02). `supabase.auth.getUser(jwt)` 로 검증, 히스토리 read/write 는 서비스롤이 전담. (3) **대화 영속화** — ww-bot 은 서버 인메모리 세션 + 클라 sessionStorage 였으나, gh-radar 는 Supabase `conversations`/`messages` 테이블에 로그인 사용자별·종목별로 저장(RLS `TO authenticated`).

**Primary recommendation:** ww-bot `chat-service.ts`/`chat.ts` 를 서버에 1:1 이식(SSE 헤더·15s keepalive·interrupt·sanitize·retry·프롬프트 캐싱 그대로) → 단일 에이전트 루프의 "tool" 자리에 **5개 전문가 tool** 을 꽂고 팀장 모델을 Sonnet(`claude-sonnet-4-6` 권장, 아래 A1 참조)으로 설정 → 각 전문가는 Haiku(`claude-haiku-4-5`) 호출. 데이터 전문가(시세/테마/뉴스/상한가)는 **결정적 TS 함수가 Supabase 에서 데이터를 먼저 조회해 Haiku 프롬프트에 주입**하는 형태(내부 중첩 tool-use 루프 금지 — 지연/비용 폭증 회피). 웹서치 전문가만 Anthropic `web_search` 서버 tool 사용(D-12 팀장 판단으로만).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/sdk | ^0.65.0 (기설치) | Claude 팀장/전문가 호출, `messages.stream()`, tool-use, web_search | [VERIFIED: server/package.json] 이미 discussion-classify 가 사용 중. 추가 설치 불요 |
| @supabase/supabase-js | ^2.103.0 (기설치) | 서비스롤 DB read/write + `auth.getUser(jwt)` JWT 검증 | [VERIFIED: server/package.json] JWT 검증에 별도 라이브러리 불요 — supabase-js 가 내장 |
| express | ^5.2.1 (기설치) | `POST /api/chat` SSE 라우트 (`res.write`) | [VERIFIED] app.ts 라우터 결선 |
| express-rate-limit | ^8.3.2 (기설치) | 챗 라우트 레벨 rate limit (ww-bot 패턴) | [VERIFIED] middleware/rate-limit.ts 선례 |
| p-limit | ^7.0.0 (기설치) | 전문가 병렬 호출 동시성 제어 (선택) | [VERIFIED] discussion-classify 가 사용 |
| react-markdown | 10.1.0 | assistant 답변 풀 마크다운 렌더 (D-09) | [VERIFIED: npm view 2026-07-02] 신규 프론트 의존성 |
| remark-gfm | 4.0.1 | 표(종목 비교)/체크리스트 GFM 지원 (D-09) | [VERIFIED: npm view 2026-07-02] react-markdown 플러그인 |

### Supporting (기존 재사용 — 신규 설치 없음)
| Asset | Purpose | Source |
|-------|---------|--------|
| lightweight-charts ^5.2.0 + `webapp/src/lib/chart-colors.ts` | 미니 일봉차트 임베드 (D-10) | [VERIFIED] Phase 09.2 |
| shadcn `sheet/dialog/textarea/button/badge/card/skeleton/tooltip/popover` | 챗 시트/composer/카드 UI | [VERIFIED] 14-UI-SPEC.md §Component Inventory |
| `webapp/src/lib/supabase/client.ts` (`createBrowserClient`) | 클라 세션 토큰 취득 (`getSession().access_token`) | [VERIFIED] |
| `webapp/src/lib/auth-context.tsx` (`useAuth`) | 로그인 상태 게이트 (D-01) | [VERIFIED] |
| server `mappers/stock.ts`, `lib/quoteJoin.ts`, `lib/computeTop3.ts` | 전문가 tool 데이터 조립 재사용 | [VERIFIED: CONTEXT code_context] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| agent-as-tool (권장) | 별도 fan-out 오케스트레이터 (팀장 밖에서 규칙기반으로 전문가 선택 후 결과를 팀장에 주입) | fan-out 은 병렬 제어가 명시적이나 "질문 성격에 따라 선택" 로직을 코드로 하드코딩해야 함 → 팀장 LLM 의 판단력 활용 불가. agent-as-tool 이 CONTEXT "질문 성격에 따라 선택적 병렬 호출" 의도에 부합 |
| 전문가=결정적 데이터조회+Haiku 1콜 (권장) | 전문가=Haiku 내부 tool-use 루프 (자체 DB tool 반복호출) | 내부 루프는 지연/토큰 폭증(팀장 turn × 전문가 turn × tool round). 데이터가 결정적이므로 선조회 주입이 우월 |
| react-markdown | somi-chat `textToHtml` 라이트 변환 이식 | D-09 가 표/헤딩/코드 요구 → 라이트 변환은 표 미지원. react-markdown 채택 확정 |
| SSE (`res.write`) | Socket.io / WebSocket | CLAUDE.md 이미 SSE 확정. 서버→클라 단방향이라 WebSocket 오버킬 |

**Installation:**
```bash
# 서버: 신규 설치 없음 (@anthropic-ai/sdk, supabase-js, express-rate-limit, p-limit 모두 기설치)
# 웹앱:
cd webapp && pnpm add react-markdown@10 remark-gfm@4
```

**Version verification (2026-07-02, npm registry):**
- `react-markdown` → 10.1.0 [VERIFIED]
- `remark-gfm` → 4.0.1 [VERIFIED]
- `@anthropic-ai/sdk` → 서버 기설치 ^0.65.0 [VERIFIED: package.json]. planner 는 web_search 서버 tool 타입(`web_search_20250305`)과 `messages.stream` signal 옵션이 이 버전에서 지원되는지 확인할 것(대부분 지원하나, 필요 시 `pnpm up @anthropic-ai/sdk` 검토).

---

## Architecture Patterns

### Recommended Project Structure
```
server/src/
├── routes/
│   └── chat.ts                 # POST /api/chat (SSE) + JWT 미들웨어 + rate limit + GET/DELETE 대화관리
├── middleware/
│   └── require-auth.ts          # 신규 — supabase.auth.getUser(jwt) → req.userId (D-02)
├── services/
│   ├── chat-service.ts          # ww-bot 이식 — 세션/interrupt/sanitize/retry/팀장 tool-use 루프
│   ├── chat-orchestrator.ts     # 팀장(Sonnet) tool 정의 = 5 전문가 + 인라인 종목카드 로직
│   ├── specialists/
│   │   ├── quote-specialist.ts      # ①시세/수급 (stock_quotes/stock_daily_ohlcv)
│   │   ├── theme-specialist.ts      # ②테마 (themes/theme_stocks/theme_comovement)
│   │   ├── news-specialist.ts       # ③뉴스/심리 (news_articles/discussions)
│   │   ├── limitup-specialist.ts    # ④상한가 패턴 (limit_up_events/stock_stats/theme_stats/home_theme_snapshots)
│   │   └── websearch-specialist.ts  # ⑤실시간 웹서치 (Anthropic web_search 서버 tool, D-12)
│   ├── chat-history.ts          # conversations/messages read/write (서비스롤)
│   └── chat-prompts.ts          # 팀장/전문가 시스템 프롬프트 상수
└── schemas/chat.ts              # zod — POST body, 대화목록 쿼리
webapp/src/
├── components/chat/
│   ├── chat-fab.tsx             # 전역 FAB (usePathname → 종목 컨텍스트) — C1
│   ├── chat-sheet.tsx           # shadcn Sheet 기반 시트 — C2
│   ├── chat-thread.tsx / message-*.tsx / agent-progress.tsx (C5) / mini-stock-card.tsx (C6) / citation.tsx (C7) / mini-chart.tsx (C8) / composer.tsx (C9)
│   └── chat-provider.tsx        # 전역 상태(open/context) — layout.tsx 마운트
├── lib/
│   ├── chat-sse.ts              # raw fetch + getReader + parseSSEStream 포팅 (apiFetch 사용 불가!)
│   └── chat-api.ts              # 대화목록/삭제 (JSON, apiFetch 사용 가능)
└── app/chat/page.tsx            # /chat 2-col 페이지 (C10, D-13)
supabase/migrations/
└── <ts>_chat_conversations.sql  # conversations + messages + RLS(TO authenticated)
```

### Pattern 1: 팀장 tool-use 루프 (ww-bot 이식 — 검증된 기준 템플릿)
**What:** 팀장(Sonnet)이 `messages.stream()` 으로 스트리밍, `stop_reason === "tool_use"` 면 tool(=전문가) 실행 후 `tool_result` 를 붙여 재호출하는 agentic 루프. `MAX_TOOL_ROUNDS=5`, 소진 시 tool 없이 강제 요약 1콜.
**When to use:** 챗 서비스의 핵심 — `chat-service.ts` 의 `handleChatStream`.
**핵심 이식 포인트 (ww-bot `chat-service.ts` 그대로):**
- `sanitizeMessages()` — tool_use/tool_result 페어링 복구 + 연속 role 제거. **DB 에서 복원한 히스토리를 팀장에 넣기 전 반드시 통과시킬 것** (Claude API invariant).
- `pruneHistory()` — 슬라이딩 윈도우(MAX_HISTORY_MESSAGES). 페어 경계 안 자름.
- `isRetryableError()` + retry — 429/529/overloaded_error/rate_limit_error 만 재시도(최대 2회).
- 프롬프트 캐싱 — `system` 과 tools 마지막 원소에 `cache_control: { type: "ephemeral" }` (Sonnet 큰 시스템 프롬프트 비용 90% 절감).
- interrupt/busy 가드 — 새 요청이 이전 요청 abort (D-06 "새 질문 시 자동 중단").
- `AbortSignal.any([clientAbort, interruptController.signal])` 로 stream 취소.

### Pattern 2: agent-as-tool 멀티에이전트 (orchestrator-workers) — 권장 오케스트레이션 형태
**What:** 5개 전문가를 팀장의 `Anthropic.Tool[]` 로 노출. 팀장이 질문 보고 필요한 전문가만 tool_use → 서버가 실행. 한 turn 에 여러 tool_use 블록이 오면 **`Promise.all` 로 병렬 실행**(= "선택적 병렬 호출").
**전문가 tool 정의 예 (팀장에 노출):**
```typescript
const SPECIALIST_TOOLS: Anthropic.Tool[] = [
  { name: "consult_quote_specialist",  description: "특정 종목의 현재가·등락률·거래대금·시가총액·최근 일봉 흐름·수급 관점 분석이 필요할 때", input_schema: { type:"object", properties:{ code:{type:"string"}, question:{type:"string"} }, required:["code"] } },
  { name: "consult_theme_specialist",  description: "오늘 주도 테마·특정 종목의 소속 테마·테마 동조(co-movement) 후보 분석이 필요할 때", input_schema: {...} },
  { name: "consult_news_specialist",   description: "종목 관련 뉴스·종목토론방 심리 요약이 필요할 때 (DB 저장 뉴스/토론 기반)", input_schema: {...} },
  { name: "consult_limitup_specialist",description: "과거 상한가 다음날 익절 패턴·테마별 상한가 경향 분석이 필요할 때", input_schema: {...} },
  { name: "consult_websearch_specialist", description: "오늘 속보·공시·장중 이슈 등 DB 로 답할 수 없는 실시간 정보가 필요할 때만 (비용 큼 — 꼭 필요할 때만)", input_schema: {...} },
];
```
**전문가 실행부 (데이터 전문가 — 결정적 조회 + Haiku 1콜):**
```typescript
async function consultQuoteSpecialist(supabase, input) {
  // 1) 결정적 TS 조회 (LLM 아님) — quoteJoin/mappers 재사용
  const data = await fetchQuoteContext(supabase, input.code);  // stock_quotes ⋈ stocks ⋈ 최근 OHLCV
  // 2) Haiku 1콜 — 조회 데이터 주입, opinion 텍스트 반환 (내부 tool-use 루프 없음)
  const res = await haiku.messages.create({
    model: cfg.chatSpecialistModel,               // "claude-haiku-4-5"
    max_tokens: 700, temperature: 0,
    system: QUOTE_SPECIALIST_PROMPT,
    messages: [{ role:"user", content: `질문:${input.question}\n데이터:${JSON.stringify(data)}` }],
  });
  return specialistText(res);   // 팀장에 tool_result 로 반환
}
```
**웹서치 전문가 (예외 — Anthropic web_search 서버 tool):**
```typescript
async function consultWebSearchSpecialist(input) {
  const res = await webModel.messages.create({
    model: cfg.chatWebSearchModel,   // A2 참조 — Haiku 미지원 시 Sonnet
    max_tokens: 1024,
    system: WEBSEARCH_SPECIALIST_PROMPT,
    messages: [{ role:"user", content: input.question }],
    tools: [{ type:"web_search_20250305", name:"web_search", max_uses: 3,   // D-12 비용 상한
             user_location:{ type:"approximate", country:"KR", timezone:"Asia/Seoul" } }],
  });
  // citations(web_search_result_location) 를 추출해 팀장/최종 답변으로 전파 (D-08)
  return { text: specialistText(res), citations: extractCitations(res) };
}
```
**Why:** 팀장의 tool_use 가 곧 SSE `agent_start`/`agent_end`(D-04 진행 스텝퍼) 이벤트 소스가 된다 — ww-bot 의 `generateToolLabel` 을 한글 전문가명("시세·수급 전문가 분석 중…")으로 교체하면 바로 매핑됨. D-05(개별 의견 미노출)와도 정합 — tool_result 전문은 팀장 컨텍스트에만 들어가고 클라엔 라벨만 나감.

### Pattern 3: 서버 JWT 검증 미들웨어 (D-02 — gh-radar 서버 최초 인증)
**What:** 챗 라우트에만 적용. `Authorization: Bearer <supabase access_token>` → `supabase.auth.getUser(jwt)` 검증 → `req.userId`. 실패 시 401.
```typescript
// middleware/require-auth.ts
export function requireAuth(): RequestHandler {
  return async (req, res, next) => {
    const auth = req.header("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error:{ code:"UNAUTHENTICATED", message:"로그인이 필요합니다." } });
    const supabase = req.app.locals.supabase as SupabaseClient;   // 서비스롤 클라
    const { data, error } = await supabase.auth.getUser(token);   // JWT 검증 (supabase-js 내장)
    if (error || !data.user) return res.status(401).json({ error:{ code:"UNAUTHENTICATED", message:"세션이 만료되었습니다." } });
    (req as any).userId = data.user.id;
    next();
  };
}
```
**주의:** SSE 라우트는 `res.writeHead(200, ...)` 이후엔 상태코드 못 바꾼다 → **JWT 검증은 반드시 SSE 헤더 쓰기 전(미들웨어 단계)** 에 완료. 401 은 일반 JSON 으로 반환.
**히스토리 read/write 는 서비스롤 클라가 `WHERE user_id = req.userId` 로 직접 수행** — RLS 는 방어선(defense-in-depth)이지 서버 경로의 필터가 아님.

### Pattern 4: conversations/messages 스키마 + RLS (watchlists mirror)
**What:** 로그인 사용자별·종목별 대화 영속화. RLS `TO authenticated` + `auth.uid() = user_id` (watchlists 4정책 mirror). 서비스롤은 RLS bypass 라 서버가 전담 write.
**권장 스키마 (Claude's Discretion — planner 확정):**
```sql
CREATE TABLE conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_code  text REFERENCES stocks(code) ON DELETE SET NULL,  -- NULL=일반 대화(/chat), 값=종목상세 컨텍스트(D-03)
  title       text,                                             -- 첫 user 메시지 앞부분 자동 생성
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_conversations_user_stock ON conversations (user_id, stock_code, updated_at DESC);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user','assistant')),
  content         text NOT NULL,        -- 렌더용 마크다운 텍스트
  blocks          jsonb,                -- 미니 종목카드/차트/citation 등 구조화 부가물 (D-07/08/10)
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conversation ON messages (conversation_id, created_at);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
-- conversations: 4정책 TO authenticated, auth.uid() = user_id (watchlists mirror)
CREATE POLICY "auth_select_own_conversations" ON conversations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "auth_insert_own_conversations" ON conversations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "auth_update_own_conversations" ON conversations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "auth_delete_own_conversations" ON conversations FOR DELETE TO authenticated USING (auth.uid() = user_id);
-- messages: conversation 소유권을 EXISTS 서브쿼리로 (messages 엔 user_id 없음)
CREATE POLICY "auth_select_own_messages" ON messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
-- INSERT/UPDATE/DELETE 동일 EXISTS 패턴
```
**메모리 lesson 필수 적용:**
- `feedback_supabase_rls_authenticated` — 이 테이블들은 **비공개**(본인 것만)이므로 `TO authenticated` 만 명시하면 됨(anon 접근 불가가 의도). 단 `ALTER TABLE ... ENABLE RLS` + 정책 role 을 **명시적으로** 쓸 것. (참고: 공개 테이블만 `TO anon, authenticated` 둘 다 — 여기선 해당 없음.)
- RPC 를 쓴다면 `feedback_supabase_rpc_revoke` — `REVOKE ... FROM PUBLIC, anon, authenticated` + `GRANT ... TO service_role` 명시. **단, 이 phase 는 plain table read/write 로 충분 → RPC 불필요**(home_theme_snapshots 선례 "RPC 없음 → REVOKE 불요").

### Pattern 5: SSE — Express `res.write` + Next.js `getReader` 소비
**What:** ww-bot `chat.ts` 이식. SSE 헤더 + 15s keepalive + `req.on("close")` → abort + 터미널 `done` 이벤트 보장.
- **Cloud Run 필수:** `X-Accel-Buffering: no` 헤더 + `: keepalive\n\n` 15s 주기(프록시 idle timeout 방지, CONTEXT integration_points 명시).
- **클라 소비:** `apiFetch` 는 8s 타임아웃 JSON 전용 → **SSE 불가**. `chat-sse.ts` 는 raw `fetch` + `response.body.getReader()` + `parseSSEStream`(somi-chat-core 포팅). `Authorization: Bearer` 헤더 수동 부착.
- **app.ts 결선:** 글로벌 `express.json({limit:"16kb"})` 는 이미 있음 — 챗 body(최대 ~1,000자 텍스트)엔 충분. ww-bot 처럼 이미지 10mb 라우트-레벨 파서는 **불요**(이 phase 는 이미지 입력 없음).

### Pattern 6: SSEEventMap 확장 (D-04/07/08/10)
somi-chat-core `SSEEventMap` 를 gh-radar 용으로 확장(Claude's Discretion — 아래 권장):
```typescript
interface ChatSSEEventMap {
  session: { conversationId: string };
  text: { text: string };
  text_clear: Record<string, never>;
  agent_start: { agent: SpecialistId; label: string };  // D-04 진행 스텝퍼 (ww-bot tool_start 확장)
  agent_end:   { agent: SpecialistId };                  // D-04
  stock_card:  { code:string; name:string; price:number; changeRate:number };  // D-07 미니 종목카드
  chart:       { code:string };                          // D-10 미니 일봉차트 트리거 (데이터는 웹앱이 Supabase 직접조회)
  citation:    { title:string; source?:string; url:string; kind:"news"|"web" }; // D-08
  response_complete: Record<string, never>;
  error: { error?: string; message?: string };
  done: Record<string, never>;
}
```

### Anti-Patterns to Avoid
- **DB 히스토리를 sanitize 없이 팀장에 주입** — tool_use/tool_result 페어 깨지면 Claude API 400. 복원 후 반드시 `sanitizeMessages()`.
- **SSE 헤더 쓴 뒤 JWT/검증 실패로 상태코드 변경 시도** — 불가능. 검증은 헤더 전에.
- **전문가 내부에 중첩 tool-use 루프** — 팀장 turn × 전문가 turn 곱연산으로 지연/토큰 폭증. 데이터 전문가는 결정적 선조회 주입.
- **apiFetch 로 SSE 호출** — 8s 타임아웃에 스트림이 끊김. raw fetch + getReader.
- **웹서치 전문가 남용** — $10/1,000회. 팀장 프롬프트에 "DB 로 답할 수 있으면 웹서치 tool 호출 금지" 명시(D-12).
- **assistant 답변에서 종목 가격/수치 환각** — Phase 13/ww-bot 원칙: 수치·뉴스제목·URL 은 tool 결과 verbatim 만. 시스템 프롬프트에 "제공된 데이터에 없는 수치는 지어내지 말 것" 명시(D-08).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE 이벤트 파싱 | 커스텀 스트림 파서 | somi-chat-core `parseSSEStream` 포팅 | TextDecoder stream 경계·버퍼 flush 처리 검증됨 |
| tool_use/tool_result 무결성 | 수동 페어 체크 | ww-bot `sanitizeMessages` 이식 | 고아 tool_result 제거·합성 tool_result 삽입·연속 role 병합 전부 처리 |
| 429/529 재시도 | 커스텀 backoff | ww-bot `isRetryableError`+retry | overloaded_error/rate_limit_error 스트림 이벤트까지 커버 |
| JWT 검증 | jose/jsonwebtoken 직접 | `supabase.auth.getUser(jwt)` | Supabase 서명키·만료·revoke 처리 내장. 신규 의존성 0 |
| 히스토리 윈도잉 | 단순 slice | ww-bot `pruneHistory` | tool 페어 경계 안 자르고 첫 메시지 user 보장 |
| 마크다운→HTML | 라이트 정규식 변환 | react-markdown + remark-gfm | 표/코드/중첩리스트 안전 렌더 + XSS 방어(D-09) |
| 세션 interrupt | 플래그 변수 | ww-bot AbortController + `AbortSignal.any` | close/새요청/타임아웃 3경로 동시 취소 |
| 미니 일봉차트 | 신규 차트 코드 | Phase 09.2 lightweight-charts + chart-colors.ts | oklch 거부 lesson 이미 해결됨(D-10) |
| Anthropic client 생성 | 매 요청 new | discussion-classify lazy 싱글톤 패턴 | 프로세스당 1회 |

**Key insight:** 이 phase 의 위험은 새 알고리즘이 아니라 **이식 누락**이다. ww-bot 이 프로덕션에서 겪은 엣지케이스(고아 tool_result, 연속 role, overloaded retry, close race)가 전부 코드에 박제돼 있으므로 재발명하지 말고 그대로 옮길 것.

---

## Common Pitfalls

### Pitfall 1: Haiku 4.5 의 web_search 서버 tool 미지원 가능성
**What goes wrong:** 웹서치 전문가를 Haiku 로 만들었는데 `web_search` tool 이 Haiku 4.5 에서 미지원이면 400/무시.
**Why:** 공식 web-search-tool 문서는 최신 `web_search_20260318` 지원 모델로 Fable5/Opus4.8/Sonnet5/Sonnet4.6/Opus4.7/4.6 을 나열 — **Haiku 4.5 는 목록에 없음**. 기본 `web_search_20250305` 의 Haiku 지원 여부는 문서에 명시 없음(MEDIUM confidence).
**How to avoid:** `chatWebSearchModel` 을 **별도 config 키**로 분리. Haiku 로 먼저 실측(POC), 400/미동작 시 즉시 Sonnet(`claude-sonnet-4-6`)으로 폴백. CONTEXT 는 "전문가=Haiku" 를 잠갔으나 웹서치 tool 제약은 기술적 예외로 planner 가 discuss-phase 확인 필요(A2).
**Warning signs:** `web_search_tool_result_error` / `stop_reason` 비정상 / 검색 미실행.

### Pitfall 2: Cloud Run 프록시가 SSE 를 버퍼링/타임아웃
**What goes wrong:** 팀장이 전문가 병렬 호출 대기(5~20초) 중 프록시가 연결을 끊거나 응답을 버퍼링해 클라가 아무것도 못 받음.
**How to avoid:** `X-Accel-Buffering: no` + 15s `: keepalive\n\n`(ww-bot 패턴). Cloud Run request timeout(기본 300s)보다 짧은 챗 타임아웃(ww-bot 텍스트 45s) 설정. server min-instances=1 이미 유지(cold start 회피).
**Warning signs:** 로컬 정상·프로덕션만 무응답, 첫 토큰까지 수 초 지연.

### Pitfall 3: 대화 히스토리 복원 시 tool_result 블록 처리
**What goes wrong:** DB 에 팀장의 tool_use/tool_result 원본까지 저장하면 복원 시 페어가 깨져 400. 반대로 렌더 텍스트만 저장하면 팀장이 과거 tool 결과 맥락을 잃음.
**How to avoid:** **권장 — messages 테이블엔 role+content(텍스트)+blocks(부가물)만 저장하고 tool_use/tool_result 원본은 저장하지 않음.** 복원 시 user/assistant 텍스트 턴만 팀장에 주입(각 turn 은 자기 완결적 답변이므로 tool 원본 불요). 이러면 sanitize 부담도 최소. (ww-bot 은 인메모리라 tool 원본을 세션 내 유지했지만, gh-radar 는 영속화 경계에서 텍스트 스냅샷으로 절단.)
**Warning signs:** `messages: at least one message is required` / tool_use id mismatch 400.

### Pitfall 4: 비용 폭증 (멀티에이전트 = LLM 호출 곱연산)
**What goes wrong:** 한 사용자 질문 = 팀장 Sonnet(수 turn) + 전문가 N × Haiku. 프롬프트 캐싱 없으면 Sonnet 대형 시스템 프롬프트가 매 turn 청구.
**How to avoid:** (1) 팀장 system+tools 에 `cache_control: ephemeral`(90% 캐시 절감). (2) 데이터 전문가는 중첩 루프 없이 Haiku 1콜. (3) 웹서치 `max_uses:3` + D-12 팀장 억제 프롬프트. (4) 전문가 `max_tokens` 타이트(≤700). (5) `MAX_TOOL_ROUNDS`/`MAX_HISTORY_MESSAGES` ww-bot 수치 참고. (6) 토큰 usage 로깅(ww-bot `[chat] usage ...` 패턴) — pino 로 Cloud Logging 모니터링. 메모리 lesson `project_claude_haiku_cost_classify` (Claude 사용처·비용 경계 추적) 준수.
**Warning signs:** Anthropic 콘솔 비용 급증, turn 당 input_tokens 수만.

### Pitfall 5: 국내 색상 관례 역전
**What goes wrong:** 미니 종목카드/차트에서 상승=초록·하락=빨강(서구식)으로 렌더.
**How to avoid:** 상승=빨강(`--up`)·하락=파랑(`--down`) (14-UI-SPEC.md §Color, D-07). 차트는 `chart-colors.ts` 변환 필수(oklch 직접주입 금지, `feedback_lightweight_charts_oklch`).

### Pitfall 6: 면책·투자자문 경계
**What goes wrong:** "이 종목 사라/팔아라" 식 직접 매매 권유 → 법적 리스크(REQUIREMENTS Out of Scope "AI 자동매매 추천").
**How to avoid:** 시스템 프롬프트에 "특정 종목 매수/매도 지시 금지, 데이터 기반 관점만" + 상시 면책 문구(14-UI-SPEC Copywriting `※ 투자 참고용, 투자자문 아님`).

### Pitfall 7: 웹서치 citation 다국어/한국 소스
**What goes wrong:** 장중 한국 공시/속보를 영어권 소스로만 검색.
**How to avoid:** `user_location: { country:"KR", timezone:"Asia/Seoul" }` + 웹서치 전문가 프롬프트 한국어 질의 유도. citations 는 D-08 대로 verbatim 표시.

---

## Code Examples

### 팀장 tool-use 루프 골격 (ww-bot chat-service.ts 이식 → 전문가 tool)
```typescript
// Source: ../weekly-wine-bot/server/src/services/chat-service.ts (검증 원본)
for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
  const stream = lead.messages.stream({
    model: cfg.chatLeadModel,                 // "claude-sonnet-4-6" (A1)
    max_tokens: 4096,
    system: [{ type:"text", text: LEAD_PROMPT, cache_control:{type:"ephemeral"} }],
    tools: SPECIALIST_TOOLS.map((t,i)=> i===SPECIALIST_TOOLS.length-1 ? {...t, cache_control:{type:"ephemeral"}} : t),
    messages: workingMessages,
  }, { signal: effectiveSignal });

  for await (const event of stream) {
    if (event.type==="content_block_delta" && event.delta.type==="text_delta" && !hasToolUse) {
      sendSSE(res, "text", { text: event.delta.text });
      emitInlineStockCards(textBuffer);        // D-07 (ww-bot emitInlineWines 대응)
    }
  }
  const finalMessage = await stream.finalMessage();
  workingMessages.push({ role:"assistant", content: finalMessage.content });

  if (finalMessage.stop_reason === "tool_use") {
    const calls = finalMessage.content.filter(b=>b.type==="tool_use");
    // 선택적 병렬 호출 — 팀장이 고른 전문가들 동시 실행 (D-04)
    const results = await Promise.all(calls.map(async (b) => {
      sendSSE(res, "agent_start", { agent: b.name, label: SPECIALIST_LABEL[b.name] });
      const out = await runSpecialist(b.name, b.input, supabase);   // Pattern 2
      sendSSE(res, "agent_end", { agent: b.name });
      return { type:"tool_result" as const, tool_use_id: b.id, content: out };
    }));
    workingMessages.push({ role:"user", content: results });
  } else break;   // end_turn — 팀장 종합 답변 완료 (D-05)
}
```

### SSE 라우트 + JWT (ww-bot chat.ts 이식 + require-auth)
```typescript
// Source: ../weekly-wine-bot/server/src/routes/chat.ts (SSE 헤더/keepalive/done 보장 이식)
router.post("/", chatRateLimit, requireAuth(), async (req, res) => {
  const userId = (req as any).userId;
  const { conversationId, message, stockCode } = req.body;   // zod 검증
  const clientAbort = new AbortController();
  req.on("close", () => clientAbort.abort());
  res.writeHead(200, { "Content-Type":"text/event-stream", "Cache-Control":"no-cache",
    Connection:"keep-alive", "X-Accel-Buffering":"no" });
  const keepalive = setInterval(()=>{ if(!res.writableEnded) res.write(": keepalive\n\n"); }, 15_000);
  try {
    await handleChatStream(res, clientAbort.signal, { userId, conversationId, message, stockCode });
  } finally {
    clearInterval(keepalive);
    if (!res.writableEnded) { res.write(`event: done\ndata: {}\n\n`); res.end(); }
  }
});
```

### 클라 SSE 소비 (apiFetch 불가 → raw fetch)
```typescript
// Source: ../weekly-wine-bot packages/somi-chat-core/src/sse-parser.ts 포팅
const { data:{ session } } = await createClient().auth.getSession();
const resp = await fetch(`${BASE}/api/chat`, {
  method:"POST",
  headers:{ "Content-Type":"application/json", Authorization:`Bearer ${session!.access_token}` },
  body: JSON.stringify({ conversationId, message, stockCode }),
  signal: abortController.signal,        // D-06 중단
});
await parseSSEStream(resp.body!.getReader(), (event, data) => { /* switch: text/agent_start/stock_card/... */ });
```

### 전문가 tool 데이터 소스 매핑 (gh-radar 테이블)
| 전문가 | 주요 테이블 | 조립 재사용 |
|--------|-----------|-------------|
| ①시세·수급 | `stock_quotes`(price/change_rate/trade_amount/market_cap/upper_limit), `stock_daily_ohlcv`(최근 N일 OHLCV) | `lib/quoteJoin.ts`, `mappers/stock.ts` |
| ②테마 | `themes`(top3_avg_change_rate), `theme_stocks`(effective_to IS NULL), `theme_comovement`/`cosurge_edges`(동조 후보) | `lib/computeTop3.ts`, `mappers/theme.ts`, `mappers/comovement.ts` |
| ③뉴스·심리 | `news_articles`(title/source/url/published_at — verbatim D-08), `discussions`(relevance != 'noise' 필터) | `mappers/news.ts`, `mappers/discussions.ts` |
| ④상한가 패턴 | `limit_up_stock_stats`(win_rate/avg_open_ret/히스토그램), `limit_up_events`(next_open_ret/is_jeomsang), `limit_up_theme_stats`, `home_theme_snapshots`(오늘 주도 테마) | `mappers/limitUp.ts`, `mappers/home.ts` |
| ⑤실시간 웹서치 | (DB 아님) Anthropic `web_search` 서버 tool | — |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ww-bot 단일 에이전트(Haiku) | 팀장(Sonnet)+전문가(Haiku) orchestrator-workers | 이 phase | 병렬 전문가 + 진행 스텝퍼 UX |
| ww-bot 인메모리 세션 + 클라 sessionStorage | Supabase conversations/messages(로그인 사용자별·종목별) | 이 phase (D-02/03) | 영속 히스토리, 다기기, 위변조 불가 |
| claude-sonnet-4-6 ($3/$15) | claude-sonnet-5 ($3/$15, intro $2/$10 ~2026-08-31) [CITED: platform.claude.com/models] | Sonnet 5 GA | 팀장 모델 선택지 — A1 참조 |
| claude-haiku-4-5 (기 사용) | 동일 — 현행 (`claude-haiku-4-5` alias = `claude-haiku-4-5-20251001`) [CITED: models overview] | — | 전문가 모델 그대로 |
| web_search_20250305 (basic) | web_search_20260318 (dynamic filtering + response_inclusion, code_execution 필요) [CITED: web-search-tool] | — | 이 phase 는 basic 로 충분(코드실행 불요) |

**Deprecated/outdated:**
- `claude-sonnet-4-6` 는 문서상 **legacy** 로 이동(여전히 사용 가능, $3/$15). 신규는 `claude-sonnet-5` 권장이나 CONTEXT 는 "Sonnet" 만 명시 → config 키로 교체 가능하게(A1).
- somi-chat `textToHtml` 라이트 마크다운 — D-09 로 폐기(react-markdown 채택).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 팀장 모델 = `claude-sonnet-4-6` (또는 최신 `claude-sonnet-5`) — CONTEXT 는 "Sonnet" 만 명시, 정확 ID 미확정 | Standard Stack / Pattern 1 | 낮음 — `chatLeadModel` config 키 1줄 교체. 비용 동일($3/$15). planner/discuss 가 5 vs 4.6 확정 권장 |
| A2 | Haiku 4.5 가 `web_search_20250305` 를 지원하지 않을 수 있음 → 웹서치 전문가는 Sonnet 필요 가능 | Pitfall 1 | 중 — 미지원 시 웹서치만 Sonnet(비용↑). `chatWebSearchModel` 분리 + POC 실측으로 해소 |
| A3 | messages 테이블에 tool_use/tool_result 원본 미저장(텍스트 스냅샷만)이 히스토리 복원에 충분 | Pitfall 3 | 낮음 — 각 turn 자기완결. 만약 팀장이 과거 tool 맥락 필요 시 blocks jsonb 에 요약 저장으로 보강 |
| A4 | 전역 IP rate limit(200/60s)만으로 v1 비용 통제 충분 (D-11) | User Constraints | 중 — 남용 시 deferred quota 조기 도입. 토큰 로깅으로 조기 감지 |
| A5 | `express.json({limit:"16kb"})` 글로벌 파서가 챗 body(~1,000자)에 충분 — 라우트별 파서 불요 | Pattern 5 | 낮음 — 텍스트 전용, 이미지 없음 |
| A6 | @anthropic-ai/sdk ^0.65.0 이 web_search 서버 tool + stream signal 지원 | Standard Stack | 낮음 — 미지원 시 `pnpm up @anthropic-ai/sdk`. planner 가 확인 |

**A1/A2 는 discuss-phase 또는 planner 가 사용자 확인 후 lock 할 것** (모델 ID·웹서치 모델은 비용·동작에 직접 영향).

## Open Questions (RESOLVED)

> 4개 질문 모두 planning 단계에서 해소됨. 아래 각 항에 확정 결정(plan 참조)을 표기.

1. **팀장 모델 정확 ID (Sonnet 5 vs 4.6)**
   - 아는 것: 둘 다 $3/$15, 둘 다 web_search·prompt caching 지원. Sonnet 5 가 현행 GA, 4.6 은 legacy(사용 가능).
   - 불확실: CONTEXT "Sonnet" 이 특정 버전을 의미하는지.
   - 권장: `chatLeadModel` config 키 default `claude-sonnet-4-6`(기존 discussion-classify 와 세대 정합) 또는 `claude-sonnet-5`. POC 로 답변 품질 비교 후 lock.
   - **RESOLVED:** 14-02 (Plan 02) 가 `chatLeadModel` config 키를 신설(env override 가능)하고, 14-11 (Plan 11) POC 게이트가 답변 품질을 실측해 최종 lock. 코드 상 1줄 교체로 전환 가능하므로 planning 을 막지 않음.

2. **웹서치 전문가 모델 (A2)**
   - 아는 것: web_search 최신 버전 지원 목록에 Haiku 4.5 없음.
   - 불확실: basic `web_search_20250305` 의 Haiku 지원.
   - 권장: `chatWebSearchModel` 별도 키 + POC 실측(Haiku 먼저, 실패 시 Sonnet).
   - **RESOLVED:** 14-02 (Plan 02) 가 `chatWebSearchModel` 을 별도 config 키로 분리하고, 14-11 (Plan 11) POC 게이트가 Haiku→(미지원 시)Sonnet 폴백을 실측 확정. env 폴백으로 무중단 전환.

3. **제목 자동 생성 방식 (Claude's Discretion)**
   - 권장: 첫 user 메시지 앞 30자 truncate(추가 LLM 콜 없이 — 비용 0). 또는 첫 답변 후 Haiku 1콜 요약(비용 소량). v1 은 truncate 권장.
   - **RESOLVED:** 14-03 (Plan 03) 히스토리 저장 로직에서 첫 user 메시지 앞 30자 truncate 로 제목 생성(추가 LLM 콜 없음, 비용 0) 채택.

4. **삭제 UI / 보존 정책**
   - 14-UI-SPEC 은 삭제 다이얼로그(C11 destructive) 정의. 권장: 대화 soft/hard delete(`ON DELETE CASCADE` messages) + 기본 무기한 보존.
   - **RESOLVED:** 14-10 (Plan 10) `/chat` 페이지가 삭제 확인 다이얼로그(destructive)를 구현하고, 14-01 (Plan 01) 스키마가 `ON DELETE CASCADE` 로 messages 연쇄 삭제 + 기본 무기한 보존 채택.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| ANTHROPIC_API_KEY (env/Secret) | 팀장·전문가·웹서치 호출 | ✓ | — | 기존 discussion-classify/theme-sync/home-sync 가 이미 사용. Cloud Run Secret `gh-radar-anthropic-api-key` 바인딩됨 |
| Anthropic web_search (Console 활성화) | 웹서치 전문가 (D-12) | ✗ (확인 필요) | — | **조직 관리자가 Claude Console › Privacy 에서 web search 활성화 필요** [CITED: web-search-tool "administrator must enable"]. 미활성 시 웹서치 전문가 비활성화하고 나머지 4 전문가로 답변 |
| SUPABASE_SERVICE_ROLE_KEY | JWT 검증 + 히스토리 read/write | ✓ | — | 서버 기보유 (app.locals.supabase) |
| @anthropic-ai/sdk | 챗 서비스 | ✓ | ^0.65.0 | 서버 기설치 |
| Supabase Auth (Google OAuth) | 로그인 게이트 (D-01) | ✓ | — | Phase 06.2 완료 (AUTH-02 Google) |

**Missing dependencies with no fallback:** 없음.
**Missing dependencies with fallback:**
- Anthropic web_search 콘솔 활성화 — 미확인. planner 는 배포 전 [BLOCKING] 체크(활성화 or 웹서치 전문가 descope). 나머지 챗은 web_search 없이도 완전 동작.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (서버) | vitest ^4.1.4 (server) |
| Framework (웹앱) | vitest ^2.1.9 + @testing-library/react + Playwright ^1.59.1 (E2E) |
| Config file | server/vitest.config.* · webapp/vitest.config.* · webapp/playwright.config.* |
| Quick run (서버) | `pnpm --filter server test` |
| Quick run (웹앱) | `pnpm --filter webapp test` |
| Full suite | 위 둘 + `pnpm --filter webapp exec playwright test chat.spec` |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| CHAT-01 | `sanitizeMessages` 페어 복구·연속 role 제거 | unit | `pnpm --filter server test chat-service` | ❌ Wave 0 (ww-bot 원본 로직 이식 후 테스트) |
| CHAT-01 | `requireAuth` — 토큰 없음/무효 401, 유효 시 userId | unit | `pnpm --filter server test require-auth` | ❌ Wave 0 (supabase.auth.getUser mock) |
| CHAT-01 | 전문가 선택/병렬 실행 + tool_result 조립 | unit | `pnpm --filter server test chat-orchestrator` | ❌ Wave 0 (Anthropic SDK mock) |
| CHAT-01 | conversations/messages RLS — 타인 대화 차단 | integration | Supabase 로컬 or RLS 단위 SQL 검증 | ❌ Wave 0 |
| CHAT-01 | `parseSSEStream` 이벤트 파싱 (text/agent/stock_card) | unit | `pnpm --filter webapp test chat-sse` | ❌ Wave 0 (포팅 원본 sse-parser 테스트 참고) |
| CHAT-01 | FAB 로그인 게이트 + 종목 컨텍스트 감지 | component | `pnpm --filter webapp test chat-fab` | ❌ Wave 0 |
| CHAT-01 | 전체 대화 플로우(로그인→질문→스트리밍→히스토리) | e2e | `playwright test chat.spec` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** 해당 패키지 quick run (`pnpm --filter <pkg> test`)
- **Per wave merge:** 서버+웹앱 full unit + typecheck/build
- **Phase gate:** unit 전부 green + Playwright chat E2E green + 프로덕션 smoke(POST /api/chat SSE 첫 토큰 수신, 401 미인증) 후 `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `server/src/services/__tests__/chat-service.test.ts` — sanitize/prune/retry (ww-bot 원본 테스트 이식 가능)
- [ ] `server/src/middleware/__tests__/require-auth.test.ts` — JWT mock
- [ ] `server/src/services/__tests__/chat-orchestrator.test.ts` — 전문가 선택/병렬 (SDK mock)
- [ ] `webapp/src/lib/__tests__/chat-sse.test.ts` — SSE 파서
- [ ] `webapp/e2e/chat.spec.ts` — 로그인 게이트 + 스트리밍 (Playwright, PORT=3100 dev.sh 기준)
- [ ] Anthropic SDK mock 픽스처 (streaming events + tool_use finalMessage) — 공유 conftest 성 유틸
- 프레임워크 설치: 불요(vitest/Playwright 전부 기설치)

## Security Domain

`security_enforcement` 키가 config.json 에 없음 → 활성으로 간주(absent = enabled).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `supabase.auth.getUser(jwt)` 서버 검증 (D-02). 신규 인증 로직 자체 구현 금지 |
| V3 Session Management | yes | Supabase access token(JWT) — 서버는 stateless 검증만. 인메모리 세션은 진행 중 요청 가드용(민감정보 없음) |
| V4 Access Control | yes | conversations/messages RLS `TO authenticated` + `auth.uid()=user_id`. 서버 경로는 `WHERE user_id=req.userId` 명시 필터(RLS 는 defense-in-depth) |
| V5 Input Validation | yes | zod — POST body(message ≤1,000자, conversationId uuid, stockCode 정규식). 기존 schemas/* 패턴 |
| V6 Cryptography | no | 자체 암호화 없음 — JWT 검증은 Supabase 위임 |
| V7 Error Handling & Logging | yes | 에러 envelope `{error:{code,message}}` — error.message 원문 미노출(Phase 09.2/13 lesson). pino redact 에 ANTHROPIC_API_KEY 이미 포함 |

### Known Threat Patterns for {Express SSE + Supabase + Anthropic}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 타 사용자 대화 열람/조작 (IDOR) | Information Disclosure / Tampering | conversationId 소유권 검증(`WHERE user_id`) + RLS EXISTS. 서버가 응답 전 owner 확인 |
| JWT 위조/만료 토큰 | Spoofing | `auth.getUser` 서명·만료 검증. 실패 시 401 (SSE 헤더 전) |
| 프롬프트 인젝션(사용자 → 시스템 프롬프트 탈취/매매지시 유도) | Tampering / Elevation | 시스템 프롬프트에 역할 경계·매매지시 금지 명시. 전문가 tool 결과는 verbatim, 사용자 입력이 tool 인자 오염 못하게 zod 검증 |
| 비용 남용(무한 질문/웹서치 스팸) | DoS(비용) | IP rate limit + 라우트 rate limit + web_search max_uses:3 + MAX_TOOL_ROUNDS + 토큰 로깅. kill-switch env(`CHAT_DISABLED`) ww-bot 패턴 |
| 환각 수치/뉴스 → 잘못된 투자판단 | (신뢰성) | 수치·뉴스제목·URL tool 결과 verbatim 강제(D-08). 면책 문구 상시 |
| PII/토큰 로그 유출 | Information Disclosure | pino redact(ANTHROPIC_API_KEY 기포함) + JWT/Authorization 헤더 redact 추가. 대화 본문 로그 미기록 |
| SSE 응답 스머글링/버퍼 | — | `X-Accel-Buffering:no`, helmet 기적용, CORS allow-list(cors-config) |

## Sources

### Primary (HIGH confidence)
- `../weekly-wine-bot/server/src/services/chat-service.ts` — 세션/interrupt/sanitizeMessages/pruneHistory/retry/tool-use 루프/프롬프트 캐싱 (이식 기준 원본)
- `../weekly-wine-bot/server/src/routes/chat.ts` — SSE 헤더/15s keepalive/close→abort/done 보장/route rate limit/CHAT_DISABLED
- `../weekly-wine-bot/server/src/services/chat-tools.ts` — Anthropic.Tool[] 정의 + executeTool 패턴
- `../weekly-wine-bot/packages/somi-chat-core/src/{types,sse-parser,session}.ts` — SSEEventMap 계약 + parseSSEStream + SessionManager
- `../weekly-wine-cafe24/skin34/layout/basic/js/somi-chat.js` — FAB+시트 상태머신, SSE→UI 매핑, 중단 처리 (React 포팅 원본)
- gh-radar: `server/src/{app,config,errors}.ts`, `middleware/rate-limit.ts`, `services/discussion-classify.ts`(Anthropic lazy 싱글톤), `routes/home.ts`(app.locals+에러위임 패턴)
- gh-radar: `webapp/src/lib/{auth-context.tsx,api.ts,supabase/client.ts}`, `components/layout/app-sidebar.tsx`, `app/layout.tsx`
- gh-radar 스키마: `supabase/migrations/20260416120000_watchlists.sql`(RLS 4정책), `20260701123000_home_theme_snapshots.sql`(RLS lesson), `20260628120000_limit_up_tables.sql`, `20260609120000_theme_tables.sql`, `20260413120000_init_tables.sql`, `20260415120000_split_stocks_master_quotes_movers.sql`
- 14-CONTEXT.md · 14-UI-SPEC.md

### Secondary (MEDIUM confidence — 공식 문서, verified 2026-07-02)
- [CITED] platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool — web_search tool 타입/파라미터/citations/pricing($10/1,000)/streaming/Console 활성화 요건
- [CITED] platform.claude.com/docs/en/about-claude/models/overview — 모델 ID(claude-sonnet-5/claude-sonnet-4-6 legacy/claude-haiku-4-5), 가격
- [CITED] platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference — 서버 tool 버전/타입 목록
- [VERIFIED] npm registry — react-markdown 10.1.0, remark-gfm 4.0.1

### Tertiary (LOW confidence — 검증 필요)
- Haiku 4.5 의 `web_search_20250305` 지원 여부 (A2 — POC 실측 필요)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 대부분 기설치, 신규 2개(react-markdown/remark-gfm) npm 검증
- Architecture (이식 패턴): HIGH — ww-bot 프로덕션 코드 직접 인용 + gh-radar 통합점 실측
- 멀티에이전트 오케스트레이션 형태: MEDIUM-HIGH — agent-as-tool 권장은 근거 명확하나 Claude's Discretion 영역(planner 최종 결정)
- web_search 모델지원: MEDIUM — 공식 문서에 Haiku 4.5 명시 없음(A2)
- Pitfalls: HIGH — ww-bot 실전 엣지케이스 + gh-radar 메모리 lesson 기반

**Research date:** 2026-07-02
**Valid until:** 2026-07-16 (모델 라인업·web_search 버전은 빠르게 변함 — 2주. 이식 패턴/스키마는 안정적)
