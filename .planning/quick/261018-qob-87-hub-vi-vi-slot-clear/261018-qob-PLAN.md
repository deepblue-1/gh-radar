---
phase: quick-261018-qob
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - relay/src/hub/subscription-hub.ts
  - relay/tests/admin-session-sync.test.ts
  - relay/tests/hub-multi-session.test.ts
autonomous: true
requirements: [QOB-87-clear, QOB-no-flicker, QOB-owner-scope, QOB-refill, QOB-shared-helper]

estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "87 로 Ready 세션의 선언 계좌에서 A2 가 빠지면, 그 사용자의 연결 중 브라우저는 그 세션이 알던 A2 의 (계좌, 거래소) 슬롯마다 {t:\"vi.slot.clear\", a, x} 1건을 받는다. 남은 계좌(A1) 슬롯 프레임은 없고, hub getViSlot(U, A2, ·) 은 undefined 다"
    - "같은 (계좌, 거래소)를 다른 결선 세션(다른 서버 소유 키)이 아직 알면 지움 대신 그 값의 vi.slot 1건이 가고, 그 세션의 슬롯은 hub 캐시에 그대로 남는다(owner 단위 — 261017-daz 송신 규칙 재사용)"
    - "일시적 빈 87(유저 0명 · 그 유저 누락)과 재접속 재로그인은 accounts 이벤트를 내지 않아 슬롯을 지우지 않는다. 변화 없는 accounts 이벤트 · 교체된 옛 세션의 accounts 이벤트도 지움 0 — 아직 소유한 계좌 슬롯은 깜빡이지 않는다"
    - "재접속 중(미준비) 세션에서 온 87 제외도 그 계좌 슬롯을 지운다(21 은 보내지 않는다). 다음 Ready 의 21 답은 소유 계좌만 채워 빠진 계좌는 모름 그대로다"
    - "빠졌던 계좌가 87 로 다시 선언되면 기존 WR-03 경로(accounts → 21 재요청 → 61)가 그 슬롯을 다시 채운다 — 브라우저는 지움 뒤 「미조회」 잠금에서 61 로 풀린다(261017-daz 설계 결정 4)"
    - "새 프레임 · 와이어 · 웹 코드 변경 0. 지움 · re-assert 송신은 #clearViOwner 와 같은 헬퍼 하나를 지난다(중복 구현 없음)"
  artifacts:
    - path: "relay/src/hub/subscription-hub.ts"
      provides: "#dropViSlots(userId, owner, drop) — 소유 키 슬롯 중 drop(계좌) 인 것을 지우고 지운 (계좌, 거래소)마다 vi.slot.clear 또는 남은 값 vi.slot 팬아웃. #clearViOwner 와 #onAccounts 가 공유"
      contains: "#dropViSlots"
    - path: "relay/tests/admin-session-sync.test.ts"
      provides: "⑧ 87 제외 → 브라우저 vi.slot.clear → 87 재추가 → 21 → 61 재충전 통합 단언(실 AdminConn · sink · AdminSessionSync · DmaSession · hub · WsFanout · 스텁 게이트웨이)"
      contains: "vi.slot.clear"
    - path: "relay/tests/hub-multi-session.test.ts"
      provides: "P32 VI 슬롯 다세션 describe — 87 제외 지움의 미준비 세션 · 다른 세션 re-assert · 변화 없음 · 옛 세션 무동작 잠금"
      contains: "vi.slot.clear"
  key_links:
    - from: "relay/src/admin/session-sync.ts #apply (104 removeAllowedAccounts)"
      to: "relay/src/hub/subscription-hub.ts #onAccounts"
      via: "DmaSession.removeAllowedAccounts → #emitAccounts → session \"accounts\" → hub attach 리스너(1187)"
      pattern: "session\\.on\\(\"accounts\""
    - from: "relay/src/hub/subscription-hub.ts #onAccounts"
      to: "relay/src/hub/subscription-hub.ts #dropViSlots"
      via: "소유 뷰(ownedAccountsOf) 밖 계좌 술어 — Ready 판정보다 먼저"
      pattern: "#dropViSlots\\(userId, owner, \\(accountNo"
    - from: "relay/src/hub/subscription-hub.ts #clearViOwner"
      to: "relay/src/hub/subscription-hub.ts #dropViSlots"
      via: "항상 참 술어 — 261017-daz 동작 그대로"
      pattern: "#dropViSlots\\(userId, owner, \\(\\) => true\\)"
---

<objective>
quick 261017-daz SUMMARY 「후속 후보」 를 고친다. 87(Admin 계좌 목록)로 어떤 계좌가 세션의 선언 계좌에서 빠질 때 hub `#onAccounts` 가 21 재요청만 판단하고 그 계좌의 VI 슬롯 캐시를 지우지 않아, hub 캐시와 브라우저 `viSlots` 에 빠진 계좌 슬롯이 남는다(사이드바 VI 줄 · /me 「VI 가동」 · 「이 계좌 끄기」 활성 · 작업대 VI 행이 거짓을 말함).

