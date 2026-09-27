---
phase: 24-limitchaser-buy3
plan: 06
subsystem: webapp-trading-lc + relay-ws
status: complete
tags: [limit-chaser, buy3, companions, arm-guard, precheck, pitfall-5, d-01, d-02, d-16]
requires:
  - 24-04 (매수 카드 4장 · SettingGroup.precheckText 슬롯 · 그룹 스위치)
  - 24-05 (StrategySubmitCause 'serverFold' · 카드 handleSent(cfg, meta) · pendingCauseRef)
provides:
  - "useLcFieldCommit.commit(field, value, kind, companions?, meta?) · Pending.companions/prevCompanions/meta · onSent(cfg, meta)"
  - "LC_GATE_FIELDS 6종(마스터 · 선/추가/후매수 · 매도 · 취소잔량 — 한방 제외) · lcGroupAmountBlockOf(D-03) · LC_COMMIT_TEXT 사전 검증 4문구 + D-16 원문"
  - "폼 commitGroupSwitch(D-01/D-02 전반) · isServerFoldEdge · dropMasterAfterServerFold(D-02 후반 · 가드 4개)"
  - "그룹별 무장 가드 — 웹 canArmOf/canArmStaticOf/armBlockOf ↔ relay #strategyArmable(buy · preBuy · extraBuy · postBuy · sweep · sell)"
  - "groupPrechecksOf/groupPrecheckOf · 사전 검증 줄 배선 · props bestBid · onClientLog"
  - "StrategyCardState.pushClientLog(queueMicrotask) · card-body bestBid/onClientLog 배선"
affects: [24-07, 24-08, 24-09]
plan_head_before: c5546bf31c986b1f7618ed2b707185cbe2be933f
estimate:
  tokens: 95000
actuals:
  tokens: 32448
  tasks: 3
  commits: 6
tech-stack:
  added: []
  patterns:
    - "동반 필드(companions) — 한 확정 = 한 lc.set · 성공 판정은 주 필드만 · 낙관/되돌림은 동반 포함"
    - "에코 경로 제출은 폼 dropMasterAfterServerFold 한 곳 — 하강 전이 판정 순수 함수 + 다음 틱 + 보내기 직전 재확인"
    - "정적 무장 판정(가격 0 → disabled · 패널)과 누르는 순간 판정(수량 · 그룹 고유 → 카드 사전 검증 줄) 분리(R7)"
    - "클라 합성 로그는 queueMicrotask 로 한 박자 늦춰 같은 렌더의 에코 전이 줄 뒤에 쌓는다"
key-files:
  created: []
  modified:
    - webapp/src/components/trading/lc/use-lc-field-commit.ts
    - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - relay/src/ws/fanout.ts
    - relay/tests/fanout.test.ts
    - webapp/src/components/trading/card/card-body.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/__tests__/card-body.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
key-decisions:
  - "한방(sweepEnabled)은 LC_GATE_FIELDS(등록 필드)에서 뺐지만 끄는 방향 면제(무장 가드 · 금액 먼저 가드)는 isDisarm 으로 유지 — 한방 끄기는 여전히 무장 해제(T-16-44)"
  - "스위치 disabled · 「켤 수 없는 이유」 패널은 가격 0(시세 미수신)만 — 그룹 수량 0 은 누르는 순간 그 카드 사전 검증 줄(R7). 값 확정 경로(armBlockOf)의 수량 0 문구는 「{그룹} · 금액이 주문가격보다 작아 …」"
  - "D-02 후반 재접속 가드: disabled 동안 기준선을 비우고, 재접속 뒤에도 옛 에코 객체가 그대로면 기준선으로 삼지 않는다(첫 lc.snap 이 기준선)"
  - "사전 검증 줄 정리는 groupPrechecksOf(실패 전부)에 띄운 문구가 남아 있는지로 판정 — 「같은 검증이 통과하면」을 정확히 따른다. 통과한 누르기는 그 카드 줄을 비운다"
  - "사유 없는 onSent 는 인자 하나로 부른다(기존 toHaveBeenCalledWith(cfg) 계약 유지)"
