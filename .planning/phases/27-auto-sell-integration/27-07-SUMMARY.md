---
phase: 27-auto-sell-integration
plan: 07
subsystem: webapp (상따 새 전략 폼 — 84 사용자 기본설정 시딩)
tags: [react, relay-store, user-settings, limit-chaser, playwright, tdd]
status: complete

requires:
  - phase: 27-06
    provides: "RelayData.userSettings(84 3상태 — undefined = 모름) · 컨텍스트 userSettings"
  - phase: 27-04
    provides: "touchedRef 집합에 autoSellMethod(3택) 포함 · ChoiceRow 방법 세그먼트"
  - phase: 27-02
    provides: "e2e relay.pushUserSettings · 스텁 게이트웨이 84 프레임"
provides:
  - "UserSettingsSeed 타입 · seedFromUserSettings(us) — 84 → 새 폼 9칸 · lc 범위 밖 칸별 D-04 폴백 · 미수신 빈 패치 (webapp/src/lib/limit-chaser.ts)"
  - "새 전략 폼 초기값 = D-04 상수 + 84 시딩 + 상한가 시딩 · 84 도착 재시딩 이펙트(미등록 · 손대지 않은 칸 · 전송 0)"
  - "e2e P27-4 새 폼 84 시딩"
  - "스텁 게이트웨이 10 판독기 buyOrderAmount 필드"
affects: [27-08, 27-09 배포(relay 먼저 — 84 를 내리는 relay 가 있어야 시딩이 실값이 된다)]

actuals:
  tokens: 6700      # chars/4 over git diff 1f429389..HEAD (26,706 chars)
  tasks: 2
  commits: 2        # MEASURED rev-list 1f429389..HEAD
plan_head_before: 1f429389d30a9e4e7546b32802cc92dd1bd58a48

tech-stack:
  added: []
  patterns:
    - "서버 설정 범위 ⊄ lc 범위일 때 칸별 폴백 — 판정은 lc-fields 행(inputRange ?? range · 3택 options) 정본, 폴백 값은 defaultLimitChaserForm() 하나"
    - "늦게 오는 스토어 값 재시딩 = 에코가 한 번이라도 온 폼 제외(hadServerRef) · touchedRef 제외 · 같은 값이면 setForm 생략"

key-files:
  created: []
  modified:
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/lib/__tests__/limit-chaser.test.ts
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
    - relay/tests/helpers/fake-gateway.ts

key-decisions:
  - "D-11 promote — 새 폼 기본값의 정본은 84, D-04 상수는 「84 미수신 · 범위 밖」 폴백으로 강등. 폴백 값은 defaultLimitChaserForm() 에서만 읽는다(상수 두 벌 금지)"
  - "칸별 범위 판정은 게이트를 켠 cfg 의 좁은 범위(inputRange ?? range)로 본다 — 시딩 값이 사용자가 그룹을 켜는 순간 lcRangeIssue 에 걸리지 않게(비율 0/51 · 반등 0 · 잔량추적 0 · 방법 0/4 → 상수)"
  - "금액 · 하한잔량처럼 lc 범위가 없는 칸은 relay UIntSchema(0 이상 정수) — 음수 · 소수만 폴백"
  - "재시딩 가드는 「지금 에코 있음」이 아니라 「에코가 한 번이라도 왔음」(hadServerRef) — 에코가 사라진 폼의 값은 등록됐던 전략의 값이라 84 로 덮지 않는다. 폼은 isin|account|exchange|resetSeq|liveSeed 로 키가 걸려 리셋은 재마운트라 이 가드와 충돌하지 않는다"
  - "seedFromUserSettings 반환형은 Partial<UserSettingsSeed> — 미수신이면 {} 라 플랜 표의 UserSettingsSeed 대신 Partial"

patterns-established:
  - "84 → 폼 시딩은 D-17 상장주식수 시딩과 같은 규칙 ①~④(에코 우선 · 늦은 도착 재시딩 · 손댄 칸 보존 · 전송/로그/강조 0)"

requirements-completed: []

