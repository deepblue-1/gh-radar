---
phase: 41-kis-news-and-disclosure-feed
plan: 02
subsystem: database · infra
tags: [postgres, pgtap, supabase-rpc, cloud-run-job, cloud-scheduler, secret-manager, kis-news]

requires:
  - phase: 41-01
    provides: "표 kis_news · kis_news_stocks · kis_news_targets · kis_news_state(lease_holder · lease_until · feed_at · cleanup_date) · kis_news_written_at_idx"
provides:
  - "표 kis_access_tokens(token_type PK · access_token · expires_at · fetched_at · 서비스롤 전용)"
  - "RPC kis_news_lease_acquire · kis_news_lease_release · kis_news_targets_list · kis_news_stock_meta · kis_news_cleanup · kis_disclosure_kinds · kis_news_ops_stats"
  - "scripts/setup-kis-news-sync-iam.sh · setup-kis-secrets.sh · deploy-kis-news-sync.sh(KIS_SCHEDULERS · --self-test · KIS_NEWS_VPC_EGRESS) · smoke-kis-news-sync.sh · kis-news-report.sh(kinds · stats)"
affects: [41-06, 41-08, 41-09, 41-11, 41-13]

actuals:
  tokens: 17300
  tasks: 2
  commits: 3
plan_head_before: 4f55f5e1adcef51a9a58ec26b64944079fd3e2a3
plan_head_after: 2f520261bdeccf3fc3f5363d3e1f68b03f832cda

tech-stack:
  added: []
  patterns:
    - "장기 실행 Job 중복 방지 = kis_news_state 1행 조건부 UPDATE … RETURNING 임대(비었거나 · 만료 · 내 것)"
    - "목록 · 마스터 RPC 는 jsonb 단일 값 — db-max-rows(1000) 절단 · 왕복 회피"
    - "배포 스크립트 --self-test 는 들여쓴 플래그 + 줄 잇기 꼴만 세서 자기 검사 줄과 헷갈리지 않는다"
    - "보고 스크립트의 서비스롤 키는 curl -H @- (stdin) 로만 — 명령줄 · 프로세스 목록 노출 0"

key-files:
  created:
    - supabase/migrations/20261112200000_kis_news_collector.sql
    - supabase/tests/kis_news_collector.test.sql
    - scripts/setup-kis-news-sync-iam.sh
    - scripts/setup-kis-secrets.sh
    - scripts/deploy-kis-news-sync.sh
    - scripts/smoke-kis-news-sync.sh
    - scripts/kis-news-report.sh
  modified: []

key-decisions:
  - "대상 목록의 「최신 scan」 = ranked_at 이 가장 늦은 행의 scan_id — uuid 는 시간순이 아니라 news-sync 의 scan_id 내림차순은 「최신」 을 보장하지 않는다"
  - "등록 상한(p_registered_cap)은 종목 마스터에 있는 코드만 센다 — 마스터 밖 코드가 상한 자리를 먹지 않게"
  - "정리의 등록 행 삭제 조건 = 조회도 수집도 하루 넘게 없음(greatest) — 계속 수집 중인 종목의 collectedAt 이 null 로 보이지 않게"
  - "공시 종류 이름은 연결 종목 중 제목에 들어 있는 가장 긴 이름 뒤 문자열 — 「첫 연결 종목」 대신(연결 순서가 의미 없음)"
  - "운영 수치 지연은 소수 1자리 반올림 · by_via 는 경로별 글 수(distinct srno)"

patterns-established:
  - "임대 RPC: p_holder 빈 값 · TTL < 1 은 22023 예외"
  - "비밀 주입 스크립트 출력은 OK · SKIP · ERROR 줄뿐 — 값 · 길이 · 앞뒤 글자 없음"

requirements-completed: [SC-1, SC-4, SC-5, SC-7]

