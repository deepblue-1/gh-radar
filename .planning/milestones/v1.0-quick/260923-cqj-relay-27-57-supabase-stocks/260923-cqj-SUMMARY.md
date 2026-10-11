---
phase: quick-260923-cqj
plan: 01
subsystem: relay
status: complete
tags: [relay, dma, symbol-master, gateway, 신규상장]
requires: []
provides:
  - "게이트웨이 종목마스터(27/57) 보조 이름 원천 — Supabase stocks 미스만 채움"
  - "SessionManager.firstReady(avoidUserId)"
  - "SubscriptionHub.refreshNames()"
  - "stocksCodeOf() — dma_orders.stock_code FK 가드"
affects: [relay/src/hub, relay/src/store, relay/src/dma, relay/src/ws/order-handler.ts, relay/src/index.ts]
tech-stack:
  added: []
  patterns:
    - "보조 원천 폴백 — 행 단위 우선순위(SymbolMap.lookup → fallback.lookup)"
    - "분할 프레임 조립 — seq/total/is_last/누적 수 검증 뒤 원자 교체"
    - "relay 전체 단일 in-flight 요청 + master-day 게이팅 + backoff + 일일 상한"
key-files:
  created:
    - relay/src/store/gateway-symbols.ts
    - relay/tests/gateway-symbols.test.ts
    - relay/tests/name-refresh.test.ts
  modified:
    - relay/src/dma/msg-type.ts
    - relay/src/dma/envelope.ts
    - relay/src/store/symbols.ts
    - relay/src/hub/subscription-hub.ts
    - relay/src/dma/session-manager.ts
    - relay/src/ws/order-handler.ts
    - relay/src/index.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/session-manager.test.ts
    - relay/tests/ws-order.test.ts
    - relay/src/dma/__tests__/codec.test.ts
    - relay/src/dma/__tests__/envelope.test.ts
decisions:
  - "D-01 Supabase stocks 행 단위 우선, 게이트웨이는 미스만(필드 합성 없음)"
  - "D-02 27 은 relay 전체 단일 in-flight — 트리거는 Ready · 07:30 경계 · 5분 재시도"
  - "D-03 master-day 경계 07:30 KST, 성공 키는 완료 시각"
  - "D-04 조립 네 조건 + 30초 타임아웃 + 5분 backoff + 하루 5회 상한, 빈 마스터는 무시"
  - "D-05 market_type 0→K, 1→Q, 그 외 null"
  - "D-06 게이트웨이 원천 코드는 dma_orders.stock_code 에 쓰지 않음(null)"
  - "D-07 57 을 INBOUND 23종으로, OUT_OF_SCOPE 는 68·70·74·75"
  - "D-08 교체 후 이름 없던 캐시 행만 기존 프레임 모양으로 재방송, 합성 lc 금지"
metrics:
  duration: "약 45분"
  completed: 2026-09-23
actuals:
  tokens: 27000
  tasks: 3
  commits: 3
plan_head_before: cf3a665
---

# Quick 260923-cqj: relay 게이트웨이 종목마스터(27/57) 보조 원천 요약

relay 가 게이트웨이 종목마스터(GetSymbolMasterReq 27 → SymbolMasterResp 57)를 받아 조립합니다. Supabase `stocks` 에 ISIN 이 없는 당일 신규상장 종목(예: KR70010S0000 → 0010S0)의 이름·단축코드·시장을 이 원천으로 채웁니다. 교체가 끝나면 이름 없이 먼저 나간 잔고·상따·VI 캐시 행을 해당 사용자에게 다시 내려보냅니다.

## 커밋

| Task | 커밋 | 내용 |
|------|------|------|
| 1 (tracer) | `b89179f` | 57 화이트리스트 이동과 hub 명시 case, 27 조립기·57 파서, GatewaySymbolMaster 조립·원자 교체, SymbolMap 폴백, stocksCodeOf FK 가드 |
| 2 | `eb1491e` | 07:30 경계 타이머, 30초 타임아웃, 5분 backoff 재시도(다른 Ready 세션 우선), 하루 5회 상한, SessionManager.firstReady, msUntilKst 추출 |
| 3 | `51be413` | hub.refreshNames 재방송과 index 결선, 신규상장 수동·자동주문 감사 행 stock_code null 증명 |

