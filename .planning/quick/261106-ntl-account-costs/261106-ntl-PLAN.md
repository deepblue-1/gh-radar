---
phase: quick-261106-ntl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 — 서버 팬아웃 계약 + 사이드바 순서
  - packages/shared/src/admin.ts
  - server/src/schemas/admin.ts
  - server/src/routes/admin-accounts.ts
  - server/tests/routes/admin-accounts.test.ts
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
  # Task 2 — 사용자 카드 읽기 전용 · 편집 모드 제거 · 비용 칸 컴포넌트 일반화
  - webapp/src/components/admin/account-editor.tsx
  - webapp/src/components/admin/user-sheet.tsx
  - webapp/src/components/admin/users-client.tsx
  - webapp/src/components/admin/__tests__/account-editor.test.tsx
  - webapp/src/components/admin/__tests__/users-client.test.tsx
  # Task 3 — 계좌 수정 시트 「예수금 · 수수료」 · 주문자 IP/MAC
  - webapp/src/lib/admin-api.ts
  - webapp/src/components/admin/account-linked-summary.ts
  - webapp/src/components/admin/__tests__/account-linked-summary.test.ts
  - webapp/src/components/admin/account-master-sheet.tsx
  - webapp/src/components/admin/__tests__/account-master-sheet.test.tsx
  - webapp/src/components/admin/accounts-client.tsx
  - webapp/src/components/admin/__tests__/accounts-client.test.tsx
autonomous: false
requirements: ["261106-ntl"]

estimate:
  tokens: 200000
  raw_tokens: 200000
  tasks: 4
  confidence: low

must_haves:
  truths:
    - "N-01: 계좌 수정 시트의 「예수금 · 수수료」 그룹에서 예수금 · 수수료 · 매도세 칸마다 Enter · 포커스 이탈로 즉시 저장되고(저장 버튼 없음), 저장은 그 계좌를 쓰는 DMA 사용자 중 active 등록 서버가 있는 모두에게 기존 relay per-user op 6(budget) / op 7(fee, 두 값 함께) 경로로 팬아웃되며, 결과 칩 · 실패/미반영 줄이 「<DMA id> · <서버>」 단위로 보인다"
    - "N-01: 표시값은 사용자마다 shared summarizeAccountCosts 를 적용한 뒤 값을 아는 첫 사용자(DMA id 오름차순)의 출처 값이고, 값이 다른 사용자·서버마다 「<DMA id> · <서버> 은/는 <값> — 저장하면 모두 같아져요」 한 줄, 87 을 모르는 자리는 「<DMA id> · <서버> · 확인 전」 칩이다. 연결된 사용자가 없는(active 자리 0) 계좌는 세 칸이 비활성이고 「사용자에게 연결된 뒤 설정할 수 있어요 — 값은 연결된 사용자의 서버에 저장돼요」 가 보이며 요청이 나가지 않는다"
    - "N-02: KB 계좌 수정 시트에 「주문자 IP」 · 「MAC 주소」 두 칸 + ipmacHelp 도움말이 있고(교보는 칸 없음), 검증은 shared validateOrderEndpointInput 한 벌이다. 기존 「저장」 이 계좌명 · 지점 · 트레이더와 함께 보내며, IP/MAC 은 정규화 비교로 바뀌었거나 사용자·서버 간 불일치일 때만 orderEndpoint(입력 원문 trim)로 실린다 — 계좌명만 바뀐 저장 · 확인 전 빈 칸 저장에는 실리지 않는다. 서버는 그 값을 연결된 사용자마다 relay 계좌 PUT 에 그대로 싣는다. 연결 0명이면 칸 비활성 + N-01 과 같은 안내"
    - "N-03: 사용자 시트 계좌 카드에는 예수금 · 수수료 · 매도세 입력칸이 없고 읽기 한 줄 「예수금 <값>원 · 수수료 <값>% · 매도세 <값>% · 설정은 「계좌」 메뉴에서」(0 원 = 미설정 · 모르면 확인 전)이 보이며, IP/MAC 읽기 줄 끝에도 「 · 설정은 「계좌」 메뉴에서」 가 붙는다. 카드에 「편집」 버튼 · 편집 모드가 없다. 등록 서버 토글 · 주문 서버 · 「연결 해제」 · 「+ 계좌 연결」 동작은 그대로다"
    - "N-04: 사이드바 Admin 하위 순서가 매매손익 · 계좌 · 사용자 · 서버 · 발사이고 「Admin」 제목 링크는 /admin/pnl 이다. My page 가 Admin 위인 것은 그대로다"
    - "relay · DB(마이그레이션) 변경이 없다 — Express 는 새 경로 2개(PUT /api/admin/accounts/:broker/:accountNo/budget · /fee)와 기존 계좌 저장 경로의 선택 필드 orderEndpoint 만 더한다"
  artifacts:
    - path: server/src/routes/admin-accounts.ts
      provides: "PUT /accounts/:broker/:accountNo/budget · /fee 팬아웃(admin_accounts_raw 로 active 링크 → relay setAccountBudget/setAccountFee) · PUT /accounts/:broker/:accountNo 의 orderEndpoint 팬아웃"
    - path: webapp/src/components/admin/account-linked-summary.ts
      provides: "순수 함수 — fanoutSlotLabel · linkedAccountOf · summarizeLinkedCosts · summarizeLinkedOrderEndpoint · orderEndpointToSend · flattenFanout"
    - path: webapp/src/components/admin/account-master-sheet.tsx
      provides: "수정 시트 ③ — KB 주문자 IP/MAC 칸 · 「예수금 · 수수료」 그룹(AccountCostFields) · 사용자·서버 불일치 줄 · 연결 0명 잠금"
    - path: webapp/src/components/admin/account-editor.tsx
      provides: "export AccountCostFields(칸 · 칩 · 줄 상태기계 — 라벨 · 저장 함수 주입) · 카드 읽기 줄 AccountCostLine · 편집 모드 제거"
  key_links:
    - from: webapp/src/components/admin/accounts-client.tsx
      to: "GET /api/admin/users (fetchAdminUsers)"
      via: "load() 가 fetchAdminAccounts 와 병렬로 읽고 실패는 null 로 접어 수정 시트 overview prop 으로 내려 보냄"
    - from: webapp/src/components/admin/account-master-sheet.tsx
      to: "PUT /api/admin/accounts/:broker/:accountNo/budget · /fee"
      via: "AccountCostFields saveBudget/saveFee = setAdminAccountBudget/Fee(...).then(flattenFanout) — 결과 server 를 「<DMA id> · <서버>」 로 바꾼 AdminCommandResponse"
    - from: server/src/routes/admin-accounts.ts
      to: "relay setAccountBudget / setAccountFee / putAccount"
      via: "연결 사용자마다 1회 · 거부/실패/클라이언트 없음은 그 항목 error 로 접고 200 { ok, fanout } (기존 D-08 규칙)"
---

<objective>
계좌 메뉴(계좌 수정 시트)에서 예수금 · 수수료 · 매도세(N-01)와 KB 주문자 IP/MAC(N-02)을 설정하고 그 계좌를 쓰는 DMA 사용자 모두에게 팬아웃한다. 사용자 시트 카드는 그 값들을 읽기 전용으로만 보이고 카드 「편집」 · 편집 모드를 없앤다(N-03). 사이드바 Admin 하위 순서를 매매손익 · 계좌 · 사용자 · 서버 · 발사로 바꾼다(N-04). CONTEXT N-01 ~ N-04 는 잠긴 결정이며 261106-lwu D-04 를 대체한다.

