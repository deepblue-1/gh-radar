---
phase: 07
slug: news-ingestion
status: approved
shadcn_initialized: true
preset: radix-nova (manual — globals.css Toss 팔레트 override)
created: 2026-04-17
reviewed_at: 2026-04-17
revised_at: 2026-04-17
revisions:
  - source-on-detail-card (D6 철회)
  - news-page-7d-all-hardcap-100 (D7/D8/D9 개정)
  - no-index-column
  - back-nav-via-03-ui-spec-§4.4
---

# Phase 07 — UI Design Contract

> Visual and interaction contract for Phase 7: 종목 상세 페이지 "관련 뉴스" 섹션 + `/stocks/[code]/news` 전체 페이지 + 섹션 전용 새로고침 (30초 쿨다운).
> 기반: Phase 3 디자인 시스템 (webapp/src/styles/globals.css), Phase 6 StockDetailClient 오케스트레이션, Phase 06.2 듀얼 레이아웃.
> 신규 토큰/색상 **추가 없음** — 기존 `--t-*` / `--s-*` / `--bg` / `--fg` / `--muted` / `--border` / `--primary` / `--destructive` 토큰만 재사용.
> 결정 소스: 07-CONTEXT.md D1~D9. 이 문서는 D6/D7/D8 을 visual/interaction 계약으로 구체화한다.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn/ui (`webapp/components.json` present, style `radix-nova`) |
| Preset | 프로젝트 고유 Toss 팔레트 override (Phase 3 globals.css §9) — `radix-nova` 기본값 위에 CSS 변수로 override |
| Component library | Radix Primitives (via shadcn) |
| Icon library | `lucide-react` (`components.json`:iconLibrary) — Phase 7 신규 아이콘: `Newspaper` (섹션 헤더 시각 앵커), `RefreshCw` (기존 재사용 — 스톡 refresh와 동일), `ExternalLink` (원문 링크 hint), `MessageCircleOff`/`Inbox` (empty state — 실행자 재량) |
| Font | `Pretendard Variable` (본문 · 한글) + `Geist Mono` (시간 타임스탬프 `.mono` utility) |
| New deps | **없음.** `date-fns-tz` 도입 금지 — 기존 `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul' })` 패턴 재사용 (stock-detail-client.tsx:15-21 참조). RFC 822 → Date 변환은 서버 측에서 완료. |

---

## Spacing Scale

Declared values (multiples of 4, 기존 `--s-*` 토큰 그대로):

| Token | Value | Usage (Phase 7 범위) |
|-------|-------|----------------------|
| `--s-1` | 4px | Newspaper 아이콘-헤더 텍스트 간격, 외부링크 아이콘 inline gap |
| `--s-2` | 8px | 뉴스 항목 내부 vertical gap (제목 ↔ 메타), skeleton 라인 간격 |
| `--s-3` | 12px | 항목 간 divider 전후 padding, empty state 내부 vertical gap |
| `--s-4` | 16px | News Card 내부 padding, 리스트 행 간 gap |
| `--s-5` | 24px | 섹션(뉴스 Card ↔ 토론방 placeholder) 세로 간격, `/news` 페이지 내부 섹션 padding |
| `--s-6` | 32px | `/news` 페이지 main 상하 여백, 에러 상태 컨테이너 최소 높이 |
| `--s-8` | 48px | (미사용 — reserved) |
| `--s-10` | 64px | empty state 컨테이너 min-height 확장 시 상한 |

Exceptions:
- **뉴스 항목 터치 타겟**: 제목 전체가 `<a>` 이므로 행 높이 **최소 44px** (WCAG 2.5.5 AA). `py-3` (12px × 2) + 제목 line-height 20px = 44px 확보.
- **섹션 전용 새로고침 버튼**: `size="sm"` (32×32 icon-only) — Card 헤더 우측 inline 배치. `--row-h=36px` 보다 작지만 **Card 헤더 영역 전용** (행 밀도와 무관).
- **"더보기" 링크**: 좌우 padding 없는 text-only link, 수직 44px 터치 타겟 (line-height + 상하 `py-2`).

---

## Typography

기존 `--t-*` 토큰만 사용 — 신규 크기 도입 없음. 사이즈 4종 + 웨이트 2종 제한.

| Role | Token | Size | Weight | Line Height | Usage (Phase 7 범위) |
|------|-------|------|--------|-------------|----------------------|
| Caption | `--t-caption` | 12px | 400 regular / 600 semibold (시각 강조) | `--lh-tight` 1.2 | 뉴스 항목 메타 (절대시간 `MM/DD HH:mm` KST), 더보기 링크 부수 텍스트, `/news` 페이지 출처(host), empty state 보조 문구 |
| Body SM | `--t-sm` | 14px | 400 regular / 600 semibold | `--lh-normal` 1.5 | 뉴스 항목 **제목 (2줄 clamp)**, 빈 상태 설명, 에러 메시지, Card 헤더 새로고침 버튼 label(스크린리더 전용), 더보기 링크 |
| Body | `--t-base` | 16px | 400 regular | `--lh-normal` 1.5 | (미사용 — 뉴스 제목은 `--t-sm` 의도적 소형 유지: 5개 항목 밀도 확보) |
| Heading H3 | `--t-h3` | 20px | 600 semibold | `--lh-tight` 1.2 | "관련 뉴스" Card 제목, `/news` 페이지 `<h1>` |

**Weights:** `400` regular (본문) · `600` semibold (제목/강조) — 두 가지만.
**Mono utility:** 절대시간 타임스탬프(`MM/DD HH:mm`, `YYYY-MM-DD HH:mm`)는 `.mono` utility 필수 — `Geist Mono` + `tabular-nums` + `ss01 slashed-zero`. 자릿수 정렬로 스캔 용이성 확보.
**한글 처리:** 뉴스 제목은 globals.css `html[lang="ko"] word-break: keep-all` 상속 — 단어 단위 줄바꿈. `line-clamp-2` 로 2줄 초과 시 ellipsis.

