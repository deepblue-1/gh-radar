---
phase: 20-toss-order-ticket
plan: 06
subsystem: ui
tags: [react, manual-order, numpad-sheet, inline-edit, toss, vitest, tdd]
status: complete

requires:
  - phase: 20-02
    provides: "numpad.ts stepValue · priceIssueText · PAD_CHIPS(원·주·회) · @gh-radar/shared priceInputIssue · 폭 스파이크(≥700 「예약매수」 17px = 206px 버튼에 한 줄)"
  - phase: 20-03
    provides: "NumberPadSheet(purpose fill · 「{필드명} 입력」) · useEditMode · match-media 테스트 헬퍼"
  - phase: 20-04
    provides: "CardBody 의 upperLimit 산출 · LimitChaserForm currentPrice 배선(같은 카드 시세 규칙)"
provides:
  - "manual-order-form.tsx 내부 TicketBox(라벨 위 · --muted · radius 16 · 값 17/600) — UnitBox · Row · StepButton 제거"
  - "ManualOrderFormProps 새 props currentPrice · upperLimit(같은 카드 시세)"
  - "인라인 가격 검증 줄 data-testid=manual-order-price-issue(12.5px --destructive · role=status · 버튼 잠그지 않음)"
  - "터치 기기 상자 버튼(aria-haspopup=dialog) → 공용 NumberPadSheet purpose=fill → 값만 채움"
  - "매수/매도 48px + 정정/취소 38px 두 줄 버튼 · 선택 전 각주 · 주문유형 44px 행(투명 select) · 주문금액 44px 행"
  - "ManualOrderEntry 3탭 34px 트랙 · 「수동주문」 32px · 덮은 뒤 「수동주문 · 키 …」 말줄임 + title"
affects: [20-07]

actuals:
  tokens: 18793
  tasks: 2
  commits: 4
plan_head_before: 1f73ac94cc93f0d133aab904d07e9abee72031f1

tech-stack:
  added: []
  patterns:
    - "편집 방식 분기는 상자 값 자리 하나만 바꾼다 — inline = <input>(라벨 연결), sheet = 상자 전체를 덮는 <button>(after:absolute inset-0 · aria-label 「{라벨} {값}{단위}」)"
    - "시트는 폼에 하나만 두고 {field, open} 상태로 제목·단위·칩을 고른다 — 닫히는 동안에도 field 를 남겨 제목이 바뀌지 않게 한다"
    - "D-14c 전체 선택은 이번 누름으로 들어올 때만 — pointerdown 에서 이전 포커스를 기록하고 click 에서 판정(이미 편집 중이면 캐럿 이동 허용)"
    - "vitest tap-flat 출력에 # tests/# pass/# fail 요약을 덧붙여 gsd-tools check tdd-red-evidence 에 넘긴다"

key-files:
  created: []
  modified:
    - webapp/src/components/trading/card/manual-order-form.tsx
    - webapp/src/components/trading/card/card-body.tsx
    - webapp/src/components/trading/__tests__/manual-order-form.test.tsx
    - webapp/src/components/trading/__tests__/card-body.test.tsx

key-decisions:
  - "D-14c 클릭 전체 선택은 이번 누름으로 들어온 경우에만 한다 — 이미 편집 중인 칸을 다시 누르면 캐럿을 옮길 수 있어야 중간 수정이 가능하다(플랜 문언 「onClick 에서 select()」를 좁혀 적용)"
  - "종목(isin)이 바뀌면 열린 수동주문 시트를 닫는다 — 기존 종목 전환 리셋 이펙트는 건드리지 않고 별도 이펙트로 더했다(T-20-05)"
  - "≥700 매수/매도 17px 적용 — 20-02 폭 스파이크가 206px 버튼에 「예약매수」 17px 한 줄(58.1px)을 기록했다(A-P6). <700 은 기존 13px · 줄바꿈 그대로"
  - "상태 문구 색: 검증(validation)은 --destructive, 전송 중·연결·예약 안내는 --muted-fg, 결과 배너 제목은 거부만 --destructive(결과 모름은 접수와 같은 중립 톤 유지), 잠금 문구는 --fg 유지"
  - "시트 ctx.maxPieces 는 조각 수 시트에서만 넘긴다(PadCtx 계약) · serverValue 는 넘기지 않는다(「지금 ○○」·다른 단말·감시 중 안내 없음)"

