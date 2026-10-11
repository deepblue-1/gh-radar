---
phase: 12-a-n-master-sync
verified: 2026-06-29T01:45:00Z
status: passed
score: 14/14 must-haves verified
overrides_applied: 0
re_verification: false
---

# Phase 12: 상한가 다음날 이력 통계 (종목상세) Verification Report

**Phase Goal:** 종목 자체의 과거 마감상한가(종가==상한가 가격) 이벤트에 대해 "상한가 종가 매수 → 다음날 시초가 매도" 가정의 다음날 시/고/저/종 수익률을 일봉으로 백테스트해, 종목 상세 페이지에 읽기전용 카드(히어로 익절률%+분포 히스토그램+이벤트 리스트+소속 테마별 익절 경향)로 표시한다. 순수 KRX EOD 집계(외부호출 없음), 신규 워커가 야간 1회 사전계산.
**Verified:** 2026-06-29T01:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | 호가단위 산출 함수(limitUpPrice)가 전일종가→상한가 가격을 KRX 호가단위 절사로 정확 반환 (경계 포함) | ✓ VERIFIED | `packages/shared/src/limitUp.ts:84-95` target(×1.3) 기준 7-tier; shared test 80 passed (황금 6 + 경계, toBe 17건) |
| 2  | 워커가 rebuild_limit_up RPC 1줄 호출 구조로 스캐폴드 | ✓ VERIFIED | `workers/limit-up-sync/src/rebuild.ts:20` `supabase.rpc("rebuild_limit_up", ...)`; co-movement 잔존 0 |
| 3  | LimitUpResponse 객체 계약 타입이 shared 에서 export (webapp·server 공유) | ✓ VERIFIED | `packages/shared/src/index.ts:4-5` 4 타입 + limitUpPrice re-export (확장자 없음) |
| 4  | limit_up_events/stock_stats/theme_stats 3 테이블이 prod Supabase 에 존재 | ✓ VERIFIED | 마이그레이션 3 CREATE TABLE; prod push 후 rebuild event_rows=3459/stock=1271/theme=322 (실행 기록) |
| 5  | rebuild_limit_up() RPC 가 호가단위 백테스트(close=limit_up_price)로 이벤트 도출 → 3 테이블 TRUNCATE+INSERT | ✓ VERIFIED | `migration:140-244` 3 STEP TRUNCATE+INSERT, `close = limit_up_price(prev_close)` 매칭, LAG/LEAD 윈도우 |
| 6  | 황금 케이스 종목(000390/000440)이 정확 재현 | ✓ VERIFIED | fixtures/limit_up_golden.sql 존재; prod curl 000440 events=4 (실행 기록) |
| 7  | GET /api/stocks/:code/limit-up 가 { hero, events, themes } 객체 반환 (배열 아님) | ✓ VERIFIED | `server/src/routes/limitUp.ts:111` `satisfies LimitUpResponse`; prod 000440 → 200 object (실행 기록) |
| 8  | 라우트가 :code regex 검증 + limit_up_* SELECT 만 (on-demand 재계산 0) | ✓ VERIFIED | `limitUp.ts:38` LimitUpParams safeParse; rpc 호출 0; prod curl 전후 event count 불변 (실행 기록) |
| 9  | server prod 재배포 + prod curl 200/객체 | ✓ VERIFIED | Cloud Run revision gh-radar-server-00030-wb6; 000440→200/객체, 005930→200/빈, !!!→400 (실행 기록) |
| 10 | limit-up-sync 워커가 Cloud Run Job + Scheduler(야간 1회, cron 0 2 * * 2-6) 로 rebuild 호출 | ✓ VERIFIED | deploy 스크립트 cron+OAuth; Job + Scheduler 배포 + rebuild 성공 실행 (실행 기록) |
| 11 | smoke 가 Job exit 0 + limit_up_events count>0 + Scheduler ENABLED 검증 | ✓ VERIFIED | `smoke-limit-up-sync.sh` limit_up_events count 체크; smoke INV-1~5 PASS (실행 기록) |
| 12 | 종목상세에 상한가 다음날 이력 섹션이 데이터 대시보드 레이아웃으로 렌더 | ✓ VERIFIED | `stock-limit-up-section.tsx`(502줄); `stock-detail-client.tsx:18,147` 마운트; Vercel 사용자 승인 (실행 기록) |
| 13 | KPI 그리드(익절%·평균·최악·분포) + OHLC 이벤트 표 + 테마 가로 풀링 바 | ✓ VERIFIED | 섹션에 KPI 3그리드 + 전폭 분포 밴드(변형 A) + OHLC 8컬럼 + 테마 풀링 바 + 면책; 점상 태그·국내 색상 토큰 15건 |
| 14 | N(resolvedEvents)<3 큰 익절% 숨김, 이벤트 0회 빈 상태, quiet fallback | ✓ VERIFIED | `shouldShowWinRate(>=3)` import; `return null` quiet fallback; format test N=2/3 경계 + sparkBucketTone(2)=up 박제 |

