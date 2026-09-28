---
phase: 24-limitchaser-buy3
plan: 13
subsystem: webapp-trading
tags: [limit-chaser, buy3, gap-closure, legacy-server, react, vitest, playwright, axe]
status: complete

requires:
  - phase: 24-limitchaser-buy3
    provides: "24-10 lib isLegacyBuySchema — 구서버 판별 단일 지점"
  - phase: 24-limitchaser-buy3
    provides: "24-12 lcLegacyBlockOf · LC_COMMIT_TEXT.legacyReadOnly · legacyMasterFirst — 전송 경로 차단과 문구 원천"
provides:
  - "card-body export LC_LEGACY_BUY_STATUS 「구서버 전략 · 끄기만 가능」 · cardGroupStatusOf 맨 앞 구서버 갈래"
  - "setting-group groupStatusClassOf — 「구서버」 로 시작하면 --destructive(「포기」 와 같은 토큰)"
  - "폼 구서버 에코: 켜는 방향 스위치 전부 disabled(매수취소 포함) · 끄기는 늘 허용"
  - "armBlockedGroupsOf 구서버 인자 — 열마다 「{카드 이름들} · legacyReadOnly」 한 줄"
  - "e2e P24-11 · a11y 「상따 구서버 에코 카드 axe」 4 스캔 · a11y 폭 · 테마 · 접기 파일 수준 헬퍼"
  - "reference/24-13-legacy/ 스크린샷 6장 · UI-SPEC 갭 클로징 부록(구서버 에코)"
affects: [24-15, 24-16]

actuals:
  tokens: 5431
  tasks: 3
  commits: 5
plan_head_before: d466852dc02a43da07d2f21a9d9a5f7036675863

tech-stack:
  added: []
  patterns:
    - "구서버 에코 표시 = 기존 슬롯 재사용만(상태 문구 · disabled · 열 패널 · 말풍선) — 판별은 lib isLegacyBuySchema, 문장은 훅 LC_COMMIT_TEXT"
    - "a11y 상따 카드 스캔 헬퍼(sizeOpenCardTo · setLcFolds · openLcCardInTheme · pickLcTab)를 파일 수준으로 두고 매트릭스들이 공유"

key-files:
  created:
    - .planning/phases/24-limitchaser-buy3/reference/24-13-legacy/light-344-buy.png
    - .planning/phases/24-limitchaser-buy3/reference/24-13-legacy/light-344-sell.png
    - .planning/phases/24-limitchaser-buy3/reference/24-13-legacy/light-992.png
    - .planning/phases/24-limitchaser-buy3/reference/24-13-legacy/dark-344-buy.png
    - .planning/phases/24-limitchaser-buy3/reference/24-13-legacy/dark-344-sell.png
    - .planning/phases/24-limitchaser-buy3/reference/24-13-legacy/dark-992.png
  modified:
    - webapp/src/components/trading/card/card-body.tsx
    - webapp/src/components/trading/lc/setting-group.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/__tests__/card-body.test.tsx
    - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
    - webapp/e2e/specs/a11y.spec.ts
    - .planning/phases/24-limitchaser-buy3/24-UI-SPEC.md

key-decisions:
  - "구서버 에코면 매수주문 카드 상태는 마스터 ON/OFF 와 무관하게 「구서버 전략 · 끄기만 가능」 — 읽기 전용 사실이 먼저다(구서버는 buy3 그룹을 몰라 「켠 매수 없음」이 거짓)"
  - "열 패널 구서버 한 줄은 그 열의 카드 이름 전부(켜져 있는 매수주문 · 매도주문 포함)를 부르고, 가격 0 등 다른 사유를 함께 말하지 않는다 — 켜는 방향이 전부 막혀 있어 한 줄이 사실 전부다"
  - "세션 미준비(disabled)면 구서버여도 패널이 없다 — 종전 규칙(끊김은 폼 맨 위 몫)을 앞세운다"
  - "값 행 · 체크는 비활성으로 만들지 않는다 — 편집기는 열리고 24-12 확정 전 검증이 legacyReadOnly 로 막는다"

patterns-established:
  - "구서버 에코 화면 표시 = LC_LEGACY_BUY_STATUS(카드) + gateBlocked/gateDisabled legacy 갈래(폼) + armBlockedGroupsOf legacyNames(패널)"

requirements-completed: []