수정: 계좌가 그 세션 소유 뷰에서 빠지는 순간 그 (소유 키, 계좌) 의 VI 슬롯을 hub 캐시에서 지우고, 261017-daz 가 만든 송신 규칙(다른 결선 세션이 그 (계좌, 거래소)를 알면 `vi.slot` re-assert, 아무도 모르면 `vi.slot.clear`)을 같은 헬퍼로 그대로 쓴다.

Purpose: 87 제외 뒤에도 relay 는 그 계좌를 「허용 계좌 아님」 으로 거부하는데 브라우저는 「VI 가동」 을 그리는 어긋남을 없앤다.
Output: hub 1파일(헬퍼 추출 + `#onAccounts` 지움 + 주석), relay 통합 테스트 1건, hub 단위 잠금 3건.

범위 상한: 이것만이다. 새 프레임 · 와이어 변경 · 웹 코드 · 리팩터 · 배포 없음(배포는 이 문서 끝 체크리스트대로 오케스트레이터가 한다). 설계 결정 8 의 범위 밖 항목은 건드리지 않고 SUMMARY 「후속 후보」 로만 남긴다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/261017-daz-in-04-relay-vi-vislots/261017-daz-PLAN.md
@.planning/quick/261017-daz-in-04-relay-vi-vislots/261017-daz-SUMMARY.md

## 설계 결정 (플래너가 코드를 읽고 정함 — 실행자는 다시 판단하지 않는다)

파일 약칭(이 문서 전체): `subscription-hub.ts` = `relay/src/hub/subscription-hub.ts` · `session.ts` = `relay/src/dma/session.ts` · `session-sync.ts` = `relay/src/admin/session-sync.ts` · `snapshot-sink.ts` = `relay/src/admin/snapshot-sink.ts` · `fake-gateway.ts` = `relay/tests/helpers/fake-gateway.ts`. 라인은 계획 시점(HEAD 04660565) 실측이다.

### 1. 「빠짐」 판정 = 지금 소유 뷰와 대조(무상태 차집합 — 새 상태 맵 없음)
- `#onAccounts` 에서 그 소유 키 슬롯 중 계좌가 지금 `ownedAccountsOf(session)`(subscription-hub.ts:766-769 — `allowedAccounts` 계좌번호 집합)에 없는 것을 지운다.
- 이것이 「이전 선언 집합 ∖ 새 집합」 과 같은 근거: hub 슬롯은 쓰일 때부터 소유 뷰 안 계좌뿐이다 — `#viSlots` 쓰기는 `#setViSlot`(3505-3508) 하나이고 호출자는 `#onViTrigger` 의 소유 뷰 밖 아님 갈래(3484-3491)와 소유 계좌만 도는 `#fillViSlots`(3522-3526)뿐이다. `accounts` 이벤트는 `removeAllowedAccounts`(session.ts:427-440 · 축소)와 Ready 중 선언 확인(`#onDeclareResp` 659 · 확대) 두 곳에서만 난다. 그래서 이벤트 시점의 「슬롯 있는 계좌 ∖ 지금 소유 뷰」 = 「직전 소유 뷰 중 슬롯 있던 계좌 ∖ 새 소유 뷰」 다. 슬롯이 없던 계좌는 지울 것도 없다.
- 이전 집합을 따로 들고 있지 않는 이유: 세션 교체 · 분리 · 재로그인마다 그 상태를 맞추는 갈래가 새로 생긴다(리팩터 금지 · 최소 영향). 소유 술어는 동적이다(session-manager.ts:622 → index.ts:261 `effectiveOrderServer`) — 지정 변경으로 소유 뷰에서 빠진 계좌가 같은 이벤트에서 함께 지워져도 relay 라우팅이 보는 뷰와 같아 사실이다.

