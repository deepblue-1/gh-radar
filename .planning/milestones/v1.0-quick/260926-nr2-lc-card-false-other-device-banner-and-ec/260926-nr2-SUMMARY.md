---
phase: quick-260926-nr2
plan: 01
subsystem: webapp/trading (상따 카드 에코 분류) · packages/shared · relay 연결 훅
status: complete
tags: [limit-chaser, echo, banner, kill-switch, market-close, lc.arm]
requires: []
provides:
  - "LIMIT_CHASER_SERVER_COUNTER_FIELDS · LIMIT_CHASER_SERVER_LATCH_FIELDS · LIMIT_CHASER_SERVER_ONLY_FIELDS (shared 단일 정의)"
  - "limitChaserValuesChanged · isRuntimeOnlyEcho · marketCloseDisabledLogLine (strategy-log)"
  - "isLimitChaserArmRejection · isMarketCloseReleaseNotice · marketCloseReleaseKeysOf · limitChaserGateDisarmed (limit-chaser)"
  - "RelayConnectionState.limitChaserDisableEchoes · STRATEGIES_DISABLE_ACK_TIMEOUT_MS (use-relay-socket)"
affects: [strategy-card, strategy-status-card, relay-provider]
tech-stack:
  added: []
  patterns: ["에코 분류 = 무엇이 바뀌었나", "비활성화 원인 귀속 = 에코 객체 동일성"]
key-files:
  created: []
  modified:
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts
    - webapp/src/components/trading/strategy-log.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/strategy-status-card.tsx
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/components/trading/__tests__/strategy-log.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/lib/__tests__/limit-chaser.test.ts
decisions:
  - "「다른 단말」 배너는 누가 보냈나(pendingRef)가 아니라 사용자 설정 값이 바뀌었나(limitChaserValuesChanged)로 판정"
  - "내용상 새로 말할 것이 없는 에코(isRuntimeOnlyEcho)는 pendingRef 를 소비하지 않고 무동작"
  - "65 는 전부 정지 집계 응답이며 15:40 과 무관 — 65 로그 문구 교정, 15:40 은 KRX 전용 문구 신설"
  - "lc.arm relay 거부 판정은 fanout 실측대로 i 빈 값 · a 빈 값 또는 이 계좌로 좁힘"
metrics:
  completed: 2026-09-26
  duration: "약 25분"
actuals:
  tokens: 15200
  tasks: 3
  commits: 0
---

# Quick 260926-nr2: 상따 카드 에코 오분류 교정 Summary

카드 에코를 「누가 보냈나」가 아니라 「무엇이 바뀌었나」로 분류하도록 바꿨다. 이제 내 lc.arm, 서버 이중 에코, 런타임 푸시, 재접속 lc.snap 에는 「다른 단말」 배너가 서지 않는다. 이 브라우저의 전부 정지와 15:40 KRX 해제는 relay 층이 에코 객체 단위로 원인을 붙여 두므로 발주로 읽지 않는다. lc.arm 은 3초 미반영 추적을 받고, 거부 통지가 오면 인식해 카드에 표시한다.

> 커밋 없음: 사용자 전역 규칙에 따라 모든 변경을 working tree 에만 남겼다. `actuals.commits: 0` 은 서술값이 아니라 실제 상태다. 코드 변경은 커밋되지 않은 채 남아 있고, 커밋은 오케스트레이터가 사용자 확인을 받은 뒤 만든다.

## 변경 파일

