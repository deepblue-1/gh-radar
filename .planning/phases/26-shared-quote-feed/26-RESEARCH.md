# Phase 26: 시세 전용 공유 연결 — relay 종목 단위 팬아웃 - Research

**Researched:** 2026-09-30
**Domain:** relay(Node 22 · TypeScript) 업스트림 구독 구조 재편 — gh-trade 관찰자 quote 역할 소비 · SubscriptionHub 전역화 · wss 팬아웃 · `/healthz` · webapp 배지
**Confidence:** HIGH (코드 경로 전부 이번 세션에 파일을 열어 확인. 설계 수치 일부만 ASSUMED)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 확정된 것 (ROADMAP · gh-trade 7건 합의 · 2026-09-30 — 다시 묻지 않는다)

- **gh-trade 와이어(fbs 커밋 `ed2e0240`, push 대기):** `ObserverLoginReq.role: ubyte`(vtable 슬롯 14 · 0 journal 기본 · 1 quote · 2 이상은 79 `success=false` 거부) · `ObserverLoginResp.role: ubyte`(슬롯 26 · 수락한 역할 에코 · 거부 응답은 0). 둘 다 테이블 말미 append 라 role 을 모르는 구 relay 는 journal 로 붙는다 → **서버 선배포가 안전**하다.
- **quote 연결이 통과시키는 MsgType:** 4 LivePing · 27 GetSymbolMasterReq · 28 GetQuoteReq · 29 SubscribeQuoteReq · 32 GetTradeTapeReq · 35 GetMemberStatsReq. 그 밖 요청(주문·전략·계좌·저널·39)은 응답 없이 버리고 연결당 경고 1줄. 5 재로그인은 「이미 관찰자」 로 거부.
- **로그인 순서:** 79(role 1 · `journal_epoch ""` · head/oldest 0 · `accounts` 빈 벡터 · `strategy_*` 0) → **78 RateCrossSnapshot 1회**. 저널이 준비되지 않아도 quote 는 받아 준다. 서버 로그 확인 줄 `[Gateway] 관찰자 로그인(quote — 시세 전용) conn=… ip=… client='…'`.
- **구독 상한:** quote **2000**(`isin|ex` 키) · 사용자 200. **서버는 초과분을 끊지 않고 조용히 무시한다** → relay 가 스스로 막아야 한다(D-11). `kMaxObservers` 4 는 journal·quote 두 역할 합산(relay 는 journal 1 + 추가 게이트웨이 journal + quote 1).
- **프레임 방향:** 구독으로 오는 59·71·75·82·83 은 역할로 거르지 않는다. 76 RateCrossAlert 은 quote 에게만(Broadcast 클래스 · 큐 가득 시 그 프레임만 드롭). 54 는 두 역할 모두 미수신. 77·80 은 quote 에 오지 않는다(77 은 사용자 세션이 계속 받는다). 39/81 사용자 세션 전용.
- **인증:** 기존 관찰자 공유 비밀(`DMA_OBSERVER_SECRET`) 재사용 — 새 계정·새 비밀 없음. 19 D-13 동형: 24시간 상시 · 상한 있는 백오프 재접속 · **거부(성공=false)면 재접속 루프 중단 + healthz 로 드러냄**.
- **구독 프레임 규칙 유지:** 15 D-33 + hub level 블록(quick-260923-ge2) 그대로 — 0→1 FULL = 28→29(0)→32 · 0→1 PRICE = 28→29(1) · PRICE→FULL 승격 = 28→29(0)→32 재송 · FULL→PRICE 강등 = 29(1) · 1→0 = 29(subscribe=false). 업스트림 level 은 **키의 최고 level**(full ≥1 ? FULL : PRICE). 모르는 level 은 FULL 로 접는다.
- **재접속:** quote 세션 단절 후 재로그인하면 **전역 참조계수 합집합 전량을 실효 level 로 재구독**(`resubscribeAll` 동형) — 2000 키 burst 페이싱은 재량.
- **배포 순서:** gh-trade 서버(120·127) → relay → webapp(변경 있으면). 장 마감(20:00 KST) 이후 배포 창. relay 먼저 → 검증 → push(push 가 곧 webapp 프로덕션 배포).
- **착수 순서:** gh-trade push 뒤 `sync-relay-schema.sh RELAY=gh-radar` → relay 생성물 + 수기 사본 3곳(msg-type · envelope · hub) 커밋. 같은 재동기화에 **`buy_watch_side` deprecated** 도 함께 반영한다(gh-radar-48 ↔ gh-trade 합의). fbs 전에는 서버 무관 부분(hub 키 전역화 · 캐시 공유 · PRICE 판정기 · 배지)만 진행.

#### ① 공유 시세 세션 단절 UX·헬스

- **D-01: 연결 배지를 「시세」·「주문」 2축으로 분리하고, 시세가 끊기면 호가창은 마지막 캐시 값을 그대로 둔 채 시세 배지만 적색.** 주문 세션(사용자 DMA)이 멀쩡함이 따로 보인다. 지금 배지는 사용자 DMA 세션 하나만 반영한다.
- **D-02: quote 세션이 Ready 가 아니면 relay `/healthz` 는 503 degraded.** 사용자 DMA 세션 stalled 와 같은 등급(저널 관찰자처럼 본문 필드만이 아니다). 기존 uptime 알림이 그대로 잡는다. 본문에 quote 세션 상태·구독 키 수·마지막 프레임 시각·재접속 횟수를 싣는다(필드 이름 재량).
- **D-03: 폴백 없음.** quote 세션이 오래 끊겨도 사용자 세션으로 시세를 재구독하지 않는다. 복구 경로는 백오프 재접속 + 합집합 재구독뿐. 경로 하나만 유지한다.
- **D-04: stale 표식은 배지만.** 끊긴 시각(「HH:MM:SS 이후 갱신 없음」 류)을 배지에 싣고 호가·체결 숫자는 흐리지도 비우지도 않는다. 재접속 뒤 28 스냅샷이 오면 자연히 갱신된다.

#### ② PRICE 필터 relay 이관 범위

- **D-05: FULL 로 구독된 키를 PRICE 소켓이 볼 때 relay 는 서버 PRICE 규칙을 그대로 복제한다** — 가격 섹션(A3 체결 · R8 VI · A6 종가)이 갱신된 59 만 통과, 호가(B6)만 바뀐 틱은 0건, 키당 최소 **100ms**(서버 `MarketPublisher.h:159` `kPriceLevelMinIntervalMs = 100`, quick-260923-hp5 에서 200→100 · 퍼블리셔 코얼레싱 틱 1개와 같음 — gh-trade 확인 2026-09-30). 방출 규칙(MarketPublisher.cpp ~1919 동형): 가격 섹션 갱신으로 pending 이 선 키에서 마지막 PRICE 송신 뒤 100ms 이상 지났을 때 **그 시점 최신 상태** 59 한 프레임 — 억제된 갱신은 버리지 않고 다음 허용 틱에 최신 상태로 나간다(유실 없이 지연만). ⚠ `tasks/gh-trade-price-only-quote-subscription-reply.md` 의 「200ms」 는 hp5 이전 값이라 낡았다 — 필드 정본(가격 섹션 3종·본문 동일)만 그 문서를 따르고 간격은 100ms 다. `relay/src/dma/envelope.ts:452` 주석(≥100ms)이 맞다. 71·75 는 PRICE 소켓에 보내지 않는다(71 은 `fanout.ts:1645` 현행 필터, 75 추가).
- **D-06: 판정은 hub 키 단위 1회.** 키마다 마지막 가격 섹션·마지막 PRICE 송신 시각을 두고 59 프레임에 「PRICE 통과」 플래그를 붙인다. fanout 은 소켓 level 로만 거른다 — 소켓 수와 무관한 비용, 서버 코얼레싱(종목 단위 전역 틱)과 동형. PRICE-only 키는 업스트림 level=1 이라 서버가 이미 걸러 relay 판정은 전부 통과한다(무해).
- **D-07: PRICE 소켓용 59 본문은 FULL 과 같은 프레임.** 축약 타입을 만들지 않는다. 웹 파서·리듀서·shared 타입 변경 0.

#### ③ 사용자 DMA 세션 역할·수명

- **D-08: 15 D-15 그대로 유지** — wss 첫 인증 연결에서 로그인, 마지막 wss 가 끊긴 뒤 5분 유예 후 TCP 종료. 인증 직후 계좌 66/67 · 전략 스냅샷(24/21/34) · 77 · 78 · 76 · 409 `SESSION_NOT_READY` 의미가 모두 그대로다. 사용자 세션이 하는 일에서 **종목 구독(28/29/32/35)만 빠진다**. 웹 변경 0.
- **D-09: `dma_credentials` allowlist 유지.** 매핑 없는 로그인 사용자는 지금처럼 연결 유지·구독 거부(unauthorized). 이 phase 는 전송 구조 교체만이며 시세 공개 범위 확대는 별도 phase(deferred).

#### ④ 구독·캐시 전역화 세부 + 전환

- **D-10: 1→0 은 짧은 linger 뒤 해제.** 마지막 소비자가 떠나도 N초(재량 10~30초) 동안 구독·캐시를 유지하다 해제. 탭 전환·새로고침으로 같은 종목이 바로 돌아오면 28·29·32 재요청 없이 캐시로 그린다. linger 키는 상한 2000 을 잠시 소비한다.
- **D-11: 전역 키 2000 도달 시 새 키는 거부.** 그 소켓에 오류 상태 프레임(「구독 한도」 — 이름 재량) + healthz 카운터 + 경고 로그. 기존 구독은 건드리지 않고 LRU 축출도 없다. 자리를 만들 때는 linger 키부터 먼저 해제한다.
- **D-12: 빅뱅 전환.** per-user 종목 구독 코드를 걷어내고 경로 하나만 남긴다(19 D-14 선례). env 플래그 병존 없음. 롤백 = 이전 relay 이미지 재배포(서버는 role 미지정 relay 를 journal 로 받으므로 그대로 둔다). — **Reversibility:** costly — 걷어낸 per-user 구독 경로·테스트를 되살리려면 hub·fanout·session-manager 를 다시 결선해야 하고, 그 사이 서버 구독 상한(200)·관찰자 정원(4) 전제가 바뀌어 있다.
- **D-13: 착수 전 장중 기준선 실측(코어 3 사용률 · 연결별 송신 큐 깊이 · 주문 응답 지연)은 생략한다**(사용자 결정 2026-09-30). ROADMAP Phase 26 Goal 의 「착수 전 … before 기준선」 조항은 내린다 — 전후 비교 근거 없이 진행함을 알고 택했다. 배포 뒤 확인은 `/healthz`·relay 로그·smoke 로 한다.

### Claude's Discretion

- quote 세션 구현 형태: `relay/src/journal/observer.ts` 상태기계를 role 매개변수로 재사용할지 파생 클래스로 둘지. 79 뒤 저널 필드는 무시, 78 은 hub 의 78 경로로 흘린다.
- 78 원천: 사용자 세션 로그인 78 과 quote 78 이 둘 다 오면 hub 78 캐시는 하나(전역 스냅샷)로 합치고, 인증 직후 스냅 재생 원천을 그것으로 통일.
- hub 키 전환(`subKey` 의 userId 제거) · `#quotes`/`#tapes`/`#refs` 전역화 · 세션 교체 시 prefix 삭제(`:1754`) 규칙 재설계 · tape ring 깊이(전역 하나) · 83 라우팅(계좌 필터는 지금처럼 캐시 **전**, `#onQueueProgress`) · 82 는 quote 로 와도 무시(25 재량 그대로).
- linger 값 · 재접속 합집합 재구독 페이싱 · PRICE 판정기 자료구조 · 상태 프레임 이름(`quote` 축 배지 값) · healthz 필드 이름 · 배지 문구.
- 사용자 세션 stalled 판정(`STALE_SESSION_MS`)이 시세 프레임 도착에 기대고 있다면 재설계 — 이제 사용자 세션에는 시세가 오지 않는다. `resubscribeAll` 은 사용자 세션에서 noop.
- webapp 변경 범위: 배지 2축 + 시세 상태 프레임 리듀서 + 구독 한도 오류 표시. 그 외 웹 변경 0 이 목표.
- 테스트: mock 게이트웨이(17-03 계열)에 quote 관찰자 역할 시나리오(79 role 에코 · 78 1회 · 상한 초과 무시 · 76 quote 만)를 추가하고, 유저 2명 × 같은 종목 → 업스트림 29 1건 · 캐시 공유 · PRICE/FULL 혼합 소켓 필터를 회귀로 고정.

### Deferred Ideas (OUT OF SCOPE)

