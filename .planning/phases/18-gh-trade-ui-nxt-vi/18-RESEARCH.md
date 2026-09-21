# Phase 18: gh-trade 신규 기능 UI — 통합 트레이딩 작업대 · 예약/시간외종가 발주 · NXT VI - Research

**Researched:** 2026-09-21
**Domain:** Next.js 15 App Router 프론트엔드 재구성(다종목 카드 격자 · 컨테이너 쿼리 2단) + relay/shared 주문 계약 확장(정정 `"M"` · `piece_count` · `krx_session`) + relay 시세 구독 재사용
**Confidence:** HIGH (코드 실측 기반) / 일부 MEDIUM·LOW 는 각 절에 표시

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**범위·라우트**
- **D-01:** Phase 18 = **`/trading` 단일 트레이딩 작업대**(상따 다종목 카드 + VI 설정/발동 + 돌파감지 통합) + 종목상세 호가 탭 통일 + 종목정보 팝업. ROADMAP·REQUIREMENTS 의 TRADE-06/07/08 정의를 이에 맞춰 확장하고 통합 작업대 요구사항(TRADE-09)을 신설한다. — **Reversibility:** costly — 상따 화면 1,641+1,526 줄과 VI 화면 663+951 줄이 한 페이지로 재구성되며, 사이드바·라우트·e2e 스펙(`trading-limit-chaser.spec.ts`·`trading-vi.spec.ts`·`sidebar-tree.spec.ts`)이 함께 바뀐다.
- **D-02:** 기존 화면 3개(`/trading/limit-chaser/new` · `/trading/limit-chaser/[key]` · `/trading/vi`)는 **제거**하고 `/trading` 으로 리다이렉트만 남긴다. `[key]` 는 `/trading?focus={key}` 로 보내 해당 카드를 펼친 상태로 연다. My page 의 전략 현황 카드·계좌 패널은 그대로 두되 링크 대상을 `/trading(?focus=)` 로 바꾼다.
- **D-03:** 사이드바 「트레이딩」 그룹 제목 자체가 `/trading` 링크(활성 표시). 3단 목록은 「KRX VI(가동중 배지)」「NXT VI」 + 등록된 상따 전략(종목명 · LED 3점 요약, 카드와 동기). 개별 「상따」「VI」 메뉴는 없앤다. 그룹 항상 펼침·트레이딩 가시성 게이트(`useTradingVisible`)는 Phase 16 D-16/D-19 그대로.

**페이지 구조 (위 → 아래) — 정본은 목업 `18-workbench-mockup.html`**
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

**돌파감지 목록 행동 규칙 (정본: gh-trade `rate-cross-alert.md`)**
- **D-14:** 서버 집합을 재해석하지 않는다 — 78 은 전량 교체(빈 배열도 권위값), 76 은 upsert, 정렬은 서버(새 돌파 맨 위 · 재돌파 자리 유지), 상한 200 은 Phase 17 리듀서 그대로. 자동 열기(카드 자동 추가) 금지.
- **D-15:** 「오늘 알림 울린 종목」과 「사용자가 지운 종목」은 **localStorage, KST 날짜 키**에 기억한다(날짜 경계에서 자동 리셋, 서버 왕복 없음, 기기별).
- **D-16:** **임계−2%p(18%) 이탈 시 즉시 삭제.** 서버가 알려주지 않으므로 웹이 목록 종목의 현재가를 알아야 한다 → **돌파 목록 종목의 시세 구독**이 필요하다(카드가 없는 종목도). 구독 경로·상한(relay/DMA 세션 구독 한도)은 리서치 항목. 재돌파는 서버 76 으로 재진입.
- **D-17:** 알림음 = 상태줄 스피커 토글(localStorage), **기본 꺼짐**, 종목당 하루 1회(D-15 집합). 브라우저 자동재생 차단 상태면 아이콘에 「클릭해 활성화」 표시. 소리 종류는 Claude 재량(파일 없이 Web Audio 합성 단음 권장).
- **D-18:** 새 돌파 강조 = 깜박임 없이 **30초 연노랑 + 「신규」 배지** 후 기본. 행에 ✕ 수동 삭제, 지우면 그날 재돌파에도 안 나옴(D-15).

**수동주문 · 예약/장전/시간외종가 발주(77)**
- **D-19:** **수동주문 배치는 적응형 한 규칙**(카드·호가 탭 공통): 컨테이너 <700(매수/매도가 탭인 밴드) → 「매수 | 매도 | 수동」 3탭 · ≥700(옵션 2열) → 옵션 우상단 「수동주문」 버튼 → 옵션 영역을 폼이 덮고 ✕ 로 닫음(옵션 값 보존).
- **D-20:** **수동주문 폼** = 가격 · 수량 · (예약구간 ∧ KRX) 조각 수 · 주문금액 · **「매수 · 매도 · 정정 · 취소」 4버튼 한 줄**. 계좌 행 · 가격 ±버튼 · 비율(10/25/50/100%) 버튼 · 「호가 사다리를 누르면…」 안내는 **없다.** 호가 사다리 클릭은 가격을 채운다. 제출 전 확인 다이얼로그는 기존 `order-confirm-dialog` 재사용(D-20 한도 고지 포함).
- **D-21:** **정정·취소는 미체결 행 선택 시 활성.** 하단 공용 미체결(작업대) / 미체결 목록(호가 탭)의 행 클릭 → 폼 위 「원주문 {No} · 매수 가격 × 수량 ✕」 칩, 가격·수량이 원주문 값으로 채워짐. 정정 = 값 바꾼 뒤 「정정」, 취소 = 「취소」(확인: 「미체결 주문을 취소할까요? 잔량 전부」). 선택 없으면 두 버튼 disabled. **정정(`order_type "M"`)은 relay 가 Phase 15 D-21 로 막아 둔 것을 이 phase 에서 연다** — shared `RelayOrderNewMsg` 계열에 정정 프레임(원주문번호·거래소 승계), relay `buildDirectOrderReq` 의 "M" 허용, `dma_orders` origin/kind 기록. 시간외종가 원주문은 정정 불가(취소 후 재등록)라 콤보가 시간외종가면 정정 비활성. — **Reversibility:** costly — shared 계약·relay 와이어 빌더·서버 통보 파서(`notice_type "M"`)·smoke 프로브가 함께 바뀐다.
- **D-22:** **77 힌트는 라벨·입력 전환에만 쓴다.** `queuedWindow === undefined` 는 「모름」이며 전부 false 로 읽는다. 벽시계로 창을 판정하지 않고, 이 값으로 주문을 막지 않는다(판정은 서버). 매핑: `open`(예약구간) ∧ KRX → 버튼 「예약매수/예약매도」 + 조각 수 스테퍼(기본 5, 상한 `maxPieces`) · `preopenOpen`(KRX 장전) 또는 `nxtPreopenOpen`(NXT) → 「예약매수/예약매도」, 조각 입력 숨김(조각 1), 확인 다이얼로그에 「예약: 증권사 보관 후 09:00 처리」(NXT 08:00) · 그 외 → 「매수/매도」. 주문 프레임에 `pieceCount`(예약구간 밖에서는 보내지 않음/0)·`krxSession`("" 기본) 필드를 **shared 타입 · webapp 번역기 · relay 빌더 3곳**에 추가한다(Phase 17 D-12 의 「미송신」 해제).
- **D-23:** **시간외종가(G2/G3)는 종목상세 호가 탭의 수동주문 폼에만** 있다 — 주문유형 콤보 「지정가 | 시간외종가」, KRX ∧ (`g2Open` ∨ `g3Open`) 일 때만 선택 가능(창이 닫히면 지정가로 복귀), 선택 시 가격 잠금 + 「참고 종가」 표시 + `price 0`·`krxSession "G2"/"G3"` 송신, 버튼은 창과 무관하게 「매수/매도」(조각 1). **작업대 카드의 수동주문에는 주문유형이 없다**(WinForms 상따창과 동일).
- **D-24:** **종목상세 호가 탭 = 카드 본문과 같은 문법.** 상태줄(DMA · 계좌 · **거래소 KRX|NXT 세그먼트** · LED 3칩 · 구간 배지) → 종목정보 10칸 → 좌 호가(+체결) | 우 옵션 4그룹 + 적응형 수동주문(D-19~D-23) → 미체결/잔고. 반응형은 §2.2b 4밴드를 **호가 탭 본문 폭** 기준으로(카드와 같은 컴포넌트·같은 컨테이너 이름). 매수 비율 버튼 없음은 기존대로. 정본은 목업 `18-orderbook-tab-mockup.html`.
- **D-25:** **종목정보 팝업** — 카드 헤더 ⓘ → 모달(폰 전체화면 시트 · 700 이상 최대 960px 중앙), 탭 「차트 | 종목정보 | 뉴스·토론」. 내용은 기존 종목상세 4탭에서 호가주문을 뺀 것을 그대로 재사용(새 데이터 경로 없음). 닫기 ✕ · 배경 클릭 · ESC.

**공통 규율**
- **D-26:** **목업 게이트는 통과했다.** 정본 목업 2개 — `18-workbench-mockup.html`(7차) · `18-orderbook-tab-mockup.html`(6차). UI-SPEC 은 이 두 파일을 기준으로 쓰고, 실행 중 레이아웃을 다시 묻지 않는다(Phase 17 D-22 패턴). 목업이 코드와 다르면 목업이 이긴다.
- **D-27:** 서버 진실을 클라가 재계산·재해석하지 않는다(Phase 16 D-11·Phase 17 D-04 계열): 에코가 항상 이기고(더티도 덮음 + 「다른 단말에서 변경됨」 status), queued/pending 문구는 표시만, `OrderResp.message` 파싱 금지, 77 벽시계 판정 금지, 76/78 집합 가공 금지(D-14). 토스트 라이브러리 없음 — 인라인 `role="status"`.
- **D-28:** 반응형은 **컨테이너 쿼리 두 단위** — 페이지 본문(`page`, 상태줄·스트립·격자 열 수)과 카드(`card`, 본문 배치). 뷰포트 분기 신설 금지. `container-type` 의 layout containment 때문에 **더티 액션 바는 `document.body` 포털**로 띄운다(§2.2b 주석) — 카드가 여럿이므로 바 문구에 종목명을 쓴다.
- **D-29:** 자동 게이트는 config `build_command`/`test_command` 그대로 + Playwright. 카드 폭 4밴드 × 격자 1/2/3단 × 폰/와이드 잘림 0 을 실브라우저로 단언한다(Phase 17 `trading-limit-chaser.spec.ts` 케이스 9·11·12·13 패턴).

### Claude's Discretion
- 알림음 파형·길이(파일 없이 Web Audio 합성), 자동재생 차단 감지 방식.
- VI 「마감알림」 로컬 설정의 거취(상태줄 토글로 옮기거나 제거) — 서버와 무관한 값.
- `/trading?focus=` 파라미터 이름·인코딩(`limitChaserHref` 헬퍼 재사용).
- 돌파 목록 종목 시세 구독 경로(리서치 결과에 따름: relay 구독 프레임 재사용 vs 스냅샷 가격 폴백)와 구독 상한 초과 시 우선순위(카드 있는 종목 > 신규 돌파 > 오래된 돌파).
- 정정 프레임 이름(`order.modify` 등)과 `dma_orders` 기록 형태.
- 스택/카드 전환 애니메이션 없음, 30초 강조 타이머 구현.
- 폰 밴드 카드 헤더의 종목명/코드 2줄 접기 등 세부 타이포.

### Deferred Ideas (OUT OF SCOPE)
- **등록된 상따 전략의 거래소 변경**(삭제 → 같은 옵션으로 새 거래소 재등록을 확인 다이얼로그로 묶기) — 이번엔 등록 전 카드에서만 토글(D-10).
- **돌파/VI 알림의 기기 간 공유**(Supabase 사용자 테이블) — localStorage 로 시작(D-15).
- **이탈 종목 잠시 회색 유지** 같은 목록 히스토리 — 즉시 삭제로 시작(D-16).
- **My page 재설계** — 이번엔 링크 대상만 갱신(D-02).
- gh-trade 쪽: 매도 가격 래치 표시(Phase 17 deferred 승계), 정정 통보 문구 정합.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRADE-06 | 돌파감지 목록 — 스트립/표 · 임계−2%p 이탈 삭제(시세 구독) · 하루 1회 알림음 · localStorage KST 날짜 키 · 30초 강조 · 클릭 → 카드 추가 | §「돌파감지 목록」 전 절. 구독은 기존 `useRelaySubscription`/`subscribe()` 재사용(§Pattern 1) · 이탈 판정 공식과 「무장 또는 3초 유예」 규칙은 gh-trade 정본 인용 · 종목명/코드 결여가 **미해결 계약 공백**(§Open Question O-1) |
| TRADE-07 | 예약/장전/시간외종가 발주 + 수동주문(신규·정정·취소) | §「주문 계약 확장」 전 절. 정정 `"M"` 의 실제 변경 지점 **7곳**(3곳 아님, §표 C-1) · `price 0` 이 4중 가드에 막힘(§Pitfall 2) · `dma_orders` CHECK 마이그레이션 필수(§Pitfall 1) |
| TRADE-08 | NXT VI 설정 2줄 + VI 발동 스트립 | §「재사용 자산 실측」의 `vi-settings-card.tsx`·`vi-order-list.tsx` 슬라이스 · `VI_EDIT_EXCHANGE` 폐기 지점 `vi-settings-card.tsx:96` |
| TRADE-09 | 통합 트레이딩 작업대 `/trading` | §「컨테이너 쿼리 이관」(컨테이너 이름 `lc` 를 **옮기는** 무복사 해법) · §「라우팅·리다이렉트」 · §「재사용 자산 실측」 |
</phase_requirements>

---

## Summary

이 phase 의 기술적 무게중심은 **UI 재배치가 아니라 두 개의 숨은 계약 공백**이다.

**① 정정(`order_type "M"`)은 CONTEXT 가 말한 「3곳」이 아니라 최소 7곳을 건드린다.** 특히 `dma_orders.order_type` 에 `CHECK (order_type IN ('N','C'))` 가 걸려 있어 [VERIFIED: supabase/migrations/20260905120200_dma_orders.sql:57 — `order_type   text NOT NULL CHECK (order_type IN ('N','C')),    -- N=신규 C=취소 (정정 M 은 v1 범위 밖, D-21)`], 마이그레이션 없이 정정을 보내면 relay 가 **게이트웨이 송신 전에** insert 실패로 자체 거부한다(감사 기록 없는 주문을 만들지 않는 규율, `relay/src/ws/order-handler.ts:853-866`). 같은 이유로 D-23 의 시간외종가 `price 0` 은 **네 겹의 `price > 0` 가드**에 막힌다 — webapp 번역기·relay zod·조립기·DB CHECK 가 전부 양수를 요구한다. 이 둘이 이 phase 에서 가장 비용이 큰 발견이고, 계획이 이것을 모르면 실행 중반에 「주문 기록에 실패했습니다」로 멈춘다.

**② 돌파 목록의 종목명·단축코드가 계약에 없다.** `RelayRateCrossItem` 은 `isin`·`exchange`·가격·등락률만 싣고 [VERIFIED: packages/shared/src/relay.ts:907-921], `useIsinLabels` 의 세 원천(계좌 상태 hold/unf · VI 주문 · 상따 전략)에 돌파 항목이 없다 [VERIFIED: webapp/src/lib/isin-labels.ts:64-74]. 그래서 목업이 그리는 「종목명 + 코드」 칩과, 클릭 시 만들어지는 카드의 ⓘ 팝업(종목상세 내용은 **단축코드 키**로 조회)이 지금 계약으로는 그려지지 않는다. relay 에 이미 `SymbolMap` 역매핑과 `#enrichNames` 선례가 있어 비용은 작지만(§O-1), **D-11 의 「새 계약은 셋뿐」을 넷으로 늘리는 결정**이라 사용자 확인이 필요하다.

