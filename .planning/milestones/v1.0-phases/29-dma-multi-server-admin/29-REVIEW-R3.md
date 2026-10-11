---
phase: 29-dma-multi-server-admin
round: 3
reviewed: 2026-10-11T12:40:00Z
depth: standard
diff_base: fb41305b
reviewed_head: 183ea9c8
files_reviewed: 22
files_reviewed_list:
  - packages/shared/src/admin.ts
  - packages/shared/src/index.ts
  - packages/shared/src/order-server.ts
  - packages/shared/src/relay.ts
  - relay/src/access/account-order-servers.ts
  - relay/src/admin/admin-api.ts
  - relay/src/admin/planner.ts
  - relay/src/admin/types.ts
  - relay/src/dma/effective-owner-tracker.ts
  - relay/src/dma/envelope.ts
  - relay/src/dma/session-manager.ts
  - relay/src/dma/strategy-sweeper.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/index.ts
  - relay/src/journal/access.ts
  - relay/src/journal/types.ts
  - relay/src/order/order-api.ts
  - relay/src/registry/pipelines.ts
  - relay/src/ws/fanout.ts
  - supabase/ops/29-orphan-dma-users.sql
  - webapp/src/components/admin/account-editor.tsx
  - webapp/src/components/trading/workbench/workbench-status-bar.tsx
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 29: Code Review Report — Round 3 (갭 클로징 29-45 … 29-55)

**Reviewed:** 2026-10-11T12:40:00Z
**Depth:** standard (`git diff fb41305b..183ea9c8`. 호출되는 함수는 파일 밖까지 따라 읽음 — `admin-conn.ts` · `dispatcher.ts` · gh-trade `server/docs/protocol.md`)
**Files Reviewed:** 22 (리뷰 대상 파일은 HEAD 와 183ea9c8 사이에 변경 0 — 배포본과 같다)
**Status:** issues_found

## Summary

2라운드 발견 GC-01~15 와 N-01 은 모두 코드에 수정이 들어가 있다. 15건은 주장한 대로 닫혔고, 1건(GC-02)은 부분 수정이다. 근거는 아래 「종결 확인」 표에 정리했다. 다만 수정 코드가 새 결함을 만들었다. 대부분 동시성 · 상태 동기화 쪽이다.

- **[R3-01 · Critical] GC-02 는 반만 닫혔다.**
  - planner 가 되싣는 주문자 IP/MAC 은 relay 가 **캐시한 87** 값이다.
  - gh-trade 는 87 을 「요청 연결에만」 보낸다. relay 캐시는 relay 가 접속할 때와 relay 자신의 명령 뒤에만 새로워진다.
  - 그래서 relay 가 아닌 admin 연결로 설정한 IP/MAC 은, 다음 웹 계좌 편집 한 번으로 그대로 지워진다.
  - 웹에 입력칸이 아직 없으니 지금 값을 넣을 수 있는 길은 relay 밖의 경로뿐이다. 인박스 노트는 「설정 보류 권고 해제」 를 이미 적었다.
- **새 경로 결함:**
  - 14 송신자 FIFO 가 같은 세션 재접속 때 비워지지 않는다(R3-04). 그래서 재접속 직후 다시 누른 「전부 정지」 의 확인이 사라지거나 「확인 못 함」 으로 나온다.
  - 연결 없는 사용자의 sweep 중에 브라우저가 같은 세션에 붙으면 GC-03 증상이 다시 나온다(R3-05). 무동작 대여가 끝까지 승격되지 않기 때문이다.
  - 부팅 창에서 `defaultUnknown` 과 로그인 백스톱이 겹치면, 유일 등록 서버(진짜 주문 서버)의 전략을 끈다(R3-03).
  - VI 「세션 경계 너머 1건」 가드는 끄기 에코를 기다리지 않는다. 끄기가 유실되면 숨은 VI 가 남는다(R3-06).
  - 같은 계좌를 다른 DMA 유저에 추가하면 IP/MAC 을 빈 값으로 보낸다. 그 계좌에 IP/MAC 이 설정돼 있으면 code 7 로 거부된다(R3-02).

