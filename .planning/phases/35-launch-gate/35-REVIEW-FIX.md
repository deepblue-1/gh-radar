---
phase: 35-launch-gate
fixed_at: 2026-11-01T01:06:41Z
review_path: .planning/phases/35-launch-gate/35-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 35: 코드 리뷰 수정 보고

**수정 시각:** 2026-11-01T01:06:41Z
**원본 리뷰:** .planning/phases/35-launch-gate/35-REVIEW.md
**회차:** 1

**요약:**
- 범위 안 지적: 7 (CR 1 · WR 2 · IN 4, fix_scope = all)
- 수정: 7
- 건너뜀: 0

DB 마이그레이션과 배포가 필요한 수정은 없다. `launch_plan_changes.outcome` CHECK 는 이미 `timeout` 을 허용한다. relay · server · webapp 변경은 다음 배포 때 반영된다. 배포는 이 수정에서 하지 않았다.

## Fixed Issues

### CR-01: 적용됐을 수 있는 계획 저장을 「offline · 미반영」 으로 확정 보고하고 영구 이력에 그렇게 기록함

**수정한 파일:** `relay/src/admin/launch-plan.ts`, `relay/tests/admin-launch-plan.test.ts`, `server/src/services/admin-launch.ts`, `server/tests/routes/admin-launch.test.ts`, `webapp/src/components/admin/launch-map-tab.tsx`, `webapp/src/components/admin/__tests__/launch-map-tab.test.tsx`, `webapp/src/lib/launch-plan-view.ts`, `webapp/src/lib/__tests__/launch-plan-view.test.ts`, `webapp/e2e/specs/admin-launch.spec.ts`
**커밋:** f448079f
**적용한 수정:**
- **relay `set()`:** op 8 을 큐에 넣은 뒤 오는 결과는 모두 `timeout`(= 결과 모름)으로 보고한다. 86 timeout, `offline`(비행 중 끊김), 요청 마감 초과가 여기에 해당한다. `offline`(확정 미반영)은 op 8 을 넣기 전 판정만 쓴다. 앞단 판정과 「전 조회 사이에 끊김(`isReady` false)」 이 그 경우다.
- **relay 마감:** 리뷰가 지적한 큐 대기 누락을 막으려고 각 단계를 `deadlineAt` 으로 묶었다(`#within`).
  - 전 조회는 `deadlineAt − ADMIN_COMMAND_TIMEOUT_MS` 까지만 기다린다. 남은 시간이 그보다 짧으면 전 조회를 보내지 않는다.
  - 저장 86 은 `deadlineAt` 까지 기다린다. 넘으면 `timeout` 이고, 늦게 온 결과는 warn 으로 남긴다.
  - 후 조회도 마감까지만 기다린다.
  - 리뷰가 제안한 「남은 시간 < 2 × 5초면 전 조회를 건너뜀」 은 실제 시계에서는 거의 늘 참이 된다. 라우트 마감이 정확히 10초라 1ms 만 지나도 조건이 성립한다. 그래서 「저장 몫 5초를 남긴 시각까지 기다림」 으로 바꿨다.
- **server `saveLaunchPlanViaRelay`:** relay 로 요청을 보낸 뒤의 실패는 `timeout` 과 `RELAY_UNKNOWN_SAVE_MESSAGE` 로 보고한다(status 0 · 비200 · 모양 위반). 그래서 이력(D-29)에 offline 으로 남지 않는다. `offline` 은 relay 가 설정되지 않았을 때만 쓴다.
- **webapp:** 요청이 throw 하거나 응답이 timeout 이고 plan 이 null 이면 다음과 같이 한다.
  - 결과 줄은 「KB120 응답 없음: 반영됐는지 몰라요 — 다시 읽은 계획으로 확인」 이다. 「실패」 · 「미반영」 으로 단정하지 않는다.
  - `GET /plan` 을 1회 다시 읽는다(`planNeedsReload`).
- e2e P35-P4 ③(502)의 기대 문구를 바꾸고, 「GET /plan 1회 더」 단언을 추가했다.

