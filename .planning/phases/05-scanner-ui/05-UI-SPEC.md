---
phase: 5
slug: scanner-ui
status: approved
shadcn_initialized: true
preset: inherited-from-phase-3
created: 2026-04-14
reviewed_at: 2026-04-14
---

# Phase 5 — UI Design Contract (Scanner UI)

> Phase 3 디자인 시스템을 그대로 상속받아 Scanner 화면의 시각·인터랙션 계약을 정의한다. 토큰·컴포넌트는 **재디자인 금지**, 재사용만 허용한다. CONTEXT.md D1-D5 locked decisions의 시각적 구현 세부만 여기서 확정한다.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (Phase 3 확정) |
| Preset | Phase 3 UI-SPEC (Toss 계열 oklch 팔레트, Pretendard + Geist Mono) |
| Component library | radix-ui (shadcn 래핑) |
| Icon library | lucide-react |
| Font | Pretendard Variable (본문) + Geist Mono (숫자 `.mono` utility) |

상속 원천:
- 토큰: `webapp/src/styles/globals.css`
- 컴포넌트: `webapp/src/components/ui/*`
- 레이아웃: `webapp/src/components/layout/{app-shell,app-header}.tsx` (`hideSidebar` 유지)
- 레퍼런스: `/design` 카탈로그

---

## Chosen Layout (Variant C · Plain)

6개 목업 비교(`.planning/phases/05-scanner-ui/mockups/`) 후 **Plain Variant C**로 확정. 핵심 특성:

- **Compact chip + popover 필터** — 필터를 상시 펼쳐두지 않고 헤더 인접 영역에 chip으로 축약. chip 클릭 시 popover가 열려 Slider/마켓 토글을 노출한다. 리스트 영역에 최대 공간 할당.
- **담백한 헤더** — 페이지 제목과 서브텍스트는 최소화, 장식 요소(hero, stats 카드, oversized readout 등) 일절 없음. 트레이더가 리스트 정보 밀도에 집중하도록 chrome 최소화.
- **Plain 수준 스타일링** — `direction row tint`, `rank prefix`, `sidebar oversized readout` 같은 Designed 플로리시는 도입하지 않음. Phase 3 Table/Badge 기본 거동 유지.
- **타임스탬프·Refresh**는 상단 헤더 우측(또는 chip bar 우측)에 경량 배치. 필터 카드로 별도 블록 만들지 않음.

구현 레퍼런스 파일: `.planning/phases/05-scanner-ui/mockups/plain/c.html`. 실제 Next.js 구현 시 이 구조를 따르되, shadcn 컴포넌트로 re-wire 한다.

---

## Spacing Scale

Phase 3 CSS 변수 (`--s-1 ... --s-10`)를 그대로 사용한다. Tailwind v4 기본 scale과 병행.

| Token | Value | Scanner에서의 사용처 |
|-------|-------|---------------------|
| `--s-1` | 4px | 배지 내 아이콘 갭, row 내 인라인 패딩 미세조정 |
| `--s-2` | 8px | 필터 컨트롤 요소 간 간격(Slider ↔ label), 카드 내부 헤더-본문 분리 |
| `--s-3` | 12px | Table `--cell-pad-x` (셀 좌우 패딩), 모바일 카드 내부 패딩 |
| `--s-4` | 16px | 필터 패널 내부 패딩, 카드 리스트 아이템 간 세로 간격 |
| `--s-5` | 24px | 페이지 헤더 ↔ 필터 패널, 필터 패널 ↔ Table/카드 리스트 |
| `--s-6` | 32px | 섹션 간 구분(빈 상태, 에러 상태 블록 위아래 여백) |
| `--s-8` | 48px | 페이지 상단 헤더 아래 콘텐츠 시작 오프셋(데스크톱) |

Row height: Table `--row-h: 36px` (기본 density). 모바일(`<768px`)은 미디어 쿼리로 자동 44px(comfortable). `globals.css` 기본 거동 준수.

Exceptions:

