# Phase 18: gh-trade 신규 기능 UI — 통합 트레이딩 작업대(상따+VI+돌파감지) · 예약/시간외종가 발주 · NXT VI - Context

**Gathered:** 2026-09-21
**Status:** Ready for planning

<domain>
## Phase Boundary

서버(gh-trade)가 Phase 17 에서 이미 relay 로 흘려보내는 세 가지 진실 — 등락률 돌파 알림(76/78) · 예약/장전/시간외종가 창 힌트(77) · 거래소별 VI 전략(KRX/NXT) — 을 **웹에서 쓸 수 있게** 한다. 사용자 결정(D-01)으로 범위가 「화면 3개 신설」에서 **「상따와 VI 를 한 페이지 `/trading` 으로 합친 다종목 트레이딩 작업대 재설계」** 로 넓어졌다. 이 페이지 하나에서 탐색(돌파감지·VI 발동) → 추가 → 전략 설정 → 수동주문(신규·정정·취소) → 미체결/잔고/로그 확인이 끝난다. 종목상세 `/stocks/[code]` 호가 탭은 이 작업대의 카드 본문과 같은 문법으로 맞춘다.

데이터 배관(relay 파서·세션 캐시·인증 스냅샷·`useRelay().rateCrossItems / queuedWindow / viTriggers{KRX,NXT}`)은 Phase 17 이 끝냈다. 이 phase 가 새로 만드는 계약은 **넷**이다: ① 주문 프레임에 `pieceCount`·`krxSession` 추가, ② 정정(`order_type "M"`) 허용(relay D-21 게이트 해제), ③ 돌파 목록 종목의 시세 구독 경로, ④ 돌파 항목 `name`/`code` relay 보강(D-30, 2026-09-21 리서치 후 사용자 결정으로 추가).

**범위 밖:** My page(`/me`) 구조 변경, 서버(gh-trade) 변경, 알림 푸시, 실주문 검증 절차(D-27 계열).

</domain>

<decisions>
## Implementation Decisions

### 범위·라우트
- **D-01:** Phase 18 = **`/trading` 단일 트레이딩 작업대**(상따 다종목 카드 + VI 설정/발동 + 돌파감지 통합) + 종목상세 호가 탭 통일 + 종목정보 팝업. ROADMAP·REQUIREMENTS 의 TRADE-06/07/08 정의를 이에 맞춰 확장하고 통합 작업대 요구사항(TRADE-09)을 신설한다. — **Reversibility:** costly — 상따 화면 1,641+1,526 줄과 VI 화면 663+951 줄이 한 페이지로 재구성되며, 사이드바·라우트·e2e 스펙(`trading-limit-chaser.spec.ts`·`trading-vi.spec.ts`·`sidebar-tree.spec.ts`)이 함께 바뀐다.
- **D-02:** 기존 화면 3개(`/trading/limit-chaser/new` · `/trading/limit-chaser/[key]` · `/trading/vi`)는 **제거**하고 `/trading` 으로 리다이렉트만 남긴다. `[key]` 는 `/trading?focus={key}` 로 보내 해당 카드를 펼친 상태로 연다. My page 의 전략 현황 카드·계좌 패널은 그대로 두되 링크 대상을 `/trading(?focus=)` 로 바꾼다.
- **D-03:** 사이드바 「트레이딩」 그룹 제목 자체가 `/trading` 링크(활성 표시). 3단 목록은 「KRX VI(가동중 배지)」「NXT VI」 + 등록된 상따 전략(종목명 · LED 3점 요약, 카드와 동기). 개별 「상따」「VI」 메뉴는 없앤다. 그룹 항상 펼침·트레이딩 가시성 게이트(`useTradingVisible`)는 Phase 16 D-16/D-19 그대로.

