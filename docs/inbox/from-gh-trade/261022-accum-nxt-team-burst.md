---
status: open
from: gh-trade
from_commit: aeae7809
from_branch: master
date: 2026-10-22
fbs_sync_marker: 9eb71e84
done_commit:
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-22

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

매집감지(88/89·kind 16·90)가 NXT 팀주문(버스트)도 판정한다(gh-trade Phase 37). NXT G1 A3 를 msg_seq 연속 런으로 묶어 한 가격 2조각 이상인 런을 팀 주문으로 보고, KRX 팀 주문과 **같은 종목 포지션에 합산**한다. 기존 필드의 값은 이제 KRX+NXT 합산이고, NXT 몫을 따로 싣는 칸이 append 로 늘었다. 필드 삭제·재배열·MsgType·Envelope 슬롯 변경은 없다.

- **88 `AccumSignal`(89 원소 같음)** — 끝에 `nxt_buy_qty: long`(vtable 68) · `nxt_buy_krw: long`(70) · `nxt_sell_qty: long`(72) · `nxt_sell_krw: long`(74) append. 합산 `buy_*`/`sell_*` 안에 든 NXT 팀 주문 몫이다(NXT 순매수 = `nxt_buy_krw − nxt_sell_krw`, 우리 체결 제외 반영). `exchange` 값은 "KRX" 그대로 두고 뜻만 「합산 포지션」 이다.
- **90 `AccumChartOrder`** — 끝에 `exchange: ubyte`(vtable 16) append. 'K'(75) KRX · 'N'(78) NXT, 0·부재 = KRX. 90 은 로그인 세션 전용이라 relay 경로는 읽지 않는다.
- **kind 16 `AccumSignal` 저널 행(43칸 재해석)** — 지금까지 0 고정이던 두 칸을 쓴다: `error_volume` = `nxt_buy_krw`(NXT 팀 매수 금액) · `remaining_volume` = `nxt_sell_krw`(NXT 팀 매도 금액). `message` 꼬리에 `|nxt=<buy_krw>/<sell_krw>/<buy_qty>/<sell_qty>` 가 붙는다(최장 249B — 256B 안). 앞 부분(`since=…|warn=<0|1>`)은 그대로다. 옛 행은 두 칸 0 · 꼬리 없음. `snap_len` 은 2 그대로이고, 그 밖 칸은 바뀌지 않았다. 그 외 칸 매핑 정본은 `261018-accum-signal.md`.
- **하루 이벤트 파일 `log/accum_events/<D>.jsonl`(gh-trade 서버 로컬)** — 키 2개 `nxt_buy_krw` · `nxt_sell_krw` 를 `th_max_mcap_krw` 바로 뒤에 넣었다(키 34 → 36개). 키 이름으로 읽는 로더는 영향이 없다.
- **무변경** — 밤 배치(accum_flow · team_flow export)와 `/analytics/teamflow` 밤 보고서 원천은 그대로 KRX 전용이다(NXT 반영은 다음 단계). 10분 버킷은 합산 그대로이고 거래소별로 나누지 않는다.

판정기가 걸린 파일:

- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

1. **relay 생성물 재동기화** — fbs 88·90 append 를 relay 생성 코드에 반영해야 88/89 의 `nxt_*` 를 읽을 수 있다. `sync-relay-schema.sh` 는 gh-trade 쪽 다음 플랜(37-05)이 gh-radar 쪽 미병합 생성물이 없는지 확인한 뒤 돌린다(지금 relay 마커는 `9eb71e84`). gh-radar 쪽에 아직 커밋 안 된 relay 생성물 변경이 있으면 이 노트에 답으로 알려 달라 — 덮어쓰지 않게 합친 fbs 로 돌린다.
2. **kind 16 파서** — `error_volume` 을 NXT 팀 매수 금액, `remaining_volume` 을 NXT 팀 매도 금액으로 읽는다. NXT 수량이 필요하면 `message` 의 `|nxt=` 꼬리(네 값 `/` 구분: 매수 금액/매도 금액/매수 수량/매도 수량)를 읽는다. 꼬리 없는 옛 행은 0.
3. **웹 `/analytics/teamflow` 장중 섹션** — 행마다 NXT 순매수 열(`error_volume − remaining_volume`)을 하나 두면 된다. 합산 순매수는 지금처럼 `net_krw` 다.
DB 마이그레이션은 칸 재해석이라 필요 없다(기존 칸에 값만 들어온다).

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 모두 append 다. 구 relay·구 클라는 모르는 칸을 무시하고, 구 파서가 두 칸을 안 읽으면 지금처럼 0 을 본 것과 같다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

- 배포 다음 거래일, kind 16 행 가운데 `error_volume != 0` 또는 `remaining_volume != 0` 인 종목이 있다(NXT 지원 종목에 팀 주문이 있었던 날). 그 행 `message` 끝에 `|nxt=` 꼬리가 있고 앞 두 값이 두 칸과 같다.
- relay 재동기화 뒤 88 디코드에 `nxt_buy_qty/nxt_buy_krw/nxt_sell_qty/nxt_sell_krw` 접근자가 있고, NXT 몫 ≤ 합산 값이다(`nxt_buy_krw ≤ buy_krw`).
- 생성 코드 `AccumChartOrder` 에 `Exchange` 접근자가 하나 늘었다.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

1. NXT **수량**도 43칸에 따로 칸이 필요한가? 지금은 금액 두 값만 칸(`error_volume`/`remaining_volume`)에 있고 수량은 `message` 꼬리에만 있다. 필요하면 `snap_len` 3 으로 늘려 `snap_qty[2]` = NXT 매수 수량 · `snap_cum[2]` = NXT 매도 수량을 append 할 수 있다(gh-trade 37-05 전에 답 주면 같이 넣는다).
