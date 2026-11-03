# Phase 38 — UI Review

**Audited:** 2026-11-03
**Baseline:** UI-SPEC.md 없음 — 추상 6필라 기준 + 38-CONTEXT.md(D-01~D-16) + 채택 목업 B(`reference/mockup-own-fills.html`) · 스케치 026 A
**Screenshots:** not captured — `:3100` 에 떠 있는 서버 없음, 틱뷰어는 로그인·DMA 게이트 뒤라 코드 전용 감사로 진행
**Interaction captures:** off (workflow.ui_interaction_capture=false). 인터랙션 판단은 전부 코드에서 읽은 것이다.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | 라벨은 `strategy-event-labels` 낱말 재사용으로 일관됨. 단 `?` 단독 표기, 「—」 대체어, 조회 실패 무고지 |
| 2. Visuals | 3/4 | 민트 레일 → ◆ 위계 명확. 칩 9.5px · 아이콘만 있는 마디의 접근성 미흡 |
| 3. Color | 3/4 | `--mine` 토큰화 · 대비 수치 문서화 우수. 12% color-mix 선택 배경은 다크에서 미검증 |
| 4. Typography | 2/4 | 임의 px 크기 12종(9.5~17px) · 굵기 3종 혼용 — 스케일 없음 |
| 5. Spacing | 3/4 | 22/24px 행 높이·레일 14px 계약 유지. 22px 칩·`h-4` 칩은 터치 타깃 미달 |
| 6. Experience Design | 2/4 | 표 행·탭이 키보드로 못 닿음, 우리 층 실패가 무고지, 탭 ARIA 불완전 |

**Overall: 16/24**

---

## Top 3 Priority Fixes

1. **「우리 주문」 표 행·탭의 키보드/ARIA 접근 부재 (WARNING, 필라 6)** — `tick-own-section.tsx:~389` 의 `<tr onClick>` 에 `tabIndex` · `onKeyDown` · `focus-visible` 가 없어 키보드 사용자는 주문 → 체결 이동을 못 한다(파일 전체에서 `tabIndex|onKeyDown|focus-visible` 0건). `tick-viewer.tsx:~148` 의 `role="tab"` 은 `aria-controls`/`tabpanel`/화살표 이동이 없다. 수정: 첫 칸을 `<button>` 으로 만들거나 `tr` 에 `tabIndex=0` + Enter/Space 처리, 탭에 `aria-controls` + `role="tabpanel"` + ←/→ 로빙 추가, 공통 `focus-visible:outline` 한 벌.
2. **우리 층 조회 실패가 조용히 사라짐 (WARNING, 필라 6·1)** — `tick-viewer.tsx:44` 주석대로 실패하면 `own===null` 이고 `shown` 이 강제로 `'this'` 가 되어 「우리 주문」 탭·알약·민트 칩이 말없이 없어진다. 「체결이 없다」와 「못 불러왔다」를 구분할 수 없다(트레이더 오판 위험). 수정: 머리의 `failing` 줄 선례처럼 「우리 주문을 불러오지 못했어요 · 다시 시도」 한 줄 + 재시도 버튼, 탭은 비활성으로 남기기.
3. **타이포 스케일 부재 (WARNING, 필라 4)** — `text-[9.5/10/10.5/11/11.5/12/12.5/13/15/17px]` 가 4개 파일에 산재(11px 24곳, 10.5px 13곳, 11.5px 7곳). 0.5px 단위 차이는 위계가 아니라 잡음이다. 수정: 3~4단계(10 / 11 / 12 / 13)로 수렴하고 토큰화(`--fs-chip` 등). 칩류 9.5px(`tick-msg-list.tsx:204,345`)는 최소 10px 로 올리기.

