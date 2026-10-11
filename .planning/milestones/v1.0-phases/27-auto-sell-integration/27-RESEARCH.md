# Phase 27: 자동매도 연동 — gh-trade Phase 28 와이어 계약 반영 - Research

**Researched:** 2026-10-05
**Domain:** FlatBuffers 와이어 동기화(relay) · WebSocket 중계 프레임 · shared 문장 조립기 · Next.js 상따 카드/마이페이지 UI
**Confidence:** HIGH (와이어·코드 자리 전부 이번 세션에 원문을 열어 확인) / 결정 전제 일부 MEDIUM (아래 Open Questions 8건)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 이미 확정된 것 (ROADMAP · 인박스 · HANDOFF · 메모리 2026-10-04 합의 — 다시 묻지 않는다)
- **와이어 전부**: MsgType 41/42/43/84 · Envelope 슬롯 86/88 · `SetLimitChaser` 말미 8필드(140~146 양방향 · 148~154 S→C 전용) · `UserSettings` 12필드(금액 3칸 **만원**, `present` 는 84 전용) · `AutoSellCommandReq{isin, account_no, exchange, action}` · `StrategyEventKind` 11~14(9 비움 유지) · `OrderGroup::AutoSell = 9` · `CancelReason` 10 `AutoSellBuyFirst` · 11 `AutoSellAuctionTrim`(신규 값) · reason_code 13종(첫 토큰 `AutoSell`) · `ServerMessage.source` `"AutoSell"`(54 INFO) / `"AutoSellCommand"`(41 실패 54 ERROR, isin 동반) / `"SetUserSettings"`(42 거부).
- **relay**: `buy3_schema` 는 값이 아니라 **필드 존재** 단조 파생 — 자동매도 요청 4필드 + 하위 스키마 필드가 모두 있을 때만 4(옛 탭은 1~3 그대로). 에코 전용 4필드는 `buildSetLimitChaserReq` 서버전용 목록에(웹이 되돌려 보내지 않음). 84 는 hub **사용자별 캐시**(77 `QueuedWindowState` 패턴 — 캐시 + isReady 때만 fanout + 인증 후 스냅 재생), 43 은 `#onReady` 스냅샷 요청 옆. 42 뒤 같은 dma_user_id 전 세션 84 브로드캐스트는 **서버가** 한다. 사용자 세션으로 오는 82 는 종전대로 무시(전략 이벤트는 관찰자 저널 80 만 정본).
- **인박스 질문 3 답**: Q1 금액 만원 = 예(웹 lc-fields 가 이미 만원). Q2 `present=false` 면 **이전 없이** 내장 기본값 표시, 사용자가 저장할 때만 42. Q3 CancelReason 10 「매수 우선 취소」 · 11 「동시호가 감축」(이번 discuss 에서 확정, 아래 D-16).
- **조립기 규약**: reason_code 는 **첫 공백까지 잘라 정확 일치** 조회(모르는 토큰은 지어내지 않고 D-10 폴백 = 원문 kind 표시). kind 6 group 9 는 `AutoSellAsk1/Bid1`(주기 매도)과 `AutoSellAuctionOrder`(장전 동시호가 회차)를 reason_code 로 분기 — AuctionOrder 는 ev_kind Quote 라도 기존 「근거 호가(잔량 a→b)」 조각을 쓰면 오독이므로 **전용 근거 조각**(회차 N · 예상체결가 · 예상체결량 · 회차 전/후 보관 수량). group 7↔9 가 뒤바뀔 수 있으니(WR-05) group 만 믿지 말고 `AutoSell` 토큰도 함께 판정. `ev_qty_before/after`·`reason_code` 의 group 9 의미는 **group 9 일 때만**. kind 12 `order_no` = 원주문 번호(타임라인 묶음 키), `message` = 새 번호 숫자만.
- **카드 「미반영」 해제 키** = 54 ERROR `src="AutoSellCommand"`(`isLimitChaserRejection` 동형 분기 신설). 54 INFO `src="AutoSell"` 은 사유 줄만, 해제 대상 아님.
- **킬 스위치(`DisableStrategiesReq`)·단일 행 비활성화가 자동매도도 끈다** — 60 에코 `auto_sell_enabled=false` 를 그대로 그린다(CR-01). 15:40 정리 사본은 41 을 되돌리지 않는다(WR-07).
- **UI 는 HTML 목업 먼저** — 이 discuss 에서 2장 채택(아래 canonical_refs). 별도 UI-SPEC 은 만들지 않는다(Phase 26 D-14 선례).
- **배포**: gh-trade 서버는 이미 가동 중. gh-radar 안에서는 **relay 먼저 → 검증 → push**(push 가 곧 webapp 프로덕션 배포 · 옛 relay 는 브라우저의 모르는 `t` 에 소켓을 닫는다). 장 시간(08:00~20:00 KST) 밖 배포 창. 인박스 노트 `status: done` + `done_commit` 채워 경로 지정 커밋.

#### 서버 계약에서 따라오는 것 (HANDOFF · `limit-chaser.md` §6-6/§9-3 — 결정이 아니라 수용 사실)
- 자동매도 상태 0 없음 · 1 대기 · 2 감시 · 3 매도중 · 4 완료. 기준 종류 1 상한가 · 2 매수가(0 미정). 방법 와이어 1 매도1호가 · 2 매수1호가 · 3 양쪽(화면 이름 「양쪽 / 매도1호가 / 매수1호가」 — 콤보 순서도 이 순서, 28-12 VM 검토 4차). 시작조건 0~9(0 = 이탈 관측 뒤 다음 체결).
- 서버 `IsActive()` 에 `IsAutoSellActive()` 가 들어 있고 삭제 정규화도 자동매도만 켠 등록을 지우지 않는다 → 웹 `isActiveStrategy`(켜진 전략 기준 · 작업대 카드 접힘 등)와 `lc.set` 삭제(`crud D`) 판정에 **`autoSellEnabled` 를 포함**한다(WinForms `AnyArmed` 동형).
- 바로시작(41 Start)은 kind 11 을 내지 않는다 — kind 13(원인 Command) + 54 INFO `자동매도 <이전> → 매도중 (바로시작)`. Stop = 체크 OFF(미체결 유지).
- 42 = **11값 전체 교체**, 범위 밖 하나면 요청 전체 거부(54 ERROR `src="SetUserSettings"`, 첫 위반 문구 1개 예 `매도 주기는 1~60초여야 합니다(받은 값 99)`). 84 = 로그인 직후 77 바로 뒤 1프레임 · 43 응답 · 42 성공 뒤 같은 키 전 세션 브로드캐스트. 키 = 로그인 id 앞 8바이트.
- 41 실패 문구 표(§9-3) · 60 자동매도 거부 문구(§9-3 ②③)는 **서버 원문 그대로** 전략 로그(Phase 24 D-13 「서버가 말하는 것을 다시 말하지 않는다」).

#### ① 상따 카드 자동매도 칸 (목업 `reference/mockup-auto-sell-card.html` 채택 2026-10-05)
- **D-01: 매도 pane 에 별도 그룹 카드 「자동매도」.** `LC_SELL_GROUPS` 에 slot `'auto-sell'` 추가 — 매도주문 · 매수취소 아래 **세 번째 카드**. 제목줄 스위치 = `☐자동매도`(`autoSellEnabled`), 제목줄 클릭 = 접기, 접힘 요약 · 폰 시트 · 데스크톱 인라인 편집은 기존 `SettingGroup` 문법 그대로(Phase 24 카드 구조 D). 매도주문 `dimGate` 와 독립(자동매도는 매도 체크 없이도 켜진다). — **Reversibility:** costly — `lc-fields.ts` 그룹 정의 · 요약 빌더 · e2e 앵커 `lc-group-auto-sell` · 테스트 픽스처가 함께 바뀐다.
- **D-02: 본문 행 = 시작조건 · 비율 · 방법 + 읽기 전용 2행 + 버튼 행.** 시작조건(0~9, **0 은 의미어 「이탈 후 다음 체결」**, 그 외 「N%」) · 비율(1~50 %) · **방법은 3택 행**(폰 = 3옵션 시트 · 데스크톱 = 인라인 세그먼트, 새 `LcRowSpec` kind 필요 — 기존 행은 숫자만). 읽기 전용 `derived` 행(발동잔량 패턴) 「누적 매도 N주」(0 이면 「—」, >0 이면 빨강) · 「기준 {상한가|매수가} N원」(상태 0 또는 기준 0 이면 「—」). 마지막 행 = 버튼 2개(D-05). 접힘 요약 = 시작조건 · 비율 · 방법 · 누적 · 기준(같은 의미어).
- **D-03: 제목줄 상태 칩 「대기 / 감시 / 매도중 / 완료」** — `auto_sell_state` 1~4, 0 이면 칩 없음. 색: 대기 중립 · 감시 green(live) · 매도중 amber(hold) · 완료 blue. 41 전송 중에는 칩이 「바로시작 전송… / 중지 전송…」(점선 테두리 pend). 후매수 「감시 중 · 보유중 · 소진」 칩 동형.
- **D-04: 헤더 LED 4번째 「자동」 추가.** `LED_KINDS` 에 `'autoSell'` — OFF 회색 / 대기 · 감시 초록(`--led-armed`) / 매도중 주황(`--led-latent`) / 완료 파랑(`--blue` 계열, 새 토큰 없음). **클릭 불가**(매수 LED 동형). 접힌 카드 요약 점에도 같은 판정 하나(`latchLedStateOf` 확장). 760 미만 밴드 둘째 줄 폭은 구현 때 실측(4칩이 줄바꿈되면 칩 문구를 줄이는 쪽, 칩 삭제 아님).
- **D-05: 바로시작 · 중지 버튼은 자동매도 카드 본문 마지막 행.** 「바로시작」(red 채움) · 「중지」(float) 2개 — **매도중(3)이면 중지만, 그 밖에는 바로시작만 활성**. 접힌 카드에서는 보이지 않는다(펼친 뒤에만 누를 수 있음 — 오터치 방지). **버튼 아래 설명 줄 없음**(사용자 요청 2026-10-05). 카드 안 전략 로그 패널도 없음(기존 전략 로그 탭 그대로).

#### ② 바로시작 / 중지 동작 (41 `AutoSellCommandReq`)
- **D-06: 확인창 없이 바로 전송.** 스위치 「바로 반영」 규율(Phase 20 D-05)·WinForms 동형. 피드백은 D-03 칩 전이만.
- **D-07: 자동매도 카드에 더티가 있으면 바로시작 비활성.** 41 은 서버 저장값으로 돌므로 화면 값 = 서버 값이 보장된 뒤에만 누른다(「수정」으로 반영 후). 중지는 더티와 무관하게 활성. 두 단계 자동 전송(lc.set → 41) 없음.
- **D-08: 응답 대기 = lc.set 동형(3초 무응답 = 미반영 실패).** 누르면 버튼 둘 다 잠금 + 칩 「전송…」. 성공 판정 = 60 에코에서 기대 전이(Start → `auto_sell_state=3` ∧ `auto_sell_enabled=true` · Stop → `auto_sell_enabled=false`). 54 ERROR `src="AutoSellCommand"`(isin 일치) = 원문 전략 로그 + 버튼 재활성 + 「미반영」 해제. 3초 무응답 = 상태줄 「미반영」 + 버튼 재활성, **재시도 없음**. **낙관 갱신 없음** — 에코가 진실. in-flight 는 카드당 1건(lc.set in-flight 와 같은 큐에 넣을지는 재량).
- **D-09: 버튼 활성 조건 = 서버에 그 키 전략이 있을 때만.** 마지막 에코(`ledServer`)가 없으면 바로시작 · 중지 모두 비활성. 보유 0 · 단일가매매 종목 · 설정 범위 밖은 **웹이 추정하지 않고** 서버 54 원문을 전략 로그에(D-13 규율). 41 의 `account_no` 는 카드 계좌 슬라이스(`card-account-slice`), `exchange` 는 카드 거래소 키.

#### ③ 사용자 설정 11값 (42/84 `UserSettings` — 목업 `reference/mockup-user-settings.html` **변형 C** 채택 2026-10-05)
- **D-10: 위치 = `/me` 마이페이지, 계정 카드 아래 「상따 기본설정」 섹션**(전략 현황 카드 위). 상따 화면에는 새 진입점을 두지 않는다(링크 1개는 재량). — **Reversibility:** reversible.
- **D-11: 새 전략 폼 기본값을 84 값으로 교체.** `limit-chaser.ts` D-04 상수 7칸(선·추가·후매수 금액 · 후매수 최대/하한잔량/반등 · 매도 잔량추적)과 자동매도 비율 · 방법 기본값 2칸은 **84 UserSettings 에서 시딩**한다. `present=false` 면 84 가 실은 내장 기본값(= D-04 상수와 같은 값)을 그대로 쓴다. **84 미수신(세션 준비 전)이면 D-04 상수 폴백**. 이미 등록된 전략(서버 에코 있음)은 에코가 이기고, 사용자가 손댄 칸은 덮지 않는다(D-17 시딩 규칙 동형). 84 브로드캐스트가 도착했을 때 열려 있는 미등록 폼의 손대지 않은 칸만 재시딩. 매도 주기 · 동시호가 비율은 서버 전용(폼에 칸 없음). 상장주식수 기반 5칸(D-17)은 그대로. — **Reversibility:** costly — 폼 기본값의 원천이 상수에서 스토어(84 캐시)로 바뀌어 `seedListSharesDefaults`·신규 폼 테스트 픽스처가 같이 바뀐다.
- **D-12: 저장 UX = 행 확정마다 즉시 42(변형 C).** 상따 카드와 같은 「라벨 ─ 값 ›」 44px 행 11개(폰 시트 · 데스크톱 인라인 · 방법 기본값은 3택 시트/세그먼트), **저장 버튼 없음**. 시트 적용 · 인라인 Enter/blur · 방법 선택마다 **42(11값 전체 = 서버 캐시값 + 바뀐 1칸)** 즉시 전송. 성공 신호 = 84 브로드캐스트 수신(그 값으로 행 초록 플래시 ~0.7초). 범위는 **시트에서 미리 막는다**(적용 버튼 비활성 + 빨간 한 줄 「1~60초 사이여야 해요」 류). 서버 거부(54 `src="SetUserSettings"`) 원문은 섹션 아래 빨간 한 줄 + 그 행은 서버 값으로 되돌림. in-flight 중 다른 행 확정은 큐(lc.set 동형) 또는 마지막 승(재량).
- **D-13: 묶음 4개와 상태 표시.** 소제목 「매수 금액(선·추가·후매수 만원) / 후매수(최대 회 · 하한잔량 주 · 반등 %) / 매도(잔량추적 %) / 자동매도(매도 주기 초 · 동시호가 매도비율 % · 비율 기본값 % · 방법 기본값)」. 섹션 제목줄 칩: `present=true` 「서버 저장값」(ok) · `present=false` 「서버 저장값 없음 · 내장 기본값」(warn) · 84 미수신 「불러오는 중」(행 흐림 · 편집 불가). 안내 한 줄은 상태별 문구(목업 그대로: 「새 전략 폼의 기본값이에요 · 매도 주기 · 동시호가 비율은 서버가 다음 주기부터 바로 써요」 / 「아직 저장한 적이 없어요 · 저장하면 이 사용자(DMA 계정)의 모든 화면에 적용돼요」 / 「DMA 세션이 준비되면 서버 설정(84)을 불러와요」). 범위 표기는 시트 설명에(1~60초 등, fbs 주석 그대로).

