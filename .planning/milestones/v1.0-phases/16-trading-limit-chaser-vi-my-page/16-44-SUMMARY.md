---
phase: 16-trading-limit-chaser-vi-my-page
plan: 44
subsystem: relay-ws-fanout
tags: [gap-closure-r3, relay, listener-leak, eventemitter, vitest, R2-WR-05]

requires:
  - phase: 16
    provides: "16-36 이 같은 파일에 넣은 `#isTeardown` 게이트 4종 판정 · `#strategyArmable` sweep 면제"
  - phase: 15
    provides: "D-15 세션 유예 5분 (`SessionManager.release` → `graceTimer`)"
provides:
  - "`UserEntry.onState` — entry 가 자기 `\"state\"` 리스너의 수명을 소유한다"
  - "`#onClose` 의 마지막 소켓 갈래에서 리스너를 뗀다 (실제 누수를 막는 지점)"
  - "`#register` 의 세션 교체 갈래에서도 뗀다 (오늘은 도달 불가 · 예약된 버그 차단)"
  - "fanout 회귀 2케이스 (㉓ 리스너 수 · ㉔ 프레임 중복)"
affects: [relay 재접속 경로, 16-46 재배포]

tech-stack:
  added: []
  patterns:
    - "**리스너를 만든 주체가 그 수명을 소유한다** — 인라인 익명 함수는 참조가 남지 않아 영원히 뗄 수 없다"
    - "**떼는 것**과 **침묵시키는 것**은 서로 다른 시점의 방어다. 둘 다 남긴다"
    - "도달 불가 방어 코드는 **도달 불가라고 적고** 남긴다 — 갈래를 두면서 정리만 빼는 것은 버그를 예약해 두는 것이다"

key-files:
  created: []
  modified:
    - relay/src/ws/fanout.ts
    - relay/tests/fanout.test.ts

key-decisions:
  - "이 갭의 **실제 누수 지점은 `#onClose`** 였다. 계획이 두 갈래(② `#register` · ③ `#onClose`)를 모두 요구했는데, 회귀 실증 결과 `#register` 쪽만 지우면 빨개지는 테스트가 **0건**이었다 — 그 갈래는 오늘의 코드로 도달하지 않는다"
  - "그럼에도 `#register` 의 `off` 를 남겼다. `if (existing !== undefined)` 블록(「세션 교체」 로그)은 **이미 있던 갈래**이고, `acquire` 의 재생성 조건(`refCount === 0`)이 언젠가 완화되면 누수가 조용히 되살아난다"
  - "`closeAll()` 에는 `off` 를 넣지 않았다 — 같은 종료에서 `SessionManager.closeAll()` 이 세션 객체 자체를 끊는다. 끊길 객체의 리스너를 떼는 것은 정리가 아니라 소음이다"
  - "침묵 가드(`current.session !== session`)를 남겼다. `EventEmitter.emit` 은 리스너 배열의 **사본**을 순회하므로 실행 도중 `off` 가 걸려도 같은 emit 안의 나머지 리스너는 호출된다 — 그 창에서 정본 대조가 없으면 이미 버려진 entry 가 프레임을 흘린다"

requirements-completed: []

metrics:
  duration: ~18min
  completed: 2026-09-09
  tasks: 2
  files: 2
  relay_tests: "395 → 397 (+2)"
  repo_tests: "2,042 → 2,044 passed"
---

# Phase 16 Plan 44: 세션 상태 리스너 누수 (R2-WR-05) Summary

**파일이 주석으로만 선언하던 「상태 리스너는 사용자당 1개」를 실제로 성립시켰다 — 새로고침 k 번이면 상태 프레임이 k 번 나가던 것이 1번이 됐고, 그 지점이 `#register` 가 아니라 `#onClose` 였다는 사실을 실측으로 갈랐다.**

## Performance

- **Duration:** 약 18분
- **Tasks:** 2/2
- **Files modified:** 2 (신규 파일 0 · 마이그레이션 0)
- **relay 테스트:** **395 → 397**(+2, 17 files). fanout 만 35 → 37

## Accomplishments

