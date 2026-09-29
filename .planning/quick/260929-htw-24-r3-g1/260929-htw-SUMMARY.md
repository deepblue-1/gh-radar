---
phase: quick-260929-htw
plan: 01
subsystem: webapp/trading (상따 자동 체크 판정 · 필드 확정 훅 · 폼)
status: complete
tags: [limit-chaser, auto-check, partial-reject, echo, lc.set, 24-VERIFICATION-R3, 24-REVIEW-R4]
requirements: [R3-G1, R4-WR-01]
requires:
  - 24-VERIFICATION-R3 (R3-G1)
  - 24-REVIEW-R4 (R4-WR-01)
provides:
  - AutoCheckReason 「서버 거부」 (UI-SPEC 닫힌 목록 개정)
  - confirmAutoChecks(auto, server) — 자동 체크 예측을 성공 에코로 확정 (순수 함수)
  - groupAutoChecksOf 넷째 인자 refused — 서버가 눕힌 동반은 다시 켜지 않음
  - 훅 ⑬ 눕힌 동반 laidRef — LcCompanions 함수 둘째 인자 laid
affects:
  - webapp/src/lib/limit-chaser.ts
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/lc/use-lc-field-commit.ts
  - .planning/phases/24-limitchaser-buy3/24-UI-SPEC.md
tech-stack:
  added: []
  patterns:
    - "사후 확정 — 예측(groupAutoChecksOf)을 성공 에코로 대조해 로그 사실화(confirmAutoChecks)"
    - "사전 제외 — 흐름 수명 기억(훅 laidRef)을 동반 함수 둘째 인자로 넘김 · 흐름이 빈 뒤 새 확정에서 비움"
key-files:
  created: []
  modified:
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/lib/__tests__/limit-chaser.test.ts
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/src/components/trading/lc/use-lc-field-commit.ts
    - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
    - .planning/phases/24-limitchaser-buy3/24-UI-SPEC.md
decisions:
  - "R3-G1 — 자동 체크 로그 줄은 confirmAutoChecks(예측, 성공 에코)로 확정한다. 요청했으나 에코에 서지 않은 항목은 「켬」 에서 빠지고 「켜지 않음(서버 거부)」 · error 로 옮긴다. 가격 조각도 에코에 선 칸만 남는다. 전부 섰으면 줄은 종전과 같다"
  - "R4-WR-01 — 선택지 (ii) 채택. 훅 ⑬ laidRef 가 해소 ① 성공 때 켜 달라 실은 동반 중 에코에 서지 않은 필드를 모아 동반 함수 둘째 인자로 넘기고, 흐름이 빈 상태의 사람의 새 확정에서 비운다. 선택지 (i) 수용은 기각"
metrics:
  duration: "약 9분 (13:07 ~ 13:16 KST)"
  completed: 2026-09-29
  tasks: 2
  files: 8
estimate:
  tokens: 120000
  tasks: 2
actuals:
  tokens: 7640
  tasks: 2
  commits: 2
plan_head_before: b6a9f486cf56a980795473c94112bae9da9f7f75
commits: 2
---

# Quick 260929-htw: 24-VERIFICATION-R3 R3-G1 (= 24-REVIEW-R4 R4-WR-01) 수정 요약

부분 거부 뒤의 「선매수 · 추가매수 자동 체크」 로그 줄을 성공 에코로 확정한다(`confirmAutoChecks`). 이제 서버가 눕힌 항목은 「켬」 이 아니라 「켜지 않음: …(서버 거부)」 · error 로 적힌다. 같은 뿌리의 부수 효과도 함께 고쳤다. 대기하던 추가매수가 방금 서버가 눕힌 매도주문을 다시 싣던 문제다. 훅이 「이 흐름에서 서버가 눕힌 동반」 을 기억하고(⑬ `laidRef`), 동반 함수가 그 항목을 다시 켜지 않는다.

**결론: R3-G1 과 R4-WR-01 은 닫혔다.** 24-VERIFICATION-R3 missing 3항이 모두 해소됐다.
- ① `confirmAutoChecks` 로 판정을 lib 한 곳에 모았다.
- ② F1 · 카드 흐름의 기대값을 사실대로 교정했다.
- ③ 부수 효과는 (ii) 를 택했다. 훅 ⑬ 에 흐름 수명 기억을 두었다.

## 커밋

