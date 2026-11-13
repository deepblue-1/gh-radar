---
phase: 43-tender-offer-telegram-alert
verified: 2026-11-13T01:40:00Z
status: human_needed
score: 5/7 must-haves verified
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
covered_digest: "v4:sha256:33d3088af65a7ec0dc551d5103f31380c8d87bae4b7438892d1be50462839e04"
behavior_unverified: 1
overrides_applied: 0
behavior_unverified_items:
  - truth: "SC-1 — 접수 30초 안에 단체방에 두 줄 알림 1건이 간다 (운영 DB 경로 끝-끝)"
    test: "운영에서 첫 실제 공개매수 또는 유상증자 · 합병 공시가 접수되면 단체방 글 · 로그 `dart alert` 한 건과 `stats` 의 sent 수를 본다"
    expected: "두 줄(「📢 보고서명 — 회사(종목코드) · 제출인 …」 / 「DART 원문 · 금융감독원 전자공시」), 링크가 DART 원문 뷰어로 열림, 링크 미리보기 카드 없음, 접수 뒤 30초 안 도착"
    why_human: "배포 뒤 운영 DB 로 넣기 · 차례 · 기록 RPC 가 한 번도 행을 만져 본 적이 없다(seed 는 matched 0 · inserted 0 · test-send 는 DB 를 거치지 않는다). 가짜 시계 테스트와 일회용 DB pgTAP 는 통과했지만 실제 접수 → 알림 도착은 실제 공시가 와야 확인된다."
coincidental_reliance_items: []
human_verification:
  - test: "첫 실제 알림의 모양 · 링크 · 지연 (SC-1 · SC-7)"
    expected: "두 줄 문구 · DART 원문 링크가 열림 · 미리보기 카드 없음 · 「DART 표기 시각 → 알림 도착」 지연이 30초 안. 장전 · 지분공시(공개매수) · 주요사항보고서 유형별로 각 첫 건에서 지연을 기록"
    why_human: "실제 공시가 와야 한다. 지금까지 실제 공시 알림은 0건이다."
  - test: "다음 평일 07:00 ~ 07:10 — 가짜 「멈췄습니다」 없음 (SC-6 · D-17)"
    expected: "단체방에 「⚠ 공시 알림이 멈췄습니다」 글이 없고 `bash scripts/dart-alert-report.sh stats 1` 의 장애 상태가 없음. 정상 아침 시작에 「(늦은 알림)」 도 붙지 않음"
    why_human: "시각이 지나야 한다(다음 평일 아침). 판정은 가짜 시계 테스트(outage.test.ts 「07:00:30 시작 · lastOk 없음 → 글 0」)로만 확인했다."
  - test: "오늘 20:00 뒤 하루 OpenDART 호출 수 (SC-4)"
    expected: "`bash scripts/dart-alert-report.sh stats 1` 의 오늘 호출 수 ≤ 15,000, 한도 의심 0. 오늘은 10:10 에 시작해 평일 설계값 10,800 보다 적게 나온다"
    why_human: "창이 끝나야(20:00) 하루 합이 나온다. 평일 전체 합 10,800 은 가짜 시계 테스트(collector.test.ts 첫 테스트)로만 확인했다."
  - test: "error 로그 알림 정책이 실제 error 로그에 걸려 운영자 메일이 오는지 (SC-6)"
    expected: "error 이상 로그가 생기면 `gh-radar-dart-alert-error-log` 정책이 운영자 이메일을 보냄"
    why_human: "아직 error 로그가 한 번도 없어 정책의 필터가 실제로 걸리는지 확인 못 했다(43-08-SUMMARY 「확인 못 한 것」)."
  - test: "유무상증자결정 · 회사분할합병결정 실제 표기 관찰 (D-03 · D-04)"
    expected: "처음 올라온 해당 공시의 report_nm 이 `주요사항보고서(유무상증자결정)` · `주요사항보고서(회사분할합병결정)` 꼴이라 허용 목록 완전 일치로 알림이 나감. 다르면 `b001 near-miss kind` warn 이 남는다"
    why_human: "30일 조사에서 0건이라 표기를 대조하지 못했다. 허용 목록 밖 표기는 알림이 안 나가고 warn 로그만 남는다(이메일 없음)."
  - test: "리뷰 28건 처분과 치명 CR-50 수용 여부 (결정 요청)"
    expected: "CR-50(실행이 아예 생기지 않는 장애 — Scheduler PAUSED · 삭제 · 호출 권한 유실 — 가 어느 알림에도 안 걸림 · `--scheduler-paused` 가 운영 중 Scheduler 도 멈춤)을 phase 닫기 전에 고칠지, 수용하고 이월할지 사용자가 정한다. WR-01 · WR-02 · WR-05 도 같이 처분한다"
    why_human: "수정 여부는 범위 · 위험 수용 결정이다. 모든 리뷰 항목이 `43-REVIEW-DISPOSITION.md` 에 open 으로 남아 있다."
