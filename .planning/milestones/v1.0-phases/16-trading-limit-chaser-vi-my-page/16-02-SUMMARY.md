---
phase: 16-trading-limit-chaser-vi-my-page
plan: 02
subsystem: testing
tags: [flatbuffers, test-harness, fake-gateway, playwright, e2e, relay]

# Dependency graph
requires:
  - phase: 16-trading-limit-chaser-vi-my-page
    plan: 01
    provides: "SetLimitChaser 45 슬롯(cancelQtyTrackBaseline) · UnfilledState 10 슬롯(orderTime) 재동기화본"
  - phase: 15-dma-relay-kb-gh-trade-server-10-wss
    provides: "relay/tests/helpers/{frames,fake-gateway}.ts · webapp/e2e/fixtures/relay.ts · playwright.config.ts"
provides:
  - "전략 응답 프레임 빌더 6종(60·64·61·72/73·56·65) + 입력 타입 5종 — 실서버 없이 전략 왕복 검증의 유일한 경로"
  - "STRATEGY_MSG — 생성 enum 에서 파생된 전략 msg_type 상수(숫자 리터럴 0건). 16-04 의 MSG 확장과 독립"
  - "FakeGateway 전략 표면: 조회 3종(24·21·34) 자동 응답 + 명령 4종(10·11·14·33) 기록 + 주입 3종(60·72/73·51)"
  - "LocalRelay 전략 표면: seed 3종 + push 3종(소켓 인자 없음) + reset 시드 초기화"
  - "Playwright 단일 워커 고정 — relay spec 파일 간 8090 EADDRINUSE 구조적 차단"
