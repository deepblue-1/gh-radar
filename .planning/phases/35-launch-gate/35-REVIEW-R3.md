---
phase: 35-launch-gate
reviewed: 2026-11-01T05:35:33Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - relay/src/admin/admin-api.ts
  - relay/src/admin/launch-plan.ts
  - relay/tests/admin-api.test.ts
  - relay/tests/admin-launch-plan.test.ts
  - server/src/services/admin-launch.ts
  - server/src/services/relay-admin-client.ts
  - server/tests/routes/admin-launch.test.ts
  - server/tests/services/relay-admin-client.test.ts
  - webapp/src/components/admin/launch-map-tab.tsx
  - webapp/src/components/admin/__tests__/launch-map-tab.test.tsx
  - webapp/src/lib/launch-api.ts
  - webapp/src/lib/launch-plan-view.ts
  - webapp/src/lib/__tests__/launch-plan-view.test.ts
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
status: issues_found
---

# Phase 35: 3차 코드 리뷰 보고서 (2차 리뷰 수정분)

**검토 시각:** 2026-11-01T05:35:33Z
**깊이:** standard
**검토 파일:** 13
**상태:** issues_found
**범위:** `git diff c85e0dc2 HEAD -- relay server webapp`. 2차 리뷰 수정 커밋 4개(5b190db2 · 9e2ebeb6 · d6307858 · 588f44cc)가 바꾼 소스와 그 호출 경로를 봤다. 보안 검사는 프로젝트 설정에 따라 하지 않았다.

## Summary

diff 를 따라 다음 호출 경로를 확인했다.

- relay: `LaunchPlanService.read` · `set` · `#within` · `#readVia`, `GET`/`PUT /launch-plan` 라우트, `launchPlanOf` · `toRelayError`
- server: `saveLaunchPlanViaRelay` · `relayNotSent`, `request()` 의 `netCode`, PUT 라우트에서 4xx 가 나는 위치(relay 호출 전인지)
- webapp: `onSave` 의 세 분기, `markPlan` · `reloadPlan` 세대 가드, `planStateWithReload` · `planStateWithSave` · `panelPlanOf`, `authFetch` · `apiFetch` 의 오류 모양(`ApiClientError.status`)

대상 단위 테스트는 이번 리뷰 중 다시 돌려 모두 통과했다. webapp 2파일 61건, relay `admin-launch-plan` 18건, server 2파일 98건이다.

세대 가드는 경합을 바르게 막는다. 확인한 순서는 네 가지다. ① 다시 읽기 비행 중 다른 서버 저장 ② 같은 서버 재저장 ③ 다시 읽기 두 건의 도착 역전 ④ failed · offline 저장은 세대를 올리지 않음. relay 조회 마감, server 「확실히 안 보냄」 분류, webapp 4xx 분류도 지적한 경우를 정확히 닫았다. 4xx 는 server 라우트에서 모두 relay 호출과 이력 기록 전에 던진다(`routes/admin-launch.ts:98-111`). 그래서 확정 미반영으로 보는 판정이 맞다.

새 문제는 **R2-WR-01 수정이 「그 서버 ok 일 때만 바꾼다」 로 바꾼 결과**에 있다(R3-WR-01). 다시 읽기가 그 서버 값을 못 가져오면(timeout · offline · failed · 요청 throw) 화면은 저장 전 값을 서버 계획으로 그대로 보인다. 그 사실을 알리는 표시도 없다. 결과 줄은 「다시 읽은 계획으로 확인」 이라고 안내하지만 그 계획은 다시 읽은 값이 아니다. 게다가 다시 읽기가 불리는 혼잡 경로에서는 R2-WR-02 의 5초 조회 마감 때문에 그 서버 timeout 이 오히려 흔하다. 수정 전에는 그 서버가 대신 값(「서버 연결 안 됨」)으로 떨어져 「못 읽음」 이 보였다. 실거래 발사 시각 화면에서 저장 결과를 잘못 읽게 만드는 회귀다.

## 2차 findings 수정 확인

