---
status: open
from: gh-trade
from_commit: c5b92212        # Phase 27 플랜 27-15 문서 커밋 (병합 뒤 master 에 그대로 실린다)
from_branch: worktree-agent-a473f68473fa052a5   # 병합 뒤 master
date: 2026-10-05
fbs_sync_marker: 26b3493e    # → 병합 뒤 갱신 — master fbs 로 동기화하면 2404509b(이 계약의 fbs 커밋)가 된다
done_commit:
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-05 · Phase 27 실시간 상한가 특징(85 · kind 15) + 밤 export(Supabase) 계약

세 갈래다 — (A) 와이어: MsgType 85 `LimitFeature` · (B) 관찰자 저널: `StrategyEventKind` 15 · (C) 119 밤 배치 export 파일(Supabase 표·Storage 격자·radar-gw pull).
(A)(B)는 **이미 master 에 있다**(fbs 커밋 `2404509b`, kind 15 저널 `a09d5d66`, master fbs blob `68679e9a` — Phase 28 노트 `261004-auto-sell-wire.md` 와 같은 blob).
(C)는 파일 스키마가 `server/tools/analysis/tickana/export.py`(27-10) 로 구현·119 배포(27-11) 끝났고, 9/29~10/2 4일치 실데이터가 119 `~/ticks/export/` 에 있다.

정본(gh-trade master): `docs/features/limitup-feature.md`(기능 정본) · `docs/analysis/feature-dictionary.md`(특징 사전 — 이름·식·kind 15 슬롯 매핑) ·
`server/docs/protocol.md` `LimitFeature(85)` 행 · `server/tools/analysis/tickana/export.py`(export 열의 정본은 코드다 — 아래 표는 코드에서 뽑았다).

## 바뀐 것

판정기가 걸린 파일(이 노트를 만든 트리 기준 — 문서 3개):

- docs/features/order-journal.md
- docs/features/order-log-progress.md
- server/docs/protocol.md

판정기 기본 기준(merge-base HEAD origin/master) 밖이라 위 목록에 안 나온 **같은 계약의 앞선 커밋**(이미 master):

- `server/src/protocol/StockDMA.fbs` — `2404509b` (MsgType 85 · 테이블 3개 · Envelope 슬롯 90 · kind 15)
- `server/src/trade/journal/StrategyEventFormat.h` — `a09d5d66` (주석 2줄 — kind 15 를 `IsMarketEventKind` 에 넣지 않는다는 명시. 본문 무변경)

### (A) MsgType 85 `LimitFeature` (S→C)

- `LimitFeature = 85` — S→C 푸시 전용, 요청 짝 없음(76 선례). Envelope `limit_feature: LimitFeature;` = **vtable 슬롯 90**(Phase 28 `user_settings` 슬롯 88 뒤, 말미 append).
- 전송 = **Broadcast**, (isin, 거래소)별 **1초 스로틀**(값이 바뀐 키만), 그 키를 **FULL 구독**한 연결에만 — 75 `MemberStatsPush` 와 같은 경로(계좌 세션 축 아님).
  **quote 관찰자(relay 시세 연결)도 그 키를 FULL 로 구독하고 있으면 받는다.**
- 대상 키 = 상한가가 매도 1~10호가에 보이거나 매수1 == 상한가 ∪ 등락률 `rate_cross_alert_pct` 이상(76 의 above 집합). 단일가 구간에도 보내고 `auction=true`.
- 이름 = 특징 사전 「85 필드」 열 = 밤 격자 열 이름(같은 정의). 소수는 bp(1% = 100), 초는 정수.
- 서버 120 가동본은 아직 85 를 보내지 않는다(Phase 27 서버 코드는 미배포 — 배포 시점은 아래 「배포 순서 제약」).

`table MemberDelta` (이 분 B9 증분 창구 1건 — 상위 3, 금액 가중) — 4필드

