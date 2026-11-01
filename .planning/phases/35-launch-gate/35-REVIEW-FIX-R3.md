---
phase: 35-launch-gate
fixed_at: 2026-11-01T06:47:37Z
review_path: .planning/phases/35-launch-gate/35-REVIEW-R3.md
iteration: 1
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 35: 3차 코드 리뷰 수정 보고

**수정 시각:** 2026-11-01T06:47:37Z
**원본 리뷰:** .planning/phases/35-launch-gate/35-REVIEW-R3.md
**회차:** 1

**요약:**
- 범위 안 지적: 1 (WR 1, fix_scope = critical_warning)
- 수정: 1
- 건너뜀: 0
- 범위 밖(Info): 4 (R3-IN-01 ~ R3-IN-04 — 손대지 않음)

webapp 만 바뀌었다. DB 마이그레이션 · relay · server 변경은 없다. 이 수정에서는 배포 · push 를 하지 않았다(push 가 webapp 프로덕션 배포다).

## Fixed Issues

### R3-WR-01: 다시 읽기가 그 서버 값을 못 가져와도 저장 전 값이 「다시 읽은 계획」 처럼 남음

**수정한 파일:** `webapp/src/components/admin/launch-map-tab.tsx`, `webapp/src/components/admin/launch-plan-editor.tsx`, `webapp/src/lib/launch-plan-view.ts`, `webapp/src/components/admin/__tests__/launch-map-tab.test.tsx`, `webapp/src/lib/__tests__/launch-plan-view.test.ts`
**커밋:** 4b3f0b6a
**적용한 수정:**
- `launch-plan-view.ts` 에 다시 읽기 결과 타입 `LaunchPlanReread = 'pending' | 'ok' | 'superseded' | 'failed'` 와 순수 함수 `planRereadOf(resp, gateway, take)` 를 더했다.
  - `take` 에 대상 서버가 들면 `ok`(그 서버 값을 실제로 반영함)다.
  - 대상 서버가 ok 로 왔지만 `take` 밖이면 `superseded` 다. 다시 읽기를 보낸 뒤 그 서버에 더 새 세대가 생겨 버렸다는 뜻이다.
  - 그 밖(대상 서버 timeout · offline · failed · 응답에 없음)은 `failed` 다.
- `saveResultViewOf` 에 선택 인자 `reread` 를 더했다. timeout 줄 꼬리만 바뀐다(`TIMEOUT_REREAD_TAIL`).
  - `pending`: 「KB120 응답 없음: 반영됐는지 몰라요 — 계획을 다시 읽는 중이에요」
  - `ok` · 인자 없음: 「… — 다시 읽은 계획으로 확인」(기존 문구 그대로)
  - `failed`: 「… — 계획을 다시 읽지 못했어요(보이는 값은 저장 전 값일 수 있어요) · 잠시 뒤 새로고침」
  - `superseded`: 「… — 그 뒤 새 저장이 있어 다시 읽은 값을 쓰지 않았어요(보이는 값은 이 저장 결과가 아닐 수 있어요) · 잠시 뒤 새로고침」
  - ok · failed · offline · skipped 줄은 `reread` 와 상관없다. ok · plan null(`sentOnly`) 경로는 보낸 값으로 이미 맞춰 두므로 리뷰 판정대로 그대로 둔다.
- `launch-plan-editor.tsx` 의 `LaunchPlanSaveState` 에 `reread?` 필드를 더하고 `saveResultViewOf` 에 넘긴다.
- `launch-map-tab.tsx`
  - `reloadPlan(gateway, settle)` 이 대상 서버 결과를 `settle` 로 알린다. 404(absent)와 요청 throw 는 `failed` 다. throw 는 `console.warn` 으로 남긴다(무로그로 삼키지 않는다).
  - 다시 읽기를 부르는 두 경로(저장 응답 timeout · ok+plan null, 요청 throw)는 결과에 `reread: 'pending'` 을 먼저 싣는다.
  - `lastSave` 에 저장 1건 번호 `id`(`saveSeq`)를 더했다. `settle` 은 `l.id === id` 일 때만 결과를 붙인다.
  - 세대 가드(`planSeq` · `planSeen`)와 서버별 `take` · `planStateWithReload` 는 손대지 않았다. 계획 값이 바뀌는 경로는 그대로이고, 결과 줄 문구만 바뀐다.
- **리뷰 스니펫과 다르게 한 점(경합 순서를 따라가 확인함):** 스니펫은 `l.key === key` 로 결과를 붙였다. 그러면 다음 순서에서 틀린 줄이 나온다. 같은 칸 저장 1이 timeout → 다시 읽기 R1 비행 → 같은 칸 저장 2도 timeout → R2 비행 → R1 이 늦게 「못 읽음」 으로 끝남. 이때 R1 결과가 저장 2의 줄에 붙는다. R2 가 아직 읽는 중인데 「다시 읽지 못했어요」 가 되고, R1 이 ok 로 와도 KB120 은 세대가 밀려 `superseded` 가 붙는다. 그래서 키가 아니라 저장 1건 `id` 로 묶었다. 이 경우를 잠그는 테스트가 있고, `l.key === key` 로 바꾸면 그 테스트가 실패하는 것을 확인했다.
- `superseded` 는 지금 구조에서는 이 저장의 줄에 닿지 않는다. `planSeen` 을 올리는 것은 `onSave` 와 그 다시 읽기뿐이고, 새 저장은 시작할 때 `lastSave` 를 지우기 때문이다. 그래도 타입 · 문구는 둔다. 더 새 세대가 값 없이 「바뀌었을 수 있음」 만 표시한 저장(timeout · throw 의 `markPlan`)일 수 있어서 「확인」 으로 치지 않게 했다.
- **확인 필요:** 결과 줄 문구를 바꾼 수정이다. 실제 화면에서 문구 길이와 줄바꿈을 한 번 봐 주면 좋다.

