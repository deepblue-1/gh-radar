---
status: open
from: gh-trade
from_commit: 2e090eb9
from_branch: worktree-agent-abfa984d3350e0480
date: 2026-10-28
fbs_sync_marker: f156cb6f
done_commit:
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-28

> gh-trade Phase 43(발사 계획 어드민 + 발사 기록 저널)의 정식 인계 노트다. 이 노트 하나가 답하는 요청 두 건:
> ① gh-radar → gh-trade `261027-launch-gate-contract.md`(kind 17·18 칸 매핑 + 질문 5) ② `261027-launch-plan-admin-reply.md`(목업 승인 회신 ⓐ~ⓔ + 질문 2).
> 아래 매핑 표의 정본은 gh-trade `server/src/trade/queued/LaunchJournal.h` 머리 주석이고, 이 노트의 표는 그 주석을 한 칸도 바꾸지 않고 옮긴 것이다.
> 와이어 정본은 gh-trade `server/docs/protocol.md` 44/86/94 행 · `server/src/protocol/StockDMA.fbs` 주석이다.
> 커밋 근거: 43-04 와이어 `f156cb6f`·op 8/9 핸들러 `4d00078a` · 43-05 kind 17/18 push `7736949c` (from_commit 은 이 노트를 만든 worktree 커밋 — master 병합 뒤 같은 내용).

## 바뀐 것

### ⓐ 와이어 — 전부 append (기존 번호·슬롯·AdminCode 무변경)

| 무엇 | 번호·슬롯 | 내용 |
|------|-----------|------|
| `AdminCommandReq`(44) 말미 3필드 | vtable 20 · 22 · 24 | `launch_profile: string`("Q16" \| "N") · `launch_market: string`("K" \| "Q") · `launch_offsets_us: [int]`(µs — 기준 16:00:00.000000 / 09:00:30.000000, 음수 = 앞당김) |
| 44 `op` 새 값 | 8 · 9 | **8 SetLaunchPlan**(한 칸 = profile × market 하나를 저장) · **9 GetLaunchPlan**(전체 조회 — 세 필드를 읽지 않는다) |
| 새 MsgType | **94 `LaunchPlanSnapshot`** | S→C, **Notice**, 요청 연결(admin)에만. Envelope 말미 슬롯 `launch_plan_snapshot` = **vtable 112** |
| 새 테이블 `LaunchPlanSnapshot` | vtable 4 · 6 · 8 · 10 | `request_id: ulong`(44 에코) · `plan_rev: ulong` · `updated_at: string` · `entries: [LaunchPlanEntry]` |
| 새 테이블 `LaunchPlanEntry` | vtable 4 · 6 · 8 | `profile: string` · `market: string` · `offsets_us: [int]` |
| `StrategyEventKind` 새 값 | 17 · 18 | **17 LaunchPiece** · **18 LaunchHead** — 관찰자 저널 80 `strategy_events` 전용(82·81 없음) |
| `AdminCode` | 무변경 | 새 code 없음 — 0/1/10/11 재사용 |

relay 생성물은 이 세션이 `sync-relay-schema.sh` 로 반영해 두었다(SYNC MARKER `server-repo-commit: 7824e51b → f156cb6f`, 미커밋 — 아래 「gh-radar 가 할 일」 1). Phase 42 필드(`n_kospi` 등)도 이 마커에 함께 들어 있다(gh-trade master 에 42 가 먼저 병합됨).

### ⓑ ① kind 17·18 칸 매핑 표 (정본 = `LaunchJournal.h` 머리 주석)

공통 — `profile`(`cond_metric`): 1 Q16 · 2 A · 3 N
`fire_base`(`expected_cum`): 발사 기준 초의 KST HHMMSSmmm 정수 — `160000000` · `090027000` · `090030000`
`market`(`ev_kind`): 시장 문자 'K'(75) · 'Q'(81)
`exchange`: 'K' → "KRX" · 'N' → "NXT" (기록 스레드가 문자열화) — 이것이 `fire_exchange` 다
`gateway` 칸은 없다 — relay 가 연결(서버)로 안다.