patterns-established:
  - "수동주문 표면의 검증은 보조일 뿐 — 인라인은 줄로 말하고 버튼을 잠그지 않으며, 시트는 확정만 잠근다. 주문 판정은 서버다(D-15 · D-27)"

requirements-completed: []

coverage:
  - id: D1
    description: "토스 상자(TicketBox) · 48/38 두 줄 버튼 · 조각 스테퍼 제거 · 주문유형/주문금액 44px 행 · 각주 · 원주문 칩 모양"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/manual-order-form.test.tsx#빈 폼: 매수·매도 48px 한 줄 + 정정·취소 38px 한 줄 · 정정·취소 disabled + 각주 · 매수·매도는 활성이다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/manual-order-form.test.tsx#토스 상자 · 인라인 입력 (D-08 · D-10 · D-14c · D-15)"
        status: pass
    human_judgment: false
  - id: D2
    description: "인라인 입력 — 들어오면 전체 선택 · ↑↓ 한 호가/1 · Enter blur · D-15 검증 줄(버튼 잠그지 않음)"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/manual-order-form.test.tsx#↑/↓ — 가격은 한 호가(98,000 → 98,100 · 2,000 → 1,999) · 수량은 1 · Enter = blur (주문은 나가지 않는다)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/manual-order-form.test.tsx#가격 검증 줄(D-15): 호가 단위 위반은 상자 아래 12.5px --destructive 한 줄 · 주문 버튼은 잠그지 않는다"
        status: pass
    human_judgment: false
  - id: D3
    description: "터치 시트 입력 — 상자 탭 → NumberPadSheet(fill) → 값만 채움 · 칩(현재가·상한가·회) · 잠금 · 확인 다이얼로그 경로 불변"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/manual-order-form.test.tsx#D-10 시트 입력(터치) — 값만 채운다 (12건)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-body.test.tsx#수동주문 가격 상자 → 시트 칩 「현재가」「상한가」 가 같은 카드 시세(quote.p · quote.ul)다 · 전송 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "진입(ManualOrderEntry) 재스타일 — 3탭 34px · 수동주문 32px · 키 줄 말줄임 + title · 옛 셀렉터 보존"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/manual-order-form.test.tsx#재스타일(D-09 · §9): 3탭 34px · 15/600 · 트랙 radius 12 · 「수동주문」 32px 13/600 · 덮은 뒤 키 줄 말줄임 + title"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts GC4 · GC5 · GC6 (#mo-price · 「수동주문」 exact · 실제 relay 전송 경로) 5 passed"
        status: pass
    human_judgment: false
  - id: D5
    description: "본문 344 의 42% | 1fr 패널에서 「예약매수」「예약매도」 48px · 「정정」「취소」 38px 라벨이 잘리지 않는다(시각 폭)"
    human_judgment: true
    rationale: "jsdom 은 컨테이너 쿼리·글자 폭을 재지 않는다 — must_haves 가 backstop(20-02 스파이크 + 20-07 Playwright)으로 지정한 항목"

duration: 14min
completed: 2026-09-25
---

# Phase 20 Plan 06: 수동주문 토스 스타일 + 시트 입력 요약

**수동주문이 토스 상자(`TicketBox` · 라벨 위 · 값 17/600)와 매수/매도 48px + 정정/취소 38px 두 줄 버튼으로 바뀌었다. 마우스 기기는 상자에 직접 친다(들어오면 전체 선택 · ↑↓ 한 호가/1 · Enter blur · 호가 단위·상한가 위반은 상자 아래 한 줄). 터치 기기는 상자를 누르면 상따 설정과 같은 키패드 시트(`NumberPadSheet` purpose fill)가 열리고 「가격/수량/조각 수 입력」은 값만 채운다. 주문이 나가는 길(확인 다이얼로그 · 잠금 · 77 · 정정/취소 조건)은 한 줄도 바뀌지 않았다.**

## 성과

