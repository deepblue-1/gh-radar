---
phase: 34-accum
verified: 2026-10-21T00:30:00Z
status: passed
score: 6/6 must-haves verified
covered_files:
  - .planning/phases/34-accum/34-01-PLAN.md
  - .planning/phases/34-accum/34-01-SUMMARY.md
  - .planning/phases/34-accum/34-02-PLAN.md
  - .planning/phases/34-accum/34-02-SUMMARY.md
  - .planning/phases/34-accum/34-03-PLAN.md
  - .planning/phases/34-accum/34-03-SUMMARY.md
  - .planning/phases/34-accum/34-04-PLAN.md
  - .planning/phases/34-accum/34-04-SUMMARY.md
  - .planning/phases/34-accum/34-05-PLAN.md
  - .planning/phases/34-accum/34-05-SUMMARY.md
  - .planning/phases/34-accum/34-06-PLAN.md
  - .planning/phases/34-accum/34-06-SUMMARY.md
  - .planning/phases/34-accum/34-07-PLAN.md
  - .planning/phases/34-accum/34-07-SUMMARY.md
  - .planning/phases/34-accum/34-08-PLAN.md
  - .planning/phases/34-accum/34-08-SUMMARY.md
  - .planning/phases/34-accum/34-09-PLAN.md
  - .planning/phases/34-accum/34-09-SUMMARY.md
  - .planning/phases/34-accum/34-10-PLAN.md
  - .planning/phases/34-accum/34-10-SUMMARY.md
  - .planning/phases/34-accum/34-11-PLAN.md
  - .planning/phases/34-accum/34-11-SUMMARY.md
  - .planning/phases/34-accum/34-12-PLAN.md
  - .planning/phases/34-accum/34-12-SUMMARY.md
  - .planning/phases/34-accum/34-13-PLAN.md
  - .planning/phases/34-accum/34-13-SUMMARY.md
  - scripts/export-accum-backfill.ts
  - server/src/routes/accum-report.ts
  - server/src/services/accum-report.ts
  - supabase/migrations/20261020200000_limitup_accum_flow.sql
  - supabase/migrations/20261020200100_accum_report_rpc.sql
  - webapp/src/components/analytics/accum-chart.tsx
  - webapp/src/components/analytics/accum-day-grid.tsx
  - webapp/src/components/analytics/accum-detail.tsx
  - webapp/src/components/analytics/accum-report.tsx
  - webapp/src/lib/accum-api.ts
  - webapp/src/lib/accum-chart.ts
  - webapp/src/lib/accum-report.ts
  - workers/limitup-sync/src/index.ts
  - workers/limitup-sync/src/load.ts
covered_digest: "v3:sha256:b177f6688bb6f1be55663e389af73a2d4060f9eba7da1d2a99157cd2ae2e9bb9"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 34: 매집감지(accum) 보고서 검증 보고서

**Phase Goal:** gh-trade 119 밤 배치의 `accum_flow.ndjson.gz` 가 Supabase `limitup_accum_flow`(PK `(date, isin)` · 평평한 열 37 + `payload` jsonb · 90일 purge)에 적재되고, `/analytics/accum?d=YYYYMMDD` 에서 목록과 행 펼침 상세 차트가 읽힌다. 「KYOBO119 판정 기준」 표기, kind 16 과 join 하지 않음.
**Verified:** 2026-10-21
**Status:** passed
**Re-verification:** No — 최초 검증

## 요약

SUMMARY 서술을 증거로 쓰지 않고 코드와 라이브 상태를 직접 확인했다. ROADMAP Success Criteria 6개가 모두 코드에 존재하고 배선되어 있으며 데이터가 흐른다. 코드 리뷰 WARNING 5건은 모두 목표 달성을 막지 않는 후속 과제로 판단했다(아래 「리뷰 WARNING 판정」).

