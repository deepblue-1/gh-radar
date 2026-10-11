---
phase: 21-gh-trade-mobile-app
plan: 33
subsystem: ui
tags: [trading, workbench, manual-order, stock-info-modal, next-app-router, radix-dialog, gap-closure]

requires:
  - phase: 21-25
    provides: "스케치 008 채택안 ③ A(카드 주문유형 44px 행) · D-29 · D-30 · D-31 결정"
  - phase: 21-26
    provides: "종목정보 팝업 고정 높이 · 본문 scrollbar-gutter · ✕ 32 상자"
  - phase: 21-30
    provides: "NewsFullList · DiscussionFullList({code, onBack}) · 섹션 onShowAll"
  - phase: 21-32
    provides: "앱 /trading 공용 패널 숨김 — 착지 reveal 이 하단 패널에 가리지 않는 전제"
provides:
  - "/trading?code={code} 착지 — 배치 복원 뒤 1회 · isPickable · ensureIsinCard(reveal) · code 만 URL 에서 제거 · 송신 0"
  - "카드 수동주문 주문유형(지정가/시간외종가) — 주문금액 위 44px 행 + 선택 불가 시 행 아래 ⓘ 캡션"
  - "종목정보 팝업 newsView — 팝업 안 전체목록 · Esc/Android 뒤로가기 두 단계 · URL 불변"
affects: [21-34, 21-35, 21-36]

actuals:
  tokens: 12320
  tasks: 3
  commits: 5
plan_head_before: b22c06f0d6bba00bea6bb3ef855eaa973e398c90

tech-stack:
  added: []
  patterns:
    - "URL 착지 파라미터 = 작업대 effect 하나(처리 ref · 정규식 · 공용 판정 재사용) — 새 훅·모듈 없음. 끊긴 처리(StrictMode · 이탈)는 ref 를 비워 재처리 허용"
    - "비동기 착지에서 쓰는 콜백은 ref 로 최신값을 읽는다 — 의존성에 넣으면 계좌 도착 같은 변화가 fetch 를 abort 한다"
    - "팝업 안 두 단계 뒤로가기 = DialogContent onEscapeKeyDown 에서 preventDefault 후 로컬 상태만 되돌림(Android 합성 Escape 도 같은 경로)"

key-files:
  created: []
  modified:
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/card/manual-order-form.tsx
    - webapp/src/components/trading/card/card-body.tsx
    - webapp/src/components/trading/card/stock-info-modal.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
    - webapp/src/components/trading/__tests__/manual-order-form.test.tsx
    - webapp/src/components/trading/__tests__/card-body.test.tsx
    - webapp/src/components/trading/__tests__/stock-info-modal.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts

key-decisions:
  - "?code= 형식 오류도 URL 에서 code 를 지운다 — 모든 경로(형식 오류 · 매매 불가 · 실패 · 성공)가 끝나면 code 만 제거하고 다른 파라미터(focus 등)는 남긴다"
  - "카드 주문유형 선택 불가 캡션(ⓘ 시간외종가는 KRX · 시간외종가 창(G2/G3)에서만 고를 수 있어요)은 같은 행을 쓰는 호가 탭에도 붙는다 — 한 벌 유지, 호가 탭은 21-34 가 제거"
  - "팝업 전체목록 중 요약은 언마운트하지 않고 hidden 으로 숨긴다 — 돌아올 때 재조회·스켈레톤 없이 본문 scrollTop 복원(21-30 종목상세 탭과 같은 규율). 다른 탭으로 옮기거나 팝업을 닫으면 요약으로 접는다"

patterns-established:
  - "착지 파라미터 소비: layoutRestored 뒤 · handledCodeRef · 공용 판정 함수 import · replaceState 로 자기 파라미터만 제거"
  - "팝업 로컬 뷰 상태: 닫힘을 렌더 중 상태 보정(`if (!open && view) setView(null)`)으로 되돌려 다음 열림을 초기 상태로"

requirements-completed: [MOBILE-01]