affects: [16-03, 16-04, 16-05, 16-06, 16-07, 16-08, 16-09, 16-10, 16-11, 16-12, 16-13, 16-14, 16-15, 16-16, 16-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "테스트 프레임 빌더의 숫자 기본값은 서로 다르게 둔다 — 값이 겹치면 필드 밀림이 거짓 green 으로 통과한다"
    - "스텁 게이트웨이의 자동 응답은 「무응답 금지」 규약 재현에만 쓰고, 명령은 기록만 한다"
    - "relay 테스트는 root `pnpm typecheck` 에 잡히지 않는다 — `typecheck:tests` 를 따로 돌린다"

key-files:
  created: []
  modified:
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
    - relay/tests/fake-gateway.test.ts
    - relay/tests/order-api.test.ts
    - webapp/e2e/fixtures/relay.ts
    - webapp/playwright.config.ts

key-decisions:
  - "STRATEGY_MSG 를 생성 enum(MsgType)에서 파생 — 숫자 리터럴 0건이라 flatc 재생성이 곧 갱신이고, 16-04 소관인 MSG 화이트리스트를 건드리지 않는다"
  - "상따 숫자 기본값 20개를 전부 서로 다른 값으로 배치 (T-16-05) — 가격 5칸을 71,000/71,100/71,200/71,300/71,400 으로 어긋나게 둬 필드 밀림이 실패 메시지에서 읽히게"
  - "buyOrderAmount(100만원) 과 buyOrderQty(14) 를 산출식으로 맞물림 — floor(100×10000/71000)=14. 기본 픽스처만으로 수량 산출식 왕복 검산 가능"
  - "불리언 기본값은 전부 false — 게이트 하나만 켜서 효과를 단정하는 것이 기본 테스트 형태다"
  - "전략 조회 3종은 시드가 없어도 자동 응답(빈 응답) — 실서버가 0건에도 반드시 답하므로(무응답 금지), 침묵은 「relay 가 멎음」이라는 엉뚱한 증상을 만든다"
  - "strategyRequests() 는 명령 4종만 기록 — 조회는 relay 가 세션마다 자동 발사해 노이즈가 되고, 이미 requestLog()/onFrame 으로 관측된다"
  - "LocalRelay push 3종을 async 로 두고 waitForConnection 을 기다린다 — page.goto 직후 호출해도 소켓 미수립 flake 가 나지 않는다"
  - "FakeViOrderItemInput.state 를 `FakeViOrderState | (string & {})` 로 — 6개 리터럴 자동완성을 유지하면서 파서 가드 시험용 스키마 밖 값도 허용(파일 설계 규율)"
  - "VI 데드라인 기본값을 호출 시각 상대값(+110s/+119s)으로 — 고정 epoch 리터럴은 언제 돌려도 과거라 카운트다운이 늘 「만료」로 렌더된다"
  - "fullyParallel 을 false 로 함께 내림 — 워커 1개면 값 자체는 무해하나 true 로 남기면 「병렬 E2E 저장소」라는 잘못된 신호를 준다"

patterns-established:
  - "생성 코드의 위치 인자 createXxx 대신 start/add/end 개별 호출 — deprecated 슬롯이 있는 테이블에서 인자 밀림이 컴파일을 통과하는 것을 구조적으로 차단"
  - "relay spec 규약을 픽스처 상단 한 곳에 정본화하고 spec 은 그것을 따르기만 한다"

requirements-completed: []

# Metrics
duration: 16min
completed: 2026-09-08
---

# Phase 16 Plan 02: 전략 테스트 하네스 Summary

**전략(상따·VI) 메시지를 실서버 없이 검증하는 하네스 구축 — FlatBuffers 응답 빌더 6종 + FakeGateway 자동응답/기록 표면 + LocalRelay 주입 표면 + Playwright 단일 워커 고정으로 8090 충돌 제거**

## Performance

- **Duration:** 16 min
- **Started:** 2026-09-08T09:44Z
- **Completed:** 2026-09-08T09:58Z
- **Tasks:** 3
- **Files modified:** 6 (created 0, modified 6)

## Accomplishments

- **전략 프레임 6종을 테스트에서 만들 수 있다.** `buildSetLimitChaserRespFrame`(60) · `buildLimitChaserListRespFrame`(64) · `buildSetVITriggerRespFrame`(61) · `buildViOrderListFrame`(72/73) · `buildViOrderNoticeFrame`(56) · `buildDisableStrategiesRespFrame`(65). 상따 **활성 37 필드 전부** override 가능하며 S→C 전용 4필드(`sellOrderQty`·`sellQtyTrackBaseline`·`sellEntryLatched`·`cancelQtyTrackBaseline`)도 주입된다.
- **「무응답 금지」 규약이 프레임 레벨에서 재현된다.** `buildSetVITriggerRespFrame(null)` 은 테이블 없는 빈 61(미등록), `buildLimitChaserListRespFrame([])`/`buildViOrderListFrame([], true)` 는 **슬롯은 있고 길이만 0** 인 벡터를 만든다 — 웹이 "아직 안 왔다"와 "없다"를 구분할 수 있다.
- **FakeGateway 가 전략 요청에 실서버처럼 반응한다.** 조회 3종(24·21·34)은 시드가 없어도 빈 응답을 보내고, 명령 4종(10·11·14·33)은 답하지 않고 `strategyRequests()` 에 페이로드 사본만 남긴다. 이 분리가 "보냈다"와 "서버가 받아들였다"를 구분해 거부 경로를 시험 가능하게 한다.
- **spec 이 `net.Socket` 을 다루지 않는다.** `LocalRelay` 의 `pushLimitChaserEcho`/`pushViOrderList`/`pushOrderResp` 가 게이트웨이 소켓이 설 때까지 기다렸다 주입한다 — spec 마다 연결 대기 코드를 복붙하다 어긋나는 flake 를 원천 차단.
- **8090 충돌이 구조적으로 불가능해졌다.** `workers: 1` 고정. `mode:'serial'` 은 파일 **내부**만 직렬화하므로, relay spec 이 5개로 늘어난 지금 파일 간 병렬은 확정적 EADDRINUSE 였다.
- **16-01 이 남긴 잠재 결함 1건을 잡았다.** `createUnfilledState` 인자 누락 — 아래 Deviations #2.

## Task Commits

1. **Task 1: 전략 응답 FlatBuffers 프레임 빌더 추가** — `1eb6925` (test)
2. **Task 2: FakeGateway 전략 응답 주입 API 5종** — `4db13a8` (test)
3. **Task 3: LocalRelay 표면 확장 + E2E 8090 포트 직렬화** — `1675361` (test)

## Files Created/Modified

- `relay/tests/helpers/frames.ts` — `STRATEGY_MSG` 상수 + 빌더 6종 + 입력 타입 5종(`FakeLimitChaserInput`·`FakeViTriggerInput`·`FakeViOrderItemInput`·`FakeViOrderNoticeInput`·`FakeDisableStrategiesInput`) + `FakeViOrderState`. `FakeUnfilled.orderTime` 추가(결함 수정)
- `relay/tests/helpers/fake-gateway.ts` — 전략 API 7종 + `StrategyRequest` 타입 + 조회 자동응답 3분기 + 명령 기록. 파일 상단 규율 주석 갱신
- `relay/tests/fake-gateway.test.ts` — `fake-gateway 전략 표면` describe 신규 8 케이스 + 화이트리스트 우회 `rootEnvelope` 헬퍼
- `relay/tests/order-api.test.ts` — 실 게이트웨이 IP 리터럴 제거(D-27)
- `webapp/e2e/fixtures/relay.ts` — `LocalRelay` 전략 6 API + `gatewaySocket()` 대기 헬퍼 + `reset()` 시드 초기화 + 파일 상단 ⑥ spec 규약 정본
- `webapp/playwright.config.ts` — `workers: 1` · `fullyParallel: false` + 근거 주석

## Decisions Made

1. **`STRATEGY_MSG` 를 생성 enum 에서 파생.** 계획은 "숫자 리터럴을 직접 쓰지 않고 필요한 값만 지역 상수로 둔다"였다. 지역 상수를 `MsgType.SetLimitChaserResp` 같은 생성 enum 참조로 채우면 리터럴이 **한 개도 없으면서** 지역 상수 요건도 만족한다. `.fbs` 가 바뀌면 flatc 재생성만으로 따라오고, 16-04 소관인 `MSG` 화이트리스트는 건드리지 않는다.

2. **숫자 기본값 전부 distinct (T-16-05 실질 완화).** 위협 등록부는 "잘못 조립된 버퍼로 파서를 검증하면 거짓 green" 을 지목한다. `create*` 금지는 **빌더 작성 시점**의 방어지만, 기본값이 전부 0 이면 **파서 쪽** 필드 밀림은 여전히 안 잡힌다. 가격 5칸을 100원씩 어긋나게 두고 20개 숫자를 모두 다르게 배치해 두 번째 방어선을 만들었다.

3. **조회 3종은 기본 ON(빈 응답), 명령 4종은 기록만.** 계획은 "`respondLimitChaserList(items)` 가 이후 24 에 자동 응답" 이라 읽히지만, 시드 전 기본값을 「무응답」으로 두면 시드를 깜빡한 테스트에서 relay 가 답을 기다리며 멎는다 — 증상이 "전략이 안 보임" 으로 나타나 원인이 가려진다. 실서버는 0건에도 반드시 답하므로(무응답 금지) **기본값을 빈 응답**으로 두는 것이 계약에 더 충실하다.

4. **`strategyRequests()` 는 명령 4종만.** 조회(21·24·34)까지 담으면 relay 가 세션마다 자동 발사하는 조회가 노이즈로 섞여 "사용자의 Set 이 실제로 나갔는가" 단정이 깨지기 쉽다. 조회 관측은 기존 `requestLog()`/`onFrame` 으로 이미 가능하므로 손실이 없다.

5. **`LocalRelay` push 3종을 async 로.** 동기 + "소켓 없으면 throw" 로 두면 `page.goto` 직후 호출 시 relay 가 아직 DMA 세션을 열기 전이라 간헐 실패한다. `waitForConnection(10s)` 을 기다리고 실패 시 relay 로그를 붙여 던진다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] worktree 에 node_modules·shared 빌드 부재**

