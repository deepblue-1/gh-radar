---
phase: 03-design-system
title: Phase 3 Design System — UI Spec
status: draft
created: 2026-04-13
source_of_truth: 03-UI-PREVIEW.html
preset: BBAA (데이터 밀집 · 토스증권 팔레트 · 순백/순검정 · 16px base)
---

# Phase 3 Design System — UI Spec

## 0. Overview

Phase 3는 gh-radar 웹앱의 **시각 계약**을 잠근다. 본 문서는 사용자가 `03-UI-PREVIEW.html`로 직접 확정한 모든 구체값을 Planner/Executor가 재질문 없이 구현할 수 있도록 전체 토큰·컴포넌트·레이아웃을 고정한다.

**확정된 핵심 선택 (BBAA preset):**

| 축 | 선택 | 근거 |
|---|---|---|
| 밀도 | B — 데이터 밀집 대시보드 (row-h 36px) | 스캐너·테이블 중심 트레이더 UX |
| 팔레트 | 토스증권 실제 팔레트 (Toss Blue primary, Toss Red 상승, Toss Blue 하락) | 한국 시장 관례 + 친숙도 |
| 배경 | Light 순백 `#FFFFFF` / Dark 딥차콜 `oklch(0.08 0 0)` | 최대 대비 + 장시간 응시 eye-strain 완화 (순검정 `#000` 에서 미세 상향) |
| 타이포 | 16px base, Pretendard Variable + **Geist Mono**(숫자) | 한글 가독성 + 금융 숫자 정렬 + 차별화 |

**Downstream 소비:** 이 문서 + `03-CONTEXT.md`(D-01~D-31) + `03-UI-PREVIEW.html`(시각 레퍼런스) 3종은 동등한 계약 산출물이다.

---

## 1. Design Tokens

### 1.1 Color — Light (`:root`)

| Token | OKLCH | Hex 근사 | 용도 |
|---|---|---|---|
| `--bg` | `#FFFFFF` | `#FFFFFF` | 페이지 배경(순백) |
| `--fg` | `oklch(0.18 0 0)` | `#2E2E2E` | 본문 텍스트 |
| `--muted` | `oklch(0.96 0 0)` | `#F5F5F5` | 섹션 배경, 테이블 헤더 |
| `--muted-fg` | `oklch(0.50 0 0)` | `#808080` | 보조 텍스트, 캡션 |
| `--border` | `oklch(0.92 0 0)` | `#EBEBEB` | 테두리, 카드·컨테이너 경계 |
| `--border-subtle` | `oklch(0.18 0 0 / 0.06)` | — | 행 구분선 (거의 안 보이는 hairline, §8.5.3) |
| `--input` | `oklch(0.92 0 0)` | `#EBEBEB` | 입력 필드 테두리 |
| `--ring` | `oklch(0.63 0.18 250)` | `#3182F6` | 포커스 링 (Toss Blue) |
| `--card` | `#FFFFFF` | `#FFFFFF` | 카드 배경 |
| `--card-fg` | `oklch(0.18 0 0)` | `#2E2E2E` | 카드 텍스트 |
| `--popover` | `#FFFFFF` | `#FFFFFF` | 팝오버/툴팁 배경 |
| `--popover-fg` | `oklch(0.18 0 0)` | `#2E2E2E` | 팝오버 텍스트 |
| `--primary` | `oklch(0.63 0.18 250)` | `#3182F6` | CTA, 링크, 활성 탭 (Toss Blue) |
| `--primary-fg` | `#FFFFFF` | `#FFFFFF` | primary 위 텍스트 |
| `--secondary` | `oklch(0.96 0 0)` | `#F5F5F5` | 보조 버튼 배경 |
| `--secondary-fg` | `oklch(0.18 0 0)` | `#2E2E2E` | 보조 버튼 텍스트 |
| `--accent` | `oklch(0.95 0.03 250)` | `#EAF2FE` | 강조 영역 배경 (옅은 블루) |
| `--accent-fg` | `oklch(0.35 0.12 250)` | `#1E4DA3` | accent 위 텍스트 |
| `--destructive` | `oklch(0.66 0.20 22)` | `#F04452` | 삭제/경고 (Toss Red) |
| `--destructive-fg` | `#FFFFFF` | `#FFFFFF` | destructive 위 텍스트 |
| `--up` | `oklch(0.66 0.20 22)` | `#F04452` | 상승 (Toss Red, 채도 완화) |
| `--down` | `oklch(0.63 0.18 250)` | `#3182F6` | 하락 (Toss Blue — primary와 동일 톤) |
| `--flat` | `oklch(0.55 0 0)` | `#8C8C8C` | 보합 (중성 회색) |
| `--up-bg` | `oklch(0.97 0.03 22)` | `#FDEDEE` | 상승 배지 배경 |
| `--down-bg` | `oklch(0.97 0.03 250)` | `#ECF2FE` | 하락 배지 배경 |

### 1.2 Color — Dark (`.dark`)

| Token | OKLCH | Hex 근사 | 용도 |
|---|---|---|---|
| `--bg` | `oklch(0.08 0 0)` | `#141414` | 페이지 배경 (딥차콜 — 장시간 응시 eye-strain 완화) |
| `--fg` | `oklch(0.96 0 0)` | `#F5F5F5` | 본문 텍스트 |
| `--muted` | `oklch(0.18 0 0)` | `#242424` | 섹션 배경 |
| `--muted-fg` | `oklch(0.65 0 0)` | `#A6A6A6` | 보조 텍스트 |
| `--border` | `oklch(0.24 0 0)` | `#333333` | 테두리, 카드·컨테이너 경계 |
| `--border-subtle` | `oklch(1 0 0 / 0.06)` | — | 행 구분선 (hairline, §8.5.3) |
| `--input` | `oklch(0.24 0 0)` | `#333333` | 입력 테두리 |
| `--ring` | `oklch(0.72 0.16 250)` | `#5A9BFF` | 포커스 링 (명도 상향) |
| `--card` | `oklch(0.12 0 0)` | `#1E1E1E` | 카드 배경 (배경보다 한 단계 밝게 — 위계) |
| `--card-fg` | `oklch(0.96 0 0)` | `#F5F5F5` | 카드 텍스트 |
| `--popover` | `oklch(0.14 0 0)` | `#242424` | 팝오버 배경 (카드보다 한 단계 더 밝게) |
| `--popover-fg` | `oklch(0.96 0 0)` | `#F5F5F5` | 팝오버 텍스트 |
| `--primary` | `oklch(0.72 0.16 250)` | `#5A9BFF` | Toss Blue — Dark 명도 상향 |
| `--primary-fg` | `oklch(0.10 0 0)` | `#141414` | primary 위 텍스트 |
| `--secondary` | `oklch(0.18 0 0)` | `#2E2E2E` | 보조 버튼 배경 |
| `--secondary-fg` | `oklch(0.96 0 0)` | `#F5F5F5` | 보조 버튼 텍스트 |
| `--accent` | `oklch(0.22 0.05 250)` | `#1A2A4D` | 강조 배경 |
| `--accent-fg` | `oklch(0.85 0.10 250)` | `#B8CEF5` | accent 위 텍스트 |
| `--destructive` | `oklch(0.72 0.19 22)` | `#FF6470` | Toss Red — Dark |
| `--destructive-fg` | `oklch(0.10 0 0)` | `#141414` | destructive 위 텍스트 |
| `--up` | `oklch(0.72 0.19 22)` | `#FF6470` | 상승 (Dark) |
| `--down` | `oklch(0.72 0.16 250)` | `#5A9BFF` | 하락 (Dark) |
| `--flat` | `oklch(0.65 0 0)` | `#A6A6A6` | 보합 |
| `--up-bg` | `oklch(0.22 0.06 22)` | `#3A1F22` | 상승 배지 배경 |
| `--down-bg` | `oklch(0.22 0.05 250)` | `#1A2A4D` | 하락 배지 배경 |

