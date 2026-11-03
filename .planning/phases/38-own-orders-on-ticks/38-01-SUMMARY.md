---
phase: 38-own-orders-on-ticks
plan: 01
subsystem: ticks
tags: [supabase, rpc, pgtap, express, react, tick-viewer, matching]

requires:
  - phase: 37-tick-viewer
    provides: "tick_open_for_user 게이트 꼴 · TickSession(A3Columns · TickIndex) · 전문 목록 TickMsgList · server ticks 라우트/서비스 · tick-api 계약"
provides:
  - "RPC tick_own_for_user(p_user_id, p_date, p_isin, p_ex) → jsonb {access, date, exchange, isin, servers, fills, events, orders} + 부분 인덱스 2"
  - "pgTAP 스모크 supabase/tests/tick_own.test.sql (9 단언)"
  - "shared 계약 TickOwnFill · TickOwnEvent · TickOwnOrder · TickOwnResponse"
  - "shared matchOwnFills · a3TimeMs · OWN_MATCH_DT_MIN_MS(-200) · OWN_MATCH_DT_MAX_MS(1500) · OWN_MATCH_EST_MS(20) · OwnFillIn · OwnFillMatch"
  - "server getTickOwn · GET /api/ticks/own (no-store · 캐시 없음)"
  - "webapp fetchTickOwn · useTickOwn · buildOwnModel · OwnModel · OwnFillView · ownChipOf"
  - "전문 목록 data-own=\"1\" 행 · data-slot tick-own-chip · tick-own-est"
  - "CSS 토큰 --mine · --mine-bg · --mine-fg (라이트 · 다크)"
affects: [38-02, 38-03, 38-04, 38-05, 38-06, 38-07, 38-08, 38-09, 38-10]

actuals:
  tokens: 14536
  tasks: 1
  commits: 1
plan_head_before: 6f3718927b554d47f84e882a652064a9d0e08e5c
plan_head_after: 3432b157709df4def4313cdfea0444b005a02923

tech-stack:
  added: []
  patterns:
    - "우리 체결 짝짓기는 브라우저 shared 순수 함수(typed array · 시각 순열 + 이분 탐색 창) — server 는 저널 행만"
    - "own 조회 실패(동기 throw 포함)는 우리 층만 비우고 콘솔 경고 한 줄 — 화면 오류 없음"
    - "own 모델은 세션 밖 useMemo([session, own]) — TickSession 에 넣지 않는다"

key-files:
  created:
    - supabase/migrations/20261104100000_tick_own_for_user.sql
    - supabase/tests/tick_own.test.sql
    - packages/shared/src/ticks/own-fills.ts
    - webapp/src/lib/ticks/use-tick-own.ts
    - webapp/src/lib/ticks/own-model.ts
  modified:
    - packages/shared/src/tick-api.ts
    - packages/shared/src/ticks/index.ts
    - server/src/services/ticks.ts
    - server/src/routes/ticks.ts
    - webapp/src/lib/ticks/tick-api.ts
    - webapp/src/components/ticks/tick-viewer.tsx
    - webapp/src/components/ticks/tick-msg-list.tsx
    - webapp/src/components/ticks/__tests__/tick-msg-list.test.tsx
    - webapp/src/styles/globals.css

key-decisions:
  - "어드민 판정은 RPC 안 dma_app_access_map() role 조회 — 분기용 boolean 인자 없음(인자 4개 고정 · 클라 입력으로 전 계좌를 켤 길 0)"
  - "가시 계좌 키 배열(gateway|account_no)을 함수에서 한 번 만들어 fills · events · orders 세 배열이 같이 쓴다 · 세 배열 모두 dma_servers.enabled 조인"
  - "전문 목록 행 바탕 우선순위 = 선택 > 우리(--mine 6%) > 같은 주문 띠(--team 8%) — 목업 B CSS(tr.ours 가 tr.runb 뒤 · tr.ours.sel 은 선택색)와 같다"
  - "useTickOwn 은 fetchTickOwn 을 Promise 안에서 부르고 응답 모양(fills · servers 배열)을 확인한다 — 동기 throw · 이상 응답도 '실패 = 우리 층 없음' 경로로"
  - "buildOwnModel 은 계획대로 (gw_time_ms, gateway, seq) 안정 정렬 뒤 matchOwnFills 에 넘긴다"

