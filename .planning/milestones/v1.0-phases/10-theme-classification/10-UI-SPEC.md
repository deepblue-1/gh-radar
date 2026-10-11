---
phase: 10
slug: theme-classification
status: approved
shadcn_initialized: true
preset: gh-radar-toss (existing globals.css tokens)
created: 2026-06-09
approval: approved 2026-06-09 (사용자 HTML 목업 시각 검토 — gsd-ui-checker 대신 인터랙티브 목업 비교로 승인)
mockup_ref: .planning/phases/10-theme-classification/mockups/themes-ui-mockup.html
chosen_variant: "C · 랭킹 (Ranking) — /themes 목록"
---

# Phase 10 — UI Design Contract

> 프론트엔드 시각·인터랙션 계약. **gsd-ui-checker 대신 사용자와 HTML 목업(3개 변형)을 직접 비교해 승인** 했다. 채택: **/themes 목록 = 변형 C(랭킹)**. 모든 값은 기존 `webapp/src/styles/globals.css` 토큰을 그대로 사용한다(신규 토큰 도입 금지).

**시각 참조(필수):** `.planning/phases/10-theme-classification/mockups/themes-ui-mockup.html` — 브라우저로 열어 채택안(변형 C) + 유저 CRUD 모달의 실제 렌더를 확인할 것. 실행자는 이 목업을 시각 타깃으로 삼는다.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn/ui (이미 설치됨 — `webapp/src/components/ui/`) |
| Preset | 기존 globals.css 토큰 (Toss풍 — shadcn neutral override). **신규 preset 금지** |
| Component library | Radix (shadcn 기반) |
| Icon library | lucide-react (sidebar 선례: `Activity`, `Star`) |
| Font | Pretendard Variable(sans, 한글) + Geist Mono(`.mono` — 숫자, tabular-nums slashed-zero) |

**재사용 컴포넌트 (신규 작성 금지, 복제·확장):**
- `ui/`: `badge`, `button`, `card`, `dialog`, `input`, `command`(종목 검색), `skeleton`, `separator`, `tooltip`, `number`
- `scanner/scanner-table.tsx`, `scanner-card-list.tsx`, `scanner-skeleton.tsx`, `scanner-empty.tsx`, `scanner-error.tsx` → `/themes/[id]` 종목 행·상태
- `stock/info-stock-card.tsx` → `<lg` 카드
- `watchlist/watchlist-client.tsx` 외 watchlist 스택 → 유저 테마 CRUD 패턴
- `layout/app-sidebar.tsx` → nav 에 **테마** 항목 추가

---

## Spacing Scale

기존 토큰 사용 (`--s-*`, 4 배수):

| Token | Value | Usage |
|-------|-------|-------|
| --s-1 | 4px | 아이콘 갭, 인라인 |
| --s-2 | 8px | 컴팩트 간격, 칩 갭 |
| --s-3 | 12px | 카드/행 내부 갭, 그리드 갭 |
| --s-4 | 16px | 기본 요소 간격, 카드 패딩 |
| --s-5 | 24px | 섹션 패딩, 페이지 헤더 하단 |
| --s-6 | 32px | 섹션 구분, main 좌우 패딩 |
| --s-8 / --s-10 | 48 / 64px | 레이아웃 |

Radius: `--r-sm 4 / --r 6 / --r-md 8 / --r-lg 12`. Exceptions: none.

---

## Typography

기존 토큰:

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 16px (--t-base) | 400 | 1.5 |
| Label/Caption | 12px (--t-caption) | 600 | 1.2 |
| Small | 14px (--t-sm) | 400/600 | 1.5 |
| Heading (페이지 h1) | 24px (--t-h2) | 700 | 1.2 |
| Section (h2) | 18px (--t-h4) | 700 | 1.2 |
| Display (랭킹 평균값/순위) | 18–26px | 800 | 1.2 |

