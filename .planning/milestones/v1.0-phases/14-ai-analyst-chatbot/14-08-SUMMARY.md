---
phase: 14-ai-analyst-chatbot
plan: 08
subsystem: ui
tags: [chat, fab, sheet, sse, streaming, react, shadcn, tdd]

# Dependency graph
requires:
  - phase: 14-ai-analyst-chatbot
    provides: "14-07 useChat/ChatProvider(open·stockContext) + streamChat(SSE) + listConversations/getConversation(chat-api)"
  - phase: 14-ai-analyst-chatbot
    provides: "14-02 ChatSSEEventMap SSE 계약 + ConversationRow/MessageRow/ChatRole 타입"
provides:
  - "ChatFab — 전역 FAB(로그인 게이트 D-01 + 종목명 라벨 D-03), 우하단 fixed 56px --primary"
  - "ChatSheet — shadcn Sheet 셸: D-03 자동 이어가기(listConversations→getConversation) + SSE 스트리밍(streamChat/onEvent) + 새 대화 초기화 + abort(D-06)"
  - "Composer — textarea auto-grow + 전송/정지 토글 + 면책 상시 + Enter/Shift+Enter"
  - "chat-states — EmptyState/LoginRequiredState/ChatErrorState 3종(UI-SPEC Copywriting verbatim)"
  - "layout 전역 마운트(ChatProvider/ChatFab/ChatSheet) + app-sidebar /chat nav"
