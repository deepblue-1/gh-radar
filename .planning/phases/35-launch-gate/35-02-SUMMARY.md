---
phase: 35-launch-gate
plan: 02
subsystem: database
tags: [postgres, supabase, pgtap, plpgsql, rpc, launch-gate]

requires: []
provides:
  - "public.launch_pieces · public.launch_heads (RLS 켬 · 정책 0 · service_role 전용 · 키에 fire_exchange)"
  - "launch_upsert_piece(jsonb, text) · launch_upsert_head(jsonb, text) — 최신 seq 우선 · journal > backfill 규칙 한 곳"
  - "launch_backfill_apply(jsonb, jsonb) — 백필 쓰기 입구(source=backfill 강제 · 호출 단위 원자)"
  - "launch_orders_for_admin(text) — 주문 내역 하루치 jsonb 1값"
  - "launch_map_for_admin(text, integer) — 경계 지도(q16 · n0930 · 최근 N 거래일 · 최신 머리)"
  - "인덱스 launch_pieces_fire_date_idx · pgTAP supabase/tests/launch_gate.test.sql(59 단언)"
affects: [35-03, 35-04, 35-05, 35-06, 35-09, 35-10]

actuals:
  tokens: 14714
  tasks: 2
  commits: 2
plan_head_before: 5f706d1731570265298e410c311f7cc61954daa9
plan_head_after: 65fc7af0

tech-stack:
  added: []
  patterns:
    - "조건부 upsert 헬퍼(jsonb 입력 = 표 열 이름 · ON CONFLICT … DO UPDATE … WHERE 규칙 · ROW_COUNT 로 bool 반환)"
    - "어드민 RPC = accum_report_for_user 틀에서 DMA 게이트를 뺀 jsonb 스칼라 1값"

key-files:
  created:
    - supabase/migrations/20261027200000_launch_gate.sql
    - supabase/tests/launch_gate.test.sql
  modified: []

key-decisions:
  - "35-02: launch_orders_for_admin 은 p_date 가 YYYYMMDD 8자리가 아니면 22023 — to_date 의 관대한 해석으로 엉뚱한 날을 돌려주지 않게(server zod 가 먼저 막으므로 정상 경로 영향 없음)"
  - "35-02: 지도 heads 는 DISTINCT ON (gateway, market, profile) — n0930 은 A · N 이 각 1행, A 의 KRX 09:00:27 머리는 어느 지도에도 없음"
  - "35-02: 백필 헬퍼는 들어온 journal_epoch · seq · gw_time_ms 를 지운다(입력에 실려 와도 무시) — 백필 행이 journal 행처럼 보이지 않게"

patterns-established:
  - "발사 표 응답 행 = to_jsonb(row) − created_at − updated_at + trade_date YYYYMMDD · fire_base HH24:MI:SS 덮어쓰기"

requirements-completed: []

coverage:
  - id: D1
    description: "첨부 한 발사(10/12 KB120 코스피 Q16 3조각 + 머리)가 launch_backfill_apply → 두 표 → launch_orders_for_admin 으로 나온다"
    requirement: "LAUNCH-02"
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_gate.test.sql (ok 1-11)"
        status: pass
    human_judgment: false
  - id: D2
    description: "upsert 규칙 행렬(조각 · 머리 각 8단계) · 도착 순서 무관 · A 두 다리 · CHECK 없음 · 필수 키 · 백필 원자성 · 백필이 journal 못 덮음"
    requirement: "LAUNCH-02"
    verification:
      - kind: integration
        ref: "supabase/tests/launch_gate.test.sql (ok 12-36)"
        status: pass
    human_judgment: false
  - id: D3
    description: "주문 내역 RPC 빈 날 · 날짜 목록 · stocks 조인 · 순서, 경계 지도 RPC q16 p_days 절단 · n0930 N+A · 지도 열 11개 · 최신 머리 · 22023"
    requirement: "LAUNCH-02"
    verification:
      - kind: integration
        ref: "supabase/tests/launch_gate.test.sql (ok 37-52)"
        status: pass
    human_judgment: false
  - id: D4
    description: "두 표 RLS 켬 · 정책 0 · anon/authenticated SELECT 불가 · 함수 5개 EXECUTE (f, f, t)"
    requirement: "LAUNCH-02"
    verification:
      - kind: integration
        ref: "supabase/tests/launch_gate.test.sql (ok 53-59)"
        status: pass
    human_judgment: false

