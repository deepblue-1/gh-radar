---
phase: 30-kb-ip-mac
fixed_at: 2026-10-11T23:56:44Z
review_path: .planning/phases/30-kb-ip-mac/30-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 30: 코드 리뷰 수정 보고 — 2라운드(정보 IN-01~IN-06)

**수정 시각:** 2026-10-12 (KST)
**원본 리뷰:** .planning/phases/30-kb-ip-mac/30-REVIEW.md
**반복 차수:** 1 (정보 6건 라운드 · 경고 WR-01~04 는 30-REVIEW-FIX.md 에서 이미 fixed — 이번에 건드리지 않음)

**요약:**
- 범위 안 지적: 6건 (IN-01 ~ IN-06)
- 수정: 6건 — 동작 수정 3건(IN-01 · IN-02 · IN-04), 의도된 동작의 문서화 3건(IN-03 · IN-05 · IN-06)
- 건너뜀: 0건

**검증 위치:** 모든 게이트는 `/Users/alex/repos/gh-radar/.claude/worktrees/phase-30`(branch `master`, 하네스가 관리하는 phase-30 worktree, node_modules 있음)에서 돌렸다. fixer 는 worktree 를 따로 만들지 않았다. 커밋은 이 worktree 의 `master` 에 바로 쌓았고 push 는 하지 않았다. 이 tree 에서 그대로 재현할 수 있다. 커밋마다 `git status -sb` 로 `master` 인지 확인했다.

## Fixed Issues

### IN-01: The save button can be disabled with no visible reason when the initial 87 value fails web validation

**수정 파일:** `webapp/src/components/admin/account-editor.tsx`, `webapp/src/components/admin/__tests__/account-editor.test.tsx`, `.planning/phases/30-kb-ip-mac/30-UI-SPEC.md`
**커밋:** 35615a13 (코드 · 테스트), d45684ca (UI-SPEC §3 문장 동기화)
**적용한 수정:** 리뷰의 두 방법을 하나의 규칙으로 묶었다. 검증 오류는 IP/MAC 을 실을 수 있는 저장, 즉 `endpointEdited || mismatched` 일 때만 「저장」 을 막는다. 이 조건은 `editSaveBodyOf` 의 sendEndpoint 를 포함하는 상위 집합이다. 「저장」 을 막는 조건과 오류 줄 · 빨간 테두리를 보이는 조건은 같은 값(`shownInvalid`)에서 나온다. 그래서 이유 없이 「저장」 만 꺼지는 경우가 없다.
- 계좌명만 바꾼 저장은 IP/MAC 을 싣지 않는다. 그래서 87 초깃값이 규칙 밖이어도(한쪽만 설정 · 레거시 값) 막지 않는다.
- D-10 불일치 카드는 그대로 저장해도 출처 값이 실린다. 출처 값이 규칙 밖이면 편집을 열자마자 오류 줄을 보인다. 예전에는 이 경우 이유 없이 비활성이었다.
- 칸을 고치지 않은 일반 카드가 열자마자 빨갛게 시작하지 않는 규칙(E4 empty)은 그대로다.

회귀 테스트 3건을 추가했다.
- IP 만 설정된 계좌 → 오류 줄 없이 열리고, 계좌명만 바꾸면 「저장」 이 켜지며 orderEndpoint 를 싣지 않는다.
- 같은 계좌에서 IP 칸을 고치면 짝 오류 줄과 비활성이 돌아온다.
- 불일치 카드의 출처 값이 반쪽이면 열자마자 오류 줄이 보이고 「저장」 이 비활성이다.

수정을 빼고 돌리면 이 중 2건이 실패한다(red 확인). UI-SPEC §3 의 「오류 줄 · 「저장」 비활성」 두 문장도 코드 동작에 맞게 고쳤다.
**검증:** `webapp: npx tsc --noEmit -p .` exit 0. `npx vitest run src/components/admin/__tests__/account-editor.test.tsx --maxWorkers=2` 86/86 통과. 두 파일에 `npx eslint` exit 0.
**상태:** fixed: requires human verification. UI 게이트 로직이다.

### IN-02: The shared-holder note approximates gh-trade's propagation set

**수정 파일:** `packages/shared/src/admin.ts`, `packages/shared/src/__tests__/admin.test.ts`, `.planning/phases/30-kb-ip-mac/30-UI-SPEC.md`
**커밋:** 45ff278e
**적용한 수정:** `findSharedAccountHolders` 가 상대 계좌의 서버 집합을 의도(active ∪ serverOnlyOn)가 아니라 **87 반영 상태**로 판정한다. 판정은 새 내부 함수 `presentOn87` 이 한다. gh-trade 는 users.toml 에 지금 있는 계좌에만 전파하기 때문이다. 포함하는 서버는 다음과 같다.
- `serverOnlyOn` 서버.
- active 이고 반영된 서버(칩 ok).
- active 이고 relay 87 캐시에 값이 있는 서버(`orderEndpoints[서버]` non-null). 이름 같은 다른 필드가 아직 반영되지 않아 칩이 ok 가 아니어도 계좌는 87 에 있다.
- removing 인데 아직 지워지지 않은 서버(칩이 ok 가 아님 = toRemove 대기. 87 을 모르면 있다고 본다).

