---
phase: 29-dma-multi-server-admin
plan: 28
subsystem: relay
tags: [wr-02, wr-03, tail-reload, app-access, server-registry, quote-switch, break-then-make, d-04, d-11, gap-closure]
status: complete

requires:
  - phase: 29-26
    provides: "레지스트리 모드 relay 배포 · AppAccess / ServerRegistry 60초 주기 재적재 · QuoteSwitch(29-23) 세대 가드 · 단일 비행"
provides:
  - "relay/src/util/tail-reload.ts — TailReload<T>: 진행 슬롯 1 + 대기 꼬리 슬롯 1 조정기(now()=꼬리 · shared()=공유 · close() · inFlight) — 29-33 계좌별 주문 서버 적재기가 재사용"
  - "AppAccess.reload() = 꼬리 · 주기 타이머 = 공유 — 주기 재적재가 강등 커밋 전 행을 읽는 중이어도 즉시 재적재가 revoked 를 낸다(D-04)"
  - "ServerRegistry.reload()(db) = 꼬리 · 주기 = 공유 — 서버 끄기 · 주문 서버 교체가 주기 재적재와 겹쳐도 즉시"
  - "QuoteSwitch 무동작 판정 · 관측 값 = 키 · host · port 서명 — 같은 키 주소 변경도 break-then-make · 실패 시 옛 주소 복귀 · restore 없음 · 결과 failed"
  - "index.ts registry changed 처리기 — 역할 변경 또는 지금 quote 서버 키의 change.changed 에서 reconcileWithRegistry"
affects: [29-33, 29-41, 29-gap-closure]

tech-stack:
  added: []
  patterns:
    - "즉시 재적재는 대기 꼬리(진행 중 적재 뒤 한 번 더) · 주기 재적재는 진행 공유 — 꼬리가 이미 읽는 중이면 그 뒤 새 대기 꼬리(대기 최대 1)"
    - "연결 대상 동일성은 키가 아니라 키 · host · port 서명으로 판정"

key-files:
  created:
    - relay/src/util/tail-reload.ts
    - relay/tests/tail-reload.test.ts
  modified:
    - relay/src/access/app-access.ts
    - relay/tests/app-access.test.ts
    - relay/src/registry/registry.ts
    - relay/tests/registry.test.ts
    - relay/src/quote/quote-switch.ts
    - relay/src/index.ts
    - relay/tests/quote-switch.test.ts

key-decisions:
  - "TailReload 는 두 슬롯(진행 · 대기 꼬리)만 둔다 — 진행이 끝나면 대기 꼬리를 진행으로 올리고 대기 슬롯을 비우므로, 꼬리가 읽는 중에 온 now() 는 그 꼬리에 합류하지 않고 다음 대기 꼬리를 받는다(커밋 뒤 요청 = 커밋 뒤 읽기 · 동시 RPC 는 진행 1 + 대기 1)"
  - "close() 뒤 진행도 없을 때 now()/shared() 는 거부된 Promise — 호출자(AppAccess · ServerRegistry)가 자기 closed 판정으로 먼저 막아 { ok: false } 를 돌려준다. 시작 안 한 대기 꼬리는 진행 적재 결과로 풀린다(매달림 없음)"
  - "AppAccess.lookup 의 「진행 중이면 기다린다」 는 shared()(첫 적재 대기 의미 그대로) · 미스 단발 재적재는 reload()=now()"
  - "QuoteReconcileOutcome 에 failed 추가 — 같은 키 주소 변경 실패(옛 주소 복귀 · DB 되돌림 없음)를 다른 키 실패(restored)와 구분"
  - "같은 키 주소 변경 로그는 키 + addressOnly 플래그만 — host 는 로그 인자에 싣지 않는다(T-26-05)"

patterns-established:
  - "즉시 반영 경로(Express → /internal/admin/*/reload)는 TailReload.now(), 주기 타이머는 TailReload.shared()"

requirements-completed: [ADMIN-11, ADMIN-04, ADMIN-07]