#### ④ 주문로그 · 전략 로그 표시 (shared 조립기 · 라벨)
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

### Deferred Ideas (OUT OF SCOPE)
- **85 `LimitFeature`(Envelope 슬롯 90) · `StrategyEventKind` 15 중계·표시** — gh-trade Phase 27 세션이 별도 인박스 노트로 넘긴다. 이 phase 는 생성물에만 실리고 INBOUND 밖(debug 드롭).
- **127 서버 배포** — gh-trade 몫(별도 quick). relay 는 120 과 127 어느 쪽에서도 84 를 받을 수 있어야 하므로 특별 처리 없음.
- **상따 화면에서 설정 섹션으로 가는 전용 진입점(⚙ 버튼)** — D-10 은 `/me` 만. 필요해지면 quick 1건.
- **설정 섹션 저장 이력(전략 로그 류)** — 42 성공/거부를 어디에 남길지 묻지 않았다. 지금은 행 플래시 + 섹션 아래 거부 한 줄만.
- **장전 동시호가 회차(`AutoSellAuctionOrder`)의 카드 표시**(회차 진행 N/5) — 에코에 회차 칸이 없어 주문로그 줄로만 본다. 서버가 에코에 칸을 추가하면 재검토.
- **Rejected(8) group 9 의 저널 reject_seq 조인** — Phase 25 deferred 그대로.
</user_constraints>

<phase_requirements>
## Phase Requirements

REQUIREMENTS.md 에 이 phase 로 매핑된 ID 는 **없다**(ROADMAP `**Requirements**: TBD`). 아래는 ROADMAP Goal ①~⑤ 를 가칭 ID 로 나눈 것이다 — 플래너는 이 ID 를 플랜 `requirements:` 칸에 쓰지 말고 Goal 번호로 추적한다.

| 가칭 | 설명 (ROADMAP Goal) | Research Support |
|------|---------------------|------------------|
| G① | relay 생성물 동기화 (gh-trade master → `relay/src/generated`) | §A — `--check` 실측: 생성 63 · 신규/변경 12 · 삭제 0 · 변경 파일 목록 확정 · 미병합 로컬 변경 없음 확인 |
| G② | relay 중계: schema 4 · 에코 4필드 서버전용 · 84 캐시/재생 · 41/42/43 · 54 통과 | §B — 수기 사본 3곳 + fanout/protocol 의 정확한 삽입 자리 · 깨지는 기존 단언 3개 · `#isTeardown` 결손 |
| G③ | shared 조립기 kind 11~14 · group 9 · CancelReason 10/11 | §C — 표 구조 · `sellOrderBody`/`conditionText` 우회 필요 · WinForms 문장 규칙 표(정본) 원문 |
| G④ | webapp 카드 자동매도 칸 · 41 · 미반영 해제 · `/me` 설정 · 주문로그 | §D — `lc-fields` 확장점 · LED 타입 · 41 in-flight 패턴(`lc.arm` 선례) · 표시 몫 판정 결손 · 84 스토어 자리 |
| G⑤ | 배포 relay → push · 인박스 done | §F — Phase 25-12 배포 체크포인트 패턴 그대로 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- 사용자 대면·산출물은 **한글**, 코드 식별자·경로·프로토콜 이름은 영어.
- **GSD 워크플로우 필수** — 모든 편집은 GSD 명령 안에서(`/gsd-execute-phase`).
- **gh-trade 인박스 규약**: 처리한 노트는 `status: done` + `done_commit` 을 채워 **경로를 지정해** 커밋(`git add -A` 금지). `docs/inbox/from-gh-trade/README.md` 가 형식 정본. (지금 working tree 에 미추적 노트 2건 `261005-limitup-feature-85.md` · `261005-tick-raw-archive-gcs.md` 와 `tasks/lessons.md` 수정이 있다 — 이 phase 커밋에 섞지 않는다.)
- **커밋 메시지 한글 · Co-Authored-By 넣지 않음**(사용자 전역 규칙 — 시스템 기본 attribution 보다 우선).
- **배포는 relay 먼저 → 검증 → push**. push 자체가 webapp 프로덕션 배포. 백엔드가 막히면 push 하지 않는다. 장 시간(08:00~20:00 KST) 밖에서 relay VM 컨테이너 교체.
- **서브에이전트(executor)는 배포·smoke·push·Secret 쓰기를 하지 않는다** — 메인 세션이 `checkpoint:human-action` 안에서(메모리 「서브에이전트 배포는 분류기 차단」).
- **UI 는 HTML 목업 먼저** — 이미 2장 채택(목업이 UI 정본, UI-SPEC 없음).
- 상따 화면 반응형은 **본문 폭 컨테이너 쿼리**(`globals.css` §2.2b 가 정본, 표를 복사하지 말 것).
- 손보는 표면 안의 시각 결함(줄바꿈·잘림·겹침)은 묻지 말고 고치고 한 줄 보고.
- 동시 세션 커밋 경합 — `git add -A` · relay 배포 직전 `git status -sb` 재확인.
- 작업은 master 에서(phase 브랜치 금지 — config `branching_strategy: none`).
- 보안검사 생략(`security_enforcement: false`) · Nyquist 검증은 유지.
- Supabase 신규 테이블/RPC 없음(이 phase 는 DB 변경 0 — kind 11~14 는 기존 RPC 계좌 축으로 보인다, §C-6).

## Summary

이 phase 는 **새 라이브러리 0개**의 순수 계약 반영 작업이다. 와이어는 gh-trade master 에서 이미 고정·가동 중이고(KB 120), gh-radar 쪽 일은 ① `sync-relay-schema.sh` 로 생성물 12개를 갱신하고 ② relay 의 손으로 쓴 사본 3곳(`msg-type.ts` · `envelope.ts` · `subscription-hub.ts`)과 브라우저 프로토콜(`ws/protocol.ts` · `ws/fanout.ts`)에 41/42/43/84 와 SetLimitChaser 8필드를 꿰고 ③ shared 조립기에 kind 11~14 · group 9 를 더하고 ④ webapp 카드·`/me`·주문로그에 표시·조작을 붙이는 것이다. 모든 확장 자리에는 **바로 앞 선례 커밋**이 있다 — 양방향 필드 추가는 `6181ee5d`(quick-261003-rc4 `extraBuyBurstRelease`), S→C 전용 필드 추가는 `451c3070`(quick-261002-fim `postBuyUnlockQty`), 로그인 직후 사용자별 캐시 푸시는 77 `QueuedWindowState`, 요청 in-flight 창은 `lc.arm`(quick-260926-nr2) 이다. 플래너는 새 기계를 만들지 말고 이 선례를 복제한다.

조사 중 **CONTEXT 결정의 전제가 코드·gh-trade 와 어긋나는 곳 8건**을 찾았다(Open Questions). 가장 중요한 셋: (1) **D-07 의 「더티」는 존재하지 않는다** — Phase 20 D-04 이후 상따 카드에는 더티 누적·「수정」 버튼이 없고 확정 1회 = `lc.set` 1회다(`limit-chaser-form.tsx:41-48`). (2) **D-17 의 배지 자리가 틀렸다** — `OriginTagLabel` 은 주문 행 칩이고 54 사유 줄 배지는 shared `serverMsgBadge` 다. 게다가 WinForms 는 54 `"AutoSell"` 사유 줄에 `[자동매도]` 가 아니라 **`[상따]`** 를 붙인다(28-08 결정 — 「[자동매도] 자동매도 발동 …」 낱말 중복 회피). (3) **D-04 LED 색이 WinForms 와 다르다**(WinForms: 대기·완료 주황, 감시·매도중 초록) — `latch-led.tsx` 머리 주석은 「C# 정본과 한 글자라도 갈리면 오독」을 원칙으로 둔다.

또 코드에 **지금 없으면 실계좌 사고가 나는 결손 3개**가 있다: ① 웹 `isDeleteIntent`/`crudOf` 와 relay `#isTeardown` 에 `autoSellEnabled` 가 없으면 「자동매도만 켠」 등록이 `crud:"D"`(삭제) 또는 철거 경로로 나간다, ② relay `lc.set` 조립기의 `addExtraBuyBurstRelease` 조건이 `buy3Schema === 3` 동등 비교라 schema 4 가 되는 순간 「버스트 시 해제」가 와이어에서 빠지고 서버가 false 로 읽는다, ③ webapp `isLimitChaserServerMessage` 가 `"AutoSell"`·`"AutoSellCommand"` 를 받지 않아 지금 그대로면 자동매도 사유 줄·거부 줄이 **화면 어디에도 안 나온다**.

**Primary recommendation:** 선례 커밋 복제 순서 — shared 계약 타입 → relay(동기화 + 수기 사본 + 프로토콜, PC-12 규율대로 화이트리스트와 명시 case 를 한 커밋에) → shared 조립기 → webapp(스토어 → lib 판정 → 카드 → `/me` → 주문로그) → e2e → 배포 체크포인트. Open Questions 1~4 는 플래닝 **전에** 사용자 확인.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 자동매도 판정·주기 매도·상태기계·사용자 설정 저장 | gh-trade 서버(범위 밖) | — | 「서버 진실은 클라가 판정하지 않는다」(Phase 24 D-13). gh-radar 는 표시·조작만 |
| 와이어 디코드/인코드(SetLimitChaser 8필드 · 41/42/43/84) | relay (`dma/envelope.ts`) | 생성물 `generated/` | FlatBuffers 는 relay 만 안다. 브라우저는 JSON 계약(shared `relay.ts`)만 본다 |
| `buy3_schema` 4 파생 · 에코 전용 필드 차단 | relay (`envelope.ts` · `ws/protocol.ts` zod) | shared `LIMIT_CHASER_SERVER_ONLY_FIELDS` | 브라우저가 스키마를 고르면 안 된다(T-24-01). 서버전용 필드는 zod strip + Omit 타입 이중 차단 |
| 84 사용자별 캐시 · Ready 전 보관 · 인증 후 재생 · 43 | relay (`hub/subscription-hub.ts` · `ws/fanout.ts`) | — | 77 패턴. 84 는 로그인 직후(Ready 전) 오므로 캐시가 필수 |
| 41/42 브라우저 프레임 검증(세션·계좌·범위) | relay (`ws/fanout.ts` · `ws/protocol.ts`) | — | `lc.set`/`lc.arm` 과 같은 ①세션 ②계좌 ③조립 순서. 42 는 계좌 축 없음 |
| 문장 조립(kind 11~14 · group 9 · CancelReason 10/11) | shared (`strategy-event-*.ts`) | — | Phase 25 D-09 「조립은 shared 한 곳」 |
| 54 출처 배지 | shared (`strategy-display.ts` `serverMsgBadge`) | webapp 표시 | `OriginTag`(주문 행 칩)와 다른 표면 — Open Q2 |
| 자동매도 카드 UI · 41 in-flight · LED | webapp (`components/trading/lc` · `card`) | lib `limit-chaser.ts` 판정 | 판정 근거는 마지막 서버 에코 하나(latch-led D-20) |
| 84 스토어 · 폼 시딩 · `/me` 설정 섹션 | webapp (`lib/use-relay-socket.ts` · `components/me`) | — | 77 `queuedWindow: undefined` 3상태 규율 |
| 주문로그 필터·라벨 | webapp (`lib/order-log-feed.ts`) + shared 라벨 | server(무변경) | server 라우트는 행을 거르지 않는다 |
| DB | 무변경 | — | kind/group CHECK 없음 · kind 11~14 는 계좌 축 RPC 로 보인다 |

## Standard Stack

신규 패키지 **없음**. 기존 스택 그대로다.

### Core (이미 설치 — 버전은 이번 세션 실측)
| Library / Tool | Version | Purpose | 비고 |
|---------|---------|---------|------|
| flatc | 25.12.19 | `.fbs` → TS 생성 | `[VERIFIED: flatc --version]` 로컬 `/opt/homebrew/bin/flatc`. 스크립트가 이 문자열과 정확 일치를 요구(`sync-relay-schema.sh` `FLATC_REQUIRED="flatc version 25.12.19"`) |
| flatbuffers (npm) | ^25.9.23 | relay 런타임 | `[VERIFIED: relay/package.json]` |
| zod | ^4.0.0 | relay 브라우저 프레임 검증 | `[VERIFIED: relay/package.json]` |
| vitest | ^4.1.4 (relay) | 단위·통합 | `[VERIFIED: relay/package.json]` |
| Node | v22.22.0 | 런타임 | `[VERIFIED: node --version]` relay `engines >=22` |
| pnpm | 11.15.1 | 워크스페이스 | `[VERIFIED: pnpm --version]` |
| Playwright | ^1.59.1 | webapp e2e | `[VERIFIED: webapp/package.json]` |

**Installation:** 없음.

## Package Legitimacy Audit

