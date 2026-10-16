---
phase: 33-teamflow
plan: 01
subsystem: database, worker, api, ui
tags: [supabase, postgres, plpgsql, limitup-sync, express, zod, nextjs, react, vitest, rtl, teamflow]

# Dependency graph
requires:
  - phase: limitup report (20261006 마이그레이션 · limitup-sync · /analytics/limitup)
    provides: limitup_commit_day 원자 교체 경로 · limitup_stage · dma_visible_accounts 게이트 · LimitupDateNav · dateNavOf · DmaGate
provides:
  - "public.limitup_team_flow 표(PK date,isin · 29열 + schema_version + payload) · 잠금 4줄 · 접근 규칙 0"
  - "limitup_stage_tbl_check 9값 · limitup_commit_day 9번째 쌍(p_expected ? 'team_flow' 일 때만 rows 키) · statement_timeout 120s 재진술 · limitup_purge_old team_flow"
  - "teamflow_report_for_user(uuid, text) — {access:false} | {access:true, dates, date, rows}"
  - "워커 TEAM_FLOW_FILE 선택 분기 · TEAM_FLOW_STAGE_CHUNK=20 · counts.team_flow 늘 기록"
  - "shared TeamflowRow · TeamflowPayload · TeamflowBand · TeamflowBucket · TeamflowWindow · TeamflowMembers · TeamflowReportResponse"
  - "GET /api/teamflow/report?d=YYYYMMDD (requireAuth 만 · RPC 1회)"
  - "/analytics/teamflow 페이지 셸 · 아코디언(기본 전부 접힘) · 펼침 요약 블록 · 빈 상태 2종 · DmaGate 「팀 매집」"
  - "10/14 실측 픽스처(34행 · sha256 f6656ae2…d897)"
affects: [33-02, 33-03, 33-04, 33-05, 33-06, 33-07, 33-08, 33-09]

# Actuals (#2632)
actuals:
  tokens: 26900
  tasks: 2
  commits: 4
plan_head_before: be1b96a24c6ca630c32a4cdd055c58f243a436a1
plan_head_after: 57b947cd6131f8af5e002c0b53f1da7bd6c7a550

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "선택 export 파일 = 필수 6표 루프 밖 분기 + p_expected 에 0 키 항상 · commit_day 는 키 있을 때만 limitup_loads.rows 기록(옛 워커 호환)"
    - "큰 행(≈14KB) 표는 표 전용 소청크 stage(min(stageChunk, 20))"
    - "CREATE OR REPLACE 로 commit_day 를 다시 쓸 때 ALTER FUNCTION … SET statement_timeout 재진술"
    - "보고서 게이트는 RPC 안(dma_visible_accounts) · 라우트는 requireAuth 하나 · 왕복 1회"
    - "요약 문장의 <b> 는 summaryPartsOf 조각 배열 → React strong(HTML 문자열 주입 경로 없음)"

key-files:
  created:
    - supabase/migrations/20261016200000_limitup_team_flow.sql
    - supabase/migrations/20261016200100_teamflow_report_rpc.sql
    - workers/limitup-sync/tests/fixtures/team_flow/20261014/team_flow.ndjson.gz
    - packages/shared/src/teamflow-report.ts
    - server/src/schemas/teamflow-report.ts
    - server/src/services/teamflow-report.ts
    - server/src/routes/teamflow-report.ts
    - server/tests/routes/teamflow-report.test.ts
    - webapp/src/lib/teamflow-api.ts
    - webapp/src/lib/teamflow-report.ts
    - webapp/src/app/analytics/teamflow/page.tsx
    - webapp/src/components/analytics/teamflow-report.tsx
    - webapp/src/components/analytics/teamflow-day-grid.tsx
    - webapp/src/components/analytics/teamflow-detail.tsx
    - webapp/src/test-fixtures/teamflow-export.ts
    - webapp/src/components/analytics/__tests__/teamflow-report.test.tsx
  modified:
    - workers/limitup-sync/src/load.ts
    - workers/limitup-sync/src/index.ts
    - workers/limitup-sync/tests/load.test.ts
    - workers/limitup-sync/tests/dispatch.test.ts
    - packages/shared/src/index.ts
    - server/src/schemas/limitup-report.ts
    - server/src/app.ts
    - webapp/src/components/trading/dma-gate.tsx

