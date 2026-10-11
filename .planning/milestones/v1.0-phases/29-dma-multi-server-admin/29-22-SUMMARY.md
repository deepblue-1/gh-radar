---
phase: 29-dma-multi-server-admin
plan: 22
subsystem: relay · webapp(trading)
tags: [relay, wss, fanout, journal-status, healthz, react, status-bar, D-10]

requires:
  - phase: 29-03
    provides: ServerRegistry · ServerPipelines · healthz brokers · 부팅 때 KB 주문 서버에 고정된 브라우저 journal.state
  - phase: 29-16
    provides: (유저, 서버) 세션 · 증권사 세션 재사용 규칙(D-10) · session.serverKey
  - phase: 29-20
    provides: fanout UserEntry.sessions(증권사별 세션) · 병합 상태 프레임
  - phase: 29-21
    provides: refreshUserSessions(87 → 새 증권사 세션) · connectedUsers
provides:
  - "shared RelayOrderServerMsg { t: \"order.server\"; broker; current; next } · RelayOrderServerBroker · RelayOutbound +1"
  - "relay WsFanout.notifyOrderServers(orderServerOf) · deps.orderServerOf(인증 스냅샷 · 지우기)"
  - "relay OrderServerJournal — 브라우저 journal.state · healthz journal · 주 매핑 라우팅 = 지금의 KB 주문 서버 파이프라인"
  - "webapp RelayConnectionState.orderServerNotices · 작업대 상태줄 배지 data-slot=order-server-badge"
affects: [29-23, 29-24, 29-25]

actuals:
  tokens: 19350
  tasks: 2
  commits: 2
plan_head_before: 464d55e3ce1626f6191cd7d9a40b80ac634fe13a
plan_head_after: 4b7df732b675148f76cbc2d231a2e15114fb3d83

tech-stack:
  added: []
  patterns:
    - "사용자 단위 표식 기억(#orderNotices) — entry(연결) 수명과 분리해 탭을 다 닫았다 다시 와도 지우기 1건"
    - "현재 원천 getter + watch(이벤트 시점 대조) + refresh(전환 직후 1건) — 전환 가능한 상태 원천의 한 객체 결선"

key-files:
  created:
    - relay/src/registry/order-journal.ts
    - relay/tests/order-server-notice.test.ts
  modified:
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts
    - relay/src/ws/fanout.ts
    - relay/src/index.ts
    - relay/tests/order-api.test.ts
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/components/trading/workbench/workbench-status-bar.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx

key-decisions:
  - "notifyOrderServers 는 레지스트리 changed 마다 부른다(roles 플래그만 보지 않음) — 서버 삭제 · 끄기도 주문 서버를 바꿀 수 있고, 같은 표식은 fanout 기억이 다시 보내지 않는다"
  - "표식 기억은 사용자 단위(entry 와 별개) — 유예 만료 뒤 새 서버 세션으로 재접속하면 인증이 {current: 새 서버, next: null} 을 보낸다"
  - "webapp 은 orderServerNotices 를 소켓 경계(local-status)에서도 비운다(quoteState WR-05 규율) — relay 재기동으로 기억이 사라져도 옛 배지가 남지 않고, 새 소켓 인증 스냅샷이 아직 갈려 있으면 다시 채운다"
  - "OrderServerJournal 모듈 신설 — index.ts 는 top-level await 부팅 파일이라 단위 테스트가 불가해, 「현재 KB 주문 서버 저널」 결선을 주입형 클래스로 빼서 fanout · order-api · 상태 frame 이 같은 객체를 본다"
  - "배지 색은 기존 「확인할 것」 축(--new-bg · --new-bd) · role=status + aria-label = 문구 그대로(status 역할은 내용에서 이름을 얻지 않음) · 버튼 없음(정리와 이동은 사용자 몫)"

patterns-established:
  - "relay 사용자 상태 프레임 = #deliver(userId) 전용 · 인증 스냅샷은 fresh 연결에만 보충 송신(다른 탭 중복 없음)"

requirements-completed: [ADMIN-06]