---

# Phase 43: 공개매수 · 유상증자 · 합병 공시 텔레그램 알림 — 검증 보고서

**Phase Goal:** 공개매수 공시와 유상증자 · 합병 결정 공시(코스피 · 코스닥)가 DART 에 접수되면 수 초 ~ 수십 초 안에 텔레그램 단체방에 두 줄 알림이 간다. 공식 API 운영 기준(15,000회/일 이하 · 고정 주기 · 한도 소진 신호 시 run 중단 · 출처와 원문 링크) 안에서 운영한다.
**Verified:** 2026-11-13
**Status:** human_needed
**Re-verification:** 아니오 — 최초 검증 (이전 VERIFICATION.md 없음)

## 한눈에

- 구현은 실재하고 연결돼 있다. 워커 `workers/dart-alert` 14개 소스 · 마이그레이션 · 배포/스모크/보고 스크립트 · 알림 정책 2개가 모두 있고, 스텁이 아니다.
- 이 검증 세션에서 직접 돌린 것: `vitest` 15파일 **306/306 통과** · `tsc --noEmit` 종료 0 · 디버트 마커(TBD/FIXME/XXX) 0건 · 배포 이미지 `3be96321` 이 HEAD 의 조상이고, 그 뒤 워커 · 마이그레이션 · 배포 스크립트 변경 0.
- 못 돌린 것(금지 · 환경): pgTAP 173건(일회용 DB 필요)은 오케스트레이터 · 43-08-SUMMARY 가 통과했다고 적은 **주장**으로만 기록한다. 원격 상태(Job · Scheduler · 정책 · 비밀)도 SUMMARY 의 주장이다.
- 실패한 must-have 는 없다. 그러나 **실제 공시가 한 번도 흐르지 않았고**(실제 알림 0건), 시간이 지나야 확인되는 항목이 있어 `human_needed` 다. 리뷰 치명 1건(CR-50)은 must-have 를 부수지는 않지만 D-16 의 취지(조용한 끊김 없음)를 약하게 하는 경고로 분류하고 사용자 결정을 요청한다.

## 요구사항 ID 대조

플랜 프런트매터의 `requirements` 는 전부 `SC-1 ~ SC-7`(로드맵 성공 기준 번호)이며 `REQUIREMENTS.md` 의 ID 가 아니다. `.planning/REQUIREMENTS.md`(96줄)에는 `SC-` · `Phase 43` · DART · 공시 항목이 한 건도 없고 로드맵도 `Requirements: TBD` 다. 따라서 이 phase 는 REQUIREMENTS.md 에 매핑된 요구가 없고(고아 요구 0), ROADMAP 성공 기준 SC-1 ~ SC-7 과 CONTEXT D-01 ~ D-17 로 검증했다. 플랜별 선언: 43-01 [SC-1,2] · 43-02 [SC-2,3,5,6] · 43-03 [SC-3,4] · 43-04 [SC-1,4,5] · 43-05 [SC-1,2,3,4] · 43-06 [SC-5,6] · 43-07 [SC-4,6,7] · 43-08 [SC-1 ~ 7] · 43-09 [SC-1]. SC-1 ~ SC-7 모두 최소 하나의 플랜이 선언했다.

## Goal Achievement

