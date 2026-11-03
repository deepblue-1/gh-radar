---
phase: 38-own-orders-on-ticks
fixed_at: 2026-11-04T04:27:00+09:00
review_path: .planning/phases/38-own-orders-on-ticks/38-REVIEW-R2.md
iteration: 2
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Phase 38: 코드 리뷰 수정 보고서 — 2라운드(R2)

**Fixed at:** 2026-11-04
**Source review:** `.planning/phases/38-own-orders-on-ticks/38-REVIEW-R2.md`(R2 6건) + `.planning/phases/38-own-orders-on-ticks/38-REVIEW.md`(R1 Info 4건)
**Iteration:** 2

**Summary:**
- 범위 안 항목: 10건. R2 의 WR-01..03 · IN-01..03 과 R1 의 IN-01..04 다. R1 WR-01..05 는 1라운드(65c012c2..633af896)에서 고쳤으므로 다시 손대지 않았다.
- 고침: 10
- 건너뜀: 0

두 리뷰의 id 가 겹친다. 그래서 커밋과 이 보고서에서는 `R2-WR-01` · `R1-IN-01` 처럼 앞에 라운드를 붙였다.

**작업 위치:** 호출자 지시대로 기존 worktree `/Users/alex/repos/gh-radar/.claude/worktrees/phase-38`(브랜치 `phase-38-own-orders`)에서 바로 고치고 커밋했다. 따로 worktree 를 만들지 않았으므로 정리 단계도 없다. 커밋마다 경로를 지정해 스테이징했다. push 는 하지 않았다. 커밋되지 않은 `tasks/lessons.md` 는 건드리지 않았다.

**DB · RPC · 서버:** 마이그레이션, RPC 시그니처, server 코드는 바꾸지 않았다. 모든 수정은 shared 와 webapp 클라이언트 안에서 끝난다.

## Fixed Issues

### R2-WR-01: 호가 근거(ev_kind 1)는 여전히 중복 B6 를 근거 행으로 고른다 — 원 WR-03 이 절반만 닫혔다

**Files modified:** `packages/shared/src/ticks/own-fills.ts`, `packages/shared/src/__tests__/ticks-own.test.ts`, `webapp/src/lib/ticks/__tests__/own-model.test.ts`
**Commit:** 2d1b7fe1
**Applied fix:** `locateBookEvidence` 가 `skip` 을 받는다. `skip[rec] === 1` 인 B6 는 근거 후보에서 뺀다. `locateEvidence` 의 `evKind === 1` 분기도 받은 `skip` 을 그대로 넘긴다. 이제 `own-model.ts` 머리 주석 ②(「짝짓기 · 근거 · 앵커 모두 duplicates 를 뺀다」)가 실제 동작과 맞는다.
- shared 합성 테스트: B6 seq 700 을 .100 과 .140 에 두 번 받고 이벤트 gw 를 .150 에 둔 리뷰 재현이다. skip 이 없으면 rec 1, 있으면 원본 rec 0 이 근거가 된다. 창 안에 사본만 있으면 근거 없음이다.
- 웹 own-model 테스트: 같은 B6 를 다시 받은 synthSession 에서 `duplicates = [0, 1]` 이다. 근거는 `{kind:'b6', rec:0}` 이고 `ordersOfEvidenceRec` 키도 0 하나다.

### R2-WR-02: 당일 대기 판정이 짝을 찾을 수 있는 체결까지 「전문 아직 안 옴」 으로 내린다 — 장 마감 · 한산한 종목에서는 영구

**Files modified:** `webapp/src/lib/ticks/own-model.ts`, `webapp/src/components/ticks/tick-viewer.tsx`, `webapp/src/components/ticks/tick-viewer-page.tsx`, `webapp/src/lib/ticks/__tests__/own-model.test.ts`
**Commit:** b7b6bd80
**Status:** fixed: requires human verification (대기 판정 로직 변경 · 장중 한산한 종목은 아래 「남은 한계」)

