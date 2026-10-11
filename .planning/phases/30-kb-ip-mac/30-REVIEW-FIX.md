---
phase: 30-kb-ip-mac
fixed_at: 2026-10-11T10:45:00Z
review_path: .planning/phases/30-kb-ip-mac/30-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 30: 코드 리뷰 수정 보고

**수정 시각:** 2026-10-11
**원본 리뷰:** .planning/phases/30-kb-ip-mac/30-REVIEW.md
**반복 차수:** 1

**요약:**
- 범위 안 지적: 4건 (경고 WR-01~WR-04 · 정보 IN-01~IN-06 은 범위 밖)
- 수정: 4건
- 건너뜀: 0건

**검증 위치:** 모든 게이트는 `/Users/alex/repos/gh-radar/.claude/worktrees/phase-30`(branch `master`, 하네스가 관리하는 phase-30 worktree, node_modules 있음)에서 돌렸다. 이 fixer 는 worktree 를 따로 만들지 않았고, 커밋은 이 worktree 의 `master` 에 바로 쌓았다(push 하지 않음). 이 tree 에서 그대로 재현할 수 있다.

## Fixed Issues

### WR-01: `GET /api/admin/users` now blocks on the relay for up to `RELAY_ADMIN_TIMEOUT_MS` (15 s)

**수정 파일:** `server/src/services/relay-admin-client.ts`, `server/tests/services/relay-admin-client.test.ts`
**커밋:** 8ac4564e
**적용한 수정:** `RelayAdminRequest` / `request()` 에 호출별 옵션 `{ timeoutMs }` 를 추가했다. 이 값은 인스턴스 기본값(`RELAY_ADMIN_TIMEOUT_MS`)보다 짧게만 걸리고, 실제 상한은 `Math.min` 이다. `orderEndpoints` 는 `RELAY_ORDER_ENDPOINTS_TIMEOUT_MS = 2_000` 으로 끊는다. 쓰기 명령은 지금처럼 15초 기본값을 쓴다. 테스트 2건을 추가했다. 기본값이 15초여도 2초에서 status 0 으로 끝나는지, 그리고 기본값이 더 짧으면(100ms) 그 값이 이기는지 확인한다.
**검증:** `server: npx tsc --noEmit` 은 exit 0 이다. `npx vitest run tests/services/relay-admin-client.test.ts tests/routes/admin.test.ts --maxWorkers=2` 결과는 60/60 통과다.

### WR-02: The shape check in `fetchOrderEndpoints` is shallow, so a malformed row turns the overview into a 500

**수정 파일:** `server/src/routes/admin.ts`, `server/tests/routes/admin.test.ts`
**커밋:** a117165d
**적용한 수정:** `sanitizeOrderEndpoints` 와 `isOrderEndpointRow` 를 추가했다. 행 목록이 배열이 아닌 서버는 통째로 빼서 그 서버를 「확인 전」 으로 둔다. 네 필드(`dmaUserId`, `accountNo`, `orderIp`, `orderMac`) 중 하나라도 문자열이 아닌 행은 버려서 그 계좌를 「확인 전」 으로 둔다. 버린 경우 로그에는 `{ op, status: 200, droppedServers, droppedRows }` 개수만 남기고 값은 남기지 않는다. E5 테스트를 추가했다. `null`, `{}`, `accountNo` 없는 행, `orderIp` 가 숫자인 행, `KB121: null`, `KYOBO119: {}` 를 섞어 보내도 200 이고, 정상 행만 반영되며, 경고 로그에 IP/MAC 이 없는지 확인한다.
**검증:** `server: npx tsc --noEmit` 은 exit 0 이다. `npx vitest run tests/routes/admin.test.ts --maxWorkers=2` 결과는 33/33 통과다(E5 단독 실행으로 실제로 도는 것도 확인했다).

### WR-03: A server toggle during an in-flight edit save persists the not-yet-confirmed draft name

