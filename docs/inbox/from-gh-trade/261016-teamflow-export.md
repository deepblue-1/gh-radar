---
status: done
from: gh-trade
from_commit: 8e670584
from_branch: master
date: 2026-10-16
fbs_sync_marker: none
done_commit: 5d6e2499
---
<!-- 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-16 팀 매집(teamflow) 일일 export

## 바뀐 것

119 밤 배치(20:30 `tickana.batch`) export 단계가 `~/ticks/export/<D>/team_flow.ndjson.gz` 를 더 쓴다(gh-trade 8f29a461~8e670584, 119 반영 10/16 낮 — 오늘 밤 10/16 분부터 생긴다). 와이어·.fbs 무변경. 설계는 gh-radar-69 와 합의(10/16), 화면은 스케치 014(목록 + 행 펼침)·015 C(차트 + 접힌 표).

- 기존 6개 표·grid·manifest 는 그대로. team_flow 는 manifest `files[]` 에 `{name:"team_flow.ndjson.gz", rows, sha256}` 로 실린다(행이 있을 때만).
- **schema_version 은 올리지 않았다 — 현재 export 공통 값 `1` 그대로**(계약 초안의 「2」는 잘못 적은 것. 워커 KNOWN {1,2} 안이다).
- 규칙 정본: gh-trade `docs/analysis/team-flow.md` §5·§11.

## 열 사전

한 줄 = 종목·일 하나, isin 오름차순. 대상 = 그날 배치 탐지 종목 전부(20%↑ ∪ 상한가 체결, 상한가 미도달 포함).
단위: 시각 ms epoch 정수 · 가격·금액 원 정수 · 수량 주 · **비중(share) 0~1, 분모 0 이면 null** · **등락률(`*_rate`, `lo`/`hi`)은 % 그대로(30.0 = +30%)** · NaN/inf 는 null.

| 열 | 뜻 |
|---|---|
| `date` | YYYYMMDD — 디렉터리 날짜와 같다 |
| `isin` · `short_code` · `name` · `market` | ISIN · 6자 코드 · 종목명(A0, null 가능) · `KOSPI`/`KOSDAQ`(그 밖 null) |
| `base` · `upper` | 기준가 · 상한가(미도달이어도 기준가×1.3 호가 내림) |
| `first_limit_ms` · `first_limit_auction` | 첫 상한가 체결 시각(미도달 null) · 그 체결이 단일가(VI)였나 |
| `last_ms` · `last_px` · `last_rate` | 마지막 체결 시각·가격·등락률 % |
| `status` | `limit`(마지막 체결가 == 상한가) \| `below` |
| `volume` · `value` | 하루 전체 거래량·거래대금(상한가 가격 포함) |
| `team_buy_val` · `team_sell_val` · `team_net_val` · `team_buy_share` | 하루 합계 — **상한가 가격 체결 제외**. share = 팀 매수 ÷ 매수주도 체결(주 기준) |
| `below20_net_val` · `above20_net_val` | 팀 순매수 20% 미만 · 20%~상한 미만 |
| `limit_team_buy_val` · `limit_team_sell_val` | 상한가 가격 팀 매수·매도(상한가 체결 없으면 null) |
| `reach_team_share` · `reach_team_val` | 연속매매로 상한가에 닿은 순간 매수주도 중 팀 비중·금액(null 가능) |
| `b9_lower` | B9 창구 증분 하한(20%~상한 미만 팀 매수 주, null 가능) — 화면 미사용 |
| `high_px` · `high_rate` · `high_ms` | 고가·등락률 %·시각 |
| `schema_version` | export 공통 값(현재 1) |
| `payload` | 아래 |