coverage:
  - id: D1
    description: "수집기 임대 — 획득 · 거절 · 연장 · 만료 뒤 넘겨받기 · 주인만 해제 · 잘못된 인자 예외"
    requirement: SC-1
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/kis_news_collector.test.sql (L1 ~ L13)"
        status: pass
    human_judgment: false
  - id: D2
    description: "대상 목록 · 종목 정보 RPC — 급등 ∪ 관심 ∪ 최근 등록(상한) · 마스터 밖 제외 · 한 줄 여러 사유 · 수집 전 먼저 · 옛 scan 제외"
    requirement: SC-1
    verification:
      - kind: integration
        ref: "supabase/tests/kis_news_collector.test.sql (T1 ~ T11 · M1 ~ M3)"
        status: pass
    human_judgment: false
  - id: D3
    description: "정리 RPC — 90일 글 + 연결 삭제 · 하루 넘게 조회도 수집도 없는 등록 행 삭제 · cleanup_date"
    requirement: SC-1
    verification:
      - kind: integration
        ref: "supabase/tests/kis_news_collector.test.sql (C1 ~ C7)"
        status: pass
    human_judgment: false
  - id: D4
    description: "공시 종류 · 운영 수치 RPC(D-10 · SC-4 · SC-7)"
    requirement: SC-7
    verification:
      - kind: integration
        ref: "supabase/tests/kis_news_collector.test.sql (K1 ~ K11 · S1 ~ S13)"
        status: pass
    human_judgment: false
  - id: D5
    description: "권한 — 7개 RPC anon · authenticated EXECUTE 불가 · service_role 가능 · SECURITY INVOKER · kis_access_tokens RLS"
    requirement: SC-5
    verification:
      - kind: integration
        ref: "supabase/tests/kis_news_collector.test.sql (P 26건)"
        status: pass
    human_judgment: false
  - id: D6
    description: "운영 스크립트 5개 — 문법 · 실행 권한 · deploy --self-test · RPS 상한 거부 · 비밀 스크립트 로컬 검증 경로 · 보고 표 출력"
    requirement: SC-4
    verification:
      - kind: other
        ref: "Task 2 <automated> 묶음(bash -n · test -x · --self-test · set -x 없음 · 리터럴) — OPS 항목 전부 통과"
        status: pass
    human_judgment: false
  - id: D7
    description: "실제 GCP 배포(IAM · 비밀 · Job · Scheduler · probe 스모크) 동작"
    verification: []
    human_judgment: true
    rationale: "이 플랜은 스크립트를 쓰기만 한다 — 원격 실행은 41-09(메인 세션 · 사용자 `!`)"

duration: 9min
completed: 2026-11-11
status: complete
---

# Phase 41 Plan 02: 수집기 받침(DB RPC 7 + 운영 스크립트 5) Summary

**수집기가 부를 임대 · 대상 목록 · 종목 정보 · 정리 RPC 와 사용자 확인용 공시 종류 · 운영 수치 RPC 를 서비스롤 전용으로 잠그고(pgTAP 84/84), 41-09 가 그대로 돌릴 IAM · 비밀 주입(사용자 `!` · 비출력) · Job + Scheduler 3 배포(14h · retries 0 · self-test) · probe 스모크 · kinds/stats 보고 스크립트를 실행 없이 커밋했다.**

## Performance

- **Duration:** 약 9분
- **Started:** 2026-11-11T15:03:03Z
- **Completed:** 2026-11-11T15:11:52Z
- **Tasks:** 2 (TDD 1 · auto 1)
- **Files modified:** 7 (생성 7)

## Accomplishments

- 마이그레이션 `20261112200000_kis_news_collector.sql` — 표 `kis_access_tokens`(RLS · 정책 0 · 권한 4줄) + RPC 7개(SECURITY INVOKER · search_path 고정 · 함수 권한 3줄 · COMMENT)
- pgTAP `kis_news_collector.test.sql` 84건 전부 ok · 41-01 `kis_news.test.sql` 61건 회귀 0
- 운영 스크립트 5개 — 문법 · 실행 권한 · `--self-test` OK · `KIS_NEWS_MAX_RPS` 0/16 거부(GCP 접촉 전) · 비밀 스크립트 입력 검증(파일 없음 · 644 · 짧은 값 · 공백 · 줄 없음) · 보고 표 출력(로컬 `file://` 가짜 응답으로 확인)

## 계약(뒤 플랜이 읽는 것)

**최종 마이그레이션 이름:** `supabase/migrations/20261112200000_kis_news_collector.sql` (계획한 이름 그대로 — 시작 시 최신은 `20261112100000`)

**RPC 시그니처:**

