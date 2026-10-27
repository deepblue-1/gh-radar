# Phase 35 — gh-trade 핸드오프 노트 본문 초안 (`launch-gate-contract`)

> 메인 세션이 `scripts/trade-handoff.sh launch-gate-contract` 로 만든 gh-trade 노트의 빈 칸(템플릿 안내 문구)을 아래 다섯 절로 바꾼다(프런트매터는 스크립트가 채운다).
>
> 근거: 35-CONTEXT D-02 · D-03 · D-07 · D-08 · D-21 · D-22 · 35-RESEARCH 「gh-trade 핸드오프 (Q8)」 · Pitfall 1 · 3 · Assumptions A1 · A2 · A5. 상의 노트 `docs/inbox/from-gh-trade/261027-launch-gate-admin.md`(gh-radar 저장소)의 회신과 짝이다.

---

## 요청 내용

상의 노트 「발사 경계 지도 웹 어드민」(gh-trade → gh-radar · 2026-10-27)에 대한 gh-radar 의 요청 두 가지다. 채널 A(관찰자 저널 kind 17 `LaunchPiece` · kind 18 `LaunchHead`)로 확정했다. gh-radar 는 표 · RPC · 어드민 화면 · 1회 적재 스크립트를 정식 인계 노트를 기다리지 않고 먼저 만들고, kind 17·18 해석 함수만 정식 인계 노트의 칸 매핑 표가 오면 채운다.

### (가) 백필 ndjson — 지금 바로 (정식 인계 노트를 기다리지 않음)

gh-radar DB 가 발사 이력의 유일한 저장소가 되므로(서버는 하루치만 남음) **로그에 남은 전부** 를 한 번 넘겨 달라.

- **서버:** 두 서버 모두 — KB 120(`KB120` · 사내망 로그 포함 — gh-trade 가 뽑아 달라) · 교보 119(`KYOBO119`).
- **기간:** 로그가 남은 가장 이른 날부터 가장 최근 거래일까지.
- **발사:** 16:00 Q16 예약 발사(KRX) + 09:00:27 KRX(A 매수) + 09:00:30 NXT(N 매수 · A 매도) — 세 발사 기준 전부.
- **형식:** ndjson, **한 줄 = 조각 1건**, 풀린 필드명 키. 키 이름은 gh-radar 표 `launch_pieces` 열 이름과 같게 맞췄다(`user` → `dma_user_id` 만 다름) — gh-radar 적재 스크립트가 그대로 읽는다.

| 키 | 값 | 비고 |
|---|---|---|
| `date` | `YYYY-MM-DD` | 거래일(KST) |
| `gateway` | `KB120` · `KYOBO119` | 서버 |
| `profile` | `Q16` · `N` · `A` | |
| `fire_exchange` | `KRX` · `NXT` | **발사 거래소** — A 는 다리마다 다르다(09:00:27 KRX 매수 · 09:00:30 NXT 매도) |
| `fire_base` | `16:00:00` · `09:00:27` · `09:00:30` | **발사 기준시각** — `sent_rel_us` 의 0 점 |
| `market` | `K` · `Q` | K = 코스피 · Q = 코스닥 레인 |
| `wire` | 정수 | 시장 송신 순번 |
| `queued_id` | 문자열 | Q16 = 예약 id(`Q153015001` 꼴) · N·A = 판정 key |
| `piece_idx` | 정수 | 로그 `j=` · `idx=` |
| `round` | `0` · `1` · `2` | 송신 지연 0 / +10 / +30µs |
| `probe` | `0` · `1` | 로그 `probe=`(없으면 null) |
| `order_no` | 문자열 | 로그 `ordno=` |
| `sent_rel_us` | 정수(µs) | 첫 발 송신 − 발사 기준시각 |
| `result` | `접수` · `101` · `515` · `기타` · `무응답` | 로그 원문 그대로 |
| `result_code` | 정수 · 문자열 | 거래소 응답 코드 |
| `accept_time` | `HHMMSSmmm` 숫자 그대로 | 거부면 도착 ms |
| `retry` | 정수 | 재전송 횟수(515 즉시 3회 재전송 포함) |
| `abandoned` | `0` · `1` | |
| `side` | `buy` · `sell` | **뽑을 수 있으면** — 특히 09:00:30 |
| `isin` | 문자열 | 뽑을 수 있으면 |
| `price` | 정수 | 뽑을 수 있으면 |
| `qty` | 정수 | 뽑을 수 있으면 |
| `filled_qty` | 정수 | 뽑을 수 있으면 |
| `account` | 문자열 | 뽑을 수 있으면 — 마스킹 없이 그대로(어드민 전용) |
| `user` | 문자열 | 뽑을 수 있으면 — DMA 사용자 |

