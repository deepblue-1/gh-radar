---
phase: 40-fill-push-notification
verified: 2026-11-09T02:00:00Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - ".planning/phases/40-fill-push-notification/40-01-PLAN.md"
  - ".planning/phases/40-fill-push-notification/40-01-SUMMARY.md"
  - ".planning/phases/40-fill-push-notification/40-02-PLAN.md"
  - ".planning/phases/40-fill-push-notification/40-02-SUMMARY.md"
  - ".planning/phases/40-fill-push-notification/40-03-PLAN.md"
  - ".planning/phases/40-fill-push-notification/40-03-SUMMARY.md"
  - ".planning/phases/40-fill-push-notification/40-04-PLAN.md"
  - ".planning/phases/40-fill-push-notification/40-04-SUMMARY.md"
  - ".planning/phases/40-fill-push-notification/40-05-PLAN.md"
  - ".planning/phases/40-fill-push-notification/40-05-SUMMARY.md"
  - ".planning/phases/40-fill-push-notification/40-06-PLAN.md"
  - ".planning/phases/40-fill-push-notification/40-06-SUMMARY.md"
  - ".planning/phases/40-fill-push-notification/40-07-PLAN.md"
  - ".planning/phases/40-fill-push-notification/40-07-SUMMARY.md"
  - ".planning/phases/40-fill-push-notification/40-08-PLAN.md"
  - ".planning/phases/40-fill-push-notification/40-08-SUMMARY.md"
  - ".planning/phases/40-fill-push-notification/40-09-PLAN.md"
  - ".planning/phases/40-fill-push-notification/40-09-SUMMARY.md"
  - ".planning/phases/40-fill-push-notification/40-10-PLAN.md"
  - ".planning/phases/40-fill-push-notification/40-10-SUMMARY.md"
  - ".planning/phases/40-fill-push-notification/40-11-PLAN.md"
  - ".planning/phases/40-fill-push-notification/40-11-SUMMARY.md"
  - ".planning/phases/40-fill-push-notification/40-12-PLAN.md"
  - ".planning/phases/40-fill-push-notification/40-12-SUMMARY.md"
  - ".planning/phases/40-fill-push-notification/40-13-PLAN.md"
  - ".planning/phases/40-fill-push-notification/40-13-SUMMARY.md"
  - "mobile/android/app/google-services.json"
  - "mobile/ios/App/App/App.entitlements"
  - "mobile/scripts/check-ipa.sh"
  - "mobile/scripts/check-release-hygiene.sh"
  - "packages/shared/src/push-message.ts"
  - "packages/shared/src/push.ts"
  - "relay/src/index.ts"
  - "relay/src/push/apns.ts"
  - "relay/src/push/fcm.ts"
  - "relay/src/push/notifier.ts"
  - "server/src/routes/push-devices.ts"
  - "server/src/services/push-devices.ts"
  - "supabase/migrations/20261107100000_dma_push_tables.sql"
  - "supabase/migrations/20261107100100_dma_push_claim.sql"
  - "supabase/migrations/20261109100000_dma_push_account_mutes.sql"
  - "webapp/src/components/me/push-alert-bell.tsx"
  - "webapp/src/components/me/push-devices-panel.tsx"
  - "webapp/src/lib/push/push-session.ts"
  - "webapp/src/lib/push/push-tap.ts"
  - "webapp/src/lib/push/toast-suppression.ts"
covered_digest: "v4:sha256:4dad815c4cd3089a1783379bb86a873b66da5665ac30e4d03da9ec96cfceca6e"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 40: 체결 앱 푸시 알림 검증 보고서

**Phase Goal:** 주문이 체결되면 창을 안 보고 있어도 폰 앱(GH Trade iOS·Android)으로 한 줄 푸시가 온다. 보내는 때는 주문 1건당 첫 체결 1건 + 전량 체결 1건이고, 송신 지점은 relay 의 저널 적용 결과(`writer.on("applied")`)라 주문·판정 로직은 무변경이며 보내기 실패는 주문에 영향이 없다. iOS 는 APNs 직접, Android 는 FCM HTTP v1.
**Verified:** 2026-11-09
**Status:** passed
**Re-verification:** No — 최초 검증

