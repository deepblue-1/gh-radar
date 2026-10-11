# Phase 25: 주문로그·잔량진행률 - Context

**Gathered:** 2026-09-29
**Status:** Ready for planning

<domain>
## Phase Boundary

기획서 「상따수정 — 주문로그·잔량진행률」(MJ 2026-09-27)을 gh-radar 에 반영한다. 1부 로그 7종(상한가노출·상한가진입·매수 주문·대기·첫 체결·매도 주문·취소/거부)은 **gh-trade 서버 StrategyEvent** 다 — 관찰자 저널 `JournalBatch`(80) 말미 `strategy_events`(별도 seq 공간·같은 epoch)로 오고, relay 가 Supabase 에 멱등 적재·계좌 권한 사용자에게 푸시하며, 웹은 두 표면에 보인다: **오늘 주문 카드 행 펼침** + **작업대 「주문로그」 탭**(공용 패널 + 종목 카드 탭). 기존 「전략 로그」 탭은 설정 이력으로 분리 유지. 2부 잔량진행률은 **B안**(대기 행 아래 2줄째)으로 미체결 3표면 + 모바일 r3 에 그리며 값은 `QueueProgress` 브로드캐스트에서만 온다(웹 계산 없음). 범위는 **풀안**(창 분리·새 로그 배지·스크롤 고정·ms 시각·상한가 노출/진입 포함). 용어는 기존 웹 라벨(선매수/추가매수/후매수) 유지 — 기획서 「줄서기매수」 = 웹 「후매수」.

**분담(gh-trade-6d 와 2026-09-29 확인):** gh-trade = 서버 StrategyEvent 생성·JournalBatch append·QueueProgress·fbs 커밋·`sync-relay-schema.sh` 실행·WinForms. gh-radar = relay 스트림 2 커서/적재/푸시·테이블·조회 RPC 2·server 라우트·웹 3표면·표시명 매핑·문장 조립. 웹 표시 쪽 정본은 gh-radar 다(gh-trade 에 겹치는 작업 없음).

</domain>

<decisions>
## Implementation Decisions

### 이미 확정된 것(ROADMAP · reference · 2026-09-29 사용자 결정 — 다시 묻지 않는다)
- 와이어 필드 v0.1 동결(`reference/gh-trade-strategy-event-fields-v0.1.md`) · `gw_time_ms` 어휘 통일 · `snap_qty/snap_cum` 벡터 · JSON 키 snake_case 1:1 · `dma_user_id` 는 감사 컬럼만.
- relay: 스트림 2개(주문 저널·전략 이벤트) 각각 커서·gap·resync(`dma_journal_cursor.strategy_last_seq`), 로그인 요청에 두 since, live 전이는 두 caught_up 모두 true, `strategy_oldest_seq = 0` 은 WR-07 규칙. 새 RPC `dma_strategy_apply` 별도 트랜잭션. 새 테이블 `dma_strategy_events` PK (gateway, journal_epoch, seq), 원문 보존·투영 없음. 푸시 `journal.events`(저널 행과 같은 계좌 필터) · `QueueProgress` → `unf.progress`(가칭, (isin, exchange) 키 전량 교체, account_no 필수).
- 가시성: 주문 이벤트는 `dma_account_access` 계좌 조인, 시세 이벤트(kind 1·2, account_no 빈 값)는 그 게이트웨이 자격증명 사용자 전원. Rejected(8)는 order_no 없어 평면 목록만(reject_seq 조인은 후속).
- server/Supabase: 조회 RPC 2(하루치 평면 목록 · 주문 이벤트 목록) service_role 전용 + 명시 REVOKE(anon/authenticated) · 라우트 `GET /api/orders/:id/events` · `GET /api/strategy-events`(가칭).
- 진행률 B안 채택(`reference/mockup-unfilled-progress.html`) · 웹 계산 없음 · 90% 이상 up 색 · 첫 체결/취소 시 보조행만 삭제 · 미체결 행 사라지면 진행률도 삭제 · remaining 음수는 0 · progress_bp 만분율.
- 오늘 주문 별건 3: 방향 미상 「주문」 · result_code -2 「접수 불명」(투영 status 는 rejected 유지, 화면에서 가름) · R(New) 방향 참고 표기. 통보 문장은 gh-trade 템플릿 v0(`reference/gh-trade-order-log-template-draft.md`) + 대조·합의(`reference/order-log-template-review.md`) 그대로 — 재작성하지 않는다. 문구 파싱 금지(D-36) · 취소/정정 방향 없음 · board G2/G3 는 D-15 규칙 · 출처는 배지.
- 착수 순서: gh-trade fbs 커밋(해시 통보) → gh-trade `sync-relay-schema.sh RELAY=gh-radar` → gh-radar 생성물 + 수기 사본 3곳(msg-type · envelope · hub) 커밋. 배포 gh-trade 서버 → relay → webapp push. **fbs 전에는 서버 무관 부분(테이블/RPC 설계 · UI 골격 · 문장 조립기 · 표시명 표)만 진행.**

