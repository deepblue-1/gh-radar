---
phase: 40-fill-push-notification
fixed_at: 2026-11-09T05:30:00Z
review_path: .planning/phases/40-fill-push-notification/40-REVIEW.md
iteration: 1
findings_in_scope: 13
fixed: 13
skipped: 0
status: all_fixed
---

# Phase 40: Code Review Fix Report

**Source review:** .planning/phases/40-fill-push-notification/40-REVIEW.md
**Iteration:** 1 · 범위 all(경고 7 · 참고 6)
**방식:** fixer 2개 병렬(전용 worktree) — A = DB 판정 RPC · relay · 스크립트(WR-01~05 · IN-01 · IN-04 · IN-06) · B = webapp · server · 기기 RPC(WR-06 · WR-07 · IN-02 · IN-03 · IN-05). master 위로 rebase 뒤 합본 — 아래 커밋 해시는 rebase 뒤 값.
**마이그레이션:** `20261109300000_dma_push_claim_review_fixes.sql`(A) · `20261109310000_dma_push_devices_review_fixes.sql`(B)
**부분 수정:** WR-06 — 끈 계좌 알림은 토스트 그대로(수정). relay 송신기 꺼짐(PUSH_NOTIFY=off · APNs 비밀 없음)은 server 가 알 길이 없어 남김(운영 비상 상황).

**합본 검증(메인 세션 · 합친 브랜치):** relay typecheck · vitest 65파일 2004 통과 · server typecheck · routes 655 통과(첫 실행 2건 실패 → 재실행 655/655, 기존 간헐 실패) · webapp typecheck · vitest src/lib · push · native · me · trading 139파일 4307 통과 · pgTAP dma_push_claim · dma_push_devices · dma_push_devices_review_fixes · dma_push_account_mutes · dma_journal_apply · dma_strategy_limit_feature 전부 PASS. relay `typecheck:tests` 4건 실패는 수정 전 기준 커밋에서도 동일(admin-api · admin-dispatcher 테스트 목 — 범위 밖).

## Fixed Issues

### WR-01: 판정 RPC 응답 유실 뒤 재시도가 그 묶음의 푸시를 영구히 잃는다

**Status:** fixed: requires human verification
**Files modified:** `supabase/migrations/20261109300000_dma_push_claim_review_fixes.sql`, `supabase/tests/dma_push_claim.test.sql`, `relay/src/push/notifier.ts`, `relay/tests/push-notifier.test.ts`
**Commit:** 02190bb7
**Applied fix:**
- `dma_push_log.claim_id uuid` 칸(부분 인덱스)과 `dma_push_claim` 새 인자 `p_claim_id uuid DEFAULT NULL` 을 추가했다. 옛 6 인자 함수는 DROP 했다(남겨 두면 6 인자 이름 호출이 PGRST203 으로 모호해진다). REVOKE PUBLIC/anon/authenticated · GRANT service_role 을 명시했다.
- 판정이 끝난 **뒤** 같은 `p_claim_id` 로 기록됐지만 `dma_push_deliveries` 가 없는 sent 로그를 지금 기기로 재구성해 `sends` 앞에 싣는다. 이번 호출이 방금 쓴 로그는 뺀다.
- 결정 메모 「판정 없이 재구성」 에서 한 가지를 바꿨다. 재생과 함께 판정도 다시 돌린다. 판정을 건너뛰면 첫 호출의 `deferred`(짝 대기)를 잃는다. 다시 돌려도 이미 기록된 체인은 단조 upsert 가 막아 중복은 없다.
- 판정 뒤에 읽는 이유: 첫 호출이 아직 커밋 중인데 3초 상한(WR-03)으로 끊겨 재시도가 겹치면, 체인 upsert 가 그 커밋을 기다린다. 그 뒤 새 스냅샷에서 로그를 읽는다.
- 받는 기기 조회는 내부 함수 `dma_push_claim_devices(text, jsonb, text[])` 하나로 뺐다(끈 계좌 NOT EXISTS 그대로 · service_role 전용). 판정 경로와 재생 경로가 같은 조건을 쓴다.
- relay 는 묶음마다 `randomUUID()` 를 쓰고 재시도에는 같은 키를 넘긴다. 옛 DB 가 PGRST202 를 주면 새 인자를 빼고 바로 다시 부른다(경고 1회 · 재시도 횟수에 안 셈).
- pgTAP 21절에 단언 11개를 더했다: 같은 키 재생 · 로그 1행 · 다른/없는 키 0 · 전달 뒤 0 · 재생+새 단계 순서 · 오버로드 1개 · 권한 2. vitest 2건을 더했다: 키 재사용 · PGRST202 하위 호환.

