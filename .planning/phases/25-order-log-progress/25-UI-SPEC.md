---
phase: "25"
slug: "order-log-progress"
status: approved
shadcn_initialized: true
preset: "radix-nova (components.json style) · base radix · baseColor neutral · cssVariables · rsc · iconLibrary lucide"
created: "2026-09-29"
---

# Phase 25 — UI 디자인 계약 (주문로그 · 잔량진행률 · webapp)

> 프론트 phase 의 시각·상호작용 계약이다. gsd-ui-researcher 가 작성하고 gsd-ui-checker 가 검증한다.
> **정본 순서:** `25-CONTEXT.md` 결정(D-01~D-13 + 「이미 확정된 것」, 전부 LOCKED) → **2026-09-29 사용자 확정 8건**(`reference/mockup-open-decisions.html` 머리 「채택 결과」 — 1-A · 2-A · 3-A · **4-B** · 5-A · 6-A · 7-A · 8-A) → 채택 목업 3종(아래) → 이 문서.
> 수치는 채택 목업 CSS 에서 옮긴 값이다. 목업과 이 문서가 다르면 **목업이 이긴다** — 단 아래 「재량 결정」 표에 적은 곳은 이 문서가 이긴다(이유를 표에 적었다).
>
> | 채택 목업 | 이 계약에서 쓰는 부분 |
> |---|---|
> | `.planning/phases/25-order-log-progress/reference/mockup-today-orders-expand.html` | 오늘 주문 행 펼침 **1-A**(통보+상따 한 타임라인) · **2-A**(묶음 한 타임라인 + `#주문번호` 꼬리) · **3-A**(행 전체 클릭 · ▶ 회전) · 모바일 2줄 카드 행 |
> | `.planning/phases/25-order-log-progress/reference/mockup-order-log-tab.html` | 주문로그 탭 **F-A**(한 줄 문장 · 필터줄 · sticky 핀 · 창 분리) |
> | `.planning/phases/25-order-log-progress/reference/mockup-unfilled-progress.html` | 진행률 **B안**(대기 행 아래 보조행) · 모바일 r3 |
> | `.planning/phases/25-order-log-progress/reference/mockup-open-decisions.html` | 남은 결정 8건 채택 변형(1-A~8-A, 4 만 B) — 카드 탭 줄 모양 · 괄호 배지 · 창 분리 머리줄 · 별건 3 · 진행률 r3/r4 · 펼침 로딩/실패/거부 행 |
>
> §2.2b 밴드 경계의 정본은 `webapp/src/styles/globals.css` 상단 주석이다. 이 문서는 경계 숫자를 다시 적지 않고 **밴드 이름**(폰 · 컴팩트 · 와이드 · 데스크톱)과 **재는 컨테이너 이름**(`wb` · `lc`)만 가리킨다. **새 뷰포트 브레이크포인트 0 · 새 컨테이너 경계 숫자 0.**
> **범위:** webapp 만 — 오늘 주문 행 펼침 · 작업대/카드 「주문로그」 탭 · 창 분리 페이지 · 미체결 진행률 B안 · 오늘 주문 별건 3 · 로그 문장 조립의 **표시** 규칙. relay(두 스트림 커서 · `journal.events` · `unf.progress` 푸시) · Supabase(테이블 · 조회 RPC 2) · server(라우트 2)는 이 계약의 **전제 조건**일 뿐 여기서 정하지 않는다 — 아래 「relay/server 의존」 절에 경계만 적는다.

---

## 범위 요약

| 바꾸는 것 | 바꾸지 않는 것 (Non-goals) |
|---|---|
| 오늘 주문 표·카드 행 **펼침**(▶ · 행 전체 클릭 · 통보+상따 한 타임라인 · 묶음 한 타임라인 · 라이브 이어붙임) | 오늘 주문 표 8열 구성 · 계좌 묶음 · 통보 묶기(`MERGE_WINDOW_MS`) 규칙 · 행 요약 시각(HH:MM:SS) · 기록 지연 표식 |
| 공용 패널 탭 **「주문로그」 신설**(미체결 · 잔고 · **주문로그** · 전략 로그) + 필터줄 + sticky 핀 + 괄호 배지 | 「전략 로그」 탭 내용·순서(최신 위)·`StrategyLog` 컴포넌트 — **재사용하지 않고 건드리지 않는다** |
| 카드 탭 **「주문로그」 신설**(정보 · 미체결 · 잔고 · **주문로그** · **전략로그**) — 기존 「로그」 → **「전략로그」 개명**(값 `"log"` 유지) | 카드 탭 본문 고정 높이(`CARD_TABS_BODY_H`) · 접기 규칙 · 탭 요청 통로(`CardTabRequest`) |
| 창 분리 라우트 **`/trading/order-log`**(앱 셸 없음 · ‹ 날짜 › + 「오늘」 · 뷰포트 높이 스크롤) | 앱 셸 · 사이드바 · 기존 `/trading` 라우트 |
| 미체결 **진행률 보조행**(데스크톱 3표면 colSpan 행 · 모바일 r3) — 값은 `unf.progress` 에서만 | 미체결 표 열 구성 · 취소 규율 · 선택 규율 · `StatusNotes` 문구(모바일에서 r3 → **r4** 로 한 줄 내려갈 뿐) |
| 오늘 주문 별건 3(방향 미상 「주문」 · 「접수 불명」 · R(New) 회색 방향) | 투영 status(`rejected` 유지) · 방향 판정 규칙(`orderActionSide`) · 통보 문구 원문 |
| 로그 줄 **표시 모양**(F-A 한 줄 · 카드 dense 줄 · 타임라인 줄) | 문장 **본문 어휘**(조립기 `@gh-radar/shared` + gh-trade 템플릿 v0 · 대조 합의가 정본 — 이 문서가 재작성하지 않는다) |
| — | 새 색 토큰 0 · 새 shadcn 컴포넌트 0 · 새 아이콘 0 · 새 뷰포트/컨테이너 경계 숫자 0 |

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (`webapp/components.json`) |
| Preset | style `radix-nova` · base `radix` · baseColor `neutral` · cssVariables · rsc — `npx --no-install shadcn info` 실측(2026-09-29) |
| Component library | radix (`radix-ui@1.4.3` 통합 패키지) |
| Icon library | lucide (`lucide-react@1.8.0`) — 이 phase 신규 아이콘 **없음**. 펼침 표식 `▶` · 창 분리 `↗` · 핀 `↓` · 날짜 `‹` `›` 는 전부 **텍스트 글리프**(목업 그대로). 카드 탭 접기 `ChevronDown` 은 기존 |
| Font | Pretendard Variable(`--font-sans`) · 숫자·시각·주문번호는 기존 `mono` 클래스(`tabular-nums`) |
| 팔레트 | 공식 TDS `@toss/tds-colors@0.1.0`(globals.css 기존 값). **새 토큰 없음** |
| 반응형 | 작업대 표면 = 컨테이너 `wb`(작업대 루트 선언 · 공용 패널이 이미 쓰는 폰 밴드 판정) · 오늘 주문 카드 / 마이페이지 미체결 = **기존 뷰포트 규칙 그대로**(표 ↔ 카드 행 전환 — §2.2b 비적용 표면) |

---

## Component Inventory

Enumerated by `cd webapp && npx --no-install shadcn info` — 21 components — shadcn@4.2.0 (CLI · `node_modules/shadcn/package.json`) · radix-ui@1.4.3 (`node_modules/radix-ui/package.json`) — 2026-09-29.

설치 목록(원문): badge, button, card, chart, checkbox, command, dialog, input-group, input, popover, separator, sheet, skeleton, slider, switch, table, tabs, textarea, toggle-group, toggle, tooltip.

아래 표는 이 phase 가 쓰는 **알려진 정상 컴포넌트의 비배타 목록**이다 — 닫힌 허용 목록이 아니다. 목록 밖 컴포넌트가 필요하면 설치 여부를 확인하고 쓰는 것이 정상 경로다.

| Component | Import path | Notes |
|-----------|-------------|-------|
| Tabs | `@/components/ui/tabs` | 공용 패널(`TAB_TRIGGER`) · 카드 탭(`CARD_TAB_TRIGGER`)에 트리거 1개씩 추가 — 기존 트리거 문법 그대로 |
| Table · TableRow · TableCell | `@/components/ui/table` | 오늘 주문 펼침 행(`colSpan={8}`) · 진행률 보조행(`colSpan` 7 / `stockScope ? 5 : 7`) — `account-embed-cancel-result` 행과 같은 `<Fragment>` 문법 |
| Tooltip | — | **쓰지 않는다.** 잘린 로그 줄의 전체 문장은 네이티브 `title`(F-A 채택안 「잘림 + title 툴팁」), 폰 밴드는 탭 펼침(결정 2-A). 줄 수백 개에 Radix Tooltip 을 달면 포털·리스너가 줄 수만큼 생긴다 |
| Skeleton | — | **쓰지 않는다.** 로딩은 옅은 한 줄 「불러오는 중…」(결정 8 — 왕복 1회라 짧다) |
| Select (shadcn) | — | 미설치 · **쓰지 않는다.** 필터 3개는 네이티브 `<select>` 를 `.sel` 칩 모양으로 감싼다(모바일 네이티브 피커 · 키보드 · 스크린리더가 공짜) |
| 기존 원자 | `@/components/trading/exchange-tag` · `@/components/trading/origin-tag` | 오늘 주문 행에서 **그대로** 재사용(무변경). 로그 줄의 거래소는 칩이 아니라 문장 안 텍스트 「KRX」(F-A 채택안) |

프로젝트 소유 조각(신설 · 이름은 플래너가 확정해도 된다): `OrderLogList`(세 표면 공통 목록 — `variant: "panel" | "card" | "window"`) · `OrderLogFilters` · `useStickToBottom` · `OrderTimeline`(펼침 본문) · `UnfilledProgress`(보조행 한 줄 — 데스크톱/모바일 두 모양) · shared `formatKstMs` · 문장 조립기 · 표시명 표.

---

## Spacing Scale

Declared values (must be multiples of 4) — **이 표에는 4의 배수만 둔다.** 4의 배수가 아닌 값은 채택 목업이 고정한 값이고 표 아래 「목업 고정 예외 SP」 블록에 따로 적는다.

| Token | Value | Usage (이 phase) |
|-------|-------|-------|
| xs | 4px | ▶ 표식 오른쪽 간격 · 핀 래퍼 패딩 · 창 분리 머리줄 「오늘」 알약 왼쪽 여백 · 로딩/빈/실패 한 줄의 위 패딩 |
| sm | 8px | 진행률 보조행 요소 간격(종류 · 문장 · 막대 · %) · 보조행 아래 패딩 · 타임라인 줄 요소 간격(시각 · 배지 · 문장) · 모바일 펼침 본문 위 여백/점선 위 패딩 · 카드 dense 목록 좌우 패딩 |
| md | 16px | 카드 면 radius(기존 `--r-md`) |
| lg | 24px | 창 분리 날짜 화살표 버튼 24×24 |
| xl | 32px | 타임라인 출처 배지 폭 |
| 2xl | 48px | (신규 사용 없음) |
| 3xl | 64px | (신규 사용 없음) |

**고정 치수(4의 배수):** 공용 패널 주문로그 목록 최대 높이 **172px**(목업 `.body { max-height:172px }` ≈ 9줄) · 진행률 막대 폭 **140px**(데스크톱 보조행) · 타임라인 점 가로 오프셋 −16px · 날짜 화살표 24px.

기존 기하(표 셀 `--cell-pad-x` · `EMB_TD` 좌우 · 카드 탭 본문 `CARD_TABS_BODY_H` · 탭 트리거 높이 28/24)는 **그대로**다.

### 목업 고정 예외 SP — 채택 목업 CSS 원값 (이 phase 에서 재협상하지 않음)

**범위:** 아래 값은 4의 배수가 아니다. 사용자가 2026-09-29 에 **시각적으로 확정한** 채택 목업 4종의 CSS 원값이고, 대부분은 이미 배포된 인접 조각(`StrategyLog` embed 줄 · `EMB_TD` · 기존 칩)과 같은 값이라 격자에 맞추면 인접 표면과 어긋난다. 적용 범위는 **주문로그 목록 · 필터줄 · 핀 · 펼침 타임라인 · 진행률 보조행 · 창 분리 머리줄뿐**이다. 이 목록 밖에 4의 배수가 아닌 간격을 새로 만들지 않는다.

