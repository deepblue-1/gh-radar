# Phase 34 — UI Review

**Audited:** 2026-10-21
**Baseline:** 34-UI-SPEC.md (approved 2026-10-20)
**Screenshots:** not captured (3100 · 3000 · 5173 에 dev server 없음 — 코드 전용 감사. 시각 필러는 소스 · 토큰 기준으로만 채점)
**Interaction captures:** off (workflow.ui_interaction_capture is false). 상호작용 findings 는 전부 코드에서 읽은 것이다.

전제: 10/19 · 10/20 라이브 UAT 「전부 이상 없음」, 「폰 툴팁 없음 충분함」은 결정 사항으로 두고 감점하지 않았다. 계약 이탈과 실제 결함만 적었다.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | 계약 문구 전부 일치. 20:30 은 `ACCUM_LOAD_HM` 한 상수에서만 나온다 |
| 2. Visuals | 3/4 | 차트 기하 · 레이어 · 접근 이름 일치. 로딩 스켈레톤이 실제 배치와 다르고 폰에서 수치 툴팁이 없다 |
| 3. Color | 3/4 | 토큰 전용(하드코딩 0) · 라이트/다크 둘 다 정의. 흐린 행 · `--faint` 글자 대비가 낮다 |
| 4. Typography | 4/4 | 크기 11 · 12 · 14 · 20(+ 22 는 PageHeader) · 굵기 400/600 뿐 |
| 5. Spacing | 4/4 | 임의 px 값은 계약이 선언한 예외(1120 · 472)뿐 |
| 6. Experience Design | 3/4 | 로딩 · 오류 · 빈 · 게이트 · 행 없음 전부 있음. 터치 대상 · KPI null 처리 · 스켈레톤 구성에 결함 |

**Overall: 21/24**

---

## Top 3 Priority Fixes

1. **[WARNING] 페이지 오류 「다시 시도」 버튼의 터치 대상이 없다** — 폰에서 18px 높이 텍스트만 눌러야 해서 재시도가 어렵다. 같은 phase 의 상세 오류 버튼은 `min-h-8` 인데 페이지 쪽만 빠졌다 — `accum-report.tsx:141-146` 의 버튼에 `min-h-8` 추가(계약 A4 의 상세 버튼과 동일 치수).
2. **[WARNING] 흐린 행(`opacity-60`)이 종료 사유 줄까지 같이 흐려져 대비가 AA 밖이다** — 사유 줄(`--muted-fg` #6b7684)이 흰 카드 위에서 .6 이면 실효 대비가 약 2.3:1 이다. 계약은 「흐림은 사유 줄과 함께만 나온다」로 정보를 사유 줄에 맡기는데, 그 줄이 가장 읽기 어렵다 — `accum-day-grid.tsx:180-182` 에서 행 전체 `opacity-60` 대신 종목명 · 금액 칸에만 흐림을 주고 배지 묶음 + 사유 줄은 정상 농도로 둔다(D-11 「≈ .6」 취지 유지). 못 바꾸면 최소한 사유 줄에 `--fg-2` 를 준다.
3. **[WARNING] 로딩 스켈레톤이 실제 상세 배치와 다르다** — 계약 A4 는 「실제 배치 높이 스켈레톤(KPI 줄 → 범례 → 프리셋 → 차트 472)」이다. 구현은 막대 4개(`h-4 w-2/3` · `h-3 w-1/2` · `h-8 w-56` · 472)라 범례가 한 줄 · 프리셋이 두 칸 폭이고, 실제 범례(8항목, 폰에서 2~3줄 wrap)와 높이가 달라 데이터 도착 때 아래 내용(사이클 표 · 손익 줄)이 밀린다 — `accum-detail.tsx:104-112` 를 KPI 줄(h-4) → 범례(폰 2줄 높이) → 프리셋 3칸(`h-8 w-16` × 3) → 472 로 맞춘다.

추가 소견(우선순위 낮음)은 각 필러에 적었다.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)
- 빈 상태 2종(`accum-report.tsx:150-166`), 오류 「보고서를 불러오지 못했어요」/「다시 시도」, 상세 「상세를 불러오지 못했어요」 · 「이 종목 상세를 찾지 못했어요」 + 보조 문구, 게이트 `surface="매집감지 보고서"` — 전부 A1 · A4 와 글자 단위로 일치.
- 머리 출처 칩 「KYOBO119 판정 기준 · 20:30 적재」(`accum-report.tsx:122-127`)와 상세 칩(`accum-detail.tsx:192`)이 같은 `ACCUM_LOAD_HM` 을 쓴다. D-24 ① 의 한 상수 변경 계약이 지켜진다.
- 범례 8항목 순서 · 프리셋 3 · 캡션(`팀 체결 없음 · ` 접두 분기 포함) · 차트 접근 이름 2종 · 손익 소제목/항목/캡션이 A5 · A6 · A8 과 일치.
- 일반 라벨(Submit · OK 등) grep 결과 0.
- 결함 없음. 감점 사유 없음.

