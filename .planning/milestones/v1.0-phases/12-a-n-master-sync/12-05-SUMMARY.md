---
phase: 12-a-n-master-sync
plan: 05
subsystem: ui
tags: [limit-up, nextjs, react, client-component, stock-detail, oklch-tokens, vercel]

# Dependency graph
requires:
  - phase: 12-a-n-master-sync (12-01)
    provides: LimitUpResponse/Event/StockStats/ThemeStat 객체 계약 타입 (packages/shared)
  - phase: 12-a-n-master-sync (12-03)
    provides: GET /api/stocks/:code/limit-up 읽기 라우트 — { hero, events, themes } 객체 계약 (prod live)
  - phase: 12-a-n-master-sync (12-04)
    provides: limit-up-sync 워커가 채운 limit_up_* 사전계산 테이블 (prod event_rows 3459/stock 1271/theme 322)
  - phase: 11-co-movement
    provides: stock-comovement-section fetch/quiet-fallback/state-reset/em-dash/oklch 패턴 (1:1 미러 원본)
provides:
  - "종목상세(/stocks/[code]) 상한가 다음날 이력 섹션 — ②안 데이터 대시보드 (KPI 3그리드 + 전폭 분포 밴드 + OHLC 8컬럼 표 + 테마 가로 풀링 바 + 면책), prod live (vercel gh-radar-webapp-faraucl94...)"
  - "webapp/src/lib/limit-up-api.ts — fetchStockLimitUp apiFetch<LimitUpResponse> wrapper"
  - "webapp/src/lib/limit-up-format.ts — shouldShowWinRate(N≥3)/sparkBucketTone(off-by-one 가드)/fmtRet/fmtTurnover/BUCKET_LABELS 순수함수(단위 테스트 박제)"
affects: [Phase 12 완료 — LIMIT-01 end-to-end prod live]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "표시 순수함수 분리(limit-up-format.ts) + 단위 테스트 박제 — 컴포넌트 인라인 재구현 금지 단일 진리원 (게이팅·spark색·라벨)"
    - "comovement-section fetch/quiet-fallback/state-reset 1:1 미러 — mount fetch + AbortController, loaded/hasError, 종목 간 내비게이션 state 리셋, 에러 시 return null(error.message 미노출)"
    - "분포 = KPI 셀 spark → 전폭 라벨 밴드 승격 (변형 A) — 건수 + x축 라벨 + 손익/평균 푸터로 텍스트 내용 파악 가능(aria 노출)"
    - "국내 색상 oklch 토큰 직접 사용(차트 아님 → chart-colors.ts 변환 불필요, D-13) — 신규 토큰/하드코딩 0"

key-files:
  created:
    - webapp/src/lib/limit-up-api.ts
    - webapp/src/lib/limit-up-format.ts
    - webapp/src/lib/limit-up-format.test.ts
    - webapp/src/components/stock/stock-limit-up-section.tsx
  modified:
    - webapp/src/components/stock/stock-detail-client.tsx
    - .planning/phases/12-a-n-master-sync/12-limit-up-mockup.html

key-decisions:
  - "분포 표현 재디자인 (변형 A 채택, prod 시각 검증 중 사용자 이슈) — KPI ④ spark 셀(막대만, 라벨/건수 없음)이 내용 파악 불가 → KPI 4→3그리드 + 전폭 분포 밴드(건수 라벨 + 세로 막대 + x축 구간 라벨 + 손익/평균 푸터)로 승격. 디자인 LOCKED."
  - "표시 순수함수(shouldShowWinRate/sparkBucketTone/fmtRet/fmtTurnover/BUCKET_LABELS)를 limit-up-format.ts 로 분리 + 단위 테스트 — sparkBucketTone(2)='up' 박제로 BLOCKER 3 off-by-one(0~+5% 가 음수로 오분류) 회귀 차단. 컴포넌트는 인라인 재구현 금지(단일 진리원)."
  - "에러 시 섹션 quiet fallback(return null, error.message 미노출) — comovement/daily-chart 선례 미러, T-12-05-01 mitigate. !loaded → null 로 레이아웃 점프 방지."

