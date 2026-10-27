---
phase: 35-launch-gate
plan: 10
subsystem: database
tags: [supabase, plpgsql, pgtap, launch-gate, strategy-events, shared]
status: complete

requires:
  - phase: 35-launch-gate
    provides: "35-02 launch_pieces · launch_heads · launch_upsert_piece/head · 어드민 RPC · 35-04 apply 17·18 서브블록 · launch_project_event 스텁 · launch_reproject"
provides:
  - "launch_project_event 정식 칸 매핑(20261028200000) — kind 17 → launch_upsert_piece · 18 → launch_upsert_head ('journal')"
  - "pgTAP supabase/tests/launch_project_mapping.test.sql (36 단언)"
  - "STRATEGY_EVENT_KIND.LaunchPiece 17 · LaunchHead 18 · 라벨 발사조각 · 발사머리"
  - "35-CONTEXT canonical_refs 맨 위 = 정식 인계 노트 261028-launch-plan-contract"
affects: [35-11, 35-16, 35-18]

actuals:
  tokens: 12200
  tasks: 3
  commits: 3
plan_head_before: 490dfb16af8112650b964617af7a7d9fd0bb0fd3
plan_head_after: 4be128bdfe0dcade838010bc5a089df10b5f82a6

tech-stack:
  added: []
  patterns:
    - "원문 칸 → 열 계약 jsonb 만 만들고 규칙은 upsert 헬퍼 한 곳(최신 seq · journal > backfill)"
    - "센티널은 칸별 — 「빈값/0 → null」 일괄 규칙 금지(gate lo/hi 는 0 + message lo=-/hi=- 일 때만 null)"
    - "정할 수 없는 축(profile · market · fire_base)은 null → 헬퍼 RAISE → apply errors 로 보고(조용한 버림 금지)"
    - "pgTAP 에서 마이그레이션 본문을 pg_get_functiondef 로 떠 두고 스텁으로 갈아 끼운 뒤 EXECUTE 로 복원 — 「스텁 시절 원문 → reproject」 재현"

key-files:
  created:
    - supabase/migrations/20261028200000_launch_project_mapping.sql
    - supabase/tests/launch_project_mapping.test.sql
  modified:
    - supabase/tests/launch_gate_apply.test.sql
    - packages/shared/src/strategy-event.ts
    - packages/shared/src/strategy-event-labels.ts
    - packages/shared/src/__tests__/strategy-event-labels.test.ts
    - packages/shared/src/__tests__/launch.test.ts
    - .planning/phases/35-launch-gate/35-CONTEXT.md

key-decisions:
  - "35-10: 노트에만 있고 표에 열이 없는 4칸(조각 root_ord_num=base_cum · planned_us=error_volume · offset_used_us=remaining_volume, 머리 plan_rev=entry_round)은 매핑 안 함 — 사용자 결정 2026-10-28(열 추가 없음)"
  - "35-10: next_offset_us = kind 18 cond_threshold 직접 — A2 폴백(correction_after_us − one_way_us) 미사용(노트 ⓔ 확정)"
  - "35-10: launch_pieces.result_code = message rc= 원문(0101 · 0515 · E127 · F083), 없으면 정수 result_code, 0 이면 null — 백필 표기(101 · 515 · 0)와 다름(웹은 result_code 를 쓰지 않음)"
  - "35-10: fire_at_us = message fire=(KST HHMMSS.uuuuuu)+trade_date 의 epoch µs, 없거나 형식 밖이면 gw_time_ms × 1000"
  - "35-10: Q16 학습 8칸은 열 유지 · journal 행 null(형 변경 없음 → ALTER 없음 · COMMENT 만 갱신)"
  - "35-10: 마이그레이션 이름은 계획값 20261028200000 유지 — 실행 시각(20261028011838)이 최신 파일(20261028200100 · 35-12)보다 이르고, 둘 다 원격 미적용"

requirements-completed: []

