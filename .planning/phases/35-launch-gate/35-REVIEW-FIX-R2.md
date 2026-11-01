---
phase: 35-launch-gate
fixed_at: 2026-11-01T01:49:32Z
review_path: .planning/phases/35-launch-gate/35-REVIEW-R2.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 35: 2차 코드 리뷰 수정 보고

**수정 시각:** 2026-11-01T01:49:32Z
**원본 리뷰:** .planning/phases/35-launch-gate/35-REVIEW-R2.md
**회차:** 1

**요약:**
- 범위 안 지적: 4 (WR 3 · IN 1, fix_scope = all)
- 수정: 4
- 건너뜀: 0

DB 마이그레이션은 필요 없다. **relay 변경(R2-WR-02)이 있어 relay 를 따로 배포해야 한다.** server(R2-WR-03)와 webapp(R2-WR-01 · R2-IN-01)은 각자 배포 경로로 반영된다. 이 수정에서는 배포 · push 를 하지 않았다.

## Fixed Issues

### R2-WR-01: 저장 뒤 「다시 읽기」 가 응답을 무조건 통째로 덮어씀

**수정한 파일:** `webapp/src/components/admin/launch-map-tab.tsx`, `webapp/src/lib/launch-plan-view.ts`, `webapp/src/lib/launch-api.ts`, `webapp/src/components/admin/__tests__/launch-map-tab.test.tsx`, `webapp/src/lib/__tests__/launch-plan-view.test.ts`
**커밋:** 5b190db2
**적용한 수정:**
- `planStateWithReload(state, resp, take)`(순수 함수)를 새로 만들었다.
  - `take` 에 든 서버 가운데 status `ok` 인 서버만 바꾼다.
  - 실패 모양 응답(relay 실패 → 두 서버 offline 200 · timeout · failed)이면 마지막으로 알던 계획을 그대로 둔다. 그래서 편집 칸 기준 `entry`, 편집 칸, 결과 줄이 사라지지 않는다.
  - 이력은 id 로 합친다. 늦게 온 응답이 그 뒤 저장 응답이 넣은 행을 지우지 않는다.
- 지도 탭에 서버별 세대(`planSeq` · `planSeen`)를 두었다.
  - 저장 응답이 그 서버 값을 바꿨거나 바꿨을 수 있으면 세대를 올린다. plan 이 있을 때, ok · timeout(`planNeedsReload`)일 때, 요청이 throw 했을 때가 그렇다.
  - failed · offline · skipped 는 바뀐 것이 없으므로 세대를 올리지 않는다. 그 전에 보낸 다시 읽기가 가져오는 유효한 값을 버리지 않기 위해서다.
  - 다시 읽기는 보낼 때 세대 번호를 받는다. 응답이 왔을 때 그 서버 세대가 더 뒤면 그 서버 값만 버린다. 반영한 서버의 세대는 그 번호로 맞춘다.
  - 리뷰 스니펫은 「그 사이 저장 응답이 하나라도 있었으면 응답 전체를 버림」 이었다. 이대로 하면 저장과 무관한 서버(예: timeout 이 난 KB120)의 다시 읽기 값까지 잃는다. 그래서 서버별 판정으로 바꿨다.
- **리뷰 스니펫에 없던 함정:** `fetchLaunchPlan` 은 진행 중인 같은 경로 요청을 합친다(`joined`). 다시 읽기 R1 이 비행 중일 때 R2 를 요청하면 R2 가 R1 의 옛 응답을 받는다. 그 옛 값이 R2 의 새 세대 번호로 반영된다. 그래서 다시 읽기는 `fetchLaunchPlan({ fresh: true })` 로 합치지 않고 보낸다. 탭 진입 조회는 그대로 합친다(StrictMode 이중 실행 대비).
- 테스트:
  - 「ok · plan null 저장 → 다시 읽기가 두 서버 offline」 에서 보낸 값 · 편집 칸 · 「저장됨」 결과 줄 · 교보 계획이 유지되는지 확인한다.
  - 「KB120 timeout → R 비행 중 교보 저장 ok → R 이 늦게 도착(교보 옛 값)」 에서 교보는 새 값을 유지하고(저장 비활성) KB120 은 R 값으로 바뀌는지 확인한다.
  - `planStateWithReload` 단위 테스트를 추가했다.
  - 두 컴포넌트 테스트는 수정 전 코드에서 실패하는 것을 확인했다.