| 2차 ID | 판정 | 근거 |
|---|---|---|
| R2-WR-01 | resolved(새 결함 R3-WR-01) | 덮어쓰기가 서버별로 바뀌었다. 실패 모양 응답(두 서버 offline 200)은 계획 · 편집 칸 · 결과 줄을 지우지 않는다. 늦게 온 응답은 세대(`planSeen`)가 뒤인 서버만 버린다. 이력은 id 로 합친다. `fresh` 로 `joined` 합치기를 피한 것도 맞다(합치면 먼저 나간 요청의 옛 응답이 새 세대 번호로 반영된다). 남은 문제는 반대쪽이다. 그 서버 값을 못 다시 읽었을 때 저장 전 값이 「다시 읽은 계획」 처럼 남는다(R3-WR-01). |
| R2-WR-02 | resolved | `read(keys, { deadlineAt })` 가 서버마다 `#within` 으로 접고, 늦은 서버만 `timeout` + info 1줄을 남긴다. 라우트는 도착 + 5초를 넘긴다(server 6초 상한 안 · 여유 1초). `#within` 은 `finally` 에서 타이머를 지우고 `unref` 한다. op 9 는 취소하지 않지만 `AdminConn.command` 가 never-reject 라 버려진 약속의 unhandled rejection 은 없다. R4 · R4b · L4 테스트가 부분 timeout · 마감 안 응답 · 라우트 마감 전달을 각각 잠근다. |
| R2-WR-03 | resolved(남은 경우는 R3-IN-04) | `relayNotSent` 가 다루는 경우는 모두 relay 가 op 8 을 보내기 전이다. status 0 + `ECONNREFUSED` · `ENOTFOUND` · `EAI_AGAIN`, relay 400 · 401 · 404, 503 `LAUNCH_PLAN_UNAVAILABLE` 가 그렇다. 근거: relay 400 은 `toRelayError` 의 ZodError(경로 · 바디 parse, `set()` 앞), 503 은 `launchPlanOf()`(`set()` 앞)에서 나온다. `set()` 안에서는 4xx 를 던질 곳이 없다. 연결 리셋 · 타임아웃 · 다른 5xx 는 timeout 그대로라 1차 CR-01 의도도 지킨다. relay VM 이 꺼져 SYN 이 응답 없이 떨어지는 경우는 여전히 `ECONNABORTED` → timeout 이다(R3-IN-04). |
| R2-IN-01 | resolved | `ApiClientError` 이고 400 ≤ status < 500 이면 `rejectedSaveResultOf` → failed 를 보인다. 세대를 올리지 않고 다시 읽지 않는다. 확인한 근거는 세 가지다. ① 로컬 세션 없음 401 은 `authFetch` 가 왕복 없이 throw 한다. ② server 401 · 403 · 400 은 핸들러 앞단에서 난다. ③ 4xx 본문이 JSON 이 아니어도 status 는 그대로 실린다(`apiFetch`). 200 인데 JSON 파싱이 실패하면 status 200 이라 timeout + 다시 읽기로 가는데, 이것도 맞는 분류다. |

## Warnings

### R3-WR-01: 다시 읽기가 그 서버 값을 못 가져와도 저장 전 값이 「다시 읽은 계획」 처럼 남음 — 결과 줄은 「다시 읽은 계획으로 확인」 인데 확인할 값이 없음

**File:** `webapp/src/components/admin/launch-map-tab.tsx:153-168` (호출 `:204` · `:216-217`) · `webapp/src/lib/launch-plan-view.ts:252-266` · 결과 줄 문구 `webapp/src/lib/launch-plan-view.ts:340-344`

**Issue:** 결과를 모르는 저장(응답 timeout · 요청 throw)이면 결과 줄은 「KB120 응답 없음: 반영됐는지 몰라요 — 다시 읽은 계획으로 확인」 이다. 지도 탭은 다시 읽기를 1회 보낸다. 그런데 이번 수정 뒤 다시 읽기는 다음 경우에 **아무 표시 없이** 끝난다.

