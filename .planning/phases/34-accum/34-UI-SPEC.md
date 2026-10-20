---
phase: "34"
slug: "accum"
status: approved
reviewed_at: "2026-10-20"
shadcn_initialized: true
preset: "radix-nova (components.json · baseColor neutral · Toss TDS 토큰 override)"
created: "2026-10-20"
---

# Phase 34 — UI Design Contract

> 매집감지(accum) 보고서 — 「분석 › 매집감지 보고서」 `/analytics/accum?d=YYYYMMDD`. gsd-ui-researcher 가 만들고 gsd-ui-checker 가 검증한다.
> **디자인 시스템은 이미 확립돼 있다.** 이 화면은 팀 매집 보고서(`/analytics/teamflow` · Phase 33 · `33-UI-SPEC.md`)의 **형제**다 — 날짜 알약 · KPI 4칸 · 카드 안 행 목록 · 그 자리 아코디언(기본 전부 접힘) · 억 1자리 · 순수 SVG · 1:1 viewBox · 접힘 토글 문법을 그대로 쓴다. 팀 매집 보고서와 다른 점은 다섯 가지다: ① 상세를 **행 펼침 때 지연 로드**(D-06 · 목록 응답에 payload 없음) ② 상태 배지 묶음 · 종료 사유 줄 · 흐린 행(D-11) ③ **시간(ms) 축 3패널 차트 + 확대/축소 · 이동**(D-14 ~ D-17) ④ 사이클 표(2개↑ · D-20) ⑤ 「KYOBO119 판정 기준」 칩 두 곳(D-22).
> 결정 출처: `34-CONTEXT.md` D-08 ~ D-22 · D-27(잠금) · 「Claude's Discretion」, 채택 목업 `reference/mockup-accum-list.html`(**변형 A**) · `mockup-accum-chart.html`(**C + 확대/축소 · 프리셋 · 기본 전체 창 · 작은 원**) · `mockup-accum-detail.html`(토글 채택값: 사이클 표 2개↑ · 손익 줄 켬 · 10분 막대 세 번째 패널 · 임계 판정 기준 안), 열 사전 정본 `docs/inbox/from-gh-trade/261020-accum-flow-export.md`, 리서치 `34-RESEARCH.md`(D-17 = 순수 SVG 자체 pan/zoom).
> 목업의 픽셀 값(18 · 22 · 110 · 70 · 10.5 · 12.5 · 11.5 등)은 목업 프레임 값이다. 이 계약은 Phase 33 과 같은 규칙으로 4 배수 · 프로젝트 글자 체계(11 · 12 · 14)로 옮긴다. 목업 데이터의 「상한가 HH:MM」 · 사이클 · 이월 · pos 값은 **합성**이다(D-12 — 실제 태그는 「상한가 +NN.N%」).

### 표면 지도

| 표면 | 결정 | 주 파일(이름은 플래너 결정 · 예시) |
|---|---|---|
| A1 페이지 셸 — 머리 · 출처 칩 · 날짜 알약 · 상태(로딩 · 오류 · 빈 · 게이트) | D-07 · D-22 | `app/analytics/accum/page.tsx`(AppShell + Suspense) · `components/analytics/accum-report.tsx` |
| A2 KPI 4칸 | D-09 | `accum-kpi-strip.tsx`(teamflow 복제) |
| A3 매집감지 종목 목록(행 · 배지 묶음 · 사유 줄 · 흐림 · 아코디언) | D-08 · D-10 ~ D-13 | `accum-day-grid.tsx`(teamflow-day-grid 복제) |
| A4 상세 셸 — 지연 로드 · 캐시 · 스켈레톤 · 실패 | D-06 · D-18 | `accum-detail.tsx` · `lib/accum-api.ts` |
| A5 상세 KPI 줄 · 범례 · 프리셋 줄 | D-14 · D-19 | `accum-detail.tsx` |
| A6 3패널 차트(가격 · 순매수 누적 · 10분 매수/매도) + 확대/축소 · 이동 | D-14 ~ D-18 | `accum-chart.tsx` · `hooks/use-chart-view.ts` · `lib/accum-chart.ts` |
| A7 사이클 표(2개↑) | D-20 | `accum-cycle-table.tsx` |
| A8 팀 당일 손익 줄 | D-21 | `accum-detail.tsx` |
| A9 판정 기준 접힘 + 출처 칩 | D-22 | `accum-detail.tsx`(토글은 `TeamflowToggle` 재사용 또는 복제 — 플래너) |
| A10 사이드바 「분석 › 매집감지 보고서」 | D-27 | `components/layout/app-sidebar.tsx` |
| A11 표시 변환 · 차트 기하 | D-08 ~ D-16 | `lib/accum-report.ts` · `lib/accum-chart.ts` |
| (보조) DmaGate 표면 이름 「매집감지 보고서」 | D-06 | `components/trading/dma-gate.tsx`(`DmaGateSurface` 유니온 추가) |

반응형: 팀 매집 · 상한가 보고서와 **같은 뷰포트 브레이크포인트**다 — 목록 행은 `< xl` 카드형(폰 390 「3줄 카드」) · `xl`(≥1280) 이상 7열 표(같은 DOM · CSS 로만 배치 전환). 상따 화면(`/trading/limit-chaser`)의 본문 폭 컨테이너 쿼리 밴드(`globals.css` §2.2b · CLAUDE.md Conventions)는 이 화면에 **적용하지 않는다** — 분석 화면은 뷰포트 규칙이다. 차트는 브레이크포인트가 없고 측정 폭(`useChartWidth`)에 1:1 로 맞는다.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (이미 초기화 — `webapp/components.json`) |
| Preset | `radix-nova` · base `radix` · baseColor `neutral` · cssVariables — 색은 `globals.css` Toss TDS 토큰이 override |
| Component library | radix (`radix-ui@^1.4.3`) — 이 phase 는 radix 프리미티브를 새로 쓰지 않는다 |
| Icon library | lucide (`lucide-react@1.8.0`) — `ChevronDown`(행 셰브론) · `ChevronRight`(판정 기준 토글) 2개만 |
| Font | Pretendard Variable(`--font-sans`) · 수 · 금액 · % · 시각은 `mono` 클래스(`--font-num` + `tabular-nums`) |
| Chart | **라이브러리 없음 — 순수 SVG 자체 pan/zoom**(D-17 리서치 결론 · `34-RESEARCH.md` §D-17). lightweight-charts · recharts(`ui/chart`)를 쓰지 않는다 → oklch→hex 변환도 불필요. 목업 C 의 `clampView` · `ticks` · `preset` · `rOf` · 휠/드래그 · 15분 끊기 JS 를 React 로 이식 |

---

## Component Inventory

Enumerated by `npx shadcn info` (cwd `webapp/`, 「Installed Components」 절) — 21 components — shadcn@4.2.0 — 2026-10-20.

설치 목록: badge, button, card, chart, checkbox, command, dialog, input-group, input, popover, separator, sheet, skeleton, slider, switch, table, tabs, textarea, toggle-group, toggle, tooltip. 아래 표는 **이 phase 가 닿는 것만 고른 비배타 목록**이다 — 표 밖 컴포넌트를 확인해 쓰는 것은 정상 경로다. 이 phase 는 shadcn 컴포넌트를 새로 설치하지 않는다.

| Component | Import path | Notes |
|-----------|-------------|-------|
| Button | `@/components/ui/button` | 빈 상태 「최신 보고서 보기」(teamflow `EmptyBox` 와 같은 기본 변형 · `mt-2`) |
| Table | `@/components/ui/table` | 사이클 표(A7) — 래퍼 `tbl-wrap` 이 `overflow-x-auto`(폰 가로 스크롤 · D-20) · `teamflow-band-table.tsx` 와 같은 사용법 |
| Skeleton | `@/components/ui/skeleton` | 상세 지연 로드 자리표시(A4 · D-18) — shimmer 는 `motion-reduce` 에서 멈춘다(컴포넌트 내장) |
| `PageHeader` (프로젝트) | `@/components/layout/page-header` | 제목 「매집감지 보고서」 · `description` = 출처 칩 + 한 줄 · `actions` = 날짜 알약 |
| `CARD` · `ROW_DIVIDER` (프로젝트) | `@/components/layout/page-layout` | 목록 카드 면 · 행 구분선 · 빈/오류 상자 |
| `LimitupDateNav` (프로젝트) | `@/components/analytics/limitup-date-nav` | 날짜 알약 — **그대로 재사용**(aria 「이전 보고서」 · 「다음 보고서」) |
| `TeamflowKpiStrip` 문법 (프로젝트) | `@/components/analytics/teamflow-kpi-strip` | **복제**(CONTEXT 재량 — 일반화 안 함). 값 칸에 보조 글자가 붙는 것만 다르다(A2) |
| `TeamflowDayGrid` 아코디언 문법 (프로젝트) | `@/components/analytics/teamflow-day-grid` | **복제** — 버튼 문법 · `pendingScroll` · `scroll-mt` · `aria-describedby` sr 설명 · 같은 DOM CSS 전환 · 기본 전부 접힘 |
| `TeamflowToggle` (프로젝트) | `@/components/analytics/teamflow-toggle` | 「판정 기준」 접힘(tone `muted`) — import 재사용 또는 복제(플래너) |
| `DmaGate` · `useDmaGateReason` (프로젝트) | `@/components/trading/dma-gate` | `surface="매집감지 보고서"` — 유니온에 추가(「서」 받침 없음 → `topicParticle` 이 「매집감지 보고서는」) |
| `parseYmdParam` · `dateNavOf` · `fmtYmdShort` · `fmtYmdLabel` · `kstSecOf` (프로젝트) | `@/lib/limitup-report` | `?d=` 판정 · 알약 이동 · 문서 제목 · KST 시각 — 그대로 |
| `fmtEok` · `toneOf` · `TONE_TEXT` · `fmtRate` · `kstHm` · `isNum` · `MINUS` · `fmtPnl` · `pnlOf` (프로젝트) | `@/lib/teamflow-report` | 억 · % · 시각 · 부호 색 · 손익 — import 재사용(D-13). `pnl` 13키가 teamflow 와 같다(인박스) |
| `useChartWidth` · `CHART_FALLBACK_W` (프로젝트) | `@/hooks/use-chart-width` · `@/lib/teamflow-chart` | 차트 폭 측정 · jsdom 0폭 640 폴백 |
| `authFetch` · `ApiClientError` (프로젝트) | `@/lib/auth-fetch` · `@/lib/api` | 목록 · 상세 fetch · 401/403 → 게이트 |
| `readQueryCache` · `writeQueryCache` (프로젝트) | `@/lib/query-cache` | 상세 `(date, isin)` 메모리 캐시(사용자 전환 시 AuthProvider 가 비운다 — 리서치) |
| lucide `ChevronDown` · `ChevronRight` | `lucide-react` | 행 셰브론 · 판정 기준 토글 아이콘(`aria-hidden`) |

라이브 「매집」 패널의 `StateBadge` · `CarryBadge`(`workbench/accum-strip.tsx`)와 `sortAccum`(`lib/accum-list.ts`)은 **import 하지 않는다** — 배지는 색 축만 같고 치수 · 라벨 3 이 다르며(A3), 정렬은 매집중/매도중을 가르는 D-08 규칙이 다르다(리서치 「정렬」). shared `ACCUM_STATE_LABELS` 도 건드리지 않는다(D-11).

---

## Spacing Scale

Declared values (must be multiples of 4) — 프로젝트 토큰 `--s-*` 그대로:

| Token | Value | Usage |
|-------|-------|-------|
| xs (`--s-1`) | 4px | 배지 사이(`gap-1`) · 배지 묶음 → 사유 줄 · 상세 위 패딩(`pt-1`) · 범례 견본–글자 · 토글 아이콘–글자 |
| sm (`--s-2`) | 8px | KPI 칸 사이(`gap-2`) · KPI 값 → 보조 글자 · 행 좌우 패딩(`px-2`) · 차트 블록 안 세로 간격(KPI 줄 → 범례 → 프리셋 줄 → 차트 → 캡션) · 프리셋 버튼 사이 · 소제목 → 표 |
| (`--s-3`) | 12px(표준 집합 4/8/16/24/32/48/64 밖 — 4 배수 프로젝트 토큰 · 33-UI-SPEC 과 같은 상속으로 수용) | 행 위아래 패딩(`py-3`) · 행 칸 사이(`gap-x-3`) · KPI 칸 안 패딩(`p-3`) · KPI 줄 · 손익 줄 항목 사이(`gap-x-3`) · 범례 항목 사이 · 폰 메타 항목 사이 |
| md (`--s-4`) | 16px | 페이지 세로 간격(`gap-4`) · 목록 카드 패딩(`p-4`) · 상세 블록 사이(차트 블록 → 사이클 표 → 손익 줄 → 판정 기준 → 출처 칩) |
| lg (`--s-5`) | 24px | 상세 아래 여백(`pb-6` — teamflow 상속) |
| xl (`--s-6`) | 32px | (변경 없음) |
| 2xl (`--s-8`) | 48px | 빈 · 오류 상자 세로 패딩(`py-12` — teamflow `EmptyBox` 상속) |
| 3xl (`--s-10`) | 64px | (변경 없음) |

