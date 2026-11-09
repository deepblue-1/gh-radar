---
phase: 39-trade-diagnosis-chatbot
reviewed: 2026-11-09T05:32:31Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - packages/shared/src/strategy-event-labels.ts
  - packages/shared/src/strategy-event-text.ts
  - packages/shared/src/strategy-event.ts
  - packages/shared/src/chat.ts
  - server/src/config.ts
  - server/src/routes/chat.ts
  - server/src/services/chat-orchestrator.ts
  - server/src/services/chat-prompts.ts
  - server/src/services/chat-service.ts
  - server/src/services/specialists/diagnosis/diagnosis-knowledge.ts
  - server/src/services/specialists/diagnosis/diagnosis-market.ts
  - server/src/services/specialists/diagnosis/diagnosis-order-log.ts
  - server/src/services/specialists/diagnosis/diagnosis-specialist.ts
  - server/src/services/specialists/diagnosis/diagnosis-tools.ts
  - server/src/services/tick-live-fetch.ts
  - server/src/services/ticks.ts
  - server/scripts/diagnosis-live.ts
  - server/scripts/measure-diagnosis-tokens.ts
  - supabase/migrations/20261106100000_dma_diagnosis_for_user.sql
  - webapp/src/components/chat/agent-progress.tsx
  - webapp/src/components/chat/message-assistant.tsx
  - webapp/src/components/trading/card/card-log-popups.tsx
  - webapp/src/components/trading/order-log/order-log-list.tsx
  - webapp/src/lib/order-log-feed.ts
findings:
  critical: 0
  warning: 8
  info: 5
  total: 13
  necessity: 1
status: issues_found
---

# Phase 39: Code Review Report

**Reviewed:** 2026-11-09T05:32:31Z
**Depth:** standard
**Files Reviewed:** 24 (테스트 파일은 필요한 만큼만 참조)
**Status:** issues_found

## Summary

Phase 39(매매진단 챗봇) 커밋이 바꾼 줄을 중심으로 검토했다. 계좌 격리는 견고하다 — 세 도구 스키마 어디에도 계좌·사용자·서버 칸이 없고, zod `.strip()` 이 덧붙인 키를 버리며, `p_user_id` 는 `req.userId → ctx.userId → state.userId` 한 경로로만 온다. RPC `dma_diagnosis_for_user` 는 `SECURITY INVOKER` + PUBLIC/anon/authenticated 명시 REVOKE + service_role GRANT 이고 어드민 우회 분기가 없다. 도구별 호출 상한 카운터는 `runTool` 의 첫 `await` 전에 동기로 올라가므로 같은 라운드 병렬 호출에서도 경합이 없다. 실패 경로는 모두 `stop_reason`·`usage` 를 남긴다.

결함은 주로 다음 다섯 군데에 있다.
1. **비용 가드:** 이미 하루 상한에 걸린 사용자의 시도도 전역 카운터를 올린다.
2. **시간 가드:** 하드 중단이 도구 실행을 끊지 못하고, 한 턴 전체에 대한 시간 예산이 없다.
3. **시세 창 수집기의 전제:** 수신 시각이 단조라고 가정하고, `X-Tick-Complete` 를 무시한다.
4. **웹 링크 처리:** `linkifyTickPaths` 정규식이 너무 많이 잡고, 내부 경로 차단을 상대 경로로 우회할 수 있다.
5. **주문로그 이벤트 줄:** 계좌 표기가 없다.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: 상한에 걸린 사용자의 시도도 전역 하루 카운터를 소모 — 한 사용자가 전원의 진단을 막을 수 있다

**File:** `server/src/services/specialists/diagnosis/diagnosis-specialist.ts:150-156`
**Issue:** `checkDailyCap` 은 전역(`chat_diagnosis`)과 사용자(`chat_diagnosis:<userId>`) 카운터를 `Promise.all` 로 **둘 다** 올린 뒤에 판정한다. 사용자 상한(기본 20)을 넘긴 사용자가 계속 묻는 경우를 보자. 판정은 `"user"` 로 거부되지만 시도마다 전역 카운터가 +1 된다. 챗 POST 는 IP 당 분당 20회까지 허용되고, 팀장은 한 요청에서 진단을 여러 번 부를 수 있다. 그래서 상한에 걸린 사용자 한 명이 몇 분 안에 전역 200 을 채우고, 그날 **모든 사용자**의 진단을 「한도를 모두 썼습니다」 로 막을 수 있다. 사용자 상한의 목적(한 사용자 폭주 격리)이 깨진다.
**Fix:** 사용자 카운터를 먼저 올려 판정하고, 통과했을 때만 전역 카운터를 올린다(또는 거부 시 전역을 되돌린다).
```ts
const u = await incr(`${USAGE_SERVICE}:${userId}`);
if (u.error) throw new Error(u.error.message);
const user = Number(u.data);
if (!Number.isFinite(user)) throw new Error("incr_api_usage returned non-number");
if (user > cfg.chatDiagnosisUserDailyCap) return { scope: "user", global: NaN, user };
const g = await incr(USAGE_SERVICE);
// … global 판정
```

