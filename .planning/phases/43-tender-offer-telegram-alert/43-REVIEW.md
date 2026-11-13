---
phase: 43-tender-offer-telegram-alert
reviewed: 2026-11-13T01:23:17Z
depth: standard
files_reviewed: 46
files_reviewed_list:
  - workers/dart-alert/src/index.ts
  - workers/dart-alert/src/collector.ts
  - workers/dart-alert/src/lap.ts
  - workers/dart-alert/src/watches.ts
  - workers/dart-alert/src/message.ts
  - workers/dart-alert/src/cadence.ts
  - workers/dart-alert/src/apiUsage.ts
  - workers/dart-alert/src/config.ts
  - workers/dart-alert/src/logger.ts
  - workers/dart-alert/src/db.ts
  - workers/dart-alert/src/safeError.ts
  - workers/dart-alert/src/dart/client.ts
  - workers/dart-alert/src/telegram/client.ts
  - workers/dart-alert/src/services/supabase.ts
  - workers/dart-alert/Dockerfile
  - workers/dart-alert/package.json
  - workers/dart-alert/tsconfig.json
  - workers/dart-alert/vitest.config.ts
  - supabase/migrations/20261113200000_dart_alert.sql
  - supabase/tests/dart_alert.test.sql
  - scripts/deploy-dart-alert.sh
  - scripts/setup-dart-alert-iam.sh
  - scripts/setup-dart-alert-secrets.sh
  - scripts/telegram-find-chat.sh
  - scripts/smoke-dart-alert.sh
  - scripts/dart-alert-report.sh
  - ops/alert-dart-alert-failure.yaml
  - ops/alert-dart-alert-error-log.yaml
  - workers/dart-alert/tests/helpers/fakes.ts
  - workers/dart-alert/tests/tracer.test.ts
  - workers/dart-alert/tests/collector.test.ts
  - workers/dart-alert/tests/modes.test.ts
  - workers/dart-alert/tests/outage.test.ts
  - workers/dart-alert/tests/delivery.test.ts
  - workers/dart-alert/tests/dbContract.test.ts
  - workers/dart-alert/tests/dartClient.test.ts
  - workers/dart-alert/tests/telegram.test.ts
  - workers/dart-alert/tests/watches.test.ts
  - workers/dart-alert/tests/message.test.ts
  - workers/dart-alert/tests/cadence.test.ts
  - workers/dart-alert/tests/budget.test.ts
  - workers/dart-alert/tests/config.test.ts
  - workers/dart-alert/tests/logger.test.ts
  - workers/dart-alert/tests/schedule.test.ts
  - CLAUDE.md
  - docs/stack.md
findings:
  critical: 1
  warning: 12
  info: 15
  total: 28
  necessity: 1
status: issues_found
---

# Phase 43: 코드 리뷰 보고서

> 분량 때문에 두 리뷰어가 나눠 봤다 — part A(ID 01 ~ 49): 워커 본체 `workers/dart-alert/src` · 이미지 설정 · 마이그레이션 · pgTAP / part B(ID 50 ~): 배포 · 운영 스크립트 · 알림 정책 · 테스트 · 문서. 이 파일이 합본이고 정본이다.

## Summary

### part A — 워커 본체 · DB


dart-alert 수집기(임대 · 바퀴 · 송신 · 장애 짝 글) · OpenDART / 텔레그램 클라이언트 · 로거 · 설정 · 마이그레이션 · pgTAP 을 읽었다. 43-CONTEXT D-01 ~ D-17 로 잠긴 동작(보고서마다 1건, 5초 / 10초 간격, 당일만, 5분 장애 기준, 같은 단체방 등)은 결함으로 보지 않았다.

괜찮은 부분:
- 비밀 차단은 탄탄하다. OpenDART 키(쿼리 인자)와 봇 토큰(URL 경로)은 axios 오류 객체를 버리고 안전한 필드만 남긴다(`dart/client.ts:138-142`, `telegram/client.ts:95-103`). 로거 redact 는 마지막 그물로 한 겹 더 있다.
- 일곱 RPC 는 모두 SECURITY INVOKER · `search_path` 고정이고, 동적 SQL 이 없으며, `PUBLIC` · `anon` · `authenticated` 권한을 명시적으로 회수했다. 표 둘도 RLS 를 켜고 권한을 회수했다.
- 접수번호 PK + `ON CONFLICT DO NOTHING` + 차례(claim) 기반 송신이라 넣기 응답을 잃어도 알림이 빠지지 않는다.

Critical 은 찾지 못했다. Warning 5건은 모두 **알림이 소리 없이 빠지거나 겹치는 길**이다.
1. 넣기(insert)가 계속 실패하면 경고(warn) 로그만 남고 장애 판정도 건너뛴다. 이메일도 단체방 글도 없이 그날 알림이 전부 멈춘다.
2. 「멈췄습니다」 · 「다시 동작」 짝 글이 깨지는 길이 있다.
3. HTTP 429 · 403 같은 차단 신호를 일시 장애로 보고 하루 종일 계속 조회한다.
4. axios `timeout` 은 연결된 뒤 응답이 없는 시간만 재고, Supabase 호출에는 제한 시간이 아예 없다. 그래서 90초 임대 계산이 보장되지 않는다.
5. 수집기가 멈추는 길(한도 · 예산 · 창 끝)에서 이미 넣은 미송신 건이 버려지는데, error 로그가 남지 않는다.

필요성(necessity) 점검: `$HOME/.claude/gsd-core/references/necessity-review.md` 를 읽고 적용했다. 해당 건은 없다. 토큰 문구 가림(`scrub`) · 행 값 검증 같은 방어는 신뢰 경계 · 다중 방어에 해당해 필요성 지적에서 뺐다.


### part B — 스크립트 · 알림 정책 · 테스트 · 문서


배포 스크립트 6개 · 알림 정책 2개 · 워커 테스트 15개 파일(헬퍼 포함) · CLAUDE.md / docs/stack.md 의 OpenDART 절을 정적으로 검토했다. 스크립트는 `/bin/bash`(3.2.57) `bash -n` 으로 모두 통과했고, 실행하지는 않았다. 워커 테스트는 `VITEST_MAX_WORKERS=1 vitest run` 으로 돌려 306건 전부 통과(2.5초)를 확인했다. 실제 시계 · 실제 네트워크를 쓰는 테스트는 없고, 부하에 따라 결과가 흔들릴 만큼 느린 테스트도 없다.

**비밀 취급은 대체로 탄탄하다.** 키 · 토큰은 셸 내장 `printf` → `curl -K -`(표준입력 설정) 또는 `gcloud … --data-file=-` 로만 넘어가고, 명령줄 · 프로세스 목록 · `set -x` · 오류 출력에 실리는 경로는 찾지 못했다. 키 꼴 검사(`^[A-Za-z0-9._-]+$` 등)가 curl 설정 줄에 따옴표나 역슬래시가 끼어드는 것도 막는다. bash 3.2 호환도 문제없다(`${arr[@]+…}` · 연관 배열 없음 · 빈 배열 전개는 원소가 있을 때만).

알림 정책 필터는 워커 로그 모양과 맞는다. pino 숫자 `level` 이 `jsonPayload.level` 로 남고, `jsonPayload.level >= 50` 은 `dart-alert config error`(자식 로거가 아님) · `dart-alert failed` · `dart outage opened` 를 모두 잡는다. 실행 실패 정책(`completed_execution_count` · `result="failed"`)은 실행이 **끝날 때만** 값이 생긴다. 하지만 수집기는 치명 신호에서 곧바로 종료 1 로 끝나고, 멈춘 실행은 임대 연장이 끊겨 다음 깨움이 넘겨받는다. 그래서 13시간짜리 실행이라는 점 자체는 결함이 아니다.

