---
phase: 30-kb-ip-mac
plan: 08
subsystem: webapp-admin
tags: [shared, webapp, admin, order-ip-mac, display, gap-closure, e2e]
status: complete
gap_closure: true

requires:
  - phase: 30-02
    provides: "shared normalizeOrderIp · normalizeOrderMac · summarizeOrderEndpoint"
  - phase: 30-05
    provides: "IP/MAC 편집칸 · 검증 · 보내기 규칙(editSaveBodyOf) · 「변경 없음」"
  - phase: 30-06
    provides: "P30 E2E · ADMIN_USERS_FIXTURE_P30 · 목 PUT shared 정규화 저장"
provides:
  - "shared formatOrderIp · formatOrderMac — 87 정규화값 → 사람이 읽는 표기(형식 밖은 원문 · 왕복 항등)"
  - "KB 카드 읽기 줄 · 불일치 경고 줄 · 편집칸 초깃값이 IP 점표기 · MAC 콜론 대문자(D-17)"
  - "editSaveBodyOf IP/MAC 변경 판정 = 칸 값 · 초깃값 양쪽 정규화 비교"
  - "e2e 픽스처 ADMIN_ORDER_IP_DISPLAY · ADMIN_ORDER_MAC_DISPLAY"
affects: [30-07, 30-09, webapp-account-editor, webapp-e2e-admin]

actuals:
  tokens: 8206
  tasks: 3
  commits: 5
plan_head_before: e7c199324e702de1d9c4a1f3169eef1b2dc4daf9
plan_head_after: ec67bf3a9ddbd03bbb95ad1d415b0a8f0a5d672f

tech-stack:
  added: []
  patterns:
    - "표시 표기 변환은 렌더 자리(읽기 줄 · 불일치 줄 · 편집 초깃값)에서만 — summarize · sameValues · relay · server · 전송 · 비교는 정규화값"
    - "표시 변환 함수는 왕복 항등이 되는 값만 바꾼다(형식 밖은 원문) — 운영자가 서버에 실제로 있는 값을 본다"
    - "초깃값이 표시 표기가 되면 「보낼지」 비교는 양쪽을 같은 잣대(정규화, 실패면 원문)로"

key-files:
  created:
    - .planning/phases/30-kb-ip-mac/30-08-SUMMARY.md
  modified:
    - packages/shared/src/order-endpoint.ts
    - packages/shared/src/__tests__/order-endpoint.test.ts
    - webapp/src/components/admin/account-editor.tsx
    - webapp/src/components/admin/__tests__/account-editor.test.tsx
    - webapp/e2e/fixtures/admin.ts
    - webapp/e2e/specs/admin.spec.ts

key-decisions:
  - "formatOrderIp/Mac 은 trim 하지 않고 형식 밖(999999999999 · 소문자 · 이미 구분자 · 공백)은 원문 — 왕복 항등(normalize(format(v)) === v)이 되는 값만 바꾼다"
  - "editSaveBodyOf 비교는 지역 헬퍼 norm(normalize, raw) = normalize(raw) ?? raw 를 칸 값 · 초깃값 양쪽에 적용 — 표시 표기 초깃값을 87 값처럼 비교하지 않는다"
  - "저장 버튼 「바뀜」(endpointEdited)은 원문 trim 대 초깃값 비교 그대로 — 다른 표기로 다시 적으면 켜지고 누르면 「변경 없음」(UI-SPEC §3)"
  - "D-10 맞추기 저장은 칸 값(표시 표기)을 trim 만 해서 싣는다 — 서버가 정규화(D-07)"

patterns-established:
  - "e2e 픽스처는 87 값 상수(목 상태)와 *_DISPLAY 표시 상수(화면 기대)를 나란히 둔다"

requirements-completed: [IPMAC-02]

