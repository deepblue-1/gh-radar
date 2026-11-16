---
phase: 43-tender-offer-telegram-alert
verified: 2026-11-16T08:30:00Z
status: passed
score: 7/7 must-haves verified
covered_files:
  - ".planning/phases/43-tender-offer-telegram-alert/43-01-PLAN.md"
  - ".planning/phases/43-tender-offer-telegram-alert/43-01-SUMMARY.md"
  - ".planning/phases/43-tender-offer-telegram-alert/43-02-PLAN.md"
  - ".planning/phases/43-tender-offer-telegram-alert/43-02-SUMMARY.md"
  - ".planning/phases/43-tender-offer-telegram-alert/43-03-PLAN.md"
  - ".planning/phases/43-tender-offer-telegram-alert/43-03-SUMMARY.md"
  - ".planning/phases/43-tender-offer-telegram-alert/43-04-PLAN.md"
  - ".planning/phases/43-tender-offer-telegram-alert/43-04-SUMMARY.md"
  - ".planning/phases/43-tender-offer-telegram-alert/43-05-PLAN.md"
  - ".planning/phases/43-tender-offer-telegram-alert/43-05-SUMMARY.md"
  - ".planning/phases/43-tender-offer-telegram-alert/43-06-PLAN.md"
  - ".planning/phases/43-tender-offer-telegram-alert/43-06-SUMMARY.md"
  - ".planning/phases/43-tender-offer-telegram-alert/43-07-PLAN.md"
  - ".planning/phases/43-tender-offer-telegram-alert/43-07-SUMMARY.md"
  - ".planning/phases/43-tender-offer-telegram-alert/43-08-PLAN.md"
  - ".planning/phases/43-tender-offer-telegram-alert/43-08-SUMMARY.md"
  - ".planning/phases/43-tender-offer-telegram-alert/43-09-PLAN.md"
  - ".planning/phases/43-tender-offer-telegram-alert/43-09-SUMMARY.md"
  - ".planning/quick/261113-iez-dart-alert-i001-d005-b001-2/261113-iez-PLAN.md"
  - ".planning/quick/261113-iez-dart-alert-i001-d005-b001-2/261113-iez-SUMMARY.md"
  - ".planning/quick/261113-rn7-dart-alert-two-keys-cadence-and-new-kind/261113-rn7-PLAN.md"
  - ".planning/quick/261113-rn7-dart-alert-two-keys-cadence-and-new-kind/261113-rn7-SUMMARY.md"
  - "CLAUDE.md"
  - "docs/stack.md"
  - "ops/alert-dart-alert-error-log.yaml"
  - "ops/alert-dart-alert-failure.yaml"
  - "scripts/dart-alert-report.sh"
  - "scripts/deploy-dart-alert.sh"
  - "scripts/setup-dart-alert-iam.sh"
  - "scripts/setup-dart-alert-secrets.sh"
  - "scripts/smoke-dart-alert.sh"
  - "supabase/migrations/20261113200000_dart_alert.sql"
  - "supabase/migrations/20261113400000_dart_alert_fix.sql"
  - "supabase/tests/dart_alert.test.sql"
  - "workers/dart-alert/src/apiUsage.ts"
  - "workers/dart-alert/src/cadence.ts"
  - "workers/dart-alert/src/collector.ts"
  - "workers/dart-alert/src/config.ts"
  - "workers/dart-alert/src/dart/client.ts"
  - "workers/dart-alert/src/db.ts"
  - "workers/dart-alert/src/index.ts"
  - "workers/dart-alert/src/lap.ts"
  - "workers/dart-alert/src/logger.ts"
  - "workers/dart-alert/src/message.ts"
  - "workers/dart-alert/src/safeError.ts"
  - "workers/dart-alert/src/services/supabase.ts"
  - "workers/dart-alert/src/telegram/client.ts"
  - "workers/dart-alert/src/watches.ts"
