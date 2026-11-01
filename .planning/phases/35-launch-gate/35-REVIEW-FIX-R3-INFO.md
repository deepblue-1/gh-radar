---
phase: 35-launch-gate
fixed_at: 2026-11-01T07:16:00Z
review_path: .planning/phases/35-launch-gate/35-REVIEW-R3.md
iteration: 2
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 35: 3차 코드 리뷰 수정 보고 (Info)

**수정 시각:** 2026-11-01T07:16:00Z
**원본 리뷰:** .planning/phases/35-launch-gate/35-REVIEW-R3.md
**회차:** 2

**요약:**
- 범위 안 지적: 4 (Info 4 — R3-IN-01 ~ R3-IN-04, fix_scope = all)
- 수정: 4
- 건너뜀: 0
- 이미 수정: R3-WR-01 — `4b3f0b6a`(35-REVIEW-FIX-R3.md). 이번에는 손대지 않았고, 그 수정(`LaunchPlanReread` · `saveSeq` id 가드 · `TIMEOUT_REREAD_TAIL`) 위에 얹었다.

webapp · server 를 바꿨다. relay 와 DB 마이그레이션은 바꾸지 않았다. 배포 · push 는 하지 않았다(push 가 webapp 프로덕션 배포다).
- **server 배포 필요:** R3-IN-02(offline 문구)와 R3-IN-04(연결 단계 상한)는 server 코드다.
- **webapp 배포:** R3-IN-01 · R3-IN-02 화면 문구는 push 로 반영된다. server 보다 먼저 나가도 깨지지 않는다. 옛 server 의 offline message(「relay 처리에 실패했어요…」)가 결과 줄에 그대로 보일 뿐이다.
- **relay 배포:** 필요 없다.

불변식(「보냈을 수 있는」 저장을 offline · 미반영으로 단정하지 않는다)은 네 건 모두 지켰다. 새로 offline 이 되는 경우는 R3-IN-04 의 `CONNECT_TIMEOUT` 하나다. 이 코드는 TCP 연결 전에 끊어 요청 바이트를 하나도 쓰지 않은 소켓에만 붙는다.

## Fixed Issues

### R3-IN-01: 요청 throw 경로의 다시 읽기가 server 가 아직 처리 중인 PUT 보다 먼저 relay 에 닿을 수 있음

**수정한 파일:** `webapp/src/lib/launch-plan-view.ts`, `webapp/src/components/admin/launch-map-tab.tsx`, `webapp/src/components/admin/__tests__/launch-map-tab.test.tsx`, `webapp/src/lib/__tests__/launch-plan-view.test.ts`
**커밋:** 9b14921b
**적용한 수정:**
- 리뷰 권고 가운데 「응답 `changes` 에 이 저장의 이력 행이 나타나면 처리 끝」 신호를 썼다. 다시 묻지 않고, 없으면 결과 줄을 보수적으로 표시한다. 늦춰 읽기(타이머)는 넣지 않았다.
- 경합을 따라가 본 결과는 이렇다.
  - server 는 relay PUT 이 돌아온 **뒤에** 이력 행을 쓴다(`routes/admin-launch.ts`). relay PUT 이 돌아왔으면 op 8 은 이미 그 서버 FIFO 에 들어갔다.
  - `GET /plan` 은 relay 조회와 이력 RPC 를 함께 보낸다(`Promise.all`). 응답 이력에 그 행이 보이면 행이 RPC 스냅샷 전에 커밋됐다는 뜻이다. 그러면 op 8 송신은 GET 시작보다 앞선다. 따라서 다시 읽기의 op 9 는 FIFO 에서 op 8 뒤다.
  - 행이 없으면 순서를 알 수 없다. 요청이 server 에 닿지 않았거나, 처리 중이거나, 이력 기록이 실패한 경우다.
