---
phase: quick-261101-okd
plan: 01
subsystem: relay · shared · webapp (상따 LimitChaser)
tags: [sor, buy3-schema-7, change-mask, gh-trade-phase-45, limit-chaser, echo]
status: complete
requires:
  - gh-trade Phase 45 21d692a1 (SetLimitChaser sor_buy vt 176 · sor_sell vt 178)
  - quick-261030-kpg (change_mask · buy3_schema 6)
provides:
  - relay buy3_schema 7 송수신 (sor_buy · sor_sell)
  - shared 변경 마스크 비트 50 · 51
  - webapp ○SOR 매수 · 매도 제목줄 토글 (D-06 · NXT 미거래 잠금)
  - webapp 키별 에코 맵 limitChaserEchoByKey
affects:
  - relay/src/dma/envelope.ts
  - webapp/src/components/trading/card/strategy-card.tsx
tech-stack:
  added: []
  patterns:
    - "buy3_schema 단조성 가드 — 앞 조건 전부 + 새 필드 존재일 때만 다음 세대"
    - "제목줄 GroupHeaderCheck 재사용 (☐자동 꼴)"
    - "카드 응답 채널 = 키별 마지막 에코 (단일 슬롯 가림 방지)"
key-files:
  created: []
  modified:
    - packages/shared/src/relay.ts
    - packages/shared/src/lc-change-mask.ts
    - relay/src/generated/StockDMA.fbs
    - relay/src/generated/stock-dma/set-limit-chaser.ts
    - relay/src/dma/envelope.ts
    - relay/src/ws/protocol.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
    - relay/tests/fanout.test.ts
    - relay/tests/protocol.test.ts
    - relay/src/dma/__tests__/lc-change-mask.test.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/test-fixtures/limit-chaser.ts
    - webapp/src/components/trading/lc/lc-fields.ts
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/lc/__tests__/lc-fields.test.ts
    - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
    - webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/__tests__/strategy-card.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - docs/inbox/from-gh-trade/261101-limitchaser-sor.md
decisions:
  - "웹 ○SOR 은 D-06 WinForms 동형 — 매수 켜기는 매도를 현재값과 무관하게 늘 동반(한 제출 · 비트 50·51), 끄기는 그 필드만"
  - "에코 2건 대응은 키별 에코 맵(limitChaserEchoByKey) — (ii) 는 초록이었으나 멱등 답 + 같은 배치 (iii) 가 RED 라 조건부 수정을 적용"
metrics:
  duration: "약 70분"
  completed: 2026-11-01
estimate:
  tokens: 90000
  tasks: 3
actuals:
  tokens: 30045      # chars/4 over 4개 커밋 diff
  tasks: 3
  commits: 5         # MEASURED rev-list 666616b6..HEAD — 이 중 1c5252c6 1건은 동시 세션(quick-261101-owf) 커밋, 이 quick 몫은 4건
plan_head_before: 666616b6
plan_head_after: 4e46a3593a1ea4f2c5a9dd2923b57274b80bf09d
---

# Quick 261101-okd: 상따 SOR 전환 — relay buy3_schema 7 · 웹 ○SOR 토글 · 에코 2건 Summary

**relay 가 sor_buy(vt 176) · sor_sell(vt 178)을 buy3_schema 7(앞 여섯 조건 + 둘 다 존재)로만 싣고 에코에서 읽으며, 웹은 매수주문 · 매도주문 제목줄 「SOR」 체크(매수 켜면 매도 동반 · NXT 미거래 종목 잠금)를 두고, 카드 응답 판정을 키별 에코 맵으로 바꿔 SOR 미러의 두 키 에코가 한 렌더 배치로 겹쳐도 요청 카드가 제 답을 확정한다.**

## 커밋

| Task | 커밋 | 내용 |
|---|---|---|
| 1 (트레이서) | `bce42b6a` | feat(relay): 상따 SOR buy3_schema 7 — sor_buy·sor_sell 송수신 · 비트 50·51 (생성물 2개 포함) |
| 2 | `093da9f3` | feat(webapp): 상따 ○SOR 매수·매도 토글 — 매수 켜면 매도 동반 · NXT 미거래 종목 잠금 |
| 3 | `ad4cf510` | fix(webapp): 에코 2건 — 키별 에코 맵 |
| 3 (노트) | `4e46a359` | docs(inbox): 261101 상따 SOR 인계 처리 완료 |

