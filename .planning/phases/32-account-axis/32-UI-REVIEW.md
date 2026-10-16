# Phase 32 — UI Review

**Audited:** 2026-10-16
**Baseline:** 32-UI-SPEC.md (approved, 2026-10-16 수정 절 우선)
**Screenshots:** not captured (localhost:3100 응답 없음 — 코드 전용 감사. 시각 항목은 코드 근거이며 실측이 아님)
**Interaction captures:** off (workflow.ui_interaction_capture is false)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | 계약 문구 대부분 일치. 「이 계좌 끄기」 버튼/다이얼로그 문구 동일 사용, 도움말 부재 |
| 2. Visuals | 3/4 | 칩 계좌 선택은 계약대로. 작업대가 select 가 아닌 칩으로 바뀐 것이 UI-SPEC 본문(S1)과 어긋남 |
| 3. Color | 3/4 | 토큰만 사용, 하드코딩 hex 0. 「이 계좌 끄기」 면 처리가 계약 문구와 모호하게 갈림 |
| 4. Typography | 3/4 | 11/12/12.5/14 + 400/600 준수. 칩 서버키 10/700 은 상속 예외로 허용 |
| 5. Spacing | 2/4 | 비-4배수 값(2.5 · 1.5 · 9px · 5px) 다수 잔존, 일부는 이번 phase 신규 코드 |
| 6. Experience Design | 3/4 | 잠금/빈 상태/대기 잠금 구현. 칩 radio 화살표가 선택 안 함(IN-02), 칩 잠금이 button disabled 아님 |

**Overall: 17/24**

---

## Top 3 Priority Fixes

1. **UI-SPEC 본문과 구현 불일치 정리 (작업대 상단 줄 select → 칩)** — 32-15 에서 사용자 지시로 `MeAccountChips` 를 작업대에도 쓰는데 UI-SPEC S1/Component Inventory(`AccountPill` 네이티브 `<select>`)는 갱신되지 않았다. 계약을 믿는 다음 phase 가 오판한다 — UI-SPEC 에 「2026-10-16 작업대도 칩(32-15)」 수정 절 추가 후 S1/S10/인벤토리 행 무효 표시.
2. **계좌 칩 radiogroup 키보드 (IN-02)** — `account-chips.tsx` 의 ←/→ 는 포커스만 옮기고 Enter/Space 를 눌러야 선택된다. 계약은 이를 `ChoiceRow` 와 같은 문법으로 명시했으나 WAI-ARIA radio 는 화살표=선택이므로 스크린리더 사용자가 「선택됨」 변화 없이 헤맨다 — 화살표 시 `pick()` 호출(+ 잠금 시 무시) 또는 `role="radio"` 를 버튼 토글 그룹(`aria-pressed`)으로 변경.
3. **신규 코드의 비-4배수 간격 정리** — `alert-toasts.tsx:148` `gap-2.5 px-3 py-2.5`, `strategy-status-card.tsx:283` `gap-1.5 py-2.5`, `:305` `px-2.5 py-2`, `account-chips.tsx:169` `px-1.5` — 계약 Spacing 표는 4 배수만 선언. 8/12/4 단계로 맞추거나 Exceptions 에 명시(서버키 칩 `px-1.5` 는 계약 예외로 이미 허용).

