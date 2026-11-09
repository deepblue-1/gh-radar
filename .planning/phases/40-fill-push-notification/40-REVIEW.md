---
phase: 40-fill-push-notification
reviewed: 2026-11-09T01:45:11Z
depth: standard
files_reviewed: 75
files_reviewed_list:
  - mobile/.gitignore
  - mobile/android/app/build.gradle
  - mobile/android/app/capacitor.build.gradle
  - mobile/android/app/google-services.json
  - mobile/android/app/src/main/AndroidManifest.xml
  - mobile/android/app/src/main/java/com/ghtrade/app/GhTradeBridge.kt
  - mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt
  - mobile/android/app/src/main/res/drawable/ic_stat_ghtrade.xml
  - mobile/android/capacitor.settings.gradle
  - mobile/android/variables.gradle
  - mobile/capacitor.config.ts
  - mobile/ios/App/App.xcodeproj/project.pbxproj
  - mobile/ios/App/App/App.entitlements
  - mobile/ios/App/App/AppDelegate.swift
  - mobile/ios/App/App/GHTradeBridgeViewController.swift
  - mobile/ios/App/CapApp-SPM/Package.swift
  - mobile/ios/App/fastlane/Fastfile
  - mobile/package.json
  - mobile/scripts/check-apk.sh
  - mobile/scripts/check-ipa.sh
  - mobile/scripts/check-release-hygiene.sh
  - mobile/scripts/check-sim-entitlements.sh
  - packages/shared/src/__tests__/push-message.test.ts
  - packages/shared/src/index.ts
  - packages/shared/src/push-message.ts
  - packages/shared/src/push.ts
  - relay/src/access/app-access.ts
  - relay/src/config.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/index.ts
  - relay/src/logger.ts
  - relay/src/push/apns.ts
  - relay/src/push/fcm.ts
  - relay/src/push/notifier.ts
  - relay/tests/account-state.test.ts
  - relay/tests/app-access.test.ts
  - relay/tests/config-push.test.ts
  - relay/tests/push-apns.test.ts
  - relay/tests/push-fcm.test.ts
  - relay/tests/push-notifier.test.ts
  - scripts/deploy-relay.sh
  - scripts/setup-push-secrets.sh
  - scripts/setup-relay-iam.sh
  - server/src/app.ts
  - server/src/routes/push-devices.ts
  - server/src/schemas/push-devices.ts
  - server/src/services/push-devices.ts
  - server/tests/routes/push-devices.test.ts
  - supabase/migrations/20261107100000_dma_push_tables.sql
  - supabase/migrations/20261107100100_dma_push_claim.sql
  - supabase/tests/dma_push_claim.test.sql
  - supabase/tests/dma_push_devices.test.sql
  - webapp/src/app/trading/order-log/page.tsx
  - webapp/src/components/trading/me-client.tsx
  - webapp/src/components/trading/order-log/order-log-route.tsx
  - webapp/src/components/trading/order-log/order-log-window.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/lib/__tests__/use-trading-alerts.test.tsx
  - webapp/src/lib/auth-context.tsx
  - webapp/src/lib/native/__tests__/native-bridge-provider.test.tsx
  - webapp/src/lib/native/__tests__/post-native.test.ts
  - webapp/src/lib/native/native-bridge-provider.tsx
  - webapp/src/lib/native/post-native.ts
  - webapp/src/lib/push/__tests__/device-key.test.ts
  - webapp/src/lib/push/__tests__/native-push.test.ts
  - webapp/src/lib/push/__tests__/push-session.test.ts
  - webapp/src/lib/push/__tests__/push-tap.test.ts
  - webapp/src/lib/push/device-key.ts
  - webapp/src/lib/push/native-push.ts
  - webapp/src/lib/push/push-devices-api.ts
  - webapp/src/lib/push/push-session.ts
  - webapp/src/lib/push/push-tap.ts
  - webapp/src/lib/push/toast-suppression.ts
  - webapp/src/lib/push/use-push-devices.ts
  - webapp/src/lib/use-trading-alerts.ts
findings:
  critical: 0
  warning: 7
  info: 6
  total: 13
  necessity: 1
status: issues_found
---

# Phase 40: Code Review Report

**Reviewed:** 2026-11-09T01:45:11Z
**Depth:** standard
**Files Reviewed:** 75
**Status:** issues_found

## Summary