제외하는 서버는 active 미반영 서버(87 에 아직 없음)와 이미 지워진 removing 서버(칩 ok)다. 남는 근사는 함수 주석에 적었다. active 미반영 칩이 「87 에 있지만 다른 필드가 다름」 이고 relay 87 조회도 실패했으면 그 서버는 빠진다. 개요 데이터로는 이 경우와 「87 에 없음」 을 가를 수 없다.

AdminAccountView 타입은 바꾸지 않았다. 새 필드를 넣으면 개요 계약과 여러 패키지의 `toEqual` 픽스처가 흔들린다. 그래서 기존 칩 · `orderEndpoints` 신호만 썼다.

기존 테스트 「KB120 이 removing 뿐 → 제외」 는 의도한 동작 변경에 맞춰 「removing 미삭제 → 포함 · removing 삭제됨 → 제외」 로 바꿨다. 새 테스트 2건을 더했다. 하나는 active warn/err 칩이 relay 값 없음 · null 이면 제외되고, 값이 있으면 포함되는지 본다. 다른 하나는 `deriveAdminUsersOverview` 를 거치는 통합 테스트다. B 의 계좌가 의도에만 있고 87 에 아직 없으면(missing) 제외되고, 87 에 들어오면 포함된다. UI-SPEC Addendum A2 의 「언제」 문장도 같은 판정으로 고쳤다.
**검증:** `shared: npx tsc --noEmit` exit 0. `npx vitest run --maxWorkers=2` 545/545 통과. 이어서 `pnpm --filter @gh-radar/shared build` 를 했다. 그 뒤 webapp `tsc --noEmit -p .` · server `tsc --noEmit` · relay `tsc --noEmit` 가 모두 exit 0 이다. webapp `account-editor` · `user-sheet` vitest 는 104/104 통과다(D-18 안내 테스트 포함).
**상태:** fixed: requires human verification. 판정 규칙을 바꿨다.

### IN-03: R3-02 copies the first other user that has IP/MAC set and ignores other users that are explicitly unset

**수정 파일:** `relay/src/admin/planner.ts`
**커밋:** 7a8b0531
**적용한 수정:** 동작은 바꾸지 않고, `otherByNo` 블록 주석에 의도된 tie-break 를 적었다.
- 고르는 규칙: 미설정인 다른 유저는 건너뛰고, 87 파일 순으로 IP 나 MAC 이 있는 첫 유저의 값을 쓴다.
- 정상 서버에서는 결과가 갈리지 않는다. gh-trade 의 code 7 · D-18 전파가 같은 계좌의 값을 한 값으로 묶기 때문이다. 갈리는 것은 레거시 불일치 서버뿐이다.
- 설정값을 고르는 이유: 빈 값을 실으면 사용자 PC 식별을 잃는다.
- 그 뒤 결과(code 7 거부든 D-18 전파든)는 gh-trade 판정에 맡긴다.
- 다른 유저끼리 값이 갈려도 경고 로그를 남기지 않는다. 값이 PC 식별 정보라 로그에 싣지 않는다.
- 운영자가 고치는 방법: 카드에서 IP/MAC 을 명시 저장한다. override 쌍이 이 값보다 이긴다.
**검증:** `relay: npx tsc --noEmit` exit 0. 주석만 바꿨다. `tests/admin-planner.test.ts` 는 아래 relay 묶음 실행에서 통과했다.

### IN-04: The overview ships KYOBO accounts' 87 IP/MAC to the browser

**수정 파일:** `relay/src/admin/admin-api.ts`, `relay/tests/admin-api.test.ts`
**커밋:** 1e11f1a5
**적용한 수정:** relay `GET /order-endpoints` 가 KB 서버만 싣는다(`row.broker !== "KB"` 면 건너뜀). 교보 서버의 87 값은 relay 밖으로 나가지 않는다. 그래서 개요에서 교보 계좌의 `orderEndpoints` 는 전부 null 이 된다. 이 값은 교보 카드가 그리지 않는다(D-03).
- 리뷰가 제시한 대안(shared `orderEndpointsOf` 가 교보에 `{}` 반환)은 쓰지 않았다. 이 방식은 데이터를 출처에서 막지 못한다. 또 `admin-overview.test.ts` 의 교보 `{ KYOBO119: null }` 계약도 바꿔야 한다.
- 테스트 하네스에 `kyoboAdmin` 옵션을 더했다. KYOBO119 에도 대역 admin 연결과 87 을 세운다. KB 연결 구성은 바뀌지 않는다.
- 회귀 테스트를 추가했다. 교보 87 에 IP/MAC 이 있어도 응답 키는 `["KB120","KB121"]` 뿐이고 본문에 IP 원문이 없다. 수정을 빼면 실패한다(red 확인).
- 머리 잠금 목록 E2 에 교보를 적었다.
**검증:** `relay: npx tsc --noEmit` 와 `npx tsc -p tsconfig.tests.json` 모두 exit 0. `npx vitest run tests/admin-api.test.ts tests/admin-planner.test.ts tests/admin-dispatcher.test.ts --maxWorkers=2` 136/136 통과.

