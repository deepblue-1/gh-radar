---
phase: 29-dma-multi-server-admin
plan: 39
subsystem: ui
tags: [react, relay, websocket, trading-workbench, g-1, order-server]

requires:
  - phase: 29-36
    provides: "relay 상태 프레임 accounts[] 의 serverKey · movedFrom · staleStrategies (shared RelayAccount)"
  - phase: 29-30
    provides: "workbench-display A 채택 — mockup-g1-workbench-order-server.html 변형 A"
  - phase: 29-42
    provides: "relay 가 order.server 프레임을 더는 보내지 않음 — shared 타입 정리를 29-39 에 남김"
provides:
  - "작업대 계좌 필 옵션 「 · 서버키」 꼬리표 + 고른 계좌 서버 키 칩(data-slot workbench-account-server)"
  - "상태줄 끄기 미확인 경고 줄(workbench-stale-strategies · 닫기 없음)"
  - "상태줄 되돌아옴 「클라(OCX) 대사」 안내 줄(workbench-moved-from · × 탭 로컬 dismiss)"
  - "WORKBENCH_STATUS_TEXT.staleStrategies / .movedFrom 문구 상수"
  - "옛 「재접속하면 적용」 배지 · orderServerNotices · order.server 파싱 · RelayOrderServerMsg/Broker 제거"
affects: [29-40, 29-44, ADMIN-06, trading-workbench]

actuals:
  tokens: 11100   # chars/4 over the realized diff (44,582 chars, .planning 제외)
  tasks: 2
  commits: 4
plan_head_before: 8e199f4757a624d16ff3efb61104381646d9f92b
plan_head_after: 5150ef0846a58cf868d38d58d163ec19abaf119e

tech-stack:
  added: []
  patterns:
    - "상태줄 보조 줄 — basis-full 경고색(--led-latent) 한 줄 · 해당 필드가 있을 때만 요소 생성"
    - "표시 전용 relay 계좌 필드 — 판정 근거로 쓰지 않음"

key-files:
  created: []
  modified:
    - webapp/src/components/trading/workbench/workbench-status-bar.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts
    - relay/tests/order-journal-source.test.ts
    - webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx
    - webapp/src/lib/__tests__/relay-socket.test.ts

key-decisions:
  - "서버 키 칩은 AccountPill 이 select 옆 형제(fragment)로 그린다 — 작업대 제목줄 flex-wrap 안에서 필 바로 옆, 폰에서 길면 다음 줄로 넘어간다(잘림 · 겹침 없음)"
  - "경고 · 안내 줄은 WorkbenchStatusBar 의 새 prop account(고른 계좌) 기준 · 상태줄 flex-wrap 끝에 basis-full 한 줄 · 색은 Admin 끄기 미확인 줄과 같은 --led-latent"
  - "되돌아옴 안내는 movedFrom 과 serverKey 를 둘 다 알 때만 그린다(relay 는 movedFrom 을 실을 때 serverKey 도 싣는다 — 29-36)"
  - "order.server 프레임은 이제 모르는 t — applyFrame default 로 상태 참조 불변"

patterns-established:
  - "relay 계좌 표시 필드(serverKey · movedFrom · staleStrategies)는 표시 전용 — 주문 허용 · 계좌 대조 · 전략 등록 판정에 쓰지 않는다"

requirements-completed: [ADMIN-06]

