# Phase 42 — UI Review

**Audited:** 2026-11-13
**Baseline:** 42-UI-SPEC.md (approved 2026-11-12)
**Screenshots:** 캡처하지 않음 — 다른 세션이 같은 Mac 에서 작업 중이라 dev server · Playwright 를 띄우지 않았고, 실행 중인 서버도 없었다. 시각 판정은 전부 코드(클래스 · SVG 속성 · 주석) 근거다.
**Interaction captures:** off (`workflow.ui_interaction_capture` false) — 상호작용 판정은 코드에서 도출했다. 운영 UAT 1 ~ 12(폰 · PC)는 42-11-SUMMARY 가 통과로 기록했고, 코드 근거 없이 뒤집지 않았다.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | 계약 문구는 코드에 그대로 있다. 다만 「취소」 가 일반 낱말이고, 긴 오류 · 캡션 줄의 폰 줄바꿈은 눈으로 못 봤다 |
| 2. Visuals | 3/4 | 초점(가격 판 봉) · 겹침 순서 · aria 는 계약대로. 화면 실물 확인 0, 데스크톱 스위치 20px 는 작다 |
| 3. Color | 3/4 | 토큰 6개 · 하드코드 0. 수익률 구간 칩이 `--primary` 를 써서 accent 예약 목록을 벗어난다. `--ma-1` 은 `--muted` 위 3.19 로 아슬아슬 |
| 4. Typography | 3/4 | 새 요소는 11 · 12 · 14 · 16 / 400 · 600 안. 상속 부품에 10.5 · 11.5 · 12.5 와 700 이 남아 화면 전체로는 크기 7종 · 굵기 3종 |
| 5. Spacing | 3/4 | 새 간격은 4 배수 + 선언된 예외뿐. `pl-[60px]` · `gap-[3px]` · `py-[3px]` 는 임의값이다 |
| 6. Experience Design | 3/4 | 빈 · 오류 · 상한 · 기억 실패 상태 처리가 촘촘하다. 일 이동평균 loading 계약은 미해결 상태로 가정 구현, 전환 중 차트가 숨는다 |

**Overall: 18/24**

---

## Top 3 Priority Fixes

1. **수익률 구간 칩이 accent 예약 목록 밖에서 `--primary` 를 씀** — `candle-chart.tsx:841-861`(`fill`/`stroke` 4곳 `var(--primary)`, `fontSize={10.5}`). 계약 Color 는 accent 를 「확인 버튼 · 포커스 링」 둘로 한정하고 「이 밖에는 쓰지 않는다」 고 했다. 선 차트(`tick-chart.tsx:986-1006`)를 그대로 옮긴 상속이지만 이 phase 가 새로 그린 파일에서 계약 위반이 됐다. 파랑은 하락 방향색으로 읽힌다는 Phase 20 D-02 와도 긴장한다. 수정: 계약에 「Shift+끌기 구간 칩 = 선 차트 상속」 예외를 적거나, 중립 선택 색(`--seg-on-*`)으로 바꾼다. 둘 중 어느 쪽이든 계약과 코드를 맞춘다.
2. **일 이동평균 loading 계약 미해결(UI-SPEC E6 loading ⚠ unresolved)** — 42-10 이 「받는 동안 선 없음 · 캡션 없음 · 띠 값 —」 로 가정 구현했다. 사용자가 계약으로 승인한 적이 없어서, 일 칩을 켠 채 종목을 바꾸면 선이 늦게 나타나는 순간 말고는 받는 중이라는 표시가 없다. 수정: 가정을 UI-SPEC 에 확정 문구로 올리거나(권장, 문서만) 칩 켜기 칸에 받는 중 표시를 더한다.
3. **상속 부품 때문에 타이포 스케일이 계약보다 넓다** — `candle-chart-title.tsx:73` 「타임라인」 12.5/700(`font-bold`), `candle-chart-band.tsx:65` 띠 11.5, `candle-chart.tsx:863` 10.5. 계약은 「상속 — 선언하지 않음」 으로 허용했지만, 봉 차트 전용 파일에 값을 다시 적어 두었다(선 차트에서 가져온 것이 아니라 복제). 선 차트 값이 바뀌면 전환할 때 화면이 튄다. 수정: 두 차트가 공유하는 상수 하나로 모은다(동작 변경 없음).

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