Phase 40(체결 앱 푸시) 의 현재 상태 75개 파일을 standard 깊이로 읽었다 — DB 판정 RPC(`dma_push_claim`) · 기기/보고 RPC, relay `PushNotifier` · `ApnsSender` · `FcmSender` · 결선, server `/api/push-devices`, webapp 등록 · 탭 착지 · 토스트 숨김, 앱 셸(iOS/Android) 설정과 릴리스 검사 스크립트.

`dma_push_claim` 은 `20261109100000_dma_push_account_mutes.sql` 이 `CREATE OR REPLACE` 로 다시 정의했지만 본문 차이는 기기 SELECT 의 끈 계좌 `NOT EXISTS` 1줄뿐임을 diff 로 확인했다. 그래서 아래 판정 RPC 지적은 지금 운영 함수에도 그대로 해당한다(줄 번호는 목록 안 파일 `20261107100100` 기준).

단조 upsert(`sent_rank < EXCLUDED.sent_rank`)로 거는 멱등은 바르게 짜여 있고, 동시 판정 호출(정착 묶음 · 짝 대기 재호출)에서도 한 단계는 한 번만 나간다. 핵심 문제는 **「at-most-once」 설계의 유실 경로가 주석의 주장보다 넓다**는 점이다.
- 판정 RPC 응답이 유실되면 재시도가 `sends: []` 를 받아 그 묶음이 조용히 사라진다(WR-01).
- 종료할 때 정착 큐 · 판정을 마친 송신이 버려진다(WR-02).
- 판정 RPC · 송신에 시간 상한이 없어 게이트웨이 큐가 수 분 멈출 수 있다(WR-03).

그 밖에 짚은 것:
- FCM 404 를 무조건 토큰 폐기로 분류해 설정 오타 하나로 Android 기기 행이 모두 지워질 수 있다(WR-04).
- 자동매도 완료의 평균가 · 손익이 두 기록기 순서 경합에 놓여 있다(WR-05).
- 토스트 숨김이 「배너가 실제로 온다」 를 확인하지 않는다(WR-06).
- 로그아웃 정리가 실패하면 앞 사용자 체결이 다음 사용자 폰으로 계속 간다(WR-07).

보안 검토는 프로젝트 설정(`security_enforcement=false`)에 따라 범위 밖으로 두었다.

## Warnings

### WR-01: 판정 RPC 응답 유실 뒤 재시도가 그 묶음의 푸시를 영구히 잃는다

**File:** `relay/src/push/notifier.ts:424-450` · `supabase/migrations/20261107100100_dma_push_claim.sql:497-513`
**Issue:**
- `#claim` 은 오류나 throw 가 나면 같은 인자로 1회 재시도한다. 주석(`notifier.ts:44`)은 「판정은 멱등이라 응답 유실 재시도도 중복 송신이 없다」 고 쓴다.
- 그런데 첫 호출이 DB 에서 **커밋된 뒤** 응답만 끊긴 경우가 있다(소켓 리셋 · 게이트웨이 504 · PostgREST 타임아웃). 이때 체인 행은 이미 `sent_rank` 로 올라가 있고 `dma_push_log` 에 `outcome='sent'` 행이 남는다.
- 재시도는 `v_have >= rank` 사전 확인(`claim.sql:245`)이나 단조 upsert `WHERE` 에 걸려 `sends: []` 를 받는다. 결과적으로 중복은 없지만 **그 묶음의 접수 · 체결 · 전량 푸시는 아무 기기에도 가지 않고, 로그에는 보낸 것으로 남는다**.
- 메모리의 「GCP 서울 엣지 주기 끊김」 처럼 relay → Supabase 경로의 간헐 손실은 실제로 관측된 일이라 이론상의 경로가 아니다.

**Fix:** 재시도가 「이미 판정됐지만 전달 기록이 없는」 로그 행을 다시 돌려받게 한다. 예를 들어 claim 에 호출 멱등 키를 둔다.
```sql
-- dma_push_log 에 claim_id uuid 칸 추가, 호출자가 시도마다 같은 p_claim_id 를 넘긴다.
-- 함수 첫 줄: 같은 p_claim_id 로 기록된 sent 로그가 있으면 판정 없이 그 행들(+지금 기기)로 sends 를 재구성해 반환.
```
또는 `sends` 를 만든 뒤 `dma_push_deliveries` 가 하나도 없는 같은 체인의 `sent` 로그를 재시도 호출에서 다시 포함한다. 둘 다 아니면 최소한 주석을 「응답 유실 시 그 묶음은 유실된다」 로 고쳐 at-most-once 를 명시한다.