### WR-02: `linkifyTickPaths` 정규식이 백틱·`**`·`|`·한글 조사·끝 마침표까지 URL 로 삼키고, 코드 블록 안까지 다시 쓴다

**File:** `webapp/src/components/chat/message-assistant.tsx:70-73`
**Issue:** `[^\s)\]]+` 는 공백·`)`·`]` 만 멈춤 문자로 본다. node 로 실측한 결과는 아래와 같다.
- `` `/analytics/ticks?…&t=12:23:12.254` `` → `` `[틱 보기](/analytics/ticks?…254`) `` — 닫는 백틱이 URL 에 들어가 인라인 코드가 깨진다.
- `**/analytics/ticks?…254**` → `**[틱 보기](/analytics/ticks?…254**)` — 굵게 표시가 깨지고 `t` 가 `…254**` 가 된다.
- 표 셀에서 `…254|` → `|` 가 URL 에 들어가 GFM 표 행이 무너진다.
- `…t=12:23:12.254에서 확인` → `t=12:23:12.254에서`. 한국어 답에서 흔한 꼴이다.
- ```` ```server-log ```` 블록 안의 `틱 보기: /analytics/…` 도 `[틱 보기](…)` 글자로 바뀌어 「서버 기록 원문」 이 원문이 아니게 된다.
- `[틱](</analytics/ticks?…>)` → `[틱](<[틱 보기](…>))`.

`t` 꼬리가 오염되면 뷰어의 `parseTickTime`(`use-tick-cursor.ts:132`)이 null 을 돌려주고, 뷰어는 **08:00 첫 틱으로 조용히 떨어진다**. 사용자는 엉뚱한 시각의 근거를 보게 된다.
**Fix:** 쿼리 값의 문자 집합을 도구가 실제로 만드는 꼴로 좁히고, 코드 펜스·인라인 코드 구간은 건너뛴다.
```ts
const BARE_TICK_PATH =
  /(틱 보기:\s*)?(?<![\](<`])(\/analytics\/ticks\?(?:isin=[A-Z0-9]{12}|d=\d{8}|ex=NXT|t=\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?|&)+)/g;
// 그리고 ``` 펜스 · `…` 구간을 먼저 분리해 그 밖에서만 replace
```

### WR-03: 「임의 내부 화면 금지」 가드를 상대 경로로 우회할 수 있다

**File:** `webapp/src/components/chat/message-assistant.tsx:103-118`
**Issue:** 내부 경로 차단은 `href.startsWith("/")` 일 때만 걸린다. `[설정](trading/limit-chaser)`·`[x](./trading/…)`·`[x](?account=…)`·`[x](../admin)` 처럼 `/` 로 시작하지 않는 상대 경로는 바깥 링크 분기로 가서 `<a href="trading/limit-chaser" target="_blank">` 로 렌더된다. 브라우저는 이를 현재 페이지(`/chat` 등) 기준으로 풀어 앱 내부 화면을 연다. 파일 머리 주석의 「답변이 임의 내부 화면으로 보내지 못하게」(14행)가 지켜지지 않는다. 주문 화면이 있는 앱이라, 쿼리로 상태를 미리 채우는 내부 화면으로 보내는 링크는 막는 것이 맞다.
**Fix:** 바깥 링크는 절대 `http(s):` 만 허용하고, 나머지는 틱뷰어 예외 말고는 모두 글자로 둔다.
```tsx
a: ({ href, children }) => {
  if (typeof href === "string" && isTickViewerHref(href)) return <Link …>…</Link>;
  if (typeof href === "string" && /^https?:\/\//i.test(href)) return <a href={href} target="_blank" rel="noreferrer" …>{children}</a>;
  return <span>{children}</span>;
},
```

### WR-04: 시세 창 수집기가 「수신 시각 단조」 를 가정하고 일찍 멈춘다 — 레코드가 조용히 빠지거나 거짓 「기록 없음」 이 나온다

**File:** `server/src/services/specialists/diagnosis/diagnosis-market.ts:196-198, 223-231`
**Issue:** `TickWindow.push` 는 `recvNs > toNs + 5s` 인 레코드를 처음 만나면 `false` 를 돌려주고, `feed`·`windowOfCompressed`·`todayPath` 는 그 즉시 읽기를 **끝낸다**. 그런데 같은 레코드 포맷을 읽는 shared 뷰어 모델은 「파일이 이미 recv_ns 비감소면 항등(대부분), 아니면 recv_ns 안정 정렬」(`packages/shared/src/ticks/record-index.ts:133`)이라고 적고, 비단조 파일을 명시적으로 다룬다. 격자는 여러 `sources`(`ticks.ts:97`)를 합쳐 만들고, 당일 바이트는 프레임을 이어붙인 것이다. 수신 순서가 한 번만 뒤집혀도 그 뒤에 있는 창 안 레코드를 버린다.

창 판정은 거래소 시각 기준인데 중단 판정은 수신 시각 + 고정 5초다. 그래서 수신 지연이 5초를 넘는 구간(메모리에 기록된 GCP 서울 엣지 주기 끊김 같은 경우)에서는 창 안 레코드를 통째로 놓친다. 결과는 줄 누락이거나 「자료 없음: 그 시각 시세 기록 없음」 이고, 모델이 「시세 전문은 받지 못해…」 로 판단하게 된다.
**Fix:** 일찍 멈추지 않거나, 멈추는 기준을 「단조 증가가 확인된 구간」 으로 제한한다. 예를 들어 `push` 는 범위 밖이면 늘 `true`(건너뜀)를 돌려주고, 레코드 상한에 닿았을 때만 `false` 를 돌려준다. 성능이 필요하면 직전 레코드보다 recv 가 작아진 적이 있는지 추적해서, 비단조를 본 뒤에는 조기 중단을 끈다.

### WR-05: 당일 경로가 `X-Tick-Complete` 를 무시한다 — 구멍 난 하루를 완결 자료로 취급한다

**File:** `server/src/services/tick-live-fetch.ts:133-134`
**Issue:** 서버판 상태표는 `state: "ready"` 이면 바로 `ok` 를 돌려준다. 이 파일이 축약했다고 밝힌 원본 워커(`workers/tick-convert/src/tickgw-live.ts:238-239`)는 `ready` 여도 `!r.complete` 이면 `deferred incomplete`(구멍 있는 하루)로 처리한다. tickgw 는 이 헤더를 내고(`packages/shared/src/tick-api.ts:228`), tickgw-client 도 전달한다. 진단은 구멍 구간을 물으면 「그 시각 시세 기록 없음(그 종목 미기록일 수 있음)」 을 돌려주거나, 일부만 있는 창을 잘림 표시 없이 준다. 그래서 모델이 「그 시각엔 체결이 없었다」 같은 거짓 근거를 만들 수 있다.
**Fix:** `ready` 에서 `r.headers.complete === "false"` 이면 결과에 불완전 표시를 싣고, `diagnosis-market` 이 「자료 일부 누락(당일 수집 구멍)」 을 응답 끝에 붙이거나 전용 사유를 낸다.
```ts
case "ready":
  return { kind: "ok", incomplete: r.headers.complete === "false", entry: { … } };
```

### WR-06: 하드 중단(마감 + 30초)이 도구 실행을 끊지 못한다

**File:** `server/src/services/specialists/diagnosis/diagnosis-specialist.ts:308`, `server/src/services/specialists/diagnosis/diagnosis-market.ts:349-354`
**Issue:** `hardAbort` 신호는 Anthropic 스트림에만 걸린다. `await Promise.all(calls.map((b) => dispatchDiagnosisTool(b, state)))` 에는 신호도 타임아웃도 없다. 그 아래 Supabase RPC 3종, `storage.download()`, `arrayBuffer()` 도 타임아웃 없이 기다린다. Storage·PostgREST 가 멈추면 진단은 150 + 30초 보장을 넘어 무기한 기다린다. 결국 Cloud Run 요청 타임아웃이 연결을 끊고, `chat-service` 의 `appendMessage`(634행)까지 가지 못해 질문과 답이 저장되지 않는다. 마감 뒤에 도구가 끝나도 이미 abort 된 신호로 마무리 콜을 열기 때문에, 바로 timeout 문구로 끝나 받아 둔 자료도 쓰이지 않는다.
**Fix:** 도구 실행을 남은 시간과 경주시킨다.
```ts
const remaining = Math.max(0, deadline + DIAGNOSIS_HARD_ABORT_GRACE_MS - Date.now());
const results = await Promise.race([
  Promise.all(calls.map((b) => dispatchDiagnosisTool(b, state))),
  new Promise<never>((_, rej) => signal.addEventListener("abort", () => rej(signal.reason), { once: true })),
]);
```
그리고 `storage.download` 등에도 `AbortSignal.timeout(...)` 을 넘긴다.

### WR-07: 진단 시간 예산이 상담 1회 단위뿐이다 — 한 턴에서 진단을 두 번 부르면 Cloud Run 300초를 넘는다

**File:** `server/src/services/chat-service.ts:415-548`, `server/src/services/specialists/diagnosis/diagnosis-specialist.ts:257`
**Issue:** `deadline = startedAt + chatDiagnosisDeadlineMs` 는 `consultDiagnosisSpecialist` 호출마다 새로 잡힌다. 팀장 루프는 `chatMaxToolRounds`(5)까지 돌고, 「다른 전문가 자제」 는 프롬프트 권고일 뿐이다. 그래서 라운드 1·2 에서 진단을 차례로 부르는 일(예: 첫 진단이 「변환 중」 → 팀장이 다시 부름)을 막는 코드가 없다. 최악의 경우 180초 × 2 + 팀장 라운드가 config 주석이 전제한 Cloud Run 300초(`config.ts` 의 `chatDiagnosisDeadlineMs` 주석)를 넘는다. 그러면 요청이 끊기고, Opus 비용은 이미 쓴 상태에서 저장은 0 이 된다(저장은 루프 끝 634행).
**Fix:** 턴 단위 마감을 하나 두고 진단 ctx 에 넘긴다(예: `turnDeadlineAt`). 진단은 `min(자기 마감, 턴 마감)` 을 쓰게 한다. 아니면 한 턴에서 진단을 한 번만 허용한다. 두 번째 호출에는 「이번 질문에서 이미 진단함」 tool_result 를 준다.

### WR-08: 주문로그 도구의 전략 이벤트·상태전이 줄에 계좌 표기가 없다 — 다계좌 사용자의 진단이 모호해진다

**File:** `server/src/services/specialists/diagnosis/diagnosis-order-log.ts:325-331`
**Issue:** `[주문]`·`[체결]` 줄은 `[gateway …끝4자리]` 를 싣지만(`orderLine`·`fillLine` 301·317행), `eventLine` 은 `orderLogLineText` 문장에 원문 키만 붙이고 계좌와 게이트웨이를 빠뜨린다. RPC 는 `account_no`·`gateway` 를 이벤트에 싣고 있다(`to_jsonb(e)`). 한 사용자가 여러 서버·계좌(KB120/121·KYOBO)에서 같은 종목 전략을 돌리면, 「누가 언제 껐나」(상태전이 절의 핵심 질문)와 「어느 계좌 선매수가 나갔나」 를 줄만 보고 가를 수 없다. 특히 kind 9 는 주문번호가 `[—]` 라 주문 줄과 이어 볼 수도 없다. 그러면 모델이 다른 계좌의 전이를 근거로 답할 수 있다.
**Fix:** 이벤트 줄 앞에도 같은 계좌 표기를 붙이고, 프롬프트 `[주문로그 읽는 법]` 의 이벤트 줄 꼴(203행)도 같이 고친다.
```ts
return `[${acct(e.gateway, e.account_no ?? "")}] ${sentence} 사유="…" …`;
```

## Info

### IN-01: 틱 링크 `t` 의 시계가 프롬프트 안에서 서로 어긋나고, 「모델이 URL 을 짓지 않는다」 주석이 실제와 다르다

**File:** `server/src/services/specialists/diagnosis/diagnosis-knowledge.ts:57-60, 184`, `server/src/services/specialists/diagnosis/diagnosis-market.ts:39-40`
**Issue:** ROLE 4번은 모델에게 주문로그 시각(게이트웨이 시계)이나 시세 줄 시각(거래소 시계)으로 `[틱](/analytics/ticks?…&t=…)` 을 **직접 만들라고** 지시한다. 반면 CLOCKS 절은 「틱 보기 링크의 t 는 시세 수신 시각」 이라고 말하고, `diagnosis-market.ts` 머리는 「모델이 URL 을 짓지 않는다 · D-04」 라고 적는다. 뷰어는 수신순 `lowerBoundRecv` 로 위치를 잡는다. 그래서 주문 시각(gw)으로 연 링크는 발주를 촉발한 틱보다 **뒤**에 커서를 둘 수 있다. NXT 에서 `&ex=NXT` 를 빠뜨리면 KRX 화면이 열린다.
**Fix:** 프롬프트에 「사건 틱 몇 ms 앞으로 연다」 같은 규칙을 넣거나, 도구가 줄마다 틱 링크를 만들어 주게 한다. 주문로그 줄에도 서버가 링크를 붙인다. 주석 D-04 문구는 현재 설계에 맞게 고친다.

### IN-02: 당일 경로가 프레임마다 `zstdDecompressSync` 로 동기 해제한다 — 창 앞 프레임까지 전부

**File:** `server/src/services/specialists/diagnosis/diagnosis-market.ts:415-419`
**Issue:** 지난 날짜 경로는 비동기 스트리밍(`createZstdDecompress`)인데, 당일 경로는 하루 누적 프레임을 처음부터 동기로 풀며 창까지 간다. 장 마감 무렵 창이면 이벤트 루프를 오래 붙잡아, 같은 인스턴스의 다른 SSE·API 응답이 멈출 수 있다(성능 범위라 Info).
**Fix:** 지난 날짜 경로의 `windowOfCompressed` 를 그대로 재사용한다.

### IN-03: 같은 라운드 병렬 호출은 실행 단위 메모를 비켜 간다

**File:** `server/src/services/specialists/diagnosis/diagnosis-specialist.ts:308`, `server/src/services/specialists/diagnosis/diagnosis-order-log.ts:103-117`, `server/src/services/specialists/diagnosis/diagnosis-market.ts:394-410`
**Issue:** 메모는 결과가 끝난 뒤에 `set` 된다. 그래서 모델이 한 라운드에 같은 `(date, isin)` 주문로그나 같은 `(isin, ex)` 시세를 병렬로 부르면 RPC 와 tickgw 전체 받기가 중복된다. 당일 tickgw 활성 키 8개 경쟁(Pitfall 4)을 불필요하게 늘린다.
**Fix:** 메모에 결과 대신 진행 중인 Promise 를 넣는다(`memo.set(key, promise)`).

### IN-04: 팀장이 `question` 없이 진단을 부르면 상한만 소모하고 API 400 으로 끝난다

**File:** `server/src/services/chat-orchestrator.ts:189-191`, `server/src/services/specialists/diagnosis/diagnosis-specialist.ts:225, 249`
**Issue:** `b.input as SpecialistInput` 캐스트라 `question` 이 비거나 문자열이 아니어도 그대로 넘어간다. 진단은 하루 카운터를 먼저 올린 뒤 `content: undefined` 로 Opus 를 불러 400 → `"error"` 로 끝난다.
**Fix:** `runSpecialist` 의 diagnosis 분기에서 `typeof input.question === "string" && input.question.trim()` 을 확인하고, 아니면 상한을 건드리지 않고 고정 문구를 돌려준다.

### IN-05: 생성성 없는 일반화 — `runSpecialist` 의 `ctx?` 선택 인자와 `DIAGNOSIS_CONTEXT_MISSING_TEXT` 분기

**File:** `server/src/services/chat-orchestrator.ts:166, 190`
**Category:** necessity
**Issue:** 운영 호출부는 `chat-service.ts:500` 하나뿐이고, 늘 `{ userId, signal, deps }` 를 넘긴다(`grep runSpecialist(` 결과). `ctx` 없는 진단 경로는 테스트에서만 생길 수 있다. 다른 전문가 테스트가 `ctx` 없이 부르기 때문에 남겨 둔 것으로 보이므로 판단에 기댄 Info 다.
**Fix:** `ctx` 를 필수로 올리고 테스트에서 더미 ctx 를 넘기거나, 지금처럼 두되 「테스트 이음새」 라고 주석으로 밝힌다.

---

_Reviewed: 2026-11-09T05:32:31Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