**규칙:**
- 하드코딩 hex 금지. 위 테이블의 토큰 이름만 사용.
- Tailwind v4 `@theme` 블록에 위 토큰을 그대로 선언하고, `.dark` 클래스 스코프에서 override.
- OKLCH 원본값을 유지(Hex는 근사 참고용).

### 1.3 Spacing — 4px Scale

| Token | Value |
|---|---|
| `--s-1` | 4px |
| `--s-2` | 8px |
| `--s-3` | 12px |
| `--s-4` | 16px |
| `--s-5` | 24px |
| `--s-6` | 32px |
| `--s-8` | 48px |
| `--s-10` | 64px |

**규칙:** 모든 margin/padding/gap은 위 스케일만 사용. Tailwind의 `p-1`(4px), `p-2`(8px) 등 기본 scale과 동일.

### 1.4 Radius

| Token | Value | 용도 |
|---|---|---|
| `--r-sm` | 4px | 스켈레톤, 칩 |
| `--r` | 6px | 버튼, 인풋, 배지(사각) |
| `--r-md` | 8px | 카드, 테이블 래퍼 |
| `--r-lg` | 12px | 모달, 대형 카드 |

### 1.5 Typography Scale — 16px Base

| Token | Size | line-height | 용도 |
|---|---|---|---|
| `--t-caption` | 12px | `--lh-normal` 1.5 | 캡션, 보조 정보 |
| `--t-sm` | 14px | 1.5 | body-sm, 테이블 셀 |
| `--t-base` | 16px | 1.5 | 본문 기본 |
| `--t-lg` | 18px | 1.5 | body-lg, h4 |
| `--t-h4` | 18px | `--lh-tight` 1.2 | h4 헤딩 |
| `--t-h3` | 20px | 1.2 | h3 헤딩 |
| `--t-h2` | 24px | 1.2 | h2 헤딩 |
| `--t-h1` | 30px | 1.2 | h1 헤딩 |

**Line-height 토큰:** `--lh-tight: 1.2` (헤딩), `--lh-normal: 1.5` (본문).
**Letter-spacing:** 헤딩 `-0.015em` (타이트), 본문 0.

### 1.6 Density — 데이터 밀집

| Token | Value | 비고 |
|---|---|---|
| `--row-h` | 36px (`lg+`) / **48px (`<md`)** | 모바일 터치 타깃 44×44px 충족 위해 자동 확장 |
| `--cell-pad-x` | 12px | |
| `--cell-pad-y` | 8px (`lg+`) / 12px (`<md`) | 모바일 수직 패딩 확대 |

**반응형 규칙 (필수):**
- `@media (max-width: 767px)` 스코프에서 `--row-h: 48px; --cell-pad-y: 12px;` 재정의
- 또는 Tailwind 유틸로: `<tr class="h-12 md:h-9">` 명시
- 행 전체가 클릭 가능한 경우(종목 상세 이동) **행 자체가 터치 타깃** — 데스크톱 36px 유지하되 `hitSlop` 또는 `padding` 으로 인식 영역 ≥44px 보장

---

## 2. Typography

### 2.1 본문·한글 — Pretendard Variable (self-host)

- 파일: `webapp/public/fonts/PretendardVariable.woff2` (single variable file)
- 로더: `next/font/local`, `font-display: swap`
- Weight 사용: **400 (regular), 500 (medium), 600 (semibold), 700 (bold)**
- 서브셋: 기본 Latin + KS X 1001(한글 상용 2350자). 세부 unicode-range 분할은 Planner 재량 (D-11).

**CSS 변수:**
```css
--font-sans: 'Pretendard Variable', Pretendard, -apple-system,
             BlinkMacSystemFont, 'Apple SD Gothic Neo', system-ui, sans-serif;
```

### 2.2 숫자 — Geist Mono (tabular + slashed zero)

**결정 (frontend-design 리뷰 후 갱신):** 기존 Inter → **Geist Mono** 로 교체. Vercel 공식 폰트, 현대적 인상, 한글(Pretendard) 과 병치 시 차별화 효과. mono 특성상 tabular 정렬은 기본 보장.

- 로더: `next/font/google` 의 `Geist_Mono` (weight 400/500/600) 로드, 또는 self-host.
- 적용 대상: `<Number>` 컴포넌트, 테이블 숫자 셀, 가격/등락률/거래량, 종목코드.
- OpenType feature: `font-feature-settings: 'tnum' 1, 'ss01' 1;` (tnum=tabular, **ss01=slashed zero** 종목코드 `0/O` 혼동 방지)
- `font-variant-numeric: tabular-nums;` 병행 (안전망).

**유틸리티 클래스 `.mono` (숫자 전용 고정폭):**
```css
.mono {
  font-family: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1, 'ss01' 1;
  letter-spacing: -0.01em;  /* mono 기본 tracking 살짝 타이트하게 */
}
```

**Geist Mono 선택 근거:**
- Inter 대비 국내 금융 UI에서 드물게 쓰임 → 차별화
- 곡선보다 기하학적 형태 → 데이터 대시보드와 시각 일관성
- variable font (weight 전구간 연속) → h1 큰 숫자부터 caption 작은 숫자까지 동일 폰트 일관성

### 2.3 글로벌 베이스라인

```css
html, body {
  font-family: var(--font-sans);
  font-size: var(--t-base);           /* 16px */
  line-height: var(--lh-normal);      /* 1.5 */
  -webkit-font-smoothing: antialiased;
  font-feature-settings: 'tnum';       /* 전역 숫자 tabular */
}
h1, h2, h3, h4 {
  line-height: var(--lh-tight);
  letter-spacing: -0.015em;
  margin: 0;
}
h1 { font-size: var(--t-h1); font-weight: 700; }
h2 { font-size: var(--t-h2); font-weight: 700; }
h3 { font-size: var(--t-h3); font-weight: 600; }
h4 { font-size: var(--t-h4); font-weight: 600; }
```