coverage:
  - id: D1
    description: "계좌 필 옵션 「 · 서버키」 꼬리표 + 필 옆 고른 계좌 서버 키 칩(채택 A · title 「이 계좌의 주문 서버」) · serverKey 없는 계좌는 둘 다 없음"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx#AccountPill — 계좌별 주문 서버 (29-39 · 채택 A)"
        status: pass
    human_judgment: false
  - id: D2
    description: "끄기 미확인 경고 줄 — 고른 계좌 staleStrategies 기준 · 수/「몇 건인지 모름」 · role status · 닫기 없음 · 다음 프레임에 없으면 사라짐"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx#WorkbenchStatusBar — 끄기 미확인 경고 (29-39 · gh-trade-84 ②(가))"
        status: pass
    human_judgment: false
  - id: D3
    description: "되돌아옴 「클라(OCX) 대사」 안내 줄 — × 로 (계좌, movedFrom) 탭 로컬 dismiss · 다른 from 이면 재표시 · 필드 없는 계좌는 줄 수 종전"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx#WorkbenchStatusBar — 되돌아옴 「클라 대사」 안내 (29-39 · gh-trade-84 ② 추가)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx#WorkbenchStatusBar — 필드 없는 계좌는 줄 수 종전 (29-39)"
        status: pass
    human_judgment: false
  - id: D4
    description: "소켓이 상태 프레임 계좌의 serverKey · movedFrom · staleStrategies 를 그대로 보관(옛 프레임도 그대로)"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-socket.test.ts#useRelayConnection — 상태 프레임 (D-36) > 29-39 G-1 — 계좌 항목의 serverKey · movedFrom · staleStrategies 를 그대로 보관한다"
        status: pass
    human_judgment: false
  - id: D5
    description: "옛 「재접속하면 적용」 배지와 원천(order.server 파싱 · 상태 · provider 기본값 · shared 타입) 제거 — 프레임은 모르는 t 로 무시"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-socket.test.ts#Phase 29-39 G-1 — 폐지된 order.server 프레임"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx#WorkbenchStatusBar — 옛 「재접속하면 적용」 배지 없음"
        status: pass
      - kind: other
        ref: "pnpm --filter @gh-radar/relay run typecheck && typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck"
        status: pass
      - kind: e2e
        ref: "playwright test e2e/specs/trading-workbench.spec.ts --workers=1 --grep-invert 'P20-3 최악값' (75 passed)"
        status: pass
    human_judgment: false
  - id: D6
    description: "폰 390 · 실제 계좌명 길이에서 계좌 필 + 서버 칩 줄바꿈 모양(칩이 다음 줄로 넘어가도 잘림 · 겹침 없음)"
    verification: []
    human_judgment: true
    rationale: "실제 계좌명 길이 · 실제 relay serverKey 로 렌더한 화면은 자동 단언이 없다 — 구조(flex-wrap · select max-w-full · 칩 shrink-0 nowrap)로만 확인했다"

duration: 11min
completed: 2026-10-11
status: complete
---

# Phase 29 Plan 39: 작업대 계좌별 주문 서버(채택 A) · 끄기 미확인 경고 · 클라 대사 안내 Summary

**작업대 계좌 필이 옵션마다 「 · KB120」 꼬리표와 고른 계좌 서버 키 칩을 보이고, 상태줄은 고른 계좌의 끄기 미확인 전략 경고와 되돌아옴 「클라(OCX) 대사」 안내를 한 줄씩 보인다. 지킬 수 없던 「재접속하면 적용」 배지와 order.server 원천은 shared 타입까지 모두 걷어냈다**

## Performance

- **Duration:** 11 min
- **Started:** 2026-10-10T16:40:33Z
- **Completed:** 2026-10-10T16:51:54Z
- **Tasks:** 2 (TDD — RED · GREEN 각 2커밋)
- **Files modified:** 9

## Accomplishments

- **채택 A 구현(목업 대비 차이 없음).** `AccountPill` 옵션 글자 = `accountLabelOf(번호, 이름) + " · " + serverKey`. 필 바로 옆에 고른 계좌의 서버 키 칩이 하나 붙는다. 칩 스타일은 목업 `.srvkey` 그대로다: mono · 10px · bold · h18 · r5 · `--muted` 바탕 · `--fg-2` 글자 · 좌우 6px · title 「이 계좌의 주문 서버」. `serverKey` 가 없는 계좌는 꼬리표도 칩도 없다. 닫힌 필에서 서버 키가 두 번 보이는 것도 채택대로 뒀다(29-30 「렌더 확인」).
- **목업에 없던 두 줄을 더했다(gh-trade-84 ② — 목업 뒤에 생긴 요구).**
  - ②(가) 끄기 미확인 경고: 「옛 서버 KB120 활성 전략 2건 — 끄지 못했어요 · 클라(OCX)에서 끄세요」. `count` 가 null 이면 「몇 건인지 모름」이다. `role="status"` 이고 닫기 버튼이 없다. relay 다음 상태 프레임에 필드가 빠질 때만 사라진다.
  - ② 추가 되돌아옴 안내: 「주문 서버 KB120 → KB121 — 옛 서버 잔고 · 미체결은 클라(OCX) 대사로 맞추세요」. ×(「안내 닫기」)를 누르면 그 (계좌, movedFrom) 조합은 이 탭에서 다시 보이지 않는다. 컴포넌트 로컬 `Set` 이고 저장하지 않는다.
  - 두 줄 모두 상태줄 flex-wrap 끝에 `basis-full` 경고색(`--led-latent`, Admin 끄기 미확인 줄과 같은 색) 한 줄이다. 고른 계좌에 해당 필드가 있을 때만 요소가 생기므로, 필드가 없으면 상태줄 자식 수가 종전과 같다(테스트로 단언).