> 검증 기준은 현재 코드베이스다. 이후 follow-up(quick-261107-fbj 종 시트/패널, quick-261109-dz1 계좌별 끄기로 `dma_push_claim` 재정의, `8a612976` 탭 착지 앱 셸 감쌈)이 얹힌 상태에서 판정했다. 작업 트리에 미커밋 변경 2건(`webapp/src/components/layout/app-shell.tsx` · `webapp/src/styles/globals.css`)이 있으나 다른 세션의 작업이며 이 페이즈 산출물이 아니다.

## 목표 달성 판정

### 관찰 가능한 진실 (ROADMAP Success Criteria = 계약)

| # | 진실 | 상태 | 증거 |
|---|------|------|------|
| SC-1 | 앱에서 알림을 켠 사용자의 계좌에 체결이 나면 iOS·Android 각각 3초 안에 한 줄 푸시가 오고, 탭하면 주문로그가 열린다. 3조각 체결 → 2건 | ✓ VERIFIED | 아래 SC-1 상세 |
| SC-2 | relay 재기동(커서 재생) · 적용 RPC 재시도(WR-09) 뒤에도 같은 체결로 두 번 보내지 않는다 | ✓ VERIFIED | 아래 SC-2 상세 |
| SC-3 | 주문·판정 경로 diff 0 · 송신 실패는 로그 + 토큰 정리만 하고 저널 적용·팬아웃을 막지 않는다 | ✓ VERIFIED | 아래 SC-3 상세 |
| SC-4 | 토글이 꺼진 사용자 · 다른 사용자 계좌의 체결은 오지 않는다. 본문에 계좌번호 원문 없음 | ✓ VERIFIED | 아래 SC-4 상세 |
| SC-5 | 앱 안 Firebase 는 Android 만 · 위생 검사는 `google-services.json` 허용 + 비밀 목록 차단 유지 · 양 플랫폼 `native:release` 통과 | ✓ VERIFIED | 아래 SC-5 상세 |

**Score:** 5/5 truths verified (behavior-unverified 0)

#### SC-1 상세 (송신 · 3조각 → 2건 · 탭 착지)

- 송신 경로가 끝까지 이어져 있다: `relay/src/index.ts:562-563` 이 `wirePipeline` 의 fanout 줄 **뒤**에 `p.writer.on("applied", … pushNotifier.enqueueOrders)` · `p.strategyWriter.on("applied", … enqueueStrategy)` 를 건다 → `relay/src/push/notifier.ts` 가 정착 400ms 후 `dma_push_claim` RPC → `pushMessageOf`(shared) 문안 → 플랫폼별 송신기(`ApnsSender` · `FcmSender`, `index.ts:518-537` 에서 구성) → `dma_push_report`.
- 3조각 → 2건: 운영 함수 현재본(`20261109100000` 이 재정의)을 반영한 상태에서 `supabase/tests/dma_push_claim.test.sql` 을 직접 실행했다(90/90 PASS, 마이그레이션 전체 재생). 테스트 2~4절이 첫 조각 200주 → `first_fill`, 가운데 조각 150주(누적 350) → `sends` 0, 마지막 조각(누적 500) → `filled` 를 단언한다. 채움 푸시는 첫 1건 + 전량 1건이다.
- 접수 푸시(D-01 ①)는 discuss 에서 사용자가 범위로 넣은 추가 사건이라 한 주문이 접수 + 첫 체결 + 전량 3건을 낼 수 있다. SC-1 문구의 「부분 체결 여러 조각 → 첫 1건 + 전량 1건」은 여전히 참이다(`40-CONTEXT.md` D-01 · D-08 로 승인된 확장).
- 탭 착지: `webapp/src/lib/push/push-tap.ts`(`parsePushTapPath` · `resolvePushTapPath` — 경로를 `/trading/order-log` 로만 허용, 계좌는 오늘 주문에서 해석)를 `push-session.ts` 의 `startPushSession` 이 쓰고, `native-bridge-provider.tsx:240` 이 세션마다 호출한다.
- 네이티브 페이로드: APNs `{ aps: { alert, sound, "thread-id" }, path }` + `apns-collapse-id` = `log_id`, FCM `android.notification.channel_id` + `data.path`.
- 실기기: 2026-11-09 장중 사용 뒤 사용자 답 「푸시 다 잘돼」(40-12-SUMMARY Task 3). 운영 Cloud Logging 집계 116회 · 기기 송신 성공 314 · 실패 0 · 토큰 제거 0(11-07~11-09).
- 주의(경고 W-1): 「3초 안」 수치는 초 단위로 실측하지 않았다(40-12-SUMMARY 가 스스로 밝힘). 코드상 정착 400ms + RPC 1회 + 송신이라 구조는 맞고 사용자 인수는 받았다.