---

## 3. Component Specs

**공통 규칙:**
- 접근성: Radix UI 기본 ARIA 신뢰. 포커스 규격은 **§8.5.5 Double-Ring Focus 로 Override** (outline 2px + offset 3px + 4px halo).
- Transition: `transition: background 120ms ease, border-color 120ms ease, opacity 120ms ease;` — 기본 120ms 이상 사용 금지(트레이더 UI는 즉각적 피드백 우선).
- 그림자: 일반 요소는 최소 사용. Card 는 §8.5.4, 팝오버/툴팁은 해당 섹션 규격 따름.

### 3.1 Button

| Size | Height | Padding X | Font-size |
|---|---|---|---|
| `sm` | 28px | 10px | 12px (`--t-caption`) |
| `md` (default) | 36px | 14px | 14px (`--t-sm`) |
| `lg` | 44px | 18px | 16px (`--t-base`) |

**공통:** `font-weight: 500`, `border-radius: var(--r)` (6px), `border: 1px solid transparent`, `cursor: pointer`.

**Variants (4종):**

| Variant | Background | Text | Border | Hover |
|---|---|---|---|---|
| `primary` | `--primary` | `--primary-fg` | transparent | `color-mix(in oklch, var(--primary) 88%, black)` |
| `secondary` | `--secondary` | `--secondary-fg` | `--border` | `color-mix(in oklch, var(--secondary) 92%, black)` |
| `outline` | transparent | `--fg` | `--border` | background `--muted` |
| `ghost` | transparent | `--fg` | transparent | background `--muted` |
| `destructive` | `--destructive` | `--destructive-fg` | transparent | `color-mix(in oklch, var(--destructive) 88%, black)` |

**States:**
- `:disabled` → `opacity: 0.5; cursor: not-allowed;`
- `:focus-visible` → focus ring (공통 규칙)
- `:active` → `transform: translateY(0); opacity: 0.9;` (선택적)

### 3.2 Card

> ⚠️ **최종 규격은 §8.5.4 로 Override.** 이 섹션은 초기 정의이며, `border-radius` 와 `box-shadow` 는 §8.5.4 Card Inner Highlight + Soft Shadow 가 최종 값을 잠근다 (`--r-lg 12px` + 3층 shadow). 아래 기본 구조만 참고.

```css
background: var(--card);
color: var(--card-fg);
border: 1px solid var(--border);
border-radius: var(--r-lg);   /* 12px — §8.5.4 최종값 */
padding: var(--s-5);          /* 24px */
/* box-shadow 는 §8.5.4 참조 (3층 inner highlight + near + far) */
```

**내부 구조 관례:**
- 제목: `font-weight: 600; font-size: var(--t-base);`
- 설명: `color: var(--muted-fg); font-size: var(--t-sm);`
- 구분선은 `.sep` (`height: 1px; background: var(--border); margin: var(--s-4) 0;`)

### 3.3 Table

```css
.tbl-wrap { border: 1px solid var(--border); border-radius: var(--r-md); overflow: hidden; }
table { width: 100%; border-collapse: collapse; font-size: var(--t-sm); }
thead th {
  text-align: left; font-weight: 600;
  padding: var(--cell-pad-y) var(--cell-pad-x);  /* 8px 12px */
  background: var(--muted); color: var(--muted-fg);
  font-size: var(--t-caption);                    /* 12px */
  border-bottom: 1px solid var(--border);
}
tbody td {
  height: var(--row-h);                           /* 36px */
  padding: 0 var(--cell-pad-x);                   /* 0 12px */
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
tbody tr:last-child td { border-bottom: 0; }
tbody tr:hover td { background: color-mix(in oklch, var(--muted) 60%, transparent); }
```

**규칙:**
- Zebra striping **없음** (순백/순검정 배경과 정합).
- 숫자 셀: `.num` 클래스 — `text-align: right; font-variant-numeric: tabular-nums;`
- 등락 색상 셀: `.up/.down/.flat` 클래스로 color 토큰 적용.

### 3.4 Badge

```css
display: inline-flex; align-items: center;
height: 20px; padding: 0 8px;
border-radius: 999px;         /* pill */
font-size: 11px; font-weight: 600;
letter-spacing: 0.01em;
border: 1px solid transparent;
```

**Variants:**

| Variant | Background | Text | Border |
|---|---|---|---|
| `default` | `--primary` | `--primary-fg` | — |
| `secondary` | `--secondary` | `--secondary-fg` | `--border` |
| `outline` | transparent | `--fg` | `--border` |
| `up` | `--up-bg` | `--up` | — |
| `down` | `--down-bg` | `--down` | — |
| `flat` | `--muted` | `--flat` | — |

**사용처:** 등락률 셀(`up/down/flat`), 마켓 구분(`outline` 또는 `secondary` — 예: `KOSPI`/`KOSDAQ`).

### 3.5 Input

```css
height: 36px; padding: 0 12px;
border: 1px solid var(--input);
border-radius: var(--r);      /* 6px */
background: var(--bg); color: var(--fg);
font-family: inherit; font-size: var(--t-sm);
outline: none;
min-width: 220px;             /* 기본값 — 사용처에서 override 가능 */

:focus {
  border-color: var(--ring);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--ring) 25%, transparent);
}
```

**Error state:** `border-color: var(--destructive); box-shadow: 0 0 0 3px color-mix(in oklch, var(--destructive) 20%, transparent);`
**Disabled:** `opacity: 0.5; cursor: not-allowed;`

### 3.6 Skeleton

**애니메이션 규격:**
- 기본: shimmer (좌→우 그라디언트 이동), `1.4s` linear infinite
- `prefers-reduced-motion: reduce` 시: 애니메이션 정지, 고정 opacity `0.7` (정적 placeholder)
- 목록(테이블)에서 사용 시: **stagger 30~50ms 간격** (행별 `animation-delay` 부여) — 일시 전체 반짝임 방지

```css
.skeleton {
  background: linear-gradient(90deg,
    var(--muted) 0%,
    color-mix(in oklch, var(--muted) 50%, var(--bg)) 50%,
    var(--muted) 100%);
  background-size: 200% 100%;
  animation: sk 1.4s infinite linear;
  border-radius: var(--r-sm);   /* 4px */
}

@keyframes sk {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}

/* 접근성: reduced-motion 존중 */
@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
    opacity: 0.7;
  }
}

/* 리스트 stagger — 행 index 기반 */
.skeleton-row:nth-child(1) { animation-delay: 0ms; }
.skeleton-row:nth-child(2) { animation-delay: 40ms; }
.skeleton-row:nth-child(3) { animation-delay: 80ms; }
/* ... 최대 10행까지, 이후 모듈러 반복 */
```