- 계약 문구가 코드에 일치한다: 「팀 체결 없음」(`candle-return-layer.tsx:116` · `candle-lower-layers.tsx:217,220` · `candle-chart-band.tsx:131,198`), 오류 줄 `role="alert"`(`candle-ma-form.tsx:241`), 칩 `aria-label` 「{이름} 지우기」(`candle-ma-chips.tsx:120`), 「＋」 `aria-label` 「이동평균 더하기」 + 상한 `title`(`:138-140`), 봉 단위 `aria-label` 「봉 단위 — {label}」(`candle-unit-menu.tsx:78`), SVG 접근 이름(`candle-chart.tsx:660`).
- WARNING: 더하기 창 「취소」(`candle-ma-form.tsx:277`) 는 일반 낱말이다. 체커가 틱뷰어 기존 낱말과 같다며 수용한 FLAG 라서 감점 1 요소로만 둔다.
- WARNING: 「일 이동평균 — 일별 종가를 불러오지 못했어요(화면을 다시 열면 다시 불러와요)」 의 폰 360 줄바꿈은 backstop 항목이며 시각 확인을 못 했다(캡션 줄 `flex-wrap` 코드는 맞다 — `candle-chart-caption.tsx`).
- 「SMA · EMA · 캔들 · 오버레이」 용어 금지는 컴포넌트 문자열에서 위반이 보이지 않았다(주석 제외 확인은 부분).

### Pillar 2: Visuals (3/4)

- 초점: 가격 판 봉이 가장 큰 판(160/110)이고 방향색 채움이다. 제목 줄 조작은 `--muted` 면 11px 로 봉과 겨루지 않게 했다(`chart-kind-switch.tsx:34,47-51`).
- 접근성: 스위치 `role="group"` + `aria-pressed`, 봉 단위 `aria-haspopup="dialog"` · `aria-expanded` · `radiogroup`/`radio` `aria-checked`, 칩 `role="group"`, 아이콘 `aria-hidden`. 아이콘 전용 버튼 중 이름 없는 것을 찾지 못했다.
- 폰 제목 줄: 첫 줄 `flex flex-wrap`, 둘째 줄 칩 가로 밀기 + 16px 흐림 mask(`candle-ma-chips.tsx:37,176-177`)가 계약 B 와 같다. 차트 `touchAction: 'pan-y'`(`candle-chart.tsx:668`)도 유지.
- WARNING: 데스크톱 스위치 칸 `h-5`(20px) 와 칩 `h-6`(24px)은 WCAG 2.2 목표 크기 24px 에 못 미치거나 겨우 닿는다. 계약이 「마우스 전용 밀도」 로 선언했으므로 계약 위반은 아니지만, 터치 노트북 · 태블릿(768 ~ 1024 데스크톱 판정 구간)에서 눌림 정확도가 떨어진다.
- WARNING: 화면 실물 · 다크 테마 겹침(가장자리 글자 `--card` 테 · 봉 + 이동평균 + 평단 선 혼잡)은 눈으로 확인하지 못했다.

### Pillar 3: Color (3/4)