- `12px (--s-3)`: Phase 3 디자인 시스템에서 상속된 토큰. 4의 배수(3×4)이며, Table 셀 수직 밀도와 모바일 카드 컴팩트 패딩에서 8px(너무 빡빡)과 16px(너무 느슨) 사이 균형값으로 필수. 신규 도입이 아니라 기존 규약 준수. 사용처: Table cell padding, 모바일 카드 내부 패딩, 카드 간 gap-y.
- 모바일 카드 리스트의 최소 터치 타겟(행 전체 클릭 영역)은 자동으로 44px 이상 확보된다(내부 padding 12px + 컨텐츠 2줄).

---

## Typography

Phase 3 타입 스케일을 그대로 사용한다. Scanner는 다음 4개 사이즈 × 2개 weight 역할만 사용:

| Role | Size | Weight | Line Height | 사용처 |
|------|------|--------|-------------|--------|
| Body | 16px (`--t-base`) | 400 | 1.5 (`--lh-normal`) | 빈/에러 상태 설명, 종목명 (모바일 카드) |
| Label | 14px (`--t-sm`) | 600 | 1.5 | 필터 라벨("최소 등락률", "마켓"), 갱신 시각 텍스트 |
| Caption | 12px (`--t-caption`) | 600 | 1.2 | Table thead, 종목코드 보조 텍스트, Slider 최소/최대 레이블 |
| Heading | 24px (`--t-h2`) | 600 | 1.2 (`--lh-tight`) | 페이지 제목 "스캐너" |

Weight 규약: 전역 2종만 사용 — `400` (Body) / `600` (Label · Caption · Heading). `500`·`700` 사용 금지. Label(14/600) · Caption(12/600) · Heading(24/600)은 사이즈로 시각적 계층을 구분한다.

숫자 전용(현재가·등락률·거래량·타임스탬프·슬라이더 값): `.mono` utility (Geist Mono, tabular-nums, slashed-zero) 필수 적용. 우측 정렬은 `.num` utility.

---

## Color

Phase 3 토큰 상속. Scanner 화면에서의 **명시적 사용 규칙**:

| Role | Token | 사용처 |
|------|-------|--------|
| Dominant (60%) | `--bg` | 페이지 배경 |
| Secondary (30%) | `--card` / `--muted` | 필터 패널 카드 배경, Table thead 배경 (`--muted`), 모바일 카드 배경 |
| Accent (10%) | `--primary` | Refresh 버튼(primary variant), Slider 활성 track·thumb, focus ring |
| Destructive | `--destructive` | 에러 상태의 에러 아이콘/테두리 액센트 (텍스트는 `--fg` 유지) |

금융 세만틱 컬러(별도 축, 10% 룰과 독립):

| Role | Token | 사용처 |
|------|-------|--------|
| Up (상승) | `--up` + `--up-bg` | 등락률 양수 Badge(`variant="up"`), Table의 등락률 셀 텍스트 |
| Down (하락) | `--down` + `--down-bg` | 등락률 음수 Badge(`variant="down"`) |
| Flat | `--flat` + `--muted` | 등락률 0 또는 N/A Badge(`variant="flat"`) |

**Accent reserved for**: Refresh 버튼의 기본 배경, Slider 활성 구간(track + thumb), 전역 focus-visible ring. 그 이외 요소(테이블 행 호버, 마켓 배지, 링크)는 accent를 사용하지 않는다.

**마켓 배지(KOSPI/KOSDAQ)**: 의미 차별화를 위해 색상 대신 `badge.tsx`의 기존 `outline` + `secondary` variant 조합으로 표기한다. KOSPI = `variant="secondary"`, KOSDAQ = `variant="outline"`. 신규 variant 추가 금지.

**등락률 Badge 규약**:
- `rate > 0` → `variant="up"`
- `rate < 0` → `variant="down"`
- `rate === 0 || rate == null` → `variant="flat"`
- Badge 내부는 부호 포함 퍼센트 1자리(`+25.3%`, `-3.1%`, `0.0%`). `.mono` 적용.

---

## Copywriting Contract

