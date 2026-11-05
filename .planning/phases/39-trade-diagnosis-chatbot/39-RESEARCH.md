# Phase 39: 매매진단 챗봇 - Research

**Researched:** 2026-11-05
**Domain:** Anthropic Messages API tool-use(전문가 안 도구 루프 · Opus 5.5) · Supabase 사용자 범위 RPC · 시세 전문(A3/B6) 서버 디코드 · gh-trade StrategyEvent kind 9 계약 · 웹 주문로그 탭
**Confidence:** HIGH(코드 · 스키마 · 계약은 이번 세션에 원문을 읽음) / MEDIUM(토큰 수치 · 비용 추정)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**로드맵에서 이미 잠긴 것(재론 금지):** 진단 전문가 모델 Opus 5.5 · thinking 항상 켜짐이라 `output_config.effort` 명시 · 강제 `tool_choice` 금지 · 팀장·다른 전문가는 Sonnet 5 유지 · 공유 계좌 상호 노출 허용(웹 조회 RPC 범위 그대로) · 모델 입력에 계좌 선택 인자 없음 · 진단 조회는 RPC 1회로 묶기 · kind 9 1차 = 설정 변경 이력 + 서버 자동 꺼짐/켜짐 · 사람/서버 구분은 kind 하나에 `reason_code` · 와이어(StockDMA.fbs) 무변경(StrategyEventKind 값만 채움) · 배포 순서 gh-trade 서버 → gh-radar DB → relay → webapp.

**밖:** 주문 실행·설정 변경 등 쓰기 도구 · Claude CLI/Agent SDK 서버 상주 · 새 대화 UI(별도 모드) · kind 9 2차 항목의 gh-trade 구현 요청(노트에는 적는다 · D-11).

#### 진단 전문가의 자리 (D-01 ~ D-04)
- **D-01: 팀장의 도구 하나 + 전문가 원문 그대로 전달.** 기존 5 전문가와 같이 `SPECIALIST_TOOL_NAMES` 에 `diagnosis` 를 더해 팀장(Sonnet)이 `consult_diagnosis_specialist` 로 부른다. 단, 진단 전문가가 쓴 **진단문은 팀장이 요약·재서술하지 않고 그대로 싣는다** — 팀장은 머리말·꼬리말 한두 줄만. 구현 방식(팀장 프롬프트 지시 vs tool_result 를 서버가 바로 SSE text 로 흘리고 팀장에겐 「그대로 실었다」 는 짧은 결과만 주기 등)은 리서치·플래너 재량이되, 결과적으로 사용자 화면에 보이는 진단문의 시각(ms)·수량·조건 문구가 전문가 출력과 **글자 그대로 일치**해야 한다(시험 문항 자동 판정 근거). 「매매진단」 별도 대화 모드 기각(새 UI·새 SSE 경로·대화 저장 분리 비용). — **Reversibility:** reversible.
- **D-02: 전문가는 질문 원문만 받고 날짜·종목·시각·주문 특정을 전부 스스로 한다.** 팀장이 넘기는 tool 인자는 `question`(원문 · 필요하면 직전 대화 맥락 요약) 하나다 — 기존 `code` 인자는 쓰지 않는다. 그래서 전문가 안 도구에 **종목 검색**(이름/코드 → ISIN·코드 · 기존 전역 검색 재사용)이 하나 더 들어간다. 날짜가 없으면 오늘(KST), 종목이 없으면 그날 그 사용자 가시 계좌의 주문 전체를 받아 질문의 시각·구분(선/줄/후매수·매도)으로 좁힌다. 「오늘 선매수 왜 하나도 안 나갔어?」 같은 주문 없는 질문도 같은 경로로 답한다. — **Reversibility:** reversible.
- **D-03: 진단 중 화면 표시는 기존 동형 — 전문가 이름 한 줄만.** SSE `agent_start`/`agent_end` 에 `diagnosis` 라벨(「주문 진단 전문가」 류 · 문구는 UI-SPEC/재량)만 추가하고, 전문가 안의 하위 조회 단계는 화면에 내보내지 않는다(서버 로그에는 도구별 호출·토큰을 남긴다 · 성공 기준 3). 수십 초 걸릴 수 있음은 받아들인다. — **Reversibility:** reversible.
- **D-04: 답의 꼴은 자유 서술 — 단 결론 · 시간순 근거 · 틱뷰어 링크를 「가능하면」 넣도록 프롬프트에 권고한다(강제 형식 아님).** 권고 꼴: 첫 한두 줄 결론 → 시각 순서 근거 줄(시각 ms · 무슨 일 · 출처: 주문로그/시세/설정이력) → 끝에 그 종목·날짜·시각으로 열리는 `/analytics/ticks?isin=&d=&ex=&t=` 「틱 보기 ›」 링크(Phase 37 D-18 URL 꼴 · Phase 38 우리 주문 표시와 이어진다). 「왜 안 나갔나」처럼 가정을 여러 개 따지는 질문은 전문가가 꼴을 바꿔도 된다. 링크를 웹이 클릭 가능하게 렌더링하는 방식(마크다운 링크 허용 범위 · 내부 경로만)은 재량.

#### 시세 조회 방식 (D-05 ~ D-08)
- **D-05: 시세는 전문가가 직접 부른다 — 인자 (종목, 거래소, 날짜, 시각 시작, 시각 끝), 서버가 창을 최대 N초 · 전문 M건으로 자른다.** 이벤트 시각 ±N초 자동 첨부(기각 — 주문 없던 시간대를 못 봄) · 제한 없음(기각 — 컨텍스트 초과). N · M 수치는 리서치가 A3+B6 한 줄 토큰 실측으로 정한다(출발점 체결 60초 · 호가 포함이라 더 보수적으로). 상한을 넘는 요청은 자르고 도구 응답에 「잘렸음 · 범위 좁혀 다시」 를 적어 전문가가 재요청하게 한다. 한 질문당 시세 도구 호출 횟수 상한도 둔다(재량). — **Reversibility:** reversible.
- **D-06: 시세 전문은 원본 한 줄씩 — 해석은 전문가가 한다.** A3 한 건 = 한 줄(시각 ms · 가격 · 수량 · bs · 누적 거래량 · 세션 구분 등), B6 한 건 = 한 줄(시각 · 매도/매수 1~n단 가격·잔량 요지). 서버가 버스트 묶기·단일가 판정·팀 판정을 미리 해서 요약 표로 주는 안(기각 — Opus 가 원본 조각을 개별로 따질 수 없음). 대신 **지식 프롬프트에 해석 규칙을 명시**: 「단일가 체결 bs 공백 `' '` = 선매수 A3 판정·누적 제외」 · 「0/0 조각 = 한 주문의 마지막 아닌 조각 · 마지막 조각만 호가가 실린다」 · 스윕 = 연속 조각이 여러 가격을 훑음 · 서버 선매수 A3 판정은 bs `'2'` 만 본다(gh-trade `docs/analysis/krx-a3-zero-quote.md` 요지). 디코딩은 Phase 37 `packages/shared/src/krxTick.ts` 를 재사용(새 디코더 금지). — **Reversibility:** reversible.
- **D-07: 체결(A3) + 호가(B6) 를 늘 같이, 시간순으로 섞어 준다.** 「스윕호가변경(체결가==스윕감시가 && 변경횟수>=최소)」 같은 호가 조건의 실측을 설명하려면 호가 변화가 필요하다는 사용자 판단. 종류 인자(체결만/체결+호가)는 두지 않는다. 호가가 건당 글자가 많으므로 D-05 의 N · M 은 혼합 기준으로 잡는다. — **Reversibility:** reversible.
- **D-08: 시세를 못 받을 때.** ① **오늘**(장 시작 전 · tickgw 당일 경로 꺼짐(`TICKS_LIVE_UNAVAILABLE`/`UNREACHABLE`) · 그 종목 미기록) → 주문·체결·전략 이벤트(조건 실측 필드 포함)만으로 답하고 답 안에 **「시세 전문은 받지 못해 주문로그 기준으로 판단」 한 줄을 반드시** 넣는다. 도구 응답에 「자료 없음 · 이유」 를 명시해 거짓 시세를 짓지 못하게 한다. ② **지난 날짜 미변환 격자** → 챗봇이 틱뷰어의 변환 요청(`POST /api/ticks/convert` 와 같은 RPC `should_trigger` 경로 · 하루 상한 `TICK_REQUEST_DAILY_CAP` 공유 · (날짜, 거래소)당 Job 1회)을 걸고 **기다리지 않고** 「변환 중 · 약 N분 뒤 다시 물어 주세요」 로 답한다(주문로그 기준 잠정 답은 함께 줘도 된다). 변환 상한에 걸리면(429) 「오늘 변환 한도 소진」 을 밝힌다. — **Reversibility:** reversible.

#### kind 9 「상태전이」 (D-09 ~ D-11)
- **D-09: 매핑 노트에 1차 · 2차를 모두 적고, gh-trade 구현 요청은 1차만.** 43칸 배치와 `reason_code` 대역을 한 번에 설계해 나중에 2차를 넣을 때 번호 충돌·재협의가 없게 한다. 1차 = 설정 변경 이력(누가 · 언제 · 어느 그룹(선/줄/후매수 · 매도 · 취소 · 위험도 · SOR) ON/OFF · 주요 값 전후 — 서버 로그 「설정 갱신 … 마스크=0x…」 줄이 원천) + 서버 자동 상태전이(선매수 1회 발주 뒤 꺼짐 · 마스터 해제 · 줄매수 자동 재체크 · 후매수 잠금해제/발동 · 위험도 래치 켜짐/리셋/발동). 2차(노트에만 · 「2차 · 이번 구현 제외」 표기) = 진입 래치(매도·취소 진입 확인) · 발주 게이트 차단(세션 가드 · 게이트 소진) · VI 미발주 사유. 노트는 `scripts/trade-handoff.sh chatbot-kind9-mapping` 류로 만들고 플랜 초반(37 D-21 동형 — 응답을 기다리는 동안 챗봇을 만든다)에 보낸다 · 커밋은 gh-trade 세션. 인박스 `261105-chatbot-diagnosis-kind9.md` 는 노트 발송 커밋으로 `status: done` 처리. — **Reversibility:** costly — gh-trade 와 합의되는 외부 계약(칸 배치 · reason_code 번호)이라 보낸 뒤 바꾸면 양쪽 재작업.
- **D-10: 웹 주문로그 탭 — 같은 목록에 시간순으로 섞고, 종류 필터에 「상태전이」 추가.** `packages/shared/src/strategy-event-labels.ts` 의 `STRATEGY_EVENT_KIND_LABELS` 에 kind 9 라벨 · `reason_code` → 문구 사전(「선매수 꺼짐(1회 발주)」 · 「설정 재제출 · 선매수 켜짐(milles)」 류 · gh-trade 가 돌려줄 구현 노트의 낱말 그대로)을 보태고, 행은 발주 행과 살짝 다르게(회색 줄 · 방향 색 없음 — `strategyEventSide` 는 null). 별도 「설정 이력」 목록 기각 · 웹 표시 미루기 기각(로드맵 성공 기준 4 유지). 세부 모양은 UI-SPEC. — **Reversibility:** reversible.
- **D-11: phase 완료 선 = 챗봇 + 노트 발송 + kind 9 받는 쪽까지 만들어 둠.** 받는 쪽 = DB(라벨 · `dma_strategy_events_for_user_json` 류 가시성 RPC 가 kind 9 를 돌려줌 · 챗봇 진단 RPC 포함) · relay(미지 kind 무시가 아니라 통과 — 와이어 무변경이라 StrategyEventKind 값만) · webapp(D-10) · 챗봇 도구(④ 상태전이 조회 — kind 9 가 없으면 「상태전이 기록 없음(아직 미적재)」 로 답). 시험 문항 ①·② 는 이번 UAT 에서 통과시키고, ③(13:10:25 설정 재제출로 선매수 다시 켜짐)은 gh-trade 서버 배포·적재 뒤 UAT 추가 항목으로 남긴다 — phase 를 열어 두지 않는다. — **Reversibility:** reversible.

#### 지난 날짜 시세 (D-12)
- **D-12: 지난 날짜도 연다 — 격자 있으면 읽고, 없으면 변환 요청(D-08 ②).** 로드맵 미결 ④ 「1차 오늘만」 은 **취소**. 주문·이벤트 조회는 날짜 제한 없음, 시세는 격자 보존 기간(Phase 37 D-04 · 90일) 안이면 격자(서명 URL 읽기 → 서버가 디코드 · D-06) · 없으면 변환 요청 · 90일 밖은 변환 요청으로 재생성(37 D-04 와 동일 규칙). 오늘은 tickgw 당일 경로(`/api/ticks/live` 와 같은 서버 캐시 — 종목당 1줄 · 사용자 수 독립). 어제 질문이 오늘 들어오는 일이 흔하다는 사용자 판단. — **Reversibility:** reversible.

### Claude's Discretion
- **전문가 내부 도구 루프 설계** — 라운드 상한 · `output_config.effort` 값 · `max_tokens` · 도구 결과 토큰 예산 · 도구 응답 포맷(JSON vs 고정폭 텍스트) · 종목 검색 도구의 범위(상장 종목 사전) · 지식 프롬프트 길이(`docs/trading-rules.md` · `docs/strategy/limit-chaser.md` 요약 정도 · 캐시 `cache_control`).
- **진단 조회 RPC 모양** — 저널 주문·체결(`dma_journal_orders_for_user_json` · `dma_order_events_for_user`) + 전략 이벤트(`dma_strategy_events_for_user_json` kind 3·6·9 등)를 **RPC 1회**로 묶은 `dma_diagnosis_for_user` 류 신설 vs 기존 RPC 조합(Cloud Run 왕복 비용 메모리 — 다중 쿼리 지양). 인자 (user · 날짜 · [isin]) · 가시성 `dma_visible_accounts` · 켜진 서버 조인은 Phase 38 D-01/D-03/D-14 동형. service_role 전용 · REVOKE anon/authenticated 명시.
- **시세 도구 서버 구현** — 당일: `/api/ticks/live` 가 쓰는 tickgw 중계·서버 캐시를 서비스 함수로 꺼내 쓰기 · 과거: 격자 다운로드를 서버가 수행(브라우저 경유 없음) · 디코드 `krxTick.ts` · 시각 창 슬라이싱 · 한 줄 포맷 · N · M 수치 · 호출 횟수 상한.
- **「원문 그대로 전달」 구현 경로**(D-01) · 팀장 프롬프트 수정 범위 · 진단 전문가가 다른 전문가(시세·뉴스)와 같은 턴에 병렬 호출될 때의 처리 · 대화 저장 블록 형식 · 틱뷰어 링크 렌더링.
- **kind 9 43칸 세부 배치**(필드 이름 · 전후 값 인코딩 · 사용자 식별 문자열) — 노트 초안은 리서치가 gh-trade `StockDMA.fbs` StrategyEvent 필드와 서버 로그 「설정 갱신」 줄 포맷을 읽고 짓는다.
- **비용 가드** — 진단 한 건 토큰 상한 · 사용자별 일일 진단 횟수(기존 `chatRateLimit` 재사용 여부) · `[chat] usage` 로그에 모델별(Opus/Sonnet) 토큰 분리 기록 방식.
- **시험 문항 자동화** — 「11/5 13:10 금양그린파워 선매수 왜 나갔어?」(milles · KB120) 를 통합 테스트로 둘지(실 API 호출 비용) · 도구 단위 테스트(계좌 범위 강제 · 다른 사용자 계좌 조회 불가)는 필수.