SUMMARY 가 적은 알려진 사항은 다음처럼 판단했다(부풀리지 않음).
- 29-55 「꺼진 지정 + 기본 미등록 → 경고 두 줄」 은 앞 줄 문구가 실제 유효 서버와 어긋나는 문제다. R3-09(Info)에 묶었다.
- 29-52 `grep -c "discard("` = 1 은 `#discardStale` 로 모은 결과다. 결함이 아니다(4사유 모두 `#discardStale` 을 거친다 — `fanout.ts:1050-1055`).
- 29-51 `session-manager.ts:26` 머리 주석은 R3-10(Info)이다.

## 종결 확인 (GC-01~15 · N-01)

| ID | 판정 | 근거 (file:line @183ea9c8) | 비고 |
|----|------|---------------------------|------|
| GC-01 | fixed-as-claimed | `strategy-sweeper.ts:469` `releaseSession(target.userId, session)` · `session-manager.ts:365-376`(엔트리 동일성 가드) · `fanout.ts:1434`(`#userSweepsSettled`) · `fanout.ts:1160-1222`(사용자·서버 레인) | 두 겹 방어가 다 있다. 대기의 상한이 바퀴 수뿐이다 — R3-07(Info) |
| GC-02 | **partially** | `planner.ts:80-83 · 107-112`(되싣기) · `envelope.ts`(`buildWireAdminAccount` addOrderIp/Mac · 87 파서) · `admin.ts` `sameValues` | 되싣는 값의 원천이 낡은 87 캐시다 — **R3-01**. 같은 계좌를 다른 유저에 추가할 때 — R3-02 |
| GC-03 | fixed-as-claimed (잔여 경로) | `subscription-hub.ts:1186-1226`(`lendSession`) · `:2594-2620`(65 꼬리표 · 대여 중 억제) · `strategy-sweeper.ts:384 · 406` · `fanout.ts:1483` | 무동작 대여 뒤 늦은 결선 경로가 남았다 — R3-05 |
| GC-04 | fixed-as-claimed | relay: `fanout.ts:1160-1229` 레인 · `strategy-sweeper.ts` 14 확인 = 그 키 60 에코 뒤 65. hub: `subscription-hub.ts` `#drainViGets` · `#requestViTriggers`(:2076-2092 대여 중 21 미룸) · 61 대여 중 빈 61 무귀속(:2567-2574) | — |
| GC-05 | fixed-as-claimed (잔여 위험) | `fanout.ts` `#viSessionFor` · `vi.set`(:2137) · hub `#viSourceOwners` · `#mergeVi`(:3376-3405) · `viRunningElsewhere`(:2197) | 가드가 끄기 에코를 확인하지 않는다(fail open) — R3-06 |
| GC-06 | fixed-as-claimed (잔여 경로) | `order-server.ts` `resolveEffectiveOrderServer` · `account-order-servers.ts:311-319` · `index.ts:235` · `account-editor.tsx:479-484 · 499 · 553` | 부팅 창의 `defaultUnknown` × 백스톱 — R3-03. Admin 여러 대 분기 표시 — R3-09 |
| GC-07 | fixed-as-claimed | `pipelines.ts:156 · 164-172`(옛 access 기억 → `seedProvisional`) · `access.ts:121-134 · 212-216` | 옛 벌이 미적재면 무동작이다(의도). 잠정은 DB 에 쓰지 않는다 |
| GC-08 | fixed-as-claimed | `effective-owner-tracker.ts:111-114 · 153-169`(`#lastOwner` · 소비 규칙) | X→없음→Y · X→없음→X · 사라짐 정리를 손으로 추적했고, 셋 다 맞다 |
| GC-09 | fixed-as-claimed | `fanout.ts:1006-1010`(`#staleRetryDue`) · `:1033-1056`(4사유 `#discardStale`) · `strategy-sweeper.ts` `staleRetryDelayMs` · `STALE_RETRY_MAX_ATTEMPTS` · `knowsServer` | `knowsServer` 는 꺼진 서버도 참이다(`index.ts:372-375` `registry.get`). 꺼진 서버 항목은 지워지지 않고 backoff 대상이다(설계대로) |
| GC-10 | fixed-as-claimed | `admin-api.ts:333-360`(`awaitWithinDeadline`) · 적용 5곳(:432 · :446 · :466 · :492 · :495) | — |
| GC-11 | fixed-as-claimed | `fanout.ts` 머리 11 (b) · `#backstopSweep` 주석 — `'다시 켠 전략 수렴'` 0건 | — |
| GC-12 | fixed-as-claimed | `fanout.ts:3063-3080`(계좌별 서버 묶음 · count 합/null) · `relay.ts` `otherServers?` · `workbench-status-bar.tsx` 문구 | — |
| GC-13 | fixed-as-claimed | `order-api.ts:540-560` · `index.ts:597` | — |
| GC-14 | fixed-as-claimed | `strategy-sweeper.ts` `stillStale`(14 · 11 송신 직전) · `fanout.ts:1486-1489 · 1497-1505`(skipped → `#clearIfOwner`) | 같은 술어가 부팅 창에서 틀린 답을 낸다 — R3-03 |
| GC-15 | fixed-as-claimed | `supabase/ops/29-orphan-dma-users.sql:8-10` — `db query` 0건 | — |
| N-01 | fixed-as-claimed (잔여 위험) | `fanout.ts:2167-2181 · 2382-2411`(`#allStopTargets` · `#allStop`) · hub `beginAllStop` · 14 송신자 FIFO(:1364-1395 · :2594-2612) | FIFO 가 같은 세션 재접속에서 비워지지 않는다 — R3-04 |

