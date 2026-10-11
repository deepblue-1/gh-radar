---
phase: quick-260915-h3p
plan: 01
subsystem: workers/news-sync
status: complete
tags: [news-sync, naver-search-api, cloud-scheduler, cadence, quota]
requires: []
provides:
  - "평일 장시간 tiered 수집(hot 매회 + rest 3조 순환) — pipeline/cadence.ts planRun"
  - "네이버 일일 한도 소진 시 run 즉시 중단 + 같은 KST 날짜 2 strike 에 자정까지 skip"
  - "스케줄러 4개(market · market-close · offhours · weekend), 동분 중복 0 테스트 잠금"
  - "CLAUDE.md / STACK.md 스크래핑 5원칙 ↔ 공식 API 운영 기준 분리"
affects: [workers/news-sync, scripts/deploy-news-sync.sh, scripts/smoke-news-sync.sh, CLAUDE.md, .planning/research/STACK.md]
tech-stack:
  added: []
  patterns:
    - "스케줄러는 모드를 넘기지 않고 워커가 KST 시각으로 auto 판정 (NEWS_SYNC_MODE override)"
    - "stateless 버킷 = floor(KST 분/3)%3, 종목 버킷 = FNV-1a+fmix32(code)%3"
    - "api_usage 별도 service 라벨을 KST 날짜 키 마커로 사용 (마이그레이션 없음)"
    - "배포 스크립트 cron 배열을 테스트가 직접 파싱해 1주 분 단위 전개로 단언"
key-files:
  created:
    - workers/news-sync/src/pipeline/cadence.ts
    - workers/news-sync/tests/cadence.test.ts
    - workers/news-sync/tests/schedule.test.ts
  modified:
    - workers/news-sync/src/pipeline/targets.ts
    - workers/news-sync/src/config.ts
    - workers/news-sync/src/index.ts
    - workers/news-sync/src/naver/searchNews.ts
    - workers/news-sync/src/apiUsage.ts
    - workers/news-sync/src/pipeline/classify.ts
    - workers/news-sync/tests/config.test.ts
    - workers/news-sync/tests/naver.test.ts
    - workers/news-sync/tests/searchNews.test.ts
    - workers/news-sync/tests/collectStockNews.test.ts
    - workers/news-sync/tests/classify.test.ts
    - workers/news-sync/tests/apiUsage.test.ts
    - scripts/deploy-news-sync.sh
    - scripts/smoke-news-sync.sh
    - CLAUDE.md
    - .planning/research/STACK.md
decisions:
  - "모드 판정은 워커 KST auto + NEWS_SYNC_MODE override — 스케줄러별 containerOverrides 본문 관리 회피"
  - "한 run 의 소진 증거는 그 run 만 중단, 같은 KST 날짜 두 번째 strike 에서 자정까지 중단 (오판 비용 > 다음 1회 거절 호출 비용)"
  - "연속 429 휴리스틱 임계 5 (> 동시성 3)"
  - "offhours 식 0 0-6/2,22 * * 1-5 를 gcloud 가 그대로 수용 — 동치식 대체 불필요"
metrics:
  duration: "22min"
  completed: "2026-09-15"
  tasks: 3
  files: 19
estimate:
  tokens: 150000
  tasks: 3
actuals:
  tokens: 22639
  tasks: 3
  commits: 4
plan_head_before: 3ce5f81275abf76ebff1770835dd360b96f689ce
---

# Quick 260915-h3p: news-sync 네이버 수집 주기 재설계 Summary

**평일 장시간 3분 단일 잡이 급등 상위 30·관심종목(34)은 매회, 나머지 top_movers(70)는 3조 순환으로 수집해 회당 호출 ~104 → 평균 58.7 로 줄였고, 네이버 일일 한도 소진 시 즉시 중단(같은 날 2 strike 면 자정까지 skip)하며, 동분 중복 발화가 사라진 스케줄러 4개로 라이브 배포·관측을 마쳤다.**

## 커밋