그 외 권고(우선순위 4~6)는 아래 상세 참조: `?` 단독 표기 설명, 선택 배경 다크 대비 확인, 칩/알약 터치 타깃.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- 좋은 점: 구분·지표·근거 라벨을 `strategy-event-labels.ts` 낱말 그대로 사용(D-05), 수동 주문 「없음 · 수동 주문 — 주문 시각 위치만」(D-13), 「전문 아직 안 옴」(pending) vs 「짝 전문 없음」(unmatched) 구분(`tick-own-section.tsx:239`), 거르기 칩 「체결 있음/없음」. 일반 라벨(Submit/OK) 없음.
- WARNING: 체결 열의 `?` 한 글자(`tick-own-section.tsx:~407`, 추정 표시)는 범례 없이 뜻을 알 수 없다. 캡션이나 `title` 로 「추정 포함」을 알려야 한다.
- WARNING: 근거 없음을 「—」 로만 표기(`~418`) — 「근거 없음」 문구와 불일치(카드는 풀문장). 표 안에서도 `title` 로 사유를 주는 편이 낫다.
- WARNING: 우리 층 조회 실패 문구 자체가 없다(필라 6과 연동).
- 수용(기지 항목): 추정 각주 「{d}ms 안 후보 k개」 의 k 가 전체 매칭 창 기준 — 사용자 UAT 에서 수용됨.

### Pillar 2: Visuals (3/4)
- 좋은 점: 목업 B 둘째 레일(○ 근거 · ● 주문 · ◆ 체결 · 점선 추정)이 구현되어 있고, 머리 알약 「◆ 우리 k/n · 주문 m ‹ ›」(`tick-header.tsx:197`), 되돌아가기 알약, 선택 행 민트 12%로 초점이 분명하다. 아이콘 버튼 `‹ ›` 는 `aria-label` + `title` 보유(`tick-header.tsx:202-213`).
- WARNING: 행 안 칩 높이 `h-4`(16px) · 글자 9.5px(`tick-msg-list.tsx:204,345`) — 1440px 에서도 작고 폰 390 에서는 가독성 한계.
- WARNING: 레일 마디(○ ◌ ● ◆)는 색·모양으로만 구분 — 색각 약한 사용자는 ○/◆ 의 모양에 의존해야 하며, 마디 자체의 텍스트 대체(`aria-label`) 확인되지 않음(레일 요소에 aria 속성 없음).
- 수용(기지 항목): 차트 가격 판 밖 우리 점 미표시 · 차트 ◆ 클릭 시 선택된 우리 줄이 풀리지 않음.

### Pillar 3: Color (3/4)
- 좋은 점: `--mine` / `--mine-bg` / `--mine-fg` 가 `globals.css:85-89`(라이트) · `269-272`(다크)에 정의, 대비 수치(3.38:1 비텍스트, 5.03:1/4.52:1 글자)가 주석에 있고, 팀 보라·VI 주황·매수/매도 색과 의미를 섞지 않는다(D-06). `tick-chart.tsx` 6곳·`tick-msg-list.tsx` 13곳·`tick-own-section.tsx` 12곳이 모두 토큰 경유 — 컴포넌트·차트 TS 에 하드코딩 hex/rgba 0건.
- WARNING: `--mine` 라이트 `#0f9d8a` 는 흰 바탕 3.38:1 로 비텍스트 기준(3:1)만 겨우 통과 — 얇은 점선(추정 띠 · 0.5~1px)에는 시인성이 낮다. 선 두께 보강 또는 `--mine-fg` 사용 검토.
- WARNING: 선택 행 `color-mix(in oklab, var(--mine) 12%, transparent)`(`tick-own-section.tsx:~395`)는 다크 `--mine-bg` 와 별도 값이라 다크에서 대비가 검증되지 않았다. 또한 민트 사용처가 알약/칩/레일/차트/행배경/탭밑줄로 분산되어 「포인트 색 10%」 감각이 다소 넓다(허용 범위).