숫자(등락률·가격·종목수·순위)는 **반드시 `.mono`** + 등락 색상.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--bg` (#FFF / oklch(0.08)) | 배경, 표면 |
| Secondary (30%) | `--muted` / `--secondary` / `--card` | 카드, 사이드바, 헤더 셀 |
| Accent (10%) | `--accent` / `--primary`(blue) | active nav, 내 테마 강조 테두리, 1차 CTA, AI 출처 뱃지 |
| Up / Down | `--up`(빨강) / `--down`(파랑) | **한국 관례** — 등락률·강도 막대·순위 강조 |
| Destructive | `--destructive` | 테마 삭제 등 파괴적 동작만 |

Accent reserved for: 활성 nav 링크, 내 테마 카드/칩 테두리, 1차 CTA 버튼, AI-source 뱃지. (모든 인터랙티브 요소에 남발 금지.)

출처 뱃지 도트: 네이버=green dot / 알파스퀘어=blue dot / AI=purple dot (`--accent` 배경).

---

## Screen Contracts (채택안)

### S1. `/themes` 목록 — **변형 C (랭킹)** ✅

```
[페이지 헤더]  테마 (h1)                         ● 최근 갱신 16:00 KST (mono)
              지금 뜨는 테마 랭킹 — 상위 3종목 평균 등락률 (sub, muted)

⭐ 내 테마                                              [＋ 테마 만들기] (primary)
┌──────────┐ ┌──────────┐ ┌──────────────────┐
│ 내 급등관심 │ │ 정치테마모음 │ │ ＋ 새 테마/시스템 복사 │   ← 가로 스크롤 칩 (border=primary tint)
│ +15.1% 🔴 │ │ +6.8% 🔴 │ │     (dashed)       │
│ 8종목·fork │ │ 22종목    │ └──────────────────┘
└──────────┘ └──────────┘
(내 테마 없음 → "아직 내 테마가 없어요" + 생성 CTA + 시스템 복사 힌트)

