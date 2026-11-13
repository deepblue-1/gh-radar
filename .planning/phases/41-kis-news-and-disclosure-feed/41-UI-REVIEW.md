# Phase 41 — UI Review (재감사)

**Audited:** 2026-11-13
**Baseline:** 추상 6필러 기준 + 채택 목업 `reference/mockup-news-disclosure-web.html` (UI-SPEC.md 없음) · 결정 D-15 ~ D-20 · UAT 보정 · 41-09 UAT 결과(2026-11-12 사용자 「됐다」)
**Screenshots:** not captured (지시에 따라 dev server · 브라우저 미사용 — 코드 전용 감사)
**Interaction captures:** off (`workflow.ui_interaction_capture` false). 상호작용 판단은 모두 코드에서 도출했다.

이 판은 첫 감사(17/24)를 대체한다. 첫 감사의 타이포 · 홈 배지 · 한 글자 배지 · 터치 타깃 · `--faint` 지적은 목업과 결정 문서를 대조하지 않은 채 쓴 것이라 아래에서 철회하거나 낮췄다.

---

## 목업 대조 결과 (기준선)

| 항목 | 목업 값 | 코드 | 판정 |
|---|---|---|---|
| 배지 full / mini | 11px·600·r5·`1px 6px` / 10px·`0 4px` | `feed-kind-badge.tsx:38-39` 동일 | 일치 |
| 색 토큰 | `#c2410c / #fff4e6` · 다크 `#ff9f43 / rgba(255,159,67,.16)` | `globals.css:180-183, 361` 동일 | 일치 |
| 목록 줄 제목 / 시각 / 자료원 | 14px·500 / 12px / 11px | `--t-sm`(14) · `--t-caption`(12) · 11px (`news-item.tsx`) | 일치 (토큰 값 `globals.css:197` 로 확인) |
| 글 줄 `.fr` 시각 / 제목 / 자료원 | 11.5 / 13 / 11px | `feed-rows.tsx:72, 79, 99` 11.5 / 13 / 11 | 일치 |
| 상따 띠 | 12.5px · 시각 11 · 건수 11.5 · min-h 30 · `5px 12px` | `card-news-strip.tsx:71, 77, 133` 동일 | 일치 |
| 돌파 상세 머리 | 13px·700 / 11.5px | `breakout-strip.tsx:558, 560` 동일 | 일치 |
| 홈 근거 | 14px / 12px · 공시만 배지 | `news-block.tsx` `--t-sm` / `--t-caption` · 공시만 배지 | 일치 |
| `.ni + .ni`·`.fr + .fr` 구분선 | `--border` | `--border-subtle` (`divide-y` · `feed-rows.tsx:72`) | 의도된 이탈 (행 구분선 가드 `tds-tokens.test`, 41-07 Deviations 1) |
| 폰 `.fr .src` | 숨김 | 제목 아래 줄로 표시 | 의도된 이탈 (D-20 자료원 항상 표기) |
| 데스크톱 자료원 열 | 96px | 88px (`news-item.tsx` card) | 사소한 차이 (플랜 41-04 가 기존 그리드 88 유지) |
| 칩 안 mini 배지 간격 | 칩 gap 5 + 배지 `margin-left:4px` | 칩 gap 6 + 배지 묶음 `gap-0.5`(2px) (`breakout-strip.tsx:538, 663`) | 사소한 차이 — 공 / 뉴 사이 2px 가 목업 4px 보다 좁음 |
| 펼친 줄 좌우 안쪽 여백 | `.fr` 가로 padding 0 | `px-1`(4px) — 강조 배경 모서리용 | 사소한 차이 — 띠 글자(12px 들여쓰기)와 펼친 줄 글자가 4px 어긋남 |

결론: 첫 감사가 지적한 11 / 11.5 / 12 / 12.5 / 13px 는 전부 목업과 호스트 화면 양쪽에서 온 값이다. 타이포 이탈은 없다.

## 결정 문서 대조 (첫 감사 지적의 처분)

