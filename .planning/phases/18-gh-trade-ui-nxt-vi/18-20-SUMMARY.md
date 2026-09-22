---
phase: 18-gh-trade-ui-nxt-vi
plan: 20
subsystem: trading-workbench
status: complete
tags: [gap-closure, TRADE-09, webapp, card-grid, WR-02]
gap_closure: true
requires:
  - 18-17
provides:
  - "CardGrid 카드별 고정 호스트 노드(display:contents div) + createPortal — React 트리에서 카드는 평평한 keyed 목록, 부모가 바뀌지 않는다"
  - "칸/스택 빈 자리표 + 키별 안정 ref 콜백이 호스트를 옮겨 붙인다 — D-09 DOM 구조(card-grid > card-cell · card-stack > card-cell) 그대로"
  - "StrategyCardImpl everOpened 파생 상태 — 한 번 펼친 본문은 접혀도 hidden 으로 남고, 한 번도 펼친 적 없는 카드는 본문을 만들지 않는다"
  - "card-grid.test.tsx describe 「WR-02 — 접기/펴기·단 수 변경에 마운트 유지」 3케이스 · strategy-card.test.tsx 「WR-02 — 한 번 펼친 본문은 접어도 상태를 지킨다」 · e2e GC2 · 케이스 6 :visible 단언"
affects:
  - 18-REVIEW WR-02 종결 근거
  - trading-workbench.tsx 407-411 로그 중복 필터(재마운트 우회) — 이제 재마운트가 없어 방어선으로만 남는다
tech-stack:
  added: []
  patterns:
    - "고정 호스트 노드 포털 — 부모가 바뀌는 DOM 이동을 React 트리에서 분리 (격자 자리표가 포털 배열보다 앞 = 커밋 레이아웃 순서 계약)"
    - "useSyncExternalStore 클라이언트 판별 — SSR/하이드레이션 첫 렌더에는 호스트를 만들지 않는다"
    - "렌더 중 파생 상태(everOpened) — 한 번 참이 되면 거짓으로 돌아가지 않는다"
key-files:
  created: []
  modified:
    - webapp/src/components/trading/workbench/card-grid.tsx
    - webapp/src/components/trading/__tests__/card-grid.test.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/__tests__/strategy-card.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
key-decisions:
  - "WR-02 는 카드별 고정 호스트 노드 + createPortal 로 닫는다 — 상태 끌어올리기(LimitChaserForm 폼 상태·전송 잠금까지)는 변경면이 넓어 기각, React Activity 는 Next 15.5 번들 React 에 없어 금지"
  - "CardGrid 에 언마운트 정리 효과를 두지 않는다 — StrictMode 효과 재실행이 살아 있는 호스트를 지워 카드가 사라지는 함정. 호스트는 자리표 자식이라 격자와 함께 문서에서 빠진다"
  - "접힌 더티 카드의 더티 바(document.body 포털)는 계속 뜨는 것이 의도 — 미반영 값이 접기로 사라지지 않는다(D-12 · D-28)"
requirements-completed: [TRADE-09]
metrics:
  duration: "약 12분"
  completed: 2026-09-22
  tasks: 3
  files: 5
actuals:
  tokens: 6200
  tasks: 3
  commits: 3
plan_head_before: b44256f7e8cba8d8ec06bf0a40dc8345f8e3875c
coverage:
  - deliverable: "CardGrid 접기/펴기·단 수 변경에 카드 마운트 유지"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-grid.test.tsx#CardGrid — WR-02 — 접기/펴기·단 수 변경에 마운트 유지"
        status: pass
    human_judgment: false
  - deliverable: "StrategyCard 한 번 펼친 본문은 접어도 숨김으로 상태 유지"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-card.test.tsx#WR-02 — 한 번 펼친 본문은 접어도 상태를 지킨다(숨김으로 남는다)"
        status: pass
    human_judgment: false
  - deliverable: "실브라우저 접기/펴기에 미전송 값·더티 바·포커스 유지 + D-09 레이아웃·4밴드 잘림 무회귀"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#GC2 카드를 접었다 펴도 미전송 값과 더티 바가 남는다"
        status: pass
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp run test:e2e -- trading-workbench (31 passed)"
        status: pass
    human_judgment: false
---

# Phase 18 Plan 20: 카드 접기/펴기 재마운트 제거 (WR-02) Summary

카드별 고정 호스트 노드로 `createPortal` 해 스택 ↔ 격자 이동에도 React 부모가 바뀌지 않게 하고, 한 번 펼친 본문은 `hidden` 으로 남겨 미전송 더티 값 · 수동주문 「결과 모름」 잠금 · 에코 상관이 접기로 사라지지 않게 했다.

## Performance

- 시작 16:20 KST 무렵 · 종료 16:32 KST 무렵 (약 12분)
- Tasks: 3 · Files: 5 · Commits: 3

## Accomplishments