#### kind 17 LaunchPiece — 조각 1건 (wire 에 나간 조각만, ordNum ≠ 0)

| gh-radar 키 | StrategyEvent 칸 | 값·단위 | null |
|-----------------|--------------------|---------------------------------------------------------------------|------------|
| date | trade_date | KST (gw_time_ms 에서 기록 스레드가 유도) | — |
| gw_time_ms | gw_time_ms | 첫 발 송신 epoch ms | — |
| profile | cond_metric | 1 Q16 · 2 A · 3 N | — |
| fire_exchange | exchange | "KRX" / "NXT" (조각 요청의 거래소) | — |
| fire_base | expected_cum | HHMMSSmmm (160000000 · 090027000 · 090030000) | — |
| market | ev_kind | 'K'=75 · 'Q'=81 | — |
| wire | entry_round | 시장 송신 순번 0부터 (ordNum≠0 조각만 — `[Launch] 조각 wire=` 와 같은 축) | — |
| queued_id | message `q=` | Q16 = 예약 Q-ID 10자 · A/N = 판정 key 문자 "A"/"N" | — |
| piece_idx | ev_qty_before | Q16 = 예약 안 조각 index j(탐침 포함) · A/N = 공급자 index | — |
| round | ev_price | Q16 실조각 r(0부터) · 탐침 −1 · A/N 0 | −1 = 탐침 |
| probe | has_remaining | true/false | — |
| order_no | order_no | 마지막 주문번호(재전송이면 새 번호) | "" |
| root_ord_num | base_cum | 첫 발 주문번호(숫자) | 0 |
| sent_rel_us | cond_threshold | 첫 발 송신 − 발사 기준 µs (음수 = 기준 앞) | — |
| planned_us | error_volume | 이 조각의 계획 시각 µs(Q16 목록[r] · 탐침 목록[0] · A 고정 · N 계획 n) | — |
| offset_used_us | remaining_volume | 그 회차 첫 조각 오프셋 µs | — |
| result | queue_case | 1 접수 · 2 재전송대상 거부(101/515) · 3 기타 거부 · 4 무응답 | — |
| result_code | result_code | 정수 — 101 · 515 · KRX 숫자 · −1000(브로커 자체 거부) | 0 |
| (rc 원문) | message `rc=` | 거부코드 원문 4자 — F083 · E124 · E127 · 0101 · 0515 | 빈 값 |
| (res 문구) | message `res=` | 접수 · 101 · 기타 · 무응답 (로그 `[Launch] 조각 result=` 원문 — N 의 515 도 「101」, 공용 표기) | — |
| accept_time | cond_actual | 거래소 접수시각 HHMMSSmmm(마지막 번호의 것) | 0 |
| retry | ev_qty_after | 재전송 횟수 | — |
| abandoned | cancel_reason | 0/1 (재전송 포기·폴링 뒤에도 재전송대상 거부) | — |
| side | order_condition | "B" / "S" | — |
| isin | isin | 12자 | — |
| price · qty | price · qty | 원 · 주(조각 수량) | — |
| account | account_no | NormalizeAccountNo (마스킹 없음) | — |
| user | dma_user_id | termId → 기록 스레드 해석 | — |
| filled_qty | ev_trade_qty | **0 고정(모름)** — gh-radar 가 order_no 로 주문 저널 체결과 join | 0 = 모름 |
| (나머지) | group·cum_volume·limit_bid_qty·bid1_price·bid1_qty·accept_latency_us·immediate_fill_qty·ahead_qty·snap*·ask_qty_at_limit·open_at_limit·reason | 0 / "" / false | — |

message 꼴(키 순서 고정, ASCII + 「res=」 한글 문구): `q=<queued_id>|res=<접수|101|기타|무응답>|rc=<4자 원문 또는 빈>`