- **Found during:** Task 1
- **Issue:** worktree 는 새 체크아웃이라 `node_modules` 가 없어 typecheck·test 를 돌릴 수 없었고, `@gh-radar/shared` 미빌드로 `typecheck:tests` 가 TS2307 을 12건 뿜었다.
- **Fix:** `pnpm install --frozen-lockfile` + `pnpm --filter @gh-radar/shared build`. 락파일 그대로 설치이므로 신규 패키지 도입이 아니다.
- **Files modified:** 없음 (tracked 파일 무변경, `git status` 빈 출력로 확인)
- **Committed in:** 해당 없음

**2. [Rule 1 - Bug] `createUnfilledState` 인자 누락 — 16-01 재동기화 미반영분**

- **Found during:** Task 1
- **Issue:** 16-01 이 `UnfilledState` 를 9→10 슬롯으로 재동기화하면서 `createUnfilledState` 의 인자가 10→11개가 됐는데, `frames.ts` 의 `buildAccountStateFrame` 은 여전히 10개만 넘기고 있었다(`TS2554: Expected 11 arguments, but got 10`). **root `pnpm typecheck` 는 relay `tests/` 를 제외**하므로 16-01 의 검증을 통과했고, vitest 는 타입을 보지 않아 테스트도 green 이었다. 런타임에는 `orderTimeOffset` 이 `undefined` 로 들어가 `addFieldOffset(9, undefined, 0)` 이 `offset() - undefined` = NaN 오프셋을 vtable 에 쓴다 — 미체결 프레임이 조용히 오염되는 종류다.
- **Fix:** `FakeUnfilled` 에 `orderTime?: string` 추가(`"HHMMSS"`, 기본 `"093015"`) 후 11번째 인자로 전달.
- **Files modified:** `relay/tests/helpers/frames.ts`
- **Verification:** `typecheck:tests` exit 0, relay 테스트 224건 green.
- **Committed in:** `1eb6925`

