---
phase: 24-limitchaser-buy3
plan: 07
subsystem: webapp-trading-lc
status: complete
tags: [limit-chaser, buy3, pre-buy-auto-check, d-04, d-06, d-07, d-08, d-17, d-20, list-shares-seed]
requires:
  - 24-06 (commitGroupSwitch · companions · onClientLog → 카드 pushClientLog(queueMicrotask))
  - 24-05 (D-01 로그 「선매수 체크 — 매수주문도 켬」 · 카드 handleSent 귀속)
provides:
  - "preBuyAutoChecksOf · preBuyAutoCheckLogLine · PreBuyAutoCheckResult/Item/Reason (webapp/src/lib/limit-chaser.ts)"
  - "seedListSharesDefaults · LIST_SHARES_SEED_PERMILLE · LIST_SHARES_SEED_PERCENT · UINT32_MAX · ListSharesSeed"
  - "defaultLimitChaserForm D-04 — buyOrderAmount 4000 · sellQtyTrackRatio 55"
  - "LimitChaserForm listShares prop · 선매수 켬 갈래 자동 체크 동반 · 성공 뒤 onClientLog · 시딩 이펙트(touchedRef · seededRef)"
  - "card-body listShares={quote.ls > 0 ? quote.ls : 0}"
affects: [24-08, 24-09]
plan_head_before: 475d5f08dc6d0601084d33370ed7d84969a74a4e
estimate:
  tokens: 65000
actuals:
  tokens: 12139
  tasks: 2
  commits: 4
tech-stack:
  added: []
  patterns:
    - "사람 손 전용 동반 필드 — 순수 함수가 동반 필드 · 생략 사유를 산출하고 폼은 스위치 핸들러에서만 부른다(에코 경로 0)"
    - "성공 대기 로그 — 보낸 순간 성공 카운터(seqAtSend)를 적어 두고, 주 필드 성공 렌더에서만 onClientLog · 실패면 버림"
    - "폼당 1회 시딩 — seededRef 가드 + 사람이 확정한 칸(touchedRef) 제외 + setForm 한 번(제출 · 로그 · 강조 0)"
key-files:
  created: []
  modified:
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/lib/__tests__/limit-chaser.test.ts
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
    - webapp/src/components/trading/card/card-body.tsx
    - webapp/src/components/trading/__tests__/card-body.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
key-decisions:
  - "planner 해석 유지: 취소 매수잔량 0 이면 취소>잔량추적도 켜지 않는다 — 서버 §9 ②′ 가 cancel_qty_track ∧ !cancel_qty 면 취소 3플래그를 모두 눕히므로, UI-SPEC 로그 예시대로 켜면 자동 체크한 취소>체결까지 조용히 꺼진다(D-07 위반)"
  - "자동 체크 판정 기준은 formRef.current 가 아니라 이 제출이 실을 서버 동기값(lcBaseValues) — 훅 cfg 가 formFromServer(server, form) + 동반 필드라 같은 값을 봐야 한다"
  - "켤 것이 없고 생략만 있으면 「켬」 조각을 빼고 「선매수 자동 체크 — 켜지 않음: …」 · 가격은 실제로 채운 칸만 이름을 댄다(한쪽만 채웠으면 「매도 주문가격」/「매도 비교가격」)"
  - "로그는 주 필드(preBuyEnabled) 성공 렌더에서만 — 다른 필드 성공은 계속 기다리고, preBuyEnabled 실패(거부 · 무응답 · 끊김 · 대기 폐기)면 버린다. 성공 시점 에코가 선매수 OFF 면(그새 다시 끔) 쓰지 않는다"
  - "시딩 가드는 WinForms 순서 그대로 — listShares ≤ 0 이면 가드 미소진, > 0 이고 서버 전략이 있으면 가드만 소진"
  - "삭제 뒤 remount 된 새 폼도 새 전략이라 시딩한다(폼당 1회 = 인스턴스당 1회) — e2e 14 기대값을 시딩 값으로 바꿨다"
metrics:
  duration: 17min
  started: 2026-09-27T19:10:36Z
  completed: 2026-09-28
  tasks: 2
  files: 8
