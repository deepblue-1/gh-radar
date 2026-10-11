---
phase: 29-dma-multi-server-admin
plan: 55
subsystem: webapp-admin · relay-healthz
tags: [webapp, admin, relay, healthz, dma, g-1, order-server, gap-closure, gc-06, gc-13, tdd, tracer]
requires:
  - phase: 29-46
    provides: "shared resolveEffectiveOrderServer({ designated, defaultKey, registered }) · EffectiveOrderServer.via — relay 와 같은 규칙 한 벌"
  - phase: 29-38
    provides: "Admin 계좌 줄 OrderServerControl(채택 A 세그먼트 · 꺼진 칸 · 꺼진 지정 경고 줄)"
  - phase: 29-43
    provides: "healthz accountOrderServers.<키> = { accounts, alerting, staleAccounts } · buildAccountOrderServers"
provides:
  - "Admin OrderServerControl 이 shared resolveEffectiveOrderServer 로 판정 — 등록 = 켜진 active 등록 서버 · 「(기본)」 은 via default 일 때만 · 기본 미등록(여러 대)이면 「기본」 칸 disabled · 지정 없으면 경고 한 줄(data-slot admin-order-server-no-default)"
  - "ACCOUNT_EDITOR_TEXT.orderServerNoDefault(defaultKey) — 「기본 KB120 에 등록되지 않은 계좌 — 주문 서버를 고르세요」"
  - "relay OrderApiDeps.serverDisabled?(serverKey) · AccountOrderServerHealth.disabled?: true — 꺼진 서버 항목은 alerting false · disabled true"
  - "relay index createOrderApi({ …, serverDisabled: key => registry.get(key)?.enabled !== true })"
affects: [ADMIN-09, ADMIN-06, ADMIN-04]
actuals:
  tokens: 5500
  tasks: 2
  commits: 4
plan_head_before: 0960883a33392dd9c6d0ab707a6b50b604957c5c
plan_head_after: 5d88936f6e9196101b972bbccdb74148bf002e3b
tech-stack:
  added: []
  patterns:
    - "Admin 화면도 shared 규칙 함수를 직접 부른다 — 컴포넌트는 등록 목록(켜진 active 행)과 지정(켜진 등록 서버일 때만)만 넣는다"
    - "healthz 본문 전용 항목의 꺼짐 표시는 선택 키(disabled?: true) — 켜진 항목 모양은 그대로라 기존 소비자 무영향"
key-files:
  created:
    - .planning/phases/29-dma-multi-server-admin/.red/29-55-task1-red.json
    - .planning/phases/29-dma-multi-server-admin/.red/29-55-task2-red.json
  modified:
    - webapp/src/components/admin/account-editor.tsx
    - webapp/src/components/admin/__tests__/account-editor.test.tsx
    - relay/src/order/order-api.ts
    - relay/src/index.ts
    - relay/tests/order-api.test.ts
key-decisions:
  - "29-55: Admin 계좌 줄의 「(기본)」 꼬리표 · 「기본」 칸 잠금 · 미등록 경고는 shared resolveEffectiveOrderServer 결과로만 정한다 — 등록 = 켜진 active 등록 서버, 지정 = 지금 값(누른 값 포함)이 그 안에 있을 때만"
  - "29-55: 「기본」 칸 잠금 조건 = 기본 키가 없거나 켜진 등록 목록에 없음. 잠긴 칸이 지금 값이면 꺼진 지정과 같은 ORDER_ITEM_OFF_ON(켜진 채 경고색)"
  - "29-55: 1대 갈래에서 지정 = 기본인 경우 꼬리표는 붙지 않는다(via designated) — 플랜 문장 「via === default 일 때만」 그대로. 운영(지정 0)에는 해당 없음"
  - "29-55: healthz serverDisabled 는 레지스트리에서 빠진 서버도 꺼짐으로 본다(registry.get(key)?.enabled !== true — 플랜 결선 문장 그대로)"
