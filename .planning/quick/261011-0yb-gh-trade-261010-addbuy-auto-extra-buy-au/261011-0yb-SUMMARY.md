---
phase: quick-261011-0yb
plan: 01
status: complete
subsystem: relay · shared · webapp(상따 화면)
tags: [limit-chaser, extra-buy-auto, buy3_schema-5, gh-trade-inbox, D-34, D-33]
requires:
  - gh-trade 8c7d4c5c / c6753edc (SetLimitChaser.extra_buy_auto vtable 156 · buy3_schema 5)
provides:
  - relay buy3_schema 5 파생 · vtable 156 적재 · 60/64 extraBuyAuto 디코드
  - shared RelayLimitChaser.extraBuyAuto (양방향 · 입력 50필드)
  - 웹 추가매수 제목줄 ☐자동(lc-extra-buy-auto) · 에코 되싣기 · buyGroupOpenOf(D-34 열린 그룹)
  - 상한가 중 추가매수 켜기 클라 차단(웹 D-36 = C# D-33 ①) 제거
affects:
  - webapp 상따 카드(추가매수 · 후매수 카드) · 전략 로그
  - relay lc.set 조립(배포 시 gh-trade 서버 배포 뒤여야 함)
tech-stack:
  added: []
  patterns: ["필드 존재로만 buy3_schema 파생(P-1 단조성)", "열린 그룹 판정 한 곳(buyGroupOpenOf)"]
key-files:
  created: []
  modified:
    - relay/src/generated/StockDMA.fbs
    - relay/src/generated/stock-dma/set-limit-chaser.ts
    - packages/shared/src/relay.ts
    - relay/src/dma/envelope.ts
    - relay/src/ws/protocol.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/test-fixtures/limit-chaser.ts
    - webapp/src/components/trading/lc/lc-fields.ts
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/strategy-log.tsx
    - webapp/src/components/trading/lc/use-lc-field-commit.ts
    - webapp/src/components/trading/card/card-body.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
    - docs/inbox/from-gh-trade/261010-addbuy-auto.md
decisions:
  - "extraBuyAuto 는 게이트가 아니다 — LC_GATE_FIELDS · isActiveStrategy · isDeleteIntent · relay #isTeardown 에 넣지 않음(C# AnyArmed 동형)"
  - "☐자동 ON 인 추가매수는 열린 그룹(buyGroupOpenOf) — D-02 전반 · 후반 모두 마스터를 내리지 않음(gh-trade D-34 개정)"
  - "사람이 추가매수를 끄면 같은 lc.set 에 extraBuyAuto false 동반, 매수주문 끄기는 ☐자동 유지(C# 동형)"
  - "추가매수 ☐자동 켜기에는 사전 검증 없음 · 구서버 에코면 켜는 방향만 막음"
metrics:
  duration: "약 45분"
  completed: 2026-10-11
estimate:
  tokens: 220000
  tasks: 3
actuals:
  tokens: 42600
  tasks: 3
  commits: 18
plan_head_before: 5529181c09a8eefee84e77a8ac3c1906a8d754d5
plan_head_after: eb797b5cfc813cec2a66b609a769b29111aab0d5
---

# Phase quick-261011-0yb Plan 01: gh-trade 261010-addbuy-auto 적용 Summary

추가매수 ☐자동 재진입(extra_buy_auto · vtable 156)을 생성물 재동기화 → relay buy3_schema 5 파생 · 적재 · 60/64 디코드 → 웹 폼 에코 되싣기 → 추가매수 제목줄 「자동」 체크 · D-34 열린 그룹 정렬까지 잇고, 웹의 상한가 중 추가매수 켜기 차단(D-33 ① 동형)을 걷었다.

## 커밋

| Task | 커밋 | 내용 |
|------|------|------|
| T1 (생성물) | `799d928f` | chore — relay 생성물 재동기화, gh-trade c6753edc (StockDMA.fbs · stock-dma/set-limit-chaser.ts 2파일만) |
| T1 (와이어) | `39b0d7c7` | feat — shared 계약 · relay schema 5 파생/적재/디코드 · zod · 웹 폼 에코 되싣기 · e2e schema 기대 4→5 |
| T2 | `cd5c3b4a` | feat — 추가매수 제목줄 ☐자동 · 후매수 「재진입」 · 단계 0 자동 잔여 · 동반 해제 · buyGroupOpenOf · 로그 전이 |
| T3 (코드) | `18cf2ed5` | feat — 상한가 켜기 클라 차단 제거 · 54 「추가매수 —」 원문 테스트 · e2e P24-5/P24-13/P24-7 |
| T3 (인박스) | `0e3f992e` | docs(inbox) — 261010-addbuy-auto status done · done_commit 18cf2ed5 · gh-radar 답 4항 |

`commits: 18` 은 `5529181c..HEAD` 로 잰 값이다. 이 중 13건은 같은 시간 main tree 에서 돌던 Phase 29(29-36 · 29-37 · 29-38) 세션의 커밋이고, 이 작업의 커밋은 위 5건이다. 되돌리지 않았다. 모든 커밋은 경로 지정 add + `git commit -- <경로>`로 만들었고 Co-Authored-By 는 넣지 않았다. push 와 배포는 하지 않았다.

생성물 마커는 `server-repo-commit: c6753edc` 이다. gh-trade 작업 트리가 dirty(server/src/protocol/StockDMA.fbs 미커밋)여서 rc4 방식으로 스크래치 clone 의 master 사본 스크립트를 썼다(`--check` 통과 → 반영). 본문은 master fbs 와 바이트가 같고(cmp 통과), 40c4b8f5 대비 바뀐 생성 파일은 2개다. gh-trade 저장소에는 아무것도 쓰지 않았다.

## 테스트 결과

| 명령 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/shared build` | 통과 |
| `pnpm --filter @gh-radar/relay run typecheck` · `typecheck:tests` | 통과 |
| relay `vitest run --maxWorkers=2 envelope.test protocol.test fanout.test` | 4 files · 364 passed |
| webapp `typecheck`(e2e tsconfig 포함) | 통과(T1 · T2 · T3 각각) |
| webapp `vitest --maxWorkers=2 limit-chaser.test limit-chaser-form.test lc-tracer.test` (T1) | 3 files · 386 passed |
| webapp `vitest --maxWorkers=2 lc-fields.test setting-group.test limit-chaser-form.test strategy-log.test strategy-log-feed.test lc-tracer.test` (T2) | 6 files · 508 passed |
| webapp `vitest --maxWorkers=2 use-lc-field-commit.test card-body.test strategy-card-flow.test limit-chaser-form.test strategy-log.test` (T3) | 5 files · 613 passed |
| `playwright test e2e/specs/trading-workbench.spec.ts --project=chromium --workers=1` (전체) | 65 passed · **1 failed (P20-3)** · 10 did not run(파일 serial 모드라 실패 뒤 미실행) |
| 같은 파일 `-g "P20-3 최악값"` 재실행 | 첫 시도는 webServer 타임아웃(NextFontGoogleFontFileReplacer). `rm -rf webapp/.next` 뒤 재실행에서 **같은 실패 재현** |
| 같은 파일 `--grep-invert "P20-3 최악값"` | **75 passed**(setup 포함) — P24-1 · P24-5 · P24-7 · P24-13 · P27-1~4 등 이 작업이 건드린 케이스 모두 통과 |

P20-3 실패는 이 작업과 무관하다고 본다. 실패 메시지는 `344 카드 · 수동 pane — 내용이 상자를 넘친 요소`: `{ tag: "span", text: " · 위탁종합", over: 17 }` 이다. 수동주문 pane 의 계좌 줄(상품명)이 넘친 것이고, 상따 폼 · relay lc 경로와 닿지 않는다. 같은 시간 Phase 29-37/29-38(계좌 줄 주문 서버 세그먼트) 세션이 계좌 줄 코드를 고치고 있었고, 그 미커밋 변경이 작업 트리에 있는 상태에서 돌렸다. 고치지 않았다.

음성 grep 3종(`lcExtraBuy` · `상한가 도달 전` · 세 파일의 `bestBid`)은 모두 0건이다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] lc-tracer.test.tsx 의 cfg 키 수 단언 49 → 50**
- **Found during:** Task 1 verify(plan files 목록에는 없지만 verify 에 들어 있는 파일)
- **Issue:** 웹 cfg 에 extraBuyAuto 가 늘 실려 키가 50개가 됐고, 단언 2곳이 49로 남아 실패했다.
- **Fix:** 단언 2곳을 50으로 바꾸고 주석 계산식에 `+ extraBuyAuto(quick-261011-0yb)` 를 붙였다.
- **Files modified:** webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx
- **Commit:** 39b0d7c7

**2. [Rule 1] lcRangeIssue 범위 문구 접두가 「최대 · …」 → 「재진입 · …」 로 바뀜**
- 라벨 개명이 범위 경고 문구 접두로 그대로 흘러간다. lc-fields.test 의 기대값을 새 접두로 고쳤다. 동작 변경은 의도된 것이다.
- **Commit:** cd5c3b4a

**3. 기타.** e2e P24-7 측정 함수는 `checkHeaderCheck(slot, word, …)` 로 일반화했다. 두 제목줄 모두 넘침 0 · 잘림 0 으로 통과해서 GroupHeaderCheck 간격은 손대지 않았다. trading-workbench.spec 의 줄 228 · 4243 에 있던 D-36 주석 1곳은 사실에 맞게 고쳤다.

## 실행 중 새로 들어온 계약(조치 필요 · 이번 범위 밖)

실행 도중 gh-trade 가 `da762186`(2026-10-11 01:09, quick-261011-1ar)을 커밋했고, gh-radar 에 새 인박스 노트 `docs/inbox/from-gh-trade/261011-julmaesu-rename.md`(status open · untracked)가 들어왔다. 내용은 다음과 같다.

- **「재진입」 라벨 철회.** 「261010-addbuy-auto 노트의 후매수 「최대」 → 「재진입」 은 철회 — C# 라벨은 「최대」 그대로. 웹이 바꿨다면 「최대」로 되돌릴 것」. 이 작업의 T2 는 플랜 truth(ABA-UI)대로 「재진입」(라벨 · 시트 제목 「재진입 횟수」 · 요약 kv · 범위 문구)을 적용했으므로, 새 노트를 처리할 때 되돌려야 한다. 칸 공유(단계 0 ∧ ☐자동이면 잔여 표시)는 계속 유효하다.
- **「추가매수」 → 「줄매수」 용어 변경.** 54 사유 줄 첫 토큰도 「줄매수 —」 로 바뀐다. 이번에 추가한 화면 문구(접근성 이름 「추가매수 자동」, 로그 「추가매수 자동 체크 / 해제」, hint)도 그 노트를 처리할 때 함께 바꿔야 한다. 웹은 54 문구를 분류하지 않으므로 표시가 깨지지는 않는다.
- **fbs 주석만 변경.** 와이어는 그대로이고 생성물 재동기화는 선택이다. 그래서 플랜 T1 verify 의 「마커 == gh-trade master 의 최신 fbs 커밋」 단언은 지금 실행하면 실패한다(master 최신 = da762186, 마커 = c6753edc). 동기화 시점에는 성립했다(cmp 통과 · 2파일). 재동기화는 261011-julmaesu-rename 처리 몫으로 남겼다.

같은 맥락에서 /me 기본값 화면(`webapp/src/components/me/limit-chaser-defaults.tsx` 「후매수 최대」)은 이번 범위 밖이라 그대로 두었다. 「최대」 원복 결정과도 맞는다.

## 배포 순서(이번에는 실행하지 않음)

gh-trade 서버 배포 → gh-radar relay 배포 → push(= webapp 프로덕션 배포). relay 가 schema 5 를 보내는 것은 gh-trade 서버가 배포된 뒤라야 ☐자동이 동작한다. 구서버는 vtable 156 을 무시할 뿐 깨지지는 않는다. DB 마이그레이션은 없다.

## C# 확인 요망(인박스 답 ③)

웹은 ☐자동 ON 인 추가매수를 열린 그룹으로 보고 D-02 전반 · 후반에서 마스터를 내리지 않는다. 반면 C# `DropMasterAfterServerFold` · `HandleArmToggle` 의 `AnyBuyGroupChecked` 는 `chkAddBuyAuto` 를 보지 않는다. 그래서 추가매수 발주로 그룹이 접히고 매도 체크가 켜져 있으면, C# 클라가 마스터를 내려 재진입 대기를 쉬게 할 수 있다.

## Known Stubs

없음.

## Self-Check: PASSED

- 커밋 5건(799d928f · 39b0d7c7 · cd5c3b4a · 18cf2ed5 · 0e3f992e)이 HEAD 조상이다.
- 수정 파일이 모두 존재한다. 인박스 노트는 tracked · status done · done_commit 18cf2ed5 · HEAD 와 차이 없음.