## Narrative Findings (AI reviewer)

## Critical Issues

### R3-01: op 1 · op 3 이 되싣는 주문자 IP/MAC 은 relay 의 낡은 87 캐시다 — relay 밖에서 설정한 값을 다음 웹 계좌 편집이 지운다 (GC-02 부분 수정)

**File:** `relay/src/admin/dispatcher.ts:280-282`(`admin.currentSnapshot()` 로 계획 — 새로 묻지 않는다) · `relay/src/admin/planner.ts:107-112`(되싣는 값 = 그 캐시) · `relay/src/admin/admin-conn.ts:10 · 17-19`(op 5 는 「접속마다」 1건) · `relay/src/admin/admin-conn.ts:428-436`(`#onSnapshot`) · gh-trade `server/docs/protocol.md:98`(87 = 「Notice, **요청 연결에만**」) · `docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md:48`(설정 보류 권고 「해제」)

**Issue:**
- relay 의 87 캐시가 새로워지는 경우는 둘뿐이다. admin 연결이 접속할 때(op 5)와 relay 자신이 보낸 변경 op 뒤다.
- gh-trade 는 다른 admin 연결(role 2 — gh-trade 운영 도구 · `e2e_admin_users.sh` 등)이 만든 변경의 87 을 그 요청 연결에만 보낸다. 그래서 relay 캐시는 다음 재접속까지 낡은 채 남는다.
- `planServerOps` 는 그 캐시에서 계좌의 `orderIp/orderMac` 을 꺼낸다. 캐시에는 아직 값이 없으므로 빈 문자열을 싣는다. gh-trade op 3 계약상 빈 값은 「미설정으로 되돌림」 이다.