| Task | 커밋 | 메시지 |
|------|------|--------|
| 1 | `5f86f9c` | feat(news-sync): 장시간 급등 상위 30·관심종목 매회 + 나머지 3조 순환 수집 — KST 모드 자동 판정·예산 18,750 |
| 2 | `deebf82` | fix(news-sync): 네이버 일일 한도 소진 시 즉시 중단·같은 날 두 번째 판정부터 자정까지 수집 중단 — 429 본문 구분·연속 429 휴리스틱 |
| 3 | `da31cee` | chore(news-sync): 스케줄러를 장시간 3분 단일 잡·평일 밤·주말로 재편 — 동분 중복 발화 제거·예산 18,750 |
| 3 | `993c6a7` | docs: 네이버 검색 API 는 공식 API 운영 기준으로 분리 — 스크래핑 5원칙과 구분·한도 수치 명시 |

4개 모두 한글 메시지, `Co-Authored-By` 0건(`git log --format=%B 3ce5f81..HEAD | grep -ci co-authored` = 0), **push 안 함**(원격 브랜치 중 HEAD 포함 0개). 배포 이미지 = `993c6a7`.

## 구현 요약

### Task 1 — 등급 대상 선택 (tracer)
- `pipeline/cadence.ts`(순수 함수): `resolveRunMode`(평일 ∧ KST 480≤분≤1202 → tiered), `restBucketFor`(= floor(분/3)%3), `stockBucket`(FNV-1a 32bit + murmur3 fmix32), `selectRunTargets`(hot 앞, code 기준 1회), `planRun`(단일 진입점).
- `targets.ts`: `top_movers` 를 `select("code, rank")` 로 읽고, 순수 함수 `buildTargetRecords` 로 조립한다. 조립 규칙은 세 가지다. 같은 code 가 여러 번이면 작은 rank 를 쓰고, watchlist 에만 있으면 rank null 로 두며, stocks 마스터에 없는 code 는 제외한다.
- `config.ts`: `NEWS_SYNC_MODE`(auto|tiered|full, 기본 auto, 그 외 throw) 추가, `NEWS_SYNC_DAILY_BUDGET` 기본값 24500 → **18750**.
- `index.ts`: 시작 시 `now` 를 1회만 캡처한다. 모드·버킷·KST 날짜·7일 컷오프가 모두 이 값을 쓴다. 이어서 `planRun` 을 부르고, 로그 `news-sync targets selected` / `cycle complete` 에 mode·restBucket·targets 를 남긴다.
- tracer 게이트: `<verify>`(typecheck · test · build) 재실행 통과 후 확장.

### Task 2 — 한도 소진 중단
- `searchNews.ts`: `extractNaverError`(객체/JSON 문자열/비 JSON 원문 200자)와 `isDailyQuotaExhausted`(errorCode `010` 또는 /query limit exceeded/i)를 추가했다. 429 응답은 두 갈래로 나뉜다. 소진 본문이면 `NaverBudgetExhaustedError`, 그 외는 `NaverRateLimitError` 이고, 둘 다 errorCode/errorMessage 를 보존한다. `collectStockNews.ts` 는 수정하지 않았다. 재시도가 `NaverRateLimitError` 에만 걸리기 때문이고, 소진 시 `client.get` 이 1회만 호출된다는 것을 테스트로 잠갔다.
- `apiUsage.ts`: `checkBudget`/`incrementUsage` 에 선택 인자 `service` 를 추가했다. strike 마커는 `QUOTA_STRIKE_SERVICE="naver_search_news_quota_strike"` 와 `QUOTA_STRIKES_TO_STOP_DAY=2`, 그리고 `readQuotaStrikes`/`recordQuotaStrike` 로 구성된다.
- `classify.ts`: `Consecutive429Tracker(5)` 추가.
- `index.ts`의 동작은 다음과 같다.
  - 대상 로드 전에 오늘 strike 가 2 이상이면 warn 로그만 남기고 return 한다(네이버 호출 0).
  - 소진 에러, 또는 재시도 후 429 가 5종목 연속이면 stopAll 한다. strike 는 run 당 1회만 기록한다(`quotaAbort` 를 await 전에 동기적으로 설정). 기록이 실패하면 error 로그만 남기고 중단은 그대로 진행한다.
  - 429 warn 로그에 원문 errorCode/errorMessage 를 포함한다.
  - **자체 예산 가드에 도달했을 때 로그 없이 멈추던 결함을 고쳤다**(최초 1회 error 로그).
  - `cycle complete` 로그에 `quotaAbort` 를 추가했다.

