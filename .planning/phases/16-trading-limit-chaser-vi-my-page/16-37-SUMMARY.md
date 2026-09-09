---
phase: 16-trading-limit-chaser-vi-my-page
plan: 37
subsystem: relay
tags: [healthz, session-manager, stalled-count, no-retry-states, gap-closure, r2-cr-02]

requires:
  - phase: 16
    provides: "16-30 이 만든 `STALE_SESSION_MS` · `Entry.createdAt` · `SessionStats.stalledCount` · `sessionsOk = (everReadyCount === 0 && stalledCount === 0) || readyCount > 0`"
  - phase: 15
    provides: "15-03 의 `NO_RETRY_STATES`(T-15-10 / D-16 계정 잠금 방지) 와 `acquire` 의 거부 세션 재사용 규약"
provides:
  - "사유를 보는 `stalledCount` — `NO_RETRY_STATES`(사용자 원인) 세션을 집계에서 제외"
  - "`NO_RETRY_STATES` 의 두 번째 계약: 「재로그인 억제 목록」이자 「/healthz 게이트웨이 판정축의 제외 목록」 (한 벌만 유지)"
  - "회귀 잠금 2종 — ⑩-b(사용자 원인 0) · ⑩-c(제외는 세션 단위)"
affects: [Cloud Monitoring uptime check, /healthz 판정, 16-46 종결 plan 의 재배포]

tech-stack:
  added: []
  patterns:
    - "하나의 카운터가 서로 다른 두 원인을 삼키지 않게 한다 — 카운터의 정의는 「무엇이 참인가」가 아니라 「어떤 질문에 답하는가」로 적는다"
    - "판정을 고칠 때 판정식이 아니라 **입력값의 정의**를 좁힌다 — 판정식을 손대면 이전 plan 이 얻은 것을 되돌릴 위험이 생긴다"
    - "분류 목록은 한 벌만 둔다. 같은 사실을 두 곳에서 열거하면 갈리는 순간 한쪽이 다른 쪽을 조용히 배신한다"

key-files:
  created: []
  modified:
    - relay/src/dma/session-manager.ts
    - relay/src/order/order-api.ts
    - relay/tests/session-manager.test.ts

key-decisions:
  - "별칭 상수를 만들지 않고 `NO_RETRY_STATES` 를 `stats()` 에서 **직접** 참조했다. plan 이 재량으로 남긴 자리다 — 별칭(`USER_CAUSED_STATES` 등)을 두면 이름은 선명해지지만 목록이 두 벌이 될 수 있는 구조가 생긴다. 대신 선언부 docstring 에 「이 집합은 재로그인 억제 목록이자 /healthz 제외 목록」이라고 두 용도를 명시했다"
  - "제외해도 되는 근거를 REVIEW 스니펫이 아니라 `session.ts` 코드에서 확인했다. `session_rejected` 진입 경로는 `#failNoRetry` **둘**이다 — ① `LoginResp.success === false`(자격증명 거부) ② `LoginResp.accounts.length === 0`(그 DMA 계정 등록 계좌 0건, `NO_ACCOUNTS_MESSAGE`). R2 리뷰는 ①만 말했으나 ②도 **그 사용자 한 명의 등록 상태**이고 그 시점 게이트웨이는 정상 응답 중이므로 같은 처분이 맞다. 이 사실을 코드 주석에 박았다"
  - "`unauthorized` 를 제외 목록에 그대로 두었다. `session.ts` docstring 이 명시하듯 이 상태는 `DmaSession` 이 스스로 들어가지 않는다(wss 계층이 세션 생성 **전에** 판정, D-38 규율로 선언만). 포함해도 판정이 넓어지지 않고, 빼면 목록이 두 벌이 된다"
  - "⑩-c 를 plan 이 허용한 대체 조합(거부 + Ready)이 아니라 **원안(거부 + 무응답)** 으로 만들었다. 대체 조합은 `stalledCount` 가 제외 유무와 무관하게 0 이라 세션 단위 판정을 가르지 못한다(무력화 실증에서 실패하지 않는다). 한 매니저 = 한 게이트웨이 제약은 `gw.silenceLogin()` 을 두 번째 `acquire` **직전에** 호출해 같은 게이트웨이의 응답 방식을 바꾸는 것으로 풀었다"
  - "`sessionsOk` 판정식을 건드리지 않았다. 이번 변경은 입력값의 정의를 좁히는 것이지 판정을 느슨하게 하는 것이 아니다 — 판정식을 손대는 순간 16-30 의 GC-WR-07 을 되돌릴 위험이 생긴다"