duration: 25min
completed: 2026-10-28
---

# Phase 35 Plan 10: kind 17·18 정식 칸 매핑 Summary

**gh-trade 정식 인계 노트(261028-launch-plan-contract ⓑ) 표대로 `launch_project_event` 를 스텁에서 정식 매핑으로 교체했다. 칸별 센티널 · 515 판정 · next_offset_us 직접 읽기 · fire_at epoch µs 를 넣었고, pgTAP 36건이 노트 예시 원문으로 그 매핑을 잠근다. shared kind 17·18 상수와 라벨도 맞췄다.**

## Performance

- **Duration:** 약 25분(Task 2 · 3 — Task 1 게이트는 이전 에이전트)
- **Completed:** 2026-10-28
- **Tasks:** 3/3(Task 1 게이트 해소 · Task 2 tracer RED → GREEN · Task 3)
- **Files:** 8 (만듦 2 · 고침 6)

## 정본 노트 · 요구 대조

- 노트 경로: `docs/inbox/from-gh-trade/261028-launch-plan-contract.md` · from_commit `2e090eb9` · fbs_sync_marker `f156cb6f`
- 판정(Task 1): **D-03 충족** — kind 17 이 exchange(fire_exchange) · expected_cum(fire_base) · order_condition(side) 을 싣는다. 사용자 「노트 … · D-03 충족 · 진행」.

| 열(gh-radar) | kind 17 원문 칸 | 센티널 → null |
|---|---|---|
| profile | cond_metric 1 Q16 · 2 A · 3 N | 그 밖 → null → RAISE |
| fire_exchange | exchange "KRX"/"NXT" | "" |
| fire_base | expected_cum HHMMSSmmm → time | 0 |
| market | ev_kind 75 K · 81 Q | 그 밖 → RAISE |
| wire | entry_round | — |
| side | order_condition B buy · S sell | 그 밖 |
| queued_id | message `q=` | "" |
| piece_idx · round · probe | ev_qty_before · ev_price(−1 탐침 그대로) · has_remaining | — |
| order_no | order_no | "" |
| sent_rel_us | cond_threshold | — |
| result | queue_case 1 접수 · 2 101/515 · 3 기타 · 4 무응답 | 그 밖은 res= 원문 |
| result_code | message `rc=` 원문, 없으면 정수 result_code | 0 |
| accept_time | cond_actual | 0 |
| retry · abandoned | ev_qty_after · cancel_reason≠0 | — |
| isin · price · qty | isin · price · qty | isin "" |
| filled_qty | ev_trade_qty | 0(= 모름 — gh-trade 0 고정) |
| account · dma_user_id | account_no · dma_user_id | "" |
| (안 함) | base_cum · error_volume · remaining_volume | 사용자 결정 2026-10-28 |

| 열(gh-radar) | kind 18 원문 칸 | 센티널 → null |
|---|---|---|
| next_offset_us | cond_threshold(직접) | — |
| offset_used_us | cond_actual | — |
| gate_lo_us · gate_hi_us | error_volume · remaining_volume | 0 **이면서** message lo=- / hi=- |
| nonmono | cancel_reason≠0 | — |
| n_pieces · n_accepted · n_reject · n_other | ev_price · ev_qty_before · ev_qty_after(n_retry_rejects) · ev_trade_qty | — |
| first_accept_idx | limit_bid_qty | −1 |
| retries · abandoned | bid1_price · bid1_qty | — |
| one_way_us · rtt_min_us | accept_latency_us · immediate_fill_qty | 0(= 표본 없음) |
| fire_at_us | message `fire=` + trade_date → epoch µs | 없으면 gw_time_ms × 1000 |
| 학습 8칸 | 노트에서 폐지(gh-trade D-12) | 늘 null |
| (안 함) | entry_round(plan_rev) · has_remaining(gate_both — lo·hi 둘 다 non-null 로 파생) · message plan= | 사용자 결정 2026-10-28 / 열 없음 |

