---
phase: 18-gh-trade-ui-nxt-vi
plan: 03
subsystem: database
tags: [supabase, migration, dma_orders, check-constraint, trade-07]
status: complete

requires:
  - phase: 18-01
    provides: "supabase/migrations/20260921120000_dma_orders_modify_offhours.sql (정정 M · piece_count · krx_session · 조건부 price CHECK)"
provides:
  - "원격 Supabase(ivdbzxgaapbmrxreyuht) dma_orders 가 order_type 'M' 과 G2/G3 한정 price 0 을 받아들인다"
  - "감사 컬럼 dma_orders.piece_count(integer) · dma_orders.krx_session(text, G2/G3/NULL CHECK) 실존"
  - "18-VALIDATION nyquist_compliant true 재판정"
affects: [relay-deploy, 18-verify, uat]

actuals:
  tokens: 9000
  tasks: 2
  commits: 1
plan_head_before: 46ac6dbfaf15c5d2ab3f87b9344647855b39700f

tech-stack:
  added: []
  patterns:
    - "읽기 전용 실 DB 검증 = `supabase db dump --linked -s public` 전후 스냅숏 diff (psql·Management API 토큰 없이 CLI 링크 자격만 사용)"

key-files:
  created: []
  modified:
    - .planning/phases/18-gh-trade-ui-nxt-vi/18-VALIDATION.md

key-decisions:
  - "18-03: 실 DB 검증은 pg_catalog 직접 조회 대신 원격 public 스키마 덤프 전후 diff 로 했다 — CLI v2.75 에 db query 가 없고 psql 미설치, 키체인 토큰 탐색은 하지 않았다. 덤프가 제약 정의·정책·GRANT 를 모두 담아 같은 증거가 된다"

metrics:
  duration: "약 10분"
  completed: "2026-09-22"
---

# Phase 18 Plan 03: dma_orders 마이그레이션 실 DB 반영 Summary

**18-01 의 `20260921120000_dma_orders_modify_offhours.sql` 을 `supabase db push` 로 원격 DB 에 반영했다. 원격 스키마 덤프 전후 diff 로 정정 `'M'` 허용, G2/G3 한정 `price 0`, 감사 컬럼 2개가 생겼고 접근 규칙(정책 0개 · service_role GRANT)은 그대로임을 확인했다.**

## 수행 내용

### Task 1: `supabase db push` 실 반영 (적용 완료)

- **자격:** 저장소가 이미 링크돼 있었다(`supabase/.temp/project-ref` = `ivdbzxgaapbmrxreyuht`). Supabase CLI 에 저장된 로그인 세션을 그대로 썼다. 새 비밀을 만들지 않았고, 사용자에게 자격을 다시 묻지 않았다. 토큰·비밀번호 값은 로그와 이 문서 어디에도 남기지 않았다.
- **적용 전 `migration list --linked`:** Local/Remote 가 어긋난 행은 `20260921120000` 하나뿐이었다(Remote 열 비어 있음).
- **`supabase db push --dry-run`:**
  ```
  Would push these migrations:
   • 20260921120000_dma_orders_modify_offhours.sql
  ```
  이 phase 밖의 미적용 마이그레이션은 끼어 있지 않았다(T-18-10 완화).
- **`supabase db push --yes`:**
  ```
  Applying migration 20260921120000_dma_orders_modify_offhours.sql...
  Finished supabase db push.
  ```
- **적용 후 `migration list --linked`:** `20260921120000 | 20260921120000 | 2026-09-21 12:00:00`. Remote 열이 채워졌다. verify 명령 `grep -c "20260921120000"` 결과는 1이다.

### Task 2: 반영 결과 조회 검증 (전 항목 예상과 일치)

조회는 읽기 전용 `supabase db dump --linked -s public` 으로 했다. 푸시 **전**(`before.sql`, 2014줄)과 **후**(`after.sql`) 스냅숏을 떠서 diff 했다.

