---
phase: 08
slug: discussion-board
status: draft
shadcn_initialized: true
preset: radix-nova (manual — globals.css Toss 팔레트 override)
created: 2026-04-17
source_of_truth:
  - .planning/phases/08-discussion-board/08-CONTEXT.md (D1~D12)
  - .planning/phases/07-news-ingestion/07-UI-SPEC.md (복제 기준)
  - .planning/phases/03-design-system/03-UI-SPEC.md §4.4 (Page Back Nav)
  - webapp/src/styles/globals.css (§9 토큰)
  - webapp/components.json (shadcn preset/registries)
---

# Phase 08 — UI Design Contract

> Visual and interaction contract for Phase 8: 종목 상세 페이지 "종목토론방" 섹션 + `/stocks/[code]/discussions` 전체 페이지 + 섹션 전용 새로고침 (30초 쿨다운).
> 기반: Phase 3 디자인 시스템(globals.css `--*` 토큰), Phase 6 StockDetailClient 오케스트레이션, Phase 7 StockNewsSection/NewsRefreshButton/NewsEmptyState/NewsListSkeleton/NewsPageClient 패턴 70~80% 복제.
> 신규 토큰/색상 **추가 없음** — 기존 `--t-*` / `--s-*` / `--bg` / `--fg` / `--card` / `--muted` / `--border` / `--border-subtle` / `--primary` / `--destructive` / `--ring` 토큰만 재사용.
> 결정 소스: 08-CONTEXT.md D1~D12. 이 문서는 D5/D6/D7/D8 을 visual/interaction 계약으로 구체화한다.

**Phase 7 과의 관계:** Phase 7 에서 이미 설치된 `StockNewsSection` / `NewsRefreshButton` / `NewsEmptyState` / `NewsListSkeleton` / `NewsPageClient` + 관련 globals.css 토큰·utility 를 **기준으로 삼아** 복제. Phase 7 에서 합의된 모든 Deviation Guardrails(외부 링크 보안속성, 번호 인덱스 금지, 쿨다운 silent 규칙, 세로 스택 유지, §4.4 Back Nav 등)는 **Phase 8 에도 동일 적용**되므로 본 문서 §Deviation Guardrails 에서 재확인만 한다.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn/ui (`webapp/components.json` 기존 존재, style `radix-nova`) |
| Preset | 프로젝트 고유 Toss 팔레트 override (Phase 3 globals.css §9) — `radix-nova` 기본값 위 CSS 변수 override |
| Component library | Radix Primitives (via shadcn) |
| Icon library | `lucide-react` (`components.json:iconLibrary`) — Phase 8 신규 아이콘: `MessageSquare` (섹션 헤더 시각 앵커, D5), `MessageSquareOff` 또는 `Inbox` (빈 상태 — 실행자 재량). `RefreshCw` / `ExternalLink` 는 Phase 7 과 공통 재사용 |
| Font | `Pretendard Variable` (본문·한글) + `Geist Mono` (시간 타임스탬프 `.mono` utility) |
| New deps | **없음.** `cheerio`·`sanitize-html` 등 워커 의존성은 서버/워커 범위이며 UI 에는 영향 없음. `date-fns-tz` 도입 금지 — 기존 `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul' })` 패턴 재사용. |

---

## Spacing Scale

Declared values (multiples of 4, 기존 `--s-*` 토큰 그대로):

| Token | Value | Usage (Phase 8 범위) |
|-------|-------|----------------------|
| `--s-1` | 4px | MessageSquare 아이콘 ↔ 헤더 텍스트 간격, 외부링크 아이콘 inline gap |
| `--s-2` | 8px | 토론 항목 내부 vertical gap (제목 ↔ 본문 preview ↔ 메타), skeleton 라인 간격 |
| `--s-3` | 12px | 항목 간 divider 전후 padding, empty state 내부 vertical gap, 본문 preview ↔ 메타 row 간격 |
| `--s-4` | 16px | Discussion Card 내부 padding, 리스트 행 간 gap |
| `--s-5` | 24px | 섹션(뉴스 Card ↔ 토론방 Card) 세로 간격, `/discussions` 페이지 내부 섹션 padding |
| `--s-6` | 32px | `/discussions` 페이지 main 상하 여백, 에러 상태 컨테이너 최소 높이 |
| `--s-8` | 48px | (미사용 — reserved) |
| `--s-10` | 64px | empty state 컨테이너 min-height 확장 시 상한 |

Exceptions:
- **토론 항목 터치 타겟**: 제목 전체가 `<a>` 이므로 행 높이 **최소 56px** (WCAG 2.5.5 AA 44px 초과). 제목 1줄(20px) + body preview 2줄 clamp(약 36~40px) + `py-3` (12px × 2) = 약 80~92px 확보. 뉴스보다 행 높이가 큰 이유: 본문 preview 추가(D5).
- **섹션 전용 새로고침 버튼**: `size="sm"` (32×32 icon-only) — Card 헤더 우측 inline 배치. Phase 7 규칙 계승 — Card 헤더 영역 전용(행 밀도와 무관).
- **"더보기" 링크**: 좌우 padding 없는 text-only link, 수직 44px 터치 타겟 (line-height + 상하 `py-2`).
- **빈 상태 아이콘**: `size-10` (40px) — `--s-*` 스케일 외 아이콘 전용 크기(Phase 7 NewsEmptyState 패턴 계승). Tailwind `size-10` util 로 정렬.

---

## Typography

기존 `--t-*` 토큰만 사용 — 신규 크기 도입 없음. 사이즈 4종 + 웨이트 2종 제한.

| Role | Token | Size | Weight | Line Height | Usage (Phase 8 범위) |
|------|-------|------|--------|-------------|----------------------|
| Caption | `--t-caption` | 12px | 400 regular (기본) / 600 semibold (시각 강조) | `--lh-tight` 1.2 | 토론 항목 메타 (절대시간 `MM/DD HH:mm` KST · 작성자 닉네임 · host prefix), 더보기 링크 부수 텍스트, empty state 보조 문구 |
| Body SM | `--t-sm` | 14px | 400 regular / 600 semibold | `--lh-normal` 1.5 | 토론 항목 **제목 (2줄 clamp)**, 토론 항목 **본문 preview (2줄 clamp, regular weight)**, 빈 상태 설명, 에러 메시지, 더보기 링크, 새로고침 버튼 sr-only label |
| Body | `--t-base` | 16px | 400 regular / 600 semibold (empty state heading) | `--lh-normal` 1.5 | Empty state heading (뉴스 패턴 계승 `--t-base semibold`) |
| Heading H3 | `--t-h3` | 20px | 600 semibold | `--lh-tight` 1.2 | "종목토론방" Card 제목, `/discussions` 페이지 `<h1>` |

**Weights:** `400` regular (본문 · 본문 preview · 메타) · `600` semibold (제목 · 강조) — 두 가지만.

**Mono utility:** 절대시간 타임스탬프(`MM/DD HH:mm`, `YYYY-MM-DD HH:mm`)는 `.mono` utility 필수 — `Geist Mono` + `tabular-nums` + `ss01 slashed-zero`. 자릿수 정렬로 스캔 용이성 확보. 작성자 닉네임은 mono 아님(한글 가독성).

**한글 처리:** 토론 제목·본문 preview 모두 globals.css `html[lang="ko"] word-break: keep-all` 상속 — 단어 단위 줄바꿈. `line-clamp-2` 로 2줄 초과 시 ellipsis.