### WR-02: 종료 때 정착 큐 · 판정을 마친 송신이 버려진다 — 커서가 이미 전진해 재기동이 되살리지 못한다

**Files modified:** `relay/src/push/notifier.ts`, `relay/src/index.ts`, `relay/tests/push-notifier.test.ts`
**Commit:** 31dbc3af
**Applied fix:**
- `PushNotifier.drain(timeoutMs): Promise<boolean>` 를 추가했다. 정착 타이머를 바로 flush 하고, 짝 대기 재호출 타이머는 당겨서 폴백 허용으로 바로 실행한다. 진행 중인 묶음(`#inflight`)은 상한 안에서 기다린다.
- drain 중에 들어온 행도 정착 없이 바로 판정한다. 시간 초과면 false 를 돌려주고 warn 1줄을 남긴다.
- `shutdown` 은 `pipelines.drainAll` → `closeAll` 직후 `await pushNotifier.drain(PUSH_DRAIN_TIMEOUT_MS = 1_500)` 를 하고 그다음 `close()` 한다. 기록기 drain 2초와 합쳐도 5초 데드맨 안이다.
- vitest 4건: 즉시 판정 · 짝 대기 당김 · 비행 중 이어 판정 · 시간 초과 false.

### WR-03: 판정 RPC · 송신에 시간 상한이 없어 게이트웨이 큐가 멈춘다(SC-1 「3초 안 도착」 위협)

**Files modified:** `relay/src/push/notifier.ts`, `relay/tests/push-notifier.test.ts`
**Commit:** 93e59c99
**Applied fix:**
- 판정 · 보고 RPC 를 `#rpc()` 하나로 모았다. `AbortController` + 3초 타이머(`PUSH_RPC_TIMEOUT_MS`)를 `rpc(...).abortSignal(signal)` 에 건다.
- 타이머는 `AbortSignal.timeout` 대신 직접 만들었다. 끝나면 해제되고 가짜 시계 테스트로 확인할 수 있다. 끊긴 판정은 같은 `p_claim_id` 로 1회 재시도한다(WR-01 이 회수).
- `#deliver` 는 send 마다 문안을 한 번 만든 뒤 플랫폼별 줄로 나눠 `Promise.all` 로 돌린다. 줄 안은 순차이고 `stopRun` 은 그 줄만 멈춘다. 보고 순서는 플랫폼이 처음 나온 순서다.
- 테스트의 가짜 supabase 를 빌더 모양(`rpc().abortSignal()`)으로 바꿨다. vitest 2건: 3초 끊김 → 같은 키 재시도 · iOS 가 걸려도 Android 는 즉시.

### WR-04: FCM 404 · `NOT_FOUND` 를 무조건 토큰 폐기로 분류 — 프로젝트 설정 오류 하나로 Android 기기 행이 전부 지워진다

**Files modified:** `relay/src/push/fcm.ts`, `relay/tests/push-fcm.test.ts`
**Commit:** 7ccefe05
**Applied fix:**
- `fcmErrorCodeOf` 를 `fcmErrorOf` 로 바꿨다. FcmError `errorCode` 와 Google `error.status` 를 따로 돌려준다.
- `classifyFcmResponse(status, errorCode, googleStatus)` 는 `errorCode === "UNREGISTERED"` 일 때만 `token_removed` 로 분류한다. 그 밖의 404 · NOT_FOUND 는 `failed` 이고 기기를 지우지 않는다. 송신 로그는 error 「FCM 404(UNREGISTERED 아님) — 프로젝트 · 송신 URL 확인」 이다.
- `probe()` 에서 FcmError 없는 404 는 warn 으로 올린다. 404 UNREGISTERED 는 지금처럼 info 다.
- vitest 3건을 더하고, 옛 「404 → token_removed」 단언을 반대로 고쳤다.

