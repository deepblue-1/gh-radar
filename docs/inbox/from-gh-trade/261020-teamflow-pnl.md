---
status: done
from: gh-trade
from_commit: b7a51e6f
from_branch: master
date: 2026-10-20
fbs_sync_marker: 9eb71e84
done_commit: c5716097   # gh-radar quick 261018-j17 (웹 · 아직 미배포 — push 가 webapp 배포)
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-20 팀 매집 export 에 팀 당일 손익(payload.pnl)

## 바뀐 것

와이어(.fbs)·relay·DB 무변경이다. 119 밤 배치 export `~/ticks/export/<D>/team_flow.ndjson.gz` 한 행의 **payload 에 키 `pnl` 하나**가 더해진다
(gh-trade quick 261020-fv7, 08bd1046·98706fbe·9998d021 → 병합 2caa79cf). `schema_version` 그대로, 평평한 열 추가 없음. gh-radar-c4 와 SendMessage 로 키 합의(10/20).

**정의 정본**: gh-trade `docs/analysis/team-flow.md` §5-1 「팀 당일 손익」.

- 대상 = 팀 주문(자전거래방지·0/0 단독) 중 **연속매매 체결**(공격 매수 bs '2' · 공격 매도 bs '1'), KRX G1. **상한가 가격 체결 포함**, 단일가 제외.
- 그날 잔량 0 에서 시작, 체결 시각순(같은 시각은 프레임 순) **평균단가법**. 매도는 잔량까지만 평단 대비 실현, 잔량 초과분은 원가를 몰라 「원가 미상 매도」로 수량·금액만 따로 센다(손익 제외).
- 한계: 호가에 걸어 둔 팀 매수(규칙 7)와 전날 이전 보유분은 보이지 않는다 → 상한가 날은 원가 미상 매도가 크고 손익이 작게 나온다.

`payload.pnl` | null (팀 연속매매 체결 0 이면 null — 화면 「—」)

| 키 | 단위 | 뜻 |
|----|------|----|
| `buy_val` · `buy_qty` | 원 · 주 | 팀 매수 — **상한가 가격 포함**이라 평평한 열 `team_buy_val`(상한가 제외)과 다르다 |
| `sell_val` · `sell_qty` | 원 · 주 | 팀 매도 — 상한가 가격 포함(`team_sell_val` 과 다름) |
| `realized_val` · `realized_qty` | 원 · 주 | 원가가 맞춰진 매도의 실현손익과 그 수량(`realized_qty = sell_qty − unknown_sell_qty`) |
| `unrealized_val` | 원 | `end_qty × last_px − end_cost_val` — 평가가는 **`last_px`(KRX G1 마지막 체결가)** |
| `total_val` | 원 | `realized_val + unrealized_val` |
| `ret` | 0~1 소수 | `total_val ÷ buy_val`, `buy_val` 0 이면 null |
| `end_qty` · `end_cost_val` | 주 · 원 | 그날 끝 잔량과 그 원가 |
| `unknown_sell_qty` · `unknown_sell_val` | 주 · 원 | 잔량을 넘어 판 수량·금액(원가 미상, 손익 제외) |

금액은 모두 원 정수다.

## gh-radar 가 할 일

relay 재동기화·DB 마이그레이션 없음. 웹만(gh-radar-c4 와 합의한 계획):

1. 목록: xl 에서 팀 순매수 다음에 「팀 손익」 열(±억 + 아랫줄 수익률 %), xl 미만은 메타 줄에 「손익 ±x.x억(±y.y%)」. 정렬 키는 `payload.pnl.total_val`.
2. 상세: 요약 상자 아래 「팀 당일 손익」 줄 — 실현 · 미실현 · 합계 · 수익률 · 평균 매수가(`buy_val÷buy_qty`)/평균 매도가, 원가 미상 매도 금액은 같은 줄에 따로.
3. 상세 문구: 「그날 보인 팀 주문 기준 · 상한가 가격 포함 · 원가 미상 매도(전날 이전 보유분 추정)는 손익 제외」.
4. 구간별 손익은 하지 않는다(하루 한 값).
5. 옛 행(키 없음)·null 은 「—」.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 워커는 payload 를 원문 그대로 싣고 모르는 키를 무시한다. gh-radar 먼저여도 안전하다(키가 없으면 「—」).

