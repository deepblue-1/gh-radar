# Phase 27: 자동매도 연동 — gh-trade Phase 28 와이어 계약 반영 - Context

**Gathered:** 2026-10-05
**Status:** Ready for planning

<domain>
## Phase Boundary

gh-trade Phase 28 자동매도(체결매도)가 **KB 120 실서버에서 이미 내보내는 와이어**(인박스 `docs/inbox/from-gh-trade/261004-auto-sell-wire.md` · HANDOFF §4-1 v0.2 · fbs blob `68679e9a`)를 gh-radar 가 받아서 **보여 주고 조작**할 수 있게 한다. 다섯 묶음이다.

1. **relay 생성물 동기화** — gh-trade master(65caaf2e)에서 `sync-relay-schema.sh RELAY=` (SYNC MARKER `26b3493e` → master, 신규/변경 .ts 12 · 삭제 0). Phase 27(gh-trade) 의 85 `LimitFeature`·슬롯 90·kind 15 는 생성물에 같이 실리되 **중계·표시는 범위 밖**.
2. **relay 중계** — `lcBuy3SchemaOf` 4번째 분기(schema 4 = 자동매도 요청 4필드 동반) · S→C 전용 에코 4필드(vtable 148~154 `auto_sell_state/sold_qty/basis/basis_price`)를 서버전용 필드 목록에 · 84 `UserSettingsResp` 사용자별 캐시 + 브라우저 인증 때 재전송(77 패턴) · 41 `AutoSellCommandReq`(Start 1/Stop 2) · 42 `SetUserSettingsReq`(11값 전체 교체) · 43 `GetUserSettingsReq`(`#onReady`) 중계 · 54 ERROR `src="AutoSellCommand"` 통과.
3. **shared 문장 조립기** — kind 11 Triggered · 12 Modified · 13 State · 14 Pause / group 9 AutoSell 칸 재해석(HANDOFF §4-1 v0.2 표) + CancelReason 10·11 라벨.
4. **webapp** — 상따 카드 자동매도 칸(요청 4 + 에코 4) · 바로시작/중지(41) · 카드 「미반영」 해제에 `src="AutoSellCommand"` 분기 · `/me` 사용자 설정 섹션(42/84) · 주문로그 라벨·필터·출처 배지.
5. **배포** relay → webapp(push) 순, 인박스 노트 `status: done` + `done_commit` 경로 지정 커밋.

**분담:** gh-trade = 서버·와이어·WinForms(완료, 120 가동 중 · 127 미배포). gh-radar = relay·shared·webapp 전부. 웹 표시 정본은 gh-radar.

</domain>

<decisions>
## Implementation Decisions

