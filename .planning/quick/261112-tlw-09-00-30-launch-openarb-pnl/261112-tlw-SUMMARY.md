---
phase: quick-261112-tlw
plan: 01
subsystem: launch-orders (러쉬주문 주문 내역)
status: complete
tags: [launch, openarb, pnl, supabase-rpc, shared, webapp]
requires: [20261104710000_launch_queue_live ②]
provides:
  - launch_orders_for_admin 응답 fills 키(개장차익 체결 10키 · 체결 순서)
  - shared launchOpenArbPnlOf · LaunchOpenArbFill · LaunchOpenArbPnlRow · LAUNCH_OPENARB_COST_BP
  - 09:00:30 묶음 「종목별 손익」 표 · 머리 카드 「손익」 줄
affects: [webapp 러쉬주문 → 주문 내역 09:00:30]
tech-stack:
  added: []
  patterns: [계산 한 벌 = shared 순수 함수 · SQL 은 재료만 · 선택 키로 배포 순서 무관]
key-files:
  created:
    - supabase/migrations/20261112400000_launch_orders_openarb_fills.sql
    - supabase/tests/launch_orders_openarb_fills.test.sql
  modified:
    - supabase/tests/launch_gate.test.sql
    - packages/shared/src/launch.ts
    - packages/shared/src/__tests__/launch.test.ts
    - webapp/src/lib/launch-format.ts
    - webapp/src/lib/__tests__/launch-format.test.ts
    - webapp/src/components/admin/launch-orders-tab.tsx
    - webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx
decisions:
  - "개장차익 손익은 shared launchOpenArbPnlOf 한 벌(gh-trade ApplySellFill 체결 순서 재생 · 22bp) — SQL · webapp 에 두 번째 식 없음"
  - "RPC fills 는 선택 키 — db push 전 옛 응답이면 화면은 지금 그대로"
metrics:
  duration: 약 6분
  completed: 2026-11-12
actuals:
  tokens: 16000
  tasks: 3
  commits: 3
plan_head_before: a3d9e4f6c3a0be7dccea249d61f3fb37559b7ab1
plan_head_after: 01e60455f601b0fd27aaa88f4f4725c5c7fa6940
---

# Quick 261112-tlw: 러쉬주문 09:00:30 주문 내역 개장차익 손익 Summary

RPC `launch_orders_for_admin` 에 그 날 개장차익(origin OpenArb) 체결 저널 행을 `fills` 로 싣고, shared `launchOpenArbPnlOf`(gh-trade ApplySellFill 체결 순서 재생 · 22bp 내림)로 계산해 09:00:30 묶음마다 「종목별 손익」 표와 머리 카드 「손익」 줄을 보여 준다.

> **DB push 대기 — 오케스트레이터.** Task 4(`supabase db push --linked --yes`)는 실행자가 하지 않았다. 원격에 마이그레이션
> `20261112400000_launch_orders_openarb_fills.sql` 이 적용되기 전까지 운영 응답엔 `fills` 가 없어 화면은 지금 그대로다(선택 키 · 배포 순서 무관).
> `git push`(webapp 운영 배포)도 하지 않았다.

## 커밋

| Task | 내용 | 커밋 | 파일 |
|------|------|------|------|
| 1 | RPC fills 키 + pgTAP | a1896946 | 마이그레이션 · launch_orders_openarb_fills.test.sql(신규) · launch_gate.test.sql |
| 2 | shared 계산 정본 + 단위 테스트 | 2065e6af | packages/shared/src/launch.ts · launch.test.ts |
| 3 | 손익 표 · 카드 줄 + 테스트 | 01e60455 | launch-format.ts(+test) · launch-orders-tab.tsx(+test) |
| 4 | 운영 DB push | — | **오케스트레이터 대기** |

## 실제 마이그레이션 파일

`supabase/migrations/20261112400000_launch_orders_openarb_fills.sql` — 실행 시점 마지막이 `20261112340000_stock_title_aliases.sql` 이라 계획 번호 그대로.
20261104710000 ② 본문을 통째로 복사하고 (a) 빈 표 조기 반환에 `'fills', '[]'::jsonb` · (b) 마지막 RETURN 에 `'fills', (SELECT …)` 두 곳만 더했다.
COMMENT 문구 덧붙임 · REVOKE PUBLIC / anon, authenticated · GRANT service_role 재명시 · 헤더에 되돌리기 주석.

## 검증(실제로 돌린 것)

- pgTAP(로컬 일회용 docker 컨테이너 · 원격 접촉 0 · 샌드박스 해제 불필요):
  - `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_orders_openarb_fills.test.sql` → 13/13 ok · `# RESULT: PASS` · `Looks like` 없음
  - `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_gate.test.sql` → 62/62 ok · `# RESULT: PASS`
  - 마이그레이션 grep 3종(`'fills', (SELECT` · `'fills', '[]'::jsonb` · REVOKE anon, authenticated) 통과
- shared: `npm --prefix packages/shared run typecheck` 통과 · `vitest --run --maxWorkers=2 src/__tests__/launch.test.ts` → 65 passed(새 describe 8건 · RED 8 실패 확인 후 구현)
- webapp: `npm --prefix packages/shared run build` → `npm --prefix webapp run typecheck`(tsc + e2e tsconfig) 통과 →
  `npm --prefix webapp test -- src/lib/__tests__/launch-format.test.ts src/components/admin/__tests__/launch-orders-tab.test.tsx` → 2 files · 87 passed
  (RED 9 실패 확인 후 구현 · 기존 단언 무수정 통과) · 변경 4파일 eslint 0건 · `git diff --quiet -- webapp/src/styles/globals.css` 통과
- 계산 한 벌: `20000` · `COST_BP` 는 packages/shared/src/launch.ts 에만(webapp 2파일 · 새 마이그레이션 grep 0건)
- 범위: 커밋 3개의 파일 = frontmatter files_modified 9개와 정확히 같음(relay · server · workers · globals.css · .planning 무변경)

## 미실행

- Task 4 운영 DB push · 운영 화면 확인 — 오케스트레이터 · 사용자 몫
- 전체 e2e · 전체 회귀 · dev 서버 · 브라우저 확인 — 제약상 돌리지 않음(폰 390 가로 스크롤은 래퍼 className 단언으로만 잠금)

## Deviations from Plan

계획과 코드가 어긋난 곳은 없었다(줄 번호 · 헬퍼 이름 모두 계획 그대로). 구현상 작은 선택만 적는다:

1. **pgTAP 단언 13건** — 계획 behavior 의 단언을 그대로 쓰되 「첫 원소 값」 은 원소 전체 jsonb 비교 1건으로(값 + number 타입을 함께 잠금), 둘째 원소 null 은 stock_code · stock_name 2건으로 나눴고, `p_date` 없을 때 기본 날짜 = 20261112 단언 1건을 더했다. `plan(13)` 은 실제 단언 수와 일치.
2. **손익 톤 표** — 표 · 합계 · 카드가 같은 톤을 쓰도록 컴포넌트 안에 `PNL_TONE`(up `--up` · down `--down` · 0 흐림) 상수와 작은 `PnlValue` · `FillCell` · `SubHead` · `CardPnlRow` 함수 컴포넌트를 두었다(새 CSS 토큰 없음).
3. **launch-format 테스트의 시장 배정 픽스처**에 isin null 조각 1개를 넣어 「isin null 조각 무시」 를 함께 잠갔다.

## Known Stubs

없음.

## Self-Check: PASSED

- 파일 9개 존재 · 커밋 a1896946 · 2065e6af · 01e60455 모두 HEAD 조상