coverage:
  - id: D1
    description: "레지스트리 KB 주문 서버 KB120 → KB121 → 그 세션 사용자 연결마다 order.server {KB, KB120, KB121} 1건 · 세션 그대로(LoginReq 증가 0) · 반복 없음 · KB 세션 없는 사용자 0 · 교보는 교보만"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "relay/tests/order-server-notice.test.ts#Task 1 ①~④"
        status: pass
    human_judgment: false
  - id: D2
    description: "인증 스냅샷(갈렸을 때만 · 이미 알린 탭 중복 없음) · 유예 만료 뒤 새 서버 세션 → next: null · 주문 서버 되돌아옴 → next: null"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "relay/tests/order-server-notice.test.ts#Task 2 ⑤ ⑤-b ⑤-c ⑥ ⑦"
        status: pass
    human_judgment: false
  - id: D3
    description: "브라우저 journal.state(전이 · 인증 스냅샷) · healthz journal(503 축) · brokers.KB.server 가 지금의 KB 주문 서버를 따라감"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "relay/tests/order-server-notice.test.ts#⑧ ⑧-b ⑧-c"
        status: pass
      - kind: unit
        ref: "relay/tests/order-api.test.ts#29-22 KB 주문 서버 전환 → 다음 healthz 부터 journal = 새 서버 저널"
        status: pass
    human_judgment: false
  - id: D4
    description: "웹 스토어 orderServerNotices(설정 · next null 삭제 · reset · 소켓 경계 비움 · 계약 밖 증권사 무시) + 상태줄 배지 「주문 서버가 KB121 로 바뀜 — 재접속하면 적용」(주문 필 뒤 · KB→교보 순 · 잘림 없음)"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-socket.test.ts#Phase 29 order.server"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx#주문 서버 바뀜 배지"
        status: pass
      - kind: automated_ui
        ref: "playwright:shots/29-22/order-server-badge-{both-390,kb-1280,both-1280}.png (일회용 spec — 잘림 측정 scrollWidth ≤ clientWidth · 상태줄 안)"
        status: pass
    human_judgment: false

duration: 13min
completed: 2026-10-07
status: complete
---

# Phase 29 Plan 22: 주문 서버 바뀜 프레임 · 작업대 배지 Summary

**레지스트리 KB 주문 서버가 바뀌면 relay 가 그 서버를 쓰던 연결 중 사용자에게 `{t:"order.server", broker, current, next}` 1건을 보내 작업대 상태줄에 「주문 서버가 KB121 로 바뀜 — 재접속하면 적용」 배지를 띄운다. 인증 스냅샷 · `next: null` 지우기 · 브라우저 `journal.state` 와 healthz `journal` 의 원천도 이제 지금의 KB 주문 서버를 따라간다(D-10).**

## Performance

- **Duration:** 약 13분
- **Started:** 2026-10-06T19:28:18Z
- **Completed:** 2026-10-06T19:41:00Z
- **Tasks:** 2/2
- **Files modified:** 13 (신규 2)

## 표식 규칙 표 (relay `#syncOrderServerNotices`)

| 경우 | 보냄 | 대상 |
|---|---|---|
| 세션 서버 ≠ 주문 서버 · 처음 | `{current, next}` 1건 · 기억 | 그 사용자 연결 전부 |
| 같은 갈림 · 재적재 | 없음 | — |
| 같은 갈림 · 새 탭 인증 | `{current, next}` 1건 | 그 새 연결만 |
| 같아짐(되돌아옴 · 새 서버 세션) · 기억 있음 | `{current: 지금 세션 서버, next: null}` 1건 · 기억 삭제 | 그 사용자 연결 전부 |
| 그 증권사 세션 없음 · 주문 서버 없음 | 기억 있으면 지우기, 없으면 없음 | 〃 |

호출처: 레지스트리 `changed` → `pipelines.sync` → `orderJournal.refresh` → `fanout.notifyOrderServers` · 인증 직후 스냅샷 끝 · `refreshUserSessions`(29-21 새 증권사 세션) 뒤. 세션은 어디서도 끊거나 옮기지 않는다.

## Task Commits

1. **Task 1: 트레이서 — 레지스트리 주문 서버 변경 → order.server → 웹 스토어 → 상태줄 배지** — `f63e2259` (feat)
2. **Task 2: 인증 스냅샷 · 배지 지우기 · journal.state/healthz 원천 = 현재 KB 주문 서버** — `4b7df732` (feat)