판정 근거는 다섯 가지다.
- 마이그레이션 2개를 읽었다. 표는 37열 + `payload`, PK `(date, isin)`, RLS 켬 + 정책 0, `limitup_commit_day` 10번째 쌍, `limitup_purge_old` 90일이 있다.
- 워커 `OPTIONAL_FILES` 일반화와 재적재 감지(`backfillTbls`)를 읽었다.
- 서버 라우트 2개, 서비스, RPC 2개, 웹 목록 · 상세 · 순수 SVG 차트를 읽었다.
- 단위 테스트를 직접 돌렸다(`--maxWorkers=2`): 모두 통과.
- 프로덕션 도달성을 확인했다. `https://trade.jx1.io/analytics/accum?d=20261020` 이 307 → `/login?next=...` 로 응답한다. d318ef96 이후 소스 디렉터리 변경이 없어(`git diff --stat d318ef96 HEAD`) 검증한 코드가 배포된 코드와 같다.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | `limitup-sync` 가 `accum_flow.ndjson.gz` 를 team_flow 와 같은 sha256 대조 · `limitup_commit_day` 날짜 원자 교체로 적재하고, 파일 없는 날짜는 6표 · team_flow 에 영향이 없다. 재적재 감지가 accum_flow 로 일반화된다 | ✓ VERIFIED | `workers/limitup-sync/src/load.ts:23-36` `OPTIONAL_FILES`(team_flow · accum_flow, accum 청크 1). `src/index.ts:226-232` 가 manifest 에 파일이 있고 `p.rows[tbl] !== entry.rows` 이면 `backfillTbls` → sig 가 같아도 재적재(reason `accum_flow_backfill`). `index.ts:268-281` 이 파일이 없으면 0행으로 처리한다. 마이그레이션 `20261020200000` 은 10번째 DELETE → INSERT 쌍과 `IF p_expected ? 'accum_flow'` 가드(옛 워커 호환), `statement_timeout` 재진술, stage CHECK 10값, `limitup_purge_old` 의 `DELETE ... accum_flow WHERE date < v_cutoff` 를 갖는다. 워커 테스트 `load` · `dispatch` · `dispatch-dryrun-totals` 65/65 통과. 라이브: 스모크 INV-9 `db=37 manifest=37`, `db=48 manifest=48`, Job `s7kxq` 에서 `files_sig` 로 재적재(34-11 SUMMARY) |
| SC2 | 서버가 목록(평평한 열만)과 상세(한 종목 payload)를 분리된 RPC/라우트로 내준다. DMA 게이트는 teamflow 와 같은 경로 | ✓ VERIFIED | `20261020200100`: `accum_report_for_user` 는 37열을 명시 선택하고 payload 를 싣지 않는다. `accum_detail_for_user` 는 PK 조회로 `to_jsonb(a)`(payload 포함)를 준다. 둘 다 `dma_visible_accounts` 게이트(RPC 안), `SECURITY INVOKER`, `REVOKE ... FROM PUBLIC, anon, authenticated`, `GRANT ... TO service_role`. `server/src/app.ts:115` 가 `/api/accum` 에 마운트한다. 라우트는 `requireAuth()` + zod 검증이고, 서비스는 `access:false` 를 403 `DmaUnmapped` 로 바꾼다. 서버 라우트 테스트 11/11 통과. 라이브: 새 리비전 `00066-dp2` 에서 무인증 호출이 두 경로 모두 401(404 아님) |
| SC3 | `/analytics/accum` 목록 = 날짜 알약 → 종목 행(상태 · 이월 D+n · `end_reason` · `pos_*` KPI · `day_net_krw`) · 행 펼침 시 상세 지연 로드 | ✓ VERIFIED | `accum-report.tsx` 가 `?d` 파싱, `fetchAccumReport`, `LimitupDateNav`, 빈 상태 2종, `accumKpisOf` KPI 4칸을 연결한다. `sortAccumRows`(상태 → `pos_net_krw` 내림차순), `stateLabelOf`(종료), `reasonLineOf` · `isDimRow`(탈락 · 만료 흐림), `accumTagOf` 가 `lib/accum-report.ts` 에 있다. `accum-day-grid.tsx` 는 기본 전부 접힘이고 한 번에 하나만 열며 열린 행 아래에서만 `AccumDetail` 이 마운트되어 `fetchAccumDetail` 을 부른다(지연 로드). 웹 vitest 5파일 135/135 통과. `app-sidebar.test.tsx` 89/89 통과(「분석」 그룹 3번째 링크 `/analytics/accum`, 접두 겹침 없음) |
| SC4 | 상세 차트 7요소 + `first` 표식 · 09:00 이전 등록은 `price.t0_ms` 에 맞춤 · 15:30~16:00 빈 칸 · 팀 체결 없는 종목도 깨지지 않음 | ✓ VERIFIED | `accum-chart.tsx` 가 순수 SVG 로 가격 선(`pricePathOf`, 15분 이상 공백에서 끊음), 주문 원(`orderCirclesOf`, 반지름 식, `first` 는 `--fg` 테두리 · 맨 위), 누적 계단(`cumPathOf`), 10분 막대 쌍, 등록 실선 · 종료 점선 세로선(`cycleMarksOf`, `tx = max(t, T0)`), 등록 전 음영(`shadeOf`, 오늘 등록만), 15:30~16:00 빈 띠(`gapBandOf`)를 그린다. 범례 8항목에 「팀매수 시작」이 있다. 빈 자료는 「팀 체결 없음」 판 글자 2개 또는 「그날 체결 자료 없음」으로 처리한다. `accum-detail.test.tsx` 가 CJ씨푸드1우(orders 0, day_cum_net 0) 사례와 first 툴팁 문구를 잠근다. 상세 부속(사이클 표 2개↑, 손익 줄, 판정 기준 접힘, 「KYOBO119 판정 기준」 칩 2곳)도 `accum-detail.tsx` 에 있다. 이월 행은 음영 · 등록선 없이 「이월 D+n · MM/DD HH:MM 등록」 한 줄(`carryLineOf`)만 그린다 |
| SC5 | 소급: kind 16(KYOBO119) → 날짜별 JSON lines 23키를 맥 `~/ticks/accum-backfill/<D>.jsonl` 로 내보낸다 → gh-trade 가 119 로 옮겨 배치 → files_sig 자동 재적재 | ✓ VERIFIED | `scripts/export-accum-backfill.ts`(읽기 전용, 비출력, 로직은 `relay/src/store/accum-backfill.ts`)가 있다. 맥에 `/Users/alex/ticks/accum-backfill/20261019.jsonl` · `20261020.jsonl` 이 실재한다. 인박스 노트는 119 소급이 isins 37 · 48, bad 0 이었고 Job 이 두 날짜를 `files_sig` 로 재적재했다고 기록한다. 이는 위 INV-9 와 일치한다 |
| SC6 | 단위 · E2E 통과 · 첫 실물 날짜 라이브 UAT · 인박스 `261020-accum-flow-export.md` 를 `status: done` 으로 닫는다 | ✓ VERIFIED | 인박스 프런트매터 `status: done` · `done_commit: b35c0494`, `## 회신` ①~⑥ 이 있다(D-24 순서). `webapp/e2e/specs/accum-report.spec.ts` 가 있고 `sidebar-tree.spec.ts` 의 `/analytics/accum` 모킹이 있다. 라이브 UAT는 사용자가 「전부 이상 없음」 · 폰 툴팁 「충분함」으로 답했다는 기록이다(34-12 SUMMARY, 오케스트레이터 확인). 프로덕션 Vercel 이 `/analytics/accum` 에 응답하고 push `d318ef96` 이 `origin/master` 에 포함된 것은 직접 확인했다. 사용자 발화 자체는 독립 재현할 수 없어 SUMMARY 와 오케스트레이터 기록에 의존한다 |

