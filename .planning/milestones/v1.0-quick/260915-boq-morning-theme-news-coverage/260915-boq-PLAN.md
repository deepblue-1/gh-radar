---
phase: quick-260915-boq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/deploy-news-sync.sh
  - scripts/smoke-news-sync.sh
  - workers/home-sync/src/pipeline/tradingDay.ts
  - workers/home-sync/src/pipeline/tradingDay.test.ts
  - workers/home-sync/src/pipeline/loadSurges.ts
  - workers/home-sync/src/pipeline/loadSurges.test.ts
  - workers/home-sync/src/index.ts
  - workers/home-sync/src/index.test.ts
  - workers/home-sync/src/ai/prompt.ts
  - workers/home-sync/src/ai/prompt.test.ts
  - workers/home-sync/src/ai/clusterSurges.ts
autonomous: true
quick_id: 260915-boq
requirements: [BOQ-A, BOQ-B, BOQ-C]

estimate:
  tokens: 150000
  raw_tokens: 150000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "BOQ-A: 평일 KST 08:00~10:30 에는 news-sync 가 3분마다 실행되고, 10:45 와 11:00~15:45 는 15분마다 실행된다. 장중 스케줄러 3개(morning · morning-10h · intraday)의 발화 분(minute)은 서로 겹치지 않는다. offhours(`0 */2 * * *`)는 바뀌지 않는다"
    - "BOQ-A: Naver 일일 호출량 추정치(실측 기반 ≈9.9K/일)가 상한 24,500 아래이며, 사전 체크(budgetBefore + targets > budget)와 페이지 단위 stopAll 가드가 발동하지 않는다 — news-sync 코드 변경 0줄"
    - "BOQ-B: 월요일·연휴 다음날 09:05 슬롯의 뉴스 후보 창이 직전 거래일 15:30 KST 이후 기사를 포함한다 (예: 2026-09-14 월 09:05 → 컷오프 2026-09-11 15:30 KST). 화~금 창은 48h 보다 좁아지지 않는다"
    - "BOQ-B: 뉴스 창 시각 기준이 주입된 now 로 통일되어 테스트가 요일에 따라 흔들리지 않는다"
    - "BOQ-C: 오늘 최신 스냅샷이 없거나 테마가 비어 있으면 전 거래일 마지막 non-empty 테마가 cluster 의 prevThemes 로 전달되고 프롬프트 섹션 라벨이 '(전 거래일 마지막)' 으로 표기된다. 오늘 테마가 있으면 오늘 것이 '(직전 슬롯)' 으로 전달된다"
    - "BOQ-C: carry(hash 재사용)·surges 0 fallback 분기는 전 거래일 조회를 하지 않으며 동작이 변하지 않는다. 오늘 급등 집합 밖 종목코드는 테마 멤버로 새어 들어가지 않는다"
    - "배포된 home-sync(APP_VERSION = 새 HEAD SHA)가 배포 이후 스케줄 슬롯을 에러 없이 완료한다"
  artifacts:
    - path: workers/home-sync/src/pipeline/tradingDay.ts
      provides: "previousTradingDate(dateIso) — 공유 KRX 캘린더(isKrxHoliday) + 주말 스킵"
    - path: workers/home-sync/src/pipeline/loadSurges.ts
      provides: "newsWindowCutoffIso(now) — min(now−48h, 직전 거래일 15:30 KST)"
    - path: workers/home-sync/src/index.ts
      provides: "resolvePrevThemes — 오늘 테마 우선, 비면 전 거래일 마지막 non-empty 테마"
    - path: workers/home-sync/src/ai/prompt.ts
      provides: "PrevThemesSource 타입 + 섹션 라벨 분기"
    - path: scripts/deploy-news-sync.sh
      provides: "NEWS_SCHEDULERS 4항목 (morning · morning-10h · intraday · offhours)"
  key_links:
    - from: workers/home-sync/src/index.ts
      to: workers/home-sync/src/pipeline/loadSurges.ts
      via: "loadSurges(supabase, cfg, { now }) → newsWindowCutoffIso(now) → news_articles.gte('published_at', cutoff)"
    - from: workers/home-sync/src/index.ts
      to: workers/home-sync/src/ai/clusterSurges.ts
      via: "4b 분기: resolvePrevThemes → cluster(surges, cfg, themeHints, themes, source) → formatClusterMessage(..., source)"
    - from: workers/home-sync/src/pipeline/tradingDay.ts
      to: packages/shared/src/krxCalendar.ts
      via: "isKrxHoliday 재사용 (두 번째 캘린더 금지)"
    - from: Cloud Scheduler gh-radar-news-sync-morning / -morning-10h / -intraday
      to: Cloud Run Job gh-radar-news-sync
      via: "OAuth SA gh-radar-scheduler-sa, 동일 JOB_INVOKE_URI"
---

<objective>
아침장 주도 테마 품질 개선 — 사용자 확정 3건(BOQ-A/B/C, 모두 locked).