- 하드코드 색: 컴포넌트 안 hex · rgb · oklch 0건. 유일한 `#000` 은 칩 줄 흐림 mask(`candle-ma-chips.tsx:37`)로 색이 아니라 알파 마스크다.
- 토큰: `--ma-1` ~ `--ma-6` 가 `globals.css` 라이트(109-114) · 다크(302-307) 둘 다 계약 값과 일치.
- 선택 표시는 `--seg-on-*`(스위치 · 나눔 칸), 오류는 `--destructive`(`candle-ma-form.tsx:241` 한 곳) — 계약대로 파랑 선택을 피했다.
- `--primary` 사용 6곳: 확인 버튼 2(`candle-ma-form.tsx:266,283`)는 계약 내. 나머지 4(`candle-chart.tsx:841,851,856,861`)는 구간 합계 칩으로 계약 밖(Top 3 #1).
- WARNING: `--ma-1` 라이트 대비 3.52 / `--muted` 위 3.19 로 3:1 하한에 근접하고, 선은 1.25px · 칩 색 줄은 8×2px 다. 계약 수치는 맞지만 밝은 초록 가는 선은 흐린 화면 · 야외 폰에서 약하다. 첫 번째 기본 선(단순 5)이 이 색이라 영향이 가장 크다.
- 60/30/10: 본문 · 카드 · 면 분포는 계약 표 그대로 사용했고, accent 는 위 예외 하나를 빼고 예약 목록 안이다.

### Pillar 4: Typography (3/4)

- 봉 차트 파일 전체 분포: `text-[11px]` 13 · `[12px]` 16 · `[14px]` 6 · `[16px]` 2 · `[11.5px]` 1 · `[12.5px]` 1 / `font-semibold` 15 · `font-normal` 5 · `font-bold` 1 / SVG `fontSize` 11 · 10.5, `fontWeight` 400 · 600.
- 새 요소(스위치 · 단위 버튼 · 칩 · 양식)는 11 · 12 · 14 · 16 과 400 · 600 안에 들어간다(`candle-ma-form.tsx:148,198,225,266,336,362` 확인).
- 계약 밖 값 3개는 전부 선 차트 상속(타임라인 12.5/700, 띠 11.5, 구간 칩 10.5)이다. 계약이 허용한 상속이므로 감점은 1 로 제한한다.
- WARNING: 상속인데 이 파일들이 값을 직접 적는다(Top 3 #3). 한 쪽만 바뀌면 전환 시 시각이 튄다.

### Pillar 5: Spacing (3/4)

- 임의값 목록: `gap-[3px]` 1 · `pl-[60px]` 1(`candle-ma-form.tsx:199`, 시트 들여쓰기 — 계약 값 60) · `py-[3px]` 1 · `py-[5px]` 1(값 띠 폰 · 데스크톱 — 계약 예외) · `py-[7px]` 1(제목 줄 — 계약 예외). 전부 계약이 이름 붙인 예외이며 새 임의값은 없다.
- 치수: 값 띠 `h-[88px]`/`h-[137px]` + `grid-rows-[84px_52px]`(`candle-chart-band.tsx:66`), 봉 단위 목록 184/200, 시트 `max-h-[85dvh] px-4 pt-2.5 pb-6`(`candle-ma-form.tsx:358`)이 계약 표와 일치한다.
- WARNING: 단위가 계약상 4 배수 예외가 아닌 `gap-[3px]` 의 출처는 값 띠 라벨 줄로 보이며 계약 예외 목록(3 · 5px 값 띠 칸 위아래)에 「gap 3」 은 없다. 낮은 심각도이지만 계약과 코드가 정확히 일치하지는 않는다.

### Pillar 6: Experience Design (3/4)

- 상태 처리: 칩 0개(「이동평균」 머리 글자 · 폰 「＋ 이동평균」), 6개 상한(`aria-disabled` + `title`), 기간 검증(`aria-invalid` · `aria-describedby` · `role="alert"`), 일 기준 시 「지수」 꺼짐, 기억값 읽기 실패 기본 복귀(S10), 일별 종가 실패 캡션, 팀 체결 없음 빈 판이 전부 코드에 있다.
- 포커스 관리: 팝오버 첫 초점 = 기간 칸 · 시트는 컨테이너 `preventScroll`(`candle-ma-form.tsx:329-351`), 닫힐 때 「＋」 로 복귀(`:353-356`). Enter 가로채기는 폼이 처리(`:192`), 봉 단위 목록은 ↑↓ 직접 구현(`candle-unit-menu.tsx:48-53`), Esc 는 Popover 기본에 의존.
- 파괴 동작: 칩 × 는 계약대로 확인 없이 지운다. 되돌리기도 없다 — 6개 구성을 가진 사용자가 실수로 지우면 색 번호까지 잃는다(계약이 수용한 트레이드오프).
- WARNING: 전환 중 보기 창을 적용하는 동안 `visibility: pending ? 'hidden'`(`candle-chart.tsx:671`) 이어서 차트 SVG 가 숨는다. 깜빡임 방지 의도지만 `useViewSync` 가 길어지면 빈 카드가 보인다(운영 UAT 는 통과).
- WARNING: 일 이동평균 loading 표시 부재(Top 3 #2).
- WARNING: 상호작용 실물(포커스 링 · hover · 터치 · 시트 애니메이션 · reduced-motion)은 캡처하지 못했다. 이 pillar 는 코드 + 기존 UAT 기록으로만 3 이다.

---

## Registry Safety

`components.json` 존재 · UI-SPEC 의 서드파티 레지스트리 0 — Registry audit: 서드파티 블록 0개 점검, 플래그 없음. (새 shadcn 설치 없음.)

## Files Audited

- `webapp/src/components/ticks/` — `candle-chart.tsx` · `candle-chart-title.tsx` · `candle-chart-band.tsx` · `candle-chart-caption.tsx` · `candle-ma-chips.tsx` · `candle-ma-form.tsx` · `candle-unit-menu.tsx` · `chart-kind-switch.tsx` · `candle-price-layer.tsx`(grep) · `candle-return-layer.tsx`(grep) · `candle-lower-layers.tsx`(grep) · `tick-chart.tsx`(`--primary` 비교만)
- `webapp/src/styles/globals.css`(`--ma-*` 토큰)
- `.planning/phases/42-tick-chart-candle-overlay/` — 42-UI-SPEC.md · 42-10 · 42-11 SUMMARY(발췌)
- 읽지 못한 것: 42-01 ~ 42-09 SUMMARY · PLAN · CONTEXT 전문, `lib/ticks/candle-*.ts` 계산 로직(시각이 아니라 기하라 이 감사 범위에서 제외 — 기존 테스트가 담당)
