# Phase 30: 인박스 KB 계좌별 주문자 IP/MAC - Research

**Researched:** 2026-10-11
**Domain:** relay Admin 반영 경로(44/86/87) · Express Admin 프록시 · shared 개요 파생 · webapp Admin 계좌 카드 편집
**Confidence:** HIGH (전 항목을 이번 세션에 코드 원문으로 확인 · gh-trade 서버 정규화 규칙 원문 확인)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 계좌 편집 모양 (목업 채택: `reference/mockup-account-edit.html` 변형 **B**)
- **D-01: 「편집」 → 그 카드가 편집 모드로 펼쳐진다.** 평소 계좌 카드는 지금처럼 읽기 전용(제목줄 = 증권사 · 계좌번호 · 계좌명 + 「편집」 · 「제거」). 「편집」 을 누르면 그 카드 안에 계좌명 입력칸, KB 면 「주문자 IP」·「MAC 주소」 2칸(2열 그리드) + 도움말 한 줄 + 「취소 · 저장」. 한 번에 한 카드만 편집 모드. 편집 중 카드는 강조 테두리.
- **D-02: 계좌명 · IP · MAC 은 「저장」 1회 = PUT 1건(계좌 단위)** — IP/MAC 이 짝(둘 다 적거나 둘 다 비움)이라 칸별 즉시 저장 대신 카드 저장. 서버 체크 토글 · 주문 서버 세그먼트 · 제거의 **즉시 저장(Phase 29 D-15)은 그대로** 둔다. 저장 버튼은 검증 오류가 있거나 바뀐 게 없으면 비활성.
- **D-03: 교보 계좌는 계좌명만 편집** — IP/MAC 칸 대신 「교보 계좌는 주문자 IP · MAC 해당 없음」 한 줄(Phase 29 D-23 ③ 「해당 없음」 동형).
- **D-04: 클라 검증 = 서버 규칙 그대로** — IP 12자리 숫자 또는 a.b.c.d(각 0~255) · MAC 12 hex(`:`·`-` 허용 · 대소문자 무관) · 둘 다 적거나 둘 다 비움. 틀리면 해당 칸 빨간 테두리 + 도움말 자리에 오류 한 줄, 저장 막음. 둘 다 비우고 저장 = 미설정으로 되돌리기(op 3 빈 문자열).
- **D-05: 도움말 한 줄(고정 문구 취지)** — 「같은 서버의 두 계좌가 서로 체결될 수 있으면 계좌마다 서로 다른 사용자 PC 의 IP · MAC 을 적으세요(ipconfig /all).」
- **D-06: 결과 표시** — 성공은 기존 서버 칩(반영됨)으로, 같은 값 재저장은 「변경 없음」, 실패(code 13 BAD_ORDER_ENDPOINT 포함)는 카드 안 오류 줄에 **서버 문구 그대로**(IPMAC-03 · D-23 ④ 동형 · 토스트 없음). 실패 시 편집 모드와 입력값 유지.
- **D-07: 입력 표기는 그대로 보낸다** — 웹은 점표기·콜론 MAC 을 정규화하지 않고 보내고 서버 정규화에 맡긴다. 저장 뒤 표시는 87 의 정규화값(12자리 · 대문자 MAC).

#### 계좌 생성 경로
- **D-08: 「+ 계좌 추가」 폼 · 「+ 사용자」 생성 시트에는 IP/MAC 칸을 넣지 않는다.** IP/MAC 은 만든 뒤 카드 「편집」 에서만(입력 자리 1곳 — 검증·도움말·테스트 한 벌). 새 계좌는 미설정(서버 NIC 값)으로 생긴다.

#### 계좌 카드의 IP/MAC 표시 (KB 만)
- **D-09: 읽기 전용 카드에 한 줄** — 설정됨: 「주문자 IP `010041001124` · MAC `1CFD087D978E`」 / 미설정: 흐린 「주문자 IP · MAC 미설정(서버 NIC 값)」. 지점·트레이더 줄 아래.
- **D-10: 등록 서버 간 87 값 불일치(예: KB120 ≠ KB121)** — 그 계좌의 (유효) 주문 서버 87 값을 보여주고 아래에 경고색 한 줄 「KB121 은 다른 값(…) — 편집에서 저장하면 두 서버가 같아져요」. 편집 칸 초깃값도 주문 서버 값. 저장은 등록 서버 전부에 같은 값을 op 3 으로 보낸다.

#### 공유 계좌 · code 7
- **D-11: 공유 계좌(같은 계좌번호를 다른 DMA 사용자도 보유)는 특별 처리하지 않는다.** 한 사용자 카드에서 IP/MAC 을 바꿔 서버가 code 7 ACCOUNT_CONFLICT 로 거절하면 서버 문구를 그대로 보여주고 끝(일괄 반영 없음).

#### gh-trade 질문 회신 (IPMAC-04 — 인박스 노트에 적고 `status: done` · `done_commit`)
- **D-12: ① code 7 문구 — 「넓혀 달라」.** gh-radar 웹·relay 는 code 7 문장을 대조하지 않는다(서버 message 를 칩/오류 줄에 그대로 표시). 「다른 지점번호/거래자ID/주문자 IP·MAC 으로 보유」 로 넓혀도 gh-radar 쪽 변경 없음 — gh-trade 가 다음 quick 에서 바꾼다.
- **D-13: ② 입력 표기** — 웹은 점표기·콜론을 그대로 보내고 서버 정규화에 맡긴다, 표시는 87 정규화값(D-07).
- **D-14: ③ 사용자 PC IP/MAC 수집** — 사용자가 `ipconfig /all` 값을 보내 주면 운영자가 Admin 카드 편집에 수기 입력하는 절차로 충분.

#### R3-01 (IPMAC-01)
- **D-15: relay 는 op 1/3 을 보내기 직전 그 서버에 op 5(ListUsers)로 87 을 재조회**해 최신 `order_ip`/`order_mac` 으로 계획한다(이번 웹 편집이 IP/MAC 을 실어 보내는 경우는 그 값이 우선 — 기존 planner `withServerEndpoint` 규칙). 배포 확인 뒤 인박스 노트의 「KB 운영 서버 값 설정 보류 권고」를 해제로 적는다.

### Claude's Discretion
- IP/MAC 을 DB 의도에 저장하지 않고 PUT 요청에서 relay planner 로 넘기는 경로 설계(87 이 정본 · DB 변경 없음 제약 안에서)
- 개요(`AdminAccountView`)에 서버별 `orderIp`/`orderMac` 을 싣는 방식 · 불일치 판정 위치(shared 파생 vs 웹)
- 계좌명 빈 값 저장 허용 여부(추가 폼이 「계좌명(선택)」 이면 같게) · 길이 상한
- 편집 중 다른 카드의 「편집」 을 누를 때 동작(현재 카드 취소 후 전환 등) · 「취소」 시 입력 폐기
- op 5 재조회 실패/타임아웃 시 처리(보내지 않고 실패 칩 vs 캐시로 진행) — 단 「relay 밖 값을 지우지 않는다」 가 우선
- 멱등 비교(`sameValues`)에 IP/MAC 을 넣는 방식 — 이미 의도에 값이 있을 때만 비교하는 GC-02 규칙 유지

