---
phase: 25-order-log-progress
fixed_at: 2026-09-29T22:15:23Z
review_path: .planning/phases/25-order-log-progress/25-REVIEW.md (1라운드) + .planning/phases/25-order-log-progress/25-REVIEW-R2.md (2라운드)
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 25: 코드 리뷰 수정 보고서

**수정 시각:** 2026-09-29T22:15:23Z
**원본 리뷰:** `25-REVIEW.md`(1라운드 WR-01 · WR-03 · WR-04 · WR-05) + `25-REVIEW-R2.md`(2라운드 R2-WR-01). 두 파일 모두 고치지 않았다.
**반복 회차:** 1

**요약:**
- 범위 안 finding: 5 (Critical 0 · Warning 5)
- 수정: 5
- 건너뜀: 0
- 범위 밖: 1라운드 WR-02(25-13 으로 이미 닫힘 · R2 판정) · 모든 Info(IN-xx · R2-IN-xx)

**영향 받는 배포 단위:** relay(R2-WR-01 · WR-01), webapp(WR-03 · WR-04 · WR-05). server · DB 마이그레이션 변경 없음. 배포는 하지 않았다.

**검증을 돌린 곳:** 격리 worktree(`.claude/worktrees/rf-25-*`, `pnpm install --frozen-lockfile --offline` 으로 의존성 설치 · `@gh-radar/shared` 빌드)에서 돌렸다. 메인 체크아웃에서 돌린 숫자가 아니다. worktree 는 정리 단계에서 지웠다.
- relay: `pnpm run typecheck` · `pnpm run typecheck:tests` 통과. `vitest run` 전량 **30 파일 · 747 통과**.
- webapp: `pnpm run typecheck`(앱 + e2e tsconfig) 통과. `vitest run` 전량 **136 파일 · 3056 통과 · 1 skip**.
- 수정마다 수정 전 소스로 되돌려 새 회귀 테스트가 **실패하는지** 확인했다(R2-WR-01 3건 · WR-05 3건 · WR-03 3건 실패 → 수정 후 통과. WR-01 · WR-04 는 기존 기대값이 바뀌는 수정이라 옛 동작에서는 바로 깨진다).
- **Playwright e2e 는 실행하지 못했다.** worktree 에서 e2e 를 돌리려면 `webapp/.env.local` · `.env.test.local` 을 링크해야 하는데, 비밀 파일 가드가 막았다. WR-05 때문에 바뀐 e2e 기대값(`order-log.spec.ts` P25-1 · P25-8 조회 수)은 코드 경로를 따라가 추론해서 고쳤다. 메인 체크아웃에서 `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/order-log.spec.ts` 로 한 번 확인해야 한다.

## 수정한 항목

### R2-WR-01: 같은 세션 재접속(Ready 아님) 동안의 83 이 캐시만 바꾸고 브라우저에는 알리지 않는다

**상태:** 수정 완료. 사람 확인 필요(상태 동기화 로직)
**수정 파일:** `relay/src/hub/subscription-hub.ts`, `relay/tests/hub.test.ts`
**커밋:** e67ee572
**적용한 수정:**
- 리뷰가 제안한 「Ready 마다 무조건 snap」 대신 **어긋남 표시**를 두었다. `#progressUnsynced`(userId 집합)다.
- `#onQueueProgress` 가 Ready 이전에 캐시를 바꾸면 이 표시를 남긴다. 빈→빈 억제로 캐시가 안 바뀐 경우는 표시하지 않는다.
- `#onReady` 는 표시가 있을 때만 **현재 캐시 그대로** `unf.progress` snap:true 를 1회 팬아웃한다. 캐시 값을 그대로 다시 보내므로 한 세션 안의 D-13 「마지막 값 유지」 를 깨지 않는다. Ready 이전 83 이 없던 Ready 재진입은 프레임을 내지 않는다(소음 0).
- `#clearCaches` 는 `clearedProgress > 0 || 표시 있음` 일 때 초기화 스냅을 낸다. 그래서 리뷰가 지적한 「이미 캐시가 비어 이후 교체 때도 `clearedProgress === 0` 이라 스냅이 안 나가는」 경로도 닫힌다. `closeAll` 은 표시도 비운다.
- 주석 1 · 3 · 5항의 「여기뿐이다」 · 「사본도 비어 있다」 · 「`#onReady` 는 건드리지 않는다」 문장을 실제 동작에 맞게 고쳤다.
- 회귀 테스트 4건:
  - 리뷰가 적은 재현: `isReady=false` 에서 빈 83 → `emitReady()` → 사본 모델에 키 없음
  - Ready 이전의 비어 있지 않은 갱신이 재동기화 스냅에 실림(다른 키의 마지막 값은 유지)
  - Ready 이전 83 이 없던 Ready 재진입은 소음 0
  - Ready 이전 삭제 뒤 세션 교체가 초기화 스냅을 냄