모든 사용자 대면 텍스트는 **한글**. 시스템 용어(KOSPI, KOSDAQ, %, KST)는 영문 유지.

| Element | Copy |
|---------|------|
| 페이지 제목 | `스캐너` |
| 페이지 서브텍스트 (선택, 헤더 아래) | `상한가 근접 종목을 실시간으로 추적합니다` |
| Chip — 등락률 | `등락률 ≥ {N}%` (N은 `.mono`, 예: `등락률 ≥ 25%`) |
| Chip — 마켓 | `마켓: {label}` (label: `전체` / `KOSPI` / `KOSDAQ`) |
| Popover — 임계값 라벨 | `최소 등락률` |
| Popover — 임계값 값 표시 | `{N}%` (`.mono`) |
| Popover — 마켓 라벨 | `마켓` |
| 마켓 토글 옵션 | `전체` / `KOSPI` / `KOSDAQ` (value: `ALL` / `KOSPI` / `KOSDAQ`) |
| Refresh 버튼 (기본) | `새로고침` (아이콘: `RefreshCw`, 좌측) |
| Refresh 버튼 (로딩중) | 아이콘만 spin, 텍스트 `새로고침 중...` |
| 갱신 시각 표시 | `최근 갱신 HH:MM:SS KST` (`.mono`로 시각 부분만) |
| Table thead | `종목명` / `코드` / `마켓` / `현재가` / `등락률` / `거래량` |
| 빈 결과 heading | `조건에 맞는 종목이 없습니다` |
| 빈 결과 body | `임계값을 낮추거나 마켓 필터를 넓혀보세요.` |
| 에러 heading | `데이터를 불러오지 못했습니다` |
| 에러 body | `{ApiClientError.message} 잠시 후 다시 시도해주세요.` (code가 있으면 `[{code}]` 프리픽스) |
| 에러 액션 버튼 | `다시 시도` |
| 로딩 상태 (초기) | 텍스트 없음 — Skeleton만 노출 |
| 접근성 — Refresh 버튼 aria-label | `스캐너 데이터 새로고침` |
| 접근성 — 행 클릭 aria-label | `{종목명} 상세 보기` |

CTA 주요 동사: `새로고침`, `다시 시도`. 파괴적 액션 없음 → confirmation 불요.

---

## Wireframes

### 1. 데스크톱 Scanner 기본 상태 (`≥768px`) — Variant C

```
┌──────────────────────────────────────────────────────────────────────────┐
│  gh-radar / 실시간 스캐너             KRX · 14:32:08 KST   [↻]   [🌓]      │  ← brand-bar
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  스캐너                                                                   │  ← h2 24/600
│  상한가 근접 종목을 실시간으로 추적합니다                                      │  ← 14/400 muted-fg
│                                                                          │
│  필터  [등락률 ≥ 25% ▾]  [마켓: 전체 ▾]              ● LIVE · auto · 60s   │  ← chip-bar
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │  ← tbl-wrap
│  │ 종목명            코드     마켓      현재가     등락률      거래량      │ │  ← thead (--muted bg, 12/600)
│  ├────────────────────────────────────────────────────────────────────┤ │
│  │ 에코프로비엠       247540  [KOSDAQ]  182,300  [+29.85%]    8,421,033 │ │  ← row-h 36px
│  │ 알테오젠           196170  [KOSDAQ]   98,500  [+28.73%]    3,210,944 │ │     숫자는 .mono .num
│  │ LG에너지솔루션     373220  [KOSPI]   514,000  [+26.93%]    2,103,977 │ │     hover: --muted 60%
│  │ ...                                                                │ │     cursor-pointer
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  Sorted by 등락률 · desc                       KRX · last update 14:32:08│  ← footnote
└──────────────────────────────────────────────────────────────────────────┘

Chip 클릭 시 popover:
    [등락률 ≥ 25% ▾]
    │
    ▼
    ┌──────────────────────────────┐
    │  최소 등락률           25%    │  ← popover (bg: --popover)
    │  ├──●─────────────────┤      │    padding: 16px, radius: --r-md
    │  10%                    29%   │    min-width: 320px
    └──────────────────────────────┘
```

