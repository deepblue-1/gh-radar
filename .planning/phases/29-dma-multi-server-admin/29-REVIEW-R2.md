---
phase: 29-dma-multi-server-admin
round: 2
reviewed: 2026-10-10T22:41:16Z
depth: standard
diff_base: df605d22
files_reviewed: 93
files_reviewed_list:
  - infra/relay/README.md
  - packages/shared/src/__tests__/admin-overview.test.ts
  - packages/shared/src/__tests__/admin.test.ts
  - packages/shared/src/admin.ts
  - packages/shared/src/index.ts
  - packages/shared/src/relay.ts
  - relay/src/access/account-order-servers.ts
  - relay/src/access/app-access.ts
  - relay/src/admin/admin-api.ts
  - relay/src/admin/dispatcher.ts
  - relay/src/admin/intent-store.ts
  - relay/src/admin/planner.ts
  - relay/src/admin/session-sync.ts
  - relay/src/dma/effective-owner-tracker.ts
  - relay/src/dma/session-manager.ts
  - relay/src/dma/session.ts
  - relay/src/dma/strategy-sweeper.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/index.ts
  - relay/src/journal/access.ts
  - relay/src/order/order-api.ts
  - relay/src/quote/quote-switch.ts
  - relay/src/registry/order-journal.ts
  - relay/src/registry/registry.ts
  - relay/src/store/dma-users-migrate.ts
  - relay/src/util/tail-reload.ts
  - relay/src/ws/fanout.ts
  - relay/tests/account-order-servers.test.ts
  - relay/tests/admin-api.test.ts
  - relay/tests/admin-dispatcher.test.ts
  - relay/tests/admin-planner.test.ts
  - relay/tests/admin-session-sync.test.ts
  - relay/tests/app-access.test.ts
  - relay/tests/effective-owner-tracker.test.ts
  - relay/tests/fanout-multi-session.test.ts
  - relay/tests/helpers/admin-db-fake.ts
  - relay/tests/helpers/fake-gateway.ts
  - relay/tests/helpers/supabase-stub.ts
  - relay/tests/hub-multi-session.test.ts
  - relay/tests/order-api.test.ts
  - relay/tests/order-journal-source.test.ts
  - relay/tests/order-server-resync.test.ts
  - relay/tests/quote-switch.test.ts
  - relay/tests/registry.test.ts
  - relay/tests/session-manager.test.ts
  - relay/tests/session-routing.test.ts
  - relay/tests/session.test.ts
  - relay/tests/strategy-sweeper.test.ts
  - relay/tests/tail-reload.test.ts
  - server/src/config.ts
  - server/src/routes/admin-servers.ts
  - server/src/routes/admin.ts
  - server/src/schemas/admin.ts
  - server/src/services/relay-admin-client.ts
  - server/tests/routes/admin-dma.test.ts
  - server/tests/routes/admin-servers.test.ts
  - server/tests/services/relay-admin-client.test.ts
  - supabase/migrations/20261010200000_dma_admin_create_dma_linked.sql
  - supabase/migrations/20261010200100_dma_account_order_server.sql
  - supabase/ops/29-orphan-dma-users.sql
  - supabase/rollback/29-gateway-key-rename-revert.sql
  - supabase/tests/dma_account_order_server.test.sql
  - supabase/tests/dma_admin_create_guard.test.sql
  - supabase/tests/dma_admin_intent.test.sql
  - supabase/tests/dma_admin_reflect.test.sql
  - webapp/e2e/fixtures/admin.ts
  - webapp/e2e/fixtures/relay.ts
  - webapp/e2e/specs/admin-servers.spec.ts
  - webapp/e2e/specs/admin.spec.ts
  - webapp/src/components/admin/__tests__/account-editor.test.tsx
  - webapp/src/components/admin/__tests__/admin-sheet.test.tsx
  - webapp/src/components/admin/__tests__/server-card.test.tsx
  - webapp/src/components/admin/__tests__/servers-client.test.tsx
  - webapp/src/components/admin/__tests__/user-create-sheet.test.tsx
  - webapp/src/components/admin/__tests__/user-sheet.test.tsx
  - webapp/src/components/admin/__tests__/users-client.test.tsx
  - webapp/src/components/admin/account-editor.tsx
  - webapp/src/components/admin/admin-sheet.tsx
  - webapp/src/components/admin/role-segment.tsx
  - webapp/src/components/admin/server-card.tsx
  - webapp/src/components/admin/servers-client.tsx
  - webapp/src/components/admin/use-field-save.ts
  - webapp/src/components/admin/user-sheet.tsx
  - webapp/src/components/admin/users-client.tsx
  - webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/components/trading/workbench/workbench-status-bar.tsx
  - webapp/src/components/ui/sheet.tsx
  - webapp/src/lib/__tests__/admin-api.test.ts
  - webapp/src/lib/__tests__/relay-socket.test.ts
  - webapp/src/lib/admin-api.ts
  - webapp/src/lib/relay-provider.tsx
  - webapp/src/lib/use-relay-socket.ts
