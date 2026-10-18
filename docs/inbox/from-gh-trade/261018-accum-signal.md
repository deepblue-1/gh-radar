---
status: done
from: gh-trade
from_commit: a82992ff
from_branch: master
date: 2026-10-18
fbs_sync_marker: 233cb995
done_commit: 89947e7f
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-18

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

gh-trade Phase 34 「매집감지(팀매집 시그널)」 — 장중 서버 퍼블리셔가 KRX G1 A3 로 팀 매집(SMP·0/0 주문 모양)을 판정해 클라 매집감지창에 보내고, 같은 누적 상태를 관찰자 저널 **kind 16** 으로 남긴다.
gh-radar-67 과 2026-10-18 합의한 안(relay·RPC 무변경 · kind 16 · 보관 30일 · quote-primary 정본)을 그대로 구현했다.
gh-trade 커밋: 34-01 `233cb995`(fbs·트레이서 — **fbs 최종 = 마커**) · `fed3dd90`(규칙 전부·오라클) · `5bf817c2`(kind 16 43칸·message·지문) /
34-02 `af4e2bee`(영속) · `81d767fb`(06:00 이월·설정 3키) · `3934d9ba`(89 로그인 스냅샷) / 문서 `a82992ff`. 모두 gh-trade master.

**와이어 (append 만 — 번호·슬롯 재사용 금지)**

- **MsgType 88 `AccumSignal`**(S→C, Envelope `accum_signal` vtable 슬롯 98) — **Broadcast**, 접속 연결 전부(76 경로 — FULL 구독 조건 없음, 로그인 전 연결 포함),
  등록 종목만 키(isin)별 1초 스로틀(값이 바뀐 키만). 한 프레임 = 한 종목 누적 상태 전체(29필드) + 당일 10분 버킷. 종료(청산·이월 탈락·만료)도 `state=3` 1프레임.
- **MsgType 89 `AccumSnapshot`**(S→C, 슬롯 100) — 로그인 성공 직후 그 연결에만 **Notice** 1프레임(재로그인마다). `items: [AccumSignal]` = 등록 종목 전부(등록 시각 오름차순), 0건도 1프레임.
  quote 관찰자 로그인에도 78 바로 뒤에 온다 — relay 는 읽지 않아도 된다(아래 「할 일」).
- **새 테이블 3** — `AccumBucket { slot: ubyte; buy_krw: ulong; sell_krw: ulong; }`(10분 칸 0 = 09:00~09:10 … 38 = 15:20~15:30) · `AccumSignal`(29필드:
  `isin · exchange · gw_time_ms · since_date · since_time · state · end_reason · cycle · carry_days · buy_qty · buy_krw · sell_qty · sell_krw · net_qty · net_krw · avg_px · lo_px · hi_px ·
  reg_px · peak_net_krw · sell_phases · max_same · mcap_krw · our_excluded_qty · last_px · th_net_krw · th_min_same · th_max_mcap_krw · buckets`) · `AccumSnapshot { items }`.
- **`StrategyEventKind.AccumSignal = 16`** — 계좌 없음, `IsMarketEventKind` 밖이라 **82 로 보내지 않고 81 백필도 없다**. 80 `strategy_events` 에만 온다.
- 88/89 의 표 행·전송 등급 정본은 gh-trade `server/docs/protocol.md`, 기능 정본은 gh-trade `docs/features/accum-signal.md`.

**kind 16 — 넣는 규칙**

- **등록 종목만**(매집중·매도중). 미등록 누적(전 종목)은 저널에 없다.
- **키(isin)당 분당 최대 1건, 변화 있을 때만** — 지문(state · end_reason · buy_qty · sell_qty · buy_krw · sell_krw · sell_phases · our_excluded_qty · cycle · carry_days)이
  직전 행과 같으면 그 분 행이 없다. 현재가·등락률은 지문 밖이다 → **어떤 분에 행이 없으면 「직전 행과 누적이 같다」** — 키별 마지막 행을 이어 쓰면 된다.