**대신 「실행이 아예 생기지 않는」 장애는 어느 정책에도 걸리지 않는다(CR-50).** 스모크는 그 상태(Scheduler PAUSED)를 통과로 보고, `--scheduler-paused` 는 이미 돌고 있는 Scheduler 까지 멈춘다. 그 밖의 주요 문제는 다음과 같다.
- 스모크는 OpenDART 키만 확인한다. Supabase · 마이그레이션 · 텔레그램이 깨져 있어도 6/6 통과한다(WR-52).
- 더러운 작업 트리를 HEAD SHA 로 빌드해 배포한다(WR-51).
- `--scheduler-paused` 의 Scheduler 생성 경로에 경합이 있다(WR-50).
- 알림 정책 조회 오류를 「없음」 으로 삼켜 정책이 중복으로 생길 수 있다(WR-53).
- survey 의 예산 · 한도 확인이 확인 실패 시 그냥 진행한다(WR-54).

테스트 쪽 빈칸은 둘이다. 하나는 로거 가림이 두 단계 아래에서 새는 것을 테스트가 못 보는 점이다(WR-55 — 실측으로 `err.response.config.params.crtfc_key` 가 출력에 남음). 다른 하나는 진입점의 예산 결선을 확인하지 않는 빈 단언이다(WR-56).

문서(CLAUDE.md · docs/stack.md)의 한도 20,000 · 예산 15,000 · 주기 · 카운터 이름(`opendart_list` · `opendart_list_quota_strike`)은 배포 스크립트 · config · 마이그레이션과 맞는다. 다만 「소비처 하나」 라는 문장은 survey 스크립트와 어긋난다(IN-54).

`$HOME/.claude/gsd-core/references/necessity-review.md` 와 `cicd-review-patterns.md` 를 읽고 적용했다.


## Narrative Findings (AI reviewer)

## Critical Issues

### CR-50: 실행이 아예 생기지 않으면 아무 알림도 없다 — 스모크는 PAUSED 를 통과로 보고, `--scheduler-paused` 는 돌던 Scheduler 도 멈춘다

**File:** `ops/alert-dart-alert-failure.yaml:27-40` · `ops/alert-dart-alert-error-log.yaml:31-37` · `scripts/smoke-dart-alert.sh:13-14, 86-95` · `scripts/deploy-dart-alert.sh:257-259, 459-463`

**Issue:** 장애 감시 경로는 세 가지뿐이다.
- 실행 실패 정책: 실행이 종료 1 로 끝나야 값이 생긴다.
- error 로그 정책: 실행이 error 로그를 남겨야 걸린다.
- 단체방 「멈췄습니다」: 다음 깨움 실행의 시작 점검이 올린다.

세 경로 모두 **실행이 하나라도 뜬다**는 전제 위에 있다. 반대로 Scheduler 가 깨우지 않는 경우는 하나도 덮지 못한다. 그런 경우로는 PAUSED, Scheduler SA 의 `run.invoker` 바인딩 유실(403), Scheduler 삭제 · 대상 URI 오류가 있다. 이때는 실행 0 · 로그 0 · 단체방 글 0 이고, 이메일도 오지 않는다. D-16(「장애는 이메일 + 단체방 양쪽에 알린다」)이 막으려던 「조용한 끊김」 이 그대로 남는다.

이 상태로 가는 길을 스크립트가 직접 만든다.
- `deploy-dart-alert.sh:459-463` 은 `--scheduler-paused` 가 있으면 생성 · 갱신 경로를 가리지 않고 `gcloud scheduler jobs pause` 를 부른다. 운영 중 재배포에 이 플래그를 붙이면 살아 있는 Scheduler 가 멈춘다.
- `smoke-dart-alert.sh:13-14 · 94-95` 는 PAUSED 를 「실패로 보지 않는다」 며 상태를 출력만 하고 통과시킨다.

구체 시나리오: 평일 낮에 첫 배포 날 절차를 다시 따라 하며 `--scheduler-paused` 로 재배포한다.
1. 지금 도는 실행은 임대를 쥔 채 20:00 까지 정상으로 돈다. 스모크도 6/6 통과다.
2. 4단계 `resume` 을 빠뜨리면 다음 평일부터 깨움이 0 이다.
3. 그 뒤로 실행 · 로그 · 단체방 글 · 이메일이 전부 0 이다. 공개매수 공시가 와도 아무도 모르고, 끊김은 사람이 눈치챌 때까지 이어진다.

`gcloud run jobs remove-iam-policy-binding` 같은 IAM 변경으로 403 이 나도 결과는 같다. Scheduler 의 실패 로그(`resource.type="cloud_scheduler_job"` · severity ERROR)를 보는 정책이 없다.

**Fix:**
```bash
# 1) deploy: 이미 있는 Scheduler 에는 --scheduler-paused 를 거부(생성 경로에서만 허용)
if [[ "$SCHEDULER_PAUSED" == 1 && "$SCHED_EXISTED" == 1 ]]; then
  echo "ERROR: $SCHEDULER_NAME 가 이미 있다 — --scheduler-paused 는 첫 생성 때만(운영 중 깨움을 멈추지 않는다)" >&2
  exit 1
fi
# 2) smoke: PAUSED 는 기본 FAIL — 첫 배포 날만 DART_SMOKE_ALLOW_PAUSED=1 로 통과
scheduler_enabled() { [[ "$SCHED_STATE" == ENABLED || "${DART_SMOKE_ALLOW_PAUSED:-0}" == 1 ]]; }
check "INV-3b scheduler ENABLED" scheduler_enabled
```
```yaml
# 3) ops/alert-dart-alert-scheduler.yaml — 깨움 자체의 실패
conditions:
  - displayName: dart-alert wake scheduler error
    conditionMatchedLog:
      filter: |
        resource.type = "cloud_scheduler_job"
        AND resource.labels.job_id = "gh-radar-dart-alert-wake"
        AND severity >= ERROR
```
PAUSED · 삭제처럼 Scheduler 로그도 남지 않는 경우는 「평일 KST 07:00 ~ 20:00 에 `dart-alert start` 로그가 30분 넘게 0건」 을 보는 정책으로 덮는다. 로그 기반 지표에 PromQL `absent_over_time` 을 걸고 `hour()` · `day_of_week()` 로 UTC 22:00 ~ 11:00 · 평일만 남긴다.


## Warnings


### WR-01: 넣기가 계속 실패하면 모든 알림이 소리 없이 멈춘다 — 경고 로그만 남고 장애 판정을 건너뛰며, 한 행이 묶음 전체를 막는다

**File:** `workers/dart-alert/src/collector.ts:446-459`, `workers/dart-alert/src/lap.ts:144-147`, `workers/dart-alert/src/lap.ts:207-216`, `workers/dart-alert/src/watches.ts:97-104`, `supabase/migrations/20261113200000_dart_alert.sql:64`, `supabase/migrations/20261113200000_dart_alert.sql:252`
**Issue:**
- `lap()` 은 `collectOnce` 가 던진 넣기 오류 중 `LeaseLostError` 가 아닌 것을 아무 처리 없이 삼킨다(451-454). 그러면 `r` 이 null 이 되어 `takeResult` 와 `judgeOutage` 를 모두 건너뛴다(455 · 459).
- 넣기 실패 로그는 `lap.ts:213` 의 warn `dart alert insert failed` 하나뿐이다. 이메일 정책은 level 50 이상만 잡는다.
- 미송신 error(`alert unsent over 120s`)는 송신을 한 번 시도했다 실패한 행(`pacer.unsent`)만 센다. DB 에 들어가지도 못한 행은 대상이 아니다.
- 넣기는 감시 대상 둘의 행을 **한 번의 RPC** 로 넣는다. 한 행이 DB 제약에 걸리면 묶음 전체가 실패한다. 그 행은 `seen` 에도 들어가지 않으므로 다음 바퀴에 같은 행으로 다시 실패한다.
- `judgeRow` 는 `rcept_dt` 를 검증하지 않는다. `toIsoDate` 는 8자리가 아니면 값을 그대로 넘긴다(undefined 면 JSON 에서 키가 빠진다). DB 는 `(e->>'rcept_dt')::date` 를 NOT NULL date 칸에 넣는다.

