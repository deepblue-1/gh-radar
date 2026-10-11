---
phase: 15-dma-relay-kb-gh-trade-server-10-wss
plan: 01
subsystem: infra
tags: [pnpm-workspace, typescript, esm, nodenext, flatbuffers, websocket, pino, vitest, contract-types]

# Dependency graph
requires:
  - phase: 14-ai-analyst-chatbot
    provides: "packages/shared 계약 파일 규약(chat.ts — UI 라벨 상수를 계약에 두는 선례) + barrel export 형식"
  - phase: external/gh-trade
    provides: "server/scripts/sync-relay-schema.sh (가드 3종 + 멱등 --check) 와 StockDMA.fbs 정본"
provides:
  - "relay/ pnpm 워크스페이스 (ESM + NodeNext, node>=22) — 루트 typecheck/build/test 에 자동 포함"
  - "relay/src/config.ts — DMA/Supabase/시크릿 env 로더 (필수 4 · 선택 6)"
  - "relay/src/logger.ts — gh-radar-relay pino 로거 + DMA 자격증명 redact 경로"
  - "relay/src/generated/** — StockDMA FlatBuffers TS 생성물 41개 + SYNC MARKER .fbs 사본"
  - "packages/shared/src/relay.ts — server·webapp·relay 3자 공유 wss 메시지/주문 DTO/상태 라벨 계약"
affects: [15-02, 15-03, 15-04, 15-05, 15-06, 15-07, 15-08, 15-09, 15-10, 15-11, 15-12, 15-13, 15-14, 15-15, 15-16, 15-17, 15-18, 15-19, 15-20]

# Tech tracking
tech-stack:
  added: [ws@8.21.3, flatbuffers@25.9.23, "@types/ws@8.18.1"]
  patterns:
    - "relay 는 server 와 동일한 ESM + NodeNext (워커의 commonjs 패턴 금지 — 생성 코드가 .js 확장자로 import)"
    - "생성 코드는 손대지 않고 sync-relay-schema.sh 만이 유일 갱신 경로 (--check 무변경이 게이트)"
    - "3자 공유 계약을 packages/shared 단일 파일에 인터페이스-우선으로 선박제"

key-files:
  created:
    - relay/package.json
    - relay/tsconfig.json
    - relay/vitest.config.ts
    - relay/.gitignore
    - relay/src/config.ts
    - relay/src/logger.ts
    - relay/tests/setup.ts
    - relay/src/generated/StockDMA.fbs
    - relay/src/generated/stock-dma/ (39 files)
    - packages/shared/src/relay.ts
  modified:
    - pnpm-workspace.yaml
    - pnpm-lock.yaml
    - packages/shared/src/index.ts

key-decisions:
  - "gh-trade 17-02(884f2ca, 2026-09-05)가 이미 머지돼 LoginResp.accounts()/AccountEntry 접근자가 생성물에 포함됐다 — D-25 [BLOCKING] 스키마 게이트는 이 커밋으로 해소된 상태다"
  - "생성 코드가 strict + NodeNext 로 무수정 컴파일 — tsconfig 완화(skipLibCheck 별도 지정·exclude 확대) 불필요"
  - "RELAY_STATE_LABELS 를 shared 에 두어 브라우저가 상태→문구 switch 를 중복 구현하지 않게 함 (D-36 사상, SPECIALIST_LABELS 선례)"
  - "와이어(JSON) 계약의 가격·수량은 전부 number — 64비트 정수 좁히기 책임은 relay 직렬화 경계에 있다 (D-34)"
  - "RELAY_MAX_FRAME_SIZE 는 shared 에 두지 않는다 — relay 코덱 모듈이 단일 정본"

patterns-established:
  - "relay 워크스페이스 config 5종: package.json(test=vitest run) · tsconfig(NodeNext) · vitest.config(passWithNoTests) · .gitignore(생성 경로 제외 금지) · tests/setup.ts(필수 env 더미)"
  - "파일 상단 4블록 docblock(Phase/Plan+요구사항 ID → 무엇 → D-번호 역참조 → 하지 않는 것) 을 relay 전 파일에 적용"
  - "선택 env 는 '미설정 시 어떤 동작이 되는지'를 주석으로 명시 (server/src/config.ts L18-25 규약)"

requirements-completed: []

