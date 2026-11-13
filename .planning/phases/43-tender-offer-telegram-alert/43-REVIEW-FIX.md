---
phase: 43-tender-offer-telegram-alert
fixed_at: 2026-11-13T02:20:43Z
review_path: .planning/phases/43-tender-offer-telegram-alert/43-REVIEW.md
iteration: 1
findings_in_scope: 28
fixed: 27
skipped: 1
status: partial
---

# Phase 43: 코드 리뷰 수정 보고서

> 두 수정기가 나눠 고쳤다 — part A(ID 01 ~ 49): 워커 본체 · 새 마이그레이션 `20261113300000_dart_alert_fix.sql` / part B(ID 50 ~): 스크립트 · 알림 정책 · 테스트 · 문서. 둘 다 전용 worktree 브랜치 `phase-43-fix` 에서 커밋했다. 범위 `fix_scope: all`(참고 포함). 이 파일이 합본이고 정본이다.

## Fixed Issues


### WR-01: 넣기가 계속 실패하면 모든 알림이 소리 없이 멈춘다 — 경고 로그만 남고 장애 판정을 건너뛰며, 한 행이 묶음 전체를 막는다

**Files modified:** `workers/dart-alert/src/lap.ts`, `workers/dart-alert/src/collector.ts`, `workers/dart-alert/src/db.ts`, `workers/dart-alert/src/safeError.ts`, `workers/dart-alert/tests/collector.test.ts`, `workers/dart-alert/tests/helpers/fakes.ts`
**Commit:** cc135812
**Applied fix:**
- `rcept_dt` 가 8자리가 아니면(빠짐 · 깨짐) 그 행을 버리지 않는다. 조회 날짜(`bgn_de = end_de = day`)로 넣고 warn `dart row rcept_dt invalid — using query day` 를 남긴다. 리뷰는 `invalid` 로 거르자고 했지만, 그러면 공개매수 알림이 조용히 빠진다. 조회가 그날 하루뿐이라 조회 날짜가 곧 접수일이므로 이쪽을 택했다.
- 넣기 묶음이 행 값 때문에 거절되면(SQLSTATE 22 · 23, 단 22023 은 빼고 — 새 `DbError.code` · `isRowRejection`) 행마다 다시 넣는다. 거절된 행만 error `dart alert row rejected by db — skipped` 로 남기고 `seen` 에 넣어, 같은 바퀴의 공개매수가 막히지 않는다. 그 밖의 실패(DB · 네트워크)는 예전처럼 warn 을 남기고 던진다.
- 수집기는 넣기 연속 실패를 센다. 첫 실패에서 5분(`OUTAGE_AFTER_MS`)이 넘으면 error `dart alert insert failing`(level 50) 1번을 남기고, 장애도 연다(「DART 조회 실패(공시 저장 실패 db)」 — 글 형식은 그대로, 사유만 다르다). 넣기가 다시 되는 바퀴에 기존 judgeOutage 가 닫는다.
- `safeErrorFields` 는 `DbError` 를 `{code: SQLSTATE, kind: "db"}` 로 줄인다.

### WR-02: 「멈췄습니다」 · 「다시 동작」 짝이 깨지는 길 — notice 기록 실패 · 복구 글 실패가 재시도되지 않는다

**Files modified:** `workers/dart-alert/src/collector.ts`, `workers/dart-alert/tests/outage.test.ts`
**Commit:** 3bcd89cb
**Applied fix:**
- (가) 「멈췄습니다」 를 실제로 보냈는지를 메모리 `OpenOutage.noticeSent` 에 둔다. notice 기록 RPC 가 실패하면 그 값을 들고 있다가 다음 바퀴마다 `db.outage("notice", …)` 를 다시 부른다(info `dart outage notice recorded on retry` · 실패면 warn). 짝 판정은 메모리로 한다. 그래서 DB 가 pending 이어도 같은 실행은 「다시 동작」 을 보낸다.
- (나) 순서를 「다시 동작」 송신 → DB close 로 바꿨다. 송신이 실패하면 DB 를 열어 둔 채 warn `dart outage recovered notice failed — keeping outage open, retrying` 를 남긴다. 다음 성공 바퀴에 5 · 10 · 20 · 40 · 60초 간격으로 다시 보내고, 첫 시도에서 120초가 넘으면 error `dart outage recovered notice unsent over 120s` 를 1번 남긴다. DB 에 장애가 열려 있으므로 실행이 바뀌어도 다음 실행이 이어받아 보낸다. 리뷰가 제안한 메모리 `pendingRecovered` 보다 이 방식이 재시작에도 살아남는다.
- 이어받은 장애의 notice 를 모르면(`opened:false`) 닫을 때 `readState` 로 확인한다.

### WR-03: HTTP 429 · 403(OpenDART 본문이 없는 응답)을 일시 장애로 분류한다 — 차단 신호에도 5 ~ 10초마다 계속 조회한다

**Files modified:** `workers/dart-alert/src/dart/client.ts`, `workers/dart-alert/src/collector.ts`, `workers/dart-alert/tests/dartClient.test.ts`, `workers/dart-alert/tests/outage.test.ts`, `workers/dart-alert/tests/helpers/fakes.ts`
**Commit:** 9946d992
**Applied fix:** `fetchListPage` 가 본문을 분류하기 전에 HTTP 상태부터 가른다.
- 429 → `DartApiError(429, "HTTP 429", "quota")`: 한도 의심 표시 + 종료 1, 다음 실행은 단독 탐침 1건
- 401 · 403 → `kind: "key"`: 종료 1