### Task 1 — 리스너 핸들을 entry 가 소유하고 두 폐기 경로가 뗀다 · commit `5ee91f6`

**진단은 계획대로였고 코드로 재확인했다.**

- `#onClose` 는 마지막 소켓에서 `this.#users.delete(userId)` 를 한다.
- `SessionManager.release` 는 `graceTimer = setTimeout(..., #graceMs)` 로 **소멸을 예약만** 한다 (`SESSION_GRACE_MS = 300_000`, D-15).
- 그래서 유예 안에 재접속하면 `acquire` 가 `clearTimeout` 후 **같은 세션**을 돌려주고, `#register` 는 `existing === undefined` 로 들어와 **같은 세션에 리스너를 하나 더** 건다.
- 옛 리스너는 침묵하지도 않았다 — 가드가 `current.session !== session` 인데 `current.session === S` 다.

`"state"` 를 듣는 곳은 저장소 전체에서 이 파일 하나뿐임을 먼저 확인했다 (`grep -rn 'on("state"' relay/src` → `fanout.ts` 의 부착 1곳 + `session.ts` 의 타입 선언). 즉 `listenerCount("state")` 는 곧 팬아웃 리스너 수다.

**① `UserEntry` 가 핸들을 소유한다 (`fanout.ts:269-281`, 소스 그대로):**

```ts
type UserEntry = {
  session: DmaSession;
  conns: Set<Conn>;
  /**
   * 이 entry 가 `session` 에 건 `"state"` 리스너의 **핸들**. entry 를 버리는 모든 경로가
   * 이것으로 리스너를 뗀다 (`#register` 의 세션 교체 갈래 · `#onClose` 의 마지막 소켓 갈래).
   *
   * 핸들을 entry 가 들고 있어야 하는 이유: `session.on("state", (f) => ...)` 처럼 익명
   * 함수를 인라인으로 넘기면 **참조가 남지 않아 영원히 뗄 수 없다**. 리스너를 만든 주체가
   * 그 수명을 소유한다.
   */
  onState: (frame: RelayStateMsg) => void;
};
```

**② 떼는 곳은 정확히 2곳이다** (`grep -n 'off("state"\|removeListener("state"' relay/src/ws/fanout.ts`):

```
1082:        entry.session.off("state", entry.onState);      ← #onClose
1135:      existing.session.off("state", existing.onState);  ← #register
```

`#onClose` 는 `#users.delete` **직전**에 뗀다:

```ts
      if (entry.conns.size === 0) {
        // entry 를 버리기 **전에** 그 리스너를 뗀다 (R2-WR-05). 여기를 빼먹으면
        // `DmaSession` 이 유예 5분 동안 살아 있으므로(D-15) 리스너만 세션에 남고,
        // 같은 세션으로 재접속한 `#register` 가 하나 더 걸어 새로고침마다 누적된다.
        entry.session.off("state", entry.onState);
        this.#users.delete(userId);
      }
```

**③ 침묵 가드는 남겼고, 왜 둘 다 필요한지 코드에 박았다** (`#register` 안, 소스 그대로 발췌):

```ts
      // ★ 위·아래의 `off` 가 있어도 **이 가드를 지우면 안 된다.** 둘은 서로 다른 시점의
      //   방어다: `off` 는 「entry 를 버리는 순간」에 걸고, 이 가드는 「이벤트가 발행되는
      //   순간」에 건다. `DmaSession.emit` 은 리스너 배열의 **사본**을 순회하므로, 어떤
      //   리스너가 실행되는 도중에 `off` 가 걸려도 같은 emit 안의 나머지 리스너는 그대로
      //   호출된다 — 그 창에서 정본 대조가 없으면 이미 버려진 entry 가 프레임을 흘린다.
      //   반대로 가드만 있고 `off` 가 없으면(= R2-WR-05 이전 상태) **같은 세션**으로
      //   재접속했을 때 `current.session === session` 이라 가드가 통과해 버린다.
```

