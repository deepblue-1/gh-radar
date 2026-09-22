---
phase: quick-260922-uhw
plan: 01
subsystem: webapp/trading (수동주문 폼)
status: complete
tags: [R4-WR-01, order-lock, result-unknown, TRADE-07]
requires: [RelayProvider.orderLocks (18-34 · 18-35)]
provides: [formOrderLockOf, 폼 잠금 합집합 판정]
affects: [webapp/src/components/trading/card/manual-order-form.tsx]
tech-stack:
  added: []
  patterns: ["폼은 읽을 키만 고르고 잠금 여부는 Provider 가 답한다"]
key-files:
  created: []
  modified:
    - webapp/src/components/trading/card/manual-order-form.tsx
    - webapp/src/components/trading/__tests__/manual-order-form.test.tsx
    - .planning/phases/18-gh-trade-ui-nxt-vi/18-VALIDATION.md
decisions:
  - "폼 잠금 = 폼 키 ∪ 선택 원주문 행 키 ∪ 이 폼이 보낸 마지막 신규 · 정정 요청 키(같은 종목 · 계좌) — 교차 거래소 방향으로만 넓힌다"
  - "여러 키가 잠기면 결과 모름이 진행 중보다 우선한다(formOrderLockOf)"
  - "sentTarget 은 잠금이 아니라 「어느 키를 읽을지」 다 — 취소는 기억하지 않는다"
metrics:
  duration: ~25m
  completed: 2026-09-22
plan_head_before: 4bd7f169a1e59a638d28115b3412d97af640350a
actuals:
  tokens: 4400
  tasks: 3
  commits: 3
---

# Quick 260922-uhw: R4-WR-01 교차 거래소 정정 timeout 결과 모름 잠금 틈 수정 Summary

호가 탭(KRX 보기) 폼이 NXT 원주문을 정정하다 timeout 이 나면 4버튼이 다시 열리던 틈을, 폼이 읽는 잠금 키를 (a) 폼 키 · (b) 선택 원주문 행 키 · (c) 이 폼이 보낸 신규 · 정정 요청 키의 합집합(`formOrderLockOf`, 결과 모름 우선)으로 넓혀 닫았다. 원천은 여전히 `RelayProvider.orderLocks` 하나다.

## PLAN_HEAD_BEFORE

`4bd7f169a1e59a638d28115b3412d97af640350a`

## 커밋

| Task | 커밋 | 내용 |
|------|------|------|
| 1 | `3e48360` | fix(quick-260922-uhw): 호가 탭 교차 거래소 정정 timeout 뒤 수동주문 4버튼이 다시 열리던 결과 모름 잠금 틈 수정 (R4-WR-01) |
| 2 | `d2b75cb` | test(quick-260922-uhw): 결과 모름 잠금 합집합 회귀 — 선택 행 키 단독 · 결과 모름 우선 · 취소 비기억 (R4-WR-01) |
| 3 | `1a38078` | docs(quick-260922-uhw): 18-VALIDATION §Gap Closure R4 에 R4-WR-01 종결 기록 추가 |

18-VALIDATION.md 편집은 실행자의 docs 커밋(`1a38078`)에 포함했다(numstat `2 0` — 추가만). push · 배포 없음.

## 수정 전 RED 증거 (원문)

```
   × … > 정정 timeout → 원주문 **행의** 키(NXT)가 잠긴다 — 폼 키(KRX)가 아니다 · 폼(KRX)의 4버튼도 잠긴다 — 같은 원주문을 곧바로 다시 정정할 수 없다 (R4-WR-01) 53ms
     → expect(element).toBeDisabled()
 ❯ src/components/trading/__tests__/manual-order-form.test.tsx:958:45
    958|     for (const b of allButtons()) expect(b).toBeDisabled();
   × … > 교차 거래소 정정 timeout 뒤 선택이 풀려도 매수 · 매도는 잠긴 채다 — 다른 종목 · 다른 계좌는 독립 (R4-WR-01) 45ms
     → expect(element).toBeDisabled()
 ❯ src/components/trading/__tests__/manual-order-form.test.tsx:979:23
    979|     expect(btn('매수')).toBeDisabled();
      Tests  2 failed | 56 passed (58)
```

