---
phase: 24-limitchaser-buy3
round: R4
verified: 2026-09-29T14:05:00Z
status: passed
previous_status: gaps_found
score: 22/22 truths verified (round-1~3 누적 21건 회귀 없음 재확인 + R3-G1 닫힘 확인 = 22)
covered_files: [".planning/phases/24-limitchaser-buy3/24-18-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-18-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-19-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-19-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-20-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-20-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-21-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-21-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-22-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-22-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-23-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-23-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-24-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-24-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-REVIEW-R2.md", ".planning/phases/24-limitchaser-buy3/24-REVIEW-R3.md", ".planning/phases/24-limitchaser-buy3/24-REVIEW-R4.md", ".planning/phases/24-limitchaser-buy3/24-REVIEW-R5.md", ".planning/phases/24-limitchaser-buy3/24-UAT.md", ".planning/phases/24-limitchaser-buy3/24-UI-SPEC.md", ".planning/phases/24-limitchaser-buy3/24-VERIFICATION-R2.md", ".planning/phases/24-limitchaser-buy3/24-VERIFICATION-R3.md", ".planning/phases/24-limitchaser-buy3/24-VERIFICATION.md", ".planning/quick/260929-htw-24-r3-g1/260929-htw-PLAN.md", ".planning/quick/260929-htw-24-r3-g1/260929-htw-SUMMARY.md", "packages/shared/src/relay.ts", "webapp/e2e/specs/trading-workbench.spec.ts", "webapp/src/components/trading/__tests__/card-body.test.tsx", "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx", "webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx", "webapp/src/components/trading/__tests__/strategy-card.test.tsx", "webapp/src/components/trading/card/card-body.tsx", "webapp/src/components/trading/card/strategy-card.tsx", "webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx", "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx", "webapp/src/components/trading/lc/use-lc-field-commit.ts", "webapp/src/components/trading/limit-chaser-form.tsx", "webapp/src/components/trading/strategy-log.tsx", "webapp/src/lib/__tests__/limit-chaser.test.ts", "webapp/src/lib/limit-chaser.ts"]
covered_digest: "v1:sha256:ee91c2ac1507f09572b14c0ee5582526be1cf521f42d87ae5da207281a277e85"
behavior_unverified: 0
overrides_applied: 3
overrides:
  - must_have: "D-03/D-04a 재해석 — buy3 에코 선매수 금액 0 은 미입력, 구서버 에코의 「금액부터 받는」 경로 제거"
    reason: "사용자 승인 완료(2026-09-28, 24-16-SUMMARY Task 2) — round-3에서도 재확인, 이번 라운드에도 그대로 승계."
    accepted_by: "user (deepblue-1)"
    accepted_at: "2026-09-28T16:00:00+09:00"
  - must_have: "구서버 에코 — 매수주문부터 끄게 하는 규칙(끄는 방향 ∧ 결과 매수주문 OFF 만 허용)"
    reason: "사용자 승인 완료(2026-09-28, 24-16-SUMMARY Task 2) — 이번 라운드에도 그대로 승계."
    accepted_by: "user (deepblue-1)"
    accepted_at: "2026-09-28T16:00:00+09:00"
  - must_have: "WR-06 남는 한계 — 동시에 보이는 두 인스턴스 각 1건 · 한 왕복 안쪽 편집 되돌림은 compare-and-set 이월"
    reason: "사용자 승인 완료(2026-09-28, 24-16-SUMMARY Task 2) — 운영 서버 D-34 가 이 경로 자체를 막아 잔여 위험 낮음. 이번 라운드에도 그대로 승계."
    accepted_by: "user (deepblue-1)"
    accepted_at: "2026-09-28T16:00:00+09:00"
