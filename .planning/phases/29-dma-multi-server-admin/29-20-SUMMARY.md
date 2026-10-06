---
phase: 29-dma-multi-server-admin
plan: 20
subsystem: relay
tags: [relay, hub, fanout, multi-session, d-18, kyobo]
status: complete

requires:
  - phase: 29-16
    provides: "SessionManager (userId, serverKey) 세션 키 · acquireFor · primaryOf(KB 우선) · forAccount 주문 라우팅 · conn.acquiredServers"
  - phase: 29-14
    provides: "서버별 파이프라인(ServerPipelines · access.accountsOf) — brokersFor 의 교보 매핑 원천"
provides:
  - "hub 세션 소유 키 ownerKey(userId, serverKey) 결선 · 세션 몫 캐시 교체/정리 · #primaryOwner(KB 우선 · 없으면 첫 결선) · retainSessions(userId, serverKeys)"
  - "D-18 병합 규칙 — 계좌 66/67 · 상따 64/60 · 83 병합, 61 · 72/73 · 56 · 84 · 76/78 · 77 primary 전용"
  - "fanout brokersFor 주입구(미주입 = KB 만) · 증권사마다 acquireFor → hub.attach · #mergedStateFrame · 탭 닫힘에 세션 전부 release"
  - "index brokersFor = KB 늘 + 교보 주문 서버 저널 매핑에 그 DMA id 계좌가 있을 때만 교보"
affects: [29-21, 29-22, 29-25]

actuals:
  tokens: 27200
  tasks: 2
  commits: 2
plan_head_before: a9c5880b94279bc933972c2839043415b7fdfe45
plan_head_after: 50e06f363da15e3f4c9324e97ec5aed4f680b5b3

tech-stack:
  added: []
  patterns:
    - "캐시 키 앞 = 세션 소유 키(`${userId}|${serverKey}|…`) — 세션 몫 교체는 ownerPrefix, 사용자 조회는 userPrefix 합집합"
    - "사용자 단위 원천은 primary 세션 한 곳(#fromPrimary) — 다른 세션 프레임은 debug 드롭, PC-12 default 계수 불변"
    - "병합 상태 프레임 — 세션 1개면 그 프레임 그대로(단일 세션 화면 무변경), 여럿이면 계좌 합집합 + any-ready"

key-files:
  created:
    - relay/tests/fanout-multi-session.test.ts
    - relay/tests/hub-multi-session.test.ts
  modified:
    - relay/src/hub/subscription-hub.ts
    - relay/src/ws/fanout.ts
    - relay/src/index.ts

key-decisions:
  - "VI 원천(primary 전용)에 61 VI 설정뿐 아니라 72/73 VI 주문 추적 · 56 VI 발동 통보도 넣었다 — VI 설정은 KB 인데 추적 목록이 교보에서 섞이면 화면이 갈린다. 65 집계 · 54 메시지 · 51 주문 통보는 캐시 없는 통과(병합)"
  - "요청도 D-18 을 따른다 — 25(계좌) · 24(상따)는 세션마다 Ready 에서, 21 · 34 · 43 은 primary 세션만(비 primary 의 21 응답은 버려지고 사용자 단위 21 FIFO 만 어지럽힌다)"
  - "primary 가 바뀌면(교보만 있던 사용자에 KB 결선 · KB 분리) 옛 primary 몫 사용자 단위 캐시를 버리고, 새 primary 가 이미 Ready 면 21 · 34 · 43 을 그 세션으로 요청한다"
  - "같은 증권사 다른 서버 키 세션의 결선(D-10 주문 서버 전환 뒤 새 세션)은 옛 서버 세션을 대체한다 — 사용자 × 증권사 세션 1개"
  - "세션 분리(retainSessions)는 fanout 인증이 그 사용자의 살아 있는 연결이 쥔 서버 키 합집합으로 부른다 — 증권사 매핑에서 빠진 세션의 계좌 · 전략이 합집합 뷰에 영원히 남지 않게. 세션 수명은 SessionManager 몫(끊지 않는다). 떼어 낸 세션이 Ready 인 채 다시 결선되면 리스너는 한 벌(WeakSet)이고 #onReady 로 재요청"
  - "병합 상태 프레임: 세션 1개면 그 세션 프레임 그대로(msg · attempt 보존 — 기존 fanout 단언 무수정), 여럿이면 accounts = primary 먼저 · 계좌번호 중복 제거 합집합, s = any-ready(문구는 primary 가 ready 면 primary 것, 아니면 첫 ready 세션 것), 아무도 ready 아니면 primary 프레임"
  - "KB 밖 증권사 세션 acquire 가 null 이면 warn 뒤 그 증권사만 건너뛴다(KB 화면은 선다). KB null 은 종전대로 failed + 1011"
  - "가정(플랜 지시): 같은 계좌번호 문자열이 두 증권사에 동시에 있는 경우는 다루지 않는다 — 상태 프레임 중복 제거는 primary 쪽 항목을 남기고, forAccount 는 먼저 만든 세션을 고른다"