#### SC-2 상세 (재생 · 재시도 멱등)

- 단조 upsert `dma_push_chains`(`sent_rank < EXCLUDED.sent_rank` 일 때만 행 반환) + `dma_push_log` UNIQUE `dma_push_log_chain_stage_key` 로 송신 권리를 DB 에서 한 번만 준다(`20261109100000` 판정 본문 ②절). relay 메모리에 「보낸 것」을 두지 않는다(D-07).
- pgTAP: 5절 같은 호출 반복 → `sends` 0, 77절 자동매도 같은 사건 재호출 → `sends` 0, 78절 재무장 뒤 두 번째 발동은 새 사건으로 1건 — 모두 PASS.
- relay 재기동 재생: `relay/tests/push-notifier.test.ts`(재기동 재생 케이스 포함) 통과.
- 한계(경고 W-2): 이 멱등은 at-most-once 다. 판정 응답 유실 뒤 재시도는 중복은 없으나 그 묶음이 유실된다(WR-01). SC-2 의 「두 번 보내지 않는다」 는 충족.

#### SC-3 상세 (주문·판정 경로 diff 0 · 실패 격리)

- diff 0: 페이즈 시작 직전 커밋 `617542db` 부터 HEAD 까지 `relay/src/journal` · `relay/src/order` · `relay/src/ws` · `relay/src/store` 변경 0 줄. `relay/src` 의 나머지 변경 가운데 이 페이즈 소속은 `push/*`(신규) · `index.ts` 결선 · `config.ts` · `logger.ts` 마스킹 · `hub/subscription-hub.ts` `holdingOf`(조회 전용 추가) · `access/app-access.ts` `userIdsOf`(조회 전용 추가) 뿐이고 모두 추가 전용이다(`admin/*` · `launch-*` · `generated/*` 변경은 다른 작업).
- 저널 적용 · 전략 적용 RPC 재정의 0: Phase 40 마이그레이션 3개 어디에도 `dma_journal_apply` · `dma_strategy*` 의 `CREATE [OR REPLACE] FUNCTION` 이 없다(grep). 재정의된 것은 이 페이즈 자체 RPC `dma_push_claim` 뿐.
- 실패 격리: `enqueueOrders` · `enqueueStrategy` 는 동기 enqueue + 자체 try/catch 라 예외를 던지지 않는다(`notifier.ts`). `#flush` 는 catch 로 감싸고, 송신기 예외는 `failed` 로 기록하며 토큰은 로그에서 지운다. 판정 · 보고 RPC 오류는 로그만. 송신기가 `stopRun`(429)을 주면 그 플랫폼 남은 송신을 멈춘다. `relay/tests/journal-push.test.ts` · `push-notifier.test.ts` · `push-apns.test.ts` · `push-fcm.test.ts` · `config-push.test.ts` 5파일 85테스트를 직접 실행해 통과를 확인했다.
- 토큰 정리: APNs 410 → `token_removed`, FCM UNREGISTERED → `token_removed`, `dma_push_report` 가 기기 id ∧ 토큰이 일치할 때만 행을 지운다(pgTAP `dma_push_devices` 48/48).
- gh-trade 서버: 이 저장소 밖이며 이 페이즈는 서버 쪽 파일을 건드리지 않았다(`server/src` 의 diff 는 `push-devices` 신규 + `app.ts` 라우트 마운트 3줄 + 다른 작업의 admin 변경).