장애 글 사유는 본문 코드와 구분해 「요청 제한(HTTP 429)」 · 「접근 거부(HTTP 403)」 로 적는다. 가짜 DART 에는 `reply.error`(오류를 그대로 던짐)를 더했다.

### WR-04: axios `timeout` 은 「연결된 뒤 응답이 없는 시간」 만 재고, Supabase 호출에는 제한 시간이 없다 — 90초 임대 · 송신 기한 계산의 전제(요청당 최대 10초)가 성립하지 않는다

**Files modified:** `workers/dart-alert/src/dart/client.ts`, `workers/dart-alert/src/telegram/client.ts`, `workers/dart-alert/src/services/supabase.ts`, `workers/dart-alert/tests/requestTimeout.test.ts`(새 파일)
**Commit:** 527b200e
**Applied fix:**
- OpenDART · 텔레그램 요청마다 `signal: AbortSignal.timeout(10_000)` 을 기존 axios `timeout` 과 함께 건다. 끊기면 ERR_CANCELED transient 가 된다. 키 · 토큰이 실리지 않는 기존 경로를 그대로 탄다.
- Supabase 는 `global.fetch` 를 `fetchWithTimeout(10_000)` 으로 감싼다. 부르는 쪽 signal 이 있으면 `AbortSignal.any` 로 합친다. 끊긴 요청은 `{error}` → `DbError` 가 된다.
- 테스트는 `AbortSignal.timeout` 을 가로채 10초를 실제로 기다리지 않는다. Supabase 는 20ms 상한으로 실제 끊김을 확인한다.

### WR-05: 멈추는 길(한도 · 예산 소진 · 창 끝)에서 이미 넣은 미송신 건이 버려지고, 다음 날 `expired` 는 info 로만 남는다

**Files modified:** `workers/dart-alert/src/collector.ts`, `workers/dart-alert/src/db.ts`, `workers/dart-alert/tests/collector.test.ts`, `workers/dart-alert/tests/dbContract.test.ts`, `workers/dart-alert/tests/helpers/fakes.ts`
**Commit:** 2e91dd0a
**Applied fix:**
- 대상: 임대를 쥔 auto 실행이 멈출 때다. 이유는 `budget_at_start` · `probe_failed` · 치명 halt · `budget_exhausted` · `window_end` · `error` 다. SIGTERM · 임대 잃음 · 확인 못 함은 빼고, seed 는 「송신 0」 약속이라 뺀다.
- 위 실행은 `drainBeforeStop` 에서 OpenDART 호출 없이 송신 차례를 최대 4번(× 5건) 더 돌린다.
- 그 뒤 새 어댑터 `countUnsent(오늘)` 로 셈만 한다. `dart_alerts` 를 head · exact count 로 읽고 행 값은 읽지 않는다. 0 이 아니면 error `alerts left unsent at stop`(수 · 이유)을 남긴다.
- 임대를 새로 잡으며 지난 날 건을 expired 로 닫으면, info 대신 error `unsent alerts expired on takeover` 로 남긴다.
- 계약 테스트는 고른 칸 · 상태값이 표 정의(CHECK)에 있는지 대조한다.

### IN-01: 다시 연 장애 글의 사유 · 시작 시각이 처음 연 실행의 것과 다르다

**Files modified:** `supabase/migrations/20261113300000_dart_alert_fix.sql`(새 파일), `supabase/tests/dart_alert.test.sql`, `workers/dart-alert/src/db.ts`, `workers/dart-alert/src/collector.ts`, `workers/dart-alert/tests/dbContract.test.ts`, `workers/dart-alert/tests/outage.test.ts`, `workers/dart-alert/tests/helpers/fakes.ts`
**Commit:** 454550ab
**Applied fix:**
- 사유: `STATE_COLUMNS` 에 `outage_reason` 을 더했다. notice pending 장애를 다시 열 때 글은 DB 의 처음 사유를 쓴다(없으면 「수집기 중단」).
- 시작 시각 — 새 마이그레이션:
  - 3인자 `dart_alert_outage` 를 DROP 하고 `p_since timestamptz DEFAULT NULL` 을 더한 4인자 함수로 다시 만든다. 두 함수가 같이 있으면 PostgREST 가 호출을 고르지 못한다(PGRST203).
  - 새로 열 때 `outage_since` 를 워커 기준점으로 적는다. 값은 `[now − 1일, now]` 로 잘라 맞추고, NULL 이면 예전처럼 now 를 쓴다.
  - 권한 3줄 · SECURITY INVOKER · search_path 고정은 그대로다.
- 워커는 open 에 `p_since` 를 넘기고, DB 가 돌려준 since 를 글 · 「다시 동작」 에 그대로 쓴다.
- `dbContract.test.ts` 는 `_dart_alert.sql` + `_dart_alert_<꼬리>.sql` 을 파일 이름 순으로 이어 읽는다(나중 정의가 이김). 그래서 새 시그니처까지 계속 대조한다.
- pgTAP 은 S9 시그니처를 갱신하고 S11(3인자 없음) · O28 ~ O36(p_since · 잘라 맞춤 · NULL)을 더했다. plan 은 173 → 183 이다.

