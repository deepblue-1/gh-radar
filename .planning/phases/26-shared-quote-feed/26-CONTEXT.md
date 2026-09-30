# Phase 26: 시세 전용 공유 연결 — relay 종목 단위 팬아웃 - Context

**Gathered:** 2026-09-30
**Status:** Ready for planning

<domain>
## Phase Boundary

relay 가 유저별 DMA 세션마다 따로 시세를 구독해 gh-trade→relay VPN 구간에 같은 시세가 N 벌 흐르고, 주문 세션 송신 큐에서 통보가 시세 뒤에 줄을 서는 구조를 바꾼다. relay 는 **관찰자 로그인 quote 역할** 로 시세 전용 연결 1개를 24시간 상시 유지하고, 구독 참조계수 키를 `userId|isin|ex` 에서 **`isin|ex` 로 전역화**하며, 스냅샷·체결 테이프·거래원 캐시를 **유저 간 공유**하고, PRICE 소켓 필터(71·75 제외 · 가격 섹션만 바뀐 59 통과)를 **relay 가 직접** 건다. 사용자 DMA 세션은 주문·계좌(66/67)·상따/VI 전략·77·78·76·39/81 만 남기고 **종목 구독을 0 으로** 내린다. 82·83 은 quote 연결로만 오고 relay 가 dma_user_id·account_no 로 사용자에게 라우팅한다.

**분담:** gh-trade 서버 변경(role 필드·관문·상한·78 송신)은 gh-trade 저장소 `quick 260930-kg3` 가 맡았고 **7건 합의 + 와이어 세부가 확정됐다**(아래 「확정된 것」). 이 phase 는 relay + webapp(배지·상태 프레임) + 배포다. gh-trade-client(WinForms) 는 relay 를 거치지 않고 직결 유지(범위 밖). 시세 원천은 KB 120 하나다 — 127(교보) quote 세션은 범위 밖.

</domain>

<decisions>
## Implementation Decisions

### 확정된 것 (ROADMAP · gh-trade 7건 합의 · 2026-09-30 — 다시 묻지 않는다)

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

### ① 공유 시세 세션 단절 UX·헬스

- **D-01: 연결 배지를 「시세」·「주문」 2축으로 분리하고, 시세가 끊기면 호가창은 마지막 캐시 값을 그대로 둔 채 시세 배지만 적색.** 주문 세션(사용자 DMA)이 멀쩡함이 따로 보인다. 지금 배지는 사용자 DMA 세션 하나만 반영한다.
- **D-02: quote 세션이 Ready 가 아니면 relay `/healthz` 는 503 degraded.** 사용자 DMA 세션 stalled 와 같은 등급(저널 관찰자처럼 본문 필드만이 아니다). 기존 uptime 알림이 그대로 잡는다. 본문에 quote 세션 상태·구독 키 수·마지막 프레임 시각·재접속 횟수를 싣는다(필드 이름 재량).
- **D-03: 폴백 없음.** quote 세션이 오래 끊겨도 사용자 세션으로 시세를 재구독하지 않는다. 복구 경로는 백오프 재접속 + 합집합 재구독뿐. 경로 하나만 유지한다.
- **D-04: stale 표식은 배지만.** 끊긴 시각(「HH:MM:SS 이후 갱신 없음」 류)을 배지에 싣고 호가·체결 숫자는 흐리지도 비우지도 않는다. 재접속 뒤 28 스냅샷이 오면 자연히 갱신된다.

### ② PRICE 필터 relay 이관 범위

- **D-05: FULL 로 구독된 키를 PRICE 소켓이 볼 때 relay 는 서버 PRICE 규칙을 그대로 복제한다** — 가격 섹션(A3 체결 · R8 VI · A6 종가)이 갱신된 59 만 통과, 호가(B6)만 바뀐 틱은 0건, 키당 최소 200ms 간격. 필드 정본은 `tasks/gh-trade-price-only-quote-subscription-reply.md`. ⚠ `relay/src/dma/envelope.ts:452` 주석은 「≥100ms」 라 회신문(200ms)과 어긋난다 — 리서치가 gh-trade `MarketPublisher` 로 확인해 값 하나로 맞추고 주석을 고친다. 71·75 는 PRICE 소켓에 보내지 않는다(71 은 `fanout.ts:1645` 현행 필터, 75 추가).
- **D-06: 판정은 hub 키 단위 1회.** 키마다 마지막 가격 섹션·마지막 PRICE 송신 시각을 두고 59 프레임에 「PRICE 통과」 플래그를 붙인다. fanout 은 소켓 level 로만 거른다 — 소켓 수와 무관한 비용, 서버 코얼레싱(종목 단위 전역 틱)과 동형. PRICE-only 키는 업스트림 level=1 이라 서버가 이미 걸러 relay 판정은 전부 통과한다(무해).
- **D-07: PRICE 소켓용 59 본문은 FULL 과 같은 프레임.** 축약 타입을 만들지 않는다. 웹 파서·리듀서·shared 타입 변경 0.

### ③ 사용자 DMA 세션 역할·수명