### IN-05: The R3-01 re-read uses the request deadline before any op is sent

**수정 파일:** `relay/src/admin/dispatcher.ts`
**커밋:** aae48b1e
**적용한 수정:** 동작은 바꾸지 않았다. 모듈 머리의 요청 마감 절에 「마감 예산(30 IN-05)」 을 추가해 다음을 적었다.
- op 1(계좌) · op 3 이 있는 서버는 R3-01 op 5 재조회 왕복(최대 5초)이 마감 10초를 먼저 쓴다.
- 그래서 느린 87 에서는 「응답 없음」 뒤에 실제로는 반영되는 경우가 R3-01 전보다 잦다.
- 결과는 옳다. 실제 결과가 다시 기록되고, 재시도는 `sameValues` 덕분에 멱등이다.
- 마감을 늘리지 않는 이유: Express 15초 안에 응답해야 하기 때문이다.

`#applyServer` 의 재조회 블록에도 이 절을 가리키는 한 줄을 달았다.
**검증:** `relay: npx tsc --noEmit` exit 0. 주석만 바꿨다. `admin-dispatcher.test.ts` 는 위 묶음 실행에서 통과했다.

### IN-06: When the state is "확인 전" (unknown), there is no way to express "clear to 미설정"

**수정 파일:** `webapp/src/components/admin/account-editor.tsx`, `webapp/src/components/admin/__tests__/account-editor.test.tsx`, `.planning/phases/30-kb-ip-mac/30-UI-SPEC.md`
**커밋:** d17ec13d
**적용한 수정:** 동작은 바꾸지 않았다. 이 동작은 의도된 fail-safe 다. 다음 내용을 `editSaveBodyOf` 문서 주석과 UI-SPEC §3 「보내는 값」 아래 한 줄에 적었다.
- 「확인 전」 에서 연 편집은 초깃값이 빈 칸이다. 그래서 두 칸을 비운 채 저장하면 「변경 없음」 이 되고, 미설정으로 되돌리기를 보낼 수 없다.
- 이유: 실제로는 값이 있을지 모르는 87 을 빈 값으로 덮지 않기 위해서다(「relay 밖 값을 지우지 않는다」 와 같은 쪽).
- 값을 적어 저장하는 것은 된다. 비우기는 87 이 확인된 뒤 다시 「편집」 해서 한다.

이 fail-safe 를 고정하는 테스트 1건을 더했다. 「확인 전」 계좌에서 계좌명만 바꿔 저장하면 orderEndpoint 를 싣지 않는다.
**검증:** `webapp: npx tsc --noEmit -p .` exit 0. `npx vitest run src/components/admin/__tests__/account-editor.test.tsx src/components/admin/__tests__/user-sheet.test.tsx --maxWorkers=2` 105/105 통과. `npx eslint` exit 0.

## 배포 영향

- **relay — 재배포 필요.** IN-04 는 `GET /internal/admin/order-endpoints` 가 교보 서버를 빼는 동작 변경이다. IN-03 · IN-05 는 주석만이라 그것만으로는 배포가 필요 없다. 응답 모양(`AdminOrderEndpointsRaw`)은 그대로라 server 와 버전이 어긋나도 안전하다. 옛 relay 에서는 교보 값이 여전히 개요로 나가고, 화면은 그 값을 그리지 않는다.
- **server — 재배포 불필요.** shared 의 바뀐 함수(`findSharedAccountHolders`)를 server 는 부르지 않는다. 그래서 `deriveAdminUsersOverview` 출력이 같다. server 코드도 바뀌지 않았다. 다음 정기 배포에 따라가도 된다.
- **webapp(shared 포함) — 재배포 필요.** IN-01(저장 게이트 · 오류 줄)과 IN-02(shared `findSharedAccountHolders` — webapp 이 번들)가 화면 동작을 바꾼다. IN-06 은 주석 · 테스트뿐이다. webapp 은 push 가 곧 Vercel 프로덕션 배포다.
- StockDMA.fbs · relay↔server 프로토콜 · DB 는 바뀌지 않았다. 순서 제약도 없다. 메모리 규칙대로 relay 를 먼저 배포하고 push 를 나중에 하면 된다.

## 참고

- 정본 파일(`30-REVIEW.md` · `30-REVIEW-FIX.md` · `30-VERIFICATION.md` · `30-REVIEW-DISPOSITION.md`)은 수정하지 않았다. `30-UI-SPEC.md` 는 IN-01 · IN-02 · IN-06 에 맞춰 문장을 고치거나 더했다.
- 전체 테스트와 Playwright 는 돌리지 않았다. 동시 세션 메모리 제약 때문에 대상 파일만 `--maxWorkers=2` 로 돌렸다. shared 는 패키지 전체(545)를 돌렸고, server 는 `tests/routes/admin.test.ts` · `tests/services/relay-admin-client.test.ts` 61/61 통과다.
- push · 배포는 하지 않았다. `master` 는 origin 보다 커밋 7개 앞서 있다(이 라운드 7개).

---

_Fixed: 2026-10-12_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