### WR-01: 전략 기록기 장애가 공유 관찰자 소켓을 통해 주문 저널 적재를 멈춘다

**상태:** 수정 완료. 사람 확인 필요(역압 · 재개 로직)
**수정 파일:** `relay/src/journal/observer.ts`, `relay/src/journal/types.ts`, `relay/src/journal/status.ts`, `relay/src/dma/envelope.ts`, `docs/relay-operations.md`. 테스트: `relay/src/dma/__tests__/envelope.test.ts`, `relay/tests/journal-observer.test.ts`, `journal-status.test.ts`, `journal-codec.test.ts`, `journal-boot.test.ts`, `journal-gateway.test.ts`, `order-api.test.ts`
**커밋:** dd1b6c14
**적용한 수정:**
- **역압 분리.** 전략 기록기가 `overflow` 를 내도 소켓을 끊지 않는다. 대신 `#strategyPaused = "overflow"` 로 **전략 수신만 멈춘다**.
  - 멈춘 동안 들어오는 프레임은 주문 레코드만 적재하고 전략분은 버린다. 전략 since 는 전진하지 않는다.
  - 전략 pending 을 내리므로 주문 caught_up 만으로 live 에 머문다. 따라서 `journal.state` 와 `/healthz` 503 으로 번지지 않는다.
- **자동 재개.** 멈춘 뒤 전략 큐가 비면(적용 복구) 다음 프레임에서 주문분을 먼저 적재한다. 그다음 「전략 큐 해소 — 전략 이어받기」 로 재로그인 1회를 해 `strategySinceSeq` 부터 이어받는다. 멈춤 표시는 로그인 성공 때마다 지운다.
- **파서 경계 검증.** `parseJournalBatch` 가 적용 RPC 의 엄격 캐스트 키를 검사한다. `seq` 는 안전 정수이고 0 보다 커야 하며, `trade_date` 는 실제 달력 날짜인 `YYYY-MM-DD` 여야 한다.
  - 위반 이벤트를 만나면 **그 앞까지만** 올리고 `strategyContractViolation {seq, field}` 로 표시한다. 이때 `strategyCaughtUp` 은 거짓이고 error 로그를 남긴다(식별자 없음).
  - 관찰자는 위반 표시를 보면 `paused = "contract"` 로 멈춘다. 이 경우는 자동 재개하지 않는다. 재로그인해도 같은 이벤트가 재생될 뿐이라 게이트웨이 쪽 수정이 필요하다. 이 사이 주문 저널은 계속 받는다.
  - 프레임 전체를 malformed 로 버리지 않은 이유: 그렇게 하면 주문 레코드까지 재접속 루프에 갇힌다.
- **관측.** `/healthz` `journal.strategy` 에 `paused: "overflow" | "contract" | null` 을 더했다(503 판정 밖 · 식별자 없음). 운영 문서의 「주문 기록도 멈춘다」 문단을 새 동작으로 고쳤다.
- 전략 `gap` 은 종전대로 끊는다. 재로그인 한 번으로 풀리는 일시 현상이기 때문이다.
- 리뷰가 제안한 「N분 지속 시 별도 알림」 은 넣지 않았다. relay 로그는 Cloud Logging 에 없어서 로그 기반 알림을 만들 수 없다. 대신 `/healthz` 본문의 `paused` · `dbError` 가 원격에서 보이는 신호다.
- 테스트:
  - 파서 위반 4종(seq 0 · 빈 날짜 · YYYYMMDD · 2월 30일)과 정상(null)
  - 관찰자 overflow → 멈춤 · live 유지 · 주문 계속
  - 멈춤 중 큐 해소 → 재로그인 1회 → 전략 since 이어받기
  - 계약 위반 → 멈춤 · 자동 재개 없음
  - status `paused` 노출
  - 기존 「전략 큐 상한 → 끊기」 테스트는 새 동작 기대값으로 바꿨다

### WR-04: `noopener` 때문에 창 분리 재사용(R4)이 성립하지 않는다