- `CardGrid`: 카드 키별 `display:contents` 호스트 `div` 를 `useRef(Map)` 에 한 번 만들고, 카드는 격자 **뒤** keyed 배열에서 `createPortal(renderCard(c), host, key)` 로 그린다. 격자는 기존 DOM 구조를 그대로 그리되 칸은 빈 자리표이고, 키별 안정 ref 콜백이 호스트를 자기 안으로 옮겨 붙인다. 사라진 키의 호스트는 레이아웃 효과에서 치운다. 머리 주석 ①·③ 정정 + ⑤ 신설(WR-02 근거 · 기각 대안 · 순서 계약).
- `StrategyCardImpl`: `everOpened` 렌더 중 파생 상태 — 본문(10칸 · 고지 · body)을 `everOpened` 일 때 그리고, 영역 `hidden={!open}` 은 그대로라 접힌 카드는 헤더만 보인다(D-11).
- e2e: 케이스 6 스택 안 본문 단언을 `:visible` 0 으로 정정(+ 펼쳤다 접은 카드에도 한 번 더), GC2 신설.

## RED 확인

- Task 1: 수정 전 `card-grid.tsx` 에서 「접어도 같은 인스턴스」「다시 펼쳐도 같은 인스턴스」 2케이스 실패(카운터 3 → 0 · 새 DOM 요소). 단 수 변경 케이스는 수정 전에도 통과(같은 부모 안 재정렬이라) — 회귀 방어용으로 유지.
- Task 2: 수정 전 `strategy-card.tsx` 에서 접은 뒤 `stateful-probe` 를 찾지 못해 실패.

## Task Commits

1. Task 1 [tracer]: 카드별 고정 호스트 노드 + 자리표 ref 콜백 — `6e53176`
2. Task 2: 한 번 펼친 본문은 접어도 숨김 유지 — `3b4168f`
3. Task 3: e2e GC2 + 케이스 6 `:visible` 단언 — `5c992b9`

## Verification

- `vitest` 전체: 92 files · 1357 passed · 1 skipped
- `typecheck` (tsc + tsconfig.e2e): 오류 0
- `test:e2e -- trading-workbench`: 31 passed (케이스 4·5·6·7·17·18 포함 무수정 green)
- `grep -nE "Activity|react-reverse-portal"` card-grid.tsx · strategy-card.tsx: 0건
- `grep -c createPortal card-grid.tsx`: 3
- Tracer 게이트: end-of-phase + automated-only verify 재실행 통과 → 확장 진행

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] GC2 진입을 「종목 추가」에서 「등록 전략 카드(케이스 12 와 같은 진입)」로 바꿈**
- **Found during:** Task 3
- **Issue:** 계획은 종목 추가로 만든 카드에서 `lc-buy-order-amount` 를 바꿔 더티 바를 띄우라 했으나, 더티(미반영)는 서버값 대비라 등록 전 카드에는 더티 바가 서지 않아 첫 단언에서 실패했다.
- **Fix:** `relay.seedLimitChasers([{ buyEnabled: true }])` + `openFocusedCard` 로 서버 전략이 있는 카드를 열고 `lc-buy-watch-qty` 를 8000 으로 바꾼다. 단언 세 지점(접은 뒤 더티 바 가시 · 포커스 복귀 · 펼친 뒤 값 유지)은 계획 그대로이며, 되돌리기 뒤 값이 서버값(10,000)으로 돌아오는 것까지 본다.
- **Files modified:** webapp/e2e/specs/trading-workbench.spec.ts
- **Commit:** `5c992b9`

**2. [Rule 1 - Bug] CardGrid 언마운트 정리 효과를 두지 않음**
- **Found during:** Task 1
- **Issue:** 처음에 호스트 전체를 지우는 언마운트 정리 효과를 넣었으나, 개발 모드 StrictMode 의 효과 재실행(정리 → 재설치)이 살아 있는 호스트를 Map 에서 지워 다음 렌더에 새 호스트로 포털 컨테이너가 바뀌면 카드가 재마운트된다.
- **Fix:** 정리 효과 제거 — 호스트는 자리표의 자식이라 격자 언마운트 시 함께 문서에서 빠진다. 사라진 키 정리는 매 커밋 레이아웃 효과가 한다(재실행에 멱등).
- **Files modified:** webapp/src/components/trading/workbench/card-grid.tsx
- **Commit:** `6e53176`

**Total deviations:** 2 auto-fixed (Rule 1 ×2). **Impact:** 설계·금지사항 무변경. GC2 는 계획의 단언을 모두 지키며 진입 경로만 실제 더티 조건에 맞췄다.

## Issues Encountered

- `pnpm --filter @gh-radar/webapp test -- card-grid` 는 필터가 먹지 않고 전체 스위트를 돈다(vitest `--` 뒤 인자) — 결과 판정에는 지장 없음. 단일 파일 확인은 `npx vitest --run <path>` 로 했다.

## Next Phase Readiness

- WR-02 종결. `trading-workbench.tsx:407-411` 의 로그 중복 필터 주석은 「재마운트 때 첫 에코 문장을 다시 쓴다」를 근거로 하는데 이제 재마운트가 없다 — 필터는 무해한 방어선으로 남겨 두었다(스코프 밖, 정리는 후속 리뷰에서 판단).

## Self-Check: PASSED