**규칙:**
- 폭/높이는 사용처에서 지정. 기본 높이 권장: 텍스트 라인 `h-[1em]`, 행 `h-[36px]` (모바일 `h-[48px]`).
- 1초 이상 예상되는 로딩에만 skeleton 사용 (<300ms 는 애니메이션 없이 즉시 렌더).
- Scanner 초기 로드: 10행 stagger skeleton 권장.

### 3.7 Slider (Phase 5 SCAN-02 전용 계약)

**Props 계약:** `min=10`, `max=29`, `step=1`, `defaultValue=25` (단위: %).

```css
track {
  width: 280px; height: 4px; border-radius: 999px;
  background: var(--muted);
}
thumb {
  width: 16px; height: 16px; border-radius: 50%;
  background: var(--primary);
  border: 2px solid var(--bg);
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  cursor: pointer;
}
thumb:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
```

**값 표시:** 썸 우측에 `.slider-val` (`font-family: 'Geist Mono', monospace; font-size: var(--t-sm); min-width: 48px;`) — 예: `25%`.

### 3.8 Separator

```css
horizontal: height: 1px; background: var(--border); margin: var(--s-4) 0;
vertical:   width: 1px; height: 24px; display: inline-block; vertical-align: middle; margin: 0 var(--s-3);
```

### 3.9 Tooltip

```css
background: var(--popover);
color: var(--popover-fg);
border: 1px solid var(--border);
border-radius: var(--r);      /* 6px */
padding: 6px 10px;
font-size: var(--t-caption);  /* 12px */
white-space: nowrap;
box-shadow: 0 8px 24px rgba(0,0,0,0.12);
```

**지연:** delayDuration `700ms` (Radix 기본 사용).
**터치:** long-press 활성 (D-23). Radix가 처리.
**화살표:** Radix `<TooltipArrow>` 기본 스타일 사용, fill `var(--popover)`, stroke `var(--border)`.

### 3.10 Deferred Components — Phase 5+ 증분 추가

Phase 3 범위에는 9종만 구현하지만, **후속 Phase 에서 즉시 필요** 할 컴포넌트들의 디자인 정책을 **미리 잠가** 놓음. Phase 5~9 에서 `pnpm dlx shadcn@latest add <name>` 로 추가 시 아래 정책을 그대로 적용.

| 컴포넌트 | 쓰임 Phase | 기본 정책 |
|---|---|---|
| **Toast / Sonner** | 5 (새로고침 성공/실패), 6 (검색 상태), 9 (요약 완료) | 우상단 스택, auto-dismiss `4s`, `aria-live="polite"` 필수, 배경 `--popover`, `destructive` variant 는 `--destructive` 배경. 위치 `top-4 right-4`, 최대 3개 동시. |
| **Dialog** | 6 (설정), 9 (요약 상세) | Radix Dialog 기반, scrim `oklch(0 0 0 / 0.55)` + `backdrop-blur-sm`, 컨텐츠 radius `--r-lg` (12px), `max-w-lg`, 진입 `fade + scale(0.96→1)` 180ms, ESC/outside-click 닫기. |
| **DropdownMenu** | 5 (정렬 옵션), 6 (사용자 메뉴) | 배경 `--popover`, radius `--r-md`, item padding `8px 12px`, hover 시 `--muted`, 키보드 arrow 네비, `min-w-[180px]`. |
| **Popover** | 5 (종목 행 hover 요약) | 배경 `--popover`, border `--border`, `--r-md`, shadow `0 8px 24px rgba(0,0,0,0.12)`, delay 100ms, 화살표 옵션. |
| **Select / Combobox** | 6 (종목 검색 자동완성) | Input + DropdownMenu 조합. 검색 ILIKE (D-11 Phase 2), 결과 최대 20개, 키보드 arrow+Enter, 선택 시 `--accent` highlight. |
| **ScrollArea** | 5 (긴 테이블), 8 (토론방 리스트) | Radix ScrollArea, 스크롤바 자동 숨김/hover 노출, thumb `--muted-fg/0.5`. |

**공통 규칙:**
- 모두 **shadcn 공식 registry** 만 사용 (CONTEXT D-04)
- 9종 컴포넌트와 동일한 토큰 체계 사용 (하드코딩 금지)
- 추가 시 `/design` 카탈로그에도 섹션 추가 (자동 업데이트 아님 — PR 에서 수동 추가)
- 도입 시점에 본 SPEC 에 정책 업데이트 없이 바로 적용 가능 (이 정책이 계약)

---

## 4. Layout Templates

### 4.1 AppShell (스캐너/대시보드용)

```
┌─────────────────────────────────────────────┐
│ Header (sticky, h=56px)                     │
├──────────┬──────────────────────────────────┤
│ Sidebar  │ Main Content                     │
│ 240px    │ padding: 24px                    │
│ (64px    │                                  │
│  collapsed)                                 │
└──────────┴──────────────────────────────────┘
```

| 영역 | 치수/스타일 |
|---|---|
| Header | height `56px`, `position: sticky; top: 0; z-index: 10;`, background `color-mix(in oklch, var(--bg) 88%, transparent)`, `backdrop-filter: blur(8px);`, `border-bottom: 1px solid var(--border);`, padding `12px 24px` |
| Header 브랜드 | `font-weight: 700; font-size: var(--t-lg); letter-spacing: -0.01em;` |
| Sidebar (expanded) | width `240px`, background `--muted`, `border-right: 1px solid var(--border);`, padding `12px`, gap `4px` |
| Sidebar (collapsed) | width `64px` (아이콘만) |
| Nav item | `padding: 6px 10px; border-radius: var(--r-sm); color: var(--muted-fg);` |
| Nav item active | `background: var(--bg); color: var(--fg); font-weight: 600;` |
| Main content | padding `24px` (`--s-5`), overflow auto |

**반응형:** `<lg` (1024px 미만)에서 Sidebar → Drawer.
- **Scrim (오버레이):** `oklch(0 0 0 / 0.55)` + `backdrop-filter: blur(4px)` — WCAG `modal-escape` 규정 준수, 뒤 콘텐츠 legibility 확실히 격리
- **Drawer 폭:** 280px (화면 `<sm` 에서는 `min(280px, 85vw)`)
- **햄버거 버튼:** 헤더 좌측, `aria-label="메뉴 열기"`, 터치 타깃 44×44px
- **진입 모션:** `translateX(-100%)` → `0`, 220ms ease-out (exit 160ms ease-in, `exit-faster-than-enter` 규칙)
- **닫기:** ESC 키, scrim 탭, swipe-left gesture, 네비 항목 선택 시 모두 닫기

### 4.2 CenterShell (종목 상세용)

