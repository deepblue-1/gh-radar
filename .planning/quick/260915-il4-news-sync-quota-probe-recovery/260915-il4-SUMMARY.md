---
phase: quick-260915-il4
plan: 01
subsystem: workers/news-sync
status: complete
tags: [news-sync, naver-search-api, quota, probe, cloud-run-job]
requires:
  - quick-260915-h3p (strike 마커 · 429 본문 구분 · 연속 429 휴리스틱)
provides:
  - 당일 중단 없는 한도 소진 대응 — 판정 run 만 중단 + 이후 run 첫 대상 단독 탐침 자동 복구
  - CollectOpts.retryOnRateLimit (기본 true)
  - runNewsSyncCycle 사이클 테스트 하네스 (tests/cycle.test.ts)
affects: [workers/news-sync, CLAUDE.md, .planning/research/STACK.md]
tech-stack:
  added: []
  patterns:
    - "strike≥1 run 은 첫 대상 1종목을 동시성·429 재시도 없이 선행 수집(탐침) 후 pLimit 수집"
    - "runNewsSyncCycle 을 I/O 경계만 vi.mock 하고 collectStockNews·searchNews·classify·cadence 는 실제 구현으로 도는 사이클 테스트"
key-files:
  created:
    - workers/news-sync/tests/cycle.test.ts
  modified:
    - workers/news-sync/src/index.ts
    - workers/news-sync/src/naver/collectStockNews.ts
    - workers/news-sync/src/apiUsage.ts
    - workers/news-sync/tests/collectStockNews.test.ts
    - workers/news-sync/tests/apiUsage.test.ts
    - CLAUDE.md
    - .planning/research/STACK.md
decisions:
  - "한도 소진 판정(strike)은 판정 run 만 중단한다. 같은 KST 날짜 strike 누적으로 자정까지 skip 하던 경로(QUOTA_STRIKES_TO_STOP_DAY=2)는 제거했다 — 오판 2회가 하루 뉴스를 끄는 비용이 실제 소진 시 run 당 거절 1건보다 크다."
  - "탐침 429 는 본문(010 소진 · 012/빈 본문 일반)과 무관하게 run 을 중단하고 strike 를 1회 기록한다(quotaAbort explicit|probe). 탐침 비429 실패(400·5xx·네트워크)는 통과로 본다."
  - "탐침 429 로그는 error 가 아닌 warn — 실제 소진이 이어지면 3분마다 반복될 예상된 거절이라 ERROR 로 쌓지 않는다."
metrics:
  duration: "약 20분 (13:26 계획 관측 이후 실행 13:27~13:47 KST)"
  completed: 2026-09-15
actuals:
  tokens: 8300
  tasks: 2
  commits: 2
plan_head_before: f5ac8ecb9052d4567e4a2675e555a3982b36bf95
---

# Quick 260915-il4: news-sync 한도 소진 당일 중단 제거 · 단독 탐침 자동 복구 Summary

strike 가 같은 날 2회 쌓이면 자정까지 news-sync 를 끄던 동작을 없앴다. 이제 판정한 run 만 중단하고, 이후 run 은 첫 대상 1종목을 429 재시도 없이 단독으로 먼저 수집하는 탐침으로 회복을 확인한 뒤 자동 재개한다. 라이브 잡 `news-sync:24bc6b3` 로 재배포했고, 예약 실행 2건이 성공했다.

## 동작 before / after

| 상황 | Before (h3p · 993c6a7) | After (il4 · 24bc6b3) |
|------|------------------------|------------------------|
| 오늘 strike 0 | 동시성 3 수집 · 429 backoff(250/500ms) · 연속 5종목 휴리스틱 | **동일** (탐침 없음, C1·C7 로 잠금) |
| 오늘 strike 1 | 평소대로 수집 | 첫 대상 단독 탐침(재시도 없음) → 통과 시 `quota probe passed — resuming` 후 나머지 평소 수집 |
| 오늘 strike ≥ 2 | run 시작 즉시 `skipping run until KST midnight` — 네이버 호출 0, 대상 로드도 안 함 | strike 1 과 같음 — **사전 skip 없음** (C6: strike 2·7) |
| 탐침이 429 (소진 본문 010) | — | 네이버 호출 1건 · stopAll · strike 1회 · quotaAbort `explicit` · 나머지 skipped |
| 탐침이 429 (일반 012 / 빈 본문) | — | 네이버 호출 1건(backoff 없음) · stopAll · strike 1회 · quotaAbort `probe` |
| 탐침이 400 · 5xx · 네트워크 | — | 통과로 보고 나머지 수집 (errors +1) |
| 비탐침 소진 본문 429 | stopAll + strike + error "…second strike today stops news-sync until KST midnight" | stopAll + strike + error "…next runs re-check with a single probe call" |
| 로그 필드 | cycle complete: quotaAbort | targets selected: +strikesToday / cycle complete: +strikesToday · quotaProbe(null\|passed\|rate-limited) |

