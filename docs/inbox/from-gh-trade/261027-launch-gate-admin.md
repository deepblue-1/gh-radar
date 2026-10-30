---
status: done
from: gh-trade
from_commit: edf5a4eb
from_branch: master
date: 2026-10-27
fbs_sync_marker: 2b86be0a
done_commit: 2a81523f
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-27 — 「발사 경계 지도」 웹 어드민 (상의 단계)

**성격: 계약 변경 인계가 아니라 신규 기능 제안·상의다.** 와이어는 아직 무변경이다. 사용자(alex) 지시(2026-10-27):

1. gh-trade 서버가 매일 **16:00 예약 발사** 와 **09:00:30 개장차익(NXT) 발사** 의 결과(주문 조각 단위)를 gh-radar 에 넘기고, gh-radar 가 DB 에 쌓는다.
2. gh-radar 웹앱 **어드민 메뉴** 에서 ① 날짜별 발사 주문 내역, ② 여러 날짜를 묶은 **발사 경계 지도**(조각별 송신 시각 × 접수/거부 점 지도)를 본다. 16:00 과 09:00:30 둘 다.
3. **gh-radar 가 먼저 목업을 만들어 사용자에게 확인받은 뒤** 구현한다. 목업 참고용으로 첨부(아래)를 넘긴다.
4. 채널(서버→gh-radar 전달 방식)은 이 노트에서 합의한 뒤 gh-trade 가 서버 쪽을 구현한다 — 그때 정식 계약 인계 노트를 다시 쓴다.

## 첨부 (같은 디렉터리 `261027-launch-gate-admin-attach/`)

- `launch-gate-map.html` — 지금까지 로그로 손으로 만든 발사 경계 지도(단일 HTML, 데이터 인라인). 공개본: https://claude.ai/artifact/KxSS44SPmddkMAhCSPzaAa. **목업은 이 화면의 구성(4패널 KB/교보 × 코스피/코스닥, 점 지도 + 게이트 띠 + 「쐈다면」 리본 + 표)을 출발점으로 삼되 gh-radar 웹 톤으로 다시 그리면 된다.**
- `pieces.json` — 그 지도의 원자료 10/12 ~ 10/26, 196행. 행: `{date, broker("KB"|"교보"), market("코스피"|"코스닥"), wire, q(예약 id), j(조각 번호), rel(송신 시각 − 16:00:00.000000, µs), result("접수"|"101"|"기타")}`. 초기 적재(백필)용으로 그대로 써도 된다.
- `pieces120.txt` / `pieces119.txt` — 원본 `[Launch] 조각` 로그 줄(KB 120 / 교보 119).

## 데이터 (서버가 가진 것 — 스키마 설계 근거)

발사 1회 = (날짜, 서버, 프로파일, 시장) 단위. 프로파일 셋:

| 프로파일 | 시각 | 시장 | 오프셋 | 비고 |
|---|---|---|---|---|
| `Q16` 예약 발사 | 16:00:00.000 | K(코스피)/Q(코스닥) 스레드 2개 | **학습**(매일 correction·step 갱신) | 경계 지도의 본체. 101 = 「장 개시 전」 거부 |
| `N` 개장차익 NXT | 09:00:30.000 | K/Q | 고정(119 −200µs·120 −245µs) | 515 = NXT 거부, 즉시 3회 재전송 |
| `A` 개장차익 KRX | 09:00:27.0(case1_fire_ms) | K/Q | 고정 | 경계 아님(개장 뒤 매수) — 주문 내역만 |

서버·브로커: KB 120(`kb`), 교보 119(`kyobo`). 121 은 미사용.

**발사 머리(1행/발사)** — 로그 `[Launch] 결과`·`게이트 구간`·`학습` 줄에서:
`date, broker, profile, market, offset_used_us, fire_at(실제 첫 송신 시각), n_pieces, n_accepted, n_101(or n_515), n_other, first_accept_idx(시장 송신순), retries, abandoned, gate_lo_us, gate_hi_us, nonmono` + Q16 만 `correction_before/after_us, step_us, last_dir, bracketed, same_dir_run, reject_span_us, jump, one_way_us(편도), rtt_min_us`.

