---
phase: 32-account-axis
plan: 12
subsystem: webapp
tags: [webapp, workbench, vi, react, d-18, slot-only, playwright, vitest]

requires:
  - phase: 32-account-axis
    provides: "32-11 relay VI (계좌, 거래소) 슬롯 · 웹 viSlots · viSlotOf · fake gateway respondViSlots(slot-only)"
  - phase: 32-account-axis
    provides: "32-04 작업대 계좌 스코프(상단 줄 고른 계좌 · 숨은 카드 주차 규율)"
provides:
  - "ViSettingsRows({ viSlots, accounts, accountNo, accountName, disabled, viOrders, onSent, onDirtyCountChange }) — 세션 계좌 × KRX · NXT 를 `${계좌}|${거래소}` 로 마운트하고 고른 계좌 두 행만 보인다(숨은 행 = 더티 보존)"
  - "행의 vi.set 계좌 = 그 행의 계좌(옮기기 · 송신 계좌 덮어쓰기 · 등록 계좌 고지 제거)"
  - "isViSetRejection + 섹션의 최근 송신 귀속 — vi.set 거부(relay kind vi.set · 54 SetVITrigger)는 보낸 (계좌, 거래소) 행에만 ViServerErrorLine(slot vi-row-server-error)"
  - "E2E 픽스처 seedViSlots(fake gateway 슬롯 모드 · reset 이 끔) · E2E P32-vi"
affects: [32-13, 32-14]

actuals:
  tokens: 20513
  tasks: 2
  commits: 3
plan_head_before: ff2b3b4ea406f668ec023a116a75c202611458ad
plan_head_after: 4a6063cc769ccc7f81aede75b6970142f323902c

tech-stack:
  added: []
  patterns:
    - "숨은 계좌 행 마운트 유지 — 계좌 묶음 `<div hidden className=\"contents\">` 라 행이 바깥 격자 칸에 그대로 서고 `not-first` 구분선 규칙이 계좌 안에서 동작한다"
    - "보이는 행만 종전 id(`vi-krx-rate` …) — 숨은 행은 `vi-krx-{계좌}-rate` 로 id 충돌 없음(E2E · 단위 선택자 무변경)"
    - "거래소 축 없는 거부 귀속 — 섹션이 최근 송신 (계좌, 거래소) 목록을 들고, 행은 답을 기다리는 송신이 있을 때만 받는다"

key-files:
  created: []
  modified:
    - webapp/src/components/trading/workbench/vi-settings-rows.tsx
    - webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/e2e/fixtures/relay.ts
    - webapp/e2e/specs/trading-workbench.spec.ts
    - relay/tests/helpers/fake-gateway.ts

key-decisions:
  - "더티 보존 = (계좌, 거래소) 행 전부 마운트 · 고른 계좌 묶음만 보임(플랜 Flagged assumption 그대로) — 더티 합은 숨은 행 포함, 계좌가 목록에서 빠지면 그 행 몫은 0 으로 빠진다"
  - "고른 계좌가 목록 밖이거나 계좌 목록이 비면 고른 계좌(공란이면 잠긴 행) 두 행을 그린다 — 종전 빈 모양"
  - "줄 계좌 판정 함수(viRowAccountOf)도 통째로 지웠다 — 슬롯 행의 계좌가 곧 정본이라 판정할 것이 없다(플랜은 「differs 갈래」 삭제였다)"
  - "중지 확인 요약의 「오늘 VI 주문 · 미체결」 은 행의 (계좌, 거래소)로 거른다 — 슬롯 행이 남의 계좌 주문을 세지 않게"
  - "vi.set 거부는 슬롯 행에 추가로 서고, 작업대 VI 패널의 한 자리 경보(useViServerError — SetVITrigger 포함)는 그대로 둔다 — 「더보기」 가 접혀도 보이는 자리라서. 54 SetVITrigger 거부는 두 자리에 같은 문구로 보인다"

patterns-established:
  - "ViServerErrorLine slot prop — 같은 오류 문구 모양을 다른 자리(data-slot)로 그린다"

requirements-completed: [AXIS-01]