### WR-05: 자동매도 완료의 평균가 · 손익이 두 기록기 순서 경합에 놓여 있다(단발 rank 3 라 다시 계산되지 않는다)

**Status:** fixed: requires human verification
**Files modified:** `supabase/migrations/20261109300000_dma_push_claim_review_fixes.sql`, `supabase/tests/dma_push_claim.test.sql`, `relay/src/push/notifier.ts`, `relay/tests/push-notifier.test.ts`
**Commit:** 5f2c6eff
**Applied fix:**
- kind 13 완료에서 다음을 모두 만족하면 그 사건을 기록 없이 `deferred_strategy [{journal_epoch, seq}]` 로 돌린다.
  - 창 안 매도 E 합(`coalesce(v_s_qty, 0)`)이 `v_sev.qty` 보다 작다
  - 당일 · 비폴백 호출이다
  - `p_defer_strategy` 가 true 다
- 리뷰 Fix 와 다른 점은 새 인자 `p_defer_strategy boolean DEFAULT false` 로 미루는 동작을 켠다는 것이다. 옛 relay 는 `deferred` 에 섞인 객체를 버리므로, 그대로 미루면 그 완료 푸시가 영영 나가지 않는다. 그래서 새 relay 만 켜고, 옛 relay 와 폴백 호출은 지금처럼 있는 값으로 보낸다.
- 반환의 새 키 `deferred_strategy` 를 따로 두어 `deferred` 는 uuid 문자열 배열 그대로 둔다.
- relay 는 늘 `p_defer_strategy: true` 를 넘긴다. `deferred_strategy` 를 짝 대기 재호출(폴백)에 전략 항목으로 싣는다(지금까지는 전략 항목을 싣지 않았다). PGRST202 폴백 때는 이 인자도 함께 뺀다.
- pgTAP 22절 8개: 미룸 · 체인 0 · 마지막 체결 뒤 전체 평균 3106 · 폴백은 있는 값 · 6 인자 옛 호출은 바로 보냄. vitest 1건: deferred_strategy → 1.5초 뒤 전략 항목 폴백 1회.

### IN-01: 짝 대기 폴백이 자동매도(그룹 9) 주문의 접수 · 취소 푸시를 낼 수 있다

**Status:** fixed: requires human verification
**Files modified:** `supabase/migrations/20261109300000_dma_push_claim_review_fixes.sql`, `supabase/tests/dma_push_claim.test.sql`
**Commit:** 8fab7cfd
**Applied fix:**
- R12 에 분기를 하나 더했다. 아래를 모두 만족하면 `suppressed` 다.
  - 폴백 호출이고 구분 짝이 없다
  - `v_root.origin = 'limit_chaser'` 이고 매도(`side = 'S'`)다
  - 같은 계좌 · 종목에서 주문 시각(`created_at` = 게이트웨이 시각) 기준 최근 kind 11 이 있다
  - 그 kind 11 뒤 주문 시각까지 kind 13 완료(cond_actual 4 ∧ cond_threshold ≠ 4)가 없다
- 매수는 자동매도 주문이 아니라 대상에서 뺐다.
- pgTAP 23절 4개: 구간 안 매도 억제 · 로그 suppressed · 구간 안 매수는 보냄 · 완료 뒤 매도는 보냄.

### IN-04: APNs 비밀 두 개 중 하나만 갱신되면 짝이 맞지 않는 키 · Key ID 가 남는다

