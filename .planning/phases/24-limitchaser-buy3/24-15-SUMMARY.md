---
phase: 24-limitchaser-buy3
plan: 15
subsystem: ui
tags: [react, limit-chaser, lc.set, multi-instance, visibility, vitest, playwright, gap-closure]
status: complete

requires:
  - phase: 24-limitchaser-buy3
    provides: "24-14 폼 dropMasterAfterServerFold(가드 ①~④) · isServerFoldEdge · buildCfg · lcBaseValues · 24-13 UI-SPEC 갭 클로징 부록"
provides:
  - "lib isMasterOnlyDelta(cfg, echo) — buyEnabled 외 cfg 전 키가 에코와 === 인가"
  - "폼 D-02 후반 가드 ⑤(순수 델타) — 수량 3벌 · 클라 고정 3필드가 에코와 다르면 자동 끔 0 · 재예약 없음"
  - "폼 D-02 후반 가드 ⑥(비가시 유예) — export LC_FOLD_HIDDEN_DEFER_MS = 1_500 · document.visibilityState hidden 이면 예약 지연"
  - "UI-SPEC 갭 클로징 부록 소절 「D-02 후반 보강(WR-06 · 24-15)」"
affects: [24-16, limit-chaser-form, strategy-card]

actuals:
  tokens: 7475
  tasks: 2
  commits: 4
plan_head_before: 6027a1bdb7a1ba03d727ef357d45f8682f84caa4

tech-stack:
  added: []
  patterns:
    - "자동 제출 순수 델타 가드 — 사람 손이 아닌 제출은 에코와 한 필드만 다를 때만 나간다(키 목록 정본 = 입력 타입 · 나열하지 않음)"
    - "비가시 인스턴스 양보 — visibilityState hidden 이면 예약을 미루고 최신 에코로 재확인해 인스턴스 간 중복을 접는다"

key-files:
  created: []
  modified:
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/lib/__tests__/limit-chaser.test.ts
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
    - .planning/phases/24-limitchaser-buy3/24-UI-SPEC.md

key-decisions:
  - "24-15: D-02 후반 자동 마스터 OFF 는 보낼 cfg 가 최신 에코와 buyEnabled 한 필드만 다를 때만 나간다(가드 ⑤ · lib isMasterOnlyDelta). 수량 3벌 · 클라 고정 3필드도 비교에 넣는다 — 빼면 relay 고정을 거쳐 다른 클라 값이 덮인다. 다르면 가드 ① 과 같은 결로 접고 재예약하지 않는다(「켜짐 · 켠 매수 없음」)"
  - "24-15: 보이지 않는 인스턴스(document.visibilityState hidden)는 자동 끔을 LC_FOLD_HIDDEN_DEFER_MS(1.5초) 미룬 뒤 가드 ② 로 재확인한다(가드 ⑥). 보이는 인스턴스는 종전대로 다음 틱이다"
  - "24-15: WR-06 은 webapp 만으로 닫는다(relay 변경 없음 · relay 재배포 불필요). 남는 한계(동시에 보이는 두 인스턴스 각 1건 · 한 왕복 안쪽 사람 편집 되돌림)는 relay/서버 compare-and-set 이 필요해 이월하고 24-16 체크포인트에서 사용자 확인"

patterns-established:
  - "자동(비사람) 제출 가드: 순수 델타 + 비가시 유예 + 최신 에코 재확인 — 인스턴스 경계 밖 중복 · 무언 덮어쓰기를 줄인다"

requirements-completed: []