Purpose: 같은 계좌를 여러 DMA 사용자가 쓸 때 사용자마다 따로 치던 계좌 단위 설정을 계좌 한 곳에서 한 번에 맞춘다.
Output: Express 팬아웃 경로 2개 + 저장 경로 orderEndpoint · 순수 집계 모듈 1 · 계좌 시트 확장 · 사용자 카드 단순화 · 사이드바 순서 · 테스트. 배포는 메인 세션(Task 4).

분해 메모: 오케스트레이터 제안 순서(서버 → 계좌 시트 → 사용자 카드)에서 2 · 3 을 바꿨다 — 비용 칸 상태기계(지금 `AccountRow` 안의 비용 행)를 「라벨 · 저장 함수 주입」 컴포넌트로 일반화하는 일과 카드에서 그 행을 빼는 일이 같은 파일 같은 자리라, 카드 쪽(Task 2)에서 한 번에 하고 계좌 시트(Task 3)는 그 컴포넌트를 꽂기만 한다(account-editor.tsx 를 두 번 뒤집지 않는다). 사이드바는 독립 · 소형이라 맥락이 가벼운 Task 1 에 붙였다. Task 2 커밋과 Task 3 커밋 사이에는 비용 · IP/MAC 을 설정할 화면이 잠시 없지만 배포는 Task 4 에서 한 번이라 사용자에게 드러나지 않는다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/261106-ntl-account-costs/261106-ntl-CONTEXT.md
@.planning/quick/261106-lwu-admin-accounts/261106-lwu-SUMMARY.md
@.planning/quick/261106-lwu-admin-accounts/reference/mockup-admin-accounts.html

## 확정 사실 (플래너 조사 — 다시 조사하지 말 것. 261106-lwu PLAN 의 「확정 사실」 도 여전히 유효)
- **데이터 출처 결정(오케스트레이터 지시 「서버 조각 적게 · relay 무변경」):** 표시값은 Express 를 바꾸지 않고 webapp 이 이미 있는 `GET /api/admin/users`(`fetchAdminUsers` → `AdminUsersOverview` — `users[].accounts[]` 의 `costs` · `orderEndpoints` · `servers` · `orderServer` · `defaultOrderServer` + 레지스트리 `servers`)를 계좌 화면에서도 병렬로 읽어 클라이언트에서 사용자별로 집계한다. `users-client.tsx` load() 가 `fetchAdminAccounts` 를 병렬로 읽고 실패를 null 로 접는 꼴(L77~82)을 거울처럼 쓴다. 개요의 사용자는 이메일 단위라 같은 DMA id 가 여러 줄일 수 있다(첫 줄을 쓴다) · DMA id 에 이메일이 없으면 개요에 없을 수 있다(그 사용자 자리는 「확인 전」).
- 마스터 `account_no` 는 `dma_user_accounts.account_no` 와 FK 로 같다(정규화값). 개요 `AdminAccountView.accountNo` 와는 shared `normalizeAccountNo` 비교로 맞춘다.
- shared `packages/shared/src/order-endpoint.ts`: `summarizeOrderEndpoint(input)` → `OrderEndpointSummary { state set|unset|unknown, orderIp, orderMac, source, mismatches[{serverKey, state, orderIp, orderMac}] }` · `summarizeAccountCosts(input)` → `AccountCostSummary { state known|unknown, budgetKrw, feePpm, sellTaxPpm, source, budgetMismatches[{serverKey, budgetKrw}], feeMismatches[{serverKey, feePpm, sellTaxPpm}] }` · `validateOrderEndpointInput({ip, mac})` · `normalizeOrderIp/Mac` · `formatOrderIp/Mac`(렌더 전용). 입력 = `{ account: AdminAccountView 일부, registry }`. 이 파일은 바꾸지 않는다.
- Express `server/src/routes/admin-accounts.ts`(215줄): 경로 한정 관문 `adminAccountsRouter.use("/accounts", requireAuth(), requireAdmin())` · `fanoutOne(req, relay, account, link)`(putAccount → `relayResults` · ApiError 는 항목 error · relay 없음 RELAY_UNAVAILABLE) · PUT 저장 = RPC `dma_admin_update_account` → links(active 서버 있는 것만) 팬아웃 · `NoSuchAccount()` 404 · `accountMasterParam`(broker enum · 계좌번호 정규화). RPC `admin_accounts_raw` 는 `{ accounts: AdminAccountMaster[] }`(users[].servers[].state 포함).
- relay client(`server/src/services/relay-admin-client.ts` L446~449): `setAccountBudget(dma, broker, accountNo, { budgetKrw }, adminEmail)` · `setAccountFee(dma, broker, accountNo, { feePpm, sellTaxPpm }, adminEmail)` → `RelayAdminResponse<AdminCommandResponse>` · 경로 `/internal/admin/dma-users/:dma/accounts/:broker/:accountNo/budget|fee`. relay 가 그 사용자의 active 등록 서버마다 op 6/7 을 보낸다. `putAccount(dma, { account, servers, orderEndpoint? })` — orderEndpoint 없으면 87 IP/MAC 보존.
- server 스키마(`server/src/schemas/admin.ts`): `AdminAccountBudgetSchema`(strict · 정수 0..MAX_SAFE) · `AdminAccountFeeSchema`(strict · uint32 두 값 · **범위 검사 없음** — gh-trade code 1 경로) · `OrderEndpointSchema`(trim · 길이 ≤64 · **형식 검사 없음** — gh-trade code 13 이 정본) · `AdminAccountSaveSchema`(z.object 기본 strip — 키가 없으면 orderEndpoint 가 조용히 사라진다 → 배포는 server 먼저). Express per-user `/dma-users/:dma/accounts/:b/:n/budget|fee` 경로(admin.ts L642~690)는 **남긴다**(배포 창의 옛 웹 호환 · 이 작업 뒤 웹은 안 부른다).
- server 테스트 꼴: `server/tests/routes/admin-accounts.test.ts` — `makeAdminSupabase({ rpc: { admin_accounts_raw: () => ({ data: overview, error: null }) } })` · `makeFakeRelay(handler)` 의 `calls[]`(method · path · body) · `relayReject(status, code)`.
- webapp `account-editor.tsx`(1953줄) 지도: `ACCOUNT_EDITOR_TEXT` L131~222 · `ORDER_ENDPOINT_ERROR_TEXT` L225 · overlay/`applyAccountResults`/`releaseEditChips`/`editResultLines` L349~420 · `OrderEndpointLine` L541 · `OrderEndpointMismatchLines` L563 · 비용 헬퍼 + `useCostDraft` + `AccountCostRow` L575~1081 · `AccountRowProps` L1087 · `EditFields`/`editSaveBodyOf` L1112~1159 · `AccountRow` L1161~1551(편집 상태 · 「편집」 버튼 L1346 · 편집 폼 L1375~1486 · 카드에서 비용 행 L1502) · `AccountEditor` L1823~1953(`editingKey` · `users` prop · `shownChips` 의 edit 표시 건너뛰기).
- 비용 행 상태기계(그대로 옮길 것 — 바꾸지 않는다): `useCostDraft`(포커스 중 재조회가 칸을 덮지 않음 · dirty = edited ‖ hold) · 안 고친 Enter 는 요청 0(WR-01 R2) · 확인 전 빈 칸은 보내지 않음(CR-01) · 같은 값 + 불일치 없음 = 「변경 없음」 · 범위 밖 수수료/매도세는 보내지 않고 aria-invalid + 범위 줄 · 비행 중 그 op 칸만 readOnly · 칩 자리 1벌(가장 최근 결과) · op 별 실패/미반영 줄 · `costChipOf`/`costResultLines` 는 `r.server` 를 그대로 글자로 쓴다(code 1 = 「서버 미지원」).
- `useFieldSave(save, { releaseOn, onSuccess })` — save 는 `Promise<AdminCommandResponse | void>` 를 돌려야 한다(그래서 팬아웃 응답은 `flattenFanout` 으로 `{ results }` 로 접는다). `releaseOn` 은 재조회 때만 identity 가 바뀌는 객체여야 한다(렌더마다 새로 만드는 값 금지).
- `account-master-sheet.tsx`(601줄) EditSheet L378~ : 로컬 상태 name/branchNo/traderId/busy/fanout · `save()` → `saveAdminAccount` → `setFanout` · `onSaved()`(부모 재조회) · `UserLine` 이 사용자별 `ResultChips` · `BusyLines`. 시트는 `accounts-client.tsx` 에서 계좌 키로 key 되어 재조회에도 상태가 유지된다. 텍스트 상수 `ACCOUNT_MASTER_SHEET_TEXT` L38.
- 테스트 하네스: account-editor.test.tsx 의 P36 블록(L1593~2176)은 `mountCost(accounts)` 하나(L1614~1622)로 `<AccountEditor …/>` 를 그리고 `acctRow(no)`(= `[data-slot="admin-account"][data-account=no]`) 안에서 칸 · 칩을 찾는다 · `setAccountBudgetMock('kimtr', 'KB', no, krw)` 형식 단언. P30 편집 블록 = L737~1592(편집 모드 · 저장 결과 · IP/MAC 편집칸 · 보내기 규칙 · D-18). users-client.test.tsx L395~445 = D-18 공유 계좌 안내(편집 모드 전용). account-master-sheet.test.tsx 의 `LINKED` 픽스처(kimtr KB120·KB121 / leetr KB120 / parktr removing-only).
- 사이드바 `webapp/src/components/layout/app-sidebar.tsx`: NAV_ADMIN L198(href /admin/users) · 하위 상수 L199~206 · Admin 블록 L752~810(하위 li 순서 사용자 · 계좌 · 서버 · 발사 · 매매손익) · 머리 주석 L41~42 · L190~197. 테스트 L1511~ describe 의 순서 배열(L1538~1560)과 `admin()` href 단언(L1528).
- **Playwright e2e(`webapp/e2e/specs/admin.spec.ts`)는 261106-lwu 때부터 이미 옛 UI(「제거」 · 계좌명 편집 · 카드 편집)를 단언하고 있다 — 이 작업도 손대지 않는다**(지시: e2e 추가 · 실행 없음). SUMMARY 「후속」 에 남긴다.
- 동시 세션: 작업 트리에 남의 미커밋 변경(tasks/lessons.md · lwu 목업 등)이 있다. **자기 경로만 `git add <경로>`(-A/. 금지)** · 커밋 전 `git status -sb` 재확인 · vitest 는 늘 `--maxWorkers=2`. 커밋 메시지 한글 · Co-Authored-By 트레일러 없음. 배포 명령(server 배포 · git push)은 실행하지 않는다.
- 이 저장소 baseline(HEAD 실측): 제거 대상 식별자 게이트(Task 2 verify 3번째) = 11줄 · admin-api per-user 비용 함수 = 2줄. 둘 다 HEAD 에서 게이트가 실패하는 쪽이다(올바른 게이트).