metrics:
  duration: 23min
  completed: 2026-09-28
  tasks: 3
  files: 11
coverage:
  - id: D1
    description: "확정 훅 companions — 한 확정 = 한 lc.set · 주 필드 성공 판정 · 거부/무응답/끊김/대기 폐기 때 동반 되돌림 · no-op 동반 포함 · meta 전달"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx#companions"
        status: pass
    human_judgment: false
  - id: D2
    description: "그룹 스위치 D-01/D-02 전반 동반 · D-05 · 미등록 그룹 켜기 = 등록"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#⑰"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-02 후반 서버 접힘 뒤 마스터 자동 끔 — 하강 전이 1회 · 재수신 0 · 첫 스냅샷 0 · 재접속 0 · 삭제 가드 0 · in-flight 대기 1 · 그룹 재ON 0 · 거부 뒤 재시도 0"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#⑰-b D-02 후반"
        status: pass
    human_judgment: false
  - id: D4
    description: "그룹별 무장 가드 웹 ↔ relay 동형 · Pitfall 5(후매수만 + 선매수 금액 0 게이트웨이 도달)"
    verification:
      - kind: integration
        ref: "relay/tests/fanout.test.ts#⑰-i1..⑰-i7 · ⑰-h · ⑰-h2 · ⑰-e4"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#⑩"
        status: pass
    human_judgment: false
  - id: D5
    description: "그룹 켜기 사전 검증 줄(D-03 · D-04a/R8 · 수량 0 · D-10 · 반등 · D-27) · 사라지는 때 3조건 · D-16 로그 · D-11 재제출 값"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#⑱"
        status: pass
      - kind: e2e
        ref: "playwright:e2e/specs/trading-workbench.spec.ts#10. 스위치 즉시 전송"
        status: pass
    human_judgment: true
    rationale: "사전 검증 줄의 시각(12.5px · 2~3줄 접힘 · 카드 폭) · D-02 후반 로그 문장 모양은 24-08 사람 확인 몫"
---

# Phase 24 Plan 06: 그룹 스위치 동작 — 동반 제출 · 그룹별 무장 가드 · 사전 검증 Summary

선 · 추가 · 후매수 스위치에 WinForms 24-06 과 같은 손동작 결과를 붙였다. 그룹을 켜면 마스터가 같은 `lc.set` 에 켜진다(D-01). 마지막 그룹을 끄면 마스터가 같이 꺼진다(D-02 전반). 서버가 그룹을 모두 접으면 다음 틱에 마스터 OFF 를 딱 한 번 보낸다(D-02 후반 · 가드 4개). 누르는 순간의 사전 검증은 그 카드 안 한 줄로 말하고, D-16 은 전략 로그 한 줄로만 막는다. 첫 관문(웹 `canArmOf`)과 마지막 관문(relay `#strategyArmable`)은 같은 커밋에서 그룹별 식으로 바꿨다.

## Performance

- **Duration:** 23 min
- **Started:** 2026-09-27T18:42:01Z
- **Completed:** 2026-09-27T19:05:04Z
- **Tasks:** 3/3
- **Files modified:** 11

## Accomplishments

