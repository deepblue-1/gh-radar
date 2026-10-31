# Phase 35 — UI Review

**Audited:** 2026-11-01
**Baseline:** 추상 6-pillar 기준 + 프로젝트 TDS 토큰(`globals.css`) 하우스 스타일 (UI-SPEC.md 없음, 잠긴 결정 D-01~D-35는 결함으로 세지 않음)
**Screenshots:** not captured (localhost:3100 응답 없음 — dev 서버 꺼져 있음, 코드 전용 감사)
**Interaction captures:** off (workflow.ui_interaction_capture=false) — 상호작용 판단은 전부 코드에서 도출

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | 한글 문형 일관·빈/오류 문구 있음. 다만 µs 약어·내부 용어가 어드민 전용이라 용인 수준, 일부 경고 문구가 조건 안내 위주 |
| 2. Visuals | 2/4 | SVG 지도는 `<title>` 툴팁뿐이라 키보드·터치로 값을 읽을 수 없음. 요약 정보가 색·도형 의존 |
| 3. Color | 3/4 | `--launch-*` 토큰 hex 정의 + 다크 대응. 결과 구분이 색 의존인 곳 존재 |
| 4. Typography | 2/4 | 임의 px 크기 8종(11/11.5/12/12.5/13/14/15/16) + weight 3종, 토큰 스케일 이탈 |
| 5. Spacing | 3/4 | 대체로 Tailwind 스케일, 임의값(`px-[7px]`, `w-[104px]`, `w-[1120px]` 등) 소수 |
| 6. Experience Design | 2/4 | 로딩·오류·빈 상태는 충실하나 입력 포커스 표시 제거, 터치 타겟 32px, 오류 안내가 첫 위반 1건만 |

**Overall: 15/24**

---

## Top 3 Priority Fixes

1. **[WARNING→BLOCKER 후보] 계획 입력 칸에 포커스 표시가 없다** — `launch-plan-editor.tsx` 의 `<input>` 이 `outline-none` 이고 감싸는 `<label>` 에 `focus-within:` 스타일이 없어, 키보드로 µs 칸을 옮길 때 현재 위치가 보이지 않는다. 운영 서버의 발사 시각을 바꾸는 입력이라 오입력 위험이 크다. → label 에 `focus-within:shadow-[inset_0_0_0_1.5px_var(--primary)]` 추가.
2. **지도 값이 마우스 hover `<title>` 에만 있다** — `launch-gate-chart.tsx` 의 점·경계·선 정보는 `<title>` 과 `role="tooltip"`(hover) 뿐이라 키보드·터치(폰 390)에서는 접근 불가. 날짜별 표(접힘)가 대체 수단이지만 기본 닫힘. → 점에 `tabIndex`/탭 시 고정 상세, 또는 표를 폰에서 기본 펼침 + `aria-describedby` 로 표 연결.
3. **조각 순서 오류 안내가 첫 위반 1건뿐 · 스테퍼 버튼 32px** — `badIdx` 단일값이라 여러 칸이 틀려도 하나만 표시, 저장 전 반복 수정이 필요. `STEP_BTN` `size-8` 은 폰에서 44px 미만. → 위반 칸 전체 표시(또는 "N개 칸" 요약), 스테퍼 폰에서 `size-10`.
4. (추가) 타이포를 토큰/스케일로 정리 — 8종 임의 px 를 4~5단계로 수렴(11.5→12, 12.5→13 병합).
5. (추가) 결과 알약·지도 점이 색+도형(원/빈 원/마름모)으로 구분되나, 접수/101/기타 점 3종은 색약 사용자에게 원(채운) 2종이 구별 불가 — 접수·거부 모양 또는 외곽선 패턴 차별화.
6. (추가) `w-[1120px]`/`640px` 고정폭 SVG 가로 스크롤은 결정(D-18)이라 결함 아님, 단 스크롤 힌트(그림자/문구)가 없다.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- 빈 상태 「아직 적재된 발사가 없어요 · 첫 적재는 16:00:01」(`launch-orders-tab.tsx:185`, `launch-map-tab.tsx:327`), 「이 날은 발사가 없어요」(`:188`), 편집 차단 문구 `LAUNCH_PLAN_EDIT_BLOCKED`(`launch-plan-bar.tsx:53`) 등 계약(D-27 문형) 충족.
- 저장 버튼 「저장 / 저장 중…」, 「되돌리기」 — 구체적이며 일반 "Submit/OK" 없음.
- 감점: 「지금 — 지난 N일에 쐈다면」「모름」 같은 표현은 어드민 숙련자 대상으로 허용되나 신규 운영자에게는 「모름」 이 무엇을 뜻하는지 범례/툴팁이 편집 칸 근처에 없다(`launch-plan-editor.tsx` VerdictCell). `<PageHeader description="gh-trade 서버 발사 결과 · 머리 + 조각">`(`launch-client.tsx:91`) 의 「머리 + 조각」 은 내부 용어.