반대로 **좋은 소식이 둘** 있다. 첫째, 컨테이너 쿼리 이관은 표를 복사할 필요가 **전혀 없다** — 기존 컨테이너 이름 `lc` 를 페이지 본문에서 **카드 래퍼로 옮기기만** 하면 `@min-[700px]/lc:` 계열 38개 유틸리티가 한 글자도 안 바뀐 채 카드 폭을 재기 시작한다(CSS 컨테이너는 **가장 가까운** 동명 조상을 찾는다). 둘째, 돌파 목록 시세 구독은 새 프레임이 필요 없다 — `useRelayContext().subscribe(isin, exchange)` 가 전략 등록과 무관한 참조계수 API 로 이미 공개돼 있고 [VERIFIED: webapp/src/lib/relay-provider.tsx:305-320], relay `SubscriptionHub#subscribe` 도 사용자·ISIN·거래소 키로 참조계수만 센다 [VERIFIED: relay/src/hub/subscription-hub.ts:416-429].

**Primary recommendation:** 계획 Wave 0 에서 **① Supabase 마이그레이션(`order_type` CHECK 확장 + `price >= 0` 완화 + `krx_session`/`piece_count` 감사 컬럼) → ② shared 계약 확장(`RelayOrderModifyMsg` 신설 + `pieceCount`/`krxSession` optional 추가) → ③ relay zod·조립기·dupKey → ④ webapp 번역기** 를 한 수직 슬라이스로 먼저 끝내고(각 단계 사이 `pnpm --filter @gh-radar/shared build` 필수), 그 다음에 UI 를 조립한다. 컨테이너 이름은 `lc` 를 **유지한 채 선언 위치만 카드로** 옮기고, 페이지 축에는 새 이름 `wb` 를 쓴다.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 돌파 집합(76/78) 보관·정렬 | gh-trade 서버 | relay 캐시 | D-14 「서버 집합을 재해석하지 않는다」. relay 는 `#rateCrossItems` 에 그대로 보관만 한다 (`subscription-hub.ts:847-878`) |
| 임계−2%p 이탈 삭제 · 하루 1회 알림 | 브라우저 (webapp) | — | gh-trade 정본이 명시적으로 **클라 몫**으로 규정 (`rate-cross-alert.md` ①) |
| 돌파 목록 종목 현재가 | relay 구독 허브 → 브라우저 | — | `SubscribeQuoteReq(29)` 참조계수. 브라우저는 `subscribe()` 만 호출 |
| 종목명·단축코드 해석 | relay (`SymbolMap`) | — | D-28 「산술 유도 금지」. 브라우저는 ISIN→코드를 만들지 않는다 (`relay/src/store/symbols.ts:120-196`) |
| 주문 시장구분(`market`) | relay | — | 브라우저는 싣지 않는다 (`relay.ts:474-476` 주석) |
| 주문 유효성(수량·가격·원주문번호) | relay zod + 조립기 | webapp 번역기(선제) | 조립기가 「모든 호출 경로의 마지막 관문」 (`order-handler.ts:806`) |
| 예약/시간외종가 창 판정 | gh-trade 서버 (77 푸시) | — | D-22 「벽시계 판정 금지」 |
| 조각 발사·정정 거부 판정 | gh-trade 서버 | — | 예약(Q-ID)·시간외종가 원주문의 정정은 서버가 `R` 로 거부 |
| 카드 폭 반응형 판정 | CSS (컨테이너 쿼리) | — | JS 는 폭을 재지 않는다 (`orderbook-ladder.tsx:73` 규율) |
| 「오늘 울린/지운 종목」 | 브라우저 localStorage | — | D-15. 기기별, 서버 왕복 없음 |
| 더티 액션 바 위치 | `document.body` 포털 | — | containment 회피 (globals.css §2.2b ★ 주석) |

---

## Standard Stack

이 phase 는 **새 런타임 의존성을 도입하지 않는다.** 필요한 모든 기능이 기존 스택 또는 브라우저 네이티브 API 로 충족된다.

### Core (기존 · 버전은 `webapp/package.json` 실측)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | ^15.0.0 | App Router · `redirect()` · `useSearchParams` | [VERIFIED: webapp/package.json:26] 기존 라우트 전부가 이 위에 있다 |
| react / react-dom | ^19.0.0 | `createPortal`(더티 바) · `use(params)` | [VERIFIED: webapp/package.json:28-29] |
| tailwindcss (@tailwindcss/postcss) | ^4.0.0 | `@container/{name}` · `@min-[Npx]/{name}:` 변형 | [VERIFIED: webapp/package.json:41] v4 의 named container 유틸리티가 §2.2b 4밴드의 구현체다 |
| radix-ui | ^1.4.3 | Dialog(종목정보 팝업 · 주문확인) · Tabs | [VERIFIED: webapp/package.json:27] `order-confirm-dialog.tsx:45` 가 이미 `@/components/ui/dialog` 사용 |
| zod | ^4.0.0 (relay) | 인바운드 프레임 검증 | [VERIFIED: relay/package.json:30] `RelayInboundSchema` 정본 |
| flatbuffers | ^25.9.23 (relay) | `DirectOrderReq` 조립 | [VERIFIED: relay/package.json:27] |

### 알림음 — 새 라이브러리 없음 (D-17 Claude 재량)
| 기술 | Purpose | Why |
|------|---------|-----|
| Web Audio API (`AudioContext` + `OscillatorNode` + `GainNode`) | 단음 합성 | 브라우저 네이티브. 파일 자산 0, 번들 증가 0. 현재 코드베이스에 `AudioContext` 사용처가 **0건**이므로 [VERIFIED: `grep -rn "AudioContext\|new Audio(" webapp/src` → 결과 없음] 새 유틸 모듈 1개를 만든다 |
| `AudioContext.state === 'suspended'` | 자동재생 차단 감지 | 표준 속성. 사용자 제스처 전에는 `suspended` 이고 `resume()` 은 제스처 안에서만 성공한다 [ASSUMED — 브라우저 autoplay 정책, 이번 세션에서 실측하지 않음] |

**권장 합성 파라미터(재량):** sine 880Hz, 총 160ms, gain 0→0.18(ramp 10ms)→0(exponential ramp). 짧은 attack/release 로 클릭 노이즈를 피한다. 기존 `vi-alert.ts` 의 SSR 가드 패턴(`typeof window === "undefined"` 조기 반환)을 그대로 따른다 [VERIFIED: webapp/src/lib/vi-alert.ts:137-146].

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Web Audio 합성 | `.wav`/`.mp3` 정적 자산 (gh-trade 의 `vi_new.wav` 대응) | 파일 추가 + `public/` 자산 + 네트워크 1회. 단음 하나에 과하다. D-17 이 이미 합성을 권장 |
| 컨테이너 이름 `card` 신설 | 기존 이름 `lc` 를 카드로 **이동** | 이름을 신설하면 `@min-[Npx]/lc:` 38개를 전부 `/card` 로 고쳐야 하고, 그 순간 §2.2b 표의 소비처가 둘이 된다 — **이동을 택한다** (§Pattern 2) |
| `order.modify` 신규 프레임 | 기존 `order.new` 에 `orderType` 필드 추가 | discriminated union 의 `t` 로 분기하는 규율(`protocol.ts:299`)과 dupKey 분기(`order-handler.ts:248-256`)가 프레임 종류를 식별자로 쓴다. 필드로 섞으면 중복 가드가 신규/정정을 구분하지 못한다 — **신규 프레임을 택한다** |
| 돌파 시세: relay 신규 「가벼운 구독」 프레임 | 기존 `sub`/`unsub` 재사용 | 신규 프레임은 relay·shared·hub 3층을 또 건드린다. `SubscribeQuoteReq(29)` 는 체결 테이프가 편승할 뿐 별도 비용이 없다 (`subscription-hub.ts:11-12` D-33) — **재사용** |

**Installation:** 없음. 새 패키지를 설치하지 않는다.

---

## Package Legitimacy Audit

**이 phase 는 외부 패키지를 설치하지 않는다.** Web Audio · CSS 컨테이너 쿼리 · `createPortal` 은 전부 브라우저/기존 의존성 네이티브다.

| Package | Registry | Verdict | Disposition |
|---------|----------|---------|-------------|
| (없음) | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Runtime State Inventory

> 이 phase 는 rename/refactor 가 아니라 **화면 재구성 + 계약 확장**이지만, 라우트 제거(D-02)와 DB CHECK 변경이 런타임 상태를 건드리므로 실측한다.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `dma_orders.order_type` CHECK 가 `('N','C')` 만 허용 [VERIFIED: supabase/migrations/20260905120200_dma_orders.sql:57]. `dma_orders.price` CHECK `(price > 0)` [VERIFIED: 같은 파일:60]. 기존 행에는 `M` 도 `price 0` 도 없다 | **데이터 마이그레이션 아님 — 제약 변경(ALTER)**. 새 마이그레이션 파일 1개 |
| **Live service config** | 없음 — relay 는 GCE VM `radar-gw` 에 컨테이너로 돌고 설정은 저장소 `infra/relay/` 정본. 이 phase 는 relay 코드만 바꾼다(배포 필요) | relay 재배포 (`scripts/deploy-relay.sh`) |
| **OS-registered state** | 없음 — 이 phase 는 워커·타이머·systemd 유닛을 만들지 않는다 | 없음 |
| **Secrets/env vars** | 없음 — 새 비밀·새 env 키가 없다. `SMOKE_AUTH_TOKEN` 은 기존 프로브용이고 이 phase 가 바꾸지 않는다 | 없음 |
| **Build artifacts** | `packages/shared/dist` — **계약 변경 후 반드시 먼저 빌드**. 낡은 dist 가 남으면 relay·webapp typecheck 가 **통과해 버린다** [VERIFIED: 18-CONTEXT.md:116 Established Patterns / config `build_command` 가 `pnpm --filter @gh-radar/shared build &&` 로 시작하는 것이 그 대응] | `build_command` 순서 준수 |
| **브라우저 localStorage** | 기존 키 `gh-radar:vi-alert` 1개 [VERIFIED: webapp/src/lib/vi-alert.ts:29]. 새로 3개 추가 예정(알림음 토글 · 울린 종목 집합 · 지운 종목 집합 · 격자 단 수) | 새 키만 추가. 기존 키 이름 변경 없음 |

---

## Architecture Patterns

### System Architecture Diagram

```
                     ┌──────────────────────── gh-trade 서버 (KB DMA 게이트웨이) ────────────────────────┐
                     │  MarketPublisher: KRX A3 → 임계 비교 → 76 Broadcast / 78 로그인 스냅샷          │
                     │  QueuedWindowState 77 푸시 · VI 72/73 · 상따 60/61 · OrderResp 51               │
                     └───────────────────────────────┬───────────────────────────────────────────────┘
                                                     │ FlatBuffers Envelope (TCP, VPN)
                                                     ▼
   ┌──────────────────────────────── relay (GCE radar-gw · Node 22) ────────────────────────────────┐
   │  dma/envelope.ts   parse*(76/77/78/51/60/61/72/73)  ·  buildDirectOrderReq  ← ★ "M"·piece·krx  │
   │  hub/subscription-hub.ts   #refs(참조계수) · #quotes · #rateCrossItems · #limitChasers         │
   │  store/symbols.ts  SymbolMap: ISIN → {code,name,market}   ← ★ 돌파 항목 name/code 원천(O-1)    │
   │  ws/protocol.ts    zod RelayInboundSchema  ← ★ order.modify 추가 · price>0 완화                │
   │  ws/order-handler.ts  중복가드 → 계좌대조 → ISIN해석 → dma_orders insert → 조립 → 5초 상관     │
   │  store/orders.ts   insertRequest → Supabase dma_orders  ← ★ CHECK 확장 필요                    │
   └───────────────────────┬────────────────────────────────────────┬───────────────────────────────┘
                           │ wss JSON 프레임                        │ service role
                           ▼                                        ▼
   ┌─── webapp (Next 15 App Router · Vercel) ───┐            ┌─ Supabase dma_orders ─┐
   │ RelayProvider (AuthProvider 안쪽)          │            │ CHECK order_type N|C  │
   │  ├ useRelayConnection  소켓·참조계수·rid    │            │ CHECK price > 0       │
   │  │   subscribe/unsubscribe  ← 돌파 목록도  │            └───────────────────────┘
   │  │   sendOrder(프레임)                      │
   │  └ buildOrderFrame  요청→프레임 번역 ← ★    │
   │                                             │
   │ /trading  (신설)                            │
   │  ├ 상태줄(@container wb)  1·2·3단 세그먼트  │
   │  ├ VI 설정 2줄 · VI 발동 스트립/표          │
   │  ├ 돌파 스트립/표 ──► useBreakoutQuotes ────┼──► subscribe(isin,"KRX") (카드 없는 종목)
   │  ├ 종목 추가 검색  (/api/stocks/search)     │
   │  ├ 카드 격자                                 │
   │  │   └ Card(@container lc)                  │
   │  │       헤더 · 10칸 · [호가|옵션4그룹]      │
   │  │       + 적응형 수동주문(신규/정정/취소)   │
   │  │       + DirtyActionBar → portal(body)    │
   │  └ 공용 패널(미체결·잔고·로그) ──행 클릭──► 정정/취소 대상 선택
   │                                             │
   │ /stocks/[code]?tab=orderbook  ← 같은 Card 본문 + 주문유형 콤보(G2/G3)
   └─────────────────────────────────────────────┘
```

### Recommended Project Structure

```
webapp/src/
├── app/trading/
│   ├── page.tsx                      # 신설 — AppShell + <TradingWorkbench/>
│   ├── limit-chaser/page.tsx         # redirect('/trading')
│   ├── limit-chaser/new/page.tsx     # redirect('/trading')
│   ├── limit-chaser/[key]/page.tsx   # redirect(`/trading?focus=${key}`)
│   └── vi/page.tsx                   # redirect('/trading')
├── components/trading/
│   ├── workbench/
│   │   ├── trading-workbench.tsx     # 페이지 셸 + @container/wb + 카드 상태 소유
│   │   ├── workbench-status-bar.tsx  # D-04 상태줄 + 단 수 세그먼트
│   │   ├── vi-settings-rows.tsx      # D-05 (vi-settings-card 슬라이스 2줄판)
│   │   ├── vi-trigger-strip.tsx      # D-06 칩 + 더보기 → <ViOrderList/>
│   │   ├── breakout-strip.tsx        # D-07 칩 + 더보기 표
│   │   ├── stock-add-bar.tsx         # D-08 (StockSearchField 승격)
│   │   ├── card-grid.tsx             # D-09 펼침 우선 + 스택
│   │   └── shared-panels.tsx         # D-13 미체결·잔고·로그 탭
│   ├── card/
│   │   ├── strategy-card.tsx         # @container/lc 선언 지점 · 헤더 + 본문
│   │   ├── card-header.tsx           # D-10
│   │   ├── quote-grid-10.tsx         # D-11 (limit-chaser-client `lc-quote-grid` 추출)
│   │   ├── card-body.tsx             # D-12 좌 호가 | 우 옵션4그룹  ← 호가 탭도 이것을 쓴다
│   │   └── manual-order-form.tsx     # D-19~D-23 적응형 수동주문
│   ├── stock-info-modal.tsx          # D-25
│   └── (기존) limit-chaser-form.tsx  # 옵션 4그룹 — 카드 본문 안으로
├── lib/
│   ├── breakout-list.ts              # D-14~D-18 순수 규칙(이탈 판정·KST 날짜 키·집합)
│   ├── alert-tone.ts                 # D-17 Web Audio 합성 + 차단 감지
│   └── (기존) relay-provider.tsx     # buildOrderFrame 확장
packages/shared/src/relay.ts          # RelayOrderModifyMsg · pieceCount · krxSession
relay/src/ws/protocol.ts              # zod 스키마 3종
relay/src/dma/envelope.ts             # toWireOrderType · buildDirectOrderReq
relay/src/ws/order-handler.ts         # dupKey · insert · 조립 분기
supabase/migrations/2026MMDD_dma_orders_modify_offhours.sql
```