### Deferred Ideas (OUT OF SCOPE)
- **kind 9 2차 구현**(진입 래치 · 발주 게이트 차단 · VI 미발주 사유) — 매핑 노트에는 적되 gh-trade 구현 요청은 다음 phase(D-09).
- **진단 중 하위 조회 단계 표시 / 접힘 근거 목록** — 이번엔 전문가 이름 한 줄만(D-03). 체감이 나쁘면 후속.
- **「매매진단」 별도 대화 모드** — 기각(D-01). 후속 질문 흐름이 팀장 경유로 불편하면 재검토.
</user_constraints>

<phase_requirements>
## Phase Requirements

요구 ID 가 매핑되어 있지 않아(ROADMAP `Requirements: TBD`) 성공 기준을 `SC-1`~`SC-5` 로 쓴다.

| ID | Description (ROADMAP §Phase 39 성공 기준) | Research Support |
|----|-------------|------------------|
| SC-1 | 시험 문항 「11/5 13:10 금양그린파워 선매수 왜 나갔어?」(milles · KB120) → ① `PreBuy A3 스윕호가변경` 임계 3 ② 13:10:29.302 VI 해제 단일가 160,463주 bs 공백 판정 제외 ③ 13:10:25 설정 재제출로 선매수 다시 켜짐(kind 9) — kind 9 적재 전 ①·② | §Pattern 2(내부 루프) · §Pattern 4(진단 RPC — `reason_code` · `cond_threshold`/`cond_actual` 원문) · §Pattern 5(시세 한 줄 포맷 — `bs` · `session_id`) · §Pattern 8(지식 프롬프트 해석 규칙) · §Validation 「UAT 수동」 |
| SC-2 | 진단 도구 전부 읽기 전용 · 계좌 범위 `req.userId` 서버 강제 · 모델 입력에 계좌 선택 인자 없음 · 다른 사용자 계좌 조회 불가(테스트) | §Pattern 3(도구 스키마에 계좌 칸 0 · `DiagnosisContext.userId` 클로저) · §Pattern 4(RPC `dma_visible_accounts` · 어드민 우회 없음) · pgTAP + vitest |
| SC-3 | 진단 전문가 `claude-opus-5-5` · 나머지 `claude-sonnet-5` · `[chat] usage` 로그에 모델별 토큰 | §Pattern 1(등록 · `chatDiagnosisModel`) · §Pattern 6(usage 집계 `models` 맵) |
| SC-4 | kind 9 매핑 노트 gh-trade 인박스 `status: open` · 받는 쪽(DB 가시성 RPC → relay → webapp 주문로그 탭) · 와이어 무변경 | §Pattern 9(43칸 초안) · §Pattern 10(웹) · 「relay 무변경」 실측 |
| SC-5 | 챗봇 질의 비용은 사용자 수와 독립인 조회 RPC 만 — 원본 스크래핑·on-demand fetch 없음 | §Pattern 4(RPC 1회) · §Pattern 5(tickgw 내부 캐시 · 격자 Storage · 변환은 기존 상한 공유) · §비용 가드 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- 사용자 대면 문장 · 커밋 메시지는 한국어. 커밋 전 메시지 확인 · `Co-Authored-By` 넣지 않기(사용자 전역 규칙 — 시스템 첨부 문구보다 우선).
- **GSD 워크플로 경유** — 파일 변경은 `/gsd-execute-phase` 등 GSD 명령 안에서.
- **§공식 API 운영 기준 / §스크래핑 5원칙:** 호출량은 사용자 수와 독립 · 사용자 클릭이 원본 fetch 를 트리거하는 O(N) 금지. 진단은 우리 DB(RPC) · 우리 내부 tickgw 캐시 · 우리 Storage 격자만 읽는다(외부 원본 fetch 0). 변환 Job 은 기존 `TICK_REQUEST_DAILY_CAP` 를 공유한다.
- **§gh-trade 인박스:** 세션 시작 시 `docs/inbox/from-gh-trade/` open 노트 처리 · 처리 시 `status: done` + `done_commit` · 경로 지정 커밋. gh-trade 요청은 `scripts/trade-handoff.sh <slug>` → TODO 채움 → SendMessage(보조). 노트 커밋은 gh-trade 세션.
- **Conventions:** 상따 화면 반응형 정본은 `webapp/src/styles/globals.css` §2.2b (이 phase 는 주문로그 탭 행 모양만 건드림).
- 메모리 규칙(프로젝트 lesson — CLAUDE.md 급으로 취급):
  - LLM 워커 무로그 fail-safe 금지 — 빈 텍스트 · 절단 시 `stop_reason` + `usage` 를 로그에 남긴다. threshold 바꾸면 `max_tokens` 같이 점검.
  - Supabase RPC 는 `REVOKE ... FROM PUBLIC` + `REVOKE ... FROM anon, authenticated` 명시 + `GRANT ... TO service_role`.
  - Cloud Run 은 VPC all-traffic egress — 다중 쿼리는 RPC 1회로.
  - 챗봇 Sonnet 5 — `temperature` 금지 · 면책 문구 재도입 금지.
  - webapp dev 포트 3100(`dev.sh`). 동시 세션 → `vitest --maxWorkers=2` · `playwright --workers=1`.
  - 서브에이전트(executor)는 커밋까지 — 배포(`supabase db push` · deploy-server · push)는 메인 세션.
  - 배포는 relay 먼저 · push 나중(push = webapp 프로덕션). 배포 전 운영 이미지 조상 확인.
  - 보안 검사(`/gsd-secure-phase`) 생략 — `security_enforcement: false`. nyquist 는 유지.

## Summary

기존 챗봇은 **팀장(Sonnet 5) 1 + 전문가 5** 구조이고, 전문가는 전부 「데이터 선조회 → Sonnet 1콜 · `thinking: {type:"disabled"}`」 이다 — 전문가 안 도구 루프는 이 저장소에 아직 없다 [VERIFIED: `server/src/services/specialists/limitup-specialist.ts:100-107`]. 진단 전문가는 팀장의 6번째 도구(`consult_diagnosis_specialist`)로 붙되, 안에서 **Opus 5.5 수동 tool-use 루프**(thinking 항상 켜짐 · `output_config.effort` 명시 · `tool_choice` 미지정=auto)를 돈다. 설치된 SDK 는 `@anthropic-ai/sdk` 0.65.0 이라 `output_config` 타입이 없다 — 요청 본문은 SDK 가 그대로 통과시키므로(`resources/messages/messages.js` `post('/v1/messages', {body})`) **SDK 업그레이드 없이 타입 단언으로 싣는다**(업그레이드는 API 버전 2026-10-21 전환까지 끌고 와 범위가 커진다) [VERIFIED: node_modules 검사].

D-01 「원문 그대로」 는 **서버가 진단문을 SSE `text` 로 직접 흘리고 `accumulatedText` 에 더한 뒤, 팀장 tool_result 에는 「이미 화면에 그대로 표시됨 — 재서술 금지」 머리를 붙여 넘기는 경로**로 구현한다. 팀장 루프 구조상 「머리말(도구 호출 전 텍스트) → 진단문 → 꼬리말(다음 라운드 텍스트)」 순서가 자연스럽게 나오고, 저장 `content` 도 화면과 일치한다(WR-03 규칙 유지). 프롬프트 지시만으로는 Sonnet 이 수십 줄을 「글자 그대로」 다시 쓸 보장이 없고 출력 토큰 · 지연도 두 배가 된다.

데이터는 **신설 RPC `dma_diagnosis_for_user(p_user_id, p_trade_date, p_isin)` 1회**로 주문 · 체결 · 전략 이벤트(kind 9 포함)를 묶는다 — 기존 `dma_journal_orders_for_user` 는 `gateway` 칸이 없어 켜진 서버 조인을 못 하므로 `tick_own_for_user` 패턴을 따른다. **kind 9 는 기존 주문로그 RPC 에서 이미 「주문 이벤트(계좌 일치)」 로 분류되어 `account_no` 만 채워지면 추가 DB 변경 없이 보인다**(`-- 계좌가 빈 주문 이벤트는 ... 비공개다(예약 kind 9 포함).`) · **relay 에는 kind 화이트리스트가 없어 지금 relay 가 이미 kind 9 를 적재 · 계좌 소유자에게 푸시한다**(인박스의 「구 relay 는 모르는 kind 로 무시」 는 사실과 다르다 — 배포 순서에 영향, Pitfall 7). 시세는 오늘 = tickgw `/internal/ticks/live`(워커 `fetchLiveDay` 선례 · 다중 zstd 프레임은 `splitZstdFrames` 필수) · 지난 날짜 = `tick_open_for_user` → Storage 격자 다운로드 → 스트리밍 디코드다. 실측(에코앤드림 10/16 13시 KRX 컷)으로 **A3 한 줄 ≈ 60자 · B6(5단) ≈ 145자 · 60초 창 p50 279건 / p90 1,104건** — 상한은 **N = 60초 · M = 400건(≈ 20K 토큰)** · 질문당 시세 호출 4회를 권고한다.

**Primary recommendation:** 진단 전문가 = `server/src/services/specialists/diagnosis/` 모듈(루프 · 도구 4개 · 지식 프롬프트) + RPC 1개 + SSE 직접 전달. kind 9 노트는 Wave 1 첫 태스크로 보내고(외부 계약 · costly), 받는 쪽(shared 라벨 · 주문로그 행 · 진단 도구)은 계약 초안 기준으로 병행한다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 진단 질의 라우팅(팀장 → 진단 전문가) | API / Backend (`chat-service.ts`) | — | 팀장 tool-use 루프가 서버에 있다 · SSE 도 서버 |
| Opus 내부 도구 루프 · 지식 프롬프트 | API / Backend | — | API 키 · 계좌 범위 클로저가 서버에만 있어야 한다 |
| 계좌 범위 강제 | Database / Storage (RPC `dma_visible_accounts`) | API (`req.userId` 만 전달) | 가시성 판정 정본은 RPC 안(T-19-17) — 서버는 `p_user_id` 하나만 넘긴다 |
| 주문 · 체결 · 전략 이벤트 · kind 9 묶음 조회 | Database (RPC 1회 jsonb) | API(텍스트 직렬화) | Cloud Run 왕복 비용 · PostgREST max_rows 회피 |
| 시세 전문 디코드 · 창 자르기 · 한 줄 포맷 | API / Backend | 내부 tickgw(오늘) · Storage(과거) | 브라우저 무경유(D-12) · 디코더는 shared `ticks/*` |
| 변환 요청(과거 미변환) | API → Database RPC `tick_request_convert_for_user` | Cloud Run Job | 기존 `requestTickConvert` 재사용 · 상한 공유 |
| 진단문 화면 표시 · 틱 링크 | Browser / Client (`message-assistant.tsx`) | — | react-markdown 렌더 · 내부 경로만 같은 탭 |
| kind 9 행 표시 · 「상태전이」 필터 | Browser / Client (주문로그 탭) | shared 라벨 · 문장 조립기 | 라벨 정본은 `strategy-event-labels.ts` 한 곳 |
| kind 9 생성 | 외부(gh-trade 서버) | relay(원문 적재 · 무변경) | 와이어 무변경 · 값만 채움 |

## Standard Stack

### Core (전부 이미 설치 — 새 의존성 0)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | 0.65.0 (설치본) | 팀장 · 진단 전문가 Messages API | 기존 챗봇 동일 클라이언트 `getChatAnthropicClient` [VERIFIED: `server/package.json` · `node_modules/.pnpm/@anthropic-ai+sdk@0.65.0`] |
| Node `zlib` zstd | Node ≥ 22.15 (서버 이미지 `node:22-alpine`) | tickgw · 격자 zstd 해제 | `zlib.zstdDecompressSync` · `createZstdDecompress` 는 v22.15.0 추가 · Experimental [CITED: nodejs.org/docs/latest-v22.x/api/zlib.html] · 워커 `tick-convert` 가 이미 같은 API 사용 [VERIFIED: `workers/tick-convert/src/modes/promote.ts:133-135`] · `@types/node` 22.19.17 에 타입 있음 [VERIFIED] |
| `@gh-radar/shared` `ticks/*` | workspace | 레코드 프레이밍 · A3/B6 디코드 · `splitZstdFrames` | Phase 37 D-19 정본 디코더 — **CONTEXT 가 적은 `krxTick.ts` 는 호가 단위 표다(디코더 아님)**. 실제 디코더는 `packages/shared/src/ticks/{framing,layouts,decode}.ts` [VERIFIED] |
| `@gh-radar/shared` `strategy-event*.ts` | workspace | `toStrategyEventRow` · `orderLogLineText` · 라벨 | 진단문 · 웹이 같은 낱말(D-10) |
| zod | ^4 | 모델 생성 도구 입력 검증 | 서버 기존 표준 |
| Supabase RPC + pgTAP | postgres 17.6.1.104 이미지 | 진단 RPC · 가시성 테스트 | `scripts/verify-dma-orders-price-check.sh --test` 러너 [VERIFIED] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SDK 0.65 + 타입 단언(`output_config`) | SDK 1.5.0 업그레이드 | 1.x 는 API 버전 `2026-10-21` 로 넘어가 `temperature` 등 제거 · 워커 2곳(`discussion-sync` · `home-sync`)도 같은 버전 — 이 phase 범위 밖. 단언 한 곳(진단 모듈)이 더 작다 |
| Node zlib zstd | `fzstd` 0.1.1 (webapp 이 이미 사용 · 레지스트리 OK) | fzstd 는 다중 프레임을 한 번에 풀지만 순수 JS 라 느리고 server 에 새 의존성. 워커 선례(zlib + `splitZstdFrames`)를 따른다 |
| 진단 RPC 신설 | 기존 `dma_journal_orders_for_user_json` + `dma_strategy_events_for_user_json` 2회 | 왕복 2회 · 주문 RPC 에 `gateway` 칸 없음(켜진 서버 조인 불가) · 하루 전체(전 종목) 반환 |
| SSE 직접 전달(D-01) | 팀장 프롬프트 「그대로 옮겨라」 | 글자 일치 보장 없음 · 출력 토큰 2배 |