- `dma_credentials` 없는 로그인 사용자에게 공유 시세 개방(시세 공개 정책 · 구독 상한 소비 · 종목상세 시세-only 뷰) — 별도 phase.
- env 플래그로 per-user/shared 병존(빠른 롤백) — 기각, 필요해지면 후속.
- 착수 전 장중 기준선 실측(코어 3 · 송신 큐 · 주문 응답 지연) — 사용자 결정으로 내림. 배포 뒤 문제가 보이면 그때 측정.
- 127(교보) 시세 quote 세션 — 이 phase 시세 원천은 120 하나. 다중 게이트웨이 시세는 후속.
- 사용자 세션 지연 로그인(주문·전략 표면에서만) — 기각(D-08), 게이트웨이 세션 수 절감이 필요해지면 재검토.
</user_constraints>

<phase_requirements>
## Phase Requirements

REQUIREMENTS.md 에 매핑된 ID 는 없다. CONTEXT 결정이 요구사항 정본이다.

| ID | Description | Research Support |
|----|-------------|------------------|
| 확정-와이어 | `role` 슬롯 14/26 재동기화 | §Pattern 1 — `--check` 가 정확히 2 파일(`observer-login-req.ts` · `observer-login-resp.ts`) 변경을 보고. 수기 사본은 envelope · types · frames 헬퍼 · fake-gateway |
| 확정-로그인 | 79(role 1) → 78 1회 · 거부 시 정지 | §Pattern 2 `QuoteFeed` 상태기계 · Pitfall 2(role 에코 불일치) |
| 확정-상한 | 2000 · 서버 무음 무시 | §Pattern 6 전역 키 가드 · Pitfall 5 |
| 확정-프레임 | 59/71/75/82/83 무필터 · 76 quote · 54/77/80 미수신 | §Pattern 3 `#onQuoteFeedFrame` 명시 case 표 |
| 확정-재접속 | 합집합 재구독(페이싱) | §Pattern 7 · Pitfall 3(서버 Notice 큐 4MB → 끊김) |
| 확정-배포 | 서버 → relay → push | §배포 · 롤백 |
| D-01 | 배지 2축 | §Pattern 9 webapp `WorkbenchStatusBar` |
| D-02 | quote 미Ready → 503 | §Pattern 8 healthz `quote` 축 · Pitfall 7(유예 없으면 배포 스크립트 실패) |
| D-03 | 폴백 없음 | §Pattern 3 — 사용자 세션 `#onReady` 에서 `resubscribeAll` 제거 |
| D-04 | 배지만 stale | §Pattern 9 — `isStale` 를 건드리지 않는 별도 필드 |
| D-05 | PRICE 규칙 복제 100ms | §Pattern 5 PRICE 판정기 · Pitfall 4(dirty 비트 없음 → 값 비교) |
| D-06 | 키 단위 1회 판정 · fanout 은 소켓 level 만 | §Pattern 4·5 |
| D-07 | 본문 동일 | §Pattern 5 — 통과 플래그는 이벤트 메타데이터, 와이어 아님 |
| D-08 | 사용자 세션 수명 불변 | §Pattern 3 · session-manager 무변경(Q5) |
| D-09 | allowlist 유지 | fanout `conn.unauthorized` 분기 무변경 |
| D-10 | linger | §Pattern 6 |
| D-11 | 2000 가드 + 오류 프레임 | §Pattern 6 · §Pattern 9 |
| D-12 | 빅뱅 | §Pattern 3 변경 목록 · §Validation 깨지는 테스트 목록 |
| D-13 | 기준선 생략 | 배포 뒤 healthz · 로그 · smoke 로만 확인 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- 모든 사용자 대면 소통·문서는 한국어. 커밋 메시지 한국어, **Co-Authored-By 넣지 않는다**, 커밋 전 메시지를 사용자에게 보여 확인받는다(전역 CLAUDE.md). [VERIFIED: /Users/alex/.claude/CLAUDE.md]
- 작업은 GSD 명령 경로로만(`/gsd-execute-phase` 등). [VERIFIED: ./CLAUDE.md §GSD Workflow Enforcement]
- 배포: 백엔드 Cloud Run / relay 는 GCE VM `radar-gw` Docker. **push 가 곧 webapp 프로덕션 배포** — relay 먼저 → 검증 → push. [VERIFIED: .planning/STATE.md §Phase 17 프로덕션 배포 완결]
- 서브에이전트는 커밋까지만, 배포는 메인 세션(분류기 차단). [VERIFIED: 프로젝트 메모리 `feedback_subagent_deploy_classifier.md` · `feedback_deploy_relay_before_push.md`]
- 동시 세션 커밋 경합: `git add -A` 금지, 경로 지정 커밋, relay 배포 직전 `git status -sb` 재확인. [VERIFIED: 메모리 `feedback_concurrent_session_commit_race.md`]
- UI 변경은 HTML 목업 먼저(프론트 phase) · 목업 검토 게이트 후 커밋. [VERIFIED: 메모리 `feedback_ui_html_mockups_first.md`] — 배지 2축(D-01)에 적용 여부는 Open Question 1(RESOLVED → D-14 · 26-13).
- 스크래핑 5원칙·공식 API 운영 기준은 이 phase 와 무관(DMA 게이트웨이 내부 프로토콜).
- 상따 화면 반응형 정본은 `webapp/src/styles/globals.css` 상단 주석 — 배지 추가 시 표 복사 금지. [VERIFIED: ./CLAUDE.md §Conventions]

## Summary

gh-trade 쪽 서버 변경(ed2e0240)은 커밋·push 되어 있고 `origin/master` 에 있다. relay 쪽 재동기화는 **생성물 2 파일**(`stock-dma/observer-login-req.ts` · `observer-login-resp.ts`)만 바꾸며, `buy_watch_side` 봉인은 이미 이전 재동기화(a3610261)로 relay 생성물에 반영돼 있어 추가 작업이 없다. 생성된 `createObserverLoginReq`/`createObserverLoginResp` 가 인자 하나(`role`)를 더 요구하므로 `envelope.ts:2755` 와 `tests/helpers/frames.ts:1330` 두 호출부는 **컴파일이 깨진다** — 같은 커밋에서 고쳐야 한다. `msg-type.ts` 와 hub `#onFrame` 은 새 MsgType 이 없으니 재동기화 자체로는 손댈 것이 없다(Phase 26 로직 변경으로 hub 는 크게 바뀐다).

relay 설계의 핵심은 네 가지다. (1) `JournalObserver` 를 role 매개변수로 넓히지 말고 **별도 `QuoteFeed` 클래스**를 둔다 — 저널 관찰자는 커서·기록기·계좌 매핑·replaying 상태가 얽혀 있어 분기를 넣으면 19/25 회귀 면적이 커지고, quote 세션은 오히려 `DmaSession` 처럼 `isReady · send · on("frame"|"ready")` 표면이 필요하다. (2) hub 의 업스트림 송신자를 `#sessions.get(userId)` 에서 **단일 `QuoteFeed`** 로 바꾸고 `#refs/#quotes/#tapes/#pending/#flushTimers` 를 `isin|ex` 키로 전역화한다. 사용자 데이터(계좌·전략·83·77·76/78)는 지금처럼 userId 스코프에 남는다. (3) 시세 전달은 `{userId,msg}` 팬아웃이 아니라 **키 구독자 색인**(`Map<isin|ex, Set<Conn>>`)으로 보내는 새 이벤트 경로가 필요하다 — 공개 시세라 T-15-02(사용자 데이터 격리)를 깨지 않지만, 계좌성 프레임이 이 경로로 새지 않게 타입으로 막아야 한다. (4) 서버 PRICE 판정은 dirty 비트 기반인데 relay 에는 비트가 없으므로 **가격 섹션 필드 서명 비교 + 100ms 창 + pending 타이머**로 복제한다.

조사 중 **CONTEXT 에 없던 회귀 위험 두 건**을 확인했다. ① 83 잔량진행률은 서버가 「구독 연결 ∪ 계좌 선언 세션」 두 경로로 보내고(`MarketPublisher.cpp:771-779`), 재구독(29) 성립 시에만 조용한 키의 스냅샷을 다시 낸다(`:1487`, `:1507` — quick-260930-d43). 사용자 세션이 29 를 더 보내지 않으면, 다른 사용자가 이미 구독한 조용한 상한가 종목에서 새로 들어온 사용자의 진행률 막대가 **다음 체결까지 비어 있다**(d43 이 오늘 고친 증상의 재발). relay 가 「사용자별 첫 참조」 때 quote 세션으로 같은 level 29 를 한 번 더 보내 서버 재송신을 유발해야 한다. ② 서버 연결당 Notice 송신 큐 상한은 1024 프레임/4MB 이고 넘으면 **연결을 끊는다**(`Gateway.cpp:350-400`). 58·69 응답은 Notice 라서(`MarketPublisher.cpp:1701,1758`) 합집합 재구독을 한 번에 쏘면 quote 세션이 끊기고 재접속 → 재구독 → 끊김 루프가 된다. 페이싱은 재량이 아니라 필수다.

**Primary recommendation:** 재동기화 커밋(생성물 2 + envelope/types/frames/fake-gateway role) → hub 전역화 + PRICE 판정기 + linger/2000 가드(단위 테스트) → `QuoteFeed` + `QuoteStatus` + healthz(단위·TCP 통합) → fanout 키 색인 + `quote.state`/구독 한도 프레임 → 83 재송신 넛지 → shared 타입 + webapp 배지 → e2e 픽스처 → 메인 세션 배포(20:00 이후, relay 먼저) 순으로 쪼갠다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| quote 관찰자 로그인·재접속·거부 정지 | relay (DMA 전송층 `QuoteFeed`) | gh-trade Gateway(관문·상한) | 연결 수명은 `DmaClient`, 로그인 판단은 feed. 서버는 이미 배포됨 |
| 구독 참조계수(전역 `isin|ex`) · 0→1/1→0 프레임 · linger · 2000 가드 | relay hub (`SubscriptionHub`) | — | 「누가 무엇을 보는가」의 유일한 객체(hub 헤더 원칙) |
| 스냅샷·테이프 캐시 공유 | relay hub | — | 전역 캐시, 키 단위 |
| PRICE 통과 판정(가격 섹션·100ms) | relay hub | — | D-06 키 단위 1회 |
| 소켓 level 필터 · 키 구독자 색인 · 구독 한도 오류 프레임 | relay fanout (`WsFanout`) | — | 소켓 소유권(`conn.keys`)은 fanout 소관 |
| 계좌·전략·77·76/78·83 | relay hub(사용자 스코프) ← 사용자 DMA 세션 | — | D-08 불변, 83 은 계좌 필터 캐시 전 |
| 83 조용한 키 재송신 유발 | relay hub → QuoteFeed(29 재송) | gh-trade QueueTracker `RequestResend` | 서버 재송신 트리거가 29 뿐이다 |
| quote 축 `/healthz` · 503 | relay order-api(내부 8091) | Cloud Monitoring uptime | D-02 |
| 시세/주문 2축 배지 | webapp(`use-relay-socket` 리듀서 · `WorkbenchStatusBar`) | shared 타입 | D-01·D-04 |

## Standard Stack

### Core (전부 기존 의존성 — 새 패키지 없음)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| flatbuffers (npm) | ^25.9.23 | 생성물 런타임 | flatc 25.12.19 와 짝 고정 [VERIFIED: relay/package.json · sync-relay-schema.sh:43] |
| ws | ^8.21.3 | 브라우저 wss | 기존 [VERIFIED: relay/package.json] |
| vitest | ^4.1.4 | relay·webapp 테스트 | 기존 [VERIFIED: relay/package.json] |
| flatc | 25.12.19 | 스키마 생성(gh-trade 스크립트가 호출) | 설치 확인 `flatc version 25.12.19` [VERIFIED: 로컬 실행] |

**Installation:** 없음.

## Package Legitimacy Audit

이 phase 는 외부 패키지를 설치하지 않는다(기존 lockfile 그대로).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (없음) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                      gh-trade 120 (KB) Gateway
        ┌──────────────────────────┬────────────────────────────────────┐
        │ quote 관찰자 conn (1개)   │ 사용자 세션 conn (userId 당 1개)     │
        │ 받음: 79,78(1회),58,59,   │ 받음: 50,51,55,56,60,61,64~67,72,   │
        │  69,71,74,75,76,82,83(①)  │  73,76,77,78(로그인),83(② 계좌),57  │
        │ 보냄: 5(role 1),4,28,29,32│ 보냄: 1,3,4,10~14,21,24,25,27,33… │
        └────────────┬─────────────┴──────────────┬─────────────────────┘
                     │ TCP(VPN)                    │ TCP(VPN)
            ┌────────▼────────┐           ┌────────▼──────────┐
            │ QuoteFeed        │           │ DmaSession ×N       │
            │ (DmaClient 재사용│           │ (종목 구독 없음)     │
            │  login role=1)   │           └────────┬──────────┘
            └───┬────────▲─────┘                    │ frame/ready
       frame/ready│      │ send 28/29/32 (페이싱)    │
            ┌────▼──────┴─────────────────────────▼────────────────┐
            │ SubscriptionHub                                          │
            │  전역: #refs{full,price} · linger · 2000 가드             │
            │        #quotes · #tapes · 테이프 200ms 배치(전역 타이머)   │
            │        PRICE 판정기(서명·100ms·pending 타이머)             │
            │  사용자: 계좌·전략·77·76/78·83(계좌 필터 → 캐시)            │
            │  이벤트: "market"{key,msg,full,price}  "fanout"{userId,msg}│
            └────┬───────────────────────────────┬──────────────────┘
                 │ market (키 구독자)              │ fanout (userId)
            ┌────▼───────────────────────────────▼──────────────────┐
            │ WsFanout: #keyConns Map<isin|ex, Set<Conn>>               │
            │  q → full 소켓 전부 · price 소켓은 price 플래그/snap 일 때만 │
            │  tape → full 소켓만 │ state/quote.state/sub 한도 오류       │
            └────┬───────────────────────────────────────────────────┘
                 │ wss
            브라우저(use-relay-socket) → 리듀서 → 배지 2축(시세/주문)

  /healthz (order-api 8091) ← QuoteStatus(QuoteFeed 상태·키 수·마지막 프레임·재접속·한도 거부)
