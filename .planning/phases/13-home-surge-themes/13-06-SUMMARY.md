---
phase: 13-home-surge-themes
plan: 06
subsystem: home-surge-themes
tags: [deploy, cloud-run-job, cloud-scheduler, claude-poc, iam, smoke, e2e, production]
requires:
  - "home-sync 워커 runHomeSyncCycle (13-02)"
  - "server GET /api/home { snapshot, index } (13-03)"
  - "webapp 홈 UI + 루트(/) 승격 + home E2E (13-04/05)"
  - "home_theme_snapshots 테이블 + shared 계약 (13-01)"
provides:
  - "scripts/setup-home-sync-iam.sh (SA gh-radar-home-sync-sa + secretAccessor 2건, 신규 0)"
  - "scripts/deploy-home-sync.sh (Cloud Run Job 512Mi/120s + Scheduler 30 9-15 OAuth, VPC 없음)"
  - "scripts/smoke-home-sync.sh (job execute + cycle-complete 로그 + home_theme_snapshots 오늘 >=1 + scheduler INV)"
  - "production: Cloud Run Job gh-radar-home-sync + Scheduler gh-radar-home-sync-cron 라이브"
  - "production home at / (Vercel) + server /api/home (Cloud Run) 라이브"
affects:
  - "HOME-01 end-to-end 프로덕션 활성화 완료 (홈 급등 테마 자동 갱신 7슬롯/영업일)"
  - "후속(비차단): 테마 내 뉴스 URL dedup 폴리시 (news_total 44 vs unique 4 저장 중복)"
tech-stack:
  added: []
  patterns:
    - "theme-sync 배포 스택 복제 (VPC 없음, OAuth invoker, Secret 재사용 신규 0)"
    - "Claude POC 게이트 (비용/클러스터링 정확도 검증 후 scheduler 활성 — theme-sync 10-06 선례)"
    - "smoke INV: trade_date=today(KST) 필터로 이번 배치 슬롯 실제 append 검증 (theme-sync 전체 count 와 차이)"
key-files:
  created:
    - scripts/setup-home-sync-iam.sh
    - scripts/deploy-home-sync.sh
    - scripts/smoke-home-sync.sh
  modified:
    - .planning/ROADMAP.md
    - .planning/STATE.md
    - .planning/REQUIREMENTS.md
decisions:
  - "task-timeout=120s (Claude 1회 + Supabase R/W — theme-sync 600s 대비 짧게, RESEARCH §Pattern 5)"
  - "smoke INV-4 는 trade_date=today 필터 count>=1 (급등 없는 날에도 스냅샷 row 자체는 append 되므로 >=1 유효)"
  - "cron 30 9-15 * * 1-5 (0,30 아님) — CONTEXT '매시 :30' 7슬롯 정확 일치, 15:30 마감 슬롯 자연 포함"
metrics:
  duration: ~17min (스크립트 작성) + 배포/POC/E2E (오케스트레이터 실행)
  tasks: 3
  files: 3 (scripts) + 3 (docs)
  completed: 2026-07-02
---

# Phase 13 Plan 06: home-sync 프로덕션 배포 + Claude POC 게이트 Summary

HOME-01 의 [BLOCKING] 프로덕션 활성화: theme-sync 배포 패턴(VPC 없음, OAuth invoker, Secret 재사용 신규 0)을 복제한 IAM/배포/스모크 스크립트 3종을 작성하고, GCP 에 Cloud Run Job `gh-radar-home-sync` + Scheduler `gh-radar-home-sync-cron`(30 9-15 * * 1-5 KST, 7슬롯)을 배포했다. Claude POC 게이트(비용/클러스터링 정확도)를 **PASS**(themeCount=4 전부 실제 KR 급등테마 대응, 뉴스 verbatim + 실제 매체 URL 환각 0, Haiku 1회/사이클 ~$3.1/월 상한 이내)로 통과한 뒤 server(`/api/home`) + webapp(홈 `/`)을 재배포했다. smoke 6/6 + home E2E 5/5 green 으로 프로덕션 홈이 루트에 라이브 전환됐다.

