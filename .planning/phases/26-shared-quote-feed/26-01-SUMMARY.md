---
phase: 26-shared-quote-feed
plan: 01
subsystem: relay
tags: [flatbuffers, dma, observer, schema-sync, relay]

requires:
  - phase: gh-trade quick-260930-kg3
    provides: "fbs 커밋 ed2e0240 — ObserverLoginReq.role(슬롯 14) · ObserverLoginResp.role(슬롯 26)"
provides:
  - "relay 생성물이 ed2e0240 관찰자 로그인 와이어(role)를 말한다 — sync --check 차이 0"
  - "buildObserverLoginReq({ role?: 0 | 1 }) · 0/1 밖 RangeError(비밀 미포함)"
  - "parseObserverLoginResp → ObserverLoginResult.role(수락 역할 에코)"
  - "테스트 헬퍼: buildObserverLoginRespFrame({ role }) · readObserverLoginRequest().role"
  - "저널 관찰자 로그인 role 0 회귀 잠금"
affects: [26-02 QuoteFeed, 26-03 tracer, relay journal observer]

actuals:
  tokens: 5279
  tasks: 1
  commits: 1
plan_head_before: 775e7f004c8e90f99f6aa84fb164eaca9758204b

tech-stack:
  added: []
  patterns:
    - "스키마 재동기화 · 깨지는 호출부 · 수기 사본 · 테스트 기대값을 한 커밋에 (Pitfall 1)"

key-files:
  created: []
  modified:
    - relay/src/generated/StockDMA.fbs
    - relay/src/generated/stock-dma/observer-login-req.ts
    - relay/src/generated/stock-dma/observer-login-resp.ts
    - relay/src/dma/envelope.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/src/journal/types.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
    - relay/tests/journal-gateway.test.ts
    - relay/tests/journal-boot.test.ts
    - relay/tests/journal-codec.test.ts
    - relay/tests/journal-observer.test.ts

key-decisions:
  - "role 검증은 envelope(buildObserverLoginReq) 한 곳 — 0/1 밖은 서버 거부(79 success=false) 전에 호출자 버그로 throw, 문구에 비밀 없음"
  - "ObserverLoginResult.role 은 필수 number(거부 · 구 게이트웨이는 0) — JournalCodec.buildLoginReq 입력은 무변경이라 저널은 role 0 으로 나간다"

patterns-established:
  - "관찰자 역할 확장은 ObserverLoginReqInput.role 과 ObserverLoginResult.role 두 표면으로만 — 26-02 QuoteFeed 가 role 1 로 로그인하고 에코를 확인한다"

requirements-completed: []

coverage:
  - id: D1
    description: "relay 생성물이 gh-trade ed2e0240 스키마와 일치(--check 신규/변경 0 · .fbs 최신 · 마커 ed2e0240 · blob 2cf7b760…)"
    verification:
      - kind: other
        ref: "RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh --check (gh-trade/server)"
        status: pass
    human_judgment: false
  - id: D2
    description: "buildObserverLoginReq role 왕복(1 → 1 · 생략 → 0) · 0/1 밖 RangeError(비밀 미포함) · parseObserverLoginResp role 에코"
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#관찰자 로그인 role (Phase 26 · ed2e0240)"
        status: pass
    human_judgment: false
  - id: D3
    description: "저널 관찰자 로그인은 여전히 role 0 (19/25 경로 회귀 잠금)"
    verification:
      - kind: integration
        ref: "relay/tests/journal-gateway.test.ts · relay/tests/journal-boot.test.ts (observerLoginRequests toEqual role: 0)"
        status: pass
    human_judgment: false
  - id: D4
    description: "재생성 · 호출부 · 기대값이 컴파일 green 한 커밋 (shared build · relay typecheck · typecheck:tests · webapp typecheck · relay 30파일 755테스트)"
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/shared build && relay typecheck && relay typecheck:tests && webapp typecheck && relay test"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-09-30
status: complete
---

# Phase 26 Plan 01: ed2e0240 관찰자 role 재동기화 Summary

