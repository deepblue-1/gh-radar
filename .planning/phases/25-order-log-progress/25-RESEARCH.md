# Phase 25: 주문로그·잔량진행률 — Research

**Researched:** 2026-09-29
**Domain:** relay 관찰자 저널 2-스트림 확장 · Supabase 원문 적재/조회 RPC · server 조회 라우트 · webapp 3표면(오늘 주문 펼침 · 주문로그 탭 · 미체결 진행률)
**Confidence:** HIGH (코드베이스 사실) / MEDIUM (gh-trade 와이어 세부 — fbs 미커밋, gh-trade 25-01-PLAN 기준)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 이미 확정된 것(ROADMAP · reference · 2026-09-29 사용자 결정 — 다시 묻지 않는다)
- 와이어 필드 v0.1 동결(`reference/gh-trade-strategy-event-fields-v0.1.md`) · `gw_time_ms` 어휘 통일 · `snap_qty/snap_cum` 벡터 · JSON 키 snake_case 1:1 · `dma_user_id` 는 감사 컬럼만.
- relay: 스트림 2개(주문 저널·전략 이벤트) 각각 커서·gap·resync(`dma_journal_cursor.strategy_last_seq`), 로그인 요청에 두 since, live 전이는 두 caught_up 모두 true, `strategy_oldest_seq = 0` 은 WR-07 규칙. 새 RPC `dma_strategy_apply` 별도 트랜잭션. 새 테이블 `dma_strategy_events` PK (gateway, journal_epoch, seq), 원문 보존·투영 없음. 푸시 `journal.events`(저널 행과 같은 계좌 필터) · `QueueProgress` → `unf.progress`(가칭, (isin, exchange) 키 전량 교체, account_no 필수).
- 가시성: 주문 이벤트는 `dma_account_access` 계좌 조인, 시세 이벤트(kind 1·2, account_no 빈 값)는 그 게이트웨이 자격증명 사용자 전원. Rejected(8)는 order_no 없어 평면 목록만(reject_seq 조인은 후속).
- server/Supabase: 조회 RPC 2(하루치 평면 목록 · 주문 이벤트 목록) service_role 전용 + 명시 REVOKE(anon/authenticated) · 라우트 `GET /api/orders/:id/events` · `GET /api/strategy-events`(가칭).
- 진행률 B안 채택(`reference/mockup-unfilled-progress.html`) · 웹 계산 없음 · 90% 이상 up 색 · 첫 체결/취소 시 보조행만 삭제 · 미체결 행 사라지면 진행률도 삭제 · remaining 음수는 0 · progress_bp 만분율.
- 오늘 주문 별건 3: 방향 미상 「주문」 · result_code -2 「접수 불명」(투영 status 는 rejected 유지, 화면에서 가름) · R(New) 방향 참고 표기. 통보 문장은 gh-trade 템플릿 v0(`reference/gh-trade-order-log-template-draft.md`) + 대조·합의(`reference/order-log-template-review.md`) 그대로 — 재작성하지 않는다. 문구 파싱 금지(D-36) · 취소/정정 방향 없음 · board G2/G3 는 D-15 규칙 · 출처는 배지.
- 착수 순서: gh-trade fbs 커밋(해시 통보) → gh-trade `sync-relay-schema.sh RELAY=gh-radar` → gh-radar 생성물 + 수기 사본 3곳(msg-type · envelope · hub) 커밋. 배포 gh-trade 서버 → relay → webapp push. **fbs 전에는 서버 무관 부분(테이블/RPC 설계 · UI 골격 · 문장 조립기 · 표시명 표)만 진행.**

#### ① 오늘 주문 행 펼침 (목업 `reference/mockup-today-orders-expand.html` 로 확정)
- **D-01: 펼침 = 저널 통보(A/E/C/M/R) + 전략 이벤트를 `gw_time_ms` 순 한 타임라인(1-A).** 줄마다 출처 배지(통보/상따). 접수 → 대기(체결예상) → 체결 조각(seq 순 running sum, 전량 판정 filled+modified≥qty) → 첫 체결 오차 → 취소 확인 → 취소 사유(남은 거래량) 순으로 한 줄기. 수동 주문 행은 통보만. 주문 1건 이벤트 조회 RPC 는 `dma_journal_events` + `dma_strategy_events` 를 UNION 해 공개 컬럼만 반환(왕복 1회).
- **D-02: 3초 창으로 묶인 행(자동 매도 조각 등)은 묶음 전체 이벤트를 한 타임라인에(2-A).** RPC 가 order_no 배열을 받는다. 줄마다 `#주문번호` 꼬리. 클릭 1회 = RPC 1회.
- **D-03: 펼쳐 둔 행은 푸시로 라이브 이어붙임.** 펼칠 때 RPC 1회 복원, 이후 `journal.events` 푸시를 같은 (gateway, trade_date, account_no, order_no) 에 이어붙인다. 통보 조각은 이벤트 푸시가 없으므로 `journal.rows` 의 그 행 lastSeq 가 오르면 재조회 1회.
- **D-04: 트리거 = 행 전체 클릭(3-A), 여러 행 동시 펼침, 모바일 2줄 카드 행도 동일.** 시각 앞 ▸ 표식 회전, 열린 행은 옅은 primary 배경(`color-mix(primary 6%)`). 펼침 상태는 메모리만(새로고침 시 닫힘). 펼침 본문은 왼쪽 세로선 타임라인(시각 ms · 배지 · 문장), 모바일은 시각 폭 78px + 줄바꿈 허용.

#### ② 작업대 「주문로그」 탭 (목업 `reference/mockup-order-log-tab.html` 로 확정)
- **D-05: 한 줄 형태 = 기획서 형식 그대로(F-A).** `[시간 ms][주문번호][구분] 거래소 | 종목 | 내용 | 누적 N`. 시세 로그는 주문번호 칸 없음. 좁으면 끝 잘림(…) + 툴팁으로 전체. 구분 색: 매수 up · 매도 down · 시세 accent. 새로 도착한 줄은 옅은 강조.
- **D-06: 표면 = 공용 패널 + 종목 카드 탭 둘 다.** 카드 탭은 그 종목만(종목 필터 없음, 거래소·구분만). 탭 이름 「주문로그」, 기존 「전략 로그」 탭은 그대로 남긴다(`SharedTab` 에 값 추가 + `trading-layout.ts` 탭 화이트리스트 동기).
- **D-07: 조회 범위 = 탭은 오늘만.** 마운트 시 하루치 RPC 1회 + 푸시 이어붙임. 과거일은 **창 분리 페이지에서만 날짜 선택**(오늘 이전 거래일 이동). DB 보관은 무기한.
- **D-08: 구분 필터 값 = 전체 · 선매수 · 추가매수 · 후매수 · 매도(호가·체결·훅 합침) · 시세(노출·진입).** group 축 기준, kind 필터는 두지 않는다. 거래소 필터 = 전체/KRX/NXT. 종목 필터 = 그날 이벤트가 있는 종목 목록.
- 공통(풀안, 재량 세부는 아래): 탭줄 새 로그 배지(카운트) · 「새 로그 N · 맨 아래로 ↓」 sticky 핀 · 창 분리 ↗ 버튼 → 별도 라우트 새 창(필터 상태를 쿼리로 전달, 창에는 배지 없음·스크롤 고정만).

#### ③ 로그 문장 조립 규칙
- **D-09: 조립기는 하나(shared), 두 표면이 같은 본문을 쓴다.** 주문로그 탭 = `거래소 | 종목 | 본문 | 누적`, 오늘 주문 펼침 = 행에 이미 있는 거래소·종목·주문번호를 뺀 `본문 · 누적`. 웹이 v0.1 필드로 문장을 만든다(서버 문장 없음). 기획서 예시 형식(조건 설정/실측 · 근거 틱 · 상한가 매수잔량 · 가격×수량 · 접수 +ms · 체결예상 (기준 + 앞 물량) · 오차 부호 · 남은 거래량 (예상 − 누적))을 따른다.
- **D-10: 서버 코드는 표시명만, 원문 코드는 숨긴다.** `cancel_reason` → 수동 취소 · 이탈 매도 · 매수1 이탈 · VI 감시 · 거래소 취소 · 마감 정리(가칭, 최종 문구는 표시명 표). `cond_metric` + `reason_code` 연산자 → 「매도잔량≤50,000」 처럼 지표명+연산자+값. `group`/`kind` 표시명은 기존 웹 라벨(선매수/추가매수/후매수, 호가매도/체결매도/체결훅). 모르는 enum 값은 원문 그대로 노출(숨기지 않음). 표시명 표는 `@gh-radar/shared` 한 곳.
- 기타 표기는 기획서 세부 규칙 그대로(재량): 시초 상한가 · 상한가진입 「N차」 + 스냅 3회(3초 전 이탈이면 있는 것만 + 꼬리) · 즉시체결 N주(나머지만 대기) · 거부는 주문번호 「-」 · 남은 거래량은 has_remaining 일 때만.

#### ④ 진행률 경계 상태
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

#### gh-trade 예정 번호(2026-09-29 gh-trade-6d 회신 — fbs 해시로 확정, 바뀌면 append)
- C→S 39 `GetStrategyEventsReq`(사용자 세션용) · S→C 81 `StrategyEventsResp` · 82 `StrategyEventPush`(사용자 세션, isin 축 양 거래소) · 83 `QueueProgress`(슬롯 84).
- `JournalBatch` 말미 `strategy_events`/`strategy_head_seq`/`strategy_caught_up` = 슬롯 10/12/14 · `ObserverLoginReq.strategy_since_seq` = 12 · `ObserverLoginResp.strategy_head_seq/strategy_oldest_seq` = 20/22.
- 상한가 진입 판정이 퍼블리셔(전 종목)로 옮겨감 — 와이어 무영향. 두 스트림 caught_up 은 독립.

### Deferred Ideas (OUT OF SCOPE)
- Rejected(8) 이벤트를 저널 reject_seq 와 잇기(`journal_seq` 실어 오늘 주문 거부 행 펼침에 표시) — gh-trade 후속.
- 주문로그 탭에서 날짜 선택(창 분리 페이지 외) — 필요해지면 후속.
- 기획서 각주 용어 변경(추가매수→후매수, 줄서기매수→반등매수) — 채택하지 않음. 채택 시 라벨 문자열 이름 바꾸기 quick 1건(enum 무영향).
- 종목상세 페이지에 시세 이벤트(상한가노출·진입) 노출 — 이 phase 는 두 표면만.
- 사용자 세션 82 `StrategyEventPush`/39·81 요청 경로 활용 — 관찰자 경로가 정본이라 미사용.
</user_constraints>

<phase_requirements>
## Phase Requirements

REQUIREMENTS.md 에 이 phase 로 매핑된 요구 ID 는 없다(ROADMAP `**Requirements**: TBD` [VERIFIED: .planning/ROADMAP.md Phase 25 블록]). 계획의 추적 단위는 CONTEXT 의 D-01~D-13 + 「이미 확정된 것」 목록이다. 아래 표는 결정 → 연구 근거 매핑이다.