### 페이지 구조 (위 → 아래) — 정본은 목업 `18-workbench-mockup.html`
- **D-04:** 제목 「트레이딩」 + 상태줄: DMA 상태 · 돌파 N(신규 M) · VI 발동 N(미확인 M) · 거래 종목 N · 임계 20%·재무장 −2%p · 77 구간 배지(모름이면 없음) · 알림음 토글 · 반영 시각 · **1·2·3단 세그먼트**(카드 격자 열 수, localStorage 저장, 폰 밴드(본문 <700)에서는 숨기고 항상 1단).
- **D-05:** **VI 설정 2줄** — KRX 한 줄, NXT 한 줄. 각 줄 = 거래소 태그 · on/off 스위치(= `run`, 시작/중지 확인 다이얼로그는 Phase 16 D-07 유지) · 상승률 % · 금액 만원 · 가동중이면 빨간 「가동중」 + 서버 반영 시각 · 값 바꾸면 줄 끝 「수정」(더티, 에코가 이김). 계좌·마감알림은 줄에 표시하지 않는다(계좌는 상태줄). `vi.set` 은 줄의 거래소를 실어 보낸다(Phase 17 D-18 의 `VI_EDIT_EXCHANGE` 상수 폐기).
- **D-06:** **VI 발동 스트립** — 돌파 스트립과 같은 문법. 접힌 줄: 「VI N · 미확인 M」 + 칩(종목명 · 발동가 · 전일대비 · 시각 · 상태 배지 접수/체결/부분체결/취소/거부), 미확인(접수 ∧ 미체크)은 연노랑. 「더보기」 → 표(확인 ☐ · 주문시간 · 종목 · 거래소 · 발동가 · 전일대비 · 주문가 · 수량 · 체결 · 상태 · 110초 진행바, 양 거래소 한 목록·최신 위). **확인 체크는 표에서만**, 규칙은 기존 `vi-order-list` 그대로(접수 후 ∧ 주문번호 有 ∧ !confirm_locked 만 활성, 체크 즉시 잠김·즉시 `vi.confirm` 전송·더티 아님). 이 표가 기존 VI 주문내역 화면을 대체한다.
- **D-07:** **돌파감지 스트립(A안)** — 한 줄 칩(가로 스크롤, 「돌파 N · 신규 M」 라벨 항상 노출) + 「더보기」로 전 열 표(종목 · 현재가 · 등락률 · 임계 · 기준가 · 돌파시각 · 액션). 칩/행에 **KRX/NXT 를 표시하지 않는다.** 칩/행 클릭 → 바로 아래 격자에 카드가 생기고(거래소 KRX 로 시작, 스위치 전부 OFF) 그 행은 「거래중」 표식으로 바뀐다. 이미 카드가 있는 종목은 클릭 시 그 카드를 펼치고 스크롤.
- **D-08:** **종목 추가 검색란**(검색 + 「추가」만, 거래소 토글 없음)은 돌파 스트립 바로 아래 · 카드 격자 위. Phase 16 종목검색 컴포넌트(첫 항목 자동 활성화, quick 60) 재사용.
- **D-09:** **카드 격자 정렬 = 펼친 카드 먼저 각각 한 칸, 접힌 카드는 스택 한 칸에 세로로.** 2단이면 [펼친 A | 접힌 3장 스택], 펼친 카드가 2장이면 [A | B] 다음 줄에 [스택]. 헤더 클릭으로 스택에서 빼고 넣는다(재렌더, 애니메이션 없음). 스택 위 라벨 없음.
- **D-10:** **카드 헤더**(펼침·접힘 공통): 종목명 · 코드 · **KRX | NXT 세그먼트 토글** · 현재가 · 등락률 · LED 3칩(매수/매도/취소, Phase 17 규칙 그대로) · ⓘ 종목정보 · 캐럿 · ✕. 매수/매도/한방 **스위치는 헤더에 두지 않는다**(D-12). 거래소 토글은 전략 키(`ISIN:계좌:거래소`)의 일부이므로 **등록 전 카드(스위치 전부 OFF · 서버 전략 없음)에서만 활성**, 등록 뒤 잠김. 등록된 전략의 거래소 변경(삭제+재등록)은 이연(deferred).
- **D-11:** 카드 헤더 아래 **종목정보 10칸** — 기존 `lc-quote-grid` 라벨 그대로(기준·시가·고가·저가·상한·하한·상승VI·거래·시총·발행1%). 배치는 카드 폭 기준 ~699 2단×5행 / 700–991 5단×2행 / 992+ 한 줄. 펼친 카드에만.
- **D-12:** **카드 본문 = 어느 폭에서도 좌 호가 10단(+최근 체결) | 우 옵션 세팅 4그룹**(매수주문·한방체결·매도주문·매수취소, 필드는 기존 `limit-chaser-form` 그대로). §2.2b 4밴드 규칙을 **카드 컨테이너 폭** 기준으로 옮긴다: ~699 호가 42% 1단 + 옵션 매수/매도 탭·라벨 위/입력 아래 · 700–829 2단 호가 260px + 옵션 2열(매수+한방 | 매도+취소)·라벨 좌 76px · 830–991 3단 호가표 400px · 992+ 460px. 따라서 2·3단 격자에서는 카드 안 밀도가 폰 밴드로 바뀐다(사용자 확인). **매수/매도/한방 켜기 스위치는 각 그룹 제목줄 우측**(기존 폼 패턴). 「호가」「체결」「옵션 세팅」 같은 섹션 라벨은 넣지 않는다. 더티 액션 바(수정/되돌리기)는 카드마다 있으며 문구에 종목명을 포함한다(포털 규율은 D-28).
- **D-13:** **하단 공용 패널** — 미체결 · 잔고 · 전략 로그 탭, 전 종목 합산(종목 열). 700 이상은 격자 아래 섹션, 폰은 하단 고정 접이식 바. 미체결 행에 주문No 열과 취소 버튼, 행 클릭이 수동주문 정정/취소 대상 선택(D-21).