#### SC-4 상세 (계좌 범위 · 토글 · 본문)

- 토글: `dma_push_claim` 의 기기 선택이 `d.enabled` ∧ `d.user_id = ANY(수신자)` ∧ 끈 계좌 `NOT EXISTS`(quick-261109-dz1) 로 거른다. pgTAP 83절(기기 토글 꺼짐 → `sends` 0 · 체인 0), 84~87절(다른 사용자 계좌 → 그 사용자 기기만, 공유 계좌는 둘 다), `dma_push_account_mutes.test.sql` 29/29 PASS(CASCADE · 멱등 · claim 통합).
- 수신자: relay `#recipientsOf` 가 계좌 → 그 서버 매핑의 DMA id → `AppAccess.userIdsOf`(admin/trader 만 · viewer 제외) 로 정한다.
- 본문: shared `PushFacts` 에 계좌 칸이 없어 문안에 계좌번호가 들어갈 수 없다(`push-message.test.ts` 42건 통과). pgTAP 88~89절이 판정 반환 전체에서 `account_no`/`accountNo` 키 부재를 검사한다. 탭 payload 에도 계좌가 없다(D-21 · D-24).
- 기기 API: `server/src/routes/push-devices.ts` 는 `requireAuth()` + `req.userId` 만 쓰고 남의 · 없는 `deviceKey` 는 404(`push-devices.test.ts` 31건 통과). 표 4개 + 끈 계좌 표는 RLS 켜짐 · 정책 0 · RPC EXECUTE (anon, authenticated, service_role) = (f, f, t)(pgTAP).

#### SC-5 상세 (Firebase 는 Android 만 · 위생 · 릴리스)

- `mobile/android/app/google-services.json` 추적됨 · `project_id` = `gh-radar` · 패키지 `com.ghtrade.app`. `build.gradle` 은 릴리스 태스크에서 파일이 없으면 실패하고, 있으면 `com.google.gms.google-services` 를 적용한다.
- iOS Firebase 0: `mobile/ios/App/CapApp-SPM/Package.swift` 에 `firebase` 없음(`CapacitorPushNotifications` 만). `App.entitlements` 에 `aps-environment`, `AppDelegate.swift` 는 APNs 토큰을 그대로 웹에 넘긴다.
- 위생 검사 직접 실행: `bash mobile/scripts/check-release-hygiene.sh` → `RELEASE HYGIENE OK` (google-services.json(Android) 검증 · iOS Firebase 0 · 추적 비밀 0 · SA 키 ignore 유지). `check-ipa.sh` 는 `aps-environment` 가 `production` 이 아니면 실패하도록 단언한다.
- 릴리스: 40-12-DEPLOY-LOG 가 iOS 202611071000 `IPA CHECK OK`(aps-environment production · Firebase 0) · TestFlight VALID, Android 611071006 `APK CHECK OK` · App Distribution 배포를 기록한다. 서명·스토어 업로드는 사용자 계정 의존이라 이 검증에서 재실행하지 않았고 배포 로그와 사용자 UAT 로 갈음했다.

### 필수 산출물 (3단계 확인)