- gh-radar `launch_pieces.result`(`접수`·`101`·`515`·`기타`·`무응답`)로 풀 때: `res=101` 이면서 `result_code` = 515 이거나 `rc=` 가 `0515`/`E127` 이면 `515` 로 쓴다(N 의 재전송 대상 거부). `launch_pieces.result_code` 는 text 로 두고 `rc=` 원문을 싣는 것을 권한다(정수 `result_code` 만으로는 F083·E127 이 −1000·숫자로 접힌다).
- `side` 는 "B"/"S" — 백필 ndjson 의 `buy`/`sell` 과 같은 뜻.
- 일반 경로(사전 빌드 없음 — mock 등)와 사전 빌드 실패 조각(ordNum 0)은 kind 17 이 없다.

#### kind 18 LaunchHead — 회차 1건 (그 회차 kind 17 들 뒤 · 같은 스레드 push → seq 가 뒤)

| gh-radar 키 | StrategyEvent 칸 | 값·단위 | null |
|--------------------------|--------------------|-------------------------------------------------------------------------|--------------|
| gw_time_ms (fire_at) | gw_time_ms | 첫 송신 epoch ms | — |
| profile · fire_exchange · fire_base · market | cond_metric · exchange · expected_cum · ev_kind | kind 17 과 같음 | — |
| next_offset_us | cond_threshold | 콜드3 시점 **최신** 계획의 첫 값(Q16 목록[0] · N n · A 고정) — 회차 사본 아님 | — |
| offset_used_us | cond_actual | 그 회차 첫 조각 오프셋 µs | — |
| gate_lo_us | error_volume | 101 맞은 조각 중 가장 늦은 송신(µs, 발사 기준) | 0 + lo=- |
| gate_hi_us | remaining_volume | 접수 조각 중 가장 이른 송신(µs) | 0 + hi=- |
| gate_both | has_remaining | lo·hi 둘 다 있음 | — |
| nonmono | cancel_reason | 0/1 (lo > hi) | — |
| n_pieces | ev_price | wire 에 나간 조각 수(= kind 17 행 수) | — |
| n_accepted | ev_qty_before | 첫 발 접수 조각 수 | — |
| n_retry_rejects | ev_qty_after | 재전송 대상 거부 총 횟수(재전송분 포함 — 16:00 101 · N 515) | — |
| n_other | ev_trade_qty | 기타 거부 + 무응답 조각 수 | — |
| first_accept_idx | limit_bid_qty | 첫 발 접수 최초 조각의 wire index | −1 = 없음 |
| retries | bid1_price | 재전송 횟수 합 | — |
| abandoned | bid1_qty | 포기 조각 수 합 | — |
| one_way_us | accept_latency_us | rtt_min / 2 | 0 = 표본 없음 |
| rtt_min_us | immediate_fill_qty | 예열 응답 왕복 최솟값 | 0 = 표본 없음 |
| plan_rev | entry_round | 콜드3 시점 최신 계획 rev | 0 = 계획 없음 |
| account · user · isin | account_no · dma_user_id · isin | 비움(계좌 없음) | "" |
| (나머지) | 0 / "" / false | — 학습값 칸(correction·step·last_dir·bracketed·run·reject_span·jump)은 **없다** (D-12) | — |

message 꼴(키 순서 고정, ASCII): `plan=<-350,-345,-325 또는 N·A 한 값>|rev=<n>|fire=<HHMMSS.uuuuuu KST>|lo=<v|->|hi=<v|->`

- 요청 노트의 `n_101`(N 은 `n_515`) = `n_retry_rejects` 다(프로파일로 가른다). `n_pieces = n_accepted + (첫 발 재전송대상 거부 조각 수) + n_other` 이 선다 — `n_retry_rejects` 는 재전송분까지 센 **횟수**라 이 합에 그대로 들어가지 않는다.
- `fire_at` 은 `gw_time_ms`(ms) + message `fire=`(µs 까지) 둘이다.

### ⓒ ② op 8/9 와이어

**요청(44, admin 관찰자 role 2 연결에서만)**