```sql
public.kis_news_lease_acquire(p_holder text, p_ttl_seconds integer) RETURNS boolean
  -- 비었거나 · 만료(lease_until < now) · 내 것이면 잡고(연장) true · 남의 살아 있는 임대면 false
  -- p_holder 빈 값 · p_ttl_seconds < 1 → SQLSTATE 22023
public.kis_news_lease_release(p_holder text) RETURNS boolean
  -- 주인일 때만 lease_holder · lease_until = NULL 하고 true
public.kis_news_targets_list(p_top integer DEFAULT 100, p_idle_minutes integer DEFAULT 10, p_registered_cap integer DEFAULT 200) RETURNS jsonb
  -- [{code, reasons: ["mover"|"watch"|"registered"…(이 순서)], rank(int|null), last_requested_at, last_collected_at}]
  -- 정렬: last_collected_at ASC NULLS FIRST, last_requested_at DESC NULLS LAST, rank ASC NULLS LAST, code
public.kis_news_stock_meta() RETURNS jsonb
  -- {"<code>": {"n": name, "g": security_group}} (종목 없으면 {})
public.kis_news_cleanup(p_days integer DEFAULT 90, p_target_idle_days integer DEFAULT 1) RETURNS jsonb
  -- {"news_deleted": n, "targets_deleted": n} · kis_news_state.cleanup_date = KST 오늘 · 인자 < 1 → 22023
public.kis_disclosure_kinds(p_days integer DEFAULT 1) RETURNS jsonb
  -- [{provider_code, kind_label, hidden_reason, count, corrected_count, example_title, latest_at}] count 내림차순
public.kis_news_ops_stats(p_days integer DEFAULT 1) RETURNS jsonb
  -- {days, rows_total, by_kind: {news, disclosure}, by_via: {feed, stock}, lag_seconds: {disclosure_p50, disclosure_p90, news_p50}(초 · 소수 1자리 · 없으면 null),
  --  feed_at, targets_active, usage_today, strikes_today}
```

**스크립트 사용법:**

- `GCP_PROJECT_ID=gh-radar bash scripts/setup-kis-news-sync-iam.sh` — SA `gh-radar-kis-news-sync-sa` · Secret 껍데기 `gh-radar-kis-appkey` · `gh-radar-kis-appsecret` · Accessor 3건(멱등 · server SA 제외)
- `bash scripts/setup-kis-secrets.sh` — `${KIS_ENV_FILE:-~/.config/gh-radar/kis.env}`(600/400 · `KIS_APPKEY=` · `KIS_APPSECRET=` 두 줄)를 Secret 새 버전으로(같은 값이면 SKIP) · 출력은 OK/SKIP/ERROR 줄뿐
- `GCP_PROJECT_ID=gh-radar SUPABASE_URL=… [KIS_NEWS_MAX_RPS=5] [KIS_NEWS_VPC_EGRESS=0|1] bash scripts/deploy-kis-news-sync.sh` — 빌드 · push · Job `gh-radar-kis-news-sync` · invoker · Scheduler 3 · 끝에 스모크 / `--self-test` 는 GCP 접촉 0
- `bash scripts/smoke-kis-news-sync.sh [job] [region]` — INV-1 probe 실행 · INV-2 14h/retries 0 · INV-3 Scheduler 3(Asia/Seoul) · INV-4 「probe ok」 로그
- `SUPABASE_URL=… bash scripts/kis-news-report.sh <kinds|stats> [days=1]` — 서비스롤 키는 env 또는 Secret(출력 0)

**사용자 `!` 명령 2줄(41-09 가 그대로 안내):**

```
! GCP_PROJECT_ID=gh-radar bash scripts/setup-kis-news-sync-iam.sh
! bash scripts/setup-kis-secrets.sh
```

(두 번째 전에 사용자가 편집기로 `~/.config/gh-radar/kis.env` 두 줄을 만들고 `chmod 600`.)

## Task Commits

1. **Task 1: 수집기 DB 받침(TDD)** — RED `58611d21` (test) → GREEN `56b3c66d` (feat) · REFACTOR 없음
2. **Task 2: 운영 스크립트 5개** — `2f520261` (feat)

## Files Created/Modified

