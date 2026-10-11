---
phase: 18-gh-trade-ui-nxt-vi
plan: 34
subsystem: webapp-relay-order-lock
tags: [gap-closure, round-4, relay-provider, manual-order, result-unknown, tracer, R3-WR-02, R3-IN-01, R3-IN-02]
status: complete
gap_closure: true

requires:
  - phase: 18-gh-trade-ui-nxt-vi (18-30)
    provides: "GC-WR-03 — 작업대 페이지 단위 결과 모름 잠금 · 잠금 문구 RESULT_UNKNOWN_LOCKED_TEXT · ✕ unknown 다이얼로그 (이 플랜이 앱 수명으로 올리는 출발점)"
  - phase: 18-gh-trade-ui-nxt-vi (18-32)
    provides: "depends_on — 직전 웹앱 기준선(1454)"
provides:
  - "RelayProvider.orderLocks (ReadonlyMap<strategyKey, OrderLockKind>) · export type OrderLockKind = 'in-flight' | 'result-unknown' · EMPTY_ORDER_LOCKS 폴백"
  - "번역기 등록 규칙: 실제로 보내는 신규 · 정정만 진행 중 +1 → 결과 도착 시 한 액션으로 정산(timeout 이면 결과 모름) → 그 뒤 결과 반환. 취소 · 형식 오류 미등록. 사용자 id 변경 = 초기화 + 세대"
  - "ManualOrderForm 컨텍스트 잠금(로컬 blocked 제거) — 작업대 카드 · 호가 탭 공용 · 「주문 전송 중…」 = submitting ∨ in-flight"
  - "TradingWorkbench closeCard 가 Provider 잠금을 읽음 · CLOSE_UNKNOWN_BODY 새 문구(해제 규칙)"
  - "e2e GC6 · relay-provider ⑩-a~i · ⑧ 확장 · 폼 describe 「잠금 원천 = RelayProvider」"
affects: [18-35 (18-30 prop 경로 · 작업대 페이지 집합 제거), 18-36, gsd-verifier -R4]

actuals:
  tokens: 16400
  tasks: 3
  commits: 3
plan_head_before: a1dd26f390ccb61e674c2dcfcec2231957070734

tech-stack:
  added: []
  patterns:
    - "주문 잠금은 주문을 보내는 바로 그 번역기(RelayProvider.sendOrder)에서 등록 — 모든 표면이 한 함수를 지나므로 표면별 배선이 필요 없다"
    - "진행 중 → 결과 모름을 한 리듀서 액션으로 옮기고, 결과 반환 전에 dispatch — 호출자의 await 뒤 렌더가 이미 새 잠금을 본다(틈 없음)"
    - "사용자 경계 세대 ref — 로그아웃 순간의 단절 정산이 다음 사용자의 잠금이 되지 않게"

key-files:
  created:
    - .planning/phases/18-gh-trade-ui-nxt-vi/18-34-SUMMARY.md
  modified:
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/components/trading/card/manual-order-form.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/__tests__/manual-order-form.test.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
    - webapp/src/lib/__tests__/relay-provider.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
    - .planning/phases/18-gh-trade-ui-nxt-vi/18-CONTEXT.md
    - .planning/phases/18-gh-trade-ui-nxt-vi/18-R3-gap-mockup.html

key-decisions:
  - "결과 모름 잠금 = 앱 수명(RelayProvider · strategyKey 키) — 해제는 로그아웃(사용자 id 변경) · 새로고침(Provider 재생성)뿐. 18-30 의 「relay 컨텍스트로 올리지 않는다」 금지를 사용자 결정 1 로 대체"
  - "잠금 등록은 신규 · 정정만 — 취소 timeout 은 결과 배너만(사용자 결정 2 · T-18-142)"
  - "전송 중(응답 전) 신규 · 정정도 같은 키를 in-flight 로 잠금, 같은 키 진행 중은 참조 계수(둘 다 끝나야 해제)"
  - "잠금은 메모리 상태 — 브라우저 저장소 미사용(키에 계좌번호), 해제 버튼 · 타이머 · 에코 해제 없음"

requirements-completed: []

duration: 10min
completed: 2026-09-22
---

# Phase 18 Plan 34: 결과 모름 잠금 앱 수명화 Summary

「결과 모름」 주문 잠금을 `/trading` 페이지 상태에서 루트 `RelayProvider` 로 올렸다. 이제 번역기가 신규 · 정정 요청만 「진행 중 → 결과 모름」 으로 한 액션에 등록하고, 작업대 카드와 종목상세 호가 탭이 같은 `strategyKey` 로 이 잠금을 읽는다. 잠금은 로그아웃과 새로고침에만 풀린다.

## Performance

- **Duration:** 약 10분
- **Tasks:** 3/3
- **Files modified:** 9

## Accomplishments

