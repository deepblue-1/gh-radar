---
phase: 39-trade-diagnosis-chatbot
fixed_at: 2026-11-09T06:08:00Z
review_path: .planning/phases/39-trade-diagnosis-chatbot/39-REVIEW.md
iteration: 1
findings_in_scope: 13
fixed: 13
skipped: 0
status: all_fixed
---

# Phase 39: 코드 리뷰 수정 보고

**Fixed at:** 2026-11-09T06:08:00Z
**Source review:** .planning/phases/39-trade-diagnosis-chatbot/39-REVIEW.md
**Iteration:** 1

**Summary:**
- 범위 안 지적: 13건(fix_scope=all — WR 8 · IN 5, necessity 1건 포함)
- 수정: 13건
- 건너뜀: 0건

**검증을 돌린 곳:** 격리 worktree(`.claude/worktrees/rf-39-*`, `pnpm install --frozen-lockfile --offline` 로 의존성 준비). 커밋은 fast-forward 로 master 에 그대로 올라가므로 main checkout 에서 같은 명령으로 다시 돌릴 수 있다.
- 지적마다 관련 테스트 파일만 실행했다(`--maxWorkers=2`).
- 마지막 일괄 실행: server `src/services/specialists/__tests__/`(진단 5파일) + `chat-orchestrator` · `chat-service` · `routes/__tests__/chat.route` 테스트 8파일 135건 통과. webapp `message-render.test.tsx` 16건 통과.
- `pnpm --filter @gh-radar/server run typecheck` · `pnpm --filter @gh-radar/webapp run typecheck` 통과. 참고로 server typecheck 범위에는 `__tests__` 가 들어가지 않는다.
- packages/shared 는 고치지 않았다. 테스트 전에 빌드만 했다.

## Fixed Issues

### WR-01: 상한에 걸린 사용자의 시도도 전역 하루 카운터를 소모 — 한 사용자가 전원의 진단을 막을 수 있다

**Status:** fixed: requires human verification
**Files modified:** `server/src/services/specialists/diagnosis/diagnosis-specialist.ts`, `server/src/services/specialists/__tests__/diagnosis.test.ts`
**Commit:** a6c153bb
**Applied fix:** `checkDailyCap` 이 사용자 카운터(`chat_diagnosis:<userId>`)를 먼저 올려 판정한다. 통과했을 때만 전역 카운터(`chat_diagnosis`)를 올린다. 사용자 상한에 걸린 시도는 전역 RPC 를 부르지 않는다. 이를 확인하는 테스트를 추가했다. env 이름(`CHAT_DIAGNOSIS_DAILY_CAP` · `CHAT_DIAGNOSIS_USER_DAILY_CAP`)과 fail-closed 동작은 그대로다. 전역 상한에 걸린 시도는 사용자 카운터를 1 소모하는데, 본인 몫이라 그대로 두었다.

### WR-02: `linkifyTickPaths` 정규식이 백틱·`**`·`|`·한글 조사·끝 마침표까지 URL 로 삼키고, 코드 블록 안까지 다시 쓴다