**Files modified:** `scripts/setup-push-secrets.sh`
**Commit:** 444c8f79
**Applied fix:**
- 키 비밀 추가 때 `--format='value(name)'` 으로 버전 번호를 잡아 둔다. 버전 번호는 값이 아니다.
- Key ID 추가가 실패하면 `gcloud secrets versions disable <N> --secret=gh-radar-apns-auth-key` 로 되돌린다. 메시지는 셋으로 나눴다: 되돌림 성공 · 키가 안 바뀜 · 되돌리기 실패(「짝 불일치 … 다시 실행」).
- 값 · Key ID 는 여전히 출력하지 않는다. 스크립트는 실행하지 않았고 `bash -n` 만 통과했다. shellcheck 은 이 기기에 없다.

### IN-06: Generality without instantiation — 플랫폼당 송신기 중복 제거 분기

**Status:** fixed: requires human verification (necessity — 코드 제거)
**Files modified:** `relay/src/push/notifier.ts`
**Commit:** 32989dea
**Applied fix:** 생성자 중복 제거 분기를 걷고 `this.#senderOf = new Map(deps.senders.map((s) => [s.platform, s]))` 한 줄로 바꿨다. 필드도 `ReadonlyMap` 으로 고정했다.

### WR-06: 토스트 숨김이 「배너가 실제로 온다」 를 확인하지 않는다 — 끈 계좌 · 송신기 꺼짐 · 비상 끄기에서 알림 공백

**Files modified:** `webapp/src/lib/push/toast-suppression.ts`, `webapp/src/lib/use-trading-alerts.ts`, `webapp/src/components/trading/workbench/trading-workbench.tsx`, `webapp/src/lib/__tests__/use-trading-alerts.test.tsx`
**Commit:** 7c71037b
**Status:** fixed (부분 수정 — 끈 계좌만)
**Applied fix:**
- `useOrderToastSuppression()` 이 boolean 대신 `(alert) => boolean` 판정을 돌려준다. `useTradingAlerts` 의 `suppressOrderToasts` 도 같은 판정 함수다.
- 기기 조건 넷(앱 · 플러그인 · 권한 granted · 이 기기 켜짐)이 참이어도, 그 알림 계좌가 「받을 계좌」 에서 꺼져 있으면(quick-261109-dz1 끈 계좌 목록) 숨기지 않는다.
- 끈 계좌 목록을 아직 못 읽었거나, 계좌를 모르는 알림(주문번호 색인 미스)은 「모르면 보인다」 로 처리한다.
- 화면이 다시 보일 때 60초보다 낡은 기기 목록 · 끈 계좌 목록을 다시 읽는다(PC 에서 바꾼 계좌 끄기를 따라간다).
**남은 것:** relay 송신기 꺼짐(`PUSH_NOTIFY=off` 비상 끄기 · APNs 비밀 없음)은 server 가 알 수 없어 이번에 넣지 않았다. 운영 비상 상황이라 남긴다.

### WR-07: 로그아웃 정리(DELETE)가 실패하면 앞 사용자 체결이 같은 폰의 다음 사용자에게 계속 간다

**Files modified:** `supabase/migrations/20261109310000_dma_push_devices_review_fixes.sql`(신규), `supabase/tests/dma_push_devices_review_fixes.test.sql`(신규), `packages/shared/src/push.ts`, `server/src/routes/push-devices.ts`, `server/src/schemas/push-devices.ts`, `server/src/services/push-devices.ts`, `server/tests/routes/push-devices.test.ts`, `webapp/src/lib/push/device-key.ts`, `webapp/src/lib/push/push-devices-api.ts`, `webapp/src/lib/push/push-session.ts`, `webapp/src/lib/auth-context.tsx`, `webapp/src/lib/push/__tests__/push-session.test.ts`, `webapp/src/lib/push/__tests__/native-push.test.ts`
**Commit:** 293fda09
**Status:** fixed: requires human verification (DB 삭제 조건 · 정리 시점 판정이 로직 변경)
**Applied fix:**
- (a) 새 RPC `dma_push_device_handover(p_user_id, p_token, p_device_key) → integer`.
  - 지우는 행 = 토큰이 같거나 기기 키가 같은 행 중 「지금 사용자 ∧ 지금 기기 키」 가 아닌 행.
  - 기기 키가 NULL 이면 같은 토큰의 내 옛 행도 지운다(성공한 로그아웃 DELETE 와 같은 결과).
  - 빈 토큰은 예외(22004). SECURITY INVOKER, REVOKE PUBLIC · anon · authenticated, GRANT service_role.