**수정 파일:** `webapp/src/components/admin/account-editor.tsx`, `webapp/src/components/admin/__tests__/account-editor.test.tsx`
**커밋:** 8c7fd210
**적용한 수정:** 리뷰가 제시한 두 방법을 모두 적용했다.
- 상태로 게이트: 토글 PUT 의 이름은 `editSave.state !== "saving" && editSave.value` 일 때만 새 이름이고, 그 밖에는 개요 이름이다. 저장 시작 전에 대기열에 들어간 토글이 저장 중에 나가는 경우도 막는다.
- UI 잠금: 저장 중에는 그 카드의 서버 체크박스, 「제거」, 주문 서버 세그먼트(ToggleGroup `disabled` + `onValueChange` 가드)를 비활성으로 하고, `setServer` 에도 가드를 넣었다. 다른 카드는 잠그지 않는다.

모듈 머리 주석도 실제 동작에 맞게 고쳤다. 테스트 2건을 추가했다. 저장 중 세 컨트롤이 비활성이고 눌러도 요청이 없는지, 저장이 HTTP 409 로 실패한 뒤 토글 PUT 이 개요 이름 「위탁」 을 싣는지 확인한다.
**검증:** `webapp: npx tsc --noEmit -p .` 은 exit 0 이다. `npx vitest run src/components/admin/__tests__/account-editor.test.tsx --maxWorkers=2` 결과는 81/81 통과다.
**상태:** fixed: requires human verification. UI 상태를 다루는 로직이라 사람이 확인해야 한다. 잠긴 컨트롤은 기존 `disabled:opacity-100` 스타일 때문에 겉모양이 그대로이고 커서만 바뀐다. 입력칸이 readOnly 인데 「글자 그대로」 인 기존 규칙과 같다.

### WR-04: Failures from an edit save disappear from `BusyLines` for good, even after the edit card closes

**수정 파일:** `webapp/src/components/admin/account-editor.tsx`, `webapp/src/components/admin/__tests__/account-editor.test.tsx`
**커밋:** 2f1572af
**적용한 수정:** 리뷰의 방법 1을 확장했다. 카드 결과 줄이 지워질 때마다(`clearEditResult`: 「취소」 · 다시 「편집」 · 입력 변경) 부모의 `onEditResultsCleared(key)` 가 그 계좌 덮개 칩에서 `source: "edit"` 표시를 뗀다(`releaseEditChips`). 뗄 것이 없으면 `prev` 를 그대로 돌려줘 입력할 때마다 다시 렌더되지 않는다. 이렇게 하면 BusyLines 에서 빠지는 것은 「카드 결과 줄이 지금 그 문구를 보여 줄 때」 뿐이다. 방법 2(`editingKey === k`)를 쓰지 않은 이유가 있다. 그 방법으로는 다시 「편집」 을 열거나 입력을 고쳐 카드 결과 줄이 지워진 동안에는 문구가 여전히 사라진다. 테스트 2건을 추가했다. 「취소」 뒤 BusyLines 에 `KB121 실패 · BUSY: <원문> — 정리 뒤 「다시 반영」` 이 나오고 다시 「편집」 해도 남는지, 입력을 고쳐 결과 줄이 지워져도 BusyLines 가 이어 보여 주는지 확인한다. 기존 「결과 줄이 있는 동안 BusyLines 중복 없음」 테스트도 그대로 통과한다.
**검증:** `webapp: npx tsc --noEmit -p .` 은 exit 0 이다. `npx vitest run src/components/admin/__tests__/account-editor.test.tsx src/components/admin/__tests__/user-sheet.test.tsx --maxWorkers=2` 결과는 101/101 통과다. `npx eslint` 를 두 파일에 돌려 exit 0 이다.
**상태:** fixed: requires human verification. UI 표시 규칙을 바꿨다.

## 참고

- shared · relay 패키지는 건드리지 않았다. StockDMA.fbs 와 relay 프로토콜 계약도 바뀌지 않았다. relay 응답 모양은 그대로이고 server 쪽에서 방어만 한다.
- 전체 테스트와 Playwright 는 돌리지 않았다. 동시 세션 메모리 제약 때문에 대상 파일만 돌렸다.

---

_Fixed: 2026-10-11_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