**구체적 실패 경로:** OpenDART 가 주요사항보고서 한 행을 `rcept_dt` 없이(또는 `""` · `"2026111"` 처럼) 준다.
1. 매 바퀴 `dart_alert_insert` 가 23502(NOT NULL 위반) 또는 22007(날짜 형식 오류)로 실패한다.
2. 같은 바퀴의 **공개매수 신고서 행도 함께 들어가지 못한다.**
3. 실패는 5 ~ 10초마다 warn 으로만 쌓인다. DART 조회는 성공하므로 장애가 열리지 않고 「멈췄습니다」 도 이메일도 없다.
4. 이 상태가 그날 20:00 까지 이어진다. 스키마가 어긋나 넣기 RPC 가 계속 실패하는 경우도 똑같다.

**Fix:**
```ts
// watches.ts judgeRow — DB 가 받는 꼴만 통과
if (typeof row.rcept_dt !== "string" || !/^[0-9]{8}$/.test(row.rcept_dt)) return { send: false, reason: "invalid" };

// collector.ts lap() — 연속 넣기 실패를 세어 올린다
private insertFailSince: number | null = null;
...
} catch (err) {
  if (err instanceof LeaseLostError) throw err;
  this.insertFailSince ??= startedAt;
  if (startedAt - this.insertFailSince > OUTAGE_AFTER_MS) {
    this.d.log.error({ err: safeErrorFields(err), sinceMs: startedAt - this.insertFailSince }, "dart alert insert failing");
    // 장애 판정에도 넣는다(예: openOutage("공시 저장 실패", this.insertFailSince))
  }
}
if (r) { this.insertFailSince = null; this.takeResult(r); }
```
한 행이 묶음을 막지 않게 하는 방법도 있다. 묶음 넣기가 실패하면 행마다 따로 넣어 보고, 실패한 행만 error 로 남긴 뒤 `seen` 에 넣는다.

### WR-02: 「멈췄습니다」 · 「다시 동작」 짝이 깨지는 길 — notice 기록 실패 · 복구 글 실패가 재시도되지 않는다

**File:** `workers/dart-alert/src/collector.ts:570-579`, `workers/dart-alert/src/collector.ts:593-611`, `supabase/migrations/20261113200000_dart_alert.sql:453-454`, `supabase/migrations/20261113200000_dart_alert.sql:478`
**Issue:** D-16 은 두 글이 짝을 이루게 하라고 정했다. 아래 두 길에서 짝이 깨진다.

(가) **「멈췄습니다」 는 나갔는데 notice 기록 RPC 가 실패한 경우.** `openOutage` 는 error 로그만 남기고 넘어간다(576-577). DB `outage_notice` 는 `pending` 으로 남는다.
- 같은 실행이 복구하면: `closeOutage` 는 DB 의 `notify`(= notice 가 `sent` 였는가)만 본다(605). 값이 false 라 「다시 동작」 이 **나가지 않는다**. 단체방에는 「멈췄습니다」 만 남는다.
- 복구 전에 실행이 바뀌면: 다음 실행의 `startupCheck` 가 `notice === "pending"` 을 보고 다시 연다(510). DB 도 `opened: true` 를 준다(마이그레이션 453-454). 그래서 **「멈췄습니다」 가 한 번 더 나간다**.

(나) **「다시 동작」 송신이 실패한 경우**(텔레그램 일시 장애 · 429 · SIGTERM 으로 null). DB 는 이미 닫혔고(`close` 가 칸 세 개를 NULL 로 만든다) 메모리의 `this.outage` 도 null 이 됐다(604). 다시 보낼 길이 없다. 결과 로그는 info `dart outage closed` 하나뿐이라 이메일도 없다(608-611).

**구체적 실패 경로:** 10:00 OpenDART 5분 장애 → 「멈췄습니다」 송신 성공 → `dart_alert_outage(notice)` 왕복 중 Supabase 일시 오류 → 10:12 DART 복구 → `close` 가 `notify:false` 를 돌려줌 → 단체방에는 그날 「멈췄습니다」 만 남는다. 방 사람들은 알림이 계속 멈춰 있다고 믿는다.

**Fix:**
- 메모리에 「멈췄습니다」 를 실제로 보냈다는 사실(`this.outage.noticeSent = true`)을 둔다.
- notice 기록이 실패하면 다음 바퀴의 `maintain` 에서 `db.outage("notice", "sent")` 를 다시 부른다.
- `closeOutage` 의 `notify` 는 `res.notify === true || this.outage?.noticeSent === true` 로 판정한다.
- 복구 글 송신이 `ok` 가 아니면 `pendingRecovered` 로 들고 있다가 다음 바퀴에 pacer 규칙대로 다시 보낸다. 실패 결과는 info 가 아니라 warn 으로 남기고, 끝내 못 보내면 error 로 남긴다.

### WR-03: HTTP 429 · 403(OpenDART 본문이 없는 응답)을 일시 장애로 분류한다 — 차단 신호에도 5 ~ 10초마다 계속 조회한다

**File:** `workers/dart-alert/src/dart/client.ts:144-151`, `workers/dart-alert/src/collector.ts:673-683`
**Issue:** `fetchListPage` 는 `validateStatus: () => true` 로 모든 상태를 받는다.
- 5xx 는 transient 로 본다.
- 4xx 라도 본문이 OpenDART JSON(`status` 문자열)이 아니면 `"invalid body"` transient 로 던진다(149-151). 게이트웨이나 WAF 가 주는 429 Too Many Requests · 403 Forbidden HTML 응답이 여기에 들어간다.
- `noteListError` 는 transient 를 멈출 이유로 보지 않는다. 그래서 수집기는 장애 글만 올리고 그날 20:00 까지 바퀴마다 감시 대상 2건씩 계속 부른다.

collector.ts 머리말(58행)은 「한도 · 차단 신호에 재시도로 두드리지 않는다」 고 적었고, CLAUDE.md 「공식 API 운영 기준」 ④ 도 같다. HTTP 429 는 그 자체가 속도 제한 신호인데 지금은 「두드리기」 로 이어진다.

**구체적 실패 경로:** OpenDART 앞단이 IP 단위로 429(HTML 본문)를 주기 시작한다.
1. 장전 5초 간격이면 분당 24회, 시간당 1,440회를 차단된 상태에서 계속 보낸다.
2. 5분 뒤 장애 글이 나간다.
3. 호출은 예산 15,000회를 다 쓰거나 창이 끝날 때까지 이어지고, 차단이 길어질 위험이 커진다.

**Fix:**
```ts
// dart/client.ts — 본문 분류 전에 HTTP 차단 신호를 먼저 가른다
if (res.status === 429) throw new DartApiError(429, null, "quota", "http 429");
if (res.status === 401 || res.status === 403) throw new DartApiError(res.status, null, "key", `http ${res.status}`);
```
이렇게 하면 기존 halt 경로(429 는 한도 의심 기록 + 다음 실행 단독 탐침 1건, 403 은 종료 1)를 그대로 탄다.

