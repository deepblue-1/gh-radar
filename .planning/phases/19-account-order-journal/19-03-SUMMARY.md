---
phase: 19-account-order-journal
plan: 03
subsystem: database
tags: [supabase, postgres, plpgsql, pgtap, journal, projection, state-lattice, idempotency]

requires:
  - phase: 19-account-order-journal
    provides: "19-01 — dma_journal_project(A 갈래) · dma_journal_next_status 격자 · dma_journal_apply(PK 게이트·포이즌 격리·커서) · reject_seq 키 스키마"
provides:
  - "dma_journal_project 전 갈래: 접수 A · 체결 E · 취소 C · 정정 M · 거부 R · 로컬 거부(reject_seq)"
  - "헬퍼 dma_journal_origin(text) — origin 사상 한 곳(service_role 전용 EXECUTE)"
  - "투영 규칙 표 전 행 pgTAP(79건) + 규칙 ↔ 단언 번호 대응 주석 · 스키마/권한 pgTAP 93건"
affects: [19-04, 19-05, 19-07, 19-11]

actuals:
  tokens: 12841
  tasks: 3
  commits: 3
plan_head_before: ab763084ec1f6f31a8881c55ee1ccd622d1af795

tech-stack:
  added: []
  patterns:
    - "자기 행 upsert 를 갈래 값 셋(v_next · v_ins_qty/v_ins_price · v_add_filled)으로 일반화 — 체결 판정과 늦은 A 재판정이 같은 식 하나"
    - "원주문 행은 org_order_no 로 한 번 FOR UPDATE 조회 → 방향(side) 정본 + C/M 원주문 갱신에 공용"
    - "pgTAP 이벤트 빌더 pg_temp.ev(seq, hms, overrides jsonb) — 키 23종 기본값 위에 덮어쓰기"
    - "순서 단언은 순서에 민감한 조합(C·E·A)으로 — ORDER BY 제거 변이로 실패를 실측"

key-files:
  created:
    - .planning/phases/19-account-order-journal/deferred-items.md
  modified:
    - supabase/migrations/20260924200100_dma_journal_rpcs.sql
    - supabase/tests/dma_journal_apply.test.sql
    - supabase/tests/dma_journal_schema.test.sql

key-decisions:
  - "정정/취소 거부 R 이 원주문 번호를 자기 번호로 실어 오면(order_no = org_order_no) 그 번호 행은 원주문이므로 rejected 로 덮지 않고 reject_seq 행으로 따로 적는다"
  - "거래소 자동취소 C(org 빈 값 또는 자기 번호)는 취소 통보의 수량·가격·order_type 을 원주문 행에 채우지 않는다 — 상태만 cancelled"
  - "방향은 모든 갈래에서 원주문 행 side 가 정본, 없으면 side_trusted 일 때만 레코드 값 — 거부 행도 같은 규칙(D-08 must-have 문장 기준)"
  - "모르는 입력(알 수 없는 notice_type · 주문번호 없는 A/E/C/M · exec_qty 0 이하 체결 · 별도 원주문번호 없는 정정확인)은 RAISE → apply_error 격리"
  - "원주문 qty 가 NULL(체결이 접수보다 먼저 온 행)이면 정정 이동은 원주문 모름과 같게 M 수량 폴백 · 원주문 갱신 없음"

requirements-completed: [D-02, D-08, D-12]

coverage:
  - id: D1
    description: "체결 E 누적·부분→전량 격자·재생 무증가·E-먼저-A 재판정·종결 유지"
    requirement: D-12
    verification:
      - kind: integration
        ref: "supabase/tests/dma_journal_apply.test.sql#41-49"
        status: pass
    human_judgment: false
  - id: D2
    description: "취소 C(원주문 cancelled · filled 불변 · 자동취소 예외) · 정정 M(LEAST 이동 · modified · 폴백) · 거부 R(원주문 불변)"
    requirement: D-12
    verification:
      - kind: integration
        ref: "supabase/tests/dma_journal_apply.test.sql#50-61"
        status: pass
    human_judgment: false
  - id: D3
    description: "로컬 거부 · 주문번호 없는 R 은 reject_seq 행 — 서로 다른 거부가 한 행에 겹치지 않는다"
    requirement: D-02
    verification:
      - kind: integration
        ref: "supabase/tests/dma_journal_apply.test.sql#62-64"
        status: pass
    human_judgment: false
  - id: D4
    description: "방향은 원주문 side(없으면 side_trusted 만) · origin 빈 값/미지 → NULL, VITrigger → vi"
    requirement: D-08
    verification:
      - kind: integration
        ref: "supabase/tests/dma_journal_apply.test.sql#50,57,59,64,67"
        status: pass
    human_judgment: false
  - id: D5
    description: "epoch 교체 커서 · 같은 epoch 재생 커서 불감소 · 배열 순서 무관 seq 오름차순 · gw_time 정본 · 미지 통보 격리 · 빈 배열"
    requirement: D-12
    verification:
      - kind: integration
        ref: "supabase/tests/dma_journal_apply.test.sql#68-79"
        status: pass
    human_judgment: false
  - id: D6
    description: "새 헬퍼 dma_journal_origin(text) EXECUTE service_role 전용"
    verification:
      - kind: integration
        ref: "supabase/tests/dma_journal_schema.test.sql#has_function_privilege dma_journal_origin × 3"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-09-25