- BOQ-A: news-sync 를 08:00~10:30 KST 3분 주기로 당겨 급등 직후 기사 수집 지연(9/14 09:05 실측: 뉴스 없는 급등 6건 중 5건이 09:05 이전 발행 · 09:15 이후 수집)을 줄인다.
- BOQ-B: home-sync 뉴스 창을 `min(now − 48h, 직전 거래일 15:30 KST)` 로 바꿔 월요일·연휴 다음날 아침에 전 거래일 저녁 기사(예: 한싹 금 17:48)가 빠지지 않게 한다.
- BOQ-C: 08시대 슬롯은 테마가 비는 일이 잦아 개장 시점 prevThemes 가 비어 있다 → 전 거래일 마지막 테마를 직전 구성 힌트로 이월한다.

Purpose: 트레이더가 개장 직후 급등 종목의 재료·테마를 빠르게 파악(Core Value).
Output: 스케줄러 3개 라이브 적용 + deploy/smoke 스크립트 갱신, home-sync 코드·테스트 변경, home-sync 재배포.

실행 순서: 순차(main tree, worktree 격리 없음). Task 1 을 먼저 하는 이유는 오늘(2026-09-15 화) 10:30 전에 적용하면 당일부터 효과가 있기 때문이다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

## 계획 시점 라이브 실측 (2026-09-15 08:28 KST, 재조사 불필요)

- 스케줄러(asia-northeast3): `gh-radar-news-sync-intraday` `*/15 8-15 * * 1-5` ENABLED · `gh-radar-news-sync-offhours` `0 */2 * * *` ENABLED · home-sync `* 8-19 * * 1-5` + `0-4 20 * * 1-5`.
- news-sync Job: parallelism 1 · tasks 1 · timeout 600s. 최근 40회 실행 시간 **18~43s**(최대 43s = 9/15 08:00 동시 2회), 실패 0.
- 회당 Naver 호출(budgetAfter − budgetBefore): 104~152 (targets 104; 9/15 08:00 은 targets 52). 9/14 하루 누계 ≈4,980 (22:00 기준 4,877).
- **기존 동분 중복**: offhours `0 */2` 가 08:00·10:00·12:00·14:00 에 intraday 와 같은 분에 발화 → 해당 분 실행 2회(둘 다 성공, 2번째는 inserted≈0, 호출 ≈+100). offhours 는 locked "변경 없음" 이므로 이번에 고치지 않는다 — SUMMARY 에 관찰로만 기록.
- 겹침 안전성(코드 확인): `workers/news-sync/src/pipeline/upsert.ts` upsert `onConflict: "stock_code,url", ignoreDuplicates: true` · `apiUsage.ts` `incr_api_usage` atomic RPC · `index.ts` 사전 체크 `budgetBefore + targets.length > cfg.naverDailyBudget` → skip.
- home-sync 라이브 env: HOME_SYNC_SURGE_THRESHOLD=15 · NEWS_PER_STOCK=5 · SURGE_MAX=120 · LOG_LEVEL=info = `scripts/deploy-home-sync.sh` 기본값과 동일(배포 default 회귀 없음). 이 스크립트에는 alert policy 단계가 없어 NOTIFICATION_CHANNEL_ID 불필요.
- gcloud active configuration = `gh-radar`, project = gh-radar, docker 29.4 가동 중.
- `@gh-radar/shared` 는 이미 `isKrxHoliday` · `kstDateIso` 를 export(dist 포함) — 이번 변경은 shared 를 수정하지 않으므로 shared 재빌드 불필요.

## 코드 인터페이스 (실행자가 탐색하지 않도록 발췌)

- `workers/home-sync/src/pipeline/loadSurges.ts`: `LoadSurgesOptions { emptyRetries?; retryDelayMs?; now?: Date }` · `kstMidnightIso(now)` · `const NEWS_WINDOW_MS = 48h` (~L70-71) · 뉴스 컷오프 계산 ~L200 (현재 벽시계 기준) · `.gte("published_at", cutoffIso)` ~L208.
- `workers/home-sync/src/index.ts`: `HomeSyncDeps.cluster?: (surges, cfg, themeHints, prevThemes) => Promise<ClusterResult>` · `PrevSnapshotRow { content_hash?; payload? }` · 오늘 최신 스냅샷 조회 ~L243-252 · 4a' surges 0 가드 ~L258-285 · 4a carry `canReusePrevClassification` ~L286-296 · 4b `const prevThemes = prevRow?.payload?.themes ?? []` ~L307 → `cluster(surges, cfg, themeHints, prevThemes)` ~L308. `log = logger.child(...)` (pino).
- `workers/home-sync/src/ai/clusterSurges.ts`: `clusterSurges(surges, cfg, themeHints = new Map(), prevThemes = [])` ~L477 → `formatClusterMessage(surges, themeHints, prevThemes)` ~L493 · `demoteInvalidThemes(raw, surgeCodes)` ~L103-121 (급등 집합 밖 code drop).
- `workers/home-sync/src/ai/prompt.ts`: 시스템 프롬프트 ~L33 "직전 테마 구성(직전 슬롯)이 주어지면 ..." · `formatClusterMessage(surges, themeHints = new Map(), prevThemes = [])` ~L111 · prev 섹션 ~L177-192: 멤버를 `nameByCode.has(s.code)` 로 현재 급등만 렌더, 멤버 0 테마 skip, 헤더 "직전 테마 구성 (직전 슬롯):".
- `workers/home-sync/tests/helpers/supabase-mock.ts`: 같은 테이블은 같은 chain 반환. `lt/gt/gte/order/eq` = mockReturnThis, `limit` = 종결(mockResolvedValue / mockResolvedValueOnce 로 순서 주입).
- `workers/home-sync/src/index.test.ts`: `seedSurgeSupabase()` · `cfg()` · `CLUSTER_PAYLOAD` · `NOW = 2026-07-01T01:30:00Z` (수 10:30 KST → 직전 거래일 2026-06-30).
- 테스트/타입체크 명령(package.json 실측): `pnpm --dir workers/home-sync run test` (vitest run) · `pnpm --dir workers/home-sync run typecheck` (tsc --noEmit). `pnpm --filter` 는 이름 오타 시 exit 0 으로 통과하므로 쓰지 않는다.