findings:
  critical: 2
  warning: 8
  info: 5
  total: 15
status: issues_found
---

# Phase 29: Code Review Report — Round 2 (갭 클로징 29-27 … 29-44)

**Reviewed:** 2026-10-10T22:41:16Z
**Depth:** standard (`git diff df605d22..HEAD`, 필요한 호출 함수는 파일 밖까지 따라 읽음)
**Files Reviewed:** 93
**Status:** issues_found

## Summary

갭 클로징이 고친 round-1 항목(CR-01 · WR-01~07 · IN-01~03)은 코드에서 다시 확인했고, 고쳐진 상태다. 확인한 것은 이렇다.
- DB `DMA_LINKED` 가드와 `dma_user_id IS NULL` 이중 방어
- op 2 settle 범위를 계획 때 removing 계좌로 좁힘
- `TailReload` 꼬리
- quote 키·host·port 서명
- `skipDisabled` settle
- 10초 마감 접기와 `folded` 순서 보장
- `releaseOn`

두 마이그레이션도 문제를 찾지 못했다. `removing` 으로 바꾸는 두 RPC(put_account · mark_account_removed)가 모두 `is_order = false` 를 함께 쓰므로, CHECK 를 어기는 다른 writer 는 없다.

결함은 새로 들어온 G-1 경로에 몰려 있다.
- **[GC-01]** 옛 서버 끄기 경로는 네 갈래다. 연결 중 재수립 · `sweepMoved` · 로그인 백스톱 · 60초 재시도. 이들은 **계좌 단위** 진행 중 집합만 공유하고, 사용자 단위로는 줄 서지 않는다. 그래서 다른 갈래의 sweep 이 세션을 쥔 채 `resyncUser → dropUser` 가 돌 수 있다. sweeper 의 `release(userId, serverKey)` 는 엔트리 동일성이 아니라 키로 찾는다. 그래서 1012 재접속이 새로 만든 세션의 참조계수를 깎는다. 결과적으로 연결된 탭의 세션이 5분 뒤 닫힌다.
- **[GC-02]** relay 의 44 op 3 조립기는 `order_ip` · `order_mac` 을 싣지 않는다. gh-trade 는 이를 빈 문자열(= 미설정)로 읽는다. 그래서 웹 Admin 이 보내는 op 3 한 번이 서버에서 따로 설정한 계좌별 주문자 IP/MAC 을 지운다. 이 설정은 통정거래 경고를 막으려고 둔 값이다.
- **sweeper 와 다른 소비자의 간섭:**
  - 옛 서버 끄기용 14 의 65 집계가 hub 를 거쳐 브라우저로 간다. 그래서 모든 전략 카드에 「전부 정지가 반영됐어요」 가 찍힌다(GC-03).
  - 같은 세션 동시 sweep · hub 21 FIFO 와 섞이면 빈 61 이 다른 거래소로 귀속된다(GC-04).
- **G-1 기능 공백:**
  - 지정 계좌의 VI 설정이 primary 세션 소유 뷰에 막혀 거부된다(GC-05).
  - 등록 서버 1대(비기본)인 계좌를 Admin 화면이 「(기본)」 으로 잘못 보이고, 고를 길도 없다(GC-06).
  - 파이프라인 재생성(주소 변경)이 서명 변화로 오인돼 그 서버 사용자 전원이 1012 로 끊긴다(GC-07).
  - 트래커가 X→(없음)→Y 이동을 놓친다(GC-08).
  - 끄기 미확인 레지스터가 영영 비워지지 않는다(GC-09).
  - 마감 뒤 재적재 대기에 상한이 없다(GC-10).

이미 문서화된 항목은 다시 올리지 않았다. 51 OrderResp 계좌 필터 공백(29-35 D7), pino-http 원문 URL(29-37 deferred), `quote/feed.ts:19` 관찰자 정원 주석(29-40 deferred)이 그것이다. 테스트 파일은 거짓 통과 패턴(skip · only · todo)을 찾았고, 없었다.

## Narrative Findings (AI reviewer)

## Critical Issues

### GC-01: 옛 서버 끄기(sweep) 갈래 간 직렬화 부재 — `dropUser` 뒤 늦은 `release` 가 재접속이 만든 새 세션의 참조계수를 깎는다