### Pattern 1: 돌파 목록 시세 구독 — 새 프레임 없이 기존 참조계수 API 재사용 (D-16)

**What:** 카드가 없는 돌파 목록 종목의 현재가를, 이미 공개된 `subscribe`/`unsubscribe` 참조계수 API 로 얻는다.

**근거 (전략 등록과 구독은 완전히 분리돼 있다):**
- 브라우저가 보내는 구독 프레임은 `{t:"sub", isin, ex}` 단 3필드다 — 전략 키도 계좌번호도 요구하지 않는다 [VERIFIED: packages/shared/src/relay.ts:396 — `export type RelaySubMsg = { t: "sub"; isin: string; ex: RelayExchange };`]
- relay 쪽 참조계수 키는 `(userId, isin, exchange)` 뿐이다 [VERIFIED: relay/src/hub/subscription-hub.ts:416-419 — `subscribe(userId: string, isin: string, exchange: RelayExchange): void { const key = subKey(userId, isin, exchange); const next = (this.#refs.get(key) ?? 0) + 1;`]
- 0→1 에서만 업스트림으로 나가고 1→0 에서만 해제된다 — 탭·카드·돌파행이 같은 종목을 봐도 와이어는 1벌 [VERIFIED: relay/src/hub/subscription-hub.ts:421-429, 432-460]
- 브라우저 훅도 동형 참조계수를 갖고 있다 [VERIFIED: webapp/src/lib/use-relay-socket.ts:965-993]
- 소비자 훅 `useRelaySubscription({isin, exchange, enabled})` 은 **자기 키의 값만** 돌려주고 언마운트에서 해제한다 [VERIFIED: webapp/src/lib/relay-provider.tsx:305-320]

**권장 구현 — 다중 키 훅 1개를 새로 만든다:**

`useRelaySubscription` 은 단일 키 훅이라 돌파 N종목에 그대로 쓸 수 없다(행마다 컴포넌트를 쪼개면 행이 사라질 때 해제가 렌더 트리에 묶인다). 집합 diff 훅을 만든다:

```typescript
// webapp/src/lib/use-breakout-quotes.ts (신규)
// Source: 기존 useRelaySubscription(relay-provider.tsx:305-320) 과 같은 계약 —
//         키가 바뀌면 이전 키를 해제한다. 다른 점은 키가 집합이라는 것뿐이다.
export function useBreakoutQuotes(
  keys: readonly { isin: string; exchange: RelayExchange }[],
): ReadonlyMap<string, RelayQuote> {
  const { subscribe, unsubscribe, quotes } = useRelayContext();
  // 키 집합을 안정 문자열로 접어 effect 재실행을 값 변화로만 유발한다.
  const sig = keys.map((k) => `${k.isin}:${k.exchange}`).sort().join('|');
  useEffect(() => {
    const entries = sig === '' ? [] : sig.split('|').map((s) => {
      const [isin, ex] = s.split(':');
      return { isin, exchange: ex as RelayExchange };
    });
    for (const e of entries) subscribe(e.isin, e.exchange);
    return () => { for (const e of entries) unsubscribe(e.isin, e.exchange); };
  }, [sig, subscribe, unsubscribe]);
  return quotes; // 소비자가 relayQuoteKey(isin,ex) 로 골라 쓴다
}
```

**구독 상한 — 관측 없음, 자율 상한을 둔다:**
relay `SubscriptionHub` 에는 구독 수 상한이 **존재하지 않는다**(`#refs` 는 Map 이고 크기 검사가 없다) [VERIFIED: relay/src/hub/subscription-hub.ts:274, 416-429 — `readonly #refs = new Map<string, number>();` 와 `subscribe` 전문에 상한 분기 없음]. 게이트웨이(gh-trade) 쪽 세션당 구독 상한은 **이번 세션에서 확인하지 못했다** — `gh-trade` 저장소의 문서·프로토콜 표를 훑었으나 상한을 명시한 기술이 없었다 [ASSUMED: 상한이 존재하는지 여부 자체가 미확인. 「상한이 없다」고 읽지 말 것].

따라서 **클라이언트 자율 상한**을 권장한다:
- 상한 상수 하나(권장 `MAX_BREAKOUT_SUBS = 40`)를 둔다. 근거는 gh-radar 실측이 아니라 「돌파 200 상한(D-14)을 전부 구독하지 않겠다」는 보수 선택이다 [ASSUMED].
- 우선순위는 D-16 재량 지시대로: **카드 있는 종목 > 신규 돌파(최근) > 오래된 돌파**. 카드 구독은 카드 컴포넌트가 이미 소유하므로, 돌파 훅은 **카드에 없는 종목만** 상위 N개 구독한다(중복 구독은 참조계수라 무해하지만, 상한 예산을 카드에 뺏기지 않게 하는 것이 핵심).
- 구독하지 못한 행은 **이탈 판정을 하지 않는다** — 76 의 `lastPrice` 를 그대로 보여주고 삭제하지 않는다. 「모르는 값으로 지우는 것」이 「오래된 값을 보여주는 것」보다 나쁘다(D-27 계열).
- 거래소: 돌파 감지는 서버 정본상 **KRX A3 에서만** 발화한다 [CITED: gh-trade/docs/features/rate-cross-alert.md ② — "대상: KRX · 증권그룹 ST/FS/DR …"]. 따라서 돌파 목록 구독은 `exchange: "KRX"` 고정이 옳고, 이것이 D-07 「칩에 거래소를 표시하지 않는다」와도 일관된다.

**이탈 판정 공식 — 서버 문구가 아니라 가격으로 계산한다 (정본 인용):**

> 등락률 = (이벤트 현재가 − 행의 기준가) × 100 ÷ 행의 기준가(부호 포함 %, 기준가 없는 행만 이벤트 값 폴백). **삭제 기준 = 행의 임계(76 의 `ThresholdPct`) − `REMOVE_MARGIN_PCT`(2.0%p, 지금 18%)** 미만이고 **무장(추가 후 임계 이상을 본 적 있음) 또는 추가 후 3초 유예 경과**면 지운다
> [CITED: /Users/alex/repos/gh-trade/docs/features/rate-cross-alert.md ③ 「이탈 판정」]

⚠️ **CONTEXT D-16 이 생략한 조건이 있다** — 「**무장 또는 3초 유예**」. 이것 없이 순수 임계 비교만 하면 *돌파 직후 낡은 체결 한 건이 목록을 즉시 지운다*. 계획은 행마다 `armed: boolean`(추가 후 임계 이상을 한 번이라도 관측) 과 `addedAt: number` 를 들고 있어야 한다.

### Pattern 2: 컨테이너 쿼리 이관 — 표를 복사하지 않고 **컨테이너 선언 위치만 옮긴다** (D-12/D-24/D-28)

**What:** §2.2b 4밴드 표의 소비자를 한 벌로 유지하면서 측정 대상만 본문 → 카드로 바꾼다.

**현재 구조 (실측):**
- 컨테이너 선언은 **한 곳**이다: `webapp/src/components/trading/limit-chaser-client.tsx:542` — `className="@container/lc flex min-w-0 flex-col gap-[var(--s-2)]"`
- 소비자는 `@min-[700px]/lc:` · `@min-[830px]/lc:` · `@min-[992px]/lc:` 유틸리티뿐이다. 분포: `limit-chaser-client.tsx` 22줄 · `limit-chaser-form.tsx` 16줄 · `orderbook-ladder.tsx` 5줄 (`grep -c "/lc:"` 실측)
- `orderbook-ladder.tsx` 의 3트리 배타 조건이 그 유틸리티에 달려 있다 [VERIFIED: webapp/src/components/orderbook/orderbook-ladder.tsx:878 `hidden @min-[830px]/lc:block`, :1014 `hidden @min-[700px]/lc:block @min-[830px]/lc:hidden`, :1075 `@min-[700px]/lc:hidden`]
- `--lw` 폼 라벨칸은 992 에서만 104px 로 올라간다 [VERIFIED: webapp/src/components/trading/limit-chaser-form.tsx:1108 `@min-[992px]/lc:[--lw:104px]`]; 기본 76px 하한은 globals.css §2.2b ★ 주석이 정본

**핵심 사실:** CSS 컨테이너 쿼리는 이름이 같으면 **가장 가까운 조상 컨테이너**를 찾는다. 따라서 `@container/lc` 선언을 **카드 래퍼로 옮기면**, 위 43개 유틸리티가 한 글자도 안 바뀐 채 「카드 폭」을 재기 시작한다.

**권장 구현:**
```tsx
// strategy-card.tsx — 카드가 lc 컨테이너를 소유한다
<article className="@container/lc rounded-[var(--r-lg)] border …">
  <CardHeader … />
  {open && <QuoteGrid10 … />}
  {open && <CardBody … />}   {/* 안쪽은 기존 @min-[Npx]/lc: 그대로 */}
</article>

// trading-workbench.tsx — 페이지 축은 새 이름
<div className="@container/wb flex min-w-0 flex-col gap-[var(--s-3)]">
  <WorkbenchStatusBar … />   {/* @min-[700px]/wb: 로 세그먼트 표시 */}
  <CardGrid cols={cols} />   {/* @min-[700px]/wb:grid-cols-2 … */}
</div>

// stock-orderbook-section.tsx — 호가 탭 본문도 같은 이름을 선언한다
<div className="@container/lc …"><CardBody … /></div>
```

**globals.css 에 추가할 것 (표 복사 금지 — 한 문단만):**
§2.2b 본문 맨 아래에 「**이 표를 재는 컨테이너는 이제 둘이다: `lc`(상따 카드 본문 = 종목상세 호가 탭 본문, 같은 컴포넌트) · `wb`(작업대 페이지 본문, 상태줄·스트립·격자 열 수). 밴드 수치는 위 표 그대로이고 측정 대상만 다르다.**」 3~4줄. 숫자를 다시 적지 않는다(CLAUDE.md Conventions).

**추가 경계 1개:** 목업이 카드 헤더 한 줄 접힘에 `@container card (min-width: 760px)` 를 쓴다 [VERIFIED: .planning/phases/18-gh-trade-ui-nxt-vi/18-workbench-mockup.html:382 — `@container card (min-width: 760px) { .ch .l1 { flex: 1 1 auto; } .ch .l2 { flex: 0 0 auto; } }`]. 760 은 §2.2b 의 세 경계(700·830·992)에 없다. §2.2b 는 「밴드 경계는 셋뿐 … **상따 본문 안에** 뷰포트 폭 분기를 새로 만들지 마라」고 쓰여 있고(뷰포트 금지이지 컨테이너 경계 추가 금지는 아니다), 760 은 **헤더 한 줄 배치 전용의 로컬 경계**다. 계획은 이것을 「4밴드 표의 네 번째 경계」로 승격시키지 말고, 카드 헤더 컴포넌트 안의 로컬 규칙으로 두고 주석에 「밴드 표와 무관」을 명시해야 한다.

**포털 규율 (D-28) — 지금 어떻게 되어 있나:**
`DirtyActionBar` 자체는 `fixed inset-x-0 bottom-0 z-40` 클래스만 갖고 포털을 하지 않는다 [VERIFIED: webapp/src/components/trading/dirty-action-bar.tsx:89-93]. 포털은 **호출부**에 있다 [VERIFIED: webapp/src/components/trading/limit-chaser-form.tsx:1046-1056 — `{mounted && createPortal(<DirtyActionBar … />, document.body)}`]. `hint` prop 이 이미 표면별 문구를 받게 열려 있으므로 [VERIFIED: dirty-action-bar.tsx:66-72], 종목명 삽입은 **prop 값 변경만**으로 끝난다. `className` prop 도 이미 있다 [VERIFIED: dirty-action-bar.tsx:71].

### Pattern 3: 정정 프레임 — 신규 `t` 값 + 3층 대칭 확장

**권장 프레임 이름: `order.modify`** (D-21 재량). `order.new`/`order.cancel` 과 같은 `order.` 네임스페이스를 유지하고, `t` 하나로 dupKey·감사 origin·조립 분기가 갈린다.

```typescript
// packages/shared/src/relay.ts — RelayOrderCancelMsg(:500-510) 바로 아래
/**
 * 정정 주문 (`DirectOrderReq(2)` 정정, Phase 18 D-21).
 *
 * `orgOrderNo` 는 필수이고 **거래소는 원주문을 승계한다** — 서버 브로커가 원주문 메타
 * (OrderMetaTable)의 거래소를 우선하므로 클라가 잘못 실어도 엉뚱한 거래소로 나가지
 * 않지만(fbs `exchange` 주석), 그것을 근거로 아무 값이나 싣지 않는다.
 * `qty`/`price` 는 **정정 후 값**이다.
 *
 * ⚠️ 예약(Q-ID) 원주문과 시간외종가(G2/G3) 원주문은 서버가 정정을 거부한다 —
 *    UI 가 버튼을 잠그고(`queuedStatus !== "" || board !== ""`), relay 는 판정하지 않는다.
 */
export type RelayOrderModifyMsg = {
  t: "order.modify";
  rid: string;
  isin: string;
  exchange: RelayExchange;
  /** 원주문번호 — 정정은 필수다. */
  orgOrderNo: string;
  side: OrderSide;
  qty: number;
  price: number;
  accountNo: string;
};
```

`OrderType` 도 확장한다 [VERIFIED: packages/shared/src/relay.ts:1032 — `export type OrderType = "N" | "C";` 및 그 위 주석 `/** 주문 유형 ("N"=신규, "C"=취소). 정정("M")은 v1 범위 밖 (D-21). */`] → `"N" | "M" | "C"` 로 넓히고 주석을 갱신.

### Pattern 4: `pieceCount` / `krxSession` — 말미 optional 필드 3층 (D-22/D-23)

**Phase 17 이 남긴 「미송신」 지점(정확한 인용):**
> `piece_count`(24) · `krx_session`(26) 은 **싣지 않는다** (D-12). 미송신이 곧 기존 수동주문 경로의 바이트 무변경이다 — 예약/장전/시간외종가 발주 UI 는 Phase 18 소관이다.
> [VERIFIED: relay/src/dma/envelope.ts:975-976]

**flatc 재생성은 불필요하다** — 생성된 TS 접근자가 이미 있다 [VERIFIED: relay/src/generated/stock-dma/direct-order-req.ts:147 `static addPieceCount(builder:flatbuffers.Builder, pieceCount:number)`, :151 `static addKrxSession(builder:flatbuffers.Builder, krxSessionOffset:flatbuffers.Offset)`].

**와이어 의미 (fbs 원문):**
> `piece_count: uint;` — **0/미지정 = 1** … 서버 상한은 설정값 `[queued_order] max_pieces`(기본 10, 허용 1..64) — 초과는 브로커에 닿기 전에 거부다. **예약 구간(15:20~16:00 KRX 신규) 밖에서는 무시한다**
> `krx_session: string;` — **"" / 부재 = 서버 자동 판정** … `"G2"` = 장개시전 시간외종가 · `"G3"` = 장종료후 시간외종가. 값이 있으면 예약(15:20~16:00)·장전 G1 판정을 타지 않는다 … 그 외 값은 브로커에 닿기 전에 즉시 거부다
> [VERIFIED: relay/src/generated/StockDMA.fbs:169-184]