re_verification:
  previous_status: gaps_found
  previous_score: "21/22 truths verified (R3-G1 신규 미해결)"
  gaps_closed:
    - "R3-G1 (= 24-REVIEW-R4 R4-WR-01) — 부분 거부 뒤 되살아난 「선매수/추가매수 자동 체크」 로그가 서버가 눕힌 항목까지 「켬」으로 적던 결함. quick-260929-htw(커밋 0061d51f · 307cc4dd)가 (1) limit-chaser.ts 에 순수 함수 `confirmAutoChecks(auto, echoNow)` 를 추가해 예측(auto)을 성공 에코로 사후 확정하고(요청했으나 에코에 서지 않은 항목은 「켬」에서 빼 「서버 거부」로 옮김), (2) limit-chaser-form.tsx:1090-1092 의 로그 줄 생성부를 `groupAutoCheckLogLine(confirmAutoChecks(auto, echoNow))` 로 교체, (3) use-lc-field-commit.ts 훅 ⑬(`laidRef`)로 같은 흐름에서 대기 중인 다른 그룹의 동반 함수가 방금 눕혀진 필드를 다시 싣지 않게 했다. F1(limit-chaser-form.test.tsx:3195) · 카드 흐름(strategy-card-flow.test.tsx:1789-1822) 회귀 테스트가 올바른 문장(「켬: … / 켜지 않음: 매도주문(서버 거부)」)과 sellEnabled:false 를 직접 잠갔다 — 본 검증이 코드 직접 열람 + F1/카드 케이스 단독 실행 + webapp 전량 스위트 실행으로 재확인했다."
  gaps_remaining: []
  regressions: []
---

# Phase 24: gh-trade 상따 매수주문 3종 분리 — 갭 클로징 재검증(Round 4) Verification Report

**Phase Goal:** gh-trade Phase 24 가 상따 매수를 선매수·추가매수·후매수 세 갈래로 나눴다(SetLimitChaser MsgType 10/60/64 말미 append 17필드, vtable 98~130; buy_watch_side·buy_entry_latched·MsgType 38 ArmBuyLatchReq 폐기). gh-radar 가 buy3_schema=1 을 실어 신 클라로 인정받고, relay·webapp 이 3종 분리를 반영한다.

**Verified:** 2026-09-29T14:05:00Z (KST)
**Status:** passed
**Re-verification:** Yes — round 4. round-1(24-VERIFICATION.md) → 갭 클로징 24-14~24-17 → round-2(24-VERIFICATION-R2.md, gaps_found) → 갭 클로징 24-18~24-24 → 자체 코드 리뷰 3라운드(24-REVIEW-R3.md) → quick-260929-akj → 자체 코드 리뷰 4라운드(24-REVIEW-R4.md) → round-3(24-VERIFICATION-R3.md, gaps_found, 유일한 미해결 R3-G1) → 갭 클로징 quick-260929-htw(커밋 `0061d51f`·`307cc4dd`) → 자체 코드 리뷰 5라운드(24-REVIEW-R5.md, warning 2·info 5) → **본 문서(round-4 재검증)**.

## 요약

round-3 이 남긴 유일한 갭 **R3-G1(= 24-REVIEW-R4 R4-WR-01)** 은 quick-260929-htw 로 닫혔다. 본 검증이 직접 확인한 것은 다음과 같다.

1. **코드 직접 열람** — `limit-chaser.ts:455-467` 의 `confirmAutoChecks` 가 요청 예측(`groupAutoChecksOf`)을 성공 에코로 사후 확정한다. `limit-chaser-form.tsx:1090-1092` 의 로그 줄 생성부가 이 함수를 거친 결과로만 줄을 만든다. `use-lc-field-commit.ts:769-778,873-876` 의 훅 ⑬(`laidRef`)이 같은 흐름의 대기 동반 함수에 눕힌 필드를 넘긴다.
2. **회귀 테스트 재실행(단독)** — `npx vitest run -t "F1 부분 거부" limit-chaser-form.test.tsx` 1 passed. 이 PASS 는 이제 **올바른 문장**(「켬: 매도>잔량추적 · … / 켜지 않음: 매도주문(서버 거부)」, sellEnabled:false)을 기대값으로 잠근 결과다(round-3 때는 틀린 문장을 잠근 PASS 였다 — 기대값 자체가 갱신됐음을 diff 로 확인).
3. **전량 스위트 직접 실행(본 검증이 자체 실행, 요약 인용 아님)** — webapp `pnpm exec vitest run` → **125 files / 2835 passed / 1 skipped**. relay `pnpm exec vitest run` → **29 files / 665 passed**, 이번 실행에서는 flaky 없이 전부 1회 통과. round-1~3 에서 검증된 21건 truth(relay 와이어·구조·배포·D-01~D-35 그룹 로직·카드 흐름·훅 판정 등)에 회귀가 없음을 확인했다.
4. **debt marker · 관련 파일 git 이력** — `grep -E "TBD|FIXME|XXX"` (b6a9f486..307cc4dd 의 webapp 변경 파일) 0건. `packages/shared/src/relay.ts`·`relay/src/` 는 이번 라운드에도 변경 없음(round-1~3 과 동일 결론).