coverage:
  - id: D1
    description: "자동 마스터 OFF 는 에코 대비 buyEnabled 한 필드만 바꿀 때만 나간다 — 다른 클라가 둔 수량 · 고정 필드가 에코에 있으면 전송 0 · 매수주문 ON 그대로 · 재예약 0"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/limit-chaser.test.ts#isMasterOnlyDelta — D-02 후반 자동 끔은 buyEnabled 한 필드만 바꿀 때만 (24-REVIEW WR-06 · 가드 ⑤)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#WR-06 가드 ⑤ — 에코의 수량이 웹 산출과 다르면(다른 클라가 둔 7주 ≠ 3주) 자동 끔 0 · 매수주문 ON 그대로 · 재수신에도 0"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#WR-06 가드 ⑤ — 에코의 클라 고정 필드가 다르면(sweepMinCount 5 ≠ 고정 0) 자동 끔 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "보이지 않는 인스턴스는 1.5초 유예 뒤 재확인 — 다음 틱 0 → 유예 뒤 1건 · 유예 중 다른 인스턴스의 마스터 OFF 에코면 0 · 유예 중 in-flight 면 풀린 뒤 다시 유예 · 중복 0"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#숨은 인스턴스 — 비가시 유예 뒤 재확인 (WR-06 가드 ⑥)"
        status: pass
    human_judgment: false
  - id: D3
    description: "보이는 인스턴스의 D-02 후반 동작(다음 틱 1건 · 가드 ①~④ · 거부 뒤 재시도 0 · D-34 0) 불변 · e2e P24-4 시드를 실제 에코 모양으로 고친 뒤에도 green"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#⑰-b D-02 후반 · D-19 — WinForms 동형 서버 접힘 뒤 마스터 자동 끔"
        status: pass
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g \"P24-4|P24-3\""
        status: pass
    human_judgment: false
  - id: D4
    description: "남는 한계(동시에 보이는 두 인스턴스 · 한 왕복 안쪽 사람 편집 되돌림)의 수용 여부 — 다중 기기 실사용 판단"
    human_judgment: true
    rationale: "전체 cfg 규약의 본질 한계라 테스트로 닫을 수 없다 — relay/서버 compare-and-set 이월 여부를 24-16 체크포인트에서 사용자가 확인한다"

duration: 8min
completed: 2026-09-28
---

# Phase 24 Plan 15: D-02 후반 자동 마스터 OFF 의 탭 · 기기 간 중복 (WR-06) Summary

**서버 접힘 뒤 자동 마스터 OFF 는 이제 보낼 cfg 가 최신 에코와 `buyEnabled` 한 필드만 다를 때만 나간다(lib `isMasterOnlyDelta` · 가드 ⑤). 보이지 않는 탭 · 앱은 1.5초 양보한 뒤 최신 에코로 재확인한다(`LC_FOLD_HIDDEN_DEFER_MS` · 가드 ⑥). 그래서 다른 클라가 둔 수량 · 고정 필드를 조용히 덮지 않고, 한 기기에서 탭 · 앱이 여럿이어도 제출은 보통 1건이다. relay 는 바꾸지 않았다.**

## Performance

- **Duration:** 약 8분
- **Started:** 2026-09-28T05:06:58Z
- **Completed:** 2026-09-28T05:14Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- **lib `isMasterOnlyDelta(cfg, echo)`:** `buyEnabled` 를 뺀 cfg 의 모든 키를 에코의 같은 키와 `===` 로 비교한다. 키 목록은 나열하지 않고 입력 타입(`RelayLimitChaserInput`)을 정본으로 따른다. JSDoc 에 WR-06 의 이유를 적었다. 고정 필드를 빼면 relay 고정값을 거쳐 에코 값이 바뀌기 때문에 비교에 넣는다. 표 단위 테스트 10건을 더했다(수량 3벌 · 고정 3필드 · S→C 필드 무시 · 직접 변경).
- **가드 ⑤ (폼):** `dropMasterAfterServerFold` 에서 가드 ① 뒤, 전송 바로 앞에 `buildCfg({ ...lcBaseValues(s, formRef.current), buyEnabled: false })` 를 에코와 비교한다. 다르면 `foldPendingRef` 를 내리고 끝낸다. 재예약하지 않으므로 「켜짐 · 켠 매수 없음」이 남는다. `useCallback` 의존성에 `buildCfg` 를 더했다.
- **가드 ⑥ (폼):** `LC_FOLD_HIDDEN_DEFER_MS = 1_500` 을 export 했다. 예약 이펙트의 지연은 `serverFoldDelayMs()` 가 정한다. 화면이 숨어 있으면 1.5초, 보이면 0 이고, SSR 에서는 `typeof document` 가드로 0 이다. D-02 후반 주석 블록을 「가드 6개」로 고치고 ⑤ · ⑥ 과 남는 한계를 적었다.
- **기존 테스트를 실제 모양으로:** ⑰-b 의 `A()`/`B()` 에 `buyOrderQty: 3`(웹 산출값)을 명시했다. e2e P24-4 에는 `postBuyOrderQty: 563` 과 한방 고정 3필드 `SWEEP_FIXED`(true/0/0)를 세 시드에 더했다. 단언과 흐름은 바꾸지 않았다.
- **IN-01 폼 분:** 파일 머리 ③ 의 「(32필드)」, ⑤ 제목 「29 + 3 = 32」, 「S→C 전용 4필드」 나열, `buildCfg` JSDoc 의 「(33필드)」를 지웠다. 대신 정본(`RelayLimitChaserInput` · `LIMIT_CHASER_SERVER_ONLY_FIELDS`)을 가리키는 문장을 넣었다. 새 숫자는 적지 않았다.
- **UI-SPEC:** 갭 클로징 부록에 「D-02 후반 보강(WR-06 · 24-15)」 소절을 더했다. 내용은 가드 ⑤ · ⑥, 남는 한계, 그리고 D-34 운영 서버에서는 이 백스톱에 닿지 않는다는 점이다. 상호작용 계약 행과 E4 행 자체는 그대로 두었다.