| # | 값 | 자리 | 출처(목업 선택자) |
|---|---|---|---|
| SP-1 | 1px | F-A 줄 사이 간격 | `mockup-order-log-tab.html` `ul.lines { gap:1px }` |
| SP-2 | 2px | 필터 칩 세로 패딩 · 핀 알약 세로 패딩 · 「오늘」 알약 세로 패딩 · 펼침 행 셀 위 패딩 · 보조행 문장 왼쪽 들여쓰기 | `.sel { padding:2px 8px }` · `.pin span { padding:2px 10px }` · `.datenav .today { padding:2px 8px }` · `tr.d td { padding:2px … 10px }` · `.line { padding-left:2px }` |
| SP-3 | 3px | 타임라인 줄 사이 간격 · 카드 dense 목록 위아래 패딩 | `.tl { gap:3px }` · `ul.lines.dense { padding:3px 8px }` |
| SP-4 | 6px | 필터줄 위아래 패딩·요소 간격 · F-A 줄 안 요소 간격 · F-A 목록 위아래 패딩 · 진행률 막대 높이 · 타임라인 점 지름 · 모바일 r3 위 여백 · 「다시 시도」 왼쪽 여백 · 날짜 텍스트 좌우 패딩 | `.filters { padding:6px 10px; gap:6px }` · `ul.lines li { gap:6px }` · `ul.lines { padding:6px 10px }` · `.bar { height:6px }` · `.tl li::before { width:6px; height:6px }` · `.r3 { margin-top:6px }` · `.fail a { margin-left:6px }` · `.datenav .d { padding:0 6px }` |
| SP-5 | 10px | 필터줄 · F-A 목록 · 핀 알약의 좌우 패딩 · 펼침 행 셀 아래 패딩 · 창 분리 머리줄 요소 간격 · 보조행 셀 좌우(= `EMB_TD` `px-2.5` 기존) | `.filters`/`ul.lines { padding:6px 10px }` · `.pin span` · `tr.d td { padding-bottom:10px }` · `.win .bar { gap:10px }` · `table.emb tbody tr.sub td { padding:0 10px 8px }` |
| SP-6 | 82px / 78px | 타임라인 시각 칸 폭(데스크톱 / 모바일) | `.tl .t { width:82px }` · `.row .det .tl .t { width:78px }` |
| SP-7 | 7px | 타임라인 점 세로 오프셋 | `.tl li::before { top:7px }` |
| SP-8 | 2px (선 두께) | 타임라인 세로선(왼쪽 패딩 12px 는 격자 안) | `.tl { padding-left:12px; border-left:2px solid var(--border-subtle) }` |

창 분리 머리줄 패딩 8px 12px(`.win .bar`)는 격자 안이라 예외가 아니다.

---

## Typography

**선언 척도(이 phase 가 새로 그리는 글자): 크기 4개(14 · 12 · 11 · 10) · 굵기 2개(400 · 600).** 위계는 크기보다 **색 대비**로 만든다(레퍼런스 실측 규율 — 과장 금지). 재사용 원자(`ExchangeTag` 10/700 등)는 기존 그대로이며 이 척도에 들어오지 않는다.

| Role | Size | Weight | Line Height | 쓰는 자리 |
|------|------|--------|-------------|-----------|
| Heading (창 제목) | 14px (`--t-sm`) | 600 | 1.5 | 창 분리 페이지 제목 「주문로그」 — 오늘 주문 카드 제목과 같은 문법 |
| Label (탭 · 날짜) | 12px (`--t-caption`) | 600 | 1.5 | 공용 패널 탭 트리거(기존 `TAB_TRIGGER`) · 창 분리 날짜 「2026-09-29 (월)」(mono) · 오늘 주문 표 셀(기존) |
| Body (로그 줄) | 11px | 400 / 600 | **1.7** (F-A) · **1.6** (카드 dense) · **1.5** (타임라인 · 보조행 · 필터줄) | F-A 줄 · 카드 탭 줄 · 타임라인 줄 · 진행률 보조행 · 필터 칩 · 로딩/빈/실패 한 줄 · 「오늘」 알약(600) · 카드 탭 트리거(기존 `CARD_TAB_TRIGGER`). 600 은 **구분 칸 · 본문 첫 행위 단어 · 보조행 종류명·숫자·% · 타임라인 행위 단어 · 「다시 시도」** 에만 |
| Caption-sm (배지) | 10px | 400 | 15px (1.5) | 타임라인 출처 배지 「통보」/「상따」 · sticky 핀 문구 · 묶음 타임라인 `#주문번호` 꼬리 |

규칙: 시각 · 주문번호 · 수량 · 가격 · 누적 · % 는 `mono`(tabular). `word-break: keep-all`(전역). F-A 줄과 카드 줄은 `white-space: nowrap` + 끝 말줄임(채택안 — 잘림은 `title` 과 폰 밴드 탭 펼침이 보완한다). 타임라인 · 보조행 문장은 말줄임하지 않는다(타임라인은 줄바꿈 허용, 보조행은 표 가로 스크롤이 받는다).

---

## Color

| Role | Value (라이트 / 다크) | Usage |
|------|-------|-------|
| Dominant (60%) | `--card` #ffffff / #202027 · 창 분리 페이지는 `--bg` #ffffff / #17171c | 공용 패널 · 카드 · 오늘 주문 카드 면 · 창 분리 페이지 바탕 |
| Secondary (30%) | `--muted` #f2f4f6 / #2c2c35 | 진행률 막대 트랙 · 「통보」 배지 면 · 오늘 주문 상태 칩 면(기존) · 임베드 표 머리(기존) |
| Accent (10%) | `--primary` #3182f6 / #3485fa · `--accent` #e8f3ff / rgba(52,133,250,.16) · `--accent-fg` #1b64da / #8ab8ff | 아래 「Accent 전용 자리」만 |
| Destructive | `--destructive` #f04452 / #f04251 | **이 phase 신규 사용 없음.** 기존 오늘 주문 「거부」 상태 칩만(무변경). 「접수 불명」 은 destructive 를 **쓰지 않는다**(재주문 유도 방지 — 결정 6) |

**Accent 전용 자리(이 phase 가 여는 곳 — 이 목록 밖 금지):**
1. 타임라인 「상따」 배지 — 면 `--accent` · 글자 `--accent-fg`
2. 타임라인 상따 줄의 점 — `--primary`(통보 줄 점은 `--faint`)
3. 펼친 행의 ▶ 표식 — `--primary`(닫힘은 `--faint`)
4. 펼친 행 배경 · 폰 밴드에서 펼친 로그 줄 배경 — `color-mix(in srgb, var(--primary) 6%, transparent)`
5. 새로 도착한 로그 줄 강조 — `color-mix(in srgb, var(--primary) 8%, transparent)` · radius 4px
6. sticky 핀 알약 — 면 `--primary` · 글자 `--primary-fg`
7. 진행률 막대 채움(90% 미만) — `--primary`
8. 로그 구분 「시세」(상한가노출 · 상한가진입 N차) 글자 — `--accent-fg`
9. 필터 칩이 「전체」가 아닐 때 — 테두리 `--primary` · 면 `--accent` · 글자 `--accent-fg`(목업 `.sel.on`)
10. 창 분리 「오늘」 알약(오늘을 보는 중일 때) — 면 `--accent` · 글자 `--accent-fg`
11. 「다시 시도」 링크 글자 — `--accent-fg`
12. 포커스 링 — 기존 `--ring`

펼침 트리거 hover · 필터 칩 기본 · 창 분리 버튼 · 탭 괄호 배지에는 **쓰지 않는다**(괄호 배지는 형제 탭 CountBadge 와 같은 모양 — 결정 4-B).

**색 축 (기존 토큰 재사용 — 새 토큰 0):**

| 대상 | 토큰 | 근거 |
|---|---|---|
| 로그 구분 매수 그룹(선매수 · 추가매수 · 후매수) | `--up` | 매수 방향 축(D-05) |
| 로그 구분 매도 그룹(호가매도 · 체결매도 · 체결훅) | `--down` | 매도 방향 축(D-05) |
| 로그 구분 시세(상한가노출 · 상한가진입 N차) | `--accent-fg` | D-05 「시세 accent」 |
| 로그 구분 모르는 group/kind(원문 코드) · group 0 인 주문 이벤트 | `--muted-fg` | D-10 「모르는 값은 원문 그대로」 — 방향을 지어내지 않는다 |
| 진행률 막대 채움 ≥ 90% · D-12 「0주 남음」(100%) | `--up` | 「곧 내 차례」(ROADMAP · B안). `--destructive` 와 hex 가 같지만 **축이 다르다** — 오류가 아니다 |
| 진행률 막대 채움 < 90% | `--primary` | B안 |
| 오늘 주문 구분 「주문」(방향 미상) | `--muted-fg` | 결정 6 |
| 오늘 주문 R(New) 거부 행 「▲ 매수」/「▼ 매도」 | `--muted-fg` | 결정 6 — 참고값(방향색 대신) |
| 오늘 주문 상태 「접수 불명」 | `--muted-fg`(tone `muted`) | 결정 6 |
| 시각 · 주문번호 · 누적 꼬리 · 필터 라벨 · 건수 | `--muted-fg` / 건수·빈·로딩 `--faint` | 목업 `.t` `.no` `.m` `.cnt` `.empty` `.loading` |
| 로그 본문 | `--fg` (보조 조각은 `--muted-fg`) | 목업 `ul.lines li` · `.tl .x` |

**알려진 대비 예외(인접 표면 상속 · 새로 만드는 것 아님):** 라이트 테마 `--faint` #b0b8c1 글자(건수 · 로딩 · 빈 한 줄 · `#주문번호` 꼬리)는 #ffffff 대비 ≈ 2.0:1 로 11px 본문 4.5:1 에 못 미친다 — 기존 `StrategyLog`·오늘 주문 빈 상태와 같은 역할(비활성·보조)이다. 완화: 이 글자들은 **보조 정보**이고 같은 뜻이 다른 경로로 전달된다(건수 = 목록 자체, 로딩 = `aria-busy`, 꼬리 = 줄 `title`). `--accent-fg` 라이트 #1b64da on `--accent` #e8f3ff ≈ 5.3:1 통과.

---

## 밴드별 동작 (경계 숫자는 globals.css §2.2b 정본)

| 표면 | 재는 것 | 폰 밴드 | 컴팩트 · 와이드 · 데스크톱 |
|---|---|---|---|
| 공용 패널 「주문로그」 | 컨테이너 `wb` — 공용 패널이 **이미 쓰는** 폰 밴드 판정(작업대 `phoneBand` prop · CSS 는 `shared-panels.tsx` 본문 `max-h` 줄과 같은 `/wb` 유틸) | 패널이 하단 고정 접이식 바(기존) · 목록 172px 스크롤러 · **줄 탭 = 그 줄만 줄바꿈 펼침, 다시 탭 = 접힘**(결정 2-A) | F-A 그대로 — 끝 잘림(…) + `title` 전체 문장 · 탭 펼침 없음 |
| 카드 「주문로그」 | 작업대 `phoneBand` 를 카드 탭까지 내려 받는다(새 컨테이너 선언 없음 · 카드 탭 머리 ⑥ 규율) | 줄 탭 펼침(위와 같은 규칙) | 끝 잘림 + `title` |
| 창 분리 페이지 | 페이지 루트가 `@container/wb` 를 선언(이름 재사용 · 새 숫자 없음) + 작업대와 **같은 JS 상수**(`WB_PHONE_BAND_BELOW` — export 해 공유)로 폭 판정 | 줄 탭 펼침 | F-A 그대로 |
| 오늘 주문 카드 | 기존 **뷰포트** 규칙(카드 머리 ⑨ — 상따 컨테이너 쿼리 비적용) | 모바일 2줄 카드 행 + 펼침 본문(점선 아래 타임라인 · 시각 폭 78px · 줄바꿈 허용) | 데스크톱 표 + 펼침 행 `colSpan={8}` |
| 미체결 진행률 | 기본 모드 = 기존 **뷰포트** 규칙(표 ↔ 카드 행) · 임베드(공용 패널 · 카드 탭) = 늘 표(가로 스크롤은 `account-embed-scroll`) | 기본 모드 모바일 카드 행 **r3** | 기본 모드 표 · 임베드 표 모두 colSpan 보조행 |

- 밴드가 바꾸는 것은 **줄 잘림/펼침 방식**뿐이다. 줄 내용 · 순서 · 필터 · 배지 · 핀은 네 밴드 모두 같다.
- 폰 밴드 판정 전(`phoneBand === null`, 첫 페인트)은 비폰 규칙(잘림 + `title`)으로 그린다 — 판정이 나면 교체.

---

## 표면별 계약

### ① 오늘 주문 행 펼침 (`today-orders-card.tsx` — D-01~D-04 · 결정 8)

**트리거 (3-A · D-04 · 결정 8)**

