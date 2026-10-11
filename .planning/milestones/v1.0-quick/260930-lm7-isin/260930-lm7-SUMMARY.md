---
phase: quick-260930-lm7
plan: 01
subsystem: webapp/trading
tags: [stock-names, isin, 신규상장, 오늘주문, 주문로그]
status: complete
requires: []
provides:
  - "fetchStockNames — isin 조회 뒤 미해결 보통주 모양 ISIN 만 stocks.code .in() 1회 폴백"
affects:
  - webapp/src/components/trading/today-orders-card.tsx (무변경 — 훅 경유)
  - webapp/src/components/trading/order-log/order-log-panel.tsx (무변경 — 훅 경유)
tech-stack:
  added: []
  patterns: ["보통주 ISIN 정규식 ^KR7([0-9A-Z]{5}0)00\\d$ 로 단축코드 유도"]
key-files:
  created:
    - webapp/src/lib/__tests__/stock-names.test.ts
  modified:
    - webapp/src/lib/stock-names.ts
decisions:
  - "코드 유도는 보통주 모양 ISIN 12자 전체 일치(KR7 + 끝 0 인 6자 + 00 + 검증숫자)일 때만 — 우선주(KR7005931001 → 실제 005935)는 틀린 이름 방지를 위해 제외"
  - "두 번째(code) 조회는 미해결 보통주가 있을 때만 1회 — 첫 isin 조회 모양은 기존 소비자 mock 보존을 위해 그대로"
metrics:
  duration: "~2min"
  completed: 2026-09-30
requirements: [LM7-D1]
plan_head_before: 9b7f6968890deddf0aa8282e1e7823b80c6e8064
commits: 3
actuals:
  tokens: 1850
  tasks: 2
  commits: 3
---

# Phase quick-260930-lm7 Plan 01: 신규 상장 종목 ISIN 대신 종목명 Summary

오늘 상장해 `stocks.isin` 이 비어 있는 보통주를, isin 조회에서 빗나간 보통주 모양 ISIN 만 단축코드로 떼어 `stocks.code` 를 한 번 더 묶어 조회하는 방식으로 오늘주문·주문로그에 종목명으로 표시한다 (`fetchStockNames` 한 곳만 수정).

## 변경

- `webapp/src/lib/stock-names.ts`
  - `COMMON_ISIN_RE = /^KR7([0-9A-Z]{5}0)00\d$/` 추가 (1번 그룹 = 단축코드, 영문 포함 코드 0126Z0 도 유도).
  - `fetchStockNames`: `createClient()` 1회 생성 후 재사용. 첫 `select("isin,name").in("isin", …)` 은 모양 그대로. 못 찾은 입력 중 정규식 일치분만 `단축코드 → ISIN` Map 으로 모아, 비어 있으면 바로 반환(추가 조회 없음), 아니면 `select("code,name").in("code", …)` 1회 → error 면 throw → 이름을 원래 ISIN 에 붙인다.
  - 헤더 주석 ② 호출량 문장 갱신, ④ 「신규 상장 — 코드 폴백」 추가.
  - `useStockNames` · `clearStockNameCache` · 소비자 · 기존 테스트 mock 무변경.
- `webapp/src/lib/__tests__/stock-names.test.ts` (신규) — 컬럼별로 거르는 supabase 스텁으로 A(isin 만 1회) · B(코드 폴백, 묶음 1회, 영문 코드) · C(섞인 입력 — 풀린 종목은 코드 값에서 제외) · D(우선주 함정 행 — 코드 조회 없음) · E(코드 조회 오류 전파).

## 커밋

| Task | Commit | 내용 |
|------|--------|------|
| 1 RED | 359c755b | test — 실패 테스트 5건 (B·C·E 실패 확인) |
| 1 GREEN | 1f21acff | fix — fetchStockNames 코드 폴백 |
| 2 | 6adaa5ef | docs — 헤더 주석 ②④ |

## 검증

- `npx vitest run src/lib/__tests__/stock-names.test.ts` — 5/5 통과 (RED 단계에서 3건 실패 확인 후 GREEN).
- 소비자 회귀: stock-names + today-orders-card + order-log/ + shared-panels — 7 파일 124 테스트 전부 통과 (기존 119 + 신규 5).
- `npm run typecheck` 오류 0, 두 파일 eslint 경고 0.
- `grep -c 'in("code"' webapp/src/lib/stock-names.ts` = 1.
- 변경 파일은 `stock-names.ts` · `stock-names.test.ts` 둘뿐.

## TDD Gate Compliance

RED(359c755b, test 커밋 — B·C·E 실패) → GREEN(1f21acff, fix 커밋 — 5/5 통과). REFACTOR 없음.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

없음.

## Threat Flags

없음 — 계획의 T-lm7-01(우선주 제외, 테스트 D) · T-lm7-02(추가 조회 조건부, 테스트 A·D) 완화 적용.

## Self-Check: PASSED

- FOUND: webapp/src/lib/stock-names.ts
- FOUND: webapp/src/lib/__tests__/stock-names.test.ts
- FOUND: 359c755b, 1f21acff, 6adaa5ef