| ID | 설명 | 연구 근거(이 문서) |
|----|------|------------------|
| 확정-relay | 두 스트림 커서·gap·resync·live 전이 | Pattern 1 · 2, Pitfall 1~4 |
| 확정-DB | `dma_strategy_events` · `dma_strategy_apply` · 조회 RPC 2 | Pattern 4, Code Example 1~3 |
| 확정-server | 라우트 2 | Pattern 5 |
| D-01~D-04 | 오늘 주문 펼침 | Pattern 6, Pitfall 9 · 10 |
| D-05~D-08 | 주문로그 탭 · 창 분리 | Pattern 7, Pitfall 11 · 12 |
| D-09 · D-10 | 문장 조립기 · 표시명 표 | Pattern 8, Code Example 4 |
| D-11~D-13 · B안 | 진행률 | Pattern 3 · 9, Pitfall 5 · 6 |
| 별건 3 | 오늘 주문 개선 | Pattern 6 끝 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **GSD 워크플로우 필수** — 파일 변경은 GSD 명령(`/gsd-execute-phase` 등) 안에서만 [VERIFIED: ./CLAUDE.md 「GSD Workflow Enforcement」].
- **커밋 규칙(사용자 글로벌):** 커밋 메시지 한글, 커밋 전 메시지 제시 후 사용자 확인, **Co-Authored-By 넣지 않기**, 커밋 후 push [VERIFIED: ~/.claude/CLAUDE.md]. → 이 연구 문서는 커밋하지 않았다(오케스트레이터/사용자 확인 몫).
- **배포 순서:** relay 먼저·push 나중(push 자체가 webapp 프로덕션 배포) · 서브에이전트는 배포 금지(메인 세션 몫) [VERIFIED: MEMORY feedback_deploy_relay_before_push · feedback_subagent_deploy_classifier].
- **상따 화면 반응형은 본문 폭 컨테이너 쿼리** — 밴드 정본은 `webapp/src/styles/globals.css` §2.2b, 표를 복사하지 말 것 [VERIFIED: ./CLAUDE.md Conventions].
- **UI 는 HTML 목업 먼저 · 목업 검토 게이트 후 커밋** — 이 phase 의 목업 3종은 채택 완료(CONTEXT) [VERIFIED: 25-CONTEXT.md].
- **Supabase RPC 는 anon/authenticated 명시 REVOKE** · 새 테이블 RLS 정책은 `TO anon, authenticated` 둘 다(공개 테이블일 때) — 이 phase 테이블은 정책 0개(서비스롤 전용)라 두 번째 규칙은 「정책을 만들지 않는다」로 적용 [VERIFIED: MEMORY feedback_supabase_rpc_revoke · feedback_supabase_rls_authenticated · 20260924200000:170-189].
- **Cloud Run 왕복 비용:** 다중 쿼리 집계는 RPC 1회로 [VERIFIED: MEMORY project_cloudrun_egress_roundtrip_cost].
- **무로그 fail-safe 금지** — catch 는 사유 로깅 [VERIFIED: MEMORY feedback_silent_failure_max_tokens]; relay 규율 S-5 「조용한 return 금지」 [VERIFIED: relay/src/journal/observer.ts:31].
- **dev 포트 3100** (e2e baseURL) [VERIFIED: MEMORY feedback_check_dev_sh_first · webapp/playwright.config.ts:109-133].
- **gh-trade 스키마 동기화:** 생성 스크립트 gh-trade 소유, `RELAY=` 지정, flatc 25.12.19 고정, 수기 사본 3곳 자동 갱신 안 됨 [VERIFIED: MEMORY reference_gh_trade_protocol_sync].
- **법적 5원칙**(크롤링)은 이 phase 와 무관 — 새 외부 호출 없음.

## Summary

이 phase 의 서버측 뼈대는 이미 Phase 19 가 깔았다. relay 는 게이트웨이당 관찰자 파이프라인(`JournalWriter` · `JournalAccess` · `JournalObserver` · `JournalStatus`)을 한 벌씩 만들고(`relay/src/index.ts:107-137`), 와이어 해석은 `JournalCodec` 주입 지점 하나 뒤에 숨겨 두었다(`relay/src/journal/codec.ts:8-10`, `types.ts:102-106`). 관찰자 상태기계 테스트는 이미 `FakeCodec` 으로 와이어 없이 돈다(`relay/tests/journal-observer.test.ts:68-79`). 따라서 **두 번째 스트림(전략 이벤트)의 상태기계·기록기·DB·푸시·웹 전부를 fbs 커밋 전에 도메인 타입 기준으로 만들고 테스트할 수 있고**, fbs 뒤에 막히는 것은 `envelope.ts` 파서/빌더 3개 + 신규 파서 1개 + `msg-type.ts` · hub `case` · 테스트 프레임 빌더(`relay/tests/helpers/frames.ts`)뿐이다.

가장 중요한 발견 세 가지. ① 관찰자는 지금 **단일 스트림**이다 — `beginEpoch`/`push`/`caughtUp` 이 하나씩이라(`observer.ts:279-339`) 전략 스트림을 끼우려면 상태기계를 스트림별 「대기(pending)」 플래그 2개로 바꿔야 한다. v0.1 필드표에는 없지만 gh-trade 25-01-PLAN 은 `ObserverLoginResp.strategy_resync`(슬롯 24)를 **말미 추가**로 계획한다 — 이 필드가 없으면 전략 since 가 보관 범위 밖일 때 relay 가 갭 → 재접속 → 같은 갭을 끝없이 도는 루프에 빠진다(Pitfall 1). ② `QueueProgress`(83)는 관찰자 소켓이 아니라 **사용자 세션**으로 온다(gh-trade D-19: 「계좌를 선언한 세션 + 그 종목을 시세 구독한 세션」). 그래서 hub 가 **세션 허용 계좌로 항목을 걸러야** 하고, 82 `StrategyEventPush` 도 시세 구독 세션에 Notice 로 쏟아지므로 화이트리스트 밖(`OUT_OF_SCOPE`)으로 조용히 떨궈야 한다(Pitfall 5 · 7). ③ 커서 테이블은 epoch 가 한 칸이다(`20260924200000:163-168`). 두 RPC 가 별도 트랜잭션으로 같은 행을 고치면 epoch 교체 시점에 전략 커서가 옛 epoch 값을 새 epoch 로 오인할 수 있어, `strategy_last_seq` 옆에 **`strategy_journal_epoch` 칸을 함께 두는 것**을 권한다(Pitfall 3).

웹은 새 라이브러리가 필요 없다. 오늘 주문 카드는 묶음 결과(`MergedOrderNotice`)가 구성원 행을 보관하지 않아(`order-notices.ts:139-163`) 펼침 RPC 에 넘길 order_no 배열을 만들 수 없으므로 `members` 를 더해야 한다. 공용 패널 본문은 ≥700 밴드에서 스크롤 컨테이너가 아니어서(`shared-panels.tsx:316` `@min-[700px]/wb:max-h-none`) 「맨 아래일 때만 따라감」과 sticky 핀은 **로그 목록 자체의 고정 높이 스크롤러** 안에서만 성립한다(Pitfall 11). 탭 값은 세 곳(`SharedTab` · `SharedPanelTab` · `readPanelsPref` 화이트리스트)이 따로 정의돼 있어 셋 다 고쳐야 저장된 탭이 복원된다(Pitfall 12).

**Primary recommendation:** 「도메인 타입 먼저, 와이어 나중」 으로 자른다 — Wave 0~2 는 DB 마이그레이션+pgTAP · shared 타입/표시명/문장 조립기 · relay 두 스트림 상태기계/전략 기록기/푸시(FakeCodec 테스트) · server 라우트 · 웹 3표면을 fbs 없이 끝내고, fbs 해시가 오면 한 커밋(생성물 + msg-type + envelope + hub + frames.ts)으로 와이어를 붙인 뒤 fake-gateway 통합·e2e 를 돈다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 전략 이벤트 생산·seq 부여·보관 | gh-trade 게이트웨이 | — | 서버 진실(D-36). gh-radar 몫 아님 |
| 두 스트림 수신·커서·gap·resync | relay (관찰자) | Database (커서) | 기존 `JournalObserver`/`JournalWriter` 동형 |
| 원문 멱등 적재 + 커서 전진 | Database (`dma_strategy_apply`) | relay (호출) | 「PK 삽입 성공 = 1회 적용」 이 한 트랜잭션에서만 성립(D-12 Phase 19) |
| 계좌 가시성 판정(조회) | Database (조회 RPC 조인) | API (userId 만 전달) | `dma_journal_orders_for_user` 와 같은 규칙(D-06) |
| 계좌 가시성 판정(푸시) | relay (fanout `accountsOf`) | — | `deliverJournalRows` 동형(T-19-02) |
| 진행률 값 계산 | gh-trade (QueueProgress) | — | 웹 계산 금지(CONTEXT) |
| 진행률 계좌 필터·캐시·재생 | relay (hub + fanout) | — | 77 패턴 + 세션 허용 계좌 필터 |
| 하루치/주문별 조회 | API (server 라우트) | Database (RPC 1회) | Cloud Run 왕복 1회 |
| 문장 조립·표시명 | Browser (shared 순수 함수) | — | D-09/D-10, 서버 문장 없음 |
| 펼침·탭·필터·배지·스크롤 고정·창 분리 | Browser | — | 순수 UI 상태(메모리) |

## Standard Stack

### Core (전부 기존 — 새 설치 없음)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| flatbuffers (TS) | ^25.9.23 | relay 와이어 파싱 | 기존 relay 의존성 [VERIFIED: relay/package.json] |
| flatc | 25.12.19 (고정) | 생성물(gh-trade 스크립트가 실행) | [VERIFIED: `flatc --version` → `flatc version 25.12.19`] |
| @supabase/supabase-js | ^2.103.0 | relay/server RPC 호출 | 기존 [VERIFIED: relay/package.json] |
| zod | ^4.0.0 (relay) | 쿼리 검증 | server `schemas/orders.ts` 패턴 [VERIFIED: server/src/schemas/orders.ts] |
| vitest | ^4.1.4 (relay/server/shared) · ^2.1.9 (webapp) | 단위 테스트 | 기존 [VERIFIED: package.json 들] |
| @playwright/test + @axe-core/playwright | ^1.59.1 · ^4.11.1 | e2e · a11y | 기존 [VERIFIED: webapp/package.json] |
| pgTAP (로컬 Postgres 17 컨테이너) | supabase/postgres 17.6.1.104 | DB 회귀 | `scripts/verify-dma-orders-price-check.sh --test` [VERIFIED: 스크립트 헤더] |
| `Intl.DateTimeFormat` `fractionalSecondDigits:3` | Node 22 ICU / 모던 브라우저 | `HH:MM:SS.mmm` KST | [VERIFIED: node 실측 → `"09:45:02.861"`] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 로그 목록 수동 스크롤 고정 훅 | 가상 스크롤 라이브러리(react-virtuoso 등) | 하루치 수백~2천 줄이라 불필요. 의존성 추가 금지(Simplicity First) |
| 필터 드롭다운 native `<select>` | shadcn Select 신설 | `components/ui` 에 select 가 없다 [VERIFIED: ls webapp/src/components/ui]. native select 가 a11y·모바일에 무비용. UI-SPEC 에서 확정 |
| 툴팁 `title` 속성 | `ui/tooltip.tsx` | 코드베이스 잘림 셀 관례는 `title=` (`account-panel.tsx` `account-embed-name`) |

**Installation:** 없음.

## Package Legitimacy Audit

이 phase 는 외부 패키지를 설치하지 않는다(위 표 전부 기존 의존성). 감사 대상 0건.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
gh-trade 게이트웨이 (관찰자 소켓 · 요청 연결에만 Notice)
  ├─ 79 ObserverLoginResp {epoch, head/oldest/resync, strategy_head/oldest/resync*}
  └─ 80 JournalBatch {records[], head, caught_up, strategy_events[], strategy_head, strategy_caught_up}
          │
          ▼
relay JournalObserver (동기 수신 · D-32)
  ├─ codec.decode → login | batch
  ├─ login: access.replace → journalWriter.beginEpoch(epoch, resync, head)
  │                        → strategyWriter.beginEpoch(epoch, strategy_resync, strategy_head)
  │         pendingJ = !(resync∧oldest0) ∧ head>recvJ ; pendingS = !(sResync∧sOldest0) ∧ sHead>recvS
  │         state = (pendingJ ∨ pendingS) ? replaying : live
  └─ batch: journalWriter.push(records) ─gap/overflow→ dropTransport ─┐
            strategyWriter.push(events) ─gap/overflow→ dropTransport ─┤ (재로그인: since 2개)
            caught_up→pendingJ=false · strategy_caught_up→pendingS=false │
            둘 다 false → live ◄────────────────────────────────────────┘
          │                                  │
   (직렬 워커 A)                        (직렬 워커 B · 별도 트랜잭션)
   dma_journal_apply                    dma_strategy_apply
   → rows(주문 투영)                    → events(삽입된 원문 공개 컬럼)
          │                                  │
   fanout.deliverJournalRows          fanout.deliverStrategyEvents
   (accountsOf 계좌 필터)             (주문 이벤트: accountsOf 필터 · 시세 이벤트 kind1·2: 그 게이트웨이 매핑 보유 사용자 전원)
          │                                  │
          ▼ {t:"journal.rows"}               ▼ {t:"journal.events"}

