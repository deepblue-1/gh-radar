---
phase: quick-261002-fim
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/shared/src/relay.ts
  - relay/src/dma/envelope.ts
  - relay/src/ws/protocol.ts
  - relay/tests/helpers/frames.ts
  - relay/tests/helpers/fake-gateway.ts
  - relay/src/dma/__tests__/envelope.test.ts
  - relay/tests/fanout.test.ts
  - relay/tests/protocol.test.ts
  - webapp/src/test-fixtures/limit-chaser.ts
  - webapp/src/components/trading/lc/lc-fields.ts
  - webapp/src/components/trading/lc/setting-group.tsx
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/strategy-log.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - webapp/src/components/trading/__tests__/strategy-log.test.tsx
  - webapp/src/components/trading/lc/__tests__/lc-fields.test.ts
  - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
autonomous: true
requirements: [FIM-GEN, FIM-RELAY, FIM-SHARED, FIM-WEB, FIM-LOG, FIM-TEST]

estimate:
  tokens: 110000
  raw_tokens: 110000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "L-1: relay/src/generated 두 파일(StockDMA.fbs · stock-dma/set-limit-chaser.ts)은 작업 시작 시점 working tree 내용 그대로다 — git hash-object 가 92c37a79… · 371db682… 와 같고 그 밖의 generated 변경 0 (FIM-GEN)"
    - "C-A · L-2: 60 에코 · 64 목록 · 11.2 푸시의 post_buy_unlock_qty(vtable 136)를 relay readLimitChaser 가 postBuyUnlockQty 로 읽는다. 슬롯 부재(미배포 서버) = 0 (FIM-RELAY)"
    - "L-2: C→S 10 요청(buildSetLimitChaserReq)에는 vtable 136 슬롯이 없다 — S→C 전용. lc.set 인바운드에 실려 와도 zod 가 떨어뜨린다 (FIM-RELAY · FIM-TEST)"
    - "L-3: shared RelayLimitChaser.postBuyUnlockQty 가 있고 LIMIT_CHASER_SERVER_RUNTIME_FIELDS(7) · LIMIT_CHASER_SERVER_ONLY_FIELDS(12)에 포함돼 RelayLimitChaserInput 에서 타입으로 빠진다 (FIM-SHARED)"
    - "L-3: hub 는 상따 에코 객체를 통째로 캐시 · 팬아웃하므로 ws lc 프레임 item 에 postBuyUnlockQty 가 그대로 실린다(59키) — hub 코드 무변경 (FIM-RELAY)"
    - "L-4: 웹 후매수 「발동잔량」 칸 — 발동잔량 > 0 이면 종전대로(--up 강조), 발동잔량 0 · 해제선 > 0 이면 해제선 수(예 「264,000주」)를 --muted-fg 회색으로 + sr-only 「잠금 해제선」, 둘 다 0 이면 종전 「—」 + sr-only 「없음」. 펼친 행과 접힌 요약 둘 다 같은 규칙 (FIM-WEB)"
    - "L-5: postBuyUnlockQty 만 바뀐 에코는 전략 로그 0줄 · 「서버 반영 완료」 없음(런타임 전용 에코) (FIM-LOG)"
    - "L-6: 실행기는 커밋 · sync-relay-schema.sh 실행 · 배포 · push 를 하지 않는다 — 모든 변경은 working tree 에 남는다 (FIM-GEN)"
  artifacts:
    - path: "relay/src/generated/stock-dma/set-limit-chaser.ts"
      provides: "gh-trade 259bc869 생성물(이미 working tree 반영 · 손대지 않음) — postBuyUnlockQty() vtable 136"
      contains: "postBuyUnlockQty():number"
    - path: "relay/src/dma/envelope.ts"
      provides: "readLimitChaser 의 postBuyUnlockQty 디코드 · buildSetLimitChaserReq 미적재 주석"
      contains: "postBuyUnlockQty: t.postBuyUnlockQty()"
    - path: "packages/shared/src/relay.ts"
      provides: "RelayLimitChaser.postBuyUnlockQty · 런타임 에코 목록 7"
      contains: "\"postBuyUnlockQty\""
    - path: "webapp/src/components/trading/lc/setting-group.tsx"
      provides: "DerivedRow mutedValue · mutedSrText · GroupSummary kv sr"
      contains: "mutedValue"
    - path: "webapp/src/components/trading/lc/lc-fields.ts"
      provides: "POST_BUY_UNLOCK_SR_TEXT · lcSummaryOf post-buy 해제선 kv"
      contains: "POST_BUY_UNLOCK_SR_TEXT"
    - path: "webapp/src/test-fixtures/limit-chaser.ts"
      provides: "LC_BUY3_ECHO_DEFAULTS.postBuyUnlockQty 0 (20필드)"
      contains: "postBuyUnlockQty: 0"
  key_links:
    - from: "relay/src/dma/envelope.ts readLimitChaser"
      to: "relay/src/generated/stock-dma/set-limit-chaser.ts postBuyUnlockQty()"
      via: "생성 접근자 직접 호출 — 계산 없음"
      pattern: "t\\.postBuyUnlockQty\\(\\)"
    - from: "packages/shared/src/relay.ts LIMIT_CHASER_SERVER_RUNTIME_FIELDS"
      to: "webapp/src/components/trading/strategy-log.tsx VALUE_COMPARE_SKIP · RUNTIME_ONLY_SKIP"
      via: "스프레드 파생 — 목록을 두 벌 두지 않는다"
      pattern: "\"postBuyUnlockQty\""
    - from: "webapp/src/components/trading/limit-chaser-form.tsx 발동잔량 DerivedRow"
      to: "server.postBuyUnlockQty"
      via: "mutedValue prop"
      pattern: "mutedValue=\\{server\\?\\.postBuyUnlockQty"