### 2. 일시적 빈 목록 · 깜빡임 — 지움은 「진짜 제외」 에서만 일어난다 (라인 근거)
| 경우 | 경로 | accounts 이벤트 | 슬롯 |
|---|---|---|---|
| 87 유저 0명(users.toml 로드 실패류) · 그 유저 누락 | session-sync.ts:98-99 `#accountsOf` undefined → continue | 없음 | 무변경 |
| 87 이 그대로(op 5 재요청) | session-sync.ts:103 gone=[] · session.ts:433 `removed === 0` → emit 없음 | 없음 | 무변경 |
| 회선 끊김 · 재접속 중 | `#accounts` 는 끊김에서 비우지 않는다(비우는 곳은 `terminate` 468 뿐 — 상태 프레임만 냄) | 없음 | 무변경 |
| 재로그인(LoginResp) | `#onLoginAccepted` 569 가 목록을 갈고 Ready 에서 `ready`(697)를 낸다 | 없음(`ready`) | 무변경 — 설계 결정 8 (i) |
| 87 이 그 유저를 계좌 0 으로 실음 | snapshot-sink.ts:167-172 warn 뒤에도 `applied`(180) → session-sync 가 전부 제외(fail closed — 기존 동작 · admin-session-sync ③ 이 주문 거부를 단언) | 있음 | 그 세션 슬롯 전부 지움 |
| 87 이 그 계좌를 뺌(본 경로) | session-sync.ts:103-104 → session.ts:427-440 | 있음 | 그 계좌 슬롯만 지움 |
- 계좌 0 87 을 의심할지 말지는 session-sync 의 정책이다(지금은 fail closed 로 허용 목록을 비운다). hub 는 세션 허용 목록 하나를 원천으로 따른다 — relay 가 이미 그 계좌 주문을 거부하는데 「가동」 을 남기면 거짓이다. 지움은 「중지」 가 아니라 「모름」(D-17 3상태)이라 사실 그대로다.
- 디바운스 · 지연 지움은 두지 않는다(261017-daz 설계 결정 2 와 같은 이유 — 거짓 「가동」 창을 되살린다).
- 아직 소유한 계좌의 슬롯은 술어가 거짓이라 구조적으로 건드리지 않는다.

### 3. Ready 와 무관하게 지운다 (21 재요청만 Ready)
- `#onAccounts` 의 지금 첫 줄(3809)은 「옛 세션 · 미준비면 무동작」 이다. 지움은 미준비 검사 **앞**에 둔다.
- 근거: 재접속 중에도 87 제외는 허용 목록을 바로 줄이고 `accounts` 를 낸다(session-sync.ts:22-23 「제외는 상태와 무관」 · `#emitAccounts` 683-686 은 idle 만 거른다). 그 뒤 Ready 의 21 은 소유 계좌만 묻기 때문에 빠진 계좌 슬롯은 아무도 다시 쓰지 않는다 — 지금 안 지우면 영영 남는다.
- 옛 세션 대조(`this.#sessions.get(owner) !== session` → return)는 맨 앞에 그대로 둔다 — 같은 소유 키에 새 세션이 결선된 뒤 옛 세션 이벤트가 새 세션 슬롯을 지우면 안 된다. `owned === null`(목록 없는 가짜 세션)도 판정 불가라 그대로 무동작.
- WR-03 21 재요청 판단(3812-3820)은 미준비 검사 뒤에 그대로 둔다. 지운 계좌는 소유 뷰 밖이라 「모름 계좌」 에 들지 않으므로 87 제외만으로는 21 이 나가지 않는다(종전과 같다).

### 4. owner 단위 · re-assert — 261017-daz 송신 규칙 그대로
- 헬퍼는 `ownerPrefix(owner)`(743-745) 키만 돈다. 다른 소유 키(다른 서버 세션) 슬롯은 건드리지 않는다. session-sync 도 그 87 서버의 세션만 고친다(session-sync.ts:94 `sessionsOnServer`).
- 지운 (계좌, 거래소)마다 `getViSlot(userId, a, x)`(2291-2299 — 그 사용자 결선 세션 중 그 슬롯을 아는 첫 세션)를 다시 보고 undefined 면 `vi.slot.clear`, 아니면 그 값 `vi.slot`. 판정은 지울 슬롯을 다 지운 뒤에 한다(261017-daz 설계 결정 3).

### 5. 헬퍼 공유 — `#clearViOwner` 의 슬롯 지움 · 팬아웃을 `#dropViSlots` 로 뽑는다
- 지금 `#clearViOwner`(3536-3561)의 슬롯 루프(3537-3546)와 송신 루프(3547-3551)를 `#dropViSlots(userId: string, owner: string, drop: (accountNo: string) => boolean): number` 로 옮긴다. 키를 (계좌, 거래소)로 푼 뒤 `drop(계좌)` 가 거짓이면 건너뛰고, 참이면 지우고 모은다. 반환값 = 지운 슬롯 수(`#onAccounts` 로그용).
- `#clearViOwner` 는 그 자리에서 `this.#dropViSlots(userId, owner, () => true)` 를 부르고, VI 주문 추적 · 21 대기열 · `#settleDrains` · 반환값은 그대로 둔다 — 외부 동작 무변경(261017-daz 의 hub-multi-session · order-server-resync 케이스가 잠근다).
- 87 지움은 VI 주문 추적 · 21 대기열 · 대여 배수를 건드리지 않는다 — 세션은 살아 있고 그 세션 21 답은 계속 온다.
- 이것은 공유를 위한 최소 추출이다. 그 밖의 정리 · 이름 바꾸기 · 이동은 하지 않는다.

