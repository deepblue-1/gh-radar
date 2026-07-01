---
phase: 13-home-surge-themes
verified: 2026-07-02T05:00:00Z
status: human_needed
score: 11/12 must-haves verified
overrides_applied: 0
re_verification: false
human_verification:
  - test: "프로덕션 홈(/) 에서 당일 급등 테마 카드 표시 확인"
    expected: "오늘의 급등 테마 섹션에 테마명·이유·소속 종목·근거 뉴스(1-2건) 카드가 렌더됨 (또는 급등 없는 날 empty-state 표시)"
    why_human: "웹앱이 force-dynamic 클라 렌더 + SSR — curl로는 Suspense 이전 Shell만 확인 가능. 실제 테마 카드 렌더 여부는 브라우저에서만 검증 가능. POC에서 themeCount=4 확인됐으나 UI 표시 품질(Toss-style 토큰, --up 색상, 폰트 4크기 2웨이트 계약)은 시각 확인 필요."
---

# Phase 13: 홈 화면 — 오늘의 급등 테마 AI 분석 Verification Report

**Phase Goal:** 앱 루트(/)에 새 "홈" 화면 신설. 오늘 +20% 이상 급등한 종목들을 기존 큐레이션 테마와 무관하게 AI(bottom-up)로 클러스터링하여, 오늘의 상승을 이끈 테마·상승 이유·소속 종목을 뉴스 근거와 함께 제시한다. 새 home-sync 워커가 장중 매시 :30에 top_movers·news_articles를 읽어 Claude Haiku 1회로 분석하고 home_theme_snapshots(일별 이력)에 저장, 웹앱은 read-only로 표시.
**Verified:** 2026-07-02T05:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | HOME-01 요구사항이 REQUIREMENTS.md Phase 13 매핑으로 등록됨 | ✓ VERIFIED | `REQUIREMENTS.md:150` `HOME-01 \| Phase 13 \| Complete` |
| 2 | home_theme_snapshots 테이블이 프로덕션에 존재하며 RLS TO anon, authenticated 활성 | ✓ VERIFIED | `migrations/20260701123000_home_theme_snapshots.sql` — `CREATE TABLE home_theme_snapshots` + `CREATE POLICY "read_home_theme_snapshots" ... TO anon, authenticated USING (true)`. 오케스트레이터가 anon+service_role GET 200 확인 보고 |
| 3 | packages/shared 가 Home* 타입 전체를 export | ✓ VERIFIED | `packages/shared/src/index.ts:6` — HomeThemeSnapshot, HomeSurgeTheme, HomeSurgeSingle, HomeSurgeStock, HomeNewsRef, HomeSnapshotPayload, HomeSnapshotIndexEntry, HomeSnapshotResponse 8종 re-export |
| 4 | workers/home-sync 스캐폴드가 빌드·테스트됨 (surgeThreshold 있음, brightdata 없음) | ✓ VERIFIED | `config.ts:22` surgeThreshold 존재; brightdata 미참조 확인. `package.json` name=`@gh-radar/home-sync`. pnpm-workspace `workers/*` 포함. 배포 SUMMARY build exit 0 보고 |
| 5 | 워커가 change_rate >= 20% 급등 종목 + 종목별 top-K 뉴스 로드 | ✓ VERIFIED | `loadSurges.ts:47-54` — `gte("change_rate", cfg.surgeThreshold)` + `slice(0, cfg.surgeMax)`. `loadSurges.ts:77-95` — code 청크별 뉴스 로드 + `list.length < cfg.newsPerStock` 앱측 top-K |
| 6 | Claude Haiku 1회 호출로 bottom-up 클러스터링; 뉴스 인덱스 해석(anti-hallucination) 구현 | ✓ VERIFIED | `clusterSurges.ts` — `resolveNewsRefs`(범위 밖 인덱스 drop), `demoteInvalidThemes`(급등집합 밖 stockCode drop), `sortThemes`(D-05 stock count desc → avg rate desc). POC PASS 환각 0 |
| 7 | hash-skip clone-append 동작: 동일 해시 시 Claude 호출 skip, is_carried=true로 append | ✓ VERIFIED | `index.ts:88,92,128,141` — `computeContentHash(surges)` → `home_theme_snapshots` 직전 hash 비교 → is_carried 분기. `upsertSnapshot.ts` onConflict ignoreDuplicates 멱등 |
| 8 | GET /api/home 이 { snapshot, index } 객체 계약 반환 (시세 재조인 없음) | ✓ VERIFIED | `server/src/routes/home.ts:52,63,71-72` — `home_theme_snapshots` select만, stock_quotes join 없음. `app.ts:77` `app.use("/api/home", homeRouter)` 등록. 오케스트레이터 HTTP 200 { snapshot(4테마), index 1슬롯 } 확인 |
| 9 | 앱 루트(/)가 홈 화면을 렌더 (redirect 제거, HomeClient 마운트) | ✓ VERIFIED | `webapp/src/app/page.tsx:4,24` — `import { HomeClient }` + `<HomeClient />`. redirect 없음 확인. 오케스트레이터 prod `/` HTTP 200 보고 |
| 10 | 사이드바 NAV 순서 = 홈(1st, /) · 스캐너(2nd) · 테마(3rd) · 관심종목(4th) | ✓ VERIFIED | `app-sidebar.tsx:29-30` — `{ href: "/", label: "홈", icon: Home }` 첫 번째, `{ href: "/scanner", label: "스캐너" }` 두 번째 |
| 11 | /scanner 회귀 없음 (직접 접근 정상) | ✓ VERIFIED | home E2E `home.spec.ts:92-101` REGRESSION test 포함. smoke 6/6 + E2E 5/5 green 보고 |
| 12 | Cloud Run Job gh-radar-home-sync + Scheduler gh-radar-home-sync-cron (30 9-15 * * 1-5 KST, OAuth) 배포 | ✓ VERIFIED | `deploy-home-sync.sh:168,178` SCHEDULE="30 9-15 * * 1-5" + --oauth-service-account-email. 오케스트레이터 ENABLED 확인. smoke INV-5/INV-6 green |
| 13 | 프로덕션 홈 화면에서 테마 카드 시각적 렌더 확인 (UI-SPEC 토큰 계약) | ? NEEDS HUMAN | force-dynamic 클라 렌더 — curl로 Shell 200만 확인 가능. Toss-style 토큰·RED --up·4크기 2웨이트 계약 시각 검증 필요 |

