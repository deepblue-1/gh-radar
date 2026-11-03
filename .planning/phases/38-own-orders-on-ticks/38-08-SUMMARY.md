---
phase: 38-own-orders-on-ticks
plan: 08
subsystem: ticks
tags: [react, tick-viewer, header, keyboard, own-orders, live]

requires:
  - phase: 38-07
    provides: "뷰어 rows · ownModel · onOwnSelect · 차트 ◆ 클릭 = jumpToRec"
  - phase: 38-04
    provides: "MsgRowsModel.posOfRec · ownPosOfFill · ownPosOfOrder · ownLineRec · MSG_ITEM.NOFILL"
  - phase: 38-01
    provides: "useTickOwn(q, refreshKey) · fetchTickOwn"
provides:
  - "use-own-nav.ts: ownNavOf(rows, own) · OwnNavState · useOwnNav — k/n · 주문 수 · prev/next · 창 키 [ ]"
  - "use-tick-cursor.ts: isTypingTarget export"
  - "TickHeaderProps.ownNav · data-slot tick-own-nav 알약(이전/다음 우리 체결)"
  - "TickViewerProps.onOwn · ownRefreshKey"
  - "tick-viewer-page: 최신 받기 = live 증분 시작 시에만 ownRefreshKey +1"
  - "use-tick-live: refresh() → boolean(요청 시작 여부)"
affects: [38-09, 38-10]

estimate:
  tokens: 60000
  tasks: 2
actuals:
  tokens: 8400
  tasks: 2
  commits: 5
plan_head_before: 8ce68148a5185f58f3b2dc97d757399267236b9f
plan_head_after: 99d211a4666e7d7b3e72f492bca896f579f9f933

tech-stack:
  added: []
  patterns:
    - "페이지로 올리는 탐색 상태는 원시값(k · n · 주문 수 · 앞뒤 있음)이 바뀔 때만 새 객체 · prev/next 는 최신 값을 ref 로 보는 고정 함수 — onOwn effect 가 렌더마다 돌지 않는다"
    - "뷰어가 올린 상태는 페이지가 열기 키(isin|d|ex)와 함께 들고 파생으로 지운다 · 뷰어 정리(cleanup) 때 null"
    - "사용자 버튼 하나로 두 요청을 묶을 때는 앞 요청 훅이 시작 여부(boolean)를 돌려주고 뒤 요청은 그때만 올린다"

key-files:
  created:
    - webapp/src/lib/ticks/use-own-nav.ts
    - webapp/src/lib/ticks/__tests__/use-own-nav.test.tsx
    - webapp/src/lib/ticks/__tests__/use-tick-own.test.tsx
  modified:
    - webapp/src/lib/ticks/use-tick-cursor.ts
    - webapp/src/lib/ticks/use-tick-live.ts
    - webapp/src/components/ticks/tick-header.tsx
    - webapp/src/components/ticks/tick-viewer.tsx
    - webapp/src/components/ticks/tick-viewer-page.tsx
    - webapp/src/components/ticks/__tests__/tick-viewer-live.test.tsx
    - webapp/src/components/ticks/__tests__/tick-state-card.test.tsx
    - webapp/src/lib/ticks/__tests__/use-tick-grid.test.tsx

key-decisions:
  - "현재 자리 = 고른 짝 없음 줄 또는 주문 줄이 있으면 그 줄 자리 · 아니면 커서 행 — 주문 줄 선택 중 › 는 그 줄 다음 첫 대상(계획은 짝 없음 줄만 언급)"
  - "알약 › 로 A3 대상에 갈 때 뷰어는 고른 줄(ownPick)을 푼다 — 짝 없음 줄의 기준 전문이 곧 다음 대상 행이면 줄 선택이 남아 현재 자리가 줄에 묶이고 › 가 제자리를 맴돈다"
  - "「받는 중이면 둘 다 하지 않는다」 를 live.refreshing 이 아니라 refresh() 반환값으로 판정 — epoch 다시 받는 중(refetching)엔 refreshing 이 false 라 버튼이 눌려도 live 는 거절하는데 own 만 늘 수 있었다"
  - "키 [ ] 는 대상이 있을 때만 preventDefault — own 없음 · 끝이면 이벤트를 그대로 둔다"