### 이미 확정된 것 (ROADMAP · 인박스 · HANDOFF · 메모리 2026-10-04 합의 — 다시 묻지 않는다)
- **와이어 전부**: MsgType 41/42/43/84 · Envelope 슬롯 86/88 · `SetLimitChaser` 말미 8필드(140~146 양방향 · 148~154 S→C 전용) · `UserSettings` 12필드(금액 3칸 **만원**, `present` 는 84 전용) · `AutoSellCommandReq{isin, account_no, exchange, action}` · `StrategyEventKind` 11~14(9 비움 유지) · `OrderGroup::AutoSell = 9` · `CancelReason` 10 `AutoSellBuyFirst` · 11 `AutoSellAuctionTrim`(신규 값) · reason_code 13종(첫 토큰 `AutoSell`) · `ServerMessage.source` `"AutoSell"`(54 INFO) / `"AutoSellCommand"`(41 실패 54 ERROR, isin 동반) / `"SetUserSettings"`(42 거부).
- **relay**: `buy3_schema` 는 값이 아니라 **필드 존재** 단조 파생 — 자동매도 요청 4필드 + 하위 스키마 필드가 모두 있을 때만 4(옛 탭은 1~3 그대로). 에코 전용 4필드는 `buildSetLimitChaserReq` 서버전용 목록에(웹이 되돌려 보내지 않음). 84 는 hub **사용자별 캐시**(77 `QueuedWindowState` 패턴 — 캐시 + isReady 때만 fanout + 인증 후 스냅 재생), 43 은 `#onReady` 스냅샷 요청 옆. 42 뒤 같은 dma_user_id 전 세션 84 브로드캐스트는 **서버가** 한다. 사용자 세션으로 오는 82 는 종전대로 무시(전략 이벤트는 관찰자 저널 80 만 정본).
- **인박스 질문 3 답**: Q1 금액 만원 = 예(웹 lc-fields 가 이미 만원). Q2 `present=false` 면 **이전 없이** 내장 기본값 표시, 사용자가 저장할 때만 42. Q3 CancelReason 10 「매수 우선 취소」 · 11 「동시호가 감축」(이번 discuss 에서 확정, 아래 D-16).
- **조립기 규약**: reason_code 는 **첫 공백까지 잘라 정확 일치** 조회(모르는 토큰은 지어내지 않고 D-10 폴백 = 원문 kind 표시). kind 6 group 9 는 `AutoSellAsk1/Bid1`(주기 매도)과 `AutoSellAuctionOrder`(장전 동시호가 회차)를 reason_code 로 분기 — AuctionOrder 는 ev_kind Quote 라도 기존 「근거 호가(잔량 a→b)」 조각을 쓰면 오독이므로 **전용 근거 조각**(회차 N · 예상체결가 · 예상체결량 · 회차 전/후 보관 수량). group 7↔9 가 뒤바뀔 수 있으니(WR-05) group 만 믿지 말고 `AutoSell` 토큰도 함께 판정. `ev_qty_before/after`·`reason_code` 의 group 9 의미는 **group 9 일 때만**. kind 12 `order_no` = 원주문 번호(타임라인 묶음 키), `message` = 새 번호 숫자만.
- **카드 「미반영」 해제 키** = 54 ERROR `src="AutoSellCommand"`(`isLimitChaserRejection` 동형 분기 신설). 54 INFO `src="AutoSell"` 은 사유 줄만, 해제 대상 아님.
- **킬 스위치(`DisableStrategiesReq`)·단일 행 비활성화가 자동매도도 끈다** — 60 에코 `auto_sell_enabled=false` 를 그대로 그린다(CR-01). 15:40 정리 사본은 41 을 되돌리지 않는다(WR-07).
- **UI 는 HTML 목업 먼저** — 이 discuss 에서 2장 채택(아래 canonical_refs). 별도 UI-SPEC 은 만들지 않는다(Phase 26 D-14 선례).
- **배포**: gh-trade 서버는 이미 가동 중. gh-radar 안에서는 **relay 먼저 → 검증 → push**(push 가 곧 webapp 프로덕션 배포 · 옛 relay 는 브라우저의 모르는 `t` 에 소켓을 닫는다). 장 시간(08:00~20:00 KST) 밖 배포 창. 인박스 노트 `status: done` + `done_commit` 채워 경로 지정 커밋.

### 서버 계약에서 따라오는 것 (HANDOFF · `limit-chaser.md` §6-6/§9-3 — 결정이 아니라 수용 사실)
- 자동매도 상태 0 없음 · 1 대기 · 2 감시 · 3 매도중 · 4 완료. 기준 종류 1 상한가 · 2 매수가(0 미정). 방법 와이어 1 매도1호가 · 2 매수1호가 · 3 양쪽(화면 이름 「양쪽 / 매도1호가 / 매수1호가」 — 콤보 순서도 이 순서, 28-12 VM 검토 4차). 시작조건 0~9(0 = 이탈 관측 뒤 다음 체결).
- 서버 `IsActive()` 에 `IsAutoSellActive()` 가 들어 있고 삭제 정규화도 자동매도만 켠 등록을 지우지 않는다 → 웹 `isActiveStrategy`(켜진 전략 기준 · 작업대 카드 접힘 등)와 `lc.set` 삭제(`crud D`) 판정에 **`autoSellEnabled` 를 포함**한다(WinForms `AnyArmed` 동형).
- 바로시작(41 Start)은 kind 11 을 내지 않는다 — kind 13(원인 Command) + 54 INFO `자동매도 <이전> → 매도중 (바로시작)`. Stop = 체크 OFF(미체결 유지).
- 42 = **11값 전체 교체**, 범위 밖 하나면 요청 전체 거부(54 ERROR `src="SetUserSettings"`, 첫 위반 문구 1개 예 `매도 주기는 1~60초여야 합니다(받은 값 99)`). 84 = 로그인 직후 77 바로 뒤 1프레임 · 43 응답 · 42 성공 뒤 같은 키 전 세션 브로드캐스트. 키 = 로그인 id 앞 8바이트.
- 41 실패 문구 표(§9-3) · 60 자동매도 거부 문구(§9-3 ②③)는 **서버 원문 그대로** 전략 로그(Phase 24 D-13 「서버가 말하는 것을 다시 말하지 않는다」).

