---
phase: 33-teamflow
fixed_at: 2026-10-16T09:50:00Z
review_path: .planning/phases/33-teamflow/33-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 33: 코드 리뷰 수정 보고서

**수정 시각:** 2026-10-16T09:50:00Z
**원본 리뷰:** .planning/phases/33-teamflow/33-REVIEW.md
**회차:** 1

**요약:**
- 범위 안 지적: 9건 (Warning 2 · Info 7, fix_scope = all)
- 수정: 9건
- 건너뜀: 0건

작업 위치: 워크트리 `/Users/alex/repos/gh-radar/.claude/worktrees/phase-33`, 브랜치 `phase/33-teamflow`. 오케스트레이터 지시에 따라 중첩 worktree 를 따로 만들지 않고 이 워크트리에서 바로 수정하고 커밋했다. 메인 체크아웃은 건드리지 않았다. 커밋은 지적 하나당 1개(총 9개)이고, push · 배포 · 마이그레이션은 하지 않았다.

## 수정한 지적

### WR-01: team_flow backfill 이 실패하면 이미 정상 적재된 날짜가 상한가 보고서에서 내려간다(unpublish 오발동)

**수정 파일:** `workers/limitup-sync/src/index.ts`, `workers/limitup-sync/tests/dispatch.test.ts`
**커밋:** 4d8b39fb
**적용한 수정:**
- `reason === "team_flow_backfill"` 이면 `uploadGrids` 를 건너뛴다. `filesSig` 에는 `grid/*` 파일도 들어가므로, sig 가 같다는 것은 격자 파일이 sha256 까지 같다는 뜻이다.
- 실패 시 catch 에서 backfill 이면 `unpublish` 하지 않는다. 대신 warn 로그 「limitup day team_flow backfill failed — 게시된 날짜는 그대로 둔다(unpublish 없음)」를 남긴다. 일반 재적재(`files_sig` 변경)는 지금처럼 WR-B04 규칙으로 내린다.
- **종료 코드 판단:** backfill 실패는 지금처럼 `failed` 에 넣는다. 그래서 종료 1 이 나고 `record_skip(date, "load")` 가 기록된다. 이유는 둘이다.
  - team_flow 가 manifest 에 **있는데** 실리지 않은 것은 실제 결함이다. 종료 코드에서 빼면 알림 없이 묻힌다(무로그 fail-safe 금지 원칙).
  - `limitup_record_skip` 은 `skip_streak` · `last_skip_reason` 만 바꾸고 `files_sig` 는 건드리지 않는다. 그래서 상한가 보고서는 그대로 보인다.
  - 영구 오류가 매일 반복되면 운영자가 `LIMITUP_SKIP_DATES` 로 그 날짜를 제외하면 된다. 제외해도 이미 게시된 날짜는 유지된다. 이 판단은 파일 머리 주석에도 적었다.
- 테스트 4건을 추가했다.
  - backfill 성공 → 업로드 0 · grids 0
  - backfill commit 실패 → `files_sig: null` 갱신 0 · 업로드 0 · record_skip load · main 종료 1 · warn 문구
  - backfill stage 실패 → 내리지 않음 · 뒤 날짜는 적재됨
  - files_sig 재적재 실패 → 기존대로 내림
- 수정을 되돌리고 돌리면 앞의 3건이 실패하는 것을 확인했다.
- 주의: 이 워커는 이미 배포돼 있다. 재배포는 오케스트레이터가 한다.

### WR-02: 억 반올림이 부호에 따라 달라 같은 크기의 ± 값이 다르게 표시된다

**수정 파일:** `webapp/src/lib/teamflow-report.ts`, `webapp/src/lib/__tests__/teamflow-report.test.ts`, `.planning/phases/33-teamflow/33-UI-SPEC.md`
**커밋:** e06f8dc5
**적용한 수정:**
- `eokOf` 를 `Math.round(won / 1e7) / 10` 에서 `roundHalfAway(won / 1e7) / 10` 로 바꿨다. 같은 파일의 `fmtRate` · `fmtPct1` 과 같은 규칙이다.
- 반올림 결과가 0 이면 부호 없는 「0.0억」을 내는 D-10 규칙은 그대로다(−0 도 `=== 0` 으로 0 처리).
- 골든: −5,000,000원은 「0.0억」에서 「−0.1억」으로 바뀌고, +5,000,000원은 「+0.1억」 그대로다.
- 추가한 테스트:
  - 부동소수 경계: ±15,000,000 → ±0.2억, −25,000,000 → −0.3억, −14,999,999 → −0.1억, ±4,999,999 → 0.0억
  - `toneOf` 경계: ±5,000,000 → up/down, −4,999,999 → flat