**고른 규칙(짝 먼저 짓고, 바뀔 수 있는 짝만 대기로 내린다):**
1. 짝은 live 여부와 관계없이 **늘 전부** 짓는다. 과거 격자와 같은 `matchOwnFills` 한 번이다. 그래서 과거 격자 결과와 오라클 수치는 바뀌지 않는다.
2. 당일에는 짝마다 「더 나은 A3 가 아직 올 수 있는가」 를 본다. 더 나은 A3 는 |dt| 가 더 작거나, 「추정」 을 바꿀 만큼(20ms 안) 가까운 A3 다. 그런 A3 의 시각은 `g + 닿는 거리` 보다 앞이다.
   - 짝 있음: 닿는 거리 = `min(|dt| + 20, 200)`
   - 짝 없음: 닿는 거리 = 200(짝 창 끝)
   - 그 A3 는 늦어도 그 시각 + 여유 1,000ms 안에 받았어야 한다. 이 여유는 기존 `OWN_PENDING_GRACE_MS = 200 + 1,000` 의 「여유」 를 그대로 쓴 것이다. 그래서 `g + 닿는 거리 + 1,000 > 세션 마지막 수신` 이면 아직 알 수 없으므로 대기다.
   - 짝 없음일 때 이 식은 종전의 `g + 1,200` 과 같다.
   - 진짜 A3 가 이미 있어 |dt| 가 작으면 그만큼 빨리 확정된다. 예를 들어 dt 5ms 면 `g + 1,025` 에서 확정된다(종전 `g + 1,200`).
   - 진짜 A3 가 아직 없어 더 이른 같은 가격 A3 에 붙은 체결은 대기로 남는다. 이것이 원 WR-02 의 오짝 방지이고, 기존 WR-02 테스트가 그대로 통과한다.
3. 남은 수량 차감은 순서에 의존한다. 그래서 **확정은 앞자리(prefix)만** 한다. 한 체결이 대기면 그 뒤 체결도 모두 대기다. 대기 체결이 잠정으로 깎은 수량은 버린다.
   - 대기가 아닌 체결(`g + 1,200 ≤ 마지막 수신`)은 늘 대기 체결보다 앞이다. 그래서 확정된 체결의 결과는 대기 체결 때문에 바뀌지 않는다.
4. **장 끝 뒤 세션은 대기 없음.** `asOfMs` 는 마지막 성공 live 응답의 브라우저 시각(`useTickLive.fetchedAt`)이다. tickgw 상태가 `ready` 일 때만 쓴다. 이 값이 그 거래소의 장 끝 + 5분 이후면 그날 전문이 다 왔다고 보고 과거 격자처럼 모두 확정한다. 장 끝은 KRX 18:00(시간외 단일가 끝), NXT 20:00 KST 다(`OWN_DAY_END_HHMM` · `OWN_DAY_END_SETTLE_MS`).
   - 그래서 리뷰가 든 「장 마감 뒤 당일 화면」 의 종가 · 시간외 단일가 · NXT 20:00 직전 체결은, 장 끝 뒤 「최신 받기」 를 한 번 누르면 확정된다. 날짜를 넘기지 않아도 된다.
   - 브라우저 시계는 몇 시간 단위 경계와만 비교하고, 5분 여유를 둔다. 그래서 시계가 몇 분 어긋나도 결과는 바뀌지 않는다.

**서버 as-of 시각 확인:** 클라이언트에는 서버 시각이 **없다**. `GET /api/ticks/live` 헤더 6종(`X-Tick-*`)에는 as-of 가 없다. `X-Tick-Last-Recv-Ns` 는 세션 마지막 수신과 같은 값이다. 또 `Date` 는 CORS 안전 목록 밖이고 `server/src/services/cors-config.ts` `exposedHeaders` 에도 없어서, 다른 출처인 웹이 읽지 못한다. 그래서 리뷰의 `cutoff = max(lastRecvMs, asOfMs)` 를 장중에 쓰지 않았다. 브라우저 시계는 게이트웨이 시계와 어긋날 수 있다는 리뷰의 경고 때문이다.