### 돌파감지 목록 행동 규칙 (정본: gh-trade `rate-cross-alert.md`)
- **D-14:** 서버 집합을 재해석하지 않는다 — 78 은 전량 교체(빈 배열도 권위값), 76 은 upsert, 정렬은 서버(새 돌파 맨 위 · 재돌파 자리 유지), 상한 200 은 Phase 17 리듀서 그대로. 자동 열기(카드 자동 추가) 금지.
- **D-15:** 「오늘 알림 울린 종목」과 「사용자가 지운 종목」은 **localStorage, KST 날짜 키**에 기억한다(날짜 경계에서 자동 리셋, 서버 왕복 없음, 기기별).
- **D-16:** **임계−2%p(18%) 이탈 시 즉시 삭제.** 서버가 알려주지 않으므로 웹이 목록 종목의 현재가를 알아야 한다 → **돌파 목록 종목의 시세 구독**이 필요하다(카드가 없는 종목도). 구독 경로·상한(relay/DMA 세션 구독 한도)은 리서치 항목. 재돌파는 서버 76 으로 재진입.
- **D-17:** 알림음 = 상태줄 스피커 토글(localStorage), **기본 꺼짐**, 종목당 하루 1회(D-15 집합). 브라우저 자동재생 차단 상태면 아이콘에 「클릭해 활성화」 표시. 소리 종류는 Claude 재량(파일 없이 Web Audio 합성 단음 권장).
- **D-18:** 새 돌파 강조 = 깜박임 없이 **30초 연노랑 + 「신규」 배지** 후 기본. 행에 ✕ 수동 삭제, 지우면 그날 재돌파에도 안 나옴(D-15).

