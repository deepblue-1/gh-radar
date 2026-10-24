---
status: open
from: gh-trade
from_commit: 86d6b531
from_branch: worktree-agent-a48ddd48e004abc85
date: 2026-10-24
fbs_sync_marker: 07a34fe8
done_commit:
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-24

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

**와이어·MsgType·필드·슬롯 무변경**(88/89/90·kind 16 43칸·`accum_events` JSON 키·fbs 그대로 — sync 스크립트 불필요). **의미가 바뀐다**(사용자 결정 2026-10-24, gh-radar-eb 합의 — quick-261024-i9d):

- **D-1 이월 갱신 조건 삭제** — 이월분은 어제 팀 순매수와 무관하게 계속 이월한다(옛 「어제 팀 순매수 ≥ 1억 이어야 하루 더」 없음). 서버 설정 `carry_renew_net_krw` 폐지(남아 있으면 warn 뒤 무시).
- **D-2 이월 상한 5 → 10일** — `carry_days` 가 10 을 넘으면(11) 끝난다.
- **D-3 K10 삭제** — 14:30 이후 팀 순매도 10% 이월 탈락이 없다. `log/accum_positions.toml` 의 `tail_net_krw` 키도 더 쓰지 않는다.
- **D-4 1억 미만 = 숨김 추적** — 발표된 등록 포지션의 순매수 < `net_krw` 면 지금처럼 88 `state 3`·`end_reason 1` 1프레임 + kind 16 row 4(cancel_reason 1)가 나간다(화면에서는 청산).
  그러나 서버는 `ResetCycle` 하지 않고 **같은 포지션을 숨김으로 계속 누적한다** — buy/sell 누적·since_date/reg_time·평단·lo/hi/reg 가격·`cycle`·`carry_days`·`sell_warns`·`sell_phases` 가 그대로다.
  숨김 포지션은 kind 16 row 1/2/3·88·89 활성 원소에 **없다**(그날 청산한 회색 원소는 89 에 지금처럼 실린다). 숨김 포지션의 순매수가 다시 ≥ `net_krw` 가 되면 0.5초 발표 대기 뒤
  **같은 `cycle`·같은 `since_date`·같은 `reg_time`** 으로 88 `state 1` 이 다시 나가고 다음 분 경계에 kind 16 **row 1** 이 들어간다(재등장 — `carry_days` 도 이어진다).
  숨긴 채 06:00 에 상한을 넘으면 **종료 행 없이 버린다** → gh-radar 보고서에는 그 종목의 마지막 상태가 「청산」(row 4 · end 1)으로만 남고 「만료」 로 보이지 않는다 — **의도된 동작**이다.
  06:00 에 순매수 < `net_krw` 인 등록 포지션(복원분·우리 체결 제외로 줄어든 것)도 같은 함수로 row 4(cancel_reason 1, `carry_days` = 이월 전 값) 뒤 숨김이 된다.
  숨김 포지션은 toml 에 `state = 4`(파일 전용 값 — 와이어에 안 나간다)로 남아 재기동에 살아남고, 복원 때 row 3·88 을 내지 않는다(기동 정합 대상도 아니다 — 저널 최신 행이 row 4).
- **D-5 `end_reason`(kind 16 `cancel_reason`) 의미 재정의 — 값·enum 무변경**: `1` = 1억 미만 숨김(같은 cycle 로 재등장 가능) · `2` = 기동 정합(이월 파일에 없어 복원 안 됨 — 이 뜻 하나) ·
  `3` = 이월 상한(10일) 만료 하나. 옛 「2 = 이월 탈락(임계 미만·K10)」·「3 = 갱신 미달 만료」 는 더 나오지 않는다.
- **cycle 번호 단조(D-6)** — 숨김·재등장은 번호를 올리지 않는다. 06:00 만료·숨김 버림·기동 정합 뒤 같은 종목이 같은 날(이후) 새로 등록되면 서버가 번호를 마지막 + 1 로 둔다.
  남는 구멍: 06:00 만료 뒤 **같은 날 서버 재기동**하고 같은 종목이 다시 등록되면 번호가 1 로 돌아갈 수 있다(번호 하한이 메모리에만 있다).
- **accum_flow `cycles[]` 경계 변경(D-6, 119 밤 배치 `teamflow_accum.py`)** — 구간 경계 = **cycle 번호가 바뀐 곳만**(옛 「row 4 뒤 비종료 행」 경계 삭제). 같은 번호의 row 1 → row 4(end 1) → row 1 은
  **열린 한 항목**이다(값 = 구간 마지막 행, `end_time_ms` null · `end_reason` 0). 구간 끝이 row 4 면 그 행 값·`end_time_ms`. `avg_px` 는 구간 **중간** row 4(숨김 뒤 재등장)에 0 점을 찍지 않고
  평단 점 규칙만 따른다 — 「0 점 수 = 사이클 수 − 열림」 불변식은 그대로. payload 키·열·스키마 무변경.