<interfaces>
shared 변경(Task 1) — 기존 타입 확장만:

  /** PUT /api/admin/accounts/:broker/:accountNo — 계좌명 · 지점 · 트레이더 저장(D-08) + 주문자 IP/MAC(quick 261106-ntl N-02). */
  export interface AdminAccountSaveBody {
    name: string; branchNo: string; traderId: string;
    /** KB 만 · 웹 입력 원문(trim) · 있으면 연결 사용자마다 relay 계좌 PUT 에 그대로 싣는다 · 둘 다 "" = 미설정으로 되돌리기 · 로그 금지. */
    orderEndpoint?: AdminOrderEndpoint;
  }
  // PUT …/accounts/:broker/:accountNo/budget 바디 = 기존 AdminAccountBudgetBody · /fee 바디 = 기존 AdminAccountFeeBody ·
  // 세 경로 응답 모두 기존 AdminAccountSaveResponse { ok: true; fanout: AdminAccountFanout[] } (doc 주석만 갱신).

webapp 순수 모듈(Task 3) `webapp/src/components/admin/account-linked-summary.ts`:

  export function fanoutSlotLabel(dmaUserId: string, serverKey: string): string;   // `${dmaUserId} · ${serverKey}`
  export interface LinkedSlot { dmaUserId: string; serverKey: string; label: string }
  export interface LinkedAccount {
    slots: LinkedSlot[];                                   // master.users 순(DMA id 오름차순) × 그 사용자의 active 서버(마스터 순서)
    views: ReadonlyMap<string, AdminAccountView>;          // DMA id → 개요의 이 계좌 뷰(없으면 키 없음)
    registry: AdminUsersOverview["servers"];               // 이 계좌 증권사 레지스트리(개요 없으면 [])
  }
  export function linkedAccountOf(master: AdminAccountMaster, overview: AdminUsersOverview | null): LinkedAccount;
  export function summarizeLinkedCosts(l: LinkedAccount): { summary: AccountCostSummary; slots: { label: string; known: boolean }[] };
  export function summarizeLinkedOrderEndpoint(l: LinkedAccount): OrderEndpointSummary;   // serverKey · source = 슬롯 라벨
  export function orderEndpointToSend(i: { initial: { ip: string; mac: string }; draft: { ip: string; mac: string }; mismatched: boolean }): AdminOrderEndpoint | null;
  export function flattenFanout(res: AdminAccountSaveResponse): AdminCommandResponse;

webapp account-editor.tsx 새 export(Task 2):

  export interface AccountCostFieldsProps {
    broker: DmaBroker; accountNo: string;                 // aria 라벨 「KB 123 예수금(원)」 그대로
    summary: AccountCostSummary;                          // mismatches[].serverKey · source = 칩 라벨
    slots: readonly { label: string; known: boolean }[];  // 쉬는 · 보내는 중 · 변경 없음 칩 자리(순서 그대로)
    saveBudget: (krw: number) => Promise<AdminCommandResponse>;                              // results[].server = 칩 라벨
    saveFee: (v: { feePpm: number; sellTaxPpm: number }) => Promise<AdminCommandResponse>;
    releaseOn: unknown;                                   // 재조회 때만 바뀌는 객체
    disabled: boolean;                                    // 연결 0명 — 세 칸 disabled · 칩/캡션 없음
    onChanged: () => void;
  }
  export function AccountCostFields(props: AccountCostFieldsProps): JSX.Element;
  export const ORDER_ENDPOINT_ERROR_TEXT;                 // 기존 상수를 export 만(Task 3 시트가 쓴다)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 서버 팬아웃 계약 — PUT /accounts/:broker/:accountNo/budget · /fee + 저장 경로 orderEndpoint · 사이드바 Admin 하위 순서</name>
  <files>packages/shared/src/admin.ts, server/src/schemas/admin.ts, server/src/routes/admin-accounts.ts, server/tests/routes/admin-accounts.test.ts, webapp/src/components/layout/app-sidebar.tsx, webapp/src/components/layout/__tests__/app-sidebar.test.tsx</files>
  <behavior>
    - PUT /api/admin/accounts/KB/:no/budget { budgetKrw: 15000000 }: admin_accounts_raw 1회 → 그 계좌 users 중 active 서버가 있는 사용자(kim01 · lee01)만 relay `…/dma-users/<dma>/accounts/KB/<no>/budget` PUT 각 1회(바디 { budgetKrw }) · removing-only 사용자 호출 0 → 200 { ok: true, fanout: [{ dmaUserId, results, error: null }, …] } DMA id 순.
    - 한 사용자 relay 409(NO_SUCH_ACCOUNT) · 다른 사용자 502 → 200 유지 · 그 항목 error { code, message } · results [] · 나머지 항목 results 그대로. relay 클라이언트 없음 + active 링크 있음 → 각 항목 error RELAY_UNAVAILABLE.
    - 목록에 없는 계좌 → 404 NOT_FOUND · relay 0. 바디 위반(음수 · 소수 · 추가 키) → 400 · RPC 0 · relay 0. active 링크 0(연결 0명 · removing 만) → relay 0 · fanout []. trader → 403.
    - PUT …/fee { feePpm: 500, sellTaxPpm: 2000 } → 같은 규칙 · relay 바디 두 값 그대로 · uint32 밖 → 400 · 0~10000 범위 밖(예 20000)은 400 이 아니다(relay 로 간다 — gh-trade code 1 경로).
    - PUT /api/admin/accounts/KB/:no { name, branchNo, traderId, orderEndpoint: { orderIp: " 10.41.1.124 ", orderMac: "1c-fd-08-7d-97-8e" } } → 각 사용자 putAccount 바디에 orderEndpoint { orderIp: "10.41.1.124", orderMac: "1c-fd-08-7d-97-8e" }(trim 만 · 표기 그대로) · orderEndpoint 없는 저장은 바디에 키 자체가 없다(기존 테스트 그대로 통과) · KYOBO + orderEndpoint → 400 · RPC 0 · relay 0.
    - 사이드바(admin): Admin 하위 링크 순서 = 매매손익 · 계좌 · 사용자 · 서버 · 발사 · 「Admin」 제목 href = /admin/pnl · My page 가 Admin 앞 그대로 · 활성 규칙(하위 항목만 켬 · 레일은 /admin 접두) 그대로.
  </behavior>
  <action>
