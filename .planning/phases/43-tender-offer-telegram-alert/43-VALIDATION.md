---
phase: "43"
slug: "tender-offer-telegram-alert"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| **Full suite command** | `pnpm --filter @gh-radar/dart-alert run typecheck && pnpm --filter @gh-radar/dart-alert exec vitest run --maxWorkers=2 && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dart_alert.test.sql && bash scripts/deploy-dart-alert.sh --self-test` |
| **Estimated runtime** | 단위 약 20초 · 전체 약 120초(pgTAP 컨테이너 기동 포함) |

워커 · 패키지 이름(`dart-alert`)은 리서치 권고 이름이다. 플래너가 다른 이름을 고르면 이 문서의 명령도 같이 고친다.

---

## Sampling Rate

- **After every task commit:** 손댄 테스트 파일만 `pnpm --filter @gh-radar/dart-alert exec vitest run tests/<file> --maxWorkers=2`
- **After every plan wave:** Full suite command
- **Before `/gsd-verify-work`:** Full suite green + 배포 뒤 스모크(`bash scripts/smoke-dart-alert.sh`) PASS + 텔레그램 도착 UAT
- **Max feedback latency:** 120초

---

## Per-Task Verification Map

플래너가 PLAN 을 쓴 뒤 Task ID · Plan · Wave 칸을 채운다. 아래는 리서치가 정한 「무엇을 어떤 테스트로 확인하나」 표다.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | D-01 · D-04 · D-05 — 공개매수 유형은 이름 무관 통과 · 주요사항보고서는 허용 목록(정정 꼬리표 · 유무상증자결정 포함) · 제외 종류 거부 · 코넥스/비상장 거부 | — | N/A | unit | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/watches.test.ts --maxWorkers=2` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | D-07 · D-08 — 두 줄 문구 · HTML 이스케이프 · 「(늦은 알림)」 위치 · 제출인 생략 규칙 · 원문 링크 · 장애 글 2종 | — | N/A | unit | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/message.test.ts --maxWorkers=2` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | D-10 · D-11 · SC-4 — 간격 함수 경계값 · 하루 10,800회 · 15,000 이하 | — | N/A | unit | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/cadence.test.ts --maxWorkers=2` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | D-11 — 배포 스크립트 Scheduler 배열을 1주 × 1440분으로 돌려 평일 창 안에서만 깨움 | — | N/A | unit | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/schedule.test.ts --maxWorkers=2` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SC-4 · 운영 기준 ④ — OpenDART 상태 코드 분류(`000` · `013` · `020` · 키 오류 · HTTP 오류 · 깨진 JSON) · 100건 초과 쪽 넘김 | — | 인증키가 오류 · 로그에 실리지 않음 | unit | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/dartClient.test.ts --maxWorkers=2` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SC-5 · 확인 7 — 텔레그램 응답 분류(`429` 대기 · 방 id 변경 · `401` · `403` · 서식 오류 · 5xx · 네트워크) | — | 봇 토큰이 오류 · 로그에 실리지 않음 | unit | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/telegram.test.ts --maxWorkers=2` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SC-1 ~ SC-6 · D-12 · D-16 · D-17 — 가짜 시계 수집기: 임대 · 하루 호출 수 · 늦은 알림 판정 · 장애 글 짝 · `020` 중단 · seed 모드 · 재시도 · SIGTERM | — | N/A | unit(가짜 시계) | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/collector.test.ts --maxWorkers=2` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | 비밀 비노출 — 인증키 · 봇 토큰 · 요청 주소가 로그 출력에 없음 | — | 로그 redact | unit | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/logger.test.ts --maxWorkers=2` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | 설정 계약 — 필수 비밀 누락 시 이름만 담은 오류 · 예산 15,000 초과 거부 · 모드 값 검증 | — | 오류 메시지에 값 미포함 | unit | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/config.test.ts --maxWorkers=2` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SC-2 · SC-5(DB) — 같은 접수번호 1행 · 송신 권리 1회 · 임대 인계 시 이어 보냄 · 지난 날짜 건 닫기 · 장애 열기/닫기 1회 · anon/authenticated 접근 거부 | — | 표 · RPC 서비스롤 전용 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dart_alert.test.sql` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | 배포 계약 — Scheduler 배열 · `--task-timeout=14h` · `--max-retries=0` · 예산 env · 알림 정책 파일 | — | N/A | bash | `bash scripts/deploy-dart-alert.sh --self-test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `workers/dart-alert/{package.json,tsconfig.json,vitest.config.ts,Dockerfile}` — `workers/kis-news-sync` 복제 · 패키지 이름 `@gh-radar/dart-alert`
- [ ] `workers/dart-alert/tests/fixtures/` — OpenDART 응답(공개매수 · 주요사항보고서 · `013` · `020` · 키 오류 · 100건 초과 2쪽) · 텔레그램 응답(정상 · `429` · 방 id 변경 · `401` · `403` · 서식 오류)
  - fixture 의 보고서명은 인증키 등록 뒤 실제 표기로 한 번 맞춘다(그 전엔 문서 · 공개 사례 표기)
- [ ] `supabase/tests/dart_alert.test.sql` — pgTAP(`supabase/tests/kis_news_collector.test.sql` 꼴)
- [ ] 프레임워크 설치 불필요(기존 vitest · pgTAP 러너)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 실제 텔레그램 도착(운영자 개인 대화 → 단체방) | SC-1 · D-15 | 실제 봇 · 실제 방이 있어야 하고 사람이 폰으로 본다 | 시험 송신 모드로 Job 1회 실행 → 개인 대화 도착 확인 → 방 id 를 단체방으로 바꾼 뒤 다시 확인 |
| 실제 인증키로 조회 1바퀴 | SC-1 · SC-4 | 실키가 필요(로컬 · CI 에 없음) | 배포 뒤 `bash scripts/smoke-dart-alert.sh` 가 「probe ok」 |
| 첫 실제 공개매수 · 첫 주요사항보고서의 「DART 표기 시각 → 알림 도착」 지연 기록 | SC-7 · 확인 6 | 실제 공시가 나와야 잴 수 있다 | RESEARCH 「확인 6」 의 SQL 결과와 DART 사이트 표기 시각 대조 → 이 문서에 기록 |
| 한 달 치 실제 보고서명 표기 · 하루 알림 건수 · 100건 넘는 날 수 | 확인 1 · 3 · 5 | 인증키 등록 뒤에만 가능 | RESEARCH 「확인 1」 탐침 / 보고 스크립트의 조사 모드 1회 |
| 이메일 장애 알림 정책이 만들어졌는지 | SC-6 · D-16 | GCP 콘솔 · gcloud 조회 | `gcloud alpha monitoring policies list --filter='displayName~dart-alert'` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