**Score:** 14/14 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `packages/shared/src/limitUp.ts` | LimitUpResponse 계약 + limitUpPrice TS 미러 | ✓ VERIFIED | 95줄, 4 인터페이스 + 함수, index re-export 됨 |
| `packages/shared/src/limitUp.test.ts` | 황금 + 경계 테스트 | ✓ VERIFIED | toBe 17건, 80 tests green |
| `supabase/migrations/20260628120000_limit_up_tables.sql` | 3 테이블 + 2 함수 + RLS + REVOKE/GRANT | ✓ VERIFIED | 265줄, grep 게이트 전부 통과, prod 적용 |
| `workers/limit-up-sync/src/rebuild.ts` | rebuild_limit_up RPC thin 호출 | ✓ VERIFIED | 26줄, supabase.rpc("rebuild_limit_up") |
| `server/src/routes/limitUp.ts` | 읽기 라우트 (객체 계약, 시세 조인 0) | ✓ VERIFIED | 115줄, satisfies LimitUpResponse, stock_quotes/computeComovement 0 |
| `server/src/schemas/limitUp.ts` | :code zod regex | ✓ VERIFIED | LimitUpParams regex /^[A-Za-z0-9]{1,10}$/ |
| `server/src/mappers/limitUp.ts` | snake→camel 매핑 + null 보존 | ✓ VERIFIED | 160줄, mapEvent/mapStats/mapTheme/zeroStats |
| `scripts/deploy-limit-up-sync.sh` | Cloud Run Job + Scheduler 배포 | ✓ VERIFIED | Dockerfile/OAuth/cron, co-movement 잔존 0 |
| `scripts/setup-limit-up-sync-iam.sh` | SA + supabase-service-role accessor 1개 | ✓ VERIFIED | gh-radar-limit-up-sync-sa, 외부 키 0 |
| `scripts/smoke-limit-up-sync.sh` | INV-1~5 (limit_up_events count) | ✓ VERIFIED | limit_up_events count 체크 |
| `webapp/src/lib/limit-up-api.ts` | fetchStockLimitUp wrapper | ✓ VERIFIED | apiFetch<LimitUpResponse> |
| `webapp/src/lib/limit-up-format.ts` | 게이팅 + spark 색 순수함수 | ✓ VERIFIED | shouldShowWinRate/sparkBucketTone/fmtRet/fmtTurnover/BUCKET_LABELS |
| `webapp/src/components/stock/stock-limit-up-section.tsx` | ②안 섹션 (min 120줄) | ✓ VERIFIED | 502줄, 순수함수 import (인라인 재구현 0) |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| shared index | ./limitUp | re-export (확장자 없음) | ✓ WIRED |
| worker rebuild.ts | rebuild_limit_up RPC | supabase.rpc | ✓ WIRED |
| rebuild_limit_up() | stock_daily_ohlcv | LAG/LEAD + close=limit_up_price | ✓ WIRED |
| stocks.ts | limitUpRouter | use("/:code/limit-up") (line 30, /:code get line 96 보다 앞) | ✓ WIRED |
| limitUp.ts route | limit_up_* 테이블 | supabase.from().select | ✓ WIRED |
| deploy script | workers/limit-up-sync/Dockerfile | docker build -f | ✓ WIRED |
| Scheduler | Cloud Run Job | OAuth invoker (OIDC 금지) | ✓ WIRED |
| stock-detail-client | StockLimitUpSection | co-movement 인근 마운트 | ✓ WIRED |
| section | /api/stocks/:code/limit-up | fetchStockLimitUp | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| stock-limit-up-section | hero/events/themes | fetchStockLimitUp → /api/stocks/:code/limit-up → limit_up_* 테이블 → rebuild_limit_up(stock_daily_ohlcv 집계) | Yes — prod rebuild event_rows=3459, 000440 events=4 | ✓ FLOWING |
| route hero/events/themes | statsRow/eventRows/themeStats | supabase.from(limit_up_*).select (실 DB 쿼리, 정적 반환 아님) | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| limitUpPrice 황금 케이스 정확성 | `pnpm -F @gh-radar/shared test` | 80 passed | ✓ PASS |
| spark off-by-one 가드 + N≥3 게이팅 | `pnpm -F @gh-radar/webapp test -- limit-up-format` | 246 passed/1 skip (sparkBucketTone(2)=up, resolvedEvents 2/3 경계) | ✓ PASS |
| server 라우트 객체 계약/400 | `pnpm -F @gh-radar/server test -- limitUp` | 168 passed | ✓ PASS |
| Wave4 스크립트 구문 | `bash -n` 3 스크립트 | syntax OK | ✓ PASS |
| co-movement 식별자 누락 복제 0 | grep worker+scripts | ALL ZERO | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| LIMIT-01 | 12-01~05 (전 plan) | 마감상한가 이벤트 다음날 OHLC 백테스트 + 종목상세 읽기전용 표시 (24m·점상태그·거래대금/회전율·N≥3 히어로·분포 히스토그램·이벤트 리스트·테마 카드·순수 KRX EOD·야간 워커·server 라우트·종목상세 섹션) | ✓ SATISFIED | REQUIREMENTS.md:145 `LIMIT-01 | Phase 12 | Complete`; truth 1~14 전부 검증, end-to-end prod live |