requirements-completed: []
coverage:
  - id: D1
    description: "preBuyAutoChecksOf — 6체크 순서 · 이미 켜진 것 제외 · 0 매도 가격 = 상한가(알 때만) · 생략 사유 5종 · 순수"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/limit-chaser.test.ts#preBuyAutoChecksOf"
        status: pass
    human_judgment: false
  - id: D2
    description: "preBuyAutoCheckLogLine — 한 줄 문법 · info/error · 가격 조각 · 전부 켜짐이면 null"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/limit-chaser.test.ts#preBuyAutoCheckLogLine"
        status: pass
    human_judgment: false
  - id: D3
    description: "폼 — 사람 선매수 ON 에만 동반 · 성공 뒤 onClientLog 1회 · 거부 0 · D-08 에코/재접속 전송 0 · 끄는 방향 무변화 · 사전 검증 실패면 자동 체크 0"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#⑲"
        status: pass
    human_judgment: false
  - id: D4
    description: "카드 통합 — 자동 체크 줄이 D-01 줄 위(최신이 위) · 거부면 줄 없음"
    verification:
      - kind: integration
        ref: "webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx#24-07"
        status: pass
    human_judgment: true
    rationale: "실브라우저에서 로그 한 줄의 줄바꿈 · 색(error 빨강) · D-01 줄과의 순서는 24-08 사람 확인 몫"
  - id: D5
    description: "D-04 기본값 · seedListSharesDefaults · 폼 시딩(폼당 1회 · 손댄 칸 제외 · 서버 전략이면 생략 · 제출 0) · card-body listShares"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/limit-chaser.test.ts#seedListSharesDefaults · D-04"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#⑳"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-body.test.tsx#24-07"
        status: pass
      - kind: e2e
        ref: "playwright:e2e/specs/trading-workbench.spec.ts (50 passed, 기존 실패 3건 제외)"
        status: pass
    human_judgment: false
---

# Phase 24 Plan 07: 선매수 자동 체크 · 새 전략 기본값 · 상장주식수 시딩 Summary

사람이 선매수를 켜면 매도 · 취소 6체크가 같은 `lc.set` 에 동반으로 실린다. 서버나 relay 가 조용히 눕힐 조합은 미리 켜지 않고, 성공 에코 뒤 로그 한 줄로 사유를 알린다. 새 전략 폼은 WinForms 기본값 표(D-04)로 시작한다. 호가 프레임의 상장주식수가 오면 폼당 한 번 수량 5칸을 채운다(D-17).

**planner 해석(기록):** 취소 매수잔량이 0 이면 취소>잔량추적도 켜지 않는다. 서버 §9 ②′ 는 `cancel_qty_track ∧ !cancel_qty` 면 취소 3플래그를 모두 눕힌다. UI-SPEC 로그 예시대로 켜면 자동으로 켠 취소>체결까지 조용히 꺼지므로 WinForms `AutoCheckExitForPreBuy` 규칙을 따랐다.

## Performance

- **Duration:** 17 min
- **Started:** 2026-09-27T19:10:36Z
- **Completed:** 2026-09-27T19:27:19Z
- **Tasks:** 2/2
- **Files modified:** 8

## Accomplishments

- **`preBuyAutoChecksOf(values, upperLimit)`:** 매도주문 → 매도>잔량추적 → 매도>체결 → 취소 → 취소>체결 → 취소>잔량추적 순서로 판정한다. 이미 켜진 체크는 건드리지 않는다. 0 인 매도 주문가격 · 비교가격은 상한가를 알 때만 명시 값으로 채운다(D-20). 켜지 않은 항목은 첫 실패 사유 하나를 남긴다. 사유 우선순위는 상한가 미수신 → 매도 매수잔량 0 → 매도비율 0 → 취소 매수잔량 0 → 매도 체결 0 이다. 웹 D-07 추가 규칙으로 매도 매수잔량이 0 이면 매도 3체크를 모두 생략한다(relay sell 갈래가 프레임 전체를 거부하기 때문).
- **`preBuyAutoCheckLogLine`:** `선매수 자동 체크 — 켬: … / 켜지 않음: 항목(사유) · … / 매도 주문가격·비교가격 = 상한가 N원` 한 줄을 만든다. 생략이 있으면 error, 없으면 info 다. 전부 이미 켜져 있으면 null 이다.
- **폼 배선:** `commitGroupSwitch` 의 선매수 켜는 갈래에서만 계산한다. 사전 검증과 D-16 을 통과한 뒤다. 동반 필드는 `{ ...auto.companions, ...(마스터 OFF 면 buyEnabled: true) }` 이다. 로그 줄은 `pendingAutoCheckRef = { line, seqAtSend }` 에 둔다. 주 필드 성공 렌더에서 `onClientLog` 로 내보내고, 실패하면 버린다. 에코 · 재접속 · D-02 후반 경로에서는 부르지 않는다(D-08). `toast` 사용은 0건이다.
- **D-04 기본값:** 선매수 금액을 10만원에서 4,000만원으로, 잔량추적을 50 에서 55 로 바꿨다. 나머지 신필드 기본값(4,000만원 · 30% · 100,000주 · 3회)은 24-01 값이 표와 같음을 테스트로 고정했다.
- **`seedListSharesDefaults`:** 0.3% = `floor(ls*3/1000)`, 3% = `floor(ls*3/100)` 로 셈한다. 추가매수 최소 · 최대는 uint32 상한에서 멈춘다. `ls ≤ 0` 이면 null 이다.
- **폼 시딩:** `listShares` prop · `touchedRef`(인라인 · 시트 확정) · `seededRef` 를 두었다. 서버 전략이 있으면 가드만 소진한다. `ls` 가 0 이면 가드를 남긴다. 사람이 손댄 칸은 제외하고 `setForm` 을 한 번만 부른다. 제출 · 로그 · 강조는 만들지 않는다. card-body 는 `listShares={quote !== null && quote.ls > 0 ? quote.ls : 0}` 로 넘긴다.

