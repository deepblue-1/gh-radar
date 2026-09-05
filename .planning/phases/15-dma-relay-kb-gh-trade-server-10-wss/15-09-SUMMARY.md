---
phase: 15-dma-relay-kb-gh-trade-server-10-wss
plan: 09
subsystem: database
tags: [supabase, postgres, migration, rls, revoke, service-role, aes-256-gcm, isin, audit-log, dma]

# Dependency graph
requires:
  - phase: 15-04
    provides: "relay/src/store/credentials.ts — dma_credentials 조회 컬럼 계약(user_id/dma_user_id/dma_password_enc) + AES-256-GCM 저장 포맷"
  - phase: 15-05
    provides: "scripts/dma-credentials.ts — dma_credentials upsert 형태(onConflict: user_id, updated_at 명시)"
  - phase: 15-01
    provides: "packages/shared/src/relay.ts — DmaOrderStatus 7종 · OrderSide/OrderType/OrderMarket · RelayExchange"
provides:
  - "public.stocks.isin — 12자 KRX 표준코드 nullable 컬럼 + stocks_isin_len CHECK + idx_stocks_isin 부분 유니크 인덱스 (D-28 코드↔ISIN 매핑의 저장 자리)"
  - "public.dma_credentials — gh-radar 계정 ↔ DMA 로그인 매핑. RLS 활성 + 접근 규칙 0개 + anon/authenticated 명시 REVOKE + service_role GRANT (D-18 allowlist 의 정본)"
  - "public.dma_orders — 요청→접수→체결/취소확인 전 단계를 한 행에 담는 주문 감사 테이블 + (user_id, created_at DESC) / order_no 부분 인덱스 (D-24)"
  - "비공개 테이블 3중 방어 구성의 실측 근거 — 플랫폼 default privileges 가 anon/authenticated 에 전권을 auto-grant 한다는 것을 supabase/postgres 이미지에서 재현"