`payload`:
- `bands[]` — `{label, vol, val, buy_aggr, sell_aggr, team_buy, team_sell, net(주), team_buy_val, team_sell_val, net_val, share}`. label 순서 고정: `0% 미만`(체결 있을 때만) · `0~5%` · `5~10%` · `10~15%` · `15~20%` · `20~25%` · `25~28%` · `28%~상한 미만` · `상한가 가격`(체결 있을 때만) · `하루 합계`. 구간 행은 상한가 가격 체결을 포함하지 않고, **「하루 합계」 = 상한가 가격 행을 뺀 나머지 합**이며 평평한 `team_*` 열과 같은 값이다.
- `buckets[]` — 10분 버킷(체결 있는 것만) `{key(0~143), start "HH:MM", lo, hi(등락률 %), share, + bands 와 같은 수치 키}`. `bucket_min` = 10. 버킷은 상한가 가격 체결도 포함한다(시간 흐름).
- `window` — 팀 순매수가 이어진 최대 구간 `{i, j, start, end "HH:MM", lo, hi, net_val, share_lo, share_hi}` | null
- `worst[]` — 팀 순매도 큰 버킷 최대 3개 `{start, net_val}` — 화면 미사용
- `reach` — `{t_ms, buy, team, team_val}` | null — 화면 미사용
- `members` — B9 마지막 스윕 기준 `{time "HH:MM", rows[{member, name, buy, sell, net}], absent[이름…], total{buy,sell,net}|null, top_buy{member,name,qty}, top_sell{…}}` | null. 상위 5 에 한쪽만 있으면 다른 쪽·net 은 null. `absent` = 매수·매도 상위 5 어디에도 없는 팀 창구(「상위 5 밖: 교보·유진」 줄).
- `summary_lines[]` — 사실 문장 4~5줄, HTML 은 `<b>` 만.

## 규칙

- 탐지 0 인 날: export 자체가 없다(기존과 같음).
- 종목 하나가 실패하면 그 종목만 빠진다(119 로그 `stage=team_flow isin=…`).
- 단계 전체가 실패하거나 행이 0 이면 **파일을 쓰지 않고 manifest 에도 없다**(rows 0 파일은 없다) — 6개 표는 영향 없음. 워커는 team_flow 를 선택 파일로 다룬다(합의).
- 같은 입력이면 같은 바이트(gzip mtime 0). D+1 밤 재기록 때 team_flow 도 같이 다시 쓰인다.

## gh-radar 가 할 일

- 마이그레이션 `limitup_team_flow`(종목·일 PK, 평평한 열 + payload jsonb) · stage CHECK · `limitup_commit_day` 에 표 추가 · `limitup_purge_old` 에 90일 삭제 한 줄
- 워커: team_flow 선택 파일 적재(없으면 0행 commit)
- 웹: 「분석」 하위 「팀 매집」 `/analytics/teamflow?d=YYYYMMDD`
- 배포 전 이미 team_flow 를 포함해 적재된 날짜는 `files_sig` 를 NULL 로 돌려 재적재(gh-radar-69 가 말한 대로)

## 샘플

맥 `~/ticks/teamflow/sample/20261014/team_flow.ndjson.gz` — 10/14 119 야간 parquet 으로 같은 코드(`export_day_records`)를 돌린 것. 34행(천일고속·한선엔지니어링·동양고속·에스엠벡셀 포함), sha256 `f6656ae29779b127a46322197cb440be0b1efe9900d13d7ca038b290db37d897`. 119 의 10/14 export 디렉터리에는 없다(재처리 안 함). 실물은 오늘 밤 20:30 뒤 119 `~/ticks/export/20261016/` → 21:00 pull 로 버킷 `export/20261016/` 에 생긴다.

## 배포 순서 제약

gh-trade 먼저 배포가 안전한가: 예 — 지금 워커는 모르는 파일을 적재에 쓰지 않는다(sha 대조만 하고 통과). gh-trade 는 이미 119 에 올라갔다.

## 확인 방법

- 119: 오늘 밤 `journalctl -u tick-analysis` 에 `stage=team_flow isins=N rows=N`, `~/ticks/export/20261016/manifest.json` files 에 team_flow.
- gh-radar: 워커 배포 뒤 `limitup_team_flow` 에 10/16 행, `/analytics/teamflow?d=20261016` 목록.

## 질문

없음.

## 회신 (2026-10-16 · gh-radar Phase 33)

done_commit `5d6e2499` = 배포된 limitup-sync 이미지 태그와 같은 커밋(Phase 33 코드 + master 병합). 순수 Phase 33 마지막 코드 커밋은 `bc489782`.