patterns-established:
  - "OwnNavState 를 페이지 → TickHeader 로 넘기는 onOwn 꼴(37 onTick 선례와 같음)"

requirements-completed: []

coverage:
  - id: D1
    description: "탐색 대상 = 우리 체결 A3 행 ∪ 짝 없음 줄 · 같은 A3 두 체결 = 한 대상 · 거래소순/수신순 순서가 다르다 · k(처음 앞 0 · 위 · 사이 · 끝) · prev/next 끝 null · 짝 없음 줄 → pickLine(줄, 기준 rec) · own 없음/빈 own → null · 같은 자리 재렌더 = 같은 객체"
    verification:
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/use-own-nav.test.tsx#ownNavOf — 탐색 대상 · useOwnNav — k/n · ‹ › · 줄 대상"
        status: pass
    human_judgment: false
  - id: D2
    description: "키 ] 다음 · [ 이전(preventDefault) · input/textarea/contenteditable 무시 · Meta/Ctrl/Alt · 이미 처리된 이벤트 무시 · own 없으면 가로채지 않음"
    verification:
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/use-own-nav.test.tsx#useOwnNav — 키 [ ]"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/use-tick-cursor.test.tsx(회귀 — ← → Space 그대로)"
        status: pass
    human_judgment: false
  - id: D3
    description: "제목 줄 알약 「◆ 우리 체결 k/n · 주문 m」 · 이전/다음 우리 체결 버튼 · 끝 비활성 · 상태 없으면 없음 · KRX|NXT 뒤 · 현재 틱 앞"
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/tick-viewer-live.test.tsx#우리 체결 알약(38-08 · D-09)"
        status: pass
    human_judgment: true
    rationale: "알약 실제 배치 · 폰 390 줄바꿈 · 민트 대비 · 뷰어 → 페이지 → 머리 왕복(실제 own 데이터로 › 클릭) 은 jsdom 이 배치를 못 재고 실데이터가 없어 눈 확인 필요(38-09 e2e · 38-10 UAT)"
  - id: D4
    description: "useTickOwn — 마운트 1 · 재렌더 0 · refreshKey +1 = 1 · 10분 = 0 · 늦은 이전 응답 버림 · 실패 5종 → own null · error · warn 1회"
    verification:
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/use-tick-own.test.tsx"
        status: pass
    human_judgment: false
  - id: D5
    description: "당일 「↻ 최신 받기」 1회 = live 1 + own 1 · 30초 자동 0 · 받는 중 다시 누름 = 둘 다 0 · 409 epoch 교체 재마운트 = own 1 · 과거 격자 뷰어 열 때 1 · t 만 바뀌면 0"
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/tick-viewer-live.test.tsx#TickViewerPage — 당일 결선 우리 체결 2건 · TickViewer — 과거 격자 우리 체결 조회"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/use-tick-grid.test.tsx#TickViewerPage — URL t 의존성"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-11-03
status: complete
---

# Phase 38 Plan 08: 제목 줄 우리 체결 알약 · 키 [ ] · 당일 최신 받기 결선 Summary

**rows + own 에서 우리 체결 A3 행과 짝 없음 줄을 현재 정렬 순열 자리순 탐색 대상으로 만들고(`ownNavOf`), `useOwnNav` 가 k/n · 주문 수 · ‹ › · 키 `[` `]` 를 내 뷰어 → 페이지 → 화면 맨 위 제목 줄 「◆ 우리 체결 k/n · 주문 m ‹ ›」 알약으로 올린다. 당일에는 「↻ 최신 받기」 한 번이 live 증분 1회와 우리 체결 1회를 같이 부르고, 자동 타이머는 없다.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-11-03T07:13:45Z
- **Completed:** 2026-11-03T07:25:30Z
- **Tasks:** 2 (Task 1 tracer · Task 2 tdd)
- **Files modified:** 11 (새 3 · 수정 8)

