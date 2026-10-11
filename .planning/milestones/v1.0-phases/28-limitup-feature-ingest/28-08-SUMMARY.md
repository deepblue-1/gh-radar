---
phase: 28-limitup-feature-ingest
plan: 08
subsystem: ops (limitup-sync Cloud Run Job · Scheduler · GCS 버킷 · IAM · smoke · 알림)
tags: [ops, cloud-run-job, cloud-scheduler, gcs, iam, monitoring, smoke, docker, limit-feature]
status: complete

requires:
  - phase: 28-limitup-feature-ingest
    provides: "28-03 · 28-16 · 28-06 워커 workers/limitup-sync 완성(config env 이름 · complete/failed 로그 · 종료 코드 · limitup-grid 버킷 · limitup_purge_old)"
  - phase: 28-limitup-feature-ingest
    provides: "28-04 radar-gw 운반기 infra/relay/limitup-pull (BUCKET/export/<D>/… 업로드 경로)"
provides:
  - "workers/limitup-sync/Dockerfile — 2단 빌드 · node:22-alpine · 비root app · shared 의존 없음"
  - "scripts/deploy-limitup-sync.sh — 빌드 · 푸시 · Job gh-radar-limitup-sync(gen2 · GCS 볼륨 ro /mnt/export · 1800s/1Gi) · Scheduler gh-radar-limitup-sync-nightly(20 21 * * 1-5 Asia/Seoul) · 알림 정책"
  - "scripts/setup-limitup-sync-iam.sh — SA gh-radar-limitup-sync-sa · Secret accessor · 버킷 gs://gh-radar-limitup-export · 버킷 IAM(워커 objectViewer · relay objectUser)"
  - "scripts/smoke-limitup-sync.sh — INV-1~7 · --date YYYYMMDD · --check-scheduler"
  - "ops/alert-limitup-sync-failure.yaml — gh-radar-limitup-sync-failure(completed_execution_count result=failed > 0)"
affects: [28-14]

plan_head_before: 94c08e29d050230b2639b0a7613907adb8800f53
actuals:
  tokens: 6300    # chars/4 over 새 파일 5개(25,087자)
  tasks: 2
  commits: 2      # MEASURED: git rev-list --count 94c08e29..HEAD (SUMMARY 커밋 전)

tech-stack:
  added: []
  patterns:
    - "Cloud Run Job 에 GCS 를 Cloud Storage 볼륨(읽기 전용 · gen2)으로 마운트 — 워커는 로컬 파일시스템 코드 그대로(새 npm 의존성 0)"
    - "smoke 의 service_role 키는 변수 → 600 권한 curl 헤더 파일(-H @file)로만 — argv · stdout 노출 없음"
    - "배포 · IAM · smoke 스크립트를 가짜 gcloud/curl/docker 스텁 PATH 로 흐름 검증(클라우드 호출 0)"

key-files:
  created:
    - workers/limitup-sync/Dockerfile
    - scripts/deploy-limitup-sync.sh
    - scripts/setup-limitup-sync-iam.sh
    - scripts/smoke-limitup-sync.sh
    - ops/alert-limitup-sync-failure.yaml
  modified: []

key-decisions:
  - "28-08: 이미지에 @gh-radar/shared 를 넣지 않는다 — limitup-sync package.json 이 shared 를 의존하지 않아 shared 복사 · 빌드 · dist 복사 줄을 뺐다"
  - "28-08: deploy 는 버킷 gs://gh-radar-limitup-export 가 없으면 시작 단계에서 종료 1(볼륨 마운트 대상 없음) — IAM 스크립트를 먼저 돌리게 한다"
  - "28-08: smoke 로그 INV-2/3 은 방금 실행의 execution_name 라벨로 좁힌다(못 얻으면 최근 40분 — task-timeout 1800s + 여유)"
  - "28-08: smoke INV-4 는 보존 창 밖 날짜를 SKIP 으로 표시한다(member_alloc = KST 오늘 − 30일 · 나머지 5표 = − 90일) — 워커가 그 창 밖은 적재하지 않으므로 대조 대상이 아니다"
  - "28-08: relay SA 의 「같은 경로 재업로드」 실시험(Pitfall 8)은 smoke 가 아니라 radar-gw 운반기 첫 D+1 보충 run 에서 확인한다 — smoke 는 deployer 자격이라 relay SA 권한을 직접 시험할 수 없어 바인딩 존재(INV-7)만 본다"

