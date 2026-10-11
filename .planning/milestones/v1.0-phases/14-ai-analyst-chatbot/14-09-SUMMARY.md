---
phase: 14-ai-analyst-chatbot
plan: 09
subsystem: ui
tags: [chat, markdown, react-markdown, remark-gfm, lightweight-charts, stepper, tdd, sse-render]

# Dependency graph
requires:
  - phase: 14-ai-analyst-chatbot
    provides: "14-08 ChatSheet 셸(FAB/시트/composer + SSE onEvent 배선 위치) + chat-states"
  - phase: 14-ai-analyst-chatbot
    provides: "14-07 streamChat(SSE) + chat-api + ChatProvider + react-markdown/remark-gfm 설치"
  - phase: 14-ai-analyst-chatbot
    provides: "14-02 SpecialistId/SPECIALIST_LABELS/MessageBlock/ChatSSEEventMap 공유 계약"
  - phase: 09.2-stock-detail-daily-chart
    provides: "lightweight-charts 5.2.0 + chart-colors.ts(oklch→hex 팔레트) + fetchDailyOhlcv"
provides:
  - "MessageAssistant — react-markdown + remark-gfm 풀 마크다운(표/리스트/헤딩/강조/코드) + blocks(카드/차트/citation) + 축약 면책. raw HTML 비활성(XSS 방어 T-14-10)"
  - "MessageUser — 우측 --accent 버블(radius 12 12 4 12)"
  - "ChatThread — user/assistant 순서 렌더 + 스트리밍 progressSlot + 자동 스크롤"
  - "AgentProgress — Variant B 세로 스텝퍼(done✓/active●/wait○, SPECIALIST_LABELS 한글, aria-live)"
  - "MiniStockCard — 인라인 종목카드 → /stocks/[code](국내색상 up 빨강/down 파랑)"
  - "Citation — border-left 출처 인용(URL verbatim, news hostname/web search)"
  - "MiniChart — lightweight-charts 재사용 120px 컴팩트 일봉(chart-colors 팔레트, oklch 회피)"
  - "chat-sheet — 최소 텍스트 append → ChatThread 교체 + onEvent 실제 상태 배선(agent/blocks)"