### Observable Truths (로드맵 성공 기준 = 계약)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | 평일 창(07:00 ~ 20:00) 안에 공개매수 보고서 또는 유상증자 · 합병 결정 주요사항보고서(코스피 · 코스닥)가 접수되면 30초 안에 보고서마다 두 줄 알림 1건 | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | 코드 길은 전부 있다: `watches.ts` 판정(D004 이름 무관 · B001 허용 목록 완전 일치 · `corp_cls` Y/K · 종목코드 6자리) → `lap.ts collectOnce` → `dart_alert_insert` → 같은 바퀴 `deliverPending` → `message.ts alertText` 두 줄 → `telegram/client.ts` (`parse_mode HTML` · 링크 미리보기 끔 · 무음 인자 없음). 바퀴 5초(07 ~ 09시) · 10초(그 밖). `collector.test.ts:186` 「10:00 에 공개매수 1건 → 그 바퀴 안에서 send 1」 통과. **빠진 것:** 운영 DB 로 넣기 · 차례 · 기록이 행을 만져 본 적이 없고(seed matched 0 · test-send 는 DB 미경유) 실제 접수 → 도착 지연은 미측정 → 사람 확인 |
| SC-2 | 같은 접수번호는 한 번만 — 재시작 · 중복 실행 · 같은 응답 반복에도(보낸 접수번호를 DB 에 남김) | ✓ VERIFIED | 마이그레이션: `dart_alerts.rcept_no PRIMARY KEY CHECK ^[0-9]{14}$` + `dart_alert_insert` 의 `ON CONFLICT (rcept_no) DO NOTHING RETURNING` 이 새 행만 반환. 임대 TTL 90초 · 30초 연장(`collector.ts` · `dart_alert_lease_acquire`), 임대 아닌 보유자 호출은 55000. 테스트: `tracer.test.ts:188`(재조회 · 재시작에도 다시 안 감) · `collector.test.ts:66/78/90/101/112` · pgTAP I5 ~ I7 · L1 ~ L19(오케스트레이터 주장). 한계: 네트워크 정지가 90초를 넘기면 드물게 중복 가능(설계상 「최소 1회 · 드문 중복 수용」 · WR-04) |
| SC-3 | 수집기가 늦게 떴어도 그날 이미 접수된 건은 놓치지 않고, 지난 날짜 건을 한꺼번에 쏟아내지 않는다 | ✓ VERIFIED | 조회는 항상 오늘(KST) 하루(`bgn_de = end_de = day` · `collector.test.ts:244`). 늦게 뜬 실행은 그날 건을 전부 「(늦은 알림)」 으로 보낸다(`collector.test.ts:204`, 07:02 기준점 `START_GRACE_MS`). 새 임대 때 지난 날 pending/sending 은 `expired` 로 닫힌다(마이그레이션 171-175 · pgTAP R13). 정상 아침 시작은 늦음이 안 붙음(`collector.test.ts:236` · `outage.test.ts:156`) |
| SC-4 | 하루 호출 ≈ 10,800회 · 상한 15,000 이하 · `api_usage` 에 KST 날짜별 기록 · 한도 초과 `020` 이면 run 중단 · 재시도로 두드리지 않음(다음 run 은 탐침 1건) | ✓ VERIFIED | 간격 5초/10초 → `cadence.ts plannedDailyLaps()` 5,400바퀴 × 2 = 10,800. `collector.test.ts:19` 가 07:00 ~ 20:00 호출 **정확히 10,800** · usage.add 합 10,800 · flush 10초 간격 단언. `config.ts` 예산 정수 1 ~ 15,000 강제(`DART_DAILY_BUDGET_LIMIT`), 배포 스크립트도 15,000 초과 거부. `apiUsage.ts` 카운터 `opendart_list`(KST 날짜 키) · 실패 호출도 센다. `020` → `HALT_BY_KIND.quota` → 바퀴 끝 `stopOnHalt` → 한도 의심 표시 + 종료 1, 이후 호출 0(`collector.test.ts:252`), 다음 실행은 공개매수 1쪽 탐침 1건(`:268/:278`). 예산 80% warn(`:350`) · 소진 종료 1(`:342`) |
| SC-5 | 텔레그램 전송 실패는 재시도하고, 끝내 못 보낸 건은 사유와 함께 로그에 남기며 다음 실행이 이어서 보낸다 | ✓ VERIFIED | `lap.ts deliverPending`: 실패 → pending 으로 되돌림 + 지수 재시도(5 · 10 · 20 … 60초) · 429 `retry_after` 대기 · 토큰/방 오류 60초 + 종류별 error 1번 · 120초 넘게 못 나간 건 error `alert unsent over 120s` · migrated → 새 방 id 로 즉시 재송신 · parse → 평문 재송신. 모든 실패 로그는 종류 · 코드 · 설명만(토큰 · URL 없음). 인계: `dart_alert_lease_acquire` 가 오늘 sending → pending 으로 되돌림(pgTAP R). `delivery.test.ts` 14건 통과. 한계: 예산 소진 · 탐침 실패로 끝나는 길에서는 송신 차례를 다시 안 불러 미송신 건이 다음 날 expired(WR-05) |
| SC-6 | 수집기가 죽거나 OpenDART 가 5분 넘게 실패하면(하루 한도 초과 포함) 운영자 이메일 + 단체방 「⚠ 공시 알림이 멈췄습니다」, 복구되면 「다시 동작」 1회 | ✓ VERIFIED (경고 있음) | `collector.ts` 장애 짝: 기준점에서 5분(`OUTAGE_AFTER_MS`) 넘게 성공 없으면 `dart_alert_outage open` → opened true 인 실행만 글 1건 → notice 기록 → error `dart outage opened`. 복구 바퀴에 close → notify 일 때만 「✅ 다시 동작」. 치명 종료(020 · 예산 · 키)도 종료 직전 같은 글(`outageOnFatal`). 시작 점검이 죽은 수집기를 덮는다. 이메일: `ops/alert-dart-alert-failure.yaml`(실행 실패) · `ops/alert-dart-alert-error-log.yaml`(`jsonPayload.level >= 50`). `outage.test.ts` 17건 통과. **경고:** CR-50 · WR-01 · WR-02 — 아래 「리뷰 처분 가중」 |
| SC-7 | 운영 중 첫 실제 공개매수 · 주요사항보고서 건에서 「DART 표기 시각 → 알림 도착」 지연을 기록해 장전 · 지분공시 · 주요사항보고서 유형으로 재확인 | ? UNCERTAIN | 아직 실제 알림 0건이라 기록할 지연 자체가 없다. 성격상 사람 확인 항목이다(검증 대상 아님) |