duration: 약 20분
completed: 2026-10-27
status: complete
---

# Phase 35 Plan 02: 발사 표 · 적재 규칙 · 어드민 조회 RPC(DB) Summary

**launch_pieces · launch_heads(키에 fire_exchange) 위에 「최신 seq 우선 · journal > backfill」 조건부 upsert 헬퍼 2개, 백필 RPC, 주문 내역 · 경계 지도 어드민 RPC 2개를 올렸고, 전 마이그레이션 재생 위 pgTAP 59/59 로 잠갔다.**

## Performance

- **Duration:** 약 20분
- **Completed:** 2026-10-27
- **Tasks:** 2/2
- **Files:** 2개 생성

## Accomplishments

- **트레이서(Task 1).** 첨부 `pieces.json` 의 첫 발사(10/12 KB 코스피 wire 0~2 · rel −305 · −303 · −302 · 101)를 `launch_backfill_apply` 로 넣으면 `{pieces_in:3, pieces_written:3, heads_in:1, heads_written:1}` 을 돌려주고, `launch_orders_for_admin()` 이 dates `["20261012"]` 와 그 조각 3개 · 머리 1개를 정해진 모양으로 돌려준다.
- **규칙 한 곳.** `launch_upsert_piece` / `launch_upsert_head` 에 `WHERE t.source = 'backfill' OR (EXCLUDED.source = 'journal' AND (t.journal_epoch IS DISTINCT FROM EXCLUDED.journal_epoch OR EXCLUDED.seq >= t.seq))` 를 둔다. 백필은 무엇이든 덮이고, journal 은 journal 만 덮는다(같은 seq 의 재해석 포함). 백필이 journal 을 덮으려 하면 false 를 돌려준다.
- **경계 지도(Task 2).** `launch_map_for_admin`: `q16` = (KRX, 16:00:00), `n0930` = (NXT, 09:00:30 — N 매수 + A 매도). 날짜는 발사 기준별 거래일(A4)이고, 조각은 지도 열 11개, 머리는 서버 × 시장 × 프로파일별 최신 1행이다.

## RPC 응답 키 (35-03 · 35-05 · 35-06 계약)

- `launch_orders_for_admin(p_date text default null)` → `{dates: string[], date: string|null, heads: Head[], pieces: Piece[]}`
  - 빈 표: `{dates:[], date:null, heads:[], pieces:[]}`. 행 없는 p_date: `date = p_date`, heads · pieces 는 `[]`, dates 는 그대로 둔다.
  - Head = launch_heads 의 모든 열 − created_at − updated_at(`trade_date` "YYYYMMDD" · `fire_base` "HH:MM:SS"). 정렬은 gateway, market, fire_base, profile.
  - Piece = launch_pieces 의 모든 열 − created_at − updated_at + `stock_code` · `stock_name`(stocks 를 isin 으로 LEFT JOIN · 없으면 null). account · dma_user_id 를 포함한다(D-02). 정렬은 gateway, market, fire_base, fire_exchange, profile, wire.
- `launch_map_for_admin(p_fire 'q16'|'n0930', p_days integer default null)` → `{days: string[], heads: Head[], pieces: MapPiece[]}`
  - 빈 경우: `{days:[], heads:[], pieces:[]}`. days 는 내림차순 YYYYMMDD 이고 LIMIT p_days(null 이면 전체)다.
  - MapPiece = `trade_date` · `gateway` · `market` · `profile` · `fire_exchange` · `side` · `wire` · `piece_idx` · `sent_rel_us` · `result` · `retry`. 정렬은 trade_date, gateway, market, profile, wire 오름차순.
  - heads 는 주문 내역과 같은 모양이고 범위와 무관하게 최신 1행이다(gateway, market, profile 순).
  - 모르는 p_fire 와 p_days < 1 은 SQLSTATE 22023 이다.