**Installation:** 없음.

**Version verification:** `npm view @anthropic-ai/sdk version` → `1.5.0`(최신) — 이번 phase 는 설치본 0.65.0 유지 [VERIFIED: npm registry].

## Package Legitimacy Audit

이 phase 는 새 외부 패키지를 설치하지 않는다.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| fzstd (대안으로만 검토) | npm | 2024-03 publish | ~1.98M/wk | github.com/101arrowz/fzstd | [OK] | 미채택(설치 안 함) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
사용자(웹 챗 시트) ──POST /api/chat {message}──▶ chatRateLimit → requireAuth → requireDmaMapped
                                                        │ req.userId
                                                        ▼
                                   handleChatStream (팀장 Sonnet 5 루프, 최대 5 라운드)
                                     │ stream text ──SSE text──▶ 화면(머리말)
                                     │ tool_use consult_diagnosis_specialist {question}
                                     ▼
                     SSE agent_start{agent:"diagnosis"} ──▶ 진행 스텝퍼 「주문 진단 전문가 분석 중…」
                                     │
                                     ▼  runSpecialist(name, input, supabase, ctx{userId, signal, tickDeps, emitText})
                     ┌──────── 진단 전문가 (Opus 5.5 · effort · 최대 8 라운드 · 마감 150초) ────────┐
                     │ system = 지식 프롬프트(cache) · tools 4개(cache) · messages(append-only)        │
                     │   tool_use ─┬─ search_stock(query) ──▶ stocks 표 1쿼리                         │
                     │             ├─ get_order_log(date,isin?,from?,to?) ──▶ RPC dma_diagnosis_for_user│
                     │             │        (주문·체결·전략 이벤트 kind 3~8·11~14 + kind 9 + 시세 1·2·10) │
                     │             ├─ get_market_ticks(isin,ex,date,from,to)                            │
                     │             │     오늘 ─▶ tickgw /internal/ticks/live (offset 0..) ─▶ splitZstdFrames│
                     │             │     과거 ─▶ RPC tick_open_for_user ─▶ grid 있음: Storage download     │
                     │             │                                  └▶ 없음: requestTickConvert(상한 공유)│
                     │             │     ─▶ decodeAny ─▶ 창 [from,to] ∩ ≤60초 ∩ ≤400건 ─▶ 한 줄 텍스트   │
                     │             └─ (kind 9 는 get_order_log 안 「상태전이」 절 · 0건이면 「미적재」 표시) │
                     │ end_turn ─▶ 진단문(text 블록)                                                    │
                     └──────────────────────────────────┬────────────────────────────────────────────┘
                                                        │ emitText(진단문)  ── SSE text ──▶ 화면(원문 그대로)
                                                        │ accumulatedText += 진단문
                     SSE agent_end ◀────────────────────┤
                                                        ▼ tool_result = 「[이미 화면에 그대로 표시됨 — 재서술 금지]」+원문
                                   팀장 다음 라운드 ── SSE text(꼬리말 1~2줄) ──▶ 화면
                                                        ▼
                     [chat] usage {models:{claude-sonnet-5:{…}, claude-opus-5-5:{…}}} · appendMessage(finalText)

gh-trade 서버 ──kind 9 StrategyEvent(80 저널)──▶ relay(원문 적재 · 무변경) ──▶ dma_strategy_events
      ▲                                                   └─journal.events(계좌 소유자)──▶ 웹 주문로그 탭(회색 「상태전이」 행)
      └── 인박스 노트 docs/inbox/from-gh-radar/YYMMDD-chatbot-kind9-mapping.md (43칸 계약)
```

### Recommended Project Structure
```
server/src/services/specialists/diagnosis/
├── diagnosis-specialist.ts   # consultDiagnosisSpecialist — Opus 루프 · 마감 · usage 집계 · 무로그 금지
├── diagnosis-tools.ts        # 도구 정의 4개(Anthropic.Tool[]) + zod 입력 검증 + 디스패치(ctx 클로저)
├── diagnosis-order-log.ts    # RPC 1회 → 텍스트 직렬화(orderLogLineText 재사용 · 상한 · 요약 모드)
├── diagnosis-market.ts       # 오늘(tickgw) / 과거(격자) 바이트 → 디코드 → 창 → 한 줄 포맷 · 자료 없음 사유
└── diagnosis-knowledge.ts    # 지식 프롬프트 상수(gh-trade 원문 커밋 표기) + 진단 전문가 시스템 프롬프트
server/src/services/tick-live-fetch.ts   # (선택) tickgw 루프 서비스 함수 — 워커 fetchLiveDay 의 서버판
supabase/migrations/2026110xxxxxxx_dma_diagnosis_for_user.sql
supabase/tests/dma_diagnosis.test.sql
packages/shared/src/chat.ts                 # SpecialistId · SPECIALIST_TOOL_NAMES · SPECIALIST_LABELS 에 diagnosis
packages/shared/src/strategy-event.ts       # STRATEGY_EVENT_KIND.StateTransition = 9
packages/shared/src/strategy-event-labels.ts# 9: "상태전이" · STATE_REASON_LABELS · strategyEventSide(kind 9 → null)
packages/shared/src/strategy-event-text.ts  # case 9 (log · timeline)
webapp/src/lib/order-log-feed.ts            # 'state' 필터
webapp/src/components/chat/agent-progress.tsx # STEP_ORDER 에 diagnosis
webapp/src/components/chat/message-assistant.tsx # 내부 /analytics/ticks 링크 같은 탭
```

### Pattern 1: 전문가 등록 — 현재 구조(정확한 연결점)

**현재 값(verbatim):**
- `packages/shared/src/chat.ts:16` — `export type SpecialistId = "quote" | "theme" | "news" | "limitup" | "websearch";` [VERIFIED]
- `packages/shared/src/chat.ts:20-24` — `quote: "consult_quote_specialist",` · `theme: "consult_theme_specialist",` · `news: "consult_news_specialist",` · `limitup: "consult_limitup_specialist",` · `websearch: "consult_websearch_specialist",` [VERIFIED]
- `packages/shared/src/chat.ts:29-33` — `quote: "시세·수급 전문가",` … `websearch: "실시간 검색 전문가",` [VERIFIED]
- `packages/shared/src/chat.ts:73-74` — `agent_start: { agent: SpecialistId; label: string };` · `agent_end: { agent: SpecialistId };` [VERIFIED]
- `server/src/config.ts:120-124` — `chatLeadModel: process.env.CHAT_LEAD_MODEL ?? "claude-sonnet-5",` · `chatSpecialistModel: process.env.CHAT_SPECIALIST_MODEL ?? "claude-sonnet-5",` · `chatWebSearchModel: process.env.CHAT_WEBSEARCH_MODEL ?? "claude-sonnet-5",` · `chatMaxToolRounds: Number(process.env.CHAT_MAX_TOOL_ROUNDS ?? "5"),` · `chatMaxHistoryMessages: Number(process.env.CHAT_MAX_HISTORY_MESSAGES ?? "30"),` [VERIFIED]
- `scripts/deploy-server.sh` 에 `CHAT_` env 가 하나도 없다 → 운영은 코드 기본값을 쓴다 [VERIFIED: grep 0건]. 그래서 `CHAT_DIAGNOSIS_MODEL` 기본값을 **코드에** `"claude-opus-5-5"` 로 두면 배포 스크립트 수정이 필요 없다(메모리 「deploy default 회귀 함정」 회피).

**연결 순서(현재 코드가 정한 흐름):**
1. `chat-service.ts:397-401` — `tools: SPECIALIST_TOOLS.map(...)` 마지막 원소에 `cache_control` 부착. **배열 끝에 diagnosis 를 추가하면 캐시 지점이 diagnosis 로 이동**(무해 — 매 요청 같은 배열).
2. `chat-service.ts:453-464` — `Promise.all(calls.map(...))` 안에서 `toolNameToSpecialistId(b.name)` → `sendSSE(res, "agent_start", { agent: agentId, label: SPECIALIST_LABELS[agentId] })` → `runSpecialist(b.name, b.input as { code?: string; question: string }, supabase)` → `sendSSE(res, "agent_end", { agent: agentId })`.
3. `chat-service.ts:479-482` — tool_result 는 `MAX_TOOL_RESULT_CHARS = 8_000`(:67) 로 자른다.
4. `chat-orchestrator.ts:111-121` — `TOOL_NAME_TO_ID` 는 `SPECIALIST_TOOL_NAMES` 에서 자동 생성 → shared 에 추가하면 역매핑 자동.
5. `chat-orchestrator.ts:134-163` — `runSpecialist(name, input, supabase)` switch. **진단은 `userId` · `signal` · tick 의존성 · `emitText` 가 필요하므로 4번째 인자 `ctx` 를 추가해야 한다** — `handleChatStream` 은 지금 `app.locals` 를 모른다 → `HandleChatOptions` 에 `diagnosisDeps`(tickgw · tickConvertTrigger · tickRequestDailyCap) 를 더하고 `routes/chat.ts:95-100` 이 `req.app.locals` 에서 넘긴다 [VERIFIED: `server/src/app.ts:86-89` 에 `tickConvertTrigger` · `tickRequestDailyCap` · `tickgw` · `tickGate` 가 있음].
6. 재시도: 팀장 스트림만 `isRetryableError`(429·529·overloaded·rate_limit) 2회 재시도 · `sleep(1000*(attempt+1))` [VERIFIED: `chat-service.ts:210-220 · 419-433`]. 전문가는 각자 try/catch → `SPECIALIST_UNAVAILABLE`. **SDK 기본 `maxRetries: 2` 도 겹쳐 동작**한다(클라이언트 생성 시 옵션 없음 — `anthropic-client.ts`).
7. 타임아웃: 팀장 루프 자체 타임아웃은 없고 Cloud Run 요청 상한 **`--timeout=300s`** · 메모리 **`--memory=512Mi`** · `--concurrency=80` [VERIFIED: `scripts/deploy-server.sh:260-265`]. SSE keepalive 15초(`routes/chat.ts:90-92`). → 진단 루프에 **자체 마감(권고 150초)** 이 필요하다(Pitfall 2).
8. interrupt: `effectiveSignal`(새 요청이 이전 요청 abort)은 팀장 스트림에만 전달된다 — 진단 루프에도 넘겨야 한다.
9. 웹: `agent-progress.tsx:27-33` `STEP_ORDER` 에 `"diagnosis"` 추가(없으면 `steps` 필터에서 빠져 **표시되지 않는다**) [VERIFIED].

### Pattern 2: Opus 5.5 내부 도구 루프 (이 저장소 첫 「도구 가진 전문가」)

**API 사실(검증):**
- 모델 ID `claude-opus-5-5` · thinking 끌 수 없음(`{type:"disabled"}` · `budget_tokens` 400) → `thinking` 생략(=adaptive) · effort 기본 `medium` 이라 **명시** · 강제 `tool_choice` `any`/`tool` 400 · `{type:"none"}` 허용 [CITED: claude-api skill `shared/model-migration.md` §Migrating to Claude Opus 5.5].
- 도구 사이 짧은 서술은 `text` 가 아니라 **progress-update `thinking` 블록**(기본 display omitted → 빈 문자열)으로 온다 → 최종 진단문은 사실상 `end_turn` 라운드의 `text` 블록뿐 [CITED: 같은 절].
- **Preserved thinking:** 같은 대화에서 `system` · `tools` · 이전 messages 를 바꾸면 thinking 블록이 무효(2026-08-31 이후 생성 계정은 400). → **루프 안에서 tools 를 빼거나 system 을 바꾸지 말고 append-only** [CITED: 같은 절 Breaking change 3]. 팀장 루프의 「도구 빼고 강제 요약 1콜」(`chat-service.ts:501-556`) 패턴을 진단 루프에 복제하면 안 된다.
- `stop_reason: "refusal"` 처리 필수(카테고리 `cyber`·`bio`·`reasoning_extraction`) · `stop_details` 는 refusal 때만 [CITED].
- 가격 $4 / $20 per MTok · 캐시 읽기 $0.20 · 5분 캐시 쓰기 $5 · 최소 캐시 프리픽스 512 토큰 [CITED: skill 모델 표 · Opus 5.5 절].
- SDK 0.65 `StopReason` 에 `'refusal'` 포함 · `Usage` 에 `cache_creation_input_tokens` · `cache_read_input_tokens` 있음 · `Tool` 에 `strict` 없음 · `output_config` 없음 [VERIFIED: `messages.d.ts:468 · 540 · 731-749`].

**권고 수치(재량 결정):**

| 항목 | 값 | 근거 |
|---|---|---|
| `output_config.effort` | **`medium`** (env `CHAT_DIAGNOSIS_EFFORT` 로 `high` 전환 가능) | Opus 5.5 문서: 「Start at `medium`」 · `medium` 이 Opus 5 `high` 이상 · 300초 Cloud Run 상한 안에서 다중 라운드. UAT 에서 시험 문항을 medium/high 둘 다 돌려 고른다 [CITED + ASSUMED: 최종값] |
| `max_tokens`(라운드당) | **32000**, 스트리밍(`messages.stream` + `finalMessage()`) | thinking 이 max_tokens 안에서 소모 · 기존 팀장도 stream [CITED: skill `max_tokens` 기본 권고] |
| 라운드 상한 | **8** | 검색 1 · 주문로그 1~2 · 시세 2~4 · 답 1 |
| 시세 도구 호출 상한 | **4회/질문** | §Pattern 5 토큰 계산 |
| 주문로그 도구 호출 상한 | 3회/질문 | 날짜 · 종목 바꿔 재조회 여유 |
| 도구 결과 문자 상한 | 시세 400건 · 주문로그 400줄(넘으면 「잘렸음 · 범위 좁혀 다시」) | §Pattern 4·5 |
| 누적 입력 토큰 가드 | 라운드별 `usage.input_tokens + cache_read + cache_creation` 합이 **600K** 넘으면 마무리 콜 | 비용 상한 ≈ $1.5/건 |
| 벽시계 마감 | **150초**(env) — 넘으면 마무리 콜 1회 | Cloud Run 300초 − 팀장 앞뒤 라운드 |
| 캐시 | `system` 블록 `cache_control` + `tools` 마지막 원소 `cache_control` + 매 라운드 **마지막 user 메시지의 마지막 블록**에 `cache_control`(증분 캐시) — 브레이크포인트 3개(최대 4) | [CITED: skill Prompt Caching] |
| 마무리 콜 | tools **그대로 두고** `tool_choice: {type:"none"}` + 직전 tool_use 마다 `tool_result`(「상한 도달 — 실행 안 함」) + 끝에 text 블록 「더 이상 조회할 수 없다. 지금까지 자료로 답하라」 | tools 를 빼면 prefix 변경 → thinking 무효(Pitfall 1) |
| refusal | `stop_reason === "refusal"` → 로그(`stop_details`) + 고정 문구 반환 | 무로그 금지 |
| server-side fallback | **기본 미적용 · 사용자 확인 사항**(Open Q4) | skill 은 기본 opt-in 권고 — 비용 · 모델 표기 영향이라 사용자 결정 |

### Pattern 3: 진단 전문가 도구 정의 (계좌 칸 0)

도구 4개. **어느 도구에도 계좌 · 사용자 · 서버 인자가 없다** — 디스패처가 `ctx.userId`(라우트의 `req.userId`) 를 클로저로 RPC 에 넣는다(SC-2).

| 도구 | 입력 | 서버 동작 | 출력 꼴 |
|---|---|---|---|
| `search_stock` | `query`(1~40자) | `stocks` 1쿼리: `.or(name.ilike,code.ilike)` · `is_delisted=false` · ETP 제외 · `limit(10)` · `select("code,name,isin,market")` — `/api/stocks/search` 와 같은 `sanitizeSearchTerm` 재사용(시세 조인은 하지 않는다) [VERIFIED: `server/src/routes/stocks.ts:40-110` · `schemas/search.ts`] | `코드 이름 ISIN 시장` 한 줄씩 |
| `get_order_log` | `date`(YYYY-MM-DD · 생략=KST 오늘) · `isin?` · `from?`/`to?`(HH:MM:SS) | RPC `dma_diagnosis_for_user` 1회(§Pattern 4). 같은 (date, isin) 은 그 진단 실행 안에서 메모(재호출 시 RPC 0회) | 절 4개: 주문 · 체결 · 전략 이벤트 · 상태전이(kind 9 — 0건이면 `상태전이 기록 없음(아직 미적재)`) |
| `get_market_ticks` | `isin` · `exchange`(KRX\|NXT) · `date` · `from` · `to`(HH:MM:SS(.mmm)) | §Pattern 5 | 범례 1줄 + A3/B6 시간순 한 줄 · 또는 `자료 없음: <사유>` |
| (D-11 ④ 상태전이) | — | `get_order_log` 의 한 절로 제공(별도 RPC 0회) | — |

- 입력은 **zod 로 서버 검증**(모델 생성 입력 · `strict` 는 SDK 0.65 타입에 없어 단언이 필요 — 선택). 검증 실패 → `tool_result` `is_error: true` 와 사유.
- 도구 응답 포맷: **고정 순서 텍스트**(JSON 금지 — 키 반복으로 토큰 2~3배). 각 도구 응답 첫 줄에 범례.
- `tool_choice` 미지정(auto) — 도구 사용 요구는 프롬프트로.

### Pattern 4: 진단 RPC `dma_diagnosis_for_user`

**권고: 신설 1개** (기존 조합 기각 이유 — `dma_journal_orders_for_user` 25칸에 `gateway` 없음 → 켜진 서버 조인 불가 · 2회 왕복 · 하루 전 종목 반환).

- 시그니처: `dma_diagnosis_for_user(p_user_id uuid, p_trade_date date, p_isin text DEFAULT NULL) RETURNS jsonb` · `LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp` · jsonb 스칼라(max_rows 회피) — `tick_own_for_user` 동형 [VERIFIED: `20261104100000_tick_own_for_user.sql:46-52`].
- 게이트: `IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN RETURN jsonb_build_object('access', false);` → 서버 403 대신 도구 응답 「DMA 계좌 매핑 없음」(챗 라우트가 이미 `requireDmaMapped` 라 정상 경로에선 안 온다).
- 가시성: `v_vis := array_agg(gateway||'|'||account_no) FROM dma_visible_accounts(p_user_id)` — **어드민 전 계좌 우회는 넣지 않는다**(ROADMAP 잠금 「웹 조회 RPC 범위 그대로」 = 주문로그 RPC `dma_strategy_events_for_user` 범위, SC-2 「다른 사용자 계좌 조회 불가」). Phase 38 `tick_own_for_user` 의 admin 분기는 따르지 않는다 → Open Q1.
- 켜진 서버: 세 배열 모두 `JOIN public.dma_servers s ON s.key = <gateway> AND s.enabled` [VERIFIED 선례: `tick_own_for_user.sql:91 · 120 · 139`].
- 반환:
  - `orders`: `dma_account_orders`(그날 · `p_isin` 있으면 그 종목) — `{gateway, account_no, order_no, isin, stock_code(stocks 조인), exchange, board, side, order_type, org_order_no, qty, price, filled_qty, status, result_code, message, origin, created_ms, updated_ms}` · `dma_user_id` 금지(T-19-08).
  - `fills`: `dma_journal_events` `notice_type='E' AND exec_qty>0` — `tick_own_for_user` 의 `fills` 원소와 같은 키.
  - `events`: `dma_strategy_events` — 원소 모양은 **`to_jsonb(e) - 'dma_user_id' - 'applied_at' || jsonb_build_object('stock_code', s.code)`** (주문로그 RPC 와 같은 꼴 → shared `toStrategyEventRow` 그대로) [VERIFIED: `20261018120000_dma_strategy_events_accum_signal.sql:43-45`]. kind 조건: 주문 이벤트(kind NOT IN 1·2·10·15·16·17·18 — 9 포함)는 가시 계좌 일치 · 시세 이벤트 1·2·10 은 `p_isin` 지정 시 그 게이트웨이에 가시 계좌가 있으면 포함(맥락) · 15·16·17·18 제외.
- 인덱스: 기존 `idx_dma_strategy_events_day (trade_date, gateway, account_no)` 와 `idx_dma_strategy_events_order_isin_day ... WHERE kind IN (3, 6)` 가 있다 — 종목 지정 조회가 kind 9 · 4·5·7·8 까지 훑으므로 `(trade_date, isin, exchange)` 부분 인덱스 **하나 추가 권고** `WHERE kind NOT IN (15, 16)`(kind 15·16 이 하루 행 대부분) [ASSUMED: 실행계획 미측정].
- 권한: `REVOKE EXECUTE ... FROM PUBLIC;` · `REVOKE EXECUTE ... FROM anon, authenticated;` · `GRANT EXECUTE ... TO service_role;` + `NOTIFY pgrst, 'reload schema';` [VERIFIED 선례: `tick_own_for_user.sql:153-155 · 166`].
- **kind 9 의 기존 경로는 DB 변경 없이 동작:** `dma_strategy_events_for_user` 의 주문 이벤트 분기 주석 「`-- 맞지 않아 비공개다(예약 kind 9 포함).`」 — `account_no` 가 차면 가시 계좌 소유자에게 보이고, 래퍼 `dma_strategy_events_for_user_json` 은 kind 15(옵션) · 16 만 뺀다 [VERIFIED: `20261018120000_...accum_signal.sql:50-56 · 84-85`]. → D-11 「DB 가 kind 9 를 돌려줌」 은 **pgTAP 로 고정만 하면 된다**.
- 주문 펼침 타임라인 `dma_order_events_for_user` 는 `e.order_no = ANY(k.nos)` 로 kind 무관하게 붙는다 — kind 9 행에 원인 주문번호가 있으면 그 주문 펼침에도 나온다 [VERIFIED: `20260929190000_dma_gateway_identities.sql:261-270`] → shared `timelineStrategyText` 도 kind 9 를 처리해야 한다.

**직렬화(서버):** `get_order_log` 는 `orderLogLineText(ev, stockName)`(웹과 같은 문장 · [VERIFIED: `strategy-event-text.ts:501-509`]) 뒤에 판정 원문 키를 붙인다 — `사유="<reason_code 원문>" 임계=<cond_threshold> 실측=<cond_actual> 누적=<cum_volume> t=<gw_time_ms>`. `p_isin` 없이 행이 400줄을 넘으면 **종목별 요약 모드**(종목 · 거래소 · 그룹별 주문 수 · 첫/끝 시각)로 바꾸고 「종목을 지정해 다시」 를 적는다.

### Pattern 5: 시세 도구 — 한 줄 포맷 · N · M 실측

**디코더 재사용(검증):** `iterRecords(buf)`(16B `<IIII>` 헤더 · 잘린 꼬리에서 멈춤) · `decodeAny(payload, recvNs, label)` → `{table:"a3"|"b6"|…, row}` · 열 이름은 파이썬 Parquet 그대로 [VERIFIED: `packages/shared/src/ticks/framing.ts` · `decode.ts:204-212`]. A3 186B 필드 — `"session_id", 15, 2` · `"trade_time", 35, 12, "time12"` · `"trade_price", 59, 11` · `"trade_qty", 70, 10` · `"cum_volume", 113, 12` · `"final_bs_code", 147, 1, "str") // '1' 매도, '2' 매수` · `"ask1_px", 163, 11` · `"bid1_px", 174, 11` · 헤더 `"msg_seq", 5, 8` [VERIFIED: `ticks/layouts.ts:85-114`]. B6 590B — `ask{i}_px/bid{i}_px/ask{i}_qty/bid{i}_qty` (i=1..10) · `"total_ask_qty", 507` · `"total_bid_qty", 519` · `"est_price", 531` · `"est_qty", 542` · `"proc_time", 35, 12` [VERIFIED: `layouts.ts:116-136`]. `parseStr` 는 오른쪽 공백을 지운다 → **bs 공백 `' '` 은 빈 문자열 `""` 로 나온다** — 포맷에서 `b_`(공백 표기)로 바꿔 보여야 한다(Pitfall 5).