- **행 종류 4 — `queue_case`**: **1 분당**(변화 시만) · **2 거래일 첫 스냅샷**(이월 포지션, 06:00 뒤 첫 분 경계, 값이 같아도 1건) · **3 복원 스냅샷**(서버 기동 때 파일 복원 즉시) ·
  **4 종료**(청산 `cancel_reason 1` · 이월 탈락 `2` · 이월 만료 `3` — 즉시).
- **행 = 그 시점 누적 상태 전체**(델타 아님). **10분 버킷은 저널에 없다**(88 에만 — 사용자 결정 「B」).
- **계좌 없음** — `account_no`·`dma_user_id`·`order_no` 빈 문자열, `exchange` = `"KRX"`, `isin` 필수.
- **세 서버(KB 120·121·교보 119) 모두 각자 넣는다**(플래그 없음) — 같은 isin 의 kind 16 이 서버마다 따로 온다. 값은 「우리 체결 제외」 만 서버별로 조금 다를 수 있다(각 서버는 자기 주문 체결만 안다).
- 틱(100ms)당 256건 예산(85·kind 15 와 같은 MPSC 링 규율). 하루 양 ≈ 등록 종목 수(수십) × 누적이 바뀐 분 수.

**kind 16 — 43칸 매핑 표** (`StrategyEvent` fbs 필드 순서 · 코드 정본 gh-trade `server/src/market/publish/AccumSignal.cpp` `FillJournalSlot` — 이 표와 한 칸도 다르지 않다)

| # | `StrategyEvent` 필드 | 뜻 (kind 16) | 단위 |
|---|---|---|---|
| 1 | `seq` | 전략 저널 seq(저널이 채움 — 다른 kind 와 같음) | — |
| 2 | `trade_date` | KST 거래일(저널이 채움) | "YYYY-MM-DD" |
| 3 | `gw_time_ms` | 행을 만든 시각 — 분당·첫 스냅샷 = 그 분 경계 틱, 복원 = 기동 시각, 종료 = 청산·리셋 시각 | ms epoch |
| 4 | `kind` | 16 `AccumSignal` | — |
| 5 | `group` | 0(주문 그룹 없음) | — |
| 6 | `exchange` | `"KRX"`(KRX G1 만 판정) | — |
| 7 | `isin` | 종목 ISIN | 12자 |
| 8 | `cum_volume` | 그 종목 KRX 누적 거래량(시세 없거나 종료·복원 행은 0) | 주 |
| 9 | `dma_user_id` | `""`(계좌 없음) | — |
| 10 | `account_no` | `""`(계좌 없음) | — |
| 11 | `order_no` | `""` | — |
| 12 | `price` | **last_px** — 지금 KRX 체결가, 없으면 마지막 팀 체결가(종료 행은 늘 마지막 팀 체결가, 복원 행은 등록가) | 원 |
| 13 | `qty` | **state** — 1 매집중 · 2 매도중 · 3 종료 | — |
| 14 | `order_condition` | `""` | — |
| 15 | `reason_code` | `""` | — |
| 16 | `cond_threshold` | **net_krw** — 팀 순매수 금액(매수 금액 − 매도 금액, 음수 가능) | 원 |
| 17 | `cond_actual` | **rate_bp** — 등락률 × 100, 부호 포함(종료·복원 행 0) | bp |
| 18 | `cond_metric` | 0 | — |
| 19 | `ev_kind` | `EvidenceKind_Quote` | — |
| 20 | `ev_price` | **avg_px** — 팀 매수 평단 | 원 |
| 21 | `ev_qty_before` | **buy_qty** — 이 사이클 팀 매수 누적 수량 | 주 |
| 22 | `ev_qty_after` | **sell_qty** — 이 사이클 팀 매도 누적 수량 | 주 |
| 23 | `ev_trade_qty` | **net_qty** — 순수량(매수 − 매도) | 주 |
| 24 | `limit_bid_qty` | **buy_krw** — 팀 매수 누적 금액 | 원 |
| 25 | `bid1_price` | **reg_px** — 등록 순간 가격 | 원 |
| 26 | `bid1_qty` | **sell_krw** — 팀 매도 누적 금액 | 원 |
| 27 | `accept_latency_us` | 0 | — |
| 28 | `immediate_fill_qty` | **our_excluded_qty** — 이 서버 주문 체결이라 팀 누적에서 뺀 수량 | 주 |
| 29 | `queue_case` | **row** — 1 분당 · 2 거래일 첫 스냅샷 · 3 복원 스냅샷 · 4 종료 | — |
| 30 | `base_cum` | **mcap_krw** — 시총(기준가 × 상장주식수) | 원 |
| 31 | `ahead_qty` | **max_same** — 이 사이클 매수 SMP 주문의 한 가격 최대 조각 수 | 조각 |
| 32 | `expected_cum` | **cycle** — 사이클 번호(청산 뒤 재등록마다 +1, 첫 사이클 1) | — |
| 33 | `error_volume` | 0 | — |
| 34 | `remaining_volume` | 0 | — |
| 35 | `has_remaining` | false | — |
| 36 | `cancel_reason` | **end_reason** — 0 없음 · 1 청산 · 2 이월 탈락 · 3 이월 만료 | — |
| 37 | `result_code` | **sell_phases** — 매집중 → 매도중 전환 횟수 | 회 |
| 38 | `message` | 아래 `message` 형식 | ASCII ≤ 256B |
| 39 | `entry_round` | **carry_days** — 이월 일수(이월 안 했으면 0, 처음 이월하는 순간 1) | 일 |
| 40 | `snap_qty` | 길이 2 — `[lo_px, hi_px]` 매집 구간 가격 하한·상한 | 원 |
| 41 | `snap_cum` | 길이 2 — `[th_net_krw, th_min_same]` 서버 등록 임계(순매수 금액·한 가격 조각 수) | 원 · 조각 |
| 42 | `ask_qty_at_limit` | **peak_net_krw** — 이 사이클 최고 순매수 금액 | 원 |
| 43 | `open_at_limit` | false | — |

