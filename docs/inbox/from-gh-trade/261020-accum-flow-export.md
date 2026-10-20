---
status: open
from: gh-trade
from_commit: fc4dec8e
from_branch: master
date: 2026-10-20
fbs_sync_marker: 9eb71e84
done_commit:
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-20 매집감지 보고서 export(accum_flow)

## 바뀐 것

119 밤 배치(20:10 `tickana.batch`) export 단계가 `~/ticks/export/<D>/accum_flow.ndjson.gz` 를 더 쓴다. 장중 매집감지에 등록됐던 종목을 날짜·종목 한 행으로 남기며, 등록 **전** 팀 매수까지 포함한 하루 전체를 원시 pcap 에서 다시 계산한다. 사용자 요구(10/20)는 「매집감지 종목 보고서 메뉴 · 등록 전 팀매수 포함 차트 · 청산·이월 종목 보존」이고, 설계는 gh-radar-80 과 합의했다(10/20). gh-trade 커밋 범위는 Phase 36 이다.
- 36-01 `8348d776`·`4d7c7879`: 서버가 kind 16 과 같은 값을 `log/accum_events/<D>.jsonl` 에도 한 줄씩 남긴다.
- 36-02 `1e9d0c78`·`46629ab2`: 배치가 그 파일을 읽어 행을 만든다.
- 36-03 `c818dc91`·`ed8d23b4`: payload 6키와 모듈 CLI.
- 36-04 `151d91ff`·`f4a8932a`·`e1510687`: 과거 날짜 소급.

배포는 이 노트 뒤다(gh-trade 36-06). 첫 파일은 배포한 날 밤 20:10 배치에서 생긴다.

- 와이어·`.fbs`·relay·kind 16 은 바뀌지 않았다. relay 재동기화는 필요 없다.
- 기존 6개 표·격자·team_flow 도 그대로다. accum_flow 는 manifest `files[]` 에 `{name:"accum_flow.ndjson.gz", rows, sha256}` 로 실리고, 행이 있을 때만 생긴다.
- **schema_version 은 export 공통 값 `1` 그대로다**(워커 KNOWN {1,2} 안).
- 기준 서버는 **교보 119 판정**이다(D-03). 119 가 배치 호스트이자 stock-dma 운영 호스트라서 그렇다. KB 120/121 판정은 이 파일에 들어가지 않는다.
- 규칙 정본은 gh-trade `docs/analysis/team-flow.md` §13 · `docs/features/accum-signal.md` ④ 다.

판정기가 걸린 파일:

- (판정기 0건 — 수동 인계)

## 열 사전

한 줄 = 종목·일 하나(PK `(date, isin)`), isin 오름차순이다. 대상은 **그날 서버 이벤트 파일에 행이 하나라도 있는 종목 전부**다. 장중 등록·청산 종목, 이월 종목, 06:00 이월 탈락·만료 종목, 기동 정합 종목이 모두 들어간다. 같은 날 사이클이 여럿이면 1행이고, 평평한 열은 그날 **마지막 사이클** 값, 사이클 목록은 `payload.cycles[]` 에 있다.

단위는 다음과 같다.
- 시각: ms epoch 정수
- 가격·금액: 원 정수, 수량: 주
- 등락률(`*_rate`): % 그대로(30.0 = +30%), 소수 둘째 자리
- NaN/inf: null
- `since_date`: `"YYYYMMDD"` **문자열**
- `name`: null 일 수 있다

평평한 열은 37개이고, 이 순서로 나온다(`teamflow_accum.FLAT_COLUMNS` 와 같다). 그 뒤에 `payload` 가 온다.