## What Was Built

### Task 1 — 배포/IAM/스모크 스크립트 3종 (commit `f6b1905`)
- **scripts/setup-home-sync-iam.sh**: SA `gh-radar-home-sync-sa` 생성(idempotent) + secretAccessor 바인딩 2건(`gh-radar-supabase-service-role`, `gh-radar-anthropic-api-key` — 전부 재사용, 신규 0). brightdata 미바인딩(T-13-14 최소권한). `gh-radar-scheduler-sa` 존재 확인(재사용). gcloud config/project 가드.
- **scripts/deploy-home-sync.sh**: 가드(SA 2종 + Secret 2종) → docker build/push `home-sync:$SHA`(+latest) → `gcloud run jobs deploy gh-radar-home-sync`(512Mi, **task-timeout=120s**, max-retries=1, `--set-secrets` 2 재사용, `--set-env-vars` home-sync 튜닝만[SURGE_THRESHOLD/NEWS_PER_STOCK/SURGE_MAX], **`--network` 없음**) → run.invoker(scheduler SA → Job 리소스 scope, T-13-13) → `gcloud scheduler jobs create/update http gh-radar-home-sync-cron --schedule="30 9-15 * * 1-5" --time-zone="Asia/Seoul" --oauth-service-account-email`(OIDC 금지).
- **scripts/smoke-home-sync.sh**: INV-1 job execute --wait exit 0 / INV-2 "home-sync cycle complete" 로그(jsonPayload.msg, 5×15s 재시도) / INV-3 failed·401 0건 / INV-4 `home_theme_snapshots` where trade_date=today(KST) count>=1(DI-02 `tr -d '\r'` CR 가드) / INV-5 scheduler ENABLED + `30 9-15 * * 1-5` / INV-6 OAuth invoker.
- 정적 검증: `bash -n` 3개 OK + acceptance grep 전량(cron/scheduler-name/oauth/120s/no-network/no-brightdata-in-flags/reused-secrets/snapshots) 통과.

### Task 2 — GCP 배포 + Claude POC 게이트 + server/webapp 재배포 (오케스트레이터 실행, 사용자 승인 후)
- **(a) IAM**: exit 0. SA + secretAccessor 2건, 신규 secret 0.
- **(b) 배포**: exit 0. Cloud Run Job `gh-radar-home-sync` @ image `f6b1905`, Scheduler `gh-radar-home-sync-cron` ENABLED(`30 9-15 * * 1-5` KST, OAuth invoker, VPC 없음, brightdata 없음).
- **(c) Claude POC 게이트 — PASS**: Job 수동 실행 → cycle complete(themeCount=4, stockCount=48, claudeCalled=true, isCarried=false). 4테마 전부 실제 KR 급등테마 대응(호남반도체 17멤버 / 전력기기 5 / 위메이드 3 / 이차전지 2), reason 일관, 뉴스 제목 verbatim + 실제 매체 URL(junggi/etoday) — **환각 0**. Haiku 1회/사이클 = ~$3.1/월 상한 이내(T-13-15 비용 게이트 충족).
- **(d) server**: `deploy-server.sh` exit 0(CORS_ALLOWED_ORIGINS 기존 값 재사용). 스모크 9/9. `/api/home` HTTP 200, snapshot 존재(trade_date 2026-07-02, 4테마, index 1슬롯).
- **(e) webapp**: vercel pull/build/deploy --prebuilt --prod exit 0. prod 홈 `/` HTTP 200(force-dynamic 클라 렌더 + 사이드바 홈 nav). `/scanner` 는 307→/login(비로그인 auth 미들웨어 정상, 회귀 아님).
- **(f) smoke + E2E**: `smoke-home-sync.sh` 6/6 PASS. Playwright `home.spec.ts` 5/5 green(홈 렌더/nav active + 날짜·시점 네비 + empty-state + /scanner 회귀).