### 6. 재선언 재충전 — 기존 WR-03 경로가 채운다 (코드 변경 없음)
- Ready: session-sync.ts:105 `declareAccounts` → session.ts:378-418(mode 1 선언) → 55 → `#onDeclareResp`(640-659) 허용 목록 추가 → `accounts` → `#onAccounts` 의 모름 계좌 판정 → `#requestViTriggers(…, { append: true })` → 61 → `#setViSlot` → `vi.slot`.
- 미준비: `declareAccounts` 는 0(378-379) — 다음 로그인 `LoginResp.accounts` 가 users.toml 을 반영하고 Ready → `#onReady` 21 이 채운다.
- 웹은 지움 뒤 「미조회」 잠금(입력값 보존)에서 61 로 풀린다 — 261017-daz 설계 결정 4 · 그 Task 3(f45302f7)가 잠근 동작 그대로라 일관.
- 새 서버 21 답의 첫 프레임이 다른 계좌면 `#fillViSlots(…, "unknown")`(3495)가 A2 를 잠깐 미등록으로 둔 뒤 뒤이은 A2 61 이 덮는다(기존 Flagged assumption · 3448-3449). 그래서 통합 테스트는 프레임 수가 아니라 **순서대로 적용한 최종 Map** 을 단언한다.

### 7. 웹 · 와이어 무변경
- 웹 리듀서 `case "vi.slot.clear"`(webapp/src/lib/use-relay-socket.ts:1148-1158)가 이미 키를 지운다. 소비처 4곳은 261017-daz Task 3 이 「키 없는 Map」 으로 잠갔고 이 작업이 내는 프레임은 같은 프레임이다 — 웹 코드 · 웹 테스트를 손대지 않는다.
- `packages/shared/src/relay.ts` · `relay/src/generated/` 변경 0.

### 8. 범위 밖 — 손대지 않는다 (SUMMARY 「후속 후보」 로만)
- (i) 재로그인 축소 경로: 끊긴 사이 users.toml 이 바뀌면 `#onLoginAccepted`(session.ts:569)가 줄어든 목록으로 갈고 `ready` 만 낸다. 87 이 그 뒤에 오면 session-sync 의 gone 이 [] 라 `accounts` 이벤트가 없어 그 계좌 슬롯이 남을 수 있다(그 세션의 다음 `accounts` 이벤트가 이 작업의 대조로 지운다). 87 이 재로그인보다 먼저 오면 이 작업이 지운다(설계 결정 3).
- (ii) 87 로 빠진 계좌의 VI 주문 추적(`#viOrders`) · 계좌 상태 · 상따 캐시 몫 — 이 작업은 VI 설정 슬롯만이다.

## 실행 규칙
- 커밋: 한글 메시지, Co-Authored-By 넣지 않음, `git add <경로>` 로 경로 지정(`git add -A` · `git add .` 금지), 매 커밋 직전 `git status -sb` 로 남의 변경이 섞이지 않았는지 확인. 다른 세션의 미추적 파일 `.planning/quick/261018-j17-teamflow-broker-net-buy/` · `.planning/sketches/016-teamflow-broker/` 는 읽지도 스테이징하지도 않는다. push · 배포 금지.
- TDD: Task 1 은 RED(실패 테스트) 커밋 → GREEN(구현) 커밋. 커밋 접두사 `test(quick-261018-qob):` / `fix(quick-261018-qob):`.
- 테스트는 relay 관련 vitest 만, 항상 `--maxWorkers=2`(동시 세션 메모리 고갈 사례). E2E · webapp 테스트 금지.
- shared 는 바꾸지 않는다. relay typecheck:tests 는 `packages/shared/dist` 를 본다 — 없으면(새 worktree 등) `pnpm --filter @gh-radar/shared build` 를 먼저 한 번 돌린다(dist 는 gitignore).
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: 트레이서 — 87 제외 한 경로를 Admin 87 → session-sync → DmaSession → hub #onAccounts → 브라우저 vi.slot.clear 까지, 재추가 재충전까지 끝에서 끝으로</name>
  <files>relay/tests/admin-session-sync.test.ts, relay/src/hub/subscription-hub.ts</files>
  <read_first>relay/tests/admin-session-sync.test.ts (rig 140-251 · ①③ 259-314), relay/src/hub/subscription-hub.ts (119-120 · 536-543 · 3529-3561 · 3802-3821), relay/src/admin/session-sync.ts (92-111), relay/tests/helpers/fake-gateway.ts (264-274 respondViSlots · 1223-1251), relay/tests/order-server-resync.test.ts (514-537 — 순서대로 적용하는 slotsOf 패턴)</read_first>
  <behavior>
    - 통합(admin-session-sync, 첫 describe 「AdminSessionSync — 87 → 열린 세션 반영 (29-21)」 끝에 ⑧ 추가): `rig({ d1Kb: [A1, A2] })` 뒤 `r.open()` 전에 `r.kb.respondViSlots([{ accountNo: A2, exchange: "KRX", run: true, orderAmountKrw: 1_000_000n, checkRate: 25 }])` 와 `r.kb.onFrame` 로 GetVITriggerReq(21) 계수를 켠다 → 탭 ready 뒤 받은 `vi.slot` · `vi.slot.clear` 를 받은 순서대로 Map 에 적용(set / delete)하면 키가 A1|KRX · A1|NXT · A2|KRX · A2|NXT 이고 A2|KRX 의 run 이 true, 21 은 2건
    - 같은 테스트: `r.kbAdmin.command({ op: 4, userId: "d1", account: kbAccount(A2) })` → 그 탭이 받은 `vi.slot.clear` 를 `${a}|${x}` 로 정렬하면 정확히 [A2|KRX, A2|NXT](A1 지움 없음) · 적용한 Map 키 = [A1|KRX, A1|NXT] · 잠깐(sleep 100) 뒤에도 21 은 2건 그대로(87 제외만으로는 재요청 없음)
    - 같은 테스트: `r.kbAdmin.command({ op: 3, userId: "d1", account: kbAccount(A2, 2) })` → 21 이 4건이 되고(WR-03 append 재요청) 적용한 Map 의 A2|KRX run 이 다시 true · A2|NXT 는 null(미등록) — 재선언 재충전(설계 결정 6). 최종 Map 으로 단언하고 A2 프레임 수는 단언하지 않는다(설계 결정 6 마지막 줄)
  </behavior>
  <action>