| 열 | 뜻 |
|---|---|
| `date` | YYYYMMDD — 디렉터리 날짜와 같다 |
| `isin` | ISIN 12자 |
| `short_code` | 6자 코드(`isin[3:9]`) |
| `name` | 종목명. A0 에서 가져오고, 없으면 마스터 CSV 를 쓴다. 둘 다 없으면 null |
| `market` | `KOSPI` / `KOSDAQ`(그 밖 null) |
| `base` | 기준가(A0, 없으면 A3) |
| `upper` | 상한가(A0, 없으면 A3) |
| `last_px` | 그날 마지막 KRX 체결가(G1+G4, 20:00 까지) |
| `last_rate` | `last_px` 등락률 % (`base` 없으면 null) |
| `high_px` | 그날 고가(G1+G4) |
| `high_rate` | 고가 등락률 % |
| `state` | 마지막 사이클 상태 — 1 매집중 · 2 매도중 · 3 종료 |
| `end_reason` | 0 끝나지 않음 · 1 청산 · 2 이월 탈락 · 3 이월 만료. 2 는 06:00 탈락과 서버 기동 정합(복원 안 된 종목)을 함께 뜻하며, 보고서에 「이월 탈락(복원 안 됨)」 으로 표기한다 |
| `cycle` | 마지막 사이클 번호. **번호가 연속이라고 가정하지 않는다** — 발표 전 철회로 1, 3 처럼 건너뛸 수 있다 |
| `carry_days` | 이월 일수(이월 안 했으면 0) — 「이월 D+n」 배지의 n |
| `since_date` | 마지막 사이클 등록 거래일 `"YYYYMMDD"`. 이월 종목은 며칠 전이다 |
| `reg_time_ms` | 마지막 사이클 등록 시각(`since_date` + 서버 `reg_time`). **초 해상도다** — 서버 kind 16 은 등록 시각을 HHMMSS 로만 싣는다(µs 없음). 세로선은 초 단위로 맞는다. 형식이 깨졌으면 null |
| `end_time_ms` | 마지막 사이클 종료 시각 = 그 종료 행(row 4)의 `gw_time_ms`(ms). **null = 장 마감까지 살아 있음** |
| `our_excluded_qty` | 서버 값. 우리 서버 주문 체결이라 팀 누적에서 뺀 수량 |
| `mcap_krw` | 시총(서버 값, 그 종목 마지막 이벤트 행) |
| `th_net_krw` | 서버 등록 임계 — 순매수 금액(원) |
| `th_same` | 서버 등록 임계 — 한 가격 최소 조각 수. **이름 주의**: 서버 키는 `th_min_same` |
| `th_mcap_krw` | 서버 등록 임계 — 시총 상한(원). **이름 주의**: 서버 키는 `th_max_mcap_krw` |
| `pos_buy_qty` | 서버 메타 — 등록 이후 팀 매수 누적 수량(우리 체결 제외 뒤, 마지막 사이클) |
| `pos_buy_krw` | 서버 메타 — 등록 이후 팀 매수 누적 금액 |
| `pos_sell_qty` | 서버 메타 — 등록 이후 팀 매도 누적 수량 |
| `pos_sell_krw` | 서버 메타 — 등록 이후 팀 매도 누적 금액 |
| `pos_net_krw` | 서버 메타 — 순매수 금액(음수 가능) |
| `pos_avg_px` | 서버 메타 — 팀 매수 평단 |
| `pos_peak_net_krw` | 서버 메타 — 이 사이클 최고 순매수 금액 |
| `pos_reg_px` | 서버 메타 — 등록 순간 가격 |
| `day_buy_krw` | pcap 재계산 — 그날 하루 팀 매수 금액 |
| `day_sell_krw` | pcap 재계산 — 그날 하루 팀 매도 금액 |
| `day_net_krw` | pcap 재계산 — `day_buy_krw − day_sell_krw` |
| `day_buy_qty` | pcap 재계산 — 그날 하루 팀 매수 수량 |
| `day_sell_qty` | pcap 재계산 — 그날 하루 팀 매도 수량 |
| `schema_version` | export 공통 값(현재 1) |

**`pos_*` 와 `day_*` 는 다르다.**
- `pos_*`·`our_excluded_qty` 는 서버 상태기 값이다. 등록 이후 누적이고, 우리 체결을 뺀 뒤이며, 마지막 사이클 기준이다. 보고서 KPI 는 이것으로 한다.
- `day_*`·`payload` 는 119 pcap 으로 다시 계산한 **그날 하루 전체** 값이다. 등록 전 구간과 우리 체결(pcap 으로 구분할 수 없다)을 포함하고, **상한가 가격 체결도 포함**한다(KRX G1+G4 연속매매 — 서버 상태기와 같은 입력 범위).
- 그래서 team_flow 의 하루 합계(`team_*_val`, 상한가 가격 제외)와 같은 종목·날짜에서도 값이 다르다.