- server 에 `POST /api/push-devices/handover` `{token, deviceKey|null}` → `{ok, removed}` 를 추가했다(strict zod · 토큰은 로그와 응답에서 가림).
- 앱 로그인은 하드 이동이라 로그인 직후 첫 페이지 로드가 곧 시작 처리다. 이 시점에 다음 두 조건 중 하나라도 맞으면 정리를 돈다.
  - 지금 supabase 세션 사용자가 이 폰에서 정리를 마친 사용자(localStorage `gh-radar:push-handover-user`)가 아니다.
  - 실패 표시(`gh-radar:push-handover-pending`)가 있다.
- 정리는 권한이 granted 일 때만, 권한을 묻지 않고 받은 토큰으로 부른다. 성공하면 기록하고, 실패하거나 권한이 없으면 다음 실행에서 다시 한다. 로그아웃 상태(/login)에서는 부르지 않는다.
- (b) 로그아웃 DELETE 가 실패하면(시간 초과 · 오프라인 · 401 · 404 제외) 기기 키를 버리고(`discardPushDeviceKey`) 실패 표시를 남긴다. 다음 로그인 정리가 반드시 돈다.
- 세션 만료로 `signOut()` 없이 /login 으로 튕긴 경우도 덮인다. 다른 사용자가 로그인하면 사용자 id 비교로 정리가 돈다.

### IN-02: 네이티브에서 주문로그 창이 마운트 직후 한 번 버려지고 다시 마운트된다

**Files modified:** `webapp/src/components/trading/order-log/order-log-route.tsx`, `webapp/src/components/trading/order-log/__tests__/order-log-route.test.tsx`(신규)
**Commit:** 98d91bc0
**Applied fix:**
- `isNativeApp()` 을 `useSyncExternalStore` 로 읽는다. 서버 · 하이드레이션 스냅숏은 null 이라 빈 렌더가 된다.
- 알림 탭의 클라이언트 이동은 첫 렌더부터 셸 안 창을 그린다. 새로 고침이나 냉시작 착지는 판정 뒤 창을 한 번만 마운트한다.
- 테스트(클라이언트 이동 · `hydrateRoot` · 브라우저)가 창 조회 1회를 잠근다. 옛 코드에서는 2건이 실패하는 것을 확인했다.
- 대가: 브라우저 창 분리 페이지도 SSR HTML 이 비어, 하이드레이션 전 첫 페인트가 빈 화면이다. Suspense 폴백도 원래 null 이고 본문은 클라이언트 조회라 체감 차이는 작다.

### IN-03: 탭한 알림의 날짜가 오늘이 아니면 계좌 없이 열려 그 주문이 보이지 않는다

**Files modified:** `webapp/src/lib/orders-api.ts`, `webapp/src/lib/push/push-tap.ts`, `webapp/src/lib/push/push-session.ts`, `webapp/src/lib/push/__tests__/push-tap.test.ts`
**Commit:** 50776f20
**Status:** fixed: requires human verification (계좌 해석 조건 변경)
**Applied fix:**
- server 에 이미 `GET /api/orders?date=YYYY-MM-DD`(같은 RPC)가 있어서 이를 쓰는 `fetchOrdersOfDate` 를 추가했다. server 변경은 없다.
- 탭 착지에서 종목이 정해져 있으면 날짜와 상관없이 그 날짜 주문을 읽는다(`needsOrders` 의 오늘 조건을 없앴다). 그중 그 종목의 가장 최근 계좌를 붙인다(`tradeDate === query.date`).
- 빈 상태 안내 문구는 필요 없어져 넣지 않았다.

### IN-05: 시작 갱신 PUT 이 방금 다른 기기에서 끈 이 기기를 다시 켤 수 있다