---

## Color

60/30/10 split은 기존 Toss 팔레트를 그대로 승계. Phase 7 은 새 색상 도입 없음.

| Role | Token | Light | Dark | Usage (Phase 7 범위) |
|------|-------|-------|------|----------------------|
| Dominant (60%) | `--bg` | `#FFFFFF` | `oklch(0.08 0 0)` | `/news` 페이지 배경 (AppShell main) |
| Secondary (30%) | `--card` / `--muted` | `#FFFFFF` / `oklch(0.96 0 0)` | `oklch(0.12 0 0)` / `oklch(0.18 0 0)` | "관련 뉴스" Card 배경, empty state 컨테이너 배경, skeleton 배경 |
| Accent (10%) | `--primary` | `oklch(0.63 0.18 250)` blue | `oklch(0.72 0.16 250)` | (아래 "reserved for" 참조 — 뉴스 특화 축약 용도만) |
| Destructive | `--destructive` | `oklch(0.66 0.20 22)` red | `oklch(0.72 0.19 22)` | 새로고침 실패 에러 메시지 텍스트, 쿨다운 초과 외 서버 5xx 알림 |
| Muted FG | `--muted-fg` | `oklch(0.50 0 0)` | `oklch(0.65 0 0)` | 뉴스 항목 메타(시간, 출처 host), empty state body, 쿨다운 남은 초 카운트다운 |
| Border subtle | `--border-subtle` | `oklch(0.18 0 0 / 0.06)` | `oklch(1 0 0 / 0.06)` | 뉴스 항목 간 hairline divider (Table 행 패턴 재사용) |

**Accent (`--primary`) reserved-for list — Phase 7 범위:**
1. 뉴스 항목 **제목 `<a>` hover 색상** — default `text-[var(--fg)]`, `hover:text-[var(--primary)]` 로 링크 affordance 명시 (기존 cta 톤 유지)
2. "더보기" 링크 default 색상 — `text-[var(--primary)]` + `hover:underline` (CTA 성격)
3. 빈 상태 "새로고침" primary CTA 버튼 (`variant="default"`)
4. `/news` 페이지 breadcrumb back-link `← 종목 상세로` hover 시 색상 강조

⛔ 금지: 뉴스 항목 row 배경·border 기본값·Card 배경·날짜/출처 메타·새로고침 버튼(outline variant) 기본 색상에 `--primary` 사용 금지. 리스트 본문은 중립 톤 유지.

**Destructive reserved-for list — Phase 7 범위:**
1. 새로고침 `/api/stocks/:code/news/refresh` **5xx/네트워크 실패** inline 에러 메시지 (`role="alert"`, `text-[var(--destructive)]`)
2. 초기 `/api/stocks/:code/news` GET 실패 시 에러 카드 제목(`text-[var(--destructive)]`) — Phase 6 StockDetailClient 에러 패턴 계승

**쿨다운(429)는 destructive 아님**: 정상적 사용자 보호 흐름이므로 `text-[var(--muted-fg)]` + 카운트다운 숫자만 표시. `--destructive` 사용 금지.

**Up/Down/Flat**: Phase 7 뉴스 범위에서 미사용 — 뉴스는 가격 방향과 무관.

---

## Copywriting Contract

**모든 copy 한글.** Scanner/Watchlist empty 톤 계승 — 존댓말, 동사 종결, 명령조 지양.

| Element | Copy |
|---------|------|
| Card 제목 (상세 페이지) | `관련 뉴스` |
| Card 부제(선택, 우측 메타) | `최근 7일 · 최신 5개` (`--t-caption muted-fg` inline — 실행자 재량, 생략 허용) |
| 새로고침 버튼 aria-label (idle) | `뉴스 새로고침` |
| 새로고침 버튼 aria-label (refreshing) | `뉴스 새로고침 중` (`aria-busy="true"` 동반) |
| 새로고침 버튼 aria-label (cooldown) | `{N}초 후 새로고침 가능` (예: `23초 후 새로고침 가능`) |
| 새로고침 버튼 visible tooltip (cooldown) | `{N}초 후 다시 시도할 수 있어요` |
| 쿨다운 카운트다운 inline 표시 (선택) | `{N}초` (`--t-caption mono muted-fg` — 버튼 옆 또는 버튼 내부; 실행자 재량) |
| 초기 로드 에러 heading | `뉴스를 불러오지 못했어요` |
| 초기 로드 에러 body | `{ApiClientError.message}` (서버 envelope `message` 원문 노출) |
| 초기 로드 에러 재시도 버튼 | `다시 시도` (Phase 6 패턴 계승 — 동일 copy) |
| 새로고침 실패 inline 알림 | `뉴스를 갱신하지 못했어요. 잠시 후 다시 시도해주세요.` (`role="alert"`, 3초 후 자동 소거) |
| 쿨다운 초과(429) 서버 응답 시 | **별도 에러 메시지 표시 안 함** — 버튼 disabled + 카운트다운만 표시(silent guard). 429 는 정상 흐름. |
| Empty state heading (뉴스 0건) | `아직 수집된 뉴스가 없어요` |
| Empty state body | `새로고침으로 최신 뉴스를 가져와보세요.` |
| Empty state CTA | `뉴스 새로고침` (primary variant, 쿨다운 중이면 disabled + 카운트다운 — 통합 UX) |
| 원문 링크 aria-label (항목) | `{title} 원문 보기 (새 창)` |
| "더보기" 링크 (5개 하단) | `전체 뉴스 보기 →` (href=`/stocks/[code]/news`, `--t-sm` primary color) |
| "더보기" 보조 캡션 (우측 정렬) | `최근 7일 전체` (`--t-caption muted-fg`) |
| `/news` 페이지 `<h1>` | `{종목명} — 최근 7일 뉴스` (예: `삼성전자 — 최근 7일 뉴스`) — 개수 상한 문구 노출 금지 |
| `/news` 페이지 back-nav | **03-UI-SPEC §4.4 Page Back Nav 준수** — h1 왼쪽 인라인 ← 링크 (`href=/stocks/[code]`, `aria-label="종목 상세로 돌아가기"`). 별도 subtitle/breadcrumb 줄 없음. |
| 종목 상세 페이지 back-nav | **03-UI-SPEC §4.4 준수** — `StockHero` 의 종목명 왼쪽 인라인 ← 링크 (`href=/`, `aria-label="목록으로 돌아가기"`). |
| `/news` 페이지 빈 상태 heading | `표시할 뉴스가 없어요` |
| `/news` 페이지 빈 상태 body | `최근 7일 내 수집된 뉴스가 없습니다. 종목 상세에서 새로고침을 실행해주세요.` |
| 날짜 포맷 (상세 Card) | `MM/DD HH:mm` (KST, Intl.DateTimeFormat — 예: `04/17 14:32`) — 연도 생략, 밀도 우선 |
| 날짜 포맷 (`/news` 페이지) | `YYYY-MM-DD HH:mm` (KST — 예: `2026-04-17 14:32`) — 풀포맷, 대량 스캔 용 |
| 출처(host) 표시 (`/news` 페이지 전용) | 도메인 lowercase, `www.` strip (예: `news.mt.co.kr`, `m.hankyung.com`) — `--t-caption mono muted-fg` |