질문 답(노트 질문 ③): A1 — A 는 09:00:27 KRX 매수만, 09:00:30 NXT 매도는 **N 프로파일** 조각(side S, wire 는 프로파일 × 시장 레인마다 0부터 · N 매수와 한 축) · A 머리 1행(KRX) · NXT 는 N 머리 1행에 매수 · 매도 합산 · kind 17 은 조각당 정확히 1건(재전송은 같은 행에 접힘) · 18 은 그 회차 17 들 뒤(seq 큼, 한 80 프레임에 섞일 수 있음).

## 플랜 가정과 노트가 다른 점(반영)

1. **A 두 다리**: 플랜 「A 09:00:30 NXT 매도 조각 · A 두 다리 = 두 행」 → 노트에서는 09:00:30 매도가 **N 프로파일**이다. pgTAP 는 「N 매수(NXT 090030000 B) · A KRX 090027000 매수 · N NXT 090030000 매도 = 세 행, 키가 서로 다름, side buy/buy/sell」 로 바꿨다. `launch_map_for_admin('n0930')` pieces = N 매수 + N 매도(A KRX 다리 없음).
2. **next_offset_us**: 플랜 A2 폴백(correction_after_us − one_way_us) → 노트는 cond_threshold 직접 · 학습 칸 폐지. 폴백 없음.
3. **fire_base**: 플랜 「profile · 거래소 CASE」 → 노트가 expected_cum 칸으로 직접 준다. CASE 표 없음(shared launchFireBaseOf 와 동기할 두 번째 표도 없음).
4. **센티널**: 플랜 「빈 문자열 · 0 센티널 → null 한 칸만」 → 칸별 규칙(위 표).
5. **ALTER**: 학습 열은 형이 다른 게 아니라 칸이 없어졌다 → ALTER 없음 · COMMENT 만 갱신.

## 실제 마이그레이션 파일

`supabase/migrations/20261028200000_launch_project_mapping.sql`(계획 이름 그대로 — 실행 시각 20261028011838 이 최신 파일 20261028200100(35-12) 보다 일러서 규칙대로 바꾸지 않음. 35-12 머리말도 「35-10 매핑 20261028200000 뒤」 로 이 이름을 가정한다).

## fbs 마커 대조

- 노트 fbs_sync_marker `f156cb6f` = 작업 트리 `relay/src/generated/StockDMA.fbs` SYNC MARKER `f156cb6f` → **일치**(enum `LaunchPiece = 17` · `LaunchHead = 18` 확인).
- 단 그 사본은 **미커밋**(다른 세션 · 노트 「gh-radar 할 일 1」). 커밋된 HEAD 사본은 `75195b70` — 생성물 커밋 대기. 이 플랜은 relay/src/generated 를 손대지 않았다.

## Task Commits

1. **Task 1: 게이트** — 커밋 없음(읽기 전용 · 이전 에이전트)
2. **Task 2 RED: pgTAP** — `9289e401` (test) — 스텁 위에서 36 중 22 실패 확인
3. **Task 2 GREEN: 매핑 마이그레이션** — `6622b444` (feat)
4. **Task 3: shared 상수 · 라벨 · CONTEXT** — `4be128bd` (feat)

## 검증 결과

- `verify-dma-orders-price-check.sh --test`:
  - launch_project_mapping 36/36 ok · launch_gate_apply 38/38 · launch_gate 60/60 · dma_strategy_apply 30/30 · dma_strategy_accum_signal 31/31 · dma_strategy_read 28/28 — not ok 0 · 「Looks like」 0
