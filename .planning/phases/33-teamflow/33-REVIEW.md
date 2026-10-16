---
phase: 33-teamflow
reviewed: 2026-10-16T09:05:55Z
depth: standard
files_reviewed: 48
files_reviewed_list:
  - packages/shared/src/index.ts
  - packages/shared/src/limitup-report.ts
  - packages/shared/src/teamflow-report.ts
  - scripts/smoke-limitup-sync.sh
  - server/src/app.ts
  - server/src/routes/teamflow-report.ts
  - server/src/schemas/limitup-report.ts
  - server/src/schemas/teamflow-report.ts
  - server/src/services/teamflow-report.ts
  - server/tests/routes/teamflow-report.test.ts
  - supabase/migrations/20261016200000_limitup_team_flow.sql
  - supabase/migrations/20261016200100_teamflow_report_rpc.sql
  - supabase/tests/limitup_load.test.sql
  - supabase/tests/teamflow_report.test.sql
  - webapp/e2e/fixtures/teamflow-report.ts
  - webapp/e2e/specs/sidebar-tree.spec.ts
  - webapp/e2e/specs/teamflow-report.spec.ts
  - webapp/src/app/analytics/teamflow/page.tsx
  - webapp/src/components/analytics/__tests__/teamflow-detail.test.tsx
  - webapp/src/components/analytics/__tests__/teamflow-report.test.tsx
  - webapp/src/components/analytics/teamflow-band-chart.tsx
  - webapp/src/components/analytics/teamflow-band-strip.tsx
  - webapp/src/components/analytics/teamflow-band-table.tsx
  - webapp/src/components/analytics/teamflow-bucket-chart.tsx
  - webapp/src/components/analytics/teamflow-bucket-table.tsx
  - webapp/src/components/analytics/teamflow-day-grid.tsx
  - webapp/src/components/analytics/teamflow-detail.tsx
  - webapp/src/components/analytics/teamflow-kpi-strip.tsx
  - webapp/src/components/analytics/teamflow-members.tsx
  - webapp/src/components/analytics/teamflow-report.tsx
  - webapp/src/components/analytics/teamflow-toggle.tsx
  - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/trading/dma-gate.tsx
  - webapp/src/hooks/use-chart-width.ts
  - webapp/src/lib/__tests__/teamflow-chart.test.ts
  - webapp/src/lib/__tests__/teamflow-report.test.ts
  - webapp/src/lib/teamflow-api.ts
  - webapp/src/lib/teamflow-chart.ts
  - webapp/src/lib/teamflow-report.ts
  - webapp/src/styles/__tests__/tds-tokens.test.ts
  - webapp/src/styles/globals.css
  - webapp/src/test-fixtures/teamflow-export.ts
  - workers/limitup-sync/src/index.ts
  - workers/limitup-sync/src/load.ts
  - workers/limitup-sync/tests/dispatch.test.ts
  - workers/limitup-sync/tests/helpers/fake-supabase.ts
  - workers/limitup-sync/tests/load.test.ts
findings:
  critical: 0
  warning: 2
  info: 7
  total: 9
status: issues_found
---

# Phase 33: Code Review Report

**Reviewed:** 2026-10-16T09:05:55Z
**Depth:** standard
**Files Reviewed:** 48
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Phase 33(팀 매집 — team_flow 적재 · 조회 RPC · `/api/teamflow/report` · `/analytics/teamflow` 화면)에서 이 phase 가 직접 만든 커밋(`git log --first-parent --no-merges be1b96a2..HEAD`)만 리뷰했다. `app-sidebar.tsx` · `globals.css` · `packages/shared/src/index.ts` · 사이드바 테스트는 Phase 33 hunk 만 봤다.