**상태:** 수정 완료
**수정 파일:** `webapp/src/lib/order-log-feed.ts`, `webapp/src/components/trading/order-log/order-log-panel.tsx`, `webapp/src/components/trading/order-log/__tests__/order-log-panel.test.tsx`
**커밋:** 660c5a2a
**적용한 수정:**
- `ORDER_LOG_WINDOW_FEATURES` 에서 `noopener` 를 뺐다(`'width=960,height=720'`). 이유는 주석에 적었다.
- 새 `openOrderLogWindow(url)` 는 같은 이름으로 연다. 창이 열리면 `opener = null`(try/catch)로 끊고 `focus()` 한다. 팝업이 막혀 `null` 이 오면 아무것도 하지 않는다.
- 단위 테스트를 갱신했다:
  - features 에 noopener 가 없다
  - 연 창의 opener 가 null 이다
  - focus 가 1회 불린다
  - 다시 누르면 같은 이름으로 연다
  - `null` 반환이어도 예외가 없다
- Playwright 로 실제 창 재사용을 단언하는 e2e 는 선택 사항이라 추가하지 않았다(오케스트레이터 지시).

### WR-05: 첫 ready 건너뛰기 규칙이 「복원 응답 ~ relay 인증」 사이 이벤트를 영구 누락시킨다

**상태:** 수정 완료. 사람 확인 필요(재조회 타이밍 로직)
**수정 파일:** `webapp/src/lib/use-order-log-feed.ts`, `webapp/src/lib/__tests__/use-order-log-feed.test.tsx`, `webapp/e2e/specs/order-log.spec.ts`
**커밋:** 0172e2b8
**적용한 수정:**
- 첫 ready 건너뛰기(`wasReadyRef`)를 없앴다. 마운트 때 relay 가 ready 가 아니었으면 **첫 ready 전이에서도** 오늘 피드를 1회 재조회한다(O(1)).
- 리뷰가 제안한 「조회 완료 뒤에 온 ready 만」 보다 한 걸음 더 갔다. 조회가 아직 진행 중일 때 ready 가 와도 새로 조회한다. 진행 중인 요청의 DB 읽기 시점이 인증 전일 수 있기 때문이다. 옛 응답은 기존 `reqRef` 가 버린다.
- 마운트 때 이미 ready 였으면 전이가 아니므로 추가 조회가 없다. 폴링도 없다.
- 단위 테스트:
  - 첫 ready 재조회 + 재진입, ready 유지 중 리렌더
  - 복원 뒤 · 인증 전에 적재된 줄이 채워짐
  - 진행 중인 마운트 조회를 교체하고 늦은 옛 응답을 버림
  - 이미 ready 면 1회
- e2e 기대값을 갱신했다(**미실행**):
  - P25-1: 조회 수 `1` → `1 이상 2 이하`
  - P25-8: 창 분리 열림 시 조회 2회(poll) · 날짜 이동 3회 · 오늘 복귀 4회

### WR-03: `hidden` 으로 가려진 동안 줄이 늘면 맨 아래 고정이 깨진다

**상태:** 수정 완료. 사람 확인 필요(실제 브라우저 스크롤 동작)
**수정 파일:** `webapp/src/lib/use-stick-to-bottom.ts`, `webapp/src/lib/__tests__/use-stick-to-bottom.test.tsx`
**커밋:** d2453648
**적용한 수정:**
- 호출자(card-tabs · strategy-card · shared-panels)는 고치지 않았다. 훅 한 곳에서 해결했다.
- `clientHeight === 0`(display:none)이면 가려진 것으로 본다. 이때 줄 증가 판정을 건너뛰고 「맨 아래였다」 상태를 보존한다. 올려 보던 중이었으면 새 줄 수만 pending 에 누적한다.
- 가려지는 순간 브라우저가 scrollTop 을 0 으로 되돌리며 내는 scroll 이벤트도 무시한다. 무시하지 않으면 「맨 아래」 가 잘못 뒤집힌다.
- ResizeObserver 가 `clientHeight` 0 → >0 전이(다시 보임)를 잡는다. 맨 아래였으면 `scrollTop = scrollHeight` 로 맞춘다. 상태는 `atBottomRef` 로 동기 판정한다.
- 회귀 테스트 3건: 가려진 동안 증가한 뒤 복귀, 가림 순간의 scroll 이벤트, 올려 보던 중이면 pending 유지하고 끌어내리지 않음.
- 실제 브라우저의 display:none 스크롤 동작은 jsdom 가짜 기하로만 검증했다. 카드 접힘 → 푸시 → 펼침을 실기기에서 한 번 확인하기를 권한다.

---

_수정 시각: 2026-09-29T22:15:23Z_
_수정자: Claude (gsd-code-fixer)_
_반복 회차: 1_
