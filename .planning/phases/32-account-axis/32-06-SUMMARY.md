---
phase: 32-account-axis
plan: 06
subsystem: relay+ui
tags: [relay, websocket, zod, hub-aggregation, react, playwright, vitest, kill-switch]

requires:
  - phase: 32-account-axis
    provides: "32-01 — /me 계좌 칩 · StrategyStatusCard accountNo · viTriggersOfAccount · accountFullLabelOf · 옛 전부 끄기 UI 삭제(8aa49eab 참고본)"
  - phase: 29
    provides: "29-54 14 송신자 꼬리표 FIFO · beginAllStop 집계 · 29-51 #viSessionFor · #stopViElsewhere 11 조립 · G-1 forAccount 소유 세션"
provides:
  - "새 인바운드 `strategies.disable.account` — shared RelayStrategiesDisableAccountMsg · relay zod RelayStrategiesDisableAccountSchema(accountNo = AccountNoSchema)"
  - "fanout #disableAccount — forAccount 소유 세션 · #accountAllowed(IDOR) · isActiveLimitChaser 키마다 14(key) · 그 계좌 가동 VI 11 run:false · 끌 것 0 → ACCOUNT_DISABLE_NOTHING_TEXT 거부"
  - "hub beginAccountStop(userId, session, { accountNo, keys, viExchanges }) → HubAccountStop { sent · failed · viFailed · done } — 65 k건 + VI 61 run:false 에코 → strategies.disabled 1건"
  - "웹 소켓 훅 킬 스위치 in-flight 창 = 카운터(보낸 수만큼 strategies.disabled 가 와야 닫힘) · 계좌 끄기 송신도 연다"
  - "/me 현황 카드 맨 아래 kill 줄(안내 + 「이 계좌 끄기」) · DisableAccountDialog(계좌 모드) · 계좌별 대기 목록 · 8초 백스톱 · 오류 줄 strategy-disable-account-error"
  - "E2E P32-disable"
affects: [32-09, 32-10, 32-13]

actuals:
  tokens: 24000
  tasks: 3
  commits: 5
plan_head_before: 48bd582d1255209d4dfeec741c8025a0b80709a4
plan_head_after: 012d0a59e5b6ebeb2ef1926d2de870621061a57c

tech-stack:
  added: []
  patterns:
    - "계좌 끄기 집계는 「전부 정지」 의 14 송신자 꼬리표 FIFO 를 그대로 쓴다 — DisableSender.tag 에 AccountStopCollection(kind: account) 추가 · AllStopCollection 에 kind: all 판별자"
    - "VI-only 완료 근거 = 서버가 보낸 61 run:false 에코(#onViTrigger 가 #emitVi 뒤에 #noteAccountStopVi) — 지어내지 않는다(N-01 과 충돌 없음)"
    - "웹 끄기 대기는 보낸 순서대로의 계좌 목록 + strategies.disabled 새 참조마다 맨 앞 해제 — relay 가 계좌 끄기 1건당 1프레임으로 접어 주는 것과 짝"

key-files:
  created: []
  modified:
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts
    - relay/src/ws/protocol.ts
    - relay/src/ws/fanout.ts
    - relay/src/hub/subscription-hub.ts
    - relay/tests/fanout.test.ts
    - relay/tests/fanout-multi-session.test.ts
    - relay/tests/hub-multi-session.test.ts
    - relay/tests/protocol.test.ts
    - relay/tests/fanout-access.test.ts
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/components/trading/strategy-status-card.tsx
    - webapp/src/components/trading/__tests__/strategy-status-card.test.tsx
    - webapp/e2e/specs/me.spec.ts

