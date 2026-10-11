# Phase 12: 상한가 다음날 이력 통계 (종목상세) - Research

**Researched:** 2026-06-27
**Domain:** PostgreSQL 백테스트 집계(plpgsql RPC) + Phase 11 co-movement 아키텍처 복제 + KRX 호가단위 가격 산출
**Confidence:** HIGH (핵심 호가단위·이벤트 판별·수익률 계산을 실데이터 4-window 실측 검증; 아키텍처는 동작 중인 Phase 11 코드 1:1 복제)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01 ~ D-23 모두 확정 — 대안 탐색 금지)

**A. 상한가 이벤트 판별 — 가격 매칭(비율 임계 아님)**
- **D-01:** 상한가 이벤트는 비율 임계가 아니라 **상한가 "가격" 도달**로 판별. 상한가 가격 = 전일 종가 × 1.30 을 KRX 호가단위로 정리한 결정값. 일봉 재구성 가능.
- **D-02:** 도달 기준 = **마감상한가** `close == 상한가가격`. 장중 고가 터치 후 밀린 날 제외.
- **D-03:** **점상한가(점상) 태그** = `open == high == low == close == 상한가가격`. OHLC만으로 판별.
- **D-04:** lookback = **24개월**. 단일 호가단위 테이블로 처리.

**B. 핵심 지표 + 진입/청산 가정**
- **D-05:** 진입 **A안** = 상한가 당일 종가(=상한가)에 매수. 핵심 지표 = 다음 영업일 시초가 수익률 = `(다음날 open − 이벤트일 close) / 이벤트일 close`.
- **D-06:** 이벤트별 표시 = 다음날 시/고/저/종 수익률 4종 (모두 이벤트일 종가 기준). 고가는 참고용, 시초가가 주 지표.
- **D-07:** 추가 컬럼 = 거래대금(`trade_amount` 직접) + 회전율(`volume / stocks.listing_shares`). ⚠ listing_shares 현재값 → 과거 근사.

**C. 표시 — C안(히어로 + 분포 + 이벤트 리스트 + 테마 카드)**
- **D-08:** 히어로 = 큰 시초가 익절 확률% + "과거 N회 중 M회". 서브라인 = 평균 시초가 / 최악 저가 / 최근 3회 승패.
- **D-09:** 확률% 게이팅 = **N≥3** (미만이면 큰 % 숨기고 카운트만).
- **D-10:** "최근 N회" 보조스탯 **N=3** (최근 3회 + 최신순). 감쇠공식 금지.
- **D-11:** 분포 히스토그램 = 다음날 시초가 수익률 분포. 5버킷(−10\~−5 / −5\~0 / 0\~+5 / +5\~+10 / +10%+), 수익=빨강 `--up`·손실=파랑 `--down`. 정확한 경계는 Claude 재량.
- **D-12:** 이벤트 리스트 = 최신순. 컬럼 = 상한가일·구분(점상/일반)·다음날 시·고·저·종·거래대금·회전율. 오래된 건 faded. 길면 상위 N + 더보기.
- **D-13:** 색상 = 수익=빨강 `--up` / 손실=파랑 `--down` / 보합=`--flat`. globals.css oklch 토큰 직접 사용 (차트 아님 → 변환 불필요).
- **D-14:** 하단 면책 = "표본 N회로 적음 / 과거 통계이며 미래 수익 보장 아님 / 출처 KRX".

**D. L2 — 소속 테마의 다음날 익절 경향 카드**
- **D-15:** per-stock 과 별도 축. 의미 = 종목 소속 테마의 멤버 전체가 과거 마감상한가 시 다음날 시초가 익절률 (테마 풀링, 24개월).
- **D-16:** 데이터 = `theme_stocks`(is_system=true, effective_to IS NULL active) + 동일 상한가 백테스트를 테마 멤버 풀로 집계. **신규 집계**(co-movement 동조와 다름 — 단순 멤버 풀링 익절률).
- **D-17:** 테마 선택/정렬 = 소속 시스템 테마 전부, 표본수 N(테마 풀 누적 상한가 이벤트 수) 내림차순. 유저 테마 제외. 많으면 상위 일부 + 더보기. 표기 = 테마명·익절률%·"N=… · 평균 ±x%".
- **D-18:** AI 테마 중복제거(Phase 10) 위에 얹음 — 별도 정규화 없음.

**E. 아키텍처 — Phase 11 co-movement 패턴 복제**
- **D-19:** 사전계산 = 신규 thin 워커(co-movement-sync 복제). 마이그레이션(`limit_up_*` 테이블) → plpgsql `rebuild_*` RPC(TRUNCATE+INSERT, SECURITY DEFINER + search_path) → 워커가 RPC 1줄 호출 → Cloud Run Job + Scheduler. **기존 master-sync 확장 아님.**
- **D-20:** 스케줄 = candle-sync EOD(17:30 KST) 이후 야간 1회.
- **D-21:** 종목상세 읽기 = server 읽기 라우트(`/api/stocks/:code/...`, comovement 미러, `{...}` 객체 반환) → 새 라우트는 server 재배포 + prod curl 검증. 마운트 = stock-detail-client.tsx co-movement 섹션 인근.
- **D-22:** on-demand fetch 금지 — 워커가 미리 채운 테이블만 읽음.
- **D-23:** 단일 확률숫자 대신 이벤트 리스트가 히어로. 확률%는 N≥3 보조. 시장평균/shrinkage 미사용.