```
┌─────────────────────────────────────────────┐
│ Header (sticky, h=56px)                     │
├─────────────────────────────────────────────┤
│           ┌─────────────────────┐           │
│           │ Content             │           │
│           │ max-width: 1024px   │           │
│           │ (max-w-4xl)         │           │
│           │ padding: 24px       │           │
│           └─────────────────────┘           │
└─────────────────────────────────────────────┘
```

| 영역 | 치수/스타일 |
|---|---|
| Header | AppShell과 동일 (h=56px, sticky, blur) |
| Content wrapper | `max-width: 1024px; margin: 0 auto; padding: 24px;` |
| 모바일 | horizontal padding `16px` (`<sm`에서 `--s-4`) |

### 4.3 Shell 공통

- Outer `.shell` wrapper (필요 시): `max-width: 1240px; margin: 0 auto; padding: 32px 24px 64px;`
- 전역 스크롤바: 기본 브라우저. 커스텀 스크롤바 미사용.

### 4.4 Page Back Nav (앱 공통 패턴)

**규칙:** 컨텐츠 페이지(홈 리스트 제외한 하위 경로)의 **주 타이틀 왼쪽 인라인**에 back-link 를 배치한다. 별도 breadcrumb 줄을 쓰지 않는다.

**적용 대상:**
- 종목 상세 (`/stocks/[code]`) — 타이틀 = 종목명, back → `/` (홈)
- 뉴스 전체 페이지 (`/stocks/[code]/news`) — 타이틀 = `{종목명} — 최근 7일 뉴스`, back → `/stocks/[code]`
- 이후 추가되는 모든 *종속* 페이지 (토론방 전체, 설정 하위 등)

**구조:**
```html
<h1 class="page-title">
  <a href="{상위경로}" class="back-link" aria-label="{상위} 로 돌아가기">
    <svg><!-- lucide arrow-left --></svg>
  </a>
  {페이지 주 타이틀}
</h1>
```

**스타일 토큰:**
| 속성 | 값 |
|---|---|
| 크기 | `28px × 28px` (터치 타겟은 `padding` 으로 44px 확보 — 또는 모바일에서 `36px × 36px`) |
| 아이콘 | `lucide-react` `arrow-left`, 18px stroke 2 |
| 색 (idle) | `--muted-fg` |
| 색 (hover/focus-visible) | `--fg` + 배경 `--muted` |
| radius | `--radius-sm` (8px) |
| margin-right | `--s-2` (8px) — 타이틀과 간격 |
| vertical-align | `middle` (h1 baseline 조정) |
| focus ring | §8.5.5 Double-Ring Focus 준수 |

**접근성 계약:**
- `aria-label` 필수. 문구 = `"{상위 페이지 명} 로 돌아가기"` (예: `"종목 상세로 돌아가기"`, `"목록으로 돌아가기"`). 단순 "뒤로" 금지.
- 키보드 포커스 가능 (`<a href>` 사용, `<button>` 금지 — 브라우저 back 과 구분).
- `router.back()` 쓰지 말 것. `href` 로 **명시적 상위 경로** 지정. 사용자가 외부 링크에서 진입한 경우에도 안전.

**금지:**
- 별도 `<nav>` breadcrumb 막대 도입 금지. 단층(1단계) 뒤로만 지원.
- 페이지 좌상단 플로팅 back 버튼 금지 (타이틀 앵커링이 스캔 동선).
- 타이틀 오른쪽에 배치 금지.

**컴포넌트화:** `webapp/src/components/layout/page-header.tsx` 에 `<PageHeader title backHref backLabel />` 로 추출 권장. Phase 7 에서 첫 적용, Phase 8 이후 모든 컨텐츠 페이지가 재사용.

---

## 5. `<Number>` Component Spec

### 5.1 Props

```ts
type NumberFormat = 'price' | 'percent' | 'volume' | 'marketCap' | 'plain';

interface NumberProps {
  value: number;
  format: NumberFormat;
  showSign?: boolean;    // default false — percent일 때 흔히 true
  withColor?: boolean;   // default false — true면 양/음/0 에 따라 up/down/flat 자동 매핑
  precision?: number;    // 소수점 자릿수 override (format별 기본값 있음)
  className?: string;
}
```

### 5.2 Format 규칙 (locale = `ko-KR` 고정)

| Format | 기본 precision | 출력 예시 | 단위 |
|---|---|---|---|
| `price` | 0 | `58,700 원` | `원` (숫자 뒤 공백 + 한글 단위) |
| `percent` | 2 | `+3.25%` (showSign) / `3.25%` | `%` (공백 없음) |
| `volume` | 0 | `1,248,300 주` | `주` |
| `marketCap` | 1 | `350.4 조원` / `58.7 억원` (자동 축약) | `조원` / `억원` |
| `plain` | 0 | `1,234` | — |

**축약 규칙 (marketCap):**
- `>= 1e12` (조 단위): `value / 1e12` + `조원`
- `>= 1e8` (억 단위): `value / 1e8` + `억원`
- 미만: `value` + `원`

**showSign:**
- `true` + positive → prefix `+`
- `true` + negative → prefix `-` (값은 절댓값으로 표시하거나 JS 기본 부호 그대로)
- `false` → 부호 생략 (음수는 JS 기본 `-` 유지)

### 5.3 스타일

- 항상 `font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1, 'ss01' 1;`
- 폰트: **Geist Mono** (부모에서 상속 가능하면 상속, 아니면 `.mono` 유틸 강제)
- 정렬: **우측 정렬**을 기본으로 권장. 테이블 셀에서 `text-align: right` 클래스(`.num`)와 함께 사용.
- `withColor=true`:
  - `value > 0` → `color: var(--up)`
  - `value < 0` → `color: var(--down)`
  - `value === 0` → `color: var(--flat)`

### 5.4 사용 예시

```tsx
<Number value={58700} format="price" />                        // 58,700 원
<Number value={0.0325} format="percent" showSign withColor />  // +3.25% (빨강)
<Number value={-0.012} format="percent" showSign withColor />  // -1.20% (파랑)
<Number value={1248300} format="volume" />                     // 1,248,300 주
<Number value={3.504e14} format="marketCap" />                 // 350.4 조원
```

---

## 6. Catalog Page (`/design`)

**경로:** `webapp/src/app/design/page.tsx`
**개발 URL:** `http://localhost:3000/design`
**프로덕션:** 상시 접근 가능 (D-30)

### 6.1 섹션 구성 (D-29 + UI-PREVIEW 레이아웃 반영)