coverage:
  - id: D1
    description: "/trading?code= 로 들어오면 그 종목 카드를 보장·펼침·헤더 토글 포커스, URL 에서 code 제거, 명령 프레임 0, 재진입 시 카드 수 불변 · 형식 오류/매매 불가/실패는 카드 없이 로그만 (G-21-R3-9 트레이딩 쪽)"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/trading-workbench.test.tsx#TradingWorkbench — ?code= 종목상세 「트레이딩」 착지 (6 cases)"
        status: pass
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g \"G-21-R3-9\""
        status: pass
    human_judgment: false
  - id: D2
    description: "카드 수동주문 주문유형(지정가/시간외종가) — 주문금액 위 44px 행 · KRX 창 열림만 시간외종가 · 창 닫힘 복귀 · 닫힌 창 전송 차단 · 가격 잠김 · 선택 불가 캡션 (G-21-R3-10 트레이딩 쪽)"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/manual-order-form.test.tsx#ManualOrderForm — 카드 주문유형 (D-31 · G-21-R3-10 · 스케치 008 ③ A)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-body.test.tsx#⑤ variant — 주문유형 콤보 (D-23 · D-31)"
        status: pass
    human_judgment: true
    rationale: "배치·밀도(창 닫힘 대부분 시간의 캡션 공간 · 선택 시 한눈에 보이는가)는 스케치 008 ③ 의 시각 판단이라 21-36 UAT 에서 사람이 본다"
  - id: D3
    description: "종목정보 팝업 뉴스·토론 전체 보기 = 팝업 안 전체목록 · ← · Esc/Android 뒤로가기 = 요약 → 한 번 더 = 닫힘 · URL 불변 (G-21-R3-8 팝업 쪽)"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/stock-info-modal.test.tsx#StockInfoModal — 팝업 안 전체목록 (D-29 · G-21-R3-8 · T-21-81) (4 cases)"
        status: pass
    human_judgment: true
    rationale: "Android 실기 뒤로가기(네이티브 합성 Escape)와 팝업 안 무한 스크롤 체감은 기기 확인이 필요 — 21-36 UAT"

duration: 14min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 33: 트레이딩 쪽 착지 · 카드 주문유형 · 팝업 전체목록 Summary

**`/trading?code=` 가 배치 복원 뒤 `fetchStockDetail → isPickable → ensureIsinCard(reveal)` 로 그 종목 카드를 보장·펼침·포커스하고 code 만 URL 에서 지우며(송신 0), 카드 수동주문 주문금액 위에 44px 「주문유형 지정가 ›」 행(스케치 008 ③ A)을 붙여 시간외종가 신규 주문을 카드에서 같은 affordanceOf 판정으로 내게 했고, 종목정보 팝업의 전체 뉴스·토론을 로컬 newsView 로 팝업 안에서 열고 Esc/Android 뒤로가기 두 단계로 되돌린다.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-09-26T11:44:06Z
- **Completed:** 2026-09-26T11:58:36Z
- **Tasks:** 3 (Task 1 tracer · Task 2·3 TDD RED→GREEN)
- **Files modified:** 9 (소스 4 · 단위 테스트 4 · e2e 1)

## Accomplishments

### 착지 흐름 (G-21-R3-9 · D-30 · T-21-91)

```text
/trading?code=005930
  └ WorkbenchSurface effect [landingCode, layoutRestored]
      ├ landingCode 없음 · 복원 전 · handledCodeRef 와 같음 → 끝
      ├ handledCodeRef = code
      ├ /^[0-9A-Z]{6}$/ 불일치 → console.warn('[gh-radar] ?code= 형식 아님 — 무시') · code 제거 · fetch 0
      └ fetchStockDetail(code, signal)
          ├ isPickable(detail) (stock-add-bar — 종목 추가란과 같은 판정 한 곳: KOSPI/KOSDAQ ∧ isin)
          │    → ensureIsinCard(detail.isin, name, code, reveal=true)
          │       (있으면 isinFocusCardOf 카드 펼침 · 없으면 상태줄 계좌 · KRX 로 추가 · block:start 스크롤 · 헤더 토글 포커스)
          ├ 아니면 console.warn('[gh-radar] ?code= 매매 불가 종목 — 카드 없음', code)
          ├ 실패 console.error(...) — 카드 없음
          └ finally: replaceState(null,'', '/trading' + 남은 파라미터) — code 만 제거
      cleanup: 끝나기 전에 끊기면 abort + handledCodeRef 비움(StrictMode 재실행 · 이탈 뒤 재처리 허용)
```

- `ensureIsinCard` 는 ref(`ensureIsinCardRef`)로 읽는다 — 의존성에 넣으면 계좌가 늦게 도착할 때 effect 가 재실행되며 fetch 를 abort 하고, ref 가 같은 코드라 다시 처리하지 않아 착지가 사라진다.
- 전략 등록 · 주문 · 정정 · VI · 래치 어떤 프레임도 보내지 않는다 — e2e 가 게이트웨이 요청 로그의 명령 타입 8종(2·10·11·14·33·36·37·38)이 0 인지 본다.
- 머리 주석 ⑥ 아래 ⑥-b 추가.