- `launch-plan-view.ts`
  - `LaunchPlanReread` 에 `unproven` 을 더했다.
  - `planRereadOf(…, ordered = true)`: 반영했어도 `ordered` 가 거짓이면 `unproven` 이다.
  - `maxChangeIdOf(state)` 를 더했다. 저장 직전에 알던 이력 id 최댓값이다.
  - `saveRowSeenIn(changes, { gateway, fire, market, offsets, afterId })` 를 더했다. 같은 칸, 같은 보낸 값, `afterId` 보다 새 행만 증거로 본다. 같은 값을 그 사이 다시 보낸 다른 저장의 행이어도 보이는 값은 같다.
  - `TIMEOUT_REREAD_TAIL.unproven` = 「다시 읽었지만 서버가 이 저장을 처리하기 전 값일 수 있어요 · 잠시 뒤 새로고침」
- `launch-map-tab.tsx`
  - `reloadPlan` 이 선택 인자 `ordered(resp)` 를 받는다. 기본값은 참이다.
  - **요청 throw 경로에서만** `saveRowSeenIn` 을 넘긴다. 저장 응답을 받은 경로(응답 timeout · ok+plan null)는 server 가 relay 저장을 마친 뒤 답하므로 그대로 「확인」 이다.
  - 계획 값 반영(`take` · `planStateWithReload`)과 세대 가드는 바꾸지 않았다. 결과 줄 문구만 바뀐다.
- 테스트
  - 지도 탭: throw 뒤 다시 읽기는 ok 인데 증거가 없는 4경우(행 없음 · 다른 시장 · 다른 보낸 값 · 저장 전에 알던 id)는 값은 반영하고 줄은 unproven 이다. 응답 timeout 은 행 없이도 「확인」 이다(1건).
  - 기존 throw 테스트 2건을 고쳤다. 행이 보이면 「확인」, 5xx · status 0 은 unproven 이다.
  - 순수 함수: `planRereadOf` ordered 와 `maxChangeIdOf` · `saveRowSeenIn` 을 본다.
  - 변이 확인: `ordered` 를 무시하게 바꾸면 지도 탭 테스트 5건이 실패한다.
- **사람 확인 필요:** 결과 줄 문구가 새로 하나 늘었다. 실제 화면에서 길이와 줄바꿈을 한 번 봐 주면 좋다. 이력 기록이 실패한 저장(change null)은 행이 영영 안 보여 늘 unproven 으로 남는다. 「확인」 이라고 말하지 않는 쪽으로 틀리게 했다.

### R3-IN-02: 「relay 가 보내기 전에 거절」 offline 이 원인을 감추고 「잠시 뒤 다시 시도」 를 권함

**수정한 파일:** `server/src/services/admin-launch.ts`, `server/tests/routes/admin-launch.test.ts`, `webapp/src/lib/launch-plan-view.ts`, `webapp/src/lib/__tests__/launch-plan-view.test.ts`
**커밋:** 09638968
**적용한 수정:**
- server `relayNotSentMessage(r)`: `relayNotSent` 저장의 offline message 를 원인별로 바꿨다. 이 문구는 이력 `launch_plan_changes.message` 칸에 그대로 남는다. **스키마 변경이나 마이그레이션은 없다.**
  - status 0(`ECONNREFUSED` 등): 「relay 에 연결하지 못했어요(<코드>). 잠시 뒤 다시 시도하세요.」
  - 400 · 401 · 404 · 503: 「relay 가 거부했어요(<status> <relay 오류 code>). relay 설정 · 배포를 확인하세요.」
  - 바디 원문(error.message)은 싣지 않는다. code 만 싣고, 모양이 `^[A-Z][A-Z0-9_]{0,63}$` 일 때만이다.
- **리뷰와 다르게 한 점:** 리뷰는 status 0 이면 `RELAY_FAILED_MESSAGE` 를 그대로 두라고 했다. 그런데 지시에 「이력에 relay 상태 코드 남기기」 가 있다. 또 R3-IN-04 뒤에는 status 0 「안 보냄」 이 두 종류가 된다(`ECONNREFUSED` = relay 프로세스만 내려감, `CONNECT_TIMEOUT` = VM 정지). 그래서 status 0 문구에도 네트워크 코드를 싣는다. GET 경로(`readLaunchPlanServers`)의 offline 문구는 바꾸지 않았다.
- webapp
  - offline 결과 줄은 사유가 있으면 「KB120 미반영: <사유>」, 없으면 「KB120 미반영: 서버 연결 안 됨」 이다. Admin 계좌 편집의 `skippedLineText(server, message || "서버 연결 안 됨")` 과 같은 말이다.
  - 칩 글자는 그대로 두었다(title = 사유).
  - 이력 알약 offline 은 사유를 title 로 보인다.