**조립기 규율 — `create*` 위치 인자를 쓰지 않는 이유가 바로 이 확장이다:**
> ★ 위치 인자 `createDirectOrderReq` 를 쓰지 않는다 … 17-01 재동기화로 fbs 말미에 `piece_count`·`krx_session` 2슬롯이 붙자 그 생성 함수의 인자 수가 11 → 13 으로 늘어 호출부가 깨졌다. 타입이 우연히 맞는 조합이었다면 **조용히** 한 칸 밀린 채 실계좌 발주가 나갔을 것이다.
> [VERIFIED: relay/src/dma/envelope.ts:949-953]

따라서 확장은 `DirectOrderReq.addPieceCount(b, n)` / `addKrxSession(b, off)` 두 줄 추가다. **조건부 송신**이 계약이다: `pieceCount` 는 값이 없거나 1이면 **아예 호출하지 않는다**(부재 = 1), `krxSession` 은 빈 문자열이면 **호출하지 않는다**(부재 = 서버 자동 판정). 그래야 기존 수동주문 바이트가 한 글자도 안 바뀐다.

### Pattern 5: 77 → 라벨·입력 매핑 (표시 전용)

정본 인용:
> 열림 ∧ KRX 면 예약 라벨이고 조각 입력(라벨+입력칸)이 **보이며** … 그 밖(닫힘·NXT·**모름 = 미수신·연결 끊김·구 서버**)은 일반 라벨이고 조각 입력은 **숨겨** … 신규 주문 조각 수는 **1** 로 보낸다 — 화면에 없는 값을 싣지 않는다. … 클라는 벽시계로 판정하지 않고 이 값으로 주문을 막지 않는다.
> [CITED: /Users/alex/repos/gh-trade/docs/features/queued-order.md §예약구간]

> 장전 창이면 매수·매도 라벨이 `예약매수`/`예약매도`(조각 입력 숨김·조각 수 1)이고 주문확인에 `예약: 증권사 보관 후 09:00 처리`(NXT 08:00) 줄이 붙는다 — 단 종합주문창에서 주문유형이 `시간외종가` 인 쪽 버튼은 **창과 무관하게** `매수`/`매도`(조각 1)다 … 종합주문창 주문유형 콤보는 `지정가`·`시간외종가`(시장가 제거)이고 `시간외종가` 는 KRX ∧ G2/G3 창일 때만 고를 수 있으며(닫히면 지정가 복귀) 가격 잠금·참고 종가 표시·`price 0`·`krx_session` 송신이다. … **상따창 수동주문 탭·VI 창에는 시간외종가 주문유형이 없다.**
> [CITED: /Users/alex/repos/gh-trade/docs/features/preopen-offhours-order.md §클라는 표시만 한다]

`RelayQueuedWindowMsg` 의 6필드는 `open`·`maxPieces`·`preopenOpen`·`g2Open`·`g3Open`·`nxtPreopenOpen` 이다 [VERIFIED: packages/shared/src/relay.ts:952-966]. 컨텍스트 값은 `queuedWindow: RelayQueuedWindowMsg | undefined` 이고 `undefined` = 「모름」이다 [VERIFIED: webapp/src/lib/use-relay-socket.ts:272, relay-provider.tsx:216-217 — `// 예약창도 미수신이다. \`open:false\`(닫힘)로 위장하지 않는다.`].

**권장: 순수 함수 하나로 접는다** (테스트 가능 · 두 표면 공유):
```typescript
// webapp/src/lib/queued-window.ts (신규)
export type OrderButtonMode = 'normal' | 'queued';
export interface ManualOrderAffordance {
  buttonMode: OrderButtonMode;      // 'queued' → 「예약매수/예약매도」
  showPieceInput: boolean;          // open ∧ KRX 일 때만
  maxPieces: number;                // 스테퍼 상한 (기본값 없이 서버 값)
  confirmNote: string | null;       // 「예약: 증권사 보관 후 09:00 처리」 / NXT 08:00
  offHoursSelectable: boolean;      // KRX ∧ (g2Open ∨ g3Open) — 호가 탭 콤보 전용
}
export function affordanceOf(
  w: RelayQueuedWindowMsg | undefined,   // undefined = 모름 = 전부 false
  exchange: RelayExchange,
  orderType: 'limit' | 'offhours',       // 카드는 항상 'limit'
): ManualOrderAffordance
```
규칙 표(정본에서 그대로 옮긴 것):

| 조건 | 버튼 | 조각 입력 | 확인 문구 |
|------|------|----------|-----------|
| `orderType==='offhours'` | 매수/매도 | 숨김(조각 1) | 없음 |
| `open ∧ KRX` | 예약매수/예약매도 | **보임**(기본 5, 상한 `maxPieces`) | 없음 |
| `preopenOpen ∧ KRX` | 예약매수/예약매도 | 숨김(조각 1) | 「예약: 증권사 보관 후 09:00 처리」 |
| `nxtPreopenOpen ∧ NXT` | 예약매수/예약매도 | 숨김(조각 1) | 「예약: 증권사 보관 후 08:00 처리」 |
| 그 외 / `undefined` | 매수/매도 | 숨김(조각 1) | 없음 |

### Pattern 6: 라우팅·리다이렉트 (D-02)

**현재 상태 실측:** `/trading/page.tsx` 는 **없다**(디렉터리 `webapp/src/app/trading/` 에 `limit-chaser/`·`vi/` 두 하위만 있다). `/trading/limit-chaser/page.tsx` 는 이미 서버 컴포넌트 `redirect()` 선례다 [VERIFIED: webapp/src/app/trading/limit-chaser/page.tsx:1,13 — `import { redirect } from 'next/navigation';` … `redirect('/trading/limit-chaser/new');`] 이고 그 docstring 이 이유까지 적어 두었다: 「서버 컴포넌트로 두어 리다이렉트가 **네트워크 왕복 한 번에** 끝나게 한다 — 클라이언트에서 밀면 빈 화면이 한 프레임 그려진 뒤 이동한다.」

**권장: `next.config` 가 아니라 `page.tsx` 의 `redirect()` 를 쓴다.**
이유 셋:
1. `[key]` → `/trading?focus={key}` 는 **동적 세그먼트를 쿼리로 옮기는** 변환이다. `next.config` 의 `redirects()` 도 `:key` 캡처를 지원하지만, 키가 `ISIN:계좌:거래소` 라 `:` 를 품고 `encodeURIComponent` 로 인코딩돼 있다 [VERIFIED: webapp/src/components/layout/app-sidebar.tsx:99-101 — `return \`/trading/limit-chaser/${encodeURIComponent(key)}\`;`]. 디코드→재인코드를 config 정규식으로 하는 것보다 `page.tsx` 에서 `decodeURIComponent` 후 `redirect()` 하는 편이 기존 `[key]/page.tsx:25` 와 같은 규율이다.
2. 이미 같은 패턴의 선례가 저장소 안에 있고 그 이유가 주석으로 남아 있다.
3. `next.config` 리다이렉트는 e2e 에서 dev 서버 설정 변경을 요구해 회귀를 잡기 어렵다.

```tsx
// app/trading/limit-chaser/[key]/page.tsx — 클라이언트 컴포넌트를 서버로 되돌린다
import { redirect } from 'next/navigation';
export default async function LimitChaserEditRedirect({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;                       // Next 15 는 params 가 Promise
  redirect(`/trading?focus=${encodeURIComponent(decodeURIComponent(key))}`);
}
```

**`focus` 파라미터 (재량):** 이름 `focus`, 값은 전략 키 원문을 `encodeURIComponent` 1회. 파싱은 이미 있는 `parseStrategyKey` 재사용 [VERIFIED: webapp/src/components/trading/limit-chaser-client.tsx:174]. 작업대는 `useSearchParams()` 로 읽되 **마운트 1회만 소비**하고 그 뒤에는 로컬 상태가 정본이어야 한다(뒤로가기로 카드가 다시 펼쳐지는 것을 막는다).

**함께 바뀌는 링크 지점 (전수):**
| 파일:라인 | 현재 | 바뀔 값 |
|-----------|------|---------|
| `webapp/src/components/layout/app-sidebar.tsx:89` | `NAV_LIMIT_CHASER.href = "/trading/limit-chaser/new"` | 제거 — 그룹 제목이 `/trading` 링크 (D-03) |
| `webapp/src/components/layout/app-sidebar.tsx:94` | `NAV_VI = { href: "/trading/vi", … }` | 제거 — 3단에 KRX VI · NXT VI 항목 |
| `webapp/src/components/layout/app-sidebar.tsx:99-101` | `limitChaserHref(key)` | `/trading?focus=…` 로 본문 교체 (이름 유지 권장 — 호출부 2곳이 그대로 산다) |
| `webapp/src/components/trading/strategy-status-card.tsx:152` | `href={limitChaserHref(item.key)}` | 헬퍼가 바뀌므로 **무수정** |
| `webapp/src/components/trading/strategy-status-card.tsx:470` | `href="/trading/vi"` | `/trading` |
| `webapp/src/components/trading/limit-chaser-client.tsx:1458` | a11y 주석의 경로 | 문구 갱신 |
| `webapp/src/styles/globals.css:150` | 「컨테이너 쿼리로 재는 것은 상따(`/trading/limit-chaser`) 본문 하나뿐」 | Pattern 2 의 3~4줄로 갱신 |
| `webapp/src/components/chat/chat-fab.tsx:7` | 주석의 경로 예시 | 문구 갱신(동작 무변경 — FAB 은 `/stocks/{code}` 에서만 뜬다, `:54` `STOCK_DETAIL_PATH`) |

**깨지는 e2e 스펙 (실측):**
| 스펙 | 줄 수 | 영향 |
|------|-------|------|
| `webapp/e2e/specs/trading-limit-chaser.spec.ts` | 926 | 14개 test 전부 `/trading/limit-chaser/new` 진입. 케이스 9·11·12·13 이 밴드 잘림 0 단언(D-29 가 재사용하라는 패턴) |
| `webapp/e2e/specs/trading-vi.spec.ts` | 792 | `/trading/vi` 진입 전량 |
| `webapp/e2e/specs/sidebar-tree.spec.ts` | 316 | 2단 「상따」·「VI」 항목 존재 단언 |
| `webapp/e2e/specs/a11y.spec.ts:323` | — | `/trading/limit-chaser/new — 위반 0` 케이스 |
| `webapp/e2e/specs/me.spec.ts` | 685 | 전략 현황 카드 링크 대상(`/trading/vi` 포함) |

### Anti-Patterns to Avoid
- **밴드 표를 UI-SPEC/RESEARCH/컴포넌트 주석에 복사하기** — CLAUDE.md Conventions 명시 금지. globals.css §2.2b 를 가리키기만 한다.
- **`OrderResp.message` 문구로 분기하기** — 서버가 804 정정·취소 거부에서 문구를 교체한다 [VERIFIED: relay/src/dma/envelope.ts:1465-1467].
- **취소·정정 통보의 `side` 를 믿기** — `sideTrusted:false` 이고 MockBroker 는 "B" 를 남긴다 [VERIFIED: relay/src/dma/envelope.ts:1443-1450, 1549].
- **`pendingStatus` 문구 비교로 회색·취소 제외 판정** — 근거는 `pendingCancelSent` bool 하나 [VERIFIED: packages/shared/src/relay.ts:709-717].
- **돌파 목록을 벽시계/클라 정렬로 재정렬** — D-14. 서버 순서를 그대로 쓴다.
- **77 을 주문 차단에 쓰기** — D-22 / 정본 명시.
- **`create*` 위치 인자 FlatBuffers 생성 함수 사용** — envelope.ts:949-953 의 사고 기록.
- **카드 안에 뷰포트 브레이크포인트 섞기** — §2.2b 의 255px 역전이 되살아난다.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 종목 시세 구독·해제·재접속 재구독 | 카드마다 `sub` 프레임 직접 전송 | `useRelayContext().subscribe/unsubscribe` | 참조계수 + 재접속 flush 가 한 경로여야 한다. 두 경로면 「재접속 후 새로고침해야 시세가 나온다」 (`use-relay-socket.ts:734-752`) |
| 주문 상관(rid)·타임아웃·단절 정산 | 카드별 pending 맵 | `useRelayContext().sendOrder(req)` | `rid` 생성처가 하나여야 relay 중복가드가 정상 주문을 막지 않는다 (`relay-provider.tsx:123-137`) |
| ISIN → 단축코드·시장 | 브라우저 산술/추론 | relay `SymbolMap` | D-28. 「KONEX·null 이 조용히 KOSPI 가 됐다」 (`limit-chaser-form.tsx:259-266`) |
| ISIN → 종목명 표시 | 컴포넌트별 fetch | `useIsinLabels()` | 이름 원천 하나 (`webapp/src/lib/isin-labels.ts:51-79`) — 단, 돌파 항목은 아직 원천에 없다(§O-1) |
| VI 확인 체크 활성 판정 | 새 조건식 | `isConfirmable()` (`vi-order-list.tsx:154`) | 110/119초·`confirm_locked` 규칙이 한 곳 |
| 상따 LED 상태 | 새 규칙표 | `latchLedStateOf()` (`latch-led.tsx:113`) | Phase 17 규칙표 정본 |
| 더티 판정 | 카드별 비교 | `dirtyFieldsOf()` (`webapp/src/lib/limit-chaser.ts:147`) + `DIRTY_COMPARED_FIELDS`(:111) | 비교 필드 목록이 한 곳 |
| 전략 키 조립·파싱 | 문자열 연결 | `strategyKey()`(`limit-chaser.ts:100`) · `parseStrategyKey()`(`limit-chaser-client.tsx:174`) | 12자 절단 규율과 짝 (`envelope.ts:1032-1036`) |
| 만원↔원 변환 | 인라인 `* 10000` | `manwonToKrw`/`krwToManwon` (`vi-alert.ts:56,67`) | 「한 번 더 곱하면 **1만 배** 주문」 |
| 주문 확인 다이얼로그 | 새 모달 | `OrderConfirmDialog` (`order-confirm-dialog.tsx:84`) | 중복 제출 가드 + 기본 포커스가 취소 버튼(`:92` — 「실행 버튼에 포커스가 가면 Enter 한 번에 주문이 나간다」) |
| 호가 10단 렌더 | 카드 전용 사다리 | `OrderbookLadder variant="chaser"` | 3트리 배타 조건 + 색·바 정규화 규칙 공유 (`orderbook-ladder.tsx:56-74`) |
| SSR 안전 localStorage | 직접 접근 | `vi-alert.ts:137-158` 패턴 복제(try/catch + `typeof window` 가드) | Safari 프라이빗 모드에서 throw |

**Key insight:** 이 phase 의 재사용 대상은 전부 **판정 함수**다. 화면을 한 페이지로 합치면서 「이 카드에서만 다르게」가 생기는 순간 그 판정이 둘로 갈리고, 갈린 판정은 전부 **오발주 경로**다(LED 오점등 · 확인 체크 오활성 · 단위 변환 · 전략 키 불일치). 컴포넌트는 쪼개되 판정 함수는 절대 복제하지 않는다.

---

## 주문 계약 확장 — 실제 변경 지점 (D-21/D-22/D-23)

### 표 C-1: 정정(`"M"`) 도입이 건드리는 곳 — **CONTEXT 가 말한 3곳이 아니라 7곳**