affects: [14-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MessageAssistant 는 react-markdown components map 으로 globals.css 토큰 스타일 주입 — raw HTML rehype 미사용(LLM 마크다운 XSS 차단)"
    - "블록 부가물은 스트리밍 중 로컬 배열 수집 → response_complete 에 확정 메시지로 부착(streaming=true 시 blocks/면책 숨김, Phase 13 shift 최소화)"
    - "AgentProgress status 는 Partial<Record<SpecialistId,'done'|'active'|'wait'>> — 미착수 전문가는 키 부재로 스텝 미표시"
    - "MiniChart 는 chart SSE 의 code 만으로 Supabase 직접조회(fetchDailyOhlcv) — 팀장 답변이 OHLCV 미운반(RESEARCH Pattern 6)"
    - "MiniChart 는 chart-colors.ts sRGB 팔레트 주입 — lightweight-charts 가 oklch 거부(memory lesson feedback_lightweight_charts_oklch)"

key-files:
  created:
    - webapp/src/components/chat/message-assistant.tsx
    - webapp/src/components/chat/message-user.tsx
    - webapp/src/components/chat/chat-thread.tsx
    - webapp/src/components/chat/agent-progress.tsx
    - webapp/src/components/chat/mini-stock-card.tsx
    - webapp/src/components/chat/citation.tsx
    - webapp/src/components/chat/mini-chart.tsx
    - webapp/src/components/chat/__tests__/message-render.test.tsx
  modified:
    - webapp/src/components/chat/chat-sheet.tsx

key-decisions:
  - "MessageAssistant components map 으로 마크다운 요소 스타일링 — Tailwind typography 플러그인 미도입, 채택 목업 클래스 직접 매핑"
  - "블록은 스트리밍 중 로컬 배열에 수집 후 response_complete 에 확정 부착 — 진행 중엔 스텝퍼+텍스트만(D-05 개별의견 미노출 + shift 최소화)"
  - "MiniChart 는 StockDailyChart 를 통째 재사용하지 않고 동일 lightweight-charts+chart-colors 스택으로 mini 축약(볼륨/마커/hover overlay 제거) — 120px 에 맞춘 컴팩트 렌더"
  - "AgentProgress progressSlot 은 ChatThread 렌더 슬롯으로 주입 — thread 는 표시 위치만 소유, 상태는 chat-sheet 관리(관심사 분리)"

patterns-established:
  - "ChatThread progressSlot: 스트리밍 중 스텝퍼를 상위(chat-sheet)에서 주입하는 렌더 슬롯 패턴"
  - "국내색상 배지: changeRate>0 → --up-bg/--up(빨강), <0 → --down-bg/--down(파랑) (T-14-05c mitigate)"

requirements-completed: [CHAT-01]

# Metrics
duration: 9 min
completed: 2026-07-02
---

# Phase 14 Plan 09: 챗 메시지 렌더링 (마크다운·스텝퍼·미니카드·인용·미니차트) Summary

**assistant 답변을 react-markdown+remark-gfm 풀 마크다운(표 포함)으로 렌더하고, 진행 스텝퍼(Variant B)·국내색상 미니 종목카드·출처 인용(URL verbatim)·lightweight-charts 재사용 미니 일봉차트를 SSE 이벤트에 매핑 — P08 시트의 최소 텍스트 append 를 ChatThread+MessageAssistant 로 교체. 8 렌더 테스트 green.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-02T12:17:18Z
- **Completed:** 2026-07-02T12:26:36Z
- **Tasks:** 3 (Task 1·2 TDD)
- **Files:** 9 (8 created, 1 modified)

## Accomplishments

- `MessageAssistant` — `react-markdown` + `remark-gfm`(D-09) 로 content 렌더. components map 으로 표/리스트/헤딩/강조/코드/링크를 globals.css 토큰 스타일로 매핑. AI 아바타(`--primary`) + "팀장 애널리스트" 라벨. raw HTML 비활성(rehype-raw 미사용)으로 LLM 마크다운의 스크립트 주입 차단(T-14-10). blocks 를 본문 아래 렌더: stock_card→MiniStockCard, chart→MiniChart, citation→"근거 뉴스" 그룹. 답변 말미 축약 면책(`※ 본 답변은 투자 참고용이며 투자자문이 아닙니다.`).
- `MessageUser` — 우측 정렬 `--accent` 버블, 비대칭 radius `12 12 4 12`(UI-SPEC C3), whitespace-pre-wrap.
- `ChatThread` — 메시지 배열 순서 렌더 + 스트리밍 중 progressSlot(스텝퍼) + streamingText(streaming=true MessageAssistant, 면책/blocks 숨김) + 하단 앵커 자동 스크롤.
- `AgentProgress` — 채택 Variant B 세로 스텝퍼. `status: Partial<Record<SpecialistId, "done"|"active"|"wait">>`. done ✓(`--up-bg`)/active ●(`--primary`, motion-safe blink)/wait ○(`--muted`). 라벨 = SPECIALIST_LABELS(한글), active 는 `{전문가} 분석 중…` copywriting. `aria-live="polite"`, `prefers-reduced-motion` 존중.
- `MiniStockCard` — `<a href="/stocks/{code}">`, `--card`+border, 종목명 + `.mono` 코드/가격 + 등락 배지. **국내색상**: 상승 `--up`(빨강)/하락 `--down`(파랑) (D-07/Pitfall 5). hover `--muted`.
- `Citation` — border-left 3px + `--muted` 블록. 제목 + 출처 + origin(news=hostname / web=web search). URL verbatim href(D-08, 출처 표기 5원칙 #5).
- `MiniChart` — Phase 09.2 lightweight-charts 5.2.0 + `chart-colors.ts` 팔레트 재사용. 120px 컴팩트 일봉(볼륨/마커/hover 제거). chart SSE 의 code 만으로 `fetchDailyOhlcv` Supabase 직접조회(RESEARCH Pattern 6). **oklch 직접주입 금지** → sRGB hex 팔레트 주입(memory lesson). 국내식 봉색(상승 빨강/하락 파랑).
- `chat-sheet` 배선 교체 — 최소 텍스트 append div → `ChatThread`. onEvent switch 를 실제 상태에 연결: `agent_start`→active/`agent_end`→done(AgentProgress), `stock_card`/`citation`/`chart`→로컬 blocks 배열 수집 → `response_complete` 에 확정 메시지 blocks 부착. agentStatus state 추가(새 대화/완료 시 리셋).

## Task Commits

TDD 태스크(Task 1·2)는 RED(test) → GREEN(feat) 다중 커밋:

1. **Task 1: MessageAssistant(마크다운) + MessageUser + ChatThread** — `768d89b`(test, RED) → `5b2c0c2`(feat, GREEN)
2. **Task 2: AgentProgress(B) + MiniStockCard + Citation** — `0fa0ecb`(test, RED) → `cbe3ece`(feat, GREEN)
3. **Task 3: MiniChart(lightweight-charts 재사용) + 시트 배선 교체** — `b51cfe7`(feat)

## Files Created/Modified

- `webapp/src/components/chat/message-assistant.tsx` (신규) — react-markdown 답변 + blocks 렌더 + 면책
- `webapp/src/components/chat/message-user.tsx` (신규) — 우측 --accent 버블
- `webapp/src/components/chat/chat-thread.tsx` (신규) — thread 컨테이너 + progressSlot + 자동 스크롤
- `webapp/src/components/chat/agent-progress.tsx` (신규) — Variant B 진행 스텝퍼
- `webapp/src/components/chat/mini-stock-card.tsx` (신규) — 국내색상 인라인 종목카드
- `webapp/src/components/chat/citation.tsx` (신규) — 출처 인용(URL verbatim)
- `webapp/src/components/chat/mini-chart.tsx` (신규) — lightweight-charts 재사용 미니 일봉
- `webapp/src/components/chat/__tests__/message-render.test.tsx` (신규) — 8 렌더 테스트
- `webapp/src/components/chat/chat-sheet.tsx` (수정) — ChatThread 교체 + onEvent 실제 상태 배선

## Decisions Made

- **마크다운 스타일링 = components map:** Tailwind typography 플러그인 없이 react-markdown `components` prop 으로 표/th/td/ul/li/h3/strong/code/a 를 globals.css 토큰 클래스에 직접 매핑(채택 목업 기준).
- **블록 확정 타이밍:** 스트리밍 중 로컬 배열(`collectedBlocks`)에 수집 → `response_complete` 시점에 content+blocks 로 확정 메시지 push. 진행 중엔 스텝퍼+부분 텍스트만 노출(streaming=true 가 면책/blocks 숨김) — D-05(개별 의견 미노출) + Phase 13 레이아웃 shift 최소화 교훈.
- **MiniChart = mini 축약 재사용:** StockDailyChart 컴포넌트를 통째 재사용하지 않고 동일 lightweight-charts+chart-colors 스택으로 120px 컴팩트 캔들만 렌더(볼륨/마커/hover overlay/60바 윈도우 제거). D-10 "신규 차트 스택 도입 금지" 를 팔레트·라이브러리 재사용으로 충족.
- **progressSlot 슬롯 주입:** AgentProgress 를 ChatThread 렌더 슬롯으로 상위(chat-sheet)에서 주입 — thread 는 표시 위치만, 상태 관리는 chat-sheet. 관심사 분리.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0.
**Impact on plan:** 계획 의도 100% 구현. Task 1 MessageAssistant 는 블록 렌더를 Task 2·3 에서 증분 배선(TDD 경계 유지) — 계획의 wave 내 task 분할과 일치.

## Issues Encountered

- **nested `webapp/.git` (기존 상태, 무영향):** webapp 디렉터리에 Apr 13 스캐폴드 시점의 stale 중첩 git repo 가 존재하나, GSD 워크플로우의 source of truth 인 루트 repo 가 webapp 전체를 일반 파일로 추적(git ls-files 확인). 본 plan 의 9개 파일 모두 루트 repo 에 커밋 완료, 루트 `git status` clean. 중첩 repo 는 사용/갱신하지 않음.
- 전체 webapp vitest 281 passed/1 skipped(36 파일) 무회귀(신규 8 테스트 포함, 직전 273→281). typecheck exit 0, build 통과.

## Known Stubs

None — 6 렌더 컴포넌트 + thread + 미니차트 모두 실제 데이터/상태에 배선 완료. MiniChart 는 code→Supabase 실조회, blocks/agentStatus 는 SSE 이벤트에 실연결. 통합 검증(실 서버 SSE stock_card/citation/chart 발행)은 서버 wave 배포 후 수행 — 현 plan 은 계약 기반 단위 테스트까지.

## Threat Flags

None — 신규 네트워크 엔드포인트/인증경로/스키마 변경 없음. MessageAssistant 의 LLM 마크다운 렌더(T-14-10)는 react-markdown raw HTML 비활성으로 mitigate. MiniStockCard/MiniChart 국내색상(T-14-05c)은 --up/--down 강제 + chart-colors 변환으로 mitigate.

## User Setup Required

None - 외부 서비스 신규 구성 없음(기존 Supabase 세션 + lightweight-charts/react-markdown 기설치 재사용).

## Next Phase Readiness

- 렌더 컴포넌트 세트(마크다운/스텝퍼/카드/인용/차트) + chat-sheet 배선 완료 → P10(/chat 페이지)이 동일 컴포넌트로 2-col 목록+thread 를 구성.
- 통합 검증(실 서버 SSE)은 서버 wave(P03~P06) 배포 후 수행 — 현 plan 은 계약 기반 단위 테스트까지.

---
*Phase: 14-ai-analyst-chatbot*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: 8개 created 파일 전부 디스크 존재(message-assistant/message-user/chat-thread/agent-progress/mini-stock-card/citation/mini-chart + message-render.test)
- FOUND: 5개 task 커밋(768d89b/5b2c0c2/0fa0ecb/cbe3ece/b51cfe7) git log 존재
- 검증: message-render 8 tests green, 전체 webapp 281 passed/1 skipped, tsc exit 0, build 통과