재현:
1. 운영자가 gh-trade 도구로 KB120 계좌 A 에 IP/MAC 을 설정한다. 87 은 그 도구 연결로만 간다.
2. 웹 Admin 이 같은 유저의 계좌 이름이나 priority 를 고친다. 또는 「다시 반영」 을 누른다.
3. relay 가 op 3 을 보낸다. A 는 「changed」(이름 다름) 이고, 캐시에 IP/MAC 이 없으니 `""` 를 싣는다.
4. 서버는 A 의 IP/MAC 을 미설정으로 되돌린다. 86 은 code 0 이고, 87 에서도 빈 값이 정상으로 보인다. 아무 경보도 없다.

이 결과가 2026-10-07 통정거래 경고의 원인 구조로 **조용히** 되돌아가는 것이다(GC-02 와 같은 결과).
- 웹 입력칸(인박스 항목 4)이 아직 없다. 그래서 지금 값을 넣는 길은 위 1 같은 relay 밖 경로뿐이다.
- 인박스 노트 48행은 이미 「설정 보류 권고는 29-53 배포로 해제」 라고 적었다.

**Fix:** op 1 · op 3 을 계획하기 직전에 그 서버 87 을 새로 받는다. admin-conn FIFO 에 op 5 를 1건 넣고 받은 87 로 계획한다(서버당 +1초 이내 · 마감 안).
```ts
// dispatcher #applyServer — 계획 전에 신선한 스냅샷
const fresh = await admin.refreshSnapshot(); // op 5 → 87 (FIFO · 5초 상한) — 실패면 offline
const snapshot = fresh ?? null;
if (snapshot === null) return { server: serverKey, outcome: "offline" };
const p = plan(snapshot);
```
보조 수단도 함께 둔다.
- 86 의 `users_rev` 가 캐시 rev + 1 이 아니면(relay 밖 변경이 끼었다) warn 1줄을 남긴다.
- gh-trade 에 「admin 변경 뒤 87 을 모든 admin 연결에 Notice」 를 인계 요청한다.
- 그 전까지 인박스 48행의 「권고 해제」 를 「relay 밖 도구로 설정했다면 relay admin 재접속(재시작) 전에는 웹 계좌 편집 금지」 로 고친다.

## Warnings

### R3-02: 같은 계좌를 다른 DMA 유저에 추가하면 IP/MAC 을 빈 값으로 보내 code 7 ACCOUNT_CONFLICT 로 거부된다 (GC-02 부분)

**File:** `relay/src/admin/planner.ts:107-112`(`snapByNo` = **그 유저** 87 계좌만) · `relay/src/admin/planner.ts:80-83` · `docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md:28`(code 7 범위 확장)
**Issue:**
- gh-trade 는 「다른 사용자의 같은 계좌는 branch/trader 뿐 아니라 order_ip/order_mac 도 같아야 한다」(code 7)고 규칙을 넓혔다.
- 87 은 users.toml **전체**인데, planner 는 `snapUser`(그 DMA 유저)의 계좌에서만 값을 찾는다.
- 그래서 유저 U1 의 계좌 A 에 IP/MAC 이 설정된 상태에서 Admin 이 A 를 U2 에 추가하면, op 1 · op 3 은 `orderIp: "" · orderMac: ""` 를 싣는다. 서버는 code 7 로 거부한다.
- Admin 칩은 서버 문구 「다른 지점번호/거래자ID 로 보유」 를 그대로 보인다(gh-trade 질문 1 — 문구 미확장). 운영자는 branch/trader 를 보고 같다고 판단하게 되고, 원인을 찾을 수 없다.

**Fix:** 그 유저에 없는 계좌는 같은 87 의 다른 유저에서 같은 정규화 번호를 찾아 IP/MAC 을 가져온다.
```ts
const byNoAnyUser = new Map<string, AdminAccountFields>();
for (const u of input.snapshot.users) for (const a of u.accounts) {
  const k = normalizeAccountNo(a.accountNo);
  if (!byNoAnyUser.has(k)) byNoAnyUser.set(k, a);
}
const sendable = (a) => withServerEndpoint(a, snapByNo.get(a.accountNo) ?? byNoAnyUser.get(a.accountNo));
```

