---
phase: quick-260930-fi4
plan: 01
subsystem: relay · shared · webapp (상따 미체결 진행률 · 전략 로그)
status: complete
tags: [flatbuffers, relay, queue-progress, limit-chaser, strategy-log, gh-trade-sync]
requires:
  - gh-trade master a09dfc8b (스키마 d303fe9f) — first_filled · extra_buy_abandon_qty · OrderGroup 7/8 · buy_watch_side 슬롯 24 봉인(a3610261)
provides:
  - RelayQueueProgressItem.firstFilled (83 → hub → unf.progress → 웹 스토어)
  - RelayLimitChaser.extraBuyAbandonQty (60/64/11.2 공용 디코더, S→C 런타임)
  - 83 보조행 WinForms 문구 「{그룹} · N주」 · 「· 0주」 · 「· 체결 시작」
  - 전략 로그 「추가매수 포기 · 최대 초과 N」
affects: [relay 배포(미실행), webapp push(미실행)]
tech-stack:
  added: []
  patterns: ["봉인 슬롯은 생성 접근자 대신 vtable 원시 읽기로 부재 증명", "S→C 런타임 필드는 shared const 파생으로 값비교·런타임전용 판정에서 자동 제외"]
key-files:
  created: []
  modified:
    - relay/src/generated/StockDMA.fbs
    - relay/src/generated/stock-dma/order-group.ts
    - relay/src/generated/stock-dma/queue-progress-item.ts
    - relay/src/generated/stock-dma/set-limit-chaser.ts
    - relay/src/dma/envelope.ts
    - relay/src/hub/subscription-hub.ts
    - relay/src/ws/protocol.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/tests/hub.test.ts
    - relay/tests/fanout.test.ts
    - packages/shared/src/strategy-event.ts
    - packages/shared/src/relay.ts
    - webapp/src/lib/queue-progress.ts
    - webapp/src/components/orderbook/unfilled-progress.tsx
    - webapp/src/components/orderbook/account-panel.tsx
    - webapp/src/components/trading/strategy-log.tsx
    - webapp/src/test-fixtures/limit-chaser.ts
    - webapp/src/lib/__tests__/queue-progress.test.ts
    - webapp/src/components/orderbook/__tests__/unfilled-progress.test.tsx
    - webapp/src/components/orderbook/__tests__/account-panel.test.tsx
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/components/trading/__tests__/strategy-log.test.tsx
    - webapp/e2e/specs/unfilled-progress.spec.ts
decisions:
  - "P-1: compact(모바일 r3)도 row 와 같은 문구 「{그룹} · N주」 — 차이는 레이아웃뿐"
  - "P-2: first_filled 는 near 가 아니다 — 채움 --primary(muted 면 --faint), data-first-filled, 새 토큰 0"
  - "P-3: buy_watch_side 슬롯 24 봉인까지 생성물 4파일 반영 — relay 는 \"0\" 상수, C→S 부재는 vtable 단언"
  - "P-4: 포기 성립 에코는 「추가매수 무장 해제」 대신 「추가매수 포기 · 최대 초과 N」 한 조각"
  - "P-5: 옛 relay 관용 — firstFilled 는 === true, 수량은 > 0 판정"
metrics:
  duration: "약 10분 (11:25 ~ 11:35 KST)"
  completed: 2026-09-30
actuals:
  tokens: 25000
  tasks: 3
  commits: 3
plan_head_before: dbd0072d797b584dc43d0ff41b83bd4df8e9cebc
---

# Quick 260930-fi4: gh-trade a09dfc8b 계약 반영 (83 first_filled · 추가매수 포기 수량 · OrderGroup 7/8) Summary

gh-trade a09dfc8b 스키마를 gh-trade 소유 스크립트로 relay 생성물에 재동기화하고, 83 `first_filled` 를 relay 파서 → hub → shared → 웹 보조행 「{그룹} · 체결 시작」 까지, `extra_buy_abandon_qty` 를 relay 60/64/11.2 디코더 → shared 런타임 필드 → 전략 로그 「추가매수 포기 · 최대 초과 645,842」 까지 이었다. 83 보조행 대기 · 100% 문구도 WinForms 와 같은 「{그룹} · N주」 · 「{그룹} · 0주」 로 맞췄다.

## 커밋

| Task | 내용 | 커밋 |
|------|------|------|
| 1 (트레이서) | 생성물 재동기화 4파일 + 슬롯 24 봉인 흡수 + 83 first_filled 종단 + 웹 「체결 시작」 상태 | 5b29b842 |
| 2 | 83 보조행 대기 · 100% 문구 WinForms 정렬 + 옛 문구 단언 전면 교체(src · e2e) | 5fa405d8 |
| 3 | 추가매수 포기 수량 relay 디코드 · shared 런타임 필드 · 전략 로그 조각 | 3aac9a27 |

## 생성물 동기화 (L-1)

- gh-trade 분리 worktree(scratchpad, `--detach a09dfc8b`)에서 `RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh --check` → 가드 3종 통과 · flatc 25.12.19 · 변경 3 + .fbs 사본 갱신 예정 확인 → `--check` 없이 반영 → worktree 제거. gh-trade worktree 목록은 작업 전과 동일(메인 + .claude/worktrees 2개). gh-trade 메인 체크아웃 무변경.
- `git diff --name-only dbd0072d -- relay/src/generated` 가 정확히 4파일: `StockDMA.fbs`(SYNC MARKER server-repo-commit d303fe9f · synced-date 2026-09-30) · `order-group.ts`(Manual 7 · VITrigger 8) · `queue-progress-item.ts`(firstFilled() 슬롯 24 · addFirstFilled · create 말미 인자) · `set-limit-chaser.ts`(extraBuyAbandonQty() 슬롯 134 · startObject 66 · 슬롯 24 접근자 · 빌더 소멸). 손편집 0 · 신규/삭제 0.
- `relay/src/dma/msg-type.ts` 무변경 확인.

