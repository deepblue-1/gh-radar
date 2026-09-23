# gh-radar 작업 요청 — SubscribeQuoteReq level(PRICE) 계약 확정 · relay 적용

> gh-trade 세션에서 작성 (2026-09-23). gh-radar 세션에 그대로 붙여 넣는 용도.
> gh-trade 쪽 구현·검증은 끝났고(quick-260923-exo), 아래는 확정 계약과 gh-radar 가 할 일이다.
> (gh-radar 의 요청서 `gh-trade-price-only-quote-subscription-prompt.md` 에 대한 회신.)

## 확정 계약

### fbs diff (gh-trade `server/src/protocol/StockDMA.fbs`, 커밋 9ee2f150)

```fbs
table SubscribeQuoteReq {
    isin: string;
    exchange: string;
    subscribe: bool;          // true=구독, false=해제
    level: ubyte = 0;         // 0=FULL(종전) / 1=PRICE(59 만·가격 섹션 갱신 때만·200ms) — 말미 append
}
```

- 필드 번호: `level` 은 vtable 슬롯 10 (기존 isin 4 · exchange 6 · subscribe 8 불변). append-only, 새 MsgType 없음.
- 기본값 0 이라 level 을 싣지 않는 옛 relay·WinForms 는 종전(FULL)과 프레임이 한 바이트도 다르지 않다.
- 1 만 PRICE 다. 그 밖 값(2 이상)은 서버가 FULL 로 접는다 — 모르는 값을 더 가벼운 경로로 열화시키지 않는다.

### level 의미

| level | 받는 것 | 조건 |
|---|---|---|
| 0 FULL | 59 QuoteUpdate + 71 TradeTapePush + 75 MemberStatsPush | 종전 그대로 — 어느 섹션(B6 호가·A3 체결·R8 VI·A6 종가)이든 갱신된 100ms 틱마다 59 |
| 1 PRICE | **59 만** | 가격 섹션(A3 체결·R8 VI·A6 종가)이 갱신된 때만. 호가(B6)만 바뀐 틱은 0건. 키(종목+거래소)당 **최소 200ms** 간격 |

- **PRICE 의 59 본문은 FULL 과 같은 빌더다.** 필드를 비우지 않았다 — `ask_prices`/`bid_prices` 10원소 배열도 그대로 실린다. 요청서의 "배열 비우기" 는 채택하지 않았다. 측정에서 문제는 프레임 **개수**(종목당 10Hz + 5Hz)였지 크기가 아니고, 클라이언트 호가창이 배열 10칸을 null 검사 없이 순회하는 계약이 있어 빌더를 두 벌로 나눌 이유가 없었다. 칩은 `last_price`·`change_rate`·`change_sign` 만 읽으면 된다.
- **200ms 억제 중에 온 가격 갱신은 유실되지 않는다** — pending 으로 남았다가 다음 허용 틱에 그 시점 최신 상태 1프레임으로 나간다(지연만 있다). 상한은 종목당 5Hz.
- 75 거래원(B9)도 FULL 전용이다 — 요청서에 없던 항목인데 지금까지 시세 구독에 편승해 왔다. PRICE 에서는 오지 않는다.

### 업/다운그레이드 · 해제 규칙 (relay 가 의존하는 것)

1. **같은 연결·같은 (isin, exchange) 재구독은 level 덮어쓰기.** 서버 refcount 없음. `subscribe=true, level=0` 을 다시 보내면 FULL 로 승격, `level=1` 을 다시 보내면 PRICE 로 강등. 연결당 구독 상한 200 은 두 번 세지 않는다. relay 가 "FULL 소비자가 하나라도 있으면 FULL" 로 합쳐서 보내면 된다.
2. **PRICE→FULL 승격에 서버 스냅샷은 없다.** 애초에 구독 직후 스냅샷도 없었다(요청서의 "지금처럼 보낸다" 는 잘못된 전제 — 지금도 구독은 집합에 넣기만 하고, 스냅샷은 28 GetQuoteReq → 58 이 담당한다). **승격 때 relay 가 0→1 과 같은 순서(28 → 29 FULL → 32)를 다시 보내라.** 강등(FULL→PRICE)은 29(level=1) 한 건이면 된다.
3. **해제는 `subscribe=false` 하나.** level 무관하게 그 키를 해제한다(현행 유지). level 별 해제 없음.
4. 28/58 스냅샷, 32/69 테이프 스냅샷은 변경 없음.

## 「확인해 줄 것」 답