```

### Recommended Project Structure (새 파일 · 바뀌는 파일)
```
relay/src/
├── quote/                      # 신규 — 시세 전용 관찰자 연결
│   ├── feed.ts                 # QuoteFeed: DmaClient + 로그인(role 1) + 상태기계 + 페이싱 송신
│   └── status.ts               # QuoteStatus: healthz 요약 · quote.state 프레임 원천 (journal/status.ts 동형)
├── hub/subscription-hub.ts     # 전역화 · PRICE 판정기 · linger · 가드 · market 이벤트 · 83 넛지
├── ws/fanout.ts                # #keyConns 색인 · deliverMarket · 한도 오류 · quote.state 전달
├── dma/envelope.ts             # buildObserverLoginReq(role) · parseObserverLoginResp(role)
├── journal/types.ts            # ObserverLoginResult.role
├── order/order-api.ts          # HealthPayload.quote · 503 판정
├── config.ts                   # (선택) DMA_QUOTE_OBSERVER_SECRET 폴백 — Open Question 3
└── index.ts                    # QuoteFeed 부팅·결선·종료
relay/tests/
├── helpers/frames.ts           # buildObserverLoginRespFrame({role})
├── helpers/fake-gateway.ts     # readObserverLoginRequest.role · role 별 자동 응답 · quote 소켓 대기
├── quote-feed.test.ts          # 신규 — FakeTransport 단위 (journal-observer.test.ts 동형)
├── quote-gateway.test.ts       # 신규 — 실 TCP · fake gateway (journal-gateway.test.ts 동형)
├── hub.test.ts · fanout.test.ts# 재작성(빅뱅)
packages/shared/src/relay.ts    # RelayQuoteStateMsg · 구독 한도 프레임 · RelayOutbound union
webapp/src/lib/use-relay-socket.ts · relay-provider.tsx
webapp/src/components/trading/workbench/workbench-status-bar.tsx
webapp/e2e/fixtures/relay.ts    # quote 관찰자 켬 · 시세 주입 소켓 = quote 소켓
```

### Pattern 1: 스키마 재동기화 + 수기 사본 (Q1)

**현황 [VERIFIED: 로컬 실행 · 파일 확인]:**
- `git -C gh-trade log origin/master` 에 `ed2e0240`(fbs) → `4e8a0b01` → `6a9c79d4` → `fd3ac5ae` 가 있다. fbs 를 마지막으로 바꾼 커밋은 `ed2e0240` 이고 origin/master·로컬 HEAD 모두 blob `2cf7b76030110c34200aa6a9ac761c8be7737840` 이다.
- 현재 relay 사본 SYNC MARKER: `// server-repo-commit: d303fe9f` (relay/src/generated/StockDMA.fbs:3).
- `RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh --check` 실행 결과(이번 세션): `생성 .ts : 58 개` · `신규/변경 예정 : 2 개` · `삭제 예정 : 없음` · `.fbs 사본 : 갱신 예정`.
- scratch 에 flatc 로 생성해 diff: 변경 2 파일은 `stock-dma/observer-login-req.ts`(`role()` 접근자 · `startObject(6)` · `addRole` · `createObserverLoginReq(..., strategySinceSeq:bigint, role:number)`)와 `stock-dma/observer-login-resp.ts`(`role()` · `startObject(12)` · `addRole` · `createObserverLoginResp(..., strategyResync:boolean, role:number)`).
- fbs 원문 [VERIFIED: gh-trade server/src/protocol/StockDMA.fbs:1153, :1190]:
  - `role: ubyte;                 // 0 = journal(기본 — 필드 없는 구 relay 도 0) · 1 = quote(시세 전용 관찰자 — 저널 없음,`
  - `role: ubyte;                   // 성공 응답에 수락한 역할 에코(0 = journal · 1 = quote), 거부 응답은 0 (vtable 슬롯 26)`
- **`buy_watch_side` 는 이미 끝났다.** fbs 는 `buy_watch_side: string (deprecated);`(a3610261)이고, relay 생성물(`src/generated/stock-dma/`)에 `buyWatchSide` 접근자가 없다(grep 0건, `.fbs` 사본 주석에만 존재). relay 파서는 `buyWatchSide: "0"` 을 채운다(`envelope.ts:2179`). 이번 재동기화에서 할 일은 **없다** — SUMMARY 에 「이미 반영(a3610261)」 으로 적으면 된다. [VERIFIED: grep relay/src/generated · envelope.ts:2179]

**재동기화 뒤 컴파일이 깨지는 호출부 [VERIFIED: grep]:**
| 파일:줄 | 현재 | 고칠 것 |
|---|---|---|
| `relay/src/dma/envelope.ts:2755-2762` | `ObserverLoginReq.createObserverLoginReq(b, secret, BigInt(sinceSeq), epoch, client, BigInt(strategySinceSeq))` | 7번째 인자 `input.role ?? 0` · `ObserverLoginReqInput` 에 `role?: 0 \| 1` |
| `relay/tests/helpers/frames.ts:1330-1343` | `createObserverLoginResp(... , input.strategyResync ?? false)` | `input.role ?? 0` 추가 · `FakeObserverLoginRespInput.role?` |

**함께 고칠 수기 사본(컴파일은 안 깨지지만 의미상 필요):**
- `envelope.ts` `parseObserverLoginResp`(:2777-2822) 반환에 `role: r.role()` 추가.
- `journal/types.ts` `ObserverLoginResult`(:125-145)에 `role: number`.
- `tests/helpers/fake-gateway.ts` `ObserverLoginRequest`(:~120) + `readObserverLoginRequest`(:274-285)에 `role: req.role()`.
- `msg-type.ts`: **변경 없음**(새 MsgType 없음 — `INBOUND_MSG_TYPES`(:221-248)·`OUT_OF_SCOPE`(:270-272) 그대로). 확인만.

**verify 형태 (Phase 25 25-01-PLAN.md:246 패턴 그대로, worktree 대신 gh-trade 본 트리):**
```bash
cd /Users/alex/repos/gh-trade/server && out="$(RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh --check 2>&1)"; code=$?; printf '%s\n' "$out"; test "$code" -eq 0 && printf '%s' "$out" | grep -Eq '신규/변경 예정 +: 0 개' && printf '%s' "$out" | grep -Eq '\.fbs 사본 +: 최신' && test "$(git -C /Users/alex/repos/gh-trade rev-parse ed2e0240:server/src/protocol/StockDMA.fbs)" = 2cf7b76030110c34200aa6a9ac761c8be7737840 && grep -q "server-repo-commit: ed2e0240" /Users/alex/repos/gh-radar/relay/src/generated/StockDMA.fbs
```
⚠ gh-trade 로컬 master 는 origin 보다 5 커밋 앞서 있으나(gh-trade Phase 26 docs) fbs 변경은 없다 — `git log -1 -- StockDMA.fbs` 가 `ed2e0240` 이라 마커가 맞게 찍힌다. [VERIFIED: git log]
⚠ 스크립트는 gh-trade 저장소 **파일만** 읽고 gh-radar 에 쓴다. gh-radar 커밋은 경로 지정(`relay/src/generated/StockDMA.fbs` · 2 파일 + 수기 사본)으로만 한다.

### Pattern 2: `QuoteFeed` — 관찰자 상태기계 재사용 방식 (Q2)

**JournalObserver 를 확장하지 않는 근거 [VERIFIED: relay/src/journal/observer.ts 전문]:**
- `start()` 가 `#loadCursorThenConnect` 로 **Supabase 커서를 읽은 뒤에만** connect 한다(:222-242). quote 는 커서가 없다.
- `#handleUp` 가 `writer.lastReceivedSeq`·`writer.epoch`·`strategyWriter` 로 로그인 페이로드를 만든다(:257-279).
- `#onLogin` 이 `access.replace` · `writer.beginEpoch` · replaying/live 판정을 한다(:322-377). quote 에는 전부 무의미.
- 코덱 `decode` 는 79/80 만 분류하고 76/54 는 `ignore`, 나머지는 `unexpected`(journal/codec.ts:29-45) — quote 는 58/59/69/71/83 을 hub 로 넘겨야 한다.
- 그리고 hub 는 업스트림 송신자에게 `isReady · send · on("frame") · on("ready")` 표면을 요구한다(`HubSession` :148-166). 이건 `DmaSession` 모양이지 JournalObserver 모양이 아니다.

→ **권고: `relay/src/quote/feed.ts` 에 `QuoteFeed extends EventEmitter` 신설.** 재사용하는 것은 부품이다: `DmaClient`(연결·백오프·LivePing 30s `dma-client.ts:71` `export const PING_INTERVAL_MS = 30_000;` · generation), `LOGIN_RESP_TIMEOUT_MS`(session.ts), `ObserverTransport` 인터페이스(journal/types.ts:210-226 — 테스트용 FakeTransport 가 그대로 맞는다), `buildObserverLoginReq`/`parseObserverLoginResp`. 상태기계 뼈대(up → 로그인 송신 → 타이머 → 79 → 성공/거부)는 observer.ts:248-377·449-456·485-504 를 복사·축약한다. 저널 쪽은 한 줄도 바꾸지 않는다(19/25 회귀 면적 0). [ASSUMED — 설계 판단]

**상태:** `disabled`(비밀 없음) · `connecting` · `logging_in` · `ready` · `rejected`(79 success=false → `stopReconnect`+`destroy`, 재시작 전 복구 없음 — observer.ts:449-456 동형) · `role_mismatch`(79 success=true 인데 `role !== 1` → 아래 Pitfall 2).

**로그인 페이로드:** `{ secret, sinceSeq: 0, epoch: "", client: "gh-radar-relay/quote", strategySinceSeq: 0, role: 1 }`. `client` 는 journal 의 `OBSERVER_CLIENT_NAME = "gh-radar-relay"`(observer.ts:64)와 달라야 서버 로그 `client='…'` 에서 두 연결을 가른다(CONTEXT specifics). 비밀은 어떤 로그에도 싣지 않는다(T-19-03).

**수신 라우팅 (`QuoteFeed` 는 79 만 스스로 소비, 나머지는 `frame` 이벤트로 hub 에):**
| msg | 출처 규약 | 처리 |
|---|---|---|
| 79 | 요청 연결 Notice | feed 가 판단. hub 는 명시 no-op case |
| 78 | 로그인 직후 1회 (Gateway.cpp:1496-1505) | hub 명시 case — **무시**(아래 근거) |
| 58/59 | 28 응답 / 구독 틱 | hub `#onQuote` (전역) |
| 69/71 | 32 응답 / 구독 틱 | hub `#onTape` (전역) |
| 76 | `BroadcastAudience::WithQuoteObservers` (Gateway.cpp:1691) | hub 명시 case — **무시** |
| 83 | 구독 연결 ① (MarketPublisher.cpp:771-774) | hub 명시 case — **무시**(Pattern 10) |
| 74/75/82 | 구독 편승 | `OUT_OF_SCOPE_INBOUND_MSG_TYPES`(msg-type.ts:270-272 `68, 70, 74, 75, 81, 82,`)로 envelope 단계에서 이미 드롭 |
| 54/77/80 | quote 에 안 옴 | 오면 명시 case warn |

**76/78 을 quote 에서 무시하는 근거 [VERIFIED: gh-trade Gateway.cpp]:** 사용자 세션은 관찰자가 아니므로 76 을 계속 받고(`BroadcastFrame` 은 관찰자만 건너뛴다, :1689-1694), 78 도 사용자 로그인 때 받는다(`ProcessLoginReq` 의 `snapCmd.kind = publish::PubCommand::Kind::RateCrossSnapshot;` :1201). 서버는 76 을 사용자 연결 수만큼 보내는 것을 relay 가 무엇을 하든 멈추지 않으므로 캐시 통합은 VPN 트래픽을 줄이지 않고, N+1 원천 중복 제거만 새로 생긴다. D-08(「78 · 76 의미 그대로」)과 가장 가까운 선택은 **사용자 스코프 경로 무변경 + quote 76/78 명시 무시**다. Discretion 의 「78 캐시 통합」 은 채택하지 않는 것을 권한다(Open Question 2 로 사용자 확인). [ASSUMED — 권고]

