---
status: done
from: gh-trade
from_commit: 55488d05
from_branch: master
date: 2026-10-19
fbs_sync_marker: 9eb71e84
done_commit: none   # 와이어·생성 코드 무변경 — gh-radar 는 39칸·15:30 고정이 0곳(확인만, 기준 HEAD a674f3e2)
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-19

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

**와이어 무변경** — `.fbs` 는 주석만 바뀌었다(필드·타입·MsgType·슬롯 그대로). 의미만 넓어졌다(gh-trade quick-261019-qqc, 코드 1e5963ed).

- 매집감지(88·89·45/90·kind 16) 입력이 KRX G1 → **KRX G1 + G4(애프터마켓 16:00~20:00)**. NXT 는 계속 제외.
  근거: 10/14 틱 G4 에서도 자전거래방지(0/0 같은 가격 다조각) 주문이 나온다 — 팀 주문 1,168건 42.2억(14종목), 16~19시 내내.
- `AccumBucket.slot` 0~38 → **0~65** (09:00~20:00 10분 칸, 39~41 = 15:30~16:00 은 늘 빈 칸). 88/89 buckets 최대 39 → **66**개.
- `AccumChartSample.t_s` 0~2339 → **0~3959** (09:00~20:00 10초 칸). 90 samples 최대 **3,960**개.
- kind 16(dma_strategy_events): 행 형식·43칸 해석 무변경. 달라지는 것 —
  ① 16:00~20:00 에도 분당 행·등록·매도중·청산 행이 생긴다(`reg=16xxxx~19xxxx` 가능)
  ② 누적 칸(buy/sell qty·krw·net·peak)에 애프터마켓 팀 주문이 포함된다
  ③ 06:00 이월 K10 탈락(end_reason 2) 판정 구간이 14:30~15:30 → **14:30~20:00**
  ④ 이월 갱신 만료(end_reason 3)의 「어제 순매수」(10분 버킷 합)에 애프터마켓 포함

판정기가 걸린 파일:

- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- `sync-relay-schema.sh` 재동기화: **선택**(주석만 — 생성 코드 변화 없음).
- 웹·RPC 에서 매집 버킷 칸 수를 39 로, 차트 시간축을 09:00~15:30 으로 고정해 둔 곳이 있으면 66칸 · 09:00~20:00 으로 넓힌다(없으면 할 일 없음).
- kind 16 을 「장 마감 15:30」 전제로 읽는 곳(예: 15:30 이후 행을 무시·당일 마감 판정)이 있으면 20:00 기준으로.
- DB 마이그레이션 불필요.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **예** — 와이어 무변경이라 gh-radar 가 그대로여도 깨지지 않는다(39칸·15:30 고정 화면이면 애프터마켓 몫만 안 보인다). gh-trade 는 아직 push·배포 전(사용자 확인 대기) — 배포 뒤 알린다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

- gh-trade 배포 뒤 16:00~20:00 에 KRX 애프터마켓 팀 매집 종목의 kind 16 분당 행이 들어온다(dma_strategy_events, gw_time 16~20시).
- 웹 매집 패널(있다면)의 10분 막대·차트가 16:00 이후까지 이어진다.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음.

## 회신 (gh-radar-9b · 2026-10-19)

- 확인 결과 **할 일 없음**. gh-radar 는 88/89/45/90 을 읽지 않고(저널 kind 16 만), kind 16 경로(shared `accumSignalOf` · 웹 `accum-list.ts` ·
  `accum-strip.tsx` · RPC `dma_accum_signals_for_user_json`)에 버킷 칸 수(39)나 15:30 마감 전제가 없다 — 날짜(trade_date)와 행 시각만 본다.
  16:00~20:00 행은 그대로 들어오고 패널에도 그대로 보인다(시세 구독도 KRX 애프터마켓 호가가 오면 그대로 갱신).
- `sync-relay-schema.sh` 재동기화는 생성 코드 변화가 없어 건너뛴다(다음 fbs 변경 때 같이).
- 질문 없음. gh-trade 배포 뒤 첫 애프터마켓 날 16~20시 kind 16 유입을 확인해 알리겠다.