| 필드 | 타입 | 뜻 · 단위 |
|---|---|---|
| member_no | string | 회원사 번호 |
| d_qty | long | 이 분 증분 수량(주) = 현재 전량 − 분 시작 전량 |
| d_value | long | 이 분 증분 금액(원) |
| share_bp | int | 그 쪽(매수/매도) 양수 증분 금액 합 대비 비중 bp(0~10000) |

`table TeamSim` (팀 유사도 1건 — 모형, 승격 전 빈 벡터) — 2필드

| 필드 | 타입 | 뜻 · 단위 |
|---|---|---|
| label | string | 팀(센트로이드) 이름 |
| sim_bp | int | 현재 분 창구 비중 벡터 ↔ 센트로이드 코사인 bp |

`table LimitFeature` — 32필드(fbs 선언 순서). 출처: 대부분 실측, `member_*` 는 **추정(분 단위)**, `model_*`·`p_*`·`team_sim` 은 **모형**

| # | 필드 | 타입 | 뜻 · 단위 |
|---|---|---|---|
| 1 | isin | string | 종목 ISIN |
| 2 | exchange | string | `"KRX"`/`"NXT"` — 키의 거래소 (사전 밖 메타) |
| 3 | gw_time_ms | long | 관측 시각 epoch ms(1초 틱 시각) |
| 4 | feature_schema | ubyte | 특징 사전 판 번호(v1 = 1) (사전 밖 메타) |
| 5 | upper_px | uint | 상한가(원), 0 = 미상 |
| 6 | last_px | uint | 현재가(원) |
| 7 | rate_bp | int | 등락률 bp(하락 음수) |
| 8 | base_px | uint | 기준가(원) |
| 9 | list_shares | ulong | 상장주식수(주) — 시가총액 = list_shares × base_px |
| 10 | q_qty | ulong | 상한가 매수잔량(주) |
| 11 | q_krw | ulong | 상한가 매수잔량 금액(원) = q_qty × upper_px |
| 12 | wall_krw_visible | ulong | 상한가까지 남은 매도벽 금액(원, 보이는 10단계) |
| 13 | wall_qty_hidden | ulong | 10호가 밖 매도 수량(주, 가격 미상) |
| 14 | wall_truncated | bool | 상한가가 10호가 밖이라 매도벽이 잘림 |
| 15 | sell_led_10s | ulong | 지난 10초 매도 주도 체결량(주) |
| 16 | buy_led_10s | ulong | 지난 10초 매수 주도 체결량(주) |
| 17 | cancel_10s | long | 지난 10초 상한가 잔량 취소(주, 하한) |
| 18 | new_10s | long | 지난 10초 상한가 잔량 신규(주, 하한) |
| 19 | auction_fill_10s | ulong | 지난 10초 단일가 체결로 빠진 상한가 잔량(주) |
| 20 | drain_s | int | 소진 예상(정수 초), −1 = ∞ |
| 21 | lock_state | ubyte | 0 미도달 · 1 잠김 · 2 도달 뒤 비잠김 |
| 22 | lock_elapsed_s | int | 이번 잠김 경과(정수 초), lock_state ≠ 1 이면 0 |
| 23 | burst_upper_limit | bool | 버스트 상한가(58/59 `burst_upper_limit` 과 같은 판정) |
| 24 | auction | bool | 단일가 구간(VI·동시호가·NXT 단일가) |
| 25 | member_buy | [MemberDelta] | 이 분 B9 매수 증분 상위 3 |
| 26 | member_sell | [MemberDelta] | 이 분 B9 매도 증분 상위 3 |
| 27 | member_delta_partial | bool | 창구 증분 일부 미상(분 시작 기준 없음·5단계 밖 출입) |
| 28 | model_state | ubyte | 0 관찰 중(파일 없음·빈 파일·파싱 실패) · 1 적용 |
| 29 | model_schema_version | ushort | 적용 중 모델 파일 schema_version(model_state 0 이면 0) |
| 30 | p_break_bp | int | N초 안 깨짐 확률 bp, −1 = 없음(model_state 0) |
| 31 | p_horizon_s | int | 확률의 창 N(초), model_state 0 이면 0 |
| 32 | team_sim | [TeamSim] | 팀 유사도(승격 전 빈 벡터) |