| 항목 | 계약 |
|---|---|
| 펼칠 수 있는 행 | 묶음 구성원 중 주문번호가 **하나라도 있는** 행(`notice.orderNoText !== null`). 펼침 RPC 입력 = 구성원 주문번호 배열 + `head.accountNo` + `head.tradeDate`(D-02) |
| 펼칠 수 없는 행(거부 · 접수 불명 · 주문번호 없음) | **▶ 없음**(자리는 `visibility:hidden` 으로 남겨 시각 열 정렬 유지 — 목업 `.caret.none`) · **클릭 무동작** · `cursor: default` · hover 배경 없음 · `aria-expanded` **없음** · 버튼 없음(결정 8-A) |
| 클릭 범위 | **행 전체**(데스크톱 `<TableRow onClick>` · 모바일 카드 행 `<div onClick>`). 한 행 클릭 = 그 행 토글. **여러 행 동시 펼침** |
| 접근 가능한 토글 | 시각 칸(데스크톱 첫 셀 · 모바일 r2 첫 조각) 안에 실제 `<button type="button" data-slot="today-order-expand" aria-expanded aria-controls={상세 id}>` — 내용 = `▶` 표식(`aria-hidden`) + 시각 텍스트. 행 클릭은 이 버튼 토글로 **위임**(표 행에 `role="button"` 을 주지 않는다 — 행은 표 의미 유지). Enter / Space = 토글(버튼 기본) |
| ▶ 표식 | 글리프 `▶` · 10px · 폭 10px · 오른쪽 4px · 닫힘 `--faint` · 열림 `rotate(90deg)` + `--primary` · `transform` 150ms(reduced-motion 즉시) — 목업 `.caret` |
| 열린 행 배경 | 행의 모든 셀에 `color-mix(in srgb, var(--primary) 6%, transparent)`(목업 `tr.o.open td`) · 모바일 카드 행 전체 같은 값(`.row.open`) |
| 닫힌 행 hover | `color-mix(in srgb, var(--fg) 3%, transparent)`(기존 `.tbl-wrap` hover 와 같은 값) · 커서 pointer |
| 펼침 상태 보관 | 메모리(`Set<head.id>`)만 · 새로고침하면 전부 닫힘(D-04). 묶음에 조각이 더 들어와도 `head.id` 가 같으면 열린 채 유지 |

**펼침 본문 자리**

- 데스크톱: 행 바로 뒤 `<TableRow data-slot="today-order-detail">` + `<TableCell colSpan={8}>` — `account-embed-cancel-result` 와 같은 `<Fragment>` 문법. 셀: 위 2px · 아래 10px · 좌우 = 행 셀과 같은 `--cell-pad-x` · `white-space: normal` · 높이 auto · **hover 배경 없음**.
  ⚠ `.tbl-wrap tbody td`(height · padding)와 `.tbl-wrap tbody tr:hover td` 는 globals.css 의 **층 없는** 규칙이라 Tailwind 유틸이 진다 — 펼침 행·진행률 보조행 셀은 `data-slot` 범위의 층 없는 규칙 한 벌(또는 `!` 수식어)로 높이 auto · 패딩 · hover 없음을 준다. 실측으로 확인한다.
- 모바일 카드 행: r2 아래 `<div data-slot="today-order-detail">` — 위 여백 8px · 위 패딩 8px · `border-top: 1px dashed var(--border-subtle)`(목업 `.row .det`).

**타임라인 해부 (`<ol data-slot="order-timeline">` — 목업 `.tl`)**

| 조각 | 값 |
|---|---|
| 목록 | `margin:0` · `padding-left:12px` · `border-left:2px solid var(--border-subtle)` · 세로 flex · 줄 간격 3px |
| 줄 `<li data-slot="order-timeline-item" data-source="journal \| strategy">` | `display:flex; align-items:baseline; gap:8px` · 11px / 1.5 · 기본 글자 `--muted-fg` · 앞 점 6×6 원(`left:-16px; top:7px`) — 통보 `--faint` · 상따 `--primary` |
| 시각 | `mono` · `flex:none` · 폭 82px(모바일 78px) · `--muted-fg` · **HH:MM:SS.mmm** |
| 출처 배지 | `flex:none` · 폭 32px · 가운데 정렬 · radius 4px · 10px / 15px · 「통보」 = 면 `--muted` 글자 `--muted-fg` · 「상따」 = 면 `--accent` 글자 `--accent-fg` |
| 문장 | 색 `--fg` · 행위 단어 600 · 나머지 조각 `--muted-fg` · 줄바꿈 허용(모바일은 `li` 가 `flex-wrap`) |
| 묶음 꼬리(2-A) | 묶인 행(`count > 1`)에서만 줄 끝 `#{주문번호}` — `mono` 10px `--faint` `flex:none` |

**줄 순서:** `gw_time_ms` 오름차순 → 같은 ms 는 **통보 → 상따** → 같은 출처는 seq 순(D-01 · Pitfall 9). 비교 함수는 하나(웹 병합과 RPC 정렬이 같다).

**줄 조립(표시 모양만 — 본문 어휘의 정본은 조립기와 reference 템플릿):**

| 출처 | 모양 | 예(기획서 픽스처) |
|---|---|---|
| 상따(StrategyEvent) | `[행위 단어] [{그룹} · ]{본문} · 누적 {N}` — 그룹 표시명은 **주문 줄(kind 3 · 6)에만** 앞에 붙는다(방향·출처는 행이 이미 말한다). 행에 이미 있는 거래소 · 종목 · 주문번호는 뺀다(D-09) | **주문** 선매수 · 조건 매도잔량≤50,000 / 실측 38,200 · 근거 호가(매도1잔량 52,100→38,200) · 상한가 매수잔량 0 · 12,350×300주 · 접수 +18ms · 누적 861,800 / **대기** 300주 · 체결예상 930,000 (900,000 + 30,000) · 누적 900,000 / **첫 체결** 오차 +16,000 · 누적 914,000 / **취소** 매수1 이탈 · 남은 거래량 12,000 (1,100,000 − 1,088,000) · 누적 1,088,000 |
| 통보(저널 A/E/C/M/R) | `[행위 단어] [템플릿 v0 문장의 나머지 — 단어·숫자·순서 그대로]` — 행위 단어(접수 · 체결 · 전량 체결 · 취소 확인 · 정정 확인 · 거부 · 접수 불명)만 앞 굵은 칸으로 올린다. 체결 누적 `(누적 {running}/{qty})` 은 `--muted-fg` | **접수** 매수 300주 @12,350 / **체결** 매수 100주 @12,350 (누적 100/300) / **전량 체결** 200주 @12,350 (누적 300/300) / **취소 확인** 잔량 300주 |

- 상따 첫 체결(kind 5)의 행위 단어는 펼침에서 **「첫 체결」**, 주문로그 탭에서 **「체결」**(기획서 원문)이다 — 본문은 같다(D-09). 펼침에는 통보 「체결」 줄이 함께 있어 구분이 필요하다(채택 1-A 그대로).
- running sum 은 **주문번호별** 통보 E 를 seq 순 누적 · 분모 = 그 주문 행 `qty` · 전량 = `running + modifiedQty ≥ qty` · `qty` 가 null 이면 분모 없이.
- 모르는 enum 값은 원문 코드 그대로(D-10) · 서버 문구는 파싱하지 않는다(D-36).

**상태 (결정 8 · 한 줄 · 스켈레톤 없음)**

| 상태 | 표시 (`data-slot`) |
|---|---|
| 처음 펼침 · 조회 중 | `order-timeline-loading` — 「불러오는 중…」 11px `--faint` · 패딩 위 4 · 아래 2 · 왼쪽 2(목업 `.loading`) · 본문 컨테이너 `aria-busy="true"` |
| 조회 실패 | `order-timeline-error` `role="status"` — 「이벤트를 불러오지 못했어요」 11px `--muted-fg` + `<button type="button">다시 시도</button>`(왼쪽 6px · 600 · `--accent-fg` · hover 밑줄). 다시 시도 = RPC 1회 |
| 0건 | `order-timeline-empty` — 「전략 이벤트 없음 — 수동 주문이거나 상따 기록 전 주문」 11px `--faint`(목업 `.empty`) |
| 재조회 중(이미 줄이 있음) | 기존 줄을 그대로 두고 로딩 줄을 **다시 띄우지 않는다** |
| 재조회 실패(이미 줄이 있음) | 기존 줄 유지 + 타임라인 아래에 실패 한 줄(위 문구) |

**라이브 (D-03 · Pitfall 10)**

- 펼친 행은 `journal.events` 푸시 중 같은 (계좌 · 주문번호 ∈ 구성원) 이벤트를 **순서 규칙대로 끼워 넣는다**(끝에 붙이는 게 아니다 — 같은 ms 규칙 유지).
- 통보 조각은 이벤트 푸시가 없으므로 `journal.rows` 에서 구성원 `lastSeq` 가 오르면 **묶음 단위 trailing 400ms 디바운스 재조회 1회** · in-flight 중 추가 요청은 1건으로 접는다.
- 새로 끼워진 줄에 강조 배경을 주지 않는다(타임라인은 이력이다 — 강조는 주문로그 탭 전용).
- 닫으면 이어붙임도 멈춘다(열 때 다시 RPC 1회로 복원).

### ② 「주문로그」 목록 — 공용 패널 탭 · 카드 탭 (D-05~D-08 · 결정 1~4)

#### ②-0 공통 목록 `OrderLogList` (`data-slot="order-log"` · `data-surface="panel | card | window"`)

**정렬:** 오름차순(`gw_time_ms`, gateway, seq) — **새 로그는 아래**(기획서). `StrategyLog`(최신 위)와 반대라 재사용하지 않는다.

**F-A 한 줄 (공용 패널 · 창 분리 — 목업 `ul.lines`)**

```
[09:45:02.861][12451][선매수] KRX | ○○전자 | 주문 · 조건 매도잔량≤50,000 / 실측 38,200 · … · 접수 +18ms | 누적 861,800
[09:42:13.215][상한가노출] KRX | ○○전자 | 매도잔량 185,400 | 누적 620,000
[10:12:01.004][—][후매수] KRX | ○○전자 | 거부 · 주문거부 가격범위초과 | 누적 1,651,200
```

| 조각 | 값 |
|---|---|
| 목록 `<ol data-slot="order-log-list">` | `margin:0` · 패딩 6px 10px · 세로 flex · 줄 간격 1px · 11px / 1.7 |
| 줄 `<li data-slot="order-log-line" data-kind data-group data-new? data-open?>` | `display:flex; gap:6px; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis` · 색 `--fg` |
| 시각 | `[HH:MM:SS.mmm]` · `mono` · `--muted-fg` · `flex:none` |
| 주문번호 | `[12451]` · `mono` · `--muted-fg` · `flex:none` · **시세 이벤트(kind 1·2)는 칸 자체가 없다** · 거부(kind 8 · 주문번호 없음)는 `[—]` |
| 구분 | `[선매수]` · 600 · `flex:none` · 색은 「색 축」 표(매수 `--up` · 매도 `--down` · 시세 `--accent-fg` · 모름 `--muted-fg`). 시세 구분 = 「상한가노출」 · 「상한가진입 N차」 |
| 문장 `<span class="txt">` | `flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis` · `거래소 \| 종목 \| {행위 단어 600} · {본문} \| 누적 {N}` — 종목 뒤 본문 조각은 「 · 」, 누적 앞만 「 \| 」(채택 F-A). 「\| 누적 {N}」 조각은 `--muted-fg`. 시세 이벤트는 행위 단어 없이 본문부터 |
| 전체 문장 툴팁 | 비폰 밴드: 줄(`li`)의 `title` = **줄 전체 평문**(시각 · 번호 · 구분 · 거래소 · 종목 · 본문 · 누적) |
| 종목 표시 | 이름 → 코드 → ISIN 3단 폴백(오늘 주문 카드 ⑥ 규율 · `useIsinLabels` + `useStockNames`) — 새 조회 경로 없음 |

**카드 dense 줄 (카드 탭 — 결정 3-A · 목업 `cardTabs()`)**

```
09:45:02.861 #12451 선매수 주문 · 조건 매도잔량≤50,000 / 실측 38,200 · … | 누적 861,800
09:42:13.215 상한가노출 매도잔량 185,400 | 누적 620,000
```

- 괄호 없음 · 주문번호는 `#12451` · 거래소 · 종목 없음(카드가 이미 그 종목·거래소다). 목록 패딩 3px 8px · 줄 간격 0 · 11px / 1.6. 잘림 · 색 · 툴팁 규칙은 F-A 와 같다.

**새로 도착한 줄 강조:** 푸시로 들어온 줄(복원 줄 제외)에 `data-new` — 배경 `color-mix(in srgb, var(--primary) 8%, transparent)` · radius 4px · **3초 뒤 제거**(배경 전환 300ms · reduced-motion 즉시). 폰 밴드에서 펼친 줄은 펼침 배경(6%)이 이긴다.

**폰 밴드 줄 탭 펼침 (결정 2-A):** 폰 밴드에서만 줄 내용을 `<button type="button" aria-expanded>`(폭 100% · 왼쪽 정렬 · 글꼴 상속 · 테두리/배경 없음)로 감싼다. 탭 = 그 줄만 `white-space:normal` + 문장 조각이 다음 줄로(`flex-basis:100%`) · 다시 탭 = 접힘 · 여러 줄 동시 펼침 허용 · 열린 줄 배경 `color-mix(in srgb, var(--primary) 6%, transparent)` radius 4px(목업 `li.wrap.open`). 펼침 상태는 메모리 · 필터를 바꾸면 전부 접힘. 비폰 밴드는 버튼 없이 평문 + `title`.