---

<objective>
gh-trade 259bc869 가 SetLimitChaser 말미에 추가한 `post_buy_unlock_qty`(S→C 전용 · vtable 136 · 후매수 잠금 해제선)를 relay 파서 → shared 계약 → hub 통과 → 웹 상따 후매수 「발동잔량」 칸까지 잇는다. 발동잔량이 0 이고 해제선이 있으면 해제선 수를 회색으로 보인다(gh-trade 클라와 같은 규칙).

Purpose: 후매수가 잠겨 있는 동안 트레이더가 「매수1잔량이 몇 주 이하로 내려가야 잠금이 풀리는지」를 상따 카드에서 바로 본다. 서버(120 · 127) 미배포 동안은 필드가 0 으로 와서 화면은 종전과 같다.

Output: relay 파서 · 테스트 헬퍼 · 테스트, shared 타입 · 런타임 목록, 웹 픽스처 · DerivedRow · 요약 kv · 폼 배선 · 전략 로그 주석, 단위 테스트. 생성물 2파일은 이미 working tree 에 있다(손대지 않음).

잠긴 계약 · 결정 (오케스트레이터 전달):
- C-A: `post_buy_unlock_qty: uint` — S→C 표시 전용. 후매수 잠금 중(☐후매수 유효 · 단계 감시 · 해제 전 · peak > 0)이면 floor(peak × (100 − 반등률) / 100), 그 밖 0. 매수1잔량이 이 값 이하가 되면 잠금이 풀린다. 서버는 요청값을 읽지 않는다. `post_buy_trigger_qty` 의미 불변(잠금 중 0).
- L-1: 생성물(relay/src/generated/StockDMA.fbs · stock-dma/set-limit-chaser.ts)은 이미 working tree 에 동기화돼 있다(미커밋). **sync-relay-schema.sh 를 다시 돌리지 않는다. 생성 파일을 손으로 고치지 않는다.**
- L-2: relay 수기 사본 — readLimitChaser 가 읽고, buildSetLimitChaserReq 는 싣지 않는다(= 서버에 0 · 부재). 선례: quick-260930-fi4 `extraBuyAbandonQty`(커밋 3aac9a27) 패턴을 그대로 따른다.
- L-3: shared RelayLimitChaser 필드 + LIMIT_CHASER_SERVER_RUNTIME_FIELDS 합류(→ S→C 전용 12 · 런타임 7), 픽스처 기본값 0. hub 는 상따 객체를 통째로 넘기므로 코드 변경 없이 통과를 테스트로만 증명한다.
- L-4: 웹 표시 규칙(gh-trade 클라와 같음) — 발동잔량 > 0 → 종전 그대로. 발동잔량 0 이고 해제선 > 0 → 해제선을 흐린 회색(기존 토큰 `--muted-fg`). 접근성 이름 sr-only 「잠금 해제선」(그 행의 기존 sr-only 「없음」 패턴과 같은 방식).
- L-5: 해제선만 바뀐 에코가 전략 로그에 가짜 줄을 만들지 않는다(런타임 목록 합류로 자동 — 테스트로 증명).
- L-6: **실행기는 git commit 을 하지 않는다**(add 도 하지 않는다). 생성물 + 파서 + shared + 웹 + 테스트 + 계획 문서 전체를 오케스트레이터가 사용자 확인 뒤 커밋 1개로 묶는다. **배포 · push 없음**(순서는 메인 세션 몫: relay 먼저 → push). 목업 없음.
- L-7: 테스트 범위 — relay vitest · 관련 webapp 단위 테스트 · typecheck(shared · relay · webapp). 전체 e2e 없음.

플래너 재량(근거 — SUMMARY 에 옮길 것):
- P-1: 접힌 카드 요약 줄(`lcSummaryOf('post-buy')` 의 「발동잔량」 kv)에도 같은 규칙을 적용한다 — 펼침에서는 회색 수, 접힘에서는 「—」 이면 같은 칸이 두 말을 한다. 요약 kv 는 기존 `off: true`(값 글자 `--muted-fg`)로 회색을 내고, 스크린리더가 「발동잔량 264,000주」로 오독하지 않게 kv 에 선택 `sr` 접두를 더한다.
- P-2: DerivedRow 확장은 선택 prop 2개(`mutedValue` · `mutedSrText`)로 한다 — 발동잔량 행 하나만 쓰고, 기준선 행 · 다른 호출처는 무변경. 우선순위: value > 0 → 종전 강조 / value 0 · mutedValue > 0 → 회색 / 그 밖 → 종전 「—」.
- P-3: sr 문구는 lc-fields.ts 의 `POST_BUY_UNLOCK_SR_TEXT = '잠금 해제선'` 하나가 정본이고 펼친 행 · 요약 kv 가 같이 쓴다.
- P-4: 회색 수에 `title` 툴팁 등 추가 설명은 넣지 않는다(gh-trade 클라와 같은 표시 · 요청 범위).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

선례(읽기 전용 참고): `git show 3aac9a27` — extraBuyAbandonQty 를 relay 파서 · shared · 테스트 헬퍼 · 픽스처 · 키 수 단언에 넣은 정확한 모양. 이 계획의 relay · shared 부분은 그 diff 를 필드명만 바꿔 따르면 된다.