# Metrics
duration: 11min
completed: 2026-09-05
---

# Phase 15 Plan 01: relay 워크스페이스 · FlatBuffers 생성물 · 3자 공유 계약 Summary

**relay/ 를 pnpm 워크스페이스로 세우고 gh-trade sync-relay-schema.sh 산출물 42파일을 멱등 커밋한 뒤, server·webapp·relay 가 공유할 wss 메시지·주문 DTO·연결 상태 라벨 계약을 @gh-radar/shared 에 인터페이스-우선으로 박제**

## Performance

- **Duration:** 약 11분
- **Started:** 2026-09-05T11:18Z
- **Completed:** 2026-09-05T11:29Z
- **Tasks:** 3/3
- **Files modified:** 53 (신규 50 · 수정 3)

## Accomplishments

- `relay/` 가 pnpm 워크스페이스 멤버가 되어 루트 `pnpm typecheck` / `pnpm -r run build` / `pnpm -r run test` 에 자동 편입 (SC-1 전제)
- gh-trade `sync-relay-schema.sh` 1회 실행 → `.ts` 41개 + SYNC MARKER `.fbs` 사본 1개 커밋, 직후 `--check` 가 **신규/변경 0 · 삭제 없음**으로 통과 (멱등성 확인)
- 생성 코드가 `strict` + `NodeNext` 에서 **무수정 컴파일** — tsconfig 완화 없이 relay typecheck exit 0
- `packages/shared/src/relay.ts` 로 wss 인바운드 3종 / 아웃바운드 6종 / 상태 9종 + 라벨 / 주문 DTO / close 코드 상수를 단일 진실 소스로 확정 → Wave 2~6 이 서로를 탐색하지 않고 병렬 구현 가능

## Task Commits

1. **Task 1: relay 워크스페이스 스캐폴드 + pnpm 등록** — `d8c18a0` (feat)
2. **Task 2: sync-relay-schema.sh 실행 + 생성물 커밋 (SC-1)** — `b7555ca` (feat)
3. **Task 3: packages/shared/src/relay.ts 계약 타입 (3자 공유)** — `20f19dd` (feat)

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified

- `pnpm-workspace.yaml` — `- relay` 등록 (+ pnpm 11 `allowBuilds` 이관, 아래 이탈 1 참조)
- `relay/package.json` — `@gh-radar/relay`, ESM, `engines.node>=22`, dev/start/build/typecheck/test 5종. deps: ws · flatbuffers · @supabase/supabase-js · express · zod · pino · pino-http · @google-cloud/pino-logging-gcp-config · @gh-radar/shared(workspace:*)
- `relay/tsconfig.json` — server 와 동일 ESM + NodeNext (워커 commonjs 패턴 금지, D-26)
- `relay/vitest.config.ts` — `tests/**` + `src/**` co-located 수집, `passWithNoTests`
- `relay/tests/setup.ts` — `loadConfig()` 필수 env 더미 (DMA_CRED_KEY 는 실제 길이 32B base64)
- `relay/.gitignore` — dist/node_modules/.env 만. flatc 산출 경로는 커밋 대상이라 제외 규칙 없음
- `relay/src/config.ts` — 필수 4 (`SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`·`DMA_CRED_KEY`·`RELAY_ORDER_SECRET`) + 선택 6 (`WS_PORT` 8090 / `ORDER_API_PORT` 8091 / `DMA_HOST` 10.41.1.120 / `DMA_PORT` 9100 / `DMA_BROKER` KB / `SESSION_GRACE_MS` 300000), 각 선택 키에 미설정 시 동작 주석
- `relay/src/logger.ts` — `service: "gh-radar-relay"` + redact 추가 8경로 (`*.password`, `*.dma_password`, `*.dmaPassword`, `*.dma_password_enc`, `*.DMA_CRED_KEY`, `*.RELAY_ORDER_SECRET`, `*.token`, `req.headers['x-relay-secret']`) — T-15-04 대응. camelCase 대응분 `*.dmaCredKey` · `*.relayOrderSecret` 2경로 추가
- `relay/src/generated/**` — `StockDMA.ts` · `stock-dma.ts` · `stock-dma/*.ts` 39개 + `StockDMA.fbs` 사본 (정본 커밋 `884f2ca`, flatc 25.12.19)
- `packages/shared/src/relay.ts` — 3자 공유 계약 (아래 상세)
- `packages/shared/src/index.ts` — 타입 23종 + 값 3종(`RELAY_STATE_LABELS` · `RELAY_WS_CLOSE` · `ORDER_CONDITION_NORMAL`) barrel 등록
- `.planning/phases/15-.../deferred-items.md` — 범위 밖 선재 실패 1건 기록