| op | 읽는 필드 | 응답 |
|----|-----------|------|
| 8 SetLaunchPlan | `request_id` · `launch_profile` · `launch_market` · `launch_offsets_us` (`user_id`/`password`/`account` 는 읽지 않는다) | 86 1프레임 → 실제 변경이면 이어서 94 1프레임 |
| 9 GetLaunchPlan | `request_id` 만 | **94 1프레임만**(86 없음 — op 5 ListUsers → 87 선례) |

**검증 순서(op 8)** — profile·market 대상 → 길이(Q16 1 ~ `max_pieces` · N 1) → 값 범위(Q16 클램프 · N ±2000) → 같거나 커지는 순서(서버가 정렬하지 않는다) → 멱등 비교 → `log/launch_plan.toml` 쓰기(tmp+rename) → 메모리 RCU 교체 → 86 → 94.

**86 code·message — 바이트 그대로 (웹은 code 로만 분기, message 원문 표시)**

| 경우 | code | message |
|------|------|---------|
| 변경 저장 | 0 | `저장 — 다음 발사부터 적용` (→ 94 1프레임) |
| 같은 값 재저장(멱등) | 0 | `변경 없음` (plan_rev 불변 · 파일 안 씀 · 94 없음) |
| profile 밖 / market 밖 | 1 | `발사 계획 대상 밖(profile Q16\|N · market K\|Q)` |
| Q16 길이 0 · `max_pieces` 초과 | 1 | `조각 수 범위 밖(1~{max_pieces})` — 119/120 = `조각 수 범위 밖(1~10)` |
| N 길이 ≠ 1 | 1 | `N 은 시각 한 값` |
| Q16 값이 클램프 밖 | 1 | `발사 시각 범위 밖({lo}~{hi}µs)` — 119/120 = `발사 시각 범위 밖(-3000~1000µs)` |
| N 값이 ±2000 밖 | 1 | `발사 시각 범위 밖(-2000~2000µs)` |
| 내림차순(비감소 위반) | 1 | `시각 목록은 같거나 커지는 순서(서버가 정렬하지 않음)` |
| op 모름(0 · 10 이상 · **구 서버의 8/9**) | 1 | `알 수 없는 명령입니다` |
| 파일 저장 실패 | 10 | `저장 실패 — 서버 로그를 확인하세요` (메모리·plan_rev 그대로) |
| 계획 미게시(방어선) | 10 | `발사 계획 미초기화` |
| 사용자 세션 연결이 보냄 | 11 | `관리자 연결이 아닙니다` |

(위 표의 `\|` 는 마크다운 표 이스케이프 — 실제 바이트는 `|` 한 글자다.)

- 고정 문구 code 1 일곱 종류: 대상 밖 · 조각 수 범위 밖 · N 은 시각 한 값 · 발사 시각 범위 밖(Q16 클램프) · 발사 시각 범위 밖(N ±2000) · 같거나 커지는 순서 · 알 수 없는 명령입니다.
- `max_pieces` 는 서버 설정(119·120 = 10, 허용 1 ~ 64). 웹 1 ~ 10 제한과 같다.
- BUSY(9)·54·87 은 없다 — users.toml 과 무관하다. 86 의 `users_rev` 는 users 레지스트리 값 그대로다(계획 rev 가 아니다 — 계획 rev 는 94 `plan_rev`).

**94 `LaunchPlanSnapshot`** — `request_id`(에코) · `plan_rev`(첫 생성 1 · 변경마다 +1 · `log/launch_plan.toml` 에 남아 재기동해도 이어진다) ·
`updated_at`(`YYYY-MM-DDTHH:MM:SS`, 서버 벽시계 — 운영 서버 KST, 마지막 변경 = 초깃값 생성 포함; 손으로 만든 파일에 키가 없으면 빈 문자열) ·
`entries` **4행 고정 순서** Q16/K · Q16/Q · N/K · N/Q (`profile`·`market`·`offsets_us` — Q16 은 목록 = 조각 수, N 은 길이 1).