requirements-completed: [D-13, D-14, D-16, D-20]

coverage:
  - deliverable: "limitup-sync 이미지(Dockerfile) — amd64 빌드 · 모듈 로드 · 비root"
    human_judgment: false
    verification:
      - kind: command
        ref: "docker build --platform linux/amd64 -f workers/limitup-sync/Dockerfile -t gh-radar-limitup-sync:plan-check . && docker run --rm --platform linux/amd64 --entrypoint node gh-radar-limitup-sync:plan-check -e \"require('./dist/index.js')\""
        status: pass
      - kind: command
        ref: "docker run … dist/index.js --dry-run (LIMITUP_EXPORT_DIR=/mnt/export/export · 실 export 4일 ro 마운트) → limitup-sync complete · 인박스 4일 합계와 일치"
        status: pass
  - deliverable: "deploy-limitup-sync.sh · alert yaml — 문법 · 볼륨/env/cron/tz · 이름 함정 0"
    human_judgment: false
    verification:
      - kind: command
        ref: "Task 1 <verify> automated (bash -n · grep 7종 · limit-up-sync 0회)"
        status: pass
      - kind: command
        ref: "스텁 gcloud/docker PATH 로 deploy 전 경로 실행 — env 가드 3종 · 버킷 없음 종료 1 · 채널 ID 정규화"
        status: pass
  - deliverable: "setup-limitup-sync-iam.sh · smoke-limitup-sync.sh — 문법 · 역할/버킷 플래그 · manifest 대조"
    human_judgment: false
    verification:
      - kind: command
        ref: "Task 2 <verify> automated (bash -n 2종 · grep 9종 · limit-up-sync 0회)"
        status: pass
      - kind: command
        ref: "스텁 gcloud/curl PATH 로 smoke 실행 — 정상 12 PASS · jumps 불일치 주입 시 FAIL 1 · --check-scheduler · manifest 없음 FAIL"
        status: pass
  - deliverable: "실제 버킷 · IAM · Job · Scheduler · 알림 정책 · 원격 smoke"
    human_judgment: true
    rationale: "클라우드 쓰기는 executor 금지 — 28-14 메인 세션 체크포인트에서 setup-iam → deploy → seed → smoke 로 실행한다"

duration: 6min
completed: 2026-10-05
---

# Phase 28 Plan 08: limitup-sync 운영 한 벌 Summary

**밤 export 적재 워커를 평일 21:20 KST Cloud Run Job(GCS 볼륨 읽기 전용 마운트 · 1800s/1Gi)으로 돌리고, 실패 실행을 알리고, 행 수를 manifest 와 대조하는 배포 · IAM · 버킷 · smoke · 알림 파일 5개. 로컬 amd64 이미지 빌드와 실 export 4일 dry-run 까지 확인했고, 클라우드에 쓰는 명령은 하나도 실행하지 않았다.**

## Performance

- **Duration:** 약 6분(측정값)
- **Started:** 2026-10-05T09:55Z
- **Completed:** 2026-10-05T10:01Z
- **Tasks:** 2
- **Files:** 5개 생성 · 수정 0

## Accomplishments