### 주문유형 채택안 대조 (스케치 008 ③ **A** · D-31)

| 항목 | README Winner / index.html ③ A | 구현 |
|---|---|---|
| 배치 | 주문금액 바로 위 44px 행 「주문유형 지정가 ›」 | 기존 호가 탭 행을 variant 조건 없이 렌더 — 수량(·조각 수) 다음 · 주문금액 행 바로 앞 |
| 행 | `.r44` min-height 44 · 14px · 키 muted · 값 fg-2 500 · › faint | `min-h-[44px]` · 라벨 `text-[14px] text-[var(--muted-fg)]` · 값 `text-[14px] font-medium text-[var(--fg-2)]` · › `text-[var(--faint)]` |
| 고르는 방식 | 투명 select → 네이티브 선택 시트 | `select.absolute.inset-0.opacity-0` · 포커스 링은 행(`has-[select:focus-visible]:ring-2`) |
| 창 닫힘 안내 | `.note.warn` 행 아래 · 12px · line-height 1.45 · margin -4px 0 0 · muted · keep-all · `ⓘ ` 접두 · 문구 「시간외종가는 KRX · 시간외종가 창(G2/G3)에서만 고를 수 있어요」 | `data-slot="mo-type-note"` `-mt-1 text-[12px] leading-snug text-[var(--muted-fg)] break-keep before:content-['ⓘ_']` · 문구 = `OFFHOURS_DISABLED_TITLE`(옵션 title 과 같은 상수) · `!aff.offHoursSelectable` 일 때만 |
| 판정 | affordanceOf 그대로(KRX ∧ G2/G3 창 열림) | `orderType = orderTypeState`(variant 무관) → `affordanceOf(queuedWindow, exchange, orderType)` · 옵션 disabled + title |
| 창 닫힘 | 지정가 복귀 | 기존 복귀 effect(`orderTypeState==='offhours' && !aff.offHoursSelectable → 'limit'`) 그대로 |
| 시간외종가 선택 | 가격 잠김(참고 종가) · 주문금액 「종가 확정 후」 | 기존 잠긴 가격 상자 · `OFFHOURS_HINT` · 「종가 확정 후」 그대로 · 전송 `price 0 + krxSession` |
| 닫힌 창 전송 | — | `offHoursSessionOf` null 가드 그대로(카드 variant 단위 테스트로 잠금) |
| 호가 탭 전용 각주 | — | 유지(21-34 정리) |

행 높이 차이: 창 닫힘(대부분의 장중)에서 카드 수동주문이 44 + 캡션 한두 줄(12px · leading-snug)만큼 길어진다 — 채택안 A 가 받아들인 비용이다.

### 팝업 두 단계 (G-21-R3-8 · D-29 · T-21-81)

| 상태 | 입력 | 결과 |
|---|---|---|
| 요약 | 「전체 뉴스/토론 보기」(섹션 `onShowAll`) | 본문 scrollTop 저장 → `newsView='news'/'discussions'` → 요약 `hidden`(마운트 유지) · 전체목록 · 본문 맨 위 |
| 전체목록 | 화면 안 ← 「요약으로 돌아가기」(`onBack`) | `newsView=null` · 저장한 scrollTop 복원 |
| 전체목록 | Esc · Android 뒤로가기(합성 Escape) | `onEscapeKeyDown` → `preventDefault` · `newsView=null` · 팝업 열린 채 |
| 요약 | Esc | Radix 기본 — 팝업 닫힘 |
| 전체목록 | 다른 탭 클릭 | 요약으로 접음(보이지 않는 목록이 Esc 한 번을 삼키지 않게) |
| 아무 상태 | ✕ · 배경 · 부모가 open 내림 | 렌더 중 보정으로 `newsView=null` — 다음 열림은 요약 |

URL · history 호출 0(`history.pushState|replaceState|router.push` grep 0 · 단위 테스트가 세 history 메서드 스파이와 `location.href` 불변을 단언).

## Task Commits

1. **Task 1: `/trading?code=` 착지 (트레이서)** — `10ab9a3a` (feat)
2. **Task 2: 카드 주문유형** — RED `dadc858c` (test) → GREEN `d3e250ec` (feat)
3. **Task 3: 팝업 안 전체목록** — RED `39012fbb` (test) → GREEN `c01a0f6b` (feat)

