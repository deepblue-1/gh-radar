---
phase: quick-260927-u9t
plan: 01
subsystem: ops/alerting · workers/theme-sync · workers/discussion-sync
tags: [alerting, cloud-logging, pino, severity, scraping-5-rules]
status: complete
requires: []
provides:
  - "logger severity 매핑(toCloudSeverity · buildLoggerOptions) — theme-sync · discussion-sync"
  - "로그 매치 알림 정책 YAML 2개 (gh-radar-theme-sync-source-failure · gh-radar-discussion-sync-source-failure)"
  - "배포 스크립트 알림 정책 update-or-create 섹션 2개"
affects: [workers/theme-sync, workers/discussion-sync, scripts/deploy-theme-sync.sh, scripts/deploy-discussion-sync.sh]
tech-stack:
  added: []
  patterns: ["pino formatters.level → Cloud Logging severity + 숫자 level 병기", "conditionMatchedLog 알림 정책 + 숫자 jsonPayload.level 필터"]
key-files:
  created:
    - ops/alert-discussion-sync-source-failure.yaml
    - ops/alert-theme-sync-source-failure.yaml
    - workers/theme-sync/tests/logger.test.ts
  modified:
    - workers/discussion-sync/src/logger.ts
    - workers/discussion-sync/tests/logger.test.ts
    - workers/theme-sync/src/logger.ts
    - scripts/deploy-discussion-sync.sh
    - scripts/deploy-theme-sync.sh
decisions:
  - "알림 필터는 severity 가 아니라 숫자 jsonPayload.level>=50 으로 매치 — severity 매핑 배포 전후 모두 동작"
  - "theme-sync 필터에 markBackoff warn 문자열 OR 절 — 5원칙 #4 알림을 index.ts 로그 레벨과 무관하게 보장"
  - "discussion-sync 필터에 textPayload '[discussion-sync] fatal' OR 절 — 실행 실패 알림이 없는 잡의 미처리 예외 포착"
  - "notificationRateLimit 3600s · autoClose 1800s — 다음 실행의 실패가 새 incident 로 다시 알림"
metrics:
  duration: "약 10분 (코드·검증·커밋) + 배포"
  completed: 2026-09-27
actuals:
  tokens: 6200
  tasks: 2
  commits: 1
plan_head_before: 8d88d1e07eec310fd16396e9416842adf3218825
---

# Quick 260927-u9t: theme-sync·discussion-sync 소스 실패 로그 알림 + pino severity 매핑 Summary

두 크롤링 워커의 pino 로그에 Cloud Logging `severity`(숫자 `level` 병기)를 싣고, exit 0 무음 소스 실패를 잡는 로그 매치 알림 정책 2개(`jsonPayload.level>=50` + backoff/fatal OR 절)와 배포 스크립트 update-or-create 섹션을 만들어 커밋했다. 두 잡 배포(Task 3b·3c)는 executor 단계에서 권한 분류기에 막혔고, 오케스트레이터가 같은 worktree(HEAD 90060c93)에서 배포했다. 사용자가 결과를 확인한 뒤 push 를 승인했다(2026-09-27).

## 배포 결과 (2026-09-27 13:10Z)

| 항목 | 결과 |
|---|---|
| gh-radar-discussion-sync | image discussion-sync:90060c93, DISCUSSION_CLASSIFY_ENABLED=false 유지 |
| gh-radar-theme-sync | image theme-sync:90060c93, NAVER_STOCK_API_BASE=https://m.stock.naver.com |
| gh-radar-discussion-sync-source-failure | 생성·enabled, 채널 14409521670382124894, rate limit 3600s (id 15813928916769281029) |
| gh-radar-theme-sync-source-failure | 생성·enabled, 채널 14409521670382124894, rate limit 3600s (id 8869940870717663546) |

후속: 최상위 severity 라이브 관찰 — discussion-sync 다음 정각 실행, theme-sync 2026-09-28 07:00Z 정기 실행.

## 커밋

| Task | 내용 | Commit |
| ---- | ---- | ------ |
| 1+2+3a | logger 2 · 테스트 2 · 알림 YAML 2 · 배포 스크립트 2 (8개 파일, 한국어, Co-Authored-By 없음, push 안 함) | 90060c93 |

## 검증 결과

- discussion-sync: vitest 82 passed + 3 todo (기존 77 → 신규 5: INFO/30, 레벨 매핑 5종, child ERROR/50, DEFAULT 폴백, anthropicApiKey redact). tsc 통과. 기존 redact 테스트는 이제 복제 옵션이 아니라 실제 `buildLoggerOptions` 로 동작.
- theme-sync: vitest 78 passed (기존 72 → 신규 6). tsc 통과.
- 배포 스크립트 2개: `bash -n` 통과, `gcloud alpha monitoring policies list/update/create` 세 명령 모두 `--project=` 포함.
- YAML: discussion-sync 문서 2,053B · theme-sync 문서 2,425B, `${` 없음, displayName·rate·channel placeholder 검사 통과. theme-sync backoff msg 리터럴이 `src/scrapeState.ts:95` 와 바이트 일치.
- **필터 재생(고정 창 2026-08-28T00:00Z ~ 2026-09-27T12:30Z, 실제 Cloud Logging):**
  - discussion-sync: `proxy abort signal — stopAll` 30건 + `[discussion-sync] fatal` 1건, 그 밖 0건.
  - theme-sync: `source validation failed — skip this source` 17건, 그 밖 0건.