patterns-established:
  - "matchOwnFills(index, a3, fills): 입력 순서 그대로 처리 · 후보 (|dt|, j) 사전순 첫째 · 둘째만 추적 · 창 경계는 1ms 넓게 훑고 dt 를 정확히 다시 잰다"
  - "MsgRow 에는 own 칩을 원시값(ownOur · ownTotal · ownEst)으로 넘겨 memo 를 유지한다"

requirements-completed: []

coverage:
  - id: D1
    description: "RPC tick_own_for_user — 권한(service_role 만) · 게이트 {access:false} · 가시 계좌만 · 꺼진 KB121 제외 · servers 켜진 키 순 · dma_user_id 비반환"
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_own.test.sql (1..9 ok · RESULT: PASS)"
        status: pass
    human_judgment: false
  - id: D2
    description: "server GET /api/ticks/own → getTickOwn(RPC 1회 · 모양 검사) — 기존 ticks 라우트 회귀 0"
    verification:
      - kind: integration
        ref: "pnpm --filter @gh-radar/server exec vitest run tests/routes/ticks.test.ts --maxWorkers=2 (24 passed)"
        status: pass
    human_judgment: true
    rationale: "/own 전용 supertest(인자 4개 · 403 · 500 · 401)는 계획상 38-03 몫 — 이 플랜에선 typecheck 와 기존 회귀만 확인했다"
  - id: D3
    description: "shared matchOwnFills 로 짝지은 우리 체결이 전문 목록 A3 행에 민트 바탕 + 「300/1,064」 · 「500」 · 「추정」 칩으로 보이고 own null 이면 DOM 무변화"
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/tick-msg-list.test.tsx#TickMsgList — 우리 체결 칩(Phase 38)"
        status: pass
    human_judgment: false
  - id: D4
    description: "뷰어 결선 — 열 때 useTickOwn 1회 · 실패해도 뷰어 그대로(콘솔 경고만)"
    verification:
      - kind: unit
        ref: "webapp tick-viewer-live.test.tsx · tick-state-card.test.tsx · use-tick-grid.test.tsx (43 passed · '[tick-own]' 경고만)"
        status: pass
    human_judgment: true
    rationale: "실제 과거 종목 화면에서 칩 위치 · 색 대비(--mine-fg) 확인은 사람 눈 — e2e 는 38-09 · 배포 UAT 는 38-10"
  - id: D5
    description: "CSS 토큰 --mine #0f9d8a/#2fd3bb · --mine-bg #e3f7f3/rgba(47,211,187,0.16) · --mine-fg #0b7d6e/#2fd3bb"
    verification: []
    human_judgment: true
    rationale: "시각 대비는 화면에서 확인 — 값은 grep 수용 기준으로만 잠금"

duration: 9min
completed: 2026-11-03
status: complete
---

# Phase 38 Plan 01: 우리 체결 트레이서 Summary

**RPC `tick_own_for_user`(가시 계좌 · 어드민 role · 켜진 서버 · jsonb 1회) → `GET /api/ticks/own` → `useTickOwn` → shared `matchOwnFills`(창 −200~+1500ms · 추정 20ms · 남은 수량 차감) → 전문 목록 우리 체결 A3 행 민트 바탕 + 「300/1,064」 칩까지 한 경로를 끝에서 끝까지 꿰었다.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-11-03T05:50:13Z
- **Completed:** 2026-11-03T05:59:33Z
- **Tasks:** 1 (tracer)
- **Files modified:** 14 (새 5 · 수정 9)