### WR-04: axios `timeout` 은 「연결된 뒤 응답이 없는 시간」 만 재고, Supabase 호출에는 제한 시간이 없다 — 90초 임대 · 송신 기한 계산의 전제(요청당 최대 10초)가 성립하지 않는다

**File:** `workers/dart-alert/src/telegram/client.ts:22-29`, `workers/dart-alert/src/dart/client.ts:107-113`, `workers/dart-alert/src/services/supabase.ts:12-14`, `workers/dart-alert/src/collector.ts:55-57`, `supabase/migrations/20261113200000_dart_alert.sql:29-31`
**Issue:**
- 마이그레이션의 송신 기한 90초(29-31)와 collector.ts 의 「직전 연장 뒤 최대 경과 ≈ 30초 + 송신 최악 약 55초 < TTL 90초」(55-57)는 둘 다 「텔레그램 요청 하나는 10초 안에 끝난다」 를 전제로 한다.
- 그런데 설치된 axios 1.15 의 Node 어댑터는 `timeout` 을 `req.setTimeout(timeout)` 으로 건다(`node_modules/.pnpm/axios@1.15.0…/lib/adapters/http.js:903`). Node 의 `ClientRequest.setTimeout` 은 소켓이 **연결된 뒤에야** 걸리는 유휴 타이머다. DNS 조회 · TCP 연결 단계는 재지 않는다. SYN 이 버려지면 OS 연결 제한 시간(리눅스 기본 약 127초)까지 기다린다. 응답이 조금씩 흘러들어와도 끊지 않는다.
- Supabase 클라이언트는 `fetch` 에 제한 시간을 주지 않는다. undici 기본값으로 응답 머리를 최대 300초까지 기다린다.
- 송신 루프(`deliverPending`) 안에서는 임대를 연장하지 않는다. 그래서 요청 하나가 걸리면 TTL 90초를 넘긴다.
- 메모리의 「GCP 서울 엣지 주기 끊김(간헐 패킷 손실)」 이 이 프로젝트에서 실제로 관측된 조건이다.

**구체적 실패 경로:**
1. 실행 A 가 차례 5건을 잡는다. 첫 송신에서 TCP 연결이 SYN 손실로 약 2분 멈춘다.
2. A 의 임대가 90초에 끝나고, 5분 깨움으로 뜬 실행 B 가 임대를 새로 잡으며 A 의 `sending` 행을 `pending` 으로 되돌린다.
3. B 가 그 5건을 보낸다.
4. A 의 연결이 되살아나 손에 쥔 `rows` 를 이어서 보낸다. `mark` 가 55000 을 받기 전까지 **같은 공시가 단체방에 두 번** 간다.

DB(Supabase)가 멈춰 `leaseAcquire` 연장 호출 자체가 걸려도 `LEASE_UNCONFIRMED_MS` 판정이 돌지 않는다. 60초 안에 스스로 멈춘다는 설계가 깨진다.

**Fix:** 요청마다 전체 시간 상한을 `AbortSignal` 로 건다.
```ts
// telegram/client.ts sendMessage · dart/client.ts fetchListPage
await http.post(path, body, { validateStatus: () => true, signal: AbortSignal.timeout(10_000) });
// services/supabase.ts
createClient(url, key, { auth: {...}, global: { fetch: (i, init) => fetch(i, { ...init, signal: AbortSignal.timeout(10_000) }) } });
```
`AbortSignal.timeout` 으로 끊긴 오류도 기존 catch 가 transient 로 처리한다(키 · 토큰을 싣지 않는 경로 그대로).

### WR-05: 멈추는 길(한도 · 예산 소진 · 창 끝)에서 이미 넣은 미송신 건이 버려지고, 다음 날 `expired` 는 info 로만 남는다

**File:** `workers/dart-alert/src/collector.ts:278`, `workers/dart-alert/src/collector.ts:282`, `workers/dart-alert/src/collector.ts:287-288`, `workers/dart-alert/src/collector.ts:694-700`, `workers/dart-alert/src/collector.ts:712-713`, `workers/dart-alert/src/lap.ts:331-341`, `supabase/migrations/20261113200000_dart_alert.sql:171-175`
**Issue:** collector.ts 712-713 주석은 「이미 넣은 건은 OpenDART 호출 없이 보낼 수 있다」 는 원칙을 적었다. 그런데 실제로는 아래와 같다.
- `budgetGate` 는 바퀴 시작이나 기다리는 걸음에서 `StopRun(1)` 을 던진다. 재시도 대기(`next_attempt_at` 이 미래) 중인 `pending` 행은 다시 보낼 기회 없이 실행이 끝난다.
- 그 뒤 5분마다 뜨는 실행도 `budget_at_start`(282)나 한도 의심 탐침 실패(287-288)로 **송신 차례(`deliverPending`)를 부르기 전에** 끝난다. 텔레그램이 멀쩡해도 그날은 보내지 않는다.
- `alert unsent over 120s` error 는 `deliverPending` 안에서만 계산한다(lap.ts 331-341 · 349). 다시 불리지 않으면 error 도 남지 않는다.
- 다음 날 아침 임대를 새로 잡으면 이 행들은 `expired` 로 닫힌다(마이그레이션 171-175). 로그는 info `past-day alerts expired on takeover` 하나뿐이다(278). 이미 찾아낸 공시 알림이 단체방에 끝내 안 갔다는 사실이 이메일로 오지 않는다.

RESEARCH 392행의 「그날 밤 이메일이 이미 갔다」 는 120초 넘게 송신 시도가 반복된 행에만 맞는 말이다.

**구체적 실패 경로:** 14:00:00 바퀴에서 유상증자결정 1건을 넣는다.
1. 텔레그램이 일시 장애(5xx)를 주고, 행이 `pending`(5초 뒤 재시도)이 된다.
2. 14:00:03 기다리는 걸음에서 예산이 다 차 `budget_exhausted` 로 종료한다(장애 글은 나감).
3. 이후 5분마다 뜨는 실행은 모두 `budget_at_start` 로 송신 없이 끝난다.
4. 다음 날 07:00 그 건이 `expired` 가 된다. 이 알림에 대해서는 이메일도 error 로그도 없다.

공개매수 행이어도 똑같다.

**Fix:**
- `budget_at_start` · `probe_failed` · halt 종료 길에서도 임대를 쥔 실행은 `deliverPending` 을 한 번 이상 돌린 뒤 끝낸다(OpenDART 호출 0).
- 종료 직전 오늘 `pending` · `sending` 수를 읽어, 0 이 아니면 error `alerts left unsent at stop`(수 · 이유)를 남긴다.
- 임대를 잡을 때 `lease.expired > 0` 이면 info 대신 error `unsent alerts expired`(수)로 남긴다.


### WR-50: `--scheduler-paused` 생성 경로의 경합 — 만든 직후 멈추기 전에 깨움이 나가면 그날 공시가 「(늦은 알림)」 으로 쏟아진다

**File:** `scripts/deploy-dart-alert.sh:447-463`

**Issue:** 생성 경로는 `gcloud scheduler jobs create http`(ENABLED 상태로 생성) 다음에 `gcloud scheduler jobs pause` 를 따로 부른다. 둘 사이 수 초 안에 5분 경계(예: 09:05:00)가 끼면 깨움이 나가고, Job(Section 5 에서 이미 배포됨)이 auto 로 뜬다.