status: complete
---

# Phase 19 Plan 03: 저널 투영 전 갈래(E·C·M·R·로컬 거부) Summary

**`dma_journal_project` 가 이제 모든 게이트웨이 통보(접수·체결·취소·정정·거부·로컬 거부)를 주문 1건 = 1행으로 단조 투영한다. 체결 수량은 재생에도 두 배가 되지 않고, 거부는 원주문을 건드리지 않으며, 정정은 옮겨간 잔량만큼 원주문을 닫는다. 투영 규칙 표 전 행을 pgTAP 79건으로 잠갔다.**

## Performance

- **Duration:** 약 10분
- **Started:** 2026-09-24T15:36:57Z
- **Completed:** 2026-09-24T15:47Z (KST 2026-09-25 00:47)
- **Tasks:** 3/3
- **Files modified:** 3 (created 1 — deferred-items.md)

## Accomplishments
- **체결 E (tracer):** 자기 행 upsert 를 갈래 값 셋으로 일반화했다. E 는 `filled_qty + exec_qty` 를 상태와 무관하게 누적하고, qty 를 알면 `filled_qty + modified_qty >= qty` 로 filled 를 격자 판정한다. A 보다 먼저 오면 qty·price NULL 로 만들고 뒤의 A 가 채워 재판정한다(19-01 의 재판정 경로와 같은 식). 체결가는 주문가를 바꾸지 않는다.
- **취소 C:** 원주문 번호 = `COALESCE(org, 자기 번호)`. 다르면 취소 행(order_type C) cancelled + 원주문 `dma_journal_next_status(…, 'cancelled')`(filled 는 그대로). 같으면(거래소 자동취소) 그 행 하나만 cancelled, order_type 유지. 두 행 id 를 모두 반환해 relay 가 둘 다 푸시한다.
- **정정 M:** 이동 수량 = `LEAST(M 수량, 원주문 잔량)`. 정정 행 qty = 이동 수량 · accepted. 원주문 `modified_qty += 이동`, 합이 qty 이상이면 modified. 원주문을 모르면(전일·예약) M 수량 폴백이고 원주문 행을 지어내지 않는다.
- **거부 R / 로컬 거부:** 주문번호 있는 R 은 자기 행만 rejected, 원주문 불변. 로컬 거부·주문번호 없는 R 은 `reject_seq = seq` 새 행(`ON CONFLICT … WHERE reject_seq IS NOT NULL DO NOTHING`)이라 서로 다른 거부가 겹치지 않는다.
- **방향·출처(D-08):** 원주문 행 side 가 정본, 없으면 `side_trusted` 일 때만 레코드 값. origin 사상은 헬퍼 `dma_journal_origin(text)` 한 곳(권한 3줄 + 스키마 pgTAP 3건).
- **견고성:** epoch 교체·재생 커서 불감소·배열 순서 무관·gw_time 정본·미지 통보 격리·빈 배열을 단언으로 잠갔다. 모두 기존 `dma_journal_apply` 로 통과해 Task 3 은 마이그레이션 무수정이다.

## Task Commits

1. **Task 1: [tracer] 체결 E 한 경로** — `be5c1ef` (feat)
2. **Task 2: 취소 C · 정정 M · 거부 R · 로컬 거부 · Q-ID · 방향/출처** — `91ac129` (feat)
3. **Task 3: 견고성 단언** — `9e8a067` (test)

## Verification

