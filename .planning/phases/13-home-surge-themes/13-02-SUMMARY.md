---
phase: 13-home-surge-themes
plan: 02
subsystem: home-surge-themes
tags: [worker, tdd, ai-clustering, hash-skip, anti-hallucination]
requires:
  - home_theme_snapshots (13-01 테이블)
  - "@gh-radar/shared Home* 타입 계약 (13-01)"
  - workers/home-sync 스캐폴드 (config/logger/supabase/anthropic/parseJson, 13-01)
provides:
  - "loadSurges (top_movers⋈stock_quotes>=20 + 종목별 top-K 뉴스 청크 로드)"
  - "computeContentHash (급등코드+뉴스id 결정적 SHA256, title-insensitive)"
  - "clusterSurges + resolveNewsRefs + sortThemes + demoteInvalidThemes (Claude 1x + D-04/05/06)"
  - "CLUSTER_SYSTEM_PROMPT + formatClusterMessage (번호 매긴 뉴스, newsRefs 인덱스)"
  - "upsertSnapshot (home_theme_snapshots append, PK ignoreDuplicates)"
  - "runHomeSyncCycle (hash-skip clone-append 분기, deps 주입)"
affects:
  - 13-03 (server /api/home) — home_theme_snapshots row 를 읽어 HomeSnapshotResponse 로 변환
  - 13-04/05/06 (webapp) — payload(themes/singles) 표시
  - 배포 plan — runHomeSyncCycle 을 Cloud Run Job + Scheduler(:30 slot)로 실행
tech-stack:
  added: []
  patterns:
    - "bottom-up AI 클러스터링 (기존 큐레이션 테마 미참조, 급등 집합만으로 순수 발견)"
    - "anti-hallucination 인덱스 해석 (Claude 는 newsRefs 인덱스만, 워커가 verbatim 해석)"
    - "hash-skip clone-append (직전 payload 복제 + is_carried, Claude 호출 skip)"
    - "종목별 top-K 뉴스 청크 로드 (단일 .in() 1000-row truncation 회피, Pitfall 1)"
    - "worker-side sort/classify (D-05 breadth / D-06 <2 강등, LLM 아닌 결정적 코드)"
key-files:
  created:
    - workers/home-sync/src/pipeline/loadSurges.ts
    - workers/home-sync/src/pipeline/loadSurges.test.ts
    - workers/home-sync/src/pipeline/contentHash.ts
    - workers/home-sync/src/pipeline/contentHash.test.ts
    - workers/home-sync/src/ai/prompt.ts
    - workers/home-sync/src/ai/clusterSurges.ts
    - workers/home-sync/src/ai/clusterSurges.test.ts
    - workers/home-sync/src/pipeline/upsertSnapshot.ts
    - workers/home-sync/src/index.ts
    - workers/home-sync/src/index.test.ts
    - workers/home-sync/tests/helpers/supabase-mock.ts
  modified:
    - workers/home-sync/tsconfig.json
decisions:
  - "clusterSurges 반환 = ClusterResult(themes/singles 만); threshold/marketStatus 는 index.ts 가 슬롯 컨텍스트로 확정 — RESEARCH §Pattern 3 caller 책임 분리"
  - "content_hash 는 뉴스 id 집합 기반(제목 전체 아님) — title-insensitive, 과민 반응 회피(Open Q3)"
  - "prev-lookup 은 .limit(1) 종결 + data[0] (mock chain 은 .limit/.maybeSingle 둘 다 terminal 이라 체이닝 불가) — theme-sync 종결 메소드 선례"
  - "tsconfig exclude src/**/*.test.ts — 코로케이트 테스트가 tests/helpers(vitest import)를 build 로 끌어와 dist 에 CommonJS require(vitest) 를 유발하는 문제 차단 (Rule 3)"
metrics:
  duration: ~9min
  tasks: 3
  files: 12
  completed: 2026-07-01
---

# Phase 13 Plan 02: home-sync 파이프라인 (loadSurges + clusterSurges + hash-skip cycle) Summary

HOME-01 의 분석 코어를 TDD 로 구축: 오늘 +20% 급등 종목과 종목별 top-K 뉴스를 truncation 없이 로드하고, Claude Haiku 1회 호출로 bottom-up 클러스터링한 뒤, 뉴스 인덱스를 verbatim 기사로 해석(anti-hallucination)하고 breadth 정렬/sub-2 강등(D-05/06)을 worker-side 결정적 코드로 수행하며, 급등집합+뉴스 해시가 직전 스냅샷과 같으면 Claude 호출을 건너뛰고 직전 payload 를 복제 append(is_carried=true)하는 시점별 스냅샷 사이클. 전체 20/20 유닛 테스트 green + build exit 0.

