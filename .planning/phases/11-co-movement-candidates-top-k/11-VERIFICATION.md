---
phase: 11-co-movement-candidates-top-k
verified: 2026-06-11T09:50:00Z
status: passed
score: 5/5 must-haves verified
human_verification_result: passed — 사용자 승인 2026-06-24 (GAP-1 동반율 표기·GAP-2 점수 v2·GAP-3 등락률 정렬 반영 후). 상세 11-HUMAN-UAT.md
overrides_applied: 0
human_verification:
  - test: "종목상세 페이지 동조 후보 섹션 시각 확인"
    expected: |
      https://gh-radar-webapp.vercel.app/stocks/004090 (로그인 후):
      1. "이 종목의 테마" 칩 다음에 "동조 후보" 섹션(Waypoints 아이콘 + 캡션) 렌더
      2. 흥구석유(024060) 최상위 노출, 동반율 영역 "—" (co-surge 전용, "0%" 아님)
      3. 후보 >3 → "동조 후보 N개 더 보기" 버튼 → 클릭 → 전체 펼침 → "접기"
      4. 동반율 = 중립색(검정/흰색), 실시간 등락률 = 방향색(상승 빨강/하락 파랑)
      5. 강도바 하단 빨강 라인 존재
      6. 다크/라이트 토글 시 색 자동 전환
      7. 무테마 종목(005935 삼성전자우) → "동조 데이터 부족" 빈 상태 박스(CircleOff)
    why_human: "종목상세 HTML이 middleware 로그인 게이트(307 → /login) 뒤에 있어 curl 직접 마커 확인 불가. 배포 활성은 Vercel CLI readyState READY + alias resolve + HTTP 307(게이트 정상)로 입증됨 — 시각 렌더는 로그인 후 수동 확인 필요."
---

# Phase 11: Co-movement Candidates — 검증 리포트

**Phase 목표:** 종목 X가 급등/상한가일 때, 과거 일봉(stock_daily_ohlcv)의 통계적 동조를 기반으로 "X를 따라 오를 후보 종목 Y들"을 점수화해 종목 상세 페이지에 TOP-K로 표시한다.
**검증 일시:** 2026-06-11T09:50:00Z
**상태:** human_needed (자동화 검증 5/5 통과, 시각 검증 사용자 수동 대기)
**재검증 여부:** 아니오 — 최초 검증

---

## 목표 달성 여부

### 관찰 가능한 Truth

| # | Truth | 상태 | 근거 |
|---|-------|------|------|
| 1 | `theme_comovement` + `stock_daily_ohlcv` 부분인덱스 + `cosurge_edges`가 production에 존재한다 | ✓ VERIFIED | 서비스 REST GET 200: theme_comovement 5537행, cosurge_edges 9704행. `idx_ohlcv_surge_bar` migration 적용 확인 |
| 2 | SQL 함수가 발화일·동반율·후행율을 계산해 theme_comovement에 적재한다 (발화일 ≥5, LOO R4) | ✓ VERIFIED | CALIBRATION.md: rebuild 실행 theme_comovement_rows=5537 > 0, conf_d0 ∈ [0,1], fixture 3쌍 co_count 정확(흥구석유 9, 광전자 9(R2 정상), 휴림 7). change_rate 15~31 이벤트 범위 + 광역일 제외(R2) SQL 확인 |
| 3 | co-movement-sync 워커 + Cloud Run Job + Scheduler가 EOD 이후 야간 1회 실행된다 | ✓ VERIFIED | Job `gh-radar-comovement-sync` 존재(512Mi), Scheduler `gh-radar-comovement-sync-nightly` ENABLED cron `0 2 * * 2-6` KST. smoke INV-1~5 6/6 PASS (로그 행수>0, 테이블 행수>0) |
| 4 | `GET /api/stocks/:code/co-movement?k=K`가 TOP-K 후보를 strength desc + 전 필드 포함해 객체로 반환한다 | ✓ VERIFIED | prod curl 004090 → 200, 객체 {candidates:[]}, 흥구석유 candidates[0], strength desc=true, 전 필드(confD0/strength/isTrailing/sharedThemes/coSurgeCount/sampleConfidence/liveChangeRate). 빈 상태 005935 → {candidates:[]}, k=999 → 41 (≤50) |
| 5 | 종목상세(/stocks/[code]) ThemeChips 다음에 동조 후보 섹션이 렌더된다 (빈 상태 포함) | ? HUMAN NEEDED | stock-detail-client.tsx에 StockThemeChips → StockComovementSection 순서 코드 확인됨. Vercel READY(12eggp2fu). 미들웨어 로그인 게이트(307)로 시각 확인 불가 |