**스크롤 고정 · sticky 핀 (`useStickToBottom`)**

| 규칙 | 값 |
|---|---|
| 스크롤 주인 | **목록 자체의 스크롤러**(`data-slot="order-log-body"` · `overflow-y:auto` · `position:relative`) — 페이지(main)가 아니다(Pitfall 11). 공용 패널 `max-height:172px` · 카드 탭 = 카드 탭 본문 높이 전부(`h-full`) · 창 분리 = 뷰포트 남은 높이 |
| 「맨 아래」 판정 | `scrollHeight − scrollTop − clientHeight ≤ 24px`(재량 — 줄 1개 ≈ 18.7px 보다 조금 큼) |
| 맨 아래일 때 새 줄 | 즉시 `scrollTop = scrollHeight`(부드러운 스크롤 아님) |
| 올려 보는 중 새 줄 | 위치 유지 · 필터를 통과한 새 줄 수 N 누적 → 핀 표시(공용 패널 · 창 분리만) |
| 핀 | `<div class="sticky bottom-0 flex justify-center p-1 pointer-events-none">` 안 `<button type="button" data-slot="order-log-pin" class="pointer-events-auto">` — 알약 · 면 `--primary` · 글자 `--primary-fg` · 10px · 패딩 2px 10px · `box-shadow: 0 2px 8px rgba(0,0,0,.25)`. 문구 「새 로그 N · 맨 아래로 ↓」. 누르면 맨 아래로(부드러운 스크롤 · reduced-motion 즉시) · N = 0 · 핀 사라짐. 사용자가 직접 맨 아래까지 내려도 같다 |
| 카드 탭 | **핀 없음**(결정 3-A — 핀이 3줄 중 1줄을 가린다) · 자동 따라감만 |
| 처음 마운트 · 필터 변경 · 날짜 이동 | 맨 아래로 · N = 0 |
| 키보드 스크롤 | 스크롤러 `tabIndex={0}` + `aria-label="주문로그 목록"`(axe scrollable-region-focusable) |

**목록 상태**

| 상태 | 공용 패널 · 창 분리 | 카드 탭(dense) |
|---|---|---|
| 하루치 조회 중 · 줄 0 | `order-log-loading` 「불러오는 중…」 11px `--faint` 한 줄(목록 패딩 안) | 같음 |
| 조회 실패 | `order-log-error` `role="status"` 「오늘 주문로그를 불러오지 못했어요」 + 「다시 시도」(창 분리 과거일은 「이 날 주문로그를 불러오지 못했어요」) — 목록 맨 위 · 푸시로 온 줄은 아래에 그대로 | 같음(한 줄) |
| 오늘 0건 | `order-log-empty` 점선 박스(기존 `StrategyLog` embed 빈 박스와 같은 문법 — `border-dashed --faint` · radius `--r-md` · 가운데) · 제목 14/600 「오늘 주문로그가 없어요」 · 본문 12 `--muted-fg` 「상따 주문과 상한가 노출·진입이 생기면 여기에 쌓여요」 | dense 박스(`m-2 py-2`) · 제목만 「이 종목의 주문로그가 없어요」 |
| 필터 결과 0건 | 박스 제목만 「조건에 맞는 로그가 없어요」 · 건수 「0건」 | (필터 없음) |
| 창 분리 과거일 0건 | 제목 「이 날은 주문로그가 없어요」 · 본문 「주말·휴장일이거나 주문·상한가 이벤트가 없던 날이에요」 | — |

> 빈 상태 박스 제목 14px 은 기존 `StrategyLog` embed 빈 박스 문법을 그대로 따른 것이다(Heading 역할과 같은 크기 · 새 크기 아님).

#### ②-1 공용 패널 탭 (`shared-panels.tsx`)

| 항목 | 계약 |
|---|---|
| 탭 순서 · 이름 | 「미체결 (N)」 · 「잔고 (N)」 · **「주문로그 (N)」** · 「전략 로그」 — 목업 순서. 섹션 `aria-label` = 「미체결 · 잔고 · 주문로그 · 전략 로그」 |
| 탭 값 | `"orderlog"` — `SharedTab` · `SharedPanelTab` · `readPanelsPref` 화이트리스트 **세 곳을 한 정본에서 파생**(Pitfall 12 · 저장 → 재마운트 복원 테스트) |
| 트리거 | 기존 `TAB_TRIGGER` 그대로. 새 로그 수 > 0 이면 라벨 뒤 ` (N)` — `<span data-slot="order-log-unseen" class="mono">` (형제 「미체결 (N)」 과 같은 모양 · 결정 4-B) · 0 이면 괄호 자체 생략 |
| 배지 뜻 | **탭이 가려진 동안 도착한 수**. 가려짐 = 다른 탭 활성 **또는** 폰 밴드에서 패널 접힘. 세는 대상 = 이 탭의 **범위**(아래) 안의 푸시 줄 · 필터줄 선택은 적용하지 않는다(재량). 탭이 보이게 되면(활성 ∧ 펼침) 0 |
| 범위 | **상태줄 단일 계좌**(`accountNo` prop — 형제 탭과 같은 축)의 주문 이벤트 + **시세 이벤트(kind 1·2) 전부**(결정 1-A). 계좌를 바꾸면 스토어에서 다시 거른다(재조회 없음) |
| 데이터 | 작업대 마운트 시 하루치 RPC 1회(공용 패널 · 카드 탭 공용 스토어) + `journal.events` 푸시 이어붙임 · 오늘(KST) 것만(D-07) |
| 필터줄 `data-slot="order-log-filters"` | `display:flex; align-items:center; gap:6px; flex-wrap:wrap` · 패딩 6px 10px · `border-bottom:1px solid var(--border-subtle)` · 11px `--muted-fg` · 순서: **종목 · 거래소 · 구분 · N건 · (여백) · 창 분리 ↗** — 계좌 칩 없음(결정 1-A) |
| 필터 칩 | `<label class="sel">{이름} <select>…</select> ▾</label>` — 테두리 1px `--border-subtle` · radius `--r-sm` · 패딩 2px 8px · 글자 `--fg` · `▾` 9px `--faint`. 「전체」 아닐 때 `.sel.on`(테두리 `--primary` · 면 `--accent` · 글자 `--accent-fg`) |
| 종목 옵션 | 「전체」 + 그날 범위 안 이벤트가 있는 종목(표시 이름 가나다순) |
| 거래소 옵션 | 전체 · KRX · NXT |
| 구분 옵션 | 전체 · 선매수 · 추가매수 · 후매수 · 매도(호가·체결·훅 합침) · 시세(노출·진입) — group 축(D-08) |
| 건수 | `data-slot="order-log-count"` 「{N}건」 `mono` `--faint` — 필터 뒤 줄 수 |
| 창 분리 | `<button type="button" data-slot="order-log-popout">창 분리 ↗</button>` — `--muted-fg` · hover `--fg` · `native:hidden`(앱 셸에서는 숨김 — 공용 패널 자체도 앱에서 숨김이지만 이중 안전). 누르면 `window.open('/trading/order-log?{쿼리}', 'gh-radar-order-log', 'width=960,height=720,noopener')` — 쿼리는 ③ 표 |
| 본문 | 필터줄 아래 목록 스크롤러 `max-height:172px`(모든 밴드 · 공용 패널 본문 스크롤과 별개) + sticky 핀 |

#### ②-2 카드 탭 (`card-tabs.tsx` — 결정 3-A · 4-B)

| 항목 | 계약 |
|---|---|
| 탭 순서 · 이름 | 「정보」 · 「미체결 (N)」 · 「잔고 (N)」 · **「주문로그 (N)」** · **「전략로그 (N)」** — 기존 「로그」 는 라벨만 「전략로그」 로 바꾸고 값 `"log"` · `CountBadge`(총 건수) 유지(탭 요청 통로 무영향) |
| 탭 값 | `"orderlog"` — `CardTab` 유니온에 추가 · `CardTabRequest` 도 받는다 |
| 트리거 | 기존 `CARD_TAB_TRIGGER` + `CountBadge` 모양(`mono` 괄호). 숫자 = **탭이 가려진 동안 도착한 수**(가려짐 = 다른 탭 활성 · 카드 탭 접힘 · 카드 접힘) · 0 이면 생략 · 보이게 되면 0 |
| 범위 | **카드 계좌**의 주문 이벤트 + 시세 이벤트, 둘 다 **그 종목 · 그 거래소**만 |
| 본문 | **필터줄 없음** · 본문 전부 dense 줄(카드 탭 본문 고정 높이 `CARD_TABS_BODY_H` 안 ≈ 3줄 보임 + 스크롤) · **핀 없음** · 자동 따라감만 |

### ③ 창 분리 페이지 `/trading/order-log` (결정 5 · D-07)

**골격:** `app/trading/order-log/page.tsx` — **AppShell · 사이드바 없음**. 서버 컴포넌트에서 `<Suspense fallback={null}>`(`useSearchParams` 요구 — `app/trading/page.tsx` 와 같은 규율 · 폴백을 로딩으로 위장하지 않는다). 루트 `<main data-slot="order-log-window" class="@container/wb flex h-dvh flex-col bg-[var(--bg)]">`. `RelayProvider` 는 루트 layout 전역이라 이 창도 자기 wss 를 연다. 문서 제목 `주문로그 · {YYYY-MM-DD}`.

**쿼리 (재량 — 이름 확정):**

| 이름 | 값 | 없으면 |
|---|---|---|
| `account` | 계좌번호(상태줄 계좌 · 결정 1) | 시세 이벤트만 보인다 |
| `date` | `YYYY-MM-DD`(KST) | 오늘. 형식 오류 · 미래 날짜는 오늘로 교정하고 `router.replace` |
| `stock` | ISIN | 전체 |
| `ex` | `KRX` \| `NXT` | 전체 |
| `kind` | `pre` \| `add` \| `post` \| `sell` \| `market` | 전체 |

「전체」 는 쿼리를 **생략**한다(`all` 은 별칭으로만 받는다). 날짜 · 필터를 바꾸면 `router.replace` 로 쿼리를 갱신한다(새로고침해도 같은 화면). 계좌번호가 URL 에 실리지만 가시성은 server 가 `req.userId` + `dma_account_access` 조인으로 판정한다(URL 은 선택일 뿐 권한이 아니다).

**머리줄 `data-slot="order-log-window-bar"` (5-A):** `display:flex; align-items:center; gap:10px` · 패딩 8px 12px · `border-bottom:1px solid var(--border-subtle)`.

| 조각 | 값 |
|---|---|
| 제목 | `<h1>` 「주문로그」 14px / 600 |
| 이전 날 | `<button data-slot="order-log-date-prev" aria-label="이전 날">‹</button>` — 24×24 · radius `--r-sm` · 테두리 1px `--border-subtle` · `--muted-fg` · **달력 하루씩** 이동(주말·휴장일도 한 칸 — 결정 5) · 하한 없음 |
| 날짜 | `data-slot="order-log-date"` 「2026-09-29 (월)」 — `mono` 12px / 600 · 좌우 6px · 요일은 `Intl` ko-KR `weekday:"short"` (Asia/Seoul) |
| 다음 날 | `<button data-slot="order-log-date-next" aria-label="다음 날">›</button>` — 날짜가 오늘이면 `disabled`(글자 `--faint` · 테두리 투명 — 목업 `.arr.off`) |
| 「오늘」 알약 | `<button data-slot="order-log-date-today">오늘</button>` — 11px / 600 · radius 999 · 패딩 2px 8px · 왼쪽 4px. **오늘을 보는 중**: 면 `--accent` 글자 `--accent-fg` · `aria-current="date"` · 눌러도 무동작. **과거일**: 테두리 1px `--border-subtle` · 글자 `--muted-fg` · 누르면 오늘로 |

**그 아래:** 필터줄(②-1 과 같은 칩 · **창 분리 버튼 없음**) → 목록 스크롤러(`flex:1; min-height:0; overflow-y:auto` — 뷰포트 높이) · F-A 줄.

- **배지 없음**(탭 줄이 없다). 스크롤 고정 + 핀은 **오늘일 때만**(과거일은 푸시가 없어 새 줄이 생기지 않는다).
- 오늘 = 하루치 RPC 1회 + 푸시 이어붙임 · 과거일 = 그 날짜 RPC 1회(푸시 무시) · 날짜 이동마다 RPC 1회.
- 네이티브 앱 셸: 이 라우트로 가는 버튼이 숨겨진다(②-1). 직접 열리면 일반 페이지로 동작한다.
- 새 창 크기 960×720(재량).

### ④ 미체결 진행률 B안 (`account-panel.tsx` 3표면 + 모바일 — D-11~D-13 · 결정 7)

**값 (웹 계산 없음 — `unf.progress` 스냅에서만):**