이 phase 가 정하는 치수:

| 치수 | 값 | 근거 |
|---|---|---|
| 페이지 컨테이너 | `mx-auto max-w-[1120px] flex-col gap-4` | teamflow 그대로 |
| 행 버튼 | 최소 높이 44px(`min-h-11`) · 패딩 8/12 · 칸 사이 12 · `scroll-mt-[calc(4.5rem+var(--app-safe-top))]` | `teamflow-day-grid.tsx` 그대로 |
| 데스크톱 열 템플릿(xl) | `xl:grid-cols-[minmax(0,176px)_minmax(152px,1fr)_104px_160px_112px_88px_16px]` — 종목 · 상태 · 결과 · 팀 순매수(등록 후) · 하루 순매수 · 등록·종료 · 셰브론 | 목업 A `--cols: 176 150 96 112 112 90 16` → 4 배수. 상태 칸은 「이월 탈락(복원 안 됨) · 08:41」(≈ 170px)이 들어가게 남는 폭을 먹는 `minmax(152px,1fr)` · 결과 104 = 「상한가 +29.9%」 태그 온전 폭(teamflow 결과 칸과 같음) · 팀 순매수 160 = 아랫줄 「평단 200,407 · 등록가 205,500」. 합 808 + 칸 사이 72 = 880 ≤ xl 목록 카드 안쪽(≈ 952) |
| 상태 배지 | 높이 20px(`h-5`) · 좌우 6px(`px-1.5`) · 모서리 4px · 1px 투명 테두리(종료만 `--border-subtle`) · 배지 사이 4px · `flex-wrap` | 목업 A `.badge` 18px → 결과 태그와 같은 20px(한 줄에 나란히 설 때 높이가 같다) |
| 결과 태그 | 높이 20px(`h-5`) · 좌우 8px · `rounded-full` | teamflow `TAG` 상속 |
| 출처 칩 | 좌우 8px · 위아래 2px · 모서리 `--r-sm`(6px) | 목업 `.src` 2/7 → 2/8 |
| 상세 루트 | `flex flex-col gap-4 px-2 pt-1 pb-6` | teamflow 상세 상속 |
| 차트 블록(KPI 줄 · 범례 · 프리셋 · 차트 · 캡션) | `flex flex-col gap-2` | 목업 상세 `.inner gap 10` → 8 |
| 프리셋 버튼 | 최소 높이 32px(`min-h-8`) · 좌우 12px · `rounded-full` · 버튼 사이 8px | 목업 `.ctl button` 4/10 → 손가락 대상 32(teamflow 토글 높이와 같다) |
| 3패널 차트(SVG · 측정 폭 W) | 왼쪽 축 52 · 오른쪽 축 56 · 위 16 · **가격 판 200** · 판 사이 24 · **누적 판 112** · 판 사이 24 · **10분 판 72** · 시각 눈금 24 → **높이 472 고정**(폰 · 데스크톱 같다) | 목업 C `L 52 · R 56 · TOP 16 · H1 200 · GAPP 22 · H2 110 · H3 70 · BOT 22` → 4 배수 |
| 사이클 표 | 셀 패딩 8/12(Table 기본) · 마지막 사이클 행 첫 칸 왼쪽 띠 3px | 목업 `td.cur inset 3px` · teamflow 10분 표 띠와 같은 값 |
| 판정 기준 토글 | 최소 높이 32 · 아이콘 16 · 사이 4 | `TeamflowToggle` 그대로 |

Exceptions (상속 · 차트 내부 미세 치수 — 간격 스케일 밖으로 선언):
- 행 안 세로 간격 6px(`gap-y-1.5`) — `teamflow-day-grid.tsx` 행 버튼 상속.
- 폰 메타 줄(A3) · 손익 항목 줄(A8) 줄 사이 2px(`gap-y-0.5`) — teamflow 메타 · 손익 줄 상속.
- 상태 배지 좌우 6px(`px-1.5`) — 목업 A 값. 8 이면 「이월 탈락」 류 배지 3개가 폰 2줄에서 한 줄을 넘기 쉽고 4 면 글자가 테두리에 붙는다.
- 출처 칩 위아래 2px(`py-0.5`) — 12px 글자를 20px 칩에 맞추는 값(목업 그대로).
- 상세 흐린 행 불투명도 .6(D-11 「≈ .6」).
- 차트 내부: 세로선 라벨 줄 간격 14 · 라벨–선 4 · 판 제목 기준선 = 판 위 8 · 선 굵기(가격 1.25 · 누적 계단 1.5 · 등록선 1.5 · 종료선 1.25 점선 `4 3` · 0선 1 점선 `2 3`) · 원 반지름 2.2~7(D-15 식) · 원 테두리 .75(`first` 1.5) · 10분 막대 폭 = 현재 창 칸 폭 × 0.42(최소 1.5) · 막대 쌍 사이 1 · 가격 축 여유 = 범위 × 8%. 목업의 1.3 · 1.6 · 1.4 · .8 · 1.6 선 굵기는 0.25 단위로 맞춘 값이다.
- 범례 견본 10px(원 · 정사각) · 선 견본 10×2 · 세로선 견본 2×10 — 33-UI-SPEC 「범례 견본 10px」 상속.
- 사이클 표 마지막 행 왼쪽 띠 3px(`inset 3px 0 0 var(--team)`) — 33 상속.

**복제 시 치수 불변 계약:** `TeamflowKpiStrip` · `TeamflowDayGrid` 를 복제해도 행 버튼 `min-h-11` · 패딩 8/12 · `scroll-mt-[calc(4.5rem+var(--app-safe-top))]` · KPI 타일 `p-3` · `--r-md` · 값 20/600 `mono` · 라벨 12/400 · 폰 2열 / md 4열은 **같은 값**으로 남는다.

---

## Typography

이 phase 가 **새로 짓는** 글자 역할은 아래뿐이다 — 크기 3개(11 · 12 · 14), 굵기 2개(400 · 600).

| Role | Size | Weight | Line Height | 자리 |
|------|------|--------|-------------|------|
| 상태 배지 · 결과 태그 · 차트 안 글자(가격 축 · 누적 축 · 10분 축 · 시각 눈금 · 판 제목 · 세로선 라벨 · 이월 줄 · 빈 판 글자) | 11px | 600(배지 · 태그 · 판 제목 · 등록선 라벨 · 이월 줄) / 400(축 · 눈금 · 종료선 라벨 · 빈 판 글자) | 16px | SVG `<text>` 는 측정 폭 1:1 viewBox 라 폰에서도 11px |
| 캡션 · 열 머리 · 출처 칩 · KPI 라벨 · KPI 보조 글자 · 사유 줄 · 행 아랫줄(평단 · 등록가 / 종료 시각) · 결과 보조줄 · 폰 메타 · 상세 KPI 줄 · 범례 · 프리셋 버튼 · 창 범위 · 차트 캡션 · 사이클 표 · 손익 항목 · 판정 기준 본문 · 상세 오류 · 「다시 시도」 | 12px(`--t-caption`) | 400(본문) / 600(프리셋 버튼 · 상세 KPI 줄 값 · 사이클 표 순매수 · 토글 · 「다시 시도」) | 1.5 | teamflow 캡션 · 표와 같은 값 |
| 종목명 · 팀 순매수 · 하루 순매수(행) · 등록·종료 첫 줄 · 목록 소제목 · 상세 소제목(「사이클」 · 「팀 당일 손익」) · 손익 합계 · 빈/오류 제목 | 14px(`--t-sm`) | 600(종목명 · 금액 · 소제목 · 손익 합계 · 제목) / 400(등록·종료 첫 줄) | 1.5 | teamflow 행 · 소제목과 같은 값 |

상속(바꾸지 않음): 페이지 h1 22/700(`PageHeader`) · 설명 14/400 · KPI 값 20/600 `mono` 줄높이 1.2(페이지 시각 앵커) · KPI 라벨 12/400 · 날짜 알약 14/600 `mono`.

**페이지 전체 합계(상한선):** 크기 5개(11 · 12 · 14 · 20 · 22) · 굵기 3개(400 · 600 · 700). 20 · 22 · 700 은 이미 승인된 시스템 역할(`PageHeader` h1 · KPI 값)에서 온다. 플래너 · 실행자는 이 합계 밖의 크기 · 굵기를 추가하지 않는다. 목업 값(10.5 · 11.5 · 12.5 · 13.5 · 15 · 16)은 위 3 크기로 옮긴다 — 목업 배지 700 은 600 으로(라이브 패널 9px/700 은 작업대 밀도 전용 — 아래 Discretion 1).

수 · 금액 · % · 시각 · 가격은 전부 `mono`(같은 서체 + tabular-nums) — 차트 축 글자도 `font-variant-numeric: tabular-nums`.

---

## Color

| Role | Value (라이트 / 다크) | Usage |
|------|-------|-------|
| Dominant (60%) | `--surface` #f2f4f6 / #0a0a0a · `--bg` #ffffff / #0a0a0a | 본문면 |
| Secondary (30%) | `--card` #ffffff / #151515 · `--muted` #f2f4f6 / #2d2d2d | 목록 카드 · KPI 칸 · 빈/오류 상자 / 날짜 알약 · 출처 칩 · 행 hover · 펼친 행 면(`color-mix(in oklab, var(--muted) 60%, transparent)`) · 중립 결과 태그 · 종료 배지 · 「사이클 n」 배지 · 프리셋 버튼(꺼짐) · 스켈레톤 |
| Accent (10%) | `--primary` #3182f6 / #3485fa · `--accent-fg` #1b64da / #8ab8ff | 아래 목록 자리만 |
| Destructive | `--destructive` | **이 phase 는 쓰지 않는다**(파괴적 동작 없음 · 읽기 전용 보고서). 가격 방향 빨강은 `--up` — 상태 적색과 섞지 않는다 |

**기존 축 토큰(이미 있음 — 값 변경 없음):** `--team`/`--team-bg`(팀 축 · Phase 33) · `--accum-sell`/`--accum-sell-bg` · `--accum-carry`/`--accum-carry-bg`(매집 상태 축 · quick-261018-rfy) · `--up`/`--down`/`--up-bg`(가격 방향) · `--pill-on-bg`/`--pill-on-fg`(작은 알약 선택 축).

**새 토큰(이 phase 의 유일한 토큰 추가) — 차트 시간 띠 축:**

| 토큰 | 라이트 | 다크 | 자리 |
|---|---|---|---|
| `--accum-shade` | `rgba(107, 118, 132, 0.10)` (grey600 `--muted-fg` 틴트) | `rgba(255, 255, 255, 0.07)` | 등록 전 음영(세 판 전체 높이 · 오늘 등록 종목만) · 범례 「등록 전」 견본 |
| `--accum-gap` | `rgba(107, 118, 132, 0.07)` | `rgba(255, 255, 255, 0.04)` | 15:30~16:00 빈 띠(체결 없음 정상 구간) |

- 목업의 `--shade` · `--gap` 값을 그대로 옮기되 이름은 Tailwind `gap-*` 와 헷갈리지 않게 `--accum-*` 로 짓는다(리서치 권고).
- `globals.css` `:root` · `.dark` **둘 다** 정의(한쪽만 두면 반대 테마에서 조용히 사라진다) · hex/rgba 만(oklch 금지).
- `styles/__tests__/tds-tokens.test.ts` 의 `THEME_COLOR_TOKENS` 에 `accum-shade` · `accum-gap` 추가 · `LIGHT_EXPECTED` / `DARK_EXPECTED` 에 위 값 고정.
- 주석에 축을 적는다: 「매집감지 차트 시간 띠 축 — 등록 전 음영 · 15:30~16:00 빈 띠. 가격 방향 · 팀(`--team-bg` 최대 매집 창) · 매집 상태 축과 다르다. 서로 대체하지 마라.」

목업 변수 → 프로젝트 토큰:

