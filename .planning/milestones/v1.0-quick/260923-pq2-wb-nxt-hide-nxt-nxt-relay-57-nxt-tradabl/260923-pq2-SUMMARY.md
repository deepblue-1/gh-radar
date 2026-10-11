---
phase: quick-260923-pq2
plan: 01
subsystem: relay · shared · webapp(trading 카드 헤더 · 종목상세 호가 상태줄)
tags: [nxt, relay, symbol-master, exchange-segment, trading-workbench]
status: complete
requires:
  - quick-260923-cqj (게이트웨이 종목마스터 27/57 보조 원천)
  - quick-260923-pgv (카드 거래소 토글 잠금 해제 — EXCHANGE_SEGMENT_TITLE)
provides:
  - "shared RelayNxtSnapMsg { t: 'nxt.snap'; isins }"
  - "relay GatewaySymbolMaster.nxtTradableIsins() (null = 모름) · stats().nxtTradableCount"
  - "relay WsFanout nxtTradable dep — 인증 직후 조건부 nxt.snap · updated 재전송"
  - "webapp RelayConnectionState.nxtTradable · exchangeChoicesOf 순수 함수"
affects:
  - webapp/src/components/trading/card/card-header.tsx
  - webapp/src/components/stock/stock-orderbook-section.tsx
tech-stack:
  added: []
  patterns:
    - "「모름은 안 보낸다」 게이트(lc.snap 과 같은 규율) — 적재 전 null 은 프레임 0"
    - "구조적 최소 표면 타입(NxtTradableFeed) — HubSymbolMasterFeed 선례"
key-files:
  created:
    - webapp/src/lib/exchange-choices.ts
    - webapp/src/lib/__tests__/exchange-choices.test.ts
  modified:
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts
    - relay/src/dma/envelope.ts
    - relay/src/store/gateway-symbols.ts
    - relay/src/ws/fanout.ts
    - relay/src/index.ts
    - relay/tests/gateway-symbols.test.ts
    - relay/tests/fanout.test.ts
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/components/trading/card/card-header.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/stock/stock-orderbook-section.tsx
    - webapp/src/components/trading/__tests__/card-header.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card.test.tsx
    - webapp/src/components/stock/__tests__/stock-orderbook-section.test.tsx
decisions:
  - "NXT 거래가능 여부는 57 nxt_tradable 을 ISIN 집합으로만 보관하고 SymbolInfo 에는 넣지 않는다(T-16-05 — Supabase 행에 값이 없어 false 를 지어내게 된다)"
  - "nxt.snap 은 집합이 적재돼 있을 때만 보낸다 — 모름을 빈 배열로 내리면 모든 종목의 NXT 가 사라지는 거짓 확정"
  - "웹앱은 nxtTradable null(모름)·집합 포함·현재 NXT 면 KRX|NXT 둘 다, 미포함이면 KRX 라벨 하나 — 숨김만, 자동 전환 없음"
metrics:
  duration: "약 8분 (463초)"
  completed: 2026-09-23
estimate:
  tokens: 110000
  tasks: 3
actuals:
  tokens: 7000
  tasks: 3
  commits: 2
plan_head_before: 1b050e69eee1ca516347c40bb270f900fda171a3
---

# Quick 260923-pq2: NXT 미거래 종목 거래소 세그먼트 숨김 Summary

relay 가 게이트웨이 종목마스터 57 의 `nxt_tradable` 을 ISIN 집합(적재 전 `null`)으로 보관해 인증 직후·일일 재적재 때 `nxt.snap` 으로 내리고, 웹앱은 같은 순수 함수 `exchangeChoicesOf` 로 카드 헤더와 호가 상태줄 세그먼트를 그린다. 집합에 없는 종목은 「KRX」 라벨 하나, 모르면 KRX|NXT 둘 다.

## (a) 배포 순서 — 반드시 이 순서

이 quick 은 **이미 쌓인 relay 미배포 변경**(R2 18-14·17·19 + R3 18-25·18-26 + R4 18-33 + quick cqj·e1m·ge2·m23 … + 이번 pq2) 위에 얹혀 있다.

1. **relay 먼저** — `deploy-relay.sh` (사용자 실행).
2. **검증** — `/healthz` · `smoke-relay.sh`. 가능하면 `[SYM-GW] 게이트웨이 종목마스터 적재` 로그에서 `nxtTradableCount` 가 0 이 아닌지 본다(57 이 적재돼야 `nxt.snap` 이 나간다).
3. **그다음 webapp push** (= Vercel 프로덕션 배포).

웹앱은 `nxt.snap` 이 안 오면 `nxtTradable` 이 `null` 로 남아 **둘 다 그리는 하위호환**이다. 그래서 relay 가 먼저면 안전하고, **역순(webapp 먼저)이어도 화면은 깨지지 않는다**(둘 다 표시 유지) — 기능이 켜지지 않을 뿐이다. 이 실행에서는 **push 도 배포도 하지 않았다**(사용자 결정).

