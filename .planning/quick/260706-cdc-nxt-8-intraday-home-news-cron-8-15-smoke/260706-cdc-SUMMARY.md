---
phase: quick-260706-cdc
plan: 01
subsystem: intraday-pipeline
tags: [cron, nxt-premarket, home-sync, scheduler, deploy]
requires:
  - workers/home-sync computeSlot (기존)
  - packages/shared/src/home.ts HomeSnapshotPayload (기존)
  - webapp home-header 시각 기반 라벨 파생 (기존)
provides:
  - 장중 파이프라인 08:00 시작 (NXT 프리마켓 커버) cron 8-15
  - home-sync marketStatus "premarket" 유니온 + 8시대 판별
  - 홈 헤더 "HH:MM · 프리마켓" 슬롯 라벨
affects:
  - Cloud Scheduler intraday/home/news-intraday cron (라이브)
  - home-sync Cloud Run Job 이미지 95fae6c
tech-stack:
  added: []
  patterns:
    - "시각 기반 슬롯 라벨 파생 (isPremarketSlot, isCloseSlot 패턴 재사용)"
    - "워커 코드 무변경 스케줄러는 cron-only update, 코드 변경 워커는 전체 재배포"
key-files:
  created: []
  modified:
    - scripts/deploy-intraday-sync.sh
    - scripts/deploy-home-sync.sh
    - scripts/deploy-news-sync.sh
    - scripts/smoke-home-sync.sh
    - scripts/smoke-news-sync.sh
    - scripts/smoke-intraday-sync.sh
    - packages/shared/src/home.ts
    - packages/shared/src/marketHours.ts
    - workers/home-sync/src/index.ts
    - workers/home-sync/src/index.test.ts
    - webapp/src/components/home/home-header.tsx
decisions:
  - "Vercel 배포는 worktree 미완 — 오케스트레이터가 main repo root 에서 수행 필요"
metrics:
  duration: ~15min
  completed: 2026-07-06
---

# Quick 260706-cdc: NXT 프리마켓 8시 확장 (intraday/home/news cron 8-15 + 홈 프리마켓 라벨) Summary

장중 파이프라인(intraday/home/news)의 Cloud Scheduler cron 을 `9-15`→`8-15` 로 확장해 NXT(넥스트레이드) 프리마켓(08:00~08:50) 급등을 08시대부터 포착하고, home-sync computeSlot 에 8시대 `premarket` 판별 + 홈 헤더에 "HH:MM · 프리마켓" 라벨을 추가했다. 시세 소스(키움 ka10027)는 이미 `stex_tp="3"`(KRX+NXT 통합)이라 시간 게이트는 오직 cron 이었다.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | deploy/smoke 스크립트 cron 9-15 → 8-15 전수 치환 | b5d8f8b | scripts/deploy-{intraday,home,news}-sync.sh, scripts/smoke-{home,news,intraday}-sync.sh |
| 2 (RED) | computeSlot 8시대 premarket 실패 테스트 | 7c39504 | workers/home-sync/src/index.test.ts |
| 2 (GREEN) | 홈 8시대 프리마켓 슬롯 표시 | 95fae6c | packages/shared/src/home.ts, packages/shared/src/marketHours.ts, workers/home-sync/src/index.ts, webapp/src/components/home/home-header.tsx |
| 3 | 라이브 배포 — 스케줄러 3종 + home-sync 재배포 (+ Vercel 보류) | (배포, 코드 커밋 없음) | — |

## What Changed

### Task 1 — 스크립트 cron 8시 확장
6개 스크립트의 장중 cron 시간 필드 `9-15`→`8-15` (주석·로그·assert 전수). offhours(`0 */2 * * *`)·daily cron 무변경. verify: `! grep -rn '9-15' scripts/` (잔존 0건), 6개 파일 각 `8-15` ≥2회.

### Task 2 — 프리마켓 슬롯 (TDD)
- **RED:** computeSlot(08:37/08:00 KST) → premarket 기대 테스트 3종 추가. 실행 시 2건 `expected 'open' to be 'premarket'` FAIL (09:00 open 경계 회귀 없음 PASS).
- **GREEN:**
  - `packages/shared/src/home.ts` — `HomeSnapshotPayload.marketStatus` 를 `"premarket" | "open" | "closed"` 3-유니온으로 확장 (하위호환: 구 스냅샷 open/closed 유지, server Zod enum 검증 없음이라 안전).
  - `workers/home-sync/src/index.ts` computeSlot — `hour < 9 ? "premarket"` 분기 추가. afterClose 로직 무변경(8시대 정상 실행).
  - `webapp/src/components/home/home-header.tsx` — `isPremarketSlot(iso)` 시각 기반 헬퍼(hh==='08') + 라벨 `close ? '마감' : premarket ? '프리마켓' : hhmm`. payload 미소비(index-only 데이터 정합, isCloseSlot 패턴 그대로).
  - `packages/shared/src/marketHours.ts` — 일관성(죽은 코드) 반영: `>= 540`(09:00) → `>= 480`(08:00).
