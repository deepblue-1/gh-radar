---
phase: 20-toss-order-ticket
plan: 08
subsystem: ui
tags: [react, tailwind, container-query, playwright, e2e, a11y, axe, status-bar, gap-closure, d-24]
status: complete

requires:
  - phase: 20-07
    provides: "e2e 관례(annotation 실측 · sizeCardTo 루프) · overflow.ts 두 판정(leavesOverflowing · scrollOverflowing) · orderbook.spec 중첩 describe 규약(9 가 마지막)"
provides:
  - "호가 탭 상단 상태줄 D-24 안 C — ≥700 「● DMA 상태 · 계좌 select · KRX|NXT · LED 점 3 · 구간 배지 ··· (다시 연결) 시각」 · <700 「● 시각 · 계좌 이름 ⌄ · KRX|NXT · LED 점 3」"
  - "고지 줄 `orderbook-notices` — 연결 이상(<700) → 서버 거부(role=alert) → 구간 배지(<700) → 전환 중 → 빈 NXT → 배너 → 미반영"
  - "overflow.ts 세 번째 판정 `selectsClipped` — 보이는 select 가 본래 폭보다 좁아졌는가"
  - "e2e P20-6 ①②③ — 최악값 3 시나리오 × 본문 344·374·700·830·992·뷰포트 1440 줄 수 · 잘림 0 · axe"
  - "UI-SPEC §10 상단 상태줄 계약 · A7 → D-24 대체"
affects: [20-verify-work, 20-validate-phase]

actuals:
  tokens: 14400
  tasks: 3
  commits: 5
plan_head_before: 3336e7c1b973efa87a7bc6cf25dcc0fba16c238b

tech-stack:
  added: []
  patterns:
    - "폭 분기는 조각마다 자기 `@min-[700px]/lc:` 클래스 — `display: contents` 래퍼 없이 폰 모양이 기본, ≥700 을 덧씌운다"
    - "폰 계좌 칩 = 보이는 이름표(aria-hidden) + 같은 select 하나를 투명 오버레이로 덮기 — 전환 경로 하나 · OS 목록 유지 · 16px(iOS 확대 방지) · 들여쓰기 -9999px 로 투명 글자가 칩 밖으로 넘치지 않게"
    - "상태줄 줄 수 판정은 목업 `measureFrame` 이식(잎 항목 세로 겹침 묶기 + Range top 수) — 목업과 앱이 같은 식으로 잰다"
    - "relay 상태 주입은 `page.routeWebSocket` 통과 프록시 + 양방향 핸들러 · 주입 뒤 `t:state` 프레임만 버림"

key-files:
  created:
    - .planning/phases/20-toss-order-ticket/20-08-SUMMARY.md
  modified:
    - webapp/src/components/stock/stock-orderbook-section.tsx
    - webapp/src/components/stock/__tests__/stock-orderbook-section.test.tsx
    - webapp/src/components/stock/__tests__/orderbook.test.tsx
    - webapp/e2e/specs/orderbook.spec.ts
    - webapp/e2e/overflow.ts
    - .planning/phases/20-toss-order-ticket/20-UI-SPEC.md
    - .planning/phases/20-toss-order-ticket/20-VALIDATION.md
    - .planning/phases/20-toss-order-ticket/deferred-items.md

key-decisions:
  - "폰 계좌 칩은 이름이 계좌를 유일하게 가리킬 때만 이름만 — 이름이 비었거나 목록에 같은 이름이 둘 이상이면 「번호 · 이름」(또는 번호)을 보인다(오발주 가드 · T-20-18)"
  - "투명 오버레이 select 는 `-indent-[9999px]`(옵션 0) — 기존 scrollOverflowing 판정을 바꾸지 않고 투명 글자의 거짓 넘침(125px)을 구조적으로 없앤다"
  - "고지 줄 「다시 연결」은 `--card` 면 — 라이트에서 outline 의 --muted 채움이 페이지 면(--surface)과 같은 색이라 글자처럼 보였다(목업 `.rbtn` 과 같은 면)"
  - "계좌 전체 표기 `accountLabel` 을 옵션 · title · 칩이 함께 쓴다 — 이름이 빈 계좌는 「{번호} · 」 대신 번호만"

patterns-established:
  - "select 잘림은 복제 본래 폭 비교(selectsClipped)로 잰다 — 네이티브 select 는 좁아져도 scrollWidth·좌표가 조용하다"

requirements-completed: []