**조각(1행/조각)** — 로그 `[Launch] 조각` 줄 + 예약 저장소에서:
`date, broker, profile, market, wire(시장 송신 순번), queued_id(Q16: Q153015001 꼴 / N·A: 판정 key), piece_idx(j), round(0/1/2 — 송신 지연 0/+10/+30µs), order_no, sent_rel_us(첫 발 송신 − 발사 기준시각, µs), result("접수"|"101"|"515"|"기타"|"무응답"), result_code, accept_time(HHMMSSmmm, 거부면 도착 ms), retry, abandoned` + 주문 속성 `isin, side, price, qty, filled_qty, account(마스킹 여부는 gh-radar 결정), user`.

보관: 서버 쪽에는 **하루치만** 남는다(`queued_orders.toml` 은 당일, 보정 파일 `[[history]]` 는 시장별 하루 요약 60행, 조각 단위는 로그뿐). 그래서 gh-radar DB 가 유일한 이력 저장소가 된다.

## 채널 제안 (합의 필요)

서버에는 HTTP 송신 코드가 없고, 두 서버 모두 gh-radar relay 가 **관찰자 TCP 로 붙어 저널(80)을 seq 로 재생** 한다 — relay 가 꺼져 있어도 나중에 따라잡는다. 그래서:

- **제안 A(추천)**: 전략 이벤트 저널(80 말미 `strategy_events`, `StrategyEvent` 43필드)에 **새 kind 17 `LaunchPiece`**(조각 1건) + **kind 18 `LaunchHead`**(발사 머리 1건)를 관찰자 전용으로 append. kind 15·16 처럼 기존 칸을 재해석해 싣는다(칸 매핑 표는 합의 뒤 정식 인계 노트에). fbs 는 주석·enum 만 바뀌고 와이어 구조 무변경. relay 는 kind 17·18 을 DB 두 표(`launch_heads`, `launch_pieces`)에 upsert(키: date·broker·profile·market·wire).
- 제안 B: 밤 배치 export(`export/<D>/launch_pieces.ndjson.gz`)에 표를 더한다 — 119 는 되지만 **KB 120 로그는 사내망** 이라 운반 경로를 따로 만들어야 한다. 비추천.
- 백필: 10/12 ~ 10/26 의 16:00 은 첨부 `pieces.json`(머리 없이 조각만), 09:00:30 은 로그에서 같은 꼴로 뽑아 ndjson 으로 한 번 넘긴다. relay 가 아니라 gh-radar 의 적재 스크립트(1회)로 넣는 게 간단하다.

## gh-radar 가 할 일

1. **목업** — 어드민 메뉴 두 화면(또는 탭): ① 날짜 선택 → 발사 주문 내역(머리 + 조각 표, 16:00 / 09:00:30 전환), ② 날짜 범위 선택 → 발사 경계 지도(서버 × 시장 4패널, x = sent_rel_us, 점 = 접수/거부, 게이트 띠, 다음날 오프셋 표시). 사용자(alex)에게 확인받는다.
2. 채널 제안 A 에 대한 의견(kind 번호·칸 매핑·DB 표·upsert 키). 합의되면 gh-trade 가 서버 구현 뒤 정식 인계 노트를 쓴다.
3. DB 마이그레이션·relay 파서·웹은 목업 확인 뒤.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 해당 없음(아직 와이어 무변경). 정식 인계 때는 「서버 먼저 배포해도 relay 가 모르는 kind 는 무시」가 되도록 설계한다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

목업 단계: 사용자 확인. 구현 뒤: 16:00:01 이후 relay 로그에 kind 17·18 적재 건수, 웹 어드민에서 당일 행이 보이면 됨.

## 질문

1. 채널 A(관찰자 저널 kind 17·18)로 가도 되는가, 아니면 relay 쪽에서 더 편한 꼴이 있는가?
2. 계좌·사용자 열을 어드민에 그대로 보여도 되는가(어드민 전용이면 그대로가 사용자 의도에 가깝다).
3. 백필 ndjson 을 받을 1회 적재 스크립트를 gh-radar 가 만들 수 있는가?

## 회신 (gh-radar · 2026-10-27)

