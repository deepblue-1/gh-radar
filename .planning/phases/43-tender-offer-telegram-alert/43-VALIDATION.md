---
phase: "43"
slug: "tender-offer-telegram-alert"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-12"
---

# Phase 43 — Validation Strategy

> 실행 중 되먹임 표본을 어떻게 뜰지 정한 phase 별 검증 계약. 근거는 `43-RESEARCH.md` 「Validation Architecture」 절.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4(워커 단위 · 가짜 시계) · pgTAP(일회용 Supabase Postgres 컨테이너 · 원격 DB 접촉 0) · bash `--self-test` |
| **Config file** | `workers/dart-alert/vitest.config.ts` — Wave 0 에서 생성(`workers/kis-news-sync` 복제 · maxWorkers 2) |
| **Quick run command** | `pnpm --filter @gh-radar/dart-alert exec vitest run --maxWorkers=2` |
| **Full suite command** | `pnpm --filter @gh-radar/dart-alert run typecheck && pnpm --filter @gh-radar/dart-alert exec vitest run --maxWorkers=2 && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dart_alert.test.sql && bash scripts/deploy-dart-alert.sh --self-test` — 끝의 `deploy-dart-alert.sh --self-test` 는 그 스크립트를 만드는 43-07 이 끝난 **Wave 3 부터** 붙인다. Wave 1 ~ 2 는 그 앞(typecheck · vitest · pgTAP)까지만 돈다 |
| **Estimated runtime** | 단위 약 20초 · 전체 약 120초(pgTAP 컨테이너 기동 포함) |

워커 · 패키지 이름(`dart-alert`)은 리서치 권고 이름이다. 플래너가 다른 이름을 고르면 이 문서의 명령도 같이 고친다.

---

## Sampling Rate

- **After every task commit:** 손댄 테스트 파일만 `pnpm --filter @gh-radar/dart-alert exec vitest run tests/<file> --maxWorkers=2`
- **After every plan wave:** Full suite command(Wave 1 ~ 2 는 `--self-test` 를 뺀 앞 세 단계 · Wave 3 부터 전체)
- **Before `/gsd-verify-work`:** Full suite green + 배포 뒤 스모크(`bash scripts/smoke-dart-alert.sh`) PASS + 텔레그램 도착 UAT
- **Max feedback latency:** 120초

---

## Per-Task Verification Map