| 계산 | 규칙 |
|---|---|
| 조인 | `queueProgress.get(\`${row.isin}\|${row.exchange}\`)` 안에서 (계좌번호, `row.orderNo`) **문자열 동등**(정규화 금지 — Pitfall 15) |
| 없음 | 항목이 없으면 **보조행 없음**(D-11 — 대기 중인지 추정하지 않는다) |
| 남은 수량 | `max(0, remaining_volume)` |
| % | `min(100, max(0, floor(progress_bp / 100)))` |
| D-12 | `remaining_volume ≤ 0` 또는 `progress_bp ≥ 10000` → 「0주 남음」 + 100% |
| 색 | % ≥ 90 → 채움 `--up`(`data-near="true"`) · 미만 `--primary` |
| 라벨 | `group` 표시명(선매수 · 추가매수 · 후매수 — shared 표시명 표) · 모르는 값은 원문 코드 |
| 사라짐 | 스냅에서 항목이 빠지면(첫 체결 · 취소) 보조행만 삭제 · 미체결 행이 사라지면 함께 삭제(D-13) · 오래된 값 표식 없음 · 마지막 값 유지 |

**데스크톱 보조행 (3표면 공통 한 줄 — 목업 `tr.sub .line`)**

```
후매수 · 체결예상까지 12,000주 남음 [━━━━━━━━━━━━━━━━━━░░] 88%
```

| 항목 | 값 |
|---|---|
| 자리 | 그 미체결 행 **바로 아래** `<TableRow data-slot="unfilled-progress-row">` · 취소 결과 행(`account-embed-cancel-result`)이 있으면 그보다 **위** |
| colSpan | 마이페이지 기본 표 = 7 · 공용 패널 임베드 = 7 · 카드 탭 임베드(`stockScope`) = 5 (`stockScope ? 5 : 7` — 취소 결과 행과 같은 식) |
| 셀 | 위 0 · 아래 8px · 좌우 = 그 표의 셀 좌우(임베드 `EMB_TD` 10px · 기본 표 `--cell-pad-x`) · 높이 auto · 11px / 1.5 · `--muted-fg` · `white-space:nowrap` · hover 배경 없음(① 의 ⚠ 층 규칙 주의 동일) |
| 행 경계 | 보조행을 가진 미체결 행은 아래 구분선을 보조행으로 넘긴다(짝이 한 덩어리로 읽히게) |
| 선택 · 취소보관 | 미체결 행이 선택이면 보조행도 같은 선택 배경 · 취소 보관(`pendingCancelSent`) 행이면 숫자 `--muted-fg` + 막대 채움 `--faint`(취소 중인 주문을 「곧 내 차례」 빨강으로 부르지 않는다) · 보조행 자체는 클릭 대상이 아니다 |
| 한 줄 `<div data-slot="unfilled-progress">` | `display:flex; align-items:center; gap:8px` · 왼쪽 2px 들여쓰기 · 조각: 종류명(600 · `--fg`) · 「·」 · 「체결예상까지 **{N}**주 남음」(N `mono` 600 `--fg`) · 막대(폭 140px) · **{P}%**(`mono` 600 `--fg`) |
| 막대 | 트랙 높이 6px · radius 999 · 면 `--muted` · `overflow:hidden` · 채움 radius 999 · 폭 = P% · 폭 전환 300ms ease-out(reduced-motion 없음) |

세 표면의 문구 차이 **없음**(재량) — 종목 · 거래소는 위 행이 이미 말한다.

**모바일 카드 행 (기본 모드 · 결정 7-A)**

```
r1  ○○전자                    ▲ 매수       12,350
r2  미체결 300 / 300주                     [취소]
r3  후매수  12,000주 남음  [━━━━━━━━━━━━━░░]  88%     ← 진행률(있는 행만)
r4  대기중                                             ← 기존 StatusNotes(있는 행만)
```

- r3 `<div data-slot="unfilled-progress" data-variant="compact">` — 위 여백 6px · `display:flex; align-items:center; gap:8px` · 11px `--muted-fg` · 조각: 종류명(600 `--fg` `flex:none`) · 「**{N}**주 남음」(`flex:none` — 「체결예상까지」·「·」 생략, 목업 `.r3`) · 막대(`flex:1 1 auto; min-width:0` — **유일한 신축 항목**, 잘림 없음 · account-panel ⑤ 규율) · **{P}%**(`flex:none`).
- r4 = 기존 `StatusNotes`(한 줄 내려갈 뿐 문구 · 모양 무변경). 진행률이 없는 행은 `StatusNotes` 가 r3 자리에 그대로 선다.

### ⑤ 오늘 주문 별건 3 (결정 6 — 목업 6-A 표 3행)

| 경우 | 판정 입력 | 구분 칸(`today-order-side`) | 상태 칸(`today-order-status`) |
|---|---|---|---|
| 방향 미상 | `orderActionWord` 가 매수·매도·취소·정정 어느 것도 못 낼 때 | **「주문」** · 화살표 없음 · 600 · `--muted-fg` · `data-side="none"` | (원래 상태) |
| 접수 불명 | `status === "rejected"` ∧ `resultCode === -2` | (원래 방향 표기 — 목업 2행은 방향색 유지) | **「접수 불명」** · tone `muted`(`--muted-fg` · 면 `--muted`) · `data-tone="muted"` · `title`「주문이 접수됐는지 확인되지 않았어요. 미체결·잔고에서 확인한 뒤 다시 주문하세요」 |
| KB 거부 R(New) | `noticeType === "R"` ∧ 방향 있음(`orderActionSide ≠ null`) ∧ `resultCode ≠ -2` | **「▲ 매수」/「▼ 매도」** 화살표·단어 유지 · 색만 `--muted-fg` · `data-side-ref="true"` · `title`「거부 통보의 방향은 참고값이에요」 | 「거부」(기존 danger 그대로) |

- 「주문」 폴백은 `order-notices.ts` `orderActionWord` 마지막 분기(`return ""` → `"주문"`)에서 낸다 — gh-trade 대조 합의(`reference/order-log-template-review.md` 「방향 미상 「주문」 통일」). 같은 함수를 쓰는 `trading-alerts.ts` 도 같은 단어를 받는다(의도된 통일).
- 「접수 불명」 은 `orderDisplayStatus` 에서 **`STATUS_LABELS` 조회 전에** 판정한다(투영 status 는 `rejected` 유지 — 화면에서만 가름).
- 참고 방향은 `orderNoticeLabel` 결과에 참고 플래그(예: `sideRef: true`)를 실어 `SideTag` 가 받아 그린다 — `SideTag` 는 여전히 문자열을 조립하지 않는다(17-09 규율).
- 세 경우 모두 거부 · 접수 불명 행은 주문번호가 없으면 ① 의 「펼칠 수 없는 행」 규칙을 따른다.

---

## Copywriting Contract

어조: 해요체(기존 화면 · 목업과 같음). **서버 · 조립기 원문은 예외** — 로그 본문(조건 · 근거 · 취소 사유 표시명 · 거부 사유 꼬리)은 조립기와 reference 템플릿이 정본이고 이 표가 재작성하지 않는다. 숫자 `ko-KR` 쉼표 · 단위 붙여 씀.

| Element | Copy |
|---------|------|
| Primary CTA | 이 phase 에 폼 확정 CTA 는 없다. 주 행동 라벨: 「다시 시도」(조회 실패 복구) · 「새 로그 N · 맨 아래로 ↓」(핀) · 「창 분리 ↗」 · 「오늘」 |
| 공용 패널 탭 | 미체결 (N) · 잔고 (N) · **주문로그** · **주문로그 (N)**(새 로그가 있을 때) · 전략 로그 |
| 카드 탭 | 정보 · 미체결 (N) · 잔고 (N) · **주문로그** / **주문로그 (N)** · **전략로그** / **전략로그 (N)** (「로그」 에서 개명) |
| 탭 접근성 이름(새 로그 있음) | 「주문로그, 새 로그 N건」 |
| 공용 패널 섹션 접근성 이름 | 미체결 · 잔고 · 주문로그 · 전략 로그 |
| 필터 칩 | 종목 {전체 \| 종목명} · 거래소 {전체 \| KRX \| NXT} · 구분 {전체 \| 선매수 \| 추가매수 \| 후매수 \| 매도 \| 시세} |
| 건수 | {N}건 |
| 창 분리 버튼 | 창 분리 ↗ (접근성 이름 「주문로그 새 창으로 열기」) |
| sticky 핀 | 새 로그 {N} · 맨 아래로 ↓ |
| 목록 스크롤러 접근성 이름 | 주문로그 목록 |
| 목록 로딩 | 불러오는 중… |
| 목록 실패 | 오늘 주문로그를 불러오지 못했어요 · [다시 시도] (창 분리 과거일: 이 날 주문로그를 불러오지 못했어요 · [다시 시도]) |
| Empty state heading (공용 패널 · 창 오늘) | 오늘 주문로그가 없어요 |
| Empty state body | 상따 주문과 상한가 노출·진입이 생기면 여기에 쌓여요 |
| 카드 탭 빈 상태 | 이 종목의 주문로그가 없어요 |
| 필터 결과 0 | 조건에 맞는 로그가 없어요 |
| 창 분리 과거일 0 | 이 날은 주문로그가 없어요 / 주말·휴장일이거나 주문·상한가 이벤트가 없던 날이에요 |
| 창 분리 제목 · 문서 제목 | 주문로그 · (문서) 주문로그 · {YYYY-MM-DD} |
| 창 분리 날짜 | {YYYY-MM-DD} ({요일 한 글자}) · 버튼 이름 「이전 날」 「다음 날」 · 알약 「오늘」 |
| 펼침 로딩 | 불러오는 중… |
| Error state (펼침 실패) | 이벤트를 불러오지 못했어요 · [다시 시도] — 문제(불러오지 못함) + 해결 경로(다시 시도 1회) |
| 펼침 0건 | 전략 이벤트 없음 — 수동 주문이거나 상따 기록 전 주문 |
| 펼침 출처 배지 | 통보 · 상따 |
| 펼침 행위 단어(상따) | 주문 · 대기 · 첫 체결 · 취소 · 거부 |
| 주문로그 행위 단어(상따) | 주문 · 대기 · 체결 · 취소 · 거부 (시세 이벤트는 행위 단어 없음) |
| 펼침 행위 단어(통보) | 접수 · 체결 · 전량 체결 · 취소 확인 · 정정 확인 · 거부 · 접수 불명 (나머지 문장은 템플릿 v0 그대로) |
| 로그 구분(group · kind 표시명) | 선매수 · 추가매수 · 후매수 · 호가매도 · 체결매도 · 체결훅 · 상한가노출 · 상한가진입 {N}차 — 모르는 값은 원문 코드 |
| 거부 줄 주문번호 | [—] |
| 진행률 보조행(데스크톱) | {그룹} · 체결예상까지 {N}주 남음 [막대] {P}% |
| 진행률 r3(모바일) | {그룹} {N}주 남음 [막대] {P}% |
| 진행률 D-12 | 0주 남음 · 100% |
| 진행률 막대 접근성 | 이름 「체결예상까지 진행률」 · 값 텍스트 「{그룹} 체결예상까지 {N}주 남음, {P}%」 |
| 별건 — 방향 미상 | 주문 |
| 별건 — 접수 불명 | 접수 불명 · 툴팁 「주문이 접수됐는지 확인되지 않았어요. 미체결·잔고에서 확인한 뒤 다시 주문하세요」 |
| 별건 — R(New) 참고 방향 | ▲ 매수 / ▼ 매도 (회색) · 툴팁 「거부 통보의 방향은 참고값이에요」 |
| Destructive confirmation | 이 phase 에 새 파괴적 동작 없음 — 미체결 「취소」 버튼 · 확인 다이얼로그는 기존 그대로(무변경) |

---

## 접근성 계약