**권고 한 줄 포맷**(범례 1줄 + 레코드당 1줄, 시각 = 거래소 시각 µs):
```
범례: 시각 A3 체결가 수량 b{bs: 1매도 2매수 _공백=단일가} s{세션} 매도1/매수1 c누적 #msg_seq | 시각 B6 s{세션} A 매도1~5(가격x잔량) | B 매수1~5 T총매도/총매수 E예상가x예상량 #msg_seq
13:00:00.013412 A3 10210 1 b2 s40 10210/10200 c1198937 #70637
13:00:00.013412 B6 s40 A 10210x22 10220x485 10230x136 10240x295 10250x1056 | B 10200x1095 10190x94 10180x153 10170x12 10160x140 T4120/2210 E0x0 #70638
```
(위 두 줄은 실제 픽스처 `cut1300-krx.ticks.zst` 첫 레코드를 이 포맷으로 찍은 것 [VERIFIED: 스크래치 측정 스크립트]).

**실측(에코앤드림 KR7101360006 10/16 13:00~13:48 컷, 이 포맷 기준)** [VERIFIED: 측정 스크립트 · 픽스처 `packages/shared/src/__fixtures__/ticks/cut1300-krx.ticks.zst`]:

| 항목 | KRX | NXT |
|---|---|---|
| A3 / B6 건수 | 3,089 / 8,901 (A3 26%) | — |
| 줄 길이 평균 | A3 **60.3자** · B6(5단) **144.6자** · B6(3단) 107.1자 | — |
| 10초 창 레코드 | p50 54 · p90 291 · p99 506 · max 557 | p50 46 · p90 231 · p99 420 |
| 30초 창 | p50 150 · p90 843 · p99 1,220 | p50 132 · p90 641 · p99 935 |
| 60초 창 | p50 279 · p90 1,104 · p99 1,908 · max 1,976 | p50 254 · p90 997 · p99 1,599 |
| 같은 5단 호가 B6 연속 중복 | 8,901 중 90건(1%) — **중복 억제는 이득 없음** | — |

**토큰 산식** [ASSUMED: 숫자 위주 ASCII ≈ 2.5자/토큰 — Wave 0 에서 `client.messages.countTokens`(무료)로 실측해 확정]:
- A3 60.3자 ≈ 24 토큰 · B6(5단) 144.6자 ≈ 58 토큰 · 혼합 평균 = 0.26×24 + 0.74×58 ≈ **49 토큰/건**.
- **M = 400건** → 400 × 49 ≈ **19.6K 토큰/호출**(범례 · 머리 포함 ≈ 20K).
- **N = 60초** 상한 — 한산한 구간(p50 279건)은 60초가 통째로 들어오고, 붐비는 구간(10초 p90 291건)은 10초 창이 들어온다. 넘으면 **시간순 앞에서부터 400건까지 자르고** `잘렸음: 요청 13:10:00~13:11:00 중 13:10:00~13:10:14.302 까지 400건 — 범위를 좁혀 다시 부르세요` 를 붙인다.
- 질문당 시세 호출 **4회** → 시세 토큰 상한 ≈ 80K. B6 를 3단으로 줄이면 ≈ 38 토큰/건(−22%) — D-07 이 「호가 늘 포함」 이라 5단 유지 권고, 3단은 토큰 실측 뒤 조정 레버.
- 도구 설명에 「처음엔 사건 시각 −10초~+5초로 부르라」 를 적는다(첫 호출이 거의 항상 400건 안에 든다).

**오늘(tickgw) 경로** — 서버 `createTickgwClient().live({isin, ex, epoch, offset})` 재사용 [VERIFIED: `server/src/services/tickgw-client.ts:47-49 · 151-158`]. 루프는 워커 `fetchLiveDay` 의 축약판:
- 200 → 본문 누적 · `offset = X-Tick-Offset-End` · `epoch = X-Tick-Epoch` · `X-Tick-More: true` 면 곧바로 이어 받기 · `X-Tick-State` 가 `loading`/`queued` 면 2초 뒤 재요청 · `delayed` 5초 · `blocked` 실패 · 409 → 새 epoch 로 offset 0 [VERIFIED: `workers/tick-convert/src/tickgw-live.ts:12-27`].
- **tickgw 활성 키는 8개(처음 touch 순 · 리스 30초)** — 다른 사용자 틱뷰어 · launch-live Job 과 경쟁해 `queued` 가 될 수 있다 [VERIFIED: 같은 파일 :5-6]. 진단은 **최대 20초 대기 뒤 포기** → `자료 없음: 당일 시세 대기열(잠시 뒤 다시)`.
- 해제: **`splitZstdFrames(buf)` 로 나눠 프레임마다 `zlib.zstdDecompressSync`** — Node zstd 는 첫 프레임에서 멈추고 뒤 프레임을 조용히 버린다 [VERIFIED: `packages/shared/src/ticks/framing.ts:90-98` 주석 · `promote.ts:133-135`]. 프레임 단위로 풀어 바로 `iterRecords` → 창 밖 레코드는 버린다(512Mi 메모리 · 풀린 하루치를 통째로 들지 않는다).
- tickgw 는 시각 탐색이 없어 **offset 0 부터 해당 시각까지 읽어야 한다** → 한 진단 안에서 같은 (isin, ex) 를 여러 번 부르면 압축 바이트를 **진단 실행 단위 메모**(epoch · offsetEnd 와 함께)에 두고 증분만 받는다. 프로세스 전역 캐시는 두지 않는다(512Mi).
- `app.locals.tickgw === undefined` → `자료 없음: 당일 시세 경로 꺼짐(TICKS_LIVE_UNAVAILABLE)` · status 0 → `UNREACHABLE` · 401 은 서버 로그 error(비밀 불일치).
- 08:00 KST 이전 · 휴장 → 호출 없이 `자료 없음: 장 시작 전/휴장`.