### R3-03: 부팅 · 기본 서버 매핑 미적재 창에서 로그인 백스톱이 유일 등록 서버(진짜 주문 서버)의 전략을 끈다 (GC-06 × 29-44 · GC-14)

**File:** `relay/src/access/account-order-servers.ts:318-319`(`defaultUnknown` → 기본) · `relay/src/dma/effective-owner-tracker.ts:122-148`(`snapshotOf` — `effective` 는 위 규칙 · `servers` 는 적재된 매핑) · `relay/src/ws/fanout.ts:1117-1135`(`#backstopSweep` — `serverKey === e.effective` 만 건너뜀) · `relay/src/ws/fanout.ts:1486-1489`(`stillStale` — 같은 `effective` 비교)
**Issue:** GC-06 이 바로 이런 계좌(KB121 에만 등록 · 지정 없음)를 정식 지원하게 됐다. 그 계좌 A 에 대해 다음이 일어난다.
1. relay 재시작(배포)에서 KB121 의 79 가 KB120(기본)의 79 보다 먼저 온다.
2. 이 순간 `mappingLoaded(KB120)` 은 거짓이라 `effective(A)` = KB120(등록 모름 = 기본)이다. 반면 `servers(A)` = [KB121] 이다.
3. 재시작 직후 1~3초 안에 자동 재접속한 브라우저가 인증하면 백스톱이 돈다. KB121 ≠ effective KB120 이므로 (KB121, A) 를 「등록됐지만 주문 서버가 아님」 으로 끈다.
4. GC-14 의 송신 직전 `stillStale` 도 같은 `effective` 로 판정한다. 그래서 KB120 79 가 그 사이 오지 않으면 막지 못한다.
5. 그 결과 A 의 **유일한 실제 주문 서버**에서 상따 · VI · 자동매도가 꺼진다. 확인 기록도 남는다.

`defaultUnknown` 은 「계좌를 숨기지 않으려고」 둔 가정이다. 하지만 백스톱과 GC-14 는 그 값을 「확정된 유효 서버」 로 소비한다.
**Fix:** 판정 근거가 「모름」 인 항목은 끄기 대상에서 뺀다. 스냅샷 항목에 `effectiveKnown`(기본 매핑 적재 여부)을 싣는다. 백스톱과 `stillStale` 은 그 값이 거짓이면 건너뛴다(fail safe — 끄지 않음).
```ts
// account-order-servers: effectiveOrderServer 가 { key, unknown } 을 내거나 별도 isDefaultLoaded(broker)
if (!e.effectiveKnown) continue;               // #backstopSweep
stillStale: (a) => { const e = snap.get(k(a)); return e?.effectiveKnown !== false && e?.effective !== serverKey; }
```

### R3-04: 14 송신자 꼬리표 FIFO 가 같은 세션 재접속(`ready`)에서 비워지지 않는다 — 재접속 직후 「전부 정지」 확인이 사라지거나 「확인 못 함」 으로 나온다 (N-01 잔여)

**File:** `relay/src/hub/subscription-hub.ts:3704-3714`(`#onReady` — 21 대기열만 규칙 (d) 로 새로 시작 · `#disableSenders` 무관) · `:1364-1395`(`#pushDisableSender` · `#takeDisableSender` — 30초 나이로만 버림) · `:2594-2612`(65 귀속) · `:3769-3771`(꼬리표를 지우는 곳은 교체 · 분리뿐)
**Issue:**
- 같은 `DmaSession` 객체가 회선 실패 뒤 재접속하면 끊기 전에 보낸 14 의 65 는 오지 않는다. 21 에 적용한 규칙 (d)와 같은 이유다(`#requestViTriggers` 머리 주석).
- 그런데 14 꼬리표는 30초 동안 FIFO 머리에 남는다. 그 30초 안에 온 다음 65 는 남은 꼬리표에 귀속된다.
  - 남은 꼬리표가 `sweeper` 면: 사용자의 「전부 정지」 65 가 「sweeper 몫」 으로 조용히 버려진다. 브라우저는 8초 백스톱에서 「확인 못 함」 을 본다.
  - 남은 꼬리표가 끝난 집계면: 「늦게 온 65」 info 로 버려진다.
  - 다중 대상에서는 새 집계의 KB121 대상이 답을 받지 못한다. 5초 뒤 `ALL_STOP_PARTIAL_TEXT(KB121)` 가 「확인하지 못한 서버가 있습니다(KB121)」 로 거짓 경보를 낸다.