### IN-02: CLI 진입점이 예상 밖 예외를 로그 없이 삼킨다

**Files modified:** `workers/dart-alert/src/index.ts`, `workers/dart-alert/tests/modes.test.ts`
**Commit:** bb2e8ca4
**Applied fix:**
- `createLogger(cfg.logLevel)` 를 try 로 감쌌다. pino 가 모르는 level 이면 기본 로거로 error `dart-alert logger setup failed`(level 50 · logLevel 값만)를 남기고 1 을 돌려준다.
- CLI reject 처리기는 `crashLine(err)` 를 stdout 에 쓴 뒤 종료 1 한다. `crashLine` 은 level 60 · `dart-alert crashed` · `safeErrorFields` 만 담은 JSON 한 줄이다.

### IN-03: 우리 쪽 송신 속도 제한 때문에 밀린 건에도 「(늦은 알림)」 이 붙는다

**Files modified:** `workers/dart-alert/src/lap.ts`, `workers/dart-alert/src/collector.ts`, `workers/dart-alert/tests/delivery.test.ts`
**Commit:** f6f87467
**Status:** fixed: requires human verification(늦음 판정 로직 변경)
**Applied fix:**
- 수집기가 넣기 결과로 `SendPacer.insertedHere` 를 채운다.
- 이 실행이 넣었고 첫 시도인(`attempts <= 1`) 건은 처음 본 뒤 60초가 지나도 늦음으로 치지 않는다.
- 늦음으로 그대로 남는 경우는 셋이다.
  - 앞 송신이 실패한 건(시도 2번째 이상)
  - 앞 실행이 넣고 못 보낸 건(재시작 · 인계)
  - 행의 `late`
- 리뷰가 제안한 「`attempts > 1` 만」 은 쓰지 않았다. 수집기가 넣고 차례 전에 죽은 건(다음 실행 첫 시도 = attempts 1)이 늦음에서 빠지는데, 그 경우가 바로 D-12 의 「멈췄다 다시 켜진 경우」 이기 때문이다. `deliverPending` 에 pacer 를 주지 않는 경로(트레이서)는 예전 동작 그대로다.

### IN-04: 치명 종료 중 장애 글을 쓰다 임대를 잃으면 error `dart outage open failed` 가 잘못 나간다

**Files modified:** `workers/dart-alert/src/collector.ts`, `workers/dart-alert/tests/outage.test.ts`
**Commit:** 7b277182
**Applied fix:** `outageOnFatal` 의 catch 에서 `LeaseLostError` · `StopRun(0)` 을 가른다. 이때는 warn `dart outage open skipped — lease lost while posting` 으로 낮추고 `haveLease` 를 내린다(남의 임대를 해제하지 않음). 그 밖 오류만 지금처럼 error 다.


### CR-50: 실행이 아예 생기지 않으면 아무 알림도 없다 — 스모크는 PAUSED 를 통과로 보고, `--scheduler-paused` 는 돌던 Scheduler 도 멈춘다

**Files modified:** `ops/alert-dart-alert-scheduler-error.yaml`(새 파일), `ops/alert-dart-alert-no-wake.yaml`(새 파일), `scripts/deploy-dart-alert.sh`, `scripts/smoke-dart-alert.sh`
**Commit:** 59a14ae5
**Status:** fixed: requires human verification — no-wake 정책의 PromQL 은 운영 Cloud Monitoring 에 넣어 보지 못했다.
**Applied fix:**
- **배포 — 이미 있는 ENABLED Scheduler 에는 `--scheduler-paused` 를 거부한다.** Section 1 에서 빌드 · 배포 전에 상태를 본다. 그래서 아무것도 바꾸지 않은 채 종료 1 로 끝난다. 이미 PAUSED 면(첫 배포 날 절차를 다시 돌린 경우) 그대로 둔다. 멈춤은 이번 실행이 만든 Scheduler 에만 건다.
- **스모크 — 상태 · 대상 · 바인딩을 실패로 잡는다.**
  - INV-3b: PAUSED 는 FAIL 이다. 배포가 `--scheduler-paused` 로 막 만든 날만 `DART_SMOKE_ALLOW_PAUSED=1` 을 넘겨 통과시킨다.
  - INV-3c: Scheduler 대상 URI 가 이 Job 의 `:run` 인지, OAuth SA 가 `gh-radar-scheduler-sa` 인지 본다. Job IAM 에 그 SA 의 `roles/run.invoker` 바인딩이 있는지도 본다.