### ① 상따 카드 자동매도 칸 (목업 `reference/mockup-auto-sell-card.html` 채택 2026-10-05)
- **D-01: 매도 pane 에 별도 그룹 카드 「자동매도」.** `LC_SELL_GROUPS` 에 slot `'auto-sell'` 추가 — 매도주문 · 매수취소 아래 **세 번째 카드**. 제목줄 스위치 = `☐자동매도`(`autoSellEnabled`), 제목줄 클릭 = 접기, 접힘 요약 · 폰 시트 · 데스크톱 인라인 편집은 기존 `SettingGroup` 문법 그대로(Phase 24 카드 구조 D). 매도주문 `dimGate` 와 독립(자동매도는 매도 체크 없이도 켜진다). — **Reversibility:** costly — `lc-fields.ts` 그룹 정의 · 요약 빌더 · e2e 앵커 `lc-group-auto-sell` · 테스트 픽스처가 함께 바뀐다.
- **D-02: 본문 행 = 시작조건 · 비율 · 방법 + 읽기 전용 2행 + 버튼 행.** 시작조건(0~9, **0 은 의미어 「이탈 후 다음 체결」**, 그 외 「N%」) · 비율(1~50 %) · **방법은 3택 행**(폰 = 3옵션 시트 · 데스크톱 = 인라인 세그먼트, 새 `LcRowSpec` kind 필요 — 기존 행은 숫자만). 읽기 전용 `derived` 행(발동잔량 패턴) 「누적 매도 N주」(0 이면 「—」, >0 이면 빨강) · 「기준 {상한가|매수가} N원」(상태 0 또는 기준 0 이면 「—」). 마지막 행 = 버튼 2개(D-05). 접힘 요약 = 시작조건 · 비율 · 방법 · 누적 · 기준(같은 의미어).
- **D-03: 제목줄 상태 칩 「대기 / 감시 / 매도중 / 완료」** — `auto_sell_state` 1~4, 0 이면 칩 없음. 색: 대기 중립 · 감시 green(live) · 매도중 amber(hold) · 완료 blue. 41 전송 중에는 칩이 「바로시작 전송… / 중지 전송…」(점선 테두리 pend). 후매수 「감시 중 · 보유중 · 소진」 칩 동형.
- **D-04: 헤더 LED 4번째 「자동」 추가.** `LED_KINDS` 에 `'autoSell'` — OFF 회색 / 대기 · 감시 초록(`--led-armed`) / 매도중 주황(`--led-latent`) / 완료 파랑(`--blue` 계열, 새 토큰 없음). **클릭 불가**(매수 LED 동형). 접힌 카드 요약 점에도 같은 판정 하나(`latchLedStateOf` 확장). 760 미만 밴드 둘째 줄 폭은 구현 때 실측(4칩이 줄바꿈되면 칩 문구를 줄이는 쪽, 칩 삭제 아님).
- **D-05: 바로시작 · 중지 버튼은 자동매도 카드 본문 마지막 행.** 「바로시작」(red 채움) · 「중지」(float) 2개 — **매도중(3)이면 중지만, 그 밖에는 바로시작만 활성**. 접힌 카드에서는 보이지 않는다(펼친 뒤에만 누를 수 있음 — 오터치 방지). **버튼 아래 설명 줄 없음**(사용자 요청 2026-10-05). 카드 안 전략 로그 패널도 없음(기존 전략 로그 탭 그대로).