| 파일 | 내용 |
|------|------|
| `packages/shared/src/relay.ts` | S→C 필드 const 세 개(COUNTER·LATCH·ONLY)를 `as const satisfies` 로 추가. `LimitChaserServerOnlyField` 추가. `RelayLimitChaserInput` Omit 을 이 타입에서 파생(결과 타입은 전과 같음) |
| `packages/shared/src/index.ts` | 위 const 세 개와 타입 export |
| `webapp/src/components/trading/strategy-log.tsx` | `valuesChanged` 를 export `limitChaserValuesChanged` 로 바꿈(모듈 스코프 skip Set 은 shared const 를 import. 게이트 4 + S→C 6 + crud·key·name·code). `isRuntimeOnlyEcho` 신설. 65 문구 교정, `marketCloseDisabledLogLine` 신설, 상단 ① 서술 정정 |
| `webapp/src/components/trading/card/strategy-card.tsx` | 에코 이펙트에 런타임 전용 무동작 분기 추가. 배너 조건을 `limitChaserValuesChanged` 로 변경. 원인을 아는 hadOrder(`limitChaserDisableEchoes` 객체 동일성)와 15:40 원인 1줄 추가. `startAckWait` 분리. `armInFlightRef` 추가. `handleArm` 이 send true 일 때만 추적. 메시지 이펙트에 arm 거부 인식 추가 |
| `webapp/src/lib/limit-chaser.ts` | `isMarketCloseReleaseNotice`·`limitChaserGateDisarmed`·`marketCloseReleaseKeysOf`·`isLimitChaserArmRejection` 추가. gh-trade 계약 인용 주석을 이 파일이 소유. `isLimitChaserServerMessage` 문서 정정(로직 불변) |
| `webapp/src/lib/use-relay-socket.ts` | `STRATEGIES_DISABLE_ACK_TIMEOUT_MS` 로 상수 이동. `LimitChaserDisableCause`/`LimitChaserDisableEcho` 추가. `limitChaserDisableEchoes`(반환) 와 `killSwitchInFlight`·`marketCloseReleaseKeys`(내부) 추가. 액션 `strategies-disable-sent/expired`, `attributeDisableEcho` 추가. lc/lc.snap/msg/strategies.disabled/state/local-status 갈래 갱신. `send` 에 in-flight 창과 백스톱 타이머, teardown 에서 타이머 정리 |
| `webapp/src/lib/relay-provider.tsx` | `EMPTY_RELAY_VALUE.limitChaserDisableEchoes` 에 빈 Map 모듈 상수 |
| `webapp/src/components/trading/strategy-status-card.tsx` | 로컬 `DISABLE_ACK_TIMEOUT_MS` 삭제 → 공유 상수 import(동작·문구 불변) |
| 테스트 4개 | 아래 「테스트 결과」 참조 |

## 근본원인별 수정 대응

| 근본원인 / 요구 | 수정 | 단언 테스트 |
|---|---|---|
| NR2-1 내 lc.arm 에코에 오배너 | 배너 조건을 사용자 값 변경으로 좁힘. 래치 전이는 로그만. `handleArm` 이 send true 일 때 `armInFlightRef` + 3초 `startAckWait`. 키 에코 또는 `isLimitChaserArmRejection` 이 오면 거둠. 거부는 `setLastError` 로 카드 경보. send false 면 추적·재전송 없음 | flow 「NR2-1」, 「LED 클릭 → 3초 무응답」, 「→ 그 키 에코」, 「→ System WARN 거부」, 「arm 없을 때 System WARN 무표시」, 「send false」. limit-chaser 「isLimitChaserArmRejection」 6건 |
| NR2-2 서버 이중 에코 | `isRuntimeOnlyEcho` 가 참이면 prevServerRef 만 갱신하고 return(pendingRef 소비 없음) | flow 「NR2-2」(로그 줄 수 불변 · 배너 없음 · 「매수 발주」 없음) |
| NR2-3 서버 런타임 푸시 | 게이트·래치·카운터 변화는 배너 조건에서 빠짐. 보내지 않은 매수 true→false 는 여전히 hadOrder=true 로 처리 | flow 「NR2-3」 4건(래치 자동 ON · 게이트 복원 · 카운터 · 매수 발주 로그+「발주 완료 · 무장 해제」) |
| NR2-4 전부 정지 / 15:40 을 발주로 읽음, 65 문구 | relay 귀속 맵(65 · 연결 수명 · 8초 백스톱 창 / Purge 통지 뒤 키별 첫 에코). 카드는 `disable.echo === server` 일 때 hadOrder=false 로 처리하고 marketClose 면 원인 1줄. 65 문구는 「전부 정지가 반영됐어요 · 서버가 모든 전략을 비활성화했어요」 | relay-socket 「상따 비활성화 원인 귀속」 10건, flow 「발주 판정 원인」 3건, flow ⑬, strategy-log ⑫·⑫b |
| NR2-5 재접속 lc.snap 동일 내용 | `isRuntimeOnlyEcho` 가 새 객체도 동일 내용이면 참. lc.snap 은 귀속 맵도 비움 | flow 「NR2-5」, relay-socket 「lc.snap 은 귀속 맵을 비운다」 |
| NR2-6 valuesChanged 가 S→C 런타임 필드를 셈 | skip 이 shared `LIMIT_CHASER_SERVER_ONLY_FIELDS` + name/code 를 포함. 목록 정의는 한 곳 | strategy-log 「S→C 전용 필드…」 5+4건, flow 「NR2-6」 |
| NR2-7 다른 단말 사용자 값 변경 회귀 가드 | 배너 경로 유지 | 기존 flow ⑦·⑦b, strategy-card.test B카드 배너 테스트를 **수정 없이** 통과 |