- Tracer 게이트: Task 1 verify 끝단(필터 재생)까지 통과한 뒤 Task 2 로 확장.

## (기록) executor 단계 배포 시도 (Task 3b·3c)

`env -u DISCUSSION_CLASSIFY_ENABLED ... bash scripts/deploy-discussion-sync.sh` 실행이 자동 모드 분류기에 **[Production Deploy]** 로 거부됨. 우회하지 않았다. 현재 라이브 상태(읽기 전용 확인, 2026-09-27T13:07Z):

- `gh-radar-discussion-sync` 이미지 `discussion-sync:0c4ab92` (변경 전)
- `gh-radar-theme-sync` 이미지 `theme-sync:8d88d1e0` (변경 전)
- 알림 정책 `displayName:source-failure` 0개

사용자(또는 권한 규칙 추가 후) 실행할 명령 — 반드시 이 작업 트리 루트(HEAD=90060c93)에서:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=$HOME/.config/gcloud/gh-radar-deployer.json CLOUDSDK_CORE_PROJECT=gh-radar GCP_PROJECT_ID=gh-radar SUPABASE_URL=https://ivdbzxgaapbmrxreyuht.supabase.co NOTIFICATION_CHANNEL_ID=14409521670382124894
env -u DISCUSSION_CLASSIFY_ENABLED bash scripts/deploy-discussion-sync.sh
bash scripts/deploy-theme-sync.sh
```

두 잡 모두 `gcloud run jobs execute` 는 하지 않는다(theme-sync 네이버 호출 최소화, discussion-sync 는 매시 정각 스케줄).

배포 후 확인(플랜 Task 3 verify):
1. `gcloud alpha monitoring policies list --project=gh-radar --filter='displayName:source-failure' --format='table(displayName,enabled,notificationChannels)'` → 두 정책 True, 채널 `projects/gh-radar/notificationChannels/14409521670382124894`.
2. 두 잡 이미지가 `:90060c93` 로 끝나고 discussion-sync env `DISCUSSION_CLASSIFY_ENABLED="false"`.
3. discussion-sync severity: 배포 뒤 첫 정각(KST) 실행 이후
   `gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="gh-radar-discussion-sync" AND logName:"stdout" AND timestamp>="<배포완료 UTC>"' --project=gh-radar --limit=5 --format='value(timestamp,severity,jsonPayload.level,jsonPayload.msg)'`
   → severity 열 INFO, level 열 30 (jsonPayload.severity 는 Cloud Logging 이 최상위로 옮기므로 비어 있는 게 정상).
4. theme-sync severity: 다음 16:00 KST 정기 실행 후 같은 명령에서 job_name 만 `gh-radar-theme-sync` 로 바꿔 확인(수동 실행 금지).

## discussion-sync 배포 시 함께 실리는 변경 (0c4ab92..HEAD -- workers/discussion-sync packages/shared)

51개 커밋. workers/discussion-sync 경로 자체 변경은 이번 90060c93 과 b691b150(Vercel ignoreCommand, 워커 동작 무관) 2개뿐이고, 나머지는 전부 packages/shared 의 relay/주문/상따 계약 타입 추가(15-01, 16-03, 17-01, 18-01, 19-04, 20-02, quick-260923-* 등)다. 대표: 89f5680d, aba79543, 34910a2e, 35d95a11, d8db495c, c47829e4, 00c4cb09, 4101801a, 408fffe4, 14f1042f, 3819884f, 22b37bc4, dae6914a, bddb22d7, 20f19dd8, 2206bb10. (전체 목록은 `git log --oneline 0c4ab92..90060c93 -- workers/discussion-sync packages/shared`.)

## Deviations from Plan

None in code — Task 1·2 는 계획대로. Task 3a(커밋)까지 완료, Task 3b·3c(배포·라이브 확인)는 권한 거부로 미실행(위 "미완료" 참조).

## Known Stubs

없음.

## Threat Flags

없음 — 새 네트워크 표면 없음. redact 경로·censor 는 순서까지 보존, 문서에 시크릿 값 없음(Secret 이름만).

## Self-Check: PASSED

- FOUND: ops/alert-discussion-sync-source-failure.yaml, ops/alert-theme-sync-source-failure.yaml, workers/theme-sync/tests/logger.test.ts
- FOUND commit: 90060c93