### Claude's Discretion (planner/researcher 재량)
- `limit_up_*` 테이블 정확한 스키마·컬럼·PK·인덱스 (per-stock 통계 1행 + 이벤트 리스트 N행 + 테마 풀링 1행 분할). RPC 함수 구조·CTE.
- 히스토그램 버킷 경계·바 색상 임계, 이벤트 리스트 더보기 페이지네이션·faded 기준일.
- 회전율 근사 처리(listing_shares 명시 vs 생략), change_rate 교차검증/폴백 사용 여부.
- 테마 카드 노출 개수·더보기, RPC vs server 라우트 세부.
- 빈 상태(상한가 이벤트 0회) 카피·레이아웃.

### Deferred Ideas (OUT OF SCOPE)
- 상한가 잠긴 시각 / 매수잔량(굳은 강도) — EOD 불가, v2 (KIS 실시간 필요).
- 시장평균 대비 / shrinkage / 베이지안 보정 — v1 미채택.
- 고가 기반 익절(과대평가) — 표시는 하되 핵심지표 아님. 정식 청산모델 v2.
- 장중 터치(고가==상한가)이나 종가 미달 이벤트 — v1 제외.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIMIT-01 | 종목 자체의 과거 마감상한가(close == 전일종가×1.30 호가단위 산출값) 이벤트의 다음날 시/고/저/종 수익률을 일봉 백테스트해 종목상세에 읽기전용 표시 — 24개월, 점상 태그, 거래대금·회전율, 히어로 익절률%(N≥3), 시초가 분포 히스토그램, 이벤트 리스트(최신순), 소속 테마별 익절 경향. 순수 KRX EOD 집계. `limit_up` 사전계산 테이블 + plpgsql RPC + 야간 1회 워커 + server 읽기 라우트 + 종목상세 섹션. | §1 호가단위 함수 + 백테스트 SQL(실측 97-98% 검증), §2 스키마 3분할, §3 RPC CTE 구조, §4 테마 풀링, §5 아키텍처 복제 포인트, Validation Architecture |
</phase_requirements>

## Summary

이 phase는 **새 capability 가 아니라 HOW 구체화**다. 진입가정(A안)·표시안(C안)·종목 자체 이력·색상은 모두 확정됐고, 아키텍처는 production 동작 중인 **Phase 11 co-movement 를 1:1 복제**한다(마이그레이션+RPC+워커+server 라우트+webapp 섹션+배포 스크립트가 모두 직접 미러할 원본으로 존재). 따라서 리서치의 핵심 가치는 CONTEXT 의 미해결 기술 과제 — 특히 **KRX 호가단위 가격 산출 규칙** — 을 실데이터로 확정하는 것이었다.

**가장 중요한 발견(실측):** 상한가 가격 = `floor(전일종가 × 1.3 / tick(target)) × tick(target)` 이며, **2023-01-25 개정 호가단위 표 단일 체제**가 24개월 전 구간(2024-06 ~ 2026-06)을 지배한다. CONTEXT 의 "단일 호가단위 체제" 가정은 **확정 옳음** — 단, 웹검색이 시사한 "2025-01-25 변경"은 본 가격대(주식 현물)에 영향 없음을 4개 분기 윈도우 실측(2024H2/2025H1/2025H2/2026)에서 **97-98% 일치**로 검증했다. `stock_daily_ohlcv.close` 는 원(won) 정수로 저장(`5020, 10300, 30450` 형태)되어 `close == 상한가가격(정수)` **정확 비교가 성립**한다. 비매칭 ~2-3%는 (a) change_rate>31 신규상장/유무상증자(상한가 아님), (b) cr=29.x 의 "한 틱 미달"(실제로 상한가 종가에 도달 못 한 날) 로, **둘 다 마감상한가가 아니므로 올바르게 배제**된다.

**Primary recommendation:** Phase 11 의 4개 파일(comovement_tables.sql / co-movement-sync 워커 / comovement.ts 라우트 / stock-comovement-section.tsx)을 원본으로 복제하되, RPC 내부 CTE 는 동조 계산이 아니라 **호가단위 CASE 함수 + LAG(전일종가) → 상한가가격 → close 매칭 → LEAD(다음날 OHLC) → 수익률** 백테스트로 교체한다. 호가단위는 §1 의 검증된 plpgsql 표현식을 그대로 사용한다.

## Standard Stack

이 phase 는 신규 외부 라이브러리 도입이 **없다**. 전부 기존 스택 재사용(CLAUDE.md Recommended Stack 준수).