| 대상 | 계약 |
|---|---|
| 오늘 주문 펼침 토글 | 시각 칸 안 `<button type="button" aria-expanded="true\|false" aria-controls>` · 접근성 이름 = 시각 + 종목 + 행위(예: 「09:45:02 ○○전자 매수 주문 펼치기/접기」 — sr-only 보조) · ▶ `aria-hidden` · Enter/Space 토글 · 행 클릭은 위임. 펼칠 수 없는 행은 버튼 · `aria-expanded` 없음 · 탭 순서 밖 |
| 펼침 본문 | `id` = 버튼 `aria-controls` · 조회 중 `aria-busy="true"` · 실패 줄 `role="status"`(인라인 일시 안내 규율) · 「다시 시도」 는 실제 `<button>` |
| 탭(공용 패널 · 카드) | Radix Tabs 기본 — `role="tablist/tab/tabpanel"` · ←/→ 이동 · Home/End · 자동 활성화(기존과 같음). 새 로그 수가 있으면 트리거 `aria-label`「주문로그, 새 로그 N건」(보이는 「(N)」 은 형제 탭과 같은 모양이지만 뜻이 달라 이름으로 말한다) |
| 필터 | 네이티브 `<select>` + 감싼 `<label>` 이 이름을 준다(「종목」「거래소」「구분」) · 탭 순서: 종목 → 거래소 → 구분 → 창 분리 |
| 목록 | `<ol>` · 줄마다 `<li>` · 스크롤러 `tabIndex=0` + 이름 「주문로그 목록」 · **라이브 영역 아님**(시세 이벤트 고빈도 — 줄마다 읽히면 소음) |
| 폰 밴드 줄 펼침 | 줄 내용 `<button type="button" aria-expanded>` · Enter/Space 토글 · 비폰 밴드는 버튼 없음(`title` 로 전체 문장) |
| sticky 핀 | 실제 `<button>` · 이름 = 보이는 문구 · 보일 때만 탭 순서에 들어간다 · 누른 뒤 포커스는 스크롤러로 |
| 창 분리 날짜 | 화살표 `aria-label`「이전 날」「다음 날」 · 다음 날 비활성은 `disabled` · 「오늘」 보는 중 `aria-current="date"` |
| 진행률 막대 | `role="progressbar"` · `aria-valuenow={P}` · `aria-valuemin=0` · `aria-valuemax=100` · `aria-label`「체결예상까지 진행률」 · `aria-valuetext`「{그룹} 체결예상까지 {N}주 남음, {P}%」 · 90% 구분은 색만이 아니라 **숫자 %** 가 늘 함께 있다(WCAG 1.4.1) |
| 별건 3 | 방향 · 상태는 **단어**가 말한다(색은 보조) · 참고 방향 툴팁은 `title` + 같은 문구 sr-only 동반 · 「접수 불명」 도 단어가 거부와 다르다 |
| 색만으로 말하지 않기 | 구분 = 단어(선매수 · 호가매도 · 상한가노출) · 출처 = 배지 단어(통보 · 상따) · 새 줄 강조는 보조(정보 손실 없음) · 진행률 = 숫자 |
| 터치 대상 | 오늘 주문 행 전체(≥ 행 높이 36px) · 필터 칩 · 창 분리 버튼 · 날짜 화살표 24×24(WCAG 2.5.8 AA 24 충족) · 폰 밴드 줄 버튼은 줄 폭 전체 × 줄 높이(≈19px — 목록 밀도를 위한 **알려진 예외**, 인접 줄과 간격 1px · 오조작은 다시 탭으로 복구) |

---

## 모션

| 대상 | 값 | `prefers-reduced-motion: reduce` |
|---|---|---|
| 펼침 ▶ 회전 | `transform` 150ms | 즉시 |
| 펼침 본문 열고 닫기 | **즉시**(높이 애니메이션 없음 — 목업 그대로) | 같음 |
| 새 로그 줄 강조 | 3초 유지 후 배경 300ms 전환으로 제거 | 즉시 제거 |
| 핀 → 맨 아래 | `scrollTo({behavior:"smooth"})` | `behavior:"auto"` |
| 맨 아래 자동 따라감 | 즉시(`scrollTop` 대입) | 같음 |
| 진행률 막대 폭 | `width` 300ms ease-out | 전환 없음 |

---

## 상태 매트릭스 (검증 대상)

| 표면 | 상태 | 보여야 하는 것 |
|---|---|---|
| 오늘 주문 행 | 주문번호 있음 · 닫힘 | ▶ `--faint` · 버튼 `aria-expanded="false"` · hover fg 3% |
| | 펼침 · 조회 중 | ▶ 90° `--primary` · 행 primary 6% · 「불러오는 중…」 |
| | 펼침 · 성공 | 타임라인(통보 점 `--faint` · 상따 점 `--primary` · ms 시각 · 같은 ms 통보 → 상따) |
| | 펼침 · 묶음(7건) | 한 타임라인 · 줄마다 `#주문번호` 꼬리 |
| | 펼침 · 실패 | 「이벤트를 불러오지 못했어요」 + 다시 시도 |
| | 펼침 · 0건 | 「전략 이벤트 없음 — 수동 주문이거나 상따 기록 전 주문」 |
| | 펼침 · 수동 주문 | 통보 줄만 |
| | 주문번호 없음(거부 · 접수 불명) | ▶ 자리 숨김 · 클릭 무동작 · 버튼 없음 |
| 공용 패널 주문로그 | 다른 탭 활성 · 새 줄 3 | 「주문로그 (3)」 |
| | 탭 활성 · 맨 아래 | 새 줄 자동 따라감 · 강조 3초 · 배지 없음 |
| | 탭 활성 · 올려 보는 중 · 새 줄 3 | 위치 유지 · 핀 「새 로그 3 · 맨 아래로 ↓」 |
| | 필터 비기본 | 칩 `.on` · 건수 갱신 · 맨 아래로 |
| | 폰 밴드 | 줄 탭 → 그 줄만 줄바꿈 · primary 6% · 다시 탭 → 접힘 |
| | 계좌 전환 | 새 계좌 주문 이벤트 + 시세 이벤트로 즉시 재구성(재조회 0) |
| 카드 주문로그 | 기본 | 필터줄 없음 · dense 3줄 보임 · 핀 없음 · 「전략로그」 탭 이름 |
| 창 분리 | 오늘 | ‹ 활성 · › 비활성 · 「오늘」 accent · 핀 가능 · 배지 없음 |
| | 과거일 | › 활성 · 「오늘」 테두리형 · 푸시 무시 · 핀 없음 |
| | 과거일 0건 | 「이 날은 주문로그가 없어요」 |
| 진행률 | 값 없음 | 보조행 · r3 없음 |
| | 73% | 채움 `--primary` |
| | 88%→90% | 채움 `--up` · `data-near` |
| | remaining ≤ 0 (첫 체결 전) | 「0주 남음」 · 100% · `--up` |
| | 항목 빠짐(첫 체결 · 취소) | 보조행만 삭제 · 행 유지 |
| | 미체결 행 사라짐 | 행 · 보조행 함께 삭제 |
| | 취소 보관 행 | 숫자 muted · 채움 `--faint` |
| 별건 3 | 방향 미상 | 「주문」 muted |
| | result_code −2 | 「접수 불명」 muted(빨강 아님) |
| | R(New) 거부 | 「▲ 매수」 회색 + 툴팁 · 상태 「거부」 빨강 |

---

## UI Considerations

> 오케스트레이터 ui-consideration probe(Step 9.5) 실행 결과 — 2026-09-29. 연구자 사전 표(12건)를 이 표가 **교체**했다. 빈/오류 **문구**는 Copywriting Contract 행이 정본이고 여기서는 상태 규칙만 적는다. 표면 종류(kind)는 사용자 검토 뒤 저자가 확정한 값이다(휴리스틱 분류 대신 authored override).

Applicable state considerations resolved: 50/50 — explicit 38 · backstop 4 · dismissed 8 · unresolved 0

**표면 → 종류**

| ID | 표면 | kind |
|---|---|---|
| E1 | 오늘 주문 펼침 트리거(버튼) | interactive-control |
| E2 | 오늘 주문 펼침 타임라인 | list-collection |
| E3 | 주문로그 목록(공용 패널 · 창 분리) | list-collection · static-content |
| E4 | 주문로그 필터줄 | form · interactive-control |
| E5 | 공용 패널 · 카드 탭 트리거 | nav |
| E6 | 카드 주문로그 탭 본문 | list-collection |
| E7 | 창 분리 머리줄 · 날짜 이동 | nav · interactive-control |
| E8 | 진행률 보조행(데스크톱 3표면) | list-collection · static-content |
| E9 | 모바일 진행률 r3 | static-content |
| E10 | 오늘 주문 별건 3 칩 | static-content |

**해결 표** (backstop 4건은 플랜의 `must_haves.truths` 로 올라가고 실측·e2e 증거 없이는 통과하지 않는다)

