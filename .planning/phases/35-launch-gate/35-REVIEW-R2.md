---
phase: 35-launch-gate
reviewed: 2026-11-01T01:28:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - relay/src/admin/launch-plan.ts
  - relay/src/tools/launch-backfill.ts
  - relay/tests/admin-launch-plan.test.ts
  - relay/tests/launch-backfill.test.ts
  - scripts/launch-backfill.ts
  - server/src/services/admin-launch.ts
  - server/tests/routes/admin-launch.test.ts
  - webapp/e2e/specs/admin-launch.spec.ts
  - webapp/src/components/admin/__tests__/launch-client.test.tsx
  - webapp/src/components/admin/__tests__/launch-map-tab.test.tsx
  - webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx
  - webapp/src/components/admin/launch-client.tsx
  - webapp/src/components/admin/launch-map-tab.tsx
  - webapp/src/components/admin/launch-orders-tab.tsx
  - webapp/src/components/admin/launch-plan-editor.tsx
  - webapp/src/lib/__tests__/launch-format.test.ts
  - webapp/src/lib/__tests__/launch-plan-view.test.ts
  - webapp/src/lib/launch-api.ts
  - webapp/src/lib/launch-format.ts
  - webapp/src/lib/launch-plan-view.ts
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues_found
---

# Phase 35: 2차 코드 리뷰 보고서 (리뷰 수정분)

**검토 시각:** 2026-11-01T01:28:00Z
**깊이:** standard
**검토 파일:** 20
**상태:** issues_found
**범위:** fix 커밋 7개(f448079f · 185f9252 · 2d81a7be · 560a74da · e6f22665 · 2996e83b · 1ef9a8fe)의 diff 와 그 호출 경로. 기준은 `0227cd76`(1차 리뷰 커밋)이다. 보안 검사는 프로젝트 설정에 따라 하지 않았다.

## Summary

7건 수정의 diff 를 하나씩 보고 호출 경로를 따라갔다. 따라간 경로는 relay `AdminConn.command` · `#pump` · `#failAll`, relay admin-api 라우트, server 라우트 · `relay-admin-client.request`, webapp 편집 칸 `entry` 유도(`panelPlanOf`)다. 대상 단위 테스트(relay 2파일 38건 · webapp 3파일 57건)는 이번 리뷰 중 다시 돌려 통과를 확인했다.

백필 쪽(WR-02 · IN-04)과 화면 표기 쪽(IN-01 · IN-02 · IN-03)은 지적을 정확히 해결했고 새 결함이 없다. relay `set()` 의 마감 묶기와 「op 8 을 넣은 뒤는 timeout」 판정도 `AdminConn` 의미(never-reject · FIFO · `#failAll`)와 맞다.

새 문제는 **CR-01 · WR-01 수정이 추가한 「계획 1회 다시 읽기」 경로**에 모였다.

- (R2-WR-01) `reloadPlan` 이 응답을 순서 · 서버별 상태를 보지 않고 통째로 덮어쓴다. 실패 모양 응답(두 서버 offline)이면 방금 맞춘 계획과 편집 칸 · 「응답 없음」 결과 줄이 사라진다. 늦게 온 응답이면 다른 서버의 더 최신 저장을 저장 전 값으로 되돌린다. 후자는 1차 WR-01 증상(「저장」 · 「되돌리기」 가 옛 값 기준)이 경합으로 다시 생기는 것이다.
- (R2-WR-02) 1차 CR-01 이 함께 지적한 「GET `/launch/plan` 6초 상한이 FIFO 대기로 넘어감」 은 고치지 않았다. 그런데 다시 읽기는 정확히 그 혼잡 상황(저장 timeout · 후 조회 생략)에서 불린다. 그래서 R2-WR-01 의 「통째 offline」 이 실제로 자주 나는 경로가 된다.
- (R2-WR-03) server 가 「확실히 안 보낸」 실패(relay 연결 거부 · relay 401 · 503 `LAUNCH_PLAN_UNAVAILABLE` · 400)까지 `timeout`(「반영됐을 수 있어요」)으로 영구 이력에 남긴다. 1차 CR-01 의 반대 방향 오분류다.

## 1차 findings 수정 확인