## Files Created/Modified

- `webapp/src/components/trading/workbench/trading-workbench.tsx` — ⑥-b `?code=` effect · `isPickable` · `fetchStockDetail` import
- `webapp/src/components/trading/card/manual-order-form.tsx` — 주문유형 행 카드 공통 · 선택 불가 캡션 · 머리 주석 첫 단락(G-21-R3-10)
- `webapp/src/components/trading/card/card-body.tsx` — 주석 2곳(variant 차이는 이제 각주뿐)
- `webapp/src/components/trading/card/stock-info-modal.tsx` — `newsView` · `onEscapeKeyDown` · 본문 scrollTop 저장·복원 · ②-b 주석
- `webapp/src/components/trading/__tests__/trading-workbench.test.tsx` — `?code=` 6건 · stock-api 목 · stock-add-bar 목에 실물 `isPickable`
- `webapp/src/components/trading/__tests__/manual-order-form.test.tsx` — 「카드 variant 에는 주문유형 콤보가 없다」 → 카드 케이스 6건
- `webapp/src/components/trading/__tests__/card-body.test.tsx` — ⑤ 카드도 주문유형 콤보가 있다
- `webapp/src/components/trading/__tests__/stock-info-modal.test.tsx` — 섹션 스텁 onShowAll · 전체목록 스텁 · 4건
- `webapp/e2e/specs/trading-workbench.spec.ts` — 「G-21-R3-9 /trading?code=」

## Test Results

| 명령 | 결과 |
|---|---|
| vitest trading-workbench · manual-order-form · card-body · stock-info-modal | 4 files · **267 passed** |
| vitest `src/components/trading src/components/stock src/components/orderbook` (회귀) | 51 files · **1359 passed** |
| `playwright test e2e/specs/trading-workbench.spec.ts -g "G-21-R3-9"` | **2 passed** (setup + 착지) |
| `playwright test e2e/specs/trading-workbench.spec.ts --grep-invert "격자 1/2/3단\|P20-3 최악값\|종목 추가 입력이 16px"` (Task 2 뒤 회귀) | **43 passed** |
| `playwright test e2e/specs/orderbook.spec.ts` (공용 폼 회귀 — 호가 탭에도 캡션) | **15 passed** |
| `pnpm --filter @gh-radar/webapp run typecheck` | 통과 |

## TDD Gate Compliance

- Task 2: RED `dadc858c` — 목표 7건이 `Unable to find a label with the text of: 주문유형` / role option·combobox 부재로 실패(주문유형 컨트롤이 카드에 없어서 · 셋업 오류 아님) → GREEN `d3e250ec` 120/120.
- Task 3: RED `39012fbb` — 목표 4건이 `Unable to find ... button "전체 뉴스 보기"`(onShowAll 미전달)로 실패, 기존 13건 통과 → GREEN `c01a0f6b` 17/17.
- `workflow.tdd_mode` 는 꺼져 있어 `check tdd-red-evidence` 기록은 남기지 않았다(실패 사유는 위에 기록). REFACTOR 커밋 없음(정리할 것 없음).

## Decisions Made

- `?code=` 는 모든 종료 경로에서 code 만 URL 에서 지운다(형식 오류 포함) — 다른 파라미터는 보존.
- 선택 불가 캡션은 같은 행을 쓰는 호가 탭에도 붙는다(한 벌 유지 · 호가 탭은 21-34 가 제거) — orderbook.spec 15건 통과로 레이아웃 회귀 없음 확인.
- 팝업 전체목록 동안 요약은 `hidden` 으로 마운트 유지(플랜의 「요약 섹션은 없다」를 「보이지 않는다」로 구현 — 재조회·스켈레톤 없이 돌아오고 scrollTop 복원이 되게). 다른 탭 이동·닫힘은 요약으로 접는다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] card-body.test ⑤ 케이스 갱신 + card-body.tsx 주석**
- **Found during:** Task 2
- **Issue:** Task 2 verify 가 돌리는 `card-body.test.tsx` 의 「`variant="card"` 는 주문유형 콤보가 없다」가 D-31 로 뒤집힌 사실을 단언해 GREEN 이 막힌다. `card-body.tsx` 머리 주석 · prop 문서도 「주문유형 = 호가 탭 전용」이라 틀린 말이 된다.
- **Fix:** 테스트를 「카드도 주문유형 콤보가 있다」로 바꾸고, card-body 주석 2곳을 「variant 차이는 각주뿐」으로 고쳤다(동작 변경 없음).
- **Files modified:** webapp/src/components/trading/__tests__/card-body.test.tsx, webapp/src/components/trading/card/card-body.tsx (플랜 files_modified 밖)
- **Committed in:** `dadc858c`(테스트) · `d3e250ec`(주석)