맞는지 직접 확인한 것:
- **마이그레이션:** `limitup_commit_day` 와 `limitup_purge_old` 의 새 본문을 원본(20261006090200 · 20261006090300)과 diff 했다. 바뀐 곳은 team_flow 쌍과 주석뿐이다. `statement_timeout` 재진술, 권한 3줄, stage CHECK 이름도 맞다.
- **조회 RPC:** 게이트는 `dma_visible_accounts`, 반환은 jsonb 스칼라 하나, 권한은 REVOKE·GRANT 로 바르게 잡혀 있다.
- **server:** 인증된 `userId` 만 RPC 에 넘긴다. `d` 는 zod 로 검증하고 RPC 는 1회만 부른다.
- **데이터 계약:** 10/14 실측 픽스처 34행으로 확인했다. `window.end` 는 마지막 칸의 「HH:M9」라서 `floor(분/10)` 칸 계산이 맞다. 정수 열에 float 이 든 행은 없다. 9칸 라벨 문자열도 export 와 일치한다.
- **화면:** 요약 문장은 조각 배열로 렌더해서 HTML 주입 경로가 없다.

Critical 은 없다. 남은 문제 중 가장 무거운 것은 워커의 team_flow 재적재(D-03 backfill) 실패 경로다. 기존의 「재적재 실패 시 files_sig 를 NULL 로 내림(unpublish)」 규칙이 backfill 에도 그대로 걸린다. 그래서 선택 파일인 team_flow 하나가 실패해도, 멀쩡히 적재돼 있던 날짜가 **상한가 보고서에서 사라진다**(WR-01). 그 밖에는 억 단위 반올림이 부호에 따라 다르게 표시되는 문제(WR-02)와 견고성 · 일관성 Info 7건이다.

## Warnings

### WR-01: team_flow backfill 이 실패하면 이미 정상 적재된 날짜가 상한가 보고서에서 내려간다(unpublish 오발동)

**File:** `workers/limitup-sync/src/index.ts:221-244`, `workers/limitup-sync/src/index.ts:283-312`
**Issue:**
D-03 은 `files_sig` 가 같아도 `rows.team_flow` 가 manifest 와 다르면 그 날짜를 다시 적재한다(`reason = "team_flow_backfill"`). 그런데 이 경로도 일반 재적재와 같은 `try` 블록을 탄다. 순서는 `uploadGrids → stageDay(6표+파생) → stageDay(team_flow) → commitDay` 이고, 실패하면 `catch` 에서 `if (p?.sig) await unpublish(date)` 로 `limitup_loads.files_sig = NULL` 을 쓴다.

- unpublish 의 근거(WR-B04)는 「격자는 새 export, DB 행은 옛 export 라서 둘이 섞인다」였다. backfill 은 `files_sig` 가 **같다**는 전제로 들어오므로 격자 파일이 바이트까지 같다. 섞일 것이 없으니 unpublish 할 이유도 없다.
- 그런데도 `limitup_report_for_user` 는 `files_sig IS NOT NULL` 인 날짜만 보여 준다(20261006090400:61). 그래서 team_flow 쪽 문제 하나로 **이미 정상 적재된 날짜의 상한가 보고서가 사라진다**.
- 실패할 수 있는 지점은 이렇다. commit 안 `jsonb_populate_record` 의 타입 오류(예: gh-trade 가 bigint 열에 `12345.0` 같은 float 을 내보내는 경우), team_flow 의 `(date, isin)` 중복으로 인한 PK 위반, `payload.date` 불일치. 이 중 무엇이든 commit 전체를 실패시킨다(D-01 원자성).
- 원인이 영구적이면 매일 밤 run 이 이 날짜를 다시 집는다. `files_sig` 가 NULL 이 됐으므로 이번에는 `reason = "files_sig"` 로 들어간다. 격자 재업로드와 6표 재stage 를 반복하고, `failed` 로 종료 코드 1 + `record_skip("load")` 를 남긴다. 이것이 90일 보존 창을 벗어날 때까지 계속된다. 그동안 상한가 보고서의 그 날짜는 계속 내려가 있다.
- `index.ts:249` 의 행 수 불일치 throw 는 업로드 앞이라 unpublish 는 없다. 하지만 매일 실패하고 종료 코드 1 이 나는 반복은 똑같이 생긴다. D-02 의 취지(「없다고 그 날짜가 실패하면 안 된다」)와도 어긋난다.
- `dispatch.test.ts` 에는 「backfill 도중 실패 → unpublish 여부」 케이스가 없어서 이 경로가 잠겨 있지 않다.