### ② 바로시작 / 중지 동작 (41 `AutoSellCommandReq`)
- **D-06: 확인창 없이 바로 전송.** 스위치 「바로 반영」 규율(Phase 20 D-05)·WinForms 동형. 피드백은 D-03 칩 전이만.
- **D-07: 자동매도 카드에 더티가 있으면 바로시작 비활성.** 41 은 서버 저장값으로 돌므로 화면 값 = 서버 값이 보장된 뒤에만 누른다(「수정」으로 반영 후). 중지는 더티와 무관하게 활성. 두 단계 자동 전송(lc.set → 41) 없음.
- **D-08: 응답 대기 = lc.set 동형(3초 무응답 = 미반영 실패).** 누르면 버튼 둘 다 잠금 + 칩 「전송…」. 성공 판정 = 60 에코에서 기대 전이(Start → `auto_sell_state=3` ∧ `auto_sell_enabled=true` · Stop → `auto_sell_enabled=false`). 54 ERROR `src="AutoSellCommand"`(isin 일치) = 원문 전략 로그 + 버튼 재활성 + 「미반영」 해제. 3초 무응답 = 상태줄 「미반영」 + 버튼 재활성, **재시도 없음**. **낙관 갱신 없음** — 에코가 진실. in-flight 는 카드당 1건(lc.set in-flight 와 같은 큐에 넣을지는 재량).
- **D-09: 버튼 활성 조건 = 서버에 그 키 전략이 있을 때만.** 마지막 에코(`ledServer`)가 없으면 바로시작 · 중지 모두 비활성. 보유 0 · 단일가매매 종목 · 설정 범위 밖은 **웹이 추정하지 않고** 서버 54 원문을 전략 로그에(D-13 규율). 41 의 `account_no` 는 카드 계좌 슬라이스(`card-account-slice`), `exchange` 는 카드 거래소 키.

### ③ 사용자 설정 11값 (42/84 `UserSettings` — 목업 `reference/mockup-user-settings.html` **변형 C** 채택 2026-10-05)
- **D-10: 위치 = `/me` 마이페이지, 계정 카드 아래 「상따 기본설정」 섹션**(전략 현황 카드 위). 상따 화면에는 새 진입점을 두지 않는다(링크 1개는 재량). — **Reversibility:** reversible.
- **D-11: 새 전략 폼 기본값을 84 값으로 교체.** `limit-chaser.ts` D-04 상수 7칸(선·추가·후매수 금액 · 후매수 최대/하한잔량/반등 · 매도 잔량추적)과 자동매도 비율 · 방법 기본값 2칸은 **84 UserSettings 에서 시딩**한다. `present=false` 면 84 가 실은 내장 기본값(= D-04 상수와 같은 값)을 그대로 쓴다. **84 미수신(세션 준비 전)이면 D-04 상수 폴백**. 이미 등록된 전략(서버 에코 있음)은 에코가 이기고, 사용자가 손댄 칸은 덮지 않는다(D-17 시딩 규칙 동형). 84 브로드캐스트가 도착했을 때 열려 있는 미등록 폼의 손대지 않은 칸만 재시딩. 매도 주기 · 동시호가 비율은 서버 전용(폼에 칸 없음). 상장주식수 기반 5칸(D-17)은 그대로. — **Reversibility:** costly — 폼 기본값의 원천이 상수에서 스토어(84 캐시)로 바뀌어 `seedListSharesDefaults`·신규 폼 테스트 픽스처가 같이 바뀐다.
- **D-12: 저장 UX = 행 확정마다 즉시 42(변형 C).** 상따 카드와 같은 「라벨 ─ 값 ›」 44px 행 11개(폰 시트 · 데스크톱 인라인 · 방법 기본값은 3택 시트/세그먼트), **저장 버튼 없음**. 시트 적용 · 인라인 Enter/blur · 방법 선택마다 **42(11값 전체 = 서버 캐시값 + 바뀐 1칸)** 즉시 전송. 성공 신호 = 84 브로드캐스트 수신(그 값으로 행 초록 플래시 ~0.7초). 범위는 **시트에서 미리 막는다**(적용 버튼 비활성 + 빨간 한 줄 「1~60초 사이여야 해요」 류). 서버 거부(54 `src="SetUserSettings"`) 원문은 섹션 아래 빨간 한 줄 + 그 행은 서버 값으로 되돌림. in-flight 중 다른 행 확정은 큐(lc.set 동형) 또는 마지막 승(재량).
- **D-13: 묶음 4개와 상태 표시.** 소제목 「매수 금액(선·추가·후매수 만원) / 후매수(최대 회 · 하한잔량 주 · 반등 %) / 매도(잔량추적 %) / 자동매도(매도 주기 초 · 동시호가 매도비율 % · 비율 기본값 % · 방법 기본값)」. 섹션 제목줄 칩: `present=true` 「서버 저장값」(ok) · `present=false` 「서버 저장값 없음 · 내장 기본값」(warn) · 84 미수신 「불러오는 중」(행 흐림 · 편집 불가). 안내 한 줄은 상태별 문구(목업 그대로: 「새 전략 폼의 기본값이에요 · 매도 주기 · 동시호가 비율은 서버가 다음 주기부터 바로 써요」 / 「아직 저장한 적이 없어요 · 저장하면 이 사용자(DMA 계정)의 모든 화면에 적용돼요」 / 「DMA 세션이 준비되면 서버 설정(84)을 불러와요」). 범위 표기는 시트 설명에(1~60초 등, fbs 주석 그대로).

