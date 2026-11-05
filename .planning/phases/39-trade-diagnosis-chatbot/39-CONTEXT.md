# Phase 39: 매매진단 챗봇 - Context

**Gathered:** 2026-11-05
**Status:** Ready for planning

<domain>
## Phase Boundary

기존 팀장 챗봇(Phase 14 — Anthropic Messages API tool use · 팀장 Sonnet 5 + 전문가 5 · `server/src/services/chat-service.ts` · `chat-orchestrator.ts`)에 **읽기 전용 「주문 진단」 전문가** 하나를 추가해, 사용자가 「왜 이 주문이 나갔나 / 안 나갔나」를 운영자 중계 없이 챗봇에 직접 묻는다. 전문가는 `claude-opus-5-5`(env `CHAT_DIAGNOSIS_MODEL`) 로 자기 도구 루프를 돌리며 ① 저널 주문·체결 ② 전략 이벤트(발주 사유·조건 실측) ③ 시세 전문(체결 A3 + 호가 B6 · 오늘은 tickgw 당일 경로 · 지난 날짜는 Phase 37 격자) ④ kind 9 「상태전이」 ⑤ 종목 검색 — 전부 조회 전용 · 계좌 범위는 `req.userId` 서버 강제. 함께 **kind 9 「상태전이」 43칸 매핑 노트**를 `scripts/trade-handoff.sh` 로 gh-trade 인박스에 회신하고, kind 9 를 **받는 쪽**(DB 라벨 · 가시성 RPC · relay 통과 · 웹 주문로그 탭 표시 · 챗봇 도구)까지 이번에 만들어 둔다. 적재 실증(시험 문항 ③)만 gh-trade 서버 배포 뒤 UAT 로 미룬다.

**로드맵에서 이미 잠긴 것(재론 금지):** 진단 전문가 모델 Opus 5.5 · thinking 항상 켜짐이라 `output_config.effort` 명시 · 강제 `tool_choice` 금지 · 팀장·다른 전문가는 Sonnet 5 유지 · 공유 계좌 상호 노출 허용(웹 조회 RPC 범위 그대로) · 모델 입력에 계좌 선택 인자 없음 · 진단 조회는 RPC 1회로 묶기 · kind 9 1차 = 설정 변경 이력 + 서버 자동 꺼짐/켜짐 · 사람/서버 구분은 kind 하나에 `reason_code` · 와이어(StockDMA.fbs) 무변경(StrategyEventKind 값만 채움) · 배포 순서 gh-trade 서버 → gh-radar DB → relay → webapp.

**밖:** 주문 실행·설정 변경 등 쓰기 도구 · Claude CLI/Agent SDK 서버 상주 · 새 대화 UI(별도 모드) · kind 9 2차 항목의 gh-trade 구현 요청(노트에는 적는다 · D-11).

</domain>

<decisions>
## Implementation Decisions