coverage:
  - id: D1
    description: "seedFromUserSettings — 미수신 {} · present true 9칸 매핑(매도 주기 · 동시호가 키 없음) · present false = D-04 상수 · 칸별 폴백(잔량추적 0→55 · 반등 0→30 · 방법 0→3 · 비율 0→10 · 비율 51 · 방법 4 · 금액 음수 · 소수)"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/limit-chaser.test.ts#Phase 27 84 시딩"
        status: pass
    human_judgment: false
  - id: D2
    description: "폼 배선 — 첫 렌더 84 값 · 상한가/상장주식수 시딩 유지 · 늦은 84 는 손대지 않은 칸만(금액 4,500 · 방법 매수1호가 보존) · 재브로드캐스트도 같은 규칙 · 에코 폼 무시(마운트 · 도착 · 에코 사라진 뒤) · 전송 0 · 로그 0 · 첫 등록 cfg 에 시딩 값"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#Phase 27 새 폼 84 시딩"
        status: pass
    human_judgment: false
  - id: D3
    description: "종단 — 84(present · 선매수 5000 · 비율 15 · 방법 1) 뒤 새 종목 카드 → 5,000만원 · 15% · 매도1호가 · 전송 0 → 매수주문 켜기 → 게이트웨이 10 buyOrderAmount 5000 · autoSellRatioPct 15 · autoSellMethod 1"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P27-4"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-10-05
---

# Phase 27 Plan 07: 새 전략 폼 84 시딩 Summary

**`/me` 에서 정한 상따 기본설정(84)이 새 종목 카드 폼의 기본값으로 들어간다. 대상은 금액 3칸, 후매수 3칸, 잔량추적, 자동매도 비율·방법이다. 84 를 아직 모르거나 값이 lc 범위 밖이면 그 칸만 D-04 상수로 떨어진다. 등록된 전략(에코)과 사용자가 손댄 칸은 덮지 않고, 시딩은 아무것도 전송하지 않는다.**

## Performance

- **Duration:** 약 10 min
- **Started:** 2026-10-05T07:11Z
- **Completed:** 2026-10-05T07:21Z
- **Tasks:** 2/2
- **Files modified:** 6 (신규 0 · 수정 6)

## Accomplishments

- **`seedFromUserSettings(us)`(순수 함수):** WinForms `ResetStrategyOptionsToDefault` 와 같은 9칸 매핑이다. 칸별 범위는 `lcRowOfField` 로 찾은 lc 행의 `inputRange ?? range`(3택이면 `options`)로 판정한다. 범위 숫자를 따로 적지 않았다. 범위 밖이면 그 칸만 `defaultLimitChaserForm()` 값을 쓴다. lc-fields 는 limit-chaser 를 타입으로만 가져가므로 런타임 순환은 없다.
- **폼 초기값:** 에코가 있으면 종전대로 `formFromServer` 를 쓴다. 없으면 `{ ...defaultLimitChaserForm(), ...seedFromUserSettings(userSettings) }` 를 깔고 그 위에 상한가 5칸을 시딩한다(종전 순서 유지). 상장주식수 5칸 시딩(D-17)은 바꾸지 않았다.
- **재시딩 이펙트(`[userSettings, server]`):** 에코가 한 번이라도 온 폼은 시딩하지 않는다. `touchedRef`(값 · 방법)에 든 칸은 건너뛰고, 현재 값과 같으면 패치하지 않는다. 그래서 마운트 직후 실행은 렌더를 만들지 않는다. 전송 · 로그 · 강조는 없다.
- **e2e P27-4:** 실제 relay → 스텁 게이트웨이 바이트로 첫 등록 10 에 5000 · 15 · 1 이 실린 것을 확인한다.

## Task Commits

1. **Task 1: seedFromUserSettings — 9칸 매핑 · lc 범위 밖 칸별 D-04 폴백 · 미수신 빈 패치** — `48e29a4c` (feat)
2. **Task 2: 새 폼 배선 — 초기 시딩 · 84 도착 재시딩(손대지 않은 칸) · 등록 전략 무시 + e2e P27-4** — `1992be4f` (feat)

## TDD 기록