`payload` 6키(이 순서, 열 지향 — 객체 배열은 `buckets`·`cycles` 뿐):

- `price` — `{t0_ms, step_s: 10, idx[], px[]}`. `t0_ms` 는 그날 09:00 KST 다. `idx` 는 10초 칸 번호 0~3959 이고, 칸 = (체결 시각 − 09:00) ÷ 10초, 칸 시각 = `t0_ms + idx × 10000` 이다. `px` 는 그 칸 마지막 체결가이며, 체결이 있는 칸만 싣는다(G1+G4 09:00~20:00). **15:30~16:00(칸 2340~2519)은 비는 것이 정상이다.**
- `orders` — `{t_ms[], side[], qty[], val[], px[], pieces[], first[]}`(같은 길이, `t_ms` 오름차순). 각 키는 다음과 같다.
  - `side`: `"B"` 매수 / `"S"` 매도
  - `val`: 주문 금액(원), `pieces`: 한 주문의 조각 수
  - `first`: 0/1
  - 싣는 기준은 **1천만원 이상 팀 주문 ∪ 사이클마다 첫 팀 매수 주문**(금액 무관, `first`=1)이다.
  - 사이클 k 의 창은 (앞 사이클 `end_time_ms`, k 의 `end_time_ms`] 이다. 첫 사이클은 앞이 −∞ 라 등록 전 그날 첫 팀 매수가 잡히고, 살아 있는 사이클은 뒤가 +∞ 다. `first` 는 「팀매수의 시작점」 표시용이다(사용자 요구).
  - 이미 끝난 사이클 뒤의 주문은 어느 창에도 들지 않는다. 그래서 06:00 종료 행만 있는 종목은 `first` 가 0건이다.
- `buckets[]` — `{slot, buy_krw, sell_krw}`. `slot` 은 10분 칸 0~65(09:00 = 0, 19:50 = 65)이고, 팀 주문이 있는 칸만 slot 오름차순으로 싣는다. 15:30~16:00(39~41)은 비는 것이 정상이다.
- `day_cum_net` — `{t_ms[], net_krw[]}`. **전체 팀 주문**(1천만 미만 포함)의 순매수 누적(매수 +, 매도 −)이며, 주문 하나가 점 하나다. 마지막 값은 `day_net_krw` 와 같다. 「순매수 누적 계단」 용이다.
- `pnl` — 팀 당일 손익. 키 13개는 261020-teamflow-pnl 노트의 `payload.pnl` 과 같다(`buy_val`·`buy_qty`·`sell_val`·`sell_qty`·`realized_val`·`realized_qty`·`unrealized_val`·`total_val`·`ret`·`end_qty`·`end_cost_val`·`unknown_sell_qty`·`unknown_sell_val`). 계산 입력은 이 행의 범위(KRX G1+G4, 상한가 포함)이고, 팀 체결이 없으면 null 이다.
- `cycles[]` — 그날 이벤트 파일에 나타난 사이클마다 하나씩, 처음 나온 순서로 싣는다. 항목 키 16개는 다음과 같다.
  - `cycle` · `since_date` · `reg_time_ms` · `end_time_ms`(null 가능) · `end_reason` · `carry_days` · `state`
  - `pos_buy_qty` · `pos_buy_krw` · `pos_sell_qty` · `pos_sell_krw` · `pos_net_krw` · `pos_avg_px` · `pos_peak_net_krw` · `pos_reg_px`
  - `our_excluded_qty`
  - 값은 그 사이클 종료 행(row 4)이고, 없으면 마지막 행이다. **번호 연속은 가정하지 않는다.** 평평한 열은 마지막 항목과 같다.
  - 사이클 경계는 번호가 바뀔 때 **또는 종료 행 바로 뒤에 종료가 아닌 행이 올 때**다 — 06:00 탈락·장중 재기동 뒤 같은 날 재등록은 번호가 1 로 되돌아갈 수 있어서다(gh-trade 리뷰 CR-01 `65f1296e`).

## 규칙

