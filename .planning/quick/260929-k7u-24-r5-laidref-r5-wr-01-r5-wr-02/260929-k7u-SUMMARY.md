---
phase: quick-260929-k7u
plan: 01
subsystem: webapp/trading (상따 자동 체크 · 필드 확정 훅)
status: complete
tags: [phase-24, R5-WR-01, R5-WR-02, R5-IN-05, auto-check, useLcFieldCommit, mutation-test]
requires:
  - quick-260929-htw (R3-G1 · 훅 ⑬ 눕힌 동반 · confirmAutoChecks)
provides:
  - 자동 체크 여섯째 사유 원인 중립 「무장 안 됨」
  - 훅 ⑬ 흐름 안 확정 3케이스 잠금(R5-WR-01)
affects:
  - webapp 카드 로그 자동 체크 줄 문구(부분 무장 시)
  - 24-UI-SPEC 선매수 자동 체크 로그 문법 닫힌 목록
tech-stack:
  added: []
  patterns: [원인 중립 사유 어휘, 변이 검증으로 술어 항별 무는 힘 증명]
key-files:
  created: []
  modified:
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/lib/__tests__/limit-chaser.test.ts
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
    - .planning/phases/24-limitchaser-buy3/24-UI-SPEC.md
    - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
    - webapp/src/components/trading/lc/use-lc-field-commit.ts
    - webapp/src/components/trading/limit-chaser-form.tsx
decisions:
  - "자동 체크 여섯째 사유는 「무장 안 됨」 — 에코 게이트 값(cfg ∧ armed)이 말하는 사실만 적고 부분 거부 · 발주 소진을 단정하지 않는다 (R5-WR-02)"
  - "lib groupAutoChecksOf 넷째 인자 이름을 훅과 같은 laid 로 통일 (기본값 NO_LAID · confirmAutoChecks 지역 변수 unarmed)"
  - "⑬ 술어의 queueRef 항은 동등 변이(M7 생존) — 잡으려고 억지 테스트를 만들지 않는다"
metrics:
  duration: 약 25분
  completed: 2026-09-29
plan_head_before: 06418f9d14fa6c9d5083a216b08fe69bbbca50e5
actuals:
  tokens: 8300
  tasks: 2
  commits: 3
---

# Phase quick-260929-k7u Plan 01: 24 R5 Warning 2건 후속 — 자동 체크 사유 원인 중립 · ⑬ 흐름 안 확정 잠금 Summary

자동 체크 「켜지 않음」 여섯째 사유를 원인을 단정하지 않는 「무장 안 됨」 으로 바꾸었다(lib · 테스트 3파일 · UI-SPEC). 훅 ⑬ 에는 「흐름 안의 확정은 laid 를 비우지 않는다」 를 3케이스로 잠갔고, 술어 변이 M3~M6 이 모두 잡힌다는 것을 실행으로 확인했다. 판정 로직과 전송 경로는 한 줄도 바꾸지 않았다.

## 선택한 사유 문구와 근거

**「무장 안 됨」** 을 택했다(계획 결정 그대로).
- 에코의 게이트 값 자체가 무장 상태(cfg ∧ armed · relay Pitfall 10)다. 그래서 관측한 사실만 말하고, 거부인지 소진인지는 단정하지 않는다.
- 전략 로그의 「무장」 · 「무장 해제」 어휘, 24 문서의 「6체크 무장」 과 같은 말이다.
- 기존 닫힌 목록과 같은 짧은 상태 명사구 모양이다.

**기각한 후보**
- 「서버 미반영」: 사용자 화면에서 「미반영」 은 이미 3초 무응답(카드 상태줄)과 저장 안 한 편집(하단 바)을 뜻한다. 「곧 설 것」 으로 읽혀 방어 과대주장 방향이라 가장 위험하다.
- 「에코 미반영」: 「에코」 는 내부 용어다.

## Task 1 — R5-WR-02 (커밋 d07ad591)

**RED 실패 목록** (기대값만 바꾼 뒤 3파일 실행: 6 failed | 364 passed). 실패 이유는 모두 reason 값이나 줄 문장 불일치다.
1. lib `confirmAutoChecks` — 요청 6 · 에코 5: skipped reason 이 옛 사유라 불일치
2. lib `confirmAutoChecks` — 예측 생략과 섞인 경우: skipped 3항 중 매도주문 reason 불일치
3. lib `groupAutoChecksOf laid` — laid 매도주문: skipped reason 불일치
4. lib `groupAutoChecksOf laid` — laid 취소: 취소 · 취소>잔량추적 reason 불일치
5. 폼 R3-WR-01 F1 — autoLines 선매수 부분 줄 문장 불일치
6. 카드 흐름 R3-WR-01 — autoPre() 선매수 부분 줄 문장 불일치