coverage:
  - id: D1
    description: "TailReload 조정기 — 진행 없으면 바로 · 진행 중 now() 는 꼬리 · 꼬리 시작 전 겹친 now() 는 같은 꼬리(적재 2회) · 꼬리 읽는 중 커밋 뒤 now() 는 새 대기 꼬리(적재 3회) · shared() 는 꼬리 없음 · 실패해도 꼬리 · close 뒤 새 적재 없음"
    requirement: "ADMIN-11"
    verification:
      - kind: unit
        ref: "relay/tests/tail-reload.test.ts (8 cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "AppAccess — 주기 재적재가 옛 행을 읽는 중 강등 커밋 → 즉시 reload() 가 revoked [u1] · 이벤트 1회 · 경합 구간 RPC 2회 · 주기 틱만 겹치면 RPC 1회"
    requirement: "ADMIN-11"
    verification:
      - kind: unit
        ref: "relay/tests/app-access.test.ts#WR-02 — 주기 재적재가 옛 행을 읽는 중 강등 커밋 → 즉시 reload() 는 꼬리로 강등을 반영"
        status: pass
      - kind: unit
        ref: "relay/tests/app-access.test.ts#주기 타이머만 겹치면(즉시 요청 없음) RPC 1회"
        status: pass
    human_judgment: false
  - id: D3
    description: "ServerRegistry — 주기 적재가 KB120 주문 서버 행을 읽는 중 KB121 교체 커밋 → 즉시 reload() { ok: true, changed: true } · roles · orderServerOf KB = KB121 · select 2회 · env 원천 reload 무변경"
    requirement: "ADMIN-04"
    verification:
      - kind: unit
        ref: "relay/tests/registry.test.ts#WR-02 — 주기 적재가 옛 행(KB120 주문 서버)을 읽는 중 KB121 로 교체 커밋"
        status: pass
    human_judgment: false
  - id: D4
    description: "QuoteSwitch 주소 추종 — 같은 키 다른 포트 → 옛 소켓 닫고 새 주소 role 1 로그인 · 재구독 1회 · 동시 소켓 0 · 같은 주소 무동작 · switchTo 직접 · 실패 시 옛 주소 복귀 · restore 0 · error 1줄 · 재시도 없음"
    requirement: "ADMIN-07"
    verification:
      - kind: integration
        ref: "relay/tests/quote-switch.test.ts#A1~A4 (가짜 게이트웨이 2대 · 실 QuoteFeed · 실 SubscriptionHub)"
        status: pass
      - kind: integration
        ref: "relay/tests/quote-status.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "index.ts registry changed 처리기 — 지금 quote 서버 키가 change.changed 에 있으면 reconcileWithRegistry 호출"
    requirement: "ADMIN-07"
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/relay run typecheck · grep -c currentServerKey relay/src/index.ts = 2"
        status: pass
    human_judgment: true
    rationale: "index.ts 부팅 결선은 단위 테스트가 없다 — 실 relay 에서 시세 주 서버 카드 주소 변경 → quote 재연결은 29-41 배포 뒤 운영 확인이 필요하다"

actuals:
  tokens: 13600
  tasks: 3
  commits: 3
plan_head_before: f45d11cebad2244f836fed94978572243caced3f
plan_head_after: 1d787eaf9ceb0d46aaf9123df8b816ed1fa90107

duration: 7min
completed: 2026-10-10
---

# Phase 29 Plan 28: 즉시 재적재 꼬리(WR-02) · 시세 주 서버 주소 추종(WR-03) Summary

**`TailReload` 두 슬롯 조정기(진행 1 + 대기 꼬리 1)로 AppAccess · ServerRegistry 의 즉시 재적재가 진행 중 주기 재적재 뒤 한 번 더 읽어 강등 · 서버 편집을 즉시 반영하고, QuoteSwitch 는 키 · host · port 서명으로 같은 키 주소 변경을 break-then-make 로 따라간다**

## Performance

- **Duration:** 약 7분
- **Started:** 2026-10-10T07:55:18Z
- **Completed:** 2026-10-10T08:01:47Z
- **Tasks:** 3
- **Files modified:** 9 (신규 2 · 수정 7)

## Accomplishments