- **D-08: 15 D-15 그대로 유지** — wss 첫 인증 연결에서 로그인, 마지막 wss 가 끊긴 뒤 5분 유예 후 TCP 종료. 인증 직후 계좌 66/67 · 전략 스냅샷(24/21/34) · 77 · 78 · 76 · 409 `SESSION_NOT_READY` 의미가 모두 그대로다. 사용자 세션이 하는 일에서 **종목 구독(28/29/32/35)만 빠진다**. 웹 변경 0.
- **D-09: `dma_credentials` allowlist 유지.** 매핑 없는 로그인 사용자는 지금처럼 연결 유지·구독 거부(unauthorized). 이 phase 는 전송 구조 교체만이며 시세 공개 범위 확대는 별도 phase(deferred).

### ④ 구독·캐시 전역화 세부 + 전환

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 정의 · 배경
- `.planning/ROADMAP.md` Phase 26 블록 — Goal(관찰자 quote 역할 · 참조계수 전역화 · 캐시 공유 · PRICE 이관 · 배포 순서). D-13 으로 「착수 전 실측」 조항은 내림.
- `.planning/STATE.md` Roadmap Evolution 2026-09-30 「Phase 26 added」 행 — 배경(유저 5~6명 같은 종목 · Fanout conn 단위 복사 · 퍼블리셔가 주문 NIC IRQ 와 코어 3 공유 · users.toml 에 relay 계정 없음 · Gateway.cpp:856 관문).

### gh-trade 서버 쪽 정본 (외부 저장소 `/Users/alex/repos/gh-trade`)
- `server/src/protocol/StockDMA.fbs` — `ObserverLoginReq.role`(슬롯 14) · `ObserverLoginResp.role`(슬롯 26). 커밋 `ed2e0240`(push 대기). relay 는 `sync-relay-schema.sh RELAY=gh-radar` 로만 생성물을 받는다.
- `.planning/quick/260930-kg3-quote/` — quote 역할 관찰자 PLAN/SUMMARY(작성 중). 7건 합의 원문.
- `.planning/phases/23-observer-journal/23-CONTEXT.md` D-09~D-13 · D-16 — 관찰자 비밀·거부 단일 문구·관문(5·4 외 전부 거부, 이번에 quote 만 6종 허용)·상한 4·유휴 스윕.
- `server/src/net/Gateway.h` `kMaxObservers = 4` · `server/src/market/publish/MarketPublisher.h` `kMaxSubsPerConn = 200`(quote 2000 은 별도 값).

### relay 기존 규약
- `tasks/gh-trade-price-only-quote-subscription-reply.md` — PRICE level 정본(59 만 · 가격 섹션 갱신 때만 · 키당 200ms · 본문은 FULL 과 같은 빌더 · 서버 코얼레싱은 종목 단위 전역 100ms 틱). D-05 판정기의 필드 정본.
- `relay/src/hub/subscription-hub.ts` 헤더 주석 §level(quick-260923-ge2) · D-33 · D-35 · D-23 — 구독 프레임 순서·승격/강등·「relay 추가 코얼레싱 없음」·계좌 상태는 구독과 무관.
- `.planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-CONTEXT.md` D-11 · D-13 · D-15 · D-16 · D-33 — wss 인증 · 사용자별 세션 · 5분 유예 · 재접속 · 시세 프레임.
- `.planning/phases/19-account-order-journal/19-CONTEXT.md` D-04 · D-09 · D-10 · D-13 · D-14 — 관찰자 자격·비밀 하나·24시간 상시·거부 시 중단·빅뱅 전환 선례.
- `.planning/phases/19-account-order-journal/19-GH-TRADE-HANDOFF.md` — 관찰자 로그인 규약 원문.
- `.planning/phases/25-order-log-progress/25-CONTEXT.md` — 83 `QueueProgress` 처리(캐시 + isReady fanout + 인증 후 스냅 재생 · 계좌 필터) · 82 무시 규칙.