gh-trade 사용자 세션(사용자별 DmaSession · 주 게이트웨이만)
  ├─ 83 QueueProgress {isin, exchange, items[account_no, dma_user_id, order_no, group, expected/current/remaining, progress_bp]}
  │     → hub: session.allowedAccounts 로 항목 필터 · dma_user_id 제거 · (userId,isin,exchange) 캐시 전량 교체
  │     → isReady 일 때만 {t:"unf.progress", snap:false, i, x, items} · 인증 직후 {snap:true, entries[]} 재생
  └─ 81/82 StrategyEvents* → OUT_OF_SCOPE 화이트리스트 밖 debug 드롭(관찰자 경로가 정본)

webapp (RelayProvider 전역 1연결 · 창 분리 창도 자기 연결)
  ├─ 스토어: journalRows · strategyEvents(key=gateway|epoch|seq, 상한) · queueProgress(Map isin|x → items)
  ├─ 오늘 주문 카드: 행 클릭 → GET /api/orders/events?… (RPC 1회) → 통보+전략 타임라인
  │     + journal.events 이어붙임 · journal.rows lastSeq 상승 시 재조회(디바운스)
  ├─ 작업대 주문로그 탭(공용 패널/카드) · /trading/order-log 창: GET /api/strategy-events?date → + journal.events
  └─ 미체결 3표면: RelayUnfilled × queueProgress(accountNo, orderNo) → B안 보조행 / 모바일 r3

server (Cloud Run): requireAuth → req.userId → RPC 1회 (service_role)
Supabase: dma_strategy_events · dma_journal_cursor(+strategy 칸) · RPC 3(apply · 하루치 · 주문별)
```

### Recommended Project Structure (신규/변경 파일)
```
supabase/migrations/
  2026093xxxxxxx_dma_strategy_events.sql        # 테이블 + 커서 칸 + 잠금
  2026093xxxxxxx_dma_strategy_rpcs.sql          # apply · 하루치 · 주문별 + EXECUTE REVOKE
supabase/tests/
  dma_strategy_apply.test.sql                   # 멱등 · 커서 · 가시성 · REVOKE (pgTAP)
packages/shared/src/
  strategy-event.ts        # StrategyEventDbRow/Row · toStrategyEventRow · PUBLIC_COLUMNS · QueueProgressItem
  strategy-event-labels.ts # kind/group/cancel_reason/cond_metric 표시명 표 (D-10)
  strategy-event-text.ts   # 문장 조립기 (D-09) · formatKstMs
  relay.ts                 # RelayJournalEventsMsg · RelayUnfProgressMsg → RelayOutbound
relay/src/journal/
  types.ts                 # StrategyEventRecord · ObserverLoginResult/JournalBatchFrame strategy 필드
  writer.ts                # 스트림 서술자 주입(jour/strategy) — 또는 strategy-writer.ts
  observer.ts              # pending 플래그 2개 · since 2개
  codec.ts                 # (fbs 뒤) 변경 없음 또는 83 ignore
relay/src/dma/{msg-type,envelope}.ts            # (fbs 뒤) 수기 사본
relay/src/hub/subscription-hub.ts               # (fbs 뒤) case 83 · 캐시 · #clearCaches
relay/src/ws/fanout.ts                          # deliverStrategyEvents · 인증 직후 unf.progress 스냅
relay/src/index.ts                              # strategyWriter 결선(게이트웨이마다)
server/src/routes/orders.ts (+ strategy-events 라우터) · services/dma-orders.ts · schemas/orders.ts
webapp/src/lib/  strategy-events-api.ts · order-log-feed.ts(병합·필터) · use-stick-to-bottom.ts · queue-progress.ts
webapp/src/components/trading/
  order-log/order-log-list.tsx · order-log-filters.tsx · order-log-panel.tsx
  today-orders-card.tsx (펼침) · order-timeline.tsx
webapp/src/components/orderbook/account-panel.tsx (B안 보조행 · r3)
webapp/src/app/trading/order-log/page.tsx       # 창 분리 라우트
```

### Pattern 1: 두 스트림 관찰자 — 「스트림별 pending 플래그」 상태기계
**What:** 로그인 응답에서 스트림마다 「재생할 것이 남았나」 를 따로 판정하고, 배치의 caught_up 두 개가 각각 자기 플래그만 내린다. 둘 다 내려가면 live.
**When to use:** `#onLogin` · `#onBatch` 교체.
**근거:** 지금 로그인 판정은 한 줄이다 — `const nothingToReplay = result.resync && result.oldestSeq === 0; this.#setState(!nothingToReplay && result.headSeq > received ? "replaying" : "live");` [VERIFIED: relay/src/journal/observer.ts:313-314]. 배치는 `if (batch.caughtUp) this.#setState("live");` [VERIFIED: observer.ts:338]. gh-trade 는 스트림별 caught_up 을 「그 스트림의 next−1 == head(0건이면 next > head)」 로 계산하고, 둘 다 0건이면 프레임을 보내지 않는다 [CITED: gh-trade worktree phase-25 `25-01-PLAN.md` `ObserverPump` 절 — fbs 미커밋].
```typescript
// observer.ts (의사코드 — 도메인 타입만 사용, fbs 무관)
#pendingJ = false; #pendingS = false;
#onLogin(r: ObserverLoginResult) {
  // … 기존 access.replace
  this.#deps.writer.beginEpoch(r.epoch, { resync: r.resync, headSeq: r.headSeq });
  this.#deps.strategyWriter?.beginEpoch(r.epoch, { resync: r.strategyResync, headSeq: r.strategyHeadSeq });
  const recvJ = this.#deps.writer.lastReceivedSeq ?? 0;
  const recvS = this.#deps.strategyWriter?.lastReceivedSeq ?? 0;
  this.#pendingJ = !(r.resync && r.oldestSeq === 0) && r.headSeq > recvJ;          // WR-07 그대로
  this.#pendingS = this.#deps.strategyWriter !== undefined
    && !(r.strategyResync && r.strategyOldestSeq === 0) && r.strategyHeadSeq > recvS; // WR-07 동형
  this.#setState(this.#pendingJ || this.#pendingS ? "replaying" : "live");
}
#onBatch(b: JournalBatchFrame) {
  // 순서: 주문 먼저 push → gap/overflow 면 즉시 drop(전략분은 버리고 since 로 재수신)
  const rj = this.#deps.writer.push(b.records);
  if (rj !== "ok") return this.#dropTransport(rj === "gap" ? "저널 seq 갭" : "저널 큐 상한");
  const rs = this.#deps.strategyWriter?.push(b.strategyEvents) ?? "ok";
  if (rs !== "ok") return this.#dropTransport(rs === "gap" ? "전략 seq 갭" : "전략 큐 상한");
  if (b.caughtUp) this.#pendingJ = false;
  if (b.strategyCaughtUp) this.#pendingS = false;
  if (!this.#pendingJ && !this.#pendingS) this.#setState("live");
}
```
- 로그인 요청은 since 두 개: `sinceSeq = writer.lastReceivedSeq ?? 0`(현행 :226) 옆에 `strategySinceSeq = strategyWriter.lastReceivedSeq ?? 0` 을 `codec.buildLoginReq` 입력에 더한다(`JournalCodec.buildLoginReq(input: {secret, sinceSeq, epoch, client})` [VERIFIED: types.ts:104] 확장).
- **구 서버 내성:** fbs 필드가 없는 게이트웨이에서는 strategy 값이 전부 0/false 로 읽힌다 → `strategyHeadSeq(0) > recvS` 가 거짓이라 pendingS=false 로 시작하고, 배치의 `strategyCaughtUp=false` 는 이미 false 인 플래그를 건드리지 않는다. 따라서 **pending 플래그 설계는 서버 배포 순서가 어긋나도 live 를 막지 않는다** — 「두 caught_up 모두 true 를 매 배치 요구」 로 짜면 구 서버에서 영원히 replaying → 장중 180초 뒤 `/healthz` 503 거짓 알림이 난다(`JOURNAL_ALERT_AFTER_MS = 180_000` [VERIFIED: relay/src/journal/status.ts:39]).

### Pattern 2: 전략 기록기 = 기존 `JournalWriter` 에 「스트림 서술자」 주입
**What:** 큐·직렬 워커·재시도·갭·epoch·seq 역행 규칙(527줄)을 복제하지 않고, 스트림마다 다른 4가지만 주입한다: RPC 이름, 커서 칸 이름, 레코드 → RPC 입력 매퍼, 반환 → `applied` 페이로드 매퍼.
**근거:** 기록기의 스트림 고유 지점은 정확히 네 곳이다 — `readCursor` 의 `.from("dma_journal_cursor").select("journal_epoch, last_seq")` [VERIFIED: writer.ts:255-259], `rpc("dma_journal_apply", {p_gateway, p_epoch, p_events: batch.map(toApplyEvent)})` [VERIFIED: writer.ts:448-452], `result.rows.map(toJournalOrderRow)` [VERIFIED: writer.ts:512], `isApplyResult` [VERIFIED: writer.ts:523-527]. 나머지(`push` 갭 판정 :322-370, `beginEpoch` 역행 규칙 :291-312, 재시도 :472-496)는 스트림 무관이다.
**권장:** 제네릭 `JournalWriter<R, Out>` 에 `stream?: {rpc, cursorEpochCol, cursorSeqCol, toApply, toOut, isResult}` 를 넣고 기본값 = 현 저널(기존 테스트 무변경). 로그 문맥에 `stream: "journal" | "strategy"` 를 싣는다(두 기록기 로그가 섞이면 운영 판독 불가).
- 전략 기록기 `applied` 페이로드 = `StrategyEventRow[]`(삽입된 것만). 재생 중복은 RPC 가 건너뛰므로 푸시가 중복되지 않는다.

### Pattern 3: `QueueProgress` — 77 패턴 + 세션 계좌 필터
**What:** hub 가 83 을 받으면 ① 세션 허용 계좌로 항목 필터 ② `dma_user_id` 제거 ③ `(userId, isin, exchange)` 캐시 전량 교체 ④ `session.isReady` 일 때만 팬아웃 ⑤ 인증 직후 스냅샷 재생.
**근거:** 77 은 `this.#queuedWindows.set(userId, state); if (!session.isReady) return; this.#fanout(userId, state);` [VERIFIED: subscription-hub.ts:1187-1191], 인증 직후 `const queuedWindow = this.#hub.getQueuedWindow(userId); if (queuedWindow !== undefined) this.#send(conn, queuedWindow);` [VERIFIED: fanout.ts:693-694], 세션 교체 시 `this.#queuedWindows.delete(userId);` [VERIFIED: subscription-hub.ts:1681]. 팬아웃은 언제나 userId 하나 [VERIFIED: subscription-hub.ts:1638-1641].
- **계좌 필터 원천:** gh-trade 는 83 을 「그 계좌를 선언한 세션 + 그 종목을 시세 구독한 세션」에 보낸다 [CITED: gh-trade phase-25 `25-CONTEXT.md` D-19]. 시세 구독만 한 세션도 **남의 계좌 항목**을 받으므로 relay 가 반드시 거른다. `HubSession` 에는 계좌 목록이 없다(`userId`·`isReady`·`send`·`on` 뿐 [VERIFIED: subscription-hub.ts:143-152]); `DmaSession.allowedAccounts` 가 있다 [VERIFIED: relay/src/dma/session.ts:200-202 cat]. → `HubSession` 에 `readonly allowedAccounts: RelayAccount[]` 를 더하고(테스트 스텁 갱신) 필터에 쓴다.
- **팬아웃 억제:** 1초 × (종목·거래소) 마다 오는 스냅샷 중 **이 사용자 몫이 비어 있고 캐시도 비어 있으면 보내지 않는다.** 비어 있지 않거나, 비어 있지 않던 것이 비게 된 전이(삭제 신호)일 때만 보낸다.
- **프레임:** 라이브 `{t:"unf.progress", snap:false, i, x, items}` · 인증 직후 `{t:"unf.progress", snap:true, entries:[{i,x,items}]}`(빈 배열도 1프레임 — 「진행 중 대기 없음」 확정 정보, `rate.cross.snap` 규율 [VERIFIED: fanout.ts:683-692]). 웹은 snap:true 면 Map 전량 교체, false 면 키 교체.
- **캐시 정리:** `#clearCaches` 에 진행률 맵 prefix 삭제를 반드시 더한다(Pitfall 6).