### Core (전부 기존, 신규 설치 0)
| 기술 | 버전 | 용도 | 근거 |
|------|------|------|------|
| PostgreSQL (Supabase) | managed | `limit_up_*` 사전계산 테이블 + `rebuild_limit_up()` plpgsql RPC | [VERIFIED: 동작 중인 comovement_tables.sql 패턴] — 1.4M행 24m 윈도우 집계, Phase 11 이 ~2.5M행 처리해 perf 입증 |
| `@supabase/supabase-js` | 2.x | 워커 RPC 호출 + server 읽기 | [VERIFIED: workers/co-movement-sync, server/routes/comovement.ts] |
| Express | 5.x | server 읽기 라우트 (`/api/stocks/:code/limit-up`) | [VERIFIED: stocks.ts 중첩 라우터] |
| Next.js 15 / React 19 | — | webapp 섹션 컴포넌트 | [VERIFIED: stock-comovement-section.tsx] |
| pino | — | 워커 구조적 로깅 | [VERIFIED: co-movement-sync/logger] |
| vitest | — | 워커/server 단위 테스트 | [VERIFIED: workers/co-movement-sync/vitest.config.ts, server/vitest.config.ts] |
| Cloud Run Job + Scheduler | — | 야간 1회 워커 트리거 | [VERIFIED: deploy-comovement-sync.sh] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| plpgsql RPC 내부 집계 | TS 워커가 OHLCV 끌어와 계산 | RPC 가 정답 — Phase 11 선례, 1.4M행을 네트워크로 끌면 느리고 db-max-rows 페이지네이션 지옥. RPC 는 in-DB 단일 패스 |
| 새 워커 | master-sync 확장 | **D-19 가 새 워커로 잠금** — master-sync 는 KRX 마스터 인제스트라 결합도/스케줄 성격 상이 |

**Installation:** 없음. `pnpm install` 만으로 신규 워커 워크스페이스가 lockfile 에 잡힘(Phase 11 동형).

## Architecture Patterns

### 복제 원본 → 신규 산출물 매핑 (1:1, canonical_refs 실측 확인 완료)

| Phase 11 원본 (읽고 복제) | Phase 12 신규 | 변경점 |
|---------------------------|---------------|--------|
| `supabase/migrations/20260611120000_comovement_tables.sql` | `supabase/migrations/{ts}_limit_up_tables.sql` | 2테이블→3테이블, RPC 본문을 호가단위 백테스트로 교체. RLS/REVOKE/GRANT/부분인덱스 패턴 유지 |
| `workers/co-movement-sync/` (src/index.ts, config.ts, rebuild.ts, services/supabase.ts, logger.ts, Dockerfile, package.json, vitest.config.ts) | `workers/limit-up-sync/` | RPC 이름 `rebuild_comovement`→`rebuild_limit_up`. 그 외 거의 무변경(thin 워커) |
| `server/src/routes/comovement.ts` + `schemas/comovement.ts` + `mappers/comovement.ts` | `server/src/routes/limitUp.ts` + 스키마 + 매퍼 | 객체 `{...}` 반환 계약 유지. 단, **시세 조인 불필요**(이력 통계는 정적 — co-movement 의 stock_quotes 실시간 조인 제거) |
| `server/src/routes/stocks.ts` (27행 `stocksRouter.use("/:code/co-movement", ...)`) | 동일 파일에 `stocksRouter.use("/:code/limit-up", limitUpRouter)` 추가 | **`/:code` 핸들러보다 먼저 등록**(shadowing 회피) |
| `packages/shared/src/comovement.ts` + index.ts re-export | `packages/shared/src/limitUp.ts` + index.ts | 응답 타입 계약. **index.ts re-export 는 확장자 없이**(Turbopack lesson) |
| `webapp/src/components/stock/stock-comovement-section.tsx` + `lib/comovement-api.ts` | `stock-limit-up-section.tsx` + `lib/limit-up-api.ts` | 동조 후보 행 → 히어로+히스토그램+이벤트리스트+테마카드(C안 목업) |
| `webapp/src/components/stock/stock-detail-client.tsx` (145행) | 동일 파일 | `<StockComovementSection>` 인근에 `<StockLimitUpSection stockCode=... />` 추가 |
| `scripts/deploy-comovement-sync.sh` + `setup-comovement-sync-iam.sh` + `smoke-comovement-sync.sh` | `deploy-limit-up-sync.sh` + setup + smoke | SA `gh-radar-limit-up-sync-sa`, Job `gh-radar-limit-up-sync`, Scheduler nightly. supabase-service-role secret 1개만(외부 API 키 0) |

### Pattern 1: plpgsql RPC 내부 호가단위 함수 (CASE 구간)
**What:** 상한가 가격 = `floor(prev_close × 1.3 / tick) × tick`, tick 은 **target 가격(prev_close×1.3)** 기준 구간.
**When:** RPC 의 모든 CTE 에서 이벤트 판별 시.
**검증된 plpgsql 표현식 (실측 97-98% 일치):**
```sql
-- Source: 실측 derivation (probe_tick3.cjs, 4-window 검증). 2023-01-25 개정 호가단위 표.
-- 인라인 CASE 로 RPC CTE 안에서 직접 사용 (별도 함수 분리도 가능 — 가독성 선택).
-- target := prev_close * 1.3 의 가격대로 tick 결정 → floor.
--   tick: <2,000:1  <5,000:5  <20,000:10  <50,000:50  <200,000:100  <500,000:500  >=500,000:1,000
CASE
  WHEN tgt < 2000   THEN floor(tgt / 1)    * 1
  WHEN tgt < 5000   THEN floor(tgt / 5)    * 5
  WHEN tgt < 20000  THEN floor(tgt / 10)   * 10
  WHEN tgt < 50000  THEN floor(tgt / 50)   * 50
  WHEN tgt < 200000 THEN floor(tgt / 100)  * 100
  WHEN tgt < 500000 THEN floor(tgt / 500)  * 500
  ELSE                   floor(tgt / 1000) * 1000
END
-- 여기서 tgt = LAG(close) OVER (PARTITION BY code ORDER BY date) * 1.3
```
**가독성 권장:** 위 CASE 를 `IMMUTABLE` 헬퍼 함수 `limit_up_price(prev_close numeric) RETURNS numeric` 로 추출하면 RPC 본문이 깔끔하고 단위 테스트(아래 Validation)가 가능하다. 단, **함수도 SECURITY DEFINER 가 아니라 일반 함수**로(읽기 전용 산술이라 권한 불필요). REVOKE 는 rebuild RPC 에만.