patterns-established:
  - "유효 주문 서버를 그리는 새 화면은 shared resolveEffectiveOrderServer 를 부르고, 등록 원천만 정한다"
requirements-completed: [ADMIN-09, ADMIN-06, ADMIN-04]
coverage:
  - id: D1
    description: "트레이서(GC-06 Admin) — KB121 에만 등록된 지정 없는 계좌 줄 = 「주문 서버 KB121」(「(기본)」 없음 · 경고 없음)"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/account-editor.test.tsx#GC-06: 등록 서버 1대가 기본 서버가 아니면 … 「(기본)」 없음 · 경고 줄 없음"
        status: pass
    human_judgment: false
  - id: D2
    description: "등록 2대 [KB121, KB122] · 기본 KB120 미등록 → 「기본 · KB120」 칸 disabled(클릭해도 PUT 0) · 경고 한 줄 · KB121 고르면 PUT 1건 → 경고 사라짐 · 지정 있으면 경고 없음"
    requirement: ADMIN-09
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/account-editor.test.tsx#GC-06: 등록 2대 [KB121, KB122] · 기본 KB120 미등록 …"
        status: pass
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/account-editor.test.tsx#GC-06: 기본 미등록이어도 지정(KB122)이 있으면 경고 줄 없음"
        status: pass
    human_judgment: false
  - id: D3
    description: "운영 보존(Admin) — 기본 서버에 등록된 계좌는 「기본」 칸 잠금 없음 · 1대 기본 = 「주문 서버 KB120(기본)」 · 29-38 기존 케이스 무수정 green"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/account-editor.test.tsx#AccountEditor — 계좌 주문 서버(29-38 채택 A) (기존 10건 + 운영 보존 1건)"
        status: pass
    human_judgment: false
  - id: D4
    description: "GC-13 — healthz accountOrderServers 의 레지스트리 꺼진 서버(지정 · 끄지 못한 전략 갈래 모두) = { …, alerting: false, disabled: true } · 켜진 항목 모양 그대로 · 미주입 종전 · 비면 최상위 키 없음"
    requirement: ADMIN-04
    verification:
      - kind: integration
        ref: "relay/tests/order-api.test.ts#Phase 29-43 accountOrderServers > GC-13 (3건)"
        status: pass
      - kind: integration
        ref: "pnpm --filter @gh-radar/relay exec vitest run --maxWorkers=2 (57 파일 · 1470 green)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Admin 계좌 줄의 잠긴 「기본」 칸 · 경고 줄이 실제 화면에서 목업 A 의 꺼진 칸 · 경고 줄과 같은 모양인지(줄바꿈 · 색)"
    verification: []
    human_judgment: true
    rationale: "스타일은 기존 ORDER_ITEM_OFF(_ON) · WARN_LINE 상수 재사용으로 jsdom 테스트가 class 만 확인한다 — 실제 렌더 모양은 사람이 Admin 편집 시트에서 본다(이 플랜은 화면 캡처를 만들지 않았다)"
duration: 5min
completed: 2026-10-11
status: complete
---

# Phase 29 Plan 55: Admin 계좌 줄 진짜 주문 서버 · healthz 꺼진 서버 표시 (GC-06 Admin · GC-13) Summary

**Admin 계좌 편집기 `OrderServerControl` 이 relay 와 같은 shared `resolveEffectiveOrderServer` 로 주문 서버를 그린다. KB121 에만 등록된 계좌가 더는 「KB121(기본)」 으로 보이지 않고, 기본 서버에 없는 계좌는 「기본」 칸이 잠기며 경고 한 줄이 뜬다. healthz `accountOrderServers` 는 레지스트리 꺼진 서버를 `alerting: false, disabled: true` 로 싣는다.**

## Performance