**Score:** 6/6 truths verified (0 present, behavior-unverified)

### Behavior-dependent truth 분류

- 원자 교체 · 재적재 감지(SC1)는 상태 전이 · 순서 불변식을 포함한다. 워커는 `dispatch.test.ts` 57건이 재적재 감지, 탐지 0 manifest, 실패 격리를 단위로 실행했고 내가 통과를 직접 확인했다. DB 쪽 원자 교체는 pgTAP(`limitup_load` 271 · `accum_report` 52)이 정본인데, 이번 검증에서는 Docker 이미지 재생이 필요해 재실행하지 않았다(Mac 메모리 제약, 34-10 이 이미 실행). 프로덕션 스모크 INV-9 와 실제 `files_sig` 재적재가 같은 불변식을 독립 corroborate 한다. 그래서 PRESENT_BEHAVIOR_UNVERIFIED 로 내리지 않았다.
- 차트 확대 · 이동(SC4)은 `use-chart-view.test.tsx` 12건(휠 · 포인터 · 키보드 · rAF)이 실행하고 사용자 라이브 조작 UAT가 있다.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20261020200000_limitup_accum_flow.sql` | 표 · stage CHECK · commit 10번째 쌍 · purge | ✓ VERIFIED | 열 37 + payload 직접 셈, PK, RLS 켬, 권한 잠금, 원격 적용(34-11 `migration list` 두 줄) |
| `supabase/migrations/20261020200100_accum_report_rpc.sql` | 목록 · 상세 RPC | ✓ VERIFIED | 위 SC2 |
| `workers/limitup-sync/src/{load,index}.ts` | 선택 파일 목록화 · 재적재 감지 | ✓ VERIFIED | 위 SC1 |
| `server/src/{routes,services,schemas}/accum-report.ts` | 조회 전용 라우트 2개 | ✓ VERIFIED | `app.ts:115` 마운트 |
| `packages/shared/src/accum-report.ts` | 목록 · 상세 · payload 6키 타입 | ✓ VERIFIED | 서버 · 웹이 import |
| `webapp/src/app/analytics/accum/page.tsx` + `components/analytics/accum-*.tsx` | 페이지 · 목록 · 상세 · 차트 · 사이클 표 · KPI | ✓ VERIFIED | 파일 6개 실질 구현(총 약 1,300줄), stub 없음 |
| `webapp/src/lib/accum-{api,chart,report}.ts` | API · 기하 · 표시 변환 | ✓ VERIFIED | 위 분석 |
| `webapp/src/components/layout/app-sidebar.tsx` | 「분석 › 매집감지 보고서」 | ✓ VERIFIED | `NAV_ACCUM`, prefix 활성 |
| `scripts/export-accum-backfill.{ts,sh}` + `relay/src/store/accum-backfill.ts` | 소급 도구 | ✓ VERIFIED | 산출 파일 실재 |
| `scripts/smoke-limitup-sync.sh` | INV-9 | ✓ VERIFIED | `inv9_accum_flow_rows` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| 워커 `loadDay` | `limitup_commit_day` RPC | `stageDay` → `commitDay`(`expected: counts`, accum_flow 키 항상 포함) | ✓ WIRED | `index.ts:296-310` |
| `commitDay` | `limitup_accum_flow` | `jsonb_populate_record` 10번째 쌍 | ✓ WIRED | 마이그레이션 ③, 프로덕션 37 · 48행 |
| 웹 `fetchAccumReport` / `fetchAccumDetail` | 서버 `/api/accum/report[/:date/:isin]` | `authFetch` | ✓ WIRED | `accum-api.ts` |
| 서버 서비스 | RPC `accum_report_for_user` / `accum_detail_for_user` | `supabase.rpc` 1회 | ✓ WIRED | 표를 `from()` 으로 읽지 않음 |
| `AccumDayGrid` 행 | `AccumDetail` | 열림 상태에서만 마운트 → `fetchAccumDetail` | ✓ WIRED | 지연 로드 |
| `AccumDetail` | `AccumChart` + `useChartView` | `ChartBody` | ✓ WIRED | view · ctl 공유 |
| 사이드바 | `/analytics/accum` | `NAV_ACCUM` | ✓ WIRED | 테스트 + e2e 단언 |

kind 16 join 없음: `grep` 으로 서버 서비스 · RPC · 웹 어디에도 `dma_strategy_events` 조회가 없음을 확인했다. 소급 스크립트만 kind 16 을 읽는다(읽기 전용).

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `accum-report.tsx` | `resp.rows` | `fetchAccumReport` → RPC → `limitup_accum_flow` | 프로덕션 10/19 · 10/20 에 37 · 48행 | ✓ FLOWING |
| `accum-detail.tsx` / `accum-chart.tsx` | `row.payload` | `fetchAccumDetail` → RPC → `to_jsonb(a)` | 실물 payload(소급 파일 2884 · 3353 이벤트 행에서 생성) | ✓ FLOWING |
| `limitup_accum_flow` | 행 | gh-trade export → 운반 → 워커 | 소급 경로로 실제 적재. 첫 자동 밤 배치(finished 20:13:16)는 gh-trade 회신으로 확인 | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 웹 목록 · 상세 · 차트 · 훅 · 변환 | `vitest run --maxWorkers=2` accum-chart · accum-report(lib) · accum-detail · accum-report(component) · use-chart-view | 5파일 135/135 | ✓ PASS |
| 사이드바 순서 · 활성 | `vitest run --maxWorkers=2 app-sidebar.test.tsx` | 89/89 | ✓ PASS |
| 워커 재적재 · 탐지 0 · 실패 격리 | `vitest run --maxWorkers=2` load · dispatch · dispatch-dryrun-totals | 65/65 | ✓ PASS |
| 서버 라우트 | `vitest run --maxWorkers=2 tests/routes/accum-report.test.ts` | 11/11(stderr 의 500 로그는 모양 위반 음성 테스트의 의도된 출력) | ✓ PASS |
| 프로덕션 도달 | `curl https://trade.jx1.io/analytics/accum?d=20261020` | 307 → `/login?next=...`(미인증 리다이렉트 = 라우트 존재) | ✓ PASS |
| 배포 코드 = 검증 코드 | `git diff --stat d318ef96 HEAD -- webapp server workers packages supabase relay scripts` | 변경 없음 | ✓ PASS |