추가 권고: (4) 선택 칩의 번호 `opacity-80` 은 `--seg-on-fg` 위 대비를 실측 확인(다크 모드 포함). (5) 잠긴 칩 줄이 `aria-disabled` 만 두고 개별 button 은 활성이라 Tab 포커스가 계속 들어온다 — 의도(포커스 유지)지만 `title` 이 radiogroup 에만 있어 개별 칩 hover 시 이유가 안 보일 수 있음. (6) 「이 계좌 끄기」 카드 버튼은 `--up-bg` 틴트 + destructive 글자이고 다이얼로그 실행 버튼은 테두리형이라 두 표면 형태가 다르다(계약 Color 표가 「면」 / 「테두리형」 으로 각각 적어 허용 범위지만 코드 주석 「채움 금지(S-6)」 와 카드 버튼 틴트 면의 일관성은 문서화 필요).

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- 일치: 「My page 계좌」 radiogroup 이름, 잠금 title 「저장 중에는 계좌를 바꿀 수 없어요」(`me-client.tsx:439`), 「이 계좌에 등록된 전략 없음」(`strategy-status-card.tsx:564`), 다이얼로그 제목 「이 계좌의 전략을 비활성화할까요?」, 오류 「이 계좌 끄기 요청의 반영을 확인하지 못했어요. 전략 목록을 확인해 주세요.」(`:115`), 「이 계좌 보기 ›」(`alert-toasts.tsx:187`), 「이 브라우저(기기)에만 저장돼요. 계좌와 무관해요.」(`device-settings-card.tsx:30`).
- 개선: 「이 계좌 끄기」 가 카드 버튼 · 다이얼로그 실행 버튼 · aria-label 에 같은 글자를 쓰는 건 일관적이지만, 다이얼로그 실행 버튼은 「이 계좌 끄기」 로 동작 이름이 다이얼로그 제목(비활성화할까요?)과 어휘가 다르다(끄기/비활성화 혼용). 한 어휘로 통일 권장.
- 레거시 문구 「켜진 상따 전략이 없어요」(`:565`) 는 `accountNo === undefined` 경로에만 남음 — 계약상 도달 불가 코드면 정리 대상.

### Pillar 2: Visuals (3/4)
- 시선 앵커 계약(선택 칩만 `--seg-on-bg`)은 `account-chips.tsx:142` 로 충족. 높이 32/rounded-full/가로 스크롤/스크롤바 숨김/`whitespace-nowrap` 구현됨.
- 아이콘 전용 버튼 없음, 새 아이콘 없음(계약 준수).
- 결함: 작업대가 select 가 아닌 칩인데 spec 미갱신(위 Fix 1). `compact` 3상태(true/false/null)와 `@max-[680px]/wb:hidden` CSS 폴백은 첫 페인트 깜빡임 위험을 줄이지만, 화면별 칩 글자가 달라(작업대 폰: 상품명만 / /me: 상품명+번호+서버키) 같은 계좌의 시각 정체성이 두 곳에서 다르다.
- 실측 없음: 폰 334px 에서 계좌 4개 최악값 한 줄 스크롤, 페이지 가로 스크롤 0 은 코드상 `overflow-x-auto flex-none` 로 가능해 보이나 미검증.

### Pillar 3: Color (3/4)
- 감사 대상 파일에서 하드코딩 hex/rgb 0건. 토스트 그림자 `oklch(0 0 0/0.14)` 1건은 기존 코드.
- Accent(`--primary`) 신규 소비처는 계약대로 2곳(주문 알약 「다시 연결」 `workbench-status-bar.tsx:237`, 토스트 「이 계좌 보기」 `alert-toasts.tsx:185`).
- 상태 적색은 `--destructive`(끊김 `:217`), `--up` 사용 없음 — 계약 준수.
- 경고: 「이 계좌 끄기」 카드 버튼이 `--up-bg` 틴트 면(`strategy-status-card.tsx:634`) — `--up-bg` 는 가격 방향(상승) 토큰으로, 계약 「상태 적색에 `--up` 계열 금지」 취지와 충돌 소지. `--destructive` 기반 `color-mix` 로 바꾸는 것이 안전(다이얼로그 버튼이 이미 `color-mix(--destructive)` 사용).