이 phase 는 외부 패키지를 설치하지 않는다 — 감사 대상 0건.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (없음) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                    ┌──────────────────── gh-trade KB 120 (가동 중, 범위 밖) ─────────────────────┐
                    │  LoginResp(50) → 77 → **84** (그 연결)   60 에코(8필드)   54 INFO/ERROR      │
                    │  저널 80 (kind 6/7/8 g9 · 11~14 · 15*)   85*(FULL 구독 연결, 1초/키)         │
                    └──────┬──────────────────────────┬────────────────────────┬──────────────────┘
          사용자 DMA 세션 │ (TCP, 사용자당 1)          │ 관찰자 저널(80)         │ quote 관찰자(role 1)
                          ▼                            ▼                        ▼
 relay ┌─ tryParseEnvelope ── INBOUND? ──no──▶ OUT_OF_SCOPE?(85 추가) ─▶ debug 드롭 / 그 밖 warn
       │        │yes
       │  SubscriptionHub.#onFrame ─┬─ 60 → readLimitChaser(+8) → lc 캐시 → fanout {t:"lc"}
       │                            ├─ 54 → {t:"msg", src:"AutoSell"|"AutoSellCommand"|"SetUserSettings"} 그대로
       │                            ├─ **84 → #userSettings.set(userId) → isReady? fanout {t:"user.settings"}**
       │                            └─ (feed 연결 #onFeedFrame 에도 84 명시 case — PC-12)
       │  #onReady → 66/24/21/34 요청 옆 **43(GetUserSettingsReq)**  ──▶ 서버 84 재응답(이제 Ready라 팬아웃)
       │  journal 80 → strategy-stream → Supabase dma_strategy_events (+ 계좌 소유자 {t:"journal.events"})
       │
       │  WsFanout(브라우저 wss):
       │    인증 직후 재생: lc.snap · vi · queued.window · **user.settings(캐시 있을 때만)** · unf.progress …
       │    inbound: lc.set(zod +4 요청필드 선택) → buy3CfgOf → **#isTeardown(+autoSellEnabled)** → buildSetLimitChaserReq(schema 1~4)
       │             **autosell.cmd** → ①세션 ②계좌 → buildAutoSellCommandReq(41)
       │             **user.settings.set** → ①세션 → buildSetUserSettingsReq(42, 11값)
       └──────────────────────────────────────────────────────────────────────────────────────
                          ▼ JSON (shared relay.ts 계약)
 webapp  use-relay-socket.applyFrame: lc · msg · **user.settings → state.userSettings (undefined=미수신)**
         ├─ 상따 카드(StrategyCard → LimitChaserForm 매도 pane): 자동매도 그룹(D-01~D-05) · LED 4번째 · 41 in-flight
         │     성공 = 60 에코 기대 전이 / 실패 = 54 ERROR AutoSellCommand(i·a 일치) / 3초 = 미반영
         ├─ 신규 폼 시딩: userSettings(84) → 없으면 D-04 상수 (touchedRef 규칙)
         ├─ /me MeClient: AccountCard → **상따 기본설정 섹션(42 즉시 · 84 플래시 · 54 SetUserSettings 거부 줄)** → StrategyStatusCard …
         └─ 주문로그·전략 로그: shared strategyEventParts(kind 11~14 · g9) · 필터 「자동매도」 · serverMsgBadge
   (* 85 · kind 15 는 Deferred — 85 는 드롭, kind 15 는 저널로 DB 에 적재되나 RPC 가시성 밖)
```

### 권장 플랜 분해 (config `parallelization: false` — 순차)

| # | 플랜 | 핵심 파일 | 선례 |
|---|------|-----------|------|
| 27-01 | 생성물 동기화 + shared 계약 타입(RelayLimitChaser 8 · 입력 4 · user.settings 프레임 · inbound 2 · 범위 표 · strategy-event 상수) | `relay/src/generated/**`, `packages/shared/src/relay.ts`, `strategy-event.ts` | `648e7892` · `451c3070` |
| 27-02 | relay 코덱·hub·fanout·protocol (PC-12: 84 화이트리스트와 hub case 한 커밋) + 테스트 헬퍼 | `msg-type.ts` · `envelope.ts` · `subscription-hub.ts` · `fanout.ts` · `protocol.ts` · `tests/helpers/*` | `6181ee5d` · 17-03(77) · 25-06(83) |
| 27-03 | shared 조립기 · 라벨 · 배지 | `strategy-event-labels.ts` · `strategy-event-text.ts` · `strategy-display.ts` · `__fixtures__/strategy-day.ts` | `dc439352`(kind 10) |
| 27-04 | webapp 스토어 + lib 판정(게이트·삭제·켜진 전략·기본값·폼 변환·41 거부 판정·표시 몫) | `use-relay-socket.ts` · `lib/limit-chaser.ts` · `test-fixtures/limit-chaser.ts` | `6181ee5d` webapp 부분 |
| 27-05 | 카드 자동매도 그룹(3택 행 · 칩 · derived 2행 · 버튼 행) + LED 4번째 + 41 in-flight | `lc-fields.ts` · `setting-group.tsx` · `limit-chaser-form.tsx` · `latch-led.tsx` · `card-header.tsx` · `strategy-card.tsx` | quick-260926-nr2(`lc.arm` in-flight) |
| 27-06 | `/me` 상따 기본설정 섹션 + 신규 폼 84 시딩 | `components/me/*` · `me-client.tsx` · `limit-chaser-form.tsx` 시딩 | D-17 `touchedRef` 시딩 |
| 27-07 | 주문로그 필터·라벨 · e2e | `order-log-feed.ts` · `order-log-filters.tsx` · e2e specs | Phase 25 |
| 27-08 | 배포 체크포인트(relay → smoke → push) + 인박스 done | `docs/inbox/from-gh-trade/261004-auto-sell-wire.md` | `25-12-PLAN.md` |

### Pattern 1: 생성물 동기화 (G①)

**실측 결과** (`cd /Users/alex/repos/gh-trade/server && RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh --check`, 2026-10-05):
```
[4/5] 생성: flatc --ts (임시 디렉토리)
      생성 63 개 (.ts, stock-dma/ 포함)
[5/5] 대조: 반영하면 무엇이 바뀌는지만 보고 (gh-radar 파일 무변경)
      생성 .ts        : 63 개
      신규/변경 예정  : 12 개
      삭제 예정       : 없음
      .fbs 사본       : 갱신 예정
sync-relay-schema.sh OK: 가드 3종 통과 — gh-radar 파일은 건드리지 않았다 (--check)
```
`--check` 는 파일 목록을 찍지 않는다. 같은 `flatc --ts` 를 scratchpad 에 돌려 `cmp` 로 대조한 **정확한 12개** `[VERIFIED: scratchpad flatc 대조]`:

| 상태 | 파일 (`relay/src/generated/` 기준) |
|------|------|
| 변경 | `stock-dma.ts` · `stock-dma/cancel-reason.ts` · `stock-dma/envelope.ts` · `stock-dma/msg-type.ts` · `stock-dma/order-group.ts` · `stock-dma/set-limit-chaser.ts` · `stock-dma/strategy-event-kind.ts` |
| 신규 | `stock-dma/auto-sell-command-req.ts` · `stock-dma/user-settings.ts` · `stock-dma/limit-feature.ts` · `stock-dma/member-delta.ts` · `stock-dma/team-sim.ts` |
| 갱신 | `StockDMA.fbs` 사본(SYNC MARKER) |

- **master 이동 확인:** gh-trade master HEAD 는 이제 `7cc7ffaa`(CONTEXT 의 `65caaf2e` 아님)지만 `git rev-parse master:server/src/protocol/StockDMA.fbs` = `68679e9adf7b3cfe8719d86289a333ff1bbea21f` — **blob 동일**, 스키마 무변경 `[VERIFIED: git rev-parse]`. fbs 를 마지막으로 고친 커밋은 `2404509b`(Phase 27 LimitFeature).
- **SYNC MARKER 값:** 스크립트는 `git log -1 --format=%h -- <FBS>` 를 쓴다(규약 ③) → 새 마커는 **`2404509b`** 가 된다(`65caaf2e` 도 `7cc7ffaa` 도 아님). 커밋 메시지·SUMMARY 에 이 값을 쓴다.
- **미병합 로컬 변경 없음:** `tail -n +8 relay/src/generated/StockDMA.fbs` 와 `git show 26b3493e:server/src/protocol/StockDMA.fbs` 가 바이트 동일 `[VERIFIED: cmp]` → `FBS=` 합치기 불필요, `RELAY=` 만으로 반영.
- **반영 명령(executor 가 실행해도 됨 — gh-radar 파일만 쓴다, gh-trade 무변경):** `cd /Users/alex/repos/gh-trade/server && RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh` — 반영 뒤 `--check` 재실행이 「신규/변경 0」 이어야 멱등.

**새 enum/슬롯 (생성물 원문, `[VERIFIED: scratchpad gen]`):**
```ts
// stock-dma/msg-type.ts:34-36, 69-70
  AutoSellCommandReq = 41,
  SetUserSettingsReq = 42,
  GetUserSettingsReq = 43,
  UserSettingsResp = 84,
  LimitFeature = 85
// stock-dma/strategy-event-kind.ts:16-20
  AutoSellTriggered = 11,
  AutoSellModified = 12,
  AutoSellState = 13,
  AutoSellPause = 14,
  LimitFeature = 15
// stock-dma/order-group.ts:15        AutoSell = 9
// stock-dma/cancel-reason.ts:16-17   AutoSellBuyFirst = 10,  AutoSellAuctionTrim = 11
// stock-dma/envelope.ts:440,444,448
  builder.addFieldOffset(41, autoSellCommandReqOffset, 0);   // vtable 4+2*41 = 86
  builder.addFieldOffset(42, userSettingsOffset, 0);         // 88 (42·84 공유)
  builder.addFieldOffset(43, limitFeatureOffset, 0);         // 90
```
`SetLimitChaser` 신접근자(`set-limit-chaser.ts:325-360` · 빌더 `:601-629`): `autoSellEnabled():boolean` · `autoSellStartCond():number` · `autoSellRatioPct():number` · `autoSellMethod():number` · `autoSellState():number` · `autoSellSoldQty():number` · `autoSellBasis():number` · `autoSellBasisPrice():number` / `addAutoSellEnabled` … `addAutoSellBasisPrice`.
fbs 원문(`master:server/src/protocol/StockDMA.fbs` diff):
```
    auto_sell_enabled: bool;         // ☐자동매도 (양방향). vtable 140
    auto_sell_start_cond: ubyte;     // 시작조건 0~9 (양방향) … vtable 142
    auto_sell_ratio_pct: ubyte;      // 비율 % 1~50 (양방향) … vtable 144
    auto_sell_method: ubyte;         // 매도 방법 (양방향) — 1 매도1호가 · 2 매수1호가 · 3 절반절반. vtable 146
    auto_sell_state: ubyte;          // **S→C 전용** 0 없음 · 1 대기 · 2 감시 · 3 매도중 · 4 완료 … vtable 148
    auto_sell_sold_qty: uint;        // **S→C 전용** 누적 매도수량(주). vtable 150
    auto_sell_basis: ubyte;          // **S→C 전용** 기준 종류 1 상한가 · 2 매수가 (0 미정). vtable 152
    auto_sell_basis_price: uint;     // **S→C 전용** 기준가격(원 — 상한가 또는 매수가). vtable 154
```
`UserSettings` 접근자(`user-settings.ts:25-80`): `preBuyAmount` · `addBuyAmount` · `postBuyAmount` · `postBuyMaxCount` · `postBuyFloorQty` · `postBuyReboundPct` · `sellQtyTrackRatio` · `autoSellPeriodSec` · `auctionSellRatioPct` · `autoSellRatioDefaultPct` · `autoSellMethodDefault` · `present`. `AutoSellCommandReq`: `isin` · `accountNo` · `exchange` · `action`.

### Pattern 2: relay 수기 사본 3곳 + 프로토콜 (G②)

#### 2-a `relay/src/dma/msg-type.ts`
- `MSG` 상수에 요청 3(`AutoSellCommandReq: 41` · `SetUserSettingsReq: 42` · `GetUserSettingsReq: 43`)과 응답 1(`UserSettingsResp: 84`) 추가. 이름은 생성 enum 과 **정확히 같아야** 한다 — `codec.test.ts:196-201` 이 `Object.entries(MSG)` 를 생성 enum 과 대조한다.
- `INBOUND_MSG_TYPES`(`:221-248`)에 `MSG.UserSettingsResp` 추가. **85 는 넣지 않는다.**
- `OUT_OF_SCOPE_INBOUND_MSG_TYPES`(`:270-272`, 현재 `68, 70, 74, 75, 81, 82,`)에 **85 추가** — 서버가 Phase 27(gh-trade) 를 배포하면 85 가 quote 관찰자(FULL 구독) 연결로 **키당 1초마다** 오므로, 넣지 않으면 `drop("unknown-msg-type")` warn 이 초당 수십 건 쌓인다(85 인박스 노트 「warn 로그를 키·초마다 남기지 않게」). 파일 상단 「하지 않는 것」 주석 목록도 같은 커밋에 고친다(주석과 상수가 서로를 가리키는 규약).
- **깨지는 기존 단언 3개 — 같은 커밋에서 갱신:**
  - `src/dma/__tests__/codec.test.ts:246` `expect(INBOUND_MSG_TYPES.size).toBe(26);` → 27
  - `src/dma/__tests__/codec.test.ts:249` `expect(v).toBeLessThanOrEqual(83);` → 84 (테스트 이름 「응답 대역(50~83)」 도)
  - `src/dma/__tests__/envelope.test.ts:270` `…toEqual([68, 70, 74, 75, 81, 82]);` → 85 포함

#### 2-b `relay/src/dma/envelope.ts`
- **`lcBuy3SchemaOf`(`:1301-1305`) 4번째 분기** — 현재:
  ```ts
  export function lcBuy3SchemaOf(cfg: Pick<LcSetCfg, "postBuyAuto" | "extraBuyBurstRelease">): number {
    if (cfg.postBuyAuto === undefined) return LC_FIXED_BUY3_SCHEMA;
    if (cfg.extraBuyBurstRelease === undefined) return LC_POST_BUY_AUTO_BUY3_SCHEMA;
    return LC_BURST_RELEASE_BUY3_SCHEMA;
  }
  ```
  → 4필드(`autoSellEnabled` · `autoSellStartCond` · `autoSellRatioPct` · `autoSellMethod`) 중 **하나라도** undefined 면 3, 넷 다 있으면 `LC_AUTO_SELL_BUY3_SCHEMA = 4`. 4필드가 있는데 하위(`postBuyAuto`/`extraBuyBurstRelease`)가 없으면 단조 규칙대로 낮은 값 + 경고(기존 `extraBuyBurstRelease` P-1 경고 동형).
- **함정(코드 실측):** `:1467` `if (buy3Schema === LC_BURST_RELEASE_BUY3_SCHEMA && cfg.extraBuyBurstRelease !== undefined) {` — **동등 비교**다. schema 4 에서 이 줄이 false 가 되어 `extra_buy_burst_release` 가 와이어에서 빠지고, 서버는 schema ≥ 3 에서 부재를 false 로 읽어 **사용자의 ☐버스트 시 해제를 조용히 끈다**. `>=` 로 바꾼다. `post_buy_auto` 줄(`buy3Schema >= LC_POST_BUY_AUTO_BUY3_SCHEMA`)은 이미 `>=` 라 안전.
- 자동매도 4필드 add 는 `buy3Schema === 4` 일 때만. `false`/`0` 은 FlatBuffers 기본값이라 버퍼에 안 쓰여도 서버가 schema 4 에서 부재 = 기본값으로 읽는다(`post_buy_auto` 주석과 같은 논리) — 단 **비율 0 · 방법 0 으로 저장되면 41 바로시작이 「설정이 올바르지 않습니다」 로 거부**되므로 웹은 늘 1~50 / 1~3 을 싣는다(Pitfall 5).
- 머리 주석 「S→C 전용 11필드」 목록(`:1319-1325` 부근)과 add 사이 주석 줄에 에코 전용 4필드(`auto_sell_state/sold_qty/basis/basis_price`)를 「싣지 않는다」로 추가. 실제 차단은 zod(미지 키 strip) + shared `Omit` 타입이다 — 조립기는 원래 그 필드를 add 하지 않는다.
- **`readLimitChaser`(`:2195-2305`)** 에 8필드 읽기 추가(슬롯 부재 = false/0 — 옛 서버 호환). 머리 주석 「S→C 전용 12」 → 16.
- **신규 빌더** — 이름 있는 start/add/end 규율(T-16-05), 문자열은 테이블 열기 전 생성:
  - `buildAutoSellCommandReq({isin, accountNo, exchange, action: 1|2})` → `Envelope.addAutoSellCommandReq` + `msgType 41`. `isValidIsin`/`isValidAccountNo`/`isValidExchange` 가드 + `truncateToWire(…, 12)` (`buildSetLimitChaserReq` 와 같은 절단 — 서버가 `char[13]` 로 자른다 `[VERIFIED: Gateway.cpp:3767-3771]`).
  - `buildSetUserSettingsReq(s: 11값)` → `UserSettings` 테이블(`present` 는 **싣지 않는다** — 84 전용, 서버가 안 읽음) + `Envelope.addUserSettings` + `msgType 42`. `toWireUint`/`toWireUByte` 재사용.
  - `buildGetUserSettingsReq()` = `buildBareRequest(MSG.GetUserSettingsReq)`(요청 테이블 없음 — 24/27/34 선례).
- **신규 파서** `parseUserSettings(env)` → `env.userSettings()` null 이면 `dropField("slot-null", MSG.UserSettingsResp, …)`, 아니면 `{t:"user.settings", present, …11}`(`parseQueuedWindowState` `:743-760` 동형).

#### 2-c `relay/src/hub/subscription-hub.ts`
- 캐시: `readonly #userSettings = new Map<string, RelayUserSettingsMsg>()` — `#queuedWindows`(`:735`) 바로 옆, 같은 JSDoc 3상태 규율(키 부재 = 「84 를 아직 못 받았다」).
- `#onFrame` 명시 case(`:1733-1737` 77 case 패턴):
  ```ts
  case MSG.UserSettingsResp: {
    const s = parseUserSettings(e.env);
    if (s !== null) this.#onUserSettings(userId, session, s);   // set → if (!session.isReady) return; → #fanout
    return;
  }
  ```
  `#onQueuedWindow`(`:1861-1865`) 원문:
  ```ts
  #onQueuedWindow(userId: string, session: HubSession, state: RelayQueuedWindowMsg): void {
    this.#queuedWindows.set(userId, state);
    if (!session.isReady) return;
    this.#fanout(userId, state);
  }
  ```
- `getUserSettings(userId)` getter(`getQueuedWindow` `:1411-1413` 동형).
- `#clearCaches`(`:2556-2558` 의 `this.#queuedWindows.delete(userId);` 옆)에 `#userSettings.delete(userId)`. `closeAll`(`:1626` `this.#queuedWindows.clear();` 옆)에도 clear.
- **43 송신:** `requestStrategySnapshot`(`:1293-1323`) 의 `session.send(buildGetVIOrderListReq());` 뒤 `session.send(buildGetUserSettingsReq());`. 의미: 84 는 LoginResp 직후(계좌 선언 전 = Ready 전)에 와서 캐시만 되고 팬아웃되지 않는다 — 같은 세션에 이미 붙어 있던 탭(재접속)은 Ready 뒤 43 의 84 로 갱신된다. 로그 줄 「Ready — 전략 스냅샷 요청」 에 43 을 덧붙인다.
- **`#onFeedFrame`(`:1918-1975`) 에도 84 명시 case** — quote 관찰자 연결은 서버 규약상 84 를 받지 않지만(84 는 `ProcessLoginReq` 경로에서만 송신 `[VERIFIED: Gateway.cpp:1208-1220]`), 화이트리스트에 넣은 이상 오면 `default:` 로 떨어져 `#unhandledFrames` 가 오른다(PC-12 게이트). 기존 `case MSG.ServerMessage: case MSG.QueuedWindowState: case MSG.JournalBatch:` warn 묶음에 `MSG.UserSettingsResp` 를 더한다. 관찰자 저널 코덱(`journal/codec.ts:28-45`)은 모르는 번호를 `{k:"unexpected"}` 로 받는다 — 바꿀 필요 없음.

#### 2-d `relay/src/ws/fanout.ts`
- **인증 직후 재생**(`:722-723`) 원문:
  ```ts
    const queuedWindow = this.#hub.getQueuedWindow(userId);
    if (queuedWindow !== undefined) this.#send(conn, queuedWindow);
  ```
  바로 아래 `const userSettings = this.#hub.getUserSettings(userId); if (userSettings !== undefined) this.#send(conn, userSettings);` — **모르면 보내지 않는다**(지어낸 「present=false」 를 내리면 `/me` 가 「서버 저장값 없음」 거짓 칩을 그린다).
- **새 inbound 분기** — `lc.arm`(`:889-915`) 바로 뒤, `keyOf` 앞(전략 4종과 같은 자리 · Pitfall 14):
  - `autosell.cmd`: `#strategySession` → `#accountAllowed(conn, session, userId, msg.t, msg.accountNo)` (IDOR 방어 — 41 은 계좌를 싣는다) → `#buildStrategyPayload(() => buildAutoSellCommandReq(…))` → `session.send` 실패면 `#onStrategySendFailed`. **pending FIFO 에 넣지 않는다**(응답이 키를 담은 60 에코 · 실패는 isin+계좌를 담은 54 — `lc.arm` 과 같은 이유).
  - `user.settings.set`: `#strategySession` → 조립 → 송신. 계좌 축 없음(세션 신원 키 — 서버가 `GetId()` 로 저장).
- **`#isTeardown`(`:1237-1250`) 결손** — 원문:
  ```ts
    return (
      !cfg.buyEnabled &&
      !cfg.sellEnabled &&
      !cfg.cancelQtyEnabled &&
      !cfg.cancelTradeEnabled &&
      cfg.postBuyAuto !== true
    );
  ```
  `&& cfg.autoSellEnabled !== true` 를 더한다. 빠지면 「자동매도만 켠」 등록 프레임이 철거로 분류돼 ②-1 시장 해석이 느슨한 `#teardownMarket` 을 타고 ②-2 무장 가드를 건너뛴다. 웹 `isDeleteIntent` 와 「같은 다섯 항」 → 여섯 항으로 **같은 커밋**.

#### 2-e `relay/src/ws/protocol.ts`
- `RelayLcSetSchema` cfg(`:149-243`)에 선택 4필드: `autoSellEnabled: z.boolean().optional()` · `autoSellStartCond: z.number().int().min(0).max(9).optional()` · `autoSellRatioPct: UByteSchema.optional()` · `autoSellMethod: UByteSchema.optional()` + `superRefine` 한 줄 「`autoSellEnabled === true` 면 비율 1~50 · 방법 1~3」(서버 §9-3 ② 「켜는 요청만」 동형 — 꺼진 채 범위 밖 에코 0 이 소켓 종료가 되지 않게, `postBuyReboundPct` 규칙과 같은 모양). 4필드는 `buy3CfgOf` 의 12필드 존재 판정에 **넣지 않는다**(`postBuyAuto` 와 같은 자리 — 옛 탭 관용).
- **S→C 전용 4필드는 스키마에 두지 않는다** — `z.object` 가 미지 키를 strip 하므로 실려 와도 통과 못 한다. 머리 주석(`:128-136`) S→C 전용 목록에 4개 추가.
- 신규 스키마 2개를 `RelayInboundSchema`(`:428-440`) discriminatedUnion 에 추가:
  - `RelayAutoSellCmdSchema = z.object({ t: z.literal("autosell.cmd"), isin: IsinSchema, accountNo: AccountNoSchema, exchange: ExchangeSchema, action: z.enum(["start","stop"]) })` (relay 가 1/2 로 변환 — 브라우저에 와이어 숫자를 노출하지 않는 `lc.arm` `latch` 문자열 선례)
  - `RelayUserSettingsSetSchema = z.object({ t: z.literal("user.settings.set"), s: z.object({ …11값, 서버 범위 그대로 }) })`
- **`.strict()` 금지**(기존 규율 T-18-07). zod 위반 = close(4400) 이므로 웹이 같은 범위로 먼저 막아야 한다 — 범위 정본을 shared 에 두고(§D-7) relay zod 와 webapp 시트가 같은 상수를 읽게 한다.

#### 2-f 테스트 헬퍼
- `tests/helpers/frames.ts`: `FakeLimitChaserInput` 에 8필드 · `buildUserSettingsFrame(input)` · `buildServerMessageFrame` 은 이미 `src` 를 받는다(`:224`).
- `tests/helpers/fake-gateway.ts`(`:659-712`): `STRATEGY_COMMAND_MSG_TYPES`(`:84-88`)에 41·42 추가(기록만), 43 에 84 응답 — **기존 통합 테스트의 프레임 개수 단언을 흔들지 않게 시드 옵션(`userSettings: null` 기본 = 무응답)으로 둘지, 늘 응답할지 플래너가 정한다.** 권고: 시드 옵션 기본 null(테스트가 켤 때만 84) + 로그인 직후 84 자동 송신은 하지 않는다(현재 fake 는 77 도 자동 송신하지 않는다 — `sendQueuedWindowState` 수동).
- `readSetLimitChaserRequest`(fake-gateway export, e2e 가 재사용)에 자동매도 4필드 디코드 추가 — schema 4 단언용.

### Pattern 3: shared 조립기 (G③)

#### 3-a 현재 표 모양 `[VERIFIED: packages/shared/src/strategy-event-labels.ts:19-90]`
```ts
export const STRATEGY_EVENT_KIND_LABELS: Readonly<Record<number, string>> = {
  1: "상한가노출", 2: "상한가진입", 3: "주문", 4: "대기", 5: "체결", 6: "주문", 7: "취소", 8: "거부",
  // 9 — gh-radar 「상태전이」 예약(표에 없다 — 오면 원문 숫자).
  10: "버스트 상한가",
};
export const ORDER_GROUP_LABELS = { 1: "선매수", 2: "추가매수", 3: "후매수", 4: "호가매도", 5: "체결매도", 6: "체결훅", 7: "수동", 8: "VI" };
export const CANCEL_REASON_LABELS = { 1: "수동 취소", 2: "이탈 매도", 3: "매수1 이탈", 4: "VI 감시", 5: "거래소 취소", 6: "마감 정리", 7: "체결 감시", 8: "재취소", 9: "기타" };
```
(위 블록은 원문을 한 줄로 접은 것 — 값·키는 원문 그대로.) 추가: kind 11 「발동」 · 12 「정정」 · 13 「상태」 (14 는 표가 아니라 `cond_actual` 분기 — D-15), group 9 「자동매도」, cancel 10 「매수 우선 취소」 · 11 「동시호가 감축」. `packages/shared/src/strategy-event.ts:20-50` 의 `STRATEGY_EVENT_KIND`/`ORDER_GROUP` 상수 객체에도 11~14 · `AutoSell: 9` 를 더한다(현재 `BurstLimit: 10` · `VITrigger: 8` 까지).

#### 3-b reason_code 원문 13종 — 첫 토큰 정확 일치 대상
서버 `OrderReasonName` 이 저널에 싣는 **전체 문자열** `[VERIFIED: gh-trade server/src/trade/strategy/LimitChaser.h:388-400]`:
```
"AutoSellAsk1 주기매도(매도1호가)"            "AutoSellBid1 주기매도(매수1호가)"
"AutoSellTrigger0 발동(기준가격 이탈 뒤 다음 체결)"  "AutoSellTriggerN 발동(체결가<=발동가)"
"AutoSellModify 정정(비싼 미체결 → 목표가)"     "AutoSellStateChange 상태변경"
"AutoSellPauseVI 멈춤(VI)"   "AutoSellPauseAuction 멈춤(동시호가)"   "AutoSellResume 재개(새 T0)"
"AutoSellStartCancel 발동선취소(같은 창 매수 미체결)"   "AutoSellBuyFirstCancel 매수우선취소(매도 미체결)"
"AutoSellAuctionTrimCancel 동시호가감축취소"   "AutoSellAuctionOrder 동시호가회차매도"
```
→ 기존 `REASON_CODE_OPERATORS` 는 **원문 전체** 정확 일치(D-36)다. 자동매도는 그 표에 넣지 말고 별도 `reasonToken(reasonCode) = reasonCode.split(" ", 1)[0]` + `Object.hasOwn(AUTO_SELL_REASON_TOKENS, token)` 집합 조회로 판정한다(프로토타입 키 방어 — `reasonOperator` 와 같은 `Object.hasOwn` 규율).

#### 3-c `strategyEventParts` 분기 자리 `[VERIFIED: strategy-event-text.ts:89-130]`
- `case 6:` → 현재 `{ ...orderBadge(ev), action: strategyKindLabel(6), body: sellOrderBody(ev), cum }`. **자동매도 판정 `isAutoSellEvent(ev) = ev.group === 9 || AUTO_SELL_REASON_TOKENS.has(token)`** 이면 전용 본문으로 갈라야 한다. 이유(코드 실측): 기존 `sellOrderBody` → `conditionText` 가 `cond_metric 3` 을 「단건 매도체결」 · `reasonOperator` 없음 → 「조건 단건 매도체결 10 / 실측 60,000」 이라는 **오독 문장**을 만들고, AuctionOrder 는 `evKind 1`(Quote) 이라 `evidenceText` 가 「근거 호가(a→b)」 로 회차 보관 수량을 호가 잔량처럼 그린다.
- `case 11:` · `case 12:` · `case 13:` · `case 14:` 신설 — `default:`(D-10 폴백) 앞에. 배지는 `orderBadge(ev)`(group 9 → 「자동매도」, tone sell). 14 의 `action` 은 `cond_actual` 1 「VI 멈춤」 · 2 「동시호가 멈춤」 · 3 「재개」, 그 밖 원문 숫자.
- `case 7:` `cancelledBody` 는 `cancelReasonLabel` 표만 늘리면 된다.
- `strategyEventSide`(`labels.ts:136-146`)에 `if (group === 9) return "sell";` — D-14(매도 색).
- **WR-05 판정 정정:** CONTEXT/ROADMAP 의 「group 7↔9」 는 원문과 다르다. gh-trade `28-REVIEW.md:173-181` WR-05 원문: 「When a regular 상따 sell (group 4/5/6) and an auto-sell (group 9) are in flight together with the same quantity and price … The regular sell's A is tagged group 9」 — 뒤바뀌는 쌍은 **4/5/6 ↔ 9** 다(Open Q5). 권고 규칙: kind 6 은 `reason_code` 첫 토큰이 자동매도 집합이면 자동매도 본문, 아니면 기존 본문(group 9 인데 토큰이 상따 사유면 기존 매도 본문 — 칸 재해석이 틀린 줄을 만들지 않게). 배지는 group 그대로(서버가 말한 group 을 지어 바꾸지 않는다).
- **WinForms 문장 규칙 표가 정본 사본이다** (`gh-trade/docs/features/order-log-progress.md:530-600` `StrategyEventFormatter.cs` 상단 주석 원문). 웹은 F-A 한 줄 문법(「행위 · 본문 | 누적」)으로 옮기되 조각 내용은 이것을 따른다:
  ```
   기준 = queue_case 2 면 「매수가」, 그 밖 「상한가」 · 상태 = 0 꺼짐 · 1 대기 · 2 감시 · 3 매도중 · 4 완료
   6 매도(g9) 매도 {qty}주 @{price} {주문조건} ‖ 주기 거래량 {cond_actual} × {cond_threshold}% · {매도1호가|매수1호가}
            AutoSellAuctionOrder 면 ‖ {entry_round}회차 · 예상체결량 {cond_actual} × {cond_threshold}% (예상체결가 {ev_price})
   11 발동  자동매도 발동 ‖ {기준} {N}% 이탈 (발동가 {price}) · 실측 {cond_actual}   (N = cond_threshold, 0 이면 「{기준} 이탈 · 실측 …」)
            / 기준 {기준} {bid1_price} · T0 누적 {cum}
   12 정정  정정 {qty}주 @{price} ‖ 원주문 @{cond_threshold} 잔량 {cond_actual}주   / 새 번호 {message} · 누적 {cum}
   13 상태  자동매도 {이전} → {새} ‖ 기준 {기준} {price}(price 0 이면 없음)   / 매도 누적 {qty}주(0 이면 없음) · 누적 {cum}
   14 멈춤  cond_actual 1 → 자동매도 멈춤 ‖ VI 발동 · 신규·정정 멈춤(미체결 유지)
            cond_actual 2 → 자동매도 멈춤 ‖ 동시호가(NXT 는 「단일가」) · 신규·정정 멈춤(미체결 유지)
            cond_actual 3 → 자동매도 재개 ‖ 새 T0 누적 {expected_cum}
  ```
  상태 0 낱말이 WinForms·서버 54 문구는 「꺼짐」, CONTEXT D-15 는 「없음」 — Open Q6.
- **kind 11·13·14 는 `orderNo` 가 빈 값**이다(계좌 이벤트지만 주문번호 없음). `orderLogLineText`(`text.ts:285-294`)는 비시장 이벤트의 빈 번호를 `[—]` 로 그린다 — 의도된 표기로 둘지(거부 줄과 같은 꼴) 플래너가 골든에 박는다. 오늘 주문 타임라인(`order-timeline.ts`)은 주문번호로 묶으므로 11/13/14 는 어느 주문 행에도 붙지 않는다(주문로그 탭 · 카드 탭에서만 보인다) — 12 만 원주문 행에 붙는다.

#### 3-d 출처 배지 `[VERIFIED: packages/shared/src/strategy-display.ts:84-88]`
```ts
export function serverMsgBadge(src: string): string {
  if (src === "LimitChaser") return "[상따]";
  if (src === "VITrigger") return "[VI]";
  return "[서버]";
}
```
54 사유 줄·거부 줄 배지는 **여기**다(webapp `strategy-log.tsx:518-531` `serverMessageLogLine` · `strategy-card.tsx:1062` 상태줄이 이 함수 하나를 읽는다). D-17 이 말한 `webapp/src/components/trading/origin-tag.tsx:18` `export type OriginTagLabel = '상따' | 'VI' | '수동';` 는 **주문 행 칩**(account-panel 미체결 · 오늘 주문 — 저널 `origin` 원천)이고 54 줄과 무관하다. 자동매도 주문의 저널 `origin` 은 서버 `OriginName` 에 AutoSell 값이 없어(`IStrategy.h:23-30` — VITrigger/LimitChaser/Manual 뿐) 「상따」 로 온다 — `OriginTag` 는 바꿀 필요가 없다. → Open Q2.

#### 3-e 픽스처·골든 규약
- `__fixtures__/strategy-day.ts` 는 `STRATEGY_DAY_*`(seq 1~14) · `STRATEGY_BRANCH_ROWS`(seq 101~) · `STRATEGY_DAY_GOLDEN` 한 표. 테스트(`strategy-event-text.test.ts:229`)가 「하루 흐름 14줄 · 갈래 12개 · 골든 표 = 두 목록의 합」 을 단언한다 — 자동매도 행을 **갈래(seq 101~)** 로 넣으면 그 개수 단언을 갱신해야 한다. 별도 `STRATEGY_AUTO_SELL_ROWS`(seq 201~) 로 분리하면 기존 단언 무변경.
- 값은 CONTEXT 「Specific Ideas」(원익홀딩스 · 상한가 13,000 · 기준가 10,000 · 시작조건 2% → 발동가 12,800 · 비율 10% · 주기 60,000 → 6,000주)와 gh-trade 54 doctest 문구(`limit-chaser.md` §6-6 「사유 줄」) 를 쓴다. 실계좌 값 금지(D-27) — 계좌는 `FIXTURE_ACCOUNT_NO = "1234567801"`.
- 골든은 `toBe(문자열)` 직접 비교(스냅샷 파일 아님 — 기존 관례).

#### 3-f DB · 가시성 — 변경 없음
`supabase/migrations/20261003120000_dma_strategy_events_burst_limit.sql:37-44` 가 `e.kind NOT IN (1, 2, 10)` 이면 계좌 조인, `IN (1,2,10)` 이면 게이트웨이 매핑 — kind 11~14 는 `account_no` 를 채워 오므로(HANDOFF §4 중요 2) 계좌 소유자에게 보인다. relay 저널 푸시도 shared `isMarketStrategyEvent` 를 쓴다. **마이그레이션 불필요.** (kind 15 는 계좌가 비어 아무에게도 안 보인 채 적재된다 — Deferred.)

### Pattern 4: webapp (G④)

#### 4-a 계약·판정 lib (`webapp/src/lib/limit-chaser.ts`)
- `LimitChaserGates`(`:77-80`) Pick 에 `'autoSellEnabled'` 추가 → `isDeleteIntent`(`:159-167`) 여섯 항 · `crudOf` 자동 반영. **빠지면 자동매도 스위치만 켜는 순간 `crud:"D"` 가 나간다**(서버는 명시 `D` 를 삭제로 처리).
- `isActiveStrategy`(`:105-112`) 인자에 `autoSellEnabled` 추가 → 작업대 `trading-workbench.tsx:536,683` 이 자동매도만 켠 카드를 「켜진 전략」 으로 센다.
- `defaultLimitChaserForm`(`:204-252`): `autoSellEnabled: false` · `autoSellStartCond: 0`(WinForms 초기값 「시작조건 0」 `[CITED: gh-trade docs/strategy/limit-chaser.md 「초기값」 줄]`) · `autoSellRatioPct: 10` · `autoSellMethod: 3`. D-04 기존 7칸 상수는 서버 내장값과 같다 `[VERIFIED: gh-trade UserSettingsStore.h:57-70 — preBuyAmount{4000} addBuyAmount{4000} postBuyAmount{4000} postBuyMaxCount{3} postBuyFloorQty{100000} postBuyReboundPct{30} sellQtyTrackRatio{55} autoSellPeriodSec{3} auctionSellRatioPct{20} autoSellRatioDefaultPct{10} autoSellMethodDefault{3}]` ↔ `limit-chaser.ts:212-251`(4000 · 3 · 100_000 · 30 · 55).
- `formFromServer`(`:552-598`)에 요청 4필드(에코 값 그대로). S→C 4필드는 폼에 넣지 않는다(타입이 막는다).
- **새 판정 `isAutoSellCommandRejection(msg, isin, accountNo)`** — `isLimitChaserArmRejection`(`:772-783`) 동형. 서버 41 실패 54 는 `ServerMessageContext ctx{std::string(isin), std::string(acct), "AutoSellCommand"}` 로 **i 와 a 둘 다** 채운다 `[VERIFIED: gh-trade Gateway.cpp:3774]` → 인정 모양: (a) `lv==="ERROR" && src==="AutoSellCommand" && i===isin && a===accountNo` (b) 미선언 계좌 `src==="Account" && i===isin && a===accountNo`(계좌 가드가 같은 ctx 로 source 만 `"Account"` 로 강제 — `CheckSessionAccount(conn, acct, "자동매도 명령", ctx)`) (c) relay 전 거부 `src==="Relay"` (`i` 없음, `a` 는 "" 또는 이 계좌). **41 in-flight 창 안에서만** 묻는다(거래소는 54 에 없다 — 같은 종목·계좌 KRX/NXT 두 카드가 동시에 41 in-flight 면 구분 불가, in-flight 창이 그 모호성을 줄인다).
- **`isLimitChaserServerMessage`(`:648-654`) 결손** — 원문:
  ```ts
  export function isLimitChaserServerMessage(msg: { src: string; i: string; }): boolean {
    if (msg.src === 'SetLimitChaser' || msg.src === 'LimitChaser') return true;
    return msg.src === 'Account' && msg.i !== '';
  }
  ```
  `"AutoSell"` · `"AutoSellCommand"` 가 없어서 **지금 상태로는 자동매도 사유 줄과 41 거부 줄이 카드 전략 로그(`strategy-card.tsx:597`)와 전 종목 피드(`strategy-log-feed.tsx:168`) 어디에도 안 그려진다.** 두 값을 더한다. VI 판정(`vi-alert.ts:78` `msg.src === "Account" && !isLimitChaserServerMessage(msg)`)은 src 가 달라 영향 없음. `"SetUserSettings"` 는 넣지 않는다(i 가 비어 있고 상따 카드 몫이 아님 — `/me` 섹션이 직접 읽는다).
- `limitChaserGateDisarmed`/`marketCloseReleaseKeysOf`(`:726-760`)에는 **자동매도를 넣지 않는다** — 15:40 정리는 자동매도를 내리지 않는다(WR-07 · `DisableLimitChasers(…, keepAutoSell=true)`). 킬 스위치는 `killSwitchInFlight` 창이 원인을 귀속하므로(`use-relay-socket.ts:1062-1085`) 별도 변경 불필요.

#### 4-b 스토어 (`webapp/src/lib/use-relay-socket.ts`)
- `RelayData` 에 `userSettings: RelayUserSettingsMsg | undefined`(초기 `undefined` — `queuedWindow` `:579,715,758` 3상태 규율), `applyFrame`(`:871~`) 에 `case "user.settings": return { ...state, userSettings: frame };`(`queued.window` `:1032` 동형). `reset` 은 INITIAL 로 자동 초기화. 컨텍스트 노출(`:2138` `queuedWindow: data.queuedWindow` 옆).
- `send(msg: RelayInbound)` 의 유니온이 shared 에서 자란다 — 새 프레임 2개는 타입 추가만으로 송신 가능.

#### 4-c 카드 그룹 스펙 (`webapp/src/components/trading/lc/lc-fields.ts`)
- `LcGroupSpec.slot`(`:149`) 유니온에 `'auto-sell'`, `title` 에 `'자동매도'`, `LcGate`(`:131-137`)에 `'autoSellEnabled'`, `LC_SWITCH_LABEL` 에 「자동매도 켜기」. `dimGate: 'autoSellEnabled'` · `collapsible: true` · `statusKey` 는 새 칩 로직이 따로라 두지 않거나 새 키.
- `LcNumField`(`:23-46`)에 `'autoSellStartCond' | 'autoSellRatioPct'`. **`autoSellMethod` 는 숫자 키패드가 아닌 3택이므로 새 `LcRowSpec` kind** 가 필요하다(현재 유니온 `:115-128` 은 `value` · `checkValue` · `check` · `derived` · `note`). 권고: `{ kind: 'choice'; field: 'autoSellMethod'; id; label: '방법'; options: readonly {value:1|2|3; label}[] }` — 옵션 순서 **3 · 1 · 2**(「양쪽 / 매도1호가 / 매수1호가」, 목업 `[3, 1, 2].map`). `lcRowById`/`lcRowOfField`/`lcNavigableRows`/`lcRowDimOf`/`lcRangeIssue` 의 `switch(row.kind)` 가 exhaustive 라 새 kind 를 넣으면 컴파일이 모든 분기를 짚는다(`lcRowDimOf` `:640-653` 의 `switch` 는 반환 누락 시 TS 오류).
- `derived` 행(`:127` `source: 'sellQtyTrackBaseline' | 'postBuyTriggerQty'`)에 `'autoSellSoldQty' | 'autoSellBasisPrice'` · 라벨 `'누적 매도' | '기준'` 추가. 렌더는 `setting-group.tsx` `DerivedRow`(`:796-845`) — 「기준」 은 값만이 아니라 「{상한가|매수가} N원」 이라 `DerivedRow` 의 값 포맷 자리를 넓혀야 한다.
- 시작조건 0 의미어: `lcValueTextOf`(`:500-525`)에 `case 'autoSellStartCond': return v === 0 ? '이탈 후 다음 체결' : null;`(단위 `%`).
- `lcSummaryOf`(`:556-600`)에 `case 'auto-sell'` — 시작조건 · 비율 · 방법 · 누적(0 이면 「—」 off) · 기준(상태 0 또는 basis 0 이면 「—」).
- `lcRangeIssue` — 비율은 `range` 를 두되 **`autoSellEnabled` 일 때만 1~50**(postBuyReboundPct 조건 규칙 `:688-689` 동형), 방법 1~3 도 같은 조건. 꺼진 레거시 에코 0 이 다른 카드 필드 확정까지 막지 않게.
- `PadUnit`(`lib/numpad.ts:25` `'원' | '주' | '만원' | '%' | '건' | '회'`) — 카드 쪽은 `%` 로 충분. **`/me` 「매도 주기 (초)」 는 `'초'` 단위가 없다** → `PadUnit` 에 `'초'` 추가(그에 딸린 `rangeIssueText` 문구 · 키패드 표시 확인).
- `LC_GATE_FIELDS`(`use-lc-field-commit.ts:201-205`)에 `'autoSellEnabled'` — 미등록 폼에서 자동매도 스위치가 첫 등록이 될 수 있다(서버 「자동매도만 켠 등록도 등록」). 끄기는 무장 해제(`isDisarm`) 경로.
- `strategy-log.tsx` `VALUE_COMPARE_SKIP`(`:268-284`)에 `'autoSellEnabled'`(게이트 축 — 61/54 사유 줄이 말한다). S→C 4필드는 shared `LIMIT_CHASER_SERVER_ONLY_FIELDS` 를 통해 자동 반영되도록 **새 그룹 상수**(`LIMIT_CHASER_SERVER_AUTO_SELL_FIELDS`)를 만들어 `SERVER_ONLY` 와 `RUNTIME_ONLY_SKIP` 양쪽에 들어가게 한다(상태·누적 변화만 있는 300ms 푸시가 「서버 반영 완료」 로 찍히거나 `isRuntimeOnlyEcho` 를 깨지 않게).

#### 4-d 카드 렌더 · 41 · LED
- 매도 pane 렌더: `limit-chaser-form.tsx:1623-1624` `{pane('sell', LC_SELL_GROUPS, sellReasons)}` — 그룹 배열에 추가만 하면 pane 이 그린다. 제목줄 칩은 후매수 칩(`card-body.tsx:140-160` `cardGroupStatusOf`)과 같은 자리. 버튼 행은 새 행 종류(또는 그룹 꼬리 노드)로.
- **41 in-flight 는 `lc.arm` 패턴을 복제한다**(`strategy-card.tsx:369-390, 455-470, 589-606`): `armInFlightRef` 와 같은 `autoSellCmdInFlightRef`(+ 액션 start/stop), 3초 타이머, 키 일치 60 에코 수신 시 기대 전이 확인 → 해제, 54 판정 `isAutoSellCommandRejection` → `acceptAnswer()` + 로그. **주의:** 지금 키 일치 에코 이펙트(`:463-470`)는 **어떤 에코든** `armInFlightRef=false` + `acceptAnswer()` 한다 — 41 에 그대로 쓰면 300ms 런타임 푸시(누적 수량 변화 등)가 41 의 답으로 오인된다. 41 은 「기대 전이를 싣은 에코」 일 때만 해제하는 별도 판정을 둔다(D-08). 서버는 41 처리 끝에 `PushLimitChaserEcho` 를 **즉시** 보내고 Start 는 `m_asState.exchange(Selling)` 을 그 전에 동기로 끝낸다 `[VERIFIED: gh-trade LimitChaser.cpp:4623, Gateway.cpp:3830]` — 즉답 에코에 `auto_sell_state=3` 이 실린다.
- **41 과 lc.set 의 동시 비행 금지 권고:** `useLcFieldCommit` 은 「답 신호(`serverAnswerSeq`)가 올랐는데 주 필드가 다르면 거부」 로 판정한다(파일 머리 ③ · ⑧). 41 의 에코가 lc.set in-flight 중에 오면 그 에코가 `acceptAnswer` 를 올리고 lc.set 의 주 필드와 달라 **lc.set 이 거부로 오판**될 수 있다. 권고: 훅이 busy(in-flight · 대기열 · 장벽)면 바로시작·중지 비활성, 41 in-flight 중이면 자동매도 그룹 필드 확정을 막거나 훅에 외부 장벽으로 알린다. (D-08 재량 「같은 큐에 넣을지」 의 답 — 같은 큐는 훅 구조상 어렵고, **상호 배제**가 단순하다.)
- **LED 4번째:** `latch-led.tsx:42` `export type LatchLedKind = "buy" | "sell" | "cancel";` · `:51` `export type LatchLedTone = "off" | "latent" | "armed";` · `:54` `export type LatchLedLabel = "OFF" | "대기" | "감시" | "보유중";` → kind `'autoSell'`, tone 에 파랑(완료) 단계 추가, label 에 「매도중」「완료」 추가, `LATCH_LED_NAMES.autoSell = "자동"`, `DOT_CLASS` 에 새 tone. `ArmableLatchKind = Exclude<LatchLedKind, "buy">` 는 `Exclude<…, "buy" | "autoSell">` 로 — `onArm` 이 자동매도를 받지 못하게 타입으로 막는다. `LED_KINDS` 는 **두 곳**이다: `card/card-header.tsx:66` 과 `layout/app-sidebar.tsx:117` — D-04 는 카드 헤더 칩·접힌 점을 말한다. 사이드바 점까지 넣을지는 Open Q(아래 4-f).
- 판정 입력: `auto_sell_state` 0 이면 OFF(체크가 켜져 있어도 상태 0 이면 서버가 아직 대기로 안 세운 순간 — 에코 진실). 툴팁 WinForms 원문 `상태 · 기준 N원` `[CITED: limit-chaser.md 「LED 툴팁」]`.

#### 4-e `/me` 상따 기본설정 섹션
- 삽입 자리: `me-client.tsx:292-299` 원문 순서 `<div className="mb-1"><AccountCard /></div>` → `<MeStatusBar />` → `<StrategyStatusCard />`. D-10 「계정 카드 아래 · 전략 현황 위」 — `MeStatusBar` 의 앞/뒤는 목업(계정 카드 바로 아래 섹션, 상태 줄은 목업에서 계정 카드 **위**)을 보고 정한다. DmaGate 분기(`:275-283`)에서는 섹션을 그리지 않는다(84 가 올 수 없다).
- 행 문법은 카드와 같은 「라벨 ─ 값 ›」 — `SettingRow`(`setting-group.tsx:163-275`) · `NumberPadSheet`(`lc/number-pad-sheet.tsx`) · `InlineValueEditor` 재사용. 방법 기본값은 4-c 의 choice 행 컴포넌트 재사용.
- **42 직렬화 필수(재량 「큐 또는 마지막 승」 의 답 = 큐):** 42 는 11값 전체 교체라, 행 A 의 42 가 84 를 받기 전에 행 B 를 「서버 캐시 + B」 로 보내면 **A 가 되돌려진다.** 한 번에 1건 비행, 다음 건은 84 수신 뒤 **새 캐시**로 다시 조립(useLcFieldCommit ⑦ 「꺼낼 때 새 서버 값으로 다시 판정」 동형). 3초 무응답이면 그 행 실패 표시 · 재시도 없음.
- 거부 판정: `messages` 에서 `lv==="ERROR" && src==="SetUserSettings"`(i·a 빈 값) — 42 in-flight 창 안에서만 그 행 실패로 귀속(다른 탭의 거부도 팬아웃된다). 원문 「매도 주기는 1~60초여야 합니다(받은 값 99)」 류를 섹션 아래 빨간 한 줄로.
- 성공 판정: in-flight 뒤 도착한 84 의 그 칸이 보낸 값과 같으면 성공(플래시 0.7초). 다른 탭의 42 로 온 84 도 값이 바뀐 행은 플래시해도 무방(목업 동작).

#### 4-f 주문로그
- `order-log-feed.ts:35` `export type OrderLogKindFilter = 'all' | 'pre' | 'add' | 'post' | 'sell' | 'manual' | 'vi' | 'market';` · `:105-112` `KIND_GROUPS = { pre: [1], add: [2], post: [3], sell: [4, 5, 6], manual: [7], vi: [8] }` · `:220` 쿼리 허용 집합 `KINDS`. → `'auto'`(키 이름 재량) 추가, `KIND_GROUPS.auto = [9]`, `ORDER_LOG_KIND_FILTERS`(`:48-57`)의 `{ value: 'sell', label: '매도' }` 뒤에 `{ value: 'auto', label: '자동매도' }`, `KINDS` 집합에 추가(창 분리 쿼리). **기존 「수동」「VI」 칩은 유지**한다 — D-14 목록에 둘이 빠진 것은 Phase 25 UI-SPEC 시점 목록을 옮긴 것으로 보인다(Open Q8).
- WR-05 로 kind 6 이 group 4/5/6 으로 잘못 찍힌 자동매도 줄은 「자동매도」 필터에 안 걸린다 — 필터를 토큰까지 볼지는 Open Q5 와 함께.
- 팝업 `sideFilterKind`(`:166-170`)의 「매도」 → `'sell'`(4~6) 이라 자동매도가 팝업 「매도」 에서 창으로 넘어갈 때 빠진다 — `matchesSide` 는 tone(=sell)로 걸러 팝업 안에서는 보인다. 창 분리 매핑을 `'all'` 로 둘지 플래너 판단.

### Anti-Patterns to Avoid
- **생성물 손편집:** `relay/src/generated/**` 는 스크립트만 쓴다(다음 동기화에서 소실).
- **화이트리스트만 넓히고 hub case 를 다음 커밋으로:** PC-12 — 그 사이 빌드에서 84 가 `default:` 로 조용히 떨어진다(`codec.test.ts` 주석).
- **`buy3_schema` 를 브라우저 입력으로 받기:** 파생만(T-24-01). 4필드 존재 판정 외의 경로 금지.
- **41 성공을 「아무 에코」 로 판정:** 300ms 런타임 푸시 오인.
- **42 를 화면 값으로 조립:** 서버 캐시(84) + 바뀐 1칸만. 화면 로컬 값을 실으면 다른 탭이 바꾼 칸을 덮는다(T-20-03 동형).
- **54 본문 파싱:** 「보유수량 0」 같은 문구로 분기 금지(교훈 24 · Phase 24 D-13).
- **15:40 해제 귀속에 자동매도 포함:** 서버가 15:40 에 자동매도를 내리지 않는다.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TS FlatBuffers 코드 | 손으로 쓴 접근자 | `sync-relay-schema.sh` (flatc 25.12.19) | 가드 3종(deprecated 슬롯 봉인 · 버전 고정) |
| 요청 in-flight · 3초 미반영 | 새 타이머 기계 | `strategy-card.tsx` `startAckWait`/`acceptAnswer`/`armInFlightRef` 패턴 | 미반영 고착 사고(`lc-unacked-stuck-new-route`)를 이미 고친 기계 |
| 사용자별 로그인 푸시 캐시 | 새 캐시 계층 | hub `#queuedWindows` 77 패턴 | 3상태(모름/값) · Ready 게이트 · 세션 교체 폐기 완비 |
| 숫자 입력 시트/인라인 | 새 입력 컴포넌트 | `NumberPadSheet` · `InlineValueEditor` · `SettingRow` | 범위 잠금 · 접근성 이름 · 포커스 복귀 |
| 54 배지 | 컴포넌트별 문자열 | shared `serverMsgBadge` | 동등 비교 한 곳(D-17 Phase 17) |
| 문장 조립 | 표면별 문자열 | shared `strategyEventParts` | D-09 |
| 폼 시딩 「손대지 않은 칸만」 | 새 dirty 추적 | `limit-chaser-form.tsx:723-743` `touchedRef`/`seededRef` | D-17 상장주식수 시딩과 같은 규칙 |
| 브라우저 프레임 검증 | 수동 if 검사 | zod 스키마 + `RelayInboundSchema` union | 위반 = close(4400) 규약 일원화 |

**Key insight:** 이 phase 의 모든 기능은 직전 6개월 안에 같은 모양으로 한 번씩 만들어졌다. 새 추상을 만들면 선례 코드에 박힌 사고 교훈(PC-12 · Pitfall 6/10 · T-16-10)을 잃는다.

## Common Pitfalls

### Pitfall 1: `buy3Schema === 3` 동등 비교로 「버스트 시 해제」 소실
**What goes wrong:** schema 4 로 올리면 `envelope.ts:1467` 이 false → `extra_buy_burst_release` 미적재 → 서버(≥3 이면 읽음)가 부재 = false 로 저장.
**How to avoid:** `>=` 로. 단위 테스트: 「schema 4 프레임에 `extraBuyBurstRelease: true` 가 실린다」.
**Warning signs:** 자동매도 배포 뒤 추가매수 ☐버스트 시 해제가 혼자 꺼진다.

### Pitfall 2: 자동매도만 켠 등록이 삭제로 나감
**What goes wrong:** 웹 `isDeleteIntent`(5항)·relay `#isTeardown`(5항)에 `autoSellEnabled` 가 없으면 「자동매도 스위치만 ON」 확정이 `crud:"D"` + 철거 경로.
**How to avoid:** 두 곳을 같은 커밋에서 6항으로. 테스트: 「autoSellEnabled 만 true → crudOf === 'C'」 · relay 「#isTeardown false」.

### Pitfall 3: 자동매도 54 줄이 화면에 안 나옴
**What goes wrong:** `isLimitChaserServerMessage` 가 `"AutoSell"`·`"AutoSellCommand"` 를 모른다 → 카드 로그·전 종목 피드 모두 스킵.
**How to avoid:** 두 src 추가 + 테스트. 배지(`serverMsgBadge`)는 Open Q2 결과대로.

### Pitfall 4: 84 가 Ready 전에 온다
**What goes wrong:** 84 는 LoginResp → 77 → 84 순(`Gateway.cpp:1196-1220`)으로 계좌 선언 전에 온다. Ready 게이트로 버리면 탭이 영영 「불러오는 중」.
**How to avoid:** 캐시는 늘 · 팬아웃은 Ready 뒤 · 인증 재생은 캐시 · `#onReady` 43 으로 재확인(77 패턴). 테스트: 「Ready 전 84 → 캐시만, 인증한 새 탭은 user.settings 1프레임」.

### Pitfall 5: 비율 0 · 방법 0 으로 저장되어 바로시작 거부
**What goes wrong:** schema 4 에서 0 은 FlatBuffers 기본값이라 부재로 나가고 서버는 0 으로 저장(꺼진 채 저장 허용). 41 Start 가 「자동매도 설정이 올바르지 않습니다(…비율 1~50 · 방법 1~3)」 로 거부.
**How to avoid:** 폼 기본값 10/3(또는 84 시딩), 에코가 0 이면 그대로 들이되 켜는 확정은 `lcRangeIssue` 조건 규칙이 막는다.

### Pitfall 6: 41 에코와 lc.set in-flight 교차
**What goes wrong:** 41 즉답 에코가 lc.set 의 답 신호로 소비되어 lc.set 이 「거부」 로 표시되거나, 그 반대로 lc.set 에코가 41 을 성공으로 오인.
**How to avoid:** 상호 배제(훅 busy 면 버튼 비활성, 41 in-flight 면 그룹 확정 잠금) + 41 은 기대 전이로만 해제.

### Pitfall 7: 85 warn 홍수
**What goes wrong:** gh-trade Phase 27 서버가 배포되면 85 가 quote 연결로 키당 1초마다 온다. `OUT_OF_SCOPE` 에 없으면 warn 로그 폭증.
**How to avoid:** 85 를 `OUT_OF_SCOPE_INBOUND_MSG_TYPES` 에(debug). `envelope.test.ts:270` 갱신.

### Pitfall 8: 42 연속 편집이 앞 칸을 되돌림
**What goes wrong:** 11값 전체 교체 + 캐시 기준 조립에서 in-flight 중 다음 칸을 낡은 캐시로 보냄.
**How to avoid:** 1건 비행 · 84 수신 뒤 새 캐시로 다음 건 조립.

### Pitfall 9: 사용자 설정 범위 ⊄ lc.set 범위 (시딩 오염)
**What goes wrong:** 서버 42 범위는 `sell_qty_track_ratio 0~90` · `post_buy_rebound_pct 0~100` 인데 relay `lc.set` zod 는 `sellQtyTrackRatio` **1~90**(`protocol.ts` `z.number().int().min(1).max(90)`), 후매수 ON 이면 반등 1~100. WinForms 가 0 을 저장해 84 로 오면 그 값으로 시딩된 새 폼은 `lcRangeIssue` 에 걸려 **어떤 확정도 못 보낸다**(마지막 방어선이 막음).
**How to avoid:** 시딩 때 lc 범위 밖이면 D-04 상수로 폴백(칸별) + `/me` 시트 입력 범위를 교집합으로 둘지 사용자 확인(Open Q7).

### Pitfall 10: 기존 프레임 개수 단언 흔들림
**What goes wrong:** fake gateway 가 43 에 늘 84 로 답하면 fanout/hub 통합 테스트의 「인증 직후 프레임 목록」 단언이 새 `user.settings` 프레임으로 깨진다.
**How to avoid:** 시드 옵션 기본 null(무응답) — 새 테스트에서만 켠다.

### Pitfall 11: 옛 relay + 새 webapp
**What goes wrong:** 옛 relay zod 는 `autosell.cmd`/`user.settings.set` 을 모르는 `t` 로 보고 close(4400) → 탭의 시세·에코·수동주문까지 끊긴다.
**How to avoid:** relay 배포·smoke 통과 뒤에만 push(메모리 「배포는 relay 먼저·push 나중」). webapp 쪽에 relay 버전 탐지를 만들 필요는 없다.

### Pitfall 12: 옛 탭의 철거 재제출
**What goes wrong:** 배포 직후 새로고침 안 한 탭이 게이트 전부 OFF(`crud:"D"`) 를 schema ≤3 으로 보내면, 서버의 schema<4 가드는 「요청 4필드 무시·저장값 유지」 이지만 명시 `D` 는 삭제다 — 자동매도만 켜 둔 등록이 지워질 수 있다.
**How to avoid:** 배포 공지(새로고침) 수준으로 수용. 위험 낮음(옛 탭 수명이 짧다) — 플랜에 「배포 직후 열린 탭 새로고침」 운영 메모.

## Code Examples

### relay — schema 4 파생 (권장 모양)
```ts
// relay/src/dma/envelope.ts — lcBuy3SchemaOf 확장 (기존 1·2·3 분기는 원문 그대로)
export const LC_AUTO_SELL_BUY3_SCHEMA = 4;
type AutoSellReqKey = "autoSellEnabled" | "autoSellStartCond" | "autoSellRatioPct" | "autoSellMethod";
export function lcBuy3SchemaOf(
  cfg: Pick<LcSetCfg, "postBuyAuto" | "extraBuyBurstRelease" | AutoSellReqKey>,
): number {
  if (cfg.postBuyAuto === undefined) return LC_FIXED_BUY3_SCHEMA;
  if (cfg.extraBuyBurstRelease === undefined) return LC_POST_BUY_AUTO_BUY3_SCHEMA;
  if (
    cfg.autoSellEnabled === undefined || cfg.autoSellStartCond === undefined ||
    cfg.autoSellRatioPct === undefined || cfg.autoSellMethod === undefined
  ) return LC_BURST_RELEASE_BUY3_SCHEMA;
  return LC_AUTO_SELL_BUY3_SCHEMA;
}
// 조립부: (기존 :1467) `buy3Schema === LC_BURST_RELEASE_BUY3_SCHEMA` → `>=`
// 그 뒤: if (buy3Schema === LC_AUTO_SELL_BUY3_SCHEMA) { addAutoSellEnabled / StartCond / RatioPct / Method }
// auto_sell_state · sold_qty · basis · basis_price — S→C 전용. 싣지 않는다.
```

### relay — 41 빌더 (권장 모양)
```ts
export function buildAutoSellCommandReq(req: {
  isin: string; accountNo: string; exchange: RelayExchange; action: 1 | 2;
}): Uint8Array {
  const isin = truncateToWire(req.isin, 12, "isin");
  const accountNo = truncateToWire(req.accountNo, MAX_ACCOUNT_NO_LEN, "accountNo");
  if (!isValidIsin(isin)) throw new OrderBuildError("BAD_ISIN", "ISIN 형식 위반");
  if (!isValidAccountNo(accountNo)) throw new OrderBuildError("BAD_ACCOUNT_NO", "계좌번호 형식 위반");
  if (!isValidExchange(req.exchange)) throw new OrderBuildError("BAD_EXCHANGE", "알 수 없는 거래소");
  const b = new flatbuffers.Builder(128);
  const isinOff = b.createString(isin);            // 문자열은 테이블 열기 전에 (T-16-05)
  const acctOff = b.createString(accountNo);
  const exOff = b.createString(req.exchange);
  AutoSellCommandReq.startAutoSellCommandReq(b);
  AutoSellCommandReq.addIsin(b, isinOff);
  AutoSellCommandReq.addAccountNo(b, acctOff);
  AutoSellCommandReq.addExchange(b, exOff);
  AutoSellCommandReq.addAction(b, req.action);
  const table = AutoSellCommandReq.endAutoSellCommandReq(b);
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.AutoSellCommandReq);
  Envelope.addAutoSellCommandReq(b, table);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}
```
(`startAutoSellCommandReq`/`endAutoSellCommandReq` 이름은 flatc 생성 관례 — 동기화 뒤 `stock-dma/auto-sell-command-req.ts` 에서 확인할 것 `[ASSUMED: 생성물 start/end 메서드명]`. `addIsin`·`addAccountNo`·`addExchange`·`addAction` 은 `[VERIFIED: scratchpad gen auto-sell-command-req.ts:55-67]`.)

### shared — 자동매도 토큰 판정
```ts
const AUTO_SELL_TOKENS: Readonly<Record<string, true>> = {
  AutoSellAsk1: true, AutoSellBid1: true, AutoSellTrigger0: true, AutoSellTriggerN: true,
  AutoSellModify: true, AutoSellStateChange: true, AutoSellPauseVI: true, AutoSellPauseAuction: true,
  AutoSellResume: true, AutoSellStartCancel: true, AutoSellBuyFirstCancel: true,
  AutoSellAuctionTrimCancel: true, AutoSellAuctionOrder: true,
};
export function reasonToken(reasonCode: string): string {
  const i = reasonCode.indexOf(" ");
  return i < 0 ? reasonCode : reasonCode.slice(0, i);
}
export function isAutoSellReason(reasonCode: string): boolean {
  return Object.hasOwn(AUTO_SELL_TOKENS, reasonToken(reasonCode)); // 프로토타입 키 방어
}
```

### webapp — 41 거부 판정
```ts
export function isAutoSellCommandRejection(
  msg: { src: string; i: string; a: string; lv: string },
  isin: string, accountNo: string,
): boolean {
  if (isin === '' || accountNo === '') return false;
  if (msg.lv !== 'ERROR') return false;
  if (msg.src === 'AutoSellCommand' || msg.src === 'Account') return msg.i === isin && msg.a === accountNo;
  if (msg.src === 'Relay') return msg.i === '' && (msg.a === '' || msg.a === accountNo);
  return false;
}
// 본문 m 은 읽지 않는다 — 41 in-flight 창 안에서만 호출한다.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 상따 카드 더티 누적 + 「수정」 | 확정 1회 = `lc.set` 1회 | Phase 20 D-04 | D-07 「더티」 전제 무효(Open Q1) |
| `buy3_schema` 1 고정 | 필드 존재 단조 파생 1/2/3 → 4 | quick-260929-vzy · 261003-rc4 · 이번 | 조립기 비교 연산자 점검 필요(Pitfall 1) |
| 상따 사유 줄 `[상따]` 접두 문구 | `source` 열거로 배지 | quick-260917-lmm | 자동매도는 `"AutoSell"` 새 값 |

**Deprecated/outdated:** CONTEXT 의 `65caaf2e` 는 더 이상 master HEAD 가 아니다(현재 `7cc7ffaa`, blob 동일). 인박스 노트 `from_commit` 은 그대로 둬도 되며, SUMMARY 에 실제 동기화 커밋(`2404509b` 마커)을 적는다.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | flatc 생성 `AutoSellCommandReq.startAutoSellCommandReq`/`endAutoSellCommandReq`·`UserSettings.startUserSettings`/`endUserSettings` 메서드명 | Code Examples | 낮음 — 동기화 직후 typecheck 가 잡는다 |
| A2 | quote 관찰자·저널 관찰자 연결은 84 를 받지 않는다(84 는 사용자 `LoginReq` 경로 + 같은 GetId 세션 브로드캐스트만) | 2-c | 낮음 — 와도 명시 case 로 warn 만 |
| A3 | 옛 탭 `crud:"D"` 철거가 자동매도만 켠 등록을 지울 수 있다(서버 명시 D 처리) | Pitfall 12 | 낮음 — 운영 메모로 수용 |
| A4 | D-14 목록에서 「수동」「VI」 가 빠진 것은 누락이며 유지가 의도 | 4-f | 낮음 — Open Q8 |
| A5 | 84 수신 시 `present` 외 11값은 늘 채워 온다(내장값 포함) | 4-b | 낮음 — fbs 주석·Gateway 빌더가 그렇게 말한다 |

## Open Questions (RESOLVED)

> 2026-10-05 전부 해소 — 1~4 는 사용자 답이 CONTEXT 결정 개정(D-04 · D-05 · D-07 · D-17)으로, 5~8 은 CONTEXT 「리서치 뒤 정보성 반영」 블록에 권고 채택으로 기록됐다. 각 항목의 `RESOLVED:` 줄이 근거와 반영 플랜이다.

**플래닝 전에 사용자에게 물을 것 (CONTEXT 결정의 전제가 코드·gh-trade 와 다름):**

1. **D-07 「자동매도 카드에 더티」 — 상따 카드에는 더티가 없다.**
   - What we know: `limit-chaser-form.tsx:41-48` 원문 「더티 누적도 「수정/되돌리기」 액션 바도 **없다** — 옛 더티 모델은 이 plan(20-04)에서 폐기됐다」. 값 필드는 낙관 반영도 없어 「보인 값 = 서버 값」 이 불변식이다. CONTEXT 가 「더티 판정 원천」 으로 든 `dirty-action-bar.tsx` 는 상따 카드에서 쓰이지 않는다.
   - What's unclear: D-07 의 의도(「화면 값 = 서버 값이 보장된 뒤에만 누른다」)를 무엇으로 대신할지.
   - Recommendation: 「자동매도 그룹 필드의 확정이 비행 중 · 대기 중 · 실패 표시 중이면 바로시작 비활성」 으로 재해석(중지는 항상 활성 — D-07 원문 유지). 사용자 확인.
   - **RESOLVED:** 재해석 채택(CONTEXT D-07 2026-10-05 개정) — 자동매도 그룹 필드 확정이 in-flight · unacked · 실패 표시 중이면 「바로시작」 비활성, 「중지」 는 확정 상태와 무관하게 늘 활성, 다른 그룹 무관, lc.set → 41 두 단계 자동 전송 없음. 반영: 27-05 `autoSellStartBlocked`.

2. **D-17 「자동매도」 배지 — 고칠 자리와 WinForms 동작이 다르다.**
   - What we know: (a) 54 줄 배지는 shared `serverMsgBadge`(`strategy-display.ts:84-88`)이고 `OriginTagLabel` 은 주문 행 칩이다. (b) WinForms 는 54 `"AutoSell"` 줄을 **`[상따]`** 로 그린다 — `NotificationHub.cs:636-644` 「자동매도 사유 줄(source "AutoSell", Phase 28 D-23)은 상따 전략의 한 갈래라 [상따] 배지다 — 서버 본문이 「자동매도 …」 로 시작하므로 [자동매도] 배지를 달면 「[자동매도] 자동매도 발동 …」 으로 낱말이 겹친다」. `"AutoSellCommand"` 는 `FromWireOrigin` 이 모르는 값이라 `[서버]`. WinForms `[자동매도]` 는 51 주문 통보 태그(`OriginTag`)에만 있다(그런데 서버 `OriginName` 은 AutoSell 을 내지 않는다).
   - Recommendation: 사용자에게 (i) WinForms 대로 `"AutoSell"` → `[상따]`, `"AutoSellCommand"` → `[상따]` 또는 `[서버]` / (ii) 결정대로 `[자동매도]`(낱말 중복 수용) 중 선택을 묻는다. 어느 쪽이든 수정 자리는 `serverMsgBadge` 한 곳.
   - **RESOLVED:** WinForms 동형 `[상따]` (CONTEXT D-17 2026-10-05 개정 — `[자동매도]` 신설 배지 폐기) — `"AutoSell"` 사유 줄 · `"AutoSellCommand"` 거부 줄 모두 `[상따]`, 수정 자리는 shared `serverMsgBadge` 한 곳, `OriginTagLabel` 무변경. 반영: 27-03(배지) · 27-05(표시 몫 결손 ③).

3. **D-04 LED 색 — WinForms 와 다르다.**
   - What we know: WinForms 자동매도 LED 「0 없음·null·범위 밖 `Gray` · 1 대기·4 완료 `DarkOrange` · 2 감시·3 매도중 `LimeGreen`」 `[CITED: gh-trade docs/strategy/limit-chaser.md 「자동매도 칸 (Phase 28 …)」 줄]`. 채택 목업·D-04 는 대기·감시 초록 · 매도중 주황 · 완료 파랑. `latch-led.tsx` 머리 주석: 「색 규칙이 C# 정본과 한 글자라도 갈리면 사용자가 무장 상태를 오독하고 실계좌 주문이 나간다」.
   - Recommendation: 두 화면을 오가는 사용자 기준으로 확인. 목업 채택이 의도적 차이라면 그대로(라벨 글자가 상태를 말하므로 WCAG 문제는 없음).
   - **RESOLVED:** WinForms 동형 LED 색 (CONTEXT D-04 2026-10-05 개정 — 목업 색 대체) — 0 · null · 범위 밖 회색 OFF · 1 대기 · 4 완료 주황 `--led-latent` · 2 감시 · 3 매도중 초록 `--led-armed`, 파랑 없음 · 새 토큰 없음. D-03 제목줄 칩도 같은 규칙(대기 · 완료 amber · 감시 · 매도중 green). 반영: 27-01(LED) · 27-04(칩).

4. **D-05 「중지」 활성 조건 — WinForms 는 감시(2)에서도 중지.**
   - What we know: `LimitChaserForm.cs:6427-6430` `AutoSellRunning(s) => s.AutoSellState == 2 || s.AutoSellState == 3` → 감시·매도중이면 「중지」. D-05/목업은 매도중(3)만.
   - Recommendation: 감시 중에는 스위치 끄기(lc.set `autoSellEnabled=false`)로도 같은 효과라 D-05 도 동작상 문제는 없다 — 차이만 알리고 확인.
   - **RESOLVED:** WinForms 동형 (CONTEXT D-05 2026-10-05 개정 — 목업의 「3 만 중지」 대체) — 감시 2 · 매도중 3 이면 「중지」 만, 그 밖(0 · 1 · 4)은 「바로시작」 만 활성. 반영: 27-05 `autoSellButtonsOf`.

**정보성 (플래너가 반영, 필요 시 사용자 확인):**

5. **WR-05 쌍은 7↔9 가 아니라 4/5/6 ↔ 9** (`28-REVIEW.md:173-181`). 조립기는 토큰 우선 본문 판정(§3-c). 「자동매도」 필터(group 9)를 토큰으로도 넓힐지 — 권고: 필터는 group 그대로(서버가 말한 group), 본문만 토큰.
   - **RESOLVED:** 권고 채택(CONTEXT 「리서치 뒤 정보성 반영」 첫 줄) — 뒤바뀜 쌍은 4/5/6 ↔ 9, 조립기 본문은 `AutoSell` 토큰 우선, 「자동매도」 필터(D-14)는 서버가 말한 group 9 그대로. 반영: 27-03(본문) · 27-08(필터).
6. **상태 0 낱말:** D-15 「없음」 vs 서버 54 문구·WinForms 「꺼짐」(`자동매도 꺼짐 → 대기 (기준 상한가)`). 같은 로그 패널에 54 줄과 kind 13 줄이 나란히 서므로 **「꺼짐」 권고**.
   - **RESOLVED:** 「꺼짐」 채택(CONTEXT 「리서치 뒤 정보성 반영」 둘째 줄 — D-15 의 「없음」 대체). 반영: 27-03(kind 13 본문) · 27-01(LED OFF 툴팁 「자동매도 꺼짐」).
7. **사용자 설정 범위 vs lc 범위**(Pitfall 9): `/me` 시트의 잔량추적·반등 입력 범위를 서버 범위(0~)로 둘지 lc 호환 범위(1~)로 좁힐지. 시딩 폴백은 어느 쪽이든 필요.
   - **RESOLVED:** 권고 채택(CONTEXT 「리서치 뒤 정보성 반영」 셋째 줄) — `/me` 시트 입력 범위는 서버 범위 그대로(shared `USER_SETTINGS_RANGES`), 새 폼 시딩(D-11)은 lc 범위 밖 값이면 D-04 상수로 폴백. 반영: 27-02(범위 상수) · 27-06(시트) · 27-07(시딩 폴백).
8. **D-14 칩 목록:** 기존 「수동」「VI」 유지 + 「매도」 뒤 「자동매도」 삽입으로 해석(A4).
   - **RESOLVED:** 그 해석 채택(CONTEXT 「리서치 뒤 정보성 반영」 넷째 줄). 반영: 27-08.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| flatc | G① 동기화 | ✓ | 25.12.19 (정확 일치 요구 충족) | — |
| gh-trade 저장소(master) | G① | ✓ | HEAD `7cc7ffaa`, fbs blob `68679e9a` | — |
| Node | 전 워크스페이스 | ✓ | v22.22.0 | — |
| pnpm | 빌드·테스트 | ✓ | 11.15.1 | — |
| Playwright + 로컬 relay(:8090) + webapp dev(:3100) | e2e | ✓(기존 phase 사용) | ^1.59.1 | — |
| GCP Deployer SA · `deploy-relay.sh` · `smoke-relay.sh` | G⑤ 배포 | 메인 세션 전용 | — | executor 는 실행 금지(체크포인트) |

**Missing dependencies with no fallback:** 없음.
**Missing dependencies with fallback:** 없음.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4 (relay node · webapp jsdom · shared node) + Playwright 1.59 (webapp e2e) |
| Config file | `relay/vitest.config.ts`(include `tests/**/*.test.ts`, `src/**/*.test.ts`) · `webapp/vitest.config.ts`(include `src/**/*.test.{ts,tsx}`) · shared 는 설정 파일 없음(기본) · `webapp/playwright.config.ts` |
| Quick run command | 아래 「표면별」 |
| Full suite command (config `build_command` + `test_command` 원문) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck` 그리고 `pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test` |

**표면별 quick 명령 (Phase 25/26 플랜에서 실제로 쓴 형태 그대로):**
- shared: `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/strategy-event-text.test.ts src/__tests__/strategy-event-labels.test.ts src/__tests__/strategy-display.test.ts && pnpm --filter @gh-radar/shared build` (shared `test` 스크립트는 watch 라 `exec vitest run` 을 쓴다)
- relay: `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay exec vitest run src/dma/__tests__/codec.test.ts src/dma/__tests__/envelope.test.ts tests/hub.test.ts tests/fanout.test.ts tests/protocol.test.ts`
- webapp unit: `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run <파일들>`
- webapp e2e: `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/me.spec.ts e2e/specs/order-log.spec.ts` (`.next` 캐시로 webServer 타임아웃이면 `rm -rf webapp/.next` — 메모리)
- server 회귀(shared 변경 영향): `pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run tests/routes/strategy-events.test.ts`
- 동기화 멱등: `cd /Users/alex/repos/gh-trade/server && RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh --check` → 「신규/변경 예정 : 0 개」

### Phase Requirements → Test Map
| Goal | Behavior | Test Type | Automated Command / 파일 | File Exists? |
|------|----------|-----------|-------------------|-------------|
| G① | 생성물 반영·멱등 · MSG 대조 · 화이트리스트 27종 · OUT_OF_SCOPE 85 | unit | `src/dma/__tests__/codec.test.ts` · `envelope.test.ts`(:270 갱신) | ✅ (단언 갱신) |
| G② | schema 1/2/3/4 파생 · 버스트 필드 schema 4 동반 · 에코 4필드 미적재 · readLimitChaser 8필드 | unit | `src/dma/__tests__/envelope.test.ts` (기존 `:1465` 파생 케이스 옆) | ✅ |
| G② | 41/42/43 인코딩 · 84 파싱(present/11값) | unit | `envelope.test.ts` | ✅ (케이스 추가) |
| G② | 84 Ready 전 캐시만 · Ready 뒤 팬아웃 · 세션 교체 폐기 · #onReady 43 송신 · feed 84 명시 case(unhandled 0) | integration | `tests/hub.test.ts` | ✅ |
| G② | 인증 직후 user.settings 재생(모르면 안 보냄) · autosell.cmd 세션/계좌 가드 · user.settings.set · #isTeardown 자동매도 | integration | `tests/fanout.test.ts` | ✅ |
| G② | zod: 4필드 선택 · 켜면 범위 · 새 프레임 2종 · 서버전용 키 strip | unit | `tests/protocol.test.ts` · `src/ws/__tests__/protocol.test.ts` | ✅ |
| G③ | kind 6 g9 주기/회차 · 11/12/13/14 · cancel 10/11 · 토큰 판정 · WR-05 토큰 우선 · 모르는 토큰 폴백 | unit(골든) | `packages/shared/src/__tests__/strategy-event-text.test.ts` · `strategy-event-labels.test.ts` | ✅ |
| G③ | 배지(Open Q2 결과) | unit | `strategy-display.test.ts` | ✅ |
| G④ | crudOf/isActiveStrategy 자동매도 · 기본값 · formFromServer · 41 거부 판정 · 표시 몫 | unit | `webapp/src/lib/__tests__/limit-chaser.test.ts` | ✅ |
| G④ | 그룹 스펙 · choice 행 · 요약 · 범위 조건 | unit | `components/trading/lc/__tests__/lc-fields.test.ts` · `setting-group.test.tsx` | ✅ |
| G④ | LED 4번째 판정·색·클릭 불가 | unit | `components/trading/__tests__/latch-led.test.tsx` · `card-header.test.tsx` | ✅ |
| G④ | 41 버튼 활성(D-05/D-07/D-09) · in-flight · 기대 전이 해제 · 3초 미반영 · 거부 해제 · lc.set 상호 배제 | component | `components/trading/__tests__/strategy-card.test.tsx` · `strategy-card-flow.test.tsx` · `limit-chaser-form.test.tsx` | ✅ |
| G④ | 84 스토어(3상태) | unit | `lib/__tests__/relay-socket.test.ts` | ✅ |
| G④ | `/me` 섹션 칩 3상태 · 즉시 42 · 직렬화 · 84 플래시 · SetUserSettings 거부 · 시딩 | component | `components/trading/__tests__/me-client.test.tsx` + 신규 `components/me/__tests__/limit-chaser-defaults.test.tsx` | ❌ Wave 0 (신규 파일) |
| G④ | 신규 폼 84 시딩 · touched 보존 · 범위 밖 폴백 | component | `limit-chaser-form.test.tsx` | ✅ |
| G④ | 필터 「자동매도」 · 쿼리 값 | unit | `lib/__tests__/order-log-feed.test.ts` · `order-log/__tests__/order-log-filters.test.tsx` | ✅ |
| G④ | e2e: 자동매도 스위치 → schema 4 lc.set · 바로시작 → fake 60 에코(state 3) → 칩 「매도중」 · `/me` 42 → 84 | e2e | `e2e/specs/trading-workbench.spec.ts` · `e2e/specs/me.spec.ts` | ✅ (시나리오 추가) |
| G⑤ | relay 배포 · smoke FAIL 0 · healthz ok · push · 인박스 done | manual(checkpoint) | `bash scripts/smoke-relay.sh` | — |

### Sampling Rate
- **Per task commit:** 해당 표면 quick 명령(위).
- **Per wave merge:** config `build_command` + `test_command` 전체.
- **Phase gate:** 전체 + server typecheck/strategy-events 테스트 + e2e 3 spec + 동기화 `--check` 0 — `/gsd-verify-work` 전에 그린.

### Wave 0 Gaps
- [ ] `webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx` — `/me` 설정 섹션(신규 컴포넌트와 함께)
- [ ] `relay/tests/helpers/frames.ts` — `buildUserSettingsFrame` · `FakeLimitChaserInput` 8필드
- [ ] `relay/tests/helpers/fake-gateway.ts` — 41/42 기록 · 43 시드 응답 · `readSetLimitChaserRequest` 4필드 디코드
- [ ] `webapp/src/test-fixtures/limit-chaser.ts` — 에코 픽스처 8필드 · 입력 4필드
- [ ] shared `__fixtures__/strategy-day.ts` — 자동매도 갈래 행 + 골든

## Security Domain

`.planning/config.json` `workflow.security_enforcement: false` 로 명시 — 이 섹션 생략(메모리 「보안검사 안 함」). 단 기능상 방어선은 위 패턴에 포함했다: 41 계좌 화이트리스트(`#accountAllowed` — IDOR) · zod 스키마 · 서버전용 필드 strip · 로그에 계좌번호 마스킹(`maskAccountNo`, T-16-45).

## 배포 순서 (G⑤ — 플랜 27-08 체크포인트 그대로)

1. 모든 코드 플랜 커밋 · 전체 게이트 그린 · `git status -sb` 로 남의 커밋 섞임 확인(메모리 「동시 세션 커밋 경합」).
2. **메인 세션**(executor 아님)이 20:00 KST 이후, 배포 커밋의 detached worktree 에서 `GCP_PROJECT_ID=gh-radar SUPABASE_URL=<라이브 env> NOTIFICATION_CHANNEL_ID=<채널> bash scripts/deploy-relay.sh`(DMA_HOST 주입 금지) — 새·직전 이미지 태그 기록 `[CITED: .planning/phases/25-order-log-progress/25-12-PLAN.md:150]`.
3. `bash scripts/smoke-relay.sh` FAIL 0 · `/healthz` `status:"ok"` → 실패면 `--rollback <직전 태그>` 후 push 하지 않음.
4. 라이브 확인(장중이면 다음 날 장중): 로그인 직후 `user.settings` 프레임 수신, 84 warn 로그 소멸.
5. `git push origin master`(= Vercel 배포 — 메모리 「Vercel ignoreCommand 가 docs-tip push 를 skip」 : 마지막 커밋이 docs 만이면 배포가 안 탈 수 있으니 코드 커밋이 tip 근처인지 확인하거나 수동 배포).
6. 인박스 `261004-auto-sell-wire.md` frontmatter `status: done` · `done_commit: <처리 커밋>` — **경로 지정** 커밋(`git add docs/inbox/from-gh-trade/261004-auto-sell-wire.md`). 85 노트·tick 노트는 건드리지 않는다.

## Sources

### Primary (HIGH confidence — 이번 세션에 원문을 열어 확인)
- gh-trade `master:server/src/protocol/StockDMA.fbs` diff `26b3493e..master` — 8필드·41/42/43/84/85·enum·Envelope 슬롯
- gh-trade `server/scripts/sync-relay-schema.sh` + `--check` 실행 출력 · scratchpad flatc 대조
- gh-trade `.planning/phases/28-auto-sell/28-HANDOFF-gh-radar-fields.md` · `28-G1-NOTIFY.md` · `28-09-SUMMARY.md` 「가드 문구」 · `28-REVIEW.md` WR-05
- gh-trade `docs/strategy/limit-chaser.md` §6-6 · §9-3 · 「자동매도 칸」 · `docs/features/order-log-progress.md` ④ · 문장 규칙 표
- gh-trade `server/src/net/Gateway.cpp:1196-1220, 3755-3831, 4800-4860` · `server/src/app/Server.cpp:4373-4387` · `server/src/trade/strategy/LimitChaser.h:388-400` · `LimitChaser.cpp:4600-4627` · `trade/state/UserSettingsStore.h:57-95` · `IStrategy.h:23-30`
- gh-trade `client/Services/DMA/NotificationHub.cs:207-245, 630-646` · `WireCodes.cs:282-291` · `Forms/Trading/LimitChaserForm.cs:2216-2224, 6421-6480`
- gh-radar relay `src/dma/msg-type.ts` · `envelope.ts` · `hub/subscription-hub.ts` · `ws/fanout.ts` · `ws/protocol.ts` · `journal/codec.ts` · `tests/helpers/fake-gateway.ts` · `src/dma/__tests__/codec.test.ts`
- gh-radar shared `relay.ts` · `strategy-event-labels.ts` · `strategy-event-text.ts` · `strategy-display.ts` · `strategy-event.ts` · `__fixtures__/strategy-day.ts`
- gh-radar webapp `lib/limit-chaser.ts` · `lib/use-relay-socket.ts` · `lib/order-log-feed.ts` · `lib/numpad.ts` · `components/trading/lc/*` · `card/strategy-card.tsx` · `card/card-header.tsx` · `latch-led.tsx` · `strategy-log.tsx` · `origin-tag.tsx` · `me-client.tsx` · `limit-chaser-form.tsx`
- 채택 목업 `reference/mockup-auto-sell-card.html` · `reference/mockup-user-settings.html`
- `supabase/migrations/20261003120000_dma_strategy_events_burst_limit.sql:37-44`

### Secondary (MEDIUM)
- 선례 커밋 파일 목록 `git show --stat 6181ee5d 451c3070 648e7892`
- Phase 25-12 배포 플랜 체크포인트 문구

### Tertiary (LOW)
- 없음 (외부 웹 리서치 불필요 — 신규 라이브러리 0, 계약은 전부 로컬 저장소에 있다)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 신규 0, 기존 버전 실측
- Architecture / 삽입 자리: HIGH — 파일:줄 원문 확인, 선례 커밋 존재
- Pitfalls: HIGH(1~8, 코드 실측) / MEDIUM(9, 12 — 운영 시나리오)
- 결정 전제: MEDIUM — Open Questions 1~4 는 사용자 확인 필요

**Research date:** 2026-10-05
**Valid until:** 2026-10-12 (gh-trade 가 같은 날 Phase 27 작업을 병합 중 — 플래닝 직전 `git rev-parse master:server/src/protocol/StockDMA.fbs` 가 `68679e9a` 인지 재확인)
</content>
</invoke>
