---
phase: quick-261113-rn7
plan: 01
subsystem: workers/dart-alert
status: complete
tags: [opendart, dart-alert, telegram, two-keys, budget, cadence, disclosure-kinds]
requires: [quick-261113-iez]
provides:
  - OpenDART 키 2개 결선(OPENDART_API_KEY · OPENDART_API_KEY_2) · 키별 레인(사용량 · 80% · 예산 · 한도 의심 · 멈춤 · 5분 재탐침)
  - 종일 5초 바퀴(LAP_INTERVAL_MS) · everyMsAt · PollCadence · 키별 plannedDailyCalls
  - 감시 대상 6개(I003 market_action · I004 largest_holder_change 추가) · matchesKind · hideFiler
  - 아침 전날 확인(prevWeekdayYmd · prevDay · fullRead · DB last_ok prevday 표시) · seed 직전 평일 채움
affects: [scripts/deploy-dart-alert.sh, scripts/setup-dart-alert-secrets.sh, scripts/setup-dart-alert-iam.sh, scripts/smoke-dart-alert.sh, scripts/dart-alert-report.sh, ops/alert-dart-alert-*.yaml, CLAUDE.md, docs/stack.md]
tech-stack:
  added: []
  patterns: [키별 레인(KeyLane) — 치명 신호는 그 키만 멈추고 settleHalts 가 바퀴 끝에 정리, 전날 조회는 그 호출만의 새 PageTracker]
key-files:
  created: []
  modified:
    - workers/dart-alert/src/collector.ts
    - workers/dart-alert/src/cadence.ts
    - workers/dart-alert/src/watches.ts
    - workers/dart-alert/src/lap.ts
    - workers/dart-alert/src/message.ts
    - workers/dart-alert/src/index.ts
    - workers/dart-alert/src/config.ts
    - workers/dart-alert/src/apiUsage.ts
    - workers/dart-alert/src/logger.ts
    - workers/dart-alert/tests/helpers/fakes.ts
    - workers/dart-alert/tests/watchMix.test.ts
    - scripts/deploy-dart-alert.sh
    - scripts/setup-dart-alert-secrets.sh
    - scripts/setup-dart-alert-iam.sh
    - scripts/smoke-dart-alert.sh
    - scripts/dart-alert-report.sh
    - ops/alert-dart-alert-failure.yaml
    - ops/alert-dart-alert-error-log.yaml
    - CLAUDE.md
    - docs/stack.md
    - tasks/lessons.md
    - tasks/lessons-archive.md
decisions:
  - "감시 대상 → 키 대응은 buildWatches 코드 상수(키 1 = D004 · B001 / 키 2 = I003 · I001 · I004 · D005) · 키 풀 · 재분배 · 한 키 대체 없음"
  - "한 키가 막히면 그 키만 멈추고 5분마다 단독 탐침 1건 · 쓰는 키가 전부 막히면 지금처럼 종료 1(같은 로그 · 같은 종료 이유)"
  - "장애 글은 한 쌍 — 먼저 막힌 키 사유로 열고 멈춘 키가 하나라도 있으면 닫지 않는다(DB 장애 칸 1줄 · 마이그레이션 없음)"
  - "전날 확인으로 찾은 건은 늘 「(늦은 알림)」 · 넣기 rcept_dt 는 오늘 조회 날짜(송신 차례 RPC 가 오늘 행만 고름)"
  - "I003 은 제출인을 붙이지 않는다(hideFiler) — 제출인이 늘 거래소라 정보가 없다"
metrics:
  duration: "약 90분"
  completed: 2026-11-13
estimate:
  tokens: 170000
  tasks: 3
actuals:
  tokens: 89559
  tasks: 3
  commits: 3
plan_head_before: 096d66b8b345292a435f0ee3e85de2ee9cfd673c
plan_head_after: 3dcc287b18858863b7a85e6c11fa058c86959061
---

# Quick 261113-rn7 Plan 01: 공시 알림 OpenDART 키 2개 · 종일 5초 · 감시 대상 6개 · 아침 전날 확인 Summary

키 1(공개매수 종일 5초 · 주요사항보고서)과 키 2(거래소 수시공시 10초 · 거래소 시장조치 · 최대주주 소유주식 변동 · 임원ㆍ주요주주 거래계획 30초)로 나눠 돌고, 한 키가 한도 · 키 오류 · 예산으로 막혀도 다른 키 공시는 계속 오며 막힌 키는 5분마다 단독 탐침 1건으로 자동 재개한다. 아침마다 감시 대상별로 직전 평일을 한 번 다시 조회해 놓친 건을 「(늦은 알림)」 으로 보낸다.

## 커밋