| 명령 / 점검 | 결과 |
|------|------|
| Task 1 RED — E 단언 추가 후 수정 전 함수로 `--test dma_journal_apply.test.sql` | `ERROR: 7 tests failed of 49` · `not ok 41 - (seq 11 E 4주, …9003) (applied, errors) = (1, [])` · `have: (0,"[{""seq"": 11, ""error"": ""dma_journal_project: notice_type E 투영 미구현 — 19-03 (seq=11)""}]")` · `not ok 42 … have: (10,0,accepted)` · `# RESULT: FAIL` |
| Task 1 GREEN | `1..49` · ok 49 · not ok 0 · `# RESULT: PASS` |
| Tracer 게이트(interactive · end-of-phase · 자동 verify) | 재실행 49/49 PASS → 확장 진행 |
| Task 2 RED — C/M/R/로컬 거부 단언 추가 후 Task 1 함수로 | `ERROR: 14 tests failed of 67` (not ok 50-57 · 59 · 61-64 · 66) |
| Task 2 GREEN | apply `1..67` ok 67 · schema `1..93` ok 93 · 둘 다 `# RESULT: PASS` |
| Task 3 | apply `1..79` ok 79 · not ok 0 · `# Looks like you planned` 없음 · `# RESULT: PASS` (마이그레이션 무수정) |
| Task 3 변이 점검 — `dma_journal_apply` 순회의 `ORDER BY (value->>'seq')::bigint` 를 임시 제거 | `not ok 73 … have: (cancelled,10,10,4,6,C) want: (filled,…)` — 순서 단언이 실제로 순서를 잰다. 변이는 `git checkout -- <file>` 로 되돌림 |
| **최종** `--test dma_journal_apply.test.sql` / `--test dma_journal_schema.test.sql` | **79/79 · 93/93**, not ok 0, 계획 수 일치 |
| acceptance grep (주석 제외 줄) | `filled_qty + ` 2 · `reject_seq` 2 · `modified_qty` 7 · `dma_journal_origin` 5 |
| `message` 분기 점검 — `grep -n message` 비주석 11줄 | 선언(150) · INSERT 컬럼/값(221·225·310·315) · UPDATE 값 `message = CASE WHEN v_seq >= o.last_seq …`(347 — 조건은 seq 비교) · apply 적재(421·444) · 조회 컬럼(493·582·597). **IF/CASE 조건에 `message` 없음** (T-19-13) |
| Task 3 acceptance | `ep-2` 24 · `apply_error` 6 · 파일 끝 대응 주석 7행(A · E · C · M · R 번호 있음 · 로컬 거부 · 공통) |

원격 DB 에는 아무것도 반영하지 않았다(19-11 몫). 테스트는 전부 일회용 로컬 컨테이너에서 돌렸다.

## Files Created/Modified
- `supabase/migrations/20260924200100_dma_journal_rpcs.sql` — `dma_journal_origin` 추가, `dma_journal_project` 전 갈래로 재작성(판정 순서 ①거부 행 ②통보 검증 ③자기 행 upsert ④원주문 갱신), 머리 주석(함수 7종·함정) 갱신, 권한 3줄 추가
- `supabase/tests/dma_journal_apply.test.sql` — 빌더 `pg_temp.ev` · 조회 `pg_temp.o`, 11~22절 단언 39건(40 → 79), 파일 끝 규칙 ↔ 단언 대응표
- `supabase/tests/dma_journal_schema.test.sql` — `dma_journal_origin(text)` EXECUTE 권한 3건(90 → 93)
- `.planning/phases/19-account-order-journal/deferred-items.md` — 검증 스크립트 계획 수 불일치 통과 문제

## Decisions Made
- **원주문 번호를 자기 번호로 실어 온 정정/취소 거부는 reject_seq 행으로 뺀다.** 그 번호의 행은 살아 있는 원주문이다. 자기 행 규칙대로 rejected 로 덮으면 주문이 거부된 것처럼 보인다.
- **자동취소 C 는 원주문 행에 상태만 준다.** 취소 통보의 수량은 잔량일 수 있어서 qty 로 채우면 틀린 값이 남는다. 가격과 order_type 도 채우지 않는다.
- **방향 규칙은 하나로 통일했다.** 원주문 행이 있으면 그 side, 없으면 `side_trusted` 일 때만 레코드 값을 쓴다(아래 편차 3).
- **원주문 qty 가 NULL 이면 원주문을 모르는 경우와 같게 처리한다.** qty 를 모르는 채로 modified_qty 를 더하면 뒤에 온 A 의 재판정이 이 주문을 filled 로 오판한다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 정확성] 원주문 번호로 온 정정/취소 거부가 원주문을 rejected 로 덮지 않게 했다**
- **Found during:** Task 2
- **Issue:** 플랜 ④(R 주문번호 있음 → 자기 행 rejected)를 그대로 따르면, 브로커가 거부 통보의 order_no 에 원주문 번호를 실어 올 때 살아 있는 원주문이 rejected 가 된다. 「거부 = 원주문 살아 있음」 원칙(order-handler.ts 851-856)을 어긴다.
- **Fix:** `R ∧ request_kind ∈ {Cancel, Modify} ∧ order_no = org_order_no` 이면 ① 거부 행(reject_seq) 갈래로 보낸다.
- **Files modified:** supabase/migrations/20260924200100_dma_journal_rpcs.sql · 단언 61
- **Commit:** 91ac129