- 확정 미반영 판정(`relayNotSent`)은 바꾸지 않았다.
- 테스트
  - server 라우트: offline 7경우의 문구 · 이력 message 를 단언한다. 코드 모양이 어긋난 경우 code 를 싣지 않는 1건을 더했다.
  - webapp: offline 줄의 사유 원문, 알약 title 을 본다.

### R3-IN-03: 테스트 공백 — `fresh` 우회 · throw 경로 세대

**수정한 파일:** `webapp/src/lib/__tests__/launch-api.test.ts`(새 파일), `webapp/src/components/admin/__tests__/launch-map-tab.test.tsx`
**커밋:** 1f10aff4
**적용한 수정:**
- `launch-api.test.ts`: `authFetch` 만 목으로 바꿨다. 진행 중 약속을 테스트가 쥐고 다음을 본다(5건).
  - `fetchLaunchPlan()` 두 번은 1회로 합친다.
  - `fetchLaunchPlan()` 다음 `{ fresh: true }` 는 `authFetch` 를 2회 부르고, 각자 제 응답을 받는다.
  - fresh 가 합치기 자리를 차지하지 않는다.
  - 끝난 요청(실패 포함)은 자리에서 빠진다.
  - fresh 경로에서도 404 는 absent, 그 밖은 throw 다.
- 지도 탭(1건): 순서는 다음과 같다.
  1. 응답 timeout 저장 → 다시 읽기 R1 비행 중
  2. 같은 칸 저장 → 요청 throw → R2 비행 중
  3. R1 늦게 도착 → KB120 값(저장 2 이전)은 버림 · 교보 값은 반영 · R1 결과는 저장 1 몫이라 결과 줄을 바꾸지 않음
  4. 이 저장의 행이 보이는 R2 → 값 반영 · 「다시 읽은 계획으로 확인」
- 대상 서버 non-ok 다시 읽기는 4b3f0b6a 가 이미 잠갔다.
- 변이 확인
  - `fresh` 를 `joined` 로 바꾸면 launch-api 테스트가 실패한다. fresh 2건은 직접 실패하고, 앞 테스트가 남긴 진행 중 요청 때문에 2건이 이어서 실패한다.
  - throw 경로의 `markPlan` 을 빼면 새 지도 탭 테스트가 실패한다.

### R3-IN-04: relay VM 이 꺼진 경우(SYN 무응답 → `ECONNABORTED`)는 여전히 timeout 으로 이력에 쌓임