**2. [Rule 3 - Blocking] 작업대 테스트의 stock-add-bar 목에 실물 `isPickable`**
- **Found during:** Task 1
- **Issue:** 기존 목이 `StockAddBar` 만 내보내 작업대가 import 하는 `isPickable` 이 목에 없다.
- **Fix:** `importOriginal` 로 실물 `isPickable` 을 그대로 내보낸다(판정 한 곳을 테스트도 그대로 쓴다).
- **Committed in:** `10ab9a3a`

**3. [Rule 1 - Bug 예방] 착지 콜백을 ref 로 읽고, 끊긴 처리는 handledCodeRef 를 비운다**
- **Found during:** Task 1
- **Issue:** 플랜 문장대로 `ensureIsinCard` 를 effect 의존성에 두면 계좌 도착(`accountNo` 변경)이 effect 를 재실행해 fetch 를 abort 하고, ref 가 같은 코드를 막아 착지가 사라진다. StrictMode 이중 실행도 같은 경로로 착지를 잃는다.
- **Fix:** `ensureIsinCardRef` 로 최신 콜백을 읽고 의존성은 `[landingCode, layoutRestored]` 만. cleanup 은 끝나기 전에 끊긴 경우에만 abort + ref 비움.
- **Committed in:** `10ab9a3a`

---

**Total deviations:** 3 auto-fixed (Rule 3 ×2 · Rule 1 ×1)
**Impact on plan:** 모두 검증 통과 · 착지 신뢰성에 필요. 범위 확장 없음(주석 · 테스트 목 조정뿐).

## Issues Encountered

- `trading-workbench.spec.ts` 전체 실행에서 「5. 격자 1/2/3단 × 폰/와이드」가 카드 헤더 `<b>삼성전자</b>` 넘침으로 실패 — `deferred-items.md` 1번(phase 21 이전부터 · 21-23 · 21-34 · 21-35 가 같은 3건을 제외)과 같고, 이 플랜 변경을 되돌린 상태에서도 똑같이 실패함을 확인했다. 제외 3건 외 43건 통과.
- 동시 세션: 시작 직후 `b22c06f0 docs(quick-260926-s5v)` 가 master 에 들어왔다 — 문서 커밋이라 이 플랜 파일과 겹침 없음. 커밋 수·ledger 기준은 그 뒤(`b22c06f0`)다. 남의 미커밋 변경(`.planning/state.json` · `tasks/lessons.md` · `.planning/milestone.lock`)은 스테이징하지 않았다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 21-34 가 종목상세 「트레이딩」 CTA(→ `/trading?code=`)와 호가주문 탭 제거를 할 수 있다 — 착지와 카드 주문유형이 먼저 섰다(갈 곳 없는 중간 상태 없음).
- 21-34 정리 대상: manual-order-form 의 `variant` · `ORDERBOOK_FOOTNOTE` · 「주문유형 콤보 (D-23, 호가 탭 — 21-34 가 정리)」 describe 의 orderbook 케이스 · card-body ⑤ orderbook 케이스.
- 사람 확인(21-36 UAT): 착지 포커스 체감 · 카드 주문유형 행/캡션 밀도(창 닫힘 대부분 시간) · 팝업 Android 뒤로가기 두 단계.

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*

## Self-Check: PASSED

- 수정 파일 9개 존재 · 커밋 5개(`10ab9a3a` · `dadc858c` · `d3e250ec` · `39012fbb` · `c01a0f6b`) git log 에서 확인.
- 수용 기준 grep: `ensureIsinCard(detail.isin` 1 · `isPickable` ≥1 · `handledCodeRef` ≥2 · e2e `G-21-R3-9` ≥1 · `variant === 'orderbook' ? orderTypeState` 0 · `G-21-R3-10` 3 · `newsView` 15 · `onEscapeKeyDown` 2 · `NewsFullList` 3 · `DiscussionFullList` 3 · history/router 호출 0 · 21-33 커밋의 `webapp/src/components/stock/` 파일 0.