key-decisions:
  - "beginAccountStop 계획에 accountNo 를 더했다(플랜 시그니처 { keys, viExchanges } + accountNo) — VI 61 에코를 그 계좌 것으로만 세기 위해"
  - "VI 11 은 #viSessionFor 결과가 14 소유 세션과 같은 객체일 때만 보낸다 — 웨이브 ④ 전 VI 원천이 KB 세션이라 실제로는 늘 같다(갈리면 warn 후 VI 생략)"
  - "집계 끝의 팬아웃 조건 = 받은 65 ≥ 1 ∨ VI 에코를 봄 — 받은 것 0(전부 송신 실패 · 분리 · 시한)이면 0건(웹 8초 백스톱)"
  - "끌 것 없음일 때 버튼 비활성(nothingToDisable)은 Task 1 에 넣었다 — 그래야 Task 1 커밋에서 me.spec test 3 · P32-status 가 초록"
  - "kill 줄 버튼 색 = --up-bg 면 + --destructive 글자(목업 ⑥ .btn.danger) · 다이얼로그 실행 버튼은 테두리형(S-6)"
  - "E2E 는 relay.gateway.handleDisableStrategies 를 P32-disable 에서만 켜고 beforeEach 가 매번 끈다(reset() 이 되돌리지 않음)"

patterns-established:
  - "relay 신규 끄기 경로는 fanout 이 계획(키 수 · VI 거래소)을 정하고 hub 손잡이에 송신 결과만 알린다 — hub 는 서버 응답(65 · 61)으로만 완료를 판정"

requirements-completed: [AXIS-03]

coverage:
  - id: D1
    description: "(트레이서) 「이 계좌 끄기」 → strategies.disable.account → 소유 세션 14(key) 건별 → 65 k건 → strategies.disabled 정확히 1건 · 그 계좌만 꺼지고 다른 계좌 켜짐 · lc.set 0 · 빈 키 0"
    requirement: AXIS-03
    verification:
      - kind: integration
        ref: "relay/tests/fanout.test.ts#P32 계좌 끄기 트레이서 (D-09 보정)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts#P32-disable"
        status: pass
    human_judgment: false
  - id: D2
    description: "다른 서버 소유 계좌(G-1 · KB121 지정) — 14 는 그 서버 세션으로만 · 다른 서버 0바이트"
    requirement: AXIS-03
    verification:
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#P32 계좌 끄기 다세션 (G-1 · D-09 보정)"
        status: pass
    human_judgment: false
  - id: D3
    description: "IDOR — 세션 소유 뷰 밖 계좌는 「이 세션에서 사용할 수 없는 계좌입니다.」 거부 · 게이트웨이 0바이트 · strategies.disabled 0"
    requirement: AXIS-03
    verification:
      - kind: integration
        ref: "relay/tests/fanout-access.test.ts#P32 계좌 끄기 IDOR"
        status: pass
    human_judgment: false
  - id: D4
    description: "그 계좌 가동 VI 11 run:false(캐시 값 그대로) + 61 에코 완료 · VI 만이어도 1건(A4) · 끌 것 0 거부 프레임 · 시한 · 늦은 65 소비 · viFailed · 분리 · closeAll"
    requirement: AXIS-03
    verification:
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#P32 계좌 끄기 다세션 (G-1 · D-09 보정)"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#SubscriptionHub — P32 beginAccountStop 집계 (D-09 보정)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Pitfall 2 — 새 판별자 스키마(부재 · 빈 · 13자 거부) · 기존 strategies.disable 의 accountNo 는 strip(동작 불변)"
    requirement: AXIS-03
    verification:
      - kind: unit
        ref: "relay/tests/protocol.test.ts#P32 strategies.disable.account 스키마 (Pitfall 2)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Pitfall 3 — 웹 소켓 훅 in-flight 카운터(계좌 끄기도 창을 연다 · 두 번 보내면 strategies.disabled 두 건 뒤에 닫힘)"
    requirement: AXIS-03
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-socket.test.ts#P32 strategies.disable.account 도 in-flight 창을 연다"
        status: pass
    human_judgment: false
  - id: D7
    description: "/me kill 줄(S5′ · D-27) — 안내 + 「이 계좌 끄기」 한 줄뿐 · 끌 것 없으면 disabled · 계좌별 대기(칩 줄 비잠금) · 8초 백스톱 · 전송 실패 · 계좌 모드 다이얼로그(전체 라벨 · 기본 포커스 닫기)"
    requirement: AXIS-03
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-status-card.test.tsx#P32 이 계좌 끄기 (D-09 · D-27 · S5′)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts (31 passed — P32-disable · P32-status · 3)"
        status: pass
    human_judgment: false
  - id: D8
    description: "kill 줄 시각(--up-bg 면 · 빨강 글자 · 32 높이) — 목업 ⑥ .btn.danger 와의 시각 일치 · 대비"
    verification: []
    human_judgment: true
    rationale: "자동 테스트는 구조 · 문구 · 상태만 본다. 목업 대비 시각과 12px 글자 대비(--destructive on --up-bg ≈ 3.3:1)는 UI 리뷰 판정 몫"
  - id: D9
    description: "라이브 relay(20:00 KST 뒤 배포) 에서 실제 서버 65 · 61 에코로 계좌 끄기 1건 · 다른 서버 지정 계좌"
    verification: []
    human_judgment: true
    rationale: "relay 배포는 32-10 메인 세션 몫 · 실서버 2서버 소유 경로는 라이브 UAT(RESEARCH A6)"

