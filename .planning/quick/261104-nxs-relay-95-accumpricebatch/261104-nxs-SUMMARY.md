---
phase: quick-261104-nxs
plan: 01
status: complete
subsystem: relay · webapp(작업대 매집 패널)
tags: [relay, flatbuffers, msgtype-95, accum, filter, workbench]
requires:
  - gh-trade fbs 4695bd48 (MsgType 95 AccumPriceBatch · Envelope 슬롯 114)
provides:
  - relay 95 디코드 · 전역 isin 캐시 · accum.prices 팬아웃
  - shared RelayAccumPriceItem · RelayAccumPricesMsg 계약
  - webapp useAccumPrices(≤5Hz) · 매집 패널 95 원천 + 구독 폴백
  - webapp 매집 필터 줄(목업 A) · accum-list ⑦ 필터 순수 함수
affects:
  - relay/src/hub/subscription-hub.ts (PC-12 case 표)
  - webapp/src/lib/use-relay-socket.ts (시장 배치 대상 4종)
tech-stack:
  added: []
  patterns:
    - "공개 시세 파생값을 인증 소켓 전부로 방송(#broadcastNxtSnap 동형) — 키 구독 경로 market 과 분리"
    - "useBreakoutQuotes ⑤ 와 같은 절대 마감 스로틀 + 키 집합 서명 memo(covered 신원 안정)"
    - "필터 칸 draft 상태 + 이전 prop 기억 패턴(effect 없이 부모 값 동기화)"