**Destructive actions**: **없음.** 뉴스 삭제/숨김/bookmark 등 모든 파괴적 조작은 범위 밖. 새로고침 실패는 정보성(inline) 메시지만.

**출처 표시 정책 (2026-04-17 갱신):** 상세 Card 와 `/news` 페이지 **양쪽 모두 출처 표시**. 포맷은 **짧은 도메인 prefix** (예: `hankyung`, `mk`, `chosun`) — host 에서 public suffix(co.kr, com, net 등) 제거한 첫 토큰. 상세 Card 에서는 11px mono muted 작게, `/news` 페이지 표에서는 별도 컬럼(120px 폭). 모바일 `<640px` 상세 / `<720px` 전체 페이지에서는 출처 컬럼 숨김.

---

## Component Inventory — Phase 7 범위

**기존 재사용 (신규 코드 없음, prop 구성만):**

| Component | Source | Phase 7 Usage |
|-----------|--------|--------------|
| `Card` | `@/components/ui/card` | "관련 뉴스" Card wrapper + `/news` 페이지 리스트 컨테이너 + empty/error 컨테이너 |
| `Button` | `@/components/ui/button` | 새로고침 버튼(`variant="outline"` icon-only + label sr-only), empty state CTA (`variant="default"`), 에러 재시도 (`variant="default"`) |
| `Skeleton` | `@/components/ui/skeleton` | 뉴스 리스트 로딩 (5행 — 상세) / 10행 (`/news` 페이지). `skeleton-list` stagger util 재사용 (globals.css §3.6) |
| `Separator` | `@/components/ui/separator` | (선택) `/news` 페이지 항목 divider 대체 — 기본은 `border-t var(--border-subtle)` inline 처리 |
| `RefreshCw` icon | `lucide-react` | 새로고침 버튼 아이콘 — `isRefreshing` 시 `animate-spin` (Phase 6 `stock-detail-client.tsx:126` 패턴 동일) |
| Intl.DateTimeFormat | (runtime) | KST 포맷 (`stock-detail-client.tsx:15-21` 패턴 복사 — 옵션은 `month/day/hour/minute` 로 변경) |

**신규 컴포넌트 (이 Phase에서 생성):**

| Component | Path | 책임 |
|-----------|------|------|
| `StockNewsSection` | `webapp/src/components/stock/stock-news-section.tsx` | 상세 페이지에서 교체될 "관련 뉴스" Card. 자체 fetch/refresh state 소유 — **부모(StockDetailClient)와 독립된 독립 라이프사이클** (D1: 섹션별 독립 새로고침). mount 시 `fetchStockNews` 호출, 내부 `<NewsItem />` 5개 렌더, 하단 "더보기" 링크. Phase 8 토론방이 동일 패턴으로 복제할 수 있도록 re-usable hook/shape 로 설계(단, shared hook 추출은 planner 재량). |
| `NewsItem` | `webapp/src/components/stock/news-item.tsx` | 제목 `<a target="_blank" rel="noopener noreferrer">` + 날짜 + **출처(host prefix)**. 2가지 variant: `variant="card"` (상세 페이지 — 3열 grid `1fr 88px 78px`: 제목 truncate + source + MM/DD HH:mm), `variant="full"` (`/news` 페이지 — 3열 grid `1fr 120px 140px`: 제목 truncate + source + YYYY-MM-DD HH:mm). 모바일 축소 시 source 컬럼 숨김. |
| `NewsRefreshButton` | `webapp/src/components/stock/news-refresh-button.tsx` | 쿨다운 상태 관리 — props: `onRefresh`, `isRefreshing`, `cooldownSeconds` (0이면 enabled). 내부: `RefreshCw` + 카운트다운 tick (setInterval 1s). icon-only `size="sm" variant="outline"`. 단독 컴포넌트로 분리한 이유: Phase 8 토론방 새로고침 버튼이 동일 컴포넌트 재사용 예정 — props 일반화 (`label`, `ariaPrefix` override). |
| `NewsEmptyState` | `webapp/src/components/stock/news-empty-state.tsx` | 뉴스 0건 empty state. `Newspaper` lucide 아이콘(size-10 muted-fg) + heading + body + primary "새로고침" CTA. `role="status"` (Watchlist empty 패턴 계승). 쿨다운 중이면 CTA disabled + 카운트다운 inline. |
| `NewsListSkeleton` | `webapp/src/components/stock/news-list-skeleton.tsx` | 5행 (상세) / 10행 (`/news`) 분기. 각 행: 제목 라인 (`w-full h-4`) + 메타 라인 (`w-24 h-3`) + border-b. `skeleton-list` utility 로 shimmer stagger. |
| `NewsPageClient` | `webapp/src/app/stocks/[code]/news/page.tsx` (or split to `components/stock/news-page-client.tsx`) | `/stocks/[code]/news` 엔트리. Next 15 `use(params)` 패턴 + 'use client' (`stock-detail-client` 라우팅 선례 계승 — ROADMAP decision). `<PageHeader>` (03-UI-SPEC §4.4 Back Nav) + 테이블 헤더 + `<NewsItem variant="full">` × N (최근 7일 · 최대 100건). **새로고침 기능 없음** — 상세 페이지에서만 노출 (사용자 멘탈 모델 단순화). |