- **소요:** 약 14분 (2026-09-25T05:18:57Z → 05:33:27Z)
- **태스크:** 2/2
- **변경 파일:** 4 (수정 — 소스 2 · 테스트 2)
- **테스트:** manual-order-form 61 → 85 (감소 0) · card-body +2 · webapp 전체 107 파일 1,967 통과(1 skip 은 기존)

## 완료한 일

1. **Task 1 — 토스 스타일 (D-08 · D-09 · D-11 · D-14c · D-15)**
   - `UnitBox` · `Row` · `StepButton` 을 지우고 `TicketBox` 를 새로 만들었다: `--muted` · radius 16 · 패딩 12 12 12 14 · 머리 줄 13px(라벨 600 `--fg-2` + 1×10 `--switch-off` 막대 + 힌트 12px) · 값 줄 17/600 + 단위. 포커스는 상자의 `focus-within` inset `--ring` 링 한 겹이고, 입력은 `data-focus-ring="seamless"` 로 짝을 맞췄다.
   - 입력칸은 `[field-sizing:content]` + `min-w-[1ch]` 로 폭을 잡고, 자리표시 「가격 입력」/「수량 입력」은 `--faint` 500 이다. id(`#mo-price/qty/pieces-{isin}`)와 `<label>` 연결은 그대로 뒀다.
   - `SELECT_ON_ENTRY`: 포커스 때 한 번, 다음 틱에 한 번 더 전체 선택한다. 클릭 때는 이번 누름으로 들어온 경우에만 다시 전체 선택한다. `stepKeyDown` 은 ↑/↓(가격 `stepValue` 원 · 수량 1 · 조각 1~`maxPieces`)와 Enter(blur)를 처리한다. IME 조합 중인 키와 수식키 조합은 무시한다.
   - D-15 검증 줄은 시간외종가가 아니고 가격이 있을 때 `priceInputIssue(price, upperLimit ?? 0)` → `priceIssueText` 로 만든다. `role="status"` 이고, 값을 보정하지 않으며, 주문 버튼도 잠그지 않는다.
   - 시간외종가 가격 상자는 탭·입력이 없다(잠긴 「—」 · 힌트 자리에 「참고 종가 {종가}원」). 그 아래 기존 `OFFHOURS_HINT` 가 12px 한 줄로 붙는다.
   - 주문유형은 44px 행이다. 보이는 것은 「지정가 ›」/「시간외종가 ›」이고, 그 위에 네이티브 select 를 `absolute inset-0 opacity-0` 로 겹쳤다. 키보드 포커스는 행의 `has-[select:focus-visible]` 링이 보여 준다. 주문금액도 44px 행이다.
   - 버튼은 두 줄이다. 매수(`--up`, 왼쪽) · 매도(`--down`)는 48px · radius 14 · 흰 글자이고, <700 은 13px · 줄바꿈, ≥700 은 17px 한 줄이다. 정정 · 취소는 38px · radius 10 · 15/600 · `--muted` 면 · `--muted-fg` 글자다. 비활성은 `opacity-50` 이고, 선택이 없으면 각주가 붙는다.
   - 상태 문구는 12px 로 줄였다. 원주문 칩은 `--muted` · radius 12 · 13px 이고 ✕ 히트 영역은 44 다. 폼 최대 폭 400 은 두지 않았다(A8).
   - `ManualOrderEntry`: 3탭 트랙은 `--muted` · radius 12 · p 3 · 탭 34px 15/600 이다. 「수동주문」은 `h-8` 13/600 `--fg-2` 이고, 덮은 뒤 머리 줄은 「수동주문 · 키 …」(12px `truncate` + `title`)에 ✕ `size-8` 이 붙는다.
