---
phase: 29-dma-multi-server-admin
plan: 06
subsystem: relay
tags: [relay, wss, auth, role-gate, aes-gcm, supabase-rpc, e2e-stub]

requires:
  - phase: 29-01
    provides: "RPC dma_app_access_map() (user_id, email, role, dma_user_id) · dma_users(dma_user_id, password_enc)"
  - phase: 29-03
    provides: "ServerRegistry · ServerPipelines(onCreated 결선) · fanout 주 매핑 파사드 — 런타임 추가 서버 신원 공백을 이 플랜이 닫음"
  - phase: 29-04
    provides: "shared AppRole"
provides:
  - "AppAccess(start · ready · reload · close · loaded · entryOf · dmaUserIdOf · lookup · revoked 이벤트) · APP_ACCESS_REFRESH_MS 60000 · APP_ACCESS_MISS_RELOAD_MIN_MS 2000"
  - "getDmaCredentialsByDmaUser(supabase, dmaUserId, key) — dma_users · AAD = dma_user_id"
  - "createAccessCredentials({ access, supabase, credKey }) → DmaCredentials | null | \"not_ready\""
  - "encryptDmaPassword/decryptDmaPassword(plain|enc, aad, key) — 인자 의미 정정(포맷 · GCM 무변경)"
  - "WsFanoutDeps.credentials? · WsFanout.revokeUser(userId, reason) · WS_CLOSE_ACCESS_REVOKED = 1008"
  - "config.appAccessRefreshMs(APP_ACCESS_REFRESH_MS — production 은 60000 고정)"
  - "relay 단위 스텁 seedAccessMap · seedDmaUsers · e2e 스텁 rpc/dma_app_access_map · dma_users"
affects: [29-11, 29-12, 29-16, 29-20, 29-24, 29-25]

actuals:
  tokens: 27800
  tasks: 3
  commits: 4
plan_head_before: 89718b15cf28ccb0611ded73bb5f7000bc65fb96
plan_head_after: 06e1e55e35a5729d969c1612715785493073dc5d

tech-stack:
  added: []
  patterns:
    - "접근 맵 적재기 = identities/registry 규율(부팅 1회 + 주기 · 겹침 금지 Promise 공유 · 실패 시 직전 유지 · 첫 성공 전 fail closed) + 미스 단발 재적재(최소 간격)"
    - "권한 회수 = 재적재 diff → revoked 이벤트(교체 뒤 방출) → fanout.revokeUser(unauthorized 1프레임 → 1008 → release 유예)"
    - "푸시 신원 한 벌 — 모든 서버 파이프라인이 { access: 그 서버 매핑, identities: AppAccess } (서버별 신원 표 없음)"
    - "fanout 자격증명 주입구 — 미주입이면 종전 경로(기존 단위 테스트 무수정)"

key-files:
  created:
    - relay/src/access/app-access.ts
    - relay/tests/app-access.test.ts
    - relay/tests/fanout-access.test.ts
    - .planning/phases/29-dma-multi-server-admin/.red/29-06-task2-red.json
  modified:
    - relay/src/store/credentials.ts
    - relay/src/ws/fanout.ts
    - relay/src/config.ts
    - relay/src/index.ts
    - relay/src/journal/types.ts
    - relay/src/registry/registry.ts
    - relay/tests/credentials.test.ts
    - relay/tests/journal-boot.test.ts
    - relay/tests/helpers/supabase-stub.ts
    - webapp/e2e/fixtures/relay.ts
  deleted:
    - relay/src/journal/identities.ts
    - relay/tests/journal-identities.test.ts

key-decisions:
  - "AAD = dma_user_id 문자열 그대로(29-11 · 29-24 플랜과 같은 형식). RESEARCH Pitfall 5 의 'dma-user:' 접두는 쓰지 않았다"
  - "권한 회수 판정: 직전 행이 있고 (사라짐 | viewer 로 강등 | DMA 연결이 끊기거나 다른 DMA id 로 바뀜). admin↔trader · 승격 · 새 연결은 회수가 아니다. 첫 적재는 revoked 를 내지 않는다"
  - "revokeUser 는 인증 완료 · unauthorized 연결 둘 다 끊는다(그 userId 의 모든 연결). close 전에 conn.unauthorized=true 로 막아 사이 인바운드가 구독 · 전략을 만들지 못하게 한다"
  - "lookup 미스 단발 재적재 최소 간격 2초 — 승인 대기 사용자의 재접속이 RPC 폭주가 되지 않게. 첫 적재가 진행 중이면 그것을 기다린다(부팅 직후 인증이 곧바로 실패하지 않게)"
  - "접근 맵 미적재 = \"not_ready\" → fanout 의 조회 실패 갈래(failed + 1011). 「권한 없음」 으로 위장하지 않는다"
  - "APP_ACCESS_REFRESH_MS 는 production 에서 env 를 무시(값 검증도 안 함)하고 60000. 비프로덕션은 빈 값 · 0 이하 · 비숫자 기동 거부"
  - "브라우저 journal.state 원천은 29-03 그대로 부팅 때 KB 주문 서버 파이프라인 — 주 서버도 푸시 경로만 AppAccess 로 바뀌었다"