### 수동주문 · 예약/장전/시간외종가 발주(77) (정본: `queued-order.md` · `preopen-offhours-order.md`)
- **D-19:** **수동주문 배치는 적응형 한 규칙**(카드·호가 탭 공통): 컨테이너 <700(매수/매도가 탭인 밴드) → 「매수 | 매도 | 수동」 3탭 · ≥700(옵션 2열) → 옵션 우상단 「수동주문」 버튼 → 옵션 영역을 폼이 덮고 ✕ 로 닫음(옵션 값 보존).
- **D-20:** **수동주문 폼** = 가격 · 수량 · (예약구간 ∧ KRX) 조각 수 · 주문금액 · **「매수 · 매도 · 정정 · 취소」 4버튼 한 줄**. 계좌 행 · 가격 ±버튼 · 비율(10/25/50/100%) 버튼 · 「호가 사다리를 누르면…」 안내는 **없다.** 호가 사다리 클릭은 가격을 채운다. 제출 전 확인 다이얼로그는 기존 `order-confirm-dialog` 재사용(D-20 한도 고지 포함).
- **D-21:** **정정·취소는 미체결 행 선택 시 활성.** 하단 공용 미체결(작업대) / 미체결 목록(호가 탭)의 행 클릭 → 폼 위 「원주문 {No} · 매수 가격 × 수량 ✕」 칩, 가격·수량이 원주문 값으로 채워짐. 정정 = 값 바꾼 뒤 「정정」, 취소 = 「취소」(확인: 「미체결 주문을 취소할까요? 잔량 전부」). 선택 없으면 두 버튼 disabled. **정정(`order_type "M"`)은 relay 가 Phase 15 D-21 로 막아 둔 것을 이 phase 에서 연다** — shared `RelayOrderNewMsg` 계열에 정정 프레임(원주문번호·거래소 승계), relay `buildDirectOrderReq` 의 "M" 허용, `dma_orders` origin/kind 기록. 시간외종가 원주문은 정정 불가(취소 후 재등록)라 콤보가 시간외종가면 정정 비활성. — **Reversibility:** costly — shared 계약·relay 와이어 빌더·서버 통보 파서(`notice_type "M"`)·smoke 프로브가 함께 바뀐다.
- **D-22:** **77 힌트는 라벨·입력 전환에만 쓴다.** `queuedWindow === undefined` 는 「모름」이며 전부 false 로 읽는다. 벽시계로 창을 판정하지 않고, 이 값으로 주문을 막지 않는다(판정은 서버). 매핑: `open`(예약구간) ∧ KRX → 버튼 「예약매수/예약매도」 + 조각 수 스테퍼(기본 5, 상한 `maxPieces`) · `preopenOpen`(KRX 장전) 또는 `nxtPreopenOpen`(NXT) → 「예약매수/예약매도」, 조각 입력 숨김(조각 1), 확인 다이얼로그에 「예약: 증권사 보관 후 09:00 처리」(NXT 08:00) · 그 외 → 「매수/매도」. 주문 프레임에 `pieceCount`(예약구간 밖에서는 보내지 않음/0)·`krxSession`("" 기본) 필드를 **shared 타입 · webapp 번역기 · relay 빌더 3곳**에 추가한다(Phase 17 D-12 의 「미송신」 해제).
- **D-23:** **시간외종가(G2/G3)는 종목상세 호가 탭의 수동주문 폼에만** 있다 — 주문유형 콤보 「지정가 | 시간외종가」, KRX ∧ (`g2Open` ∨ `g3Open`) 일 때만 선택 가능(창이 닫히면 지정가로 복귀), 선택 시 가격 잠금 + 「참고 종가」 표시 + `price 0`·`krxSession "G2"/"G3"` 송신, 버튼은 창과 무관하게 「매수/매도」(조각 1). **작업대 카드의 수동주문에는 주문유형이 없다**(WinForms 상따창과 동일).
- **D-24:** **종목상세 호가 탭 = 카드 본문과 같은 문법.** 상태줄(DMA · 계좌 · **거래소 KRX|NXT 세그먼트** · LED 3칩 · 구간 배지) → 종목정보 10칸 → 좌 호가(+체결) | 우 옵션 4그룹 + 적응형 수동주문(D-19~D-23) → 미체결/잔고. 반응형은 §2.2b 4밴드를 **호가 탭 본문 폭** 기준으로(카드와 같은 컴포넌트·같은 컨테이너 이름). 매수 비율 버튼 없음은 기존대로. 정본은 목업 `18-orderbook-tab-mockup.html`.
- **D-25:** **종목정보 팝업** — 카드 헤더 ⓘ → 모달(폰 전체화면 시트 · 700 이상 최대 960px 중앙), 탭 「차트 | 종목정보 | 뉴스·토론」. 내용은 기존 종목상세 4탭에서 호가주문을 뺀 것을 그대로 재사용(새 데이터 경로 없음). 닫기 ✕ · 배경 클릭 · ESC.