- **확정 훅 companions:** 새 훅을 만들지 않고 `useLcFieldCommit` 에 `companions` · `meta` 만 더했다. cfg 는 서버 동기값 + 동반 + 주 필드다. 무장 · 범위 가드도 합친 값으로 본다. 성공은 주 필드로만 판정한다. 낙관 표시와 되돌림(거부 · 무응답 · 끊김 · 대기 폐기 · 고아 장벽)은 동반 필드까지 함께 한다. no-op 은 동반 필드까지 서버 값과 같을 때만이다. 대기 중 같은 필드를 다시 확정하면 값 · 동반 · 사유를 교체한다. `onSent(cfg, meta)` 로 보낸 사유를 넘긴다.
- **그룹 스위치:** `commitGroupSwitch` 는 사람의 스위치 핸들러에서만 불린다. D-01 은 `{ buyEnabled: true }`, D-02 전반은 `{ buyEnabled: false }` 를 동반한다. 삭제 경로는 `crudOf` 가 그대로 판정한다(확인창 없음).
- **D-02 후반:** `isServerFoldEdge(prev, next)` 는 순수 함수다. `dropMasterAfterServerFold` 가 에코 경로에서 제출을 만드는 유일한 곳이다. 가드는 넷이다. ① 매도 · 취소 게이트가 전부 OFF 면 보내지 않는다. ② 보내기 직전 최신 에코로 다시 확인한다. ③ in-flight · 대기 확정이 있으면 기다린다. ④ 하강 전이에서만 보낸다(재접속이면 기준선을 비운다). 보낼 때 `cause: 'serverFold'` 를 실어 24-05 로그 문장이 서게 했다.
- **그룹별 무장 가드:** 웹과 relay 가 같은 식이다. 마스터는 주문가격 · 비교가격만 본다. 그룹은 그 그룹 수량을 본다. 한방은 선매수 ∧ 한방가격 0 일 때만 막는다. 스위치 `disabled` 와 패널은 가격 0 일 때만 선다. 패널 문구는 UI-SPEC 5문구로 바꿨다.
- **사전 검증 줄:** 순서는 금액(선매수 D-04a · 추가/후 D-03) → 수량 0 → D-10 → 반등 → D-27 이다. 누르는 순간 판정하고, 전송은 0 이며 스위치는 움직이지 않는다. 줄은 세 조건에서 사라지고 늘 한 줄이다. 실패해도 카드를 자동으로 펼치지 않는다. R8 에 따라 선매수 D-04a 차단을 폼 맨 위 줄에서 선매수 카드 줄로 옮겼다.
- **D-16 · 클라 로그 통로:** `bestBid`(호가 `bp[0]`)와 비교가격이 같으면(둘 다 > 0) 제출하지 않는다. 대신 `onClientLog` 로 원문 한 줄(error)만 남긴다. 카드 `pushClientLog` 는 `queueMicrotask` 로 쌓아 같은 렌더의 에코 전이 줄 뒤에 온다.

## Task Commits

1. **Task 1: 확정 훅 companions** — `5af50405`(test RED) · `81165848`(feat GREEN)
2. **Task 2: 그룹 스위치 D-01/D-02 · D-02 후반 · 그룹별 무장 가드** — `90cb40aa`(test RED) · `85272479`(feat GREEN)
3. **Task 3: 사전 검증 줄 · D-16 · 클라 로그 통로 · D-11** — `dfdb33e8`(test RED) · `d106c80e`(feat GREEN)

## 검증

