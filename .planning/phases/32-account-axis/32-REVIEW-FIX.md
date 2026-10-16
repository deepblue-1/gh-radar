---
phase: 32-account-axis
fixed_at: 2026-10-16T11:33:40Z
review_path: .planning/phases/32-account-axis/32-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 32: 코드 리뷰 수정 보고서

**수정 시각:** 2026-10-16T11:33:40Z
**원본 리뷰:** .planning/phases/32-account-axis/32-REVIEW.md
**반복 회차:** 1

**요약:**
- 범위 안 지적: 6건 (critical_warning — WR-01 ~ WR-06, IN-* 는 범위 밖)
- 수정: 6건
- 건너뜀: 0건

**검증 위치:** 메인 체크아웃 `/Users/alex/repos/gh-radar` (master)이다. 오케스트레이터 지시에 따라 worktree 를 만들지 않았다. 아래 수치는 이 트리에서 그대로 재현된다.
- `pnpm --filter @gh-radar/shared build` 뒤 relay 전체 `vitest run --maxWorkers=2` → 57 파일 · 1627 통과
- relay `typecheck` · `typecheck:tests` 통과
- webapp `typecheck`(`tsc --noEmit` + e2e tsconfig) 통과
- webapp vitest(`src/lib/__tests__` · `src/components/trading/__tests__` · `src/components/me/__tests__` · workbench · layout) → 84 파일 · 2793 통과 · 1 skip
- 수정마다 실패 → 통과 테스트를 붙였다. WR-04 · WR-06 은 수정을 잠시 되돌려 새 테스트가 실패하는 것도 확인했다.
- Playwright 는 돌리지 않았다(영향 spec 없음).

**배포 영향:**
- **relay 재배포가 필요한 수정:** WR-01(hub `strategies.disabled` 에 `accountNo`), WR-02(fanout 0답 종료 거부 프레임), WR-03(hub `accounts` 리스너 · 21 재요청). 순서는 relay 먼저, push 나중이다.
- **webapp 만:** WR-04 · WR-05 · WR-06. WR-01 · WR-02 의 웹 쪽도 webapp 에 있다.
- 와이어는 하위 호환이다. `accountNo` 는 선택 필드라 구 relay 와 섞여도 웹이 종전 FIFO 로 떨어진다. 0답 거부도 기존 `msg` 슬롯을 그대로 쓴다.

## 수정한 지적

### WR-01: 「이 계좌 끄기」 대기 해제가 계좌가 아니라 FIFO 맨 앞을 푼다

**수정 파일:** `packages/shared/src/relay.ts`, `relay/src/hub/subscription-hub.ts`, `webapp/src/lib/use-relay-socket.ts`, `webapp/src/components/trading/strategy-status-card.tsx`, 테스트 `relay/tests/hub-multi-session.test.ts` · `relay/tests/fanout.test.ts` · `relay/tests/fanout-multi-session.test.ts` · `webapp/src/lib/__tests__/relay-socket.test.ts` · `webapp/src/components/trading/__tests__/strategy-status-card.test.tsx`
**커밋:** cd4859d9
**적용한 수정:**
- 공유 타입 `RelayStrategiesDisabledMsg` 에 선택 필드 `accountNo?` 를 더했다.
- hub `#finishAccountStop` 이 계좌 끄기 집계 완료에 그 계좌를 싣는다. 전부 정지 · 서버 발 65 는 종전처럼 계좌가 없다.
- 상태 카드는 프레임의 계좌로 그 계좌 대기만 푼다. 대기에 없는 계좌(다른 탭이 끈 계좌)의 완료는 아무것도 풀지 않는다. 계좌가 없는 프레임만 종전대로 맨 앞을 푼다.
- 소켓 훅의 킬 스위치 in-flight 카운터를 「보낸 순서대로의 계좌 목록」 으로 바꿨다(전부 정지 = `""`). 계좌를 실은 완료는 그 계좌 항목만 빼므로 다른 탭 계좌의 완료가 이 탭 창을 닫지 않는다. 헬퍼는 `releaseKillSwitch` 다.

### WR-02: 계좌 끄기 거부 · 0답 종료가 웹 킬 스위치 in-flight 창을 8초 동안 열어 둔다

**수정 파일:** `relay/src/ws/fanout.ts`, `relay/src/hub/subscription-hub.ts`(주석), `webapp/src/lib/use-relay-socket.ts`, `webapp/src/components/trading/strategy-status-card.tsx`, 테스트 `relay/tests/fanout-multi-session.test.ts` · `webapp/src/lib/__tests__/relay-socket.test.ts` · `webapp/src/components/trading/__tests__/strategy-status-card.test.tsx`
**커밋:** b82f6520
**적용한 수정:**
- relay: 집계가 받은 것 0 으로 끝나면(`ended !== "closed"` ∧ answered 0 ∧ VI 에코 없음 — 시한 · 소유 세션 교체 · 분리 · 전부 송신 실패) `done` 에서 요청 탭에 계좌를 실은 거부를 1건 보낸다. 상수는 `ACCOUNT_DISABLE_UNCONFIRMED_TEXT` 고, 전부 송신 실패면 송신 실패 문구를 쓴다. 이제 relay 의 계좌 끄기 1건은 「계좌를 실은 `strategies.disabled` 1건」 아니면 「계좌를 실은 거부 1건」 으로 끝난다.
- 웹: 끝 신호 판정 `isAccountDisableRejection` 을 두었다. 조건은 `lv ERROR` ∧ `src "Relay"` ∧ `kind "strategies.disable.account"` ∧ `a` 비어 있지 않음이다. 계좌가 빈 같은 kind 통지(송신 · 조립 실패 중간 통지)는 끝 신호가 아니다.
- 소켓 훅: 이 거부가 오면 in-flight 창에서 그 계좌를 뺀다.
- 카드: 같은 거부가 오면 그 계좌 대기를 풀고 relay 원문(「이 계좌에 끌 전략이 없어요」 등)을 오류 줄에 보인다. 백스톱 타이머도 지운다.
- 남은 한계(범위 밖): `#readySession` 의 세션 없음 · 미준비 거부는 `state` 프레임이라 계좌 끝 신호가 되지 못한다. 카드 버튼이 `ready` 가 아니면 비활성이라 실사용 경로는 경합뿐이다.