### 진단 전문가의 자리 (D-01 ~ D-04)
- **D-01: 팀장의 도구 하나 + 전문가 원문 그대로 전달.** 기존 5 전문가와 같이 `SPECIALIST_TOOL_NAMES` 에 `diagnosis` 를 더해 팀장(Sonnet)이 `consult_diagnosis_specialist` 로 부른다. 단, 진단 전문가가 쓴 **진단문은 팀장이 요약·재서술하지 않고 그대로 싣는다** — 팀장은 머리말·꼬리말 한두 줄만. 구현 방식(팀장 프롬프트 지시 vs tool_result 를 서버가 바로 SSE text 로 흘리고 팀장에겐 「그대로 실었다」 는 짧은 결과만 주기 등)은 리서치·플래너 재량이되, 결과적으로 사용자 화면에 보이는 진단문의 시각(ms)·수량·조건 문구가 전문가 출력과 **글자 그대로 일치**해야 한다(시험 문항 자동 판정 근거). 「매매진단」 별도 대화 모드 기각(새 UI·새 SSE 경로·대화 저장 분리 비용). — **Reversibility:** reversible.
- **D-02: 전문가는 질문 원문만 받고 날짜·종목·시각·주문 특정을 전부 스스로 한다.** 팀장이 넘기는 tool 인자는 `question`(원문 · 필요하면 직전 대화 맥락 요약) 하나다 — 기존 `code` 인자는 쓰지 않는다. 그래서 전문가 안 도구에 **종목 검색**(이름/코드 → ISIN·코드 · 기존 전역 검색 재사용)이 하나 더 들어간다. 날짜가 없으면 오늘(KST), 종목이 없으면 그날 그 사용자 가시 계좌의 주문 전체를 받아 질문의 시각·구분(선/줄/후매수·매도)으로 좁힌다. 「오늘 선매수 왜 하나도 안 나갔어?」 같은 주문 없는 질문도 같은 경로로 답한다. — **Reversibility:** reversible.
- **D-03: 진단 중 화면 표시는 기존 동형 — 전문가 이름 한 줄만.** SSE `agent_start`/`agent_end` 에 `diagnosis` 라벨(「주문 진단 전문가」 류 · 문구는 UI-SPEC/재량)만 추가하고, 전문가 안의 하위 조회 단계는 화면에 내보내지 않는다(서버 로그에는 도구별 호출·토큰을 남긴다 · 성공 기준 3). 수십 초 걸릴 수 있음은 받아들인다. — **Reversibility:** reversible.
- **D-04: 답의 꼴은 자유 서술 — 단 결론 · 시간순 근거 · 틱뷰어 링크를 「가능하면」 넣도록 프롬프트에 권고한다(강제 형식 아님).** 권고 꼴: 첫 한두 줄 결론 → 시각 순서 근거 줄(시각 ms · 무슨 일 · 출처: 주문로그/시세/설정이력) → 끝에 그 종목·날짜·시각으로 열리는 `/analytics/ticks?isin=&d=&ex=&t=` 「틱 보기 ›」 링크(Phase 37 D-18 URL 꼴 · Phase 38 우리 주문 표시와 이어진다). 「왜 안 나갔나」처럼 가정을 여러 개 따지는 질문은 전문가가 꼴을 바꿔도 된다. 링크를 웹이 클릭 가능하게 렌더링하는 방식(마크다운 링크 허용 범위 · 내부 경로만)은 재량.

### 시세 조회 방식 (D-05 ~ D-08)
- **D-05: 시세는 전문가가 직접 부른다 — 인자 (종목, 거래소, 날짜, 시각 시작, 시각 끝), 서버가 창을 최대 N초 · 전문 M건으로 자른다.** 이벤트 시각 ±N초 자동 첨부(기각 — 주문 없던 시간대를 못 봄) · 제한 없음(기각 — 컨텍스트 초과). N · M 수치는 리서치가 A3+B6 한 줄 토큰 실측으로 정한다(출발점 체결 60초 · 호가 포함이라 더 보수적으로). 상한을 넘는 요청은 자르고 도구 응답에 「잘렸음 · 범위 좁혀 다시」 를 적어 전문가가 재요청하게 한다. 한 질문당 시세 도구 호출 횟수 상한도 둔다(재량). — **Reversibility:** reversible.
- **D-06: 시세 전문은 원본 한 줄씩 — 해석은 전문가가 한다.** A3 한 건 = 한 줄(시각 ms · 가격 · 수량 · bs · 누적 거래량 · 세션 구분 등), B6 한 건 = 한 줄(시각 · 매도/매수 1~n단 가격·잔량 요지). 서버가 버스트 묶기·단일가 판정·팀 판정을 미리 해서 요약 표로 주는 안(기각 — Opus 가 원본 조각을 개별로 따질 수 없음). 대신 **지식 프롬프트에 해석 규칙을 명시**: 「단일가 체결 bs 공백 `' '` = 선매수 A3 판정·누적 제외」 · 「0/0 조각 = 한 주문의 마지막 아닌 조각 · 마지막 조각만 호가가 실린다」 · 스윕 = 연속 조각이 여러 가격을 훑음 · 서버 선매수 A3 판정은 bs `'2'` 만 본다(gh-trade `docs/analysis/krx-a3-zero-quote.md` 요지). 디코딩은 Phase 37 `packages/shared/src/krxTick.ts` 를 재사용(새 디코더 금지). — **Reversibility:** reversible.
- **D-07: 체결(A3) + 호가(B6) 를 늘 같이, 시간순으로 섞어 준다.** 「스윕호가변경(체결가==스윕감시가 && 변경횟수>=최소)」 같은 호가 조건의 실측을 설명하려면 호가 변화가 필요하다는 사용자 판단. 종류 인자(체결만/체결+호가)는 두지 않는다. 호가가 건당 글자가 많으므로 D-05 의 N · M 은 혼합 기준으로 잡는다. — **Reversibility:** reversible.
- **D-08: 시세를 못 받을 때.** ① **오늘**(장 시작 전 · tickgw 당일 경로 꺼짐(`TICKS_LIVE_UNAVAILABLE`/`UNREACHABLE`) · 그 종목 미기록) → 주문·체결·전략 이벤트(조건 실측 필드 포함)만으로 답하고 답 안에 **「시세 전문은 받지 못해 주문로그 기준으로 판단」 한 줄을 반드시** 넣는다. 도구 응답에 「자료 없음 · 이유」 를 명시해 거짓 시세를 짓지 못하게 한다. ② **지난 날짜 미변환 격자** → 챗봇이 틱뷰어의 변환 요청(`POST /api/ticks/convert` 와 같은 RPC `should_trigger` 경로 · 하루 상한 `TICK_REQUEST_DAILY_CAP` 공유 · (날짜, 거래소)당 Job 1회)을 걸고 **기다리지 않고** 「변환 중 · 약 N분 뒤 다시 물어 주세요」 로 답한다(주문로그 기준 잠정 답은 함께 줘도 된다). 변환 상한에 걸리면(429) 「오늘 변환 한도 소진」 을 밝힌다. — **Reversibility:** reversible.