**Score:** 5/7 truths verified (1 present 하지만 behavior-unverified · 1 uncertain — 모두 실제 공시 · 시간이 필요)

### 잠긴 결정(D-01 ~ D-17) 대조 — 코드 확인

| 결정 | 결과 | 근거 |
|------|------|------|
| D-01 공개매수 유형 전부 · 이름으로 거르지 않음 | ✓ | `buildWatches` D004 `kinds: null` → `judgeRow` 가 시장 판정 뒤 곧장 send |
| D-02 보고서마다 1건 · 묶지 않음 · 무음 아님 | ✓ | 행마다 `sendPaced`; 본문에 `disable_notification` 없음(`telegram/client.ts`) |
| D-03 · D-04 유상증자 · 합병 허용 목록(설정값) | ✓ | `DEFAULT_B001_KINDS` 4종 + `DART_ALERT_B001_KINDS` env · 괄호 종류명 완전 일치 · 제외 종류 목록 · 근접 불일치 warn. 30일 실조사로 유상증자결정 203건 · 회사합병결정 68건 표기 일치(43-08-SUMMARY 주장) |
| D-05 코스피 · 코스닥만 | ✓ | `ALLOWED_CORP_CLS` Y · K + 종목코드 6자리 |
| D-06 ~ D-08 두 줄 · 본문 숫자 없음 · 링크 하나 | ✓ | `message.ts alertText`: 1줄 `📢 {늦은}{보고서명} — {회사}({코드}) · 제출인`, 2줄 `<a href=…rcpNo=…>DART 원문</a> · 금융감독원 전자공시` |
| D-09 웹앱 미노출 | ✓ | webapp · server 변경 없음(범위 밖 변경 0 · 43-08 게이트 주장) |
| D-10 · D-11 5초/10초 · 평일 07:00 ~ 20:00 · 휴장일 달력 없음 | ✓ | `cadence.ts` 상수 · `isInWindow` · 배포 Scheduler `*/5 7-19 * * 1-5` Asia/Seoul · `schedule.test.ts` 9건 |
| D-12 지난 날 안 쏟아냄 · 「(늦은 알림)」 | ✓ | 기준점 방식(마지막 성공 조회 · 없으면 07:02 · 60초 초과) — 「첫 조회에 이미 있던 건」 근사보다 정밀하게 구현(재량 범위) |
| D-13 30초 목표 | ⚠ | 설계상 5 ~ 15초지만 실측 없음(SC-7) |
| D-14 · D-15 단체방 1개 · 방 id 설정값 · 개인 대화 시험 먼저 | ✓ | `TELEGRAM_CHAT_ID` Secret · `test-send` 모드 · `scripts/telegram-find-chat.sh`. 개인 대화 → 단체방 도착은 사용자 답변으로 기록(주장) |
| D-16 · D-17 이메일 + 단체방 · 5분 · 한 번 · 복구 한 번 | ✓ (경고) | SC-6 참고 |