pause 호출이 일시 오류로 실패해도 같은 상태가 된다. `set -e` 로 스크립트는 끝나지만 Scheduler 는 ENABLED 로 남는다. 그러면 seed 없이 창 안에서 첫 auto 실행이 돌고, 그 결과는 테스트가 고정한 그대로다.
- `collector.test.ts:204-214`: 그날 이미 올라온 건 전부가 「(늦은 알림)」 으로 단체방에 나간다.
- `outage.test.ts:163-171`: 「⚠ 멈췄습니다 — 07:02 부터」 · 「✅ 다시 동작」 짝 글도 같이 나간다.

`--scheduler-paused` 가 막으려던 결과가 바로 이것이다.

**Fix:** 처음 만들 때는 당장 울리지 않는 일정으로 만들고, 멈춘 뒤에 진짜 일정으로 바꾼다(update 는 PAUSED 상태를 바꾸지 않는다).
```bash
if [[ "$SCHEDULER_PAUSED" == 1 ]]; then
  gcloud scheduler jobs create http "$SCHEDULER_NAME" --schedule="0 0 1 1 *" … # 1월 1일 0시 — 곧 울리지 않음
  gcloud scheduler jobs pause "$SCHEDULER_NAME" --location="$REGION" --project="$EXPECTED_PROJECT"
  gcloud scheduler jobs update http "$SCHEDULER_NAME" --schedule="$SCHEDULE" …
fi
```
아니면 Scheduler 생성 · 멈춤을 Section 5(Job 배포)보다 앞에 둔다. Job 이 없을 때 나간 깨움은 404 로 끝나 실행이 생기지 않는다.

### WR-51: 커밋 안 된 작업 트리를 HEAD SHA 로 빌드해 배포한다 — 이미지 태그 · APP_VERSION 이 실제 코드와 다르다

**File:** `scripts/deploy-dart-alert.sh:341, 382-392`

**Issue:** `SHA=$(git rev-parse --short HEAD)` 로 태그 · `APP_VERSION` 을 정한다. 그런데 `docker build … .` 는 작업 트리를 그대로 컨텍스트로 쓴다. Dockerfile 이 `workers/dart-alert/` 전체와 루트 `package.json` · `pnpm-lock.yaml` 을 복사하므로, 커밋 안 된 수정이 이미지에 들어간다.

이 저장소는 여러 세션이 한 체크아웃을 동시에 쓴다(지금도 다른 세션의 미커밋 변경이 있다). 그래서 「`dart-alert:<깨끗한 sha>`」 라는 이름으로 커밋에 없는 코드가 운영에 나가고, 사고 뒤 `APP_VERSION` 으로 되짚어도 그 코드를 찾을 수 없다. `:latest` 도 같이 덮어쓴다.

같은 저장소의 `scripts/deploy-tick-convert.sh:123` · `scripts/deploy-tickgw.sh:146` 에는 이미 이 가드가 있다.

**Fix:**
```bash
BUILD_PATHS=(workers/dart-alert package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json)
if [[ -n "$(git status --porcelain -- "${BUILD_PATHS[@]}")" ]]; then
  echo "ERROR: 빌드 경로에 커밋 안 된 변경이 있다 — 커밋하거나 전용 worktree 에서 배포" >&2
  git status --short -- "${BUILD_PATHS[@]}" >&2
  exit 1
fi
```

### WR-52: 스모크는 OpenDART 키만 확인한다 — Supabase · 마이그레이션 · 텔레그램이 깨져도 6/6 통과하고, 되돌릴 길도 없다

**File:** `scripts/smoke-dart-alert.sh:59-61, 100-115` · `scripts/deploy-dart-alert.sh:403-416, 524`

**Issue:** INV-1 의 probe 모드(`collector.ts` `probeMode`)는 DART 공개매수 1쪽 1회만 부르고 끝난다. 임대 · 넣기 · 차례 · 장애 RPC 를 하나도 부르지 않는다. 마지막 사용량 flush 가 실패해도 warn(`usage flush failed`)만 남기고 종료 0 이다.

그래서 다음 경우 모두 INV-1 · INV-4 가 통과하고 `✅ deploy-dart-alert.sh complete` 가 찍힌다.
- 배포 때 넘긴 `SUPABASE_URL` 오타(`--set-env-vars` 가 Job env 를 통째로 바꾼다)
- 마이그레이션 미적용
- 서비스롤 키 폐기
- 봇 토큰 폐기
- 봇이 단체방에서 내보내짐

그 뒤에 벌어지는 일은 이렇다.
- Supabase 쪽 문제: 다음 깨움부터 매번 `dart-alert failed` 종료 1 이 된다(이메일은 오지만 배포는 「완료」 로 끝난 뒤다).
- 텔레그램 쪽 문제: 첫 공시가 올라와 120초가 지나야 `alert unsent over 120s` 가 뜬다. 몇 시간 뒤일 수 있고, 그 공시는 이미 늦었다.

게다가 스모크가 실패해도 Job 은 이미 새 이미지 · 새 env 로 바뀌어 있다. 직전 이미지 이름을 남기지 않아 되돌리는 명령도 없다(배포 후 상태 확인은 있지만 되돌리기 경로가 없다).

**Fix:**
- 배포 전에 `PREV_IMAGE=$(gcloud run jobs describe "$JOB" … --format='value(spec.template.spec.template.spec.containers[0].image)' 2>/dev/null || true)` 를 남긴다. 스모크가 실패하면 `gcloud run jobs update "$JOB" --image="$PREV_IMAGE"` 를 안내하거나 그대로 실행한다.
- 스모크에 다음 두 항목을 더한다.
  - INV-6: Job env `SUPABASE_URL` 이 배포 값과 같은지 확인하고, `bash scripts/dart-alert-report.sh stats 1` 이 성공하는지 본다(RPC · 마이그레이션 · 서비스롤 키).
  - INV-7: 글을 올리지 않는 텔레그램 확인. 수집기에 `DART_ALERT_MODE=check`(getMe + getChat — 방에 글 0)를 두는 것은 part A 범위다.
- probe 의 마지막 flush 실패를 종료 1 로 바꿀지도 part A 와 같이 정한다.

### WR-53: 알림 정책 update-or-create 가 조회 오류를 「없음」 으로 삼킨다 — 일시 오류 한 번에 정책이 중복으로 생긴다

**File:** `scripts/deploy-dart-alert.sh:490-502` · `scripts/smoke-dart-alert.sh:120-125`

**Issue:** `EXISTING_POLICY=$(gcloud alpha monitoring policies list … 2>/dev/null | head -1 || true)` 는 인증 만료 · 네트워크 오류 · API 오류를 빈 문자열로 바꾼다. 그러면 「없음」 으로 보고 `create` 를 부르므로, 같은 `displayName` 의 정책이 하나 더 생긴다.

그 뒤로는 이렇게 된다.
- 장애 하나에 메일이 2통씩 온다.
- 다음 배포부터 `head -1` 이 첫 정책만 갱신한다. 둘째 정책은 옛 필터 · 옛 문서로 영원히 남는다.

스모크 INV-5 도 `head -1` 이라 중복을 못 잡는다. 되풀이 실행해도 결과가 같아야 한다는 조건(멱등)이 일시 오류 한 번에 깨진다.

**Fix:**
```bash
if ! EXISTING=$(gcloud alpha monitoring policies list --project="$EXPECTED_PROJECT" \
      --filter="displayName=\"${ALERT_NAME}\"" --format='value(name)'); then
  echo "ERROR: 알림 정책 조회 실패 — 중복 생성을 막으려고 멈춘다" >&2; exit 1
fi
N=$(printf '%s\n' "$EXISTING" | grep -c . || true)
(( N > 1 )) && { echo "ERROR: ${ALERT_NAME} 정책이 ${N}개 — 하나만 남기고 지운 뒤 다시" >&2; exit 1; }
```
스모크의 `policy_exists` 도 「정확히 1개」 를 단언한다.

