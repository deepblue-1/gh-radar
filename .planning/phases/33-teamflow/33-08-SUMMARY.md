---
phase: 33-teamflow
plan: 08
subsystem: deploy
tags: [deploy, supabase, cloud-run-job, radar-gw, server]
requires: [33-07]
provides: [remote-schema-team-flow, limitup-sync-5d6e2499, server-teamflow-route]
affects: [gh-radar-limitup-sync, gh-radar-server, supabase]
key-files:
  created: []
  modified: []
decisions:
  - "배포는 메인 세션이 전용 detached worktree(scratchpad/p33-deploy @ 5d6e2499 = Phase 33 + master 병합)에서 실행 — 동시 세션(Phase 32) 작업 트리와 분리"
  - "사용자 승인 원문(2026-10-16 17:21 KST): 「배포 진행 (Recommended)」 — pgTAP 은 33-02 · 33-07 에서 실행됨(ok 300 · not ok 0)이라 0단계 추가 승인 대상 아님"
metrics:
  duration: 약 15분 (17:21~17:37 KST)
  completed: 2026-10-16
---

# Phase 33 Plan 08: 백엔드 배포 Summary

DB → limitup-sync Job → radar-gw 낮 운반 1회 → Job 즉시 실행 → 스모크 → server 순서(D-18)로 백엔드를 프로덕션에 올렸고, 10/14 team_flow 34행이 정식 경로(D-03 자동 재적재)로 적재됐다. webapp push 는 하지 않았다(33-09).

## Task 1 — 스키마 적용

- pgTAP 상태: **pgTAP ok** — limitup_load 218 · teamflow_report 28 · limitup_report 54(33-07 회귀 게이트, not ok 0).
- 적용 전 `supabase migration list --linked`: 20261016200000 · 20261016200100 만 Local 전용(다른 미적용 마이그레이션 없음).
- `supabase db push --linked --yes` → `Finished supabase db push.` (17:22 KST)
- 적용 후 두 버전 모두 Remote 채워짐:
  - `20261016200000 | 20261016200000`
  - `20261016200100 | 20261016200100`
- 옛 워커 21:20 끼어듦: **해당 없음** — 같은 낮(17:24)에 워커 재배포까지 이어 함.

## Task 2 — Job · 운반 · 적재 · 스모크 · server

| 단계 | 시각(KST) | 결과 |
|---|---|---|
| 현재 Job env | 17:23 | `LIMITUP_SKIP_DATES` 없음 → 넘길 값 없음 |
| limitup-sync 재배포 | 17:24 | 이미지 `limitup-sync:5d6e2499` · Scheduler `20 21 * * 1-5` ENABLED · 알림 정책 유지 |
| radar-gw dry-run | 17:25 | 받을 날짜 11개(20260929~20261015) · 10/16 은 아직 export 전(오늘 20:30 배치) |
| radar-gw 낮 운반 1회 | 17:25 | `[limitup-pull] dates=11 latest=20261015 rsync=ok upload=ok` · `Finished with result: success` (transient 유닛 · Nice 19 · IO idle · MemoryMax 300M) |
| 버킷 확인 | 17:26 | `gs://gh-radar-limitup-export/export/20261014/team_flow.ndjson.gz` 있음 |
| Job 즉시 실행 | 17:27 | `gh-radar-limitup-sync-589w2` 성공 |
| 날짜별 적재 사유 | — | 11일 모두 `files_sig`(옛 워커가 아직 이 export 를 싣지 않은 상태 — 기대대로) |
| 스모크 `--date 20261014` | 17:30 | `PASS: 13  FAIL: 0` · INV-8 `db=34 manifest=34` · INV-1 재실행 `gh-radar-limitup-sync-q22hc` 는 committed 0건(unchanged 멱등) |
| server 배포 | 17:35 | 리비전 `gh-radar-server-00062-xnt` · 배포 스모크 `PASS: 15 FAIL: 0` |
| 무인증 `GET /api/teamflow/report` | 17:36~ | 아래 참조 |

## Deviations

1. **[Rule 3] server 배포 env 보충.** 플랜 7단계의 명령에는 `RELAY_INTERNAL_URL` 이 없어 `deploy-server.sh` 가 거부했다. 라이브 Cloud Run env 값(`http://10.10.0.5:8091`)을 그대로 넘겨 재실행했다.
2. **10/16 은 이번 운반에 없다.** 119 의 10/16 export 는 오늘 20:30 배치가 만든다. 21:00 운반 → 21:20 새 워커 적재(`new`)로 들어온다. 플랜의 「재기록 11일 + 10/16」 중 10/16 은 오늘 밤 정기 경로 몫이다.
3. 첫 401 확인은 server 스모크의 rate limit 시험(240 req) 직후라 429 가 나왔다. 창이 풀린 뒤 다시 확인했다(아래).

## 401 확인

- 17:36 첫 시도: 429(직전 스모크 INV-8 rate limit 시험의 잔여).
- 17:37 재확인: `/api/teamflow/report` **401**(라우트 존재 · 인증 필요). 대조군 `/api/no-such-route-xyz` 는 404.

## 프로덕션 수동 조작

- 없음. team_flow 는 운반 → 워커 경로로만 적재됐다.
