---
phase: 16-trading-limit-chaser-vi-my-page
plan: 05
subsystem: api
tags: [flatbuffers, relay, dma, limit-chaser, vi-trigger, codec, parser, typescript]

# Dependency graph
requires:
  - phase: 16-01
    provides: gh-trade 정본 재동기화된 생성 코드 (SetLimitChaser 활성 37필드 · cancel_qty_track_baseline 접근자)
  - phase: 16-02
    provides: 응답 프레임 빌더 (buildSetLimitChaserRespFrame · buildViOrderListFrame 등 6종)
  - phase: 16-03
    provides: RelayLimitChaser · RelayViTrigger · RelayViOrderItem · RelayViNoticeMsg 계약 타입
  - phase: 16-04
    provides: INBOUND 화이트리스트 19종 확장 + 전략 요청 빌더 7종 + LC_FIXED_SWEEP_* 상수
provides:
  - envelope.ts 전략 응답 파서 6종 (60 에코 · 64 목록 · 61 VI전략 · 72/73 VI주문목록 · 56 통보 · 65 집계)
  - strategyKey() — 전략 키 `ISIN:accountNo:exchange` 의 유일한 조립 지점
  - 수신 단일문자 변환 fromWireMarket · fromWireCrud · fromWireWatchSide
  - toOrderOrigin — OrderResp.origin → dma_orders.origin 3종 매핑 (ParsedOrderResp.originKind 신설)
  - ParsedViTrigger — 「미등록」과 「파싱 실패」를 타입으로 분리
  - skippedStrategyItemCount / MAX_LIMIT_CHASER_COUNT / MAX_VI_ORDER_COUNT