**점수:** 5/5 truths verified (Truth 5는 자동화 코드 검증 통과, 시각 확인 대기)

---

## 필수 아티팩트 검증

| 아티팩트 | 내용 | 상태 | 상세 |
|---------|------|------|------|
| `supabase/migrations/20260611120000_comovement_tables.sql` | 2 테이블 + 부분인덱스 + rebuild_comovement() RPC + REVOKE/RLS | ✓ VERIFIED | REVOKE 2회(PUBLIC + anon,authenticated), RLS TO anon,authenticated 2회, SET search_path 확인, CHECK(code_a < code_b), idx_ohlcv_surge_bar 존재. production 적재 확인 |
| `packages/shared/src/comovement.ts` | CoMovementCandidate / CoMovementResponse 공유 타입 | ✓ VERIFIED | 38줄, 두 interface export. index.ts에서 `from "./comovement"` re-export(확장자 없음 — Turbopack lesson) |
| `server/src/lib/computeComovement.ts` | 두 경로 병합·결합점수·타이트니스·dedup·후행 순수함수 | ✓ VERIFIED | 239줄. LIFT_CAP=10, CO_SURGE_CAP=15, ANCHOR_REL_FLOOR=0.2, 1/Math.sqrt(타이트니스), 0.5+0.2+0.2+0.1 가중치, conf_d1>=0.3 후행 판정. 테스트 9/9 GREEN |
| `server/src/routes/comovement.ts` | GET /:code/co-movement 라우트 | ✓ VERIFIED | comovementRouter export, mergeParams:true, CoMovementParams zod, .range() 페이지네이션, fetchQuotesChunked, {candidates} 객체 반환. cosurge 양방향 2쿼리(OR 미사용) |
| `server/src/routes/stocks.ts` | comovementRouter 등록 | ✓ VERIFIED | line 27: `stocksRouter.use("/:code/co-movement", comovementRouter)` — line 93 `stocksRouter.get("/:code"` 보다 먼저 등록 |
| `workers/co-movement-sync/src/rebuild.ts` | rebuild_comovement RPC 호출 + 결과 로깅 | ✓ VERIFIED | `supabase.rpc("rebuild_comovement", {p_lookback_months})`, error throw, 결과 로깅. 테스트 3/3 GREEN |
| `workers/co-movement-sync/src/index.ts` | dispatch + CLI 가드 | ✓ VERIFIED | dispatch + runRebuild + process.argv[1].endsWith("index.js") CLI 가드. MODE 없음 |
| `scripts/deploy-comovement-sync.sh` | Job 1개 + Scheduler 1개 OAuth | ✓ VERIFIED | KRX 0건, deploy_job 1회 호출, task-timeout=180s, LOOKBACK_MONTHS=24, oauth-service-account-email, cron 0 2 * * 2-6 |
| `webapp/src/lib/comovement-api.ts` | fetchStockComovement (apiFetch<CoMovementResponse>) | ✓ VERIFIED | apiFetch<CoMovementResponse>, /api/stocks/${code}/co-movement |
| `webapp/src/components/stock/stock-comovement-section.tsx` | 동조 후보 섹션 UI-SPEC 구현 | ✓ VERIFIED | 219줄, 'use client', aria-label="동조 후보", CircleOff, "동조 데이터 부족", Math.max(4,Math.min(100,)), sharedThemes.length===0 동반율"—" 처리, "더 보기"/"접기", "직접동반", "후행형". hex 하드코딩 0 |
| `webapp/src/components/stock/stock-detail-client.tsx` | StockComovementSection 마운트 | ✓ VERIFIED | line 144: StockThemeChips → line 145: StockComovementSection → line 146: space-y-6 (정확한 순서) |