| 목업 | 토큰 | 자리 |
|---|---|---|
| `.badge.s1` | `--team-bg` 면 + `--team` 글자 | 「매집중」 배지 |
| `.badge.s2` | `--accum-sell-bg` 면 + `--accum-sell` 글자 | 「매도중」 배지 |
| `.badge.s3` | `--muted` 면 + `--muted-fg` 글자 + `--border-subtle` 1px | 「종료」 배지 |
| `.badge.s3`(투명 테두리) | `--muted` 면 + `--muted-fg` 글자 | 「사이클 n」 배지 |
| `.badge.carry` | `--accum-carry-bg` 면 + `--accum-carry` 글자 | 「이월 D+n」 배지 |
| `.tag.limit` | `--up-bg` 면 + `--up` 글자 | 「상한가 +NN.N%」 |
| `.tag.rate` | `--muted` 면 + `--fg-2` 글자 | 「+NN.N%」 |
| `.src` | `--muted` 면 + `--muted-fg` 글자 | 출처 칩 두 곳 |
| `.px path` | `--fg-2` | 가격 선 · 범례 「가격(10초)」 |
| `circle.B` / `circle.S` | `--up` / `--down`(채움 불투명도 .55 · 테두리 .9) | 팀 매수 / 매도 원 |
| `circle.first` | 테두리 `--fg` 1.5 · 채움 불투명도 .9 | 팀매수 시작 |
| `.cum path` · 누적 축 글자 · 「순매수 누적」 제목 | `--team` | 순매수 누적 계단 |
| `.zero` | `--faint` 점선 | 누적 판 0선 |
| `.reg line` · `.reg text` | `--team` | 등록 세로선 · 라벨 |
| `.end line` · 종료 라벨 | `--muted-fg` 점선 / 글자 | 청산 · 종료 세로선 |
| `.bk rect.b` / `.s` | `--up` / `--down`(불투명도 .7) | 10분 팀 매수 / 매도 막대 |
| `.ax line` | `--border-subtle` | 시각 격자 · 판 아래 선 |
| `svg text` | `--muted-fg` | 축 · 눈금 |
| `.ctl button.on`(`--fg` 면 · `--bg` 글자) | `--pill-on-bg` 면 + `--pill-on-fg` 글자 | 선택된 프리셋 — 프로젝트의 「작은 알약 선택」 축(카드 탭 · 거래소 태그와 같다). 목업의 반전 색은 목업 프레임 전용이라 옮기지 않는다 |
| `.chart` 배경(`--card` / 라이트 `--muted`) | 없음(차트는 목록 카드 `--card` 위에 바로) | 33 Discretion 9 상속 — 상세가 이미 `--card` 위라 같은 면을 또 깔면 다크에서 안 보이고, 라이트 `--muted` 면은 `--accum-shade` 대비를 깎는다 |
| `.pnl` · `.tw` 상자 | 손익 줄은 상자 없음(teamflow 동형 · D-21) · 사이클 표는 `Table` 래퍼(면 없음) | 상세 안 면 겹침 회피 |

글자 색:

| 요소 | 토큰 |
|---|---|
| 종목명 · 소제목 · 빈/오류 제목 · 손익 합계(0) · 상세 KPI 줄 값(등록가 · 평단 · 최고 순매수) | `--fg` |
| 등록·종료 첫 줄 · 표 본문 수 · 손익 항목 값(부호 없는 것) | `--fg-2` |
| 코드 · 시장 · 캡션 · 열 머리 · 사유 줄 · 행 아랫줄 · 결과 보조줄 · 폰 메타 라벨 · 상세 KPI 줄 라벨 · 범례 · 창 범위 · 축 · 판정 기준 본문 · 출처 칩 · 「장 마감까지」 | `--muted-fg` |
| 「—」(null) · 빈 판 글자(「팀 체결 없음」) · 「그날 체결 자료 없음」 · 로딩 | `--faint` |
| 금액(팀 순매수 · 하루 순매수 · KPI 합 · 등록 후 순매수 · 사이클 순매수 · 손익) | 부호 색 — 반올림 값 > 0 `--up` · < 0 `--down` · 0 이면 `--fg-2`(「0.0억」 · D-10) |
| 「매집중」 배지 · 등록선 라벨 · 누적 축 · 「순매수 누적」 | `--team` 600 |
| 「매도중」 배지 | `--accum-sell` 600 |
| 「이월 D+n」 배지 · 차트 이월 줄 | `--accum-carry` 600 |

**색만으로 말하지 않는다:** 금액은 항상 부호 글자(「+」 · 「−」 U+2212)를 함께 쓰고, 상태는 배지 글자(매집중/매도중/종료)가 말하며, 종료 사유는 사유 줄 글자가 말한다. 흐림(.6)은 사유 줄과 함께만 나온다. 원 · 막대 금액은 `<title>` 과 상세 KPI 줄 · 사이클 표 · 손익 줄 글자에 있다. 등록선(실선 `--team`)과 종료선(점선 `--muted-fg`)은 선 모양과 라벨 글자로도 갈린다.

Accent reserved for (이 phase 가 **추가하는** accent 소비처는 2곳뿐이다): ① 상세 실패 상자의 「다시 시도」 텍스트 버튼(`--accent-fg` 12/600 — 페이지 오류 「다시 시도」 와 같은 링크 글자), ② 빈 상태 「최신 보고서 보기」 `Button`(기본 변형 `--primary` 면 — teamflow 상속). 상속(바꾸지 않음): 페이지 오류 「다시 시도」 · 전역 포커스 링 · 사이드바 활성 항목(`--nav-on-*`). 프리셋 버튼 선택 면은 accent 가 아니라 `--pill-on-*`(선택 축) · 「판정 기준」 토글은 `--fg-2` 다.

`--team` reserved for (팀 축 — accent 와 별개): ① 「매집중」 배지(`--team-bg` 면), ② 등록 세로선 · 「등록 HH:MM」 라벨 · 범례 등록 견본, ③ 순매수 누적 계단 · 오른쪽 누적 축 글자 · 「순매수 누적」 판 제목 · 범례 누적 견본, ④ 사이클 표 마지막 사이클 행 왼쪽 3px 띠. 그 밖(종목명 · KPI · 출처 칩 · 프리셋)에는 쓰지 않는다.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | 이 화면에 주 버튼은 없다 — 주 조작은 **행 펼침**(행 버튼 접근 이름 「{종목명} {코드} — 매집감지 상세」)과 차트 **프리셋 「전체 · 정규장 · 마지막 2시간」**. 빈 상태 CTA 「최신 보고서 보기」 |
| Empty state heading | 적재 이력 0 「아직 올라온 매집감지 보고서가 없어요」 · 행 없는 날짜(`?d=` 직접) 「이 날은 매집감지 데이터가 없어요」 |
| Empty state body | 적재 이력 0 「첫 보고서는 평일 밤 20:30쯤 올라와요」 · 행 없는 날짜 「매집감지 보고서는 평일 밤 20:30쯤 올라와요. 최신 보고서는 {MM/DD}예요」 + 버튼 「최신 보고서 보기」 |
| Error state | 페이지 「보고서를 불러오지 못했어요」 + 텍스트 버튼 「다시 시도」(`role="alert"` · teamflow 같은 문구) · 상세(행 펼침) 「상세를 불러오지 못했어요」 + 「다시 시도」(D-18) · 게이트(401/403 · `{access:false}`) = `DmaGate surface="매집감지 보고서"` 문구 |
| Destructive confirmation | 없음 — 이 phase 에 파괴적 동작이 없다(읽기 전용 보고서) |

시각 문구 「20:30」 은 한 상수(`ACCUM_LOAD_HM` 류)에서만 나온다 — 빈 상태 2곳 · 머리 출처 칩 · 상세 출처 칩이 같은 값을 쓴다. D-24 ① 의 10분 미루기가 실행되면 이 상수 하나만 「20:40」 으로 바꾼다.

### A1. 페이지 셸

| 요소 | 문구 |
|---|---|
| 페이지 제목(h1) | 「매집감지 보고서」(목업 A 머리 · 사이드바 라벨과 같다) |
| 문서 제목 | 날짜 모름 「매집감지 보고서」 · 날짜 앎 「매집감지 보고서 · {MM/DD}」(`fmtYmdShort`) |
| 머리 설명(`description`) | 출처 칩 「KYOBO119 판정 기준 · 20:30 적재」 + 글자 「 장중에는 트레이딩 「매집」 패널이 실시간으로 보여줘요」(인박스 D-04 — 보고서는 밤 적재 뒤부터) |
| 날짜 알약 | `LimitupDateNav` 그대로 — 「‹ 10/19 (월) ›」 · 날짜 모름 「—」 · aria 「이전 보고서」 / 「다음 보고서」 |
| 로딩 | 「불러오는 중…」(12/400 `--faint` · 목록은 스켈레톤 없음 — teamflow 상속) |
| 게이트 — 미매핑 | 「매집감지 보고서는 증권사 계정이 연결된 사용자만 이용할 수 있어요. 관리자에게 연결을 요청하세요.」(`DmaGate` 템플릿) |
| 게이트 — 미인증 | 「매집감지 보고서는 로그인한 뒤 이용할 수 있어요.」(`DmaGate` 템플릿) |

### A2. KPI 4칸

| 칸(왼쪽부터) | 라벨 | 값 | 보조 글자(값 옆 · 12/400 `--muted-fg`) |
|---|---|---|---|
| 1 | 「등록 종목」 | 행 수 | 「이월 {carry_days > 0 행 수}」 |
| 2 | 「장 마감 보유」 | `state ∈ {1, 2}` 행 수 | 「매집중 {a} · 매도중 {b}」 |
| 3 | 「종료」 | `state = 3` 행 수 | 「청산 {end_reason 1} · 탈락 {2} · 만료 {3}」 |
| 4 | 「팀 순매수 합(등록 후)」 | **전 행** `pos_net_krw` 합(종료 행 포함 · null 제외) · 부호 + 억 1자리 · 부호 색 | 없음 |

보조 글자는 0 이어도 항목을 지우지 않는다(「이월 0」 · 「탈락 0」 — 칸마다 자리가 같아야 날짜 간 비교가 된다). KPI 아래 캡션은 두지 않는다(D-10 — pos/day 차이는 상세 판정 기준만).

### A3. 매집감지 종목 목록

| 요소 | 문구 |
|---|---|
| 카드 소제목(h2) | 「매집감지 종목」 |
| 소제목 캡션 | 「매집중 → 매도중 → 종료 · 그 안 팀 순매수(등록 후) 큰 순」 |
| 데스크톱 열 머리(xl · `aria-hidden`) | 「종목」 · 「상태」 · 「결과」 · 「팀 순매수」+아랫줄「(등록 후)」 · 「하루 순매수」+아랫줄「(등록 전 포함)」 · 「등록 · 종료」 · (빈 칸) — D-10 의 「하루 순매수(등록 전 포함)」 를 두 줄로 놓는다(괄호 줄 12/400 `--muted-fg`) |
| 종목 칸 | 1줄 종목명(`name` · null 이면 `short_code`) · 2줄 「{short_code} · {KOSPI\|KOSDAQ}」(`market` null 이면 코드만) |
| 상태 배지 | `state` 1 「매집중」 · 2 「매도중」 · 3 「종료」 → + `carry_days > 0` 「이월 D+{carry_days}」 → + `cycle > 1` 「사이클 {cycle}」 (이 순서) |
| 사유 줄(종료 행만 · 배지 아래) | `end_reason` 1 「청산 · HH:MM」 · 2 「이월 탈락(복원 안 됨) · HH:MM」 · 3 「이월 만료 · HH:MM」(시각 = `end_time_ms` KST · null 이면 「 · HH:MM」 생략). 사유 2 줄 `title` 「06:00 이월 판정에서 탈락했거나 서버 재기동 때 복원되지 않은 종목이에요」 |
| 결과 태그 | `last_px >= upper`(둘 다 있을 때) → 「상한가 {last_rate}」(예 「상한가 +29.9%」 · 시각 없음 — D-12) · 아니면 「{last_rate}」(「+22.6%」 / 「−3.1%」) · `last_rate` null → 「—」 |
| 결과 보조줄(xl · 상한가 아닐 때만) | 「고가 {high_rate}」(예 「고가 +29.1%」 · null 이면 줄 없음) |
| 팀 순매수 칸(xl) | 1줄 `pos_net_krw` 부호 + 억 1자리 · 2줄 「평단 {pos_avg_px} · 등록가 {pos_reg_px}」(원 정수 쉼표 · null 「—」) |
| 하루 순매수 칸(xl) | `day_net_krw` 부호 + 억 1자리 · 0 = 「0.0억」 `--fg-2` · 보조줄 없음(D-10) |
| 등록 · 종료 칸(xl) | 1줄: 오늘 등록(`since_date == date`) 「HH:MM」(`reg_time_ms` · null 「—」) / 이월 「MM/DD 등록」(`since_date`) · 2줄: `end_reason` 1 「HH:MM 청산」 · 2 「HH:MM 탈락」 · 3 「HH:MM 만료」 · 0 이고 이월 「오늘 이월」 · 0 이고 오늘 등록 「장 마감까지」 |
| 폰 메타 줄(< xl · 3줄) | 「팀 순매수 {pos}」 · 「하루 {day}」 · 「등록 HH:MM」 또는 「{MM/DD} 등록」 + 종료가 있으면 「 → HH:MM」 — 라벨 `--muted-fg` + 값 |
| 행 버튼 접근 이름 | 「{종목명} {코드} — 매집감지 상세」 |
| 행 sr 설명(`aria-describedby`) | 「{상태}{, 이월 D+n}{, 사이클 n}{, {사유} HH:MM}, 결과 {태그 글자}{, 고가 +NN.N%}, 팀 순매수 등록 후 {pos}, 하루 순매수 {day}, 등록 {HH:MM \| MM/DD}{, 종료 HH:MM}」 |

`since_date` 가 8자리 숫자가 아니면(빈 문자열 · `"None"` — 소급 결측 · 리서치 Pitfall 17) 이월 판정에서 「오늘 등록 아님 · 이월 아님」 으로 두고 등록 칸 1줄을 「—」 로 쓴다(배지는 `carry_days` 만 본다).

### A4. 상세 셸