**과거(격자) 경로** — `openTick(supabase, userId, {d, isin, ex})` 의 RPC `tick_open_for_user` 를 그대로 부르되, 서명 URL 대신 **`supabase.storage.from("tick-grid").download(object_path)`** 로 서버가 직접 받는다(서명 1회 절약). RPC 응답의 `grid.object_path` 는 `openTick` 이 응답에서 지우므로 서비스 함수를 하나 더(공용 헬퍼 추출) 만든다 [VERIFIED: `server/src/services/ticks.ts:63-66 · 134-190`]. 격자는 **zstd 한 프레임**(nightly) → `Readable.from(buf).pipe(zlib.createZstdDecompress())` 스트리밍 + `iterRecords` 꼬리 잇기로 창만 남긴다(하루치 풀린 크기가 수십 MB 일 수 있음 · Pitfall 3). `fmt !== "pcapns-rec+zstd/1"` 이면 `자료 없음: 격자 형식 미지원`.
- 격자 없음 → `requestTickConvert(supabase, userId, {d, isin, ex}, {trigger, dailyCap})` 를 **그대로** 호출 [VERIFIED: `ticks.ts:261-307`]: `capped` → `TickConvertCapped`(429) 를 잡아 `자료 없음: 오늘 변환 한도 소진` · `not_uploaded` → `자료 없음: 원본 업로드 전(매일 22:00 업로드 · 23:30 뒤 변환)` · `triggered`/진행 중 → `변환 중 · 약 <ceil(eta_s/60)>분 뒤 다시 물어 주세요` · `TICK_CONVERT_UNAVAILABLE`(503) → `자료 없음: 변환 경로 꺼짐`. **기다리지 않는다**(D-08 ②). 하루 상한은 전역 `TICK_REQUEST_DAILY_CAP`(기본 20) 공유 · (날짜, 거래소)당 Job 1회는 RPC advisory 잠금 [VERIFIED: `config.ts:130` · `ticks.ts:36-40`].
- 90일 밖도 같은 변환 요청 경로(37 D-04).

### Pattern 6: D-01 「원문 그대로」 · SSE · 저장

1. 진단 전문가는 `end_turn` 라운드의 `text` 블록을 이어 붙인 **진단문 하나**를 만든다(중간 라운드 text 는 버린다 — Opus 5.5 는 도구 사이 서술을 thinking 블록으로 낸다).
2. `ctx.emitText(text)` 가 `sendSSE(res, "text", { text: "\n\n" + 진단문 + "\n\n" })` 하고 **같은 문자열을 `accumulatedText` 에 즉시 더한다**. 이렇게 해야 이후 팀장 라운드 재시도의 `text_clear` → `text: accumulatedText` 재전송(WR-02/03 규칙 `chat-service.ts:423-428`)에서 진단문이 사라지지 않는다.
3. 팀장 tool_result: `[주문 진단 전문가의 진단문이 이미 사용자 화면에 그대로 표시되었습니다. 다시 쓰거나 요약·재서술하지 말고, 수치·시각을 반복하지 마세요. 필요하면 꼬리말 한두 줄만.]\n\n` + 진단문. 8,000자 절단(`MAX_TOOL_RESULT_CHARS`)은 화면에 영향 없음.
4. `LEAD_PROMPT` 수정: 「5명」→「6명」 · `[주문 진단]` 절 추가(주문이 왜 나갔나/안 나갔나 · 내 주문·체결·설정 질문 → `consult_diagnosis_specialist` 에 질문 원문 + 직전 맥락 요약 · 진단 질문엔 다른 전문가 호출 자제 · 진단문 재서술 금지 · 「단일 종합 답변」 규칙의 예외). 「상한가 분석 애널리스트 팀장」 역할 고정 문구는 「… 및 주문 진단」 으로 넓힌다.
5. 병렬 호출: 같은 턴에 진단 + 뉴스가 같이 불리면 `Promise.all` 안에서 진단문이 먼저 끝나는 대로 흘러간다 — 팀장의 다음 라운드 텍스트가 뉴스 내용과 꼬리말을 덧붙인다. 순서 보장은 필요 없다.
6. 저장: `finalText = accumulatedText || …` 이므로 진단문이 user/assistant 저장 `content` 에 포함된다 → 다음 턴 히스토리 복원에 그대로 들어가 후속 질문(「그럼 13:08 건은?」)의 맥락이 된다. 새 `MessageBlock` 형식은 필요 없다.
7. 진단문 안 종목 표기 `금양그린파워(282720)` 류는 `extractStockRefs` 로 미니 카드가 붙는다(원하면 지식 프롬프트에서 형식 권고).
8. **usage 로그(SC-3):** `SpecialistRunResult` 에 `usage?: Array<{model, inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens}>` 를 더하고, `[chat] usage` 줄(`chat-service.ts:562-571`)에 `models: { "claude-sonnet-5": {...}, "claude-opus-5-5": {...} }` 맵을 추가한다(기존 `model` · `inputTokens` · `outputTokens` 키는 팀장 값으로 유지 — 로그 쿼리 호환). 진단 전문가는 별도로 `[chat] diagnosis usage {rounds, toolCalls:{search_stock:n,…}, marketRecords, truncated, durationMs, stopReason, models}` 를 남긴다. 다른 전문가도 `usage` 를 돌려주면 모델별 합계가 완전해진다(선택 — 지금은 각자 `[chat] <x> specialist usage` 줄).

### Pattern 7: 틱뷰어 링크 렌더링 (D-04)

- URL 정본 `/analytics/ticks?isin=&d=YYYYMMDD&ex=KRX|NXT&t=HH:MM:SS.mmm&k=N` — 직렬화 순서 isin · d · ex · t · k, `ex` 기본 KRX 는 생략 [VERIFIED: `webapp/src/lib/ticks/tick-url.ts:3-6`]. `t` 는 **수신 시각** ms 기준(같은 ms 내 순번 k).
- 서버 쪽에서 링크를 직접 만들어 도구 응답에 넣어 주면(예: `get_market_ticks` 응답 끝 `틱 보기 링크: /analytics/ticks?isin=…&d=…&t=…`) 모델이 URL 을 짓지 않는다(환각 방지).
- 웹 `message-assistant.tsx:68-71` 은 모든 `<a>` 를 `target="_blank"` 로 연다 — `href` 가 `/analytics/ticks?` 로 시작하는 상대 경로면 `next/link` 같은 탭(시트는 닫히거나 유지 — UI-SPEC), 그 밖 상대 경로 · `javascript:` 등은 react-markdown 기본 `urlTransform` 이 막는다 [VERIFIED: 파일 주석 :10-12].

### Pattern 8: 지식 프롬프트 (진단 전문가 system)

원천 크기 [VERIFIED: `wc`]: `../gh-trade/docs/trading-rules.md` 32,616B · `docs/strategy/limit-chaser.md` **558,402B**(4,403줄 — 통째 불가) · `docs/analysis/krx-a3-zero-quote.md` 9,967B. `limit-chaser.md` §0 「한눈에 보는 판정 로직」(77~417줄)만 41,839B.

**권고: 손으로 추린 요약 6~9K 토큰** 을 `diagnosis-knowledge.ts` 상수로 두고 머리에 「원천 gh-trade 커밋 <해시> · 날짜」 를 적는다(드리프트 추적). 구성:
1. 역할 · 출력 권고(D-04: 결론 → 시각순 근거 줄(시각 ms · 무슨 일 · 출처) → 틱 보기 링크) · 매매지시 금지 · 데이터에 없는 수치 금지 · 프롬프트 인젝션 방어 · 시세 자료 없음 시 **「시세 전문은 받지 못해 주문로그 기준으로 판단」 한 줄 필수**(D-08) · kind 9 없을 때 「상태전이 기록 없음(아직 미적재)」.
2. 게이트 모델(§0-1 ①): 매수(선·줄·후) 1회성 — 발주 뒤 그 그룹 체크 자동 해제 · **체크 비트 ON 재제출 = 재무장**(Phase 44 D-06) · 마스터는 사람·킬 스위치·정리만 내림 · 매도·취소는 전송 성공 = 자동 재제출(재래치 대기) [VERIFIED: `limit-chaser.md:85-96`].
3. 버스트 · 한방(§0-1 ②) 원문 요지 — 0/0 조각 연속 = 큰 주문 하나 · 마지막 조각만 호가 실림 · 한방 N건 = 쓸고 간 가격 칸 수(첫 조각부터 · 마지막 조각 포함) · 예 `3건@10,000` [VERIFIED: `limit-chaser.md:111-120`].
4. **선매수 판정 표 9행을 글자 그대로**(로그 조건명 열 포함 — 진단문이 이 문자열을 인용해야 SC-1 판정이 쉬움). 7번 행: `` `BuySweepTick` — `PreBuy A3 스윕호가변경(체결가==스윕감시가 && 변경횟수>=최소)` `` [VERIFIED: `limit-chaser.md:159`]. 줄매수 · 후매수 한 문단씩(§0-2) · 「줄매수·후매수는 동시호가 틱에 판정하지 않는다 … VI 코드 `50·51·52·54` 는 뺀다」 [VERIFIED: `limit-chaser.md:140-145`].
5. 매도 전제 셋(§0-3 요약) · 진입 확인 래치 · 잔량추적.
6. **해석 규칙(verbatim 으로 넣을 것)** — `krx-a3-zero-quote.md` §1 표 F1·F2 · §3 표의 E 행 「`E. bs 가 '1'/'2' 아님 | 단일가, 제외`」 [VERIFIED: `krx-a3-zero-quote.md:9-10 · 33`] + CONTEXT D-06 문장 4개(단일가 bs 공백 = 선매수 A3 판정·누적 제외 · 0/0 = 한 주문의 마지막 아닌 조각 · 스윕 = 연속 조각이 여러 가격을 훑음 · 서버 선매수 A3 판정은 bs `'2'` 만). 주문 묶기 정본 「msg_seq 순서에서 B6 사이의 A3 묶음 = 주문 하나 · A3 msg_seq 가 바로 앞 A3 + 1 이면 같은 주문」 [VERIFIED: `krx-a3-zero-quote.md:19-20`].
7. 세션 코드 범례: 동시호가 B6 세션 KRX `10·20·30·80` / NXT `20·22·24·26` · VI `50·51·52·54` [VERIFIED: `limit-chaser.md:142-143`] · 정규 연속 40 [ASSUMED: 픽스처 13시 컷의 `s40` 관측뿐 — 코드 표 원문 확인 필요].
8. 마감 정리(15:30·15:40·20:00) · 보드 Blocked 구간 한 줄씩(trading-rules §4 · limit-chaser §0-2 박스).
9. kind 9 사유 사전(§Pattern 9 표) · 주문로그 문장 꼴 해설(`[시각][주문번호][구분] 거래소 | 종목 | 행위 · 본문 | 누적 N`).
- 캐시: system 블록 하나 + `cache_control: {type:"ephemeral"}`. 6~9K 토큰이면 첫 진단 쓰기 ≈ $0.04, 5분 안 재사용 읽기 ≈ $0.002.

### Pattern 9: kind 9 「상태전이」 43칸 매핑 노트 초안 (D-09 · costly 계약)

**원천 사실(검증):**
- `enum StrategyEventKind` — `// 9 는 gh-radar 예약 요청 중이라 비워 둔다(사용 금지).` · `BurstLimit = 10` … `LaunchHead = 18` [VERIFIED: `../gh-trade/server/src/protocol/StockDMA.fbs:1450-1485`].
- `table StrategyEvent { // 43 필드 …}` — 칸 순서 `seq, trade_date, gw_time_ms, kind, group, exchange, isin, cum_volume, dma_user_id, account_no, order_no, price, qty, order_condition, reason_code, cond_threshold, cond_actual, cond_metric, ev_kind, ev_price, ev_qty_before, ev_qty_after, ev_trade_qty, limit_bid_qty, bid1_price, bid1_qty, accept_latency_us, immediate_fill_qty, queue_case, base_cum, ahead_qty, expected_cum, error_volume, remaining_volume, has_remaining, cancel_reason, result_code, message, entry_round, snap_qty, snap_cum, ask_qty_at_limit, open_at_limit` · `reason_code: string; // 서버 OrderReasonName 원문` · `base_cum: ulong;` · `ahead_qty: ulong;` · `expected_cum: ulong;` · `queue_case: byte;` [VERIFIED: `StockDMA.fbs:1546-1590`].
- 설정 갱신 로그: `"[LimitChaser] 설정 갱신 isin={:.12s} 계좌={:.12s} 후매수={}→{} 단계={} 하한={}→{}주 반등률={}% 발동잔량={}→{}{} "` `"주문수량={}주 줄매수={} 하한={} 상한={} 매도기준선={}({}) 취소기준선={}({}) 마스크={} SOR=매수{}/매도{} 위험도={}({}%)"` — **relay 재제출마다 1줄(초당 1회꼴)** 이고 마스크 토큰은 `DescribeMask` = `"전체"` 또는 `"0x{:X}({}비트)"` [VERIFIED: `../gh-trade/server/src/trade/strategy/LimitChaser.cpp:2676-2695` · `LimitChaserChangeMask.h:269-271`].
- 변경 마스크 54비트(0~53) 그룹: 매수 공통 0-2 · 선 3-13 · 줄 14-22 · 후 23-29 · 매도 30-40 · 취소 41-45 · 자동매도 46-49 · SOR 50-51 · 위험도 52-53 · 「54~63 예약 — 새 칸은 54부터 append」 [VERIFIED: `LimitChaserChangeMask.h:27-82 · 86-100`]. 개별 비트 예: `kMaskBuyEnabled = 1ULL << 0` · `kMaskPreBuyEnabled = 1ULL << 3` · `kMaskExtraBuyEnabled = 1ULL << 14` · `kMaskPostBuyEnabled = 1ULL << 23` · `kMaskSellEnabled = 1ULL << 30` · `kMaskCancelQtyEnabled = 1ULL << 41` · `kMaskAutoSellEnabled = 1ULL << 46` · `kMaskSorBuy = 1ULL << 50` · `kMaskSellRiskEnabled = 1ULL << 52`.
- 상따 전략 인스턴스는 **(isin, 계좌)** 단위다(로그 `isin={} 계좌={}`) → kind 9 행은 반드시 `account_no` 를 채워야 보인다(gh-radar 가시성 · relay 팬아웃 모두 `accounts.has(row.accountNo)` [VERIFIED: `relay/src/ws/fanout.ts:3358`]).
- 감사 칸 `dma_user_id` 는 gh-radar 가 **반환하지 않는다**(T-19-08) → 「누가」 는 다른 칸에 실어야 화면에 보인다.