**File:** `relay/src/dma/strategy-sweeper.ts:356-360` · `relay/src/dma/session-manager.ts:322-353`(`release` — 키로 찾음) · `relay/src/dma/session-manager.ts:495-514`(`dropUser`) · `relay/src/ws/fanout.ts:1083-1105`(`resyncUser`) · `relay/src/ws/fanout.ts:977-1001`(`#backstopSweep` — fire-and-forget) · `relay/src/ws/fanout.ts:1014-1039`(`#sweepAccounts`) · `relay/src/ws/fanout.ts:657`(`#sweepInFlight` — 키 = 사용자|서버|**계좌**)

**Issue:**
- `#resyncChain` 은 같은 사용자의 「판정 → 끄기 → 재수립」 만 줄 세운다. 로그인 백스톱(인증 직후 `void this.#backstopSweep(...)`), 60초 재시도, `sweepMoved` 는 그 체인 밖이다.
- 갈래 사이의 공유물은 `(사용자|서버|계좌)` 키의 진행 중 집합뿐이다. 그래서 `#sweepThenResync` 는 **자기 이동 계좌의 키**만 기다리고 `resyncUser → sessions.dropUser(userId)` 로 간다. 이때 다른 계좌 키로 같은 사용자의 세션을 쥔 sweep 이 있어도 기다리지 않는다.
- `resyncUser` 는 연결의 `acquiredServers` 만 비운다. sweeper 가 `acquireOn` 으로 올린 참조는 어디에도 기록되지 않는다.

재현 경로(Admin 이 같은 사용자의 두 계좌 지정을 몇 초 간격으로 바꿈 — 계좌마다 `useFieldSave` 가 따로라 정상 조작):
1. 변경 ①로 재수립 → 1012 → 브라우저가 약 1초 뒤 재인증한다. 인증 직후 백스톱이 (u, KB121) 세션을 재사용해 sweep 을 시작한다(refCount +1).
2. 변경 ②가 들어와 `#sweepThenResync` 가 다른 계좌 키(KB120)만 끄고 `dropUser(u)` 를 부른다. KB121 엔트리가 지워지고 세션이 닫힌다(`close()` 는 상태를 내지 않는다).
3. 브라우저가 다시 1012 재접속하고 `acquireOn(u, KB121)` 이 **새 엔트리 E2**(refCount 1)를 만든다.
4. 백스톱 sweep 이 send 실패 또는 5초 단계 시한으로 끝나고 `finally` 에서 `release(u, "KB121")` 를 부른다. 그러면 E2 refCount 가 1→0 이 되어 유예 타이머가 걸린다.
5. 5분 뒤 탭이 연결된 채로 E2 가 `#delete` · `close()` 된다. 그 뒤 그 서버 계좌 주문은 `forAccount` 가 세션을 찾지 못해 거부된다. 탭이 닫힐 때의 `release` 는 「세션 없는 release」 warn 으로 끝난다.

60초 재시도나 `sweepMoved` 가 연결 중 사용자의 세션을 쥔 동안 다른 변경의 재수립이 와도 같은 일이 생긴다. 테스트 ④(`order-server-resync.test.ts:567`)는 같은 체인 안의 두 변경만 다룬다.

**Fix:** 두 가지를 함께 한다.
- `release` 를 엔트리 동일성으로 묶는다. sweeper 는 자기가 얻은 세션 객체로 반납한다.
- 재수립은 그 사용자의 진행 중 sweep 전부를 기다린다.
```ts
// session-manager.ts
releaseSession(userId: string, session: DmaSession): void {
  const key = sessionKey(userId, session.serverKey);
  const entry = this.#sessions.get(key);
  if (entry === undefined || entry.session !== session) return; // drop 뒤 새 엔트리를 깎지 않는다
  this.release(userId, session.serverKey);
}
// strategy-sweeper.ts finally
this.#sessions.releaseSession(target.userId, session);

// fanout.ts — 사용자 단위 진행 중 sweep 집합
async #sweepThenResync(...) {
  ...
  await Promise.all([...this.#sweepInFlight].filter(([k]) => k.startsWith(`${userId}|`)).map(([, p]) => p));
  this.resyncUser(userId, reason);
}
```

### GC-02: relay op 3 이 `order_ip` · `order_mac` 을 빼고 보내 서버 쪽 계좌별 주문자 IP/MAC 을 지운다