### Pattern 4: DB — 원문 테이블 + 별도 트랜잭션 apply + 조회 RPC 2
**What:** `dma_journal_events` 를 본뜬 원문 테이블, 투영 없음, 포이즌 격리 불필요(투영이 없으므로 필수 키 형식 위반만 배치 실패).
- 테이블 잠금 4줄: `ENABLE ROW LEVEL SECURITY` · `REVOKE ALL … FROM PUBLIC` · `REVOKE ALL … FROM anon, authenticated` · `GRANT SELECT, INSERT, UPDATE, DELETE … TO service_role` [VERIFIED: 20260924200000_dma_journal_tables.sql:171-174]. 정책(POLICY) 0개 [VERIFIED: 같은 파일 :50-51].
- 함수: `SECURITY INVOKER` · `SET search_path = public, pg_temp` [VERIFIED: 20260924200100:386-387]; 권한은 시그니처 정확히 3줄 `REVOKE EXECUTE … FROM PUBLIC;` `REVOKE EXECUTE … FROM anon, authenticated;` `GRANT EXECUTE … TO service_role;` [VERIFIED: 20260924200100:628-630].
- 적재 멱등: `INSERT … ON CONFLICT DO NOTHING; IF NOT FOUND THEN v_skipped := v_skipped + 1; CONTINUE;` [VERIFIED: 20260924200100:447-453]. 전략 apply 는 `RETURNING` 으로 삽입분만 모아 반환.
- 잠금 키: 저널은 `pg_advisory_xact_lock(hashtext('dma_journal:' || p_gateway))` [VERIFIED: 20260924200100:409]. 전략은 **다른 키**(`'dma_strategy:' || p_gateway`)로 — 두 스트림 적용이 서로를 기다리지 않게. 커서 행은 같은 행이라 행 잠금으로 짧게 직렬화될 뿐이다.
- 커서: 현 `dma_journal_cursor` 는 `gateway PK · journal_epoch NOT NULL · last_seq NOT NULL CHECK (last_seq >= 0)` [VERIFIED: 20260924200000:163-168]. 저널 apply 의 upsert 는 `journal_epoch, last_seq, updated_at` 만 SET 한다 [VERIFIED: 20260924200100:470-479] → 새 칸을 건드리지 않으므로 안전. 전략 apply 는 `strategy_journal_epoch`·`strategy_last_seq` 만 SET(행이 없으면 `journal_epoch = p_epoch, last_seq = 0` 으로 INSERT — 저널 since 0 은 「보관분 처음부터」 라 PK 가 흡수, 안전).
- 인덱스(권장): `(trade_date, gateway, account_no)` — 하루치 목록; `(gateway, trade_date, account_no, order_no) WHERE order_no <> ''` — 펼침 조인 [ASSUMED 크기 근거: 하루 수백~2천 행].
- 시각: **`gw_time_ms bigint` 원문 칸을 따로 둔다**(원문 보존 원칙 + ms 정렬 정확성). 표시용 `gw_time timestamptz` 도 둘 수 있으나 정렬·반환은 `gw_time_ms`.

### Pattern 5: server 라우트 — `requireAuth → req.userId → RPC 1회`
**근거:** `ordersRouter.get("/", requireAuth(), async (req, res, next) => { … OrderListQuery.safeParse(req.query) … listTodayOrders(supabase, req.userId!, parsed.data.date) … res.json(data) } catch (e) { next(e) }` [VERIFIED: server/src/routes/orders.ts:43-62 cat]. `resolveTradeDate` 는 형식은 맞지만 날짜가 아닌 값을 400 으로 막는다(`resolveTradeDate` :59 [VERIFIED: server/src/services/dma-orders.ts cat]). 라우터 마운트 `app.use("/api/orders", ordersRouter)` [VERIFIED: server/src/app.ts:96].
- `GET /api/strategy-events?date=YYYY-MM-DD` → `dma_strategy_events_for_user(p_user_id, p_trade_date)` · bare array.
- 주문별: CONTEXT 가칭은 `GET /api/orders/:id/events` 다. D-02(묶음 = order_no 배열)와 맞추려면 **`GET /api/orders/events?account=…&orderNos=a,b,c&date=…`** 형태가 자연스럽다(`:id` 한 개로는 묶음을 못 싣는다). 둘 중 하나로 확정할 것 — 권장은 쿼리형(Open Question 2). **주의:** Express 에서 `/events` 정적 경로를 `/:id/events` 보다 **먼저** 등록하지 않으면 `events` 가 `:id` 로 잡힌다.
- zod: `orderNos` 최대 개수(예: 100) · 각 1~20자 · account 1~12자(`OrderPostBody.accountNo` 길이 규칙 [VERIFIED: schemas/orders.ts cat]).

### Pattern 6: 오늘 주문 펼침
- **묶음 구성원 보존:** `MergedOrderNotice` 는 `head · count · qty · priceMin · priceMax · at · orderNoText` 만 가진다 [VERIFIED: order-notices.ts:139-163] → `members: JournalOrderRow[]` 를 더한다(`absorb` 에서 push). 펼침 RPC 입력 = `members.map(r => r.orderNo).filter(nonNull)` + `head.accountNo` + `head.tradeDate`.
- **묶기는 계좌별로 이미 나뉜다** — `groupJournalRowsByAccount(rows, accounts).map(group => ({...group, merged: mergeOrderNotices(group.rows)}))` [VERIFIED: today-orders-card.tsx:275-282]. 그래서 한 묶음의 order_no 배열은 한 계좌다(RPC 가 account 하나 + 배열을 받는 근거).
- **행 렌더:** 데스크톱은 `<TableRow>` 뒤 `<TableRow data-slot="…-detail"><TableCell colSpan={8}>` — 임베드 미체결 표의 취소 결과 행이 같은 문법이다(`<Fragment key=…><TableRow …/>{… && <TableRow data-slot="account-embed-cancel-result"><TableCell colSpan={stockScope ? 5 : 7}>` [VERIFIED: account-panel.tsx:1330-1421 cat]). 표 열 수는 8(시각·종목·구분·출처·수량·가격·상태·주문번호) [VERIFIED: today-orders-card.tsx:407-418].
- **토글:** 행 `onClick` + `aria-expanded` + 키보드(Enter/Space) — 버튼 역할을 행에 줄 때 `role="button"`·`tabIndex={0}` 대신 첫 칸에 실제 `<button aria-expanded>` 를 두고 행 클릭을 위임하는 편이 a11y 규칙(행 = 표 의미 유지)에 맞다. 예시: `components/home/theme-card.tsx:87,150` · `card/card-tabs.tsx:222` [CITED: 25-CONTEXT code_context].
- **라이브:** 펼친 키 집합(메모리)마다 ① 스토어 `strategyEvents` 중 `(accountNo, orderNo ∈ members)` 를 이어붙이고 ② `journalRows` 에서 구성원 `lastSeq` 가 오르면 **디바운스(예: 400ms trailing) 재조회 1회**(조각 체결 폭주 시 RPC 폭주 방지).
- **running sum:** 통보 E 이벤트를 **주문번호별** seq 오름차순으로 누적. 분모 = 그 주문 행 `qty`, 전량 = `running + row.modifiedQty >= row.qty`, `qty` null 이면 분모 없이 「체결 N주」 [CITED: reference/order-log-template-review.md 질문 ②].
- **별건 3:** `orderActionWord` 의 마지막 `return "";` [VERIFIED: order-notices.ts:58-59] → `"주문"`(방향색은 `orderActionSide` 가 null 을 내므로 그대로 없음). `orderDisplayStatus` 는 `STATUS_LABELS[row.status]` 한 줄 [VERIFIED: orders-api.ts:149-151] → `row.status === "rejected" && row.resultCode === -2` 선판정으로 「접수 불명」(톤은 danger 가 아닌 것 — 재주문 유도 방지). R(New) 방향 참고 표기는 UI-SPEC 에서 모양 확정. 소비처는 `today-orders-card.tsx` 뿐 [VERIFIED: grep].

### Pattern 7: 주문로그 탭 · 창 분리
- **탭 등록 3곳:** `type SharedTab = 'unfilled' | 'holdings' | 'log';` [VERIFIED: shared-panels.tsx:94], `export type SharedPanelTab = "unfilled" | "holdings" | "log";` [VERIFIED: trading-layout.ts:112], 복원 화이트리스트 `if (p.sharedTab === "unfilled" || p.sharedTab === "holdings" || p.sharedTab === "log")` [VERIFIED: trading-layout.ts:140]. 카드: `export type CardTab = "info" | "unfilled" | "holdings" | "log";` [VERIFIED: card-tabs.tsx:64] — 카드 탭 요청 통로(`CardTabRequest {tab, seq}` [VERIFIED: card-tabs.tsx:66-70])도 새 값을 받는다.
- **데이터:** 마운트 시 `GET /api/strategy-events`(오늘) 1회 → 스토어 푸시와 키(`gateway|epoch|seq`) 병합, 오늘(KST `kstDateIso`) 것만 — `mergeJournalRows` 의 `row.tradeDate !== today` 거름과 같은 규칙 [VERIFIED: orders-api.ts:78 cat].
- **정렬:** 기획서 「시간순, 새 로그는 아래」 — 오름차순 (`gwTimeMs`, gateway, seq). 전략 로그(`StrategyLog`)는 최신이 index 0 이라 **반대**다(재사용 금지, 스타일만 참고) [VERIFIED: strategy-log.tsx:522-523 cat].
- **스크롤 고정:** 목록 자체가 `max-height` 스크롤러(목업 `.body { max-height:172px; overflow-y:auto }` · `.pin { position:sticky; bottom:0 }` [VERIFIED: reference/mockup-order-log-tab.html]). 훅 `useStickToBottom(ref, itemsLength, thresholdPx)`: 스크롤 이벤트로 `atBottom` 추적 → `useLayoutEffect` 에서 `atBottom` 이면 `scrollTop = scrollHeight`, 아니면 `pendingNew += Δ` → 핀 「새 로그 N · 맨 아래로 ↓」.
- **새 로그 배지:** 스토어에 `strategyEventsSeq`(journal.events 로 새로 들어온 수 누적 카운터 — `rateCrossSnapSeq` 선례 [VERIFIED: use-relay-socket.ts:899 cat])를 두고, 탭이 활성인 동안 `seenSeq = strategyEventsSeq`, 배지 = 차이.
- **창 분리:** 새 페이지 `app/trading/order-log/page.tsx` — AppShell/사이드바 없이 목록+필터만. 기존 `/trading/vi` · `/trading/limit-chaser/[key]` 는 **리다이렉트 전용**이라 골격 예시가 아니다 [VERIFIED: 두 page.tsx cat]; 실제 골격은 `app/trading/page.tsx` 의 `<Suspense fallback={null}>`(`useSearchParams` 요구) [VERIFIED: app/trading/page.tsx cat]. `RelayProvider` 는 루트 layout 전역이라 새 창도 자기 wss 연결을 연다 [VERIFIED: app/layout.tsx:75]. 네이티브 앱(Capacitor 셸)에서는 `window.open` 이 의미 없으므로 `isNativeApp()` [VERIFIED: webapp/src/lib/native/native-detect.ts:24] 이면 버튼을 숨기거나 같은 창 이동.
- **계좌 축:** 공용 패널의 미체결·잔고는 상태줄 **단일 계좌**를 본다(`accountNo` prop [VERIFIED: shared-panels.tsx SharedPanelsProps]). 주문로그 탭의 계좌 범위는 CONTEXT 에 없다 → Open Question 1.

