---
phase: 33-teamflow
verified: 2026-10-16T09:15:00Z
status: passed
score: 5/6 must-haves verified
covered_files:
  - ".planning/phases/33-teamflow/33-01-PLAN.md"
  - ".planning/phases/33-teamflow/33-01-SUMMARY.md"
  - ".planning/phases/33-teamflow/33-02-PLAN.md"
  - ".planning/phases/33-teamflow/33-02-SUMMARY.md"
  - ".planning/phases/33-teamflow/33-03-PLAN.md"
  - ".planning/phases/33-teamflow/33-03-SUMMARY.md"
  - ".planning/phases/33-teamflow/33-04-PLAN.md"
  - ".planning/phases/33-teamflow/33-04-SUMMARY.md"
  - ".planning/phases/33-teamflow/33-05-PLAN.md"
  - ".planning/phases/33-teamflow/33-05-SUMMARY.md"
  - ".planning/phases/33-teamflow/33-06-PLAN.md"
  - ".planning/phases/33-teamflow/33-06-SUMMARY.md"
  - ".planning/phases/33-teamflow/33-07-PLAN.md"
  - ".planning/phases/33-teamflow/33-07-SUMMARY.md"
  - ".planning/phases/33-teamflow/33-08-PLAN.md"
  - ".planning/phases/33-teamflow/33-08-SUMMARY.md"
  - ".planning/phases/33-teamflow/33-09-PLAN.md"
  - ".planning/phases/33-teamflow/33-09-SUMMARY.md"
  - "server/src/routes/teamflow-report.ts"
  - "server/src/services/teamflow-report.ts"
  - "supabase/migrations/20261016200000_limitup_team_flow.sql"
  - "supabase/migrations/20261016200100_teamflow_report_rpc.sql"
  - "webapp/src/components/analytics/teamflow-band-chart.tsx"
  - "webapp/src/components/analytics/teamflow-bucket-chart.tsx"
  - "webapp/src/components/analytics/teamflow-day-grid.tsx"
  - "webapp/src/components/analytics/teamflow-detail.tsx"
  - "webapp/src/components/analytics/teamflow-members.tsx"
  - "webapp/src/components/analytics/teamflow-report.tsx"
  - "webapp/src/components/layout/app-sidebar.tsx"
  - "workers/limitup-sync/src/index.ts"
  - "workers/limitup-sync/src/load.ts"
covered_digest: "v3:sha256:c7d344ea534f5aecfab64ddfe9f632a2c9a2b73ccaa75f8a8acd4a7c7853827a"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "프로덕션 /analytics/teamflow?d=20261014 첫 로드 시간 측정(응답 ≈ 487KB — 새로고침 후 목록이 뜰 때까지 초 단위로 기록)"
    expected: "RESEARCH Pitfall 6 이 잡은 15초 타임아웃 안에서, 체감상 허용 범위(수 초)로 목록이 뜬다"
    why_human: "플랜 33-09 truth 가 「첫 로드 시간까지 확인하고 결과가 SUMMARY 에 있다」 를 요구하지만 UAT 답 「전부 통과」 에 수치가 없어 ⑧ 이 미기록이다. 로그인 세션이 필요해 verifier 가 프로덕션에서 잴 수 없고, E2E 는 네트워크를 목으로 대체하므로 못 잰다"
---

# Phase 33: 팀 매집(teamflow) 보고서 검증 보고서

**Phase Goal:** gh-trade 119 밤 배치가 내보내는 `team_flow.ndjson.gz` 가 Supabase 에 적재되고, 「분석 › 팀 매집」 `/analytics/teamflow?d=YYYYMMDD` 에서 상한가 보고서(011 A)와 같은 틀로 하루 탐지 종목 목록(스케치 014 A · 기본 전부 접힘)과 행 펼침 상세(스케치 015 C 혼합)가 읽힌다
**Verified:** 2026-10-16T09:15:00Z
**Status:** human_needed
**Re-verification:** 아니오 — 최초 검증

## 판정 요약