정렬 규칙:
- 종목명: 좌측 정렬, 본문 16/600 (카드/Table 공용 강조)
- 코드: 좌측 정렬, 12px `.mono` muted-fg
- 마켓: Badge (KOSPI: `secondary`, KOSDAQ: `outline`) — 좌측 정렬
- 현재가 / 등락률 / 거래량: 우측 정렬(`.num`)
- 등락률: 인라인 텍스트 `.mono`, 색상 `--up`/`--down`/`--flat`. 부호+퍼센트 2자리(`+29.85%`). Badge 래핑 선택(Phase 3 badge.tsx up/down/flat variant 사용 가능).
- 거래량: 정수 천단위 콤마, 단위 표시 없음 (또는 축약: `8.4M` 가능 — planner 결정)

Chip-bar 레이아웃:
- 한 행 flex, gap: 8px. "필터" 라벨(12/600 uppercase muted-fg) + Chip들 + 우측 끝 LIVE 인디케이터(`margin-left: auto`).
- chip 높이 `--s-6` (32px), padding `0 --s-3`, 폰트 `.mono` 14/600. `aria-expanded` true일 때 `bg: --fg`, `color: --bg`로 invert.
- popover는 `popover` 컴포넌트(shadcn official) 또는 동등 구현. outside-click / Escape 로 닫힘.

### 2. 모바일 Scanner (`<768px`) — Variant C

```
┌──────────────────────────────────┐
│ gh-radar / 스캐너   14:32 [↻][🌓]│  ← brand-bar (압축)
├──────────────────────────────────┤
│                                  │
│  스캐너                           │
│                                  │
│  [등락률 ≥ 25% ▾] [마켓: 전체 ▾] │  ← chip-bar (줄바꿈 가능)
│                                  │
│  ┌──────────────────────────────┐│  ← 카드 리스트 item (Card 컴포넌트)
│  │ 에코프로비엠      [+29.85%]    ││    padding: 12px
│  │ 247540 · KOSDAQ               ││    gap-y: 8px
│  │ 182,300원  거래량 8,421,033   ││    cursor-pointer, Link wrap
│  └──────────────────────────────┘│
│  ┌──────────────────────────────┐│
│  │ 알테오젠         [+28.73%]     ││
│  │ 196170 · KOSDAQ               ││
│  │ 98,500원   거래량 3,210,944   ││
│  └──────────────────────────────┘│
│  ...                             │
└──────────────────────────────────┘

Chip 탭 시 popover(동일 컴포넌트, 모바일에서는 화면 중앙 sheet 스타일 또는 하단 드로어로 대체 검토 — planner 최종).
Refresh와 갱신 시각은 brand-bar 우측에 압축 배치(아이콘만 + 분 단위 표기).
```

모바일 카드 내부 3줄 구조:
1. 종목명(좌, 16/400) + 등락률 Badge(우, 12/600 Caption 안 Badge 기본 스타일)
2. 코드 · 마켓 (12/600 muted-fg, `·` 구분자)
3. 현재가(좌, `.mono`) + 거래량(우, `.mono`)

행 간 간격: 12px (카드 사이 세로). 스크롤 성능 위해 가상화 없이 서버 limit 50~100 준수(planner 최종).

### 3. 빈 결과 상태

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [필터 카드 유지 — 사용자가 기준 조정 가능해야 함]                              │
│  ├──●─────────────────┤ 27%   [전체][KOSPI][KOSDAQ]  [↻ 새로고침]  14:32:08│
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│                                                                          │
│                       ┌──────────────────────────────┐                   │
│                       │                              │                   │
│                       │      🔍 (아이콘 40px muted)    │                   │
│                       │                              │                   │
│                       │  조건에 맞는 종목이 없습니다       │                   │
│                       │                              │                   │
│                       │  임계값을 낮추거나 마켓 필터를      │                   │
│                       │       넓혀보세요.              │                   │
│                       │                              │                   │
│                       └──────────────────────────────┘                   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