## Task Commits

1. **Task 1 (tracer) RED:** `d4eba9a0` test(24-15): 에코에 다른 클라가 둔 수량 · 고정 필드가 있으면 서버 접힘 뒤 자동 마스터 OFF 0 (WR-06 가드 ⑤ RED)
2. **Task 1 GREEN:** `99ef82eb` fix(24-15): 서버 접힘 뒤 자동 마스터 OFF 는 에코와 buyEnabled 한 필드만 다를 때만 보낸다 (WR-06 가드 ⑤)
3. **Task 2 RED:** `b69b6a78` test(24-15): 숨은 인스턴스는 서버 접힘 자동 끔을 유예 뒤 최신 에코로 재확인한다 (WR-06 가드 ⑥ RED)
4. **Task 2 GREEN:** `c903d317` fix(24-15): 보이지 않는 인스턴스는 서버 접힘 자동 끔을 1.5초 유예 뒤 재확인한다 (WR-06 가드 ⑥ · IN-01 폼 분)

## TDD Gate Compliance

vitest 출력에는 node:test 식 `# tests/# pass` 요약 줄이 없다. 그래서 `tdd-red-evidence` 대신 대상 테스트 이름과 단언 실패로 RED 를 확인했다.

- **RED (가드 ⑤):** ⑰-b 의 새 두 케이스(「수량 7주 ≠ 3주」 · 「sweepMinCount 5 ≠ 0」)가 모두 `expected [ { … } ] to have a length of +0 but got 1` 로 실패했다. 자동 끔이 다른 클라 값을 덮으며 1건 나갔다. 결과는 `2 failed | 10 passed`(⑰-b). 기존 ⑰-b 10건은 헬퍼에 `buyOrderQty: 3` 을 넣은 뒤에도 통과했다.
- **RED (가드 ⑥):** 숨은 인스턴스 세 케이스가 모두 실패했다(`3 failed | 12 passed`). 앞의 두 케이스는 다음 틱에 이미 1건 나가 `expected … length of +0 but got 1` 이었다. in-flight 케이스는 `expected … length of 2 but got 1` 이었다.
- **GREEN:** 모든 대상 케이스가 통과한다. REFACTOR 커밋은 없다.
- **Tracer 게이트:** end-of-phase 모드이고 `<verify>` 가 자동 명령뿐이라 Task 1 verify 를 다시 돌렸다(단위 254 passed · typecheck 0 · e2e P24-3/P24-4 green). ⚡ Tracer verified end-to-end — expanding.

## Verification