플래너가 2026-11-12 PLAN 9개(43-01 ~ 43-09 · 43-09 는 체커 W4 로 43-01 에서 떼어 낸 웨이브 2 플랜)에 맞춰 Task ID · Plan · Wave 칸을 채웠다. 명령의 워커 · 패키지 이름은 `dart-alert` · `@gh-radar/dart-alert` 그대로다. 체커 W1 · W2 로 더한 동작은 이름 붙은 테스트를 `-t` 로 부르는 줄이 따로 있다. 2차 체커 수정(W5 · I5)으로 43-02-T3(DB 어댑터 ↔ 마이그레이션 계약 테스트) · 43-05-T2(창 밖 seed) 두 줄을 더했다 — 플랜 수 · 웨이브는 그대로다. 3차 체커 수정(W-2 · I-2)으로 문서 태스크를 43-07-T3 에서 43-09-T3 으로 옮겼고(웨이브 3 → 2 · 명령 그대로) · 43-05-T1 의 긴 바퀴 임대 연장 이름 붙은 테스트 한 줄을 더했다(파일 미존재 표시 행 28) — 플랜 수 · 웨이브 · 의존은 그대로다.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 43-01-T1 | 43-01 | 1 | 트레이서 · SC-1 · SC-2 · D-01 · D-02 · D-14 — 공개매수 1건이 DART 클라이언트 → 거르기 → DB 계약 → 두 줄 문구 → 텔레그램 클라이언트로 한 번만 · 재조회 · 재시작에도 다시 안 감 | — | 테스트 로그 출력에 키 · 토큰 표지 없음 | unit(가짜 전송 2 + 가짜 DB) | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/tracer.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 43-01-T2 | 43-01 | 1 | SC-2 · SC-5(DB) — 임대 · 같은 접수번호 1행 · 새 행만 반환 · 송신 차례 · 결과 기록 · 권한(절 L · I · C · M · P) · 보관 방침 주석 | — | 표 · RPC 서비스롤 전용 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dart_alert.test.sql` | ✅ | ✅ green |
| 43-09-T1 | 43-09 | 2 | D-01 · D-03 · D-04 · D-05 — 공개매수 유형은 이름 무관 통과 · 주요사항보고서는 괄호 종류명 허용 목록(정정 꼬리표 · 유무상증자결정 포함) · 제외 종류 거부 · 근접 불일치 warn · 코넥스/비상장 거부 | — | N/A | unit | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/watches.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 43-09-T2 | 43-09 | 2 | D-07 · D-08 · D-12 · D-15 · D-16 — 두 줄 문구 · HTML 이스케이프 · 「(늦은 알림)」 위치 · 제출인 생략 규칙 · 원문 링크 · 평문 · 장애 글 2종 · 시험 글 | — | N/A | unit | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/message.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 43-09-T3 | 43-09 | 2 | 공식 API 운영 기준 · D-10 · D-11 — CLAUDE.md · docs/stack.md 에 OpenDART 분류 · 한도 · 예산 · 카운터 · 소비처 · 주기(3차 수정 체커 W-2 — 43-07-T3 에서 옮김) | — | N/A | grep | `grep -q "opendart_list" CLAUDE.md && grep -q "Disclosure Data Sources" docs/stack.md` | ✅ | ✅ green |
| 43-02-T1 | 43-02 | 2 | SC-3 · SC-5 — 새 임대 보유자가 오늘 `sending` 되돌림 · 지난 날 `pending`/`sending` 닫기(절 R) | — | N/A | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dart_alert.test.sql` | ✅ | ✅ green |
| 43-02-T1 | 43-02 | 2 | SC-5 · 체커 W2(DB) — 차례 RPC 송신 기한 90초 · 같은 보유자의 기한 지난 `sending` 을 `stale` 로 재차례(`reclaimed_stale_claim` · attempts 2) · 기한 안 · 남이 잡은 행은 제외(절 R) | — | N/A | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dart_alert.test.sql` | ✅ | ✅ green |
| 43-02-T2 | 43-02 | 2 | D-16 · D-17 · SC-4 — 장애 열기 한 번 · notice · 닫기 notify 짝 · 운영 수치 · 새 RPC 권한(절 O · S · P) | — | 표 · RPC 서비스롤 전용 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dart_alert.test.sql` | ✅ | ✅ green |
| 43-02-T3 | 43-02 | 2 | 체커 W5 · SC-2 · SC-5 — DB 어댑터 `src/db.ts` 의 rpc 이름 · `p_*` 인자 키 · 반환 형 · 워커가 읽는 반환 jsonb 키 · `dart_alert_state` 읽기 칸이 마이그레이션 파일(`_dart_alert.sql`)의 시그니처 · 본문 · 표 정의와 같다 · 55000 → `LeaseLostError` · 파서 자기 점검(바꾼 인자 키는 mismatches ≥ 1) | — | DB 오류 메시지에 인자 값 · holder 없음 | unit(마이그레이션 파일 직접 대조) | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/dbContract.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 43-03-T1 | 43-03 | 2 | 설정 계약 — 필수 비밀 누락 시 이름만 담은 오류 · 예산 15,000 초과 거부 · 모드 · 방 id · 종류 목록 · 정정 스위치 검증 | — | 오류 메시지에 값 미포함 | unit | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/config.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 43-03-T1 | 43-03 | 2 | 비밀 비노출 — 인증키 · 봇 토큰 · 방 id · 요청 주소 · 쿼리 인자 · axios 설정이 로그 출력에 없음 | — | 로그 redact | unit | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/logger.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 43-03-T2 | 43-03 | 2 | D-10 · D-11 · D-12 · SC-4 — 간격 함수 경계값 · 하루 10,800회 · 15,000 이하 · 늦은 알림 기준점 | — | N/A | unit | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/cadence.test.ts --maxWorkers=2` | ✅ | ⚠️ flaky(부하 시 「주말 하루는 바퀴 0」 5초 기본 제한 초과 — 아래 게이트 결과) |
| 43-03-T2 | 43-03 | 2 | SC-4 — `api_usage` `opendart_list` 10초 묶음 · flush 실패 시 되돌림 · 80% 경고 · 한도 의심 표시 | — | N/A | unit | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/budget.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 43-04-T1 | 43-04 | 2 | SC-4 · 운영 기준 ④ — OpenDART 상태 코드 분류(`000` · `013` · `020` · 키 오류 · 버그 · HTTP 오류 · 깨진 JSON) · 100건 초과 쪽 넘김 | — | 인증키가 오류 · 로그에 실리지 않음 | unit | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/dartClient.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 43-04-T2 | 43-04 | 2 | SC-5 · 확인 7 — 텔레그램 응답 분류(`429` 대기 · 방 id 변경 · `401` · `403` · chat not found · 서식 오류 · 5xx · 네트워크) | — | 봇 토큰이 오류 · 로그에 실리지 않음 | unit | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/telegram.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 43-05-T1 | 43-05 | 3 | SC-1 ~ SC-4 · D-10 ~ D-13 — 가짜 시계 13시간 수집기: 임대 · 하루 10,800회 · 늦은 알림 판정 · 인계 이어 보내기 · `020` 중단 · 탐침 · 예산 · SIGTERM | — | N/A | unit(가짜 시계) | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/collector.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 43-05-T1 | 43-05 | 3 | 체커 I-2 · SC-2 — 긴 바퀴(DART 10초 × 2 · 송신 5건 × 10초 · 간격 초과)를 거듭해도 바퀴 시작 · 송신 직전 연장 점검으로 임대(TTL 90초)가 만료되지 않음 · `LeaseLostError` 0 · 연장 간격 90초 미만 · `lease_lost` 종료 없음 | — | N/A | unit(가짜 시계) | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/collector.test.ts -t "바퀴가 길어도 임대가 만료 전에 연장된다" --maxWorkers=2` | ✅ | ✅ green |
| 43-05-T2 | 43-05 | 3 | 배포 계약 · D-15 — 모드 probe · seed · test-send · 창 밖 · 진입점 설정 오류 · `seed_failed` · 빌드 | — | 설정 오류 로그에 env 이름만 | unit + build | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/modes.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/dart-alert run build` | ✅ | ✅ green |
| 43-05-T2 | 43-05 | 3 | 체커 W1 · D-12 — seed 뒤 같은 실행이 auto 로 이어 가고 seed 뒤 처음 보는 새 건에 「(늦은 알림)」 이 없다 · seed 된 건은 안 보냄 · `last_ok` 저장 | — | N/A | unit(가짜 시계) | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/modes.test.ts -t "seed 뒤 같은 실행이 auto 로 이어 가고 새 건은 늦은 알림이 아니다" --maxWorkers=2` | ✅ | ✅ green |
| 43-05-T2 | 43-05 | 3 | 체커 I5 · 43-08 실제 DB 경로 점검의 전제 — 창 밖(월 21:00) seed 는 seed 바퀴 1번(DART 감시 대상마다 1회 · `insert` seed 1회) 뒤 종료 0 `window_end` · 차례 0 · 송신 0 · 임대 해제 | — | N/A | unit(가짜 시계) | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/modes.test.ts -t "창 밖 seed 는 seed 바퀴 한 번 뒤 window_end 로 끝나고 보내지 않는다" --maxWorkers=2` | ✅ | ✅ green |
| 43-06-T1 | 43-06 | 4 | D-16 · D-17 · SC-6 — 5분 장애 판정 · 시작 점검 · 「멈췄습니다」 한 번 · 「다시 동작」 짝 · 치명 종료 전 장애 글 | — | N/A | unit(가짜 시계) | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/outage.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 43-06-T1 | 43-06 | 4 | 체커 W1 · D-16 · D-17 — 첫 배포 seed 경로(14:00 · `last_ok` 없음)는 시작 점검이 seed 바퀴 뒤라 장애 open 0 · 「멈췄습니다」 · 「다시 동작」 글 0 | — | N/A | unit(가짜 시계) | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/outage.test.ts -t "첫 배포 seed 경로는 멈췄습니다를 올리지 않는다" --maxWorkers=2` | ✅ | ✅ green |
| 43-06-T2 | 43-06 | 4 | SC-5 · D-02 · 확인 7 — 재시도 간격 · 429 대기(나머지 차례 행 보류) · 방 이동 재송신 · 평문 재송신 · 120초 미송신 error · 1초 간격 · 분당 18건 · 공개매수 먼저 | — | 실패 로그에 토큰 · 방 id 전체 없음 | unit(가짜 시계) | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/delivery.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 43-06-T2 | 43-06 | 4 | 체커 W2 · SC-5 — mark RPC 실패 건은 error `alert mark failed` 1번 · 같은 바퀴 다음 건 계속 · 90초 기한 뒤 `stale` 로 재차례 · 재송신 · warn `possible duplicate after stale claim` | — | 실패 로그에 토큰 · 방 id 없음 | unit(가짜 시계) | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/delivery.test.ts -t "mark 실패 건은 error 로그 뒤 90초 안에 다시 차례로 나온다" --maxWorkers=2` | ✅ | ✅ green |
| 43-06-T2 | 43-06 | 4 | 체커 W2 · SC-5 — claim 응답이 끊겨도(반영 뒤 예외) warn `alert claim failed` · 90초 뒤 재차례 · 송신 | — | N/A | unit(가짜 시계) | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/delivery.test.ts -t "claim 응답이 끊겨도 90초 뒤 다시 차례로 나온다" --maxWorkers=2` | ✅ | ✅ green |
| 43-07-T1 | 43-07 | 3 | D-11 — 배포 스크립트 Scheduler 배열을 1주 × 1440분으로 돌려 평일 창 안에서만 · 창 안 5분마다 깨움 | — | N/A | unit | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/schedule.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 43-07-T1 | 43-07 | 3 | 배포 계약 — Scheduler 배열 · `--task-timeout=14h` · `--max-retries=0` · 예산 env 1 ~ 15,000 · 알림 정책 파일 2 | — | N/A | bash | `bash scripts/deploy-dart-alert.sh --self-test` | ✅ | ✅ green |
| 43-07-T2 | 43-07 | 3 | D-15 — IAM · 비밀 등록 · 방 id 찾기 · 스모크 · 보고 스크립트 문법 · 실행 비트 · `--help` · 셸 추적 모드 없음 | — | 값 미출력 · 키/토큰 URL 을 명령줄에 안 넘김 | bash | `for f in scripts/setup-dart-alert-iam.sh scripts/setup-dart-alert-secrets.sh scripts/telegram-find-chat.sh scripts/smoke-dart-alert.sh scripts/dart-alert-report.sh; do bash -n "$f" && test -x "$f" \|\| exit 1; done && bash scripts/setup-dart-alert-secrets.sh --help` | ✅ | ✅ green |
| 43-08-T1 | 43-08 | 5 | D-09 · 배포 전 게이트 — 범위 밖 무변경 · 비밀 문자열 없음 · 워커 전체 회귀 · pgTAP · self-test | — | 저장소에 토큰 · 키 꼴 없음 | 묶음 | 43-08-PLAN.md Task 1 `<automated>`(PREDEPLOY-OK) | — | ✅ green |
| 43-08-T2 | 43-08 | 5 | [BLOCKING] 스키마 push(체커 O1 — push 대기 목록이 `20261113200000` 하나일 때만 · 다른 phase 파일이 섞이면 사용자 답 · push 뒤 새 Remote 줄 대조) · 세 비밀 ENABLED · 배포 스모크(probe · Job 설정 · Scheduler · 정책 2) · 실제 DB 경로 seed 1회(체커 W5 · 창 밖 배포) | — | 비밀은 사용자 `!` 비출력 스크립트 | manual(메인 세션) + 자동 확인 | 43-08-PLAN.md Task 2 `<automated>`(SCHEMA-PUSHED — `*_dart_alert.sql` 버전이 migration list 의 Local · Remote 두 칸에 다 있어야 종료 0 · 체커 W-1 · SECRETS-OK · SEED-PATH-OK) · `bash scripts/smoke-dart-alert.sh` | — | ⬜ pending |
| 43-08-T3 | 43-08 | 5 | SC-1 · SC-7 · D-13 — 단체방 UAT · 정상 아침 시작 · 하루 호출 수 · 첫 알림 지연 기록 | — | N/A | manual/UAT | `grep -q "status: validated" .planning/phases/43-tender-offer-telegram-alert/43-VALIDATION.md` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `workers/dart-alert/{package.json,tsconfig.json,vitest.config.ts}` — 43-01 T1(`workers/kis-news-sync` 복제 · 패키지 이름 `@gh-radar/dart-alert` · shared 의존 없음) · `Dockerfile` 은 43-07 T1
- [x] `workers/dart-alert/tests/fixtures/` — 43-01(`dart/list-d004-000.json`) · 43-09(`dart/list-b001-000.json`) · 43-04(`dart/list-013 · list-020 · list-010 · list-total-150-p1 · list-total-150-p2` · `telegram/ok · 429 · 400-migrate · 400-parse · 400-chat-not-found · 401 · 403`)
  - fixture 의 보고서명은 인증키 등록 뒤 실제 표기로 한 번 맞춘다(43-08 T2 의 survey 결과 — 그 전엔 문서 · 공개 사례 표기)