**적용 시점** — 저장은 RCU 로 바로 메모리에 들어가고, 발사 스레드는 **콜드2 머리에서 회차 사본**을 쥔다(D-08): 16:00 은 약 15:59:59.6(T−0.4s), N 은 09:00:29.7.
그 뒤 ~ 발사 끝 사이 저장은 진행 중 회차에 안 먹고 그다음 회차부터다. **N 값의 실제 09:00:30 송신 적용은 gh-trade 43-07 병합 뒤**다 — 그 전 바이너리는 op 8 으로 N 을 저장·조회·94·kind 17 `planned_us` 까지 하지만 송신 시각은 서버 설정 `nxt_fire_offset_us`(119 −200 · 120 −245) 그대로다. Phase 42 는 이미 gh-trade master 에 병합돼 있어 순서 문제는 43-07 하나뿐이고, 배포 날짜는 gh-trade 가 알린다.

### ⓓ 서버 로그 두 줄 (어드민 화면 요청 노트 `261027-launch-plan-admin.md` 「확인 방법 ②」 의 짝)

```
[Gateway] admin op=8 user=Q16/K account=- client='relay-admin' req=801 code=0 rev=<users_rev>
[Launch] 발사 계획 변경 profile=Q16 market=K [-200,-190,-170] → [-350,-345,-325] rev=2
```
N 은 `[Launch] 발사 계획 변경 profile=N market=Q -245us → -180us rev=3`. 그다음 16:00 에 `[Launch] 오프셋 -350us market=K (발사 계획 첫 조각 rev=2 조각=3 목록=[-350,-345,-325])`.

판정기가 걸린 파일:

- docs/features/order-journal.md
- server/docs/protocol.md

(생성기 기본 범위 — origin/master 대비. Phase 43 전체 범위 `radar-contract-check.sh 02fe9e55 HEAD` 로는 위 둘 + `server/src/protocol/StockDMA.fbs` + `server/src/trade/journal/StrategyEventFormat.h` 4파일이다.)

## gh-radar 가 할 일

1. **relay 생성물 커밋** — 이 세션이 `RELAY=/Users/alex/repos/gh-radar/relay server/scripts/sync-relay-schema.sh` 로 `relay/src/generated/` 를 반영해 두었다(gh-radar 저장소에서는 커밋하지 않았다). 경로 지정 add 로 커밋해 달라 — 수정 10(`StockDMA.fbs`·`stock-dma.ts`·`admin-account.ts`·`admin-command-req.ts`·`envelope.ts`·`journal-record.ts`·`msg-type.ts`·`open-arb-judgement-item.ts`·`set-open-arb.ts`·`strategy-event-kind.ts`) + 새 파일 2(`launch-plan-entry.ts`·`launch-plan-snapshot.ts`). 삭제(D) 0. 7824e51b 때 남아 있던 미커밋 생성물 변경도 이 반영에 포함된다(그 위의 상위 집합).
2. **kind 17/18 해석 함수 매핑 마이그레이션 → `launch_reproject`** — 위 ① 표 그대로. `next_offset_us` 는 kind 18 `cond_threshold` 를 직접 읽는다(폴백 공식 불필요).
3. **어드민 발사 계획 화면 op 8/9** — 목업 승인안(경계 지도 탭 서버 × 시장 패널) 그대로. 조회는 op 9 → 94, 저장 결과는 86 code 분기 · 성공 뒤 같은 94 가 따라온다.
4. **`launch_pieces.result_code` text 유지 확인** — `rc=` 원문(F083·E127 등)을 싣기 위함.

### 부록 ④ 회신 노트(`261027-launch-plan-admin-reply.md`) ⓐ~ⓔ 답 + 회신 질문 2 답