### Pattern 2: 백테스트 CTE 구조 (per-stock 이벤트)
**What:** LAG(전일종가) → 상한가가격 → `close == 상한가가격` 필터 → LEAD(다음날 OHLC) → 수익률.
**Example:**
```sql
-- Source: 실측 검증 (probe_events.cjs — 000390 4회, 000440 4회/점상1 등 정확 재현)
WITH ordered AS (
  SELECT o.code, o.date, o.open, o.high, o.low, o.close, o.volume, o.trade_amount, o.change_rate,
         LAG(o.close)  OVER (PARTITION BY o.code ORDER BY o.date) AS prev_close,
         LEAD(o.open)  OVER (PARTITION BY o.code ORDER BY o.date) AS next_open,
         LEAD(o.high)  OVER (PARTITION BY o.code ORDER BY o.date) AS next_high,
         LEAD(o.low)   OVER (PARTITION BY o.code ORDER BY o.date) AS next_low,
         LEAD(o.close) OVER (PARTITION BY o.code ORDER BY o.date) AS next_close
  FROM stock_daily_ohlcv o
  WHERE o.date >= v_since
),
events AS (
  SELECT *,
    limit_up_price(prev_close) AS lu_price
  FROM ordered
  WHERE prev_close IS NOT NULL
    AND change_rate <= 31           -- 신규상장(±300%)·유무상증자 아티팩트 배제 (실측: cr>31 가 비매칭의 핵심)
    AND close = limit_up_price(prev_close)   -- 마감상한가 (정수 정확 비교 — close 는 원 정수)
)
-- 점상: open=high=low=close=lu_price. next_open 등으로 4종 수익률.
SELECT code, date,
  (open = high AND high = low AND low = close) AS is_jeomsang,
  (next_open  - close) / close * 100 AS next_open_ret,   -- D-05 핵심지표
  (next_high  - close) / close * 100 AS next_high_ret,
  (next_low   - close) / close * 100 AS next_low_ret,
  (next_close - close) / close * 100 AS next_close_ret,
  trade_amount,                                          -- D-07 직접
  volume                                                 -- 회전율 분자
FROM events
WHERE next_open IS NOT NULL;   -- 다음날 거래 있는 이벤트만 (가장 최근 이벤트는 다음날 미존재 → 제외)
```
**주의 (Pitfall):** `next_open IS NULL` (= 이벤트 다음날이 아직 없는 가장 최근 상한가)은 수익률 계산 불가 → 통계에서 제외하되 "이벤트 발생, 결과 대기중" 으로 표시할지는 빈 상태 정책(Claude 재량). 단순화는 제외.

### Pattern 3: 회전율 (listing_shares 근사)
**실측:** active 종목 4,025 중 **listing_shares NULL = 1,251 (31%)**. 분모 NULL 처리 필수.
```sql
CASE WHEN s.listing_shares IS NULL OR s.listing_shares = 0 THEN NULL
     ELSE e.volume::numeric / s.listing_shares END AS turnover
```
webapp 은 NULL → "—" 표시 (D-07 ⚠ 근사 경고를 면책 또는 컬럼 헤더 툴팁으로). 회전율은 현재 listing_shares 라 과거 이벤트일엔 증자/감자 시 오차 — **표기로 처리**(생략 아님, 목업 legend 명시).

### Anti-Patterns to Avoid
- **비율 임계로 이벤트 판별:** `change_rate >= 29.9` 같은 임계는 D-01 위반 + 호가단위 미달 날(cr=29.x 한 틱 미달)을 오검출. **반드시 가격 매칭** `close = limit_up_price(prev_close)`.
- **달력 +1 로 다음날 계산:** 휴장일 깨짐. **LEAD() OVER (ORDER BY date)** 사용 (Phase 11 `trading_next` 선례).
- **co-movement 의 stock_quotes 실시간 조인 복제:** 이력 통계는 정적. 시세 조인은 불필요한 복잡도 — 제거.
- **ROUND 사용:** 실측상 floor 가 94.6% vs round 50.5%. **floor(절사)** 가 정답.
- **신규 토큰/하드코딩 색:** globals.css oklch 토큰만 (D-13). chart-colors.ts 변환 불필요(차트 아님).

## Don't Hand-Roll

