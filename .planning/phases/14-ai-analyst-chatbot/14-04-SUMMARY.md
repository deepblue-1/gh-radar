---
phase: 14-ai-analyst-chatbot
plan: 04
subsystem: api
tags: [anthropic, haiku, multi-agent, specialists, web-search, chat, prompts, tdd]

# Dependency graph
requires:
  - phase: 14-ai-analyst-chatbot
    provides: "14-02 shared SpecialistId + config 챗 6키(chatSpecialistModel/chatWebSearchModel/anthropicApiKey) + anthropic-mock 픽스처(makeCreateResponse)"
provides:
  - "LEAD_PROMPT(팀장 Sonnet) + 5 전문가 시스템 프롬프트 상수 (매매지시금지·환각금지·면책·웹서치억제·인젝션방어)"
  - "데이터 전문가 4종(consultQuote/Theme/News/LimitupSpecialist) — 결정적 Supabase 조회 + Haiku 1콜(내부 tool-use 루프 없음)"
  - "웹서치 전문가(consultWebSearchSpecialist) — Anthropic web_search 서버 tool + citations 추출 + graceful error"
  - "getChatAnthropicClient lazy 싱글톤 공용 client + specialistText/SPECIALIST_UNAVAILABLE helpers"
affects: [14-05, 14-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "데이터 전문가 = 결정적 TS 선조회(mappers/lib 재사용) → Haiku messages.create 1콜 → opinion (RESEARCH Pattern 2, Anti-pattern 회피)"
    - "전문가 실패 = throw 대신 SPECIALIST_UNAVAILABLE 안내 텍스트 반환 → 팀장이 partial 답변 구성"
    - "웹서치 = web_search_20250305 서버 tool(max_uses:3, KR location) + web_search_tool_result_error graceful 삼킴"
    - "테스트 seam = anthropic-client 모듈 mock(getChatAnthropicClient → create 스파이), helpers 는 real"

key-files:
  created:
    - server/src/services/chat-prompts.ts
    - server/src/services/specialists/anthropic-client.ts
    - server/src/services/specialists/helpers.ts
    - server/src/services/specialists/quote-specialist.ts
    - server/src/services/specialists/theme-specialist.ts
    - server/src/services/specialists/news-specialist.ts
    - server/src/services/specialists/limitup-specialist.ts
    - server/src/services/specialists/websearch-specialist.ts
    - server/src/services/specialists/__tests__/specialists.test.ts
  modified: []

key-decisions:
  - "전문가 signature 고정 = consult{X}Specialist(supabase, { code?, question }) → Promise<string> (웹서치만 { text, citations })"
  - "anthropic-client 를 별도 공용 모듈로 추출 — discussion-classify 싱글톤 패턴 재사용 + 전문가 테스트가 mock 하는 단일 seam"
  - "code 없는 데이터 전문가 호출은 근거 부재 → SPECIALIST_UNAVAILABLE (환각 방지)"
  - "웹서치 tool 은 basic web_search_20250305 (코드실행 불요), chatWebSearchModel 기본 Haiku + env Sonnet 폴백(RESEARCH A2)"

patterns-established:
  - "전문가 데이터 조립: 기존 라우트 쿼리 패턴(stocks.ts/news.ts/discussions.ts/limitUp.ts) + mappers(mergeMasterAndQuote/mapStats/mapEvent) 재사용"
  - "news 전문가: news_articles verbatim(title/source/url/published_at only) + discussions .or('relevance.is.null,relevance.neq.noise')"

requirements-completed: [CHAT-01]

# Metrics
duration: 8min
completed: 2026-07-02
---

# Phase 14 Plan 04: AI 애널리스트 전문가 에이전트 5종 Summary

**팀장/전문가 시스템 프롬프트 6종 + 데이터 전문가 4종(결정적 Supabase 조회 → Haiku 1콜, 내부 tool-use 루프 없음) + 웹서치 전문가(Anthropic web_search 서버 tool + citations)를 TDD 로 구현한 멀티에이전트 worker 계층**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-02T11:18:24Z
- **Completed:** 2026-07-02T11:27:04Z
- **Tasks:** 3 (Task 1 auto, Task 2 TDD, Task 3 TDD)
- **Files modified:** 9 (9 created)

## Accomplishments

- `chat-prompts.ts` — `LEAD_PROMPT`(팀장 Sonnet, 전문가 선택 호출·단일 종합답변 D-05·웹서치 억제 D-12·환각 금지 D-08·매매지시 금지·면책·프롬프트 인젝션 방어) + 데이터 전문가 4 + 웹서치 프롬프트 + `CHAT_DISCLAIMER`(UI-SPEC 일치).
- 데이터 전문가 4종 — quote/theme/news/limitup. 각각 기존 라우트 쿼리·mappers/lib 를 재사용한 **결정적 선조회** 후 Haiku `messages.create` **1콜**(max_tokens=700). 내부 tool-use 루프 없음(RESEARCH Anti-pattern). `anthropicApiKey`/예외는 graceful 안내 텍스트.
- 웹서치 전문가 — `web_search_20250305` 서버 tool(max_uses:3, KR/Asia-Seoul) 호출 → `{ text, citations }`. `web_search_result_location` citation 을 `{title,url}` dedupe 추출(D-08). `web_search_tool_result_error`/예외는 빈 citations + 안내 텍스트로 삼킴(Pitfall 1, Haiku 미지원 대비).
- `anthropic-client.ts`(lazy 싱글톤 공용 client) + `helpers.ts`(specialistText, SPECIALIST_UNAVAILABLE) — 전문가 공용 유틸 + 테스트 mock seam.
- 유닛테스트 7건 green(데이터 5 + 웹서치 2). 전체 서버 스위트 191/191 무회귀.

## Task Commits

TDD 태스크는 RED(test) → GREEN(feat) 다중 커밋:

1. **Task 1: 팀장 + 5 전문가 시스템 프롬프트** - `e0922dd` (feat)
2. **Task 2: 데이터 전문가 4종** - `6c9ab62` (test, RED) → `3e80677` (feat, GREEN)
3. **Task 3: 웹서치 전문가** - `03e5459` (test, RED) → `0ea5962` (feat, GREEN)

## Files Created/Modified

- `server/src/services/chat-prompts.ts` (신규) - LEAD_PROMPT + 5 전문가 프롬프트 + CHAT_DISCLAIMER
- `server/src/services/specialists/anthropic-client.ts` (신규) - getChatAnthropicClient lazy 싱글톤 + __resetChatClientForTests
- `server/src/services/specialists/helpers.ts` (신규) - specialistText, SPECIALIST_UNAVAILABLE
- `server/src/services/specialists/quote-specialist.ts` (신규) - 시세·수급 (stock_quotes⋈stocks⋈일봉, mergeMasterAndQuote)
- `server/src/services/specialists/theme-specialist.ts` (신규) - 테마 (theme_stocks effective_to IS NULL + themes + theme_comovement)
- `server/src/services/specialists/news-specialist.ts` (신규) - 뉴스·심리 (news_articles verbatim + discussions relevance!=noise)
- `server/src/services/specialists/limitup-specialist.ts` (신규) - 상한가 패턴 (limit_up_stock_stats/events/theme_stats, mapStats/mapEvent)
- `server/src/services/specialists/websearch-specialist.ts` (신규) - web_search tool + citations + graceful
- `server/src/services/specialists/__tests__/specialists.test.ts` (신규) - 7 케이스(데이터 5 + 웹서치 2) + in-memory supabase 호출 로그 mock

## Decisions Made

- **전문가 signature 고정:** 데이터 전문가 `consult{X}Specialist(supabase, { code?, question }) → Promise<string>`, 웹서치만 `{ text, citations }` 반환 (RESEARCH Pattern 2).
- **anthropic-client 공용 모듈 추출:** discussion-classify 의 싱글톤 패턴을 전문가들이 공유하도록 별도 모듈로. 전문가 테스트는 이 단일 모듈만 mock 해 create 스파이 주입.
- **code 없는 데이터 전문가 = 근거 부재 안내:** 종목 컨텍스트 없이 시세/테마/뉴스/상한가 질문은 환각 위험 → SPECIALIST_UNAVAILABLE 반환.
- **웹서치 basic tool:** `web_search_20250305`(코드실행 불요)로 충분. `chatWebSearchModel` 기본 Haiku, POC 미지원 관측 시 env=Sonnet 폴백(RESEARCH A2, 코드 무변경).

## Deviations from Plan

None - plan executed exactly as written.

각 acceptance_criteria 를 grep/typecheck/test 로 검증:
- Task 1: `LEAD_PROMPT`/`투자자문이 아닙니다`/`매수/매도`/`consult_websearch_specialist` 매칭 + `_SPECIALIST_PROMPT` 5개 + tsc exit 0.
- Task 2: 4 전문가 export + `max_tokens: 700` + `noise` 필터 + `tools:` 미존재 + 5 tests green.
- Task 3: `web_search_20250305`/`max_uses: 3`/`country: "KR"`/`citations` 매칭 + 웹서치 2 tests green.

**참고(계획 대비 미세 조정, 스코프 무영향):** anthropic-client 를 helpers 와 분리한 2 유틸 모듈로 구성(플랜은 "공용 유틸로 추출" 재량 명시). theme 전문가의 top3 강도는 themes.top3_avg_change_rate 사전계산값 주입(멤버 시세 재계산 대신 — 결정적·경량). key_links(quoteJoin|computeTop3|mappers) 는 quote 전문가의 mergeMasterAndQuote + limitup 의 mapStats/mapEvent 재사용으로 충족.

## Threat Flags

없음 — 이 plan 은 신규 네트워크 엔드포인트/인증 경로/스키마를 도입하지 않음. web_search 는 threat_model T-14 에 이미 등록된 표면(전문가→Anthropic web_search). 전문가 프롬프트가 T-14-03(인젝션 역할 고정)·T-14-05(환각 verbatim)·T-14-04b(max_tokens≤700·내부루프 없음·max_uses:3) mitigate 를 코드로 구현.

## Issues Encountered

None. 전체 서버 vitest 191/191 green(26 파일). 로그의 503/500 ERROR 는 해당 응답 코드를 assert 하는 기존 테스트의 정상 출력(회귀 아님).

## User Setup Required

None - 외부 서비스 신규 구성 없음(기존 anthropic 키 재사용). **P11 POC 게이트 대기:** Anthropic Console web search 활성화 + Haiku web_search 지원 실측(미지원 시 CHAT_WEBSEARCH_MODEL=claude-sonnet-4-6 env 폴백, 코드 무변경).

## Next Phase Readiness

- 전문가 5종 + 프롬프트 준비 완료 → P05(팀장 오케스트레이터 tool-use 루프)가 SPECIALIST_TOOL_NAMES 로 이 전문가들을 tool 로 노출·호출.
- 웹서치 citations 는 P06 SSE `citation` 이벤트 + messages.blocks(D-08)로 전파될 준비 완료.
- Ready for 14-05.

---
*Phase: 14-ai-analyst-chatbot*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: 9개 created 파일 전부 디스크 존재(chat-prompts + specialists 7 + test)
- FOUND: 5개 task 커밋(e0922dd/6c9ab62/3e80677/03e5459/0ea5962) git log 존재
- 검증: 전문가 유닛 7/7 green, 전체 서버 191/191, tsc exit 0