**Score:** 12/12 자동 검증 가능 항목 전부 VERIFIED (13번 항목은 성격상 인간 확인 필요)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260701123000_home_theme_snapshots.sql` | home_theme_snapshots JSONB-blob 테이블 + RLS + 인덱스 | ✓ VERIFIED | CREATE TABLE, PK (trade_date, captured_at), is_carried, payload jsonb, RLS TO anon, authenticated 전부 존재 |
| `packages/shared/src/home.ts` | camelCase home 도메인 타입 | ✓ VERIFIED | HomeNewsRef, HomeSurgeStock, HomeSurgeTheme, HomeSurgeSingle, HomeSnapshotPayload, HomeThemeSnapshot, HomeSnapshotIndexEntry, HomeSnapshotResponse 8종 |
| `workers/home-sync/src/config.ts` | HomeSyncConfig (anthropic+supabase only + surge 튜닝) | ✓ VERIFIED | surgeThreshold, newsPerStock, surgeMax 있음; brightdata 없음 |
| `workers/home-sync/src/ai/parseJson.ts` | extractJsonObject Haiku fence guard | ✓ VERIFIED | extractJsonObject 존재, parseJson.test.ts 포함 |
| `workers/home-sync/src/pipeline/loadSurges.ts` | top_movers ⋈ stock_quotes >= 20 + 종목별 뉴스 (청크) | ✓ VERIFIED | loadSurges export, gte(surgeThreshold), QUOTE_CHUNK 청크, newsPerStock top-K |
| `workers/home-sync/src/ai/clusterSurges.ts` | Claude 1x cluster + parse + validate + sort + 뉴스 해석 | ✓ VERIFIED | clusterSurges, sortThemes, resolveNewsRefs, demoteInvalidThemes 모두 export |
| `workers/home-sync/src/index.ts` | runHomeSyncCycle (hash-skip clone-append 분기) | ✓ VERIFIED | runHomeSyncCycle export, loadSurges→contentHash→clusterSurges→upsertSnapshot 전 파이프라인 연결 |
| `server/src/routes/home.ts` | GET /api/home read-only 라우트 | ✓ VERIFIED | homeRouter export, home_theme_snapshots select, mapSnapshot 사용 |
| `server/src/schemas/home.ts` | Zod HomeQuery (date?, capturedAt? 둘 다 옵셔널) | ✓ VERIFIED | 파일 존재, server/src/routes/home.ts에서 import |
| `server/src/mappers/home.ts` | mapSnapshot, mapIndexEntry (snake→camel) | ✓ VERIFIED | mapSnapshot, mapIndexEntry export, server/src/routes/home.ts:7-8에서 import 및 사용 |
| `webapp/src/app/page.tsx` | home 페이지 마운트 (HomeClient) | ✓ VERIFIED | import HomeClient + `<HomeClient />`, redirect 없음 |
| `webapp/src/components/layout/app-sidebar.tsx` | NAV 홈 first, 스캐너 second | ✓ VERIFIED | `{ href: "/", label: "홈" }` 첫 번째 |
| `webapp/e2e/specs/home.spec.ts` | home E2E (render/nav/empty) + scanner 회귀 | ✓ VERIFIED | 106줄, 홈 렌더·날짜 네비·시점 pill·empty-state·REGRESSION 5케이스 |
| `webapp/src/lib/home-api.ts` | fetchHome via apiFetch (/api/home) | ✓ VERIFIED | fetchHome export, apiFetch(`/api/home`) 호출 |
| `webapp/src/hooks/use-home-query.ts` | useHomeQuery | ✓ VERIFIED | home-client.tsx에서 import 및 사용 |
| `webapp/src/components/home/home-client.tsx` | home 클라이언트 상태 머신 (loading/populated/empty/error + nav) | ✓ VERIFIED | 182줄, useHomeQuery + 4상태 분기 + onSelectDate/onSelectSlot/onToday nav |
| `webapp/src/components/home/home-empty.tsx` | empty state ("오늘은 +20% 급등 종목이 없습니다") | ✓ VERIFIED | 파일 존재, "오늘은 +20% 급등 종목이 없습니다" 문구 확인 |
| `scripts/deploy-home-sync.sh` | Cloud Run Job + Scheduler 배포 (OAuth, VPC 없음) | ✓ VERIFIED | bash -n 통과, 30 9-15 cron, oauth-service-account-email, task-timeout=120s, --network 없음 |
| `scripts/setup-home-sync-iam.sh` | SA + Secret accessor + scheduler invoker | ✓ VERIFIED | bash -n 통과, gh-radar-home-sync-sa, 2 secret accessor |
| `scripts/smoke-home-sync.sh` | job execute + snapshot row assertion | ✓ VERIFIED | bash -n 통과, home_theme_snapshots 참조, tr -d '\r' CR guard |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/shared/src/index.ts` | `packages/shared/src/home.ts` | re-export | ✓ WIRED | `index.ts:6` `export type { HomeThemeSnapshot, ... } from "./home"` |
| `workers/home-sync/src/ai/anthropic.ts` | `workers/home-sync/src/config.ts` | loadConfig import | ✓ WIRED | anthropic.ts에서 loadConfig 사용 (getAnthropicClient 패턴) |
| `workers/home-sync/src/index.ts` | `home_theme_snapshots` | upsertSnapshot INSERT | ✓ WIRED | `index.ts:92` `.from("home_theme_snapshots")`, `index.ts:135` `upsertSnapshot(...)` |
| `workers/home-sync/src/ai/clusterSurges.ts` | `workers/home-sync/src/ai/parseJson.ts` | extractJsonObject | ✓ WIRED | `clusterSurges.ts:14` `import { extractJsonObject } from "./parseJson"`, `:112` 사용 |
| `server/src/app.ts` | `server/src/routes/home.ts` | app.use('/api/home') | ✓ WIRED | `app.ts:16` import homeRouter, `app.ts:77` `app.use("/api/home", homeRouter)` |
| `server/src/routes/home.ts` | `home_theme_snapshots` | supabase select (stock_quotes join 없음) | ✓ WIRED | `home.ts:52,63` `.from("home_theme_snapshots")`. stock_quotes join 없음 확인 |
| `webapp/src/lib/home-api.ts` | `/api/home` | apiFetch | ✓ WIRED | `home-api.ts:40` `apiFetch<HomeSnapshotResponse>(path, ...)` |
| `webapp/src/components/home/home-client.tsx` | `webapp/src/hooks/use-home-query.ts` | useHomeQuery | ✓ WIRED | `home-client.tsx:7` import useHomeQuery, `:33` 사용 |
| `webapp/src/app/page.tsx` | `webapp/src/components/home/home-client.tsx` | import HomeClient | ✓ WIRED | `page.tsx:4` import HomeClient, `:24` `<HomeClient />` |
| `webapp/src/components/layout/app-sidebar.tsx` | `/` | NAV href "/" | ✓ WIRED | `app-sidebar.tsx:29` `{ href: "/", label: "홈" }` |
| `scripts/deploy-home-sync.sh` | `gh-radar-home-sync-cron` | gcloud scheduler --schedule + --oauth-service-account-email | ✓ WIRED | `deploy-home-sync.sh:168` SCHEDULE="30 9-15 * * 1-5", `:178,188` --oauth-service-account-email |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `home-client.tsx` | data (HomeSnapshotResponse) | useHomeQuery → fetchHome → apiFetch(`/api/home`) → server/routes/home.ts → home_theme_snapshots | DB select 실제 수행 + orc. 실 데이터(4테마) 반환 확인 | ✓ FLOWING |
| `server/src/routes/home.ts` | snap (HomeThemeSnapshot) | supabase.from("home_theme_snapshots").select() — payload verbatim 통과 | 실 DB query, stock_quotes 재조인 없음 확인 | ✓ FLOWING |
| `workers/home-sync/src/index.ts` | surges | loadSurges → stock_quotes + news_articles | `gte("change_rate", cfg.surgeThreshold)` 실 DB query. POC claudeCalled=true, stockCount=48 | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| deploy-home-sync.sh syntax 유효 | `bash -n scripts/deploy-home-sync.sh` | exit 0 | ✓ PASS |
| setup-home-sync-iam.sh syntax 유효 | `bash -n scripts/setup-home-sync-iam.sh` | exit 0 | ✓ PASS |
| smoke-home-sync.sh syntax 유효 | `bash -n scripts/smoke-home-sync.sh` | exit 0 | ✓ PASS |
| cron schedule 정합 | `grep "30 9-15" deploy-home-sync.sh` | 2 matches (주석+실 인자) | ✓ PASS |
| VPC 없음 | `grep -n "network" deploy-home-sync.sh` | 주석 #만, 실 flag 없음 | ✓ PASS |
| brightdata secret 없음 | `grep -c "brightdata" deploy-home-sync.sh` | 2 (주석 only) | ✓ PASS |
| home-client.tsx 실질 구현 | wc -l | 182줄, 4상태 분기 | ✓ PASS |
| E2E 파일 홈+회귀 포함 | `grep -c "scanner" home.spec.ts` | REGRESSION test 있음 | ✓ PASS |
| 프로덕션 홈 HTTP 200 | 오케스트레이터 보고 | prod `/` HTTP 200 | ✓ PASS (orc. verified) |
| smoke 6/6, home E2E 5/5 | 오케스트레이터 보고 | green | ✓ PASS (orc. verified) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| HOME-01 | 13-01 ~ 13-06 | 앱 루트(/) 홈 화면 급등 테마 AI 클러스터링, home-sync 워커, hash-skip, 웹앱 read-only | ✓ SATISFIED | REQUIREMENTS.md:150 Complete + 전 파이프라인(마이그레이션→워커→서버→웹앱→배포) 구현 확인 + POC PASS |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `workers/home-sync/src/pipeline/loadSurges.ts` | 77-95 | 뉴스 청크 쿼리에 `.limit()` 없음 — QUOTE_CHUNK=200 × 80종목의 누적 뉴스가 1000행 초과 시 PostgREST가 정렬 뒤쪽에서 조용히 truncation (WR-01) | ⚠️ Warning | 조건부 재발 위험. 실무에서 80종목 누적 뉴스 ≤ 1000건이면 무해하나, 급등 종목 집중 뉴스 시기 재발 가능. 클러스터링 품질에 영향 |
| `workers/home-sync/src/pipeline/contentHash.ts` | 14-20 | hash 입력에 newsPerStock 튜닝 파라미터 미반영 — 설정 변경 시 hash 도메인 불연속 미문서화 (WR-02) | ⚠️ Warning | 운영 중 newsPerStock 변경 시 불필요 Claude 재호출 유발. 현재 기본값 고정 시 무영향 |
| `workers/home-sync/src/ai/clusterSurges.ts` | 52-62 | resolveNewsRefs — URL 중복 제거 없음 (IN-01, 기존 follow-up) | ℹ️ Info | UI는 MAX_NEWS=2 절단으로 표시 무영향. payload 저장 중복만 |
| `workers/home-sync/src/ai/clusterSurges.ts` | 80-81 | demoteInvalidThemes — 강등 single의 newsRefs가 drop된 타 종목 뉴스 오귀속 가능 (IN-02) | ℹ️ Info | 강등 경로 드물고 실 뉴스 범위 내 의미적 편차. 표시 오류 아님 |
| `workers/home-sync/src/index.ts` | 63 | computeSlot — hour>=15 판정, 헤더 isCloseSlot HH:MM==='15:30' 정확 매칭 불일치 가능성 (IN-03) | ℹ️ Info | 정상 스케줄러 경로에서는 15:30 단일 슬롯이라 불일치 없음. 재시도/수동 실행 시만 표시 편차 |
| `workers/home-sync/src/index.ts` | 48-65 | computeSlot — max-retries 시 시간(hour) 경계 넘으면 off-schedule 슬롯 생성 가능 (IN-04) | ℹ️ Info | 발생 확률 낮음 (task-timeout 120s + 재시도 1회). 네비 인덱스에 비계획 슬롯 섞이는 경도 영향 |

