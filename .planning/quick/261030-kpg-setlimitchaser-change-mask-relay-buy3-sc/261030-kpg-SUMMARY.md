---
phase: quick-261030-kpg
plan: 01
subsystem: relay · webapp · shared (상따 SetLimitChaser)
tags: [limit-chaser, change-mask, buy3-schema, gh-trade-phase-44]
status: complete
requires:
  - gh-trade 55e62638 (SetLimitChaser.change_mask vt 174 · buy3_schema 6) — relay 생성물 652c7f86 에서 동기화됨
provides:
  - shared LC_CHANGE_MASK_FIELDS · LcChangeMaskField · isLcChangeMaskField (비트 표 50행)
  - relay lcChangeMaskOf · LC_CHANGE_MASK_PAIR_RULES (gh-trade D-10 16규칙)
  - relay LC_CHANGE_MASK_BUY3_SCHEMA 6 · LcSetCfg.changeMask · addChangeMask
  - relay zod lc.set 최상위 changed (선택 · string 배열)
  - webapp lc.set 프레임마다 changed (주 필드 + 동반 + 미등록 로컬 손댐)
affects:
  - 배포 뒤 서버 로그 「마스크=0x…」 (relay → buy3_schema 6)
tech-stack:
  added: []
  patterns: [shared 비트 표 한 벌 + relay 마스크 계산, 모르는 이름 → 종전 전체 반영 폴백 + warn]
key-files:
  created:
    - packages/shared/src/lc-change-mask.ts
    - relay/src/dma/lc-change-mask.ts
    - relay/src/dma/__tests__/lc-change-mask.test.ts
  modified:
    - packages/shared/src/index.ts
    - packages/shared/src/relay.ts
    - relay/src/dma/envelope.ts
    - relay/src/ws/protocol.ts
    - relay/src/ws/fanout.ts
    - relay/tests/helpers/fake-gateway.ts
    - relay/tests/fanout.test.ts
    - relay/tests/protocol.test.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/lib/__tests__/limit-chaser.test.ts
    - webapp/src/components/trading/lc/use-lc-field-commit.ts
    - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
decisions:
  - "lc.set changed 에 비트 표 밖 이름이 있으면 change_mask 없이 종전 schema(≤5 = 전체 반영)로 보내고 warn 1줄 — 거부하지 않는다(편집 보존 · 운영 동작과 같음 · 배포 순서 어긋남에 안전)"
  - "빈 배열 changed [] = 마스크 0n · schema 6(프로토콜 그대로). 웹은 주 필드가 늘 있어 빈 배열을 만들지 않는다"
  - "짝 수량 규칙은 relay 에만 둔다(shared 아님) — webapp 이 마스크를 계산하는 두 번째 경로를 만들지 않는다"
  - "짝 규칙은 사람 이름 집합 기준 한 번만 적용(전이 없음) · whenOff 규칙은 cfg 불리언 false 일 때만"
metrics:
  duration: "~40m"
  completed: 2026-10-30
actuals:
  tokens: 16800
  tasks: 3
  commits: 3
plan_head_before: 34344397ba5fd84ddce8464c3e8c34de39129e58
plan_head_after: f890ee8aa27b6ce224ccf2cca05916d28c25e201
---

# Phase quick-261030-kpg Plan 01: 상따 change_mask · buy3_schema 6 Summary

웹 탭 lc.set 이 「사람이 손댄 칸」 이름 배열(`changed`)을 싣고, relay 가 shared 비트 표 50행 + gh-trade D-10 짝 수량 16규칙으로 uint64 `change_mask`(vt 174)를 만들어 `buy3_schema` 6 으로 SetLimitChaser 에 싣는다 — 금액만 고친 재제출이 소진된 선·줄매수를 다시 열지 않는다.

## 커밋

