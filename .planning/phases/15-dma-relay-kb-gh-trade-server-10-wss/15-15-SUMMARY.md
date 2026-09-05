---
phase: 15-dma-relay-kb-gh-trade-server-10-wss
plan: 15
subsystem: relay-dma-session
tags: [dma, flatbuffers, session, accounts, security]
requires:
  - "gh-trade Phase 17 정본 스키마 — `table AccountEntry` + `LoginResp.accounts` (D-25 게이트)"
  - "15-01 이 커밋한 `relay/src/generated/` (accounts 접근자 포함)"
  - "15-02 `envelope.ts` 조립·파싱 규약 (`takeCount` · 필드 가드 · 드롭 카운터)"
  - "15-03 `DmaSession` 상태기계 (`declaring` 단계 삽입 지점 · generation 규율)"
  - "15-02 테스트 헬퍼 (`fake-gateway.ts` · `frames.ts`)"
provides:
  - "`buildUpdateAccountNoReq(mode,accountNo)` — MsgType 3, 추가 모드만 허용하는 리터럴 유니온"
  - "`parseLoginRespAccounts` / `parseUpdateAccountNoResp` — 상한 256 · 계좌번호 1~12자 가드"
  - "`maskAccountNo()` — 로그 전용 뒤 4자리 마스킹 (화면은 전체 표기)"
  - "`DmaSession` 계좌 선언 루프 — 전량 연속 선언 → 누적 대조 → Ready"
  - "`NO_ACCOUNTS_MESSAGE` — 계좌 0건 실패 문구 정본"
  - "검증된 계좌 목록 (`allowedAccounts`) — 15-17 주문 계좌 화이트리스트의 원천"
  - "테스트 헬퍼 `respondLoginWithAccounts` / `respondUpdateAccountNo` / `silenceAccountResp` / `declaredAccounts`"
affects:
  - "`ready` 의 의미가 바뀌었다 — 계좌 대조를 통과해야 Ready 다. 계좌 0건은 `session_rejected`"
  - "`parseLoginResp` 반환형에 `accounts` 추가 — 호출부 1곳(session) + 테스트 3곳 갱신"
  - "`MAX_ACCOUNT_NO_LEN` 정본이 `session.ts` → `envelope.ts` 로 이동"
  - "`packages/shared` RelayAccount 계약 주석 — `ready` 의 accounts 는 항상 1건 이상"
tech-stack:
  added: []
  patterns:
    - "리터럴 유니온으로 프로토콜 모드 봉쇄 — `AccountDeclareMode = \"1\"` 이 조회 왕복을 타입 에러로 만든다"
    - "화면/로그 문구 이원화 — `#fail(reason, logReason)` · `#setState(next, msg, attempt, logMsg)`"
    - "항목 스킵 카운터를 프레임 드롭 카운터와 분리 — 계좌 1건이 깨져도 나머지를 살린다"
    - "누적 대조 — 서버가 매번 목록 전체를 주므로 '마지막 응답'이 아니라 받은 목록의 합집합으로 판정"
key-files:
  created:
    - relay/tests/account-declare.test.ts
  modified:
    - relay/src/dma/envelope.ts
    - relay/src/dma/session.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/tests/session.test.ts
    - relay/tests/fake-gateway.test.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
    - packages/shared/src/relay.ts
decisions:
  - "D-25 게이트는 **스키마 게이트로만** 판정했다 — 게이트웨이 런타임(users.toml 인증, 와이어에 accounts 가 실제로 채워지는지)은 미검증. KB 게이트웨이 접속이 이 plan 범위 밖이다"
  - "재동기화 산출물 재커밋 없음 — 15-01 이 이미 accounts 포함본을 커밋했고 `--check` 가 0 변경이다. 손으로 고치지 않는 D-26 규약을 지킨 결과"
  - "계좌 0건은 `#fail` 이 아니라 `#failNoRetry` — 로그인 자체는 성공했고 users.toml 미등록은 재시도로 바뀌지 않는다. 상태는 `session_rejected`"
  - "`#setState` 에도 로그 전용 문구 인자를 추가 — `#fail` 만 고치면 상태 전이 로그(`msg`)로 계좌번호 원문이 그대로 샌다"
  - "`buildUpdateAccountNoReq` 반환형은 `Buffer` 가 아니라 `Uint8Array` — 형제 빌더 5종·`DmaClient.send` 와 같은 계약"
  - "`MAX_ACCOUNT_NO_LEN` 을 envelope.ts 로 이관 — 형식 판정은 와이어 경계의 일이고 상한 상수 5종이 한 파일에 모여야 한다"
  - "가짜 게이트웨이 기본 로그인 응답에 계좌 1건 탑재 — 0건이 기본이면 '정상 부트' 테스트가 전부 실패 경로로 새어 무엇을 검증하는지 알 수 없다. 거부 응답은 빈 벡터(17 D-19)"