### 공통 규율 (이월 + 이번 확정)
- **D-26:** **목업 게이트는 통과했다.** 정본 목업 2개 — `18-workbench-mockup.html`(7차) · `18-orderbook-tab-mockup.html`(6차). UI-SPEC 은 이 두 파일을 기준으로 쓰고, 실행 중 레이아웃을 다시 묻지 않는다(Phase 17 D-22 패턴). 목업이 코드와 다르면 목업이 이긴다.
- **D-27:** 서버 진실을 클라가 재계산·재해석하지 않는다(Phase 16 D-11·Phase 17 D-04 계열): 에코가 항상 이기고(더티도 덮음 + 「다른 단말에서 변경됨」 status), queued/pending 문구는 표시만, `OrderResp.message` 파싱 금지, 77 벽시계 판정 금지, 76/78 집합 가공 금지(D-14). 토스트 라이브러리 없음 — 인라인 `role="status"`.
  - **R4 보강 (2026-09-22 사용자 결정 · R3-WR-02 · R3-IN-01 · R3-IN-02):** 「결과 모름」 주문 잠금은 **앱 수명**이다 — 루트 레이아웃 `RelayProvider` 가 `strategyKey(isin, accountNo, exchange)` 키로 들고 로그아웃 · 새로고침에만 푼다. 작업대 카드와 종목상세 호가 탭 수동주문이 같은 키로 같은 잠금을 읽는다(호가 탭은 R3 목업 3-b 문구 재사용). 등록은 **신규 · 정정** 요청만 — 취소 timeout 은 결과 배너만 남긴다. 전송 중(응답 전) 신규 · 정정도 같은 키를 잠근다. 18-30 의 페이지 수명 규칙과 「relay 컨텍스트로 올리지 않는다」 금지는 이 결정으로 대체됐다(18-34 · 18-35).
- **D-28:** 반응형은 **컨테이너 쿼리 두 단위** — 페이지 본문(`page`, 상태줄·스트립·격자 열 수)과 카드(`card`, 본문 배치). 뷰포트 분기 신설 금지. `container-type` 의 layout containment 때문에 **더티 액션 바는 `document.body` 포털**로 띄운다(§2.2b 주석) — 카드가 여럿이므로 바 문구에 종목명을 쓴다.
- **D-29:** 자동 게이트는 config `build_command`/`test_command` 그대로 + Playwright. 카드 폭 4밴드 × 격자 1/2/3단 × 폰/와이드 잘림 0 을 실브라우저로 단언한다(Phase 17 `trading-limit-chaser.spec.ts` 케이스 9·11·12·13 패턴).

### 리서치 후 확정 (2026-09-21, `18-RESEARCH.md` O-1)
- **D-30:** **돌파 항목에 종목명·단축코드를 relay 가 보강한다.** `RelayRateCrossItem` 은 ISIN 8필드뿐이고 웹앱에 ISIN→코드 조회 원천이 없으므로(`useIsinLabels` 3원천에 돌파 없음), relay 가 76/78 팬아웃 직전 `symbols.lookup(isin)` 으로 optional `name`/`code` 2필드를 채운다 — `#enrichNames`(미체결)·`RelayViOrderItem.name`·`RelayLimitChaser.name/code` 와 같은 선례. 변경은 shared optional 2필드 + hub `#onRateCrossAlert`/`#onRateCrossSnapshot` decorate 한 줄씩. lookup 실패 시 필드 부재 → 웹은 ISIN 을 그대로 표시하고 ⓘ 팝업은 비활성. 대안(웹앱이 검색 API 를 ISIN 으로 O(N) 호출)은 기각. **이로써 D-11 계열의 「새 계약은 셋뿐」이 넷이 된다**(domain 문단 갱신됨).