① shared `packages/shared/src/admin.ts`(per N-02): `AdminAccountSaveBody` 에 선택 필드 `orderEndpoint?: AdminOrderEndpoint` 추가(위 interfaces 주석 그대로). `AdminAccountSaveResponse` doc 주석에 「PUT …/budget · …/fee 팬아웃 응답도 같은 모양(quick 261106-ntl N-01)」 한 줄. 다른 타입은 바꾸지 않는다.
② `server/src/schemas/admin.ts`: `AdminAccountSaveSchema` 에 `orderEndpoint: OrderEndpointSchema.optional()` 추가(형식 검사 추가 금지 — 기존 code 13 계약). 계좌 마스터 구역 주석에 N-02 한 줄.
③ `server/src/routes/admin-accounts.ts`:
  - `fanoutOne` 을 「사용자 1명 relay 호출 → AdminAccountFanout」 일반 헬퍼로 바꾼다: 인자 = (relay 또는 undefined, dmaUserId, op 이름, relay 를 받아 `RelayAdminResponse<AdminCommandResponse>` 를 돌려주는 호출 함수). relay 없음 → RELAY_UNAVAILABLE 항목 · `relayResults(…, op)` · ApiError 는 { code, message } · 그 밖 예외는 RELAY_FAILED 고정 문구(지금 동작 그대로). 기존 PUT 저장 팬아웃은 이 헬퍼로 putAccount 를 부른다.
  - PUT /accounts/:broker/:accountNo(per N-02): 바디에 orderEndpoint 가 있고 broker 가 KYOBO 면 RPC 전에 `ValidationFailed("orderEndpoint: 주문자 IP · MAC 은 KB 계좌만이에요")`. 있으면 각 링크 putAccount 바디에 `orderEndpoint` 를 그대로 싣고, 없으면 키를 넣지 않는다. audit("account-save") extra 에 orderEndpoint 가 있을 때만 `orderEndpoint: "set" | "clear"`(둘 다 "" = clear · 값은 싣지 않는다 — 사용자 PC 식별 정보).
  - 새 헬퍼 `activeLinkUsers(supabase, broker, accountNo)`: rpc `admin_accounts_raw` 1회 → 오류 DbError → `accounts` 배열 아니면 DbError → (broker, accountNo) 일치 계좌 없으면 `NoSuchAccount()` → `users.filter(u => u.servers.some(s => s.state === "active")).map(u => u.dmaUserId)`(RPC 정렬 그대로). 새 RPC · 표 직접 조회를 만들지 않는다(왕복 1회 · 기존 fixture 로 테스트).
  - 새 경로 PUT /accounts/:broker/:accountNo/budget(per N-01): `accountMasterParam` → `AdminAccountBudgetSchema` → activeLinkUsers → Promise.all 로 사용자마다 헬퍼(op "account-budget", relay.setAccountBudget(dma, broker, accountNo, { budgetKrw }, req.adminEmail!)) → 200 `{ ok: true, fanout }` · audit("account-budget", broker, { budgetKrw, users: n, fanout: `${maskDmaUserId}:${server}:${outcome}` 목록 — 저장 경로와 같은 꼴 }).
  - 새 경로 PUT /accounts/:broker/:accountNo/fee: `AdminAccountFeeSchema` · relay.setAccountFee(dma, broker, accountNo, { feePpm, sellTaxPpm }, …) · audit("account-fee", broker, { feePpm, sellTaxPpm, users, fanout }). 범위 검사 추가 금지.
  - 머리 라우트 표 주석에 두 경로 + 저장 경로 orderEndpoint 한 줄씩(quick 261106-ntl N-01 · N-02). 감사 줄에 계좌번호 없음 규칙 유지.