**GREEN** — `limit-chaser.ts` 변경 범위:
- `AutoCheckReason` 여섯째 멤버를 `'무장 안 됨'` 으로 바꿨다.
- JSDoc 첫 문장을 「UI-SPEC 닫힌 목록을 먼저 개정하지 않고 사유를 더하거나 바꾸지 않는다」 로 고쳤다(R5-IN-05). 원인 중립 정의와 개정 이력도 넣었다.
- 넷째 인자 이름을 `laid` 로, 기본값 상수를 `NO_LAID` 로 바꿨다.
- decide 안 사유 리터럴과 L435 주석을 새 사유로 맞췄다.
- `confirmAutoChecks` JSDoc 을 원인 중립으로 고쳤다. 지역 변수 이름은 `unarmed` 다.

판정 조건 · 정렬 · `AutoCheckEcho` · `groupAutoCheckLogLine` 은 건드리지 않았다. 대상 3파일은 370 passed 이고 typecheck 는 green 이다.

**UI-SPEC** 은 L403 · L404 · L407 만 바꿨다.
- L403 닫힌 목록 여섯째 항: `무장 안 됨`, 「원인을 단정하지 않는다」, 「그룹 켬 자동 체크(다른 그룹 · 같은 그룹 재확정 모두)」, 개정 표시.
- L404 확정 불릿.
- L407 예시 문장.

L27 · L416 · L566 · L579 · L588 은 diff 에 없다.

**회귀**: ⑲ · D-35 · GC-WR-04 · R3-WR-02 · 카드 24-07 · lib 전부 선 케이스는 기대값 수정 없이 통과했다.

**e2e 확인**: `webapp/e2e` 에서 자동 체크 사유 문자열을 단언하는 곳은 없다(grep). P24-3 은 「선매수 자동 체크 — 켬: 」 포함 검사만 한다.

## Task 2 — R5-WR-01 · R5-IN-05 (커밋 c8daa53f)

훅 R3-G1 describe 에 세 케이스를 더했다. 현재 코드에서 곧바로 green 이었다(훅 파일 112 passed).
- **답 대기 장벽**: 선매수 sent → 부분 무장 에코(popAfterSeq 섬 · 대기 비어 있음) → 추가매수 queued → 답 신호 → 전송 2. 이 흐름에서 동반 함수가 받은 laid 는 모두 `[sellEnabled]` 이고(대기 진입 계산 포함), `cfgs()[1].sellEnabled` 는 false 다.
- **결과 모름 장벽**: 추가매수 in-flight → `unacked` 타임아웃으로 orphan 만 남는다 → sweepEnabled queued → `unacked:false` 와 답 신호를 함께 보내 꺼낸다 → 전송 3. laid 는 모두 `[sellEnabled]`, `cfgs()[2]` 는 sweep true · sell false 다.
- **in-flight 중**: 추가매수 in-flight 동안 sweepEnabled queued → 추가매수 성공 에코 → 답 신호 → 전송 3. laid 는 모두 `[sellEnabled]`, `cfgs()[2].sellEnabled` 는 false 다.

### 변이 표 (htw M1 · M2 번호를 잇는다)

변이마다 순서를 지켰다: 적용 → 훅 테스트 파일 실행 → `git checkout --` → `git diff --quiet HEAD --` 확인. 다섯 변이 모두 되돌린 뒤 diff clean 이었다. 그다음에 주석을 편집했다.

| 변이 | 내용 | 실패한 케이스 | 판정 |
|------|------|---------------|------|
| M3 | ⑬ 조건 전체를 `true` 로 | R5-WR-01 3케이스 전부 (3 failed · 109 passed) | killed |
| M4 | `popAfterSeqRef.current === null` 항 삭제 | 답 대기 장벽 (1 failed) | killed |
| M5 | `orphanRef.current === null` 항 삭제 | 결과 모름 장벽 (1 failed) | killed |
| M6 | `inflightRef.current === null` 항 삭제 | in-flight 중 (1 failed) | killed |
| M7 | `queueRef.current.length === 0` 항 삭제 | 없음 — 훅 112 passed, trading 전체 33파일 1,412 passed 도 통과 | **survived (동등 변이)** |

**M7 이 살아남는 근거**: 대기열은 busy(in-flight · 답 대기 장벽 · 결과 모름 장벽) 때만 채워진다. 장벽이 끝나는 모든 경로는 대기열을 비운다.
- drain 은 한 건을 보내 in-flight 를 세우거나 대기열을 비울 때까지 돈다.
- failQueue 는 대기열을 비운다(failInflight · 고아 타이머).
- 끊김 갈래도 대기열을 비운다.

그래서 commit 시점에 「대기열만 비지 않은」 상태는 없다. 이 항을 잡으려고 억지 테스트는 만들지 않았다(계획 지시).

### 주석 정합 (로직 무변경)