coverage:
  - id: D1
    description: "본문 ≥700 상태줄 — 거부 문장 → 고지 줄 role=alert 한 번 · LED 점 3개(sr-only) · 「계좌」「반영」 sr-only/title"
    verification:
      - kind: unit
        ref: "webapp/src/components/stock/__tests__/stock-orderbook-section.test.tsx#③ · ③-e · ③-e2"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/orderbook.spec.ts#P20-6 ① 거부 · 예약구간"
        status: pass
    human_judgment: false
  - id: D2
    description: "본문 <700 압축 — 연결 점+시각 · 계좌 이름 칩(select 하나) · 구간 배지/연결 이상(+다시 연결) → 고지 줄"
    verification:
      - kind: unit
        ref: "webapp/src/components/stock/__tests__/stock-orderbook-section.test.tsx#③-f · ③-g · ③-h · ③-i"
        status: pass
      - kind: unit
        ref: "webapp/src/components/stock/__tests__/orderbook.test.tsx#⑬ · ⑭ · ⑭-b"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/orderbook.spec.ts#P20-6 ② 미반영 · 장전 · P20-6 ③ 끊김 · 시간외종가"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-24 실측 계약 — ①② 전 폭 1줄 · ③ 700 만 2줄 · 전 폭 잘림 0(스크롤 · 잎 · select 본래 폭 · 고지 줄) · axe 344/992 critical/serious 0"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/orderbook.spec.ts#P20-6 ①②③ (annotation P20-6)"
        status: pass
    human_judgment: false
  - id: D4
    description: "UI-SPEC §10 계약 · A7 → D-24 대체 · VALIDATION 20-08 행"
    verification:
      - kind: other
        ref: "grep D-24(13) · ### 10. 상단 상태줄(1) · | A7 |.*D-24(1) · 20-08-T(3)"
        status: pass
    human_judgment: false
  - id: D5
    description: "목업 안 C 와 톤(색·간격·정렬) 대조 — 다크/라이트 · 폰 360/390 · 태블릿 768 · 데스크톱 1280"
    verification:
      - kind: automated_ui
        ref: "scratchpad shots-0808 — 3 시나리오 × 2 테마 × 8 폭 = 48장(비커밋 · 실행자 검토)"
        status: pass
    human_judgment: true
    rationale: "톤 대조는 스크린샷 자동 비교로 판정할 수 없다(20-VALIDATION Manual-Only) — 사용자 UAT"

duration: 23min
completed: 2026-09-25
---

# Phase 20 Plan 08: 상단 상태줄 1줄 압축 (D-24 안 C) Summary

**호가 탭 `OrderbookStatusBar` 를 D-24 안 C 로 바꿨다. 거부 문장·구간 배지·연결 이상은 고지 줄로 옮기고, LED 는 점 3개, 계좌는 폰에서 이름 칩으로 줄였다. 실브라우저 최악값 3 시나리오가 폰 344/374 전부 1줄이다. 유일한 2줄은 본문 700 끊김이고, 전 폭 잘림 0 이다.**

## Performance

- **Duration:** 약 23분 (2026-09-25T08:18:25Z → 08:41:15Z)
- **Tasks:** 3 / 3
- **Files modified:** 8 (webapp 5 = files_modified 안 · .planning 3)

## Accomplishments

- **≥700 (Task 1 · 트레이서):**
  - 거부 문장은 상태줄을 떠나 고지 줄 첫 줄의 `role=alert` 가 됐다. 마크업은 `CardNotices` 와 같고, 출처 배지는 `serverMsgBadge` 텍스트 접두다.
  - LED 는 `LatchLed variant="dot"` × 3 이다.
  - 보이는 「계좌」「반영」 글자를 없앴다. 계좌 select 는 title 「번호 · 이름」을 달고, 반영 시각은 sr-only 「반영 」 + title 「서버 반영 시각」이다.
- **<700 (Task 2):**
  - 연결 표시는 점 + 반영 시각(`orderbook-conn-compact`)이다. 글자 「DMA {상태} · 반영 」은 sr-only 이고 title 이 같은 뜻을 말한다.
  - 계좌는 이름 칩(`orderbook-account-name` + 쉐브런 10px)이다. **select 요소는 하나**이고, 폰에서는 칩을 덮는 투명 오버레이로 선다.
  - 구간 배지와 연결 이상 줄(「DMA {상태}」 + 「다시 연결」)은 고지 줄로 내려갔다.
  - 간격은 폰 8 · ≥700 12 이다.
