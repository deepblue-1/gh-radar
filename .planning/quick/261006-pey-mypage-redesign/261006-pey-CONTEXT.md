---
quick_id: 261006-pey
slug: mypage-redesign
date: 2026-10-06
sketch: .planning/sketches/013-mypage-ia/ (index.html → A · settings.html → S1)
status: decided
---

# 261006-pey — /me 마이페이지 정보 구조 재설계 · 결정(잠금)

사용자 결정 2건(2026-10-06). 플래너·실행자는 이 결정을 다시 묻지 않는다.

## D-1 정보 구조 = **A 상단 4탭** (sketch 013 index.html 변형 A)

- 계정 카드(`AccountCard`) 아래에 탭 바 「현황 · 잔고 N · 주문 N · 설정」. 종목상세 4탭(`stock-detail-tabs.tsx`)과 **같은 문법·같은 메커니즘** — `?tab=` 쿼리가 단일 진실, `window.history.pushState`(뒤로가기 = 이전 탭), 화이트리스트 밖 값은 기본 탭, 한 번 방문한 탭은 계속 마운트(`forceMount` + `data-[state=inactive]:hidden`), sticky 탭 바. 기본 탭 = `status`(현황).
  - 탭 값 제안: `status` · `accounts` · `orders` · `settings`. 라벨: 현황 · 잔고 · 주문 · 설정.
- **현황 탭**: 상태줄(`MeStatusBar`) + 전략 현황 카드(`StrategyStatusCard` · 현황|로그 세그먼트 그대로).
  - 상태줄 위치는 목업대로 **현황 탭 안**. (전 탭 공통으로 올리는 안은 채택하지 않았다 — 바꾸려면 사용자 결정.)
- **잔고 탭**: 계좌마다 `AccountPanel`(stack · 계좌 전용 모드) 세로 반복 — 지금 `me-account-card` 섹션 그대로 이동. 「계좌 정보를 불러오는 중」 로딩 문구도 함께.
  - 탭 라벨 건수 = 모든 계좌 `accountStates` 의 미체결(`unf`) 합. 0 이면 숫자 생략.
- **주문 탭**: `TodayOrdersCard` 그대로 이동. 조회는 여전히 **페이지당 1회** — 탭이 마운트되지 않으면 조회도 없다(첫 방문 때 1회). 탭 라벨 건수 = 카드가 아는 오늘 주문 전체 행 수(헤더 「N건」과 같은 수). 미방문이면 숫자 생략. 카드가 수를 올려 주는 콜백(`onCountChange` 류) 하나만 더한다 — 조회 경로는 늘리지 않는다.
- **설정 탭**: 「상따 기본설정」(`LimitChaserDefaultsSection`) — 아래 D-2 모양으로. 계정 카드(테마·로그아웃)는 탭 **위** 공통이라 그대로.
- DMA 게이트 분기(`gateReason !== null`)는 무변경 — 계정 카드 + `DmaGate`, 탭 없음.
- 세로 순서 계약(D-20 「상태줄 → 전략 → 계좌 → 오늘 주문」)은 **탭 순서**로 승계된다 — 현황(상태줄·전략) → 잔고(계좌) → 주문. 설정은 그 뒤.

## D-2 매매조건(상따 기본설정) 행 모양 = **S1 묶음 카드 4장** (sketch 013 settings.html 변형 S1)

- 묶음(매수 금액 · 후매수 · 매도 · 자동매도 = `USER_SETTINGS_GROUPS`)마다 **카드 한 장**(`CARD` 면 · radius 16). 카드 머리 = 묶음 이름 13px/600 muted.
- 행은 **지금 그대로** `SettingRow` · `ChoiceRow` 44px(새 입력 컴포넌트 0). 각 카드 안 행 목록에 `LC_CONTAINER_CLASS` 컨테이너 선언(현행과 같이).
- 데스크톱(본문 ≥ ~700)에서 카드 격자 **2열**(`align-items:start`), 폰 1열. 2열 판정은 뷰포트가 아니라 `/me` 본문 폭 기준이면 컨테이너 쿼리, 아니면 기존 페이지 레이아웃 관례(page-layout.ts) 를 따른다 — 플래너가 기존 관례를 보고 정한다.
- 섹션 제목 「상따 기본설정」 + 상태 칩 + 안내 문장은 카드 격자 **위**에 한 번(현행 문구 `USER_SETTINGS_STATUS_TEXT` 그대로 · D-13).
- 거부 원문 한 줄(`me-lc-defaults-reject`) · 키패드 시트(`NumberPadSheet`) · 저장 기계(`useUserSettingsSave`)는 무변경 — 행 확정 즉시 42, 저장 버튼 없음.

## 범위 밖 / 금지
- 데이터 경로·relay 계약·조회 횟수 변경 금지(T-16-02). 탭 분리는 **표시만** 바꾼다.
- 상태줄·전략 카드·계좌 패널·오늘 주문 카드·설정 행의 **내부**는 손대지 않는다(이동 + 래핑만). 설정 섹션만 묶음 카드로 재배치.
- 계좌 선택 UI 금지(D-21) · 전체 비활성화는 현황 탭 전략 카드 안 그대로(D-09).
- 테스트: `me-client.test.tsx` · `limit-chaser-defaults.test.tsx` · e2e `me.spec.ts`(계좌 카드·오늘 주문 단언은 해당 탭으로 이동 후 단언) 갱신 필수. 새 e2e: 탭 전환 · `?tab=` 딥링크 · 뒤로가기.