covered_digest: "v4:sha256:a0a88b0756048397d04a1a49fb7ac7b19f72bc5a7cef82a91c898b5924d8deaa"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 5/7
  gaps_closed:
    - "SC-1 (PRESENT_BEHAVIOR_UNVERIFIED) — 실제 알림 22건 · 지연 p50 1.6초 · p90 2.2초 (UAT 1)"
    - "SC-7 (UNCERTAIN) — 첫 실제 공개매수 · 주요사항보고서 건 지연 기록 (UAT 1)"
    - "human_verification 6건 전부 (UAT 1 ~ 6 pass)"
  gaps_remaining: []
  regressions: []
coincidental_reliance_items: []
---

# Phase 43: 공개매수 · 유상증자 · 합병 공시 텔레그램 알림 — 재검증 보고서 (2회차)

**Phase Goal:** 공개매수 · 주요사항보고서 등 DART 공시가 접수되면 수 초 ~ 수십 초 안에 텔레그램 단체방에 두 줄 알림이 간다. OpenDART `list.json` 폴링, 공식 API 운영 기준 준수.
**Verified:** 2026-11-16
**Status:** passed
**Re-verification:** 예 — 1회차(`43-VERIFICATION.md` · 2026-11-13 · human_needed)가 phase 뒤 코드 변경(quick 2건 · 마감 재리뷰 R2 수정 6건)으로 낡아 다시 돌렸다. 1회차 파일은 건드리지 않았다.

## 한눈에

- 구현은 실재하고 연결돼 있다. 현재 HEAD 코드는 운영 이미지 `dart-alert:a94cba72` 와 같다 — `git diff a94cba72 HEAD -- workers/dart-alert scripts supabase ops` 가 비어 있다.
- 이 세션에서 직접 돌린 것: `vitest --maxWorkers=2` 18파일 **471/471 통과** · `tsc --noEmit` 종료 0 · `bash scripts/deploy-dart-alert.sh --self-test` → `SELF-TEST OK`(키 2개 · 키마다 예산 15000 · 알림 정책 3개). 워커 · 스크립트 · 마이그레이션 · ops 파일에 `TBD` · `FIXME` · `XXX` 0건.
- 못 돌린 것(금지 · 환경): pgTAP(일회용 DB 필요) · 배포 · gcloud · supabase · 네트워크. pgTAP 은 `43-VALIDATION.md`(validated · 갭 0)와 43-08 기록의 주장으로만 본다 — 이번 검증의 판정 근거로 쓰지 않았다(아래 SC-2).
- 1회차의 사람 확인 6건은 `43-UAT.md` 6/6 pass(사용자 2026-11-16 「UAT 모두 pass」)로 해소됐다. 실패한 must-have 는 없다.
- 변경 범위: phase 43 · quick 2건 커밋 중 `webapp/` · `server/` · `relay/` · `packages/` 를 만진 것은 없다(커밋 메시지 `(43-` · `quick-261113-*` 로 조회 0건; 같은 경로를 만진 다른 phase 커밋은 무시).

## 요구사항 ID 대조

플랜 프런트매터 `requirements` 는 전부 `SC-1 ~ SC-7`(로드맵 성공 기준 번호)이고 로드맵도 `Requirements: TBD` 다. `.planning/REQUIREMENTS.md` 에는 `SC-` · DART · 공시 항목이 없다(`grep -in "SC-\|Phase 43\|DART\|공시"` 0건) — REQUIREMENTS.md 에 매핑된 ID 가 없고 고아 요구도 0이다. 성공 기준 SC-1 ~ SC-7 을 계약으로 검증했고, 7개 모두 최소 하나의 플랜이 선언했다(1회차 대조와 같음).

## 마감 재검증이 본 변경 범위