patterns-established:
  - "다중 세션 hub 캐시: 병합 캐시는 소유 키 접두, primary 전용 캐시는 사용자 키 + primary 판정 게이트"

requirements-completed: [ADMIN-06]

coverage:
  - id: D1
    description: "트레이서 — KB · 교보 계좌 사용자 인증 → 세션 2(KB120 · KYOBO119) · 스텁마다 LoginReq 1 · 상태 프레임 accounts 합집합 · 교보 세션은 24 만"
    requirement: ADMIN-06
    verification:
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#① 두 증권사 계좌 사용자"
        status: pass
    human_judgment: false
  - id: D2
    description: "교보 매핑에 없으면 교보 LoginReq 0 · KB 세션 1개만(종전과 같다)"
    requirement: ADMIN-06
    verification:
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#② 교보 매핑에 없으면"
        status: pass
    human_judgment: false
  - id: D3
    description: "KB 만 ready 여도 병합 상태 s = ready"
    requirement: ADMIN-06
    verification:
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#③ KB 만 ready"
        status: pass
    human_judgment: false
  - id: D4
    description: "잔고 66 두 증권사 · 교보 결선 뒤에도 KB 계좌 캐시 유지(재접속 탭 스냅샷에 둘 다) — Pitfall 9 해소"
    requirement: ADMIN-06
    verification:
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#④ 잔고 66"
        status: pass
    human_judgment: false
  - id: D5
    description: "order.new 교보 계좌 → 교보 스텁만 · KB 계좌 → KB 스텁만"
    requirement: ADMIN-06
    verification:
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#⑤ order.new"
        status: pass
    human_judgment: false
  - id: D6
    description: "탭 닫힘 → 두 세션 모두 release(유예) → 유예 만료 뒤 세션 0"
    requirement: ADMIN-06
    verification:
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#⑥ 탭 닫힘"
        status: pass
    human_judgment: false
  - id: D7
    description: "D-18 병합(64/60 · 66/67 · 83) · primary 전용(61 · 72/73 · 84 · 76/78 · 77 드롭 + debug 1) · 세션 몫 교체 · primary 변경"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts (14건)"
        status: pass
    human_judgment: false
  - id: D8
    description: "단일 세션 화면 무변경 — relay 전체 단위 · trading-workbench · me e2e"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "pnpm --filter @gh-radar/relay run test (48 files · 1206)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts · me.spec.ts (101 passed)"
        status: pass
    human_judgment: false

duration: 19min
completed: 2026-10-07
---

# Phase 29 Plan 20: hub 다중 세션 병합(D-18) + 교보 사용자 세션 켜기 Summary

**hub 를 세션 소유 키 `${userId}|${serverKey}` 로 결선하고 계좌 · 상따 · 83 캐시를 세션 몫으로 가른 뒤 D-18 규칙(병합 vs primary 전용)을 프레임별로 적용, wss 인증이 `brokersFor`(KB 늘 + 교보 매핑에 있을 때 교보)로 증권사마다 세션을 열어 한 화면에서 두 증권사 계좌를 보고 교보 계좌 주문이 교보 주문 서버로 간다.**

## Performance

- **Duration:** 약 19분
- **Started:** 2026-10-06T18:54:22Z
- **Completed:** 2026-10-06T19:13:21Z
- **Tasks:** 2
- **Files modified:** 5 (신규 테스트 2)

## Accomplishments