- **R3-WR-02:** `/trading` 에서 결과 모름이 난 뒤 사이드바로 `/me` 에 다녀와 같은 종목 카드를 다시 열어도 4버튼이 잠겨 있다. 같은 계좌 · 종목 · 거래소의 호가 탭 폼도 잠기고 3-b 원문을 보여 준다(e2e GC6).
- **R3-IN-01:** 취소 timeout 은 잠금을 등록하지 않는다. Provider(⑩-d)와 폼(취소 timeout → 콜백 0회 · 배너만)이 이를 단언한다.
- **R3-IN-02:** 전송 중인 신규 · 정정이 있으면 그 키가 `in-flight` 로 잠긴다. 그래서 전송 중에 ✕ 로 닫았다가 다시 열어도 새 폼은 잠긴 채 「주문 전송 중…」 을 보여 준다. timeout 이 나면 같은 렌더 안에서 `result-unknown` 으로 넘어간다(⑩-b 가 렌더 이력으로 틈 없음을 단언).
- 로그아웃하면 잠금이 비워지고 세대가 바뀐다. 로그아웃 순간의 단절 정산은 다음 사용자의 잠금이 되지 않는다(⑩-i · T-18-141).
- `CLOSE_UNKNOWN_BODY`, CONTEXT D-27 R4 보강, R3 목업의 ② 본문 · ③ 설명이 모두 같은 해제 규칙을 말한다.

## Task Commits

1. **Task 1: [tracer] Provider 잠금 → 두 표면의 폼 → 작업대 ✕ · 새 본문 → e2e GC6** — `3e59a73` (fix)
2. **Task 2: Provider 잠금 수명 회귀 ⑩ 계열 · ⑧ 확장 · 폼 잠금 원천** — `208b276` (test)
3. **Task 3: CONTEXT D-27 R4 보강 · R3 목업 ② ③ 문구 정합** — `0cdd06f` (docs)

## Tracer 게이트 · 수정 전 RED 증거

- 수정 전 코드에서 GC6 실행: Task 1 의 src 3파일(relay-provider · manual-order-form · trading-workbench)만 HEAD(a1dd26f) 버전으로 되돌리고 새 spec 으로 돌렸다. 결과는 **「/me 복귀 뒤 재추가 카드 「매수」 enabled」 로 실패**(`trading-workbench.spec.ts:978` `toBeDisabled` — Received: enabled). 확인 후 새 코드로 되돌렸다.
- 새 코드: `playwright test trading-workbench -g "GC5|GC6"` → 3 passed(setup 포함 · GC5 · GC6). tracer 검증을 끝까지 다시 돌린 결과도 통과했다.
- Task 2 변이 확인(되돌림 확인 완료): 취소 제외를 빼면 ⑩-d · ⑩-f 가 실패한다. 세대 검사를 빼면 ⑩-i, 참조 계수를 불리언으로 바꾸면 ⑩-g 가 실패한다. 정산을 「해제 후 다음 tick 에 결과 모름」 으로 쪼개면 ⑩-b(틈)를 포함한 5건이 실패한다.

## 검증 결과

- `pnpm --filter @gh-radar/webapp run typecheck`: 클린(tsc + e2e tsconfig)
- `vitest run relay-provider manual-order-form trading-workbench card-body stock-orderbook-section`: 181 passed(Task 1 시점)
- `vitest run relay-provider`: 38 passed · `vitest run manual-order-form`: 60 passed(Task 2 뒤)
- webapp 전량: **92 files · 1470 passed · 1 skipped** (기준선 1454 이상)
- `playwright test trading-workbench -g "GC5|GC6"`: 3 passed
- `playwright test orderbook`: 12 passed(테스트 7 결과 모름 포함)
- eslint(변경 파일): 경고 0
- 수용 기준 grep: `orderLocks` 3파일 모두 있음(5 · 3 · 3) · `setBlocked` 0 · 「로그아웃하거나 새로고침하면 풀려요」 1 · relay-provider 의 `localStorage|sessionStorage` 0 · `stock-orderbook-section.tsx` diff 없음
- Task 3 grep: `R4 보강 (2026-09-22` 1 · 목업의 새 본문 2 · 3-b 원문 1 · numstat 기준 CONTEXT 는 1 추가 · 0 삭제, 목업은 3 · 3

## 바꾼 기존 테스트 케이스 (manual-order-form.test.tsx)