patterns-established:
  - "회귀 잠금 실증: 새 분기를 무력화해 새 테스트가 실제로 실패하는지 확인 후 복원 (16-27~16-30·16-36 승계)"
  - "이전 plan 의 방어를 회귀 게이트로 삼는다 — 기존 ⑩ 이 깨지면 테스트가 아니라 구현을 고친다는 규칙을 먼저 정해 두고 시작한다"

requirements-completed: []

duration: 25min
completed: 2026-09-09
---

# Phase 16 Plan 37: `stalledCount` 가 사유를 본다 (R2-CR-02) Summary

사용자 한 명의 잘못된 DMA 비밀번호가 relay 전체의 `/healthz` 를 영구 503 으로 만들던 자리를 닫았다 — 하나의 카운터가 「게이트웨이 장애」와 「사용자 자격증명 오류」라는 서로 다른 두 원인을 삼키고 있었다.

## 무엇이 문제였나

`stats().stalledCount` 는 「생성 후 `STALE_SESSION_MS`(5분)가 지나도록 한 번도 Ready 가 아닌 세션」을 **사유 불문** 전부 셌다. 그런데 이 매니저에는 게이트웨이 장애가 **아닌** 영구 미Ready 상태가 이미 있다.

| 축 | 사실 | 근거 |
|---|---|---|
| 재생성 안 함 | `acquire` 는 `NO_RETRY_STATES` 세션을 재로그인 없이 `refCount` 만 올려 그대로 돌려준다 | `session-manager.ts:207-212` (T-15-10 / D-16 — 재시도하면 KB 계정이 잠긴다) |
| 소멸 안 함 | 탭이 열려 있으면 `refCount > 0` 이라 유예 소멸 타이머조차 걸리지 않는다 | `release` 는 `refCount > 0` 이면 즉시 반환 |
| 결과 | 그 세션은 **무기한** 남고, 5분 뒤부터 영원히 `stalledCount ≥ 1` | — |
| 판정 | `sessionsOk = (everReadyCount === 0 && stalledCount === 0) \|\| readyCount > 0` 이 `false` 로 굳는다 | `order-api.ts` |

즉 게이트웨이도 VPN 도 멀쩡한데 `/healthz` 가 **영구 503** 이다. 16-30 이 스스로 적어 둔 근거(「상시 적색은 곧 알림 무시다. 그러면 진짜 장애도 함께 놓친다」)를 **반대 방향으로 재현**한 것이다.

### 프로덕션 발현과의 구분 (섞지 말 것)

**R2-CR-02 는 아직 프로덕션에서 발현한 적이 없다.** 이번 라운드 중 관측된 프로덕션 `/healthz` 503 의 원인은 **`DMA_HOST` 배포 회귀**(`deploy-relay.sh` 가 현재 값을 보존하지 않아 실 게이트웨이가 로컬 mock 으로 강등)였고, `DMA_HOST=10.41.1.120` 복구 후 200 `everReadyCount:1` 로 돌아왔다. 그것은 **배포 스크립트 결함**이고, R2-CR-02 는 **코드 결함**이다. 두 결함은 같은 증상(503)을 내지만 원인·수정 위치가 다르다 — 이 plan 이 닫은 것은 후자뿐이다.

## 무엇이 바뀌었나

### Task 1 — `stats()` 가 사유를 본다 (`f2bdb48`)

집계 조건 한 곳만 바뀌었다. **주석을 제외한 코드 변경은 이 분기가 전부다.**