워커 코드 문제라 forward 마이그레이션은 필요 없다. 다만 이미 배포된 워커는 재배포해야 한다.
**Fix:**
```ts
// backfill(같은 files_sig) 은 격자가 바이트 동일 — 재업로드도 unpublish 도 하지 않는다.
const backfill = reason === "team_flow_backfill";
try {
  if (!backfill) result.grids += await uploadGrids(sb, date, grids);
  await stageDay(sb, date, { ...tables, grid_summary: gridSummary, member_daily: memberDaily }, config.stageChunk);
  await stageDay(sb, date, { team_flow: teamFlow }, Math.min(config.stageChunk, TEAM_FLOW_STAGE_CHUNK));
  // ... commitDay
} catch (err) {
  if (p?.sig && !backfill) await unpublish(date);
  throw err;
}
```
그리고 dispatch 테스트에 「backfill + commit 실패 → `files_sig: null` update 0회 · 업로드 0회」를 추가한다. 영구 실패를 매일 반복하지 않게 하려면 backfill 실패만 별도 사유(예: `record_skip(date, "team_flow")`)로 남기고 종료 코드에서 빼는 것도 검토한다. team_flow 는 선택 파일이다.

### WR-02: 억 반올림이 부호에 따라 달라 같은 크기의 ± 값이 다르게 표시된다

**File:** `webapp/src/lib/teamflow-report.ts:33-37` (사용처 `fmtEok` · `toneOf` → 목록 · KPI · 구간표 · 10분 표 · 차트 라벨 전부)
**Issue:** `eokOf` 는 `Math.round(won / 1e7) / 10` 이다. `Math.round` 는 .5 에서 +∞ 쪽으로 올리므로 같은 크기의 금액이 부호에 따라 다르게 표시된다.
- +15,000,000원 → 「+0.2억」, −15,000,000원 → 「−0.1억」
- +5,000,000원 → 「+0.1억」(up 색), −5,000,000원 → 「0.0억」(flat 색)

같은 모듈의 `fmtRate` · `fmtPct1` 은 `roundHalfAway`(0 에서 먼 쪽)를 쓴다. 등락률과 금액의 반올림 규칙이 한 파일 안에서 갈린다. 「RESEARCH A4 골든」으로 잠근 결정인 것은 알지만, 결과적으로 순매수와 순매도가 대칭으로 보이지 않는다. 행 금액 · KPI 합 · 막대 색이 ±0.05억 경계에서 한쪽으로 기운다. `summary_lines` 처럼 gh-trade 가 만든 문장 속 같은 수치와도 어긋날 수 있다.
**Fix:** `const v = roundHalfAway(won / 1e7) / 10;` 로 바꿔 등락률과 같은 규칙으로 맞추고, 골든(`teamflow-report.test.ts` 의 −0.05억 → 「0.0억」)도 「−0.1억」으로 갱신한다. 비대칭을 유지하기로 한다면, 결정 근거를 함수 주석과 UI-SPEC T11 에 「부호 비대칭 의도」로 명시한다.

## Info

### IN-01: RPC 응답 모양이 잘못되면 500 이 아니라 403 으로 보고된다

**File:** `server/src/services/teamflow-report.ts:53-55`
**Issue:** `isObject(data)` 만 검사하고, `data.access !== true` 는 전부 `DmaUnmapped()`(403)로 바꾼다. 그래서 `{}` 나 `{access: "true"}` 같은 모양 위반이 「DMA 미매핑」 게이트로 보인다. `access: true` 라도 `dates` · `rows` 가 배열인지 검사하지 않는다. 그 상태로 웹 `teamflow-report.tsx:138-142` 가 `resp.dates.length` 를 읽으면 렌더 예외가 난다.
**Fix:** `data.access === false` 일 때만 403 으로 보낸다. `access === true` 이면서 `Array.isArray(data.dates) && Array.isArray(data.rows)` 가 아니면 `DbError(..., shapeCause(...))` 를 던진다.