## 판단 사항 (플래너 재량 P-1 ~ P-5)

- **P-1:** compact(모바일 r3)도 row 와 같은 문구 「{그룹} · N주」 를 쓴다 — 새 문구가 옛 compact 문구보다 짧아 폭 손해가 없고 WinForms 문구 하나로 통일된다. compact 는 레이아웃(mt-1.5 · 막대만 flex-1 min-w-0 · 나머지 flex-none)만 다르다.
- **P-2:** first_filled 는 near 가 아니다(near = 「곧 내 차례」, 대기 전용 개념). 채움은 `--primary`(취소 보관 muted 면 `--faint`), 루트에 `data-first-filled="true"`. 새 토큰 0.
- **P-3:** 계획 시점 flatc 대조대로 변경은 3건이 아니라 4건 — buy_watch_side 슬롯 24 봉인(gh-trade a3610261 · quick-260930-1s8)이 함께 들어왔다. 스크립트 산출물은 a09dfc8b 전체라 봉인만 뺄 수 없어 여파를 흡수했다: `readLimitChaser` 의 `buyWatchSide` 를 리터럴 `"0"` 으로, 호출처가 사라진 `fromWireWatchSide` 삭제, envelope.test 의 접근자 null 단언 2곳은 `presentSlots(t, [24])` 가 `[]` 인 단언으로 교체, frames.ts 의 감시대상 입력 · 조건부 슬롯 쓰기 제거(S→C 프레임 빌더에 넘기는 호출처 0 확인), fake-gateway 는 vtable 슬롯 24 원시 읽기로 `buyWatchSide` 와이어 원문(`null` = 부재)을 유지해 fanout.test 의 null 단언을 그대로 살렸다. 값 영향 0 — buy3 서버 에코에는 원래 슬롯이 없어 relay 가 이미 `"0"` 을 채우고 있었다.
- **P-4:** 포기 줄은 추가매수 게이트 접힘 에코(gh-trade 에코 = cfg ∧ 무장 ∧ !포기)에서 「추가매수 무장 해제」 조각을 대신한다 — 같은 사건을 두 조각으로 쓰지 않는다(동반 문장 선례). 게이트 변화 없는 포기 플래그만의 에코는 기존 `isRuntimeOnlyEcho` 규칙대로 0줄이다.
- **P-5:** 옛 relay(필드 부재) 관용 — 웹은 `firstFilled` 를 `=== true` 로, 수량을 `> 0` 으로 판정한다.

## 검증

- shared: `typecheck` · `build` 통과.
- relay: `typecheck` · `typecheck:tests` 통과. vitest `envelope.test.ts` · `hub.test.ts` · `fanout.test.ts` · `protocol.test.ts` 4파일 299건 통과.
- webapp: `typecheck`(tsc + e2e tsconfig) 통과. vitest `queue-progress` · `unfilled-progress` · `account-panel` · `relay-socket`(216건), `strategy-log` · `strategy-card-flow` · `strategy-log-feed` · `card-body` · `limit-chaser`(305건) 통과.
- TDD: Task 1 웹 7건 · Task 2 7건 · Task 3 3건을 먼저 실패(RED) 확인 후 구현으로 GREEN.
- `webapp/src` · `webapp/e2e` 에 「주 남음」 0건. `card-body.tsx` diff 0(「포기」 배지 무변경). e2e 는 실행하지 않고 typecheck 로만 확인(계획대로).
- 남은 vitest · tsc 프로세스 0 확인.

## Deviations from Plan

None - plan executed exactly as written.

부가(계획 범위 안의 주석 정합): `account-panel.tsx` ⑫ 주석의 D-13 문장 「스냅에서 항목이 빠지면(첫 체결 · 취소)」 이 first_filled 로 사실과 달라져 「전량 체결 · 취소 · 거부 — 첫 체결 뒤에도 서버가 first_filled 로 남긴다」 로 고쳤다(코드 무변경). shared `RelayLimitChaser` 머리 주석의 활성 필드 수(55 → 57)도 함께 맞췄다.

## 배포 · push

relay 배포와 push 는 하지 않았다(장중 — 오케스트레이터 결정, relay 먼저 → push 규율). SUMMARY · STATE · PLAN 은 커밋하지 않았다(오케스트레이터 몫).

## 후속 후보

1. shared `RelayLimitChaser.buyWatchSide` 필드 및 웹 픽스처(`strategy-log.test` BASE 등) 정리 — 슬롯 24 봉인으로 relay 가 늘 `"0"` 을 채우는 죽은 필드다(`RelayLcWatchSide` 타입 포함).
2. `relay/src/ws/protocol.ts` 의 `lc.arm` latch `"buy"` 한시 관용 걷기 — 주석이 「buy_watch_side 봉인 후속과 함께」 라고 적어 둔 조건이 이제 섰다.

## Self-Check: PASSED

- 커밋 5b29b842 · 5fa405d8 · 3aac9a27 존재 확인(`git log`).
- 생성물 4파일 · 변경 파일 25개 존재, `plan_head_before..HEAD` = 3.