시스템 테마 랭킹                                  ↓ 상위 3종목 평균 등락률 (sort pill)
┌─────────────────────────────────────────────────────────────┐
│ 1  초전도체  [●네이버] 12종목                          +18.4% │ ← ritem (top3 = rnum 빨강)
│    [신성델타테크 +29.9][서남 +18.4][모비스 +12.1]  ▰▰▰▰▰▰░  │   강도 막대(빨강/파랑) + 평균값(t-lg/800)
├─────────────────────────────────────────────────────────────┤
│ 2  이재명(정치) [●알파스퀘어] 41종목                   +14.2% │
│ ...                                                           │
│ 8  한동훈(정치) [●알파스퀘어] 19종목                   -2.4%  │ ← 하락 = 파랑 막대
└─────────────────────────────────────────────────────────────┘
[출처: 네이버 금융 테마 · 알파스퀘어 · AI 보강(Claude) · 일 1회 16:00 KST 갱신]
```

- **레이아웃:** 내 테마(상단, 가로 스크롤 칩) → 시스템 테마(랭킹 리스트). `ritem` grid `34px 1.1fr 1fr auto`.
- **정렬:** 상위 3종목 평균 등락률 desc. 강도 막대 width = `|avg| / maxAvg`, 색 = avg≥0 빨강 / <0 파랑. (계산 위치는 RESEARCH 권장 = server 실시간 `stock_quotes` 청크 IN / 장외 일봉 close.)
- **행 클릭** → `/themes/[id]`. 키보드 포커스 가능(전역 double-ring focus).
- **출처 표기**(5원칙) 하단 + 뱃지 도트 상시 노출.
- **states:** loading = 랭킹 행 skeleton(scanner-skeleton 패턴 stagger), error = `role="alert"` 카드(watchlist-client 선례), 내 테마 empty = 인라인 카드.

### S2. `/themes/[id]` 상세

- 헤더: 테마명(h1 t-h2) + 출처 뱃지 + 종목수 + 상위3 평균. 뒤로가기. **유저 테마면** [편집]/[종목 추가·제거] 노출(시스템 테마는 read-only).
- 본문: 소속 종목 리스트 — `lg+` **scanner-table 재사용**(종목명·코드·마켓·현재가·등락률·거래대금·⭐), `<lg` **scanner-card-list/InfoStockCard 재사용**. 행 클릭 → `/stocks/[code]`. ⭐ = WatchlistToggle.
- states: scanner skeleton/empty/error 재사용. 종목별 출처 표기.

### S3. `/stocks/[code]` "이 종목의 테마" 칩 (D-16)

- `stock-detail-client.tsx` 에 신규 섹션. 칩 = 시스템 테마(출처 도트) + 로그인 유저의 내 테마(이 종목 포함분). 칩 클릭 → `/themes/[id]`.
- 최대 ~6개 노출 + "+N" overflow(popover 로 전체). 분류 테마 없음 → 섹션 숨김 or 옅은 "분류된 테마 없음".

### S4. 유저 테마 CRUD (모달 방식)

- 진입: `/themes` 내 테마 섹션 — [＋ 테마 만들기], 칩의 [✎편집]/[🗑삭제], "시스템 테마에서 복사(fork)".
- **편집 모달(shadcn Dialog):**
  - `테마 이름` input
  - `종목 추가` — 검색 input → suggest 드롭다운(종목명/코드 + 등락률, 클릭 추가). **Phase 6 종목 검색(command) 재사용.**
  - `현재 종목 (N)` — 행별 × 제거
  - footer: [취소] [저장] (저장 시 버튼 로딩)
- **fork** = 스냅샷 복사(그 시점 멤버십 복제 → 독립). 시스템 갱신 전파 안 됨.
- **삭제** = 확인 다이얼로그(파괴적 카피).
- **소유:** per-user owner-only(watchlist RLS 선례). 본인만 조회/편집. 스크래퍼 불가침.
- states: 저장 중 로딩, 에러 인라인/토스트.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA (목록) | `＋ 테마 만들기` |
| Primary CTA (관리) | `＋ 새 테마` |
| Fork affordance | `시스템 테마에서 복사(fork)해서 시작` |
| Empty (내 테마) heading | `아직 내 테마가 없어요` |
| Empty (내 테마) body | `관심 있는 종목을 묶어 나만의 테마를 만들어 보세요` + 생성 CTA |
| Empty (테마 종목 없음) | `이 테마에 표시할 종목이 없습니다` |
| Error state | `테마를 불러오지 못했습니다. 새로고침해주세요.` |
| Destructive 확인 | `테마 삭제: '{이름}' 테마를 삭제할까요? 되돌릴 수 없습니다.` |
| Sort 라벨 | `상위 3종목 평균 등락률` |
| 출처 푸터 | `출처: 네이버 금융 테마 · 알파스퀘어 · AI 보강(Claude) · 일 1회 16:00 KST 갱신` |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | dialog, input, badge, button, command, card, skeleton, separator, tooltip, number | not required |
| third-party | (없음) | n/a |

신규 third-party 레지스트리 도입 없음 — 기존 `ui/` 컴포넌트만 사용.

---

## Sign-Off

> gsd-ui-checker 6-dimension 대신 **사용자 인터랙티브 HTML 목업 비교(변형 A/B/C + CRUD)** 로 검토·승인.

- [x] Copywriting — 한글 카피 확정(위 계약)
- [x] Visuals — 변형 C 채택(목업 시각 확인)
- [x] Color — 기존 토큰, 상승=빨강/하락=파랑 한국 관례 준수
- [x] Typography — 기존 토큰(Pretendard + Geist Mono `.mono`)
- [x] Spacing — 기존 `--s-*` 4배수
- [x] Registry Safety — shadcn official only

**Approval:** approved 2026-06-09 (사용자 HTML 목업 시각 검토)