| # | 섹션 | 내용 |
|---|---|---|
| 0 | Intro | Phase 3 요약, Light↔Dark 토글 (전체 페이지에 반영) |
| 1 | Color Palette | Light/Dark dual-grid. 각 토큰을 swatch(chip + name + OKLCH 문자열)로 표시. 금융 세만틱 토큰(up/down/flat) 강조. |
| 2 | Type Scale | h1~caption 전체 행. 한글·영문·숫자 샘플 포함. 예: "오늘 상한가에 근접한 32 종목" |
| 3 | Spacing | `--s-1`~`--s-10` 막대 시각화 (실제 픽셀 폭) |
| 4 | Components | 9종 전체. 각 variant × state(default/hover/focus/disabled) 매트릭스 |
| 5 | Layouts | AppShell, CenterShell 각 iframe 미리보기(또는 인라인 mock) |
| 6 | `<Number>` 예시 | format 5종 × withColor 조합 샘플 |

### 6.2 테마 토글

상단 우측 고정 버튼 (`theme-toggle`). 3상태: Light / Dark / System. `next-themes`의 `useTheme()` 훅 사용. 변경 시 즉시 전 섹션 반영 (CSS 변수 기반이므로 자동).

---

## 7. Accessibility

### 7.1 대비 (WCAG 2.1 AA)

| 쌍 | Light 대비 | Dark 대비 | 기준 |
|---|---|---|---|
| `--fg` on `--bg` | ~14:1 | ~16:1 | 4.5:1 본문 ✓ |
| `--muted-fg` on `--bg` | ~4.8:1 | ~5.2:1 | 4.5:1 본문 ✓ |
| `--primary-fg` on `--primary` | ~5.1:1 | ~6.8:1 | 4.5:1 ✓ |
| `--up` on `--bg` | ~4.6:1 | ~5.0:1 | 4.5:1 텍스트 ✓ |
| `--down` on `--bg` | ~4.8:1 | ~5.3:1 | 4.5:1 텍스트 ✓ |
| `--up` on `--up-bg` | ~4.7:1 | ~5.1:1 | 4.5:1 배지 텍스트 ✓ |
| `--down` on `--down-bg` | ~4.9:1 | ~5.4:1 | 4.5:1 배지 텍스트 ✓ |
| `--border` on `--bg` | 3:1 | 3:1 | 3:1 UI 컴포넌트 ✓ |

*대비 비율은 자동 계산 도구로 검증 필요 (Phase 3 구현 시 실측 값으로 교체). 실측 시 AA 미달 발견되면 해당 토큰 명도 조정 후 본 표 갱신.*

### 7.2 포커스

> **최종 규격은 §8.5.5 Double-Ring Focus 로 Override.** 아래는 초기 최소 규격이며 실제 구현은 §8.5.5 참조.

```css
*:focus-visible {
  /* §8.5.5 Double-Ring 최종 적용 */
  outline: 2px solid var(--ring);
  outline-offset: 3px;
  box-shadow: 0 0 0 4px color-mix(in oklch, var(--ring) 25%, transparent);
  border-radius: inherit;
}
```

모든 인터랙션 요소(`button`, `a`, `input`, `[role=button]`, slider thumb 등)에 적용. `:focus`(마우스 클릭)는 링을 숨길 수 있으나 `:focus-visible`(키보드)은 항상 표시.

### 7.3 키보드 네비게이션

| 키 | 동작 |
|---|---|
| Tab / Shift+Tab | 포커스 이동 (모든 인터랙션 요소 순회) |
| Enter / Space | 버튼·링크 활성화 |
| Esc | 모달·드로어·팝오버 닫기 |
| Arrow | Slider 값 조정 (step 단위), Radix menu 탐색 |

Radix/shadcn 기본 처리를 신뢰 (D-27).

### 7.4 시맨틱 HTML

- `<nav>`, `<main>`, `<header>`, `<aside>`, `<section>`, `<button>` 을 의미에 맞게 사용.
- `<div onclick>` 로 버튼 대체 금지.
- 아이콘 전용 버튼은 `aria-label` 필수.

---

## 8. Copy & Tone Guide

### 8.1 톤 원칙

- 건조·정중·직접적. 트레이더 대상 — 군더더기 금지.
- 기술 용어는 한국 증권 업계 관례 따름 (예: "등락률", "거래량", "시가총액").

### 8.2 상태별 카피 패턴

| 상태 | 예시 |
|---|---|
| 빈 상태 (스캐너) | "조건에 맞는 종목이 없습니다.\n임계값을 낮춰 보세요." |
| 빈 상태 (검색) | "검색 결과가 없습니다.\n종목명 또는 6자리 종목코드로 다시 시도하세요." |
| 로딩 | (텍스트 대신 Skeleton 사용. 필요 시 "불러오는 중…") |
| 에러 (API) | "데이터를 불러오지 못했습니다.\n잠시 후 다시 시도해 주세요." |
| 에러 (네트워크) | "네트워크 연결을 확인해 주세요." |
| 장 마감 안내 | "현재 장이 열리지 않았습니다. 마지막 갱신: 2026-04-11 15:30 KST" |
| 지연 고지 | "시세는 약 15초 지연될 수 있습니다" (caption, muted-fg) |

### 8.3 버튼 라벨

동사형 간결. 2~4자 권장.

| 용도 | 라벨 |
|---|---|
| 추가 | "추가", "관심등록" |
| 저장 | "저장" |
| 취소 | "취소" |
| 삭제 (destructive) | "삭제" (+ 확인 다이얼로그) |
| 새로고침 | "새로고침" |
| 필터 | "필터" |
| 초기화 | "초기화" |
| 닫기 | "닫기" |

### 8.4 Destructive 액션

| 액션 | 패턴 |
|---|---|
| 관심 종목 삭제 | `destructive` 버튼 + 확인 다이얼로그 "[{종목명}] 을 관심 목록에서 삭제할까요?" / [취소] [삭제] |

### 8.5 단위 표기

| 값 | 표기 |
|---|---|
| 가격 | `58,700 원` (숫자 + 공백 + `원`) |
| 등락률 | `+3.25%` (숫자 + `%`, 공백 없음) |
| 거래량 | `1,248,300 주` (숫자 + 공백 + `주`) |
| 시가총액 | `350.4 조원` / `58.7 억원` (자동 축약) |
| 시각 | `2026-04-13 14:32:08 KST` 또는 `14:32` (컨텍스트) |

### 8.6 숫자·한글 간격

- 숫자 뒤에 한글 단위가 올 때는 **공백 1칸** (예: `58,700 원`).
- `%`, `-`, `+` 같은 ASCII 기호는 붙여 씀.

---

## 8.5 Frontend Craft Upgrades (frontend-design 리뷰 반영)

shadcn 기본 구현을 넘어 **프리미엄 금융 UI** 감각을 확보하기 위한 6개 추가 규격.

### 8.5.1 DensityProvider Compound Pattern (③)

**목적:** 같은 페이지 내에서도 구역별로 밀도 전환 (예: 스캐너 = compact, 종목 상세 = comfortable). 토큰 `--row-h` · `--cell-pad-y` 를 **스코프 단위로 재정의**.

**3단계 프리셋:**