**① / ② 제약 정의 원문(적용 후):**
```
CONSTRAINT "dma_orders_order_type_check" CHECK (("order_type" = ANY (ARRAY['N'::"text", 'M'::"text", 'C'::"text"]))),
CONSTRAINT "dma_orders_price_check" CHECK ((("price" > 0) OR (("price" = 0) AND ("krx_session" = ANY (ARRAY['G2'::"text", 'G3'::"text"]))))),
CONSTRAINT "dma_orders_krx_session_check" CHECK ((("krx_session" IS NULL) OR ("krx_session" = ANY (ARRAY['G2'::"text", 'G3'::"text"])))),
```
적용 전 원문은 `order_type = ANY (ARRAY['N','C'])`, `price > 0` 이었다. 가격 CHECK 는 `price = 0 AND …` 로 좁혀져 있어서 G2/G3 이어도 음수는 거부된다.

**③ 컬럼 원문(적용 후):**
```
"piece_count" integer,
"krx_session" "text",
```
두 컬럼 모두 COMMENT(D-22 / D-23 문구)가 함께 반영됐다.

**④ 접근 규칙 불변:** 전후 모두 같다.
- `dma_orders` 를 대상으로 하는 `CREATE POLICY`: 전 0건 / 후 0건. default-deny 의도(T-15-01 / T-16-08)가 유지된다.
- `ALTER TABLE "public"."dma_orders" ENABLE ROW LEVEL SECURITY;`: 전후 동일.
- `GRANT ALL ON TABLE "public"."dma_orders" TO "service_role";`: 전후 동일. 다른 GRANT·REVOKE 는 없다.

**전체 public 스키마 diff:** 아래 네 가지 말고는 한 줄도 바뀌지 않았다.
- 컬럼 2줄 추가
- `krx_session_check` 추가
- `order_type_check` · `price_check` 정의 교체
- COMMENT 2건

이 phase 밖의 스키마는 변화가 없다(T-18-11 완화). 추가로 `grep -c krx_session` 을 마이그레이션 파일에 돌린 결과는 7이다(기준 3 이상).

## 부수 갱신

- `18-VALIDATION.md` 를 고쳤다. `nyquist_compliant` 를 false 에서 true 로 올렸다(유일한 차단 사유가 18-03 미실행이었다). 18-01/18-03 행을 ✅ 로 바꾸고, Sign-Off 두 항목에 체크하고, 재판정 줄을 추가했다. Wave 0 의 `price >= 0` 표기도 실제 정의로 정정했다 (커밋 417e018).
- REQUIREMENTS.md TRADE-07 → Complete (state 갱신 단계에서 반영)

## Deviations from Plan

**1. [Rule 3 - Blocking] 조회 수단: `pg_constraint` 직접 조회 대신 스키마 덤프 diff**
- **문제:** 설치된 CLI v2.75.0 에는 `supabase db query` 가 없고 psql 도 없다. Management API 는 액세스 토큰 값을 꺼내야 하는데, 그 탐색은 자격 탐색으로 차단됐다.
- **대응:** CLI 링크 자격만 쓰는 읽기 전용 `supabase db dump --linked -s public` 으로 전후 스냅숏을 떴다. 덤프는 `pg_get_constraintdef` 와 같은 정의문과 정책·GRANT 를 모두 담는다. 새 스크립트나 새 비밀은 만들지 않았다.
- **영향:** 없음. 플랜의 네 가지 확인 항목을 모두 원문으로 증명했다.

**2. 태스크별 코드 커밋 없음**
- Task 1·2 는 원격 DB 반영과 조회만 한다. 마이그레이션 파일은 18-01 에서 이미 커밋돼 있다. 그래서 저장소에 바뀐 파일이 없고, 빈 커밋은 만들지 않았다. 문서 커밋은 VALIDATION 재판정(417e018) 1건과 최종 메타데이터 커밋이다.

## 남은 일 (이 플랜 밖)

- 배포 순서는 DB → relay → 검증 → push 이다. **DB 단계만 끝났다.** relay 배포와 webapp push 는 하지 않았다(지시대로).
- 실 게이트웨이 정정 왕복 등 Manual-Only 4항목은 여전히 UAT 인계 상태다.

## Self-Check: PASSED

- FOUND: .planning/phases/18-gh-trade-ui-nxt-vi/18-VALIDATION.md (수정)
- FOUND: 417e018 (git log)
- 원격 `migration list --linked` 에 20260921120000 이 Remote 적용 상태로 있다