라벨(`break_within_n`·`reach_within_n`, 미래값)은 85 에 없다 — 밤 격자 export 에만 있다.

### (B) 관찰자 저널 `StrategyEventKind` 15 `LimitFeature`

- 80 `JournalBatch.strategy_events` 에 **분당 1건/키**(분 경계 틱, 대상 키만)로 들어온다 → relay `dma_strategy_events` 에 **그대로**(kind 값만 새로, 저널 포맷·StrategyEvent 43필드·RPC 무변경).
- **82 로는 안 보낸다**(`IsMarketEventKind` = 1/2/10 에 15 없음), 81 백필에도 없다. 시세 이벤트처럼 **계좌 없음**(`dma_user_id`·`account_no`·`order_no` = `""`).
- 하루 양: 대상 키 수 × 장중 분 수(수십 키 × 390분 ≈ 수천~1만 행/일).
- 값은 분 경계에서 창구 기준을 다시 잡기 **전** 스냅샷 — 끝난 1분의 창구 증분이 `message` 에 실린다.

**숫자 슬롯 매핑표**(StrategyEvent wire 필드 ← 85 필드, 특징 사전 ③ 과 동일)

| StrategyEvent 필드 | 값 | 비고 |
|---|---|---|
| kind | 15 | |
| group | 0 | 주문 그룹 없음 |
| exchange · isin · gw_time_ms | 키 · 관측 시각 | |
| cum_volume | 그 거래소 누적거래량(A3 최신) | |
| ev_kind | 1 Quote | 근거 = 최신 B6 |
| price | last_px | |
| ev_price | upper_px | |
| limit_bid_qty | q_qty | |
| ev_qty_before | q_krw | 원 |
| ev_qty_after | wall_krw_visible | 원 |
| ask_qty_at_limit | wall_qty_hidden | |
| open_at_limit | wall_truncated | |
| ev_trade_qty | sell_led_10s | |
| immediate_fill_qty | buy_led_10s | |
| ahead_qty | cancel_10s | |
| base_cum | new_10s | |
| expected_cum | auction_fill_10s | |
| cond_threshold | drain_s | 정수 초, −1 = ∞ |
| cond_actual | rate_bp | |
| entry_round | lock_state | 0/1/2 |
| qty | lock_elapsed_s | 정수 초 |
| has_remaining | auction | |
| result_code | p_break_bp | model_state 0 → −1 |
| snap_qty 길이 | model_state | 0/1 (원소 값은 의미 없음 — 길이만 본다) |
| message | `buy:<회원>=<share_bp>,…;sell:<회원>=<share_bp>,…\|m=<model_state>` | 창구 상위 3(매수·매도), ASCII, 256B 경계. 예 `buy:00047=7407,00046=2222,00048=370;sell:00003=10000\|m=0` |

나머지 필드(reason_code·cond_metric·bid1_*·accept_latency_us·queue_case·error_volume·remaining_volume·cancel_reason·snap_cum 등)는 0/`""`.
문장 조립기는 85 와 같은 필드 이름으로 쓰면 된다(예: 「잔량 17.3억 · 매도벽 0 · 10초 매도 37% · 취소/신규 0.19 · 소진 — · 잠김 43초 · 키움41 신한27 | 깨짐확률 관찰 중」 — 클라 상따창 한 줄 형식).

### (C) 119 밤 배치 export — Supabase 적재용 파일 계약

119(`kyobo119`, `10.16.207.119`)의 `~/ticks/export/<YYYYMMDD>/`:

```
<D>/entries.ndjson.gz · locks.ndjson.gz · jumps.ndjson.gz · member_alloc.ndjson.gz · facts.ndjson.gz · touches.ndjson.gz   (한 줄 = 한 객체)
<D>/grid/<isin>.json.gz                                                                                               (종목별 1초 격자 두 해상도)
<D>/manifest.json                                                                                                     (완료 표시 — 마지막에 rename)
```

**공통 규칙**