key-decisions:
  - "TeamflowDetail 은 day-grid 의 teamflowRowButtonId 를 import 하지 않고 labelledBy prop 으로 받는다 — day-grid ↔ detail import 순환 회피(LimitupEventCard 동형) · 렌더되는 aria-labelledby 값은 동일"
  - "xl 행은 최종 7열 그리드 템플릿을 미리 깔고 이 플랜은 1·2·3·7열(종목 · 결과 태그 · 팀 순매수 · 셰브론)만 채운다 — 나머지 열은 33-03 이 가산"
  - "server 라우트 테스트의 RPC payload 는 합성 행 대신 실제 10/14 픽스처 첫 행 — 같은 행 모양이 워커 → server → web 을 관통함을 트레이서로 강화"
  - "pgTAP 러너 이미지 public.ecr.aws/supabase/postgres:17.6.1.104 는 사용자 승인으로 로컬에 받음 — 33-02 Task 2 의 SQL 회귀 실행 준비 완료"

patterns-established:
  - "선택 export 표 추가 절차: stage CHECK 정확한 이름 DROP/ADD → commit_day v_tbls + DELETE→INSERT 쌍 + 키 조건부 rows → timeout 재진술 → purge"
  - "팀 매집 표시 변환은 lib/teamflow-report.ts 한 모듈(fmtEok 반올림 억 1자리 · 0.0억 무부호 · 조 변환 없음)"

requirements-completed: [TEAM-01, TEAM-02, TEAM-03, TEAM-04]

coverage:
  - id: D1
    description: "워커가 manifest 에 team_flow.ndjson.gz 가 있는 날짜를 tbl='team_flow' 20행 청크(seq 1..34 · payload 원문)로 stage 하고 p_expected.team_flow=34 로 commit · 파일 없는 날은 0 · 행 수 불일치 날짜만 실패"
    requirement: TEAM-01
    verification:
      - kind: unit
        ref: "workers/limitup-sync/tests/dispatch.test.ts#team_flow 선택 파일(D-02)"
        status: pass
      - kind: unit
        ref: "workers/limitup-sync/tests/load.test.ts · tests/dispatch-dryrun-totals.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "마이그레이션 2개(limitup_team_flow 표 · CHECK 9값 · commit_day 9번째 쌍 · 120s 재진술 · purge · teamflow_report_for_user)"
    requirement: TEAM-01
    verification:
      - kind: other
        ref: "33-01-PLAN Task 1 C1 verify (정적 grep · 픽스처 sha)"
        status: pass
    human_judgment: true
    rationale: "SQL 은 정적 검사만 통과 — 한 번도 실행되지 않았다. 실행 검증은 33-02 Task 2 pgTAP(이미지 준비됨) 몫"
  - id: D3
    description: "GET /api/teamflow/report — requireAuth · zod d · RPC 1회 · 403 DMA_UNMAPPED · 400 · 500 원문 비노출 · 200 snake_case 그대로"
    requirement: TEAM-02
    verification:
      - kind: integration
        ref: "server/tests/routes/teamflow-report.test.ts (8케이스) + tests/routes/limitup-report.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "/analytics/teamflow 목록 34행(team_net_val 내림차순 · 첫 행 한선엔지니어링 +5.9억) · 기본 전부 접힘 · 빈/오류/게이트/?d 정본화 · 문서 제목"
    requirement: TEAM-03
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/analytics/__tests__/teamflow-report.test.tsx (a)(d)(e)(f)(g)(h)(i)"
        status: pass
    human_judgment: false
  - id: D5
    description: "행 펼침 → section#tf-{isin} 요약 번호 목록 · <b> 조각만 strong · 허용 밖 태그 제거 · 한 번에 하나 · 재클릭 접힘"
    requirement: TEAM-04
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/analytics/__tests__/teamflow-report.test.tsx (b)(c)(j)"
        status: pass
    human_judgment: false
  - id: D6
    description: "pgTAP 러너 이미지 로컬 보유(Wave 0)"
    verification:
      - kind: other
        ref: "docker image inspect public.ecr.aws/supabase/postgres:17.6.1.104 --format '{{.Id}}' → sha256:eefa6c87e0fa7ae2a7b770dfbaf4bc5b97cb39812a3472ee5be1cc239c4607d2"
        status: pass
    human_judgment: false

# Metrics
duration: 23min
completed: 2026-10-16
status: complete
---

# Phase 33 Plan 01: 팀 매집 트레이서 Summary