**본문 preview 특별 규칙:** `line-clamp-2` 는 2줄 초과분에 ellipsis 적용. `color: var(--muted-fg)` 로 제목(`--fg`)과 대비. `word-break: keep-all` + CSS `overflow-wrap: anywhere` 병기(`/discussions` 풀페이지에서 긴 URL 삽입 글 대비) — 실행자 재량, 기본 구현은 `line-clamp-2` 만.

---

## Color

60/30/10 split은 기존 Toss 팔레트를 그대로 승계. Phase 8 은 새 색상 도입 없음.

| Role | Token | Light | Dark | Usage (Phase 8 범위) |
|------|-------|-------|------|----------------------|
| Dominant (60%) | `--bg` | `#FFFFFF` | `oklch(0.08 0 0)` | `/discussions` 페이지 배경 (AppShell main) |
| Secondary (30%) | `--card` / `--muted` | `#FFFFFF` / `oklch(0.96 0 0)` | `oklch(0.12 0 0)` / `oklch(0.18 0 0)` | "종목토론방" Card 배경, empty state 컨테이너 배경, skeleton 배경, stale 데이터 Badge 배경 |
| Accent (10%) | `--primary` | `oklch(0.63 0.18 250)` blue | `oklch(0.72 0.16 250)` | (아래 "reserved for" 참조 — 토론 특화 축약 용도만) |
| Destructive | `--destructive` | `oklch(0.66 0.20 22)` red | `oklch(0.72 0.19 22)` | 초기 로드 실패 에러 카드 heading · 새로고침 실패 inline 알림 배경/텍스트 |
| Muted FG | `--muted-fg` | `oklch(0.50 0 0)` | `oklch(0.65 0 0)` | 토론 항목 메타(시간 · 작성자 · host), **본문 preview 텍스트**, empty state body, 쿨다운 남은 초 카운트다운, stale Badge 텍스트 |
| Border subtle | `--border-subtle` | `oklch(0.18 0 0 / 0.06)` | `oklch(1 0 0 / 0.06)` | 토론 항목 간 hairline divider |

**Accent (`--primary`) reserved-for list — Phase 8 범위:**
1. 토론 항목 **제목 `<a>` hover 색상** — default `text-[var(--fg)]`, `hover:text-[var(--primary)]` 로 링크 affordance 명시 (뉴스 패턴 동일)
2. "더보기" 링크 default 색상 — `text-[var(--primary)]` + `hover:underline` (CTA 성격)
3. 빈 상태 "새로고침" primary CTA 버튼 (`variant="default"`)
4. `/discussions` 페이지 타이틀 인라인 ← 링크 hover 색상 (03-UI-SPEC §4.4 Page Back Nav 계승)
5. Stale 상태 "다시 시도" 보조 버튼은 `variant="outline"` 기본 — hover 시 border 가 `--primary` 로 전환(기존 shadcn outline variant 동작). 직접 색상 지정 금지.

⛔ 금지: 토론 항목 row 배경·border 기본값·Card 배경·날짜/작성자/host 메타·본문 preview·새로고침 버튼(outline variant) 기본 색상에 `--primary` 사용 금지. 리스트 본문은 중립 톤 유지.

**Destructive reserved-for list — Phase 8 범위:**
1. 새로고침 `/api/stocks/:code/discussions/refresh` **5xx/프록시 실패/네트워크 실패** inline 에러 메시지 (`role="alert"`, `bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)]` + `text-[var(--destructive)]` — 뉴스 패턴 동일)
2. 초기 `/api/stocks/:code/discussions` GET 실패 시 에러 카드 heading (`text-[var(--destructive)]`) — Phase 6/7 패턴 계승

**쿨다운(429)는 destructive 아님:** 정상적 사용자 보호 흐름이므로 `text-[var(--muted-fg)]` + 카운트다운 숫자만 표시. `--destructive` 사용 금지.

**Stale Badge 는 destructive 아님:** "X분 전 데이터" 스테일 뱃지는 **muted** 톤(`bg-[var(--muted)]` + `text-[var(--muted-fg)]`). 프록시 실패는 내부 사정이지 데이터 오염이 아님 — 사용자에게 위험 신호 대신 정보 신호로 노출(D7).

**Up/Down/Flat:** Phase 8 토론 범위에서 미사용 — 토론 글은 가격 방향과 무관. Phase 9 DISC-02(센티먼트)에서 해금 예정이며 Phase 8 범위 밖.

---

## Copywriting Contract

**모든 copy 한글.** Scanner/Watchlist/News empty 톤 계승 — 존댓말, 동사 종결, 명령조 지양.

| Element | Copy |
|---------|------|
| Card 제목 (상세 페이지) | `종목토론방` |
| Card 부제(선택, 우측 메타) | `최근 24시간 · 최신 5개` (`--t-caption muted-fg` inline — 실행자 재량, 생략 허용) |
| 새로고침 버튼 aria-label (idle) | `토론방 새로고침` |
| 새로고침 버튼 aria-label (refreshing) | `토론방 새로고침 중` (`aria-busy="true"` 동반) |
| 새로고침 버튼 aria-label (cooldown) | `{N}초 후 새로고침 가능` (예: `23초 후 새로고침 가능`) |
| 새로고침 버튼 visible tooltip (cooldown) | `{N}초 후 다시 시도할 수 있어요` |
| 쿨다운 카운트다운 inline 표시 (선택) | `{N}s` (`mono text-[10px]` 버튼 내부 — NewsRefreshButton 구현 계승) |
| 초기 로드 에러 heading | `토론방을 불러올 수 없어요` |
| 초기 로드 에러 body | `잠시 후 다시 시도해주세요.` (서버 내부 사정·프록시 차단 상세 **비노출** — D7) |
| 초기 로드 에러 재시도 버튼 | `다시 시도` (Phase 6/7 공통 copy 계승) |
| 새로고침 실패 inline 알림 | `토론방을 갱신하지 못했어요. 잠시 후 다시 시도해주세요.` (`role="alert"`, 3초 후 자동 소거) |
| 쿨다운 초과(429) 서버 응답 시 | **별도 에러 메시지 표시 안 함** — 버튼 disabled + 카운트다운만(silent guard). 429 는 정상 흐름. 뉴스 패턴 동일. |
| Stale Badge copy | `{N}분 전 데이터` (예: `12분 전 데이터`) — 60분 초과 시 `{N}시간 전 데이터` (예: `2시간 전 데이터`). `--t-caption mono muted-fg` + `bg-[var(--muted)]` + `px-2 py-0.5 rounded-[var(--r-sm)]` |
| Stale 상태 재시도 버튼 | `다시 시도` (`variant="outline" size="sm"`) — Card 헤더 내 새로고침 버튼과 별도 위치(헤더 좌측 Badge 옆) 권장, 실행자 재량 |
| Empty state heading (토론 글 0건) | `아직 토론 글이 없어요` |
| Empty state body | `새로고침으로 최신 글을 가져와보세요.` |
| Empty state CTA | `토론방 새로고침` (primary variant, 쿨다운 중이면 disabled + `{N}초 후 재시도` copy 로 교체 — 뉴스 NewsEmptyState 패턴 동일) |
| 원문 링크 aria-label (항목) | `{title} 원문 보기 (새 창)` |
| "더보기" 링크 (5개 하단) | `전체 토론 보기 →` (href=`/stocks/[code]/discussions`, `--t-sm primary color`) |
| "더보기" 보조 캡션 (우측 정렬) | `최근 7일 전체` (`--t-caption muted-fg`) |
| `/discussions` 페이지 `<h1>` | `{종목명} — 최근 7일 토론` (예: `삼성전자 — 최근 7일 토론`) — 개수 상한 문구 노출 금지(하드캡 50) |
| `/discussions` 페이지 back-nav | **03-UI-SPEC §4.4 Page Back Nav 준수** — h1 왼쪽 인라인 ← 링크 (`href=/stocks/[code]`, `aria-label="종목 상세로 돌아가기"`). 별도 subtitle/breadcrumb 줄 없음. |
| `/discussions` 페이지 빈 상태 heading | `표시할 토론 글이 없어요` |
| `/discussions` 페이지 빈 상태 body | `최근 7일 내 수집된 토론 글이 없습니다. 종목 상세에서 새로고침을 실행해주세요.` |
| 날짜 포맷 (상세 Card) | `MM/DD HH:mm` (KST, Intl.DateTimeFormat — 예: `04/17 14:32`) — 연도 생략, 밀도 우선 |
| 날짜 포맷 (`/discussions` 페이지) | `YYYY-MM-DD HH:mm` (KST — 예: `2026-04-17 14:32`) — 풀포맷, 대량 스캔 용 |
| 작성자(닉네임) 표시 | 네이버 닉네임 그대로(마스킹 없음, D5) — `--t-caption muted-fg`, 단일 토큰(공백 없으면 `truncate`, 긴 닉네임은 ellipsis) |