patterns-established:
  - "relay 의 「누가 DMA 를 쓸 수 있나」 = 접근 맵 한 원천(역할 admin/trader + dma_user_id) — webapp middleware 와 같은 app_users 표"

requirements-completed: [ADMIN-03, ADMIN-11]

coverage:
  - id: D1
    description: "AppAccess 적재 — 요청 모양 · fail closed · 행 가드 · dmaUserIdOf(admin/trader + 연결만) · 실패 시 직전 유지(로그에 이메일 · dma id 없음) · 겹침 금지 · close · lookup 단발 재적재 · 진행 중 적재 대기"
    requirement: ADMIN-03
    verification:
      - kind: unit
        ref: "relay/tests/app-access.test.ts#AppAccess — 접근 맵 적재 (Phase 29 D-02 · D-04)"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-19 자격증명 — dma_users AAD = dma_user_id 복호 · 옛 AAD 행 throw · 행 없음 null · 조회 실패 throw(로그 위생) · createAccessCredentials not_ready/null/복호"
    requirement: ADMIN-03
    verification:
      - kind: unit
        ref: "relay/tests/credentials.test.ts#Phase 29 AAD = dma_user_id (D-19)"
        status: pass
      - kind: unit
        ref: "relay/tests/credentials.test.ts#createAccessCredentials (Phase 29 D-02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "트레이서 — wss auth → 접근 맵 → dma_users 복호 → 세션 · viewer/승인 대기/DMA 없음 unauthorized(연결 유지) · 미적재 · 옛 AAD 는 failed + 1011"
    requirement: ADMIN-03
    verification:
      - kind: integration
        ref: "relay/tests/fanout-access.test.ts#wss 역할 게이트 — 접근 맵 → dma_users(AAD dma_user_id) → 세션 (①~⑧)"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-04 즉시 반영 — 재적재 diff → revoked → revokeUser(unauthorized 1프레임 → 1008 → release 유예) · 다른 사용자 무영향 · 재접속 unauthorized"
    requirement: ADMIN-11
    verification:
      - kind: unit
        ref: "relay/tests/app-access.test.ts#AppAccess — 재적재 diff → revoked (Phase 29 D-04)"
        status: pass
      - kind: integration
        ref: "relay/tests/fanout-access.test.ts#D-04 즉시 반영 · 푸시 신원 = AppAccess (⑨~⑪)"
        status: pass
    human_judgment: false
  - id: D5
    description: "푸시 신원 한 벌 — 두 서버 적용 행 · 전략 이벤트가 서버 매핑 + AppAccess 로만 · 맵 밖 · 첫 적재 전 0 프레임 · index 전 파이프라인 같은 경로 · GatewayIdentities 제거"
    requirement: ADMIN-11
    verification:
      - kind: integration
        ref: "relay/tests/fanout-access.test.ts#⑫~⑭"
        status: pass
      - kind: integration
        ref: "relay/tests/journal-boot.test.ts#M1 · M2 (접근 맵 RPC 1벌 · 신원 뷰 조회 0)"
        status: pass
    human_judgment: false
  - id: D6
    description: "e2e 스텁 새 원천 — seedDmaCredential 이 접근 맵 + dma_users(+ 레거시) 시드 · 기존 Playwright 회귀"
    requirement: ADMIN-03
    verification:
      - kind: e2e
        ref: "playwright:e2e/specs/trading-workbench.spec.ts e2e/specs/me.spec.ts e2e/specs/sidebar-tree.spec.ts (109 passed)"
        status: pass
      - kind: e2e
        ref: "playwright:e2e/specs/order-log.spec.ts e2e/specs/unfilled-progress.spec.ts (19 passed — 관찰자 푸시 경로)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-10-07
status: complete
---