**참고(사람 확인 권장):** 상태 반영 순서를 판정하는 로직이다. 단위 테스트는 통과했지만 의미 검토를 권한다.

### R2-WR-02: GET `/launch-plan` 에 마감이 없음

**수정한 파일:** `relay/src/admin/launch-plan.ts`, `relay/src/admin/admin-api.ts`, `relay/tests/admin-launch-plan.test.ts`, `relay/tests/admin-api.test.ts`, `server/src/services/relay-admin-client.ts`(주석만)
**커밋:** 9e2ebeb6
**적용한 수정:**
- `LAUNCH_PLAN_READ_DEADLINE_MS = 5_000` 을 export 했다. server `RELAY_LAUNCH_PLAN_READ_TIMEOUT_MS`(6초)에서 응답 · 네트워크 여유 1초를 뺀 값이다.
- `LaunchPlanService.read(serverKeys, opts?: { deadlineAt })` 는 서버마다 `#within(#readOne(k), deadlineAt)` 으로 기다린다.
  - 마감을 넘긴 서버만 `{ status: "timeout" }` 으로 접는다. 다른 서버 결과는 그대로 싣는다.
  - 접은 서버 키를 info 1줄로 남긴다. op 9 는 취소하지 않는다. 조회라 바뀌는 것이 없고, FIFO 가 끝까지 처리한다.
- relay `GET /launch-plan` 라우트는 도착 시각 + `LAUNCH_PLAN_READ_DEADLINE_MS` 를 `deadlineAt` 으로 넘긴다.
- server 상한 주석에 relay 마감과의 관계를 적었다. 한쪽을 줄이면 다른 쪽도 줄여야 한다.
- 테스트:
  - R4: KB120 op 9 가 FIFO 에 묶이면 KB120 만 timeout 이고 KYOBO119 는 ok 그대로다. info 1줄이 남는다. 상수가 6초 미만인지 단언한다.
  - R4b: 마감 안에 온 답과 앞단 skipped 는 그대로다.
  - L4: 라우트가 `deadlineAt = now + 5000` 을 넘긴다.

### R2-WR-03: server 가 「확실히 안 보낸」 저장 실패까지 timeout 으로 영구 이력에 기록

**수정한 파일:** `server/src/services/admin-launch.ts`, `server/src/services/relay-admin-client.ts`, `server/tests/routes/admin-launch.test.ts`, `server/tests/services/relay-admin-client.test.ts`
**커밋:** d6307858
**적용한 수정:**
- `RelayAdminResponse` 에 선택 필드 `netCode` 를 더했다. `request()` 가 status 0 일 때 axios 오류 코드(없으면 `UNKNOWN`)를 싣는다. 다른 호출부는 이 필드를 보지 않으므로 동작이 같다.
- `isRelayErrorBody` 를 export 했다.
- `relayNotSent(r)` 이 참이면 `offline` + `RELAY_FAILED_MESSAGE` 로 접는다. 확정 미반영이고, 이력에도 offline 으로 남는다. 다음 경우가 해당한다.
  - status 0 이면서 오류 코드가 `ECONNREFUSED` · `ENOTFOUND` · `EAI_AGAIN`(연결 단계)
  - relay 400 · 401 · 404(핸들러 앞단의 zod · 이메일 헤더 · 공유 비밀 · 라우트 없음)
  - relay 503 `LAUNCH_PLAN_UNAVAILABLE`
- 그 밖은 1차 CR-01 의도대로 `timeout`(결과 모름)이다. 타임아웃(`ECONNABORTED` · `ETIMEDOUT`), `ECONNRESET`, `UNKNOWN`, 다른 5xx, 모양 위반이 여기에 든다.
  - 리뷰 스니펫보다 넓힌 것은 `EAI_AGAIN`(DNS 일시 실패 — 연결 전이 확실)뿐이다.
  - `EHOSTUNREACH` 는 연결된 소켓에서도 날 수 있다. 그래서 보수적으로 timeout 에 남겼다.