| 1차 ID | 판정 | 근거 |
|---|---|---|
| CR-01 | partially | 저장 경로 3층(relay `set()` · server `saveLaunchPlanViaRelay` · webapp `onSave`)의 「보냈는데 결과 모름 → timeout + 다시 읽기」 는 맞게 들어갔다. relay `set()` 마감 묶기(`#within`)도 맞다. 다만 같은 지적에 포함된 GET `/launch/plan` 큐 대기 문제(relay `read()` 마감 없음 · server 6초)가 남았다(R2-WR-02). server 는 확정 미반영까지 timeout 으로 접는다(R2-WR-03). |
| WR-01 | resolved | `planStateWithSentEntry` 로 보낸 값을 먼저 맞추고, 편집 칸 기준을 다시 열고, `planNeedsReload` 로 1회 다시 읽는다. 편집 칸 기준 `entry` 가 계획 상태에서 유도되므로(`panelPlanOf`) 다시 읽기도 기준을 맞춘다. 다시 읽기 자체의 경합은 새 결함으로 R2-WR-01 에 따로 적었다. |
| WR-02 | resolved | `pieceKey` · `headKey` · `groups` 정렬 키에 `fire_base` 가 들어가 DB PK(20261030200000)와 같다. 두 회차 → 두 조각 · 두 머리 단언이 추가됐다. |
| IN-01 | resolved | `badFire` 를 정본화 effect 와 deps 에 넣었고 `fire` 키만 지운다. 단위 테스트 3건이 추가됐다. |
| IN-02 | resolved | `count` · `counts` 를 `!isLaunchTailProbe` 로 거르고 `probes` 를 따로 보인다. 머리 `n_pieces` 와 정의가 같다. |
| IN-03 | resolved | 응답 때 `e.draft` 가 요청 때 `draft` 와 같을 때만 다시 연다(`untouched`). 저장 중에 입력을 고치면 그 입력이 유지된다는 테스트가 추가됐다. |
| IN-04 | resolved | profile · fire_exchange 어휘 검사, `isLaunchFireBaseOf` 조합 검사, `.json` 원소별 ndjson 판정(`sent_rel_us` 키 — 첨부 형식은 `rel` 이라 충돌 없음)이 들어갔다. A NXT 머리 정의 차이를 dry-run 에 경고한다. |

## Warnings

### R2-WR-01: 저장 뒤 「다시 읽기」 가 응답을 무조건 통째로 덮어씀 — 실패 모양 응답은 계획 · 편집 칸을 지우고, 늦게 온 응답은 더 최신 저장을 되돌림

**File:** `webapp/src/components/admin/launch-map-tab.tsx:136-143` (호출 `:174` · `:180`)

**Issue:** `reloadPlan` 은 `r.kind === 'ready'` 만 보고 `setPlan({ kind: 'ready', resp: r.resp })` 로 서버 전체 계획과 이력을 바꾼다. 두 경로에서 화면이 틀어진다.

1. **실패 모양 응답.** server `readLaunchPlanServers` 는 relay 호출이 실패하면 200 · `{ servers: 모든 서버 offline }` 을 돌려준다(`server/src/services/admin-launch.ts` `allServers(offline)`). 그래도 웹에는 `ready` 로 온다. 다시 읽기가 불리는 상황은 relay FIFO 가 혼잡한 경우다. 저장 timeout · 마감 때문에 후 조회를 건너뛴 ok 가 그렇다. 이때 GET 은 앞에 남은 op 8 뒤에 줄을 서므로 6초 상한을 넘기 쉽다(R2-WR-02). 결과는 다음과 같다.
   - 두 서버 패널의 `entry` 가 null 이 된다. 이 저장과 상관없는 건강한 서버의 계획까지 대신 값으로 떨어진다.
   - 편집 칸은 `open && entry !== null` 이 거짓이라 사라진다. 그 안의 「KB120 응답 없음: … 다시 읽은 계획으로 확인」 결과 줄도 같이 사라진다.
   - WR-01 경로(ok · plan null)에서는 `planStateWithSentEntry` 로 맞춘 낙관 값도 지워진다.

   수정 전에는 다시 읽기가 없어서 적어도 마지막으로 알던 계획이 남았다. 이 동작은 이번 수정이 만든 회귀다.