| # | 파일 | 현재 상태 (실측 인용) | 필요한 변경 |
|---|------|---------------------|------------|
| 1 | `supabase/migrations/…_dma_orders.sql:57` | `order_type   text NOT NULL CHECK (order_type IN ('N','C')),` | **새 마이그레이션** — `'M'` 추가. 이것이 없으면 relay 가 insert 실패 → 게이트웨이 송신 전 자체 거부 |
| 2 | `packages/shared/src/relay.ts:1032` | `export type OrderType = "N" \| "C";` | `"N" \| "M" \| "C"` |
| 3 | `packages/shared/src/relay.ts:500` 아래 | `RelayOrderCancelMsg` 까지만 | `RelayOrderModifyMsg` 신설 + `RelayInbound`(:513) 유니온에 추가 |
| 4 | `relay/src/ws/protocol.ts:278-287` | `RelayOrderCancelSchema` | `RelayOrderModifySchema` 신설 + `RelayInboundSchema`(:299) 배열에 추가 |
| 5 | `relay/src/dma/envelope.ts:857-862` | `toWireOrderType` 이 `"N"`/`"C"` 외 전부 throw — 「스키마는 "M" 을 알지만 relay 는 만들지 않는다」(:854) | `"M"` 허용 + 주석 갱신 |
| 6 | `relay/src/dma/envelope.ts:940-943` | `if (orderType === "C" && orgOrderNo === "")` throw | `orderType === "C" \|\| orderType === "M"` |
| 7 | `relay/src/ws/order-handler.ts:758, 248-256, 840-871, 890-900` | `const isCancel = msg.t === "order.cancel";` 2분기 · `dupKey` 2분기 · `orderType: isCancel ? "C" : "N"` (insert·조립 두 곳) | 3분기로 확장 |

**추가 실측 — `webapp/src/lib/relay-provider.tsx`:**
- `RelayOrderRequest.kind` 가 `"new" | "cancel"` 이다 [VERIFIED: webapp/src/lib/relay-provider.tsx:87 — `kind: "new" | "cancel";`] → `"modify"` 추가
- `buildOrderFrame` 이 `kind === "cancel"` 만 분기 [VERIFIED: :167-172] → modify 분기 추가(orgOrderNo 필수 + side 필수)

**dupKey 권장 형태 (재량 — 근거 있는 선택):**
현재 규칙의 docstring 이 「같은 주문」의 정의를 종류별로 다르게 두는 이유를 이미 적어 두었다:
> · 신규: `(accountNo, isin, side, price, qty)` … · 취소: `(accountNo, isin, "C", orgOrderNo)`. **취소의 정체성은 원주문번호**이고 가격·수량은 식별자가 아니다 … 급락 국면에서 미체결 일괄 취소가 막히는 것은 자산 위험이고, 그 가드는 사고를 막는 것이 아니라 사고를 만든다.
> [VERIFIED: relay/src/ws/order-handler.ts:227-246]

정정은 **취소와 다르다** — 같은 원주문을 서로 다른 가격으로 연달아 정정하는 것이 상따 화면의 정상 조작이다(가격 추적). 따라서:
```
dup:{accountNo}|{isin}|M|{orgOrderNo}|{price}|{qty}
```
를 권장한다. 완전히 같은 값의 더블클릭은 막고, 값이 바뀐 재정정은 통과한다. 이 선택의 근거를 `dupKey` docstring 에 세 번째 불릿으로 적어야 한다(위 인용과 같은 자리).

**`notice_type "M"` 파서 — 이미 준비돼 있다. 바꿀 것 없음:**
> 통보 종류 원문 1자 — "A"=접수 "E"=체결 "C"=취소확인 **"M"=정정확인** "R"=거부
> [VERIFIED: relay/src/dma/envelope.ts:1430-1432]
> `sideTrusted: noticeType !== "C" && noticeType !== "M",`
> [VERIFIED: relay/src/dma/envelope.ts:1549]

`dma_orders.notice_type` 에는 CHECK 제약이 **없다** [VERIFIED: supabase/migrations/20260905120200_dma_orders.sql:64 — `notice_type  text,` (CHECK 절 없음)]. 따라서 `"M"` 통보 기록은 마이그레이션 없이 통과한다. `requestKind`(`"New"`/`"Modify"`/`"Cancel"`)도 이미 파싱된다 [VERIFIED: envelope.ts:1462-1470].

**smoke 프로브 — 변경 불필요(단, 확인할 것 하나):**
`scripts/smoke-relay.sh` 의 `ws_order_probe` 는 `order.new` 로 `rejected` 를 유도한다 [VERIFIED: scripts/smoke-relay.sh:414-429]. `order.new` 스키마에 **optional** 필드만 추가하므로 프로브는 그대로 통과한다. ⚠️ 단, `RelayOrderNewSchema` 를 `.strict()` 로 만들지 **말 것** — 지금은 `z.object` 라 미지의 키를 조용히 버린다(§Pitfall 3).

### 표 C-2: `price 0`(시간외종가, D-23)이 막히는 네 겹의 가드

| # | 파일:라인 | 인용 | 필요한 완화 |
|---|-----------|------|------------|
| 1 | `webapp/src/lib/relay-provider.tsx:157` | `if (!(req.price > 0)) return { ok: false, reason: "주문 가격을 확인해 주세요." };` | `krxSession` 이 G2/G3 일 때만 `price === 0` 허용 |
| 2 | `relay/src/ws/protocol.ts:267` | `price: z.number().int().positive(),` | `z.number().int().nonnegative()` + superRefine(「0 은 `krxSession` 이 G2/G3 일 때만」) |
| 3 | `relay/src/dma/envelope.ts:932-934` | `if (!Number.isInteger(req.price) \|\| req.price <= 0) { throw new OrderBuildError("BAD_PRICE", "주문가격은 1 이상의 정수여야 합니다"); }` | 같은 조건부 완화. **조립기가 마지막 관문**이라는 규율(:806)은 유지 — 0 을 무조건 열지 않는다 |
| 4 | `supabase/migrations/…:60` | `price        integer NOT NULL CHECK (price > 0),` | `CHECK (price > 0 OR krx_session IN ('G2','G3'))` — 감사 컬럼을 함께 추가하면 이 형태가 가능 |

**권장 마이그레이션 (한 파일):**
```sql
-- 1) 정정 허용
ALTER TABLE public.dma_orders DROP CONSTRAINT dma_orders_order_type_check;
ALTER TABLE public.dma_orders ADD CONSTRAINT dma_orders_order_type_check
  CHECK (order_type IN ('N','M','C'));   -- M=정정 (Phase 18 D-21)

-- 2) 감사 컬럼 (D-21 「dma_orders origin/kind 기록」)
ALTER TABLE public.dma_orders ADD COLUMN piece_count integer;   -- NULL = 미송신(=1)
ALTER TABLE public.dma_orders ADD COLUMN krx_session text
  CHECK (krx_session IS NULL OR krx_session IN ('G2','G3'));

-- 3) 시간외종가 price 0 (서버 자동 결정가)
ALTER TABLE public.dma_orders DROP CONSTRAINT dma_orders_price_check;
ALTER TABLE public.dma_orders ADD CONSTRAINT dma_orders_price_check
  CHECK (price > 0 OR krx_session IN ('G2','G3'));
```
⚠️ 제약 이름(`dma_orders_order_type_check` 등)은 Postgres 기본 명명 규칙 추정이다 [ASSUMED] — 실행 전 `\d public.dma_orders` 또는 `pg_constraint` 조회로 확인하는 단계를 계획에 넣을 것. RLS·REVOKE 규율은 기존 마이그레이션 그대로 유지되며 컬럼 추가는 그것을 건드리지 않는다.

### 정정을 잠가야 하는 두 경우 (UI 판정 — 서버가 어차피 거부한다)
| 조건 | 근거 |
|------|------|
| `RelayUnfilled.board === "G2" \|\| "G3"` (시간외종가 원주문) | 「정정은 R `시간외종가 정정 불가 — 취소 후 재등록`」 [CITED: gh-trade/docs/features/preopen-offhours-order.md] · `board` 는 `"G2"·"G3"·""` 셋뿐 [VERIFIED: packages/shared/src/relay.ts:707-708] |
| `RelayUnfilled.queuedStatus !== ""` (예약 Q-ID 행) | 「정정은 거부(취소 후 재등록, D-12)」 [CITED: gh-trade/docs/features/queued-order.md] · Q-ID 행 판정은 `queuedStatus` 가 비지 않은 것 [VERIFIED: packages/shared/src/relay.ts:693-699] |
| `RelayUnfilled.pendingCancelSent === true` | 취소 보관 행은 회색 + 취소 숨김 [VERIFIED: packages/shared/src/relay.ts:709-717] |

**정정/취소 대상 선택에 필요한 필드는 전부 `RelayUnfilled` 에 이미 있다** [VERIFIED: packages/shared/src/relay.ts:677-726]: `orderNo`·`orgOrderNo`·`isin`·`side`·`price`·`orderQty`·`filledQty`·`unfilledQty`·`exchange`·`orderTime`·`queuedStatus`·`pendingStatus`·`board`·`pendingCancelSent`·`name?`·`code?`. 새 조회가 필요 없다.

---

## 돌파감지 목록 — 클라 규칙 정본 대조 (TRADE-06)

| 규칙 | CONTEXT | gh-trade 정본 | 차이 / 주의 |
|------|---------|--------------|-------------|
| 76 = upsert, 자리 유지 | D-14 | 「이미 목록에 있는 종목에 76 이 다시 오면 **자리를 유지**하고 현재가·등락률·임계·기준가만 갱신한다(돌파 시각·돌파가는 첫 등재 값 유지, 무음)」 | 일치. **돌파시각·돌파가는 첫 등재값 유지**가 CONTEXT 에 없다 — 계획에 명시 필요 |
| 78 = 전량 교체 | D-14 | 「**스냅샷에 없는 기존 행은 지우지 않는다**(삭제 권한은 실시간 이탈 판정 한 곳)」 | ⚠️ **불일치처럼 보이지만 아니다.** relay 캐시(`#rateCrossItems`)는 전량 교체하고 [VERIFIED: subscription-hub.ts:867-878], 화면 목록은 relay 가 준 집합을 그대로 쓴다. WinForms 는 로컬 영속 목록이 따로 있어 「지우지 않는다」가 필요했다. gh-radar 는 relay 캐시가 곧 목록이므로 **D-14 대로 전량 교체가 맞다** |
| 스냅샷 행 = 무음·무강조 | (없음) | 「**무음**(창 열림 무관) · **무강조** … 원소 종목 전부 첫 돌파 처리 집합 기록」 | ⚠️ **CONTEXT 누락.** 78 로 들어온 행은 알림음도 30초 강조도 없어야 하고, 그러면서 「오늘 울린 종목」 집합에는 **기록**된다 |
| 재돌파 | D-18 「지우면 그날 재돌파에도 안 나옴」 | 「목록에서 빠졌다가 다시 오는 종목만 맨 위에 새로 오른다」·「재돌파·복원 행은 무음」 | D-15 의 「지운 종목」 집합이 재돌파를 막는 것은 gh-radar 고유 결정(WinForms 엔 없음). 정본과 어긋나지 않는다(표시 필터) |
| 알림음 | D-17 하루 1회 · 기본 꺼짐 | 「**소리를 내기 전에 저장한다**」 | ⚠️ **순서가 계약이다** — 집합에 먼저 쓰고 그 다음 재생. 반대로 하면 재생 실패 시 하루 종일 중복 알림 |
| 강조 | D-18 30초 연노랑, 깜박임 없음 | 「5초 동안 500ms 깜빡임 → 30초까지 연노랑 고정 → 기본」 | D-18 이 의도적으로 깜박임을 뺐다. **사용자 결정이 정본** |
| 이탈 삭제 | D-16 임계−2%p | 「… 미만이고 **무장(추가 후 임계 이상을 본 적 있음) 또는 추가 후 3초 유예 경과**면」 | ⚠️ **CONTEXT 누락 — Pattern 1 참조** |

**30초 강조 타이머 (D-18 재량) 권장:** 행마다 `highlightUntil: number`(= `addedAt + 30_000`)를 두고, **목록 전체에 타이머 1개**(1초 tick, 강조 행이 있을 때만 가동)로 재렌더한다. 행마다 `setTimeout` 을 걸면 목록이 200행까지 갈 수 있는 구조(D-14 상한)에서 타이머가 200개 돈다. 이 규율은 이미 코드베이스에 선례가 있다 — 「배치 타이머는 키마다가 아니라 **사용자(세션) 단위 1개**다 — 종목 10개를 보면 타이머 10개가 도는 구조를 만들지 않는다」 [VERIFIED: relay/src/hub/subscription-hub.ts:17-19] · `vi-order-list.tsx:642` 의 `useNow()` 가 브라우저 쪽 동형 선례.

**localStorage KST 날짜 키 (D-15) 권장 형태:**
```typescript
// webapp/src/lib/breakout-list.ts
const SOUNDED_KEY = 'gh-radar:breakout-sounded';   // {"d":"20260921","codes":["KR7005930003", …]}
const DISMISSED_KEY = 'gh-radar:breakout-dismissed';
const TONE_KEY = 'gh-radar:breakout-tone';         // "on" | "off" (기본 off)
const COLS_KEY = 'gh-radar:trading-cols';          // "1" | "2" | "3"
/** KST 날짜 키 `yyyyMMdd`. 서버 06:00 거래일 리셋과 다르지만 클라는 날짜 키가 정본이다. */
export function kstDateKey(now: Date = new Date()): string { … }
```
- 값에 **ISIN 을 담는다**(단축코드가 아니라) — 돌파 항목의 유일한 확실한 키가 ISIN 이다.
- 읽기·쓰기 전부 `typeof window` 가드 + try/catch. 패턴 정본은 `vi-alert.ts:137-158`.
- 날짜가 다르면 읽을 때 빈 집합으로 간주하고 쓸 때 새 날짜로 덮는다(별도 리셋 타이머 없음).
- **기기별**임을 UI 문구에 명시하는 선례가 있다 — 「`(이 기기만)` 을 명시한다」 [VERIFIED: webapp/src/lib/vi-alert.ts:11-13].

---

## 재사용 자산 실측 (슬라이스 경계)

### 줄 수 (실측 — `wc -l`)
| 파일 | 줄 | 이 phase 에서의 역할 |
|------|-----|---------------------|
| `components/trading/limit-chaser-client.tsx` | 1,641 | **해체 대상.** 페이지 셸 + 상태줄 + 10칸 + 조립 |
| `components/trading/limit-chaser-form.tsx` | 1,526 | **거의 그대로 카드 본문 우측.** props 가 이미 per-strategy |
| `components/trading/vi-settings-card.tsx` | 950 | 2줄 설정으로 축소 + 거래소 축 추가 |
| `components/trading/vi-order-list.tsx` | 652 | 「더보기」 표로 거의 그대로 |
| `components/trading/vi-client.tsx` | 662 | **삭제 대상**(페이지 셸) |
| `components/orderbook/orderbook-ladder.tsx` | 1,213 | `variant="chaser"` 그대로 |
| `components/orderbook/order-panel.tsx` | 693 | **다이어트 → `manual-order-form.tsx` 로 재작성** |
| `components/orderbook/account-panel.tsx` | 978 | 공용 패널(계좌 전용 모드) + 행 선택 prop 추가 |
| `components/orderbook/trade-tape.tsx` | 473 | 카드 좌측 하단 그대로 |
| `components/orderbook/order-confirm-dialog.tsx` | 269 | 그대로 + 정정 모드 detail 추가 |
| `components/trading/latch-led.tsx` | 251 | 카드 헤더 LED 3칩 그대로 |
| `components/trading/strategy-badge.tsx` | 196 | 거래소 태그·배지 그대로 |
| `components/trading/dirty-action-bar.tsx` | 144 | 그대로 (`hint` 에 종목명) |
| `components/trading/dma-gate.tsx` | 137 | 페이지 1곳에서만 감싼다 |
| `components/trading/strategy-log.tsx` | 310 | 공용 패널 로그 탭 |
| `lib/relay-provider.tsx` | 348 | `buildOrderFrame` 확장 |
| `lib/use-relay-socket.ts` | 1,094 | 무변경(구독·sendOrder 그대로) |
| `lib/limit-chaser.ts` | 322 | 무변경 |