### Pattern 8: 문장 조립기(shared) · 표시명 표
- 순수 함수 `strategyEventBody(ev, labels)` → `{ kindLabel, groupLabel, body, cumText }`. 탭은 `[시간][주문번호][구분] 거래소 | 종목 | body | 누적 N` 로, 펼침은 `body · 누적 N` 으로 조립(D-09).
- 표시명 표(D-10) — 기존 웹에 group/kind/cancel_reason 표가 **없다**(`strategy-display.ts` 는 `sideDisplayText`·`serverMsgBadge` 뿐 [VERIFIED: packages/shared/src/strategy-display.ts cat]; `limit-chaser.ts` 는 `preBuyEnabled: '선매수', extraBuyEnabled: '추가매수'` 두 개 [VERIFIED: webapp/src/lib/limit-chaser.ts:314-315 grep]). 신설 위치 `@gh-radar/shared`, 모르는 값은 `String(code)` 원문(D-10). enum 목록(gh-trade 계획): `StrategyEventKind{1..8}` · `OrderGroup{0..6}` · `CondMetric{1..7}` · `EvidenceKind{1..3}` · `CancelReason{1..9}` [CITED: gh-trade `25-01-PLAN.md` interfaces — v0.1 은 CondMetric 1~5·CancelReason 1~6 까지, 나머지는 말미 추가 예정].
- 연산자: `reason_code`(서버 `OrderReasonName` 원문)로 ≤/≥ 를 고른다 — v0.1 표 「연산자는 reason_code 로 결정」 [VERIFIED: reference/gh-trade-strategy-event-fields-v0.1.md]. reason_code → 연산자 표는 gh-trade 에서 받아야 한다(Open Question 4). 모르면 연산자 없이 「매도잔량 50,000」.
- 시각: `new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",second:"2-digit",fractionalSecondDigits:3,hourCycle:"h23"})` → `"09:45:02.861"` [VERIFIED: node 실측]. 기존 카드는 `hour12:false` 를 쓴다(`today-orders-card.tsx:132-138` [VERIFIED]) — 자정 표기가 `24:` 로 나오는 브라우저 차이를 피하려면 새 포매터는 `hourCycle:"h23"`.

### Pattern 9: 진행률 B안 보조행
- 조인 키: `(account.a, row.orderNo)` 로 `queueProgress.get(`${row.isin}|${row.exchange}`)` 안의 항목 탐색. `RelayUnfilled` 는 `orderNo · isin · exchange` 를 가진다 [VERIFIED: packages/shared/src/relay.ts:873-913 cat]. AccountPanel 은 이미 `useRelayContext()` 를 부른다 [VERIFIED: account-panel.tsx:357 cat] → 컨텍스트에서 `queueProgress` 를 읽으면 3표면이 한 번에 된다.
- 표면: 기본 모드 데스크톱 표(열 7 — 주문번호·구분·종목·주문가·주문·미체결·취소 [VERIFIED: account-panel.tsx:764-771 cat]) → `<Fragment>` + 보조 `<TableRow><TableCell colSpan={7}>`; 모바일 카드 r3 는 기존 `StatusNotes` 자리 옆 [VERIFIED: account-panel.tsx:917-918 cat]; 임베드 표는 이미 `Fragment` 구조 [VERIFIED: account-panel.tsx:1330-1331 cat], colSpan `stockScope ? 5 : 7` [VERIFIED: :1421].
- 값: `remaining = max(0, remaining_volume)`, `pct = min(100, max(0, progress_bp/100))`, `pct >= 90` → up 색, D-12 `remaining ≤ 0 ∨ bp ≥ 10000` → 「0주 남음」 + 100%. 라벨 = `group` 표시명(후매수 등).
- 막대: `role="progressbar" aria-valuenow aria-valuemin=0 aria-valuemax=100 aria-label="체결예상까지 진행률"`. 색만으로 90% 를 구분하지 않도록 퍼센트 숫자 병기(목업이 이미 병기).

### Anti-Patterns to Avoid
- **observer 에서 Supabase await:** 수신 콜백은 동기여야 한다(D-32) [VERIFIED: observer.ts:16-17]. 전략 push 도 동기 적재만.
- **두 스트림을 한 RPC/트랜잭션에:** 한쪽 포이즌/실패가 다른 쪽 커서를 막는다(CONTEXT 확정).
- **웹이 대기 여부·진행률 계산:** D-11 · 「웹 계산 없음」.
- **문구(message) 파싱:** D-36 · T-17-33 — `order-notices.ts` 는 문구를 인자로 받지도 않는다 [VERIFIED: order-notices.ts:1-9 주석].
- **`StrategyLog` 재사용:** 순서(최신 위)·출처(메모리)·줄 모양이 다르다. 스타일만 참고.
- **market 이벤트 가시성을 `account_no = ''` 로만 판정:** 계좌 빈 주문 이벤트(형식 이상)가 게이트웨이 전 사용자에게 샌다. `kind IN (1,2)` 로 판정(Security).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 전략 기록기 큐·재시도·갭·epoch | 새 클래스 복제 | `JournalWriter` 에 스트림 서술자 주입 | 527줄 규칙(Pitfall 2 재시도·seq 역행)을 두 벌로 두면 한쪽만 고쳐진다 |
| ms 시각 포맷 | 수동 padStart 조립 | `Intl.DateTimeFormat` `fractionalSecondDigits:3` + `timeZone:"Asia/Seoul"` | 해외 접속 화면 시간대 오류 방지(카드 주석 [VERIFIED: today-orders-card.tsx:128-131]) |
| 숫자 표기 | 정규식 콤마 | `Intl.NumberFormat("ko-KR")` (`KRW` 관례 [VERIFIED: today-orders-card.tsx:126]) | 음수·큰 수 일관 |
| 멱등 적재 | relay 쪽 중복 판정 | DB PK `ON CONFLICT DO NOTHING` | Phase 19 D-12 — 재생 멱등의 유일한 근거 |
| 계좌 가시성 | server/웹 필터 | RPC 조인 + relay `accountsOf` | 판정이 두 벌이면 복원과 푸시가 갈린다 [VERIFIED: fanout.ts:1488-1492] |
| FlatBuffers 코드 | 손 작성 | gh-trade `sync-relay-schema.sh` 생성물 | 손편집 금지(Phase 17 D-01) |
| 이름 해석 | 새 조회 | `useIsinLabels` + `useStockNames` 폴백 + RPC `stock_code` 조인 | 카드 ⑥ 규율 [VERIFIED: today-orders-card.tsx:34-47] |

**Key insight:** 이 phase 의 relay/DB 부분은 「새 기능」 이 아니라 Phase 19 기계의 **두 번째 인스턴스**다. 복제가 아니라 매개변수화가 정답이고, gh-trade 도 서버에서 같은 선택(`JournalStore<Traits>` 템플릿)을 했다 [CITED: gh-trade `25-01-PLAN.md` 서버 구조].

## Runtime State Inventory

이 phase 는 rename 이 아니지만 **배포 경계를 넘는 런타임 상태**가 있어 적는다.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `dma_journal_cursor` 기존 행(KB · KYOBO) — 새 칸 추가 시 기존 행 값 필요 | 마이그레이션에서 `strategy_last_seq DEFAULT 0` · `strategy_journal_epoch NULL` — 데이터 이관 없음(전략 스트림은 since 0 부터 받는 것이 정답) |
| Live service config | 게이트웨이 `observer.toml` — 이 phase 는 값 변경 없음. gh-trade 서버 재배포 시 relay 관찰자 재로그인 발생 | 로그인 거부가 나면 relay 재접속 영구 중단 → `docker restart gh-radar-relay` 필요 [VERIFIED: MEMORY project_kyobo127_relay_observer] |
| OS-registered state | 없음 — relay 는 Docker `--restart=always` 컨테이너, 새 systemd/cron 없음 | none |
| Secrets/env vars | 없음 — 새 비밀·env 없음(관찰자 비밀 재사용) | none. relay 배포 스크립트 env(`GCP_PROJECT_ID`·`SUPABASE_URL` 등)는 기존 그대로 [VERIFIED: MEMORY reference_deploy_worker_env] |
| Build artifacts | `relay/src/generated/**` 가 gh-trade fbs 커밋에 맞춰 바뀜 · Docker 이미지 재빌드 | 생성물 + 수기 사본 3곳 + frames.ts 한 커밋 · relay 이미지 재배포 |

## Common Pitfalls

### Pitfall 1: 전략 스트림 resync 를 모르면 무한 갭 루프
**What goes wrong:** 전략 since 가 게이트웨이 보관 범위 밖인데 relay 가 그 사실을 모르면, 게이트웨이는 `strategy_oldest_seq` 부터 보내고 relay 전략 기록기는 `lastReceived+1 ≠ oldest` 로 갭 → 끊고 같은 since 로 재로그인 → 같은 갭.
**Why:** `beginEpoch` 는 `resync` 일 때만 `lastReceivedSeq = null` 로 비운다 [VERIFIED: writer.ts:303-305]. v0.1 필드표에는 `strategy_resync` 가 없다 [VERIFIED: reference/gh-trade-strategy-event-fields-v0.1.md].
**How to avoid:** gh-trade 계획대로 `ObserverLoginResp.strategy_resync`(슬롯 24)를 파싱해 전략 기록기 `beginEpoch` 에 넘긴다 [CITED: gh-trade `25-01-PLAN.md` — 「relay 가 스트림별 resync 를 파생하지 않게」]. fbs 해시에서 이 필드 존재를 **첫 확인 항목**으로.
**Warning signs:** 로그 `[journal] seq 갭` + `stream:"strategy"` 가 수 초 주기로 반복.

### Pitfall 2: 구 게이트웨이/배포 순서 어긋남에서 replaying 고착
**What goes wrong:** 「매 배치 두 caught_up 모두 true」 로 짜면 전략 필드가 없는 서버에서 `strategy_caught_up` 기본값 false 가 영원히 live 를 막는다 → 장중 180초 뒤 `/healthz` 503.
**How to avoid:** Pattern 1 의 pending 플래그 방식. 테스트: 「strategy 값 전부 0 인 로그인 + 배치 → live」.

### Pitfall 3: 커서 epoch 한 칸 공유
**What goes wrong:** 새 epoch 로 저널 apply 가 먼저 커서 `journal_epoch` 를 바꾸면, 아직 옛 epoch 전략 seq 를 담은 `strategy_last_seq` 가 새 epoch 의 since 로 쓰인다 → 새 epoch 앞 구간 전략 이벤트를 건너뛴다(Pitfall 3 변형 — observer 주석 :223-225 [VERIFIED]).
**How to avoid:** `strategy_journal_epoch` 칸을 두고 `readCursor` 가 `strategy_journal_epoch === journal_epoch` 일 때만 `strategy_last_seq` 를 since 로 쓴다(아니면 null → since 0). CONTEXT 의 「`strategy_last_seq`」 결정과 충돌하지 않는 **추가 칸**이다.

### Pitfall 4: 전략 기록기 실패가 주문 저널까지 멈춘다
**What goes wrong:** 전략 apply 가 계속 실패(예: relay 를 마이그레이션보다 먼저 배포 → 함수 없음)하면 전략 큐가 5,000 에 닿아 `overflow` → 관찰자가 **소켓 전체**를 끊는다 → 주문 저널도 멈춤 → 503. 두 스트림이 한 소켓을 공유하는 구조상 피할 수 없다.
**How to avoid:** 배포 순서를 **Supabase 마이그레이션 → gh-trade 서버 → relay → webapp** 로 고정(마이그레이션은 가산적이라 언제 먼저 올려도 안전). `JOURNAL_MAX_QUEUE = 5_000` [VERIFIED: writer.ts:54] 를 전략에도 쓰되 `/healthz` 본문에 전략 기록기 `dbError`·`queueDepth` 를 노출해 원인이 보이게.