- 응답에서 그 서버가 `ok` 가 아니다(`timeout` · `offline` · `failed`). `take` 에서 빠지고 `planStateWithReload` 가 마지막 값을 유지한다.
- 요청이 throw 했다(`() => {}`, `:167`).
- 응답이 `absent` 다(`:158`).

마지막 값은 timeout · throw 경로에서 **저장 전 값**이다(`planStateWithSave` 는 plan null 이면 서버 값을 바꾸지 않는다). 패널은 `source: 'server'` 로 그 값을 실선 · 계획 줄 · KPI 에 그린다. 화면만 보면 「다시 읽었더니 옛 값 → 반영 안 됨」 으로 읽힌다. 실제로는 relay FIFO 에 남은 op 8 이 몇 초 뒤 반영됐을 수 있다. 결과 줄도 그대로라 운영자는 지금 보이는 계획이 다시 읽은 값인지 저장 전 값인지 가를 수 없다.

이 경로는 드물지 않다. 다시 읽기가 불리는 상황 자체가 relay FIFO 혼잡이다. 예를 들어 저장 마감 10초 안에 86 이 오지 않아 timeout 이 난 경우다. 이때 다시 읽기의 KB120 op 9 는 아직 남은 op 8 뒤에 줄을 선다. R2-WR-02 수정으로 relay 는 그 op 9 를 5초 마감에서 `timeout` 으로 접는다. 결국 **결과를 모르는 바로 그 서버**가 다시 읽기에서도 timeout 이 될 가능성이 가장 높다.

수정 전 코드(통째 덮어쓰기)에서는 그 서버가 `timeout` 으로 바뀌었다. `entry` 가 null 이 되어 대신 값(「서버 연결 안 됨 · 마지막 발사 값」)으로 떨어졌고, 적어도 「지금 계획을 모름」 이 보였다(대신 편집 칸이 사라지는 R2-WR-01 문제가 있었다). 지금은 그 신호가 사라지고 옛 값이 확정 값처럼 보인다. 실거래 발사 시각 설정 화면에서 「반영됐는데 미반영으로 읽힘」 방향의 오보고다. 운영자가 다시 저장하면 해는 없다(같은 값 op 8). 하지만 「안 바뀌었으니 그대로 둔다」 로 판단하면 화면과 실제 발사 계획이 갈라진다.

ok · plan null(`sentOnly`) 경로는 해당하지 않는다. 그 경로는 보낸 값으로 먼저 맞춰 두므로 다시 읽기가 실패해도 남는 값이 맞는 값이다.

**Fix:** 다시 읽기의 결과를 저장 결과 줄에 반영한다. 대상 서버를 실제로 반영했을 때만 「다시 읽은 계획」 이라고 말한다.
```tsx
// launch-map-tab.tsx — reloadPlan 이 대상 칸 키 · 서버를 받아 결과를 lastSave 에 덧붙인다
const reloadPlan = (key: string, gateway: string) => {
  planSeq.current += 1;
  const seq = planSeq.current;
  const settle = (reread: 'ok' | 'failed' | 'superseded') =>
    setLastSave((l) => (l !== null && l.key === key ? { ...l, save: { ...l.save, reread } } : l));
  fetchLaunchPlan({ fresh: true }).then(
    (r) => {
      if (r.kind !== 'ready') return settle('failed');
      const take = new Set(Object.keys(r.resp.servers).filter((g) => r.resp.servers[g]?.status === 'ok' && seq > (planSeen.current[g] ?? 0)));
      for (const g of take) planSeen.current[g] = seq;
      setPlan((s) => planStateWithReload(s, r.resp, take));
      // 대상 서버: 반영 = ok · 더 최신 값이 이미 있음 = superseded · 그 밖(timeout · offline · failed) = failed
      settle(take.has(gateway) ? 'ok' : r.resp.servers[gateway]?.status === 'ok' ? 'superseded' : 'failed');
    },
    (e: unknown) => {
      console.warn('[launch-map] 저장 뒤 계획 다시 읽기 실패', e);
      settle('failed');
    },
  );
};
// saveResultViewOf(timeout) 줄: reread === 'failed' →
//   「KB120 응답 없음: 반영됐는지 몰라요 — 계획을 다시 읽지 못했어요(보이는 값은 저장 전 값일 수 있음) · 잠시 뒤 새로고침」
// reread === undefined(비행 중) → 「… 계획을 다시 읽는 중」
```
다시 읽기가 timeout 이면 한 번만 늦춰 다시 읽는 방법도 있다(예: relay 저장 마감 10초 뒤). 다만 그 경우에도 위 표시는 필요하다. 테스트는 두 경우를 넣는다. 「timeout 저장 → 다시 읽기의 KB120 timeout」 과 「요청 throw → 다시 읽기 throw」 에서 결과 줄이 「다시 읽지 못했어요」 로 바뀌는지 확인한다.