| Category | Element | Status | Resolution / Reason |
|----------|---------|--------|---------------------|
| loading | E1 오늘 주문 펼침 트리거(버튼) | ➖ dismissed | 사유: 트리거 버튼 자체에는 로딩 상태가 없다 — 조회 중 표시는 E2 타임라인 본문(order-timeline-loading)이 맡는다 |
| error | E1 오늘 주문 펼침 트리거(버튼) | ➖ dismissed | 사유: 실패 표시는 E2 타임라인 본문(order-timeline-error)이 맡는다 — 버튼은 토글만 |
| long-text | E1 오늘 주문 펼침 트리거(버튼) | ✅ resolved (explicit) | 버튼 내용은 ▶ 표식(aria-hidden · 10px 고정 폭) + 고정 형식 시각 텍스트 HH:MM:SS 뿐이라 길이가 변하지 않는다 — 시각 칸 폭은 현행 그대로 |
| empty | E2 오늘 주문 펼침 타임라인 | ✅ resolved (explicit) | 응답 0건이면 order-timeline-empty 한 줄 「전략 이벤트 없음 — 수동 주문이거나 상따 기록 전 주문」(11px --faint · Copywriting 행 참조), 빈 박스는 쓰지 않는다 |
| loading | E2 오늘 주문 펼침 타임라인 | ✅ resolved (explicit) | 처음 펼침 조회 중 order-timeline-loading 「불러오는 중…」 한 줄 + 본문 aria-busy=true · 스켈레톤 없음 · 재조회 중에는 기존 줄을 그대로 두고 로딩 줄을 다시 띄우지 않는다 |
| error | E2 오늘 주문 펼침 타임라인 | ✅ resolved (explicit) | order-timeline-error role=status 「이벤트를 불러오지 못했어요」 + 「다시 시도」 버튼(RPC 1회) · 이미 그린 줄이 있으면 유지하고 아래에 실패 한 줄 |
| populated | E2 오늘 주문 펼침 타임라인 | ✅ resolved (explicit) | gw_time_ms 오름차순 · 같은 ms 는 통보→상따 · 같은 출처는 seq 순 · 줄 = 시각 82px(모바일 78) · 배지 32px(통보 muted / 상따 accent) · 행위 단어 600 + 본문 --muted-fg · 묶음 행은 줄 끝 #주문번호 꼬리 |
| partial | E2 오늘 주문 펼침 타임라인 | ✅ resolved (explicit) | 전략 이벤트가 없는 주문(수동 · 기록 전)은 통보 줄만 그리고 빈 문구를 띄우지 않는다 · qty null 이면 누적 분모 없이 「체결 N주」 · 모르는 enum 값은 원문 코드 그대로(D-10) |
| overflow | E2 오늘 주문 펼침 타임라인 | 🧪 resolved (backstop) | { statement: 펼침 행은 높이 auto · white-space normal · 모바일 li flex-wrap 으로 페이지 스크롤 안에서 자란다. 검증: 390px 에서 기획서 상따 「주문」 줄(가장 긴 문장)이 줄바꿈으로 전부 보이고 시각 78px 칸이 밀리지 않는다 — 실측 스크린샷 또는 e2e 폭 단언, verification: backstop } |
| zero-one-many | E2 오늘 주문 펼침 타임라인 | ✅ resolved (explicit) | 줄 수에 따른 문구·간격 분기 없음(줄 간격 3px 동일) · 묶음(2-A)은 7건이면 7건 × 2~3줄을 한 타임라인에 그리고 접지 않는다 · 여러 행 동시 펼침 허용 |
| empty | E3 주문로그 목록(공용 패널 · 창 분리) | ✅ resolved (explicit) | 오늘 0건 = 점선 박스 「오늘 주문로그가 없어요」 + 본문 한 줄 · 필터 0건 = 「조건에 맞는 로그가 없어요」 + 「0건」 · 창 분리 과거일 0건 = 「이 날은 주문로그가 없어요」 + 본문 — 전부 Copywriting 행 |
| loading | E3 주문로그 목록(공용 패널 · 창 분리) | ✅ resolved (explicit) | 하루치 조회 중이고 줄이 0 이면 order-log-loading 「불러오는 중…」 11px --faint 한 줄(목록 패딩 안) · 푸시로 이미 줄이 있으면 로딩 줄 없음 |
| error | E3 주문로그 목록(공용 패널 · 창 분리) | ✅ resolved (explicit) | order-log-error role=status 「오늘 주문로그를 불러오지 못했어요」(과거일 「이 날 주문로그를 …」) + 「다시 시도」 — 목록 맨 위 · 푸시로 온 줄은 아래에 그대로 |
| populated | E3 주문로그 목록(공용 패널 · 창 분리) | ✅ resolved (explicit) | 오름차순(gw_time_ms, gateway, seq) F-A 한 줄 · 11px/1.7 · 줄 간격 1px · 구분 색 축(매수 up · 매도 down · 시세 accent-fg) · 푸시 줄은 data-new 8% 배경 3초 뒤 제거 |
| partial | E3 주문로그 목록(공용 패널 · 창 분리) | ✅ resolved (explicit) | 시세 이벤트(kind 1·2)는 주문번호 칸 자체가 없고 행위 단어 없이 본문부터 · 거부(kind 8)는 [—] · 종목 이름은 이름→코드→ISIN 3단 폴백이라 칸이 비지 않는다 |
| overflow | E3 주문로그 목록(공용 패널 · 창 분리) | ✅ resolved (explicit) | 목록은 자기 스크롤러(order-log-body · 공용 패널 172px · 창 분리 뷰포트 남은 높이) 안에서만 넘치고 페이지를 밀지 않는다 · 맨 아래 판정 24px · 올려 보는 중 새 줄은 위치 유지 + 핀 「새 로그 N · 맨 아래로 ↓」 · 스토어 상한 초과는 오래된 줄부터 조용히 버림 |
| zero-one-many | E3 주문로그 목록(공용 패널 · 창 분리) | ✅ resolved (explicit) | 배지 · 핀은 0 이면 생략, 1 이상은 같은 문법 「(N)」 · 「새 로그 N」 으로 단/복수 분기 없음 · 건수 「N건」 은 필터 뒤 줄 수 |
| long-text | E3 주문로그 목록(공용 패널 · 창 분리) | ✅ resolved (explicit) | 비폰 밴드 = 줄 끝 말줄임(…) + li title 에 줄 전체 평문 · 폰 밴드 = 줄이 aria-expanded 버튼, 탭하면 그 줄만 white-space normal 로 줄바꿈(다시 탭 접힘 · 필터 바꾸면 전부 접힘) |
| empty | E4 주문로그 필터줄 | ✅ resolved (explicit) | 이벤트가 없는 날도 칩 3개(종목 · 거래소 · 구분)는 「전체」 하나짜리 옵션으로 그려지고 건수는 「0건」 · 종목 옵션은 그날 범위 안 이벤트가 있는 종목만 |
| loading | E4 주문로그 필터줄 | ➖ dismissed | 사유: 필터줄은 스토어에서 파생되는 즉시 필터라 자체 로딩 상태가 없다 — 조회 중 표시는 E3 목록이 맡는다 |
| error | E4 주문로그 필터줄 | ➖ dismissed | 사유: 제출이 없는 선택 즉시 필터(native select)라 실패 경로가 없다 — 조회 실패는 E3 목록이 맡는다 |
| partial | E4 주문로그 필터줄 | ✅ resolved (explicit) | 「전체」 가 아닌 칩만 .sel.on(테두리 primary · 면 accent) 강조, 나머지는 기본 · 창 분리 쿼리는 「전체」 를 생략하고 형식 오류 값은 전체로 교정한다 |
| long-text | E4 주문로그 필터줄 | ✅ resolved (explicit) | 칩 라벨은 white-space nowrap · 긴 종목 이름은 native select 옵션이 처리 · 필터줄은 flex-wrap 이라 좁으면 칩이 다음 줄로 내려가고 잘리지 않는다 |
| loading | E5 공용 패널 · 카드 탭 트리거 | ➖ dismissed | 사유: 탭 트리거에는 로딩 상태가 없다 — 배지 숫자는 스토어 카운터(unseen)에서 즉시 파생된다 |
| error | E5 공용 패널 · 카드 탭 트리거 | ➖ dismissed | 사유: 탭 전환은 로컬 state + 선호 저장뿐이라 실패 경로가 없다 |
| overflow | E5 공용 패널 · 카드 탭 트리거 | 🧪 resolved (backstop) | { statement: 공용 패널 탭 4개 + 접기 버튼은 whitespace-nowrap, 카드 탭 5개는 기존 overflow-x-auto 탭 줄 안에서 가로 스크롤. 검증: 폰 밴드(390px)에서 공용 패널 탭 줄이 한 줄에 들어가고 카드 탭 줄이 카드 폭을 밀지 않는다 — 실측 필요(탭이 하나 늘었다), verification: backstop } |
| long-text | E5 공용 패널 · 카드 탭 트리거 | ✅ resolved (explicit) | 라벨은 고정 「주문로그 (N)」 · N 은 스토어 상한 이하라 자릿수 유한 · nowrap · 기존 「로그」 는 「전략로그」 로 라벨만 바뀐다 |
| empty | E6 카드 주문로그 탭 본문 | ✅ resolved (explicit) | dense 점선 박스(m-2 py-2) 제목만 「이 종목의 주문로그가 없어요」 — CARD_TABS_BODY_H 안에 든다(StrategyLog dense 와 같은 문법) |
| loading | E6 카드 주문로그 탭 본문 | ✅ resolved (explicit) | 공용 패널과 같은 스토어라 별도 조회 없음 · 스토어가 조회 중이고 줄 0 이면 「불러오는 중…」 한 줄(dense) |
| error | E6 카드 주문로그 탭 본문 | ✅ resolved (explicit) | 한 줄 role=status 「오늘 주문로그를 불러오지 못했어요」 + 「다시 시도」 — 공용 패널과 같은 재조회 1회 |
| populated | E6 카드 주문로그 탭 본문 | ✅ resolved (explicit) | dense 줄(패딩 3px 8px · 간격 0 · 11px/1.6) · 괄호 없이 시각 · #주문번호 · 구분 · 본문 \| 누적 · 거래소 · 종목 생략(카드가 그 종목·거래소) |
| partial | E6 카드 주문로그 탭 본문 | ✅ resolved (explicit) | 시세 줄은 주문번호 없이 시각 · 구분 · 본문 · 모르는 enum 은 원문 코드 |
| overflow | E6 카드 주문로그 탭 본문 | 🧪 resolved (backstop) | { statement: 본문은 CARD_TABS_BODY_H 고정 높이 안의 h-full 스크롤러 · 핀 없음 · 자동 따라감. 검증: 줄이 10개 이상일 때 카드 높이가 변하지 않고 약 3줄이 보이며 새 줄 도착 시 맨 아래로 따라간다 — 실측 필요, verification: backstop } |
| zero-one-many | E6 카드 주문로그 탭 본문 | ✅ resolved (explicit) | 배지 0 이면 괄호 생략 · 줄 1개든 많든 같은 dense 문법 · 핀·복수형 분기 없음 |
| loading | E7 창 분리 머리줄 · 날짜 이동 | ✅ resolved (explicit) | 날짜 이동마다 RPC 1회 · 조회 중 표시는 목록의 「불러오는 중…」 한 줄이 맡고 머리줄 버튼은 비활성화하지 않는다(다음 날 버튼만 오늘일 때 disabled) |
| error | E7 창 분리 머리줄 · 날짜 이동 | ✅ resolved (explicit) | 과거일 조회 실패 = 목록 상단 role=status 「이 날 주문로그를 불러오지 못했어요」 + 「다시 시도」 · 형식 오류·미래 날짜 쿼리는 오늘로 교정 + router.replace |
| overflow | E7 창 분리 머리줄 · 날짜 이동 | ✅ resolved (explicit) | 머리줄 조각(제목 14px · 24px 화살표 · mono 날짜 · 오늘 알약)은 전부 flex:none 고정 폭이라 넘치지 않고, 그 아래 필터줄이 flex-wrap 으로 내려간다 · 새 창 기본 960×720 |
| long-text | E7 창 분리 머리줄 · 날짜 이동 | ✅ resolved (explicit) | 날짜 라벨 「YYYY-MM-DD (요일)」 · 제목 「주문로그」 · 문서 제목 「주문로그 · YYYY-MM-DD」 — 전부 고정 길이 |
| empty | E8 진행률 보조행(데스크톱 3표면) | ✅ resolved (explicit) | QueueProgress 스냅에 (계좌 · 주문번호) 항목이 없으면 보조행 없음(D-11 · 대기 여부를 추정하지 않는다) · 항목이 빠지거나 미체결 행이 사라지면 보조행 삭제(D-13) |
| loading | E8 진행률 보조행(데스크톱 3표면) | ➖ dismissed | 사유: 값은 unf.progress 푸시 스냅에서만 오고 웹이 조회·계산하지 않는다(D-11 · 웹 계산 없음) — 로딩 상태가 존재하지 않는다 |
| error | E8 진행률 보조행(데스크톱 3표면) | ➖ dismissed | 사유: 실패 경로가 없다 — 푸시가 멈추면 마지막 값을 유지하고 오래된 값 표식을 두지 않는다(D-13 · 단일가·VI 구간 정상) |
| populated | E8 진행률 보조행(데스크톱 3표면) | ✅ resolved (explicit) | 한 줄 「{group} · 체결예상까지 {N}주 남음 [막대 140px] {P}%」 · 트랙 6px --muted · 채움 primary, P≥90 이면 --up(data-near) · 폭 전환 300ms |
| partial | E8 진행률 보조행(데스크톱 3표면) | ✅ resolved (explicit) | remaining_volume ≤ 0 또는 progress_bp ≥ 10000 → 「0주 남음」 + 100%(D-12) · 음수 0 · 100 상한 · 모르는 group 은 원문 코드 · 취소 보관(pendingCancelSent) 행은 숫자 muted + 채움 --faint |
| overflow | E8 진행률 보조행(데스크톱 3표면) | 🧪 resolved (backstop) | { statement: 보조행 셀은 white-space nowrap · colSpan(stockScope?5:7) · 표 가로 스크롤(tbl-wrap)이 넘침을 받는다. 검증: 카드 탭 임베드(stockScope) 최악 폭에서 보조행이 표 가로 스크롤 안에 들고 종류명 · % 가 잘리지 않는다 — 실측 필요, verification: backstop } |
| zero-one-many | E8 진행률 보조행(데스크톱 3표면) | ✅ resolved (explicit) | 미체결 행마다 독립 보조행 — 대기 행 N개면 보조행 N줄, 0 이면 표 불변 · 취소 결과 행이 있으면 보조행이 그 위 |
| long-text | E8 진행률 보조행(데스크톱 3표면) | ✅ resolved (explicit) | 숫자는 Intl ko-KR 콤마 · 종류명은 표시명 표(3~4자) · 문구 고정 · nowrap 이라 줄바꿈 없음 |
| overflow | E9 모바일 진행률 r3 | ✅ resolved (explicit) | 막대가 r3 의 유일한 신축 항목(flex:1 1 auto · min-width:0) · 종류명 · N주 남음 · P% 는 flex:none — 잘림 없음(account-panel ⑤ 규율) · StatusNotes 는 r4 로 내려간다 |
| long-text | E9 모바일 진행률 r3 | ✅ resolved (explicit) | 「체결예상까지」·「·」 를 생략한 짧은 문구 「{group} {N}주 남음 … {P}%」 · 숫자 mono · 종류명 고정 길이 |
| overflow | E10 오늘 주문 별건 3 칩 | ✅ resolved (explicit) | 칩은 기존 StatusTag/SideTag 문법(whitespace-nowrap) · 「접수 불명」 4자 · 표 셀 넘침은 tbl-wrap 가로 스크롤 · 모바일 r1 은 종목명만 신축 |
| long-text | E10 오늘 주문 별건 3 칩 | ✅ resolved (explicit) | 표시 문구는 고정(「접수 불명」 · 「주문」 · 「▲ 매수」/「▼ 매도」) · 긴 설명은 title 툴팁 두 문장으로만 |

---

## 재량 결정 (Claude's Discretion 행사 — 체커·플래너가 확인할 수 있게)