### Pattern 3: SubscriptionHub 전역화 — 바꿀 곳 전수 (Q3)

`subscription-hub.ts` 에서 userId 가 키이거나 업스트림 송신자 선택에 쓰이는 곳 [VERIFIED: 파일 전문 열람]:

| 위치 | 현재 | Phase 26 |
|---|---|---|
| :248-250 `subKey(userId,isin,exchange)` | `${userId}|${isin}|${exchange}` | **둘로 나눈다**: `marketKey(isin,ex)`=`${isin}|${ex}` (refs·quotes·tapes·판정기) / `progressKey(userId,isin,ex)` (83 캐시 전용, 기존 3단 형식 유지) |
| :253-255 `userPrefix` | 모든 사용자 맵 | 사용자 맵에서만 유지 |
| :374-383 `#refs/#quotes/#tapes/#pending/#flushTimers` | userId 스코프 | `#refs/#quotes/#tapes` 키 전역 · `#pending: Map<marketKey, PendingTape>` · 테이프 타이머 **전역 1개**(D-35 「키마다 타이머 없음」 유지) |
| :516-534 `attach(session)` · :526 `#clearCaches` | 세션 교체 시 캐시 폐기 | 사용자 스코프만 폐기. `#countKeys(userId)` 로그 제거 |
| :552-585 `subscribe(userId,…)` | 키 `subKey` · `#sendSubscribe(userId,…)` | 키 `marketKey`. 반환값 `"ok" \| "limit"`(가드). userId 는 로그 + 사용자별 참조 추적(Pattern 10 넛지)에만 |
| :591-646 `unsubscribe(userId,…)` | `#sessions.get(userId)` 로 29 송신 | 1→0 이면 linger 시작(Pattern 6). 강등 29(1) 은 `#feed` 로 |
| :659-671 `resubscribeAll(userId)` | prefix 순회 | `resubscribeAll()` — 전 키 순회, **페이싱**(Pattern 7). 호출 원천 = feed `ready` 하나 |
| :852-860 `getSnapshot/getTape(userId,…)` | 사용자 캐시 | `(isin,ex)` 전역 캐시 |
| :959-972 `refCount/subscriptionLevel(userId,…)` | 진단 | `(isin,ex)` — 테스트 API 시그니처 변경 |
| :975-987 `stats()` | `subscriptionCount: this.#refs.size` | 전역 키 수 · linger 수 · 한도 거부 누적 추가 |
| :1014-1169 `#onFrame(userId, session, e)` | 58/59/69/71 을 `#onQuote(userId)`/`#onTape(userId)` | 사용자 세션에서 58/59/69/71 이 오면 **명시 case warn + 무시**(구독이 없으니 오면 이상 신호 — PC-12 계수 오염 금지). 새 `#onFeedFrame(e)` 가 시세를 받는다 |
| :1296-1299 `#onQuote(userId, quote)` | `#quotes.set(subKey…)` + `#fanout(userId)` | 전역 캐시 + PRICE 판정 + `emit("market", …)` |
| :1629-1677 `#onTape/#armFlush/#flush` | 사용자 단위 | 전역 링버퍼 + 전역 배치 + `emit("market", …)` |
| :1689-1724 `#sendSubscribe(userId,…)` | `this.#sessions.get(userId)` | `this.#feed` (없거나 미Ready 면 참조계수만 기록 — 종전 규율 그대로) |
| :1726-1745 `#onReady(userId, session)` | `resubscribeAll(userId)` 포함 | **`resubscribeAll` 줄 삭제**(D-03·D-08). 계좌·전략·83 재동기화·종목마스터는 그대로. 83 넛지 추가(Pattern 10) |
| :1752-1825 `#clearCaches(userId)` :1754-1759 | `#quotes`·`#tapes` prefix 삭제 | 그 두 루프 삭제(전역 캐시는 사용자 세션 교체와 무관). 나머지 사용자 맵·83 초기화 스냅은 그대로 |
| :1838-1851 `#splitKey` | 3단 분해 | `progressKey` 전용으로 남기고, `marketKey` 용 2단 분해를 따로 둔다 |
| :1264-1293 `#onQueueProgress(userId, session, …)` | `subKey(userId,…)` | `progressKey(userId,…)` 로 이름만 바꾼다. 계좌 필터 **캐시 전** 그대로 |

**업스트림 송신자 추상화:** 새 인터페이스 `HubQuoteFeed { readonly isReady: boolean; send(p: Uint8Array): boolean; on("frame", …); on("ready", …) }` 를 `HubSession` 옆에 두고 `hub.attachFeed(feed)`(멱등, 1회)로 결선한다. `QuoteFeed` 가 구조적으로 만족하고, 테스트는 `FakeSession` 과 같은 가짜 feed 로 소켓 없이 바이트를 되읽는다(hub.test.ts:98-134 패턴). [ASSUMED — 인터페이스 이름]

**T-15-02 재정의:** 헤더(:45-46)의 「전역 브로드캐스트 경로를 만들지 않는다」 는 **사용자 데이터**에 대한 규율이다. 새 `"market"` 이벤트는 페이로드 타입을 `RelayQuote | RelayTape` 로 **좁혀** 선언해 계좌·주문·83 이 이 경로로 나갈 수 없게 컴파일 단계에서 막는다. 헤더 주석과 `fanout.ts` 결정 근거에 같은 문장을 남긴다(`#broadcastNxtSnap` 선례 fanout.ts:737-744).

### Pattern 4: fanout 키 구독자 색인 + 소켓 level 필터 (Q4)

**현행 [VERIFIED: relay/src/ws/fanout.ts]:**
- `Conn.keys: Map<string, { isin; ex; lv }>`(:327), 키 `keyOf(isin,ex)`=`${isin}|${ex}`(:369-371).
- `sub` 처리(:963-1005): 같은 소켓 같은 level 무시 · level 갱신은 「새 level 먼저 올리고 옛 level 내림」 · 신규면 `hub.subscribe` 후 `getSnapshot` 캐시 즉시 전송, tape 캐시는 full 만(`#sendTapeSnapshot` :1017-1022).
- `#deliver(userId,msg)`(:1637-1647): 그 사용자 소켓 전부에 보내되 `if (msg.t === "tape" && conn.keys.get(keyOf(msg.i, msg.x))?.lv === "price") continue;`(:1645) — 71 필터는 여기뿐.
- **75 는 이미 브라우저로 안 간다**: 74/75 는 envelope 단계에서 드롭된다(msg-type.ts:270-272). D-05 의 「75 추가」 는 relay 에 추가 코드가 필요 없다 — 테스트로 「75 가 hub `default` 에 도달하지 않고 브라우저 0건」 만 고정한다. [VERIFIED: msg-type.ts:250-272]

**변경:**
1. `#keyConns = new Map<string, Set<Conn>>()` — `sub` 신규·`unsub`·`#onClose`(:1406-1410)에서 갱신. `conn.keys` 와 같은 자리에서만 건드린다(두 벌 갱신 누락 방지).
2. `hub.on("market", e => this.#deliverMarket(e))`: `q` → 키 구독 소켓 중 `lv==="full"` 전부 + `lv==="price"` 는 `e.price === true` 일 때만. `tape` → `lv==="full"` 만. 계좌 필터 없음(공개 시세). 백프레셔는 기존 `#send` 그대로.
3. 기존 `#deliver` 의 tape 필터 줄(:1645)은 시세가 더 이상 `fanout` 이벤트로 오지 않으므로 **삭제**한다(죽은 분기 금지).
4. 행동 변화 한 가지(의도): 예전에는 같은 사용자의 **다른 탭**이 잡지 않은 키의 시세도 받았다(:1641-1643 주석 「브라우저가 키로 거른다」). 이제 그 키를 잡은 소켓만 받는다. webapp 는 자기 구독 키만 쓰므로 영향 없음을 e2e 로 확인한다. [ASSUMED — 영향 없음 판단]
5. `sub` 가 `"limit"` 을 받으면 `conn.keys`·`#keyConns` 에 넣지 않고 한도 오류 프레임을 그 소켓에만 보낸다(Pattern 9).

### Pattern 5: PRICE 통과 판정기 (D-05·D-06)

**서버 규칙 원문 [VERIFIED: gh-trade MarketPublisher.cpp:1881, :1919-1932 · QuoteStore.h:60-64 · MarketPublisher.h:159]:**
- `inline constexpr int kPriceLevelMinIntervalMs = 100;`
- `inline constexpr uint8_t kDirtyPriceMask = kDirtyTrade | kDirtyVI | kDirtyClose;  // 호가 제외 (D-03)` — `kDirtyBook  = 1;   // B6 호가` · `kDirtyTrade = 2;   // A3 체결` · `kDirtyVI    = 4;   // R8 VI` · `kDirtyClose = 8;   // A6 종가`
- `if ((bits & kDirtyPriceMask) != 0 && !subs.price.empty()) subs.pricePending = true;` → `if (subs.pricePending && kPriceLevelMinIntervalTicks <= m_tickSeq - subs.priceSentTick) {` 그 시점 `m_quotes.Find(key)` 최신 상태로 1프레임, `pricePending=false`, `priceSentTick=m_tickSeq`.

**relay 는 dirty 비트를 받지 못한다 → 필드 서명 비교로 복제한다 (Pitfall 4).** 서버 섹션→와이어 필드 매핑 [VERIFIED: QuoteStore.h `UpsertTrade`/`UpsertQuote`/`UpsertVI` · StockDMA.fbs `QuoteState` · envelope.ts:563-610 `parseQuoteState`]:
| 섹션 | 서버가 갱신하는 필드 | RelayQuote 키 | 서명 포함 |
|---|---|---|---|
| A3 체결 | lastPrice·open·high·low·change·changeSign·changeRate·cumVolume·cumValue·exchangeTime | `p o h l c cs cr v va` (`et` 제외) | ✓ |
| R8 VI | viRefPrice(→ vi_up/down 파생)·status·type | `viu vid` (status/type 는 와이어에 없음) | ✓ |
| A6 종가 | krx_close_price | `kc` | ✓ |
| B6 호가 | ask/bid 10단·total·**exchangeTime** | `ap aq bp bq ta tb` · `et` | ✗ |
| 마스터 정적 | upper/lower/base/listShares | `ul ll base ls` | ✗ |

`et` 는 B6 도 덮어쓰므로(QuoteStore.h `UpsertQuote` 의 `std::memcpy(d.exchangeTime, u.exchangeTime, …)`) 서명에 넣으면 호가만 바뀐 틱이 통과해 버린다. A3 는 체결마다 `v`(누적거래량)가 반드시 오르므로 체결 틱은 서명이 반드시 바뀐다.

**판정기 (hub 키당 상태 · FULL 소비자가 있고 `refs.price > 0` 인 키만 판정):**
```ts
// 키당: { sig: string; lastPriceSentMs: number; pending: boolean; timer: NodeJS.Timeout | null }
// 58(snap) → price:true, sig 갱신, lastPriceSentMs=now, pending 해제
// 59 → changed = sig(q) !== st.sig; st.sig = sig(q)
//   if (changed || st.pending):
//     if (now - st.lastPriceSentMs >= PRICE_MIN_INTERVAL_MS) → price:true, lastPriceSentMs=now, pending=false, 타이머 해제
//     else → price:false, pending=true, 타이머 1개 arm(lastPriceSentMs+100 에 캐시 최신 q 를 "price 소켓 전용"으로 emit)
//   else → price:false
// 업스트림 실효 level 이 PRICE 인 키 → 판정 생략, 전부 price:true (서버가 이미 거름 · D-06)
// refs.price === 0 → 판정 생략(price 플래그 무의미)
```
- `PRICE_MIN_INTERVAL_MS = 100` 은 서버 상수의 복제다 — 상수 주석에 `MarketPublisher.h:159` 를 인용한다.
- 타이머 발화 이벤트는 `{ msg: 캐시 최신 q, full: false, price: true }` — full 소켓은 이미 받았으므로 다시 보내지 않는다. D-07: 본문은 캐시된 `RelayQuote` 그대로(와이어 타입 무변경).
- 서명은 문자열 조립보다 필드 12개 직접 비교가 싸다(초당 수백 프레임). 강등(FULL→PRICE)·해제·linger 만료 때 키 상태를 지운다.
- 알려진 차이(서버보다 엄격): VI 상태만 바뀐 R8(참조가 불변)은 와이어상 가격 필드가 같아 relay 는 통과시키지 않는다. PRICE 소비자(돌파 칩 `use-breakout-quotes`)는 `p/c/cr` 만 읽으므로 표시 차이는 없다. [VERIFIED: tasks/gh-trade-price-only-quote-subscription-reply.md 「칩은 last_price·change_rate·change_sign 만 읽으면 된다」]