2. **순서 역전.** 다시 읽기에는 순번이나 「그 뒤에 저장이 있었나」 확인이 없다. 예를 들어 다음 순서로 일이 일어난다.
   - KB120 저장이 timeout 이 되어 다시 읽기 R 이 나간다(GET 은 두 서버 op 9 를 병렬로 보낸다).
   - 몇 초 안에 KYOBO119 패널에서 저장 B 를 한다. KYOBO119 FIFO 에는 R 의 op 9 가 B 의 op 8 보다 먼저 들어가 있다.
   - B 응답이 먼저 와서 KYOBO119 를 새 값으로 바꾼다.
   - R 은 느린 KB120 op 9 때문에 늦게 도착한다. 그 안에 든 KYOBO119 값 · `changes` 는 B 이전 것이다.

   그 결과 KYOBO119 패널이 저장 전 계획으로 돌아간다. B 의 편집 칸은 `untouched` 로 B 값에 다시 열려 있으므로 `changed` 가 참이 된다. 「저장」 이 다시 켜지고 「되돌리기」 는 B 이전 값을 가리킨다. 1차 WR-01 과 같은 증상이 경합으로 다시 생긴다. 이력 맨 위의 B 행도 사라진다.

**Fix:** 다시 읽기는 「요청을 보낸 뒤 다른 저장 응답이 없었을 때」 만 반영하고, 반영할 때도 그 저장의 서버만, 그리고 ok 일 때만 바꾼다.
```tsx
const planSeq = useRef(0); // onSave 응답 · reloadPlan 반영 때마다 +1

const reloadPlan = (gateway: string) => {
  const seq = ++planSeq.current;
  fetchLaunchPlan().then(
    (r) => {
      if (r.kind !== 'ready' || planSeq.current !== seq) return; // 그 사이 다른 저장 응답이 왔다 — 버린다
      const server = r.resp.servers[gateway];
      setPlan((s) => {
        if (s.kind !== 'ready') return { kind: 'ready', resp: r.resp };
        // 실패 모양(offline · timeout)이면 마지막으로 알던 값을 지우지 않는다 — 그 서버 ok 일 때만 바꾼다.
        const servers = server?.status === 'ok' ? { ...s.resp.servers, [gateway]: server } : s.resp.servers;
        return { kind: 'ready', resp: { servers, changes: r.resp.changes } };
      });
    },
    () => {},
  );
};
// onSave 응답 분기 맨 앞에서 planSeq.current += 1
```

### R2-WR-02: GET `/launch-plan` 에 마감이 없음 — 1차 CR-01 의 「6초 상한 + FIFO 대기」 지적이 남았고, 다시 읽기가 그 경로를 혼잡할 때마다 밟음

**File:** `relay/src/admin/launch-plan.ts:80-88` · `relay/src/admin/admin-api.ts:819-823` · `server/src/services/relay-admin-client.ts:75`

**Issue:** 1차 CR-01 은 저장과 함께 「GET `/launch/plan` 의 6초 상한(`RELAY_LAUNCH_PLAN_READ_TIMEOUT_MS`)도 큐 대기 한 건이면 넘어 두 서버가 통째로 offline」 을 지적했다. 수정은 `set()` 만 `deadlineAt` · `#within` 으로 묶었다. `read()` 는 여전히 서버별 `#readVia` 를 마감 없이 `Promise.all` 로 기다린다. relay GET 라우트도 마감을 넘기지 않는다.

`AdminConn` 의 5초 타이머는 송신 시점에 시작한다. 그래서 한 서버 FIFO 에 앞선 op 가 하나만 있어도 「대기 + 5초」 가 server 6초를 넘는다. 그러면 relay 응답 전체가 버려지고 **두 서버 모두** offline 이 된다. 건강한 서버의 계획도 같이 잃는다.

이번 수정으로 이 경로의 비중이 커졌다. 저장 timeout 과 후 조회 생략은 「op 8 이 아직 FIFO 에 있거나 비행 중」 일 때 나는데, 웹은 바로 그때 GET 을 1회 보낸다. 그 GET 의 KB120 op 9 는 op 8 뒤에 줄을 선다.

**Fix:** `read()` 에도 요청 마감을 두고 서버별로 접는다. 그러면 느린 서버만 timeout 이 되고 다른 서버 값은 산다.
```ts
// relay/src/admin/launch-plan.ts
async read(serverKeys: readonly string[], opts?: { deadlineAt: number }): Promise<Record<string, LaunchPlanServer>> {
  const keys = [...new Set(serverKeys)];
  const values = await Promise.all(
    keys.map(async (k) =>
      opts === undefined ? this.#readOne(k) : ((await this.#within(this.#readOne(k), opts.deadlineAt)) ?? { status: "timeout" as const }),
    ),
  );
  ...
}
// admin-api.ts GET /launch-plan — deadlineAt = 도착 + (RELAY_LAUNCH_PLAN_READ_TIMEOUT_MS − 여유 1초) 정도로 넘긴다.
```