- **Duration:** 약 5 min
- **Started:** 2026-10-11T01:41:21Z
- **Completed:** 2026-10-11T01:46:12Z
- **Tasks:** 2 (둘 다 TDD — RED/GREEN 커밋 각 2)
- **Files modified:** 7 (코드 5 · RED 증거 2)

## Accomplishments

- **GC-06 Admin 표시(트레이서).** `OrderServerControl` 은 판정을 직접 하지 않고 shared 규칙을 부른다.
  - 넣는 값: 등록 = 켜진 active 등록 서버, 지정 = 지금 값(누른 값 포함)이 그 안에 있을 때만, 기본 = 계좌 뷰의 기본 서버.
  - 1대 갈래: 「(기본)」 은 결과가 `via === "default"` 일 때만 붙는다. KB121 에만 등록된 계좌는 「주문 서버 KB121」 이다.
  - 여러 대 갈래: 기본 키가 켜진 등록 목록에 없으면 「기본」 칸이 `disabled` · `data-off` 다. 결과가 없으면(지정 없음) 경고 한 줄 「기본 KB120 에 등록되지 않은 계좌 — 주문 서버를 고르세요」 이 뜬다. 다른 칸을 고르면 `PUT …/order-server` 1건이 가고 경고가 바로 사라진다.
  - 새 컨트롤은 없다. 잠긴 칸 · 경고 줄은 종전 꺼진 칸 스타일(`ORDER_ITEM_OFF(_ON)`)과 `WARN_LINE` 을 다시 쓴다. 저장 요청 모양도 그대로다.
- **GC-13 healthz.** `serverDisabled?(serverKey)` 가 참인 서버는 두 갈래(지정 · 끄지 못한 전략) 모두 `{ …, alerting: false, disabled: true }` 다. 켜진 서버 항목에는 `disabled` 키가 없다. 미주입이면 종전과 같고, 비면 최상위 키를 생략한다(29-43 규율). index 결선은 `serverDisabled: (key) => registry.get(key)?.enabled !== true` 이고, 29-46 `mappingLoaded` 결선은 손대지 않았다.
- **운영 보존.** 지금 운영(지정 0 · 계좌는 기본 서버에만 등록)에서 Admin 계좌 줄과 healthz 본문은 바뀌지 않는다.
  - Admin: 운영 보존 케이스 · 29-38 기존 케이스 무수정 green. e2e 픽스처(KB 계좌 = KB120 + KB121 · 교보 = KYOBO119 1대 기본)도 영향 밖이다.
  - healthz: 29-43 기존 4건 무수정 green.

## Task Commits

1. **Task 1 RED: GC-06 Admin 실패 테스트** — `b58378d5` (test)
2. **Task 1 GREEN: Admin 계좌 줄 진짜 소유 서버 · 기본 칸 잠금** — `07dccdb8` (fix)
3. **Task 2 RED: GC-13 healthz 실패 테스트** — `15cbfcaa` (test)
4. **Task 2 GREEN: healthz 꺼진 서버 disabled · 경보 아님** — `5d88936f` (fix)

REFACTOR 없음. 트레이서 게이트(interactive · end-of-phase · automated 만)는 Task 1 verify 를 다시 돌려 green 을 확인한 뒤 Task 2 로 넘어갔다.

## TDD Gate Compliance

- **Task 1 RED** `b58378d5`: 증거는 `.red/29-55-task1-red.json` 이다(JUnit · `RED_EVIDENCE_OK`). 27 수집 · 실패 3 · errors 0 이다.
  - 목표 「1대 비기본 → (기본) 없음」 은 `not.toHaveTextContent('(기본)')` 에서 실패했다. 종전 1대 분기가 `current === null` 이면 무조건 꼬리표를 붙였기 때문이다.
  - 같은 미구현으로 기본 칸 잠금 2건이 `toBeDisabled` 에서 실패했다. 로드 · 문법 오류는 없다. 운영 보존과 29-38 기존 케이스는 처음부터 green 이었다.