### IN-02: 구간 가로 막대 — 측정 폭이 232px 미만이면 스케일이 음수가 된다

**File:** `webapp/src/lib/teamflow-chart.ts:114-121`
**Issue:** `plotW = W − 216` 이고 `sc = (plotW/2 − 8) / mx` 다. W < 232 이면 `sc < 0` 이 되고, 막대는 전부 `max(2, 음수) = 2px` 로 그려져 크기 정보가 사라진다. 320px 기기에서 상세 패딩까지 빼면 측정 폭이 240px 안팎이라 경계에 가깝다.
**Fix:** `const sc = Math.max(0, plotW / 2 - BAND_PAD) / mx;` 로 하한을 두고, 아주 좁을 때는 값 칸(120)을 줄이는 폴백을 검토한다.

### IN-03: 최대 매집 창이 축 밖이면 가장자리 칸에 잘못 음영이 진다

**File:** `webapp/src/lib/teamflow-chart.ts:174-182`, `webapp/src/components/analytics/teamflow-bucket-table.tsx:42-49`
**Issue:** `windowSlotsOf` 는 범위를 벗어난 시각을 `clampSlot` 으로 0~38 에 붙인다. 그래서 창 전체가 09:00 이전이나 15:40 이후에 있어도 09:00 칸이나 15:20 칸에 음영이 생긴다. 표의 띠도 같은 clamp 를 쓰므로, 실제 창에 속한 key < 54 행에는 띠가 빠진다. 현재 export 는 KRX 정규장만 내보내 실데이터에서는 드물다.
**Fix:** clamp 하기 전에 `a/10 − 54 > 38 || b/10 − 54 < 0` 이면 `null` 을 돌려준다. 표는 `window.i`/`j`(buckets 인덱스)로 띠를 판정한다.

### IN-04: 「고가」 보조줄 조건이 sr 설명과 다르다

**File:** `webapp/src/components/analytics/teamflow-day-grid.tsx:132`
**Issue:** 보이는 보조줄은 `r.high_rate !== null` 로, sr 설명(`rowDescriptionOf`, `teamflow-report.ts:264`)은 `isNum(row.high_rate)` 로 판정한다. 키가 빠져 `undefined` 이면 화면에는 「고가 —」가 나오고 sr 설명에는 고가가 없다.
**Fix:** 두 곳 모두 같은 판정(`typeof r.high_rate === 'number'`)을 쓰거나, 판정 함수를 `teamflow-report.ts` 에서 export 해 공유한다.

### IN-05: 상세 토글 셰브론에 reduced-motion 처리가 없다

**File:** `webapp/src/components/analytics/teamflow-toggle.tsx:45`
**Issue:** 행 셰브론(`teamflow-day-grid.tsx:253`)은 `motion-reduce:transition-none` 을 붙였는데, 같은 화면의 토글 셰브론에는 없다(UI 감사 우선 수정 항목과 같다).
**Fix:** `'size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none'`

### IN-06: 로딩 문구가 보조기기에 알려지지 않는다

**File:** `webapp/src/components/analytics/teamflow-report.tsx:121-123`
**Issue:** 오류 상자는 `role="alert"` 인데 로딩 문구는 그냥 `<p>` 라서, 날짜를 이동해 다시 불러올 때 스크린리더가 아무것도 듣지 못한다.
**Fix:** `<p role="status" aria-live="polite" …>불러오는 중…</p>`

### IN-07: `isNum` 가드가 세 모듈에 복제돼 있다

**File:** `webapp/src/lib/teamflow-report.ts:27`, `webapp/src/lib/teamflow-chart.ts:41`, `webapp/src/components/analytics/teamflow-members.tsx:23`
**Issue:** 같은 타입 가드가 세 번 정의돼 있다. IN-04 처럼 판정이 갈라지는 원인이 된다.
**Fix:** `teamflow-report.ts` 에서 `export const isNum` 하고 나머지 두 곳은 import 한다.

---

_Reviewed: 2026-10-16T09:05:55Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