### Pillar 2: Visuals (3/4)
- 차트 상수 `R 56 · TOP 16 · H1 200 · GAP 24 · H2 112 · H3 72 · BOT 24 · H 472`(`lib/accum-chart.ts:29`)가 계약 표와 같다. 레이어 순서(음영/빈 띠 → 격자 → 0선·계단 → 막대 → 가격 → 세로선 → 원 → 글자)와 불투명도(원 .55/.9, first .9, 막대 .7)도 계약대로다.
- 아이콘은 `ChevronDown` 하나이고 `aria-hidden`. 아이콘 단독 버튼은 없다. 행 버튼 접근 이름 · `aria-describedby` sr 설명 · `aria-expanded` · 열렸을 때만 `aria-controls` 전부 있다.
- 초점: 행 목록(종목명 14/600 → 배지 → 결과 태그 → 금액)이 위계를 만든다. xl 에서는 열 머리 2줄 구조도 계약대로.
- [WARNING] 스켈레톤 불일치(Top 3 #3).
- [참고] 차트 SVG 의 `fill="var(--accum-shade)"` 는 속성 안 `var()` 라 구형 WebKit 에서 무시될 수 있다. 라이브 UAT 에서 이상 없었으므로 결함으로 세지 않지만, 문제가 생기면 `style={{fill}}` 로 바꾼다.
- 폰에서 `<title>` 툴팁 없음은 결정 사항이라 감점하지 않았다.

### Pillar 3: Color (3/4)
- 소스에서 hex · rgb 하드코딩 0건. `--accum-shade` · `--accum-gap` 이 `globals.css:96-97`(라이트) · `257-258`(다크) 양쪽에 있다.
- Accent 소비는 `--accent-fg` 「다시 시도」 2곳(`accum-report.tsx:143`, `accum-detail.tsx:121`)뿐이고 계약과 같다. `bg-primary` 는 빈 상태 `Button` 기본 변형 1곳. `--team` 은 배지 · 등록선 · 누적 · 사이클 띠에만 쓰인다. destructive 사용 0.
- 금액 부호 색 + 부호 글자 병기, 상태는 배지 글자, 선 모양 구분 — 「색만으로 말하지 않는다」 지켜졌다.
- [WARNING] 흐린 행 대비(Top 3 #2).
- [WARNING] `--faint` 라이트 값 #b0b8c1 이 흰 카드 위에서 약 2:1 이다. 로딩 문구 · 「팀 체결 없음」 · 「그날 체결 자료 없음」 · 「—」 에 쓰인다. 계약이 정한 토큰이라 구현 이탈은 아니지만, 「그날 체결 자료 없음」 은 상세에서 유일한 상태 안내인데도 이 색이다. 계약 개정을 검토할 사항이다.
- [참고] 프리셋 hover 에 쓰는 `--raised-2` 는 계약 색 표에 없다(토큰 자체는 있고 팀 화면 관례와 같다). 계약 표에 한 줄 추가하면 된다.

### Pillar 4: Typography (4/4)
- 새 코드의 크기는 `text-[11px]` 2곳(배지 · 결과 태그) + `--t-caption`(12) + `--t-sm`(14) + KPI 값 `text-[20px]` 1곳(상속 역할)이다. Tailwind 표준 크기 클래스(`text-sm` 등) 사용 0.
- 굵기는 `font-semibold` 19곳, `font-normal` 1곳(표 머리)뿐이다. 400/600 만 쓰고 계약 상한(400/600/700 — 700 은 PageHeader)을 넘지 않는다.
- SVG `fontSize={11}` 이 viewBox 1:1 이라 폰에서도 11px 고정. 수 · 금액 · 시각은 `mono`, SVG 는 `tabular-nums`.
- 결함 없음.

### Pillar 5: Spacing (4/4)
- 비표준 값(`gap-0.5` 1 · `gap-y-0.5` 2 · `gap-y-1.5` 2 · `px-1.5` 1 · `py-0.5` 2)은 전부 계약 「Exceptions」에 선언된 자리다(행 안 세로 6 · 메타 줄 2 · 배지 좌우 6 · 출처 칩 위아래 2).
- 임의 px 는 `max-w-[1120px]`(컨테이너)와 `h-[472px]`(스켈레톤 = 차트 고정 높이)뿐이다.
- 행 `min-h-11` · `px-2 py-3` · `gap-x-3` · `scroll-mt-[calc(4.5rem+var(--app-safe-top))]`, 상세 `gap-4 px-2 pt-1 pb-6`, 차트 블록 `gap-2`, 열 템플릿(`COLS_XL`)이 계약 문자열과 그대로 같다.
- 결함 없음. (스켈레톤이 차트 높이만 맞고 위쪽 블록 높이가 틀린 건 Visuals 에 적었다.)

### Pillar 6: Experience Design (3/4)
- 상태 커버: 페이지 로딩(`role="status"`) · 오류(`role="alert"` + 재시도) · 빈 2종 · 게이트 · 상세 로딩/실패/행 없음/게이트 · 가격 자료 없음 · 팀 체결 없음 전부 있다. 파괴적 동작 없음. 프리셋 `last2h` 는 마지막 체결이 없으면 `disabled`. 키보드 차트 영역(←/→/+/−/0) · `aria-pressed` · reduced-motion 처리(`motion-reduce:transition-none`, 스크롤 `auto`)가 있다.
- 언마운트 뒤 응답 무시(`alive` 플래그) · 캐시 첫 렌더 사용 · 실패 비캐시 — 지연 로드 계약(D-06)대로다.
- [WARNING] 페이지 오류 「다시 시도」 터치 대상 없음(Top 3 #1).
- [WARNING] KPI 4번째 칸이 `fmtEok(kpis.posSum ?? 0, …)`(`accum-kpi-strip.tsx`) 라 모든 행의 `pos_net_krw` 가 null 인 날(소급 결측)에는 「+0.0억」으로 보인다. 계약은 「null 제외」 합이지만 값이 전부 없을 때 0 으로 말하는 것은 틀린 정보다 — `posSum === null` 이면 「—」(`--faint`)를 보여준다.
- [WARNING] 로딩 스켈레톤 불일치(Top 3 #3). 데이터 도착 때 아래 요소가 밀리는 layout shift 가 생긴다.
- [참고] 상세 「다시 시도」 후 포커스가 사라진 버튼(언마운트)에서 갈 곳이 없다. 행 버튼으로 돌려주면 키보드 사용자에게 낫다. 우선순위 낮음.
- [참고] 페이지가 `phase.kind === 'loading'` 일 때 목록이 통째로 사라졌다 다시 나타난다(날짜 전환 시). teamflow 상속이라 계약 이탈은 아니다.

---

## Registry Safety
`components.json` 있음. UI-SPEC 은 이 phase 가 shadcn 컴포넌트를 새로 설치하지 않는다고 선언했고 third-party registry 행이 없다. Registry audit: 0 third-party blocks checked, no flags.

---

## Files Audited
- `webapp/src/app/analytics/accum/page.tsx`
- `webapp/src/components/analytics/accum-report.tsx`
- `webapp/src/components/analytics/accum-kpi-strip.tsx`
- `webapp/src/components/analytics/accum-day-grid.tsx`
- `webapp/src/components/analytics/accum-detail.tsx`
- `webapp/src/components/analytics/accum-chart.tsx`
- `webapp/src/components/analytics/accum-cycle-table.tsx`
- `webapp/src/lib/accum-chart.ts` (상수 · 기하 요약만), `webapp/src/lib/accum-report.ts` (KPI 집계)
- `webapp/src/styles/globals.css` (토큰 위치 확인)
- `webapp/src/components/layout/app-sidebar.tsx` (NAV_ACCUM 항목 확인)
- `.planning/phases/34-accum/34-UI-SPEC.md` (1-322행 정독. 이후 Discretion · 체크 절은 이 감사에서 읽지 않음)