| 문제 | 직접 만들지 말 것 | 대신 사용 | 이유 |
|------|------------------|----------|------|
| 사전계산 테이블+RPC+RLS+REVOKE 보일러플레이트 | 처음부터 작성 | `comovement_tables.sql` 복제 | REVOKE 3줄/RLS TO anon,authenticated 둘 다/SECURITY DEFINER search_path 함정이 이미 해결됨 |
| thin 워커 스캐폴드(Dockerfile 2-stage, config, logger redact) | 새로 작성 | `co-movement-sync/` 복제 | pnpm deploy isolated node_modules, vitest passWithNoTests, CLI 진입점 가드 모두 검증됨 |
| Cloud Run Job + Scheduler + IAM | 새 스크립트 | `deploy/setup/smoke-comovement-sync.sh` 복제 | OAuth invoker(OIDC 금지), 리소스 단위 바인딩, secret accessor 패턴 |
| `.in()` 대량조회 안전성 | 직접 페이지네이션 | `server/lib/quoteJoin.ts` (ROW_PAGE, fetchChunked) | 414 URL + db-max-rows 1000 절단 둘 다 해결 (lessons) — **단, 이력 통계는 행 수가 작아 대부분 불필요** |
| 응답 계약 타입 | 임의 shape | `packages/shared` 공유 타입 | 배열↔객체 드리프트 prod 유출 방지(lessons) |

**Key insight:** 이 phase 에서 **새로 작성하는 코드는 RPC 본문(백테스트 SQL)과 webapp 표시 컴포넌트(C안 목업) 둘뿐**이다. 나머지는 전부 검증된 복제. 복제를 변형하려는 충동(예: 시세 조인 추가, MODE 분기)을 억제할 것.

## Runtime State Inventory

> rename/refactor/migration 아님(신규 기능). 단, 신규 인프라 리소스가 OS/서비스 레벨에 등록되므로 점검.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 신규 `limit_up_*` 사전계산 테이블 (Supabase). 기존 데이터 변경 0 — `stock_daily_ohlcv`/`theme_stocks`/`stocks` 는 read-only source. | 신규 마이그레이션 `supabase db push` [BLOCKING] |
| Live service config | 신규 Cloud Run Job `gh-radar-limit-up-sync` + Scheduler `gh-radar-limit-up-sync-nightly` (GCP, git 미반영 — 배포 스크립트로 생성). | deploy 스크립트 실행 (사용자 승인 후 오케스트레이터) |
| OS-registered state | 없음 — Windows Task Scheduler/launchd/pm2 미사용. Cloud Scheduler cron 만(위 항목). | 없음 |
| Secrets/env vars | 신규 SA `gh-radar-limit-up-sync-sa` 에 기존 `gh-radar-supabase-service-role` accessor 바인딩. **신규 secret 0** (외부 API 키 불요 — 자체 DB 집계). | setup-iam 스크립트 |
| Build artifacts | 신규 워커 워크스페이스 `workers/limit-up-sync/` → `pnpm-lock.yaml` 갱신 + Docker 이미지 `co-... → limit-up-sync:{sha}` Artifact Registry push. | `pnpm install` + deploy |

**OS-registered state 카테고리: None — verified by** CLAUDE.md/STATE 전수에서 본 프로젝트는 GCP Cloud Run/Scheduler 만 사용(로컬 OS 스케줄러 0).

## Common Pitfalls

### Pitfall 1: 호가단위 표를 prev_close 기준으로 적용
**무엇이 잘못되나:** tick 을 `prev_close` 가격대로 고르면 경계 근처에서 틀림. 예 prev_close=386,000(>200k bucket=500) 인데 target=501,800 은 ≥500k bucket(=1,000).
**근원:** 상한가 가격은 **target(prev_close×1.3) 가격대**의 호가단위로 호가 정리된다.
**회피:** §1 CASE 의 `tgt` = `prev_close*1.3` 를 기준으로 구간 판정 (실측 000670 386000→501000 매칭 확인).
**경보:** 50만원/20만원/5만원 경계를 막 넘는 고가주에서 1틱 오차 발생 시 이 버그.

### Pitfall 2: change_rate 미상한 → 신규상장/증자 오검출
**무엇이 잘못되나:** cr=300(신규상장 첫날 ±300%), cr=97/165(유무상증자 기준가 조정) 행이 `close=limit_up_price` 와 우연히 안 맞아도, 일부는 LAG 기반 base 가 splits 로 깨져 거짓 이벤트 생성.
**근원:** `stock_daily_ohlcv` 는 raw close(수정주가 아님, D-04). 액면분할/증자 시 LAG(close) 가 비연속.
**회피:** `change_rate <= 31` 게이트 (Phase 11 도 `change_rate <= 31` 사용). 실측상 cr>31 이 비매칭의 주요인.
**경보:** 어떤 종목의 이벤트 N 이 비현실적으로 크거나, 다음날 수익률이 ±100% 면 splits 오염 의심.

### Pitfall 3: numeric 비교 부동소수 함정 (실측상 안전하나 명시)
**무엇이 잘못되나:** `close = prev_close * 1.3` 직접 비교는 1.3 부동소수로 깨질 수 있음.
**근원:** floating point.
**회피:** `limit_up_price()` 가 `floor(...) * tick` 로 **정수(원) 반환**, `close` 도 정수 저장(실측: 5020,10300,30450). numeric=numeric 정수 비교는 정확. `floor` 는 numeric 에서 정확 동작. **`::numeric` 유지, float8 캐스팅 금지.**
**경보:** 매칭률이 갑자기 떨어지면 어딘가 float8 캐스팅 유입.

### Pitfall 4: 가장 최근 상한가의 다음날 부재
**무엇이 잘못되나:** 가장 최근 이벤트는 LEAD(next_open) IS NULL → 수익률 NULL → 평균/카운트 오염.
**회피:** `WHERE next_open IS NOT NULL` 로 통계 제외. 히어로 카운트 분모도 "결과 확정된 이벤트"만.