**Destructive actions:** **없음.** 토론 글 삭제/숨김/신고/bookmark 등 모든 파괴적 조작은 범위 밖. 새로고침 실패는 정보성(inline) 메시지만.

**Empty 상태 아이콘:** `MessageSquareOff` 또는 `Inbox` (`lucide-react`) — 실행자 재량. `size-10` muted-fg 톤(뉴스 NewsEmptyState 패턴 계승).

---

## Component Inventory — Phase 8 범위

**기존 재사용 (신규 코드 없음, prop 구성만):**

| Component | Source | Phase 8 Usage |
|-----------|--------|--------------|
| `Card` | `@/components/ui/card` | "종목토론방" Card wrapper + `/discussions` 페이지 리스트 컨테이너 + empty/error 컨테이너 |
| `Button` | `@/components/ui/button` | 새로고침 버튼(`variant="outline"` icon-only + label sr-only), empty state CTA (`variant="default"`), 에러/stale 재시도 (`variant="default"`/`variant="outline"`) |
| `Skeleton` | `@/components/ui/skeleton` | 토론 리스트 로딩 (5행 — 상세) / 10행 (`/discussions` 페이지). `skeleton-list` stagger util 재사용 (globals.css §3.6) |
| `Badge` | `@/components/ui/badge` | **Stale 데이터 Badge** — `variant="secondary"` 또는 inline span 재량. "X분 전 데이터" copy. |
| `RefreshCw` icon | `lucide-react` | 새로고침 버튼 아이콘 — `isRefreshing` 시 `animate-spin` (Phase 7 `NewsRefreshButton` 동일) |
| `MessageSquare` icon | `lucide-react` (신규 도입) | 상세 Card 헤더 시각 앵커 (`size-5` aria-hidden) |
| Intl.DateTimeFormat | (runtime) | KST 포맷 — Phase 7 `format-news-date.ts` 패턴 복제하여 `format-discussion-date.ts` 생성 또는 공용화(실행자 재량) |

**신규 컴포넌트 (이 Phase 에서 생성):**

| Component | Path | 책임 |
|-----------|------|------|
| `StockDiscussionSection` | `webapp/src/components/stock/stock-discussion-section.tsx` | 상세 페이지 "종목토론방" Card. 자체 fetch/refresh/stale state 소유 — **부모(StockDetailClient)와 독립된 라이프사이클** (CONTEXT D1: 섹션별 독립 새로고침). mount 시 `fetchStockDiscussions(code, { hours: 24, limit: 5 })` 호출, 내부 `<DiscussionItem />` 5개 렌더, 하단 "전체 토론 보기 →" 링크. **복제 기준: Phase 7 `stock-news-section.tsx`** — 구조 70~80% 동일, 차이점: 아이콘(MessageSquare), copy(토론방), scope(24h/5), 추가 stale 상태 오케스트레이션(D7). |
| `DiscussionItem` | `webapp/src/components/stock/discussion-item.tsx` | 개별 토론 글 행. 제목 `<a target="_blank" rel="noopener noreferrer">` + **본문 preview (line-clamp-2 muted-fg)** + 메타(작성자 · 절대시간). 2가지 variant: `variant="card"` (상세 페이지 — 제목 위 + preview 2줄 + 메타 3열 grid: 작성자 · 시간 · hidden source), `variant="full"` (`/discussions` 페이지 — 제목 + preview + 메타 컬럼형). Phase 7 `NewsItem` 과 유사하지만 **본문 preview 2줄 추가**·**작성자 필드 추가**·**source 컬럼 제거(네이버 단일 출처)**. |
| `DiscussionRefreshButton` | `webapp/src/components/stock/discussion-refresh-button.tsx` | 쿨다운 상태 관리 — props: `onRefresh`, `isRefreshing`, `cooldownSeconds`. 내부: `RefreshCw` + 카운트다운 tick. icon-only `size="sm" variant="outline"`. **복제 기준: Phase 7 `news-refresh-button.tsx`** — aria-label copy 만 "뉴스 새로고침" → "토론방 새로고침" 교체. 공통 추상화(`RefreshButton` + prop `kind`)는 Deferred(CONTEXT "섹션 컴포넌트 공통 추상화" 항목). |
| `DiscussionEmptyState` | `webapp/src/components/stock/discussion-empty-state.tsx` | 토론 0건 empty state. `MessageSquareOff` 또는 `Inbox` 아이콘(size-10 muted-fg) + heading + body + primary "토론방 새로고침" CTA. `role="status"` (Watchlist/News empty 계승). 쿨다운 중이면 CTA disabled + 카운트다운 inline. **복제 기준: Phase 7 `news-empty-state.tsx`**. |
| `DiscussionListSkeleton` | `webapp/src/components/stock/discussion-list-skeleton.tsx` | 5행 (상세) / 10행 (`/discussions`) 분기. 각 행: **제목 라인 (`h-4 w-full`) + body preview 라인 2개(`h-3 w-11/12` + `h-3 w-2/3`) + 메타 라인(`h-3 w-32`)** + border-b. 뉴스 스켈레톤(2줄)과 달리 **4줄 구조** — 실제 행 높이(56px+) 반영. `skeleton-list` utility 로 shimmer stagger. |
| `DiscussionStaleBadge` | (선택) `webapp/src/components/stock/discussion-stale-badge.tsx` | D7 "X분 전 데이터" Badge 분리 — props: `scrapedAt: string`, `nowMs: number`. 내부에서 delta 계산 후 `"{N}분 전 데이터"` / `"{N}시간 전 데이터"` 렌더. `variant="secondary"` muted 톤. 실행자가 `StockDiscussionSection` 내부 인라인으로 작성해도 무방(분리 여부 planner 재량). |
| `DiscussionPageClient` | `webapp/src/app/stocks/[code]/discussions/page.tsx` (or split `components/stock/discussion-page-client.tsx`) | `/stocks/[code]/discussions` 엔트리. Next 15 `use(params)` 패턴 + `'use client'` (`stock-detail-client`·`NewsPageClient` 선례 계승). `<header>` (03-UI-SPEC §4.4 Back Nav) + 테이블 헤더 + `<DiscussionItem variant="full">` × N (최근 7일 · 최대 50건). **새로고침 기능 없음** — 상세 페이지에서만 노출(사용자 멘탈 모델 단순화, 뉴스 패턴 동일). **복제 기준: Phase 7 `news-page-client.tsx`**. |

**수정 컴포넌트:**

