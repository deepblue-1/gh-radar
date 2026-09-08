---
phase: 16-trading-limit-chaser-vi-my-page
plan: 06
subsystem: api
tags: [relay, hub, cache, limit-chaser, vi-trigger, fanout, prefetch, typescript]

# Dependency graph
requires:
  - phase: 16-02
    provides: 전략 응답 프레임 빌더 6종 + FakeGateway/LocalRelay 전략 표면
  - phase: 16-04
    provides: INBOUND 화이트리스트 19종 + 빈 요청 빌더 3종(24/21/34)
  - phase: 16-05
    provides: 응답 파서 6종 + strategyKey() + ParsedViTrigger
provides:
  - SubscriptionHub 전략 캐시 3맵 (#limitChasers · #viTriggers · #viOrders)
  - requestStrategySnapshot(userId) — Ready 프리페치 24/21/34 3연발 (D-12)
  - getLimitChasers / getViTrigger / getViOrders — 16-07 auth 직후 팬아웃이 소비할 스냅샷 getter
  - "#onFrame 전략 case 7종 (60·64·61·72·73·65·56) — default 조용한 드롭 0 복원"
  - VI 주문·통보 종목명 보강 (#enrichViOrder / #enrichViNotice)
  - relay/tests/strategy-hub.test.ts — 전략 회계 13 케이스
affects: [16-07, 16-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "계좌 상태 캐시의 4점 세트(맵 · Ready 프리페치 · 명시 case · #clearCaches)를 복제한다 — 전략 캐시는 새 아키텍처가 아니라 같은 형태의 두 번째 인스턴스다"
    - "「모른다(undefined)」 · 「없다(null)」 · 「있다」 세 상태를 getter 반환 타입으로 가른다 — 조회 전에 지어낸 「없음」을 내리면 브라우저가 사용자 입력을 지운다"
    - "재구독·계좌 재요청·전략 재요청은 #onReady 한 자리에 모은다 — 경로가 두 벌이면 「재접속 후 X 만 안 나온다」가 생긴다"
    - "테스트 실효성은 변이 주입으로 증명한다 — green 만으로는 「무엇을 잡는 테스트인가」를 알 수 없다"

key-files:
  created:
    - relay/tests/strategy-hub.test.ts
  modified:
    - relay/src/hub/subscription-hub.ts

key-decisions:
  - "VI 주문 캐시 키는 orderNo 정본 + 접수 전(`\"\"`)만 `@ISIN:계좌:발동가` 복합 자리표시 키 — 주문번호가 붙는 순간 자리표시 행을 지우고 옮긴다. 안 지우면 같은 주문이 「접수 전」·「접수됨」 두 줄로 남아 사용자가 이중 발주로 읽는다"
  - "getViTrigger 는 3상태(RelayViTrigger | null | undefined)를 돌려준다 — `undefined`(아직 61 을 못 받음)와 `null`(조회 결과 미등록)을 뭉개면 인증 직후 팬아웃이 「미등록」을 지어낸다"
  - "72/73 은 case 라벨 2개 + 본문 1개로 묶었다 — 58/59 · 66/67 · 69/71 과 같은 관행이고, 스냅샷 구분은 msg_type 이 정본이다 (D-33)"
  - "65 는 팬아웃만 하고 캐시를 건드리지 않는다 — 60/61 에코가 먼저 도착해 상태를 이미 옮겼다. 65 로 상태를 만들면 에코와 두 벌이 갈리고 65 유실 시 화면이 되살아난다"
  - "ServerMessage(54) 는 손대지 않았다 — 전략 거부 판정에 필요한 lv·src·i 가 이미 계약에 전부 실려 있다. 주인 판정(Pitfall 9)은 브라우저 한 함수 몫이라 relay 가 미리 가르면 판정이 두 벌이 된다"
  - "stats() 에 전략 3종 카운트를 더했다 — 개수만 담고 ISIN·계좌번호는 담지 않는다 (기존 cachedAccountCount 규율 승계)"

patterns-established:
  - "캐시 키 조립 함수(lcKey · viOrderKey · viPendingKey)를 모듈 상단에 모아 접두어 규율을 한눈에 검증 가능하게 둔다"
  - "변이 주입 7종으로 신규 테스트의 실효성을 사후 검증한다"

requirements-completed: [TRADE-03]

# Metrics
duration: 24min
completed: 2026-09-08
---

# Phase 16 Plan 06: relay Hub 전략 캐시 Summary

**16-05 가 만들어 두고 아무도 부르지 않던 파서 6종을 `SubscriptionHub` 에 배선 — 전략 3맵 캐시 · Ready 24/21/34 프리페치(주기 재조회 0) · `#onFrame` 명시 case 7종 · 세션 교체 폐기, 그리고 그 회계를 고정하는 13 케이스**

## Performance

- **Duration:** 24 min
- **Started:** 2026-09-08T11:05:00Z
- **Completed:** 2026-09-08T11:29:00Z
- **Tasks:** 3
- **Files modified:** 2 (created 1, modified 1)

## Accomplishments

- **화이트리스트만 열려 있던 중간 상태가 닫혔다.** 16-04 가 `INBOUND_MSG_TYPES` 를 19종으로 넓히고 16-05 가 파서 6종을 만들었지만, `#onFrame` 에 `case` 가 없어 응답 7종(56·60·61·64·65·72·73)은 여전히 `default:` 로 조용히 사라지고 있었다. 이제 7종 전부가 명시 case 를 갖는다 — **`default:` 로 떨어지는 프레임은 확장 후에도 0**이다 (PC-12 가 화이트리스트 확장의 조건으로 걸었던 것).
- **전략 캐시 3맵**(`#limitChasers` · `#viTriggers` · `#viOrders`)이 계좌 상태 캐시의 **4점 세트를 그대로 복제**한다 — 맵 선언 · Ready 프리페치 · 명시 case · `#clearCaches` 폐기. 새 아키텍처를 만들지 않은 것이 이 plan 의 핵심이다.
- **Ready 프리페치가 정확히 3프레임이고, 그 이후는 0이다** (D-12/D-13). `requestStrategySnapshot` 은 `#onReady` 한 자리에서만 불린다 — 주기 타이머도, 브라우저가 부를 수 있는 수동 재조회 진입점도 만들지 않았다. `setTimeout|setInterval` 카운트가 이 plan 이전과 **똑같이 1**(체결 배치 타이머)인 것이 그 증거다.
- **`crud:"D"` 가 캐시 삭제로 이어지고, 삭제도 프레임으로 나간다.** 캐시에서만 지우고 침묵하면 이미 열린 탭의 목록에 사라진 전략이 그대로 남는다.
- **「모른다」와 「없다」를 getter 반환 타입으로 갈랐다.** `getViTrigger` 는 `undefined`(61 을 아직 못 받음) · `null`(조회 결과 미등록) · `RelayViTrigger`(등록됨) 3상태다. 16-05 가 파서에서 만든 구분을 Hub 가 캐시까지 이어받았다.
- **접수 전(orderNo `""`) VI 주문의 중복 누적을 구조적으로 막았다.** 자리표시 복합키 → 주문번호가 붙으면 자리표시 행을 지우고 옮긴다.
- **변이 주입 7종**으로 신규 13 케이스의 실효성을 실측했다 (아래 Verification).

## Task Commits

1. **Task 1: 전략 캐시 3맵 + Ready 프리페치 + 스냅샷 getter** — `ceb0e84` (feat)
2. **Task 2: `#onFrame` 전략 case 7종 + 캐시 반영·팬아웃** — `ed108b6` (feat)
3. **Task 3: strategy-hub 테스트 신규** — `675bcea` (test)

## Files Created/Modified

- `relay/src/hub/subscription-hub.ts`
  - 파일 상단 결정 근거에 **D-12 · D-13** 추가 (전략 캐시의 소유자가 왜 여기인지, 왜 주기 재조회를 만들지 않는지)
  - 모듈 스코프 키 함수 3개: `lcKey`(= `item.key` 를 그대로 사용, 재조립 금지) · `viOrderKey` · `viPendingKey`
  - 캐시 맵 3개 + `HubStats` 에 `cachedLimitChaserCount`·`cachedViTriggerCount`·`cachedViOrderCount`
  - `requestStrategySnapshot(userId)` (24/21/34) · `#onReady` 한 줄 추가
  - getter 3개: `getLimitChasers` · `getViTrigger` · `getViOrders`
  - `#onFrame` case 7종 + 핸들러 4개(`#onLimitChaserEcho`·`#onLimitChaserList`·`#onViTrigger`·`#onViOrderList`) + 이름 보강 2개(`#enrichViOrder`·`#enrichViNotice`)
  - `#clearCaches`·`stats()`·`closeAll()` 3맵 반영
- `relay/tests/strategy-hub.test.ts` (신규) — `hub.test.ts` 구조 복제, 13 케이스

## Decisions Made

**1. VI 주문 캐시 키 — `orderNo` 정본 + 접수 전만 복합 자리표시 키.**
플랜이 재량으로 남긴 지점이다(「별도 배열 또는 `isin+triggerPrice` 복합키」). 별도 배열은 `getViOrders` 가 두 소스를 합쳐야 하고 전량 교체·항목 upsert 규칙이 갈린다. 복합키를 택하되 `@ISIN:계좌:발동가` 로 계좌까지 넣었다 — 같은 종목이라도 계좌가 다르면 다른 발동이다.
**그리고 접수 전환을 명시로 처리했다:** 주문번호가 붙은 항목이 오면 같은 복합키의 자리표시 행을 먼저 지운다. 이 한 줄이 없으면 73 푸시가 「접수 전」과 「접수됨」 두 줄을 남기고, 돈이 걸린 화면에서 그것은 이중 발주로 읽힌다. 케이스 ⑦-b 가 이 동작을 고정한다.

**2. `getViTrigger` 는 3상태를 돌려준다.**
16-05 가 파서에서 「미등록 ≠ 파싱 실패」를 갈랐다면, Hub 는 여기에 「아직 모른다」를 하나 더 얹어야 한다. 인증 직후 팬아웃(16-07)이 캐시를 읽어 프레임을 만들 텐데, `undefined` 를 `null` 로 뭉개면 61 이 도착하기 전에 「미등록」을 지어내 보내고 브라우저가 사용자가 입력 중인 금액을 지운다. 세션 교체에서 `#viTriggers.delete(userId)` 로 **`null` 이 아니라 키 부재로** 되돌리는 것도 같은 이유다(케이스 ⑨).

**3. 65 는 팬아웃만 한다 — 캐시를 고치지 않는다.**
플랜이 명시로 요구한 규율이고 threat register T-16-07(accept)의 근거이기도 하다. 서버가 키별 60/61 에코를 **먼저** 보낸 뒤 집계를 보내므로 65 도착 시점에는 캐시가 이미 갱신돼 있다. 여기서 `#limitChasers` 를 비우면 ① 에코와 두 벌이 갈리고 ② 65 가 유실되면 화면이 되살아난다. 케이스 ⑧ 이 「65 전후로 캐시가 한 글자도 안 바뀐다」를 단언한다.

**4. 72/73 은 case 라벨 2개 + 본문 1개.**
`GetQuoteResp/QuoteUpdate` · `GetAccountStateResp/AccountStateDelta` · `TradeTapeResp/TradeTapePush` 가 모두 이 형태다. 슬롯을 공유하고 스냅샷 구분이 `msg_type` 인 D-33 규약을 코드 모양으로 드러낸다. 플랜의 「명시 case 7개」 게이트는 라벨 기준이라 그대로 만족한다.

**5. `ServerMessage(54)` 는 손대지 않았다.**
플랜이 「필요한 필드가 빠졌으면 채우라」고 했는데, 실측하니 `RelayServerMsg` 에 `lv`(level) · `src`(source) · `i`(isin)가 **이미 전부** 있고 `parseServerMessage` 가 셋 다 채운다. 채울 것이 없어 대신 **왜 relay 가 판정하지 않는지**를 case 주석으로 남겼다 — `src==="Account" ∧ i===""` 만 VI 몫이라는 판정(Pitfall 9)은 브라우저 한 함수에서 하고, relay 가 미리 가르면 판정이 두 벌이 된다.

**6. `stats()` 에 3종 카운트를 더했다.**
`/healthz` 요약은 「식별자를 담지 않는다」가 규율이므로 **개수만** 담는다. `cachedViTriggerCount` 는 「VI 를 조회한 적이 있는 사용자 수」다 — 미등록(`null`)도 1로 센다(그 사실 자체가 캐시 항목이다). 현재 `hub.stats()` 소비자는 없어 필드 추가가 가산적이다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] VI 주문·통보의 종목명 보강 (`#enrichViOrder` / `#enrichViNotice`)**

- **Found during:** Task 2
- **Issue:** 플랜의 액션 문구에는 이름 보강이 없지만, `RelayViOrderItem.name` · `RelayViNoticeMsg.name` 은 계약 주석이 **「relay 가 `stocks.isin` 역매핑(SymbolMap)으로 채운다」**로 못박은 필드다. 16-05 SUMMARY 의 「Next Phase Readiness」도 두 번(`VIOrderItem.name` 은 「Hub 의 SymbolMap 역매핑 몫」, 56 은 「`name` 만 SymbolMap 으로 채워 팬아웃하면 된다」) 명시로 이 plan 에 넘겼다. 채우지 않으면 VI 화면 전체가 ISIN 원문으로 렌더되고, 그 사실이 16-07/16-08 에 가서야 드러난다.
- **Fix:** `#enrichNames`(계좌 계열)와 **같은 규율**로 `#enrichViOrder`·`#enrichViNotice` 추가 — 맵에 없으면 필드를 **비워 둔다**(ISIN 을 이름 자리에 넣지 않는다). 보강은 **캐시와 와이어 이전에 한 번만** 한다(캐시만 채우면 라이브 프레임에 이름이 없고, 와이어만 채우면 재접속 재생에 이름이 없다 — 기존 주석이 지적한 갈림).
- **Files modified:** `relay/src/hub/subscription-hub.ts`
- **Verification:** 케이스 ⑫ 가 56 통보와 72 행의 이름 보강 + 맵 미스 시 `undefined` 유지를 단언
- **Committed in:** `ed108b6`

**2. [Rule 2 - Missing Critical] 접수 전 VI 주문의 자리표시 키 승격 처리**

- **Found during:** Task 1
- **Issue:** 플랜은 접수 전 항목의 키 전략만 재량으로 남기고 「73 upsert 시 중복 누적 0」을 조건으로 걸었다. 복합키만 도입하면 그 조건은 만족하지만, **주문번호가 붙는 순간** 새 키로 upsert 되면서 옛 자리표시 행이 그대로 남는다 — 플랜의 문언은 지키면서 실동작은 깨지는 지점이다.
- **Fix:** upsert 시 `viPendingKey` 가 `viOrderKey` 와 다르면 자리표시 키를 먼저 삭제.
- **Files modified:** `relay/src/hub/subscription-hub.ts`
- **Verification:** 케이스 ⑦-b (접수 전 2회 주입 → 1건 유지 → 주문번호 부여 → 여전히 1건)
- **Committed in:** `ed108b6`

### 플랜 범위 안에서 형태만 조정한 것

**3. [형태 조정] 테스트 13 케이스 (플랜 지정 11 + 2)**
플랜의 11 케이스에 ⑦-b(접수 전 자리표시 승격, 위 Deviation 2 의 회귀 방어)와 ⑫(종목명 보강, 위 Deviation 1 의 회귀 방어)를 더했다. 둘 다 새 코드 경로를 만든 만큼의 단언이고 스코프 밖 표면을 건드리지 않는다.

**4. [형태 조정] 케이스 ⑩ 을 플랜 문언보다 강하게 썼다**
플랜은 「A 의 60 에코가 B 의 fanout 으로 나가지 않는다」였다. 처음 그대로 쓴 버전이 **변이 주입(`lcKey` 에서 userId 제거)을 통과했다** — A 만 프레임을 밀면 B 의 getter 는 어차피 0 이라 교차가 드러나지 않는다. 두 사용자가 **같은 전략 키**를 등록하고 서로 다른 값을 보는지까지 단언하도록 고쳐 변이를 잡게 했다.

**5. [형태 조정] Task 1 커밋에 Task 2 용 import 를 넣지 않았다**
파서 import 를 미리 넣으면 Task 1 커밋만 체크아웃했을 때 「부르지 않는 import」가 남는다. 커밋이 자족적이도록 Task 2 에서 함께 추가했다.

---

**Total deviations:** 5 (2 missing-critical, 3 형태 조정)
**Impact on plan:** 1·2 는 계약·상류 SUMMARY 가 이 plan 소관으로 명시한 배선이고, 3·4 는 그 회귀 방어와 테스트 실효성 보강이다. 5 는 커밋 위생. `files_modified` 2개 밖의 파일은 한 줄도 건드리지 않았다 — `envelope.ts`·`fanout.ts`·`msg-type.ts`·`session.ts` 무변경.

## Issues Encountered

**worktree 베이스가 wave 4 이전이었다.** 이 worktree 는 `e018095` 에서 갈라져 있어 의존하는 16-02/16-05 산출물이 트리에 없었다. 오케스트레이터가 준 베이스 `67d73e64` 를 **fast-forward merge** 로 당겨 해결했다 (`reset --hard`/`clean`/`stash` 미사용, 충돌 0건). `git merge-base HEAD 67d73e64` = `67d73e6440f17399ad711a81d373e7e51cdaca0d` — 베이스가 조상임을 확인했다.

**새 worktree라 `node_modules` 와 `packages/shared/dist` 가 없었다.** `pnpm install --frozen-lockfile` + `pnpm --filter @gh-radar/shared run build` 로 해결 (16-02/16-05 가 남긴 것과 같은 함정, tracked 파일 무변경).

**신규 13 케이스가 첫 실행에 전부 green 이었다 — 그래서 변이를 주입했다.** green 만으로는 「무엇을 잡는 테스트인가」를 알 수 없다. 7종을 넣어 돌린 결과는 아래 Verification 표에 있고, ⑩ 이 변이를 놓치는 것을 이때 발견해 케이스를 강화했다. 변이는 전부 되돌렸고 `git diff` 빈 출력로 Task 2 커밋 상태와 동일함을 확인했다.

## Verification

| 검증 | 결과 |
|------|------|
| `pnpm typecheck` (14 workspace) | exit **0** — 전부 Done |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit **0** (루트 typecheck 사각지대 — 16-02 가 남긴 필수 절차) |
| `pnpm --filter @gh-radar/relay test` | 16 files / **292 tests** passed (기존 279 + 신규 13) |
| `strategy-hub.test.ts` 단독 | **13 passed** |
| `grep -c "#limitChasers\|#viTriggers\|#viOrders"` | **29** (게이트 ≥12) |
| `grep -c "requestStrategySnapshot"` | **2** (정의 + `#onReady` 호출) |
| `grep -c "setInterval\|setTimeout"` | **1** — plan 이전과 **동일**(체결 배치 타이머). 주기 재조회 0건 (D-13) |
| `grep -c 'this.emit("fanout"'` | **1** — 팬아웃 경로가 여전히 `#fanout` 하나뿐 (T-16-02) |
| 명시 case 7종 (60·64·61·72·73·65·56) | **7/7** 존재 |
| 65 case 본문의 `#limitChasers`/`#viTriggers` 쓰기 | **0건** (완료 신호만) |
| `#clearCaches` 3맵 삭제 | 3/3 포함 (`#limitChasers` prefix 순회 · `#viTriggers.delete(userId)` · `#viOrders` prefix 순회) |

### 변이 주입 대조 (테스트 실효성 실측)

| 주입한 변이 | 실패한 케이스 |
|-------------|---------------|
| `#onReady` 에서 `requestStrategySnapshot` 제거 | ①② |
| `crud === "D"` 삭제 분기 제거 (항상 upsert) | ④ |
| 64 를 전량 교체 대신 병합으로 | ⑤ |
| 73 도 전량 교체로 (`if (snap)` → `if (true)`) | ⑦ |
| `#clearCaches` 에서 3맵 삭제 제거 | ⑨ |
| `lcKey` 에서 userId 접두어 제거 | ③④⑤⑧⑨**⑩**⑪ |
| 65 case 에 `#limitChasers.clear()` 삽입 | ⑧ |

마지막에서 두 번째 행이 **⑩ 강화의 근거**다 — 강화 전에는 이 변이를 ⑩ 이 놓쳤다. 변이는 전부 되돌렸고 `git diff --name-only` 빈 출력로 확인했다.

## Known Stubs

없음 — 캐시·프리페치·분기·폐기가 전부 실동작한다.

**다만 캐시를 읽는 소비자가 아직 없다.** `getLimitChasers`/`getViTrigger`/`getViOrders` 3 getter 는 테스트 외에는 호출되지 않는다 — 브라우저 auth 직후 스냅샷 팬아웃(`relay/src/ws/fanout.ts`)이 16-07 소관이기 때문이다. 라이브 경로(60/61/64/65/72/73/56 → `#fanout`)는 지금도 동작하므로, 이미 붙어 있는 소켓은 전략 프레임을 받는다. 빠져 있는 것은 **새로 붙은 탭의 초기 렌더**뿐이고 전략 UI 자체가 16-07/16-08 이후에 생기므로 사용자에게 보이는 결함을 만들지 않는다.

## Threat Flags

없음 — 새 네트워크 엔드포인트·인증 경로·파일 접근·스키마 변경 없음. 이 plan 은 이미 신뢰 경계 안으로 들어온 프레임을 세션 소유 캐시에 얹는 것이 전부다.

플랜 `<threat_model>` 대조:

- **T-16-02 (Information Disclosure, mitigate):** 캐시 키 접두어가 **언제나** `` `${userId}|` `` 다(`lcKey`·`viOrderKey`·`viPendingKey` 3함수가 유일한 조립 지점, `#viTriggers` 는 키가 userId 자체). 팬아웃은 `this.emit("fanout", …)` **grep 1건** — 새 전송 경로를 만들지 않았다. 케이스 ⑩ 이 **같은 전략 키를 등록한** 두 사용자로 교차 0을 증명한다.
- **T-16-05 (Tampering, mitigate):** 7 case 전부 파서 `null` 가드 뒤에만 캐시를 만진다. `default:` 조용한 드롭 0 — 화이트리스트 19종이 전부 명시 case 를 갖는다.
- **T-16-07 (Repudiation, accept):** 65 는 완료 신호로만 쓰고 캐시를 고치지 않는다(케이스 ⑧ 이 고정).
- **T-16-06 (DoS, accept):** 항목 상한은 파서(`MAX_LIMIT_CHASER_COUNT` 200 / `MAX_VI_ORDER_COUNT` 500)가 이미 건다. Hub 는 분할하지 않는다.

## User Setup Required

없음 — 외부 서비스 설정 없음.

## Next Phase Readiness

**16-07 (wss 프로토콜·팬아웃) 로 넘길 것:**

- **auth 직후 스냅샷 팬아웃**은 3 getter 를 이 순서로 읽으면 된다:
  - `getLimitChasers(userId)` → `{t:"lc.snap", items}` **1프레임**(0건이면 빈 배열 — 「없다」를 명시로 내린다)
  - `getViTrigger(userId)` → **`undefined` 면 아무것도 내리지 않는다**. `null` 이면 `{t:"vi", cfg:null}`(미등록), 객체면 `{t:"vi", cfg}`. 이 3분기를 2분기로 접지 말 것 — 사용자가 입력 중인 금액이 지워진다.
  - `getViOrders(userId)` → `{t:"vi.list", snap:true, items}`
- **종목명은 이미 채워져 있다.** getter 가 돌려주는 항목은 캐시 저장 시점에 보강된 값이라 팬아웃 쪽에서 다시 `SymbolMap` 을 부르지 않는다.
- 인바운드(`lc.set`·`vi.set`·`vi.confirm`·`strategies.disable`)는 이 plan 밖이다. Hub 에는 송신 헬퍼가 `requestStrategySnapshot` 하나뿐이고, 그것은 **조회 3종 전용**이다.
- **Pitfall 14 주의:** `#onAuthedMessage` 가 `unauthorized` 가드 직후 `keyOf(msg.isin, msg.ex)` 를 무조건 부른다. 전략 메시지에는 그 필드가 없으니 **분기 순서를 먼저 바꾼 뒤** 새 메시지를 추가할 것.

**16-07/16-08 (웹앱) 로 넘길 것:**

- **전략 키를 웹앱에서 조립하지 말 것** — 계약의 `key` 를 그대로 쓴다(16-05 가 남긴 것과 같은 당부, Hub 도 `item.key` 를 그대로 캐시 키에 쓴다).
- **「삭제됨」은 `item.crud === "D"` 로만 판정한다.** Hub 는 그 값으로 캐시에서 지우면서도 프레임은 내린다 — 브라우저는 `{t:"lc"}` 의 `crud` 를 보고 목록에서 행을 제거해야 한다(안 지우면 relay 캐시와 화면이 갈린다).
- **`{t:"vi.list", snap:false}` 는 항목 upsert 다.** `orderNo` 가 키이고 `""` 는 접수 전이라 확인 체크를 열지 않는다. relay 캐시는 접수 시 자리표시 행을 대체하지만 **브라우저도 같은 처리를 해야** 한다 — 안 그러면 브라우저 쪽에만 두 줄이 남는다.
- **15:40 자동 비활성화의 `run=false` 는 Broadcast 라 유실될 수 있다** (Pitfall 19). D-13 이 주기 재조회를 금지했으므로 relay 는 메우지 않는다 — 장 마감 표시로 오해를 막는 것은 UI 몫이다.
- **`{t:"msg"}` 의 주인 판정은 브라우저 한 함수에서** 한다: `src === "Account" ∧ i === ""` 만 VI 몫(Pitfall 9). relay 는 `lv`·`src`·`i`·`a`·`kind` 를 온전히 전달만 한다.

**우려:** 없음. 이 브랜치는 `67d73e64` 를 fast-forward merge 한 상태라 오케스트레이터 머지 시 wave 1~4 커밋이 이미 master 에 있어 no-op 으로 흡수된다. `envelope.ts`·`fanout.ts` 무변경이라 병렬 wave 와의 충돌 표면도 없다.

## Self-Check: PASSED

- 파일 3/3 존재 확인 (`relay/src/hub/subscription-hub.ts` · `relay/tests/strategy-hub.test.ts` · 본 SUMMARY)
- 커밋 3/3 브랜치에 존재 확인 (`ceb0e84` · `ed108b6` · `675bcea`)
- 삭제된 추적 파일 0건 (`git diff --diff-filter=D` 세 커밋 모두 빈 출력), untracked 잔여 0건
- STATE.md · ROADMAP.md **무변경** (오케스트레이터 소유 — 이 executor 는 건드리지 않았다)

---
*Phase: 16-trading-limit-chaser-vi-my-page*
*Completed: 2026-09-08*
