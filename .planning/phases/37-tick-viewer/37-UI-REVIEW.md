# Phase 37 — UI 리뷰

**Audited:** 2026-11-04
**Baseline:** 추상 6-pillar 기준 (UI-SPEC.md 없음) + 37-CONTEXT.md 의 D-00 화면 정본(스케치 019 D · 020 A+3 · 진입 목업 A)
**Screenshots:** 캡처 안 함 — localhost:3100 서버 없음(HTTP 000). 코드 전용 감사
**Interaction captures:** off (workflow.ui_interaction_capture 꺼짐). 상호작용 판정은 전부 코드에서 읽은 것이다.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | 상태·오류 카피가 구체적이고 한글 일관. 다만 아이콘형 버튼 일부에 aria-label 없음, 영문 약어(KPI 등) 혼재 |
| 2. Visuals | 3/4 | D 종합 위계가 명확하나 3판 차트 + 3단 + 슬라이더 밀도가 폰에서 미검증(CONTEXT 미결 유지) |
| 3. Color | 3/4 | 토큰(`var(--…)`) 일관. `tick-stock-picker.tsx:102` 하드코딩 rgba 그림자 1건, 차트 색의 라이트/다크 검증 없음 |
| 4. Typography | 2/4 | 임의 px 크기 14종, 9.5·10px 극소 글자 다수, 굵기 4종 |
| 5. Spacing | 2/4 | `[Npx]` 임의 값 61건, 스케일 이탈(9px·5px·3px·7px) 반복 |
| 6. Experience Design | 3/4 | 로딩·변환·자료없음·오류·라이브 지연 상태는 촘촘함. 포커스 링 누락 2곳, 터치 타깃 작음 |

**Overall: 16/24**

---

## Top 3 Priority Fixes

1. **타이포 스케일 부재(임의 px 14종 · 최소 9.5px)** — 호가·전문 목록·칩이 모바일에서 읽히지 않고 HTS 식 정보 밀도가 접근성을 깎는다 — `text-[9.5px]`/`[10px]`/`[10.5px]`/`[11px]`/`[11.5px]`/`[12px]`/`[12.5px]` 를 토큰 3~4단(예: 10.5·11.5·13·20)으로 묶고 최소 10.5px 미만을 없앤다. 대상: `tick-msg-list.tsx:204,283,290,345`, `tick-slider.tsx:163`, `tick-order-card.tsx:248,287`, `tick-entry.tsx:64`.
2. **포커스 링 누락** — 키보드 사용자가 시각 입력과 종목 검색에서 현재 위치를 알 수 없다(`outline-none` 뒤에 `focus:border-primary` 만 있고 링 없음) — `tick-slider.tsx:272`(시각 입력)·`tick-stock-picker.tsx:93`(검색)에 `focus-visible:ring-2 ring-[var(--primary)]` 를 맞추고 슬라이더(`:159`)와 같은 패턴으로 통일한다.
3. **스페이싱 임의 값 61건 + 아이콘형 컨트롤 접근성** — 9px·5px·3px·7px 가 스케일(4/8)을 벗어나 컴포넌트마다 리듬이 달라지고 터치 타깃이 작다 — 반복되는 `py-[9px]`(`tick-book.tsx:154`, `tick-order-card.tsx:219`, `tick-amount-card.tsx:116`)를 `py-2`/`py-2.5` 로, 차트 도구줄 `1분`·`10초`·`0` 버튼(`tick-chart.tsx:472-478`)에 aria-label 을 달고 폰 터치 높이 36px 이상을 보장한다.

(추가 권고) 4. 차트 SVG 색을 라이트/다크 양쪽에서 대조비 실측 5. `tick-stock-picker.tsx:102` 하드코딩 그림자를 토큰으로 6. 폰 3판 165px + 슬라이더 + 세그먼트 조합을 실기기 UAT 에서 확인(CONTEXT 가 미결로 둔 항목 그대로 남아 있음).

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- 상태 카드(`tick-state-card.tsx`) 5종(converting · live-loading · nodata · live-unavailable · error)이 일반 문구 대신 원인·다음 행동을 담는다. 예: 「당일 자료 준비 중」, 「당일 자료를 받지 못하고 있어요」, 「당일 자료 지연 · n초 전 마지막 수신」, 「새 틱 n건 · 끝으로」.
- `Submit`/`확인`/`취소` 같은 막연한 라벨은 grep 에서 발견되지 않음. 「닫는 B6」·「거래소순 자리」·「↕ 9.0ms 먼저 수신」 처럼 도메인 용어가 CONTEXT 와 일치.
- 감점: 차트 도구줄 `1분`·`10초`·`0` 버튼(`tick-chart.tsx:472-478`)은 title 만 있고 aria-label 이 없다. B6/A3/B9/R8/C3 전문 코드가 사용자 화면 용어로 번역 없이 노출되는 곳이 있다(트레이더 대상이라 경고 수준).
- 출처 표기: 공급 배지가 머리에 있어 CLAUDE.md 의 출처 노출 원칙에 부합.