- **ⓐ 현재 계획 조회** = 44 **op 9 GetLaunchPlan** → 94 `LaunchPlanSnapshot` 한 프레임(86 없음). 필드와 타입:
  `request_id: ulong`(에코) · `plan_rev: ulong`(기동 1 · 변경마다 +1 · 파일에 남음, users_rev 와 별도) · `updated_at: string`(KST `YYYY-MM-DDTHH:MM:SS` — 마지막 변경 시각, 초깃값 생성 시각 포함) ·
  `entries: [LaunchPlanEntry]` 네 행 고정 순서 Q16/K · Q16/Q · N/K · N/Q, 각 `profile: string`("Q16"|"N") · `market: string`("K"|"Q") · `offsets_us: [int]`(µs — Q16 은 목록 = 조각 수, N 은 길이 1).
  op 8 변경 성공 뒤에도 86 다음에 같은 94 가 1회 온다 — 점선·「되돌리기」 에 그대로 쓰면 된다.
- **ⓑ 09:00:30 축** = **같은 축**이다. 계획 N 값(KYOBO119 −200 · KB120 −245µs)과 kind 17 `sent_rel_us` 는 둘 다 09:00:30.000000 기준 µs(첫 조각 송신 시각)이고 변환 규칙은 없다.
  10/26 로그의 N 행 ≈ −20,148 / −20,143µs 는 quick-261026-dz9 가 없앤 「선트리거 조기 발사」 의 흔적이라 축이 다른 것이 아니다(gh-radar 가 그 행을 이미 지웠다).
  16:00 도 같은 축이다(계획 값 = `sent_rel_us` 축 — 10/26 KB 코스닥 첫 조각 −332µs → 다음 계획 −337µs 류). 단 N 의 송신 시각이 계획 값을 따르는 것은 43-07 병합 뒤부터다(ⓒ 「적용 시점」).
- **ⓒ 저장 op 거부 code** = 전부 **code 1 + 고정 한국어 문구**(새 code 없음 — 웹은 code 로만 분기, message 원문 표시):
  「발사 계획 대상 밖(profile Q16|N · market K|Q)」(발사·시장 값 오류) · 「조각 수 범위 밖(1~{max_pieces})」(길이 0 · 초과 — 64 초과도 여기, 119/120 은 10 초과부터) · 「N 은 시각 한 값」 ·
  「발사 시각 범위 밖({lo}~{hi}µs)」(Q16 클램프, 119/120 = −3000~1000) · 「발사 시각 범위 밖(-2000~2000µs)」(N) · 「시각 목록은 같거나 커지는 순서(서버가 정렬하지 않음)」(내림차순) ·
  「알 수 없는 명령입니다」(op 모름 — 구 서버 = 「서버 미지원」) — 일곱 문구 바이트 그대로(위 ② 표).
  같은 값 재저장 = **code 0 「변경 없음」**(멱등 · plan_rev 불변 · 파일 안 씀 · 94 없음). 저장 실패(파일) = code 10, 사용자 세션의 44 = code 11.
- **ⓓ 86 의 「적용 발사」** = 전용 칸은 없다 — 성공 문구가 고정 「저장 — 다음 발사부터 적용」 이다. 서버는 다음/그다음 발사를 계산하지 않는다.
  회차 사본 규칙(D-08): 콜드2(16:00 약 T−0.4s · 09:00:30 은 09:00:29.7) 뒤 ~ 발사 끝 사이의 저장은 진행 중 회차에 안 먹고 그다음 회차부터이고, 그 밖의 시각 저장은 바로 다음 발사부터다.
  웹은 고정 안내 문구를 쓴다(적용 기준 날짜 없음).
- **ⓔ kind 18 칸** = `next_offset_us` 는 그 시점(콜드3 Load 최신) 발사 계획의 첫 조각이다 — Q16 `q16[시장][0]` · N 은 그 시장 값 `n[시장]` · A 는 고정 오프셋. **확정**.
  빠지는(싣지 않는) Q16 학습값 칸 8종: `correction_before_us` · `correction_after_us` · `step_us` · `last_dir` · `bracketed` · `same_dir_run` · `reject_span_us` · `jump`
  (D-12 — 보정 학습 폐지, 0 으로 채우지 않고 칸 자체가 없다). `one_way_us`·`rtt_min_us` 는 예열 실측으로 남는다(`accept_latency_us`·`immediate_fill_qty`).
  → 머리 카드 「학습 → 다음 오프셋」 줄은 「다음 발사 계획 첫 조각」 으로 바꾸면 된다. 요청 노트의 폴백 공식(`correction_after_us − one_way_us`)은 쓸 일이 없다(그 공식 자체는 Phase 43 전 정의로는 맞다).