**File:** `relay/src/dma/envelope.ts:3250-3263`(`buildWireAdminAccount`) · `packages/shared/src/admin.ts:410`(`diffServerAccounts` — 두 필드 비교 없음) · `docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md`(open)
**Issue:**
- `buildWireAdminAccount` 는 accountNo · name · branchNo · traderId · priority 만 싣는다. 생성물 `AdminAccount.addOrderIp/addOrderMac`(슬롯 14 · 16)은 이미 동기화돼 있지만 쓰지 않는다.
- gh-trade 계약은 다음과 같다.
  - 「서버는 null 을 빈 문자열로 읽는다」
  - 「op 3 에 두 필드를 빈 문자열로 보내면 미설정으로 돌아간다」
  - op 3 멱등 판정은 7필드 전부를 비교한다.
- 그래서 relay 가 보내는 모든 op 3 은 그 계좌의 IP/MAC 을 미설정으로 되돌린다. 웹 Admin 의 이름 · priority · 지점 수정, 신규 서버 반영(op 1 + op 3), 「다시 반영」 이 모두 op 3 을 보낸다.
- 87 파서도 두 필드를 버린다. 그래서 diff 가 이 차이를 보지 못하고, 화면에도 지워진 사실이 드러나지 않는다.
- gh-trade 가 KB 서버에 이 기능을 배포하고 운영자가 WinForms 등으로 값을 설정하면, 다음 웹 계좌 편집 한 번으로 2026-10-07 SAMG엔터 통정거래 경고의 원인 구조로 **조용히** 돌아간다.
- gh-trade 노트의 「gh-trade 먼저 배포 안전」 판단도 「구 relay op 3 = 미설정으로 덮음」 을 빠뜨렸다.

**Fix:** 우선 87 의 값을 보존하는 쪽으로 막는다. 계획 시점 87 스냅샷의 그 계좌 `orderIp/orderMac` 을 op 3 에 그대로 실어 되쓴다.
```ts
// planner: op 3 account = { ...intentFields, orderIp: snap?.orderIp ?? "", orderMac: snap?.orderMac ?? "" }
const orderIp = b.createString(a.orderIp ?? "");
const orderMac = b.createString(a.orderMac ?? "");
WireAdminAccount.addOrderIp(b, orderIp);
WireAdminAccount.addOrderMac(b, orderMac);
```
그다음 87 파서 · shared `AdminAccount` · diff 에 두 필드를 추가한다. 인박스 항목 2 와 4 가 이에 해당한다. 그 전까지 gh-trade 에 「relay 가 보존하기 전에는 KB 운영 서버에 IP/MAC 을 설정하지 말 것」 을 인계 노트로 알린다.

## Warnings

### GC-03: 옛 서버 끄기의 14 가 만든 65 가 「전부 정지가 반영됐어요」 로 사용자의 모든 전략 카드에 찍힌다

**File:** `relay/src/hub/subscription-hub.ts:1994-2007`(65 → `strategies.disabled` 팬아웃, primary 판정 없음) · `relay/src/dma/strategy-sweeper.ts:305-311` · `webapp/src/lib/use-relay-socket.ts:1126-1130` · `webapp/src/components/trading/card/strategy-card.tsx:819-829` · `webapp/src/components/trading/strategy-log.tsx:567-569`
**Issue:**
- sweeper 는 연결 중 사용자의 세션을 재사용한다. 이 세션은 hub 가 듣는 세션이다(29-36 재수립 전 끄기 · 로그인 백스톱 · 재시도 · `sweepMoved` 모두 해당).
- sweeper 가 키마다 보낸 14 에 게이트웨이가 65 를 돌려준다. hub 는 어느 세션의 65 든 `{t:"strategies.disabled"}` 로 그 사용자의 모든 소켓에 보낸다.
- webapp 은 그것을 받으면 마운트된 **모든** 전략 카드 로그에 「전부 정지가 반영됐어요 · 서버가 모든 전략을 비활성화했어요」 를 한 줄씩 추가한다.
- 실제로는 옛 서버의 옮겨진 계좌 몇 건만 꺼졌고, 지금 주문 서버의 전략은 그대로다. 사용자가 누르지도 않은 「전부 정지」 가 키 수만큼 찍히므로, 트레이더는 켜져 있는 전략을 꺼진 것으로 읽는다.
- 로그인 백스톱은 relay 재시작 뒤 첫 로그인마다 돈다(⑬ 테스트 시나리오 그대로).

**Fix:** sweeper 가 진행 중인 (사용자, 서버)의 65 는 hub 가 팬아웃하지 않게 한다. 예를 들어 hub 에 `suppressDisableAck(owner, n)` 카운터를 두거나, sweep 동안 세션 frame 을 sweeper 전용으로 표시한다. 최소한 `strategies.disabled` 는 primary 세션 · 브라우저가 보낸 `strategies.disable` 이 in-flight 일 때만 보낸다.