| 요소 | 문구 |
|---|---|
| 로딩(sr 전용) | 「상세 불러오는 중…」(`role="status"` `aria-live="polite"` · 화면에는 스켈레톤) |
| 실패 | 「상세를 불러오지 못했어요」(14/600 `--fg`) + 「다시 시도」(12/600 `--accent-fg`) · `role="alert"` |
| 행 없음(200 · `row: null` — 보고서가 그사이 다시 적재됨) | 「이 종목 상세를 찾지 못했어요」 + 「보고서가 다시 올라왔을 수 있어요. 페이지를 새로고침해 주세요」(12/400 `--muted-fg`) |
| 상세 401/403 | 상세 자리에 `DmaGate surface="매집감지 보고서"`(페이지 게이트와 같은 문구) |

### A5. 상세 KPI 줄 · 범례 · 프리셋

| 요소 | 문구 |
|---|---|
| KPI 줄(4항목 · 마지막 사이클 = 평평한 열 · D-19) | 「등록가 {pos_reg_px}」 · 「평단 {pos_avg_px}」 · 「등록 후 순매수 {pos_net_krw ±억 1자리}」(부호 색) · 「최고 순매수 {pos_peak_net_krw ±억 1자리}」 — 라벨 `--muted-fg` + 값 `mono` 600. 임계는 넣지 않는다 |
| 범례(8항목 · 이 순서) | 「가격(10초)」 · 「팀 매수」 · 「팀 매도」 · 「팀매수 시작」 · 「순매수 누적」 · 「등록」 · 「청산·종료」 · 「등록 전」 |
| 프리셋 버튼 | 「전체」(09:00~20:00) · 「정규장」(09:00~15:30) · 「마지막 2시간」(마지막 체결 끝 2시간) |
| 창 범위(프리셋 줄 오른쪽) | 「HH:MM ~ HH:MM」(현재 창 · `mono`) |
| 차트 캡션(차트 아래) | 「원 = 1천만원 이상 팀 주문 + 사이클마다 첫 팀 매수(크기 = 금액) · 15:30~16:00 은 체결 없음(정상) · 휠·두 손가락 = 확대/축소 · 끌기 = 이동」 — 팀 체결 없음(`day_cum_net` 빔)이면 앞에 「팀 체결 없음 · 」 을 붙인다 |

### A6. 3패널 차트

