---
phase: 6
slug: stock-search-detail
status: draft
shadcn_initialized: true
preset: radix-nova
created: 2026-04-15
---

# Phase 6 — UI Design Contract

> Stock Search & Detail. Frontend-only. Phase 3 디자인 토큰 + Phase 4 AppShell/AppHeader + Phase 5 ko-KR/Asia/Seoul 절대시각·수동 refresh 패턴을 그대로 상속.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn |
| Preset | radix-nova (components.json — baseColor=neutral, cssVariables=true) |
| Component library | radix (via shadcn/ui) + cmdk |
| Icon library | lucide-react |
| Font | Pretendard Variable (sans), Geist Mono (.mono / 숫자) |

**신규 의존성:** `npx shadcn@latest add command` → `webapp/src/components/ui/command.tsx` + `cmdk` 패키지 자동 추가. (CommandDialog 포함 export.)

---

## Spacing Scale

Phase 3 토큰 (`--s-1`~`--s-10`) 그대로 사용. 모두 4의 배수.

| Token | Value | Usage (Phase 6 적용) |
|-------|-------|----------------------|
| s-1 | 4px | Badge 내부 여백, icon-text gap |
| s-2 | 8px | Stats Card 내부 라벨↔값 간격 |
| s-3 | 12px | Cell padding-x |
| s-4 | 16px | Card padding, Stats grid gap (모바일) |
| s-5 | 24px | Hero 내부 블록 간격, Stats grid gap (md+) |
| s-6 | 32px | Hero ↔ Stats ↔ Placeholder 섹션 사이 |
| s-8 | 48px | 페이지 상단 여백 (CenterShell 기본) |
| s-10 | 64px | 미사용 (예약) |

추가 규칙:
- ⌘K Dialog 컨텐츠 좌우 패딩 16px, 항목 row height 36px (`--row-h` default density)
- Hero 현재가 블록과 등락 블록 사이 12px (s-3)
- 모바일(<768px) `[data-density]` 자동 comfortable → row-h 44px (터치 타깃 보장, globals.css §8.5.1)

Exceptions: 없음.

---

## Typography

Phase 3 타입 토큰 사용. 아래는 Phase 6 화면별 매핑.

| Role | Size | Weight | Line Height | 사용처 |
|------|------|--------|-------------|--------|
| Caption | 12px (`--t-caption`) | 600 | 1.2 (`--lh-tight`) | Stats Card 라벨, 갱신시각, 단위(원/주) |
| Body | 14px (`--t-sm`) | 400 | 1.5 (`--lh-normal`) | 자동완성 항목 종목명, placeholder 설명 |
| Heading-S | 18px (`--t-h4`) | 600 | 1.2 | Stats Card 값 (시가/고가/저가 등), Placeholder 카드 제목 |
| Heading-M | 24px (`--t-h2`) | 600 | 1.2 | Hero 종목명 |
| Display | 30px (`--t-h1`) → 모바일 24px (`--t-h2`) | 600 | 1.2 | Hero 현재가 (반응형 축소) |

**숫자 표시 규칙 (필수):** 모든 가격·등락액·등락률·거래량·거래대금·시총은 `.mono` 클래스 → Geist Mono + tabular-nums + slashed-zero. `webapp/src/components/ui/number.tsx` 재사용.

**가중치:** regular(400) + semibold(600) — 2개만. Phase 3 contract와 동일.

---

## Color

Phase 3 OKLCH 팔레트 (light/dark) 그대로 상속. Phase 6 신규 색 없음.

| Role | Token | 사용처 (Phase 6) |
|------|-------|------------------|
| Dominant (60%) | `--bg` (#FFFFFF / dark oklch(0.08 0 0)) | 페이지 배경, ⌘K Dialog 백드롭 contrast 기반 |
| Secondary (30%) | `--card`, `--muted`, `--popover` | Stats Card, ⌘K Dialog surface, Placeholder Card |
| Accent (10%) | `--primary` (oklch(0.63 0.18 250) — Toss blue) | **예약 항목만** (아래 명시) |
| Destructive | `--destructive` (oklch(0.66 0.20 22)) | error.tsx 에러 메시지 강조 + 재시도 버튼 hover ring (보조) |
| Semantic Up | `--up` / `--up-bg` | 등락 양수 (Hero 등락액·등락률 텍스트, Badge variant="up") |
| Semantic Down | `--down` / `--down-bg` | 등락 음수 |
| Semantic Flat | `--flat` | 등락 0 또는 null |

**Accent (`--primary`) 예약 항목 (이 항목 외 사용 금지):**
1. ⌘K Dialog 내 선택된(highlighted) 항목 배경 (cmdk 기본 `data-[selected=true]` → `bg-accent`)
2. AppHeader 검색 input focus ring (`--ring`, primary와 동일 hue)
3. Refresh 버튼 (Phase 5 패턴) 의 spinner 색상
4. `not-found.tsx` "스캐너로 돌아가기" 1차 버튼 (Button variant="default")

**Up/Down 색 의미 (한국 시장 관례):** 빨강(--up)=상승, 파랑(--down)=하락. Phase 3 §3.2 토큰 정의 그대로 — 변경 금지.

---

## Copywriting Contract

모든 사용자 대면 텍스트는 한글. 영문 수치 단위만 예외.

| Element | Copy |
|---------|------|
| AppHeader 검색 input placeholder | `종목명 또는 코드 검색  ⌘K` |
| ⌘K Dialog input placeholder | `종목명 또는 종목코드를 입력하세요` |
| 검색 로딩 | `검색 중…` |
| 검색 빈 결과 (입력 있음) | `"{q}" 에 해당하는 종목이 없습니다` |
| 검색 초기 상태 (입력 없음) | `검색어를 입력하면 결과가 표시됩니다` |
| 검색 에러 | `검색에 실패했습니다. 잠시 후 다시 시도해 주세요.` |
| Primary CTA (상세 페이지) | `새로고침` (refresh 버튼 라벨, lucide `RefreshCw` 아이콘 + 텍스트) |
| Stats grid 라벨 | `시가` / `고가` / `저가` / `거래량` / `거래대금` / `시가총액` / `상한가` / `하한가` |
| 갱신 시각 prefix | `갱신 ` + `HH:MM:SS KST` (예: `갱신 14:32:05 KST`) |
| Null 값 표기 | `—` (em-dash, U+2014) |
| Phase 7 Placeholder 제목 | `관련 뉴스` |
| Phase 7 Placeholder 본문 | `Phase 7 로드맵에서 제공됩니다.` |
| Phase 8 Placeholder 제목 | `종목토론방` |
| Phase 8 Placeholder 본문 | `Phase 8 로드맵에서 제공됩니다.` |
| 404 (`not-found.tsx`) 제목 | `종목을 찾을 수 없습니다` |
| 404 본문 | `종목코드를 다시 확인해 주세요. (영문/숫자 1~10자, 예: 005930)` |
| 404 CTA | `스캐너로 돌아가기` (→ `/scanner`) |
| Error (`error.tsx`) 제목 | `데이터를 불러오지 못했습니다` |
| Error 본문 | `{ApiClientError.message}` (서버 envelope 메시지 그대로) + `잠시 후 다시 시도해 주세요.` |
| Error CTA | `다시 시도` (Next.js error boundary `reset()`) |

**파괴적 액션:** 이번 phase 없음 (조회 전용).

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | `command` (Phase 6 신규), 기존 `card`, `badge`, `button`, `skeleton`, `input`, `popover`, `dialog` | not required |

서드파티 레지스트리 없음. cmdk는 shadcn `command` 블록의 공식 의존성.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