## Accomplishments

- `use-own-nav.ts`: `ownNavOf`(짝 체결 = `posOfRec[rec]` · 짝 없음 · 대기 = `ownPosOfFill[id]` · 정렬 · 중복 제거) · `useOwnNav`(현재 자리 = 고른 줄 자리 또는 커서 행 · k = 이하 대상 수 · prev/next · A3 대상 = `jumpToRec` · 줄 대상 = `pickLine({kind:'fill'}, ownLineRec)` · 창 keydown `[` `]` — `useTickCursor` 와 같은 가드 순서).
- 제목 줄 `tick-own-nav` 알약: KRX|NXT 뒤 · 현재 틱 앞 · 목업 `.mine-pill`(11.5px 600 · `--mine-bg` · `--mine-fg` · 버튼 11px 700) · 「이전 우리 체결」 · 「다음 우리 체결」 · 끝이면 비활성 · `whitespace-nowrap` 한 덩어리라 폰에서는 줄째 감긴다.
- 뷰어 `onOwn` → 페이지 `{key: openKey, nav}` → `TickHeader ownNav`(뷰가 열려 있을 때만 · 열기 키가 바뀌면 파생으로 사라짐). URL 무변경(`tick-url.ts` diff 0).
- 당일: `ownRefreshKey` — 「최신 받기」 가 live 증분을 실제로 시작했을 때만 +1 → 당일 TickViewer → `useTickOwn(urlState, key)`. 과거 격자 TickViewer 는 0(열 때 1회). epoch 교체는 뷰어 key 재마운트로 1회(추가 코드 없음 · 테스트로 확인).
- 38-01 이 남긴 `[tick-own] … No "fetchTickOwn" export` 경고 로그를 세 테스트 파일(tick-viewer-live · tick-state-card · use-tick-grid)의 목에 `fetchTickOwn` 을 정식으로 넣어 없앴다 — `src/lib/ticks src/components/ticks` 회귀 출력에 0건.

## Task Commits

1. **Task 1 (tracer): 제목 줄 알약 k/n ‹ › · 키 [ ]** — `84a337f7` (feat)
2. **Task 2 (tdd): 당일 최신 받기 = live 1 + own 1** — RED `5601b9ac` (test) → GREEN `77811066` (feat) · REFACTOR 없음
3. **추가 테스트:** 알약 렌더 · 변환 흐름 목 `674495c5` (test) · 과거 격자 페이지 흐름 목 `99d211a4` (test)

**Plan metadata:** 이 SUMMARY 커밋(docs)

## Files Created/Modified

- `webapp/src/lib/ticks/use-own-nav.ts` — 새 파일 · 탐색 대상 · 훅 · 키
- `webapp/src/lib/ticks/__tests__/use-own-nav.test.tsx` — 새 파일 · 13건
- `webapp/src/lib/ticks/__tests__/use-tick-own.test.tsx` — 새 파일 · 9건
- `webapp/src/lib/ticks/use-tick-cursor.ts` — `isTypingTarget` export(동작 불변)
- `webapp/src/lib/ticks/use-tick-live.ts` — `refresh()` 가 boolean 반환(`running` 이면 false)
- `webapp/src/components/ticks/tick-header.tsx` — `ownNav` prop · 알약
- `webapp/src/components/ticks/tick-viewer.tsx` — `onOwn` · `ownRefreshKey` · `navJump`
- `webapp/src/components/ticks/tick-viewer-page.tsx` — ownNav 상태 · `onLiveRefresh` · `ownRefreshKey`
- `webapp/src/components/ticks/__tests__/tick-viewer-live.test.tsx` — `fetchTickOwn` 목 · 당일 2건 · 과거 1건 · 알약 1건
- `webapp/src/components/ticks/__tests__/tick-state-card.test.tsx` — `fetchTickOwn` 목(빈 응답)
- `webapp/src/lib/ticks/__tests__/use-tick-grid.test.tsx` — `fetchTickOwn` 목 · t 만 바뀌면 재요청 0 단언

## Verification (실행 결과 그대로)