오펀 요구사항 없음 — REQUIREMENTS.md 가 Phase 12 에 매핑한 ID 는 LIMIT-01 하나이며 전 plan frontmatter 가 선언함.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| migration:158 | `change_rate <= 31` | NULL change_rate 행 묵시 제외 (3VL) | ℹ️ Info (REVIEW WR-01) | prod 3459 이벤트 정상 도출 — 가격 매칭이 주판별, 데이터 완전성 advisory |
| migration:166-169 | `/ e.close` | close=0 시 divide-by-zero 가능성 | ℹ️ Info (REVIEW WR-02) | 실 KRX 가격 0 불가, prod rebuild 성공 — 방어적 가드 권고 |
| limitUp.ts:51 / migration:88 | 첫 버킷 라벨 `−10~−5` | SQL 은 하한 없음(`< -5`), 라벨 부정확 | ℹ️ Info (REVIEW IN-01) | 런타임 무영향, 코멘트만 |

블로커 0. 위 3건은 code review advisory(WR-01/WR-02/IN-01) 로 prod 동작에 영향 없음.

### Human Verification Required

없음 — 본 phase 의 시각/실시간/외부서비스 검증 항목(Vercel 시각 검증, prod curl, GCP smoke, db push)은 실행 중 [BLOCKING] checkpoint 로 라이브 수행·사용자 승인 완료:
- db push → rebuild_limit_up(24) event_rows=3459/stock=1271/theme=322
- server prod curl 000440→200 객체(events=4) / 005930→빈 / !!!→400 / read-only count 불변
- limit-up-sync Job + Scheduler(cron 0 2 * * 2-6) 배포 + rebuild 성공, smoke INV-1~5 PASS
- Vercel StockLimitUpSection 배포 + 사용자 /stocks/000440 시각 "좋음" 승인 (변형 A 분포 밴드)
- RLS TO anon,authenticated 3 테이블, rebuild_limit_up REVOKE PUBLIC/anon/authenticated + GRANT service_role, anon RPC 401

### Gaps Summary

갭 없음. 14/14 must-have 검증, 모든 아티팩트 substantive + wired + data-flowing, 전 테스트 suite green(shared 80 / webapp 246 / server 168), Wave 1~4 식별자 복제 누락 0. LIMIT-01 end-to-end prod live(마이그레이션→server 라우트→야간 워커→webapp 섹션). REVIEW 잔존 항목은 critical 0 / warning 2(advisory edge case) / info 5 로 goal 달성 비차단.

---

_Verified: 2026-06-29T01:45:00Z_
_Verifier: Claude (gsd-verifier)_