- `supabase/migrations/20261112200000_kis_news_collector.sql` — 표 1 · RPC 7
- `supabase/tests/kis_news_collector.test.sql` — pgTAP 84
- `scripts/setup-kis-news-sync-iam.sh` — SA · Secret 껍데기 · Accessor
- `scripts/setup-kis-secrets.sh` — 사용자 `!` 비밀 주입(비출력)
- `scripts/deploy-kis-news-sync.sh` — Job + Scheduler 3 · `KIS_SCHEDULERS` · `--self-test` · `KIS_NEWS_VPC_EGRESS`
- `scripts/smoke-kis-news-sync.sh` — probe 스모크 4 INV
- `scripts/kis-news-report.sh` — kinds · stats 표

## Decisions Made

위 frontmatter `key-decisions` 5건. 요점: 「최신 scan」 은 ranked_at 기준 · 등록 상한은 마스터 코드만 · 등록 행 정리는 조회와 수집 둘 다 하루 넘게 없을 때만 · 종류 이름은 제목에 든 가장 긴 연결 종목 이름 뒤 문자열.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 「최신 scan_id」 를 ranked_at 으로 고른다**
- **Found during:** Task 1
- **Issue:** news-sync `targets.ts` 선례는 `scan_id` 내림차순 1개를 「최신」 으로 쓰지만 scan_id 는 `randomUUID()`(v4)라 시간순이 아니다. intraday-sync 가 표를 통째로 다시 쓰는 사이 옛 행이 남으면 옛 scan 을 고를 수 있다.
- **Fix:** `ORDER BY ranked_at DESC LIMIT 1` 의 scan_id. pgTAP 에 옛 scan 행(10분 전 · 순위 2)을 넣어 빠지는 것을 단언(T1).
- **Files modified:** supabase/migrations/20261112200000_kis_news_collector.sql
- **Committed in:** 56b3c66d

**2. [Rule 1 - Bug] 등록 상한 전에 마스터 필터**
- **Issue:** 계획 순서(등록 LIMIT → 마스터 필터)대로면 마스터 밖 코드(오타 · 상폐 · 아무 6자리)가 등록 상한 200 자리를 먹어 실제 종목이 대상에서 밀린다(등록은 인증 없는 조회 경로에서 쓰인다).
- **Fix:** 등록 하위 쿼리 안에서 `stocks` 조인 후 LIMIT. T9 가 이를 잠근다(마스터 밖 3분 전 등록이 있어도 상한 2 에 12분 전 등록이 들어온다).
- **Committed in:** 56b3c66d

**3. [Rule 1 - Bug] 정리의 등록 행 삭제 조건을 「조회도 수집도 없음」 으로**
- **Issue:** 계획식 `coalesce(last_requested_at, last_collected_at, 'epoch')` 는 등록이 오래됐지만 급등 · 관심으로 계속 수집 중인 종목의 행도 지운다 → 다음 수집 때까지 응답 `collectedAt` 이 null(「수집 전」)로 잘못 보인다(D-06).
- **Fix:** `coalesce(greatest(last_requested_at, last_collected_at), 'epoch')`. C5 · C6 이 둘 다 잠근다.
- **Committed in:** 56b3c66d

**4. [Rule 2 - Missing Critical] RPC 인자 검증**
- 임대 `p_holder` 빈 값 · `p_ttl_seconds < 1`, 정리 인자 < 1 → SQLSTATE 22023 예외(L12 · L13). TTL 0 으로 임대가 즉시 만료돼 중복 실행이 나는 것을 막는다.
- **Committed in:** 56b3c66d

**5. [보완 — 계약 변경 아님] 스크립트 세부**
- `deploy-kis-news-sync.sh`: `KIS_NEWS_MAX_RPS` 상한 검사를 `--self-test` 와 실제 배포 경로 둘 다에서(must_haves 「15 초과는 배포 스크립트가 거부」) · `KIS_NEWS_VPC_EGRESS` 는 0/1 만 · 한투 Secret 은 ENABLED 버전 존재까지 확인(값은 읽지 않음) · 장중 재배포 시 도는 실행이 옛 이미지로 남는다는 주의와 취소 명령을 머리 주석에.
- `setup-kis-secrets.sh`: `export ` 앞머리 · 따옴표 한 겹 · CRLF 를 받아 준다(값은 그대로 검증).
- `kis-news-report.sh`: 키를 `curl -H @-`(stdin)로 넘겨 명령줄에 싣지 않는다 · days 1 ~ 90.
- `smoke-kis-news-sync.sh` INV-2: gcloud describe JSON 의 v1(`timeoutSeconds` · `maxRetries`) · v2(`timeout`) 경로 둘 다 읽고, JSON 에서 빠진 maxRetries 는 0 으로 본다(0 인 정수 필드 생략 가능성) — 41-09 첫 실행 때 실제 모양을 한 번 확인하면 좋다.