### WR-03: Ready 중 추가 선언된 계좌의 VI 슬롯을 relay 가 영영 묻지 않는다

**수정 파일:** `relay/src/hub/subscription-hub.ts`, 테스트 `relay/tests/hub-multi-session.test.ts`
**커밋:** 704f3717
**적용한 수정:**
- `HubSession` 에 `on("accounts")` 오버로드를 더했고, `attach` 가 이 이벤트를 듣는다.
- `#onAccounts`: 결선된 정본 세션이고 Ready 일 때만 동작한다. 그 세션 소유 계좌 중 KRX · NXT 슬롯이 하나라도 모름인 계좌가 있으면 21(KRX → NXT)을 다시 요청한다.
- 같은 회선이라 앞서 보낸 21 의 답이 아직 올 수 있다. 그래서 `#requestViTriggers(..., { append: true })` 로 대기열을 버리지 않고 이어 붙인다. 버리면 머리 귀속이 밀린다.
- 대여 중이면 기존 `refetchVi` 경로로 반납 때까지 미룬다. 87 제외처럼 계좌가 빠지기만 했으면 모름 계좌가 없어 무동작이다.
- 미준비 세션 · 교체된 옛 세션의 `accounts` 는 21 을 보내지 않는 것도 테스트로 잠갔다.
- 사람 확인 권장: 21 대기열 귀속 규칙에 닿는 논리 수정이다. 단위 테스트는 새 서버 모양(선언 계좌마다 61)만 검증했다. 구 서버 모양(거래소당 1프레임) + 재요청이 겹친 실서버 동작은 배포 뒤 VI 행 잠금 해제로 확인하는 것이 좋다.

### WR-04: /me 설정 탭 저장 기계가 서버 전환을 넘어 상태를 들고 간다

**수정 파일:** `webapp/src/components/trading/me-client.tsx`, 테스트 `webapp/src/components/trading/__tests__/me-client.test.tsx`
**커밋:** 10a2bd06
**적용한 수정:** 리뷰 권고대로 호출부에 `key={settingsServerKey ?? ""}` 를 두었다. 서버가 바뀌면 `LimitChaserDefaultsSection` 의 저장 기계(직전 84 · 실패 · 거부 원문 · 대기열)가 새로 시작한다. 비행 중 언마운트는 `useBusyReport` 가 잠금을 false 로 돌린다. KB120 → KYOBO119 칩 전환에서 `data-flash="ok"` 행이 0 인지 보는 회귀 테스트를 더했다(수정 전에는 실패).

### WR-05: `?account=` 가 URL 에 남아 새로고침이 나중 선택을 되돌린다

**수정 파일:** `webapp/src/components/trading/workbench/trading-workbench.tsx`, 테스트 `webapp/src/components/trading/__tests__/trading-workbench.test.tsx`
**커밋:** 04c22d53
**적용한 수정:** `clearAccountParam` 을 두었다. `?code=` 의 `clearCodeParam` 과 같은 방식으로 `account` 만 `replaceState` 로 지운다. 부르는 곳은 셋이다.
- 마운트 소비 직후. 이미 그 계좌라 전환이 없을 때도 포함한다.
- `pickAccount`. 보류 중에 사용자가 고르면 보류를 버린다.
- `?account=` 값을 따르는 효과. 보류가 없을 때 들어온 값을 지운다 — 이미 `/trading` 위에서 VI 줄을 누르면 이벤트가 계좌를 바꾸고 Link 이동이 값을 남기는 경로다.

이 넷(마운트 소비, 전환 없는 소비, 보류 폐기, VI 줄 경로)을 테스트로 잠갔다. 다른 파라미터(`focus` 등)는 남는다.

### WR-06: /me 기본 계좌 칩이 한 렌더 동안 첫 계좌로 섰다가 기억 계좌로 바뀐다

**수정 파일:** `webapp/src/components/trading/me-client.tsx`, 테스트 `webapp/src/components/trading/__tests__/me-client.test.tsx`
**커밋:** 5191ea13
**적용한 수정:**
- 기억값을 읽은 사용자를 `savedFor` 로 기록한다.
- `savedRead = !authLoading && savedFor === userId` 일 때만 기본 선택(`meAccountOf`)을 한다. 작업대의 `layoutRestored` 와 같은 게이트다.
- 리뷰 권고(`userId !== ""`)는 쓰지 않았다. 그 조건이면 로그인 사용자가 없는 경로(Provider 밖)에서 칩이 영영 서지 않는다. 그래서 「인증 확인 중이 아님 ∧ 지금 사용자 기준으로 읽음」 으로 바꿨다.
- 테스트는 기억 계좌 B 가 있을 때 잔고 패널이 받은 계좌가 B 뿐인지 확인한다. 게이트를 빼면 실패하는 것도 확인했다.
- 테스트 파일에 `@/lib/auth-context` 목(기본 사용자 없음)과 패널 렌더 기록을 더했다.

---

_수정: 2026-10-16T11:33:40Z_
_수정자: Claude (gsd-code-fixer)_
_반복 회차: 1_