## gcloud 인증 (모든 gcloud 명령 공통)

GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json · CLOUDSDK_CORE_PROJECT=gh-radar · (배포 스크립트용) GCP_PROJECT_ID=gh-radar. 자격 증명을 사용자에게 다시 묻지 않는다.

## 커밋 규칙 (이 quick 전용)

한글 메시지 · conventional prefix · Co-Authored-By 줄 넣지 않음 · push 하지 않음. 태스크마다 1커밋.
</context>

<tasks>

<task type="tracer">
  <name>Task 1 (BOQ-A): news-sync 아침장 3분 주기 스케줄러 — 스크립트 갱신 + 라이브 적용 + 발화 확인</name>
  <files>scripts/deploy-news-sync.sh, scripts/smoke-news-sync.sh</files>
  <read_first>
    - scripts/deploy-news-sync.sh (전체 199줄 — 헤더 L4-16, Section 8 L147-184, Section 9 L186-198)
    - scripts/smoke-news-sync.sh L40-65 (INV-3a/3b/3c 스케줄러 단언)
  </read_first>
  <action>
BOQ-A 확정 결정(08:00~10:30 3분 · 이후 15:45 까지 15분 · offhours 불변 · 동분 중복 금지)을 구현한다. news-sync 코드는 수정하지 않는다(겹침 안전성·예산은 context 실측으로 이미 확인).

1) scripts/deploy-news-sync.sh Section 8 의 NEWS_SCHEDULERS 배열을 아래 4항목으로 교체한다. 순서가 중요하다 — 새 아침 잡을 먼저 만들고 기존 intraday 를 나중에 좁혀야 적용 중 공백이 생기지 않는다.
   - "gh-radar-news-sync-morning|*/3 8-9 * * 1-5" (08:00~09:57, 40회)
   - "gh-radar-news-sync-morning-10h|0-30/3,45 10 * * 1-5" (10:00~10:30 3분 11회 + 10:45 1회)
   - "gh-radar-news-sync-intraday|*/15 11-15 * * 1-5" (11:00~15:45, 24회 — 기존 잡 이름 유지, 스케줄만 변경)
   - "gh-radar-news-sync-offhours|0 */2 * * *" (불변)
   세 장중 잡은 시(hour) 범위가 8-9 / 10 / 11-15 로 서로소라 같은 분에 두 번 발화하지 않는다. 기존 update-or-create 루프(describe → update http / create http, --oauth-service-account-email, Asia/Seoul)는 그대로 둔다(이미 idempotent).
   Fallback: gcloud 가 `0-30/3,45` 목록+스텝 식을 거부하면 그 항목을 "gh-radar-news-sync-morning-10h|0-30/3 10 * * 1-5" 와 "gh-radar-news-sync-1045|45 10 * * 1-5" 두 항목으로 나누고(순서는 intraday 앞), 스크립트·smoke·SUMMARY 에 실제 채택안을 반영한다.

2) 같은 파일 헤더 주석(L12-13)과 Section 9 echo 의 스케줄러 목록을 새 구성으로 갱신한다. Section 8 머리 주석에 아래를 짧게 기록한다:
   - 운영 근거(CLAUDE.md 크롤링 5원칙 대비): 2026-09-15 사용자 명시 승인(quick-260915-boq). 호출량은 사용자 수가 아니라 고정 대상 집합(top_movers 상위 100 + watchlists)에 비례하는 서버측 배치이며, 사용자 클릭 on-demand 호출은 없다.
   - 예산 실측: 회당 104~152 호출(targets 104), 장중 평일 실행 32회 → 76회(+44), 일 추정 ≈9.9K (offhours 12회 포함) < NEWS_SYNC_DAILY_BUDGET 24,500. 실행 시간 18~43s(3분 주기 대비 충분), 겹쳐도 upsert ignoreDuplicates + atomic incr_api_usage 로 안전.
   - offhours `0 */2` 가 08:00·10:00·12:00·14:00 에 장중 잡과 동분 발화하는 기존 중복은 알고 남겨 둔다(offhours 불변 결정).

3) scripts/smoke-news-sync.sh: INV-3a 기대값을 `*/15 11-15 * * 1-5` 로 바꾸고 주석 제목도 맞춘다. INV-3d(morning `*/3 8-9 * * 1-5`)·INV-3e(morning-10h `0-30/3,45 10 * * 1-5`, fallback 채택 시 해당 식들) 스케줄 단언을 INV-3a 와 같은 bash -c 패턴으로 추가한다. INV-3c 는 네 잡(morning · morning-10h · intraday · offhours) 모두 ENABLED 를 확인하도록 확장한다. smoke 스크립트 자체는 실행하지 않는다(INV-1 이 Job 을 추가 실행해 Naver 호출을 소모한다).