| Task | 커밋 | 내용 |
|------|------|------|
| 1 | `020b2894` | 키 2개 · 종일 5초 바퀴 · 키별 레인(예산 · 한도 의심 · 멈춤 · 재탐침 · 장애) · probe 키 2 · 배포 스크립트 키 2 Secret 결선 |
| 2 | `6832ec38` | I003 · I004 · I001 배당 · 투자유의 · matchesKind · I003 제출인 숨김 · 우선순위 · 아침 전날 확인 · seed 전날 |
| 3 | `3dcc287b` | 비밀 · IAM · 배포 · 스모크 · 보고 스크립트 · 알림 정책 설명 · CLAUDE.md · stack.md · 교훈 |

`git rev-list --count 096d66b8..HEAD` 는 7 — 같은 master 의 옆 세션 커밋 4개(phase-41 문서)가 사이에 끼어 있다. 이 작업 커밋은 `--grep=quick-261113-rn7` 로 센 3개다.

## 검증 결과(실제 출력)

- `pnpm --filter @gh-radar/dart-alert exec vitest run --maxWorkers=2` → **Test Files 18 passed · Tests 456 passed**(시작 때 377 → +79).
- `pnpm --filter @gh-radar/dart-alert typecheck` → 통과(출력 없음).
- `bash -n` → setup-dart-alert-secrets · setup-dart-alert-iam · deploy-dart-alert · smoke-dart-alert · dart-alert-report 다섯 개 모두 OK.
- `GCP_PROJECT_ID=gh-radar SUPABASE_URL=https://x.supabase.co bash scripts/deploy-dart-alert.sh --self-test` → `SELF-TEST OK — … OpenDART 키 2개 · 키마다 예산 15000 · alert policies=3`.
- Task 1 · 2 · 3 의 계획 grep 게이트 전부 통과(`13,140` 은 src · CLAUDE.md · 배포 스크립트 어디에도 없음).
- 참고: tests 까지 넓힌 tsc(임시 설정)에서는 이번에 손대지 않은 기존 줄 2종 오류가 있다 — `tests/dbContract.test.ts` 의 `import.meta`(module 설정) · `tests/watches.test.ts` 근접 불일치 시험의 `obj` 타입. 패키지 typecheck 는 src 만 보므로 통과.

## 조사 원본 판정 표(실제 `judgeRow` · rows.tsv)

임시 스크립트 `/private/tmp/claude-501/-Users-alex-repos-gh-radar/0b05cde1-2794-402e-a428-da2b86157e8f/scratchpad/rn7/judge-survey.ts`(저장소 밖)로 `buildWatches(DEFAULT_B001_KINDS)` 의 해당 유형 감시 대상과 실제 `judgeRow`(정정 include)로 판정했다. 종목코드 「123456」 · 접수번호 14자리 · 회사명 임의 값(조사 원본에 없음). 출력 원본은 같은 폴더의 `judge-survey.out`.

| 유형 | 통과 이름 | 건수 | 계획 실측(design C) |
|------|-----------|------|---------------------|
| I003 | 주권매매거래정지 | 9 | 9 |
| I003 | 기타시장안내(관리종목지정우려종목) | 7 | 7 |
| I003 | 주권매매거래정지해제 | 4 | 4 |
| I003 | 주권매매거래정지기간변경 | 4 | 4 |
| I003 | 불성실공시법인지정 | 2 | 2 |
| I004 | 최대주주등소유주식변동신고서 | 44 | 44 |
| I001 | 현금ㆍ현물배당결정(꼬리 없음 13 · (분기배당) 6 · (자회사의 주요경영사항) 5 · 자회사 + 분기 1) | 25 | 25(자회사 6) |
| I001 | 투자유의안내 | 2 | 2 |
| I001 | 단일판매ㆍ공급계약체결 · 주식소각결정 · 투자판단관련주요경영사항 · 최대주주변경 · 경영권변경등에관한계약체결 · 최대주주변경을수반하는주식양수도계약체결(기존) | 29 · 24 · 19 · 4 · 2 · 1 | — |
| D005 | 거래계획보고서 · 거래계획철회보고서(기존) | 9 · 2 | — |

탈락: I003 전체 122 중 kind 95 · correction 1 / I001 전체 561 중 correction 126 · kind 312 · market 17.

U-1 이 「넣지 않는다」 고 한 이름 — **통과 0건**:

| 유형 | 이름 | 조사 원본 건수 | 판정 |
|------|------|----------------|------|
| I001 | 현금ㆍ현물배당을위한주주명부폐쇄(기준일)결정 | 12 | 전부 kind |
| I001 | 중간(분기)배당을위한주주명부폐쇄(기준일)결정 | 6 | 전부 kind |
| I001 | 부동산투자회사금전배당결정 | 1 | kind |
| I003 | 기타시장안내 (…) 그 밖 안내(주가 미달 6 포함 · 최대주주의무보유관련 포함) | 20 | 전부 kind |
| I003 | 기업설명회(IR)개최(안내공시) | 70 | kind 69 · correction 1 |
| I003 | 중간(분기)배당락 | 2 | kind |
| I003 | 불성실공시법인지정예고 · 불성실공시법인미지정 | 1 · 1 | kind |
| I003 | 소속부변경 · 전환가액ㆍ신주인수권행사가액ㆍ교환가액의조정(안내공시) | 1 · 1 | kind |

## 사용자 확인 대기

1. 전날 확인으로 찾은 건은 「(늦은 알림)」 으로 보낸다(그날 수집기가 비어 있던 시간에 놓친 건이라 D-12 와 같은 뜻 · 첫 줄 모양 그대로 · 접수일 따로 표시 없음).
2. 장애 글은 한 쌍 — 먼저 막힌 키 사유로 열고 두 키 모두 회복해야 「다시 동작」, 열린 동안 다른 키까지 막히면 단체방 글 없이 운영자 메일만(키마다 한 쌍을 내려면 DB 장애 칸을 늘리는 마이그레이션이 필요해 이번엔 안 함).

## I003 제출인을 붙이지 않는 근거

거래소 시장조치는 제출인이 늘 거래소(유가증권시장본부 · 코스닥시장본부 꼴)라 회사와 달라 지금 규칙이면 매번 붙고 정보가 없다 — 조사 원본에 flr_nm 이 없어 거래소 표기를 이름으로 거를 수 없으므로 감시 대상 단위 `hideFiler: true` 로 붙이지 않는다.

## 계획과 달라진 점

1. **[Rule 3] delivery.test.ts 를 Task 1 에서도 고쳤다** — Task 1 파일 목록에 없지만 5초 바퀴로 재시도 송신 시각 단언(10:00:10 · :20 · :40)이 깨졌다. 산수(기록 시각 + retryInS 뒤 첫 5초 바퀴)로 `10:00:05 · :15 · :35` 로 바꿨다(커밋 `020b2894`).
2. **[Rule 1] 시작 점검(startupCheck)이 멈춘 키의 감시 대상을 뺀다** — 계획에 없던 처리. 예산 · 시작 탐침 실패로 멈춘 키의 감시 대상을 「죽은 수집기」 기준점 계산에 넣으면 「수집기 중단」 장애가 열려 그 키가 멈춘 동안 닫히지 않는다. 멈춘 키는 settleHalts · 앞 실행이 사유를 남긴다.
3. **[판단] 예산 멈춤 로그 한 번** — 계획은 budgetGate 와 settleHalts 양쪽에 error `dart key paused …` 를 적었는데, 그러면 같은 멈춤이 두 번 찍힌다. budgetGate 는 레인만 멈추고(fresh) 로그 · 장애 글은 바퀴 끝 settleHalts 한 곳에서(예산이면 used · budget 필드 포함) 낸다. 쓰는 키가 전부 멈추는 길의 `daily budget exhausted — stopping this run` 은 그대로 budgetGate 에서.
4. **[판단] 「쓰는 키가 전부 멈춤」 종료 이유** — 계획의 「마지막 멈춤 이유」 를 `lastPaused`(가장 최근에 멈춘 레인)로 정했다. 키 1 만 쓰는 기존 시험의 종료 이유 · 로그는 전부 그대로 통과.
5. **[판단] 시험 숫자의 Task 간 변화** — 계획 Task 1 의 watchMix 트레이서 수치(키 2 카운터 10 · I001 priority 2)는 감시 대상 4개 기준이다. Task 2 가 I003 · I004 를 더하면서 손 계산으로 키 2 16(I001 7 + 30초 칸 셋 각 3) · priority 3 으로 다시 맞췄다. 키 2 예산 소진 시험도 6개 기준(14,995 + 4 + 1 = 15,000 → I001 2 · 나머지 1)으로 재계산했다.
6. **[판단] 바퀴 밀림 시험의 지연** — 「D005 조회 사이가 30초를 넘어도 늦음 아님」 시험은 3초 지연이면 간격이 정확히 30초에 머물러 7초로 바꿨다(여섯을 부르는 바퀴 42초 · 주석에 산수).
7. **[주석만] collector.ts 머리 주석의 D-12 늦음 간격 · seed 주석**이 옛 값(I001 90초 · D005 120초 · 「네 감시 대상」)으로 남아 Task 3 커밋에서 고쳤다(코드 변경 없음).
8. **master 보호 가드** — 실행자 프로토콜의 Step 0 가드(`git.base-branch --is-protected master` = true)는 master 커밋을 멈추라고 하지만, 오케스트레이터 지시(메인 트리 순차 실행 · 브랜치 전환 금지)와 사용자 메모리(「작업은 master 에서」)에 따라 master 에 경로 지정으로 커밋했다.