### Required Artifacts

| Artifact | 기대 | 상태 | 상세 |
|----------|------|------|------|
| `workers/dart-alert/src/collector.ts` (806줄) | 장기 실행 루프 · 임대 · 예산 · 탐침 · 장애 짝 | ✓ VERIFIED | 실질 구현 · `index.ts` 가 `runCollector` 로 결선 |
| `workers/dart-alert/src/lap.ts` (412줄) | 수집 · 송신 · 재시도 · 속도 제한 | ✓ VERIFIED | 실질 구현 · collector 가 `collectOnce` · `deliverPending` 호출 |
| `workers/dart-alert/src/watches.ts` · `message.ts` · `cadence.ts` · `config.ts` · `apiUsage.ts` | 판정 · 문구 · 시간 · 설정 · 카운터 | ✓ VERIFIED | 각각 테스트와 함께 결선 |
| `workers/dart-alert/src/dart/client.ts` · `telegram/client.ts` | OpenDART · 텔레그램 클라이언트 | ✓ VERIFIED | 상태 분류 · 쪽 넘김 · 키 · 토큰이 오류에 안 실림 |
| `workers/dart-alert/src/db.ts` | RPC 어댑터 | ✓ VERIFIED | 이름 · 인자 키 · 반환 키를 `dbContract.test.ts` 가 마이그레이션과 자동 대조 |
| `supabase/migrations/20261113200000_dart_alert.sql` | 표 2 · RPC 7 | ✓ VERIFIED | PK · ON CONFLICT · 임대 FOR SHARE · RLS 켬 · `PUBLIC` · `anon` · `authenticated` 권한 회수 · SECURITY INVOKER · search_path 고정 |
| `scripts/deploy-dart-alert.sh` · `setup-dart-alert-*.sh` · `smoke-dart-alert.sh` · `dart-alert-report.sh` · `telegram-find-chat.sh` | 배포 · 비밀 · 스모크 · 조사 | ✓ VERIFIED (경고 있음) | task-timeout 14h · retries 0 · parallelism 1 · 예산 상한 15,000 강제 · Scheduler 배열 · 알림 정책 update-or-create. WR-50 ~ 54 참고 |
| `ops/alert-dart-alert-failure.yaml` · `alert-dart-alert-error-log.yaml` | GCP 알림 정책 | ✓ VERIFIED | 필터가 워커 로그 모양(pino 숫자 level ≥ 50)과 맞음 |
| `CLAUDE.md` · `docs/stack.md` | OpenDART 운영 기준 | ✓ VERIFIED | 한도 20,000 · 예산 15,000 · 카운터 이름 · 주기 · 소비처 기재(`grep` 확인) |
| `.planning/.../43-UAT.md` | UAT 기록(43-08 이 「43-UAT 로 넘긴다」 고 적음) | ✗ MISSING | 파일이 없다. human_needed 경로에서 오케스트레이터가 만드는 것으로 본다 |

### Key Link Verification