- 다음 경우 **파일도 manifest 항목도 없다**: 행이 0, 이벤트 파일 없음(그날 등록 0건 · 기능 꺼짐), 단계 전체 실패. 이때도 6개 표와 team_flow 는 영향이 없다. 워커는 accum_flow 를 선택 파일로 다룬다.
- **예외 — 재기록 이어받기**(gh-trade 리뷰 CR-02 `ca57cd5c`): 같은 날짜 export 를 다시 쓸 때(D+1 재기록·`--force`) 직전 완성본 `accum_flow.ndjson.gz` 에 있던 종목 중 이번 실행이 만들지 못한 종목의 행은 그대로 이어받는다(이번에 만든 종목은 새 값). 소급으로 넣은 행이 다음 밤 재기록에 지워지지 않게 하려는 것이다. 같은 입력 → 같은 sha 는 그대로.
- 종목 하나가 실패하면 그 종목만 빠진다(119 로그 `isin=… stage=accum_flow error=…`).
- **탐지 종목(20%↑ 또는 상한가)이 0 인 날** — 평일(월~금)이고 그날 이벤트 파일에 row 1(분 경계) 또는 row 5(경보)가 있으면 밤 배치가 빈 6표(rows 0) + accum_flow + manifest 를 자동으로 쓴다(team_flow 항목 없음 · gh-trade 5e7aad3b · 2026-10-20 사용자 결정, gh-radar Phase 34 합의). row 2(거래일 첫 행)는 체결 없이 시계로 나가 휴장일에도 생기고, 주말 KRX 시험 송출(10/17 토)도 row 1 을 만들 수 있어 판정에서 뺀다. 06:00 row 4·복원 row 3·row 2 만 있는 날은 게시하지 않고 119 로그에 `stage=accum_flow skipped=no_isins … recover=<소급 명령>` 한 줄을 남긴다 — 거래일이면 소급으로 수동 게시.
- 같은 입력이면 같은 sha256 이다(gzip mtime 0, isin 정렬). D+1 밤 재기록 때 accum_flow 도 같이 다시 쓰인다.
- **06:00 이월 탈락·만료 row 4 만 있는 종목은 그날의 종료 행이다.** `state` 3, `end_time_ms` 는 06:00 판정 시각이다. `pos_*`·`since_date` 는 그 행 값이다. `day_*` 는 0 일 수 있고(그날 팀 주문이 없으면), `price` 는 체결이 있으면 있다.
- **서버 기동 정합 row 4(`end_reason` 2, 복원 안 된 이월 종목)** 도 같은 종료 행이다. 이 행의 `pos_*` 는 서버 저널의 마지막 값이라 며칠 전 값일 수 있다. 종료 사실(시각·사유)만 믿는다.
- 배치(20:10) 뒤 밤 재기동으로 붙은 이벤트 행은 그날 파일에 들어가지 않고, D+1 재기록 때 반영된다.

## 소급 목록 파일 형식

과거 날짜 1회 소급(D-10)에 쓴다. **gh-radar 가 kind 16(KYOBO119 게이트웨이 행)에서 날짜별로 내보내는 JSON lines 파일**이다. 줄 모양은 서버 하루 이벤트 파일과 같아서 배치 코드가 하나다.

- 한 날짜에 파일 하나. 그날(KST 거래일) KYOBO119 kind 16 행 전부를 넣고(queue_case 무관), 줄 순서는 자유다. 배치가 `gw_time_ms` 로 정렬한다.
- 필수 키는 `teamflow_accum.EVENT_KEYS_REQUIRED` 23개다. 그 밖의 키는 무시한다. 깨진 줄이나 필수 키가 빠진 줄은 그 줄만 건너뛰고 `bad=` 로 센다.
- 키 이름과 뜻은 261018-accum-signal.md 의 43칸 매핑 표와 같다.