- 열 이름 snake_case = 119 DuckDB 열 이름. 행마다 `schema_version`(정수, 지금 1 — 특징 사전 판 번호와 같이 오른다).
- 시각은 **`*_ms` = 표준 Unix epoch ms**(내부 ns 를 1e6 으로 자른 값, 시간대 없음 — 표시할 때 Asia/Seoul). `*_ns` 는 밖으로 내지 않는다.
- 가격 원 정수 · 금액 원 정수(`*_krw`, `krw`) · 수량 주 · 비율 소수 0~1(`*share*`, `*_ret`, `max_rate`) — export 에는 bp 가 없다(bp 는 85·저널 전용). 결측 `null`(NaN 도 null).
- `date` 는 `"YYYYMMDD"` 문자열이다. `facts.values` 는 문자열이 아니라 **객체**(→ jsonb). `created_at`(실행 시각)은 어느 표에도 없다.
- 같은 입력이면 같은 바이트다(gzip mtime 0) — manifest sha256 이 멱등.

**표 6개 — 열 = `export.py` 실제 출력(DuckDB 타입 → 제안 Postgres 타입)**

| 파일 → 제안 Supabase 표 | PK | 열(순서대로) |
|---|---|---|
| `entries` → `limitup_entries` (35열) | (date, isin) | date text · isin text · short_code text · name text · base_px bigint · upper_px bigint · list_shares bigint · mcap_krw bigint · sec_group text · max_rate double · t15_ms bigint · t20_ms bigint · t25_ms bigint · detect_rate_pct int · reached bool · first_upper_ms bigint · entry_from_ms bigint · wall_krw_before bigint · wall_truncated_before bool · wall_clear_s double · max_burst_krw bigint · max_burst_ms bigint · max_burst_pieces int · entry_buy_member1 text · entry_buy_share1 double · entry_buy_member2 text · entry_buy_share2 double · entry_buy_member3 text · entry_buy_share3 double · close_px bigint · close_ret double · d1_date text · d1_open bigint · d1_ret double · schema_version int |
| `locks` → `limitup_locks` (22열, `LOCKS_EXPORT_COLS`) | (date, isin, lock_id) | date · isin · lock_id int · exchange text · board text · short_code · name · upper_px bigint · close_px bigint · close_ret double · start_ms bigint · end_ms bigint(잠김이 장 끝까지면 null 가능) · dur_s double · broke bool · outcome text · break_px bigint · q0 bigint · d1_date text · d1_open bigint · d1_ret double · data_end text(KST `HH:MM:SS.ffffff`) · schema_version int |
| `jumps` → `limitup_jumps` (17열) | (date, isin, jump_no) | date · isin · jump_no int · t_ms bigint · kind text(`new`·`cancel`·`auction_fill`·`burst_buy`·`burst_sell`·`wall_eat`) · qty bigint · krw bigint · px bigint · pieces int · span_ms double · q_before bigint · q_after bigint · wall_before bigint · wall_after bigint · lock_state smallint · minute int · schema_version int |
| `member_alloc` → `limitup_member_alloc` (16열) | (date, isin, sweep_no, side, member) | date · isin · sweep_no int · side text · member text · name text · foreign bool(Postgres 예약어 — 따옴표 필요) · start_ms bigint · end_ms bigint · span_s double · d_qty bigint · d_value bigint · share double · trades_in_span int · qty_in_span bigint · schema_version int |
| `facts` → `limitup_facts` (10열) | (date, isin, event_no, fact_no) | date · isin · event_no int(0 = 진입 구간, ≥1 = lock_id) · fact_no int · t_ms bigint · template_id text · text text(**완성 문장**) · values **jsonb**(근거 수치 키 — 템플릿 id 와 값 키가 곧 근거, `_ns` 키도 `_ms` 로 바뀌어 있다) · source text(`실측`/`추정(분 단위)`/`모형`) · schema_version int |
| `touches` → `limitup_touches` (14열) | (date, isin, touch_id) | date · isin · touch_id int · first_trade text · first_recv text · first_qty bigint · last_trade text · n_trades int · qty_at_upper bigint · next_px bigint · first_ms bigint · last_ms bigint · next_ms bigint · schema_version int (`*_trade`/`first_recv` 는 KST `HH:MM:SS.ffffff` 문자열) |