human_verification 이월분은 없다 — round-2 가 남긴 4개 항목은 round-3 에서 `24-UAT.md`(86/86 pass)로 이미 종결됐고, 이번 라운드에서 새로 발생한 시각/실시간/외부서비스 확인 항목이 없다.

## R3-G1 재검증 (닫힘)

| 항목 | 재검증 결과 | 근거 |
|---|---|---|
| 선매수·추가매수 자동 체크 로그가 서버에 선 값만 「켬」으로 적고, 서버가 거부한 항목을 켠 것으로 잘못 기록하지 않는다 | ✓ VERIFIED (closed) | `confirmAutoChecks`(순수 함수, 판정 단일화) 가 예측을 성공 에코로 확정 — 코드 직접 확인. F1·카드 흐름 회귀 테스트가 올바른 문장을 잠금 — 단독 실행 재확인. `webapp/src/lib/__tests__/limit-chaser.test.ts` 에 pure-function 레벨 유닛 테스트 6건(전부 섰을 때 항등·순수성·부분 거부·사유 정렬·가격 조각 분리) 추가 확인 |

## Round-1~3 truth 회귀 없음 (quick 정합성 체크)

| 범위 | 재확인 방법 | 결과 |
|---|---|---|
| round-1 truth 1~13(relay 와이어·구조·배포) | `git log --oneline -- packages/shared/src/relay.ts relay/src/` (b6a9f486..HEAD) | 매치 없음 — 이번 라운드도 relay 무변경 |
| round-2 갭 클로징 4건(GC-WR-01/R2-G1/R2-G2/R2-G3) | webapp 전량 스위트 직접 실행 | 관련 describe 블록 전부 green(카드 거부 분기, revertToggle, pressedLast, autoCheckRef 그룹 슬롯) |
| round-3 자체 코드 리뷰 후속(R3-WR-01/R3-WR-02) | webapp 전량 스위트 직접 실행 + `npx vitest run -t "H1 리뷰어 재현" use-lc-field-commit.test.tsx` | 1 passed, 관련 describe 블록 green |
| requirements 교차검증 | `grep -n "Phase 24" .planning/REQUIREMENTS.md` | 매치 없음 — phase-24 는 `requirements: []` 로 일관, ORPHANED 없음(round-1~3 과 동일) |

## R5-WR-01 / R5-WR-02 독립 판정 (블로커 아님 — Warning 수준 유지)

지시에 따라 24-REVIEW-R5 의 판단을 그대로 승계하지 않고, 본 검증이 직접 코드를 재추적해 독립적으로 판정했다.

### R5-WR-01 — 「흐름이 비었나」 술어가 한쪽만 잠겼다

**독립 판정: 현재 동작은 정확하다 — 테스트 커버리지 공백(향후 변이 방지력 부재)이며, 지금 이 순간 truth 를 어기는 관측 가능한 결함은 아니다.**

`use-lc-field-commit.ts:771-778` 의 술어(`inflightRef === null && queueRef.length === 0 && popAfterSeqRef === null && orphanRef === null`)를 직접 손으로 추적했다. 부분 거부로 `laidRef` 에 `sellEnabled` 가 모인 직후에는 `matches` 분기가 `popAfterSeqRef.current = seq`(serverChanged 경로) 또는 대기열 유지(drainNow 경로)를 반드시 세운다 — 즉 이 술어의 네 항 중 최소 하나는 흐름이 실제로 빌 때까지 non-null 로 유지된다. 따라서 "장벽 안(답 신호 증가 전)에 사람이 새로 확정"하는 경로에서 이 술어는 항상 `false` 로 평가되고, `laidRef` 는 지워지지 않는다 — R5-WR-01 이 제안한 재현 테스트를 손으로 시뮬레이션한 결과도 현재 코드가 통과시키는 방향(=올바른 방향)으로 나온다.

R5-WR-01 이 정확히 지적한 것은 "이 경로를 지키는 테스트가 없다"는 것이고, 이는 사실이다(`use-lc-field-commit.test.tsx` 의 R3-G1 describe 블록 4건 중 마지막 하나만 "흐름이 빈 뒤" 를 다루고, "장벽 안" 은 다루지 않는다 — 직접 확인). 이 술어를 미래에 실수로 완화(예: 조건 삭제)하면 R4-WR-01 이 재발할 수 있다는 경고는 타당하다. 그러나 **지금** 코드가 잘못된 방향으로 동작한다는 증거는 없다(실패하는 테스트도, 재현 가능한 명령도 없다) — 페이즈 목표("로그가 서버 값만 켬으로 적는다")를 현재 깨지 않는다. **판정: Warning 유지, 후속 테스트 추가 권고(블로커 아님).**