### ① 오늘 주문 행 펼침 (목업 `reference/mockup-today-orders-expand.html` 로 확정)
- **D-01: 펼침 = 저널 통보(A/E/C/M/R) + 전략 이벤트를 `gw_time_ms` 순 한 타임라인(1-A).** 줄마다 출처 배지(통보/상따). 접수 → 대기(체결예상) → 체결 조각(seq 순 running sum, 전량 판정 filled+modified≥qty) → 첫 체결 오차 → 취소 확인 → 취소 사유(남은 거래량) 순으로 한 줄기. 수동 주문 행은 통보만. 주문 1건 이벤트 조회 RPC 는 `dma_journal_events` + `dma_strategy_events` 를 UNION 해 공개 컬럼만 반환(왕복 1회).
- **D-02: 3초 창으로 묶인 행(자동 매도 조각 등)은 묶음 전체 이벤트를 한 타임라인에(2-A).** RPC 가 order_no 배열을 받는다. 줄마다 `#주문번호` 꼬리. 클릭 1회 = RPC 1회.
- **D-03: 펼쳐 둔 행은 푸시로 라이브 이어붙임.** 펼칠 때 RPC 1회 복원, 이후 `journal.events` 푸시를 같은 (gateway, trade_date, account_no, order_no) 에 이어붙인다. 통보 조각은 이벤트 푸시가 없으므로 `journal.rows` 의 그 행 lastSeq 가 오르면 재조회 1회.
- **D-04: 트리거 = 행 전체 클릭(3-A), 여러 행 동시 펼침, 모바일 2줄 카드 행도 동일.** 시각 앞 ▸ 표식 회전, 열린 행은 옅은 primary 배경(`color-mix(primary 6%)`). 펼침 상태는 메모리만(새로고침 시 닫힘). 펼침 본문은 왼쪽 세로선 타임라인(시각 ms · 배지 · 문장), 모바일은 시각 폭 78px + 줄바꿈 허용.

### ② 작업대 「주문로그」 탭 (목업 `reference/mockup-order-log-tab.html` 로 확정)
- **D-05: 한 줄 형태 = 기획서 형식 그대로(F-A).** `[시간 ms][주문번호][구분] 거래소 | 종목 | 내용 | 누적 N`. 시세 로그는 주문번호 칸 없음. 좁으면 끝 잘림(…) + 툴팁으로 전체. 구분 색: 매수 up · 매도 down · 시세 accent. 새로 도착한 줄은 옅은 강조.
- **D-06: 표면 = 공용 패널 + 종목 카드 탭 둘 다.** 카드 탭은 그 종목만(종목 필터 없음, 거래소·구분만). 탭 이름 「주문로그」, 기존 「전략 로그」 탭은 그대로 남긴다(`SharedTab` 에 값 추가 + `trading-layout.ts` 탭 화이트리스트 동기).
- **D-07: 조회 범위 = 탭은 오늘만.** 마운트 시 하루치 RPC 1회 + 푸시 이어붙임. 과거일은 **창 분리 페이지에서만 날짜 선택**(오늘 이전 거래일 이동). DB 보관은 무기한.
- **D-08: 구분 필터 값 = 전체 · 선매수 · 추가매수 · 후매수 · 매도(호가·체결·훅 합침) · 시세(노출·진입).** group 축 기준, kind 필터는 두지 않는다. 거래소 필터 = 전체/KRX/NXT. 종목 필터 = 그날 이벤트가 있는 종목 목록.
- 공통(풀안, 재량 세부는 아래): 탭줄 새 로그 배지(카운트) · 「새 로그 N · 맨 아래로 ↓」 sticky 핀 · 창 분리 ↗ 버튼 → 별도 라우트 새 창(필터 상태를 쿼리로 전달, 창에는 배지 없음·스크롤 고정만).