## What Was Built

### Task 1 — loadSurges + contentHash (commit `fc343c8`)
- **loadSurges.ts**: `stock_quotes.change_rate >= surgeThreshold` → change_rate desc → `surgeMax` cap. stocks 마스터 청크 IN(QUOTE_CHUNK=200)으로 종목명 해석. **종목별 top-K 뉴스**: news_articles 를 code 청크로 `.in("stock_code").order("published_at" desc)` fetch 후 앱 측에서 종목당 `newsPerStock` 만 유지 → 단일 `.in()` PostgREST 1000-row truncation 회피(D-07 / Pitfall 1). `Surge[] { code, name, changeRate, news }` 반환.
- **contentHash.ts**: `computeContentHash(surges)` = `SHA256(JSON.stringify({ codes: [...].sort(), news: [...id].sort() }))`. 순서 무관 + **title-insensitive**(뉴스 id 집합 기반, 제목 변화 무시 — Open Q3 과민 반응 회피).
- **테스트(RED→GREEN)**: Pitfall-1(3종목×500뉴스 → 마지막 종목 5건 유지), 해시 order-independence + title-insensitivity + 집합 변경 감지.

### Task 2 — clusterSurges (commit `091e951`)
- **prompt.ts**: `CLUSTER_SYSTEM_PROMPT`(bottom-up: 2+ 종목 같은 이유=themes, 홀로=singles; 테마명 2~10자 한글; reason 입력 뉴스 근거만; **newsRefs 는 입력 뉴스 인덱스만**, URL/제목 생성 금지; stockCodes 는 입력 code 만; JSON only) + `buildClusterFewShot`(정상 클러스터 + 빈 `{"themes":[],"singles":[]}` 2건) + `formatClusterMessage`(급등 헤더 `- CODE NAME (+X.X%)` + 전역 인덱스 `[N] CODE 제목` 뉴스 라인 + `indexedNews` 반환).
- **clusterSurges.ts**: `getAnthropicClient().messages.create`(model=classifyModel, max_tokens=2048, temp=0, fence guard `extractJsonObject`) → parse. `resolveNewsRefs`(인덱스→verbatim, 범위 밖 drop, **D-04**), `demoteInvalidThemes`(급등 집합 밖 code drop, <2 valid → single 강등, **D-06**), `sortThemes`(stockCodes.length desc → tie 시 member avg changeRate desc, **D-05**). 빈 surges → **short-circuit(Claude 호출 0)**. try/catch → 예외 시 빈 payload(**T-13-08 accept fail-safe**).
- **테스트(RED→GREEN)**: 펜스 파싱, newsRef out-of-range drop, unknown-code drop, <2 강등, D-05 정렬, empty short-circuit, Claude 예외 fail-safe.

### Task 3 — upsertSnapshot + runHomeSyncCycle (commit `6ab4053`)
- **upsertSnapshot.ts**: `home_theme_snapshots.upsert(row, { onConflict: "trade_date,captured_at", ignoreDuplicates: true })` — slot 재실행 idempotent(첫 스냅샷 보존).
- **index.ts `runHomeSyncCycle(deps)`**: KST :30 slot(tradeDate/capturedAt/marketStatus, 15시+ → closed) 계산 → loadSurges → computeContentHash → 오늘 최신 스냅샷(`.eq(trade_date).order(captured_at desc).limit(1)`) → **분기(Pattern 4)**: `prev.content_hash === hash` 면 직전 payload 복제 append(is_carried=true, Claude 호출 skip), 아니면 clusterSurges(Claude 1x) → payload(threshold/marketStatus 확정) append(is_carried=false). `HomeSyncSummary { tradeDate, capturedAt, themeCount, stockCount, claudeCalled, isCarried }`. CLI `main()` guard(index.js 진입만).
- **테스트(RED→GREEN)**: hash-miss(cluster 1회, is_carried=false, payload 저장) / hash-match(cluster NOT called, 직전 payload 복제, is_carried=true).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 코로케이트 테스트가 build 에 vitest 를 끌어와 dist CommonJS require 오류**
- **Found during:** Task 3 (첫 build)
- **Issue:** 플랜은 테스트를 `src/` 에 코로케이트(files_modified 명세)하고 vitest config 는 `src/**/*.test.ts` 를 include. tsconfig `include:["src"]` 가 이 `.test.ts` 를 build 대상으로 잡아, 테스트가 import 하는 `tests/helpers/supabase-mock.ts`(vitest import)까지 컴파일 → `dist`(및 in-place)에 CommonJS `require("vitest")` 산출물이 생겨 vitest 가 "Vitest cannot be imported in a CommonJS module using require()" 로 2 test file suite fail.
- **Fix:** tsconfig 에 `"exclude": ["src/**/*.test.ts"]` 추가 → build 가 테스트/헬퍼를 traverse 안 함. 잔존 stray 컴파일 산출물(`tests/helpers/supabase-mock.{js,d.ts,map}`) 제거. clean rebuild 후 dist 에 test 파일 0, stray 0 확인.
- **Files modified:** workers/home-sync/tsconfig.json
- **Commit:** `6ab4053`