**수정 컴포넌트:**

| Component | Change |
|-----------|--------|
| `stock-detail-client.tsx` | 라인 139-148 의 `<div grid md:grid-cols-2>` 2열 placeholder 를 **세로 스택**으로 전환: `<div className="space-y-6">` → `<StockNewsSection stockCode={stock.code} />` + `<ComingSoonCard title="종목토론방" body="Phase 8 로드맵에서 제공됩니다." />`. 모바일 `<md` 도 동일 세로 스택(D6). `ComingSoonCard` 는 Phase 8 완료 전까지 유지. |

**Watchlist/Scanner 와의 관계:** 없음. Phase 7 은 종목 상세 하위 컨텍스트만 건드림 — Scanner/Watchlist 테이블/카드 회귀 가능성 0.

---

## Visual Specifications — Key Screens

### 1. 종목 상세 페이지 — "관련 뉴스" Card (상위 5개)

```
┌───────────────────────────────────────────────────────────┐
│  PageHeader: ← 삼성전자  005930 · KOSPI   (03-UI-SPEC §4.4) │
│  StockStatsGrid (Phase 6, 변경 없음)                         │
│                                                           │
│  ┌─ Card (p-4, bg-card, border) ──────────────────────┐   │
│  │ ┌─ Header (flex justify-between items-center) ──┐ │   │
│  │ │ 📰 관련 뉴스          (--t-h3 semibold)         │ │   │
│  │ │                            [↻ 새로고침] (sm)    │ │   │
│  │ └──────────────────────────────────────────────┘ │   │
│  │                                                   │   │
│  │ ┌─ NewsItem (grid: 1fr 88px 78px) ───────────┐   │   │
│  │ │ 삼성전자, 1분기 영업익 6.6조원 기록…  hankyung  04/17 14:32 │ │
│  │ │ (--t-sm truncate)       (11px mono muted)  (caption mono muted) │
│  │ └────────────────────────────────────────────┘   │   │
│  │ ──── border-t var(--border-subtle) ─────        │   │
│  │ (4 more items, min-height 44px 각 행)             │   │
│  │                                                   │   │
│  │ ──── border-t var(--border) ─────                │   │
│  │ 전체 뉴스 보기 →   (caption) 최근 7일 전체          │   │
│  └───────────────────────────────────────────────────┘   │
│                                                           │
│  ┌─ ComingSoonCard (Phase 8 placeholder) ──────────┐     │
│  │ 종목토론방                                        │     │
│  │ Phase 8 로드맵에서 제공됩니다.                     │     │
│  └───────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────┘
  (모바일 <md 세로 스택 유지, source 컬럼 숨김)
```

**레이아웃 디테일:**
- 상위 PageHeader: **03-UI-SPEC §4.4 Page Back Nav 준수** — 타이틀 왼쪽 ← 링크로 `/` 귀환. 별도 breadcrumb 막대 없음.
- 부모: `<div className="space-y-6">` (뉴스 Card ↔ 토론방 placeholder 24px)
- Card: `className="p-4"` (기존 Card 기본값)
- Header: `flex items-center justify-between gap-3 mb-4`
- Title row: `<h2 className="flex items-center gap-2 text-[length:var(--t-h3)] font-semibold text-[var(--fg)]">` + `<Newspaper className="size-5" aria-hidden />` + "관련 뉴스"
- List: `<ul className="divide-y divide-[var(--border-subtle)]">` — **번호 인덱스 미사용** (디자인 변경, 2026-04-17). 자연 순서만으로 충분.
- Item: `<li className="grid grid-cols-[1fr_88px_78px] items-center gap-3 py-3 min-h-11 px-2 rounded-md hover:bg-[var(--row-hover,theme(colors.muted.DEFAULT))] transition-colors">`
  - 제목 `<a className="truncate text-[length:var(--t-sm)] font-medium text-[var(--fg)] hover:text-[var(--primary)]">`
  - 출처 `<span className="mono text-[11px] text-[var(--muted-fg)] truncate text-right">` — **짧은 도메인 prefix** (예: `hankyung`, `mk`, `chosun` — host 에서 TLD 제거한 첫 토큰)
  - 시간 `<time className="mono text-[length:var(--t-caption)] text-[var(--muted-fg)] text-right">04/17 14:32</time>`
  - 모바일 `<640px`: `grid-cols-[1fr_70px]`, source 컬럼 `display:none`