| From | To | Via | 상태 | 상세 |
|------|----|-----|------|------|
| `index.ts buildDeps` | `runCollector` | `CollectorDeps`(supabase · dart · telegram · watches) | WIRED | 실제 어댑터 결선 · `createDartAlertDb` 한 곳만 RPC 호출 |
| `collector.lap` | `collectOnce` → `dart_alert_insert` | `db.insert` | WIRED | 새 행만 반환받아 `seen` 갱신 |
| `collector.deliver` | `dart_alert_claim` → `sendMessage` → `dart_alert_mark` | `deliverPending` | WIRED | 같은 바퀴 안 · 공개매수 우선 |
| `collector.openOutage/closeOutage` | `dart_alert_outage` + 단체방 글 | `sendNotice`(공시와 같은 pacer) | WIRED | notice · close notify 짝 |
| `countedList` | `api_usage` `opendart_list` | `UsageCounter` → `incr_api_usage` 10초 flush | WIRED | 실패 호출 포함 |
| Scheduler `gh-radar-dart-alert-wake` | Job `jobs:run` | 5분 깨움 · OAuth SA | WIRED(코드) | 배포 스크립트 · `schedule.test.ts` 정합. 원격 ENABLED 는 SUMMARY 주장 |
| 알림 정책 필터 | 워커 error 로그 | `jsonPayload.level >= 50` | WIRED | `dart outage opened` · `dart-alert failed` · `config error` 모두 level 50 이상 |

### Data-Flow Trace (Level 4)

| Artifact | 데이터 | 출처 | 실데이터 | 상태 |
|----------|--------|------|----------|------|
| `alertText` 입력 | 보고서명 · 회사 · 종목코드 · 제출인 · 접수번호 | OpenDART `list.json` 응답 → `dart_alerts` 행 → `claim` 반환 | 코드상 예 | ✓ FLOWING(코드) — 운영 DB 행 흐름은 미관측(SC-1) |
| `api_usage` | 호출 수 | `UsageCounter.add` ← `countedList` | 예 | ✓ FLOWING (운영 stats: 호출 수 14 → 16 증가 관찰은 SUMMARY 주장) |
| 장애 글 | 사유 · 시작 시각 | `stalledReason` · `lastOk` · DB `outage_since` | 예 | ✓ FLOWING |

### Behavioral Spot-Checks

| 동작 | 명령 | 결과 | 상태 |
|------|------|------|------|
| 워커 전체 단위 테스트 | `pnpm --filter @gh-radar/dart-alert exec vitest run --maxWorkers=2` | 15파일 · 306 통과 · 1.98초 | ✓ PASS |
| 타입 검사 | `pnpm --filter @gh-radar/dart-alert exec tsc --noEmit -p .` | 종료 0 | ✓ PASS |
| 하루 호출 10,800 | `collector.test.ts` 첫 테스트(가짜 시계 07:00 ~ 20:00) | 통과 | ✓ PASS |
| 020 → 중단 · 탐침 1건 | `collector.test.ts:252/268/278` | 통과 | ✓ PASS |
| 5분 장애 짝 글 | `outage.test.ts:35/57` | 통과 | ✓ PASS |
| pgTAP 173건 | (일회용 DB 필요 — 실행 금지 · 환경 없음) | — | ? SKIP — 오케스트레이터 주장 |
| 배포 이미지 = 코드 | `git merge-base --is-ancestor 3be96321 HEAD` · `git diff --stat 3be96321 HEAD -- workers/dart-alert scripts/deploy-dart-alert.sh 마이그레이션` | 조상 · 차이 0 · 작업 트리 변경 0 | ✓ PASS |

### Probe Execution

해당 없음 — 이 phase 는 `scripts/*/tests/probe-*.sh` 꼴 probe 를 선언하지 않았다(스모크 INV-1 의 `DART_ALERT_MODE=probe` 는 운영 호출이라 금지 · 실행하지 않음).

### Requirements Coverage

위 「요구사항 ID 대조」 참고 — REQUIREMENTS.md 매핑 없음. 로드맵 SC-1 ~ SC-7 기준 결과는 Observable Truths 표.

### Anti-Patterns Found

| 파일 | 줄 | 패턴 | 심각도 | 영향 |
|------|----|------|--------|------|
| 워커 소스 · 스크립트 · 마이그레이션 · ops | — | TBD · FIXME · XXX · TODO · HACK · PLACEHOLDER | — | 0건(디버트 마커 게이트 통과) |
| `workers/dart-alert/src/*` 로그 호출 | — | 원본 오류 객체를 그대로 로그 | — | 없음 — 모든 로그가 `safeErrorFields` · `telegramSafeFields` 를 거친다(WR-55 는 마지막 그물 테스트 빈칸) |
| `scripts/deploy-dart-alert.sh` | 459-463 | `--scheduler-paused` 가 기존 Scheduler 도 pause | ⚠️ Warning | CR-50 참고 |
| `scripts/smoke-dart-alert.sh` | 13-14 · 94-95 | PAUSED 를 통과로 봄 | ⚠️ Warning | CR-50 참고 |
| `collector.ts` | 451-459 | 넣기 실패를 삼키고 장애 판정 건너뜀 | ⚠️ Warning | WR-01 |