### Pitfall 5: server 라우트 등록 순서 (shadowing)
**무엇이 잘못되나:** `stocksRouter.use("/:code/limit-up", ...)` 를 `stocksRouter.get("/:code", ...)` **뒤**에 등록하면 `:code` 가 흡수.
**회피:** comovement(27행)·news·discussions 처럼 **`/:code` 핸들러 앞에** 등록.

### Pitfall 6: 새 라우트 배포 누락 (lessons 직격)
**무엇이 잘못되나:** webapp/worker 만 배포하고 server 재배포 누락 → prod `/api/stocks/:code/limit-up` 404.
**회피:** deploy plan 에 **server 재배포 + prod curl 검증** 명시 (Phase 10 lesson). `scripts/deploy-server.sh`.

### Pitfall 7: RLS TO anon 만 / REVOKE 누락
**무엇이 잘못되나:** 공개 read 를 `TO anon` 만 쓰면 로그인(authenticated) 사용자 default-deny 빈 응답. RPC REVOKE 누락 시 플랫폼 auto-grant 가 anon 실행 허용.
**회피:** read RLS = `TO anon, authenticated` 둘 다. RPC = `REVOKE FROM PUBLIC` + `REVOKE FROM anon, authenticated` + `GRANT service_role` 3줄 (feedback_supabase_rpc_revoke / feedback_supabase_rls_authenticated).
**참고:** `stock_daily_ohlcv` 자체 RLS 는 현재 `TO anon` 만(DI-03 미해결) — 단, 본 phase 는 워커가 service_role 로 읽으므로 무관. 신규 `limit_up_*` 테이블은 webapp/server 가 읽으니 반드시 둘 다.

## Code Examples

### RPC 골격 (3테이블 TRUNCATE+INSERT, comovement 톤)
```sql
-- Source: comovement_tables.sql rebuild_comovement() 구조 미러
CREATE OR REPLACE FUNCTION public.rebuild_limit_up(p_lookback_months int DEFAULT 24)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_since date := (current_date - (p_lookback_months || ' months')::interval)::date;
  v_event_rows int; v_stat_rows int; v_theme_rows int;
BEGIN
  -- 1) events 재계산 (Pattern 2 CTE) → limit_up_events TRUNCATE+INSERT
  -- 2) per-stock 통계 집계 (events GROUP BY code, N>=1 적재; N>=3 게이팅은 읽기/표시 시) → limit_up_stock_stats
  -- 3) 테마 풀링 (§4) → limit_up_theme_stats
  RETURN jsonb_build_object('lookback_since', v_since,
    'event_rows', v_event_rows, 'stock_stat_rows', v_stat_rows,
    'theme_stat_rows', v_theme_rows, 'rebuilt_at', now());
END; $$;
REVOKE EXECUTE ON FUNCTION public.rebuild_limit_up(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rebuild_limit_up(int) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.rebuild_limit_up(int) TO service_role;
```

### 워커 rebuild (1줄 RPC, co-movement-sync 미러)
```ts
// Source: workers/co-movement-sync/src/rebuild.ts (RPC 이름만 교체)
const { data, error } = await supabase.rpc("rebuild_limit_up", { p_lookback_months: lookbackMonths });
if (error) throw new Error(`rebuild_limit_up failed: ${error.message}`);
```

