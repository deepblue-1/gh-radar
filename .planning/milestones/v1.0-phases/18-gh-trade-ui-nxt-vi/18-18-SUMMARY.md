---
phase: 18-gh-trade-ui-nxt-vi
plan: 18
subsystem: database
tags: [supabase, migration, dma_orders, check-constraint, trade-07, cr-01, gap-closure]
status: complete

requires:
  - phase: 18-14
    provides: "supabase/migrations/20260922120000_dma_orders_cancel_price_zero.sql (취소 가격 0 허용 CHECK)"
provides:
  - "원격 Supabase(ivdbzxgaapbmrxreyuht) dma_orders_price_check 가 취소('C') 행의 가격 0 을 받아들인다 — CR-01 네 겹 중 DB 층 개방"
affects: [relay-deploy, 18-23, 18-verify, uat]

actuals:
  tokens: 6000
  tasks: 3
  commits: 1
plan_head_before: c85cbb75dffd49086223d510183b5a7af4146def

tech-stack:
  added: []
  patterns:
    - "18-03 과 같은 원격 반영 절차: 전 덤프 → migration list → db push --dry-run → db push --yes → 후 덤프 diff"

key-files:
  created: []
  modified: []

key-decisions:
  - "18-18: 한쪽 문 체크포인트에서 사용자가 「지금 적용」(apply)을 명시 선택했다(2026-09-22) — 원격 dma_orders_price_check 를 취소 가격 0 허용으로 넓혔다"

metrics:
  duration: "약 5분"
  completed: "2026-09-22"
---

# Phase 18 Plan 18: 원격 dma_orders_price_check 취소 가격 0 허용 반영 Summary

**18-14 의 `20260922120000_dma_orders_cancel_price_zero.sql` 을 사용자 승인(apply) 뒤 원격 DB 에 `supabase db push` 로 반영했다. 전후 public 스키마 덤프 diff 는 `dma_orders_price_check` 한 줄 교체뿐이고, 정책 0개·RLS·service_role GRANT 는 그대로다.**

## 수행 내용

### Task 1: [한쪽 문] 적용 여부 결정 — `apply`

- 오케스트레이터가 마이그레이션 원문과 되돌리기 비용(가격 0 취소 행이 기록되면 CHECK 를 되조이는 데 감사 행 재작성 필요)을 사용자에게 제시했다.
- **사용자 선택: 「지금 적용」(`apply`), 2026-09-22.** 마이그레이션 파일은 제시된 원문 그대로 적용했다(수정 없음).

### Task 2: 전 덤프 → dry-run → push (적용 완료)

- **자격:** 저장소 링크(`supabase/.temp/project-ref` = `ivdbzxgaapbmrxreyuht`)와 Supabase CLI 저장 로그인 세션을 그대로 썼다. 사용자에게 자격을 다시 묻지 않았고 비밀 값은 어디에도 남기지 않았다.
- **전 덤프:** `supabase db dump --linked -s public` → 저장소 밖 scratchpad `before.sql` (2025줄, 커밋 안 함).
- **적용 전 `migration list --linked`:** Local/Remote 가 어긋난 행은 하나뿐이었다.
  ```
  20260922120000 |                | 2026-09-22 12:00:00
  ```
- **`supabase db push --dry-run`:**
  ```
  DRY RUN: migrations will *not* be pushed to the database.
  Connecting to remote database...
  Would push these migrations:
   • 20260922120000_dma_orders_cancel_price_zero.sql
  Finished supabase db push.
  ```
  적용 대상 1건, 이 phase 밖 미적용 마이그레이션 없음(T-18-80 완화).
- **`supabase db push --yes`:**
  ```
  Do you want to push these migrations to the remote database?
   • 20260922120000_dma_orders_cancel_price_zero.sql
   [Y/n] y
  Applying migration 20260922120000_dma_orders_cancel_price_zero.sql...
  Finished supabase db push.
  ```
- **적용 후 `migration list --linked`:** `20260922120000 | 20260922120000 | 2026-09-22 12:00:00`. verify 명령 카운트 = 1.

### Task 3: 반영 결과 조회 검증 (전 항목 예상과 일치)

**① 원격 CHECK 정의 원문(적용 후):**
```
CONSTRAINT "dma_orders_price_check" CHECK ((("price" > 0) OR (("price" = 0) AND (("order_type" = 'C'::"text") OR ("krx_session" = ANY (ARRAY['G2'::"text", 'G3'::"text"])))))),
```
`"price" > 0` 갈래와 G2/G3 갈래가 그대로 있고, 취소 갈래는 `"price" = 0 AND (…)` 안에 들어 있다. 그래서 음수는 계속 거부되고, 세션 없는 가격 0 신규·정정도 계속 거부된다(T-18-82 완화). verify 명령(`grep dma_orders_price_check | grep -c order_type`) 결과는 1이다.

**②·③ 접근 규칙 불변(T-18-81 완화):**
- `dma_orders` 대상 `CREATE POLICY`: 전 0 / 후 0 (default-deny 유지).
- `ALTER TABLE "public"."dma_orders" ENABLE ROW LEVEL SECURITY;`: 전후 동일.
- `GRANT ALL ON TABLE "public"."dma_orders" TO "service_role";`: 전후 동일. 다른 GRANT·REVOKE 는 없다.

**④ 전체 public 스키마 diff 원문(before.sql 2025줄 → after.sql 2025줄):**
```
840c840
<     CONSTRAINT "dma_orders_price_check" CHECK ((("price" > 0) OR (("price" = 0) AND ("krx_session" = ANY (ARRAY['G2'::"text", 'G3'::"text"]))))),
---
>     CONSTRAINT "dma_orders_price_check" CHECK ((("price" > 0) OR (("price" = 0) AND (("order_type" = 'C'::"text") OR ("krx_session" = ANY (ARRAY['G2'::"text", 'G3'::"text"])))))),
```
CHECK 한 줄 교체만 있다. 이 마이그레이션은 COMMENT 를 달지 않으므로 COMMENT 변경도 0건이다. 이 phase 밖 스키마는 한 줄도 바뀌지 않았다.

## Deviations from Plan

None - plan executed exactly as written.

- 태스크별 코드 커밋은 없다. Task 2·3 은 원격 DB 반영과 조회만 한다. 마이그레이션 파일은 18-14 에서 이미 커밋돼 있어 저장소에 바뀐 파일이 없다(18-03 과 같은 형태). 커밋은 이 SUMMARY 와 상태 문서를 담는 최종 메타데이터 커밋 1건이다.

## 남은 일 (이 플랜 밖)

- 배포 순서 DB → relay → webapp push 중 **DB 단계만 끝났다.** relay 배포와 webapp push 는 하지 않았다(지시대로).
- TRADE-07 은 완료 표시하지 않는다. 18-23(갭 클로징 전체 기록·18-VALIDATION 갱신)이 아직 남아 있다.
- 실계좌에서 가격 0 시간외종가 원주문의 취소 왕복은 relay 배포 후 UAT 로 확인한다.

## Self-Check: PASSED

- 원격 `migration list --linked` 에 20260922120000 이 Remote 적용 상태로 있다(카운트 1)
- 원격 덤프의 `dma_orders_price_check` 에 `order_type` 이 있다(카운트 1)
- 전후 덤프 diff = 1줄, 정책 0/0, RLS·GRANT 동일