### ④ 주문로그 · 전략 로그 표시 (shared 조립기 · 라벨)
- **D-14: 구분 필터에 「자동매도」 값 신설.** 주문로그 탭 · 카드 탭 필터 = 전체 · 선매수 · 추가매수 · 후매수 · 매도 · **자동매도(group 9)** · 시세. 기본 「전체」. 구분 배지 색은 매도(down) 그대로(`strategyEventSide(9, kind)` = sell). 창 분리 라우트의 쿼리 파라미터에도 같은 값.
- **D-15: 라벨.** `ORDER_GROUP_LABELS[9] = "자동매도"`. kind 라벨 11 「발동」 · 12 「정정」 · 13 「상태」 · **14 는 `cond_actual` 로 1 「VI 멈춤」 · 2 「동시호가 멈춤」 · 3 「재개」**(kind 당 한 낱말 고정 아님). kind 13 본문 상태 전이는 카드 칩 낱말 그대로 「{이전} → {새}」(0 없음 · 1 대기 · 2 감시 · 3 매도중 · 4 완료) + 기준 종류. kind 6 group 9 의 「구분」 은 기존 「주문」 유지, 본문이 주기 매도/동시호가 회차를 가른다(위 조립기 규약).
- **D-16: `CANCEL_REASON_LABELS` 10 「매수 우선 취소」 · 11 「동시호가 감축」** — 인박스 가안 확정(WinForms 동일 낱말).
- **D-17: 전략 로그 출처 배지 「자동매도」 신설.** `OriginTagLabel` 에 `'자동매도'` 추가 — 54 INFO `src="AutoSell"` 사유 줄과 54 ERROR `src="AutoSellCommand"` 거부 줄 모두 이 배지(WinForms `[자동매도]` OriginTag 동형). 「상따」 배지와 구분. 카드 「미반영」 해제 판정(위 확정 사항)과는 별개 축.