4) 라이브 적용(이미지 재빌드 없음 — deploy 스크립트 전체를 돌리지 말 것): 인증 env 를 export 한 셸 한 번에서 EXPECTED_PROJECT=gh-radar, REGION=asia-northeast3, JOB=gh-radar-news-sync, JOB_INVOKE_URI 와 SCHED_SA 를 Section 8 과 같은 형식으로 정의하고, 새 배열의 **장중 3항목만**(offhours 제외) 같은 update-or-create 루프로 적용한다. 순서: morning → morning-10h → intraday.

5) 확인: `gcloud scheduler jobs list --location=asia-northeast3` 로 news-sync 잡 4개의 schedule/state 를 확인한다. 현재 KST 가 평일 08:00~10:27 이면 `gcloud scheduler jobs describe gh-radar-news-sync-morning --location=asia-northeast3 --format='value(scheduleTime)'`(10시대면 morning-10h)이 3분 이내 시각인지 보고, 그 시각이 지난 뒤 `gcloud run jobs executions list --job gh-radar-news-sync --region asia-northeast3 --limit 5` 에 15의 배수가 아닌 분(예: 08:51)에 생성된 실행이 succeeded 로 찍혔는지 확인한다(대기는 foreground sleep 대신 Monitor/폴링 사용). 10:30 이 지났으면 scheduleTime 확인만 하고 "다음 평일 08:00 첫 발화 미관측" 을 SUMMARY 에 정직하게 적는다.

6) `bash -n` 통과 후 커밋: `chore(news-sync): 아침장 뉴스 수집 08:00~10:30 3분 주기로 스케줄러 분리`
  </action>
  <verify>
    <automated>bash -n /Users/alex/repos/gh-radar/scripts/deploy-news-sync.sh && bash -n /Users/alex/repos/gh-radar/scripts/smoke-news-sync.sh && GOOGLE_APPLICATION_CREDENTIALS=$HOME/.config/gcloud/gh-radar-deployer.json CLOUDSDK_CORE_PROJECT=gh-radar gcloud scheduler jobs list --location=asia-northeast3 --format='value(name.basename(),schedule,state)' | grep news-sync</automated>
  </verify>
  <acceptance_criteria>
    - 위 list 출력에 `gh-radar-news-sync-morning	*/3 8-9 * * 1-5	ENABLED`, `gh-radar-news-sync-morning-10h	0-30/3,45 10 * * 1-5	ENABLED`(또는 fallback 2잡), `gh-radar-news-sync-intraday	*/15 11-15 * * 1-5	ENABLED`, `gh-radar-news-sync-offhours	0 */2 * * *	ENABLED` 가 모두 있고 news-sync 잡은 그 외에 없다.
    - `grep -c 'gh-radar-news-sync-morning' scripts/deploy-news-sync.sh` ≥ 2 (배열 + 헤더/echo) 이고 `grep -n '\*/15 11-15 \* \* 1-5' scripts/smoke-news-sync.sh` 가 1줄 이상.
    - 평일 창 안에서 적용했다면 executions list 에 15의 배수가 아닌 분에 생성된 succeeded 실행이 1건 이상.
  </acceptance_criteria>
  <done>스크립트 2개가 새 구성과 일치하고, 라이브 스케줄러 4개가 ENABLED 이며, (창 안이면) 3분 슬롯 실행이 성공으로 관측되고, 커밋 1개가 남았다.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 (BOQ-B): 뉴스 창을 직전 거래일 마감(15:30 KST) 이후까지 보장 — 주입 now 기준</name>
  <files>workers/home-sync/src/pipeline/tradingDay.ts, workers/home-sync/src/pipeline/tradingDay.test.ts, workers/home-sync/src/pipeline/loadSurges.ts, workers/home-sync/src/pipeline/loadSurges.test.ts</files>
  <read_first>
    - workers/home-sync/src/pipeline/loadSurges.ts (전체 244줄 — 헤더 주석 L4-22, NEWS_WINDOW_MS L70-71, loadSurges 본문 L126-243)
    - workers/home-sync/src/pipeline/loadSurges.test.ts L1-75 (setQuotes/cfg 헬퍼) 와 L282-305 ("48h 창 필터" 테스트)
    - packages/shared/src/krxCalendar.ts (isKrxHoliday · kstDateIso · 주말 미포함 주석)
  </read_first>
  <behavior>
    - previousTradingDate("2026-09-15") → "2026-09-14" (화 → 월)
    - previousTradingDate("2026-09-14") → "2026-09-11" (월 → 금)
    - previousTradingDate("2026-09-28") → "2026-09-23" (추석 9/24·9/25 + 주말 건너뜀)
    - previousTradingDate("2026-08-18") → "2026-08-14" (8/17 대체공휴일 + 주말)
    - previousTradingDate("2026-10-06") → "2026-10-02" (10/5 대체공휴일 + 주말)
    - previousTradingDate("2026-10-12") → "2026-10-08" (10/9 한글날 금 + 주말)
    - newsWindowCutoffIso(2026-09-14T09:05+09:00 월) → "2026-09-11T06:30:00.000Z" (금 15:30 KST, 48h 보다 이름)
    - newsWindowCutoffIso(2026-09-15T09:05+09:00 화) → "2026-09-13T00:05:00.000Z" (48h 가 더 이름)
    - newsWindowCutoffIso(2026-09-28T09:05+09:00 연휴 다음날) → "2026-09-23T06:30:00.000Z"
    - newsWindowCutoffIso(2026-10-06T09:05+09:00 연휴 다음날 화) → "2026-10-02T06:30:00.000Z"
    - loadSurges(..., { now: 2026-09-14T09:05+09:00 }) 의 news_articles gte 인자 = ["published_at", "2026-09-11T06:30:00.000Z"]
  </behavior>
  <action>