| 옛 케이스 | 새 케이스 | 이유 |
|---|---|---|
| 「응답 timeout → … 버튼이 잠긴다」 | 이름 끝에 「(Provider 키 잠금)」 · `lockMock.locks` 에 요청 키가 `result-unknown` 으로 들어갔는지 추가 단언 | 로컬 잠금이 없어지고 잠금 원천이 Provider 가 됐다. 모의 `useRelayContext` 의 `providerSend` 가 신규 · 정정 timeout 에서 Provider 등록을 흉내 낸다 |
| 「취소 timeout → 원주문 행의 키(NXT)로 1회」 | 「취소 timeout → 콜백 0회 · 배너만 · 버튼 잠기지 않음 (R3-IN-01 · 사용자 결정 2)」 | 사용자 결정 2 — 취소는 잠그지 않는다 |
| 「prop 없음(호가 탭) → 기존 로컬 잠금 · 종목 전환 시 해제 그대로 · 잠금 문구 없음」 | 「컨텍스트 키 잠금(호가 탭) — 다른 종목으로 바꾸면 그 키는 잠기지 않고, 원래 종목으로 돌아오면 다시 잠겨 있다」 | 호가 탭도 Provider 키 잠금을 읽는다. 종목 전환은 잠금을 푸는 것이 아니라 다른 키를 읽는 것이다 |

## Decisions Made

- 이 플랜은 18-30 의 prohibition 「잠금 상태를 relay 컨텍스트로 올려 호가 탭까지 바꾼다」 를 **사용자 결정 1(2026-09-22)** 로 뒤집는다. 이 사실은 CONTEXT D-27 R4 보강 줄과 이 SUMMARY 에 적었다. 18-30 의 PLAN · SUMMARY 는 고치지 않았다.
- 18-30 의 prop 경로(`resultUnknownLocked` · `onResultUnknown`)와 작업대 페이지 집합은 계획대로 남겼다. 18-35 가 걷어낸다. 이 플랜 동안 두 경로는 같은 규칙(신규 · 정정만)으로 잠그기만 한다. 폼의 `onResultUnknown` 은 이제 `req.kind !== 'cancel'` 일 때만 부른다.
- 잠금 판정 키는 폼의 `strategyKey(isin, accountNo, exchange)` 다. 계좌가 빈 폼은 잠금을 읽지 않는다.
- relay-provider 주석에는 18-30 식별자 이름을 인용하지 않았다(18-35 grep 게이트 대비).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] trading-workbench.test.tsx 의 옛 ✕ 본문 단언 2곳 갱신**
- **Found during:** Task 1 (vitest trading-workbench)
- **Issue:** `CLOSE_UNKNOWN_BODY` 문구를 바꾸면서 기존 단위 테스트 2건(1108 · 1248 줄)이 옛 문장을 단언해 실패했다. 이 파일은 Task 1 `<files>` 에 없다.
- **Fix:** 옛 문장 대신 새 본문 전문(1108)과 「로그아웃하거나 새로고침하면 풀려요.」(1248)를 단언하도록 바꿨다. 두 케이스의 의미는 그대로다.
- **Files modified:** webapp/src/components/trading/__tests__/trading-workbench.test.tsx
- **Commit:** 3e59a73

**2. [Rule 3 - Blocking] GC6 에 이탈 경고 confirm 자동 수락 추가**
- **Found during:** Task 1 (e2e 작성)
- **Issue:** 작업대 더티 카드가 있으면 `useLeaveWarning` 이 사이드바 링크 클릭을 브라우저 `confirm` 으로 막을 수 있다.
- **Fix:** GC6 에서 `page.on('dialog', accept)` 를 걸었다. 수락해도 이동은 client-side 그대로다(relay 소켓 수 1 을 단언으로 확인).
- **Commit:** 3e59a73

그 밖의 부분은 계획대로 실행했다.

## Issues Encountered

- `requirements.mark-complete TRADE-07 TRADE-09` 가 두 요구사항을 Complete 로 바꿨다. 이 저장소는 갭 클로징 중 TRADE-06~09 를 Pending 으로 유지해 왔고(c85cbb7 · 0b252be 에서 조기 Complete 를 되돌림 · 18-30~32 SUMMARY 모두 `requirements-completed: []`), 18-35 · 18-36 도 아직 남아 있다. 그래서 REQUIREMENTS.md 변경은 되돌렸다.

- `webapp/.git` 디렉터리(중첩 저장소)가 원래부터 있다. `webapp` 안에서 git 을 부르면 바깥 저장소가 아니라 이 중첩 저장소를 보고, 그 저장소의 무관한 diff 가 나온다. 이번 작업의 모든 git 명령은 저장소 루트에서 실행했다. 이번 플랜 범위 밖이라 손대지 않았다.

## Threat Flags

없다. 새로 생긴 네트워크 · 저장소 표면이 없다. 잠금은 메모리 상태이고 송신 프레임도 추가되지 않는다(⑩-a 가 주문 프레임 수와 `lc.set` 0 을 단언).

## Self-Check: PASSED

- FOUND: webapp/src/lib/relay-provider.tsx · webapp/src/components/trading/card/manual-order-form.tsx · webapp/src/components/trading/workbench/trading-workbench.tsx · webapp/src/lib/__tests__/relay-provider.test.tsx · webapp/e2e/specs/trading-workbench.spec.ts
- FOUND commits: 3e59a73 · 208b276 · 0cdd06f