### R5-WR-02 — 「에코에 서지 않음 = 서버 거부」 등식이 relay 무장 접힘 계약과 충돌

**독립 판정: 실재하는 어휘 정확성 잔여 한계이나, 현재 호출 경로에서는 도달 불가능(reachability 없음) — 판정 방향의 안전성(과대주장 금지)은 깨지지 않는다. Warning 유지, 후속 어휘 개정 권고.**

`packages/shared/src/relay.ts:125` 를 직접 읽어 확인했다 — `sellEnabled`/`cancelQtyEnabled`/`cancelTradeEnabled` 에코는 `cfg && armed` 로 접힌 값이고, "발주가 나가 게이트가 소진"되면 거부와 무관하게 `false` 로 온다(Pitfall 10). `confirmAutoChecks`/훅 ⑬ 의 판정이 이 두 경우(거부 vs 소진)를 구분하지 않고 둘 다 「서버 거부」로 적는다는 지적 자체는 코드와 일치한다.

다만 도달 가능성을 코드 흐름으로 직접 따라갔다: `confirmAutoChecks`/`laidRef` 수집이 작동하는 지점은 **그 필드를 무장하려는 Set 요청 자신의 성공 에코**(즉 `preBuyEnabled`/`extraBuyEnabled` Set 이 되돌아온 그 응답)뿐이다. 매도 발주는 매수 진입 래치가 선 **이후**의 별개 사건이며, 그 무장을 요청한 Set 의 에코 시점에는 아직 발주가 나갈 수 없다(같은 주석 · `docs/strategy/limit-chaser.md` §9-2 와 일치, R5 리뷰도 이 점을 스스로 "가능성은 낮다"로 두 번 인정했다). 즉 "요청 직후 그 요청 자체가 무장과 동시에 이미 소진됐다"는 경합은 현재 코드가 이 함수를 호출하는 지점에서는 구조적으로 발생하지 않는다.

결정적으로, 이 결함이 실재하더라도 **방향은 안전한 쪽**이다 — R3-G1 원래 위험(서버가 거부했는데 「켬」으로 표시 = 방어가 선 줄 착각)과 반대로, R5-WR-02 는 "실제로 무장됐는데(소진) 사유를 「서버 거부」로 잘못 적는" 것이라 **과소주장**(방어가 없다고 오인)이지 **과대주장**(방어가 있다고 오인)이 아니다. 트레이딩 안전 도메인에서 이 둘은 위험도가 비대칭이다 — CLAUDE.md/MEMORY.md 의 "무로그 fail-safe 금지" 교훈이 경계하는 것은 후자(과대주장)다. **판정: Warning 유지, 어휘 개정("서버 거부" → 원인 중립 문구) 권고이나 블로커 아님.**

두 항목 모두 24-REVIEW-R5 의 자체 분류(critical 0 · warning 2)와 결론이 같다 — 이전 리뷰 판단을 그대로 베끼지 않고 코드·릴레이 계약·호출 경로를 직접 재추적한 결과로도 같은 결론에 도달했다.

## Info 레벨 잔여 (참고, 블로커 아님 — 누적)

| ID | 내용 | 출처 | 상태 |
|---|---|---|---|
| R3-IN-01~03, R4-IN-01~03 | round-3 검증 문서에 기록된 6건(에코 오판 잔존 · e2e 관찰 창 부재 · 디버그 로그 잔재 · 유예 조건 병합 · H4 무력 테스트 · 배너 주석 잔존) | 24-REVIEW-R3/R4 | open (변경 없음, 이번 라운드 스코프 밖) |
| R5-IN-01 | `confirmAutoChecks` 비대칭 — 「켜지 않음」 은 에코와 대조하지 않는다 | 24-REVIEW-R5 | open |
| R5-IN-02 | `laid` 수집이 주 필드 `matches` 에만 기대 — 동반 오염 이론적 경로 | 24-REVIEW-R5 | open |
| R5-IN-03 | 추가매수 줄의 「서버 거부」 는 그 제출 자체의 거부가 아님(문구 정확성 메모, UI-SPEC 의도된 결과) | 24-REVIEW-R5 | open(결함 아님) |
| R5-IN-04 | 카드 흐름 통합 테스트가 추가매수 줄(2번째 로그)을 잠그지 않음 | 24-REVIEW-R5 | open |
| R5-IN-05 | 주석·UI-SPEC 정합(「사람의 새 확정」·「다른 그룹」·JSDoc 닫힌 목록 문구) | 24-REVIEW-R5 | open |