2. **Task 2 — 시트 입력 (D-10 · D-15 · D-17 · D-23)**
   - `useEditMode() === 'sheet'` 이면 세 상자의 값 자리가 버튼으로 바뀐다(`aria-haspopup="dialog"` · 이름 「{라벨} {값}{단위}」 · `after:absolute after:inset-0` 로 상자 전체를 누르는 영역으로 씀). 누르면 `boxReturnRef` 를 기록하고 시트를 연다.
   - 폼에는 `NumberPadSheet` 하나만 둔다. 제목·설명·단위는 필드에서 고르고, `initialValue` 는 현재 값(빈 값이면 null)이다. `ctx` 는 `{current: currentPrice, upper: upperLimit, maxPieces(회만)}` 이다. `onConfirm` 은 `setPriceText/setQtyText/setPieceText(clamp)` → `setValidation(null)` → 닫기 순서이고, 전송·반영 중 단계는 없다.
   - 종목이 바뀌면 열린 시트를 닫는다(별도 이펙트).
   - `card-body.tsx`: `ManualOrderForm` 에 `currentPrice={quote.p > 0 ? quote.p : 0}` · `upperLimit={upperLimit}` 를 넘긴다(같은 카드 시세).

## 태스크 커밋

1. **Task 1 RED** — `327fcd4` test(20-06): 수동주문 토스 상자·48/38 버튼·인라인 전체 선택/↑↓·가격 검증 줄·진입 재스타일 계약 테스트 (RED)
2. **Task 1 GREEN** — `eb33b14` feat(20-06): 수동주문 토스 상자·48/38 버튼·인라인 전체 선택/↑↓·가격 검증 줄·진입 탭/버튼 재스타일
3. **Task 2 RED** — `99b498c` test(20-06): 수동주문 시트 입력(터치) — 값만 채움·칩·검증 잠금·CardBody 시세 원천 계약 테스트 (RED)
4. **Task 2 GREEN** — `548c75a` feat(20-06): 수동주문 시트 입력(터치) — 상자 탭 → NumberPadSheet(fill) → 값만 채움 · CardBody 가 현재가·상한가를 내림

## TDD 게이트 준수

| 태스크 | RED 커밋 | RED 증거(`gsd-tools check tdd-red-evidence`) | GREEN 커밋 |
|---|---|---|---|
| Task 1 | `327fcd4` | `RED_EVIDENCE_OK` — 대상 「↑/↓ — 가격은 한 호가(98,000 → 98,100 …)」(`expected '98,000' to be '98,100'`) · 73 중 15 실패, 전부 계획한 단언의 실패(스테퍼·기하·검증 줄 부재) | `eb33b14` (73 통과) |
| Task 2 | `99b498c` | `RED_EVIDENCE_OK` — 대상 「가격 상자 → 시트 제목 「가격」 · 설명 · 칩 4개 …」(`Unable to find role=button name 가격` — 인라인 입력칸이 그려짐) · 108 중 13 실패 | `548c75a` (136 통과 · 3 파일) |

REFACTOR 커밋은 없다(GREEN 코드에 정리할 것이 남지 않았다). vitest `tap-flat` 은 node:test 식 요약 줄을 찍지 않는다. 그래서 `ok`/`not ok` 수를 세어 `# tests/# pass/# fail` 을 덧붙인 뒤 검증기에 넘겼다.

## 검증

- `vitest --run manual-order-form.test.tsx queued-window.test.ts` → **2 파일 · 87 통과**(Task 1)
- `vitest --run manual-order-form.test.tsx card-body.test.tsx number-pad-sheet.test.tsx` → **3 파일 · 136 통과**(Task 2)
- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` → 오류 0(`tsc --noEmit && tsc -p tsconfig.e2e.json`)
- `pnpm --filter @gh-radar/webapp run test` → **Test Files 107 passed · Tests 1967 passed | 1 skipped**(skip 은 이 플랜 이전부터 있던 것)
- Playwright(참고): `trading-workbench.spec.ts -g "P20-"` **3 passed** · `-g "GC4 |GC5 |GC6 |GC7"` **5 passed** — 옛 셀렉터 `#mo-price-{isin}` · 「수동주문」(exact)와 실제 relay 전송·결과 모름 잠금 경로가 그대로 동작한다.
- 수용 기준 grep: `function StepButton` 0 · `function TicketBox` 1 · `h-[38px]` ≥1 · `h-[48px]` ≥1 · `var(--primary` 0 · `useEditMode()` ≥1 · `NumberPadSheet` ≥1 · card-body `upperLimit={upperLimit}` ≥1. `git diff 1f73ac9 -- manual-order-form.tsx` 에서 `sendOrder(` · `setConfirm(` · `formOrderLockOf(` 를 담은 +/− 줄은 **0** 이다.

