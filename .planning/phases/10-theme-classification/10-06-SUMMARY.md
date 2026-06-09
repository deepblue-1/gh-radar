---
phase: 10-theme-classification
plan: 06
subsystem: ai
tags: [anthropic, claude-haiku-4-5, p-limit, supabase-mock, theme-sync, dedup, json-fence]

# Dependency graph
requires:
  - phase: 10-theme-classification (10-01)
    provides: theme-sync 워크스페이스 + @anthropic-ai/sdk + supabase-mock + logger anthropicApiKey redact
  - phase: 10-theme-classification (10-02)
    provides: themes/theme_stocks(source/is_system/norm_key/effective_to) + owner-only RLS
  - phase: 10-theme-classification (10-03)
    provides: runThemeSyncCycle + normalizeName 보수적 norm_key + upsertThemes
  - phase: 07.1-news-content
    provides: news_articles(title+description) — AI 발굴 입력 데이터
provides:
  - AI 테마 보강 모듈 4종 (anthropic 싱글톤 + discoverThemes 발굴 + correctMembership 교정 + persistAi 적재)
  - theme-sync cycle 의 AI 보강 단계(enrichWithAi, classifyEnabled 게이트 + try/catch isolation)
  - 펜스-tolerant JSON 추출 공유 유틸(parseJson.extractJsonObject) — Haiku ```json 펜스 대응
  - 보수적 cross-chunk near-duplicate 병합(collapseNearDuplicates, 증거 기반 ≥2 종목 OR norm_key 포함)
  - POC 실측 검증 (비용 ~$1.83/월, 정확도 GOOD, source='ai' 표시 승인)
affects: [10-07-themes-ui, 10-08-deploy-e2e, theme-sync]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Claude 응답 펜스-tolerant 파싱: 첫 '{' ~ 마지막 '}' 슬라이스 공유 유틸 (mocked 테스트가 못 잡는 라이브 버그 클래스 차단)"
    - "보수적 증거기반 dedup: 공유종목 ≥2 OR norm_key substring 포함(길이≥4 가드), edit-distance 금지 — 불확실 시 KEEP BOTH"

key-files:
  created:
    - workers/theme-sync/src/ai/anthropic.ts
    - workers/theme-sync/src/ai/prompt.ts
    - workers/theme-sync/src/ai/discoverThemes.ts
    - workers/theme-sync/src/ai/correctMembership.ts
    - workers/theme-sync/src/ai/persistAi.ts
    - workers/theme-sync/src/ai/enrich.ts
    - workers/theme-sync/src/ai/parseJson.ts
    - workers/theme-sync/tests/ai.test.ts
  modified:
    - workers/theme-sync/src/index.ts

key-decisions:
  - "펜스-tolerant JSON 추출을 parseJson.extractJsonObject 공유 유틸로 추출 — discoverThemes/correctMembership 두 파서가 동일 POC 버그(Haiku ```json 펜스 → JSON.parse throw → 빈 결과)를 공유했으므로 한 곳에서 수정"
  - "보수적 cross-chunk 병합 휴리스틱: (a)종목코드 ≥2 공유 OR (b)norm_key substring 포함(짧은쪽 길이≥4) — 둘 중 하나만 만족해도 병합, 그 외 모두 KEEP BOTH. edit-distance/유사도 금지(normalizeName 원칙 승계)"
  - "POC 실측: 5 Claude 호출 ~51k in + 1.9k out 토큰 = $0.06/run → ~$1.83/월(target < $1/일 통과). 정확도 GOOD(실제 KR 시장 테마), source='ai' 표시 승인"
  - "display 결정 = source='ai' 유지(ai_candidate 격리 불필요). 코드 변경 없음 — /api/themes(Plan 04)가 is_system=true 로 AI 테마 자동 surface 확인"
  - "배포 게이트: Plan 10-08 이 Cloud Run Job env THEME_SYNC_CLASSIFY_ENABLED=true 설정해야 production 발굴 활성(현재 default false — kill-switch)"

patterns-established:
  - "Claude JSON 응답 파싱은 항상 펜스-tolerant 추출 선행 — system prompt 의 'JSON only' 지시를 신뢰하지 않음(Haiku 실측 위반)"
  - "AI 후보 dedup 은 증거 기반(공유 엔티티/포함관계)만, 문자열 유사도 자동병합 금지 — 과병합은 read-only 시스템 레이어라 복구 불가"

requirements-completed: [THEME-04]

# Metrics
duration: ~55min (POC 게이트 + 2-executor 연속 포함)
completed: 2026-06-09
---

# Phase 10 Plan 06: AI Enrichment Summary