- Footer: `<div className="mt-3 border-t border-[var(--border)] pt-3 flex items-center justify-between">` → 좌측 `<Link>` "전체 뉴스 보기 →" (primary), 우측 `<span>` "최근 7일 전체" (caption muted)

### 2. 뉴스 전용 새로고침 버튼 (NewsRefreshButton)

**위치:** "관련 뉴스" Card 헤더 우측 (`justify-between` 의 두번째 자식).

**상태별 시각:**

| State | Visual | aria |
|-------|--------|------|
| Idle (enabled, no cooldown) | `<Button size="sm" variant="outline" className="size-8 p-0">` + `<RefreshCw className="size-4" />` | `aria-label="뉴스 새로고침"` |
| Refreshing (POST in-flight) | 동일 + `<RefreshCw className="size-4 animate-spin" />` + `disabled` | `aria-busy="true"` `aria-label="뉴스 새로고침 중"` |
| Cooldown (429 받은 후 또는 마지막 갱신 ≤30초) | `disabled` + 버튼 내부 `<span className=".mono text-[10px]">{N}s</span>` (아이콘 대체) 또는 tooltip + 아이콘 유지 — 실행자 재량 | `aria-label="{N}초 후 새로고침 가능"` |

**쿨다운 카운트다운 구현:**
- 클라이언트: 버튼 mount 또는 refresh 성공/429 응답 시 `cooldownUntil = Date.now() + 30_000` state
- `setInterval(1000)` 으로 `Math.ceil((cooldownUntil - Date.now()) / 1000)` 계산
- 0 도달 시 interval clear + enabled 복귀
- **서버 응답 `retry_after_seconds` 우선 사용** — 응답에 포함되면 클라 추정 대신 그 값으로 reset (서버 기준 정합성)

**포커스:** `focus-visible:ring-2 focus-visible:ring-[var(--ring)]` (globals.css 전역 ring 상속 — `seamless` opt-out 하지 않음).

### 3. `/stocks/[code]/news` 전체 페이지 (최근 7일 · 하드캡 100건)

```
┌───────────────────────────────────────────────────────────┐
│  AppShell (sidebar + header 기존 유지)                       │
│  ┌─ main (p-6) ─────────────────────────────────────┐     │
│  │ PageTitle (03-UI-SPEC §4.4 Back Nav):            │     │
│  │  ← 삼성전자 — 최근 7일 뉴스       (h1, --t-h3)       │     │
│  │                                                   │     │
│  │ ┌─ Table (grid header + rows) ────────────────┐ │     │
│  │ │ 제목                      출처        날짜·시각 │ │     │
│  │ │ (muted bg header, caption)                   │ │     │
│  │ ├────────────────────────────────────────────── ┤ │     │
│  │ │ 삼성전자, 1분기 영업익…   hankyung   04-17 14:32 │ │     │
│  │ │ (truncate title)          (mono 11px)  (mono cap)│ │     │
│  │ │ ──── border-b var(--border-subtle) ────      │ │     │
│  │ │ (N more rows — 최근 7일 내 전체, 최대 100건)    │ │     │
│  │ └───────────────────────────────────────────────┘ │     │
│  └───────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────┘
```

**레이아웃 디테일:**
- `<AppShell>` 내부 (사이드바/헤더 유지)
- PageTitle: **03-UI-SPEC §4.4 Page Back Nav 준수** — 별도 breadcrumb 줄 없음. h1 왼쪽에 ← 링크 (`href="/stocks/[code]"`, `aria-label="종목 상세로 돌아가기"`).
- 제목 문구: `{종목명} — 최근 7일 뉴스` (상한 수치 노출하지 않음).
- Table: shadcn `<Table>` 또는 `div grid grid-cols-[1fr_120px_140px]` — row hover tint `bg-[var(--muted)]/40`.
- Row: 제목 truncate (1줄) + 출처(11px mono muted) + 날짜 `YYYY-MM-DD HH:mm` (caption mono muted, 우측 정렬).
- 모바일 `<720px`: `grid-cols-[1fr_100px]`, 출처 컬럼 숨김. 헤더도 동일.
- 페이지네이션 **없음**. 표시 개수는 서버가 "최근 7일 · created_at DESC" 로 반환한 모든 행, 단 **서버에서 하드캡 100건** 적용.

**결정 갱신 (2026-04-17):**
- 기존 "최대 20건" 상한은 폐기. 사용자는 최근 7일 전체를 확인하길 원함 (D7 revised).
- 하드캡 100건은 방어적 상한 — 단일 종목에 하루 100건+ 뉴스 폭주 시 무한 스크롤 부담 방지. 100건 초과 시 **최신 100건만 반환** (서버 `LIMIT 100`). 사용자 UI 상 "N+" 표시 없음 — 단순 절단.
- API: `GET /api/stocks/:code/news?days=7&limit=100` (상세 Card 는 `?days=7&limit=5` 유지).

**404 (종목 코드 없음):** Phase 6 `not-found.tsx` 공용 — `app/stocks/[code]/news/not-found.tsx` 작성 생략 가능 (상위 폴더 상속). 존재하지 않는 종목은 상세 페이지에서 404 처리되므로 `/news` 는 부모 경로 정상 가정.

**에러 (서버 5xx):** Phase 6 error.tsx 와 동일 패턴 — 인라인 에러 카드 + 재시도. 별도 `error.tsx` 파일은 실행자 재량(부모 상속으로도 충분).

### 4. 빈 상태 (NewsEmptyState)