RED 먼저: 위 behavior 의 ⑧ 을 쓴다. 이 파일 머리 「검증 대상」 목록(12-23)에 ⑧ 한 줄을 더한다(87 제외 → 그 계좌 VI 슬롯 vi.slot.clear · 남은 계좌 무변경 · 재추가 → 21 → 61 재충전 · quick-261018-qob). 순서대로 적용하는 Map 헬퍼는 이 파일 안에 둔다(order-server-resync.test.ts:519-526 의 `slotsOf` 와 같은 모양 — 다른 테스트 파일을 import 하지 않는다). 21 계수는 `MSG.GetVITriggerReq`(이미 import 된 `MSG`)로 센다. 지움 대기는 `waitFor` 로 「vi.slot.clear 2건」 을 기다린다 — 구현 전에는 지움이 오지 않아 `조건이 서지 않았습니다` 로 실패하는 것이 RED 다. `pnpm --filter @gh-radar/relay exec vitest run tests/admin-session-sync.test.ts --maxWorkers=2` 로 ⑧ 만 실패함을 확인하고 테스트 파일만 커밋한다. RED 커밋 메시지 예: `test(quick-261018-qob): 87 계좌 제외 → 그 계좌 VI 슬롯 vi.slot.clear · 재추가 시 21 → 61 재충전 통합 단언 (RED)`.

