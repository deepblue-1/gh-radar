---
phase: 43-tender-offer-telegram-alert
plan: 08
subsystem: ops/dart-alert
status: complete
tags: [deploy, db-push, secrets, telegram, opendart, smoke, uat]
requires:
  - 43-01 ~ 43-07 · 43-09 (워커 · 마이그레이션 · 배포 스크립트 · 사용자 `!` 스크립트)
provides:
  - 원격 DB `20261113200000_dart_alert` 적용
  - Cloud Run Job `gh-radar-dart-alert` (이미지 `dart-alert:3be96321`) · Scheduler `gh-radar-dart-alert-wake` · 알림 정책 2개
  - 텔레그램 봇 `@gh_trade_dart_bot` → 팀 단체방 송신
affects: []
key-files:
  created: []
  modified:
    - .planning/phases/43-tender-offer-telegram-alert/43-VALIDATION.md
    - scripts/telegram-find-chat.sh
    - workers/dart-alert/tests/cadence.test.ts
key-decisions:
  - "배포 시각: 평일 창 안(금 10:07) — 사용자 답 「지금 배포」 → `--scheduler-paused` 배포 · seed 실행 · seed done 확인 뒤 resume"
  - "정정 공시 포함 그대로 배포 — 조사상 유상증자 · 합병 평일당 10.3건(정정 제외 2.7건). 계획 기준(10건을 훨씬 넘으면 묻는다)에 못 미쳐 묻지 않고 수치만 보고"
  - "Task 3(단체방 UAT 2 ~ 4번)은 다음 평일 아침 · 당일 20:00 뒤 · 첫 실제 알림을 기다려야 해서 43-UAT 로 넘긴다 — 43-VALIDATION 은 서명하지 않고 `status: draft` 유지"
requirements-completed: []
metrics:
  started: 2026-11-12T15:40:00Z
  completed: 2026-11-13
---

# Phase 43 Plan 08: 배포 · 운영 확인 요약

공시 알림 수집기를 운영에 올렸다. 원격 DB · 비밀 · Job · 5분 깨움 · 운영자 메일 정책이 모두 올라갔고, 팀 단체방에 확인 글이 도착했다. 단체방 실사용 확인(Task 3) 중 시간이 지나야 볼 수 있는 항목은 UAT 로 넘겼다.

## 수행 결과

| 태스크 | 결과 | 커밋 |
|---|---|---|
| 1 배포 전 게이트 | PREDEPLOY-OK — 범위 밖 변경 0 · 비밀 꼴 0 · dart-alert 15파일 306개 통과 · pgTAP 173/173 · self-test OK | `ef0cd8c7` |
| 2 [BLOCKING] DB · 비밀 · 조사 · 배포 · 시험 · 단체방 전환 | 완료(아래 기록) — push 는 보류(사용자 허락 대기) | (운영 작업 · 코드 커밋 2건은 아래) |
| 3 단체방 UAT | 1번 일부 확인(확인 글 도착) · 2 ~ 4번 대기 → `43-UAT.md` | — |

## Task 2 기록 (2026-11-13 KST · 순서 DB → 비밀 → 조사 → 배포 → 개인 대화 → 단체방 → seed · resume)

- **실행 위치:** 43-01 ~ 43-07 · 43-09 는 전용 worktree(`phase-43` 브랜치)에서 실행한 뒤 master 에 병합(`9f62f0eb` · 충돌 0). 배포는 master 메인 체크아웃에서 했다. 이미지는 `workers/dart-alert` 와 루트 설정만 담으므로 옆 세션의 미커밋 `packages/shared` 변경은 이미지에 들어가지 않았다.
- **스키마 push:** push 전 대기 목록 = `20261113200000` 하나(판정 ㉠ · Phase 42 `20261113100000` 은 이미 원격). 10:05 `supabase db push --linked --yes` → 새로 Remote 가 된 줄 = `20261113200000` 하나 · 남은 대기 0 · `SCHEMA-PUSHED`.
- **다른 phase 에 전할 말:** 없음(우리보다 앞 버전인데 원격에 없는 예정 마이그레이션 없음).
- **비밀:** 사용자 `!` 로 IAM · Secret 등록. `gh-radar-opendart-key` · `gh-radar-telegram-bot-token` · `gh-radar-telegram-chat-id` 각각 ENABLED ≥ 1 (`SECRETS-OK`). 방 id 는 개인 대화(버전 1) → 단체방(버전 2)으로 교체.
- **실제 공시 조사(30일 · 평일 23일 · OpenDART 9회):**
  - 유상증자결정 203건 · 회사합병결정 68건 — 실제 표기와 글자까지 일치.
  - 유무상증자결정 · 회사분할합병결정 — 30일간 0건이라 표기 대조 못 함(관찰 대기).
  - 목록 밖 「증자」 · 「합병」 종류: 무상증자결정 2건뿐(D-04 로 뺀 종류).
  - 유가/코스닥 알림 예상: 유상증자 · 합병 평일당 10.3건(정정 제외 2.7건) + 공개매수 1.0건(25건 중 유가/코스닥 24건).
  - 하루 100건 넘은 날 0일(최다 59건).