BOQ-B 확정 규칙 `cutoff = min(now − 48h, 직전 거래일 15:30 KST)` 을 구현한다(두 시각 중 이른 쪽). 화~금 커버리지는 절대 좁아지지 않는다.

1) RED — 새 파일 workers/home-sync/src/pipeline/tradingDay.test.ts 에 behavior 의 previousTradingDate 6케이스를 쓰고, loadSurges.test.ts 에 newsWindowCutoffIso 4케이스와 주입 now 기반 loadSurges gte 인자 단언을 추가한다. 기존 "48h 창 필터" 테스트(L282-305)는 벽시계 ±5s 범위로 단언하므로 규칙 변경 후 월요일에 실행하면 깨진다 → 주입 now(수요일 2026-09-16T09:05+09:00, 기대 "2026-09-14T00:05:00.000Z")로 정확값을 단언하도록 교체한다. 실패 확인 후 `test(home-sync): ...` 커밋은 하지 않고 GREEN 과 함께 한 커밋으로 묶는다(quick 1태스크 1커밋).

2) GREEN — workers/home-sync/src/pipeline/tradingDay.ts 를 만든다: `export function previousTradingDate(dateIso: string): string`. `${dateIso}T00:00:00Z` 를 UTC 로 파싱해 하루씩 뒤로 가며 getUTCDay 가 0(일)·6(토)이거나 `@gh-radar/shared` 의 `isKrxHoliday` 가 true 인 날을 건너뛰고 첫 거래일을 `YYYY-MM-DD` 로 반환한다. 루프는 최대 30일로 막고 초과 시 Error 를 던진다(방어). 파일 주석: 휴장일은 공유 캘린더를 재사용(두 번째 캘린더 금지), 공유 캘린더가 주말을 일부러 빼 두었으므로(스케줄러 cron 이 커버) 이 함수는 주말을 직접 건너뛴다, seed 만료 구간은 주말만 건너뜀(index.ts 가 stale 경고를 이미 냄).

3) workers/home-sync/src/pipeline/loadSurges.ts:
   - `export function newsWindowCutoffIso(now: Date): string` 추가 — `kstDateIso(now)`(shared)로 오늘 KST 날짜 → `previousTradingDate` → `Date.parse(`${prev}T15:30:00+09:00`)` 와 `now.getTime() − NEWS_WINDOW_MS` 중 작은 값을 ISO 로 반환.
   - loadSurges 본문 첫머리에서 `const now = opts.now ?? new Date()` 를 한 번 계산해 freshnessCutoff(kstMidnightIso)와 뉴스 컷오프 둘 다 이 now 를 쓰게 한다. 뉴스 컷오프 줄(~L200)은 `newsWindowCutoffIso(now)` 호출로 바꾼다 — 벽시계 직접 읽기를 남기지 않는다(index.ts 는 이미 `now` 를 넘기므로 호출부 변경 없음).
   - NEWS_WINDOW_MS 주석과 헤더 주석 3번 항목을 "최근 48h, 단 직전 거래일 15:30 KST 가 더 이르면 그 시각부터(월요일·연휴 다음날 전 거래일 저녁 기사 보장, quick-260915-boq)" 로 갱신한다. NEWS_CANDIDATES_PER_STOCK 주석의 "48h 창" 표현도 같은 뜻으로 맞춘다.