affects: [16-06, 16-07, 16-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "60 단건과 64 목록은 같은 바이트라 파서도 하나(readLimitChaser) — 두 벌이면 목록과 에코가 갈린다"
    - "「없음」과 「깨짐」은 반환 타입으로 분리한다 — 같은 값으로 뭉개면 UI 가 사용자 입력을 지울지 알 수 없다"
    - "항목 단위 실패는 ReadResult 로 사유를 올려 보내 단건 드롭 / 목록 스킵을 호출자가 고른다"

key-files:
  created: []
  modified:
    - relay/src/dma/envelope.ts
    - relay/src/dma/__tests__/envelope.test.ts

key-decisions:
  - "parseViTrigger 는 `{ ok: true; cfg: RelayViTrigger | null }` 를 돌려주고 파싱 실패만 null 이다 — 빈 61(미등록)과 파손을 같은 값으로 뭉개면 UI 가 사용자가 입력한 금액을 지워야 할지 알 수 없다"
  - "56 VI 통보는 ISIN 형식이 깨져도 프레임을 살린다(parseOrderResp 규율 승계) — 「주문이 이미 나갔다」는 알림을 형식 이상으로 삼키면 사용자가 발주 사실 자체를 모른다. 반대로 60/64 는 ISIN 이 전략 키의 첫 마디라 드롭한다"
  - "priceType 이 하한가('L')로 에코되면 상한가로 좁히고 경고만 남긴다 — 계약이 'U' 리터럴이라 표현할 방법이 없고, 프레임을 버리면 run·금액까지 잃는다"
  - "sweep 고정 3은 송신만 못박고 수신은 서버가 돌려준 값을 그대로 읽는다 — 수신까지 덮으면 서버가 다른 값을 들고 있어도 화면이 영원히 모른다"
  - "parseViOrderNotice 는 shared 에 없는 `RelayViNotice` 대신 태그가 붙은 `RelayViNoticeMsg` 를 돌려준다 — parseQuoteState/parseTradeTape/parseAccountState 와 같은 형태다"
  - "MAX_VI_ORDER_COUNT 는 500(상따 200 과 다르다) — VI 주문은 종목당 1건 제약이 없어 발동 횟수만큼 쌓인다"

patterns-established:
  - "수신 단일문자 변환(fromWire*)은 서버의 「첫 글자만 읽는다」 규약을 그대로 복제하고, 송신(toWire*)은 화이트리스트로 좁힌다 — 이 비대칭이 의도다"
  - "테스트는 소스 정규식 검사로 위치 인자 create* 0건을 잠근다 — 타입 시스템이 잡지 못하는 유일한 방어선"
  - "not.toThrow 단언에는 대조군(실제로 던지는 케이스)을 붙인다 — 공허한 green 방지"

requirements-completed: [TRADE-03]

# Metrics
duration: 32min
completed: 2026-09-08
---

# Phase 16 Plan 05: relay codec 수신 절반 Summary

**16-04 가 화이트리스트만 열어 둔 응답 7종을 JSON 계약으로 좁히는 파서 6함수 — 활성 37필드 왕복, bigint 3종의 toNum 통과, crud "D" 삭제 신호 보존, 「미등록 ≠ 파싱 실패」 타입 분리**

## Performance

- **Duration:** 32 min
- **Started:** 2026-09-08T10:31:00Z
- **Completed:** 2026-09-08T11:03:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- **응답 파서 6종**을 추가해 16-04 가 통과시킨 7종(56·60·61·64·65·72·73)이 전부 계약 타입으로 좁혀진다. `parseLimitChaserEcho` 는 `SetLimitChaser` **활성 37필드 전부**를 읽는다 — S→C 전용 4(`sellOrderQty`·`sellQtyTrackBaseline`·`sellEntryLatched`·`cancelQtyTrackBaseline`)는 보내지 않지만 **표시를 위해 읽는다**(Pitfall 6: 「보내지 않는 것」과 「읽지 않는 것」은 다른 문제다).
- **bigint 3종**(`orderAmountKrw` · `deadline110Ms` · `deadline119Ms`)이 전부 `toNum` 한 곳을 통과한다. `encode()` 를 **실제로 호출하는** 테스트로 계약에 64비트가 없음을 런타임으로 증명했고, 변환을 빠뜨리면 실제로 TypeError 가 난다는 **대조군**을 같은 케이스에 붙였다.
- **「미등록」과 「파싱 실패」를 타입으로 갈랐다.** `parseViTrigger` 는 빈 61 에 `{ ok: true, cfg: null }` 을 돌려주고 드롭 카운터를 올리지 않는다. 파싱 실패만 `null` 이다.
- **`crud: "D"` 가 삭제 신호로 보존된다.** 취소 게이트가 켜져 있으면 매수·매도를 둘 다 꺼도 서버가 `"C"` 로 에코한다는 사실을 문서화 테스트로 못박았다 (Pitfall 7 / D-08).
- 전략 키 조립을 `strategyKey()` **한 곳**으로 모았다. 브라우저는 계약의 `key` 를 그대로 신뢰한다 — 두 곳에서 만들면 12자 절단·거래소 정규화 중 한쪽만 반영돼 「에코가 영원히 매칭되지 않는」 조용한 실패가 난다.
- 왕복·경계 **17 케이스**(플랜 지정 11 + 보강 6)를 추가하고, 의도적 변이 주입으로 테스트가 공허하지 않음을 확인했다(필드 한 칸 밀기 → ① 실패, `fromWireCrud` 무력화 → ④·⑫·⑰ 실패).

## Task Commits

1. **Task 1: 전략 응답 파서 6함수** — `0e19858` (feat)
2. **Task 2: envelope 왕복·경계 테스트** — `208cde8` (test)

## Files Created/Modified

- `relay/src/dma/envelope.ts` — 「전략 파싱」 섹션 신설(파서 6 + `readLimitChaser` + `strategyKey` + `VI_ORDER_STATES` + 상한 2종 + 전략 항목 스킵 카운터), `fromWireMarket`/`fromWireCrud`/`fromWireWatchSide` 를 기존 `fromWire*` 옆에 추가, `toOrderOrigin` + `ParsedOrderResp.originKind` 신설
- `relay/src/dma/__tests__/envelope.test.ts` — 「전략 응답 파싱」 describe 17케이스, `lcInput` 픽스처를 모듈 스코프로 승격(조립·파싱이 같은 33필드를 공유)

## Decisions Made

**1. 「미등록」과 「파싱 실패」를 반환 타입으로 갈랐다.**
`parseViTrigger(env): ParsedViTrigger | null` 에서 `{ ok: true, cfg: null }` 은 미등록이고 `null` 은 파싱 실패다. 서버는 전략이 없어도 반드시 61 을 보내므로(무응답 금지) **빈 슬롯은 파손이 아니다** — 드롭 카운터도 올리지 않는다. 둘을 하나로 합치면 UI 가 사용자 입력을 지워야 할지(파손이면 유지, 미등록이면 `run` 만 내림) 알 수 없다.

**2. ISIN 형식 이상에 대한 처리가 파서마다 다르다 — 의도된 비대칭이다.**
- **60/64(상따)**: ISIN 은 전략 키의 첫 마디다. 깨지면 어느 종목의 전략인지 알 수 없어 행이 무의미하므로 드롭(단건) 또는 항목 스킵(목록)한다.
- **56(VI 통보)**: 이 프레임은 **"주문이 이미 나갔다"는 알림**이다. 형식 이상으로 통째로 삼키면 사용자가 발주 사실 자체를 모른다 — `parseOrderResp` 가 거부 통보를 살리는 것과 같은 규율으로 경고만 남기고 값은 올린다.
- **72/73(VI 주문)**: 행 단위로 스킵한다. 돈이 걸린 목록에서 한 행 때문에 전체가 사라지는 것이 가장 나쁜 결과다 (T-16-06).

**3. `priceType` 이 하한가면 상한가로 좁히고 경고만 남긴다.**
`RelayViTrigger.priceType` 은 계약상 `"U"` 리터럴이다. 다른 클라이언트(WinForms)가 하한가로 등록해 두면 계약에 표현할 방법이 없는데, 프레임을 버리면 `run`·금액까지 잃는다. `priceType` 은 UI 노출 대상이 아니고 relay 는 어차피 `"U"` 만 송신하므로 좁혀도 사용자에게 보이는 손실이 없다. 조용히 덮지 않고 `rawPriceType` 을 담아 경고한다 (PC-7).

**4. sweep 고정 3은 송신만 못박고 수신은 그대로 읽는다.**
16-04 는 `buildSetLimitChaserReq` 가 입력과 무관하게 `true/0/0` 을 쓰게 했다. 파서는 반대로 **서버가 되돌려준 값을 그대로 읽는다** — 수신까지 고정값으로 덮으면 서버가 다른 값을 들고 있어도 화면이 영원히 모른다.

**5. `parseViOrderNotice` 의 반환 타입은 `RelayViNoticeMsg` 다.**
플랜은 `RelayViNotice` 를 적었지만 shared 에 그 이름의 타입이 없다(태그 없는 형태를 새로 만들려면 계약 파일 수정이 필요한데 이 플랜의 `files_modified` 밖이다). 태그가 붙은 형태를 돌려주는 것이 `parseQuoteState`(`RelayQuote`) · `parseTradeTape`(`RelayTape`) · `parseAccountState`(`RelayAccountState`) 와 **같은 관행**이므로 그쪽을 택했다. Hub 는 `name` 만 붙여 그대로 팬아웃할 수 있다.

**6. 벡터 상한을 목록별로 다르게 뒀다.**
`MAX_LIMIT_CHASER_COUNT = 200`(플랜 지정) · `MAX_VI_ORDER_COUNT = 500`. VI 주문은 상따와 달리 **종목당 1건 제약이 없어** 발동 횟수만큼 쌓이므로 같은 값을 쓸 이유가 없다. 둘 다 정책이 아니라 파손 프레임 방어용 폭이다.

## Deviations from Plan

### 계획된 범위 안에서 형태만 조정한 것

**1. [Rule 2 - Missing Critical] 파서 3종(64 · 56 · 65)의 테스트 6케이스 보강**
- **Found during:** Task 2
- **Issue:** 플랜이 지정한 11 케이스는 60(①~⑤) · 61(⑥⑦) · 72/73(⑦~⑨) 만 다룬다. `parseLimitChaserList`(64) · `parseViOrderNotice`(56) · `parseDisableStrategiesResp`(65) 는 **한 줄도 실행되지 않은 채** green 이 되고, threat register T-16-05(슬롯 null 가드) · T-16-06(항목 상한·항목 단위 드롭)의 방어선이 실측 없이 남는다.
- **Fix:** ⑫(64 목록 0건·2건·키) · ⑬(항목 스킵 + 상한 205→200 클램프) · ⑭(56 필드 왕복) · ⑮(65 집계 0건 포함) · ⑯(파서 5종 슬롯 null → null + 드롭 카운터 5) · ⑰(`fromWire*` 3종의 「첫 글자만」 규약, `"KOSDAQ"` → `"K"` 함정 포함) 추가
- **Files modified:** `relay/src/dma/__tests__/envelope.test.ts`
- **Verification:** relay 전체 279 tests green (기존 262 + 신규 17)
- **Committed in:** `208cde8`

**2. [Rule 2 - Missing Critical] `ParsedOrderResp.originKind` 신설**
- **Found during:** Task 1
- **Issue:** 플랜은 `toOrderOrigin` 을 "같은 파일에 둔다"고만 했다. 파서가 원문만 올리고 매핑을 호출자에게 맡기면 **와이어 지식이 이 파일 밖으로 샌다**(파일 상단이 선언한 경계 위반). 또 매핑 함수가 파일 안에서 한 번도 호출되지 않아 회귀 시 아무도 모른다.
- **Fix:** `ParsedOrderResp` 에 `originKind: OrderOriginKind` 를 추가하고 `parseOrderResp` 가 `toOrderOrigin(origin)` 으로 채운다. **원문 `origin` 도 그대로 유지**한다 — 감사 로그에는 서버가 실제로 보낸 문자열이 필요하고 DB 에는 CHECK 를 통과하는 3종만 넣을 수 있다.
- **Files modified:** `relay/src/dma/envelope.ts`
- **Verification:** `pnpm typecheck` exit 0 (기존 소비자 무영향 — 필드 추가는 가산적), 케이스 ⑪ 이 51 통보 왕복으로 단언
- **Committed in:** `0e19858`

**3. [형태 조정] `lcInput` 픽스처를 모듈 스코프로 승격**
- **Found during:** Task 2
- **Issue:** 33필드 픽스처가 16-04 의 「전략 요청 조립」 describe 안에 갇혀 있어, 파싱 describe 가 쓰려면 복제해야 했다. 두 벌이면 한쪽만 고쳐져 **「빌더는 보냈는데 파서는 못 읽는」 갈림을 테스트가 놓친다**.
- **Fix:** describe 밖으로 올려 조립·파싱 두 describe 가 같은 픽스처를 공유
- **Verification:** 기존 12 케이스 전부 green 유지
- **Committed in:** `208cde8`

**4. [명명] `parseViOrderNotice` 반환 타입 — Decisions #5 참조** (플랜의 `RelayViNotice` 는 shared 에 존재하지 않는 이름이다)

---

**Total deviations:** 4 (2 missing-critical, 1 형태 조정, 1 명명)
**Impact on plan:** 넷 다 플랜 목표에 종속적이다. 1·2 는 threat register 의 방어선을 실측 단언으로 덮은 것이고, 3 은 테스트 픽스처 단일화, 4 는 shared 계약에 실재하는 타입으로의 치환이다. 스코프 크립 없음 — `files_modified` 2개 밖의 파일은 건드리지 않았다.

## Issues Encountered

**worktree 베이스가 wave 3 이전이었다.** 이 worktree 는 `e018095`(quick-260908-py9 직후)에서 갈라져 있어 의존하는 16-02/16-03/16-04 산출물이 트리에 없었다. 오케스트레이터가 준 베이스 `4458b902` 를 **fast-forward merge** 로 당겨 해결했다 (`reset --hard`/`clean`/`stash` 사용 안 함, 충돌 0건). `git merge-base HEAD 4458b902` = `4458b902` — 베이스가 조상임을 확인했다.

**새 worktree라 `node_modules` 와 `packages/shared/dist` 가 없었다.** `pnpm install --frozen-lockfile` + `pnpm --filter @gh-radar/shared run build` 로 해결. 루트 `pnpm typecheck` 는 shared build 를 선행하지만 `vitest` 단독 실행은 그렇지 않다 (16-04 가 남긴 것과 같은 함정).

**변이 주입으로 테스트의 실효성을 확인했다.** 새 케이스가 통과하는 것만으로는 「파서가 맞다」를 증명하지 못하므로, ① `readLimitChaser` 의 `buyWatchQty` 를 `buyMinTradeQty()` 로 한 칸 밀고 ② `fromWireCrud` 를 항상 `"C"` 로 만들어 돌렸다. 각각 ①, ④·⑫·⑰ 이 실패했다 — 변이는 즉시 되돌렸고 `envelope.ts` 는 Task 1 커밋 상태 그대로다.

## Verification

| 검증 | 결과 |
|------|------|
| `pnpm typecheck` (shared build + 전 패키지) | exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 (relay `tests/` + `src/**/*.test.ts` — 루트 typecheck 사각지대) |
| `pnpm --filter @gh-radar/relay test` | 15 files / **279 tests** passed (기존 262 + 신규 17) |
| 신규 describe 단독 실행 | 17 passed |
| `grep -c "export function parse\(LimitChaserEcho\|LimitChaserList\|ViTrigger\|ViOrderList\|ViOrderNotice\|DisableStrategiesResp\)"` | **6** |
| `grep -c "toNum("` | **24** (≥3) |
| `grep -c "toOrderOrigin"` | **2** (≥2 — 정의 + `parseOrderResp` 호출) |
| `grep -c "cancelQtyTrackBaseline"` envelope.ts | **2** (읽기 + 주석) — 에코 반환 객체에 포함 |
| `grep -cE "create(SetLimitChaser\|SetVITrigger)\("` | **0** (케이스 ⑩ 이 소스를 읽어 단언) |
| 변이 주입 대조 | 필드 밀림 → ① fail / `fromWireCrud` 무력화 → ④·⑫·⑰ fail |

## Known Stubs

없음 — 파서 6종은 전부 실동작한다.

**다만 아직 아무도 호출하지 않는다.** `SubscriptionHub.#onFrame` 에 명시 `case` 가 없어 응답 7종은 여전히 `default:` 로 떨어진다. 16-04 가 남긴 「화이트리스트만 열린 중간 상태」의 **절반**이 이 plan 으로 채워졌고, 나머지 절반(Hub 분기 + 팬아웃)은 16-06 소관이다. `relay/src/dma/msg-type.ts` 상단 주석이 그 책임 목록의 정본이다. 파서가 미배선이라는 사실이 사용자에게 보이는 화면을 만들지는 않는다(전략 UI 자체가 16-07/16-08 이후에 생긴다).

## Threat Flags

없음 — 새 네트워크 엔드포인트·인증 경로·파일 접근·스키마 변경 없음. 이 plan 이 만든 것은 이미 신뢰 경계 안으로 들어온 바이트를 좁히는 순수 함수뿐이다. 플랜 `<threat_model>` 의 T-16-05 / T-16-06 / T-16-07 은 전부 mitigate 상태로 구현했다(null 가드 · 벡터 상한 · 항목 단위 드롭 · `drop`/`dropField` 사유·카운터 · `toOrderOrigin` 의 미지 값 고정).

## User Setup Required

None — 외부 서비스 설정 없음.

## Next Phase Readiness

**16-06 (Hub) 로 넘길 것:**
- 명시 `case` 7종과 짝지을 파서가 전부 준비됐다:
  - `60` → `parseLimitChaserEcho` → `{ t: "lc", item }`. **`item.crud === "D"` 면 캐시에서 삭제**하고, 그렇지 않으면 upsert 한다. 캐시 키는 `item.key` 를 그대로 쓴다(다시 만들지 말 것).
  - `64` → `parseLimitChaserList` → `{ t: "lc.snap", items }`. `[]` 는 정상(전량 교체)이다.
  - `61` → `parseViTrigger` → `null` 이면 **아무것도 하지 않고**(파싱 실패), `{ ok: true, cfg }` 면 `{ t: "vi", cfg }` 를 그대로 팬아웃한다. `cfg: null` 이 미등록이다.
  - `72/73` → `parseViOrderList(env, msgType === MSG.GetVIOrderListResp)` → `{ t: "vi.list", snap, items }`.
  - `56` → `parseViOrderNotice` → **이미 `t: "vi.notice"` 가 붙어 있다.** `name` 만 SymbolMap 으로 채워 팬아웃하면 된다.
  - `65` → `parseDisableStrategiesResp` → `{ t: "strategies.disabled", count, viDisabled }`. **완료 신호로만** 쓰고 상태는 60/61 에코로 갱신한다.
- **파싱 실패를 재로그하지 말 것** (S-2). 사유·카운터는 `envelope.ts` 가 이미 남긴다. Hub 는 `null` 이면 그냥 return 한다.
- 프리페치 3연발은 16-04 의 `buildGetLimitChaserListReq()` · `buildGetVITriggerReq()` · `buildGetVIOrderListReq()` 를 그대로 쓴다.
- `VIOrderItem.name` 은 파서가 채우지 않는다(게이트웨이가 주는 값이 아니다) — Hub 의 SymbolMap 역매핑 몫이다.

**16-07/16-08 (웹앱) 로 넘길 것:**
- **전략 키를 웹앱에서 조립하지 말 것.** 계약의 `key` 를 그대로 쓴다 — `strategyKey()` 가 유일한 조립 지점이고, 12자 절단본을 쓰기 때문에 브라우저가 원본 문자열로 다시 만들면 키가 갈린다.
- **「삭제됨」은 `item.crud === "D"` 로만 판정한다.** 매수·매도 스위치 두 개만 보면 서버 진실과 갈린다 — 취소 게이트가 켜져 있으면 둘 다 꺼도 전략이 남는다(케이스 ⑤ 가 이것을 문서화한다).
- `buyEnabled`/`sellEnabled`/`cancelQtyEnabled`/`cancelTradeEnabled` 는 에코에서 **무장 상태**로 접혀 온다. `sellQtyTrackEnabled`/`cancelQtyTrackEnabled`/`sellEntryLatched` 는 접지 않은 원값이다 (Pitfall 10).
- `orderNo === ""` 는 접수 전(Pending)이라 **확인 체크를 열지 않는다** — 파서가 `""` 를 보존하는 이유다.
- `"K"`/`"Q"`/`"D"`/`"1"` 같은 와이어 리터럴을 웹앱에 흩뿌리지 말 것. 변환은 `fromWire*` 3종이 relay 안에서 끝낸다 (케이스 ⑰ 이 `"KOSDAQ"` → `"K"` 함정을 고정한다).

**16-08(주문 기록) 로 넘길 것:**
- `ParsedOrderResp.originKind` 가 `dma_orders.origin` 에 그대로 들어갈 값이다(`manual`/`limit_chaser`/`vi`). 매핑을 다시 만들지 말 것. RESEARCH #18 이 지적한 「자동주문 행의 insert 경로 부재」는 여전히 열려 있다 — 이 plan 은 **값을 준비**했을 뿐 insert 경로를 만들지 않았다.

**우려:** 없음. 이 브랜치는 `4458b902` 를 fast-forward merge 한 상태라 오케스트레이터 머지 시 wave 1~3 커밋이 이미 master 에 있어 no-op 으로 흡수된다.

## Self-Check: PASSED

- 파일 3/3 존재 확인 (`relay/src/dma/envelope.ts` · `relay/src/dma/__tests__/envelope.test.ts` · 본 SUMMARY)
- 커밋 2/2 브랜치에 존재 확인 (`0e19858` · `208cde8`)
- 삭제된 추적 파일 0건 (`git diff --diff-filter=D` 두 커밋 모두 빈 출력), untracked 잔여 0건

---
*Phase: 16-trading-limit-chaser-vi-my-page*
*Completed: 2026-09-08*