**초안 — 공통 칸**

| 칸 | kind 9 의미 |
|---|---|
| `seq` · `trade_date` · `gw_time_ms` | 전이 시각(설정 적용 순간 / 서버 자동 전이 순간) |
| `kind` | `9` (StateTransition) |
| `group` | 단일 그룹 전이면 그 `OrderGroup`(1 선 · 2 줄 · 3 후 · 9 자동매도), 그 밖(마스터 · 매도 · 취소 · 위험도 · SOR · 여러 그룹) **0** |
| `exchange` · `isin` | 그 LimitChaser 키 |
| `cum_volume` | 전이 시점 그 거래소 A3 누적(맥락) |
| `dma_user_id` | 그 전략 소유 DMA 사용자(감사 칸 — gh-radar 비반환) |
| `account_no` | **필수**(가시성 키 — 비면 아무도 못 본다) |
| `order_no` · `price` · `qty` | 원인 주문(발주로 생긴 자동 꺼짐 · 후매수 발동 등) — 없으면 `""`/0 |
| `order_condition` | **제출자 식별 문자열**(사람 제출 행만 · 예 `milles` · 서버 행 `""`) — 화면 「(milles)」 |
| `reason_code` | 사유 토큰(아래 표 · **접두 대역** = 사람/서버 구분의 정본) |
| `base_cum` | `SetLimitChaser.change_mask` 54비트 원값(사람 제출 행 · 서버 행 0) |
| `ahead_qty` | **스위치 비트셋 전** (아래 비트 표 · 화면이 본 cfg = 접힘 반영 에코 기준) |
| `expected_cum` | **스위치 비트셋 후** |
| `cond_threshold` · `cond_actual` | 단계형 상태의 전 → 후(후매수 단계 0 꺼짐 · 1 감시 · 2 보유중 · 3 소진 / 위험도 래치 0 대기 · 1 무장 · 2 발동 — 사유별 표) |
| `ev_qty_before` · `ev_qty_after` | 사유가 정한 **주요 값 하나** 전 → 후(예 후매수 발동잔량 · 하한 · 위험도 %) |
| `message` | 바뀐 값 요약 — 서버 로그 「설정 갱신」 토큰 낱말 그대로, 바뀐 칸만 (예 `감시가 10,000→10,100 · 주문수량 500→600주`) · 없으면 `""` |
| 나머지(`cond_metric` · `ev_kind` · `ev_price` · `ev_trade_qty` · `limit_bid_qty` · `bid1_*` · `accept_latency_us` · `immediate_fill_qty` · `queue_case` · `error_volume` · `remaining_volume` · `has_remaining` · `cancel_reason` · `result_code` · `entry_round` · `snap_*` · `ask_qty_at_limit` · `open_at_limit`) | 0 / `""` / 빈 벡터 / false — 2차 예약 |

**스위치 비트셋(`ahead_qty` 전 · `expected_cum` 후)** — bit0 매수 마스터(`buy_enabled`) · bit1 선매수(`pre_buy_enabled`) · bit2 줄매수(`extra_buy_enabled`) · bit3 후매수(`post_buy_enabled`) · bit4 매도(`sell_enabled`) · bit5 취소(셋 중 하나) · bit6 자동매도 · bit7 SOR 매수 · bit8 SOR 매도 · bit9 위험도 · bit10 선매수 ☐체결량(`buy_trade_qty_enabled`) · bit11 선매수 ☐한방(`sweep_enabled`) · bit12 줄매수 ☐자동(`extra_buy_auto`) · bit13 후매수 ☐자동(`post_buy_auto`) · 14~63 예약(append-only).

**사유 토큰(`reason_code`) — 접두 대역**

| 대역 | 토큰 | 언제 | 1차/2차 |
|---|---|---|---|
| `Cfg*` 사람 | `CfgSubmit` | 사람 제출로 스위치 또는 값이 **실제로 바뀜**(같은 값 재제출 = 행 없음) — 13:10:25 「선매수 다시 켜짐」 = bit1 0→1 | 1차 |
| | `CfgRearm` | 스위치 값은 그대로인데 체크 비트 ON 재제출로 소진 게이트가 다시 열림 | 1차 |
| `Auto*` 서버 판정 | `AutoPreBuyOff` | 선매수 1회 발주 뒤 ☐선매수 자동 해제(order_no = 그 발주) — 13:08:18 사례 | 1차 |
| | `AutoAddBuyOff` / `AutoAddBuyGiveUp` | 줄매수 발주 뒤 해제 / 최대 초과 포기(체크 해제) | 1차 |
| | `AutoAddBuyRecheck` | 줄매수 ☐자동 재체크 | 1차 |
| | `AutoPostBuyUnlock` / `AutoPostBuyRelock` / `AutoPostBuyFire` | 후매수 잠금해제 / 다시 잠김(상한가 풀림 · 동시호가) / 발동(매도·취소 켬 · 취소잔량 ×0.8) — `cond_threshold→cond_actual` 단계 · `ev_qty_*` 발동잔량 | 1차 |
| | `AutoMasterOff` | 마스터 해제(선·줄·후 모두 접힘) | 1차 |
| | `AutoRiskLatchOn` / `AutoRiskLatchReset` / `AutoRiskFire` | 위험도 래치 켜짐 / 리셋 / 발동 | 1차 |
| `Sys*` 서버 운영 경로 | `SysCloseOff` · `SysKillSwitch` · `SysRestore` · `SysCommand` | 15:40/20:00 정리 · 킬 스위치(전체/행 끄기) · 재기동 복원 · 41 명령 | 1차 |
| `Latch*` | `LatchSellOn` · `LatchCancelOn` | 매도 · 취소 진입 확인 래치 켜짐 | **2차 · 이번 구현 제외** |
| `Gate*` | `GateSessionBlocked` · `GateConsumed` | 조건 성립했으나 세션 가드(Blocked) · 게이트 소진으로 미발주 — **상태 바뀔 때만 1행**(틱마다 금지) | **2차 · 이번 구현 제외** |
| `Vi*` | `ViNoOrder` | VI 미발주 사유 | **2차 · 이번 구현 제외** |

**노트에 반드시 적을 운영 조건**: ① 같은 값 재제출(ON→ON · 초당 1회꼴 relay 재제출)은 **행을 만들지 않는다** — 바뀐 스위치/값이 있을 때만 ② 80 저널(관찰자) 필수 · 82 실시간 송신 여부는 gh-trade 판단(질문) ③ `account_no` 필수 ④ 와이어 무변경(enum 값 `StateTransition = 9` 와 주석만 · relay `sync-relay-schema.sh` 는 gh-trade 소유).
**노트 질문(초안):** Q1 제출자 식별(relay 재제출이 어느 세션 신원으로 오는가 · `order_condition` 에 무엇을 실을 수 있나) Q2 `CfgRearm` 이 실제로 구분 가능한가 Q3 82 송신 여부 Q4 하루 예상 행 수(계좌·종목당).
**배포 순서 문단:** gh-trade 서버 먼저 배포는 **기술적으로는 안전(relay 원문 적재)하지만, gh-radar webapp(D-10) 이 먼저 나가야 주문로그 탭에 「9」 원문 숫자 행이 보이지 않는다**(Pitfall 7) — 노트에 「gh-radar webapp 배포 확인 뒤 gh-trade 배포」 를 요청.
**절차:** `scripts/trade-handoff.sh chatbot-kind9-mapping`(slug 정규식 `^[a-z0-9-]{1,40}$` 통과 · 결과 `<gh-trade>/docs/inbox/from-gh-radar/YYMMDD-chatbot-kind9-mapping.md` · 덮어쓰기 금지 · 커밋 안 함) [VERIFIED: `scripts/trade-handoff.sh`] → TODO 채움 → gh-trade 세션 SendMessage → 같은 커밋에서 `docs/inbox/from-gh-trade/261105-chatbot-diagnosis-kind9.md` 를 `status: done` + `done_commit`(경로 지정 add). 노트 안에 인박스 질문 3개 답(① API tool use · Opus 5.5 진단 전문가 · 조회 도구 신설 ② 지난 날짜도 연다(D-12) ③ kind 하나 + `reason_code` 접두 대역)도 적는다.

### Pattern 10: 웹 주문로그 탭 (D-10) — 최소 변경

- `packages/shared/src/strategy-event.ts` `STRATEGY_EVENT_KIND` 에 `StateTransition: 9` 추가(현재 `Rejected: 8` 다음이 `BurstLimit: 10`) [VERIFIED: :20-37]. **`isMarketStrategyEvent` 에는 넣지 않는다**(계좌 이벤트).
- `strategy-event-labels.ts:28` 주석 자리를 `9: "상태전이",` 로 교체 · `STATE_REASON_LABELS`(토큰 → 문구, 예 `AutoPreBuyOff: "선매수 꺼짐(1회 발주)"`) — 문구는 gh-trade 구현 노트 회신 뒤 낱말로 맞춘다(초안은 우리 표 기준).
- **`strategyEventSide(group, kind)` 는 지금 group 만으로 1~3 → buy 를 돌려준다**(`if (group >= 1 && group <= 3) return "buy";` [VERIFIED: :226-227]) → kind 9 에 group 1 이 실리면 매수 색이 된다. **함수 첫 줄에 `if (kind === 9) return null;`** 추가.
- `strategy-event-text.ts` `strategyEventParts` 에 `case 9:` — `badge: "상태전이"` · tone 은 새 `"state"`(회색) 또는 기존 `"unknown"` 재사용(UI-SPEC) · body = 사유 문구 + 스위치 전→후 차이(`선매수 꺼짐→켜짐`) + 제출자 `(milles)` + `message`. 기본 분기(:192)는 지금 `badge: orderGroupLabel(ev.group) ?? String(ev.kind)` · `action: String(ev.kind)` 이라 미처리 시 「선매수 · 9」 같은 줄이 된다. `timelineStrategyText` 도 같은 case.
- `webapp/src/lib/order-log-feed.ts`: `OrderLogKindFilter` 에 `'state'` · `ORDER_LOG_KIND_FILTERS` 에 `{ value: 'state', label: '상태전이' }`(위치 UI-SPEC — 「시세」 앞 권고) · `matchesKind`: `if (kind === 'state') return row.kind === 9;` 그리고 그룹 칩(pre/add/…)은 **kind 9 를 제외**(`!market && row.kind !== 9 && KIND_GROUPS[kind].includes(row.group)`) — 「선매수」 칩에 설정 이력이 섞이지 않게(UI-SPEC 에서 뒤집을 수 있음). URL `kind=state` 파싱은 `KINDS` 집합에 자동 포함되는지 확인 [VERIFIED: :38-61 · 109-128 · 289-292].
- 팝업 `matchesSide`: kind 9 는 tone 이 buy/sell 이 아니라 「전체」 에만 보인다(현 규칙 그대로 — 방향을 짓지 않는다).
- 요약 줄 `kind 3·6·5·8·7` 카운트에는 영향 없음.
- `order-log-list.tsx` `TONE_CLASS: Record<StrategyEventParts['tone'], string>`(:91) — tone 유니온에 `"state"` 를 더하면 여기서 타입 오류로 잡힌다(누락 방지).

### Anti-Patterns to Avoid
- **진단 루프에서 tools 를 빼고 마무리 콜:** prefix 변경 → thinking 블록 무효(새 계정 400). `tool_choice:{type:"none"}` + 지시 text 로.
- **팀장 프롬프트만으로 「그대로 옮겨라」:** 글자 일치 보장 없음(D-01 위반 위험).
- **도구 스키마에 `account_no` · `server` · `user` 같은 칸:** SC-2 위반. 계좌 선택은 RPC 안 가시성만.
- **`zlib.zstdDecompressSync(전체 tickgw 바이트)`:** 첫 프레임만 풀려 시세가 조용히 빈다.
- **하루치 풀린 바이트를 메모리에 통째로:** 512Mi · concurrency 80.
- **시세를 JSON 으로:** 키 반복으로 토큰 2~3배.
- **서버가 버스트 묶기 · 단일가 판정 결과만 요약:** D-06 기각안.
- **`dma_journal_orders_for_user_json` 재사용:** `gateway` 없음 · 하루 전 종목 · 켜진 서버 조인 불가.
- **`temperature` 지정 · 면책 문구 재도입:** 프로젝트 lesson.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| A3/B6 디코드 | 새 오프셋 파서 | `@gh-radar/shared` `iterRecords` · `decodeAny` · `LAYOUTS` | 파이썬 정본 골든 테스트로 잠김(D-19) |
| 다중 zstd 프레임 | 직접 매직 스캔 | `splitZstdFrames` + `concatBytes` | Node zstd 첫 프레임 함정 이미 해결 |
| tickgw 상태 처리 | 새 프로토콜 해석 | `createTickgwClient().live` + 워커 `fetchLiveDay` 상태표 | loading/queued/delayed/409/More 규약 |
| 변환 요청 | 새 RPC · Job 호출 | `requestTickConvert`(should_trigger · 상한 · 되돌림) | 상한 공유 · (날짜, 거래소)당 1회 |
| 주문로그 문장 | 새 문장 조립 | `orderLogLineText` · 라벨 사전 | 웹과 같은 낱말(D-10) |
| 전략 이벤트 매핑 | 새 DTO | `toStrategyEventRow`(RPC 원소를 같은 꼴로) | relay · server · web 한 벌 |
| 종목 검색 | 새 검색 RPC | `stocks` ilike + `sanitizeSearchTerm` + ETP 블랙리스트 | 기존 전역 검색 규칙 |
| 일일 카운터 | 새 표 | `incr_api_usage(p_service, p_date, p_amount)`(원자 증가 · 누적 반환) | 이미 service_role 전용 [VERIFIED: `20260417120000_api_usage.sql:23-41`] |
| SSE 이벤트 | 새 이벤트 타입 | 기존 `text` · `agent_start/end` | D-03 · 웹 무변경 범위 최소 |

**Key insight:** 이 phase 의 새 코드는 「Opus 루프 + 텍스트 직렬화 + RPC 1개 + 라벨」 뿐이고, 디코드 · 변환 · 문장 · 가시성은 전부 기존 정본을 재사용해야 웹 · 틱뷰어 · 진단문의 숫자가 같아진다.

## Common Pitfalls

### Pitfall 1: Opus 5.5 preserved thinking — 마무리 콜에서 tools 제거
**What goes wrong:** 라운드 상한 도달 시 팀장 루프처럼 tools 없이 요약 콜 → thinking 블록 무효(2026-08-31 이후 생성 계정은 400 · 그 전 계정은 조용히 추론 손실).
**How to avoid:** 진단 루프는 append-only · 같은 tools · `tool_choice:{type:"none"}` · 지시 text 블록. finalMessage.content 전체(thinking 포함)를 그대로 되싣는다.
**Warning signs:** `invalid_request_error` 에 thinking/prefix 문구.