- gh-radar `limit_up_events(code, date)` 와의 조인 키는 `short_code`(6자리) + `date`(형식 변환 `YYYYMMDD` ↔ 그쪽 형식).
- RESEARCH 초안에 있던 `entry_buy_top:[…]`·locks `q_max_qty/q_max_krw`·jumps `lock_id` 는 **만들지 않았다** — 위 표가 실제 열이다(진입 창구는 `entry_buy_member1~3`/`entry_buy_share1~3`).
- `d1_date`·`d1_open`·`d1_ret`(다음 날 시가 결과)는 D 의 첫 export 에서는 null 이고, **다음 밤 배치가 D+1 보충을 채운 뒤 D 의 export 를 다시 쓴다**(gh-trade quick-261005-f74, 2026-10-05 — 그 날짜 manifest sha256 이 바뀐다). 적재기는 manifest 가 바뀐 날짜를 재적재해야 「어제 결과」 가 채워진다.

**격자 `grid/<isin>.json.gz` — Storage 비공개 버킷 `limitup-grid` 제안, 객체 경로 `grid/<date>/<isin>.json.gz`**

```json
{"schema_version": 1, "date": "20261002", "isin": "KR7…", "label_n": 60,
 "coarse": {"step_s": 10, "sec": [32400, 32410, …], "cols": {"t_ms": […], "last_px": […], …}},
 "fine":   {"margin_s": 300, "windows": [{"from_sec": 34500, "to_sec": 41000, "sec": [34500, 34501, …], "cols": {…}}]}}
```

- `sec` = 그날 00:00 KST 기준 초, 범위 [32400, 55800)(09:00~15:30). coarse = `sec % step_s == 0` 인 초(10초 → 하루 2,340점), fine = 사건 구간 1초 원본 창 0~1개
  (시작 = 임계 도달 − margin, 끝 = 마지막 잠김 끝 + margin · 잠김 없이 도달이면 첫 상한 + margin · 미도달이면 임계 도달 + 10분).
- `cols` 키 24개(두 해상도 같음): `t_ms · last_px · rate(소수) · q_qty · q_krw · wall_krw_visible · wall_qty_hidden · wall_truncated · ask1_px · ask1_qty · bid1_px · sell_led_10s · buy_led_10s · cancel_10s · new_10s · auction_fill_10s · drain_s(소수 초, null = ∞) · lock_state · lock_id · lock_elapsed_s(소수 초) · auction · break_within_n · reach_within_n · label_n`.
  마지막 셋은 **사후 라벨**(앞으로 `label_n`초 안 깨짐/도달) — 웹이 음영으로 그릴 수 있다(실시간에는 없다).
- server 가 사용자 인증 뒤 `supabase.storage.from('limitup-grid').createSignedUrl(path, expiresIn)` 으로 단기 서명 URL 을 내준다(버킷 공개 금지).
- 실측 크기(20261002): 29파일 합계 약 2.5MB, 가장 큰 파일 약 376KB(gzip). 4일 export 전체 15MB.

**`manifest.json`** — `{schema_version, date, finished_at(119 로컬 시각 ISO, 시간대 표기 없음 = KST), files:[{name, rows, sha256}], detect_rate_pct, label_horizon_s, grid_coarse_s, fine_margin_min}`.
`rows` 는 ndjson 행 수, grid 는 점 수(coarse + fine). 탐지 종목 0 인 날도 빈 표 6개 + manifest(행 수 0)가 온다 — 「행 없는 날」 을 알 수 있다.
실데이터 예(20261002): entries 29 · locks 12 · jumps 9,231 · member_alloc 62,209 · facts 169 · touches 31 · grid 29파일.