SUMMARY 의 주장이 아니라 코드를 직접 읽어 확인했다. 로드맵 성공 기준 5개는 모두 코드로 확인했고 BLOCKER 는 없다. 남은 것은 UAT ⑧ 「첫 로드 시간」 이 미기록인 점 하나다. 플랜 33-09 가 요구한 항목이고 verifier 가 대신 잴 수 없어 `human_needed` 로 둔다. 코드 리뷰 WR-01 · WR-02 는 처분 장부에 open 이고, 둘 다 phase 목표를 막지 않는 WARNING 으로 기록한다.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | (SC1) limitup-sync 가 manifest `files[]` 에 `team_flow.ndjson.gz` 가 있으면 sha256 대조 · 날짜 단위 교체로 `team_flow` 표(평평한 열 + `payload` jsonb)에 적재하고, 파일이 없는 날짜는 기존 6표 적재에 영향이 없다 | ✓ VERIFIED | `workers/limitup-sync/src/index.ts:222-273` — `tfEntry` 가 있을 때만 `readNdjsonGz` + 행 수 대조, 없으면 `[]` 에 `counts.team_flow = 0`. `verifyFiles`(index.ts:244)가 manifest 의 모든 파일 sha256 을 대조하므로 team_flow 도 포함. 마이그레이션 `20261016200000` — `limitup_team_flow` 29열 + `schema_version` + `payload jsonb`, `limitup_commit_day` 9번째 DELETE→INSERT 쌍(같은 트랜잭션), `p_expected ? 'team_flow'` 일 때만 이력 키 기록(옛 워커 호환), `statement_timeout` 재진술. 워커 vitest 108 통과를 직접 재실행으로 확인. 원격 적용 + INV-8 `db=34 manifest=34`(33-08 SUMMARY) |
| 2 | (SC2) 서버가 RPC 1회로 날짜 목록 · 종목 행 · 상세 payload 를 내주고(DMA 게이트는 RPC 안 · 라우트는 인증만), 사이드바 「분석」 에 「팀 매집」 항목이 생긴다 | ✓ VERIFIED | `20261016200100` — `teamflow_report_for_user` 가 `dma_visible_accounts` 로 게이트 → `{access:false}`, 아니면 `{access, dates, date, rows}` jsonb 스칼라 1개. 서버 서비스는 RPC 를 1회 호출하고 `access !== true` 면 `DmaUnmapped`(403). 라우트는 `requireAuth()` 하나만 쓰고 `server/src/app.ts:111` 에 마운트. 권한은 REVOKE PUBLIC · anon · authenticated + service_role GRANT, 표는 RLS 활성 + 정책 0. 사이드바 `app-sidebar.tsx:183,592,681` `NAV_TEAMFLOW`. server 라우트 테스트 10건 · 사이드바 테스트 83건 통과를 재실행으로 확인. 배포 후 무인증 401 확인(33-08 SUMMARY) |
| 3 | (SC3) 목록 = 날짜 알약 → KPI 4칸 → 종목 행(결과 · 팀 순매수 · 20% 아래/위 · 매수 중 팀 · 9칸 미니막대 · 상한가/미도달 태그) · 한 번에 하나 · 기본 전부 접힘 · 폰 390 은 2줄 카드형 | ✓ VERIFIED | `teamflow-report.tsx` — `PageHeader` + `LimitupDateNav`, `TeamflowKpiStrip`, `TeamflowDayGrid`. `teamflow-day-grid.tsx:79` `useState<string \| null>(null)` 로 열린 행 하나만 두고 초기값 null(전부 접힘), `aria-expanded` 연결. 열 머리 · `teamflow-band-strip` · tag · share · 20% 아래/위 슬롯 확인. 카드형 레이아웃은 E2E 390 단언(33-04 TF-B1~B3 · 33-07)이 잠그고, 사용자 라이브 UAT ②⑦ 통과 |
| 4 | (SC4) 펼친 상세 = 요약 → [구간 가로 막대 \| 거래원 2단 막대] 2열(폰 1열) → 10분 흐름 차트 → 판정 기준 접힘. 차트 규칙(0선 · +빨강/−파랑 · 20% 점선 · 팀 비중 ≥ 30% 보라 · `<title>` 툴팁), 「구간표 보기」 · 「10분 표 보기」 기본 접힘, 팀 체결이 거의 없는 종목도 빈 차트가 깨지지 않는다 | ✓ VERIFIED | `teamflow-detail.tsx` 렌더 순서 = 요약 → `grid xl:grid-cols-2`(`teamflow-bands` \| `TeamflowMembers`) → `teamflow-buckets` → `teamflow-rules`. `teamflow-band-chart.tsx` 에 중앙 0선 · `y20` 점선 `strokeDasharray` · `--up`/`--down` · `isHotShare` → `--team` · 행마다 `<title>`. `teamflow-bucket-chart.tsx` 에 최대 매집 창 음영(`--team-bg`) · 0선 · 20% 점선 · 팀 비중 선(`--team`, 결측에서 끊김) · 등락률 띠 · 첫 상한가 세로선 · 칸마다 `<title>`. `TeamflowToggle` 두 개 + 판정 기준 토글. 거래원 막대는 값 ÷ max(buy, sell). webapp teamflow 단위 테스트 249건 통과를 재실행으로 확인(detail 22 · chart 24 · report 33 · 컴포넌트 16). 동양고속형은 E2E TF6 + 라이브 UAT ⑤ 통과 |
| 5 | (SC5) 단위 · E2E(limitup-report 동형 fixture) 통과 · 10/14 실측 3종목 라이브 UAT · 인박스 `261016-teamflow-export.md` 를 `status: done` 으로 닫는다 | ✓ VERIFIED | 단위는 위 재실행으로 확인. E2E 25건과 pgTAP 218/28/54 는 33-07 · 33-08 이 기록한 것이라 재실행하지 않았다(규칙상 Playwright · pgTAP 재실행 금지). 이 둘은 SUMMARY 기록에 의존한다. 인박스는 `status: done` · `done_commit: 5d6e2499` 를 직접 확인. 라이브 UAT = 사용자 답 「전부 통과」(10/14 에스엠벡셀 · 한선엔지니어링 · 동양고속 · 천일고속 + 390 · 다크) |
| 6 | (플랜 33-09 truth) 라이브 UAT 에서 첫 로드 시간까지 확인하고 결과가 SUMMARY 에 있다 | ? UNCERTAIN | 33-09 SUMMARY · 33-VALIDATION 모두 ⑧ 「미기록」 이라고 적었다. 응답 ≈ 487KB 에 대한 15초 타임아웃은 `teamflow-api.ts` 에 코드로 있지만, 실제 체감 시간은 아무 증거가 없다. 로드맵 성공 기준에는 없고 플랜 truth 에만 있다 → 사람 확인(아래) |

