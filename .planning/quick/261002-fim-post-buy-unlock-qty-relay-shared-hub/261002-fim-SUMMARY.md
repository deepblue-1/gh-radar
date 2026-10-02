---
phase: quick-261002-fim
plan: 01
subsystem: relay · shared · webapp(상따 후매수)
tags: [limit-chaser, post-buy, flatbuffers, relay, a11y]
status: complete
requires:
  - gh-trade 259bc869 생성물(relay/src/generated 2파일 — 작업 전 이미 working tree 반영)
provides:
  - relay readLimitChaser postBuyUnlockQty 디코드(vtable 136 · 부재 0)
  - shared RelayLimitChaser.postBuyUnlockQty · 런타임 에코 7 · S→C 전용 12
  - 웹 후매수 「발동잔량」 칸(펼침 · 접힘) 회색 해제선 + sr-only 「잠금 해제선」
affects: [relay 60/64/11.2 에코, ws lc 프레임(59키), 전략 로그 값 변경 판정]
tech-stack:
  added: []
  patterns: [S→C 전용 필드 합류 선례(quick-260930-fi4 3aac9a27) 그대로]
key-files:
  created: []
  modified:
    - packages/shared/src/relay.ts
    - relay/src/dma/envelope.ts
    - relay/src/ws/protocol.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/tests/fanout.test.ts
    - relay/tests/protocol.test.ts
    - webapp/src/test-fixtures/limit-chaser.ts
    - webapp/src/components/trading/lc/lc-fields.ts
    - webapp/src/components/trading/lc/setting-group.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/strategy-log.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/src/components/trading/__tests__/strategy-log.test.tsx
    - webapp/src/components/trading/lc/__tests__/lc-fields.test.ts
    - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
decisions:
  - "P-1 접힌 요약 kv 도 같은 규칙 — off:true 회색 + 선택 sr 접두"
  - "P-2 DerivedRow 확장은 선택 prop 2개(mutedValue · mutedSrText) — 발동잔량 행만 사용"
  - "P-3 POST_BUY_UNLOCK_SR_TEXT('잠금 해제선') 하나가 정본 — 펼침 · 요약 공용"
  - "P-4 title 툴팁 등 추가 설명 없음"
metrics:
  duration: 5min
  completed: 2026-10-02
commit: "pending — orchestrator single commit"
commits: 0
plan_head_before: b30f07c2
actuals:
  tokens: 14000
  tasks: 3
  commits: 0
---

# Quick 261002-fim: 후매수 잠금 해제선(post_buy_unlock_qty) relay → shared → hub → 웹 Summary

gh-trade 259bc869 의 S→C 전용 `post_buy_unlock_qty`(vtable 136)를 relay 파서가 읽고(부재 0 · C→S 미적재), shared 계약의 런타임 에코(7)로 합류시켜 hub 무변경으로 ws lc 프레임(59키)까지 흘리며, 웹 상따 후매수 「발동잔량」 칸은 발동잔량 0 · 해제선 > 0 일 때 해제선 수를 `--muted-fg` 회색 + sr-only 「잠금 해제선」으로 보인다(펼침 · 접힘 동일).

## 커밋 · 배포 상태 (L-6)

- **커밋 0 · 스테이징 0 · push 없음 · relay 배포 없음.** 모든 변경(생성물 2파일 + 코드 + 테스트 + 계획 문서)은 working tree 에 미커밋으로 남아 있고 오케스트레이터가 사용자 확인 뒤 커밋 1개로 묶는다. 커밋 해시: pending — orchestrator single commit.
- 배포 순서(메인 세션 몫): **relay 먼저 → 검증 → push**(push 가 곧 webapp 프로덕션 배포).
- 서버(120 · 127)가 259bc869 를 배포하기 전에는 필드가 부재 → relay 가 0 으로 디코드 → 화면 · 로그가 종전과 같다.
- sync-relay-schema.sh 미실행 · relay/src/generated 미편집 — 두 파일 hash 92c37a79… · 371db682… 불변 확인.

## Tasks

| # | 이름 | 결과 |
|---|------|------|
| 1 | 트레이서: 60 에코 → relay 디코드 → shared → 웹 발동잔량 칸 회색 해제선 | 완료 · 미커밋 |
| 2 | relay 경계: hub 통과(59키) · lc.set 인바운드 드롭 · fake-gateway 슬롯 136 부재 | 완료 · 미커밋 |
| 3 | 웹 확장: 접힌 요약 kv · DerivedRow 단위 · 해제선만 바뀐 에코 로그 0줄 | 완료 · 미커밋 |