### GC-04: 같은 세션의 동시 sweep · hub 21 과 겹치면 빈 61 이 다른 거래소로 귀속된다 — VI 끄기 누락이 「확인됨」 으로 접힐 수 있다

**File:** `relay/src/dma/strategy-sweeper.ts:20-26`(「미해결 21 은 늘 하나」 전제) · `relay/src/dma/strategy-sweeper.ts:377-393` · `relay/src/ws/fanout.ts:657`(진행 중 집합 = 계좌 키) · `relay/src/hub/subscription-hub.ts:2668-2690`(`#pendingViGets` FIFO)
**Issue:**
- 빈 61 은 거래소를 싣지 않는다. 그래서 sweeper 는 「이 세션에 미해결 21 은 내 것 하나뿐」 이라는 전제로 빈 61 을 지금 기다리는 거래소의 미등록으로 읽는다.
- 이 전제는 두 경우에 깨진다.
  1. **sweeper 둘이 같은 세션을 쓴다.** 진행 중 집합은 계좌 단위라, 백스톱(계좌 C)과 `sweepMoved`(계좌 A)가 같은 (u, KB120) 세션에서 동시에 돈다. 그러면 Y 의 두 번째 21(KRX)에 대한 빈 61 이, NXT 를 기다리던 X 의 대기를 「NXT 미등록」 으로 풀 수 있다. X 는 NXT VI 를 끄지 않고, 재조회도 같은 방식으로 틀리면 `ok` 로 확인 기록까지 남긴다. 65 대기도 키와 짝짓지 않아(`parseDisableStrategiesResp !== null`) 남의 65 로 풀린다.
  2. **hub 의 primary 프리페치와 겹친다.** 로그인 백스톱은 인증 직후 primary(KB120) 세션에서 21 을 보낸다(⑬ 시나리오 — A 지정 KB121 · KB120 에서 A 끄기). 이 시점은 hub 의 Ready 프리페치 21(KRX → NXT)과 겹친다. 그러면 hub FIFO 가 sweeper 의 빈 61 을 자기 head 거래소로 귀속한다. 사용자의 VI 카드에 등록된 거래소가 「미등록」 으로 보이고, 머리 주석의 「값은 같다」 는 빈 61 에서 성립하지 않는다.

**Fix:** sweep 을 (사용자, 서버) 단위로 직렬화한다. 진행 중 집합 키를 `user|server` 로 두고, 계좌는 뒤 sweep 에 합친다. hub 쪽은 sweep 중인 세션의 61 을 FIFO 에 넣지 않게 한다. hub 에 「외부 21 진행 중」 표식을 두거나, sweeper 가 hub `requestVi` 경로를 통해 21 을 보낸다. 65 대기는 보낸 키 수만큼만 센다.

### GC-05: G-1 지정 계좌는 웹에서 VI 를 설정할 수 없다 — `vi.set` 이 primary 세션 소유 뷰로 거부된다

**File:** `relay/src/ws/fanout.ts:1869-1885` · `relay/src/ws/fanout.ts:2119-2134`(`#accountAllowed` = `session.allowedAccounts`) · `relay/src/hub/subscription-hub.ts:1977-1983`(61 primary 전용)
**Issue:**
- `vi.set` 은 계좌를 싣지만 세션은 늘 `primaryOf` 다. 운영 primary 는 KB 기본 주문 서버 KB120 이다.
- 29-33 뒤 `allowedAccounts` 는 소유 뷰다. 그래서 KB121 로 지정한 계좌 A 는 KB120 세션의 허용 목록에 없다. 그 사용자가 KB120 기본 계좌도 갖고 있으면(혼합 사용자 — G-1 의 주 용도) `#accountAllowed` 가 「이 세션에서 사용할 수 없는 계좌입니다」 로 거부한다.
- VI 표시도 primary(KB120) 61 만 원천이다. 그래서 KB121 쪽 VI 는 화면에 보이지 않는다.
- 지정만 바꿨는데 그 계좌의 VI 기능이 사라진다. 게다가 KB120 에 남은 A 의 VI 는 백스톱이 끈다.

**Fix:** VI 명령의 세션을 계좌로 고른다(`forAccount(userId, accountNo) ?? primaryOf`). VI 원천(61 · 72/73 · 56)은 「계좌의 소유 세션」 기준으로 병합한다. 이것이 D-18 「사용자 단위 primary」 를 바꾸는 결정이면, 최소한 Admin 지정 화면과 VI 카드에 「지정 계좌는 VI 미지원」 을 명시한다.