coverage:
  - id: D1
    description: "구서버 에코(buy3Schema 0)면 매수주문 카드 상태가 「구서버 전략 · 끄기만 가능」(--destructive) · 매수 LED 는 「감시」 그대로 · 다른 카드 상태 불변"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-body.test.tsx#WR-02 — 구서버 에코(buy3Schema 0)는 매수주문 상태가 「구서버 전략 · 끄기만 가능」 (읽기 전용이 먼저)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/setting-group.test.tsx#⑩ 상태 색 — 구서버 전략 · 끄기만 가능 → text-[var(--destructive)]"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P24-11 WR-02"
        status: pass
    human_judgment: false
  - id: D2
    description: "구서버 에코에서 꺼진 스위치(선 · 추가 · 후매수 · 매수취소 · 꺼진 매수주문/매도주문)는 disabled · 켜진 스위치는 끌 수 있다 · 열마다 「켤 수 없는 이유」 구서버 한 줄"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#WR-02 — 구서버 에코 화면: 켜는 방향 disabled · 열 패널 한 줄 (24-13)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P24-11 WR-02"
        status: pass
    human_judgment: false
  - id: D3
    description: "buy3 에코(buy3Schema 1)의 카드 상태 · 스위치 · 패널은 종전과 같다"
    verification:
      - kind: unit
        ref: "pnpm --filter @gh-radar/webapp run test — 125 files · 2714 passed · 1 skipped"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P24-4 · P24-5 · P24-6 · P24-7 · P24-9 · P24-10"
        status: pass
    human_judgment: false
  - id: D4
    description: "구서버 에코 상따 카드 axe — 본문 344 · 992 × 라이트 · 다크 critical/serious 0 · 기존 매트릭스 8 스캔 불변"
    verification:
      - kind: automated_ui
        ref: "webapp/e2e/specs/a11y.spec.ts#/trading 상따 구서버 에코 카드 axe · /trading 상따 매수 카드 axe 매트릭스"
        status: pass
    human_judgment: false
  - id: D5
    description: "구서버 에코 화면의 시각 채택(스크린샷 6장) · UI-SPEC 부록의 buy3 선매수 금액 0 = 미입력 재해석"
    verification:
      - kind: automated_ui
        ref: "playwright:.planning/phases/24-limitchaser-buy3/reference/24-13-legacy/{light,dark}-{344-buy,344-sell,992}.png"
        status: pass
    human_judgment: true
    rationale: "프로젝트 규칙 「새 UI 는 사용자 눈 확인 뒤 채택」 — 채택은 24-16 체크포인트에서 사용자가 스크린샷을 본 뒤다. D-03 재해석도 사용자 확인 항목"

duration: 12min
completed: 2026-09-28
---

# Phase 24 Plan 13: WR-02 ② 구서버 에코 화면 표시 Summary

**구서버 에코(`buy3Schema 0`)를 화면이 먼저 말한다 — 매수주문 카드 상태 「구서버 전략 · 끄기만 가능」(`--destructive`), 꺼진 스위치 전부 `disabled`(켜진 스위치는 끄기 가능), 매수 · 매도 열 맨 아래 「켤 수 없는 이유」 패널에 「{카드 이름들} · 구서버 전략이라 끄기만 할 수 있어요 — 서버를 확인해 주세요」 한 줄. 새 시각 요소 · 토큰 · 브레이크포인트 0.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-28T04:41:14Z
- **Completed:** 2026-09-28T04:53:00Z
- **Tasks:** 3 (tracer 1 + auto 2)
- **Files modified:** 9 코드/문서 + 스크린샷 6장

## Accomplishments

- `LC_LEGACY_BUY_STATUS` 신설 · `cardGroupStatusOf` 의 `buy` 판정 맨 앞에 `isLegacyBuySchema(s)` 갈래 — 실제 매수 감시 중일 수 있는 구서버 전략을 「켜짐 · 켠 매수 없음」으로 말하던 거짓 표시(T-24-51)를 없앴다. 매수 LED(마스터 기준 「감시」)와 다른 다섯 카드 상태는 그대로.
- `groupStatusClassOf` 에 「구서버」 → `text-[var(--destructive)]` 한 줄(「포기」 와 같은 토큰).
- 폼: 렌더 스코프 `const legacy = isLegacyBuySchema(server)` · `gateBlocked` 켜는 방향 = `legacy || !canArm[key]`(끄는 방향은 여전히 false — T-16-44) · `gateDisabled('cancelQtyEnabled')` = `disabled || (legacy && !form.cancelQtyEnabled)`.
- `armBlockedGroupsOf(…, legacyNames)` — 구서버면 그 열 한 줄 `{ gates: 열 이름들, text: LC_COMMIT_TEXT.legacyReadOnly }` 만. 매수 열 이름 = `BUY_COLUMN_GATES` 의 `GATE_LABEL`, 매도 열 이름 = `GATE_LABEL.sellEnabled` + `LC_SELL_GROUPS` 매수취소 그룹 `title`(문자열 복제 없음). `ArmBlockedPanel` 무변경.
- e2e P24-11(상태 · 톤 · LED · disabled 넷 · enabled 둘 · 열 패널 두 줄 · 값 확정 말풍선 + 전송 0 · 매수주문 끄기 = 10 한 건, 사건 기반 개수 단언).
- a11y: 폭 · 테마 · 접기 · 탭 헬퍼를 파일 수준으로 옮기고(기존 매트릭스 8 스캔 그대로 통과) 「상따 구서버 에코 카드 axe」 4 스캔 추가.
- 사람 확인용 스크린샷 6장(`reference/24-13-legacy/`) · UI-SPEC 「갭 클로징 부록 — 구서버 에코(WR-02 · 24-12 · 24-13)」.