| 변경 | 출처 | 이번 확인 |
|------|------|-----------|
| OpenDART 키 2개 · 키별 레인 · 키별 예산 · 카운터 `opendart_list` / `opendart_list_k2` · 5초 종일 바퀴 | quick 261113-rn7 | `config.ts`(`dartApiKey2` · 같은 값이면 시작 거부) · `collector.ts` `KeyLane` · `apiUsage.ts:25-29` 카운터 4개 · `cadence.ts` `LAP_INTERVAL_MS=5_000` |
| 감시 대상 6개(D004 · B001 · I003 · I001 · I004 · D005) · 종류 확장 | quick 261113-iez · rn7 | `watches.ts buildWatches` 코드 상수 키 대응 · `matchesKind` |
| 아침 전날 확인(직전 평일 1회) | quick 261113-rn7 U-3 | `cadence.ts prevWeekdayYmd` · `collector.ts` `PREV_DAY_*` 상한 |
| R2 CR-01 넣기 연속 실패 판정 | e7cc1445 | `lap.ts:166,323-328` `insertAttempted` · `collector.ts:728` 넣기를 시도한 바퀴만 `insertFail` 지움 · `collector.ts:989` `insertFail === null` 일 때만 닫음 |
| R2 WR-01 임대 넣기 직전 연장 | 09e6e422 | `lap.ts:234,324` `beforeInsert` 훅 · `collector.ts:717` `maintain(now,false)` · `collector.ts:713` 의 `LeaseLostError`/`StopRun` 재던짐 |
| R2 IN-01 재탐침 전 예산 확인 | ec258a52 | `collector.ts:752-756` |
| R2 IN-02 창 안 seed 뒤 auto 의 drain | 00017b9b | `collector.ts:696` `autoLapsRan` · `:917` 조건 |
| R2 IN-03 날 넘긴 「다시 동작」 문구 | 39d88766 | `message.ts:106` · `tests/message.test.ts:197` |
| R2 IN-04 env 바꾸기 seed 안내 | 0de7abb6 | `scripts/deploy-dart-alert.sh`(주석 · `--self-test` OK) |

각 코드 수정에는 이름 있는 시험이 있고 471건에 포함돼 통과한다 — `collector.test.ts:210 · :228`(WR-01) · `:540-580`(CR-01 · PGRST202 5분 장애) · `modes.test.ts:164 · :179 · :214`(WR-01 seed · IN-02) · `watchMix.test.ts`(IN-01).