1. **처리.** 표 `limitup_team_flow`(PK `date, isin` · 평평한 열 29 + `schema_version` + `payload` jsonb) · `limitup_commit_day` 가 같은 트랜잭션에서 team_flow 도 날짜 단위로 교체 · stage CHECK 에 team_flow 추가 · `limitup_purge_old` 에 90일 삭제 · 워커는 team_flow 를 선택 파일로 적재(manifest 에 없으면 0행 commit — 6개 표 영향 없음) · RPC `teamflow_report_for_user` + `GET /api/teamflow/report` · 웹 `/analytics/teamflow?d=YYYYMMDD`(사이드바 「분석 › 팀 매집」 · 상한가 보고서 다음).
2. **「배포 전 이미 적재된 날짜는 files_sig 를 NULL 로」 할 일은 워커 자동 감지로 대체했다.** manifest 에 team_flow 가 있고 적재 이력의 `rows.team_flow` 가 manifest rows 와 다르면 files_sig 가 같아도 그 날짜를 다시 적재한다. 수동 UPDATE 0건 · 일회성이 아닌 영구 규칙(앞으로 D+1 재기록으로 team_flow 만 생기거나 바뀌어도 자동으로 따라간다).
3. **배포(2026-10-16 낮, DB → Job → server → webapp 순).** 마이그레이션 `20261016200000_limitup_team_flow` · `20261016200100_teamflow_report_rpc` 적용(17:22 KST) → limitup-sync Job 이미지 `limitup-sync:5d6e2499`(17:24 · Scheduler 21:20 그대로) → radar-gw 낮 운반 1회(11일치 20260929~20261015) · Job 즉시 실행 `gh-radar-limitup-sync-589w2`(11일 모두 사유 files_sig 로 재적재) → server 리비전 `gh-radar-server-00062-xnt`(무인증 401 확인) → webapp push `3a6e75fa..9e1561ab`(17:39) · Vercel `dpl_BJuxRw63heNSFCsWS8WLdFLiFemg`(trade.jx1.io).
4. **라이브 확인.** 스모크 `--date 20261014` PASS 13 · FAIL 0, INV-8 `db=34 manifest=34`(샘플 34행과 같다) · 재실행은 committed 0(멱등). 사용자 라이브 UAT(`/analytics/teamflow?d=20261014` — 사이드바 · KPI · 기본 접힘 · 에스엠벡셀 · 한선엔지니어링 · 동양고속 · 천일고속 상세 · 폰 390 · 다크): 「전부 통과」. 첫 로드 시간은 미기록. 10/16 분은 아직 export 전이었다 — 오늘 밤 20:30 배치 → 21:00 운반 → 21:20 새 워커가 `new` 로 싣는다(미확인).
5. **노트 ↔ 코드 차이(코드가 맞다고 보고 적재했다) 5건.**
   - `first_limit_auction` 은 상한가 체결이 없어도 `false` 다(null 아님 — `bool(len(lim) and …)`). 웹은 이 값을 쓰지 않는다.
   - `bucket_min` 은 buckets 안이 아니라 **payload 최상위 키**다.
   - `window.share_lo` · `window.share_hi` 는 **0~1**(÷100)이고 분모 0 이어도 0 이다(null 아님). 노트에 단위가 없었다.
   - `members.time` 은 장 마감 뒤일 수 있다(10/14 샘플 에스엠벡셀 "19:50" · 한선엔지니어링 "20:00"). 화면 캡션은 「{members.time} 기준」 그대로 표기한다.
   - 「gh-radar 가 할 일」 4번째(files_sig NULL)는 위 2 로 대체.
6. **화면 메모.** 10분 차트는 09:00~15:30 39칸 고정축이고, key 93(15:30 종가 단일가)은 15:20 칸에 합산해 그린다(「10분 표 보기」 에는 15:30 행 그대로).
7. **「상한가 도달」 KPI 는 `status === "limit"`(마지막 체결가 = 상한가)만 센다** — 10/14 장중 상한가 15 · 종가 상한가 9. 사용자 답: 「이대로 둠」(라벨 유지).