4) 검증 후 커밋: `feat(home-sync): 뉴스 창을 직전 거래일 15:30 이후까지 보장 — 월요일·연휴 다음날 전일 저녁 기사 누락 수정`
  </action>
  <verify>
    <automated>pnpm --dir /Users/alex/repos/gh-radar/workers/home-sync exec vitest run src/pipeline/tradingDay.test.ts src/pipeline/loadSurges.test.ts && pnpm --dir /Users/alex/repos/gh-radar/workers/home-sync run typecheck</automated>
  </verify>
  <acceptance_criteria>
    - vitest 출력에 tradingDay.test.ts 와 loadSurges.test.ts 가 모두 passed, failed 0.
    - `grep -n "newsWindowCutoffIso(now)" workers/home-sync/src/pipeline/loadSurges.ts` 1줄 이상.
    - `grep -n "isKrxHoliday" workers/home-sync/src/pipeline/tradingDay.ts` 1줄 이상이고 `grep -rn "KRX_HOLIDAYS\b" workers/home-sync/src --include='*.ts' | grep -v '\.test\.'` 결과에 새 휴장일 배열 정의가 없다(공유 캘린더만 사용).
    - typecheck exit 0.
  </acceptance_criteria>
  <done>월요일·연휴 다음날 컷오프가 직전 거래일 15:30 KST, 화~금은 48h 로 계산되고, 뉴스 창이 주입 now 를 따르며, 관련 테스트가 요일 무관하게 통과하고, 커밋 1개가 남았다.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3 (BOQ-C): 개장 초 전 거래일 테마를 prevThemes 로 이월 + 라벨 정정 + 전체 게이트 + home-sync 배포</name>
  <files>workers/home-sync/src/index.ts, workers/home-sync/src/index.test.ts, workers/home-sync/src/ai/prompt.ts, workers/home-sync/src/ai/prompt.test.ts, workers/home-sync/src/ai/clusterSurges.ts</files>
  <read_first>
    - workers/home-sync/src/index.ts (전체 369줄 — HomeSyncDeps L46-59, 오늘 최신 스냅샷 L242-252, 분기 L258-317)
    - workers/home-sync/src/index.test.ts L1-94 (헬퍼) · L225-276 (prevThemes 배선 테스트) · L278-380 (hash-match carry 테스트)
    - workers/home-sync/src/ai/prompt.ts L25-40 (시스템 프롬프트 규칙) · L100-195 (formatClusterMessage)
    - workers/home-sync/src/ai/prompt.test.ts L278-305 (직전 테마 섹션 테스트)
    - workers/home-sync/src/ai/clusterSurges.ts L100-121 (demoteInvalidThemes) · L477-500 (clusterSurges 시그니처)
  </read_first>
  <behavior>
    - 오늘 최신 행 payload.themes = [] (singles 만) + hash 불일치 → 전 거래일 조회 결과 themes 가 cluster 4번째 인자, 5번째 인자 "prevTradingDay"
    - 오늘 행 없음 → 동일하게 전 거래일 themes + "prevTradingDay"
    - 전 거래일 조회 필터: lt("trade_date", "2026-07-01") · gte("trade_date", "2026-06-30") · gt("theme_count", 0) (NOW = 2026-07-01 10:30 KST)
    - 오늘 최신 행 themes non-empty → 오늘 themes + "slot", home_theme_snapshots.lt 호출 0
    - 전 거래일 조회 error → cluster 4번째 인자 [], 5번째 "slot", upsert 는 정상 호출(cycle 실패 안 함)
    - hash-match carry 분기 → home_theme_snapshots.lt 호출 0 (carry 무영향)
    - formatClusterMessage(surges, hints, prevThemes, "prevTradingDay") → "직전 테마 구성 (전 거래일 마지막):" 포함, "(직전 슬롯)" 미포함, 오늘 급등 밖 종목코드는 메시지에 없음
    - formatClusterMessage 4번째 인자 생략 → 기존 "직전 테마 구성 (직전 슬롯):" 그대로
  </behavior>
  <action>
BOQ-C 확정 결정: 오늘 최신 스냅샷이 없거나 테마가 비면 전 거래일 마지막 non-empty 스냅샷 테마를 prevThemes 로 넘긴다. 바뀌는 것은 프롬프트 힌트뿐이고 carry/hash 재사용(`canReusePrevClassification`)과 surges 0 fallback 은 건드리지 않는다.

1) RED — behavior 의 index.test.ts 6케이스를 새 describe "runHomeSyncCycle (전 거래일 테마 이월, quick-260915-boq)" 로, prompt.test.ts 2케이스를 기존 "직전 테마 구성 섹션" describe 에 추가한다. home_theme_snapshots chain 의 `limit` 은 호출 순서가 (1) 오늘 최신 → (2) 전 거래일 이므로 `mockResolvedValueOnce` 두 번으로 주입한다. 전 거래일 payload 픽스처는 오늘 급등(005930/000660/347700) 중 2종목 + 급등 밖 코드 1개를 섞은 테마로 만든다.

2) GREEN — workers/home-sync/src/ai/prompt.ts: `export type PrevThemesSource = "slot" | "prevTradingDay"` 추가. formatClusterMessage 에 4번째 인자 `prevThemesSource: PrevThemesSource = "slot"` 추가, 섹션 헤더를 slot 이면 기존 "직전 테마 구성 (직전 슬롯):", prevTradingDay 면 "직전 테마 구성 (전 거래일 마지막):" 로 분기. 멤버 필터(현재 급등만 렌더·멤버 0 테마 skip)는 그대로 둔다. 시스템 프롬프트 L33 의 괄호만 "(직전 슬롯 또는 전 거래일 마지막)" 으로 바꾼다 — 전 거래일 테마를 "직전 슬롯" 이라 부르면 모델 입력이 사실과 달라지므로 정확성 목적의 최소 수정이다(규칙 문장 나머지는 유지). JSDoc 의 prevThemes 설명에 source 를 한 줄 추가한다.