### Pitfall 2: Cloud Run 300초 · 진단 지연
**What goes wrong:** Opus 다중 라운드 + 팀장 앞뒤 라운드가 300초를 넘으면 요청이 끊기고 저장도 안 된다.
**How to avoid:** 진단 벽시계 마감 150초(env) · 라운드 8 · effort medium 기본 · 마감 초과 시 마무리 콜. 로그에 `durationMs`.
**Warning signs:** `[chat] stream error` 없이 `done` 미도착 · Cloud Run 504.

### Pitfall 3: 512Mi 메모리
**What goes wrong:** 활발한 종목 하루 격자를 통째로 풀면 수십~100MB, 동시 진단이면 OOM.
**How to avoid:** 프레임/스트림 단위 해제 + 창 밖 즉시 폐기 · 진단 실행 단위 메모만 · 전역 캐시 금지.

### Pitfall 4: tickgw 활성 키 8개 · queued
**What goes wrong:** 진단이 `queued` 에서 무한 대기하거나 다른 사용자 틱뷰어를 밀어낸다.
**How to avoid:** 최대 20초 · 그 뒤 `자료 없음: 당일 시세 대기열`. 진단 1건이 같은 키를 반복 touch 하지 않게 실행 단위 메모.

### Pitfall 5: bs 공백이 빈 문자열로 사라짐
**What goes wrong:** `parseStr` 가 오른쪽 공백을 지워 `final_bs_code` `' '` → `""` · 줄에 `b` 만 남아 모델이 판정 근거를 못 본다(SC-1 ②).
**How to avoid:** 포맷에서 `""` → `b_` 로 명시하고 범례에 「_공백=단일가(판정·누적 제외)」.

### Pitfall 6: kind 9 가 매수 색 · 선매수 칩으로 분류
**What goes wrong:** `strategyEventSide` 가 group 만 봐서 group 1 kind 9 를 매수로 칠한다 · `matchesKind('pre')` 에 섞인다.
**How to avoid:** `kind === 9 → null` 선행 · 그룹 칩에서 kind 9 제외 · 단위 테스트.

### Pitfall 7: 「구 relay 는 kind 9 를 무시」 는 사실이 아님
**What goes wrong:** relay 에 kind 화이트리스트가 없어(`toStrategyApplyEvent` 순수 매핑 · `dma_strategy_apply` CHECK 없음 · 팬아웃은 `isMarketStrategyEvent || accounts.has`) gh-trade 가 먼저 배포하면 **지금 relay 가 kind 9 를 즉시 적재 · 계좌 소유자에게 푸시**하고, 지금 webapp 은 「선매수 · 9」 같은 원문 행을 그린다 [VERIFIED: `relay/src/journal/strategy-stream.ts:121-166` · `relay/src/ws/fanout.ts:3355-3360` · `20260929180000_dma_strategy_events.sql` 주석 「enum 칸 … CHECK 없음」].
**How to avoid:** gh-radar webapp(D-10) 을 먼저 배포하고, 노트에 그 순서를 요청. relay 코드 변경은 불필요(성공 기준 4 「relay」 단계 = 무변경 확인 + 적재 관측).

### Pitfall 8: kind 9 재제출 폭주
**What goes wrong:** gh-trade 가 「설정 갱신」 로그처럼 재제출마다 행을 만들면 계좌·종목당 초당 1행 → 하루 수만 행.
**How to avoid:** 노트에 「바뀐 칸이 있을 때만」 을 계약으로 적고, gh-radar 쪽 pgTAP/관측에서 첫 적재일 행 수 확인.

### Pitfall 9: 진단문 이중 표시 / 저장 불일치
**What goes wrong:** SSE 로 흘린 진단문을 `accumulatedText` 에 안 더하면 재시도 `text_clear` 뒤 사라지고 DB 저장에도 빠진다 · 팀장이 다시 요약하면 두 번 보인다.
**How to avoid:** emit 과 누적을 한 함수에서 · 팀장 tool_result 머리 문구 · 테스트로 「SSE text 합 == 저장 content」.

### Pitfall 10: 시각 기준 혼선
**What goes wrong:** 게이트웨이 `gw_time_ms`(KB120 서버 시계) · A3 `trade_time`(거래소 시각) · `recv_ns`(119 수신)가 ms 단위로 어긋나 「발주가 체결보다 먼저」 같은 오판.
**How to avoid:** 지식 프롬프트에 「세 시계는 다를 수 있다 · 몇 ms 차이로 인과를 단정하지 말 것」 · 시세 줄은 거래소 시각, 틱 링크 `t` 는 수신 시각임을 명시 [ASSUMED: 시계 오차 크기 미측정].

### Pitfall 11: SDK 0.65 타입 공백
**What goes wrong:** `output_config` · `strict` 를 객체 리터럴에 넣으면 타입 오류 → 실행자가 지우면 effort 가 기본 `medium` 으로 조용히 떨어지거나(의도 불일치) 빌드가 깨진다.
**How to avoid:** 진단 모듈에 `type OpusStreamParams = Anthropic.MessageStreamParams & { output_config: { effort: Effort } }` 한 곳 정의 + 단위 테스트가 `stream` mock 의 첫 인자에서 `output_config.effort` · `model` · `tool_choice` 부재를 검사.

## Code Examples

### 진단 루프 골격 (SDK 0.65 · 단언 한 곳)
```typescript
// Source: claude-api skill(Opus 5.5 · effort · append-only) + 기존 chat-service.ts 스트림 패턴
import type Anthropic from "@anthropic-ai/sdk";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
type OpusParams = Anthropic.MessageStreamParams & { output_config: { effort: Effort } };

const MAX_ROUNDS = 8;

export async function runDiagnosisLoop(client: Anthropic, cfg: { model: string; effort: Effort },
  system: Anthropic.TextBlockParam[], tools: Anthropic.Tool[], question: string,
  dispatch: (b: Anthropic.ToolUseBlock) => Promise<Anthropic.ToolResultBlockParam>,
  signal: AbortSignal, deadlineMs: number) {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
  for (let round = 0; ; round++) {
    const last = round >= MAX_ROUNDS - 1 || Date.now() > deadlineMs;
    const params: OpusParams = {
      model: cfg.model,                      // "claude-opus-5-5" (config 기본값)
      max_tokens: 32000,
      system,                                // 지식 프롬프트 · cache_control
      tools,                                 // 매 라운드 같은 배열(prefix 불변)
      ...(last ? { tool_choice: { type: "none" } } : {}),   // 강제(any/tool) 아님
      messages,
      output_config: { effort: cfg.effort },
    };
    const stream = client.messages.stream(params as Anthropic.MessageStreamParams, { signal });
    const msg = await stream.finalMessage();
    messages.push({ role: "assistant", content: msg.content }); // thinking 블록 그대로
    if (msg.stop_reason === "refusal") return { kind: "refusal" as const, msg };
    if (msg.stop_reason !== "tool_use") return { kind: "done" as const, msg };
    const calls = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const results = await Promise.all(calls.map(dispatch));   // 한 user 메시지에 전부
    messages.push({ role: "user", content: results });
  }
}
```
(마지막 라운드가 tool_use 로 끝났는데 상한이면 `dispatch` 대신 「상한 도달 — 실행 안 함」 tool_result + 지시 text 블록을 넣고 한 번 더 — 실행자가 구현.)

### 도구 정의 (계좌 칸 없음)
```typescript
// Source: 이 리서치 §Pattern 3
export const DIAGNOSIS_TOOLS: Anthropic.Tool[] = [
  { name: "search_stock", description: "종목 이름·코드로 ISIN·코드·시장을 찾는다. 질문에 종목명이 있으면 먼저 부른다.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "get_order_log", description: "그날 사용자가 볼 수 있는 계좌의 주문·체결·전략 이벤트(발주 사유·조건 실측)·상태전이를 시간순으로 준다.",
    input_schema: { type: "object", properties: { date: { type: "string" }, isin: { type: "string" },
      from: { type: "string" }, to: { type: "string" } }, required: [] } },
  { name: "get_market_ticks", description: "체결(A3)+호가(B6) 원본 한 줄씩. 최대 60초·400건. 처음엔 사건 시각 −10초~+5초로 부른다.",
    input_schema: { type: "object", properties: { isin: { type: "string" }, exchange: { type: "string", enum: ["KRX", "NXT"] },
      date: { type: "string" }, from: { type: "string" }, to: { type: "string" } },
      required: ["isin", "exchange", "date", "from", "to"] } },
];
```

### RPC 골격
```sql
-- Source: 20261104100000_tick_own_for_user.sql 패턴
CREATE FUNCTION public.dma_diagnosis_for_user(p_user_id uuid, p_trade_date date, p_isin text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_vis text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  END IF;
  SELECT coalesce(array_agg(v.gateway || '|' || v.account_no), ARRAY[]::text[]) INTO v_vis
    FROM public.dma_visible_accounts(p_user_id) v;
  RETURN jsonb_build_object('access', true, 'date', p_trade_date,
    'events', (SELECT coalesce(jsonb_agg(to_jsonb(e) - 'dma_user_id' - 'applied_at'
                       || jsonb_build_object('stock_code', st.code)
                       ORDER BY e.gw_time_ms, e.gateway, e.seq), '[]'::jsonb)
                 FROM public.dma_strategy_events e
                 JOIN public.dma_servers s ON s.key = e.gateway AND s.enabled
                 LEFT JOIN public.stocks st ON st.isin = e.isin
                WHERE e.trade_date = p_trade_date
                  AND (p_isin IS NULL OR e.isin = p_isin)
                  AND e.kind NOT IN (15, 16, 17, 18)
                  AND ((e.kind NOT IN (1, 2, 10) AND (e.gateway || '|' || e.account_no) = ANY (v_vis))
                    OR (e.kind IN (1, 2, 10) AND p_isin IS NOT NULL
                        AND EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id) v WHERE v.gateway = e.gateway))))
    -- 'orders' · 'fills' 는 tick_own_for_user 의 같은 꼴(종목 조건만 p_isin NULL 허용)
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.dma_diagnosis_for_user(uuid, date, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_diagnosis_for_user(uuid, date, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_diagnosis_for_user(uuid, date, text) TO service_role;
```

### tickgw 다중 프레임 해제
```typescript
// Source: workers/tick-convert/src/modes/promote.ts:133-135 · shared framing.ts:90-98
import zlib from "node:zlib";
import { splitZstdFrames, iterRecords, decodeAny } from "@gh-radar/shared";
for (const frame of splitZstdFrames(compressed)) {
  const raw = new Uint8Array(zlib.zstdDecompressSync(frame));
  for (const r of iterRecords(raw)) { /* decodeAny → 창 판정 → 한 줄 */ }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `thinking: {type:"disabled"}` 전문가 1콜 | Opus 5.5: thinking 끌 수 없음 · `output_config.effort` | Opus 5.5 | 진단 전문가는 thinking 생략 + effort 명시 |
| 강제 `tool_choice` 로 도구 유도 | `auto`(+ 프롬프트) · `none` 만 허용 | Opus 5.5 · Fable 5.1 | 마무리 콜은 `none` |
| 도구 사이 text 블록 | progress-update thinking 블록 | Opus 5.5 | 진단문 = end_turn text |
| 요약 콜에서 tools 제거 | append-only(preserved thinking) | 2026-08-31 계정 강제 | 팀장 recovery 패턴을 진단에 복제 금지 |

**Deprecated/outdated:** CONTEXT 의 「`packages/shared/src/krxTick.ts` A3/B6 디코더」 표기 — 그 파일은 호가 단위 표다. 디코더는 `packages/shared/src/ticks/*`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 숫자 위주 줄 ≈ 2.5자/토큰 → A3 ≈ 24 · B6(5단) ≈ 58 · M=400 ≈ 20K 토큰 | Pattern 5 | 실제가 더 많으면 컨텍스트·비용 증가 → Wave 0 `countTokens` 실측으로 M 조정 |
| A2 | effort `medium` 으로 시험 문항 ①·② 를 맞힌다 | Pattern 2 | 못 맞히면 `high` 전환(지연 증가 · 300초 여유 확인) |
| A3 | 비용 ≈ $0.5/건(전형) · 상한 ≈ $1.5/건 | 비용 가드 | 일일 상한 수치 재조정 |
| A4 | 일일 상한 전역 200건 · 사용자당 20건 | 비용 가드 | 사용자 결정 필요 |
| A5 | 정규 연속 세션 코드 = 40 | Pattern 8 | 지식 프롬프트 오기 → 코드 표 원문 확인 후 기재 |
| A6 | `(trade_date, isin, exchange) WHERE kind NOT IN (15,16)` 인덱스가 필요 | Pattern 4 | 불필요 인덱스(쓰기 비용 소폭) |
| A7 | 게이트웨이 · 거래소 · 수신 시계 오차가 ms 단위로 판정을 흔들 수 있다 | Pitfall 10 | 프롬프트 경고가 과하거나 부족 |
| A8 | kind 9 칸 배치(order_condition=제출자 · base_cum=마스크 · ahead_qty/expected_cum=비트셋) 를 gh-trade 가 수용 | Pattern 9 | gh-trade 회신으로 재배치 — 노트 발송 전 사용자 검토 권고(costly) |
| A9 | kind 9 를 「선매수」 등 그룹 칩에서 제외 | Pattern 10 | UI-SPEC 에서 뒤집을 수 있음 |
| A10 | 진단 전문가는 어드민 전 계좌 우회 없음 | Pattern 4 | 운영자가 챗봇으로 남의 주문을 보려면 막힘 — Open Q1 |

## Open Questions

1. **어드민 전 계좌 우회** — Phase 38 `tick_own_for_user` 는 admin 이면 전 계좌, 주문로그 RPC 는 아니다. 권고: 우회 없음(SC-2 · ROADMAP 「웹 조회 RPC 범위 그대로」). 운영자 필요하면 후속.
2. **「누가」 노출과 T-19-08** — `dma_user_id` 는 반환 금지 원칙인데 D-10 예시 「(milles)」 는 제출자를 보여 준다. 권고: 감사 칸이 아닌 `order_condition` 에 gh-trade 가 표시용 식별자를 싣고(공유 계좌 상호 노출은 운영자 결정 2026-11-05 로 허용), 노트 Q1 로 확인.
3. **시험 문항 실데이터** — 11/5 금양그린파워 KRX 격자는 오늘 밤 nightly 대상(매집 등록 ∪ +15%)일 때만 생긴다. 아니면 11/6 UAT 첫 질문이 변환 요청을 건다(상한 1 소모 · 수 분). UAT 계정은 milles KB120 계좌가 가시 계좌인 사용자여야 한다.
4. **server-side fallback(refusal)** — skill 은 Opus 5.5 코드에 `fallbacks` 기본 opt-in 을 권고. 금융 진단은 분류기 대상이 아닐 가능성이 높아 기본 미적용 + refusal 로그만 권고 — 사용자 확인.
5. **진단 일일 상한** — `incr_api_usage('chat_diagnosis', KST 오늘, 1)` 전역 + `'chat_diagnosis:<uuid>'` 사용자별(RPC 1회 추가). 수치 사용자 확인(A4). `chatRateLimit`(IP · 60초 20회 · 인스턴스 메모리)은 그대로 두되 비용 가드로는 부족.
6. **시험 문항 통합 테스트** — 실 API 호출(≈ $0.5) · 실데이터 필요 → **기본 CI 제외 · `RUN_DIAGNOSIS_LIVE=1` opt-in 스크립트** 권고, 자동 판정은 진단문에 `스윕호가변경` · `160,463` · `단일가`/`bs 공백` 포함 여부 문자열 검사.

## 비용 가드 (재량 권고)

- 진단 1건: 라운드 8 · 시세 4회 · 누적 입력 600K 토큰 · 150초 — 넘으면 마무리 콜.
- 일일: `CHAT_DIAGNOSIS_DAILY_CAP`(전역, 기본 200) · `CHAT_DIAGNOSIS_USER_DAILY_CAP`(기본 20) — `incr_api_usage` 원자 증가 뒤 초과면 진단 전문가가 「오늘 진단 한도 소진」 텍스트를 돌려주고 Opus 호출 0회 [ASSUMED 수치].
- 추정 비용 [ASSUMED]: 전형(5 라운드 · 시세 2회) 입력 누적 ≈ 128K(캐시 쓰기 ≈ 49K × $5/M ≈ $0.25 + 읽기 ≈ $0.01) + 출력 ≈ 12K × $20/M ≈ $0.24 → **≈ $0.5/건** · 최악 ≈ $1.5/건. 200건/일 상한이면 최악 $300/일 — 사용자 확인.
- 비용은 사용자 수 비례지만 **원본(외부) 호출은 0** — 성공 기준 5 의 「원본 스크래핑·on-demand fetch 없음」 충족(외부 KRX 원본 fetch 없음 · tickgw/격자/RPC 는 내부 자료).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node (로컬) | 서버 테스트 | ✓ | v24.21.0 | — |
| Node zstd (운영 이미지 `node:22-alpine`) | 시세 해제 | ✓(22.15+ 가정 — 떠 있는 태그) | — | Dockerfile 에 `node:22.15`+ 고정 또는 `node:24-alpine`(워커 선례) [ASSUMED: 현재 태그 해석 버전 미확인] |
| Docker + `public.ecr.aws/supabase/postgres:17.6.1.104` | pgTAP | 러너가 로컬 이미지만 사용(없으면 멈춤) | — | `docker pull` 은 직접 실행(메모리 「로컬 준비는 직접」) |
| tickgw(radar-gw 8092) · `TICKGW_URL` | 당일 시세 | 운영만 | — | 로컬은 가짜 tickgw(127.0.0.1) 또는 mock |
| ANTHROPIC_API_KEY | 실 API UAT | 운영 Secret · 로컬 `server/.env`(읽지 않음) | — | 단위 테스트는 SDK mock |
| `../gh-trade` 형제 저장소 | trade-handoff 노트 | ✓ | — | `TRADE=<경로>` |

**Missing dependencies with no fallback:** 없음.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest — server ^4.1.4(node · `maxWorkers` 기본 2) · shared ^4 · webapp ^2.1.9(jsdom) · pgTAP(러너 `scripts/verify-dma-orders-price-check.sh --test`) |
| Config file | `server/vitest.config.ts`(include `tests/**/*.test.ts` + `src/**/*.test.ts`) · `packages/shared/vitest.config.ts` · `webapp/vitest.config.ts` |
| Quick run command | `pnpm --filter @gh-radar/server exec vitest run src/services/specialists/__tests__/diagnosis.test.ts --maxWorkers=2` |
| Full suite command | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run --maxWorkers=2` |