## 테스트 결과 (실제 실행)

| 명령 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/shared build` | 성공 (ESM/CJS/DTS) |
| `pnpm --filter @gh-radar/relay run typecheck` | 통과 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | 통과 |
| `pnpm --filter @gh-radar/webapp run typecheck` (tsc + e2e tsconfig) | 통과 |
| Task 1: `vitest strategy-log · strategy-card-flow · strategy-card` | 3 files · 85 passed |
| Task 2: `vitest relay-socket · strategy-status-card` | 2 files · 121 passed |
| Task 3: `vitest limit-chaser · strategy-card-flow · strategy-card · stock-orderbook-section` | 4 files · 120 passed |
| 전체 `pnpm --filter @gh-radar/relay run test` | 28 files · **628 passed** |
| 전체 `pnpm --filter @gh-radar/webapp run test` | 121 files · **2311 passed · 1 skipped** (skip 은 기존 것이고 이번 변경과 무관) |
| `eslint` (변경 파일 10개) | 0 errors · 1 warning. 경고는 use-relay-socket `wireSubsRef` 로 기존 것 |

기존 테스트에서 문구를 바꾼 곳은 flow ⑬ 과 strategy-log ⑫ 두 곳뿐이다(65 문구). ⑦·⑦b·⑲-8·⑧·㉑ 계열과 strategy-card B카드 테스트는 수정하지 않았고 모두 통과했다.

**e2e 미실행, 의미는 유효:** `webapp/e2e/specs/trading-workbench.spec.ts` test 13 은 dev 서버와 목 relay 가 필요해 돌리지 않았다. 그 테스트의 에코는 사용자 값 `buyWatchQty`(8,000 → 5,000)를 바꾸므로 새 기준(`limitChaserValuesChanged`)에서도 배너와 로그 1줄이 선다. e2e 안에 「(장 마감 규칙)」 문구 의존은 없다(git grep 확인).

## 오케스트레이터 전제 정정 (65 ≠ 15:40)

- 65(`strategies.disabled`)는 gh-trade `Gateway::ProcessDisableStrategies` 의 집계 응답, 즉 **전부 정지 완료** 신호다. 순서는 상태 변경 → 저장 → 키별 60 에코 → 65 이고 65 가 맨 마지막이다. 옛 로그 문구 「서버가 모든 전략을 자동 비활성화했어요 (장 마감 규칙)」은 사용자의 전부 정지를 장 마감으로 잘못 표시하고 있었다.
- 15:40 은 `Server::DisableKrxLimitChasers` 가 처리하고 65 를 내지 않는다. 먼저 54 통지(src System · kind Purge · isin/계좌 없음)를 동기로 보내고, 60 에코는 그다음 300ms 플러시 틱에 온다. 그래서 새 문구는 KRX 로 범위를 좁혔다: 「서버가 KRX 전략을 자동 비활성화했어요 (장 마감 규칙)」.

## 계획과 다른 점

1. **[계획이 허용한 좁힘] `isLimitChaserArmRejection` (b) 갈래.** 계획은 구현 전에 `relay/src/ws/fanout.ts` 를 읽고, 계좌를 항상 싣는다면 그만큼 좁히라고 했다. 실측 결과 lc.arm 거부 경로 네 곳(`#armLatchAccount` · `#accountAllowed` · `#buildStrategyPayload` · `#onStrategySendFailed`)은 모두 **i 를 싣지 않는다**. a 는 `#accountAllowed` 에서만 계좌를 싣는다. 그래서 (b) 를 `src 'Relay'` + `i === ''` + `a ∈ {'', accountNo}` 로 좁혔다. i 에 isin 을 싣는 relay 거부는 lc.set 경로뿐이라 제외된다. 계획 behavior 의 「i·a 가 빈 값 또는 이 전략 축」 중 「i = 이 isin」 경우는 이 좁힘 때문에 false 다. 단위 테스트에 그 사실을 단언했다.
2. **[Rule 2 수준 보강] `limitChaserValuesChanged` / `isRuntimeOnlyEcho` 는 두 객체 키의 합집합을 순회한다.** 기존 `valuesChanged` 는 `Object.keys(next)` 만 봤다. 선택 필드(name/code)가 한쪽에만 있어도 판정이 비대칭이 되지 않게 했다. 두 필드는 어차피 skip 대상이라 결과 차이는 없다.
3. 그 밖에는 계획대로 실행했다.

