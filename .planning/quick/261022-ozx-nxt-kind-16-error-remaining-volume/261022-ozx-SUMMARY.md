---
phase: quick-261022-ozx
plan: 01
subsystem: trading-workbench / shared accum-signal
status: complete
tags: [accum-signal, kind16, nxt, workbench, gh-trade-phase37]
requires:
  - "gh-trade Phase 37 kind 16 error_volume/remaining_volume = nxt_buy_krw/nxt_sell_krw (inbox 261022-accum-nxt-team-burst)"
provides:
  - "AccumSignal.nxtBuyKrw · nxtSellKrw"
  - "작업대 매집 표 12열 — 「NXT 순매수」 열"
affects:
  - packages/shared (AccumSignal 타입 — webapp 은 dist 빌드 필요)
tech-stack:
  added: []
  patterns: ["칸이 정본 — message 꼬리 미사용", "파생 값은 화면(AccumView)에서"]
key-files:
  created: []
  modified:
    - packages/shared/src/accum-signal.ts
    - packages/shared/src/strategy-event.ts
    - packages/shared/src/__tests__/accum-signal.test.ts
    - webapp/src/components/trading/workbench/accum-strip.tsx
    - webapp/src/components/trading/__tests__/accum-strip.test.tsx
    - webapp/src/lib/__tests__/accum-list.test.ts
decisions:
  - "NXT 순매수(nxtBuyKrw − nxtSellKrw)는 AccumSignal 타입이 아니라 AccumView.nxtNet 에서 파생 — accumSignalOf 는 순수 이름 바꾸기이고 netKrw 도 칸이다"
  - "「mobile line」 은 칩이 아니라 폰 밴드 전용 보조 줄(accum-row-subline)로 해석 — NXT 는 칩 title 에만, 칩 보이는 글자 무변경"
  - "NXT 0 은 팀 순매수 규칙 그대로 「0.0억」 flat 색 — 새 자리표시 없음"
  - "NXT 는 금액만 — 수량 필드 없음 · message |nxt= 꼬리 미파싱(사용자 결정)"
metrics:
  duration: "~6m"
  completed: 2026-10-22
estimate:
  tokens: 50000
  tasks: 2
actuals:
  tokens: 5850
  tasks: 2
  commits: 2
plan_head_before: 1a10facdce0a46b1cdf2680da37e9693e9a7d25c
plan_head_after: 72fd4ce730d837e1f6831e8d8a3f9ada42c07f59
---

# Quick 261022-ozx Plan 01: 매집 NXT 순매수 열 Summary

kind 16 의 0 고정 두 칸(error_volume · remaining_volume)을 `AccumSignal.nxtBuyKrw · nxtSellKrw` 로 풀고, 작업대 「매집」 표의 「팀 순매수」 바로 다음에 「NXT 순매수」(nxtBuyKrw − nxtSellKrw · 같은 억 포맷 · 부호 색)를 세웠다. 팀 순매수가 KRX+NXT 합산임은 머리 title 과 칩 title 로 알린다.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (tracer) | kind 16 → nxtBuyKrw/nxtSellKrw → 표 NXT 순매수 열 | c3fb0e6b | accum-signal.ts, accum-signal.test.ts, accum-strip.tsx, accum-strip.test.tsx, accum-list.test.ts |
| 2 | 합산 표기 · 칩 title · 폰 보조 줄 · 0/음수/청산 · 계약 주석 | 72fd4ce7 | accum-strip.tsx, accum-strip.test.tsx, accum-signal.ts, strategy-event.ts |

Tracer gate: Task 1 `<verify>` 를 끝에서 끝까지 다시 돌려 통과(shared 15 · webapp 39 테스트)한 뒤 Task 2 로 확장했다.

## 요약 항목 (플랜 output 지정)

1. **파생 NXT 순매수를 AccumView 에 둔 이유** — `accumSignalOf` 는 값 보정 없는 순수 칸 이름 바꾸기이고 `netKrw` 조차 파생이 아니라 칸(condThreshold)이다. 타입에는 칸 두 개(nxtBuyKrw · nxtSellKrw)만 두고 차이는 화면 views memo 에서 `nxtNet` 으로 센다(profit 선례와 같은 자리).
2. **「mobile line」 해석** — 칩은 폰 전용 줄이 아니라 모든 밴드의 스트립(max-w-[18rem] · 이름 8rem 잘림)이라, NXT 0 종목마다 「0.0억」 을 붙이면 칩이 좁아진다. 그래서 폰 밴드 전용 줄인 표 보조 줄(accum-row-subline) 끝에 「 · NXT ±x.x억」 을 붙였고, 칩에는 title 에만 「팀 순매수(KRX+NXT) … · NXT 순매수 …」 를 넣었다. 칩의 보이는 글자는 바뀌지 않았다(테스트가 잠금).
3. **0 표기** — 팀 순매수 0 과 같은 규칙(fmtEok → 「0.0억」 · toneOf flat 색). 빈 칸 · 대시 같은 새 자리표시는 만들지 않았다. 청산 행은 팀 순매수처럼 부호 색이 없다.
4. **표 구조** — 표는 CSS grid 가 아니라 HTML `<table>`(가로 스크롤 컨테이너)이라 갱신할 격자 템플릿이 없다. 새 열은 `colNarrow`(hidden @min-[700px]/wb:table-cell)로 <700 에서 접어 폰 밴드의 보이는 열 수(7)를 유지했다. 새 경계는 만들지 않았다.
5. **인박스 질문 1(NXT 수량 칸이 필요한가?)** — 사용자 결정 = **금액만**. 수량 칸(snap_len 3)은 필요 없다. 오케스트레이터가 노트 답에 옮긴다.

## Verification

- `pnpm --filter @gh-radar/shared build` · `typecheck` 통과
- shared `accum-signal.test.ts` 15/15 (NXT 매핑 · 꼬리 미사용 · 옛 행 0 포함)
- webapp accum-strip · accum-list · use-accum-signals · trading-workbench 207/207
- webapp `typecheck`(tsc + e2e tsconfig) · eslint(3파일) 통과
- 플랜 grep 단언 전부 통과(12열 ≥3 · get("nxt") 없음 · nxt*Qty 없음 등)
- 커밋 범위 6파일 안 · Co-Authored-By 없음 · 인박스 노트 `status: open` 그대로 · push 안 함(master ahead 3)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] strategy-event.ts 주석 안 `buy_*/sell_*/net_*` 가 JSDoc 을 닫음**
- **Found during:** Task 2
- **Issue:** 플랜 문구 그대로 「buy_*/sell_*/net_* 는 KRX+NXT 합산」 을 넣자 `*/` 가 블록 주석을 끝내 shared 타입체크 · 빌드 · 하위 테스트가 깨졌다.
- **Fix:** 「buy_* · sell_* · net_* 는 KRX+NXT 합산」 으로 구분자만 바꿨다(뜻 동일).
- **Files modified:** packages/shared/src/strategy-event.ts
- **Commit:** 72fd4ce7 (커밋 전 수정)

## Known Stubs

None.

## Self-Check: PASSED

- 수정 파일 6개 모두 존재 · 커밋 c3fb0e6b · 72fd4ce7 가 HEAD 조상