(UI 쪽 재량 항목 — 계좌명 빈 값 허용 · 40자 · 다른 카드 「편집」 비활성 · 「취소」 폐기 · 「변경 없음」 클라 판정 · 계좌명만 바꾼 저장은 IP/MAC 미적재 · 「확인 전」 — 는 승인된 `30-UI-SPEC.md` 「Claude's Discretion 결정 (UI 항목)」 표에서 이미 결정됐다. 플래너는 그 표를 따른다.)

### Deferred Ideas (OUT OF SCOPE)
- 공유 계좌(같은 계좌번호 · 여러 DMA 사용자) IP/MAC 일괄 반영 — 필요해지면 별도 quick/phase. 지금은 code 7 문구 표시만(D-11).
- 계좌 생성 시 IP/MAC 입력(D-08 에서 제외).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IPMAC-01 | relay 가 op 1/3 직전 op 5 로 87 재조회 → 최신 `order_ip`/`order_mac` 되싣기 (R3-01 해제) | §패턴 1 — `AdminConn.command({op: 5})` 가 이미 `{ result, snapshot }` 으로 풀린다(B9 테스트). dispatcher `#applyServer` 에서 「캐시로 계획 → op 1/3 이 있으면 op 5 → 새 87 로 재계획」. 실패 = 보내지 않음 |
| IPMAC-02 | 웹 IP/MAC 입력칸 · 서버 규칙 그대로 클라 검증 · 87 정규화 표기로 다시 그림 · 멱등 비교 · 도움말 | §패턴 2(PUT 본문 `orderEndpoint` → dispatcher override) · §패턴 3(relay 메모리 87 → Express GET /users 병합 → `AdminAccountView.orderEndpoints`) · §패턴 4(shared 정규화 함수 = gh-trade `NormalizeOrderIp/Mac` 이식) · UI-SPEC |
| IPMAC-03 | 86 code 13 BAD_ORDER_ENDPOINT 서버 문구 그대로 | 이미 `interpretAdminResult` → failed · dispatcher 가 `message` 원문 전달(D15 테스트). 남은 일 = 웹 카드 결과 줄(`EDIT_ERROR_LINE`)에 원문 · 서버/relay 가 형식을 미리 막지 않는다(막으면 code 13 이 도달 불가) |
| IPMAC-04 | gh-trade 질문 3개 회신 · `status: done` · `done_commit` | §IPMAC-04 — code 7 문장 대조 0건 확인(grep) · 노트 형식 정본 `docs/inbox/from-gh-trade/README.md` · 선례 `done_commit` = 처리한 gh-radar 커밋 |
| IPMAC-05 | 기존 계좌 계좌명 편집 → 등록 서버마다 op 3 | 기존 PUT `{ account, servers }` 경로 그대로(RPC `dma_admin_put_account` 가 `ON CONFLICT … DO UPDATE SET name`) · 이름만 바꾼 저장은 `orderEndpoint` 없음 → IPMAC-01 의 op 5 재조회가 서버 IP/MAC 보존 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **커뮤니케이션 · 커밋:** 사용자 대면 문서 · 커밋 메시지는 한글. Co-Authored-By 넣지 않기(전역 CLAUDE.md — 시스템 리마인더의 attribution 보다 사용자 지시가 우선). 커밋은 경로 지정 add(`git add -A` 금지 — 동시 세션 경합 메모리).
- **GSD 워크플로 강제:** 파일 변경은 GSD 명령(`/gsd-execute-phase` 등) 안에서만.
- **배포:** 프론트 Vercel(= `git push` 가 곧 webapp 프로덕션 배포) · 백엔드 Cloud Run(server) · relay 는 GCE VM `radar-gw` 컨테이너. **relay 막히면 push 금지**(메모리 `feedback_deploy_relay_before_push`). 서브에이전트 배포는 분류기 차단 — executor 는 커밋까지, 배포는 메인 세션(메모리).
- **gh-trade 인박스:** 처리하면 노트 `status: done` + `done_commit` 채워 경로 지정 커밋. 형식 정본 `docs/inbox/from-gh-trade/README.md`.
- **Supabase:** 이번 phase 는 DB 변경 없음(로드맵 · CONTEXT 「범위 밖」). 새 마이그레이션 금지.
- **테스트 동시 실행:** 동시 세션이면 vitest `--maxWorkers=2`(각 워크스페이스 config 기본 2) · playwright `--workers=1`(메모리 `project_mac_freeze_concurrent_tests_261010`).
- **dev 포트:** webapp 은 3100(Playwright baseURL `http://localhost:3100`).
- **보안 검사 생략:** `security_enforcement: false`(config) · 메모리 `feedback_no_security_review` — Security Domain 절은 생략한다. 단 「주문자 IP/MAC = 사용자 PC 식별 정보 — 로그 금지」 는 기존 코드 규약이라 지킨다(아래 Pitfall 6).
- **UI:** 목업 B · UI-SPEC 승인본이 정본. 손대는 표면의 줄바꿈 · 잘림 · 겹침 결함은 바로 고친다(메모리).

## Summary

이번 phase 는 네 겹(relay · Express · shared · webapp)을 모두 건드리지만 새 라이브러리는 0개이고, 모든 변경이 기존 Phase 29 패턴의 확장이다. 핵심 발견은 세 가지다.

**① R3-01 수정은 거의 공짜다.** `AdminConn.command({ op: 5, userId: "" })` 는 이미 「86 없이 87 을 응답으로 보고 `{ result, snapshot }` 으로 푸는」 경로가 있고 테스트(B9)도 있다. 따라서 dispatcher `#applyServer` 에서 「캐시 스냅샷으로 먼저 계획 → 계획에 op 1(계좌 포함)·op 3 이 있으면 op 5 로 새 87 을 받아 **새 스냅샷으로 다시 계획**」 하면 된다. op 5 실패(timeout · offline)면 op 1/3 을 보내지 않는다(「relay 밖 값을 지우지 않는다」 우선 — fail closed).

**② 「DB 변경 없음」 제약 때문에 IP/MAC 은 DB 를 지나갈 수 없다 — 쓰기와 읽기 둘 다 우회로가 필요하다.** 쓰기: PUT 본문의 계좌 객체는 relay 에서 RPC `p_account` jsonb 로 통째 넘어가므로(`intent-store.ts:91-95`), IP/MAC 을 `account` 안에 넣지 말고 **본문 최상위 `orderEndpoint: { orderIp, orderMac }`** 로 싣고 relay 라우트가 그것을 `reconcileUser` 의 override 로만 넘긴다. 읽기: 87 적재 표(`dma_server_user_accounts`)에 IP/MAC 열이 없고 `admin_users_raw` 도 싣지 않는다 → 개요에 IP/MAC 을 보이려면 **relay 메모리의 87 캐시**를 새 내부 경로 `GET /internal/admin/order-endpoints` 로 읽어 Express `GET /users` 가 RPC 와 병렬로 받아 `deriveAdminUsersOverview(raw, endpoints)` 에 넘긴다 — `GET /servers` 가 RPC + relay `servers/status` 를 병렬로 받는 선례(`admin-servers.ts:94-118`)와 같은 모양이다.

**③ 배포 순서가 로드맵 문구보다 한 단계 길다.** Express(server) 의 zod 스키마는 모르는 키를 **조용히 버린다**(`z.object` 기본 strip). webapp 만 먼저 나가면 IP/MAC 저장이 서버에서 사라지고 화면은 「반영됨」 을 보인다. 따라서 **relay → server(Cloud Run) → webapp push** 순서다(로드맵은 「relay → webapp」 만 적었다 — 플래너는 server 배포 단계를 넣어야 한다).

**Primary recommendation:** dispatcher 「재계획」 방식으로 R3-01 을 닫고, IP/MAC 은 PUT 최상위 `orderEndpoint` override(쓰기) + relay 87 캐시 읽기 경로(표시)로 DB 를 우회하며, 정규화 · 검증 · 불일치 판정은 shared 순수 함수 한 벌(gh-trade `AccountUtil.h` 이식)에 둔다. 배포는 relay → server → webapp.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 87 신선도 보장(op 1/3 직전 op 5 재조회) — IPMAC-01 | relay (`AdminDispatcher`) | relay (`AdminConn` FIFO) | 87 을 받는 연결 · 계획기가 relay 에만 있다. Express 는 결과 배열만 본다 |
| IP/MAC 쓰기 경로(PUT → op 3) | relay (admin-api 라우트 → dispatcher override) | Express(스키마 통과 · 구조 검증) | 87 이 정본 · DB 의도에 저장하지 않는다(DB 변경 없음) |
| IP/MAC 형식 판정(정본) | gh-trade 서버(code 13) | 웹(같은 규칙 사전 검증) | D-04 · D-07 — 서버 규칙이 정본, 웹은 미리 막기만. Express/relay 는 형식을 보지 않는다 |
| 서버별 IP/MAC 표시 데이터 | relay (87 메모리 캐시 → 내부 GET) | Express(GET /users 병렬 병합) · shared(파생) | DB 에 열이 없다 — relay 메모리만이 원천 |
| 정규화 · 불일치(D-10) · 표시 출처 판정 | shared(순수 함수) | webapp(그리기) | 테스트 가능한 한 벌 · `resolveEffectiveOrderServer` 와 같은 자리 |
| 편집 모드 · 검증 UI · 결과 줄 | webapp (`account-editor.tsx`) | — | UI-SPEC 계약 |
| 계좌명 변경 저장(IPMAC-05) | Express → relay → RPC `dma_admin_put_account` + op 3 | — | 기존 PUT 경로 그대로 |
| 인박스 회신(IPMAC-04) | 문서(`docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md`) | — | 형식 정본 README |

## Standard Stack

새 패키지 없음. 기존 스택만 쓴다.

### Core (기존 · 이번 세션 확인)
| Library | Version | Purpose | 근거 |
|---------|---------|---------|------|
| zod | `^4.0.0` (relay) | relay 내부 HTTP 본문 검증 | [VERIFIED: relay/package.json] |
| vitest | `^4.1.4` (relay) | relay · shared · server · webapp 단위 테스트 | [VERIFIED: relay/package.json] |
| flatbuffers | `^25.9.23` | 44/86/87 코덱(변경 없음 — 슬롯 14/16 이미 반영) | [VERIFIED: relay/package.json · envelope.ts:3253-3270] |
| @playwright/test | `^1.59.1` | webapp E2E(목 API) | [VERIFIED: webapp/package.json] |
| shadcn Button · Input | 기존 설치 | 편집 칸 · 버튼 | [CITED: 30-UI-SPEC.md Component Inventory] |

**Installation:** 없음.

## Package Legitimacy Audit

이번 phase 는 외부 패키지를 설치하지 않는다.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (없음) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
[쓰기 — 카드 「저장」 1회]
 webapp AccountRow(편집 모드)
   │ 클라 검증(shared normalizeOrderIp/Mac) · 「변경 없음」 이면 요청 없음
   ▼ PUT /api/admin/dma-users/:dma/accounts
     { account: {broker,accountNo,name,branchNo,traderId,priority}, servers:[active…], orderEndpoint?: {orderIp, orderMac} }
 Express adminRouter (zod: orderEndpoint 구조만 · KB 만 · 형식 검사 없음)
   ▼ relay PUT /internal/admin/dma-users/:dma/accounts
 relay admin-api 라우트
   ├─► store.putAccount(dma, account, servers)   ── RPC dma_admin_put_account (IP/MAC 은 싣지 않는다)
   └─► dispatcher.reconcileUser(dma, { orderEndpoint: {broker, accountNo, orderIp, orderMac} })
          │ 서버마다 병렬 · 유저별 #serial
          ▼ #applyServer(serverKey)
          ① 캐시 87(currentSnapshot) 로 계획 ──(op 1/3 없음)──► 그대로 진행(op 2/4 · 0건)
          │(op 1/3 있음)
          ② admin.command({op:5}) ──timeout/offline──► 결과 timeout/offline · 44 미송신(fail closed)
          │ 새 87
          ③ 새 87 로 재계획: 의도 행 + override(그 계좌만 orderIp/orderMac) → planServerOps
          │   withServerEndpoint: override 쌍 > 새 87 값 > ""
          ▼ op 1/3/4 순차 → 86(code 0 · 13 · 7 · 9 …) → 87 → 캐시 갱신 + "snapshot" 이벤트(→ DB 반영 상태 · 라우팅)
   ◄── { results: [{server, outcome, code?, message?}] }
 webapp: ok → 칩 「반영됨」 · 편집 닫힘 · onChanged 재조회 / failed → 카드 결과 줄에 message 원문 · 편집 유지

[읽기 — 개요]
 webapp fetchAdminUsers ─► Express GET /api/admin/users
     ├─ RPC admin_users_raw (DB: 의도 · 87 반영 상태 — IP/MAC 없음)
     └─ relay GET /internal/admin/order-endpoints (병렬 · 실패 = null)
           └ 서버마다 AdminConn.currentSnapshot() → [{dmaUserId, accountNo, orderIp, orderMac}]
   ▼ shared deriveAdminUsersOverview(raw, endpoints)
     AdminAccountView.orderEndpoints = { [serverKey]: {orderIp, orderMac} | null(모름) }
   ▼ webapp: shared summarizeOrderEndpoint(account, registry) → 표시값 · 출처 서버 · 불일치 줄(D-10)
```

### 파일별 변경 지도

| 파일 | 바꿀 것 |
|------|--------|
| `packages/shared/src/order-endpoint.ts` (신규) + `index.ts` export | `normalizeOrderIp` · `normalizeOrderMac`(gh-trade 이식) · `validateOrderEndpointInput`(UI 오류 종류) · `summarizeOrderEndpoint`(표시 · 출처 · 불일치) |
| `packages/shared/src/admin.ts` | `AdminPutAccountBody.orderEndpoint?` · `AdminAccountView.orderEndpoints?` · `AdminOrderEndpointsRaw` 타입 · `deriveAdminUsersOverview(raw, endpoints?)` · (선택) `sameValues` 정규화 비교 |
| `relay/src/admin/dispatcher.ts` | `AdminConnLike` 그대로(`command` 로 op 5) · `#applyServer` 재계획 · `reconcileUser` 옵션 `orderEndpoint` |
| `relay/src/admin/admin-api.ts` | `PutAccountBody` 에 `orderEndpoint` · KB 만 · `GET /order-endpoints` · deps `pipelines` 타입에 `currentSnapshot` |
| `server/src/schemas/admin.ts` · `server/src/routes/admin.ts` · `server/src/services/relay-admin-client.ts` | `AdminPutAccountSchema` 에 `orderEndpoint` · GET /users 병렬 relay 읽기 · `orderEndpoints()` 클라이언트 메서드 |
| `webapp/src/components/admin/account-editor.tsx` | 편집 모드 · IP/MAC 읽기 줄 · 불일치 줄 · 결과 줄 · 「편집」 버튼 · 한 카드 잠금(부모 상태) |
| `webapp/e2e/fixtures/admin.ts` · `webapp/e2e/specs/admin.spec.ts` | 픽스처에 `orderEndpoints` · PUT 본문 기록 · P30 시나리오 |
| `docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md` | 질문 3개 답 · 보류 권고 해제 · `status: done` · `done_commit` |

### Pattern 1: R3-01 — 「캐시로 계획 → op 1/3 있으면 op 5 → 새 87 로 재계획」 (IPMAC-01)

**What:** 87 재조회를 「필요할 때만」 한다. 계획이 op 1(계좌 포함)·op 3 을 포함할 때만 op 5 를 보내고, 받은 87 로 계획을 **처음부터 다시** 만든다(재계획 결과가 op 3 을 없애도 그대로 따른다).

**근거(이번 세션 Read):**
- 지금 계획은 캐시로만 한다 — `relay/src/admin/dispatcher.ts:279-283` 원문:
  ```ts
  const admin = this.#deps.pipelines.get(serverKey)?.admin;
  const snapshot = admin?.currentSnapshot() ?? null;
  if (admin === undefined || snapshot === null) return { server: serverKey, outcome: "offline" };
  const p = plan(snapshot);
  ```
  [VERIFIED: relay/src/admin/dispatcher.ts:279-283]
- op 5 를 `command()` 로 부르면 87 을 응답으로 푼다 — `admin-conn.ts:41` 「op 5 를 `command()` 로 부르면 86 이 없으므로 87 을 응답으로 보고 `{ result(합성 · code 0 · 그 87 의 rev), snapshot }` 으로 푼다.」 · `#pump` 의 `awaiting: next.input.op === ADMIN_OP.ListUsers ? "snapshot" : "resp"`(:521) · 응답 상한 `ADMIN_COMMAND_TIMEOUT_MS = 5_000`(:82). [VERIFIED: relay/src/admin/admin-conn.ts:41, 82, 521] · 테스트 B9 「command(op 5) → 86 없이 87 이 응답」 [VERIFIED: relay/tests/admin-conn.test.ts:406-415]
- `AdminConnLike = Pick<AdminConn, "currentSnapshot" | "command">` [VERIFIED: dispatcher.ts:47] — 새 메서드 없이 `command` 로 된다.
- `ADMIN_OP.ListUsers: 5` [VERIFIED: relay/src/admin/types.ts:26-32 — `UpsertUser: 1, DeleteUser: 2, SetAccount: 3, RemoveAccount: 4, ListUsers: 5`]

**Example (권고 골격):**
```ts
// relay/src/admin/dispatcher.ts — #applyServer 안
const admin = this.#deps.pipelines.get(serverKey)?.admin;
const cached = admin?.currentSnapshot() ?? null;
if (admin === undefined || cached === null) return { server: serverKey, outcome: "offline" };
let snapshot = cached;
let p = plan(snapshot);
if (p.status === "no-snapshot") return { server: serverKey, outcome: "offline" };
// IPMAC-01(R3-01): op 1(계좌) · op 3 은 87 의 주문자 IP/MAC 을 되싣는다 — relay 밖 변경은 캐시에 없으므로 보내기 직전 새로 받는다.
if (p.ops.some((op) => op.op === 3 || (op.op === 1 && !("passwordOnly" in op)))) {
  const fresh = await admin.command({ op: ADMIN_OP.ListUsers, userId: "" });
  if (fresh.kind !== "result" || fresh.snapshot === undefined) {
    // 새 87 없이 op 1/3 을 보내면 relay 밖 값을 지울 수 있다 — 보내지 않는다(fail closed).
    return { server: serverKey, outcome: fresh.kind === "timeout" ? "timeout" : "offline" };
  }
  snapshot = fresh.snapshot;
  p = plan(snapshot);
  if (p.status === "no-snapshot") return { server: serverKey, outcome: "offline" };
}
let usersRev = snapshot.usersRev.toString();
// …이하 기존 op 루프 그대로
```
- 비밀번호 경로(`planPasswordOps`)는 `{ op: 1, passwordOnly: true }` 만 만들므로 op 5 를 타지 않는다(계좌 없음 → 서버가 account 무시 · `types.ts:20`).
- 유저 삭제 경로는 op 2/4 만 만든다 → op 5 없음.
- `fresh.kind === "result"` 인데 `snapshot` 이 없는 경우는 op 5 경로상 생기지 않지만(87 대기 중 끊김은 `f.result === null` 이라 offline), 방어적으로 offline 처리.

**보조:** op 5 의 87 도 `#onSnapshot` 을 지나 캐시 교체 + `"snapshot"` 이벤트(→ `AdminSnapshotSink` DB 반영 상태 · 라우팅 매핑 교체)를 낸다 — 무해하고 오히려 표시가 신선해진다 [VERIFIED: admin-conn.ts:428-442].

### Pattern 2: IP/MAC 쓰기 — PUT 최상위 `orderEndpoint` → dispatcher override (IPMAC-02 · D-07 · D-10)

**What:** 웹 PUT 본문에 `orderEndpoint?: { orderIp: string; orderMac: string }` 를 **계좌 객체 밖**에 싣는다. relay 라우트는 `store.putAccount` 에는 계좌만, `dispatcher.reconcileUser` 에는 `{ broker, accountNo, ...orderEndpoint }` override 를 넘긴다. dispatcher 는 의도 행 중 그 계좌(정규화 번호 · active)에 `orderIp/orderMac` 을 얹어 `planServerOps` 에 넘긴다 — planner 는 이미 「의도 행에 값이 있으면 옮긴다」.

**왜 계좌 객체 밖인가(근거):**
- relay `putAccount` 는 계좌 객체를 RPC jsonb 로 통째 넘긴다: `p_account: account` [VERIFIED: relay/src/admin/intent-store.ts:91-95]. RPC 는 지정 키만 읽어 무해하지만(`coalesce(p_account ->> 'name', '')` 등 — [VERIFIED: supabase/migrations/20261006200200_dma_admin_intent_rpcs.sql:187-197]) 사용자 PC 식별 정보를 DB 왕복에 싣지 않는 편이 규약(「사용자 PC 식별 정보 — 로그 금지」 — `shared/src/admin.ts:97-100`)에 맞다.
- 구조 검증(둘 다 있음)을 `z.object({ orderIp, orderMac })` 하나로 표현할 수 있다 — 한 키만 오면 400.
- 기존 「서버 토글」 PUT 은 `orderEndpoint` 를 싣지 않으므로 의미가 바뀌지 않는다(IP/MAC 은 새 87 에서 보존).

**planner 는 고칠 필요가 거의 없다(근거):**
```ts
function fieldsOf(r: AdminIntentRow): AdminAccountFields {
  return { accountNo: r.accountNo, name: r.name, branchNo: r.branchNo, traderId: r.traderId, priority: r.priority,
    // 지금 DB 의도는 두 필드가 없다 — 있을 때만 옮긴다(없음 = 87 값 보존).
    ...(r.orderIp !== undefined ? { orderIp: r.orderIp } : {}),
    ...(r.orderMac !== undefined ? { orderMac: r.orderMac } : {}),
  };
}
function withServerEndpoint(account: AdminAccountFields, snap: AdminAccountFields | undefined): AdminAccountFields {
  const src = account.orderIp !== undefined || account.orderMac !== undefined ? account : snap;
  return { ...account, orderIp: src?.orderIp ?? "", orderMac: src?.orderMac ?? "" };
}
```
[VERIFIED: relay/src/admin/planner.ts:63-83]. `AdminIntentRow extends AdminAccountFields` 이고 `AdminAccountFields` 에 `orderIp?` · `orderMac?` 가 이미 있다 [VERIFIED: packages/shared/src/admin.ts:87-116].

**Example (dispatcher override):**
```ts
// reconcileUser(dmaUserId, opts: { password?; adminEmail; deadlineAt?; orderEndpoint?: OrderEndpointOverride })
type OrderEndpointOverride = { broker: DmaBroker; accountNo: string; orderIp: string; orderMac: string };
const intent = await this.#deps.store.intent(dmaUserId);
const withEndpoint = opts.orderEndpoint === undefined ? intent : intent.map((r) =>
  r.state === "active" && r.broker === opts.orderEndpoint!.broker &&
  normalizeAccountNo(r.accountNo) === normalizeAccountNo(opts.orderEndpoint!.accountNo)
    ? { ...r, orderIp: opts.orderEndpoint!.orderIp, orderMac: opts.orderEndpoint!.orderMac }
    : r);
// 이후 planServerOps({ dmaUserId, serverKey, intent: withEndpoint, snapshot }) — 등록 서버 전부(D-10 「모두 같은 값」)
```
- override 는 이 요청의 메모리에만 산다(DB 저장 없음). 실패 뒤 「다시 반영」 은 IP/MAC 을 다시 보내지 않는다 — 87 이 정본이고, 웹은 실패 시 편집 모드 · 입력값을 유지하므로(D-06) 사용자가 다시 「저장」 한다.
- 빈 문자열 2개 = 「미설정으로 되돌리기」(D-04 · gh-trade 「비우기」) — `withServerEndpoint` 가 의도 쌍을 그대로 싣는다.

**멱등 비교(`sameValues`) — GC-02 유지 + 정규화(권고):**
지금 규칙 원문 [VERIFIED: packages/shared/src/admin.ts:409-418]:
```ts
(intent.orderIp === undefined || intent.orderIp === (snap.orderIp ?? "")) &&
(intent.orderMac === undefined || intent.orderMac === (snap.orderMac ?? ""))
```
override 로 원문 `10.41.1.124` 가 오면 87 의 `010041001124` 와 문자열이 달라 op 3 이 나가고, 서버가 정규화 비교로 code 0 「변경 없음」 · rev 불변으로 답한다(gh-trade `Gateway.cpp` `comparable` — 아래 Pattern 4) → 결과 ok. **틀리지 않는다.** 그래도 「의도 값이 정규화에 성공하면 정규화값으로, 실패하면 원문으로」 비교하도록 `sameValues` 를 바꾸면 이미 같은 서버(D-10 에서 일치하는 쪽)에 op 3 을 보내지 않는다. gh-trade 와 같은 규칙(실패 = 원문 비교 → 다르다 → op 3 → code 13 도달)이라 IPMAC-03 경로를 막지 않는다. **권고: 정규화 비교로 바꾼다**(`undefined` 면 비교 제외 규칙은 그대로 — GC-02).

### Pattern 3: IP/MAC 읽기 — relay 87 캐시 → Express GET /users 병렬 병합 (IPMAC-02 표시 · D-09 · D-10)

**문제(근거):** 87 반영 상태 표에 IP/MAC 열이 없다:
```sql
CREATE TABLE IF NOT EXISTS public.dma_server_user_accounts (
  server_key  text NOT NULL …, dma_user_id text NOT NULL, account_no text NOT NULL,
  name text NOT NULL DEFAULT '', branch_no text NOT NULL DEFAULT '', trader_id text NOT NULL DEFAULT '',
  priority integer NOT NULL DEFAULT 0, PRIMARY KEY (server_key, dma_user_id, account_no));
```
[VERIFIED: supabase/migrations/20261006200300_dma_admin_reflect.sql:44-53] · relay 적재기도 5필드만 보낸다 — `accounts.push({ accountNo: a.accountNo, name: a.name, branchNo: a.branchNo, traderId: a.traderId, priority: a.priority })` [VERIFIED: relay/src/admin/snapshot-sink.ts:112] · `admin_users_raw` 의 `snapshotAccounts` 도 7키(`serverKey · dmaUserId · accountNo · name · branchNo · traderId · priority`)뿐 [VERIFIED: supabase/migrations/20261010200100_dma_account_order_server.sql:321-332]. → DB 변경 없이는 DB 로 표시할 수 없다.

**해법 — 선례 그대로:** Express `GET /servers` 가 `Promise.all([supabase.rpc("admin_servers_raw"), fetchLiveStatus(req)])` 로 relay `GET /internal/admin/servers/status` 를 병렬로 받고, relay 실패면 `null` 로 200 을 유지한 채 `deriveAdminServersOverview(raw, live)` 에 넘긴다 [VERIFIED: server/src/routes/admin-servers.ts:94-118]. `GET /users` 도 같은 모양으로:

```ts
// server/src/routes/admin.ts — GET /users
const [{ data, error }, endpoints] = await Promise.all([supabase.rpc("admin_users_raw"), fetchOrderEndpoints(req)]);
…
res.json(deriveAdminUsersOverview(data as AdminUsersRaw, endpoints)); // endpoints null = 전부 「확인 전」
```

relay 새 경로(메모리만 읽는다 · 44 없음):
```ts
// relay/src/admin/admin-api.ts
router.get("/order-endpoints", (_req, res) => {
  const servers: Record<string, { dmaUserId: string; accountNo: string; orderIp: string; orderMac: string }[]> = {};
  for (const row of deps.registry.all()) {
    if (!row.enabled) continue;
    const snap = deps.pipelines.get(row.key)?.admin.currentSnapshot() ?? null;
    if (snap === null) continue;                    // 키 없음 = 그 서버 87 모름(「확인 전」)
    servers[row.key] = snap.users.flatMap((u) => u.accounts.map((a) => ({
      dmaUserId: u.userId, accountNo: a.accountNo, orderIp: a.orderIp ?? "", orderMac: a.orderMac ?? "" })));
  }
  res.status(200).json({ servers });              // 감사 · 로그에 값 싣지 않는다
});
```
- `AdminApiDeps.pipelines` 타입은 지금 `admin: { health(): … }` 만 있다 [VERIFIED: admin-api.ts:78-80] — `currentSnapshot(): AdminUsersSnapshot | null` 을 더한다(실객체 `ServerPipelines` 는 이미 만족 — `index.ts` 가 같은 `pipelines` 를 dispatcher 에도 넘긴다 [VERIFIED: relay/src/index.ts:521-543]).
- 계좌 존재를 같이 싣는 이유: 「그 서버 87 은 아는데 이 계좌는 아직 없음」 을 「미설정」 과 가르기 위해(UI-SPEC §1-3 「87 미확인」 = 「확인 전」).

**shared 파생:** `AdminAccountView` 에 `orderEndpoints?: Record<string, { orderIp: string; orderMac: string } | null>`(키 = 그 계좌의 active 등록 서버 · null = 그 서버 87 에 이 계좌가 없거나 서버를 모름 · `""` = 미설정)를 싣는다. `deriveAdminUsersOverview(raw, endpoints?: AdminOrderEndpointsRaw | null)` 두 번째 인자는 선택(기존 호출 · 픽스처 호환 — `orderServer?` 를 선택 필드로 더한 29-37 선례와 같다 [VERIFIED: admin.ts:185-191]). 키 비교는 `normalizeAccountNo` 로.

**표시 · 불일치 판정은 shared 순수 함수(권고):** `summarizeOrderEndpoint({ account, registry })` →
`{ state: "set" | "unset" | "unknown"; orderIp; orderMac; source: string | null; mismatches: { serverKey; state: "set" | "unset"; orderIp; orderMac }[] }`.
- 출처 = `resolveEffectiveOrderServer({ designated, defaultKey, registered })`(웹 `OrderServerControl` 이 쓰는 것과 같은 입력 구성 — `account-editor.tsx:469-483`) 의 key, 없으면 레지스트리 순 첫 active 등록 서버(UI-SPEC §1-3). 출처 값을 모르면 값을 아는 첫 active 서버로 내려가고, 어느 서버도 모르면 `unknown`(「확인 전」).
- 불일치 = 값을 아는 다른 active 서버 중 출처와 다른 것(정규화 87 값이라 문자열 비교 · 모르는 서버는 비교 안 함).
- `resolveEffectiveOrderServer` 시그니처 원문: `const { designated, defaultKey, registered, defaultUnknown } = input;` [VERIFIED: packages/shared/src/order-server.ts:35-44].

**신선도 한계(알고 쓰는 것):** relay 캐시는 접속 때 · relay 자신의 변경 뒤 · (이번 phase 부터) op 1/3 직전 op 5 때 새로워진다. gh-trade 는 87 을 「요청 연결에만」 보내므로 relay 밖 도구로 바꾼 값은 다음 갱신 전까지 화면에 옛 값으로 보인다(R3-01 원문 근거). **데이터 손실은 없다**(쓰기는 새 87 로 계획) — 표시만 늦다. Pitfall 5 참고.

### Pattern 4: 정규화 · 검증 — gh-trade `AccountUtil.h` 이식 (D-04 · D-07)

gh-trade 원문 규칙(이번 세션 Read — `~/repos/gh-trade/server/src/broker/base/AccountUtil.h:42-131`) [VERIFIED: gh-trade AccountUtil.h]:
- `NormalizeOrderIp`: 빈 입력 → `""`(미설정) · **정확히 12자리 숫자면 그대로**(옥텟 범위 검사 없음) · `a.b.c.d` 각 1~3자리 · 0~255 · 빈 옥텟 · 꼬리 문자 · 옥텟 4개 초과/미만 실패 → `%03d` 네 개 이어 12자리 · 그 외 `""`(= 실패).
- `NormalizeOrderMac`: 빈 입력 → `""` · `:` `-` 는 위치 · 개수 무관 건너뜀 · 나머지가 정확히 12자 16진이면 대문자 · 그 외 `""`.
- **서버는 trim 하지 않는다** — `" 10.41.1.124"` 는 실패(code 13). 웹이 보내기 전에 trim 한다(UI-SPEC §3 「입력 원문(trim)」).
- 짝 규칙: `if (a.orderIp.empty() != a.orderMac.empty()) return fail(UsersReject::OrderEndpoint …)` · 둘 다 있으면 정규화 후 길이 12 가 아니면 실패 [VERIFIED: gh-trade Config.cpp:1155-1166]. KB 만 형식 검사(`kbFields`), 교보는 형식을 보지 않는다.
- op 3 멱등: 「정규화가 실패한 값(형식 오류)은 원문 그대로 비교한다 — 빈 문자열로 바꾸면 미설정 계좌와 같아 보여 code 13 대신 「변경 없음」 이 나간다」 [VERIFIED: gh-trade Gateway.cpp:1846-1856].
- code 13 문구 원문: 「주문자 IP/MAC 형식 오류 — IP 는 12자리 숫자 또는 a.b.c.d, MAC 은 12자리 16진, 둘 다 적거나 둘 다 비워야 합니다」 [VERIFIED: gh-trade AdminProto.cpp:24-25]. code 7 원문: 「다른 사용자가 같은 계좌를 다른 지점번호/거래자ID 로 보유하고 있습니다」 [VERIFIED: gh-trade AdminProto.cpp:18].

**shared 이식 골격:**
```ts
// packages/shared/src/order-endpoint.ts — gh-trade AccountUtil.h NormalizeOrderIp/Mac 과 같은 규칙(trim 하지 않는다 — 호출자가 한다)
/** "" = 빈 입력(미설정) · null = 형식 오류 · 그 밖 = 12자리 숫자. */
export function normalizeOrderIp(raw: string): string | null {
  if (raw === "") return "";
  if (/^\d{12}$/.test(raw)) return raw;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(raw);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some((v) => v > 255)) return null;
  return o.map((v) => String(v).padStart(3, "0")).join("");
}
/** "" = 빈 입력 · null = 형식 오류 · 그 밖 = 대문자 12자리 16진. */
export function normalizeOrderMac(raw: string): string | null {
  if (raw === "") return "";
  const hex = raw.replace(/[:-]/g, "");
  return /^[0-9A-Fa-f]{12}$/.test(hex) ? hex.toUpperCase() : null;
}
```
- `\d` 는 JS 정규식에서 ASCII 0-9 만이다(유니코드 플래그 없음) — gh-trade 의 `'0'..'9'` 와 같다.
- 구분자만 있는 입력(`"::"`)은 hex 가 빈 문자열 → 12자 아님 → null(gh-trade 「구분자만 있는 입력도 여기서 실패」 와 같다).
- 웹 오류 우선순위 · 문구는 UI-SPEC §3 (IP → MAC → 짝 · 「비어 있는 칸」 에 `aria-invalid`).

### Pattern 5: 웹 편집 모드 — 부모가 「편집 중인 카드」 하나를 쥔다 (D-01 · UI-SPEC §5)

- `AccountEditor` 에 `editingKey: string | null` 상태를 두고 `AccountRow` 에 `editing` · `editLocked`(다른 카드 편집 중) · `onEditStart/onEditEnd` 를 내린다. 다른 카드 「편집」 은 `disabled` + `title="다른 계좌 편집 중"`.
- 초깃값은 편집을 연 순간 고정(재조회가 덮지 않게 — UI-SPEC §5) → 열 때 `useState` 초기화, 이후 props 변화 무시.
- 저장은 `useFieldSave<AdminPutAccountBody>(…, { retainValue: false })` 1개. **주의:** `useFieldSave` 의 `onSuccess` 는 HTTP 성공이면 서버 일부 실패에도 불린다 [VERIFIED: use-field-save.ts:17-18 「서버 일부 실패도 HTTP 성공이다」] → `res.results` 를 보고 전부 ok 일 때만 편집을 닫는다.
- 결과 칩은 기존 `onResults(accountKey, results)` 덮개로 → 칩 「반영됨」/err. 단 UI-SPEC §4 「같은 실패가 카드 결과 줄과 영역 하단 `BusyLines` 에 두 번 나오지 않는다」 — 지금 `shownChips` 는 덮개 칩 전부를 `BusyLines` 로 보낸다 [VERIFIED: account-editor.tsx:817-827] → 덮개 항목에 출처 표시(예: `ChipView` 에 `source?: "edit"`)를 두고 `shownChips` 에서 거른다.
- 성공 flash: 지금 `ROW_FLASH` 는 `toggle.state === "flash"` 에만 걸린다(:394) → 편집 저장 flash 도 OR.
- 포커스: 열면 「계좌명」 `autoFocus`, 닫히면 그 카드 「편집」 버튼으로(ref).

### Anti-Patterns to Avoid
- **IP/MAC 을 DB 의도(`dma_account_servers`)에 저장:** 로드맵 「DB 변경 없음」 위반이고, 87 정본 원칙과 「서버 값 보존」(GC-02)을 깬다.
- **Express · relay 가 IP/MAC 형식을 검증:** 그러면 code 13 이 도달하지 않아 IPMAC-03 이 검증 불가가 되고, 규칙이 세 곳으로 갈라진다. 구조(두 키 · 문자열 · 길이 상한)만 본다.
- **op 5 실패 때 캐시로 진행:** R3-01 을 그대로 되살린다. fail closed.
- **매 반영마다 무조건 op 5:** 비밀번호 · 삭제 · 무변경 reconcile 에도 왕복이 붙는다. op 1/3 이 있을 때만.
- **웹이 IP/MAC 을 정규화해서 전송:** D-07 위반. 정규화는 「변경 없음」 판정 · 비교에만 쓴다.
- **로그 · 감사 줄에 IP/MAC 값:** 기존 규약 위반. 감사에는 `orderEndpoint: "set" | "clear"` 정도의 플래그만.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| op 5 송신 · 87 짝짓기 · 타임아웃 | dispatcher 안 별도 소켓/대기 로직 | `AdminConn.command({ op: ADMIN_OP.ListUsers, userId: "" })` | FIFO 1건 비행 · request_id · 5초 상한 · 끊김 처리가 이미 있다(B9) |
| 유효 주문 서버 판정 | 웹 전용 if 사슬 | shared `resolveEffectiveOrderServer` | relay 라우팅과 한 벌(GC-06) |
| 저장 1건 · 결과 칩 · HTTP 오류 문구 | 새 훅 | `useFieldSave` · `chipOfResult` · `defaultSaveErrorText` | UI-SPEC 이 같은 문구 · 동작을 요구 |
| 정규화 규칙 | 웹 · relay 각자 정규식 | shared `normalizeOrderIp/Mac` 한 벌(gh-trade 이식 + 같은 표본 테스트) | 규칙이 갈라지면 「변경 없음」 오판 · code 13 혼동 |
| 개요 + relay 상태 병합 | 새 API 엔드포인트 | `GET /users` 안 `Promise.all` + 파생 2번째 인자 | `GET /servers` 선례 · 화면 요청 수 그대로 |

**Key insight:** 이 phase 의 어려움은 「새 기능」 이 아니라 「87 이 정본인데 DB 를 못 바꾼다」 는 제약이다. 쓰기는 요청 메모리(override)로, 읽기는 relay 메모리(캐시)로 87 에 직접 닿게 하면 DB 를 건드릴 일이 없다.

## Common Pitfalls

### Pitfall 1: Express 스키마가 `orderEndpoint` 를 조용히 버린다 — 배포 순서
**What goes wrong:** webapp 이 server 보다 먼저 나가면 IP/MAC 저장이 「반영됨」 으로 보이지만 실제로는 아무것도 바뀌지 않는다.
**Why:** `AdminPutAccountSchema = z.object({ account: AdminAccountInputSchema, servers: ServerListSchema })` [VERIFIED: server/src/schemas/admin.ts — `AdminPutAccountSchema`] 와 relay `PutAccountBody = z.object({ account: AccountSchema, servers: ServersSchema })` [VERIFIED: relay/src/admin/admin-api.ts:168] 는 zod 기본 strip 이라 모르는 키를 지운다.
**How to avoid:** 배포 순서 **relay → server(Cloud Run · `scripts/deploy-server.sh`) → webapp push**. 각 단계 뒤 확인(아래 배포 절). server 단계를 빠뜨리지 않는다(로드맵 문구에는 없다).
**Warning signs:** IP/MAC 저장 뒤 relay 로그에 op 3 이 없거나(「변경 없음」 판정) 87 이 그대로.

### Pitfall 2: shared 는 `dist` 로 소비된다 — 빌드 전 테스트 · 타입체크가 옛 타입을 본다
**Why:** `"main": "./dist/index.cjs"` · `"types": "./dist/index.d.ts"` [VERIFIED: packages/shared/package.json:6-19]. config `build_command` 도 `pnpm --filter @gh-radar/shared build && …` 로 시작한다 [VERIFIED: .planning/config.json].
**How to avoid:** shared 를 고친 태스크는 끝에 `pnpm --filter @gh-radar/shared build` 를 돌리고, relay/server/webapp 테스트는 그 뒤에.

### Pitfall 3: 기존 dispatcher 테스트가 `sent` 를 정확히 단언한다 — op 5 가 끼면 대량 실패
**Why:** `FakeConn.command` 는 모든 입력을 `sent` 에 넣고(`this.sent.push(structuredClone(input))`), op 5 는 `defaultAdminHandler` 가 `{ snapshot }` 만 돌려 `reply?.resp === undefined` → **timeout** 으로 푼다 [VERIFIED: relay/tests/admin-dispatcher.test.ts:120-131 · relay/tests/helpers/fake-gateway.ts:980]. 그대로 두면 op 1/3 을 내는 모든 테스트가 timeout 이 된다.
**How to avoid:** `FakeConn.command` 에 op 5 분기 — `sent` 에 넣지 않고 `refreshes` 카운터를 올리고 `{ kind: "result", result: { code 0 · usersRev: state.usersRev }, snapshot: snapshotOf(this.state) }` 를 돌려주며 `#snapshot` 도 갈아 끼운다. `mode` 가 timeout/offline 이면 op 5 도 그 결과(fail closed 테스트). R3-01 회귀 테스트는 `state`(서버)만 바꾸고 캐시(`#snapshot`)는 그대로 둔 채 reconcile 해 op 3 이 새 값을 싣는지 본다.

### Pitfall 4: 편집 저장과 서버 토글의 경합 — 토글 PUT 이 옛 계좌명으로 되돌린다
**What goes wrong:** 계좌명 저장 성공 직후 · 재조회 도착 전에 서버 토글을 누르면, 토글 PUT 은 `accountInputOf(account)`(개요의 **옛 이름**)를 실어 DB 이름과 op 3 을 되돌린다 [VERIFIED: account-editor.tsx:240-249, 343-345].
**How to avoid:** 토글 PUT 의 이름을 「마지막으로 저장한 이름 ?? 개요 이름」 으로(편집 저장 훅에 `releaseOn: account` 를 주고 성공 값을 재조회 전까지 쥔다), 또는 편집 저장 비행 중에는 토글을 막는다. 권고: 전자(UI-SPEC §5 「편집 중 토글 그대로 동작」 을 지킨다).

### Pitfall 5: relay 캐시가 relay 밖 변경을 모르면 「변경 없음」 오판
**What goes wrong:** gh-trade 도구로 IP 를 Y 로 바꾼 뒤 화면은 캐시의 X 를 보인다. 사용자가 X 를 다시 적으면 웹이 「변경 없음」 으로 요청을 보내지 않는다(UI-SPEC §4).
**Why:** 87 은 「요청 연결에만」 간다(R3-01 원문). 이번 phase 의 op 5 재조회는 **쓰기 직전**에만 일어난다.
**How to avoid:** 운영 절차상 IP/MAC 은 웹에서만 넣는다(D-14). 인박스 회신에 「relay 밖 도구로 값을 바꿨다면 웹 표시는 다음 웹 저장 · relay 재접속까지 옛 값」 한 줄을 남긴다. 필요하면 후속으로 gh-trade 에 「admin 변경 뒤 87 을 모든 admin 연결에 Notice」 인계(R3-01 리뷰가 제안한 보조 수단 — 이번 범위 밖).
**Warning signs:** 화면 값 ≠ gh-trade 도구 값.

### Pitfall 6: IP/MAC 이 로그 · 감사 · 오류 문구에 실린다
**Why:** 기존 규약 「사용자 PC 식별 정보 — 로그 금지」 [VERIFIED: shared/src/admin.ts:97-100 · relay/src/admin/types.ts:92-99]. Express `audit()` 는 `extra` 를 그대로 로그에 싣고 [VERIFIED: server/src/routes/admin.ts:155-160], relay zod 오류 문구는 입력값을 싣지 않는 규약이다.
**How to avoid:** 감사 `extra` 에 값 대신 `{ orderEndpoint: "set" | "clear" }`. relay `GET /order-endpoints` 는 감사 줄을 남기더라도 개수만.

### Pitfall 7: 교보 계좌에 `orderEndpoint` 가 실려 온다
**Why:** gh-trade 교보 서버는 형식을 보지 않고 저장한다(`kbFields` false) [VERIFIED: gh-trade Gateway.cpp:1845 · Config.cpp:1154-1156] → users.toml 에 쓰레기.
**How to avoid:** Express · relay 스키마에서 `broker !== "KB"` 이면 `orderEndpoint` 거부(400) — 웹은 교보에 칸이 없다(D-03).

### Pitfall 8: 같은 계좌를 다른 DMA 유저에 「추가」 하면 code 7 (R3-02 — 미해결)
**What goes wrong:** U1 의 계좌 A 에 IP/MAC 이 있을 때 Admin 이 A 를 U2 에 추가하면 planner 는 U2 의 87 계좌에서만 값을 찾으므로 `""` 를 싣고, 서버는 code 7 로 거부한다 [VERIFIED: relay/src/admin/planner.ts:107-112 · 29-REVIEW-R3.md R3-02].
**How to avoid:** 아래 Open Question 1 — D-11(특별 처리 안 함)의 범위 해석이 필요하다.

### Pitfall 9: 마감(10초) 안에서 op 5 왕복이 더해진다
**Why:** 서버당 op 1개 = 86 5초 + 87 1초 상한, 요청 마감 `ADMIN_REQUEST_DEADLINE_MS = 10_000` [VERIFIED: dispatcher.ts:96]. op 5 상한 5초가 더해지면 느린 서버에서 마감 접기(`timeout` · 「10초 안에 끝나지 않아 먼저 응답했어요 …」)가 더 잦아진다.
**How to avoid:** 정상 경로는 수십 ms 라 영향 없음. 기존 마감 접기 · 뒤 기록이 그대로 처리한다 — 별도 조치 불필요. 테스트에서 `FakeConn.delayMs` 로 op 5 지연 + 마감 접기 1건 확인 권고.

## Code Examples

### relay 라우트 — 계좌는 store 로, IP/MAC 은 dispatcher 로만
```ts
// relay/src/admin/admin-api.ts (Source: 기존 PUT 라우트 :421-434 확장)
const OrderEndpointSchema = z.object({ orderIp: z.string().max(64), orderMac: z.string().max(64) });
const PutAccountBody = z
  .object({ account: AccountSchema, servers: ServersSchema, orderEndpoint: OrderEndpointSchema.optional() })
  .superRefine((b, ctx) => {
    if (b.orderEndpoint !== undefined && b.account.broker !== "KB") {
      ctx.addIssue({ code: "custom", path: ["orderEndpoint"], message: "주문자 IP/MAC 은 KB 계좌만입니다" });
    }
  });
// …
await deps.store.putAccount(dma, body.account, body.servers); // IP/MAC 없음
return { results: await deps.dispatcher.reconcileUser(dma, {
  adminEmail, deadlineAt,
  ...(body.orderEndpoint ? { orderEndpoint: { broker: body.account.broker, accountNo: body.account.accountNo, ...body.orderEndpoint } } : {}),
}) };
```
(`AccountSchema` 의 `.transform` 이 이미 `accountNo` 를 정규화한다 [VERIFIED: admin-api.ts:142-149]. `.superRefine` 은 `ZodEffects` 뒤 `.object` 에 걸어도 transform 된 값을 받는다 — zod 4 에서 확인 필요한 세부는 테스트로 잠근다 [ASSUMED].)

### Express 스키마
```ts
// server/src/schemas/admin.ts — 형식은 보지 않는다(정본 = gh-trade code 13). trim 은 해도 무해(서버는 trim 안 함)
export const OrderEndpointSchema = z.object({
  orderIp: z.string().trim().max(64, "주문자 IP 가 너무 길어요"),
  orderMac: z.string().trim().max(64, "MAC 주소가 너무 길어요"),
});
export const AdminPutAccountSchema = z
  .object({ account: AdminAccountInputSchema, servers: ServerListSchema, orderEndpoint: OrderEndpointSchema.optional() })
  .superRefine(checkServersMatchBroker)
  .superRefine((v, ctx) => {
    if (v.orderEndpoint !== undefined && v.account.broker !== "KB") {
      ctx.addIssue({ code: "custom", path: ["orderEndpoint"], message: "주문자 IP · MAC 은 KB 계좌만이에요" });
    }
  });
```

### 웹 저장 본문 (UI-SPEC §3 그대로)
```ts
const body: AdminPutAccountBody = {
  account: { ...accountInputOf(account), name: draft.name.trim() },
  servers: intent, // 지금 active 등록 서버 그대로(토글 비행 중이면 toggle.value)
  // 사용자가 IP/MAC 칸을 바꿨거나(정규화 비교로 다름) D-10 맞추기 저장일 때만. 계좌명만 바꾼 저장은 싣지 않는다.
  ...(sendEndpoint ? { orderEndpoint: { orderIp: draft.ip.trim(), orderMac: draft.mac.trim() } } : {}),
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 서버가 주문 소켓 NIC IP/MAC 을 전 계좌 공통으로 실음 | users.toml 계좌별 `order_ip`/`order_mac`(슬롯 14/16) | gh-trade quick-261010-vfn (`4bf6d8f1`) | 미설정 계좌는 종전 동작 그대로 |
| op 1/3 이 IP/MAC 을 빈 값으로 보내 서버 값을 지움 | 87 캐시 값 되싣기(GC-02) | 29-47 (`233bf31a` · `d9f61673`) | relay 밖 변경은 여전히 지움 → R3-01 |
| 87 캐시로 계획 | op 1/3 직전 op 5 재조회 후 재계획 | **이번 phase** | R3-01 해제 → KB 운영 서버 IP/MAC 설정 보류 해제 |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | zod 4 에서 `.object({...}).superRefine(...)` 가 transform 된 `account`(정규화 accountNo)를 받는다 | Code Examples | 낮음 — 기존 `checkServersMatchBroker` 가 같은 모양으로 이미 동작. 테스트가 잡는다 |
| A2 | relay 재배포는 장 마감(20:00 KST) 뒤가 안전하다(사용자 세션 끊김) | 배포 | 중간 — 장중 재시작 시 트레이더 세션 재접속. 메모리 `project_market_hours_0800_2000` 기준, relay README 에 명시 문구는 이번 세션에 찾지 못함 |
| A3 | 실서버 IPMAC-01 확인(relay 밖 설정 → 웹 이름 변경 → 87 보존)은 gh-trade 도구(`e2e_admin_users.sh` 등) 접근이 필요하다 | Validation | 중간 — 라이브 확인을 못 하면 단위 테스트 + relay 로그(op 5 → 87 수신)로 대체하고 사람 확인 체크포인트 |
| A4 | Express `GET /users` 에 relay 왕복 1회가 병렬로 붙어도 체감 지연이 없다(relay 는 VPC 내부 · 메모리 읽기) | Pattern 3 | 낮음 — `GET /servers` 가 같은 구조로 운영 중 |

## Open Questions

1. **R3-02(같은 계좌를 다른 DMA 유저에 「추가」 → code 7)를 이번에 고치는가?**
   - What we know: R3-02 처분은 「R3-01 과 같은 IP/MAC 작업」 으로 deferred [VERIFIED: 29-REVIEW-R3-DISPOSITION.md:19]. 수정은 planner 6줄(같은 87 의 다른 유저에서 같은 정규화 번호 IP/MAC 을 찾아 되싣기 — R3-02 원문 Fix). CONTEXT D-11 은 「공유 계좌 특별 처리 안 함 — 편집에서 code 7 이면 문구만」 이고, Deferred 는 「일괄 반영」.
   - What's unclear: D-11 이 「추가」 경로의 R3-02 까지 덮는지.
   - Recommendation: **포함 권고**(새 87 을 이미 받으므로 비용이 거의 없고, gh-trade code 7 규칙상 같은 값을 실어야만 추가가 성공한다 · 일괄 반영과 다르다). 플래너가 사용자 확인 1회로 잠그거나, 범위 밖이면 DISPOSITION 에 「Phase 30 에서도 연기」 를 명시.

2. **relay 표시 캐시의 신선도(Pitfall 5)를 이번에 보강하는가?**
   - Recommendation: 하지 않는다(D-14 운영 절차 + 데이터 손실 없음). 인박스 회신에 한 줄 남기고, 필요해지면 gh-trade 에 87 Notice 확대 인계.

3. **IPMAC-04 `done_commit` 은 어느 커밋인가?**
   - What we know: 선례는 「처리한 gh-radar 커밋」(예: `261005-member-top-int64.md` `done_commit: 303d3a9f` = 골든 보정 커밋).
   - Recommendation: 웹 · relay 변경을 담은 마지막 코드 커밋 해시를 적고, 노트 갱신은 relay 배포 확인 뒤 별도 커밋(경로 지정). 「KB 운영 서버 값 설정 보류 권고」 해제 문장도 **배포 확인 뒤**에만 쓴다(D-15).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | 전 워크스페이스 | ✓ | v24.21.0 (relay `engines >=22`) | — |
| pnpm | 빌드 · 테스트 | ✓ | 11.15.1 | — |
| Playwright 브라우저 | webapp E2E | ✓ | chromium-1217 등 캐시 존재 | — |
| gcloud + deployer SA | relay · server 배포 | ✓ | `~/.config/gcloud/gh-radar-deployer.json` 존재 | — |
| relay · webapp · server node_modules · shared dist | 테스트 | ✓ | 이번 세션 테스트 실행 통과 | — |
| gh-trade 도구(relay 밖 IP/MAC 설정) | IPMAC-01 라이브 확인 | 미확인 | — | 단위 테스트 + 사람 확인 체크포인트 |

이번 세션 실측: relay `admin-planner` + `admin-dispatcher` 63 passed · shared `admin` + `admin-overview` 66 passed · webapp `account-editor` 27 passed · server `admin-dma` + `admin` 106 passed.

**Missing dependencies with no fallback:** 없음.

## 배포 · 확인 (Deploy)

순서(메인 세션이 실행 — 서브에이전트 배포 차단):
1. **relay** — `GCP_PROJECT_ID=gh-radar SUPABASE_URL=… NOTIFICATION_CHANNEL_ID=… bash scripts/deploy-relay.sh` → `bash scripts/smoke-relay.sh` [CITED: infra/relay/README.md §relay 컨테이너 「배포 / 롤백」]. 확인: Cloud Logging `relay_docker` 에서 웹 계좌 편집 1회 뒤 `[ADMIN] users.toml 스냅샷 수신(87)` 이 op 3 결과 앞에 찍히는지(재조회). 장 마감(20:00 KST) 뒤 권고 [ASSUMED A2].
2. **server(Express · Cloud Run)** — `scripts/deploy-server.sh`(필수 env `GCP_PROJECT_ID · SUPABASE_URL · CORS_ALLOWED_ORIGINS · RELAY_INTERNAL_URL` — 라이브 Cloud Run env 에서 그대로) [VERIFIED: scripts/deploy-server.sh:5-8]. 확인: `GET /api/admin/users` 응답 계좌에 `orderEndpoints` 키.
3. **webapp** — `git push`(= Vercel 프로덕션). relay · server 가 막히면 push 금지.
4. 인박스 노트 — 배포 확인 뒤 보류 권고 해제 · `status: done` · `done_commit` · 경로 지정 커밋.

## IPMAC-04 회신 근거

- ① code 7 문구: gh-radar 는 code 7 문장을 대조하지 않는다 — `grep -rn -e "다른 지점번호" -e "거래자ID 로 보유" -e "ACCOUNT_CONFLICT" -e "AccountConflict" webapp/src server/src relay/src packages/shared/src` 결과는 `relay/src/admin/types.ts:47`(`AccountConflict: 7,`) · `:73`(`7: "ACCOUNT_CONFLICT",` 로그 이름표)뿐 [VERIFIED: 이번 세션 grep]. → 「넓혀 달라 · gh-radar 변경 없음」(D-12).
- ② 입력 표기: 점표기 · 콜론 그대로(trim 만) · 표시는 87 정규화값(D-13).
- ③ `ipconfig /all` 수기 입력 절차(D-14).
- 형식: frontmatter `status: done` · `done_commit: <해시>` · 경로 지정 add [CITED: docs/inbox/from-gh-trade/README.md].
- 노트 본문 「진행」 줄의 「KB 운영 서버 값 설정 보류 권고는 유지」 를 배포 확인 뒤 해제로 고친다 [VERIFIED: docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md 「진행 (2026-10-11 · gh-radar 29-47)」 단락].

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4(relay · shared · server · webapp) · Playwright 1.59(webapp E2E · 목 API) |
| Config file | `relay/vitest.config.ts` · `packages/shared/vitest.config.ts` · `server/vitest.config.ts` · `webapp/vitest.config.ts`(전부 `maxWorkers` 기본 2) · `webapp/playwright.config.ts` |
| Quick run command | `pnpm --filter @gh-radar/relay exec vitest run tests/admin-dispatcher.test.ts tests/admin-planner.test.ts tests/admin-api.test.ts` |
| Full suite command | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run && pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/server exec vitest run && pnpm --filter @gh-radar/webapp run test` (+ config `build_command` 타입체크) |

주의: shared · server 의 `test` 스크립트는 `vitest`(watch)다 — 반드시 `exec vitest run`. relay `test` 는 `vitest run`, webapp `test` 는 `vitest --run`.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IPMAC-01 | 캐시에 없는 relay 밖 IP/MAC 이 이름 변경 op 3 에 실린다(R3-01 회귀) | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/admin-dispatcher.test.ts -t "IPMAC-01"` | ✅ 파일 · ❌ 케이스(Wave 0: FakeConn op 5 분기) |
| IPMAC-01 | op 5 timeout/offline → 44 미송신 · 결과 timeout/offline | unit | 같은 파일 `-t "IPMAC-01"` | ❌ |
| IPMAC-01 | op 1/3 없는 계획(무변경 · 삭제 · 비밀번호)은 op 5 를 보내지 않는다 | unit | 같은 파일 | ❌ |
| IPMAC-01 | override 쌍 > 새 87 > "" (등록 서버 전부 같은 값 — D-10) | unit | `… tests/admin-dispatcher.test.ts tests/admin-planner.test.ts` | ❌ |
| IPMAC-02 | `normalizeOrderIp/Mac` = gh-trade 표본(12자리 · 점표기 · 256 · 빈 옥텟 · 꼬리 · 5옥텟 · 4자리 옥텟 · 구분자 · 대소문자 · 구분자만) | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/order-endpoint.test.ts` | ❌ Wave 0 |
| IPMAC-02 | `deriveAdminUsersOverview(raw, endpoints)` → `orderEndpoints`(설정 · 미설정 · 모름) · `summarizeOrderEndpoint` 출처 · 불일치 | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/admin-overview.test.ts src/__tests__/order-endpoint.test.ts` | ✅/❌ |
| IPMAC-02 | `sameValues` 정규화 비교(점표기 = 12자리 → op 없음 · 형식 오류 → op 3) · `undefined` 는 비교 제외(GC-02) | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/admin.test.ts` | ✅ 파일 · ❌ 케이스 |
| IPMAC-02 | relay PUT `orderEndpoint` → dispatcher override · store 에 IP/MAC 없음 · 교보 400 · `GET /order-endpoints` 모양 | integration | `pnpm --filter @gh-radar/relay exec vitest run tests/admin-api.test.ts` | ✅ 파일 · ❌ 케이스 |
| IPMAC-02 | Express 스키마 통과 · 교보 400 · GET /users 병렬 병합 · relay 실패 → null(200) · 클라이언트 경로 문자열 | integration | `pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-dma.test.ts tests/routes/admin.test.ts tests/services/relay-admin-client.test.ts` | ✅ 파일 · ❌ 케이스 |
| IPMAC-02 | 편집 모드 · 검증 문구 3종 · 저장 비활성 규칙 · PUT 본문(원문 trim · 이름만이면 `orderEndpoint` 없음) · 「변경 없음」 요청 0건 · 읽기 줄 · 불일치 줄 · 교보 「해당 없음」 | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/admin/__tests__/account-editor.test.tsx` | ✅ 파일 · ❌ 케이스 |
| IPMAC-03 | 86 code 13 → failed · message 원문(relay) | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/admin-dispatcher.test.ts -t "D15"` | ✅ (기존 D15) |
| IPMAC-03 | code 13 결과 → 카드 결과 줄 「KB120 실패: <원문>」 `role="alert"` · 편집 유지 · BusyLines 중복 없음 | component | account-editor 테스트 | ❌ |
| IPMAC-04 | 노트 `status: done` · `done_commit` 해시 · 질문 3개 답 | doc check | `grep -qE '^status: done$' docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md && grep -qE '^done_commit: [0-9a-f]{7,}' docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md` | ✅ 파일 |
| IPMAC-05 | 계좌명만 변경 → PUT 1건(servers 그대로 · `orderEndpoint` 없음) → 카드 새 이름 | component + unit | account-editor 테스트 + dispatcher(이름 변경 op 3 이 등록 서버마다) | ❌ |
| UI backstop | 폰 390 — IP/MAC 읽기 줄 · 40자 계좌명 · 2열 placeholder 잘림 없음(UI-SPEC E1/E2/E4 backstop) | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/admin.spec.ts -g "P30" --workers=1` | ✅ 파일 · ❌ 케이스 |
| 라이브 | relay 밖 설정 → 웹 이름 변경 → 87 보존 · 10.41.1.124/1c:fd:… → 010041001124/1CFD087D978E | manual | 배포 뒤 사람 확인(Cloud Logging `relay_docker` + 화면) | — |

### Sampling Rate
- **Per task commit:** 해당 워크스페이스 quick 명령(위 표의 파일 단위)
- **Per wave merge:** Full suite command + config `build_command`
- **Phase gate:** Full suite green + E2E P30(390 · 1080) green 뒤 `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `relay/tests/admin-dispatcher.test.ts` — `FakeConn.command` op 5 분기(`refreshes` 카운터 · `sent` 제외 · mode 존중) — 기존 단언 보존
- [ ] `packages/shared/src/__tests__/order-endpoint.test.ts` — 정규화 · 검증 · 요약(신규)
- [ ] `webapp/e2e/fixtures/admin.ts` — 계좌 `orderEndpoints` 픽스처 · PUT 본문 기록 · 이름/IP 반영
- [ ] relay `admin-api.test.ts` 의 `pipelines` 스텁에 `currentSnapshot`(타입 확장 뒤 `typecheck:tests`)

## Sources

### Primary (HIGH confidence — 이번 세션 Read/실행)
- `relay/src/admin/{dispatcher,planner,admin-conn,admin-api,intent-store,snapshot-sink,types}.ts` · `relay/src/dma/envelope.ts:3242-3378` · `relay/src/index.ts:500-560`
- `packages/shared/src/admin.ts:80-759` · `order-server.ts:35-44` · `package.json`
- `server/src/routes/admin.ts` · `admin-servers.ts:94-118` · `schemas/admin.ts` · `services/relay-admin-client.ts`
- `webapp/src/components/admin/{account-editor.tsx,use-field-save.ts}` · `webapp/src/lib/admin-api.ts` · 테스트 · e2e 픽스처
- `supabase/migrations/20261006200300_dma_admin_reflect.sql` · `20261006200200_dma_admin_intent_rpcs.sql` · `20261010200100_dma_account_order_server.sql`
- gh-trade `server/src/broker/base/AccountUtil.h:42-131` · `server/src/net/Gateway.cpp:1825-1880` · `server/src/net/AdminProto.cpp:10-26` · `server/src/util/Config.cpp:1145-1170` (gh-trade HEAD `6370ac1d`)
- `.planning/milestones/v1.0-phases/29-dma-multi-server-admin/29-REVIEW-R3.md`(R3-01 · R3-02) · `29-REVIEW-R3-DISPOSITION.md`
- `docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md` · `README.md` · `infra/relay/README.md` · `scripts/deploy-relay.sh` · `scripts/deploy-server.sh`
- 테스트 실측: relay 63 · shared 66 · webapp 27 · server 106 passed

### Secondary (MEDIUM)
- `30-UI-SPEC.md`(승인본) · `30-CONTEXT.md` · 메모리(배포 순서 · 장 시간 · 동시 테스트)

### Tertiary (LOW)
- 없음

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 새 패키지 없음 · 기존 버전 확인
- Architecture: HIGH — 모든 확장 지점을 원문으로 확인, 선례(`GET /servers` 병합 · `command(op 5)`)가 이미 운영 중
- Pitfalls: HIGH — strip · dist 소비 · FakeConn timeout · 토글 경합은 코드로 확인. 배포 시각(A2)만 ASSUMED

**Research date:** 2026-10-11
**Valid until:** 2026-11-10 (gh-trade 와이어가 다시 바뀌면 즉시 재검토 — 인박스 노트 확인)