**10/14 실측 team_flow 픽스처 34행이 limitup-sync 선택 파일 분기(20행 소청크 stage) → limitup_commit_day 7번째 표(키 조건부 rows · 120s 재진술) → teamflow_report_for_user(DMA 게이트) → GET /api/teamflow/report → /analytics/teamflow 기본 접힘 목록 · 펼침 요약(strong 조각)까지 한 경로로 관통**

## Performance

- **Duration:** 23 min (pgTAP 이미지 승인 대기 포함)
- **Started:** 2026-10-16T06:10:27Z
- **Completed:** 2026-10-16T06:33:03Z
- **Tasks:** 2 (트레이서 1 · 체크포인트 1)
- **Files modified:** 24

## Accomplishments

- DB: `limitup_team_flow` 표(29열 + schema_version + payload · 잠금 4줄 · 접근 규칙 0) · stage CHECK 9값(정확한 이름 DROP) · `limitup_commit_day` 9번째 DELETE→INSERT 쌍(`p_expected ? 'team_flow'` 일 때만 rows 키 — 옛 워커 호환, 시그니처 불변) · `statement_timeout = '120s'` 재진술 · `limitup_purge_old` team_flow · `teamflow_report_for_user` RPC(SECURITY INVOKER · service_role 만 EXECUTE)
- 워커: `TEAM_FLOW_FILE` 선택 분기(필수 6표 루프 밖) · `TEAM_FLOW_STAGE_CHUNK = 20` · `counts.team_flow` 늘 기록 · 행 수 불일치 시 그 날짜만 실패 · `EXPORT_TABLES` 6개 그대로
- shared/server: Teamflow 타입 일체 · `Ymd` export 승격 · `GET /api/teamflow/report`(requireAuth 하나 · RPC 1회 · 403/400/500/200)
- web: `/analytics/teamflow` 상태기계(loading · error · gate · ready · 빈 상태 2종 · ?d 정본화 · 문서 제목) · 아코디언(기본 전부 접힘 · 한 번에 하나 · 점프 보정) · 요약 블록(번호 원 · strong 조각 · 사실 줄 칸째 생략) · DmaGate 「팀 매집」
- Wave 0: pgTAP 러너 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104` 로컬 보유 확인(`sha256:eefa6c87e0fa…07d2`) — **33-02 Task 2 의 SQL 회귀가 이제 이 이미지로 돌 수 있다**

## Task Commits

1. **Task 1 (tracer) C1: 픽스처 + 마이그레이션 2개** - `3bedb778` (feat)
2. **Task 1 (tracer) C2: 워커 team_flow 선택 파일 stage** - `0a63a332` (feat)
3. **Task 1 (tracer) C3: shared 타입 + GET /api/teamflow/report** - `bf316358` (feat)
4. **Task 1 (tracer) C4: /analytics/teamflow 목록 + 펼침 요약** - `57b947cd` (feat)
5. **Task 2 (checkpoint:human-action): pgTAP 러너 이미지 받기** - 커밋 없음(사용자 승인 「이미지 받음」 → `docker image inspect` exit 0 확인)

**Plan metadata:** 이 SUMMARY 와 STATE/ROADMAP 의 docs 커밋

## Files Created/Modified

- `supabase/migrations/20261016200000_limitup_team_flow.sql` - 표 · 잠금 · CHECK 9값 · commit_day 교체 · timeout 재진술 · purge 교체
- `supabase/migrations/20261016200100_teamflow_report_rpc.sql` - teamflow_report_for_user(uuid, text)
- `workers/limitup-sync/src/load.ts` · `src/index.ts` - 상수 · StageTbl · 선택 분기 · 소청크 stage
- `workers/limitup-sync/tests/{load,dispatch}.test.ts` - 9키 단언 · 「team_flow 선택 파일(D-02)」 describe
- `workers/limitup-sync/tests/fixtures/team_flow/20261014/team_flow.ndjson.gz` - 맥 샘플 바이트 사본(34행)
- `packages/shared/src/teamflow-report.ts` · `index.ts` - 응답 계약 타입 · 재export
- `server/src/schemas/{limitup-report,teamflow-report}.ts` · `services/teamflow-report.ts` · `routes/teamflow-report.ts` · `app.ts` - 라우트 3종 · 등록
- `server/tests/routes/teamflow-report.test.ts` - 8케이스
- `webapp/src/lib/teamflow-api.ts` · `lib/teamflow-report.ts` - fetch(15초) · 표시 변환
- `webapp/src/app/analytics/teamflow/page.tsx` · `components/analytics/teamflow-{report,day-grid,detail}.tsx` - 페이지 · 아코디언 · 요약
- `webapp/src/components/trading/dma-gate.tsx` - DmaGateSurface 「팀 매집」
- `webapp/src/test-fixtures/teamflow-export.ts` · `components/analytics/__tests__/teamflow-report.test.tsx` - 픽스처 로더 · RTL (a)~(j)

## Decisions Made

- 보고서 게이트는 RPC 안(`dma_visible_accounts`) · 라우트는 `requireAuth()` 하나(플랜 D-05 그대로).
- 사실 줄 null 은 Copywriting 정본대로 「칸째 생략」(플랜 Flagged assumption 그대로).
- 아래 Deviations 3건.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] day-grid ↔ detail import 순환 회피**
- **Found during:** Task 1 C4
- **Issue:** 플랜은 `TeamflowDetail` 이 `teamflowRowButtonId` 를 day-grid 에서 import 하라고 했으나 day-grid 가 detail 을 import 하므로 순환 import 가 된다.
- **Fix:** `TeamflowDetail` 이 `labelledBy` prop 으로 버튼 id 를 받는다(LimitupEventCard 동형). 렌더되는 `aria-labelledby` 값은 `teamflow-row-{isin}` 으로 동일.
- **Files modified:** webapp/src/components/analytics/teamflow-detail.tsx, teamflow-day-grid.tsx
- **Verification:** RTL (b) — `section#tf-KR7000650002` 의 aria-labelledby · 접근 이름 단언 통과
- **Committed in:** 57b947cd

