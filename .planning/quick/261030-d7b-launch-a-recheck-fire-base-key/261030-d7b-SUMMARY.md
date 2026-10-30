---
phase: quick-261030-d7b
plan: 01
subsystem: launch-gate
status: complete
tags: [launch, supabase, pgtap, primary-key, webapp, shared]
requires:
  - supabase/migrations/20261027200000_launch_gate.sql (launch_pieces · launch_heads · 두 upsert 헬퍼)
  - supabase/migrations/20261028200000_launch_project_mapping.sql (expected_cum → fire_base 투영)
provides:
  - launch_pieces PK (trade_date, gateway, profile, fire_exchange, fire_base, market, wire)
  - launch_heads PK (trade_date, gateway, profile, fire_exchange, fire_base, market)
  - shared isLaunchFireBaseOf(profile, fireExchange, fireBase)
affects:
  - 어드민 발사 주문 내역 09:00:30 탭(n0930) — A KRX 재확인 회차 행 표시
  - 원격 적용 뒤 launch_reproject 로 10-29 · 10-30 사라진 행 복구(메인 세션)
tech-stack:
  added: []
  patterns:
    - "PK 교체는 한 ALTER 안 DROP CONSTRAINT + ADD CONSTRAINT(같은 이름)"
    - "헬퍼 재정의는 원본 본문 글자 그대로 + diff 로 두 곳만 바뀐 것 확인"
key-files:
  created:
    - supabase/migrations/20261030200000_launch_fire_base_key.sql
    - supabase/tests/launch_fire_base_key.test.sql
  modified:
    - packages/shared/src/launch.ts
    - packages/shared/src/__tests__/launch.test.ts
    - webapp/src/lib/launch-format.ts
    - webapp/src/lib/__tests__/launch-format.test.ts
decisions:
  - "A KRX 기준시각 창은 09:00:00 이상 09:00:30 미만 — StockDMA.fbs case1_fire_ms(09:00:00 기준 · 25000 미만/29500 이상 거부) + 마감선 재확인 09:00:29 근거"
  - "launchFireBaseOf 는 의미 무변경(relay 백필 기본값 09:00:27) — 주문 내역 판정만 isLaunchFireBaseOf 로 분리"
  - "기존 PK 제약 이름(launch_pieces_pkey · launch_heads_pkey)을 재생 DB pg_constraint 로 확인 후 같은 이름으로 재생성"
metrics:
  duration: "약 25분"
  completed: 2026-10-30
estimate:
  tokens: 70000
  tasks: 2
actuals:
  tokens: 11600
  tasks: 2
  commits: 2
plan_head_before: 1ce901e1c5435f5a6a8e9af0b6f9b9e009d98bb8
plan_head_after: 2a81523fc7ecda2ae3810f9758f0ced05319f981
requirements: [KEY-01, KEY-02, KEY-03, WEB-01, WEB-02, OPS-01]
---

# Quick 261030-d7b Plan 01: 발사 A KRX 재확인 회차 키 결함(fire_base) Summary

발사 조각 · 머리 PK 에 fire_base 를 넣고 두 upsert 헬퍼의 ON CONFLICT 대상만 새 키로 재정의해 A KRX 마감선 재확인 회차(09:00:29)가 본회차(09:00:27)를 덮지 않게 했고, 웹 주문 내역 09:00:30 탭이 shared `isLaunchFireBaseOf` 로 재확인 회차 행을 「A 09:00:29 KRX→」 로 보이게 했다.

## Tasks

| Task | 이름 | 커밋 | 파일 |
| ---- | ---- | ---- | ---- |
| 1 | 키에 fire_base — 새 pgTAP RED → 마이그레이션 GREEN | 301280e6 | supabase/migrations/20261030200000_launch_fire_base_key.sql · supabase/tests/launch_fire_base_key.test.sql |
| 2 | 주문 내역 n0930 탭 판정 isLaunchFireBaseOf | 2a81523f | packages/shared/src/launch.ts · packages/shared/src/__tests__/launch.test.ts · webapp/src/lib/launch-format.ts · webapp/src/lib/__tests__/launch-format.test.ts |

## Task 1 — RED / GREEN

사전 확인: 로컬 재생 DB(89 마이그레이션) pg_constraint contype p = `launch_pieces_pkey` · `launch_heads_pkey`(기대와 같음).

RED(옛 키 · 89 마이그레이션 재생) — `1..23` 중 7건 not ok:

```
not ok 2 - (2026-10-30, KYOBO119, A, KRX, Q, wire 0) 두 행 — have: 09:00:29/104  want: 09:00:27/101,09:00:29/104
not ok 4 - (2026-10-30, KYOBO119, A, KRX, *, 조각 총수) = 3 — have: 2
not ok 5 - (…, 머리) 두 행 — have: 09:00:29/105/1  want: 09:00:27/103/2,09:00:29/105/1
not ok 6 - (launch_orders_for_admin pieces 순서) — have: 09:00:27 w1,09:00:29 w0
not ok 7 - (launch_orders_for_admin heads fire_base) — have: 09:00:29
not ok 20 - (launch_pieces, PK) — have: {trade_date,gateway,profile,fire_exchange,market,wire}
not ok 21 - (launch_heads, PK) — have: {trade_date,gateway,profile,fire_exchange,market}
```

GREEN(90 마이그레이션 재생): `launch_fire_base_key` 23/23 ok · RESULT PASS.