### WR-02: 종료 때 정착 큐 · 판정을 마친 송신이 버려진다 — 커서가 이미 전진해 재기동이 되살리지 못한다

**File:** `relay/src/index.ts:804-807` · `relay/src/push/notifier.ts:281-304, 380, 457, 468`
**Issue:**
- `shutdown` 은 `pipelines.drainAll()` 로 마지막 배치를 적용시킨다. 이 적용이 `applied` 를 내면 `enqueueOrders` 가 400ms 정착 타이머를 건다.
- 곧바로 `pushNotifier.close()` 가 타이머를 지우고 `q.orders` · `q.strategy` 를 비운다. 이 행들은 판정 RPC 에 한 번도 들어가지 않았고, 저널 커서는 적용 트랜잭션에서 이미 전진했다. 그래서 다음 부팅의 재생으로도 다시 enqueue 되지 않는다 — 영구 유실이다.
- `#claimAndSend` 가 판정을 받은 직후 `#closed` 면 `return`(380)하고, `#deliver` 도 `#closed` 면 중단한다(457 · 468). 이 경우 DB 에는 `sent` 로 남고 기기로는 가지 않는다.
- 배포는 장 마감 뒤가 원칙이지만, 장중 재시작(OOM · 재배포 · 롤백) 직전 수백 ms 의 체결 알림이 소리 없이 사라진다.

**Fix:** `close()` 를 `async closeGracefully(timeoutMs)` 로 바꾼다. 남은 큐를 즉시 `#flush` 하고, 진행 중 `#claimAndSend` 를 상한(예: 1.5초) 안에서 기다린 뒤 송신기를 닫는다. `shutdown` 은 `drainAll` 직후 이것을 `await` 한다(전체 `SHUTDOWN_TIMEOUT_MS` 5초 안).
```ts
async drain(timeoutMs: number): Promise<void> {
  for (const q of this.#queues.values()) { if (q.timer) { clearTimeout(q.timer); q.timer = null; } void this.#flush(q); }
  await Promise.race([this.#idle(), new Promise((r) => setTimeout(r, timeoutMs))]);
}
```

### WR-03: 판정 RPC · 송신에 시간 상한이 없어 게이트웨이 큐가 멈춘다(SC-1 「3초 안 도착」 위협)

**File:** `relay/src/push/notifier.ts:328-343, 429, 467-473` · `relay/src/store/supabase.ts:32-36`
**Issue:**
- `#flush` 는 게이트웨이마다 단일 비행(`inFlight`)이다. 그런데 `this.#supabase.rpc("dma_push_claim", …)` 에는 타임아웃이 없다. relay 서비스롤 클라이언트는 `global.fetch` 상한 없이 만들어지고, undici 기본 headers/body timeout 은 300초다.
- TCP 블랙홀 한 번이면 그 게이트웨이의 푸시 큐가 최대 5분, 재시도까지 10분 멈춘다. 그동안 쌓인 주문은 나중에 「지금 상태」 로 판정돼 수 분 늦은 알림이 된다.
- `#deliver` 는 send × 기기를 **순차 await** 한다. APNs 한 건이 5초 타임아웃 + 재시도면 최악 10초가 걸리고, 그동안 같은 묶음의 Android 송신과 다음 묶음이 모두 기다린다. 한 플랫폼의 장애가 다른 플랫폼 지연으로 번진다.

**Fix:** 판정 · 보고 RPC 를 `AbortSignal.timeout(3_000)` 으로 감싼다(supabase-js `rpc(...).abortSignal(signal)`). 송신은 플랫폼별로 병렬화한다.
```ts
const { data, error } = await this.#supabase.rpc("dma_push_claim", args).abortSignal(AbortSignal.timeout(3_000));
// #deliver: 플랫폼별 그룹으로 나눠 Promise.all, 그룹 안은 순차(stopRun 의미 유지)
```

### WR-04: FCM 404 · `NOT_FOUND` 를 무조건 토큰 폐기로 분류 — 프로젝트 설정 오류 하나로 Android 기기 행이 전부 지워진다

