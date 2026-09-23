# gh-trade 요청 — 상따 전략 열거(64)에 「무장된 전략만」 옵션 추가

## 배경

gh-radar 웹 작업대(`/trading`)는 로그인 직후 relay 가 보내는 `GetLimitChaserListReq(24)` 의 응답 `GetLimitChaserListResp(64)` 를 받아 등록 전략마다 카드와 사이드바 항목을 만든다.

`Gateway::ProcessGetLimitChaserList` 는 `StrategyManager::SnapshotLimitChasers` 의 **전부**를 싣는다. 그래서 매수·매도·취소가 모두 꺼진(발주가 끝나 무장이 풀렸거나 15:40 일괄 비활성으로 꺼진) 전략도 옵션값을 가진 채 매번 내려온다. 웹 화면에는 쓰지 않는 전략 카드가 쌓인다.

원하는 동작은 이렇다.

1. 로그인 직후 열거는 **무장된 전략만** 받는다.
2. 사용자가 그 종목 카드를 열면 그때 그 키의 전략 한 건을 조회해 옵션값을 채운다. 이 조회는 이미 있는 `GetLimitChaserReq(20)`(요청 `GetStrategyReq.key`, 응답 `SetLimitChaserResp(60)` 에코, 요청 연결에만)로 충분하다. **서버 변경은 1 에만 필요하다.**

## 요청 사항

`GetLimitChaserListReq(24)` 에 「무장된 전략만」 필터를 **선택적으로** 추가해 주세요.

- **하위호환 필수.** 필터를 보내지 않는 기존 클라이언트(WinForms 상따창 · 구 relay)는 지금처럼 전부를 받는다. 기본값 = 전부.
- **「무장」의 정의는 서버 정본으로.** 제안은 `IsBuyArmed() || IsSellArmed() || IsCancelArmed()` 이고, 한방체결(sweep)이 독립 발주 게이트라면 그것도 포함한다. 열거 원소의 `buy_enabled`/`sell_enabled` 가 이미 「cfg 값이 아니라 실제 발주 게이트」(CR-02)이므로 같은 판정을 쓰면 된다. 판정 함수는 한 곳에 두고 에코 빌더와 공유한다.
- **전달 방식은 서버가 정한다.** 24 는 지금 요청 테이블이 없다(인자 없는 요청 선례). 두 안 중 스키마 규율에 맞는 쪽으로.
  - (a) 24 에 요청 테이블 슬롯을 새로 두고 `armed_only: bool = false`.
  - (b) VI 21 이 `GetStrategyReq.key` 를 거래소 문자열로 재사용한 선례처럼, 24 에도 `GetStrategyReq` 를 싣고 `key = "armed"` 일 때만 필터(부재·빈 값 = 전부).
- **응답 모양은 그대로.** 64 원소는 지금처럼 `AddLimitChaserTable` 한 경로로 만든다. 필터는 원소를 고르는 조건만 바꾼다.
- **푸시 경로는 바꾸지 않는다.** 60 에코 팬아웃(같은 user 전 연결)과 11.2 푸시는 무장 여부와 무관하게 지금처럼 나간다. 걸러 받은 뒤의 캐시 관리는 relay 몫이다.
- **스키마 변경 시** `StockDMA.fbs` 주석에 번호·기본값·하위호환 규칙을 적고, `docs/protocol.md` 표를 갱신하고, gh-radar 가 `sync-relay-schema.sh` 로 가져갈 수 있게 커밋 해시를 알려 주세요(flatc 25.12.19 고정).

## 확인하고 싶은 것

1. `GetLimitChaserReq(20)` 가 전략이 없는 키에 「빈 에코」를 돌려준다(`BuildLimitChaserEcho(snap=nullptr)`). relay 가 이것을 「전략 없음」으로 읽어도 되는지, 아니면 식별할 필드(예: `crud`)가 있는지.
2. 무장이 풀린 전략의 옵션값이 서버에 얼마나 오래 남는지. 장 마감 정리(`crud "D"`)에서 지워지는지, 다음 날에도 남는지. 카드를 열 때 조회로 채우려면 그 수명을 알아야 한다.
3. 필터를 쓰면 WinForms 와 웹이 같은 user 로 붙어 있을 때 부작용이 없는지(열거는 요청 연결에만 가므로 없을 것으로 본다).

## 테스트

- 필터 없음: 기존 테스트 그대로(전부).
- 필터 있음: 무장 0 · 매수만 · 매도만 · 취소만 · 전부 해제 조합에서 원소 수와 키.
- 구 클라이언트 바이트(필터 슬롯 없음)로 요청해도 전부가 온다.