| Component | Change |
|-----------|--------|
| `stock-detail-client.tsx` | 라인 140-146 `<div className="space-y-6">` 컨테이너 **2번째 자식** `<ComingSoonCard title="종목토론방" ...>` 를 `<StockDiscussionSection stockCode={stock.code} />` 로 교체. **1번째 자식 `<StockNewsSection>` 및 컨테이너 `space-y-6` 유지 필수 — 구조 변경 금지**(CONTEXT D12). Phase 7 wave 2(07-04 merge) 완료 후에만 이 작업 진행. |

**Phase 7/Scanner/Watchlist 와의 관계:** 없음. Phase 8 은 종목 상세 하위 컨텍스트와 `/discussions` 서브 라우트만 건드림 — Scanner/Watchlist/News 회귀 가능성 0.

---

## Visual Specifications — Key Screens

### 1. 종목 상세 페이지 — "종목토론방" Card (상위 5개, 최근 24시간)

```
┌───────────────────────────────────────────────────────────┐
│  PageHeader: ← 삼성전자  005930 · KOSPI   (03-UI-SPEC §4.4) │
│  StockStatsGrid (Phase 6, 변경 없음)                         │
│                                                           │
│  ┌─ StockNewsSection Card (Phase 7, 변경 없음) ─────────┐   │
│  │ ... 뉴스 5건 + "전체 뉴스 보기 →"                     │   │
│  └───────────────────────────────────────────────────────┘   │
│     ↕  space-y-6 (24px)                                    │
│  ┌─ Card (p-4, bg-card, border) ──────────────────────┐   │
│  │ ┌─ Header (flex justify-between items-center) ──┐ │   │
│  │ │ 💬 종목토론방          (--t-h3 semibold)         │ │   │
│  │ │                            [↻ 새로고침] (sm)    │ │   │
│  │ └──────────────────────────────────────────────┘ │   │
│  │                                                   │   │
│  │ ┌─ DiscussionItem (grid rows: title / preview / meta) ─┐
│  │ │ 삼성전자 반도체 실적 기대감…  (--t-sm fg, line-clamp-2)│
│  │ │ 1분기 영업이익 시장 컨센서스 상회. 외인 순매수… (--t-sm muted-fg line-clamp-2)
│  │ │ @투자러버  ·  04/17 14:32  (caption muted-fg mono time)│
│  │ └──────────────────────────────────────────────────────┘
│  │ ──── border-t var(--border-subtle) ─────        │   │
│  │ (4 more items, min-height 56px 각 행)             │   │
│  │                                                   │   │
│  │ ──── border-t var(--border) ─────                │   │
│  │ 전체 토론 보기 →   (caption) 최근 7일 전체          │   │
│  └───────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
  (모바일 <md 세로 스택 유지)
```

**레이아웃 디테일:**
- 상위 PageHeader: **03-UI-SPEC §4.4 Page Back Nav 준수** — Phase 6/7 에서 기존 구현 존재, Phase 8 에서 변경 없음.
- 부모: `<div className="space-y-6">` (뉴스 Card ↔ 토론방 Card 24px) — **Phase 7 에서 이미 존재**, 토론방 자식만 교체.
- Card: `className="p-4"` (기존 Card 기본값)
- Header: `flex items-center justify-between gap-3 mb-4`
- Title row: `<h2 className="flex items-center gap-2 text-[length:var(--t-h3)] font-semibold text-[var(--fg)]">` + `<MessageSquare className="size-5" aria-hidden />` + "종목토론방"
- List: `<ul className="divide-y divide-[var(--border-subtle)]">` — **번호 인덱스 미사용 (Phase 7 규칙 계승)**. 자연 순서만.
- Item (상세 variant="card"): `<li className="flex flex-col gap-1 py-3 min-h-14 px-2 rounded-md hover:bg-[var(--muted)]/40 transition-colors">`
  - 제목 `<a className="line-clamp-2 text-[length:var(--t-sm)] font-medium text-[var(--fg)] hover:text-[var(--primary)]">` — `target="_blank" rel="noopener noreferrer"` 필수
  - 본문 preview `<p className="line-clamp-2 text-[length:var(--t-sm)] text-[var(--muted-fg)]">` — body 가 null/빈 문자열이면 `<p>` 자체 렌더 생략
  - 메타 row `<div className="flex items-center gap-2 text-[length:var(--t-caption)] text-[var(--muted-fg)]">` → 작성자 `<span className="truncate max-w-[40%]">` + bullet `·` + 시간 `<time className="mono" dateTime={isoPostedAt}>MM/DD HH:mm</time>`
- Footer: `<div className="mt-3 border-t border-[var(--border)] pt-3 flex items-center justify-between">` → 좌측 `<Link>` "전체 토론 보기 →" (primary), 우측 `<span>` "최근 7일 전체" (caption muted)

**Phase 7 뉴스와 시각 차이점 요약:**
| 항목 | 뉴스 (Phase 7) | 토론방 (Phase 8) |
|------|----------------|------------------|
| 행 구조 | 1줄 grid (제목/source/time) | 3줄 flex (제목/preview/meta) |
| 행 최소 높이 | 44px | 56px (+preview 36~40px) |
| 작성자 | 없음 (뉴스 source 는 출처 도메인) | @닉네임 표시 |
| source 컬럼 | 있음 (hankyung/mk 등) | **없음** (네이버 단일 출처) |
| 본문 preview | 없음 | line-clamp-2 muted |
| 아이콘 | Newspaper | MessageSquare |
| scope | 최근 7일 / 5개 (상세) · 100건 (풀) | 최근 24시간 / 5개 (상세) · 50건 하드캡 (풀) |

### 2. 토론방 전용 새로고침 버튼 (DiscussionRefreshButton)

**위치:** "종목토론방" Card 헤더 우측 (`justify-between` 의 두번째 자식). Phase 7 NewsRefreshButton 과 완전 동형 — 디자인 차이 **없음**.

**상태별 시각:**

| State | Visual | aria |
|-------|--------|------|
| Idle (enabled, no cooldown) | `<Button size="sm" variant="outline" className="size-8 p-0">` + `<RefreshCw className="size-4" aria-hidden />` | `aria-label="토론방 새로고침"` |
| Refreshing (POST in-flight) | 동일 + `<RefreshCw className="size-4 animate-spin" />` + `disabled` | `aria-busy="true"` `aria-label="토론방 새로고침 중"` |
| Cooldown (429 받은 후 또는 마지막 갱신 ≤30초) | `disabled` + 버튼 내부 `<span className="mono text-[10px]">{N}s</span>` | `aria-label="{N}초 후 새로고침 가능"` |

**쿨다운 카운트다운 구현:**
- 클라이언트: 버튼 mount 또는 refresh 성공/429 응답 시 `cooldownUntil = Date.now() + 30_000` state (Phase 7 `LOCAL_COOLDOWN_MS = 30_000` 계승)
- `setInterval(1000)` 으로 `Math.ceil((cooldownUntil - Date.now()) / 1000)` 계산
- 0 도달 시 interval clear + enabled 복귀
- **서버 응답 `retry_after_seconds` 우선 사용** — 응답에 포함되면 클라 추정 대신 그 값으로 reset (서버 기준 정합성, CONTEXT D8)

**포커스:** `focus-visible:ring-2 focus-visible:ring-[var(--ring)]` (globals.css 전역 ring 상속).

### 3. `/stocks/[code]/discussions` 전체 페이지 (최근 7일 · 하드캡 50건)