### 리뷰 처분 가중 (43-REVIEW.md: 치명 1 · 경고 12 · 참고 15 · 전부 open)

리뷰 28건을 그대로 옮기지 않고, 성공 기준을 실제로 깨는지로 가려 봤다. **깨는 것은 없다** — 아래는 SC 를 약하게 하는 순서다.

| ID | 영향받는 SC | 판정 | 이유 |
|----|-------------|------|------|
| **CR-50** | SC-6 · D-16 | ⚠️ 경고 — 사용자 결정 필요(가장 무겁다) | 코드로 확인: 장애 감시 경로 셋(실행 실패 정책 · error 로그 정책 · 다음 깨움의 단체방 글)은 모두 「실행이 하나라도 뜬다」 가 전제다. Scheduler 가 PAUSED · 삭제 · `run.invoker` 유실이면 실행 0 · 로그 0 · 메일 0 · 단체방 글 0 으로 조용히 끊긴다. 더구나 `deploy-dart-alert.sh` 459-463 의 `--scheduler-paused` 는 기존 Scheduler 까지 멈추고 스모크는 PAUSED 를 통과시킨다. SC-6 의 문구(「수집기가 죽거나 OpenDART 가 5분 넘게 실패」)는 정상 깨움 아래 수집기 죽음 · DART 실패를 덮으므로 FAILED 는 아니지만, D-16 이 막으려던 「조용한 끊김」 이 인프라 쪽에 남는다. 지금 상태는 배포 기록상 ENABLED(주장) |
| WR-01 | SC-6 · SC-5 | ⚠️ 경고 | 넣기 RPC 가 계속 실패하면(예: `rcept_dt` 누락 행 1건이 묶음 전체를 막음) warn 만 남고 장애 판정을 건너뛴다. 「무로그」 는 아니지만(warn 있음) 메일 · 단체방 글이 없다 |
| WR-02 | SC-6 | ⚠️ 경고 | notice 기록 RPC 실패 · 복구 글 송신 실패 같은 이중 장애에서 짝(「멈췄습니다」 ↔ 「다시 동작」)이 깨진다 |
| WR-05 | SC-5 | ⚠️ 경고 | 예산 소진 · 탐침 실패로 끝나는 길에서 이미 넣은 pending 건이 송신 기회 없이 다음 날 expired(info 로그만). 예산이 15,000 인데 설계 사용 10,800 이라 드문 경로 |
| WR-03 | SC-4 · 운영 기준 ④ | ⚠️ 경고 | HTTP 429 · 403 의 비 JSON 본문을 일시 장애로 분류해 차단 신호에도 계속 조회한다. 로드맵 SC-4 가 못박은 `020` 은 올바르게 처리되므로 문구 위반은 아님 |
| WR-04 | SC-2 | ⚠️ 경고 | axios `timeout` 은 연결 뒤 유휴만 재고 Supabase 호출엔 제한이 없어, 길게 멈추면 90초 임대 · 송신 기한 계산의 전제가 깨지고 드물게 같은 공시가 두 번 갈 수 있다. 「GCP 서울 엣지 주기 끊김」 이 실제 관측된 환경이라 낮지 않은 위험. 설계가 「최소 1회 · 드문 중복 수용」 이라 SC-2 문구(재시작 · 중복 실행 · 같은 응답)는 유지 |
| WR-50 ~ 54 | 배포 · 운영 스크립트 | ℹ️ 경고(범위 밖) | 이미 한 번 실행된 배포 · 스모크의 위생 문제(커밋 안 된 트리 빌드 · 스모크 DB 미점검 · 정책 중복 생성 · survey 안전장치). 현재 배포 이미지는 HEAD 조상이고 작업 트리 변경 0 이라 이번 배포의 이미지는 깨끗하다 |
| WR-55 · WR-56 | 테스트 | ℹ️ 경고 | 로거 마지막 그물 테스트 빈칸(실측으로 `err.response.config.params.crtfc_key` 가 출력됨)이지만 소스는 모든 로그를 안전 필드로 거쳐 지금 새는 경로는 없다. 진입점 예산 결선 단언 빈칸 |
| IN-* 15건 | — | ℹ️ 정보 | 목표에 영향 없음 |