### Task 3 — 스케줄러 · 문서 · 배포
- `deploy-news-sync.sh`: `NEWS_SCHEDULERS` 는 4개다. 폐기 3개는 `OBSOLETE_NEWS_SCHEDULERS` 에 두고 idempotent 삭제 루프로 지운다. Job env `NEWS_SYNC_DAILY_BUDGET=18750` 이고, `NAVER_DAILY_BUDGET=24500` 은 그대로 두되 "worker 미사용" 주석을 달았다. `NEWS_SYNC_MODE` 는 설정하지 않았다(auto).
- `smoke-news-sync.sh`: INV-3a~f (market · market-close · offhours · weekend 식, 4개 ENABLED, 폐기 3개 부재).
- `tests/schedule.test.ts`: 배포 스크립트 배열을 직접 파싱한다. 최소 unix-cron 전개기를 두며, 미지원 토큰과 일/요일 동시 제한은 throw 한다. 2026-09-14(월)~20(일) 10,080분을 전개해 ①~⑥ 을 단언한다.

## 검증 결과

### 테스트 · 타입체크 · 빌드
| 시점 | 결과 |
|------|------|
| 기준선 (시작 전) | typecheck exit 0 · 11 files · 75 passed · 3 todo |
| Task 1 RED | cadence.test 모듈 없음 + config 4건 실패 확인 |
| Task 1 GREEN | typecheck/build exit 0 · 12 files · **106 passed** (+31) |
| Task 2 RED | 13건 실패 (미정의 export · 429 오분류 · 소진 시 재시도 진행) |
| Task 2 GREEN | typecheck/build exit 0 · 12 files · **120 passed** (+14) |
| Task 3 | `bash -n` 2종 exit 0 · typecheck exit 0 · 13 files · **128 passed · 3 todo** (schedule.test 8건) |

### cron 동분 중복 0 테스트 (`tests/schedule.test.ts`)
| # | 단언 | 결과 |
|---|------|------|
| ① | 활성 이름 = {market, offhours, weekend, market-close}, 폐기 3개와 교집합 0 | PASS |
| ② | 1주 10,080분 중 2개 이상 발화한 분 = **0** | PASS |
| ③ | 주간 발화 market 1200 · market-close 5 · offhours 25 · weekend 24 | PASS |
| ④ | 발화 분마다 `resolveRunMode(auto)`: market/market-close → tiered, offhours/weekend → full | PASS |
| ⑤ | 평일 480~1200분 3의 배수 분 전부 발화(241회), tiered 발화마다 restBucket (직전+1)%3 | PASS |
| ⑥ | 연속 발화 간격 최댓값 ≤ 120분 | PASS |

### 문서 검증
- `grep -q '공식 API 운영 기준'` CLAUDE.md · STACK.md 둘 다 hit.
- `grep -c 'Naver Search API · 향후'` = CLAUDE.md 0 · STACK.md 0.
- 18,750 / 25,000 / 공식 errorcode 링크: 두 파일 모두 포함.
- CLAUDE.md Conventions 절(`GSD:conventions-start`~`end`) diff vs `3ce5f81` = **0줄**.

## 라이브 배포 · 관측

배포: KST 12:49:40 시작 → 12:51:12 `DEPLOY_EXIT=0`, `✅ deploy-news-sync.sh complete`. smoke **PASS 11 · FAIL 0** (INV-1 · 2 · 3a~f · 4 · 5 · 6).