```
┌───────────────────────────────────────────────────────────┐
│  AppShell (sidebar + header 기존 유지)                       │
│  ┌─ main (p-6) ─────────────────────────────────────┐     │
│  │ PageTitle (03-UI-SPEC §4.4 Back Nav):            │     │
│  │  ← 삼성전자 — 최근 7일 토론       (h1, --t-h3)       │     │
│  │                                                   │     │
│  │ ┌─ List Container (Card, p-4) ────────────────┐ │     │
│  │ │ ┌ DiscussionItem variant="full" ──────────┐ │ │     │
│  │ │ │ 제목 line-clamp-2 fg                      │ │ │     │
│  │ │ │ 본문 preview line-clamp-2 muted-fg         │ │ │     │
│  │ │ │ @닉네임  ·  2026-04-17 14:32 (mono 풀포맷)  │ │ │     │
│  │ │ └─────────────────────────────────────────┘ │ │     │
│  │ │ ──── border-b var(--border-subtle) ────      │ │     │
│  │ │ (N more rows — 최근 7일 내 전체, 최대 50건)    │ │     │
│  │ └───────────────────────────────────────────────┘ │     │
│  └───────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────┘
```

**레이아웃 디테일:**
- `<AppShell>` 내부 (사이드바/헤더 유지)
- PageTitle: **03-UI-SPEC §4.4 Page Back Nav 준수** — 별도 breadcrumb 줄 없음. h1 왼쪽에 ← 링크 (`href="/stocks/[code]"`, `aria-label="종목 상세로 돌아가기"`).
- 제목 문구: `{종목명} — 최근 7일 토론` (상한 수치 노출하지 않음).
- List: 단일 `Card` 컨테이너. 뉴스 풀페이지의 grid 헤더(제목/출처/날짜) 는 **토론방에는 없음** — 항목이 다줄 구조라 표 형식 부적합. 대신 **상단에 caption 라벨 생략, 항목만 나열**.
- Row (variant="full"): 제목 line-clamp-2 + body preview line-clamp-2 + 메타 row(작성자 · 풀포맷 날짜). 상세 Card 와 행 구조 동일, 날짜만 `YYYY-MM-DD HH:mm` 로 확장.
- 모바일 `<640px`: 동일 flex-col 구조 (그리드 전환 불필요 — 이미 수직 스택).
- 페이지네이션 **없음**. 서버 "최근 7일 · posted_at DESC" 로 반환한 행 전체, 단 **서버 하드캡 50건** 적용(CONTEXT D6).

**50건 초과 처리:** 단순 절단. "N+" 표시·페이지네이션 모두 없음(Phase 7 풀페이지 뉴스 100건 정책과 동일 철학).

**API:** `GET /api/stocks/:code/discussions?days=7&limit=50` (상세 Card 는 `?hours=24&limit=5` 유지 — CONTEXT D9).

**404 (종목 코드 없음):** Phase 6 `not-found.tsx` 공용 — `app/stocks/[code]/discussions/not-found.tsx` 작성 생략 가능(상위 폴더 상속). 뉴스 풀페이지와 동일 정책.

**에러 (서버 5xx):** Phase 6 error.tsx 와 동일 패턴 — 인라인 에러 카드 + 재시도. 별도 `error.tsx` 파일은 실행자 재량(부모 상속으로 충분).

### 4. 빈 상태 (DiscussionEmptyState)

**상세 페이지 — 토론 0건:**
```
┌─ Card (p-4, min-h-[200px], flex-col center) ─────┐
│              💬 (MessageSquareOff/Inbox, size-10 muted-fg) │
│                                                    │
│         아직 토론 글이 없어요                         │
│         (--t-base font-semibold --fg)              │
│                                                    │
│         새로고침으로 최신 글을 가져와보세요.            │
│         (--t-sm muted-fg)                          │
│                                                    │
│              [↻ 토론방 새로고침] (primary)           │
└────────────────────────────────────────────────────┘
```

- `role="status"` (News/Watchlist empty 계승)
- 컨테이너: `<div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-6 text-center">`
- CTA Button: `variant="default"` + disabled 는 쿨다운 중 (`{N}초 후 재시도` copy 로 교체)

**`/discussions` 페이지 — 토론 0건:**
- 동일 컨테이너 + heading 교체 (`표시할 토론 글이 없어요`), body 는 context-specific copy (종목 상세로 유도)
- CTA 없음 — `/discussions` 페이지는 새로고침 기능 없음(멘탈 모델 단순화). "종목 상세로" 뒤로가기 링크가 이미 존재.

### 5. 로딩 상태 (DiscussionListSkeleton)

- 상세 Card: 5행 × (**제목 라인 `h-4 w-full` + preview 라인 1 `h-3 w-11/12` + preview 라인 2 `h-3 w-2/3` + 메타 라인 `h-3 w-32`**)
- `/discussions` 페이지: 10행 × 동일 구조
- 각 행 `py-3 border-b border-[var(--border-subtle)] last:border-0 space-y-2`
- `<div data-slot="skeleton" className="bg-[var(--muted)] animate-pulse rounded-sm">` × 4 per row
- 부모 `<ul className="skeleton-list divide-y divide-[var(--border-subtle)]">` — globals.css shimmer stagger 자동 적용
- `prefers-reduced-motion` 시 shimmer 제거 + opacity 0.7 (globals.css §3.6 media query 자동)

### 6. 에러 상태 (초기 로드 실패 — Stale 캐시 없음)

```
┌─ Card (p-4, role="alert") ───────────────────────┐
│ 토론방을 불러올 수 없어요                            │
│ (--t-h3 semibold --destructive)                   │
│                                                   │
│ 잠시 후 다시 시도해주세요.                           │
│ (--t-sm muted-fg — 서버/프록시 내부 사정 비노출)      │
│                                                   │
│ [다시 시도] (primary)                              │
└───────────────────────────────────────────────────┘
```

- 컨테이너는 Card 안에 두어 Card 헤더가 없는 상태를 구별
- `role="alert"` + `aria-live="polite"`
- 재시도 버튼 클릭 → `fetchStockDiscussions` 재호출
- **서버 응답 원문(`ApiClientError.message`) 비노출** — 뉴스와 달리 프록시/차단 실패 상세를 사용자에게 공개하지 않음(CONTEXT D7: "차단 여부·프록시 에러 내부 사정은 사용자에게 비노출"). 고정 copy "잠시 후 다시 시도해주세요." 사용.

### 7. Stale 상태 (캐시 있음 + 최근 재시도 실패 — D7)

```
┌─ Card (p-4) ────────────────────────────────────────┐
│ ┌─ Header ─────────────────────────────────────────┐│
│ │ 💬 종목토론방   [12분 전 데이터]  [↻ 다시 시도]        ││
│ │                    (badge muted)  (outline sm)    ││
│ │                              [↻ 새로고침] (sm)     ││
│ └──────────────────────────────────────────────────┘│
│ (기존 5건 리스트 그대로 노출 — stale-but-visible)     │
└──────────────────────────────────────────────────────┘
```

**Stale 트리거 조건:**
- 초기 mount fetch 결과 캐시 hit 상태(=서버가 마지막 `scrapedAt` 기준 10분 지나 스크래핑 시도했으나 프록시 실패로 인해 **오래된 DB 데이터**만 반환된 경우)
- 또는 사용자 새로고침 실패 + 기존 캐시 존재

**구현 근거 데이터:**
- 서버 응답에 `scrapedAt` 필드 포함(camelCase, CONTEXT D9)
- 클라이언트: `staleMinutes = Math.floor((Date.now() - new Date(scrapedAt).getTime()) / 60_000)`
- `staleMinutes >= 10` 이면 Badge 표시 (10분 미만이면 표시 안함 — 정상 캐시 hit)
- 60분 초과 시 "X시간 전 데이터" (`Math.floor(staleMinutes / 60)`) 로 전환