### 운영 · 배포
- `infra/relay/README.md` §현재 운영 상태 · §터널 정지 판정 절차 — wg-probe · §3자 대조 — relay VM 자원(e2-small) · 「시세 멈춤」 판정 절차(quote 세션 축이 추가된다).
- `.planning/STATE.md` §Phase 17 프로덕션 배포 완결 — 「push 가 곧 webapp 배포 · relay 먼저 → 검증 → push」 교훈.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **관찰자 파이프라인** — `relay/src/journal/observer.ts`(상태기계 · `buildLoginReq` · start/backoff · 거부 시 중단 :257-290) · `relay/src/dma/envelope.ts:2721-2790`(`buildObserverLoginReq` / `parseObserverLoginResp` — role 필드는 생성물 재동기화 뒤 여기서) · `relay/src/journal/status.ts`(관찰자 상태 → `journal.state` 프레임 · `/healthz` 한 원천 — quote 상태도 같은 패턴) · `relay/src/journal/codec.ts:23-47`(79/80 분기 — quote 는 79 뒤 78·59·71·75·83 을 hub 로).
- **hub** — `relay/src/hub/subscription-hub.ts:248` `subKey(userId,isin,ex)` · `:377-379` `#quotes`/`#tapes` · `:549-630` 참조계수 `{full,price}` 두 칸·승격/강등 프레임 · `:853-858` 캐시 조회 · `:959-970` `refCount` · `:1019-1150` `#onFrame` case(59/69/71/75/76/78/83) · `:1264` `#onQueueProgress`(계좌 필터 캐시 전) · `:1684-1722` 0→1 프레임 조립 · `:1754-1758` 세션 교체 시 prefix 삭제(전역화 뒤 규칙 재설계).
- **fanout** — `relay/src/ws/fanout.ts:22-25`(sub 처리 요약) · `:327` `conn.keys` Map(소켓별 level) · `:967-1001`(같은 소켓 level 갱신 · tape 캐시는 full 만) · `:1641-1645`(`#deliver` price 소켓 tape 필터 — 75 와 D-05 플래그 필터를 여기에) · `:318,642`(allowlist 미등록 처리 — D-09 유지) · `:1494-1522` `deliverJournalRows`(계좌 필터 푸시 패턴).
- **세션** — `relay/src/dma/session-manager.ts:12-53`(D-15 `SESSION_GRACE_MS` · `STALE_SESSION_MS` :53 — stalled 판정 원천 확인 필요) · `:187-250` `acquire`/`release`/유예.
- **healthz** — `relay/src/index.ts:238-330`(내부 8091 · `journal` · `journalGateways` 본문 · 503 판정 — quote 세션을 503 축에 추가).
- **webapp** — `webapp/src/lib/use-relay-socket.ts:765-902` `applyFrame`(state 프레임 리듀서) · 호가주문 탭 연결 상태 배지(컴포넌트 위치는 리서치) · `packages/shared/src/relay.ts:1175,1250-1290`(state/outbound 프레임 union — 시세 축 상태 값 추가).
- **테스트** — `relay/src/dma/__tests__` · `relay/src/ws/__tests__` · mock 게이트웨이(17-03) — quote 관찰자 시나리오 추가처.

### Established Patterns
- 수기 사본 3곳(`relay/src/dma/msg-type.ts` · `envelope.ts` · `subscription-hub.ts #onFrame`)만 손대고 `relay/src/generated/` 는 `sync-relay-schema.sh`(gh-trade 소유) 결과만 커밋.
- 서버 진실은 relay 가 판정하지 않는다 — 단, PRICE 필터는 「서버 규칙 이관」 이라 예외이고 규칙 원문을 그대로 복제한다(D-05).
- 계좌 가시성 필터는 캐시 **전**(83 · 저널) — 공유 세션에서도 남의 계좌 항목이 캐시에 남지 않게.
- healthz 는 한 원천(`JournalStatus` 동형) · 브라우저 상태 프레임과 같은 값.
- 배포: 장 마감 20:00 이후 · relay 먼저 → smoke-relay.sh → push. 서브에이전트는 커밋까지, 배포는 메인 세션.

### Integration Points
- `relay/src/index.ts` 부팅 — journal 파이프라인 옆에 quote 파이프라인 start · hub 에 「업스트림 송신자」 로 quote 세션 주입(사용자 세션 대신).
- hub — 사용자 세션 `ready` 훅에서 종목 재구독 제거, quote 세션 `ready` 에서 합집합 재구독.
- fanout `sub`/`unsub` — 전역 참조계수 + 2000 가드 + linger.
- webapp 배지 — 시세 축 상태 프레임 소비.

</code_context>

<specifics>
## Specific Ideas

- 서버 로그로 quote 로그인 성공을 확인한다: `[Gateway] 관찰자 로그인(quote — 시세 전용) conn=… ip=… client='…'`. relay 는 `client` 를 `gh-radar-relay` 계열로 두되 journal 과 구분되는 값(예: `gh-radar-relay/quote`)이면 서버 로그에서 두 연결을 가를 수 있다(재량).
- 서버는 상한 초과 구독을 **조용히** 무시한다 — relay 가드가 없으면 「구독했는데 시세가 안 온다」 로만 보인다. D-11 이 그 함정을 막는다.
- 구 relay 는 새 서버에 journal 로 붙는다 — 서버를 먼저 올리고 relay 를 나중에 올려도 시세가 끊기지 않는다(전환 창 안전).

</specifics>

<deferred>
## Deferred Ideas

- `dma_credentials` 없는 로그인 사용자에게 공유 시세 개방(시세 공개 정책 · 구독 상한 소비 · 종목상세 시세-only 뷰) — 별도 phase.
- env 플래그로 per-user/shared 병존(빠른 롤백) — 기각, 필요해지면 후속.
- 착수 전 장중 기준선 실측(코어 3 · 송신 큐 · 주문 응답 지연) — 사용자 결정으로 내림. 배포 뒤 문제가 보이면 그때 측정.
- 127(교보) 시세 quote 세션 — 이 phase 시세 원천은 120 하나. 다중 게이트웨이 시세는 후속.
- 사용자 세션 지연 로그인(주문·전략 표면에서만) — 기각(D-08), 게이트웨이 세션 수 절감이 필요해지면 재검토.

</deferred>

---

*Phase: 26-shared-quote-feed*
*Context gathered: 2026-09-30*