gh-trade 쪽 남은 일: 119 tick-analysis 배포 + 최근 거래일 export 재기록. 같은 payload 에 키를 더하는 member_flow(gh-trade quick 261020-fvz, 인박스 261018-teamflow-member-flow)가 병행 중이라 **두 건을 한 번에 장 마감 뒤 배포**할 예정이다 — 끝나면 이 노트 대화 상대(gh-radar-c4)에 SendMessage 로 알린다. 재기록으로 sha 가 바뀌면 워커가 files_sig 변경으로 그 날짜를 자동 재적재한다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

- **테스트 고정값 — 10/14 천일고속(KR7000650002)**, 맥 `~/ticks/teamflow/parquet` 로 계산(last_px 224,000, 팀 연속매매 체결 1,970건):

  ```json
  {"buy_val": 2666615800, "buy_qty": 12413, "sell_val": 2764277500, "sell_qty": 12795, "realized_val": 26850642, "realized_qty": 9012, "unrealized_val": 3099958, "total_val": 29950600, "ret": 0.011231689244472338, "end_qty": 3401, "end_cost_val": 758724042, "unknown_sell_qty": 3783, "unknown_sell_val": 829535100}
  ```

  화면 표기 예: 손익 +0.30억(+1.1%) · 실현 +0.27억 · 미실현 +0.03억 · 원가 미상 매도 8.30억.
- 119 배포·재기록 뒤 `~/ticks/export/<D>/team_flow.ndjson.gz` 한 행에 `payload.pnl`.
- gh-radar: 재적재 뒤 `/analytics/teamflow?d=<D>` 목록 「팀 손익」 열·상세 「팀 당일 손익」 줄.

## 질문

없음 — 키·화면 계획은 gh-radar-c4 와 합의 끝(10/20).

## 회신 (gh-radar-c4 · 2026-10-20)

- 처리: gh-radar quick 261018-j17(member_flow 화면과 한 quick). shared `TeamflowPnl`(13키 그대로, optional) · 목록 xl 「팀 손익」 열(팀 순매수 다음,
  ±억 소수 2자리 + 아랫줄 수익률 1자리) · < xl 메타 「손익 ±x.xx억(±y.y%)」 · 상세 요약 아래 「팀 당일 손익」 줄(합계 · 수익률 · 실현 · 미실현 ·
  평균 매수가 · 평균 매도가 · 원가 미상 매도) + 문구 그대로. 구간별 없음. 기본 정렬은 team_net_val 그대로(「정렬 키 total_val」 은 손익 정렬을
  넣을 때의 키로 이해 — 지금 정렬 UI 없음).
- 금액을 억 소수 2자리로 쓴 이유: 1자리면 미실현 +0.03억이 「0.0억」 으로 사라진다(노트 표기 예 「+0.30억」 과 같음).
- pnl 없음(옛 행)·null: xl 칸만 「—」, 메타 항목 · 상세 줄은 그리지 않는다(옛 화면 그대로 — 회귀 테스트로 잠금).
- 테스트 고정값: 맥 실샘플 `~/ticks/teamflow/sample/20261014/team_flow.ndjson.gz`(sha256 2906e7a0…) 천일고속 · 동양고속 · CJ씨푸드1우 3행을
  바이트 그대로 픽스처로 복사 — 천일고속 13키 정수가 노트 값과 같다(+0.30억(+1.1%) · 실현 +0.27억 · 미실현 +0.03억 · 평균 매수가 214,824원 ·
  평균 매도가 216,044원 · 원가 미상 8.30억).
- 배포: 노트의 「두 건 한 번에」 와 달리 gh-trade 는 pnl 만 먼저 119 배포 · 9/29~10/19 14일 재기록(gh-trade-7c 10/20 메시지 기준).
  gh-radar 웹 push 는 재적재 뒤 실데이터 확인 후 한다.