**Total deviations:** 4 auto-fixed (Rule 1 셋 · Rule 2 하나) + 스크립트 보완
**Impact on plan:** 표 · RPC · 스크립트 · env · Secret 이름과 RPC 시그니처는 Artifacts 표 그대로. 계약 변경 없음.

## TDD Gate Compliance

- RED `58611d21` `test(41-02)` → GREEN `56b3c66d` `feat(41-02)` 순서.
- RED 근거: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/kis_news_collector.test.sql` → exit 1 · `1..84` 뒤 `ERROR: function public.kis_news_lease_acquire(unknown, integer) does not exist`(L1). 픽스처(stocks · top_movers · auth.users · watchlists · kis_news_targets) 적재는 통과했고 대상 함수 부재로 실패 — SQL 은 심볼이 없으면 단언 전에 멈추므로 엄밀한 assertion RED 는 아니다. GREEN 뒤 84/84 로 보완. `gsd_run check tdd-red-evidence` 기록은 만들지 않았다(TAP 가 첫 오류에서 끊겨 분류기 형식이 아님 · 이 플랜은 `type: execute`).

## Issues Encountered

- 하네스가 `bash <스크립트>` 를 복합 명령 안에서 막아 plan `<automated>` 한 줄을 그대로 돌리지 못했다 — 같은 검사를 단계별(chmod · `bash -n` 5개 · `--self-test` · grep 리터럴 · set -x 부재)로 나눠 모두 통과 확인.
- shellcheck 미설치 — 정적 검사는 `bash -n` 까지.

## User Setup Required

41-09 에서: 사용자 `!` 2줄(위) + 메인 세션 `supabase db push`(이 마이그레이션) · `deploy-kis-news-sync.sh`(41-06 · 41-08 의 워커 Dockerfile 이 있어야 빌드된다).

## Next Phase Readiness

- 41-08 수집 루프: 위 RPC 7개 그대로 · `schedule.test.ts` 는 `declare -a KIS_SCHEDULERS=(` 배열을 읽으면 된다(원소 3개 · 주석 없음).
- 41-06 config: 배포 스크립트 env 이름 `KIS_APPKEY` · `KIS_APPSECRET` · `KIS_BASE_URL` · `KIS_NEWS_MAX_RPS` · `KIS_NEWS_DAILY_BUDGET`(200000) · `LOG_LEVEL` · `APP_VERSION` · `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` — `KIS_NEWS_MODE` · `KIS_NEWS_TARGET_CAP` 은 배포에서 넣지 않는다(기본 auto · 450).
- 41-08 probe 모드는 로그 메시지 `msg: "probe ok"` 를 정확히 남겨야 스모크 INV-4 가 통과한다.
- 41-11: `kis-news-report.sh kinds 1` · `stats 1`.

## Self-Check: PASSED

- 생성 파일 7개 존재 · 커밋 `58611d21` · `56b3c66d` · `2f520261` HEAD 조상
- Task 1 수용 기준: GRANT EXECUTE 7줄 · ENABLE ROW LEVEL SECURITY 1 · pgTAP ok 84 · not ok 0 · 41-01 61/61
- Task 2 수용 기준: fast cron grep 1 · slow-weekday/weekend 줄 · `KIS_APPKEY=gh-radar-kis-appkey:latest` 1 · 값 echo 0 · `KIS_NEWS_MODE=probe` 3 · deploy-server.sh 한투 Secret 0 · set -x 0 · 리터럴 2 · SELF-TEST OK
- STATE.md · ROADMAP.md 수정 없음

---
*Phase: 41-kis-news-and-disclosure-feed*
*Completed: 2026-11-11*