GREEN — `relay/src/hub/subscription-hub.ts` 만 고친다:
1. 설계 결정 5 대로 `#clearViOwner`(3536-3561) 바로 위에 `#dropViSlots(userId: string, owner: string, drop: (accountNo: string) => boolean): number` 를 만든다. 몸통은 지금 3537-3551 의 두 루프를 옮긴 것이다 — 소유 접두 키만 돌고, 키를 `getViSlotsAll`(2271-2285)과 같은 방식(접두 길이만큼 자르고 `lastIndexOf("|")`)으로 (계좌, 거래소)로 푼 뒤 `drop(계좌)` 가 거짓이면 건너뛰고 참이면 지우고 모은다. 다 지운 뒤 모은 (계좌, 거래소)마다 `getViSlot` 을 다시 보고 undefined 면 `{ t: "vi.slot.clear", a, x }`, 아니면 `{ t: "vi.slot", a, x, cfg }` 를 `#fanout` 한다. 지운 수를 돌려준다. 문서 주석: 지금 `#clearViOwner` 문서의 IN-04 문장(3530-3533)을 여기로 옮기고 호출자 둘(`#clearViOwner` — 소유 키 전부 · `#onAccounts` — 소유 뷰 밖이 된 계좌 · quick-261018-qob)을 적는다.
2. `#clearViOwner` 는 옮긴 자리에서 `this.#dropViSlots(userId, owner, () => true)` 를 부른다. VI 주문 추적 루프 · `#pendingViGets.delete` · `#settleDrains` · 반환값은 그대로. 문서 주석은 슬롯 지움이 `#dropViSlots` 를 지난다는 한 줄로 고친다.
3. `#onAccounts`(3808-3821)를 설계 결정 3 순서로 바꾼다: 옛 세션 대조(`this.#sessions.get(owner) !== session` 이면 return) → `owned = ownedAccountsOf(session)` 이 null 이면 return → `const dropped = this.#dropViSlots(userId, owner, (accountNo) => !owned.has(accountNo))` → dropped > 0 이면 info 1줄(userId · `serverKeyOf(session)` · 지운 슬롯 수 · 계좌번호는 싣지 않는다 — 기존 hub 로그 규율), 메시지 예 「[HUB] 소유 뷰에서 빠진 계좌(87 제외) — VI 슬롯 지움」 → `if (!session.isReady) return;` → 지금 모름 계좌 판정 · 21 재요청(3812-3820)은 그대로.
4. 주석만 맞춘다(동작 변경 없음): `#onAccounts` 문서(3802-3807)의 「계좌가 빠지기만 했으면(87) 모름 계좌가 없어 무동작이다」 를 새 동작으로 — 소유 뷰 밖이 된 계좌 슬롯은 Ready 와 무관하게 지운다(재접속 중 제외도 다음 Ready 21 이 다시 쓰지 않으므로) · 일시적 빈 87 · 재로그인은 이 이벤트를 내지 않는다(session-sync.ts:99 · session.ts:433 · 569) · 21 재요청은 Ready 일 때만. 머리 주석 119-120 에 「87 로 소유 뷰에서 빠진 계좌 슬롯도 같은 규칙(`#onAccounts` · quick-261018-qob)」 을 더한다. `HubSession` 의 `accounts` 문서(539-542)에 「· 87 제외 계좌 VI 슬롯 지움(Ready 무관)」 을 더한다.
5. 설계 결정 8 의 범위 밖 항목, `#onReady`, `closeAll`, 웹 · shared 는 건드리지 않는다.
GREEN 커밋 메시지 예: `fix(quick-261018-qob): 87 로 빠진 계좌의 VI 슬롯을 hub 캐시에서 지우고 vi.slot.clear 팬아웃 — #clearViOwner 지움 헬퍼 공유`.
  </action>
  <verify>
    <automated>grep -q "#dropViSlots(userId, owner, () => true)" relay/src/hub/subscription-hub.ts && grep -q "#dropViSlots(userId, owner, (accountNo" relay/src/hub/subscription-hub.ts && pnpm --filter @gh-radar/relay exec vitest run tests/admin-session-sync.test.ts tests/hub-multi-session.test.ts tests/order-server-resync.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests</automated>
  </verify>
  <done>Admin op 4 로 A2 를 빼면 실 경로를 지나 그 탭이 A2|KRX · A2|NXT 의 vi.slot.clear 를 받고 A1 슬롯은 그대로이며, op 3 재추가 뒤 21 → 61 이 A2 슬롯을 다시 채운다. 261017-daz 케이스(hub-multi-session · order-server-resync)가 그대로 통과한다. RED · GREEN 두 커밋이 있고 위 명령이 전부 통과한다.</done>
  <reversibility rating="reversible">hub 내부 캐시 지움 시점 추가 · 기존 프레임 재사용 — 되돌리려면 #onAccounts 의 호출 한 줄을 빼면 된다.</reversibility>
</task>

<task type="auto" tdd="true">
  <name>Task 2: hub 단위 잠금 — 미준비 세션 지움 · 다른 세션 re-assert(owner 단위) · 변화 없음 · 교체된 옛 세션 무동작</name>
  <files>relay/tests/hub-multi-session.test.ts</files>
  <read_first>relay/tests/hub-multi-session.test.ts (62-91 FakeBrokerSession · 1817-1900 「P32 VI 슬롯 다세션 (D-17)」 describe — slotsSeen 1829-1836 · WR-03 두 케이스)</read_first>
  <behavior>
    - (a) 미준비: `kb.emitReady()` → 61 A|KRX run:true · B|KRX unregistered · 빈 Envelope(NXT → A · B 미등록) → `kb.isReady = false`(재접속 중) → `kb.allowedAccounts` 에서 A 를 splice → `kb.emit("accounts")` → 그 뒤 나간 `vi.slot.clear` 를 정렬하면 [A|KRX, A|NXT] · 그 뒤 `vi.slot` 0 · 21 은 2 그대로 · getViSlot(U, A, ·) undefined · B|KRX · B|NXT 는 null 그대로. 이어서 `kb.emitReady()` 와 빈 Envelope 61 → 21 이 4 · B 만 다시 채워지고 A 는 undefined 그대로(다음 Ready 가 빠진 계좌를 되살리지 않는다)
    - (b) re-assert · owner 단위: 같은 사용자의 KB121 가짜 세션 `new FakeBrokerSession(U, "KB121", "KB", [{ accountNo: A, name: "계좌A" }])` 를 attach 하고 그 세션으로 61 A|KRX run:false 를 넣는다 · kb 는 Ready 뒤 A|KRX run:true · B|KRX unregistered · 빈 Envelope → kb 에서 A 를 빼고 accounts → 그 뒤 나간 프레임이 A|KRX 는 `vi.slot`(cfg.run false — KB121 값) 1건 · A|NXT 는 `vi.slot.clear` 1건 · A|KRX 의 `vi.slot.clear` 0 · getViSlot(U, A, "KRX") 의 run 이 false · `getViSlotsAll(U)` 에 KB121 의 A|KRX 가 남아 있다
    - (c) 변화 없음 · 옛 세션: kb Ready 뒤 슬롯을 채우고 accounts 를 그냥 한 번 더 내면 그 뒤 `vi.slot.clear` 0 · `vi.slot` 0. 같은 소유 키 새 세션 kb2(U, "KB120", [A, B])를 attach(이 결선 자체의 지움은 261017-daz 경로 1 이라 세지 않는다 — attach 뒤에 기준점)하고 kb2 로 61 A|KRX run:true 를 넣은 뒤, 옛 kb 의 목록에서 A 를 빼고 `kb.emit("accounts")` → 그 뒤 `vi.slot.clear` 0 · getViSlot(U, A, "KRX") 의 run 이 true(kb2 슬롯 무변경)
  </behavior>
  <action>