- **새 알림 정책 1 — `gh-radar-dart-alert-scheduler-error`.** 로그 일치 조건이다(`resource.type="cloud_scheduler_job"` · `job_id=gh-radar-dart-alert-wake` · `severity>=ERROR`). 깨움 호출이 실패하면(403 바인딩 유실 · 404) 잡는다.
- **새 알림 정책 2 — `gh-radar-dart-alert-no-wake`.** PromQL 로 「평일 KST 07:40 ~ 20:00 에 실행 시작 로그 30분 0건」 을 10분 이어 보면 울린다. PAUSED · 삭제처럼 Scheduler 로그도 남지 않는 경우를 덮는다.
  - 신호: 새 로그 기반 지표 `dart_alert_wake_starts`(`jsonPayload.msg="dart-alert start"`)에 `absent_over_time(…[30m])` 를 건다. 배포 Section 7b 가 이 지표를 create/update 한다.
  - **밤 · 주말에 울리지 않는 방법:** `vector(time() + 32400)` 으로 평가 시각을 KST 로 옮긴다. 그 뒤 `day_of_week` 1 ~ 5, 분 기준 460(07:40) 이상, `hour` 20 미만일 때만 식이 결과를 낸다. 그 밖 시각에는 결과가 비어 조건이 거짓이고, 20:00 에 열린 인시던트도 닫힌다.
  - 07:40 부터 보는 이유는 07:00 첫 깨움 전에는 「30분 0건」 이 늘 참이기 때문이다. 평일 공휴일에도 깨움은 돌므로 울리지 않는다.
  - 창 안에서 지표를 처음 만든 직후에 잘못 울리지 않게 `duration` 600초를 뒀다. `disableMetricValidation: true` 로 점이 아직 없는 지표에도 정책을 만들 수 있게 했다. 이 모든 내용은 YAML 문서 칸에 적었다.
- 배포 Section 8 이 정책 4개를 같은 꼴(update-or-create)로 만든다. self-test 는 정책 4개, PromQL 이 읽는 지표 이름, 지표 필터 문구가 `index.ts` 의 시작 로그와 같은지를 센다. 스모크 INV-5 는 배포 스크립트의 `ALERT_POLICY_NAMES` 배열을 읽어 정책 4개와 지표를 확인한다.
- **사람이 확인할 것:** 첫 배포 때 Monitoring 이 PromQL 조건을 받아 주는지 본다. 받지 않으면 Section 8 에서 종료 1 로 멈춘다. 이때 Job · Scheduler 는 이미 갱신된 상태다. 함께 볼 것은 둘이다. 하나는 Cloud Monitoring PromQL 에서 사용자 로그 지표 이름 `logging_googleapis_com:user_dart_alert_wake_starts` 가 맞는지다. 다른 하나는 다음 평일 창에서 이 정책이 조용한지다.

### WR-50: `--scheduler-paused` 생성 경로의 경합 — 만든 직후 멈추기 전에 깨움이 나가면 그날 공시가 「(늦은 알림)」 으로 쏟아진다

**Files modified:** `scripts/deploy-dart-alert.sh`
**Commit:** 8485d139
**Status:** fixed: requires human verification — 「update 는 PAUSED 를 바꾸지 않는다」 를 운영에서 확인하지 못했다. 아래처럼 갱신 뒤 다시 확인해 덮었다.
**Applied fix:**
- 멈춘 채 만드는 경로를 다음 순서로 바꿨다.
  1. 임시 일정 `0 0 1 1 *`(1월 1일 0시 KST)로 만든다. 그때 울려도 창 밖이라 수집기는 바로 0 으로 끝난다.
  2. 멈춘다.
  3. 진짜 일정으로 update 한다.
  4. 상태를 다시 읽는다. PAUSED 가 아니면 다시 멈춘다. 방금 만든 Scheduler 라 운영 깨움을 끊지 않는다.
- 멈춤이 실패하면 종료 1 로 멈춘다. 이어서 할 명령(수동 pause → `--scheduler-paused` 로 다시 실행)을 찍는다.
- self-test 는 임시 일정 줄이 있는지 센다.

### WR-51: 커밋 안 된 작업 트리를 HEAD SHA 로 빌드해 배포한다 — 이미지 태그 · APP_VERSION 이 실제 코드와 다르다

**Files modified:** `scripts/deploy-dart-alert.sh`
**Commit:** bb3e87be
**Applied fix:**
- 빌드 입력(Dockerfile COPY 경로: 루트 `package.json` · `pnpm-workspace.yaml` · `pnpm-lock.yaml` · `tsconfig.base.json` · `workers/dart-alert`)에 `git status --porcelain` 변경이 있으면 막는다. 추적 안 된 파일도 센다.
- 일부러 그대로 올릴 때만 `ALLOW_DIRTY=1` 을 쓴다. 이때 태그 · APP_VERSION 에 `-dirty-<epoch초>` 가 붙는다. `deploy-tick-convert.sh` 와 같은 꼴이다.

### WR-52: 스모크는 OpenDART 키만 확인한다 — Supabase · 마이그레이션 · 텔레그램이 깨져도 6/6 통과하고, 되돌릴 길도 없다

**Files modified:** `scripts/dart-alert-report.sh`, `scripts/smoke-dart-alert.sh`, `scripts/deploy-dart-alert.sh`
**Commit:** 996c8e6b
**Status:** fixed: requires human verification — 운영 Supabase PostgREST 가 서비스롤 키로 OpenAPI 스키마를 내주는지 확인하지 못했다. 못 내주면 migration 은 WARN 으로만 남는다.
**Applied fix:**
- **`dart-alert-report.sh check` 를 새로 만들었다.** 읽기 전용이다. OpenDART 호출과 단체방 글은 0 이다.
  - ① db: `dart_alert_ops_stats` 가 응답하는가(URL · 서비스롤 키 · 기본 마이그레이션).
  - ② migration: PostgREST `/rest/v1/` OpenAPI 의 `dart_alert_outage` 에 `p_since` 가 있는가(part A 의 20261113300000). 스키마를 못 읽으면 WARN 만 남긴다.
  - ③ telegram: `getMe` 와 `getChatMember`(방 id · 봇 자신)로 토큰이 살아 있고 봇이 방에서 글을 쓸 수 있는가.
  - 비밀은 Secret 에서 변수로만 읽고, `printf | curl -K -` 로만 넘긴다. 결과 줄에는 6자리 넘는 숫자를 지워 방 id · 봇 id 도 싣지 않는다.