- **배포:** `GCP_PROJECT_ID=gh-radar SUPABASE_URL=… bash scripts/deploy-dart-alert.sh --scheduler-paused` → 이미지 `asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/dart-alert:3be96321` · Job 생성 · Scheduler `*/5 7-19 * * 1-5`(Asia/Seoul) · 알림 채널은 limitup 정책 것 차용 · 정책 `gh-radar-dart-alert-failure` · `gh-radar-dart-alert-error-log` 생성. 스모크 PASS=6 FAIL=0(INV-1 probe · INV-2 timeout 50400s/retries 0 · INV-3 · INV-4 `probe ok` · INV-5a/b). VPC egress 불필요(`012` 없음).
- **로그 비밀 확인:** 봇 토큰 꼴 · `crtfc_key=` 40자 · JWT 꼴 모두 0건.
- **개인 대화 시험:** `DART_ALERT_MODE=test-send` 실행 `gh-radar-dart-alert-82578` 성공 · 로그 `test-send ok` · 사용자 답 「잘 옴」.
- **단체방 전환 · 확인 글:** 방 id 교체 뒤 test-send 실행 `gh-radar-dart-alert-tlc96` 성공 · 사용자 답 「단체방으로 잘 왔어」.
- **실제 DB 경로(창 안 배포라 9 가 6-b 를 대신):** seed 실행 `gh-radar-dart-alert-95v9z` — 10:10:38 `seed done`(calls 2 · matched 0 · inserted 0 · 두 감시 대상 lastOk 기록). 이 실행이 20:00 까지 자동 수집을 이어 간다.
- **Scheduler resume:** ENABLED 확인.
- **stats 1(10:11):** 오늘 호출 16/15,000 · 한도 의심 0 · 장애 없음 · 임대 보유자 `gh-radar-dart-alert-95v9z` · 경고 이상 로그 0건. 10초 간격으로 호출 수가 느는 것 확인(14 → 16).
- **git push:** 보류 — master 가 origin 보다 앞선 커밋은 전부 Phase 43(webapp 변경 없음). 사용자 허락 뒤 push.

## Deviations from Plan

**1. [Rule 1] 방 id 찾기 스크립트 진단 보강** — 사용자 첫 실행에서 「찾은 방이 없다」 만 나와 원인을 가릴 수 없었다. 방을 못 찾으면 토큰의 봇 @이름(getMe)과 받은 업데이트 건수 · 종류를 함께 보여 주게 했다(가짜 curl 로 빈 응답 · 방 2개 시험). 커밋 `3be96321`. 재실행에서 개인 대화가 잡혔다.

**2. [Rule 1] 부하 때 시간 초과하던 테스트** — `tests/cadence.test.ts` 「주말 하루는 바퀴 0」 이 172,800번 `expect` 로 바쁜 기계에서 5초 제한을 넘겼다. 어긋난 초를 모아 한 번에 단언하도록 바꿨다(검사 범위 동일). 커밋 `2caea773`.

**3. 실행 방식** — 계획은 master 에서 실행을 전제했으나 Phase 42 가 master 에서 실행 중이어서 전용 worktree 에서 순차 실행 후 병합했다. wave 마다 스키마 드리프트 게이트가 block 을 냈고, 원격 push 가 이 플랜의 단계라 미뤘다(10:05 push 로 해소).

**4. 배포 시각 권고** — 계획의 권고는 「20:00 뒤 배포」 였으나 질문에서는 「지금 배포」 를 권고로 제시했고 사용자가 그것을 골랐다.

## 확인 못 한 것 · 남은 것

- Task 3 의 2번(다음 평일 `07:00` ~ `07:10` 에 「멈췄습니다」 없음) · 3번(당일 `20:00` 뒤 호출 수 ≤ 15,000 · 늦은 알림) · 4번(첫 실제 알림 지연) — `43-UAT.md`.
- 실제 공시 알림은 아직 0건이다(seed 시점에 오늘 맞는 건 0). 실제 알림의 모양 · 「DART 원문」 링크 · 미리보기 카드 없음은 첫 알림에서 확인한다.
- 유무상증자결정 · 회사분할합병결정의 실제 표기 대조.
- error 로그 정책이 실제 오류 로그에 걸려 메일이 오는지(오류가 아직 없어 미확인).
- `43-VALIDATION.md` 서명(`status: validated`)은 UAT 1 ~ 3 통과 뒤.

## Self-Check: PASSED

- `43-VALIDATION.md` Task 1 커밋 `ef0cd8c7` 존재 · `scripts/telegram-find-chat.sh` `3be96321` · `tests/cadence.test.ts` `2caea773` 존재.
- 원격 상태는 위 명령 출력으로 확인(SCHEMA-PUSHED · SECRETS-OK · 스모크 PASS=6 · seed done · Scheduler ENABLED · 정책 2).