**남은 한계(후속):** 장중에 한산한 종목이면 우리 체결 뒤 전문이 1초 넘게 끊길 수 있다. 이 경우는 다음 전문이 와서 「최신 받기」 로 세션이 자랄 때까지 여전히 대기다. 리뷰의 장중 재현(A3 .100 · 마지막 수신 .400 · 체결 .105)도 장중이면 대기이고, 마지막 수신이 1.130 이상이 되거나 장 끝 뒤가 되면 matched 다. 완전히 고치려면 서버가 응답 시각을 내려줘야 한다. tickgw 의 `X-Tick-As-Of` 이거나 `Date` 를 `exposedHeaders` 에 더하는 방법이다. 그러면 웹은 `cutoff = max(lastRecvMs, asOfMs − 여유)` 로 바꾸면 된다. server 변경과 배포가 필요하므로 이번 범위에서 뺐다.

**테스트(own-model):**
- dt 5ms 짝이 `g + 1,025` 에서 확정되고, 1ms 모자라면 대기인지 본다.
- 앞 체결이 대기면 뒤 체결도 대기인지(prefix) 본다.
- 장 끝 + 5분 경계를 본다. KRX 는 18:05 에 matched 이고 1ms 전에는 대기다. NXT 는 18:05 에 대기, 20:05 에 matched 다. `asOfMs` null 이면 대기다. 과거 격자는 그대로다.
- 기존 대기 · WR-02 · WR-04 대기 테스트는 그대로 통과한다.

### R2-WR-03: 다시 받기 실패 뒤 낡은 우리 층이 새 세션 위에 표시 없이 남는다 — `status` 를 읽는 곳이 없다

**Files modified:** `webapp/src/lib/ticks/use-tick-own.ts`, `webapp/src/components/ticks/tick-viewer.tsx`, `webapp/src/lib/ticks/__tests__/use-tick-own.test.tsx`, `webapp/src/components/ticks/__tests__/tick-viewer-live.test.tsx`
**Commit:** 93fb4081 (R1-IN-03 과 같은 커밋 — 같은 실패 경로를 한 규칙으로 묶었다)
**Applied fix:** 뷰어가 `ownStale = own.status === 'error' && own.own !== null` 을 `PaneCtx` 로 내린다. 오른쪽 열 `TickSidePane` 은 이 값이 참이면 탭 막대 바로 아래에 한 줄을 단다. 문구는 「우리 체결을 받지 못했어요 · 직전 값」 이다.
- 마크업은 `data-slot="tick-own-stale"` · `role="status"` 다.
- 모양은 머리의 「당일 자료를 받지 못하고 있어요」 줄과 같다(`--t-caption` · `--destructive`). 격자 `col-span-full` 한 줄이라 새 배치는 없다.
- 탭 목록(tablist) 밖에 둬서 ARIA 자식 규칙을 지킨다.
- 자동 재시도는 없다(CLAUDE.md 공식 API 기준 4). 다음 「최신 받기」 가 성공하면 사라진다.
- 뷰어 렌더 테스트를 더했다. 「성공 → ownRefreshKey+1 실패 → 탭 유지 + 표시 노출 → 다시 성공 → 표시 사라짐」 과 「처음 열기 실패 → 탭 · 표시 둘 다 없음」 이다.

### R2-IN-01: 체결 안정 키 `gateway|seq` 는 하루 안에서도 유일하지 않을 수 있다 — 원천 PK 는 `(gateway, journal_epoch, seq)`