- Task 1 RED: `-t "Phase 27 84 시딩"` 를 돌리니 5 failed(`seedFromUserSettings is not a function`). GREEN: 5 passed, 파일 전체 117 passed.
- Task 2 RED: 4건 중 2 failed(「4,000만원」 ≠ 「5,000만원」 · 「4,000만원」 ≠ 「6,000만원」). 에코 우선 2건은 시딩 전부터 이미 통과하던 계약이다. GREEN: 4 passed.
- 테스트와 구현은 태스크 커밋 하나에 같이 넣었다(플랜의 커밋 2개 계약).

## 범위 판정 출처

| 칸 | lc 행 범위(판정에 쓰는 것) | 84 범위 | 폴백 |
|---|---|---|---|
| 선매수 · 추가매수 · 후매수 금액 | 없음 → UInt(0 이상 정수) | 0~999,999,999 | 4000 |
| 후매수 최대 | `range` 0~255 | 0~255 | 3 |
| 후매수 하한잔량 | 없음 → UInt | 0~99,999,999 | 100,000 |
| 후매수 반등 | `inputRange` 1~100 | 0~100 | 30 |
| 잔량추적 | `range` 1~90 | 0~90 | 55 |
| 자동매도 비율 | `inputRange` 1~50 | 1~50 | 10 |
| 자동매도 방법 | `options` 1 · 2 · 3 | 1~3 | 3 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 스텁 게이트웨이 10 판독기에 `buyOrderAmount` 가 없음**
- **Found during:** Task 2 e2e 작성
- **Issue:** 플랜은 「10 의 `buyOrderAmount === 5000`」 을 단언하라고 했다. 와이어(`envelope.ts` `addBuyOrderAmount`)에는 이 필드가 있지만, `relay/tests/helpers/fake-gateway.ts` 의 `readSetLimitChaserRequest` 는 읽지 않았다.
- **Fix:** 인터페이스와 판독기에 `buyOrderAmount: req.buyOrderAmount()` 한 줄씩을 더했다(플랜 files 밖). relay `tsc -p tsconfig.tests.json` 은 통과했고, 이 판독기를 쓰는 `relay/tests/fanout.test.ts` 는 83 passed 다.
- **Committed in:** `1992be4f`

---

**Total deviations:** 1 auto-fixed (Rule 3)
**Impact on plan:** 범위는 넓어지지 않았다. 테스트 헬퍼에 필드 하나를 더했을 뿐이다.

## Issues Encountered

- 실행 브랜치는 master 다(오케스트레이터 지시). 동시 세션의 Phase 28 파일(`28-*` · `milestone.lock` · `28-CONTEXT.md` 변경)은 건드리지 않았고, 스테이징은 경로를 하나씩 지정했다.

## Verification

- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck`(e2e tsconfig 포함): `error TS` 0
- `limit-chaser.test.ts -t "Phase 27 84 시딩"`: 5 ✓ · 파일 전체 117 passed
- `limit-chaser-form.test.tsx -t "Phase 27 새 폼 84 시딩"`: 4 ✓(D-17 상장주식수 시딩 케이스 포함 파일 전체 회귀 0)
- webapp 전체 단위: **141 files / 3325 passed (1 skipped)**
- e2e `trading-workbench.spec.ts -g "P27-"`: **P27-1~4 4 passed**(+ setup). 회귀 확인으로 `trading-workbench.spec.ts` 전체를 돌렸다: **73 passed**
- relay `fanout.test.ts`: 83 passed

## Known Stubs

없음.

## User Setup Required

없음. 배포는 executor 범위 밖이다(27-09).

## Next Phase Readiness

- 실서버 확인 거리: relay 가 인증 직후 84 를 내려야 새 카드가 사용자 값으로 열린다. 84 가 오지 않으면 D-04 상수로 열린다. 이 경우 오류는 아니지만 `/me` 에서 바꾼 값이 반영되지 않는다.
- `state.update-progress` 는 추적되지 않은 Phase 28 플랜 파일까지 센다. 그래서 total_plans 는 추적값 기준으로 유지했다(STATE 갱신 참조).

## Self-Check: PASSED

- FOUND: webapp/src/lib/limit-chaser.ts (`export function seedFromUserSettings`)
- FOUND: webapp/src/components/trading/limit-chaser-form.tsx (`seedFromUserSettings` 2회)
- FOUND: webapp/e2e/specs/trading-workbench.spec.ts (`P27-4`)
- FOUND: 48e29a4c · 1992be4f