- **스모크에 두 항목을 더했다.**
  - INV-6a: Job env `SUPABASE_URL` 이 배포 값(`DART_SMOKE_SUPABASE_URL`)과 같은가.
  - INV-6b · INV-7: 그 URL 로 `check` 를 돌린다. 결과 줄은 화면에 그대로 보여 준다.
- **배포는 직전 이미지를 남긴다.** Section 5 전에 `PREV_IMAGE` 를 읽는다. 스모크가 실패하면 그 이미지로 되돌리는 명령을 찍는다. env 원인이면 다시 배포하고, 마이그레이션 원인이면 db push 뒤 스모크를 다시 돌리라는 안내도 찍는다.
- probe 의 마지막 flush 실패를 종료 1 로 바꾸는 일과 수집기 `DART_ALERT_MODE=check` 는 src 몫이라 하지 않았다. 텔레그램 확인은 스크립트 쪽 `check` 로 대신했다.

### WR-53: 알림 정책 update-or-create 가 조회 오류를 「없음」 으로 삼킨다 — 일시 오류 한 번에 정책이 중복으로 생긴다

**Files modified:** `scripts/deploy-dart-alert.sh`, `scripts/smoke-dart-alert.sh`
**Commit:** a460028c
**Applied fix:**
- 배포에서 `policies list` 가 실패하면 중복 생성을 막으려고 종료 1 로 멈춘다(임시 YAML 도 지운다).
- 같은 이름의 정책이 2개 이상이면 그 이름들과 지우는 명령을 찍고 멈춘다.
- 필터는 `displayName="…"` 처럼 따옴표로 감쌌다.
- 스모크 `policy_exists` 는 「조회 성공 · 정확히 1개」 를 단언한다.

### WR-54: survey 의 오늘 사용량 · 한도 의심 확인이 확인 실패 시 그냥 진행하고, 호출 수는 끝에서만 더한다

**Files modified:** `scripts/dart-alert-report.sh`
**Commit:** 199231a5
**Applied fix:**
- **확인을 못 하면 조사하지 않는다.** `dart_alert_ops_stats` 호출이 실패하거나, `calls_today` · `strikes_today` 가 정수가 아니면 종료 1 이다. node 파서도 `0 0` 대신 종료 1 을 낸다.
- **예산은 Job 설정에서 읽는다(`resolve_budget`).** 순서는 env `DART_ALERT_DAILY_BUDGET` → Job 의 같은 env → 없으면 15,000 이다. Job 을 못 읽거나 값이 1 ~ 15,000 밖이면 멈춘다. Job 배포 전이면 env 로 넘기라고 안내한다. `stats` 화면은 읽지 못하면 「?(Job 설정 못 읽음)」 으로 보여 준다.
- **호출 수는 쪽마다 더한다.**
  - 부르기 **전에** 세고(끊겨도 빠지지 않게, 많아야 1 더 셈), 쪽마다 바로 `incr_api_usage` 로 더한다.
  - INT · TERM · HUP 에도 EXIT 처리를 거쳐 남은 몫을 더한다. 키를 지우기 전에 더한다.
  - TERM 으로 조사 도중 끊는 경우를 가짜 curl 로 돌려 남은 1건이 더해지는 것을 확인했다.

### WR-55: 로거 가림 테스트가 한 단계 아래까지만 본다 — 진짜 AxiosError 를 그대로 남기면 `err.response.config.params.crtfc_key` 가 출력된다(실측)

**Files modified:** `workers/dart-alert/src/logger.ts`, `workers/dart-alert/tests/logger.test.ts`
**Commit:** 6014e466
**Applied fix:**
- **테스트를 먼저 썼다.** 진짜 `AxiosError`(response 안에 config · request)를 넣는 테스트와, 세 단계 아래 비밀 · 문자열 안 토큰 경로 · `crtfc_key=` 쿼리 · 순환 참조를 넣는 테스트다. 둘 다 고치기 전에 **빨강**인 것을 확인했다.
- **로거에 `formatters.log` 의 `redactDeep` 를 더했다.** pino redact 보다 먼저 돈다.
  - 깊이와 상관없이 비밀 이름(기존 `SECRET_KEYS` · `SECRET_CONTAINERS`) 값을 가린다.
  - 문자열은 `scrubSecrets` 로 거른다(`bot<숫자>:<토큰>` · 토큰 꼴 · `crtfc_key=`).
  - Error 는 같은 프로토타입 복사본으로 바꾼다. 그래서 pino err 직렬화(`type: "AxiosError"` · stack)가 그대로 남는다.
  - 순환 참조는 「[circular]」, 깊이 8을 넘으면 「[depth]」 다.
- 1차 경로(`safeErrorFields` · `telegramSafeFields`)와 기존 pino redact 경로는 그대로 두었다.
- 실제 출력을 확인했다: `config` · `request` · `response.config` · `response.headers` 가 모두 `[redacted]` 이고 `status: 500` · `code` · `message` 는 남는다.

### WR-56: 진입점의 예산 · 한도 의심 결선을 어떤 테스트도 확인하지 않는다 — 단언 없는 `usage.add(3)` 과 날짜를 버리는 가짜 DB