| Task | 커밋 | 내용 |
|---|---|---|
| 1 (트레이서) | b7ba83fc | shared 비트 표 · relay lcChangeMaskOf(자기 비트) · envelope schema 6 · zod changed · fanout 배선 · fanout e2e 3케이스 |
| 2 | ceb470c3 | 짝 수량 16규칙 · 비트 표 노트 ② 리터럴 + gh-trade .h 대조 · 조립기 단조성/범위 가드 · zod 경계 · fanout e2e 2케이스 |
| 3 | f890ee8a | shared RelayLcSetMsg.changed 필수 · lib lcChangedFieldsOf + 컴파일 타임 단언 · 훅 sendNow changed · 미등록 로컬 손댐 |

push · 배포 없음.

## RED 줄 (TDD)

- T1: fanout `kpg-1~3` 3건 실패 — `expected 5 to be 6` · `expected undefined to be 0n`(fake-gateway 에 changeMask 없음).
- T2: 22건 실패 — `buyOrderAmount → [4,5]` 가 `[4]`(자기 비트만) · `LC_CHANGE_MASK_PAIR_RULES` undefined · fanout `expected 16n to be 48n`.
- T3: 12건 실패 — `lcChangedFieldsOf` 미존재 · 훅 프레임의 `changed` undefined(no-op 1건은 종전 동작이라 초록).

## gh-trade .h 대조

**실제로 돌았다(skip 아님)** — `/Users/alex/repos/gh-trade/server/src/trade/strategy/LimitChaserChangeMask.h` 를 정규식으로 50줄 뽑아 비트 0..49 · 와이어 이름이 `LC_CHANGE_MASK_FIELDS` 와 같음을 확인(verbose 리포트에서 ✓). 파일이 없는 머신에서는 그 describe 만 `describe.skipIf` 로 건너뛴다(`GH_TRADE_DIR` 로 경로 지정 가능).

## 테스트 결과 (마지막 전체 회귀 1회)

- relay vitest(`--maxWorkers=2`): **61 files · 1824 passed**
- webapp vitest(`--maxWorkers=2`): **193 files · 5042 passed · 1 skipped**(동시 세션 home 파일 포함 전부 초록 — 그 세션은 실행 중 34344397 로 커밋함)
- shared vitest: **26 files · 837 passed**
- relay `tsc --noEmit` · `tsc -p tsconfig.tests.json --noEmit` 0 오류 · webapp `npm run typecheck`(tsc + e2e tsconfig) 0 오류 · shared `tsc --noEmit` 0 오류
- 대상 파일 단계별: T2 relay 4파일 466 passed · T3 webapp 5파일(limit-chaser · use-lc-field-commit · lc-tracer · inline-navigation · limit-chaser-form) 634 passed

## relay 모르는 이름 정책

`changed` 에 비트 표 밖 이름이 하나라도 있으면 **change_mask 를 싣지 않고 종전 schema(같은 cfg 면 5 = 서버 전체 반영)** 로 보내고 warn 1줄(`userId · t · isin · unknown 최대 5개 · unknownCount` — 계좌 · 값 · bigint 없음)을 남긴다. 거부 프레임 0 · 소켓 유지. 근거: 일부 비트만 세우면 그 칸 편집이 조용히 버려지지만 전체 반영은 값을 싣는다 · 실패 모양이 지금 운영 동작과 같다 · 거부하면 배포 순서가 어긋난 날 웹 상따 수정이 전면 막힌다 · 무로그 fail-safe 금지.
빈 배열 `[]` 은 프로토콜 그대로 마스크 0n · schema 6(= 아무 칸도 반영 안 함). 웹은 늘 주 필드가 있어 빈 배열을 만들지 않는다(훅 테스트가 잠금).

## gh-trade 질문 답 — 웹 탭 손댐 정의 vs gh-trade D-05

