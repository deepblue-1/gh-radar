# Phase 11 동조 후보 — 캘리브레이션 (Plan 02 실측)

> production `ivdbzxgaapbmrxreyuht` (gh-radar Supabase) 에 마이그레이션 push + `rebuild_comovement(24)` REST RPC 실행 후 실측. 측정일 2026-06-11.

## 1. rebuild_comovement(24) 반환 (REST RPC, Plan 04 워커 production 경로 동일)

| 필드 | 값 |
|------|-----|
| lookback_since | 2024-06-11 (24개월) |
| theme_comovement_rows | **5538** |
| cosurge_edge_rows | **9704** |
| HTTP | 200 (timeout 없음) |

3회 연속 실행 모두 동일 행수(5538 / 9704) — full-rebuild TRUNCATE+INSERT 멱등 확인.

## 2. 실행시간 → task-timeout 확정 (RESEARCH §Open Q 1)

| 실행 | wall-clock (REST time_total) |
|------|------------------------------|
| 1회 | 24.65s |
| 2회 | 20.76s |
| 3회 | 24.25s |

**대표값 ≈ 25s** (최대치 기준).

**task-timeout 산정 규칙** (Plan 02: Execution Time ×4 + 마진):
- 25s × 4 = 100s → 마진 포함 **120s** 가 산식값.
- 데이터 증가(daily_bars 누적) + cold DB 여유 + co-surge self-join 의 데이터 의존 변동성 고려 → **task-timeout = 180s 권고** (≈7× 측정치, 보수적 상한).
- DB role 측 `service_role.statement_timeout = 600s` 는 하드 천장(아래 §5). 180s Cloud Run Job task-timeout < 600s DB 천장 → DB 가 먼저 죽지 않고 Job 레벨에서 안전하게 제어됨.

> **Plan 04 deploy 스크립트는 task-timeout = 180s 사용.** 초기 권고 600s 보다 훨씬 낮아 비용/응답성 유리. 향후 daily_bars 가 2배 이상 누적되면 재측정 후 상향.

## 3. fixture co_count 대조 (SQL 정확성 1차 게이트 — RESEARCH §검증 fixture)

| 페어 | code | ground truth | 실측 co_count | lift | avg_pair_ret | 판정 |
|------|------|--------------|---------------|------|--------------|------|
| 한국석유↔흥구석유 | 004090↔024060 | 9 | **9** | 31.91 | 23.38 | ✅ 정확 일치 |
| 광전자↔이노인스트루먼트 | 017900↔215790 | 12 (±2 → [10,14]) | **9** | 19.15 | 27.56 | ⚠ 범위 밖 — 단 R2(광역일 제외)로 완전 설명 (아래) |
| 휴림에이텍↔휴림로봇 | 078590↔090710 | 9 (±2 → [7,11]) | **7** | 9.00 | 23.25 | ✅ 하한 통과 |

### 광전자 페어 9 vs 12 — SQL 버그 아님, R2(광역일 제외) 정상 동작

ground truth probe(RESEARCH)는 **광역일 제외 없이** 측정한 raw 동반일 수. 본 rebuild 는 D-13/R2 에 따라 시장 광역일(>100 종목 ≥10%)을 제외한다.

검증 (raw 동반일 12일을 일자별로 광역일 카운트):

| 공통 급등일 | 그날 ≥10% 종목 수 | 광역일? |
|------------|------------------|---------|
| 2026-03-24 | 66 | |
| **2026-03-25** | **118** | **제외** |
| **2026-04-01** | **189** | **제외** |
| 2026-04-06 | 33 | |
| 2026-04-07 | 28 | |
| 2026-04-09 | 41 | |
| 2026-04-13 | 82 | |
| 2026-04-15 | 98 | |
| 2026-04-27 | 83 | |
| 2026-05-11 | 73 | |
| 2026-05-20 | 33 | |
| **2026-06-09** | **239** | **제외** |

raw 12일 중 정확히 **3일이 광역일**(118/189/239 종목) → 12 − 3 = **9**. rebuild 출력과 정확히 일치.

→ self-join·적격성 JOIN·광역일 제외 로직 **모두 정확**. 이 페어는 우연히 광역일 3회 동반이라 ground truth(광역일 미제외) 대비 -3. R2 가 의도대로 시장 베타 아티팩트를 제거한 것 — **SQL 정확성 문제가 아니라 정상 동작**. 두 종목 모두 일반 주권(적격성 필터 무영향)으로 확인.

acceptance 의 [10,14] 는 "광역일 ±1~2" 가정이었으나 이 페어는 실제 광역일 동반 3회 → 가정보다 큰 하향. 동반율 의미는 보존(광역일 제외가 오히려 더 신뢰성 높은 동조 신호). **fixture 정확성 검증 통과로 판정.**

## 4. theme_comovement sanity (D-12 conf_d0)

| 검사 | 결과 |
|------|------|
| `conf_d0 > 1` 행 | **없음** (빈 배열) — 식 정확 + numeric(5,4) 제약 충족 |
| conf_d0 범위 | min 0.0000 / max 1.0000 — [0,1] 정상 |
| 흥구석유(024060) theme_comovement | **0행** (정상 — 석유화학 발화일 < 적재컷 5 + R4 LOO 분모 감소. 흥구석유 노출은 co-surge 경로 co_count 9 담당) |
| 상위 멤버 행 | 존재 (예: 340440 conf_d0=1.0 ignite_days=5 member_count=8 lift=37.3; 084670 conf_d0=0.857 ignite_days=7 등) — 정상 분포 |