metrics:
  duration: "~35분"
  completed: 2026-09-06
  tasks: 3
  commits: 2
  files_changed: 9
  tests: "relay 134 → 151 (+17)"
---

# Phase 15 Plan 15: 계좌 선언 루프 Summary

15-03 이 `TODO(D-25)` 로 남겨 둔 "계좌 0건 → 즉시 Ready" 축약 경로를, `LoginResp.accounts` 전량을 `UpdateAccountNoReq(3)` 로 연속 선언하고 `UpdateAccountNoResp(55)` 목록과 대조한 뒤에만 Ready 가 되는 실제 시퀀스로 교체했다. 계좌 목록이 곧 주문 허용 화이트리스트이므로(T-15-01), 이 대조가 15-17 계좌 검증의 근거가 된다.

## 무엇을 만들었나

| 산출물 | 내용 |
|--------|------|
| `envelope.ts` 계좌 경계 | `buildUpdateAccountNoReq` · `parseLoginRespAccounts` · `parseUpdateAccountNoResp` · `isValidAccountNo` · `maskAccountNo` · 항목 스킵 카운터 |
| `session.ts` 선언 루프 | 0건 실패 → 전량 연속 송신 → 5초 누적 대조 → Ready. 재접속도 같은 경로 |
| `account-declare.test.ts` | 계좌 시퀀스 통합 8건 |
| 테스트 헬퍼 확장 | `LoginResp.accounts` 조립, `UpdateAccountNoResp(55)` 프레임, 가짜 게이트웨이의 선언 자동 응답(누적 목록)·고정 목록 override·응답 침묵·선언 관찰 |

## Task 1 — D-25 게이트 판정 (재동기화 불필요)

**게이트는 스키마 수준에서 이미 열려 있었다.**

| 확인 항목 | 결과 |
|-----------|------|
| `grep -c 'table AccountEntry' gh-trade/server/src/protocol/StockDMA.fbs` | 1 (fbs L157) |
| `LoginResp.accounts: [AccountEntry]` | 존재 (fbs L172, 테이블 말미 append) |
| gh-trade Phase 17 진행 | `0068248` 까지 완료 — 17-11 추적성 서명·17-12 UAT 대기 |
| `flatc --version` | `25.12.19` (스크립트 고정값 일치) |
| `relay/src/generated/stock-dma/login-resp.ts` | `accounts(index, obj?)` · `accountsLength()` · `addAccounts` · `createAccountsVector` 존재 |
| `relay/src/generated/stock-dma/account-entry.ts` | 존재 (`accountNo()` / `name()`) |
| `sync-relay-schema.sh --check` | exit 0 — 생성 41개 중 **신규/변경 0, 삭제 0**, `.fbs` 사본 최신 |
| `git status --porcelain relay/src/generated` | 0줄 (커밋 완료 상태) |
| relay 기존 테스트 | 134 green (회귀 0) |

**재동기화 산출물 커밋이 없는 이유:** 15-01 이 이미 `accounts` 접근자를 포함한 생성물을 커밋했다. `--check` 가 0 변경이므로 재실행해도 바이트가 같고, 억지로 손대는 것은 D-26(생성 코드를 손으로 고치지 않는다) 규약 위반이다. 게이트 판정의 근거는 "diff 가 있었다"가 아니라 "정본 스키마에 두 심볼이 있고 대조가 무변경"이다.

