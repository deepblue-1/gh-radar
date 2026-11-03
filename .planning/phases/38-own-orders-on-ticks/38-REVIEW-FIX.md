---
phase: 38-own-orders-on-ticks
fixed_at: 2026-11-04T03:49:00+09:00
review_path: .planning/phases/38-own-orders-on-ticks/38-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 38: 코드 리뷰 수정 보고서

**Fixed at:** 2026-11-04
**Source review:** `.planning/phases/38-own-orders-on-ticks/38-REVIEW.md`
**Iteration:** 1

**Summary:**
- 범위 안 항목: 5 (Warning WR-01..WR-05 · Critical 0 · Info IN-01..IN-04 는 범위 밖이라 손대지 않음)
- 고침: 5
- 건너뜀: 0

**작업 위치:** 호출자 지시대로 기존 worktree `/Users/alex/repos/gh-radar/.claude/worktrees/phase-38`(브랜치 `phase-38-own-orders`)에서 바로 고치고 커밋했다. 따로 worktree 를 만들지 않았으므로 정리 단계도 없다. 커밋마다 경로를 지정해 스테이징했고 push 는 하지 않았다.

## Fixed Issues

### WR-01: 카드 체결 줄이 음수 시각차를 「+-NNms」 로 그린다 — 짝지은 체결의 약 절반

**Files modified:** `webapp/src/components/ticks/tick-own-section.tsx`, `webapp/src/components/ticks/__tests__/tick-order-card.test.tsx`
**Commit:** 65c012c2
**Applied fix:** 부호를 고르는 `dtText(dtMs)` 를 두었다(`dt >= 0 ? '+' : '−'` + 절댓값). 이제 음수 dt 는 「+-37ms」 가 아니라 「−37ms」 로 나온다. 마이너스 기호는 같은 파일 꼬리말의 `[−200, +1500]` 과 같은 U+2212 를 쓴다. 카드 테스트 ⑤-2 를 더했다. gw 를 A3 보다 37ms 앞에 두고 「체결13:00:00.300 50 −37ms」 이 나오는지, 「+-」 가 없는지 확인한다.

### WR-02: 당일 끝자락 체결이 「대기」 가 아니라 더 이른 같은 가격 A3 에 잘못 짝지어진다

**Files modified:** `webapp/src/lib/ticks/own-model.ts`, `webapp/src/lib/ticks/__tests__/own-model.test.ts`
**Commit:** 8a4e62fa
**Status:** fixed: requires human verification (짝짓기 상태 로직 변경)
**Applied fix:** `lastRecvMs` 계산을 짝짓기 앞으로 옮겼다. `live && gw + OWN_PENDING_GRACE_MS > lastRecvMs` 인 체결은 `matchOwnFills` 입력에서 빼고 `pending` 으로 둔다. 짝 결과와 상관없이 대기이고, 남은 수량도 깎지 않는다. 짝짓기에 넣었는데 못 찾은 체결만 `nofill` 로 확정한다. 과거 격자(`live` false)는 체결을 모두 넣으므로 오라클 경로는 바뀌지 않는다. 당일 세션이 자라면 `useMemo([session, own])` 가 모델을 다시 만든다. 그래서 「최신 받기」 를 다시 누르지 않아도 창을 넘긴 체결은 다음 세션 갱신 때 짝이 붙는다. 머리 주석 ⑥ 도 고쳤다. 합성 테스트에서는 상한가 같은 가격 A3 가 .100 에 있고 마지막 수신이 .9005 일 때 .150 체결을 본다. live 면 `pending` · rec −1 · 칩 없음 · 슬롯 있음이어야 한다. 과거 격자면 `matched` rec 0, 세션이 1.5005s 까지 자라면 live 에서도 `matched` 여야 한다.

### WR-03: 짝짓기 · 근거 특정이 중복 A3(같은 보드 · seq 재수신)를 거르지 않는다

**Files modified:** `packages/shared/src/ticks/own-fills.ts`, `packages/shared/src/__tests__/ticks-own.test.ts`, `packages/shared/src/__tests__/ticks-own.golden.test.ts`, `webapp/src/lib/ticks/own-model.ts`, `webapp/src/lib/ticks/__tests__/own-model.test.ts`
**Commit:** 0dbf63a2
**Status:** fixed: requires human verification (짝짓기 · 근거 후보 집합 변경)
**Applied fix:** shared `matchOwnFills(index, a3, fills, skip?)`, `cumIndexOf(a3, skip?)`, `locateEvidence(…, ev, skip?)` 에 선택 인자 `skip`(rec → 1)을 더했다. `skip` 은 짝 후보, cum 색인(단건 근거 · 앵커), 주기매도 구간 순회에 모두 적용한다. 웹 `buildOwnModel` 은 `session.duplicates` 를 넘긴다. 이로써 차트와 같은 기준으로 거른다. 인자를 주지 않으면 지금과 똑같다. 오라클 생성기(`gen-own-fixtures.mjs`)와 기존 골든 단언은 그대로다.
- 합성 테스트(shared): 중복이 둘째 후보가 되지 않는지(추정 아님). 원본이 바닥나도 중복 행으로 넘어가지 않는지. 중복을 빼면 단건 근거가 hits 1 이 되고 구간의 n · qty 에서도 중복이 빠지는지. 앵커가 원본 j 를 가리키는지.
- 합성 테스트(웹): synthSession 에서 같은 seq 를 다시 받은 경우에도 짝 · 근거 · 앵커가 원본 rec 0 하나만 가리키는지.
- 골든: 5키 모두 `skip` 을 넘겨도 짝 · cum 색인 · 근거 · 앵커가 넘기지 않을 때와 같은지 확인하는 절을 더했다. 픽스처 중복도 0건인지 함께 단언한다.