두 케이스 모두 「버튼 enabled」(toBeDisabled 불일치)로 실패했다 — import · 문법 실패 아님. 수정 후 `Tests  58 passed (58)`, 기존 케이스 무수정 통과.

## 변이 확인

각 변이를 적용 → `npx vitest run manual-order-form` → 루트 저장소에서 `git checkout -- <파일>` 로 되돌림. 최종 `git diff --quiet` 로 `MUTATIONS_REVERTED` 확인.

| 변이 | 기대 실패 | 실제 실패 케이스 |
|------|-----------|------------------|
| (i) (b) 선택 행 키 제거 | C | C(선택 행 키 단독) · D(렌더 부분) — 2 failed |
| (ii) (c) 보낸 요청 키 제거 | B | B(선택 해제 뒤 유지) — 1 failed |
| (iii) (c) 종목 · 계좌 일치 조건 제거(sentTarget 자체 키) | B 또는 기존 종목 전환 | B · 기존 「컨텍스트 키 잠금(호가 탭) — 다른 종목으로 바꾸면 …」 — 2 failed |
| (iv) 취소도 sentTarget 에 기록 | E | E(취소는 읽을 키로 남지 않는다) — 1 failed |
| (v) 우선순위 반전(in-flight 먼저) | D | D(formOrderLockOf 우선순위) — 1 failed |

참고: (i) 에서 A 는 실패하지 않는다 — 이 폼이 보낸 정정 키 (c) 가 같은 NXT 키를 덮기 때문이다(의도된 이중 가드). C 가 (b) 단독 가드다.

## 검증 결과 (요약줄 원문)

- `pnpm --filter @gh-radar/shared build` → exit 0
- `pnpm --filter @gh-radar/webapp run typecheck` → `tsc --noEmit && tsc -p tsconfig.e2e.json` exit 0, `error TS` 0
- `pnpm --filter @gh-radar/webapp run test` → `Test Files  92 passed (92)` · `Tests  1460 passed | 1 skipped (1461)` (기준선 1456 + 신규 4: B · C · D · E, A 는 기존 케이스 확장)
- `pnpm exec eslint <변경 2파일>` → exit 0, 출력 없음(오류 · 경고 0)
- `pnpm exec playwright test trading-workbench orderbook` → `47 passed (1.9m)` — orderbook 「7. 통보가 오지 않으면 … 「결과 모름」 이고 제출은 잠긴 채다」 · GC5 · GC6 pass (dev :3100, webServer 재사용/기동)
- 범위 가드 `git diff --quiet 4bd7f16 -- relay-provider.tsx stock-orderbook-section.tsx card-body.tsx trading-workbench.tsx relay/` → `SCOPE_OK`
- grep: `export function formOrderLockOf` 1 · `strategyKey(selected.isin, accountNo, selected.exchange)` 1 · 비주석 `setBlocked` 0
- 18-VALIDATION numstat `2	0` · 종결 머리 grep 1

## Deviations from Plan

None - plan executed exactly as written.

실행 중 사고 1건(결과에 영향 없음): 첫 변이 루프에서 `webapp/` 안에서 `git checkout -- <상대경로>` 를 불러 중첩 `webapp/.git` 이 명령을 받아 되돌림이 실패했고, 변이가 누적됐다(그 첫 루프의 (ii) 이후 결과는 무효). 루트 저장소에서 파일을 복원한 뒤 `git -C /Users/alex/repos/gh-radar` 로 변이를 하나씩 다시 돌렸다 — 위 표가 그 재실행 결과다. 제품 파일은 Task 1 커밋과 동일(diff 0).

## Threat Flags

없음 — 새 네트워크 · 저장소 표면 없음. `sentTarget` 은 메모리 상태다(T-uhw-03 accept 그대로).

## Known Stubs

없음.

## 미해결

- 실 브라우저 재현 확인(KRX 보기 호가 탭에서 NXT 원주문 정정 timeout)은 18-UAT-R4 #11 에 그대로 남는다(e2e 추가 안 함 — 플랜 결정).

## Self-Check: PASSED

- 수정 파일 3개 존재 · 커밋 `3e48360` · `d2b75cb` · `1a38078` 이 `git log` 에 있다.