세 커밋 모두 master 에 직접 올렸고 push 는 하지 않았습니다. 시작 HEAD 는 `cf3a665` 입니다.

## 테스트

- relay 전체: **564 통과 / 0 실패** (22 파일). 기준 534건 + 신규 30건.
  - gateway-symbols.test.ts 22건: ①~⑦ 과 ⑧~⑫, 보강 5건(①-b 주입 없는 57, Supabase isin-null 행, 행 단위 우선, not-ready/send-false, masterDayKey 경계)
  - name-refresh.test.ts 3건 (⑭ ⑮ ⑯)
  - ws-order.test.ts +2건 (⑰ 수동 `①-b` · 자동 `①-c`)
  - session-manager.test.ts +1건 (⑬)
  - codec.test.ts +1건, envelope.test.ts +1건 (화이트리스트 23종 · OUT_OF_SCOPE 4종 · 맨 57 slot-null)
- `typecheck` exit 0, `typecheck:tests` exit 0.
- 변이 검증 2회로 테스트가 실제로 잡는지 확인했습니다. SymbolMap 폴백을 빼면 추적탄 ①과 isin-null 테스트가 실패합니다. order-handler 를 `info.code` 로 되돌리면 ⑰ 두 건이 실패합니다. 두 변이 모두 원복했습니다.
- 계약 불변: `git diff --stat cf3a665 -- webapp packages/shared pnpm-lock.yaml` 결과가 비어 있습니다.
- Grep 게이트: `case MSG.SymbolMasterResp` 1, index.ts 의 `fallback: gatewaySymbols`·`firstReady`·`refreshNames`·`gatewaySymbols.close()` 각 1, `stocksCodeOf(info)` 2.

## 추가 컨텍스트 반영 (Supabase 에 code 는 있지만 isin 이 null 인 행)

운영 `stocks` 에는 `0010S0` 「와이즈플래닛컴퍼니」 행이 `isin: null`, placeholder `market: "KOSPI"` 로 들어 있습니다. intraday-sync 의 bootstrapStocks 가 넣은 행입니다.
- SymbolMap 은 이 행을 ISIN 으로 색인하지 않습니다(`!row.isin` 은 skip). 그래서 KR70010S0000 은 게이트웨이 원소로 풀리고 `source: "gateway"`, market 은 게이트웨이 값("1"→Q)을 씁니다. placeholder KOSPI 와 섞지 않습니다. 이 동작은 gateway-symbols.test ⑤ 「Supabase 에 code 로는 있지만 isin 이 null 인 행」에서 증명합니다.
- FK 가드는 계획 규칙 그대로입니다. 게이트웨이 원천이면 `stocksCodeOf` 가 null 을 돌려주고, 규칙을 넓히지 않았습니다. 같은 테스트에서 단언합니다.

## 계획 대비 변경

### 자동 수정

**1. [Rule 3 - Blocking] 테스트 타입 오류 두 건**
- Task 1 과 3 에서 `ReturnType<typeof vi.spyOn>` 로 선언한 spy 변수가 `typecheck:tests` 에서 TS7006(implicit any)을 냈습니다.
- 구조 타입 `{ mock: { calls: unknown[][] } }` 로 바꿨습니다.
- 대상 파일: relay/tests/gateway-symbols.test.ts, relay/tests/name-refresh.test.ts. 각 태스크 커밋에 포함됐습니다.

**2. [테스트 하네스] 주입 시계 전진**
- ⑪ 에서 `advance(타임아웃+backoff)` 를 한 번에 밀면 타이머 콜백이 끝 시각의 now 를 읽어 backoff 판정이 어긋났습니다.
- 타이머를 하나씩 밀도록 고쳤습니다. 제품 코드 결함이 아니라 테스트 시계 문제이고, 단언은 약화하지 않았습니다.

### 그 밖의 차이
- **TDD 순서:** 구현과 테스트를 같은 단계에서 작성했습니다. RED 를 먼저 관찰하지 않았고, 대신 위의 변이 검증 2회로 테스트가 실제로 잡는지 확인했습니다.
- **⑰ 테스트 이름:** ws-order.test.ts 는 이미 ①~㊺ 번호를 쓰고 있어서 ⑰ 두 건을 `①-b`(수동)·`①-c`(자동)로 붙였습니다.
- **index.ts 주석:** grep 게이트(`firstReady` 1줄)를 맞추려고 결선 주석에서 `firstReady` 라는 이름을 빼고 「SessionManager 가 고른」으로 적었습니다.
- **`send-false` 도 실패로 처리:** Task 2 부터는 `#fail` 을 거쳐 backoff·재시도 대상이 됩니다(T-cqj-07 사유 로그 포함).