- **WR-02 닫힘(AppAccess).** 60초 주기 재적재가 강등 커밋 **전에** 시작돼 옛 행(u1 = trader)을 읽고 있어도, Express 가 커밋 직후 부른 `reload()` 는 그 적재가 끝난 뒤 꼬리로 한 번 더 읽어 `revoked: [u1]` 로 풀리고 `revoked` 이벤트가 1회 난다. 주기 틱만 겹칠 때는 종전처럼 RPC 1회다.
- **WR-02 닫힘(ServerRegistry).** 주기 select 가 KB120 주문 서버 행을 들고 멈춘 동안 KB121 로 교체 커밋 → 즉시 `reload()` 가 `{ ok: true, changed: true }` · `roles` · `orderServerOf("KB") = KB121`. env 원천은 종전대로 즉시 `{ ok: loaded, changed: false }`.
- **체커 지적 경합 고정.** 꼬리 T1 이 v1 을 읽는 중 v2 커밋 → 그 뒤 `now()` 는 T1 에 합류하지 않고 새 대기 꼬리 T2 를 받아 v2 로 풀린다(적재 3회 · T2 시작 전 겹친 호출은 T2 공유 — 대기 꼬리 최대 1).
- **WR-03 닫힘.** 시세 주 서버 카드에서 같은 키(KB120)의 포트를 고치면 옛 주소 소켓을 닫고 새 주소에 같은 KB 비밀로 role 1 로그인 → 합집합 재구독 1회. 두 소켓이 동시에 살아 있는 순간이 없다(D-11 · 관찰자 정원). 새 주소 로그인이 실패하면 옛 주소로 돌아오고 DB 되돌림(restore)은 부르지 않으며 error 1줄을 남긴다. 같은 관측 값이 다시 와도 재시도하지 않는다.
- `index.ts` 레지스트리 변경 처리기가 역할 변경뿐 아니라 지금 quote 서버 키의 `change.changed` 에서도 보정을 부른다.

## Task Commits

1. **Task 1: 트레이서 — TailReload 조정기 · AppAccess 즉시 재적재 꼬리** — `ec18133f` (fix)
2. **Task 2: ServerRegistry 즉시 재적재 꼬리** — `4d317d01` (fix)
3. **Task 3: 시세 주 서버 host · port 변경 추종** — `1d787eaf` (fix)

트레이서 피드백 게이트: 대화형 · `end-of-phase` · `<automated>` 만 → Task 1 verify 재실행 green 확인 뒤 확장(Task 2 · 3)으로 진행.

## TDD 기록 (task 단위 tdd="true")

- **Task 1 RED:** `TailReload` 를 종전 「진행 중 공유」 의미만 가진 골격으로 두고 `tail-reload.test.ts` · `app-access.test.ts` 실행 → 7건 실패. 전부 계획한 단언에서 실패(`expected Promise not to be Promise` · `expected 1 to be 2` · `revoked: []` vs `[u1]` · 대역 「적재 1 이 시작되지 않았다」). import · 문법 · 픽스처 오류 없음 — 유효 RED. **GREEN:** 두 슬롯 구현 + AppAccess 결선 → 24/24.
- **Task 2 RED:** registry 신규 2건이 `changed: true/false` 단언에서 실패(9 통과 · 2 실패). **GREEN:** 11/11.
- **Task 3 RED:** A1 · A3 · A4 가 `noop` vs `switched` · `changed: false` vs `true` · `noop` vs `failed` 에서 실패. A2(같은 주소 무동작)는 종전 동작 그대로 통과 — 기대대로. **GREEN:** quote-switch + quote-status 33/33.
- 플랜 Output 이 「커밋 3개」 라 RED/GREEN 을 task 당 `fix(29-28)` 커밋 하나로 묶었다(`workflow.tdd_mode` 미설정 — 게이트 커밋 분리 강제 없음).

## Files Created/Modified

- `relay/src/util/tail-reload.ts` (신규) — `TailReload<T>`: `now()` · `shared()` · `close()` · `inFlight`. 머리 주석에 두 슬롯 규칙 · 경합 시나리오 · 쓰는 곳 3개.
- `relay/tests/tail-reload.test.ts` (신규) — 8건(꼬리 · 공유 · 3회 경합 · 실패 뒤 꼬리 · close).
- `relay/src/access/app-access.ts` — `#inFlight` 수동 관리 → `TailReload`. 머리 주석 「주기 = 공유 · 즉시 = 꼬리(WR-02)」.
- `relay/tests/app-access.test.ts` — 겹친 reload 계약 갱신(진행 1 + 꼬리 1) · 주기만 겹치면 RPC 1회 · WR-02 강등 경합.
- `relay/src/registry/registry.ts` — db 원천 `#inFlight` → `TailReload`(env 원천은 null). 머리 주석 갱신.
- `relay/tests/registry.test.ts` — 겹침 계약 갱신 · WR-02 주문 서버 교체 경합 · env reload 무변경 단언.
- `relay/src/quote/quote-switch.ts` — `sameEndpoint` · `endpointSignature` · `#observedRegistry`(서명) · 같은 키 주소 변경 분기(`addressOnly` 로그 · 실패 시 `failed`) · 머리 주석 WR-03 문단.
- `relay/src/index.ts` — changed 처리기 조건 `change.roles || change.changed.includes(quoteSwitch.currentServerKey)`.
- `relay/tests/quote-switch.test.ts` — A1~A4(스텁 2대를 같은 키 다른 포트로).