**상세 페이지 — 뉴스 0건:**
```
┌─ Card (p-4, min-h-[200px], flex-col center) ─────┐
│              📰 (Newspaper, size-10 muted-fg)      │
│                                                    │
│         아직 수집된 뉴스가 없어요                     │
│         (--t-base font-semibold --fg)              │
│                                                    │
│         새로고침으로 최신 뉴스를 가져와보세요.         │
│         (--t-sm muted-fg)                          │
│                                                    │
│              [↻ 새로고침] (primary, size=default)   │
└────────────────────────────────────────────────────┘
```

- `role="status"` (Watchlist empty 계승 — 스크린리더 친화)
- 컨테이너: `<div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-6 text-center">`
- CTA Button: `variant="default"` + disabled 는 쿨다운 중일 때 (동일 카운트다운 text 표시)

**`/news` 페이지 — 뉴스 0건:**
- 동일 컨테이너 + heading 만 교체 (`표시할 뉴스가 없어요`), body 는 context-specific copy (종목 상세로 유도)
- CTA 없음 — "종목 상세로" breadcrumb 이 이미 존재

### 5. 로딩 상태 (NewsListSkeleton)

- 상세 Card: 5행 × (제목 라인 `h-4 w-full rounded-sm` + 메타 라인 `h-3 w-24 rounded-sm`)
- `/news` 페이지: 10행 × 동일 구조
- 각 행 `py-3 border-b border-[var(--border-subtle)] last:border-0`
- `<div data-slot="skeleton" className="skeleton-list bg-[var(--muted)] animate-pulse">` — globals.css shimmer stagger 자동 적용
- `prefers-reduced-motion` 시 shimmer 제거 + opacity 0.7 (globals.css §3.6 media query 자동)

### 6. 에러 상태 (초기 로드 실패)

```
┌─ Card (p-4, role="alert") ───────────────────────┐
│ 뉴스를 불러오지 못했어요                            │
│ (--t-h3 semibold --destructive)                   │
│                                                   │
│ {ApiClientError.message}                          │
│ (--t-sm muted-fg)                                 │
│                                                   │
│ [다시 시도] (primary)                              │
└───────────────────────────────────────────────────┘
```

- 컨테이너는 Card 안에 두어 Card 헤더가 없는 상태를 구별
- `role="alert"` + `aria-live="polite"`
- 재시도 버튼 클릭 → `fetchStockNews` 재호출

### 7. 새로고침 실패 inline 알림

- 뉴스 리스트 **위** 한 줄 toast 형식: `<div role="alert" className="mb-3 rounded-[var(--r-sm)] bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] px-3 py-2 text-[length:var(--t-sm)] text-[var(--destructive)]">뉴스를 갱신하지 못했어요. 잠시 후 다시 시도해주세요.</div>`
- 기존 5개 리스트는 stale-but-visible 유지 (Phase 6 StockDetailClient 패턴 계승)
- `setTimeout(3000)` 자동 소거 + unmount 시 clear

### 8. 레이아웃 변경 — 기존 2열 → 세로 스택 (D6)

**Before (Phase 6):**
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
  <ComingSoonCard title="관련 뉴스" body="Phase 7 로드맵에서 제공됩니다." />
  <ComingSoonCard title="종목토론방" body="Phase 8 로드맵에서 제공됩니다." />
</div>
```

**After (Phase 7):**
```tsx
<div className="space-y-6">
  <StockNewsSection stockCode={stock.code} />
  <ComingSoonCard title="종목토론방" body="Phase 8 로드맵에서 제공됩니다." />