- 함수 주석과 UI-SPEC T11 표의 근거를 「대칭 · 등락률과 같은 규칙」으로 고쳤다.
- 10/14 실측 픽스처 34행을 전부 훑었다. 새 규칙으로 표시가 바뀌는 값은 0건이었다. 그래서 E2E 골든은 바뀌지 않았다.

### IN-01: RPC 응답 모양이 잘못되면 500 이 아니라 403 으로 보고된다

**수정 파일:** `server/src/services/teamflow-report.ts`, `server/tests/routes/teamflow-report.test.ts`
**커밋:** d2f16ce7
**적용한 수정:**
- 403 `DMA_UNMAPPED` 는 `data.access === false` 일 때만 낸다.
- 다음 경우는 500 `DB_ERROR` 를 낸다. `cause` 에는 어느 필드인지와 타입을 싣는다.
  - `access` 가 `true` 가 아닌 값일 때(누락 · 문자열 · null)
  - `access: true` 인데 `dates` 나 `rows` 가 배열이 아닐 때
- 라우트 테스트 ⑨(7가지 모양 위반 → 500)와 서비스 테스트(필드별 cause)를 추가했다.

### IN-02: 구간 가로 막대 — 측정 폭이 232px 미만이면 스케일이 음수가 된다

**수정 파일:** `webapp/src/lib/teamflow-chart.ts`, `webapp/src/lib/__tests__/teamflow-chart.test.ts`
**커밋:** fab4d80f
**적용한 수정:**
- `sc = Math.max(0, plotW / 2 - BAND_PAD) / mx` 로 하한을 0 으로 막았다. 0 이 아닌 값의 막대는 최소 2px 그대로다.
- 값 칸 축소 폴백은 넣지 않았다. 실측 390 폰에서 svg 폭이 326 으로 경계(232)와 거리가 있어서다.
- 테스트: 200 · 228 · 231 폭 → `sc` 0 · 막대 폭 [2, 2, 0] · 음수 막대 `barX = cx − 2`. 240 폭 → `sc > 0`.

### IN-03: 최대 매집 창이 축 밖이면 가장자리 칸에 잘못 음영이 진다

**수정 파일:** `webapp/src/lib/teamflow-chart.ts`, `webapp/src/components/analytics/teamflow-bucket-table.tsx`, `webapp/src/lib/__tests__/teamflow-chart.test.ts`, `webapp/src/components/analytics/__tests__/teamflow-detail.test.tsx`
**커밋:** c7991438
**적용한 수정:**
- `windowKeysOf` 를 새로 export 했다. 「HH:MM」을 `floor(분/10)` key 범위로 바꾸고, 축으로 자르지 않는다.
- `windowSlotsOf` 는 창 전체가 축 밖이면 null 을 돌려준다. 축 밖은 끝 key < 54 이거나 시작 key > 93 인 경우다. key 93 은 슬롯 38 에 합산되므로 축 안으로 친다(리뷰 원안의 `> 38` 기준이었다면 15:30 창이 빠졌을 것이다).
- 10분 표의 띠는 리뷰가 제안한 `window.i/j`(buckets 배열 인덱스) 대신, 자르지 않은 key 범위로 판정한다.
  - 인덱스 방식은 export 의 배열 순서를 가정해야 한다. key 방식은 그 가정 없이 같은 결과를 낸다.
  - 이 컴포넌트가 받는 prop 타입(`Pick<'start'|'end'>`)도 그대로 둘 수 있다.
  - 창이 key 92 까지 닿으면 key 93 행에도 띠를 긋는 기존 규칙은 유지했다.
- 테스트:
  - 차트: 08:20~08:59 · 15:40~15:59 → null, 08:40~09:09 → [0,0], 15:30~15:39 → [38,38], `windowKeysOf` 골든, 축 밖 창 → shade null
  - 상세: 합성 창 08:20~08:39 → 차트 음영 없음 · 표 띠는 08:20 · 08:30 행에만. 15:10~15:29 창 → 15:10 · 15:30 행에 띠(천일고속 export 에는 key 92 행이 없다). 같은 음영 선택자로 양성 대조도 했다.

### IN-04: 「고가」 보조줄 조건이 sr 설명과 다르다