**Files modified:** `webapp/src/lib/ticks/own-model.ts`, `webapp/src/components/ticks/tick-viewer.tsx`, `webapp/src/lib/ticks/__tests__/own-model.test.ts`
**Commit:** 77758e80
**Applied fix:** 클라이언트에서만 막았다. RPC 에 `journal_epoch` 를 더하는 일은 배포된 DB 를 바꾸므로 범위 밖이다. 대신 리뷰가 제시한 두 번째 안을 썼다. `OwnFillView.key` 를 `${gateway}|${order_no}|${gw_time_ms}|${seq}` 로 바꿨다. 네 필드 모두 저널 행 값이라 다시 받아도 변하지 않는다. 그래서 선택 기억(WR-04)에 그대로 써도 된다. 저널이 초기화돼 seq 가 다시 쓰여도 두 체결이 주문번호와 gw 시각까지 같을 일은 사실상 없다. 정렬 동률을 깨던 `x.seq - y.seq` 는 R1-IN-01 수정으로 없어졌다. 테스트는 같은 `KB120|7` 체결 두 건의 키가 갈리는지, 고른 체결로 풀리는지 본다.
**후속:** 근본 해결은 RPC fills 에 `journal_epoch`(또는 짧은 해시)를 내보내 키를 `gateway|epoch|seq` 로 만드는 것이다. 마이그레이션이 필요하다.

### R2-IN-02: 골든 「skip 을 넘겨도 오라클 그대로」 블록은 구조상 실패할 수 없다

**Files modified:** `packages/shared/src/__tests__/ticks-own.golden.test.ts`
**Commit:** 59e232df
**Applied fix:** 동어반복이던 「skip 있음 == 없음」 비교 블록과, A3 열 순서로 따로 만든 `skipOf` 를 지웠다. 대신 웹 `tick-session.ts` `duplicatesOf` 와 같은 규칙(수신순 · 전 태그 · 보드 없음 · `seq < 0` 제외)으로 픽스처 5종의 중복 수를 센다. 단언은 0건 하나다. R2-WR-01 로 B6 도 거르게 됐으므로 A3 뿐 아니라 B6 중복 0건도 함께 잠근다. shared 는 webapp 을 import 하지 않으므로 규칙을 옮겨 적었고, 규칙이 바뀌면 같이 고치라고 주석에 적었다. skip 동작 자체는 합성 테스트가 잠근다. 오라클 단언(401/406 · 108 · 29/29 · 100/100)은 손대지 않았다.

### R2-IN-03: WR-04 배선(뷰어의 키 기억 · 렌더 때 풀기)을 덮는 테스트가 없고, 기준 rec 는 다시 풀지 않는다

**Files modified:** `webapp/src/components/ticks/tick-viewer.tsx`, `webapp/src/components/ticks/__tests__/tick-viewer-live.test.tsx`
**Commit:** 7ec4d25a
**Status:** fixed: requires human verification (선택 상태 로직 변경)
**Applied fix:** `rows` 메모를 `ownSel` 앞으로 옮겼다. `ownSel` 은 키를 푼 다음, 그 줄의 지금 기준 rec 를 `ownLineRec(rows, ownPosOf…)` 로 다시 구한다. 이 값이 기억한 rec(곧 지금 커서)와 다르면 선택을 푼다. 새 rec 로 옮기려면 커서를 움직이는 효과가 필요해서, 푸는 쪽을 골랐다. 렌더 테스트를 둘 더했다.
- 「표에서 줄 선택 → ownRefreshKey+1 로 다른 게이트웨이의 더 이른 주문이 끼어 id 0→1 → 같은 E1 줄이 강조」
- 「보조 주문 행 + 짝 없는 체결만 있던 주문에 더 이른 이벤트가 붙어 줄 자리가 옮겨짐 → 줄은 새 자리에 그려지지만 선택은 풀림」

두 번째 테스트는 확인 검사를 수정 없이 돌리면 실패하는 것을 직접 확인했다. 확인 뒤 코드는 되돌렸다.
참고: 거래소순과 수신순을 바꾸면 기준 rec 가 달라질 수 있다. 그때도 같은 규칙으로 선택이 풀린다.