---

## Key Link 검증

| From | To | Via | 상태 | 상세 |
|------|----|-----|------|------|
| `packages/shared/src/index.ts` | `packages/shared/src/comovement` | `from "./comovement"` re-export | ✓ WIRED | 확장자 없이 — Turbopack lesson 준수 |
| `server/src/routes/stocks.ts` | `comovementRouter` | `stocksRouter.use("/:code/co-movement")` | ✓ WIRED | /:code 핸들러(93줄) 이전 27줄에 등록 |
| `server/src/routes/comovement.ts` | `computeComovement` | 결합점수·dedup·랭킹 함수 호출 | ✓ WIRED | import 후 실제 호출로 candidates 생성 |
| `webapp/src/components/stock/stock-comovement-section.tsx` | `/api/stocks/:code/co-movement` | `apiFetch<CoMovementResponse>` | ✓ WIRED | comovement-api.ts를 통한 실제 fetch |
| `webapp/src/components/stock/stock-detail-client.tsx` | `StockComovementSection` | StockThemeChips 다음 마운트 | ✓ WIRED | line 145에 마운트, ThemeChips 바로 다음 |
| `supabase migration` | `rebuild_comovement() RPC` | REVOKE EXECUTE 3줄 | ✓ WIRED | service_role only 접근 (T-11-01 mitigate) |
| `workers/co-movement-sync/src/index.ts` | `rebuild.ts` | dispatch → runRebuild | ✓ WIRED | 단일 cycle, MODE 없음 |

---

## Data-Flow Trace (Level 4)

| 아티팩트 | 데이터 변수 | 소스 | 실데이터 생성 | 상태 |
|---------|------------|------|--------------|------|
| `stock-comovement-section.tsx` | `candidates: CoMovementCandidate[]` | fetchStockComovement → `/api/stocks/:code/co-movement` → computeComovement | production prod curl로 흥구석유 candidates[0] 확인, liveChangeRate 실시간값(2.27) 조인 | ✓ FLOWING |
| `server/src/routes/comovement.ts` | theme_comovement + cosurge_edges rows | Supabase REST (service_role) | 5537/9704 행 production 적재, rebuild_comovement 실측 완료 | ✓ FLOWING |
| `workers/co-movement-sync/src/rebuild.ts` | rebuild 결과 jsonb | supabase.rpc("rebuild_comovement") | smoke INV-4: theme_comovement/cosurge_edges 행수 > 0 Cloud Logging 확인 | ✓ FLOWING |

---

## 행동 스팟 체크

| 행동 | 명령 | 결과 | 상태 |
|------|------|------|------|
| prod API가 객체 반환 | `curl .../api/stocks/004090/co-movement?k=8` | HTTP 200, has("candidates")=true, type="object" | ✓ PASS |
| 흥구석유 최상위 + strength desc | jq candidates[0].code + sort 비교 | code="024060", [.candidates[].strength] == (sort|reverse) = true | ✓ PASS |
| 빈 상태 (삼성전자우) | `curl .../api/stocks/005935/co-movement` | `{"candidates":[]}` | ✓ PASS |
| k 클램프 (k=999) | `curl .../api/stocks/004090/co-movement?k=999` | candidates.length=41 ≤ 50 | ✓ PASS |
| DB 테이블 존재 | service_role REST GET | theme_comovement 200, cosurge_edges 200 | ✓ PASS |
| Cloud Run Job + Scheduler | gcloud describe | Job 존재(512Mi), Scheduler ENABLED cron 0 2 * * 2-6 | ✓ PASS |
| 전체 서버 테스트 | `pnpm -F @gh-radar/server test` | 21 Test Files, 161 Tests passed | ✓ PASS |
| webapp 컴포넌트 테스트 | `pnpm -F @gh-radar/webapp test stock-comovement` | 7/7 Tests passed | ✓ PASS |
| webapp 빌드 | `pnpm -F @gh-radar/webapp build` | Build 성공 | ✓ PASS |