**오라클 수치 확인:** 기존 골든 단언(짝 401/406 · 같은수량 236 · 일부 165 · 못찾음 5 · 추정 108 · 호가 근거 29/29 · 체결 단건 2 · 구간 9 · 없음 2 · 앵커 100/100)은 손대지 않았고 모두 통과했다.

### WR-04: 고른 우리 줄(`ownPick`)을 id 로 기억해서 own 을 다시 받으면 다른 주문 · 체결을 가리킬 수 있다

**Files modified:** `webapp/src/lib/ticks/own-model.ts`, `webapp/src/components/ticks/tick-viewer.tsx`, `webapp/src/lib/ticks/__tests__/own-model.test.ts`, `webapp/src/lib/ticks/__tests__/tick-chart-tip.test.ts`
**Commit:** 95b3b4c2
**Status:** fixed: requires human verification (선택 상태 로직 변경)
**Applied fix:** 비우는 쪽 대신 **안정 키 방식**을 골랐다. 같은 파일의 `ownBack` 과 같은 방식이다.
- `OwnFillView.key = ${gateway}|${seq}` 를 새로 두었다. 주문은 원래 있던 `OwnOrderView.key = ${gateway}|${order_no}` 를 쓴다.
- `own-model.ts` 에 `OwnSelKey` 형, `ownSelKeyOf(model, sel)`(id → 키), `resolveOwnSel(model, key)`(키 → 지금 모델 id · 없으면 null)를 더했다. 체결 줄은 지금 모델에서도 아직 줄(짝 없음 · 대기 · `rec < 0`)일 때만 푼다. 다시 받아 짝이 붙었으면 줄이 없으므로 선택도 없다.
- `tick-viewer.tsx` 의 `ownPick` 은 이제 `{ sel: OwnSelKey, rec }` 를 기억한다. `ownSel` 은 렌더 때 `useMemo([ownPick, rec, ownModel])` 로 푼다. 참조를 안정시키려고 메모했다. 매 렌더 새 객체가 생기지 않도록 하기 위해서다. 「커서가 그 rec 일 때만 선택」 규칙은 그대로다.
- `tick-chart-tip.test.ts` 의 `OwnFillView` 목 객체에 새 필드 `key` 를 채웠다(형 맞춤).
- 테스트: 다른 게이트웨이의 더 이른 주문 · 체결이 끼어 id 가 밀려도 같은 주문 · 체결로 풀리는지, 사라지면 null 인지 본다. 대기였던 체결 줄에 세션이 자라 짝이 붙으면 선택이 null 이 되는지도 본다.

### WR-05: 「최신 받기」 때 own 조회가 한 번 실패하면 받아 둔 우리 층이 통째로 사라진다

**Files modified:** `webapp/src/lib/ticks/use-tick-own.ts`, `webapp/src/lib/ticks/__tests__/use-tick-own.test.tsx`
**Commit:** 633af896
**Applied fix:** 요청이 거부(네트워크 · HTTP 오류)되면 `setSettled(prev => …)` 로 처리한다. 같은 종목 키(`prev.key === k`)면 직전 `own` 을 지키고 `ok: false`(status `error`)만 남긴다. 처음 열기 실패와 다른 종목 실패는 지금처럼 null 이다. 응답 모양 검사 실패(`shape`)는 일시 오류가 아니라 계약 이탈이라 이번 범위에 넣지 않았다(IN-03 과 이어지는 부분). 머리 주석 ⑤ 도 고쳤다. 테스트는 두 가지를 더했다. 성공 뒤 refreshKey+1 이 503 으로 실패하면 own 이 유지되고 status 가 error 여야 한다. 다른 종목으로 바꾼 뒤 실패하면 own 이 null 이어야 한다.

## 검증

모든 게이트는 **이 worktree(main checkout 아님 · `/Users/alex/repos/gh-radar/.claude/worktrees/phase-38`)** 에서 돌렸다. webapp 은 shared 를 dist 로 읽으므로 WR-03 다음에 `packages/shared` 를 `npm run build` 로 다시 빌드했다. dist 는 git 이 추적하지 않는다.

- `packages/shared`: `tsc --noEmit` 통과. `vitest run --maxWorkers=2 src/__tests__/` 결과 39 파일 · 1060 통과 · 2 skip. ticks-own 합성과 골든이 여기에 들어 있다.
- `webapp`: `tsc --noEmit -p .` 통과. `vitest run --maxWorkers=2 src/lib/ticks src/components/ticks` 결과 26 파일 · 363 통과. own-model · use-tick-own · use-own-nav · tick-order-card · tick-msg-list · tick-chart · tick-chart-tip · tick-viewer-live 가 여기에 들어 있다.
- `webapp`: 고친 파일에 `eslint` 를 돌려 경고 0.
- Playwright e2e 는 돌리지 않았다(동시 세션 메모리 규율 · 범위 밖). 당일 e2e(`ticks-viewer.spec.ts` 「↻ 최신 받기 1회」)는 주문 수(「· 주문 3」)만 단언하므로 WR-02 와 부딪히지 않는다고 읽었지만, 실제로 돌려 확인하지는 않았다.

---

_Fixed: 2026-11-04_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