- [x] `workers/dart-alert/tests/helpers/fakes.ts` — 43-05 T1(가짜 시계 · 가짜 DB(43-02 `DartAlertDb` 타입 구현) · 가짜 DART · 가짜 텔레그램 — 43-06 재사용)
- [x] `workers/dart-alert/tests/dbContract.test.ts` — 43-02 T3(어댑터 ↔ 마이그레이션 파일 자동 대조 · 가짜 supabase 클라이언트는 테스트 안에)
- [x] `supabase/tests/dart_alert.test.sql` — pgTAP(43-01 T2 절 L · I · C · M · P · 43-02 절 R(송신 기한 포함) · O · S)
- [x] 프레임워크 설치 불필요(기존 vitest · pgTAP 러너)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 실제 텔레그램 도착(운영자 개인 대화 → 단체방) | SC-1 · D-15 | 실제 봇 · 실제 방이 있어야 하고 사람이 폰으로 본다 | 시험 송신 모드로 Job 1회 실행 → 개인 대화 도착 확인 → 방 id 를 단체방으로 바꾼 뒤 다시 확인 |
| 실제 인증키로 조회 1바퀴 | SC-1 · SC-4 | 실키가 필요(로컬 · CI 에 없음) | 배포 뒤 `bash scripts/smoke-dart-alert.sh` 가 「probe ok」 |
| 원격 DB 경로 1회(임대 · 넣기 · 상태 읽기 · 해제) | SC-2 · 체커 W5 | 원격 권한 · 함수 찾기 · 서비스롤 키 · 망은 로컬 테스트로 볼 수 없다(인자 이름 대조는 43-02-T3 자동) | 창 밖 배포 직후 43-08 T2 6-b 의 seed 실행 1회 → `seed done` · `dart-alert-report.sh stats 1` 임대 보유자 비어 있음(평일 새벽 배포면 건너뛰고 첫 `07:00` 실행 뒤 확인) |
| 첫 실제 공개매수 · 첫 주요사항보고서의 「DART 표기 시각 → 알림 도착」 지연 기록 | SC-7 · 확인 6 | 실제 공시가 나와야 잴 수 있다 | RESEARCH 「확인 6」 의 SQL 결과와 DART 사이트 표기 시각 대조 → 이 문서에 기록 |
| 한 달 치 실제 보고서명 표기 · 하루 알림 건수 · 100건 넘는 날 수 | 확인 1 · 3 · 5 | 인증키 등록 뒤에만 가능 | RESEARCH 「확인 1」 탐침 / 보고 스크립트의 조사 모드 1회 |
| 이메일 장애 알림 정책이 만들어졌는지 | SC-6 · D-16 | GCP 콘솔 · gcloud 조회 | `gcloud alpha monitoring policies list --filter='displayName~dart-alert'` |