## Info

### R3-IN-01: 요청 throw 경로의 다시 읽기는 server 가 아직 처리 중인 PUT 보다 먼저 relay 에 닿을 수 있음 — 저장 전 값을 「최신」 으로 반영

**File:** `webapp/src/components/admin/launch-map-tab.tsx:209-218`

**Issue:** 브라우저 쪽 실패(네트워크 끊김 · 프록시 502 등)로 `saveLaunchPlan` 이 throw 해도 요청은 server 에 닿았을 수 있다. Express 는 클라이언트 연결이 끊겨도 핸들러를 멈추지 않는다. relay `set()` 도 server 연결 끊김으로 멈추지 않는다. 그런데 지도 탭은 throw 즉시 `markPlan` → `reloadPlan` 을 보낸다. 다시 읽기 GET 의 op 9 가 PUT 의 op 8 보다 먼저 그 서버 FIFO 에 들어가면 응답은 저장 전 값 `ok` 다. 이 값은 `seq > planSeen` 이라 그대로 반영되고 「다시 읽은 계획」 으로 보인다. 그 뒤 op 8 이 반영돼도 화면은 모른다. 세대 가드는 「응답 도착 순서」 만 보고, 다시 읽기 요청이 PUT 처리보다 뒤인지는 보장하지 않는다. 창이 작아(PUT 처리는 보통 1초 이내) Info 로 둔다.

**Fix:** throw 경로는 다시 읽기를 relay 저장 마감(10초)만큼 늦춰 보낸다. 또는 응답 `changes` 에 이 저장의 이력 행이 나타날 때까지(server 가 PUT 을 끝냈다는 신호) 한 번 더 읽는다. 최소한 R3-WR-01 표시에서 throw 경로는 「다시 읽은 값도 저장 전일 수 있음」 으로 안내한다.

### R3-IN-02: 「relay 가 보내기 전에 거절」 offline 이 원인을 감추고 「잠시 뒤 다시 시도」 를 권함 — 다시 시도로는 풀리지 않는 설정 결함

**File:** `server/src/services/admin-launch.ts:258-264` · 화면 문구 `webapp/src/lib/launch-plan-view.ts:345-349`

**Issue:** `relayNotSent` 가 참인 경우는 모두 `offline` + `RELAY_FAILED_MESSAGE`(「relay 처리에 실패했어요. 잠시 뒤 다시 시도하세요.」)로 접힌다. 화면 결과 줄은 「KB120 미반영: 서버 연결 안 됨」 이다. 그런데 401(공유 비밀 불일치) · 400(server · relay 스키마 어긋남) · 404 · 503 `LAUNCH_PLAN_UNAVAILABLE`(구 relay)은 gh-trade 서버 연결 문제가 아니고, 시간이 지나도 풀리지 않는 설정 · 배포 결함이다. 이력 행에도 relay status · code 가 남지 않는다(`code: null`, message 고정). 그래서 D-29 이력만으로는 「relay 재기동 중 거부」 와 「비밀 어긋남」 을 가를 수 없다. 운영자는 「서버 연결 안 됨」 을 보고 gh-trade 서버부터 의심하게 된다. 확정 미반영이라는 판정 자체는 맞다.