## Goal Achievement — Observable Truths (로드맵 성공 기준)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | 평일 창 안 접수 → 30초 안에 보고서마다 두 줄 알림 1건 | ✓ VERIFIED | 코드 길: `watches.ts judgeRow`(corp_cls Y/K · 종목코드 6자리 · D004 이름 무관 · B001 허용 목록 완전 일치) → `lap.ts collectOnce` → `dart_alert_insert` → 같은 바퀴 `deliverPending` → `message.ts alertText`(`📢 보고서명 — 회사(코드) · 제출인` / `DART 원문 · 금융감독원 전자공시`) → `telegram/client.ts`(`parse_mode HTML` · `link_preview_options.is_disabled` · `disable_notification` 없음). **실제 운영 증거:** UAT 1 — 11-13 ~ 11-16 실제 알림 22건(공개매수결과보고서 · 주요사항보고서 [기재정정] 유상증자 · 합병 · I001 · D005), 처음 봄 → 보냄 지연 p50 1.6초 · p90 2.2초(사용자 확인: 두 줄 · 원문 링크 · 미리보기 없음 · 소리). 11-16 17:19 운영 통계 sent 41 · p50 1.6초 · p90 2.4초. 1회차의 behavior-unverified 가 운영 데이터로 해소됨 |
| SC-2 | 같은 접수번호는 한 번만 — 재시작 · 중복 실행 · 같은 응답 반복 | ✓ VERIFIED | `dart_alerts.rcept_no` PK + `dart_alert_insert` 의 `ON CONFLICT DO NOTHING RETURNING`(마이그레이션 `20261113200000_dart_alert.sql`) · 임대 TTL 90초 · 30초 연장 · 넣기 직전 연장(R2 WR-01)으로 TTL 경합 폭 축소. 시험: `tracer.test.ts`(재조회 · 재시작) · `collector.test.ts` 임대 · 인계 시험군 통과(이 세션 실행). 운영: 11-16 41건 발송 중 중복 보고 없음(UAT 1). pgTAP 은 이 세션에서 실행하지 못했고 VALIDATION 기록을 참조만 함 |
| SC-3 | 늦게 떠도 그날 접수 건은 놓치지 않고, 지난 날짜를 한꺼번에 쏟아내지 않는다 | ✓ VERIFIED | 조회는 오늘(KST) 하루(`kstYmd`). 늦게 뜬 실행의 그날 건은 「(늦은 알림)」 으로 보낸다(기준점 `coverPointMs` · `cadence.ts:150`). 새 임대 때 지난 날 pending/sending 은 `expired` 로 닫힘. 예외로 quick rn7 U-3 이 감시 대상마다 하루 1번 직전 평일을 다시 조회해 **DB 에 없는 통과 건만** 「(늦은 알림)」 으로 보낸다 — 사용자가 결정한 설계이고(하루 3번 시도 상한 · 전 쪽 조회 · 쏟아내기 아닌 놓친 건 보충) UAT 2 에서 정상 아침 시작에 늦은 알림 0 · 전날 확인 6개 감시 대상 모두 표시 확인 |
| SC-4 | 하루 호출 상한 이하 · `api_usage` KST 날짜별 기록 · `020` → run 중단 · 재시도로 두드리지 않음 | ✓ VERIFIED (설계 수치는 갱신됨) | 로드맵 문구의 「약 10,800회 · 54%」 는 5초 종일 · 키 2개 설계로 **대체**됐다 — 현재 설계는 키마다 예산 상한 15,000(공식 20,000 의 75%): 키 1 = D004 9,360 + B001 5,400 = **14,760**, 키 2 = I001 4,680 + I003 · I004 · D005 각 1,560 = **9,360**. `tests/cadence.test.ts:167-178` · `tests/collector.test.ts:29-39`(가짜 시계 07:00 ~ 20:00 호출 정확히 14,760 + 9,360) 통과. `config.ts` 예산 정수 1 ~ 15,000 강제 · `deploy-dart-alert.sh:150` 15,000 초과 거부 · 두 키가 같은 값이면 시작 거부. 카운터 `opendart_list`(키 1 · 연속성) · `opendart_list_k2`(키 2) · KST 날짜 키(`apiUsage.ts`). `020` → 그 키 레인 멈춤 + 한도 의심 표시 → 5분마다 단독 탐침 1건으로만 재확인(`retryPausedLanes` · R2 IN-01 로 예산 찬 키는 탐침 없이 그날 멈춤) · 쓰는 키 전부 멈추면 종료 1. **운영:** 11-16 17:19 키 1 11,810 · 키 2 7,492(둘 다 ≤ 15,000) · 한도 의심 0 · UAT 3 pass. 한계(정직 기록): 키 1 의 B001 이 하루 100건을 넘으면 설계상 예산을 넘겨 그날 키 1 만 멈춘다 — CLAUDE.md 「OpenDART 예산」 에 명시된 수용 위험 |
| SC-5 | 전송 실패는 재시도 · 끝내 못 보낸 건은 사유와 함께 로그 · 다음 실행이 이어 보낸다 | ✓ VERIFIED | `lap.ts deliverPending` 재시도(지수 5 ~ 60초) · 429 `retry_after` · 방 이동 · HTML 오류 평문 재송신 · 120초 넘으면 error. 인계: `dart_alert_lease_acquire` 가 오늘 `sending` → `pending`. 멈추기 직전 drain + `alerts left unsent at stop`(`collector.ts:914-933` · R2 IN-02 로 창 안 seed 뒤 auto 로 이어 간 실행도 포함). `delivery.test.ts` 17건 · `modes.test.ts:214` 통과. 로그는 `safeErrorFields` · `telegramSafeFields` 만(토큰 · URL 없음) |
| SC-6 | 수집기 죽음 · 5분 넘는 OpenDART 실패(한도 초과 포함) → 이메일 + 단체방 「⚠ 공시 알림이 멈췄습니다」, 복구 시 「다시 동작」 1회 | ✓ VERIFIED | `collector.ts` 장애 짝: `OUTAGE_AFTER_MS=300_000` · `openOutage`/`closeOutage` · 치명 종료 직전 글(`outageOnFatal`) · 키 하나 멈춤 시 그 키 사유로 열고 모든 키 회복 후에만 닫음 · 넣기 연속 실패도 5분 뒤 연다(R2 CR-01 — 띄엄 조회 대상에서도 `insertAttempted` 로 판정해 동작). 이메일: `ops/alert-dart-alert-failure.yaml`(실행 실패) · `ops/alert-dart-alert-error-log.yaml`(level ≥ 50) · 정책 3개는 `--self-test` 로 확인. `outage.test.ts` 25건 통과. 운영: UAT 2 — 11-16 아침 가짜 「멈췄습니다」 없음 · 장애 없음 · 임대 보유자 있음 · 그날 warn 이상 로그 0. UAT 4: error-log 정책은 배포 스모크 INV-5 로 존재 확인, **실제 error 가 아직 한 번도 없어 메일 발송은 실관측하지 못했다** — 사용자가 이 상태로 pass 처리(일부러 error 를 만들지 않음). 아래 「수용된 잔여 위험」 참고 |
| SC-7 | 첫 실제 공개매수 · 주요사항보고서 건에서 「DART 표기 시각 → 알림 도착」 지연 기록 | ✓ VERIFIED | UAT 1: 11-13 16:04:50 KST 공개매수결과보고서 · 주요사항보고서 [기재정정] 유상증자 · 합병 · I001 · D005 등 실제 22건 기록, 지연 p50 1.6초 · p90 2.2초(11-16 stats). 운영 통계 `dart-alert-report.sh stats` 의 latency 계산이 이를 기록한다 |