coverage:
  - id: D1
    description: "트레이서 — 작업대 VI 설정 행 = 고른 계좌 슬롯: A 가동 값 · B 미등록 빈 행 · B 저장 → 11 accountNo B · A 불변 · 숨은 A 행 더티 보존"
    requirement: AXIS-01
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx#P32 고른 계좌 슬롯 (D-18 · S12) (6 passed)"
        status: pass
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g \"P32-vi\" --workers=1"
        status: pass
    human_judgment: false
  - id: D2
    description: "「옮기기」 버튼 · 이동 확인 창 · 「계좌 … 에 등록된 VI 예요」 고지 줄 제거 — 송신은 언제나 행의 계좌"
    requirement: AXIS-01
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx#P32 옮기기 제거 · 슬롯 오류 (D-18 · S12)"
        status: pass
      - kind: other
        ref: "grep -rn \"viMoveTargetOf\\|viRegisteredAccountText\\|accountOverride\" webapp/src webapp/e2e → 0줄"
        status: pass
    human_judgment: false
  - id: D3
    description: "vi.set 거부(relay 거부 · 54 SetVITrigger)는 보낸 (계좌, 거래소) 행에만 기존 VI 오류 문구 — 다른 계좌의 같은 거래소 행에는 없다"
    requirement: AXIS-01
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx#P32 옮기기 제거 · 슬롯 오류 (D-18 · S12) > vi.set 거부가 오면 보낸 (계좌, 거래소) 행에만 기존 VI 오류 문구가 선다 — 다른 계좌의 같은 거래소 행에는 없다"
        status: pass
    human_judgment: false
  - id: D4
    description: "기존 작업대 VI 흐름 · 접근성 회귀 없음(단일 계좌 = 종전 모양)"
    requirement: AXIS-01
    verification:
      - kind: e2e
        ref: "playwright trading-workbench.spec.ts -g \"VI|P32-vi\" --workers=1 (15 passed)"
        status: pass
      - kind: e2e
        ref: "playwright trading-workbench.spec.ts 전체 — 82 passed · 1 failed(P31-3 기존 결함 · deferred) · 3 did not run → 줄 지정 재실행 4/4 passed"
        status: pass
      - kind: e2e
        ref: "playwright a11y.spec.ts --workers=1 (13 passed)"
        status: pass
    human_judgment: false
  - id: D5
    description: "라이브 — 교보119 · 다계좌 실서버에서 계좌 전환 시 VI 행 교체 · 저장 계좌 실증"
    requirement: AXIS-01
    verification: []
    human_judgment: true
    rationale: "실 gh-trade 서버(Phase 33) · relay 배포 뒤에만 볼 수 있다(32-14 메인 세션 · D-18 교보119 UAT). 단위 · E2E 는 스텁 게이트웨이만 본다"

duration: 20min
completed: 2026-10-16
status: complete
---

# Phase 32 Plan 12: 웨이브 ④ 작업대 VI 설정 행 = 고른 계좌 슬롯 Summary

**작업대 VI 설정 행이 상단 줄에서 고른 계좌의 (계좌, 거래소) 슬롯을 그린다. 세션 계좌 × KRX · NXT 행을 모두 마운트하고 고른 계좌 행만 보여서, 저장 안 한 편집이 계좌를 바꿔도 남는다. 저장은 그 행의 계좌로만 나간다. 「옮기기」 흐름과 등록 계좌 고지는 지웠다. `vi.set` 거부는 보낸 슬롯 행에만 기존 오류 문구로 보인다.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-10-16T08:57:41Z
- **Completed:** 2026-10-16T09:17:12Z
- **Tasks:** 2 (1 트레이서 · 2 TDD)
- **Files modified:** 6

## Accomplishments

- **슬롯 행(D-18):** `ViSettingsRows` 는 이제 `viSlots` · `accounts` · `accountNo` 를 받는다.
  - 계좌마다 `data-slot="vi-settings-account"` 묶음(`hidden` · `contents`)을 두고, 그 안에 KRX · NXT 행을 그린다.
  - 행의 서버 값은 `viSlotOf(viSlots, 계좌, 거래소)` 다. 미등록 슬롯은 기존 미등록 빈 행이고, 저장하면 그 계좌로 등록된다.
  - 더티 합은 숨은 행을 포함한다. 중지 요약의 VI 주문 수는 행의 (계좌, 거래소)로 거른다.
  - 작업대는 `relay.viSlots` 와 `accounts` 를 넘긴다. 이제 작업대는 `viTriggers` 를 읽지 않는다.
- **옮기기 · 고지 제거(S12):** 옮기기 대상 판정, 등록 계좌 고지, 줄 계좌 판정을 지웠다. 옮기기 버튼, 확인 창의 이동 표기(`moveFrom` · `data-move`), 옮기기 stale 문구, 송신 계좌 덮어쓰기도 지웠다. 이제 행 블록은 평상시 행 한 줄뿐이다.
- **슬롯 오류(S12 error):**
  - `isViSetRejection` 이 relay 거부(`src "Relay"` · `kind "vi.set"`)와 54 `SetVITrigger` 의 ERROR 를 가려낸다.
  - 섹션은 최근 송신의 (계좌, 거래소)를 기억해 두고, 거부를 계좌가 맞는 가장 최근 송신 행에 붙인다.
  - 그 행은 답을 기다리는 송신이 있을 때만 거부를 받는다. 받으면 잠금을 풀고 `ViServerErrorLine`(slot `vi-row-server-error`)을 보인다.