duration: 23min
completed: 2026-10-16
status: complete
---

# Phase 32 Plan 06: 「이 계좌 끄기」 — 계좌별 끄기 relay 경로 · /me kill 줄 Summary

**새 인바운드 `strategies.disable.account` 를 relay 가 그 계좌 소유 세션으로 14(key) 건별 + 가동 VI 11 run:false 로 풀고, hub 가 65 k건과 61 에코를 모아 `strategies.disabled` 1건만 내며, /me 현황 카드 맨 아래 「이 계좌 끄기」 한 줄이 그 계좌만 잠그고 결과를 사실대로 말한다(D-09 보정 · D-21 · D-27)**

## Performance

- **Duration:** 약 23분(벽시계)
- **Started:** 2026-10-16T06:17:39Z
- **Completed:** 2026-10-16T06:40:18Z
- **Tasks:** 3 (트레이서 1 · TDD 2)
- **Files modified:** 15

## Accomplishments
- 새 메시지 타입(Pitfall 2) — 구 relay 는 판별 실패 4400 으로 아무것도 끄지 않는다. 기존 `strategies.disable` 스키마 · 동작 · `#allStopTargets` 무변경(protocol 테스트가 strip 회귀를 고정)
- fanout `#disableAccount` — 소유 세션(G-1) · IDOR 대조 · 켜진 키만 14 건별(`lc.set` 0 — Pitfall 1) · 가동 VI 는 캐시 값 그대로 run:false · 끌 것 0 이면 게이트웨이 0바이트 + 거부 프레임
- hub `beginAccountStop` — 같은 14 송신자 꼬리표로 65 귀속(대여 · 전부 정지 몫과 섞이지 않음) · VI 61 run:false 에코를 완료 조건에 · 시한 · 늦은 65 소비 · 분리 즉시 정리 · closeAll
- 웹 — in-flight 카운터(Pitfall 3) · kill 줄 + 계좌 모드 다이얼로그 · 계좌별 대기 · 8초 백스톱 · 전송 실패 문구

## Task Commits

1. **Task 1 (tracer): 한 경로 웹 → relay → 게이트웨이 → 웹** — `9b6f5799` (feat)
2. **Task 2: relay 완성(TDD)** — RED `52de4257` (test) → GREEN `df16a51b` (feat)
3. **Task 3: 웹 kill 줄 마무리(TDD)** — RED `ce8c7d86` (test) → GREEN `012d0a59` (feat)

`commits: 5` 는 `git rev-list --count plan_head_before..HEAD` 측정값이다(SUMMARY 커밋 제외).

## TDD