### GC-06: 등록 서버 1대(기본 서버 아님) 계좌를 Admin 이 「주문 서버 KB121(기본)」 으로 보이지만, relay 는 그 계좌를 어느 세션에도 소유시키지 않는다

**File:** `webapp/src/components/admin/account-editor.tsx:477-489`(1대 분기) · `webapp/src/components/admin/account-editor.tsx:512-514`(「기본」 칸 늘 제공) · `relay/src/access/account-order-servers.ts:292-300`(`effectiveOrderServer` — 등록 여부 무관) · `relay/src/access/account-order-servers.ts:310-317`
**Issue:**
- 유효 주문 서버 = 지정 ?? 증권사 기본이다. 기본 서버에 그 계좌가 **등록돼 있는지는 보지 않는다**.
- KB121 에만 등록된 KB 계좌(지정 없음)를 보면:
  - relay: 유효 = KB120 이고 KB120 매핑에 계좌가 없다. `serversFor` 가 KB121 세션을 열지 않고 `ownerOf` 도 KB120 이라, 계좌가 화면 · 주문에서 사라진다(fail closed).
  - Admin: `registered.length === 1` 분기가 세그먼트 없이 「주문 서버 **KB121**(기본)」 으로 그린다(`current === null` 이면 무조건 「(기본)」). 사실과 반대이고, KB121 을 지정할 컨트롤도 없다.
- 다중 등록이어도 기본 서버에 미등록인 계좌에 「기본 · KB120」 칸을 그대로 제공한다. 이 칸을 고르면 같은 무소유 상태가 된다.

**Fix:**
- 화면: 1대 분기에서 `only !== defaultKey` 면 「(기본)」 대신 경고 한 줄(「기본 서버 KB120 에 등록되지 않아 이 계좌는 주문할 수 없어요 — KB121 을 주문 서버로」)과 지정 버튼을 둔다. 기본 서버에 미등록이면 「기본」 칸을 잠근다.
- 정책: 미등록 기본으로 떨어지는 계좌는 relay 가 「등록 서버가 하나뿐이면 그 서버」 로 해석한다(`effectiveOrderServer` 에 매핑 확인 추가). 또는 DB 가 등록 1대일 때 그 서버를 자동 지정한다.

### GC-07: 서버 주소(host · port) 편집 → 파이프라인 재생성으로 매핑이 비면, 재수립이 그 서버 사용자 전원을 1012 로 끊고 계좌를 숨긴다

**File:** `relay/src/registry/pipelines.ts:112-160`(`needsRebuild` → 새 `JournalAccess` 빈 매핑) · `relay/src/index.ts:612-636` · `relay/src/access/account-order-servers.ts:309-317` · `relay/src/ws/fanout.ts:1131-1150`(`#resyncIfChanged` — `servers` 서명 비교)
**Issue:**
- `registry changed` 처리기는 `pipelines.sync` 로 주소가 바뀐 서버의 파이프라인을 새로 만든다. 새 매핑은 79/87 이 오기 전까지 비어 있다. 처리기는 그 직후 `resyncChangedUsers("registry")` 를 부른다.
- `serversFor` 는 매핑에 계좌가 없는 서버를 대상에서 뺀다. 예를 들어 교보 기본 KYOBO119 의 포트를 고치면 모든 교보 사용자의 원하는 서버 집합이 `KB120,KYOBO119` → `KB120` 으로 바뀐다. 그 결과:
  - 서명이 달라져 전원이 「옛 서버 전략 끄기 없음 + dropUser + 1012」 를 맞는다.
  - 재접속하면 교보 세션 없이 서고, 교보 계좌가 사라진다.
  - 새 주소의 admin 연결이 87 을 줄 때까지(주소가 틀렸으면 무기한) 그대로다.
- 지정 서버 주소 편집도 같다.
- 29-36 의 「주소 · 무관 서버 변경은 서명이 같아 0」(index.ts 주석)은 매핑이 재생성되는 경우 성립하지 않는다.

**Fix:** 재수립 판정에서 「그 서버 매핑 미적재(파이프라인 갓 생성 · 79/87 미수신)」 를 「모름」 으로 다룬다. 예를 들어 `accountsOf` 가 미적재면 직전 값을 쓰거나 그 사용자 판정을 보류한다. 또는 `registry changed` 의 재수립을 `change.roles`(기본 주문 서버 교체) · enabled 변화일 때만 부른다.

### GC-08: `EffectiveOwnerTracker` 가 X → (소유자 없음) → Y 이동을 놓쳐, 연결 없는 사용자의 옛 서버 X 전략이 끝내 꺼지지 않는다