## 5. lift 식 sanity (RESEARCH §Open Q 2)

- fixture 페어 lift: 흥구석유 31.91 / 광전자 19.15 / 휴림 9.00 — **전부 1보다 훨씬 큼** (독립 가정 대비 초과 동반).
- cosurge_edges lift 분포: min 1.18 / max 156.0 — 전부 양수, NaN/음수/null **없음** (`lift<0 OR lift IS NULL` 조회 빈 배열).
- 약한 엣지(co_count 3)는 lift ~1.2 부근, 강한 동조는 100+ — 식 `co_count / (sa.n·sb.n/total_days)` 정상.

## 6. statement_timeout 해법 (T-11-07 DoS measure)

REST RPC 경로가 service_role 기본 ~8s 에서 57014 로 실패 → 다음으로 해결:

1. `20260611130000_service_role_statement_timeout.sql` — `ALTER ROLE service_role SET statement_timeout = '600s'` (사용자 승인 옵션 A).
2. `20260611140000_pgrst_reload_config.sql` — `NOTIFY pgrst, 'reload config'`. **ALTER ROLE 만으로는 부족**: PostgREST 가 role 별 GUC 를 캐싱하고 pre-request 로 `SET LOCAL statement_timeout=<cached>` 주입 → reload 없이는 변경 전 ~8s 캐시값 계속 사용. NOTIFY reload 후 새 요청이 600s 적용 → rebuild 완주(25s). 이 마이그레이션은 comovement 로직(rebuild_comovement 본문)을 일절 변경하지 않음 — 오직 승인된 ALTER ROLE 효과를 PostgREST 에 반영.

> Plan 04 워커는 이 REST RPC(600s 천장)를 야간 1회 호출. 사용자 트래픽 무관(service_role 백엔드 전용) → 공개 API 응답성 영향 0.

## 7. 부분인덱스 / EXPLAIN — deferred (SQL Editor 필요)

- `idx_ohlcv_surge_bar ON stock_daily_ohlcv (date, code) WHERE change_rate >= 10` 은 `20260611120000` 마이그레이션(BEGIN/COMMIT 단일 트랜잭션)으로 생성 — remote migration history 에 적용 확인(`supabase migration list`). CREATE INDEX 실패 시 전체 트랜잭션 롤백되므로 인덱스 존재 보장.
- **EXPLAIN (ANALYZE, BUFFERS) 는 임의 SQL 이라 service_role REST RPC 로 실행 불가** (PostgREST 는 함수/테이블만 노출, 임의 SQL 미허용). 인덱스 Index Scan 사용 여부·발화일 경로 plan 정밀 확인은 **Supabase SQL Editor 수동 실행 필요** — deferred.
- 실행시간 실측(25s, §2)이 task-timeout 산정의 1차 근거로 충분 — EXPLAIN 은 인덱스 최적화 정밀 튜닝용(필요 시 후속). 25s 가 600s 천장 대비 충분히 낮아 현 plan 으로 seq-scan 병목 징후 없음.

### SQL Editor 수동 실행용 EXPLAIN (deferred — 필요 시)

```sql
-- (1) 총 실행시간
EXPLAIN (ANALYZE, BUFFERS) SELECT rebuild_comovement(24);

-- (2) co-surge self-join 인덱스 사용 — daily_bars 가 idx_ohlcv_surge_bar Index Scan 인지
EXPLAIN (ANALYZE, BUFFERS)
WITH broad_days AS (
  SELECT date FROM stock_daily_ohlcv
  WHERE date >= (current_date - interval '24 months')::date AND change_rate >= 10
  GROUP BY date HAVING count(*) > 100
),
daily_bars AS (
  SELECT o.date, o.code, o.change_rate FROM stock_daily_ohlcv o
  JOIN stocks s ON s.code = o.code AND s.is_delisted = false
    AND s.security_group NOT IN ('ETF','ETN','ELW')
    AND (s.kosdaq_segment IS NULL OR s.kosdaq_segment NOT LIKE 'SPAC%')
    AND s.name NOT LIKE '%스팩%'
  WHERE o.date >= (current_date - interval '24 months')::date AND o.change_rate >= 10
    AND o.date NOT IN (SELECT date FROM broad_days)
)
SELECT a.code, b.code, count(*) FROM daily_bars a
JOIN daily_bars b ON a.date = b.date AND a.code < b.code
GROUP BY a.code, b.code HAVING count(*) >= 3;
```

---

## 확정 요약 (다운스트림 참조)

| 항목 | 값 |
|------|-----|
| **task-timeout (Plan 04 deploy)** | **180s** |
| service_role statement_timeout (DB 천장) | 600s |
| rebuild 실측 wall-clock | ~25s |
| theme_comovement 행수 | 5538 |
| cosurge_edges 행수 | 9704 |
| fixture 검증 | 흥구석유 9✅ / 광전자 9(R2 정상)✅ / 휴림 7✅ |
| conf_d0 범위 | [0, 1] ✅ |
| lift sanity | 양수, fixture >>1, NaN/null 없음 ✅ |
| 추가 인덱스 필요 여부 | 미확정 — EXPLAIN deferred(SQL Editor). 25s 실측상 현 인덱스로 병목 징후 없음 |