affects: [14-09, 14-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "종목명 라벨은 useChat().stockContext 에서 읽는다 — FAB 는 usePathname 미사용(provider 채널이 code+name 둘 다 공급, D-03)"
    - "SSE onEvent 핸들러는 event/data 가 독립 제네릭이라 switch 자동 narrow 불가 → case 별 ChatSSEEventMap[event] 캐스팅"
    - "D-03 자동 이어가기 중복 로드 방지: (open,code) 조합 guard ref, 닫힘 시 리셋"
    - "시트 닫힘(closeChat)은 abort 하지 않음 — abort 는 새 전송/명시 정지만(서버 완료 저장, D-06)"

key-files:
  created:
    - webapp/src/components/chat/chat-fab.tsx
    - webapp/src/components/chat/chat-states.tsx
    - webapp/src/components/chat/chat-sheet.tsx
    - webapp/src/components/chat/composer.tsx
    - webapp/src/components/chat/__tests__/chat-fab.test.tsx
    - webapp/src/components/chat/__tests__/chat-sheet.test.tsx
  modified:
    - webapp/src/components/stock/stock-detail-client.tsx
    - webapp/src/app/layout.tsx
    - webapp/src/components/layout/app-sidebar.tsx

key-decisions:
  - "FAB 로그인 게이트는 로컬 Dialog 로 LoginRequiredState 표시 — 시트를 열지 않아 컴포넌트 테스트 자족(비로그인 시 openChat 미호출)"
  - "FAB 라벨 종목명은 provider stockContext.name 만 사용(usePathname 미도입) — 이미 fetch 한 stock 데이터 재사용, 추가 조회 0"
  - "챗 시트는 side=right(모바일 full-width) — 반응형 bottom 시트는 P09 렌더 확장 시 도입(셸 단계 최소 변경)"
  - "사이드바/FAB/시트 라벨 전면 'AI 애널리스트' 단일화 — ROADMAP 초안 'AI챗봇' 서술 폐기(Warning 해소)"

patterns-established:
  - "chat-states: 상태 박스 3종 공통 StateBox 셸 + Copywriting verbatim, LoginRequiredState 는 클릭 시점에만 supabase createClient(렌더 시 미생성 → 테스트 안전)"
  - "SSE 스트리밍: abortRef(AbortController) + 새 전송 시 이전 자동 abort + assembled 로컬 누적 + response_complete 에 assistant 확정"

requirements-completed: [CHAT-01]

# Metrics
duration: 16min
completed: 2026-07-02
---

# Phase 14 Plan 08: 챗 UI 셸 (FAB + 시트 + composer) Summary

**전역 FAB(로그인 게이트 + 종목명 라벨)·shadcn Sheet 챗 시트(D-03 자동 이어가기 + SSE 스트리밍 + abort)·전송/정지 composer·상태 박스 3종을 layout 에 전역 마운트하고 /chat nav 를 추가 — chat-fab 4 + chat-sheet 4 컴포넌트 테스트 green**

## Performance

- **Duration:** 16 min
- **Completed:** 2026-07-02
- **Tasks:** 3 (Task 1·2 TDD)
- **Files modified:** 9 (6 created, 3 modified)

## Accomplishments

- `ChatFab` — 우하단 fixed 56px `--primary` FAB. 비로그인 클릭 → 로그인 필요 Dialog(D-01, 체험 모드 없음, openChat 미호출), 로그인 → `openChat(stockContext)`. 라벨은 `useChat().stockContext` 로 `AI 애널리스트 · {종목명} 분석` / 없으면 `AI 애널리스트`.
- `stock-detail-client` — `stock` 로드 시 `setStockContext({code, name})` 발행, 언마운트 cleanup 에서 `setStockContext(null)`. 기존 fetch 데이터 재사용(추가 조회 0), useChat provider 밖(기존 단위 테스트)에서는 no-op 로 무회귀.
- `ChatSheet` — shadcn Sheet(side=right 440px) 셸. **D-03 자동 이어가기**: open+stockContext → `listConversations(code)` → 최신 대화 `getConversation(id)` messages 프리로드 + conversationId 세팅, 없으면 빈 상태. 일반(비종목) 챗은 자동 로드 안 함(D-13). guard ref 로 중복 로드 차단.
- **SSE 스트리밍(D-06)**: `streamChat` + onEvent switch(session→conversationId / text→streamingText append / text_clear / response_complete→assistant 확정 / error→에러 상태). `abortRef` 로 새 질문 시 이전 응답 자동 abort. 시트 닫힘은 abort 안 함(서버 완료 저장).
- `Composer` — textarea auto-grow(40→120px) + 전송/정지 토글(aria-label 전송/중단) + 면책 상시(`AI 답변은 참고용이며 투자자문이 아닙니다`) + Enter 전송/Shift+Enter 줄바꿈(IME composing 가드).
- `chat-states` — EmptyState(예시 프롬프트 칩)/LoginRequiredState(Google 로그인)/ChatErrorState(다시 시도), Copywriting verbatim.
- `layout` 전역 마운트(AuthProvider 안쪽 ChatProvider + children 뒤 ChatFab/ChatSheet) + `app-sidebar` `/chat` "AI 애널리스트" nav.

## Task Commits

TDD 태스크(Task 1·2)는 RED(test) → GREEN(feat) 다중 커밋:

1. **Task 1: ChatFab + 상태 박스** - `cddeb2c` (test, RED) → `660530c` (feat, GREEN)
2. **Task 2: ChatSheet + composer** - `30b3fd2` (test, RED) → `9b0f8f6` (feat, GREEN)
3. **Task 3: layout 전역 마운트 + /chat nav** - `16e5376` (feat)

## Files Created/Modified

- `webapp/src/components/chat/chat-fab.tsx` (신규) - 전역 FAB, 로그인 Dialog 게이트 + stockContext 라벨
- `webapp/src/components/chat/chat-states.tsx` (신규) - EmptyState/LoginRequiredState/ChatErrorState
- `webapp/src/components/chat/chat-sheet.tsx` (신규) - Sheet 셸 + D-03 자동 이어가기 + SSE 스트리밍 + abort
- `webapp/src/components/chat/composer.tsx` (신규) - textarea + 전송/정지 토글 + 면책
- `webapp/src/components/chat/__tests__/chat-fab.test.tsx` (신규) - 4 테스트(비로그인/로그인/종목라벨/기본라벨)
- `webapp/src/components/chat/__tests__/chat-sheet.test.tsx` (신규) - 4 테스트(자동이어가기/빈/새대화/일반)
- `webapp/src/components/stock/stock-detail-client.tsx` (수정) - setStockContext 발행/해제 useEffect 1개 추가
- `webapp/src/app/layout.tsx` (수정) - ChatProvider + ChatFab + ChatSheet 전역 마운트
- `webapp/src/components/layout/app-sidebar.tsx` (수정) - /chat "AI 애널리스트" nav + MessageSquare import

## Decisions Made

- **FAB 로그인 게이트 = 로컬 Dialog:** 비로그인 클릭 시 시트를 열지 않고 FAB 자체가 LoginRequiredState 를 Dialog 로 띄운다 — 컴포넌트 테스트가 자족(openChat 미호출 검증) + UX 상 로그인 유도가 명확.
- **FAB 라벨 종목명 출처 = provider only:** usePathname 을 FAB 에 도입하지 않고 `useChat().stockContext.name` 만 사용. 종목상세가 이미 fetch 한 stock 데이터를 provider 로 발행 → 추가 조회 없음(D-03 Warning 해소).
- **SSE onEvent 캐스팅:** event/data 가 독립 제네릭 파라미터라 switch 로 자동 narrow 되지 않아 case 별 `data as ChatSSEEventMap[event]` 명시 캐스팅(SSE 계약 P02 기준).
- **라벨 단일화:** FAB/시트/사이드바 전 표면을 "AI 애널리스트" 로 통일(ROADMAP 초안 "AI챗봇" 폐기).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SSE onEvent switch TypeScript narrow 실패 → case 별 캐스팅**
- **Found during:** Task 2 (chat-sheet typecheck)
- **Issue:** `ChatSSEEventHandler` 는 `<T>(event:T, data:ChatSSEEventMap[T])` 독립 제네릭이라 `switch(event)` 가 `data` 를 narrow 하지 못해 `data.conversationId`/`data.text` 접근이 TS2339.
- **Fix:** 각 case 에서 `(data as ChatSSEEventMap["session"]).conversationId` 형태로 명시 캐스팅 + `ChatSSEEventMap` 타입 import.
- **Files modified:** webapp/src/components/chat/chat-sheet.tsx
- **Verification:** `tsc --noEmit` exit 0, chat-sheet 4 테스트 green
- **Committed in:** 9b0f8f6 (Task 2 GREEN 커밋)

**2. [Rule 2 - Missing Critical] Dialog/Sheet a11y Description 누락 경고 해소**
- **Found during:** Task 1·2 (테스트 stderr Warning)
- **Issue:** Radix Dialog/Sheet Content 가 `Description`/`aria-describedby` 없으면 접근성 경고 — 스크린리더 컨텍스트 부재.
- **Fix:** FAB 로그인 Dialog 에 sr-only DialogTitle+DialogDescription, ChatSheet 에 sr-only SheetDescription 추가.
- **Files modified:** webapp/src/components/chat/chat-fab.tsx, chat-sheet.tsx
- **Verification:** 테스트 stderr 경고 소거, 8 테스트 green
- **Committed in:** 660530c / 9b0f8f6

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** 계획 의도 100% 보존. 스코프 확장 없음 — 타입 안전성 + 접근성 보강.

## Issues Encountered

- 전체 webapp vitest 273 passed/1 skipped(35 파일) 무회귀(신규 8 테스트 포함, 직전 265→273). 콘솔의 `fetch failed`(StockComovement/LimitUp) 로그는 타 테스트의 의도된 에러 경로 mock 로그이며 실패 아님(P07 summary 와 동일).
- lint 경고 1건(theme-detail-client `ScannerEmpty` 미사용)은 본 plan 무관 pre-existing — SCOPE BOUNDARY, 미수정.

## Known Stubs

- **P09 렌더 훅 위임(계획된 placeholder):** onEvent switch 의 `agent_start/agent_end/stock_card/citation/chart` 는 현 plan 에서 무처리(default) — 진행 스텝퍼/미니 종목카드/출처/차트 렌더는 P09 담당(objective 명시). thread 는 텍스트 append 수준. 스텁 아닌 계획된 wave 분할.
- **/chat nav 대상 페이지 미존재:** 사이드바 /chat 링크는 추가됐으나 페이지는 P10 이 생성 — 클릭 시 P10 전까지 404. 계획대로(nav 배선만 이 plan).
- **모바일 하단 시트 미도입:** 시트는 side=right(모바일 full-width). UI-SPEC 의 mobile bottom 85dvh 는 P09 렌더 확장 시 도입 예정(셸 단계 최소 변경).

## User Setup Required

None - 외부 서비스 신규 구성 없음(기존 Supabase 세션 재사용).

## Next Phase Readiness

- FAB+시트+composer 셸 + SSE 배선 완료 → P09(메시지 렌더: 마크다운/진행스텝퍼/미니카드/출처/차트)가 onEvent 렌더 훅과 thread 를 채운다.
- P10(/chat 페이지)이 대화 목록/종목 필터 + 사이드바 링크 대상 페이지를 구현.
- 통합 검증(실 서버 SSE)은 서버 wave(P03~P06) 배포 후 수행 — 현 plan 은 계약 기반 단위 테스트까지.

---
*Phase: 14-ai-analyst-chatbot*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: 6개 created 파일 전부 디스크 존재(chat-fab/chat-states/chat-sheet/composer + 2 테스트)
- FOUND: 5개 task 커밋(cddeb2c/660530c/30b3fd2/9b0f8f6/16e5376) git log 존재
- 검증: chat-fab 4 + chat-sheet 4 green, 전체 webapp 273 passed/1 skipped, tsc exit 0, build 통과, lint exit 0