`P32 VI 슬롯 다세션 (D-17)` describe(1817-) 의 WR-03 두 케이스(1859-1900) 뒤에 세 케이스를 더한다. `slotsSeen`(1829-1836) 옆에 사용자 U 로 나간 `vi.slot.clear` 를 [a, x] 로 돌려주는 헬퍼를 하나 두고, 단언은 「기준점(`fanned.length`) 뒤에 나간 프레임」 으로 센다. `kb.allowedAccounts` 는 readonly 참조의 가변 배열이다 — 1874 의 `push` 처럼 `splice` 로 뺀다. 61 프레임은 이 describe 가 이미 쓰는 `buildSetVITriggerRespFrame` 로 만든다.
Task 1 GREEN 이 설계 결정 3 · 4 를 이미 구현했으므로 이 세 케이스는 작성 즉시 통과하는 것이 정상이다(동작 잠금) — SUMMARY 에 「구현 전부터 통과(Task 1 덕)」 로 적는다. 하나라도 실패하면 그것은 Task 1 구현이 설계 결정 3 · 4 와 다르다는 뜻이다 — 단언을 고치지 말고 `#onAccounts` / `#dropViSlots` 를 설계 결정대로 고쳐 별도 `fix(quick-261018-qob):` 커밋으로 남기고 SUMMARY Deviations 에 적는다.
커밋 메시지 예: `test(quick-261018-qob): 87 제외 VI 슬롯 지움 — 미준비 세션 · 다른 세션 re-assert · 변화 없음 · 옛 세션 무동작 단언`.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/relay exec vitest run tests/hub-multi-session.test.ts tests/admin-session-sync.test.ts tests/hub.test.ts tests/strategy-hub.test.ts tests/fanout.test.ts tests/fanout-multi-session.test.ts tests/order-server-resync.test.ts tests/account-declare.test.ts tests/session-routing.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests</automated>
  </verify>
  <done>세 단위 케이스가 미준비 세션 지움(+ 다음 Ready 가 되살리지 않음) · 다른 세션 값 re-assert 와 그 세션 슬롯 보존 · 변화 없는 이벤트와 옛 세션 이벤트의 지움 0 을 단언하고, 위 9개 relay 스위트와 두 typecheck 가 통과한다.</done>
</task>

</tasks>

<verification>
- Task 1 · 2 의 automated 명령 전부 통과.
- `git log --oneline -4` 에 quick-261018-qob 커밋이 RED → GREEN → test 순으로 있고, 각 커밋의 파일이 그 태스크 files 안이다(`git show --stat`).
- 변경 범위 재확인: `git diff --stat 04660565 HEAD` 가 `relay/src/hub/subscription-hub.ts` · `relay/tests/admin-session-sync.test.ts` · `relay/tests/hub-multi-session.test.ts` 셋뿐이다(webapp · packages/shared · relay/src/generated 변경 0).
- `#clearViOwner` 외부 동작 무변경: 261017-daz 의 hub-multi-session 세션 교체 · re-assert · closeAll 케이스와 order-server-resync 「IN-04 재수립」 케이스가 단언 수정 없이 통과.
</verification>

<success_criteria>
- 87 로 세션 선언 계좌에서 빠진 계좌의 VI 슬롯이 hub 캐시와 브라우저에서 「모름」 으로 돌아가(다른 세션이 알면 그 값) 사이드바 VI 줄 · /me 상태줄 · 「이 계좌 끄기」 · 작업대 VI 행이 relay 사실과 같다.
- 일시적 빈 87 · 재접속 · 변화 없는 이벤트로는 슬롯이 지워지지 않는다(깜빡임 없음).
- 다시 선언되면 WR-03 경로가 슬롯을 다시 채운다.
- 지움 · re-assert 송신은 `#clearViOwner` 와 같은 헬퍼 하나를 지난다.

