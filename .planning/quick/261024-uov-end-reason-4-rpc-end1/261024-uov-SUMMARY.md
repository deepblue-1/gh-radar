---
phase: quick-261024-uov
plan: 01
subsystem: trading-workbench / accum-signal
tags: [accum, kind16, end_reason, rpc, winforms-parity]
status: complete
requires:
  - gh-trade end_reason 4 「매집 종료」(인박스 261024-accum-hidden-carry10 「추가 — 매집 종료」)
provides:
  - accum-list closedRowsOf · isListedAccum(sig, closed)
  - 훅 단일 목록 규칙 적용 · 매집 종료 행 = 그날 최신 청산 행 값 + endReason 4
  - ACCUM_END_REASON_LABELS[4]
  - dma_accum_signals_for_user_json 그날 최신 청산 행 동반(20261024230000)
affects:
  - webapp /trading 「매집」 패널
  - REST 복원 RPC 응답(행 수 증가 — 청산 뒤 매집 종료 종목은 (gateway, isin) 당 최대 2행)
tech-stack:
  added: []
  patterns: [row_number 두 창으로 UNION 없이 최신+동반 행 고르기]
key-files:
  created:
    - supabase/migrations/20261024230000_dma_accum_signals_closed_companion.sql
  modified:
    - webapp/src/lib/accum-list.ts
    - webapp/src/lib/use-accum-signals.ts
    - webapp/src/components/trading/workbench/accum-strip.tsx
    - packages/shared/src/accum-signal.ts
    - webapp/src/lib/__tests__/accum-list.test.ts
    - webapp/src/lib/__tests__/use-accum-signals.test.tsx
    - webapp/src/components/trading/__tests__/accum-strip.test.tsx
    - packages/shared/src/__tests__/accum-signal.test.ts
    - supabase/tests/dma_strategy_accum_signal.test.sql
decisions:
  - "매집 종료(4) 행은 고른 서버 · 그날 · 자르기 뒤 청산 행(row 4 · end 1)이 있을 때만 싣는다 — 값 · 갱신 시각 · 청산끼리 순서는 그날 최신 청산 행, 종료 사유만 4(오케스트레이터 결정 · WinForms 동형)"
  - "목록 규칙은 훅(useAccumSignals)에서 한 번만 적용 — 패널(AccumStrip)은 받은 행을 거르지 않는다"
  - "isListedAccum 두 번째 인자는 { has(isin) } 구조 타입 — Set 과 closedRowsOf 의 Map 을 모두 받는다 · 기본값 없이 필수"
metrics:
  duration: ~25min
  completed: 2026-10-24
estimate:
  tokens: 70000
  tasks: 3
actuals:
  tokens: 12000
  tasks: 3
  commits: 6
plan_head_before: 90a3289dae196741d3c6a07ec44fb7a700c51cad
plan_head_after: da978c130104b4b6515d8118cc19f0fadd4bb661
---

# Phase quick-261024-uov Plan 01: 매집 종료(end_reason 4) — 그날 청산 행 동반 목록 규칙 · 문구 · 복원 RPC Summary

웹 「매집」 패널이 gh-trade WinForms 클라와 같아졌다. 장중에 청산(end 1)한 뒤 매집 종료(end 4)된 종목은 회색 「청산」 행으로 남는다. 이 행의 값과 「갱신」 시각은 청산 행 그대로이고, 툴팁만 「매집 종료 — …」다. 라이브에서도, 새로고침 뒤 복원 RPC 에서도 같은 답을 낸다.

## 구현

- **accum-list.ts**: `closedRowsOf(rows)`를 추가했다. 복원 묶음 자르기 뒤 행에서 isin 별 최신(`isNewer`) queueCase 4 · cancelReason 1 행을 담은 Map 이다. `isListedAccum(sig, closed)`는 활성 전부와 종료 사유 1, 그리고 `closed.has(isin)`인 종료 사유 4 를 싣는다. 머리 주석 ②' · ③을 갱신했다.
- **use-accum-signals.ts**: 고른 게이트웨이 행(`mine`)에서 `closedRowsOf(mine)`를 구하고 `isListedAccum(sig, closed)`로 거른다. 매집 종료 행은 `{ ...accumSignalOf(청산 행), endReason: 4 }`로 싣는다.
- **accum-strip.tsx**: 목록 거름(`isListedAccum`)을 제거했다. 이제 ✕ 숨김만 거른다. 주석 ③ · ⑤ · ⑧과 prop 문서를 갱신했다.
- **shared accum-signal.ts**: `ACCUM_END_REASON_LABELS[4]` = 「매집 종료 — 청산 뒤 순매수가 사이클 최고의 −30% 이하(최고 10억 → −3억)」(U+2014 · U+2212 · U+2192). AccumState · endReason · cycle · 배지 주석에 매집 종료를 반영했다. 매퍼는 바꾸지 않았다.
- **마이그레이션 20261024230000**: `dma_accum_signals_for_user_json`을 다시 정의했다. 흐름은 ev → cut → kept(자르기) → ranked(rn_latest · rn_closed 두 창)이고, `rn_latest = 1 OR (청산 AND rn_closed = 1)` 행을 고른다. 행마다 한 번만 평가하므로 중복이 없다. 정렬은 gateway → isin → ms → seq 이고, 권한 세 줄은 20261019160000 과 같다.