**2. [Rule 2 - 입력 검증] 모르는 입력은 조용히 투영하지 않고 RAISE 로 격리한다**
- **Found during:** Task 1·2
- **Issue:** 플랜에는 주문번호 없는 A/E/C/M, exec_qty 0 이하 체결, 원주문번호가 없거나 자기 번호와 같은 정정확인에 대한 처리가 없었다. 그대로 두면 NULL 키 행이 생기거나, 0주 체결이 partially_filled 를 만들거나, 원주문을 스스로 정정하는 틀린 행이 남는다.
- **Fix:** 세 경우 모두 RAISE 한다. `dma_journal_apply` 의 포이즌 격리가 받아 apply_error 에 사유를 남기고 배치는 계속된다.
- **Commit:** be5c1ef · 91ac129

**3. [해석] C/M 거부 행에서 원주문이 없을 때 방향 규칙**
- **Found during:** Task 2
- **Issue:** Task 2 action 은 「C/M 거부 행은 원주문 side → 없으면 NULL」 이라고 적었다. 그런데 must-have D-08 은 「원주문을 모르면 side_trusted 일 때만 레코드 값」 이다. 두 문장이 서로 다르다.
- **Fix:** must-have 문장을 따라 모든 갈래에 규칙 하나를 적용했다. `side_trusted` 는 게이트웨이가 원주문 메타로 채운 값이라는 표시이므로 신뢰할 수 있다. side_trusted 가 거짓이면 두 해석 모두 NULL 이고, 이 경우는 단언 57이 확인한다.
- **Commit:** 91ac129

### 참고
- 19-01 추적 pgTAP 에는 「E 가 예외로 떨어진다」 를 단언하는 항목이 없어서 교체할 것이 없었다.
- 9절(체결이 먼저 온 행을 직접 INSERT 한 뒤 A 로 재판정)은 그대로 두었다. 실제 E 로 같은 경로를 확인하는 단언은 47-48 로 새로 더했다.
- 보호 브랜치 가드: `master` 는 protected 로 판정되지만, 오케스트레이터가 이번 실행을 「main working tree · master · sequential」 로 명시했다(19-01 과 같다). push 는 하지 않았다.

---

**Total deviations:** 2 auto-fixed (Rule 2 × 2) + 1 해석. **Impact:** 모두 원주문 보호와 입력 검증이다. 스키마·계약·반환 형식은 바꾸지 않았다.

## Issues Encountered
- Task 3 에서 plan 수를 80 으로 잘못 적었는데 검증 스크립트가 `# Looks like you planned 80 tests but ran 79` 를 내고도 PASS·exit 0 을 돌려줬다. 79 로 바로잡았다. 스크립트가 계획 수 불일치를 실패로 보지 않는 문제는 공용 스크립트라 범위 밖이어서 `deferred-items.md` 에 적었다.

## Known Stubs
- 없음. `dma_journal_project` 에서 「미구현 — 19-03」 RAISE 는 모두 없어졌다.

## Threat Flags
- 없음. 새 표면은 헬퍼 함수 `dma_journal_origin` 하나이고 service_role 전용 EXECUTE 이다(스키마 pgTAP 로 확인, T-19-01). 위협 등록부의 T-19-06·22·13·15·23 은 각각 단언 45-46 · 49/53 · message 분기 점검 · 75-77 · 68-72 로 완화를 확인했다.

## User Setup Required
None — 원격 반영은 19-11.

## Next Phase Readiness
- **19-05 (relay 기록기):** C·M 한 이벤트가 행 2개(자기 행 + 원주문)를 바꿀 수 있고, `apply` 반환 `rows` 에 둘 다 들어간다. 병합 키는 `id` + `last_seq`.
- **19-04 (server):** 조회 컬럼은 바뀌지 않았다(25컬럼). 거부 행은 `order_no` 가 NULL 이고 `reject_seq` 는 공개 컬럼에 없다. id 로 식별한다.
- **19-11:** 두 마이그레이션은 여전히 로컬 파일로만 있다. 이 plan 은 unpushed 파일 `20260924200100` 을 제자리에서 고쳤다.

## Self-Check: PASSED
- FOUND: supabase/migrations/20260924200100_dma_journal_rpcs.sql · supabase/tests/dma_journal_apply.test.sql · supabase/tests/dma_journal_schema.test.sql · deferred-items.md
- FOUND: 커밋 be5c1ef · 91ac129 · 9e8a067
- pgTAP 2파일 GREEN(79/79 · 93/93), acceptance 전 항목 PASS

---
*Phase: 19-account-order-journal*
*Completed: 2026-09-25*