## 계획과 달라진 점

### 자동 처리

**1. [Rule 2 - 정확성] 종목 전환 시 열린 수동주문 시트 닫기**
- **발견:** Task 2
- **문제:** 호가 탭은 remount 없이 `isin` 만 바뀐다. 시트가 열린 채 종목이 바뀌면 앞 종목에 치던 값이 새 종목 상자로 들어간다(T-20-05 계열).
- **처리:** 기존 종목 전환 리셋 이펙트는 그대로 두고(플랜 불변식), `[isin]` 별도 이펙트로 시트만 닫는다.
- **파일:** `manual-order-form.tsx` · **커밋:** `548c75a`

**2. [Rule 1 - 동작] D-14c 클릭 전체 선택을 「이번 누름으로 들어온 경우」로 좁힘**
- **발견:** Task 1
- **문제:** 플랜 문언대로 누를 때마다 `select()` 하면, 이미 편집 중인 칸을 다시 눌러 캐럿을 옮길 수 없다. 중간 자리를 고치는 것도 불가능해진다.
- **처리:** `onPointerDown` 에서 이전 포커스 여부를 `data-had-focus` 에 적어 두고, `onClick` 은 새로 들어온 경우에만 전체 선택한다. 들어올 때 전체 선택(D-14c)은 그대로이고 테스트로 잠갔다.
- **파일:** `manual-order-form.tsx` · **커밋:** `eb33b14`

**3. [범위 — 테스트 파일 추가] `card-body.test.tsx` 에 2건 추가**
- 플랜 `files_modified` 에는 없다. 하지만 Task 2 `<behavior>` 의 「CardBody: currentPrice · upperLimit 를 받는다」를 실제 칩 값(130,000 · 156,000)으로 단언하려면 이 파일이 맞는 자리였다.
- **커밋:** `99b498c`

**4. [표현 판단] 상태 문구 색**
- 플랜은 「오류 톤 `--destructive`, 그 밖 `--muted-fg`」다. 결과 배너는 거부만 `--destructive` 이고, 결과 모름·접수 제목은 `--fg` 를 유지했다. 머리 규율 ②-4(결과 모름에 거부 톤을 쓰면 「실패」로 읽힌다)를 따른 것이다. 잠금 문구도 `--fg` 를 유지했다.

**합계:** 자동 처리 2(Rule 1 · Rule 2) · 범위 1 · 표현 판단 1. **영향:** 전송·확인·잠금 경로는 무변경이고, 사용자에게 보이는 변화는 플랜 범위 안이다.

## 위협 모델 대응

- **T-20-05** 다른 종목 가격: 종목 전환 리셋 이펙트와 CardBody 가격 선택 리셋은 바꾸지 않았다. 현재가·상한가는 같은 카드 `quote` 에서만 오고, 시트는 종목 전환 때 닫힌다.
- **T-20-09** 시트 「입력」이 주문으로 오인됨: purpose fill 은 값만 채우고 닫는다. 모든 시트 케이스가 `sendOrder` 0 과 확인 다이얼로그 부재를 단언한다.
- **T-20-10** 자동 보정 가격: 시트는 위반 값에서 확정을 잠그고, 인라인은 줄만 보인다(값 불변 단언).
- **T-20-15** 인접 오클릭: 3중 일치(색 · 왼쪽/오른쪽 · 글자)와 확인 다이얼로그를 유지했다.

## 알려진 스텁

없음.

## 다음

- 20-07: 옛 e2e(orderbook · a11y · sidebar-tree 일부) 이관, 그리고 본문 344 폭에서 「예약매수」/「정정」 라벨이 잘리지 않는지 보는 Playwright 백스톱.

## Self-Check: PASSED

- 파일 4개 존재 확인(`manual-order-form.tsx` · `card-body.tsx` · 두 테스트 파일)
- 커밋 `327fcd4` · `eb33b14` · `99b498c` · `548c75a` 가 `git log` 에 있음
- 수용 기준 grep · 전체 suite · typecheck 재실행 결과가 위 「검증」과 같음