### `limit-chaser-client.tsx` 슬라이스 경계 (실측 심볼 위치)
| 라인 | 심볼 | 이동처 |
|------|------|--------|
| :117 `ECHO_BANNER_MS` / :123 `ACK_TIMEOUT_MS` | 상수 | 카드 컴포넌트로 |
| :174 `parseStrategyKey` | export 함수 | **`lib/limit-chaser.ts` 로 이동 권장** (`strategyKey` 와 짝) |
| :190 `LimitChaserClient` | 라우트 엔트리 | 삭제 |
| :201 `LimitChaserSurface` | **카드 1장의 몸통** (relay 구독 · 에코 상관 · 로그 · 더티) | → `strategy-card.tsx`. `routeKey` prop → `initialKey` |
| :979 `QuoteCell` / :1013 `priceText` / :1024 `priceTone` | 10칸 셀 | → `quote-grid-10.tsx` |
| :1029 `StrategyStatus` / :1052 `strategyStatusOf` | 배지 파생 | → 카드 헤더 (판정 함수 복제 금지) |
| :1087 `StatusBar` / :1196 `Dot` | 상태줄 | → 카드 헤더 LED 부분 + 작업대 상태줄로 **둘로 갈라짐** ⚠️ 판정 함수는 하나로 유지 |
| :1247 `isPickable` / :1259 `StockSearchField` | 종목검색 | → `stock-add-bar.tsx` 로 **승격**(현재 파일 내부 비공개) |
| :1607 `useLeaveWarning` | 이탈 경고 | → 작업대 페이지 1곳 (더티 카드 수 합산) |

`LimitChaserSurface` 가 이미 「한 전략」 단위라는 증거: `useRelaySubscription({isin, exchange, enabled: isin.length > 0})` 를 자기 안에서 호출하고 [VERIFIED: limit-chaser-client.tsx:241-245], `key = strategyKey(isin, accountNo, exchange)` 로 자기 서버 전략을 고른다 [VERIFIED: :250-258]. **카드 = 이 함수를 컴포넌트로 승격시킨 것**이고 계좌만 위에서 내려받으면 된다.

`LimitChaserForm` 도 이미 per-strategy 계약이다 — props 가 `isin`·`accountNo`·`exchange`·`server`·`upperLimit`·`disabled`·`onDirtyCountChange`·`onSent`·`onServerEcho` [VERIFIED: limit-chaser-form.tsx:255-301]. **카드 본문 우측에 그대로 들어간다.** 바꿀 것은 두 가지뿐: (a) 포털 `hint` 에 종목명(`:1053` → `DIRTY_HINT` 를 prop 으로), (b) `@min-[Npx]/lc:` 가 이제 카드 폭을 잰다(코드 무변경, 선언 위치만 이동).

### 사이드바 헬퍼 (재구현 금지)
| 심볼 | 위치 | 상태 |
|------|------|------|
| `NavLeaf` (interface) | `app-sidebar.tsx:71` | 유지 |
| `GroupHeading` | `app-sidebar.tsx:163` | **링크로 승격 필요** (D-03 「그룹 제목 자체가 `/trading` 링크」) — 현재는 `label`+`icon` 만 받는 비링크 |
| `StrategyItem` | `app-sidebar.tsx:179` | 3단 상따 항목 — LED 3점 요약 추가 |
| `useTradingVisible` | `app-sidebar.tsx:251-268` | 그대로 (Phase 16 D-16/D-19) |
| `limitChaserHref` | `app-sidebar.tsx:99-101` | 본문만 `/trading?focus=` 로 |
| `viBadgeOf` | `strategy-badge.tsx` (import `:19`) | 그대로 |
| `viAnyRunning` | `use-relay-socket.ts` (import `:23`) | ⚠️ D-05 가 거래소별 2줄을 요구 — 줄마다는 `viTriggers.KRX`/`.NXT` 를 직접 보고, **「어느 하나라도 가동중」 판정이 필요한 곳에서만** `viAnyRunning` 을 쓴다. 판정을 다시 쓰지 말 것 (`app-sidebar.tsx:331-333` 주석) |
| `samePath` | `app-sidebar.tsx:112` | `/trading` 활성 판정에 재사용 |

### 종목상세 · 팝업 재사용 (D-25)
- 탭 정의는 `stock-detail-tabs.tsx:40-45` — `chart`·`orderbook`·`info`·`news` 4종 [VERIFIED]. 팝업은 `orderbook` 을 뺀 3종.
- 「T8 한 번 연 `차트 · 종목정보 · 뉴스토론` 패널은 떠나도 언마운트하지 않고 숨긴다(forceMount) … `호가주문`은 예외로 떠나면 언마운트한다 — 실시간 호가 구독을 보이지 않는 탭에서 유지하지 않는다」 [VERIFIED: stock-detail-tabs.tsx:26-30]. **팝업도 같은 규율을 따른다** — 닫으면 언마운트(구독 없으므로 forceMount 여도 해는 없으나, 모달 N개가 쌓이지 않게 닫을 때 버린다).
- 팝업은 **단축코드**로 콘텐츠를 조회한다. 돌파에서 만든 카드에 `code` 가 없으면 ⓘ 를 비활성해야 한다 → §O-1.
- 팝업은 컨테이너 containment 를 피해 `document.body` 포털이어야 한다 [CITED: 18-workbench-mockup.html 설계 메모 — 「팝업은 컨테이너 쿼리 containment 때문에 document.body 포털(뷰포트 기준)이다」]. Radix Dialog 는 기본적으로 `Portal` 을 쓰므로 추가 작업 없음 [ASSUMED — Radix 기본 동작, 이번 세션 코드 확인 안 함].

### 목업에서 추출한 수치·컨테이너 (레이아웃 정본 — D-26)
| 항목 | 값 | 출처 |
|------|-----|------|
| 컨테이너 3종 | `vp`(앱 셸 — 프로덕션에서는 뷰포트 BP 유지) · `page` · `card` | `18-workbench-mockup.html:242, 268, 382` |
| 격자 열 수 | `@container page (min-width:700px)` 에서만 `[data-cols="2"]`/`"3"` 적용, 기본 1단 | `:370-373` |
| 폰에서 단 수 세그먼트 숨김 | `@container page (max-width:699px) { .colseg { display:none } }` | `:268` |
| 카드 본문 그리드 | 700→`260px minmax(0,1fr)` · 830→`400px …` · 992→`460px …` | `:448-450` |
| 종목정보 10칸 | 700→`repeat(5,1fr)` · 992→flex 한 줄 | `:444-445` |
| 폰 호가 박스 | `max-height:330px; overflow-y:auto` | `:462` |
| 3단 호가표 전환 | 830 에서 `.ladbox.v2` 숨김 / `.v3` 표시 | `:463` |
| 폼 라벨칸 | 700 이상 `grid-template-columns: 76px minmax(0,1fr)` | `:522` |
| 수동주문 적응형 | `<700` → `data-tabman="1"` 3탭 / `≥700` → `data-cover="1"` 덮기 | `:581-590` |
| 4버튼 줄 | `.obtns.four { grid-template-columns: repeat(4, minmax(0,1fr)) }` | `:597` |
| 폰 공용 패널 | `position:sticky; bottom:0; z-index:20; max-height:40vh` | `:562-568` |
| 카드 헤더 로컬 경계 | `@container card (min-width:760px)` | `:382` |

---

## Common Pitfalls

### Pitfall 1: `dma_orders` CHECK 가 정정을 게이트웨이 앞에서 죽인다
**무엇이 잘못되나:** `order.modify` 를 배선하고 relay 까지 고쳤는데 「주문 기록에 실패했습니다. 잠시 후 다시 시도해 주세요.」만 돌아온다.
**왜:** relay 는 게이트웨이 송신 **전에** `dma_orders` insert 를 하고, 실패하면 **보내지 않는다** — 「감사 기록 없는 실주문을 만드는 것보다, 사용자에게 지금 못 보낸다고 말하는 편이 낫다(D-24)」 [VERIFIED: relay/src/ws/order-handler.ts:853-866]. `order_type='M'` 은 CHECK 위반이다.
**피하는 법:** 마이그레이션을 **Wave 0 첫 태스크**로. relay 단위 테스트는 DB 를 모킹하므로 **이 결함을 잡지 못한다** — 스테이징/프로덕션 첫 정정에서만 드러난다.
**조기 경보:** relay 로그 `[WS-order] dma_orders 기록 실패 — 주문을 보내지 않는다` + `pgError`.

### Pitfall 2: 시간외종가 `price 0` 이 네 겹 가드에 막힌다
**무엇이 잘못되나:** 주문유형 콤보에서 「시간외종가」를 골라 제출하면 「주문 가격을 확인해 주세요.」로 끝난다(와이어에 나가지도 않는다).
**왜:** §표 C-2 의 네 지점이 전부 양수를 요구한다. 가장 앞의 `buildOrderFrame` 은 `console.error` 와 함께 `rejected` 를 즉시 돌려준다 [VERIFIED: relay-provider.tsx:250-256].
**피하는 법:** 네 곳을 **동시에** 조건부로 연다. 무조건 `>= 0` 으로 바꾸지 **말 것** — 실수로 가격 0 인 지정가가 나가면 게이트웨이가 거부하고 그 왕복이 5초를 태운다(조립기 주석의 논거).
**조기 경보:** 브라우저 콘솔 `[relay] 주문 요청 형식 오류 — 주문 가격을 확인해 주세요.`

### Pitfall 3: zod 가 미지의 키를 **조용히 버린다** — 3층 순서를 어기면 조각 수가 사라진다
**무엇이 잘못되나:** webapp 이 `pieceCount: 5` 를 실어 보냈는데 서버는 1조각으로 발사한다. 에러가 **하나도 없다**.
**왜:** `RelayOrderNewSchema` 는 `z.object({…})` 이고 `.strict()` 가 아니다 [VERIFIED: relay/src/ws/protocol.ts:261-270]. zod 의 기본 object 는 미지의 키를 **strip** 한다. 그래서 relay 를 먼저 배포하지 않고 webapp 을 배포하면 필드가 무성 소실된다.
**피하는 법:** 배포 순서 **relay 먼저, webapp 나중**. 이 저장소에는 「배포는 relay 먼저·push 나중 — push 자체가 webapp 프로덕션 배포」라는 기록된 교훈이 이미 있다. 그리고 `order-handler` 조립 직전에 `pieceCount`/`krxSession` 을 로그에 남겨 소실을 관측 가능하게 한다.
**조기 경보:** 없음 — 그래서 위험하다. 로그를 심는 것이 유일한 방어.

### Pitfall 4: 낡은 `packages/shared/dist` 가 typecheck 를 통과시킨다
**무엇이 잘못되나:** `RelayOrderModifyMsg` 를 추가했는데 relay·webapp typecheck 가 그린이고, 런타임에 `undefined` 가 흐른다.
**왜:** 두 워크스페이스가 `@gh-radar/shared` 의 **`dist`** 를 본다 [VERIFIED: packages/shared/package.json:6-19 — `"types": "./dist/index.d.ts"`].
**피하는 법:** config `build_command` 가 이미 `pnpm --filter @gh-radar/shared build &&` 로 시작한다 — **이 명령을 잘라 쓰지 말 것.**

### Pitfall 5: 더티 액션 바(z-40 fixed)가 폰 공용 패널(z-20 sticky)을 덮는다
**무엇이 잘못되나:** 폰에서 카드 값을 고치면 하단 「미체결/잔고/로그」 접이식 바가 더티 바 밑으로 사라진다.
**왜:** 더티 바는 `fixed inset-x-0 bottom-0 z-40` 이고 body 포털이라 페이지 스태킹 컨텍스트 밖이다 [VERIFIED: dirty-action-bar.tsx:89-93]. 목업의 폰 공용 패널은 `sticky bottom:0; z-index:20` [VERIFIED: 18-workbench-mockup.html:562-563].
**피하는 법:** 폰 밴드에서 더티 바가 떠 있으면 공용 패널 바에 하단 여백(바 높이만큼)을 주거나, 공용 패널을 접힘 상태로 밀어내린다. **z-index 로 FAB 을 덮는 식의 해법은 금지**라는 선례가 있다 [VERIFIED: dirty-action-bar.tsx:48 — 「z-index 로 FAB 을 덮는 것은 해법이 아니다 — 덮으면 채팅 진입점이 조용히 사라진다」]. 카드가 N개이므로 이 충돌은 **폰에서 상시**다.
**조기 경보:** Playwright 실폭 프레임에서 공용 패널 탭 버튼의 `boundingBox()` 와 더티 바의 것이 겹치는지 단언.

### Pitfall 6: 돌파 행의 이탈 판정이 「무장/3초 유예」 없이 돌면 목록이 즉시 비는 듯 보인다
**무엇이 잘못되나:** 돌파 직후 들어온 낡은 체결 한 건으로 행이 사라졌다가 76 으로 다시 뜨는 깜빡임.
**왜:** §Pattern 1 인용의 조건 누락.
**피하는 법:** 행에 `armed`·`addedAt` 을 둔다.
**조기 경보:** 같은 ISIN 이 짧은 시간에 반복 추가·삭제되는 로그.

### Pitfall 7: 재접속 시 돌파 구독이 되살아나지 않는 두 번째 경로를 만들면 조용히 죽는다
**무엇이 잘못되나:** wss 재접속 후 카드 시세는 돌아오는데 돌파 행 가격만 멎는다.
**왜:** 재구독 트리거는 「세션의 `ready` 이벤트 **하나뿐**」이고 「재구독 경로를 두 벌 만들면 "재접속 후 새로고침해야 시세가 나온다" 증상이 생긴다」 [VERIFIED: relay/src/hub/subscription-hub.ts:34-36]. 브라우저 쪽도 `flushSubscriptions` 한 함수다 [VERIFIED: use-relay-socket.ts:734-752].
**피하는 법:** 돌파 훅이 자기 `ws.send({t:"sub"})` 를 만들지 않고 `subscribe()` 만 부른다(§Pattern 1 코드).

### Pitfall 8: VI 설정 2줄에서 `VI_EDIT_EXCHANGE` 를 남겨 두면 NXT 가 KRX 를 덮는다
**왜:** 현재 상수는 `'KRX'` 고정이고 캡션 문구에도 박혀 있다 [VERIFIED: webapp/src/components/trading/vi-settings-card.tsx:96 — `export const VI_EDIT_EXCHANGE: RelayExchange = 'KRX';`, :105 — `export const VI_SETTINGS_CAPTION = \`거래소별 1건 · ${VI_EDIT_EXCHANGE} 설정 편집 · NXT 는 다음 단계 · 주문가 = 상한가\`;`]. `RelayViSetMsg.exchange` 는 이미 optional 로 열려 있다 [VERIFIED: packages/shared/src/relay.ts:414-421 — 「**미지정 = `"KRX"`** 다 (D-06 · D-18)」].
**피하는 법:** 상수와 캡션을 함께 제거하고 줄마다 명시 송신. `grep -rn "VI_EDIT_EXCHANGE" webapp/src` 가 0건이 되는 것을 게이트로.