| Task | 커밋 | 내용 |
|---|---|---|
| 1 | `0061d51f` | fix — lib `confirmAutoChecks` · 사유 「서버 거부」 · `groupAutoChecksOf` refused · 폼 (b) 배선 · F1 기대값 교정 · ⑲ 에코 픽스처 사실화 · UI-SPEC 개정 |
| 2 | `307cc4dd` | fix — 훅 ⑬ `laidRef` · `companionsAt` 4곳 laid 전달 · 폼 동반 함수 laid 배선 · 훅 R3-G1 4케이스 · F1 확장 · 카드 흐름 정확 문장 잠금 |

- 두 커밋 모두 메시지가 한국어이고 공동 저자 트레일러가 없다(`grep -c Co-Authored-By` = 0).
- push · 배포는 하지 않았다. `git log @{u}..HEAD` 에 두 커밋이 남아 있다.
- 커밋 수 측정: 계획 시작 기준 `b6a9f486..HEAD` 는 3이다. 그중 1건(`97c0ce37 docs(25)`)은 동시에 돌던 다른 세션의 커밋이다. 이 계획의 커밋은 `git rev-list --count --grep quick-260929-htw b6a9f486..HEAD` 로 센 **2** 다.

## 설계 선택

**사후 확정 — `confirmAutoChecks(auto, server)`** (lib 한 곳 · 순수 함수)
- `turnedOn` 에는 `server[필드] === true` 인 항목만 남긴다.
- 나머지 항목은 `{ item, reason: '서버 거부' }` 로 skipped 에 합치고, 항목 정본 순서(`AUTO_CHECK_FIELD` 키 순서)로 정렬한다.
- `companions` 에는 에코가 같은 값으로 선 것만 남긴다(플래그 · 가격 둘 다 해당). `priceFilled` 는 남은 가격이 없으면 null 이다.
- `groupAutoCheckLogLine` 은 바꾸지 않았다. 라벨과 level 은 확정 결과에서 그대로 따라 나온다.
- 에코 타입은 `AutoCheckEcho = Pick<LimitChaserFormValues, 6플래그 | sellOrderPrice | sellWatchPrice>` 다. `RelayLimitChaser` 가 그대로 들어가는 것을 tsc 로 확인했다.

**사전 제외 — `groupAutoChecksOf(gate, values, upper, refused)`**
- 판정 순서는 다음과 같다.
  1. 이미 켜진 항목은 목록 밖이다.
  2. 예측의 첫 실패 사유를 쓴다.
  3. refused 에 있으면 「서버 거부」 다.
  4. 나머지는 켠다.
- `decide` 가 그 항목이 받은 사유를 돌려주도록 바꿨다. 그래서 취소>잔량추적 의 「취소가 켜지지 않음」 사유는 고정 문자열이 아니라 취소가 실제로 받은 사유를 따른다. 기존 예측 결과는 달라지지 않았다(기존 표는 무수정으로 통과).

**기억을 폼이 아니라 훅에 둔 이유 — 실행 순서**
- 폼의 (b)(줄 소비)와 훅의 대기 꺼내기는 흐름마다 실행 순서가 다르다.
  - 폼 단독 F1 에서는 (b) 가 먼저 돈다.
  - 카드 흐름에서는 답 신호 증가와 보낸 성공이 한 렌더로 합쳐져 꺼내기가 먼저 돈다.
- 그래서 폼 슬롯으로 기억을 만들면 순서에 따라 기억이 비어 버린다. 훅은 in-flight 가 실제로 실은 동반(`inf.companions`)과 그 답 에코를 같은 실행에서 보는 유일한 곳이다.
- 기억의 수명은 **흐름**이다. `commit` 의 disabled 가드 뒤, shown 계산 앞에서 흐름이 비었는지 확인한다. 비었다는 것은 in-flight · 대기열 · `popAfterSeqRef` · `orphanRef` 가 모두 없다는 뜻이고, 그러면 기억을 비운다. 새 클릭은 새 의도이므로 평소대로 요청한다.
- `companionsAt` 을 부르는 4곳(sendNow · drain no-op · failQueue · commit shown)이 모두 같은 `laidRef.current` 를 넘긴다(acceptance grep: 호출 4줄 · 누락 0).

**선택지 (i) 수용 기각 근거**
- 로그는 사실만 적어야 한다(무로그 fail-safe 금지).
- (i) 는 거의 확실히 같은 ERROR 를 다시 부를 재요청을 알면서 두는 셈이다. 서버가 방금 거부한 무장을 사람 모르게 다시 보내게 된다.