- 트레이더가 회선 끊김을 보고 재접속 직후 「전부 정지」 를 다시 누르는 것은 가장 흔한 순간이다. kill switch 확인이 바로 그때 틀린다(운영 메모 — GCP 서울 엣지 주기 끊김).
- 이 FIFO 는 relay 가 보낸 14 만 센다. 같은 gh-trade 세션에 붙은 다른 연결(OCX)의 65 가 이 연결로도 오는지는 프로토콜 문서에 없다(`protocol.md:76`). 온다면 같은 방식으로 어긋난다 — 확인이 필요하다.

**Fix:** 재접속 Ready 에서 그 소유 키 꼬리표를 비우고, 진행 중 집계의 그 대상을 끝낸다(21 규칙 (d)와 같은 자리).
```ts
#onReady(userId, owner, session) {
  if (this.#sessions.get(owner) !== session) return;
  this.#dropDisableSenders(owner); // 끊기 전 14 의 65 는 오지 않는다 — 규칙 (d) 동형 · 진행 중 집계 대상은 detached
  ...
}
```
gh-trade 에는 「65 의 전달 범위(요청 연결만 / 같은 user 전 연결)」 를 인계 질문으로 확인한다.

### R3-05: 연결 없는 사용자 sweep 의 무동작 대여는 승격되지 않는다 — sweep 중 브라우저가 같은 세션에 붙으면 「전부 정지가 반영됐어요」 가 다시 찍힌다 (GC-03 잔여 경로)

**File:** `relay/src/hub/subscription-hub.ts:1186-1190`(`lendSession` — 결선 안 된 세션 = `NOOP_LEASE` 즉시) · `:378`(`NOOP_LEASE.noteDisableSent` 무동작) · `:2594-2620`(꼬리표 없음 · 대여 아님 → `strategies.disabled` 팬아웃) · `relay/src/ws/fanout.ts:1612`(인증 · 세션 추가가 같은 세션 객체를 `hub.attach`) · `relay/src/dma/strategy-sweeper.ts:384 · 406`
**Issue:**
1. `sweepMoved` 나 60초 재시도는 연결 없는 사용자의 옛 서버에 임시 세션을 연다. hub 에 결선되지 않았으므로 대여는 `NOOP_LEASE` 다.
2. 그 sweep(최대 20초) 중에 사용자가 브라우저를 연다. `acquireOn` 은 같은 세션을 재사용한다(참조계수 +1). fanout 이 그 세션을 `hub.attach` 하면 hub 가 그 세션 프레임을 듣기 시작한다.
3. 이후 sweeper 가 보내는 14 의 65 는 다음처럼 처리된다.
   - 꼬리표가 없다(`noteDisableSent` 는 무동작 대여 것).
   - `#lent` 도 없다.
   - 그래서 hub 는 이 65 를 서버 발 65 로 보고 `strategies.disabled` 로 팬아웃한다.