**Files modified:** `workers/dart-alert/tests/entryWiring.test.ts`(새 파일), `workers/dart-alert/tests/helpers/fakes.ts`, `workers/dart-alert/tests/modes.test.ts`
**Commit:** b5bfe910
**Applied fix:**
- **새 `entryWiring.test.ts`** 는 `vi.mock("../src/services/supabase")` 로 Supabase 클라이언트만 가짜로 바꾼다. 그 위에서 `buildDeps` 결선을 단언한다.
  - `usage.read` → `api_usage` · `service=opendart_list` · `usage_date=<날짜>`
  - `strikes.read` → `opendart_list_quota_strike`
  - `usage.add → flush` → `incr_api_usage(opendart_list, 날짜, 합)` 1회, 모은 것이 없으면 RPC 0
  - `strikes.record` → `incr_api_usage(opendart_list_quota_strike, 날짜, 1)`
- **가짜 DB** 의 `usage.read/flush` · `strikes.read/record` · `countUnsent` 는 날짜 인자가 오늘 KST `YYYY-MM-DD` 인지 검사한다. 어긋나면 던지고 기록한다. 수집기가 그 오류를 warn 으로 삼켜도 `harness.run()` 이 테스트를 떨어뜨린다.
- `modes.test.ts` 의 단언 없는 `usage.add(3)` 을 지우고 새 테스트를 가리키는 주석으로 바꿨다.
- 빨강 확인 두 가지:
  - `usage.read` 를 `readQuotaStrikes` 로 잘못 묶으면 3건이 실패한다.
  - 수집기 날짜를 `YYYYMMDD` 로 바꾸면 하네스 테스트들이 「날짜 인자 어긋남」 으로 실패한다.

### IN-50: 가짜 DB 의 `after` 훅 — 주석은 「넣기 · 차례 · 기록 · 장애」 라지만 넣기 · 장애에서는 부르지 않는다

**Files modified:** `workers/dart-alert/tests/helpers/fakes.ts`, `workers/dart-alert/tests/collector.test.ts`
**Commit:** ca77984a
**Applied fix:**
- 넣기 끝(접수번호들을 함께 넘김)과 장애 RPC 끝에 `o.after?.(…)` 를 걸었다. 장애는 DB 반영을 `applyOutage` 로 떼어 내, 모든 반환 경로 뒤에서 훅이 돈다.
- 테스트를 하나 더했다: 「넣기는 반영됐는데 응답 유실 → warn 1 · 다음 바퀴 새 행 0 · 그 건은 정확히 1번 송신」. 훅을 빼면 빨강인 것을 확인했다.

### IN-51: dbContract 「반환 키」 검사가 상태 문자열과 겹치는 키에서는 아무것도 확인하지 못한다

**Files modified:** `workers/dart-alert/tests/dbContract.test.ts`
**Commit:** 34257761
**Applied fix:**
- `jsonbObjectKeys` 는 본문의 모든 `jsonb_build_object(…)` 인자에서 키 자리(0부터 짝수 번째)의 문자열 리터럴만 모은다. 반환 키는 이것과 대조한다.
- 파서 자기 점검(값 자리 · 상태값은 키로 세지 않음)도 넣었다.
- 마이그레이션의 `'expired', v_expired` 를 잠깐 `'expired_n'` 으로 바꿔 보니 새 검사는 `dart_alert_lease_acquire.expired` 로 떨어진다. 옛 검사는 `SET status = 'expired'` 때문에 통과했을 경우다. 마이그레이션은 되돌렸다.

### IN-52: config.test 가 `process.env` 를 일반 객체로 바꿔 끼운다

**Files modified:** `workers/dart-alert/tests/config.test.ts`
**Commit:** d1019f8d
**Applied fix:** 이 파일이 만지는 env 키(필수 5 + 선택 8)만 `saved` 에 담았다가 키 단위로 되돌린다. `modes.test.ts` 와 같은 꼴이다. `process.env` 객체 자체는 바꿔 끼우지 않는다.

### IN-53: `file_mode` 의 「Linux(stat -c)」 분기는 동작하지 않는다

**Files modified:** `scripts/setup-dart-alert-secrets.sh`, `scripts/telegram-find-chat.sh`
**Commit:** c6f867dd
**Applied fix:**
- `stat -c '%a'` 가 되면 그것을 쓰고, 안 되면 `stat -f '%Lp'` 를 쓴다(리뷰 Fix 그대로).
- macOS 에서 600 · 644 를 확인했다. GNU stat 은 `-f` 가 파일시스템 출력을 내는 가짜로 흉내 내 600 을 확인했다.

### IN-54: CLAUDE.md 「OpenDART 소비처 … 하나」 가 survey 스크립트와 어긋나고, 같은 절의 Naver 불릿은 이제 어느 API 인지 이름이 없다

**Files modified:** `CLAUDE.md`, `docs/stack.md`
**Commit:** 15b5f6c7
**Applied fix:**
- Naver 불릿 넷(공식 한도 · 소비처 · 예산 · 수집 주기) 앞에 「Naver」 를 붙였다. 고친 줄의 `08:00~20:00` 은 `08:00 ~ 20:00` 으로 띄웠다.
- OpenDART 소비처 불릿에 운영 도구도 같은 키 · 같은 카운터 `opendart_list` 에 더한다고 적었다(`dart-alert-report.sh survey` 1회 최대 약 70회 · 배포 스모크 probe 1회).
- docs/stack.md 의 「소비처는 … 하나」 도 같은 뜻으로 맞췄다.
- GSD 관리 표식(`<!-- GSD:stack-start/end -->`)은 그대로다.