### server 읽기 라우트 (객체 반환, 시세 조인 제거)
```ts
// Source: comovement.ts 구조 — 단, stock_quotes 실시간 조인 불필요(정적 이력)
// GET /api/stocks/:code/limit-up → { hero, histogram, events, themes } 객체
// 1. limit_up_stock_stats WHERE stock_code=code (1행, 히어로)
// 2. limit_up_events WHERE code=code ORDER BY date DESC (이벤트 리스트 — 행 수 작아 단순 select)
// 3. limit_up_theme_stats — 앵커의 active 시스템 테마 join, N desc
// res.json({ ... } satisfies LimitUpResponse)  // 배열 아님
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| KRX 호가단위 7-tier(KOSPI 10만~50만 500원, KOSDAQ 100원 분리) | 10-tier 세분화 통합표(2천/2만/20만 추가 경계, 시장 통합) | 2023-01-25 | **본 phase tick 함수의 기준** — §1 표가 현행 |
| (웹검색 시사) "2025-01-25 호가단위 변경" | **본 주식 현물 가격대엔 무영향** | 2025-01-25(추정, 파생/특정구간) | 실측 4-window 97-98% 일치로 24m 단일체제 확정 — 무시 가능 |

**Deprecated/outdated:**
- pre-2023 KOSPI/KOSDAQ 분리 호가표: 24m 윈도우(2024-06~)에 미포함 → 단일 표로 충분(D-04 확정).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "2025-01-25 호가단위 변경"은 본 주식 현물 가격대에 영향 없음 | State of the Art | 낮음 — 4개 윈도우 실측 97-98% 일치가 강한 반증. 비매칭 ~2-3%는 cr>31/한틱미달로 전수 설명됨. 만약 특정 가격구간만 변경됐다면 그 구간 이벤트만 1틱 오차 → 빈도 극소 |
| A2 | 히스토그램 5버킷 경계는 목업(−10/−5/0/+5/+10) 그대로 | (Claude 재량, D-11) | 없음 — D-11 이 Claude 재량으로 위임. 표시 미세조정뿐 |
| A3 | server 읽기 라우트는 stock_quotes 실시간 조인 불필요(정적 이력) | Architecture Pattern | 낮음 — 이력 통계는 사전계산 정적값. 실시간 시세가 필요한 컬럼 없음(D-05~D-07 전부 이벤트일 기준) |

**Note:** 핵심 기술 과제(호가단위·이벤트 판별·수익률·회전율 커버리지)는 전부 `[VERIFIED: 실측]` — assumed 아님. 위 3건은 영향 낮은 잔여 항목.

## Open Questions

1. **listing_shares NULL 31% 의 회전율 UX**
   - 알려진 것: active 4,025 중 1,251 NULL (실측). 회전율 = volume/listing_shares.
   - 불명확: NULL 종목의 이벤트 행에서 회전율 컬럼 표기 방식(— vs 숨김).
   - 권장: NULL → "—" + 컬럼 헤더에 "회전율(현재 상장주식수 기준 근사)" 툴팁. D-07 ⚠ 를 면책 한 줄로.

2. **테마 풀링 N 의 정의 — 이벤트 수 vs 멤버 종목 수**
   - 알려진 것: D-17 "표본수 N(테마 풀 누적 상한가 이벤트 수)". 즉 멤버 종목들의 마감상한가 이벤트 **총합**.
   - 불명확: 한 종목이 여러 번 상한가면 각각 카운트(이벤트 단위) 확정 — D-17 문구가 "이벤트 수"라 이벤트 단위. 멤버 종목 수 아님.
   - 권장: 테마별 = 멤버들의 (다음날 결과 확정) 마감상한가 이벤트 풀 → 시초가 익절(next_open>0) 비율 = 익절률, N = 이벤트 풀 크기.

3. **이벤트 0회 빈 상태**
   - 권장: co-movement 의 "데이터 부족" 박스 패턴 미러. 카피 "아직 마감상한가 이력이 없습니다" (D-14 면책 톤). 대형주(005930 등)는 정상적으로 0회(실측) → 빈 상태가 흔함.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase Postgres | RPC + 테이블 | ✓ | managed | — |
| `stock_daily_ohlcv` 데이터 | 백테스트 source | ✓ | 1,399,663행(24m), 2020~ | — |
| `theme_stocks` active | 테마 풀링 | ✓ | 7,567 active 링크 / 336 시스템 테마 | — |
| `stocks.listing_shares` | 회전율 분모 | ✓ (부분) | 31% NULL | NULL → "—" 표기 |
| GCP Cloud Run/Scheduler | 워커 배포 | ✓ | (Phase 11 동형 운영중) | — |
| `gh-radar-supabase-service-role` secret | 워커 RPC | ✓ | 기존 재사용 | — |
| read-only probe(`workers/master-sync/.env`) | 본 리서치 실측 | ✓ | 사용함 | — |

**Missing dependencies with no fallback:** 없음.
**Missing dependencies with fallback:** `listing_shares` 31% NULL — 회전율 "—" 폴백(Open Q 1).

## Validation Architecture

> nyquist_validation = true (config.json) → 본 섹션 포함.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (워커 + server) |
| Config file | `workers/limit-up-sync/vitest.config.ts` (복제), `server/vitest.config.ts` (기존) |
| Quick run command | `pnpm -F @gh-radar/limit-up-sync test` / `pnpm -F @gh-radar/server test` |
| Full suite command | `pnpm -r test` |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| LIMIT-01 | `limit_up_price(prev_close)` 호가단위 산출 정확 (구간 경계 포함) | unit (순수함수) | plpgsql 함수면 **SQL fixture 테스트** or **TS 동형 함수 단위테스트** | ❌ Wave 0 |
| LIMIT-01 | 점상 판별 (o=h=l=c) | unit | 위 함수 테스트에 포함 | ❌ Wave 0 |
| LIMIT-01 | 워커 RPC 1줄 호출 + jsonb 결과 로깅 | unit | `pnpm -F @gh-radar/limit-up-sync test` (rebuild.test.ts 복제) | ❌ Wave 0 (복제) |
| LIMIT-01 | server 라우트 객체 `{...}` 반환 계약 + :code 검증 | unit (supertest/mock) | `pnpm -F @gh-radar/server test` | ❌ Wave 0 |
| LIMIT-01 | N≥3 게이팅 (미만 카운트만) | unit (webapp 또는 server 매퍼) | webapp 컴포넌트 테스트 or server 매퍼 | ❌ Wave 0 |
| LIMIT-01 | RPC 실 데이터 정확성 (이벤트 N, 수익률) | integration (수동/스모크) | `smoke-limit-up-sync.sh` 후 prod curl + 알려진 종목 대조 | ❌ Wave 0 |

**핵심 권장 — 호가단위 함수 검증 가능하게 분리:** `limit_up_price` 를 plpgsql `IMMUTABLE` 함수로 추출하면 SQL 단위 검증(`SELECT limit_up_price(386000) = 501000` 등 실측 케이스 표)이 가능. 추가로 **동일 로직의 TS 미러를 packages/shared 에 두고 vitest 로 경계 케이스(2000/5000/20000/50000/200000/500000 직하/직상) 테스트** 하면 회귀 방지 + RPC 와 대조. 실측 황금 케이스(아래)를 fixture 로:
- `95500 → 124100`, `297000 → 386000`, `386000 → 501000`(500k 경계), `876000 → 1138000`, `60000 → 78000`, `9040 → 11750`(미달 케이스는 close≠lu 로 비이벤트).

### Sampling Rate
- **Per task commit:** `pnpm -F @gh-radar/<pkg> test` (변경 워크스페이스)
- **Per wave merge:** `pnpm -r test && pnpm -r typecheck`
- **Phase gate:** 전 suite green + `smoke-limit-up-sync.sh`(event_rows>0) + prod curl `/api/stocks/{알려진 상한가 종목}/limit-up` 200 + 응답 형태(객체+필수 필드) 확인 후 `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `packages/shared/src/limitUp.ts` — 응답 타입 + (권장) `limitUpPrice()` TS 미러 함수
- [ ] `packages/shared/src/limitUp.test.ts` — 호가단위 경계 + 실측 황금 케이스
- [ ] `workers/limit-up-sync/vitest.config.ts` + `tests/rebuild.test.ts` + `tests/config.test.ts` — co-movement-sync 복제
- [ ] `server/src/routes/__tests__/limitUp.test.ts` (or 동형) — 객체 계약 + :code regex
- [ ] (선택) SQL fixture 테스트 — `limit_up_price()` plpgsql 함수 직접 검증
- [ ] `smoke-limit-up-sync.sh` — RPC 실행 후 event_rows/stock_stat_rows > 0 게이트