④ `server/tests/routes/admin-accounts.test.ts`: behavior 의 supertest 항목을 새 describe 2개(budget · fee) + 기존 PUT describe 에 orderEndpoint 3건으로 추가. 픽스처는 파일의 `overview` 를 넓혀 쓴다(active 2명 + removing-only 1명 계좌 하나 — 기존 테스트 단언이 바뀌지 않게 새 계좌를 추가하는 쪽). relay 호출 단언은 `calls[]` 의 method · path · body.
⑤ 사이드바 `webapp/src/components/layout/app-sidebar.tsx`(per N-04): Admin 하위 `<li>` 순서를 매매손익 · 계좌 · 사용자 · 서버 · 발사로 옮기고(각 item 이름 · href · 활성 규칙 그대로) `NAV_ADMIN.href` 를 `/admin/pnl` 로. 하위 상수 정의 순서와 머리 주석(L41~42 · L190~197 · Admin 블록 주석)을 새 순서 · 「제목 = /admin/pnl(첫 항목)」 으로 고친다. My page 위치 · 노출 조건 · 모바일 탭바는 건드리지 않는다.
⑥ `webapp/src/components/layout/__tests__/app-sidebar.test.tsx`: Admin describe 제목 · 순서 배열(… My page · Admin · 매매손익 · 계좌 · 사용자 · 서버 · 발사) · `admin()` href /admin/pnl 단언 갱신. 다른 describe 는 그대로(깨지면 순서 의존 단언만 고친다).
커밋: `feat(quick-261106-ntl): 계좌 예수금·수수료 팬아웃 경로 + 계좌 저장 IP/MAC 팬아웃 · 사이드바 Admin 하위 순서` — 이 task 경로만 git add.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-accounts.test.ts tests/routes/admin-dma.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/server typecheck</automated>
    <automated>pnpm --filter @gh-radar/webapp exec vitest run src/components/layout/__tests__/app-sidebar.test.tsx --maxWorkers=2</automated>
  </verify>
  <done>admin-accounts · admin-dma 라우트 테스트 green(새 budget · fee · orderEndpoint 케이스 포함) · server typecheck 통과 · 사이드바 테스트 green(순서 배열 · 「Admin」 href /admin/pnl 단언 — HEAD 에서는 /admin/users 라 실패하는 단언) · relay/ · supabase/ 아래 변경 0.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 사용자 카드 — 예수금 · 수수료 · 매도세 읽기 한 줄 · IP/MAC 줄 안내 · 「편집」/편집 모드 제거 + 비용 칸 컴포넌트를 AccountCostFields 로 일반화</name>
  <files>webapp/src/components/admin/account-editor.tsx, webapp/src/components/admin/user-sheet.tsx, webapp/src/components/admin/users-client.tsx, webapp/src/components/admin/__tests__/account-editor.test.tsx, webapp/src/components/admin/__tests__/users-client.test.tsx</files>
  <behavior>
    - 카드(KB · 교보) 어디에도 「편집」 버튼이 없고(`{broker} {no} 편집` 접근 이름 0개) 편집 폼이 열리지 않는다. 「연결 해제」 · 서버 토글 · 주문 서버 · 「+ 계좌 연결」 기존 테스트는 그대로 green.
    - 카드에 예수금 · 수수료 · 매도세 textbox 가 없다. 읽기 한 줄(data-slot admin-account-cost-read): costs KB120 1억 · 100ppm · 2000ppm → 「예수금 100,000,000원 · 수수료 0.01% · 매도세 0.2% · 설정은 「계좌」 메뉴에서」 · 예수금 0 → 「예수금 미설정 · …」 · 87 모름 → 「예수금 · 수수료 · 매도세 확인 전 · 설정은 「계좌」 메뉴에서」 · 자리 = IP/MAC 줄 다음 · 서버 알약 줄 앞 · 87 전용 흐린 줄에는 없음 · 교보 카드에도 있음.
    - 카드 서버 간 다름: IP/MAC 불일치 줄 「KB121 값이 달라요(미설정) — 「계좌」 메뉴에서 저장하면 모두 같아져요」 · 예수금 다름 「KB121 은 50,000,000원 — 「계좌」 메뉴에서 저장하면 모두 같아져요」(수수료 · 매도세 쌍은 따로 한 줄 · 조사 규칙 josaEunNeun 그대로).
    - IP/MAC 읽기 줄(KB) 끝에 「 · 설정은 「계좌」 메뉴에서」 — 설정됨 · 미설정 · 확인 전 모두.
    - AccountCostFields 단독(테스트 하네스가 단일 사용자 배선 — 라벨 = 서버 키 · saveBudget = setAccountBudgetMock('kimtr', broker, no, krw) 결과): 기존 P36 상태기계 단언(표시 · Enter 저장 · 변경 없음 · 범위 밖 · WR-01 · CR-01 · 칩 · 실패/미반영 줄 · 비행 중 readOnly · 재조회 정본)이 그대로 green. 불일치 줄 꼬리만 「— 저장하면 모두 같아져요」. disabled → 세 칸 disabled · 칩 · 캡션 없음 · 입력해도 저장 0.
    - UsersClient/UserSheet 에서 공유 계좌 안내(D-18) 경로가 사라진다(편집 모드 전용이었다).
  </behavior>
  <action>