**참고(사람 확인 권장):** 상태 판정 로직을 바꾼 수정이라 단위 테스트와 e2e 를 통과했어도 의미 검토를 권한다.
- **보수적 판정:** relay 에서 끊김 때문에 offline 이 된 경우, 아직 송신하지 않고 큐에 있던 항목인지 AdminConn 결과만으로는 가를 수 없다. 그래서 보수적으로 `timeout` 으로 접는다.
- **늦은 반영 가능성:** 마감 뒤에도 op 8 은 큐에서 계속 진행된다. 그래서 「응답 없음」 을 보인 뒤에 실제로 반영될 수 있다. 화면은 1회 다시 읽기만 한다.

### WR-01: 저장은 ok 인데 relay 가 재조회 값을 못 실으면 화면이 저장 전 계획을 계속 보임(D-27 「성공 뒤 다시 조회」 미이행)

**수정한 파일:** `webapp/src/components/admin/launch-map-tab.tsx`, `webapp/src/components/admin/__tests__/launch-map-tab.test.tsx`, `webapp/src/lib/launch-plan-view.ts`, `webapp/src/lib/__tests__/launch-plan-view.test.ts`, `webapp/src/lib/launch-api.ts`
**커밋:** 185f9252
**적용한 수정:** 응답이 ok 인데 `plan: null` 일 때의 처리다.
- `planStateWithSentEntry` 로 그 서버의 (fire, market) 칸을 보낸 값으로 먼저 맞춘다. code 0 이면 보낸 값이 그대로 들어간 것이다.
- 편집 칸도 보낸 값을 기준으로 다시 연다.
- `planNeedsReload` 에 `ok · plan null` 을 더해 `GET /plan` 을 1회 다시 읽는다(D-27 「성공 뒤 다시 조회」).

그래서 다시 읽기 응답이 오기 전에도 점선 · 계획 줄 · 「저장」 · 「되돌리기」 가 저장 전 값을 기준으로 남지 않는다. CR-01 과 같은 `onSave` 분기다.

### WR-02: 백필 계획의 논리 키에 `fire_base` 가 없어 DB PK(20261030200000 뒤)와 어긋남 — A KRX 재확인 회차 조각 · 머리가 섞이거나 버려짐

**수정한 파일:** `relay/src/tools/launch-backfill.ts`, `relay/tests/launch-backfill.test.ts`
**커밋:** 2d81a7be
**적용한 수정:**
- `pieceKey` · `headKey` 와 `groups` 정렬 키에 `fire_base` 를 넣었다. DB PK `20261030200000` 과 같은 키다.
- 「같은 날 A KRX 09:00:27 · 09:00:29 wire 0 → 두 조각 · 두 머리」 단언을 추가했다.
- CLI dry-run 스모크에서도 두 회차가 각각 묶음 하나로 나오는 것을 확인했다.

### IN-01: 잘못된 `?fire=` 값은 정본화(replace)하지 않음

**수정한 파일:** `webapp/src/components/admin/launch-client.tsx`, `webapp/src/components/admin/__tests__/launch-client.test.tsx`(신규)
**커밋:** 560a74da
**적용한 수정:**
- `badFire` 를 `tab` · `d` · `range` 와 같은 정본화 effect 에 넣었다. 잘못된 값이면 `fire` 키만 지우고 다른 키는 그대로 둔다.
- 쿼리 정본화 단위 테스트 3건을 담은 파일을 새로 만들었다. 기존에는 LaunchClient 단위 테스트가 없었다.

### IN-02: 16:00 머리 카드의 「N조각 · 결과」 가 뒤탐침을 실조각처럼 셈

**수정한 파일:** `webapp/src/lib/launch-format.ts`, `webapp/src/lib/__tests__/launch-format.test.ts`, `webapp/src/components/admin/launch-orders-tab.tsx`, `webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx`
**커밋:** e6f22665
**적용한 수정:**
- `count` · `counts` 를 `!isLaunchTailProbe` 실조각만으로 센다. 머리 `n_pieces` 와 같은 정의다.
- 뒤탐침 수는 모델 `probes` 에 싣는다. 카드 부제에 「· 탐침 n」(`data-slot="launch-card-probes"`)으로 따로 보인다.

### IN-03: 저장 중 입력한 값이 저장 응답 도착 시 덮어써짐