**2. [Rule 1 - Bug] prev-lookup 종결 메소드 체이닝 (`.limit(1).maybeSingle()`)**
- **Found during:** Task 3 (index 테스트)
- **Issue:** 초안이 `.order().limit(1).maybeSingle()` 로 종결했으나, Supabase mock(theme-sync 선례)은 `.limit` 과 `.maybeSingle` 을 **둘 다 terminal(mockResolvedValue)** 로 둔다 — `.limit()` 이 Promise 를 반환해 `.maybeSingle()` 체이닝이 `undefined` 접근으로 throw. 실 PostgREST 에서도 `.limit(1)` + `data[0]` 이면 충분(maybeSingle 중복).
- **Fix:** `.limit(1)` 종결 + `data[0]` 추출로 변경. 테스트 주입도 `.limit.mockResolvedValue({data:[...]})` 로 통일.
- **Files modified:** workers/home-sync/src/index.ts, workers/home-sync/src/index.test.ts
- **Commit:** `6ab4053`

## Verification

- `pnpm --filter @gh-radar/home-sync test` → **20/20 green** (parseJson 2 + contentHash 5 + loadSurges 3 + clusterSurges 8 + index 2).
- `pnpm --filter @gh-radar/home-sync build` → **exit 0** (clean dist, test 파일/stray 산출물 0).
- D-04(범위 밖 newsRef drop) / D-05(breadth 정렬) / D-06(<2 강등 + unknown drop) 모두 명시 assertion 커버.
- acceptance grep 전부 통과: `gte("change_rate")`, `createHash("sha256")`, `extractJsonObject`, `newsRefs`, `ignoreDuplicates`, `is_carried`, `runHomeSyncCycle`.

## Threat Model Coverage

- **T-13-01 (hallucinated news URL) — mitigate**: `resolveNewsRefs` 가 Claude 인덱스를 verbatim `indexedNews` 로 해석, 범위 밖 인덱스 drop. Claude 는 URL/제목을 생성하지 않음.
- **T-13-06 (injected stock code) — mitigate**: `demoteInvalidThemes` 가 payload stockCode 를 급등 집합으로 필터, unknown drop.
- **T-13-07 (1000-row truncation) — mitigate**: `loadSurges` 종목별 top-K 청크 fetch(단일 .in() 아님).
- **T-13-08 (Claude 실패 cycle 중단) — accept**: clusterSurges try/catch → 빈 payload, cycle 은 계속 append.

## Known Stubs

None — loadSurges/clusterSurges/runHomeSyncCycle 모두 실제 로직으로 구현. payload 를 홈에 표시하는 server 라우트(13-03)와 webapp(13-04~06), 배포(runHomeSyncCycle 을 Cloud Run Job + Scheduler 로 실행)는 후속 plan 범위(스텁 아님).

## Threat Flags

None — 신규 네트워크 엔드포인트/인증 경로/파일 접근/스키마 변경 없음. home-sync 는 Supabase(읽기 top_movers/stock_quotes/news_articles, 쓰기 home_theme_snapshots) + Anthropic 만 호출(§Pattern 5, 외부 크롤링 0 — 한국 크롤링 5원칙 무관).

## Self-Check: PASSED

- FOUND: workers/home-sync/src/pipeline/loadSurges.ts
- FOUND: workers/home-sync/src/pipeline/contentHash.ts
- FOUND: workers/home-sync/src/ai/prompt.ts
- FOUND: workers/home-sync/src/ai/clusterSurges.ts
- FOUND: workers/home-sync/src/pipeline/upsertSnapshot.ts
- FOUND: workers/home-sync/src/index.ts
- FOUND: commit fc343c8
- FOUND: commit 091e951
- FOUND: commit 6ab4053