- **옛 배지 제거.** 다음을 모두 지웠다: 상태줄 「주문 서버가 X 로 바뀜 — 재접속하면 적용」 배지 · `orderServerBadgeText` · `ORDER_SERVER_BROKERS` · props, 소켓 `orderServerNotices` 상태 · `order.server` case · `applyOrderServer` · 소켓 경계 비우기, provider 기본값, shared `RelayOrderServerMsg` · `RelayOrderServerBroker` · `RelayOutbound` 항목 · 재수출. 이제 그 프레임은 모르는 `t` 라서 상태 참조가 바뀌지 않는다.
- 소켓은 이미 `frame.accounts` 를 그대로 보관하고 있었다. 세 필드 보존은 코드 변경 없이 특성 테스트로 잠갔다.

## Task Commits

1. **Task 1 (tracer): 상태 프레임 계좌 필드 → 상태줄 채택 A · 경고 · 안내**
   - RED `cdcc4828` (test) · GREEN `b32ef150` (feat)
   - 트레이서 게이트: interactive · end-of-phase · `<automated>` 뿐이므로 verify 를 다시 돌렸고 green 이었다 → 확장(Task 2)으로 넘어갔다.
2. **Task 2: 옛 배지 · order.server 원천 제거**
   - RED `1d47e5d2` (test) · GREEN `5150ef08` (feat)

**Plan metadata:** (이 SUMMARY 커밋)

## TDD Gate Compliance

- **Task 1 RED:** 대상 테스트는 「AccountPill — 계좌별 주문 서버 (29-39 · 채택 A) > 옵션 글자 = …」 이다. junit 리포트를 `check tdd-red-evidence` 에 넣어 **RED_EVIDENCE_OK** (target_test_failed)를 받았다(189 중 10 실패).
  - 의미 판정: 대상은 계획한 단언에서 실패했다(옵션 글자 `['1 · 홍길동','2 · 단기']` ≠ 꼬리표 포함). 문구 상수 두 케이스는 `WORKBENCH_STATUS_TEXT` 미존재 TypeError 로 실패했는데, 아직 없는 API 이므로 의도한 RED 다.
  - 소켓 보존 케이스와 「줄 수 종전」 케이스는 RED 에서 이미 green 이었다(종전 동작을 잠그는 특성 테스트). 그래서 대상으로 삼지 않았다.
- **Task 1 GREEN:** 대상 2파일 189 passed · trading-workbench 단위 136 passed · webapp typecheck green.
- **Task 2 RED:** 대상 테스트는 「Phase 29-39 G-1 — 폐지된 order.server 프레임 > 옛 「주문 서버 바뀜」 프레임은 모르는 t 로 무시한다」 이다. **RED_EVIDENCE_OK** 를 받았다.
  - 의미 판정: 상태 참조가 바뀌어 `toBe(before)` 단언에서 실패했다. 계획한 이유 그대로다. 상태줄 「`orderServerBadgeText` 모듈에 없음」 도 실패했다.
- **Task 2 GREEN:** 단위 3파일 318 passed · relay typecheck · typecheck:tests · webapp typecheck green · relay `order-journal-source` 4 passed.
- REFACTOR 커밋은 없다(정리할 것 없음).

## Files Created/Modified

