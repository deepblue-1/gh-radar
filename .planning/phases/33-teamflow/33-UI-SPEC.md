---
phase: "33"
slug: "teamflow"
status: approved
reviewed_at: "2026-10-16"
shadcn_initialized: true
preset: "radix-nova (components.json · baseColor neutral · Toss TDS 토큰 override)"
created: "2026-10-16"
---

# Phase 33 — UI Design Contract

> 팀 매집(teamflow) 보고서(TEAM-02 사이드바 · TEAM-03 목록 · TEAM-04 상세). gsd-ui-researcher 가 만들고 gsd-ui-checker 가 검증한다.
> **디자인 시스템은 이미 확립돼 있다.** 이 화면은 상한가 보고서(`/analytics/limitup` · Phase 28 · 스케치 011 A)와 **한 몸**이다 — 날짜 알약 · KPI 띠 · 카드 안 행 목록 · 그 자리 아코디언 · 억 1자리 · 순수 SVG 결을 그대로 쓴다. 상한가 보고서와 다른 점은 셋뿐이다: ① **기본 전부 접힘**(D-08) ② **행 있는 날짜만** 날짜 목록(D-07) ③ 팀 색 `--team` 한 쌍(새 토큰 — 아래 「Color」).
> 결정 출처: `33-CONTEXT.md` D-07~D-14(잠금) · 「Claude's Discretion」, 채택 스케치 `sketches/014-teamflow-list-detail` **A 보고서 동형 · 기본 전부 접힘**, `sketches/015-teamflow-detail-chart` **C 혼합(차트 + 접힌 표)**, 열 사전 정본 `docs/inbox/from-gh-trade/261016-teamflow-export.md`. 스케치 `data.js` 의 필드 이름 · 단위(`t` · `rate_lo/hi` · 정수 % `team_buy_share` · 억 단위 · `status:"up"` · `members_missing`)는 **화면용 가공값**이다 — 이 계약은 인박스 열 사전의 실제 키(`buckets[].start` · `lo`/`hi` · `share` 0~1 · 원 · `status:"below"` · `members.absent`)로 적는다.
> 스케치 팔레트(`--red` · `--blue` · `--team` #b48cf2 · `--g200` 등)는 스케치 전용 변수다. 이 계약은 그것을 `globals.css` 기존 토큰 + 새 `--team` · `--team-bg` 로 옮긴다.

### 표면 지도

| 표면 | 요구 | 주 파일(이름은 플래너 결정 · 예시) |
|---|---|---|
| T1 페이지 셸 — 머리 · 날짜 알약 · 상태(로딩 · 오류 · 빈 · 게이트) | TEAM-03 | `app/analytics/teamflow/page.tsx`(AppShell + Suspense) · `components/analytics/teamflow-report.tsx` |
| T2 KPI 띠 4칸 + 캡션 | TEAM-03 | `limitup-kpi-strip.tsx`(타일 prop 화) 또는 `teamflow-kpi-strip.tsx` |
| T3 탐지 종목 목록(행 · 아코디언) | TEAM-03 | `teamflow-list.tsx`(DayGrid 일반화 또는 복제 — 플래너) |
| T4 구간별 순매수 미니막대(행 안 9칸) | TEAM-03 | `teamflow-strip.tsx` |
| T5 상세 — 요약 문장 | TEAM-04 | `teamflow-detail.tsx` |
| T6 상세 — 구간 가로 막대 + 「구간표 보기」 | TEAM-04 | `teamflow-band-chart.tsx` · `teamflow-band-table.tsx` |
| T7 상세 — 거래원 2단 막대 | TEAM-04 | `teamflow-members.tsx` |
| T8 상세 — 10분 흐름 차트 + 「10분 표 보기」 | TEAM-04 | `teamflow-bucket-chart.tsx` · `teamflow-bucket-table.tsx` |
| T9 상세 — 판정 기준(접힘) | TEAM-04 | `teamflow-detail.tsx` |
| T10 사이드바 「분석 › 팀 매집」 | TEAM-02 | `components/layout/app-sidebar.tsx` |
| T11 표시 변환(억 · % · 9칸 슬롯 · 39칸 축 · 요약 토큰화) | TEAM-03/04 | `lib/teamflow-report.ts` |
| (보조) DmaGate 표면 이름 「팀 매집」 | TEAM-02 | `components/trading/dma-gate.tsx`(`DmaGateSurface` 유니온 추가) |

반응형: 상한가 보고서와 **같은 뷰포트 브레이크포인트**를 쓴다 — 목록 행은 `< xl` 카드형(폰 390 「2줄 카드형 행」) · `xl`(≥1280) 이상 7열 표(`limitup-day-grid.tsx` 와 같은 「같은 DOM · CSS 로만 배치 전환」), 상세 2열도 `xl` 에서. 상따 화면(`/trading/limit-chaser`)의 본문 폭 컨테이너 쿼리(`globals.css` §2.2b)는 이 화면에 적용하지 않는다 — 분석 화면은 상한가 보고서의 뷰포트 규칙을 따른다.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (이미 초기화 — `webapp/components.json`) |
| Preset | `radix-nova` · baseColor `neutral` · cssVariables — 색은 `globals.css` Toss TDS 토큰이 override |
| Component library | radix (`radix-ui`) — 이 phase 는 radix 프리미티브를 새로 쓰지 않는다 |
| Icon library | lucide (`lucide-react@1.8.0`) — `ChevronDown`(행 · 기존 day-grid 와 같다) · `ChevronRight`(접힌 표 · 판정 기준 토글) 2개만 |
| Font | Pretendard Variable(`--font-sans`) · 수 · 금액 · % · 시각은 `mono` 클래스(같은 서체 + `tabular-nums`) |
| Chart | **라이브러리 없음**(D-12) — 스케치 015 `index.html` 의 `strip()` · `bandChart()` · `bucketChart()` · `memberBars()` 를 React 로 이식. recharts(`ui/chart`) · lightweight-charts 를 쓰지 않는다 |

---

## Component Inventory

Enumerated by `npx shadcn info` (cwd `webapp/`, 「Installed Components」 절) — 21 components — shadcn@4.2.0 — 2026-10-16.

설치 목록: badge, button, card, chart, checkbox, command, dialog, input-group, input, popover, separator, sheet, skeleton, slider, switch, table, tabs, textarea, toggle-group, toggle, tooltip. 아래 표는 **이 phase 가 닿는 것만 고른 비배타 목록**이다 — 표 밖 컴포넌트를 확인해 쓰는 것은 정상 경로다. 이 phase 는 shadcn 컴포넌트를 새로 설치하지 않는다.

| Component | Import path | Notes |
|-----------|-------------|-------|
| Button | `@/components/ui/button` | 빈 상태 「최신 보고서 보기」(상한가 보고서 `EmptyBox` 와 같은 기본 변형 · `mt-2`) |
| Table | `@/components/ui/table` | 「구간표 보기」 · 「10분 표 보기」 접힌 표(래퍼 `tbl-wrap` 이 `overflow-x-auto` — 폰 가로 스크롤) · `limitup-fingerprint-table.tsx` 와 같은 사용법 |
| `PageHeader` (프로젝트) | `@/components/layout/page-header` | 제목 「팀 매집」 · 설명 · `actions` = 날짜 알약 |
| `CARD` · `ROW_DIVIDER` (프로젝트) | `@/components/layout/page-layout` | 목록 카드 면 · 행 구분선(오류 · 빈 상자도 `CARD`) |
| `LimitupDateNav` (프로젝트) | `@/components/analytics/limitup-date-nav` | 날짜 알약 — **그대로 재사용**(aria 「이전 보고서」 · 「다음 보고서」 · `fmtYmdLabel`) |
| `LimitupKpiStrip` (프로젝트) | `@/components/analytics/limitup-kpi-strip` | 레이아웃 재사용 — 라벨이 하드코딩이라 `tiles` prop 화 또는 teamflow 전용 복제(플래너 · CONTEXT 재량). 값 칸에 부호 색 1칸(「팀 순매수 합」)이 필요하다 |
| `LimitupDayGrid` 아코디언 문법 (프로젝트) | `@/components/analytics/limitup-day-grid` | 버튼 문법 · `rowButtonId` · `aria-describedby` sr 설명 · 점프 보정 `scrollIntoView` · 같은 DOM CSS 전환. **기본 펼침만 다르다**(teamflow = `null`). 일반화 vs 복제는 플래너 |
| `DmaGate` · `useDmaGateReason` (프로젝트) | `@/components/trading/dma-gate` | `surface="팀 매집"` — `DmaGateSurface` 유니온에 「팀 매집」 추가(「집」 받침 → `topicParticle` 이 「팀 매집은」) |
| `parseYmdParam` · `dateNavOf` · `fmtYmdShort` · `fmtYmdLabel` · `kstSecOf` (프로젝트) | `@/lib/limitup-report` | `?d=` 판정 · 알약 이동 · 문서 제목 · KST 시각 — 그대로 |
| `ApiClientError` (프로젝트) | `@/lib/api` | 401/403 → 게이트(상한가 보고서와 같은 분기) |
| lucide `ChevronDown` · `ChevronRight` | `lucide-react` | 행 셰브론 · 접힘 토글 아이콘(`aria-hidden`) |

새 파일은 위 「표면 지도」 의 teamflow 컴포넌트와 `lib/teamflow-report.ts` 뿐이다. `format.ts` 의 `formatTradeAmount` 는 **재사용하지 않는다** — 억 미만 버림 · 부호 없음 · 1조 이상 조 변환이라 D-10(부호 + 억 소수 1자리 · 조 변환 없음)과 다르다.

---

## Spacing Scale

Declared values (must be multiples of 4) — 프로젝트 토큰 `--s-*` 그대로:

| Token | Value | Usage |
|-------|-------|-------|
| xs (`--s-1`) | 4px | 상세 위 패딩(`pt-1`) · 요약 문장 사이 · 표 토글 아이콘–글자 · 거래원 매수/매도 막대 사이 |
| sm (`--s-2`) | 8px | KPI 칸 사이(`gap-2`) · 행 좌우 패딩(`px-2`) · 섹션 소제목 → 차트 · 차트 → 범례 · 차트(또는 범례) → 표 토글 · 토글 → 표 · 거래원 행 사이 |
| (`--s-3`) | 12px | 행 위아래 패딩(`py-3`) · 행 칸 사이(`gap-x-3`) · KPI 칸 안 패딩(`p-3`) · 요약 상자 세로 패딩 · 폰 메타 항목 사이 |
| md (`--s-4`) | 16px | 페이지 세로 간격(`gap-4` — 상속) · 목록 카드 패딩(`p-4`) · 상세 블록 사이(요약 → 2열 → 10분 → 판정 기준) · 2열 사이 |
| lg (`--s-5`) | 24px | 상세 아래 여백 — 상한가 사건 카드 `pb-5`(20px)는 상속 예외로 두지 않고 **24px(`pb-6`)** 로 올린다 |
| xl (`--s-6`) | 32px | (변경 없음) |
| 2xl (`--s-8`) | 48px | 빈 · 오류 상자 세로 패딩(`py-12` — 상한가 보고서 `EmptyBox` 상속) |
| 3xl (`--s-10`) | 64px | (변경 없음) |

이 phase 가 정하는 치수:

| 치수 | 값 | 근거 |
|---|---|---|
| 페이지 컨테이너 | `mx-auto max-w-[1120px] flex-col gap-4` | 상한가 보고서 그대로 |
| 행 버튼 | 최소 높이 44px(`min-h-11`) · 패딩 8/12 · 칸 사이 12 · `scroll-mt-[calc(4.5rem+var(--app-safe-top))]` | `limitup-day-grid.tsx` 그대로 |
| 데스크톱 열 템플릿(xl) | `xl:grid-cols-[minmax(0,168px)_104px_80px_minmax(0,148px)_72px_minmax(0,1fr)_16px]` — 종목 · 결과 · 팀 순매수 · 20% 아래/위 · 매수 중 팀 · 미니막대 · 셰브론 | 스케치 014 `--cols: 196 84 104 150 86 1fr 20` 을 상한가 보고서 열 폭(168 · 16) · 4 배수로 맞춤. 「결과」 104 = 「상한가 15:19」 태그 온전 폭 |
| 미니막대 | 높이 28px(`h-7`) · 9칸 · viewBox `0 0 178 28`(칸 18 · 사이 2) · `preserveAspectRatio="none"` | 스케치 26px → 4 배수 28 |
| 상세 2열 | `grid gap-4 xl:grid-cols-2`(`minmax(0,1fr)` 둘) · `< xl` 1열 | 스케치 015 `.two{gap:16px}` · 폰 1열(D-14) |
| 섹션 소제목 줄 | `flex flex-wrap items-baseline gap-x-2` · 아래 8px | 상한가 `LANE_HEAD` 문법 · 6px → 8px |
| 구간 가로 막대 차트 | 행 높이 28 · 막대 높이 16 · 왼쪽 라벨 칸 96 · 오른쪽 값 칸 120 · 위 8 · 아래 각주 16 → 높이 = 24 + 행 수 × 28 | 스케치 `RH 28 · L 96 · R 118 · top 6 · bar 14` → 4 배수 |
| 10분 흐름 차트 | 왼쪽 축 40 · 오른쪽 축 36 · 위 8 · 막대 판 128 · 판 사이 16 · 등락률 띠 판 56 · 시각 눈금 20 → 높이 228 고정 · 39칸 | 스케치 `L 36 · R 34 · H1 130 · GAP 14 · H2 54 · tick 18` → 4 배수 |
| 거래원 2단 막대 | 행 = `grid-cols-[48px_minmax(0,1fr)_88px] gap-x-2` · 막대 높이 8(`h-2`) × 2 · 사이 4 · 행 사이 8 | 스케치 `.mbr 44 · 1fr · 72` · 상한가 `Bars` 의 `h-2` 트랙 |
| 접힘 토글 | 최소 높이 32px · 글자 왼쪽 아이콘 16px · 사이 4px | 손가락 대상 · 상따 링크 버튼 높이 |

Exceptions (상속 · 차트 내부 미세 치수 — 간격 스케일 밖으로 선언):
- 행 안 세로 간격 6px(`gap-y-1.5`) — `limitup-day-grid.tsx` 행 버튼 상속(DayGrid 를 일반화하면 그대로 따라온다).
- 요약 상자 좌우 패딩 14px(`px-3.5`) — 상한가 사건 카드 `limitup-story` 상자 상속.
- 결과 태그 높이 20px(`h-5`) · 좌우 8px · 번호 원 20px(`size-5`) — 기존 `ResultTags` · 사실 문장 번호 원 상속.
- 차트 내부: 미니막대 칸 사이 2(viewBox 단위) · 0 이 아닌 값의 최소 막대 1.5 · 10분 막대 폭 = 칸 폭 − 2(최소 2) · 막대 모서리 `rx` 1~3 · 팀 비중 선 굵기 2 · 점선 `3 3`(20%) · `2 3`(첫 상한가).
- 범례 견본 10px 정사각(선 견본 10×2 — T7 · T8) — 12px 글자 옆에서 글자 x-height 와 맞추는 치수. 8 은 작아 보이고 12 는 글자와 같은 키라 견본이 아니라 글자처럼 읽힌다(상한가 보고서 범례와 같은 값).
- 10분 표 최대 매집 창 행의 왼쪽 띠 3px(`inset 3px 0 0 var(--team)` — T8 표) — 표 칸 안 `box-shadow` 띠라 레이아웃 치수가 아니다. 4 는 셀 패딩을 눈에 띄게 먹고 2 는 다크에서 흐려진다.

**복제 시 치수 불변 계약:** `LimitupKpiStrip` 의 `tiles` prop 화 또는 복제, `LimitupDayGrid` 의 일반화 또는 복제 — 어느 쪽을 플래너가 고르든 행 버튼 `min-h-11` · 패딩 8/12 · `scroll-mt-[calc(4.5rem+var(--app-safe-top))]` · xl 열 템플릿(위 표) · KPI 타일 패딩 · 값 20/600 `mono` 는 **같은 값**으로 남는다. 선택이 레이아웃을 흔들지 못하게 하는 DOM · 간격 계약이다.

---

## Typography

이 phase 가 **새로 짓는** 글자 역할은 아래뿐이다 — 크기 3개(11 · 12 · 14), 굵기 2개(400 · 600).

| Role | Size | Weight | Line Height | 자리 |
|------|------|--------|-------------|------|
| 결과 태그 · 차트 안 글자(축 · 라벨 · 값 · 범례 안 「첫 상한가 HH:MM」) · 요약 번호 원 | 11px | 600(태그 · 값 · 번호) / 400(축 · 라벨) | 16px | `ResultTags` 문법 · SVG `<text>`(측정 폭 1:1 viewBox — 아래 T6 · T8) |
| 캡션 · 열 머리 · 「결과」 보조줄 · 20% 아래/위 칸 · 폰 메타 · 범례 · 접힌 표 본문 · 토글 글자 · 판정 기준 본문 · 「상위 5 밖」 · 「거래원 자료 없음」 | 12px(`--t-caption`) | 400 (토글 · 표 머리 중 강조 · 표 「하루 합계」 행 · 순매수 값은 600) | 1.5 | 상한가 보고서 캡션과 같은 값 |
| 종목명 · 팀 순매수(행) · 매수 중 팀(행) · 섹션 소제목 · 요약 문장 · 빈/오류 제목 | 14px(`--t-sm`) | 600(종목명 · 팀 순매수 · 소제목 · 제목 · 요약 안 `<b>`) / 400(요약 문장 · 매수 중 팀 30% 미만) | 1.5 | 상한가 보고서 행 · 사건 카드 소제목과 같은 값 |

상속(바꾸지 않음): 페이지 h1 22/700(`PageHeader`) · 설명 14/400 · KPI 값 20/600 `mono` 줄높이 1.2(페이지의 시각 앵커 — `LimitupKpiStrip`) · KPI 라벨 12/400 · 날짜 알약 14/600 `mono`. 글자 크기를 폭 때문에 줄이거나 키우지 않는다 — 폰에서도 차트 글자는 11px 이다(viewBox 를 측정 폭과 1:1 로 둔다).

**페이지 전체 합계(상한선):** 크기 5개(11 · 12 · 14 · 20 · 22) · 굵기 3개(400 · 600 · 700). 20 · 22 · 700 은 모두 이미 승인된 시스템 역할(`PageHeader` h1 · KPI 값)에서 오고 이 phase 가 새로 짓는 것은 위 표의 3 크기 · 2 굵기뿐이다 — 플래너 · 실행자는 이 합계 밖의 크기 · 굵기를 추가하지 않는다(32-UI-SPEC 과 같은 범위 규칙).

---

## Color

| Role | Value (라이트 / 다크) | Usage |
|------|-------|-------|
| Dominant (60%) | `--surface` #f2f4f6 / #0a0a0a · `--bg` #ffffff / #0a0a0a | 본문면 |
| Secondary (30%) | `--card` #ffffff / #151515 · `--muted` #f2f4f6 / #2d2d2d | 목록 카드 · KPI 칸 · 빈/오류 상자 / 날짜 알약 · 행 hover · 펼친 행 면(`color-mix(in oklab, var(--muted) 60%, transparent)`) · 요약 상자(`… 55% …`) · 거래원 막대 트랙 · 중립 태그 |
| Accent (10%) | `--primary` #3182f6 / #3485fa · `--accent-fg` #1b64da / #8ab8ff | 아래 목록 자리만 |
| Destructive | `--destructive` | **이 phase 는 쓰지 않는다**(파괴적 동작 없음). 가격 방향 빨강은 `--up` 이다 — 상태 적색과 섞지 않는다 |

**새 토큰(이 phase 의 유일한 토큰 추가) — 「팀」 축:**

| 토큰 | 라이트 | 다크 | 근거 |
|---|---|---|---|
| `--team` | `#a234c7` (TDS purple500) | `#c353e5` (TDS purple600) | `@toss/tds-colors@0.1.0` 공식값. 대비 — 라이트 `--card` #fff 위 5.4:1 · 다크 `--card` #151515 위 4.9:1(글자 11~14px 에 AA). 다크 purple500 #ae3dd1 은 3.8:1 이라 한 단계 밝은 600 을 쓴다 |
| `--team-bg` | `#f9f0fc` (TDS purple50) | `rgba(174, 61, 209, 0.16)` (다크 purple500 틴트) | `--up-bg` 와 같은 규칙(라이트 50 단계 · 다크 500 의 rgba .16) |

- `globals.css` `:root` · `.dark` **둘 다** 정의(한쪽만 두면 반대 테마에서 조용히 사라진다) · hex/rgba 만(oklch 금지 — 차트 · 테스트 규칙).
- `styles/__tests__/tds-tokens.test.ts` 의 `THEME_COLOR_TOKENS` 에 `team` · `team-bg` 추가 · `LIGHT_EXPECTED` / `DARK_EXPECTED` 에 위 값 고정.
- 주석에 축을 적는다: 「팀(teamflow 다섯 창구) 축 — 가격 방향(`--up`/`--down`) · 래치 LED(`--led-*`) · 선택(`--seg-on-*` · `--nav-on-*`)과 다른 축이다. 서로 대체하지 마라.」

스케치 변수 → 프로젝트 토큰:

| 스케치 | 토큰 | 자리 |
|---|---|---|
| `--red`(+ 순매수 · 매수) | `--up` | 순매수 + 막대 · 글자, 거래원 매수 막대, 첫 상한가 세로선 · 라벨, 상한가 태그 글자 |
| `--blue`(− 순매도 · 매도) | `--down` | 순매수 − 막대 · 글자, 거래원 매도 막대 |
| `--red-box`(상한가 태그 면) | `--up-bg` | 「상한가 HH:MM」 태그 면 |
| `.tag.up`(`--float` 면) | `--muted` 면 + `--fg-2` 글자 | 미도달 「+22.6%」 태그 |
| `--team` #b48cf2 | `--team` | 팀 비중 선 · 오른쪽 축 「60%」/「0%」 · 매수 중 팀 ≥ 30% 글자 · 최대 매집 창 행 왼쪽 띠(10분 표) |
| `--team-box` | `--team-bg` | 최대 매집 창 음영(10분 차트) · 구간표 「하루 합계」 행 면 |
| `--g200`(0선 · 빈 칸) | `--border-subtle` | 0선 · 미니막대 빈 칸 1px 선 · 표 구분선 |
| `--g300`(등락률 띠 · 0 근처 막대) | `--faint` | 10분 등락률 범위 띠 · 반올림 0.0억 막대 |
| `--t500`(20% 점선 · 축) | `--muted-fg` | 20% 점선 · 축 글자 · 각주 |
| `.chart` 배경 `--bg` | 없음(차트는 `--card` 위에 바로) | 상한가 레인과 같은 결 · 다크 대비 보존(배경 상자를 깔면 `--team` 글자 대비가 4.3:1 로 떨어진다) |

글자 색:

| 요소 | 토큰 |
|---|---|
| 종목명 · 소제목 · 빈/오류 제목 · 요약 `<b>` | `--fg` |
| 요약 문장 · 표 본문 수 · 행 「매수 중 팀」(30% 미만) | `--fg-2` |
| 코드 · 시장 · 캡션 · 열 머리 · 「결과」 보조줄 · 폰 메타 라벨 · 축 · 범례 · 판정 기준 본문 · 「상위 5 밖」 | `--muted-fg` |
| 「거래원 자료 없음」 · 「—」(null) · 비중 0% 칸 | `--faint` |
| 금액(순매수 · 20% 아래/위 · KPI 합 · 차트 값 · 표 순매수) | 부호 색 — 반올림 값 > 0 `--up` · < 0 `--down` · 0.0 이면 `--fg-2`(칸) / `--faint`(막대) |
| 매수 중 팀 ≥ 30%(행 · 차트 오른쪽 % · 표) | `--team` 600 |

**색만으로 말하지 않는다:** 금액은 항상 부호 글자(「+」 · 「−」 U+2212)를 함께 쓰고, 팀 비중 ≥ 30% 는 굵기(600)도 함께 바뀐다. 차트 막대의 값은 접힌 표에 글자로 있다.

Accent reserved for (이 phase 가 **추가하는** accent 소비처는 2곳뿐이다): ① 「구간표 보기」 · 「10분 표 보기」 토글 글자(`--accent-fg` 12/600 — 상한가 보고서 「다시 시도」 와 같은 링크 글자), ② 빈 상태 「최신 보고서 보기」 `Button`(기본 변형 `--primary` 면 — 상한가 보고서 상속). 상속(바꾸지 않음): 「다시 시도」 글자 · 전역 포커스 링 · 사이드바 활성 항목(`--nav-on-*`). 「판정 기준」 토글은 accent 가 아니다(`--fg-2`).

`--team` reserved for (팀 축 — accent 와 별개): ① 10분 차트 팀 비중 선 · 오른쪽 축 글자, ② 매수 중 팀 ≥ 30% 글자(행 · 구간 차트 오른쪽 % · 두 표), ③ `--team-bg` 최대 매집 창 음영 · 구간표 「하루 합계」 행 면, ④ 10분 표 최대 매집 창 행의 왼쪽 3px 띠(`inset 3px 0 0 var(--team)`). 그 밖(머리 설명의 팀 이름 · 구간 차트 「상한가 가격」 라벨 · KPI)에는 쓰지 않는다 — 스케치의 보라 팀 이름 · 보라 「상한가 가격」 라벨은 옮기지 않는다(보라 = 「팀 비중」 한 뜻).

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | 이 화면에 주 버튼은 없다 — 주 조작은 **행 펼침**(행 버튼 접근 이름 「{종목명} {코드} — 팀 매집 상세」). 빈 상태 CTA 「최신 보고서 보기」 |
| Empty state heading | 적재 이력 0 「아직 올라온 팀 매집 보고서가 없어요」 · 행 없는 날짜(`?d=` 직접) 「이 날은 팀 매집 데이터가 없어요」 |
| Empty state body | 적재 이력 0 「첫 보고서는 평일 밤 21:20쯤 올라와요」 · 행 없는 날짜 「팀 매집 보고서는 평일 밤 21:20쯤 올라와요. 최신 보고서는 {MM/DD}예요」 + 버튼 「최신 보고서 보기」 |
| Error state | 「보고서를 불러오지 못했어요」 + 텍스트 버튼 「다시 시도」(상한가 보고서와 같은 문구 · `role="alert"`) · 게이트(401/403) = `DmaGate surface="팀 매집"` 문구 |
| Destructive confirmation | 없음 — 이 phase 에 파괴적 동작이 없다(읽기 전용 보고서) |

### T1. 페이지 셸

| 요소 | 문구 |
|---|---|
| 페이지 제목(h1) | 「팀 매집」 |
| 문서 제목 | 날짜 모름 「팀 매집」 · 날짜 앎 「팀 매집 · {MM/DD}」(`fmtYmdShort`) |
| 머리 설명 | 「평일 밤 21:20쯤 그날 보고서가 올라와요 · 팀 = 교보 · 한국 · 유진 · 신한 · NH」 |
| 날짜 알약 | `LimitupDateNav` 그대로 — 「‹ 10/14 (수) ›」 · 날짜 모름 「—」 · aria 「이전 보고서」 / 「다음 보고서」 |
| 로딩 | 「불러오는 중…」(12/400 `--faint` · 스켈레톤 없음 — 상속) |
| 게이트 — 미매핑 | 「팀 매집은 증권사 계정이 연결된 사용자만 이용할 수 있어요. 관리자에게 연결을 요청하세요.」(`DmaGate` 템플릿) |
| 게이트 — 미인증 | 「팀 매집은 로그인한 뒤 이용할 수 있어요.」(`DmaGate` 템플릿) |

### T2. KPI 띠

| 칸(왼쪽부터) | 라벨 | 값 |
|---|---|---|
| 1 | 「탐지 종목」 | 행 수 · 정수(그룹 구분 쉼표) |
| 2 | 「팀 순매수 종목」 | `team_net_val > 0` 행 수 |
| 3 | 「상한가 도달」 | `status === "limit"` 행 수 |
| 4 | 「팀 순매수 합」 | 전 행 `team_net_val` 합(음수 포함 · null 제외) · 부호 + 억 1자리 · 부호 색 |
| KPI 아래 캡션 | 「탐지 = 20%↑ 또는 상한가 체결 종목 · 팀 수치는 들어와서 친 체결만 센 최소치예요」 | 상한가 보고서 「제외 한 줄」 자리(`-mt-2` · 12/400 `--muted-fg` · `break-keep`) — 항상 보인다 |

라벨 「탐지 종목」 · 「팀 순매수 종목」 은 CONTEXT 의 「탐지」 · 「팀 순매수」 에 「종목」 을 붙인 것이다(값이 단위 없는 정수라 「팀 순매수 합」 과 헷갈리지 않게 · 스케치 014 의 「탐지 종목」 그대로).

### T3. 탐지 종목 목록

| 요소 | 문구 |
|---|---|
| 카드 소제목(h2) | 「탐지 종목」 |
| 소제목 캡션 | 「팀 순매수 큰 순 · 막대 = 구간별 팀 순매수(0% 미만 → 상한가 가격 · 점선 = 20%)」 |
| 데스크톱 열 머리(xl · `aria-hidden`) | 「종목」 · 「결과」 · 「팀 순매수」 · 「20% 아래 / 위」 · 「매수 중 팀」 · 「구간별 순매수」 · (빈 칸) |
| 종목 칸 | 1줄 종목명(`name` · null 이면 `short_code`) · 2줄 「{short_code} · {KOSPI\|KOSDAQ}」(`market` null 이면 코드만) |
| 결과 태그 — 상한가 | 「상한가 HH:MM」(`first_limit_ms` KST) · `first_limit_ms` null 이면 「상한가」 |
| 결과 태그 — 미도달 | 「{last_rate}」 — 「+22.6%」 / 「−3.1%」(부호 + 소수 1자리) |
| 결과 보조줄(xl · 미도달만) | 「고가 +29.1%」(`high_rate` · null 이면 보조줄 없음) |
| 20% 아래/위 칸(xl · 2줄) | 「20% 아래 {below20}」 / 「20%~상한 {above20}」 — 라벨 `--muted-fg` · 값 부호 색 |
| 폰 메타 줄(< xl) | 「팀 순매수 {net}」 · 「20% 아래 {below20}」 · 「매수 중 팀 {share}」 — 라벨 + 값(스케치 014 A 폰 3항목 · 20%~상한 값은 미니막대와 sr 설명이 맡는다) |
| 행 버튼 접근 이름 | 「{종목명} {코드} — 팀 매집 상세」 |
| 행 sr 설명(`aria-describedby`) | 「결과 {태그 글자}{, 고가 +NN.N%}, 팀 순매수 {net}, 20% 아래 {below20}, 20%~상한 {above20}, 매수 중 팀 {share}」 |
| 목록 0 행(행 없는 날짜) | 페이지 빈 상태가 맡는다(목록 카드를 그리지 않는다 — 위 표) |

### T4. 미니막대

| 요소 | 문구 |
|---|---|
| 칸 툴팁(`<title>`) | 「{label} · 팀 순매수 {net_val}」 — 빈 칸 「{label} · 체결 없음」 |
| 9칸 라벨(고정 순서) | `0% 미만` · `0~5%` · `5~10%` · `10~15%` · `15~20%` · `20~25%` · `25~28%` · `28%~상한 미만` · `상한가 가격` |

### T5~T9. 펼친 상세

| 요소 | 문구 |
|---|---|
| 요약 문장 | `payload.summary_lines[]` 원문 그대로(번호 1~N) · `<b>…</b>` 만 굵게(아래 「요약 토큰화」) |
| 요약 상자 끝 사실 줄 | 「기준가 {base} · 상한가 {upper} · 고가 {high_px} ({high_rate}, {high_ms HH:MM}) · 종가 {last_px} ({last_rate}) · 거래대금 {value 억}」 — 값 없는 칸은 칸째 생략(「 · 」 꼬리 없음) |
| 구간 소제목 · 캡션 | 「등락 구간별 팀 순매수」 · 「막대 = 팀 순매수 · 오른쪽 % = 매수 중 팀」 |
| 구간 차트 각주(SVG 오른쪽 아래) | 「매수 중 팀」 |
| 구간 차트 20% 점선 라벨 | 「20%」 |
| 구간 막대 툴팁 | 「{label} · 팀 순매수 {net_val} · 매수 중 팀 {share} · 거래량 {vol}주」 |
| 구간 차트 빈 상태 | 「구간 체결이 없어요」(bands 가 「하루 합계」 뿐 · 12/400 `--faint` · 표 토글은 남는다) |
| 거래원 소제목 · 캡션 | 「다섯 창구 거래원」 · 「{members.time} 기준 하루 누적 · 창구 전체(일반 고객 포함)」(`time` null 이면 「하루 누적 · 창구 전체(일반 고객 포함)」) |
| 거래원 행 | 창구 이름(`name`) · 매수/매도 막대 · 순매수 「+96,289주」 / 「−21,245주」 / null 「—」 |
| 거래원 막대 툴팁 | 「{name} · 매수 {buy}주 · 매도 {sell}주」(null 칸은 「—」) |
| 상위 5 밖 줄 | 「상위 5 밖: {absent 를 「 · 」 로}」 — 예 「상위 5 밖: 교보 · 유진」 · `absent` 비면 줄 없음 |
| 거래원 범례 | 「매수」 · 「매도」 · 「오른쪽 = 순매수(주)」 |
| 거래원 참고 줄 | 「참고: 매수 1위 {top_buy.name} {qty}주 · 매도 1위 {top_sell.name} {qty}주」 — 한쪽만 있으면 그쪽만 · 둘 다 null 이면 줄 없음 |
| 거래원 없음 | 「거래원 자료 없음」(`members` null · 또는 `rows` · `absent` 둘 다 빔) |
| 10분 소제목 · 캡션 | 「10분 단위 흐름」 · 「09:00~15:30」 + (window 있으면) 「 · 보라 음영 = 팀 순매수가 가장 크게 이어진 {window.start}~{window.end} ({window.net_val})」 |
| 10분 축 글자 | 왼쪽 위 「+{최대값 억}」 · 0선 「0」 · 띠 「20%」 · 띠 위 「{rhi}%」 · 오른쪽 「60%」 / 「0%」(`--team`) · 아래 시각 눈금 「9시」 「10시」 … 「15시」 |
| 첫 상한가 세로선 라벨 | 「첫 상한가 HH:MM」 |
| 10분 칸 툴팁 | 「{start} · 등락 {lo}~{hi}% · 팀 순매수 {net_val} · 매수 중 팀 {share} · 거래량 {vol}주」 — 빈 칸은 툴팁 없음 |
| 10분 차트 빈 상태 | 「10분 체결 기록이 없어요」(`buckets[]` 빔 · 판 가운데 11/400 `--faint` · 축 · 0선은 그대로) |
| 10분 범례 | 「팀 순매수 +」 · 「팀 순매수 −」 · 「매수 중 팀 %」 · 「등락률 범위」 · (window 있으면) 「최대 매집 창」 · (상한가면) 「첫 상한가」 |
| 구간표 토글 | 닫힘 · 열림 모두 「구간표 보기」(상태는 `aria-expanded` · 아이콘 회전이 말한다) |
| 구간표 열 머리(6) | 「구간」 · 「거래량」 · 「매수 중 팀」 · 「팀 매수」 · 「팀 매도」 · 「팀 순매수」 |
| 구간표 칸 | 팀 매수 · 팀 매도 = 「{주}」 + 아랫줄 「{억 · 부호 없음}」 · 팀 순매수 = 「{±억}」(600) + 아랫줄 「{±주}주」 · 마지막 행 「하루 합계」 |
| 10분 표 토글 | 「10분 표 보기」 |
| 10분 표 열 머리(7) | 「시각」 · 「등락 범위」 · 「거래량」 · 「팀 매수」 · 「팀 매도」 · 「팀 순매수」 · 「매수 중 팀」 |
| 10분 표 칸 | 시각 = `start` · 등락 범위 = 「{lo}~{hi}%」(소수 1자리 · 음수만 「−」) · 팀 매수/매도 = 주 · 팀 순매수 = 「{±억}」 · 매수 중 팀 = 정수 % |
| 판정 기준 토글 | 「판정 기준」 |
| 판정 기준 본문 | 아래 「판정 기준 본문」 고정 문구 |
| 판정 기준 출처 줄 | 「출처: gh-trade 팀 매집 분석 규칙」(링크 없음 · 12/400 `--muted-fg`) |

**판정 기준 본문(하드코딩 · gh-trade `team-flow.md` §3 · §4 · §5 · §10 요약 — 목록 `ul` · 12/400 `--muted-fg` · 줄높이 1.5):**

1. 팀 = 교보 · 한국 · 유진 · 신한 · NH 다섯 창구.
2. 팀 주문 = 들어와서 친 주문 중 ① 한 가격에 체결 조각이 2개 이상(자전거래방지) ② 매도 · 매수호가 0/0 조각 하나로 끝난 체결. 0/0 조각 뒤 200µs 안 같은 방향 조각은 한 주문으로 묶는다. 단일가 체결은 방향 분류에서 뺀다.
3. 구간 = 체결가의 기준가 대비 등락률(정수 경계 — 정확히 +20% 는 20~25% 에 든다). 상한가 가격 체결은 팀 매수 · 매도를 따로 보이고 순매수와 하루 합계에서 뺀다.
4. 매수 중 팀 = 그 구간(또는 10분) 매수주도 체결 중 팀 주문 비중(주 기준).
5. 거래원 = 마지막 거래원 집계 시점의 창구 누적 — 일반 고객이 섞인 창구 전체 수치다.
6. 호가에 걸어 두고 받아낸 팀 체결은 보이지 않아 팀 수치는 최소치다. KRX 정규장만 본다(넥스트레이드 제외).

### T10. 사이드바

| 요소 | 문구 |
|---|---|
| 하위 항목 | 「팀 매집」(`href="/analytics/teamflow"` · `item="teamflow"`) — 「분석」 아래 「상한가 보고서」 **다음** · 「AI 애널리스트」 앞 |

### 표시 변환 규칙 (T11 · 한 모듈 `lib/teamflow-report.ts`)

| 함수(이름 예시) | 규칙 | 예 |
|---|---|---|
| `fmtEok(won, {signed})` | 원 ÷ 1e8 → 소수 1자리 반올림(0.5 는 0 에서 먼 쪽 — 등락률과 같은 규칙 · ±0.05억 → 「+0.1억」 · 「−0.1억」 대칭, 코드 리뷰 WR-02) · `ko-KR` 그룹 구분 · 「억」 · `signed` 면 반올림 값 > 0 「+」 · < 0 「−」(U+2212) · **반올림 0.0 은 부호 없이 「0.0억」** · null/NaN 「—」 · 조 변환 없음(D-10) | `+7.0억` · `−3.1억` · `0.2억`(부호 없음 변형) · `+1,234.5억` · `0.0억` |
| `toneOf(won)` | 반올림(억 1자리) 값 기준 `up` / `down` / `flat` — 글자 색 · 막대 색이 같은 판정을 쓴다 | 0.04억 → `flat` |
| `fmtShare(share)` | 0~1 × 100 반올림 정수 「%」 · null 「—」 · `hot = share ≥ 0.30` | 0.264 → `26%` |
| `fmtRate(pct)` | 등락률 % 그대로 · 부호 + 소수 1자리 | `+22.6%` · `−1.2%` |
| `fmtQty(n, {signed})` | `ko-KR` 그룹 정수 · `signed` 면 부호 · 단위 「주」 는 호출부 | `96,289` · `+96,289` |
| `kstHm(ms)` | KST 「HH:MM」(`kstSecOf` 재사용) | `14:17` |
| `bandSlotsOf(bands)` | 9칸 고정 라벨(T4 표 순서)에 `net_val` 을 놓는다 · 없는 라벨 = null · 「하루 합계」 제외 | — |
| `bucketSlotsOf(buckets)` | `key` 54(09:00) ~ 92(15:20) → 39칸 · **`key` 93(15:30 종가 단일가)은 슬롯 38(15:20 칸)에 합산**(수량·금액 합 · `lo` min · `hi` max · `share` = 합산 `team_buy ÷ buy_aggr`, 분모 0 → null) · 그 밖의 범위 밖 `key` 는 차트에서 버린다(표에는 남는다) · 빈 칸 = null | — |
| `summaryPartsOf(line)` | `<b>…</b>` 만 `strong` 조각으로 · 그 밖 태그는 **글자째 제거** · 엔티티 5종(`&amp;` `&lt;` `&gt;` `&quot;` `&#39;`) 해제 · `dangerouslySetInnerHTML` 금지(상한가 `storyOf` parts 와 같은 결) | `"순매수 <b>+7.0억</b>"` → `[text, strong]` |
| `sortRows(rows)` | `team_net_val` 내림차순 · null 맨 뒤 · 같으면 `isin` 오름차순(안정) | — |

---

## 표면별 시각 · 상호작용 계약

### T1. 페이지 셸

- `/analytics/teamflow?d=YYYYMMDD` — `limitup-report.tsx` 와 같은 상태기계(`loading` · `error` · `gate` · `ready`) · 같은 URL 규칙: `?d` 없음 = 최신(서버가 정함 · URL 을 쓰지 않는다) · 형식 오류 = `router.replace("/analytics/teamflow")` · 날짜 이동 = `router.push`.
- 머리(제목 + 설명 + 날짜 알약)는 로딩 · 오류 중에도 그린다. 알약 ‹ › 는 마지막으로 받은 `dates[]`(행 있는 날짜만 — D-07)로 판정 → 주말 · 휴장일 · team_flow 0행 날짜를 건너뛴다.
- 세로 순서: 머리 → KPI 띠 → KPI 캡션 → 탐지 종목 카드. **상한가 보고서의 창구 지문표 · 어제 결과 표는 없다.**
- 빈 상태 판정: `dates.length === 0` → 「아직 올라온 …」 / `dates.length > 0 ∧ rows.length === 0` → 「이 날은 팀 매집 데이터가 없어요」 + 「최신 보고서 보기」(→ `dates[0]`). 빈 상자 = `CARD` · `py-12` · 가운데 정렬(`EmptyBox` 와 같은 모양 · `data-slot="teamflow-empty"`).
- 시선 앵커 = KPI 띠(유일한 20px 값 — 상속).

### T2. KPI 띠

- `dl` · 폰(< md) 2열 2줄 · md 이상 4열 · 칸 = `--card` · `--r-md` · `p-3` · 라벨 위 · 값 아래(`flex-col-reverse` — 상속).
- 4번째 칸 값만 부호 색(`toneOf`). 1~3 칸 값은 `--fg`. 값이 없는 경우는 없다(행이 있을 때만 띠를 그린다) — 합이 반올림 0 이면 「0.0억」 `--fg`.

### T3. 탐지 종목 목록

- 카드 `section`(`CARD` · `p-4` · `aria-labelledby` 소제목) → 소제목 줄 → (xl) 열 머리 → `ol` 행 목록. 행 구분 `ROW_DIVIDER`. 20행 · 50행이 넘어도 접지 않는다(페이지 스크롤 · 페이지네이션 없음).
- **아코디언(D-08):** 한 번에 하나 · **기본 전부 접힘**(`useState<string | null>(null)`) · 같은 행 다시 누름 = 접힘 · 다른 행 = 그 행만 열림 · 날짜가 바뀌면 부모가 `key=date` 로 새로 만든다(전부 접힘으로 시작). 사용자가 연 행이 위쪽 상세가 접히며 앱 머리 위로 밀려 올라가면 `scrollIntoView({block:'start'})`(reduced-motion = 즉시) — `limitup-day-grid.tsx` 와 같은 `pendingScroll` 규칙. 포커스는 행 버튼에 남는다.
- 행 버튼: `button` · `id = teamflow-row-{isin}` · `data-isin` · `aria-expanded` · 열렸을 때만 `aria-controls="tf-{isin}"` · `aria-label` · `aria-describedby="teamflow-row-desc-{isin}"`(sr-only 설명 — T3 Copywriting). 면: hover · 열림 = `color-mix(in oklab, var(--muted) 60%, transparent)` · `rounded-[var(--r)]`.
- **배치(같은 DOM · CSS 전환):**
  - `< xl` 카드형: 1줄 [종목(이름 + 코드 · 시장)] … [결과 태그] [셰브론] / 2줄 미니막대 전폭 / 3줄 메타 `flex-wrap gap-x-3`(라벨 `--muted-fg` + 값). 결과 보조줄 · 20%~상한 줄 숨김. 셰브론은 폰에서도 보인다(상한가 보고서 quick-261010-h22 규칙 — 스케치 폰의 셰브론 숨김은 따르지 않는다).
  - `xl` 7열: 종목 · 결과(태그 + 보조줄) · 팀 순매수(14/600 `mono` 부호 색) · 20% 아래/위(12 두 줄) · 매수 중 팀(14 `mono` · ≥ 30% `--team` 600) · 미니막대 · 셰브론. 메타 묶음은 xl 에서 `contents` 로 풀리고 라벨은 `xl:sr-only`.
- 결과 태그: `inline-flex h-5 rounded-full px-2 text-[11px] font-semibold whitespace-nowrap` · 상한가 = `bg-[var(--up-bg)] text-[var(--up)]` · 미도달 = `bg-[var(--muted)] text-[var(--fg-2)]` · 「상한가 HH:MM」 의 시각은 `mono`.
- 셰브론: `ChevronDown` 16px `--muted-fg` · 열림 `rotate-180` · 200ms · `motion-reduce:transition-none`.
- 열린 행 바로 아래에 상세(T5~T9)를 **열렸을 때만 마운트**한다(접으면 언마운트 → 상세 안 토글 상태도 초기화).

### T4. 미니막대(행 안)

- SVG `viewBox="0 0 178 28"` · `preserveAspectRatio="none"` · 높이 28px · 폭 100%(xl 칸 · 폰 전폭) · `aria-hidden`(값은 sr 설명에 있다) · `data-slot="teamflow-strip"`.
- 0선(가운데 y=14) `--border-subtle` 1px · 20% 점선 = 5번째 칸 앞(x = 5 × 20 − 1 = 99) `--muted-fg` `2 2` · 선은 `vector-effect="non-scaling-stroke"`.
- 칸 i: x = i × 20 · 폭 18 · 값 null = y 13.5 높이 1 `--border-subtle` / 값 있음 = 높이 `max(1.5, |v| ÷ mx × 12)` · + 는 0선 위 · − 는 아래 · 색 `toneOf`(`flat` = `--faint`). `mx = max(5천만 원, 행의 |값| 최대)`(행마다 따로 — 스케치 규칙).
- 칸마다 `<g><title>` 툴팁(T4 Copywriting). 행이 버튼이라 접근성 트리에는 sr 설명만 남는다.

### T5. 상세 — 요약

- 상세 루트 `section` · `id="tf-{isin}"` · `aria-labelledby={행 버튼 id}` · `data-slot="teamflow-detail"` · 패딩 `px-2 pt-1 pb-6` · 세로 블록 사이 16px.
- 요약 상자: `rounded-[var(--r)]` · `bg-[color-mix(in_oklab,var(--muted)_55%,transparent)]` · `px-3.5 py-3` · `break-keep`. 안: 번호 목록 `ol`(행 = `grid-cols-[20px_minmax(0,1fr)] gap-2` · 번호 원 20px `--muted` 면 11/600 `mono` · 문장 14/400 `--fg-2` · `<b>` = `strong` 600 `--fg`) → 4px → 사실 줄(12/400 `--muted-fg` · 수 `mono`).
- `summary_lines` 가 비면 번호 목록 없이 사실 줄만. 사실 줄 칸이 전부 없으면 상자 자체를 그리지 않는다.

### T6. 상세 — 구간 가로 막대 + 「구간표 보기」

- 2열 그리드의 왼쪽 칸(xl) / 첫 블록(< xl). 소제목 줄 → 8px → 차트 → 8px → 토글 → (열림) 8px → 표.
- **폭 측정:** `limitup-lane.tsx` 와 같은 `useLayoutEffect` + `ResizeObserver(clientWidth)` · 측정 전 폴백 640. SVG `viewBox="0 0 {W} {H}"` 를 **측정 폭과 1:1** 로 두고 `width="100%"` · `height={H}` — 그래서 `<text>` 가 늘어나지 않고 폰에서도 11px 이다(R-9 「글자 왜곡 금지」 를 1:1 viewBox 로 지킨다).
- 행 = `bands[]` 중 「하루 합계」 를 뺀 것(export 순서 그대로 — 위 0% 미만 → 아래 상한가 가격 · 없는 라벨은 행 없음). H = 24 + 행 수 × 28.
- 왼쪽 칸 96: 라벨 오른쪽 정렬 11/400 `--fg-2`(「상한가 가격」 만 600 `--fg`). 가운데 판: 중앙 0선 세로 `--border-subtle` · 막대 높이 16 `rx 3` · + 오른쪽 / − 왼쪽 · 폭 `max(2, |v| × sc)` · `sc = (판폭/2 − 8) ÷ max(5천만 원, |net_val| 최대)` · 색 `toneOf`. 오른쪽 칸 120: 순매수 값 11/600 부호 색 · 맨 오른쪽 매수 중 팀 % 11/400(≥ 30% `--team` 600). 20% 점선 = 「20~25%」 행 위(그 행이 첫 행이 아닐 때만) 가로 `--muted-fg` `3 3` + 라벨 「20%」 11/400 `--muted-fg`(스케치 10px → 11px). 각주 「매수 중 팀」 오른쪽 아래 11/400 `--muted-fg`.
- 행마다 `<g>` 전체 폭 투명 히트 rect + `<title>`(T5~T9 Copywriting) · hover 시 그 행 막대 `opacity .75`.
- SVG `role="img"` · `aria-label="{종목명} 등락 구간별 팀 순매수 — 20% 아래 {below20} · 20%~상한 {above20}"` · `data-slot="teamflow-band-chart"`.
- 「구간표 보기」 표: 6열 · 행 = `bands[]` 전부(「하루 합계」 포함 · 마지막 · `bg-[var(--team-bg)]` · 600) · 숫자 열 오른쪽 정렬 `mono` · 아랫줄은 12/400 `--muted-fg` 블록 · 매수 중 팀 ≥ 30% `--team` 600 · 0% `--faint` · `data-slot="teamflow-band-table"`.

### T7. 상세 — 거래원 2단 막대

- 2열 그리드의 오른쪽 칸(xl) / 둘째 블록(< xl). HTML(SVG 아님 — 스케치 `.mbr` · 상한가 `Bars` 와 같은 결).
- 행 = `members.rows[]` 를 `net` 내림차순(null 맨 뒤) · `grid-cols-[48px_minmax(0,1fr)_88px] gap-x-2` · 행 사이 8px: 이름 12/600 `--fg`(`truncate` + `title`) | 트랙 두 줄(`h-2 rounded-[4px] bg-[var(--muted)]` × 2 · 사이 4px — 위 매수 `--up` 채움 · 아래 매도 `--down` 채움 · 폭 % = 값 ÷ 이 종목 거래원 `max(buy, sell)` 최대) | 순매수 12/600 `mono` 오른쪽 정렬 부호 색. null buy/sell = 그 줄 채움 없음(트랙만).
- 아래: 「상위 5 밖: …」 12/400 `--muted-fg`(있을 때만) → 범례(매수 · 매도 10px 정사각 견본 + 글자 · 「오른쪽 = 순매수(주)」) → 참고 줄 12/400 `--muted-fg`(있을 때만).
- `members` null · 또는 `rows` · `absent` 둘 다 빔 = 소제목 줄은 그대로 · 본문 자리에 「거래원 자료 없음」 12/400 `--faint` 한 줄(`data-slot="teamflow-members-none"`). `rows` 비고 `absent` 만 있음 = 막대 없이 「상위 5 밖: …」 한 줄.
- 행 `title` 툴팁(T5~T9 Copywriting) · `data-slot="teamflow-members"`.

### T8. 상세 — 10분 흐름 차트 + 「10분 표 보기」

- 2열 그리드 아래 전폭. 폭 측정 · 1:1 viewBox 는 T6 와 같다. 높이 228 고정.
- **가로축 고정(D-13):** 39칸 = `key` 54(09:00) … 92(15:20). 칸 폭 `slot = (W − 40 − 36) ÷ 39` · 막대 폭 `max(2, slot − 2)` · 폰 본문(≈ 334~358px)에서 칸 ≈ 7px. 빈 버킷 = 아무것도 그리지 않는다(0선만) — VI · 잠김 공백이 빈자리로 보인다. **`key` 93(15:30 종가 단일가 체결)은 마지막 칸(슬롯 38 · 15:20 칸)에 합산한다(2026-10-16 사용자 결정 — D-13 보정).** 그 밖의 범위 밖 `key`(장전 · 장후 단일가 등)는 차트에서 버린다.
- 위 판(높이 128): 0선 = 판 위에서 55% 지점 `--border-subtle` · 막대 + 위 / − 아래 · `mx = max(5천만 원, |net_val| 최대)` · 최소 높이 1.5 · 색 `toneOf` · `rx 1.5`. 팀 비중 선 = `share` 0~0.60 을 판 높이에 매핑(0.60 초과는 위끝에 고정) · `--team` 2px · `stroke-linejoin round` · **빈 칸 · share null 에서 선을 끊는다**(공백을 잇지 않는다).
- 아래 판(높이 56 · 위 판과 16 간격): 등락률 범위 띠 = 칸마다 `lo`~`hi` 세로 rect `--faint` · 최소 1.5 · 축 `rlo = min(0, lo 최소)` · `rhi = max(30, hi 최대)` · 20% 점선 가로 `--muted-fg` `3 3`.
- 최대 매집 창 음영: `payload.window` 의 `start`~`end` 칸(양끝 포함)을 두 판 전체 높이로 `--team-bg` `rx 4` — **맨 아래 레이어**. window null = 음영 없음 · 캡션에서 음영 문구 빠짐.
- 첫 상한가 세로선: `first_limit_ms` 의 KST 분을 축 위 정확한 위치(`40 + (분 − 540) ÷ 10 × slot`)에 두 판 높이 `--up` 1px `2 3` 점선 + 위쪽 라벨 「첫 상한가 HH:MM」 11/600 `--up`(오른쪽 끝을 넘으면 선 왼쪽으로 붙인다). null(미도달) = 선 없음. 09:00 이전 · 15:30 이후면 축 끝에 고정.
- 축 글자 11/400: 왼쪽 「+{mx 억 1자리}」 · 「0」 · 「20%」 · 「{rhi}%」 `--muted-fg` · 오른쪽 「60%」 · 「0%」 `--team` · 아래 정시 눈금 「9시」~「15시」(칸 가운데) `--muted-fg`.
- 칸마다 `<g>`: 두 판 전체 높이 투명 히트 rect + `<title>` · hover 시 막대 `opacity .75`. 범례 = 차트 아래 8px · `flex flex-wrap gap-x-4 gap-y-1` 12/400 `--muted-fg` · 견본 10px 정사각(선은 10×2).
- SVG `role="img"` · `aria-label="{종목명} 10분 흐름 — {최대 매집 {start}~{end} {net_val} | 최대 매집 창 없음}{ · 첫 상한가 HH:MM}"` · `data-slot="teamflow-bucket-chart"`.
- **팀 체결이 거의 없는 종목(동양고속형):** 막대가 최소 높이 · 비중 선이 0% 바닥이어도 0선 · 축 · 등락률 띠 · 시각 눈금이 그대로라 차트가 비어 보이지 않는다. 별도 안내 문구를 넣지 않는다. `buckets[]` 가 아예 비면 축 · 0선만 그리고 판 가운데 11/400 `--faint` 「10분 체결 기록이 없어요」.
- 「10분 표 보기」 표: 7열 · 행 = `buckets[]` 전부(`key` 오름차순 · 범위 밖 포함) · window 칸 행은 첫 칸에 `inset 3px 0 0 var(--team)` · 매수 중 팀 ≥ 30% `--team` 600 · 0% `--faint` · 표 안 세로 스크롤 없음 · `data-slot="teamflow-bucket-table"`.

### 접힘 토글(구간표 · 10분 표 · 판정 기준 공통)

- `button type="button"` · `aria-expanded` · `aria-controls`(열렸을 때) · 최소 높이 32 · `inline-flex items-center gap-1` · `ChevronRight` 16px `aria-hidden` 열림 시 `rotate-90`(200ms · reduced-motion 이면 즉시 — `motion-reduce:transition-none`, 행 셰브론과 같은 규칙 · 아래 「접근성 계약」 움직임 줄과 일치). 글자 12/600 — 표 토글 `--accent-fg` · 판정 기준 `--fg-2`. hover = 밑줄(`hover:underline`). `<details>` 대신 버튼 — 행 아코디언과 같은 문법 · 닫힘 상태에서 표를 마운트하지 않는다.
- **세 토글 모두 기본 접힘**(D-14) · 서로 독립 · 행을 접으면 초기화.

### T9. 상세 — 판정 기준

- 상세 맨 아래(10분 블록 다음 16px). 토글 「판정 기준」 → (열림) 8px → 본문 `ul`(6항목 · `list-disc pl-4` · 항목 사이 4px) → 8px → 출처 줄. `data-slot="teamflow-rules"`.

### T10. 사이드바

- `NAV_TEAMFLOW = { href: "/analytics/teamflow", label: "팀 매집" }` · `SubNavLink item="teamflow"` · `active = pathname.startsWith(NAV_TEAMFLOW.href)`(`limitupActive` 와 같은 접두 방식) · 「분석」 하위 목록 `SUB_LIST` 안 두 번째 `li`.
- 레일(접힌 사이드바)에서는 하위 목록이 숨으므로 별도 레일 아이콘을 만들지 않는다 — 「분석」 제목 아이콘이 `/analytics` 접두로 켜진다(기존 규칙 그대로).
- 테스트 갱신 지점(플래너): `__tests__/app-sidebar.test.tsx` 링크 순서 단언 · `e2e/specs/sidebar-tree.spec.ts` 분석 하위 순서.

---

## 접근성 계약

| 대상 | 계약 | 근거 |
|---|---|---|
| 행 버튼 | `button` · `aria-expanded` · 열림 때만 `aria-controls="tf-{isin}"` · `aria-label="{종목명} {코드} — 팀 매집 상세"` · `aria-describedby` sr 설명 1문장 | `limitup-day-grid.tsx` WR-A05 와 같은 패턴(보이는 칸을 직접 잇지 않는다 — 칸 글자가 붙어 읽힌다) |
| 상세 | `section id="tf-{isin}" aria-labelledby="teamflow-row-{isin}"` | 사건 카드와 같은 패턴 |
| 데스크톱 열 머리 | `aria-hidden="true"`(장식) · 값 라벨은 `xl:sr-only` 로 남는다 | 상속 |
| 미니막대 | `aria-hidden` — 값은 행 sr 설명에 | 상속(스파크라인) |
| 구간 · 10분 차트 | `role="img"` + 요약 `aria-label` · 칸 수치는 `<title>`(마우스 툴팁) · 보조기기용 전체 수치는 접힌 표 | D-12 |
| 거래원 막대 | 행마다 이름 · 순매수가 글자로 있다 · 막대 채움은 `aria-hidden` · 행 `title` 툴팁 | — |
| 접힘 토글 | `button` · `aria-expanded` · `aria-controls` · 아이콘 `aria-hidden` | 행 아코디언과 같은 문법 |
| 색 의존 | 금액은 부호 글자 · ≥ 30% 는 굵기 · 차트 범례는 견본 + 글자 · 상한가/미도달은 태그 글자가 다르다 | — |
| 포커스 | 전역 `*:focus-visible` 이중 링 상속 · 행을 열어도 포커스는 행 버튼 · 토글을 눌러도 포커스는 토글 | — |
| 터치 | 툴팁은 마우스 전용 — 폰은 접힌 표가 수치를 맡는다(스케치 015 C 채택 이유) | — |
| 움직임 | 셰브론 · 토글 아이콘 회전만 · 차트 등장 애니메이션 없음 · reduced-motion 이면 회전 · 스크롤 보정도 즉시 | 상속 |

---

## 폭 백스톱

- **최악값 글자:** 종목명 15자(「케이비제XX호스팩」 류 · `truncate` + `title`) · 결과 태그 「상한가 15:19」 · 금액 「−1,234.5억」(KPI 합 · 20% 칸) · 거래원 이름 「신한」~「NH」(48px 칸 · 「상위 5 밖」 줄은 `break-keep` 줄바꿈).
- **폰 390(본문 ≈ 358 · 목록 카드 안 ≈ 326):** 행 1줄 종목명만 말줄임 · 태그 · 셰브론 온전 · 메타 3항목 `flex-wrap`(최대 2줄) · 미니막대 전폭 · 상세 차트 3개 1열 · 접힌 표는 표 래퍼 가로 스크롤 · **페이지 가로 스크롤 0**.
- **xl 1280(사이드바 포함 · 본문 1120 상한):** 7열 한 줄 · 「20%~상한 −1,234.5억」 이 148 칸에서 말줄임 없이 보이거나 `truncate` + `title` · 상세 2열에서 구간 차트 왼쪽 라벨 「28%~상한 미만」 이 96 칸 안(11px ≈ 80px).
- **구간 차트 최소 폭:** 판 폭(W − 216)이 80 미만이 되는 폭은 없다(< xl 1열 · 폰 W ≈ 326 → 판 110).

---

## UI Considerations

> ui-phase Step 9.5 프로브(`ui-consideration-probe.cjs` · 2026-10-16) 결과로 연구자 초안 52행을 교체했다. 표면 11개 × 적용 범주 = 83건 · 종류 확정: T1 목록+내비 · T2 목록 · T3 목록+상호작용 · T4 목록+이미지+정적 · T5 목록+정적 · T6/T8 목록+이미지+상호작용 · T7 목록+이미지+정적 · T9 목록+상호작용+정적 · T10 내비 · T11 목록+정적. 빈값 · 오류 **문구**는 `## Copywriting Contract` 가 정본이며 여기서는 상태 모양과 참조만 적는다. 기각 사유는 각 행에 있다.

Applicable state considerations resolved: 83 · resolved 62 (explicit 57 · backstop 5) · dismissed 21 · unresolved 0.

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| empty | T1 페이지 셸 | ✅ covered | 적재 이력 0 = 「아직 올라온 팀 매집 보고서가 없어요」 상자 · 행 없는 날짜(`?d=` 직접 · D-07) = 「이 날은 팀 매집 데이터가 없어요」 + 「최신 보고서 보기」 · KPI · 목록 카드 없음 |
| loading | T1 페이지 셸 | ✅ covered | 「불러오는 중…」 한 줄 · 머리 · 알약은 `?d` 로 즉시 · 알약 ‹ › 는 마지막 `dates[]` 유지(깜빡임 없음) |
| error | T1 페이지 셸 | ✅ covered | 「보고서를 불러오지 못했어요」 + 「다시 시도」(`role="alert"`) · 401/403 · `{access:false}` = `DmaGate surface="팀 매집"` 만 · 형식 오류 `?d` = 최신으로 `replace` |
| populated | T1 페이지 셸 | ✅ covered | 머리 → KPI → 캡션 → 탐지 종목 카드 · 문서 제목 「팀 매집 · MM/DD」 |
| partial | T1 페이지 셸 | ✅ covered | `?d` 가 `dates[]` 밖(행 없는 날) = 빈 상태 + 알약은 그 앞뒤 행 있는 날짜로 이동(`dateNavOf`) |
| overflow | T1 페이지 셸 | 🧪 backstop | { statement: "폰 390 · 1280 에서 머리 설명 「… · 팀 = 교보 · 한국 · 유진 · 신한 · NH」 이 break-keep 줄바꿈 · 알약 잘림 0 · 페이지 가로 스크롤 0", verification: backstop } |
| zero-one-many | T1 페이지 셸 | ✅ covered | 날짜 1개 = 알약 ‹ › 둘 다 `disabled` · 다수 = 행 있는 날짜만 오간다 |
| long-text | T1 페이지 셸 | ✅ covered | 머리 설명 · 빈/오류 제목 `break-keep` 줄바꿈 · 말줄임 없음 · 문서 제목 「팀 매집 · MM/DD」 고정 길이 |
| empty | T2 KPI | ⛔ dismissed | 사유: 행 0 인 날은 KPI 띠를 그리지 않는다 — T1 빈 상태가 맡는다(D-07) |
| loading | T2 KPI | ⛔ dismissed | 사유: KPI 는 응답과 한 번에 그린다 · 자리표시 없음 — T1 「불러오는 중…」 한 줄이 맡는다 |
| error | T2 KPI | ⛔ dismissed | 사유: 응답 실패 시 띠를 그리지 않는다 — T1 오류 상자만 |
| populated | T2 KPI | ✅ covered | 4칸 정수 · 정수 · 정수 · 부호 억 1자리(부호 색) |
| partial | T2 KPI | ✅ covered | `team_net_val` null 행은 합 · 「팀 순매수 종목」 에서 빠진다 · 합이 반올림 0 = 「0.0억」 `--fg` |
| overflow | T2 KPI | 🧪 backstop | { statement: "폰 2열에서 「팀 순매수 합」 −1,234.5억이 칸 안에서 잘림 0(값 `truncate` 는 상속 안전망)", verification: backstop } |
| zero-one-many | T2 KPI | ✅ covered | 「팀 순매수 종목」 · 「상한가 도달」 0 = 「0」 · 행 0 인 날은 띠 없음(빈 상태) |
| empty | T3 목록 | ⛔ dismissed | 사유: 행 0 은 목록 카드를 그리지 않고 T1 빈 상태가 맡는다(D-07 `rows: []`) |
| loading | T3 목록 | ⛔ dismissed | 사유: 목록은 응답과 한 번에 그린다 — 행 단위 로딩이 없다(상세 payload 도 같은 응답 · D-05) |
| error | T3 목록 | ⛔ dismissed | 사유: 행 데이터는 같은 응답 안(D-05) — 행 단위 실패 경로 없음 · 페이지 오류는 T1 |
| populated | T3 목록 | ✅ covered | `team_net_val` 내림차순 · 기본 전부 접힘 · 한 번에 하나 · xl 7열 / < xl 카드형 |
| partial | T3 목록 | ✅ covered | `name` null = 코드로 · `market` null = 코드만 · `first_limit_ms` null(상한가) = 「상한가」 · `high_rate` null = 보조줄 없음 · 값 null 칸 = 「—」 `--faint` |
| overflow | T3 목록 | ✅ covered | 50행 넘어도 접지 않는다 · 페이지 스크롤 · 행 펼침 시 점프 보정 `scrollIntoView` |
| zero-one-many | T3 목록 | ✅ covered | 1행 = 그대로(자동 펼침 없음) · 다수 = 아코디언 하나만 · 날짜 바뀌면 전부 접힘 |
| long-text | T3 목록 | 🧪 backstop | { statement: "폰 390 · xl 1280 에서 15자 종목명 + 「상한가 15:19」 태그 + 셰브론이 한 줄 · 이름만 말줄임(+ title) · 20% 칸 「20%~상한 −1,234.5억」 잘림 0 또는 truncate+title", verification: backstop } |
| empty | T4 미니막대 | ✅ covered | 9칸 전부 null = 0선 · 20% 점선 · 칸마다 1px 빈 선만 |
| loading | T4 미니막대 | ⛔ dismissed | 사유: 동기 SVG — 행과 함께 그려진다 · 측정 없음(`preserveAspectRatio="none"`) |
| error | T4 미니막대 | ⛔ dismissed | 사유: 순수 표시 — `payload.bands` 가 없으면 9칸 빈 선으로 흡수(오류 상태 없음) |
| populated | T4 미니막대 | ✅ covered | 고정 9칸 · 행별 스케일 · + 위 `--up` / − 아래 `--down` · 반올림 0 `--faint` |
| partial | T4 미니막대 | ✅ covered | `0% 미만` · `상한가 가격` 없는 종목 = 그 칸 빈 선(칸 위치는 고정) |
| overflow | T4 미니막대 | ✅ covered | viewBox `0 0 178 28` + `preserveAspectRatio="none"` 로 칸 폭에 맞춰 늘고 줄며 · 값은 행별 스케일 정규화 · 극단값도 높이 28 안 · 넘침 없음 |
| zero-one-many | T4 미니막대 | ✅ covered | 칸 수는 항상 9 고정 · 값 있는 칸 1개면 그 칸만 막대 · 나머지 빈 선 · 칸 위치 불변 |
| long-text | T4 미니막대 | ⛔ dismissed | 사유: 글자 없음 — 수치는 `<title>` 네이티브 툴팁(길이 제한 없음) |
| empty | T5 요약 | ✅ covered | `summary_lines` 빔 = 사실 줄만 · 둘 다 없음 = 상자 없음 |
| loading | T5 요약 | ⛔ dismissed | 사유: `summary_lines` 는 같은 응답 payload — 동기 렌더 |
| error | T5 요약 | ✅ covered | 허용 밖 태그 · 깨진 `<b>` = 글자로 남기지 않고 제거(텍스트만) · `innerHTML` 경로 없음 |
| populated | T5 요약 | ✅ covered | 번호 목록 + 사실 줄 · `<b>` 만 굵게 · 다른 태그는 글자째 제거 |
| partial | T5 요약 | ✅ covered | `summary_lines` 일부만 있으면 있는 것만 번호 · 사실 줄 값 null = 그 항목 「—」 · `base`/`upper` 둘 다 null = 사실 줄 생략 |
| overflow | T5 요약 | ✅ covered | 문장 수 제한 없음 — 상자 세로 늘어남 · 번호 원 20 고정 · 긴 문장은 줄바꿈(말줄임 없음) |
| zero-one-many | T5 요약 | ✅ covered | 0 = 상자 없음(empty 행) · 1 = 번호 「1」 유지 · 다수 = export 순서 |
| long-text | T5 요약 | ✅ covered | `break-keep` 줄바꿈 · 말줄임 없음 |
| empty | T6 구간 차트 | ✅ covered | bands 가 「하루 합계」 뿐 = 차트 자리에 12/400 `--faint` 「구간 체결이 없어요」 · 표 토글은 남는다 |
| loading | T6 구간 차트 | ✅ covered | 측정 전 첫 페인트는 폴백 폭 640 → 측정 즉시 다시 그린다(T8 · 레인과 같은 규칙) · 높이는 행 수로 고정이라 레이아웃 점프 없음 |
| error | T6 구간 차트 | ⛔ dismissed | 사유: 응답 안 payload 를 그대로 표로 — 추가 fetch 가 없어 실패 경로가 없다(D-05) |
| populated | T6 구간 차트 | ✅ covered | 「하루 합계」 뺀 bands 행 · 중앙 0선 · 20% 점선 · 오른쪽 값 · % · `<title>` |
| partial | T6 구간 차트 | ✅ covered | 20~25% 행이 없거나 첫 행이면 점선 없음 · 상한가 가격 행 없음 = 행 없음 |
| overflow | T6 구간 차트 | 🧪 backstop | { statement: "폰 326px · xl 반폭에서 「28%~상한 미만」 라벨 · 「−1,234.5억」 값 · % 가 96/120 칸 안에 겹침 0", verification: backstop } |
| zero-one-many | T6 구간 차트 | ✅ covered | 두 표 · 판정 기준 토글이 서로 독립 · 행 접으면 초기화 |
| long-text | T6 구간 차트 | ✅ covered | 왼쪽 라벨은 9개 고정 문자열(최장 「28%~상한 미만」) · 라벨 칸 96 고정 · 긴 글 입력 없음 — 값 폭은 overflow 백스톱이 검증 |
| empty | T7 거래원 | ✅ covered | `members` null · rows/absent 빔 = 「거래원 자료 없음」 한 줄 |
| loading | T7 거래원 | ⛔ dismissed | 사유: `members` 는 같은 응답 payload — 동기 렌더 |
| error | T7 거래원 | ⛔ dismissed | 사유: 추가 fetch 없음(D-05) — 실패 경로 없음 · null 은 empty 행 |
| populated | T7 거래원 | ✅ covered | net 내림차순 2단 막대 · 순매수 주 · 상위 5 밖 줄 · 범례 · 참고 줄 |
| partial | T7 거래원 | ✅ covered | buy 또는 sell null = 그 막대 채움 없음 · net null = 「—」 · rows 빔 + absent = 「상위 5 밖」 줄만 · top_buy/top_sell 한쪽만 = 그쪽만 |
| overflow | T7 거래원 | ✅ covered | 막대 폭은 행 안 `max(buy, sell)` 정규화 · 이름 칸 48 `truncate`+`title` · 값 칸 88 `tabular-nums` · xl 반폭에서도 `minmax(0,1fr)` 로 넘침 없음 |
| zero-one-many | T7 거래원 | ✅ covered | 1~5행 · 다섯 창구 전부 상위 5 밖이면 막대 0 · absent 줄 하나 |
| long-text | T7 거래원 | ✅ covered | 이름 `truncate` + `title` · 「상위 5 밖 · 참고」 줄 `break-keep` 줄바꿈 |
| empty | T8 10분 차트 | ✅ covered | 팀 체결 거의 없음(동양고속형) = 축 · 0선 · 등락률 띠로 차트 유지 · buckets 빔 = 축 + 「10분 체결 기록이 없어요」 |
| loading | T8 10분 차트 | ✅ covered | 측정 전 첫 페인트는 폴백 폭 640 으로 그리고 측정 즉시 다시 그린다(레인과 같은 규칙) |
| error | T8 10분 차트 | ⛔ dismissed | 사유: 응답 안 payload 를 그대로 표로 — 추가 fetch 가 없어 실패 경로가 없다(D-05) |
| populated | T8 10분 차트 | ✅ covered | 39칸 고정축 · 막대 ± · 보라 비중 선 · 등락률 띠 · 창 음영 · 첫 상한가 선 · 범례 |
| partial | T8 10분 차트 | ✅ covered | 빈 버킷 = 빈 칸(선 끊김) · window null = 음영 없음 · 미도달 = 세로선 없음 · key 93 = 슬롯 38 합산 · 그 밖 범위 밖 key = 차트 제외(표 포함) |
| overflow | T8 10분 차트 | 🧪 backstop | { statement: "폰 390 에서 39칸 칸 폭 ≈ 7px · 「첫 상한가 HH:MM」 라벨이 오른쪽 끝을 넘지 않음 · 축 글자 11px 그대로(viewBox 1:1)", verification: backstop } |
| zero-one-many | T8 10분 차트 | ✅ covered | 두 표 · 판정 기준 토글이 서로 독립 · 행 접으면 초기화 |
| long-text | T8 10분 차트 | ✅ covered | 축 글자(HH:MM · ±NN%) · 범례 「첫 상한가 HH:MM」 모두 고정 길이 — 긴 글 입력 없음 |
| empty | T9 판정 기준 | ⛔ dismissed | 사유: 고정 문구 — 데이터 의존 없음 |
| loading | T9 판정 기준 | ⛔ dismissed | 사유: 하드코딩 문구 — 데이터 없음 |
| error | T9 판정 기준 | ⛔ dismissed | 사유: 하드코딩 문구 — 실패 경로 없음 |
| populated | T9 판정 기준 | ✅ covered | 기본 접힘 · 6항목 하드코딩 + 출처 줄 |
| partial | T9 판정 기준 | ⛔ dismissed | 사유: 고정 6항목 — 부분 상태 없음 |
| overflow | T9 판정 기준 | ✅ covered | 접힘 32 · 펼치면 본문 높이만큼 · 페이지 스크롤 · 상세 안 스크롤 없음 |
| zero-one-many | T9 판정 기준 | ⛔ dismissed | 사유: 항상 6항목 + 출처 줄 |
| long-text | T9 판정 기준 | ✅ covered | 본문 12/400 `break-keep` 줄바꿈 · 출처 줄 한 줄 · 말줄임 없음 |
| loading | T10 사이드바 | ⛔ dismissed | 사유: 정적 링크 — 데이터 없음 |
| error | T10 사이드바 | ⛔ dismissed | 사유: 정적 링크 — 실패 경로 없음 |
| overflow | T10 사이드바 | ✅ covered | 「팀 매집」 4자 — 기존 「상한가 보고서」 폭 안 · 레일은 하위 숨김(기존 규칙) |
| long-text | T10 사이드바 | ✅ covered | 라벨 고정 4자 · 말줄임 규칙은 기존 사이드바 항목 상속 |
| empty | T11 변환 | ✅ covered | 빈 `bands`/`buckets`/`summary_lines` → 9칸 전부 null · 39칸 전부 null · `[]` — 예외 없음 |
| loading | T11 변환 | ✅ covered | null/NaN = 「—」 · 반올림 0 은 부호 없는 「0.0억」 · 색 `flat` |
| error | T11 변환 | ✅ covered | 순수 함수 — 모르는 band label 은 9칸 어디에도 놓지 않는다(차트 · 표에는 export 순서로 남는다) |
| populated | T11 변환 | ✅ covered | 변환 표(T11 절)의 예시 값(`+7.0억` · `−3.1억` · `0.2억` · `37%` · 슬롯 번호 · key 54~92)이 단위 테스트 골든 |
| partial | T11 변환 | ✅ covered | 일부 필드 null = 그 출력만 null/「—」 · 나머지 계산 계속(KPI 합 · 정렬은 null 제외 · 맨 뒤) |
| overflow | T11 변환 | ✅ covered | 원 단위는 Number 안전 범위 안(최대 ~9e15) · 1,000억 이상 쉼표 「+1,234.5억」 · 조 변환 없음 |
| zero-one-many | T11 변환 | ✅ covered | 정렬 동률 = `isin` 오름차순 · null 맨 뒤 |
| long-text | T11 변환 | ✅ covered | 1,000억 이상도 억 유지 + 쉼표(「+1,234.5억」) — 조 변환 없음 |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | 없음(이 phase 는 새 컴포넌트를 설치하지 않는다 · Button · Table 은 이미 설치) | not required |

제3자 레지스트리 없음 — 검사 대상 0.

---

## Claude's Discretion (이 계약이 정한 것 — 사용자 질문 0 · 바꾸고 싶으면 이 목록에서 지정)

1. **팀 색 새 토큰 `--team` · `--team-bg`** — 프로젝트에 보라 토큰이 없어 D-12 「CSS 변수 그대로」 를 지키려면 하나 추가가 불가피. TDS 공식 purple(라이트 500 · 다크 600 · 대비 AA) · `tds-tokens.test.ts` 고정. 스케치 #b48cf2 는 TDS 값이 아니라 옮기지 않는다.
2. **보라 = 「팀 비중」 한 뜻** — 스케치의 보라 팀 이름(머리 설명) · 보라 「상한가 가격」 라벨은 옮기지 않는다.
3. **KPI 라벨** 「탐지 종목」 · 「팀 순매수 종목」(값이 단위 없는 정수라 「종목」 을 붙임) · KPI 아래 고정 캡션 1줄.
4. **목록 카드 소제목** 「탐지 종목」 + 캡션 · 머리 설명에 팀 다섯 창구.
5. **빈 상태 문구** — 상한가 보고서 「21:20」 문구 변형(이력 0 · 행 없는 날짜 2종) · 「최신 보고서 보기」 재사용.
6. **폰 메타 3항목**(팀 순매수 · 20% 아래 · 매수 중 팀 — 스케치 014 A 폰 그대로) · **셰브론은 폰에서도 보인다**(상한가 보고서 quick-261010-h22 규칙이 스케치를 이긴다).
7. **상세 사실 줄**(기준가 · 상한가 · 고가 · 종가 · 거래대금)을 요약 상자 **끝**에 둔다 — 스케치 `head()` 의 머리 줄을 D-14 순서(요약 먼저)에 맞춰 옮김 · 스케치 C 전용 `headline` 은 없다.
8. **차트 글자 11px 를 위해 측정 폭 1:1 viewBox**(레인과 같은 ResizeObserver · 폴백 640) — CONTEXT 「컨테이너 폭 100% viewBox 스케일」 을 「100% 폭 + 1:1 좌표」 로 구현해 글자 왜곡을 막는다. 미니막대만 글자 없는 `preserveAspectRatio="none"`.
9. **차트 배경 상자 없음**(스케치의 어두운 `.chart` 면을 옮기지 않는다 — 다크 `--team` 글자 대비 보존 · 레인과 같은 결).
10. **반올림 0 규칙** — 「0.0억」 은 부호 없음 · 색 `flat`(막대 `--faint`) — 스케치 `tone` 의 ±0.05억 문턱과 같은 결과를 반올림 하나로.
11. **10분 금액도 억 1자리**(D-10 단일 함수) — 스케치 10분 표의 억 2자리는 따르지 않는다(작은 값은 주 단위 열이 보완).
12. **접힘 토글 = `button` + `aria-expanded`**(`<details>` 아님 · 닫히면 언마운트) · 표 토글만 accent 글자 · 판정 기준은 `--fg-2`.
13. **거래원**: net 내림차순 · 막대 폭 기준 = 그 종목 거래원 buy/sell 최대 · 참고 줄(top_buy/top_sell)은 payload 에 있어 표시 · `members.time` 을 캡션에.
14. **첫 상한가 세로선은 분 단위 정확 위치**(칸 가운데가 아니라) · 라벨이 끝을 넘으면 왼쪽으로.
15. **판정 기준 본문 6항목 문구** · 출처 줄 「출처: gh-trade 팀 매집 분석 규칙」.
16. 간격은 4 배수로 맞춤(스케치 26 · 6 · 14 · 130 · 54 등 → 28 · 8 · 16 · 128 · 56) · 상한가 보고서에서 그대로 오는 6px · 14px 는 상속 예외로 선언.
17. 함수 · 파일 · `data-slot` 이름은 예시만 적고 플래너가 정한다(DayGrid 일반화 vs 복제 · KpiStrip prop 화 vs 복제 포함).

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS (FLAG 반영 — 아래)
- [x] Dimension 5 Spacing: PASS (FLAG 반영 — 아래)
- [x] Dimension 6 Registry Safety: PASS
- [x] Dimension 7 Inventory Provenance: PASS

**Approval:** approved — gsd-ui-checker 2026-10-16 · BLOCK 0 · FLAG 3(비차단 · 반영됨)

FLAG 반영: ① Typography 페이지 합계 5 크기 · 3 굵기 상한선 문장 추가 ② Spacing 예외에 범례 견본 10px · 10분 표 창 띠 3px 추가 ③ KpiStrip · DayGrid 복제 시 치수 불변 계약 추가.