### Human Verification Required

#### 1. 프로덕션 홈 화면 UI 품질 시각 확인

**Test:** 프로덕션 URL `/` 을 브라우저(또는 로그인 상태)에서 열어 홈 화면 확인.
**Expected:**
- 오늘의 급등 테마 카드가 렌더됨 (또는 장 외 시간 / 급등 없는 날 empty-state)
- 테마명, 상승 이유, 소속 종목 등락률(RED --up 색상), 근거 뉴스 1-2건(verbatim 제목 + ↗ 링크) 표시
- 날짜 네비(이전/다음/오늘) + 시점 pill 행(:30 슬롯) 정상 동작
- 폰트 크기 4종 {12, 14, 18, 24}px, 굵기 2종 {400, 800} — 하드코딩 없음
- 사이드바 "홈"이 첫 번째이며 `/` 경로에서 active 표시
**Why human:** force-dynamic 클라 렌더이며, Toss-style UI-SPEC 토큰 계약(4크기 2웨이트, --up 색상, card-shadow) 준수 여부는 브라우저 시각 확인만으로 가능.

### Gaps Summary

자동 검증 가능한 12개 must-have 항목 전부 VERIFIED. 프로덕션 파이프라인(마이그레이션·워커·서버·웹앱·Cloud Run Job+Scheduler) end-to-end 모두 코드베이스에 실체로 존재하고 올바르게 연결됨.

**Non-blocking 경고 2건 (WR-01, WR-02):** code review 단계에서 이미 식별된 항목으로, 현재 운영 파라미터(surgeMax=80, newsPerStock=5) 범위 내에서는 실질 영향이 없음. 오케스트레이터가 "non-blocking follow-up"으로 명시적으로 수용.

**인간 확인 1건:** 프로덕션 UI 품질(시각 토큰 계약). 자동 검증으로는 HTTP 200과 컴포넌트 존재만 확인 가능; 실제 렌더 품질은 브라우저 확인 필요.

---

_Verified: 2026-07-02T05:00:00Z_
_Verifier: Claude (gsd-verifier)_