그 결과 사용자가 누르지 않은 「전부 정지가 반영됐어요 · 서버가 모든 전략을 비활성화했어요」 가 모든 전략 카드에 키 수만큼 찍힌다(GC-03 증상 그대로). 창은 좁지만, 재시도는 backoff 동안 반복되고 상한을 넘긴 키는 로그인마다 백스톱이 다시 돈다.
**Fix:** 결선 전 대여를 세션 객체 기준으로 기억한다. `attach` 가 그 객체를 결선할 때 대여 표식을 승계한다.
```ts
readonly #pendingLeases = new WeakMap<HubSession, LeaseMark & { senders: number }>();
// lendSession: 결선 안 됐으면 NOOP 대신 { release: () => this.#pendingLeases.delete(session), noteDisableSent: () => mark.senders++ }
// attach: const m = this.#pendingLeases.get(session); if (m) { this.#lent.set(owner, m); for (i < m.senders) this.#pushDisableSender(owner, "sweeper"); }
```

### R3-06: VI 「거래소당 켜진 1건」 가드는 다른 서버의 끄기 에코를 기다리지 않는다 — 끄기가 유실되면 두 서버 VI 가 함께 켜지고 화면에는 하나만 보인다 (GC-05 잔여)

**File:** `relay/src/ws/fanout.ts:2428-2450`(`#stopViElsewhere` — `send` 성공이면 곧바로 true) · `relay/src/ws/fanout.ts:2137-2138`(이어서 켜기 송신) · `relay/src/hub/subscription-hub.ts:3398-3402`(`#mergeVi` — 켜진 등록본이 둘이면 primary 것 하나 · conflict 는 warn 로그만)
**Issue:**
- `vi.set(run:true)` 가드는 다른 서버 세션에 run:false 를 `send()` 한 것만으로 성공으로 보고, 대상 세션에 켜기를 즉시 보낸다.
- `send()` 의 true 는 버퍼 적재일 뿐이다. 다음 경우 다른 서버의 VI 는 켜진 채로 남는다.
  - 직후 회선 끊김(재접속은 재송신하지 않는다)
  - 서버 거부
  - 캐시 값과 다른 서버 상태
- 이때 브라우저 계약은 거래소당 1건(`{t:"vi", x, cfg}`)이다. `#mergeVi` 는 primary(KB120) 등록본을 보이고, KB121 의 새 VI 는 화면 어디에도 없다.
- 사용자는 실주문을 내는 VI 하나를 볼 수도 끌 수도 없다. 흔적은 relay warn 「두 서버에 같은 거래소 켜진 VI」 뿐이다. 「두 서버 동시 켜짐보다 안전」 이라는 설계 의도(fanout 주석)가 송신 성공 시점에서 끊긴다.

**Fix:**
- 끄기 에코(그 세션 61 · 같은 계좌 · run:false)를 짧은 시한(예: 3초)까지 기다린 뒤에 켜기를 보낸다. 시한을 넘기면 거부 프레임을 보내고 켜기를 보내지 않는다.
- 최소한 `#mergeVi` 의 conflict 가 생기면 그 사용자 연결에 `msg` WARN 1건을 보낸다(「KB120 · KB121 에 같은 거래소 VI 가 함께 켜져 있습니다 — 하나를 끄세요」). 그래야 숨은 VI 를 사람이 알 수 있다.

## Info

### R3-07: 재수립 전 「사용자 sweep 전부 대기」 의 상한이 바퀴 수뿐이다 — 옮겨진 계좌의 주문 불가 구간이 다른 갈래 sweep 만큼 늘어난다

**File:** `relay/src/ws/fanout.ts:510`(`USER_SWEEP_SETTLE_ROUNDS = 3`) · `:1444-1462`(`#userSweepsSettled` — 바퀴마다 `allSettled(current + next)` · 시간 상한 없음) · `:1434`
**Issue:**
- 각 sweep 은 20초 전체 시한이 있고, 레인 `next` 가 하나 더 붙을 수 있다. 그래서 한 바퀴는 최대 약 40초다. 3바퀴면 재수립이 이론상 2분 가까이 밀린다.
- 그동안 지정 변경으로 옮겨진 계좌는 새 서버 세션이 없어 주문이 거부된다(소유 뷰가 이미 새 서버를 가리킨다).
- 29-45 이전에는 자기 sweep 만 기다렸다. 지금은 꺼진 · 죽은 옛 서버로 가는 재시도 sweep 까지 기다린다. GC-01 방어의 의도된 대가지만 상한은 시간으로 두는 편이 맞다.