- **회신 질문 1** = ⓑ 와 같다(같은 축, 변환 없음).
- **회신 질문 2** = 조회 op 를 **따로 둔다** — op 9 GetLaunchPlan + 새 응답 MsgType **94**(op 5 ListUsers → 87 선례와 같은 꼴, 86 없이 94 만).

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — gh-trade 서버 먼저. 와이어는 append 와 새 MsgType 94 뿐이라 구 relay 는 모르는 필드·MsgType 을 무시하고, kind 17/18 은 relay 가 해석 없이 원문 적재한다. 반대 순서(gh-radar 웹·relay 먼저)는 구 서버가 op 8/9 에 code 1 「알 수 없는 명령입니다」 를 내고 웹이 「서버 미지원」 을 보인다 — 깨지지는 않지만 쓸 수 없다(회신 노트 「배포 순서 제약」 과 같은 가름).

gh-radar 쪽 순서는 DB(이력 표 · 해석 함수 매핑) → relay(admin 명령 중계 · 94 조회 파싱) → server → webapp push(= 프로덕션) 다.
gh-trade 배포는 사용자 지시 뒤 gh-trade `.planning/phases/43-launch-plan-admin/43-DEPLOY.md` 대로 KB 120 · 교보 119 만(**121 무접촉**) 한다 — 날짜는 gh-trade 가 알린다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

요청 노트 `261027-launch-gate-contract.md` 「라이브」 그대로 — 첫 실물 날짜에:

1. 16:00:01 이후 · 09:00:31 이후 relay 로그에 kind 17·18 적재 건수(kind 17 = 그 회차 wire 조각 수 · kind 18 = 회차마다 1 — 16:00 은 K·Q 각 1, 09:00 은 A K·Q · N K·Q)
2. gh-radar `launch_pieces` · `launch_heads` 당일 행
3. 어드민 「발사」 주문 내역 당일 행
4. 경계 지도 「다음 첫 조각」 선이 kind 18 `next_offset_us` 값으로 바뀜

서버 쪽 짝:
- `[Launch] 오프셋 …us market=K (발사 계획 첫 조각 rev=… 조각=… 목록=[…])` 가 나오고 `[Launch] 학습 …` 줄은 **없다**
- 어드민 저장 → 86 code 0 → `[Launch] 발사 계획 변경 …` → (재기동 없이) 다음 16:00 kind 17 `sent_rel_us` 가 새 시각 근처 → op 9 가 새 값·`plan_rev`+1
- A·N(09:00) 의 kind 17/18 행 값은 gh-trade 하네스가 Q16 만큼 단언하지 않았다(같은 헬퍼·같은 루프) — 첫 실물 날 A 머리 1행·N 의 `side` B/S 행을 같이 봐 달라

## 질문

요청 노트 `261027-launch-gate-contract.md` 질문 5 의 답(③):

1. **A 두 다리의 wire** — A 프로파일은 09:00:27 KRX 매수만 쏜다. 09:00:30 NXT 매도는 **N 프로파일 조각**이다(`BuildNxtPieces` 가 「KRX > NXT」 매도와 「NXT > KRX」 매수를 함께 낸다).
   그래서 wire 는 **스레드(프로파일 × 시장 레인)마다 0부터**다 — A 의 「둘째 다리」 는 profile N · fire_exchange NXT · fire_base 090030000 · side S 행으로 나타나고, N 매수 행과 같은 wire 축(한 줄 순번)에 섞인다.
   09:00:27 KRX 매수는 profile A · fire_exchange KRX · fire_base 090027000 행이다.
