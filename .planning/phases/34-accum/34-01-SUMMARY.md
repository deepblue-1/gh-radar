---
phase: 34-accum
plan: 01
status: complete
subsystem: database
tags: [postgres, supabase, pgtap, limitup-sync, accum_flow, rpc, tracer]

requires:
  - phase: 33
    provides: "limitup_commit_day 9쌍 · stage CHECK 9값 · purge team_flow(20261016200000) · team_flow 선택 파일 적재 · teamflow_report_for_user 틀"
provides:
  - "public.limitup_accum_flow 표(PK date, isin · 평평한 37열 + payload jsonb · RLS 정책 0 · service_role 전용)"
  - "limitup_stage_tbl_check 10값 · limitup_commit_day 10번째 쌍(키 있을 때만 이력) · timeout 120s 재진술 · purge accum_flow 90일"
  - "accum_report_for_user(uuid, text) · accum_detail_for_user(uuid, text, text) — DMA 게이트 · EXECUTE service_role 만"
  - "워커 OptionalTbl · OPTIONAL_FILES(team_flow chunk 20 · accum_flow chunk 1) · StageTbl accum_flow · p_expected 10키"
  - "10/14 6행 픽스처 workers/limitup-sync/tests/fixtures/accum_flow/20261014/accum_flow.ndjson.gz (워커 · 웹 · E2E 공용 원천)"
affects: [34-13, 34-03, 34-05, 34-11]

actuals:
  tokens: 11543
  tasks: 1
  commits: 2
plan_head_before: ae33bfa91fc1b2ec21896faed4b459bf7ceacfb1
plan_head_after: 858de35c6b53087a96c6974cad33cd2101902ab7

tech-stack:
  added: []
  patterns:
    - "선택 파일 목록(OPTIONAL_FILES) — 표 · 파일 · 청크를 한 줄로, 읽기 · stage 를 순회로"
    - "목록 RPC 는 열 명시 서브쿼리로 payload 를 읽지 않는다(TOAST 미해제)"

key-files:
  created:
    - supabase/migrations/20261020200000_limitup_accum_flow.sql
    - supabase/migrations/20261020200100_accum_report_rpc.sql
    - workers/limitup-sync/tests/fixtures/make-accum-fixture.mjs
    - workers/limitup-sync/tests/fixtures/accum_flow/20261014/accum_flow.ndjson.gz
  modified:
    - workers/limitup-sync/src/load.ts
    - workers/limitup-sync/src/index.ts
    - workers/limitup-sync/tests/load.test.ts
    - workers/limitup-sync/tests/dispatch.test.ts

key-decisions:
  - "accum_flow stage 청크 1행 — 최대 행 json ≈ 224KB 가 증명된 insert 본문 ≈ 293KB 안에 드는 유일한 값"
  - "재적재 감지는 team_flow 그대로 두고 TEAM_FLOW_FILE 참조만 OPTIONAL_FILES 의 team_flow 항목으로 바꿈 — 일반화는 34-03"
  - "상세 RPC 는 행이 없으면 {access:true, row:null}(200) — 404 로 바꾸지 않음(33 D-07 결)"

patterns-established:
  - "commit_day 에 표를 더할 때: v_tbls · CHECK · DELETE→INSERT 쌍 · IF p_expected ? '<tbl>' 이력 · timeout 재진술 · purge 한 줄을 한 마이그레이션에"

requirements-completed: []