```
- else if (now - entry.createdAt > STALE_SESSION_MS) stalledCount += 1;
+ else if (
+   now - entry.createdAt > STALE_SESSION_MS &&
+   !NO_RETRY_STATES.has(entry.session.state)
+ ) {
+   stalledCount += 1;
+ }
```

| 상태 | 원인 | 5분 초과 시 stalled? |
|---|---|---|
| `connecting` · `reconnecting` | 게이트웨이 프로세스 죽음 / VPN 단절 | **1 (유지)** |
| `logging_in` | TCP 는 붙었는데 LoginResp 무응답 | **1 (유지)** |
| `failed` | 부트 구간 실패(로그인 타임아웃·계좌 대조 실패) | **1 (유지)** |
| `session_rejected` | 자격증명 거부 / 등록 계좌 0건 | **0 (신규 제외)** |
| `unauthorized` | wss 계층이 세션 생성 전에 판정 (세션이 스스로 들어가지 않음) | **0 (신규 제외)** |

문서화(`NO_RETRY_STATES` 선언부 · `SessionStats.stalledCount` docstring · `/healthz` 판정 주석 2곳)에 담은 것:

- 이 카운터가 답하는 질문은 「**게이트웨이가 붙지 못하고 있는가**」이지 「Ready 가 아닌 세션이 있는가」가 아니다
- `session_rejected` 는 재생성되지 않고 유예도 걸리지 않아 무기한 남으므로, 사유를 보지 않으면 영구 적색이 된다
- 16-30 의 원칙이 이 방향으로도 성립하고, 거부된 세션의 사유는 `/healthz` 가 아니라 **그 사용자의 상태 프레임**이 말한다
- 제외 목록의 정본은 `session-manager.ts` 의 `NO_RETRY_STATES` **한 벌**이다 — `order-api.ts` 에 복제하지 않는다

### Task 2 — 두 시나리오를 각각 잠갔다 (`d6f1efb`)

`relay/tests/session-manager.test.ts` **+75줄, 삭제 0줄**.

- **⑩-b** 「자격증명이 거부된 세션은 유예를 한참 넘겨도 stalled 로 세지 않는다」
  - ⑦ 의 레시피(`startFakeGateway({ autoLogin: true, loginResp: { success: false, message: "등록되지 않은 사용자" } })`) + ⑩ 의 벽시계 주입(`now: () => clock`)
  - `clock += STALE_SESSION_MS * 10` 후 **객체 전체 단언**: `toEqual({ sessionCount: 1, readyCount: 0, everReadyCount: 0, stalledCount: 0 })`
  - **`release` 를 부르지 않는다** — 탭이 열려 있는 상태(`refCount > 0`)가 이 갭의 조건이고, 그 사실을 케이스 주석에 적었다
- **⑩-c** 「거부 세션이 옆의 진짜 미Ready 세션을 가리지 않는다 — 제외는 세션 단위다」
  - 같은 매니저 안에 두 사유를 함께 만든다: 거부 게이트웨이로 `user-rejected` → `session_rejected` 확정 → `gw.silenceLogin()` → `user-stalling` → `logging_in` 대기
  - `toEqual({ sessionCount: 2, readyCount: 0, everReadyCount: 0, stalledCount: 1 })`

## 검증

### 자동 검증

| 명령 | 결과 | 기준선(16-36 직후) |
|---|---|---|
| `pnpm --filter @gh-radar/relay test` | **17 files / 378 tests 통과** | 376 (+2) |
| `pnpm --filter @gh-radar/relay run typecheck` | exit 0 | exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 | exit 0 |
| `pnpm -r typecheck` | exit 0 | exit 0 |
| `pnpm -r test` | exit 0 · **2,017 passed** | 2,015 (+2) |

### 승인 기준 실측

**① `NO_RETRY_STATES` 참조 3곳 이상** (`grep -n "NO_RETRY_STATES" relay/src/dma/session-manager.ts`):

| 줄 | 위치 |
|---|---|
| 97 | `SessionStats.stalledCount` docstring (제외 근거) |
| 157 | **선언** |
| 208 | `acquire` — 거부 세션 재사용 로그 분기 (기존, 변경 없음) |
| 305 | **`stats()` — 신규 제외 조건** |