### ③ 로그 문장 조립 규칙
- **D-09: 조립기는 하나(shared), 두 표면이 같은 본문을 쓴다.** 주문로그 탭 = `거래소 | 종목 | 본문 | 누적`, 오늘 주문 펼침 = 행에 이미 있는 거래소·종목·주문번호를 뺀 `본문 · 누적`. 웹이 v0.1 필드로 문장을 만든다(서버 문장 없음). 기획서 예시 형식(조건 설정/실측 · 근거 틱 · 상한가 매수잔량 · 가격×수량 · 접수 +ms · 체결예상 (기준 + 앞 물량) · 오차 부호 · 남은 거래량 (예상 − 누적))을 따른다.
- **D-10: 서버 코드는 표시명만, 원문 코드는 숨긴다.** `cancel_reason` → 수동 취소 · 이탈 매도 · 매수1 이탈 · VI 감시 · 거래소 취소 · 마감 정리(가칭, 최종 문구는 표시명 표). `cond_metric` + `reason_code` 연산자 → 「매도잔량≤50,000」 처럼 지표명+연산자+값. `group`/`kind` 표시명은 기존 웹 라벨(선매수/추가매수/후매수, 호가매도/체결매도/체결훅). 모르는 enum 값은 원문 그대로 노출(숨기지 않음). 표시명 표는 `@gh-radar/shared` 한 곳.
- 기타 표기는 기획서 세부 규칙 그대로(재량): 시초 상한가 · 상한가진입 「N차」 + 스냅 3회(3초 전 이탈이면 있는 것만 + 꼬리) · 즉시체결 N주(나머지만 대기 — `immediate_fill_qty` 는 **Queued(4)** 에 실린다(gh-trade 정정 2026-09-29): 전량 즉시체결 = Queued `qty=0`·`immediate_fill_qty=전량` → 「즉시체결 N주 · 대기 없음」(FirstFill 없음) · 일부 즉시체결 = Queued `qty=남은 수량`·`immediate_fill_qty=체결분` → 「대기 N주 · M주 즉시체결」 · `immediate_fill_qty=0` 이면 일반 대기 문장) · 거부는 주문번호 「-」 · 남은 거래량은 has_remaining 일 때만.

### ④ 진행률 경계 상태
- **D-11: `QueueProgress` 가 아직 없는 대기 행은 보조행 없음.** 값이 온 때만 그린다. 웹이 「대기 중인지」 를 추정하지 않는다(즉시체결이면 값이 영영 안 옴).
- **D-12: 누적이 체결예상을 넘었는데 첫 체결 전(remaining ≤ 0 · progress_bp ≥ 10000)은 「0주 남음」 + 가득 찬 막대 100%(up 색).** 음수는 0 으로, 100% 상한.
- **D-13: 오래된 값 표식 없음, 마지막 값 유지.** 미체결 행이 사라지면(66/67) 보조행도 삭제(마지막 「빠진 스냅샷」 드롭 대비 이중 안전). 단일가·VI 구간에는 서버가 갱신을 멈추므로 값이 멈추는 것이 정상.