## RED → GREEN 기록

**Task 1 RED** (`vitest run limit-chaser.test.ts limit-chaser-form.test.tsx`) — 7건 실패
- `confirmAutoChecks` 4케이스: `TypeError: confirmAutoChecks is not a function`(미구현 export).
- refused 2케이스: `expected [] to deeply equal [{ item: '매도주문', reason: '서버 거부' }]`. 넷째 인자가 무시된 결과다. 나머지 2케이스(이미 켜짐 · 생략 = 종전)는 구현 전에도 참이라 통과했다.
- F1: 문장 불일치로 실패했다.
  - 기대: `켬: 매도>잔량추적 … / 켜지 않음: 매도주문(서버 거부) / …` · `error`
  - 실제: `켬: 매도주문 · 매도>잔량추적 … / 매도 주문가격·비교가격 = 상한가 150,800원` · `info`

**Task 1 GREEN** — 대상 3파일 370건 green, tsc green.

**Task 2 RED — 부수 효과가 실제로 재현됐다** (수정 전 실행) — 6건 실패
- 폼 F1: `limit-chaser-form.test.tsx:3221` 의 `expect(lastConfig().sellEnabled).toBe(false)` 가 `expected true to be false` 로 실패했다. 두 번째 lc.set 에 매도주문이 다시 실렸다는 뜻이다.
- 카드 흐름: `strategy-card-flow.test.tsx:1811` 의 `lcSets()[1].cfg` 에서 `- "sellEnabled": false / + "sellEnabled": true` 로 실패했다.
- 훅 R3-G1 4케이스: laid 가 전달되지 않아(`undefined`) 동반 함수의 `[...laid]` 가 실패했다.
- 계획 판독(「재현된다」)이 실행으로 확인됐으므로, 예외 경로(구현 생략 · refused 되돌림)는 타지 않았다.

**Task 2 GREEN** — 대상 3파일 383건 green, tsc green.

## 변이 확인

각 변이 뒤에는 `git checkout -- <file>` 으로 되돌렸다. 이어 `git diff --quiet HEAD -- webapp` 가 통과했고, 전체 green 을 다시 확인했다.

| 변이 | 폼 F1 확장 | 카드 흐름 | 훅 R3-G1 |
|---|---|---|---|
| M1 — 훅 matches 분기의 laid 수집 줄 주석 처리 | **실패** | **실패** | **3/4 실패**(laid 전달 · 싣지 않음 · 흐름 빈 뒤). 「에코가 매도까지 세움 → 빈 laid」 는 변이와 무관하게 참이라 통과(의도대로) |
| M2 — 폼 동반 함수가 laid 를 넘기지 않음 | **실패** | **실패** | 통과(훅 단위 테스트는 폼 함수를 쓰지 않는다 — 의도대로) |

두 변이 모두 폼과 카드 흐름 통합 잠금이 잡는다. 훅 층은 M1 을 잡는다.

## 기존 테스트 조정

- **폼 ⑲ 「생략이 있으면 error 줄 — 취소 매수잔량 0」** (Task 1): 성공 에코 픽스처 `{ ...s, buyEnabled, preBuyEnabled }` 가 요청 항목을 빠뜨리고 있었다. 빠진 것은 매도주문 · 매도>잔량추적 · 매도>체결 · 취소>체결 · 상한가로 채운 가격이다.
  - 판정: 이 테스트의 의도는 「예측 생략(취소 매수잔량 0)만 있고 나머지는 섬」 이다.
  - 조치: 에코 픽스처를 요청대로 채웠다. 기대값(`error` · `' / 켜지 않음: 취소(취소 매수잔량 0) · 취소>잔량추적(취소 매수잔량 0)'` 포함)은 **그대로** 두었다.
- **폼 R3-WR-01 F1** · **카드 흐름 R3-WR-01**: 계획이 지정한 기대값 교정이다. 잘못 잠겨 있던 `PRE_FULL_LINE · info` 를 부분 거부 문장 · error 로 바꾸고, 두 번째 cfg 의 `sellEnabled false` 를 더했다.
- 그 밖의 ⑲ · D-35 · GC-WR-04 · R3-WR-02 폼 케이스와 카드 24-07 은 기대값 수정 없이 통과한다.

## 테스트 수