### kind 9 「상태전이」 (D-09 ~ D-11)
- **D-09: 매핑 노트에 1차 · 2차를 모두 적고, gh-trade 구현 요청은 1차만.** 43칸 배치와 `reason_code` 대역을 한 번에 설계해 나중에 2차를 넣을 때 번호 충돌·재협의가 없게 한다. 1차 = 설정 변경 이력(누가 · 언제 · 어느 그룹(선/줄/후매수 · 매도 · 취소 · 위험도 · SOR) ON/OFF · 주요 값 전후 — 서버 로그 「설정 갱신 … 마스크=0x…」 줄이 원천) + 서버 자동 상태전이(선매수 1회 발주 뒤 꺼짐 · 마스터 해제 · 줄매수 자동 재체크 · 후매수 잠금해제/발동 · 위험도 래치 켜짐/리셋/발동). 2차(노트에만 · 「2차 · 이번 구현 제외」 표기) = 진입 래치(매도·취소 진입 확인) · 발주 게이트 차단(세션 가드 · 게이트 소진) · VI 미발주 사유. 노트는 `scripts/trade-handoff.sh chatbot-kind9-mapping` 류로 만들고 플랜 초반(37 D-21 동형 — 응답을 기다리는 동안 챗봇을 만든다)에 보낸다 · 커밋은 gh-trade 세션. 인박스 `261105-chatbot-diagnosis-kind9.md` 는 노트 발송 커밋으로 `status: done` 처리. — **Reversibility:** costly — gh-trade 와 합의되는 외부 계약(칸 배치 · reason_code 번호)이라 보낸 뒤 바꾸면 양쪽 재작업.
- **D-10: 웹 주문로그 탭 — 같은 목록에 시간순으로 섞고, 종류 필터에 「상태전이」 추가.** `packages/shared/src/strategy-event-labels.ts` 의 `STRATEGY_EVENT_KIND_LABELS` 에 kind 9 라벨 · `reason_code` → 문구 사전(「선매수 꺼짐(1회 발주)」 · 「설정 재제출 · 선매수 켜짐(milles)」 류 · gh-trade 가 돌려줄 구현 노트의 낱말 그대로)을 보태고, 행은 발주 행과 살짝 다르게(회색 줄 · 방향 색 없음 — `strategyEventSide` 는 null). 별도 「설정 이력」 목록 기각 · 웹 표시 미루기 기각(로드맵 성공 기준 4 유지). 세부 모양은 UI-SPEC. — **Reversibility:** reversible.
- **D-11: phase 완료 선 = 챗봇 + 노트 발송 + kind 9 받는 쪽까지 만들어 둠.** 받는 쪽 = DB(라벨 · `dma_strategy_events_for_user_json` 류 가시성 RPC 가 kind 9 를 돌려줌 · 챗봇 진단 RPC 포함) · relay(미지 kind 무시가 아니라 통과 — 와이어 무변경이라 StrategyEventKind 값만) · webapp(D-10) · 챗봇 도구(④ 상태전이 조회 — kind 9 가 없으면 「상태전이 기록 없음(아직 미적재)」 로 답). 시험 문항 ①·② 는 이번 UAT 에서 통과시키고, ③(13:10:25 설정 재제출로 선매수 다시 켜짐)은 gh-trade 서버 배포·적재 뒤 UAT 추가 항목으로 남긴다 — phase 를 열어 두지 않는다. — **Reversibility:** reversible.

