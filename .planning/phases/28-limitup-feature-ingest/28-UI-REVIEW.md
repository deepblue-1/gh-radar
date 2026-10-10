# Phase 28 — UI 리뷰

**감사일:** 2026-10-10
**기준:** 28-UI-SPEC.md (승인본 2026-10-05) + 이후 사용자 승인 변경(quick-261005-vk1 · quick-261006-ide · 스케치 012-A · D-04 창 면 accent)
**스크린샷:** 캡처 안 함 — localhost:3100 에 dev 서버 없음(curl 000). 코드 전용 감사. 시각 항목은 UAT #6(2026-10-10 사용자 통과)에 의존하며 이 감사가 독립 확인하지 않았다.
**상호작용 캡처:** off (workflow.ui_interaction_capture 꺼짐) — 상호작용 판단은 전부 코드 파생.

---

## 필러 점수

| 필러 | 점수 | 핵심 발견 |
|------|------|-----------|
| 1. Copywriting | 3/4 | 계약 문구 거의 글자 그대로. 단 KPI·섹션 제목·부제가 승인된 변경으로 계약과 다름 |
| 2. Visuals | 3/4 | 위계·aria 양호. 폰/태블릿(<xl) 행에 펼침 어포던스(chevron) 없음 |
| 3. Color | 3/4 | 하드코딩 hex 0, 토큰만 사용. 레인 창 면에 accent(승인된 D-04 예외) |
| 4. Typography | 2/4 | 10px 글자 3곳(계약 하한 11px 미만) + 16px 화살표 + `font-bold` — 선언 척도 이탈 |
| 5. Spacing | 3/4 | 4의 배수 대체로 준수, arbitrary 값 소수, 6px/2px 잔재 |
| 6. Experience Design | 3/4 | 로딩/에러/빈/게이트/stale 전부 있음. 격자 파일 에러·키보드 어포던스 일부 미확인 |

**합계: 17/24**

---

## 우선 수정 Top 3

1. **<xl 행에 펼침 표시 없음 (WARNING)** — `limitup-day-grid.tsx` 의 `ChevronDown` 이 `hidden … xl:block` 이라 폰·태블릿에서 행이 아코디언인지 알 수 없다(첫 행만 기본 펼침). 사용자는 나머지 행이 눌리는 줄 모른다. 수정: <xl 에서도 chevron 을 보이게(1줄 결과 태그 옆 또는 우측 끝) 하거나 `aria-expanded` 와 동기화된 시각 표식을 둔다.
2. **10px 글자 + 16px 화살표 (WARNING)** — `limitup-lane.tsx:106`(NumberDisc) · `:237`(point-n) 이 `text-[10px]`, `limitup-date-nav.tsx:23` 이 `text-[16px]`. 계약은 최소 11px · 선언 척도 20/14/12/11. 폰에서 레인 번호 원숫자 판독성 저하. 수정: 10px → 11px(14px 디스크는 16px 로 키움) 또는 계약에 예외 행 추가, 16px 화살표는 `--t-sm` 14px 로 통일하거나 lucide `ChevronLeft/Right` 로 교체.
3. **계약 문서와 실제 구현 괴리 미기록 (WARNING)** — KPI 5칸 → 4칸(상한가 도달·종가까지 유지·깨짐·어제 D+1), 섹션 「하루 격자」 → 「상한가 종목」, 사건 카드 항상 노출 → 행 아코디언, 레인 창 면 `--accent`, 9칸 행 머리 「지금」 → 잠김 경과(「0:43」) 가 UI-SPEC 에 반영되지 않았다. 코드 주석은 근거를 적었지만 정본(UI-SPEC)이 갈라져 다음 감사·e2e 가 거짓 실패를 낸다. 수정: UI-SPEC 에 「사후 변경」 절 1개를 추가해 위 항목과 출처 quick ID 를 적는다(코드 수정 아님).

추가 소소한 권고(Top 3 밖): 날짜 화살표 버튼에 `focus-visible` 링 클래스가 없다(전역 스타일 의존 여부 확인 필요) · 레인 `line 313` 의 `var(--accent)` 면과 캡션 `--accent-fg` 가 라이트/다크 대비 검증 근거 없음 · 지문표/어제 결과 `max-w-[160px]/[200px]` arbitrary 값 · `font-bold` 3곳이 600 대신 700.