# Phase 29 Plan 06: relay 허용/역할 · 자격증명 원천 교체 Summary

**relay wss 인증이 접근 맵(`dma_app_access_map` 60초 사본 `AppAccess`)으로 역할 admin/trader + DMA 연결을 판정하고 `dma_users.password_enc` 를 AAD = dma_user_id 로 복호한다. 재적재 diff 가 강등 · 허용 해제 · DMA 연결 변경을 찾으면 `fanout.revokeUser` 가 그 사용자 wss 를 1008 로 끊고(세션은 종전 유예), 모든 서버 파이프라인의 푸시 신원은 `AppAccess` 한 벌이 됐다(`GatewayIdentities` 제거).**

## Performance

- **Duration:** 약 20분
- **Started:** 2026-10-06T15:24:29Z (2026-10-07 00:24 KST)
- **Completed:** 2026-10-06T15:44:29Z (2026-10-07 00:44 KST)
- **Tasks:** 3/3
- **Files modified:** 16 (신규 4 · 수정 10 · 삭제 2)

## Accomplishments

- **`AppAccess`(신규 `relay/src/access/app-access.ts`)** — identities/registry 규율 복제(부팅 1회 + 60초 · 겹침 금지 · 실패 시 직전 유지 · 첫 성공 전 fail closed). `dmaUserIdOf` 가 `GatewayIdentityView` 를 그대로 만족한다(admin/trader + 연결일 때만). `lookup` 은 맵 미스에 단발 재적재 1회(최소 간격 **2초** `APP_ACCESS_MISS_RELOAD_MIN_MS`), 첫 적재가 진행 중이면 그것을 기다린다. 로그는 행 수 · 역할별 수 · 회수 수만이다.
- **D-19 자격증명** — `encryptDmaPassword/decryptDmaPassword` 인자 이름 · JSDoc 을 `aad` 로 정정(저장 포맷 · GCM 무변경). `getDmaCredentialsByDmaUser` 가 `dma_users` 를 AAD = dmaUserId 로 복호(옛 AAD 행은 throw). `createAccessCredentials` 가 wss 공급자 — 미적재 `"not_ready"` · 역할/연결 미충족 `null` · 그 밖 복호. 옛 `getDmaCredentials` 는 이관(29-24) · dual-write(29-11)용으로 남았다.
- **fanout** — `credentials?` 주입구(미주입이면 종전 `dma_credentials` — 기존 단위 테스트 무수정), `"not_ready"` 는 조회 실패 갈래(failed + 1011). `revokeUser(userId, reason)` — 그 사용자 모든 연결에 `{t:"state", s:"unauthorized"}` 1프레임 → `close(1008)` → `#onClose` 가 release(유예 5분). 브라우저(`use-relay-socket`)는 1008 을 재시도로 받아 재접속하고, 인증에서 unauthorized(연결 유지)에 선다.
- **index 결선** — `AppAccess` 생성 · 관찰자 start 앞에서 `start()` · fanout `credentials` 주입 · `revoked → revokeUser` · **모든 서버 파이프라인**(KB 주문 서버 포함) `{ access: p.access, identities: appAccess }` 하나로 통일. 브라우저 `journal.state` 는 부팅 때 KB 주문 서버만(29-03 그대로). 29-03 이 남긴 「런타임 추가 서버 = 신원 없음」 공백이 닫혔다.
- **e2e · 단위 스텁** — e2e 스텁에 `POST /rest/v1/rpc/dma_app_access_map` · `GET /rest/v1/dma_users`, `seedDmaCredential()` 한 번이 접근 맵(trader + `e2e-dma-user`) · `dma_users`(AAD = dma id) · 레거시 `dma_credentials` 셋을 켜고 `clearDmaCredentials()` 가 셋 다 끈다. relay env `APP_ACCESS_REFRESH_MS: "250"`. 단위 스텁은 `seedAccessMap` · `seedDmaUsers` 추가, 신원 뷰 경로 · `seedIdentities` 제거.

## Task Commits

1. **Task 1: 트레이서 — AppAccess → dma_users 복호(AAD dma_user_id) → wss 역할 게이트 → 세션** — `f868ee78` (feat)
2. **Task 2: D-04 즉시 반영 · 푸시 신원 AppAccess · GatewayIdentities 제거** (TDD)
   - RED — `29092e3c` (test)
   - GREEN — `e0120fdf` (feat) · REFACTOR 없음
3. **Task 3: e2e · 단위 스텁을 새 원천으로 · Playwright 회귀** — `06e1e55e` (test)