### 지난 날짜 시세 (D-12)
- **D-12: 지난 날짜도 연다 — 격자 있으면 읽고, 없으면 변환 요청(D-08 ②).** 로드맵 미결 ④ 「1차 오늘만」 은 **취소**. 주문·이벤트 조회는 날짜 제한 없음, 시세는 격자 보존 기간(Phase 37 D-04 · 90일) 안이면 격자(서명 URL 읽기 → 서버가 디코드 · D-06) · 없으면 변환 요청 · 90일 밖은 변환 요청으로 재생성(37 D-04 와 동일 규칙). 오늘은 tickgw 당일 경로(`/api/ticks/live` 와 같은 서버 캐시 — 종목당 1줄 · 사용자 수 독립). 어제 질문이 오늘 들어오는 일이 흔하다는 사용자 판단. — **Reversibility:** reversible.

### Claude's Discretion
- **전문가 내부 도구 루프 설계** — 라운드 상한 · `output_config.effort` 값 · `max_tokens` · 도구 결과 토큰 예산 · 도구 응답 포맷(JSON vs 고정폭 텍스트) · 종목 검색 도구의 범위(상장 종목 사전) · 지식 프롬프트 길이(`docs/trading-rules.md` · `docs/strategy/limit-chaser.md` 요약 정도 · 캐시 `cache_control`).
- **진단 조회 RPC 모양** — 저널 주문·체결(`dma_journal_orders_for_user_json` · `dma_order_events_for_user`) + 전략 이벤트(`dma_strategy_events_for_user_json` kind 3·6·9 등)를 **RPC 1회**로 묶은 `dma_diagnosis_for_user` 류 신설 vs 기존 RPC 조합(Cloud Run 왕복 비용 메모리 — 다중 쿼리 지양). 인자 (user · 날짜 · [isin]) · 가시성 `dma_visible_accounts` · 켜진 서버 조인은 Phase 38 D-01/D-03/D-14 동형. service_role 전용 · REVOKE anon/authenticated 명시.
- **시세 도구 서버 구현** — 당일: `/api/ticks/live` 가 쓰는 tickgw 중계·서버 캐시를 서비스 함수로 꺼내 쓰기 · 과거: 격자 다운로드를 서버가 수행(브라우저 경유 없음) · 디코드 `krxTick.ts` · 시각 창 슬라이싱 · 한 줄 포맷 · N · M 수치 · 호출 횟수 상한.
- **「원문 그대로 전달」 구현 경로**(D-01) · 팀장 프롬프트 수정 범위 · 진단 전문가가 다른 전문가(시세·뉴스)와 같은 턴에 병렬 호출될 때의 처리 · 대화 저장 블록 형식 · 틱뷰어 링크 렌더링.
- **kind 9 43칸 세부 배치**(필드 이름 · 전후 값 인코딩 · 사용자 식별 문자열) — 노트 초안은 리서치가 gh-trade `StockDMA.fbs` StrategyEvent 필드와 서버 로그 「설정 갱신」 줄 포맷을 읽고 짓는다.
- **비용 가드** — 진단 한 건 토큰 상한 · 사용자별 일일 진단 횟수(기존 `chatRateLimit` 재사용 여부) · `[chat] usage` 로그에 모델별(Opus/Sonnet) 토큰 분리 기록 방식.
- **시험 문항 자동화** — 「11/5 13:10 금양그린파워 선매수 왜 나갔어?」(milles · KB120) 를 통합 테스트로 둘지(실 API 호출 비용) · 도구 단위 테스트(계좌 범위 강제 · 다른 사용자 계좌 조회 불가)는 필수.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 요구 · 계약
- `.planning/ROADMAP.md` §Phase 39 — 목표 · 성공 기준 5 · 잠긴 결정(모델 · 계좌 범위 · kind 9 1차 범위 · 배포 순서).
- `docs/inbox/from-gh-trade/261105-chatbot-diagnosis-kind9.md` — gh-trade 인계 원문: 동기 사례(11/5 milles 금양그린파워 타임라인 · 시험 문항) · kind 9 후보 목록 · 질문 3 · 배포 순서 제약. 노트 발송 커밋으로 `status: done` + `done_commit` 처리.
- `docs/inbox/from-gh-trade/README.md` — 인박스 처리 형식 정본.
- `scripts/trade-handoff.sh` + `docs/inbox/trade-handoff-template.md` — gh-trade 인박스 노트 생성기(커밋은 gh-trade 세션).
- `../gh-trade/docs/inbox/from-gh-radar/README.md` — 회신 노트 형식 정본(gh-trade 소유).