affects: [15-10, 15-14, 15-16, 15-17, 15-19, 15-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "비공개(service_role 전용) 테이블은 접근 규칙 0개가 곧 방어다 — 규칙을 하나 만드는 순간 브라우저에서 닿는 경로가 열린다"
    - "REVOKE FROM PUBLIC 은 Supabase 에서 무력하다 — ALTER DEFAULT PRIVILEGES 가 anon/authenticated 에 전권을 자동 부여하므로 두 role 을 이름으로 REVOKE 해야 한다 (실측 재현 완료)"
    - "마이그레이션 검증은 문법 lint 가 아니라 '실제로 적용해 보기' 다 — 일회용 supabase/postgres 컨테이너에 이력 전체를 재생하면 공유 DB 를 건드리지 않고 권한·제약·CASCADE 를 전부 실증할 수 있다"
    - "CHECK 제약은 타입 오염의 마지막 방어선 — 6자 단축코드가 12자 ISIN 컬럼에 들어가는 사고를 애플리케이션이 아니라 DB 가 막는다"
    - "감사 테이블의 timeout 은 실패가 아니라 '결과를 모름' 이다 — 상태 이름 자체가 그 구분을 강제한다"

key-files:
  created:
    - supabase/migrations/20260905120000_stocks_isin.sql
    - supabase/migrations/20260905120100_dma_credentials.sql
    - supabase/migrations/20260905120200_dma_orders.sql
  modified:
    - .planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/deferred-items.md

key-decisions:
  - "dma_orders.isin 에 stocks.isin FK 를 걸지 않았다 — 15-10 백필 전까지 stocks.isin 이 대부분 NULL 이라 참조 대상이 없다. 12자 CHECK 로 오염만 막고 무결성은 애플리케이션이 진다"
  - "notice_type 에 CHECK 를 걸지 않았다 — 게이트웨이가 모르는 통보 코드를 보냈을 때 감사 기록이 통째로 실패하는 것이 알 수 없는 값을 그대로 남기는 것보다 나쁘다"
  - "order_type CHECK 를 ('N','C') 두 값으로 좁혔다 — 정정(M) 을 나중에 열 때 마이그레이션이 강제되도록 두는 편이 v1 범위(D-21) 를 코드가 아니라 스키마로 지키는 방법이다"
  - "stocks.isin 마이그레이션만 멱등 가드(IF NOT EXISTS + pg_constraint 조회)를 넣었다 — 컬럼 추가는 재실행 가능성이 실재하지만 CREATE TABLE 은 db push 의 적용 이력이 중복을 막는다"
  - "GRANT ... TO service_role 는 플랫폼 auto-grant 와 중복이지만 남겼다 — kiwoom_tokens 선례이자 의도의 명시이고, default privileges 가 바뀌어도 살아남는다"
  - "SCHEMA.md 를 갱신하지 않았다 — 2026-04-16 (Phase 06.2) 이후 Phase 7~14 가 아무도 갱신하지 않은 죽은 문서다. 여기서만 되살리면 '일부만 최신' 이라는 더 나쁜 상태가 된다"

patterns-established:
  - "일회용 컨테이너 마이그레이션 재생: supabase/postgres 이미지에 supabase/migrations/*.sql 를 파일명 순으로 전부 적용한 뒤 신규분을 검증한다. 공유 DB 접촉 0회로 권한·제약·CASCADE·멱등성을 실증할 수 있고, 부수적으로 '이력이 재생 가능한가' 자체를 감시한다"
  - "auto-grant 반증 프로브: REVOKE 없는 테이블을 같은 DB 에 잠깐 만들어 anon/authenticated grant 를 조회하면, REVOKE 2줄이 장식이 아니라 실제 방어라는 것을 매번 증명할 수 있다"

requirements-completed: [RELAY-01, RELAY-02]

# Metrics
duration: 38min
completed: 2026-09-06
---

# Phase 15 Plan 09: DMA 저장 계층 Summary

**service_role 전용 `dma_credentials`·`dma_orders` 2테이블과 `stocks.isin` 매핑 컬럼을 만들어 production 에 적용 — 접근 규칙 0개 + anon/authenticated 명시 REVOKE 로 브라우저 접근 표면을 제거했고, 그 REVOKE 가 실제로 필요하다는 것을 플랫폼 auto-grant 재현으로 증명했다**

## Performance

- **Duration:** 약 38분
- **Started:** 2026-09-05T16:00Z 경
- **Completed:** 2026-09-05T16:38Z 경
- **Tasks:** 2 (Task 1 실행 + Task 2 체크포인트 — 적용은 오케스트레이터가 메인 체크아웃에서 수행)
- **Files modified:** 4 (신규 마이그레이션 3 + deferred-items 1)

## Accomplishments

- **`dma_credentials` (D-18 / T-15-05)** — `user_id` PK → `auth.users` CASCADE, `dma_user_id`, `dma_password_enc`, `created_at`/`updated_at`. 비밀번호는 base64(nonce‖tag‖ciphertext) AES-256-GCM 이고 AAD 가 `user_id` 라 행 이동 공격이 tag 검증에서 죽는다. 키는 Secret Manager `gh-radar-dma-cred-key` 에 있고 DB 에 없다. **행의 존재 자체가 allowlist** (D-12) 이므로 이 테이블이 곧 권한 판정 기준이다.
- **`dma_orders` (D-24 / T-15-01 / T-15-32)** — 20컬럼 감사 테이블. 한 행이 요청→접수→체결/취소확인까지의 수명주기 전체를 담는다. `(user_id, created_at DESC)` 가 "오늘 주문 목록 복원" 조회의 정본 형태이고, `order_no` 부분 인덱스가 체결·취소확인 통보의 상관 경로다.
- **`stocks.isin` (D-28 / T-15-31)** — 12자 표준코드 nullable 컬럼 + `CHECK (isin IS NULL OR length(isin) = 12)` + 부분 유니크 인덱스. 6자 단축코드 혼입(Pitfall 13 의 ETP 오염)을 DB 레벨에서 차단한다. 값 채우기는 15-10 소관이고 여기서는 자리만 만들었다.
- **REVOKE 2줄이 장식이 아님을 실증** — `supabase/postgres` 이미지에서 REVOKE 없이 테이블을 만들면 `ALTER DEFAULT PRIVILEGES` 때문에 `anon`·`authenticated` 가 `SELECT,INSERT,UPDATE,DELETE,REFERENCES,TRIGGER,TRUNCATE` 전권을 자동으로 받는다. 자동 메모리 `feedback_supabase_rpc_revoke` 가 경고하는 회귀를 실제로 재현했고, 두 테이블은 그 grant 가 0행이다.
- **선재 이슈 1건 발견·기록** — `public.rls_auto_enable()` 이 어느 마이그레이션에도 정의돼 있지 않다. 빈 DB 에서 이력 재생이 불가능하다는 뜻이며, 15-09 와 무관하므로 고치지 않고 `deferred-items.md` 에 남겼다.

## Task Commits

1. **Task 1: 마이그레이션 3건 작성** — `8e18356` (feat)
2. **Task 2: [BLOCKING] `supabase db push` (production 적용)** — 코드 변경 없음. 오케스트레이터가 메인 체크아웃(`/Users/alex/repos/gh-radar`, 링크 ref `ivdbzxgaapbmrxreyuht`)에서 수행.

**Plan metadata:** 본 SUMMARY 커밋

## Files Created/Modified

- `supabase/migrations/20260905120000_stocks_isin.sql` — `stocks.isin` 컬럼 + `stocks_isin_len` CHECK + `idx_stocks_isin` 부분 유니크 인덱스. 멱등(`IF NOT EXISTS` + `pg_constraint` 조회 가드).
- `supabase/migrations/20260905120100_dma_credentials.sql` — `dma_credentials` 테이블 + RLS 활성 + `REVOKE ALL FROM PUBLIC` + `REVOKE ALL FROM anon, authenticated` + `GRANT ... TO service_role`. 접근 규칙 0개.
- `supabase/migrations/20260905120200_dma_orders.sql` — `dma_orders` 테이블(CHECK 7종) + 인덱스 2건 + `dma_credentials` 와 동일한 권한 구성.
- `.planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/deferred-items.md` — `rls_auto_enable()` 선재 이슈 기록.

## Verification

검증을 **로컬 실증 / production 실측 / 미검증** 세 칸으로 나눠 적는다. 세 번째 칸이 있는 이유는 그것이 이 plan 에서 가장 정직해야 하는 부분이기 때문이다.

### A. 로컬 실증 (일회용 `supabase/postgres:17.4.1.075` 컨테이너, 공유 DB 접촉 0회)

`supabase/migrations/*.sql` **이력 전체를 파일명 순으로 재생**한 뒤 신규 3건을 적용해 확인했다. 컨테이너는 검증 후 삭제했다.

| 검증 | 결과 |
| --- | --- |
| `supabase db lint --schema public` | `No schema errors found` |
| 마이그레이션 3건 적용 | `BEGIN … COMMIT` 전부 성공, 오류 0 |
| `pg_policies` (두 테이블) | **0행** |
| `pg_class.relrowsecurity` | `dma_credentials`/`dma_orders` 둘 다 `true` |
| `role_table_grants` anon/authenticated/PUBLIC | **0행** (`service_role` 과 `postgres` 만) |
| `SET ROLE anon` → 두 테이블 SELECT | `permission denied for table …` |
| `SET ROLE authenticated` → 두 테이블 SELECT | `permission denied for table …` |
| `SET ROLE anon` → `dma_credentials` INSERT | `permission denied for table …` |
| `SET ROLE service_role` → 두 테이블 읽기/쓰기 | 정상 |
| `SET ROLE authenticated` → `stocks` SELECT(신규 컬럼 포함) | 정상 (공개 마스터 접근 회귀 없음) |
| **auto-grant 반증 프로브** | REVOKE 없는 테이블은 anon/authenticated 가 `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` 전권 획득 → REVOKE 2줄이 실제 방어임을 증명 |
| 6자 단축코드 → `stocks.isin` | `stocks_isin_len` 위반으로 거부 |
| 중복 ISIN → 다른 종목 | `idx_stocks_isin` 유니크 위반으로 거부 |
| 6자 isin → `dma_orders` | `dma_orders_isin_check` 위반으로 거부 |
| 미정의 `status='unknown'` | `dma_orders_status_check` 위반으로 거부 |
| `order_type='M'` (정정) | `dma_orders_order_type_check` 위반으로 거부 (D-21 범위 강제) |
| `qty=0` | `qty > 0` 위반으로 거부 |
| 상태 전이 `requested → timeout → filled` | 정상 (`notice_type='E'`, `filled_qty=10` 갱신) |
| `dma_credentials` upsert 2회 (`onConflict: user_id`) | 1행 유지 — 등록 스크립트 멱등성 |
| `auth.users` 행 삭제 | 자격증명·주문 CASCADE 삭제 |
| `stocks` 행 삭제 | `dma_orders.stock_code` NULL, 주문 기록 보존 |
| `20260905120000_stocks_isin.sql` 재적용 | no-op (제약 1개·인덱스 1개 유지, 중복 생성 없음) |

### B. production 실측 (오케스트레이터가 메인 체크아웃에서 수행)

| 검증 | 결과 |
| --- | --- |
| `supabase migration list` 사전 확인 | 대기 목록이 정확히 `20260905120000`/`120100`/`120200` 3건. 예상 밖 파일 없음 |
| `supabase db push --yes` | 3건 `Applying...` 후 `Finished supabase db push.` |
| `supabase db push --yes` 재실행 | **`Remote database is up to date.`** (멱등 확인) |
| `supabase migration list` 재확인 | 신규 3건이 Local/Remote 양쪽에 기록됨 |
| `stocks.isin` 컬럼 (REST `select=isin`) | HTTP 200 — 컬럼 존재 |
| `dma_credentials` (service_role REST) | HTTP 200, `content-range: */0` — 테이블 존재·0행 |
| `dma_orders` (service_role REST) | HTTP 200, `content-range: */0` — 테이블 존재·0행 |
| `dma_credentials` anon 접근 | **HTTP 401** — 거부 |
| `dma_orders` anon 접근 | **HTTP 401** — 거부 |

### C. 미검증 (production 기준) — 사유 포함

플랜의 acceptance 에 있었으나 **production 에서는 확인하지 못한** 2건이다. 로컬 실증(A)에서는 전부 통과했지만, 그것은 같은 SQL 이 같은 결과를 낸다는 추론이지 production 관측이 아니다.

1. **`supabase db lint --schema public` (production 기준 재실행)** — `db lint` 는 로컬 DB(`127.0.0.1:54322`)를 요구하는데 메인 체크아웃에 기동돼 있지 않았다. A 에서 동일 명령이 `No schema errors found` 를 냈으나 그것은 컨테이너 DB 기준이다.
2. **`pg_policies` 행 수 · `relrowsecurity` · `role_table_grants` 직접 조회** — 저장소에 production DB 연결 문자열이 없어 SQL 직접 접근 경로가 없었다. REST 의 **anon 401** 로 갈음했다.

**갈음의 한계를 분명히 해 둔다.** anon 401 은 "PostgREST 가 anon 요청을 거부했다"는 사실이고, 그것이 곧 "`pg_policies` 가 0행이고 `role_table_grants` 에 anon grant 가 0행"이라는 뜻은 아니다. 401 은 GRANT 부재로도, RLS default-deny 로도 날 수 있다. 다만 **어느 쪽이든 브라우저에서 닿지 못한다는 결론(T-15-05 / T-15-01 의 방어 목표)은 성립**한다. 정밀 확인이 필요하면 Supabase 대시보드 SQL 에디터에서 다음 두 줄을 실행하면 된다.

```sql
SELECT count(*) FROM pg_policies WHERE tablename IN ('dma_credentials','dma_orders');            -- 기대 0
SELECT grantee, table_name FROM information_schema.role_table_grants
 WHERE table_name IN ('dma_credentials','dma_orders') AND grantee IN ('anon','authenticated');   -- 기대 0행
```

## Decisions Made

- **`dma_orders.isin` 에 FK 를 걸지 않았다.** `stocks.isin` 이 15-10 백필 전까지 대부분 NULL 이라 참조할 대상이 없다. FK 를 지금 걸면 주문 insert 가 전부 막힌다. 12자 CHECK 로 타입 오염만 막고, ISIN↔종목 일치는 server 주문 라우트가 `stocks` 조회로 보장한다.
- **`notice_type` 에 CHECK 를 걸지 않았다.** 게이트웨이 통보 원문 1자(A/E/C/R)를 해석 없이 담는다. 알려지지 않은 코드가 왔을 때 감사 기록 자체가 실패하는 쪽이 훨씬 나쁘다 — 감사 테이블의 목적은 "무슨 일이 있었는지 남기는 것"이지 "예상한 일만 남기는 것"이 아니다.
- **`order_type` CHECK 를 `('N','C')` 로 좁혔다.** 정정(M)·시장가·IOC/FOK 는 v1 범위 밖(D-21)이다. 스키마로 좁혀 두면 범위를 넓힐 때 마이그레이션이 강제되고, 코드가 슬쩍 늘어나는 경로가 막힌다.
- **`stocks.isin` 만 멱등 가드를 넣었다.** 컬럼 추가는 재실행 가능성이 실재하고 `ADD CONSTRAINT` 에는 `IF NOT EXISTS` 가 없어 `pg_constraint` 조회 가드가 필요했다. `CREATE TABLE` 2건은 `db push` 의 적용 이력이 중복 실행을 막으므로 가드를 넣지 않았다(`kiwoom_tokens` 선례와 동형).
- **`GRANT ... TO service_role` 을 남겼다.** 플랫폼 auto-grant 와 중복이지만 `kiwoom_tokens` 선례이자 의도의 명시이고, default privileges 정책이 바뀌어도 살아남는 유일한 줄이다.
- **`supabase/SCHEMA.md` 를 갱신하지 않았다.** 그 문서는 2026-04-16 (Phase 06.2) 에 멈춰 있고 Phase 7~14 의 어떤 테이블도 반영돼 있지 않다(`kiwoom_tokens`·`conversations` 등 전부 누락). 여기서만 되살리면 "일부만 최신"이라는 더 판단하기 어려운 상태가 된다. 갱신하려면 전체를 한 번에 해야 하고 그것은 별도 작업이다.

## Deviations from Plan

플랜에 명시되지 않았으나 추가한 것 1건. 전부 Rule 2(누락된 필수 기능) 범위 안이다.

### Auto-fixed Issues

**1. [Rule 2 - Correctness] `dma_orders.filled_qty` 에 `CHECK (filled_qty >= 0)` 추가**

- **Found during:** Task 1 (`dma_orders` 스키마 작성)
- **Issue:** 플랜과 RESEARCH 초안은 `filled_qty integer NOT NULL DEFAULT 0` 만 지정했다. `qty`/`price` 에는 양수 CHECK 가 있는데 체결수량만 무제한이라 음수가 들어갈 수 있었다. 체결수량이 음수인 감사 기록은 복원 로직(오늘 주문 목록)에서 조용히 잘못된 잔량을 만든다.
- **Fix:** 같은 줄에 `CHECK (filled_qty >= 0)` 추가. `> 0` 이 아니라 `>= 0` 인 것은 미체결(0)이 정상 상태이기 때문이다.
- **Files modified:** `supabase/migrations/20260905120200_dma_orders.sql`
- **Verification:** 로컬 컨테이너에서 CHECK 정의 확인 + `qty=0` 거부 테스트와 함께 실행
- **Committed in:** `8e18356` (Task 1 커밋에 포함)

---

**Total deviations:** 1 auto-fixed (Rule 2 × 1)
**Impact on plan:** 컬럼 1개에 CHECK 1줄. 스키마 형태·인덱스·권한 구성은 플랜 그대로다. 범위 확장 없음.

## Issues Encountered

**1. `supabase db lint` 가 로컬 DB 를 요구한다 — 검증 환경을 직접 만들어야 했다**

`db lint` 는 `127.0.0.1:54322` 로컬 스택을 전제하고, `--db-url` 은 TLS 를 강제해 평문 컨테이너에 붙지 않는다. 처음 시도한 `postgres:16-alpine` 은 `plpgsql_check` 확장이 없어 lint 자체가 실패했다.

→ `supabase/postgres:17.4.1.075` 를 받아 54322 포트로 띄웠다. 이 이미지는 `anon`/`authenticated`/`service_role` 과 `auth.users` 를 이미 갖고 있어 production 환경 재현도가 높다. 결과적으로 lint 통과뿐 아니라 **플랫폼 default privileges 실측**까지 가능해져, 예정에 없던 가장 중요한 근거를 얻었다.

**2. 마이그레이션 이력 전체 재생이 두 지점에서 멈췄다**

- `auth.jwt()` 부재 (`20260610130000_theme_admin_overrides.sql`) — GoTrue 가 제공하는 플랫폼 함수라 정상이다. 검증 컨테이너에만 스텁을 만들어 통과.
- `public.rls_auto_enable()` 부재 (`20260702160000_security_perf_advisor_fixes.sql:23`) — **이쪽은 정상이 아니다.** 어느 마이그레이션에도 `CREATE` 가 없는데 `REVOKE` 만 3줄 걸려 있다. production 에는 함수가 있어 `db push` 는 무사하지만, 빈 DB 에서 이력을 처음부터 재생할 수 없다는 뜻이다 — 로컬 `supabase start`, `db reset`, 재해복구, 신규 스테이징 구축이 전부 이 지점에서 멈춘다.

→ 둘 다 15-09 의 변경과 무관하다(2026-06/07 자 파일). 검증 컨테이너에만 no-op 스텁을 만들어 재생을 이어갔고 저장소 파일은 손대지 않았다. 두 번째 건은 `deferred-items.md` 에 처리 권고(`pg_get_functiondef` 덤프 → 보정 마이그레이션)와 함께 기록했다.

**3. 워크트리가 Supabase 에 링크돼 있지 않다**

`supabase/.temp/project-ref` 는 gitignore 대상이라 워크트리에 없다. 체크포인트에서 "push 는 메인 체크아웃에서 실행" 을 명시했고 오케스트레이터가 그대로 수행했다. 앞으로 워크트리에서 마이그레이션을 만드는 plan 은 같은 제약을 전제해야 한다.

## Known Stubs

없음. 세 마이그레이션 모두 완결된 스키마이며 미배선 컬럼이나 자리표시 값이 없다.

`stocks.isin` 이 전 종목 NULL 인 것은 스텁이 아니라 **설계된 상태**다 — 컬럼 생성과 값 백필을 분리하는 것이 D-28 의 의도이고, 백필은 15-10 이 master-sync 의 `krxToMasterRow` 를 고쳐 정상 경로로 수행한다. 그때까지 주문·구독은 `isin` 이 있는 종목에 한해 동작한다.

## Threat Flags

없음. 이 plan 이 만든 표면은 전부 플랜 `<threat_model>` 에 등록돼 있고(T-15-05 / T-15-01 / T-15-31 / T-15-32), 네 건 모두 `mitigate` 로 처리했다. 새 네트워크 엔드포인트·인증 경로·파일 접근은 추가하지 않았다.

## Authentication Gates

Task 2 는 `checkpoint:human-action` 이었고, 이번 실행에서는 **공유 DB 변경을 실행자가 하지 않는다**는 지시에 따라 체크포인트로 반환했다. 오케스트레이터가 메인 체크아웃에서 기존 링크(ref `ivdbzxgaapbmrxreyuht`)와 credential 을 재사용해 push 했다. 사용자에게 credential 을 새로 요청한 일은 없다(자동 메모리 `feedback_dont_ask_existing_creds`).

## User Setup Required

없음. 외부 서비스 신규 구성 없이 기존 Supabase 프로젝트에 마이그레이션만 적용했다.

`dma_credentials` 는 0행으로 시작한다 — 실제 사용자를 allowlist 에 넣으려면 `scripts/dma-credentials.ts --email <이메일> --dma-user <DMA user_id>` 를 실행해야 하고, 그건 relay 실가동 wave 소관이다.

## Next Phase Readiness

**바로 열린 것**

- **15-10 (master-sync ISIN 백필)** — `stocks.isin` 컬럼·CHECK·유니크 인덱스가 준비됐다. `krxToMasterRow` 에서 `ISU_CD` 가 `/^KR\w{10}$/` 일 때만 채우는 가드(Pitfall 13)를 넣고 1회 실행하면 된다. **CHECK 가 이미 12자를 강제하므로, 가드를 빼먹으면 백필이 조용히 오염되는 게 아니라 시끄럽게 실패한다** — 그게 이 제약의 존재 이유다.
- **15-14 / 15-16 (relay 자격증명 조회 결선)** — `relay/src/store/credentials.ts` 의 `getDmaCredentials` 가 기대하는 컬럼 3개가 그대로 존재한다. 등록 스크립트로 행을 하나 넣으면 즉시 end-to-end 확인이 가능하다.
- **15-17 (server 주문 라우트)** — `dma_orders` insert/update 대상이 준비됐다. **service_role 은 RLS 를 우회하므로 소유권은 애플리케이션이 `WHERE user_id` 명시 필터로 강제해야 한다** (chat-history 규약 동형). DB 는 브라우저 직접 접근만 막았지, 서버가 잘못 짠 쿼리는 막지 못한다.

**남은 부담**

- production 기준 `pg_policies` / `role_table_grants` 직접 확인이 미완이다(§Verification C). 브라우저 차단이라는 결론 자체는 anon 401 로 확인됐지만, 대시보드 SQL 두 줄을 돌릴 기회가 있으면 정밀 확인해 두는 편이 좋다.
- `rls_auto_enable()` 누락으로 **마이그레이션 이력이 빈 DB 에서 재생 불가**다. 지금 당장 막히는 것은 없지만 로컬 `supabase start` / `db reset` / 재해복구가 필요해지는 순간 전부 이 지점에서 멈춘다. `deferred-items.md` 의 권고대로 별도 quick 으로 처리할 것.

---
*Phase: 15-dma-relay-kb-gh-trade-server-10-wss*
*Completed: 2026-09-06*

## Self-Check: PASSED

- 생성 주장 파일 4건 존재 확인 (`20260905120000_stocks_isin.sql`, `20260905120100_dma_credentials.sql`, `20260905120200_dma_orders.sql`, `15-09-SUMMARY.md`)
- 수정 주장 파일 1건 존재 확인 (`deferred-items.md`)
- Task 1 커밋 `8e18356` git 이력에 존재 확인