**File:** `relay/src/dma/effective-owner-tracker.ts:87-100` · `relay/src/ws/fanout.ts:856-861` · `relay/src/ws/fanout.ts:1048-1053` · `relay/src/admin/admin-api.ts:385-393`(PUT accounts — reconcile 뒤 재적재) · `relay/src/index.ts`(87 `applied` → `sweepOwnerMoves`)
**Issue:** 지정 서버 X 를 등록에서 빼는 순간의 순서는 다음과 같다(Admin 이 계좌 A 의 지정 서버 KB121 체크를 해제).
1. `put_account` 가 DB 에서 지정을 지운다.
2. reconcile 의 op 4 뒤 X 의 87 이 도착한다. `applied → sweepOwnerMoves` 가 돈다. 메모리 지정 사본은 아직 X 라 유효 = X 다. X 매핑에 A 가 없으니 owner 는 undefined 가 된다. move `X→undefined` 는 「지금 유효 = from」 이라 건너뛴다.
3. 그 뒤 `reloadOrderServers` → `changed` 가 돈다. move `undefined→Y` 는 `from === undefined` 라 건너뛴다.

결국 X 의 A 전략을 끄는 경로가 하나도 없다.
- 백스톱도 X 를 보지 않는다(A 가 X 매핑에 없음).
- 연결 중 경로(29-36 서명)는 이 경우를 잡지만, 연결 없는 트레이더는 빠진다. 29-44 가 막으려던 바로 그 사용자군이다.

X 가 users.toml 에서 빠진 계좌의 전략을 계속 돌리는지는 gh-trade 동작에 달렸다. relay 쪽 이동 추적은 어느 쪽이든 끊겨 있다.

**Fix:** 트래커가 계좌별 「마지막으로 정의된 소유자」 를 기억한다. undefined 를 거쳐 다른 서버로 정착하면 `from = 마지막 정의 소유자` 로 move 를 낸다. 또는 admin-api 가 reconcile **전에** `orderServers.reload()` 를 불러, 87 `applied` 가 새 지정을 보게 한다.

### GC-09: 끄기 미확인 레지스터 항목이 해소될 수 없어도 지워지지 않는다 — 영구 경보와 60초마다의 재로그인

**File:** `relay/src/ws/fanout.ts:922-955`(`#retryUser` — `cur === undefined → continue` · 자격증명 `unauthorized`/`dma-changed` → `#markStale` 재기록) · `relay/src/dma/strategy-sweeper.ts:435-474`(`StaleStrategyRegister` — 만료 없음) · `relay/src/index.ts`(`targetOf` 가 꺼진 서버도 대상)
**Issue:** 다음 항목은 영원히 남는다.
- 웹 사용자가 삭제되거나 강등되거나 DMA 연결이 바뀐 사용자 → 매 틱 `no-session` 으로 `attempts++`
- 계좌가 모든 매핑에서 사라진 경우(`cur === undefined`)
- 레지스트리에서 지운 서버 → `no-session`

이 항목들은 relay 재시작 전까지 남아 다음 곳에 계속 보인다. 실제 위험과 무관한 영구 경보다.
- healthz `accountOrderServers.<키>.staleAccounts`
- Admin 서버 카드 「옛 주문 서버에 남아 끄지 못한 전략 — 계좌 N개」

꺼졌거나 죽은 옛 서버(enabled false 도 대상)를 가리키는 항목은 60초마다 임시 로그인 세션을 새로 연다(TCP 접속 · LoginReq). backoff 도 상한도 없다.

**Fix:** 해소 불가 사유(`unauthorized` · `dma-changed` · 매핑 없음 · 레지스트리에 없는 서버)는 레지스터에서 지우고 info 1줄을 남긴다. 또는 별도 「포기」 상태로 옮긴다. 재시도에 지수 backoff(예: 60s → 최대 30분)와 `attempts` 상한을 둔다.

### GC-10: 요청 마감(10초) 뒤 재적재 대기에 상한이 없다 — WR-07 의 「반영됐는데 502」 가 다른 길로 남는다

**File:** `relay/src/admin/admin-api.ts:393` · `relay/src/admin/admin-api.ts:406` · `relay/src/admin/admin-api.ts:449-452` · `relay/src/util/tail-reload.ts:61-65`
**Issue:**
- 변경 라우트는 dispatcher 를 10초 마감으로 접은 **뒤** `await reloadOrderServers(...)` 를 부른다. 유저 삭제는 그 앞에 `await deps.access.reload()` 도 부른다.
- `TailReload.now()` 는 진행 중 적재가 있으면 「그 적재 + 꼬리 적재」 를 기다린다. 그래서 DB 가 느릴 때 이 대기는 RPC 2회(삭제는 4회) 분량으로 늘어난다.
- 마감에 거의 다 쓴 요청 + 이 대기가 Express `RELAY_ADMIN_TIMEOUT_MS` 15초를 넘으면 Express 는 502 를 준다. DB · 서버 반영은 이미 끝난 상태다.
- 삭제 화면은 실패를 보이고, 다시 누르면 다른 결과가 난다.