- RESEARCH Pitfall 9 해소 — 교보 세션 결선이 KB 캐시를 지우지 않는다. 교체는 같은 소유 키의 다른 객체일 때뿐이고, 폐기는 그 세션 몫이다.
- D-18 규칙을 hub 한 곳에서 판정(머리 주석에 프레임 표). 사용자 단위 원천은 primary(KB 우선) 세션뿐이고 그 밖 세션 프레임은 debug 드롭.
- fanout 사용자 entry 가 증권사 세션 여럿을 쥐고, 상태 프레임은 병합(계좌 합집합 · any-ready). 세션 1개면 종전 프레임 그대로.
- 운영 결선 `brokersFor` — 교보 세션은 교보 주문 서버 저널 매핑(79/87)에 그 DMA id 계좌가 있을 때만(로그인 거부 루프 방지 · Pattern 5).

## D-18 프레임 표

| 프레임 | 규칙 | 캐시 키 · 교체 범위 |
|---|---|---|
| 51 주문 · 54 메시지 · 65 집계 | 병합(통과) | 캐시 없음 — 어느 세션이든 팬아웃 |
| 66/67 계좌 | 병합 | `${ownerKey}|계좌` — 그 세션 계좌만 |
| 64/60 상따 | 병합 | `${ownerKey}|전략키` — 64 는 그 세션 몫 전량 교체 · `lc.snap` 은 사용자 합집합 · 「64 받았음」 세션별 |
| 83 잔량진행률 | 병합 | `${ownerKey}|isin|ex` — 그 세션 허용 계좌로 거름 · 팬아웃 · 스냅샷은 (isin, ex) 합집합 |
| 61 VI 설정 · 72/73 VI 추적 · 56 VI 통보 | primary 전용 | 사용자 단위 키 — 다른 세션 프레임 debug 드롭 |
| 84 사용자 설정 · 76/78 돌파 · 77 예약 창 | primary 전용 | 〃 |
| 요청 25 · 24 / 21 · 34 · 43 | 세션마다 / primary 만 | Ready 프리페치 |

## Task Commits

1. **Task 1: 트레이서 — 증권사별 acquire · hub 세션 소유 키 · 병합 상태 프레임 · 교보 계좌 주문 라우팅** - `20b5072f` (feat)
2. **Task 2: D-18 캐시 규칙 — 병합(66/67 · 64 · 83) · primary 전용(61 · 72/73 · 56 · 84 · 76/78 · 77) · 세션 몫 교체/정리** - `50e06f36` (feat)

트레이서 피드백 게이트: auto 모드 아님 · `human_verify_mode` end-of-phase · `<verify>` 자동만 → Task 1 verify 재실행 green(3파일 207) 후 확장(체크포인트 없음).

## Files Created/Modified

- `relay/src/hub/subscription-hub.ts` — `ownerKey` · `HubSession.serverKey/broker`(선택 · 미기재 = KB) · 소유 키 결선 · `retainSessions` · `#primaryOwner` · `#afterPrimaryChange` · `#fromPrimary` · `#clearCaches(userId, owner, wasPrimary)` · `#clearPrimaryCaches` · 세션 몫 캐시 키(계좌 · 상따 · 83) · 머리 주석 D-18 표
- `relay/src/ws/fanout.ts` — `brokersFor` 주입구 · 증권사별 acquire · `UserEntry.sessions` · `#stateListener` · `#mergedStateFrame` · 인증 시 쥔 서버 키로 hub/entry 정리
- `relay/src/index.ts` — `brokersFor`(KB 늘 + 교보 매핑 조건) 결선
- `relay/tests/fanout-multi-session.test.ts` — 신규 트레이서 6건(스텁 게이트웨이 2대)
- `relay/tests/hub-multi-session.test.ts` — 신규 D-18 규칙 14건

## Decisions Made

frontmatter `key-decisions` 참조. 핵심: VI 원천을 61 · 72/73 · 56 묶음으로 primary 전용, 요청도 D-18(21 · 34 · 43 primary 만), primary 교체 시 옛 몫 정리 + 새 primary 재요청.

## 가정 · 알려진 한계