- **Task 2 RED** (`52de4257`): 8건 실패 — hub VI 에코 · VI 만 · VI 시한 · viFailed(손잡이 없음 TypeError) · 분리, fanout VI 11 · VI 만 · 끌 것 0. 전부 계획한 단언 지점(문법 · 임포트 · 픽스처 오류 0). 분류기: vitest junit 보고서(`--outputFile`)로 `gsd_run check tdd-red-evidence` → **RED_EVIDENCE_OK**(target 「분리 — … ended detached …」 · 57 tests · fail 5 · format junit). TAP(tap-flat)은 relay 로거(GCP pino)의 진단 줄이 TAP 앞에 섞여 Unsupported 로 거부돼 junit 으로 다시 돌렸다(보고서 무편집). 의미 판정: 그 target 은 `firstDone.value` 가 undefined 라서 실패 — Task 1 hub 가 분리 때 계좌 끄기 집계를 끝내지 않던 계획한 결손. IDOR · 스키마 · 다세션 소유 서버 케이스는 Task 1 구현으로 이미 통과(의도 — 회귀 잠금).
- **Task 2 GREEN** (`df16a51b`): 다섯 파일 265/265.
- **Task 3 RED** (`ce8c7d86`): 카드 6건 실패 — 안내 문구 · 끌 것 없음 줄 안내 · A 대기 중 B 열림 · 백스톱 해제 · 전송 실패 줄 · 다이얼로그 전체 라벨. 분류기 junit → **RED_EVIDENCE_OK**(target ④ 「A 대기 중 B 칩 …」 · 35 tests · fail 6). 의미 판정: B 버튼이 disabled — Task 1 의 단일 `pendingAccount` 가 모든 계좌를 잠그던 계획한 결손. relay-socket 카운터 케이스 · ③ · ⑧ · ⑨ 는 Task 1 구현으로 통과(의도).
- **Task 3 GREEN** (`012d0a59`): 두 파일 180/180 · me.spec 31/31.
- **REFACTOR:** 없음.

## Files Created/Modified
- `packages/shared/src/relay.ts` · `index.ts` — `RelayStrategiesDisableAccountMsg` · `RelayInbound` 합집합
- `relay/src/ws/protocol.ts` — `RelayStrategiesDisableAccountSchema` · `RelayInboundSchema` 등록
- `relay/src/ws/fanout.ts` — `strategies.disable.account` 분기 → `#disableAccount` · `ACCOUNT_DISABLE_NOTHING_TEXT`
- `relay/src/hub/subscription-hub.ts` — `beginAccountStop` · `HubAccountStop` · `HubAccountStopResult` · 65 갈래 · `#noteAccountStopVi` · 분리 · closeAll · 머리 표 「Phase 32 — 계좌 끄기 집계」
- `webapp/src/lib/use-relay-socket.ts` — in-flight 카운터 · 계좌 끄기 가로채기
- `webapp/src/components/trading/strategy-status-card.tsx` — kill 줄 · `DisableAccountDialog` · 계좌별 대기 · 백스톱 · 오류 줄
- 테스트: relay 5파일 · webapp 단위 2파일 · `e2e/specs/me.spec.ts`

## Decisions Made
- 위 frontmatter key-decisions 그대로. 요점: hub 계획에 `accountNo` 추가 · VI 11 은 14 소유 세션과 같은 세션일 때만 · 받은 것 0 이면 팬아웃 0 · 끌 것 없음 비활성은 Task 1 부터.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 이 깨뜨린 기존 단언을 Task 1 커밋에서 고침**
- **Found during:** Task 1
- **Issue:** kill 줄이 서면 `strategy-status-card.test.tsx` 「(D-27) 어느 계좌에서도 … 버튼 없음」 · me.spec `P32-status` · test 3 의 「카드 버튼 0」 단언이 깨진다(플랜은 이 고침을 Task 3 에 두었다).
- **Fix:** 단위 케이스를 「accountNo 없음 = kill 줄 없음 · accountNo 있음 = 「이 계좌 끄기」 하나뿐」 으로 좁히고, E2E 두 곳을 「버튼 1개 · 그 계좌 버튼 disabled」 로 바꿨다. 같은 이유로 `nothingToDisable` 비활성 조건을 Task 1 에 넣었다.
- **Files modified:** strategy-status-card.test.tsx · me.spec.ts · strategy-status-card.tsx
- **Verification:** Task 1 커밋 시점 단위 170/170 · E2E P32-disable · P32-status · 3 통과
- **Committed in:** `9b6f5799`

**2. [Rule 2 - 정합] hub 손잡이에 `viFailed` · 계획에 `accountNo` 추가**
- **Issue:** 플랜 손잡이(`sent` · `failed` · `done`)로는 VI 11 송신 실패를 알릴 길이 없어 그 에코를 시한까지 기다린다. VI 에코를 계좌로 가르지 않으면 같은 칸의 다른 계좌 에코가 완료로 잘못 셀 수 있다.
- **Fix:** `viFailed(exchange)` 와 계획 `accountNo` 를 더했다.
- **Committed in:** `52de4257` · `df16a51b`