마이그레이션 헬퍼 본문은 20261027200000 ③(178~377행)을 그대로 옮겨 diff 로 확인 — 바뀐 곳은 `CREATE` → `CREATE OR REPLACE` · ON CONFLICT 대상 두 곳 · DO UPDATE SET 의 fire_base 줄 삭제 두 곳 · COMMENT ON FUNCTION 문구 두 곳뿐. WHERE 조건부 덮기 규칙 · 검사 · 필수 키 · source 처리 원문 동일 · 권한 3줄 × 2. 주석 밖 `ON CONFLICT (trade_date, gateway, profile, fire_exchange, fire_base, market` = 2.

옛 키 의존 SQL 재확인: migrations 전체에서 launch_* 대상 ON CONFLICT 는 두 헬퍼뿐. `DISTINCT ON (h.gateway, h.market, h.profile)`(launch_map_for_admin)은 fire_exchange · fire_base 로 먼저 거르므로 영향 없음. 20261030120000 launch_orders_for_admin 의 LEFT JOIN 은 dma_account_orders(order_no) 대상이라 무관. relay · server 코드는 RPC 만 부른다(표 `.upsert({onConflict})` 없음).

## 회귀(일회용 컨테이너 · 원격 접촉 0)

| 테스트 | 결과 |
| ------ | ---- |
| launch_fire_base_key.test.sql | 23/23 ok |
| launch_project_mapping.test.sql | 36/36 ok |
| launch_gate_apply.test.sql | 38/38 ok |
| launch_plan_changes.test.sql | 26/26 ok |
| launch_gate.test.sql(열람만 · 다른 세션 1ce901e1 의 plan 61 포함) | 61/61 ok |

## Task 2 — RED / GREEN

RED: shared launch.test 14 failed(isLaunchFireBaseOf 없음 — it.each 14줄) · webapp launch-format.test 3 failed(재확인 조각이 n0930 탭에서 빠짐 · 카드 count 5).

GREEN(verify 체인 전부 rc 0):
- `pnpm --filter @gh-radar/shared build` · `typecheck` 통과
- shared `launch.test.ts` 43/43
- webapp `launch-format.test.ts` + `launch-orders-tab.test.tsx` 44/44
- webapp `typecheck` · `eslint src/lib/launch-format.ts`(+ 테스트 파일) 통과
- relay `typecheck` · `launch-backfill.test.ts` 18/18(launchFireBaseOf 무변경 회귀)

orderTabPiecesOf · launchHeadCardOf 는 코드 변경 없이 테스트로만 잠겼다(정렬이 이미 fire_base 를 fire_exchange 앞에 둠 · n0930 카드는 N 머리만 씀). launch-orders-tab.tsx 조각 행 key 에 fire_base 가 이미 있어 편집하지 않음.

## Deviations from Plan

None - plan executed exactly as written.

참고(환경): 계획 작성 시 「다른 세션 미커밋」 이던 20261030120000_launch_orders_filled_join.sql · supabase/tests/launch_gate.test.sql 은 실행 시점에 1ce901e1 로 이미 커밋돼 있었다 — 편집 · stage 하지 않았고 launch_gate.test.sql 회귀는 통과.

## Known Stubs

없음.

## 메인 세션 체크리스트(20:00 KST 뒤 · 장 밖 — 실행자는 하지 않음)

1. git branch --show-current = master · git status -sb · `supabase migration list --linked` 로 Local 에만 있는 버전 확인. 다른 세션의 20261030120000_launch_orders_filled_join(미커밋)이 그때 작업 트리에 있으면 db push 가 함께 올린다 — 그 세션과 먼저 합의(같이 올리거나 그 세션이 먼저 커밋 · 적용).
   - 실행 시점 메모: 20261030120000 은 이미 1ce901e1 로 커밋됨 — 원격 미적용이면 이번 db push 가 20261030120000 · 20261030200000 둘 다 올린다(그 세션과 합의 필요).
2. `supabase db push --linked --yes` → 20261030200000_launch_fire_base_key 적용.
3. `bash scripts/launch-backfill.sh --reproject --from 20261028` (dry-run) → 대상 kind 17·18 원문 수 확인.
4. `bash scripts/launch-backfill.sh --reproject --from 20261028 --apply` → projected = 3 의 수 · errors 0.
5. 복구 확인(읽기 전용 SQL 또는 `bash scripts/launch-backfill.sh --status`):
   - A KRX 행 묶음: launch_pieces · launch_heads 에서 profile A · fire_exchange KRX · trade_date 2026-10-29 ~ 2026-10-30 · gateway KYOBO119 를 (trade_date, market, fire_base) 로 세면 10-29 Q · 10-30 K · 10-30 Q 각각 09:00:27 과 09:00:29 두 묶음이 나온다.
   - 사라졌던 seq 3160182 · 3160185 · 3372361 · 3372364 · 3372365 · 3372366 · 3372367 이 launch_pieces ∪ launch_heads(gateway KYOBO119) 에 전부 있다.
   - 같은 거래일에 source backfill 행과 journal 행이 함께 있는 날짜가 없다(있으면 fire_base 가 다른 중복일 수 있다 — 기록 후 판단).
6. `git push` (webapp 프로덕션 배포 = push). 배포 뒤 어드민 발사 주문 내역 10-29 · 10-30 의 09:00:30 탭에 「A 09:00:29 KRX→」 행이 보이는지 사용자 확인.
7. 「phase 35: 발사경계지도」 세션에 키 수정 커밋 해시(301280e6 · 2a81523f) 통보 — 그 세션의 launch_map_for_admin 뒤탐침 마이그레이션은 20261030200000 뒤 버전으로, launch_upsert_piece/head 를 다시 정의하게 되면 새 ON CONFLICT 대상을 유지.
8. 35-11 Task 3(두 노트 닫기) 재개.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261030200000_launch_fire_base_key.sql
- FOUND: supabase/tests/launch_fire_base_key.test.sql
- FOUND: 301280e6 · 2a81523f (HEAD 조상)