- **없는 값:** 키를 빼거나 `null`. gh-radar 는 주문 속성 열을 전부 null 허용으로 만들었고 화면은 「—」 로 그린다.
- **09:00:30 의 side:** 로그(또는 예약 저장소 스냅샷)에서 뽑을 수 있으면 꼭 넣어 달라. 09:00:30 지도는 N 매수와 A 매도를 한 지도에 합쳐 원(매수) · 마름모(매도)로 가른다. 못 뽑으면 그 날 지도는 전부 원으로 그린다(범례 「구분 없음」).
- **전달:** gh-radar 인박스 첨부 디렉터리(`docs/inbox/from-gh-trade/<YYMMDD>-<slug>-attach/`)에 파일로 두고 노트에 경로를 적어 달라. 서버별 · 날짜별로 파일을 나눠도 된다(적재 스크립트가 `--file` 을 여러 개 받는다).
- 상의 노트 첨부 `pieces.json` 196행(10/12~10/26 16:00)은 gh-radar 가 이미 1차 적재 입력이자 자동 대조 기준으로 쓴다 — 전체분이 오면 같은 키로 덮인다(멱등).

### (나) 정식 인계 노트의 kind 17·18 칸 매핑 요구

정식 인계 노트(칸 매핑 표)에 아래 「gh-trade 가 할 일」 ②③ 의 값이 전부 실리게 해 달라. 특히 kind 17 의 **발사 기준(`fire_exchange` + `fire_base`)과 `side`** 는 빠지면 09:00:30 지도에서 매수/매도를 가를 수 없고 서버 재배포가 필요해진다.

## gh-trade 가 할 일

1. **백필 ndjson 추출 · 전달** — 위 (가) 형식. 두 서버 · 로그 전부 · 세 발사 기준.
2. **kind 17 `LaunchPiece` 칸 매핑** — 위 조각 키 전부를 `StrategyEvent` 칸에 싣는다: 발사 기준(거래소 `fire_exchange` + 기준시각 `fire_base`) · `side` · `profile` · `market` · `wire` · `queued_id`(판정 key) · `piece_idx` · `round` · `probe` · `order_no` · `sent_rel_us` · `result` · `result_code` · `accept_time` · `retry` · `abandoned` · `isin` · `price` · `qty` · `filled_qty` · `account` · `user`.
   - **발사 기준(`fire_exchange` + `fire_base`)과 `side` 는 필수다.** A 의 09:00:30 NXT 매도 조각을 N 매수 조각과 같은 「09:00:30 NXT 발사」 지도에 합쳐 원/마름모로 가르는 데 쓰고, A 의 09:00:27 KRX 매수 다리와도 이것으로 구별한다.
3. **kind 18 `LaunchHead` 칸 매핑** — 발사 1회(날짜 · 서버 · 프로파일 · 발사 기준 · 시장)마다 1건:
   - **`next_offset_us`** — 다음 발사 첫 조각의 rel 목표(µs). **계산값으로 직접 실어 달라.** Q16 의 다음 오프셋은 `correction_after` 그 자체가 아니다 — gh-trade 문서상 보정치는 편도 기준 위의 값이고(`docs/features/queued-order.md:223`) 발사 오프셋 = 보정치 − 편도다(같은 파일 :154 실서버 대입 `Q {-151, 6, 201, …}` → 반전 step 5 → −146 − 201 = **−347µs**). 지도의 「다음 첫 조각」 선을 `correction_after` 로 그리면 편도(≈200µs)만큼 어긋난다. N 은 고정값(119 −200µs · 120 −245µs)을 그대로.
   - `offset_used_us` · `fire_at`(실제 첫 송신 시각) · `gate_lo_us` · `gate_hi_us` · `nonmono` · `n_pieces` · `n_accepted` · `n_101`(N 은 `n_515`) · `n_other` · `first_accept_idx`(시장 송신순) · `retries` · `abandoned`.
   - Q16 학습값: `correction_before_us` · `correction_after_us` · `step_us` · `last_dir` · `bracketed` · `same_dir_run` · `reject_span_us` · `jump` · `one_way_us` · `rtt_min_us`.
   - `next_offset_us` 를 kind 18 에 못 싣는 사정이 있으면 노트에 적어 달라 — 그 경우 gh-radar 해석 함수가 `correction_after_us − one_way_us` 로 채운다(공식이 맞는지 확인 부탁).
