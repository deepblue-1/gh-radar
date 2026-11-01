---
phase: 35-launch-gate
reviewed: 2026-11-01T08:00:07Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - server/src/services/admin-launch.ts
  - server/src/services/relay-admin-client.ts
  - server/tests/routes/admin-launch.test.ts
  - server/tests/services/relay-admin-client.test.ts
  - webapp/src/components/admin/launch-map-tab.tsx
  - webapp/src/components/admin/launch-plan-editor.tsx
  - webapp/src/components/admin/__tests__/launch-map-tab.test.tsx
  - webapp/src/lib/launch-plan-view.ts
  - webapp/src/lib/__tests__/launch-plan-view.test.ts
  - webapp/src/lib/__tests__/launch-api.test.ts
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: issues_found
---

# Phase 35: 4차 코드 리뷰 보고서 (3차 리뷰 수정분)

**검토 시각:** 2026-11-01T08:00:07Z
**깊이:** standard
**검토 파일:** 10
**상태:** issues_found (Info 3건 · 차단 · 경고 없음)
**범위:** `git diff 9a58373c HEAD -- relay server webapp`. 3차 리뷰 수정 커밋 5개(4b3f0b6a R3-WR-01 · 9b14921b R3-IN-01 · 09638968 R3-IN-02 · 1f10aff4 R3-IN-03 · cc55feb2 R3-IN-04)가 바꾼 소스와 그 호출 경로를 봤다. relay 는 이번 범위에서 바뀌지 않았다. 보안 검사는 프로젝트 설정(security_enforcement=false)에 따라 하지 않았다.

## Summary

diff 를 따라 다음 호출 경로를 확인했다.

- server
  - `saveLaunchPlanViaRelay` → `relayNotSent` · `relayNotSentMessage` → PUT 라우트 `recordLaunchPlanChange`(이력 `message` 칸)
  - `createRelayAdminClient` → `RelayConnectCapAgent` → axios 1.15 `AxiosError.from`(`code || error.code` 로 `CONNECT_TIMEOUT` 이 보존됨) → `request()` 의 `netCode`
  - `setLaunchPlan`(기본 상한 15초) · `launchPlans`(6초) · `orderEndpoints`(2초)와 연결 상한 3초의 앞뒤 관계
  - 생산 런타임은 Node 22(`server/Dockerfile`)다. 수정 때 실측한 Node 24 와 `Agent.createSocket` → `createConnection(options, oncreate)` 동작이 같다.
- webapp
  - `onSave` 의 세 분기 → `settle`(id 가드) → `reloadPlan(gateway, settle, ordered)` → `planRereadOf` · `saveRowSeenIn` · `maxChangeIdOf`
  - `saveResultViewOf(…, reread)` → `LaunchPlanEditor` 결과 줄 · `ReflectChip`
  - `changeOutcomeView` → `launch-plan-bar` 이력 알약
- 근거 확인
  - server GET `/plan` 은 relay 조회와 이력 RPC `launch_plan_changes_for_admin` 을 `Promise.all` 로 보낸다(`routes/admin-launch.ts:88`). 이력 RPC 는 조합별 최근 20행을 `at DESC, id DESC` 로 준다. 그래서 이 저장의 새 행은 다시 읽은 응답에 반드시 든다.
  - relay `set()` 은 offline 이 아닌 모든 반환 경로에서 op 8 을 이미 큐에 넣은 뒤 돌아온다(`relay/src/admin/launch-plan.ts`). 따라서 「행이 보이면 다시 읽기의 op 9 는 op 8 뒤」 라는 R3-IN-01 근거가 성립한다.

대상 단위 테스트는 이번 리뷰 중 다시 돌려 모두 통과했다. webapp 3파일 87건(지도 탭 50 · 순수 32 · launch-api 5), server 2파일 102건이다.

