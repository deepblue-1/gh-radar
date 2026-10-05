---
phase: 27-auto-sell-integration
plan: 05
subsystem: webapp (상따 카드 자동매도 바로시작 · 중지 — 41)
tags: [react, limit-chaser, auto-sell, in-flight, playwright, tdd]
status: complete

requires:
  - phase: 27-02
    provides: "relay autosell.cmd → 41 AutoSellCommandReq(action 1/2) · e2e readAutoSellCommandRequest · pushServerMessage"
  - phase: 27-04
    provides: "자동매도 그룹 카드 · SettingGroup footer 자리 · CardGroupStatus.autoSell · groupStatusClassOf · ChoiceRow"
provides:
  - "lib 판정 isAutoSellCommandRejection · autoSellButtonsOf · isAutoSellCommandSettled · AUTO_SELL_GROUP_FIELDS · autoSellStartBlocked · AUTO_SELL_PEND_TEXT · type AutoSellAction"
  - "isLimitChaserServerMessage 에 AutoSell · AutoSellCommand(결손 ③ — 카드 로그 · 전 종목 피드 [상따] 줄)"
  - "카드 훅 autoSellPending · onAutoSellCommand — 41 전용 3초 타이머 · 기대 전이 해제 · 54 거부 3출처 귀속 · 키 리셋"
  - "AutoSellActions(바로시작 · 중지 버튼 행) · pend 칩 점선 클래스 · 41 대기 중 자동매도 그룹 확정 잠금"
  - "e2e P27-3 바로시작 · 중지"
affects: [27-06 /me 기본설정, 27-07 84 시딩, 27-09 배포(relay 먼저)]

actuals:
  tokens: 16700     # chars/4 over git diff a53ce14e..HEAD (66,901 chars)
  tasks: 3
  commits: 3        # MEASURED rev-list a53ce14e..HEAD
plan_head_before: a53ce14e17789001fc1e5d11cdc2311c6ccf6b4f

tech-stack:
  added: []
  patterns:
    - "요청 in-flight 해제 조건이 「아무 에코」가 아니면 공용 ackTimer 를 쓰지 않고 전용 타이머를 둔다 — 키 일치 이펙트가 공용 타이머를 아무 에코에나 지운다"
    - "렌더 활성과 전송 가드는 같은 순수 함수 · 같은 입력(`autoSellButtonsOf(server)`)을 읽는다"
    - "in-flight 창 안의 거부 답은 표시 몫 가드에 OR 한다(armAnswer · autoSellAnswer) — 표시 몫 밖 출처(Relay i '')도 원문 줄이 선다"

key-files:
  created: []
  modified:
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/lib/__tests__/limit-chaser.test.ts
    - webapp/src/lib/__tests__/strategy-log-feed.test.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/__tests__/strategy-card.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
    - webapp/src/components/trading/card/card-body.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/lc/setting-group.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/src/components/trading/__tests__/card-body.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts

key-decisions:
  - "41 in-flight 동안 자동매도 그룹(스위치 · 값 · 방법 행) 확정을 막는다(상호 배제 · RESEARCH Pitfall 6). 다른 그룹은 막지 않는다 — D-07 「다른 그룹 무관」"
  - "41 은 send 를 열 때 unacked 를 내리지 않는다 — lc.set 의 「미반영」이 떠 있으면 41 이 그것을 지우지 않는다. 해제는 기대 전이 에코(키 일치 이펙트의 acceptAnswer)와 41 거부가 한다"
  - "버튼 활성은 세션 미준비(disabled)에서도 끈다 — send 가 어차피 false 라 누를 수 있게 둘 이유가 없다"
  - "stop 의 기대 전이 = !autoSellEnabled — 킬 스위치(CR-01)도 같은 에코라 성공으로 읽혀도 결과가 같다"
  - "41 거부 해제 키는 lv ERROR 만(AutoSellCommand · Account i·a 일치 · Relay i 빈) — INFO AutoSell 사유 줄과 WARN 은 해제하지 않는다"

requirements-completed: []