### Claude's Discretion
- 새 로그 배지 카운트 기준(탭이 가려진 동안 도착한 수, 탭 열면 0) · 필터 적용 여부 · 「맨 아래」 판정 여유 px · sticky 핀 문구.
- 창 분리 라우트 경로(예: `/trading/order-log`) · 쿼리 파라미터 이름 · 날짜 이동 UI · 새 창 크기.
- 조회 RPC 이름·시그니처(주문 이벤트 목록은 order_no 배열 입력) · 인덱스 · 푸시 프레임 이름(`journal.events` · `unf.progress` 가칭) · 웹 스토어 상한(`MAX_JOURNAL_ROWS` 동형).
- 펼침 타임라인 배지 문구(통보/상따) · 로딩·실패 표시 · 이벤트 0건 빈 문구.
- 진행률 보조행의 마이페이지 기본 표(종목 열 있음)·임베드 표(stockScope)·모바일 r3 문구 차이(종목·거래소 조각 유무).
- relay: 사용자 세션으로 오는 82 `StrategyEventPush` 는 무시(79/80 처럼 warn 없이) — 전략 이벤트는 관찰자 저널 경로만이 정본. 83 `QueueProgress` 는 77 `QueuedWindowState` 패턴(캐시 + isReady 때만 fanout + 인증 후 스냅 재생).
- 시간 표기: 주문로그 탭·펼침·창 분리 = `HH:MM:SS.mmm`, 오늘 주문 행 요약 시각은 현행(HH:MM:SS) 유지.

### gh-trade 예정 번호(2026-09-29 gh-trade-6d 회신 — fbs 해시로 확정, 바뀌면 append)
- C→S 39 `GetStrategyEventsReq`(사용자 세션용) · S→C 81 `StrategyEventsResp` · 82 `StrategyEventPush`(사용자 세션, isin 축 양 거래소) · 83 `QueueProgress`(슬롯 84).
- `JournalBatch` 말미 `strategy_events`/`strategy_head_seq`/`strategy_caught_up` = 슬롯 10/12/14 · `ObserverLoginReq.strategy_since_seq` = 12 · `ObserverLoginResp.strategy_head_seq/strategy_oldest_seq` = 20/22.
- 상한가 진입 판정이 퍼블리셔(전 종목)로 옮겨감 — 와이어 무영향. 두 스트림 caught_up 은 독립.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 기획서 · 와이어 계약 (Phase 25 reference/)
- `.planning/phases/25-order-log-progress/reference/spec-order-log-progress-20260929.md` — 기획서 전문(로그 7종 · 한 줄 형식 · 예시 하루 흐름 · 진행률 계산 · 경우 1/2)
- `.planning/phases/25-order-log-progress/reference/gh-radar-implications.md` — gh-radar 함의 · 옵션 B(저널 경로 재사용) · 5b 사용자 결정(두 표면 · B안)
- `.planning/phases/25-order-log-progress/reference/gh-trade-strategy-event-fields-v0.1.md` — StrategyEvent 필드 v0.1 동결 · QueueProgress 권장안 · v0.1 반영 사항
- `.planning/phases/25-order-log-progress/reference/strategy-event-fields-review.md` — relay/Supabase/웹 관점 대조(스트림 2 · 가시성 · Rejected 조인 · progress_bp)
- `.planning/phases/25-order-log-progress/reference/gh-trade-order-log-template-draft.md` — 통보 문장 템플릿 v0(gh-trade) — 통보 줄 문장의 정본
- `.planning/phases/25-order-log-progress/reference/order-log-template-review.md` — 템플릿 대조·합의 결과(A×Modify 닫힘 · running sum · C 두 갈래 · M 캡 · R -2 · D-15)
- `.planning/phases/25-order-log-progress/reference/order-log-journal-facts.md` — 오늘 주문 카드 · 저널 테이블 · 투영 규칙 · 미체결 그리드 3표면 사실 정리

### 목업 (채택안 박제 — 구현은 이 형태를 따른다)
- `.planning/phases/25-order-log-progress/reference/mockup-today-orders-expand.html` — 오늘 주문 행 펼침 채택안 1-A · 2-A · 3-A + 모바일
- `.planning/phases/25-order-log-progress/reference/mockup-order-log-tab.html` — 주문로그 탭 채택안 F-A(공통: 배지 · 필터줄 · sticky 핀 · 창 분리 · 카드 탭)
- `.planning/phases/25-order-log-progress/reference/mockup-unfilled-progress.html` — 진행률 B안(채택)
- `.planning/phases/25-order-log-progress/reference/gh-trade-winforms-progress-mockup.html` — WinForms 대응 목업(참고)