## Accomplishments
- DB: `tick_own_for_user(uuid, text, text, text) RETURNS jsonb` — 게이트(`dma_visible_accounts` 0행 → `{access:false}`) · 어드민 = `dma_app_access_map()` role · fills(E ∧ exec_qty>0 · gw_time_ms 절사 · (gw_time, gateway, seq) 정렬) · events(kind 3·6 ∧ order_no) · orders(N · 체결 있음 · created_ms) · servers(enabled · sort_order) 를 jsonb 한 장으로. 세 배열 모두 `JOIN dma_servers s ON … AND s.enabled`. REVOKE PUBLIC/anon/authenticated · GRANT service_role · 부분 인덱스 `idx_dma_journal_events_fill_isin_day` · `idx_dma_strategy_events_order_isin_day`.
- pgTAP 스모크 9개 전부 ok — 권한 · 게이트 · U1 은 자기 KB120 1행만 · KB121(가시성 뷰엔 걸림) 제외 · servers `["KB120","KYOBO119"]` · `$.**.dma_user_id` 없음.
- shared: 계약 4형 + `matchOwnFills`(A3 시각 Float64Array + 시각 순열 Int32Array 를 호출당 한 번 · 체결마다 이분 탐색 창) · `a3TimeMs` · 창 상수 3.
- server: `getTickOwn`(RPC 1회 → `gate()` → 배열 4개 모양 검사) · `GET /api/ticks/own`(requireAuth · TickOpenQuery · no-store).
- webapp: `fetchTickOwn` · `useTickOwn`(키 · refreshKey 변경 때만 1회 · 늦은 응답 버림 · 실패 = null + 콘솔 경고) · `buildOwnModel` · `ownChipOf` · 뷰어 `PaneCtx.own` → `TickMsgList own=` · 행 `data-own="1"` + `tick-own-chip` · `tick-own-est` · 토큰 3.

## Task Commits

1. **Task 1 (tracer): 과거 종목 열기 → RPC → /api/ticks/own → matchOwnFills → 전문 목록 칩** — `3432b157` (feat)

**Plan metadata:** 이 SUMMARY 커밋(docs)

## Files Created/Modified
- `supabase/migrations/20261104100000_tick_own_for_user.sql` — RPC + 인덱스 2 · 머리 주석(반환 모양 · 규칙 · 롤백)
- `supabase/tests/tick_own.test.sql` — pgTAP 스모크 9(38-03 이 전체 행렬로 넓힌다)
- `packages/shared/src/tick-api.ts` — `TickOwnFill` · `TickOwnEvent` · `TickOwnOrder` · `TickOwnResponse`
- `packages/shared/src/ticks/own-fills.ts` — `matchOwnFills` · `a3TimeMs` · 상수
- `packages/shared/src/ticks/index.ts` — 배럴 한 줄
- `server/src/services/ticks.ts` — `getTickOwn` · 방어선 주석 D-01 · D-03
- `server/src/routes/ticks.ts` — `GET /own`
- `webapp/src/lib/ticks/tick-api.ts` — `fetchTickOwn`
- `webapp/src/lib/ticks/use-tick-own.ts` — 조회 훅
- `webapp/src/lib/ticks/own-model.ts` — 짝 모델 · 칩 값
- `webapp/src/components/ticks/tick-viewer.tsx` — 훅 · 모델 결선 · 머리 주석 ④
- `webapp/src/components/ticks/tick-msg-list.tsx` — `own` prop · 행 바탕 · 칩 2종
- `webapp/src/components/ticks/__tests__/tick-msg-list.test.tsx` — 절 「우리 체결 칩(Phase 38)」 3 케이스
- `webapp/src/styles/globals.css` — `--mine` · `--mine-bg` · `--mine-fg`(라이트 · 다크)