**Score:** 7/7 truths verified (behavior-unverified 0 · override 0)

### 잠긴 결정 D-01 ~ D-17 대조 (현재 코드 기준)

| 결정 | 결과 | 근거 |
|------|------|------|
| D-01 공개매수 이름으로 거르지 않음 · 정정 포함 | ✓ | `watches.ts` `{ form: "any" }` · `judgeRow` any → send |
| D-02 보고서마다 1건 · 무음 아님 | ✓ | 행마다 `sendPaced` · `telegram/client.ts:96-97` 인자 3개만 |
| D-03 · D-04 유상증자 · 합병 허용 목록(설정값) | ✓ | `DEFAULT_B001_KINDS` 6종(기존 4 + quick iez 2) · env `DART_ALERT_B001_KINDS` · 괄호 종류명 완전 일치 · 근접 불일치 warn. UAT 5 pass |
| D-05 코스피 · 코스닥만 | ✓ | `ALLOWED_CORP_CLS` Y · K + `STOCK_CODE_RE` |
| D-06 ~ D-08 두 줄 · 본문 숫자 없음 · 링크 하나 | ✓ | `message.ts alertText` |
| D-09 웹앱 미노출 | ✓ | `webapp/` · `server/` 변경 없음 |
| D-10 · D-11 주기 · 창 | ✓ (대체됨) | D-10 5초/10초 바퀴는 quick rn7 U-2 로 종일 5초 + 감시 대상별 칸으로 **대체**(사용자 결정 2026-11-13 · `cadence.ts` 머리 주석). 창 `07:00 ~ 20:00` 평일 · 휴장일 달력 없음 · Scheduler `*/5 7-19 * * 1-5` 는 `schedule.test.ts` 가 `isInWindow` 와 대조 |
| D-12 지난 날 안 쏟아냄 · 「(늦은 알림)」 | ✓ | `coverPointMs` · `lateGapMs`(조회 간격만큼 보정 — 정상 조회는 늦음이 안 됨) · 전날 확인은 DB 에 없는 건만 |
| D-13 30초 목표 | ✓ | 실측 p90 2.4초 |
| D-14 · D-15 단체방 1개 · 방 id 설정값 | ✓ | `TELEGRAM_CHAT_ID` Secret · `parseChatId` · `test-send` 모드. 단체방 확인 글 도착(UAT 1 note) |
| D-16 · D-17 이메일 + 단체방 · 5분 · 한 번 · 복구 한 번 | ✓ | SC-6 |