### 저널 규약 · 선행 phase
- `.planning/phases/19-account-order-journal/19-GH-TRADE-HANDOFF.md` — 관찰자 저널 규약(23 필드 대응표 · seq/epoch/멱등) — 전략 스트림은 동형
- `.planning/phases/19-account-order-journal/19-CONTEXT.md` — D-01~D-14(기록자 단일화 · 계좌 가시성 · 커서 · 배포 순서)
- `.planning/phases/24-limitchaser-buy3/24-CONTEXT.md` — 선매수/추가매수/후매수 용어 · 카드 구조 D
- `.planning/ROADMAP.md` Phase 25 블록 — 착수·배포 순서, UI 게이트, 정본 목록
- gh-trade `docs/features/order-journal.md`(외부 저장소) — 저널 규약 원문

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- relay 저널 파이프라인: `relay/src/journal/codec.ts:23-47`(79/80 분기) · `relay/src/dma/envelope.ts:2618,2674`(`parseObserverLoginResp` · `parseJournalBatch` — 새 필드는 여기서 파싱) · `relay/src/journal/observer.ts:279,317`(로그인·배치·live 전이) · `relay/src/journal/writer.ts:254,291,336-367,434-448`(커서·epoch·gap·`dma_journal_apply` 호출) — 전략 스트림은 같은 상태기계를 커서 2개로 확장.
- relay 푸시: `relay/src/ws/fanout.ts:1494-1522` `deliverJournalRows`(계좌 필터 푸시 — `journal.events` 동형) · `relay/src/hub/subscription-hub.ts:1066-1069,1187-1191` 77 `QueuedWindowState`(캐시 + isReady fanout + 인증 후 스냅 재생 `fanout.ts:~693`) — `QueueProgress` 템플릿.
- 수기 사본 3곳: `relay/src/dma/msg-type.ts:180,208-228`(MSG · INBOUND 화이트리스트) · `relay/src/dma/envelope.ts` · `relay/src/hub/subscription-hub.ts:964,1090-1091`(`#onFrame` case). 생성물 `relay/src/generated/` 는 손대지 않는다.
- server: `server/src/routes/orders.ts:43-54`(`requireAuth` → `req.userId` 만 p_user_id) · `server/src/services/dma-orders.ts:39-59`(RPC 호출 · `resolveTradeDate`) — 라우트 2개 추가 패턴.
- Supabase: `supabase/migrations/20260924200000_dma_journal_tables.sql:62-90,163-189`(PK (gateway, journal_epoch, seq) · 커서 · RLS/REVOKE 잠금) · `20260924200100_dma_journal_rpcs.sql:382,562,612-638`(apply · orders_for_user · EXECUTE REVOKE).
- webapp 오늘 주문: `webapp/src/components/trading/today-orders-card.tsx:191,455,515`(`TodayOrdersCard` · `OrderTableRow` · `OrderCardRow`) · `webapp/src/lib/orders-api.ts:67,102,149` · `webapp/src/lib/order-notices.ts:165`(`MERGE_WINDOW_MS` 묶기 키 — 펼침 order_no 배열의 원천).
- webapp 작업대: `webapp/src/components/trading/workbench/shared-panels.tsx:94,195,285-293,333`(`SharedTab` · 탭 등록 · `writePanelsPref`) · `webapp/src/lib/trading-layout.ts:120,140`(탭 화이트리스트) · `webapp/src/components/trading/card/card-tabs.tsx:203-217,249-279`(카드 탭 4개) · `webapp/src/components/trading/strategy-log.tsx:548`(줄 스타일 참고 — 건드리지 않음).
- webapp 미체결: `webapp/src/components/orderbook/account-panel.tsx:322,762-826,825-918(r3 `StatusNotes` :917),1136,1309-1340` — 3표면 한 파일. 보조행은 B안 목업 `tr.sub` / 모바일 `.r3`.
- webapp 실시간: `webapp/src/lib/use-relay-socket.ts:765-902`(`applyFrame` — `journal.rows` :804 · `queued.window` :902 패턴으로 `journal.events` · `unf.progress` 추가) · 상태 :362,391,396,516 · `packages/shared/src/relay.ts:1175,1250,1271-1290`(outbound 타입 union) · `packages/shared/src/journal.ts:112,164`.
- 라벨: `webapp/src/components/trading/lc/lc-fields.ts:132,188,250,290` · `webapp/src/lib/limit-chaser.ts:307-311` · `packages/shared/src/strategy-display.ts:59,84` · `webapp/src/components/trading/origin-tag.tsx:18-21` — group/kind/cancel_reason 표시명 표는 아직 없음 → shared 에 신설.