coverage:
  - id: D1
    description: "shared formatOrderIp · formatOrderMac — 점표기 · 콜론 대문자 변환 · 형식 밖 원문 · 왕복 항등"
    requirement: IPMAC-02
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/order-endpoint.test.ts#formatOrderIp · formatOrderMac — 표시 표기 (D-17)"
        status: pass
    human_judgment: false
  - id: D2
    description: "KB 카드 읽기 줄 · 불일치 경고 줄 표시 표기 · 87 값 형식 밖이면 원문"
    requirement: IPMAC-02
    verification:
      - kind: component
        ref: "webapp/src/components/admin/__tests__/account-editor.test.tsx#P30 읽기 카드 — IP/MAC 줄 · 불일치 · 이름 없음 (D-09 · D-10)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P30-E1 IP/MAC 읽기 줄 · 불일치 · 긴 이름 (390) · (1080)"
        status: pass
    human_judgment: false
  - id: D3
    description: "편집칸 초깃값 표시 표기 · 손대지 않은 IP/MAC 은 싣지 않음 · 다른 표기 같은 값 재입력은 「변경 없음」 · D-10 맞추기는 칸 값 원문 전송"
    requirement: IPMAC-02
    verification:
      - kind: component
        ref: "webapp/src/components/admin/__tests__/account-editor.test.tsx#P30 IP/MAC 편집칸 · 검증 · P30 보내기 규칙"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P30-E2 편집 → IP/MAC 저장 → 표시 표기 · 변경 없음 (390) · (1080)"
        status: pass
    human_judgment: false
  - id: D4
    description: "폰 390 에서 더 긴 MAC 표기(17자) 읽기 줄 · 불일치 줄 · 편집칸이 카드 안에 들어간다(E1 · E4 backstop)"
    requirement: IPMAC-02
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P30-E1 (390) backstop E1 · P30-E2 (390) backstop E4"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-10-11
---

# Phase 30 Plan 08: IP/MAC 표시 표기 (gap 1 · D-17) Summary

**shared `formatOrderIp` · `formatOrderMac`(형식 밖은 원문 · 왕복 항등)를 추가했다. KB 카드 읽기 줄 · 불일치 줄 · 편집 초깃값은 이제 `10.41.1.124` · `1C:FD:08:7D:97:8E` 로 보인다. 「보낼지 · 변경 없음」 판정은 양쪽을 정규화해서 비교하도록 바로잡았다. 전송 · summarize · relay · server 는 바꾸지 않았다.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-10-11T07:55:13Z
- **Completed:** 2026-10-11T08:02:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- **shared(Task 1):** `formatOrderIp` 는 입력이 정확히 ASCII 숫자 12자리이고 네 옥텟이 모두 0~255 일 때만, 앞자리 0 을 뗀 점표기로 바꾼다. `formatOrderMac` 는 입력이 정확히 대문자 16진 12자일 때만 두 자리씩 콜론으로 잇는다. 그 밖의 값은 원문을 그대로 돌려주고, 두 함수 모두 trim 하지 않는다. 파일 머리 주석의 소비자 목록에 「webapp 표시(D-17)」 를 더했다. `summarizeOrderEndpoint` 는 손대지 않았고, 기존 12건이 본문 수정 없이 통과한다.
- **읽기 줄(Task 1):** `OrderEndpointLine` 의 `<b>` 두 개가 `formatOrderIp(summary.orderIp)` · `formatOrderMac(summary.orderMac)` 를 그린다. JSDoc 의 「재정규화 금지」 는 「사람이 읽는 표기로 · 판정 · 비교는 정규화값」 으로 고쳤다.
- **불일치 줄 · 초깃값 · 비교(Task 2):** `ipmacMismatch` 의 set 갈래와 `openEdit` 초깃값을 표시 표기로 바꿨다. `editSaveBodyOf` 는 칸 값과 초깃값을 둘 다 `norm` 으로 정규화해 비교한다(실패면 원문). 그래서 계좌명만 바꾼 저장에는 orderEndpoint 가 실리지 않고, `010041001124` · `1cfd087d978e` 로 다시 적으면 요청 0건 · 「변경 없음」 이다. 87 IP 가 `999999999999` 인 계좌도 초깃값이 원문이고, 계좌명만 바꾼 저장에는 orderEndpoint 가 없다.
- **E2E(Task 3):** 표시 상수 `ADMIN_ORDER_IP_DISPLAY` · `ADMIN_ORDER_MAC_DISPLAY` 를 더했다(87 값 상수와 목 PUT 정규화 저장은 그대로). `IPMAC_SET`, E1 불일치 카드 읽기 줄, E2 두 번째 편집의 초깃값 · 재입력 표기를 새 표기로 바꿨다. 첫 저장의 PUT body 원문 단언은 그대로 두었다(D-07). spec 의 import 에는 표시 상수만 남겼다.
- **390 육안 확인:** `admin-ipmac-read-390` 에서 「주문자 IP 10.41.1.125 · MAC 1C:FD:08:7D:97:8F」 는 카드 안에 한 줄로 들어간다(감김 불필요). `admin-ipmac-edit-390` 에서는 MAC 칸에 `1C:FD:08:7D:97:8E` 17자가 잘리지 않고 다 보인다.