### R1-IN-01: 클라 재정렬 키가 RPC 정렬(「차감 순서의 정본」)과 다르다

**Files modified:** `webapp/src/lib/ticks/own-model.ts`, `webapp/src/lib/ticks/__tests__/own-model.test.ts`
**Commit:** 63de4630
**Status:** fixed: requires human verification (남은 수량 차감 순서 변경)
**Applied fix:** RPC 정렬을 바꾸는 쪽은 마이그레이션이라 범위 밖이다. 그래서 클라이언트를 RPC 순서에 맞췄다. 방어 정렬을 `gw_time_ms` 하나로 줄였다. `Array.prototype.sort` 는 안정 정렬이므로, 같은 ms 안에서는 응답 순서(gw_time µs → gateway → seq)가 그대로 남는다. 순서가 뒤섞여 들어와도 ms 단위로는 여전히 정렬된다. 머리 주석 ② 의 「RPC 정렬과 같은 키」 라는 틀린 문장도 고쳤다. 테스트는 같은 .105 ms 에 KYOBO119(µs 앞) → KB120 순으로 응답할 때 KYOBO 가 A3 를 가져가는지 본다. 종전에는 이름순이라 KB120 이 가져갔다. ms 가 뒤섞인 입력이 gw 순으로 정렬되는지도 본다.
**남은 점:** 오라클 생성기 `scripts/tick-oracle/gen-own-fixtures.mjs` 의 `cmpRow` 는 지금처럼 (ms, gateway, seq) 다. 저널 픽스처에 µs 가 없고, 골든은 생성기 순서로 shared 함수를 직접 부를 뿐 `buildOwnModel` 을 거치지 않는다. 그래서 고치지 않았다. 픽스처를 다시 만들면 오라클 수치가 흔들릴 수 있다.

### R1-IN-02: 카드 「보기 ›」 · 「우리 주문」 표 행 클릭 · `onOwnOrder` 폴백도 고른 줄을 풀지 않는다

**Files modified:** `webapp/src/components/ticks/tick-viewer.tsx`, `webapp/src/components/ticks/__tests__/tick-viewer-live.test.tsx`
**Commit:** eb84727f
**Status:** fixed: requires human verification (선택 상태 로직 변경)
**Applied fix:** `navJump` 정의를 `onOwnOrder` 앞으로 옮기고 `PaneCtx.jumpRec` 으로 내렸다. `navJump` 는 `setOwnPick(null)` 을 한 뒤 커서를 옮긴다. 이것을 다음 이동에 모두 쓴다.
- `TickSidePane` 의 「우리 주문」 표 `onJump`
- `TickOrderCard` 의 `onJump` · `onOwnJump`(「보기 ›」)
- `onOwnOrder` 의 「첫 짝 체결」 폴백

`[` `]` 는 원래 `navJump` 를 썼다. 렌더 테스트도 더했다. 짝 없음 줄 F1 의 기준 전문이 A3 인 자리를 찾고, 그 A3 에 짝지어지는 체결 O2 를 둔다. F1 줄을 고른 뒤 표에서 O2 행을 누르면 줄 선택이 풀려야 한다. 표의 `onJump` 를 옛 `cursor.jumpToRec` 으로 되돌리면 이 테스트가 실패하는 것을 확인했고, 확인 뒤 되돌렸다.
범위 밖으로 둔 것: 차트 ◆ 클릭(접수된 기존 항목)과 전문 목록 행 클릭(`onSelect`)은 손대지 않았다.

### R1-IN-03: `useTickOwn` 모양 검사가 `events` · `orders` 를 보지 않는다