### Claude's Discretion
- 알림음 파형·길이(파일 없이 Web Audio 합성), 자동재생 차단 감지 방식.
- VI 「마감알림」 로컬 설정의 거취(상태줄 토글로 옮기거나 제거) — 서버와 무관한 값.
- `/trading?focus=` 파라미터 이름·인코딩(`limitChaserHref` 헬퍼 재사용).
- 돌파 목록 종목 시세 구독 경로(리서치 결과에 따름: relay 구독 프레임 재사용 vs 스냅샷 가격 폴백)와 구독 상한 초과 시 우선순위(카드 있는 종목 > 신규 돌파 > 오래된 돌파).
- 정정 프레임 이름(`order.modify` 등)과 `dma_orders` 기록 형태.
- 스택/카드 전환 애니메이션 없음, 30초 강조 타이머 구현.
- 폰 밴드 카드 헤더의 종목명/코드 2줄 접기 등 세부 타이포.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 채택 목업 (레이아웃 정본 — D-26)
- `.planning/phases/18-gh-trade-ui-nxt-vi/18-workbench-mockup.html` — `/trading` 통합 작업대 7차: 상태줄·VI 설정 2줄·VI 발동 스트립/표·돌파 스트립/표·종목 추가·카드(헤더·10칸·호가|옵션·적응형 수동주문·더티 바)·스택 정렬·공용 패널·사이드바·종목정보 팝업·77 구간 시뮬레이터. 상단 범례와 하단 「설계 메모」에 밴드 수치와 트레이드오프가 적혀 있다.
- `.planning/phases/18-gh-trade-ui-nxt-vi/18-orderbook-tab-mockup.html` — 종목상세 호가 탭 6차: 카드 본문 문법 + 거래소 세그먼트 + 주문유형(시간외종가) 콤보 + 정정/취소 선택 상태 + 확인 다이얼로그.

### gh-trade 정본 (기능 규칙)
- `/Users/alex/repos/gh-trade/docs/features/rate-cross-alert.md` — 76/78 의미, 클라 몫(하루 1회 알림·임계−2%p 이탈 삭제·새 돌파 상단/재돌파 자리 유지), WinForms 강조 타이밍.
- `/Users/alex/repos/gh-trade/docs/features/queued-order.md` §46~60 — 예약구간 조각 수(`piece_count`, 0/부재=1, 상한 `max_pieces`), 77 은 표시 전용, 벽시계 판정 금지.
- `/Users/alex/repos/gh-trade/docs/features/preopen-offhours-order.md` §44~52 — 장전 G1 라벨 「예약매수/예약매도」·안내 문구, 시간외종가 G2/G3 는 종합주문창 주문유형 콤보만·`krx_session`·가격 잠금·참고 종가, 상따창 수동주문 탭에는 시간외종가 없음.
- `/Users/alex/repos/gh-trade/docs/strategy/vi-trigger.md` — 거래소별 VI 슬롯, 설정 3값(on/off·상승률·금액), 확인 체크·119초 규칙, 그리드 7열, 「가동중」 표시.
- `/Users/alex/repos/gh-trade/client/Docs/종합주문.png` · `여울_상따_스샷.png` · `상따_VI.png` — WinForms 참고 화면.

### 계약 (shared/relay)
- `packages/shared/src/relay.ts` — `RelayRateCrossItem`/`RelayRateCrossMsg`/`RelayRateCrossSnapMsg`(:901~943), `RelayQueuedWindowMsg`(:952~966), `RelayViTrigger`/`RelayViSetMsg`/`RelayViTriggerMsg`(:308~427, :850), `RelayOrderNewMsg`/`RelayOrderCancelMsg`(:482~510, `pieceCount`·`krxSession`·정정 추가 지점), `ORDER_TYPE` 주석(:1031, 정정 "M" 은 v1 범위 밖 → 해제).
- `relay/src/generated/StockDMA.fbs` :157~184 — `DirectOrderReq` 의 `order_type "M"`·`org_order_no`·`piece_count`·`krx_session` 원문.
- `relay/src/dma/envelope.ts` — `buildDirectOrderReq`(D-21 정정 차단·D-12 piece_count/krx_session 미송신 지점), 통보 `notice_type "M"`.