**Fix:** 재적재를 응답 뒤 비동기로 돌린다. 라우팅 즉시성은 60초 주기와 `changed` 가 맡는다. 또는 남은 마감(`deadlineAt - now`)으로 `Promise.race` 시한을 둔다.
```ts
void reloadOrderServers(route); // 응답을 막지 않는다
res.status(200).json(...);
```

## Info

### GC-11: 로그인 백스톱은 「클라(OCX)에서 다시 켠 전략」 을 수렴시키지 못한다 — 머리 주석과 동작이 다르다

**File:** `relay/src/ws/fanout.ts:68-70`(머리 11 (b)) · `relay/src/ws/fanout.ts:986`
**Issue:**
- 머리 주석은 백스톱이 OCX 에서 다시 켠 전략을 수렴시킨다고 적는다.
- 그런데 확인 기록이 있고 소유 서버가 그대로면 0회다. 확인 기록은 relay 프로세스 수명 동안 남는다.
- 그래서 끈 뒤 OCX 로 다시 켠 옛 서버 전략은 relay 재시작 전까지 다시 꺼지지 않는다.

**Fix:** 주석을 실제 동작에 맞추거나, 확인 기록에 TTL(예: 하루 · 장 시작 기준)을 둔다.

### GC-12: 상태 프레임 `staleStrategies` 는 계좌당 첫 서버 하나만 싣는다

**File:** `relay/src/ws/fanout.ts:2693-2696`
**Issue:** 같은 계좌가 두 옛 서버(예: KB120 · KB122)에 끄지 못한 전략을 남기면 `if (!stale.has(...))` 가 첫 항목만 남긴다. 작업대 경고는 한 서버만 말한다.
**Fix:** `staleStrategies` 를 서버 배열로 바꾸거나, 경고 문구에 「외 N개 서버」 를 붙인다.

### GC-13: 꺼진 서버로의 지정이 healthz 에 `alerting: true` 로 계속 실린다

**File:** `relay/src/index.ts`(`accountOrderServers` 결선 — 지정 사본 전부 계수) · `relay/src/order/order-api.ts`(`buildAccountOrderServers` — 파이프라인 없음 = alerting)
**Issue:**
- G-1 규칙상 서버를 꺼도 지정은 남는다. 그 계좌는 기본 서버로 간다.
- 그런데 healthz 본문은 그 꺼진 서버를 `{ accounts: n, alerting: true }` 로 계속 싣는다.
- 503 축은 아니지만 본문을 보는 운영자에게는 거짓 경보다.

**Fix:** 레지스트리 `enabled` 가 false 인 서버는 `alerting: false` 로 두고 `disabled: true` 를 따로 싣는다. 또는 계수에서 뺀다.

### GC-14: 진행 중 sweep 은 그 서버가 다시 주문 서버가 돼도 멈추지 않는다

**File:** `relay/src/ws/fanout.ts:1046-1048`(`#clearIfOwner` — 기록만 지움) · `relay/src/dma/strategy-sweeper.ts:302-331`
**Issue:**
- 되돌아옴(move `to` = 그 서버)은 레지스터 항목과 확인 기록만 지운다.
- 같은 키로 이미 돌고 있는 sweep(최대 20초)은 처음 읽은 활성 전략에 14 · 11 을 그대로 보낸다. 이 전략들은 이제 그 계좌 주문 서버의 정상 전략이다.
- 창은 좁지만, 지정을 빨리 되돌리면 막 되살아난 서버의 전략이 꺼진다.

**Fix:** sweeper 가 각 14 · 11 송신 직전에 `isStillStale(target)` 콜백을 묻게 한다. 콜백은 유효 서버가 대상 서버면 중단한다.

### GC-15: 운영 점검 SQL 머리의 실행 수단이 존재하지 않는 CLI 명령이다

**File:** `supabase/ops/29-orphan-dma-users.sql:8`
**Issue:** `supabase db query --linked` 로 돌린다고 적혀 있다. 29-41 이 확인한 대로 CLI v2.75 에는 그 하위 명령이 없다. 다음 운영자가 같은 막다른 길을 밟는다.
**Fix:** 「대시보드 SQL 편집기 또는 REST `Prefer: count=exact`」 로 고친다(29-41 런북 정정과 같은 문장).

---

_Reviewed: 2026-10-10T22:41:16Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