**Badge 시각:** `<Badge variant="secondary" className="mono text-[length:var(--t-caption)]">{N}분 전 데이터</Badge>` — `bg-[var(--muted)]` + `text-[var(--muted-fg)]` + `px-2 py-0.5 rounded-[var(--r-sm)]`. **destructive 금지**(데이터 위험 신호 아님).

**Badge 위치:** Card 헤더 내부, 제목 오른쪽·새로고침 버튼 왼쪽(`justify-between` 중간). 또는 **제목 하단 subtitle** 로 배치(실행자 재량 — 새로고침 버튼 위치와 충돌 시).

**"다시 시도" 보조 버튼:** Badge 바로 옆 `variant="outline" size="sm"` — 쿨다운/isRefreshing 중 disabled. 기존 헤더 새로고침 버튼과 **기능 중복이나 UX 상 시각적 명시**를 위해 병치(실행자가 새로고침 버튼으로 통합해도 무방 — CONTEXT D7 은 "재시도 버튼 노출" 만 명시, 별도/통합 재량).

### 8. 새로고침 실패 inline 알림 (캐시 있는 상태 + 실패)

- 토론 리스트 **위** 한 줄 toast 형식: `<div role="alert" className="mb-3 rounded-[var(--r-sm)] bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] px-3 py-2 text-[length:var(--t-sm)] text-[var(--destructive)]">토론방을 갱신하지 못했어요. 잠시 후 다시 시도해주세요.</div>`
- 기존 5개 리스트는 stale-but-visible 유지 (Phase 7 뉴스 inline alert 패턴 계승)
- `setTimeout(3000)` 자동 소거 + unmount 시 clear

**Stale Badge 와 병존 규칙:** 새로고침 실패 inline alert 는 **3초 toast** · Stale Badge 는 **지속 노출**. 동시 표시 가능 — 사용자에게 (a) 즉각 실패 알림과 (b) 지속적 오래된 데이터 신호를 모두 제공.

### 9. 레이아웃 변경 — Phase 7 세로 스택 컨테이너 2번째 자식 교체 (CONTEXT D12)

**Before (Phase 7 완료 시점):**
```tsx
<div className="space-y-6">
  <StockNewsSection stockCode={stock.code} />
  <ComingSoonCard title="종목토론방" body="Phase 8 로드맵에서 제공됩니다." />
</div>
```

**After (Phase 8 완료):**
```tsx
<div className="space-y-6">
  <StockNewsSection stockCode={stock.code} />
  <StockDiscussionSection stockCode={stock.code} />
</div>
```

- `space-y-6` 컨테이너 · 뉴스 Card 위치 · grid/2열 반환 **절대 금지** (CONTEXT D12)
- `<ComingSoonCard>` 호출 제거. `coming-soon-card.tsx` 파일은 **디자인 카탈로그 용도 유지** — `/design` 에서 여전히 참조될 수 있음(실행자 재량).

---

## Interaction States — Coverage Checklist

| State | StockDiscussionSection | DiscussionRefreshButton | DiscussionEmptyState | DiscussionItem | /discussions 페이지 |
|-------|------------------------|-------------------------|----------------------|----------------|----------------------|
| Default | ✓ Card + 5 items + footer link | ✓ outline enabled | ✓ (토론 0건 시 list 대체) | ✓ 제목 link + preview + 메타 | ✓ 타이틀+h1 + N items |
| Hover | ✓ 항목 제목 → `--primary` | ✓ muted bg (outline hover) | ✓ CTA hover | ✓ row bg tint + 제목 `--primary` | ✓ item hover + back-link hover |
| Focus-visible | ✓ globals 2px ring | ✓ globals 2px ring | ✓ CTA ring | ✓ link ring (2px offset globals) | ✓ back-link ring + item ring |
| Active/Pressed | — | ✓ pressed (Button CVA) | ✓ CTA pressed | — (link) | — |
| Loading (initial) | ✓ DiscussionListSkeleton 5행 (4줄 구조) | — | — | — | ✓ DiscussionListSkeleton 10행 |
| Refreshing | ✓ 기존 list stale-visible | ✓ `animate-spin` + disabled | — | — | — (새로고침 없음) |
| Cooldown | — | ✓ disabled + 카운트다운 `{N}s` | ✓ CTA disabled + `{N}초 후 재시도` | — | — |
| Empty | ✓ → DiscussionEmptyState 표시 | — (empty 내 CTA 와 병존) | ✓ 표시 | — | ✓ 다른 copy, CTA 없음 |
| **Stale (D7)** | ✓ Badge + inline 재시도 버튼 + 기존 list stale-but-visible | ✓ enabled 복귀 (쿨다운 별개) | — | — | — (서버가 stale 여부 표시하지 않음) |
| Error (initial, 캐시 없음) | ✓ 에러 Card + 재시도 (fixed copy "잠시 후 다시 시도해주세요.") | — | — | — | ✓ 에러 Card + 재시도 |
| Error (refresh, 캐시 있음) | ✓ inline alert 3s + stale list 유지 | ✓ 복귀 enabled (쿨다운 무관) | — | — | — |
| External link click | — | — | — | ✓ `target="_blank" rel="noopener noreferrer"` 새 탭 → 네이버 `nid` URL | ✓ 동일 |

---

## Accessibility Contract

- **전역 focus-ring**: `globals.css §8.5.5` double-ring 패턴 유지 (2px outline + 4px softer shadow). DiscussionItem `<a>`, 새로고침 버튼, stale 재시도 버튼, "더보기" 링크, back-nav 링크 모두 포커스 가시성 확보.
- **토론 항목 링크**: `<a href={url} target="_blank" rel="noopener noreferrer" aria-label="{title} 원문 보기 (새 창)">` — 새 창 open 명시 (WCAG G201). `url` 은 네이버 `nid` 포함 고유 URL(CONTEXT D9·D10).
- **본문 preview 접근성**: `<p>` 는 제목 `<a>` 밖 형제로 두어 스크린리더가 "제목 링크 → 본문 preview → 메타" 순서로 읽도록 한다. preview 를 링크 내부에 포함시키면 aria-label 이 과도히 길어져 **DOM 구조상 분리**.
- **새로고침 버튼**: `aria-label` 동적 전환 (idle `토론방 새로고침` / refreshing `토론방 새로고침 중` / cooldown `{N}초 후 새로고침 가능` 3종). `aria-busy={isRefreshing}`. 쿨다운 중 `disabled` + `aria-label` 로 스크린리더가 disabled 이유 알림.
- **Stale Badge**: `<Badge role="status" aria-label="{N}분 전 수집된 데이터">` — Badge 내부 텍스트(`12분 전 데이터`)는 시각 전용, aria-label 이 "수집" 명시로 의미 보강. `aria-live` 는 부여하지 않음(지속 노출이므로 반복 낭비).
- **에러 알림**: `role="alert"` + `aria-live="polite"` (초기 에러 Card · 새로고침 실패 inline 동일).
- **빈 상태**: `role="status"` — heading → body → CTA 순으로 스크린리더 읽기 (뉴스/Watchlist 계승).
- **아이콘**: `MessageSquare`/`MessageSquareOff`/`RefreshCw`/`Inbox` 등 의미 없는 시각 앵커는 `aria-hidden="true"`. CTA 버튼의 아이콘도 `aria-hidden` (label 이 이미 존재).
- **날짜**: `<time dateTime="2026-04-17T14:32:00+09:00">04/17 14:32</time>` — machine-readable ISO 병기 (뉴스 패턴 동일).
- **작성자**: 단순 `<span>` — 특별 aria 없음. `truncate max-w-[40%]` 로 긴 닉네임 절단. 네이버 익명 닉네임이라 개인정보 우려 낮음(CONTEXT "Claude's Discretion: 마스킹 여부 → 원본 권장").
- **WCAG 2.5.5 AA 터치 타겟**:
  - 토론 항목 행: `py-3` + 3줄(제목 · preview · 메타) = **56px 이상** 확보
  - 새로고침 버튼: 32×32 (Card header 전용 예외, Phase 7 동일 규칙)
  - Empty state CTA: `size="default"` (36px)
  - 더보기 링크: `py-2 inline-block` (line-height + padding = 44px)
  - 상세 페이지 종목명 왼쪽 ← / `/discussions` 페이지 h1 ← 링크: `py-2 pr-1` (line-height + padding = 44px, Phase 7 `news-page-client` 동일 구현)
  - Stale 재시도 버튼: `size="sm"` 32×32 — Card 헤더 전용, 키보드 접근 focus ring 확보