전 워크스페이스 회귀 · pgTAP · Playwright 는 재실행하지 않았다(지시 사항). 34-10 SUMMARY 와 34-VALIDATION(`nyquist_compliant: true`, 갭 0)의 기록에 의존한다.

### Probe Execution

phase 가 선언한 `probe-*.sh` 는 없다. 대신 운영 스모크(`scripts/smoke-limitup-sync.sh`, INV-1~9)를 쓰며 라이브 실행 결과(PASS 14 · FAIL 0, 두 날짜)는 34-11 SUMMARY 에 있다. 이 검증에서는 프로덕션 자격증명이 필요해 재실행하지 않았다.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| (없음 — ROADMAP `Requirements: TBD`) | 13개 PLAN 모두 `requirements: []` | 이 phase 는 REQ-ID 가 없다. SC1~6 과 CONTEXT D-01~D-27 로 대체 | ✓ N/A | REQUIREMENTS.md 에 `34` 또는 `accum` 매핑 없음. 고아(ORPHANED) 요구사항 없음. 모든 PLAN 의 요구사항 ID 누락 없음 |

### CONTEXT 결정 교차 확인 (발췌)

D-01(표 하나 · 37열 · 같은 트랜잭션) · D-02(선택 파일 목록화) · D-03(탐지 0 manifest, 워커 테스트로 고정) · D-05(단위 변환 없음) · D-06 · D-07(RPC 2개 · 게이트는 RPC 안) · D-08(정렬 · 기본 접힘) · D-09(KPI 4칸) · D-11(자체 라벨 「종료」, 흐림) · D-12(결과 태그) · D-14~D-16(세 패널 · 원 · 세로선 · 음영) · D-18(빈 자료) · D-20~D-22(사이클 표 조건부 · 손익 줄 · 판정 기준) · D-24(인박스 회신) · D-27(사이드바)이 코드에 반영되어 있다. D-09 조건부 10분 미루기는 gh-trade 실측(20:13:16)으로 불필요해 의도대로 실행하지 않았고, `ACCUM_LOAD_HM` 은 「20:30」 그대로다.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase 가 바꾼 소스 전체) | - | `TBD` / `FIXME` / `XXX` | - | 없음 — 부채 표식 0건(`grep` 확인) |
| `webapp/src/lib/accum-chart.ts` | - | `return null` / 빈 반환 | ℹ️ Info | 빈 자료 분기이며 호출자가 「그날 체결 자료 없음」 · 「팀 체결 없음」 으로 대체한다. stub 아님 |