- verify: shared 빌드 통과, home-sync 테스트 58/58 통과(premarket 3케이스 신규 + 기존 open/closed 회귀 없음), webapp 빌드 통과.

### Task 3 — 라이브 배포
GCP 인증: 영구 deployer SA(`~/.config/gcloud/gh-radar-deployer.json`, project=gh-radar).

**라이브 스케줄러 (최종 확인):**

| Job | cron | state |
| --- | ---- | ----- |
| gh-radar-intraday-sync-cron | `* 8-15 * * 1-5` | ENABLED |
| gh-radar-home-sync-cron | `*/10 8-15 * * 1-5` | ENABLED |
| gh-radar-news-sync-intraday | `*/15 8-15 * * 1-5` | ENABLED |
| gh-radar-news-sync-offhours | `0 */2 * * *` (무변경) | ENABLED |

- (A) intraday-sync-cron: 스케줄만 gcloud update (워커 코드 변경 없음).
- (B) news-sync-intraday: 스케줄만 gcloud update.
- (C) home-sync: computeSlot 코드 변경 있어 `scripts/deploy-home-sync.sh` 전체 재배포 → 이미지 `home-sync:95fae6c` + 자체 cron `*/10 8-15` 갱신. SUPABASE_URL 은 기존 배포 Job env 에서 취득(재요청 안 함).
- (D) Vercel: **미완 (아래 Deferred 참조).**

**Smoke 검증 (전 항목 PASS):**
- `smoke-intraday-sync.sh --check-scheduler`: 1/1 (cron `* 8-15` assert).
- `smoke-news-sync.sh`: 8/8 (INV-3a `*/15 8-15` assert PASS).
- `smoke-home-sync.sh`: 6/6 (INV-4 오늘 스냅샷 존재, INV-5 scheduler `*/10 8-15` assert PASS).

## Deviations from Plan

### Auto-fixed / 운영 노트

**1. [Rule 3 - Blocking] worktree node_modules 부재 → pnpm install**
- **Found during:** Task 2 테스트 실행 (`vitest: command not found`).
- **Fix:** `pnpm install --frozen-lockfile` (reused 1123, 신규 다운로드 0).
- **Files modified:** 없음(환경 셋업).

**2. [운영] smoke 초기 FAIL 은 SUPABASE_SERVICE_ROLE_KEY 미설정 탓 (데이터 정상)**
- 최초 home-sync INV-4 / news-sync INV-5·INV-6 FAIL 은 env 미주입으로 curl 인증 실패한 것. Secret Manager 에서 키 export 후 재실행 시 home-sync 6/6, news-sync 8/8 전부 PASS. 실제 오늘 스냅샷 row 존재 확인(`2026-07-06T00:00:00Z` = 09:00 KST, stock_count 47).

## Deferred Issues

**Vercel webapp 배포 미완 — 오케스트레이터가 main repo root 에서 수행 필요.**
- worktree 에 `.vercel` project link 없음. `vercel pull` 이 worktree 디렉터리명(`agent-a0a59709bcac9a47d`)으로 **잘못된 신규 프로젝트**를 자동 링크 → 여기서 배포 시 `gh-radar-webapp` 이 아닌 엉뚱한 프로젝트에 push 됨. 오배포 방지 위해 생성된 `.vercel` 삭제하고 배포 보류.
- 필요 조치: main repo root(`/Users/alex/repos/gh-radar`)에서 `vercel pull --yes --environment=production && vercel build --prod && vercel deploy --prebuilt --prod` (MEMORY: reference_vercel_frontend_deploy).
- 영향: 홈 프리마켓 라벨 UI 는 익일 08시대 첫 슬롯 생성 시 육안 확인(비차단). 백엔드(스케줄러·home-sync 워커)는 이미 라이브 반영됨.

## Known Stubs

None — 스텁 없음. premarket 판별은 실 데이터(capturedAt KST hour) 기반.

## Self-Check: PASSED

- Files (worktree): scripts/deploy-intraday-sync.sh, packages/shared/src/home.ts, workers/home-sync/src/index.ts, webapp/src/components/home/home-header.tsx, packages/shared/src/marketHours.ts, workers/home-sync/src/index.test.ts — 전부 FOUND.
- Commits: b5d8f8b (Task 1), 7c39504 (Task 2 RED), 95fae6c (Task 2 GREEN) — git log 확인.
- 라이브 스케줄러 3종 cron `8-15` + home-sync 이미지 `95fae6c` gcloud describe 확인. smoke 3종 전 PASS.