### Pillar 2: Visuals (3/4)
- 머리 → 3판 차트 → 슬라이더 카드 → HTS 3단 순서가 D-00 과 일치하고 `HTS_PANES` 배열 + 폰 세그먼트(호가 | 전문 | 버스트·팀)로 위계를 분리했다.
- 행 그룹 레일(팀 보라 · 일반 회색) · 둘째 조각 시각 흐림 · 점선 칩으로 주문 묶음이 시각화됨.
- 감점: 한 화면에 차트 3판 + 슬라이더 + 3단이 모여 초점이 분산된다. 폰 390 에서 3판 165px 는 CONTEXT 가 「실기기 UAT 재확인 미결」로 남겼고 스크린샷이 없어 검증하지 못했다. 가정 없이 3점 이상 줄 수 없다.
- 아이콘형 버튼 중 `확대`/`축소` 는 aria-label 보유, `1분`/`10초`/`0` 은 보강 필요.

### Pillar 3: Color (3/4)
- 14개 파일이 `var(--…)` 토큰을 사용(chart 54 · msg-list 58 · order-card 37). 16진 하드코딩 없음, `--vi`·`--vi-bg` 토큰을 globals.css 에 라이트/다크로 추가함.
- 감점: `tick-stock-picker.tsx:102` 에 `rgba(0,0,0,.25)` 그림자 하드코딩. 팀 보라 · `--up` · 회색 계단 · 주황 `↕` 역전 표시까지 의미색이 5종 이상 겹쳐 차트 위 구분이 색에만 의존할 위험이 있다(색각 대체 단서 미확인).
- 60/30/10 은 UI-SPEC 이 없어 엄격 판정 불가.

### Pillar 4: Typography (2/4)
- 크기: 임의 px 값이 14종. 상위: `11px` 41, `10.5px` 25, `12px` 16, `12.5px` 13, `11.5px` 13, `10px` 7, `9.5px` 4, `13px` 4, 그 외 20/18/17/16/15/13.5px 각 1~2. Tailwind 표준 스케일 클래스는 사실상 미사용 → 스케일이 아니라 값 모음이다.
- 굵기: `semibold` 64 · `bold` 43 · `medium` 14 · `normal` 2 = 4종 (기준 2종 초과). bold 와 semibold 가 비슷한 역할로 섞여 위계가 흐려진다.
- 9.5~10px 글자: `tick-msg-list.tsx:204,283,290,345`, `tick-slider.tsx:163`, `tick-order-card.tsx:248,287`, `tick-entry.tsx:64`. 모바일 가독성 문제.
- 메모리의 「레퍼런스 타이포는 실측」 원칙은 지켰으나 실측값을 토큰화하지 않아 파일별로 0.5px 단위 편차가 생겼다.

### Pillar 5: Spacing (2/4)
- 임의 `[Npx]`/`[Nrem]` 값(글자 크기 제외) 61건. 대표: `py-[9px]`(tick-book:154 · order-card:219 · amount-card:116), `py-[5px]`(tick-book:83-85), `py-[3px]`(order-card:249-252, book:164), `px-[5px]`(order-card:159, msg-list:204), `gap-[5px]`(header:197), `py-[7px]`(chart:435).
- 4/8 스케일에서 벗어난 홀수 px 가 반복되어 시각 리듬이 컴포넌트마다 다르다. 호가 표처럼 밀도를 위한 의도적 값은 인정하나 토큰화 없이 흩어져 있다.
- 칩 높이도 `h-4`·`h-[17px]`·`h-[18px]` 로 제각각(msg-list:204,345 · entry:64).

### Pillar 6: Experience Design (3/4)
- 강점: 로딩/변환 진행(`tick-indeterminate` + `motion-reduce:animate-none`), 자료 없음 사유 분기(`nodataReasonOf`), 429/502/503/409 코드 처리, 서명 URL 만료 재시도(`expireFirstGrid` e2e), 라이브 증분은 보일 때 ∧ 끝일 때만 폴링(사용자 수와 독립 — 운영 원칙 부합), 가상화 목록(`useFixedWindow`), URL 딥링크(틱 시각까지), DMA 게이트. aria 속성이 슬라이더 25·차트 16·목록 12 로 비교적 충실.
- 감점 1: `tick-slider.tsx:272`·`tick-stock-picker.tsx:93` 는 `outline-none` 이고 포커스 링이 없다.
- 감점 2: `disabled` 사용이 header 6 · msg-list 2 · picker 2 뿐이다. 점프·재생 같은 조작은 범위 밖 입력에 대한 비활성 피드백을 코드에서 확인하지 못했다.
- 감점 3: 위험 조작(변환 취소)이 확인 단계를 가지는지 코드에서 확인하지 못했다(카드 「취소」 = 즉시 정지).
- 감점 4: 터치 타깃이 작다. 시각 입력 `h-8`(32px), 칩 16~18px, 차트 도구 버튼. 폰 UAT 미결.
- 레지스트리 감사: 이 phase 는 shadcn 서드파티 블록 사용이 UI-SPEC 에 없어 생략.

---

## Files Audited
- `webapp/src/components/ticks/` 전체 14개 (tick-viewer-page · tick-viewer · tick-header · tick-entry · tick-stock-picker · tick-state-card · tick-slider · tick-book · tick-chart · tick-msg-list · tick-order-card · tick-amount-card · tick-team-panel · tick-own-section)
- `webapp/src/lib/ticks/` (grep 대상: tick-chart.ts 등 색 사용 확인)
- `webapp/src/app/analytics/ticks/page.tsx`
- `.planning/phases/37-tick-viewer/37-CONTEXT.md`, 37-08 · 10 · 11 · 13 · 14 · 19 SUMMARY (머리 부분)
- 미확인: `webapp/src/styles/globals.css` 토큰 본문, 세 보고서의 「틱 보기 ›」 알약 렌더링(37-11 SUMMARY 로만 확인)