### WR-54: survey 의 오늘 사용량 · 한도 의심 확인이 확인 실패 시 그냥 진행하고, 호출 수는 끝에서만 더한다

**File:** `scripts/dart-alert-report.sh:41-42, 182-200, 302-310`

**Issue:**
- `dart_alert_ops_stats` 호출이 실패하면(일시 네트워크 오류 · Supabase 지연) `WARN … 오늘 사용량 확인 없이 진행` 으로 넘어간다. 응답 JSON 을 못 읽어도 node 가 `0 0` 을 찍어 「호출 0 · 한도 의심 0」 으로 본다. 한도 의심 표시가 있는 날에도, 예산에 가까운 날에도 확인 없이 최대 70회(B001 60쪽 + D004 10쪽)를 부를 수 있다.
- 예산 상한이 `BUDGET_LIMIT=15000` 으로 박혀 있다. Job 의 `DART_ALERT_DAILY_BUDGET` 을 낮춰 배포했어도 survey 는 15,000 으로 판단한다.
- 호출 수는 맨 끝 `incr_api_usage` 한 번으로만 더한다. Ctrl-C · 터미널 종료로 도중에 끊기면 그때까지 부른 호출이 카운터에 들어가지 않는다(`trap cleanup` 은 변수 · 임시 디렉터리만 지운다).

구체 시나리오: 100건 넘는 날이 이어져 오늘 사용량이 14,950 인 오후에 survey 를 돌린다. stats RPC 가 한 번 실패하면 survey 는 그냥 진행한다. 수집기는 flush 때 늘어난 누적(15,000 초과)을 받아 `budget_exhausted` 로 종료 1 하고, 그날 남은 시간 동안 깨움마다 `budget_at_start` 로 끝난다. 그날 나머지 공시 알림이 전부 끊긴다(공식 API 운영 기준 ①을 지키려고 둔 상한이 거꾸로 수집을 막는다).

**Fix:** 확인을 못 하면 멈춘다. 예산은 Job 설정에서 읽고, 호출 수는 쪽마다 바로 더한다(trap 에서 남은 몫 flush).
```bash
STATS="$(sb_rpc dart_alert_ops_stats '{"p_days":1}')" || { echo "ERROR: 오늘 사용량을 확인하지 못해 조사하지 않는다(재시도는 사람이)" >&2; exit 1; }
BUDGET_LIMIT="$(gcloud run jobs describe gh-radar-dart-alert --region=asia-northeast3 --project="$PROJECT" \
  --format=json | node -e '…env 에서 DART_ALERT_DAILY_BUDGET, 없으면 15000…')"
```
node 파서도 `catch { console.log("0 0") }` 대신 종료 1 을 낸다.

### WR-55: 로거 가림 테스트가 한 단계 아래까지만 본다 — 진짜 AxiosError 를 그대로 남기면 `err.response.config.params.crtfc_key` 가 출력된다(실측)

**File:** `workers/dart-alert/tests/logger.test.ts:53-75`

**Issue:** 이 테스트는 손으로 만든 `err.config` · `err.request` · `err.url` 같은 한 단계 아래 필드만 넣고 「가린다」 고 단언한다. 하지만 axios 가 실제로 던지는 오류에는 `response` 가 있고, 그 안에 다시 `config`(URL · `params.crtfc_key`) · `request`(경로 `/bot<토큰>/…`)가 들어 있다.

pino 경로 `*.config` 는 한 단계만 맞으므로 `err.response.config` 는 가려지지 않는다. 진짜 `createLogger` 에 `new AxiosError(…, config, {}, { status: 500, config, … })` 를 `log.error({ err })` 로 넘겨 확인했다. 출력에 `"response":{"status":500,…,"config":{"url":"/api/list.json","params":{"crtfc_key":"SECRETKEY123"}…}}` 가 그대로 남았다.

지금 src 의 로그 호출은 모두 `safeErrorFields` 를 거치므로 당장 새는 경로는 없다. 그러나 이 테스트는 「마지막 그물」(logger.ts 머리 주석)이 성하다는 거짓 확신을 준다. 누군가 `log.warn({ err }, …)` 한 줄만 써도 OpenDART 키 · 봇 토큰이 Cloud Logging(30일 보관)에 남는다. 가림 경로 자체를 고치는 일은 part A(src/logger.ts) 몫이다.

**Fix:** 진짜 AxiosError(응답 포함) · 텔레그램 경로 오류를 넣는 테스트를 더해 지금 구멍을 빨간 테스트로 드러낸다.
```ts
it("진짜 AxiosError(응답 포함)를 통째로 남겨도 키 · 토큰이 없다", () => {
  const { log, output } = capture();
  const config = { url: `/bot${BOT}/sendMessage`, params: { crtfc_key: KEY }, headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
  log.error({ err: new AxiosError("Request failed", "ERR_BAD_RESPONSE", config, {}, { status: 500, statusText: "", headers: {}, config, data: "x" }) }, "raw");
  for (const v of [KEY, BOT, "TEST-BOT-TOKEN"]) expect(output()).not.toContain(v);
});
```

### WR-56: 진입점의 예산 · 한도 의심 결선을 어떤 테스트도 확인하지 않는다 — 단언 없는 `usage.add(3)` 과 날짜를 버리는 가짜 DB

**File:** `workers/dart-alert/tests/modes.test.ts:332-334` · `workers/dart-alert/tests/helpers/fakes.ts:604-626`

**Issue:** `buildDeps` 테스트는 `deps.db.usage.add(3)` 을 부르고 아무것도 단언하지 않는다. `strikes.record` · `leaseAcquire` 도 `typeof === "function"` 만 본다.

가짜 DB 의 `usage.read` · `usage.flush` · `strikes.read` 는 날짜 인자를 버린다(`read: async () => state.used`). 결국 `index.ts` 의 결선(`usage.read → checkBudget(opendart_list, KST 날짜)` · `strikes.read/record → opendart_list_quota_strike`)이 맞는지는 어떤 테스트에도 걸리지 않는다. `budget.test.ts` 는 함수 하나씩만 보고, collector 테스트는 가짜 DB 만 쓰기 때문이다.

구체 시나리오: 누군가 `usage.read: (d) => readQuotaStrikes(supabase, d)` 로 잘못 묶는다. 306건이 그대로 통과하고, 수집기는 시작 사용량을 늘 0 ~ 몇으로 읽는다. 예산 가드(공식 API 운영 기준 ① 의 유일한 강제점)가 여러 실행에 걸쳐 15,000 을 못 막고, 하루 호출이 공식 20,000 에 닿으면 `020` 으로 그날 수집이 꺼진다.

**Fix:** `buildDeps` 에 가짜 supabase 클라이언트를 넣을 틈을 두고(또는 `vi.mock("../src/services/supabase")`) 결선을 단언한다.
```ts
await deps.db.usage.read("2026-11-16");
expect(from).toHaveBeenCalledWith("api_usage");
expect(eqCalls).toEqual([["service", "opendart_list"], ["usage_date", "2026-11-16"]]);
deps.db.usage.add(3); await deps.db.usage.flush("2026-11-16");
expect(rpc).toHaveBeenCalledWith("incr_api_usage", { p_service: "opendart_list", p_date: "2026-11-16", p_amount: 3 });
await deps.db.strikes.record("2026-11-16");
expect(rpc).toHaveBeenLastCalledWith("incr_api_usage", { p_service: "opendart_list_quota_strike", p_date: "2026-11-16", p_amount: 1 });
```
가짜 DB 의 `usage` · `strikes` 도 날짜별 Map 으로 바꾸고, 날짜가 KST `YYYY-MM-DD` 꼴인지 단언한다.