### Pitfall 9: 카드가 여럿이라 「이 카드의 에코인가」 상관이 깨질 수 있다
**왜:** 에코 상관은 `pendingRef`·`unacked`·`ackTimer`·`overwrittenRef` 를 **Surface 인스턴스별로** 들고 있다 [VERIFIED: limit-chaser-client.tsx:281-290]. 카드로 승격하면 인스턴스가 N개가 되는데, 서버 에코는 `limitChasers` 배열 전체로 온다.
**피하는 법:** 카드가 **자기 `key` 로만** 필터한다(`limit-chaser-client.tsx:252-258` 의 `find((c) => c.key === key)` 그대로). 작업대 상위에서 에코를 받아 카드에 분배하는 구조를 만들지 말 것 — 분배 로직이 상관의 두 번째 벌이 된다.

### Pitfall 10: `useIsinLabels` 가 매 렌더 새 Map 을 만들면 카드 N개가 전부 재렌더된다
**왜:** 훅은 `useMemo([accountStates, viOrders, limitChasers])` 다 [VERIFIED: webapp/src/lib/isin-labels.ts:54, 78]. 계좌 델타가 100ms 마다 오면 Map 이 매번 새로 만들어진다. 카드 1장일 때는 무해했다.
**피하는 법:** 카드는 `labels.get(isin)` 결과(문자열)만 prop 으로 받고, Map 자체를 카드 안에서 구독하지 않는다.

---

## Code Examples

### 예 1: 조건부 조각 수·세션 송신 (relay 조립기)
```typescript
// relay/src/dma/envelope.ts — buildDirectOrderReq 안, addOrgOrderNo 다음
// Source: 기존 :964-977 조립부 + fbs :169-184 주석
//
// ⚠️ **부재가 곧 기본값이다.** piece_count 0/미지정 = 1, krx_session "" / 부재 = 서버 자동
//    판정. 값이 없을 때 0/"" 을 명시적으로 실으면 구 서버 호환과 「바이트 무변경」이
//    깨진다 — 그래서 호출 자체를 건너뛴다.
if (req.pieceCount !== undefined && req.pieceCount > 1) {
  DirectOrderReq.addPieceCount(b, toWireUint(req.pieceCount, 'piece_count'));
}
if (krxSessionOffset !== null) {          // createString 은 테이블 열기 **전에** 했다
  DirectOrderReq.addKrxSession(b, krxSessionOffset);
}
```

### 예 2: 정정 분기 3갈래 (order-handler)
```typescript
// relay/src/ws/order-handler.ts — handle() 도입부 (현행 :758 의 2분기 확장)
// Source: 현행 `const isCancel = msg.t === "order.cancel";`
const kind: OrderType =
  msg.t === "order.cancel" ? "C" : msg.t === "order.modify" ? "M" : "N";
const needsOrg = kind === "C" || kind === "M";
const orgOrderNo = needsOrg ? msg.orgOrderNo : "";
if (needsOrg && orgOrderNo === "") {
  release(state, keys);
  reject(conn, msg.rid, kind === "M"
    ? "정정 주문에는 원주문번호가 필요합니다."
    : "취소 주문에는 원주문번호가 필요합니다.");
  return;
}
// side: 취소는 원주문 방향을 모르므로 "S" 로 적는 기존 규율 유지(:838-846 주석).
//       정정은 요청에 side 가 실려 오므로 그 값을 쓴다 — 취소와 다르다.
const side = kind === "C" ? "S" : msg.side;
```

### 예 3: 카드 컨테이너 + 포털 힌트 (webapp)
```tsx
// strategy-card.tsx
// Source: limit-chaser-client.tsx:542 의 @container/lc 선언을 여기로 옮긴 것
<article
  data-slot="strategy-card"
  className="@container/lc min-w-0 overflow-clip rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)]"
>
  <CardHeader … />
  {open && (
    <>
      <QuoteGrid10 quote={quote} />
      <div className="grid min-w-0 grid-cols-1 gap-[var(--s-2)] @min-[700px]/lc:grid-cols-[260px_minmax(0,1fr)] @min-[830px]/lc:grid-cols-[400px_minmax(0,1fr)] @min-[992px]/lc:grid-cols-[460px_minmax(0,1fr)]">
        <div className="min-w-0">
          <OrderbookLadder variant="chaser" quote={quote} depth={10} … />
          <TradeTape entries={tape} … />
        </div>
        <LimitChaserForm
          isin={isin} accountNo={accountNo} exchange={exchange} server={server}
          dirtyHint={`${stockName} · 「수정」을 눌러야 반영돼요`}  /* D-12 종목명 */
          …
        />
      </div>
    </>
  )}
</article>
```

### 예 4: SSR 안전 · KST 날짜 키 집합 (webapp)
```typescript
// webapp/src/lib/breakout-list.ts
// Source: webapp/src/lib/vi-alert.ts:137-158 의 가드 패턴을 그대로 따른다
type DatedSet = { d: string; ids: string[] };

function readDatedSet(key: string, today: string): ReadonlySet<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return new Set();
    const parsed = JSON.parse(raw) as DatedSet;
    // 날짜가 다르면 **빈 집합**이다 — 별도 리셋 타이머를 만들지 않는다(D-15).
    return parsed.d === today ? new Set(parsed.ids) : new Set();
  } catch {
    return new Set();   // 저장소 차단·깨진 JSON 은 「기억 없음」이다
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 화면당 relay 소켓(`useRelaySocket`) | 앱 전역 `RelayProvider` + `useRelaySubscription` | Phase 16 (D-22) | 작업대에서 카드 N개가 소켓 1개를 공유한다 — 이 phase 가 가능한 전제 |
| `POST /api/orders` (server 경유) | 브라우저 → relay wss 직접 (`sendOrder`) | Phase 16 (D-02, `order-api.ts` 이식) | 정정 추가가 server 무관 — relay 만 건드린다 |
| 뷰포트 브레이크포인트 반응형 | 본문 폭 컨테이너 쿼리 4밴드 | quick-260912-k2x | 카드 폭 기준 전환이 자연스럽다(이름만 이동) |
| VI 단일 전략 | 거래소별 VI 슬롯(KRX/NXT) | Phase 17 (D-06/D-18) | `viTriggers{KRX?,NXT?}` 가 이미 있어 2줄이 데이터 변경 없이 된다 |
| 76/77/78 파싱만(UI 0) | 이 phase 가 첫 소비처 | Phase 17 → 18 | 리듀서·캐시가 이미 있다 |

**Deprecated/outdated:**
- `VI_EDIT_EXCHANGE`(`vi-settings-card.tsx:96`) — D-05 가 폐기를 명시.
- `NAV_LIMIT_CHASER`·`NAV_VI`(`app-sidebar.tsx:88-94`) — D-03 이 제거.
- `vi-client.tsx`(662줄) — 페이지 셸이 사라진다.
- `order-panel.tsx` 의 비율 버튼·가격 ± — D-20 이 제거(단, 「매수 비율 버튼 없음」은 이미 기존 결정 [CITED: 18-orderbook-tab-mockup.html 설계 메모 — 「매수 비율 버튼 없음(order-panel.tsx ⑥)은 그대로」]).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | gh-trade 게이트웨이의 세션당 시세 구독 수 상한이 **확인되지 않았다**(존재 여부 자체 미확인) | Pattern 1 | 상한이 낮으면 돌파 40종목 구독이 카드 구독을 밀어낸다 → 카드 시세가 멎는다. **자율 상한 + 카드 우선순위**가 이 위험의 완화책 |
| A2 | `MAX_BREAKOUT_SUBS = 40` 은 근거 있는 실측이 아니라 보수 선택 | Pattern 1 | 너무 낮으면 이탈 삭제가 안 되는 행이 늘고, 너무 높으면 A1 위험 |
| A3 | `AudioContext.state === 'suspended'` 로 자동재생 차단을 판정한다 | Standard Stack | 브라우저별 차이가 있으면 「클릭해 활성화」 표시가 부정확 |
| A4 | Postgres CHECK 제약 이름이 `dma_orders_order_type_check`·`dma_orders_price_check` | 표 C-2 마이그레이션 | 이름이 다르면 `DROP CONSTRAINT` 가 실패. **실행 전 조회 단계 필수** |
| A5 | Radix Dialog 가 기본으로 `Portal` 을 써서 containment 를 벗어난다 | D-25 팝업 | 아니면 팝업이 카드 안에 갇혀 잘린다. 목업 메모가 포털을 요구하므로 명시 포털로 감싸는 것이 안전 |
| A6 | `dupKey` 를 `M|orgOrderNo|price|qty` 로 두는 것이 옳다 | 표 C-1 | 너무 느슨하면 같은 정정이 두 번 나갈 수 있고, 너무 빡빡하면 가격 추적 정정이 5초 막힌다 |
| A7 | 78 스냅샷 행은 알림음·강조 없이 「오늘 울린 종목」 집합에만 기록한다 | 돌파 규칙 대조 | CONTEXT 에 없는 규칙이라 사용자 확인이 필요할 수 있다(정본에는 명시돼 있다) |
| A8 | 돌파 목록 구독 거래소는 `"KRX"` 고정 | Pattern 1 | 서버가 NXT 돌파를 보내기 시작하면 그 행의 현재가가 멎는다 |

---

## Open Questions

### O-1 (~~Blocking~~ **→ 해결 2026-09-21: 사용자 결정 = 권고안(relay `name`/`code` 보강) 채택, CONTEXT D-30 으로 기록**) 돌파 항목의 종목명·단축코드가 계약에 없다
- **아는 것:** `RelayRateCrossItem` = `isin·exchange·lastPrice·changeRate·thresholdPct·basePrice·exchangeTime·serverTime` 8필드뿐 [VERIFIED: packages/shared/src/relay.ts:907-921]. `useIsinLabels` 의 원천 3종(계좌 hold/unf · viOrders · limitChasers)에 돌파가 없다 [VERIFIED: webapp/src/lib/isin-labels.ts:64-74]. 웹앱에 ISIN→코드 조회 API 가 없다(검색은 `?q=` 로 코드/이름을 찾고 isin 을 **반환**한다 [VERIFIED: webapp/src/lib/stock-api.ts:30-33]).
- **불확실한 것:** 목업의 돌파 칩은 종목명을, 표는 종목명+코드를 그린다. 클릭으로 만든 카드의 ⓘ 팝업은 **단축코드 키**로 종목상세를 조회한다.
- **권고:** relay 가 팬아웃 직전에 `symbols.lookup(item.isin)` 으로 `name`/`code` 를 채운다. 선례가 셋 있다 — `RelayUnfilled.name/code`(`#enrichNames`, `subscription-hub.ts:1149-1170`) · `RelayViOrderItem.name`(`relay.ts:895`) · `RelayLimitChaser.name/code`. 변경량은 shared 에 optional 2필드 + hub 2메서드(`#onRateCrossAlert:847`, `#onRateCrossSnapshot:867`)에 decorate 한 줄씩. **그러나 이것은 D-11 의 「새 계약은 셋뿐」을 넷으로 만드는 결정**이므로 플래너가 `checkpoint:human-verify` 로 확인하거나, 최소한 계획에 명시적으로 기록해야 한다.
- **대안(비권장):** 웹앱이 `/api/stocks/search` 를 ISIN 으로 호출 — 검색 API 가 ISIN 질의를 지원하는지 미확인이고, 돌파 200행에 대해 O(N) 호출이 된다.

### O-2 (비차단) 공용 패널의 계좌 축
- **아는 것:** D-13 은 「전 종목 합산(종목 열)」이라고만 말한다. `AccountPanel` 은 계좌 1개 단위이고 `code` 를 주지 않으면 「계좌 전용 모드」로 그린다 [VERIFIED: webapp/src/components/orderbook/account-panel.tsx:154-158]. 상태줄에 계좌가 있다(D-04/D-05).
- **권고:** 상태줄에서 고른 **단일 계좌**의 `AccountPanel`(계좌 전용 모드 + `stack` 고려)을 쓰고, 행 선택용 optional prop `onSelectUnfilled?(row: RelayUnfilled)` 를 추가한다. 다계좌 합산은 `/me` 가 이미 담당하므로(MYPAGE-01) 여기서 새로 만들지 않는다.

### O-3 (비차단) VI 「마감알림」 로컬 설정의 거취 (D-05 재량)
- **아는 것:** `vi-settings-card.tsx` 가 `AlertSwitch`(:763)로 소유하고, 로직은 `vi-alert.ts` 에 분리돼 있다(`readViAlertEnabled`/`writeViAlertEnabled`/`requestViAlertPermission`/`notifyViEnd`). VI 줄에서는 빠진다(D-05).
- **권고:** **상태줄로 옮긴다**(제거하지 않는다). 알림음 토글(D-17)과 나란히 서면 「이 기기 전용 알림 2종」이 한 자리에 모여 의미가 맞고, `vi-alert.ts` 의 권한 거부 사유 문구 경로(:161-186)가 그대로 산다. 제거하면 VI 해제 10초 전 알림이라는 기능이 사라진다.

### O-4 (비차단) 카드에서 고르는 계좌
- **아는 것:** 전략 키는 `ISIN:계좌:거래소` 이고 현재 화면은 카드(=Surface)마다 계좌 셀렉터를 갖는다(`limit-chaser-client.tsx:230-237`). D-04/D-05 는 계좌를 **상태줄** 공용으로 올린다.
- **권고:** 상태줄 계좌가 **신규 카드의 기본값**이고, 이미 등록된 전략 카드는 자기 키의 계좌를 유지한다(키의 일부라 바꿀 수 없다 — D-10 의 거래소와 같은 논리). 상태줄 계좌를 바꿔도 기존 카드는 움직이지 않는다는 것을 UI 가 말해야 한다.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pnpm workspace (shared/relay/webapp) | 전 게이트 | ✓ | — | — |
| Node | relay | ✓ (요구 `>=22`) | `relay/package.json:7` | — |
| Playwright | e2e (D-29) | ✓ | `^1.59.1` (`webapp/package.json:39`) | — |
| vitest | 단위 | ✓ | webapp `vitest.config.ts:15-18`(jsdom, `src/**/*.test.{ts,tsx}`) · relay `vitest run` | — |
| Supabase CLI / 마이그레이션 경로 | 표 C-2 | ✓ (`supabase/migrations/` 35+ 파일) | — | — |
| flatc | — | **불필요** | 생성 코드에 `addPieceCount`/`addKrxSession` 이미 존재 | — |
| 실 DMA 게이트웨이 | 정정 실왕복 검증 | ✗ (장 시간 08:00~20:00 KST · VPN·터널 필요) | — | mock/stub 게이트웨이로 프레임 왕복 단언 (`relay/src/dma/__tests__/envelope.test.ts` 패턴) |