- **고지 줄 순서(목업 C):** 연결 이상 → 거부 → 구간 → 전환 중 → 빈 NXT → 배너 → 미반영. ≥700 에서 보일 항목이 없으면 컨테이너째 `@min-[700px]/lc:hidden` 이다.
- **overflow.ts `selectsClipped`:** 세 번째 판정이다(목업 `naturalSelectWidth` 이식). 기존 두 함수 본문은 한 글자도 바꾸지 않았다. 음성 대조 결과 좁힌 select 는 deficit 91 로 잡고, 본래 폭은 0, 투명 오버레이는 제외했다.
- **e2e P20-6 ①②③:** 로그인 응답을 계좌 2건(「1234567801 · 개인연금저축」 자동 선택)으로 바꾸고, `afterEach` 에서 `respondLogin()` 으로 되돌린다.
  - ① 거부 · 예약구간: `pushServerMessage`.
  - ② 미반영 · 장전: 스위치 경로(아래).
  - ③ 끊김 · 시간외종가: `routeWebSocket` 통과 프록시로 `manual_required` 주입.
  - axe 는 344 · 992 에서 돈다.
- **UI-SPEC:** §10(폭별 항목 · 수치 · 고지 줄 순서 · 실측 계약) · 접근성/문구 행 · A7 취소선 → D-24 · 검증 훅 · 출처. **VALIDATION:** 20-08-T1~T3 행과 수동 대조 행.

## 실측 — P20-6 폭별 줄 수 / 1줄 여유 (실브라우저 · 최악값 · annotation 원문)

| 시나리오 | 344 | 374 | 700 | 830 | 992 | 뷰포트 1440(본문 1152) |
|---|---|---|---|---|---|---|
| ① 거부 · 예약구간 | 1줄 +7.1 | 1줄 +37.1 | 1줄 +61.9 | 1줄 +191.9 | 1줄 +353.9 | 1줄 +513.9 |
| ② 미반영 · 장전 | 1줄 +7.1 | 1줄 +37.1 | 1줄 +75.5 | 1줄 +205.5 | 1줄 +367.5 | 1줄 +527.5 |
| ③ 끊김 · 시간외종가 | 1줄 +7.1 | 1줄 +37.1 | **2줄**(높이 74) | 1줄 +64.6 | 1줄 +226.6 | 1줄 +386.6 |

- **계약 대비:** 모든 칸이 D-24 계약과 같다. ①② 는 전 폭 1줄, ③ 은 700 만 2줄 이하, 넘침은 전 칸 0px 이다. 1줄 높이는 46px 이다.
- **목업 대비:** 여유가 폰에서 3.4px, ≥700 에서 10.4px 적다(목업 344 +10.5 · 700 +72.3).
  - 원인은 거래소 세그먼트다. 앱 75.4 · 목업 65.4 이고, 나머지 항목은 0.4px 안에서 같다(연결 61.4/61.0 · 칩 81.1/81.1 · LED 76.0/76.0 · select 168.0/168.0 · 배지 107.9/107.9).
  - shadcn `group-data-[spacing=0]/toggle-group:px-2` 가 호출부 `px-1.5` 를 이기고(항목당 +4), 그룹 테두리가 +2 다.
  - 세그먼트는 「그대로」가 계약이라 고치지 않았다. `deferred-items.md` §2 에 적었다.

## 시각 확인 (스크린샷 48장 · 실행자 검토)

- **범위:** 3 시나리오 × 라이트/다크 × 폭 8개(본문 344·374·700·830·992 + 뷰포트 768(본문 736)·1280(본문 992)·1440)를 찍었다. 위치는 스크래치패드 `shots-0808/` 이고 커밋하지 않았다. 임시 spec `zz-strip-shots.tmp.spec.ts` 는 실행 직후 지웠다.
- **결과:** 목업 안 C 와 배치가 같다.
  - 폰: 「● 시각 · 개인연금저축 ⌄ · KRX|NXT · 점 3」 한 줄 + 아래 고지 줄.
  - ≥700: 「● DMA 실시간 · 1234567801 · 개인연금저축 ⌄ · KRX|NXT · 점 3 · 배지 ··· 시각」 한 줄.
  - 700 끊김은 오른쪽 그룹(다시 연결 + 시각)만 둘째 줄 오른쪽 끝으로 내려간다.
  - 잘림 · 말줄임 · 겹침이 없다.