### 매매 지식(진단 전문가 시스템 프롬프트 원천)
- `../gh-trade/docs/trading-rules.md` — 상따 매매 규칙 정본(요약해 프롬프트에).
- `../gh-trade/docs/strategy/limit-chaser.md` — 선/줄/후매수 · 조건(스윕호가변경 등) 정의.
- `../gh-trade/docs/analysis/krx-a3-zero-quote.md` — 「0/0 조각 = 한 주문의 마지막 아닌 조각」 · 단일가 bs 공백 · §2 묶기 · §3/§4 판정.
- `packages/shared/src/strategy-event-labels.ts` — kind · group · 조건 · reason_code 낱말 사전(진단문도 이 낱말을 쓴다 · kind 9 라벨 추가 위치).

### 기존 챗봇 구조
- `server/src/services/chat-service.ts` — 팀장 tool-use 루프 · SSE 이벤트 · `[chat] usage` 로그 · 재시도.
- `server/src/services/chat-orchestrator.ts` — `SPECIALIST_TOOLS` 정의 · `runSpecialist` 디스패치 · `toolNameToSpecialistId`.
- `server/src/services/chat-prompts.ts` — 팀장 · 전문가 프롬프트.
- `server/src/services/specialists/limitup-specialist.ts` — 전문가 패턴(데이터 선조회 → 1콜 · 무로그 fail-safe 금지 로깅).
- `server/src/services/specialists/anthropic-client.ts` — 공유 Anthropic 클라이언트.
- `server/src/config.ts` §Phase 14 — `CHAT_*` env(여기에 `CHAT_DIAGNOSIS_MODEL` 추가).
- `server/src/routes/chat.ts` — `chatRateLimit → requireAuth() → requireDmaMapped()` 순서 · `req.userId`.
- `packages/shared/src/chat.ts` — `SpecialistId` · `SPECIALIST_TOOL_NAMES` · `SPECIALIST_LABELS` · SSE 이벤트 타입.
- `webapp/src/components/chat/agent-progress.tsx` — 진행 표시 라벨(diagnosis 추가).

### 데이터 경로
- `supabase/migrations/20261004090000_dma_journal_orders_for_user_json.sql` · `20260929180200_dma_strategy_read_rpcs.sql` · `20261006090000_dma_strategy_events_limit_feature.sql` — 저널 · 전략 이벤트 사용자 범위 RPC(가시성 조인 선례).
- `server/src/routes/ticks.ts` — `/live`(tickgw 중계 · 사용자별 60초 게이트 캐시) · `/open`(격자 서명 URL) · `/own`(RPC 1회 · Phase 38 D-14) · `/convert`(should_trigger · 하루 상한).
- `packages/shared/src/krxTick.ts` — A3/B6 디코더(Phase 37 D-19 · 재사용).
- `.planning/phases/38-own-orders-on-ticks/38-CONTEXT.md` D-01 · D-03 · D-14 — 가시성 · 켜진 서버 · RPC 1회 원칙.
- `.planning/phases/37-tick-viewer/37-CONTEXT.md` D-03 · D-04 · D-07 · D-18 — 요청 변환 · 90일 보존 · 종목당 1줄 캐시 · URL 꼴.

### 운영 기준
- `CLAUDE.md` §공식 API 운영 기준 · §스크래핑 5원칙 — 호출량 사용자 수 독립 · on-demand 원본 fetch 금지(성공 기준 5).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **팀장 tool-use 루프**(`chat-service.ts`): `SPECIALIST_TOOLS` 에 도구 하나 추가 + `runSpecialist` switch 한 갈래로 전문가가 붙는다. `agent_start`/`agent_end` SSE · `SPECIALIST_LABELS` 매핑도 그대로.
- **전문가 공통 헬퍼**(`specialists/helpers.ts` · `anthropic-client.ts`): `specialistText` · `SPECIALIST_UNAVAILABLE` · 공유 클라이언트.
- **사용자 범위 RPC 선례**: `dma_journal_orders_for_user_json(p_user_id, p_trade_date)` · `dma_strategy_events_for_user_json` · Phase 38 `tick_own_for_user`(가시성 + 켜진 서버 + 이벤트를 RPC 1회로).
- **틱 디코더 · 당일 중계 · 격자 열기**(Phase 37/38): `krxTick.ts` · `/api/ticks/live` 캐시 · `/open` 서명 URL · `/convert` should_trigger.
- **라벨 사전** `strategy-event-labels.ts`: 진단문 · 웹 kind 9 행이 같은 낱말을 쓴다.