① `account-editor.tsx` 비용 칸 일반화(per N-01 준비 · N-03): `AccountCostRow` 를 export `AccountCostFields`(위 interfaces 의 props)로 바꾼다. 내부 상태기계(`useCostDraft` · saveBudget/saveFee 분기 · 칩/줄 · CR-01 · WR-01 · 컨테이너 쿼리 배치)는 손대지 않고 입력 출처만 바꾼다: `summarizeAccountCosts` 호출 → `summary` prop · 레지스트리 순 active 서버 목록 → `slots` 라벨 · 쉬는 칩 = slot.known 이면 ok 칩(라벨) 아니면 「<라벨> · 확인 전」 · `useFieldSave` 의 저장 함수 = `saveBudget` / `saveFee` prop · `releaseOn` prop · aria 라벨 = `${broker} ${accountNo} …` · 기존 카드 편집 잠금 prop 은 `disabled` 로 대체(true 면 세 Input `disabled` · 값 "" · placeholder 「—」 · 칩 줄 · 캡션 · 변경 없음/범위/결과 줄 렌더 안 함 · 저장 함수 미호출). 불일치 줄 꼬리는 새 `mismatchTailSheet`. 머리 doc 주석에 「quick 261106-ntl — 계좌 수정 시트 전용 · 칩 라벨과 저장 함수는 호출자가 준다(사용자·서버 팬아웃)」. 비용 헬퍼(KO_NUM · costChipOf · costResultLines · CostChipView 등)는 그대로 둔다.
② 카드 읽기 줄(per N-03): 새 내부 컴포넌트 `AccountCostLine({ account, registry })` — `summarizeAccountCosts` 결과로 behavior 문구(값은 font-semibold · 미설정/확인 전은 --faint · 예수금 `KO_NUM.format(krw)원` · 비율 `ppmToPct(ppm)%`) + 그 아래 예수금/비율 불일치 줄(카드 꼬리 `mismatchTailCard` · `WARN_LINE`). `AccountRow` 의 비용 행 자리(IP/MAC 줄 다음 · 서버 알약 앞)를 이것으로 바꾼다. `OrderEndpointLine` 끝에 「 · {settingsHint}」 · `OrderEndpointMismatchLines` 는 카드 꼬리로.
③ 편집 모드 제거(per N-03 — 편집할 것이 없다): `AccountRow` 의 「편집」 버튼 · 편집 draft/초깃값 상태 · 편집 저장 `useFieldSave` · 편집 폼 JSX · 결과 줄/「변경 없음」 상태 · 포커스 복귀 effect · IP/MAC 검증 계산 · 공유 계좌 판정 · 편집 비행 중 잠금 분기(토글 · 「연결 해제」 · 주문 서버의 disabled 조건에서 편집 저장 항만 뺀다)를 지운다. `EditFields` · `editSaveBodyOf` · `editResultLines` · `EditResultLine` · `releaseEditChips` · `applyAccountResults` 의 source 인자 · `ChipView` 의 source 필드 · `AccountEditor` 의 `editingKey` 상태와 그 정리 분기 · `shownChips` 의 편집 칩 건너뛰기 · `AccountRowProps` 의 editing/editLocked/onEditStart/onEditEnd/onEditResultsCleared/users · `AccountEditorProps.users`(D-18 — 편집 모드 전용)와 `NO_USERS` 를 지운다. 쓰이지 않게 된 import(shared 의 공유 계좌 판정 · 정규화 · 검증 함수 · admin-api 의 per-user 예수금/수수료 함수 · React 훅 등)는 tsc/eslint 가 가리키는 대로 지운다. `ORDER_ENDPOINT_ERROR_TEXT` 는 지우지 말고 export(Task 3 시트가 쓴다 · 미사용 const 경고 방지).
④ `ACCOUNT_EDITOR_TEXT`(per N-01 ~ N-03): 새 키 `settingsHint: "설정은 「계좌」 메뉴에서"` · `mismatchTailCard: "「계좌」 메뉴에서 저장하면 모두 같아져요"` · `mismatchTailSheet: "저장하면 모두 같아져요"`. `ipmacMismatch(label, m, tail)` · `costMismatchBudget(label, v, tail)` · `costMismatchFee(label, fee, tax, tail)` 로 꼬리를 인자로 받게 바꾼다(앞부분 문형 · 조사 그대로 — 결과 예: 「leetr · KB120 은 5,000,000원 — 저장하면 모두 같아져요」). 편집 모드에서만 쓰던 키(편집 · 편집 취소/저장 · 잠금 title · 교보 IP/MAC 해당 없음 · 공유 계좌 안내)는 webapp/src 전체 grep 참조 0 일 때만 지운다. ipLabel · macLabel · placeholder · ipmacHelp · ipInvalid/macInvalid/pairInvalid · unchanged · editFailedLine(costResultLines 가 씀)은 남긴다(Task 3 가 쓴다). 파일 머리 큰 주석의 편집 모드 · 공유 계좌 안내 · KB IP/MAC 편집 문단은 「quick 261106-ntl N-03 — 카드는 읽기 전용(IP/MAC · 예수금 · 수수료 · 매도세 줄 끝 「설정은 「계좌」 메뉴에서」) · 설정은 계좌 수정 시트(account-master-sheet)」 짧은 문단으로 대체한다.
⑤ `user-sheet.tsx` · `users-client.tsx`: UserSheet 의 `users` prop(D-18 내려보내기)과 AccountEditor 로의 전달 · users-client 의 `users={state.data.users}` 를 지운다. 머리 주석의 D-18 언급 정리.
⑥ 테스트 `account-editor.test.tsx`: P30 편집 · 저장 결과 · IP/MAC 편집칸 · 보내기 규칙 · D-18 describe(L737~1592 일대)를 지운다(그 행동은 Task 3 의 순수 함수 · 시트 테스트가 다시 잠근다) — 단 「메타 줄 끝 masterHint」 테스트(L787)는 읽기 카드 describe 로 옮겨 살리고, 「교보 · KB 카드에 「편집」 없음」 단언 1건을 더한다. P30 읽기 카드 describe 는 settingsHint · 카드 꼬리 문구로 단언 갱신. P36 블록은 `mountCost` 를 테스트 파일 안 단일 사용자 하네스로 바꾼다 — 계좌마다 `<div data-slot="admin-account" data-account={no}>` 안에 `AccountCostFields`(summary = shared summarizeAccountCosts({ account, registry: 그 증권사 SERVERS }) · slots = active 서버 레지스트리 순 · known = costs[k] != null · saveBudget/saveFee = 기존 mock 을 ('kimtr', broker, no, …) 로 호출 · releaseOn = account · disabled false) 를 그려 기존 셀렉터 · 단언을 그대로 살린다. 불일치 꼬리 문구만 갱신 · 카드 전용 3건(87 전용/교보 행 존재 · 편집 모드 중 행 · 카드 편집 비행 중 readOnly)은 「카드 읽기 줄」 테스트(behavior 2번째 항목 · AccountEditor 렌더)와 「disabled」 테스트로 바꾼다. `users-client.test.tsx` 의 D-18 describe 를 지운다.
커밋: `refactor(quick-261106-ntl): 사용자 카드 예수금·수수료·IP/MAC 읽기 전용 · 카드 편집 모드 제거 · 비용 칸 AccountCostFields 일반화` — 이 task 경로만 git add.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/components/admin/__tests__/account-editor.test.tsx src/components/admin/__tests__/user-sheet.test.tsx src/components/admin/__tests__/users-client.test.tsx src/components/admin/__tests__/account-master-sheet.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck</automated>
    <automated>pnpm --filter @gh-radar/webapp exec eslint --max-warnings 0 src/components/admin/account-editor.tsx src/components/admin/user-sheet.tsx src/components/admin/users-client.tsx</automated>
    <automated>test "$(grep -nE 'editSaveBodyOf|releaseEditChips|findSharedAccountHolders|editingKey|data-editing' webapp/src/components/admin/account-editor.tsx | grep -vE '^[0-9]+:[[:space:]]*(\*|//|/\*)' | wc -l | tr -d ' ')" = 0 && echo GATE_OK</automated>
  </verify>
  <done>네 테스트 파일 green · webapp typecheck · eslint 경고 0 · 제거 식별자 게이트 GATE_OK(HEAD 11줄 → 0) · 카드에 「편집」 · 비용 textbox 없음 · AccountCostFields 가 export 되고 P36 상태기계 단언이 문구 꼬리 외 그대로 통과.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 계좌 수정 시트 — 「예수금 · 수수료」 그룹(사용자·서버 팬아웃) · KB 주문자 IP/MAC 칸 · 사용자·서버 불일치 줄 · 연결 0명 잠금</name>
  <files>webapp/src/lib/admin-api.ts, webapp/src/components/admin/account-linked-summary.ts, webapp/src/components/admin/__tests__/account-linked-summary.test.ts, webapp/src/components/admin/account-master-sheet.tsx, webapp/src/components/admin/__tests__/account-master-sheet.test.tsx, webapp/src/components/admin/accounts-client.tsx, webapp/src/components/admin/__tests__/accounts-client.test.tsx</files>
  <behavior>
    - linkedAccountOf: 슬롯 = master.users 순 × active 서버만(removing 제외 · parktr 슬롯 0) · 라벨 「kimtr · KB120」 · views 는 개요 users 에서 DMA id 첫 줄의 같은 증권사 · normalizeAccountNo 같은 계좌 · overview null → views 비고 registry [].
    - summarizeLinkedCosts: kimtr(KB120=KB121=1천만 · 100/2000ppm) · leetr(KB120 5백만) → summary known · 1천만 · source 「kimtr · KB120」 · budgetMismatches [{ serverKey: 「leetr · KB120」, budgetKrw: 5000000 }] · feeMismatches 따로 · 87 모르는 슬롯은 known false 로 슬롯에 남고 비교 밖 · kimtr 전부 모름이면 정본 = leetr · 아무도 모르면 unknown(0 · source null · 불일치 []).
    - summarizeLinkedOrderEndpoint: 같은 규칙(사용자마다 shared summarizeOrderEndpoint 출처 → 정본 · 다른 슬롯 IP 또는 MAC 다르면 mismatches[{ serverKey: 라벨, state set|unset, … }]).
    - orderEndpointToSend: 정규화 비교 같음 + 불일치 없음 → null · 바뀜 → { trim 원문 } · 안 바뀜 + 불일치 → draft trim 원문 · 확인 전(초깃값 "" "") 두 칸 빈 채 → null · 설정값에서 두 칸 비움 → { "", "" }.
    - flattenFanout: results server → 「<dma> · <server>」 (code · message · outcome 보존) · error 항목 → { server: dmaUserId, outcome: "failed", message: error.message } 1개.
    - 시트(연결 계좌 LINKED + 개요): 「예수금 · 수수료」 제목 + 「쓰는 사용자 모두의 등록 서버에 즉시 저장」 · 예수금 칸 「10,000,000」 · 쉬는 칩 「kimtr · KB120」 「kimtr · KB121」 「leetr · KB120」 · 불일치 줄 「leetr · KB120 은 5,000,000원 — 저장하면 모두 같아져요」 · 「15000000」 Enter → setAdminAccountBudget('KB', no, 15000000) 1회 → 응답 fanout(kimtr ok 2 · leetr offline) → 칩 「kimtr · KB120」 「kimtr · KB121」 「leetr · KB120 · 서버 연결 안 됨」 + 줄 「leetr · KB120 미반영: 서버 연결 안 됨」 · onSaved(부모 재조회) 호출 · 수수료 「0.05」 Enter → setAdminAccountFee('KB', no, 500, 2000) · 사용자 error(409) → 「leetr 실패: <message>」 role=alert.
    - 시트(연결 0명 FREE): 세 칸 disabled · 「사용자에게 연결된 뒤 설정할 수 있어요 — 값은 연결된 사용자의 서버에 저장돼요」 · KB IP/MAC 두 칸도 disabled + 같은 안내 · 어떤 저장 API 도 0회.
    - 시트 IP/MAC(KB · 연결): 초깃값 = 정본 표시 표기(10.41.1.124 · 1C:FD:08:7D:97:8E) · leetr 미설정이면 줄 「leetr · KB120 값이 달라요(미설정) — 저장하면 모두 같아져요」 + 아무것도 안 바꿔도 「저장」 활성 → saveAdminAccount 바디에 orderEndpoint(칸 원문) · IP 만 바꿔 저장 → orderEndpoint { trim 원문 } + 계좌명 · 지점 · 트레이더 · 계좌명만 바꾼 저장(불일치 없음) → 바디에 orderEndpoint 키 없음 · IP 만 적고 MAC 비움 → MAC 칸 aria-invalid + 짝 오류 줄(도움말 대신) · 「저장」 비활성 · 같은 값을 다른 표기로 적고 저장(계좌 값 그대로 · 불일치 없음) → 요청 0 + 「변경 없음」 · 교보 계좌 → IP/MAC 칸 없음 · 저장 성공 뒤 「저장」 비활성(초깃값 = 보낸 값).
    - AccountsClient: 마운트 시 fetchAdminAccounts 와 fetchAdminUsers 를 함께(앞 응답 기다리지 않음) · fetchAdminUsers 실패 → 목록은 그대로 · 시트 비용 칸은 확인 전(「—」 · 칩 「… · 확인 전」) · 저장 뒤 재조회는 둘 다.
  </behavior>
  <action>