| 명령 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx src/components/trading/lc/__tests__/lc-tracer.test.tsx` | 88 passed |
| `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts` | exit 0 · 61 passed |
| `pnpm --filter @gh-radar/relay exec vitest run` (relay 전체) | 28 files · 651 passed |
| `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/limit-chaser-form.test.tsx -t "D-02 후반" --reporter=verbose` | 9 passed(하강 1 · 재수신 0 · 첫 스냅샷 0 · 재접속 0 · 삭제 가드 0 · in-flight 1 · 그룹 재ON 0 · 거부 재시도 0 · 자기 에코 0) |
| `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading src/lib src/components/layout` | 81 files · 2085 passed · 1 skipped |
| `pnpm --filter @gh-radar/webapp exec vitest --run` (webapp 전체) | 125 files · 2634 passed · 1 skipped |
| `pnpm --filter @gh-radar/webapp run typecheck` | exit 0 (tsc + tsconfig.e2e) |
| `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts --grep-invert "5\. 격자\|P20-3 최악값\|iPhone 가로 폭 844"` | 50 passed (기존 실패 3건 제외 — deferred-items.md) |

수용 grep 결과는 다음과 같다. `companions` 22 · `export function lcGroupAmountBlockOf` 1 · 게이트 3종 나열 1 · `LC_GATE_FIELDS` 안 `sweepEnabled` 0 · `StrategySubmitCause` 3. relay 는 `extraBuyOrderQty === 0` · `postBuyOrderQty === 0` · `buyWatchPrice === 0` 이 각 1이다. 폼은 `buyEnabled: true }` 1 · `buyEnabled: false }` 1 · `commitGroupSwitch` 1 · `isServerFoldEdge|dropMasterAfterServerFold` 2 · `cause: 'serverFold'` 2 · 「주문금액이 매수가격보다」 0 · `function groupPrecheckOf` 1 이다. D-16 원문 1 · `queueMicrotask` 2(주석 1 + 코드 1) · `onClientLog={` 1 · `bestBid={` 1 이다. `toast|Dialog|AlertDialog` 은 변경 전 0, 변경 후 0 이다.

## Decisions Made

frontmatter `key-decisions` 참고. 요약하면 다섯 가지다.

- 한방은 등록 필드에서 뺐지만 끄기 면제는 유지했다.
- 패널과 `disabled` 는 가격 0 만 다룬다.
- 재접속 뒤에는 옛 에코 객체를 기준선으로 쓰지 않는다.
- 사전 검증 줄은 띄운 문구의 검증이 통과했는지로 정리한다.
- 사유 없는 `onSent` 는 인자 하나로 부른다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 무장 해제 보장] 한방 끄기 면제 유지(`isDisarm`)**
- **Found during:** Task 1
- **Issue:** `LC_GATE_FIELDS` 에서 `sweepEnabled` 를 빼면 `isGateField` 기반 끄기 면제도 함께 사라진다. 그러면 무장 불가나 D-04a 상태에서 한방 체크를 끄는 확정이 막힌다(T-16-44 회귀).
- **Fix:** `isDisarm(field, value)` 를 두었다. 게이트를 끄거나 한방을 끄면 무장 해제로 보고, `lcAmountBlockOf` · 전송 직전 무장 가드가 둘 다 이것을 쓴다. 테스트 「끄는 방향 한방 체크는 무장 가드를 지나지 않는다」를 더했다.
- **Commit:** 81165848

**2. [Rule 3 - Blocking] 사유 없는 `onSent` 는 인자 하나로 부른다**
- **Found during:** Task 1
- **Issue:** `onSent(cfg, undefined)` 로 부르면 기존 `toHaveBeenCalledWith(cfg)` 단언이 깨진다(인자 개수가 다르다).
- **Fix:** meta 가 있을 때만 둘째 인자를 넘긴다. 받는 쪽에서 둘째 인자는 어느 경우든 `undefined` 라 계약상 같다.
- **Commit:** 81165848

**3. [Rule 3 - Blocking] relay · e2e 기존 단언을 그룹별 가드에 맞춤**
- **Found during:** Task 2
- **Issue:** 새 식에서는 옛 전제 네 곳이 성립하지 않는다.
  - ⑰-e4(마스터 ON ∧ 수량 0 → `buy`)
  - ⑰-h(선매수 없이 한방가격 0 → 거부)
  - ⑰-h2(한방이 매수 수량을 요구)
  - e2e 10(수량 0 이면 마스터 disabled)
- **Fix:** 네 곳을 다음처럼 바꿨다.
  - ⑰-e4 → 주문가격 0 으로 `buy` 갈래
  - ⑰-h → 선매수 ON 추가
  - ⑰-h2 → 「선매수 OFF 면 한방가격 0 통과」로 재작성
  - e2e 10 → 마스터 활성 · 패널 없음 단언, 선매수를 누르면 사전 검증 줄(잘림 0 · 전송 0 · 금액 확정 뒤 사라짐)을 실브라우저로 확인하는 단계 추가
- **Commits:** 90cb40aa · 85272479 · d106c80e

**4. [Rule 3 - Blocking] card-body 테스트 픽스처에 `pushClientLog` 추가**
- `StrategyCardState` 에 필드가 생겨 `cardState()` 픽스처가 타입 오류가 났다. 24-05 의 `fired` 제거와 같은 종류다.
- **Commit:** dfdb33e8

**5. [테스트 수정] 순서 테스트를 GREEN 커밋에서 고쳤다**
- **Issue:** RED 판 순서 테스트는 `await act(async)` 안에서 `pushClientLog` 를 직접 불렀다. 그 경우 React 가 렌더를 flush 하기 전에 microtask 가 먼저 돌아서, 실제 경로(자식 이펙트 → 부모 이펙트 → microtask)를 흉내 내지 못했다.
- **Fix:** 에코 렌더에서 자식 이펙트가 `pushClientLog` 를 부르는 `Probe` 로 다시 썼다. `queueMicrotask` 를 직접 호출로 바꾸면 이 테스트가 실패하는 것을 뮤테이션으로 확인했다(판별력 있음).
- **Commit:** d106c80e

**6. [계획 해석] 몇 군데를 계획 문구보다 넓거나 다르게 구현했다**
- `groupPrecheckOf(gate, values, amountRequired)` 는 `<action>` 의 시그니처를 따랐다(`<Artifacts>` 표의 `(slot, values, server)` 와 다르다). 「사라지는 때 ①」 판정용으로 `groupPrechecksOf`(실패 목록)를 곁에 두었다.
- 재접속 가드는 계획보다 한 단계 더 엄격하다. `disabled` 때 기준선을 비우는 데 더해, 재접속 뒤 남아 있는 옛 에코 객체를 기준선으로 삼지 않는다.
- 검증을 통과한 누르기는 그 카드 줄을 비운다(③ 교체 규칙의 일반화).
- 폼은 같은 에코 경로 판정을 위해 `serverRef` 를 사전 검증 기준값과 D-02 후반 재확인에 함께 쓴다.

**Total deviations:** Rule 2 1건 · Rule 3 3건 · 테스트 수정 1건 · 해석 1건. **Impact:** 아키텍처 변경 없음 · 새 훅이나 새 전송 경로 없음.

## 뒤 플랜이 닫아야 할 것

- **24-07(선매수 자동 체크 D-06/D-07):** `commit(gate, true, 'toggle', { buyEnabled: true, …자동 체크 동반 })` 로 companions 를 그대로 쓴다. 자동 체크 요약 로그는 `onClientLog`(→ 카드 `pushClientLog`)로 남기면 된다. microtask 순서는 이미 보장된다. 선매수 켜기 경로는 지금 `commitGroupSwitch` 의 켜는 갈래 끝(`commitField(gate, true, 'toggle', …)`)이 삽입 지점이다. 자동 체크는 사람 손일 때만 넣어야 한다(에코 경로 금지 — D-08).
- **24-08(사람 확인):** 사전 검증 줄 시각을 사람이 확인해야 한다(12.5px · 긴 문구 2~3줄 · 카드 폭 · 접힘/펼침 위치). D-02 후반 실제 흐름(서버 접힘 → 마스터 자동 끔 → 로그 「서버가 매수 그룹 해제 — …」)과 D-16 로그 줄, 무장 불가 패널 한 줄 병합(「매수주문 · 선매수 · 추가매수 · 후매수 · …」)도 확인 대상이다.
- **24-09(배포):** relay `#strategyArmable` 식이 바뀌었다. 옛 웹 탭은 옛 `canArmOf`(마스터 = 선매수 수량)라 새 relay 보다 엄격하므로 거부가 새로 생기지는 않는다. relay 먼저 · push 나중 순서는 그대로다.
- **잔여 위험(설계상 수용):** 같은 계정에서 여러 탭이나 단말이 열려 있으면 서버 접힘 하강 전이 때 각 탭이 한 번씩 마스터 OFF 를 보낼 수 있다. 결과는 같은 값이라 idempotent 하다. 먼저 도착한 에코가 마스터 OFF 면 뒤 탭은 가드 ②(보내기 직전 재확인)에서 멈춘다. WinForms `b066e135` 도 창마다 같은 구조다.
- **엣지:** 레거시(선매수 금액을 서버가 모름)이면서 추가/후매수 금액은 > 0 인 조합에서 그 그룹을 켜면, 훅의 D-04a 차단이 폼 맨 위 줄로 간다(카드 줄이 아니다). 레거시 에코는 신필드 금액도 0 이라 실제로는 D-03 카드 줄이 먼저 뜬다.

## Known Stubs

없음. `bestBid` · `onClientLog` 는 카드가 실제 값(호가 `bp[0]` · `pushClientLog`)으로 배선했다.

## Deferred Issues

`deferred-items.md` 의 기존 e2e 실패 3건(5. 격자 · P20-3 최악값 · iPhone 844 16px)은 그대로다. 이번 변경과 무관해서 `--grep-invert` 로 뺐다.

## TDD Gate Compliance

`check tdd-red-evidence` 를 돌렸다. vitest `tap-flat` 출력에 `# tests/pass/fail` 요약 줄을 붙여 기록했다.

- Task 1: `test(24-06)` 5af50405 — RED 14 failed / 71, RED_EVIDENCE_OK(target 「D-01 — 그룹 켜기 + 동반 마스터 …」) → `feat(24-06)` 81165848 green
- Task 2: `test(24-06)` 90cb40aa — 웹 RED 18 failed / 126, RED_EVIDENCE_OK(target 「D-02 후반 — 하강 전이 …」) · relay RED 7 failed / 61, RED_EVIDENCE_OK(target 「⑰-i1 Pitfall 5 …」) → `feat(24-06)` 85272479 green
- Task 3: `test(24-06)` dfdb33e8 — RED 13 failed / 236, RED_EVIDENCE_OK(target 「D-03 — 추가매수 금액 0 에서 켜기 …」) → `feat(24-06)` d106c80e green. 순서 테스트는 GREEN 커밋에서 모양을 고쳤다(Deviation 5).

## Threat Flags

없음. 새 네트워크 표면 · 인증 경로 · 스키마 변경이 없다. 에코 경로 자동 제출(D-02 후반)은 플랜 threat register T-24-25 의 계획된 표면이다. 이행 내역:
- T-24-24: 웹 · relay 가드를 같은 커밋에서 그룹별로 바꿨고, relay 갈래마다 짝 웹 식을 주석으로 적었다. Pitfall 5 회귀는 ⑰-i1 이 잡는다. 웹은 relay 와 같거나 더 엄격하다(한방은 마스터를 보지 않는다).
- T-24-25: 에코 경로 제출은 한 곳이다. 하강 전이 · 재수신 · 첫 스냅샷 · 재접속 · 자기 에코 · 삭제 조합 · in-flight · 재확인 · 재시도 없음을 단위 테스트 9경로로 고정했다. 사전 검증 정리 이펙트는 전송 0 을 단언한다.
- T-24-26: D-16 은 0 을 치환하지 않는다(`bestBid 0` 이면 허용 테스트). 가격 0 이면 스위치가 `disabled` 다.
- T-24-27: 반등 1~100 사전 검증을 두었다.
- T-24-28: D-02 삭제(crud D · 확인창 없음)를 테스트로 고정했다.
- T-24-29: 재제출 cfg 에 `postBuyReentryLeft` · `postBuyPhase` 키가 없음을 단언한다.

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/lc/use-lc-field-commit.ts · webapp/src/components/trading/limit-chaser-form.tsx · relay/src/ws/fanout.ts · webapp/src/components/trading/card/strategy-card.tsx · webapp/src/components/trading/card/card-body.tsx
- FOUND commits: 5af50405 · 81165848 · 90cb40aa · 85272479 · dfdb33e8 · d106c80e