플랜 「커밋 3개」 대비 4개 — Task 2 를 TDD 규약(RED → GREEN 분리 커밋)으로 실행했다.

## TDD Gate (Task 2)

- **RED:** `relay/tests/app-access.test.ts` 「사라짐 · viewer 강등 · DMA 연결 끊김 · DMA id 변경 → revoked 1회(배열)…」 가 `#replace` 의 빈 배열 반환 때문에 계획한 단언(revoked 집합)에서 AssertionError 로 실패. 같은 파일 다른 테스트는 green(로드 · 설정 오류 없음). `gsd-tools check tdd-red-evidence` → **RED_EVIDENCE_OK**(`target_test_failed`). 기록: `.red/29-06-task2-red.json`. 보조 RED: fanout-access ⑩⑪ 같은 단언 실패, ⑨ 는 `revokeUser` 미구현 TypeError. ⑫~⑭(푸시 라우팅)는 RED 시점에도 green — `AppAccess` 가 이미 `GatewayIdentityView` 를 만족해 fanout 경로가 그대로 받는 특성 테스트다.
- 첫 RED 기록이 `invalid_record` 로 거부됐다: ① relay pino JSON 로그가 stdout 에 섞임 → 로그 줄을 보고서와 분리 보존, ② vitest TAP 의 다줄 expected 배열이 YAML 들여쓰기를 깸 → 단언을 「정렬한 id 한 줄 비교」 로 바꿔 실패 보고가 한 줄이 되게 했다(검증 의미 동일).
- **GREEN:** `e0120fdf` — 대상 + 보조 테스트 전부 green, relay 전체 41파일 1112건 green.

## Decisions Made

frontmatter `key-decisions` 참조. 요점: AAD 는 `dma_user_id` 원문(접두 없음) · 회수 판정 4갈래(admin↔trader 는 회수 아님) · 미스 재적재 최소 2초 · production 재적재 주기 60000 고정.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 에서 단위 스텁에 `rpc/dma_app_access_map` 경로를 먼저 등록**
- **Found during:** Task 1
- **Issue:** index 가 부팅 즉시 접근 맵 RPC 를 부르는데 `relay/tests/helpers/supabase-stub.ts` 의 `KNOWN_PATHS` 에 없어 journal-boot 의 `unknownRequests() = []` 단언 3곳이 깨진다(Task 1 verify 가 relay 전체를 돌린다).
- **Fix:** Task 1 커밋에 경로 등록 + 빈 배열 응답만. 시드 함수 · `dma_users` · 신원 경로 제거는 Task 3 그대로.
- **Commit:** f868ee78

**2. [Rule 3 - Blocking] `relay/tests/journal-boot.test.ts` M1 · M2 수정(플랜 files 밖 기존 테스트)**
- **Found during:** Task 2
- **Issue:** M2 가 `dma_visibility_identities gateway=in.(KYOBO)` 조회를 기다리고, M1 이 그 경로 0 을 단언했다 — `GatewayIdentities` 제거로 M2 가 타임아웃.
- **Fix:** 두 케이스의 신원 단언을 「접근 맵 RPC 조회 ≥ 1 · 신원 뷰 조회 0」 으로 교체(서버가 둘이어도 신원 원천 한 벌임을 실 프로세스로 증명). 나머지 단언 무변경.
- **Commit:** e0120fdf

**3. [Rule 2 - Correctness] `revokeUser` 가 close 전에 `conn.unauthorized = true`**
- **Issue:** 1008 close 프레임이 처리되기 전에 도착한 인바운드(sub · 전략)가 회수된 사용자의 세션으로 나갈 수 있다.
- **Fix:** 회수 대상 연결을 먼저 unauthorized 로 표시 — 이후 인바운드는 기존 unauthorized 갈래(구독 · 전략 거부)로 간다.
- **Commit:** e0120fdf

**4. [Rule 2 - Correctness] `lookup` 이 첫 적재 진행 중이면 그것을 기다린다**
- **Issue:** 부팅 직후(첫 RPC 왕복 중) 들어온 인증이 「미적재 = 조회 실패(1011)」 로 바로 떨어지면 정상 부팅마다 첫 접속이 한 번 실패한다.
- **Fix:** 진행 중 적재가 있으면 기다린 뒤 판정. 그래도 미적재면 `"not_ready"`.
- **Commit:** f868ee78