**gh-trade ed2e0240 의 관찰자 로그인 role 슬롯(요청 14 · 응답 26)을 relay 생성물로 받고, envelope role 표면(0 journal · 1 quote · 그 밖 RangeError) · 테스트 헬퍼 · 저널 role 0 잠금을 컴파일 green 한 커밋(fdbd053d)으로 넣었다.**

## Performance

- **Duration:** 약 4분
- **Started:** 2026-09-30T13:00:01Z
- **Completed:** 2026-09-30T13:04Z
- **Tasks:** 1
- **Files modified:** 12

## 동기화 기록

| 항목 | 값 |
|---|---|
| gh-trade HEAD (실행 시점) | `b5b5bfd0` → 실행 중 다른 세션이 docs 커밋 2개 추가해 `930e28053bc21ec347aec7368783227443987104` (fbs 무변경) |
| fbs 마지막 변경 커밋 | `ed2e0240` (`git log -1 -- server/src/protocol/StockDMA.fbs`) |
| 정본 blob | `2cf7b76030110c34200aa6a9ac761c8be7737840` (ed2e0240 · HEAD 모두 동일) |
| flatc | 25.12.19 |
| SYNC MARKER | `server-repo-commit: ed2e0240` · `synced-date: 2026-09-30` |
| 커밋한 생성물 3 경로 | `relay/src/generated/StockDMA.fbs` · `relay/src/generated/stock-dma/observer-login-req.ts` · `relay/src/generated/stock-dma/observer-login-resp.ts` |
| `--check` 결과 (커밋 뒤) | 생성 .ts 58 · 신규/변경 예정 0 · 삭제 예정 없음 · .fbs 사본 최신 |
| TASK_BASE | `775e7f004c8e90f99f6aa84fb164eaca9758204b` |

- **`buy_watch_side`:** 이미 반영(a3610261) — relay 생성물에 접근자 없음, 이번에 할 일 없음.
- **`relay/src/dma/msg-type.ts`:** 무변경(새 MsgType 없음). `session-manager.ts` · `journal/observer.ts` 도 무변경(diff 0줄 확인).

## Accomplishments

- `sync-relay-schema.sh` 반영으로 생성물 정확히 3 경로만 바뀜(손편집 0)
- `ObserverLoginReqInput.role?: 0 | 1` — 생략 = 0, 0/1 밖은 `RangeError("관찰자 로그인 role 이 0(journal) · 1(quote) 이 아니다: …")`(비밀 · 계좌 없음), `createObserverLoginReq` 7번째 인자 `role`
- `parseObserverLoginResp` 가 `role: r.role()` 반환, `ObserverLoginResult.role: number`
- 테스트 헬퍼: `FakeObserverLoginRespInput.role?` → `createObserverLoginResp(…, input.role ?? 0)`, `ObserverLoginRequest.role` ← `req.role()`
- 저널 로그인 기대값에 `role: 0` (journal-gateway 3곳 · journal-boot 4곳) — 19/25 저널 경로 회귀 잠금

## Task Commits

1. **Task 1: ed2e0240 role 재동기화 (한 커밋 · Pitfall 1)** - `fdbd053d` (feat)

**Plan metadata:** (이 SUMMARY 커밋 — docs(26-01))

## TDD 기록

- **RED:** 재동기화(①) 뒤 · 구현 전 envelope role 테스트 3건을 먼저 넣고 실행 — 3건 모두 AssertionError 로 실패(`expected undefined to be 1` · `role 2: expected null to be an instance of RangeError` · 79 에코 `undefined`). 컴파일 에러나 0건 발견이 아닌 의도된 실패.
- **GREEN:** envelope · types · 헬퍼 구현 뒤 3건 통과, 전체 relay 30 파일 · 755 테스트 green(기준선 752 + 신규 3).
- **커밋:** 플랜이 재생성 · 호출부 · 기대값 **한 커밋**(acceptance: relay 커밋 수 == 1)을 강제하므로 RED 를 별도 `test(26-01)` 커밋으로 남기지 않았다. 플랜 type 은 `execute`(tdd 아님)라 plan-level 게이트 대상은 아니다.
- **`check tdd-red-evidence`:** 실행했으나 `INVALID_RED (zero_tests_discovered)` — 검사기는 node-test 형식 TAP 요약(`# tests` · `# fail`)을 읽는데 vitest `tap-flat` 리포터는 그 줄을 내지 않는다(`not ok` 3줄은 정확히 파싱됨). 도구 형식 한계이며 RED 자체는 위 실패 출력으로 확인됐다.