- **제출 단위:** 웹 상따는 확정 1회 = lc.set 1회(`useLcFieldCommit`). 사람 조작 = 시트 「적용」 · 인라인 Enter/blur · 키패드 · 3택(자동매도 방법) 선택 · 체크/스위치 클릭. 칸 포커스 · 입력 중 키 입력은 확정 전이라 프레임이 없다(더티 누적 · 「수정」 버튼 없음).
- **changed =** 그 확정의 주 필드 + 같은 확정이 싣는 동반 필드(그룹 켬/끔 때 마스터 · 줄매수 끌 때 ☐자동 · 선매수 켤 때 줄매수 · 매도 · 취소 6체크 자동 체크와 가격 채움 · 후매수 끌 때 ☐자동 — 실제 키는 송신 시점 계산 결과) + 미등록 전략에서 로컬로만 확정한 칸(송신 성공 직후 비움).
- **D-05 와 같은 점:** 프레임이 나가면 주 필드는 값이 같아도 비트 · 에코 적용은 손댐이 아니고 기억을 비우지 않음 · 에코 diff 아님 · 짝 수량은 relay(D-10).
- **D-05 와 다른 점 2개**(둘 다 이번 변경 전후 동일한 웹 기존 규칙 · 재무장 쪽으로 틀리지 않음):
  1. 값이 서버(에코)와 같은 단독 확정은 프레임 자체를 만들지 않는다(no-op) — WinForms 의 「같은 값 Enter」 단독 재제출(그룹 비트로 매도 · 취소 래치 · 기준선 리셋 — D-08)에 해당하는 동작이 웹에는 없다.
  2. 대기열 안 같은 필드 재확정은 값만 바뀐다 — OFF 가 아직 대기 중일 때 ON 을 다시 누르면 꺼낼 때 서버 값(ON)과 같아 no-op(재무장 요청이 나가지 않는다). OFF 가 이미 나가 있으면 OFF 에코 뒤 ON 이 비트와 함께 나간다.
- **자동 제출:** 서버 접힘 뒤 마스터 자동 끔(serverFold)은 사람 조작이 아니지만 그 칸(`buy_enabled`) 비트를 싣는다 — 그 제출의 유일한 목적.
- **[기본값으로] 버튼 없음** → D-12 해당 없음(실행 시 grep 재확인 — 상따 폼에 해당 버튼 없음). 상한가 · 상장주식수 · 84 시딩은 미등록 새 전략의 폼만 채우고 손댐이 아니다(첫 등록은 D-07 전체 반영).
- **post_buy_reentry** 는 비트 표 밖(웹 행 없음 · 255 고정 · 서버가 읽지 않음) — changed 에 넣지 않는다.

## 배포 메모 (실행하지 않음)

- 순서: gh-trade 서버(120 · 119) → relay → webapp(push = 프로덕션). relay 만 먼저 나가도 webapp 이 changed 를 안 보내므로 종전 schema 5(동작 불변). webapp 이 relay 보다 먼저 나가도 옛 relay zod 가 changed 를 strip(종전 5).
- 확인: 서버 로그 `[LimitChaser] 설정 갱신 … 마스크=0x…(N비트)` 의 비트 수 = 웹에서 손댄 칸 + 짝 수량 · `[Gateway] 구 세대 재제출이 소진된 선·줄매수를 다시 연다` warn 이 웹 탭에서 0 으로 · relay 로그에 `[WS] lc.set changed 에 비트 표 밖 이름` 이 없어야 한다.
- 인계 노트 `status: done` + `done_commit` 은 배포 뒤 메인 세션.

## Deviations from Plan

None - plan executed exactly as written. (경미: T1 의 fanout 트레이서 테스트에 `SetLimitChaserRequest` 타입 import 와 warn 객체에 계좌번호가 없음을 보는 단언 1줄을 더했다 · envelope 조립기 테스트에 64비트 최대값 왕복과 `lcBuy3SchemaOf` 직접 단언 1건을 더했다 · zod 테스트에 빈 배열 통과 1건을 더했다 — 모두 계획 behavior 의 상위 집합.)

실행 메모: 실행 시작 시점에 동시 세션이 home 파일을 34344397 로 커밋해 plan_head_before 가 그 커밋이다(이 플랜 커밋은 그 위 3개). master 에서 직접 커밋한 것은 오케스트레이터 지시(메인 트리 · 브랜치 전환 금지)에 따랐다.

## Known Stubs

None.

## Self-Check: PASSED

- 파일: packages/shared/src/lc-change-mask.ts · relay/src/dma/lc-change-mask.ts · relay/src/dma/__tests__/lc-change-mask.test.ts 존재
- 커밋: b7ba83fc · ceb470c3 · f890ee8a 모두 HEAD 조상