**File:** `relay/src/push/fcm.ts:61, 67, 86-87, 147-148`
**Issue:**
- `classifyFcmResponse` 는 `status === 404` 이거나 `errorStatus` 가 `NOT_FOUND` 면 `token_removed` 로 분류한다. 그런데 `fcmErrorCodeOf` 는 FcmError `errorCode` 가 없을 때 일반 `error.status` 로 떨어지고(86-87), 그 값은 Google API 공통의 `NOT_FOUND` 다.
- `FCM_PROJECT_ID` 오타 · 프로젝트 삭제 · URL 오류는 FcmError 상세 없이 `404 NOT_FOUND` 를 준다. 그러면 첫 송신 묶음에서 켜진 Android 기기 행이 전부 `dma_push_report` 로 삭제된다. 사용자는 각 기기에서 다시 켜야 한다.
- 기동 `probe()` 는 404 를 「권한 확인」 info 로 로그해(147-148) 이 설정 오류를 오히려 가린다.

**Fix:** 기기 토큰 폐기는 FcmError `errorCode === "UNREGISTERED"` 일 때만 한다. probe 는 404 를 경고로 올린다(가짜 토큰 + validate_only 의 정상 응답은 400 `INVALID_ARGUMENT`).
```ts
// fcmErrorCodeOf 가 errorCode 와 status 를 구분해 돌려주게 한 뒤
if (fcmErrorCode === "UNREGISTERED") return { result: "token_removed", ...base };
if (status === 404) return { result: "failed", ...base }; // 프로젝트/URL 문제 — 지우지 않는다
```

### WR-05: 자동매도 완료의 평균가 · 손익이 두 기록기 순서 경합에 놓여 있다(단발 rank 3 라 다시 계산되지 않는다)

**File:** `supabase/migrations/20261107100100_dma_push_claim.sql:394-415, 389`
**Issue:**
- `autosell_done`(kind 13) 의 `avgSellPrice` · `pnlPct` 는 `dma_journal_events` 의 E 행(주문 기록기)을 합해 계산한다. kind 13 은 **전략 기록기**로 들어온다.
- 두 기록기는 배치 · 재시도가 독립이다. 전략 쪽이 먼저 커밋되고 400ms 정착 뒤 판정이 돌 때 마지막 매도 체결 E 행이 아직 적용되지 않았을 수 있다(주문 기록기 재시도 · WR-09 지연).
- 그러면 평균가 · 손익이 **일부 체결만으로 계산된 틀린 값**이 되거나(E 일부만 있음) 빠진다(E 0건). 자동매도 사건은 `CONTINUE WHEN v_have IS NOT NULL` 이라 한 번 기록되면 다시 판정되지 않는다.
- 머리 주석의 「두 기록기 순서 차이 모두에서 같은 판정」(SC-2)과 어긋난다.

**Fix:** 완료 판정 때 `Σ e.exec_qty`(창 안 매도 체결 합)가 `v_sev.qty`(kind 13 누적 매도 수량)보다 작으면 이 사건을 기록 없이 `deferred` 로 돌린다. relay 는 전략 항목도 짝 대기 재호출에 넣는다. 폴백 호출에서는 있는 값으로 보낸다.
```sql
IF v_sev.kind = 13 AND coalesce(v_s_qty, 0) < v_sev.qty AND NOT v_fallback THEN
  v_deferred := v_deferred || jsonb_build_array(jsonb_build_object('journal_epoch', v_sev.journal_epoch, 'seq', v_sev.seq));
  CONTINUE;
END IF;
```

### WR-06: 토스트 숨김이 「배너가 실제로 온다」 를 확인하지 않는다 — 끈 계좌 · 송신기 꺼짐 · 비상 끄기에서 알림 공백

**File:** `webapp/src/lib/push/toast-suppression.ts:40-42, 84-91`
**Issue:** 숨김 조건은 네이티브 ∧ 플러그인 ∧ 권한 granted ∧ 이 기기 행 enabled 넷뿐이다. 다음 경우에는 배너가 오지 않는데도 작업대 주문 토스트 · 소리가 계속 숨겨진다. D-20 의 「토글이 꺼진 앱 · 웹 브라우저는 토스트 그대로 — 알림 공백 없음」 이 깨진다.
- quick-261109-dz1 로 **그 계좌를 끈 경우** — claim 이 그 사용자 기기를 고르지 않는다(`dma_push_account_mutes`).
- relay 비상 끄기 `PUSH_NOTIFY=off` 나 APNs 비밀 누락(`[push] APNs 비밀 없음 — iOS 송신 꺼짐`)으로 그 플랫폼 송신기가 없는 경우.
- D-02/D-22 로 원래 안 보내는 사건(정정 확인 · 수동 취소 · 중간 체결 · 자동매도 주문)은 D-20 이 숨김 범위로 정한 설계라 별개다. 다만 앞의 두 경우는 설계가 가정한 「배너가 대신 뜬다」 전제 자체가 없다.