**② `sessionsOk` 판정식 문자열이 동일하다.**

```
변경 전 (order-api.ts:249-250)   변경 후 (order-api.ts:264-265)
const sessionsOk =               const sessionsOk =
  (stats.everReadyCount === 0 &&   (stats.everReadyCount === 0 &&
   stats.stalledCount === 0) ||     stats.stalledCount === 0) ||
   stats.readyCount > 0;            stats.readyCount > 0;
```

줄번호만 15줄 밀렸다(주석 15줄 추가). 문자열은 한 글자도 다르지 않다.

**③ `acquire`·`release` 본문 diff 0줄.** `git diff -U0 -- relay/src/dma/session-manager.ts` 의 hunk 헤더 3개가 전부 두 함수 **밖**이다:

```
@@ -95,0 +96,14 @@ export type SessionStats = {     ← stalledCount docstring
@@ -123,0 +138,18 @@ type Entry = {              ← NO_RETRY_STATES docstring
@@ -268 +300,9 @@ export class SessionManager {    ← stats() 집계 분기
```

`acquire`(187-223) · `release`(229-262) · `RETRYABLE_DEAD_STATES`(163) 모두 무변경. **T-15-10 / D-16 이 그대로다.**

**④ 기존 ⑩ 이 여전히 `stalledCount: 1` 로 통과한다 — GC-WR-07 이 살아 있다.**

```
✓ ⑩ stalledCount 는 생성 직후 0 이고 STALE_SESSION_MS 를 넘기면 1 이 된다 (16-30 / GC-WR-07) 1ms
✓ ⑪ Ready 를 한 번이라도 본 세션은 시간이 아무리 지나도 stalled 로 세지 않는다 1ms
```

이 케이스의 세션은 `logging_in`(응답 없는 게이트웨이)이라 `NO_RETRY_STATES` 밖이다. 「relay 재시작으로 래치가 비어 있는 진짜 게이트웨이 장애가 영원히 초록으로 위장되지 않는다」는 여전히 참이다.

### 회귀 잠금 실증 (무력화 → 실패 확인 → 복원)

`stats()` 의 `!NO_RETRY_STATES.has(...)` 항을 제거해 16-30 원형으로 되돌린 뒤:

| 결과 | 값 |
|---|---|
| 실패 건수 | **2 failed / 11 passed (13)** |
| ⑩-b | `expected stalledCount 0, got 1` — 거부 세션 1개가 곧 전역 degraded |
| ⑩-c | `expected stalledCount 1, got 2` — 세션 단위 제외가 사라짐 |
| ⑩ (GC-WR-07 게이트) | ✓ 통과 유지 — 이 케이스는 제외 조건과 무관함이 실측으로 확인됨 |

복원 후 **13 tests 전부 통과**.

### 실행하지 않은 것과 그 이유

- **재배포하지 않았다** (D-27 · phase 운영 지시). `stalledCount` 의 사유 인식은 아직 프로덕션 `/healthz` 에 없다 — 배포는 종결 plan **16-46** 몫이다.
- **실서버·실계좌 미접속.** `FakeGateway` 만 썼다. `10.41.1.120` 이나 실계좌에 어떤 요청도 보내지 않았다.
- **포매터를 돌리지 않았다** (이 저장소에 prettier 설정이 없다 — 16-30 의 Rule 1 교훈). 테스트 파일 diff 는 **삭제 0줄 / 추가 75줄**이고, 소스 2종의 코드 삭제는 의도한 1줄(`else if` 한 줄 → 블록)뿐이다.

### 저장소 실측 메모 — `10.41.1.120`

`grep -rn "10.41.1.120" relay/src relay/tests` = **1건**: `relay/src/dma/link-health.ts:20` 의 판정 근거 **주석**(산문). 접속 경로는 **0건**이다. 16-30 과 같은 이유로 삭제하지 않았다 — 지우면 D-27 안전장치의 근거가 사라진다.

## Deviations from Plan

### Rule 2 — 근거를 코드에서 재확인해 서술을 정정했다

