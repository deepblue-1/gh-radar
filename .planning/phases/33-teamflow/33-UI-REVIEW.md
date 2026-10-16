# Phase 33 — UI Review

**Audited:** 2026-10-16
**Baseline:** 33-UI-SPEC.md (approved 2026-10-16)
**Screenshots:** not captured (코드 전용 감사. 포트 3100 은 다른 세션의 dev 서버라 건드리지 않았고 이 워크트리에서 서버를 띄우지 않았다. 라이브 프로덕션 UAT 는 사용자가 「전부 통과」로 승인함)
**Interaction captures:** off (workflow.ui_interaction_capture 가 false)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | 계약 문구(빈 · 오류 · 로딩 · 토글 · 캡션)가 한 글자 단위로 일치. 일반 라벨 0 |
| 2. Visuals | 3/4 | 계약대로 구조 · 접근성 이식. 로딩 문구에 `role="status"` 없음, 차트 툴팁은 마우스 전용 |
| 3. Color | 4/4 | `--team` · `--team-bg` 가 `:root` · `.dark` 둘 다 정의. 하드코딩 색 0건 |
| 4. Typography | 4/4 | 크기 11 · 12 · 14 · 20, 굵기 400 · 600 뿐. 계약 상한선(5 크기 · 3 굵기) 안 |
| 5. Spacing | 3/4 | 대부분 4 배수 토큰. 선언 안 된 2px 보정 3곳 |
| 6. Experience Design | 3/4 | 상태기계 · 게이트 · 아코디언 · 토글 모두 구현. 토글 chevron 만 reduced-motion 미대응, 에러 · 로딩 일부 접근성 갭 |

**Overall: 21/24**

---

## Top 3 Priority Fixes

1. **로딩 한 줄에 라이브 영역이 없다** — 스크린리더 사용자는 날짜를 바꾼 뒤 로딩과 완료를 알 수 없다 — `teamflow-report.tsx:122` 의 「불러오는 중…」 `<p>` 에 `role="status"` 를 준다(오류 상자는 이미 `role="alert"`).
2. **`teamflow-toggle.tsx:45` chevron 회전이 `motion-reduce` 를 무시한다** — 행 셰브론(`teamflow-day-grid.tsx:253`)은 `motion-reduce:transition-none` 인데 토글만 빠져 한 화면 안에서 규칙이 갈린다. UI-SPEC 의 「접힘 토글」 절(「reduced-motion 없음」)과 「접근성 계약」 절(「reduced-motion 이면 회전 … 즉시」)이 서로 모순이라 생긴 갭이다 — `motion-reduce:transition-none` 을 추가하고 스펙 모순도 정리한다.
3. **선언 밖 2px 간격 3곳** — `teamflow-detail.tsx:62` `mt-0.5`, `teamflow-day-grid.tsx:167` `gap-0.5`, `teamflow-day-grid.tsx:200` `gap-y-0.5`. 4 배수 스케일(그리고 스펙 「Exceptions」)에 없다 — 상한가 보고서 상속이라면 Exceptions 에 한 줄 선언하고, 아니면 `gap-1` / `mt-1` 로 맞춘다.

(그 밖의 6개 이상 결함은 없다. 위 셋이 전부이며 BLOCKER 는 없다.)

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)
- 빈 상태 두 종(`teamflow-report.tsx:139` 「아직 올라온 팀 매집 보고서가 없어요」, `:144` 「이 날은 팀 매집 데이터가 없어요」) · 「최신 보고서 보기」(`:148`) · 오류 「보고서를 불러오지 못했어요」 + 「다시 시도」(`:127` · `:133`) · KPI 캡션(`:158`) · 머리 설명(`:116`)이 UI-SPEC Copywriting Contract 와 그대로다.
- 상세 토글 「구간표 보기」 · 「10분 표 보기」 · 「판정 기준」(`teamflow-detail.tsx:101` · `:119` · `:126`), 차트 빈 상태 「구간 체결이 없어요」(`band-chart.tsx:62`) · 「10분 체결 기록이 없어요」(`bucket-chart.tsx:236`) · 「거래원 자료 없음」(`members.tsx:83`) 일치.
- 「Submit」 · 「OK」 · 「No data」 류 일반 라벨 0건. 사실 문장은 `summary_lines` 원문을 그대로 쓴다.
- 결함: 없음. 4 로 둔다.

### Pillar 2: Visuals (3/4)
- 시선 앵커는 KPI 띠 20px 값 하나로 계약과 같다(`kpi-strip.tsx:37`). 목록은 상한가 보고서 DayGrid 문법을 유지해 두 화면이 한 몸으로 읽힌다.
- 아이콘은 `ChevronDown` · `ChevronRight` 둘뿐이고 모두 `aria-hidden`. 아이콘 전용 버튼 없음. 차트 SVG 는 `role="img"` + 요약 `aria-label`, 미니막대는 `aria-hidden`.
- WARNING: 차트 칸 수치는 SVG `<title>` 네이티브 툴팁뿐이라 터치에서는 접힌 표를 열어야 한다. 스펙이 의도한 경로(스케치 015 C)지만 표 토글이 기본 접힘이라 폰에서 칸 값을 알려면 한 번 더 눌러야 한다. 허용 범위 내 트레이드오프로 기록한다.
- 감점 사유: 위 1건 + 스크린샷 부재로 실제 렌더 확인(1280 7열 폭 · 폰 390 말줄임)이 코드 추론에 머문다.