**3. [Rule 2 - Security] `relay/tests/order-api.test.ts` 에 실 게이트웨이 IP 리터럴**

- **Found during:** Task 2 (acceptance grep)
- **Issue:** `dmaHost: opts.dmaHost ?? "10.41.1.120"` — 실 KB 게이트웨이 주소가 테스트에 박혀 있었다(Phase 15 유입, 이 plan 과 무관한 선재 결함). Task 2 의 acceptance 가 `grep -rn "10\.41\.1\.120" relay/tests/` **0건**을 명시 게이트로 요구한다(D-27 / T-16-09).
- **Fix:** `"10.41.0.10"` 으로 교체. `isGatewayLinkUp` 은 **/16 만** 보므로 `tun0`(10.41.1.124) 과 같은 대역이기만 하면 판정이 완전히 동일하다 — 테스트 의미 손실 0. 왜 실주소를 쓰지 않는지 주석으로 남겼다.
- **Files modified:** `relay/tests/order-api.test.ts`
- **Verification:** `grep -rn "10\.41\.1\.120" relay/tests/` 0건. relay 테스트 224건 green(회선 판정 케이스 포함).
- **범위 밖 잔여:** `relay/src/dma/link-health.ts` 의 주석에는 같은 주소가 남아 있다. 게이트는 `relay/tests/` 로 한정돼 있고 그 주석은 Phase 15 의 판정 알고리즘 근거 기록이라 **건드리지 않았다**. 별도 판단이 필요하면 후속 plan 소관이다.
- **Committed in:** `1eb6925`

**4. [Rule 3 - Blocking] worktree 에 webapp E2E env 파일 부재**

- **Found during:** Task 3
- **Issue:** `webapp/.env.test.local` · `.env.local` 은 gitignore 대상이라 worktree 에 없어 `setup` project(테스트 유저 로그인)가 성립하지 않는다.
- **Fix:** 메인 체크아웃에서 복사. 둘 다 gitignore 대상이라 커밋 표면이 없다(`git status` 로 확인).
- **Files modified:** 없음
- **Committed in:** 해당 없음

---

**Total deviations:** 4 auto-fixed (Rule 1 버그 1 · Rule 2 보안 1 · Rule 3 블로킹 2)
**Impact on plan:** 스코프 확장 없음. #1/#4 는 worktree 부트스트랩, #2 는 16-01 이 남긴 잠재 결함, #3 은 계획이 명시 게이트로 요구한 선재 결함 제거다.

## Acceptance Criteria 문언 불일치 4건 (기록용)

계획서의 문구와 저장소 실물이 어긋난 지점이다. 전부 **실물을 따랐고** 근거를 남긴다.

| 계획 문구 | 실물 | 판단 |
|-----------|------|------|
| `setVITrigger() === null` | 생성 접근자는 `setViTrigger()` | flatc 산출물이 정본. 테스트는 `setViTrigger()` 로 작성 |
| `grep -c "createSetLimitChaser("` == 0 | 같은 계획의 action 이 "`createSetLimitChaser(...)` 를 쓰지 않는다"를 **주석에 쓰라**고 지시 → 리터럴 1건 발생 | 16-01 의 `REVOKE\|GRANT` 선례와 동형. 주석에서 괄호만 떼어(`` `createSetLimitChaser` 위치 인자 함수 ``) 의미 보존 + 게이트 0건 |
| `relay/src/generated/stock-dma/{set-vi-trigger,vi-order-item,…}.ts` | 실제 파일명은 `set-vitrigger.ts` · `viorder-item.ts` · `viorder-list.ts` · `viorder-notice.ts` | flatc 의 이름 규칙. 실제 경로로 import |
| `pnpm --filter gh-radar-webapp` | 패키지명은 `@gh-radar/webapp` | 실제 필터명으로 실행 |