- `workers/limitup-sync/Dockerfile` — 기존 워커 Dockerfile 과 같은 2단 빌드. 이 워커는 `@gh-radar/shared` 를 쓰지 않아서 shared 줄은 뺐다. 비root `app` 사용자, `ARG GIT_SHA` → `APP_VERSION`, `CMD node dist/index.js`. 로컬 `linux/amd64` 빌드 성공. 런타임 이미지에는 `dist` · `package.json` · `node_modules`(@supabase · dotenv · pino)만 들어간다.
- `scripts/deploy-limitup-sync.sh` — env 가드(`GCP_PROJECT_ID` · `SUPABASE_URL:?` · gcloud config `gh-radar`) → 선행 SA 2개 · 버킷 존재 확인 → 빌드 · 푸시 → `gcloud run jobs deploy gh-radar-limitup-sync`(`--execution-environment=gen2` · `--add-volume=name=export,type=cloud-storage,bucket=gh-radar-limitup-export,readonly=true` · `--add-volume-mount=volume=export,mount-path=/mnt/export` · `--cpu=1 --memory=1Gi --task-timeout=1800s --max-retries=0` · env `LIMITUP_EXPORT_DIR=/mnt/export/export` + 보존 일수 3개 · Secret service-role) → Scheduler SA `run.invoker`(리소스 단위) → Scheduler `gh-radar-limitup-sync-nightly`(`20 21 * * 1-5` · `Asia/Seoul` · OAuth) → 알림 정책 update-or-create(`NOTIFICATION_CHANNEL_ID:?` 와 전체 리소스 이름 정규화. 이 env 가 없으면 마지막 단계만 실패한다).
- `ops/alert-limitup-sync-failure.yaml` — `gh-radar-limitup-sync-failure`. `completed_execution_count result="failed"` 가 5분 창에서 0보다 크면 알린다. 문서에 사유 확인용 `gcloud logging read` 와 radar-gw 쪽 `journalctl -u limitup-pull` 을 넣었다.
- `scripts/setup-limitup-sync-iam.sh` — API 를 켜고(storage 포함) 선행 SA(scheduler · relay)를 확인한다. 워커 SA 는 멱등으로 만들고 Secret accessor 를 준다. 버킷 `gs://gh-radar-limitup-export` 는 없을 때만 만든다(asia-northeast3 · STANDARD · 균일 액세스 · 공개 접근 방지 · 수명 주기 규칙 없음 — D-16). 버킷 단위 IAM 은 워커 SA `objectViewer`, relay SA `objectUser` 다. 프로젝트 IAM 은 손대지 않는다(`projects add-iam-policy-binding` 0회).
- `scripts/smoke-limitup-sync.sh` — INV-1 execute --wait · INV-2 complete 로그 ≥ 1 · INV-3 failed 로그 0 · INV-4 6표 날짜별 count == `gs://…/export/<D>/manifest.json` rows · INV-5 Scheduler ENABLED · cron · tz · INV-6 `limitup-grid/grid/<D>/` 객체 수 == manifest 의 grid 파일 수 · INV-7 버킷 IAM 바인딩 2개. `--date` 로 날짜를 고르고, 생략하면 GCS 의 최신 manifest 날짜를 쓴다. `--check-scheduler` 는 INV-5 만 돈다. 키는 env 에서, 없으면 Secret 에서 변수로만 읽는다.

## Task Commits

1. **Task 1: Dockerfile · 배포 스크립트 · 알림 정책 yaml + 로컬 amd64 빌드** — `5dbe3df4` (feat)
2. **Task 2: IAM · 버킷 스크립트 + smoke** — `c0ed3afb` (feat)

## 검증 결과