> **[미검증] 런타임 게이트.** 위 판정은 전부 **스키마·생성코드 수준**이다. 게이트웨이가 실제 와이어에서 `accounts` 를 채워 보내는지, `users.toml` 인증이 gh-radar 용 `user_id` 로 동작하는지(D-17)는 **확인하지 않았다** — KB 게이트웨이(`10.41.1.120`) 접속·VPN 기동이 이 plan 범위 밖이기 때문이다. 그 확인은 15-19/15-20 의 실계통 검증에서 이뤄져야 한다. 아래 "남은 리스크" 참조.

## Task 2 — 계좌 조립·파싱 (`e7b544c`)

- `AccountDeclareMode = "1"` 리터럴 유니온. 조회 왕복(17 D-11 금지)이 **타입 에러**가 된다. `envelope.ts` 안에 모드 2 리터럴이 0개임을 acceptance 로 고정.
- `takeCount(n, MAX_ACCOUNT_LIST_COUNT=256, "계좌 목록")` + 계좌번호 1~`MAX_ACCOUNT_NO_LEN`(12)자 가드. **위반 항목만 스킵**하고 프레임은 살린다 — 프레임째 버리면 정상 계좌까지 사라져 "계좌가 없다"라는 더 나쁜 오진이 된다.
- 스킵은 `skippedAccountEntryCount()` 라는 **별도 카운터**로 센다 (S-5). 프레임 드롭과 섞으면 "계좌 형식 문제"와 "프레임 파손"을 구분할 수 없다.
- `parseLoginResp` 가 `accounts` 를 함께 반환하도록 확장 — 부트 시퀀스가 `login_resp` 슬롯을 두 번 열지 않는다. 반환형 변경 여파는 호출부 1곳(session) + 테스트 3곳.
- `maskAccountNo("1234567801") === "123456****"`. 화면은 전체, 로그는 마스킹 (UI-SPEC D2 / T-15-15).

## Task 3 — 세션 선언 루프 (`8b10dc1`)

```
LoginResp(success) ─┬─ accounts 0건 → failNoRetry("서버에 등록된 계좌가 없습니다") [종료]
                    └─ accounts N건 → declaring
                         → UpdateAccountNoReq("1", acc) × N  (건별 대기 없음)
                         → UpdateAccountNoResp(55) 누적 대조, 상한 5초
                              ├─ 전량 확인 → resetReconnectAttempts → ready + emit("ready")
                              └─ 5초 초과 → fail("계좌 선언 미확인 (5초): {누락}")
```

**설계 판단 4가지**