- **같은 계좌번호 문자열이 두 증권사에 동시에 있는 경우는 다루지 않는다**(플랜 가정). 상태 프레임 중복 제거는 primary 쪽 항목을 남긴다.
- **교보 전용 사용자(KB 계좌 없음)**: `brokersFor` 는 플랜대로 KB 를 늘 연다 → KB 세션은 게이트웨이 로그인 거부(session_rejected)로 남고 hub primary 는 KB 다. 병합 상태 프레임은 교보 Ready 로 `ready` 이고 계좌 · 상따 · 주문 · 83 은 동작하지만, primary 전용 원천(VI · 84 사용자 설정 · 76/78 · 77)은 비어 있다. 운영에 그런 사용자가 생기면 primary 판정에 「거부 세션 제외」 를 넣거나 `brokersFor` 의 KB 조건을 KB 매핑 기준으로 바꾸는 후속이 필요하다(KB 매핑 미적재 때 KB 화면이 멎는 위험과 맞바꾸지 않으려고 이번엔 플랜 그대로 둠).
- 교보 매핑이 아직 적재 전(관찰자 로그인 전)이면 그 인증에서는 교보 세션을 열지 않는다(보수) — 다음 인증부터 열린다.

## Deviations from Plan

### 계획 대비 배치 차이

- primary 판정(`#primaryOwner`) · 21/34/43 primary 한정 · `retainSessions` · D-10 같은 증권사 대체는 Task 1 커밋에 들어갔다 — 트레이서가 교보 세션을 실제로 열면 교보 세션의 21 응답이 사용자 단위 FIFO 를 어지럽히므로 Task 1 안에서 필요했다. Task 2 RED 는 프레임 단위 규칙(64/60 · 83 세션 몫 · primary 전용 드롭 · 세션 몫 교체)으로 8건 실패를 확인했다.
- 플랜 artifacts 에 없던 공개 메서드 `retainSessions(userId, serverKeys)` 추가 — behavior 「KB 세션이 사라지면 primary = 교보 · 옛 VI 캐시 정리」 를 실제 경로(증권사 매핑에서 빠진 세션)로 만들 진입점이 필요했다(Rule 2 — 매핑에서 빠진 증권사의 잔고가 합집합 뷰에 영구 잔존하는 결함 방지).
- 플랜 지시대로 TDD 태스크도 커밋 1개(test/feat 분리 안 함).

### Auto-fixed Issues

None.

**Total deviations:** 0 auto-fixed · 공개 메서드 1개 추가(Rule 2). **Impact:** 범위 밖 변경 없음 · 기존 테스트 무수정.

## Issues Encountered

None.

## TDD Gate Compliance

- RED: `hub-multi-session.test.ts` 신규 실행 → 8 failed | 6 passed (64 합집합 · 60 보존 · 세션 몫 교체 2 · 83 세션 몫 2 · primary 전용 드롭 · primary 변경).
- GREEN: 상따 · 83 소유 키 · `#fromPrimary` 추가 후 14/14 · relay 전체 48파일 1206/1206.
- REFACTOR: 미사용 지역 변수 1개 제거(같은 커밋).

## Verification

- `pnpm --filter @gh-radar/shared build` · relay `typecheck` · `typecheck:tests` — error 0
- `vitest run tests/fanout-multi-session.test.ts tests/hub.test.ts tests/fanout.test.ts` — 207 passed
- `vitest run tests/hub-multi-session.test.ts tests/hub.test.ts` — 125 passed
- relay 전체: Test Files 48 passed · Tests 1206 passed
- e2e `trading-workbench.spec.ts` · `me.spec.ts` — 101 passed (3.8m · 로컬 relay = 이 소스)
- 수용 기준: hub `ownerKey` 6 · fanout+index `brokersFor` 11 · hub-multi-session `primary` 13
- 스키마 푸시: 해당 없음 · 배포 없음(운영 relay 는 29-25 까지 옛 이미지) · 웹 UI 무변경

## User Setup Required

None.

## Next Phase Readiness

- 29-21(87 반영 → updatePassword/closeForDmaUser 결선)과 29-22(주문 서버 배지)가 이 위에 선다. 29-21 이 DMA 유저 삭제로 교보 매핑을 비우면 다음 인증의 `retainSessions` 가 교보 몫을 병합 뷰에서 뗀다.

## Self-Check: PASSED

- FOUND: relay/tests/fanout-multi-session.test.ts · relay/tests/hub-multi-session.test.ts · relay/src/hub/subscription-hub.ts · relay/src/ws/fanout.ts · relay/src/index.ts
- FOUND commits: 20b5072f · 50e06f36 (HEAD 조상)