훅 `use-lc-field-commit.ts` 에서 고친 곳:
- ⑬ 헤더: 원인 중립 뜻, 「무장 안 됨」, 「흐름이 빈 상태의 새 확정(사람 · serverFold 모두 — `dropMasterAfterServerFold` 도 같은 commit)」, 흐름 안 확정은 비우지 않음과 R5-WR-01 잠금, 동등 항 한 마디, 한계 한 줄.
- `LcCompanions` JSDoc 둘째 인자.
- `laidRef` JSDoc.
- 술어 옆 주석.

폼 `limit-chaser-form.tsx` 에서는 주석 세 곳(L1006 · L1063 · L1089)을 「무장 안 됨」 으로 바꿨다. L532 프레임 거부 주석은 그대로 뒀다.

커밋 diff 에서 두 소스의 변경 줄은 전부 주석이다. `//` · ` *` 줄이거나 기존 `/* */` 블록 안의 줄이다.

훅 테스트의 `recordingCompanion` 주석에 있던 「폼의 refused 판정」 도 「lib laid 판정」 으로 맞췄다. describe JSDoc 에는 흐름 안 확정 한 줄을 더했다.

## 검증

- webapp 전량(`pnpm --filter @gh-radar/webapp run test`): **125 파일 · 2,838 passed · 1 skipped** — 이 계획이 더한 3케이스 포함. htw 최종(77파일 · 2,225) 뒤로 다른 작업의 테스트가 늘어서 직접 비교는 하지 않는다. 이 계획이 더한 수는 +3 이다(lib 케이스는 이름만 바뀌었다).
- typecheck(`tsc --noEmit && tsc -p tsconfig.e2e.json`): green.
- `grep -rn "(서버 거부)" webapp/src .planning/phases/24-limitchaser-buy3/24-UI-SPEC.md` → 0.
- lib `'무장 안 됨'` 3자리(유니온 · decide · confirmAutoChecks).
- 옛 사유 문자열이 남은 곳은 서버 ERROR 거부 문맥뿐이다: 카드 흐름 L14 · L409, 폼 L532.
- 두 커밋 메시지에 Co-Authored-By 는 0 이다.

## 커밋

| Task | 커밋 | 파일 |
|------|------|------|
| 1 | d07ad591 `fix(quick-260929-k7u): 자동 체크 여섯째 사유를 원인 중립 「무장 안 됨」 으로 …` | limit-chaser.ts · limit-chaser.test.ts · limit-chaser-form.test.tsx · strategy-card-flow.test.tsx · 24-UI-SPEC.md |
| 2 | c8daa53f `test(quick-260929-k7u): ⑬ 흐름 안 확정은 눕힌 동반을 비우지 않는다 …` | use-lc-field-commit.test.tsx · use-lc-field-commit.ts · limit-chaser-form.tsx |

`actuals.commits: 3` 은 ledger 기준(`06418f9d..HEAD`)으로 잰 값이다. 그 사이에 동시 세션의 `97710ea7 docs(25): UI 디자인 계약 …` 이 끼어 있다(Phase 25 파일만 · 이 계획 파일과 겹침 없음). 이 계획의 코드 커밋은 2개다.

## Deviations from Plan

소스 동작 편차는 없다. 계획대로 실행했다. 알려 둘 사실은 두 가지다.

1. **[동시 세션] Task 1 커밋이 원격에 올라갔다.** Task 1 커밋 뒤에 동시 세션이 `97710ea7`(Phase 25 문서)을 커밋하고 브랜치를 push 했다. 그래서 d07ad591 은 `origin/gsd/phase-24-limitchaser-buy3` 에 이미 있다. 이 실행자는 push 하지 않았다. c8daa53f 는 로컬에만 있다(ahead 1). 작업 트리의 `.planning/STATE.md` 수정도 이 실행자의 변경이 아니라서 스테이징하지 않았다.
2. **[범위 내 정합] 훅 테스트의 옛 lib 인자 이름 주석.** `recordingCompanion` 주석의 「refused 판정」 을 「lib laid 판정」 으로 바꿨다. lib 인자 이름을 바꾼 결과를 따라간 것이다.

## 잔여 한계

- R5-IN-01~04 는 범위 밖이다. 새 어휘 덕에 R5-IN-03 의 「두 번 거부됐다」 오독이 줄 수는 있지만, 그 항목을 닫았다고 주장하지 않는다.
- 발주 소진도 laid 에 들어가므로, 같은 흐름의 대기 그룹 켬은 그 게이트를 재무장하지 않는다. 다만 무장을 요청한 Set 의 성공 에코 시점에는 발주가 나갈 수 없어, 현재 호출 경로에서는 도달하지 않는다(24-VERIFICATION-R4 독립 판정 · ⑬ 헤더 「한계」 줄).
- ⑬ 술어의 queueRef 항은 동등 항이라 테스트로 잠기지 않는다(M7).

## Self-Check: PASSED

- 수정 파일 8개가 모두 있다.
- d07ad591 · c8daa53f 가 `git log` 에 있다.
- 변이 뒤 훅 소스 diff clean 을 확인했다(M3~M7 각각).