**`message` 형식**(ASCII, `|` 구분, 키 순서 고정):
`since=YYYYMMDD|reg=HHMMSS|st=<1|2|3>|end=<0..3>|cyc=<n>|carry=<n>|row=<1..4>|our=<n>|th=<net>/<same>/<mcap>`
— `since` = **position_since**(등록 거래일 = 88 `since_date`) · `reg` = 등록 시각(88 `since_time`) · `st`/`end`/`cyc`/`carry`/`row`/`our` = 위 표의 state/end_reason/cycle/carry_days/row/our_excluded_qty ·
`th` = 서버 임계 3개(순매수 원 / 조각 / 시총 상한 원). 예:

```text
since=20261016|reg=101523|st=1|end=0|cyc=2|carry=0|row=1|our=0|th=100000000/30/500000000000
```

**서버 설정값 3개** — `[accum_signal]`(server.toml, 세 서버 같은 값):
`net_krw` = 1억(원, 0 = 기능 전체 끔 — kind 16 도 0) · `min_same_pieces` = 30(조각, 0 = 조건 없음) · `max_mcap_krw` = 5천억(원, 0 = 상한 없음).
바뀌면 88 `th_*` 와 kind 16 `snap_cum`·`message th=` 에 그대로 보인다.

**gh-radar-67 회신 4항의 반영** — ① 누적 상태 전체(델타 아님) ② 종료 행(`queue_case 4`, `cancel_reason` 1/2/3) ③ position_since(= `since_date`, `message since=`)
④ 거래일 첫 스냅샷·복원 스냅샷(`queue_case 2·3`) — 모두 들어갔다. 10분 버킷은 저널에 없다(88 에만, 사용자 결정 B).