3차 findings 다섯 건은 모두 의도한 경우를 바르게 닫았다. 특히 R3-IN-04 의 「연결 전에 끊은 소켓은 요청 바이트를 하나도 쓰지 않았다」 는 근거가 맞다. `net.Socket` 은 `connecting` 동안 쓰기를 `_pendingData` 에 쌓는다. 타이머 콜백은 `afterConnect` 와 같은 JS 스레드에서 `socket.connecting` 을 다시 확인한다. 그래서 「안 보냄」 오판은 생기지 않는다. 이벤트 루프가 멈춰 연결 완료 처리보다 타이머가 먼저 돌아도 마찬가지다. 그때도 바이트는 아직 JS 안에 있다.

새로 찾은 문제는 모두 Info 다.
- R4-IN-01: 결과 줄은 원인을 말하지만, 같은 줄 옆 칩과 이력 알약 글자는 여전히 「서버 연결 안 됨」 이다(R3-IN-02 부분 해결).
- R4-IN-02: `saveRowSeenIn` 이 다른 저장의 행도 증거로 받는다. 문서의 「보이는 값은 같다」 는 그 행이 반영된 저장일 때만 맞다.
- R4-IN-03: 응답 타임아웃 테스트의 연결 상한 50ms 는 부하 아래에서 흔들릴 수 있다.

## 3차 findings 수정 확인

