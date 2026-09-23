# gh-trade 작업 요청 — 가격만 받는 가벼운 시세 구독 (SubscribeQuoteReq 확장)

> gh-radar 세션에서 작성 (2026-09-23). gh-trade 세션에 그대로 붙여 넣는 용도.

## 배경

gh-radar `/trading` 작업대에는 「돌파감지」 줄이 있다. 임계 20% 를 넘은 종목을 칩으로 보여주고, 칩에는 **현재가·등락률 한 쌍만** 표시한다. 그런데 지금 계약에는 가격만 받는 방법이 없다. 그래서 relay 는 돌파 종목마다(최대 40개) 일반 호가창과 똑같이 `SubscribeQuoteReq(29)` 를 보내고, 게이트웨이는 그 종목들에 대해 다음을 모두 보낸다.

- `QuoteUpdate(59)`: 10호가 매도·매수 가격/잔량 배열 4개와 전체 필드, 100ms 코얼레싱.
- `TradeTapePush(71)`: 체결 테이프. 구독과 함께 오는지는 확인이 필요하다 — 아래 「확인해 줄 것」 참조.

gh-radar 에서 측정한 결과(카드 3장 + 돌파 40종목, 로컬 relay + 가짜 게이트웨이, 종목당 q 10Hz + tape 5Hz):

- 브라우저로 가는 시세 프레임이 **초당 약 43개에서 585~615개**로, 약 10배가 된다.
- 브라우저 메인스레드 점유율은 44%, 프레임 도착이 분산되면 **99%(포화)** 까지 올라간다.

gh-radar 쪽에서도 1단계(클라이언트 배치 적용·칩 갱신 제한)는 따로 진행한다. 다만 **필요 없는 10호가·체결을 애초에 받지 않게 하는 것**이 근본 해결이다. 그 첫 단추가 게이트웨이 계약이다.

## 요청

`SubscribeQuoteReq` 에 **구독 수준(level)** 을 추가해, 가격만 받는 가벼운 구독을 지원해 달라.

### 제안 계약 (확정은 gh-trade 판단)

```fbs
table SubscribeQuoteReq {
    isin: string;
    exchange: string;
    subscribe: bool;
    level: byte = 0;   // (append) 0 = FULL(현행 그대로), 1 = PRICE(가격만)
}
```

- **append-only.** 기존 필드 번호를 바꾸지 않고, 기본값 0 = 현행 동작이다. 구 클라이언트(WinForms·구 relay)는 필드가 없으므로 FULL 로 해석되어 동작이 바뀌지 않는다.
- **PRICE 수준에서 보내는 것**
  - `QuoteUpdate(59)` 에는 아래 필드만 채운다. 호가 배열 4개(`ask_prices`, `ask_qtys`, `bid_prices`, `bid_qtys`)와 `total_ask_qty`/`total_bid_qty` 는 비운다.
    - 가격: `last_price`, `change`, `change_sign`, `change_rate`
    - 시·고·저·누적: `open_price`, `high_price`, `low_price`, `cum_volume`, `cum_value`
    - 가격 기준: `upper_limit`, `lower_limit`, `base_price`
    - 시각: `exchange_time`, `server_time`, `is_snapshot`
    - 비울 수 있는 필드 목록은 gh-trade 가 정해도 된다. 칩에 실제로 필요한 것은 `last_price` · `change_rate` · `change_sign` 이다.
  - `TradeTapePush(71)` 은 **보내지 않는다.**
  - 갱신 주기: **체결가(`last_price`)나 등락률이 바뀔 때만** 보낸다(호가 잔량만 바뀐 틱은 생략). 여유가 되면 종목당 최대 1~2Hz 로 추가 제한해도 된다. 칩 표시 용도라 1초 지연은 문제없다.
  - 구독 직후 스냅샷(`is_snapshot=true`) 1건은 지금처럼 보낸다(가격 필드만).

### 반드시 정의해 줄 동작 (relay 가 의존함)

1. **같은 연결·같은 (isin, exchange) 에서 수준이 바뀔 때.** relay 는 한 업스트림 연결에서 종목 하나를 여러 브라우저가 공유한다. 호가창 카드(FULL)와 돌파 칩(PRICE)이 같은 종목을 동시에 볼 수 있다.
   - 권장안: 같은 키로 `subscribe=true` 를 다른 level 로 다시 보내면 **덮어쓰기(업그레이드/다운그레이드)**. relay 가 "FULL 소비자가 하나라도 있으면 FULL" 로 합쳐서 보낸다.
   - 다른 안(수준별 독립 구독 + refcount 등)이 낫다면 그 안으로 정하고 해제 규칙까지 명시해 달라.
2. **PRICE → FULL 업그레이드 직후.** 10호가 스냅샷(`is_snapshot=true`, 전량)을 한 번 보내 줘야 호가창이 빈 칸 없이 시작한다.
3. **해제.** `subscribe=false` 는 level 과 무관하게 그 키의 구독을 해제한다(현행 유지). level 별 해제가 필요한 설계라면 명시해 달라.
4. **GetQuoteReq(28)/58 스냅샷, GetTradeTapeReq(32)** 는 변경 없음.

## 확인해 줄 것 (현재 동작)

- 지금 `SubscribeQuoteReq(subscribe=true)` 한 번에 59 와 71 이 둘 다 푸시되는가, 아니면 71 은 별도 조건(테이프 조회 이력 등)이 있는가. `Gateway::ProcessSubscribeQuote` 는 `publish::PubCommand::Kind::Subscribe` 를 `MarketPublisher` 에 넘긴다.
- 59 코얼레싱(100ms)이 종목 단위인지 연결 단위인지. relay 의 분산 도착 측정 해석에 필요하다.

## 제약 · 규약

- 스키마는 **append-only**, 필드 번호 불변. `scripts/expected-vtable.txt` 등 기존 vtable 가드를 갱신한다.
- gh-radar 쪽 동기화는 gh-trade 소유의 `sync-relay-schema.sh` 로 한다(`RELAY=` 로 gh-radar relay 경로 지정, flatc 25.12.19 고정). 수기 사본 3곳(msg-type · envelope · hub)은 gh-radar 가 따로 맞춘다. 스키마가 확정되면 **최종 fbs diff 와 필드 번호**를 남겨 달라.
- 배포는 장 시간(08:00~20:00 KST) 밖에서. 실서버 배포 커밋은 gh-trade `STATE.md` 에 기록한다.
- 구 relay(level 필드 없음)와 WinForms 는 무변경으로 계속 동작해야 한다(level 기본값 0 = FULL).

## 끝나면 gh-radar 가 할 일 (참고)

1. 스키마 동기화 후, relay 에 브라우저용 "가격만" 구독 종류를 추가한다. 같은 종목에 FULL 소비자가 하나라도 있으면 업스트림은 FULL, 없으면 PRICE 로 보낸다.
2. webapp 의 `use-breakout-quotes` 를 가격 구독으로 바꾼다.
3. 게이트웨이 → relay 와 relay → 브라우저 두 구간 모두에서 돌파 종목의 10호가·체결 트래픽이 없어지는지 확인한다.

## 산출물 요청

- 확정 계약(fbs diff, level 의미, 업/다운그레이드·해제 규칙)
- PRICE 수준의 실제 송신 조건(가격 변화 시만? 최대 주기?)
- 위 「확인해 줄 것」 2건의 답
- 테스트 결과와 배포 커밋