**Status:** fixed
**Files modified:** `webapp/src/components/chat/message-assistant.tsx`, `webapp/src/components/chat/__tests__/message-render.test.tsx`
**Commit:** ea6c2328
**Applied fix:** 링크로 바꾸는 범위를 두 가지로 좁혔다.
- 주소 패턴: 쿼리 문자를 `[A-Za-z0-9=&:.%-]` 로 제한하고 영숫자로 끝나게 했다. 백틱 · `*` · `|` · 공백 · `)` · `]` · 한글 앞에서 멈추고, 문장 끝 마침표는 주소에 넣지 않는다.
- 건드리지 않는 구간: 줄 단위로 펜스 코드 블록(``` · ~~~, 닫히지 않은 펜스는 문서 끝까지)을 건너뛴다. 문단 안에서는 인라인 코드 · 기존 `[…](…)` 링크(`<…>` 목적지 포함) · `<…>` 자동 링크를 건너뛴다.

리뷰가 실측한 여섯 가지 꼴을 모두 단위 테스트로 고정했다. server-log 블록 안 주소가 원문 그대로 남는지 보는 렌더 테스트도 추가했다. 기존 렌더 테스트는 모두 통과한다.

### WR-03: 「임의 내부 화면 금지」 가드를 상대 경로로 우회할 수 있다

**Status:** fixed
**Files modified:** `webapp/src/components/chat/message-assistant.tsx`, `webapp/src/components/chat/__tests__/message-render.test.tsx`
**Commit:** 59a4d053
**Applied fix:** `a` 렌더러는 이제 세 갈래다.
- 틱뷰어(`/analytics/ticks?`): `next/link` 로 같은 탭에서 연다.
- 절대 `http(s)://`: 새 탭으로 열고 `noreferrer` 를 붙인다.
- 그 밖 전부(`/…` · `//host` · `trading/…` · `./…` · `?…` · `../…` · `javascript:`): 링크 없이 글자만 남긴다.

파일 머리 주석을 고쳤고 상대 경로 테스트를 추가했다.

### WR-04: 시세 창 수집기가 「수신 시각 단조」 를 가정하고 일찍 멈춘다 — 레코드가 조용히 빠지거나 거짓 「기록 없음」 이 나온다

**Status:** fixed: requires human verification
**Files modified:** `server/src/services/specialists/diagnosis/diagnosis-market.ts`, `server/src/services/specialists/__tests__/diagnosis-market.test.ts`
**Commit:** 1b0717bd
**Applied fix:** `TickWindow.push` 가 창 밖 레코드를 만나도 멈추지 않고 늘 건너뛴다(`true`). 읽기를 멈추는 경우는 레코드 상한(400)에 닿았을 때뿐이다.
- 창 뒤 디코딩 여유를 5초에서 60초(`RECV_LATE_SLACK_NS`)로 넓혔다. 수신이 늦은 창 안 레코드도 들어온다.
- 창 앞 여유는 5초 그대로다. 수신 시각이 거래소 시각보다 크게 앞설 수는 없어서다.
- 격자와 당일 바이트는 종목 하나의 하루치라서 끝까지 훑어도 비용이 작다. 창 밖 레코드는 디코딩하지 않는다.

수신 순서가 뒤집힌 경우와 5초 넘게 늦게 받은 경우를 테스트로 추가했다.
**사람 확인 권장:** 60초 여유가 실제 엣지 끊김 패턴(재전송 지연 폭)을 덮는지 운영 자료로 확인이 필요하다.

### WR-05: 당일 경로가 `X-Tick-Complete` 를 무시한다 — 구멍 난 하루를 완결 자료로 취급한다

**Status:** fixed
**Files modified:** `server/src/services/tick-live-fetch.ts`, `server/src/services/specialists/diagnosis/diagnosis-market.ts`, `server/src/services/specialists/diagnosis/diagnosis-knowledge.ts`, `server/src/services/specialists/__tests__/diagnosis-market.test.ts`
**Commit:** ae4dfb93
**Applied fix:**
- `fetchLiveBytes` 가 `ready` 응답에서 `X-Tick-Complete: false` 를 보면 결과에 `incomplete: true` 를 싣는다.
- 시세 도구는 이 경우 줄 뒤, 틱 보기 링크 앞에 `LIVE_INCOMPLETE_NOTE`(「자료 일부 누락: 당일 수집에 구멍이 있음 — …」)를 붙인다. 창이 비면 「자료 없음: … 당일 수집에 구멍이 있어 체결 없음으로 볼 수 없음」 을 낸다. 둘 다 info 로그를 남긴다.
- 진단 프롬프트 [근거 규칙] 에 「누락 구간을 체결 · 호가 변화가 없었다는 근거로 쓰지 말 것」 을 추가했다.

### WR-06: 하드 중단(마감 + 30초)이 도구 실행을 끊지 못한다

**Status:** fixed: requires human verification
**Files modified:** `server/src/services/specialists/diagnosis/diagnosis-specialist.ts`, `server/src/services/specialists/__tests__/diagnosis.test.ts`
**Commit:** 874e14d7
**Applied fix:** 한 라운드 도구 묶음을 새 헬퍼 `runToolsUntil` 로 돌린다. 이 헬퍼는 도구 묶음을 진단 마감 타이머, `signal`(강제 중단 + 호출자 abort)과 경주시킨다.
- 마감까지 못 끝난 도구는 `DIAGNOSIS_TOOL_TIMEOUT_TEXT`(「조회 시간 초과 — 결과 없음」)로 채운다. 끝난 도구 결과는 그대로 싣고 마무리 콜로 간다. 그래서 30초 여유 안에서 받아 둔 자료로 답한다.
- abort 가 오면 도구 대기를 바로 끊고 기존 catch 분기(timeout · aborted)로 간다.
- 멈춘 하위 호출(Supabase RPC · `storage.download` · tickgw)은 끊지 않고 버려 둔다. 리뷰가 제안한 개별 `AbortSignal.timeout` 배선은 하지 않았다. 위 경주만으로 응답 시간은 묶이기 때문이다.

멈춘 RPC 상황과 호출자 abort 상황을 테스트로 추가했다.
**사람 확인 권장:** 버려진 하위 요청의 소켓이 Cloud Run 인스턴스에 오래 남지 않는지 운영 로그로 확인이 필요하다.

### WR-07: 진단 시간 예산이 상담 1회 단위뿐이다 — 한 턴에서 진단을 두 번 부르면 Cloud Run 300초를 넘는다

**Status:** fixed: requires human verification
**Files modified:** `server/src/services/specialists/diagnosis/diagnosis-specialist.ts`, `server/src/services/chat-service.ts`, `server/src/config.ts`, `server/src/services/specialists/__tests__/diagnosis.test.ts`, `server/src/services/__tests__/chat-service.test.ts`
**Commit:** 1c48d67f
**Applied fix:** 진단 시간 예산을 턴 단위 하나로 묶었다.
- `chat-service` 가 팀장 루프 시작 전에 `diagnosisTurnDeadlineAt = now + chatDiagnosisDeadlineMs` 를 한 번 잡는다. 이 값을 진단 ctx 의 `turnDeadlineAt` 으로 넘긴다.
- 진단은 `min(자기 마감, 턴 마감)` 을 쓴다.
- 남은 예산이 `min(30초, 설정 마감)` 보다 적으면 하루 상한을 올리기 전에 `DIAGNOSIS_TURN_BUDGET_TEXT` 로 끝낸다. 상한 · Opus 호출은 0회다.

`config.ts` 주석에 「턴 단위 예산」 을 적었다. ctx 키 목록 테스트를 고쳤고, 두 라운드 진단이 같은 턴 마감을 받는지, 턴 마감 소진과 단축이 맞는지 테스트를 추가했다.
**사람 확인 권장:** 같은 라운드 병렬 진단은 같은 마감을 공유해 시간은 묶이지만 Opus 비용은 각각 든다(호출 횟수 제한은 두지 않았다).

### WR-08: 주문로그 도구의 전략 이벤트·상태전이 줄에 계좌 표기가 없다 — 다계좌 사용자의 진단이 모호해진다

**Status:** fixed
**Files modified:** `server/src/services/specialists/diagnosis/diagnosis-order-log.ts`, `server/src/services/specialists/diagnosis/diagnosis-knowledge.ts`, `server/src/services/specialists/__tests__/diagnosis.test.ts`
**Commit:** d544046a
**Applied fix:**
- `eventLine` 앞에 주문 · 체결 줄과 같은 `[서버 …끝4자리]` 를 붙인다.
- 시세 이벤트는 `isMarketStrategyEvent(kind)` 로 판정한다(빈 계좌번호 비교 금지 T-25-01). 이 경우 `[서버 시세]` 를 붙인다.
- 계좌번호 전체는 싣지 않는다.
- 프롬프트 `[주문로그 읽는 법]` 의 이벤트 줄 꼴과 「계좌 표기로 줄을 가르라」 규칙을 함께 고쳤다.

### IN-01: 틱 링크 `t` 의 시계가 프롬프트 안에서 서로 어긋나고, 「모델이 URL 을 짓지 않는다」 주석이 실제와 다르다

**Status:** fixed
**Files modified:** `server/src/services/specialists/diagnosis/diagnosis-knowledge.ts`, `server/src/services/specialists/diagnosis/diagnosis-market.ts`, `server/src/services/specialists/__tests__/diagnosis-knowledge.test.ts`
**Commit:** f4471b4a
**Applied fix:** [출력 모양] 4번에 링크 시각 규칙 두 가지를 추가했다.
- 어느 시각으로 여나: 시세 줄이 있으면 사건 틱 시각을 쓴다. 주문로그 시각밖에 없으면 정확히 1초를 뺀 시각으로 연다(「지어내기 금지」 의 유일한 예외로 명시).
- NXT 이면 `&ex=NXT` 를 반드시 넣는다.

CLOCKS 절은 「화면은 수신 시각으로 커서를 잡는다 · 도구 링크 t = 창 첫 레코드 수신 시각」 으로 맞췄다. `diagnosis-market.ts` 머리의 D-04 주석은 현재 설계(진단문 안 링크는 모델이 짓는다)로 고쳤다. 줄마다 서버가 링크를 붙이는 안은 택하지 않았다(400줄 × 링크 토큰 비용). 프롬프트 문자열 테스트를 추가했다.

### IN-02: 당일 경로가 프레임마다 `zstdDecompressSync` 로 동기 해제한다 — 창 앞 프레임까지 전부

**Status:** fixed
**Files modified:** `server/src/services/specialists/diagnosis/diagnosis-market.ts`
**Commit:** 6e630d6e
**Applied fix:** 당일 경로가 지난 날짜 경로의 `windowOfCompressed`(비동기 스트리밍 해제)를 그대로 쓴다. `zstdSupported` 는 이제 `createZstdDecompress` 만 확인한다. 기존 「이어붙인 두 zstd 프레임」 테스트가 이 경로를 덮는다.

### IN-03: 같은 라운드 병렬 호출은 실행 단위 메모를 비켜 간다

**Status:** fixed: requires human verification
**Files modified:** `server/src/services/specialists/diagnosis/diagnosis-order-log.ts`, `server/src/services/specialists/diagnosis/diagnosis-tools.ts`, `server/src/services/specialists/diagnosis/diagnosis-market.ts`, `server/src/services/specialists/__tests__/diagnosis-market.test.ts`, `server/src/services/specialists/__tests__/diagnosis.test.ts`
**Commit:** 38f59022
**Applied fix:**
- 주문로그: 메모(`OrderLogMemo`)에 결과 대신 진행 중인 RPC Promise 를 넣는다. 병렬 호출도 RPC 는 1회다. 실패와 빈 응답은 끝난 뒤 메모에서 지운다. 기존 「오류는 메모하지 않는다」 동작은 그대로다.
- 시세: `MarketMemo` 가 키마다 마지막 받기 Promise 를 갖는다. 병렬 둘째 호출은 앞 받기를 기다린 뒤 그 `offsetEnd` 부터 증분만 받는다. 메모 사슬은 reject 하지 않는다.

병렬 주문로그 RPC 1회 테스트와 병렬 시세 전체 받기 1회 테스트를 추가했다.

### IN-04: 팀장이 `question` 없이 진단을 부르면 상한만 소모하고 API 400 으로 끝난다

**Status:** fixed
**Files modified:** `server/src/services/chat-orchestrator.ts`, `server/src/services/specialists/diagnosis/diagnosis-specialist.ts`, `server/src/services/__tests__/chat-orchestrator.test.ts`
**Commit:** 4d1e2d72
**Applied fix:** `runSpecialist` 의 diagnosis 분기가 `question` 을 먼저 확인한다. 문자열이 아니거나 trim 뒤 비었으면 진단 상담(하루 상한 · Opus)을 부르지 않는다. 대신 `DIAGNOSIS_QUESTION_MISSING_TEXT` 를 돌려준다. 빈 객체 · 공백 · 숫자 입력을 테스트로 추가했다.

### IN-05: 생성성 없는 일반화 — `runSpecialist` 의 `ctx?` 선택 인자와 `DIAGNOSIS_CONTEXT_MISSING_TEXT` 분기

**Status:** fixed: requires human verification
**Files modified:** `server/src/services/chat-orchestrator.ts`, `server/src/services/specialists/diagnosis/diagnosis-specialist.ts`, `server/src/services/__tests__/chat-orchestrator.test.ts`
**Commit:** d5e5fa0c
**Applied fix:** `runSpecialist` 의 `ctx` 를 필수 인자로 올렸다. 그에 따라 쓰이지 않게 된 것들을 지웠다.
- `DIAGNOSIS_CONTEXT_MISSING_TEXT` 분기와 상수
- 그 경로 전용 테스트

다른 전문가 테스트는 더미 `CTX` 를 넘긴다. 운영 호출부(`chat-service.ts`)는 원래 늘 ctx 를 넘기므로 동작 변화는 없다. necessity(코드 제거) 지적이라 사람 확인 대상으로 표시한다.

---

_Fixed: 2026-11-09T06:08:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