- Task 1 `<verify>` 2개 모두 PASS. `bash -n` · grep 7종 · 비주석 `limit-up-sync` 0회 · docker build + `require('./dist/index.js')` 종료 0.
- 추가 확인: env 없이 `node dist/index.js` 를 돌리면 `LIMITUP_EXPORT_DIR must be set` 과 `limitup-sync failed` 를 내고 종료 1(무로그 실패 없음). 실 export 4일(`~/ticks/research/export`)을 `/mnt/export/export` 에 ro 로 마운트한 `--dry-run` 은 종료 0. entries 99 · locks 39 · jumps 40,626 · member_alloc 253,247 · facts 542 · touches 216 · 격자 99 로, 인박스 「확인 방법」 4일 합계와 같다. Cloud Run 볼륨 경로 배치를 로컬에서 그대로 재현한 셈이다.
- Task 2 `<verify>` PASS. `bash -n` 2종 · grep 9종 · 비주석 `limit-up-sync` 0회.
- Acceptance 전부 PASS: gen2/1800s/1Gi/`SUPABASE_URL:?`/`NOTIFICATION_CHANNEL_ID:?` 각 1회 이상 · 버킷 단위 바인딩 2 · 프로젝트 IAM 0 · `lifecycle|delete-unmatched` 0 · `INV-[1-7]` 26줄(INV-1~7 각각 있음) · 기존 워커 파일 4경로 diff 0줄.
- 스텁 검증(가짜 `gcloud`/`curl`/`docker` 를 PATH 앞에 둠, 클라우드 호출 0):
  - smoke 정상 12 PASS / 종료 0. jumps count 불일치를 넣으면 그 INV 만 FAIL / 종료 1. `--check-scheduler` 1 PASS. manifest 가 없는 날짜는 INV-4 · INV-6 FAIL. 기록된 curl 인자에 키 문자열이 0회라 argv 노출이 없다.
  - deploy: `GCP_PROJECT_ID` 가 없으면 종료 1, `SUPABASE_URL` 이 없으면 시작 단계에서 종료 1, 버킷이 없으면 종료 1. `NOTIFICATION_CHANNEL_ID` 가 없으면 Job · Scheduler 반영 뒤 알림 단계만 종료 1. 전체 경로는 종료 0이고 채널 `123` 이 `projects/gh-radar/notificationChannels/123` 로 정규화된다.
  - IAM: 버킷이 없을 때 create 1회, 버킷 바인딩 2회, Secret 바인딩 1회.
- 이 실행에서 `gcloud run jobs deploy/execute` · `gcloud scheduler` · `gcloud storage buckets create` · `add-iam-policy-binding` · `docker push` 는 실제로 한 번도 실행하지 않았다(스텁에만 기록됨).

## 28-14 로 넘긴 것 (메인 세션 실행 순서)

1. `GCP_PROJECT_ID=gh-radar bash scripts/setup-limitup-sync-iam.sh` — SA · Secret accessor · 버킷 · 버킷 IAM
2. `GCP_PROJECT_ID=gh-radar SUPABASE_URL=… NOTIFICATION_CHANNEL_ID=… bash scripts/deploy-limitup-sync.sh` — 이미지 빌드 · 푸시 · Job · Scheduler · 알림. 그 전에 마이그레이션 3개(28-03/06)와 `limitup-grid` 버킷이 원격 Supabase 에 push 되어 있어야 한다.
3. seed — radar-gw 운반기 첫 run, 또는 로컬 export 4일을 `gs://gh-radar-limitup-export/export/` 로 1회 업로드
4. `bash scripts/smoke-limitup-sync.sh`(필요하면 `--date 20261002`). 20261002 기대값: entries 29 · locks 12 · jumps 9,231 · member_alloc 62,209 · facts 169 · touches 31 · 격자 29
5. radar-gw `infra/relay/limitup-pull/install.sh`(BUCKET=gs://gh-radar-limitup-export)

## Deviations from Plan

None - plan executed exactly as written.

(참고: 계획의 「완료 출력에 다음 단계」 외에, 알림 yaml 파일이 없을 때도 종료 1 로 막게 했다 — 원형은 파일이 없으면 조용히 건너뛴다. 이 플랜은 yaml 을 같은 커밋으로 넣으므로 없으면 체크아웃이 망가진 것이다.)

## Deferred (28-14 메인 세션 — 클라우드 쓰기 금지)

- 실제 버킷 생성 · IAM 바인딩 · Job/Scheduler 배포 · 알림 정책 생성 · 원격 smoke(INV-1~7)
- Pitfall 8 의 relay SA 같은 경로 재업로드 실시험 — radar-gw 운반기 첫 D+1 보충 run 의 `journalctl -u limitup-pull` 로 403 이 없는지 확인

## Known Stubs

None.

## Next

Ready for 28-09.

## Self-Check: PASSED
