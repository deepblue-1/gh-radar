# gh-trade 요청 — VI 추적 항목(72/73)에 「VI 해제됨」 플래그 싣기

## 배경 (gh-radar)

gh-radar 트레이딩 작업대의 「VI 발동 목록」(칩·표)은 게이트웨이 72 `GetVIOrderListResp` / 73 `VIOrderListPush` 의
`VIOrderItem` 을 그대로 그린다. 사용자 요청: **VI 가 해제된 종목은 목록에서 빼고 싶다.**

클라가 판정할 방법이 없다.
- `vi_end_time` 은 R8 의 **해제 예정시각**이라 임의종료(≤30초)와 연장을 반영하지 못한다.
- 59 시세에도 「VI 발동 중」 상태 필드가 없다.

서버는 이미 정답을 갖고 있다. `VIOrderWatch` 의 `VIOrderItem::viReleased` 는 R8 해제 전문(viStatus '2')을
받으면 `OnViRelease` 가 켜고, 해제 전문을 놓치면 `MarkReleasedIfStale`(해제예정 + 60초)가 보정한다.
연장은 해제가 아니다. `log/vi_orders.toml` 에도 `vi_released` 로 영속된다. **와이어에만 없다.**

## 요청

1. `StockDMA.fbs` `table VIOrderItem` **말미에 append** 한다. 가운데 삽입은 금지다.
   ```
   vi_released: bool;   // R8 해제 전문 수신(또는 해제예정+60초 보정) — VIOrderWatch.viReleased 그대로. vtable 슬롯 36
   ```
2. 72 스냅샷·73 푸시를 만드는 곳에서 `it.viReleased` 를 채운다. 두 경로 모두 해당한다.
3. 해제로 바뀐 항목이 **73 으로 실제 푸시되는지** 확인한다. `OnViRelease` 와 `MarkReleasedIfStale` 두 경로 모두다.
   `Server.cpp` 주석은 「저장·푸시는 ③ 이 함께 한다」인데, 보정 경로도 같은 푸시를 타는지 테스트로 잠가 주면 좋겠다.
4. 거래소 축을 유지한다. KRX 해제가 NXT 항목의 `vi_released` 를 켜면 안 된다. 기존 `OnViRelease(isin, ex, …)` 규칙 그대로다.

## 확인하고 싶은 것 (회신에 적어 주세요)

- 필드 이름과 vtable 슬롯 번호.
- `Pending` 항목도 해제 시 `vi_released=true` 로 푸시되는지. 테스트상으로는 그렇다.
- 해제 뒤 그 항목이 목록에 계속 남는지, 아니면 서버가 목록에서 빼는지. gh-radar 는 「남아 있고 플래그만 켜진다」고 가정하고 클라에서 숨긴다.
  해제 뒤에도 미체결·부분체결이 남으면 그 주문은 작업대 미체결 목록에서 계속 보인다.
- 실서버 배포 커밋. gh-radar 는 gh-trade STATE.md 의 배포 커밋을 기준으로 relay 를 동기화한다.

## gh-radar 쪽 후속 (gh-trade 작업 아님 · 참고)

- `sync-relay-schema.sh`(RELAY= 지정)로 생성 코드를 동기화한다. relay `envelope.ts` 가 `viReleased` 를 디코드하고,
  shared `RelayViOrderItem.viReleased?: boolean` 을 추가한다. 없으면 `false` 로 본다. 옛 게이트웨이와 호환된다.
- 웹 VI 발동 칩·표에서 `viReleased` 항목을 숨긴다. 「미확인 n」 필 수도 숨긴 항목을 뺀다.
  VI 설정 「중지」 확인 요약(오늘 주문)은 전체를 계속 센다.