**추가한 · 바꾼 테스트:**
- `launch-map-tab.test.tsx`
  - 저장(응답 timeout · 요청 throw) × 다시 읽기(그 서버 timeout · offline · failed · 404 absent · 요청 throw) 10건. 결과 줄이 「계획을 다시 읽지 못했어요(보이는 값은 저장 전 값일 수 있어요) · 잠시 뒤 새로고침」 이 되고, 계획 줄은 저장 전 값(−350 · −345 · −325)으로 남는지 본다.
  - 다시 읽기가 KB120 을 반영하면 줄이 「계획을 다시 읽는 중이에요」 에서 「다시 읽은 계획으로 확인」 으로 바뀌는지 본다(1건).
  - 같은 칸을 재저장한 뒤 앞 다시 읽기가 늦게 「못 읽음」 으로 끝나도 두 번째 저장의 줄이 바뀌지 않는지 본다(id 가드 1건).
  - 기존 「R2-WR-01 늦게 온 다시 읽기」 테스트는 비행 중 단언을 「계획을 다시 읽는 중이에요」 로 바꿨다.
- `launch-plan-view.test.ts`: `saveResultViewOf` timeout 꼬리 4종 · 인자 없음 · 다른 outcome 영향 없음 1건, `planRereadOf` 1건.
- 변이 확인: 지도 탭을 수정 전(HEAD) 코드로 되돌리면 새 테스트 12건과 바꾼 테스트 1건, 모두 13건이 실패한다.

## 범위 밖(Info) — 손대지 않음

### R3-IN-01: 요청 throw 경로의 다시 읽기가 server 가 아직 처리 중인 PUT 보다 먼저 relay 에 닿을 수 있음

**File:** `webapp/src/components/admin/launch-map-tab.tsx`
**Reason:** 범위 밖(Info). 이번 수정에서 throw 경로 다시 읽기가 ok 이면 줄은 여전히 「다시 읽은 계획으로 확인」 이다. 「다시 읽은 값도 저장 전일 수 있음」 안내나 늦춰 읽기는 넣지 않았다.

### R3-IN-02: 「relay 가 보내기 전에 거절」 offline 이 원인을 감추고 「잠시 뒤 다시 시도」 를 권함

**File:** `server/src/services/admin-launch.ts:258-264`
**Reason:** 범위 밖(Info).

### R3-IN-03: 테스트 공백 — `fresh` 우회 · throw 경로 세대 · 대상 서버 non-ok 다시 읽기

**File:** `webapp/src/lib/launch-api.ts:66-76` · `webapp/src/components/admin/__tests__/launch-map-tab.test.tsx`
**Reason:** 범위 밖(Info). 세 공백 가운데 「대상 서버 non-ok 다시 읽기」 는 R3-WR-01 테스트로 함께 잠겼다. `launch-api` `fresh` 단위 테스트와 「throw 가 비행 중 다시 읽기의 그 서버 값을 버림」 테스트는 남았다.

### R3-IN-04: relay VM 이 꺼진 경우(SYN 무응답 → `ECONNABORTED`)는 여전히 timeout 으로 이력에 쌓임

**File:** `server/src/services/admin-launch.ts:217` · `server/src/services/relay-admin-client.ts:337-352`
**Reason:** 범위 밖(Info).

## 검증

모든 검증은 **격리 worktree**(`.claude/worktrees/rf-35-31156-1793515273`, 브랜치 `gsd-reviewfix/35-31156`)에서 돌렸다. 설치는 새로 하지 않았다. 그 worktree 의 `node_modules` · `webapp/node_modules` 를 main 체크아웃의 같은 디렉터리로 가리키는 심볼릭 링크로 두었다. `@gh-radar/shared` 는 바뀌지 않아 main 의 `dist` 를 그대로 썼다. 정리 단계에서 링크는 `unlink` 로 지운다(링크만 지우고 대상은 건드리지 않는다). 그다음 master 로 fast-forward 하고 worktree 를 지운다. 그래서 아래 수치는 master 체크아웃에서 같은 명령으로 다시 낼 수 있다.

- `npx vitest run src/components/admin/__tests__/launch-map-tab.test.tsx src/lib/__tests__/launch-plan-view.test.ts --maxWorkers=2` → 2 파일 **75건 통과**(지도 탭 44 · 순수 31). 수정 전에는 61건이었고 14건이 늘었다. React `act(...)` 경고가 출력되지만 실패는 아니다.
- `npx tsc --noEmit -p .`(webapp) → 오류 0.
- `npx eslint`(바뀐 5파일) → 오류 0.
- 전체 스위트 · Playwright 는 지시대로 돌리지 않았다(동시 세션 메모리).

---

_Fixed: 2026-11-01T06:47:37Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