## Issues Encountered

- **relay 테스트는 root `pnpm typecheck` 의 사각지대다.** `relay/tsconfig.json` 이 `tests/` 를 exclude 하고, root 는 `typecheck` 만 돌린다(`typecheck:tests` 는 별도). 이번에 Deviation #2 를 잡은 것이 이 별도 실행이었다. **후속 plan 은 `pnpm --filter @gh-radar/relay run typecheck:tests` 를 검증에 반드시 포함해야 한다** — root typecheck 만으로는 이 하네스의 결함이 안 잡힌다.
- **`webapp/e2e/` 는 어떤 tsc 도 보지 않는다.** `webapp/tsconfig.json` 의 `include` 가 `src/**/*` 뿐이다. Playwright 는 esbuild 로 타입 없이 트랜스파일하므로 픽스처의 타입 오류는 **런타임에야** 드러난다. 이번에는 임시 spec 을 만들어 신규 6 API 를 실 relay 위에서 돌려 확인하고 삭제했다(아래 Verification). 상시 게이트는 아직 없다 — 후속 plan 이 relay 의 `tsconfig.tests.json` 과 같은 장치를 webapp e2e 에 둘지 판단해야 한다.

## Verification 결과

| 항목 | 결과 |
|------|------|
| `pnpm typecheck` (14 workspace) | exit **0** — 전부 Done |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit **0** |
| `pnpm --filter @gh-radar/relay test` | exit **0** — 14 files / **224 passed** (기존 216 + 신규 8) |
| `pnpm --filter @gh-radar/webapp test:e2e -- orderbook` | **8 passed** (23.5s) · `Running 8 tests using 1 worker` · EADDRINUSE 0건 |
| `grep -c "createSetLimitChaser(\|createSetVITrigger(\|createVIOrderItem(\|createVIOrderList("` (frames.ts) | **0** |
| `grep -c "export function build(…6종…)Frame"` (frames.ts) | **6** |
| `grep -c "respond…\|push…\|strategyRequests"` (fake-gateway.ts) | **15** (≥14 요구) |
| `grep -c "seedLimitChasers\|…\|pushOrderResp"` (e2e/fixtures/relay.ts) | **15** (≥12 요구) |
| `grep -c "workers: 1"` (playwright.config.ts) | **1** |
| `grep -c "process.env.CI ? 1 : undefined"` (playwright.config.ts) | **0** |
| `grep -rn "10\.41\.1\.120" relay/tests/` | **0건** |
| `grep -rn "10\.41\.1\.120" webapp/e2e/` | **0건** |

### 프레임 계약 실측 (41 assertion, 전량 PASS)

Task 1 커밋 전 임시 스크립트로 6 빌더의 필드 왕복을 전수 확인했다. 핵심 대목:

```
PASS 60 cancelQtyTrackBaseline(주입): 999      ← 16-01 이 연 45번째 슬롯이 실제로 왕복
PASS 60 buyOrderQty=floor(100*10000/71000): 14 ← 수량 산출식 기본 픽스처 검산
PASS 61(null) setViTrigger === null            ← 미등록 = 빈 테이블
PASS 72 itemsLength=0 / isSnapshot=true        ← 0건도 길이 0 벡터
PASS 73 msgType: 73, isSnapshot=false          ← 스냅샷/푸시 분기
=== 41/41 PASSED ===
```

영구 커버리지는 `fake-gateway.test.ts` 신규 8 케이스가 가져간다(빈 61 · 길이 0 벡터 · 명령/조회 분리 · 45번 슬롯 왕복 포함).

### LocalRelay 전략 표면 런타임 확인 (임시 spec, 삭제됨)

`webapp/e2e/` 가 타입체크 사각지대라 실 relay 프로세스 위에서 신규 6 API 를 직접 돌렸다.

```
✓ 임시 — LocalRelay 전략 표면 › seed 3종 + push 3종이 예외 없이 돈다 (2.0s)
✓ 임시 — LocalRelay 전략 표면 › reset 후에도 표면이 살아 있다 (시드 누수 없음) (735ms)
  3 passed (11.0s)
```