**Claude Haiku 4.5 가 news_articles 기반으로 신규 시스템 테마 후보를 발굴(source='ai') + 종목↔테마 오분류를 effective_to soft-제외로 교정하고, POC 실측($1.83/월·정확도 GOOD)에서 발견한 Haiku ```json 펜스 버그를 공유 유틸로 수정 + 보수적 cross-chunk dedup 강화**

## Performance

- **Duration:** 약 55분 (Task 1 TDD + Task 2 통합 + Task 3 실 Anthropic POC 게이트 + 본 continuation 의 fence-fix/dedup/회귀테스트/finalize)
- **Tasks:** 3 (Task 1 AI 모듈 / Task 2 cycle 통합 / Task 3 POC 게이트 + finalize)
- **Files modified:** 9 (ai/ 7 모듈 + index.ts + ai.test.ts)
- **Tests:** 62 passing (55 baseline + 7 신규 회귀: 2 fence + 5 dedup)

## Accomplishments

- **AI 발굴 (discoverThemes)** — 최근 N일 news_articles(title+description)를 청크로 나눠 Claude Haiku 4.5 p-limit 배치 호출 → 신규 시스템 테마 후보 `{name, stockCodes, confidence}` 발굴. classifyEnabled kill-switch + 기존 norm_key 충돌 제외 + 실패-안전(빈 결과 → 다음 cycle 재시도).
- **AI 교정 (correctMembership)** — 신규/변경분 종목↔테마 매핑을 Claude 로 "명백히 무관" 만 판정 → effective_to soft-제외 대상 반환. 추가 편입 금지(false positive 회피) + 입력 화이트리스트 교차검증(환각 key 방어).
- **적재 (persistAi)** — 발굴 → themes(`source/sources=['ai']`, is_system=true) + theme_stocks(`source='ai'`) UPSERT(norm_key 충돌 시 병합), 교정 → effective_to soft-제외만(naver/alphasquare row 물리 삭제 금지, 원본 보존). 유저 테마(is_system=false) 코드 경로상 도달 불가.
- **cycle 통합 (enrichWithAi + index.ts)** — upsertThemes 직후 classifyEnabled 게이트 + try/catch isolation(AI 실패가 스크랩 cycle 을 죽이지 않음) + summary 에 aiDiscovered/aiCorrected 카운트.
- **POC 실측 검증** (production config: lookback 1일, newsMax 300, claude-haiku-4-5, concurrency 5) — 비용 PASS, 정확도 GOOD, **라이브 버그 1건 발견·수정**, dedup gap 발견·강화.
- **펜스-tolerant 공유 유틸 (parseJson)** — 라이브 버그 수정을 discoverThemes/correctMembership 양쪽 파서에 공유 적용.
- **보수적 dedup 강화 (collapseNearDuplicates)** — POC 의 ~55% cross-chunk 변형 중복을 증거 기반으로만 병합.

## Task Commits

각 태스크 원자적 커밋:

1. **Task 1: AI 모듈 (anthropic 싱글톤 + 발굴 + 교정 + persist), SDK-mock TDD** - `525678a` (feat)
2. **Task 2: theme-sync cycle 에 AI 보강 통합** - `bd81c10` (feat)
3. **Task 3 POC interim STATE note** - `2618ea5` (docs, 체크포인트 대기 기록)
4. **Task 3 finalize: 펜스-tolerant 유틸 + dedup 강화 + 회귀 테스트** - (본 continuation 코드 커밋)

**Plan metadata:** (아래 final docs 커밋)

_Note: Task 3 (POC human-verify 게이트)는 orchestrator 가 실 ANTHROPIC_API_KEY 로 실행 → 사용자 표시 결정 → 본 continuation 이 POC 발견사항 적용·하드닝·finalize._

## Files Created/Modified

- `workers/theme-sync/src/ai/anthropic.ts` - Anthropic SDK lazy 싱글톤 + __resetForTests (discussion-sync 복제)
- `workers/theme-sync/src/ai/prompt.ts` - 발굴/교정 system prompt + few-shot, temperature=0, JSON only 강제
- `workers/theme-sync/src/ai/discoverThemes.ts` - 뉴스 → 신규 테마 후보 발굴 + norm_key 충돌 제외 + **cross-chunk 보수적 병합**
- `workers/theme-sync/src/ai/correctMembership.ts` - 종목↔테마 "명백히 무관" soft-제외 대상 판정 + 환각 방어 (**fence-fix 적용**)
- `workers/theme-sync/src/ai/persistAi.ts` - source='ai' 시스템 적재 + effective_to soft-제외 (원본 보존)
- `workers/theme-sync/src/ai/enrich.ts` - cycle AI 보강 단계 캡슐화 (발굴+검수로드+교정+적재)
- `workers/theme-sync/src/ai/parseJson.ts` - **신규**: extractJsonObject 펜스-tolerant 공유 유틸
- `workers/theme-sync/src/index.ts` - runThemeSyncCycle 에 enrichWithAi 단계 추가 (게이트 + isolation)
- `workers/theme-sync/tests/ai.test.ts` - SDK-mock 단위/통합 테스트 (62 passing, fence/dedup 회귀 포함)

## POC 게이트 결과 (Task 3 — 실 Anthropic 호출)

production config(lookback 1일 / newsMax 300 / claude-haiku-4-5 / concurrency 5)로 production news_articles 에 발굴 1회 실행:

### 비용 — PASS

- 5 Claude 호출, ~50,987 input + ~1,945 output 토큰.
- **$0.06/run → ~$1.83/월** 추정. target(일 $1 미만, RESEARCH ~$3-12/월) 대비 충분히 낮음.

### 정확도 — GOOD

- 실제·의미있는 현재 KR 시장 테마 발굴: HBM 공급확대, AI 기판·부품, 온디바이스 AI/NPU, 양자기술, ADC(항체약물접합체), 파운드리 경쟁(삼성 vs TSMC), 6G AI 네트워크, 폐수소차 희토류 재활용, 단일종목 레버리지 ETF 과열 등.
- 그럴듯한 실 종목코드 매핑.

### 라이브 버그 발견 + 수정 — fence-parse

- **증상:** Haiku 가 "JSON only" 지시에도 ```json 마크다운 펜스로 응답을 감쌈 → `parseDiscoverResponse`(discoverThemes) + `parseCorrectResponse`(correctMembership) 의 `JSON.parse(text)` 가 throw → 빈 결과 → **첫 production run 발굴 0건**.
- **mocked 단위 테스트가 못 잡은 이유:** 모든 mock 이 clean JSON 을 주입(펜스 없음).
- **수정:** `parseJson.extractJsonObject(text)` — 첫 '{' ~ 마지막 '}' 슬라이스(펜스/프리앰블/트레일링 설명 제거)를 두 파서에 공유 적용. 같은 run 재실행 시 **36 후보** 발굴.