2. **A 머리** = **1행**(KRX 다리) — fire_exchange KRX · fire_base 09:00:27 기준(HHMMSSmmm `090027000`). NXT 쪽은 N 머리 1행에 들어간다(매수·매도 합산 — side 는 kind 17 행에서 가른다).
3. **재송신** — kind 17 은 콜드3 에 조각당 **정확히 1건**이다(재전송은 같은 조각의 `order_no` = 마지막 번호 · `base_cum` = 뿌리 번호 · `ev_qty_after` = retry 로 접힌다) — 같은 조각이 두 번 나오지 않는다.
   seq 는 기록 스레드가 디스크 커밋 뒤 단조 부여하고, epoch 는 주문 저널과 공유한다. 서버 재기동이 옛 epoch 로 재송신하는 경우는 없다 — 재접속 relay 가 80 커서 `since_seq` 초과분을 재생받는 것뿐이고 새 이벤트는 늘 새 seq 다.
   `gw_time_ms` 는 첫 발 송신 시각이라 재생해도 같은 값이다.
4. **18 은 17 뒤** — 같은 스레드가 그 회차 17 들을 push 한 뒤 18 을 push 하고, 기록 스레드가 링 순서로 seq 를 매긴다 → 18 의 seq > 그 회차 17 들. 한 80 프레임에 섞여 올 수 있다(≤100건/32KB 슬라이스).
5. **계좌·사용자** — kind 17 은 `account_no`(정규화)·`dma_user_id` 를 그대로 싣는다(마스킹 없음). kind 18 은 비운다. 서버는 `Server::OnStrategyEntry` 첫 줄 `IsObserverOnlyKind` 가드로 사용자 경로(82)에서 빼고, 81 백필에도 없다 — gh-radar 쪽 제외와 양쪽 다.

역질문: 「A 머리 1행(KRX 다리)이면 09:00:27 지도에 충분한가」 1건 — 다리별 2행이 꼭 필요하면 알려 달라(A 의 NXT 다리는 N 머리에 이미 합산돼 있다는 점을 먼저 봐 달라).

## 회신

(2026-10-30 · 범위 7) 발사 계획 op 8/9 · 스냅샷 94 적용 — 35-16 `ffcfa2c5`(생성물 SYNC f156cb6f) · `a4866ba1` · 35-17 `ac6b6103` · 라이브 UAT 10-28 · 10-29 16:00 · 10-28 ~ 10-30 09:00:30 계획 값 반영 확인(`261027-launch-plan-admin.md` 회신).

(2026-10-30 · 범위 6 — **보류, 이 노트는 열어 둔다**) kind 17/18 매핑(35-10 `20261028200000_launch_project_mapping`)은 원격 적용 · 라이브 적재 정상(10-28 ~ 10-30 당일 행 전부 source journal)이나, **교보 A 재확인 재발사가 gh-radar 키에서 09:00:27 회차를 덮는다** — KYOBO119 10-29 코스닥 · 10-30 코스피/코스닥에 `expected_cum 090029000` · `entry_round` 0 부터인 A kind 17·18 이 오고(마감선 09:00:29.5 폴링 재발사로 본다), `launch_pieces` · `launch_heads` 키에 `fire_base` 가 없어 같은 wire 의 09:00:27 행 · 머리가 덮였다(원문은 남음 — 키 수정 뒤 reproject 로 복구). 웹도 A 를 09:00:27 만 받아 09:00:29 행이 안 보인다. gh-radar 쪽에서 고친 뒤 닫는다.
역질문 「A 머리 1행(KRX 다리)이면 09:00:27 지도에 충분한가」: KRX 다리 1행이면 충분하다(NXT 다리는 N 머리 합산으로 받는다). 단 위 재확인 회차는 기준시각(`expected_cum`)별 머리 · 조각으로 따로 받는다 — gh-radar 가 키를 고친다. 재확인 회차 `entry_round` 를 이전 회차 뒤로 이어 줄지는 수정 때 정해서 따로 요청한다.