- **Task 2 RED** `15cbfcaa`: 증거는 `.red/29-55-task2-red.json` 이다(JUnit · `RED_EVIDENCE_OK`). 62 수집 · 실패 2 · errors 0 이다.
  - 목표 「꺼진 서버 지정 → disabled」 는 `toEqual` 에서 실패했다(alerting true · disabled 없음).
  - 「끄지 못한 전략만 · 꺼짐」 도 같은 이유로 실패했다. 「미주입 → 종전」 과 29-43 기존 4건은 처음부터 green 이었다.
  - 실행 로그의 `journalAlerting` TypeError 는 기존 brokers 케이스의 의도된 500 로그다. 이 플랜과 무관하다.
- **GREEN** `07dccdb8` · `5d88936f`: 커밋 접두는 플랜 action 예시대로 `fix(29-55)` 다. TDD 게이트의 `feat(...)` 패턴 대신 쓴 것이고, 29-45 · 29-46 · 29-48 과 같은 관례다.

## Verification

- Task 1 verify: shared build · webapp typecheck · `account-editor` + `user-sheet` → 2 파일 45 green
- Task 2 verify: relay typecheck · typecheck:tests · `order-api` + `account-order-servers` → 2 파일 80 green(이름에 「GC-13」 3건)
- 끝에 한 번(`--maxWorkers=2`): relay 전체 57 파일 1470 green · webapp `src/components/admin` 9 파일 133 green
- 수용 기준 grep(account-editor.tsx):
  - `resolveEffectiveOrderServer` = 4 · `orderServerNoDefault` = 2 · `admin-order-server-no-default` = 1
- 수용 기준 grep(relay):
  - order-api `serverDisabled` = 5 · `disabled?: true` = 1
  - index `serverDisabled` = 1 · `mappingLoaded` = 1

## Files Created/Modified

- `webapp/src/components/admin/account-editor.tsx` — shared 규칙 import · `orderServerNoDefault` 문구 · 「(기본)」 조건 · 「기본」 칸 잠금 · 경고 줄 · 머리 주석 규칙 문장(GC-06)
- `webapp/src/components/admin/__tests__/account-editor.test.tsx` — 29-38 describe 끝에 GC-06 4건(1대 비기본 · 2대 기본 미등록 · 지정 있음 · 운영 보존)
- `relay/src/order/order-api.ts` — `serverDisabled?` deps · `AccountOrderServerHealth.disabled?: true` · `buildAccountOrderServers` 꺼짐 갈래 · 머리 · 본문 타입 주석
- `relay/src/index.ts` — `createOrderApi` 에 `serverDisabled` 결선 1줄 + 주석
- `relay/tests/order-api.test.ts` — 하네스 `serverDisabled` 통과 · 29-43 describe 에 GC-13 3건

## Decisions Made

- 판정 원천은 shared 규칙 하나다(prohibitions). 컴포넌트는 등록 목록과 지정만 거른다. 꺼진 지정은 relay 처럼 무시한다(designated = null).
- 1대 갈래는 경고 줄을 띄우지 않는다(behavior). 유일 등록 서버가 꺼진 경우에는 꼬리표 없이 그 키만 보인다.
- 기본 키가 없는 증권사(null)의 경고 문구는 「기본 주문 서버가 없는 계좌 — 주문 서버를 고르세요」 다. 플랜 문구 템플릿이 키를 전제해서 둔 null 갈래다.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 배포 안 함 — 코드 · 테스트만. relay healthz 와 Admin 화면은 다음 relay 배포 · webapp push 때 반영된다(운영 모양에서는 무변경).
- 여러 대 등록 · 꺼진 지정과 기본 미등록이 겹치면 경고 두 줄(「KB121 꺼짐 — 기본 KB120 으로」 + 미등록 경고)이 함께 뜬다. 앞 줄은 29-38 문구 그대로라 기본 미등록 사실과 어긋날 수 있다. 운영에는 없는 모양이라 고치지 않았다.

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-11*