- **E2E:** fake gateway 슬롯 모드에 `seedViSlots` 를 더했고 `reset` 이 끈다. `P32-vi` 를 더했다.

## Task Commits

1. **Task 1 (tracer): 작업대 VI 설정 행 = 고른 계좌 슬롯** — `3e9c957c` (feat). 트레이서 게이트에서 `<verify>` 를 다시 돌렸다(vitest 73/73 · P32-vi E2E passed). `⚡ Tracer verified end-to-end — expanding`.
2. **Task 2 (TDD): 옮기기 · 고지 제거 · 슬롯 행별 오류**
   - RED `959a827f` (test) — 새 describe 3건이 모두 의도한 단언에서 실패했다.
   - GREEN `4a6063cc` (feat) — 구현, 낡은 describe 정리, E2E 「옮기기 없음」 단언. REFACTOR 는 변경이 없어 커밋하지 않았다.

## TDD Gate Compliance (Task 2)

- **RED:** `test(32-12)` `959a827f`. 증거 명령은 `pnpm exec vitest run src/components/trading/__tests__/vi-settings-rows.test.tsx --maxWorkers=2 -t "P32 옮기기 제거" --reporter=junit`(cwd webapp)이다. 대상 테스트는 「vi.set 거부가 오면 보낸 (계좌, 거래소) 행에만 기존 VI 오류 문구가 선다 — 다른 계좌의 같은 거래소 행에는 없다」 이다. `gsd-tools check tdd-red-evidence` 결과는 `RED_EVIDENCE_OK`(target_test_failed · junit · tests 76 · fail 3)였다.
  - **의미 평가:** 대상 테스트는 실제로 실행됐다. 계획한 단언 `slotError(A,'KRX')` 가 null 이라 `toHaveTextContent` 가 실패했다. 행 단위 거부 귀속이 아직 없었다는 뜻이다.
  - 같은 실행의 다른 두 건도 의도한 단언에서 실패했다. 하나는 옮기기 버튼이 있다는 것, 다른 하나는 고지 줄 `p[role=status]` 가 있다는 것이다.
  - 수집 · 구문 · 픽스처 오류는 없었다.
- **GREEN:** `feat(32-12)` `4a6063cc` — vi-settings-rows 47/47, `src/components/trading` 1867/1867 통과.

## Files Created/Modified

- `webapp/src/components/trading/workbench/vi-settings-rows.tsx`
  - 슬롯 행, 계좌 묶음 마운트, 보이는 행만 종전 id
  - 옮기기 · 고지 · 줄 계좌 판정 삭제
  - `isViSetRejection` · 거부 귀속 · 행 `serverError`
  - `ViServerErrorLine` 의 `slot` prop · `ViConfirmDialog` 의 `moveFrom` 삭제
  - 머리 주석 ⑨ · ⑩
- `webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx`
  - 한 계좌 슬롯 래퍼(`Rows`)로 기존 케이스를 옮겼다.
  - 「P32 고른 계좌 슬롯」 6건과 「P32 옮기기 제거 · 슬롯 오류」 3건을 더했다.
  - CR-02 · GC-WR-04 describe 는 지우고 의도 주석을 남겼다. 컨텍스트 목에 `messages` 를 더했다.
- `webapp/src/components/trading/workbench/trading-workbench.tsx` — `viSlots={relay.viSlots}` · `accounts={accounts}` 를 넘기고 `viTriggers` 구조분해를 지웠다.
- `webapp/e2e/fixtures/relay.ts` — `seedViSlots` 를 더했고 `reset` 이 `respondViSlots(null)` 을 부른다.
- `webapp/e2e/specs/trading-workbench.spec.ts` — `P32-vi` 를 더했다(옮기기 · 고지 부재 단언 포함).
- `relay/tests/helpers/fake-gateway.ts` — `respondViSlots(null)` 이 슬롯 모드를 끈다.

## Decisions Made

- frontmatter `key-decisions` 와 같다. 요점은 다섯 가지다.
  - 숨은 행 마운트로 더티를 보존한다.
  - 목록 밖 고른 계좌는 종전 빈 모양으로 그린다.
  - 줄 계좌 판정 함수를 통째로 지웠다.
  - VI 주문 수를 (계좌, 거래소)로 거른다.
  - 작업대 한 자리 경보는 유지한다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] fake gateway 슬롯 모드 끄기(`respondViSlots(null)`) — 플랜 파일 목록 밖**