coverage:
  - id: D1
    description: "limitup_accum_flow 표 · stage CHECK 10값 · commit_day 10번째 쌍 · purge — 전 마이그레이션 재생 위에서 기존 limitup_load pgTAP 218/218 통과"
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_load.test.sql"
        status: pass
  - id: D2
    description: "실 픽스처 6행이 limitup_commit_day 로 들어가 double · name null · payload 원문 보존 · 옛 워커 호출은 키 없이 DELETE 만"
    verification:
      - kind: integration
        ref: "임시 pgTAP 8건(스크래치 — 저장소에 커밋하지 않음 · 정식 섹션 K 는 34-05)"
        status: pass
  - id: D3
    description: "워커가 accum_flow 를 1행 청크로 stage(insert 6회 · seq 1..6 · payload deep-equal) · p_expected.accum_flow 6 · 파일 없음 0 · 행 수 불일치 실패"
    verification:
      - kind: unit
        ref: "workers/limitup-sync/tests/dispatch.test.ts#dispatch — accum_flow 선택 파일(D-02)"
        status: pass
  - id: D4
    description: "accum_report_for_user(평평한 37열만) · accum_detail_for_user(payload 포함) — 마이그레이션 재생 통과(정식 RPC pgTAP 는 34-05)"
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_load.test.sql (재생 77 마이그레이션)"
        status: pass

duration: 6min
completed: 2026-10-20
---

# Phase 34 Plan 01: 매집감지 적재 경로 (트레이서 전반) Summary

**limitup_accum_flow 표 + commit_day 10번째 쌍 + 목록/상세 분리 RPC 2개, 그리고 워커 선택 파일 목록화(accum_flow 1행 청크). 10/14 실 샘플 6행 픽스처로 stage부터 commit까지 증명했다.**

## Performance

- **Duration:** ~6분 (C1 커밋 22:06 · C2 커밋 22:07 KST, 읽기 시간 포함하면 더 김)
- **Completed:** 2026-10-20
- **Tasks:** 1 (tracer · 층 커밋 2개)
- **Files modified:** 8 (신규 4 · 수정 4)

## 34-13 이 받아 쓸 계약

**픽스처**
- 경로: `workers/limitup-sync/tests/fixtures/accum_flow/20261014/accum_flow.ndjson.gz`
- sha256: `8037c4e5e896410d122d45039434285cd1afb9878cedbc2e1f20f3131f2a05a8` (gzip 90,404 B · 헤더 mtime 0)
- 6행, isin 순서: `KR7000650002`(천일고속 · 상한가 · orders 45 · first 1) · `KR7011151008`(CJ씨푸드1우 · orders 0 · pnl null) · `KR7084670009`(동양고속) · `KR7452280001`(한선엔지니어링 · json 223,707 B) · `KRA0113321F5`(name null) · `KYG2114A1094`(씨엑스아이 · 비 KR ISIN)
- 각 행 = 평평한 37열 + `payload`(키 38개). 원천 줄을 그대로 옮겼다(재직렬화 없음). 생성기는 `workers/limitup-sync/tests/fixtures/make-accum-fixture.mjs`.
- 이 샘플은 모의 등록 줄이라 6행 모두 `state 1 · end_reason 0 · cycle 1 · pos_net_krw 162312900` 이 같다. 정렬이나 종료 사유를 확인하는 웹 픽스처는 로더에서 값을 덮어써야 한다.

**RPC**
- `accum_report_for_user(p_user_id uuid, p_date text DEFAULT NULL) → jsonb`
  - `{access:false}` (dma_visible_accounts 0행)
  - `{access:true, dates:[], date:null, rows:[]}` (표 0행)
  - `{access:true, dates, date, rows}`: dates 는 행 있는 날짜 내림차순, date 는 `p_date` 또는 최신. rows 는 평평한 37열 snake_case이며 **payload 키가 없다**. 순서는 `state, pos_net_krw DESC NULLS LAST, isin`.
- `accum_detail_for_user(p_user_id uuid, p_date text, p_isin text) → jsonb`
  - `{access:false}` / `{access:true, row}`: row 는 `to_jsonb(행)`(37열 + `payload`)이고 없으면 `null`(200).
- 두 함수 모두 STABLE · SECURITY INVOKER · `search_path = public, pg_temp`이고 EXECUTE 는 service_role 만 가진다.