## Task Commits

1. **Task 1: 선매수 자동 체크** — `d64c1597`(test RED) · `56e60554`(feat GREEN)
2. **Task 2: D-04 기본값 · D-17 시딩** — `e1e914e3`(test RED) · `a664e5e7`(feat GREEN)

## 검증

| 명령 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/limit-chaser.test.ts src/components/trading/__tests__/limit-chaser-form.test.tsx src/components/trading/__tests__/strategy-card-flow.test.tsx` (Task 1) | 3 files · 266 passed |
| `pnpm --filter @gh-radar/webapp exec vitest --run src/lib src/components/trading src/components/layout` | 81 files · 2126 passed · 1 skipped |
| `pnpm --filter @gh-radar/webapp exec vitest --run` (webapp 전체) | 125 files · 2675 passed · 1 skipped |
| `pnpm --filter @gh-radar/webapp run typecheck` | exit 0 (tsc + tsconfig.e2e) |
| `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts --grep-invert "5\. 격자\|P20-3 최악값\|iPhone 가로 폭 844"` | 50 passed (기존 실패 3건 제외 — deferred-items.md) |

수용 grep 결과:

- Task 1: `export function preBuyAutoChecksOf` 1 · `export function preBuyAutoCheckLogLine` 1 · 「선매수 자동 체크 — 켬: 」 1 · 폼 `preBuyAutoChecksOf(` 1 · 폼 `toast|useToast` 0
- Task 2: `export function seedListSharesDefaults` 1 · `defaultLimitChaserForm` 안 `buyOrderAmount: 4000|sellQtyTrackRatio: 55` 2 · card-body `listShares={` 1 · `4_294_967_295` 1

시각 확인: 임시 Playwright 측정으로 새 전략 카드를 확인했다. 스텁 상장주식수 5,969,782,550 으로 「17,909,347주」 · 「179,093,476주」가 시딩된 상태다. 뷰포트 360 · 390 · 768 · 1440 에서 세 그룹을 펼쳤고, 행 잘림 0 · 행 높이 초과 0 이었다. 측정용 테스트는 지웠다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 정확성] 자동 체크 판정 기준을 서버 동기값으로 잡았다**
- **Found during:** Task 1
- **Issue:** 계획은 `preBuyAutoChecksOf(formRef.current, …)` 였다. 그런데 훅이 보내는 cfg 는 `formFromServer(server, form)` + 동반 필드다. 폼 로컬 값과 서버 값이 갈리면 판정한 값과 보낸 값이 달라진다.
- **Fix:** 사전 검증과 같은 `base = lcBaseValues(serverRef.current, f)` 를 넘긴다. 미등록 전략이면 폼 값과 같다.
- **Commit:** 56e60554

**2. [Rule 1 - 오보 방지] 로그 방출 조건을 좁혔다**
- **Found during:** Task 1
- **Issue:** 계획 문구는 「다른 필드 성공이면 버린다」였다. 선매수 확정이 앞 건 뒤에 대기하면, 앞 건의 성공 때문에 자기 줄을 잃는다. 또 성공 카운터가 이전 선매수 성공으로 이미 올라 있으면 보낸 즉시 로그가 나간다.
- **Fix:** `seqAtSend` 를 적어 두고 `lastSuccessField === 'preBuyEnabled'` 인 새 성공만 인정한다. 다른 필드 성공이면 계속 기다린다. 선매수 실패면 버린다. 성공 시점 에코가 선매수 OFF 면 쓰지 않는다.
- **Commit:** 56e60554

**3. [Rule 3 - 테스트 픽스처] 기본 에코 금액 10만원이 수량 0 사전 검증에 막혔다**
- 카드 통합 테스트 픽스처 금액을 50만원으로 올렸다(RED 커밋 뒤 GREEN 에서). ⑲ 끄는 방향 테스트 픽스처에는 `postBuyReboundPct: 30` 을 넣었다. 레거시 0 은 범위 가드가 막는다.
- **Commits:** 56e60554 · d64c1597

**4. [Rule 3 - 기본값 변경 여파] 기존 테스트 기대값 4곳을 고쳤다**
- 폼 WR-07: 미등록 금액 행 「10만원」 → 「4,000만원」
- e2e 3: 기본값 「4,000만원」
- e2e 10: 수량 0 사전 검증 단계를 지키려고 금액을 먼저 10만원으로 로컬 확정한다
- e2e 14: 삭제 뒤 새 폼은 D-17 시딩 값 「17,909,347주」(스텁 `listShares` 기본 5,969,782,550)
- **Commit:** a664e5e7

**Total deviations:** 4건 — Rule 1 2건, Rule 3 2건. **Impact:** 아키텍처 변경 없음. 새 전송 경로 없음.

## 뒤 플랜이 닫아야 할 것

- **24-08(사람 확인):** 선매수 켬 한 번의 실제 흐름을 봐야 한다.
  - 매도 탭으로 자동 이동하지 않는다.
  - 매도 · 취소 스위치와 체크가 낙관 ON 이 된 뒤 에코로 확정된다.
  - 로그가 「선매수 자동 체크 — …」 한 줄 + D-01 줄 순서다. 생략이 있으면 줄이 빨강이다.
  - 새 전략 카드의 시딩 값 표시가 맞는다(360 폭에서 「체결량 17,909,347주」가 빠듯하지만 잘리지 않는다).
- **24-09(배포):** relay 변경은 없다(웹 전용). 옛 웹 탭은 자동 체크를 보내지 않을 뿐이라 새 relay 와 호환된다.
- **잔여(설계상 수용):** 서버가 동반 필드를 부분 거부해도(예: 매도 검증 실패 → `sell_enabled=false` + ERROR 원문) 성공 판정은 주 필드만 본다. 그래서 자동 체크 줄은 「켬: 매도주문 …」으로 남고, 서버 원문 ERROR 줄이 따로 선다. 조합 생략 규칙이 서버가 아는 거부 사유를 미리 피하므로 드문 경로다.

## Known Stubs

없음.

## Deferred Issues

`deferred-items.md` 의 기존 e2e 실패 3건(5. 격자 · P20-3 최악값 · iPhone 844 16px)은 이번 변경과 무관하다. 그래서 `--grep-invert` 로 뺐다.

## TDD Gate Compliance

`check tdd-red-evidence` 를 돌렸다. vitest `tap-flat` 출력에 `# tests/pass/fail` 요약 줄을 붙였다.

- Task 1: `test(24-07)` d64c1597 — RED 21 failed / 266, RED_EVIDENCE_OK. target 은 「전부 켤 수 있음 · 상한가 13,000 → 6체크 …」다. 이후 `feat(24-07)` 56e60554 로 green 이 됐다.
- Task 2: `test(24-07)` e1e914e3 — RED 14 failed / 275, RED_EVIDENCE_OK. target 은 「1,000만주 → 0.3% = 30,000 · 3% = 300,000」다. 이후 `feat(24-07)` a664e5e7 로 green 이 됐다.

## Threat Flags

없음. 새 네트워크 표면 · 인증 경로 · 스키마 변경이 없다. 이행 내역:

- **T-24-30:** `preBuyAutoChecksOf(` 호출은 폼에 1곳(`commitGroupSwitch` 선매수 켬 갈래)뿐이다. ⑲ 「D-08 — 에코 · 재접속 …」이 전송 0 · 로그 0 을 단언한다.
- **T-24-31:** relay sell 가드와 서버 §9 ②′ 에 걸릴 조합은 켜지 않는다. 사유는 error 줄로 남긴다.
- **T-24-32:** 시딩은 서버 전략이 있으면 0 이다. 폼당 1회이고, 손댄 칸은 제외하며, 제출이 없다. ⑳ 5경로로 확인했다.
- **T-24-33:** 상한가가 0 이면 채우지 않고 매도주문 · 취소 3종을 켜지 않는다.

## Self-Check: PASSED

- FOUND: webapp/src/lib/limit-chaser.ts · webapp/src/components/trading/limit-chaser-form.tsx · webapp/src/components/trading/card/card-body.tsx
- FOUND commits: d64c1597 · 56e60554 · e1e914e3 · a664e5e7