## (b) 바뀐 지점

**shared (`packages/shared`)**
- `src/relay.ts` — `export type RelayNxtSnapMsg = { t: "nxt.snap"; isins: string[] }` 추가, `RelayOutbound` 유니온 끝에 `| RelayNxtSnapMsg`.
- `src/index.ts` — export 블록에 `RelayNxtSnapMsg`.

**relay**
- `src/dma/envelope.ts` — `GatewaySymbolRow.nxtTradable: boolean`, `parseSymbolMasterFrame` 이 `nxtTradable: item.nxtTradable()` 를 보존. 주석 갱신(`sec_group_id` 만 제외).
- `src/store/gateway-symbols.ts` — `Inflight.nxt: string[]`, 필드 `#nxtTradableIsins: readonly string[] | null = null`, `onFrame` 원소 루프에서 플래그 true 인 ISIN 수집(57 원순서), 원자 교체 지점에서 `#byIsin` 과 함께 교체, 조회 `nxtTradableIsins()`, `stats().nxtTradableCount`, 적재 로그에 `nxtTradableCount`. 실패 갈래(`#fail`)는 집합을 건드리지 않는다. `SymbolInfo` 무변경. 머리 주석 「하지 않는 것」을 NXT 집합 예외로 갱신.
- `src/ws/fanout.ts` — `export type NxtTradableFeed`(구조적 최소 표면), `WsFanoutDeps.nxtTradable?`, 필드 `#nxtTradable` · `#onNxtUpdated`, constructor 끝에서 `updated` 구독, `closeAll` 에서 `off`. `#onFirstMessage` 스냅샷 묶음 맨 끝(`queued.window` 뒤)에 집합이 있을 때만 `nxt.snap` 1프레임. `#nxtSnapFrame()` · `#broadcastNxtSnap()`(`#users` 만 순회 — 미인증·자격증명 미등록 연결 제외).
- `src/index.ts` — `new WsFanout({ …, nxtTradable: gatewaySymbols })` 결선.

**webapp**
- `src/lib/use-relay-socket.ts` — `RelayConnectionState.nxtTradable: ReadonlySet<string> | null`, `RelayData` · `INITIAL_DATA(null)`, `applyFrame` 의 `case "nxt.snap"`(Set 통째 교체), `useMemo` 반환. 재접속은 유지, `reset` 만 `null`.
- `src/lib/relay-provider.tsx` — `EMPTY_RELAY_VALUE.nxtTradable: null`.
- `src/lib/exchange-choices.ts`(신규) — `EXCHANGE_CHOICES_ALL` · `EXCHANGE_CHOICES_KRX_ONLY` · `KRX_ONLY_TITLE` · `exchangeChoicesOf(isin, exchange, nxtTradable)`(상수 참조 반환).
- `src/components/trading/card/card-header.tsx` — 모듈 상수 `EXCHANGES` 제거, `exchangeChoices?` prop(기본 둘 다), 길이 1 이면 `data-slot="card-exchange-segment" data-single="true"` 라벨(같은 `h-5` · `title=KRX_ONLY_TITLE` · role 없음 · 전파 차단 래퍼 유지). 머리 주석 ②-b. `EXCHANGE_SEGMENT_TITLE`(pgv)은 그대로.
- `src/components/trading/card/strategy-card.tsx` — `useRelayContext()` 에서 `nxtTradable` 을 받아 `exchangeChoicesOf(isin, exchange, nxtTradable)` → `<CardHeader exchangeChoices>`.
- `src/components/stock/stock-orderbook-section.tsx` — 모듈 상수 `EXCHANGES` 제거, 같은 순수 함수로 `exchangeChoices` 계산 → `OrderbookStatusBar` prop, 길이 1 이면 `data-slot="orderbook-exchange-segment" data-single="true"` 라벨. `isNxtEmpty` · `TabNotices` · `handleExchangeChange` 그대로.

## (c) 새 테스트 케이스 (7)

1. relay `gateway-symbols.test.ts` — 「⑬ nxt_tradable 보존 (quick-260923-pq2) — 파싱 행 플래그 · 스토어 ISIN 집합 · 적재 전 null · 재적재 시 통째 교체 · SymbolInfo 에는 없음」
2. relay `fanout.test.ts` — 「⑭-5 nxt.snap — 적재 전엔 0프레임, 적재 뒤 인증하면 스냅샷 묶음 끝에 1프레임, updated 시 인증된 모든 연결에 재전송, 미인증 소켓엔 없음, close 가 리스너를 뗀다 (quick-260923-pq2)」
3. webapp `exchange-choices.test.ts` — describe 「exchangeChoicesOf — 거래소 선택지 (quick-260923-pq2)」 6케이스
4. webapp `relay-socket.test.ts` — describe 「nxt.snap — NXT 거래가능 집합 (quick-260923-pq2)」
5. webapp `card-header.test.tsx` — describe 「CardHeader — 거래소 선택지 (quick-260923-pq2)」 ①~③
6. webapp `strategy-card.test.tsx` — 「quick-260923-pq2 — 컨텍스트 nxtTradable 집합에 이 카드 ISIN 이 없으면 헤더 세그먼트가 KRX 라벨 하나, 있으면/모르면 둘 다」
7. webapp `stock-orderbook-section.test.tsx` — 「③-d quick-260923-pq2 — nxtTradable 집합에 이 종목이 없으면 상태줄 세그먼트가 KRX 라벨 하나(NXT radio 없음), 있으면 둘 다」