- shared build + vitest(--maxWorkers=2): 24 files · 716 passed
- relay typecheck exit 0 · server typecheck exit 0
- webapp vitest(--maxWorkers=2): 189 files · 4881 passed · 1 skipped
- relay typecheck:tests · webapp typecheck: exit 2 — 오류 2줄이 전부 `relay/tests/helpers/frames.ts(490,30)` · `(1618,30)` TS2554(미커밋 relay 생성물 탓 · deferred-items.md 기존 항목). 그 밖 오류 0 — 이 플랜 판정에서 제외(지시대로).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] launch_gate_apply.test.sql 「스텁」 단언이 정식 매핑 뒤 깨짐**
- **Found during:** Task 2 회귀
- **Issue:** 이 파일의 단언 0(스텁 적재 = errors [])은 마이그레이션 본문이 스텁이라고 가정했다. 정식 매핑 뒤에는 그 테스트의 가짜 원문(cond_metric 0 · ev_kind 0 · expected_cum 0)이 「필수 키 누락 profile, fire_base, market」 errors 를 낸다(정식 매핑이 설계대로 동작한 결과).
- **Fix:** 스텁 적재 직전에 테스트 안에서 Wave A 스텁 본문(no-op)을 다시 깐다 — 단언 의미(「스텁 시절」 재현) 유지. 정식 매핑 단언은 새 파일이 맡는다.
- **Files modified:** supabase/tests/launch_gate_apply.test.sql(files_modified 밖)
- **Commit:** 6622b444

그 밖: 노트가 플랜 가정과 다른 5곳은 위 「플랜 가정과 노트가 다른 점」 대로 반영(Task 1 사용자 확인 범위 안).

## 35-11 · 35-16 이 알아야 할 것

- **35-11(메인 세션)**: 원격 적용 순서 = `supabase db push --linked --yes`(20261028200000 + 35-12 의 20261028200100 이 같이 올라간다) → `SELECT public.launch_reproject();` 1회(Wave A 동안 쌓인 17·18 원문을 정식 매핑으로 · 멱등 · 반환 `{projected, errors}` 의 errors 가 비었는지 확인). errors 가 있으면 사유 문자열(「필수 키 누락 …」)로 어느 칸이 노트와 다른지 바로 보인다.
- 라이브 UAT 체크(노트 「확인 방법」): 16:00:01 뒤 KB120/KYOBO119 각 시장 kind 18 1행 · kind 17 = 그 회차 wire 조각 수. 09:00:31 뒤 A 머리 1행(KRX) · N 머리 1행 · N 의 side B/S 행. 경계 지도 「다음 첫 조각」 선 = kind 18 next_offset_us. relay `/healthz` projectionErrors 0.
- **result_code 표기 차이**: journal 행은 rc 원문(`0101` · `0515` · `E127` · `F083`), 접수는 null. 백필 행은 `101` · `515` · `0`. 현재 웹은 result_code 를 표시 · 판정에 쓰지 않으니 영향 없음 — 35-16 에서 result_code 를 보이게 하면 이 차이를 다룰 것.
- **fire_at_us** 는 epoch µs(KST fire= 기준). 웹은 아직 안 쓴다.
- **round** 는 탐침이면 −1 이 그대로 들어간다(probe=true 와 같은 뜻).
- **filled_qty** 는 journal 행에서 늘 null(gh-trade 0 고정 = 모름) — 체결 표시가 필요하면 order_no 로 주문 저널과 join(별도 플랜).
- 머리 카드 「학습 → 다음 오프셋」 문구는 노트 ⓔ 대로 「다음 발사 계획 첫 조각」 으로 바꿀 것(35-16 몫 · 학습 8칸은 journal 에서 늘 null).
- relay 생성물(f156cb6f) 커밋은 아직 다른 세션 몫 — 그 커밋이 frames.ts TS2554 를 같이 맞춰야 webapp typecheck 가 녹색이 된다.

## Known Stubs

없음 — 이 플랜이 Wave A 스텁(launch_project_event no-op)을 없앴다.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261028200000_launch_project_mapping.sql
- FOUND: supabase/tests/launch_project_mapping.test.sql
- FOUND: 9289e401 · 6622b444 · 4be128bd (HEAD 조상)