- `webapp/src/components/trading/workbench/workbench-status-bar.tsx`: 꼬리표 · 칩 · 경고/안내 줄 · `WORKBENCH_STATUS_TEXT` · `account` prop 추가. 옛 배지와 ⑦ 머리 주석 정리(「G-1 에서 없어짐」 한 줄).
- `webapp/src/components/trading/workbench/trading-workbench.tsx`: 고른 계좌를 상태줄 `account` 로 넘긴다. `orderServerNotices` 전달 제거.
- `webapp/src/lib/use-relay-socket.ts`: 표식 타입 · 상태 · 파싱 · 적용 함수 · 소켓 경계 비우기 제거.
- `webapp/src/lib/relay-provider.tsx`: Provider 밖 기본값 제거.
- `packages/shared/src/relay.ts` · `index.ts`: `RelayOrderServerMsg` · `RelayOrderServerBroker` · union 항목 · 재수출 제거. 변경 이력 줄은 「G-1 에서 없어짐」 으로 바꿨다.
- `relay/tests/order-journal-source.test.ts`: 「order.server 0건」 단언은 `(m.t as string) === "order.server"` 로 센다(타입 밖 글자).
- 테스트 2파일: 위 behavior 케이스 추가, 옛 배지 · 표식 단언 제거.

## Decisions Made

- 칩은 `AccountPill` 이 select 의 형제로 그린다(fragment). 작업대 제목줄(`flex-wrap`)에서 필 바로 옆에 서고, 폭이 모자라면 다음 줄로 넘어간다.
- 경고 · 안내 줄의 기준은 상태줄의 새 prop `account`(고른 계좌)다. 표시 전용이고 판정에는 쓰지 않는다.
- 안내 줄은 `movedFrom` 과 `serverKey` 를 둘 다 알 때만 그린다(「A → B」 를 반쪽으로 그리지 않음).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] relay 테스트의 「order.server 0건」 비교가 타입 제거 뒤 TS2367 이 된다**
- **Found during:** Task 2
- **Issue:** `RelayOutbound` 에서 `"order.server"` 가 빠지면 `m.t === "order.server"` 는 겹침 없는 비교가 되어 `typecheck:tests` 가 실패한다.
- **Fix:** `(m.t as string) === "order.server"` 로 바꿨다. 단언 의미(그 프레임 0건)는 같다. 이 파일은 플랜 files_modified 밖이다.
- **Files modified:** relay/tests/order-journal-source.test.ts
- **Verification:** relay typecheck:tests green · 해당 테스트 4 passed
- **Committed in:** 5150ef08

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** 타입 제거에 따른 필수 조정이다. 범위는 넓히지 않았다.

## Issues Encountered

- **e2e `trading-workbench.spec.ts` 전체 실행: 65 passed · 1 failed(P20-3 최악값) · 10 did not run(serial).**
  - 실패 메시지는 「344 카드 · 수동 pane — 내용이 상자를 넘친 요소 `{ span, " · 위탁종합", over 17 }`」 이다. 수동주문 폼 「주문계좌」 행이 넘친 것이고, 이 플랜이 건드린 파일(상태줄 · 계좌 필 · 소켓)과 닿지 않는다.
  - 같은 실패가 quick-261011-0yb SUMMARY(87-91행)에 이미 재현 · 기록돼 있다. 기존 결함이고 범위 밖이라 고치지 않았다.
  - `--grep-invert "P20-3 최악값"` 재실행은 **75 passed** 였다.
- e2e spec 에는 29-22 배지 시나리오가 없었다. 그래서 `webapp/e2e/specs/trading-workbench.spec.ts` 는 바꾸지 않았다.
- 실행 브랜치는 master 다. `git.base-branch --is-protected master` 는 true 를 돌렸지만, 오케스트레이터가 master 위 순차 실행을 명시했다(사용자 규칙 「작업은 master 에서」). push 는 하지 않았다.
- WINDOWS 원장에는 쓰지 않았다. 새 스텁 · 건너뛴 테스트가 없다. P20-3 은 이 플랜의 결함이 아니다.

## Known Stubs

없음.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-1 작업대 쪽(채택 A) · gh-trade-84 ②(가) 보조 경고 · ② 추가 「클라 대사」 안내 · WR-05 화면 문구 해소가 끝났다.
- ADMIN-06 문구 정정(G-1 대체)은 29-40 의 REQUIREMENTS 등록 몫이다. 이 플랜 frontmatter 의 spec-less probe 가정 그대로다.
- 폰 390 실제 계좌명 길이에서 칩이 줄바꿈되는 모양은 사람이 볼 항목이다(coverage D6).

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-11*

## Self-Check: PASSED