| 3차 ID | 판정 | 근거 |
|---|---|---|
| R3-WR-01 | resolved | `reloadPlan` 이 대상 서버 결과를 `settle` 로 알린다(`launch-map-tab.tsx:168-195`). `planRereadOf` 판정은 다음과 같다(`launch-plan-view.ts:291-299`). ① 그 서버 non-ok · 응답에 없음 · 404(absent) · 요청 throw 는 `failed` 다. ② `take` 에 든 경우만 `ok` 다. 결과 줄은 `TIMEOUT_REREAD_TAIL` 로 「다시 읽는 중」 · 「다시 읽지 못했어요(보이는 값은 저장 전 값일 수 있어요)」 를 가른다. `settle` 은 `l.id === id` 일 때만 붙는다(`:215-216`). 그래서 같은 칸 재저장 뒤 앞 다시 읽기의 늦은 결과가 새 줄을 바꾸지 않는다. 수정 보고가 짚은 리뷰 스니펫(`l.key === key`)의 경합이 실제로 있고, id 로 묶은 판단이 맞다. 계획 값 반영 경로(`take` · `planStateWithReload` · 세대 가드)는 바뀌지 않았다. 요청 throw 의 `console.warn` 으로 무로그 삼키기도 없다. 저장 2종 × 다시 읽기 5종 = 10건과 id 가드 1건 테스트가 잠근다. |
| R3-IN-01 | resolved(남은 경우는 R4-IN-02) | 요청 throw 경로만 `ordered = saveRowSeenIn(…)` 을 넘긴다(`:257-259`). `afterId` 는 저장 직전 상태의 이력 id 최댓값이다(`:211`). 근거 사슬은 이렇다. ① server 는 relay PUT 이 돌아온 뒤에 행을 쓴다(`routes/admin-launch.ts:115-137`). ② relay `set()` 은 offline 이 아니면 op 8 을 큐에 넣은 뒤에만 돌아온다. ③ GET 의 이력 RPC 스냅샷에 그 행이 보이면 op 8 큐 진입은 GET 시작보다 앞선다. 그 사이 「relay 응답 → server → Supabase insert」 왕복이 있어 GET 의 op 9 가 op 8 을 앞지를 틈이 없다. 응답을 받은 경로(timeout · ok+plan null)를 늘 `ordered` 로 보는 판단도 맞다. relay 는 그 경로에서 op 8 을 이미 넣었다. 행이 없으면 `unproven` 이다. 이력 기록 실패 저장도 늘 `unproven` 으로 남는데, 「확인」 이라고 말하지 않는 쪽으로 틀리므로 받아들일 만하다. 다만 다른 저장의 행까지 증거로 받는 점은 R4-IN-02 로 둔다. |
| R3-IN-02 | resolved(부분 · R4-IN-01) | `relayNotSentMessage`(`admin-launch.ts:257-264`)는 두 문구로 가른다. status 0 은 「relay 에 연결하지 못했어요(<netCode>)」, 400 · 401 · 404 · 503 은 「relay 가 거부했어요(<status> <code>)」 다. 바디 원문은 싣지 않고 `SAFE_CODE` 모양 code 만 싣는다. 이 문구는 그대로 이력 `message` 로 남아 D-29 에서 원인을 가를 수 있다. `relayNotSent` 판정 자체는 그대로다. 웹 결과 줄은 「KB120 미반영: <사유>」 다. relay 가 스스로 offline 으로 판정한 경우는 message 가 없어 「서버 연결 안 됨」 으로 떨어진다. 이 구분이 맞다. 다만 결과 줄 옆 칩과 이력 알약의 **글자**는 여전히 「서버 연결 안 됨」 이고, 원인은 hover `title` 에만 있다(R4-IN-01). |
| R3-IN-03 | resolved | `launch-api.test.ts` 가 `authFetch` 만 목으로 바꿔 다음을 잠근다. ① `joined` 합치기 ② `{ fresh: true }` 우회(authFetch 2회 · 각자 제 응답) ③ fresh 가 `inflight` 자리를 차지하지 않음 ④ 끝난 요청이 자리에서 빠짐 ⑤ fresh 경로 404 → absent. 지도 탭 테스트 「R3-IN-03 요청 throw 는 그 전에 나간 다시 읽기의 그 서버 값을 버린다」 는 throw 경로 `markPlan` 이 없으면 실패한다. 근거: `markPlan` 이 없으면 KB120 `planSeen` 이 1 이라 R1(seq 2)이 반영된다. 대상 서버 non-ok 다시 읽기는 R3-WR-01 의 10건이 잠근다. |
| R3-IN-04 | resolved | `RelayConnectCapAgent`(`relay-admin-client.ts:107-137`)가 새 소켓이 `connecting` 이면 3초 타이머를 건다. 타이머가 울릴 때 아직 `connecting` 이면 `code: CONNECT_TIMEOUT` 오류로 끊는다. 'connect' · 'close' 에서 타이머를 지우고 `unref` 한다. 옵션(keepAlive · lifo · timeout 5000)은 Node 19+ 의 `http.globalAgent` 와 같다. 그래서 axios 가 전에 쓰던 기본 Agent 와 재사용 동작이 같다. `request()` 의 `AxiosError.from` 은 `code \|\| error.code` 로 코드를 보존한다(axios 1.15.0 확인). `NOT_SENT_NET_CODES` 에 더해져 offline 이 된다. 응답 대기 타임아웃은 그대로 `ECONNABORTED` → timeout 이다. 클라이언트는 부팅 때 1개만 만든다(`server.ts:73`). relay 는 http 서버뿐이라(`relay/src/index.ts:609`) `httpsAgent` 가 없는 것도 문제가 아니다. 3초 = SYN 재전송 1회(t=1s)까지라는 주석과 실제 동작이 맞는다. 둘째 재전송(t=3s)은 타이머와 겹친다. |

## Info

### R4-IN-01: offline 결과 칩 · 이력 알약 글자는 여전히 「서버 연결 안 됨」 — 결과 줄은 「relay 가 거부했어요」 인데 바로 옆 칩은 gh-trade 서버 연결 문제처럼 읽힘

**File:** `webapp/src/lib/launch-plan-view.ts:428` (칩) · `webapp/src/lib/launch-plan-view.ts:159` (이력 알약) · 렌더 `webapp/src/components/admin/launch-plan-editor.tsx:185` · `webapp/src/components/admin/launch-plan-bar.tsx:137-145`