### 최종 라이브 스케줄러 (asia-northeast3, Asia/Seoul)
| 이름 | schedule | state |
|------|----------|-------|
| gh-radar-news-sync-market | `*/3 8-19 * * 1-5` | ENABLED |
| gh-radar-news-sync-market-close | `0 20 * * 1-5` | ENABLED |
| gh-radar-news-sync-offhours | `0 0-6/2,22 * * 1-5` | ENABLED |
| gh-radar-news-sync-weekend | `0 */2 * * 0,6` | ENABLED |

gcloud 는 `0-6/2,22` 를 그대로 수용했다 → 동치식 대체 없음.

### 삭제된 스케줄러
| 이름 | 배포 전 schedule | 배포 후 describe |
|------|------------------|------------------|
| gh-radar-news-sync-morning | `*/3 8-9 * * 1-5` | NOT_FOUND |
| gh-radar-news-sync-morning-10h | `0-30/3,45 10 * * 1-5` | NOT_FOUND |
| gh-radar-news-sync-intraday | `*/15 11-15 * * 1-5` | NOT_FOUND |

offhours 는 배포 전 `0 */2 * * *` 였고 이번에 좁혀졌다. 배포 전 동분 중복의 실증 기록이 남아 있다. 12:00 KST 에 실행 2건(`fzph6` 03:00:04Z, `84p7q` 03:00:05Z; intraday + offhours)이 같은 분에 떴고, 두 번째 run 은 pages 104 · inserted 0 이었다.

### 관측된 실행 (배포 SHA `993c6a7`, 전부 succeeded)
| KST 시작 | execution | 트리거 | mode | restBucket | hot | restTotal | restSelected | targets | pages | inserted | errors | budgetBefore → After | quotaAbort |
|----------|-----------|--------|------|-----------|-----|-----------|--------------|---------|-------|----------|--------|----------------------|-----------|
| 12:50:37 | swjdf | smoke INV-1 (수동) | tiered | 1 | 34 | 70 | 23 | 57 | 57 | 18 | 0 | 5,929 → 5,986 | null |
| **12:51:00** | 57fn6 | market 예약 | tiered | **2** | 34 | 70 | 20 | 54 | **54** | 0 | 0 | 5,986 → 6,040 | null |
| **12:54:04** | x87mq | market 예약 | tiered | **0** | 34 | 70 | 29 | 63 | **65** | 47 | 0 | 6,040 → 6,105 | null |
| **12:57:04** | t9m7z | market 예약 | tiered | **1** | 34 | 70 | 23 | 57 | **57** | 5 | 0 | 6,105 → 6,162 | null |

- **예약 연속 3건 확보**(12:51 · 12:54 · 12:57). restBucket 은 **2 → 0 → 1** 로 +1 mod 3 회전했고, 이는 `floor(분/3)%3` 계산값(771→2, 774→0, 777→1)과 일치한다. 12:50 수동 실행(770→1)과 12:57(777→1)은 같은 버킷이고 restSelected 도 23 으로 같다.
- 회당 호출: 예약 3건 평균 **58.7** (54 · 65 · 57)이다. 배포 전 동일 대상(104종목) 실행은 104~113이었다. 12:51 은 54 로 목표 범위 55~65 를 1 밑돌았다. 버킷 크기가 해시 분포상 20~29 로 고르지 않기 때문이며 결함이 아니다. 12:54 는 targets 63 에 pages 65 로, 2종목이 2페이지를 돌았다(backlog).
- rest 세 선택의 합이 72 로 restTotal 70 과 다르다. 실행 사이에 intraday-sync 가 `top_movers` 를 갱신해 rest 구성원이 바뀌기 때문이다. 같은 입력에서 세 버킷이 서로소이고 합집합이 전체라는 성질은 `cadence.test.ts` 가 잠근다.
- 실행 시간은 16~20초로 3분 주기 대비 충분하다.
- 배포(03:49Z) 이후 news-sync **severity>=ERROR 로그 0건**, WARNING 이상도 0건.

### api_usage 오늘 (2026-09-15 KST, PostgREST 직접 조회 12:52)
- `naver_search_news` = 6,040 (12:51 run 의 budgetAfter 와 일치). 12:57 run 후 budgetAfter = **6,162**.
- `naver_search_news_quota_strike` 행 **없음** (strike 0).