coverage:
  - id: D1
    description: "41 판정 — 거부 3출처 · 본문 미판독 · 버튼 규칙(에코 없음 · 2/3 중지 · 그 밖 바로시작) · 기대 전이 · D-07 그룹 필드만 · 표시 몫 AutoSell/AutoSellCommand"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/limit-chaser.test.ts#Phase 27 41 판정"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/strategy-log-feed.test.tsx#Phase 27 자동매도 54"
        status: pass
    human_judgment: false
  - id: D2
    description: "카드 41 상태 기계 — 1건 전송 · 비활성 action/null server/pending 중 무시 · send false 미추적 · 기대 전이만 해제 · 런타임 에코에 타이머 생존 · 3초 미반영 · 거부 3출처 해제 · Relay 줄 표시 몫 불변 · INFO 사유 유지 · 키 리셋 · 카드 격리"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx#Phase 27 41 in-flight"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-card.test.tsx#Phase 27 41 in-flight — 키 리셋 · 카드 격리"
        status: pass
    human_judgment: false
  - id: D3
    description: "버튼 행 렌더 — 펼친 마지막 행 · 접힘 없음 · 활성 규칙 · D-07 게이트(그룹 in-flight · 실패 / 다른 그룹 무관) · pend 칩 점선 · 그룹 확정 잠금 · 클릭 = onAutoSellCommand 1회 · 칩 덮기 배선"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#Phase 27 바로시작 · 중지"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-body.test.tsx#Phase 27 바로시작 · 중지 — 카드 본문 배선"
        status: pass
    human_judgment: false
  - id: D4
    description: "종단 — 41 action 1/2 바이트(isin · 계좌 · KRX) · 칩 전송…→매도중→없음 · 버튼 전환 · LED 매도중 · 54 AutoSellCommand 거부 [상따] 원문 · 미반영 없음 · 재전송 0"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P27-3 바로시작 · 중지"
        status: pass
    human_judgment: false
  - id: D5
    description: "버튼 행 시각 결(바로시작 빨강 채움 · 중지 float · 비활성 흐림 · pend 점선 칩)"
    verification: []
    human_judgment: true
    rationale: "실행 중 1280 · 390 · pend 스크린샷 4장으로 넘침 · 잘림 없음을 확인했지만 색 결은 사람 눈 판정이다"

duration: 15min
completed: 2026-10-05
---

# Phase 27 Plan 05: 자동매도 바로시작 · 중지(41) Summary

**자동매도 카드를 펼치면 맨 아래에 「바로시작」(빨강)과 「중지」 버튼이 있다. 누르면 확인창 없이 41 이 한 건 나가고, 칩이 「… 전송…」(점선)으로 바뀐다. 대기는 세 경우 중 먼저 오는 쪽으로 끝난다. ① 그 키의 60 에코가 기대 전이를 실었을 때 ② 54 거부 원문이 왔을 때 ③ 3초 동안 답이 없을 때(「미반영」만 표시)다. 재전송은 하지 않는다.**

## Performance

- **Duration:** 약 15 min
- **Started:** 2026-10-05T06:38Z
- **Completed:** 2026-10-05T06:53Z
- **Tasks:** 3/3
- **Files modified:** 12

## Accomplishments

- **lib(`limit-chaser.ts`):** 41 판정 함수 다섯 개와 pend 문구 상수를 더했다. `isLimitChaserServerMessage` 는 이제 `AutoSell` · `AutoSellCommand` 를 상따 몫으로 받는다(결손 ③). 그래서 자동매도 사유 줄과 41 거부 줄이 카드 로그와 전 종목 피드에 `[상따]` 배지를 달고 표시된다.
- **카드 훅(`strategy-card.tsx`):** `lc.arm` in-flight 구조를 복제했다. 다만 해제 조건은 기대 전이로 좁혔고, 41 **전용** 타이머를 따로 둔다. 54 스트림에서는 `autoSellAnswer` 를 표시 가드와 상태줄 가드에 OR 한다. 그래서 `Relay` 출처(i '') 거부도 원문 줄로 표시된다. 키가 바뀌거나 언마운트되면 대기와 타이머를 정리한다.
- **렌더:** `AutoSellActions` 를 자동매도 그룹 `footer` 에 넣었다. 활성 판정은 카드 전송 가드와 같은 `server` 를 읽는다. 바로시작은 자동매도 그룹 확정이 깨끗할 때만 활성이다(D-07). 41 대기 중에는 자동매도 그룹의 스위치 · 값 · 방법 행을 잠그고, 칩은 `AUTO_SELL_PEND_TEXT` 와 점선 테두리로 표시한다.
- **e2e P27-3:** 게이트웨이 바이트(41 action 1 · 2)부터 칩 · 버튼 · LED 전이, 거부 원문, 「미반영」 없음, 재전송 0까지 한 시나리오로 확인한다.

## Task Commits

1. **Task 1: 41 판정 · 버튼 규칙 · 기대 전이 · 54 표시 몫** — `da474fa5` (feat)
2. **Task 2: 카드 41 상태 기계 — 기대 전이 해제 · 전용 3초 · 54 거부 귀속** — `692dfc88` (feat)
3. **Task 3: 바로시작 · 중지 버튼 행 — D-07 게이트 · pend 칩 · 그룹 확정 잠금 + e2e P27-3** — `6a572f21` (feat)

## TDD 기록

- Task 1 RED: `-t "Phase 27"` 실행 결과 **8 failed** (판정 함수 미정의, 피드에 AutoSell 줄 없음). GREEN: 123 passed.
- Task 2 RED: flow 테스트 **12 failed**, 카드 테스트 2 failed(`onAutoSellCommand` 미정의). GREEN: 두 파일 99 passed(기존 lc.arm · lc.set 케이스 포함).
- Task 3 RED: **9 failed**(버튼 · 칩 · 잠금 없음). GREEN: form · card-body · lc 9 files, 663 passed.
- 테스트와 구현은 태스크 커밋 하나에 함께 넣었다(플랜의 커밋 3개 계약).

