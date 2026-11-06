# Phase 40: 체결 앱 푸시 알림 - Pattern Map

**Mapped:** 2026-11-06
**Files analyzed:** 27 (신규 17 · 수정 10)
**Analogs found:** 25 / 27

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/2026110xxxxxxx_dma_push.sql` (표 `dma_push_devices`·`dma_push_chains`·`dma_push_log` + RPC `dma_push_claim`·`dma_push_report`·기기 RPC) | migration | CRUD + batch 판정 | `supabase/migrations/20261004090100_dma_journal_apply_skipped_rows.sql` (RPC) · `20260929180000_dma_strategy_events.sql` (표·권한) · `20261007200100_dma_visibility_v2.sql` (뷰 권한) | exact |
| `supabase/tests/dma_push_claim.test.sql` | test (pgTAP) | batch | `supabase/tests/dma_journal_apply.test.sql` | exact |
| `packages/shared/src/push-message.ts` (+ `index.ts` 재수출) | utility (순수 문안) | transform | `packages/shared/src/strategy-event-text.ts` · `lc-amount.ts` | exact |
| `packages/shared/src/__tests__/push-message.test.ts` | test | transform | `packages/shared/src/__tests__/strategy-event-text.test.ts` | exact |
| `relay/src/push/notifier.ts` | service | event-driven (applied 리스너 → 큐 → RPC) | `relay/src/ws/fanout.ts` `deliverJournalRows` · `relay/src/journal/writer.ts` | role-match |
| `relay/src/push/apns.ts` | service | request-response (http2) | 없음(코드베이스에 http2 클라이언트 없음) — RESEARCH Code Examples | no analog |
| `relay/src/push/fcm.ts` | service | request-response (fetch + 메타데이터 토큰) | `scripts/deploy-relay.sh:725-737` (메타데이터 토큰 경로만) | partial |
| `relay/src/access/app-access.ts` (수정: `userIdsOf(dma)`) | service | CRUD(캐시) | 같은 파일 `reverseIndex` | exact |
| `relay/src/index.ts` (수정: `wirePipeline` 리스너 2줄) | config/wiring | event-driven | 같은 파일 500-508 | exact |
| `relay/tests/push-notifier.test.ts` · `push-apns.test.ts` · `push-fcm.test.ts` | test | event-driven | `relay/tests/journal-writer.test.ts` | role-match |
| `server/src/routes/push-devices.ts` | route | CRUD | `server/src/routes/strategy-events.ts` | exact |
| `server/src/schemas/push-devices.ts` | utility(zod) | validation | `server/src/schemas/orders.ts` | exact |
| `server/src/app.ts` (수정: `app.use("/api/push-devices", …)`) | config | — | 같은 파일 125-133 | exact |
| `server/src/routes/__tests__/push-devices.route.test.ts` | test | CRUD | `server/src/routes/__tests__/chat.route.test.ts` | exact |
| `webapp/src/lib/push/*.ts` (네이티브 래퍼 · 기기 키 · 상태 훅 · 탭 처리) | utility/hook | event-driven | `webapp/src/lib/native/native-google-login.ts` (nativePromise) · `native-bridge-provider.tsx` (`navigate`) | role-match |
| `webapp/src/lib/push/__tests__/*.test.ts` | test | — | `webapp/src/lib/native/__tests__/native-google-login.test.ts` · `post-native.test.ts` | exact |
| `webapp/src/components/me/push-devices-card.tsx` (+ `__tests__`) | component | CRUD | `webapp/src/components/me/device-settings-card.tsx` | exact |
| `webapp/src/components/me/me-client.tsx` (수정: 카드 배치) | component | — | 같은 파일 | exact |
| `webapp/src/lib/native/post-native.ts` (수정: `'openSettings'`) | utility | — | 같은 파일 14행 | exact |
| `webapp/src/components/trading/workbench/alert-toasts.tsx` · `lib/trading-alerts.ts` (수정: 주문 토스트 숨김) | component | event-driven | 같은 파일 (`kind` 구분 — `breakout` 유지) | exact |
| `webapp/src/components/trading/order-log/order-log-window.tsx` · `lib/order-log-feed.ts` (탭 착지 `account` 해석) | component | request-response | 같은 파일 `parseOrderLogQuery` | exact |
| `mobile/capacitor.config.ts` (수정: `PushNotifications.presentationOptions`) | config | — | 같은 파일 `plugins.SystemBars`·`SocialLogin` | exact |
| `mobile/ios/App/App/App.entitlements` (신규) · `AppDelegate.swift` (2 메서드) | config | — | 없음(엔타이틀먼트 첫 도입) — 플러그인 README | no analog |
| `mobile/ios/App/App/GHTradeBridgeViewController.swift` · `mobile/android/app/src/main/java/com/ghtrade/app/GhTradeBridge.kt` (수정: `openSettings`) | config/bridge | request-response | 같은 파일 화이트리스트 | exact |
| `mobile/android/app/build.gradle` · `variables.gradle` (수정) | config | — | 같은 파일 81-88 | exact |
| `mobile/scripts/check-release-hygiene.sh` (2)(3)(8) · `mobile/.gitignore` | config/script | — | 같은 파일 54-69 · `.gitignore` 41-42 | exact |
| `scripts/setup-relay-iam.sh` (수정: FCM 역할 · APNs .p8 Secret) | script | — | 같은 파일 172-200 | exact |

## Pattern Assignments

### `supabase/migrations/2026110xxxxxxx_dma_push.sql` (migration, CRUD + 판정)

**Analog (RPC):** `supabase/migrations/20261004090100_dma_journal_apply_skipped_rows.sql`

RPC 머리 (31-37행) — `SECURITY INVOKER` · `search_path` 고정 · 한 트랜잭션:
```sql
BEGIN;

CREATE OR REPLACE FUNCTION public.dma_journal_apply(p_gateway text, p_epoch text, p_events jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
```
권한 3줄 (177-179행) — 새 RPC 마다 그대로 복제(메모리 「Supabase RPC 는 REVOKE anon/authenticated 명시」):
```sql
REVOKE EXECUTE ON FUNCTION public.dma_journal_apply(text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_journal_apply(text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_journal_apply(text, text, jsonb) TO service_role;
```
헤더 주석에 「되돌리기(수동)」 절을 둔다(26행 관례).

**Analog (표):** `supabase/migrations/20260929180000_dma_strategy_events.sql` 108-111행 — 새 표 3개 모두 RLS 켜고 정책 0개 + 명시 REVOKE:
```sql
ALTER TABLE public.dma_strategy_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_strategy_events FROM PUBLIC;
REVOKE ALL ON public.dma_strategy_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_strategy_events TO service_role;
```
부분 유일 색인 관례: `idx_dma_strategy_events_order (gateway, trade_date, account_no, order_no) WHERE order_no <> ''` (98-100행) — 구분 짝 조회(RESEARCH Pattern 5)에 그대로 쓴다. 상태 격자(accepted=1 · partially_filled=2 · 종결=3)는 `20260924200100_dma_journal_rpcs.sql:58-91` 의 `CASE` 를 재사용(RESEARCH Pattern 3).

**멱등 핵심(RESEARCH Pattern 2):** `dma_push_chains` 에 `INSERT … ON CONFLICT DO UPDATE … WHERE sent_rank < EXCLUDED.sent_rank RETURNING` — RETURNING 행이 있을 때만 송신 권리.

**주의:** `dma_journal_apply` 는 건드리지 않는다(SC-3).

---

### `supabase/tests/dma_push_claim.test.sql` (pgTAP)

**Analog:** `supabase/tests/dma_journal_apply.test.sql`

머리 주석(1-25행): 「잠그는 것」 목록 + 실행 명령 `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_push_claim.test.sql` + 「전체 한 트랜잭션 · 끝에서 ROLLBACK」.
본문 시작(30-38행):
```sql
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

-- ── 픽스처 ──────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000001901', 'journal-u1@example.invalid'),
```
- 단언 설명에 `(seq, 계좌 말미, 기대값)` 튜플을 적는 관례(26행).
- 권한 단언은 25절 관례 그대로: `(anon, authenticated, service_role) = (f, f, t)`.
- UUID 대역은 새로 잡는다(예 `…0000040xx`) — 기존 테스트와 겹치지 않게. 픽스처: 금양그린파워 3,120 × 500주(200/150/150).

---

### `packages/shared/src/push-message.ts` (utility, transform)

**Analog:** `packages/shared/src/strategy-event-text.ts`

- 머리 JSDoc 이 「조립은 여기 한 곳」 · 표시명은 labels 표에서만 · 서버 문자열(`message`)은 원문 그대로 · **KST 고정**을 선언한다(1-31행). 같은 형식으로 D-16 · 스케치 029 C 안 · 계좌번호 없음을 선언.
- import 관례(32-40행):
```typescript
import { formatQtyAmt, qtyAmt } from "./lc-amount";
import { isMarketStrategyEvent, type StrategyEventRow } from "./strategy-event";
import { AUTO_SELL_PAUSE_LABELS, autoSellBasisLabel, autoSellStateLabel, ... } from "./strategy-event-labels";
```
- 재사용: `amountFromQty`(lc-amount.ts:42) · `formatQtyAmt` · `ORDER_GROUP_LABELS` · `CANCEL_REASON_LABELS`(strategy-event-labels.ts:46-56 · 98-111) · `kstDateIso`(krxCalendar.ts:53). 새 낱말 표 금지(RESEARCH Don't Hand-Roll).
- 확장자 없는 상대 import(`./lc-amount`) — shared 패키지 관례. `index.ts` 에 재수출 추가.

### `packages/shared/src/__tests__/push-message.test.ts`

**Analog:** `packages/shared/src/__tests__/strategy-event-text.test.ts` — 골든 문자열 단언 형식. 7종 사건 × 스케치 029 `index.html:97-121` 문안.

---

### `relay/src/push/notifier.ts` (service, event-driven)

**Analog:** `relay/src/index.ts` `wirePipeline` (500-508행) + `relay/src/journal/writer.ts` (640-648행)

연결 지점 — 기존 fanout 줄 **뒤에** 붙인다:
```typescript
function wirePipeline(p: ServerPipeline): void {
  p.writer.on("applied", (rows) => fanout.deliverJournalRows(rows, { access: p.access, identities: appAccess }));
  p.strategyWriter.on("applied", (rows) => fanout.deliverStrategyEvents(rows, { access: p.access, identities: appAccess }));
  // ← 여기: p.writer.on("applied", (rows) => pushNotifier.enqueueOrders(p, rows)); 등
```
writer 의 emit 은 한 try/catch 로만 감싼다 — 리스너 하나가 throw 하면 뒤 리스너가 안 불린다:
```typescript
    try {
      this.emit("applied", rows);
    } catch (err) {
      logger.error(
        { gateway: this.#gateway, stream: this.#stream.name, err: String(err), rows: rows.length },
        "[journal] applied 리스너 예외 — 적용은 이미 확정됐다",
      );
    }
```
→ notifier 의 `enqueue*` 는 동기 · 자기 try/catch · `logger.error({ gateway, err: String(err) }, "[push] …")` 형식(RESEARCH Pattern 1 스켈레톤). 로그 키 `gateway` · `err: String(err)` · 접두 `[push]` 는 writer 관례 그대로.

수신자 해석은 fanout `#extraGatewayAccounts`(fanout.ts:3368-3373)의 `identities.dmaUserIdOf` → `access.accountsOf(dma)` 규칙을 역방향으로(RESEARCH Pattern 4).

### `relay/src/access/app-access.ts` (수정: `userIdsOf`)

**Analog:** 같은 파일 `reverseIndex` (80-84행) — 첫 행만 넣는 구조라 D-06 를 못 채운다:
```typescript
function reverseIndex(map: ReadonlyMap<string, AppAccessEntry>): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of map.values()) if (isDmaGranted(e) && !out.has(e.dmaUserId)) out.set(e.dmaUserId, e.userId);
  ...
```
→ 같은 재적재 시점에 `Map<string, string[]>` 를 `isDmaGranted(e)` 행만으로 함께 만든다. `AppAccess` 인터페이스에 `userIdsOf(dma): string[]` 추가.

### `relay/src/push/fcm.ts` (partial)

메타데이터 토큰 경로는 `scripts/deploy-relay.sh:725-737` 와 같은 URL(`Metadata-Flavor: Google`). 송신·응답 분류는 RESEARCH Code Examples「FCM v1 송신」 스켈레톤. VM 스코프는 이미 `--scopes=cloud-platform` (setup-relay-iam.sh:382).

### `relay/tests/push-*.test.ts`

**Analog:** `relay/tests/journal-writer.test.ts`

- import 관례(8-24행): `vitest` · `SupabaseClient` 타입 · `../src/...js` 확장자 포함 import · `./helpers/frames.js`.
- 가짜 supabase 는 `rpc` 하나만 가진 객체 + `calls` 기록 + 스크립트 단계(`"ok" | "error" | "throw" | "hold"`) (60-85행):
```typescript
  const supabase = {
    rpc: async (fn: string, args: RpcCall["args"]) => {
      calls.push({ fn, args: { ...args, p_events: [...args.p_events] } });
      ...
        const step = script.shift() ?? opts.defaultStep ?? "ok";
        if (step === "hold") { await new Promise<void>((resolve) => holds.push(resolve)); ... }
        if (step === "error") return { data: null, error: PG_ERROR };
        if (step === "throw") throw new Error("fetch failed");
```
- 리스너 예외 격리 테스트는 498-541행 WR-09 형식(`w.on("applied", …)` 수집 후 `toEqual`). 실행 `--maxWorkers=2`.

---

### `server/src/routes/push-devices.ts` (route, CRUD)

**Analog:** `server/src/routes/strategy-events.ts`

import(1-8행):
```typescript
import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middleware/require-auth.js";
import { StrategyEventsQuery } from "../schemas/orders.js";
import { ValidationFailed } from "../errors.js";
```
머리 JSDoc 「방어선」 표(25-31행) 관례: T-15-03 requireAuth 401 · RPC service_role 전용 · `p_user_id = req.userId` 만 · zod 400 · 에러는 `next(e)`.
핸들러 골격(36-57행):
```typescript
strategyEventsRouter.get("/", requireAuth(), async (req, res, next) => {
  try {
    const parsed = StrategyEventsQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    const rows = await listStrategyEvents(supabase, req.userId!, ...);
    res.json(rows);   // list 는 bare array
  } catch (e) {
    next(e);
  }
});
```
남의 device id PATCH/DELETE → 404(SC-4) — RPC 가 `user_id = p_user_id` 조건으로 0행이면 404.
등록: `server/src/app.ts` 125-133행 `app.use("/api/…", router)` 줄 옆에 추가(`apiRateLimiter` 뒤).

### `server/src/routes/__tests__/push-devices.route.test.ts`

**Analog:** `server/src/routes/__tests__/chat.route.test.ts` — `supertest` + `createApp({ supabase: sb })`(2-3 · 88행), `makeSupabase({ user })` 가짜, `describe("DELETE /api/chat/conversations/:id")`(201행) 형식을 PATCH/DELETE 소유권 404 · 미인증 401 · 400 에 재사용.

---

### `webapp/src/components/me/push-devices-card.tsx` (component)

**Analog:** `webapp/src/components/me/device-settings-card.tsx`

- `"use client"` + 머리 JSDoc(결정 번호 · UI-SPEC 참조) + 문구 상수 export(테스트가 같은 상수로 단언):
```typescript
import { useCallback, useEffect, useId, useState } from "react";
import { Switch } from "@/components/ui/switch";

export const DEVICE_SETTINGS_TEXT = {
  title: "이 기기",
  caption: "이 브라우저(기기)에만 저장돼요. 계좌와 무관해요.",
  ...
} as const;
```
- 상태는 **마운트 뒤에** 읽는다(하이드레이션 — 42-45행 `useEffect`). 네이티브 여부 · 권한 상태도 같은 규칙.
- 스위치 `onCheckedChange(next)` 분기 골격(51-62행) — 켜기 = 권한 요청 → 등록 → 서버 저장, 거부면 꺼짐 복귀 + 설정 열기(D-14).
- 테스트: `webapp/src/components/me/__tests__/device-settings-card.test.tsx` 형식.

### `webapp/src/lib/push/*.ts` (utility/hook)

**Analog 1:** `webapp/src/lib/native/native-google-login.ts` 45-48행 — Capacitor npm 의존 없이 주입 객체 호출:
```typescript
function nativePromise(): NativePromise {
  const cap = (window as unknown as { Capacitor?: { nativePromise?: NativePromise } }).Capacitor;
  if (!cap || typeof cap.nativePromise !== 'function') throw new Error('native_unavailable');
  return cap.nativePromise.bind(cap) as NativePromise;
}
```
→ `nativePromise('PushNotifications', 'requestPermissions' | 'register' | 'checkPermissions')`, 이벤트는 `cap.addListener('PushNotifications', 'registration' | 'pushNotificationActionPerformed', cb)`. **리스너 먼저 → register()**(RESEARCH Pattern 7). 옛 앱 판별 `Capacitor.isPluginAvailable('PushNotifications')`.

**Analog 2 (탭 처리):** `native-bridge-provider.tsx` 188-196행 `navigate`:
```typescript
      navigate(path) {
        if (!isSafeInternalPath(path)) return false;
        ...
          routerRef.current.push(path);
        return true;
      },
```
→ payload `data.path` 를 `isSafeInternalPath` 로 검증 후, D-24 대로 오늘 주문에서 그 종목 최근 계좌를 찾아 `account` 쿼리를 붙여 `router.push`. 쿼리 이름은 `stock` · `date`(order-log-feed.ts:288-307).

### `webapp/src/lib/native/post-native.ts` (수정)

14행 `export type NativeMsgType = 'ready' | 'route' | 'theme' | 'overlay' | 'pull';` 에 `'openSettings'` 추가, 25-28행 「페이로드 계약」 주석 갱신. 양 플랫폼 화이트리스트와 **동시에** 바꾼다:
- Android `GhTradeBridge.kt` companion: `val ALLOWED_TYPES = setOf("ready", "route", "theme", "overlay", "pull")` → `"openSettings"` 추가, 핸들러는 `Settings.ACTION_APP_NOTIFICATION_SETTINGS`.
- iOS `GHTradeBridgeViewController.swift:30` `case ready, route, theme, overlay, pull` → `openSettings` 추가, `UIApplication.openSettingsURLString`.
- 옛 앱은 false/무시 → 안내 문구만(양방향 호환 관례 — post-native.ts 30-32행 주석).

### `alert-toasts.tsx` · `lib/trading-alerts.ts` (수정, D-20)

`TradingAlertKind` 에 `breakout` 이 별도 종류(trading-alerts.ts:63). 숨김은 `kind !== "breakout"` 인 주문 종류(accept·fill·modify·cancel·reject·vi)만 걸러내는 한 곳(`AlertToasts` 렌더 직전 필터 또는 상위 enqueue)에 둔다. 조건 = `isNativeApp` ∧ 서버 토글 켜짐 ∧ 권한 허용.

### `order-log-window.tsx` (탭 착지)

18-19행 「계좌가 없으면 시세 이벤트만 — 결정 1-A」 — 이 창은 수정하지 않고, 탭 처리기가 `account` 를 붙여 연다(D-24). 정본 URL 은 `parseOrderLogQuery` · `orderLogQueryString` 이 다시 쓴다(10-13행).

---

### `mobile/capacitor.config.ts` (수정)

`plugins` 블록(36행~ `SystemBars` · `SocialLogin`)에 같은 형식으로 `PushNotifications: { presentationOptions: ['banner', 'sound', 'list'] }` + 결정 주석(D-19). 머리 주석 「보안 관련 키 추가 금지」 규칙 확인.

### `mobile/android/app/build.gradle` (수정, Pitfall 7)

81-88행 조건부 블록을 무조건 `apply plugin: 'com.google.gms.google-services'` 로 교체(파일 없으면 빌드 실패):
```groovy
try {
    def servicesJSON = file('google-services.json')
    if (servicesJSON.text) {
        apply plugin: 'com.google.gms.google-services'
    }
} catch(Exception e) {
    logger.info("google-services.json not found, google-services plugin not applied. Push Notifications won't work")
}
```
`variables.gradle` 에 `firebaseMessagingVersion = '25.0.1'` 고정.

### `mobile/scripts/check-release-hygiene.sh` · `mobile/.gitignore` (Pitfall 8)

세 곳을 한 번에:
- (2) 54-63행 ignore 샘플 목록에서 `android/app/google-services.json` 제거.
- (3) 67행 정규식에서 `|(^|/)google-services\.json$` 제거 — `service-account[^/]*\.json$` 은 **유지**(SA 키 차단).
- (8) google-services 관련 단언 제거/반전(추적 허용).
- `.gitignore` 41-42행 `google-services.json` 줄과 주석(「앱에 Firebase SDK 없음(D-17)」) 제거·갱신.
- `check-ipa.sh` 에 `aps-environment == production` · Firebase 프레임워크 0 단언, `check-apk.sh` 에 `google_app_id` 단언.

### `scripts/setup-relay-iam.sh` (수정)

172-178행 역할 루프에 FCM 송신 역할 추가(예 `roles/firebasecloudmessaging.admin` — 정확한 역할은 RESEARCH Environment 확인), 188행 Secret 루프에 APNs .p8 Secret 이름 추가(빈 껍데기만 · 값은 사용자 `!` 실행). 여러 줄 PEM 은 docker `--env-file` 불가(Pitfall 10) → base64 1줄 또는 파일 마운트.

## Shared Patterns

### 권한(Supabase)
**Source:** `20261004090100_dma_journal_apply_skipped_rows.sql:177-179` · `20260929180000_dma_strategy_events.sql:108-111`
**Apply to:** 새 표 3개 · 새 RPC 전부 — PUBLIC · anon,authenticated 명시 REVOKE + service_role GRANT. pgTAP 에 (f,f,t) 단언.

### 인증·사용자 확정(server)
**Source:** `server/src/routes/strategy-events.ts:25-57`
**Apply to:** push-devices 모든 핸들러 — `requireAuth()` · `req.userId!` 만 RPC 에 · zod `safeParse` → `ValidationFailed` · `next(e)`.

### 예외 격리 · 로그(relay)
**Source:** `relay/src/journal/writer.ts:640-648`
**Apply to:** notifier enqueue · 송신 루프 · APNs/FCM — `logger.error({ gateway, err: String(err) }, "[push] …")`, 무로그 삼킴 금지(메모리 「무로그 fail-safe 금지」).

### 네이티브 호출 · 호환
**Source:** `native-google-login.ts:45-48` · `post-native.ts:37-50`
**Apply to:** `webapp/src/lib/push/*` — 채널 없으면 `false`/throw `native_unavailable`, 조용한 성공 위장 금지, 옛 앱은 「앱 업데이트 필요」.

### 하이드레이션
**Source:** `device-settings-card.tsx:42-45`
**Apply to:** push-devices-card · 토스트 숨김 판단 — 네이티브·권한·토글 상태는 마운트 뒤 읽기.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `relay/src/push/apns.ts` | service | request-response | 코드베이스에 `node:http2` · ES256 JWT 클라이언트 없음 — RESEARCH「APNs 송신기 핵심」 스켈레톤 사용 |
| `mobile/ios/App/App/App.entitlements` · `AppDelegate.swift` 2 메서드 | config | — | 엔타이틀먼트 첫 도입 — 플러그인 README · RESEARCH Pattern 7 · Pitfall 5/6 |

## Metadata

**Analog search scope:** supabase/migrations · supabase/tests · packages/shared/src · relay/src · relay/tests · server/src/routes · server/src/schemas · webapp/src/components/me · webapp/src/lib/native · webapp/src/components/trading · mobile/ · scripts/
**Files scanned:** ~30
**Tracked-source gate:** 언급한 analog 는 모두 git 추적 원본(설치 미러 없음 — `mobile/node_modules` 경로는 analog 로 쓰지 않음).
**Pattern extraction date:** 2026-11-06