트레이서 피드백 게이트: auto 모드 아님 · `human_verify_mode` end-of-phase · `<verify>` 자동만 → Task 1 verify 재실행 green(relay 4 · webapp 175 · relay 전체 1224) 후 확장(체크포인트 없음).

## Files Created/Modified

- `packages/shared/src/relay.ts` · `index.ts` — `RelayOrderServerMsg` · `RelayOrderServerBroker` · `RelayOutbound` +1 · 머리 이력
- `relay/src/ws/fanout.ts` — `notifyOrderServers` · `#syncOrderServerNotices` · `#sessionServerOf` · `#orderNotices`(사용자 단위 기억) · deps `orderServerOf` · 인증 스냅샷 · `refreshUserSessions` 뒤 동기화 · 머리 주석 10
- `relay/src/registry/order-journal.ts` — 신규 `OrderServerJournal`(frame · health · watch · refresh)
- `relay/src/index.ts` — `orderJournal` 결선(fanout `journalState` · order-api `journal` · 파이프라인마다 `watch`) · `orderServerKeyOf` · changed 순서 · 주 매핑 라우팅 = `kbOrderPipeline()` · 머리 주석 갱신
- `relay/tests/order-server-notice.test.ts` — 신규 12건(실 WsFanout · SessionManager · 스텁 게이트웨이 3대 + OrderServerJournal 스텁)
- `relay/tests/order-api.test.ts` — 전환 healthz 1건 · 하네스 `journalSource`
- `webapp/src/lib/use-relay-socket.ts` — `OrderServerNotices` · 리듀서 `applyOrderServer` · 소켓 경계 · reset · 반환값
- `webapp/src/lib/relay-provider.tsx` — Provider 밖 폴백 값
- `webapp/src/components/trading/workbench/workbench-status-bar.tsx` — 배지 ⑦ · `orderServerBadgeText`
- `webapp/src/components/trading/workbench/trading-workbench.tsx` — `orderServerNotices={relay.orderServerNotices}` 한 줄
- `webapp/src/lib/__tests__/relay-socket.test.ts` — `Phase 29 order.server` 6건 · `workbench-status-bar.test.tsx` 배지 3건

## 스크린샷 (커밋 안 함 — `shots/` 는 추적 제외)

- `.planning/phases/29-dma-multi-server-admin/shots/29-22/order-server-badge-both-390.png` — 폰: 주문 필 뒤 KB 배지, 교보 배지는 다음 줄로 감싸짐(잘림 0 · 측정 scrollWidth = clientWidth)
- `.planning/phases/29-dma-multi-server-admin/shots/29-22/order-server-badge-kb-1280.png` · `order-server-badge-both-1280.png` — 데스크톱 한 줄
- 같은 이름 `-page.png` — 전체 화면
- 방법: 일회용 Playwright spec(로컬 relay 는 env 모드라 레지스트리를 못 바꿔 브라우저 소켓에 프레임 주입) — 촬영 뒤 삭제했다. 지우기(`next: null`)로 배지가 빠지는 것도 같은 spec 에서 확인했다.

## Decisions Made

frontmatter `key-decisions` 참조. 요점: 표식 기억은 사용자 단위 · webapp 은 소켓 경계에서도 비움(이중 안전) · 「현재 KB 주문 서버 저널」 은 주입형 한 객체(`OrderServerJournal`).

## Deviations from Plan

### 계획 대비 배치 · 시그니처 차이