- **홈 「공시만 배지」 → 철회.** 목업 ④ 는 공시에만 배지를 달고(`style="margin-right:6px"` 가 `.bd.d` 만), 41-10-PLAN Task 3 도 「배지(kind 가 disclosure 일 때)」 로 명시했다. D-19 · D-20 채택안과 일치.
- **「공」「뉴」 한 글자 칩 → 철회.** CONTEXT `<specifics>` 「목업의 배지 낱말: 넓은 자리 「공시」「뉴스」, 좁은 자리(칩 · 표 행) 「공」「뉴」」 와 D-17 이 명시한 사용자 채택 사항. 스크린리더 이름은 `role="img"` + `aria-label`(41-04 key-decisions)로 보완됨.
- **「N건+」 → 철회.** 목업은 「4건 ▾」 만 있고 상한 표시(`+`)는 41-05 · 41-07 이 더한 확장이다. 상한 도달을 알리는 것 자체는 정확한 정보이므로 결함이 아니다.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | D-16 · D-18 · D-20 문구 일치. 링크 줄 `aria-label` 이 배지(공시 / 뉴스)를 가려 보조기기에는 종류가 안 읽힘 |
| 2. Visuals | 3/4 | 목업과 사실상 일치. 칩 mini 배지 간격 · 펼친 줄 4px 들여쓰기 어긋남 정도 |
| 3. Color | 3/4 | 토큰 목업 일치. 뉴스 배지 대비 4.19 : 1 · 빈 띠 2.01 : 1 은 목업 · 앱 규약에서 온 값 |
| 4. Typography | 4/4 | 모든 크기가 목업 · `--t-*` 토큰과 일치. 이탈 없음 |
| 5. Spacing | 3/4 | 경계 685 / 700 정본 준수. 띠 ↔ 펼친 줄 정렬 4px 어긋남, 칩 배지 간격 |
| 6. Experience Design | 2/4 | 돌파 표 행 선택(상세의 유일한 진입)이 키보드 · 보조기기에서 도달 불가 |

**Overall: 18/24**

---

## Top Fixes (근거 포함)

1. **돌파 표 행 선택이 마우스 · 터치 전용 (WARNING)**
   - 증거: `breakout-strip.tsx:750-756` 의 `TableRow` 에 `onClick={() => onSelect(v.row)}` 만 있고 `tabIndex` · `onKeyDown` · `role` · `aria-selected` / `aria-expanded` 가 파일 전체에서 `:484` (더보기 버튼) 외에 없다. `grep tabIndex|onKeyDown|aria-selected` 결과 동일.
   - 영향: D-17 이 행 클릭을 「카드 열기 → 선택 토글」로 바꿨고(41-05 SUMMARY) 이제 표 아래 뉴스·공시 상세로 가는 유일한 경로다. 이전 행 클릭은 「추가」 버튼이 키보드 대체 경로였지만 상세에는 대체 경로가 없다. 목업은 이 부분의 접근성을 규정하지 않는다.
   - 수정: 이름 셀에 선택 토글 `button`(`aria-expanded` · `aria-controls`=`breakout-feed-detail` id)을 두거나 행에 `tabIndex=0` + Enter / Space 처리 + `aria-selected`.
2. **링크 줄 `aria-label` 이 공시 / 뉴스 종류를 가림 (WARNING)**
   - 증거: `news-item.tsx:54` `aria-label={`${article.title} 원문 보기 (새 창)`}` — 링크 접근 이름이 이 문자열로 대체되어 안쪽 배지 텍스트(「뉴스」 / 「공시」)가 읽히지 않는다. 이 `aria-label` 은 이전 phase 의 것이지만 41-04 가 배지를 링크 안에 넣어 종류 정보가 새로 가려지게 됐다. 링크 줄은 `url` 있는 뉴스뿐이라 공시는 영향 없음 — 영향은 「뉴스」 배지 한정.
   - 수정: `aria-label` 을 빼거나 `뉴스 · ${title} 원문 보기 (새 창)` 로.