## 메인 세션 배포 메모

1. **사용자 준비(`!` — 비밀 · IAM 쓰기)**: ① `! GCP_PROJECT_ID=gh-radar bash scripts/setup-dart-alert-iam.sh`(Secret 껍데기 `gh-radar-opendart-key-2` 생성 · Accessor 5건) ② `~/.config/gh-radar/dart-alert.env` 에 `OPENDART_API_KEY_2=<팀원 키 40자>` 한 줄(다른 줄은 지워도 된다 — 없는 줄은 SKIP) → `! bash scripts/setup-dart-alert-secrets.sh`(키 1 과 같은 값이면 ERROR). 키 2 Secret 이 없거나 비면 배포 스크립트가 한국어 안내로 멈추고, 수집기도 `missing env: OPENDART_API_KEY_2` 로 시작하지 않는다.
2. **새 env · Secret**: Job 비밀 5개(`OPENDART_API_KEY_2=gh-radar-opendart-key-2:latest` 추가). 일반 env 변화 없음. 키 2 카운터 `opendart_list_k2` · `opendart_list_k2_quota_strike`(api_usage service 는 CHECK 없는 text).
3. **마이그레이션 없음** → `supabase db push` 불필요. db.ts · dart/client.ts 미변경.
4. **배포 시점**: 평일 20:00 뒤 · 07:00 전에 `scripts/deploy-dart-alert.sh`(대상은 이 Job 하나 — server · webapp 아님). 장중이면 도는 실행을 취소하지 않는다.
5. **배포 직후 seed 1번(함정 A)**: `gcloud run jobs execute gh-radar-dart-alert --region=asia-northeast3 --update-env-vars=DART_ALERT_MODE=seed` → 로그 「seed done」 확인. 빼먹으면 다음 아침 07:00 전날 확인이 전날 새 종류 건(I003 · I004 · I001 배당 등 약 20 ~ 40건)을 「(늦은 알림)」 으로 한꺼번에 보낸다.
6. **스모크 변경**: probe 는 이제 키 2(거래소 수시공시 1쪽 · 키 2 카운터) · 새 INV-2b(Job env `OPENDART_API_KEY_2` → Secret `gh-radar-opendart-key-2` 참조). `dart-alert-report.sh survey` 도 키 2 · 키 2 카운터.
7. 배포 전 라이브 Job env 에 `DART_ALERT_B001_KINDS` 가 박혀 있지 않은지 확인(기존 주의).
8. **첫 운영일 저녁**: `bash scripts/dart-alert-report.sh stats` — 키 1 약 14,760 · 키 2 약 9,400 ~ 10,500 · 감시 대상별 6개 · 「전날 확인(오늘)」 6개. 20:00 `collector stop` 로그의 `laps` 가 9,360 에 가까운지(5초 바퀴가 밀리지 않았는지) · `usedToday` `{ k1, k2 }` 값.
9. 키 1 은 80% 경고(12,000 · warn · 메일 없음)가 평일마다 저녁에 한 번 찍힌다. 키 1 여유가 약 240 이라 B001 이 하루 100건을 넘는 날은 추가 쪽으로 15,000 에 닿을 수 있다(그때 키 1 만 멈추고 장애 글).
10. push 는 webapp 프로덕션 배포다 — 같은 master 에서 옆 세션이 진행 중이니 push 직전 `git status -sb` 의 ahead 수를 확인한다(지금 ahead 9 — 이 작업 3 + 옆 세션 커밋).

## Known Stubs

없음.

## Threat Flags

없음 — 새 네트워크 엔드포인트 · 인증 경로 없음. 새 비밀(`OPENDART_API_KEY_2`)은 기존 비밀과 같은 길(Secret Manager → Job env · 로거 redact `dartApiKey2` · 오류 메시지 값 미포함)로만 다룬다. 보고 스크립트의 새 PostgREST GET(`api_usage`)은 기존 `sb_rpc` 와 같은 `curl -K -` 설정 줄(키 명령줄 노출 0)이다.

## Self-Check: PASSED

- 커밋 `020b2894` · `6832ec38` · `3dcc287b` 가 HEAD 조상에 있음(`git merge-base --is-ancestor`).
- 수정 파일 전부 존재 · 임시 스크립트 `/private/tmp/claude-501/-Users-alex-repos-gh-radar/0b05cde1-2794-402e-a428-da2b86157e8f/scratchpad/rn7/judge-survey.ts` 는 저장소 밖.