**Fix:** `#userSweepsSettled` 전체에 벽시계 상한(예: 25초)을 `Promise.race` 로 둔다. 넘기면 warn 뒤 재수립한다. 2차 방어(`releaseSession` 동일성)가 남아 있으므로 안전하다.

### R3-08: 대여 중 「꼬리표 없는 65 억제」 는 29-54 뒤로 필요가 없어졌고, 진짜 서버 발 65 만 숨긴다

**File:** `relay/src/hub/subscription-hub.ts:2615-2618`
**Issue:**
- 29-54 뒤로 sweeper 의 14 는 모두 `sweeper` 꼬리표로 귀속된다(R3-05 의 늦은 결선 경로 제외). 그래서 대여 중 꼬리표 없는 65 는 서버 스스로 낸 비활성화다.
- 이 갈래는 그 65 를 sweep 시간(≤20초) 동안 버린다. 서버가 모든 전략을 끈 사실이 그 사용자 카드 로그에 남지 않는다. 60 에코는 카드를 갱신하지만 「서버가 모든 전략을 비활성화했어요」 문장은 사라진다.

**Fix:** R3-05 를 고친 뒤 이 억제 갈래를 지우고, 꼬리표로만 판단한다.

### R3-09: Admin 「주문 서버」 여러 대 분기는 유일 등록 서버 갈래를 표시하지 않고, 꺼진 지정 경고는 실제 유효 서버와 다른 「기본 KB120 으로」 를 말한다

**File:** `webapp/src/components/admin/account-editor.tsx:479-484`(`effective` 계산) · `:486-491`(`orderServerOff` — 늘 기본) · `:518`(`value={current ?? ORDER_DEFAULT_VALUE}`) · `:553`(경고는 `effective === null` 일 때만)
**Issue:**
- 등록 서버가 [KB121, KB122(꺼짐)] 이고 기본 KB120 이 미등록이며 지정이 없으면 다음과 같이 된다.
  - 규칙 결과: `only-registered` KB121 이다.
  - 화면: 잠긴 「기본 · KB120」 칸이 켜진 채(경고색) 보이고, KB121 칸은 꺼져 보인다. 설명 줄도 없다(`effective !== null`).
  - relay 는 KB121 로 보낸다.
- 꺼진 지정과 기본 미등록이 겹치면(29-55 알려진 사항) 앞 줄 「KB121 꺼짐 — 기본 KB120 으로」 가 실제 결과(유일 등록 서버 또는 없음)와 어긋난다.
- 지금 운영(증권사당 서버 2대 · 기본 서버 켜짐)에서는 생기지 않는다.

**Fix:** `effective?.via === "only-registered"` 이면 그 칸을 「(유일 등록)」 으로 표시하거나 안내 한 줄을 둔다. `orderServerOff` 문구는 `effective` 결과(`effective?.key ?? "없음"`)로 만든다.

### R3-10: `session-manager.ts` 머리 D-18 문단이 VI 설정 세션을 아직 `primaryOf` 로 적는다

**File:** `relay/src/dma/session-manager.ts:26-29`
**Issue:** 29-51 부터 `vi.set` 의 세션은 `fanout #viSessionFor`(계좌 소유 KB 세션)이고, `vi.confirm` 은 `viOrderSessionOf` 다. 29-51 SUMMARY 가 이미 적은 알려진 사항이고, 동작 영향은 없다.
**Fix:** 「VI 설정 · 확인은 계좌 소유 KB 세션(29-51) — 사용자 설정 84 · 세션 상태 표시는 `primaryOf`」 로 고친다.

---

_Reviewed: 2026-10-11T12:40:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