- **29 한 번에 59·71·75 셋 다 푸시된다(FULL).** 71 에 별도 조건은 없다 — 구독 키에 미전송 테이프가 있으면 매 틱 그대로 보낸다. 32 는 69 스냅샷 전용이고 71 과 무관하다. 75 거래원도 같은 구독에 편승한다.
- **59 코얼레싱은 종목(키) 단위, 전역 100ms 틱이다.** 연결 단위가 아니다. dirty 집합 하나를 100ms 마다 소비해 종목당 프레임 1개를 만들고, 그 프레임을 구독 연결 전부에 같은 바이트로 팬아웃한다. relay 가 본 "분산 도착" 은 종목별 dirty 시점 차이지 연결별 타이머가 아니다.

### 부수 발견 (이번 변경과 별개, relay 가 알아 둘 것)

- **테이프 미전송 카운터는 구독 전에도 는다** (모든 종목의 unsent 가 최대 100까지 오른다). 그래서 신규 구독·PRICE→FULL 승격 직후 **첫 71 에 구독 전 최대 100건이 실려** 69 스냅샷과 겹칠 수 있다. relay 가 69 와 71 을 합칠 때 시각·순번으로 중복을 걸러라. 서버 쪽 수정은 별도 과제.

## gh-radar 가 할 일

1. **생성 코드 커밋.** gh-trade 의 `sync-relay-schema.sh` 가 이미 gh-radar 작업 트리에 다음 2파일을 써 두었다(미커밋). **경로 지정으로만** 커밋하라 — gh-radar 트리에 다른 세션의 미커밋 작업(webapp 4파일·.planning/quick 3개·tasks 1파일)이 있다.
   - `relay/src/generated/StockDMA.fbs`
   - `relay/src/generated/stock-dma/subscribe-quote-req.ts`
2. **컴파일 깨짐 주의.** 생성된 `SubscribeQuoteReq.createSubscribeQuoteReq(builder, isinOffset, exchangeOffset, subscribe, level)` 은 **인자가 하나 늘었다.** `relay/src/dma/` 의 `buildSubscribeQuoteReq` 가 4-인자로 부르고 있으면 TS 컴파일이 실패한다 — level 을 넘기도록 고쳐라(0 = FULL, 1 = PRICE). 새 accessor 는 `level(): number` (기본 0).
3. **수기 사본 3곳**(msg-type · envelope · hub)은 MsgType 변경이 없으니 손댈 것이 없을 것이다 — 확인만.
4. **relay 에 브라우저용 "가격만" 구독 종류 추가.** `subscription-hub.ts` 의 `${userId}|${isin}|${exchange}` refcount 를 FULL/PRICE 두 카운터로 나누고, 업스트림 level = (FULL 소비자 ≥ 1 ? 0 : 1). 전이 규칙:
   - 0→1 (PRICE 만): 28 → 29(level=1). 32 는 필요 없다(71 이 안 온다).
   - 0→1 (FULL): 종전대로 28 → 29(level=0) → 32.
   - PRICE→FULL 승격: 28 → 29(level=0) → 32 를 다시 보낸다.
   - FULL→PRICE 강등: 29(level=1) 한 건.
   - 마지막 소비자 이탈: 29(subscribe=false).
   - `resubscribeAll` 은 실효 level 로 되건다.
5. **webapp `use-breakout-quotes` 를 가격 구독으로 전환.** 칩은 `last_price`·`change_rate`·`change_sign` 만 읽는다. PRICE 59 에도 호가 배열이 실려 오지만 무시하면 된다.
6. **확인.** 게이트웨이→relay, relay→브라우저 두 구간 모두에서 돌파 종목의 71·75 가 사라지고 59 가 체결 때만(종목당 ≤5Hz) 오는지 본다. 호가창 카드가 열린 종목은 FULL 그대로여야 한다.

## gh-trade 쪽 상태

- 커밋: 서버 9ee2f150 · 클라 39ac9e95 · 병합 96f6c39e · 문서 ffd31ef5 (origin/master push 완료).
- 테스트: cloud-verify 신규 doctest 7건(94 assertions) 통과, 전체 ctest 17/17. WinForms 클라 VM Debug 빌드 PASS.
- 배포: KB 120 에 ffd31ef5 전송 완료(deploy.sh 게이트 ctest 17/17). **재기동 전이라 가동본은 level 을 모르는 구버전(bd1c541d)이고, level=1 을 보내도 FULL 로 온다.** 구버전은 모르는 필드를 무시하므로 relay 를 먼저 배포해도 깨지지 않는다.
- WinForms 클라도 같은 계약으로 바뀌었다 — 돌파 감시 목록·보유종목 잔고는 PRICE, 호가창이 열린 종목은 FULL 로 합성해 보낸다.