## RED 기록

- **Task 1** — HEAD 판 `envelope.ts` · `protocol.ts` 로 대상 4파일 실행: **10 failed / 470 passed**
  (okd-1 · okd-2 · okd-4 · ③-sor ①②③④⑥⑦ · ①-sor). okd-3 · ③-sor ⑤ 는 「종전 6 유지」 단언이라 HEAD 에서도 초록이 맞다.
  lc-change-mask(52행 · `.h` 52줄)는 shared 를 먼저 고친 뒤라 이 실행에선 초록이었다 — 계획 판독대로 HEAD 에서는 `.h` 대조가 이미 RED 였다(헤더 52줄 vs 표 50행).
  GREEN 첫 실행에서 에코 키 수 단언 17곳(77 → 79)이 깨져 같이 올렸다.
- **Task 2** — `-t SOR` 실행: **8 failed**(lc-fields 1 + 폼 describe 7). GREEN 뒤 폼 cfg 키 수 단언(58 → 60) 5곳 · 제목줄 체크 열거 단언 1곳을 같은 커밋에서 갱신.
- **Task 3** — (i) · (ii) 는 처음부터 **초록**, 추가한 (iii) 이 **RED**(`card-unacked` 가 섬) → 키별 맵 적용 뒤 초록.

## gh-trade `LimitChaserChangeMask.h` 대조

실행됨 — `../gh-trade/server/src/trade/strategy/LimitChaserChangeMask.h` 가 있어 `describe.skipIf` 가 돌았고,
「비트 상수 52줄의 [비트, 와이어 이름] = LC_CHANGE_MASK_FIELDS · 비트 집합 = 0..51」 초록.

## 「같은 배치 두 에코」 테스트 결과 — 조건부 `limitChaserEchoByKey` 수정: **필요했고 적용함**

- (i) 따로 렌더(KRX 에코 → NXT 에코): 초록.
- (ii) 같은 배치(한 렌더에 `[KRX, NXT]` 최종 상태 · 마지막 에코 = NXT): **수정 전에도 초록**이었다. 이유 — KRX 에코가 요청한 값을 바꿔 오므로
  `server`(키별 `limitChasers` 파생) 변화 이펙트가 `acceptAnswer()` 를 부른다. 단일 슬롯 채널이 가려져도 이 경로가 답을 확정한다.
- (iii, 추가) 같은 배치 + **KRX 답이 내용상 새것이 없는 멱등 답**(이미 무장된 재무장 · 같은 값 재제출 등 — `isRuntimeOnlyEcho` 라 `server` 경로가 답으로 세지 않음):
  키 일치 단일 슬롯 채널만 남는데 그 슬롯이 NXT 에코로 덮여 **RED** — 3초 뒤 KRX 카드에 「미반영」. 계획의 조건부 수정을 적용했다:
  - `use-relay-socket.ts` — `limitChaserEchoByKey: ReadonlyMap<string, RelayLimitChaser>`(초기 빈 Map · `lc` 분기 `new Map(이전).set(key, item)` ·
    `lc.snap` 미포함 · `reset` = `INITIAL_DATA` 가 비움). `lastLimitChaserEcho` 는 유지(다른 소비 · 킬 스위치 귀속 테스트).
  - `relay-provider.tsx` 기본값 빈 Map.
  - `strategy-card.tsx` — `ownEcho = key === '' ? null : limitChaserEchoByKey?.get(key) ?? null`, 「서버가 답했는가」 · 41 해제 이펙트가 `ownEcho` 를 본다(키 비교 줄 삭제 · 주석 갱신).
  - 테스트 헬퍼(`relay()` · `setRelay`)는 맵을 안 주면 `lastLimitChaserEcho` 한 건으로 만든다. 리듀서 테스트 1케이스(KRX → NXT 한 배치 → 맵 두 키 · 슬롯 NXT · 철거 에코 담음 · lc.snap 무변).

## 최종 테스트 수(전체 회귀 1회 · `--maxWorkers=2`)

