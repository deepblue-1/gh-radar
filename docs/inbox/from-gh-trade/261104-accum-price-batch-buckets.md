---
status: open
from: gh-trade
from_commit: 4632e17a
from_branch: master
date: 2026-11-04
fbs_sync_marker: e96aef6e
done_commit:
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-04

## 바뀐 것

quick 두 건(261104-k9l · 261104-l7i). 모두 append 만 했고, 기존 MsgType 번호·필드·슬롯은 바꾸지 않았다.

1. **MsgType 95 `AccumPriceBatch` 신설** (S→C, Envelope 슬롯 `accum_price_batch` vtable 114, 261104-k9l)
   - 본문: `items: [AccumPriceItem { isin, last_price: uint, change_rate: double, base_price: uint }]`, `is_snapshot: bool`
   - 300ms 마다 값이 바뀐 매집 등록 종목만 싣고 Broadcast(큐가 차면 드롭)로 보낸다. 로그인 직후에는 89 뒤에 그 연결에만 `is_snapshot=true` 를 Notice 로 1회 보낸다.
   - 수신 대상은 88 과 같은 사용자 세션이다. quote 관찰자(relay)는 받지 않는다.
   - 계기: 클라 매집 목록이 종목마다 시세를 구독해 연결당 구독 상한 200 을 채웠고, 11/4 KB120 에서 주문창 시세가 멈췄다. 같은 작업에서 사용자 연결 구독 상한을 200 → 500 으로 올렸고, 관찰자 상한 2000 은 그대로다.
2. **88 AccumSignal · 89 AccumSnapshot 에서 `buckets` 를 비움** (261104-l7i)
   - 필드는 스키마에 남아 있다. 지금 서버는 채우지 않고, 옛 서버만 채운다. `bucket_base_sec` 는 계속 싣는다.
3. **90 AccumChartResp 말미에 `buckets: [AccumBucket]`(vtable 24) · `bucket_base_sec: uint`(vtable 26) append** (261104-l7i)
   - 값은 88 이 싣던 것과 같은 원천이다.
4. kind 16 저널 · accum_events · accum_positions 파일은 바뀌지 않았다.

관련 파일: `server/src/protocol/StockDMA.fbs`, `server/docs/protocol.md`, `docs/features/order-journal.md`(k9l), `docs/features/accum-signal.md`

## gh-radar 가 할 일

- 기능상 할 일은 없을 것으로 본다. 확인한 근거: gh-radar HEAD 33dd2e2b 에서 relay 가 88/89/90 을 디코드하지 않고, 88 `buckets` 접근자도 쓰지 않는다. 매집 화면은 kind 16 저널을 쓴다.
- 생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`)는 선택이다. 맞춰 두려면 gh-trade master 의 fbs 로 돌리면 된다. gh-radar 쪽에 아직 병합되지 않은 생성물이 있으면 그 기준부터 확인할 것.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예. 새 MsgType 과 append 필드뿐이라 relay 는 영향이 없다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

gh-trade 서버 배포 뒤 relay 로그에 미지 MsgType·디코드 오류가 늘지 않으면 된다. 웹 매집 리포트·상한가 리포트 화면도 그대로여야 한다.

## 질문

없음. 다만 웹 매집 화면에 실시간 현재가가 필요해지면 95 를 relay 관찰자 연결에도 열 수 있으니 알려 달라.