## Decisions Made

- **생성물 위치·경로:** 스크립트 기본 `RELAY=../../gh-radar/relay` 는 메인 체크아웃을 가리킨다. 병렬 worktree 실행이므로 `RELAY=<worktree>/relay` 를 명시해 실행했다 — 메인 저장소를 건드리지 않았다.
- **`RELAY_MAX_FRAME_SIZE` 미포함:** 계약에는 3자가 실제로 주고받는 것만 둔다. 프레임 상한은 relay 코덱 모듈의 내부 상수다(plan 명시).
- **`RELAY-01` requirements 미완료 처리:** RELAY-01 은 Phase 15 전체(20 plan)가 충족하는 요구사항이다. 15-01 은 그 중 스캐폴드·계약 슬라이스만 담당하므로 `requirements-completed: []` 로 두고 REQUIREMENTS.md 를 갱신하지 않았다. phase 종료 시 일괄 처리 대상.

## 생성물 실측 사실 (후속 plan 전제)

| 사실 | 실측 |
|------|------|
| 생성 `.ts` 개수 | **41** (`StockDMA.ts` 1 + `stock-dma.ts` 1 + `stock-dma/*.ts` 39) + `.fbs` 사본 1 = 총 42 파일 |
| `Envelope` 에 `createEnvelope()` 정적 함수 | **없음** — `startEnvelope` / `add*` / `endEnvelope` 조립 강제 |
| `LoginResp.accounts()` 접근자 | **있음** (`accounts(index, obj?)` · `accountsLength()` · `addAccounts`), `AccountEntry{accountNo, name}` 테이블도 생성됨 |
| SYNC MARKER | `server-repo-commit: 884f2ca` / `synced-date: 2026-09-05` / `flatc-version: 25.12.19` / `source: server/src/protocol/StockDMA.fbs` |
| `--check` 재실행 | 신규/변경 **0** · 삭제 없음 · `.fbs` 사본 최신 → 멱등 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] pnpm 11 이 `pnpm-workspace.yaml` 에 `allowBuilds` 스텁을 써 넣고 install 이 exit 1**
- **Found during:** Task 1 (`pnpm install` 검증 단계)
- **Issue:** 로컬 pnpm 11.15.1 은 `onlyBuiltDependencies` 대신 `allowBuilds` 를 읽는다. 첫 설치에서 pnpm 이 `allowBuilds:` 아래에 `esbuild: set this to true or false` 형태의 **미결 스텁 5줄을 직접 써 넣고** `ERR_PNPM_IGNORED_BUILDS` 로 exit 1 했다. 그 상태로는 relay 의존성 postinstall(esbuild·sharp 등)이 돌지 않아 검증 자체가 진행되지 않는다.
- **Fix:** 스텁을 지우고 기존 `onlyBuiltDependencies` 5종을 `allowBuilds: {esbuild,msw,protobufjs,sharp,unrs-resolver: true}` 로 명시했다. **승인 대상 집합은 그대로**이며(승인 범위 확대 아님), 구버전 pnpm 10.x 호환을 위해 `onlyBuiltDependencies` 도 남겼다. 이유를 주석으로 남겼다.
- **Files modified:** `pnpm-workspace.yaml`
- **Verification:** `pnpm install --frozen-lockfile=false` exit 0, postinstall 6건 정상 실행
- **Committed in:** `d8c18a0`

**2. [Rule 3 - Blocking] vitest 4 는 테스트 0건이면 exit 1 → 루트 `pnpm -r run test` 가 relay 에서 실패**
- **Found during:** Task 1 (plan verification `pnpm --filter @gh-radar/relay test` exit 0 요구)
- **Issue:** Wave 1 시점의 relay 는 테스트가 0건이다. vitest 4 는 `No test files found, exiting with code 1` 로 종료해, 설정이 유효한데도 워크스페이스 전체 테스트가 relay 때문에 깨진다.
- **Fix:** `relay/vitest.config.ts` 에 `passWithNoTests: true` 추가 (사유 주석 포함).
- **Files modified:** `relay/vitest.config.ts`
- **Verification:** `pnpm --filter @gh-radar/relay test` exit 0
- **Committed in:** `d8c18a0`