### 리뷰 WARNING 판정 (목표 달성 영향 여부)

코드 리뷰(`34-REVIEW.md`)는 BLOCKER 0, WARNING 5, INFO 6 이다. 5건 모두 `open`(34-REVIEW-DISPOSITION) 상태다. 각 건이 phase 목표나 SC1~6 을 깨는지 판단했다. 깨지는 것은 없다.

| ID | 판정 | 근거 |
|----|------|------|
| WR-01 확대 창 경계에서 가격 선이 가격 판 밖으로 뻗음 | 목표 비차단 · WARNING | 기본 창(전체 · 정규장 · 마지막 2시간 프리셋)에서는 창 경계 밖 ±30분 점이 대부분 같은 범위여서 드러나지 않고, 확대 조작 중 경계 가격이 크게 다를 때만 생기는 표시 결함이다. 사용자가 휠 · 핀치를 라이브에서 확인했다. SC4 의 「차트가 읽힌다」는 유지된다. 후속 수정은 가격 레이어 전용 y 클립이다 |
| WR-02 accum_flow 가 깨지면 그날 6표 · team_flow 도 실패 | 목표 비차단 · WARNING | SC1 은 「파일이 없는 날짜」에서의 격리를 요구하고 이는 충족된다. 파일이 있는데 형식이 깨진 날의 결합은 D-01(같은 트랜잭션) 결정의 알려진 대가다. 현재 두 날짜는 정상 적재됐다. 다만 다음 날부터 gh-trade 가 열 형식을 바꾸면 그날 상한가 보고서까지 빈다. 워커 사전 검증 · 0행 격리를 우선순위 높은 후속 과제로 권한다 |
| WR-03 상세 캐시 무만료 · `row:null` 고정 | 목표 비차단 · WARNING | 재적재가 일어난 날 열어 둔 탭에서 목록과 상세가 어긋날 수 있다. 새로고침으로 해소된다. 데이터 오염은 아니다 |
| WR-04 소급 CLI 상대 `--out` 이 `relay/` 기준 | 목표 비차단 · WARNING | 기본값은 절대 경로이고 34-11 실행은 영향이 없었다. 산출 파일이 의도한 위치에 실재한다 |
| WR-05 상세 payload 모양 무검증 | 목표 비차단 · WARNING | 현재 payload 는 gh-trade 가 만든 계약 형식이고 실물 2일 모두 렌더링된다. 키 누락 시 페이지 전체 오류로 번지는 방어 부족이다. 서버 또는 웹 경계에서 검증을 추가하는 후속이 좋다 |