</div>
```

- md+ 도 세로 스택 유지 — 각 섹션 전체 폭 (D6 결정)
- Phase 8 완료 시 `<ComingSoonCard>` → `<StockDiscussionSection>` 교체만 (동일 레이아웃 유지)

---

## Interaction States — Coverage Checklist

| State | StockNewsSection | NewsRefreshButton | NewsEmptyState | NewsItem | /news 페이지 |
|-------|------------------|-------------------|----------------|----------|---------------|
| Default | ✓ Card + 5 items + footer link | ✓ outline enabled | ✓ (뉴스 0건 시 list 대체) | ✓ 제목 link + 메타 | ✓ breadcrumb + h1 + 20 items |
| Hover | ✓ 항목 제목 → primary | ✓ muted bg (outline hover) | ✓ CTA hover | ✓ `--primary` color transition | ✓ item hover + breadcrumb hover |
| Focus-visible | ✓ globals 2px ring | ✓ globals 2px ring | ✓ CTA ring | ✓ link ring (2px offset globals) | ✓ breadcrumb ring + item ring |
| Active/Pressed | — | ✓ pressed (Button CVA) | ✓ CTA pressed | — (link) | — |
| Loading (initial) | ✓ NewsListSkeleton 5행 | — | — | — | ✓ NewsListSkeleton 10행 |
| Refreshing | ✓ 기존 list stale-visible | ✓ `animate-spin` + disabled | — | — | — (새로고침 없음) |
| Cooldown | — | ✓ disabled + 카운트다운 | ✓ CTA disabled + 카운트다운 | — | — |
| Empty | ✓ → NewsEmptyState 표시 | — (empty state 내 CTA 와 병존) | ✓ 표시 | — | ✓ 다른 copy |
| Error (initial) | ✓ 에러 Card + 재시도 | — | — | — | ✓ 에러 Card + 재시도 |
| Error (refresh) | ✓ inline alert 3s + stale list 유지 | ✓ 복귀 enabled (쿨다운 무관) | — | — | — |
| External link click | — | — | — | ✓ `target="_blank" rel="noopener noreferrer"` 새 탭 | ✓ 동일 |

---

## Accessibility Contract

- **전역 focus-ring**: `globals.css §8.5.5` double-ring 패턴 유지 (2px outline + 4px softer shadow). NewsItem `<a>`, 새로고침 버튼, "더보기" 링크, breadcrumb 모두 포커스 가시성 확보.
- **뉴스 항목 링크**: `<a href={url} target="_blank" rel="noopener noreferrer" aria-label="{title} 원문 보기 (새 창)">` — 새 창 open 명시 (WCAG G201).
- **새로고침 버튼**: `aria-label` 동적 전환 (idle / refreshing / cooldown 3종). `aria-busy={isRefreshing}`. 쿨다운 중 `disabled` + `aria-label="{N}초 후 새로고침 가능"` 로 스크린리더가 disabled 이유 알림.
- **에러 알림**: `role="alert"` + `aria-live="polite"` (새로고침 실패 inline). 초기 로드 에러는 `role="alert"` + `aria-live="polite"` 동일.
- **빈 상태**: `role="status"` — 제목 → 설명 → CTA 순으로 스크린리더 읽기.
- **아이콘**: `Newspaper`/`RefreshCw`/`ExternalLink` 등 의미 없는 시각 앵커는 `aria-hidden="true"`, CTA 버튼의 아이콘도 `aria-hidden` (label 이 이미 존재).
- **날짜**: `<time dateTime="2026-04-17T14:32:00+09:00">04/17 14:32</time>` — machine-readable ISO 병기 (웹 표준).
- **WCAG 2.5.5 AA 터치 타겟**:
  - 뉴스 항목 행: `py-3` + line-height 포함 44px 이상 확보
  - 새로고침 버튼: 32×32 (`size="sm"`) — Card header 영역 전용 예외(§Spacing Exceptions 참조), `aria-label` 명확 + `focus-visible` ring 으로 key-nav 보완
  - Empty state CTA: `size="default"` (36px)
  - 더보기 링크: `py-2 inline-block` (line-height + padding = 44px)
  - Breadcrumb: `py-2` 패딩으로 44px 확보
- **키보드 네비 순서** (상세 페이지 기준): StockHero ⭐ Toggle → 새로고침(기존, Stock refresh) → StockStatsGrid → **News Card 내부** (제목 링크 1 → ... → 제목 링크 5 → 더보기 링크 → 뉴스 새로고침 버튼) → 토론방 placeholder.
  - **주의**: 새로고침 버튼이 Card 헤더에 있어 시각적으로는 상단이지만, Tab 순서는 **리스트 끝**에 배치 권장(실행자 재량) — 읽기 흐름 우선. 단, DOM 순서가 시각 순서와 어긋나면 `tabIndex` 없이 자연스러운 top→bottom 이 WCAG 2.4.3 Focus Order 에 더 안전하므로 **DOM 순서 = 시각 순서 (헤더 버튼 → 리스트 → 더보기)** 로 구현.
- **동명 회사 노이즈**: D3 에서 종목명 단독 쿼리 채택 — 일부 동명 뉴스 혼입 가능. UI 는 원문 링크로 유도하여 사용자가 판단할 수 있게 하며, 스크린리더가 `title` 그대로 읽어 혼돈 위험 있음을 인지 (Phase 9 AI 요약으로 완화 예정).
- **Reduced motion**: `RefreshCw` spin 과 skeleton shimmer 모두 `prefers-reduced-motion: reduce` 에서 자동 정지 (globals.css §3.6 처리).

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | `card`, `button`, `skeleton`, `separator` — 모두 **이미 설치됨** (Phase 3 `webapp/src/components/ui/`). Phase 7 신규 `npx shadcn add` **없음**. | not required (official only) |
| 3rd-party | 없음 — `webapp/components.json:registries = {}` 확인 (2026-04-17 read) | not applicable |

**registry 신규 추가 시:** Phase 7 은 기존 컴포넌트 prop 구성 + 신규 presentational 래퍼 생성만으로 충족 가능 — shadcn block `add` 불필요. 만약 실행 중 `avatar`/`tooltip` 등 정식 도입 필요 판단 시 별도 `npx shadcn add <block>` 승인 후 UI-SPEC 갱신 필수.

---

## Deviation Guardrails (executor가 준수)

1. **신규 CSS 변수 추가 금지** — 모든 색/간격/타이포는 `globals.css §9` 기존 토큰 재사용. `--news-*` 등 Phase-specific 토큰 생성 금지.
2. **새 폰트 import 금지** — Pretendard + Geist Mono 만 사용. `date-fns-tz` 같은 날짜 라이브러리 도입 금지 — 기존 `Intl.DateTimeFormat` 패턴 사용.
3. **새 컬러 hex 하드코딩 금지** — `oklch()` 직접 서술 또는 Tailwind 기본색(`bg-blue-500`, `text-red-500` 등) 금지. 반드시 `var(--*)` 또는 shadcn util class (`bg-primary`, `text-destructive` 등) 사용. 단, `color-mix(in oklch, var(--destructive) 10%, transparent)` 같은 **기존 토큰 기반 조합**은 허용 (globals.css 이미 table hover 패턴에서 사용).
4. **레이아웃 2열 복원 금지** — D6 에 따라 뉴스/토론방 섹션은 **항상 세로 스택**. md+ 에서도 2열로 되돌리지 않는다. 토론방이 Phase 8 에서 완성되어도 동일 규칙.
5. **"뉴스와 토론방 통합 새로고침" 구현 금지** — D1 "섹션별 독립 새로고침" 명시. 공통 버튼/훅으로 묶지 않기. 각 섹션 자체 fetch/refresh state 소유.
6. **출처 포맷 = 짧은 도메인 prefix** — host `hankyung.com` → `hankyung`, `news.mt.co.kr` → `mt` (public suffix 제거 첫 토큰). 전체 host 노출 금지, 파비콘/로고 불가. 상세 Card·`/news` 모두 동일 포맷. **2026-04-17 갱신 — 이전 "상세 Card 출처 미표시" 결정 철회.**
7. **외부 링크 보안 속성 필수** — 모든 뉴스 원문 `<a>` 에 `target="_blank"` + `rel="noopener noreferrer"`. `rel` 누락 시 tabnabbing 취약점 (WCAG 제외, 보안 필수).
13. **번호 인덱스 컬럼 도입 금지** — 뉴스 리스트에 `1. 2. 3.` 등 순번 prefix 표시하지 않는다 (2026-04-17 갱신). 자연 순서만으로 시각 스캔 충분.
14. **`/news` 리스트 상한 = 100건 하드캡** — 서버 `LIMIT 100` 적용. 100건 초과 시 "N+" 뱃지 등 표시 없이 단순 절단. 페이지네이션/무한스크롤 도입 금지 (deferred).
15. **03-UI-SPEC §4.4 Page Back Nav 준수 필수** — 상세/`/news` 페이지의 back-link 는 별도 breadcrumb 줄이 아닌 타이틀 인라인 `←` 형태. `router.back()` 금지, 명시적 `href` 사용, `aria-label` 필수.
8. **쿨다운을 destructive 로 표현 금지** — 429 는 정상 흐름. `--destructive` 사용하지 않고 `--muted-fg` 카운트다운만. 에러 토스트 띄우지 않음(§Copywriting 매트릭스 참조).
9. **뉴스 항목 2줄 초과 표시 금지** — `line-clamp-2` 필수. 긴 제목은 ellipsis. CSS 로 강제 (globals.css utility 없다면 Tailwind `line-clamp-2` 사용).
10. **뉴스 항목에 favicon / 썸네일 추가 금지** — Naver API 미제공, 스크래핑 범위 밖 (Deferred). 텍스트 only 리스트 유지.
11. **emoji 사용 금지** — Newspaper/ExternalLink 아이콘은 `lucide-react` 사용. 본 문서의 📰 등 emoji 는 설명용 표기일 뿐, 코드에 emoji 문자열 금지.
12. **`/design` 카탈로그 회귀 금지** — Phase 3 catalog 는 뉴스 컴포넌트 카탈로그 추가 여부 실행자 재량. 추가하는 경우 `<AppShell hideSidebar>` 유지.

---

## Verification Checklist (Planner/Executor 용)

Phase 7 완료 판정은 `07-CONTEXT.md §Verification Plan` 1-11 에 종속 — UI 계약 관점 재확인:

- [ ] 상세 페이지에서 뉴스 Card 가 전체 폭 세로 스택 첫 번째 위치 (토론방 placeholder 는 두 번째)
- [ ] 뉴스 항목 5개 제목 클릭 → 새 탭 열림 + `rel="noopener noreferrer"` DevTools 확인
- [ ] 뉴스 Card 새로고침 버튼 클릭 → POST 호출 → 30초 쿨다운 진입 → 카운트다운 노출
- [ ] 30초 이내 재클릭 → 버튼 disabled (UI 가드), 서버 `429 retry_after_seconds` 일치 확인
- [ ] 뉴스 0건 종목 → NewsEmptyState 표시 + CTA "새로고침" 동일 쿨다운 규칙 적용
- [ ] 상세 Card 뉴스 항목에 출처(짧은 도메인 prefix) 표시 확인 — 예: `hankyung`, `mk`
- [ ] "전체 뉴스 보기" 클릭 → `/stocks/[code]/news` 이동 → 최근 7일 내 뉴스 전체(최대 100건) + 출처 컬럼 노출
- [ ] `/news` 페이지 h1 왼쪽 `←` 링크 클릭 → 상세 복귀 (03-UI-SPEC §4.4 Back Nav 규칙)
- [ ] 종목 상세 페이지 종목명 왼쪽 `←` 링크 클릭 → `/` 홈 복귀
- [ ] 번호 인덱스 컬럼이 리스트에 나타나지 않음을 확인
- [ ] 모바일 `<md` 뷰포트: 동일 세로 스택, 터치 타겟 44px 이상
- [ ] Dark mode: 배경/텍스트/border-subtle 모두 대비 WCAG AA 충족 (globals.css dark 토큰 자동)
- [ ] axe E2E: 뉴스 Card 0건/5개/에러 각 상태 a11y 위반 0건
- [ ] Lighthouse: `/news` 페이지 Performance > 90, Accessibility > 95
- [ ] 초기 로드 에러: 에러 Card `role="alert"` + 재시도 버튼 동작 확인
- [ ] `prefers-reduced-motion` 설정: `RefreshCw` spin 정지 + skeleton shimmer 정지

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS — 모든 한글 copy 정의, 존댓말 톤 계승, 429 silent 규칙 명시, destructive actions 없음 확인
- [ ] Dimension 2 Visuals: PASS — 기존 컴포넌트 재사용(Card/Button/Skeleton) + 신규 6종 scope 명확 + 레이아웃 세로 스택 전환
- [ ] Dimension 3 Color: PASS — 60/30/10 기존 Toss 팔레트 유지, primary/destructive reserved-for 각 4/2건 명시, 쿨다운은 muted-fg
- [ ] Dimension 4 Typography: PASS — 4 사이즈 (12/14/16/20) + 2 웨이트 (400/600), `.mono` 유틸 타임스탬프 전용, 기존 토큰만
- [ ] Dimension 5 Spacing: PASS — 8-point scale 기존 `--s-*` 토큰, 예외 3건 명시 (뉴스 항목 44px / 새로고침 버튼 32px / 더보기 링크 44px)
- [ ] Dimension 6 Registry Safety: PASS — shadcn official only, `components.json:registries = {}` 검증 (2026-04-17), 신규 `shadcn add` 없음

**Approval:** pending