### 이전 phase 결정
- `.planning/phases/17-gh-trade-led/17-CONTEXT.md` — D-03(76/77/78 relay 규율·Ready 게이트), D-06/D-18(VI 거래소 축·`VI_EDIT_EXCHANGE`), D-11/D-12(77 3상태·piece_count 미송신 이연), D-21/D-22(LED 목업 채택·목업 게이트 패턴), `<deferred>` 의 Phase 18 인계 항목.
- `.planning/phases/16-trading-limit-chaser-vi-my-page/16-CONTEXT.md` — D-06/D-07(「수정」 버튼·시작/중지 확인), D-11(서버값 우선), D-16~D-19(사이드바 구조·가시성 게이트), 상따 37필드 정의.
- `webapp/src/styles/globals.css` §2.2b(~:144) — 본문 폭 4밴드 정본·실측 근거·포털 규율·`--lw` 76px 하한. **이번 phase 는 이 표를 카드 컨테이너에도 적용한다 — 표를 복사하지 말고 컨테이너 이름만 추가할 것.**

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `webapp/src/lib/use-relay-socket.ts` · `relay-provider.tsx` — `rateCrossItems`(76 upsert·78 전량 교체·정렬·상한 200) · `queuedWindow`(77 최신 1건, `undefined`=모름) · `viTriggers{KRX?,NXT?}` · `viOrders` · `accountStates` · `orders` 리듀서가 이미 있다. 소비 화면만 0개. `sendOrder({kind,isin,exchange,accountNo,qty,price,side?,orgOrderNo?})` → `buildOrderFrame` → `sendOrderFrame`(rid 상관, accepted/rejected/timeout 3분기) 경로에 정정 kind 와 `pieceCount`/`krxSession` 를 얹는다.
- `webapp/src/components/trading/limit-chaser-form.tsx`(1,526줄, 4그룹·스위치·더티 판정·`DirtyActionBar`) · `limit-chaser-client.tsx`(1,641줄, `DmaGate`·상태줄·`lc-quote-grid` 10칸·호가/체결/잔고/로그 조립) · `webapp/src/lib/limit-chaser.ts`(직렬화·키 헬퍼) — 카드 본문의 재료. 카드 하나 = 이 둘의 「한 전략」 슬라이스.
- `webapp/src/components/trading/vi-settings-card.tsx`(계좌·금액·상승률·마감알림·시작/중지 확인) · `vi-order-list.tsx`(상태 6종+부분체결·`confirm_locked`·110/119초 진행바·확인 체크) — VI 설정 2줄과 VI 발동 표의 재료.
- `webapp/src/components/orderbook/orderbook-ladder.tsx` · `trade-tape.tsx` · `order-panel.tsx`(매매구분 탭·가격±·수량·비율 — 이번에 다이어트) · `order-confirm-dialog.tsx` · `account-panel.tsx`.
- `latch-led.tsx`(`latchLedStateOf` 규칙표) · `strategy-badge.tsx`(배지 6종+거래소 태그) · `dirty-action-bar.tsx` · `dma-gate.tsx` · `strategy-log.tsx` · `surface-placeholder.tsx`.
- `webapp/src/components/layout/app-sidebar.tsx` — `NavLeaf`·`GroupHeading`·`useTradingVisible`·`limitChaserHref`·`viBadgeOf`·`viAnyRunning`(단일 정의, 재구현 금지).
- 종목상세 `webapp/src/app/stocks/[code]/page.tsx`(+`news/`·`discussions/`) — 팝업 탭 내용 재사용 원천.
- 종목검색(상따 종목검색, quick 60 첫 항목 자동 활성화) — 종목 추가란.

### Established Patterns
- 프레임 → 리듀서 → `useRelay()` 컨텍스트, 에코가 baseline 을 덮고 더티를 지운다(`formFromServer`/`dirtyFieldsOf`).
- 컨테이너 쿼리 4밴드는 현재 상따 본문 하나뿐; 앱 셸·사이드바·계좌 패널은 뷰포트 브레이크포인트. 이번에 카드 컨테이너(`card`)와 호가 탭 본문에 같은 표를 건다.
- 더티 액션 바는 `react-dom` 포털로 `document.body`(containment 회피).
- 테스트: 컴포넌트 `__tests__/*.test.tsx`(vitest+RTL), lib `webapp/src/lib/__tests__/`, e2e `webapp/e2e/specs/*.spec.ts`(Playwright, 실폭 프레임으로 잘림 단언). relay `relay/src/dma/__tests__/envelope.test.ts`·`codec.test.ts`(76/77/78 커버), `ws-latch.test.ts` 패턴으로 정정 프레임 왕복 테스트.
- 낡은 `packages/shared/dist` 함정 — 계약 변경 후 `pnpm --filter @gh-radar/shared build` 를 먼저(Phase 16 교훈, config `build_command` 반영됨).