## 열 계약

PLAN 의 「열 계약」 과 같다(열 순서 · 형 · NULL 허용 · CHECK 2개 · PK). **diff 없음.**

## pgTAP

`bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_gate.test.sql`: 83개 마이그레이션 재생, **ok 59 · not ok 0 · `# RESULT: PASS`**(로컬 일회용 컨테이너 · 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104`).

## Task Commits

1. **Task 1 (tracer): 표 2 · 잠금 · upsert 헬퍼 · 백필 · 주문 내역 RPC + 트레이서 pgTAP**: `c015342a`
2. **Task 2: 경계 지도 RPC + 규칙 행렬 · 빈 날 · A 두 다리 · CHECK 없음 · 권한 pgTAP**: `65fc7af0`

트레이서 게이트: Task 1 의 `<verify>` 를 다시 돌려 16/16 통과를 확인한 뒤 Task 2 로 넘어갔다.

## Files Created/Modified

- `supabase/migrations/20261027200000_launch_gate.sql`: 표 2 · 인덱스 · 잠금 · 함수 6개 · 권한
- `supabase/tests/launch_gate.test.sql`: pgTAP 59 단언

## Decisions Made

- `launch_orders_for_admin` 은 p_date 가 YYYYMMDD 형식이 아니면 22023 을 낸다(아래 편차 1).
- 백필 경로는 입력에 추적 열이 실려 와도 지운다. pgTAP 행렬 1단계가 `e0`/99 를 넣어 이를 확인한다.
- 지도 heads 의 DISTINCT ON 에 profile 을 포함한다. n0930 은 A · N 이 각 1행이다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 입력 검증] launch_orders_for_admin p_date 형식 검사 추가**
- **Found during:** Task 1
- **Issue:** `to_date(p_date, 'YYYYMMDD')` 는 형식이 틀린 값을 관대하게 해석해 엉뚱한 날을 돌려줄 수 있다.
- **Fix:** `p_date !~ '^[0-9]{8}$'` 이면 22023 을 낸다. server zod 가 먼저 막으므로 정상 경로에는 영향이 없다. pgTAP ok 43 으로 확인했다.
- **Files modified:** supabase/migrations/20261027200000_launch_gate.sql
- **Commit:** c015342a

**2. [Rule 2 - 입력 검증] upsert 헬퍼 p_row 객체 검사 · 오류 코드 22023 통일**
- **Found during:** Task 1
- **Issue:** p_row 가 null 이거나 객체가 아니면 jsonb_populate_record 오류 메시지가 불분명하다.
- **Fix:** 그 경우 명시적으로 RAISE 하고, p_source · 필수 키 · journal 추적 열 오류도 모두 `ERRCODE = '22023'` 으로 통일했다(throws_ok 로 확인).
- **Commit:** c015342a

**Total deviations:** 2건 자동 수정(입력 검증). 범위 확장은 없다.

## Issues Encountered

없음.

## Known Stubs

없음.

## Threat Flags

없음 — 새 표 · 함수는 PLAN threat 범위(service_role 전용 · 정책 0 · D-02 어드민 예외 주석) 안에 있다.

## User Setup Required

없음. 원격 적용(`supabase db push`)은 35-09 메인 세션 몫이다.

## Next Phase Readiness

- 35-03(shared 타입 · 백필 스크립트): 위 응답 키와 열 계약을 그대로 쓴다. 백필 쓰기는 `launch_backfill_apply` 만 쓴다.
- 35-04(apply 재정의): 해석 결과 jsonb 를 `launch_upsert_piece/head(…, 'journal')` 로 넘긴다(journal_epoch · seq 필수).
- 35-05(server 라우트): RPC 1회. 22023 은 400 으로 바꾼다.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261027200000_launch_gate.sql
- FOUND: supabase/tests/launch_gate.test.sql
- FOUND: c015342a
- FOUND: 65fc7af0