---

## 요구사항 커버리지

| 요구사항 | 계획 | 설명 | 상태 | 근거 |
|---------|------|------|------|------|
| COMV-01 | 11-01~05 | 테마-풀링 + co-surge 동조 사전계산, TOP-K 표시 | ✓ SATISFIED | 5개 성공기준 자동화 검증 통과, Vercel 배포 READY(시각 확인 대기) |

---

## 안티패턴 검사

| 파일 | 라인 | 패턴 | 심각도 | 영향 |
|------|------|------|--------|------|
| (없음) | — | — | — | — |

핵심 파일 (`computeComovement.ts`, `comovement.ts`(routes), `stock-comovement-section.tsx`, `rebuild.ts`) 전부 TODO/FIXME/placeholder 0건. hex 하드코딩 0건. `return null` 패턴은 에러 quiet fallback 의도된 동작으로 stub 아님.

---

## 사용자 수동 검증 필요 항목

### 1. 종목상세 페이지 동조 후보 섹션 시각 확인

**테스트:** https://gh-radar-webapp.vercel.app/stocks/004090 에 로그인 후 방문

**기대 결과:**
1. "이 종목의 테마" 칩 **다음**에 "동조 후보" 섹션 렌더 (Waypoints 아이콘 + "동조 후보" 캡션)
2. 흥구석유(024060) 최상위 노출. co-surge 전용 후보의 동반율 영역 **"—"** ("0%" 아님)
3. 후보 >3 → "동조 후보 N개 더 보기" 버튼 → 클릭 → 전체 펼침 → "접기"
4. 동반율 = 중립색 (검정/흰색, 빨강/파랑 아님). 실시간 등락률만 방향색
5. 강도바 하단 빨강 라인
6. 다크/라이트 토글 시 색 자동 전환 (oklch 토큰)
7. 무테마 종목(예: 005935 삼성전자우) → "동조 데이터 부족" 빈 상태 박스 (CircleOff 아이콘)

**자동화 불가 이유:** 종목상세 HTML이 Next.js middleware 로그인 게이트(307 → /login) 뒤에 있어 curl로 직접 JSX 마커 확인 불가. 배포 활성은 Vercel CLI readyState `READY` + alias resolve + HTTP 307로 입증됨.

---

## 갭 요약

자동화 검증 가능한 모든 항목이 통과되었습니다.

**통과 항목 (5/5 Truth):**
- SC-1: 사전계산 테이블(5537/9704행) + 부분인덱스 production 존재 확인
- SC-2: rebuild_comovement SQL 함수 fixture 3쌍 정확도 확인 (흥구석유 9, 광전자 9/R2정상, 휴림 7)
- SC-3: Cloud Run Job + Scheduler ENABLED(cron `0 2 * * 2-6`) + smoke 6/6 PASS
- SC-4: prod curl 200 + 객체 반환 + 흥구석유 최상위 + strength desc + 전 필드 + 빈 상태 + k클램프
- SC-5: 코드상 ThemeChips 다음 마운트 확인. Vercel 배포 READY(readyState). 시각 확인 대기.

**사용자 수동 검증 필요:**
- 로그인 후 종목상세 페이지(/stocks/004090)에서 동조 후보 섹션 시각 렌더 확인

---

_검증 일시: 2026-06-11T09:50:00Z_
_검증자: Claude (gsd-verifier)_