### Claude's Discretion
- **relay**: 84 캐시 자료구조(`#queuedWindows` 동형 Map<userId, …>) · 브라우저 프레임 이름(예 `user.settings` · `autosell.cmd` · `user.settings.set` — snake/camel 변환은 기존 규약) · 43 요청 시점(`#onReady` 스냅샷 요청 옆, 세션 Ready 전 송신 불가) · 수기 사본 3곳(`msg-type.ts` MSG/INBOUND 화이트리스트 · `envelope.ts` 파서/빌더 · `subscription-hub.ts` `#onFrame` case) 갱신 형태 · 85 `LimitFeature` 는 INBOUND 화이트리스트 밖(debug 드롭) · 42 11값 범위 검증을 relay 에서도 할지(권고: zod 범위만, 거부는 서버 원문) · 테스트 픽스처(`frames.ts` · fake-gateway) 신필드 빌더.
- **shared/webapp 타입**: `RelayLimitChaser` 신필드 8개 이름(camelCase 변환) · `RelayLimitChaserInput` 요청 4필드 · UserSettings 타입 · relay.ts outbound union 추가.
- **조립기 문장 세부**: kind 6 group 9 주기 매도 본문(「매도 6,000주 @12,990 양쪽 — 주기 거래량 60,000 × 10% · 누적 920,000」 결) · 동시호가 회차 본문(「동시호가 1회차 매도 N주 @하한가 — 예상체결 M주 @가격 · 보관 a→b」 결) · kind 11 「발동 — 시작조건 N% · 기준 {상한가|매수가} 13,000 · 체결 12,800」 · kind 12 「정정 #원주문 → 새가격 N주(새 번호)」 · kind 14 멈춤/재개 꼬리(재개는 `expected_cum` 새 T0). 기획서 예시 형식(Phase 25 D-09)을 따르고 `docs/features/order-log-progress.md` ④ 표를 픽스처로.
- **카드 세부**: 자동매도 그룹의 접힘 요약 순서 · 칩 pend 문구 · 「누적 매도」 hot 색 임계(>0) · 시작조건 시트의 설명문 · 방법 3택 행의 `LcRowSpec` kind 이름 · 더티 판정이 그룹 단위인지(D-07 은 「자동매도 카드에 더티」 — 다른 카드 더티는 무관) · 41 in-flight 와 lc.set 큐의 관계 · LED 4칩 좁은 밴드 문구 축약.
- **설정 섹션 세부**: 컴포넌트 위치(`components/me/` · `MeClient` 안 순서) · 상따 화면에서 설정으로 가는 링크 유무/자리 · 84 미수신 때 상수 폴백 안내 · 플래시 색/시간 · 서버 거부 뒤 되돌림 애니메이션 · 모바일 r3 폭.
- **주문로그 세부**: 오늘 주문 펼침 타임라인에서 kind 12 정정을 원주문 행에 묶는 방식(order_no = 원주문 번호) · 필터 값 키(`'auto'` 류) · 창 분리 쿼리 이름.
- **테스트**: relay 단위(schema 4 파생 · 서버전용 4필드 제외 · 84 캐시/재생 · 41/42/43 인코딩) · shared 조립기 스냅샷(kind 6/11/12/13/14 · AuctionOrder · CancelReason 10/11) · webapp 컴포넌트(카드 그룹 · 버튼 활성 조건 D-07/D-09 · 미반영 해제 src 분기 · 설정 섹션 즉시 저장) · e2e 1~2 시나리오(fake gateway 60 에코 전이).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 와이어 계약 (gh-trade 인박스 · HANDOFF — 정본)
- `docs/inbox/from-gh-trade/261004-auto-sell-wire.md` — 인박스 노트(10/5 갱신 절 우선): 번호 · 슬롯 · 필드 · 배포 순서 · 확인 명령 · 질문 3 · 처리 후 `status: done` + `done_commit`
- `docs/inbox/from-gh-trade/README.md` — 인박스 노트 형식(done 처리 규약)
- `/Users/alex/repos/gh-trade/.planning/phases/28-auto-sell/28-HANDOFF-gh-radar-fields.md` — §0~§6 합의 기록 · **§4-1 v0.2 kind 별 필드 매핑표**(단위 · kind 12 message 숫자만 · group 9 한정) · 28-12 구현이 정한 계약
- `/Users/alex/repos/gh-trade/.planning/phases/28-auto-sell/28-G1-NOTIFY.md` — fbs 확정 통보: MsgType/슬롯 표 · 테이블 필드 vtable · enum 변경 · **reason_code 13종 표** · source 문자열
- `/Users/alex/repos/gh-trade/server/src/protocol/StockDMA.fbs` (master 65caaf2e, blob 68679e9a) — 필드 정본(`SetLimitChaser` 663~670 · `UserSettings` · `AutoSellCommandReq` · enum 주석 1328~1399)
- `/Users/alex/repos/gh-trade/docs/strategy/limit-chaser.md` §6-6 「자동매도(체결매도)」(상태기계 · 기준 · 시작조건 · 주기/방법 · 정정 · 매수 우선) · **§9-3 「자동매도 검증·에코」**(8필드 · 범위 검증 문구 · schema 4 가드 · 41 실패 문구 표 · 42/43/84 규약)
- `/Users/alex/repos/gh-trade/docs/features/order-log-progress.md` ④ 「자동매도 매핑 (HANDOFF v0.2)」 — §4-1 표의 정본 사본(조립기 픽스처 원천)
- `/Users/alex/repos/gh-trade/.planning/phases/28-auto-sell/28-09-SUMMARY.md` 「가드 문구 (54 ERROR)」 — 41 거부 문구 원문
- `/Users/alex/repos/gh-trade/server/scripts/sync-relay-schema.sh` — 생성물 동기화(master 에서 `RELAY=/Users/alex/repos/gh-radar/relay`, flatc 25.12.19 · `--check` 먼저)

### 목업 (채택안 박제 — 구현은 이 형태를 따른다)
- `.planning/phases/27-auto-sell-integration/reference/mockup-auto-sell-card.html` — 자동매도 카드(매도 pane 세 번째) · 칩 · 읽기 전용 2행 · 버튼 행 · LED 4번째 · 접힘 요약 · 상태 시뮬 (채택 2026-10-05, 설명 줄·로그 패널 제거 반영)
- `.planning/phases/27-auto-sell-integration/reference/mockup-user-settings.html` — `/me` 「상따 기본설정」 섹션 **변형 C**(행 확정마다 즉시 저장) 채택 · A/B 는 기각 · present/absent/loading/거부 상태