판정기가 걸린 파일:

- (판정기 0건 — 수동 인계)

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

relay 생성물 재동기화 **불필요**(fbs 무변경). DB 마이그레이션 없음. 확인·조정만:

1. kind 16 을 **키별 마지막 행** 규칙으로 읽는다면 재등장 row 1 이 같은 키(isin)의 row 4 를 덮어 「살아 있음」 으로 돌아오는지 확인한다(그 규칙이면 코드 변경 없이 맞다).
2. 같은 (isin, `cycle`, `since_date`) 의 row 4(cancel_reason 1) → row 1 을 **새 사이클로 세지 않는다**(사이클 수·「오늘 등록」 집계·재등록 배지가 있다면).
3. accum_flow `cycles[]` 를 cycle 번호 기준으로 해석하는지 확인한다(새 밤 배치 이후 같은 번호 재등장은 항목 하나 — 열림이면 `end_time_ms` null).
4. `cancel_reason`/`end_reason` 표시 문구가 있으면 1 = 「청산(숨김 — 재등장 가능)」 · 2 = 「기동 정합」 · 3 = 「이월 상한 만료」 로 맞춘다.

**과거 accum_flow 재생성 계획(실행은 이 quick 범위 밖 — 코드 확정·배포 뒤 gh-trade 오케스트레이터가 별도 진행):**
대상 10/01 ~ 10/23. 119 `~/ticks/export/<D>/accum_flow.ndjson.gz` + manifest 를 새 `cycles[]` 경계로 다시 쓴다 — 백업 먼저, CR-02 이월 승계 차단, 평일 20:20 pull 과 안 겹치게.
완료 뒤 gh-radar 에 알림 → radar-gw 수동 운반 · `limitup-sync` 적재 · 대조. (서버 하루 이벤트 파일 원본은 바뀌지 않는다 — 과거 날짜는 옛 규칙의 행이라 `cycles[]` 해석만 새 경계를 탄다.)

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 와이어 무변경이고, 키별 마지막 행 규칙이면 재등장 row 1 이 상태를 덮는다. accum_flow 경계 변경은 119 밤 배치 코드 배포부터 적용된다(배포 전 날짜의 export 는 옛 경계 그대로 — 위 재생성 계획).

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

- 서버 로그(119·120·121): `[AccumSignal] 청산(숨김 추적) isin=… 순매수=…억 사이클=… 이월 일수=…` · `[AccumSignal] 재등장 isin=… 순매수=…억 사이클=… 등록일=… 이월 일수=…` ·
  `[AccumSignal] 숨김 포지션 이월 상한 초과 — 종료 행 없이 버림 isin=… 이월 일수 n > m` · `[AccumSignal] 이월 만료 isin=… 이월 일수 n > 상한 m — 삭제(end_reason 3) 순매수=…억` ·
  06:00 리셋 줄 끝 `매집 이월 N(숨김 N) 숨김 전환 N 만료 N 숨김 버림 N 폐기 N` · 기동 보정 `… — 이월 N(숨김 N) 숨김 전환 N 만료 N 숨김 버림 N`.
- kind 16: 같은 isin 에서 row 4(cancel_reason 1) 뒤 **같은 cycle·같은 since_date** 의 row 1 이 나오는 패턴(재등장). 옛 규칙이면 그 자리에 cycle + 1 의 새 since 가 나왔다.
- 06:00 행 수 대조: 그날 06:00 대 row 4 수 = 리셋 줄의 **숨김 전환 + 만료**(숨김 버림·숨김 이월은 행 없음). 기동 직후 row 4 수 = 기동 보정 줄의 숨김 전환 + 만료 + 기동 정합 로그의 사라짐 N.
- 정본 문서: gh-trade `docs/features/accum-signal.md` ③ 「청산(숨김 추적)」·④ 「06:00 이월 판정」·⑤ 「같은 사이클 재개」, `docs/analysis/team-flow.md` §13 사이클 경계.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

1. gh-radar 의 kind 16 읽기가 키별 마지막 행인가? 아니라면(사이클별 집계 등) 같은 (isin, cycle, since_date) 의 row 4 → row 1 을 어떻게 이어 붙이는 게 맞을지 알려 달라.
2. 보고서·웹에서 「숨긴 채 10일 상한으로 버려진 종목」 이 마지막 상태 「청산」 으로만 남는 것(만료 표시 없음)이 괜찮은가 — 별도 표시가 필요하면 서버 로그 외 신호(예: 새 row 종류)를 추가해야 해서 계약 상의가 필요하다.

## 추가 2026-10-24 — 매집 종료 end_reason 4 (quick-261024-sc5)