**Files modified:** `webapp/src/lib/ticks/use-tick-own.ts`, `webapp/src/lib/ticks/__tests__/use-tick-own.test.tsx`
**Commit:** 93fb4081 (R2-WR-03 과 같은 커밋)
**Applied fix:** 모양 검사에 `events` · `orders` 를 더해 네 배열을 모두 본다. 이제 렌더 중 `buildOwnModel` 이 예외를 던지는 대신 `shape` 실패가 된다. R2-WR-03 과 맞추려고 실패 경로를 `fail()` 하나로 합쳤다. 요청 거부와 모양 실패가 같은 규칙을 따른다. 같은 종목을 다시 받다 실패하면 직전 `own` 을 유지하고 `error` 로 둔다. 처음 열기나 다른 종목이면 null 이다. 그래서 모양 실패 뒤 직전 값이 남아 있으면 같은 「직전 값」 표시가 뜬다. 테스트는 네 가지를 본다.
- 네 배열 각각이 없을 때 처음 열기는 null · error · warn 「shape」 여야 한다.
- 성공 뒤 모양 실패는 직전 own 을 유지하고 error 여야 한다.

### R1-IN-04: 근거 종류 낱말 「체결 구간」 만 shared 라벨 밖에 하드코딩

**Files modified:** `packages/shared/src/strategy-event-labels.ts`, `packages/shared/src/__tests__/strategy-event-labels.test.ts`, `webapp/src/lib/ticks/own-model.ts`, `webapp/src/components/ticks/tick-own-section.tsx`
**Commit:** 3f8df897
**Applied fix:** shared `strategy-event-labels.ts` 의 `EVIDENCE_KIND_LABELS` 옆에 `EVIDENCE_RANGE_LABEL = "체결 구간"` 을 두었다. `EvidenceKind` 값이 아니라 표시 구분이라는 점은 주석에 적었다. 웹 모델 `evidenceLabel` 과 카드 근거 줄이 이 상수를 import 한다. 라벨 테스트에 값 단언을 하나 더했다.

## 검증

모든 게이트는 **이 worktree(main checkout 아님 · `/Users/alex/repos/gh-radar/.claude/worktrees/phase-38`)** 에서 돌렸다. webapp 은 shared 를 dist 로 읽는다. 그래서 shared 를 바꾼 R2-WR-01 · R1-IN-04 다음에 `packages/shared` 를 `npm run build` 로 다시 빌드했다. dist 는 git 이 추적하지 않는다. 동시 세션 규율에 맞춰 vitest 는 `--maxWorkers=2` 로 돌렸다.

| 게이트 | 결과 |
|---|---|
| `packages/shared` `tsc --noEmit` | 통과 |
| `packages/shared` `vitest run --maxWorkers=2 src/__tests__/` | 39 파일 · 1,062 통과 · 2 skip. ticks-own 합성과 골든이 들어 있다. 오라클 단언 401/406 · 108 · 29/29 · 100/100 은 그대로 통과했다. |
| `webapp` `tsc --noEmit -p .` | 통과 |
| `webapp` `vitest run --maxWorkers=2 src/lib/ticks src/components/ticks` | 26 파일 · 379 통과. 1라운드 뒤 363건에서 16건 늘었다. |
| `webapp` 고친 파일 `eslint` | 경고 0 |
| Playwright e2e | 돌리지 않았다. 동시 세션 메모리 규율과 호출자 지시를 따랐다. |

e2e 에 미칠 영향을 따로 읽었다. R2-WR-02 로 당일 e2e 에도 `asOfMs` 가 생긴다. 목(`e2e/fixtures/ticks.ts`)은 `X-Tick-State` 로 ready 를 주고, 목 날짜는 지난 날이다. 그래서 실제 시계로는 늘 장 끝 뒤이고, 당일 e2e 에서는 대기가 없어진다. `ticks-viewer.spec.ts` 를 grep 해 보니 대기 · 「전문 아직 안 옴」 을 단언하는 곳은 없다. 「↻ 최신 받기 1회」 는 주문 수만 단언한다. 그래서 부딪히지 않는다고 읽었지만, 실제로 돌려 확인하지는 않았다.

---

_Fixed: 2026-11-04_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