| 프리셋 | `--row-h` | `--cell-pad-y` | 용도 |
|---|---|---|---|
| `compact` | 32px | 6px | 최대 종목 수 표시 (Scanner 데스크톱 기본) |
| `default` | 36px | 8px | 범용 (컴포넌트 기본값) |
| `comfortable` | 44px | 12px | 터치 친화 (모바일 자동), 종목 상세 |

**CSS 스코프 재정의:**
```css
[data-density="compact"]     { --row-h: 32px; --cell-pad-y: 6px; }
[data-density="default"]     { --row-h: 36px; --cell-pad-y: 8px; }
[data-density="comfortable"] { --row-h: 44px; --cell-pad-y: 12px; }

/* 모바일 자동 comfortable (이슈 4 통합) */
@media (max-width: 767px) {
  [data-density]:not([data-density="compact"]) {
    --row-h: 44px; --cell-pad-y: 12px;
  }
}
```

**React API:**
```tsx
// webapp/src/components/providers/density-provider.tsx
<DensityProvider value="compact">
  <Table>...</Table>
</DensityProvider>
```

내부 구현은 context로 `data-density` 속성을 최외곽 div에 주입. useDensity() hook 으로 자식 컴포넌트에서 읽기 가능.

### 8.5.2 Mixed-Script Baseline Balance (④)

**문제:** Pretendard(한글) + Geist Mono(숫자) 혼합 시 x-height·baseline 미세 어긋남. 큰 폰트(24px+)에서 눈에 띔.

**전역 보정 규칙:**

```css
html[lang="ko"] {
  word-break: keep-all;       /* 단어 중간 줄바꿈 금지 */
  overflow-wrap: break-word;
  letter-spacing: -0.01em;    /* Pretendard 기본 tracking 타이트 보정 */
}

/* 숫자가 한글과 같은 라인에 섞일 때 */
.mono {
  /* Geist Mono x-height 보정 — 한글 중심선과 align */
  transform: translateY(0.5px);
  letter-spacing: -0.01em;
}

/* 24px 이상 큰 숫자 — optical sizing 활성 */
.mono.text-lg,
.mono.text-xl,
.mono[class*="text-h"] {
  font-variation-settings: 'opsz' auto;
}
```

**적용 검증:** 카탈로그 페이지의 "삼성전자 58,700원 +3.25%" 라인에서 Before/After 비교 스크린샷 포함 필수.

### 8.5.3 Border 3단계 Hairline System (mini-B)

**토큰 추가:**

| Token | Light | Dark | 용도 |
|---|---|---|---|
| `--border-subtle` | `oklch(0.18 0 0 / 0.06)` | `oklch(1 0 0 / 0.06)` | 행 구분선, 내부 divider (거의 안 보이게) |
| `--border` | `oklch(0.92 0 0)` | `oklch(0.24 0 0)` | 카드·컨테이너 경계 (기본) |
| — (emphasis) | `2px solid var(--primary)` | 동일 | 선택·활성 상태 (토큰 없이 util) |

**사용 규약:**
- 테이블 `tbody tr` 하단: `border-bottom: 1px solid var(--border-subtle)` (현재 `--border` 에서 교체)
- 카드·Input·기본 divider: `--border`
- 선택된 행·포커스된 카드: `outline: 2px solid var(--primary); outline-offset: -2px;`

### 8.5.4 Card — Inner Highlight + Soft Shadow (mini-A)

**기존 Card spec (§3.2) 보완:**

```css
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: var(--s-5);  /* 24px */

  /* 3층 섀도로 물리감 확보 (과하지 않게) */
  box-shadow:
    inset 0 1px 0 var(--border-subtle),    /* 상단 inner highlight — 3D 감각 */
    0 1px 2px oklch(0 0 0 / 0.04),          /* near-shadow */
    0 8px 24px oklch(0 0 0 / 0.04);         /* far-shadow (매우 연함) */
}

/* Dark mode — inner highlight 가 더 중요 (배경과 카드 배경 차이 적음) */
.dark .card {
  box-shadow:
    inset 0 1px 0 oklch(1 0 0 / 0.04),      /* dark 에서도 미세 상단 highlight */
    0 1px 2px oklch(0 0 0 / 0.4),
    0 8px 24px oklch(0 0 0 / 0.3);
}
```

**규칙:** `.card-plain` (그림자 없음) variant 제공 — 밀집 레이아웃에서 겹침 많을 때 사용.

### 8.5.5 Double-Ring Focus (mini-C)

**모든 인터랙티브 요소 공통:**

```css
button:focus-visible,
a:focus-visible,
[role="button"]:focus-visible,
input:focus-visible,
[data-slider-thumb]:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 3px;
  box-shadow: 0 0 0 4px color-mix(in oklch, var(--ring) 25%, transparent);
  /* outline (2px 선) + 갭 (3px) + halo (4px 반투명) = 시그니처 포커스 */
}
```

**접근성:** `outline-offset: 3px` 보장으로 border 와 겹침 방지. halo 는 `25%` alpha 로 배경 침범 없음.

### 8.5.6 Token 추가 요약

Section 1 Design Tokens 및 Section 9 Tokens Reference 에 다음 토큰 **추가 반영 필수**:

```css
:root {
  /* ... 기존 ... */
  --border-subtle: oklch(0.18 0 0 / 0.06);
}
.dark {
  /* ... 기존 ... */
  --border-subtle: oklch(1 0 0 / 0.06);
}
```

---

## 9. Tokens Reference — Source Export

Planner/Executor가 `globals.css` 작성 시 그대로 복사할 수 있는 완성본:

```css
@import 'tailwindcss';

@custom-variant dark (&:where(.dark, .dark *));

@theme {
  /* spacing & radius는 Tailwind v4 기본 scale 사용 — 아래 토큰은 CSS 변수로만 보조 노출 */
}

:root {
  --bg: #FFFFFF;
  --fg: oklch(0.18 0 0);
  --muted: oklch(0.96 0 0);
  --muted-fg: oklch(0.50 0 0);
  --border: oklch(0.92 0 0);
  --border-subtle: oklch(0.18 0 0 / 0.06);
  --input: oklch(0.92 0 0);
  --ring: oklch(0.63 0.18 250);
  --card: #FFFFFF;
  --card-fg: oklch(0.18 0 0);
  --popover: #FFFFFF;
  --popover-fg: oklch(0.18 0 0);
  --primary: oklch(0.63 0.18 250);
  --primary-fg: #FFFFFF;
  --secondary: oklch(0.96 0 0);
  --secondary-fg: oklch(0.18 0 0);
  --accent: oklch(0.95 0.03 250);
  --accent-fg: oklch(0.35 0.12 250);
  --destructive: oklch(0.66 0.20 22);
  --destructive-fg: #FFFFFF;
  --up: oklch(0.66 0.20 22);
  --down: oklch(0.63 0.18 250);
  --flat: oklch(0.55 0 0);
  --up-bg: oklch(0.97 0.03 22);
  --down-bg: oklch(0.97 0.03 250);

  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px;
  --s-5: 24px; --s-6: 32px; --s-8: 48px; --s-10: 64px;
  --r-sm: 4px; --r: 6px; --r-md: 8px; --r-lg: 12px;

  --t-caption: 12px; --t-sm: 14px; --t-base: 16px; --t-lg: 18px;
  --t-h4: 18px; --t-h3: 20px; --t-h2: 24px; --t-h1: 30px;
  --lh-tight: 1.2; --lh-normal: 1.5;

  --row-h: 36px; --cell-pad-x: 12px; --cell-pad-y: 8px;

  --font-sans: 'Pretendard Variable', Pretendard, -apple-system,
               BlinkMacSystemFont, 'Apple SD Gothic Neo', system-ui, sans-serif;
  --font-mono: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}

.dark {
  --bg: oklch(0.08 0 0);
  --fg: oklch(0.96 0 0);
  --muted: oklch(0.18 0 0);
  --muted-fg: oklch(0.65 0 0);
  --border: oklch(0.24 0 0);
  --border-subtle: oklch(1 0 0 / 0.06);
  --input: oklch(0.24 0 0);
  --ring: oklch(0.72 0.16 250);
  --card: oklch(0.12 0 0);
  --card-fg: oklch(0.96 0 0);
  --popover: oklch(0.14 0 0);
  --popover-fg: oklch(0.96 0 0);
  --primary: oklch(0.72 0.16 250);
  --primary-fg: oklch(0.10 0 0);
  --secondary: oklch(0.18 0 0);
  --secondary-fg: oklch(0.96 0 0);
  --accent: oklch(0.22 0.05 250);
  --accent-fg: oklch(0.85 0.10 250);
  --destructive: oklch(0.72 0.19 22);
  --destructive-fg: oklch(0.10 0 0);
  --up: oklch(0.72 0.19 22);
  --down: oklch(0.72 0.16 250);
  --flat: oklch(0.65 0 0);
  --up-bg: oklch(0.22 0.06 22);
  --down-bg: oklch(0.22 0.05 250);
}
```

---

## 10. References

- **시각 소스 오브 트루스:** `.planning/phases/03-design-system/03-UI-PREVIEW.html` (사용자 확정 2026-04-13)
- **아키텍처 결정:** `.planning/phases/03-design-system/03-CONTEXT.md` — D-01 ~ D-31
- **Phase Goal:** `.planning/ROADMAP.md` — Phase 3 Success Criteria #1~#5
- **Requirements:** `.planning/REQUIREMENTS.md` — DSGN-01 ~ DSGN-05
- **Toss Design System (공개 참고):** https://toss.im/slash
- **Geist Mono font:** https://vercel.com/font
- **Pretendard:** https://github.com/orioncactus/pretendard
- **Tailwind v4 @theme:** https://tailwindcss.com/docs/theme
- **shadcn/ui (Tailwind v4):** https://ui.shadcn.com/docs/tailwind-v4
- **next-themes:** https://github.com/pacocoursey/next-themes
- **WCAG 2.1 AA:** https://www.w3.org/WAI/WCAG21/quickref/

---

## 11. Open Items for Planner (재량 영역 — CONTEXT.md D-31 상속)

Planner가 `/gsd-plan-phase 3`에서 해결할 세부 구현 결정:

1. **Pretendard Variable 서브셋 unicode-range 분할** — Latin/KS X 1001 단일 파일 vs 분할 로드 성능 트레이드오프
2. **shadcn 컴포넌트 Tailwind v4 호환** — 공식 릴리즈 그대로 vs 커스텀 패치 필요 여부 검증
3. **`<Number>` 내부 구현** — `Intl.NumberFormat('ko-KR')` 캐싱 전략, 서버 컴포넌트 호환성
4. **ThemeProvider 옵션** — `disableTransitionOnChange` 사용 여부, `storageKey` 네이밍
5. **카탈로그 UX** — 단일 스크롤 vs 섹션 탭 (기본값: 단일 스크롤 + 사이드 목차)
6. **Geist Mono 로드 방식** — `next/font/google` 의 `Geist_Mono` vs self-host (woff2 커밋)
7. **Slider 접근성 상세** — `aria-valuenow`/`aria-valuetext` 텍스트 포맷 (예: "25퍼센트")
8. **Drawer 오버레이 구현** — Radix Dialog 기반 vs 커스텀
9. **접근성 대비 실측 검증** — Section 7.1 표의 자동 계산 값을 실제 OKLCH 변환 후 WCAG 도구로 재측정하여 미달 시 명도 조정

---

## UI-SPEC COMPLETE

**Phase:** 3 - Design System
**Design System:** shadcn/ui + Tailwind v4 + Pretendard Variable (한글) + Geist Mono (숫자) (BBAA preset + frontend-design 업그레이드 반영)

### Contract Summary
- Spacing: 4px scale (--s-1 ~ --s-10)
- Typography: 8단계 type scale (12~30px), 4 weights (400/500/600/700), 2 line-heights (1.2 tight / 1.5 normal)
- Color: 순백/순검정 배경 + 토스 팔레트 (Primary/Ring/Down = Toss Blue, Up/Destructive = Toss Red, Flat = 중성 회색) — Light/Dark 2세트
- Components: 9종 (Button × 4+1 variant × 3 size, Card, Table, Badge × 6, Input, Skeleton, Slider, Separator, Tooltip)
- Layouts: AppShell (56px header + 240/64px sidebar), CenterShell (max-w-1024 center)
- `<Number>`: 5 format (price/percent/volume/marketCap/plain), withColor 자동 up/down/flat 매핑, ko-KR locale, Geist Mono + tabular-nums + ss01 (slashed zero)
- Copywriting: 상태별 패턴 7종, 버튼 라벨, 단위 표기, destructive 확인 다이얼로그
- Density: row-h 36px · cell-pad 8/12

### File Created
`/Users/alex/repos/gh-radar/.planning/phases/03-design-system/03-UI-SPEC.md`

### Pre-Populated From
| Source | Decisions Used |
|--------|---------------|
| 03-CONTEXT.md | D-01 ~ D-31 (31개) |
| 03-UI-PREVIEW.html | 전체 토큰·컴포넌트·레이아웃 구체값 (사용자 확정) |
| REQUIREMENTS.md | DSGN-01 ~ DSGN-05 |
| ROADMAP.md | Phase 3 Success Criteria #1~#5 |
| 사용자 세션 | BBAA preset + 토스 팔레트 최종 조정 |

### Ready for Verification
UI-SPEC 계약 완료. `/gsd-ui-check 3` 또는 `/gsd-plan-phase 3` 진행 가능.