① `webapp/src/lib/admin-api.ts`(머리 경로 표 주석에 두 줄): `setAdminAccountBudget(broker, accountNo, budgetKrw)` → PUT `${accountPath(broker, accountNo)}/budget` 바디 `AdminAccountBudgetBody` · `setAdminAccountFee(broker, accountNo, feePpm, sellTaxPpm)` → `/fee` 바디 `AdminAccountFeeBody` — 둘 다 `timeoutMs: RELAY_TIMEOUT_MS` · 응답 `AdminAccountSaveResponse`. Task 2 뒤 참조가 0 이 된 per-user `setAccountBudget` · `setAccountFee` 함수는 지운다(grep 으로 production 참조 0 확인 — Express per-user 경로는 서버에 남는다).
② 새 순수 모듈 `webapp/src/components/admin/account-linked-summary.ts`(위 interfaces · 머리 주석에 quick 261106-ntl N-01 · N-02 · 「규칙은 shared summarize* 한 벌을 사용자마다 · 여기는 사용자 간 정본 · 불일치 집계와 칩 라벨만」): 정본 = master.users 순으로 shared 판정이 known/unknown 아닌 첫 사용자의 출처 값 · source = 그 사용자 출처 슬롯 라벨 · 불일치 = 정본 슬롯을 뺀 모든 값-아는 슬롯 중 다른 것(비용은 예수금 · (수수료, 매도세) 쌍 따로 · IP/MAC 은 둘 중 하나라도 다르면) · 슬롯 값 = views.get(dma)?.costs?.[serverKey] / orderEndpoints?.[serverKey] · `orderEndpointToSend` 는 지금 account-editor 가 지운 저장 바디 규칙과 같은 판정(양쪽 normalizeOrderIp/Mac · 실패면 원문 비교 · 보낼 값은 trim 원문 — 정규화값을 보내지 않는다).
③ 테스트 `__tests__/account-linked-summary.test.ts`: behavior 의 순수 함수 항목 전부.
④ `account-master-sheet.tsx` EditSheet(per N-01 · N-02 · 목업 ③): props 에 `overview: AdminUsersOverview | null` 추가(`AccountMasterSheetProps` edit 쪽 · `AccountMasterSheet` 전달). 렌더마다 `linkedAccountOf(account, overview)` → `settable = slots.length > 0` · 비용 집계 · KB 면 IP/MAC 집계.
  - IP/MAC(KB 만 · 지점 · 트레이더 아래 · 목업 ③ 노란 점선): 두 칸 상태 `{ initial, draft }` 를 시트를 연 순간 정본 표시 표기(`formatOrderIp/Mac` · state set 아니면 "")로 고정(재조회가 덮지 않음). 칸 = 라벨 「주문자 IP」 · 「MAC 주소」(ACCOUNT_EDITOR_TEXT ipLabel/macLabel · placeholder · inputMode decimal · autoComplete off · spellCheck false · MAC autoCapitalize characters) · disabled = !settable ‖ 저장 중. 검증 = shared validateOrderEndpointInput · 오류 표시는 (칸을 고침 ‖ 불일치) 일 때만 · 오류 줄(ORDER_ENDPOINT_ERROR_TEXT)이 도움말(ipmacHelp) 자리를 대신 · 불일치 줄 = `ipmacMismatch(라벨, m, mismatchTailSheet)` · !settable 이면 칸 아래 notLinked 안내.
  - 「저장」 활성 = (계좌 값 바뀜 ‖ IP/MAC 칸 원문 trim 이 초깃값과 다름 ‖ (KB · settable · 불일치)) · KB 지점/트레이더 형식 ok · 보이는 IP/MAC 오류 없음 · 비행 중 아님. 저장 = `orderEndpointToSend`(KB · settable 일 때만) → 계좌 값이 그대로이고 보낼 IP/MAC 도 없으면 요청 없이 NOTE 「변경 없음」(ACCOUNT_EDITOR_TEXT.unchanged · 칸을 고치면 지움) · 아니면 saveAdminAccount 바디에 있을 때만 `orderEndpoint` · 성공 뒤 초깃값 = 보낸 칸 값(trim). KB 이고 연결 있으면 안내 문장을 목업 「저장하면 쓰는 사용자 모두의 서버 설정에 함께 반영돼요(계좌명 · 지점 · 트레이더 · IP/MAC).」 로(교보는 기존 문장).
  - 「예수금 · 수수료」 그룹(목업 ③ — 저장 버튼 줄 다음 구분선 · 쓰는 사용자 섹션 앞): 제목 + (settable 이면) 부제 「쓰는 사용자 모두의 등록 서버에 즉시 저장」 · `AccountCostFields`(broker · accountNo · summary/slots = summarizeLinkedCosts · saveBudget = krw → setAdminAccountBudget(…).then(flattenFanout) · saveFee = v → setAdminAccountFee(…).then(flattenFanout) · releaseOn = account(master prop — 재조회마다 새 객체) · disabled = !settable · onChanged = onSaved) · !settable 이면 notLinked 안내 한 줄.
  - `ACCOUNT_MASTER_SHEET_TEXT` 에 costTitle 「예수금 · 수수료」 · costSubtitle · notLinkedNote 「사용자에게 연결된 뒤 설정할 수 있어요 — 값은 연결된 사용자의 서버에 저장돼요」 · fanoutNoteKb 추가(문구는 CONTEXT · 목업 그대로). 비용 문구 · 칩은 AccountCostFields 것 그대로(새 문구 · 새 칩 컴포넌트 금지). 머리 주석에 N-01 · N-02 문단.