3) workers/home-sync/src/ai/clusterSurges.ts: clusterSurges 에 5번째 인자 `prevThemesSource: PrevThemesSource = "slot"` 을 추가해 formatClusterMessage 로 그대로 전달한다. 누수 확인(코드 변경 없음): 급등 밖 code 는 prompt 렌더 단계에서 빠지고, Claude 가 그 코드를 돌려줘도 demoteInvalidThemes 가 surgeCodes 밖을 drop 한다 — 이 사실을 prevThemes 주석 한 줄에 적는다.

4) workers/home-sync/src/index.ts:
   - HomeSyncDeps.cluster 타입에 5번째 인자 `prevThemesSource: PrevThemesSource` 추가.
   - `export async function resolvePrevThemes(supabase, prevRow: PrevSnapshotRow | null, tradeDate: string, log): Promise<{ themes: HomeSurgeTheme[]; source: PrevThemesSource }>` 추가 (log 는 pino Logger 타입).
     · prevRow?.payload?.themes 가 non-empty → `{ themes, source: "slot" }` (추가 쿼리 없음).
     · 아니면 home_theme_snapshots 에서 `select("payload")` · `lt("trade_date", tradeDate)` · `gte("trade_date", previousTradingDate(tradeDate))` · `gt("theme_count", 0)` · `order("trade_date", desc)` · `order("captured_at", desc)` · `limit(1)`. gte 로 전 거래일에 한정하는 이유: 라벨 "(전 거래일 마지막)" 이 사실이도록, 그리고 며칠 묵은 테마가 힌트로 들어오지 않도록. order 에 trade_date 를 앞세운 것은 PK(trade_date, captured_at) 역방향 스캔을 쓰기 위함이며 의미는 captured_at desc 와 같다.
     · error → `log.warn({ err: error, tradeDate }, "전 거래일 테마 조회 실패 — prevThemes 없이 분류(힌트만 영향)")` 후 `{ themes: [], source: "slot" }` (무로그 fail-safe 금지, cycle 은 계속).
     · 행의 payload.themes non-empty → `log.info({ themeCount }, "오늘 테마 없음 — 전 거래일 마지막 테마를 prevThemes 로 이월")` 후 `{ themes, source: "prevTradingDay" }`. 없으면 `{ themes: [], source: "slot" }`.
   - 4b 분기(~L305-308)만 수정: 기존 prevThemes 한 줄을 resolvePrevThemes 호출로 바꾸고 `cluster(surges, cfg, themeHints, themes, source)` 로 호출한다. 주석을 quick-260915-boq 근거로 갱신. 4a'·4a 분기와 상단 오늘 최신 조회는 수정하지 않는다. previousTradingDate 는 Task 2 의 ./pipeline/tradingDay 에서 import.

5) 전체 게이트: `pnpm --dir workers/home-sync run typecheck` 와 `pnpm --dir workers/home-sync run test`(전 스위트) 모두 exit 0. 통과 후 커밋: `feat(home-sync): 개장 초 오늘 테마가 비면 전 거래일 마지막 테마를 직전 구성 힌트로 이월`

6) 배포(커밋 후 — 스크립트가 HEAD SHA 를 APP_VERSION 으로 쓰므로 반드시 커밋 뒤): 인증 env + GCP_PROJECT_ID=gh-radar 를 export 하고, SUPABASE_URL 은 `gcloud run jobs describe gh-radar-home-sync --region asia-northeast3 --format=json` 의 컨테이너 env 에서 셸 변수로만 추출한다(값을 echo/출력하지 않음, 시크릿 env 는 읽지 않음). HOME_SYNC_* 는 넘기지 않는다(스크립트 기본값 15/5/120 = 라이브 실측값). `bash scripts/deploy-home-sync.sh` 실행 → "✅ deploy-home-sync.sh complete" 확인. smoke-home-sync.sh 는 돌리지 않는다(매분 스케줄 실행이 곧 검증이며 추가 Claude 호출을 만들지 않기 위함).

7) 배포 확인: 배포 완료 후 다음 1~2 슬롯이 지나면 `gcloud run jobs executions list --job gh-radar-home-sync --region asia-northeast3 --limit 5` 에서 배포 이후 생성 실행이 succeeded 인지, `gcloud logging read` 로 `jsonPayload.msg="home-sync cycle complete"` AND `jsonPayload.version="<새 SHA>"` 가 1건 이상이고 같은 version 의 severity>=ERROR 가 0건인지 확인한다. 로그에 "전 거래일 마지막 테마를 prevThemes 로 이월" 이 찍혔는지도 기록한다(오늘 08시대 테마가 이미 non-empty 면 안 찍히는 것이 정상 — 그대로 적는다). 배포 시각이 20:05 이후나 휴장일이면 다음 거래일 첫 슬롯 확인을 미관측으로 기록한다.