| 키 | kind 16 원천 | 형 |
|---|---|---|
| `row` | `queue_case` | 정수 1~5 |
| `gw_time_ms` | `gw_time_ms` | ms epoch 정수 |
| `isin` | `isin` | 문자열 12자 |
| `state` | `qty` | 정수 |
| `end_reason` | `cancel_reason` | 정수 |
| `cycle` | `expected_cum` | 정수 |
| `carry_days` | `entry_round` | 정수 |
| `since_date` | message 의 `since=` | **문자열** `"YYYYMMDD"` |
| `reg_time` | message 의 `reg=` | **문자열** `"HHMMSS"`(앞 0 유지 — 숫자로 내보내면 등록 시각이 null 이 된다) |
| `buy_qty` | `ev_qty_before` | 정수 |
| `buy_krw` | `limit_bid_qty` | 정수 |
| `sell_qty` | `ev_qty_after` | 정수 |
| `sell_krw` | `bid1_qty` | 정수 |
| `net_qty` | `ev_trade_qty` | 정수 |
| `net_krw` | `cond_threshold` | 정수(음수 가능) |
| `avg_px` | `ev_price` | 정수 |
| `reg_px` | `bid1_price` | 정수 |
| `peak_net_krw` | `ask_qty_at_limit` | 정수 |
| `our_excluded_qty` | `immediate_fill_qty` | 정수 |
| `mcap_krw` | `base_cum` | 정수 |
| `th_net_krw` | `snap_cum[0]` | 정수 |
| `th_min_same` | `snap_cum[1]` | 정수 |
| `th_max_mcap_krw` | message 의 `th=…/…/<mcap>` 셋째 값 | 정수 |

- 119 실행(gh-trade 가 한다, 날짜마다 한 줄): `cd ~/gh-trade-server/tools/analysis && .venv/bin/python -m tickana.batch --date D --accum-events <file> --ticks ~/ticks`
  - 확인 문자열: `stage=accum_flow reason=backfill dir=… isins=N`
  - 그 날짜 export(manifest)가 없으면 `skipped=no_export` 로 아무것도 하지 않는다.
- 밤 parquet·6표·team_flow 는 바이트 하나도 바뀌지 않고 accum_flow 와 manifest 만 바뀐다.
- 대상 날짜는 gh-radar DB 에 KYOBO119 kind 16 이 남은 날짜다(≈ 10/19 이후 — kind 16 저장은 10/18 마이그레이션부터, 게이트웨이별 읽기는 10/19 부터). 119 pcap 보관은 90일이라 그 안이면 된다.
- 전달 경로는 「질문」 ② 를 본다.

## gh-radar 가 할 일

- **relay 재동기화 불필요**(와이어 무변경).
- **DB**
  - 표 `limitup_accum_flow` — PK `(date, isin)`, 평평한 열 37개 + `payload` jsonb.
  - stage CHECK 에 accum_flow 를 더한다.
  - `limitup_commit_day` 가 같은 트랜잭션에서 날짜 단위로 교체한다.
  - **보존 90일** — `limitup_purge_old` 에 같이 묶는다(D-15, 사용자 결정 10/20).
- **워커**
  - team_flow 선택 파일 적재를 일반화해 accum_flow 도 싣는다. manifest 에 없으면 0행 commit 이고 6표에는 영향이 없다.
  - 재적재 감지(manifest rows ≠ 적재 이력 rows 이면 다시 적재 — 10/16 회신 2 의 영구 규칙)도 accum_flow 로 일반화한다.
  - 소급으로 과거 manifest 에 accum_flow 가 더해지면 `files_sig` 가 바뀌어 그 날짜가 **자동으로 통째 재적재**된다. 수동 리셋은 필요 없고, 격자 재업로드 비용만 든다(「질문」 ③).
- **RPC 목록/상세 분리**
  - 목록은 평평한 열만, 상세는 한 종목 `payload` 를 준다.
  - 행 크기가 크다(아래 「샘플」 실측: 10/14 34종목 중 최대 json 224KB). 목록에서 payload 를 빼야 한다.
- **페이지 「분석」 › 「매집감지 보고서」 `/analytics/accum?d=YYYYMMDD`**
  - 목록 + 종목 상세 차트. 차트 요소 7가지:
    1. 가격 선(`price`)
    2. 팀 매수 빨강 원
    3. 팀 매도 파랑 원(`orders`, 크기는 `val`)
    4. 순매수 누적 계단(`day_cum_net`)
    5. 사이클마다 등록 세로선(`reg_time_ms`)
    6. 사이클마다 청산·종료 세로선(`end_time_ms`)
    7. 등록 전 구간 음영(그날 09:00 ~ 첫 사이클 등록, 이월 종목은 음영 없음)
  - `first` 표시: 팀매수 시작점이다. 1천만원 미만이어도 실린 이유가 이것이다.
  - 「이월 D+n」 배지(`carry_days`).
  - `end_reason` 2 는 「이월 탈락(복원 안 됨)」, 3 은 「이월 만료」, 1 은 「청산」 으로 표기한다.
  - 페이지에 **「KYOBO119 판정 기준」** 을 표기한다(D-03).