| 시점 | `vitest run src/components/trading src/lib` | tsc |
|---|---|---|
| 시작 전 기준선 | 77파일 · 2,213 passed · 1 skipped | — |
| Task 1 뒤 | 77파일 · 2,221 passed · 1 skipped (+8 = lib confirmAutoChecks 4 · refused 4) | green |
| Task 2 뒤 (최종) | 77파일 · **2,225 passed · 1 skipped** (+4 = 훅 R3-G1 4) | **green** |

- 폼 F1 과 카드 흐름 케이스는 기존 `it` 을 확장했으므로 건수 변화가 없다.
- 대상 파일 실행 결과:
  - Task 1: 3파일(lib · 폼 · 카드 흐름) 370건
  - Task 2: 3파일(폼 · 카드 흐름 · 훅) 383건
  - lib 단독: 96건

## e2e 미실행 근거

e2e(Playwright)는 돌리지 않았다(작은 수정 · 교훈). `webapp/e2e` 의 자동 체크 단언은 두 곳뿐이다.
- P24-3 의 `toContainText('선매수 자동 체크 — 켬: ')` 포함 검사
- P24-12 의 `'추가매수 자동 체크 — 켬: '` 포함 검사

둘 다 전부 선 시나리오이고, 부분 거부 시나리오는 없다(grep 확인). 전부 선 경우의 줄은 불변이다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 테스트 픽스처] 폼 ⑲ 생략 케이스의 성공 에코를 요청대로 채웠다**
- **Found during:** Task 1 GREEN 회귀
- **Issue:** 에코가 요청 항목을 빠뜨렸다. 사후 확정이 이를 사실대로 「서버 거부」 로 읽어 `toContain` 이 실패했다.
- **Fix:** 계획의 판정 규칙(의도가 「전부 섬」 이면 픽스처를 사실화)을 따랐다. 기대값은 그대로 두었다.
- **Files modified:** `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx`
- **Commit:** `0061d51f`

**2. [기록] 훅 「흐름이 빈 뒤 새 확정」 케이스의 새 확정 필드를 후매수가 아니라 한방(`sweepEnabled`)으로 했다**
- 처음 쓴 `postBuyEnabled` 켜기는 훅 테스트 에코 픽스처의 후매수 값(반등% 0 등)에 걸려 범위 가드에서 `blocked` 가 났다.
- 이 케이스가 잠그는 것은 「흐름이 빈 뒤 새 확정의 동반 함수가 빈 laid 를 받는다」 이다. 그래서 가드와 무관한 토글 필드로 바꿨다. 단언 내용은 같다: 빈 laid · 세 번째 cfg `sellEnabled true` · 전송 3.

그 밖에는 계획대로 실행했다.

## 잔여 한계

- **이미 켜져 있던 항목을 서버가 눕힌 경우는 자동 체크 줄 밖이다.** 자동 체크가 요청한 항목이 아니므로 `confirmAutoChecks` 는 turnedOn 에 없던 항목을 건드리지 않는다. 이때는 서버 ERROR 원문 줄이 말한다.
- D-01 마스터 동반의 재요청은 다루지 않았다(범위 밖). D-32 로 주 필드가 함께 눕으므로 성공 경로가 없다.
- 기억(⑬)은 in-flight 가 실제로 실은 불리언 동반 중 `true` 만 본다. 끄는 방향의 동반(D-02 마스터 끄기 등)은 대상이 아니다.
- R4-IN-01~03 · R3-IN-01~03 은 범위 밖이다.

## Threat Flags

없음. 새 네트워크 표면 · 저장 · 외부 호출이 없다. laid 는 동반 계산의 입력일 뿐이고 전송 경로는 바뀌지 않았다(T-htw-02). 새 테스트는 모두 전송 수를 센다: 폼 F1 = 2 · 카드 흐름 lcSets = 2 · 훅 케이스별 send 1~3.

## Self-Check: PASSED

- 수정 파일 8개가 존재한다.
- 커밋 `0061d51f` · `307cc4dd` 가 존재한다(`git log` 확인).
- acceptance grep 을 모두 통과했다: `export function confirmAutoChecks` 1 · `groupAutoCheckLogLine(confirmAutoChecks(` 1 · `groupAutoChecksOf(autoGate, base, upperLimitRef.current, laid)` 1 · companionsAt 호출 4줄 · laidRef 누락 0 · UI-SPEC 닫힌 목록 「서버 거부」 · 훅 테스트 R3-G1 2줄.