| 산출물 | 기대 | 상태 | 세부 |
|--------|------|------|------|
| `supabase/migrations/20261107100000_dma_push_tables.sql` | 표 4 · 기기 RPC 4 · 보고 RPC · 권한 | ✓ VERIFIED | 364줄 · RLS · REVOKE · GRANT 전부 확인 · pgTAP 48/48 |
| `supabase/migrations/20261107100100_dma_push_claim.sql` + `20261109100000_…mutes.sql` | 판정 RPC(현재본은 mutes 가 재정의) | ✓ VERIFIED | 537 · 597줄 · pgTAP 90/90 · 29/29 |
| `relay/src/push/notifier.ts` | 큐 · 정착 · 단일 비행 · 수신자 · 격리 | ✓ VERIFIED | 549줄 · `index.ts:538` 에서 생성 · `wirePipeline`(562-563) 결선 · 종료 close(807) |
| `relay/src/push/apns.ts` · `fcm.ts` | APNs http2 · FCM v1 | ✓ VERIFIED | 257 · 243줄 · `index.ts:518-537` 결선 · 단위 테스트 통과 |
| `packages/shared/src/push-message.ts` · `push.ts` | 문안 정본 · 계약 타입 | ✓ VERIFIED | `notifier.ts` 가 `pushMessageOf` · `pushTapPathOf` · `pushThreadIdOf` 사용 |
| `server/src/routes/push-devices.ts` + services/schemas | 기기 API | ✓ VERIFIED | `app.ts` 에 `/api/push-devices` 마운트 · 운영 revision `gh-radar-server-00083-chf` 배포 |
| `webapp/src/lib/push/*` · `components/me/push-devices-panel.tsx` · `push-alert-bell.tsx` | 토글 · 권한 · 토큰 등록 · 탭 · 토스트 숨김 | ✓ VERIFIED | `account-card.tsx:97` 종 → `me-client.tsx:640,654` 마운트 · `native-bridge-provider.tsx:240` 세션 · `trading-workbench.tsx:1259` 토스트 숨김 · 196테스트 통과 |
| `mobile/android/app/google-services.json` · `App.entitlements` · 위생/IPA 검사 | 앱 셸 | ✓ VERIFIED | 위 SC-5 |

### 핵심 연결

| From | To | Via | 상태 |
|------|----|-----|------|
| `writer.on("applied")` | `PushNotifier.enqueueOrders` | `index.ts:562` (fanout 뒤) | WIRED |
| `strategyWriter.on("applied")` | `PushNotifier.enqueueStrategy` | `index.ts:563` | WIRED |
| `PushNotifier` | `dma_push_claim` / `dma_push_report` | `supabase.rpc` | WIRED |
| `PushNotifier` | `pushMessageOf` (shared) | 문안 조립 한 곳 | WIRED |
| `pushSenders` | `ApnsSender` / `FcmSender` | config 비밀 유무로 구성 | WIRED |
| 앱 토글 | `PUT /api/push-devices/:deviceKey` | `push-devices-api.ts` → 라우트 → `dma_push_device_upsert` | WIRED |
| 로그아웃 | `DELETE /api/push-devices/:deviceKey` | `auth-context.tsx:60` | WIRED (best-effort — W-5) |
| 알림 탭 | 주문로그 경로 | `addPushTapListener` → `resolvePushTapPath` → `router.push` | WIRED |
| 토글 · 권한 | 작업대 토스트 숨김 | `useOrderToastSuppression` → `useTradingAlerts` | WIRED |

### 데이터 흐름 (Level 4)

| 산출물 | 데이터 | 원천 | 실데이터 | 상태 |
|--------|--------|------|----------|------|
| 푸시 문안 | `PushFacts` | `dma_push_claim` 이 `dma_account_orders` · `dma_journal_events` · `dma_strategy_events` · `stocks` 에서 계산 | 예 | ✓ FLOWING |
| 수신 기기 | `devices[]` | `dma_push_devices` ∧ 수신자 ∧ 끈 계좌 제외 | 예 | ✓ FLOWING |
| 기기 목록 · 끈 계좌 | `PushDevice[]` · `string[]` | 서버 RPC | 예 | ✓ FLOWING |

### 행동 확인 (이번 검증에서 직접 실행)