### Pillar 4: Typography (2/4)
- 분포(4개 파일 기준): `text-[9.5px]` 3 · `[10px]` 5 · `[10.5px]` 13 · `[11px]` 24 · `[11.5px]` 7 · `[12px]` 2 · `[12.5px]` 2 · `[13px]` 1 · `[15px]` 1 · `[17px]` 1 = **임의 px 크기 10종**, Tailwind 스케일 클래스 사용 0. 굵기 `font-semibold` 36 · `font-bold` 18 · `font-medium` 8 = **3종**.
- 근거: 목업 사본 값을 그대로 옮긴 결과로 보이나(목업 자체가 밀도 우선), 0.5px 간격(10/10.5/11/11.5/12/12.5)은 위계를 만들지 못하고 유지보수 부담만 키운다. `semibold` 와 `bold` 구분도 의미 규칙이 없다(칩은 bold, 알약은 semibold, 탭은 bold).
- 프로젝트 CLAUDE.md 규약(레퍼런스 타이포는 실측·과장 금지)과 충돌하지는 않으나, 스케일 정의가 부재한 것이 점수 하락 요인.

### Pillar 5: Spacing (3/4)
- 좋은 점: 행 높이 22/24px 계약(D-04) 유지, 표 행 `h-6`, 레일 14px 칸, 4밴드 컨테이너 쿼리 규약 준수(뷰포트 브레이크포인트 오용 없음). 사이드 격자 `repeat(auto-fit,minmax(300px,1fr))` + `max-[640px]:grid-cols-1`.
- WARNING: 터치 타깃 — 거르기 칩 `h-[22px]`(`tick-own-section.tsx:~461`) · 되돌아가기 알약 `h-6` · 머리 알약 `py-1` · 탭 `h-8`. 폰에서 22~24px 는 44px 권고에 미달(밀도 우선 결정이므로 WARNING). 칩 사이 `gap-1`(4px) 이라 오터치 가능.
- 임의값(`h-[17px]`, `gap-[5px]`, `px-[5px]`)이 목업 이식으로 다수 — 4px 배수 아님.

### Pillar 6: Experience Design (2/4)
- 좋은 점: 상태 파생 설계(선택은 커서가 그 rec 일 때만, 수명 정직), 끝이면 ‹ › 비활성, 당일 pending 대기 표시, 키 `[` `]`, 되돌아가기 한 단계, 탭 상태 유지 · 칩 `aria-pressed`, 머리 오류 `role="alert"`/`role="status"`. [ ] 탐색이 근거·주문 줄까지 확장(UAT 반영).
- BLOCKER 아님이나 중대 — **키보드 접근 부재**: `tick-own-section.tsx` 표 행 · `tick-order-card.tsx:~266` 최근 주문 표 행이 클릭 전용 `tr`(`tabIndex|onKeyDown|focus-visible` 0건). `aria-selected` 를 일반 표 `tr` 에 붙였으나 `role="row"` in grid 가 아니라 무효.
- **탭 ARIA 불완전**: `role="tab"` 만 있고 `aria-controls` · `tabpanel` · 화살표 키 이동 없음(`tick-viewer.tsx:~148`).
- **조용한 실패**: 조회 실패 시 `own===null` 로 모든 우리 층이 사라지고 탭이 `'this'` 로 강제 — 오류 안내·재시도 없음. 사용자가 「우리 주문 탭」을 보던 중이면 이유 없이 화면이 바뀐다.
- 로딩 상태: 우리 층 로딩 표시(스켈레톤/스피너) 코드에서 확인되지 않음 — 세션 로드 후 늦게 알약·칩이 나타나 레이아웃이 점프할 수 있다.
- 파괴적 동작 없음(읽기 전용) — 확인 대화상자 해당 없음.
- Registry 감사: `components.json` 3rd-party 레지스트리 없음(UI-SPEC 없음) — 생략.

---

## Files Audited
- `webapp/src/components/ticks/{tick-msg-list,tick-own-section,tick-order-card,tick-viewer,tick-header,tick-chart}.tsx`
- `webapp/src/lib/ticks/{tick-chart,tick-chart-tip}.ts` (hex/rgba 그렙)
- `webapp/src/styles/globals.css` (`--mine*` 토큰)
- `.planning/phases/38-own-orders-on-ticks/38-CONTEXT.md`, `38-10-SUMMARY.md`
- 한계: 스크린샷 미촬영, 목업 B·스케치 026 HTML 과의 픽셀 비교는 하지 못했다. `own-model.ts`/`msg-rows.ts`/`use-own-nav.ts` 는 UI 표면이 없어 정독하지 않고 그렙만 했다.