**수정한 파일:** `server/src/services/relay-admin-client.ts`, `server/src/services/admin-launch.ts`, `server/tests/services/relay-admin-client.test.ts`, `server/tests/routes/admin-launch.test.ts`
**커밋:** cc55feb2
**적용한 수정:**
- **구분 가능 여부를 먼저 확인했다.** 연결이 끝나지 않는 소켓으로 axios(1.15.0, Node 24)를 직접 재 봤다. `timeout` 1500ms 는 1515ms, 8000ms 는 8000ms 뒤에 둘 다 `ECONNABORTED` 를 냈다. 즉 axios 상한은 연결 단계와 응답 대기를 한 코드로 접는다. 오류가 난 뒤 `socket.connecting` 을 보는 방법도 안 된다. Node `Socket._destroy` 가 `connecting = false` 로 바꾸기 때문이다(Node 소스 확인).
- 그래서 **연결 전에 직접 끊는** 방식을 택했다. `RelayConnectCapAgent`(http.Agent 하위)가 새 소켓이 연결 중이면 `RELAY_CONNECT_TIMEOUT_MS` = 3초 타이머를 건다. 'connect' 전에 타이머가 울리면 `code: "CONNECT_TIMEOUT"` 오류로 소켓을 끊는다.
- 「안 보냄」 이 확실한 근거: net.Socket 은 'connect' 전 쓰기를 JS 안(`_pendingData`)에 쌓아 두고, 연결된 뒤에야 커널에 쓴다. 'connect' 전에 끊으면 요청 바이트는 하나도 나가지 않는다. TCP Fast Open 은 쓰지 않는다.
- Agent 옵션은 Node 19+ 기본 Agent 와 같다(keepAlive · lifo · timeout 5000 — `http.globalAgent.options` 로 확인). 재사용하는 keep-alive 소켓은 이미 연결돼 있어 상한이 걸리지 않는다.
- axios `httpAgent` 로 붙였다. relay 는 http(VPC 사설 주소)다. axios 인스턴스 이름은 `http` → `client` 로 바꿨다(`node:http` 를 가리지 않게).
- `admin-launch.ts`: `CONNECT_TIMEOUT` 을 `NOT_SENT_NET_CODES` 에 더했다. 그래서 offline 이고, 문구는 「relay 에 연결하지 못했어요(CONNECT_TIMEOUT). 잠시 뒤 다시 시도하세요.」 다. 연결된 뒤의 응답 대기 타임아웃은 그대로 `ECONNABORTED` → timeout(결과 모름)이다.
- 곁효과: 다른 relay Admin 호출도 VM 정지 때 3초에 status 0 으로 끝난다. 전에는 각자의 axios 상한(15초 · 6초)에서 끝났다. 상한이 3초보다 짧은 `orderEndpoints`(2초)는 axios 가 먼저 끊어 그대로다. `netCode` 를 읽는 곳은 발사 계획 저장뿐이다.
- 테스트
  - 연결이 안 맺어지는 소켓 → `CONNECT_TIMEOUT` · relay 요청 0건 · 1초 안. 이름 풀이를 끝나지 않게 막아 소켓을 「연결 중」 에 묶었다.
  - 연결 뒤 응답 지연 → `ECONNABORTED` · 요청 1건 · 연결 상한 50ms 가 아니라 응답 상한 300ms 에서 끊김.
  - 라우트: `CONNECT_TIMEOUT` → offline 1건.
  - 변이 확인: Agent 를 빼면 첫 테스트가 `ECONNABORTED` 로 실패한다.
- **사람 확인 필요:** 테스트는 「연결 중」 상태를 이름 풀이 단계로 흉내 냈다. 실제 SYN 무응답(정지한 VM 의 내부 IP)은 장 마감 20:00 뒤 relay VM 정지 때 server 로그 `relay.code = CONNECT_TIMEOUT` 으로 한 번 보면 좋다.

## 검증

모든 수정과 검증은 **격리 worktree**(`.claude/worktrees/rf-35-44981-1793515879`, 브랜치 `gsd-reviewfix/35-44981`)에서 했다.
- 설치는 새로 하지 않았다. worktree 의 `node_modules` · `webapp/node_modules` · `server/node_modules` · `relay/node_modules` 는 main 체크아웃의 같은 디렉터리를 가리키는 심볼릭 링크다.
- 정리 단계에서 링크는 `unlink` 로 지웠다(대상은 건드리지 않음). 그다음 master 로 fast-forward 하고 worktree 와 임시 브랜치를 지웠다.
- 그래서 아래 수치는 master 체크아웃에서 같은 명령으로 다시 낼 수 있다.

webapp (`npx vitest run <files> --maxWorkers=2`):
- 최종 5파일 **112건 통과**. 지도 탭 50 · 순수 32 · launch-api 5 · 편집기 17 · 계획 막대 8.
- 이 라운드 전에는 지도 탭 44 · 순수 31 이었다. 지도 탭 +6, 순수 +1, launch-api +5 가 늘었다.
- React `act(...)` 경고는 출력되지만 실패는 아니다.
- `npx tsc --noEmit -p .` → 오류 0. `npx eslint`(바뀐 파일) → 오류 0.

server (`npx vitest run <files> --maxWorkers=2`):
- `tests/routes/admin-launch.test.ts` + `tests/services/relay-admin-client.test.ts` → 2파일 **102건 통과**(전 98).
- 클라이언트 팩토리를 쓰는 `tests/routes/admin.test.ts` → **39건 통과**.
- `npx tsc --noEmit -p .` → 오류 0. server 에는 eslint 가 없다.

relay: 바꾸지 않아 돌리지 않았다. 전체 스위트 · Playwright 는 지시대로 돌리지 않았다(동시 세션 메모리).

---

_Fixed: 2026-11-01T07:16:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