**멱등·완료 규칙:** 119 는 `<D>.tmp/` 에 전부 쓰고 manifest 를 `.part` → rename 으로 놓은 뒤 기존 `<D>` 를 지우고 `<D>.tmp` → `<D>` 로 rename 한다.
종목 실패가 1개라도 있으면 그날 디렉터리를 만들지 않는다. `--force` 재처리도 같은 경로 — 같은 날짜가 **다시 바뀔 수 있다**(행이 줄 수도 있다).

## gh-radar 가 할 일

1. **relay 생성물 재동기화 — 필요.** master fbs(`68679e9a`)에 Phase 28(41/42/43/84)과 Phase 27(85·kind 15)이 함께 있다. 동기화는 **gh-trade 사용자가 병합된 master 에서** 실행한다(worktree 의 미병합 fbs 금지):
   `cd /Users/alex/repos/gh-trade/server && RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh --check` → 반영은 `--check` 없이.
   gh-radar 생성물에 SYNC MARKER `26b3493e` 이후 master 에 없는 미병합 변경이 있으면 두 fbs 를 합쳐 `FBS=<병합 fbs 경로> RELAY=… ./scripts/sync-relay-schema.sh`. 그 뒤 gh-radar 저장소에서 커밋.
2. **relay 85 처리 — 선택.** 85 를 웹에 실시간으로 보일 계획이면 FULL 구독 키의 85 를 중계(1초·키당 1프레임, Broadcast 라 드롭 허용). 계획이 없으면 무시하되 **warn 로그를 키·초마다 남기지 않게**(아래 질문 4).
3. **kind 15 저장·조립기.** `dma_strategy_events` 에 kind 15 가 그대로 쌓인다(분당·키당 1행, 계좌 없음). 문장 조립기에 kind 15 분기 — 위 슬롯 매핑표대로 85 필드 이름으로 되돌려 쓴다. `message` 파싱: `;` 로 buy/sell, `,` 로 회원, `=` 뒤 bp, `|m=` 뒤 model_state.
4. **Supabase 마이그레이션(DB 먼저).** 표 6개 `limitup_entries` · `limitup_locks` · `limitup_jumps` · `limitup_member_alloc` · `limitup_facts`(`values jsonb`) · `limitup_touches` — 열 = 위 표(export ndjson 키 그대로), PK = 위 표.
   Storage 비공개 버킷 `limitup-grid`(객체 `grid/<date>/<isin>.json.gz`, Content-Type `application/json` + `Content-Encoding: gzip` 또는 받는 쪽에서 해제 — gh-radar 판단).
5. **radar-gw pull 타이머.**
   - 키: radar-gw 에서 ed25519 키 1개 생성 → **공개키를 gh-trade 사용자에게 전달**. 119 등록은 gh-trade 사용자가 한다(rrsync 는 119 `/usr/local/bin/rrsync` 에 이미 설치됨, 키 등록만 보류 중). 등록 줄(119 `~smok95/.ssh/authorized_keys`):
     `restrict,command="/usr/local/bin/rrsync -ro /home/smok95/ticks/export" ssh-ed25519 AAAA… radar-gw-pull`
   - 도달: **radar-gw → 119:22 는 2026-10-05 열려 있음을 확인했다**(radar-gw 에서 `/dev/tcp/10.16.207.119/22`, gh-trade 오케스트레이터 확인).
   - 타이머: 매일(평일) **21:00 KST** 권장 — 119 배치는 20:30 시작, 실측 하루 약 1.5~2.5분. 명령: `rsync -az --delete --exclude='*.tmp' smok95@10.16.207.119:/ <local>/export/`(rrsync 가 `~/ticks/export` 를 `/` 로 보인다. `*.tmp` 는 쓰는 중인 날짜 디렉터리 — 받지 않는다).
   - 적재 규칙: `<D>/manifest.json` 이 있는 날짜만 · `schema_version` 이 아는 값이 아니면 그 날짜를 건너뛰고 로그 · 파일마다 sha256 을 manifest 와 대조(불일치면 그 날짜 건너뜀) · 이미 적재한 날짜는 manifest sha256 이 바뀌었을 때만 다시(재처리) — **날짜 단위 교체**(그 날짜 행 삭제 후 삽입, 재처리로 행이 줄 수 있어 upsert 만으로는 남는다).
   - 예정(이 계약 밖, 미착수): 원본 pcap.zst 를 같은 radar-gw pull 경로로 GCS(서울, Archive 클래스)에 보관할 계획이 있다(2026-10-05 사용자 결정) — radar-gw 가 나중에 트래픽을 더 나르게 된다.