**Issue:** R3-IN-02 수정으로 결과 줄은 「KB120 미반영: relay 가 거부했어요(401 UNAUTHORIZED). relay 설정 · 배포를 확인하세요.」 가 됐다. 그런데 같은 결과 영역에 함께 그리는 `ReflectChip` 글자는 여전히 「KB120 · 서버 연결 안 됨」 이다. 한 화면에 「서버 연결 안 됨」 과 「relay 가 거부」 가 나란히 보인다.

이력 표(`launch-plan-bar`)의 알약도 글자가 「서버 연결 안 됨」 이다. 원인은 `title`(hover)에만 있다. 이력 표에는 결과 줄이 없다. 그래서 D-29 이력을 훑는 운영자는 여전히 relay 401 · 404 · 503 을 「서버 연결 안 됨」 으로 읽는다. 폰 390 처럼 hover 가 없는 화면에서는 원인을 볼 길이 없다. R3-IN-02 가 짚은 「gh-trade 서버부터 의심하게 된다」 는 문제가 이력 쪽에는 그대로 남는다. 판정과 기록(`message` 칸)은 맞으므로 Info 로 둔다.

**Fix:** offline 사유가 relay 쪽 원인일 때 칩 · 알약 글자를 바꾼다. server 문구를 웹이 문장 대조로 가르면 결합이 생긴다. 그러니 server 가 결과에 구분값을 싣는 쪽이 낫다. 예: 이력 `code` 칸은 지금 offline 이면 null 이다. 여기에 relay status 를 싣는다. 또는 `message` 접두를 상수로 공유한다.
```ts
// launch-plan-view.ts — 최소안: 사유가 있으면 글자를 「relay 문제」 로
case 'offline':
  return {
    chip: { tone: 'warn', text: msg ? `${s} · 미반영` : `${s} · 서버 연결 안 됨`, title: msg },
    line: { tone: 'warn', text: `${s} 미반영: ${msg ?? '서버 연결 안 됨'}` },
  };
// changeOutcomeView offline — row.message 가 있으면 text '미반영'(title = 사유), 없으면 '서버 연결 안 됨'
```
relay 미설정(`RELAY_NOT_CONFIGURED_MESSAGE`)도 사유가 있는 offline 이다. 그러니 「사유 있음 = gh-trade 연결 문제 아님」 이라는 규칙이 그대로 성립한다.

### R4-IN-02: `saveRowSeenIn` 이 다른 저장의 행도 「이 저장을 처리했음」 증거로 받음 — 그 행이 반영되지 않은 저장(offline · skipped · failed)이면 저장 전 값을 「확인」 으로 보임

**File:** `webapp/src/lib/launch-plan-view.ts:313-325` · 호출 `webapp/src/components/admin/launch-map-tab.tsx:257-259` · 문서 주석 `webapp/src/lib/launch-plan-view.ts:306-311`

**Issue:** 증거 조건은 「같은 (gateway, fire, market) · 같은 `after_us` · `id > afterId`」 다. 누가 언제 보낸 행인지, 결과가 무엇인지는 보지 않는다. 주석은 「같은 값을 그 사이 다시 보낸 다른 저장의 행이어도 보이는 값은 같다」 라고 말한다. 이 말은 그 다른 저장이 **반영됐을 때만** 참이다. 다음 순서에서는 틀린다.

1. 다른 탭 · 다른 어드민이 KB120 코스닥에 A 를 저장한다. gh-trade 연결이 잠깐 끊겨 relay 가 offline 으로 판정한다(op 8 안 나감). 이력에 `after_us = A, outcome offline` 행이 남는다. 이 탭은 이 행을 모른다(`afterId` 보다 큼).
2. 연결이 돌아온 뒤 이 탭이 같은 칸에 A 를 저장한다. 브라우저 쪽에서 요청이 throw 한다. server 는 아직 PUT 을 처리 중이다.
3. 다시 읽기의 op 9 가 이 저장의 op 8 보다 먼저 그 서버에 닿아 저장 전 값 B 를 받는다. 이력에는 1의 행이 보이므로 `ordered = true` → `ok` → 「다시 읽은 계획으로 확인」 이 뜬다. 화면은 B 다.