### Required Artifacts / Key Links (현재 상태)

| Artifact / Link | 상태 | 상세 |
|-----------------|------|------|
| `workers/dart-alert/src/*` 14개(collector 1,393줄 · lap 525줄 등) | ✓ VERIFIED | 실질 구현 · 스텁 없음 · `index.ts` → `runCollector` 결선 · `entryWiring.test.ts` 7건 · `dbContract.test.ts` 9건이 RPC 이름 · 인자 · 반환 키를 마이그레이션과 대조 |
| `supabase/migrations/20261113200000_dart_alert.sql` + `20261113400000_dart_alert_fix.sql` | ✓ VERIFIED | 파일 존재(수정 마이그레이션 버전은 d523e2ac 에서 충돌 회피로 `…400000` 으로 정함). 변경 없음(a94cba72 이후 diff 0) |
| `scripts/deploy-dart-alert.sh` · `setup-dart-alert-*.sh` · `smoke-dart-alert.sh` · `dart-alert-report.sh` | ✓ VERIFIED | `--self-test` OK · 예산 상한 15,000 강제 · Scheduler 배열 |
| `ops/alert-dart-alert-*.yaml` | ✓ VERIFIED | 정책 3개 `--self-test` 확인 |
| `CLAUDE.md` · `docs/stack.md` OpenDART 기준 | ✓ VERIFIED | 한도 20,000 · 예산 키마다 15,000 · 카운터 4개 이름 · 주기 · 소비처가 현재 코드와 일치(`cadence.ts` 산수 14,760 · 9,360 · 전날 확인 2 · 5 와 같은 값) |
| `43-UAT.md` | ✓ 존재 | 1회차의 MISSING 해소 · 6/6 pass |
| Scheduler 5분 깨움 → Job | WIRED | 배포 스크립트 · `schedule.test.ts`. 운영 스모크 14/14 PASS · 11-16 임대 보유자 확인(UAT 2) |

### Data-Flow Trace (Level 4)

| Artifact | 데이터 | 출처 | 실데이터 | 상태 |
|----------|--------|------|----------|------|
| `alertText` 입력 | 보고서명 · 회사 · 종목코드 · 제출인 · 접수번호 | OpenDART 응답 → `dart_alerts` 행 → claim | 예 — 운영 실알림 22건 + 41건 발송 | ✓ FLOWING |
| `api_usage` | 키별 호출 수 | `UsageCounter` ← `countedList` 10초 flush | 예 — 키 1 11,810 · 키 2 7,492 | ✓ FLOWING |
| 장애 글 | 사유 · 시작 시각 | `lastOk` · DB `outage_since` | 예(코드 + 시험) | ✓ FLOWING |

### Behavioral Spot-Checks

| 동작 | 명령 | 결과 | 상태 |
|------|------|------|------|
| 워커 전체 단위 시험 | `cd workers/dart-alert && pnpm exec vitest run --maxWorkers=2` | 18파일 · 471 통과 · 1.96초 | ✓ PASS |
| 타입 검사 | `pnpm exec tsc --noEmit` | 종료 0 | ✓ PASS |
| 배포 스크립트 자체시험 | `bash scripts/deploy-dart-alert.sh --self-test` | `SELF-TEST OK` | ✓ PASS |
| `020` 중단 · 탐침 | `vitest -t "020" tests/collector.test.ts` | 4 통과 | ✓ PASS |
| 하루 호출 14,760 + 9,360 | `collector.test.ts` 첫 시험(가짜 시계) | 통과(전체 471 에 포함) | ✓ PASS |
| 배포 이미지 = 현재 코드 | `git diff --stat a94cba72 HEAD -- workers/dart-alert scripts supabase ops` | 변경 0 | ✓ PASS |
| pgTAP | 일회용 DB 필요 — 실행 금지 | — | ? SKIP (VALIDATION 기록 참조 · 판정 근거 아님) |