**수정한 파일:** `webapp/src/components/admin/launch-map-tab.tsx`, `webapp/src/components/admin/launch-plan-editor.tsx`, `webapp/src/components/admin/__tests__/launch-map-tab.test.tsx`
**커밋:** 2996e83b
**적용한 수정:**
- 응답 시점의 `e.draft` 가 저장 요청 때 초안과 같을 때만 편집 칸을 저장 값으로 다시 연다. 입력은 계속 막지 않는다.
- 편집 칸 주석을 고쳤다.
- 「저장 중 −320 으로 고침 → ok 응답 뒤에도 −320 유지」 테스트를 추가했다.

### IN-04: 백필 입력 검증이 느슨함 — profile · fire_exchange 미검증, `.json` 은 무조건 첨부 형식

**수정한 파일:** `relay/src/tools/launch-backfill.ts`, `relay/tests/launch-backfill.test.ts`, `scripts/launch-backfill.ts`
**커밋:** 1ef9a8fe
**적용한 수정:**
- ndjson 의 `profile` 이 {Q16, N, A}, `fire_exchange` 가 {KRX, NXT} 밖이면 거부한다.
- 주어진 `fire_base` 는 `isLaunchFireBaseOf` 로 조합을 검사한다. A KRX 재확인 회차 창은 그대로 허용한다.
- `.json` 배열의 원소가 `sent_rel_us` 를 가지면 ndjson 필드 객체로 읽는다. 첨부 원소와 섞여 있어도 원소마다 판정하고, 모르는 키는 수집한다.
- A NXT 머리 정의 차이는 머리 정의를 라이브에 맞추지 않고, 리뷰가 낸 두 번째 선택지를 따랐다.
  - 맞추면 head PK 의 profile 이 바뀐다. 기존 「A 두 다리 → 머리 따로」 계약도 깨진다.
  - 대신 `plan.aNxtHeads` 를 셈해 CLI dry-run 에 「주의: … 라이브 kind 18 은 NXT 쪽을 N 머리 1행에 합친다」 를 출력한다.

## 검증

모든 검증은 **메인 체크아웃**(`/Users/alex/repos/gh-radar`, master)에서 실행했다. `workflow.use_worktrees` 는 true 지만 격리 worktree 는 만들지 않았다. 대신 호출 지시대로 메인 트리에서 경로 지정 커밋을 했다. 이 지시는 동시 세션이 같은 트리를 쓰고 있다는 전제다. 각 커밋 직전에 `git status -sb` 를 확인했다. 다른 세션의 파일(relay generated · limitup · `.planning/quick/261101-0r3-*` · `docs/inbox/` · `.planning/milestone.lock` · `.planning/phases/36-*`)은 건드리지 않았고 스테이징하지도 않았다.

- relay vitest(`--maxWorkers=2`): `tests/admin-launch-plan.test.ts` · `tests/launch-backfill.test.ts` · `tests/admin-api.test.ts` · `tests/admin-conn.test.ts` — 4 파일 141 통과
- server vitest: `tests/routes/admin-launch.test.ts` — 61 통과
- webapp vitest: launch-map-tab · launch-client · launch-orders-tab · launch-plan-editor · launch-plan-bar · launch-gate-chart · launch-plan-view · launch-format · launch-map — 9 파일 207 통과
- playwright(`--workers=1`): `admin-launch.spec.ts` P35-P3 · P35-P4 — 통과(setup 포함 3 passed)
- tsc:
  - relay `tsc --noEmit` 0 · server `tsc --noEmit` 0 · webapp `tsconfig.e2e.json` 0
  - webapp `tsc --noEmit` 은 `src/lib/__tests__/limitup-lanes.test.ts`(`lockRiskCaptionOf`) 오류 1건만 남는다. 다른 세션의 진행 중 작업에서 온 오류이고, 이번 수정 파일에는 오류가 없다.
- 백필 CLI dry-run 스모크: 스크래치 ndjson 4행 → 거부 1(`nxt`) · A KRX 09:00:27 · 09:00:29 두 묶음 · 「주의: A NXT …」 출력(원격 접촉 없음)
- `scripts/launch-backfill.ts` 는 tsconfig 에 속하지 않는다. 그래서 단독 tsc 대신 tsx 실행 스모크로 확인했다.

---

_수정: 2026-11-01T01:06:41Z_
_수정자: Claude (gsd-code-fixer)_
_회차: 1_