**④ `#register` docstring 에 「왜 지금까지 성립하지 않았는지」를 적었다** — `#onClose` 의 `#users.delete` × 유예 5분 조합, `MaxListenersExceededWarning`, 그리고 `SubscriptionHub.attach` 와의 대조. 대조를 **한 줄 더 정확히** 적었다: attach 의 `prev === session` 조기 반환이 실제로 걸리는 이유는 그쪽 `#sessions` 가 소켓이 닫혀도 지워지지 않기 때문이고, `#users` 는 지워지므로 **조기 반환만으로는 부족하다**.

**⑤ 건드리지 않은 것:** `#deliver` **diff 0줄**(`git diff -U0 | grep '#deliver'` 출력 없음 — 본문 4줄 그대로), `#send`·백프레셔 경로 0줄. 16-36 이 넣은 `#isTeardown` 게이트 4종 판정 · `#strategyArmable` sweep 면제 · `#teardownMarket`/`#strategyMarket` 정책 전부 **한 글자도 손대지 않았다**(diff 는 `UserEntry` · `#onClose` · `#register` · `closeAll` 주석 4곳뿐).

`closeAll()` 에는 세 번째 `off` 를 넣지 않았고 그 이유를 그 자리에 남겼다 — 같은 종료에서 `SessionManager.closeAll()` 이 세션 객체 자체를 끊는다.

### Task 2 — 누적이 없음을 수로 단언한다 · commit `dac2856`

**신규 2케이스** (제목 그대로 인용):

| 케이스 | 무엇을 세는가 | 누적이 있으면 |
|---|---|---|
| `㉓ 새로고침을 3회 반복해도 세션 "state" 리스너는 1개다 (R2-WR-05)` | `session.listenerCount("state")` **`toBe(1)`** — 매 회차마다 | **5** |
| `㉔ 재접속을 반복해도 상태 프레임은 브라우저로 한 번만 간다 (R2-WR-05)` | 상태 전이 1회 발행 후 마지막 소켓 inbox 의 `state` 프레임 **`toHaveLength(1)`** | **5건** |

두 케이스 모두 공용 헬퍼 `refresh(times, session)` 를 쓴다. 그 헬퍼가 **매 회차 `expect(h.sessions.get(USER_A)).toBe(session)`** 를 건다 — 유예가 흐르지 않아 **같은 세션**이 재사용된다는 전제가 이 갭의 전부이고, 전제가 깨지면(세션이 새로 생기면) 리스너가 1개인 것은 당연해져 검증이 무의미해지기 때문이다. 서버측 정리 완료는 `h.fanout.stats().authedUserCount === 0` 으로 기다린다 — 클라이언트 close 만으로는 `#onClose` 가 끝났다고 볼 수 없다.

㉔ 는 상태 전이를 `session.emit("state", { t: "state", s: "reconnecting", attempt: 7 })` 로 직접 발행한다. **인증 ACK 프레임(`#send(conn, session.stateFrame())`)은 리스너 경로가 아니라 직접 전송 경로**라서, 그것만 보면 누수를 관측할 수 없다.

**기존 케이스 전량 통과** — 16-36 이 추가한 `⑰-e3`·`⑰-e4`·`⑰-e5` 포함 **37 passed (35 → +2)**, 실패 0.

### 회귀 잠금 실증 — 두 곳을 **따로** 지웠다 (계획 요구 ⑤)

| 라운드 | 무엇을 지웠나 | 결과 | 관측 문구 |
|---|---|---|---|
| **A** | `#onClose` 의 `off` 만 (`entry.session.off("state", entry.onState)`) | **2 failed \| 35 passed (37)** — ㉓ · ㉔ | `expected 5 to be 1` · `to have a length of 1 but got 5` |
| **B** | `#register` 의 `off` 만 (`existing.session.off("state", existing.onState)`) | **37 passed (37)** — **빨개진 케이스 0건** | — |
| **C** | 둘 다 | **2 failed \| 35 passed (37)** — ㉓ · ㉔ | A 와 동일 |

복원 후 `grep -c 'MUTATION' relay/src/ws/fanout.ts` = **0**, `git diff 5ee91f6 -- relay/src/ws/fanout.ts` **출력 0줄**(커밋 상태와 바이트 동일)로 확인했다.

**B 가 0건인 것은 테스트의 부실이 아니라 코드의 사실이다 — 과장하지 않고 그대로 적는다.**