patterns-established:
  - "webapp 표시 순수함수 = format.ts 톤(formatTradeAmount 재사용) + 신규 모듈 분리 + co-located *.test.ts 단위 박제"
  - "종목상세 신규 섹션 마운트 = co-movement 섹션 인근(stock-detail-client), 기존 ThemeChips/Comovement/news/discussion 순서 보존(D-21)"

requirements-completed: [LIMIT-01]

# Metrics
duration: ~20min (코드; checkpoint 배포 대기 + 변형 A 재디자인 라운드 제외)
completed: 2026-06-29
---

# Phase 12 Plan 05: webapp 상한가 다음날 이력 섹션 (②안 데이터 대시보드) Summary

**종목상세에 상한가 다음날 이력 섹션을 ②안 데이터 대시보드(KPI 3그리드 + 전폭 분포 밴드 + OHLC 8컬럼 표 + 테마 가로 풀링 바 + 면책)로 구현하고 Vercel production 배포·시각 검증 통과. 사전계산 { hero, events, themes } 객체를 N≥3 게이팅·국내 색상·quiet fallback 으로 표현. prod 시각 검증 중 발견된 분포 spark 가독성 이슈를 변형 A(라벨 세로 막대 밴드)로 재디자인 후 재배포(gh-radar-webapp-faraucl94...). Phase 12 LIMIT-01 end-to-end prod live.**

## Performance

- **Duration:** ~20 min (코드 작성·커밋·로컬 검증 + 변형 A 재디자인; [BLOCKING] checkpoint 배포 대기 제외)
- **Started:** 2026-06-28T12:23Z
- **Completed:** 2026-06-29 (Vercel 재배포 + 사용자 시각 검증 통과 후)
- **Tasks:** 5 (Task 5 = [BLOCKING] checkpoint, 오케스트레이터 배포 + 사용자 시각 검증)
- **Files created/modified:** 6 (생성 4 + 수정 2)

## Accomplishments
- `lib/limit-up-api.ts` — `fetchStockLimitUp(code, signal)` = `apiFetch<LimitUpResponse>("/api/stocks/:code/limit-up")` (comovement-api 복제, k 파라미터 없음 — 단일 종목 전체 이력).
- `lib/limit-up-format.ts` + `.test.ts` — 표시 순수함수 분리: `shouldShowWinRate(resolvedEvents>=3)`(D-09) / `sparkBucketTone(index>=2?'up':'down')`(BLOCKER 3 off-by-one 가드) / `fmtRet`(방향 부호 +/−, 보합 0.0%, null→em-dash) / `fmtTurnover`(null→em-dash) / `BUCKET_LABELS`(5버킷 x축 라벨). 단위 테스트가 `sparkBucketTone(2)==='up'` + N≥3 경계 + `BUCKET_LABELS[2]==='0~+5'` 박제.
- `components/stock/stock-limit-up-section.tsx` — ②안 데이터 대시보드 클라이언트 컴포넌트: 헤더 + **KPI 3그리드**(시초가 익절 N≥3 게이팅 / 평균 시초가 / 최악 저가) + **전폭 분포 밴드**(변형 A) + 최근3회 보조줄 + **OHLC 8컬럼 표**(점상/일반 태그·시고저종 방향색·거래대금억·회전율·faded·더보기) + legend + **테마 가로 풀링 바**(N desc·진행바·더보기) + 면책. comovement 미러 fetch/quiet-fallback/state-reset, 빈 상태(이벤트 0회) 카피.
- `stock-detail-client.tsx` — `<StockLimitUpSection stockCode={stock.code} />` 를 `<StockComovementSection />` 바로 다음에 마운트(D-21).
- **분포 재디자인(변형 A)** — prod 시각 검증 중 사용자 이슈(KPI ④ spark 막대만, 라벨/건수 없어 파악 불가) → KPI 4→3그리드 + 전폭 `DistributionBand`(건수 라벨 13px·세로 막대 max-w34px·x축 구간 라벨 0~+5 빨강 톤·손익/평균 푸터). 막대 톤=`sparkBucketTone`(0건 muted 우선)·라벨=`BUCKET_LABELS` 재사용(인라인 재구현 0). 텍스트 포함 → aria-hidden 제거(읽히게).
- 로컬 검증: `pnpm -F @gh-radar/webapp test` **246 passed / 1 skipped** · `typecheck` exit 0 · `build` exit 0. acceptance grep 게이트 전부 통과(fetchStockLimitUp / sparkBucketTone·shouldShowWinRate / 점상 / 색 토큰 ≥3 / 하드코딩 0 / return null / 면책 / DistributionSpark 제거 0).
- **Vercel production 재배포 + 시각 검증 (오케스트레이터 + 사용자):** repo root `vercel build --prod` + `vercel deploy --prebuilt --prod`(ignoreCommand docs-tip skip 회피) → 신규 배포 `gh-radar-webapp-faraucl94...` READY, prod alias `gh-radar-webapp.vercel.app` 갱신. 사용자 로그인 후 `/stocks/000440` 시각 확인: 변형 A 분포 밴드 정상(건수 1·1·0·0·2 + 구간 라벨 + 손익 푸터 손실2/수익2/평균+4.8%), KPI 3그리드 전환, 색상(수익 빨강/손실 파랑) 정상 → "좋음" 승인.