### Established Patterns
- 기존 전문가는 전부 「데이터 선조회 → Sonnet 1콜 · `thinking: disabled`」 — **전문가 안 도구 루프는 없다.** 진단 전문가는 이 저장소 첫 「도구 가진 전문가」 패턴이 된다(Opus · thinking 켜짐 · `output_config.effort` · 다중 라운드).
- 무로그 fail-safe 금지 — 빈 텍스트 · 절단 시 `stop_reason` · `usage` 포함 경고(프로젝트 lesson).
- RPC 는 service_role 전용 · `REVOKE anon/authenticated` 명시 · `p_user_id = req.userId` 하나(T-19-17).
- 챗 라우트는 `requireDmaMapped()` 라 진단 사용자는 전부 DMA 매핑 사용자(틱뷰어 게이트와 같은 집합).

### Integration Points
- `packages/shared/src/chat.ts` `SpecialistId` 유니온 + 두 사전에 `diagnosis` 추가 → `agent-progress.tsx` 라벨 · 테스트 갱신.
- `server/src/config.ts` `chatDiagnosisModel`(`CHAT_DIAGNOSIS_MODEL` · 기본 `claude-opus-5-5`).
- 새 전문가 파일 `server/src/services/specialists/diagnosis-specialist.ts`(+ 도구 구현 모듈) · 프롬프트는 `chat-prompts.ts`.
- DB: 진단 RPC(신설 or 기존 조합) · kind 9 라벨/가시성 반영 마이그레이션.
- 웹 주문로그 탭: kind 9 행 + 필터 「상태전이」.
- gh-trade 인박스: `../gh-trade/docs/inbox/from-gh-radar/YYMMDD-<slug>.md` 노트.

</code_context>

<specifics>
## Specific Ideas

- **시험 문항(성공 기준 1 · 인박스 「확인 방법」):** 「11/5 13:10 금양그린파워 선매수 왜 나갔어?」(milles · KB120) → ① 발주 사유 `PreBuy A3 스윕호가변경(체결가==스윕감시가 && 변경횟수>=최소)` 임계 3 · 체결량 조건 아님 ② 13:10:29.302 VI 해제 단일가 160,463주 @10,100 은 bs 공백이라 판정·누적 제외 ③ 13:10:25 설정 재제출로 선매수가 다시 켜짐(13:08:18 VI 발주로 꺼졌었음 · kind 9). 이번 UAT 는 ①·②, ③ 은 kind 9 적재 뒤.
- 사용자 원문: 답은 「자유 서술하되, 결론/시간순 근거/틱뷰어 링크는 가능하면 넣어주면 좋겠다」.
- 진단문은 팀장이 손대지 않는다 — 시각·수량이 요약 과정에서 뒤틀리는 걸 막는 것이 목적.
- 호가(B6)는 늘 포함 — 「스윕호가변경」 같은 호가 조건 실측을 체결만으로는 설명 못 한다는 사용자 판단.
- 시세가 없을 때 거짓 시세를 짓지 않도록 도구 응답에 「자료 없음 · 이유」 를 명시하고 답에 「시세 없이 판단」 한 줄을 반드시 남긴다.

</specifics>

<deferred>
## Deferred Ideas

- **kind 9 2차 구현**(진입 래치 · 발주 게이트 차단 · VI 미발주 사유) — 매핑 노트에는 적되 gh-trade 구현 요청은 다음 phase(D-09).
- **진단 중 하위 조회 단계 표시 / 접힘 근거 목록** — 이번엔 전문가 이름 한 줄만(D-03). 체감이 나쁘면 후속.
- **「매매진단」 별도 대화 모드** — 기각(D-01). 후속 질문 흐름이 팀장 경유로 불편하면 재검토.

</deferred>

---

*Phase: 39-trade-diagnosis-chatbot*
*Context gathered: 2026-11-05*
