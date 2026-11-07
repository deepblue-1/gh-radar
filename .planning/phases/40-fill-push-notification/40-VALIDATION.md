---
phase: "40"
slug: "fill-push-notification"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
# 40-12 Task 1 이 자동 부분을 채웠다. status: validated 는 Task 3 실기기 UAT 통과 뒤에만 올린다.
status: draft
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-06"
filled: "2026-11-07"
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x(shared · relay · server · webapp) · pgTAP(로컬 일회용 Postgres 컨테이너 `public.ecr.aws/supabase/postgres:17.6.1.104` — 마이그레이션 전부 재생 뒤 테스트 1파일) · 셸 스크립트 검사(위생 · IPA/APK · deploy-relay self-test) |
| **Config file** | `relay/vitest.config.ts`(maxWorkers 2) · `relay/tsconfig.tests.json` · server · webapp · shared 기존 vitest 설정 · pgTAP 러너 `scripts/verify-dma-orders-price-check.sh --test <file>` |
| **Quick run command** | `pnpm --filter @gh-radar/relay exec vitest run tests/push-notifier.test.ts --maxWorkers=2`(패키지별 단일 파일) · DB 는 `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_push_claim.test.sql` |
| **Full suite command** | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run tests/routes --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/push src/lib/native src/components/me src/lib/__tests__/use-trading-alerts.test.tsx src/components/trading --maxWorkers=2` + pgTAP 3파일(`dma_push_devices` · `dma_push_claim` · `dma_journal_apply`) + `bash mobile/scripts/check-release-hygiene.sh` + `bash scripts/deploy-relay.sh --self-test` |
| **Estimated runtime** | ~160 초(40-12 Task 1 실측 — vitest · typecheck 합 119초 · pgTAP 3파일 33초 · 스크립트 수 초) |

---

## Sampling Rate

- **After every task commit:** 그 패키지의 단일 파일 vitest(`--maxWorkers=2`) 또는 pgTAP 1파일 — 각 플랜 `<verify>` 의 명령(아래 표).
- **After every plan wave:** 위 Full suite 의 vitest · typecheck 부분 + pgTAP `dma_push_claim` · `dma_journal_apply`(무변경 회귀).
- **Before `/gsd-verify-work`:** Full suite green + 위생 OK + self-test OK + 실기기 UAT(Manual-Only 표).
- **Max feedback latency:** 단일 파일 ≤ 15초(vitest 1파일 · pgTAP 1파일 실측 11~12초).

---

## Per-Task Verification Map

보안 검사는 사용자 결정으로 생략(`security_enforcement: false`) — Threat Ref 는 「—」. 계좌번호 · 토큰 비노출(T-19-14 동형)은 기능 요구로 테스트가 잠근다(Secure Behavior 칸).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 40-01-01 | 01 | 1 | SC-2 · SC-4 | — | 표 4개 RLS · 정책 0 · RPC EXECUTE (anon, authenticated, service_role) = (f, f, t) · 목록 원소에 token 없음 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_push_devices.test.sql` | ✅ | ✅ green |
| 40-01-02 | 01 | 1 | SC-2 · SC-3 · SC-4 | — | 남의 기기 끄기 · 지우기 불가 · 토큰 인계 · 결과 보고는 토큰 일치 때만 삭제 | pgTAP | 위와 같음(48단언) | ✅ | ✅ green |
| 40-02-01 | 02 | 1 | SC-1 · SC-4 | — | 문안에 계좌번호 없음 | unit | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run src/__tests__/push-message.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/shared run typecheck` | ✅ | ✅ green |
| 40-02-02 | 02 | 1 | SC-1 · SC-4 | — | 거부 · 취소 · 자동매도 문안에도 계좌번호 없음 | unit | 위와 같음(골든 7종 · 42건) | ✅ | ✅ green |
| 40-03-01 | 03 | 1 | SC-1 · SC-5 | — | iOS 패키지에 Firebase 0 | build + grep | `pnpm --filter @gh-radar/mobile run native:sync && pnpm --filter @gh-radar/mobile run native:verify-prod && grep -q push-notifications mobile/ios/App/CapApp-SPM/Package.swift && ! grep -qi firebase mobile/ios/App/CapApp-SPM/Package.swift` | ✅ | ✅ green(40-03 실행 때) |
| 40-03-02 | 03 | 1 | SC-1 | — | 「설정 열기」 는 화이트리스트 · 메인 프레임 출처 검사 통과분만 | unit + build | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/native/__tests__/post-native.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && (cd mobile/android && ./gradlew -q :app:compileDebugKotlin) && pnpm --filter @gh-radar/mobile run native:build:ios` | ✅ | ✅ green(vitest 는 40-12 재확인) |
| 40-04-01 | 04 | 1 | SC-1 · SC-5 | — | APNs .p8 · google-services.json 은 저장소 밖 700/600 | manual(사용자 콘솔) + file | `test "$(ls ~/.config/gh-trade/push/AuthKey_*.p8 \| wc -l)" = 1 && test -f ~/.config/gh-trade/push/google-services.json` | ✅ | ✅ green(40-04) |
| 40-04-02 | 04 | 1 | SC-5 | — | 값 비출력 모양 검사(GSJ-OK · PREREQ-OK) | script | 40-04-PLAN Task 2 `<automated>`(node 모양 검사) | ✅ | ✅ green(40-04) |
| 40-05-01 | 05 | 2 | SC-1 · SC-2 | — | 판정 RPC 서비스롤 전용 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_push_claim.test.sql` | ✅ | ✅ green |
| 40-05-02 | 05 | 2 | SC-1 · SC-2 · SC-3 | — | 정정 체인 · 거부 · 취소 · 당일 밖(stale) · deferred | pgTAP | 위와 같음 | ✅ | ✅ green |
| 40-05-03 | 05 | 2 | SC-1 · SC-4 | — | 수신자 · 플랫폼 · 토글 거름 · 계좌 범위 · 권한 회귀 | pgTAP | 위 + `dma_push_devices` + `dma_journal_apply`(90 · 48 · 무변경 회귀) | ✅ | ✅ green |
| 40-06-01 | 06 | 2 | SC-1 · SC-2 · SC-4 | — | 수신자 = `userIdsOf`(볼 수 있는 사용자만) · 로그에 토큰 · 계좌 · 사용자 id 없음 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/push-notifier.test.ts tests/app-access.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests` | ✅ | ✅ green |
| 40-06-02 | 06 | 2 | SC-3 | — | 리스너는 fanout 뒤 · 예외가 writer/fanout 으로 번지지 않음 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/config-push.test.ts tests/account-state.test.ts tests/push-notifier.test.ts tests/pipelines.test.ts --maxWorkers=2` + typecheck 2종 | ✅ | ✅ green |
| 40-06-03 | 06 | 2 | SC-2 · SC-3 | — | 재기동 재생 송신 0 · 429 중단 · 예외 격리 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/push-notifier.test.ts tests/journal-writer.test.ts tests/fanout.test.ts --maxWorkers=2` + typecheck 2종 | ✅ | ✅ green |
| 40-07-01 | 07 | 2 | SC-1 · SC-4 | — | requireAuth · `req.userId` 만 RPC 로 | unit(route) | `pnpm --filter @gh-radar/server exec vitest run tests/routes/push-devices.test.ts --maxWorkers=2` + server typecheck | ✅ | ✅ green |
| 40-07-02 | 07 | 2 | SC-4 | — | 남의 기기 404 · 미인증 401 · 입력 400 | unit(route) | `pnpm --filter @gh-radar/server exec vitest run tests/routes/push-devices.test.ts tests/routes/strategy-events.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 40-08-01 | 08 | 2 | SC-5 | — | google-services.json 추적 허용 · SA 키 차단 유지 | build | 40-08-PLAN Task 1 `<automated>`(assembleDebug → aapt2 `google_app_id`) | ✅ | ✅ green(40-08 실행 때) |
| 40-08-02 | 08 | 2 | SC-5 | — | 위생 (2)(3)(8) 반전 · (11) iOS Firebase 0 | script | `bash mobile/scripts/check-release-hygiene.sh` | ✅ | ✅ green |
| 40-08-03 | 08 | 2 | SC-1 | — | POST_NOTIFICATIONS · 기본 채널 `fills` | build | 40-08-PLAN Task 3 `<automated>`(assembleDebug → aapt2 Manifest) | ✅ | ✅ green(40-08 실행 때) |
| 40-09-01 | 09 | 3 | SC-1 · SC-3 | — | APNs 키는 env(Secret) 로만 · JWT 50분 재사용 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/push-apns.test.ts tests/config-push.test.ts tests/push-notifier.test.ts --maxWorkers=2` + typecheck 2종 | ✅ | ✅ green |
| 40-09-02 | 09 | 3 | SC-3 | — | 404/UNREGISTERED 만 삭제 · 400 은 삭제 안 함 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/push-fcm.test.ts tests/push-apns.test.ts tests/config-push.test.ts tests/push-notifier.test.ts --maxWorkers=2` + typecheck 2종 | ✅ | ✅ green |
| 40-09-03 | 09 | 3 | SC-3 | — | 비밀 주입 비출력(`set -x` 없음) · logger redact | script | `bash -n scripts/deploy-relay.sh && bash -n scripts/setup-relay-iam.sh && bash -n scripts/setup-push-secrets.sh && bash scripts/deploy-relay.sh --self-test` | ✅ | ✅ green(self-test 12) |
| 40-10-01 | 10 | 3 | SC-1 · SC-4 | — | 권한은 스위치 켤 때 처음 · 새 기기 꺼짐 | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/components/me/__tests__/push-devices-card.test.tsx --maxWorkers=2` + webapp typecheck | ✅ | ✅ green |
| 40-10-02 | 10 | 3 | SC-4 | — | 끄기 · 지우기 확인 · 거부 안내 | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/components/me src/components/trading/__tests__/me-client.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 40-10-03 | 10 | 3 | SC-4 | — | 로그아웃 전 이 기기 등록 해제(D-15) | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/push src/components/me src/components/layout --maxWorkers=2` | ✅ | ✅ green |
| 40-11-01 | 11 | 4 | SC-1 | — | `data.path` 는 주문로그 경로만 허용 · 계좌는 볼 수 있는 오늘 주문에서만 해석 | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/push/__tests__/push-tap.test.ts src/lib/native/__tests__/native-bridge-provider.test.tsx --maxWorkers=2` + webapp typecheck | ✅ | ✅ green |
| 40-11-02 | 11 | 4 | SC-1(D-20) | — | 모르면 보인다(숨김은 넷 다 참일 때만) | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/use-trading-alerts.test.tsx src/lib/__tests__/trading-alerts.test.ts src/components/trading/__tests__/alert-toasts.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 40-11-03 | 11 | 4 | SC-1(D-13 · D-15) | — | 시작 갱신은 권한을 묻지 않음 · 세션당 1회 | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/push src/lib/native --maxWorkers=2` | ✅ | ✅ green |
| 40-12-01 | 12 | 5 | SC-1~SC-5 | — | 주문 · 판정 경로 diff 0 · 적용 RPC 재정의 0 | gate script | 40-12-PLAN Task 1 `<automated>`(→ PREDEPLOY-OK) | ✅ | ✅ green |
| 40-12-02 | 12 | 5 | SC-2 · SC-5 | — | 배포 순서 DB → 비밀 · IAM → relay → webapp → 앱 · 비밀은 사용자 `!` | checkpoint + script | `supabase migration list --linked` · `git fetch origin master && test "$(git rev-parse master)" = "$(git rev-parse origin/master)"` | — | ⬜ pending(메인 세션) |
| 40-12-03 | 12 | 5 | SC-1 · SC-4 · SC-5 | — | 본문 계좌번호 없음 · 다른 사용자 계좌 0건 | manual(실기기) | `grep -q "status: validated" .planning/phases/40-fill-push-notification/40-VALIDATION.md` | — | ⬜ pending(UAT) |
| 40-13-01 | 13 | 1 | SC-1 · SC-5 | — | aps-environment 엔타이틀먼트 · Debug/Release 두 구성 | build + plist | 40-13-PLAN Task 1 `<automated>`(plutil · pbxproj · 시뮬레이터 빌드 엔타이틀먼트) | ✅ | ✅ green(40-13 실행 때) |
| 40-13-02 | 13 | 1 | SC-5 | — | IPA aps-environment production · iOS Firebase 0 | script | `grep -q aps-environment mobile/scripts/check-ipa.sh && grep -q GHTRADE_FORCE_PROFILE mobile/ios/App/fastlane/Fastfile && bash -n mobile/scripts/check-ipa.sh && bash mobile/scripts/check-release-hygiene.sh` | ✅ | ✅ green(실 IPA CHECK OK 는 40-12 릴리스) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

「green(40-NN 실행 때)」 = 네이티브 빌드(gradle · xcodebuild · cap sync)라 40-12 회귀에서 다시 돌리지 않은 행 — 그 플랜 SUMMARY 에 통과 기록이 있다.

---

## Wave 0 Requirements

RESEARCH §Validation Architecture 「Wave 0 Gaps」 7개 → 실제 파일:

- [x] `supabase/tests/dma_push_claim.test.sql` — SC-1 · 2 · 4 판정 · 멱등 · 체인 · 당일 · deferred · 토큰 UNIQUE · 권한(40-05 · 90단언)
- [x] `supabase/tests/dma_push_devices.test.sql` — 기기 RPC · 소유권 · 토큰 인계 · 결과 보고 · 권한(40-01 · 48단언 — RESEARCH 표 밖 추가분)
- [x] `packages/shared/src/__tests__/push-message.test.ts` — 문안 골든 7종(40-02)
- [x] `relay/tests/push-notifier.test.ts` — 큐 · 정착 · 단일 비행 · deferred 재호출 · 수신자 · 예외 격리 · 재기동 재생(40-06) · 결선은 `relay/tests/config-push.test.ts`
- [x] `relay/tests/push-apns.test.ts` · `relay/tests/push-fcm.test.ts` — 응답 분류 · JWT 주기 · 토큰 캐시(40-09)
- [x] `server/tests/routes/push-devices.test.ts` — RESEARCH 의 `server/src/routes/__tests__/push-devices.route.test.ts` 자리(저장소 관례 `server/tests/routes/` 로 감, 40-07)
- [x] `webapp/src/lib/push/__tests__/{native-push,device-key,push-tap,push-session}.test.ts` + `webapp/src/components/me/__tests__/push-devices-card.test.tsx` + `webapp/src/lib/__tests__/use-trading-alerts.test.tsx`(D-20 숨김) — 네이티브 래퍼 · 탭 처리 · 숨김 조건(40-10 · 40-11)
- 프레임워크 설치: 없음(전부 기존).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 장중 실제 체결 → 3초 안 배너 · 3조각 → 「체결」 1 + 「전량 체결」 1 · 본문 계좌번호 없음 | SC-1 · SC-4 | 실기기 · APNs/FCM 망 · OS 표시 의존 | 40-12 Task 3 항목 2 — iOS · Android 각 1대 |
| 배너 탭 → 주문로그(그 종목 · 오늘 · 그 계좌) | SC-1 | OS 알림 탭 → 앱 재기동 경로 | 40-12 Task 3 항목 3 |
| 앱 앞에서도 배너(D-19) · 작업대 주문 토스트 없음 · 돌파 토스트 있음(D-20) | SC-1 | 포그라운드 presentationOptions 는 OS 동작 | 40-12 Task 3 항목 4 |
| 스위치 끔 → 0건 · 다른 사용자 계좌 체결 0건 | SC-4 | 실제 계정 · 기기 조합 | 40-12 Task 3 항목 5 |
| PC `/me` 카드 두 기기 목록 · 끄기 · 지우기 · 앱 로그아웃 뒤 사라짐(D-15) | SC-4 | 앱 ↔ 웹 교차 | 40-12 Task 3 항목 6 · 7 |
| 권한 창은 스위치 켤 때 처음(D-12 · D-14) | SC-1 | OS 권한 창 | 40-12 Task 3 항목 1 |
| 양 플랫폼 릴리스 — IPA CHECK OK(aps-environment production · Firebase 0) · APK CHECK OK(google_app_id) | SC-5 | 서명 · 스토어 업로드(사용자 계정) | 40-12 Task 2 단계 6 `native:release` |
| relay 재배포 다음 날 같은 알림 중복 없음(선택) | SC-2 | 운영 재기동 | 40-12 Task 3 (선택) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags(server · webapp 은 `exec vitest run` · 전부 `--maxWorkers=2`)
- [x] Feedback latency < 15s(단일 파일 기준)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — 자동 부분 서명 2026-11-07(40-12 Task 1 PREDEPLOY-OK). `status: validated` 는 40-12 Task 3 실기기 UAT 통과 뒤.