### 계획 전제와 실측이 어긋난 항목 (수정 아님 — 사실 보고)

**3. [사실 정정] D-25 스키마 게이트가 이미 해소돼 있다 — `LoginResp.accounts` 존재**
- **Found during:** Task 2
- **계획 전제:** plan 의 `must_haves.truths` 와 acceptance 는 "현행 스키마 `LoginResp{success,message}`, `accounts` 필드 **없음**" (`grep -c 'accounts' login-resp.ts` == 0) 을 요구했다.
- **실측:** gh-trade 정본 `StockDMA.fbs` 의 마지막 변경이 `884f2ca` *"feat(17-02): StockDMA.fbs — AccountEntry 테이블·LoginResp.accounts 말미 append"* (2026-09-05) 다. 즉 plan 작성 시점 이후(또는 동시)에 gh-trade Phase 17 의 **스키마 파트가 머지**됐고, 생성물에 `accounts()` / `accountsLength()` / `AccountEntry` 가 포함된다.
- **대응:** **생성 코드를 손대지 않았다(D-26).** 스크립트가 유일한 갱신 경로이고, 손으로 필드를 지우면 `--check` 멱등성 게이트가 영구히 깨진다. 필드는 **말미 append** 라 기존 슬롯 배치가 불변이므로 초반 wave 의 컴파일·와이어 호환에 영향이 없다(순수 상위집합).
- **의미:** plan 의 D-25 truth 중 "계좌 접근자를 참조하는 코드가 이 시점에 존재하지 않는다"는 그대로 유지된다(15-01 은 접근자를 참조하지 않는다). 반면 **계좌·주문 wave 의 [BLOCKING] 선행 조건이던 "gh-trade 17 완료 후 sync 재실행"은 스키마 수준에서 이미 충족**됐다. 다만 **게이트웨이 런타임 동작**(users.toml 인증 · 실제 accounts 채움)까지 gh-trade 17 이 끝났는지는 이 plan 이 검증한 범위가 아니다 — 계좌 wave 진입 전 별도 확인이 필요하다.
- **Files modified:** 없음 (생성물은 스크립트 산출 그대로)

**4. [사실 정정] 생성 파일 수는 40 전후가 아니라 42**
- plan 은 "`stock-dma/*.ts` 38개 · 총 40 파일 전후"로 추정했다. 실측은 `stock-dma/*.ts` **39개**, `.ts` 합계 **41**, `.fbs` 사본 포함 **42**. 스키마에 `AccountEntry` 가 추가되며 1개 늘었다. acceptance 의 `>= 30` 기준은 충족.

**5. [사실 정정] tsconfig 완화가 불필요했다**
- plan 은 "생성 코드가 strict 와 충돌하면 tsconfig 쪽에서 완화하고 주석을 남기라"고 지시했다. 실측은 충돌 없음 — `relay/tsconfig.json` 은 server 와 완전히 동일한 형태로 남았고 어떤 완화도 넣지 않았다(`tsconfig.base.json` 이 이미 `skipLibCheck: true`).

---

**Total deviations:** 2 auto-fixed (둘 다 Rule 3 blocking) + 3 사실 정정 (코드 변경 없음)
**Impact on plan:** 두 auto-fix 는 모두 "plan 이 요구한 검증을 돌리기 위해" 필요한 도구체인 수정이며 기능 범위 확대가 없다. 사실 정정 3건은 계획 전제의 stale 여부를 기록한 것으로, 그 중 3번(D-25 게이트 해소)은 **후속 계좌·주문 wave 의 선행 조건 판단에 직접 영향**을 주므로 오케스트레이터가 반드시 반영해야 한다.

## Issues Encountered