### 예산 여유 계산
- 남은 장시간 회차: 13:00~19:57 140회 + 20:00 1회 = **141회**.
- 141 × 관측 평균 58.7 ≈ **8,277** → 6,162 + 8,277 ≈ **14,439**. 22:00 offhours full 1회(≈104~113)를 더하면 **≈14,550 < 18,750** (여유 ≈4,200). 판정: **정상**.
- 평일 하루 전체 추정: 241 × ~59 ≈ 14.2K + offhours 5회 × ~110 ≈ 0.55K + 08:00 첫 run backlog ≈ **~15K** — 설계 추정 ≈15.5K(~62%) 범위 안.

## 변경된 CLAUDE.md / STACK.md

- **CLAUDE.md** (GSD stack 관리 블록 안에서만, +15/−1줄):
  - 5원칙 아래 인용 블록을 "이 5원칙은 **스크래핑 source** 에 적용, 공식 쿼터 API(Naver Search API 등)는 공식 API 운영 기준을 따른다, 새 source 는 먼저 분류" 로 교체했다.
  - 빈 `### Naver Search API Rate Limit` 에 목록 4항을 채웠다: 공식 25,000/일·카운터·display/start 상한, 소비처(news-sync + server `POST /api/stocks/:code/news/refresh` 공유 — 코드로 확인), 예산 18,750 / server 24,500 별도, 수집 주기 ≈15.5K/일.
  - **공식 API 운영 기준** 번호 목록 5항을 추가했다.
  - Sources 에 `https://developers.naver.com/docs/common/openapiguide/errorcode.md` 를 추가했다.
  - Legal posture·5원칙 1~5 본문과 Conventions 절은 불변이다.
- **.planning/research/STACK.md**: `Naver 종목토론방 Scraping Risk` 와 `Naver Search API Rate Limit` 의 옛 산문(on-demand 스크랩 · 5~10분 캐시 · 상세 진입 시에만 뉴스 호출)을 CLAUDE.md 블록과 같은 내용으로 교체했다. Legal posture 는 재생성 시 산문이 빠지는 문제를 피하려고 굵은 글씨 목록 항목으로 적었다. Sources 링크도 추가했다. `generate-claude-md` 는 실행하지 않았다.

## 범위 밖 · 미변경 항목 (명시)

- **KRX 평일 휴장일은 평일로 취급한다.** `resolveRunMode` 는 휴장일 달력을 보지 않으므로, 평일 휴장일에도 08:00~20:02 는 tiered 로 3분마다 돈다(top_movers 가 갱신되지 않으면 inserted≈0 호출이 생김). 휴장일 반영은 별도 작업.
- **server `NAVER_DAILY_BUDGET`(24,500)은 변경하지 않았다.** server 새로고침 경로는 같은 `naver_search_news` 카운터를 공유하지만 자체 가드는 24,500 그대로다. deploy-news-sync.sh 의 `NAVER_DAILY_BUDGET=24500` 도 그대로이며, news-sync 워커는 이를 읽지 않는다.
- **429 본문 코드 형태는 [ASSUMED]** 이다. 일일 한도 = errorCode `010` / "Query limit exceeded", 초당 = `012` / "Rate limit exceeded" 로 가정했다. 공식 문서는 "429 = 일 허용량 초과" 만 적는다. 모든 429 warn/error 로그가 원문 errorCode/errorMessage 를 남기므로, **첫 실제 발생 로그로 형태를 확인할 것.** 미확인 본문은 초당 제한으로 취급하고 연속 5종목 휴리스틱이 보완한다.
- 22:00 offhours 전체 실행(mode=full)은 이 세션에서 **미관측** (배포 12:51 KST).
- `market-close` 20:00 예약 실행 · weekend 실행도 미관측 (스케줄 식 · ENABLED 는 smoke 로 확인).

## Deviations from Plan

### Auto-fixed / 조정