- **키보드 네비 순서** (상세 페이지 기준): StockHero ⭐ Toggle → StockStatsGrid → **News Card** (Phase 7 내부 tab order) → **Discussion Card 내부** (헤더 새로고침 → stale 재시도(있으면) → 제목 링크 1 → ... → 제목 링크 5 → 더보기 링크).
  - **DOM 순서 = 시각 순서** 원칙 준수 (뉴스 패턴 동일). `tabIndex` 조작 금지.
- **동명 스팸 노이즈**: CONTEXT D11 스팸 필터(제목 <5자 OR URL 포함) 로 걸러지지만 잔여 가능. 본문 preview 가 있어 뉴스보다 판단 근거는 많음. Phase 9 AI 요약으로 추가 완화 예정.
- **Reduced motion**: `RefreshCw` spin 과 skeleton shimmer 모두 `prefers-reduced-motion: reduce` 에서 자동 정지 (globals.css §3.6 처리).

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | `card`, `button`, `skeleton`, `badge` — 모두 **이미 설치됨** (Phase 3 `webapp/src/components/ui/`). Phase 8 신규 `npx shadcn add` **없음**. | not required (official only) |
| 3rd-party | 없음 — `webapp/components.json:registries = {}` 확인 (2026-04-17 read) | not applicable |

**registry 신규 추가 시:** Phase 8 은 기존 컴포넌트 prop 구성 + 신규 presentational 래퍼(Phase 7 복제) 생성만으로 충족 가능 — shadcn block `add` 불필요. 만약 실행 중 `tooltip` 등 정식 도입 필요 판단 시 별도 `npx shadcn add <block>` 승인 후 UI-SPEC 갱신 필수.

**워커/서버 측 신규 의존성(`cheerio`, `sanitize-html` 등):** UI 계약과 무관 — registry safety 관점 외부. 프록시 서비스(Bright Data/ScraperAPI)는 네트워크 계층이며 UI 에 노출되는 값은 최종 스크래핑 결과(title/body/author/postedAt)뿐.

---

## Deviation Guardrails (executor가 준수)

Phase 7 UI-SPEC 의 Deviation Guardrails 는 **Phase 8 에도 전부 적용**된다. 여기서는 Phase 8 특화 항목을 추가·재확인한다.