부수 확인: 60/73/51 을 주입해도 relay 의 상태 배지가 `ready` 를 유지한다 — 아직 `INBOUND_MSG_TYPES` 에 없는 60/73 을 **드롭하고 연결을 유지**하는 D-31 경로가 실제로 동작한다(16-04 가 화이트리스트를 넓히기 전까지의 정상 동작). 확인 후 임시 spec 은 삭제했고 커밋에 포함되지 않는다.

## Known Stubs

없음. 이 plan 의 산출물은 테스트 하네스이며 UI 로 흘러가는 하드코딩 빈 값·placeholder 가 없다. 프레임 빌더의 기본값은 stub 이 아니라 **의도적으로 서로 다르게 설계된 픽스처**이며 전 필드가 override 가능하다.

## Threat Flags

없음 — 계획의 `<threat_model>` 밖 신규 보안 표면이 생기지 않았다.

- **T-16-05 (Tampering):** `create*` 위치 인자 0건 + 문자열/벡터를 테이블 열기 전 생성. 여기에 **숫자 기본값 distinct** 를 더해 파서측 필드 밀림까지 드러나게 했다.
- **T-16-09 (Information Disclosure):** `relay/tests/` · `webapp/e2e/` 양쪽 실서버 IP 0건. 계획 수립 시점에 이미 있던 리터럴 1건을 실제로 제거했다. `seedDmaCredential` 은 기존 암호화 경로(`encryptDmaPassword`) 그대로 사용, 변경 없음.
- **T-16-06 (DoS, accept):** 단일 워커로 8090 충돌을 없애는 대신 E2E 전량 소요가 늘어난다. orderbook 8건 기준 23.5초로 VALIDATION 예상 범위 안이다.

## User Setup Required

없음 — 외부 서비스 신규 설정 불필요.

**단, 로컬에서 E2E 를 돌릴 때:** relay wss 8090 이 비어 있어야 한다. `./dev.sh --with-relay` 로 띄운 relay 가 있으면 픽스처가 원인을 말하며 실패한다(E2E 는 자기 relay 를 8090 에 띄운다).

## Next Phase Readiness

**16-03 이후로 열린 것:**

- `relay/tests/helpers/frames.ts` — 전략 프레임 6종을 단위 테스트에서 직접 조립 가능
- `FakeGateway.respondXxx` / `pushXxx` / `strategyRequests()` — relay 통합 테스트에서 전략 왕복 전 구간 재현 가능
- `LocalRelay.seedXxx` / `pushXxx` — 신규 E2E spec 4종(`trading-limit-chaser` · `trading-vi` · `me` · `sidebar-tree`)이 소켓을 몰라도 전략 화면을 검증 가능
- 단일 워커 고정 — 위 4종을 추가해도 8090 충돌이 나지 않는다

**후속 plan 이 지켜야 할 것:**

- 신규 relay spec 은 `webapp/e2e/fixtures/relay.ts` 상단 ⑥ 규약 4줄(serial · beforeAll 1회 · afterAll stop · beforeEach reset)을 그대로 따를 것
- 검증 목록에 **`pnpm --filter @gh-radar/relay run typecheck:tests` 를 포함**할 것 — root typecheck 는 relay `tests/` 를 보지 않는다(이번에 실제 결함 1건이 이 경로로만 잡혔다)
- 16-04 가 `MSG`/`INBOUND_MSG_TYPES` 에 전략 번호를 넣을 때, `STRATEGY_MSG` 와 값이 갈리지 않는지 확인할 것(둘 다 생성 enum 파생이라 구조적으로는 안전하나, `MSG` 는 수기 상수다)

**블로커:** 없음.

## Self-Check: PASSED

- 파일 6/6 FOUND (`relay/tests/helpers/frames.ts`, `relay/tests/helpers/fake-gateway.ts`, `relay/tests/fake-gateway.test.ts`, `relay/tests/order-api.test.ts`, `webapp/e2e/fixtures/relay.ts`, `webapp/playwright.config.ts`)
- 커밋 3/3 FOUND (`1eb6925`, `4db13a8`, `1675361` — `git log` 확인)
- 임시 파일 2건(`relay/tests/tmp-verify-frames.ts`, `webapp/e2e/specs/tmp-strategy-surface.spec.ts`) 삭제 확인 — `git status` 에 untracked 0건

---
*Phase: 16-trading-limit-chaser-vi-my-page*
*Completed: 2026-09-08*