## Info


### IN-01: 다시 연 장애 글의 사유 · 시작 시각이 처음 연 실행의 것과 다르다

**File:** `workers/dart-alert/src/collector.ts:507-511`, `workers/dart-alert/src/collector.ts:565`, `workers/dart-alert/src/collector.ts:603`, `workers/dart-alert/src/db.ts:145`
**Issue:**
- `startupCheck` 가 notice `pending` 장애를 다시 열 때 글 문구에 `stalledReason(now)`(「수집기 중단(…)」)을 쓴다. DB 에 남은 처음 사유(예: 「하루 조회 한도 초과(020)」)는 `readState` 가 읽지 않는다(`STATE_COLUMNS` 에 `outage_reason` 이 없다).
- 새로 여는 장애의 시작 시각도 갈린다. 메모리 `sinceMs` 는 감시 대상의 기준점(마지막 성공 시각)이고, DB `outage_since` 는 열린 순간(`now()`)이다. 같은 실행이 닫으면 「다시 동작」 의 「HH:MM ~ HH:MM」 이 기준점부터 계산된다. 다른 실행이 닫으면 DB 시각부터 계산된다.

**Fix:** `STATE_COLUMNS` 에 `outage_reason` 을 더하고 다시 열 때 그 사유를 쓴다. 장애를 열 때는 `res.since` 대신 메모리 기준점을 DB 에 넘기거나(`p_since`), 반대로 문구에 DB 시각을 쓰는 쪽으로 한 가지로 맞춘다.

### IN-02: CLI 진입점이 예상 밖 예외를 로그 없이 삼킨다

**File:** `workers/dart-alert/src/index.ts:143`, `workers/dart-alert/src/index.ts:170-174`
**Issue:** `createLogger(cfg.logLevel, …)` 는 `try` 밖에 있다. pino 는 모르는 level 을 받으면 예외를 던진다. 이렇게 `main()` 이 reject 되면 `() => process.exit(1)` 이 오류를 출력하지 않고 끝낸다. 지금은 배포 스크립트가 `LOG_LEVEL=info` 로 고정해 실제로 일어나기 어렵다. 그래도 「무로그 실패 금지」 원칙에 어긋나고, level 50 로그 기반 이메일도 오지 않는다.
**Fix:** reject 처리기에서 `console.error(JSON.stringify({ level: 60, msg: "dart-alert crashed", err: safeErrorFields(e) }))` 처럼 안전한 필드만 남기거나, `createLogger` 를 `try` 안으로 옮긴다.

### IN-03: 우리 쪽 송신 속도 제한 때문에 밀린 건에도 「(늦은 알림)」 이 붙는다

**File:** `workers/dart-alert/src/lap.ts:352`, `workers/dart-alert/src/lap.ts:383`, `workers/dart-alert/src/collector.ts:89`
**Issue:** 한 바퀴 5건 · 60초 18건 상한으로 차례를 기다린 행도, 처음 본 뒤 60초가 지나면 `late` 로 표기된다. lap.ts 머리말은 「앞 실패 때문」 이라고 적었지만, 실제로는 실패 없이 한꺼번에 몰려 기다린 행에도 붙는다. 아침에 주요사항보고서 20건 이상이 한 번에 맞으면, 정상 수집이었는데도 뒤쪽 건들이 「(늦은 알림)」 으로 나간다. D-12 의 「수집기가 멈췄다 다시 켜진 경우」 라는 뜻에서 벗어난다.
**Fix:** 늦음 판정을 「송신이 한 번 이상 실패했다(`attempts > 1` 또는 `last_error` 있음)」 와 「60초 경과」 를 함께 만족할 때로 좁힌다. 아니면 지금 동작을 의도로 문서에 적어 둔다.

### IN-04: 치명 종료 중 장애 글을 쓰다 임대를 잃으면 error `dart outage open failed` 가 잘못 나간다

**File:** `workers/dart-alert/src/collector.ts:619-626`, `workers/dart-alert/src/collector.ts:633-641`, `workers/dart-alert/src/collector.ts:739-742`
**Issue:** `outageOnFatal` → `openOutage` → `sendNotice` 안의 `maintain` → `renewLease` 가 `StopRun(0, "lease_lost")` 를 던질 수 있다. 이 예외는 `outageOnFatal` 의 catch 에서 error `dart outage open failed` 로 기록된다. 다른 실행이 정상적으로 넘겨받은 상황인데 이메일이 한 통 더 간다.
**Fix:** `outageOnFatal` catch 에서 `StopRun` 과 `LeaseLostError` 는 warn 으로 낮춰 남긴다.

### IN-05: 빌드 이미지 · pnpm 버전이 고정되지 않았다

**File:** `workers/dart-alert/Dockerfile:6-7`, `workers/dart-alert/Dockerfile:25`
**Issue:** `node:22-alpine` 태그와 `pnpm@10` 이 고정되지 않았다. 같은 커밋을 다시 빌드해도 다른 런타임 · 패키지 관리자가 들어갈 수 있다. 저장소의 다른 Dockerfile 과 같은 관례라 이 phase 만의 결함은 아니다.
**Fix:** `node:22.x.y-alpine@sha256:…` 와 `pnpm@10.x.y` 로 고정하는 일을 저장소 전체에서 한 번에 다룬다.

---

_Reviewed: 2026-11-13T01:21:32Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

### IN-50: 가짜 DB 의 `after` 훅 — 주석은 「넣기 · 차례 · 기록 · 장애」 라지만 넣기 · 장애에서는 부르지 않는다

**File:** `workers/dart-alert/tests/helpers/fakes.ts:375-376, 504-515, 553, 576, 580-602`
**Issue:** `after` 는 「DB 에 반영된 뒤 응답 유실 흉내」 라고 적혀 있다. 그런데 `claim`(553) · `mark`(576)에서만 부르고 `insert` · `outage` 에서는 부르지 않는다. 「넣기는 커밋됐는데 응답이 끊김」 · 「장애 open 은 반영됐는데 응답 유실(→ 다음 보유자가 notice pending 으로 다시 글)」 을 흉내 내려는 테스트를 써도 훅이 조용히 무시되어, 테스트가 의도와 달리 통과할 수 있다.
**Fix:** `insert` · `outage` 끝에도 `o.after?.("dart_alert_insert" | "dart_alert_outage", now)` 를 넣거나 주석을 실제에 맞춘다.

### IN-51: dbContract 「반환 키」 검사가 상태 문자열과 겹치는 키에서는 아무것도 확인하지 못한다

**File:** `workers/dart-alert/tests/dbContract.test.ts:342-356`
**Issue:** 키가 함수 본문 어딘가에 `'키'` 로 나오기만 하면 통과한다. `dart_alert_lease_acquire` 본문에는 상태값 `SET status = 'expired'` 가 있어서, jsonb 키 `'expired'` 를 다른 이름으로 바꿔도 이 검사는 통과한다(워커는 `expired` 를 읽어 `past-day alerts expired on takeover` 로그를 남긴다).
**Fix:** `jsonb_build_object(` 인자 목록만 잘라 짝수 번째 문자열 리터럴(키 자리)과 대조한다.

### IN-52: config.test 가 `process.env` 를 일반 객체로 바꿔 끼운다

**File:** `workers/dart-alert/tests/config.test.ts:38-50`
**Issue:** `afterEach(() => { process.env = snapshot })` 를 거치면 `process.env` 가 Node 의 특수 객체(값을 문자열로 바꿈 · `TZ` 변경 반영)가 아니게 된다. 같은 파일 뒤 테스트의 env 동작이 운영과 미묘하게 달라진다. 다른 테스트 파일(`modes.test.ts:212-222`)처럼 키 단위로 저장 · 복원하는 쪽이 안전하다.
**Fix:** `modes.test.ts` 의 `saved`/복원 꼴을 쓴다.