- **kind 16 과 join 하지 않는다**(D-03 — 30일 purge 비대칭). 이 표가 이력 정본이다.
- **당일 장중(배치 전)은 /trading 「매집」 패널(kind 16 라이브)이 그대로 맡는다**(D-04). 보고서는 그날 20:30 적재 뒤부터다.
- 소급 목록 파일 내보내기(위 형식, 날짜별) — 대상 날짜는 ≈ 10/19 이후.

## 샘플

**모델 판정 샘플이다.** 천일고속(`KR7000650002`) 10/14 에 모의 등록 줄을 넣어 같은 코드(`python -m tickana.teamflow_accum`)로 뽑았다. 서버 판정이 아니다. 배포 첫날 실물 1행이 나오면 여기(또는 회신 아래 「추가」)에 갈아 끼운다.

- 파일(맥): `~/ticks/accum-flow-sample/20261014/accum_flow.ndjson.gz` — rows 1
  - sha256 `943b0a1248ba4c98c7289b6c6be0686bfb756c6ffb0c27149aec070814bc2a10`
  - 크기: json 34,226 B(행 34,225 B) · gzip 11,013 B
  - 생성 2026-10-20 17:40 KST
- 모의 등록 줄: `~/ticks/accum-flow-sample/20261014/events.jsonl`(서버 이벤트 파일 줄 모양, 키 34개). 값의 출처는 다음과 같다.
  - 참조 모델(`teamflow_live`)은 지금 임계로 10/14 「오늘 등록 0」 이라, 서버 doctest 오라클 픽스처(`AccumFixtures.h` 천일고속 10/14 시간창)의 등록 시각 09:57:20 · 등록가 205,500 · 매수 977주/195,798,500 · 매도 164주/33,485,600 · 최고 순매수 169,013,900 을 썼다.
  - `gw_time_ms` 는 15:30 이고, `row` 1 매집중 사이클 1, 이월 0 이다. `mcap_krw` 는 픽스처 상수 곱이라 실제 시총과 다를 수 있다.
  - 이 모의 값들은 `pos_*`·`th_*`·`mcap_krw` 에만 들어간다. 가격·주문·누적·`day_*`·pnl 은 10/14 실물 pcap 재계산이다.
- 이 행에서 볼 것:
  - `name` 천일고속 · `market` KOSPI · `base` 172,600 · `upper` 224,000 · `last_px`=`high_px` 224,000(+29.78%)
  - `reg_time_ms` 1791939440000(09:57:20) · `end_time_ms` null
  - `day_buy_krw` 2,666,615,800 · `day_sell_krw` 2,764,277,500 · `day_net_krw` −97,661,700. 하루 전체는 순매도인데 `pos_net_krw` +162,312,900 이다 — `pos_*`/`day_*` 차이의 예다.
  - payload: `price` 칸 1,301 · `orders` 45건(`first` 합 1 — 09:01:00 9주 156만원 매수, 1천만 미만이지만 실림) · `buckets` 19칸 · `day_cum_net` 634점 · `pnl` 있음(13키) · `cycles` 1개(16키)
- **시간·크기 실측 ①(맥, 10/14 parquet 34종목 전부에 같은 모의 줄)**
  - `rows=34 errors=0 elapsed_s=1.7` → 종목당 ≈ 0.05초. 파일 gzip 486,603 B(종목당 ≈ 14KB), json 1,555,696 B.
  - 행 크기는 json 중앙값 30,544 B · **최대 223,721 B**(한선엔지니어링: price 3,648칸 · orders 501건 · day_cum_net 6,513점), gzip 중앙값 10,333 B · 최대 69,952 B.
  - 34종목 중 json 150KB 초과 2개, gzip 60KB 초과 1개다. 합성 최악 추정(json 145KB / gzip 51KB)과 gh-trade 예산 테스트(150KB/60KB)보다 실물 최대가 크다 — 원인은 팀 주문이 많은 종목의 `day_cum_net` 점 수다.
  - 실제 accum 대상은 등록 종목뿐이라 하루 수 종목~수십 종목이다.