### 품질 gap 발견 + 강화 — cross-chunk dedup

- **gap:** 36 raw 후보 중 ~55% 가 cross-chunk NEAR-DUPLICATE — 5개 뉴스 청크가 각각 같은 테마를 조금씩 다른 이름으로 재발굴(피지컬 AI/로봇 ×5, 단일종목 레버리지 ETF ×4, 반도체 지역 클러스터 ×4, AI 인프라/팩토리/에코시스템 ×3). norm_key 완전일치 dedupe 만으로는 변형명 미병합. Distinct ≈ 15-18.
- **강화(USER DECISION = "approved + dedup 강화"):** `collapseNearDuplicates` — 증거 기반 보수적 병합. B 를 A 로 병합하는 조건은 EITHER:
  - (a) 종목코드 **2개 이상** 공유, OR
  - (b) 한 norm_key 가 다른 norm_key 를 substring 으로 **완전 포함** + 포함되는(짧은) 쪽 길이 **≥ 4**("ai" 2자 류 짧은 토큰 오병합 차단).
  - 그 외(종목 1개 공유 / edit-distance / 부분 토큰)는 병합 안 함 → **KEEP BOTH**. 병합 시 더 일반적(norm_key 짧은) 이름 canonical, stockCodes 합집합, confidence max.
- **원칙:** normalizeName 의 "유사도 자동병합 금지(보수적)" 승계 — 남은 중복은 허용, 잘못된 병합은 불가(시스템 레이어 read-only → fork-후-수정 불가).

### 표시 결정 — source='ai' 승인

- 정확도 GOOD → source='ai' 표시 유지(ai_candidate 격리 불필요). 코드 변경 없음.
- `/api/themes`(Plan 04)가 `is_system=true` 조회 → AI 테마(`is_system=true`, `sources=['ai']`) 자동 surface 확인.

## Decisions Made