### Pattern 6: linger(D-10) + 전역 2000 가드(D-11)

- 상수: `QUOTE_SUB_LIMIT = 2000` — 서버 `inline constexpr size_t kMaxObserverSubsPerConn = 2000;`(MarketPublisher.h:94) 복제. 서버는 `if (limit <= owned.size()) { ++m_subLimitRejectCount; return; }`(ApplySubscribe)로 **무음 무시**한다. 서버 `owned` = 그 연결이 업스트림 구독 중인 키 = relay 의 「live + linger」 키와 정확히 같은 집합이어야 한다. [VERIFIED: MarketPublisher.cpp ApplySubscribe]
- `LINGER_MS` 재량(10~30초). 권고 **15초** [ASSUMED]: 새로고침 왕복(2~3초 — session-manager.ts:13-15 D-15 근거)과 탭 전환을 흡수하고, 2000 슬롯 점유를 짧게 둔다.
- 1→0: `#refs` 에서 빼지 말고 `lingering` 표식 + 타이머. 만료 시 `29(subscribe=false)` + **캐시(`#quotes/#tapes`/판정기) 삭제** — D-10 「구독·캐시를 유지하다 해제」. 이로써 캐시 크기가 ≤2000 키로 유계가 된다(종전 D-37 「캐시는 영구 보존」 을 전역 캐시에서는 linger 로 대체).
- linger 중 재구독: 타이머 해제, 프레임 없음(캐시로 그림). 단 새 실효 level 이 linger 당시 업스트림 level 과 다르면 승격(28→29(0)→32)/강등(29(1)) 규칙을 그대로 적용.
- 새 키 + (live+linger) ≥ 2000: 가장 오래 linger 한 키 1개를 즉시 해제(29 false)하고 수용. linger 키가 없으면 거부(`"limit"`) + `subLimitRejects++` + `logger.warn`. 서버는 같은 연결의 명령을 FIFO 로 처리하므로 29(false) 뒤 29(true) 순서면 서버 상한과 어긋나지 않는다. [ASSUMED — FIFO 는 publisher 명령 큐 단일 소비자 구조로 추론]
- quote 세션 재접속 시: linger 키는 재구독하지 않고 즉시 정리(소비자가 없다).
- **보안 권고(추가):** 예전에는 사용자마다 서버 상한 200 이 따로 있었다(`inline constexpr size_t kMaxSubsPerConn = 200;` MarketPublisher.h:88). 이제 2000 한 칸을 모두가 나눠 쓰므로, 한 사용자(버그 탭·악성 탭)가 2000 을 다 채우면 다른 사용자가 새 종목을 못 연다. relay 가 **사용자당 키 상한 200**(종전 서버 값과 같은 숫자)을 함께 두기를 권한다. [ASSUMED — 사용자 확인 필요, Open Question 4]

### Pattern 7: 합집합 재구독 페이싱 (필수)

**근거 [VERIFIED: gh-trade Gateway.h:72-73 · Gateway.cpp:350-400 · MarketPublisher.cpp:1701, :1758 · MarketPublisher.h:98]:**
- `constexpr size_t kSendQueueMaxFrames = 1024;` · `constexpr size_t kSendQueueMaxBytes  = 4u * 1024 * 1024;` — Notice 가 넘치면 「송신 큐 가득참 … 연결을 끊는다 (D-02)」.
- 28 응답(58, `ReplyQuote`)과 32 응답(69, `ReplyTape`, 기본 200건)은 `MsgClass::Notice` 다.
- publisher 명령 큐 `inline constexpr size_t kMaxPendingCommands = 8192;` — 넘치면 명령을 버린다(28/29/32 가 각각 명령 1건).
- 69 한 프레임 ≈ 200건 × 수십 바이트 ≈ 10KB 대 [ASSUMED 크기]. 2000 키 × (58+69) 를 한 번에 요청하면 수십 MB → 4MB 초과 → quote 연결 끊김 → 재접속 → 같은 burst → **무한 루프**.

**권고 [ASSUMED 수치]:** in-flight 창 방식 — 한 번에 최대 32 키만 요청을 내보내고, 그 키의 응답(FULL=69, PRICE=58)이 오거나 3초가 지나면 다음 키를 보낸다. 평시 0→1 도 같은 송신 큐를 거치게 하면(창이 비어 있으면 즉시) 코드 경로가 하나다. 재구독 중 도착한 `sub/unsub` 는 참조계수만 바꾸고 큐가 실효 level 로 처리한다. 진행 상황은 로그 1줄(시작·끝·키 수·소요)로 남긴다.

### Pattern 8: `/healthz` quote 축 (Q6 · D-02)

**현행 [VERIFIED: relay/src/order/order-api.ts:303-346 — CONTEXT 의 「index.ts ~238-330」 은 실제로 order-api.ts 다]:**
```ts
const sessionsOk = (stats.everReadyCount === 0 && stats.stalledCount === 0) || stats.readyCount > 0;
const journal = deps.journal?.health(now.getTime());
const journalOk = journal === undefined || !journalAlerting(journal, now);
const healthy = linkUp && sessionsOk && journalOk;
…
res.status(healthy ? 200 : 503).json(payload);
```
- `journalAlerting`(journal/status.ts:47-52)은 **장중 창**(`inTradingWindow` — KST 평일·비휴장·08:00~20:00)에서만, `rejected` 는 즉시, 그 밖은 `disconnectedSec*1000 >= JOURNAL_ALERT_AFTER_MS`(`export const JOURNAL_ALERT_AFTER_MS = 180_000;` :45) 일 때 참.
- 추가 게이트웨이(`journalGateways`)는 본문에만 싣고 503 에서 뺐다(:294-300 — 이유 ② 「`deploy-relay.sh` 기동 확인이 `curl -sf` 다」).

**권고:**
- `QuoteStatus`(journal/status.ts 동형): `frame()`(인증 직후 스냅샷 원천) · `health(nowMs)` · `on("frame")`. 상태 파생 `live`(feed ready) / `down`(그 밖, `since` = ready 이탈 시각). 브라우저 프레임 디바운스는 journal 의 `JOURNAL_DELAYED_AFTER_MS = 10_000`(:42)보다 짧게(권고 3초 [ASSUMED]) — 배지는 끊김을 빨리 보여야 한다.
- `HealthPayload.quote = { state, keyCount, lingerCount, lastFrameAgeSec, reconnects, subLimitRejects, disconnectedSec }` — 식별자·호스트·비밀 없음(smoke `health_probe` 가 `"(accountNo|userId|account_no|user_id)"` 키를 grep 해 FAIL — smoke-relay.sh:113-119).
- `quoteAlerting(health)`: `rejected`·`role_mismatch` → 즉시 참 · `disabled` → 거짓 · 그 밖 not-live 가 `QUOTE_ALERT_AFTER_MS` 이상 → 참. **유예가 반드시 있어야 한다**(Pitfall 7). 권고 60초 [ASSUMED].
- `healthy = linkUp && sessionsOk && journalOk && quoteOk`. 장중 창 게이트를 둘지는 D-02 문언(「Ready 가 아니면 503」)과 journal 선례(장중만) 사이에서 갈린다 — Open Question 5.

### Pattern 9: webapp 배지 2축 + 프레임 (Q7)

**현행 [VERIFIED]:**
- 호가주문 탭은 Phase 21 D-31 로 종목상세에서 **제거됐다**(`stock-detail-tabs.tsx:15-39`). 연결 상태 필은 `/trading` 의 `WorkbenchStatusBar`(`workbench-status-bar.tsx:122-133` — `DMA <b>{label}</b>` · 점 색 `status === "ready"`)와 My page `MeStatusBar`(`me-client.tsx:168-190`) 두 곳이다. 호가(시세)는 작업대 카드에만 있다.
- 리듀서 `applyFrame`(use-relay-socket.ts:808-995)의 `default:` 는 모르는 `t` 를 무시한다(:990-994) → **relay 를 먼저 배포해도 옛 webapp 이 깨지지 않는다**.
- 선례: `{t:"journal.state"}` — shared `RelayJournalStateMsg`(relay.ts:1286-1291 `{ t: "journal.state"; s: RelayJournalState; since?: string }`), 리듀서 `journalState` 보관(:853-855), fanout `deliverJournalState`(fanout.ts:1633-1636 전 인증 사용자), 인증 직후 스냅샷(:715-718).

**권고:**
1. shared: `RelayQuoteStateMsg = { t: "quote.state"; s: "live" | "down"; since?: string }` 를 `RelayOutbound`(:1327-1348)에 추가(이름 재량). D-07 은 59 새 타입만 금지 — 상태 프레임 추가는 허용 범위.
2. 구독 한도 오류: **기존 `{t:"msg"}` 재사용을 피한다.** fanout `rejectFrame`(:345-347, `src: RELAY_MSG_SOURCE` = `"Relay"` :169)을 쓰면 `strategy-card.tsx:585-621` 의 메시지 소비(`isLimitChaserSetRejection`·`setLastError`)가 같은 ISIN 카드에 오류를 붙일 수 있다. 별도 `{ t: "sub.limit"; i; x }`(이름 재량)를 두고 리듀서는 최신 1건만 보관한다. [ASSUMED — 권고]
3. webapp: `RelayData.quoteState: RelayQuoteStateMsg | null`(INITIAL null · `reset` 에서 null) · relay-provider 노출 · `WorkbenchStatusBar` 에 「시세」 필(live=초록 / down=적색 + 「HH:MM:SS 이후 갱신 없음」) + 기존 필을 「주문」 으로. `isStale` 는 **건드리지 않는다**(D-04 — `isStale` 는 `opacity-[.55]` 감쇠를 켠다, orderbook-ladder.tsx:450·trade-tape.tsx:444).
4. `quoteState === null`(모름 — 관찰자 비활성·판정 전)이면 시세 필을 그리지 않는다(journal.state 규율).
5. 문구: `RELAY_STATE_LABELS.connecting` 이 「시세 서버 연결 중…」(relay.ts:76)인데 이 상태는 이제 **주문 세션** 상태다 — 라벨 문구 정리 여부를 UI 단계에서 결정.

### Pattern 10: 83 잔량진행률 — 라우팅과 재송신 넛지 (CONTEXT 정정 포함)

**서버 원문 [VERIFIED: gh-trade MarketPublisher.cpp:771-779, :1480-1507 · QueueTracker.h:43-48 · QueueTracker.cpp:415-440]:**
- `// ① 그 종목·거래소 시세 구독 연결 (FULL ∪ PRICE)` → `sent += Fanout(it->second.full, b);` … `// ② 항목 계좌를 선언한 세션 (이번 ∪ 직전 계좌 — 빈 스냅샷도 닿게)` → `m_accountFanoutSink(acct.c_str(), b, MsgClass::Broadcast)`.
- 83 은 키가 dirty(항목 변화·누적 변화)이고 1초가 지났거나 force 일 때만 나간다. 조용한 키(체결 없는 상한가)는 dirty 가 안 선다.
- 재구독(29) 성립 시 — 신규 등록이든 **이미 구독 중인 키의 level 덮어쓰기**든 — `m_queueTracker.RequestResend(key);`(:1487, :1507)로 다음 틱에 한 번 강제 송신(quick-260930-d43, 「재기동 클라가 매도호가 0 상한가 종목에서 체결 전까지 83 을 못 받던 문제」).

**CONTEXT 정정:** domain 절의 「82·83 은 quote 연결로만 오고」 는 83 에 대해 사실과 다르다. 사용자 세션은 계좌를 선언하므로(session.ts:382-387 `UpdateAccountNoReq`) ② 경로로 **자기 계좌 83 을 계속 받는다**. 82 는 relay 가 envelope 단계에서 드롭한다(out-of-scope).

**권고:**
1. quote 세션 83(①)은 hub 명시 case 로 **무시**한다 — 사용자 83(②)이 이미 계좌 필터 경로(`#onQueueProgress`, 캐시 전 필터 :1264-1293)로 들어오고, quote 쪽을 사용자별로 다시 뿌리면 같은 스냅샷이 두 원천에서 겹칠 뿐이다. 남의 계좌 항목이 캐시에 들어갈 경로도 원천 봉쇄된다(T-25-24).
2. **재송신 넛지(회귀 방지 — 필수):** 사용자별 참조를 hub 가 따로 센다(`#userRefs: Map<userId, Map<marketKey, number>>`). 어떤 사용자의 그 키 참조가 **0→1** 이 되는데 전역 키는 이미 업스트림 구독 중(또는 linger)이면, quote 세션으로 **같은 실효 level 의 29(subscribe=true)** 를 1건 보낸다 → 서버 level 덮어쓰기 경로 → `RequestResend` → 다음 틱 83 이 그 사용자의 계좌 세션(②)에 도착한다. 사용자 세션이 Ready 로 (재)진입할 때도 그 사용자가 쥔 키들에 같은 넛지를 보낸다(계좌 선언 전 넛지는 ②에 안 닿을 수 있으므로). 넛지는 Pattern 7 송신 큐를 거친다(29 는 응답이 없으므로 창을 점유하지 않게). [ASSUMED — 설계. 서버 동작은 VERIFIED]
3. 넛지 없이 가면 생기는 증상: A 가 이미 보고 있는 조용한 상한가 종목을 B 가 열면 B 의 대기 주문 진행률이 다음 체결까지 비어 있다 — d43 이 고친 증상과 같다.