1. **[Rule 2 - 잠금 강화] stockBucket 대표 코드가 모두 버킷 0**
   - 발견: Task 1. 계획이 지정한 `005930` · `000660` · `035720` 실측값이 셋 다 0 이었다. 이 셋만 잠그면 버킷 1·2 로의 재배치를 감지하지 못한다.
   - 조치: 세 코드는 그대로 잠그고, `005380`(=1)과 `035420`(=2)을 추가로 잠갔다.
   - 커밋: `5f86f9c`

2. **[Rule 3 - 타입 정합] `tests/naver.test.ts` 설정 fixture 갱신** (계획 files 목록 밖)
   - 조치: `NewsSyncConfig` 에 `newsSyncMode` 가 필수 필드로 추가됐으므로 fixture 에 `newsSyncMode: "auto"` 를 넣고 budget 을 18750 으로 맞췄다.
   - 커밋: `5f86f9c`

3. **[명세 보완] full 모드 counts 의미**
   - 계획은 full 모드 counts 를 정의하지 않았다.
   - 조치: full 에서도 hot/restTotal 을 실제 분류값으로 채우고 `restSelected = restTotal` 로 했다. 따라서 모든 모드에서 `hot + restSelected = selected`.

4. **[명세 보완] 같은 run 의 두 번째 이후 소진 에러 로그**
   - 계획은 첫 판정 error 로그만 규정했다.
   - 조치: 동시에 떠 있던 종목의 후속 소진 에러는 strike 없이 `log.warn("… run already aborting")` 로만 남겨 ERROR 가 중복되지 않게 했다.

5. **[테스트 추가] `extractNaverError` / `isDailyQuotaExhausted` 단위 테스트**
   - 조치: 계획 behavior 의 searchNews 매핑 5건 외에 순수 함수 2개를 직접 검증하는 테스트를 추가했다(비 JSON 200자 절단 · 숫자 errorCode 등).

6. **[메시지 변경] `NaverBudgetExhaustedError` 기본 메시지**
   - 변경: "Naver daily budget exhausted" → "Naver daily query quota exhausted (HTTP 429[ errorCode=… errorMessage=…])".
   - 영향: 메시지 문자열을 단언하던 기존 테스트는 없었다.

7. **[실행 환경] 보호 브랜치(master) 직접 커밋**
   - 사실: `gsd-tools query git.base-branch --is-protected master` 가 `true` 를 반환했다.
   - 조치: 오케스트레이터 제약("sequential on the main tree, no worktrees")과 이 프로젝트의 quick 관행(main tree 직접 커밋)을 따라 master 에 커밋했다. push 는 하지 않았다.

8. **[상태 파일] STATE.md / ROADMAP 미갱신** — 오케스트레이터 제약(문서 산출물은 오케스트레이터 담당, ROADMAP 금지)에 따름.

인증 게이트 없음. 패키지 설치 없음.

## Known Stubs

없음. 스텁·skip 테스트·미실행 `<verify>` 없음. `pipeline.test.ts` 의 `it.todo` 3건은 이번 작업 이전부터 있던 것이다. WINDOWS 원장 기록 대상 없음.

## Threat Flags

없음. 새 네트워크 엔드포인트·권한 경로·스키마 변경은 없다. `api_usage` 에 새 service 라벨 행이 생기지만, 기존 RLS(service_role 전용)와 기존 `incr_api_usage` grant 범위 안이다(T-h3p-03 accept). 배포 셸에서 비밀 값은 셸 변수로만 다뤘다. echo 하지 않았고 .env 파일도 읽지 않았다.

## Self-Check: PASSED

- FOUND: cadence.ts · cadence.test.ts · schedule.test.ts · targets.ts · config.ts · index.ts · searchNews.ts · apiUsage.ts · classify.ts · deploy-news-sync.sh · smoke-news-sync.sh · CLAUDE.md · .planning/research/STACK.md
- FOUND commits: `5f86f9c` · `deebf82` · `da31cee` · `993c6a7`
- `git rev-list --count 3ce5f81..HEAD` = 4 (measured)