## Files Created/Modified

- `relay/src/generated/StockDMA.fbs` · `stock-dma/observer-login-req.ts` · `stock-dma/observer-login-resp.ts` - gh-trade 스크립트 산출물(role 슬롯)
- `relay/src/dma/envelope.ts` - role 입력 · 검증 · 에코 파싱
- `relay/src/journal/types.ts` - `ObserverLoginResult.role`
- `relay/tests/helpers/frames.ts` · `relay/tests/helpers/fake-gateway.ts` - 헬퍼 role 쓰기/읽기
- `relay/src/dma/__tests__/envelope.test.ts` - role describe 3건 + 기존 Phase 25 왕복 기대값에 `role: 0`
- `relay/tests/journal-gateway.test.ts` · `relay/tests/journal-boot.test.ts` - 저널 로그인 role 0 잠금
- `relay/tests/journal-codec.test.ts` · `relay/tests/journal-observer.test.ts` - 79 결과 픽스처에 `role: 0`

## Decisions Made

- role 검증은 envelope 한 곳에서 — 서버가 거부할 로그인을 보내 재접속 루프를 돌지 않게 호출자 버그로 throw.
- `ObserverLoginResult.role` 은 필수 필드로 — 26-02 QuoteFeed 가 `role !== 1` 이면 role_mismatch 로 판정할 근거(RESEARCH Pitfall 2).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] files_modified 밖 테스트 2개 + 기존 envelope 왕복 기대값 갱신**
- **Found during:** Task 1
- **Issue:** `ObserverLoginResult.role` 필수화로 `tests/journal-observer.test.ts` `loginOk` 픽스처가 typecheck:tests 에서 깨지고, `tests/journal-codec.test.ts` 79 디코드 `toEqual` 과 envelope 기존 Phase 25 왕복 `toEqual` 은 결과에 `role` 키가 새로 생겨 실패한다.
- **Fix:** 세 곳에 `role: 0` 추가(저널 = journal 역할 에코 0). journal-boot 도 플랜이 짚은 2곳 외에 교보 이중 게이트웨이 기대값 2곳(:557 · :560)에 `role: 0`.
- **Files modified:** relay/tests/journal-codec.test.ts, relay/tests/journal-observer.test.ts, relay/src/dma/__tests__/envelope.test.ts, relay/tests/journal-boot.test.ts
- **Verification:** typecheck:tests 0 · relay 전체 755 green
- **Committed in:** fdbd053d

---

**Total deviations:** 1 auto-fixed (Rule 3)
**Impact on plan:** 의미 변화 없는 기대값 보강뿐. 스코프 확장 없음.

## Issues Encountered

- 실행 중 gh-trade 에 다른 세션의 docs 커밋 2개(a8ef1885 · 930e2805)가 들어왔다. fbs 는 무변경(blob 동일 · 마지막 변경 ed2e0240)이라 영향 없음.
- 커밋은 오케스트레이터 지시(ISOLATION=none · master 순차 · branching_strategy none)대로 master 에 직접 했다. push · 배포 없음.

## User Setup Required

None - 외부 설정 없음.

## Next Phase Readiness

- 26-02 `QuoteFeed` 가 `buildObserverLoginReq({ …, role: 1 })` 와 `result.role` 에코를 바로 쓸 수 있다. fake-gateway quote 모드(자동 응답 · 소켓 분리)는 26-02 몫.
- 블로커 없음.

---
*Phase: 26-shared-quote-feed*
*Completed: 2026-09-30*

## Self-Check: PASSED