실제 소진이 계속되면 run 당 네이버 거절 호출은 탐침 1건(3분에 1건)이다. 오판이었다면 다음 run 에서 곧바로 복구된다.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | 당일 중단 제거 + 첫 대상 단독 탐침 (TDD) | e489f74 | src/index.ts · src/naver/collectStockNews.ts · src/apiUsage.ts · tests/cycle.test.ts(신규) · tests/collectStockNews.test.ts · tests/apiUsage.test.ts |
| 2 | 공식 API 운영 기준 4항 갱신 → 재배포 → 관측 | 24bc6b3 | CLAUDE.md · .planning/research/STACK.md (+ 배포, 코드 커밋 없음) |

## 검증 결과

### 로컬 (Task 1)
- RED: 구현 전에 `tests/cycle.test.ts` 10건 전부 실패(strikesToday 필드 없음 · 탐침 없음 · 재시도 발생)했다. collectStockNews 신규 1건도 실패(`unexpected call #3`, 즉 재시도가 일어남). mock 하네스는 정상 동작했다(C1 에서 get 3회 관측).
- GREEN:
  - `pnpm --dir workers/news-sync run typecheck`: exit 0
  - `pnpm --dir workers/news-sync run test`: **14 files · 139 passed · 3 todo · 0 failed**. 기준선 128 passed · 3 todo 대비 +11 (cycle C1~C7 it.each 전개 10건, collectStockNews 1건)
  - `vitest run tests/cycle.test.ts tests/collectStockNews.test.ts tests/apiUsage.test.ts`: 3 files · 34 passed
  - `pnpm --dir workers/news-sync run build`: exit 0
  - 음성 grep(`QUOTA_STRIKES_TO_STOP_DAY` · `KST midnight` · `second strike`, src+tests): 0건
  - 양성 grep(`quota probe passed — resuming` · `retryOnRateLimit: !probe`): 확인

### 문서 (Task 2)
- CLAUDE.md:149 와 STACK.md:196 이 같은 문장이다(`grep -Fx` 둘 다 일치). `자정까지 skip` 0건. `git diff --numstat f5ac8ec` 는 두 파일 각각 `1 1`.

### 배포
- 배포 시작 13:40:04 KST, 종료 13:41:27 KST. `DEPLOY_EXIT=0`, 끝 줄 `✅ deploy-news-sync.sh complete`.
- **이미지 태그: `asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/news-sync:24bc6b3`** (DEPLOY_SHA = docs 커밋 24bc6b3, 코드 커밋 e489f74 포함). `gcloud run jobs describe` 로 확인했다.
- smoke **PASS 11 · FAIL 0** (INV-1 · 2 · 3a~f · 4 · 5 · 6).
- 폐기 스케줄러 3개(morning · morning-10h · intraday)는 `already absent` 였다.

### 스케줄러 before / after
`gcloud scheduler jobs list` 의 news-sync 행(name · schedule · state · timeZone · uri)을 정렬해 배포 전후로 비교했다. **diff 는 0줄**이다(`diff_exit=0`). 4개 모두 그대로다.

```
gh-radar-news-sync-market        */3 8-19 * * 1-5     ENABLED  Asia/Seoul
gh-radar-news-sync-market-close  0 20 * * 1-5         ENABLED  Asia/Seoul
gh-radar-news-sync-offhours      0 0-6/2,22 * * 1-5   ENABLED  Asia/Seoul
gh-radar-news-sync-weekend       0 */2 * * 0,6        ENABLED  Asia/Seoul
```
plan 의 Task 2 automated verify(기대 4행 diff 포함)도 통과했다.

### 배포 후 실행 관측

| 생성 (KST) | execution | 종류 | 결과 | version | mode | bucket | targets | pages | inserted | errors | skipped | budget | strikesToday | quotaProbe | quotaAbort |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 13:40:49 | sfdg4 | smoke INV-1 (수동, 관측 수에서 제외) | succeeded | 24bc6b3 | tiered | 0 | 63 | 63 | 4 | 0 | 0 | 6,978 → 7,041 | 0 | null | null |
| 13:42:00 | g6znh | **예약** (market) | succeeded | 24bc6b3 | tiered | 1 | 54 | 54 | 1 | 0 | 0 | 7,041 → 7,095 | 0 | null | null |
| 13:45:04 | s6t9m | **예약** (market) | succeeded | 24bc6b3 | tiered | 2 | 55 | 55 | 13 | 0 | 0 | 7,095 → 7,150 | 0 | null | null |