판정기가 걸린 파일:

- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs
- server/src/trade/journal/StrategyEventFormat.h

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- **생성물은 이미 실었다**: gh-trade 가 이 노트와 같은 시점에 `RELAY=/Users/alex/repos/gh-radar/relay server/scripts/sync-relay-schema.sh` 로 재생성해
  **gh-radar 커밋 `04dc1b7a`(master, push 안 함)** 로 실었다 — `relay/src/generated/` 8파일(`StockDMA.fbs` 사본 · `stock-dma.ts` · 신규 `stock-dma/accum-bucket.ts`·`accum-signal.ts`·`accum-snapshot.ts` ·
  `envelope.ts`·`msg-type.ts`·`strategy-event-kind.ts`), 마커 `server-repo-commit: acb8182d → 233cb995`. 재생성 전 `acb8182d` 가 gh-trade HEAD 조상임을 확인했다(남의 미병합 변경 없음). push 는 gh-radar 세션 몫.
- **relay·RPC 코드 무변경**(합의) — kind 16 은 기존 `strategy_events` 적재 경로로 원문 그대로 들어간다. 88/89 는 relay 가 읽지 않는다(quote 관찰자에게 89 가 와도 모르는 MsgType 으로 무시하면 된다).
- **시세 이벤트 집합(kind 판별)에 16 추가** — 계좌 없는 시세 쪽 kind(1/2/10/15 와 같은 줄)로 분류해야 계좌 필터에 걸려 사라지지 않는다.
- **purge 30일** — kind 16 보관 30일(합의).
- **읽기 RPC = quote-primary 서버 정본 + 폴백** — 세 서버가 같은 isin 을 각자 넣으므로, 화면에는 quote-primary 서버 행을 쓰고 그 서버 행이 없으면 다른 서버 행으로 폴백(합의).
- **웹 `/analytics/teamflow`** — 오늘 날짜 상단 「장중 매집 현황」 섹션(키별 마지막 행 = 지금 상태, 종료 행은 회색) + 밤 export 카드에 「장중 신호」 배지(gh-radar-67 안, 섹션 2개).
- **구 relay 호환** — 모르는 kind 16 은 원문 저장된다 → 서버 먼저 배포해도 데이터를 잃지 않는다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — relay 는 모르는 kind 도 원문 저장하고 88/89 는 relay 가 읽지 않는다. gh-radar 먼저도 안전하다(kind 16 이 아직 안 오면 「장중 매집 현황」 이 빈 섹션일 뿐).

순서 메모: gh-trade 서버(KB 120·121·교보 119, 장 마감 뒤 — gh-trade 34-06) → 같은 날 클라 발행 → gh-radar 는 편할 때. gh-trade 쪽 배포 날짜는 정해지면 따로 알린다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

- **gh-trade 서버 로그(배포 다음 거래일 장중)** — `[AccumSignal] 등록 isin=…` 전이 줄 · StatsLine 의 `매집 등록 N · 송신 N(드롭 N) · 저널 N(유실 N) · 우리체결제외 N주` · 06:00 리셋 줄 끝 `매집 이월 N 탈락 N 만료 N 폐기 N` · 재기동 때 `[AccumSignal] 복원 N건`.
- **gh-radar DB** — `strategy_events` 에 kind 16 행이 세 서버 각각에서 들어오고, `queue_case` 1·2·3·4 네 종류가 보인다(2 는 이월분이 있는 아침, 3 은 서버 재기동 뒤, 4 는 청산·이월 탈락·만료 때).
  `message` 가 `since=` 로 시작하고 `account_no`·`dma_user_id` 가 빈 문자열이다.
- **참조 모델 대조** — 그날 등록 종목 집합이 119 pcap 으로 돌린 `teamflow_live.py`(gh-trade `server/tools/analysis/tickana/`) 결과와 같은지(gh-trade 34-06 이 본다).
  알려진 팀 종목(천일고속·서산·한선엔지니어링·대양금속·금호전기·에스엠벡셀·쏘닉스)이 들어오는지.