key-files:
  created:
    - relay/src/generated/stock-dma/accum-price-batch.ts
    - relay/src/generated/stock-dma/accum-price-item.ts
    - webapp/src/lib/use-accum-prices.ts
  modified:
    - relay/src/generated/** (sync 스크립트 산출 — StockDMA.fbs · stock-dma.ts · envelope.ts · msg-type.ts · accum-chart-resp.ts)
    - relay/src/dma/msg-type.ts
    - relay/src/dma/envelope.ts
    - relay/src/hub/subscription-hub.ts
    - relay/src/ws/fanout.ts
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/lib/accum-list.ts
    - webapp/src/components/trading/workbench/accum-strip.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx (계획 밖 — 기본 필터 대응 픽스처)
decisions:
  - "95 원소는 원소 단위로 버린다(null · ISIN 위반 · 비유한수) — 병합 전용 스트림이라 프레임째 버리면 멀쩡한 종목이 묵는다"
  - "quote 연결 ready(resubscribeAll)마다 95 캐시를 비우고 인증 소켓 전부에 snap:true 빈 배열을 내린다"
  - "웹 소켓 인증 묶음 맨 끝에 accum.prices snap:true 를 비어 있어도 1프레임 보낸다(rate.cross.snap 규율)"
  - "NXT 행은 95(KRX 체결가)를 쓰지 않고 구독 폴백 — 다른 거래소 값으로 바꿔 보이지 않는다"
  - "accum.prices 는 기존 시장 배치에 태우고 패널은 useAccumPrices ≤5Hz 로만 읽는다"
  - "필터는 구독 후보를 바꾸지 않는다 — 걸린 행도 시세를 받아야 값 변화로 통과할 수 있다"
metrics:
  duration: "약 30분"
  completed: 2026-11-04
estimate:
  tokens: 165000
  tasks: 3
actuals:
  tokens: 26200
  tasks: 3
  commits: 3
plan_head_before: 651f0614eec6258804b627a17b0b619095456205
plan_head_after: 7737c8cb9b51c1f256170f074fcd192bfa934140
commits: 3
---

# Quick 261104-nxs Plan 01: 매집 현재가 원천 95 + 등락률·당일 순매수 필터 줄 Summary

relay 가 quote 관찰자 연결의 gh-trade 95 `AccumPriceBatch` 를 디코드해 전역 isin 캐시에 병합하고 인증 소켓 전부에 `accum.prices` 로 흘리며, 작업대 매집 패널은 그 값을 ≤5Hz 로 현재가·등락률 원천으로 쓰고(95 없는 활성 행만 종목별 구독 폴백) 목업 A 의 「등락률 · 당일 순매수 최소~최대 · 전부 보기 · 필터 밖 N」 필터 줄을 갖췄다.

## 수행한 작업

| Task | 이름 | 커밋 | 주요 파일 |
| ---- | ---- | ---- | --------- |
| 1 (tracer) | 스키마 동기화 + relay 95 디코드 · 전역 캐시 · accum.prices 팬아웃 + shared 계약 | 8f131033 | relay/src/generated/**, msg-type.ts, envelope.ts, subscription-hub.ts, fanout.ts, packages/shared/src/relay.ts |
| 2 | 웹 — 매집 패널 현재가·등락률 원천 95 + 95 없는 종목만 구독 폴백 | 65150eed | use-relay-socket.ts, relay-provider.tsx, use-accum-prices.ts, accum-strip.tsx |
| 3 | 웹 — 매집 필터 줄(목업 A) · 판정 순수 함수 · 필터 밖 N · 전부 보기 | 7737c8cb | accum-list.ts, accum-strip.tsx, 테스트 |

### Task 1
- `cd gh-trade && RELAY=… server/scripts/sync-relay-schema.sh` 로 생성물 동기화(SYNC MARKER e96aef6e → 4695bd48 · 손편집 0 · 생성물 밖 변경 없음). 새 `accum-price-item.ts` · `accum-price-batch.ts`, 90 buckets append 도 함께 들어옴(relay 는 90 을 디코드하지 않아 무해).
- `MSG.AccumPriceBatch = 95`, `INBOUND_MSG_TYPES` 32종, 「유입 집합」 머리 주석 95 단락.
- `parseAccumPriceBatch` + `MAX_ACCUM_PRICE_ITEM_COUNT = 512` + `AccumPriceBatchFrame`.
- hub: `#onFeedFrame` case → 전역 캐시 병합 + `"accumPrices"` snap:false 방출(원소 0 이면 방출 없음) · ready 뒤 첫 수신 info 「[HUB] 매집 현재가 95 수신 — 웹 원천 켜짐」. `#onFrame`(사용자 세션) case 는 debug 무시(`unhandledFrameCount` 불변). `resubscribeAll` 에서 캐시 비움 + snap:true 빈 배열. `getAccumPrices()` · `closeAll` 정리.
- fanout: `#broadcastAccumPrices`(`#users` 전부) · 인증 묶음 맨 끝 snap:true 1프레임(비어 있어도).
- 테스트: codec(32종 · ≤95 · 95 대조), envelope(4건), hub(5건 a~e), fanout AP1(통합 — 인증 직후 빈 snap · 95 팬아웃 · 미인증 0 · 늦은 인증 병합 캐시).

### Task 2
- `RelayConnectionState.accumPrices`(시장 배치 · snap 교체 / 병합 · 재접속 유지 · reset 만 비움). `applyMarketFrames` 가 `relayQuoteKey` 앞에서 갈라 copy-on-write.
- `useAccumPrices(isins)` → `{ prices, covered }`(≤5Hz 절대 마감 스로틀 · `BREAKOUT_PRICE_THROTTLE_MS` 재사용 · covered 서명 memo), `accumLivePriceOf`(p > 0 · 유한수만).
- accum-strip: 활성 KRX 행 95 → 구독 시세 → 행 값, 구독 후보 = 95 에 없는 활성 행만, 청산 행 행 값 고정. 머리 주석 ① 재작성.

### Task 3
- accum-list ⑦: `ACCUM_FILTER_KEY` · `AccumFilter` · `DEFAULT_ACCUM_FILTER` · `parseAccumFilterCell` · `formatAccumFilterCell` · `roundRate2` · `passesAccumFilter` · `readAccumFilter` · `writeAccumFilter`.
- accum-strip ⑪: 필터 줄(묶음 4 · flex-wrap) · 칸 draft + Enter/blur 적용 · 라벨 「필터 밖 N」 알약 · 빈 문구 두 갈래 · 전부 보기 흐림(`[&>td]:opacity-45` · `data-filtered-out`) · 필터 4칸 기억(마운트 뒤 읽음) · 전부 보기 비기억.

## 검증

- 정본 빌드 게이트: `pnpm --filter @gh-radar/shared build && relay typecheck && relay typecheck:tests && webapp typecheck` 통과.
- relay vitest(`--maxWorkers=2`): 계획 지정 11파일 732건 통과 + 인접 8파일(account-state · hub-multi-session · journal-codec · strategy-hub · quote-switch 등) 207건 통과.
- webapp vitest: relay-socket · accum-strip · use-breakout-quotes 228건, accum-list · accum-strip · use-accum-signals 100건, trading-workbench 155건 통과.
- eslint 대상 파일 종료 0. `use-relay-socket.ts:2204` 의 `react-hooks/exhaustive-deps` 경고 1건은 HEAD 부터 있던 것(이번 diff 밖).
- tracer 게이트: Task 1 `<verify>` 전부(SYNCED · case 2개 · shared · relay) 재실행 통과 뒤 확장.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] trading-workbench 테스트가 기본 필터에 걸려 실패**
- **Found during:** Task 3 인접 회귀 확인
- **Issue:** 「매집 칩 클릭 → 카드」 테스트의 행(5.12% · 당일 없음)이 새 기본 필터(15% · 1억)에 걸려 칩이 그려지지 않음.
- **Fix:** 그 테스트에서만 `gh-radar:accum-filter` 를 네 칸 null 로 저장한 뒤 렌더(칩 → 카드 경로 그대로 잠금 · 필터는 accum-strip 테스트가 잠금). 계획 `<files>` 밖 파일이라 기록한다.
- **Files modified:** webapp/src/components/trading/__tests__/trading-workbench.test.tsx
- **Commit:** 7737c8cb

**2. [Rule 2 - 테스트 보강] hub (d) 사용자 세션 95 가 실제로 명시 case 에 닿았는지 debug 로그로 단언** — 프레임이 `#onFrame` 에 닿지 않아도 통과하는 공허한 테스트가 되지 않게. (8f131033)

그 밖에는 계획대로 실행.

## 배포 순서 메모 (이 계획은 배포 · push 하지 않았다)

1. relay 먼저 배포 → 운영 로그에 「[HUB] 매집 현재가 95 수신 — 웹 원천 켜짐」(`{ count, snapshot }`) 확인. KB120 · KYOBO119 는 이미 95 를 내는 빌드로 재기동됐다(gh-trade 세션 확인 17:19). 재기동 직후에는 서버 시세 캐시가 비어 첫 스냅샷이 0종목일 수 있다 — 그때는 원소 0 프레임이라 방출 없이 웹은 구독 폴백으로 동작한다(정상).
2. 그 뒤 webapp push(= 프로덕션 배포). 구 relay 인 채로 push 해도 웹은 `accumPrices` 가 늘 비어 전부 구독 폴백이라 깨지지 않는다.

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: relay/src/generated/stock-dma/accum-price-batch.ts
- FOUND: relay/src/generated/stock-dma/accum-price-item.ts
- FOUND: webapp/src/lib/use-accum-prices.ts
- FOUND: 8f131033 · 65150eed · 7737c8cb (HEAD 조상)