| # | 결정 | 한 줄 근거 | 사용자 확인 권장? |
|---|---|---|---|
| R1 | 「맨 아래」 판정 여유 **24px** | 줄 높이 ≈18.7px 보다 조금 커서 반 줄 어긋남에 핀이 깜빡이지 않는다 | 아니오 |
| R2 | 배지 = 탭 **범위** 안 푸시 줄 수 · 필터줄 선택은 적용 안 함 · 폰 밴드 패널 접힘도 「가려짐」 | 필터는 보는 방식이고 배지는 「새로 쌓인 것」 · 카드 탭(필터 없음)과 같은 뜻이 된다 | 아니오 |
| R3 | 창 분리 쿼리 이름 `account` · `date` · `stock`(ISIN) · `ex` · `kind`(`pre/add/post/sell/market`) · 「전체」 는 생략 | 이벤트 키가 ISIN 이라 변환 조회가 없다 · 짧고 기본값이 URL 에 안 남는다 | 아니오 |
| R4 | 새 창 `width=960,height=720` · 창 이름 `gh-radar-order-log`(다시 누르면 같은 창 재사용) | F-A 한 줄이 대부분 잘리지 않는 폭 · 창이 쌓이지 않는다 | 아니오 |
| R5 | 폰 밴드 판정 = **`wb` 폰 밴드**(작업대 `phoneBand` · 창 분리는 같은 JS 상수 공유 + 루트 `@container/wb`) — 결정 2 괄호의 「본문 <685」 는 카드 본문(`lc`) 경계 숫자다 | 주문로그는 카드 본문이 아니라 작업대 페이지 표면이다 · §2.2b 마지막 문단 「`wb` 경계를 `lc` 값 따라 옮기지 마라」 · 두 판정 차이는 폴드 등 좁은 구간뿐이고 동작(잘림 + 탭 펼침)은 같다 | 아니오(밴드 이름·동작 동일) |
| R6 | 주문로그 탭 첫 체결 행위 단어 「체결」 · 펼침은 「첫 체결」 | 기획서 원문과 채택 F-A 는 「체결」, 채택 1-A 는 통보 「체결」 줄과 섞이므로 「첫 체결」 · 본문은 같다(D-09) | 아니오 |
| R7 | 펼침 통보 줄 = 템플릿 v0 문장에서 **행위 단어만** 앞 굵은 칸으로 올리고 나머지는 원문 그대로(예: 「**체결** 매수 100주 @12,350 (누적 100/300)」) — 목업 1-A 의 체결 줄(방향 생략)과 방향 단어 1개 차이 | CONTEXT 「템플릿 v0 그대로 — 재작성하지 않는다」 가 목업 세부보다 우선 | **예**(가벼움 — 목업과 단어 1개 다름) |
| R8 | 「오차 +N」 에 색 없음(부호만) — 목업 1-A 의 `.plus` 빨강을 쓰지 않음 | `--up` 은 매수 방향 · 90% 축 · 채택 F-A 탭은 무색 · 두 표면 같은 본문(D-09) | **예**(가벼움 — 목업과 색 다름) |
| R9 | 상따 그룹 표시명은 펼침에서 **주문 줄(kind 3·6)에만** 앞에 붙음 | 채택 1-A 그대로 — 대기 · 첫 체결 · 취소 줄은 같은 주문의 연속이다 | 아니오 |
| R10 | 새 로그 줄 강조 **3초** 후 제거 · 펼침 타임라인에는 강조 없음 | 푸시가 잦아 오래 두면 목록 전체가 강조된다 · 타임라인은 이력이다 | 아니오 |
| R11 | F-A 줄 `title` = 줄 **전체** 평문(목업은 본문만) | 잘린 쪽이 대개 본문 끝이지만 번호·종목까지 한 번에 읽히는 편이 복사·대조에 낫다 | 아니오 |
| R12 | 필터 = 네이티브 `<select>`(shadcn Select 미설치 · 새 컴포넌트 0) · 종목 옵션은 표시 이름 가나다순 | 모바일 네이티브 피커 · 키보드 · 스크린리더 무료 | 아니오 |
| R13 | 창 분리 날짜 화살표 글리프 `‹` `›`(목업) · 「오늘」 알약은 오늘을 볼 때 accent 표식(`aria-current`) · 과거일엔 테두리형 버튼 | 결정 5 설명의 「◀ ▶」 는 설명어이고 사용자가 본 목업 렌더는 `‹ ›` · 알약 한 개로 「지금 오늘」 과 「오늘로」 를 모두 말한다 | 아니오 |
| R14 | 창 분리 제목 14px(목업 13px) | 선언 척도로 접음 · 오늘 주문 카드 제목과 같은 문법 | 아니오 |
| R15 | 창 분리 핀은 **오늘만** 표시(배지는 없음) | 결정 5 「배지 없음 · 스크롤 고정만」 — 핀은 스크롤 고정의 일부 · 과거일은 새 줄이 없다 | 아니오 |
| R16 | 진행률 % = `floor(bp/100)` · 취소 보관 행은 채움 `--faint` · 보조행은 비상호작용이나 선택 배경은 따라감 | 99.9% 를 100% 로 올려 「곧 내 차례」 를 앞당기지 않는다 · 취소 중 주문을 빨강으로 부르지 않는다 · 짝이 한 덩어리로 읽힌다 | 아니오 |
| R17 | 진행률 보조행 문구 3표면 동일(종목 · 거래소 조각 없음) · 모바일만 「체결예상까지 · 」 생략 | 위 행이 종목·거래소를 이미 말한다 · 목업 B안 / r3 그대로 | 아니오 |
| R18 | 「주문」 폴백은 `orderActionWord` 에서 냄(`trading-alerts` 도 같은 단어) | gh-trade 대조 합의 「방향 미상 「주문」 통일」 · 판정 한 곳 | 아니오 |
| R19 | 펼침 재조회 = 묶음 단위 trailing **400ms** 디바운스 · in-flight 접기 | 조각 체결 폭주 시 Cloud Run 왕복 폭주 방지(Pitfall 10) | 아니오 |
| R20 | 펼침 실패 줄은 「이벤트를 불러오지 못했어요」 + 버튼 「다시 시도」(점 구분자 없이 6px 간격) | 결정 8 의 「 · 」 는 설명 구분자, 목업 렌더는 간격 6px | 아니오 |

---

## relay/server 의존 (이 계약의 전제 — 범위 밖)

- **fbs 전(서버 무관)에 가능한 것:** 이 계약의 UI 골격 전부 — 목록 · 필터 · 핀 · 배지 · 펼침 · 타임라인 · 진행률 보조행 · 별건 3 · 창 분리 라우트 · 문장 조립기 · 표시명 표. 데이터는 기획서 하루 흐름 **픽스처 1벌**(○○전자 12451~12455 + 상한가노출/진입 · Queued 세 갈래)을 목·e2e 가 공유한다.
- **푸시가 서야 참이 되는 것:** `journal.events`(저널 행과 같은 계좌 필터 + 시세 이벤트 공개 규칙) → 주문로그 탭 이어붙임 · 배지 · 핀 · 펼친 행 라이브. `unf.progress`((isin, exchange) 전량 교체 · `account_no` 필수 · 인증 직후 스냅 재생) → 진행률 보조행 전부. 둘 다 없으면 탭은 복원 줄만, 진행률은 **보조행 0**(D-11 — 정상 상태로 보인다).
- **조회가 서야 참이 되는 것:** 하루치 평면 목록(계좌 조인 + 시세 공개 · service_role 전용 + 명시 REVOKE) → 탭 복원 · 창 분리 날짜 이동. 주문별 이벤트(UNION ALL · `gw_time_ms bigint` · 통보 0 / 상따 1 순위 · order_no 배열) → 펼침.
- 계좌 가시성은 **server/SQL 이 판정**한다 — 웹의 계좌 거름(상태줄 계좌 · 카드 계좌 · `account` 쿼리)은 보기 선택일 뿐 권한이 아니다.
- 진행률 조인 문자열 동일성(`order_no` · `account_no` — A7)은 fbs 뒤 fake-gateway 통합 + 실장 UAT 로 확인. 조인 실패는 dev 로그 1회로 드러낸다.
- 배포 순서(gh-trade 서버 → relay → webapp push)는 CONTEXT 고정 — 이 문서는 바꾸지 않는다. webapp push 는 relay 가 두 푸시를 내보낸 **뒤**에만.

---

## 검증 훅 (감사·e2e 가 잴 것)

- 오늘 주문: 주문번호 있는 행 `today-order-expand` 버튼 존재 · 클릭 → `aria-expanded="true"` · `today-order-detail` 행 `colSpan=8` · 두 행 동시 펼침 · 주문번호 없는 행은 버튼·`aria-expanded` 부재 + 클릭 뒤 DOM 변화 0 · 같은 ms 두 줄은 `data-source="journal"` 이 먼저 · 묶음 행 줄마다 `#주문번호` · 로딩/실패/0건 `data-slot` 과 문구 일치 · `lastSeq` 연속 5회 상승 → 재조회 1회(가짜 타이머).
- 공용 패널: 탭 DOM 순서 `unfilled → holdings → orderlog → log` · `sharedTab:"orderlog"` 저장 → 재마운트 복원 · 다른 탭 활성 중 푸시 3건 → 트리거 「주문로그 (3)」 · 탭 열면 괄호 부재 · 상태줄 계좌 전환 → 다른 계좌 주문 줄 0 + 시세 줄 유지 · 필터 칩 비기본 `.on` · 건수 일치.
- 스크롤: 맨 아래에서 푸시 → `scrollTop + clientHeight ≥ scrollHeight − 24` 유지 · 위로 올린 뒤 푸시 3건 → 위치 불변 + 핀 「새 로그 3 · 맨 아래로 ↓」 · 핀 클릭 → 맨 아래 + 핀 부재 · 카드 탭 `order-log-pin` 부재.
- 폰 밴드(작업대 390): 줄 탭 → `aria-expanded="true"` + `white-space:normal` · 비폰 밴드(1280): 줄 버튼 부재 + `title` 에 줄 전체 평문.
- 카드: 탭 라벨 「전략로그」(값 `log`) · 「주문로그」 필터줄 부재 · 다른 종목·거래소 줄 0.
- 창 분리: `/trading/order-log?account=…` 앱 셸·사이드바 부재 · 오늘 › `disabled` · ‹ → `date` 쿼리 하루 전 + RPC 1회 · 과거일 푸시 무시 · 네이티브 셸(`html.native-app`)에서 `order-log-popout` 비표시.
- 진행률: 항목 없음 → `unfilled-progress-row` 부재 · 8800 → 88% `--primary` · 9000 → `data-near="true"` · remaining −5 → 「0주 남음」 100% · 항목 제거 → 보조행만 제거 · 임베드 stockScope `colSpan=5` · 모바일 390 `unfilled-progress` 가 `account-unfilled-note` 보다 **앞** · `role="progressbar"` 값 속성 4종.
- 별건 3: 방향 미상 `data-side="none"` 텍스트 「주문」 · result_code −2 `data-tone="muted"` 「접수 불명」 · R(New) `data-side-ref="true"` + 계산 색 = `--muted-fg`.
- 폭: 공용 패널 · 카드 탭 · 창 분리를 본문 최악 폭(폰 344 · 각 밴드 경계 직후)에서 가로 넘침 0(목록 줄은 잘림 허용 · 필터줄은 줄바꿈).
- 뷰포트 `@media (min/max-width)` 신규 0 · 새 컨테이너 경계 숫자 0 · 새 색 토큰 0 · 시각 포맷 `HH:MM:SS.mmm`(`hourCycle:"h23"` · `Asia/Seoul`).
- axe(344 · 1280, 라이트·다크) critical/serious 0 — 위 「알려진 대비 예외」(`--faint` 보조 글자)는 기존 예외 목록과 같은 규칙으로 다룬다.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official (`@shadcn` · `components.json` `registries: {}`) | 새로 추가하는 블록 없음 — 설치된 tabs · table 재사용 | not required |
| 서드파티 | 없음 | 해당 없음 |

---

## 출처

- `25-CONTEXT.md` D-01~D-13 · 「이미 확정된 것」 · Claude's Discretion 목록
- 2026-09-29 사용자 확정 8건 — `reference/mockup-open-decisions.html` 머리 「채택 결과」(1-A · 2-A · 3-A · 4-B · 5-A · 6-A · 7-A · 8-A) · CSS `.filters` `.sel` `.pin` `ul.lines` `li.wrap.open` `.ctab` `.cbody` `.datenav` `.side-ref` `.st.muted` `.r3` `.rn` `.caret.none` `.loading` `.fail` `.empty`
- 채택 목업 `reference/mockup-today-orders-expand.html`(1-A · 2-A · 3-A · 모바일 — `.tl` `.caret` `tr.d` `.row .det`) · `reference/mockup-order-log-tab.html`(F-A — `ul.lines` `.body` `.pin`) · `reference/mockup-unfilled-progress.html`(B안 `tr.sub .line` `.bar` · 모바일 `.r3`)
- `25-RESEARCH.md` — Pattern 6~9 · Pitfall 9~15 · Open Questions 1 · 6 · Code Example 4(문장 기대값)
- `reference/spec-order-log-progress-20260929.md`(기획서 예시 로그) · `reference/gh-trade-order-log-template-draft.md` · `reference/order-log-template-review.md` · `reference/gh-trade-strategy-event-fields-v0.1.md`(kind · group · cancel_reason enum)
- `24-UI-SPEC.md`(문서 구조 · 상속 예외 블록 · relay 의존 절 문법)
- `webapp/src/styles/globals.css`(토큰 · §2.2b 밴드 · `wb`/`lc` 컨테이너 문단 · `.tbl-wrap` 층 없는 규칙) · `today-orders-card.tsx` · `workbench/shared-panels.tsx` · `card/card-tabs.tsx` · `orderbook/account-panel.tsx` · `strategy-log.tsx`(embed 줄·빈 박스 — 참고만) · `exchange-tag.tsx` · `origin-tag.tsx` · `lib/order-notices.ts` · `lib/orders-api.ts` · `lib/trading-layout.ts` · `workbench/trading-workbench.tsx`(`WB_PHONE_BAND_BELOW` · `@container/wb`) · `lib/native/native-detect.ts` · `app/trading/page.tsx`

---

## Checker Sign-Off

gsd-ui-checker 실행 2026-09-29 (sonnet) — **VERIFIED · APPROVED**.

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: **FLAG**(비차단) — 「목업 고정 예외 SP」 8건은 출처·이유가 적힌 선언적 예외라 통과. 권고: 구현 중 그 목록 밖에 4의 배수가 아닌 간격을 새로 만들지 않는다.
- [x] Dimension 6 Registry Safety: PASS
- [x] Dimension 7 Inventory Provenance: PASS

**Approval:** approved — UI Considerations probe 50/50 해결(explicit 38 · backstop 4 · dismissed 8). 사용자 확인 사항: 8건 결정(`reference/mockup-open-decisions.html`) · 오차 숫자 무색(R8) · 통보 줄 「매수」 단어 유지(R7 · CONTEXT 템플릿 잠금).