`#register` 의 `existing !== undefined && existing.session !== session` 갈래는 **오늘의 코드로는 도달하지 않는다.** `SessionManager` 가 세션을 새로 세우는 유일한 조건은 `acquire` 의 죽은 세션 폐기 갈래이고 그것은 `refCount === 0` 을 요구하는데(`session-manager.ts:201`), `#users` 에 `existing` 이 있다는 것은 그 사용자의 소켓이 살아 있다는 뜻이라 `refCount >= 1` 이다. acquire↔release 와 `#users` 멤버십이 conn 단위로 대칭임도 호출부로 확인했다 — `acquire` 1곳(`:543`, 직후 `conn.acquired = true`) · `release` 1곳(`:1087`, `if (conn.acquired)`).

**그럼에도 지우지 않았다.** `if (existing !== undefined)` 블록 자체는 「세션 교체 — 상태 리스너 재결선」 로그와 함께 **이미 있던 갈래**다. 갈래를 두면서 정리만 빼는 것은 버그를 예약해 두는 것이고, `acquire` 의 재생성 조건이 언젠가 완화되면 누수가 **조용히** 되살아난다. 대신 도달 불가라는 사실과 실증 결과를 그 자리 주석에 못박았다 — 다음 사람이 「테스트가 안 깨지니 죽은 코드다」로 지우거나, 반대로 「잠겨 있다」고 믿지 않게 하기 위해서다.

계획 item ③(「세션 교체 시 옛 리스너가 실제로 떨어진다」 케이스)은 **작성하지 않았다.** 하네스로 유발할 수 없기 때문이고, 계획이 그때는 「하지 않고 정직하게 적는다」를 지시했다. **그 갈래는 잠겨 있지 않다.**

## Verification

| 항목 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/relay run typecheck` | exit **0** |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit **0** (루트 typecheck 밖이라 따로 실행) |
| `test -f relay/tests/fanout.test.ts` | 참 (검증 대상 실재 확인 후 실행) |
| `pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts` | **37 passed** (35 → +2) |
| `pnpm --filter @gh-radar/relay test` | **397 passed / 17 files** — 기준선 **395** → **+2** |
| `pnpm --filter @gh-radar/shared run build` | exit **0** (16-41 이 발견한 낡은 `dist` 함정 회피 — 게이트 **전에** 실행) |
| `pnpm -r typecheck` | exit **0** (기준선 유지) |
| `pnpm -r test` | exit **0** — **2,044 passed**(기준선 2,042 → +2). relay 397 외 변동 없음: shared 99 · server 252 · webapp 680 |
| `grep -n 'off("state"\|removeListener("state"' relay/src/ws/fanout.ts` | **2건** (`:1082` `#onClose` · `:1135` `#register`) |
| `#deliver` diff | **0줄** |
| `grep -c 'MUTATION' relay/src/ws/fanout.ts` (복원 후) | **0** |
| 포매터 | **돌리지 않았다** |

### 접속 경로 0건 (D-27)

이 plan 은 `relay/src/ws/fanout.ts` · `relay/tests/fanout.test.ts` 두 파일만 손댔고 새 IP 참조·새 네트워크 대상을 만들지 않았다. 테스트는 `startFakeGateway` 로 `127.0.0.1` 에 뜬 **FakeGateway** 에만 붙는다. **실서버·실계좌 접속 0회** (D-27). `gcloud` 호출 0회.

## Deviations from Plan

**계획대로 실행했다. 계획이 예고한 「유발이 어려우면 하지 않는다」 조항을 실제로 발동한 것이 1건이고, 실증이 계획의 전제 하나를 정정한 것이 1건이다.**

**1. [계획이 허용한 생략] 「세션이 교체되면 옛 리스너가 실제로 떨어진다」 케이스 미작성**

- 계획 Task 2 action ③: 「유발이 어려우면 **하지 않고**, 못 잠근 사실을 SUMMARY 에 정직하게 적는다 — 「잠갔다」고 과장하지 않는다」
- 하네스로 유발 불가함을 코드로 확인했다(위 §회귀 잠금 실증 B 항). **잠그지 못했다.**