### Task 3 — 문서 갱신 (본 커밋)
- ROADMAP.md Phase 13 6/6 [x] + 완료 evidence(image SHA, POC themeCount/cost). REQUIREMENTS.md HOME-01 → Complete(evidence). STATE.md progress 93→94, Phase 13 완료 note(Roadmap Evolution).

## Deviations from Plan

### Auto-fixed Issues

None — plan 은 명세대로 실행됨. 스크립트 3종은 theme-sync 선례를 §Pattern 5 델타대로 복제, 배포/POC/재배포 전량 승인 후 orchestrator 실행으로 green.

### 후속 작업 (Follow-up, 비차단 — POC 게이트 통과에 영향 없음)

**테마 내 뉴스 URL dedup 폴리시**
- **관측:** POC payload 에서 테마의 newsRefs 가 URL 기준 dedup 안 됨(호남반도체 news_total=44 vs unique=4 — 멤버 종목들이 동일 상한가 기사를 각자 참조).
- **영향:** UI 는 근거뉴스 top 1-2(distinct)만 노출하므로 **표시엔 무영향**. 단 CLAUDE.md 크롤링 5원칙 #5(최소 저장) 관점에서 payload 저장 중복.
- **처리:** 프로덕션 차단 사유 아님(POC PASS). `resolveNewsRefs`(13-02) 또는 payload 직렬화 단계에서 테마 내 뉴스 URL dedup 하는 후속 quick task 로 분리 권장. STATE decisions 에 기록.

## Verification

- 3 스크립트 `bash -n` + acceptance grep 전량 PASS(cron `30 9-15 * * 1-5` / `gh-radar-home-sync-cron` / `oauth-service-account-email` / `task-timeout=120s` / 실제 deploy 플래그에 `--network` 없음 / `--set-secrets` brightdata 없음, supabase+anthropic 2건 / smoke `home_theme_snapshots`).
- **배포 exit 0** (a/b/d/e 전량). **Claude POC PASS**(themeCount=4 실제 대응 + 환각 0 + ~$3.1/월 상한 이내).
- `/api/home` HTTP 200 { snapshot(4테마), index 1슬롯 }. 프로덕션 홈 `/` HTTP 200 렌더. `/scanner` 회귀 없음(307→/login 은 비로그인 auth 정상).
- **smoke 6/6** + **home E2E 5/5** green.

## Threat Model Coverage

- **T-13-13 (scheduler auth spoofing/EoP) — mitigate**: `--oauth-service-account-email` 전용(OIDC 금지). scheduler SA run.invoker 를 Job 리소스로 scope(프로젝트 단위 아님). smoke INV-6 검증.
- **T-13-14 (over-privileged SA) — mitigate**: `gh-radar-home-sync-sa` 는 supabase-service-role + anthropic accessor 2건만. brightdata 미바인딩, VPC 없음. setup 스크립트 최소권한.
- **T-13-15 (Claude 비용 runaway) — mitigate**: POC 토큰 측정 게이트를 scheduler 7×/일 활성 전에 통과(themeCount=4, Haiku 1회/사이클 ~$3.1/월 상한 이내). theme-sync 10-06 선례.

## Known Stubs

None — 스크립트 3종은 실제 gcloud 배포 로직. 프로덕션 배포/POC/재배포/smoke/E2E 전량 라이브 검증 완료. HOME-01 end-to-end 활성화(home-sync Job + Scheduler + server /api/home + webapp 홈 /).

## Threat Flags

None — 신규 표면 0. 배포 스크립트는 기존 theme-sync IAM/배포 패턴 복제(OAuth invoker + 재사용 Secret + VPC 없음). 신규 인증 경로/파일 접근/스키마 변경 없음. 오히려 최소권한 SA(brightdata 미바인딩)로 표면 축소.

## Self-Check: PASSED

- FOUND: scripts/setup-home-sync-iam.sh
- FOUND: scripts/deploy-home-sync.sh
- FOUND: scripts/smoke-home-sync.sh
- FOUND commit: f6b1905