- **펜스-tolerant 유틸 공유화**: discoverThemes/correctMembership 두 파서가 동일 POC 버그를 공유 → parseJson.ts 단일 유틸로 수정(DRY + 회귀 일관성).
- **보수적 증거기반 dedup**: 공유종목 ≥2 OR norm_key 포함(길이≥4) 두 조건만, 불확실 시 KEEP BOTH (위 POC 섹션 상세).
- **source='ai' 유지**: POC 정확도 GOOD → 표시 승인, ai_candidate 격리 불필요.
- **배포 플래그 노트**: Plan 10-08 deploy 가 Cloud Run Job env `THEME_SYNC_CLASSIFY_ENABLED=true` 설정해야 production 발굴 활성(현재 default false kill-switch — 안전 기본값).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Haiku ```json 펜스로 인한 파싱 전체 실패 수정 (POC 발견)**
- **Found during:** Task 3 (POC 게이트 — 실 Anthropic 호출)
- **Issue:** Haiku 가 "JSON only" 지시에도 응답을 ```json 펜스로 감쌈 → discoverThemes/correctMembership 의 `JSON.parse(text)` throw → 발굴 0건. mocked 단위 테스트는 clean JSON 만 주입해 미검출.
- **Fix:** `parseJson.extractJsonObject` 공유 유틸(첫 '{'~마지막 '}' 슬라이스)을 두 파서에 적용. 펜스/프리앰블 제거. 동일 run 재실행 시 36 후보 발굴.
- **Files modified:** workers/theme-sync/src/ai/parseJson.ts(신규), discoverThemes.ts, correctMembership.ts
- **Verification:** 펜스-감싼 응답 회귀 테스트 2건(discover + correct) green, 동일 production run 36 후보
- **Committed in:** (Task 3 finalize 커밋)

**2. [Rule 2 - Missing Critical] cross-chunk near-duplicate 보수적 병합 추가 (POC dedup gap)**
- **Found during:** Task 3 (POC 게이트 — 발굴 결과 육안 검토)
- **Issue:** 36 후보 중 ~55% 가 cross-chunk 변형 중복(각 청크가 같은 테마 재발굴). norm_key 완전일치 dedupe 만으로는 변형명 미병합 → 표시 품질 저하.
- **Fix:** `collapseNearDuplicates` — 증거 기반(공유종목 ≥2 OR norm_key 포함, 길이≥4 가드) 보수적 병합. edit-distance 금지, 불확실 시 KEEP BOTH (USER DECISION "approved + dedup 강화").
- **Files modified:** workers/theme-sync/src/ai/discoverThemes.ts
- **Verification:** dedup 회귀 테스트 5건(merge ×2 + no-over-merge ×3) green
- **Committed in:** (Task 3 finalize 커밋)

---

**Total deviations:** 2 auto-fixed (1 라이브 버그, 1 missing-critical 품질). 둘 다 POC 게이트에서 발견 — 게이트의 본래 목적(정확도/비용 검증)이 정확히 작동.
**Impact on plan:** 둘 다 production 발굴 정확성/품질에 필수. mocked-only 테스트의 사각지대를 실 호출 게이트가 메움. scope creep 없음(POC 게이트가 plan 에 명시).

## Issues Encountered

- **mocked 테스트 사각지대**: SDK-mock 단위 테스트(Task 1)가 clean JSON 만 주입 → Haiku 의 실제 펜스 응답을 시뮬레이션하지 못해 라이브 버그 미검출. POC 게이트(실 호출)에서 비로소 발견. → 펜스-감싼 응답을 명시 시뮬레이션하는 회귀 테스트로 영구 커버.

## User Setup Required

None — 본 plan 은 코드/테스트만. Production 활성화(ANTHROPIC_API_KEY GCP Secret 등록 + `THEME_SYNC_CLASSIFY_ENABLED=true`)는 **Plan 10-08 deploy** 의 [BLOCKING] 사용자 액션. classifyEnabled default false 라 미설정 시에도 cycle 정상(AI 단계만 skip).

## Next Phase Readiness

- **Plan 10-07 (themes-ui) 준비**: AI 테마는 `is_system=true` + `sources` 에 'ai' 라벨 포함 → /themes UI 가 출처 칩으로 'ai' 표기 가능(THEME-02 출처 표기 요건).
- **Plan 10-08 (deploy) 필수 액션**: Cloud Run Job env `THEME_SYNC_CLASSIFY_ENABLED=true` + ANTHROPIC_API_KEY Secret(gh-radar-anthropic-api-key, Phase 08.1 기존 재사용 가능) 바인딩. 설정 후 첫 배치 cycle 이 발굴 활성.
- **Concern 없음**: 비용 ~$1.83/월(target 통과), 정확도 GOOD, 펜스/dedup 회귀 영구 커버.

## Self-Check: PASSED

- 8 ai/ 파일(anthropic/prompt/discoverThemes/correctMembership/persistAi/enrich/parseJson + tests/ai.test.ts) + index.ts 존재 확인
- parseJson.ts(신규) 존재 확인
- poc-discover.ts 부재 확인 (throwaway 미커밋)
- test(62)/build/typecheck 전부 exit 0
- 커밋 525678a(Task1)/bd81c10(Task2)/2618ea5(interim) git log 확인 + finalize 커밋(아래)

---
*Phase: 10-theme-classification*
*Completed: 2026-06-09*