**수정 파일:** `webapp/src/lib/teamflow-report.ts`, `webapp/src/components/analytics/teamflow-day-grid.tsx`, `webapp/src/components/analytics/__tests__/teamflow-report.test.tsx`
**커밋:** 04c7da6a
**적용한 수정:**
- `teamflow-report.ts` 의 `isNum` 을 export 했다.
- `teamflow-day-grid.tsx` 의 보조줄 조건을 `r.high_rate !== null` 에서 `isNum(r.high_rate)` 로 바꿨다. sr 설명(`rowDescriptionOf`)과 같은 판정이다.
- 컴포넌트 테스트 (o2): `high_rate` 키 없음 · NaN 이면 보조줄도 sr 설명의 「고가」도 없다.

### IN-05: 상세 토글 셰브론에 reduced-motion 처리가 없다

**수정 파일:** `webapp/src/components/analytics/teamflow-toggle.tsx`, `webapp/src/components/analytics/__tests__/teamflow-detail.test.tsx`, `.planning/phases/33-teamflow/33-UI-SPEC.md`
**커밋:** 682260c1
**적용한 수정:**
- 셰브론에 `motion-reduce:transition-none` 을 붙였다. 행 셰브론과 같은 규칙이다.
- UI 감사가 지적한 스펙 내부 모순도 정리했다. 「접힘 토글」 절의 「reduced-motion 없음」을 「접근성 계약」 절과 맞췄다.
- 테스트: 세 토글의 아이콘 class 에 해당 유틸리티가 있는지 확인한다.

### IN-06: 로딩 문구가 보조기기에 알려지지 않는다

**수정 파일:** `webapp/src/components/analytics/teamflow-report.tsx`, `webapp/src/components/analytics/__tests__/teamflow-report.test.tsx`
**커밋:** 2a7f05ff
**적용한 수정:**
- 「불러오는 중…」 `<p>` 에 `role="status"` 와 `aria-live="polite"` 를 붙였다.
- 테스트 (i): `getByRole('status')` 의 텍스트와 aria-live 값을 확인한다.

### IN-07: `isNum` 가드가 세 모듈에 복제돼 있다

**수정 파일:** `webapp/src/lib/teamflow-chart.ts`, `webapp/src/components/analytics/teamflow-members.tsx`
**커밋:** f9f326ba
**적용한 수정:**
- 두 파일의 로컬 정의를 지우고 `@/lib/teamflow-report` 의 `isNum` 을 import 한다(IN-04 에서 export 함).
- 이제 정의는 `teamflow-report.ts` 한 곳뿐이다. 동작 변화는 없다.

## 검증

모든 검증은 **이 워크트리**(`/Users/alex/repos/gh-radar/.claude/worktrees/phase-33`)에서 돌렸다. 이 워크트리에는 `node_modules` 가 있다. 메인 체크아웃에서는 아무것도 실행하지 않았다.

| 항목 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/shared build` | 통과 |
| limitup-sync `tsc --noEmit` + vitest(`--maxWorkers=2`) | 통과 · 9 파일 112 테스트 |
| server `tsc --noEmit` + `tests/routes/teamflow-report.test.ts` · `tests/routes/limitup-report.test.ts` | 통과 · 2 파일 31 테스트 |
| webapp `tsc --noEmit` | 통과 |
| webapp vitest `src/lib/__tests__` + `src/components/analytics/__tests__`(`--maxWorkers=2`) | 통과 · 54 파일 1256 통과 · 1 skip |
| eslint(바꾼 webapp 파일) | 오류 0 · 경고 0 |
| E2E `e2e/specs/teamflow-report.spec.ts` + `e2e/specs/sidebar-tree.spec.ts`(`--workers=1`) | 통과 · 25/25 |

- E2E 를 돌리기 전에 `lsof -nP -iTCP:3100 -sTCP:LISTEN` 이 비어 있는 것을 확인했다. 그래서 Playwright 는 다른 세션 서버를 재사용하지 않고 이 워크트리의 dev 서버를 직접 띄웠다. 끝난 뒤 포트가 다시 비어 있는 것도 확인했다.
- 단언 대상인 렌더 출력은 바뀌지 않았다. 「−0.1억」 골든은 실측 픽스처에 해당 값이 없어 E2E 에 나타나지 않는다. 그래도 회귀를 확인하려고 두 스펙을 돌렸다.
- prettier 는 돌리지 않았다.

## 사람이 확인할 항목

- **WR-01 종료 코드 정책:** backfill 실패는 「failed · 종료 1 · 매 run 반복」으로 남는다. 영구 실패라면 알림이 매일 울린다. 그때는 `LIMITUP_SKIP_DATES` 로 그 날짜를 제외하면 된다(게시된 날짜는 유지됨). 이 정책이 운영 의도와 맞는지 확인이 필요하다.
- **워커 재배포 필요:** 오케스트레이터가 한다. 이 에이전트는 커밋까지만 했다.

---

_Fixed: 2026-10-16T09:50:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