1. **연속 송신.** 건별 대기로 만들면 계좌 N개에 최악 `5N`초가 걸려 부트가 사실상 멎는다. 서버가 매 응답에 현재 목록 전체를 담기 때문에 기다릴 이유도 없다 (C# `Session.cs` A2).
2. **누적 대조.** "마지막 응답"만 보면 서버가 응답을 재정렬하거나 한 건을 흘렸을 때 정상 부트가 조용히 실패한다. 받은 목록의 합집합으로 `#pendingAccounts` 를 비운다.
3. **계좌 0건은 `failNoRetry`.** 로그인 자체는 성공했으므로 전송 실패가 아니다. `users.toml` 미등록은 재접속으로 바뀌지 않으므로 백오프를 돌리면 KB 계정만 위험해진다 (T-15-10). 상태는 `session_rejected`.
4. **여분 계좌는 warn 만.** 게이트웨이는 `user_id`+`broker` 로 세션을 합류시키므로(D-17) 같은 id 를 쓰는 다른 클라이언트의 계좌가 섞여 올 수 있다. 우리 세션의 주문 대상은 어디까지나 **우리가 선언한 목록**이라, 여분은 `allowedAccounts` 에 넣지 않는다 (17 D-13).

**재접속 경로를 두 벌 만들지 않았다.** 재로그인 → 계좌 재선언 → 재구독이 전부 같은 `#onTransportUp` 워커를 지난다 (Pitfall 4). 테스트 ⑥ 이 재접속 후 선언 요청이 2건 → 4건으로 누적되는 것을 단언한다.

## 테스트

| 파일 | 건수 | 내용 |
|------|------|------|
| `relay/tests/account-declare.test.ts` (신규) | 8 | ① 연속 송신(응답 침묵 상태에서도 2건 도착) ② 대조 성공 → ready ③ 1건 누락 → 5초 후 failed + 누락 계좌 문구 ④ 0건 → `session_rejected` + 재접속 시도 0 ⑤ 여분 계좌 warn 만 ⑥ 재접속 재선언 ⑦ ready 프레임 계좌 전체 표기 ⑧ 로그 마스킹 |
| `relay/src/dma/__tests__/envelope.test.ts` | 30 → 39 | 빌더 왕복 · 상한 상수 고정 · 형식 가드 · 마스킹 · 항목 스킵 · 256 절단 · 55 파싱 · 슬롯 null |
| `relay/tests/session.test.ts` ⑦ | 갱신 | "항상 0건" → "대조된 목록이 실린다" + 게터 복사본 불변성 |
| relay 전체 | **134 → 151** | 회귀 0 |

**변이 시험으로 단언의 유효성을 확인했다.** ① `#setState` 의 로그 전용 문구 인자 제거 → ⑧ 이 잡음(상태 전이 로그로 계좌번호 원문 누출). ② 연속 송신을 첫 1건만 보내도록 변이 → ①③⑥⑦ 이 잡음. 두 변이로 8건 중 6건이 실패했고, 복원 후 전량 green.

기타 검증: `pnpm typecheck` (전 워크스페이스) exit 0, `typecheck:tests` exit 0, `@gh-radar/shared` 99 green, `webapp` 318 green.

## Deviations from Plan

### 1. [Rule 3 - 차단] 워크트리 base 가 의존 plan 이전이었다

- **발견 시점:** Task 1 직후, `relay/src/dma/session.ts` 를 열려는데 파일이 없었다.
- **문제:** 워크트리 base 가 `18fa976` 로 15-03/04/05/07/09/12 이전이었다. 이 plan 은 `depends_on: [15-05]` 이므로 `DmaSession` · `SubscriptionHub` · `WsFanout` 없이는 착수 자체가 불가능했다.
- **조치:** 브랜치에 고유 커밋 0건 · 워킹트리 clean · base 가 `master` 의 조상임을 확인한 뒤 `git merge --ff-only master` (33 커밋 fast-forward). 손실 가능성 0인 순수 포인터 이동.
- **커밋:** 별도 커밋 없음 (fast-forward).

### 2. [Rule 2 - 보안] `#setState` 의 상태 전이 로그로 계좌번호가 샌다

- **발견 시점:** Task 3, 테스트 ⑧ 설계 중.
- **문제:** `#fail(reason, logReason)` 만 나누면 로그 누출을 못 막는다. `#fail` 이 부르는 `#setState("failed", reason)` 가 `logger.info({..., msg}, "[DMA] 세션 상태 전이")` 로 **화면용 원문**을 그대로 찍기 때문이다. 플랜에는 없던 경로다.
- **조치:** `#setState` 에 4번째 인자 `logMsg`(기본값 `msg`)를 추가하고 `#fail` 이 마스킹본을 넘기게 했다. 변이 시험으로 이 한 줄이 없으면 ⑧ 이 실패함을 확인.
- **커밋:** `8b10dc1`

### 3. [Rule 1 - 계약] 거부 로그인 응답에 계좌를 싣던 테스트 헬퍼

- **발견 시점:** Task 2, `fake-gateway.test.ts` 2건 실패.
- **문제:** `buildLoginRespFrame` 의 계좌 기본값을 무조건 `SAMPLE_ACCOUNTS` 로 두면 **거부 응답에도 계좌가 실린다** — gh-trade 17 D-19(실패 응답은 빈 벡터)와 어긋나는 가짜 게이트웨이가 된다.
- **조치:** 기본값을 `success ? SAMPLE_ACCOUNTS : []` 로 성공 여부에 묶었다.
- **커밋:** `e7b544c`

### 4. [계획 문구 조정] 계좌 0건의 최종 상태는 `failed` 가 아니라 `session_rejected`

- 플랜 Task 3 액션은 `failNoRetry("서버에 등록된 계좌가 없습니다")` 를 지시하고, 같은 Task 의 테스트 ④ 설명은 "`failed`" 라고 적었다. `failNoRetry` 는 정의상 `session_rejected` 로 확정하므로 둘은 동시에 성립하지 않는다.
- **액션(=구현 지시)을 정본으로 채택**했다. 계좌 0건은 서버측 등록 문제이지 relay 의 부트 실패가 아니므로 `session_rejected` 가 의미상으로도 맞다. 테스트 ④ 는 `session_rejected` + 문구 + **재접속 시도 0** 을 단언한다 — 플랜이 실제로 요구한 성질(재시도 없음)은 그대로 지켰다.

### 5. [정리] 상수·반환형 위치 조정

- `MAX_ACCOUNT_NO_LEN`(12) 을 `session.ts` → `envelope.ts` 로 이관 (Task 2 acceptance 가 envelope.ts 에서의 존재를 요구). 형식 판정은 와이어 경계의 일이고, 두 곳에 두면 다음 필드 추가 때 한쪽만 고쳐진다.
- `buildUpdateAccountNoReq` 반환형은 플랜의 `Buffer` 대신 `Uint8Array`. 형제 빌더 5종과 `DmaClient.send(payload: Uint8Array)` 가 이미 그 계약이고, `flatbuffers.Builder.asUint8Array()` 의 원래 형이다.

## 남은 리스크 · 후속 plan 인계 사항

1. **[미검증] 게이트웨이 런타임.** 실제 KB 게이트웨이가 `LoginResp.accounts` 를 채워 보내는지 확인되지 않았다. 만약 운영 게이트웨이가 빈 벡터를 보내면 **모든 세션이 `session_rejected` + "서버에 등록된 계좌가 없습니다" 로 떨어진다**. 이는 설계상 의도된 fail-closed 이지만, 실계통 첫 접속에서 이 문구가 뜨면 relay 버그가 아니라 gh-trade `users.toml` 계좌 등록을 먼저 볼 것.
2. **[미검증] D-17 `user_id` 분리.** gh-radar 용 DMA `user_id` 를 WinForms 클라이언트와 다른 값으로 운영하는 것은 gh-trade `users.toml` 운영 절차이고 저장소에 값을 남기지 않는다. 이 plan 은 그것을 **코드로 강제하지 않는다** — 값이 겹치면 세션 합류가 일어나고, 그 증상은 테스트 ⑤ 가 다루는 "여분 계좌 warn" 으로 나타난다. 실계통에서 그 warn 이 보이면 `user_id` 충돌을 의심할 것.
3. **`ready` 의 의미 변경.** 15-16 이후 plan 이 `ready` 를 "TCP+로그인 완료"로 읽으면 안 된다. 이제 `ready` 는 "서버가 우리 계좌 전량을 등록했음이 확인됨"이고, `allowedAccounts` 는 비지 않는다.
4. **주문 계좌 검증(15-17)의 원천은 `session.allowedAccounts`** 다. 브라우저가 보낸 `account_no` 를 이 목록과 대조해야 T-15-01(IDOR) 이 막힌다. 상태 프레임의 `accounts` 를 신뢰하면 안 된다 — 그것은 브라우저로 내려간 사본이다.

## Threat Flags

없음. 이 plan 이 만든 계좌 선언·대조 경로는 플랜 `<threat_model>` 의 T-15-01/07/10/15/16/47 이 이미 다룬다. 새로운 네트워크 엔드포인트·인증 경로·파일 접근·스키마 변경은 없다.

## Known Stubs

없음.

## Self-Check: PASSED

- `relay/tests/account-declare.test.ts` — FOUND
- `relay/src/dma/envelope.ts` (`buildUpdateAccountNoReq` 1, `MAX_ACCOUNT_LIST_COUNT`=256, `MAX_ACCOUNT_NO_LEN`=12, 모드 2 리터럴 0) — FOUND
- `relay/src/dma/session.ts` (`TODO(D-25)` 0, `ACCOUNT_RESP_TIMEOUT_MS`=5000, `서버에 등록된 계좌가 없습니다` 1, `buildUpdateAccountNoReq` 2) — FOUND
- 커밋 `e7b544c` — FOUND
- 커밋 `8b10dc1` — FOUND
- `sync-relay-schema.sh --check` exit 0 / `pnpm --filter @gh-radar/relay test` 151 green / `pnpm typecheck` exit 0 — PASS