- **고친 것 1건:** 라이트 폰에서 고지 줄 「다시 연결」이 글자처럼 보였다. outline 의 `--muted` 채움이 페이지 면 `--surface`(#f2f4f6)와 같은 색이었다. `bg-[var(--card)]` 를 깔아 목업 `.rbtn` 과 같은 면으로 맞췄고, 다크에서도 버튼으로 보이는지 다시 찍어 확인했다.
- **본 것(범위 밖):** outline 버튼 글자가 테마 전역 규칙으로 `--muted-fg` 다(대비 ≈4.2:1). `deferred-items.md` §3 에 적었다.

## 게이트 (worktree 루트 · 실제 출력 꼬리)

- **build_command:** `BUILD_EXIT=0` · `error TS` 0건. 마지막 줄은 `$ tsc --noEmit && tsc -p tsconfig.e2e.json` 이다.
- **test_command:**
  - relay: `Test Files  22 passed (22)` · `Tests  632 passed (632)`
  - webapp: `Test Files  108 passed (108)` · `Tests  2081 passed | 1 skipped (2082)` — 기준선 2075 이상 · `TEST_EXIT=0`
- **e2e 5 spec:** `85 passed (2.9m)` · `E2E_EXIT=0` · unexpected 0 · flaky 0 · skipped 0.
  - 파일별: setup 1 · orderbook 14 · trading-workbench 43 · a11y 9 · sidebar-tree 7 · stock-detail-tabs 11.
  - 문턱 = 71(20-07) + 3(P20-6) + 11(stock-detail-tabs) = 85 이다.
- **단위 (Task 2 verify):** `Test Files  2 passed (2)` · `Tests  32 passed (32)`. stock-orderbook-section 은 13 → 19, orderbook 은 13 → 13 이다. 삭제 0 이고 ③ · ⑬ 은 이관했다.
- **3100 리스너:** pid 62646 이고 cwd 가 이 worktree 의 `webapp` 이다(T-20-16).
- **불변식 grep:**
  - `@min-[700px]/lc:hidden` 5 · `truncate|text-ellipsis|line-clamp` 0 · `flex-wrap` 3 · 뷰포트 브레이크포인트 0.
  - `git diff --name-only cb63322 -- webapp/src webapp/e2e` 는 files_modified 5개뿐이다. latch-led · strategy-card · workbench-status-bar · 주문 폼은 무변경이다.

## TDD Gate Compliance

| 태스크 | RED | GREEN | RED 증거 |
|---|---|---|---|
| Task 1 | `080d42f` test(20-08) — ③ · ③-e 단언 실패 | `7fad1d1` feat(20-08) | `gsd-tools check tdd-red-evidence` → `RED_EVIDENCE_OK`(target ③-e) |
| Task 2 | `8dea4ac` test(20-08) — ⑬ · ③-f~i 단언 실패 | `cbbe479` feat(20-08) | `RED_EVIDENCE_OK`(target ③-f) |

- 검사기는 node:test TAP 요약(`# tests/pass/fail`)만 읽는다. 그래서 vitest `--reporter=tap-flat` 출력에 실제 `ok`/`not ok` 줄 수로 센 요약 세 줄을 덧붙여 기록했다.
- REFACTOR 커밋은 없다.

## Task Commits

1. **Task 1 (트레이서): ≥700 — 거부 고지 줄 · LED 점 · sr-only/title** — `080d42f` (test RED) · `7fad1d1` (feat GREEN). 트레이서 게이트는 `<verify>` 재실행 green(orderbook 13 passed) 뒤에 확장했다.
2. **Task 2: <700 압축 + select 폭 판정 + P20-6 ②③** — `8dea4ac` (test RED) · `cbbe479` (feat GREEN)
3. **Task 3: UI-SPEC · VALIDATION · 게이트 · 시각 확인** — `7fdcfde` (docs)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 투명 오버레이 select 가 scrollOverflowing 에 125px 넘침으로 잡혔다**
- **Found during:** Task 2 (P20-6 ① 344 첫 실행)
- **Issue:** 칩(81px)을 덮는 투명 select 가 16px 로 「1234567801 · 개인연금저축」을 그리려 해 `scrollWidth` 가 `clientWidth` 를 넘었다. 글자는 보이지 않지만, 판정 함수는 바꿀 수 없다(플랜 계약).
- **Fix:** 비교 실험을 했다. `overflow hidden/clip` · `appearance-none` · `color transparent` 는 효과가 없었고, `text-indent -9999px` 와 `font-size 0` 만 통과했다. 그래서 폰 select 에 `-indent-[9999px]` + `[&>option]:indent-0`, ≥700 에 `@min-[700px]/lc:indent-0` 을 줬다. 16px(iOS 확대 방지)은 유지했다.
- **Files modified:** `stock-orderbook-section.tsx`
- **Commit:** `cbbe479`

**2. [Rule 2 - 접근성] 투명 select 는 자기 포커스 링도 투명하다**
- **Found during:** Task 2
- **Fix:** 칩 래퍼에 `has-[select:focus-visible]:ring-2 ring-[var(--ring)]` 를 달았다(`manual-order-form` 주문유형 오버레이와 같은 패턴). ≥700 에서는 `ring-0` 으로 select 자체 링만 남긴다.
- **Commit:** `cbbe479`

**3. [Rule 1 - 시각 결함] 라이트 폰 고지 줄 「다시 연결」이 글자처럼 보였다**
- **Found during:** Task 3 시각 확인
- **Fix:** 고지 줄 버튼에 `bg-[var(--card)]`(목업 `.rbtn` 면)를 깔았다. 상태줄 쪽 버튼(카드 면 위)은 그대로다.
- **Commit:** `cbbe479`

**4. [판단] 이름이 빈 계좌 표기 = 번호만**
- **Issue:** 플랜 ③-g 는 「이름이 비면 번호」를 요구한다. 옵션 문구는 원래 `{번호} · {이름}` 이라 빈 이름이면 「번호 · 」가 됐다.
- **Fix:** `accountLabel(a)` 하나를 옵션 · title · 칩이 함께 쓴다. 이름이 있으면 옛 문구와 같은 글자다.
- **Commit:** `cbbe479`

### 플랜과 다르게 한 작은 것
- `data-slot="orderbook-strip-right"` 를 Task 1 에서 먼저 달았다. Task 1 e2e 의 여유 측정이 오른쪽 그룹을 찾아야 해서다. 클래스(`hidden @min-[700px]/lc:inline-flex`)는 Task 2 에서 달았다.
- `OrderbookStatusBar` prop 을 `statusLabel` 에서 `label` 로 바꿨다. 섹션이 연결 문구를 한 번 계산해 상태줄과 고지 줄에 같이 넘긴다(플랜 「섹션이 한 번 계산」).
- 스크린샷은 요청 폭(344/374/700/830/992)에 플랜 Task 3 의 뷰포트 768 · 1280 · 1440 까지 더해 찍었다.

## ② 미반영을 만든 경로

켜진 매수주문 스위치 `getByRole('switch', { name: '매수주문 켜기', exact: true })` 를 눌렀다. `SetLimitChaserReq` 가 +1 된 것을 확인했고, 에코를 보내지 않자 `orderbook-unacked` 가 섰다. **스위치 경로로 충분**해서 잔량 행 인라인 편집 대안은 쓰지 않았다.

## ③ 상태 주입

`page.routeWebSocket(/:8090\/ws/)` 에 양방향 핸들러를 달았다. 주입 뒤에는 서버 쪽 `"t":"state"` 텍스트 프레임만 버린다. 모든 폭에서 측정 직전에 `data-status="manual_required"` 를 다시 확인했고, 되돌아간 적이 없다. 「다시 연결」은 누르지 않았다(단위 ⑬ 이 본다).

## Issues Encountered

- 이 세션의 worktree 격리 가드가 `.git` 경로를 쓰는 명령을 막았다. 그래서 플랜 커밋 원장(`gsd-plan-head-before-20-08`)을 스크래치패드에 저장했다(값 `3336e7c1…`). `commits: 5` 는 `git rev-list --count 3336e7c..HEAD` 로 잰 값이다(SUMMARY 커밋 전).

## Known Stubs

없음. 「계좌 확인 중…」은 계좌 목록 수신 전 상태 문구이고 기존 옵션 문구와 같다.

## Human UAT 요청

- worktree dev(PORT=3100)에서 `/stocks/005930?tab=orderbook` 를 연다. 목업 `.planning/sketches/002-toss-order-ticket/status-strip-variants.html` 안 C 와 나란히 대조한다(다크/라이트 · 폰 360/390 · 태블릿 768 · 데스크톱 1280).
- 거부 · 미반영 · 끊김이 생기면 고지 줄 위치도 본다.
- push · 배포는 하지 않았다(theme/toss-b 미병합).

## Next Phase Readiness

- 20-VERIFICATION truth 13(「상단 상태줄 1줄 압축」)을 D-24 구현 + 실측 증거로 재검증할 수 있다.
- `webapp/e2e/specs/zz-theme-gallery.spec.ts` · `.planning/milestone.lock` 은 `??` 그대로다(실행 · 스테이징 · 수정 0).

## Self-Check: PASSED

- FOUND: 수정 파일 7개 (webapp 5 · UI-SPEC · VALIDATION) — `ls` 확인
- FOUND: 커밋 080d42f · 7fad1d1 · 8dea4ac · cbbe479 · 7fdcfde — `git log --all` 5/5
- FOUND: 임시 spec 잔여 0 (`webapp/e2e/specs/*tmp.spec*` 0개)