### Pitfall 5: 82 `StrategyEventPush` 경고 폭주
**What goes wrong:** gh-trade 는 82 를 「그 종목을 시세 구독한 세션 전부」에 Notice 로 보낸다 [CITED: gh-trade `25-CONTEXT.md` D-07]. relay 사용자 세션은 호가 구독을 하므로 82 가 들어오고, 화이트리스트에 없으면 `drop("unknown-msg-type")` 경고가 쌓인다 [VERIFIED: envelope.ts:506-509].
**How to avoid:** 81·82 를 `OUT_OF_SCOPE_INBOUND_MSG_TYPES` 에 넣어 debug 드롭(파싱 없음) — 그 집합의 정의(「왜 범위 밖인지 아는 응답 대역」)에 맞는다 [VERIFIED: msg-type.ts:230-250]. 파일 머리 「하지 않는 것」 주석도 같은 커밋에서(「서로를 가리키게」 규율 [VERIFIED: msg-type.ts:58-60]). 83 만 `INBOUND_MSG_TYPES` + hub 명시 case(PC-12 — 「화이트리스트와 명시 case 는 같은 커밋」 [VERIFIED: msg-type.ts:196-201]).

### Pitfall 6: 진행률 캐시가 세션 교체 뒤 남는다 / 남의 계좌가 샌다
**What goes wrong:** ① `#clearCaches` 에 진행률 맵 정리를 빠뜨리면 세션 교체 뒤 인증 직후 스냅샷이 옛 대기 행을 그린다(77·78 이 같은 이유로 거기 있다 [VERIFIED: subscription-hub.ts:1674-1681]). ② 필터 없이 캐시하면 시세 구독만 한 사용자가 남의 계좌 대기 주문을 본다(T-19-02).
**How to avoid:** 캐시 키 `${userId}|${isin}|${exchange}`, 저장 전 `allowedAccounts` 필터 + `dma_user_id` 제거. hub 테스트에 「다른 계좌 항목 0」 · 「세션 교체 후 스냅 없음」 단언.

### Pitfall 7: 생성물 커밋이 수기 사본 없이 빌드를 깬다
**What goes wrong:** flatc TS 의 `create*` 는 모든 필드를 위치 인자로 받는다 — `ObserverLoginReq.createObserverLoginReq(b, secret, BigInt(sinceSeq), epoch, client)` [VERIFIED: envelope.ts:2603], 테스트 `JournalBatch.createJournalBatch(b, records, BigInt(head), input.caughtUp ?? true)` [VERIFIED: relay/tests/helpers/frames.ts:1431 grep]. 필드가 늘면 이 호출들이 **타입 오류**가 된다.
**How to avoid:** 생성물 · `msg-type.ts` · `envelope.ts` · `subscription-hub.ts` · `tests/helpers/frames.ts` · `fake-gateway.ts` 를 **한 커밋**, 게이트는 `pnpm --filter @gh-radar/relay run typecheck && … typecheck:tests`. Phase 24-01 이 쓴 `sync-relay-schema.sh --check` 출력 단언(「신규/변경 예정 : 0 개」 · 「.fbs 사본 : 최신」)을 그대로 verify 로 [VERIFIED: 24-01-PLAN.md:68,232]. 스크립트는 `RELAY=` 미지정 시 메인 체크아웃에 쓴다 — worktree 실행 시 반드시 지정 [VERIFIED: MEMORY reference_gh_trade_protocol_sync].

### Pitfall 8: 파서가 레코드를 버리면 갭 루프
**What goes wrong:** 형식 이상 전략 이벤트 하나를 파서에서 건너뛰면 seq 갭 → 재접속 → 같은 레코드 → 무한 루프.
**How to avoid:** `parseJournalBatch` 규율 그대로 — 「레코드는 하나도 버리지 않는다(T-19-34)」, 경고만 [VERIFIED: envelope.ts:2664-2668]. 상한 초과는 `takeCount` 로 앞 N건 + caughtUp 거짓 [VERIFIED: envelope.ts:2681,2746]. 전략 이벤트에도 `MAX_STRATEGY_BATCH_EVENTS`(예: 500 — `MAX_JOURNAL_BATCH_RECORDS = 500` [VERIFIED: envelope.ts:138])와 `strategyCaughtUp = raw && n === rawCount`. `gw_time_ms` 는 전략에선 `long`(부호) — `toNum` 이 부호 양쪽을 클램프한다 [VERIFIED: envelope.ts:267-278].

### Pitfall 9: 같은 ms 정렬(통보 → 전략)과 시각 정밀도
**What goes wrong:** 저널 이벤트는 `gw_time timestamptz` 만 있고(`to_timestamp(ms/1000.0)` [VERIFIED: 20260924200100:425]) 전략은 ms 원문 — 두 표를 ISO 문자열로 섞으면 같은 ms 비교가 표기(`Z`/`+00:00`)·부동소수에 흔들린다.
**How to avoid:** 주문별 RPC 가 두 소스 모두 `gw_time_ms bigint` 를 반환(저널은 `round(extract(epoch from gw_time) * 1000)::bigint`)하고 `ORDER BY gw_time_ms, source_rank(journal 0 · strategy 1), seq`. 웹 병합도 같은 비교 함수 하나.

### Pitfall 10: 펼침 재조회 폭주
**What goes wrong:** 조각 체결 7건이면 `journal.rows` 가 연달아 와 펼친 행마다 재조회가 연쇄된다(Cloud Run 왕복 비용).
**How to avoid:** 펼친 묶음 단위 trailing 디바운스 + in-flight 중 재요청은 1건으로 접기. 테스트는 가짜 타이머.

### Pitfall 11: 「맨 아래일 때만 따라감」 이 페이지 스크롤에서 무너진다
**What goes wrong:** 공용 패널 본문은 폰 밴드만 `max-h-[40vh] overflow-auto`, ≥700 은 `@min-[700px]/wb:max-h-none` [VERIFIED: shared-panels.tsx:316 cat] — 스크롤 주인이 페이지(main)라 CSS sticky·scrollTop 제어가 안 된다(메모 「main overflow-auto 라 CSS sticky 불가」 [VERIFIED: MEMORY project_wb_active_strategy_rule]). 카드 탭 본문은 정보 탭 3줄 고정 높이 [VERIFIED: card-tabs.tsx 머리 ①].
**How to avoid:** 주문로그 목록 컴포넌트가 **자기 스크롤러**(목업 172px ≈ 5~6줄)를 가진다. 카드 탭에서는 그 고정 높이 본문 안에서 같은 컴포넌트를 `dense` 로. 창 분리 페이지는 뷰포트 높이.

### Pitfall 12: 탭 값 세 곳 중 하나만 고침
**What goes wrong:** `SharedTab` 만 늘리면 `writePanelsPref({ sharedTab: "orderlog" })` 는 저장되지만 `readPanelsPref` 화이트리스트가 버려 새로고침 시 미체결 탭으로 돌아간다 [VERIFIED: trading-layout.ts:140].
**How to avoid:** `SharedPanelTab` 을 정본으로 두고 `SharedTab = SharedPanelTab` 으로 묶거나, 배열 상수 하나에서 유니온과 가드를 파생. 테스트: 저장 → 재마운트 → 탭 복원.

### Pitfall 13: RPC/테이블 권한
**What goes wrong:** `REVOKE … FROM PUBLIC` 만 쓰면 플랫폼 auto-grant 로 anon 이 RPC 를 부른다 → 남의 `p_user_id` 로 IDOR [VERIFIED: MEMORY feedback_supabase_rpc_revoke · 20260924200100:28-30].
**How to avoid:** 함수마다 정확한 시그니처로 3줄 + pgTAP `has_function_privilege('anon', …, 'EXECUTE') = false` 단언(`dma_journal_schema.test.sql` 동형). 테이블은 정책 0개.

### Pitfall 14: 스토어 상한 · 오늘 경계
**What goes wrong:** 시세 이벤트는 **전 종목** 대상이라(gh-trade D-04 「상따 등록 여부와 무관」 [CITED]) 변동 큰 날 수백 건. 상한 없이 쌓거나 자정을 넘긴 탭이 어제 이벤트를 섞는다.
**How to avoid:** `MAX_STRATEGY_EVENTS`(예: 5,000 — `MAX_JOURNAL_ROWS = 2000` [VERIFIED: use-relay-socket.ts:133] 동형, 넘치면 오래된 것부터 버림) · 푸시 병합 시 `tradeDate === kstDateIso()` 만.

### Pitfall 15: 주문번호·계좌번호 표기 불일치
**What goes wrong:** 진행률 조인은 `QueueProgressItem.order_no` ↔ `RelayUnfilled.orderNo`, `account_no` ↔ `RelayAccountState.a` 의 **문자열 동등**이다. 한쪽만 앞 0 이 붙으면 보조행이 영영 안 뜬다(Phase 19 Pitfall 7 — 재정규화 금지 [VERIFIED: 20260924200000:38-40]).
**How to avoid:** 정규화하지 않고 gh-trade 가 두 메시지에 같은 원천 문자열을 싣는지 확인(Open Question 5). 조인 실패를 dev 로그 1회로 드러내는 가드.

## Code Examples

### 1. `dma_strategy_apply` 골격 (Phase 19 apply 동형)
```sql
-- Source: 20260924200100_dma_journal_rpcs.sql:382-508 구조를 본뜸
CREATE OR REPLACE FUNCTION public.dma_strategy_apply(p_gateway text, p_epoch text, p_events jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE ev jsonb; v_seq bigint; v_max bigint; v_applied int := 0; v_skipped int := 0;
        v_rows jsonb := '[]'::jsonb; v_row public.dma_strategy_events%ROWTYPE; v_last bigint;
BEGIN
  IF coalesce(p_gateway,'') = '' OR coalesce(p_epoch,'') = '' THEN
    RAISE EXCEPTION 'dma_strategy_apply: gateway/journal_epoch 가 비어 있다'; END IF;
  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION 'dma_strategy_apply: p_events 는 JSON 배열이어야 한다'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('dma_strategy:' || p_gateway));   -- 저널과 다른 키
  FOR ev IN SELECT value FROM jsonb_array_elements(p_events) ORDER BY (value->>'seq')::bigint LOOP
    v_seq := (ev->>'seq')::bigint;  v_max := GREATEST(coalesce(v_max,0), v_seq);
    INSERT INTO public.dma_strategy_events (gateway, journal_epoch, seq, trade_date, gw_time_ms, kind, "group",
       exchange, isin, cum_volume, dma_user_id, account_no, order_no, /* … v0.1 나머지 … */ snap_qty, snap_cum)
    VALUES (p_gateway, p_epoch, v_seq, (ev->>'trade_date')::date, (ev->>'gw_time_ms')::bigint,
       coalesce((ev->>'kind')::smallint,0), coalesce((ev->>'group')::smallint,0),
       coalesce(ev->>'exchange',''), coalesce(ev->>'isin',''), coalesce((ev->>'cum_volume')::bigint,0),
       coalesce(ev->>'dma_user_id',''), coalesce(ev->>'account_no',''), coalesce(ev->>'order_no',''),
       /* … */ coalesce(ARRAY(SELECT x::bigint FROM jsonb_array_elements_text(ev->'snap_qty') x),'{}'),
                coalesce(ARRAY(SELECT x::bigint FROM jsonb_array_elements_text(ev->'snap_cum') x),'{}'))
    ON CONFLICT DO NOTHING
    RETURNING * INTO v_row;
    IF NOT FOUND THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    v_applied := v_applied + 1;
    v_rows := v_rows || jsonb_build_array(to_jsonb(v_row) - 'dma_user_id' - 'applied_at');  -- T-19-08
  END LOOP;
  IF v_max IS NOT NULL THEN
    INSERT INTO public.dma_journal_cursor AS cur (gateway, journal_epoch, last_seq, strategy_journal_epoch, strategy_last_seq, updated_at)
    VALUES (p_gateway, p_epoch, 0, p_epoch, v_max, now())
    ON CONFLICT (gateway) DO UPDATE SET
      strategy_journal_epoch = EXCLUDED.strategy_journal_epoch,
      strategy_last_seq = CASE WHEN cur.strategy_journal_epoch = EXCLUDED.strategy_journal_epoch
                               THEN GREATEST(cur.strategy_last_seq, EXCLUDED.strategy_last_seq)
                               ELSE EXCLUDED.strategy_last_seq END,
      updated_at = now();                                   -- journal_epoch/last_seq 는 건드리지 않는다
  END IF;
  SELECT c.strategy_last_seq INTO v_last FROM public.dma_journal_cursor c
   WHERE c.gateway = p_gateway AND c.strategy_journal_epoch = p_epoch;
  RETURN jsonb_build_object('applied', v_applied, 'skipped', v_skipped, 'last_seq', coalesce(v_last,0), 'rows', v_rows);
END; $$;
REVOKE EXECUTE ON FUNCTION public.dma_strategy_apply(text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_strategy_apply(text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_strategy_apply(text, text, jsonb) TO service_role;
```
(반환 rows 에 `stocks.code` 조인이 필요하면 `jsonb_agg` 로 삽입분을 재조회 — 저널 apply :488-498 동형. `group` 은 SQL 예약어라 칸 이름을 따옴표 또는 `order_group` 으로 — **JSON 키는 v0.1 대로 `group`** 이므로 INSERT 매핑에서만 이름을 바꾼다.)