| 요소 | 문구 |
|---|---|
| 차트 접근 이름(SVG `role="img"`) | 「{종목명} 매집 상세 차트 — {HH:MM}~{HH:MM} · 사이클 {n}개 · 팀 주문 {orders 수}건 · 하루 순매수 {day}」 |
| 키보드 영역 접근 이름 | 「{종목명} 차트 보기 창 — 왼쪽·오른쪽 화살표 이동, +·− 확대/축소, 0 전체」 |
| 판 제목(SVG) | 누적 판 「순매수 누적」(`--team` 600) · 10분 판 「10분 팀 매수 / 매도」(`--fg-2` 600) · 가격 판은 제목 없음(범례가 말한다) |
| 시각 눈금 | 정시 「9」 「10」 … 「20」 · 그 밖 「HH:MM」(목업 C `ticks` 그대로) |
| 등록선 라벨 | 「등록 HH:MM」 · 사이클 2개 이상이면 「등록 HH:MM · {k}」(k = `cycles[]` 나온 순서 1-based — 사이클 표 # 와 같은 번호) |
| 종료선 라벨 | 「청산 HH:MM」 · 「이월 탈락(복원 안 됨) HH:MM」 · 「이월 만료 HH:MM」 — 06:00 종료는 원래 시각 「이월 탈락(복원 안 됨) 06:00」(선만 09:00 에 붙는다) |
| 이월 줄(좌상단) | 「이월 D+{carry_days} · {MM/DD} {HH:MM} 등록」 — `reg_time_ms` null 이면 「이월 D+n · {MM/DD} 등록」 |
| 주문 원 툴팁(`<title>`) | 「HH:MM:SS 팀 매수 {qty}주 · {X.XX억} @{px} · {pieces}조각」 + `first` 면 「 · 팀매수 시작」 (매도는 「팀 매도」) |
| 10분 칸 툴팁(`<title>`) | 「HH:MM~HH:MM 팀 매수 {X.XX억} · 팀 매도 {X.XX억}」 |
| 세로선 툴팁(`<title>`) | 등록 「사이클 {k} 등록 HH:MM:SS」 · 종료 「사이클 {k} {사유} HH:MM:SS」 |
| 빈 판 글자(판 가운데) | 누적 판 · 10분 판 「팀 체결 없음」(11/400 `--faint` — 해당 배열이 빌 때) |
| 가격 없음(`price.idx` 빔) | 차트 · 범례 · 프리셋 · 캡션 자리에 한 줄 「그날 체결 자료 없음」(12/400 `--faint` · D-18) |

### A7. 사이클 표(`cycles.length >= 2` 일 때만)

| 요소 | 문구 |
|---|---|
| 소제목 · 캡션 | 「사이클」 · 「{n}개 · 값은 각 사이클 종료 시점(살아 있으면 마지막)」 |
| 열 머리(9) | 「#」 · 「등록」 · 「종료」 · 「상태」 · 「등록가」 · 「평단」 · 「순매수」 · 「최고 순매수」 · 「매수 / 매도 수량」 |
| 칸 | # = 나온 순서 1-based · 등록 「HH:MM:SS」(사이클 `since_date ≠ date` 면 「MM/DD HH:MM:SS」 · null 「—」) · 종료 「HH:MM:SS」 또는 「장 마감까지」(`--muted-fg`) · 상태 = `end_reason > 0` 이면 사유(청산/이월 탈락(복원 안 됨)/이월 만료) 아니면 상태(매집중/매도중) · 등록가 · 평단 = 원 쉼표 · 순매수 · 최고 순매수 = ±억 1자리(순매수만 부호 색) · 수량 「{pos_buy_qty} / {pos_sell_qty}」 |

### A8. 팀 당일 손익 줄

| 요소 | 문구 |
|---|---|
| 소제목 + 합계 | 「팀 당일 손익」 + `fmtPnl` 「+0.30억(+1.1%)」(억 2자리 · 수익률 1자리 · 부호 색) |
| 항목(D-21 · 이 순서) | 「실현 {realized_val ±억 2자리}」 · 「평가 {unrealized_val ±억 2자리}」 · 「보유 {end_qty}주」 · 「출처 모를 매도 {unknown_sell_qty}주」 |
| 캡션 | 「그날 하루 팀 주문 기준(등록 전 · 상한가 가격 포함) · 출처 모를 매도(전날 이전 보유분 추정)는 손익 제외」 |
| `pnl` null | 소제목 「팀 당일 손익」 + 「팀 체결 없음」(12/400 `--faint`) — 항목 · 캡션 없음 |

### A9. 판정 기준 · 출처 칩

| 요소 | 문구 |
|---|---|
| 토글 | 「판정 기준」(기본 접힘 · D-22) |
| 본문 1(이 종목 임계) | 「이 종목의 등록 임계 — 순매수 {th_net_krw 억 1자리} 이상 · 한 가격 {th_same}조각 이상 · 시총 {th_mcap_krw 억 정수 쉼표}억 이하 (현재 시총 {mcap_krw 억 정수 쉼표}억)」 — `th_mcap_krw` 0 이면 「시총 상한 없음」 · 값 null 은 그 항목 「—」 |
| 본문 2(pos) | 「등록 후 순매수(pos)는 KYOBO119 서버 상태기 값이에요 — 등록 이후 누적, 우리 서버 체결 제외, 마지막 사이클 기준. 목록 · KPI · 사이클 표가 이 값이에요.」 |
| 본문 3(day · 차트) | 「하루 순매수(day) · 차트는 119 pcap 으로 다시 계산한 하루 전체예요 — 등록 전 구간 · 우리 체결 · 상한가 가격 체결 포함(KRX 연속매매 09:00~20:00). 그래서 두 값은 부호까지 다를 수 있고, 팀 매집 보고서의 하루 합계(상한가 가격 제외)와도 달라요.」 |
| 본문 4(원 · 계단) | 「원은 1천만원 이상 팀 주문 + 사이클마다 첫 팀 매수(금액 무관 · 「팀매수 시작」)예요. 누적 계단은 전체 팀 주문이에요.」 |
| 본문 5(종료 사유) | 「종료 사유 — 청산 / 이월 탈락(복원 안 됨 · 06:00 이월 판정과 서버 기동 정합 포함) / 이월 만료.」 |
| 출처 줄 | 「규칙 원문: gh-trade 매집감지(accum-signal) · 팀 매집 분석 §13」(링크 없음) |
| 출처 칩(상세 맨 끝) | 「KYOBO119 판정 기준 · {MM/DD} 20:30 적재」 |

본문 순서(1 → 5 → 출처 줄)는 D-22 로 고정이다. 문장은 위 문구로 고정한다(목업 `ruleBlock` 원문을 해요체로 다듬은 것).

### A10. 사이드바

| 요소 | 문구 |
|---|---|
| 하위 항목 | 「매집감지 보고서」(`href="/analytics/accum"` · `item="accum"`) — 「분석」 아래 「팀 매집 보고서」 **다음** · 「AI 애널리스트」 앞 |

### 표시 변환 규칙 (A11 · `lib/accum-report.ts` · `lib/accum-chart.ts`)

| 함수(이름 예시) | 규칙 | 예 |
|---|---|---|
| `sortRows(rows)` | `state` 1 → 2 → 3 · 그 안 `pos_net_krw` 내림차순(null 맨 뒤) · 같으면 `isin` 오름차순. 라이브 `sortAccum` 을 import 하지 않는다 | — |
| `kpisOf(rows)` | A2 표 그대로 · 합은 null 제외 | — |
| `stateLabelOf(state)` | 1 「매집중」 · 2 「매도중」 · 3 「종료」 | — |
| `endReasonLabelOf(r)` | 1 「청산」 · 2 「이월 탈락(복원 안 됨)」 · 3 「이월 만료」 · 0 없음 | — |
| `reasonLineOf(row)` | 종료 행만 「{사유} · HH:MM」 | 「이월 만료 · 06:00」 |
| `isDimRow(row)` | `state === 3 && end_reason ∈ {2, 3}` | 장중 청산 = false |
| `tagOf(row)` | `upper` · `last_px` 둘 다 수이고 `last_px >= upper` → `limit` 「상한가 +NN.N%」 · 아니면 `rate` 「+NN.N%」 · `last_rate` null → 「—」 | — |
| `isCarry(row)` | `since_date` 가 `^\d{8}$` 이고 `since_date < date` | — |
| `regCellOf(row)` | A3 「등록 · 종료 칸」 1줄 · 2줄 | 「10/16 등록」 / 「06:00 탈락」 |
| 날짜 「MM/DD」 | `fmtYmdShort` 재사용(앞 0 유지) — 목록 · 차트 이월 줄 · 사이클 표 · 출처 칩 · 빈 상태 모두 같은 형식(목업 `md` 의 앞 0 없는 「10/9」 는 옮기지 않는다 — 날짜 알약 · 문서 제목과 맞춤) | 「10/09 등록」 |
| `fmtPx(n)` | `ko-KR` 정수 쉼표 · null/0 이하 「—」 | 「205,500」 |
| `thresholdLineOf(row)` | A9 본문 1 | — |
| `orderRadiusOf(val)` | `max(2.2, min(7, 2.2 + √(val ÷ 1e7) × 0.5))`(D-15) | 1천만 ≈ 2.7 · 1억 ≈ 3.8 · 10억 → 7 |
| `dayBoundsOf(t0)` | `T0 = price.t0_ms` · `T1530 = T0 + 6.5h` · `T1600 = T0 + 7h` · `T2000 = T0 + 11h` | — |
| `clampView(v)` | 폭 `max(10분, min(11h, v 폭))` · 시작 `[T0, T2000 − 폭]` 안 | — |
| `zoomAt(v, tc, k)` | 커서 시각 `tc` 기준 `{t0: tc − (tc − v.t0)·k, t1: tc + (v.t1 − tc)·k}` → `clampView` | — |
| `presetOf(name)` | 전체 `[T0, T2000]` · 정규장 `[T0, T1530]` · 마지막 2시간 `[max(T0, 끝 − 2h), 끝]`(끝 = 마지막 `price` 칸 시각) → `clampView` | — |
| `ticksOf(view, plotW)` | 창 폭 ≤ 30분 5분 · ≤ 2.5h 15분 · ≤ 5h 30분 · 그 밖 1h(목업) → 눈금 간격이 28px 미만이면 한 단계 큰 간격(1h → 2h) · 라벨 정시 「9」 · 그 밖 「HH:MM」 | 폰 전체 창 → 2시간 간격 |
| `priceRangeOf(view)` | 보이는 창 안 가격 ∪ 보이는 주문 `px` 의 min/max · 여유 8% · 보이는 점 0 이면 하루 전체 | — |
| `pricePathOf(view)` | 창 ±30분 밖 점은 이진 탐색으로 자름 · 이웃 점 간격 > 15분이면 `M` 으로 끊음(15:30~16:00 빈 띠를 잇지 않는다) | — |
| `cumPathOf()` | y 범위 = 하루 전체 min/max(0 포함 · 고정) · `M x0,y(0) L x0,y0` → `H x V y` 계단 · 끝 `H x(T2000)` | — |
| `bucketBarsOf(view)` | `slot` 0~65 → `x(T0 + slot × 10분)` · 칸 폭 = 현재 창 기준 · y = 하루 전체 max 고정 | — |
| `cycleMarksOf(row)` | `cycles[]` 나온 순서대로 k = 1… · 등록선 = 오늘 등록 사이클이고 `reg_time_ms` 있을 때만 · x = `max(reg, T0)` · 종료선 = `end_time_ms` 있을 때 · x = `max(end, T0)` | CR-01 — `cycle` 값 중복 가능 |
| `shadeOf(row)` | 오늘 등록(`since_date === date`)이고 첫 사이클 `reg_time_ms` 있을 때만 `[T0, max(T0, firstReg)]` | 이월 = 없음 |
| `labelRowsOf(labels, plotW)` | 라벨 폭 추정(11px 글자 · 한글 11px · 숫자/기호 6.5px) → 같은 줄 앞 라벨과 4px 안으로 겹치면 다음 줄(최대 3줄 · 넘치면 라벨 생략 · 선과 `<title>` 은 남김) · 오른쪽 끝을 넘는 등록 라벨은 선 왼쪽으로 · 왼쪽 끝 종료 라벨은 선 오른쪽으로 · 이월 줄은 1줄 왼쪽 자리를 먼저 차지 | — |

---

## 표면별 시각 · 상호작용 계약

### A1. 페이지 셸

- `/analytics/accum?d=YYYYMMDD` — `teamflow-report.tsx` 와 같은 상태기계(`loading` · `error` · `gate` · `ready`) · 같은 URL 규칙: `?d` 없음 = 최신(서버가 정함 · URL 을 쓰지 않는다) · 형식 오류 = `router.replace("/analytics/accum")` · 날짜 이동 = `router.push`.
- 머리(제목 + 설명 + 날짜 알약)는 로딩 · 오류 중에도 그린다. 알약 ‹ › 는 마지막으로 받은 `dates[]`(accum_flow 행 있는 날짜만 — D-07)로 판정 → 주말 · 휴장일 · 0행 날짜를 건너뛴다.
- 출처 칩: `inline-flex items-center rounded-[var(--r-sm)] bg-[var(--muted)] px-2 py-0.5 text-[length:var(--t-caption)] text-[var(--muted-fg)]` · `data-slot="accum-source"` · 설명 `<p>` 안 맨 앞 · 칩 뒤 4px 띄우고 설명 글자 · `break-keep`.
- 세로 순서: 머리 → KPI 4칸 → 매집감지 종목 카드. 상한가 보고서의 창구 지문표 · 어제 결과 표 · teamflow 의 KPI 캡션은 없다.
- 빈 상태 판정: `dates.length === 0` → 「아직 올라온 …」 / `dates.length > 0 ∧ rows.length === 0` → 「이 날은 …」 + 「최신 보고서 보기」(→ `dates[0]`). 빈 상자 = `CARD` · `py-12` · 가운데 정렬(`data-slot="accum-empty"`). 빈 날은 KPI · 목록 카드를 그리지 않는다.
- 시선 앵커 = KPI 4칸(유일한 20px 값).

### A2. KPI 4칸

- `dl` · 폰(< md) 2열 2줄 · md 이상 4열 · 칸 = `--card` · `--r-md` · `p-3` · 라벨 위 · 값 아래(`flex-col-reverse` — 상속).
- `dd` = `flex flex-wrap items-baseline gap-x-2` — 값(20/600 `mono`) + 보조 글자(12/400 `--muted-fg` `mono` 숫자). 좁은 폰 칸에서 보조 글자는 값 아래 줄로 내려간다(잘리지 않는다 · `truncate` 를 `dd` 전체에 걸지 않는다).
- 4번째 칸 값만 부호 색(`toneOf`). 1~3 칸 값은 `--fg`. 행이 있을 때만 띠를 그린다.

### A3. 매집감지 종목 목록

- 카드 `section`(`CARD` · `p-4` · `aria-labelledby` 소제목) → 소제목 줄(`flex flex-wrap items-baseline gap-x-2`) → (xl) 열 머리(`items-end` · 2줄 머리) → `ol` 행 목록. 행 구분 `ROW_DIVIDER`. 행 수 제한 없음(페이지 스크롤 · 페이지네이션 없음).
- **아코디언(D-08):** 한 번에 하나 · **기본 전부 접힘** · 같은 행 다시 누름 = 접힘 · 다른 행 = 그 행만 · 날짜가 바뀌면 부모가 `key=date` 로 새로 만든다. 새로 연 행이 앱 머리 위로 밀리면 `scrollIntoView({block:'start'})`(reduced-motion = 즉시) — `pendingScroll` 규칙. 포커스는 행 버튼에 남는다.
- 행 버튼: `button` · `id = accum-row-{isin}` · `data-isin` · `aria-expanded` · 열렸을 때만 `aria-controls="ac-{isin}"` · `aria-label` · `aria-describedby="accum-row-desc-{isin}"`. 면: hover · 열림 = `color-mix(in oklab, var(--muted) 60%, transparent)` · `rounded-[var(--r)]`.
- **흐린 행(D-11):** `isDimRow` 면 행 버튼에 `opacity-60` · `data-dim="true"`. hover · `focus-visible` · 열림이면 `opacity-100`(읽으려는 순간 대비를 되돌린다) · 전환 150ms · `motion-reduce:transition-none`. 상세(열린 영역)는 흐리지 않는다. 장중 청산(`end_reason` 1)은 정상 농도.
- **배치(같은 DOM · CSS 전환):**
  - `< xl` 카드형 3줄: 1줄 [종목(이름 + 코드 · 시장)] … [결과 태그] [셰브론] / 2줄 [배지 묶음 `flex-wrap gap-1`] + 종료 행이면 바로 아래 사유 줄(12/400 `--muted-fg`) / 3줄 메타 `flex flex-wrap gap-x-3 gap-y-0.5`(팀 순매수 · 하루 · 등록→종료). 결과 보조줄 · 평단/등록가 줄 숨김. 셰브론은 폰에서도 보인다(quick-261010-h22 규칙).
  - `xl` 7열: 종목 · 상태(배지 묶음 + 사유 줄 — 사유 줄은 `whitespace-nowrap`) · 결과(태그 + 보조줄) · 팀 순매수(14/600 `mono` 부호 색 + 아랫줄 12/400 `--muted-fg` `truncate` + `title`) · 하루 순매수(14/600 `mono` 부호 색) · 등록·종료(1줄 14/400 `--fg-2` `mono` · 이월 「MM/DD 등록」 은 `--muted-fg` / 2줄 12/400 `--muted-fg`) · 셰브론. 메타 묶음은 xl 에서 `contents` 로 풀리고 라벨은 `xl:sr-only`.
- 상태 배지: `inline-flex h-5 items-center rounded-[4px] border border-transparent px-1.5 text-[11px] font-semibold whitespace-nowrap` + 색(Color 표) · `data-slot="accum-state"` / `"accum-carry"` / `"accum-cycle"`.
- 결과 태그: `inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold whitespace-nowrap` · 상한가 = `bg-[var(--up-bg)] text-[var(--up)]` · 미도달 = `bg-[var(--muted)] text-[var(--fg-2)]` · 수는 `mono` · `data-kind="limit|rate"`.
- 셰브론: `ChevronDown` 16px `--muted-fg` · 열림 `rotate-180` · 200ms · `motion-reduce:transition-none`.
- 열린 행 바로 아래에 상세(A4~A9)를 **열렸을 때만 마운트**한다(접으면 언마운트 → 차트 창 · 판정 기준 토글 초기화 · 받은 데이터는 캐시에 남는다).

### A4. 상세 셸 — 지연 로드 · 캐시

- 상세 루트 `section` · `id="ac-{isin}"` · `aria-labelledby={행 버튼 id}` · `data-slot="accum-detail"` · `flex flex-col gap-4 px-2 pt-1 pb-6`.
- 마운트 때 `fetchAccumDetail(date, isin)` — 캐시 키 `accum-detail:{date}:{isin}` 가 있으면 **요청 없이 즉시** 그린다(재펼침 재요청 0 · D-06). 같은 키 진행 중 요청은 하나로 합친다. 실패는 캐시하지 않는다(「다시 시도」 = 재요청). 타임아웃 15초.
- **로딩 = 스켈레톤(D-18):** 실제 배치와 같은 높이로 자리를 잡아 데이터가 와도 아래가 튀지 않는다 — KPI 줄 자리 `Skeleton h-4 w-2/3` → 8px → 범례 자리 `h-3 w-1/2` → 8px → 프리셋 줄 자리 `h-8 w-56` → 8px → 차트 자리 `h-[472px] w-full rounded-[var(--r)]`. 사이클 표 · 손익 · 판정 기준 자리는 그리지 않는다. sr 전용 「상세 불러오는 중…」.
- **실패:** 상세 자리에 가운데 정렬 상자(`py-8` · 면 없음) — 제목 14/600 + 「다시 시도」 텍스트 버튼(최소 높이 32) · `role="alert"`. 행은 열린 채로 남는다.
- `row: null` → A4 Copywriting 「이 종목 상세를 찾지 못했어요」 상자(재시도 버튼 없음).
- 401/403 → 상세 자리에 `DmaGate`(페이지 전체를 바꾸지 않는다 — 열린 행 하나의 일).

### A5. 상세 KPI 줄 · 범례 · 프리셋 줄

- 차트 블록 = `flex flex-col gap-2`: KPI 줄 → 범례 → 프리셋 줄 → 차트 → 캡션.
- KPI 줄: `flex flex-wrap gap-x-3 gap-y-1 text-[length:var(--t-caption)]` · 항목 = 라벨 `--muted-fg` + 4px + 값 `mono` 600(`--fg` · 등록 후 순매수만 부호 색) · `data-slot="accum-kline"`.
- 범례: `flex flex-wrap gap-x-3 gap-y-1` 12/400 `--muted-fg` · 견본은 `<span aria-hidden>`(teamflow 「상세 안 `<i>` 0개」 규칙): 가격 10×2 `--fg-2` · 팀 매수 10px 원 `--up` .7 · 팀 매도 10px 원 `--down` .7 · 팀매수 시작 10px 원 `--up` + 2px `--fg` 테두리 · 순매수 누적 10×2 `--team` · 등록 2×10 `--team` · 청산·종료 2×10 점선 `--muted-fg`(`border-l-2 border-dashed`) · 등록 전 10px 정사각 `--accum-shade` + 1px `--border-subtle`.
- 프리셋 줄: `flex flex-wrap items-center gap-2` · 버튼 3개 `button type="button"` · `aria-pressed` · `min-h-8 rounded-full px-3 text-[length:var(--t-caption)] font-semibold` · 꺼짐 `bg-[var(--muted)] text-[var(--fg-2)]` · 켜짐 `bg-[var(--pill-on-bg)] text-[var(--pill-on-fg)]` · hover 꺼짐 `bg-[var(--raised-2)]`. 기본 켜짐 = 「전체」. 휠 · 끌기 · 키보드로 창을 바꾸면 **셋 다 꺼짐**(목업 `vp = null`) — 창이 우연히 프리셋과 같아져도 켜지 않는다. 창 범위 「HH:MM ~ HH:MM」 은 `ml-auto` 12/400 `--muted-fg` `mono` · `aria-live` 없음(끌기 중 낭독 폭주 방지 — 값은 SVG 접근 이름에 있다).
- 「마지막 2시간」 은 `price.idx` 가 비면 `disabled`(그 경우 차트 자체가 없다 — A6).

### A6. 3패널 차트 + 확대/축소 · 이동

**배치 · 크기**
- 래퍼 `div`(측정 대상 · `useChartWidth`) → SVG `viewBox="0 0 {W} 472"` · `width="100%"` · `height="472"` — **측정 폭과 1:1**(글자 11px 고정 · 33 Pitfall 8). 폰 390 에서 W ≈ 310(본문 358 − 카드 패딩 32 − 상세 패딩 16).
- 판 좌표: 그림 영역 x = `[52, W − 56]` · 가격 판 y = 16~216 · 누적 판 y = 240~352 · 10분 판 y = 376~448 · 시각 눈금 기준선 y = 465. 데이터 레이어는 그림 영역 `clipPath` 안, 축 글자는 밖.
- `data-slot="accum-chart"` · SVG `role="img"` + A6 접근 이름.

**레이어(아래 → 위)**
1. 등록 전 음영 `--accum-shade`(세 판 전체 높이 16~448 · `shadeOf` 가 있을 때만) · 15:30~16:00 빈 띠 `--accum-gap`(같은 높이 · 항상).
2. 시각 격자 세로선 `--border-subtle` 1px(16~448) · 가격 판 아래선 · 10분 판 아래선 `--border-subtle`.
3. 누적 판 0선 `--faint` 1px `2 3` 점선 · 누적 계단 `--team` 1.5 · `stroke-linejoin round`.
4. 10분 막대 쌍 — 칸마다 `<g>`(칸 전체 높이 투명 히트 rect + `<title>`) · 매수 `--up` .7 왼쪽 · 매도 `--down` .7 오른쪽 · 바닥 = 판 아래선 · 0 은 그리지 않는다.
5. 가격 선 `--fg-2` 1.25 · 15분 넘는 공백에서 끊는다.
6. 세로선 — 사이클 순서대로 등록선 `--team` 1.5 실선 · 종료선 `--muted-fg` 1.25 `4 3` 점선(16~448) · 각 선에 폭 8px 투명 히트 rect + `<title>`.
7. 주문 원 — `(t_ms, px)` · 반지름 `orderRadiusOf(val)` · 매수 `--up` / 매도 `--down` · 채움 .55 · 테두리 같은 색 .9 · .75 · **큰 원부터 그려 작은 원이 위**에 오고 `first = 1` 원은 맨 마지막(항상 위 · 테두리 `--fg` 1.5 · 채움 .9) · 원마다 `<title>`.
8. 축 글자(클립 밖): 가격 축 왼쪽 5개(창 min~max 4등분 · 원 정수 쉼표 · 오른쪽 정렬 x = 46) · 누적 축 오른쪽 `cMin` · 0 · `cMax`(중복 제거 · ±억 1자리 · `--team`) · 10분 축 오른쪽 위 하루 최대 막대값(억 1자리 · `--muted-fg`) · 판 제목 2개 · 시각 눈금(x 가운데 · y 465) · 세로선 라벨(A11 `labelRowsOf` · 첫 줄 y = 27 · 다음 줄 +14) · 이월 줄(좌상단 x = 56 · y = 27 · `--accum-carry` 600).

**축 규칙(D-14)**
- 가격 y = **보이는 창 안의 가격 ∪ 보이는 주문 px**(원이 판 밖으로 잘리지 않게) · 창이 바뀔 때마다 다시 맞춘다.
- 누적 y · 10분 y = **하루 전체 범위 고정**(0선 · 막대 기준이 창 이동에 흔들리지 않는다).
- 09:00 이전 등록 · 06:00 종료는 x = `T0`(왼쪽 끝)에 붙이고 라벨은 원래 시각(D-16 · 리서치 Pitfall 13). 기준 시각은 하드코딩 없이 `price.t0_ms`.

**상호작용(훅 `use-chart-view` · D-14)**
- 기본 창 = 「전체」 09:00~20:00(폰 · 데스크톱 같다). 최소 창 10분 · 창은 09:00~20:00 안으로 clamp.
- **휠/트랙패드:** SVG 에 네이티브 `wheel` 리스너 `{ passive: false }`(React `onWheel` 은 `preventDefault` 가 안 먹는다 — 리서치 Pitfall 11). `deltaY` = 커서 시각 기준 확대/축소(`k = exp(deltaY × 0.0015)`) · `|deltaX| > |deltaY|` 면 좌우 이동 · `ctrlKey` 휠(맥 트랙패드 핀치)도 같은 확대 경로. **창이 바뀌지 않는 휠(전체 창에서 더 축소 · 10분 창에서 더 확대 · 끝에서 더 이동)은 `preventDefault` 하지 않고 페이지 스크롤로 넘긴다** — 472px 차트 위에서 페이지 스크롤이 갇히지 않게.
- **끌기:** Pointer Events + `setPointerCapture` · 포인터 1개 = 좌우 이동(이동량 = 픽셀 ÷ 그림 폭 × 창 폭) · 2개 = 두 점 거리 비로 중점 기준 확대(폰 핀치). `pointerup` · `pointercancel` 에서 끌기 상태를 푼다.
- SVG 스타일: `touch-action: pan-y`(폰 세로 스크롤은 브라우저 몫 · 가로 끌기 · 핀치만 차트 — 목업의 `touch-action: none` 은 옮기지 않는다 · 리서치 Pitfall 12) · `user-select: none` · 커서 `grab` / 끌기 중 `grabbing`.
- **키보드(접근성 — 목업 밖 보강):** 차트 래퍼 `div role="group" tabIndex={0}` + A6 키보드 접근 이름 · `←` / `→` = 창 폭 20% 이동 · `+` / `=` = 가운데 기준 ×0.5 확대 · `−` / `_` = ×2 축소 · `0` = 「전체」 프리셋. 처리한 키만 `preventDefault`. 포커스 링은 전역 `*:focus-visible` 상속.
- 휠 · 포인터 · 키 이벤트는 rAF 로 합쳐 **프레임당 `setView` 1회** · 프리셋 전환은 애니메이션 없이 즉시(전환 애니메이션 자체가 없어 `prefers-reduced-motion` 은 자연히 지켜진다).
- 창 밖 점은 이진 탐색으로 잘라 그린다(한선엔지니어링급 price 3,648 · orders 501 · day_cum_net 6,513 에서 끊김 없음 목표 — 리서치 A1 은 E2E 휠 스모크 + 라이브 UAT 로 확인).

**경계 사례(D-16 · D-18)**
- 이월 종목(`isCarry`): 등록선 · 음영 없음 · 좌상단 이월 줄. 종료선은 있으면 그린다.
- 06:00 종료 행만 있는 종목(`end_time_ms < T0`): 종료선을 09:00 왼쪽 끝에 붙이고 라벨 「이월 탈락(복원 안 됨) 06:00」/「이월 만료 06:00」(라벨은 선 오른쪽으로) · `first` 0건이 정상.
- 사이클 2개 이상: 등록 라벨에 「 · k」 · `cycles[]` 번호 연속 · 고유를 가정하지 않는다(CR-01).
- 팀 체결 없음(`day_cum_net` 빔 · `orders` 빔 · `pnl` null): 가격 선 + 0선 + 축 + 빈 띠만 · 누적 판 · 10분 판 가운데 「팀 체결 없음」 · 캡션 앞 「팀 체결 없음 · 」.
- `price.idx` 빔: 범례 · 프리셋 줄 · 차트 · 캡션 대신 「그날 체결 자료 없음」 한 줄(KPI 줄 · 사이클 표 · 손익 · 판정 기준 · 출처 칩은 그대로).
- 보이는 창 안 가격 점 0: 가격 y 는 하루 전체로 폴백(NaN 금지 · Pitfall 14).

### A7. 사이클 표

- `cycles.length >= 2` 일 때만 차트 블록 다음(16px)에 **기본 펼침**(접힘 토글 없음 · D-20). 1개면 표 없음.
- 소제목 줄(`flex flex-wrap items-baseline gap-x-2` · 14/600 + 캡션 12/400) → 8px → `Table`(12px · `mono` 수 · 숫자 열 오른쪽 정렬 · 머리 12/400 `--muted-fg` · `whitespace-nowrap`) · 마지막 사이클 행 첫 칸 `shadow-[inset_3px_0_0_var(--team)]` · `data-slot="accum-cycles"`. 폰은 `tbl-wrap` 가로 스크롤.

### A8. 팀 당일 손익 줄

- teamflow `teamflow-pnl` 동형: 소제목 줄(「팀 당일 손익」 14/600 + 합계 14/600 `mono` 부호 색 · 억 2자리 판정 `toneOf(v, 2)`) → 4px → 항목 줄 `flex flex-wrap gap-x-3 gap-y-0.5` 12px(라벨 `--muted-fg` + 값 `mono` · 실현 · 평가는 부호 색) → 4px → 캡션 12/400 `--muted-fg` `break-keep`. 면 상자 없음 · `data-slot="accum-pnl"`.

### A9. 판정 기준 · 출처 칩

- 「판정 기준」 토글(`TeamflowToggle` tone `muted` — 최소 높이 32 · `ChevronRight` 회전 · 기본 접힘 · 닫히면 본문 언마운트) → 본문 `ul list-disc pl-4 space-y-1` 12/400 `--muted-fg` `break-keep` · 본문 1 의 값은 `mono` `--fg-2` → 8px → 출처 줄 12/400 `--muted-fg` · `data-slot="accum-rules"`.
- 상세 맨 끝 출처 칩(A1 칩과 같은 모양) · `data-slot="accum-detail-source"`.

### A10. 사이드바

- `NAV_ACCUM = { href: "/analytics/accum", label: "매집감지 보고서" }` · `SubNavLink item="accum"` · `active = pathname.startsWith(NAV_ACCUM.href)` · 분석 하위 목록에서 `teamflow` `li` 다음.
- 레일(접힌 사이드바)은 하위 목록이 숨으므로 새 레일 아이콘 없음(기존 규칙).
- 테스트 갱신 지점(플래너): `__tests__/app-sidebar.test.tsx` 링크 순서 · 가시성 · `e2e/specs/sidebar-tree.spec.ts` `TREE_LINKS` 순서 · DMA 403 루프에 `/analytics/accum`.

---

## 접근성 계약

| 대상 | 계약 | 근거 |
|---|---|---|
| 행 버튼 | `button` · `aria-expanded` · 열림 때만 `aria-controls="ac-{isin}"` · `aria-label="{종목명} {코드} — 매집감지 상세"` · `aria-describedby` sr 설명 1문장(A3) | teamflow 같은 패턴 |
| 흐린 행 | 흐림은 장식 — 상태 · 사유는 배지 · 사유 줄 · sr 설명 글자에 있다 · hover/focus/열림 때 불투명도 1 | D-11 · 대비 |
| 상세 | `section id="ac-{isin}" aria-labelledby="accum-row-{isin}"` · 로딩 `role="status"` · 실패 `role="alert"` | teamflow 상속 + 지연 로드 |
| 데스크톱 열 머리 | `aria-hidden="true"` · 값 라벨은 `xl:sr-only` 로 남는다 | 상속 |
| 차트 | SVG `role="img"` + 요약 `aria-label` · 원 · 칸 · 세로선은 `<title>` · 정확한 수치의 글자 정본은 KPI 줄 · 사이클 표 · 손익 줄 | D-15 |
| 차트 조작 | 프리셋 버튼(`aria-pressed`) + 차트 래퍼 키보드(←/→/+/−/0) — 휠 · 끌기 · 핀치 없이도 같은 창 조작이 된다 | 목업 밖 보강 |
| 접힘 토글 | `button` · `aria-expanded` · `aria-controls` · 아이콘 `aria-hidden` | teamflow 상속 |
| 색 의존 | 금액 부호 글자 · 상태 배지 글자 · 사유 줄 글자 · 등록 실선 vs 종료 점선 · 범례 견본 + 글자 | — |
| 포커스 | 전역 `*:focus-visible` 이중 링 · 행을 열어도 포커스는 행 버튼 · 프리셋 · 토글을 눌러도 포커스 유지 | 상속 |
| 터치 | `<title>` 툴팁은 마우스 전용 — 폰은 KPI 줄 · 사이클 표 · 손익 줄 글자가 수치를 맡는다(탭 고정 툴팁은 후속 — 리서치 Open Q3 · UAT 질문) | D-15 「`<title>` 또는 동급」 |
| 움직임 | 셰브론 · 토글 아이콘 회전 · 흐림 해제 전환만 · 차트 등장 · 창 전환 애니메이션 없음 · 스켈레톤 shimmer 는 reduced-motion 에서 멈춤(컴포넌트 내장) | 상속 |

---

## 폭 백스톱

- **최악값 글자:** 종목명 15자(「케이비제XX호스팩」 류 · `truncate` + `title`) · 배지 묶음 「종료」+「이월 D+5」+「사이클 3」 · 사유 줄 「이월 탈락(복원 안 됨) · 08:41」 · 결과 태그 「상한가 +29.9%」 · 금액 「−1,234.5억」 · 아랫줄 「평단 200,407 · 등록가 205,500」 · KPI 3 보조 「청산 12 · 탈락 10 · 만료 10」 · 종료선 라벨 「이월 탈락(복원 안 됨) 06:00」.
- **폰 390(본문 ≈ 358 · 카드 안 ≈ 326 · 상세 차트 W ≈ 310):** 행 1줄 이름만 말줄임 · 태그 · 셰브론 온전 / 2줄 배지 묶음 `flex-wrap`(최대 2줄) + 사유 줄 `break-keep` / 3줄 메타 `flex-wrap`(최대 2줄) · KPI 보조 글자는 값 아래로 줄바꿈 · 차트 그림 폭 ≈ 202px(시각 눈금 2시간 간격) · 프리셋 3개 + 창 범위는 `flex-wrap`(창 범위가 다음 줄로) · 사이클 표 가로 스크롤 · **페이지 가로 스크롤 0**.
- **xl 1280(사이드바 포함 · 본문 1120 상한):** 7열 한 줄 · 상태 칸 `minmax(152px,1fr)` 안에 사유 줄 한 줄 · 팀 순매수 아랫줄 160 칸에서 잘리면 `truncate` + `title`.

---

## UI Considerations

> ui-phase Step 9.5 프로브(`ui-consideration-probe.cjs` · 2026-10-20)가 확정한 상태 커버리지. 요소 11개(A1~A11) · 적용 고려사항 **77건** · 미분류 0. kind 는 사용자 확인 후 A9(media 오탐 제거) · A11(form 오탐 제거 → static · list)을 교정해 재실행했다. 사용자 선택 = **일괄 해결**. 빈값 · 오류 **문구**는 `## Copywriting Contract` 가 정본이며 여기서는 상태 모양과 참조만 적는다(중복 금지).

Applicable state considerations resolved: 77 — explicit 64 · backstop 6 · dismissed 5 · **unresolved 2**. 프로브 밖 초안 보강 3행(A1 empty · populated · partial)은 ✅ 로 남긴다.

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| empty | A1 페이지 셸 | ✅ covered(보강) | 적재 이력 0 = 「아직 올라온 매집감지 보고서가 없어요」 상자 · 행 없는 날짜 = 「이 날은 매집감지 데이터가 없어요」 + 「최신 보고서 보기」 · KPI · 목록 카드 없음(Copywriting Empty state) |
| loading | A1 페이지 셸 | ✅ covered | 「불러오는 중…」 한 줄(12/400 `--faint`) · 머리 · 알약은 `?d` 로 즉시 · ‹ › 는 마지막 `dates[]` 유지 · 목록 스켈레톤 없음(teamflow 상속) |
| error | A1 페이지 셸 | ✅ covered | 「보고서를 불러오지 못했어요」 + 「다시 시도」(`role="alert"`) · 401/403 · `{access:false}` = `DmaGate surface="매집감지 보고서"` · 형식 오류 `?d` = 최신으로 `replace`(Copywriting Error state) |
| populated | A1 페이지 셸 | ✅ covered(보강) | 머리(출처 칩) → KPI 4칸 → 매집감지 종목 카드 · 문서 제목 「매집감지 보고서 · MM/DD」 |
| partial | A1 페이지 셸 | ✅ covered(보강) | `?d` 가 `dates[]` 밖 = 빈 상태 + 알약은 앞뒤 행 있는 날짜로(`dateNavOf`) |
| overflow | A1 페이지 셸 | 🧪 backstop | { statement: "폰 390 · 1280 에서 h1 + 날짜 알약 + 출처 칩 + 설명이 break-keep 줄바꿈 · 칩 잘림 0 · 페이지 가로 스크롤 0", verification: backstop } |
| long-text | A1 페이지 셸 | ✅ covered | 머리 글자는 전부 고정 문구(제목 7자 · 칩 「KYOBO119 판정 기준 · 20:30 적재」 · 설명 한 문장) — 가변 긴 글자 없음 · 설명 `<p>` 는 `break-keep` 줄바꿈 · 말줄임 없음 |
| empty | A2 KPI | ✅ covered | 행 0 인 날은 띠를 그리지 않는다(페이지 빈 상태가 대신) |
| loading | A2 KPI | ✅ covered | 페이지 로딩에 묶인다 — `ready` 때만 마운트 · 띠 자체 스켈레톤 없음 |
| error | A2 KPI | ✅ covered | 페이지 오류에 묶인다 — 띠 없음 |
| populated | A2 KPI | ✅ covered | 4칸 = 정수(보조 「이월 n」) · 정수(보조 「매집중 a · 매도중 b」) · 정수(보조 「청산 · 탈락 · 만료」) · 부호 억 1자리(부호 색) |
| partial | A2 KPI | ✅ covered | `pos_net_krw` null 은 합에서 빠짐 · 보조 글자 0 항목도 표시(「이월 0」) · 합 반올림 0 = 「0.0억」 `--fg-2`(`toneOf`) |
| overflow | A2 KPI | 🧪 backstop | { statement: "폰 2열 칸에서 「15」 + 「청산 12 · 탈락 10 · 만료 10」 이 잘림 없이 값 아래로 줄바꿈 · 「−1,234.5억」 칸 안", verification: backstop } |
| zero-one-many | A2 KPI | ✅ covered | 행 0 = 띠 없음 · 1행 이상 = 4칸 고정 · 단복수 문구 없음(한글) · 날짜 간 칸 자리 동일 |
| long-text | A2 KPI | ✅ covered | 값 최악 「−1,234.5억」 · 보조 최악 「청산 12 · 탈락 10 · 만료 10」 — `dd` 가 `flex-wrap items-baseline` 라 보조 글자는 값 아래 줄로 · `truncate` 를 `dd` 에 걸지 않는다 |
| empty | A3 목록 | ✅ covered | `rows.length === 0` = 카드를 그리지 않는다(페이지 빈 상태) |
| loading | A3 목록 | ✅ covered | 페이지 로딩에 묶인다 — 목록 스켈레톤 없음(teamflow 상속) |
| error | A3 목록 | ✅ covered | 페이지 오류에 묶인다 — 카드 없음 |
| populated | A3 목록 | ✅ covered | 상태 1 → 2 → 3 · 그 안 `pos_net_krw` 내림차순 · 기본 전부 접힘 · 한 번에 하나 · xl 7열 / < xl 3줄 카드 · 셰브론 폰에서도 보임 |
| partial | A3 목록 | ✅ covered | `name` null = 코드 · `market` null = 코드만 · `last_rate` null = 「—」 태그 · `high_rate` null = 보조줄 없음 · `reg_time_ms` null = 「—」 · `end_time_ms` null 종료 행 = 사유만(시각 생략) · `since_date` 결측 = 등록 칸 「—」(이월 아님) · 종료 행 = 회색 배지 + 사유 줄 · 사유 2 · 3 = 흐림 .6(hover/focus/열림 때 1) · 장중 청산 = 정상 농도 · `cycle > 1` 만 「사이클 n」 |
| overflow | A3 목록 | ✅ covered | 행 수 제한 없음 · 페이지 스크롤 · 페이지네이션 없음 · 행 펼침 시 점프 보정 `scrollIntoView` · 배지 묶음 `flex-wrap`(폰 최대 2줄) · 사유 줄 xl `whitespace-nowrap`(상태 칸 `minmax(152px,1fr)`) · 아랫줄 `truncate` + `title` |
| zero-one-many | A3 목록 | ✅ covered | 1행 = 자동 펼침 없음 · 다수 = 아코디언 하나만 · 날짜 바뀌면 `key=date` 로 전부 접힘 |
| long-text | A3 목록 | 🧪 backstop | { statement: "폰 390 · xl 1280 에서 15자 종목명 + 「상한가 +29.9%」 + 셰브론 한 줄 · 배지 3개 + 「이월 탈락(복원 안 됨) · 08:41」 겹침 0 · 「평단 200,407 · 등록가 205,500」 잘리면 truncate+title", verification: backstop } |
| empty | A4 상세 | ✅ covered | `row: null`(200) = 「이 종목 상세를 찾지 못했어요」 + 새로고침 안내 · 재시도 버튼 없음(Copywriting A4) |
| loading | A4 상세 | ✅ covered | 스켈레톤(KPI 줄 `h-4` · 범례 `h-3` · 프리셋 `h-8` · 차트 `h-[472px]`) · sr 「상세 불러오는 중…」(`role="status"`) · 도착 시 레이아웃 점프 없음 |
| error | A4 상세 | ✅ covered | 「상세를 불러오지 못했어요」 + 「다시 시도」(`role="alert"` · 재요청 · 실패는 캐시 안 함 · 15초 타임아웃) · 401/403 = 상세 자리 `DmaGate` · 행은 열린 채 |
| populated | A4 상세 | ✅ covered | 차트 블록 → (사이클 표) → 손익 줄 → 판정 기준 → 출처 칩 · 재펼침 = 캐시 `accum-detail:{date}:{isin}` 로 즉시 · 재요청 0 |
| partial | A4 상세 | ✅ covered | payload 일부 결측(`cycles` 빔 · `pnl` null · `orders` 빔 · `price.idx` 빔)은 각 하위 표면(A6 ~ A8)의 빈 규칙으로 — 상세 셸은 깨지지 않는다 · 같은 행 빠른 열고 닫기 = 진행 중 요청 합침 · 언마운트 뒤 응답은 캐시에만 |
| overflow | A4 상세 | ✅ covered | 상세 루트 `px-2` · 높이 제한 없음(페이지 스크롤) · 하위 표면이 각자 wrap / 가로 스크롤 — 상세가 목록 카드 밖으로 나가지 않는다 |
| zero-one-many | A4 상세 | ✅ covered | 동시에 열린 상세 = 0 또는 1(아코디언) · 접으면 언마운트(차트 창 · 토글 초기화 · 캐시는 유지) |
| long-text | A4 상세 | ✅ covered | 실패 · `row: null` 문구는 고정 길이 · `break-keep` — 가변 긴 글자 없음 |
| empty | A5 KPI 줄 · 범례 · 프리셋 | ✅ covered | `price.idx` 빔 = 범례 · 프리셋 줄 · 캡션 대신 「그날 체결 자료 없음」 한 줄 · KPI 줄은 남는다(값 null = 「—」) |
| loading | A5 KPI 줄 · 범례 · 프리셋 | ✅ covered | A4 스켈레톤이 KPI 줄 · 범례 · 프리셋 자리를 같은 높이로 잡는다 |
| error | A5 KPI 줄 · 범례 · 프리셋 | ✅ covered | A4 실패 · 게이트 때 그리지 않는다 |
| populated | A5 KPI 줄 · 범례 · 프리셋 | ✅ covered | 4항목 · 8범례 · 프리셋 「전체」 켜짐(`aria-pressed`) · 창 범위 「09:00 ~ 20:00」 |
| partial | A5 KPI 줄 | ✅ covered | 등록가 · 평단 null/0 = 「—」 · 등록 후 순매수 반올림 0 = 「0.0억」 `--fg-2` · 「마지막 2시간」 은 `price.idx` 빔이면 `disabled` · 휠/끌기/키보드로 창을 바꾸면 프리셋 셋 다 꺼짐 |
| overflow | A5 프리셋 줄 | 🧪 backstop | { statement: "폰 310 폭에서 프리셋 3개 + 「HH:MM ~ HH:MM」 이 flex-wrap 으로 겹침 0 · 버튼 높이 32 유지", verification: backstop } |
| zero-one-many | A5 KPI 줄 · 범례 · 프리셋 | ✅ covered | KPI 4 · 범례 8 · 프리셋 3 — 개수 고정 · 가변 없음 · 캡션 앞 「팀 체결 없음 · 」 만 조건부 |
| long-text | A5 KPI 줄 · 범례 · 프리셋 | ✅ covered | 범례 · KPI 줄 `flex-wrap gap-y-1`(항목 단위 줄바꿈 · 최악 「등록 후 순매수 −1,234.5억」) · 캡션 `break-keep` · 말줄임 없음 |
| empty | A6 차트 | ✅ covered | 팀 체결 없음 = 가격 선 + 0선 + 축 + 빈 띠 + 판 가운데 「팀 체결 없음」 · `price.idx` 빔 = 「그날 체결 자료 없음」 한 줄(차트 없음) |
| loading | A6 차트 | ✅ covered | 측정 전 첫 페인트 = 폴백 폭 640 → 측정 즉시 다시 그림 · 높이 472 고정이라 점프 없음 · 데이터 전엔 A4 스켈레톤 472px |
| error | A6 툴팁(터치) | ⚠ unresolved — planner must treat as assumption | 폰에서는 `<title>` 이 뜨지 않아 원 · 막대 개별 금액을 못 본다 — v1 은 KPI 줄 · 사이클 표 · 손익 줄 글자로 대체(D-15 「`<title>` 또는 동급」 허용) · 탭 고정 툴팁은 후속 후보 · **라이브 UAT 에서 사용자 확인** |
| populated | A6 차트 | ✅ covered | 가격 선 · 팀 원(반지름 식 · 큰 원 → 작은 원 → `first`) · 누적 계단 · 10분 막대 쌍 · 사이클 세로선 · 등록 전 음영 · 15:30~16:00 빈 띠 · 세 판 x 동기 · 휠 커서 기준 확대/축소 · 끌기 · 핀치 · 프리셋 3 · 키보드 ←/→/+/−/0 · 최소 10분 · 09:00~20:00 clamp · rAF 프레임당 1회 · 창이 안 바뀌는 휠은 페이지 스크롤로 · 이월 = 등록선 · 음영 없음 + 이월 줄 · 09:00 이전 등록 = 09:00 에 붙임 · 06:00 종료 = 왼쪽 끝 선 + 원래 시각 라벨 · 창 안 점 0 = 하루 전체 폴백(NaN 금지) · 성능(한선엔지니어링급 price 3,648 · orders 501 · day_cum_net 6,513 에서 끊김 없음)은 E2E 휠 스모크 + 라이브 UAT 백스톱 |
| overflow | A6 세로선 라벨 · 눈금 | 🧪 backstop | { statement: "사이클 3개 · 짧은 사이클(등록~청산 10분)에서 전체 창 · 폰 310 폭일 때 라벨이 3줄 안에서 겹침 0 · 넘치면 라벨 생략(선 · title 은 남음) · 끝 라벨이 그림 영역을 넘지 않음 · 시각 눈금 간격 28px 미만이면 한 단계 큰 간격(폰 전체 창 2시간)", verification: backstop } |
| long-text | A6 축 글자 · 라벨 | 🧪 backstop | { statement: "종료선 라벨 최악 「이월 탈락(복원 안 됨) 06:00」 과 7자리 가격 축 글자(≥ 1,000,000원 종목 · 「1,234,500」 ≈ 59px) 가 왼쪽 축 52px · 그림 영역 안에서 잘림 0 — 7자리에서 잘리면 플래너가 축 폭 60 또는 「천」 단위 표기 중 하나를 정한다", verification: backstop } |
| empty | A7 사이클 표 | ✅ covered | `cycles.length < 2` = 표 없음(KPI 줄이 마지막 사이클을 말한다) · `cycles` 키 결측 = 없음과 같다 |
| loading | A7 사이클 표 | ✅ covered | A4 스켈레톤에 표 자리 없음 — 데이터 도착 후 차트 아래에 추가(차트 높이 고정이라 위쪽 점프 없음) |
| error | A7 사이클 표 | ✅ covered | A4 실패 때 없음 · 표 자체 오류 상태 없음(정적 렌더) |
| populated | A7 사이클 표 | ✅ covered | 9열 · 나온 순서 # · 마지막 행 `--team` 왼쪽 3px 띠 · 기본 펼침(토글 없음) |
| partial | A7 사이클 표 | ✅ covered | 종료 null = 「장 마감까지」 · 등록 null = 「—」 · 이월 사이클 = 「MM/DD HH:MM:SS」 · 수량 null = 「—」 |
| overflow | A7 사이클 표 | ✅ covered | 폰 `tbl-wrap overflow-x-auto` 가로 스크롤 · `whitespace-nowrap` · 페이지 가로 스크롤 0 |
| zero-one-many | A7 사이클 표 | ✅ covered | 0 · 1 = 표 없음 · 2 이상 = 표 + 캡션 「{n}개 · …」 · 행 수 제한 없음 |
| empty | A8 손익 줄 | ✅ covered | `pnl` null = 「팀 당일 손익」 + 「팀 체결 없음」(항목 · 캡션 없음) |
| loading | A8 손익 줄 | ✅ covered | A4 스켈레톤에 자리 없음 — 데이터 도착 후 추가 |
| error | A8 손익 줄 | ✅ covered | A4 실패 때 없음 · 자체 오류 상태 없음 |
| populated | A8 손익 줄 | ✅ covered | 합계(억 2자리 · 수익률 1자리 · 부호 색) · 실현 · 평가 · 보유 · 출처 모를 매도 · 캡션 · 면 상자 없음 |
| partial | A8 손익 줄 | ✅ covered | `ret` null = 합계만(「+0.30억」) · 항목 값 null = 「—」 |
| overflow | A8 손익 줄 | ✅ covered | 항목 줄 `flex-wrap gap-x-3 gap-y-0.5`(항목 단위 줄바꿈) · 캡션 `break-keep` |
| zero-one-many | A8 손익 줄 | ✅ covered | 항목 4 고정 · 합계 반올림 0 = 「0.00억」 `--fg-2` · 수량 0 = 「0주」 |
| long-text | A8 손익 줄 | ✅ covered | 최악 「출처 모를 매도 1,234,567주」 — 한 항목 단위로 줄바꿈 · 캡션 폰 2 ~ 3줄 허용 · 말줄임 없음 |
| empty | A9 판정 기준 | ✅ covered | 본문 5항목 고정 — 빈 경우 없음 · 임계 값 null = 그 항목 「—」 · `th_mcap_krw` 0 = 「시총 상한 없음」 |
| loading | A9 판정 기준 | ✅ covered | 토글은 데이터 도착 후 마운트 · 본문은 열 때만 마운트(닫히면 언마운트) |
| error | A9 판정 기준 | ✅ covered | 정적 문구 + 행 값 — 오류 상태 없음 · A4 실패 때 없음 |
| populated | A9 판정 기준 | ✅ covered | 기본 접힘 · 본문 5항목 고정 순서(1 → 5) + 출처 줄 · 상세 끝 출처 칩 |
| partial | A9 판정 기준 | ✅ covered | 임계 3값 중 일부 null = 그 항목만 「—」 · `mcap_krw` null = 「(현재 시총 —)」 |
| overflow | A9 판정 기준 | ✅ covered | 본문 `ul` `break-keep` 줄바꿈 · 토글 한 줄 · 출처 칩 `whitespace-nowrap` |
| zero-one-many | A9 판정 기준 | ✅ covered | 토글 1 · 본문 5 고정 · 열림/닫힘 두 상태만 |
| long-text | A9 판정 기준 | ✅ covered | 본문 3(최장 ≈ 110자)이 폰 310 에서 4 ~ 5줄 — `break-keep` 줄바꿈 · 말줄임 없음 · 본문 1 의 수는 `mono` 한 덩어리 |
| loading | A10 사이드바 | ⛔ dismissed | 정적 링크 — 로딩 상태 없음(권한 가시성은 기존 사이드바 규칙 · 이 phase 가 추가하지 않는다) |
| error | A10 사이드바 | ⛔ dismissed | 정적 링크 — 오류 상태 없음 |
| overflow | A10 사이드바 | ✅ covered | 「매집감지 보고서」 8자 — 「팀 매집 보고서」 폭과 비슷 · 레일 접힘은 하위 숨김 |
| long-text | A10 사이드바 | ✅ covered | 라벨 고정 8자 — 가변 글자 없음 · 기존 하위 링크 줄 규칙 그대로 |
| empty | A11 변환 | ✅ covered | `rows: []` → `sortRows` `[]` · `kpisOf` 전부 0 · `orders: []` · `cycles: []` → 빈 출력 · throw 없음 |
| loading | A11 변환 | ⛔ dismissed | 순수 함수 — UI 상태 없음 |
| error | A11 변환 | ✅ covered | null · NaN · 결측 입력에 throw 없음 — 「—」 · 하루 전체 범위 폴백 · `since_date` 비정상(`""` · `"None"`) = 이월 아님 · 숫자 아닌 좌표 점은 건너뜀 |
| populated | A11 변환 | ✅ covered | 변환 표 예시 값(정렬 키 · KPI 집계 · 라벨 · 태그 · 반지름 1천만 ≈ 2.7 / 1억 ≈ 3.8 / 10억 → 7 · clamp · 눈금 간격)이 단위 테스트 골든 |
| partial | A11 변환 | ⚠ unresolved — planner must treat as assumption | 목록 「사이클 n」 배지(평평한 열 `cycle`)와 상세 사이클 수(`cycles.length`)가 CR-01(번호 1 로 되돌림) 날에 어긋날 수 있다 — D-11 문구대로 수용(리서치 Pitfall 10) · 사용자가 맞추길 원하면 목록 RPC 에 사이클 수 열 추가(DB 변경) — **플랜 전에 결정** |
| overflow | A11 변환 | ⛔ dismissed | 순수 함수 — 컨테이너 없음(`clampView` 창 가두기는 populated 골든에 포함) |
| zero-one-many | A11 변환 | ✅ covered | `cycles` 0 / 1 / 2↑ → `cycleMarksOf` 종료선만 / 「등록 HH:MM」 / 「등록 HH:MM · k」 · `orders` 0 → 빈 배열 · `labelRowsOf` 0 라벨 → 빈 줄 |
| long-text | A11 변환 | ⛔ dismissed | 순수 함수 — 글자 배치는 `labelRowsOf` 결과를 A6 long-text 백스톱이 검증 |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | 없음(이 phase 는 새 컴포넌트를 설치하지 않는다 · Button · Table · Skeleton 은 이미 설치) | not required |

제3자 레지스트리 없음(`components.json` `registries: {}`) — 검사 대상 0.

---

## Claude's Discretion (이 계약이 정한 것 — 사용자 질문 0 · 바꾸고 싶으면 이 목록에서 지정)

**체커가 먼저 볼 것(잠긴 결정과의 해석 차이 2건):**

1. **상태 배지 치수 = 20px · 11px/600(목업 A 의 18px · 11px 를 4 배수로).** D-11 은 「라이브 패널 배지와 같은 치수·색 축」 이라 했지만, 라이브 `BADGE` 는 16px · **9px**/700 이다 — 9px 는 이 화면 글자 체계(11 · 12 · 14) 밖이고, 사용자가 채택한 목업 A 는 18px · 11px 다. 이 계약은 D-11 의 「같은 치수」 를 **모양(4px 모서리 · 투명 1px 테두리 · 종료만 `--border-subtle`) · 색 축 · 라벨 체계 동형**으로 읽고, 크기는 목업 A 를 따랐다. 라이브 9px 를 원하면 Typography 에 9px · 700 역할이 추가된다.
2. **손익 줄 항목 라벨 = D-21 · 목업 그대로(「실현 · 평가 · 보유 · 출처 모를 매도(주)」).** 팀 매집 보고서 손익 줄은 같은 `pnl` 을 「실현 · 미실현 · 평균 매수가 · 평균 매도가 · 원가 미상 매도(억)」 로 쓴다. D-21 이 「동형」 과 항목 목록을 둘 다 적어 두었고, 이 계약은 **배치 · 글자 · 합계 형식은 teamflow 동형, 항목은 D-21 목록**으로 정했다. 두 보고서 라벨을 맞추려면 별도 quick.

**그 밖 재량:**

3. **새 토큰 `--accum-shade` · `--accum-gap`** — 목업 `--shade` · `--gap` 값 그대로 · Tailwind `gap-*` 혼동을 피해 이름만 바꿈 · `tds-tokens.test.ts` 고정.
4. **프리셋 선택 면 = `--pill-on-*`**(작은 알약 선택 축) — 목업의 `--fg` 면 반전은 목업 프레임 전용. 휠 · 끌기 · 키보드로 창을 바꾸면 프리셋 셋 다 꺼짐.
5. **차트 배경 상자 없음 · 손익 줄 상자 없음** — 상세가 이미 목록 카드 `--card` 위(33 Discretion 9 상속).
6. **차트 치수** — 4 배수로 맞춘 판 높이 200 / 112 / 72 · 사이 24 · 전체 472 고정(폰 같음). 10분 판 오른쪽 위에 하루 최대 막대값 글자를 더했다(목업에 없음 · 막대 크기를 읽을 기준이 폰에서 툴팁 없이도 있게).
7. **휠 넘김 규칙** — 창이 바뀌지 않는 휠은 페이지 스크롤로 넘긴다(472px 차트 위 스크롤 갇힘 방지). 「휠 = 확대/축소」(D-14)는 그대로.
8. **키보드 조작(←/→/+/−/0)** — 목업 밖 접근성 보강. 프리셋이 이미 키보드로 되지만 임의 구간 이동 · 확대 대안이 없어서.
9. **세로선 라벨 겹침 규칙**(최대 3줄 · 넘치면 라벨 생략 · 끝에서 반대쪽으로) · **시각 눈금 최소 간격 28px**(폰 전체 창 2시간 간격) · **원 그리기 순서**(큰 원 → 작은 원 → `first`).
10. **사이클 번호 k = `cycles[]` 나온 순서 1-based** — 등록 라벨 「· k」 와 사이클 표 # 가 같은 번호(리서치 Open Q2 · CR-01). 목록 「사이클 n」 배지는 D-11 대로 평평한 열 `cycle`.
11. **흐린 행 복원** — hover · focus-visible · 열림 때 불투명도 1(D-11 흐림의 대비 손실을 읽는 순간에만 되돌림).
12. **목록 카드 소제목 「매집감지 종목」 + 정렬 캡션 · 2줄 열 머리** — teamflow 카드 문법 · D-10 열 머리를 112 칸에 넣으려 괄호를 아랫줄로.
13. **머리 출처 칩은 `PageHeader` 설명 맨 앞** — 날짜 알약 자리를 형제 보고서와 같게 두려고(목업은 알약 오른쪽 끝). 설명 글자 「장중에는 트레이딩 「매집」 패널이 실시간으로 보여줘요」(인박스 D-04).
14. **상세 지연 로드 모양** — 실제 배치 높이의 스켈레톤(472px 차트 자리 포함) · 실패 상자 · `row: null` 상자 · 상세 401/403 은 상세 자리 `DmaGate`.
15. **「20:30」 단일 상수** — D-24 ① 미루기 때 한 곳만 바꾼다.
16. **문구** — 빈 상태 · 오류 · 판정 기준 본문(목업 `ruleBlock` 해요체) · 사유 2 툴팁 · 차트 캡션 · 판 제목 · 문서 제목.
17. 함수 · 파일 · `data-slot` 이름은 예시만 적고 플래너가 정한다(KpiStrip · DayGrid 복제 · `TeamflowToggle` 재사용 여부 포함).

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS (FLAG — 페이지 전체 크기 5 · 굵기 3 은 PageHeader · KPI 값 상속 · 33 과 같은 상한)
- [x] Dimension 5 Spacing: PASS (FLAG — 12px 는 프로젝트 토큰 상속 · 예외 목록 보강)
- [x] Dimension 6 Registry Safety: PASS
- [x] Dimension 7 Inventory Provenance: PASS

**Approval:** approved — gsd-ui-checker 2026-10-20 · BLOCK 0 · FLAG 6(비차단 · 사실 오류 3건은 반영 완료: xl 열 합 808/880 · gap-y-0.5 예외 · KPI 0 색조 `--fg-2`)