**Score:** 5/6 truths verified (behavior-unverified 0)

동작 의존 truth(재적재 감지 · 원자 교체)는 코드 존재만으로 VERIFIED 하지 않았다. D-03 재적재 감지는 워커 `dispatch.test.ts`(재실행 통과)와 33-08 실배포의 `files_sig` 재적재 · 멱등 재실행 증거가 있고, 날짜 단위 원자 교체는 pgTAP 이 잠근다(33-02 · 33-07 기록).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20261016200000_limitup_team_flow.sql` | 표 · stage CHECK 9값 · commit_day · purge_old | ✓ VERIFIED | 310줄. 29열 + `schema_version` + `payload`, RLS 활성 · 정책 0, REVOKE 명시, 원격 적용 |
| `supabase/migrations/20261016200100_teamflow_report_rpc.sql` | 게이트 포함 조회 RPC | ✓ VERIFIED | 72줄. `dma_visible_accounts` 게이트 · jsonb 1회 · REVOKE/GRANT |
| `workers/limitup-sync/src/{index,load}.ts` | 선택 파일 분기 · D-03 감지 | ✓ VERIFIED | `TEAM_FLOW_FILE`, 청크 20, `needTeamFlow` 감지 |
| `server/src/routes/teamflow-report.ts` · `services/teamflow-report.ts` · `schemas/teamflow-report.ts` | 조회 라우트 | ✓ VERIFIED | `requireAuth` + zod `d` + RPC 1회. `app.ts` 마운트 |
| `webapp/src/app/analytics/teamflow/page.tsx` + `teamflow-*.tsx` 10개 | 목록 · 상세 · 차트 | ✓ VERIFIED | 모두 실질 구현(스텁 아님), `TeamflowReport` → `DayGrid` → `Detail` → 차트 · 표 · 거래원으로 연결 |
| `webapp/src/lib/teamflow-{api,report,chart}.ts` | fetch · 변환 · 기하 | ✓ VERIFIED | `authFetch` 로 `/api/teamflow/report` 호출(15초), 변환 · 기하 함수는 단위 테스트가 잠금 |
| `webapp/src/components/layout/app-sidebar.tsx` | 「팀 매집」 항목 | ✓ VERIFIED | `NAV_TEAMFLOW` · `teamflowActive` · `SubNavLink item="teamflow"` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `TeamflowReport` | `/api/teamflow/report` | `fetchTeamflowReport` → `authFetch` | WIRED | 응답이 `setPhase` → `sortRows` → `kpisOf` → `TeamflowDayGrid` 로 흐름 |
| 서버 서비스 | RPC `teamflow_report_for_user` | `supabase.rpc` | WIRED | `p_user_id = req.userId`(requireAuth 확정값) |
| 워커 | `limitup_commit_day` | `commitDay` `expected: counts`(team_flow 포함) | WIRED | stage → commit → 같은 트랜잭션에서 team_flow 교체 |
| `TeamflowDayGrid` | `TeamflowDetail` | 열린 행에만 마운트 | WIRED | `openIsin` 상태 |
| `TeamflowDetail` | 차트 · 표 · 거래원 | import + 렌더 | WIRED | band chart/table · members · bucket chart/table · rules |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `TeamflowDayGrid` 행 | `resp.rows` | RPC → `to_jsonb(limitup_team_flow)` | 예 — 프로덕션 10/14 34행 적재(INV-8) | ✓ FLOWING |
| `TeamflowDetail` | `row.payload.{bands,buckets,window,members,summary_lines}` | 같은 행의 `payload` jsonb(export 원문) | 예 — 라이브 UAT 에서 실데이터로 확인 | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| webapp teamflow · 사이드바 · 토큰 테스트 | `npx vitest run --maxWorkers=2 teamflow app-sidebar tds-tokens` | 6 파일 · 249 통과 | ✓ PASS |
| limitup-sync 워커 전체 | `npx vitest run --maxWorkers=2` (workers/limitup-sync) | 9 파일 · 108 통과 | ✓ PASS |
| server 라우트 | `npx vitest run --maxWorkers=2 tests/routes/teamflow-report.test.ts` | 10 통과(로그의 500 은 모양 위반 음성 케이스) | ✓ PASS |

### Probe Execution

Step 7c: SKIPPED — 플랜이 `probe-*.sh` 를 선언하지 않았다. 배포 스모크 `scripts/smoke-limitup-sync.sh` INV-8 은 프로덕션 자격이 필요해 재실행하지 않았고, 33-08 의 `PASS 13 FAIL 0 · db=34 manifest=34` 기록에 의존한다.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TEAM-01 | 33-01 · 02 · 07 · 08 · 09 | `team_flow.ndjson.gz` 적재(sha256 · 날짜 단위 교체 · 파일 없는 날 무영향) | ✓ SATISFIED | truth 1 |
| TEAM-02 | 33-01 · 02 · 04 · 07 · 08 · 09 | RPC 1회 · 게이트는 RPC 안 · 사이드바 항목 | ✓ SATISFIED | truth 2 |
| TEAM-03 | 33-01 · 03 · 04 · 07 · 09 | 목록 · KPI · 행 · 기본 접힘 아코디언 · 폰 카드형 | ✓ SATISFIED | truth 3 |
| TEAM-04 | 33-01 · 05 · 06 · 07 · 09 | 펼침 상세 · 차트 규칙 · 접힌 표 | ✓ SATISFIED | truth 4 |

고아 요구사항 없음 — REQUIREMENTS.md 가 Phase 33 에 매핑한 TEAM-01~04 가 모두 플랜 frontmatter 에 선언되어 있다. REQUIREMENTS.md 의 체크박스 4개와 추적표 4행(`Pending`)은 아직 갱신되지 않았다. 통과 판정 뒤 오케스트레이터가 표시한다.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `workers/limitup-sync/src/index.ts` | 221-244, 283-312 | WR-01 — team_flow backfill 이 업로드 뒤 실패하면 `unpublish` 가 걸려 정상 적재된 날짜가 상한가 보고서에서 내려간다 | ⚠️ Warning | backfill 은 `files_sig` 가 같아 격자가 동일한데도 같은 catch 를 탄다. commit 이 실패하는 경우(float 이 bigint 열에 들어가는 등)에만 발생. 이번 10/14 backfill 은 성공했고 목표 달성에는 영향이 없다. 처분 장부 open |
| `webapp/src/lib/teamflow-report.ts` | 33-37 | WR-02 — 억 반올림이 `Math.round` 라 ±0.05억 경계에서 부호별로 다르게 표시 | ⚠️ Warning | 표시 1칸 차이. 플랜 골든 `fmtEok(−5,000,000) = 「0.0억」` 이 정본이라는 의도된 결정(33-03)과 맞물려 있다. 처분 장부 open |
| (소스 전체) | — | `TBD`/`FIXME`/`XXX` 마커 | ✓ 없음 | 부채 마커 게이트 통과 |
| 코드 리뷰 Info 7건 | — | 견고성 · 일관성 | ℹ️ Info | 처분 장부 open |

### Human Verification Required

#### 1. 프로덕션 첫 로드 시간

**Test:** 로그인한 상태에서 https://trade.jx1.io/analytics/teamflow?d=20261014 를 새로고침하고, 「불러오는 중…」 이 사라지고 목록이 뜰 때까지의 시간을 초 단위로 잰다. 개발자 도구의 `report` 요청 시간을 봐도 된다.
**Expected:** 15초 타임아웃에 훨씬 못 미치고 체감상 수 초 안에 목록이 뜬다.
**Why human:** 33-09 의 plan truth 가 요구한 항목인데 UAT 에서 수치가 보고되지 않았다. 인증 세션이 필요하고 E2E 는 네트워크를 목으로 대체한다.

### Gaps Summary

BLOCKER 갭은 없다. phase 목표(적재 → 서버 → 목록 → 펼침 상세)는 코드 · 단위 테스트 · 프로덕션 배포 · 사용자 라이브 UAT 로 이어져 있다. 이 보고서가 직접 재확인한 것은 코드 읽기와 단위 테스트 3종(webapp 249 · 워커 108 · server 10)이다. E2E 25건 · pgTAP 3개 파일 · 배포 스모크는 재실행하지 않았고 SUMMARY 기록에 의존한다.

후속 메모(게이트 아님):
- WR-01 은 다음 워커 재배포 때 고치길 권한다(backfill 은 업로드 · unpublish 를 하지 않게). 선택 파일 하나가 정상 적재된 날짜를 내리는 것은 D-02 의 취지와 어긋난다.
- 10/16 밤 정기 경로(20:30 배치 → 21:00 운반 → 21:20 새 워커 `new` 적재)는 아직 한 번도 돌지 않았다. 코드는 10/14 backfill 경로와 같은 분기를 쓰지만, 첫 정기 적재는 오늘 밤 확인 대상이다.
- REQUIREMENTS.md TEAM-01~04 체크박스는 통과 판정 뒤 표시한다.

---

_Verified: 2026-10-16T09:15:00Z_
_Verifier: Claude (gsd-verifier)_