## Security Domain

> `security_enforcement` 키 부재(= enabled). 단, 본 phase 는 **read-only KRX EOD 집계, 인증/PII/외부입력 없음** → 표면 최소.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | 인증 불요(공개 read 통계) |
| V3 Session Management | no | 세션 없음 |
| V4 Access Control | yes(최소) | RLS 공개 read `TO anon, authenticated`; RPC REVOKE PUBLIC/anon/authenticated + GRANT service_role |
| V5 Input Validation | yes | `:code` zod regex `/^[A-Za-z0-9]{1,10}$/` (CoMovementParams 미러) — PostgREST 바인딩 전 차단 |
| V6 Cryptography | no | 암호화 대상 없음(공개 시장 데이터) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| RPC 권한 상승(anon 실행) | Elevation | REVOKE 3줄 (T-11-01 미러) |
| SECURITY DEFINER search_path 하이재킹 | Elevation | `SET search_path = public, pg_temp` |
| default-deny 빈 응답(authenticated) | DoS(self) | read RLS `TO anon, authenticated` 둘 다 |
| `:code` injection/오류입력 | Tampering | zod regex 형식 검증 |
| error.message 내부정보(PostgREST/RLS) 노출 | Information Disclosure | webapp quiet fallback(섹션 숨김) + console only (stock-comovement-section 선례) |

## Sources

### Primary (HIGH confidence)
- **실측 derivation** (`workers/master-sync/.env` read-only probe, 2026-06-27): tick-size 4-window 97-98% 일치, per-stock 이벤트/수익률 재현, listing_shares 커버리지, 24m 행수 — 본 리서치의 핵심 근거.
- `supabase/migrations/20260611120000_comovement_tables.sql` — RPC/RLS/REVOKE/부분인덱스 패턴 원본.
- `supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql` — 백테스트 source 스키마(close numeric(20,2), 실측상 원 정수 저장).
- `supabase/migrations/20260609120000_theme_tables.sql` — theme_stocks active 멤버(effective_to IS NULL) source.
- `workers/co-movement-sync/{index,config,rebuild}.ts` + `Dockerfile` — thin 워커 복제 원본.
- `server/src/routes/{comovement,stocks}.ts` + `schemas/comovement.ts` + `mappers/comovement.ts` — 라우트/계약 미러.
- `webapp/src/components/stock/{stock-comovement-section,stock-detail-client}.tsx` + `lib/comovement-api.ts` — 섹션 미러 + 마운트.
- `scripts/{deploy,setup,smoke}-comovement-sync.sh` — 배포 패턴.
- `tasks/lessons.md` — 새 라우트 server 재배포 + prod curl, `.in()` 청크/페이지네이션, 응답 계약 드리프트, 정량 주장 실측.

### Secondary (MEDIUM confidence)
- [삼성증권 호가가격단위 변경 안내](https://samsungpop.com/ux/kor/customer/notice/notice/noticeViewContent.do?MenuSeqNo=19236) — 2023-01-25 개정 10-tier 표(실측으로 교차검증됨).

### Tertiary (LOW confidence)
- WebSearch "2025-01-25 호가단위 변경" 언급 — **실측으로 본 가격대 무영향 확인**, 무시 가능(A1).

## Metadata

**Confidence breakdown:**
- 호가단위/이벤트 판별/수익률: **HIGH** — 4-window 실측 97-98%, 황금 케이스 다수 확인.
- 아키텍처(복제): **HIGH** — production 동작 중인 Phase 11 코드 직접 미러.
- 스키마 3분할: **MEDIUM-HIGH** — comovement 패턴 + D-08~D-17 표시 요구에서 도출(정확 컬럼은 Claude 재량 — planner 확정).
- 회전율 근사: **HIGH** — listing_shares NULL 31% 실측.

**Research date:** 2026-06-27
**Valid until:** 2026-07-27 (호가단위 규정/아키텍처 안정. 단 KRX 가 호가단위 재개정 시 §1 갱신 필요 — 실측 재검증 권장)