- **신규 모듈 `relay/src/registry/order-journal.ts`**(플랜 files 밖) — 플랜 ② 의 「getter + 래퍼 객체 + roles 변화 때 재결선」 을 한 객체로 묶었다. index.ts 는 top-level await 부팅 파일이라 테스트할 수 없어, 주입형으로 빼야 behavior 「주문 서버 변경 뒤 다음 상태 프레임 · 다음 healthz 부터 새 서버」 를 단위로 검증할 수 있었다. 재결선 대신 「모든 파이프라인을 watch · 이벤트 시점에 현재 원천인지 대조」 를 쓴다(같은 키 재생성도 자연히 따라감).
- **`relay/src/order/order-api.ts` 무변경** — healthz `journal` · `brokers` 는 29-03 부터 요청마다 getter 를 부르므로 코드 변경이 필요 없었다. index 가 `journal: orderJournal` 을 넘기고, `order-api.test.ts` 가 `OrderServerJournal` 로 전환 시나리오를 고정한다(그 테스트의 RED 는 골격 단계 500 — 아래).
- **`trading-workbench.tsx` 한 줄**(플랜 files 밖) — 상태줄에 표식을 넘기는 결선.
- **webapp 소켓 경계 비움**(behavior 에 없음) — `quoteState` WR-05 와 같은 규율. relay 재기동으로 기억이 사라져도 옛 배지가 남지 않는다.
- **배지 `aria-label`** — `role="status"` 는 내용에서 접근 이름을 얻지 않아 「접근 이름 = 문구 그대로」 를 위해 명시했다(Task 1 테스트가 잡음).
- 주 매핑 라우팅(`primaryAccessView`)도 현재 KB 주문 서버 파이프라인으로 옮겼다(플랜 ② 「주 경로 결선을 현재 KB 주문 서버 파이프라인 getter 로」). 운영 결선은 모든 서버가 경로(`ExtraGatewayRoute`)로 가므로 실제 영향은 없다.
- 플랜 지시대로 TDD 태스크도 커밋 1개(test/feat 분리 안 함).

### Auto-fixed Issues

None.

**Total deviations:** 0 auto-fixed · 배치 · 시그니처 차이 6(전부 플랜 의도 안). **Impact:** 범위 밖 변경 없음 · 기존 테스트 무수정(order-api 하네스에 선택 옵션 1개 추가).

## TDD Gate Compliance

- RED: Task 2 신규 테스트를 `OrderServerJournal` 골격(메서드 `미구현` throw) · fanout 미구현 상태로 실행 → **8 failed | 59 passed** — ⑤ ⑤-b ⑥ 은 표식 미도착(waitFor 시한), ⑦ `expected +0 to be 1`, ⑧ ⑧-b ⑧-c 는 골격 `Error: 미구현`, order-api 전환 케이스는 골격 throw 로 `expected 500 to be 503`. ⑤-c(같으면 0 — 부정 케이스)는 그때도 통과(설계상 정상). 의미 평가: fanout 갈래 4건은 계획한 단언(표식 수 · 내용)에서 실패했고, 저널 갈래 4건은 구현 부재로 실패 — 로드 · 문법 오류 없음.
- GREEN: `order-journal.ts` 구현 + fanout 동기화 + index 결선 → 2파일 67/67 · relay 전체 50파일 1233/1233 · webapp 전체 160파일 3725 passed(1 skipped — 기존).
- REFACTOR: index 의 `orderServerKeyOf` 중복 람다를 하나로(같은 커밋).

## Verification

- `pnpm --filter @gh-radar/shared build` · relay `typecheck` · `typecheck:tests` · webapp `typecheck`(+ e2e tsconfig) — error 0
- Task 1 verify: relay `order-server-notice` 4/4 · webapp 2파일 175/175
- Task 2 verify: relay 2파일 67/67 · relay 전체 1233 · webapp 전체 3725
- 수용 기준: `RelayOrderServerMsg` 3 · `notifyOrderServers` fanout+index 3 · 「재접속하면 적용」 2 · `data-slot="order-server-badge"` 1 · fanout `next: null` 5 · index `orderServerOf("KB")` 3
- 스키마 푸시: 해당 없음 · 배포 없음(운영 relay 는 29-25 빅뱅 배포까지 옛 이미지 · push 안 함)

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

- 29-23(시세 주 서버 전환)은 `orderJournal.refresh` 와 같은 자리(레지스트리 `changed`)에 quote 전환을 붙이면 된다. 브라우저 `journal.state` 고정(29-03 남긴 것)은 이 플랜으로 닫혔다.
- 29-25 빅뱅 배포 때 이 프레임 · 배지가 함께 나간다. 옛 webapp 은 모르는 `t` 를 무시하므로 relay 먼저 배포해도 안전하다.

## Self-Check: PASSED

- FOUND: relay/src/registry/order-journal.ts · relay/tests/order-server-notice.test.ts · shots/29-22/order-server-badge-both-390.png
- FOUND: f63e2259 · 4b7df732 (HEAD 조상)