## 검증 결과

| 대상 | 결과 |
|------|------|
| shared `accum-signal.test.ts` | 16/16 통과 |
| shared build | 성공 |
| webapp accum-list · use-accum-signals · accum-strip | 65/65 통과(3 파일) |
| webapp `tsc --noEmit` | 0 오류 |
| pgTAP `dma_strategy_accum_signal.test.sql` | **31/31 통과**(1..31 · not ok 0 · 마이그레이션 79개 재생 · RESULT: PASS) |

RED 확인 결과는 다음과 같다.
- Task 1: 10 실패
- Task 2: shared 라벨 단언 1 실패
- Task 3: pgTAP 19 · 21 not ok

## 커밋

| 태스크 | 커밋 | 내용 |
|--------|------|------|
| 1 RED | 96ac9c4c | test: 매집 종료(4) 목록 규칙 실패 테스트 |
| 1 GREEN | 01136937 | fix: 매집 종료는 그날 청산 행이 있을 때만 · 목록 규칙은 훅에서 한 번 |
| 2 RED | 9195a3c6 | test: 종료 사유 4 문구 실패 테스트 |
| 2 GREEN | 0cb2c573 | fix: 종료 사유 4 「매집 종료」 문구 · endReason 주석 0~4 |
| 3 RED | aa333a00 | test: 복원 RPC 그날 청산 행 동반 pgTAP 실패 테스트 |
| 3 GREEN | da978c13 | fix: 복원 RPC 그날 최신 청산 행 동반 |

## Deviations from Plan

**1. [오케스트레이터 결정 반영] `closedIsinsOf` 대신 `closedRowsOf`를 쓰고, 매집 종료 행 값은 청산 행 기준으로 바꿨다**
- 플랜 본문의 `closedIsinsOf: Set` 대신 `closedRowsOf: Map<isin, StrategyEventRow>`를 썼다. 훅은 청산 행의 신호에 endReason 4 만 덮는다.
- `isListedAccum`의 두 번째 인자는 `{ has(isin: string): boolean }`이다.
- 플랜의 grep 수용 기준 `closedIsinsOf(mine)`은 `closedRowsOf(mine)`으로 읽었다.
- ②' 주석의 「값은 end 4 기준」 문장은 「청산 행 기준 · 종료 사유만 4」로 바꿔 썼다.

**2. [테스트 보강] 훅 테스트를 하나 더 넣었다**
- 플랜의 (i) · (ii)에 더해 (iii)을 넣었다. 매집 종료 행이 청산보다 늦은 ms 로 와도 gwTimeMs 와 netKrw 가 청산 행 값인지 본다.
- (ii)는 같은 ms 의 end1 → end4 에서 netKrw · gwTimeMs · endReason 4 를 단언한다. 오케스트레이터가 요청한 단언이다.
- 훅 픽스처 시각은 플랜의 10:00 대신 09:50 이다(시계는 10:00 고정). 판정에는 영향이 없다.

**3. [커밋 단위] Task 2 GREEN 커밋은 shared 원천 1 파일만 담았다**
- 태스크의 테스트 2 파일은 RED 커밋(9195a3c6)에 들어갔다. TDD 순서상 자연스러운 분할이다.

그 밖에는 플랜대로 진행했다.

## 배포 대기(메인 세션 몫 · 이 실행에서는 하지 않음)

1. DB 마이그레이션: `supabase db push --linked --yes`(20261024230000).
2. 그다음 webapp push(push 자체가 Vercel 프로덕션 배포다). 순서를 지켜야 한다.
   - RPC 를 먼저 올려야 새로고침 뒤에도 매집 종료 행이 남는다.
   - webapp 만 먼저 나가면 새로고침 뒤에는 그 종목이 빠진다. 라이브에서는 남는다.
3. server 는 RPC 통과만 하므로 변경이 없다.

## Known Stubs

없음.

## TDD Gate Compliance

세 태스크 모두 test(RED) → fix(GREEN) 커밋 순서다. RED 는 각각 실패를 확인한 뒤 커밋했다.

## Self-Check: PASSED

- 파일 존재: 마이그레이션 · 수정 원천 · 테스트 파일 9개 모두 있음.
- 커밋 6개(96ac9c4c · 01136937 · 9195a3c6 · 0cb2c573 · aa333a00 · da978c13)가 HEAD 조상에 있음.
- `git rev-list --count 90a3289d..HEAD` = 6.
- 커밋 메시지에 Co-Authored-By 0건.