**Fix:** 숨김을 주문 계좌 단위로 판정한다. `alert` 의 계좌가 끈 계좌 목록(`fetchPushAccountMutes`)에 있으면 숨기지 않는다. 서버가 기기 목록 응답에 relay 송신 가능 플랫폼(또는 `pushActive: boolean`)을 실어 주면 그 값도 조건에 넣는다. 최소한 끈 계좌 조건은 `useTradingAlerts` 의 `suppressOrderToasts` 를 `(alert) => boolean` 판정 함수로 바꿔 반영한다.

### WR-07: 로그아웃 정리(DELETE)가 실패하면 앞 사용자 체결이 같은 폰의 다음 사용자에게 계속 간다

**File:** `webapp/src/lib/push/push-devices-api.ts:79-101` · `webapp/src/lib/auth-context.tsx:56-63` · `webapp/src/lib/push/push-session.ts:60-70`
**Issue:**
- `unregisterThisDeviceBeforeSignOut` 은 3초 상한 · throw 없음이다. 오프라인 · 타임아웃 · 401 이면 그대로 로그아웃한다. 세션 만료로 `signOut()` 을 거치지 않고 `/login` 으로 튕기는 경로에서는 아예 불리지 않는다.
- 주석은 남은 행을 「토큰 인계 규칙 · 송신 410 정리가 지운다」 고 하지만 둘 다 이 경우를 덮지 못한다. 토큰 인계는 **다음 사용자가 이 기기에서 알림을 켤 때만** 일어난다. 410 은 앱이 설치돼 있는 한 오지 않는다.
- 시작 갱신(`refreshThisDeviceOnStart`)은 **지금 사용자**의 목록만 보므로 앞 사용자의 `enabled = true` 행을 알아채지 못한다.
- 결과적으로 다음 사용자가 알림을 켜지 않는 한 앞 사용자 계좌의 체결 · 거부 알림(종목 · 수량 · 금액)이 이 폰에 계속 뜬다. D-15 「같은 폰에 다른 계정이 로그인해도 앞 사람 체결이 안 간다」 를 위반한다.

**Fix:** 정리를 서버 쪽에서 닫는다.
- (a) 로그인 직후 앱이면 `deviceKey` + 현재 토큰으로 「이 토큰을 가진 다른 사용자 행 삭제」 RPC 를 부른다. 토큰은 권한 granted 일 때 `register()` 로 묻지 않고 받을 수 있다.
- (b) DELETE 가 실패하면 기기 키를 버리고(`localStorage.removeItem`) 다음 로그인 때 (a) 를 반드시 돌게 표시한다.
- (c) 최소한 실패 시 사용자에게 「다른 기기에서 이 기기를 지우세요」 안내를 띄운다.

## Info

### IN-01: 짝 대기 폴백이 자동매도(그룹 9) 주문의 접수 · 취소 푸시를 낼 수 있다

**File:** `supabase/migrations/20261107100100_dma_push_claim.sql:307-315` · `relay/src/push/notifier.ts:43, 406-422`
**Issue:**
- R9(그룹 9 → suppressed)는 kind 3/6 짝을 찾았을 때만 동작한다. 짝이 `PUSH_DEFER_MS`(1.5초) 안에 오지 않으면 폴백 호출이 `v_group = NULL` 로 `accepted` · `cancelled` 를 보낸다.
- 주기 매도(기본 3초) 재발주가 몰리는 순간 전략 기록기가 밀리면 D-22(자동매도 주문 자체는 보내지 않음)가 깨지고, 재발주마다 접수 푸시가 반복될 수 있다.

**Fix:** 폴백에서도 `v_root.origin = 'limit_chaser'` 이고 같은 계좌 · 종목에 「최근 kind 11 이후 kind 13 완료 전」 인 자동매도 구간이면 suppressed 로 본다. 또는 그 경우 폴백을 한 번 더 미룬다.