**Files modified:** `supabase/migrations/20261109310000_dma_push_devices_review_fixes.sql`, `supabase/tests/dma_push_devices_review_fixes.test.sql`, `server/src/routes/push-devices.ts`, `server/src/services/push-devices.ts`, `server/tests/routes/push-devices.test.ts`, `webapp/src/lib/push/push-devices-api.ts`, `webapp/src/lib/push/push-session.ts`, `webapp/src/lib/push/__tests__/push-session.test.ts`
**Commit:** db65b853
**Applied fix:**
- 새 RPC `dma_push_device_refresh_token(p_user_id, p_device_key, p_platform, p_token, p_label) → jsonb|NULL`.
  - 그 행이 있고 enabled 일 때만 `FOR UPDATE` 로 잠근 뒤 토큰 · 플랫폼 · 이름 · last_seen_at 을 갱신한다. enabled 는 건드리지 않는다.
  - 같은 토큰의 다른 행은 갱신할 행이 있을 때만 지운다. 꺼졌거나 없거나 남의 키면 NULL.
  - 권한은 service_role 전용이다.
- server 에 `POST /api/push-devices/:deviceKey/refresh` 를 추가했다(PUT 과 같은 body). 결과가 NULL 이면 404 다.
- 앱 시작 갱신은 이제 켜기 PUT 대신 이 엔드포인트를 부른다. 404 는 정상으로 보고 warn 없이 목록만 다시 읽는다.

### 추가 발견: 알림 탭 착지에서 종목 필터가 「종목 전체」 로 보이거나 빠지는 경로

**Files modified:** `webapp/src/components/trading/order-log/order-log-window.tsx`, `webapp/src/components/trading/order-log/__tests__/order-log-window.test.tsx`
**Commit:** 29f9c95e
**Status:** fixed: requires human verification (상태 동기화 로직)

점검한 경로:
- 첫 렌더 `useSearchParams`: 정상이다. 창이 첫 렌더 쿼리로 `filters.stock` 을 세운다.
- IN-02 재마운트: 두 번 마운트 모두 같은 URL 을 읽어 stock 은 유지됐다. 조회만 두 번 돌았다(IN-02 에서 고쳤다).
- `router.push` 타이밍: 냉시작 · 다른 화면에서의 탭은 새로 마운트되므로 정상이다.

실제로 빠지던 경로 두 가지를 고쳤다.
1. **스샷의 「종목 전체」.** 고른 종목이 그날 범위 행에 없으면 종목 `<select>` 에 맞는 option 이 없다. 이런 경우는 다음과 같다.
   - 오늘 주문 조회가 3초 넘게 걸려 계좌 없이 열렸다(오늘 장중 8~70초 조회 지연 때 실제로 그랬다).
   - 조회가 실패했다.
   - 다른 계좌의 주문이다.

   그러면 브라우저가 첫 option 「전체」 를 보여 주는데, 목록은 그 종목으로 걸러져 비어 있었다. 필터는 걸렸는데 칩은 「전체」 로 보여 사용자를 속였다. 고른 종목을 option 에 넣어(이름은 종목 마스터, 없으면 ISIN) 칩이 그 종목을 보이게 했다.
2. **창이 떠 있는 채 다음 알림을 탭할 때.** `router.push` 가 같은 라우트의 쿼리만 바꿔 재마운트가 없다. 창은 첫 렌더 쿼리만 읽으므로 두 번째 알림의 종목 · 계좌 · 날짜가 무시됐다. 이제 창이 직접 쓴(`router.replace`) 정본 쿼리 목록에 없는 쿼리가 오면, 그 쿼리로 상태를 다시 세운다. 자기 replace 가 늦게 돌아와도 되돌리지 않는다는 것을 테스트로 잠갔다. 옛 코드에서 2건이 실패하는 것을 확인했다.

## A — 검증 · 배포 순서

## Verification

검증은 모두 **이 전용 worktree**(`/Users/alex/repos/gh-radar-p40fix-a` · 의존성 설치됨)에서 돌렸다. 메인 체크아웃에서 다시 돌리면 같은 결과가 나와야 한다.