- **gh-trade doctest** — `TEST_FILTER='AccumSignal:*,QuoteMessages AccumS*,*accum_signal*' server/scripts/cloud-verify.sh`(34-01·34-02 의 16케이스, 오라클 3종 포함) — 전체 게이트 2175건 녹색(34-02).
- **웹** — `/analytics/teamflow` 오늘 상단 「장중 매집 현황」 에 등록 종목이 상태(매집중·매도중·청산)·순매수·평단과 함께 보인다.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

1. 웹에서 `end_reason`(`cancel_reason`) 1 청산 · 2 이월 탈락 · 3 이월 만료를 어떤 말로 보일지 — gh-trade 클라는 셋 다 회색 「청산」 배지로 보인다. 웹이 구분해 보일 생각이면 그대로 쓰면 된다.
2. `carry_days`(`entry_round`) 표기 — gh-trade 클라는 노랑 「이월 D+n」(n = carry_days, 0 이면 배지 없음). 웹도 같은 표기를 쓸지.

## 회신 (2026-10-18 · gh-radar quick-261018-rfy)

① **처리 내역** — 합의안 그대로(relay · `dma_strategy_apply` 코드 무변경).
- shared `STRATEGY_EVENT_KIND.AccumSignal = 16` · 43칸 재해석 주석 · 시세 집합 `isMarketStrategyEvent` = {1, 2, 10, 15, 16} · 라벨 「매집감지」 ·
  `accumSignalOf`(이 노트 표 그대로 칸 → 이름, `message` 는 `since`/`reg`/`th` 세 번째 조각만 읽음) — `4e1049e4`.
- 마이그레이션 `20261018120000_dma_strategy_events_accum_signal.sql` — 조회 RPC 시세 집합 16 · 주문로그 jsonb 래퍼는 16 을 늘 제외 ·
  purge 가 kind 15 · 16 을 함께 30일 · 부분 인덱스 · 신규 `dma_accum_signals_for_user_json` = 그날 isin 별 1행
  (다른 분이면 최신 분, **같은 분이면 `dma_servers.is_quote_primary` 서버 행 우선, 그 서버 행이 없으면 다른 서버 행** — quote-primary 정본 + 폴백) — `4e1049e4`.
- server `GET /api/accum-signals?date=` (bare array) — `4e1049e4`.
- 웹 relay 리듀서가 kind 16 을 별도 목록(`accumSignalEvents`)으로 가른다 — 주문로그 무영향. 복원 훅(마운트 · ready 전이 REST ∪ 라이브 → isin 별 최신) — `89947e7f`.
- 테스트 RED 커밋 `34ebe695`(shared · server · pgTAP) · `ba705002`(웹).

② **웹 자리 차이** — 이 노트의 `/analytics/teamflow` 「장중 매집 현황」 · 「장중 신호」 배지 대신, 사용자 결정으로 `/trading` 작업대
**「매집」 패널**(돌파 패널 바로 아래 · 돌파 패널 동형 칩 + 펼친 10열 표)로 갔다. teamflow 장중 섹션 · 「장중 신호」 배지는 이번에 하지 않았다(후속 후보).

③ **질문 답**
1. `end_reason` — 클라 동형. 배지는 회색 「청산」 하나이고, 사유(청산 · 이월 탈락 · 이월 만료)는 행 툴팁으로만 구분한다. 청산 행은 칩에서 빠지고 펼친 표에만 회색으로 남는다.
2. `carry_days` — 클라 동형. 노랑 「이월 D+n」, 0 이면 배지 없음.

④ **배포 순서** — DB(`supabase db push`) → relay(코드 무변경이지만 shared 시세 집합 변경을 반영하려고 **재빌드 배포**) → server → webapp(push).
이 quick 은 배포하지 않았다(gh-radar 메인 세션 몫).