### 2. 하루치 평면 목록 가시성 조인
```sql
-- 주문 이벤트: 계좌 조인(D-06) · 시세 이벤트: kind 1·2 이고 그 게이트웨이 매핑 보유(“자격증명 사용자 전원”)
SELECT e.gateway, e.journal_epoch, e.seq, e.gw_time_ms, e.kind, e."group", e.exchange, e.isin, s.code AS stock_code, /* 공개 칸 … */
  FROM public.dma_strategy_events e
  LEFT JOIN public.stocks s ON s.isin = e.isin
 WHERE e.trade_date = p_trade_date
   AND (
     (e.kind NOT IN (1,2) AND EXISTS (
        SELECT 1 FROM public.dma_account_access a JOIN public.dma_credentials c ON c.dma_user_id = a.dma_user_id
         WHERE c.user_id = p_user_id AND a.gateway = e.gateway AND a.account_no = e.account_no))
     OR
     (e.kind IN (1,2) AND EXISTS (
        SELECT 1 FROM public.dma_account_access a JOIN public.dma_credentials c ON c.dma_user_id = a.dma_user_id
         WHERE c.user_id = p_user_id AND a.gateway = e.gateway))
   )
 ORDER BY e.gw_time_ms, e.gateway, e.seq;
```
조인 경로 `dma_credentials.dma_user_id → dma_account_access` 는 기존 조회 RPC 와 같다 [VERIFIED: 20260924200100:599-606].

### 3. 주문별 이벤트(UNION ALL · 왕복 1회)
```sql
-- p_user_id uuid, p_trade_date date, p_account_no text, p_order_nos text[]
WITH ok AS (SELECT EXISTS (SELECT 1 FROM dma_account_access a JOIN dma_credentials c ON c.dma_user_id = a.dma_user_id
                            WHERE c.user_id = p_user_id AND a.account_no = p_account_no) AS v)
SELECT 'journal'::text AS source, j.gateway, j.journal_epoch, j.seq,
       round(extract(epoch FROM j.gw_time) * 1000)::bigint AS gw_time_ms,
       to_jsonb(j) - 'dma_user_id' - 'apply_error' - 'applied_at' AS ev
  FROM dma_journal_events j, ok
 WHERE ok.v AND j.trade_date = p_trade_date AND j.account_no = p_account_no
   AND (j.order_no = ANY (p_order_nos) OR j.org_order_no = ANY (p_order_nos))   -- 취소·정정 확인 포함
UNION ALL
SELECT 'strategy', e.gateway, e.journal_epoch, e.seq, e.gw_time_ms, to_jsonb(e) - 'dma_user_id' - 'applied_at'
  FROM dma_strategy_events e, ok
 WHERE ok.v AND e.trade_date = p_trade_date AND e.account_no = p_account_no
   AND e.order_no <> '' AND e.order_no = ANY (p_order_nos)
 ORDER BY gw_time_ms, (source = 'strategy'), seq;   -- 같은 ms 는 통보 → 전략
```
(`org_order_no` 매칭 범위는 Open Question 3. 저널 인덱스 `(gateway, account_no, trade_date)` 가 이미 있다 [VERIFIED: 20260924200000:93-94].)

### 4. 문장 조립(기획서 예시 1줄 기대값)
```typescript
// Source: reference/spec-order-log-progress-20260929.md 예시 하루 흐름
// 입력(v0.1): kind=4 Queued, group=1 PreBuy, qty=300, base_cum=900000, ahead_qty=30000, expected_cum=930000, cum_volume=900000
strategyEventBody(ev) // → { kindLabel:"대기", groupLabel:"선매수",
                      //      body:"300주 | 체결예상 930,000 (900,000 + 30,000)", cumText:"누적 900,000" }
// 탭 한 줄: "[09:45:02.880][12451][선매수] 대기 | KRX | ○○전자 | 300주 | 체결예상 930,000 (900,000 + 30,000) | 누적 900,000"
// 펼침:    "대기 · 300주 · 체결예상 930,000 (900,000 + 30,000) · 누적 900,000"
```
기획서 12줄(○○전자 12451~12455 + 상한가노출/진입)을 **테스트 픽스처 1벌**(`packages/shared/src/__fixtures__/strategy-day.ts` 등)로 두고 조립 결과를 줄 단위로 단언한다. 같은 픽스처를 webapp 컴포넌트 테스트·e2e 목 응답이 재사용.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 전략 로그 = 브라우저 메모리(에코 + 54) | 서버 StrategyEvent 저장·복원 | 이 phase | 새로고침·다른 단말에도 남는다. 전략 로그 탭은 설정 이력으로 존치 |
| 관찰자 단일 스트림 | 한 소켓 두 스트림(커서 2) | 이 phase | 상태기계 pending 플래그 2 |
| 진행률 없음 | 서버 계산 `QueueProgress` Broadcast | 이 phase | 웹 계산 금지 |

**Deprecated/outdated:** 기획서 각주 용어 변경안(추가매수→후매수 등) — 채택 안 함(Deferred).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | gh-trade fbs 에 `ObserverLoginResp.strategy_resync`(슬롯 24)가 들어온다 | Pattern 1 · Pitfall 1 | 없으면 relay 가 스트림별 resync 를 파생해야 한다(규칙: `sOldest>0 ∧ sSince<sOldest−1` 또는 `sOldest=0 ∧ sSince<sHead`) — 설계 변경 |
| A2 | 필드 타입(`gw_time_ms: long` · `cum_volume: ulong` · `snap_*: [long]` · enum `: ubyte`)과 테이블 이름(`StrategyEventBatch`·`QueueProgressItem`·`QueueProgress`)·Envelope 슬롯(82/84)은 gh-trade 25-01-PLAN 대로 커밋된다 | Code Examples · 파서 | 파서·DB 칸 타입 수정 |
| A3 | `Cancelled(7)` 이벤트의 `order_no` 는 **원주문 번호**(취소 대상)다(gh-trade `CancelTargetOrderNo`) | Pattern 6 · Code 3 | 취소 번호면 펼친 원주문 행에 취소 사유가 안 붙는다 → `org_order_no` 칸 요청 필요 |
| A4 | `QueueProgress` 는 관찰자 소켓에 오지 않고 사용자 세션에만 온다 | Pattern 3 | 관찰자에 오면 codec 이 번호별 1회 warn — 무해(ignore 로 옮기면 됨) |
| A5 | KYOBO(추가 게이트웨이)는 사용자 세션이 없어 진행률이 오지 않는다 — 허용 | Pattern 3 | 교보 주문 개통 시 관찰자 경로 수신 설계 필요(후속) |
| A6 | 하루 이벤트 수백~2천 → 인덱스 2개 · 스토어 상한 5,000 로 충분 | Pattern 4 · Pitfall 14 | 상한 조정 |
| A7 | `QueueProgressItem.order_no/account_no` 표기가 `UnfilledState` 와 같다 | Pitfall 15 | 보조행 미표시 |
| A8 | `reason_code` → 연산자(≤/≥) 대응표를 gh-trade 가 준다 | Pattern 8 | 조건 문구에 연산자 누락 |

## Open Questions

1. **작업대 주문로그 탭의 계좌 범위** — 공용 패널 형제 탭(미체결·잔고)은 상태줄 단일 계좌다. 하루치 RPC 는 볼 수 있는 모든 계좌를 준다.
   - 권장: 공용 패널 = 상태줄 계좌 주문 이벤트 + 시세 이벤트, 카드 탭 = 카드 계좌 + 그 종목. 창 분리 = 쿼리 `account` 로 전달. UI-SPEC/discuss 에서 1줄 확인.
2. **주문별 라우트 모양** — CONTEXT 가칭 `GET /api/orders/:id/events` vs D-02 의 order_no 배열.
   - 권장: `GET /api/orders/events?account=&orderNos=&date=`(묶음 1회). `:id` 형을 고집하면 head id + `with=` 쿼리가 필요해 어색하다.
3. **통보 이벤트 매칭 범위** — `org_order_no = ANY(p_order_nos)` 를 넣으면 원주문 펼침에 취소 확인·정정 확인이 붙는다(D-01 「취소 확인」 줄의 전제). 대신 정정으로 생긴 새 주문의 체결은 새 행에 속한다.
   - 권장: `order_no` 또는 `org_order_no` 매칭(C/M 확인만 원주문에 붙음) — pgTAP 로 고정.
4. **gh-trade 확인 3건(연락 `gh-trade-6d`)** — ① `strategy_resync` 커밋 여부(A1) ② Cancelled 의 order_no 의미(A3) ③ `reason_code` → 연산자 표(A8). fbs 해시 통보 때 함께 묻는다.
5. **진행률 조인 문자열 동일성(A7)** — fbs 뒤 fake-gateway 통합 테스트 + 실장 첫날 UAT 로 확인.
6. **거부 행(주문번호 없음) 펼침** — Rejected 는 평면 목록만(Deferred 조인). 오늘 주문의 로컬 거부 행(orderNo null)은 RPC 입력이 없다.
   - 권장: orderNo null 행은 ▸ 없이 펼침 비활성(또는 「이 거부는 상세 이벤트가 없어요」 빈 문구). UI-SPEC 에서 확정.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | 전 패키지 | ✓ | v22.22.0 | — |
| pnpm | 워크스페이스 | ✓ | 11.15.1 | — |
| flatc | 생성물(gh-trade 스크립트) | ✓ | 25.12.19 | — |
| gh-trade `server/scripts/sync-relay-schema.sh` | 생성물 | ✓ (메인 체크아웃 존재) | — | gh-trade 세션이 실행 |
| gh-trade fbs 커밋(StrategyEvent) | 파서·e2e | ✗ (phase-25 worktree 에 PLAN 까지만 — 8badc5e9) | — | 도메인 타입 선개발(FakeCodec) |
| Docker (OrbStack) | pgTAP 러너 | ✓ | 29.4.0 | — |
| `public.ecr.aws/supabase/postgres:17.6.1.104` 이미지 | pgTAP | ✗ (로컬 이미지 목록에 없음) | — | 러너는 **pull 하지 않고 멈춘다** [VERIFIED: 스크립트 헤더] → Wave 0 에 사용자 확인 후 `docker pull` 1회 |
| supabase CLI | 원격 마이그레이션 적용 | ✓ | — | — |
| psql | (러너는 컨테이너 안 psql 사용) | ✗ 로컬 | — | 불필요 |