- `pnpm --filter @gh-radar/shared build` — OK
- `pnpm --filter @gh-radar/relay run typecheck` — OK
- `pnpm --filter @gh-radar/relay run typecheck:tests` — **실패하지만 이번 수정과 무관하다.** 오류 4건(`tests/admin-api.test.ts` 3 · `tests/admin-dispatcher.test.ts` 1)은 기준 커밋 74fe1846 에서 수정 전에도 똑같이 났다. 이번에 손댄 파일에서는 0건이다.
- `pnpm --filter @gh-radar/relay exec vitest run --maxWorkers=2` — 65 files · 2004 tests PASS
- pgTAP(`bash scripts/verify-dma-orders-price-check.sh --test …` · 마이그레이션 122개 재생):
  - `dma_push_claim` 113/113
  - `dma_push_account_mutes` 29/29
  - `dma_push_devices` 48/48
  - `dma_journal_apply` 96/96
- `bash scripts/deploy-relay.sh --self-test` — 12 cases OK

## 배포 순서 주의

- **권장 순서는 DB 먼저(`supabase db push --linked --yes`), 그다음 relay 배포다.** 어느 순서로 해도 깨지지는 않는다.
  - DB 먼저: 옛 relay 는 6 인자 이름 호출이라 새 함수의 기본값(NULL · false)으로 이전과 똑같이 동작한다.
  - relay 먼저: 새 relay 가 PGRST202 를 받아 새 인자를 빼고 다시 부른다(경고 1회). 판정마다 왕복이 1번 늘고, DB 를 올리기 전까지 WR-01 재생 · WR-05 미룸은 꺼져 있다.
- WR-02 · WR-03 · WR-04 · IN-06 은 relay 만 바뀐다. IN-04 는 스크립트만 바뀌고 배포가 필요 없다.
- B fixer 가 `20261109310000_*` 을 쓰면 이 파일(`20261109300000`) 뒤에 적용된다. B 쪽이 `dma_push_claim` 을 다시 정의한다면 8 인자 시그니처와 `dma_push_claim_devices` 를 기준으로 해야 한다.

---

_Fixed: 2026-11-09T03:45:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

## B — 검증 · 배포 표면

## 검증 (전부 worktree `/Users/alex/repos/gh-radar-p40fix-b` 에서 실행)

- `pnpm --filter @gh-radar/shared build`: 성공
- server `typecheck` 통과 · `vitest run tests/routes --maxWorkers=2`: 27 files / 655 tests 통과
- webapp `typecheck` 통과(e2e tsconfig 포함) · `vitest run src/lib/push src/lib/native src/components/me src/lib/__tests__/use-trading-alerts.test.tsx src/components/trading --maxWorkers=2`: 58 files / 2333 tests 통과
- pgTAP(로컬 일회용 컨테이너 · 122 마이그레이션 재생)
  - `supabase/tests/dma_push_devices_review_fixes.test.sql`: 26/26 PASS (새 RPC 2개 · 권한 (f,f,t) · 회귀 단언)
  - `supabase/tests/dma_push_devices.test.sql`: 48/48 PASS (회귀)

## 배포 표면

- **DB:** 필요. `supabase/migrations/20261109310000_dma_push_devices_review_fixes.sql`(새 함수 2개만 · 표와 기존 RPC 변경 없음). server 보다 먼저 적용해야 한다.
- **server:** 필요. 새 라우트 `POST /api/push-devices/handover` · `POST /api/push-devices/:deviceKey/refresh`.
  - 웹이 먼저 나가고 server 가 늦으면 시작 정리 · 갱신은 404 · 실패 warn 만 남기고 탭 처리를 막지 않는다.
  - 그래도 시작 갱신이 404 를 「꺼짐」 으로 보고 토큰을 갱신하지 못하므로, 순서는 **DB → server → webapp(push)** 로 한다.
- **webapp:** 필요(push 로 배포). WR-06 · WR-07 · IN-02 · IN-03 · IN-05 · 추가 발견이 모두 웹 코드다. 앱 재빌드는 필요 없다(네이티브 변경 없음).
- relay: 변경 없음.

---

_Fixed: 2026-11-09T04:10:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