## Human Verification Required

### 1. 첫 실제 알림의 모양 · 링크 · 지연 (SC-1 · SC-7)

**Test:** 운영에서 첫 실제 공개매수 / 유상증자 / 합병 공시 접수 뒤 단체방 글과 `bash scripts/dart-alert-report.sh stats 1` 을 본다.
**Expected:** 두 줄 · 원문 링크 열림 · 미리보기 카드 없음 · DART 표기 시각 → 도착 30초 안. 장전 · 지분공시 · 주요사항보고서 유형별 첫 건의 지연을 기록.
**Why human:** 실제 공시가 와야 한다. 운영 DB 의 넣기 · 차례 · 기록 경로가 아직 한 번도 행을 만지지 않았다.

### 2. 다음 평일 07:00 ~ 07:10 에 가짜 「멈췄습니다」 없음 (SC-6)

**Test:** 다음 평일 아침 단체방과 장애 상태를 본다.
**Expected:** 「⚠ 공시 알림이 멈췄습니다」 없음 · 「(늦은 알림)」 없음.
**Why human:** 시각이 지나야 한다. 지금은 가짜 시계 테스트만 있다.

### 3. 오늘 20:00 뒤 하루 호출 수 (SC-4)

**Test:** `bash scripts/dart-alert-report.sh stats 1`.
**Expected:** 호출 수 ≤ 15,000 · 한도 의심 0(오늘은 10:10 시작이라 10,800 보다 적음).
**Why human:** 하루가 끝나야 합이 나온다.

### 4. error 로그 메일 실제 도착 (SC-6)

**Test:** 의도하지 않은 error 로그가 생겼을 때 운영자 메일 도착을 확인한다(수동으로 만들지는 말 것).
**Expected:** `gh-radar-dart-alert-error-log` 메일 수신.
**Why human:** 아직 error 로그가 없어 정책 필터가 실제로 걸리는지 미확인.

### 5. 유무상증자결정 · 회사분할합병결정 표기 (D-03 · D-04)

**Test:** 첫 해당 공시의 `report_nm` 과 `b001 near-miss kind` warn 유무를 본다.
**Expected:** 허용 목록과 완전 일치로 알림이 나감. 다르면 알림이 조용히 빠지고 warn 만 남는다(메일 없음).
**Why human:** 30일 조사에서 0건이라 표기를 대조하지 못했다.

### 6. 리뷰 처분 · CR-50 수용 여부 (결정 요청)

**Test:** CR-50 을 phase 닫기 전에 고칠지, 수용하고 후속으로 넘길지 정한다. WR-01 · WR-02 · WR-05 도 함께.
**Expected:** `43-REVIEW-DISPOSITION.md` 에 fixed / deferred 로 처분이 남는다. 평일 운영 중 `--scheduler-paused` 재배포는 그 전까지 쓰지 않는다.
**Why human:** 위험 수용 · 범위 결정이다.

## Gaps Summary

실패한 must-have 는 없다(`gaps` 없음). 성공 기준 SC-2 ~ SC-6 은 코드 · 가짜 시계 테스트 306건 · 마이그레이션으로 확인했고, SC-1 은 실제 공시가 운영 DB 를 한 번도 지나가지 않아 behavior-unverified, SC-7 은 성격상 첫 실제 건이 와야 한다. 그래서 `passed` 가 아니라 `human_needed` 다. 리뷰 치명 CR-50 은 성공 기준 문구를 깨지는 않지만 D-16 의 「조용한 끊김 없음」 을 인프라 쪽에서 비워 둔 것이라 사용자의 수용 · 수정 결정을 요청한다. `43-VALIDATION.md` 는 의도대로 `status: draft` 이며 단체방 UAT 통과 뒤 서명한다. `43-UAT.md` 는 아직 없다.

---

_Verified: 2026-11-13_
_Verifier: Claude (gsd-verifier)_