**Missing dependencies with no fallback:** 없음.
**Missing dependencies with fallback:** 실 게이트웨이 정정 왕복 — Phase 17 D-25 와 같은 성격의 **실기 관측 이연 항목**이 된다(STATE.md 「Next」 참조). 자동 게이트로는 닫히지 않으므로 계획이 UAT 항목으로 명시해야 한다.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| 단위 (webapp) | vitest + jsdom + RTL — `webapp/vitest.config.ts:15-18`, include `src/**/*.test.{ts,tsx}`, setup `./tests/setup.ts` |
| 단위 (relay) | vitest — `relay/package.json:20` (`vitest run`) |
| 단위 (shared) | vitest (`packages/shared`) |
| e2e | Playwright — `webapp/playwright.config.ts:82` testDir `./e2e/specs`, webServer `PORT=3100 pnpm dev`(:131-132), relay 는 **spec 단위 픽스처**가 포트 8090 으로 띄운다(:71-75) |
| Config file | `webapp/vitest.config.ts` · `webapp/playwright.config.ts` · `relay/vitest` 기본 |
| Quick run (타입) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck` |
| Full suite | `pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test` |
| e2e | `pnpm --filter @gh-radar/webapp run test:e2e` |

⚠️ **함정:** `build_command` 의 첫 항(`shared build`)을 생략하면 낡은 `packages/shared/dist` 때문에 **typecheck 가 통과한다**(§Pitfall 4). 이 순서는 장식이 아니라 게이트다.

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| TRADE-06 | 이탈 판정(임계−2%p · 무장/3초 유예) · KST 날짜 키 집합 · 하루 1회 | unit | `pnpm --filter @gh-radar/webapp run test -- breakout-list` | ❌ Wave 0 (`src/lib/__tests__/breakout-list.test.ts`) |
| TRADE-06 | 76 upsert / 78 전량 교체가 화면 목록에 반영 | unit(RTL) | `… test -- breakout-strip` | ❌ Wave 0 |
| TRADE-06 | 돌파 행 구독/해제가 `subscribe`/`unsubscribe` 호출로 나간다 | unit(RTL, 모킹) | `… test -- use-breakout-quotes` | ❌ Wave 0 |
| TRADE-06 | 칩 클릭 → 카드 추가 → 행 「거래중」 | e2e | `pnpm --filter @gh-radar/webapp run test:e2e -- trading-workbench` | ❌ Wave 0 |
| TRADE-07 | `order.modify` 프레임 → `DirectOrderReq(order_type "M", org_order_no)` 왕복 | unit(relay) | `pnpm --filter @gh-radar/relay run test -- envelope` | ✅ 확장 (`relay/src/dma/__tests__/envelope.test.ts`) |
| TRADE-07 | zod 가 `order.modify` 를 받고 `orgOrderNo` 없으면 거부 | unit(relay) | `… run test -- protocol` | ❌ Wave 0 (relay/src/ws/__tests__ 디렉터리 자체가 없다 — 실측) |
| TRADE-07 | `pieceCount>1` 일 때만 슬롯이 실린다 / `krxSession` 빈 값이면 미송신 | unit(relay) | `… run test -- envelope` | ✅ 확장 |
| TRADE-07 | `price 0` 은 `krxSession` G2/G3 일 때만 통과 | unit(relay + webapp) | `… run test -- envelope` / `… test -- relay-provider` | ✅ 확장 |
| TRADE-07 | 77 → 라벨/조각입력/확인문구 매핑 5경우 | unit | `… test -- queued-window` | ❌ Wave 0 |
| TRADE-07 | 미체결 행 선택 → 정정/취소 활성 · G2/G3·Q-ID 행은 정정 잠김 | unit(RTL) | `… test -- manual-order-form` | ❌ Wave 0 |
| TRADE-08 | `vi.set` 에 줄의 거래소가 실린다(KRX/NXT 각각) | unit(RTL) | `… test -- vi-settings-rows` | ❌ Wave 0 |
| TRADE-08 | 확인 체크 활성 규칙(기존 `isConfirmable`) 불변 | unit | `… test -- vi-order-list` | ✅ 기존 |
| TRADE-09 | 카드 폭 4밴드 × 격자 1/2/3단 잘림 0 | e2e | `… test:e2e -- trading-workbench` | ❌ Wave 0 (`trading-limit-chaser.spec.ts` 케이스 9·11·12·13 패턴 이식) |
| TRADE-09 | `/trading/limit-chaser/*`·`/trading/vi` → 리다이렉트 | e2e | `… test:e2e -- trading-workbench` | ❌ Wave 0 |
| TRADE-09 | 사이드바 「트레이딩」 제목 링크 + 3단(KRX VI·NXT VI·상따) | e2e | `… test:e2e -- sidebar-tree` | ✅ 재작성 |
| TRADE-09 | a11y 위반 0 (`/trading`) | e2e | `… test:e2e -- a11y` | ✅ 케이스 교체 (`a11y.spec.ts:323`) |
| 전체 | 낡은 dist 함정 회피 | build gate | config `build_command` 전문 | ✅ |

### Sampling Rate
- **Per task commit:** `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` (계약 태스크는 relay typecheck 까지)
- **Per wave merge:** config `build_command` 전문 + `test_command` 전문
- **Phase gate:** 위 둘 + `pnpm --filter @gh-radar/webapp run test:e2e` 전량 green 후 `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `supabase/migrations/2026MMDD_dma_orders_modify_offhours.sql` — 표 C-2 (TRADE-07 의 **선행 조건**)
- [ ] `relay/src/ws/__tests__/protocol.test.ts` — 디렉터리 자체가 없다(실측). `order.modify` zod 검증
- [ ] `webapp/src/lib/__tests__/breakout-list.test.ts` — 이탈/집합/날짜 키
- [ ] `webapp/src/lib/__tests__/queued-window.test.ts` — 77 매핑 5경우
- [ ] `webapp/src/lib/__tests__/use-breakout-quotes.test.tsx` — 구독 diff
- [ ] `webapp/e2e/specs/trading-workbench.spec.ts` — 신설(기존 `trading-limit-chaser.spec.ts` 케이스 9·11·12·13 이식 + 리다이렉트 + 격자 단 수)
- [ ] `webapp/e2e/specs/trading-limit-chaser.spec.ts`·`trading-vi.spec.ts` — 삭제 또는 workbench 로 흡수 결정 필요
- [ ] 프레임워크 설치: **없음** (전부 설치돼 있다)

---

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | 변경 없음 — relay wss 첫 프레임 `{t:"auth"}` Supabase 토큰 검증 + `dma_credentials` allowlist (Phase 15 RELAY-01). 이 phase 는 새 인증 표면을 만들지 않는다 |
| V3 Session Management | yes | 변경 없음 — DMA 세션은 사용자별, 구독 키에 `userId` 가 들어간다 [VERIFIED: relay/src/hub/subscription-hub.ts:8-10 D-13 — 「전역 키를 쓰면 A 사용자의 해제가 B 세션의 구독을 끊는다」] |
| V4 Access Control | **yes — 정정이 새 IDOR 표면** | 계좌 대조는 `session.allowedAccounts` 하나뿐이다 [VERIFIED: relay/src/ws/order-handler.ts:795-802 — 「원천은 `session.allowedAccounts` 뿐이다. 인바운드 바디를 근거로 삼으면 IDOR 이다」]. **`order.modify` 도 반드시 같은 게이트를 통과해야 한다** — 게이트 ②를 건너뛰는 분기를 만들면 타인 계좌 주문번호로 정정이 나간다. ⚠️ `orgOrderNo` 자체는 **소유권 검증 대상이 아니다**(게이트웨이가 원주문 메타로 판정) — 하지만 relay 가 남의 주문번호를 그대로 흘리는 것이 맞는지는 기존 취소 경로와 동일한 판단이므로 **취소와 같은 처리**를 유지한다(새 정책을 만들지 않는다) |
| V5 Input Validation | yes | `RelayInboundSchema` zod 한 곳 [VERIFIED: relay/src/ws/protocol.ts:298-301]. 정정 스키마를 **같은 유니온에** 넣는다. `krxSession` 은 `z.enum(["G2","G3"])` 로 좁힌다(fbs: 「그 외 값은 브로커에 닿기 전에 즉시 거부」). `pieceCount` 는 `z.number().int().min(1).max(64)`(fbs: 허용 1..64) |
| V6 Cryptography | no | 이 phase 는 암호 경로를 건드리지 않는다 |
| V7 Error Handling / Logging | yes | 무로그 fail-safe 금지(PC-7)가 이미 규율. 새 경로(정정 거부·구독 상한 초과·알림음 차단)도 전부 사유를 남긴다. **계좌번호는 로그에 마스킹**(`maskAccountNo`, `order-handler.ts:766`) |
| V13 API | yes | 새 HTTP 엔드포인트 없음 — 전부 기존 wss 프레임 |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 타인 계좌로 정정 발주 | Elevation of Privilege / IDOR | 게이트 ② `session.allowedAccounts` 대조를 **3분기 전부**가 통과 (T-16-01) |
| 중복 정정 → 이중 정정 | Tampering | `dupKey` 사용자 스코프 가드 (표 C-1 권장 형태) |
| 「결과 모름」을 「실패」로 표시 → 재주문 중복 체결 | — (사용자 안전) | `status:"timeout"` 문구는 재시도를 유도하지 않는다 [VERIFIED: order-handler.ts:915-930] |
| 감사 기록 없는 실주문 | Repudiation | insert 선행 + 실패 시 미송신 (Pitfall 1 이 이 방어의 부작용) |
| localStorage 에 민감정보 | Information Disclosure | 돌파 집합에 **ISIN 만** 저장. 계좌번호·금액·주문번호 금지 (`vi-alert.ts:11-13` 선례) |
| 알림 본문에 계좌·금액 | Information Disclosure | 「본문에는 종목명만 싣는다. 계좌번호·금액은 알림 센터에 남아 잠금화면에도 뜨므로 싣지 않는다(T-16-09)」 [VERIFIED: webapp/src/lib/vi-alert.ts:188-191] — 알림음 경로에도 같은 규율 |
| 다른 종목 호가로 주문 | Tampering | `useRelaySubscription` 의 자기 키 필터 (T-15-40 / T-16-02). **카드 N개에서 이 필터가 카드별로 유지돼야 한다** |

---

## Project Constraints (from CLAUDE.md)

| 지시 | 이 phase 에서의 적용 |
|------|---------------------|
| **상따 화면 반응형의 정본은 `globals.css` §2.2b 주석. 여기에 표를 복사하지 마라 — 표가 둘이 되면 갈라진다** | Pattern 2 가 표를 복사하지 않는 해법(컨테이너 이름 이동)을 택한 이유. UI-SPEC·PLAN·코드 주석 어디에도 숫자 표를 다시 적지 않는다 |
| 앱 셸·사이드바는 뷰포트 브레이크포인트 | 목업의 `@container vp` 는 목업 편의. 프로덕션 `app-shell.tsx`/`app-header.tsx` 는 무변경 |
| 커밋 메시지 한글 · Co-Authored-By 넣지 않기(사용자 전역 규칙) | 계획의 커밋 태스크에 반영 |
| 모든 작업은 GSD 명령으로 시작 | 이 phase 는 `/gsd-plan-phase` → `/gsd-execute-phase` 경로 |
| 크롤링 5원칙 / 공식 API 운영 기준 | **해당 없음** — 이 phase 는 외부 수집 경로를 건드리지 않는다 |
| 배포는 relay 먼저·push 나중 (기록된 교훈) | §Pitfall 3 의 배포 순서와 같은 결론 |

---

## Sources

### Primary (HIGH confidence — 이번 세션에 `Read`/`grep` 으로 원문 확인)
- `packages/shared/src/relay.ts` — :396, :414-421, :482-492, :500-510, :513-523, :677-726, :907-921, :925, :933, :952-966, :1032, :1041
- `relay/src/dma/envelope.ts` — :827, :857-862, :890-984, :1426-1560
- `relay/src/generated/StockDMA.fbs` — :150-186
- `relay/src/generated/stock-dma/direct-order-req.ts` — :91, :96, :147, :151
- `relay/src/ws/protocol.ts` — :252-301
- `relay/src/ws/order-handler.ts` — :218-256, :740-960
- `relay/src/hub/subscription-hub.ts` — :1-48, :107-113, :214, :274, :344, :405-460, :835-878, :1140-1170
- `relay/src/store/orders.ts` — :195-250
- `relay/src/store/symbols.ts` — :50-71, :185-215
- `supabase/migrations/20260905120200_dma_orders.sql` — :1-30, :50-75
- `webapp/src/lib/relay-provider.tsx` — :78-100, :100-270, :290-348
- `webapp/src/lib/use-relay-socket.ts` — :190-336, :705-760, :960-1078
- `webapp/src/lib/isin-labels.ts` — :51-79
- `webapp/src/lib/vi-alert.ts` — 전문
- `webapp/src/lib/limit-chaser.ts` — export 목록
- `webapp/src/lib/stock-api.ts` — :30-47
- `webapp/src/styles/globals.css` — :143-240 (§2.2b 전문)
- `webapp/src/components/trading/limit-chaser-client.tsx` — :117-300, :532-545, :979-1330, :1607
- `webapp/src/components/trading/limit-chaser-form.tsx` — :255-310, :983-1120, :1040-1058
- `webapp/src/components/trading/dirty-action-bar.tsx` — 전문
- `webapp/src/components/trading/vi-settings-card.tsx` · `vi-order-list.tsx` — export 목록
- `webapp/src/components/orderbook/orderbook-ladder.tsx` — :40-110, :878-1080
- `webapp/src/components/orderbook/order-confirm-dialog.tsx` — :45-110
- `webapp/src/components/orderbook/account-panel.tsx` — :136-181
- `webapp/src/components/layout/app-sidebar.tsx` — :19-101, :163-360
- `webapp/src/components/stock/stock-detail-tabs.tsx` — :13-60
- `webapp/src/components/chat/chat-fab.tsx` — :1-60
- `webapp/src/app/trading/**/page.tsx` — 4파일 전문
- `webapp/package.json` · `relay/package.json` · `packages/shared/package.json` · `webapp/vitest.config.ts` · `webapp/playwright.config.ts`
- `scripts/smoke-relay.sh` — :320-430
- `.planning/phases/18-gh-trade-ui-nxt-vi/18-workbench-mockup.html` — :230-600, :755-770
- `.planning/phases/18-gh-trade-ui-nxt-vi/18-orderbook-tab-mockup.html` — :234-480, :721-726
- `/Users/alex/repos/gh-trade/docs/features/rate-cross-alert.md` — 전문
- `/Users/alex/repos/gh-trade/docs/features/queued-order.md` — §예약구간
- `/Users/alex/repos/gh-trade/docs/features/preopen-offhours-order.md` — §클라는 표시만 한다

### Secondary (MEDIUM confidence)
- `.planning/phases/18-gh-trade-ui-nxt-vi/18-CONTEXT.md` — 결정 원문
- `.planning/REQUIREMENTS.md` — TRADE-06~09 (:102-105)
- `.planning/STATE.md` — Session Continuity · 이월 항목

### Tertiary (LOW confidence — 이번 세션에 검증하지 않음)
- 브라우저 autoplay 정책 / `AudioContext.state` 동작 (A3)
- Radix Dialog 기본 Portal 동작 (A5)
- Postgres 기본 제약 명명 규칙 (A4)
- gh-trade 게이트웨이 구독 상한 — **관측 자체가 없음** (A1)

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — 새 패키지 0. 모든 버전을 `package.json` 실측
- Architecture (컨테이너 이관 · 카드 슬라이스): **HIGH** — 컨테이너 선언·소비 지점을 grep 으로 전수
- 주문 계약 확장: **HIGH** — 7개 변경 지점과 4겹 price 가드를 파일:라인으로 확인. 제약 **이름**만 ASSUMED(A4)
- 돌파 규칙: **HIGH** (gh-trade 정본 인용) — 단, 종목명/코드 공백은 **미해결**(O-1)
- 구독 상한: **LOW** — 관측 없음(A1/A2). 자율 상한으로 위험 완화
- 알림음: **MEDIUM** — API 는 표준, 차단 감지 방식만 ASSUMED(A3)
- Pitfalls: **HIGH** — 대부분 코드 주석에 기록된 기존 사고 이력에서 도출

**Research date:** 2026-09-21
**Valid until:** 2026-10-21 (30일 — 내부 코드베이스 기반이라 안정적. 단 relay·shared 계약이 다른 세션에서 바뀌면 즉시 재확인)