### Pillar 4: Typography (3/4)
- 칩: 상품명 12.5/600, 번호 11/400 mono, 서버키 10/700 — 계약과 일치. 토스트 계좌 줄 11/400 leading-4 일치. 「이 계좌 끄기」 12/600 일치.
- `strategy-status-card.tsx` 에 `text-[12px]` 임의값과 `text-[length:var(--t-caption)]` 혼용(`:207` vs `:283`) — 동일 12px 을 두 방식으로 표기, 토큰 일원화 권장.
- 크기 집합 10/11/12/12.5/14/15 — 계약 선언 4개 + 상속(10·15) 범위.

### Pillar 5: Spacing (2/4)
- 허용 외 값(신규/수정 코드 중): `alert-toasts.tsx:148` `gap-2.5 px-3 py-2.5`, `:169` `px-[5px]`; `strategy-status-card.tsx:283` `gap-1.5 px-3 py-2.5`, `:305` `px-2.5 py-2`; `workbench-status-bar.tsx:154` `py-2.5`, `:262` `px-[9px]`, `:308` `-my-0.5`; `device-settings-card.tsx:74` `pt-0.5 pb-2`.
- 칩 간격은 계약대로 `gap-2`(8) · 칩 안 `gap-1`(4) · `px-3`(12) · `h-8`(32) 준수 — 이 부분은 양호.
- 서버키 칩 `h-[18px] px-1.5 rounded-[5px]` 는 계약 Exceptions 에 명시된 값.
- 점수 근거: 계약이 「4배수 필수」 를 선언했는데 비-4배수가 5개 이상 파일에 남음. 일부는 Phase 31 상속이지만 이번에 만진 파일에서 정리되지 않았다.

### Pillar 6: Experience Design (3/4)
- 있음: 계좌 0 → 칩 줄 `return null`(높이 0), 저장 비행 잠금(`locked` → `aria-disabled` + `opacity-[.45]` + `title`), 끄기 대기 계좌별 잠금, 빈 상태 점선 상자, 로딩 스켈레톤 `motion-reduce:animate-none`, 파괴적 동작 확인 다이얼로그(기본 포커스 「닫기」), 오류 줄 `role="alert"`.
- UAT 4건 통과(32-UAT.md), 코드 리뷰 WR-01~06 fixed.
- 열린 info: IN-02(화살표=포커스만), IN-04(세션 분리 뒤 「이 계좌 끄기」 가 눌리지만 relay 거부), IN-05(VI 스트립 필터 게이트 불일치). IN-04 는 사용자가 누르면 오류로 끝나는 흐름이라 UX 결함으로 분류(WARNING).
- 잠금 중에도 칩 `button` 은 활성이며 `pick` 이 조용히 무시한다 — 클릭해도 피드백이 없다(`title` 은 그룹에만). 개별 칩에 `aria-disabled` 를 내리거나 클릭 시 안내가 필요하다(WARNING).
- 키보드 포커스 링은 칩 개별 클래스 없이 전역 `*:focus-visible` 에 의존(`globals.css:501`) — 스크롤 컨테이너(`overflow-x-auto`)에서 링이 잘릴 수 있어 실측 필요.

---

## Registry Safety
shadcn 초기화됨, UI-SPEC 은 신규 서드파티 레지스트리를 만들지 않는다고 명시 — Registry audit: 0 third-party blocks, 검사 대상 없음.

## Files Audited
- webapp/src/components/me/account-chips.tsx
- webapp/src/components/me/device-settings-card.tsx
- webapp/src/lib/account-label.ts
- webapp/src/components/trading/strategy-status-card.tsx
- webapp/src/components/trading/me-client.tsx (grep)
- webapp/src/components/trading/workbench/workbench-status-bar.tsx (grep)
- webapp/src/components/trading/workbench/alert-toasts.tsx (grep)
- .planning/phases/32-account-axis/32-UI-SPEC.md (1~328줄만 읽음 — 나머지 S5~S12 상세/접근성 표는 미열람)
- 32-UAT.md, 32-REVIEW-DISPOSITION.md
(14개 SUMMARY/PLAN 은 일괄 열람하지 않음 — 감사는 UI-SPEC 대 코드 중심)