8) SUMMARY 에 기록: Task 1 실측(실행 시간·회당 호출·일 예산 추정·offhours 동분 중복 관찰·fallback 채택 여부), 새 SHA, 배포 후 슬롯 결과. push 하지 않는다.
  </action>
  <verify>
    <automated>pnpm --dir /Users/alex/repos/gh-radar/workers/home-sync run typecheck && pnpm --dir /Users/alex/repos/gh-radar/workers/home-sync run test</automated>
  </verify>
  <acceptance_criteria>
    - home-sync vitest 전 스위트 passed, failed 0 · typecheck exit 0.
    - `grep -n "resolvePrevThemes" workers/home-sync/src/index.ts` 2줄 이상(정의 + 4b 호출).
    - `grep -n "전 거래일 마지막" workers/home-sync/src/ai/prompt.ts` 2줄 이상(시스템 프롬프트 + 섹션 헤더).
    - 배포 후 `gcloud run jobs describe gh-radar-home-sync --region asia-northeast3 --format='value(spec.template.spec.template.spec.containers[0].image)'` 가 새 HEAD 짧은 SHA 로 끝난다.
    - 배포 이후 생성된 home-sync 실행 1건 이상 succeeded, 새 version 의 "home-sync cycle complete" 로그 1건 이상, 같은 version ERROR 0건 (시장 시간 외 배포면 미관측으로 기록).
  </acceptance_criteria>
  <done>오늘 테마가 비면 전 거래일 마지막 테마가 올바른 라벨로 힌트 전달되고, carry/empty 분기는 불변이며, 전 스위트·typecheck 통과, 커밋 1개, home-sync 새 이미지가 라이브에서 슬롯을 정상 처리한다.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Cloud Scheduler → Cloud Run Job | OAuth SA(gh-radar-scheduler-sa) 가 Job 리소스 단위 run.invoker 로 실행 트리거 |
| news-sync → Naver Search API | 외부 API, 일일 호출 상한 24,500 · 이용약관/CLAUDE.md 크롤링 원칙 적용 |
| home-sync → Supabase (service role) | news_articles / home_theme_snapshots 읽기·쓰기 |
| home-sync → Anthropic | DB 에서 온 뉴스 스니펫·전 거래일 테마명이 프롬프트에 들어감 |
| 실행자 셸 → 라이브 Cloud Run env | 배포용 SUPABASE_URL 추출 시 env 노출 가능성 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-boq-01 | Denial of Service | news-sync 호출 예산 (3분 주기) | medium | mitigate | 실측 회당 104~152 호출 × 평일 88회 ≈9.9K < 24,500. 기존 사전 체크(budgetBefore + targets > budget → skip)와 incr_api_usage atomic + 페이지 단위 stopAll 가드 유지. Task 1 주석에 수치 기록 |
| T-boq-02 | Repudiation | CLAUDE.md 크롤링 5원칙 대비 장중 폴링 빈도 증가 | medium | accept | 2026-09-15 사용자 명시 승인. 호출량은 고정 대상 집합에 비례(사용자 수 무관)하는 서버측 배치, on-demand 없음. 근거를 deploy-news-sync.sh 주석에 기록 |
| T-boq-03 | Tampering | 동분 중복 실행(offhours 겹침 · 43s 이상 장기 실행 겹침) | low | mitigate | upsert ON CONFLICT (stock_code,url) DO NOTHING · atomic 카운터로 데이터·예산 무결성 유지. 장중 잡 3개는 시 범위 서로소로 동분 발화 없음 |
| T-boq-04 | Tampering | 전 거래일 테마명/멤버가 프롬프트에 주입 | low | mitigate | 멤버는 현재 급등 코드만 렌더, Claude 응답의 급등 밖 코드는 demoteInvalidThemes 가 drop. 조회는 전 거래일로 한정(gte). 출처는 자사 워커가 쓴 스냅샷 |
| T-boq-05 | Information Disclosure | 배포 시 SUPABASE_URL 추출 | medium | mitigate | 셸 변수로만 담고 출력하지 않음, 시크릿 env(SUPABASE_SERVICE_ROLE_KEY 등)는 읽지 않음 — Secret Manager 참조 유지. 로거 redact 설정 불변 |
| T-boq-06 | Elevation of Privilege | 신규 스케줄러 잡 2개 | low | mitigate | 기존과 동일 SA · 동일 JOB_INVOKE_URI · OAuth(OIDC 금지) 사용, 새 IAM 바인딩 없음 |
</threat_model>

<verification>
- Task 1: `gcloud scheduler jobs list` 에 news-sync 잡 4개가 새 스케줄·ENABLED, 두 스크립트 `bash -n` 통과, (창 안이면) 3분 슬롯 실행 성공 관측.
- Task 2/3: `pnpm --dir workers/home-sync run typecheck` exit 0 · `pnpm --dir workers/home-sync run test` 전 스위트 passed.
- 배포: home-sync Job 이미지 태그 = 새 HEAD SHA, 배포 이후 실행 succeeded, 새 version 로그 ERROR 0.
- 커밋 3개(한글, Co-Authored-By 없음), push 없음.
</verification>

<success_criteria>
- 평일 08:00~10:30 news-sync 3분 주기가 라이브이며 장중 잡 간 동분 중복이 없다 (BOQ-A).
- 월요일·연휴 다음날 아침 뉴스 창이 직전 거래일 15:30 KST 부터 시작하고 화~금은 48h 유지 (BOQ-B).
- 오늘 테마가 비는 개장 초 슬롯에서 전 거래일 마지막 테마가 올바른 라벨로 Claude 에 전달되고 carry/empty 분기 동작은 불변 (BOQ-C).
- home-sync 새 이미지가 라이브에서 정상 동작.
</success_criteria>

<output>
Create `.planning/quick/260915-boq-morning-theme-news-coverage/260915-boq-SUMMARY.md` when done
</output>