- Task 1 `<verify>`: `pnpm --filter @gh-radar/shared build` 통과 · `pnpm --filter @gh-radar/webapp run typecheck`(앱 + e2e) 통과 · `vitest run use-own-nav · use-tick-cursor · tick-url --maxWorkers=2` 3 files · 36 passed
- 트레이서 게이트: auto_advance false · human_verify_mode 기본(end-of-phase) · `<verify>` 자동만 → 재실행 통과로 체크포인트 없이 확장. 추가로 `tick-viewer-live.test.tsx` 9 passed(뷰어 결선 회귀).
- Task 2 RED: `vitest run use-tick-own · tick-viewer-live` — 2 failed(「최신 받기」 뒤 own 1 그대로 · 409 재마운트 뒤 own 2) · 19 passed. 훅 테스트 9건은 38-01 구현(세대 끊기 · 경고 한 줄)으로 처음부터 통과 → `5601b9ac`
- Task 2 `<verify>`: shared build · typecheck 통과 · `vitest run use-tick-own · tick-viewer-live · use-tick-live --maxWorkers=2` 3 files · 33 passed
- 계획 `<verification>`: `vitest run src/lib/ticks src/components/ticks --maxWorkers=2` — 26 files · 345 passed · `[tick-own]` 경고 0건
- eslint(변경 11파일) 경고 0 · 수용 기준 grep 전부 PASS(Task 1 6개 · Task 2 3개 — 타이머 grep 출력 0) · `tick-url.ts` diff 0
- 미실행: e2e(38-09 몫) · 실제 화면 알약 배치 · 폰 390 눈 확인 · 실 own 데이터로 › 왕복 · 배포(38-10 메인 세션)

## Decisions Made

frontmatter key-decisions 4건 그대로.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 짝 없음 줄 다음 › 가 제자리를 맴도는 문제 예방 — A3 대상 이동 때 고른 줄 해제**
- **Found during:** Task 1
- **Issue:** 뷰어의 줄 선택은 「커서가 그 줄의 기준 rec 일 때」 로 파생된다. 짝 없음 줄의 기준 전문(다음 첫 ROW)이 바로 다음 탐색 대상 A3 행이면, › 로 그 행에 가도 선택이 남아 현재 자리가 여전히 줄 → k 그대로 · › 가 같은 행으로만 간다.
- **Fix:** 뷰어가 `useOwnNav` 에 `jumpToRec` 대신 `navJump`(= `setOwnPick(null)` + `jumpToRec`)를 넘긴다. 테스트 하네스도 같은 꼴로 줄 → A3 → 줄(‹) 왕복을 단언.
- **Files modified:** webapp/src/components/ticks/tick-viewer.tsx
- **Committed in:** 84a337f7

**2. [Rule 2 - 정확성] 「받는 중이면 둘 다 하지 않는다」 를 refresh() 반환값으로**
- **Found during:** Task 2
- **Issue:** `live.refreshing` 은 `running && !filling()` 이라 epoch 다시 받는 중(refetching)에는 false 다. 그때 버튼이 눌리면 live `refresh()` 는 거절하는데 페이지가 own 만 올려 「버튼 1회 = live 1 + own 1」 이 깨진다.
- **Fix:** `use-tick-live.ts` `refresh()` 가 요청 시작 여부를 boolean 으로 돌려주고(`running` 도 거절 조건에 명시), 페이지는 true 일 때만 `ownRefreshKey` 를 올린다. 계획 files 밖(`use-tick-live.ts`) 한 함수 변경 · 기존 use-tick-live 12건 그대로 통과.
- **Files modified:** webapp/src/lib/ticks/use-tick-live.ts, webapp/src/components/ticks/tick-viewer-page.tsx
- **Committed in:** 77811066

### 계획 대비 작은 차이(기록)