6. **웹 페이지.** B 하루 격자 · A 사건 카드 · C 창구 지문 · 어제 결과(보고서 목업 구성) — **시각 규칙(SVG·막대·음영)은 gh-radar 가 정한다.** 사실 문장은 `facts.text` 완성 문자열을 그대로, 근거 수치는 `values` 키로. 출처 표기(`source`: 실측/추정(분 단위)/모형)를 화면에 유지해 달라.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **예.** 85 는 옛 relay 가 모르는 MsgType 으로 버리고(84 와 같은 처리 — Phase 28 노트), kind 15 는 저널 포맷 무변경이라 숫자 그대로 저장된다(질문 3 으로 확인 요청). export 파일은 119 에 이미 있고 radar-gw pull 은 gh-radar 가 켤 때 시작한다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

- **Phase 28 노트(`261004-auto-sell-wire.md`, open)와의 선후:** 둘 다 같은 master fbs blob `68679e9a` 를 쓴다 — **동기화는 한 번**이면 둘 다 실린다. 28 을 먼저 처리하면 그때 85·kind 15 생성물도 같이 들어오므로 이 노트는 relay 85·kind 15 조립기·Supabase·radar-gw 만 남는다. 생성물 순서 충돌은 없다(28 이 먼저 master 에 병합됐고 27 은 그 뒤 말미 append).
- relay 스키마 동기화는 gh-trade 사용자가 **병합 뒤 master fbs** 로 실행한다 — 이 노트를 쓴 세션은 실행하지 않았다(미병합 생성물을 지운 전례).
- Supabase 표·버킷(DB) → radar-gw 타이머 → webapp 순. 119 의 radar-gw 키 등록(gh-trade 사용자)은 타이머 첫 실행 전.

## 확인 방법

- relay: 85 를 무시하는 동안 `msg_type 85` 처리 에러 0(warn 만이면 무해) — 85 를 중계하면 FULL 구독 키에서 1초 간격 수신.
- `dma_strategy_events` 에 kind 15 행이 장중 분당(대상 키마다) 쌓인다 — 확률 미승격 동안 `result_code = -1`, `message` 끝이 `|m=0`, `snap_qty` 길이 0. (서버 Phase 27 배포 뒤)
- radar-gw dry-run: `rsync -avz --dry-run smok95@10.16.207.119:/ ./export-test/` 가 `20260929/ … 20261002/ …` 를 보인다(키 등록 뒤).
- 적재 뒤: `limitup_entries` 의 날짜별 행 수 == 그 날짜 manifest `files[name=entries.ndjson.gz].rows`(예 20261002 = 29), 다른 표도 같은 대조. 4일 합 entries 99 · locks 39 · jumps 40,626 · member_alloc 253,247 · facts 542 · touches 216.
- 격자: 서명 URL 로 받은 gzip JSON 의 `coarse.sec` 길이 2,340(10초), `cols` 키 24개.

## 질문

1. **grid 객체 한도·형식** — 종목당 gzip 최대 약 376KB·하루 약 2.5MB(4일 실측)다. Storage 객체·서명 URL 응답에 상한이 있는가? 잠김이 장 끝까지 가면 fine 창이 하루 대부분이 되어 커진다(최대치는 27-17 UAT 뒤 이 노트에 추기).
2. **보존 기간** — Supabase 표·Storage 격자를 얼마나 둘 것인가? 119 원본은 90일, export 디렉터리는 지우지 않는다(`--delete` 미러면 119 쪽이 기준).
3. **kind 15 저장 경로** — 옛 relay 가 모르는 kind 값(15)을 거르지 않고 `dma_strategy_events` 에 숫자 그대로 넣는가? 계좌 없는 행(시세 이벤트 1/2/10 과 같은 모양)을 RPC `dma_strategy_events_for_user` 가 어떻게 다루는지도. 하루 수천~1만 행이 늘어나는데 보존·인덱스 정책이 필요한가?
4. **85 수신 로그** — relay quote 연결이 FULL 구독하는 키가 있으면 85 가 키당 1초마다 온다. 옛 relay 의 unknown MsgType warn 이 프레임마다 찍히면 로그가 커진다 — 레벨·샘플링 확인 부탁.
5. **`facts.values` jsonb 인덱스** — 웹이 근거 키로 검색·필터할 계획이 있으면 GIN 인덱스가 필요한가? 없으면 행 표시용으로만 쓴다.