### Q5 답: session-manager 는 재설계 불필요

[VERIFIED: relay/src/dma/session-manager.ts:53, :305-333 · dma-client.ts]
- `export const STALE_SESSION_MS = 300_000;` 는 「생성 뒤 이만큼 지나도록 **한 번도** Ready 가 아닌 세션」(`hasBeenReady` 래치 + `createdAt`) 판정이다. **시세 프레임 도착과 무관**하다.
- `DmaClient` 에는 수신 유휴 타임아웃이 없다(송신 LivePing 30초 + 송신 정체 2초만). 서버 유휴 판정은 클라→서버 LivePing(90초)이다. 사용자 세션에 시세가 안 와도 끊기지 않는다.
- `resubscribeAll` 호출처는 hub `#onReady`(:1732) **한 곳뿐**이다 — 그 한 줄을 지우면 사용자 세션 재구독이 사라진다.
- `SESSION_GRACE_MS`(`export const SESSION_GRACE_MS = 300_000;` :33) · `acquire/release` 무변경(D-08).
- `firstReady`(:281-288)는 종목마스터 27 송신 세션 고르기(`index.ts:176-178`)에만 쓰인다 — 27 은 사용자 세션에 그대로 둔다(범위 밖, 무변경).

### Anti-Patterns to Avoid
- **JournalObserver 에 `role` 분기 넣기:** 저널 커서·기록기 의존이 quote 경로로 새고 19/25 테스트가 흔들린다. 별도 클래스.
- **시세를 `{userId,msg}` 팬아웃으로 사용자 수만큼 emit:** hub 가 키→사용자 목록을 알아야 하고 N배 emit 이 된다. 키 구독자 색인 한 경로.
- **`et` 를 PRICE 서명에 넣기:** B6 도 `et` 를 바꾼다 → 호가 틱이 PRICE 소켓에 샌다.
- **quote 83 을 사용자별로 재라우팅:** 같은 스냅샷 이중 원천 + 필터 실수 시 남의 계좌 노출.
- **재구독을 for 루프로 한 번에:** 서버 Notice 큐 4MB 초과 → 끊김 루프.
- **사용자 세션 58/59/69/71 을 `default:` 로 떨어뜨리기:** `unhandledFrameCount` PC-12 게이트를 오염. 명시 case warn.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TCP 재접속·백오프·LivePing·generation | 새 소켓 루프 | `DmaClient` (dma-client.ts) | 반개방·송신 정체·세대 규율이 이미 검증됨 |
| 관찰자 로그인 바이트 | 수기 FlatBuffers | `buildObserverLoginReq`/`parseObserverLoginResp` (+role) | 스키마 경계 한 곳(D-34) |
| healthz 상태 원천·디바운스 | 즉석 필드 | `JournalStatus` 패턴 복제(`QuoteStatus`) | 프레임·healthz 한 원천 규율 |
| 장중 창 판정 | 새 KST 계산 | `inTradingWindow`(journal/trading-window.ts) | 휴장일·NXT 창 반영됨 |
| 가짜 게이트웨이 | 새 mock 서버 | `tests/helpers/fake-gateway.ts` + `frames.ts` 확장 | 스텁 한 벌 규율(스키마 변경 시 한쪽만 고쳐지는 사고 방지) |
| 요청 프레임 되읽기 | `tryParseEnvelope` | `Envelope.getRootAsEnvelope` 직접(hub.test.ts `decodeReq` :58-96) | 수신 화이트리스트가 요청 대역을 드롭 |

**Key insight:** 이 phase 의 위험은 새 기술이 아니라 **기존 불변식(PC-12 · T-15-02 · T-25-24 · D-35 · 서버 Notice 큐)** 을 구조 교체 중에 하나라도 놓치는 것이다. 새 코드는 전부 기존 부품의 재조합이어야 한다.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 없음 — 시세 캐시는 프로세스 메모리. Supabase 스키마·RPC 변경 없음 (grep: 이 phase 가 건드리는 테이블 0) | 없음 |
| Live service config | gh-trade 120 관찰자 정원 `inline constexpr size_t kMaxObservers = 4;`(Gateway.h:120, journal+quote 합산) — relay 가 KB 에 journal 1 + quote 1 = 2 사용. KYOBO(127) journal 은 다른 서버. Cloud Monitoring uptime `gh-radar-relay-healthz`(deploy-relay.sh:110)는 503 을 그대로 잡음 — 정책 변경 불필요 | 없음(정원 여유 확인만). 배포 중 컨테이너 교체 겹침에도 2+2=4 로 정원 내 |
| OS-registered state | relay 컨테이너 `--restart=always`(deploy-relay.sh:700-712). 새 systemd·타이머 없음 | 재배포로 충분 |
| Secrets/env vars | `DMA_OBSERVER_SECRET`(Secret Manager `gh-radar-dma-observer-secret`) 재사용 — 새 비밀 없음. production 에서 없으면 기동 거부(config.ts `loadConfig`) | 없음. e2e 는 Open Question 3 |
| Build artifacts | relay Docker 이미지(AR `gh-radar` 저장소). 롤백 = `deploy-relay.sh --rollback <이전 태그>` | 배포 전 현재 가동 태그를 기록해 둔다 |

## Common Pitfalls

### Pitfall 1: 재동기화 커밋이 컴파일을 깬 채 들어감
**What goes wrong:** 생성물만 커밋하면 `createObserverLoginReq`/`createObserverLoginResp` 인자 수가 늘어 relay typecheck·typecheck:tests 가 깨진다.
**How to avoid:** 생성물 2 파일 + `envelope.ts` + `types.ts` + `frames.ts` + `fake-gateway.ts` 를 **한 커밋**. verify 에 `typecheck:tests` 포함.
**Warning signs:** `Expected 7 arguments, but got 6`.

### Pitfall 2: role 에코 불일치 — 구 서버가 quote 로그인을 journal 로 받는다
**What goes wrong:** role 을 모르는 서버(ed2e0240 이전 · gh-trade 롤백)는 role 필드를 무시하고 79 success(role 필드 부재 → 0)로 **journal 관찰자**로 수락한다. 관문은 28/29/32 를 버리고(Gateway.cpp:878) 80 저널 배치를 펌프한다. relay 는 「Ready 인데 시세가 영원히 안 온다」 + 관찰자 정원 1칸 낭비.
**How to avoid:** `result.success && result.role !== 1` → `role_mismatch` 상태, error 로그 1줄, `stopReconnect` + `destroy`, healthz 즉시 503. 재시도하지 않는다(서버 교체 뒤 relay 재시작으로 복구).
**Warning signs:** 서버 로그에 `관찰자 로그인(quote — 시세 전용)` 대신 journal 로그인 줄.

### Pitfall 3: 합집합 재구독 burst 로 quote 연결이 끊김 루프
**What goes wrong:** 58/69 Notice 응답이 서버 연결 큐(1024 프레임/4MB)를 넘겨 서버가 연결을 끊고, relay 는 재접속해 또 전량을 쏜다.
**How to avoid:** Pattern 7 in-flight 창. 재구독 소요·키 수 로그. 테스트: fake gateway 로 「키 100개 재구독 시 동시 미응답 요청 ≤ 창 크기」 단언.
**Warning signs:** 서버 로그 `송신 큐 가득참 conn=… — 연결을 끊는다 (D-02)`, relay reconnects 카운터 급증.

### Pitfall 4: PRICE 판정을 서버 dirty 비트처럼 흉내 낼 수 없음
**What goes wrong:** 59 는 섹션 비트 없이 전체 상태를 싣는다. `et` 비교나 「프레임이 왔다」 로 판정하면 호가 틱이 PRICE 소켓으로 샌다(ge2 이전으로 후퇴).
**How to avoid:** Pattern 5 서명(A3·VI·A6 필드만) + 100ms + pending 타이머. 테스트: 호가만 바뀐 59 → price 소켓 0건 · 체결 59 → 1건 · 60ms 뒤 체결 59 → 즉시 0건, 100ms 시점 최신 상태 1건.

### Pitfall 5: 서버가 상한 초과 구독을 조용히 버림
**What goes wrong:** relay 가 2000 을 넘겨 29 를 보내면 서버는 끊지 않고 무시(`++m_subLimitRejectCount; return;`) — 브라우저는 「구독했는데 시세가 안 온다」.
**How to avoid:** D-11 가드가 **업스트림 송신 전에** 판정. linger 키도 카운트. 테스트: 2000 키 채운 뒤 새 키 → 29 0건 + `sub.limit` 프레임 1건 + healthz `subLimitRejects` 1.

### Pitfall 6: 83 조용한 키 재송신 소실 (d43 회귀)
**What goes wrong:** 사용자 세션이 29 를 안 보내게 되면서 서버 `RequestResend` 트리거가 사라진다.
**How to avoid:** Pattern 10 넛지. 테스트: 전역 키 구독 중 두 번째 사용자 첫 참조 → quote 쪽 29(subscribe=true, 같은 level) 1건 · 게이트웨이 28/32 0건.

### Pitfall 7: 기동 직후 503 으로 배포 스크립트·e2e 부팅 실패
**What goes wrong:** `deploy-relay.sh` 는 20초 동안 `curl -sf /healthz`(:724-731)가 200 이어야 통과하고, e2e `waitForRelay`(webapp/e2e/fixtures/relay.ts:343-364)도 200 을 기다린다. quote 가 `connecting` 인 순간을 503 으로 내면 둘 다 실패한다.
**How to avoid:** `QUOTE_ALERT_AFTER_MS` 유예(권고 60초) — rejected/role_mismatch 만 즉시.

### Pitfall 8: e2e 가 시세를 못 받음
**What goes wrong:** e2e 기본 `withLocalRelay()` 는 `DMA_OBSERVER_SECRET: ''`(fixtures/relay.ts:696) → quote feed `disabled` → D-03(폴백 없음)이라 시세 0 → 작업대·종목 e2e 가 전부 깨진다. 픽스처의 `pushQuote` 대상도 사용자 세션 소켓(`gatewaySocket()` :741-760)이다.
**How to avoid:** Open Question 3 의 방식으로 e2e 에서 quote feed 를 켜고, fake gateway 가 role 1 로그인에 자동 응답(79 role 1 + 빈 78), 픽스처의 28/32 자동 응답은 요청이 온 소켓(=quote 소켓)으로 그대로 가므로 유지, `pushQuote` 용 소켓 선택을 quote 소켓으로 바꾼다. `unfilled-progress.spec.ts` 의 83 주입은 사용자 세션 소켓 그대로(② 경로와 같다).

### Pitfall 9: 빅뱅이라 테스트가 대량으로 뒤집힘
**What goes wrong:** hub.test ③(사용자 간 구독 격리) · ⑤ · ⑨ · ⑪ · L6/L8, fanout.test ⑥ · ⑦(「다른 사용자의 시세는 절대 넘어가지 않는다」) · ⑨ · ⑪ · F1~F6 이 per-user 전제를 단언한다. 그대로 두면 빨갛고, 대충 고치면 불변식이 사라진다.
**How to avoid:** 각 테스트를 「무엇을 지키려던 것인가」 로 재작성 — ⑦ 은 「같은 종목 두 사용자 → 업스트림 29 1건 · 둘 다 수신」 + 「구독하지 않은 사용자는 0건」 으로, 사용자 데이터 격리(계좌·전략·83)는 기존 테스트 유지.

## Code Examples

### 관찰자 로그인 요청에 role 싣기 (envelope.ts 수정 방향)
```ts
// Source: relay/src/dma/envelope.ts:2742-2768 (현행) + 재동기화 생성물 시그니처
// createObserverLoginReq(builder, secretOffset, sinceSeq:bigint, journalEpochOffset, clientOffset, strategySinceSeq:bigint, role:number)
export type ObserverLoginReqInput = {
  secret: string; sinceSeq: number; epoch: string; client: string; strategySinceSeq: number;
  /** 0 = journal(기본 · 생략 시) · 1 = quote. 그 밖 값은 서버가 거부한다(ed2e0240). */
  role?: 0 | 1;
};
const req = ObserverLoginReq.createObserverLoginReq(
  b, secret, BigInt(sinceSeq), epoch, client, BigInt(strategySinceSeq), input.role ?? 0,
);
// parseObserverLoginResp 반환에: role: r.role(),
```