## Accomplishments
- 마이그레이션 A `20261020200000_limitup_accum_flow.sql`
  - 표(FLAT_COLUMNS 순서, rate 는 double, 정수 5열은 integer, 나머지는 bigint) · 잠금 4줄 · 정책 0
  - CHECK 10값(IF EXISTS 없이 DROP)
  - commit_day: 20261016200000 본문 + 10번째 쌍. 이력 키는 `IF p_expected ? 'accum_flow'` 일 때만 쓴다.
  - timeout 120s 재진술 · purge `deleted.accum_flow`
- 마이그레이션 B `20261020200100_accum_report_rpc.sql`
  - 목록 RPC 는 37열을 명시한 서브쿼리라 payload 를 읽지 않는다.
  - 상세 RPC 는 PK 로 조회한다.
  - 권한은 함수당 3줄씩 6줄.
- 워커
  - `OptionalTbl` · `OPTIONAL_FILES`로 바꿨고, 읽기와 stage 를 선택 파일 순회로 돈다.
  - `STAGE_TABLES` 는 10표이고 `p_expected` 도 10키다.
  - 재적재 감지(team_flow) 동작은 바꾸지 않았다.

## Task Commits

1. **C1: 픽스처 + SQL** - `fc5914ce` (feat): 매집감지 표 · commit_day 10번째 쌍 · 목록/상세 RPC 마이그레이션 + 10/14 픽스처
2. **C2: 워커** - `858de35c` (feat): limitup-sync 선택 파일 목록화 · accum_flow stage

## Verification
- **C1:** 픽스처 6행 · `export/20261014` 없음 · grep 5건 모두 통과했다.
- **C1 pgTAP:** `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_load.test.sql` 결과 **ok 218/218 · not ok 0 · RESULT: PASS**(77 마이그레이션 재생, 옛 워커 rows 키 8개 단언 포함). **pgTAP 실행됨.**
- **추가 스모크(임시, 커밋 안 함):** 같은 러너로 실 픽스처 6행을 stage 해 `limitup_commit_day({"accum_flow":6})` 를 돌렸고 8/8 통과했다.
  - rows 6 · `last_rate` 29.78 double · name null · 한선엔지니어링 orders 501 · payload deep-equal
  - 옛 워커 호출(`{}`)은 rows 에 accum_flow 키를 쓰지 않고 그날 행을 비운다.
- **C2:** shared build · limitup-sync typecheck 통과. vitest dispatch · load · dispatch-dryrun-totals **57/57**, limitup-sync 전체 **116/116**.
- **수용 기준:**
  - `CREATE POLICY` 0개 · `REVOKE EXECUTE` 4줄
  - 두 커밋에 `packages/` · `server/` · `webapp/` 경로 없음
  - `AF_SHA` 가 shasum 값과 같다.

## Decisions Made
- 테스트 (a)는 `p_expected.accum_flow === 6` 만 보지 않고 `toEqual({ ...EXPECTED10, accum_flow: 6 })` 로 키 집합 전체를 단언하게 강화했다. team_flow 테스트(34행)도 같은 꼴로 바꿨다.
- (d) 공존 테스트는 「insert 하나에 tbl 이 하나뿐」 도 단언한다.

## Deviations from Plan

계획대로 실행했다. 범위 밖 변경은 없다.

## Issues Encountered
- 임시 스모크 SQL 이 처음에 `plan()` 없음으로 실패했다. 테스트 파일이 `CREATE EXTENSION pgtap` 을 직접 해야 해서 한 줄 추가했다(스크래치 파일만 고쳤고 저장소 변경은 없다).

## Next Phase Readiness
- 34-13 은 위 「계약」 의 픽스처 경로 · sha · isin 순서와 RPC 응답 키를 그대로 받아 shared → server → web 을 잇는다.
- 34-03(재적재 감지 일반화) · 34-05(pgTAP 섹션 K · accum_report.test.sql) · 34-11(원격 db push)이 남아 있다.
- 원격 DB 에는 아직 적용하지 않았다(커밋만).

## Self-Check: PASSED
- FOUND: 신규 4파일 · 수정 4파일
- FOUND: fc5914ce · 858de35c (HEAD 조상)

---
*Phase: 34-accum*
*Completed: 2026-10-20*