- 맥은 이미 뽑힌 parquet 을 읽은 값이다. 119 에서는 추출이 기존 한 패스에 isin 만 더해지고, **첫날 실측 ② 가 정본이다**(아래 「질문」 ①).

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 지금 워커는 모르는 파일을 적재에 쓰지 않고 sha 대조만 한다. 파일은 manifest 와 바이트가 일치해야 하는데 `write_day` 가 이를 보장한다. gh-trade 가 먼저 나가도 6표·team_flow 적재는 그대로다.

gh-radar 쪽 순서는 항상 DB → relay(이번엔 무변경) → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

시각표(KST, 평일)는 다음과 같다.
- **20:10** 119 `tick-analysis.timer` 배치 — export 에 accum_flow 포함
- **20:20** radar-gw `limitup-pull.timer` 운반
- **20:30** Cloud Scheduler → Cloud Run Job `limitup-sync` 적재

10/16 실측으로 배치 전체는 ≈ 6분이었다(`finished_at` 20:16:10). 20:20 앞 여유는 4분 남짓이다. 넘칠 때의 절차는 「질문」 ① 을 본다(D-09).

## 확인 방법

- 119(배포한 날 밤):
  - `journalctl -u tick-analysis` 에 `stage=accum_events isins=N rows=N bad=0` · `stage=accum_flow isins=N rows=N elapsed_s=X.X` · `stage=done … elapsed_s=` 가 찍힌다.
  - `~/ticks/export/<D>/manifest.json` 의 `files[]` 에 `accum_flow.ndjson.gz` 가 있다(rows · sha256).
  - `finished_at` 이 20:20 전이다.
- gh-radar:
  - 워커 로그에서 그 날짜 manifest 의 accum_flow sha 대조가 통과한다(배포 전 워커는 대조만 하고 통과).
  - 워커 배포 뒤 `limitup_accum_flow` 에 그 날짜 행이 있고, 행 수 = manifest rows 다.
  - `/analytics/accum?d=<D>` 목록과 종목 차트가 보이고, 등록 전 음영·세로선·`first` 표시가 나온다.
- 소급: 날짜별 `stage=accum_flow reason=backfill … isins=N` 뒤 다음 20:30 적재에서 그 날짜가 `files_sig` 변경으로 재적재된다.

## 질문

1. **D-09 운반·적재 10분 미루기 합의.** 첫날 119 실측에서 `finished_at`(또는 `stage=done` 시각)이 20:20 을 넘기면, 운반 20:20 → 20:30 · 적재 20:30 → 20:40 으로 10분 미루자. 절차는 다음과 같다.
   1. gh-trade 가 첫날 밤 실측값(`stage=accum_flow … elapsed_s=` · `finished_at`)을 SendMessage 로 보낸다.
   2. gh-radar 가 `limitup-pull.timer` `OnCalendar` 와 `deploy-limitup-sync.sh` `CRON` 을 함께 10분 미루고 회신한다.
   3. 넘기지 않으면 그대로 둔다.
   - 이 조건부 합의를 받아 줄 수 있는가?
2. **소급 목록 파일 전달 경로.** gh-radar 가 날짜별 파일을 만들면 119 로 어떻게 옮길까?
   - (a) radar-gw 에서 119 로 scp — limitup-pull 이 쓰는 같은 키·경로, 119 `~/ticks/accum-backfill/<D>.jsonl`
   - (b) 사용자가 맥으로 받아 옮긴다
   - 어느 쪽이 편한가?
3. **files_sig 자동 재적재 비용.** 소급한 날짜(≈ 10/19 이후 며칠)는 accum_flow 가 더해지면서 격자 재업로드까지 통째로 다시 돈다. 이 비용을 받아들일지, accum_flow 만 다시 싣는 경로를 둘지 정해 달라.
4. **샘플 행 모양 회신.** 위 샘플(열 37 + payload 6키)을 표·RPC·차트로 옮길 때 맞지 않는 것이 있으면 회신에 적어 달라. 특히 다음 둘이다.
   - 행 크기 최대 224KB(json) — 상세 RPC 를 행 단위로 가져가면 문제가 없는지
   - `reg_time_ms` 초 해상도

## 회신 (gh-radar 가 채운다)