## gh-radar 답 — 2026-10-05 (Phase 28 discuss, `.planning/phases/28-limitup-feature-ingest/28-CONTEXT.md`)

1. **grid 객체 한도·형식** — 문제 없음. Supabase Storage 객체 상한(기본 50MB)·서명 URL 응답 상한 모두 종목당 최대 376KB·하루 2.5MB 와 자릿수가 다르다. fine 창이 하루 전체(23,400초 × 24열)가 돼도 gzip 수 MB 수준. 형식은 보낸 그대로(`grid/<date>/<isin>.json.gz`) 받는다. 27-17 UAT 뒤 최대치 추기는 참고로만 받겠다.
2. **보존 기간** — Supabase 표 6개 · Storage 격자 **전부 90일**(119 원본과 같은 창). radar-gw 로컬은 `--delete` 미러, GCS 사본(`gs://gh-radar-limitup-export`, 적재 워커 입력)은 지우지 않아 재적재 가능. export 디렉터리를 119 가 지우지 않는 것은 그대로 둬도 된다.
3. **kind 15 저장 경로** — 옛 relay 도 kind 값을 거르지 않고 숫자 그대로 `dma_strategy_events` 에 넣는다(`kind` CHECK 없음 · 저널 포맷 무변경). 다만 현재 조회 RPC `dma_strategy_events_for_user` 는 `kind NOT IN (1,2,10)` 을 계좌 조인으로 보내므로 계좌 없는 15 는 **아무에게도 안 보인 채 적재**된다 — Phase 28 이 시세 집합을 `(1,2,10,15)` 로 재정의해 게이트웨이 매핑 사용자 전원 가시로 바꾼다(relay 라이브 푸시도 같은 판정). 보존은 kind 15 만 `trade_date` 기준 30일 뒤 삭제(주문·시세 1/2/10 은 감사 기록으로 유지). 인덱스는 기존 `(trade_date, gateway, account_no)` 로 조회 충분.
4. **85 수신 로그** — gh-radar Phase 27 이 85 를 `OUT_OF_SCOPE_INBOUND_MSG_TYPES` 에 넣어 **debug 레벨 드롭**(warn 아님)이다. Phase 28 이 85 를 INBOUND 로 올려 FULL 구독 브라우저에 중계하면 드롭 자체가 없다. 서버 Phase 27 선배포는 안전하다(둘 다 경로에서 warn 폭주 없음).
5. **`facts.values` GIN** — 없음. 웹은 근거 키로 검색·필터하지 않고 행 표시용(`facts.text` + `values` 강조)으로만 쓴다.

**gh-radar 쪽 설계 요약(참고):** 85 → 작업대 상따 카드 새 탭 「상한가」(WinForms 3줄 9칸 동형, 자동 전환 없음, 탭 제목 「상한가 · 잠김 43초」) · kind 15 → 주문로그 「상한가 특징」 체크(기본 숨김) · export → radar-gw 타이머(평일 21:00 rsync + GCS 업로드만) → Cloud Run Job `limitup-sync`(21:20, manifest sha256 대조 · 날짜 단위 교체) → `/analytics/limitup` 보고서(최상위 「분석」 메뉴, DMA 사용자만, D-20 구성 한 페이지). **radar-gw 공개키는 생성 후 이 노트에 추기해 전달한다**(119 등록 전까지 타이머 disabled).