TDD: 두 태스크 모두 테스트를 먼저 쓰고 `typecheck:tests` / webapp `typecheck` 실패(RED — `nxt.snap` 타입 부재 · `nxtTradableIsins` 부재 · 모듈 부재)를 확인한 뒤 구현해 GREEN.

## (d) 게이트 결과 (원문)

- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck` → **exit 0 · `error TS` 0건**
- `pnpm --filter @gh-radar/relay run test` → **Test Files 22 passed (22) · Tests 632 passed (632)**
- `pnpm --filter @gh-radar/webapp run test` → **Test Files 98 passed (98) · Tests 1655 passed | 1 skipped (1656)**
- `cd webapp && pnpm exec playwright test trading-workbench` → **39 passed (1.8m) · 0 failed · 0 skipped** (케이스 3 의 `card-exchange-segment` KRX radio 단언이 「프레임 없음 → 둘 다」 하위호환의 실브라우저 증거 — 스텁 게이트웨이는 27 에 응답하지 않아 `nxt.snap` 이 오지 않는다)
- 금지 영역: `relay/src/store/symbols.ts` · `relay/src/generated` · `relay/src/ws/protocol.ts` · `pnpm-lock.yaml` · `supabase` — 작업트리 diff 0 · 스테이지 diff 0 · 이 quick 태그 커밋이 건드린 이력 0건. `webapp/e2e` · `vi-settings-rows.tsx` diff 0.

## (e) 커밋

| 배포 단위 | 해시 | 메시지 |
|---|---|---|
| relay + shared | `00c4cb0` | feat(quick-260923-pq2): relay 57 nxt_tradable 보존 → nxt.snap 프레임 (shared 계약 · 스토어 ISIN 집합 · 인증 직후 조건부 스냅샷 · 재적재 재전송) |
| webapp | `f9ce892` | feat(quick-260923-pq2): 카드·호가 거래소 세그먼트 — NXT 미거래 종목은 KRX 라벨 하나 (nxt.snap 리듀서 · exchangeChoicesOf · 모르면 둘 다) |

Co-Authored-By 없음 · `.planning` 미커밋 · push 없음.

## (f) 플랜과 다른 점

1. **fanout 새 케이스 이름 `⑭-4` → `⑭-5`.** `relay/tests/fanout.test.ts` 에 이미 「⑭-4 콜드 세션 — 64 전에 인증한 탭은 lc.snap 을 받지 않고…(18-26 / GC-IN-02)」가 있어 번호가 겹친다. 내용은 플랜 `<behavior>` (a)~(d) 그대로다.
2. **⑭-5 는 별도 하네스 전용 `openNx()` 헬퍼를 케이스 안에 뒀다.** 기존 `open()` 은 기본 하네스 `h.port` 에 묶여 있어 주입 하네스에 붙지 못한다(⑧ strict 선례처럼 `connectWs(nx.port)` 로 직접 연결 · 정리 목록 `sockets` 에 등록).
3. **⑬ 의 「실패 갈래 집합 유지」 단언은 빈 마스터(⑦ 선례) 1건으로** 확인했다(플랜이 둘 중 하나를 허용).
4. **strategy-card 케이스는 카드 헤더 범위로 좁혀** `role="radio"` 를 센다 — 카드 본문에 다른 라디오가 생겨도 오판하지 않게.

그 외 설계는 플랜 그대로다. pgv 이후 `card-header.tsx` 에 `exchangeLocked` 가 이미 없었으므로 만들지 않았다.

## Known Stubs

없음.

## Threat Flags

없음 — 새 표면(`nxt.snap`)은 플랜 threat_model T-pq2-01~06 에 이미 있다. `#broadcastNxtSnap` 은 `#users` 만 순회한다(⑭-5 (c) 단언).

## Self-Check: PASSED

- 파일: `webapp/src/lib/exchange-choices.ts` · `webapp/src/lib/__tests__/exchange-choices.test.ts` 존재
- 커밋: `00c4cb0` · `f9ce892` 존재 (`git log --format='%h %s' | grep quick-260923-pq2` = 2건)