### 선행 phase 결정 (재사용 규율)
- `.planning/phases/25-order-log-progress/25-CONTEXT.md` — D-09/D-10 조립기 규칙(shared 하나 · 표시명 표 · 모르는 enum 원문) · 주문로그 탭 필터(D-08) · relay 77/83 캐시 패턴
- `.planning/phases/24-limitchaser-buy3/24-CONTEXT.md` — 카드 구조 D · D-13 서버 사유 줄 우선 · D-17 시딩 규칙 · D-20 「0 은 거부」 · D-04 기본값 표
- `.planning/phases/26-shared-quote-feed/26-CONTEXT.md` — 착수·배포 순서(sync → 생성물 + 수기 사본 3곳 커밋 · relay → webapp) · D-14 목업 게이트 선례
- `.planning/ROADMAP.md` Phase 27 블록 — Goal ①~⑤ · Depends on 25·26
- `webapp/src/styles/globals.css` §9 토큰(`--led-latent` `--led-armed` 등) · §2.2b 컨테이너 쿼리 밴드

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- relay `relay/src/dma/envelope.ts:1301` `lcBuy3SchemaOf`(필드 존재 1·2·3) → 4번째 분기 · `:1341` `buildSetLimitChaserReq` 「S→C 전용 11필드」 목록(`:1413~1459` 주석 패턴) → 에코 전용 4 추가 · `:2195` `readLimitChaser`(S→C 전용 12 읽기) → 8필드 읽기 · 테스트 `relay/src/dma/__tests__/envelope.test.ts:1465`(schema 파생 케이스).
- relay hub `relay/src/hub/subscription-hub.ts:735,1411,1862` `#queuedWindows`/`getQueuedWindow`/77 set(최신 1건 사용자별 캐시) · `:2556` 세션 교체 시 버림 — 84 캐시 템플릿. `relay/src/ws/fanout.ts:718~728` 인증 직후 `queued.window` · `unf.progress` 스냅 재생 — 84 재생 자리. 수기 사본 `relay/src/dma/msg-type.ts:199,247`(83 등록 패턴) · hub `#onFrame` case.
- relay 요청 경로 `relay/src/ws/order-handler.ts` · `relay/src/ws/protocol.ts:132`(zod 스키마 · 모르는 키 제거 → schema 3 안전) — 41/42/43 브라우저 프레임 추가 자리.
- shared `packages/shared/src/strategy-event-labels.ts:19,33,72,90`(KIND · GROUP · CANCEL_REASON · REASON_CODE_OPERATORS 표) · `strategy-event-text.ts:89,123,201`(`strategyEventParts` · kind 6 `sellOrderBody`) · `strategy-display.ts` · 픽스처 `__fixtures__/strategy-day.ts` — 11~14 · group 9 · AuctionOrder 분기 자리.
- webapp 카드 `webapp/src/components/trading/lc/lc-fields.ts:160,359`(`LC_BUY_GROUPS`/`LC_SELL_GROUPS` · `derived` 행 kind :116 · 요약 빌더 :601) · `setting-group.tsx` · `limit-chaser-form.tsx:1623-1624`(pane 렌더) · `card/card-header.tsx:66` `LED_KINDS` 3칩 · `lib/limit-chaser.ts:208-252`(D-04 기본값 상수 · `seedFromUpperLimit` :185) · `:652,685`(`isLimitChaserRejection` src 분기 — AutoSellCommand 추가).
- webapp 확정 훅 `webapp/src/components/trading/lc/use-lc-field-commit.ts:159,327`(`LcFailReason` · 3초 unacked 타임아웃 · in-flight 1건) — 41 전송·대기 동형 재사용. `dirty-action-bar.tsx`(더티 판정 원천 — D-07).
- webapp 설정 `webapp/src/components/me/account-card.tsx`(카드 토큰 · 72px 한 줄) · `components/trading/me-client.tsx:297`(본문 순서 소유) — 설정 섹션 삽입 자리. 폰 시트 `lc/number-pad-sheet.tsx` · 인라인 `lc/inline-value-editor.tsx` 재사용.
- webapp 주문로그 `webapp/src/lib/order-log-feed.ts:50-56,156`(필터 값 표 · group 축) · `components/trading/order-log/order-log-filters.tsx:111` · `origin-tag.tsx:18`(`OriginTagLabel` 3종) · `lib/use-relay-socket.ts:765-902`(`applyFrame` — 84·자동매도 프레임 리듀서 자리).