### QuoteFeed 로그인 판단 뼈대
```ts
// Source: relay/src/journal/observer.ts:322-331, :449-456 축약 + Pitfall 2
#onLogin(result: ObserverLoginResult): void {
  if (this.#state !== "logging_in") return;             // 예상 밖 시점 — warn
  this.#clearLoginTimer();
  if (!result.success) return this.#reject(result.message);            // stopReconnect + destroy → "rejected"
  if (result.role !== 1) return this.#roleMismatch(result.role);       // 구 서버 = journal 로 수락됨 → 정지
  this.#transport?.resetReconnectAttempts();
  this.#reconnects += this.#everReady ? 1 : 0;
  this.#everReady = true;
  this.#setState("ready");
  this.emit("ready", {});                                // hub.resubscribeAll() — 페이싱 큐
}
```

### hub market 이벤트 타입 (사용자 데이터가 못 타게)
```ts
// Source: 신규 (subscription-hub.ts HubFanoutEvent :180 옆)
/** 공개 시세 전용. 페이로드를 좁혀 계좌·주문·83 이 이 경로로 나갈 수 없게 한다 (T-15-02 재정의). */
export type HubMarketEvent = {
  key: string;                       // `${isin}|${ex}` — fanout keyOf 와 같은 형식
  msg: RelayQuote | RelayTape;
  /** full 소켓에 보낼지 (PRICE 전용 지연 방출이면 false) */
  full: boolean;
  /** price 소켓에 보낼지 (D-06 판정 결과 · snap · 업스트림 PRICE 키면 true) */
  price: boolean;
};
```