**3. [Rule 2 - 정합] kill 줄 `data-pending` 속성**
- **Issue:** E2E 가 「완료 신호로 풀렸다」 와 「백스톱으로 풀렸다」 · 「끌 것 없어 비활성」 을 구분할 근거가 없었다(완료 뒤 A 는 끌 것이 없어 어차피 disabled).
- **Fix:** 고른 계좌가 대기 중이면 `data-pending="true"` — E2E 는 확인 직후 true → 7초 안에 해제 · 오류 줄 0 으로 완료 신호 해제를 단언한다.
- **Committed in:** `ce8c7d86` · `012d0a59`

---

**Total deviations:** 3 auto-fixed (Rule 3 ×1 · Rule 2 ×2)
**Impact on plan:** 범위 밖 변경 없음. relay 무인자 `strategies.disable` · `#allStopTargets` · 웹 무인자 가로채기 갈래는 그대로다.

## Issues Encountered
- RED 분류기 TAP 경로는 relay 로거의 모듈 로드 진단 줄이 보고서 앞에 섞여 Unsupported — vitest junit `--outputFile` 로 같은 대상을 다시 돌려 분류했다(보고서 무편집 · 분류 뒤 기록 파일 삭제).
- (관찰 · 미조치) kill 줄 글자 대비 `--destructive` on `--up-bg` ≈ 3.3:1 — UI-SPEC 이 정한 색이고 옛 「전체 비활성화」(흰 바탕 빨강 ≈ 3.7:1)와 같은 계열이다. a11y.spec `/me —` 는 통과했다(그 픽스처에서 버튼이 비활성일 수 있음). UI 리뷰 판정 몫(coverage D8).
- 기존 범위 밖 실패(trading-workbench P31-3)는 이 플랜에서 돌리지 않았다.

## Verification
- `shared build` · relay `typecheck` · `typecheck:tests` · webapp `typecheck`(tsc + e2e) — 통과
- relay 전체 `pnpm --filter @gh-radar/relay run test` — 57 파일 1583/1583
- webapp `vitest run src/components/trading src/lib --maxWorkers=2` — 99 파일 3144 통과 · 1 skip
- playwright `me.spec.ts --workers=1` 전체 — 31/31 · a11y.spec `/me —` 2/2(setup 포함)
- eslint(바뀐 webapp 파일) — 오류 0(기존 경고 1 · use-relay-socket 2052 · 범위 밖)
- 수용 기준 grep 3태스크 전부 기대값(전부 끄기 흔적 0 · `buildSetLimitChaserReq` 계좌 끄기 분기 0)

## Known Stubs
None.

## User Setup Required
None — 외부 서비스 설정 없음.

## Next Phase Readiness
- 배포 순서(Pitfall 15): relay 를 20:00 KST 뒤 배포(32-10 메인 세션) → 그 뒤 push. 웹 버튼이 relay 보다 먼저 나가면 구 relay 가 4400 으로 끊는다(아무것도 끄지 않음 — fail-safe 지만 사용자에겐 재접속 깜빡임).
- 웨이브 ④(32-13): `#viSessionFor` 가 소유 세션으로 바뀌면 VI 11 의 「14 소유 세션과 같을 때만」 가드는 자연히 늘 참이다. VI 가 계좌 슬롯이 되면 `VI_SNAPSHOT_EXCHANGES` × `getViTrigger` 대신 그 계좌 슬롯 조회로 바꾼다.
- 이 커밋들은 로컬 master 에만 있다(push · 배포 없음).

---
*Phase: 32-account-axis*
*Completed: 2026-10-16*

## Self-Check: PASSED

- 커밋 9b6f5799 · 52de4257 · df16a51b · ce8c7d86 · 012d0a59 · 8c66f892 가 HEAD 조상 · SUMMARY 존재
- STATE.md · ROADMAP.md · REQUIREMENTS.md · state.json 은 이 플랜이 바꾸지 않았다(오케스트레이터 몫)