**Fix:** offline message 에 원인을 싣는다. 예: status 0 → `RELAY_FAILED_MESSAGE` 그대로, 그 밖 → `relay 거부(${status}${code ? ` ${code}` : ''}) — 설정 · 배포 확인`. 바디 원문은 싣지 않고 code 만 쓴다(isRelayErrorBody). 화면 offline 줄은 message 가 있으면 「미반영: <message>」 로 보인다.

### R3-IN-03: 테스트 공백 — `fresh` 우회 · throw 경로 세대 · 대상 서버 non-ok 다시 읽기가 잠기지 않음

**File:** `webapp/src/lib/launch-api.ts:66-76` · `webapp/src/components/admin/__tests__/launch-map-tab.test.tsx:553-649`

**Issue:** 수정 보고는 `fetchLaunchPlan({ fresh: true })` 가 `joined` 를 우회하는 것을 「리뷰 스니펫에 없던 함정」 의 해결로 든다. 그런데 컴포넌트 테스트는 `fetchLaunchPlan` 을 통째로 목으로 바꾸고, 인자(`{ fresh: true }`)만 단언한다(`toHaveBeenLastCalledWith`). `launch-api` 단위 테스트는 없다. 그래서 `fresh` 분기가 실제로 `authFetch` 를 새로 부르는지, 진행 중 `inflight` 에 합쳐지지 않는지는 아무 테스트도 보지 않는다. 그 밖에 비어 있는 경우는 둘이다.
- throw 경로 `markPlan`: 요청 throw 가 그 전에 나간 다시 읽기의 그 서버 값을 버리는지.
- 대상 서버 non-ok 다시 읽기: 다시 읽기에서 그 서버가 timeout 일 때 무엇이 보이는지(R3-WR-01).

**Fix:** `launch-api` 테스트를 추가한다. `authFetch` 목에 진행 중 약속을 하나 두고, `fetchLaunchPlan()` 다음 `fetchLaunchPlan({ fresh: true })` 를 불러 `authFetch` 2회 호출을 단언한다. 지도 탭 테스트에는 「KB120 저장 throw → 비행 중이던 다시 읽기 R1 의 KB120 값은 버림」 과 R3-WR-01 의 두 경우를 넣는다.

### R3-IN-04: relay VM 이 꺼진 경우(SYN 무응답 → `ECONNABORTED`)는 여전히 timeout(「반영됐을 수 있음」)으로 이력에 쌓임

**File:** `server/src/services/admin-launch.ts:217` · `server/src/services/relay-admin-client.ts:337-352`

**Issue:** R2-WR-03 이 든 「연결 거부」 는 VM 은 살아 있고 relay 프로세스만 내려간 경우(`ECONNREFUSED`)다. 그런데 relay VM 을 정지하는 경우도 있다(장 마감 20:00 뒤 정지 · 재적용 운영). 그때는 내부 IP 로 가는 SYN 이 응답 없이 떨어진다. axios 는 `timeout`(기본 15초) 뒤 `ECONNABORTED` 를 낸다. 연결이 맺어진 적이 없어 op 8 이 나갈 수 없었는데도 timeout 으로 기록되고, 화면은 「반영됐는지 몰라요」 + 다시 읽기를 보인다. 응답 타임아웃과 같은 코드라 지금 구조로는 가를 수 없다. 보수적 방향이라 Info 로 둔다.

**Fix:** 연결 단계를 따로 잰다. 예: `http.Agent` 소켓에 `connect` 이벤트 플래그를 달고, 오류 때 `err.request?.socket` 이 연결된 적이 없으면 `netCode: 'CONNECT_TIMEOUT'` 으로 바꾼다. 또는 짧은 연결 상한(예: 2초)을 두고 그 안에 연결이 안 되면 그 코드를 쓴다. 그런 다음 `NOT_SENT_NET_CODES` 에 넣는다.

---

_Reviewed: 2026-11-01T05:35:33Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