## Task Commits

각 Task 원자 커밋:

1. **Task 1: limit-up-api fetchStockLimitUp wrapper** — `c49c8a6` (feat)
2. **Task 2 (RED): limit-up-format 순수함수 RED 테스트** — `708cd26` (test)
3. **Task 2 (GREEN): limit-up-format 순수함수 구현** — `a9aee51` (feat)
4. **Task 3: StockLimitUpSection ②안 데이터 대시보드 컴포넌트** — `66f9c62` (feat)
5. **Task 4: 종목상세에 StockLimitUpSection 마운트** — `2b86556` (feat)
6. **재디자인: limit-up-format BUCKET_LABELS export** — `fe309c4` (feat)
7. **재디자인: 분포를 전폭 라벨 밴드로 승격(변형 A)** — `b0ab7cc` (feat)
8. **재디자인: ②안 목업 분포를 변형 A로 박제** — `64f6ae1` (docs)

**Plan metadata:** (이 SUMMARY + STATE + ROADMAP 최종 docs 커밋)

_Task 2 는 tdd 지정 — RED(모듈 미존재 import 실패) → GREEN(순수함수 구현) 분리 커밋. Task 5 = [BLOCKING] checkpoint(코드 변경 없음, 오케스트레이터 배포 + 사용자 시각 검증). 재디자인 3 커밋은 Task 5 prod 시각 검증 중 발견된 분포 가독성 이슈 대응._

## Files Created/Modified
- `webapp/src/lib/limit-up-api.ts` - fetchStockLimitUp apiFetch<LimitUpResponse> wrapper (comovement-api 복제)
- `webapp/src/lib/limit-up-format.ts` - 표시 순수함수(게이팅·spark색·포맷·버킷 라벨) 단일 진리원
- `webapp/src/lib/limit-up-format.test.ts` - sparkBucketTone(2)=up off-by-one 가드 + N≥3 경계 + BUCKET_LABELS 단위 테스트
- `webapp/src/components/stock/stock-limit-up-section.tsx` - ②안 데이터 대시보드 섹션(KPI 3그리드 + 분포 밴드 + OHLC 표 + 테마 풀링 바 + 면책)
- `webapp/src/components/stock/stock-detail-client.tsx` - StockLimitUpSection 마운트(co-movement 인근, D-21)
- `.planning/phases/12-a-n-master-sync/12-limit-up-mockup.html` - ②안 분포를 변형 A(라벨 세로 막대)로 박제