gh-radar Phase 35(발사 경계 지도 어드민)로 받는다. 이 노트는 정식 인계 노트의 칸 매핑 적용 · 첫 실물 날짜 UAT 뒤에 `status: done` 으로 닫는다.

1. **채널 A 수용** — 관찰자 저널 kind 17 `LaunchPiece` · kind 18 `LaunchHead` 로 간다(로드맵 확정 때 gh-trade-cc 에 회신함). relay 는 무변경이고 kind 해석은 gh-radar DB 쪽(`dma_strategy_apply` 안 해석 함수)에서 한다. 정식 매핑 전에는 원문만 쌓이고 매핑 뒤 `launch_reproject` 로 다시 푼다 — gh-trade 서버를 먼저 배포해도 안전하다.
2. **계좌 · 사용자 열** — 마스킹 없이 그대로 저장하고 어드민(`app_users.role='admin'` 만)에 그대로 노출한다(D-02). 사용자 경로(전략 이벤트 json 래퍼 · 주문 펼침 타임라인 · ws)에는 kind 17·18 을 내보내지 않는다.
3. **1회 적재 스크립트** — gh-radar 가 만든다(`scripts/launch-backfill.ts` · 기본 dry-run 집계 → `--apply` · Claude 가 실행 — D-09). 첨부 `pieces.json` 196행이 1차 입력이자 자동 대조 기준이고, gh-trade 전체분 ndjson 이 오면 같은 키로 덮는다(멱등).
4. **표 · 키** — `launch_pieces` 키 `(trade_date, gateway, profile, fire_exchange, market, wire)` · `launch_heads` 키 `(trade_date, gateway, profile, fire_exchange, market)`. 제안의 키(date · broker · profile · market · wire)에 발사 거래소를 더했다 — A 의 09:00:27 KRX 매수 다리와 09:00:30 NXT 매도 다리가 겹치지 않게. 두 표 모두 `source`(`journal` · `backfill`) 열로 출처를 가르고, 같은 키가 다시 오면 최신 seq 가 이긴다(원문 `gateway · journal_epoch · seq` 보관).
5. **요청 · 정식 매핑 요구** — gh-trade 인박스 `docs/inbox/from-gh-radar/<YYMMDD>-launch-gate-contract.md` 에 적었다: ① 백필 ndjson 지금(두 서버 · 로그 전부 · 16:00 + 09:00:27 + 09:00:30 · 09:00:30 side 포함 요청) ② kind 17 칸 매핑에 발사 기준(`fire_exchange` + `fire_base`) · `side` 필수 · kind 18 에 계산된 `next_offset_us` ③ 질문 5건(A 다리별 wire · A 머리 행 수 · 재송신 epoch 규칙 · kind 18 순서 · 계좌 칸).

(2026-10-30 추가) **정식 매핑 · 라이브 UAT 완료 — 닫는다.** 정식 매핑 `20261028200000_launch_project_mapping`(35-10 `6622b444`) 원격 적용(10-28 01:33) · 첫 reproject projected 0 errors 0(그때 원문 0건). 백필: 첨부 196/33 → 전체 ndjson 254/51(35-09). 라이브: q16 10-28 · 10-29, n0930 10-28 ~ 10-30 당일 조각 · 머리 전부 source journal · 화면 사용자 답 「맞다」(10-30) · 키 수정 배포 뒤 「A 09:00:29 KRX→」 행 「보인다」(10-30).
키 결함 수정: KYOBO119 A 재확인 재발사(fire_base 09:00:29 · wire 0 부터)가 옛 키(fire_base 없음)에서 09:00:27 회차를 덮던 것 — quick 261030-d7b 로 두 표 PK 에 `fire_base` 추가(`301280e6` · 마이그레이션 `20261030200000_launch_fire_base_key`) · 주문 내역 09:00:30 탭이 A KRX 09:00:00~09:00:30 회차를 받음(`2a81523f`). 10-30 원격 적용 → `--reproject --from 20261028` projected 182 errors 0 → 10-29 코스닥 · 10-30 코스피/코스닥에 09:00:27 · 09:00:29 두 회차 조각 · 머리가 다 남음(덮였던 seq 3160182 · 3160185 · 3372361 · 3372364 · 3372365 ~ 3372367 복구).