### fanout market 전달
```ts
// Source: 신규 — fanout.ts #deliver(:1637-1647) 옆
#deliverMarket(e: HubMarketEvent): void {
  const conns = this.#keyConns.get(e.key);
  if (conns === undefined) return;
  for (const conn of conns) {
    const lv = conn.keys.get(e.key)?.lv;
    if (lv === undefined) continue;                  // 색인 불일치 방어
    if (e.msg.t === "tape" && lv !== "full") continue;   // 71 은 full 만 (현행 :1645 규칙 이관)
    if (lv === "full" ? !e.full : !e.price) continue;
    this.#send(conn, e.msg);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 사용자 세션마다 종목 구독(키 `userId|isin|ex`) | quote 관찰자 1연결 · 전역 키 `isin|ex` | 이 phase | VPN 구간 시세 N배 → 1배, 주문 세션 큐에서 시세 제거 |
| PRICE 필터를 서버가 연결 단위로 | FULL 키의 PRICE 소켓은 relay 판정 | 이 phase | 서버는 PRICE-only 키만 거른다 |
| 캐시 영구 보존(D-37) | linger 만료 시 해제(≤2000 키) | 이 phase | 메모리 유계 |
| PRICE 최소 간격 200ms (회신 문서) | 100ms | quick-260923-hp5 | 회신 문서 수치는 낡음 [VERIFIED: MarketPublisher.h:150-159] |

**Deprecated/outdated:**
- `tasks/gh-trade-price-only-quote-subscription-reply.md` 의 「200ms」 — 필드 정본으로만 사용.
- hub 헤더 D-13(「키에 userId 를 포함한다」) · fanout 헤더 7번 · `#deliver` tape 필터 주석 — 이 phase 에서 문구 갱신 대상.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `QuoteFeed` 를 별도 클래스로 두는 편이 JournalObserver role 분기보다 작고 안전하다 | Pattern 2 | 낮음 — 설계 선택. 반대로 가도 동작은 같다 |
| A2 | quote 76/78 은 무시하고 사용자 스코프 돌파 경로를 그대로 둔다 (Discretion 「78 캐시 통합」 미채택) | Pattern 2 | 중간 — 사용자가 통합을 원했다면 재작업 · **RESOLVED:** Open Q2 — 무시안 채택(Claude's Discretion · 26-03 · 26-06), plan-phase 요약에서 사용자 고지 |
| A3 | linger 15초 | Pattern 6 | 낮음 |
| A4 | 사용자당 키 상한 200 추가 | Pattern 6 | 중간 — 결정 없이 넣으면 범위 확장. 안 넣으면 한 탭이 전원의 새 구독을 막을 수 있음 · **RESOLVED:** D-15(사용자 결정 · 26-09) |
| A5 | 재구독 창 32 키 · 3초 타임아웃 · 69 ≈ 10KB 대 | Pattern 7 | 중간 — 너무 크면 끊김 루프, 너무 작으면 복구 지연. 실측 로그로 조정 |
| A6 | quote alert 유예 60초 · 브라우저 디바운스 3초 | Pattern 8 | 낮음 |
| A7 | 구독 한도 오류는 `{t:"msg"}` 대신 별도 프레임 | Pattern 9 | 낮음 |
| A8 | 83 재송신 넛지(같은 level 29 재송)로 d43 동작을 보존한다 | Pattern 10 | 중간 — 서버 `RequestResend` 동작은 VERIFIED, relay 설계는 가정 |
| A9 | 다른 탭이 잡지 않은 키의 시세를 더는 받지 않아도 webapp 에 영향 없음 | Pattern 4 | 낮음 — e2e 로 확인 |
| A10 | 서버 publisher 가 같은 연결의 29(false)→29(true) 를 FIFO 로 처리 | Pattern 6 | 낮음 — 단일 명령 큐 구조로 추론 |
| A11 | 두 서버(120·127) 가동본이 ed2e0240 을 포함한다(16:16/16:17 재기동) — gh-trade 세션 전언. 저장소 STATE 행은 「120·127 미배포」(작성 시점) | 배포 | 높음 — 미배포면 quote 로그인이 journal 로 수락돼 시세 0. 배포 전 서버 로그 확인 체크포인트 필요 · **RESOLVED:** Open Q6 — 26-15 Task 1 배포 전 checkpoint + Task 3 서버 로그 확인 |

## Open Questions (RESOLVED)

> 2026-09-30 plan-phase 에서 전부 처분했다. 각 질문 아래 `**RESOLVED:**` 줄이 처분 · 근거 · 반영 플랜이다.

1. **배지 2축에 UI 게이트(목업)를 거칠 것인가**
   - What we know: 프로젝트 메모리 「UI는 HTML 목업 먼저」 · config `ui_phase: true`. 변경은 상태줄 필 1개 추가 + 문구.
   - Recommendation: 작은 조정으로 보고 목업 1장(라이트/다크 · live/down)만 열어 확인 후 박제. 플래너가 checkpoint:human-verify 로 둔다.
   - **RESOLVED:** D-14(사용자 답) — HTML 목업 1장 검토 후 박제 · 별도 UI-SPEC 없음. 게이트는 26-13 Task 2 `checkpoint:decision`(human_verify_mode 기본값에서 human-verify 는 실행 중 멈추지 않아 「구현 전 확인」 을 보장하지 못하므로 decision 으로 둔다 — 결정의 실체는 그대로) · 구현은 26-14.
2. **quote 76/78 처리 — 무시(권고) vs 전역 캐시 통합(Discretion 문구)**
   - Recommendation: 무시. 통합은 서버 트래픽을 줄이지 않고 중복 제거만 늘린다.
   - **RESOLVED:** 무시안 채택 — Claude's Discretion 영역(CONTEXT 「78 원천」 은 재량 문구이고 잠긴 결정이 아니다). 근거: 사용자 세션이 76/78 을 계속 받고(D-08 · Gateway.cpp:1201 · :1689-1694) 서버가 76 을 사용자 연결 수만큼 보내는 것은 relay 가 무엇을 하든 멈추지 않으므로, 전역 캐시 통합은 VPN 트래픽을 줄이지 않고 N+1 원천 중복 제거만 새로 만든다. 반영: 26-03 hub `#onFeedFrame` 76/78 명시 무시 · 26-06 경계 테스트. 사용자에게는 plan-phase 요약에서 이 선택을 고지한다(뒤집으려면 26-03 · 26-06 재계획).
3. **e2e 에서 quote feed 를 켜는 방법**
   - What we know: 기본 e2e 는 관찰자 비밀을 비워 journal 관찰자를 끈다. quote 는 같은 비밀을 쓴다.
   - Options: (a) relay config 에 `DMA_QUOTE_OBSERVER_SECRET`(없으면 `DMA_OBSERVER_SECRET` 폴백) — 프로덕션 배포·Secret Manager 무변경, e2e 만 이 키를 넣는다. (b) e2e 가 항상 `DMA_OBSERVER_SECRET` 을 넣고 fake gateway 가 journal 로그인에도 빈 저널로 응답 — supabase 스텁에 커서 경로가 필요해 기존 spec 환경이 바뀐다.
   - Recommendation: (a). 「새 비밀 없음」 은 서버 쪽 약속이고 relay env 키 추가는 값이 같으므로 위반이 아니다 — 단 사용자 확인.
   - **RESOLVED:** D-17(사용자 답) — (a) 채택: `DMA_QUOTE_OBSERVER_SECRET` 우선 · 없으면 `DMA_OBSERVER_SECRET` 폴백 · 프로덕션 Secret Manager · 배포 스크립트 무변경. 반영: 26-04(config · 부팅) · 26-05(e2e 픽스처).
4. **사용자당 키 상한(200) 추가 여부** — A4.
   - **RESOLVED:** D-15(사용자 답) — 사용자당 200 을 relay 가 추가로 건다 · 오류 프레임 · healthz 카운터 · 경고 로그는 D-11 과 같은 경로. 반영: 26-09.
5. **quote 503 에 장중 창 게이트를 둘 것인가**
   - What we know: D-02 문언은 「Ready 아니면 503」. journal 은 장중만 알림(19 D-13 「운영 알림은 장중 끊김에만」). gh-trade 배포는 20:00 이후라 서버 재기동 짧은 끊김은 유예 60초가 흡수.
   - Unclear: KB 120 서버가 야간에 장시간 내려가는 운영이 있는가.
   - Recommendation: 게이트 없이(24h) 유예만 — 야간 장시간 정지가 있으면 장중 게이트로 바꾼다. 사용자 확인.
   - **RESOLVED:** D-16(사용자 답 — 권고와 달리 장중 창 게이트 채택) — `inTradingWindow`(KST 평일 · 비휴장 · 08:00~20:00) 안에서만 not-live 60초 유예 초과 시 503 · `rejected` · `role_mismatch` 는 창과 무관하게 즉시 503 · 본문 quote 필드는 24시간. 반영: 26-11(`quoteAlerting`) · 26-12(`/healthz`).
6. **서버 가동본 확인(A11)** — relay 배포 전에 120 서버 로그에서 relay 테스트 로그인 없이도 `git -C gh-trade` 태그/배포 기록 또는 서버 기동 로그로 ed2e0240 포함 여부를 확인하는 체크포인트를 둔다. 첫 relay 기동 뒤 `[Gateway] 관찰자 로그인(quote — 시세 전용)` 줄이 보이면 확정.
   - **RESOLVED:** 26-15 Task 1 — relay 배포 전 `checkpoint:human-action`(A11: 120 가동 커밋 + `merge-base --is-ancestor ed2e0240` 「포함」 확인 없이는 진행 안 함) + 26-15 Task 3 6단계 서버 로그 줄 확인. 미포함이면 relay 는 `role_mismatch` 로 멈추고 `/healthz` 즉시 503 이므로 push 하지 않고 롤백.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | relay/webapp | ✓ | v22.22.0 | — |
| pnpm | 빌드·테스트 | ✓ | 11.15.1 | — |
| flatc | sync-relay-schema.sh | ✓ | 25.12.19 (스크립트 요구와 일치) | — |
| gh-trade 저장소 | 재동기화 입력 | ✓ | origin/master fd3ac5ae · fbs ed2e0240 | — |
| gcloud (배포) | deploy-relay.sh · smoke | ✓ | Google Cloud SDK 558.0.0 | — (메인 세션 전용) |
| Playwright e2e | 픽스처 회귀 | ✓(기존) | — | `.next` 캐시 타임아웃이면 `rm -rf webapp/.next` (메모리) |

**Missing dependencies with no fallback:** 없음.
**Baseline:** `pnpm --filter @gh-radar/relay run test` → 30 파일 · 752 테스트 통과 · 9.35s (이번 세션 실행).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.4 (relay · shared · webapp) · Playwright(webapp e2e) |
| Config file | `relay/vitest.config.ts`(include `tests/**/*.test.ts`, `src/**/*.test.ts`) · `relay/tsconfig.tests.json` |
| Quick run command | `pnpm --filter @gh-radar/relay exec vitest run tests/hub.test.ts tests/quote-feed.test.ts` |
| Full suite command | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck` 그리고 `pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test` |

Phase 25 verify 명령은 **그대로 유효**하다(.planning/config.json `build_command`/`test_command` 와 동일). webapp `typecheck` 는 `tsc -p tsconfig.e2e.json` 을 포함하므로(webapp/package.json:10) fake-gateway·e2e 픽스처 변경도 여기서 잡힌다.

### 층별 역할
| 층 | 도구 | 증명하는 결정 |
|---|---|---|
| 스키마 | `sync-relay-schema.sh --check` + blob `2cf7b76…` + 마커 `ed2e0240` | 확정-와이어 |
| 단위(가짜 feed/세션) | `tests/hub.test.ts`(FakeSession + 가짜 feed, 바이트 되읽기) | 전역 참조계수·0→1/승격/강등/1→0 프레임·linger(D-10)·2000 가드(D-11)·PRICE 판정(D-05/06)·83 넛지·PC-12 계수 0 |
| 단위(FakeTransport) | 신규 `tests/quote-feed.test.ts`(journal-observer.test.ts :36-80 FakeTransport 재사용) | 로그인 role 1 송신·79 role 에코→ready·거부 정지·role_mismatch 정지·타임아웃 재수립·비밀 로그 0 |
| 상태·healthz | 신규 `tests/quote-status.test.ts` 또는 journal-status 패턴 · `createOrderApi` 직접 호출(journal-observer.test.ts ④ 패턴) | D-02 503·유예·식별자 키 0 |
| TCP 통합 | 신규 `tests/quote-gateway.test.ts`(journal-gateway.test.ts 패턴 · `startFakeGateway`) | 79 role 에코 → 78 1회 · hardClose 뒤 재접속 → 합집합 재구독(페이싱 창) · 76 quote 수신 무시 · 상한 초과는 relay 가드로 29 0건 |
| wss 통합 | `tests/fanout.test.ts` 재작성(실 SessionManager + 실 QuoteFeed or 가짜 feed + fake gateway + `connectWs`) | 유저 2명 × 같은 종목 → 업스트림 29 1건 · 둘 다 q 수신 · 캐시 공유(두 번째 사용자 sub 즉시 스냅샷) · PRICE/FULL 혼합 소켓 필터 · tape full 만 · 한도 오류 프레임 · quote.state 인증 스냅샷/전이 · D-09 unauthorized 0 |
| webapp 단위 | `webapp/src/lib/__tests__/relay-socket.test.ts`(journal.state 패턴 :1923-2045) · `workbench-status-bar.test.tsx` | quote.state 리듀서 · 배지 2축 · isStale 불변(D-04) |
| e2e | `webapp/e2e/specs/trading-workbench.spec.ts` · `stock-detail-tabs.spec.ts` · `unfilled-progress.spec.ts` | 진짜 relay 프로세스로 시세가 quote 소켓 경로로 화면까지 |
| 라이브 | `bash scripts/smoke-relay.sh`(PASS 12 · SKIP 1 기준) + `/healthz` `quote.state:"live"` + 서버 로그 quote 로그인 줄 | 배포 |

### Phase Requirements → Test Map
| Req | Behavior | Type | Automated Command | File Exists? |
|-----|----------|------|-------------------|-------------|
| 확정-와이어 | 생성물 최신 | schema | 위 Pattern 1 `--check` 명령 | ✅ 스크립트 |
| 확정-로그인 | role 1 → 79 에코 → ready · 78 1회 · 거부 정지 | unit+TCP | `pnpm --filter @gh-radar/relay exec vitest run tests/quote-feed.test.ts tests/quote-gateway.test.ts` | ❌ Wave 0 |
| D-02 | 미Ready 유예 뒤 503 · 식별자 0 | unit | `… vitest run tests/quote-status.test.ts` | ❌ Wave 0 |
| D-05/06 | 호가 틱 0 · 가격 틱 1 · 100ms pending 방출 | unit | `… vitest run tests/hub.test.ts -t "PRICE 판정"` | ✅ 파일(재작성) |
| D-10/11 | linger 재구독 무프레임 · 만료 29(false)+캐시 삭제 · 2000 가드 | unit | `… vitest run tests/hub.test.ts -t "linger\|한도"` | ✅(재작성) |
| D-12 | 사용자 세션 ready 에 28/29/32 0건 | unit | `… vitest run tests/hub.test.ts -t "사용자 세션"` | ✅(재작성) |
| 83 넛지 | 두 번째 사용자 첫 참조 → 29 1건 · 28/32 0건 | unit | `… vitest run tests/hub.test.ts -t "잔량진행률 넛지"` | ✅(추가) |
| 공유 | 2 users → 29 1건 · 캐시 공유 · 혼합 필터 | wss | `… vitest run tests/fanout.test.ts` | ✅(재작성) |
| D-01/04 | 배지 2축 · 값 감쇠 없음 | webapp unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/relay-socket.test.ts src/components/trading/__tests__/workbench-status-bar.test.tsx` | ✅(추가) |
| 전체 | e2e 시세 경로 | e2e | `pnpm --filter @gh-radar/webapp run test:e2e -- specs/trading-workbench.spec.ts` | ✅(픽스처 수정) |

### Sampling Rate
- **Per task commit:** 해당 테스트 파일 + `typecheck`/`typecheck:tests`
- **Per wave merge:** build_command + test_command 전체
- **Phase gate:** 전체 그린 + 대상 e2e 3 spec + (배포 뒤) smoke-relay.sh

### Wave 0 Gaps
- [ ] `relay/tests/quote-feed.test.ts` — QuoteFeed 상태기계
- [ ] `relay/tests/quote-gateway.test.ts` — 실 TCP 로그인·재접속·페이싱
- [ ] `relay/tests/quote-status.test.ts` — healthz quote 축
- [ ] `relay/tests/helpers/fake-gateway.ts` — `ObserverLoginRequest.role` · role 1 자동 응답(79 role 1 + `sendRateCrossSnapshot([])`) · `waitForQuoteConnection()` · 29 되읽기 헬퍼(`readSubscribeRequest` — 현재 `readQuoteRequestKey` 는 28/32 만, :101-117)
- [ ] `relay/tests/helpers/frames.ts` — `buildObserverLoginRespFrame({ role })`
- [ ] `webapp/e2e/fixtures/relay.ts` — quote feed 켜기(Open Question 3) · 시세 주입 소켓 선택

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | 관찰자 공유 비밀(`DMA_OBSERVER_SECRET`) — 비밀은 로그인 페이로드 조립 함수 밖으로 안 나감(T-19-03), 서버는 상수시간 비교 뒤 role 판정(Gateway.cpp:1280) |
| V3 Session Management | yes | wss 첫 메시지 인증·5분 유예 무변경(D-08) |
| V4 Access Control | yes | D-09 allowlist(unauthorized 는 sub 거부) · 83 계좌 필터 캐시 전(T-25-24) · 시세 경로 타입 좁힘(T-15-02 재정의) · 사용자당 키 상한(권고) |
| V5 Input Validation | yes | 기존 zod `parseInbound`(ISIN·거래소·lv) + 전역/사용자 키 가드 |
| V6 Cryptography | no | 새 암호 없음 |
| V7 Error/Logging | yes | 비밀·계좌·dmaUserId 로그 금지 · healthz 식별자 키 0(smoke grep) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 시세 공유 경로로 계좌·주문 프레임 유출 | Information Disclosure | `HubMarketEvent.msg: RelayQuote \| RelayTape` 타입 한정 · 사용자 데이터는 `#deliver(userId)` 만 |
| quote 83(남의 계좌 항목) 캐시 유입 | Information Disclosure | quote 83 명시 무시 · 사용자 83 만 계좌 필터 후 캐시 |
| 한 사용자가 2000 키 독점 | Denial of Service | 사용자당 상한(권고) + 연결당 인바운드 토큰 버킷(T-16-06, 기존) |
| 구 서버에 quote 로그인 → 저널 수신 연결 오용 | Tampering/DoS | role 에코 검증 · role_mismatch 정지 |
| 비밀 노출 | Information Disclosure | `client` 로그만 · 비밀은 로그 인자 금지 · healthz 에 호스트·비밀 없음 |
| unauthorized 사용자가 공유 캐시로 시세 획득 | Elevation | `conn.unauthorized` 분기가 `sub` 를 hub 에 넘기기 전에 차단(fanout.ts `#onAuthedMessage` 앞부분) — 무변경 확인 테스트 |

## 배포 · 롤백 (Q9)

[VERIFIED: scripts/deploy-relay.sh · scripts/smoke-relay.sh · STATE.md §Phase 17]
- 명령: `GCP_PROJECT_ID=gh-radar SUPABASE_URL=… NOTIFICATION_CHANNEL_ID=… bash scripts/deploy-relay.sh` (env 는 메모리 `reference_deploy_worker_env.md` — 라이브 컨테이너 값 보존 규칙 · `DMA_HOST` 명시 주입 없으면 가동값 보존). 기동 확인은 VM 안 `curl -sf 127.0.0.1:8091/healthz` 20회(:724-731).
- 검증: `bash scripts/smoke-relay.sh` → PASS 12 · FAIL 0 · SKIP 1 기준(INV-9 SKIP 정상) + 공개 `/healthz` 에 `quote` 축 `live` + gh-trade 120 서버 로그 `관찰자 로그인(quote — 시세 전용) … client='gh-radar-relay/quote'`.
- 순서: gh-trade 서버(완료 보고 — A11 확인) → **20:00 KST 이후** relay 배포 → smoke·healthz·서버 로그 → `git status -sb` 재확인 → push(= webapp 배포, 배지 반영). 백엔드 검증 실패 시 push 하지 않는다.
- 롤백: `bash scripts/deploy-relay.sh --rollback <이전 태그>` — 서버는 role 없는 구 relay 를 journal 로 받으므로 서버는 그대로. 이전 태그는 배포 전에 `docker inspect` 로 기록.
- **플래너 주의:** 배포·smoke·push 는 **메인 세션 수동 체크포인트**(`checkpoint:human-action` 또는 메인 세션 태스크). executor 서브에이전트는 커밋까지만.
- 문서: `infra/relay/README.md` §「시세 멈춤」 판정 절차에 quote 축(healthz `quote.state` · 서버 로그 줄) 추가.

## Sources

### Primary (HIGH confidence — 이번 세션 파일 열람·실행)
- relay: `src/hub/subscription-hub.ts`(전문) · `src/ws/fanout.ts`(:1-470, :600-760, :930-1060, :1395-1720) · `src/journal/observer.ts` · `src/journal/codec.ts` · `src/journal/types.ts` · `src/journal/status.ts` · `src/journal/trading-window.ts` · `src/dma/envelope.ts`(:440-470, :563-610, :2712-2822) · `src/dma/msg-type.ts` · `src/dma/session-manager.ts` · `src/order/order-api.ts`(:96-150, :300-371) · `src/config.ts` · `src/index.ts` · `tests/helpers/{fake-gateway,frames}.ts` · `tests/hub.test.ts` · `tests/fanout.test.ts` · `tests/journal-observer.test.ts`
- shared: `packages/shared/src/relay.ts`(:40-110, :530-560, :760-800, :1260-1365)
- webapp: `src/lib/use-relay-socket.ts`(:380-470, :640-1000) · `src/components/trading/workbench/workbench-status-bar.tsx` · `me-client.tsx` · `strategy-card.tsx`(:585-621) · `e2e/fixtures/relay.ts`(:343-364, :624-780)
- gh-trade: `git show ed2e0240`(fbs·Gateway·MarketPublisher diff) · `server/src/net/Gateway.{h,cpp}` · `server/src/market/publish/{MarketPublisher.h,MarketPublisher.cpp,QuoteStore.h,QueueTracker.h,QueueTracker.cpp}` · `server/scripts/sync-relay-schema.sh` · `.planning/quick/260930-kg3-quote/260930-kg3-SUMMARY.md`
- 실행: `sync-relay-schema.sh --check`(변경 2) · scratch flatc diff · `git rev-parse ed2e0240:…StockDMA.fbs` · relay 테스트 기준선 752/752

### Secondary
- `tasks/gh-trade-price-only-quote-subscription-reply.md`(필드 정본 · 200ms 는 낡음)
- `.planning/phases/25-order-log-progress/25-01-PLAN.md:246-256`(verify 패턴)
- `scripts/deploy-relay.sh` · `scripts/smoke-relay.sh` · `.planning/STATE.md`

### Tertiary (LOW)
- gh-trade 세션 전언 「120·127 가동본 fd3ac5ae · 16:16/16:17 재기동」 — 저장소로 확인 불가(A11)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 새 패키지 없음, 버전 로컬 확인
- Architecture: HIGH(현행 코드·서버 동작) / MEDIUM(새 클래스·이벤트 형태는 설계 권고)
- Pitfalls: HIGH — Notice 큐 끊김 · 83 재송신 · role 불일치 · e2e 비밀 모두 코드 원문으로 확인

**Research date:** 2026-09-30
**Valid until:** 2026-10-07 (gh-trade 가 활발히 변경 중 — fbs 가 다시 바뀌면 Pattern 1 재확인)