**5. [검증 추가] observer 모드 e2e 2 spec 추가 실행**
- Task 2 가 KB 주문 서버 푸시 경로도 AppAccess 로 바꿨으므로 플랜 목록 밖 `order-log.spec.ts`(observer: true · journal.events 푸시) · `unfilled-progress.spec.ts` 도 돌렸다 — 19 passed.

---

**Total deviations:** 4 auto-fixed (Rule 3 ×2 · Rule 2 ×2) + 검증 추가 1. **Impact:** 전부 결선 · 정확성 몫이고 범위 확장 없음. 기존 테스트 수정은 journal-boot M1/M2 의 신원 단언 2곳뿐(제거된 모듈을 직접 단언하던 곳).

## 고친 기존 테스트

- `relay/tests/journal-boot.test.ts` M1 · M2 — 위 Deviation 2. `fanout.test.ts` · `journal-push.test.ts` · `ws-*.test.ts` 는 무수정(fanout 주입 미지정 = 종전 `dma_credentials` 경로).
- `relay/tests/journal-identities.test.ts` — 대상 모듈과 함께 삭제(플랜 ③).

## Verification

- `pnpm --filter @gh-radar/shared build` · relay `typecheck` · `typecheck:tests` · webapp `typecheck`(app + e2e) — 통과
- Task 1: `app-access` · `credentials` · `fanout-access` 3파일 41건 통과 → relay 전체 42파일 1111건 통과(트레이서 게이트 재실행 통과)
- Task 2: `app-access` · `fanout-access` · `journal-push` 3파일 42건 → relay 전체 **41파일 1112건** 통과(신원 테스트 파일 삭제로 파일 수 -1)
- Task 3: relay 전체 1112건 · Playwright `trading-workbench` · `me` · `sidebar-tree` **109 passed** · `order-log` · `unfilled-progress` **19 passed**
- acceptance grep 전부 통과(`export class AppAccess` 1 · `dma_app_access_map` 4 · `getDmaCredentialsByDmaUser` 1 · `from("dma_users")` 1 · `createAccessCredentials` in index 2 · identities.ts 없음 · `new GatewayIdentities|journal/identities.js` 0 · `identities: appAccess` 2 · `revokeUser` in index 2 · e2e `dma_app_access_map` 4 · `/rest/v1/dma_users` 3 · `seedAccessMap` 2)
- 스키마 푸시: 해당 없음(스텁). 운영 relay 재배포 · push: 하지 않음(금지 · 29-25 빅뱅까지 옛 이미지).

## 운영 주의(뒤 플랜 몫)

- 이 커밋의 relay 를 지금 운영에 올리면 **모든 사용자가 unauthorized** 가 된다 — 운영 `dma_users` 는 아직 비어 있고(이관은 29-24 스크립트 · 29-25 런북) 운영 Supabase 에 29-01 마이그레이션도 아직 없다(29-07). 29-03 경고(레지스트리 원천 게이트)와 같은 이유로 29-25 전 재배포 금지.
- 승격(viewer → trader · DMA 연결 추가)은 회수가 아니라 이벤트가 없다 — 열린 unauthorized 연결은 다음 재접속(페이지 이동 · 새로고침)에서 세션을 연다. 즉시 승격 반영이 필요하면 29-11 의 `/internal/admin/access/reload` 뒤 브라우저 재접속 유도가 필요하다.
- `reload()` 공개 — 29-11 `/internal/admin/access/reload` 가 부르면 diff → revoked 가 같은 경로로 즉시 돈다.

## Known Stubs

없음. (`seedAccessMap` · `seedDmaUsers` 는 테스트 헬퍼 API 로 이 플랜 안에서는 소비자가 없다 — 29-11 · 29-16 의 부팅 · 세션 테스트가 쓴다.)

## User Setup Required

None.

## Next Phase Readiness

- 29-11(Admin 반영)이 `AppAccess.reload()` · `encryptDmaPassword(plain, dmaUserId, key)` · `getDmaCredentialsByDmaUser` 를 그대로 쓸 수 있다.
- 29-16(세션)은 `createAccessCredentials` 의 반환 그대로 (유저, 서버) 세션으로 넓히면 된다.

## Self-Check: PASSED

- FOUND: relay/src/access/app-access.ts · relay/tests/app-access.test.ts · relay/tests/fanout-access.test.ts · .red/29-06-task2-red.json
- REMOVED(의도): relay/src/journal/identities.ts · relay/tests/journal-identities.test.ts
- FOUND commits(HEAD 조상): f868ee78 · 29092e3c · e0120fdf · 06e1e55e

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-07*