- **범위 밖 선재 실패 1건.** `pnpm -r run test` 가 `packages/shared/src/__tests__/theme.test.ts:25` 에서 실패한다 (`THEME_STOCK_SOURCES` 가 `"ai"` 를 기대하나 실제 3종). 15-01 이 건드린 파일이 아니며(`git diff --name-only 27088f3..HEAD` 로 확인) theme 도메인 판단이 필요해 고치지 않았다. `.planning/phases/15-.../deferred-items.md` 에 기록했다. 루트 `pnpm typecheck` 는 exit 0 으로 영향 없음.
- **worktree 경로.** `sync-relay-schema.sh` 기본값이 메인 체크아웃(`../../gh-radar/relay`)을 가리켜, 그대로 돌렸다면 병렬 실행 중인 메인 저장소에 파일을 썼을 것이다. `RELAY=` 를 worktree 절대경로로 지정해 회피했다 — **후속 plan 에서 이 스크립트를 재실행할 때도 동일 주의가 필요하다.**

## Known Stubs

없음. 이 plan 의 산출물은 설정·생성물·타입 계약뿐이며 UI 로 흐르는 하드코딩 빈 값·플레이스홀더가 없다. `relay/src/index.ts`(엔트리)는 이 plan 의 범위가 아니라 아직 존재하지 않는다 — 후속 wave 산출물이다.

## Verification

| 항목 | 결과 |
|------|------|
| `sync-relay-schema.sh --check` (SC-1 멱등) | exit 0 · 변경 0 |
| 루트 `pnpm typecheck` (relay 포함 13 워크스페이스) | exit 0 |
| `pnpm --filter @gh-radar/relay test` | exit 0 |
| `pnpm --filter @gh-radar/relay build` | exit 0 |
| `grep -c '^  - relay$' pnpm-workspace.yaml` | 1 |
| `RELAY_STATE_LABELS` 런타임 키 수 (shared build 후) | 9 |
| `grep -c 'bigint' packages/shared/src/relay.ts` | 0 |
| `git status --porcelain relay/src/generated` | 0 |

## User Setup Required

없음 — 이 plan 은 외부 서비스 설정을 요구하지 않는다. 단, 후속 wave 를 위해 다음이 **아직 미생성**임을 기록한다(15-RESEARCH §Pattern 7 실측): Secret `gh-radar-dma-cred-key` · `gh-radar-relay-order-secret` · `gh-radar-kb-vpn-password` 3종, relay SA, GCE VM `radar-gw`.

## Next Phase Readiness

**준비된 것**
- Wave 2 이후가 `import { ... } from "@gh-radar/shared"` 로 wss/주문 계약을 즉시 소비할 수 있다.
- `relay/src/dma/*` 가 `./generated/stock-dma/*.js` 를 NodeNext ESM 으로 그대로 import 할 수 있다 (컴파일 확인됨).
- `loadConfig()` · `logger` 가 서 있어 엔트리(`relay/src/index.ts`)와 코덱 모듈이 바로 얹힌다.

**후속 plan 이 알아야 할 것**
1. **D-25 게이트 재평가 필요.** 스키마 수준 선행 조건은 `884f2ca` 로 충족됐다. 계좌·주문 wave 를 앞당길지는 gh-trade 17 의 **런타임 완료 여부** 확인 후 오케스트레이터가 판단할 것.
2. **`sync-relay-schema.sh` 재실행 시 `RELAY=` 명시.** 기본값은 worktree 가 아니라 메인 체크아웃이다.
3. **`--check` 무변경 게이트를 이후 모든 plan 의 verification 에 유지** (T-15-16 — 생성물 수기 편집 방지).
4. `pnpm -r run test` 는 무관한 선재 실패 1건으로 exit 1 이다. relay 단위 검증은 `pnpm --filter @gh-radar/relay test` 로 볼 것.

## Self-Check

- 생성 주장 파일 존재 확인: `relay/package.json` · `relay/tsconfig.json` · `relay/vitest.config.ts` · `relay/.gitignore` · `relay/src/config.ts` · `relay/src/logger.ts` · `relay/tests/setup.ts` · `relay/src/generated/StockDMA.fbs` · `relay/src/generated/stock-dma/login-resp.ts` · `packages/shared/src/relay.ts` — 전부 FOUND
- 커밋 존재 확인: `d8c18a0` · `b7555ca` · `20f19dd` — 전부 FOUND

## Self-Check: PASSED

---
*Phase: 15-dma-relay-kb-gh-trade-server-10-wss*
*Completed: 2026-09-05*