## Source Audit (GOAL · REQ · RESEARCH · CONTEXT)
| 출처 | 항목 | 커버 |
|---|---|---|
| GOAL | 87 제외 계좌 VI 슬롯을 hub 캐시에서 지우고 브라우저에 알림 | Task 1 |
| REQ QOB-87-clear | 계좌가 빠지는 순간 (owner, 계좌) 슬롯 지움 + vi.slot.clear | Task 1 · 설계 결정 1 |
| REQ QOB-no-flicker | 빈 87 · 재접속 초기와 진짜 제외 구분 · 깜빡임 없음 | 설계 결정 2 · 3 · Task 2 (a)(c) |
| REQ QOB-owner-scope | 다른 세션(다른 서버)의 같은 계좌 슬롯 무변경 · re-assert | 설계 결정 4 · Task 2 (b) |
| REQ QOB-refill | 재선언 시 WR-03 21 → 61 재충전 · 웹 미조회 잠금과 일관 | 설계 결정 6 · Task 1 (op 3) |
| REQ QOB-shared-helper | 261017-daz 송신 규칙 헬퍼 공유 · 새 프레임 · 와이어 변경 없음 | 설계 결정 5 · 7 · Task 1 |
| REQ | 웹 변경 필요 여부 | 설계 결정 7 — 불필요(리듀서 · 소비처 잠금 기존) |
| REQ | 검증: relay vitest --maxWorkers=2 · typecheck · typecheck:tests · E2E 없음 | Task 1 · 2 verify |
| REQ | 배포 체크리스트 | 아래 「배포 체크리스트」 |
| RESEARCH | 없음(quick) | — |
| CONTEXT | 261017-daz 설계 결정 3(re-assert) · 4(미조회 잠금) | 설계 결정 4 · 6 |
| CONTEXT | D-17 3상태(키 부재 = 모름) | 설계 결정 2 (지움 = 모름 ≠ 중지) |
</success_criteria>

<output>
`.planning/quick/261018-qob-87-hub-vi-vi-slot-clear/261018-qob-SUMMARY.md` 를 만든다(커밋은 오케스트레이터 몫). 포함: 태스크별 커밋 해시(RED/GREEN/test), 구현 전부터 통과한 케이스 목록, Deviations(있으면), 변경 파일 범위 확인 결과, 「후속 후보」(설계 결정 8 (i) 재로그인 축소 경로 — session.ts `#onLoginAccepted` · (ii) 87 제외 계좌의 VI 주문 추적 · 계좌 상태 · 상따 캐시), 아래 배포 체크리스트 사본.
</output>

## 배포 체크리스트 (실행자 범위 밖 — 오케스트레이터가 메인 세션 · 샌드박스 밖에서 집행)

웹 변경이 없으므로 relay 배포 하나다. 순서 규칙(relay 먼저 → push 나중 — push 자체가 webapp 프로덕션 배포 경로)은 지킨다.

1. **시점:** 장 시간(08:00~20:00 KST) 밖 권장 — relay 재시작은 모든 wss 를 끊는다.
2. **트리 확인:** `git status -sb` 로 master 가 executor 마지막 커밋이고 남의 로컬 커밋 · 미커밋 추적 변경이 없는지 본다. `scripts/deploy-relay.sh` 는 `SHA=$(git rev-parse --short HEAD)`(486)로 태그하고 저장소를 빌드 컨텍스트로 쓰므로, 다른 세션 커밋이 섞였으면 이 작업 커밋에서 만든 detached worktree 에서 배포한다(32-14 선례).
3. **인증 env:** Deployer SA — `GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json` · `CLOUDSDK_CORE_PROJECT=gh-radar`.
4. **relay 배포:** `GCP_PROJECT_ID=gh-radar SUPABASE_URL=https://<ref>.supabase.co NOTIFICATION_CHANNEL_ID=<채널 ID> bash scripts/deploy-relay.sh`. `SUPABASE_URL` 은 필수(deploy-relay.sh:491 `:?`), `NOTIFICATION_CHANNEL_ID` 는 선택. 명령은 허용 규칙 접두사 그대로 — `yes |` · 출력 파이프를 붙이지 않는다.
5. **스모크:** `bash scripts/smoke-relay.sh` — INV 전부 PASS(비밀 필요 항목 SKIP 정상). `curl -s https://dma.jx1.io/healthz` 의 `version` 이 새 SHA 인지 확인. Cloud Logging `relay_docker` 에 오류 · 스키마 위반 0 확인(infra/relay/README.md 조회 예시).
6. **push:** relay 스모크 통과 뒤에만 `git push`. 이번 변경은 relay · `.planning` 뿐이라 webapp 빌드는 ignoreCommand(`scripts/vercel-ignore-build.sh` — webapp/ · packages/shared/ · pnpm-lock.yaml 만 봄)가 건너뛴다. relay 가 막히면 push 하지 않는다.
7. **STATE.md:** Quick Tasks Completed 표에 261018-qob 행 추가(오케스트레이터 몫 · main tree 직접 편집).
</content>
</invoke>