**2. [범위 메모] xl 행 7열 템플릿 중 1·2·3·7열만 채움**
- **Found during:** Task 1 C4
- **Issue/의도:** 행 그리드는 최종 7열 템플릿으로 깔았지만 이 플랜은 종목 · 결과 태그 · 팀 순매수 · 셰브론만 채운다. xl 열 머리 · 20% 아래/위 · 매수 중 팀 · 미니막대는 33-03 이 가산(플랜이 가산으로 명시).
- **Committed in:** 57b947cd

**3. [트레이서 강화] server 테스트 RPC payload 를 실제 픽스처 행으로**
- **Found during:** Task 1 C3
- **Fix:** 합성 행 대신 10/14 픽스처 첫 행을 RPC 응답으로 써서 같은 행 모양이 워커 → server → web 을 관통함을 증명.
- **Files modified:** server/tests/routes/teamflow-report.test.ts
- **Committed in:** bf316358

---

**Total deviations:** 3 (Rule 1 1건 · 범위 메모 1건 · 테스트 강화 1건)
**Impact on plan:** 모두 동작 동일 또는 검증 강화. 범위 확장 없음.

## Verification

- C1~C4 층 verify 각각 exit 0 · C4 전 층 체인 재실행 exit 0
- 워커 targeted 43/43 · limitup-sync 전체 102/102 · server 29/29 · webapp typecheck/eslint clean · RTL 22/22
- acceptance grep 전부 통과(`DROP CONSTRAINT IF EXISTS` 0 · `create policy` 0 · `requireDmaMapped` 0 · `dangerouslySetInnerHTML` 0 · `formatTradeAmount` 0)
- Task 2: `docker image inspect public.ecr.aws/supabase/postgres:17.6.1.104 --format '{{.Id}}'` → `sha256:eefa6c87e0fa7ae2a7b770dfbaf4bc5b97cb39812a3472ee5be1cc239c4607d2` (exit 0)

## 검증 공백

- **SQL 미실행:** 마이그레이션 2개는 정적 검사(grep)만 통과했고 한 번도 실행되지 않았다. pgTAP 러너 이미지는 이제 로컬에 있으므로 실행 검증은 33-02 Task 2(pgTAP `teamflow_report.test.sql` 신규 · `limitup_load.test.sql` 확장)에서 한다.

## Issues Encountered

None

## User Setup Required

None - 외부 서비스 설정 없음(이미지 pull 은 완료).

## Next Phase Readiness

- Ready for 33-02(워커 needTeamFlow 감지 · pgTAP · smoke INV-8) — pgTAP 이미지 준비됨.
- 33-03 이 xl 열 · KPI · 밴드 스트립을 같은 그리드 템플릿에 가산.

---
*Phase: 33-teamflow*
*Completed: 2026-10-16*

## Self-Check: PASSED