이미 working tree 에 있는 생성물(미커밋 · 손대지 않음 — L-1):
- relay/src/generated/StockDMA.fbs — SYNC MARKER server-repo-commit 259bc869 · synced-date 2026-10-02 · SetLimitChaser 말미 post_buy_unlock_qty
- relay/src/generated/stock-dma/set-limit-chaser.ts — postBuyUnlockQty()(vtable 136) · addPostBuyUnlockQty(필드 66) · startObject(67) · createSetLimitChaser 말미 인자(relay 에 호출처 없음 — grep 확인됨)
- 기준 해시: StockDMA.fbs = 92c37a79b235e451a783c3f1680b1eb9cf99a80e · set-limit-chaser.ts = 371db6826443b9d2576fd5dfb76e4e1244223a72

계획 시점 실측 앵커 (HEAD b30f07c2):
- packages/shared/src/relay.ts — RelayLimitChaser 문서 「활성 57필드」(L113) · 55 → 57 이력(L117) · S→C 전용 11필드 나열(L124~) · extraBuyAbandonQty(L280) · postBuyTriggerQty(L300) · postBuyAuto(L305~) · LIMIT_CHASER_SERVER_RUNTIME_FIELDS 문서 · 목록(L354~363) · SERVER_ONLY 문서 「11필드 · 런타임(6)」(L368) · RelayLimitChaserInput 문서 「11필드」(L393)
- relay/src/dma/envelope.ts — buildSetLimitChaserReq 문서 「S→C 전용 10필드」(L1294~1297) · 미적재 주석 목록(L1419~1422) · readLimitChaser 문서 「활성 57필드 · S→C 전용 11」(L2141~2143) · postBuyTriggerQty 읽기(L2247) · postBuyAuto 읽기(L2253)
- relay/src/ws/protocol.ts L127~131 — lc.set 스키마가 두지 않는 S→C 전용 필드 나열 주석
- relay/src/hub/subscription-hub.ts — #limitChasers 가 RelayLimitChaser 를 통째로 캐시(L669) · 상따에는 명시 재매핑이 없다 → 무변경
- relay/tests/helpers/frames.ts — FakeLimitChaserInput 문서(L547 「활성 57」 · L556~558 S→C 11) · extraBuyAbandonQty 입력(L639) · emitSetLimitChaser 의 addExtraBuyAbandonQty(L765)
- relay/tests/helpers/fake-gateway.ts — S→C 전용 vtable 문서(L453) · LC_SERVER_ONLY_VTABLE_SLOTS [112,126,128,130,134](L460~461)
- relay/src/dma/__tests__/envelope.test.ts — LC_SERVER_ONLY_VTABLES(L1225~1227) · 슬롯 부재 단언(L1349) · ① 왕복 「57필드(58키)」(L1601 · L1621~1627) · 키 수 58(L1745 · L1746 · L1767 · L1783) · ⑤-abandon-qty(L1770~1784) · ⑤-3 미적재(L1786~1797)
- relay/tests/fanout.test.ts — 후매수 보유중 에코 단언 「58키」(L1787~1788) · ⑰-auto-c(L2156~2175)
- relay/tests/protocol.test.ts — lc.set 인바운드 S→C 주입(L179~185) · 드롭 단언 루프(L201~209) · 43키(L195)
- webapp/src/test-fixtures/limit-chaser.ts — Buy3EchoFields Pick(L13~34) · LC_BUY3_ECHO_DEFAULTS(L40~) 「19개」 문서
- webapp/src/components/trading/lc/setting-group.tsx — GroupSummary(L472~487) · DerivedRowProps(L790~805) · DerivedRow(L810~845, 「—」 경로는 `text-[var(--muted-fg)]` + aria-hidden + sr-only)
- webapp/src/components/trading/lc/lc-fields.ts — LcSummaryItem(L563) · lcSummaryOf post-buy(L609~619)
- webapp/src/components/trading/limit-chaser-form.tsx — 발동잔량 DerivedRow(L1418~1432)
- webapp/src/components/trading/strategy-log.tsx — 문서 「S→C 전용 11필드」(L257) · 「런타임 6종」(L261~262 · L287) · 런타임 필드 예시(L39)
- 웹 테스트 앵커 — strategy-log.test.tsx L188~193(11 · 6 단언) · L787~823(포기 수량 describe) / setting-group.test.tsx L975~998(DerivedRow 발동잔량 2케이스) / lc-fields.test.ts L153~164(post-buy 요약) / limit-chaser-form.test.tsx L1466~1488(발동잔량 행 2케이스)

검증 명령(config workflow.build_command · test_command 에서 가져옴): pnpm --filter @gh-radar/shared build · pnpm --filter @gh-radar/relay run typecheck · typecheck:tests · test · pnpm --filter @gh-radar/webapp run typecheck · exec vitest run.
</context>

<tasks>