**2. [실증이 계획 전제를 정정] 두 `off` 는 대등하지 않다 — 실제 누수는 `#onClose` 한 곳이다**

- 계획 action ②③ 은 두 갈래를 「반쪽이 되지 않게 둘 다」로 요구했고, 그대로 넣었다
- 그러나 실증 결과 `#register` 쪽 단독 제거는 **아무 테스트도 깨지 않았다**. 계획이 예상한 「각각 어떤 케이스를 깨는지 관측하면 각각 필요함이 증명된다」는 **증명되지 않았다** — 오늘 필요한 것은 `#onClose` 하나다
- 코드는 그대로 두되(근거 위), 그 사실을 소스 주석과 이 SUMMARY 양쪽에 적었다. **「둘 다 필요함이 증명됐다」고 쓰지 않았다**

**3. [범위 밖 관측 — 고치지 않음] `closeAll()` 의 `#users.clear()`**

- 리스너를 떼지 않는 세 번째 경로다. 다만 같은 종료 절차에서 `SessionManager.closeAll()` 이 세션 객체 자체를 끊으므로 살아 있는 세션에 리스너가 남는 상황이 아니다
- 계획의 acceptance criteria 도 `off` **2곳**을 요구했다. 코드를 바꾸지 않고 **왜 여기서는 떼지 않는지**를 주석으로만 남겼다

**자동 수정(Rule 1~3) 0건.** 사전 존재 경고·무관 실패를 건드리지 않았고, `deferred-items.md` 에 새로 적을 항목도 없다.

## Requirements

**`requirements.mark-complete` 를 돌리지 않았다.**

- **TRADE-03 — Pending 유지가 정본이다.** 프로덕션 `/healthz` 의 `everReadyCount: 0` · `stalledCount: 2`(16-35 실측)라는 판정은 이 plan 으로 바뀌지 않는다. mock·단위 검증만으로 Complete 로 올리지 않는다. 재판정은 **16-46**.

## Threat Model 처리

| Threat ID | Disposition | 이 plan 의 처리 |
|---|---|---|
| T-16-91 | mitigate | ✅ entry 가 핸들을 소유하고 **실제 누수 경로(`#onClose`)** 가 뗀다. ㉓ 이 `listenerCount("state") toBe(1)` 로 잠근다. `#register` 갈래는 방어로 남되 **잠겨 있지 않다**(위 §Deviations 1) |
| T-16-92 | mitigate | ✅ 침묵 가드를 남기고 `off` 를 더했다(2중). ㉔ 가 프레임 건수 `toHaveLength(1)` 로 잠근다 |
| T-16-93 | mitigate | ✅ 근본 원인(누적)을 없앴다. `setMaxListeners` 로 경고만 끄지 **않았다** — `grep -c 'setMaxListeners' relay/src/ws/fanout.ts` = 0 |
| T-16-13 | accept | ✅ FakeGateway 만 사용. 실서버·실계좌 접속 0회 (D-27) |

## 배포

**미실시.** relay 재배포는 3라운드 종결 plan **16-46** 몫이다(16-35·16-36 과 같은 규율). 이 수정은 **아직 프로덕션에 없다** — 즉 프로덕션 relay 에는 R2-WR-05(새로고침마다 상태 리스너 누적)가 **여전히 살아 있다.** 16-46 배포 전까지 그 사실이 정본이다.

## Known Stubs

없음. 이 plan 은 표시 표면을 만들지 않는다.

## Threat Flags

없음. 새 네트워크 엔드포인트·인증 경로·파일 접근·스키마 변경이 없다 — 기존 리스너의 수명 관리만 바꿨다.

## Next

- 3라운드 남은 갭 클로징 plan (16-45 는 완료)
- **16-46(종결)** — relay 재배포 + TRADE-03 재판정. 이 수정이 실계좌 경로에 실제로 올라가는 지점

## Self-Check: PASSED

- 파일 3종 실재 확인 (`16-44-SUMMARY.md` · `relay/src/ws/fanout.ts` · `relay/tests/fanout.test.ts`)
- 커밋 2건 실재 확인 (`5ee91f6` · `dac2856`)