### IN-55: survey 기간이 days+1 일이다 — 90일이면 OpenDART 검색기간 제한에 걸릴 수 있고, 60쪽에서 잘리면 ⑶ 이 적게 나온다

**Files modified:** `scripts/dart-alert-report.sh`
**Commit:** 0ffbb074
**Applied fix:**
- 시작일을 `now − (days − 1)일` 로 바꿨다. 오늘을 넣어 정확히 days 일이다(30 → 10-15 ~ 11-13, 30일).
- 상한은 89일이다.
- 쪽 상한에서 잘리면 `TRUNC_<유형>` 을 남긴다. 그러면 ⑵ · ⑶(B001) · ⑷(D004) 머리에 「(잘림 — 앞 N쪽만 · 전체 M쪽 · 과소 집계)」 가 붙는다.

### IN-56: deploy 임시 YAML 은 실패하면 남고, self-test 의 추적 모드 검사는 `set -o xtrace` 를 못 잡는다

**Files modified:** `scripts/deploy-dart-alert.sh`
**Commit:** 1f2180bd
**Applied fix:**
- 정책 반복 전에 `trap 'rm -f "${RESOLVED_YAML:-}"' EXIT` 를 둔다. 가짜 `policies create` 실패로 남는 임시 파일이 0 인 것을 확인했다.
- self-test 정규식이 `set -o xtrace` · `(export) BASH_XTRACEFD=` 도 잡는다. 네 꼴을 한 줄씩 붙인 사본에서 모두 FAIL 이 나는 것을 확인했다.

### IN-57: 스모크 INV-4 는 15분 안의 이전 probe 로그로도 통과하고, INV-1 은 실패 때 실행 이름을 버린다

**Files modified:** `scripts/smoke-dart-alert.sh`
**Commit:** ed13671a
**Applied fix:**
- INV-1 은 `--async --format='value(metadata.name)'` 로 실행 이름을 받는다. 이름이 안 나오면 「Execution [이름]」 진행 문구에서 꺼낸다.
- 그 실행을 `executions describe` 의 csv(완료 시각 · 성공 · 실패)로 5초 간격, 최대 5분 지켜본다.
- 성공 · 실패와 상관없이 실행 이름과 describe 명령을 화면에 남긴다.
- INV-4 필터에 `labels."run.googleapis.com/execution_name"="<그 실행>"` 를 더했다.

### IN-58: SA 없음 힌트가 Scheduler SA 에도 setup-dart-alert-iam.sh 를 안내하지만, 그 스크립트는 Scheduler SA 를 만들지 않는다

**Files modified:** `scripts/deploy-dart-alert.sh`
**Commit:** d102bf0f
**Applied fix:**
- 저장소의 어떤 setup 스크립트도 `gh-radar-scheduler-sa` 를 만들지 않는다(여러 워커가 함께 쓰는 기존 SA). 그래서 이 SA 가 없을 때의 안내를 따로 뒀다.
  1. 다른 Scheduler 도 깨졌는지 먼저 본다.
  2. 다시 만들 때는 사용자 터미널에서 `! gcloud iam service-accounts create …` 를 실행한다.
  3. 그 뒤 각 워커의 deploy 를 다시 돌려 Job 마다 invoker 를 다시 묶는다.
- 수집기 SA 안내는 그대로다.

### IN-59: Generality without instantiation — `DART_SCHEDULERS` 배열 · 「이름|cron」 파싱 · 반복문이 원소 1개로 고정돼 있다

**Files modified:** `scripts/deploy-dart-alert.sh`, `scripts/smoke-dart-alert.sh`, `workers/dart-alert/tests/schedule.test.ts`
**Commit:** 7079757a
**Status:** fixed: requires human verification — 필요성(necessity) 지적이라 코드를 걷어냈다.
**Applied fix:**
- 배열을 상수 두 줄 `WAKE_SCHEDULER=gh-radar-dart-alert-wake` · `WAKE_SCHEDULE="*/5 7-19 * * 1-5"` 로 바꿨다.
- 배포 Section 7 의 반복문 · `|` 분리를 걷어냈다. 동작은 같다.
- self-test 는 두 상수를 검사한다. `schedule.test.ts` 는 `bashConst` 로 두 줄을 읽는다(정확히 한 줄이어야 함). 스모크도 두 줄을 읽는다.
- WR-50 뒤로 읽는 곳이 없어진 `SCHED_CREATED` 도 같이 지웠다.
- 상수를 `6-19` 로 잠깐 바꿔 schedule.test 3건이 실패하는 것을 확인하고 되돌렸다.

## Skipped Issues


### IN-05: 빌드 이미지 · pnpm 버전이 고정되지 않았다