---

## 상세 발견

### Pillar 1: Copywriting (3/4)
- 글자 단위 일치 확인: 「보고서를 불러오지 못했어요」+「다시 시도」(`limitup-report.tsx:146-152`), 「아직 올라온 보고서가 없어요」/「첫 보고서는 평일 밤 21:20쯤 올라와요」(`:158`), 「이 날 보고서가 아직 없어요」+「최신 보고서 보기」(`:163-167`), 「이 날은 상한가 사건이 없어요」(`limitup-day-grid.tsx:161`), 「곡선 없음」, 「잠김 구간이 없어요」, 「사실 문장이 없어요」, 「집계할 창구가 없어요」, 「어제 보고서가 없어요」, 날짜 화살표 「이전 보고서」/「다음 보고서」, PageHeader 설명 문구, 문서 제목 「상한가 보고서 · MM/DD」.
- 의도적 변경(결함 아님): KPI 4칸과 라벨(「상한가 도달」·「깨짐」), 섹션 제목 「상한가 종목」/부제 「첫 상한가 시각 순 · 잔량 곡선 09:00~15:30」(quick-261005-vk1 D-02/D-03).
- 결함: 탐지 0 빈 상태 본문이 계약(「탐지 종목이 0개인 날이에요…」)과 다른 「상한가에 닿은 종목이 없는 날이에요. ‹ 로 이전 보고서를 볼 수 있어요」 — 변경 근거 기록 없음(`limitup-day-grid.tsx:162-164`). 사소.
- 일반 CTA("Submit/OK") 패턴 없음. 모든 CTA 가 구체 동사.
- 카드 탭 「상한가」 · 탭 제목 접미 · 체크 칩 「상한가 특징」 문구 일치(`card-tabs.tsx:280`, `order-log-filters.tsx:76`).

### Pillar 2: Visuals (3/4)
- 시각 앵커 명확: KPI 20px mono 값이 페이지 유일(`limitup-kpi-strip.tsx`). 사건 카드 SVG 는 `role="img"` + 오버레이 `aria-hidden`(`limitup-lane.tsx:252,292,345`).
- 결함(WARNING): 행 chevron 이 `xl:block` 전용 → <xl 에서 펼침 단서 0. 행은 `aria-expanded` 가 있어 스크린리더는 알지만 시각 사용자는 모른다.
- 아이콘 전용 버튼: 날짜 화살표는 `aria-label` 있음. 글리프 `‹ ›`(spec 허용).
- 하루 격자 행 `min-h-11`(44px 터치) 준수, hover/open 면 구분 존재.
- 스크린샷 미캡처 → 실제 겹침/잘림은 UAT #6(사용자 통과)에만 근거.

### Pillar 3: Color (3/4)
- 하드코딩 `#hex`/`rgb(`/`oklch` 0건(analytics 전 파일 + limit-feature-table). 모든 색이 `var(--…)`. `--led-armed` 사용 0.
- 곡선 `--fg`, 기준선 `--led-latent`, 깨짐 `--up`, ▼ `--down`, 지문표/태그 계약과 일치. 체크 칩 켜짐 = `--primary/--accent/--accent-fg` 계약 그대로.
- 계약 이탈(승인된 D-04): 레인 직전 1분 창 면 `fill="var(--accent)"`(`limitup-lane.tsx:313`) + 캡션 `--accent-fg`(`:367`). 계약 「Accent 전용 자리」 5곳 밖이다 — 사용자 결정으로 승인되었으므로 결함 아님, 정본 미갱신만 지적.
- 60/30/10: 보고서 면 `--card` 중심, accent 는 창 면·에러 「다시 시도」·체크 칩에 한정 — 10% 이내.
- 대비: `--up` 작은 글자 3.6:1 은 계약이 명시한 상속 예외.