- 예약 실행 **2건 succeeded**. 둘 다 version = DEPLOY_SHA, strikesToday 0, quotaProbe null, quotaAbort null 이다. targets selected 로그는 hot 34 · restTotal 70 · total 104 였다.
- 배포 시작(04:40:04Z) 이후 news-sync 에서 warn 이상(`jsonPayload.level>=40`) 로그는 **0건**이다.
- 오늘(KST 00:00 이후) news-sync 로그 중 "quota" 가 들어간 건은 0건이다.

## 라이브 탐침 경로 미발동 (중요)

**오늘 strike 는 0 이다.** 그래서 라이브에서는 탐침 경로가 한 번도 발동하지 않았다. 관측된 실행은 전부 strikesToday 0 · quotaProbe null 이다. 탐침 동작(단독 선행 · 429 시 호출 1건 중단 · strike 1회 · 비429 통과 · strike≥2 사전 skip 없음)은 **`tests/cycle.test.ts` C2~C6 테스트로만 검증했다.** 라이브 첫 발동은 실제 strike 가 생긴 다음 날 이후에야 관측할 수 있다.

429 본문 코드 매핑(010 소진 · 012 초당)은 여전히 **[ASSUMED]** 이다. 탐침 warn 로그 `quota probe got HTTP 429 — aborting run (no retries); next run probes again` 이 원문 `errorCode` · `errorMessage`(200자 절단)를 남기므로 첫 실제 발생 때 형태를 확인할 수 있다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] smoke INV-5·6 용 SUPABASE_SERVICE_ROLE_KEY 를 셸 변수로 로드**
- **Found during:** Task 2 배포 전 점검
- **Issue:** plan 은 "비밀은 셸에서 다루지 않는다" 고 했다. 하지만 deploy 스크립트 끝의 `smoke-news-sync.sh` INV-5·INV-6 은 셸 env 의 `SUPABASE_SERVICE_ROLE_KEY` 를 요구한다. 이 값이 없으면 smoke FAIL 2 로 스크립트가 exit 1 을 내고, plan 의 done 기준(smoke FAIL 0)을 채울 수 없다.
- **Fix:** h3p 선례("비밀 값은 셸 변수로만 다뤘다", smoke 11/0)를 따랐다. `gcloud secrets versions access latest --secret=gh-radar-supabase-service-role` 결과를 export 만 했다. 값은 echo 하지 않았고 길이만 확인했으며 .env 는 읽지 않았다. 잡의 비밀 주입은 여전히 `--set-secrets` 참조다.
- **Files modified:** 없음 (셸 세션 한정)

**2. [재량] 사이클 테스트 C1~C7 에 요약 필드 단언 일부 추가**
- plan 의 behavior 단언은 모두 넣었다. 그 위에 C3 `infoCount(PASSED)=0`, C5 `quotaAbort null`, C7 `quotaProbe/quotaAbort null · errors 1` 같은 보강 단언을 더했다. 동작 변경은 없다.

그 외 코드는 plan 대로 실행했다.

## Known Stubs

없음.

## Threat Flags

없음. 새 네트워크 엔드포인트·권한 경로·스키마 변경은 없다. strike 마커는 기존 `api_usage` 의 service_role 경로를 그대로 쓴다(T-il4-03 accept). 이제 탐침 발동 여부를 그 값이 결정한다는 점은 plan threat register 에 이미 있다.

## Rollback

```bash
export GOOGLE_APPLICATION_CREDENTIALS=$HOME/.config/gcloud/gh-radar-deployer.json CLOUDSDK_CORE_PROJECT=gh-radar
gcloud run jobs update gh-radar-news-sync --region=asia-northeast3 \
  --image=asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/news-sync:993c6a7
```
(APP_VERSION env 는 24bc6b3 으로 남는다. 정확히 되돌리려면 `--update-env-vars=APP_VERSION=993c6a7` 를 같이 준다. 스케줄러는 변경이 없어 되돌릴 것이 없다. 코드는 `git revert 24bc6b3 e489f74`.)

## 커밋

- e489f74 `fix(news-sync): 한도 소진 판정 후 당일 수집 중단 제거 — 판정 run 만 중단·다음 run 은 첫 종목 단독 탐침(재시도 없음)으로 자동 복구`
- 24bc6b3 `docs: 공식 API 운영 기준 4항을 판정 run 중단 + 단독 탐침 재개로 갱신 — CLAUDE.md·STACK.md 동일`
- 둘 다 한글이고 Co-Authored-By 없다. push 하지 않았고, 명시 경로만 stage 했다.

## Self-Check: PASSED