## Task Commits

1. **Task 1 (tracer) RED:** `1bfc4934` test(24-13) — card-body 상태 표 · setting-group 톤 표 · e2e P24-11 상태 단언
2. **Task 1 (tracer) GREEN:** `451d6ada` fix(24-13) — LC_LEGACY_BUY_STATUS · cardGroupStatusOf 구서버 갈래 · 「구서버」 톤
3. **Task 2 RED:** `bf0d3d49` test(24-13) — 폼 WR-02 화면 describe · 24-12 켜는 스위치 케이스 2건 갱신
4. **Task 2 GREEN:** `8c53d1b3` fix(24-13) — 켜는 방향 disabled · 열 패널 구서버 한 줄 · UI-SPEC 부록
5. **Task 3:** `0f6c72a0` test(24-13) — P24-11 완성 · a11y 4 스캔 · 스크린샷 6장

## TDD Gate Compliance

- **RED (Task 1 · e2e):** `playwright test -g "P24-11"` → `trading-workbench.spec.ts:3294 — expect(locator('[data-slot="lc-group-buy"] [data-slot="lc-group-status"]')).toHaveText("구서버 전략 · 끄기만 가능") failed · Received: "켜짐 · 켠 매수 없음"` (1 failed).
- **RED (Task 1 · 단위):** 2파일 6 failed / 111 passed — 전부 대상 단언 실패(`expected '켜짐 · 켠 매수 없음' to be undefined` 등 4건 — 상수 미export · `expected undefined to be '구서버 전략 · 끄기만 가능'` · `expected 'text-[var(--muted-fg)]' to be 'text-[var(--destructive)]'`).
- **GREEN (Task 1):** 2파일 117 passed · shared build · typecheck 0 error · e2e `P24-11|P24-4|P24-6` 4 passed(setup 포함). 트레이서 게이트(auto 비활성 · end-of-phase · automated-only verify) — verify 재실행 통과 후 확장.
- **RED (Task 2):** 폼 1파일 5 failed / 168 passed — `expect(element).toBeDisabled()` 3건 · 패널 `expected [] to deeply equal [ { …(2) } ]` · 가격 0 동시 사유 `expected [ { …(2) } ] to deeply equal [ { …(2) } ]`(종전 가격 사유가 섰다).
- **GREEN (Task 2):** `vitest --run limit-chaser-form.test.tsx src/components/trading/lc` 8 files · 461 passed · `src/components/trading src/lib` 77 files · 2104 passed · 1 skipped · typecheck 0 error.
- `gsd-tools check tdd-red-evidence` 는 쓰지 않았다 — vitest 출력에 node-test 요약 줄이 없어 zero_tests_discovered 가 나오는 도구라, 대상 테스트 이름 + 단언 실패 줄로 위에 기록했다.

## Verification

- 빌드: shared build · relay typecheck · relay typecheck:tests · webapp typecheck(e2e 포함) — exit 0
- webapp 전체 `pnpm --filter @gh-radar/webapp run test` — 125 files · 2714 passed · 1 skipped
- e2e `P24-11|P24-10|P24-4|P24-6|P24-7|P24-5|P24-9` — 8 passed(setup 포함 · 33.5s)
- a11y `상따 매수 카드 axe|상따 구서버 에코 카드 axe` — 3 passed(setup 포함 · 매트릭스 8 + 구서버 4 스캔)
- relay 변경 0 — relay test 미실행
- 폼 제품 코드 `buy3Schema` 비교 0(주석 제외) · 판별은 lib `isLegacyBuySchema` 하나

## Files Created/Modified

- `webapp/src/components/trading/card/card-body.tsx` — `LC_LEGACY_BUY_STATUS` · 구서버 갈래 · JSDoc 판정 표 한 줄
- `webapp/src/components/trading/lc/setting-group.tsx` — `groupStatusClassOf` 「구서버」 톤
- `webapp/src/components/trading/limit-chaser-form.tsx` — `legacy` · `gateBlocked` · `gateDisabled` · `armBlockedGroupsOf` legacyNames · 열 이름 상수 둘 · 머리 ② 3 두 줄
- `webapp/e2e/specs/trading-workbench.spec.ts` — P24-11
- `webapp/e2e/specs/a11y.spec.ts` — 파일 수준 헬퍼 4개 · 구서버 에코 axe
- 단위 테스트 3파일 · UI-SPEC 부록 · 스크린샷 6장