- **Found during:** Task 1 (E2E 픽스처)
- **Issue:** 플랜은 「reset 이 비움」 을 요구한다. 그런데 32-11 의 `respondViSlots` 는 한 번 켜면 끌 방법이 없다. 그러면 같은 relay 를 공유하는 다음 spec 이 구 서버 모드(`seedViTrigger`)로 돌아가지 못한다.
- **Fix:** 시그니처를 `FakeViTriggerInput[] | null` 로 넓혔다. `null` 이면 `viSlots = null`(모드 끔)이다. 하위 호환이다.
- **Files modified:** `relay/tests/helpers/fake-gateway.ts`
- **Verification:** relay `typecheck:tests` exit 0 · 작업대 E2E 전체(P32-vi 뒤의 VI 케이스 통과)
- **Committed in:** `3e9c957c`

**2. [Rule 1 - Bug] 숨은 계좌 행과 id 충돌**
- **Found during:** Task 1
- **Issue:** 계좌마다 행을 마운트하면 `vi-krx-rate` 같은 id 가 겹친다. 그러면 `label htmlFor` 와 `#id` 선택자가 숨은 행을 가리킨다.
- **Fix:** 보이는 행만 종전 id 를 쓰고, 숨은 행은 `vi-krx-{계좌}-…` 를 쓴다.
- **Committed in:** `3e9c957c`

**3. [플랜 해석] Task 1 에서 낡은 GC-WR-04 단위 케이스 1건 삭제**
- 「창을 연 뒤 상태줄 계좌가 C 로 바뀜」 케이스는 슬롯 행에서 전제가 성립하지 않는다. 계좌를 바꾸면 C 의 행이 따로 서기 때문이다. 그래서 Task 1 에서 먼저 지웠고, 나머지 옮기기 describe 는 Task 2 에서 지웠다.

**4. [플랜 해석] 「이관 — 계좌가 비어 있으면 잠긴다」 단언 이행**
- 옛 단언은 「등록 행은 자기 계좌라 안 잠긴다」 였다. 이제는 행 계좌가 곧 고른 계좌이므로, 공란이면 두 행 모두 잠긴다.

---

**Total deviations:** 2 auto-fixed (Rule 3 ×1 · Rule 1 ×1) + 2 플랜 해석
**Impact on plan:** 범위는 늘지 않았다. 공개 계약(relay 와이어)도 바뀌지 않았다.

## Issues Encountered

- 작업대 E2E 전체: 82 passed · 1 failed · 3 did not run.
  - 실패 1건은 P31-3(「777주」 ≠ 「비교가격 필요」)이다. `deferred-items.md` 32-03 · 32-10 에 있는 기존 결함이고 32 범위 밖이다.
  - 미실행 3건은 serial 파일이라 실행되지 않았다. 줄 지정으로 다시 돌려 4/4(setup 포함) 통과했다.
- a11y.spec 13/13 통과.

## Known Stubs

없음.

## User Setup Required

None. 배포는 32-14 에서 메인 세션이 한다(relay → gh-trade → webapp push).

## Next Phase Readiness

- 32-13(/me · 사이드바 · 상태줄의 슬롯 전환과 웹 거래소 단일 칸 상태 제거)에서 남은 작업:
  - 작업대는 이미 `viTriggers` 를 읽지 않는다.
  - `viLegacyOf` 다리와 `case "vi"` 를 지울 때 이 플랜의 표면은 영향이 없다.
  - S12 표 행(/me · 사이드바)은 32-13 몫이다.
- 32-14: 라이브 실증(D5)이 남았다. 교보119 VI, 다계좌 전환, 저장 계좌를 확인한다.

## Self-Check: PASSED

- 파일: 수정 파일 6개가 디스크에 있다. 새로 만든 파일은 없다.
- 커밋: `3e9c957c` · `959a827f` · `4a6063cc` 가 HEAD 의 조상이다.
- Task 1 acceptance
  - `viSlotOf(`(vi-settings-rows) 2줄 · `viSlots={`(trading-workbench) 1줄 · `seedViSlots`(fixtures/relay.ts) 2줄
  - vitest FAIL 0 · 「P32 고른 계좌 슬롯」 6 passed · `P32-vi` passed
- Task 2 acceptance
  - `grep -rn "viMoveTargetOf\|viRegisteredAccountText\|accountOverride" webapp/src webapp/e2e` 0줄
  - 「P32 옮기기 제거 · 슬롯 오류」 3 passed · webapp typecheck exit 0 · 작업대 VI E2E(`-g "VI|P32-vi"`) 15 passed · failed 0
- Plan verification
  - shared build · webapp typecheck exit 0
  - `vitest run src/components/trading` 1867/1867
  - 작업대 E2E 전체는 P31-3(기존 · deferred) 1건만 실패