<task type="tracer">
  <name>Task 1 (트레이서): 60 에코 post_buy_unlock_qty → relay 디코드 → shared 계약 → 웹 후매수 「발동잔량」 칸 회색 해제선 — 한 경로</name>
  <precondition>git hash-object relay/src/generated/StockDMA.fbs relay/src/generated/stock-dma/set-limit-chaser.ts 가 92c37a79b235e451a783c3f1680b1eb9cf99a80e · 371db6826443b9d2576fd5dfb76e4e1244223a72 이다(생성물이 이미 working tree 에 있다 — 다르면 멈추고 보고).</precondition>
  <files>packages/shared/src/relay.ts, relay/src/dma/envelope.ts, relay/tests/helpers/frames.ts, relay/src/dma/__tests__/envelope.test.ts, webapp/src/test-fixtures/limit-chaser.ts, webapp/src/components/trading/lc/lc-fields.ts, webapp/src/components/trading/lc/setting-group.tsx, webapp/src/components/trading/limit-chaser-form.tsx, webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx</files>
  <behavior>
    - relay: buildSetLimitChaserRespFrame({ postBuyEnabled: true, postBuyPhase: 1, postBuyUnlockQty: 264_000 }) 를 parseLimitChaserEcho → postBuyUnlockQty 264000 · postBuyTriggerQty 0. buildLimitChaserListRespFrame([같은 입력]) 를 parseLimitChaserList → 원소 0 도 264000. 입력 없는 기본 프레임 → 0. 키 수 59.
    - relay: buildSetLimitChaserReq(lcInput()) 를 되읽으면 postBuyUnlockQty 0, 요청 테이블에 vtable 136 슬롯이 없다(LC_SERVER_ONLY_VTABLES 에 136 합류).
    - 웹 폼: 서버 에코 postBuyEnabled true · postBuyPhase 1 · postBuyTriggerQty 0 · postBuyUnlockQty 264_000 → [data-slot="lc-post-buy-trigger"] 안에 「264,000주」 가 class `text-[var(--muted-fg)]` 이고 `--up` 이 아니다 · sr-only 텍스트(trim) 「잠금 해제선」 · 「—」 없음 · 버튼 없음.
    - 웹 폼: postBuyTriggerQty 330_000 · postBuyUnlockQty 264_000(둘 다 있는 비정상 조합) → 「330,000주」 `--up` 만 보이고 「264,000주」 는 없다(발동잔량 우선).
    - 웹 폼: 둘 다 0 → 종전 「—」 + sr-only 「없음」(기존 L1466 케이스 그대로 통과).
  </behavior>
  <action>
    ① shared 계약 (L-3 · C-A). packages/shared/src/relay.ts RelayLimitChaser 에 `postBuyAuto` 다음(말미 쪽, 생성 순서와 같게) `postBuyUnlockQty: number` 를 추가한다. 문서: 「후매수 잠금 해제선(주) — **S→C 전용**(런타임 · gh-trade 259bc869 vtable 136). 잠금 중(☐후매수 유효 · 단계 감시 · 해제 전 · peak > 0)이면 floor(peak × (100 − 반등률) / 100), 그 밖 0. 매수1잔량이 이 값 이하가 되면 잠금이 풀린다. `postBuyTriggerQty` 의미는 그대로(잠금 중 0). `0` = 잠금 아님 또는 미배포 서버. 웹은 발동잔량이 0 일 때만 회색으로 보인다.」 LIMIT_CHASER_SERVER_RUNTIME_FIELDS 배열 끝에 "postBuyUnlockQty" 를 넣는다. 수 문서를 선례(3aac9a27)처럼 고친다: RelayLimitChaser 머리 「활성 57필드」 → 58 + 이력 줄 「57 → 58: `postBuyUnlockQty`(quick-261002-fim)」, S→C 전용 11 → 12(나열에 `postBuyUnlockQty` 추가 · 「이 11개를 뺀다」 → 12), 런타임 에코 문서 6 → 7(quick-261002-fim `postBuyUnlockQty` 언급 · 「D-13 로그 없음」 유지), SERVER_ONLY 문서 「11필드 · 런타임(6)」 → 「12필드 · 런타임(7)」, RelayLimitChaserInput 문서 「S→C 전용 11필드」 → 12. 타입 · 목록 외 코드는 바꾸지 않는다(Input 은 Omit 파생이라 자동).

    ② relay 파서 (L-2). relay/src/dma/envelope.ts readLimitChaser 의 `postBuyAuto: t.postBuyAuto(),` 다음 줄에 `postBuyUnlockQty: t.postBuyUnlockQty(),` 를 넣고 주석 「S→C 전용 — 후매수 잠금 해제선(주, uint32 · quick-261002-fim). 슬롯 부재(미배포 서버) = 0. 계산하지 않는다.」. buildSetLimitChaserReq 의 미적재 주석 목록(L1422 extra_buy_abandon_qty 줄 다음)에 「post_buy_unlock_qty — S→C 전용(quick-261002-fim). 싣지 않는다.」 를 더한다 — addPostBuyUnlockQty 를 호출하지 않는다(= 서버에는 부재 · 0). 문서 수 갱신: buildSetLimitChaserReq 문서 「S→C 전용 10필드」 → 11 + 나열에 `post_buy_unlock_qty`, readLimitChaser 문서 「활성 57필드(+ `postBuyAuto` · `extraBuyAbandonQty`)」 → 58(+ `postBuyUnlockQty`) · 「S→C 전용 11」 → 12 + 나열에 `postBuyUnlockQty`.

    ③ relay 테스트 헬퍼 · 파서 테스트. relay/tests/helpers/frames.ts FakeLimitChaserInput 끝에 `postBuyUnlockQty?: number`(문서: **S→C 전용** — 후매수 잠금 해제선(주, vtable 136). 기본 0 = 잠금 아님 · 미배포 서버) 를 두고, emitSetLimitChaser 의 addExtraBuyAbandonQty 다음 줄에 SetLimitChaser.addPostBuyUnlockQty(b, input.postBuyUnlockQty ?? 0) 을 넣는다. 헤더 문서 「활성 57 필드」 → 58(+ quick-261002-fim `postBuyUnlockQty`) · 「S→C 전용 11필드」 → 12 나열 추가. relay/src/dma/__tests__/envelope.test.ts: LC_SERVER_ONLY_VTABLES 에 136 추가(문서 「S→C 전용 5필드」 → 6, `post_buy_unlock_qty` 136), ① 왕복 이름 「57필드 왕복(58키)」 → 「58필드 왕복(59키)」 · `expect(item!.postBuyUnlockQty).toBe(0)` 추가 · 키 수 주석에 「+ 1(postBuyUnlockQty · quick-261002-fim) = 58 + key」 · toHaveLength(58) → 59, 이 파일의 나머지 toHaveLength(58) 4곳(L1745 · L1746 · L1767 · L1783)도 59. ⑤-abandon-qty 다음에 새 it 「⑤-unlock-qty 60 · 64 의 postBuyUnlockQty 를 디코드한다 — 기본 프레임 0 · 잠금 에코는 264000 (quick-261002-fim)」 을 ⑤-abandon-qty 와 같은 모양으로(<behavior> relay 첫 항목). ⑤-3 미적재 블록 주석에 post_buy_unlock_qty 를 더하고 `expect(sent!.postBuyUnlockQty).toBe(0)` 추가. RED(새 단언 실패) → ②로 GREEN 순서.

    ④ 웹 픽스처 (L-3). webapp/src/test-fixtures/limit-chaser.ts Buy3EchoFields Pick 에 'postBuyUnlockQty', LC_BUY3_ECHO_DEFAULTS 에 postBuyUnlockQty: 0, 머리 문서 「19」 → 20(quick-261002-fim 으로 `postBuyUnlockQty` 합류) · 「신필드 19개」 → 20. shared 를 빌드한 뒤 webapp typecheck 가 다른 인라인 RelayLimitChaser 리터럴을 지적하면 거기에만 postBuyUnlockQty: 0 을 넣는다(타입체크가 요구하는 곳만).

    ⑤ 웹 발동잔량 칸 (L-4 · P-2 · P-3). lc-fields.ts 에 `export const POST_BUY_UNLOCK_SR_TEXT = '잠금 해제선'`(문서: 후매수 잠금 해제선의 접근성 접두 — 펼친 행 · 요약 kv 공용 정본) 를 둔다. setting-group.tsx DerivedRowProps 에 선택 prop 2개: `mutedValue?: number`(문서: 값 0 일 때 대신 회색으로 보일 보조값 — 후매수 잠금 해제선 · quick-261002-fim. 0 · 미지정이면 valueText 로 떨어진다), `mutedSrText?: string`(문서: mutedValue 앞에 읽힐 sr-only 접두). DerivedRow 렌더 우선순위: (a) value === 0 이고 (mutedValue ?? 0) > 0 이면 — 바깥 span 은 「—」 경로와 같은 `whitespace-nowrap text-[15px] font-medium leading-[1.5]`, 그 안에 먼저 mutedSrText 가 있으면 sr-only span(텍스트는 접두 + 끝 공백 하나 — 화면에는 안 보이고 스크린리더가 「잠금 해제선 264,000주」로 읽게), 이어서 `data-muted-value="true"` 를 단 span 이 `tabular-nums text-[var(--muted-fg)]` 로 formatSettingValue(mutedValue, unit) 을 그린다(aria-hidden 아님 — 수 자체가 정보다). (b) 그 밖은 기존 empty(「—」) · 값 경로 그대로. emphasis 는 (a)에서 쓰지 않는다. 새 색 토큰 · 새 클래스 체계를 만들지 않는다(기존 `--muted-fg` · sr-only 만). limit-chaser-form.tsx L1421 발동잔량 DerivedRow 에 `mutedValue={server?.postBuyUnlockQty ?? 0}` · `mutedSrText={POST_BUY_UNLOCK_SR_TEXT}` 를 넘기고(lc-fields import 목록에 추가), 위 주석에 「발동잔량 0 · 해제선 > 0 이면 해제선 회색(gh-trade 259bc869 · quick-261002-fim)」 한 줄을 더한다. 기준선 DerivedRow(L1436)는 무변경.

    ⑥ 폼 테스트. limit-chaser-form.test.tsx 의 발동잔량 행 케이스들(L1466~1488) 옆에 <behavior> 웹 폼 3 항목 중 앞 2개를 새 it 로 추가한다(echo 헬퍼에 postBuyUnlockQty 를 넘기는 방식 · 기존 group/within 헬퍼 재사용). 테스트 먼저(RED) → ⑤로 GREEN.

    금지: git add · git commit · git stash · sync-relay-schema.sh 실행 · relay/src/generated 편집 · 배포 · push (L-1 · L-6). 기존 untracked(.planning/quick/*/shots/ · .planning/research/.cache/)는 건드리지 않는다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && test "$(git hash-object relay/src/generated/StockDMA.fbs)" = 92c37a79b235e451a783c3f1680b1eb9cf99a80e && test "$(git hash-object relay/src/generated/stock-dma/set-limit-chaser.ts)" = 371db6826443b9d2576fd5dfb76e4e1244223a72 && pnpm --filter @gh-radar/shared run typecheck && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay exec vitest run src/dma/__tests__/envelope.test.ts && pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/limit-chaser-form.test.tsx && pnpm --filter @gh-radar/webapp run typecheck</automated>
  </verify>
  <done>60 · 64 에코의 postBuyUnlockQty 가 relay 디코드(부재 0) → shared RelayLimitChaser → 웹 후매수 「발동잔량」 칸 회색 「264,000주」 + sr-only 「잠금 해제선」 까지 한 경로로 이어지고, 발동잔량이 있으면 종전 강조가 우선한다. C→S 요청에 vtable 136 슬롯 없음. 생성물 해시 불변. shared · relay(typecheck + typecheck:tests) · webapp typecheck 와 envelope.test · limit-chaser-form.test 통과. 커밋 없음.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: relay 경계 증명 — hub 통과(ws lc 59키) · lc.set 인바운드 드롭 · fake-gateway 슬롯 136 부재</name>
  <files>relay/tests/helpers/fake-gateway.ts, relay/tests/fanout.test.ts, relay/tests/protocol.test.ts, relay/src/ws/protocol.ts</files>
  <behavior>
    - fanout: 게이트웨이가 60 에코(buyEnabled true · postBuyEnabled true · postBuyPhase 1 · postBuyUnlockQty 264_000)를 밀면 그 ws 의 lc 프레임 item.postBuyUnlockQty 264000 · postBuyTriggerQty 0 · 키 59.
    - fanout: 기존 후매수 보유중 에코 · ⑰-auto-c 의 키 수 단언이 59 로 통과.
    - fanout/fake-gateway: 브라우저 lc.set 이 만든 10 요청의 serverOnlySlots 가 여전히 [] — 슬롯 목록에 136 포함.
    - protocol: lc.set cfg 에 postBuyUnlockQty: 264_000 을 실어 보내도 파싱 결과 cfg 에 그 키가 없고 키 수 43 그대로.
  </behavior>
  <action>
    ① relay/tests/helpers/fake-gateway.ts LC_SERVER_ONLY_VTABLE_SLOTS 에 136 추가, 문서 2곳 「S→C 전용 5필드」 → 6 + `post_buy_unlock_qty` 136 (L-2 · 선례 3aac9a27 의 같은 자리).

    ② relay/tests/fanout.test.ts: 후매수 보유중 에코 테스트(L1787~1788)의 키 수 주석에 「· postBuyUnlockQty · quick-261002-fim」 를 더하고 toHaveLength(58) → 59. ⑰-auto-c(L2156~)의 이름 「58키」 → 「59키」 · toHaveLength 59. ⑰-auto-c 바로 다음에 새 it 「⑰-unlock 60 에코 postBuyUnlockQty 264000 → ws lc 프레임 item 그대로 · 59키 (quick-261002-fim)」 를 ⑰-auto-c 와 같은 모양(authed → lc.set → 10 수신 대기 → pushLimitChaserEcho → lc 프레임 대기)으로 추가해 <behavior> 첫 항목을 단언한다. 이 파일에 serverOnlySlots: [] 단언이 이미 있으면 그대로 두고(슬롯 목록 확장으로 136 부재까지 자동 증명), hub(relay/src/hub/subscription-hub.ts)는 상따 객체를 통째로 캐시 · 팬아웃하므로 **수정하지 않는다** — 새 it 가 통과로 증명한다(L-3).

    ③ relay/tests/protocol.test.ts lc.set 인바운드 드롭 테스트(L179~209): 주입 cfg 의 Phase 24 S→C 5 다음에 `postBuyUnlockQty: 264_000` 을 더하고(주석에 quick-261002-fim), 드롭 단언 루프 배열에 "postBuyUnlockQty" 추가. 43키 단언은 그대로 통과해야 한다(zod z.object 미지 키 드롭 — 스키마 코드 무변경).

    ④ relay/src/ws/protocol.ts L127~131 주석(lc.set 스키마가 두지 않는 S→C 전용 필드 나열)에 「· quick-261002-fim 의 `postBuyUnlockQty`」 를 더한다 — 주석만, 스키마 코드 무변경.

    테스트를 먼저 고치고(RED: Task 1 뒤 키 수 58 단언이 실패하는 상태 확인) 통과까지. 금지: git add · commit · 생성물 편집 · sync 스크립트 · 배포 (L-1 · L-6).
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay run test && git diff --quiet -- relay/src/hub/subscription-hub.ts</automated>
  </verify>
  <done>relay 전체 vitest 통과 — ws lc 프레임에 postBuyUnlockQty 가 hub 무변경으로 실리고(59키), lc.set 인바운드에서 떨어지며, 10 요청에 슬롯 136 이 없다. relay typecheck · typecheck:tests 통과. subscription-hub.ts diff 0. 커밋 없음.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 웹 확장 — 접힌 요약 「발동잔량」 kv 회색 해제선 · DerivedRow 단위 케이스 · 해제선만 바뀐 에코 로그 0줄</name>
  <files>webapp/src/components/trading/lc/lc-fields.ts, webapp/src/components/trading/lc/setting-group.tsx, webapp/src/components/trading/strategy-log.tsx, webapp/src/components/trading/__tests__/strategy-log.test.tsx, webapp/src/components/trading/lc/__tests__/lc-fields.test.ts, webapp/src/components/trading/lc/__tests__/setting-group.test.tsx</files>
  <behavior>
    - lcSummaryOf('post-buy', values(), srv({ postBuyPhase: 1, postBuyUnlockQty: 264_000 }))[4] → { key: '발동잔량', value: '264,000주', off: true, sr: '잠금 해제선' }
    - 같은 함수에 postBuyTriggerQty 330_000 · postBuyUnlockQty 264_000 → [4] 는 종전 { key: '발동잔량', value: '330,000주', off: false } (sr 키 없음)
    - 둘 다 0 → 종전 { key: '발동잔량', value: '—', off: true } (기존 케이스 그대로)
    - GroupSummary: sr 있는 kv 는 값 앞에 sr-only 접두(trim 「잠금 해제선」)를 두고 값 글자는 `--muted-fg`, sr 없는 kv 마크업은 종전과 같다(sr-only 0개)
    - DerivedRow value 0 · mutedValue 264_000 · mutedSrText 「잠금 해제선」 → 「264,000주」 `text-[var(--muted-fg)]` · `--up` 아님 · font-semibold 아님 · data-muted-value="true" · sr-only trim 「잠금 해제선」 · 「—」 없음
    - DerivedRow value 330_000 · mutedValue 264_000 → 「330,000주」 `--up` 만, 「264,000주」 없음 · sr-only 없음
    - DerivedRow value 0 · mutedValue 0 → 종전 「—」 + sr-only 「없음」
    - 전략 로그: LIMIT_CHASER_SERVER_ONLY_FIELDS 12 · RUNTIME 7 · toContain('postBuyUnlockQty') · 합집합 동치 유지
    - 전략 로그: 후매수 감시 중 에코에서 postBuyUnlockQty 만 0 → 264,000 → 250,000 으로 바뀌면 isRuntimeOnlyEcho true · limitChaserValuesChanged false · strategyLogLine null (각 전이)
  </behavior>
  <action>
    ① 요약 kv (L-4 · P-1 · P-3). lc-fields.ts LcSummaryItem 에 선택 `sr?: string`(문서: 값 앞에 읽힐 sr-only 접두 — 회색 해제선처럼 key 만으로 오독되는 값 · quick-261002-fim) 추가. lcSummaryOf 'post-buy' 분기에서 `const unlock = server?.postBuyUnlockQty ?? 0` 을 두고 발동잔량 kv 를 3갈래로: trigger > 0 → 종전, 아니고 unlock > 0 → { key: '발동잔량', value: fmt(unlock, '주'), off: true, sr: POST_BUY_UNLOCK_SR_TEXT }, 그 밖 → 종전 「—」. sr 키는 해제선 갈래에서만 둔다(다른 kv 객체 모양 불변 — 기존 toEqual 단언 보존). lcSummaryOf 머리 문서의 「발동잔량은 요약에서 빨강을 쓰지 않는다」 뒤에 「발동잔량 0 · 해제선 > 0 이면 해제선을 꺼진 kv 색으로(+ sr 접두)」 한 줄. setting-group.tsx GroupSummary 의 items 원소 타입에 `sr?: string` 을 더하고, kv 렌더에서 값 span 바로 앞에 kv.sr 이 있을 때만 sr-only span(접두 + 끝 공백 하나)을 둔다. 값 span 클래스 · key span · 줄바꿈 규칙은 무변경.

    ② 단위 테스트. setting-group.test.tsx ⑪ describe 의 DerivedRow 발동잔량 2케이스(L975~998) 다음에 <behavior> DerivedRow 3 항목, 같은 파일에 GroupSummary sr 케이스 1개(sr 있음 · 없음 대조)를 추가한다. lc-fields.test.ts 의 post-buy 요약 it(L153~164) 옆에 <behavior> 요약 앞 2 항목을 새 it 로 추가한다(srv 헬퍼에 postBuyUnlockQty 를 넘김).

    ③ 전략 로그 (L-5). strategy-log.test.tsx L188~193 단언을 12 · 7 로 고치고 it 이름의 「11개 · RUNTIME(6)」 → 「12개 · RUNTIME(7)」 + 「quick-261002-fim」, toContain('postBuyUnlockQty') 를 추가한다. 포기 수량 describe(L787~) 다음에 새 describe 「후매수 잠금 해제선 — 런타임 전용 에코 (quick-261002-fim)」 를 두고 at({ buyEnabled: true, postBuyEnabled: true, postBuyPhase: 1, postBuyTriggerQty: 0, postBuyUnlockQty: 0 }) 기준으로 <behavior> 마지막 항목을 단언한다(0 → 264,000 · 264,000 → 250,000 · 264,000 → 0 각각 runtime-only · 값 변경 없음 · null). strategy-log.tsx 는 **코드 무변경** — 런타임 목록 스프레드가 자동으로 빼는지 테스트가 증명한다. 문서만 고친다: L257 「S→C 전용 11필드」 → 12, L261~262 「런타임 6종(… 포기 수량(quick-260930-fi4) · 후매수 발동잔량 · 잔여 · 단계)」 → 7종 + 「· 후매수 잠금 해제선(quick-261002-fim)」, L287 「런타임 6종」 → 7종, L39 런타임 필드 예시 나열에 `postBuyUnlockQty` 추가.

    ④ 실행 범위. 위 파일과 관련 테스트만 고친다. 이미 Task 1 이 바꾼 limit-chaser-form.tsx · DerivedRow 는 다시 건드리지 않는다(②는 그 동작을 단위로 고정만). 금지: git add · commit · 배포 · push (L-6). 마지막에 남은 vitest · tsc 프로세스가 없는지 확인한다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/components/trading src/lib && pnpm --filter @gh-radar/webapp run typecheck</automated>
  </verify>
  <done>접힌 후매수 요약의 「발동잔량」 kv 가 펼친 행과 같은 규칙(발동 > 0 강조 · 해제선 회색 + sr 「잠금 해제선」 · 둘 다 0 「—」)을 따른다. 해제선만 바뀐 에코는 로그 0줄 · 「서버 반영 완료」 없음. strategy-log.tsx 코드 무변경(문서만). webapp src/components/trading · src/lib vitest 와 typecheck 통과. 커밋 없음.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| gh-trade 게이트웨이 → relay (FlatBuffers 60/64/11.2) | 서버 에코를 relay 가 디코드 — 새 uint 필드 1개가 이 경계를 건넌다 |
| relay hub → 브라우저 (ws lc · lc.snap) | 사용자별 캐시 키(lcKey) 뒤 팬아웃 — 기존 경로 그대로 |
| 브라우저 → relay (lc.set) → 게이트웨이 (10) | S→C 전용 필드가 역류하면 안 되는 경계 |
| gh-trade 저장소 → gh-radar 생성물 | 생성 스크립트 산출물만 들어오는 공급 경계(이번엔 이미 반영됨) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-fim-01 | Tampering | buildSetLimitChaserReq / lc.set zod | high | mitigate | postBuyUnlockQty 를 LIMIT_CHASER_SERVER_RUNTIME_FIELDS 에 넣어 RelayLimitChaserInput 에서 타입으로 제외, 조립기는 addPostBuyUnlockQty 를 호출하지 않음, envelope.test · fake-gateway 가 vtable 136 슬롯 부재를 단언, protocol.test 가 인바운드 드롭(43키 유지)을 단언 |
| T-fim-02 | Tampering | relay/src/generated/** | high | mitigate | 생성물은 gh-trade 스크립트 산출(이미 반영)만 쓰고 손편집 · 재실행 금지 — Task 1 verify 가 두 파일 git hash-object 를 계획 시점 값과 대조 |
| T-fim-03 | Repudiation | webapp strategy-log 값 변경 판정 | medium | mitigate | 해제선은 서버가 스스로 움직이는 런타임 값 — 런타임 목록 합류로 VALUE_COMPARE_SKIP · RUNTIME_ONLY_SKIP 에서 빠져 「서버 반영 완료」 · 「다른 단말」 오귀속이 생기지 않음. strategy-log.test 새 describe 가 0줄을 단언 |
| T-fim-04 | Information disclosure | relay/src/hub/subscription-hub.ts 상따 팬아웃 | low | accept | 같은 상따 객체에 필드 1개가 더해질 뿐 — 캐시 키 · 계좌 범위 · 수신자 집합 불변. hub 코드 diff 0 을 Task 2 verify 가 확인 |
| T-fim-05 | Denial of service | readLimitChaser | low | accept | uint32 고정 크기 스칼라 — 추가 할당 · bigint 경계 없음, 슬롯 부재는 생성 기본 0 |

패키지 설치 없음 — 공급망 설치 게이트 해당 없음.
</threat_model>

<verification>
- 생성물: relay/src/generated 두 파일 git hash-object 가 92c37a79… · 371db682… 그대로, git diff --name-only -- relay/src/generated 가 그 2파일뿐.
- shared: typecheck · build 통과.
- relay: typecheck · typecheck:tests · 전체 vitest(pnpm --filter @gh-radar/relay run test) 통과. subscription-hub.ts diff 0.
- webapp: typecheck(tsc + e2e tsconfig) · vitest src/components/trading · src/lib 통과.
- 커밋 0: git log -5 --format=%s 에 261002-fim 이 없다 · git diff --cached --quiet(스테이징 0). push · 배포 없음.
- 남은 vitest · tsc 프로세스 없음.
</verification>

<success_criteria>
- 서버가 해제선을 보내면 웹 상따 후매수 「발동잔량」 칸(펼침 · 접힘)이 발동잔량 0 일 때 해제선을 회색으로 보이고 스크린리더는 「잠금 해제선 N주」로 읽는다. 발동잔량이 있으면 종전 강조 그대로, 둘 다 0 이면 종전 「—」.
- 미배포 서버(필드 부재)에서는 0 으로 디코드돼 화면 · 로그가 종전과 같다.
- 해제선은 relay 에서 C→S 로 가지 않고, 해제선만 바뀐 에코는 로그를 만들지 않는다.
- 모든 변경이 working tree 에 미커밋으로 남는다(오케스트레이터가 생성물과 함께 커밋 1개로 묶음).
</success_criteria>

<output>
Create `.planning/quick/261002-fim-post-buy-unlock-qty-relay-shared-hub/261002-fim-SUMMARY.md` when done — 판단 사항에 P-1~P-4 를 옮기고, 커밋 · push · relay 배포를 하지 않았음(배포 순서: relay 먼저 → 검증 → push)과 서버(120 · 127) 미배포 동안 필드가 0 으로 온다는 점을 명시한다. SUMMARY 도 커밋하지 않는다.
</output>

## Source Coverage Audit

| Source | Item | Plan coverage |
|--------|------|---------------|
| GOAL | post_buy_unlock_qty 종단 — 생성물(이미 반영) · relay 파서 · shared 계약 · hub 통과 · 웹 회색 표시 | Task 1 · 2 · 3 |
| CONTEXT | C-A 의미(S→C 전용 · 잠금 중만 > 0 · trigger 의미 불변) | Task 1 ①(타입 문서) · ⑤(표시 우선순위) |
| CONTEXT | L-1 생성물 손대지 않음 · sync 재실행 금지 | Task 1 precondition · verify 해시 대조 · 금지 문구 |
| CONTEXT | L-2 relay 디코드 · C→S 미적재 | Task 1 ② ③ · Task 2 ① ③ |
| CONTEXT | L-3 shared 필드 · 런타임 목록 · 픽스처 · hub 통과 | Task 1 ① ④ · Task 2 ② |
| CONTEXT | L-4 웹 「발동」 칸 회색 해제선 · sr-only 「잠금 해제선」 · 기존 muted 토큰 | Task 1 ⑤ ⑥ · Task 3 ① ② |
| CONTEXT | L-5 strategy-log 가짜 줄 없음 | Task 3 ③ |
| CONTEXT | L-6 커밋 · 배포 · push 금지 | 모든 task action 금지 문구 · verification 커밋 0 확인 |
| CONTEXT | L-7 테스트 범위(relay vitest · 관련 webapp 단위 · typecheck 3종, e2e 없음) | Task 1~3 verify |
</content>
</invoke>