11건 모두 Info 수준(문서 정합·경계 케이스·테스트 커버리지)이며, 이번 라운드에서 gap 으로 승격하지 않는다. R5-WR-01(후속 테스트)·R5-WR-02(어휘 개정)와 함께 다음 유지보수 라운드(quick 또는 phase 25 착수 전)에서 일괄 처리를 권고한다.

## 직접 재실행/재확인한 증거 (본 검증이 자체 실행)

| 명령/확인 | 결과 |
|---|---|
| `pnpm exec vitest run` (webapp, 본 검증 자체 실행) | 125 files / 2835 passed / 1 skipped |
| `pnpm exec vitest run` (relay, 본 검증 자체 실행) | 29 files / 665 passed(flaky 없음) |
| `git diff --stat b6a9f486..307cc4dd` | 13 files changed — webapp 소스 3 · 테스트 3 · `.planning` 문서(STATE·UI-SPEC·quick·phase-25 컨텍스트) |
| `git diff b6a9f486..307cc4dd -- <소스 3파일>` 의 `grep -nE "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` | 0건 |
| `git log --oneline b6a9f486..HEAD -- packages/shared/src/relay.ts relay/src/` | 매치 없음 — relay 무변경 |
| `git log -1 --format='%H %ad %s' --date=iso-strict` (0061d51f · 307cc4dd) | 2026-09-29T13:12/13:15+09:00 — R3 verified(12:55:00Z) 이후, htw 계획이 주장하는 시점과 일치 |
| `sed -n` 코드 직접 열람 | `limit-chaser.ts:380-489`(confirmAutoChecks·groupAutoCheckLogLine) · `use-lc-field-commit.ts:740-900`(⑬ laidRef·해소①) · `limit-chaser-form.tsx:1070-1100`((b) 소비 규칙) · `relay.ts:110-235`(Pitfall 10 무장 접힘 계약) |
| `git diff b6a9f486..307cc4dd -- webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx` | PRE_PARTIAL 상수·sellEnabled:false 단언·error level 단언 추가를 diff 로 직접 확인 |

## Requirements Coverage

24-18~24-24 및 quick-260929-htw 전부 `requirements: []` — REQUIREMENTS.md 교차검증 대상 없음, ORPHANED 없음(round-1~3 과 동일).

## Human Verification

없음. round-2 가 남긴 4개 human_verification 항목은 round-3 에서 `24-UAT.md`(86/86 pass)로 이미 종결됐다. 이번 라운드(quick-260929-htw)는 순수 로직·훅·테스트 변경이며 새로운 시각/실시간/외부서비스 확인 대상을 만들지 않았다. R5-WR-01/R5-WR-02 는 코드·릴레이 계약 직접 추적으로 판정 가능해 "사람 눈 확인"이 아니라 "후속 구현/어휘 개정 여부에 대한 개발자 판단" 범주다 — 위 절에서 독립 판정을 완료했으므로 별도 human_verification 항목으로 이월하지 않는다.

## Gaps Summary

갭 없음. round-3 의 유일한 미해결 갭(R3-G1)이 코드·테스트·전량 회귀 스위트로 닫혔음을 확인했고, round-1~3 에서 검증된 21건 truth 에 회귀가 없음을 재확인했다. 24-REVIEW-R5 가 새로 제기한 Warning 2건(R5-WR-01·R5-WR-02)은 본 검증이 이전 리뷰의 판단을 그대로 승계하지 않고 코드·릴레이 계약·호출 경로를 직접 재추적해 독립적으로 검토했으며, 둘 다 (a) 현재 관측 가능한 결함이 아니고 (b) 설령 실재하더라도 위험 방향이 "방어가 없다고 과소평가"(안전 방향)이지 "방어가 있다고 과대평가"(위험 방향, R3-G1 원래 문제)가 아니라는 근거로 **블로커로 승격하지 않는다**. 다만 은폐하지 않고 위 절에 상세 근거와 함께 기록했으며, 후속 유지보수 라운드에서 처리를 권고한다. 사용자 승인 override 3건(D-03/D-04a 재해석·구서버 끄기 규칙·WR-06 잔여 한계)은 이번 라운드에도 그대로 승계한다.

---

_Verified: 2026-09-29T14:05:00Z_
_Verifier: Claude (gsd-verifier)_