### Established Patterns
- 서버 진실은 클라가 판정하지 않는다(D-36 · T-17-33): 문구 파싱 금지, 상태·대기 여부 추정 금지 — D-11 이 같은 규율.
- RLS + 정책 0 + anon/authenticated 명시 REVOKE = service_role 전용, server 가 `req.userId` 만 넘기고 가시성은 SQL 조인(`dma_account_access`) 안에서.
- Cloud Run 왕복 비용: 다중 쿼리 집계는 RPC 1회로(펼침 UNION · 하루치 평면 목록).
- 펼침 패턴 없음 — `aria-expanded` 예시는 `components/home/theme-card.tsx:87,150` · `card/card-tabs.tsx:222`.
- 창 분리(pop-out) 라우트 없음 — `app/trading/vi/page.tsx` · `app/trading/limit-chaser/[key]/page.tsx` 가 페이지 골격 예시.
- 상따 화면 반응형은 뷰포트가 아니라 본문 폭 컨테이너 쿼리(`globals.css` §2.2b) — 주문로그 탭도 `@min-[700px]/wb` 밴드 규칙.

### Integration Points
- relay `index.ts:193-206` — `journalWriter.on("applied")` 옆에 전략 스트림 applied → `deliverJournalEvents`.
- 오늘 주문 카드 `me-client.tsx:297` — 펼침은 카드 내부, 라이브 이어붙임은 `use-relay-socket` 스토어에서.
- 작업대 `trading-workbench.tsx:1438-1442` — 전략 로그 entries 공급 옆에 주문로그 entries 공급(스토어에서 하루치 + 푸시).
- 미체결 `account-panel.tsx` — `RelayUnfilled` 행에 (isin, exchange, orderNo) 로 `unf.progress` 스냅을 조인.

</code_context>

<specifics>
## Specific Ideas

- 기획서 예시 하루 흐름(○○전자 12451 선매수 → 12452 추가매수 → 12453 후매수 취소 → 12454/12455 매도)이 두 목업의 데이터이자 문장 조립 기대값이다 — 테스트 픽스처로 그대로 쓴다.
- 오늘 주문 펼침 타임라인 시각 예: 「09:45:07.415 [통보] 체결 100주 @12,350 (누적 100/300)」 바로 다음 「09:45:07.415 [상따] 첫 체결 오차 +16,000 · 누적 914,000」 — 같은 ms 는 통보 → 전략 순.
- 주문로그 탭 sticky 핀 「새 로그 3 · 맨 아래로 ↓」 는 올려 보는 중에만 뜬다(맨 아래면 자동 따라감).
- 통보 줄 문장은 gh-trade 템플릿 v0 예시 형식(「매수 100주 @72,300 접수」 · 「매수 체결 40주 @72,300 (누적 40/100)」 · 「취소 확인 잔량 60주」)을 그대로.

</specifics>

<deferred>
## Deferred Ideas

- Rejected(8) 이벤트를 저널 reject_seq 와 잇기(`journal_seq` 실어 오늘 주문 거부 행 펼침에 표시) — gh-trade 후속.
- 주문로그 탭에서 날짜 선택(창 분리 페이지 외) — 필요해지면 후속.
- 기획서 각주 용어 변경(추가매수→후매수, 줄서기매수→반등매수) — 채택하지 않음. 채택 시 라벨 문자열 이름 바꾸기 quick 1건(enum 무영향).
- 종목상세 페이지에 시세 이벤트(상한가노출·진입) 노출 — 이 phase 는 두 표면만.
- 사용자 세션 82 `StrategyEventPush`/39·81 요청 경로 활용 — 관찰자 경로가 정본이라 미사용.

</deferred>

---

*Phase: 25-order-log-progress*
*Context gathered: 2026-09-29*