## Verification (실행 결과 그대로)
- `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_own.test.sql` — 마이그레이션 98개 재생 · `1..9` 전부 ok · `RESULT: PASS`(로컬 일회용 컨테이너 · 원격 접촉 0)
- `pnpm --filter @gh-radar/shared build` · `run typecheck` — 통과
- `pnpm --filter @gh-radar/server run typecheck` — 통과 · `vitest run tests/routes/ticks.test.ts --maxWorkers=2` — 24 passed
- `pnpm --filter @gh-radar/webapp run typecheck`(앱 + e2e tsconfig) — 통과
- `vitest run tick-msg-list.test.tsx msg-rows.test.ts --maxWorkers=2` — 23 passed(새 3 포함)
- 추가 회귀(계획 밖): `tick-viewer-live.test.tsx` · `tick-state-card.test.tsx` · `use-tick-grid.test.tsx` — 43 passed(목에 `fetchTickOwn` 이 없어 `[tick-own] 0 Error: …` 경고만 찍힘 = 실패 시 뷰어 그대로 확인) · eslint(변경 webapp 6파일) — 경고 0
- 수용 기준 grep 전부 PASS(`s.enabled` 6회 ≥ 3)
- 미실행: e2e(38-09 몫) · 10/30 오라클(38-02 · 38-05 몫) · `/own` 전용 supertest(38-03 몫)
- 트레이서 게이트: auto 아님 · human_verify_mode end-of-phase · `<verify>` 자동만 → 재실행 통과로 체크포인트 없이 완료

## Decisions Made
- 행 바탕 우선순위 선택 > 우리 > 같은 주문 띠 — 목업 B 의 CSS 순서와 같게.
- pgTAP 픽스처에 events · orders 행(dma_user_id 값 있음)도 넣어 단언 9(`$.**.dma_user_id` 없음)가 세 배열 모두를 덮게 했다(단언 수는 계획대로 9).
- 나머지는 frontmatter key-decisions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 견고성] useTickOwn 이 동기 throw · 이상 응답도 「실패」 경로로 흡수**
- **Found during:** Task 1 (뷰어 결선)
- **Issue:** 뷰어를 렌더하는 기존 테스트 3개의 `vi.mock('@/lib/ticks/tick-api')` 목에 `fetchTickOwn` 이 없다. vitest 는 목에 없는 export 접근을 동기 throw 하므로 effect 에서 그대로 부르면 뷰어가 깨진다 — 계획의 「own 조회가 실패해도 뷰어는 지금과 같다」 위반 경로.
- **Fix:** `Promise.resolve().then(() => fetchTickOwn(...))` 로 동기 throw 를 거부로 바꾸고, 응답이 `fills` · `servers` 배열이 아니면 `[tick-own] 0 shape` 경고 후 실패 처리. 기존 테스트 파일은 고치지 않았다(범위 밖).
- **Files modified:** webapp/src/lib/ticks/use-tick-own.ts
- **Verification:** 위 3개 테스트 43 passed(경고 줄만 출력)
- **Committed in:** 3432b157

---

**Total deviations:** 1 auto-fixed (Rule 2 1건)
**Impact on plan:** 계약 · 동작 변화 없음 — 실패 시 「우리 층만 없음」 을 더 넓은 실패 모양까지 지킨다.

## Issues Encountered
- 이 세션의 격리 검사가 heredoc · 복합 git 명령을 막아 파일 생성 · 수정은 Write/Edit 도구로, git 은 단순 명령으로 나눠 실행했다(결과물 영향 없음).
- Prettier `--check` 는 변경 파일 전부에 경고를 내지만 HEAD 원본도 같은 경고라 저장소 규칙이 아니다(설정 파일 없음) — 손으로 들여쓰기만 맞췄다.

## Known Stubs
없음 — `events` · `orders` 는 응답 · 계약에 실려 오지만 이 플랜에선 화면에 쓰지 않는다(주문 줄 · 레일 38-04 · 근거 · 카드 38-05/06 이 쓴다). 칩 경로에는 빈 값 고정이 없다.

## User Setup Required
None — 원격 적용(`supabase db push`) · server 배포는 38-10 메인 세션.

## Next Phase Readiness
- 38-02(10/30 오라클 픽스처 · `A3Columns.cumVolume`)와 38-03(pgTAP 전체 행렬 · `/own` supertest)이 이 계약 · 함수 위에서 바로 진행 가능.
- 주의: RPC 이름 · 인자 4개 · jsonb 키는 계약이다 — 원격 push 전이면 같은 마이그레이션 파일을 고친다.

## Self-Check: PASSED
- 파일 14개 존재 확인 · 커밋 `3432b157` 이 HEAD 조상 · `git show --stat HEAD` = 계획 files_modified 14개만.