### Established Patterns
- 서버 진실은 클라가 판정하지 않는다(Phase 24 D-13 · 25 D-11 · T-17-33): 문구 파싱 금지 · 보유/단일가 추정 금지 · 거부는 서버 원문 — D-08/D-09 가 같은 규율.
- 스위치는 바로 반영(D-05) · 값은 더티 → 「수정」(D-06) · 카드 3초 무응답 = 미반영 — D-06/D-07/D-08 이 이 규율 위에 선다. 설정 섹션(D-12)은 예외적으로 행 확정 즉시 전송(사용자 결정, 전략이 아니라 사용자 기본값이라 무장 위험 없음).
- relay 수기 사본 3곳 + 생성물은 손대지 않는다(26 CONTEXT 착수 순서). 서버전용 필드는 relay 가 웹 입력에서 제거한다.
- 모르는 enum 값은 원문 숫자 노출(숨기지 않음) — 85 · kind 15 가 와도 깨지지 않는다.
- 상따 화면 반응형은 본문 폭 컨테이너 쿼리(`globals.css` §2.2b) — LED 4칩 · 자동매도 카드 밴드 규칙 동일.

### Integration Points
- relay `index.ts` — hub 84 캐시 · fanout 인증 재생 · order-handler 41/42/43 · envelope 빌더/파서 · msg-type 화이트리스트.
- shared `relay.ts` outbound/inbound 타입 union · `RelayLimitChaser` 8필드.
- webapp 상따 카드(`limit-chaser-form.tsx` 매도 pane) · 카드 헤더 LED · `use-relay-socket` 스토어(84 캐시 · 자동매도 에코) · `/me` `MeClient` · 주문로그 필터/라벨 · 전략 로그 배지 · 작업대 `isActiveStrategy`.
- 인박스 노트 frontmatter(`status`/`done_commit`) — 마지막 플랜의 커밋.

</code_context>

<specifics>
## Specific Ideas

- 목업 데이터(원익홀딩스 · 상한가 13,000 · 기준가 10,000 · 시작조건 2% → 발동가 12,800 · 비율 10% · 주기 거래량 60,000 → 6,000주 양쪽 3,000/3,000)는 `limit-chaser.md` §6-6 예시와 같다 — 조립기·카드 테스트 픽스처로 그대로.
- 자동매도 카드 제목줄 칩은 후매수 칩과 같은 자리·크기. 「매도중」 은 amber(hold) — 보유중 칩과 같은 색 결(「돈이 움직이는 상태」).
- 설정 섹션 안내 문구 3종과 칩 문구는 목업 원문 그대로 쓴다(D-13).
- 바로시작 버튼은 red 채움(매도 액션 = up/red 가 아니라 「실행」 강조) — 목업 그대로. 중지는 float.

</specifics>

<deferred>
## Deferred Ideas

- **85 `LimitFeature`(Envelope 슬롯 90) · `StrategyEventKind` 15 중계·표시** — gh-trade Phase 27 세션이 별도 인박스 노트로 넘긴다. 이 phase 는 생성물에만 실리고 INBOUND 밖(debug 드롭).
- **127 서버 배포** — gh-trade 몫(별도 quick). relay 는 120 과 127 어느 쪽에서도 84 를 받을 수 있어야 하므로 특별 처리 없음.
- **상따 화면에서 설정 섹션으로 가는 전용 진입점(⚙ 버튼)** — D-10 은 `/me` 만. 필요해지면 quick 1건.
- **설정 섹션 저장 이력(전략 로그 류)** — 42 성공/거부를 어디에 남길지 묻지 않았다. 지금은 행 플래시 + 섹션 아래 거부 한 줄만.
- **장전 동시호가 회차(`AutoSellAuctionOrder`)의 카드 표시**(회차 진행 N/5) — 에코에 회차 칸이 없어 주문로그 줄로만 본다. 서버가 에코에 칸을 추가하면 재검토.
- **Rejected(8) group 9 의 저널 reject_seq 조인** — Phase 25 deferred 그대로.

</deferred>

---

*Phase: 27-auto-sell-integration*
*Context gathered: 2026-10-05*