### Pillar 2: Visuals (2/4)
- 초점: 탭 → 컨트롤 줄 → 요약 카드 → 4패널 순으로 위계가 명확, 패널 머리 `text-[14px] font-bold` 로 구분.
- 접근성: SVG `role="img"` + 패널 `aria-label` 은 있으나(`launch-gate-chart.tsx:179-180`) 내부 점 정보는 `<title>` 전용이고 `role="tooltip"` 은 hover 상태(`:443`). aria 속성이 chart 파일에 1곳뿐. 아이콘 단독 버튼은 스테퍼에 `aria-label` 있음(양호).
- 카드/패널 `ring-1 ring-inset dark:ring-0` 같은 하우스 스타일 따름(양호).
- 폰 390: 표·SVG 가로 스크롤은 결정이지만 스크롤 단서가 없어 잘린 열이 있다는 것을 알기 어렵다.

### Pillar 3: Color (3/4)
- `--launch-ok/bad/gate/other` + `-bg` 변형이 `globals.css:100-106`, 다크 `:270-271` 에 hex 로 정의(lightweight-charts oklch 거부 메모 반영). 컴포넌트 안 하드코딩 hex 0건(grep).
- `--primary` 는 「다음 첫 조각」 점선 등 한정 사용(D-16 부합).
- 감점: 접수(초록)/거부(빨강) 채운 원이 모양 차이가 없고 색만 다르다(`launch-gate-chart.tsx`), 색각 이상 사용자에게 핵심 정보(경계) 구분이 불가. `LINE_TONE.warn` 이 `--led-latent`(타 영역 토큰)를 가져다 쓴다(`launch-plan-editor.tsx`) — launch 축과 분리된 의미 혼용.

### Pillar 4: Typography (2/4)
- 사용 크기: `text-[11px] 1 · [12px] 8 · [13px] 4 · [14px] 5 · [15px] 2 · [16px] 1` + 소수점 크기 `11.5px`(TH·알약·번호 다수) · `12.5px`(라벨·표·오류 다수) + SVG fontSize 10/11. 합계 8종 이상. 스케일(text-xs/sm/base) 대신 임의 px.
- weight: `font-semibold 27 · font-bold 10 · font-medium 2` — 3종, semibold/bold 구분 근거 약함(알약·번호는 bold, 라벨은 semibold).
- 레퍼런스 타이포는 실측 기준(메모)을 따랐다고 보이나 소수점 크기는 중복 단계. 표 헤더 11.5px 는 가독 하한 근접.

### Pillar 5: Spacing (3/4)
- gap-3/gap-2/px-4/py-3.5 등 Tailwind 스케일 중심, 카드 `rounded-[16px]` 하우스 일치.
- 임의값: `px-[7px]`(알약 2곳), `px-[11px]`, `p-[3px]`(세그먼트), `h-[26px]`, `w-[52px]`(라벨), `w-[104px]`(입력 칸), `w-[3px]`, `w-[1120px]`. 알약 `px-[7px]` 는 `px-2` 로 흡수 가능. 입력 칸 `w-[104px]` 고정 때문에 4자리 음수+µs 에서 여유가 좁다(폰 390 줄바꿈은 flex-wrap 으로 처리됨).

### Pillar 6: Experience Design (2/4)
- 양호: 로딩 스켈레톤(`CardsSkeleton`, `MapSkeleton`, plan-bar `aria-busy`), 오류 `role="alert"`(`launch-orders-tab.tsx:169`, `launch-map-tab.tsx:308`), 빈 상태 2종, 서버 미연결 시 편집 비활성 + title, 저장 결과 `role=status/alert` 분기, `aria-pressed` 세그먼트, `aria-expanded` 토글, 순서 오류 시 저장 비활성, 변경 없음 시 저장 비활성, 되돌리기.
- BLOCKER 후보: 계획 입력 포커스 링 제거(Top 1).
- 확인창 없음은 D-27 결정(Phase 36 결)이라 결함 아님이나, 운영 서버 발사 시각을 변경하는 동작이므로 `canSave` 가 입력 범위(D-34) 위반을 막는 것이 유일한 안전망 — 단위/에러 문구가 첫 위반 1건만(`badIdx` 단일).
- 스테퍼 `size-8`(32px), 입력 칸 높이 `h-9`(36px) — 폰에서 44px 터치 권장 미달.
- `launch-client.tsx` 에 aria 속성 0건 — 탭은 shadcn Tabs 기본 동작에 의존(양호하나 `?tab=` 딥링크 전환 시 포커스 관리 없음).
- Registry audit: 해당 없음(shadcn 3rd-party 레지스트리 미사용).

---

## Files Audited
- `/Users/alex/repos/gh-radar/webapp/src/app/admin/launch/page.tsx`
- `/Users/alex/repos/gh-radar/webapp/src/components/admin/launch-client.tsx`
- `/Users/alex/repos/gh-radar/webapp/src/components/admin/launch-orders-tab.tsx`
- `/Users/alex/repos/gh-radar/webapp/src/components/admin/launch-map-tab.tsx`
- `/Users/alex/repos/gh-radar/webapp/src/components/admin/launch-gate-chart.tsx`
- `/Users/alex/repos/gh-radar/webapp/src/components/admin/launch-plan-bar.tsx`
- `/Users/alex/repos/gh-radar/webapp/src/components/admin/launch-plan-editor.tsx`
- `/Users/alex/repos/gh-radar/webapp/src/styles/globals.css` (launch 토큰)
- `/Users/alex/repos/gh-radar/.planning/phases/35-launch-gate/35-CONTEXT.md`