## Task Commits

1. **Task 1 (트레이서): shared formatOrderIp · formatOrderMac → 읽기 줄** — RED `c5f2c02e` (test) · GREEN `6c4286f5` (feat)
   - 트레이서 게이트: auto 모드 아님 · end-of-phase · 자동 verify 만 있음 → verify 를 다시 돌려 통과하고 확장으로 넘어갔다.
2. **Task 2: 불일치 줄 · 편집 초깃값 · 양쪽 정규화 비교** — RED `4de93249` (test) · GREEN `324015f7` (feat)
3. **Task 3: E2E P30 기대 문구 · 표시 상수** — `ec67bf3a` (test)

## Files Created/Modified

- `packages/shared/src/order-endpoint.ts` — `formatOrderIp` · `formatOrderMac` · 머리 주석 소비자 1줄
- `packages/shared/src/__tests__/order-endpoint.test.ts` — describe 「formatOrderIp · formatOrderMac — 표시 표기 (D-17)」 17건(변환 · 원문 · 왕복 항등)
- `webapp/src/components/admin/account-editor.tsx` — import · 읽기 줄 · `ipmacMismatch` · `openEdit` 초깃값 · `editSaveBodyOf` 양쪽 정규화 · JSDoc
- `webapp/src/components/admin/__tests__/account-editor.test.tsx` — 표시 표기 기대값 · 원문 그대로 2건 · 다른 표기 재입력 · D-10 전송 기대값
- `webapp/e2e/fixtures/admin.ts` — `ADMIN_ORDER_*_DISPLAY` · 주석
- `webapp/e2e/specs/admin.spec.ts` — `IPMAC_SET` · E1 · E2 기대 문구 · import

## Decisions Made

frontmatter `key-decisions` 참고. 핵심은 하나다. 「바뀜」(저장 버튼)은 원문 비교 그대로 두고, 「보낼지」 만 양쪽 정규화로 비교한다. 다른 표기로 다시 적으면 버튼은 켜지지만 누르면 「변경 없음」 이 된다(UI-SPEC §3 · Addendum A1).

## Verification

- 플랜 `<verification>`: shared build · shared vitest 536 passed · webapp vitest 3884 passed(+1 skipped — 원래 있던 것) · webapp · relay · server typecheck 통과(종료 코드 0).
- `git diff --stat 2234a1b5..HEAD -- relay/src server/src` 출력이 비어 있다. relay · server 소스는 바뀌지 않았다.
- Playwright `admin.spec.ts --workers=1`: P30 8 passed(setup 포함) → 전체 20 passed(P29 12 · P30 7 · setup). 실행 전 포트 3100 비어 있음 확인.

## Deviations from Plan

None - plan executed exactly as written.

(실행 메모 하나. Task 1 verify 의 `-t "P30 읽기 카드"` 범위에는 불일치 테스트도 들어간다. 그래서 Task 1 RED 에서 그 테스트의 **읽기 줄** 기대값(KB120 값)까지 표시 표기로 바꿨고, 같은 테스트의 경고 줄 문구는 Task 2 몫으로 남겼다. 플랜 범위 안의 분배라 deviation 은 아니다.)

## Issues Encountered

None.

## Next Phase Readiness

- 30-09(공유 계좌 안내 · D-18) 와 30-07(배포 · 인박스 닫기)이 남았다. 이 플랜은 webapp · shared 만 바꿨다. relay · server 소스는 그대로라 30-07 에서 이 플랜 때문에 relay 를 다시 배포할 필요는 없다. 웹은 push 하면 반영된다.

## Self-Check: PASSED

- 파일 6개 존재 · 커밋 c5f2c02e · 6c4286f5 · 4de93249 · 324015f7 · ec67bf3a 가 HEAD 조상이다.
- 수용 기준: `export function formatOrder` 2 · `formatOrderIp(summary.orderIp)` / `formatOrderMac(summary.orderMac)` / `formatOrderIp(m.orderIp)` / `formatOrderIp(endpoint.orderIp)` / 전송 원문 줄 각 1 · D-10 `toEqual({ orderIp: '10.41.1.124', orderMac: '1C:FD:08:7D:97:8E' })` · D-06 `toHaveBeenCalledTimes(0)` · 픽스처 표시 상수 2 · spec 불일치 문구 1 · `'010041001124'` 1. 전부 PASS.