### Pillar 3: Color (4/4)
- `globals.css:83-84`(라이트 `#a234c7` · `#f9f0fc`)와 `:235-236`(다크 `#c353e5` · `rgba(174,61,209,.16)`)이 스펙 표와 일치하고 두 테마에 모두 있다. 축 설명 주석도 들어갔다(`:81` · `:233`).
- teamflow 파일에서 `#hex` · `rgb(` · `oklch` 0건 — 전부 CSS 변수.
- `--team` 은 계약된 4곳(비중 선 · 비중 % · 창 음영 · 표 띠)에만 쓰는 구조. 액센트는 표 토글 글자(`toggle.tsx`)와 빈 상태 Button, 상속된 「다시 시도」뿐이고 「판정 기준」은 `--fg-2` 로 계약대로.
- `--destructive` 미사용(계약대로).

### Pillar 4: Typography (4/4)
- 사용 분포: `text-[length:var(--t-caption)]` 27 · `var(--t-sm)` 10 · `text-[11px]` 2 · `text-[20px]` 1 · SVG `fontSize={11}` 2. 굵기는 `font-semibold` 22 · `font-normal` 1 · SVG `fontWeight={600}` 2.
- 새로 도입한 크기는 11 · 12 · 14, 굵기는 400 · 600 뿐이며 20(KPI 값) · 22(h1) · 700 은 상속. 계약 상한선 안이다.
- 차트 글자는 측정 폭 1:1 viewBox 라 폰에서도 11px(스펙 Discretion 8번).

### Pillar 5: Spacing (3/4)
- 사용 클래스는 `gap-1/2/4` · `gap-x-2/3` · `px-2/4` · `py-3/12` · `p-3/4` · `pt-1` · `pb-6`(상세 하단 24px, 계약대로 `pb-5` 에서 올림) 등 4 배수 토큰이 압도적이다. 임의값은 `mt-[calc(4.5rem+var(--app-safe-top))]` 2건(행 점프 보정, 계약 명시).
- WARNING: `mt-0.5`(`detail.tsx:62`) · `gap-0.5`(`day-grid.tsx:167`) · `gap-y-0.5`(`day-grid.tsx:200`)는 2px 로 스케일과 Exceptions 어디에도 없다. `px-3.5` · `gap-y-1.5` 는 Exceptions 에 선언돼 있어 문제 없음.
- 열 템플릿 · `min-h-11` · 미니막대 28px 등 계약 치수 준수.

### Pillar 6: Experience Design (3/4)
- 상태기계 `loading` · `error` · `gate` · `ready`, 빈 상태 2종, 오류 `role="alert"` + 재시도, 401/403 DmaGate, `?d=` 형식 오류 replace, 날짜 알약은 행 있는 날짜만 이동 — 계약 전부 코드에 있다.
- 아코디언은 `key={resp.date}` 로 날짜 변경 시 초기화, 열렸을 때만 상세 마운트, 세 토글은 기본 접힘 · 독립 · 닫힘 시 언마운트, `aria-expanded` / `aria-controls` 정확. 행 aria 는 10개 속성 지점.
- WARNING: 「불러오는 중…」에 `role="status"` / `aria-live` 없음(Fix 1).
- WARNING: 토글 chevron `motion-reduce` 누락(Fix 2). 스펙 내부 모순이 원인이므로 스펙도 함께 정리할 것.
- WARNING: 오류 시 재시도는 `attempt` 증가만 하며 로딩 중 다중 클릭 방지(disabled)가 없다. 재요청 경합은 상태기계가 마지막 응답만 쓰는지에 달렸으나 이번 감사에서 검증 못 했다. (코드 전용 감사의 한계)
- 파괴적 동작 없음 → 확인 다이얼로그 해당 없음. Registry audit: 제3자 블록 0건, 검사 대상 없음.

---

## Files Audited
- `webapp/src/app/analytics/teamflow/page.tsx`
- `webapp/src/components/analytics/teamflow-{report,kpi-strip,day-grid,band-strip,band-chart,band-table,bucket-chart,bucket-table,members,detail,toggle}.tsx`
- `webapp/src/lib/teamflow-report.ts` · `webapp/src/lib/teamflow-chart.ts`
- `webapp/src/components/layout/app-sidebar.tsx` (NAV_TEAMFLOW · `:183` · `:592` · `:681`)
- `webapp/src/styles/globals.css` (`--team` · `--team-bg`)
- `.planning/phases/33-teamflow/33-UI-SPEC.md`