## Decisions Made

frontmatter `key-decisions` 참조. 요점: 꼬리는 「대기 슬롯 1」 이라 동시 RPC 가 늘지 않는다. close 뒤 진행이 없을 때의 호출은 호출자가 막는다. 같은 키 주소 변경 실패는 `failed` 로 구분하고 DB 는 건드리지 않는다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 플랜 `<automated>` 명령이 메인 체크아웃으로 `cd` 한다**
- **Found during:** Task 1 verify
- **Issue:** 세 task 의 `<automated>` 가 `cd /Users/alex/repos/gh-radar && …` 로 시작한다. worktree 실행자가 그대로 돌리면 이 worktree 가 아니라 메인 트리를 검증한다(worktree-path-safety 0c).
- **Fix:** 같은 명령(`pnpm --filter @gh-radar/shared build && … typecheck && … typecheck:tests && … vitest run <파일> --maxWorkers=1 --reporter=verbose`)을 worktree 루트에서 실행했다. 플랜 파일은 고치지 않았다 — 29-41 전체 회귀 · 이후 플랜 작성 시 루트 상대 명령으로 써야 한다.
- **Verification:** 세 task 모두 typecheck 2종 · 지정 테스트 green.

**2. [Rule 3 - Blocking] worktree 에 node_modules 없음**
- **Found during:** 실행 준비
- **Fix:** `pnpm install --frozen-lockfile --offline --filter "@gh-radar/relay..."`(relay + shared · 새 패키지 0 · lockfile 무변경 · 저장소 재사용 356/356). 산출물은 gitignore 대상.

**3. [Rule 1 - 계약 갱신] 종전 「겹친 reload 는 RPC 1회(같은 Promise 공유)」 테스트 2건**
- **Found during:** Task 1 · Task 2
- **Issue:** `app-access.test.ts` · `registry.test.ts` 의 기존 케이스가 WR-02 가 고치려는 바로 그 동작(즉시 재적재가 진행 중 Promise 공유)을 단언했다.
- **Fix:** 새 계약(진행 1 + 꼬리 1 · 꼬리 시작 전 겹친 호출은 같은 Promise · 주기 틱만 겹치면 1회)으로 바꿨다. 주기 공유 의미는 별도 케이스로 계속 잠근다.
- **Committed in:** `ec18133f` · `4d317d01`

**4. [Rule 2 - 결과 구분] `QuoteReconcileOutcome` 에 `failed` 추가**
- **Found during:** Task 3
- **Issue:** 같은 키 주소 변경 실패는 restore 를 부르지 않으므로 기존 `restored` 로 보고하면 사실과 다르다.
- **Fix:** `"failed"` 를 유니언에 추가(소비자는 index 의 `.catch` 뿐 — 영향 없음).
- **Committed in:** `1d787eaf`

---

**Total deviations:** 4 (blocking 2 · 계약 갱신 1 · 결과 구분 1)
**Impact on plan:** 모두 플랜 의도 안. 범위 확장 없음.

## Issues Encountered

- 이웃 회귀 확인으로 `fanout-access.test.ts`(14) · `admin-api.test.ts`(22)를 단일 파일로 돌려 green. 전체 회귀는 29-41 몫이라 돌리지 않았다.

## Known Stubs

없음.

## User Setup Required

없음.

## Next Phase Readiness

- 29-33(G-1 계좌별 주문 서버 적재기)이 `relay/src/util/tail-reload.ts` 를 그대로 쓸 수 있다(`now()` = Admin 저장 직후 · `shared()` = 주기).
- 실 relay 에서 시세 주 서버 카드 주소 변경 → quote 재연결 확인은 29-41 배포 뒤(D5 human_judgment).

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-10*

## Self-Check: PASSED

- FOUND: relay/src/util/tail-reload.ts · relay/tests/tail-reload.test.ts
- FOUND commits: ec18133f · 4d317d01 · 1d787eaf (HEAD 조상)
- acceptance: `export class TailReload` 1 · app-access TailReload 2 · registry TailReload 3 · index currentServerKey 2 · 5개 테스트 파일 68/68 green