기준 커밋 cc8b7763(gh-trade 문서 커밋 — 코드는 20e718d7·6b70e040, 같은 브랜치). 사용자 결정 2026-10-24(gh-radar-eb 합의 — 위 i9d 의 후속).

### 바뀐 것

- **와이어·필드·MsgType 무변경** — `StockDMA.fbs` 는 AccumSignal `end_reason` 주석만 바뀌었다(ubyte 그대로). relay 동기화(`sync-relay-schema.sh`)는 gh-trade 가 돌리지 않았다 — gh-radar 가 직접 동기화 커밋해 달라.
- **새 값 `end_reason 4` = 「매집 종료 — 청산 뒤 순매수가 사이클 최고의 −30% 이하(최고 10억 → −3억)」**, 짧은 말 「종료」. 순매수는 **우리 체결 제외 반영** 값이다.
  판정 최고값은 **등록 뒤 최고**(등록 시점 순매수부터 매도중·숨김·06:00 이월을 넘겨 잇는 최고 — 서버 `reg_peak_net_krw`)다. 행의 `peak_net_krw` 는 사이클 시작부터의 최고라 드물게 다를 수 있다(등록 전 고점이 더 높았던 경우).
- **kind 16 row 4 · cancel_reason 4 한 행과 `accum_events` `end_reason 4` 한 줄만** 남는다. **88 은 없다**(클라 회색 「청산」 행이 그대로 남는다 — 되살리지 않는다).
- 같은 사이클의 **두 번째 종료 행**이다 — 장중 청산(row 4 cancel_reason 1) 다음에 오고, 같은 주문이 청산과 종료를 함께 만들면 **같은 시각 두 행**(end 1 → end 4)이다.
  숨김 이월 뒤 끝나면 그날 그 isin 의 **row 4 end 4 한 줄**뿐이다.
- **장중 팀 주문에서만** 난다 — 06:00 리셋·기동 복원에서는 절대 안 난다(조건을 이미 만족한 숨김도 다음 팀 주문에서 끝난다).
- **숨김 10일 상한 초과는 종전대로 행 없음**(end 4 아님).
- 종료 뒤 같은 종목 등록은 **cycle + 1 새 사이클**(carry_days 0 · 새 since_date)이다.
- accum_flow(`teamflow_accum.py` 로직 무변경 — 이미 그렇게 동작): `cycles[]` 항목의 `end_reason 4`·`end_time_ms` = **매집 종료 순간**(의도). 날 row 평평한 열(`state`·`end_reason`)도 마지막 행 기준이라 4 가 보일 수 있다.
  숨김 이월 뒤 끝난 날은 그 한 줄짜리 닫힌 항목이다. avg_px 「0 점 수 = 사이클 수 − 열림」 불변식은 그대로다.

### gh-radar 가 할 일

1. kind 16·`accum_events`·accum_flow 읽기가 `end_reason 4` 를 **모르는 값으로 버리지 않는지** 확인하고 표시 문구(「매집 종료」·짧은 말 「종료」)를 붙인다.
2. 같은 (isin, cycle) 의 row 4 두 개(end 1 → end 4)를 **한 사이클의 종료**로 다루는지 확인한다(키별 마지막 행이면 그대로 맞다).
3. accum_flow `cycles[].end_reason` 4 처리(보고서 종료 시각 = 매집 종료 순간).
4. fbs 주석 동기화(relay) — 와이어 무변경이라 급하지 않다.

### 배포 순서

gh-trade 서버 먼저 배포가 안전하다 — 예. 새 값은 kind 16·accum_events·accum_flow 에만 나가고 88 은 무변경이다. gh-radar 가 4 를 모르는 값으로 버리지만 않으면 먼저 나가도 깨지는 것이 없다.

### 확인 방법

- 서버 로그 `[AccumSignal] 매집 종료 isin=… 순매수=…억 등록 뒤 최고=…억 (≤ −30%) 사이클=… 이월 일수=… — 88 없음, 다음 등록은 새 사이클`.
- kind 16: row 4 cancel_reason 1 뒤 같은 cycle 의 row 4 cancel_reason 4, 그 뒤 같은 isin 의 row 1 은 cycle + 1.
- `log/accum_events/<D>.jsonl` 에 같은 값 `"end_reason":4` 한 줄.

### 질문

1. `end_reason 4` 표시 문구 — 「매집 종료」(짧은 말 「종료」)로 웹·보고서에 그대로 써도 되는가?
2. 보고서에서 숨김 이월 뒤 종료된 날의 **row 4 end 4 한 줄짜리 항목**(그날 등록·누적 없이 종료만 있는 항목)을 그대로 보일지, 이전 날 사이클에 붙여 보일지 — gh-radar 쪽 표시 판단이 필요하다.