### IN-02: 네이티브에서 주문로그 창이 마운트 직후 한 번 버려지고 다시 마운트된다

**File:** `webapp/src/components/trading/order-log/order-log-route.tsx:21-29`
**Issue:** 첫 렌더는 `<OrderLogWindow />`, effect 뒤에는 `<AppShell><OrderLogWindow embedded /></AppShell>` 이다. 트리 위치가 달라 창이 언마운트 → 재마운트된다. 탭 착지마다 주문 · 이벤트 조회와 구독이 두 번 시작되고 셸 없는 화면이 한 번 번쩍인다.
**Fix:** 판정 전(`native === null`)에는 `null` 을 렌더하거나, `isNativeApp()` 을 `useSyncExternalStore` 로 읽어 첫 클라이언트 렌더부터 맞는 트리를 고른다.

### IN-03: 탭한 알림의 날짜가 오늘이 아니면 계좌 없이 열려 그 주문이 보이지 않는다

**File:** `webapp/src/lib/push/push-tap.ts:39, 69`
**Issue:** `needsOrders` 는 `date === today` 일 때만 참이다. 19:59 에 받은 알림을 자정 뒤에 탭하면 `account` 없이 주문로그가 열린다. 파일 머리 주석대로 계좌가 없으면 시세 이벤트만 보이므로, 탭해도 그 주문이 나오지 않는다.
**Fix:** 그 날짜 주문 조회(`/api/orders?date=`)가 있다면 지난 날짜에도 계좌를 찾는다. 없다면 계좌 칩 선택을 유도하는 빈 상태 문구를 띄운다.

### IN-04: APNs 비밀 두 개 중 하나만 갱신되면 짝이 맞지 않는 키 · Key ID 가 남는다

**File:** `scripts/setup-push-secrets.sh:113-126`
**Issue:** `gh-radar-apns-auth-key` 새 버전이 성공한 뒤 `gh-radar-apns-key-id` 추가가 실패하면 `return 1` 만 한다. 다음 배포의 relay 는 새 키 + 옛 Key ID 로 JWT 를 서명하고, 모든 iOS 송신이 403 `InvalidProviderToken` 이 된다. 배포 사전 점검은 버전 존재만 본다.
**Fix:** 두 번째 추가가 실패하면 첫 번째로 만든 버전을 `gcloud secrets versions disable` 로 되돌린다. 또는 Key ID 를 먼저 올린다(키 ID 만 바뀐 상태는 같은 실패지만 되돌리기가 단순하다). 결과 메시지에 「짝 불일치 — 다시 실행」 을 남긴다.

### IN-05: 시작 갱신 PUT 이 방금 다른 기기에서 끈 이 기기를 다시 켤 수 있다

**File:** `webapp/src/lib/push/push-session.ts:67-79`
**Issue:**
- `mine?.enabled` 확인과 `registerThisPushDevice` PUT 사이에는 `registerPushToken()`(최대 10초)이 끼어 있다.
- 서버의 `dma_push_device_upsert` 는 늘 `enabled = true` 로 덮는다(`20261107100000_dma_push_tables.sql:188`).
- 그 사이 PC 웹에서 이 기기를 끄면 앱의 PUT 이 다시 켠다.
**Fix:** 시작 갱신은 「토큰 갱신 전용」 RPC(행이 있고 enabled 일 때만 토큰 · last_seen_at 갱신, enabled 는 건드리지 않음)를 쓰게 분리한다.

### IN-06: Generality without instantiation — 플랫폼당 송신기 중복 제거 분기

**File:** `relay/src/push/notifier.ts:215`
**Category:** necessity
**Issue:** 생성자는 같은 플랫폼 송신기가 여럿이면 첫 것만 쓴다(`if (!this.#senderOf.has(s.platform))`). 유일한 생성 지점(`relay/src/index.ts` 「40-09」 블록)은 `ApnsSender` 0~1개 · `FcmSender` 0~1개만 넣으므로 중복 상태는 생기지 않는다. 다만 테스트 주입 경로까지 막혀 있는지는 판단의 문제라 Info 로 둔다.
**Fix:** 중복이 들어오면 조용히 버리지 말고 생성자에서 throw 해 계약으로 만든다. 아니면 분기를 걷고 `new Map(senders.map((s) => [s.platform, s]))` 한 줄로 둔다.

---

_Reviewed: 2026-11-09T01:45:11Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