### Probe Execution

해당 없음 — 이 phase 는 `scripts/*/tests/probe-*.sh` 꼴 probe 를 선언하지 않았다. 배포 스모크의 `DART_ALERT_MODE=probe` 는 운영 호출이라 실행하지 않았고, 운영에서는 스모크 14/14 PASS 로 기록됐다.

### Anti-Patterns Found

| 파일 | 패턴 | 심각도 | 영향 |
|------|------|--------|------|
| 워커 소스 · 스크립트 · 마이그레이션 · ops | `TBD` · `FIXME` · `XXX` | — | 0건 (디버트 마커 게이트 통과) |
| 로그 호출 | 원본 오류 객체 · 비밀 로깅 | — | 없음 — 모두 `safeErrorFields` · `telegramSafeFields` 경유 |
| 1회차 CR-50 · WR 경고군 | — | — | `43-REVIEW-DISPOSITION.md` 28건 + `-R2` 6건 전부 `fixed`(open 0) |

### Human Verification Required

없음. 1회차 6건은 `43-UAT.md` 6/6 pass 로 해소됐다(UAT 1 ~ 6 · 사용자 2026-11-16 「UAT 모두 pass」).

### 수용된 잔여 위험 (갭 아님 · 정보)

1. **error 로그 → 운영자 메일 실관측 없음(UAT 4):** 정책 존재는 스모크 INV-5 로 확인했고 필터는 워커 로그 모양(level ≥ 50)과 맞는다. 실제 error 가 없어 발송은 첫 error 때 확인된다. 사용자가 일부러 만들지 않기로 하고 pass 처리했다.
2. **키 1 예산 여유 약 240:** B001 이 하루 100건을 넘는 날 추가 쪽으로 15,000 을 넘어 그날 키 1 만 멈추고 장애 글이 나간다(CLAUDE.md 에 명시된 설계 한계 · 감속 규칙 없음은 사용자 결정).
3. **로드맵 문구 갱신 권고:** ROADMAP.md 의 Goal · SC-4 문구(「약 10,800회 · 54%」 · 「5초/10초」)는 quick rn7 로 대체된 옛 설계 수치다. 현재 정본은 CLAUDE.md 「공식 API 운영 기준」 이다. 동작에는 영향이 없고, 다음에 ROADMAP 을 만질 때 SC-4 를 「키마다 상한 15,000 이하」 로 맞추는 것을 권한다.
4. **pgTAP 미재실행:** 이 세션은 일회용 DB 를 띄우지 않았다. DB 계약은 워커 쪽 `dbContract.test.ts` 자동 대조(통과)와 운영 41건 발송 · 중복 0 · 장애 짝 정상으로 간접 확인된다.

### Gaps Summary

갭 없음. 성공 기준 7개 모두 현재 코드 · 시험 · 운영 증거(UAT 6/6 · 11-16 운영 통계)로 확인됐다. 1회차의 PRESENT_BEHAVIOR_UNVERIFIED(SC-1)와 UNCERTAIN(SC-7)은 실제 알림 22건의 운영 지연 실측으로 닫혔고, 마감 재리뷰 R2 의 치명 1 · 경고 1 · 참고 4 수정은 코드와 이름 있는 시험으로 모두 실재함을 확인했다.

---

_Verified: 2026-11-16T08:30:00Z_
_Verifier: Claude (gsd-verifier)_