## Decisions Made

- 카드 상태는 마스터 OFF 구서버도 같은 문구 — 「꺼짐」 으로 말하면 켤 수 있다는 인상을 주는데 구서버는 켜기가 막혀 있다.
- 열 패널은 켜진 카드 이름도 부른다(플랜 `<behavior>` 그대로) — 「이 열은 구서버라 끄기만」이라는 열 단위 사실이다.
- 세션 미준비가 구서버보다 앞선다(`disabled` → 패널 없음) — 끊김 중에는 끄기도 나가지 않아 「끄기만 가능」이 거짓이 된다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 테스트 정합] 24-12 폼 케이스 2건을 disabled + 패널 기대로 갱신**
- **Found during:** Task 2 RED
- **Issue:** 24-12 의 「켜는 스위치 → 전송 0 · 폼 맨 위 legacyReadOnly」 · 「구서버 선매수 켜기 → 폼 맨 위 구서버 문장」은 스위치를 눌러 폼 맨 위 한 줄이 서는 것을 단언했다. 이 플랜으로 그 스위치들이 `disabled` 라 눌러도 아무 일이 없고(전송 0 은 같다) 사유는 열 패널이 누르기 전에 말한다.
- **Fix:** 두 케이스를 「`toBeDisabled` · 눌러도 전송 0 · 열 패널 `lc-arm-blocked-text` = legacyReadOnly」로 바꿨다. 훅 전송 직전 가드(24-12)의 단위 테스트는 그대로다(방어선 둘 다 유지).
- **Files modified:** webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
- **Commit:** bf0d3d49

**2. [Rule 1 - 테스트 정확성] P24-11 말풍선 로케이터를 페이지 수준으로**
- **Found during:** Task 3
- **Issue:** 인라인 실패 말풍선은 Radix Popover(body 포털)라 `card.getByRole('alert')` 가 찾지 못했다.
- **Fix:** `page.locator('[data-slot="lc-failure-bubble"][role="alert"]')` 로 단언(주석 한 줄).
- **Commit:** 0f6c72a0

**Total deviations:** 2 auto-fixed (둘 다 테스트 측). **Impact:** 제품 동작은 플랜 그대로.

## Issues Encountered

None. (폰 밴드에서 매수주문 상태 「구서버 전략 · / 끄기만 가능」이 두 줄로 넘어간다 — UI-SPEC P24-7 「폰 밴드 긴 상태 문구 둘째 줄」 허용 범위이고 잘림 · 겹침은 없다.)

## Known Stubs

None.

## Items for 24-16 User Checkpoint

- 스크린샷 6장 채택: `.planning/phases/24-limitchaser-buy3/reference/24-13-legacy/{light,dark}-{344-buy,344-sell,992}.png` — 매수주문 상태 한 줄 · 경고 톤 · disabled 스위치 · 열 패널 한 줄(344 에서 상태가 두 줄로 넘어감 포함).
- 열 패널이 켜진 카드(매수주문 · 매도주문)까지 이름에 넣는 모양이 맞는가.
- disabled 스위치와 꺼진 스위치의 시각 차이가 작다(기존 `disabled` 스타일 재사용 — 시세 미수신과 같은 모양). 사유는 패널이 말한다.
- UI-SPEC 부록: buy3 선매수 금액 0 = 미입력(24-10 · D-03 재해석) · D-04a 금액 확정 경로 제거(24-12 이월 항목).

## Next Phase Readiness

- WR-02 전송 경로(24-12) + 화면 표시(24-13) 완료. 24-15(IN-01 폼 주석 등) · 24-16 체크포인트로 넘어갈 수 있다.
- 배포 없음 — 커밋만(push · relay · Vercel 은 메인 세션 몫). relay · shared 변경 0.

## Self-Check: PASSED

- FOUND: card-body.tsx · setting-group.tsx · limit-chaser-form.tsx · trading-workbench.spec.ts · a11y.spec.ts · 24-UI-SPEC.md · 스크린샷 6장
- FOUND commits: 1bfc4934 · 451d6ada · bf0d3d49 · 8c53d1b3 · 0f6c72a0
- Task 1 수용 기준 1/1/1/1 · Task 2 2(≥1)/0/1/1·1 · Task 3 png 6 · 일회성 스펙 없음(TMP_OK) · axe 1 · toBeDisabled 1 — 전부 PASS