R3-IN-01 이 막으려던 「저장 전 값을 확인으로 보임」 이 그대로 생긴다. 두 세션이 같은 칸에 같은 값을 거의 동시에 보내야 하므로 창은 아주 작다. 그래서 Info 로 둔다. 순수 테스트는 이 무관함을 의도로 잠갔다(`saveRowSeenIn([row({ id: 10, outcome: 'timeout' })], save) === true`). 이 탭 자신의 행이 timeout · failed 인 경우는 맞는 증거다. 문제는 출처를 가리지 않는다는 점이다.

**Fix:** 증거를 이 세션이 보낸 저장으로 좁힌다. 가장 단순한 방법은 행의 `admin_email` 이 지금 로그인한 어드민과 같을 것을 요구하는 것이다. 같은 어드민이 두 탭에서 동시에 같은 값을 보내는 경우는 남지만, 창이 한층 더 작다. 더 엄밀하게 하려면 저장 요청에 클라이언트 nonce 를 실어 이력 행에 남기고 그 nonce 로 대조한다. 이 방법은 스키마 변경이 필요하다. 최소한 주석의 「보이는 값은 같다」 를 「다른 저장이 반영됐을 때만 같다 · 아니면 드물게 확인으로 틀릴 수 있다」 로 고쳐 한계를 드러낸다.
```ts
// launch-plan-view.ts — 출처 좁히기(최소안)
export function saveRowSeenIn(
  changes: readonly LaunchPlanChangeRow[],
  save: { gateway: string; fire: LaunchFire; market: LaunchMarket; offsets: readonly number[]; afterId: number; adminEmail: string },
): boolean {
  return changes.some(
    (c) =>
      c.id > save.afterId &&
      c.admin_email === save.adminEmail &&
      c.gateway === save.gateway && c.fire === save.fire && c.market === save.market &&
      sameOffsets(c.after_us, save.offsets),
  );
}
```

### R4-IN-03: 테스트 신뢰성 — 「연결된 뒤 응답 대기는 ECONNABORTED」 테스트의 연결 상한 50ms 는 부하 아래에서 흔들릴 수 있음

**File:** `server/tests/services/relay-admin-client.test.ts:214-224` (특히 `:218` `connectTimeoutMs: 50`)

**Issue:** 이 테스트는 루프백 연결이 50ms 안에 'connect' 를 내기를 전제한다. libuv 는 한 루프에서 timers 단계를 poll 단계(연결 완료 콜백)보다 먼저 돈다. 그래서 `createConnection` 직후 프로세스가 50ms 넘게 멈추면, 연결이 커널에서 끝났더라도 타이머가 먼저 울린다. 멈추는 원인은 GC 정지 · 동시 세션 메모리 압박에 따른 스와핑 · CPU 경합 등이다. 그러면 `socket.connecting` 이 아직 참이라 `CONNECT_TIMEOUT` 이 나고 테스트가 실패한다. 이 저장소는 동시 세션 테스트로 메모리가 고갈된 적이 있다(자동 메모리 「Mac 멈춤 = 동시 세션 테스트 메모리 고갈」). 그러니 근거 없는 걱정이 아니다. 생산 동작에는 영향이 없다. 상한이 3초이고, 늦게 울려도 「안 보냄」 판정은 여전히 맞다.

**Fix:** 연결 상한과 응답 상한의 비율은 유지하고 절대값을 키운다. 예: `connectTimeoutMs: 500`, `timeoutMs: 1_500`, 응답 지연 3_000ms, 단언 `toBeGreaterThanOrEqual(1_400)`. 그러면 「연결 상한이 아니라 응답 상한에서 끊김」 을 같은 힘으로 잠그면서 루프 정지에 수백 ms 여유가 생긴다.

---

_Reviewed: 2026-11-01T08:00:07Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