- 테스트:
  - P35-S8 offline 표 6행: ECONNREFUSED · ENOTFOUND · 401 · 400 · 404 · 503 LAUNCH_PLAN_UNAVAILABLE. 응답 offline, 기록 offline 1행을 확인한다.
  - timeout 표 3행 추가: ECONNABORTED · ECONNRESET · 503 다른 코드.
  - 클라이언트 테스트에 타임아웃 → `netCode: "ECONNABORTED"`, 연결 거부 → `"ECONNREFUSED"` 단언을 넣었다.

### R2-IN-01: webapp 요청 실패 분기가 4xx 까지 「응답 없음: 반영됐는지 몰라요」 로 보임

**수정한 파일:** `webapp/src/components/admin/launch-map-tab.tsx`, `webapp/src/lib/launch-plan-view.ts`, `webapp/src/components/admin/__tests__/launch-map-tab.test.tsx`, `webapp/src/lib/__tests__/launch-plan-view.test.ts`
**커밋:** 588f44cc
**적용한 수정:**
- `rejectedSaveResultOf(gateway, status, message)` 를 새로 만들었다. 결과는 `failed` 이고, 문구는 다음과 같다.
  - 401: 「로그인이 만료됐어요 — 다시 로그인한 뒤 저장하세요」
  - 403: 「권한이 없어요」
  - 그 밖: 「요청 거부(<status>) · <server 문구>」
  - 결과 줄은 「KB120 실패: …」 다. `code` 는 싣지 않는다. gh-trade code 1 「op 모름」 분기와 섞이지 않게 하기 위해서다.
- 지도 탭 `onSave` 실패 분기에서 `ApiClientError` 이고 400 ≤ status < 500 이면 위 결과만 보인다. 세대도 올리지 않고 다시 읽지도 않는다. server 라우트의 4xx(인증 · 인가 · 검증)는 모두 relay 호출과 이력 기록 전에 던지므로 확정 미반영이다.
- 타임아웃 · 네트워크(status 0) · 5xx · 일반 Error 는 그대로 「응답 없음」 + 다시 읽기다. e2e P35-P4 ③(502)의 기대도 그대로 맞다.
- 테스트:
  - 401 · 400 → 확정 실패 문구, `GET /plan` 1회
  - 502 · status 0 `ApiClientError` → 결과 모름 + 다시 읽기
  - `rejectedSaveResultOf` 단위 테스트(「몰라요」 미포함 단언)

## 검증

모든 검증은 **격리 worktree**(`.claude/worktrees/rf-35-40175-1793497177`, 브랜치 `gsd-reviewfix/35-40175`)에서 실행했다. 그 안에서 `pnpm install --offline --frozen-lockfile` 과 `@gh-radar/shared build` 를 돌렸다. 정리 단계에서 master 로 fast-forward 한 뒤 worktree 를 지운다. 그래서 이 수치는 master 체크아웃에서 같은 명령으로 다시 낼 수 있다.

- relay vitest(`--maxWorkers=2`): `tests/admin-launch-plan.test.ts` · `tests/admin-api.test.ts` — 2파일 103 통과
- server vitest: `tests/routes/admin-launch.test.ts` · `tests/services/relay-admin-client.test.ts` — 2파일 98 통과
- webapp vitest: `launch-map-tab` · `launch-plan-view` · `launch-plan-editor` — 3파일 78 통과
- tsc: relay `--noEmit` · `tsconfig.tests.json` 0, server `--noEmit` 0, webapp `--noEmit` · `tsconfig.e2e.json` 0
- 실행하지 않은 것: playwright(지시대로)와 패키지 전체 회귀(오케스트레이터 몫)

---

_수정: 2026-11-01T01:49:32Z_
_수정자: Claude (gsd-code-fixer)_
_회차: 1_