4. **fbs 는 enum · 주석만**(와이어 구조 무변경) — kind 17 `LaunchPiece` · 18 `LaunchHead` enum 값과 칸 재해석 주석. gh-radar 사본은 `sync-relay-schema.sh` 로 갱신해 달라(gh-trade 소유 스크립트).
5. **정식 인계 노트를 gh-radar 인박스(`docs/inbox/from-gh-trade/`)에 쓴다** — 칸 매핑 표(kind 17 · 18 각 칸 → 필드 · 단위 · null 표현) + 아래 「질문」 답.

## 배포 순서 제약

gh-radar 먼저 배포가 안전한가: 예 — 그리고 **gh-trade 서버를 먼저 배포해도 안전하다.** relay 는 kind 를 해석하지 않고 `StrategyEvent` 43칸 원문을 그대로 `dma_strategy_events` 에 적재하고(모르는 kind 도 원문 적재), gh-radar DB 의 해석 함수는 정식 노트 매핑 전에는 아무것도 하지 않는다(no-op — 그동안 원문만 쌓임). 매핑을 적용한 뒤 쌓인 원문을 한 번에 다시 푼다(`launch_reproject`). kind 17·18 은 사용자 전략 이벤트 경로(주문로그 타임라인 · ws)에 나가지 않게 gh-radar DB 가 막는다. relay 재배포는 없다(fbs enum · 주석 sync 만).

gh-trade 는 cloud-verify.sh 게이트 뒤 deploy.sh <broker> <env> 로 KB 120·121·교보 119 를 장 마감 뒤 배포한다.

gh-radar 쪽 순서: DB 마이그레이션(표 · RPC · 해석 함수 자리 · 사용자 경로 제외) → 백필 적재 → server → webapp push(= 프로덕션). 정식 노트가 오면 해석 함수 매핑 마이그레이션 → `launch_reproject` → 라이브 확인.

## 확인 방법

- **백필:** gh-radar 가 받은 ndjson 으로 dry-run 집계(날짜 · 서버 · 발사 기준 · 시장별 조각 수 · 계산한 머리 수 · 파싱 실패 줄)를 이 노트 또는 gh-trade 인박스 회신으로 돌려준다. 첨부 `pieces.json` 196행과 겹치는 10/12~10/26 16:00 은 자동 대조(행 수 · rel · 결과 일치).
- **라이브:** 첫 실물 날짜에 ① 16:00:01 이후 · 09:00:31 이후 relay 로그에 kind 17·18 적재 건수 ② gh-radar `launch_pieces` · `launch_heads` 당일 행 ③ 어드민 「발사」 주문 내역 당일 행 ④ 경계 지도 「다음 첫 조각」 선이 kind 18 `next_offset_us` 값으로 바뀜. 프로덕션 수동 주입은 하지 않는다.

## 질문

1. **A 두 다리의 `wire`** 는 다리마다 0 부터인가(09:00:27 KRX 매수 0.. · 09:00:30 NXT 매도 0..), 아니면 프로파일 안에서 한 줄 순번인가? gh-radar 논리 키는 `launch_pieces (trade_date, gateway, profile, fire_exchange, market, wire)` · `launch_heads (trade_date, gateway, profile, fire_exchange, market)` 로 발사 거래소를 포함하므로 어느 쪽이든 충돌하지 않는다 — 실제가 어느 쪽인지만 알려 달라.
2. **A 머리(kind 18)** 는 다리별 2행(KRX 매수 · NXT 매도)인가, 1행인가? 1행이면 어느 다리의 값인지(발사 기준 칸에 무엇이 실리는지) 적어 달라. gh-radar 키는 다리별 2행을 받을 수 있다.
3. **같은 조각 재송신** 때 `seq` · `journal_epoch` · `gw_time_ms` 는 어떻게 되는가? gh-radar 는 같은 논리 키에 대해 같은 epoch 면 큰 `seq` 가, 다른 epoch 면 **새로 온 쪽이** 이기게 만든다(relay 는 epoch 가 바뀌면 새 epoch 부터만 받는다). 서버 재기동 뒤 옛 epoch 로 재송신하는 경우가 있으면 알려 달라.
4. **kind 18 은 그 발사의 조각(kind 17)들 뒤에 오는가?** gh-radar 는 도착 순서와 무관하게(두 표 독립 upsert · 한 배치에 섞여도 한 트랜잭션) 설계했으므로 순서 보장은 필요 없다 — 실제 순서만 확인한다.
5. **계좌 · DMA 사용자** 를 기존 `account_no` · `dma_user_id` 칸에 그대로 실어도 된다. gh-radar 가 kind 17·18 을 사용자 경로(전략 이벤트 json 래퍼 · 주문 펼침 타임라인 · ws fan-out)에서 빼므로 다른 칸으로 우회할 필요가 없다.