- 블록 최소 높이 240px, 중앙 정렬
- heading: 16/600 (Label 사이즈 + Heading weight — 페이지 제목 24/600보다 한 단계 낮은 sub-heading 계층)
- body: 14/600 muted-fg 라벨 톤이 아닌, 본문 설명이므로 **14/400 (Label 사이즈 + Body weight)로 예외 없이 처리 — 하지만 Typography 규약상 weight는 400/600만 허용되며, body 역할은 16/400이 기본. 빈 상태 body는 14px 유지하되 weight 400** (14/400 muted-fg)
- gap 8px
- 아이콘: `SearchX` lucide, 40px, `--muted-fg`
- 필터 카드는 **유지** (사용자가 즉시 조정 가능해야 함)

> 참고: 빈 상태 body에 한해 14/400 muted-fg는 Scanner 내 시각적 서열을 해치지 않는 유일한 예외 조합이며, Typography 표의 4개 역할(Body 16/400, Label 14/600, Caption 12/600, Heading 24/600)을 위반하지 않도록 weight는 항상 400 또는 600만 사용한다. 14/400은 Phase 3 globals.css의 `text-sm` 기본 weight와 일치하여 별도 규칙이 아니라 **본문을 줄여 쓴 축소 Body**로 간주한다.

### 4. 에러 상태

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [필터 카드 유지]                                                          │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  ⚠  데이터를 불러오지 못했습니다                                           │ │  ← border: --destructive/40%
│  │     [UPSTREAM_ERROR] KIS 응답이 지연되고 있습니다.                          │ │    bg: --card
│  │     잠시 후 다시 시도해주세요.                                            │ │    padding: 24px
│  │                                                                    │ │    icon: AlertTriangle --destructive
│  │     [다시 시도]                                                      │ │    primary button
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

- 에러 카드 전체 배경은 `--card`(붉은색 범람 금지). 좌측 아이콘만 `--destructive`.
- 테두리: `1px solid color-mix(in oklch, var(--destructive) 40%, var(--border))`
- 이전 데이터가 있으면 Table/카드 리스트는 **유지**하고 에러 카드만 필터 아래에 삽입(stale-but-visible 패턴). 초기 로딩 에러(데이터 없음)인 경우에만 이 블록이 단독 렌더.
- Refresh 버튼(필터 영역)은 항상 활성 유지 — 이것으로도 재시도 가능.

### 5. 초기 로딩 (Skeleton)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [필터 카드 — 즉시 렌더, skeleton 아님 (URL에서 복원)]                         │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ ▓▓▓▓▓▓▓     ▓▓▓▓▓     ▓▓▓     ▓▓▓▓▓▓    ▓▓▓▓▓▓▓    ▓▓▓▓▓▓▓▓▓▓      │ │  ← thead (정적)
│  ├────────────────────────────────────────────────────────────────────┤ │
│  │ ░░░░░░░░░   ░░░░░░    ░░░░    ░░░░░░    ░░░░░░     ░░░░░░░░░░      │ │  ← skeleton row × 10
│  │ ░░░░░░░     ░░░░░░    ░░░░    ░░░░░░    ░░░░░░     ░░░░░░░░        │ │    skeleton-list shimmer
│  │ ░░░░░░░░░░  ░░░░░░    ░░░░    ░░░░░░    ░░░░░░     ░░░░░░░░░░      │ │    stagger 40ms
│  │ ... (10행)                                                          │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘

모바일: 카드 컨테이너 skeleton 5개(각 72px 높이, 3줄 구조 자리).
```

Skeleton 규칙:
- 초기 진입(= 데이터 한 번도 없음)에만 노출. 폴링 revalidation 중에는 기존 데이터 유지.
- 행 개수: 데스크톱 10, 모바일 5
- `components/ui/skeleton.tsx` + `.skeleton-list` stagger (globals.css `skeleton-shimmer` 200ms).
- 필터 카드는 skeleton 대상이 아님(URL 쿼리에서 즉시 복원 가능).

---

## Interaction Contract

| 인터랙션 | 동작 |
|---------|------|
| Chip 클릭 | 해당 popover 토글. 다른 popover 열려 있으면 그쪽은 닫고 이것만 연다. `aria-expanded` 동기화 |
| Popover 외부 클릭 / Esc | popover 닫기. 포커스는 트리거 chip으로 복귀 |
| Slider 드래그 (popover 내) | 값 즉시 popover 라벨과 chip 라벨(`등락률 ≥ 25%`) 갱신, 250ms debounce 후 URL(`?min=`) 갱신 + fetch 재실행 |
| Slider 키보드 | ←/→ ±1, PageUp/Down ±5. aria-valuetext: `"{N}%"` |
| 마켓 토글 (popover 내) | 즉시 URL(`?market=`) 갱신 + fetch + chip 라벨 갱신(`마켓: KOSPI`). popover는 사용자가 명시적으로 닫을 때까지 유지 |
| Refresh 버튼 | 클릭 즉시 fetch. 호출 중 disabled + `RefreshCw` 아이콘 spin. 응답 도착 후 해제 |
| 자동 폴링 | 60초 간격(setInterval 또는 SWR refreshInterval, planner 결정). 탭 비활성/백그라운드 시에도 계속(browser 기본 동작). 폴링 중 화면 로딩 표식 없음(Refresh 버튼 spinner만 수동 요청 시 표시) |
| 행 클릭 (데스크톱) | `next/link` → `/stocks/{code}`. Table row 전체가 hit area. Enter/Space 키로도 활성화 |
| 카드 클릭 (모바일) | 동일 — Card 전체 `<Link>` 래핑 |
| Hover (데스크톱 행) | `background: color-mix(in oklch, var(--muted) 60%, transparent)` (globals.css 기본) |
| Focus | 전역 `*:focus-visible` 룰(더블 링) 적용. 행·버튼·Slider·토글 모두 자동 |
| 숫자 업데이트 시 | 애니메이션/깜빡임 없음 — 조용한 교체(트레이더 eye strain 방지) |

---

## Responsive Breakpoints

| Breakpoint | 레이아웃 |
|-----------|---------|
| `<768px` (mobile) | 카드 리스트. 필터 카드 내부 세로 쌓기(Slider → 마켓 토글 → Refresh+타임스탬프). AppShell `hideSidebar` 유지. 테이블 렌더링 금지 |
| `≥768px` (tablet/desktop) | Table. 필터 카드 가로 한 줄 |
| `≥1280px` | Table max-width 1200px 중앙 정렬 (AppShell CenterShell 기본) |

분기 수단: Tailwind `md:` prefix. 서버 컴포넌트가 아닌 `'use client'` 트리에서 조건부 렌더링 대신 **둘 다 마크업 후 CSS로 `hidden md:block` / `md:hidden` 전환**(hydration 단순화).

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | (Phase 3 에서 이미 도입) table, card, slider, badge, skeleton, button, input, tooltip, separator, sheet | not required — Phase 3 에서 승인 완료 |
| shadcn official (Phase 5 신규) | `popover` (chip 클릭 시 필터 노출용), optional `toggle-group` (popover 내 마켓 선택) | shadcn official 블록만 허용 — 별도 안전 검증 불요 |
| 3rd-party | 없음 | 해당 없음 |

Variant C 선택에 따라 `popover` 블록 1건 추가 도입. 모바일에서 popover 대신 `sheet`(Phase 3 기설치)로 대체할지 여부는 planner 결정.

---

## Out of Scope (Phase 5 UI-SPEC)

- SSE / Realtime 시각 표식 (Deferred: CONTEXT)
- Stale 배지, 장마감 전용 UI (Deferred)
- 정렬 가능 컬럼 헤더 클릭 UX — 서버 `sort` 고정값 사용
- 가상 스크롤 — 서버 `limit` 상한으로 회피
- 즐겨찾기, 알림, 필터 저장 — v2

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