3. **뉴스 배지 · 빈 띠 문구 대비 (INFO → 낮은 WARNING)**
   - 계산(WCAG 상대 휘도): `--feed-news`(#6b7684) on `--feed-news-bg`(#f2f4f6) = **4.19 : 1** (11px 600 에 AA 4.5 미달) · 다크 `#9e9e9e` on `#2d2d2d` 는 별도 값이나 `--muted-fg` / `--card` 6.82 : 1 로 양호. 공시 `#c2410c` on `#fff4e6` = **4.77 : 1** (통과).
   - 빈 띠 `--faint`: 라이트 `#b0b8c1` on `#ffffff` = **2.01 : 1**, 다크 `#636363` on `#151515` = **3.04 : 1** (on `#0a0a0a` 3.30 : 1).
   - 하지만 목업 `.nstrip.empty{color:var(--faint)}` 와 같은 값이고, 앱 전반이 `--faint` 를 비활성 · 힌트 문구에 쓴다(`globals.css:32` 「비활성 grey400 = `--faint`」; `tick-entry.tsx:357` 캡션, `account-editor.tsx:460` 힌트, `card-log-popups.tsx:426` 로딩 문구, `limit-feature-table.tsx:42`). 뉴스 배지 색은 `--feed-news: var(--muted-fg)` 로 기존 회색 규약 그대로. 따라서 이 phase 가 만든 결함이 아니라 TDS 토큰 규약의 한계다. 고치려면 phase 41 이 아니라 토큰 차원에서 다뤄야 하므로 참고 사항으로만 남긴다. 단 「최근 3일 뉴스·공시 없음」 은 상태 메시지라 `--muted-fg` 가 더 낫다(`feed-rows.tsx:53` 의 같은 문구는 이미 `--muted-fg`).
4. **띠 터치 높이 30px → 철회(참고)**
   - 목업 `.nstrip{min-height:30px}` 와 동일. 같은 화면 호스트 컨트롤: 카드 머리 버튼 `h-[26px]`(`card-header.tsx:227`), 배지 `h-[22px]`(`:335`), 돌파 칩 `h-[30px]`(`breakout-strip.tsx:663`), 돌파 「추가」 / ✕ `26px`(`:827, :845`). 띠(30px)는 호스트 컨트롤 중 큰 쪽이고, 카드 머리(`card-header.tsx:163` `py-3` 토글 영역)가 주된 탭 대상이다. 44px 는 입력 영역(`manual-order-form.tsx` `min-h-[44px]`)에만 쓴다. 결함 아님.
5. **칩 mini 배지 간격 · 펼친 줄 정렬 (사소)** — `breakout-strip.tsx:538` `gap-0.5` 를 목업 4px(`gap-1`)로, `feed-rows.tsx:72` `px-1` 때문에 띠(`px-3`)와 펼친 줄(`px-3` 래퍼 + `px-1`) 글자 시작이 4px 어긋나는 것은 래퍼를 `px-2`로 줄이면 맞는다.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- 빈 문구 「최근 3일 뉴스·공시 없음」 이 D-18 · 목업 문구와 일치(`feed-rows.tsx:25`, `card-news-strip.tsx:62`). 카드 제목 「관련 뉴스·공시」 · 「전체 보기 →」 등 41-04 문구표가 D-16 과 일치. 자료원 표기(D-20)는 PC 열 / 폰 보조 줄 / 홈 아래 줄 모두 존재.
- 결함: 위 Top Fix 2 (링크 줄 접근 이름). 빈 문구 상수가 두 파일에 중복(`FEED_ROWS_EMPTY_TEXT` · `CARD_NEWS_EMPTY_TEXT`) — 한쪽만 고치면 갈라지나 현재는 같은 값.

### Pillar 2: Visuals (3/4)
- 목업 ① A · ② · ③ · ④ 와 구조가 일치하고 `FeedKindBadge` 하나를 네 곳이 재사용. 41-09 UAT 에서 사용자가 폰 · PC 시각을 확인(「됐다」). 첫 감사의 「홈 뉴스 배지 없음」은 철회.
- 남은 차이는 위 표의 사소한 것 3건(자료원 열 96 vs 88 · 칩 배지 간격 · 4px 들여쓰기). 렌더를 직접 보지는 못했다.

### Pillar 3: Color (3/4)
- 하드코딩 hex 없음, `--feed-*` 토큰만 사용, 다크 값도 목업과 같음. 공시만 색 · 뉴스 회색의 의도 유지. 신규 강조 `--new-bg` 는 기존 돌파 강조와 같은 규칙.
- 감점: 위 Top Fix 3 의 대비 수치(뉴스 배지 4.19 : 1 · 빈 띠 2.01 : 1). 목업 · 앱 규약에서 온 값이라 가볍게 반영.

### Pillar 4: Typography (4/4)
- 감사 파일의 모든 크기 · 굵기가 목업 CSS 와 1 : 1 대응(위 표). 목록 계열은 `--t-sm` · `--t-caption` 토큰, 작업대 계열은 호스트(돌파 상세 13 / 11.5 · 표 12 / 11)와 목업이 같은 값이다. 굵기는 배지 600 · 제목 500 · 상세 머리 700 으로 목업 그대로 과장 없음. 이탈 없음.

### Pillar 5: Spacing (3/4)
- 반응형: `FeedRows` lc 685 · wb 700 은 호스트 컨테이너의 기존 경계와 같고(`globals.css` §2.2b 정본, 새 경계 없음). 띠는 컨테이너 폭만 사용, 뷰포트 분기 없음(41-07 수용 기준 grep 0).
- 감점: 펼친 줄 4px 어긋남 · 칩 배지 간격(Top Fix 5). `wb` 700 이 §2.2b 의 4밴드(685 · 830 · 992)와 별개 값인 것은 기존 작업대 규약이라 이번 phase 책임이 아님.

### Pillar 6: Experience Design (2/4)
- 장점: 상따 띠 상태 5종(pending 같은 높이 · empty · closed · open · new), `aria-expanded` / `aria-controls`, `stopPropagation`, 종목 뉴스 섹션 로딩 · 오류 · 빈 상태, 폴링 실패 시 마지막 값 유지, 코드 없는 행은 선택 불가(`breakout-strip.tsx:408`).
- 결함: Top Fix 1 — 선택 행 키보드 · AT 접근 불가. 선택 행 표시도 `data-selected` + 배경색뿐이고 접근성 속성이 없다.
- 새 글 강조는 배경색(`--new-bg`) 하나이며 `data-new` 는 AT 에 전달되지 않음(기존 돌파 강조와 같은 규약이라 참고).
- 파란 포커스 링은 터치에서 의도적으로 꺼 둔 것이라 제외했다. 키보드 포커스 표시는 코드로 판정하지 못했다.
- Registry audit: `components.json` · 제3자 레지스트리 해당 없음, 생략.

---

## 읽은 범위

전문 읽음: `reference/mockup-news-disclosure-web.html` · `41-09-SUMMARY.md` · `41-04 / 05 / 07 / 10-SUMMARY.md`(긴 줄은 600자에서 잘려 읽음) · `news-item.tsx` · `feed-kind-badge.tsx` · `feed-rows.tsx` · `card-news-strip.tsx` · `home/news-block.tsx` · `home/theme-card.tsx` · `home/solo-card.tsx` · `breakout-strip.tsx` 420 ~ 857행(1 ~ 420행은 설계 주석과 상태 · 훅 코드로 읽지 않음, `select` 핸들러 407 ~ 433행은 확인) · `format-feed-time.ts`(앞 40행).
부분 읽음: `41-CONTEXT.md` 40행 이후(D-11 ~ D-21 · specifics · deferred 전부, 1 ~ 39행의 D-01 ~ D-10 은 미열람) · `41-04 / 05 / 07 / 10-PLAN.md`(UI · 접근성 · 크기 · 배지 · 결정 키워드 grep 으로 해당 줄만 열람, 전문 정독 아님) · `globals.css`(토큰 · `--faint` 사용처 grep) · `card-header.tsx`(높이 클래스 grep).

## Files Audited
- .planning/phases/41-kis-news-and-disclosure-feed/reference/mockup-news-disclosure-web.html
- webapp/src/components/stock/news-item.tsx · feed-kind-badge.tsx · stock-news-section.tsx (ul 구분선 grep)
- webapp/src/components/trading/feed/feed-rows.tsx
- webapp/src/components/trading/card/card-news-strip.tsx · card-header.tsx (grep)
- webapp/src/components/trading/workbench/breakout-strip.tsx
- webapp/src/components/home/news-block.tsx · theme-card.tsx · solo-card.tsx
- webapp/src/lib/format-feed-time.ts
- webapp/src/styles/globals.css (토큰)