### Pillar 4: Typography (2/4)
- 실사용 분포(analytics tsx): `text-[11px]` 13 · `text-[12px]` 1 · `text-[20px]` 1 · `text-[16px]` 1 · `text-[10px]` 2 + `--t-sm`(14)/`--t-caption`(12) 변수 다수. 굵기 `font-semibold` 23 · `font-bold` 3.
- 결함: 10px 3곳(`limitup-lane.tsx:106,237`, 숫자 디스크·포인트 번호) — 계약 최소 11px 미만. 16px(`limitup-date-nav.tsx:23`) 은 선언 척도(20·14·12·11)에 없다. `font-bold`(700) 는 PageHeader 상속 외 선언 굵기(400/600) 이탈.
- 척도 크기가 7종(22·20·16·14·12·11·10) — 계약이 허용한 상속 예외(22/700)를 넘는다.
- 양호: mono/tabular 적용, 9칸 값 12/400, 행 머리 11/600, SVG 안 `<text>` 없음(HTML 오버레이) 계약 준수.

### Pillar 5: Spacing (3/4)
- 계약 4배수 대체로 준수: `py-12`(48px 빈/에러 박스), `p-4`, `gap-4`(섹션), `size-8`(32px 화살표), `min-h-11`(44px), 막대 `h-2`(8px).
- arbitrary: `max-w-[1120px]`(계약 값), `rounded-[4px]`, `max-w-[160px]`/`[200px]`(표 셀 — 계약 외 임의값), `ml-[2px]`, `px-0.5`(2px).
- 비-4배수: `gap-y-1.5`(6px), `gap-y-0.5`(2px), `gap-x-3`(12px, EX-6 계열이나 격자 열 간격은 계약 8px) — 경미.
- KPI 간격 `gap-2`(8px)·타일 `p-3`(12px EX-6) 일치.

### Pillar 6: Experience Design (3/4)
- 상태 커버리지 양호: 로딩(「불러오는 중…」 페이지·레인), 에러(`role="alert"` + 재시도 `setAttempt`), 빈(3종), DMA 게이트(401/403 → `DmaGate`), 형식 오류 `router.replace` 정본화, 날짜 끝 `disabled`, 카드 키 전환/`isStale`(`opacity .55` + `data-stale`).
- 카드 탭: 자동 전환 없음(주석상 `alertTabFor` 비반환), 1초 갱신 `memo` 칸, `title` 중복 방지 — 구현 의도 확인.
- 아코디언: 행 `aria-expanded` · `aria-controls`(열렸을 때만) · reduced-motion 분기 있음. 결함은 <xl 시각 어포던스 부재(Pillar 2 와 동일 원인).
- 미확인(코드만으로 판단 불가): 격자 파일 실패 시 「다시 시도」 레인 동작, 폰 360px 마커 라벨 겹침 — UAT #6 사용자 통과에만 의존.
- 파괴 동작 없음, 레지스트리 감사 해당 없음(서드파티 레지스트리 없음).

---

## 계약 이후 의도된 이탈 (결함 아님으로 처리)
| 항목 | 현 구현 | 근거 |
|---|---|---|
| KPI | 4칸(도달·유지·깨짐·D+1), 폰 2열/md 4열 | quick-261005-vk1 D-02 |
| 하루 격자 | 「상한가 종목」 아코디언 + 행 아래 사건 카드, chevron xl 전용 | quick-261005-vk1 D-03 · 스케치 011 |
| 카드 「상한가」 탭 | 행 머리 「지금」 → 잠김 경과 머리(`0:43`) | quick-261006-ide |
| 레인 | 직전 1분 창 면 `--accent` · 요약 칩 줄 | D-04 · 스케치 012-A |
| 사이드바 | 하위 「상한가 보고서」·「AI 애널리스트」, 활성은 하위 항목 | quick-261005-vk1 D-01 · 2026-10-06 사용자 요청 |

---

## 감사한 파일
- webapp/src/components/trading/card/limit-feature-table.tsx
- webapp/src/components/trading/card/card-tabs.tsx (grep)
- webapp/src/components/trading/order-log/order-log-filters.tsx (grep)
- webapp/src/components/layout/app-sidebar.tsx (grep)
- webapp/src/components/analytics/limitup-report.tsx · limitup-day-grid.tsx · limitup-date-nav.tsx · limitup-kpi-strip.tsx
- webapp/src/components/analytics/limitup-lane.tsx · limitup-sparkline.tsx · limitup-event-card.tsx · limitup-fingerprint-table.tsx · limitup-yesterday-table.tsx (grep)
- .planning/phases/28-limitup-feature-ingest/28-UI-SPEC.md · 28-UAT.md