- **현재 자리 — 주문 줄 선택도 줄 자리로** — 계획은 「ownSel 이 짝 없음 줄이면 그 줄 자리」 만 적었지만 주문 줄 선택(`kind: 'order'`)도 그 줄 자리를 쓴다. 주문 줄을 고른 상태에서 › 는 그 줄 다음 첫 대상(보통 그 주문의 첫 체결 행)으로 간다 — 커서 행 기준이면 그 행을 건너뛴다.
- **`use-tick-own.ts` 무변경** — 38-01 구현이 behavior 1-3(세대 끊기 · 실패 경고 한 줄 · 타이머 없음)을 이미 만족해 다듬을 것이 없었다. 테스트만 새로 잠갔다(그래서 훅 RED 는 없음).
- **`[` `]` preventDefault** — 계획 「`preventDefault`」 를 대상이 있을 때만 한다(own 없음 · 끝이면 이벤트를 건드리지 않음).
- **알약 숫자 글꼴** — 목업과 같은 본문 글꼴에 `tabular-nums` 만(`.mono` 의 숫자 글꼴은 한글 「우리 체결」 과 섞여 굵기가 달라 보일 수 있어 쓰지 않음).
- **테스트 파일 추가 수정 2개** — `tick-state-card.test.tsx` · `use-tick-grid.test.tsx` 는 계획 files 밖이지만, 둘 다 페이지가 뷰어를 열어 같은 `[tick-own]` 경고를 찍던 곳이라 목을 정식으로 넣었다(지시 「경고 로그를 없애라」 의 남은 두 출처).
- **TDD 커밋 분리 · 추가 test 커밋 2개** — Task 2 RED · GREEN 두 커밋 + 알약 렌더 · 목 정리 test 커밋 2개. 커밋 5개.

---

**Total deviations:** 2 auto-fixed(Rule 1 · Rule 2) + 기록 6건
**Impact on plan:** 금지 사항 무변경 — 우리 체결 자동 재요청 타이머 없음 · 전문 목록 패널 제목 줄 「◆ 다음 우리 체결」 버튼 없음 · URL 파라미터 추가 없음 · 화면 문구 「이전 우리 체결」 · 「다음 우리 체결」(「머리」 같은 내부 말 없음).

## TDD Gate Compliance

- Task 2: RED `5601b9ac`(test · 2 failed — 최신 받기 뒤 own 그대로 · 재마운트 뒤 own 2) → GREEN `77811066`(feat · 33 passed) · REFACTOR 없음.

## Issues Encountered

- 이 세션 격리 검사가 복합 명령(`sed -i` 와 grep 연결)을 막아 파일은 Edit/Write, git 은 단순 명령으로 나눠 실행했다. 플랜 커밋 원장 파일 대신 시작 HEAD `8ce68148` 을 직접 기록해 `git rev-list --count 8ce68148..HEAD` = 5 로 쟀다(결과물 영향 없음).

## Known Stubs

없음 — 알약 · 키 · 최신 받기 결선 모두 실제 own 모델 · live 훅에 연결됨.

## User Setup Required

None — 배포는 38-10 메인 세션.

## Next Phase Readiness

- 38-09(e2e)는 `data-slot="tick-own-nav"` · 버튼 이름 「이전 우리 체결」 · 「다음 우리 체결」 · 키 `[` `]` 로 단언할 수 있다. e2e 목이 `/api/ticks/own` 을 모르면 404 → 알약 없음(뷰어는 그대로).
- 당일 own 호출은 「최신 받기」 클릭 · 뷰어 마운트(열기 · epoch 교체)에만 비례한다 — UAT 에서 서버 로그로 확인할 대상.
- 차트 ◆ 클릭은 `cursor.jumpToRec` 그대로라 고른 줄을 풀지 않는다(38-07 동작) — ◆ 가 짝 없음 줄의 기준 행과 겹칠 때만 k 가 줄 자리에 머문다. 실사용에서 어긋나 보이면 38-10 UAT 에서 차트 쪽도 `navJump` 로 바꾸면 된다.

## Self-Check: PASSED

- 새 파일 3개 · 수정 8개 존재 확인 · 커밋 `84a337f7` · `5601b9ac` · `77811066` · `674495c5` · `99d211a4` 가 HEAD 이력에 있음 · `git rev-list --count 8ce68148..HEAD` = 5 · 삭제 파일 0.