1. **신규 CSS 변수 추가 금지** — 모든 색/간격/타이포는 `globals.css §9` 기존 토큰 재사용. `--discussion-*` 등 Phase-specific 토큰 생성 금지.
2. **새 폰트/날짜 라이브러리 import 금지** — Pretendard + Geist Mono 만 사용. `date-fns-tz` 금지 — 기존 `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul' })` 패턴. 네이버 `posted_at` 파싱은 서버/워커에서 ISO 변환 완료 후 프론트에 camelCase `postedAt` ISO string 으로 전달.
3. **새 컬러 hex 하드코딩 금지** — `oklch()` 직접 서술 또는 Tailwind 기본색(`bg-blue-500`, `text-red-500`) 금지. 반드시 `var(--*)` 또는 shadcn util class (`bg-primary`, `text-destructive`) 사용. `color-mix(in oklch, var(--destructive) 10%, transparent)` 같은 **기존 토큰 기반 조합** 허용.
4. **레이아웃 2열 복원 금지** — CONTEXT D12 에 따라 뉴스/토론방 섹션은 **항상 세로 스택**. md+ 에서도 2열로 되돌리지 않는다. `space-y-6` 컨테이너 구조 수정 금지(뉴스 섹션과 토론방 섹션의 **상대 순서는 뉴스 → 토론방**, 역전 금지).
5. **"뉴스와 토론방 통합 새로고침" 구현 금지** — CONTEXT D1 "섹션별 독립 새로고침" 명시. 공통 버튼/훅으로 묶지 않기(공통 추상화는 Phase 8 완료 후 Deferred 리팩터 — CONTEXT Claude's Discretion §"섹션 컴포넌트 공통 추상화").
6. **외부 링크 보안 속성 필수** — 모든 토론 원문 `<a>` 에 `target="_blank"` + `rel="noopener noreferrer"`. `rel` 누락 시 tabnabbing 취약점.
7. **본문 preview 2줄 초과 표시 금지** — `line-clamp-2` 필수. 긴 본문은 ellipsis. CSS 로 강제(Tailwind `line-clamp-2`).
8. **제목 2줄 초과 표시 금지** — 뉴스와 동일, `line-clamp-2` 필수.
9. **번호 인덱스 컬럼 도입 금지** — 토론 리스트에 `1. 2. 3.` 등 순번 prefix 표시하지 않는다 (뉴스 규칙 계승).
10. **`/discussions` 리스트 상한 = 50건 하드캡** — 서버 `LIMIT 50` 적용. 50건 초과 시 "N+" 뱃지 등 표시 없이 단순 절단. 페이지네이션/무한스크롤 도입 금지 (CONTEXT Deferred).
11. **03-UI-SPEC §4.4 Page Back Nav 준수 필수** — `/discussions` 페이지의 back-link 는 별도 breadcrumb 줄이 아닌 타이틀 인라인 `←` 형태. `router.back()` 금지, 명시적 `href="/stocks/[code]"` 사용, `aria-label="종목 상세로 돌아가기"` 필수.
12. **쿨다운을 destructive 로 표현 금지** — 429 는 정상 흐름. `--destructive` 사용하지 않고 `--muted-fg` 카운트다운만. 에러 토스트 띄우지 않음(뉴스 패턴 계승).
13. **Stale 상태를 destructive 로 표현 금지** — "X분 전 데이터" Badge 는 muted 톤. 데이터 오염이 아닌 정보 신호(CONTEXT D7).
14. **토론 항목에 favicon / 썸네일 / 이미지 첨부 추가 금지** — 네이버 토론방 제한적 · 스크래핑 범위 밖(CONTEXT Deferred). 텍스트 only 리스트 유지.
15. **emoji 사용 금지** — MessageSquare/ExternalLink 아이콘은 `lucide-react` 사용. 본 문서의 💬 등 emoji 는 설명용 표기일 뿐, 코드에 emoji 문자열 금지.
16. **source 컬럼 추가 금지** — 토론방은 네이버 단일 출처. 뉴스의 "짧은 도메인 prefix" 컬럼 복제 금지. 출처는 상세 카드 부제(선택) / 이미 네이버 URL 에 이식됨.
17. **초기 로드 에러 원문(`ApiClientError.message`) 노출 금지** — 고정 copy "잠시 후 다시 시도해주세요." 만 사용(CONTEXT D7 "차단 여부·프록시 에러 내부 사정은 사용자에게 비노출"). 이는 뉴스와 차이 — 뉴스는 원문 노출 허용, 토론방은 프록시 우회 내부 사정 보호.
18. **작성자 닉네임 마스킹 금지 (기본값)** — 네이버 익명 닉네임이라 원본 표시(CONTEXT Claude's Discretion 권장). 향후 민원 시 재검토.
19. **스팸 필터 UI 우회 금지** — CONTEXT D11 스팸 필터(`제목 <5자 OR URL 포함`)는 **서버/워커 쿼리 단계**에서 적용. UI 에서 원본 복구 시도 금지. 원문은 DB 저장되어 있으나 노출은 필터 통과분만.
20. **공통 추상화 사전 도입 금지** — `StockNewsSection` ↔ `StockDiscussionSection` 를 묶는 공통 `SectionCard` 컴포넌트를 Phase 8 본 작업에서 **만들지 않는다**. Phase 8 완료 후 리팩터 여지로 남김(CONTEXT Deferred). 지금 추상화하면 토론 고유 요구(stale Badge / body preview / 24h scope 등)를 무리하게 흡수하여 뉴스 회귀 리스크 증가.

---

## Verification Checklist (Planner/Executor 용)

Phase 8 완료 판정은 `08-CONTEXT.md §Verification Plan` 1-14 에 종속 — UI 계약 관점 재확인:

- [ ] 상세 페이지에서 토론방 Card 가 **뉴스 Card 아래 2번째** 세로 스택 자리에 노출 (`space-y-6` 구조 유지)
- [ ] 토론 항목 5개 제목 클릭 → 새 탭 열림 + `rel="noopener noreferrer"` DevTools 확인 + URL 에 `nid` 쿼리 포함
- [ ] 토론 항목에 **제목 + 본문 preview(2줄 clamp) + 작성자 닉네임 + 시간** 모두 렌더링 확인
- [ ] 토론 Card 새로고침 버튼 클릭 → POST 호출 → 30초 쿨다운 진입 → 카운트다운 `{N}s` 노출
- [ ] 30초 이내 재클릭 → 버튼 disabled (UI 가드), 서버 `429 retry_after_seconds` 일치 확인
- [ ] 토론 0건 종목 → DiscussionEmptyState 표시 + CTA "토론방 새로고침" 동일 쿨다운 규칙 적용
- [ ] "전체 토론 보기" 클릭 → `/stocks/[code]/discussions` 이동 → 최근 7일 내 토론 전체(최대 50건)
- [ ] `/discussions` 페이지 h1 왼쪽 `←` 링크 클릭 → 상세 복귀 (03-UI-SPEC §4.4 Back Nav 규칙)
- [ ] `/discussions` 페이지에 새로고침 버튼 **없음** 확인
- [ ] 번호 인덱스 컬럼이 리스트에 나타나지 않음을 확인
- [ ] Stale 상태(>10분 데이터 + 재시도 실패) 진입 → "X분 전 데이터" Badge + 리스트 stale-but-visible 유지
- [ ] 초기 로드 실패 + 캐시 없음 → 에러 Card `role="alert"` + 재시도 버튼 + 고정 copy "잠시 후 다시 시도해주세요." (서버 원문 비노출 확인)
- [ ] 새로고침 실패(캐시 있음) → inline alert 3초 + 기존 리스트 유지
- [ ] 스팸 필터: 제목 `<5자` 또는 URL 포함 게시글 UI 미노출 확인 (DB 에는 저장)
- [ ] 모바일 `<md` 뷰포트: 세로 스택 유지, 터치 타겟 항목당 56px 이상, 새로고침 버튼 32px 예외 포커스 가시성 확보
- [ ] Dark mode: 배경/텍스트/border-subtle/stale Badge 모두 대비 WCAG AA 충족 (globals.css dark 토큰 자동)
- [ ] axe E2E: 토론 Card 0건/5개/stale/에러 각 상태 a11y 위반 0건
- [ ] Lighthouse: `/discussions` 페이지 Performance > 90, Accessibility > 95
- [ ] `prefers-reduced-motion` 설정: `RefreshCw` spin 정지 + skeleton shimmer 정지
- [ ] Phase 7 뉴스 회귀 없음: `StockNewsSection` · `/news` 페이지 동작 변경 없음 (Phase 8 은 독립 섹션 추가만)

---

## Copywriting Diff vs Phase 7 (빠른 참조표)

| Context | Phase 7 (뉴스) | Phase 8 (토론방) |
|---------|----------------|------------------|
| Card 제목 | `관련 뉴스` | `종목토론방` |
| 새로고침 aria idle | `뉴스 새로고침` | `토론방 새로고침` |
| 새로고침 aria refreshing | `뉴스 새로고침 중` | `토론방 새로고침 중` |
| 초기 로드 에러 heading | `뉴스를 불러오지 못했어요` | `토론방을 불러올 수 없어요` |
| 초기 로드 에러 body | `{ApiClientError.message}` (원문) | `잠시 후 다시 시도해주세요.` (고정, 원문 비노출) |
| 새로고침 실패 inline | `뉴스를 갱신하지 못했어요. 잠시 후 다시 시도해주세요.` | `토론방을 갱신하지 못했어요. 잠시 후 다시 시도해주세요.` |
| Empty heading | `아직 수집된 뉴스가 없어요` | `아직 토론 글이 없어요` |
| Empty body | `새로고침으로 최신 뉴스를 가져와보세요.` | `새로고침으로 최신 글을 가져와보세요.` |
| Empty CTA | `뉴스 새로고침` | `토론방 새로고침` |
| 더보기 링크 | `전체 뉴스 보기 →` | `전체 토론 보기 →` |
| 풀페이지 h1 | `{종목명} — 최근 7일 뉴스` | `{종목명} — 최근 7일 토론` |
| 풀페이지 빈 heading | `표시할 뉴스가 없어요` | `표시할 토론 글이 없어요` |
| 풀페이지 빈 body | `최근 7일 내 수집된 뉴스가 없습니다. ...` | `최근 7일 내 수집된 토론 글이 없습니다. ...` |
| Stale Badge | (뉴스는 Stale 상태 없음) | `{N}분 전 데이터` / `{N}시간 전 데이터` (신규) |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS — 모든 한글 copy 정의, 존댓말 톤 계승, 429 silent 규칙 계승, destructive actions 없음, Phase 7 대비 diff 명확, 초기 에러 원문 비노출 규칙 명시
- [ ] Dimension 2 Visuals: PASS — 기존 컴포넌트 재사용(Card/Button/Skeleton/Badge) + 신규 6종(StockDiscussionSection/DiscussionItem/DiscussionRefreshButton/DiscussionEmptyState/DiscussionListSkeleton/DiscussionPageClient, 선택 StaleBadge) scope 명확 + 레이아웃 Phase 7 `space-y-6` 2번째 자식 교체만
- [ ] Dimension 3 Color: PASS — 60/30/10 기존 Toss 팔레트 유지, primary reserved-for 5건 / destructive reserved-for 2건 / Stale Badge muted 톤 명시, 쿨다운·Stale 모두 destructive 금지
- [ ] Dimension 4 Typography: PASS — 4 사이즈 (12/14/16/20) + 2 웨이트 (400/600), `.mono` 유틸 타임스탬프 전용, 기존 토큰만, 본문 preview line-clamp-2 규칙 명시
- [ ] Dimension 5 Spacing: PASS — 8-point scale 기존 `--s-*` 토큰, 예외 4건 명시 (토론 항목 56px / 새로고침 버튼 32px / 더보기 링크 44px / empty 아이콘 40px)
- [ ] Dimension 6 Registry Safety: PASS — shadcn official only, `components.json:registries = {}` 검증 (2026-04-17), 신규 `shadcn add` 없음, 3rd-party 없음

**Approval:** pending