**경로 검증:** Phase 38 이 쓴 `tests/routes/chat.test.ts` 는 **없다**. 실제 챗 테스트는 `server/src/routes/__tests__/chat.route.test.ts` · `server/src/services/__tests__/chat-service.test.ts` · `chat-orchestrator.test.ts` · `server/src/services/specialists/__tests__/specialists.test.ts` · mock 픽스처 `server/src/services/__tests__/anthropic-mock.ts` [VERIFIED: ls]. 틱 라우트 테스트 `server/tests/routes/ticks.test.ts` · `ticks-live.test.ts` · 클라이언트 `server/tests/services/tickgw-client.test.ts` 존재. pgTAP 선례 `supabase/tests/tick_own.test.sql` · `dma_strategy_read.test.sql` 존재.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC-2 | RPC: 가시 계좌만 · 다른 사용자 계좌 0행 · 매핑 없음 `{access:false}` · 꺼진 서버 제외 · `dma_user_id` 비반환 · anon/authenticated EXECUTE 0 · kind 9(계좌 有) 포함 · kind 9(계좌 空) 비공개 · 15·16·17·18 제외 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_diagnosis.test.sql` | ❌ Wave 0 |
| SC-4(DB) | 기존 `dma_strategy_events_for_user_json` 이 kind 9 를 가시 계좌에만 돌려줌(변경 없음 고정) | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_read.test.sql` | ✅(케이스 추가) |
| SC-2 | 도구 스키마에 계좌/사용자 칸 0 · 디스패처가 `ctx.userId` 로만 RPC 호출(인자 정확히 3개) · 모델이 `account_no` 를 넣어도 무시 | unit | `pnpm --filter @gh-radar/server exec vitest run src/services/specialists/__tests__/diagnosis-tools.test.ts --maxWorkers=2` | ❌ Wave 0 |
| SC-3 | 진단 스트림 첫 인자 `model === "claude-opus-5-5"` · `output_config.effort` 존재 · `thinking` 미지정 · `tool_choice` 강제 없음 · 팀장은 `claude-sonnet-5` · `[chat] usage` 에 `models` 두 키 | unit(SDK mock) | `pnpm --filter @gh-radar/server exec vitest run src/services/specialists/__tests__/diagnosis.test.ts src/services/__tests__/chat-service.test.ts --maxWorkers=2` | ❌ / ✅(케이스 추가) |
| SC-3 | 루프: 라운드 상한 · 마감 → `tool_choice:none` 마무리(tools 동일) · refusal · 빈 텍스트 시 `stopReason`+`usage` warn | unit | 위와 같음 | ❌ Wave 0 |
| D-01 | `agent_start{diagnosis}` → SSE `text` 에 진단문 원문 그대로 → 저장 content 에 포함 · 재시도 `text_clear` 뒤 재전송분에 진단문 유지 · 팀장 tool_result 머리 문구 | unit | `pnpm --filter @gh-radar/server exec vitest run src/services/__tests__/chat-service.test.ts --maxWorkers=2` | ✅(케이스 추가) |
| D-05/06/07 | 한 줄 포맷 골든(A3 bs 공백 → `b_` · B6 5단) · 60초/400건 절단 문구 · 시간순 혼합 · 다중 zstd 프레임 | unit(픽스처 `cut1300-krx.ticks.zst`) | `pnpm --filter @gh-radar/server exec vitest run src/services/specialists/__tests__/diagnosis-market.test.ts --maxWorkers=2` | ❌ Wave 0 |
| D-08 | tickgw 미결선 · status 0 · queued 20초 · 08시 전 → `자료 없음: …` · 과거 grid 없음 → requestTickConvert(capped→「한도 소진」 · triggered→「변환 중 약 N분」 · not_uploaded) | unit(mock) | 위와 같음 | ❌ Wave 0 |
| D-02 | `search_stock` ilike · ETP 제외 · sanitize | unit | `…/diagnosis-tools.test.ts` | ❌ Wave 0 |
| D-03 | 진행 스텝퍼에 「주문 진단 전문가」 표시 | RTL | `pnpm --filter @gh-radar/webapp exec vitest run src/components/chat/__tests__/message-render.test.tsx --maxWorkers=2` | ✅(케이스 추가) |
| D-04 | 내부 `/analytics/ticks?` 링크 같은 탭 · 외부 `_blank` | RTL | 위와 같음 | ✅(케이스 추가) |
| D-10 | kind 9 라벨 · `strategyEventSide(1, 9) === null` · `case 9` 문장 · timeline | unit | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run src/__tests__/strategy-event-labels.test.ts src/__tests__/strategy-event-text.test.ts --maxWorkers=2` | ✅(케이스 추가) |
| D-10 | 「상태전이」 칩 · `matchesKind('state')` · 그룹 칩 kind 9 제외 · URL `kind=state` | unit + RTL | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/order-log-feed.test.ts src/components/trading/order-log/__tests__/order-log-filters.test.tsx src/components/trading/order-log/__tests__/order-log-list.test.tsx --maxWorkers=2` | ✅(케이스 추가) |
| A1 | 토큰 실측(A3/B6 줄 · 400건 블록) | 스파이크(1회 · 무료 count_tokens · API 키 필요) | `node scripts/…/measure-diagnosis-tokens.mjs`(Wave 0 신설 · 결과를 SUMMARY 에 기록) | ❌ Wave 0 |
| SC-1 | 시험 문항 ①·② | 수동 UAT(실 API · 실데이터) + 선택 opt-in 스크립트 `RUN_DIAGNOSIS_LIVE=1` | — | manual |
| SC-4 | 노트 `status: open` 존재 · 인박스 261105 `status: done` | 파일 검사 | `grep -q '^status: open' ../gh-trade/docs/inbox/from-gh-radar/*-chatbot-kind9-mapping.md && grep -q '^status: done' docs/inbox/from-gh-trade/261105-chatbot-diagnosis-kind9.md` | — |
| SC-5 | 진단 경로에 외부 HTTP 0(Anthropic 제외) · tickgw/Storage/RPC 만 | 코드 리뷰 + unit(fetch mock 호출 대상 검사) | `…/diagnosis-market.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** 그 태스크의 파일 단위 `exec vitest run <파일> --maxWorkers=2`(watch 인 `test` 스크립트 금지) · DB 태스크는 pgTAP 1파일.
- **Per wave merge:** 건드린 패키지 전체 `exec vitest run --maxWorkers=2` + DB 웨이브면 pgTAP 2파일. 전체 회귀는 한 세션만(동시 세션 메모리 규칙).
- **Phase gate:** Full suite green + `config.json` `build_command`(shared build · relay typecheck · webapp typecheck) + UAT 시험 문항 ①·②.

### Wave 0 Gaps
- [ ] `supabase/tests/dma_diagnosis.test.sql` — SC-2 · kind 9 가시성
- [ ] `server/src/services/specialists/__tests__/diagnosis.test.ts` — 루프 · 모델 · effort · 마감 · refusal · usage
- [ ] `server/src/services/specialists/__tests__/diagnosis-tools.test.ts` — 계좌 칸 0 · userId 클로저 · zod · search
- [ ] `server/src/services/specialists/__tests__/diagnosis-market.test.ts` — 포맷 골든 · 절단 · 다중 프레임 · 자료 없음 사유 · 변환 분기
- [ ] `anthropic-mock.ts` 에 다중 라운드(tool_use → end_turn) · thinking 블록 · refusal 팩토리 추가
- [ ] 토큰 실측 스파이크(A1) — 결과로 M 확정

## Security Domain

`security_enforcement: false`(`.planning/config.json`) · 사용자 결정 「보안검사 안 함」 → ASVS 절 생략. 단 계좌 범위(SC-2)는 기능 요구로서 pgTAP · unit 으로 검증한다(위 표). 프롬프트 인젝션: 진단 도구는 전부 읽기 전용이고 계좌 인자가 없으므로 주입으로 범위를 넓힐 길이 없다 — 지식 프롬프트에 기존 `[프롬프트 인젝션 방어]` 절을 복제.

## Sources

### Primary (HIGH confidence)
- 저장소 원문(이번 세션 Read): `server/src/services/chat-service.ts` · `chat-orchestrator.ts` · `chat-prompts.ts` · `specialists/{limitup-specialist,helpers,anthropic-client}.ts` · `server/src/config.ts` · `server/src/routes/{chat,ticks,stocks}.ts` · `server/src/services/{ticks,tickgw-client}.ts` · `packages/shared/src/{chat,strategy-event,strategy-event-labels,strategy-event-text}.ts` · `packages/shared/src/ticks/{layouts,decode,framing}.ts` · `webapp/src/components/chat/{agent-progress,message-assistant}.tsx` · `webapp/src/lib/{order-log-feed,ticks/tick-url}.ts` · `relay/src/journal/strategy-stream.ts` · `relay/src/ws/fanout.ts` · `workers/tick-convert/src/{tickgw-live,modes/promote}.ts` · 마이그레이션 `20260929180000` · `20261004090000` · `20261018120000` · `20261104100000` · `20260417120000` · `scripts/{trade-handoff.sh,verify-dma-orders-price-check.sh,deploy-server.sh}`
- gh-trade 원문: `server/src/protocol/StockDMA.fbs:1450-1590` · `server/src/trade/strategy/LimitChaser.cpp:2170-2695` · `LimitChaserChangeMask.h` · `docs/strategy/limit-chaser.md` §0 · `docs/analysis/krx-a3-zero-quote.md` · `docs/inbox/from-gh-radar/README.md` · `261027-launch-gate-contract.md`(43칸 노트 선례)
- claude-api skill — 모델 표 · Opus 5.5 migration(thinking · tool_choice · preserved thinking · effort · refusal · 가격) · prompt caching
- 실측: `packages/shared/src/__fixtures__/ticks/cut1300-{krx,nxt}.ticks.zst` 줄 길이 · 창 레코드 수(스크래치 스크립트)

### Secondary (MEDIUM confidence)
- nodejs.org/docs/latest-v22.x/api/zlib.html — zstd API v22.15.0 · Experimental

### Tertiary (LOW confidence)
- 토큰/문자 비율(2.5자/토큰) · 비용 추정 · 일일 상한 수치 — 실측 전

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 새 의존성 0 · SDK 동작은 node_modules 로 확인
- Architecture: HIGH — 연결점 전부 원문 줄 번호 확인 · 선례(tick_own · fetchLiveDay · promote) 존재
- kind 9 계약: MEDIUM — 원천(fbs · 마스크 · 로그) 은 확인, 칸 배치는 제안(gh-trade 합의 필요)
- 토큰 · 비용 수치: MEDIUM/LOW — 줄 길이 · 레코드 수는 실측, 토큰 환산은 가정
- Pitfalls: HIGH — 대부분 코드에서 직접 확인(relay 무필터 · 첫 프레임 함정 · 300초 · 512Mi · strategyEventSide)

**Research date:** 2026-11-05
**Valid until:** 2026-12-05(코드 구조) · Anthropic API 세부는 2주 내 재확인 권고