**Missing dependencies with no fallback:** 없음(fbs 는 순서상 대기 — 선개발로 흡수).
**Missing dependencies with fallback:** Postgres 이미지 — pull 필요(사용자 확인 체크포인트).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest(relay `vitest run` · server/shared `exec vitest run` · webapp `vitest --run`) + pgTAP(로컬 Postgres 17 컨테이너) + Playwright(webapp e2e, 로컬 relay + fake-gateway) |
| Config file | `relay/vitest.config.*` · `webapp/vitest.config.*` · `webapp/playwright.config.ts` (기존) |
| Quick run command | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-observer.test.ts tests/journal-writer.test.ts` 등 해당 파일만 |
| Full suite command | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test && pnpm --filter @gh-radar/server exec vitest run && pnpm --filter @gh-radar/shared exec vitest run` + `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_apply.test.sql` |

(`workflow.build_command`/`test_command` 가 이미 relay+webapp 을 묶는다 [VERIFIED: .planning/config.json]. server·shared·pgTAP 는 위처럼 덧붙인다 — Phase 19 VALIDATION 과 같은 구성 [VERIFIED: 19-VALIDATION.md:26].)

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| 확정-DB | 원문 멱등 적재(같은 배치 2회 = applied 0) · 커서 strategy 칸만 전진 · 저널 커서 불변 · 반환 rows 에 dma_user_id 없음 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_apply.test.sql` | ❌ W0 |
| 확정-DB | 가시성: 계좌 매핑 사용자만 주문 이벤트 · kind1·2 는 그 게이트웨이 매핑 보유자 전원 · 계좌 빈 주문 이벤트는 0행 · anon/authenticated EXECUTE 불가 | pgTAP | 같은 러너, 같은 파일 | ❌ W0 |
| 확정-DB | 주문별 UNION: 같은 ms 는 journal → strategy · org_order_no 매칭 · 남의 계좌 0행 | pgTAP | 같은 러너 | ❌ W0 |
| 확정-relay | 로그인 since 2개 · pending 플래그 2 · 둘 다 caught 여야 live · 구 서버(전략 0) 즉시 live · 전략 갭 → drop + 재로그인 since 유지 · strategy_resync 시 기록기 비움 | unit(FakeCodec) | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-observer.test.ts` | ✅ 확장 |
| 확정-relay | 전략 기록기: RPC 이름·커서 칸·반환 매핑 · 실패 재시도 같은 배치 · 스트림 로그 문맥 | unit(supabase-stub) | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-writer.test.ts` | ✅ 확장 |
| 확정-relay | `journal.events` 푸시: 주문 이벤트 계좌 필터 · 시세 이벤트 게이트웨이 매핑 보유자 전원 · 추가 게이트웨이는 그 access | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-push.test.ts` | ✅ 확장 |
| 확정-relay (fbs 뒤) | 79/80 새 필드 파싱 · 5 빌더 strategy since · 83 파서 · 81/82 debug 드롭 · MSG 값 = 생성 enum | unit | `pnpm --filter @gh-radar/relay exec vitest run src/dma/__tests__/envelope.test.ts src/dma/__tests__/codec.test.ts` | ✅ 확장 |
| 진행률 relay (fbs 뒤) | 83: 허용 계좌 필터 · dma_user_id 제거 · isReady 전 캐시만 · 인증 직후 snap · 세션 교체 후 캐시 없음 · 남 계좌 0 · 빈 전이만 전송 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/hub.test.ts tests/fanout.test.ts` | ✅ 확장 |
| 통합 (fbs 뒤) | fake-gateway 관찰자 → 80(두 스트림) → Supabase stub → journal.events 도달 · 83 → unf.progress | integration | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-gateway.test.ts tests/fake-gateway.test.ts` | ✅ 확장 |
| 확정-server | 라우트 2: 401 · 400(날짜·orderNos 형식/개수) · RPC 인자 = req.userId 만 · bare array | unit(supertest) | `pnpm --filter @gh-radar/server exec vitest run tests/routes/orders.test.ts tests/routes/strategy-events.test.ts` | ✅/❌ W0 |
| D-09/D-10 | 기획서 예시 12줄 문장 기대값 · 모르는 enum 원문 · 스냅 길이<3 · has_remaining false 면 남은 거래량 없음 · 오차 부호 · 시초 상한가 | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/strategy-event-text.test.ts` | ❌ W0 |
| D-09 | `HH:MM:SS.mmm` KST · 자정 00 | unit | 같은 파일 | ❌ W0 |
| D-01~D-04 | 행 클릭 펼침/닫힘 · 다중 펼침 · 묶음 members 전달 · 타임라인 ms 정렬(통보→전략) · running sum/전량 · 푸시 이어붙임 · lastSeq 상승 디바운스 재조회 · 실패/빈 문구 | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/today-orders-card.test.tsx src/lib/__tests__/order-notices.test.ts` | ✅ 확장 |
| 별건 3 | 방향 미상 「주문」 · result_code -2 「접수 불명」 · R 방향 참고 | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/order-notices.test.ts src/lib/__tests__/orders-api.test.ts` | ✅ 확장 |
| D-05~D-08 | 탭 등록·복원(3곳) · 필터(종목/거래소/구분 6값) · 배지 카운트 · 핀 · 맨 아래 따라감 · 창 분리 URL 쿼리 | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/shared-panels.test.tsx src/components/trading/__tests__/card-tabs.test.tsx src/lib/__tests__/relay-socket.test.ts` | ✅ 확장 + ❌ W0(`order-log-*.test.tsx`) |
| D-11~D-13 | 진행률 없는 행 보조행 없음 · 90% up · 0주 남음 100% · 음수 0 · 미체결 사라지면 보조행 없음 · snap 교체 | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/orderbook/__tests__/account-panel*.test.tsx src/lib/__tests__/queue-progress.test.ts` | ❌ W0 |
| 반응형·잘림 | 주문로그 탭 공용 패널/카드/창 분리 · 오늘 주문 펼침 390px · 진행률 r3 — 잘림 0 | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/me.spec.ts -g "주문로그|펼침|진행률"` | ✅ 확장 |
| a11y | 펼침 `aria-expanded` · progressbar · 탭 | e2e(axe) | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/a11y.spec.ts` | ✅ 확장 |

### Sampling Rate
- **Per task commit:** 해당 파일 quick run(위 표의 파일 단위 명령) + 관련 패키지 typecheck
- **Per wave merge:** Full suite command
- **Phase gate:** Full suite + pgTAP + e2e(trading-workbench · me · a11y) green 후 `/gsd-verify-work`. 실장 첫 거래일 UAT(펼침 타임라인 vs 게이트웨이 로그, 진행률 표시) 체크포인트 — Phase 19 D-14 「첫 거래일 실장 대조」 동형.

### Wave 0 Gaps
- [ ] `supabase/tests/dma_strategy_apply.test.sql` — 적재·커서·가시성·UNION·REVOKE
- [ ] Postgres 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104` 로컬 확보(사용자 확인 후 `docker pull`)
- [ ] `packages/shared/src/__tests__/strategy-event-text.test.ts` + 기획서 하루 픽스처
- [ ] `server/tests/routes/strategy-events.test.ts`
- [ ] `webapp/src/components/trading/order-log/__tests__/*.test.tsx` · `webapp/src/lib/__tests__/queue-progress.test.ts`
- [ ] (fbs 뒤) `relay/tests/helpers/frames.ts` 전략 이벤트·83 빌더 · `fake-gateway.ts` 관찰자 배치에 strategy 필드

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | server `requireAuth()` · relay wss 토큰 검증(기존) |
| V3 Session Management | no (기존 그대로) | — |
| V4 Access Control | **yes (핵심)** | RPC 내부 계좌 조인(D-06) · `p_user_id = req.userId` 만(T-19-17) · EXECUTE service_role 전용 + anon/authenticated 명시 REVOKE(T-19-01) · relay `accountsOf` 필터(T-19-02) · 진행률 세션 허용 계좌 필터 |
| V5 Input Validation | yes | zod(date · orderNos 개수·길이 · account 길이) + `resolveTradeDate` 날짜 실재 검사 |
| V6 Cryptography | no | — |
| V7 Error/Logging | yes | 계좌번호 로그 `maskAccountNo` · dma_user_id 로그 금지(T-19-14) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| RPC IDOR(남의 p_user_id 로 PostgREST 직접 호출) | Information Disclosure | EXECUTE REVOKE 3줄 + pgTAP 권한 단언 |
| 시세 이벤트 공개 규칙 오남용(계좌 빈 주문 이벤트 누출) | Information Disclosure | 공개 판정은 `kind IN (1,2)` 로만 |
| 주문자 식별자 누출(`dma_user_id` in 이벤트/진행률) | Information Disclosure | RPC 반환·apply rows·relay 진행률 항목에서 제거(T-19-08) |
| 시세 구독 세션으로 들어온 남의 계좌 진행률 | Information Disclosure | hub 에서 `allowedAccounts` 필터 후 캐시 |
| 주문별 조회 증폭(거대 orderNos 배열) | DoS | zod 상한(예: 100) |
| 창 분리 URL 쿼리 주입 | Tampering | 쿼리는 필터 값 화이트리스트 파싱(모르는 값 무시) — 서버 권한과 무관 |

## Sources

### Primary (HIGH confidence — 이 세션에 파일을 직접 열람)
- relay: `src/journal/{observer,writer,codec,types,status}.ts` · `src/dma/{envelope,msg-type,session}.ts` · `src/hub/subscription-hub.ts` · `src/ws/fanout.ts` · `src/index.ts` · `tests/journal-observer.test.ts` · `tests/helpers/{frames,fake-gateway}.ts`
- supabase: `migrations/20260924200000_dma_journal_tables.sql` · `20260924200100_dma_journal_rpcs.sql` · `tests/dma_journal_apply.test.sql` · `scripts/verify-dma-orders-price-check.sh`
- server: `routes/orders.ts` · `services/dma-orders.ts` · `schemas/orders.ts` · `app.ts`
- webapp: `today-orders-card.tsx` · `lib/{orders-api,order-notices,use-relay-socket,trading-layout}.ts` · `workbench/shared-panels.tsx` · `card/card-tabs.tsx` · `strategy-log.tsx` · `orderbook/account-panel.tsx` · `app/layout.tsx` · `app/trading/**/page.tsx` · `lib/native/native-detect.ts`
- shared: `journal.ts` · `relay.ts` · `strategy-display.ts` · `index.ts`
- phase 문서: `25-CONTEXT.md` · `reference/*` 전부 · `24-01-PLAN.md` · `19-CONTEXT.md` · `19-VALIDATION.md` · `ROADMAP.md`
- 도구 실측: `flatc --version` · `node` Intl 포맷 · `docker images`

### Secondary (MEDIUM — gh-trade 계획 문서, fbs 미커밋)
- `/Users/alex/repos/gh-trade/.claude/worktrees/phase-25-order-log-progress/.planning/phases/25-order-log-progress/{25-CONTEXT,25-01-PLAN,25-02-PLAN,25-05-PLAN,25-RESEARCH}.md` — 슬롯·타입·enum·resync·수신 대상·Cancelled 매칭

### Tertiary (LOW)
- 없음(웹 검색 미사용 — 외부 라이브러리 도입이 없는 코드베이스 확장 phase)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 새 의존성 0, 기존 버전 실측
- Architecture(relay/DB/웹 결합 지점): HIGH — 전부 파일:줄로 확인
- 와이어 세부(필드 타입·슬롯·strategy_resync·83 수신 대상): MEDIUM — gh-trade 계획 문서 기준, fbs 해시로 확정 필요
- Pitfalls: HIGH(코드 근거) / MEDIUM(A3·A7 은 gh-trade 확인 필요)

**Research date:** 2026-09-29
**Valid until:** gh-trade fbs 커밋 시점(그때 A1·A2·A3 재확인) — 그 외 30일
</content>
</invoke>