- Task 1 verify: `vitest --run` lib + 폼 2파일 **254 passed**. shared build OK, webapp typecheck `error TS` 0. e2e `-g "P24-4|P24-3"` **3 passed**(setup 포함).
- Task 2 verify: `vitest --run src/components/trading src/lib` **77 files · 2127 passed · 1 skipped**. shared build OK, typecheck 0. e2e `-g "P24-4"` **2 passed**(setup 포함).
- webapp 단위 전체(`pnpm --filter @gh-radar/webapp run test`): **125 files · 2737 passed · 1 skipped**.
- relay 는 건드리지 않았으므로 relay 테스트 · 타입체크는 다시 돌리지 않았다.
- Acceptance grep 을 모두 통과했다: `export function isMasterOnlyDelta` 1 · dropMasterAfterServerFold 안 `isMasterOnlyDelta(` 1 · P24-4 `postBuyOrderQty: 563` 1 · `export const LC_FOLD_HIDDEN_DEFER_MS = 1_500` 1 · `visibilityState` 2 · 낡은 필드 수 패턴 0 · UI-SPEC `D-02 후반 보강(WR-06` 1.

## Decisions Made

- 가드 ⑤ 의 비교 cfg 는 훅의 실제 전송 조립(`baseNow()` + 주 필드 → `buildCfg`)과 같은 식으로 만든다. 훅의 ⑨-3 구서버 금액 override 는 반영하지 않았다. 구서버 에코는 그룹이 늘 OFF 라 하강 전이가 생기지 않기 때문이고, 주석에 한 줄로 적었다.
- `serverFoldDelayMs()` 는 예약 시점에 한 번만 읽는다. 유예 도중 탭이 보이게 되어도 앞당기지 않는다. 유예가 끝나면 어차피 가드 ② 가 재확인하므로 단순함을 택했다.
- lib 표 테스트의 `webCfgOf` 는 폼 `buildCfg` 와 같은 조립을 테스트 안에서 재현한다. `buildCfg` 는 폼 클로저라 lib 에서 부를 수 없기 때문이다. 제품 코드에 조립기를 새로 만들지는 않았다(lib ③ 「페이로드를 여기서 조립하지 않는다」).

## Deviations from Plan

None - plan executed exactly as written. (⑰-b describe 제목의 「가드 4개」는 역사 표기라 그대로 두었다. 가드 목록의 정본은 폼 주석 블록 「가드 6개」다.)

## Issues Encountered / Notes — 24-16 사용자 확인용 남는 한계

- **동시에 보이는 두 인스턴스**(예: 데스크톱 + 전면 앱)는 각자 1건씩 보낼 수 있다. 둘 다 같은 순수 델타 cfg 라 둘째는 OFF→OFF 무접촉이다.
- **한 왕복 안쪽 사람 편집:** 자동 제출보다 한 왕복 안쪽에 서버에 닿은 사람 편집은 전체 cfg 규약(마지막 쓰기 승리) 때문에 되돌려질 수 있다. 완전 차단은 relay/서버 compare-and-set 이 필요해 이월했다.
- **백그라운드 타이머 스로틀:** 브라우저는 숨은 탭의 `setTimeout` 을 늦출 수 있다(1초 단위, 오래 숨은 탭은 더 길게). 그래서 숨은 인스턴스의 유예가 1.5초보다 길어질 수 있다. 실행될 때 가드 ② 가 최신 에코로 재확인하므로 중복 방향으로는 안전하다. 다만 보이는 인스턴스가 하나도 없으면 자동 끔이 그만큼 늦게 나간다.
- **현 운영 서버(gh-trade D-34)** 는 접힘 에코에 마스터 OFF 를 함께 싣는다. 그래서 이 경로 자체가 닿지 않는다(구 서버 · 다른 클라 조합용 백스톱).

## Known Stubs

없음.

## Next Phase Readiness

- relay 변경이 없으므로 이 플랜만으로는 relay 재배포가 필요 없다.
- Ready for 24-16. 체크포인트에서 위 남는 한계를 사용자 확인 항목으로 제시한다.

## Self-Check: PASSED

- FOUND: webapp/src/lib/limit-chaser.ts · webapp/src/lib/__tests__/limit-chaser.test.ts · webapp/src/components/trading/limit-chaser-form.tsx · webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx · webapp/e2e/specs/trading-workbench.spec.ts · .planning/phases/24-limitchaser-buy3/24-UI-SPEC.md
- FOUND commits: d4eba9a0 · 99ef82eb · b69b6a78 · c903d317
- 의도치 않은 파일 삭제 0(`git diff --diff-filter=D` 빈 결과)