### R2-WR-03: server 가 「확실히 안 보낸」 저장 실패까지 timeout(「반영됐을 수 있어요」)으로 영구 이력에 기록 — CR-01 의 반대 방향 오분류

**File:** `server/src/services/admin-launch.ts:229-250` · `server/src/services/relay-admin-client.ts:340-349`

**Issue:** 수정은 「요청을 보낸 뒤의 실패」 를 status 0 · 비200 · 모양 위반 전부로 잡았다. 그런데 이 가운데 다음 경우는 relay 가 op 8 을 **보낼 수 없었던** 것이 확실하다.
- **status 0 중 연결 자체 실패.** `ECONNREFUSED` · `ENOTFOUND` 가 여기에 든다. relay 재배포 · 재기동 중에 흔하다. `request()` 는 `err.code` 를 로그로만 남기고 `{ status: 0 }` 로 접기 때문에 호출부가 가를 수 없다.
- **relay 가 핸들러 앞단에서 거절한 4xx · 503.** 공유 비밀 불일치 401, relay 가 `launchPlan` 없는 버전일 때의 503 `LAUNCH_PLAN_UNAVAILABLE`(`admin-api.ts:811-816`), zod 400 · 404 가 그렇다. 셋 다 `launchPlan.set()` 을 부르기 전에 던진다.

이 경우들이 `outcome: "timeout"` · `RELAY_UNKNOWN_SAVE_MESSAGE` 로 `launch_plan_changes`(D-29 영구 이력)에 남는다. 화면은 「반영됐는지 몰라요」 를 보인다. 1차 CR-01 이 문제 삼은 「이력과 실제가 다르다」 가 방향만 바뀌어 남는다. 특히 relay 를 롤백해서 503 이 날 때는 모든 저장이 「반영됐을 수 있음」 으로 쌓인다. 「경계가 언제부터 바뀌었나」 대조에 잡음이 생긴다.

보수적 방향(모름)이라 BLOCKER 는 아니다. 다만 relay 가 명시적으로 거절한 응답은 결과를 아는 경우다.

**Fix:** 연결 단계 오류 코드와 relay 업무 오류 본문을 구분한다.
```ts
// relay-admin-client request(): status 0 일 때 오류 코드를 같이 돌려준다
return { status: 0, data: null, netCode: typeof code === "string" ? code : "UNKNOWN" };

// saveLaunchPlanViaRelay
const notSent = (r.status === 0 && (r.netCode === "ECONNREFUSED" || r.netCode === "ENOTFOUND"))
  || r.status === 400 || r.status === 401 || r.status === 404
  || (r.status === 503 && isRelayErrorBody(r.data) && r.data.error.code === "LAUNCH_PLAN_UNAVAILABLE");
if (notSent) return { result: { server: gateway, outcome: "offline", message: RELAY_FAILED_MESSAGE }, before_us: null, plan: null };
// 그 밖(타임아웃 · ECONNRESET · 5xx · 모양 위반) → timeout(결과 모름)
```
server 테스트 P35-S8 표에 「relay 503 LAUNCH_PLAN_UNAVAILABLE → offline」 · 「ECONNREFUSED → offline」 행을 넣는다.

## Info

### R2-IN-01: webapp 요청 실패 분기가 4xx(세션 만료 401 · 400)까지 「응답 없음: 반영됐는지 몰라요」 로 보임

**File:** `webapp/src/components/admin/launch-map-tab.tsx:176-181` · `webapp/src/lib/launch-api.ts:81-95`

**Issue:** `saveLaunchPlan` 은 `authFetch` 오류를 그대로 throw 한다. `onSave` 실패 분기는 모든 throw 를 timeout 으로 본다. 그런데 server 가 401 · 403(인증) · 400(`ValidationFailed` — 라우트에서 relay 호출 전에 던짐)으로 답했다면 저장은 확실히 일어나지 않았다. 이력에도 남지 않는다. 그런데도 화면은 「반영됐는지 몰라요」 라고 보인다. 영구 이력과는 무관한 표시 문제라 Info 로 둔다.

**Fix:** `e instanceof ApiClientError && e.status >= 400 && e.status < 500` 이면 결과를 `offline`(또는 별도 문구 「요청 거부: <status>」)으로 보이고 다시 읽기를 건너뛴다. 타임아웃 · 네트워크 · 5xx 만 timeout + 다시 읽기로 둔다.

---

_Reviewed: 2026-11-01T01:28:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