## Decisions Made
- **분포 재디자인 = 변형 A(라벨 세로 막대 밴드)**: 초기 구현은 목업 ②안 그대로 KPI ④ 셀에 compact spark(막대만). prod 시각 검증에서 라벨/건수 없어 내용 파악 불가 판명 → 분포를 KPI 셀에서 빼내 전폭 밴드로 승격(건수 + x축 구간 라벨 + 손익/평균 푸터). KPI 4→3그리드. 디자인 LOCKED(목업 박제).
- **표시 순수함수 분리 + 테스트 박제**: 게이팅(N≥3)·spark 색·포맷·버킷 라벨을 limit-up-format.ts 단일 모듈로 분리, 컴포넌트는 import 만(인라인 재구현 금지). `sparkBucketTone(2)='up'` 단위 테스트로 0~+5% 가 음수 버킷으로 오분류되는 off-by-one(BLOCKER 3) 회귀 차단.
- **quiet fallback(T-12-05-01)**: 에러 시 섹션 return null(error.message 미노출, console.error 만) — PostgREST/RLS 내부정보 노출 표면 0. comovement/daily-chart 선례 미러.
- **국내 색상 oklch 토큰 직접**: 수익=빨강 --up / 손실=파랑 --down / 보합 --flat / 점상 --up-bg. 차트 아님 → chart-colors.ts 변환 불필요(D-13). 신규 토큰/하드코딩 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] limit-up-api.ts 주석 식별자가 acceptance 리터럴 grep 게이트 위반**
- **Found during:** Task 1
- **Issue:** 라우트 계약을 설명하는 doc 주석에 `apiFetch<LimitUpResponse>` 와 `/limit-up` 리터럴을 명시했으나, plan acceptance 의 `grep -c "apiFetch<LimitUpResponse>" == 1` / `grep -c "/limit-up" == 1` 가 주석+코드 2 매치로 실패.
- **Fix:** doc 주석을 식별자 없이 의미 보존 표현("GET 상한가 이력 라우트 객체 계약 wrapper")으로 변경 — Phase 12 의 grep 앵커 표현 변경 패턴(12-03 선례) 승계. 동작 무영향(주석).
- **Files modified:** webapp/src/lib/limit-up-api.ts
- **Verification:** `grep -c "apiFetch<LimitUpResponse>" == 1`, `grep -c "/limit-up" == 1`, typecheck green
- **Committed in:** c49c8a6 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** 주석 표현만 변경, wrapper 동작·계약 무영향. Scope creep 없음. (변형 A 재디자인은 deviation 이 아니라 [BLOCKING] checkpoint 시각 검증 결과에 따른 사용자 승인 재작업.)

## Issues Encountered
- **prod 분포 spark 가독성 이슈(시각 검증)** — 초기 ②안 그대로의 KPI ④ compact spark 가 막대만 있고 라벨/건수가 없어 사용자가 분포 내용 파악 불가. 정보 담은 목업 2안 시각 검토 → 변형 A(라벨 세로 막대 밴드) 채택. KPI 4→3그리드 + 전폭 밴드(건수/x축 라벨/손익 푸터)로 승격, 막대 톤·라벨은 기존 순수함수 재사용. 재배포 후 사용자 "좋음" 승인.

## User Setup Required
None - Vercel 배포는 오케스트레이터가 사용자 인증(기존 phase) 후 production 적용 완료. 추가 외부 서비스 설정 불필요. server 라우트(12-03)·워커(12-04)·테이블(12-02)은 이미 prod live.

## Next Phase Readiness
- **Phase 12 LIMIT-01 end-to-end 완료**: 마이그레이션(12-02) → server 읽기 라우트(12-03) → 워커 배포(12-04) → webapp 표시(12-05) 전 경로 prod live. `/stocks/000440` 실데이터(분포·OHLC·테마 풀링) 표시 + N≥3 게이팅 + 빈 상태 + 국내 색상 시각 검증 통과.
- **블로커 없음**: 표시 순수함수 테스트 박제(off-by-one 가드), quiet fallback, 국내 색상 토큰만, 변형 A 분포 밴드 prod 검증 완료.

## Self-Check: PASSED

- 생성 파일 4종(limit-up-api.ts / limit-up-format.ts / limit-up-format.test.ts / stock-limit-up-section.tsx) + 수정 2종(stock-detail-client.tsx / 12-limit-up-mockup.html) 전부 존재
- 커밋 c49c8a6 / 708cd26 / a9aee51 / 66f9c62 / 2b86556 / fe309c4 / b0ab7cc / 64f6ae1 전부 git log 확인
- prod 시각 검증 통과 (오케스트레이터 재배포 gh-radar-webapp-faraucl94... + 사용자 /stocks/000440 "좋음" 승인)

---
*Phase: 12-a-n-master-sync*
*Completed: 2026-06-29*