## 알려진 한계

- **다른 단말(같은 사용자의 다른 탭·기기 포함)의 전부 정지**는 여전히 발주로 읽힌다(「매수 발주 — 무장 해제」·「발주 완료 · 무장 해제」). 그 탭에는 에코가 65 보다 먼저 오므로 원인을 알 시점이 없다(Pitfall 10). 주석으로 명시했다.
- **lc.snap 으로만 관측된 해제**(예: 끊긴 동안 일어난 전부 정지나 15:40)도 귀속이 없다. 동일 내용이 아니면 보내지 않은 매수 해제로 보아 발주로 읽는다.
- **런타임 게이트/래치 푸시가 내 lc.set 에코보다 먼저 오는 경합**에서는 그 푸시가 pendingRef 를 소비한다. 기존 경합이고 범위가 전보다 좁아졌다.
- 서버가 내 lc.set 을 prev 와 같은 값으로 정규화해 답하면 pendingRef 가 다음 비런타임 에코까지 남는다. 그러면 그 한 번의 다른 단말 배너가 삼켜지고 hadOrder 는 내 마지막 요청에서 읽힌다. 이중 에코 오귀속보다 싼 쪽을 택했고 주석에 근거를 적었다.
- arm 거부 상관은 in-flight 창 기반이다(게이트웨이가 키를 싣지 않음). 창 안에 무관한 같은 모양의 System WARN 이 오면 미반영이 일찍 거둬지고, 그 경보가 이 카드에 설 수 있다(T-nr2-04 accept). 변경 전(추적 없음)보다 나빠지지 않는다.
- 전부 정지 창(최대 8초)이 열려 있는 동안 우연히 실제 매수 발주 에코가 오면 그 에코도 killSwitch 로 귀속된다. 65 가 보통 수 ms 안에 창을 닫으므로 창은 좁다. 실패하더라도 발주를 적게 표시하는 쪽(보수 방향)이다.

## Threat Flags

없음. 새 네트워크 표면이나 인증 경로는 없다. 새 dispatch·타이머 경로는 콘솔 로그를 더하지 않는다(T-nr2-03).

## Self-Check: PASSED

- 수정 파일 12개가 모두 `git status` 에 M 으로 존재하고, 스테이징·커밋은 없다.
- 동시 세션 파일(`.planning/phases/21-*` · `.planning/state.json` · `.planning/milestone.lock` · `tasks/lessons.md` · ROADMAP/STATE)은 건드리지 않았다.
- gh-trade 저장소는 읽기만 했다(이번 실행에서 수정 없음).