---

## 배포 전 게이트 결과 (43-08 Task 1 · 2026-11-13 · 레인 `phase-43` · 원격 접촉 0)

| 게이트 | 명령 | 결과 |
|--------|------|------|
| 이 phase 커밋 수(fail-closed) | `git log -F --grep='(43-' 7d2a2c80..HEAD` | git 종료 0 · 41개(8 이상) ✅ |
| 범위 밖 무변경(D-09) | 같은 커밋들의 `--name-only` 에서 `^(webapp\|server\|relay\|packages)/` | 일치 0 ✅ · 레인 전체 `git diff --name-only 01152a0a..HEAD` 로도 0 |
| 레인 diff 의 그 밖 경로 | `git diff --stat 01152a0a..HEAD` | 72 파일 — `workers/dart-alert/**` · 이 phase 문서 · `scripts/*dart*` · `scripts/telegram-find-chat.sh` · `ops/alert-dart-alert-*.yaml` · 마이그레이션 · pgTAP · `CLAUDE.md` · `docs/stack.md`(43-09 OpenDART 분류) · `pnpm-lock.yaml`(`workers/dart-alert` importer 추가만) · `.planning/{STATE.md,state.json,ROADMAP.md}`(오케스트레이터) — 예상 밖 경로 없음 ✅ |
| 봇 토큰 꼴 | `git grep -qE '[0-9]{8,10}:[A-Za-z0-9_-]{35}'`(플랜 경로 + `scripts/*dart*` · `ops/*dart*` · 마이그레이션 · pgTAP) | 종료 1(일치 없음) ✅ |
| 40자 키 꼴 | `git grep -qE '[0-9a-f]{40}'`(플랜 경로 + `scripts/*dart*` · `ops/*dart*` · `scripts/telegram-find-chat.sh`) | 종료 1(일치 없음) ✅ |
| 워커 전체 회귀 | `pnpm --filter @gh-radar/dart-alert exec vitest run --maxWorkers=2` | 3번 돌림. ① 단독: Test Files 15 passed (15) · Tests 306 passed (306) · 3.25초 ✅ (43-02 계약 테스트 `dbContract.test.ts` 8 포함) ② 플랜 `<automated>` 묶음 1차(다른 프로세스가 CPU 480% · 부하 평균 22): 1 failed · 305 passed — `tests/cadence.test.ts` 「주말 하루는 바퀴 0」 `Test timed out in 5000ms`(6,293ms · 단독일 때 1,487ms) ❌ ③ 묶음 2차(부하 평균 20): 306 passed · 그 테스트 4,090ms · **PREDEPLOY-OK** ✅. 원인: 그 테스트가 이틀을 1초 단위로 172,800번 `expect` 하는 CPU 전용 반복이라 기계가 바쁘면 vitest 기본 제한 5초에 걸린다 — 로직 실패가 아니다. 이 게이트에서는 고치지 않았다(레인 규칙 — 테스트 수정은 오케스트레이터 결정 · 후속 quick 후보: 걸음을 60초로 넓히거나 그 `it` 에 제한 시간 인자) |
| 이름 붙은 테스트 6줄(`-t`) | 위 지도의 `-t` 이름 6개를 한 번에 | 4 파일 · 6 passed ✅ |
| typecheck | `pnpm --filter @gh-radar/dart-alert run typecheck` | 종료 0 ✅ (`src` 만 — 테스트 파일은 대상 아님, 43-05 SUMMARY 참고) |
| build | `pnpm --filter @gh-radar/dart-alert run build` | 종료 0 ✅ |
| pgTAP(로컬 일회용 Postgres) | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dart_alert.test.sql` | 마이그레이션 138개 재생 · `1..173` · ok 173 · not ok 0 · `# RESULT: PASS` ✅ · 컨테이너 남지 않음 |
| 배포 self-test(GCP 접촉 0) | `bash scripts/deploy-dart-alert.sh --self-test` | `SELF-TEST OK — schedulers=1 (gh-radar-dart-alert-wake\|*/5 7-19 * * 1-5) · task-timeout=14h · max-retries=0 · parallelism=1 · DART_ALERT_DAILY_BUDGET=15000 (15001 거부) · alert policies=2` ✅ |
| 사용자 스크립트 문법 · 실행 비트 · `--help` | 43-07-T2 지도 명령 | 다섯 개 모두 `bash -n` · 실행 비트 통과 · `setup-dart-alert-secrets.sh --help` 종료 0 ✅ |
| 문서 분류 | 43-09-T3 지도 명령 | 통과 ✅ |

배포 전 게이트에서 볼 수 없는 것(원격 스키마 · 실제 봇 · 실제 OpenDART · Cloud Logging 정책 일치)은 43-08 Task 2 · 3 과 위 Manual-Only 표가 맡는다.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