### Integration Points
- 라우트: `webapp/src/app/trading/page.tsx` 신설, `limit-chaser/*`·`vi/page.tsx` → redirect. `app-sidebar.tsx` 트레이딩 그룹 재구성. `me-client.tsx`/`strategy-status-card.tsx` 링크 대상.
- 계약: `packages/shared/src/relay.ts`(`RelayOrderNewMsg` 확장 + 정정 메시지) → `relay/src/dma/envelope.ts`(`buildDirectOrderReq` "M"·`piece_count`·`krx_session`) → `relay/src/ws/*`(인바운드 검증·`dma_orders` 기록) → `webapp/src/lib/relay-provider.tsx`(번역기).
- 시세 구독: 돌파 목록 종목(카드 없음)도 현재가가 필요 — relay 구독 허브(`subscription-hub.ts`)의 구독 프레임/상한 확인이 리서치 대상.
- 종목상세 호가 탭: `stocks/[code]/page.tsx` 의 호가주문 탭 본문을 카드 본문 컴포넌트로 교체.

</code_context>

<specifics>
## Specific Ideas

- 사용자의 원 컨셉(원문 요지): "상따창 상단에 돌파감지 목록이 실시간으로 뜨고, 클릭하면 바로 거래종목으로 추가. 여러 종목을 동시에 세팅, 세팅한 종목은 열고 닫을 수 있고 열면 옵션세팅이 나온다. 여러 메뉴 왔다갔다 안 하고 그 페이지에서 거래를 최대한 해결. 넓은 화면에서는 2단·3단." → D-03~D-13.
- "4종목 중 1종목만 펼쳐졌다면 그 카드만 세로로 길고 나머지 3종목은 그리드 한 칸에 다 들어온다" → D-09 스택.
- "VI 와 상따를 하나로. 상따 위에 돌파감지처럼 VI 발동 종목, 펼치면 목록·확인 체크. 더 상단에 VI 세팅 KRX/NXT 한 줄씩 — on/off·상승률·금액만" → D-05·D-06.
- "매수/매도가 탭이면 수동도 탭, 펼쳐져 있으면 수동주문 버튼으로 덮기. 비율·±·안내 라벨·계좌 없애고 정정/취소 넣기. 수동주문 페이지에 가격/수량/매수/매도 한번에(gh-trade 참고)" → D-19~D-21.
- "쓸데없는 라벨링(접힌 종목·호가·옵션세팅) 없애라, 공간만 차지" → D-12.
- "종목카드에 종목정보 버튼 → 기존 종목정보 페이지 내용 팝업(차트·종목정보·뉴스토론)" → D-25.
- WinForms 참고: 상따창 수동주문 탭(`여울_상따_스샷.png`), 종합주문창(`종합주문.png`), VI 창 「자동매매시작」 빨간 텍스트.

</specifics>

<deferred>
## Deferred Ideas

- **등록된 상따 전략의 거래소 변경**(삭제 → 같은 옵션으로 새 거래소 재등록을 확인 다이얼로그로 묶기) — 이번엔 등록 전 카드에서만 토글(D-10).
- **돌파/VI 알림의 기기 간 공유**(Supabase 사용자 테이블) — localStorage 로 시작(D-15).
- **이탈 종목 잠시 회색 유지** 같은 목록 히스토리 — 즉시 삭제로 시작(D-16).
- **My page 재설계** — 이번엔 링크 대상만 갱신(D-02).
- gh-trade 쪽: 매도 가격 래치 표시(Phase 17 deferred 승계), 정정 통보 문구 정합.

</deferred>

---

*Phase: 18-gh-trade-ui-nxt-vi*
*Context gathered: 2026-09-21*