## 상호 배제 결정 (재량 — D-08 「같은 큐」 의 답)

- 41 은 `lc.set` 큐에 넣지 않는다. 대신 41 이 in-flight 인 동안(≤3초) **자동매도 그룹**의 스위치 · 값 · 방법 행 확정을 막는다. 41 즉답 에코가 그 확정의 답 신호로 섞이지 않게 하려는 것이다.
- 다른 그룹(매도주문 등)은 막지 않는다(D-07 「다른 그룹 무관」). 그 교차에서 생길 수 있는 일시 오판은 기존 런타임 에코와 같은 경로인 늦은 에코 전이가 흡수한다.
- 반대로, 자동매도 그룹 확정이 in-flight · 대기열 · 실패 상태이면 바로시작을 막는다(`autoSellStartBlocked`). 중지는 이 판정을 보지 않는다.

## WR-07 확인 (15:40 귀속 무변경)

- `git diff a53ce14e..HEAD -- webapp/src/lib/limit-chaser.ts` 에서 `limitChaserGateDisarmed` · `marketCloseReleaseKeysOf` · `cancelGateOf` 함수 본문을 바꾼 hunk 는 **0**이다. 새 41 단락의 주석에 두 함수 이름이 한 번 언급될 뿐이다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] card-body 테스트 픽스처에 새 카드 상태 2필드**
- **Found during:** Task 2 typecheck
- **Issue:** `StrategyCardState` 에 `autoSellPending` · `onAutoSellCommand` 를 더하자 `card-body.test.tsx` 의 `cardState()` 픽스처에서 TS2322 가 났다. 이 파일은 Task 3 의 파일이지만, Task 2 커밋이 타입 검사를 통과해야 했다.
- **Fix:** 픽스처에 `autoSellPending: null` · `onAutoSellCommand: vi.fn()` 두 줄을 넣었다.
- **Committed in:** `692dfc88`

**2. [계획 보정] 바로시작 · 중지 버튼 컴포넌트를 setting-group.tsx 에 둠**
- 플랜은 footer 를 폼에서 그리라고 했다. 표시 컴포넌트 `AutoSellActions` 는 `setting-group.tsx`(같은 플랜의 files)에 두었다. 폼은 활성 판정과 콜백만 넘긴다. 이 파일에는 ChoiceRow 같은 다른 그룹 표시 부품이 이미 있다.

---

**Total deviations:** 1 auto-fixed (Rule 3) + 계획 보정 1
**Impact on plan:** 범위는 넓어지지 않았다.

## Issues Encountered

- 프로젝트에 `timeout` 명령이 없어 Playwright 첫 실행이 바로 실패했다. 명령을 감싸지 않고 다시 실행했다.
- 실행 브랜치는 master 다. `gsd-tools git.base-branch --is-protected master` 는 true 를 반환하지만, 저장소 설정이 `branching_strategy: none` 이고 오케스트레이터 지시와 사용자 규칙(작업은 master 에서)을 따랐다. 앞선 27-0x 플랜과 같은 방식이다.

## Verification

- shared build → webapp typecheck(e2e tsconfig 포함): `error TS` 0
- `limit-chaser.test.ts` · `strategy-log-feed.test.tsx -t "Phase 27"`: 모두 ✓
- `strategy-card.test.tsx` · `strategy-card-flow.test.tsx` 전체: 99 passed(「Phase 27 41 in-flight」 14건, Account · Relay 거부 각 1건 포함)
- `limit-chaser-form.test.tsx` · `card-body.test.tsx -t "Phase 27"`: 「Phase 27 바로시작 · 중지」 ✓
- webapp 전체 단위: **140 files / 3294 passed (1 skipped)**
- e2e `-g "P27-"`: P27-1 · P27-2 · P27-3 **3 passed**. 추가로 P24-7 폭 최악값(344 · 685 · 830 · 992)과 a11y `/trading` 6종도 green 이다.
- 시각: 1280(앱 기본 다크) · 390 · pend 상태 스크린샷을 확인했다. 넘침 · 잘림 · 겹침은 없다. 확인용 캡처 코드는 spec 에 남기지 않았다.

## Known Stubs

없음.

## User Setup Required

없음. 배포는 executor 범위 밖이다(27-09). relay 를 먼저 배포해야 한다 — 옛 relay 는 `autosell.cmd` 를 close(4400) 한다.

## Next Phase Readiness

- 27-06(`/me` 기본설정) · 27-07(84 시딩)은 이 플랜과 독립이다.
- 27-09 배포 전에 실서버에서 바로시작 → 60 에코 state 3 전이가 실제로 오는지 한 번 확인하면 좋다. 이 플랜은 그 전이를 기대 전이의 정본으로 쓴다.

## Self-Check: PASSED

---
*Phase: 27-auto-sell-integration*
*Completed: 2026-10-05*