| 행동 | 명령 | 결과 | 상태 |
|------|------|------|------|
| 판정 · 멱등 · 계좌 범위 · 3조각 → 2건 | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_push_claim.test.sql` | 90/90 · `RESULT: PASS` | ✓ PASS |
| 끈 계좌 + claim 통합 | 같은 러너 · `dma_push_account_mutes.test.sql` | 29/29 · PASS | ✓ PASS |
| 기기 RPC · 소유권 · 권한 | 같은 러너 · `dma_push_devices.test.sql` | 48/48 · PASS | ✓ PASS |
| relay 푸시 5파일 | `vitest run tests/push-notifier … config-push … journal-push` (`--maxWorkers=2`) | 5파일 85테스트 통과 | ✓ PASS |
| 문안 골든 | `vitest run src/__tests__/push-message.test.ts` (shared) | 42 통과 | ✓ PASS |
| 기기 API | `vitest run tests/routes/push-devices.test.ts` (server) | 31 통과 | ✓ PASS |
| 웹 푸시 | `vitest run src/lib/push src/components/me` (webapp) | 9파일 196 통과 | ✓ PASS |
| 릴리스 위생 | `bash mobile/scripts/check-release-hygiene.sh` | `RELEASE HYGIENE OK` | ✓ PASS |

전체 스위트는 재실행하지 않았다(요청 사항). 회귀 게이트(relay 1992 · webapp 5907 통과)는 호출자가 제공한 기존 증거로 받아들인다.

### 프로브 실행

해당 없음 — 이 페이즈는 `scripts/*/tests/probe-*.sh` 를 선언하지 않았다.

### 요구사항 커버리지

PLAN frontmatter 의 `requirements` 는 전부 `SC-1`~`SC-5`(ROADMAP 성공 기준 라벨)이고 ROADMAP 의 Phase 40 `Requirements: TBD` 와 일치한다. `.planning/REQUIREMENTS.md` 에는 이 ID 도 Phase 40 에 매핑된 행도 없다. 고아(ORPHANED) 요구사항 없음. 참고로 `REQUIREMENTS.md:62` 의 「실시간 알림/푸시」 범위 밖 항목은 v1.0 기준 문구이며 이 페이즈(v1.1 이후)와 충돌하지 않는다.

| 요구 ID | 소스 플랜 | 설명 | 상태 | 증거 |
|---------|-----------|------|------|------|
| SC-1 | 02·03·05·06·07·08·09·10·11·12·13 | 3초 푸시 · 3조각 → 2건 · 탭 착지 | ✓ SATISFIED | 위 SC-1 |
| SC-2 | 01·05·06·07·12 | 재생 · 재시도 멱등 | ✓ SATISFIED | 위 SC-2 |
| SC-3 | 01·05·06·07·09·11 | diff 0 · 실패 격리 · 토큰 정리 | ✓ SATISFIED | 위 SC-3 |
| SC-4 | 01·02·03·05·06·07·09·10·12 | 계좌 범위 · 토글 · 본문 계좌번호 없음 | ✓ SATISFIED | 위 SC-4 |
| SC-5 | 03·04·08·10·12·13 | Firebase Android 만 · 위생 · 릴리스 | ✓ SATISFIED | 위 SC-5 |

### 안티패턴 점검

| 파일 | 패턴 | 심각도 | 영향 |
|------|------|--------|------|
| 페이즈 변경 파일 전체(relay push · shared push · server push-devices · webapp lib/push · components/me/push-* · 마이그레이션 3 · 위생/비밀 스크립트) | `TBD` · `FIXME` · `XXX` | — | 0건. 부채 마커 게이트 통과 |
| 같은 파일들 | `TODO` · `HACK` · `PLACEHOLDER` | — | 0건 |
| 스텁 · 하드코딩 빈 데이터 | — | — | 발견 없음(문안 · 판정 · 기기 선택 모두 실데이터 원천) |

## 경고 (차단 아님 · 처분은 사람 결정)

SC 를 깨는 FAILED 는 없다. 다만 `40-REVIEW.md` 의 경고 7건은 `40-REVIEW-DISPOSITION.md` 에서 전부 `open` 이며, 코드로 확인한 결과 아래 항목은 현재 코드에 실제로 존재한다. 목표 달성을 막지는 않지만 처분(수정 · 수용)을 정하기 바란다.

| ID | 관련 | 내용 | 확인 |
|----|------|------|------|
| W-1 | SC-1 | 「3초 안」 지연을 초 단위로 실측하지 않았다. 사용자 인수(「푸시 다 잘돼」)와 운영 로그 실패 0 으로 갈음. 판정 · 보고 RPC 에 타임아웃이 없어(WR-03) 망 블랙홀 시 한 게이트웨이 푸시 큐가 길게 멈출 수 있다 | 코드 확인 · `notifier.ts` `#claim` 에 abort/timeout 없음 |
| W-2 | SC-1·SC-2 | 판정 RPC 응답이 유실된 뒤 재시도는 `sends: []` 를 받아 그 묶음 푸시가 영구 유실된다(WR-01). 종료 시 정착 큐 · 판정 후 송신이 버려진다(WR-02) | 코드 · SQL 로직 일치 확인 |
| W-3 | SC-3 | FCM 404 / `NOT_FOUND` 를 무조건 `token_removed` 로 분류(`fcm.ts:67`). 프로젝트 id 오설정 하나로 Android 기기 행이 전부 지워질 수 있다(WR-04) | 코드 직접 확인 |
| W-4 | 알림 공백 | 토스트 숨김이 「배너가 실제로 온다」 를 확인하지 않아 끈 계좌 · 송신기 꺼짐 · `PUSH_NOTIFY=off` 에서 주문 토스트와 배너가 모두 없다(WR-06). 자동매도 완료 평균가 · 손익은 두 기록기 순서 경합에 놓여 있다(WR-05) | `toast-suppression.ts` 조건 4개 확인 |
| W-5 | SC-4 (D-15) | 로그아웃 정리 DELETE 가 실패하면(오프라인 · 세션 만료로 `signOut` 미경유) 앞 사용자 기기 행이 켜진 채 남아 다음 사용자 폰에 앞 사용자 체결이 계속 간다(WR-07). SC-4 의 DB 판정(계좌 범위 · 토글)은 정확하지만 이 생명주기 구멍은 남아 있다 | 코드 경로 확인(3초 상한 · throw 없음) |

정보성(IN-01~IN-06)은 `40-REVIEW.md` 참고. 모두 처분 전(`open`)이다.

## 사람 확인 필요 항목

없음. 실기기 UAT(2026-11-09 사용자 통과 보고 · `40-VALIDATION.md` `status: validated` · `nyquist_compliant: true`)가 이미 완료돼 있고, 이 검증이 새로 요구하는 수동 확인은 없다. 단 UAT 는 항목별 · 플랫폼별 개별 답이 아니라 「푸시 다 잘돼」 한 줄을 전 항목 통과로 옮긴 것임을 기록해 둔다(40-12-SUMMARY 본문에 명시).

## Gaps Summary

게이트를 막는 갭은 없다. 5개 성공 기준이 모두 현재 코드 · 운영 증거로 확인됐다.

- 판정 · 멱등 · 계좌 범위는 DB(`dma_push_claim` + 체인 · 로그 표)가 정본이고, 현재 운영 함수(끈 계좌 조건이 얹힌 재정의본)에서 pgTAP 90 · 29 · 48 단언을 직접 돌려 통과를 확인했다.
- 주문 · 판정 경로(`relay/src/journal|order|ws|store`)는 0 줄 변경이고, 푸시 리스너는 fanout 뒤에 동기 enqueue + 예외 삼킴으로만 붙어 실패가 주문에 번지지 않는다.
- 앱 셸은 Android 만 Firebase, iOS 는 APNs 직접이며 위생 검사가 이를 강제하고 통과한다.
- 후속 변경(종 시트/패널 · 계좌별 끄기 · 탭 착지 앱 셸)은 목표를 해치지 않고 같은 경로 위에 얹혀 있다. 웹 진입점은 `/me` 계정 카드의 종(`PushAlertBell`) 뒤 패널로 바뀌었으나 서버 저장 토글 · 권한 · 기기 목록 · 끄기/지우기 기능은 모두 유지된다.

남은 것은 코드 리뷰 경고 7건의 처분(W-1~W-5 로 묶음)이다. 특히 W-3(FCM 404 오분류)과 W-5(로그아웃 정리 실패 경로)는 운영 중 실제 영향이 있을 수 있으니 후속 quick 으로 다룰 가치가 있다.

---

_Verified: 2026-11-09T02:00:00Z_
_Verifier: Claude (gsd-verifier)_