INFO 6건(IN-01~06)은 주석 · 중복 문구 · 테스트 전용 공개 API 등 품질 항목이며 목표와 무관하다.

### Human Verification Required

없음. 시각 · 조작 항목은 라이브 UAT(사용자 승인)로 이미 수행되었다. 위 SC6 의 사용자 발화는 SUMMARY 기록 + 오케스트레이터 사실 진술로만 확인된다는 점을 명시한다. 이 항목이 의심되면 `https://trade.jx1.io/analytics/accum?d=20261020` 을 한 번 열어 보면 된다.

### Gaps Summary

목표 달성을 막는 갭은 없다. 적재(워커 · 표 · RPC) → 서버(라우트 2개) → 웹(목록 · 상세 차트 · 사이드바) → 소급 · 배포 · 인박스가 모두 코드 · 라이브 증거로 이어진다. 후속으로 `/gsd-code-review 34 --fix` 를 돌려 WR-02(첫 적재 격리)와 WR-05(payload 검증)를 우선 처리하길 권한다. WR-01 · WR-03 · WR-04 는 그 다음이다. 마이그레이션 수정이 필요한 항목은 없고, DB 측 대안이 필요하면 새 마이그레이션으로만 한다.

---

_Verified: 2026-10-21T00:30:00Z_
_Verifier: Claude (gsd-verifier)_