| 대상 | 결과 |
|---|---|
| shared build | 성공 |
| relay vitest 전체 | 61 files · **1849 passed** |
| relay `tsc --noEmit` · `tsc -p tsconfig.tests.json --noEmit` | 0 오류 |
| webapp vitest 전체 | 195 files · **5106 passed** · 1 skipped(기존) |
| webapp typecheck(`tsc` + e2e tsconfig) | 0 오류 |
| shared vitest(추가 확인) | 26 files · 854 passed |

## 인박스 질문 답(노트에 기록)

1. 예 — 웹도 D-06 동형(매수 켜기 = 매도 동반 · 한 제출 비트 50·51 · 매도 끄기 = 매도만 · 매수 끄기 = 매수만 · 기본 OFF · 기본설정 없음 · NXT 미거래 종목 OFF→ON 비활성 · ON 이면 끄기 허용 · 모름 허용).
2. relay 는 없음(hub · sweeper 키별 · fanout okd-4). 웹은 있었다 — 단일 슬롯 응답 판정이 멱등 답 + 같은 배치에서 요청 카드의 답을 놓칠 수 있었다 → 키별 에코 맵 `ad4cf510`.

## 배포 메모(실행 안 함)

순서: gh-trade 서버(120·119) 배포 뒤 relay → webapp(push = 프로덕션). DB 마이그레이션 없음. 이 quick 은 push · 배포를 하지 않았다.
배포 뒤 확인은 노트 「확인 방법」 기준 — 웹 매수 SOR 켜기 → 송신 schema 7 · 마스크 비트 50·51 → 에코 2건(두 키 모두 sor true) · NXT 비거래 종목 토글 비활성.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] (iii) 멱등 답 + 같은 배치에서 요청 카드 미반영**
- **발견:** Task 3 — 계획의 (ii) 가 다른 경로(`server` 변화) 덕에 초록이라 단일 슬롯 문제를 드러내지 못했다. 같은 문제를 직접 겨누는 (iii) 을 추가해 RED 확인.
- **수정:** 계획 ② 의 조건부 키별 에코 맵 그대로.
- **커밋:** `ad4cf510`

**2. [Rule 3 - Blocking] cfg · 에코 키 수 단언 갱신**
- relay 에코 키 77 → 79(17곳 · Task 1 커밋), webapp cfg 키 58 → 60(5곳) · 제목줄 체크 열거(setting-group) — Task 2 커밋.
  Task 1 의 verify 목록(limit-chaser.test.ts)에 없던 폼 · lc-tracer 키 수 단언은 Task 1 커밋 시점엔 RED 였고 Task 2 커밋에서 초록이 됐다(중간 커밋 하나가 webapp 전체 기준으로는 RED).

### 동시 세션 처리(범위 밖 · 기록)

- quick-261101-owf 세션이 같은 시간에 `packages/shared/src/relay.ts` · `relay/src/dma/envelope.ts` · `relay/tests/fanout.test.ts` · `relay/tests/helpers/frames.ts` ·
  `relay/src/dma/__tests__/envelope.test.ts` 를 함께 고치고 있었다. Task 1 커밋은 그 세션 hunk 를 빼고 내 hunk 만 HEAD 에 적용한 blob 을 index 에 올려
  (`git hash-object` + `update-index`, 작업 트리 무변경) 커밋했다 — 그 세션은 뒤이어 `1c5252c6` 로 자기 몫만 커밋했다.
- 주의(교훈): RED 확인을 위해 HEAD 판 `envelope.ts` · `protocol.ts` 를 작업 트리에 잠깐 덮었다가 복원했다. 복원본에 그 세션 편집이 이미 들어 있어 손실은 없었지만,
  공유 트리에서 파일을 HEAD 로 되돌리는 RED 확인은 동시 세션의 편집을 지울 위험이 있다 — 다음엔 scratch 사본(별도 디렉터리)에서 확인한다.

## Known Stubs

없음.

## Self-Check: PASSED

- 커밋 `bce42b6a` · `093da9f3` · `ad4cf510` · `4e46a359` 모두 HEAD 조상.
- 수정 파일 전부 존재 · 인박스 노트 `status: done` · `done_commit: ad4cf510`.