⑤ `accounts-client.tsx`: load() 가 `fetchAdminAccounts()` 와 `fetchAdminUsers().then(r => r, () => null)` 를 Promise.all 로 읽어 ready 상태에 `overview` 를 함께 둔다(seq 가드 · 재조회 실패 시 이전 목록 유지 규칙 그대로) · 수정 시트에 `overview` 전달. 머리 주석 한 줄.
⑥ 테스트: `account-master-sheet.test.tsx` — admin-api mock 에 setAdminAccountBudget · setAdminAccountFee 추가 · 개요 픽스처(kimtr · leetr 의 같은 계좌 뷰 — costs · orderEndpoints · servers · orderServer null · defaultOrderServer KB120 · 레지스트리 KB120/KB121)로 behavior 의 시트 항목 전부(기존 등록/수정/삭제 테스트는 edit 렌더에 overview 를 넘기는 것 외 그대로). `accounts-client.test.tsx` — mock 에 fetchAdminUsers 추가 · behavior 의 AccountsClient 항목.
커밋: `feat(quick-261106-ntl): 계좌 수정 시트 예수금·수수료·매도세 팬아웃 · KB 주문자 IP/MAC · 사용자·서버 불일치 경고` — 이 task 경로만 git add.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/components/admin src/components/layout --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck</automated>
    <automated>pnpm --filter @gh-radar/webapp exec eslint --max-warnings 0 src/components/admin/account-master-sheet.tsx src/components/admin/accounts-client.tsx src/components/admin/account-linked-summary.ts src/lib/admin-api.ts && test "$(grep -cE 'export function setAccount(Budget|Fee)\(' webapp/src/lib/admin-api.ts)" = 0 && echo GATE_OK</automated>
  </verify>
  <done>src/components/admin · layout 전체 green(새 순수 함수 · 시트 · 목록 테스트 포함) · webapp typecheck · eslint 경고 0 · per-user 비용 함수 게이트 GATE_OK(HEAD 2 → 0) · 시트에서 연결 계좌는 세 칸 · KB IP/MAC 저장이 사용자·서버 팬아웃으로, 연결 0명은 잠김.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 4: [BLOCKING] 배포 — 메인 세션이 server → git push 순서로(DB · relay 없음)</name>
  <action>메인 세션(오케스트레이터)이 server 배포 → git push 를 이 순서로 실행한다. 실행 에이전트는 여기서 멈추고 배포 명령을 실행하지 않는다(서브에이전트 배포는 분류기 차단 · push 자체가 webapp 프로덕션 배포).</action>
  <instructions>
    실행 에이전트가 끝낸 것: Task 1~3 커밋(server 팬아웃 경로 · 웹 시트 · 카드 · 사이드바 · 테스트 green). 메인 세션이 할 것:
    1. `git status -sb` 로 다른 세션 미커밋 변경 확인. `scripts/deploy-server.sh` 는 작업 트리로 docker build 하므로 이 작업 마지막 커밋의 **깨끗한 detached worktree** 에서 배포한다. 배포 전 라이브 server 이미지 APP_VERSION 이 내 HEAD 의 조상인지 확인(아니면 멈추고 보고).
    2. server 배포(`scripts/deploy-server.sh` — 라이브 Cloud Run env 에서 GCP_PROJECT_ID · SUPABASE_URL · CORS_ALLOWED_ORIGINS · TICKGW_URL 등 추출). 변경 = `server/src/routes/admin-accounts.ts` · `server/src/schemas/admin.ts` · shared. **server 가 먼저여야 한다** — 옛 server 는 저장 바디의 orderEndpoint 를 조용히 버리고(zod strip) 「반영됨」 을 보이며, …/budget · …/fee 는 404 다.
    3. `git push`(webapp Vercel 배포) — 2 가 끝난 뒤에만. relay 변경 없음 → relay 배포 없음. 마이그레이션 없음 → `supabase db push` 없음.
  </instructions>
  <verification>/admin/accounts 에서 연결 계좌 시트 「예수금 · 수수료」 값 · 칩 「<DMA id> · <서버>」 · KB IP/MAC 칸 육안 · 같은 값 재입력 Enter 는 「변경 없음」(요청 0) · 연결 없음 계좌는 잠김 · 사용자 시트 카드에 「편집」 없음 · 읽기 줄 「설정은 「계좌」 메뉴에서」 · 사이드바 Admin 하위 매매손익 · 계좌 · 사용자 · 서버 · 발사.</verification>
  <resume-signal>「배포 완료」 또는 실패 단계 · 로그를 알려 주세요</resume-signal>
</task>

</tasks>

<source_audit>
| 출처 | 항목 | 담당 |
|------|------|------|
| GOAL | 계좌 시트에서 예수금 · 수수료 · 매도세 · IP/MAC 설정 + 팬아웃 · 카드 읽기 전용 · 편집 모드 제거 · 사이드바 순서 | Task 1~3 |
| CONTEXT | N-01 비용 그룹 · 칸마다 즉시 저장 · op 6/7 · 팬아웃 · 칩 「<DMA id> · <서버>」 · 정본 · 불일치 줄 · 확인 전 · 연결 0명 잠금 | Task 1 ③(경로) · Task 2 ①(AccountCostFields) · Task 3 ②④(집계 · 그룹) |
| CONTEXT | N-02 KB IP/MAC 칸 · ipmacHelp · shared 검증 · 기존 저장 버튼 · editSaveBodyOf 규칙 · 사용자별 summarizeOrderEndpoint · 불일치 줄 · 교보 없음 · 연결 0명 잠금 | Task 1 ①②③ · Task 3 ②④ |
| CONTEXT | N-03 카드 읽기 줄 · IP/MAC 줄 안내 · 「편집」/편집 모드 제거 · 토글 · 주문 서버 · 연결 해제 유지 | Task 2 |
| CONTEXT | N-04 Admin 하위 순서 · NAV_ADMIN.href /admin/pnl · My page 위치 유지 | Task 1 ⑤⑥ |
| CONTEXT | 261106-lwu D-04 대체 | Task 2 · 3(연결별 비용 · IP/MAC 설정이 카드에서 계좌 시트로) |
| REQ / RESEARCH | 없음(quick · 리서치 생략) | — |
범위 밖(CONTEXT): 예수금 · 비용률 · IP/MAC 의 DB 마스터 저장 · 연결 0명 계좌에 미리 값 두기 · relay 변경 — 어떤 task 도 다루지 않는다(87/67 정본 유지).
재량(Claude's Discretion) 기록: 표시 데이터 출처 = 웹이 기존 사용자 개요를 병렬로 읽음(새 서버 조각 0) · 팬아웃 대상 조회 = 기존 RPC admin_accounts_raw 재사용 · 카드 불일치 줄은 남기되 꼬리를 「「계좌」 메뉴에서 저장하면 모두 같아져요」 로(정보 손실 없이 행동 위치만 바꿈) · per-user Express 비용 경로는 배포 창 호환으로 남김.
</source_audit>

<verification>
- server: `pnpm --filter @gh-radar/server exec vitest run tests/routes --maxWorkers=2` green · `pnpm --filter @gh-radar/server typecheck`.
- webapp: `pnpm --filter @gh-radar/webapp exec vitest run src/components/admin src/components/layout --maxWorkers=2` green · `pnpm --filter @gh-radar/webapp run typecheck` · 변경 경로 eslint 경고 0.
- relay · DB 무변경: `git diff --stat <작업 시작 커밋>..HEAD -- relay/ supabase/` 출력 없음.
- 배포 명령은 실행하지 않았다 — SUMMARY 에 Task 4 순서(server → git push)를 그대로 적는다. Playwright e2e 는 추가 · 실행하지 않는다(admin.spec.ts 의 옛 UI 단언은 261106-lwu 때부터 낡아 있음 — SUMMARY 「후속」).
</verification>

<success_criteria>
- 관리자가 /admin/accounts 계좌 시트에서 예수금 · 수수료 · 매도세를 칸마다 저장하면 그 계좌를 쓰는 모든 사용자의 등록 서버에 반영되고 「<DMA id> · <서버>」 칩 · 다른 값 경고 · 확인 전이 보인다. 연결 없는 계좌는 잠겨 있다.
- KB 계좌 시트에서 주문자 IP/MAC 을 계좌명 · 지점 · 트레이더와 같은 「저장」 으로 모든 사용자에게 맞출 수 있고, 계좌명만 바꾼 저장은 IP/MAC 을 건드리지 않는다.
- 사용자 시트 카드는 이 값들을 읽기만 하고 「편집」 이 없으며, 서버 토글 · 주문 서버 · 연결 해제는 그대로다.
- 사이드바 Admin 하위가 매매손익 · 계좌 · 사용자 · 서버 · 발사이고 relay · DB 는 그대로다.
</success_criteria>

<output>
Create `.planning/quick/261106-ntl-account-costs/261106-ntl-SUMMARY.md` when done (Task 4 배포 순서 · 메인 세션 할 일 · e2e 후속 포함).
</output>