## 구현 요점

- **relay** `readLimitChaser` 에 `postBuyUnlockQty: t.postBuyUnlockQty()` — 계산 없음. `buildSetLimitChaserReq` 는 `addPostBuyUnlockQty` 를 호출하지 않는다(미적재 주석 추가). 테스트 헬퍼 `emitSetLimitChaser` 는 주입 가능.
- **shared** `RelayLimitChaser.postBuyUnlockQty` + `LIMIT_CHASER_SERVER_RUNTIME_FIELDS` 끝에 합류 → `RelayLimitChaserInput` 에서 타입으로 빠지고, webapp `VALUE_COMPARE_SKIP` · `RUNTIME_ONLY_SKIP` 은 스프레드로 자동 반영(strategy-log.tsx 코드 무변경 · 문서만).
- **hub** `relay/src/hub/subscription-hub.ts` diff 0 — 새 fanout 테스트 ⑰-unlock 이 통과로 증명.
- **웹** `DerivedRow` 우선순위: value > 0 → 종전 `--up` 강조 / value 0 · mutedValue > 0 → sr-only 접두 + `data-muted-value` 회색 수(aria-hidden 아님) / 그 밖 → 종전 「—」 + sr-only 「없음」. `lcSummaryOf('post-buy')` 의 발동잔량 kv 도 3갈래(해제선 갈래만 `sr` 키). `GroupSummary` 는 `kv.sr` 이 있을 때만 값 앞 sr-only span.

## 판단 사항 (플래너 재량 P-1~P-4 — 채택)

- **P-1** 접힌 카드 요약 줄(`lcSummaryOf('post-buy')` 「발동잔량」 kv)에도 같은 규칙 — 펼침은 회색 수, 접힘은 「—」 이면 같은 칸이 두 말을 한다. 기존 `off: true` 로 회색, 스크린리더 오독(「발동잔량 264,000주」) 방지로 선택 `sr` 접두.
- **P-2** DerivedRow 확장은 선택 prop 2개(`mutedValue` · `mutedSrText`) — 발동잔량 행만 쓰고 기준선 행 · 다른 호출처 무변경.
- **P-3** sr 문구 정본은 `lc-fields.ts` 의 `POST_BUY_UNLOCK_SR_TEXT = '잠금 해제선'` 하나 — 펼친 행 · 요약 kv 공용.
- **P-4** 회색 수에 `title` 툴팁 등 추가 설명 없음(gh-trade 클라와 같은 표시).

## 검증 결과

| 명령 | 결과 |
|------|------|
| shared typecheck · build | 통과 |
| relay typecheck · typecheck:tests | 통과 |
| relay vitest 전체 (`pnpm --filter @gh-radar/relay run test`) | 35 files · 902 tests 통과 |
| relay envelope.test 단독 | 155 통과 |
| webapp vitest `src/components/trading src/lib` | 90 files · 2514 통과 · 1 skipped(기존) |
| webapp limit-chaser-form.test 단독 | 217 통과 |
| webapp typecheck (tsc + e2e tsconfig) | 통과 |
| 생성물 hash · `git diff --name-only -- relay/src/generated` | 92c37a79… · 371db682… 그대로 · 그 2파일뿐 |
| subscription-hub.ts diff | 0 |
| 스테이징 · 커밋 | 0 · 0 (HEAD b30f07c2 그대로) |
| 남은 vitest · tsc 프로세스 | 없음 |

RED 확인: Task 1 폼 테스트(「264,000주」 미발견), Task 2 fanout 키 수 58 단언 2건, Task 3 요약 kv · GroupSummary sr 2건이 구현 전 실패 → 구현 후 통과. strategy-log 새 describe 와 DerivedRow 단위 3건은 shared 런타임 목록 합류 · Task 1 구현 직후라 처음부터 통과(설계상 기대 — 코드 무변경 증명 목적).

## Deviations from Plan

- Task 1 의 relay 파서(②)는 파서 테스트(③)보다 먼저 편집해 envelope.test 의 RED 를 따로 관측하지 않았다(트레이서 task · tdd 표시 없음). 새 ⑤-unlock-qty 와 ① 59키 단언은 구현 후 통과 확인. 그 밖 계획대로.
- webapp typecheck 가 인라인 RelayLimitChaser 리터럴을 지적하지 않아 픽스처 외 추가 수정은 없었다.

## Known Stubs

없음.

## Self-Check: PASSED

- 수정 파일 17개 + 생성물 2개 모두 `git status` 에 M 으로 존재.
- 커밋은 의도적으로 0(L-6 · 오케스트레이터 단일 커밋).