**1. [Rule 2 - 정확성] R2 리뷰가 말한 `session_rejected` 의 원인이 하나 더 있었다**

- **발견 시점:** Task 1 의 `read_first` (`session.ts` 실독)
- **내용:** R2-CR-02 는 `session_rejected` 를 「자격증명 거부」로만 서술했다. 실제 진입 경로는 `#failNoRetry` **둘**이다 — 자격증명 거부(`LoginResp.success === false`)와 **등록 계좌 0건**(`LoginResp.accounts.length === 0`, `NO_ACCOUNTS_MESSAGE`). 후자를 모르고 제외 조건을 적으면 「이건 게이트웨이 원인 아닌가?」라는 의문이 나중에 남는다.
- **판단:** 둘 다 **그 사용자 한 명의 등록 상태**이고 그 시점 게이트웨이는 정상 응답 중이므로 같은 처분(제외)이 맞다. 재시도해도 결과가 같다는 점도 동일하다.
- **조치:** `NO_RETRY_STATES` 선언부 docstring 에 두 경로를 모두 명시했다. `commit f2bdb48`

### 계획과 다르게 한 것

**2. ⑩-c 를 대체 조합이 아니라 원안(거부 + 무응답)으로 만들었다.** plan 은 「두 게이트웨이가 번거로우면 거부 + Ready 조합으로 `everReadyCount: 1, stalledCount: 0` 을 단언해도 좋다」고 허용했다. 그러나 그 조합은 `stalledCount` 가 **제외 유무와 무관하게 0** 이라 세션 단위 판정을 가르지 못한다(무력화 실증에서 실패하지 않아 회귀 게이트 역할을 못 한다). 매니저 1개로 두 사유를 만드는 방법을 찾아 원안을 지켰다 — `gw.silenceLogin()` 을 두 번째 `acquire` 직전에 호출해 같은 게이트웨이의 응답 방식을 바꾼다.

**3. 별칭 상수를 만들지 않았다.** plan 이 재량으로 남긴 자리다. 위 key-decisions 참조.

## Authentication Gates

없음.

## Known Stubs

없음. 이 plan 이 만든 조건은 실제 집계 경로에 연결돼 있고 `/healthz` 페이로드까지 이어진다.

## Threat Flags

없음 — 새 네트워크 엔드포인트·인증 경로·파일 접근·스키마 변경이 없다. `SessionStats` 의 필드 구성은 그대로이고(수치만, 식별자 없음) 기존 ⑥ 케이스가 이를 계속 잠근다(T-16-45).

**위협 처분 이행:**

| Threat ID | 처분 | 이행 |
|---|---|---|
| T-16-75 (오탐 상시화) | mitigate | `NO_RETRY_STATES` 제외 + ⑩-b 잠금 |
| T-16-76 (진짜 장애 은폐) | mitigate | 기존 ⑩ 이 회귀 게이트로 통과 유지 확인. ⑩-c 로 세션 단위 판정도 잠금 |
| T-16-45 (식별자 노출) | accept | `stats()` 반환 구조 무변경, ⑥ 이 계속 잠근다 |
| T-15-10 (계정 잠금) | accept | `acquire`·`release` diff **0줄** 실측 |

## 요구사항

**TRADE-03 은 Pending 유지.** `requirements.mark-complete` 를 돌리지 않았다 — 코드 층위만 닫혔고 이 변경은 아직 배포되지 않았다(16-46 몫).

## Commits

| Task | 내용 | Commit |
|---|---|---|
| 1 | `stats()` 가 사유를 본다 — `NO_RETRY_STATES` 제외 + 근거 주석 | `f2bdb48` |
| 2 | ⑩-b · ⑩-c 회귀 잠금 (+75줄, 삭제 0줄) | `d6f1efb` |

## Self-Check: PASSED

- `relay/src/dma/session-manager.ts` FOUND · `relay/src/order/order-api.ts` FOUND · `relay/tests/session-manager.test.ts` FOUND
- commit `f2bdb48` FOUND · `d6f1efb` FOUND