### IN-53: `file_mode` 의 「Linux(stat -c)」 분기는 동작하지 않는다

**File:** `scripts/setup-dart-alert-secrets.sh:86-89` · `scripts/telegram-find-chat.sh:55-57`
**Issue:** GNU `stat` 에서 `-f` 는 「파일시스템 상태」 옵션이다. 그래서 `'%Lp'` 는 파일 이름으로 해석되어 실패하고, 그 사이 `$1` 의 파일시스템 정보 여러 줄이 표준출력에 먼저 나간다. `|| stat -c '%a'` 출력이 그 뒤에 붙으므로 `MODE` 는 600 이 아니게 되고, 스크립트는 늘 「권한이 600 이 아니다」 로 멈춘다. 지금은 macOS 에서만 쓰니 영향은 없지만, 주석의 「둘 다」 는 사실이 아니다.
**Fix:** `if stat -c '%a' "$1" >/dev/null 2>&1; then stat -c '%a' "$1"; else stat -f '%Lp' "$1"; fi`

### IN-54: CLAUDE.md 「OpenDART 소비처 … 하나」 가 survey 스크립트와 어긋나고, 같은 절의 Naver 불릿은 이제 어느 API 인지 이름이 없다

**File:** `CLAUDE.md:41-49`
**Issue:**
- 48행은 소비처를 `workers/dart-alert` 하나라고 적는다. 그런데 `scripts/dart-alert-report.sh survey` 도 같은 키로 최대 약 70회를 부르고 같은 카운터 `opendart_list` 에 더한다. 스모크 probe(배포마다 1회)도 마찬가지다. 예산을 따질 때 빠지기 쉬운 소비처다.
- 절 제목이 「Naver Search API · OpenDART 등」 으로 넓어졌다. 그런데 42 ~ 45행 「공식 한도: 앱(Client ID) 당 25,000 …」 · 「예산」 · 「수집 주기」 불릿에는 Naver 라는 이름이 없어 OpenDART 불릿과 섞여 읽힌다.
**Fix:** 48행에 「(운영 도구: `scripts/dart-alert-report.sh survey` · 스모크 probe 도 같은 카운터에 더한다)」 를 붙이고, 42 ~ 45행 불릿 앞에 「Naver」 를 붙인다.

### IN-55: survey 기간이 days+1 일이다 — 90일이면 OpenDART 검색기간 제한에 걸릴 수 있고, 60쪽에서 잘리면 ⑶ 이 적게 나온다

**File:** `scripts/dart-alert-report.sh:172-179, 43, 283-285, 385-387`
**Issue:** `bgn = now - days*86400e3` 에 오늘을 포함하므로 실제 조회는 days+1 일이다(30 → 31일). OpenDART 공시검색은 고유번호(`corp_code`) 없이 검색기간이 3개월로 제한된다고 안내한다(문서 문구 기준 · 실측 안 함). 그래서 `days=90` 은 달력에 따라 3개월을 하루 넘겨 status 100 으로 첫 호출에서 멈출 수 있다. 또 B001 이 60쪽을 넘으면 오래된 날이 잘린다. 그때 ⑶(100건 넘은 날)·⑵ 평균이 경고 한 줄만 남기고 과소 집계된다.
**Fix:** `bgn = now - (days-1)*86400e3` 으로 맞추고 상한을 89일 정도로 둔다. 잘린 경우 ⑶ 머리에 「(잘림 — 앞 N쪽만)」 을 표시한다.

### IN-56: deploy 임시 YAML 은 실패하면 남고, self-test 의 추적 모드 검사는 `set -o xtrace` 를 못 잡는다

**File:** `scripts/deploy-dart-alert.sh:186-189, 487-503`
**Issue:**
- `RESOLVED_YAML=$(mktemp)` 뒤 `gcloud … policies create/update` 가 실패하면 `set -e` 로 바로 끝나 `rm -f` 에 닿지 않는다. 내용은 채널 이름뿐이라 비밀은 아니지만 `$TMPDIR` 에 쌓인다.
- `--self-test` 의 `set[[:space:]]+-[a-zA-Z]*x` 는 `set -o xtrace` · `BASH_XTRACEFD` 를 놓친다.
**Fix:** `trap 'rm -f "${RESOLVED_YAML:-}"' EXIT` 를 둔다. 검사 정규식에 `set[[:space:]]+-o[[:space:]]+xtrace` 를 더한다.

### IN-57: 스모크 INV-4 는 15분 안의 이전 probe 로그로도 통과하고, INV-1 은 실패 때 실행 이름을 버린다

**File:** `scripts/smoke-dart-alert.sh:40-51, 59-61, 100-115`
**Issue:**
- INV-4 는 `--freshness=15m` 안에 `probe ok` 가 하나라도 있으면 통과한다. 15분 안에 스모크를 두 번 돌리면 이번 probe 의 로그와 무관하게 통과한다.
- `check` 가 명령 출력을 `/dev/null` 로 버리므로, INV-1 이 실패하면 어떤 실행을 봐야 하는지(실행 이름) 화면에 남지 않는다.
**Fix:** INV-1 에서 `--format='value(metadata.name)'` 로 실행 이름을 받아 두고, INV-4 필터에 `labels."run.googleapis.com/execution_name"="$EXEC"` 를 더한다. 실패하면 그 이름을 출력한다.

### IN-58: SA 없음 힌트가 Scheduler SA 에도 setup-dart-alert-iam.sh 를 안내하지만, 그 스크립트는 Scheduler SA 를 만들지 않는다

**File:** `scripts/deploy-dart-alert.sh:295-301`
**Issue:** `gh-radar-scheduler-sa` 가 없을 때도 「Run: setup-dart-alert-iam.sh」 를 안내한다. 하지만 그 스크립트는 `gh-radar-dart-alert-sa` 만 만든다(`setup-dart-alert-iam.sh:94-101`). 안내대로 다시 돌려도 같은 오류가 난다.
**Fix:** Scheduler SA 는 「다른 워커용 기존 SA — `setup-kis-news-sync-iam.sh` 등에서 만든다」 처럼 따로 안내한다.

### IN-59: Generality without instantiation — `DART_SCHEDULERS` 배열 · 「이름|cron」 파싱 · 반복문이 원소 1개로 고정돼 있다

**File:** `scripts/deploy-dart-alert.sh:101-103, 148-173, 434-472`
**Category:** necessity
**Issue:** 배열 꼴(kis-news-sync 에서 가져온 틀)을 쓰지만, self-test 가 「원소가 정확히 1개 · 이름 `gh-radar-dart-alert-wake` · cron `*/5 7-19 * * 1-5`」 를 강제한다(148-167행). `schedule.test.ts:136-138` 도 같은 하나를 단언한다. 원소가 늘 수 없도록 잠가 둔 배열이라 반복 · `|` 분리 · `${DART_SCHEDULERS[0]%%|*}` 같은 간접 표현이 하는 일이 없다. 셋째 스크립트(smoke 34행)가 그 배열을 grep 으로 다시 읽어야 하는 복잡도만 늘린다. 판단에 기댄 지적이므로 Info 다.
**Fix:** 그대로 둬도 동작에는 문제가 없다. 단순화한다면 `SCHEDULER_NAME=…` · `SCHEDULE=…` 두 상수로 바꾸고, `schedule.test.ts` · smoke 는 그 두 줄을 읽게 한다.

---

_Reviewed: 2026-11-13T01:23:17Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