**File:** `workers/dart-alert/Dockerfile:6-7`, `workers/dart-alert/Dockerfile:25`
**Reason:** 이 phase 만의 결함이 아니고, 리뷰 Fix 도 「저장소 전체에서 한 번에 다룬다」 고 적었다. 저장소 Dockerfile 13개가 같은 `node:22-alpine` · `pnpm@10` 관례를 쓴다. 이 lane 에서 dart-alert 하나만 고치면 관례가 갈라진다. 또 지금 운영 이미지가 쓴 pnpm 10.x 정확한 버전과 node 이미지 digest 를 이 lane 에서 확인할 길이 없다. gcloud 금지라 운영 이미지를 조사할 수 없고, 로컬 pnpm 은 11.15.1 이다. 근거 없는 버전을 고정하면 `pnpm deploy --legacy` 동작이 바뀔 위험이 있다. 저장소 전체 고정 작업으로 따로 다루기를 권한다.
**Original issue:** `node:22-alpine` 태그와 `pnpm@10` 이 고정되지 않아, 같은 커밋을 다시 빌드해도 다른 런타임 · 패키지 관리자가 들어갈 수 있다.

## 재배포 순서


1. **DB 를 먼저 올려야 한다.** 새 마이그레이션 `supabase/migrations/20261113300000_dart_alert_fix.sql` 은 아직 원격에 적용되지 않았다. 새 워커는 `dart_alert_outage` 에 `p_since` 를 보내므로, 옛 DB(3인자 함수)에 새 워커를 올리면 장애 open 이 「함수를 못 찾음」 으로 실패한다. 순서는 `supabase db push --linked --yes` → 워커 재배포다. 거꾸로 지금 운영 중인 옛 워커는 새 DB 에서도 그대로 동작한다(p_since 기본 NULL → 예전 동작).
2. **새 error 로그(level 50 → 이메일 정책에 걸림):**
   - `dart alert insert failing`
   - `dart alert row rejected by db — skipped`
   - `dart outage recovered notice unsent over 120s`
   - `alerts left unsent at stop`
   - `unsent alerts expired on takeover`(옛 info `past-day alerts expired on takeover` 를 대신함)
   - `unsent count at stop failed`
   - `dart-alert logger setup failed`
   - `dart-alert crashed`(level 60)

   알림 정책 필터(`jsonPayload.level >= 50`)는 그대로 둬도 이것들을 잡는다.
3. **예산 소진 · 한도 의심 날의 송신:** 그날 이후 5분마다 뜨는 실행은 `budget_at_start` · `probe_failed` 로 끝나기 전에 남은 건을 보내 본다(OpenDART 호출 0 · 텔레그램 호출만). 남은 건이 있고 텔레그램도 막혀 있으면 깨울 때마다 error 가 남는다.

---

_Fixed: 2026-11-13T01:55:07Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

1. **DB 먼저(part A 와 같음):** `supabase db push --linked --yes`. 20261113300000 이 원격에 없으면 새 스모크 INV-6b 가 `FAIL migration` 으로 알려 준다.
2. **깨끗한 트리에서 배포한다(WR-51):** `workers/dart-alert` 등 빌드 입력에 미커밋 변경이 있으면 이제 배포가 멈춘다. 이 브랜치를 합친 뒤 깨끗한 checkout 에서 돌린다.
3. **배포 — `--scheduler-paused` 없이:** `GCP_PROJECT_ID=gh-radar SUPABASE_URL=<운영 값> bash scripts/deploy-dart-alert.sh`. 평일 20:00 뒤나 07:00 전을 권장한다(머리 주석). Scheduler 가 ENABLED 라 이 플래그를 붙이면 이제 거부된다. 이 배포가 새로 하는 일은 셋이다.
   - 로그 기반 지표 `dart_alert_wake_starts` 를 만든다(배포 신원에 `logging.configWriter` 류 권한 필요).
   - 알림 정책 `gh-radar-dart-alert-scheduler-error` · `gh-radar-dart-alert-no-wake` 를 만든다.
   - 스모크가 새 항목을 돈다: INV-3b · 3c(`run jobs get-iam-policy`), INV-6 · 7(`dart-alert-report.sh check` → Secret `gh-radar-telegram-bot-token` · `gh-radar-telegram-chat-id` · 서비스롤 키를 변수로만 읽고 getMe · getChatMember · OpenAPI 조회, 글 0).
4. **확인:** no-wake 정책의 PromQL 이 받아들여졌는지 본다. 거부되면 Section 8 에서 종료 1 이 되고, 그때 Job · Scheduler 는 이미 갱신돼 있다. 다음 평일 창에서 이 정책이 조용한지도 본다.
5. 메인 세션의 분류기가 Secret 읽기(텔레그램 토큰 · 방 id)를 막아 INV-6 · 7 이 돌지 못하면, 사용자가 `! bash scripts/smoke-dart-alert.sh` 로 스모크만 다시 돌린다. 이 스크립트는 비밀을 출력하지 않는다. 그 밖에 사용자가 `!` 로 꼭 할 일은 없다. 배포 신원에 지표 생성 · `get-iam-policy` 권한이 없어 막히면, 권한 부여(IAM 쓰기)만 사용자 `!` 몫이다.

## 알려 둘 것


- lane 규칙 위반 1건: 가짜 shim 시험 중 읽기 전용 `git stash list` 를 한 번 실행했다. stash 는 만들거나 꺼내지 않았고 아무 상태도 바뀌지 않았다. 그 뒤로는 stash 하위 명령을 쓰지 않았다.
- 검증은 이 lane 의 연결 worktree 안에서 했다. 따로 worktree 를 더 만들지 않았다(lane 규칙의 유일한 checkout).

---

_Fixed: 2026-11-13T02:20:43Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