## 열린 질문 / 관찰 (비차단)

- **OQ-A (D-06 보수성):** 오늘처럼 bootstrap 행이 `stocks.code=0010S0` 을 이미 가진 경우에는 FK 가 통과합니다. 그래도 계획 규칙에 따라 stock_code 는 null 로 기록됩니다. 감사 행에는 isin 이 남으므로 정보 손실은 크지 않습니다. 넓히려면 「code 가 stocks 에 존재하는가」를 조회해야 하는데, 이는 새 DB 왕복이나 인덱스가 필요해 이번 범위 밖입니다.
- **OQ-B (로그 소음):** 조립 중간에 실패하면(seq-gap 등) 같은 응답의 남은 프레임(최대 약 9건)이 각각 `[SYM-GW] 요청 없는 57 — 무시` warn 을 남깁니다. 드문 경로이고 원인 추적에는 오히려 도움이 되므로 그대로 두었습니다.
- 계획의 OQ-1/2/3 은 계획 판단 그대로 수용했습니다. market 매핑 근거와 OQ-1 은 `fromWireMasterMarketType` 주석에 인용했습니다.

## 배포 노트 (이 quick 은 배포하지 않음)

- **relay 전용 변경입니다.** 배포는 **20:00 KST 이후에만** 합니다. relay 는 radar-gw VM 에서 돌고, 장 시간(08:00~20:00)에는 재기동하지 않습니다.
- 절차(20:00 KST 이후, repo root):
  1. `git log --oneline -3` 으로 `51be413`·`eb1491e`·`b89179f` 가 HEAD 에 있는지 확인합니다.
  2. `scripts/deploy-relay.sh` 를 실행합니다. **DMA_HOST 는 주입하지 않습니다.** 스크립트가 실행 중인 컨테이너 값을 읽어 보존합니다(`명시 주입 > 실행 중 컨테이너 값 > 127.0.0.1`).
  3. 스크립트 최종 요약에 찍힌 DMA_HOST 가 배포 전 값과 같은지 확인합니다.
- **배포 후 확인:**
  - 첫 사용자 Ready 에서 `[SYM-GW] 게이트웨이 종목마스터 요청`(reason ready) 로그가 나오고, 이어서 `[SYM-GW] 게이트웨이 종목마스터 적재`(count 약 4,500, skipped 0 근처, frames 약 10)가 나와야 합니다.
  - `/healthz` 가 200 이어야 합니다.
  - 다음 날 07:30 KST 에 경계 요청 로그(reason day-boundary)가 찍혀야 합니다. 그 시각에 Ready 세션이 없으면 「경계 도달 — Ready 세션 없음」이 찍히고, 첫 Ready 에서 요청합니다.
  - 상장 첫날 종목이 있는 날에는 `/trading` 카드 머리와 사이드바에 이름이 뜨는지 UAT 로 봅니다. `[HUB] 보조 종목마스터 반영 — 이름 없던 캐시 행 재방송` 로그가 있으면 재방송이 동작한 것입니다.
  - 실패 신호: `[SYM-GW] … 요청 실패 — 기존 맵 유지`(reason 필드), 또는 `오늘 재시도 상한 도달`(error).
- **push 순서:** 「relay 먼저 → 검증 → push」. webapp·packages/shared·lockfile 변경이 없으므로 이 커밋들의 push 는 Vercel 빌드를 유발하지 않습니다.
- **롤백:** 직전 relay 이미지로 재배포하면 됩니다. DB 변경은 없습니다.

## Known Stubs

없음.

## Threat Flags

없음. 새 표면(57 유입, 27 송신, dma_orders stock_code)은 모두 계획 `<threat_model>` T-cqj-01~08 에 있고 mitigate 가 구현돼 있습니다.

## Self-Check: PASSED

- 생성 파일 3건 존재: relay/src/store/gateway-symbols.ts, relay/tests/gateway-symbols.test.ts, relay/tests/name-refresh.test.ts
- 커밋 3건 존재: b89179f, eb1491e, 51be413 (`git rev-list --count cf3a665..HEAD` = 3)
