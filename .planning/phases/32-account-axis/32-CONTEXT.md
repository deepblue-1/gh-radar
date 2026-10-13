# Phase 32: 계좌 축 정리 - Context

**Gathered:** 2026-10-13
**Status:** Ready for planning

<domain>
## Phase Boundary

트레이딩 작업대와 /me 가 「고른 계좌 · 서버」 축으로 읽히게 한다(AXIS-01~05). ① 작업대 계좌 선택이 화면 범위가 되고(카드 격자 · VI 스트립 · VI 설정 행), 상단 줄을 계좌 선택 중심 한 줄(채택 목업 A)로 재설계한다. ② 사이드바 전략 목록과 /me 현황 탭을 계좌별 묶음으로 바꾸고, /me 주문 탭에 계좌 선택을 둔다(Phase 16 D-21 뒤집음). ③ /me 설정 탭 매매설정을 서버별로 보고 저장한다(relay `user.settings`/`user.settings.set` `serverKey` · hub 84 캐시 `(userId, serverKey)` · `#fromPrimary` 해제 · 42 지정 서버 라우팅). ④ **마지막 웨이브** — gh-trade 가 VI 를 (계좌, 거래소) 슬롯으로 바꾸는 phase(gh-trade Phase 33 · 2026-10-13 착수)가 끝나는 대로, relay VI 캐시를 `(소유키, 계좌, 거래소)` 로 넓히고 KB 원천 한정 · 서버 간 거래소당 1건 가드 · 거래소별 병합을 풀어 웹 VI 행을 계좌별로 만든다. DB 변경 없음. 와이어 변경은 ④ 의 61(`account_no` 상시 · `unregistered` bool append)뿐이며 gh-trade 가 `sync-relay-schema.sh` + 인박스로 알린다.

**사용자 목표(배경):** 웹앱에서 KB 계좌와 교보 계좌를 **동시에** 컨트롤한다 — VI 도 KB 따로 · 교보 따로 · 계좌마다 따로.

**AXIS-01 문구 수정(이 discuss 에서):** 「알림 토스트만 보이고」 → 토스트는 **모든 계좌** 것을 띄우고 계좌 표시를 달며, 터치하면 그 계좌로 작업대 계좌가 바뀐다(D-03). 플래너는 ROADMAP 성공 기준 1 · REQUIREMENTS AXIS-01 을 이 결정에 맞춰 고친다(`gsd_run query` 핸들러로).

</domain>

<decisions>
## Implementation Decisions

### 작업대 계좌 스코프 (AXIS-01)
- **D-01: 스코프 안 = 카드 격자 · VI 트리거 스트립 · VI 설정 행(④ 뒤) · 공용 패널.** 고른 계좌(`accountNo` 상단 줄 상태)와 `card.accountNo` / `viOrder.accountNo` 가 같은 것만 그린다. 다른 계좌 카드는 **마운트 유지 · 숨김**(에코 · 상태 · 미확인 카운트는 계속 받는다). 새 카드 기본 계좌 기능은 그대로. 계좌를 바꾸면 즉시 바뀐다.
- **D-02: 스코프 밖 = 돌파 스트립(종목 축) · 사이드바.** 단 사이드바 「트레이딩」 아래 전략 목록은 **계좌별 묶음 트리**로 바꾼다 — 계좌 소제목(이름 · 서버키 칩) → VI 줄(켜진 계좌만 · ④ 뒤 계좌별, 그 전엔 지금 VI 줄을 그 VI 의 계좌 묶음에) → 전략 줄(LED 3점). 전략 · VI 가 없는 계좌는 소제목 없음(사이드바는 켜진 것만). 채택 목업 ②.
- **D-03: 토스트는 계좌 무관하게 전부 띄운다.** 두 번째 줄에 「계좌 · 번호 · 이름 · 서버키」(D-12 라벨 한 벌), 터치하면 **그 계좌로 작업대 계좌를 바꾸고** 해당 카드로 간다(기존 `cardForAlert` 매칭). 소리 정책은 종전. — AXIS-01 원문 「토스트만 보이고」 를 뒤집는다(사용자 2026-10-13).
- **D-04: 계좌 1개 사용자 · 사이드바 클릭 전환은 Claude 재량(아래).**

### 상단 줄 (AXIS-02 — 채택 목업 ① A)
- **D-05: 한 줄 필(A).** 왼쪽 계좌 셀렉트(네이티브 `<select>` 유지 · 옵션 글자 D-12 · 옆 서버키 칩 유지), 이어서 시세 · 주문 상태(LED 점 + 짧은 말 — `quotePillOf`/`orderPillOf` 그대로), 오른쪽 끝 컬럼 세그먼트(1·2·3단). 폰 밴드는 세그먼트가 줄 아래로 내려간다(지금처럼 폰에서 숨기는 규칙은 목업대로 「아래 줄」 로 바꾼다 — 플래너가 §2.2b 밴드 규칙과 맞춘다). 제목 「트레이딩」 h1 유지. — **Reversibility:** reversible.
- **D-06: 뺀다 — 「정규」 배지와 77 예약 창 배지 전부**(`queuedWindowBadgeOf` 소비처 제거 · E2E `workbench-window-badge` 단언 삭제 · 관련 단위 테스트 갱신) · **알림음 토글**(→ D-15) · **반영 시각**(`stat-applied`) · **다시 연결 버튼**(끊김일 때만 주문 알약 안 「다시 연결」 링크 — 목업 「주문 끊김」 상태) · **낡은 전략 · 옮김 보조 줄**(`workbench-stale-strategies` · `workbench-moved-from` — 상단 줄 밖으로: 플래너 재량으로 계좌 셀렉트 아래 한 줄 또는 토스트성 안내, 문구 `WORKBENCH_STATUS_TEXT` 유지). relay 77 수신 · `queuedWindow` 상태는 카드 안 예약 표시가 쓰므로 relay · 리듀서는 무변경.
- **D-07: 남긴다 — 컬럼 수 세그먼트만.**

### /me 현황 · 주문 (AXIS-03 · AXIS-04 — 채택 목업 ③ A · ④)
- **D-08: 현황 탭 전략 현황을 계좌별 묶음으로.** `accounts[]` 순, **모든 계좌** 소제목(전략 0건은 「등록된 전략 없음」 빈 상태 한 줄). 소제목 「계좌 · 번호 · 상품명 · 서버키」(D-12). 묶음 안: 전략 행(지금 `StrategyRow` · 2줄째 계좌번호는 소제목이 있으니 코드 · 거래소만) → VI 행(④ 전엔 그 VI 의 계좌 묶음에 한 행 · ④ 뒤 계좌당 거래소별). `MeStatusBar` 「상따 N건 · VI · 계좌 N개」 유지.
- **D-09: 전체 비활성화는 둘 다.** 카드 맨 아래 「전체 비활성화」(지금 `strategies.disable` 무인자) 유지 + 각 계좌 소제목 오른쪽 끝 작은 테두리 버튼 「이 계좌 끄기」(목업 ③ A). 계좌별 끄기는 relay `strategies.disable` 에 **`accountNo` 선택 인자** — relay 가 그 계좌의 켜진 상따를 건별 `lc.set`(스위치 off) · 그 계좌 VI 를 `vi.set(run:false)` 로 보낸다(서버 와이어는 세션 단위라 계좌 필터는 relay 몫). 확인 다이얼로그는 지금 것 재사용(계좌 1개 나열). — **Reversibility:** reversible(relay 프레임 optional 인자).
  - **보정(2026-10-13 · plan-phase 리서치 뒤 · 사용자 결정):** ① 웹→relay 는 기존 `strategies.disable` 에 인자를 붙이지 않고 **새 메시지 타입**(예 `strategies.disable.account` · `{accountNo}`)으로 보낸다 — 옛 relay 는 모르는 `t` 라 소켓을 닫고(4400) 아무것도 끄지 않는다(`accountNo` 를 zod 가 조용히 버려 「전부 끄기」가 되는 사고 방지). ② relay 는 건별 `lc.set` 스위치 off 를 쓰지 **않는다** — gh-trade 서버가 게이트 전부 off 인 Set 을 등록 삭제(`crud='D'`)로 처리한다(`Gateway.cpp` 3211~3219). 대신 그 계좌의 켜진 전략마다 **14 `DisableStrategiesReq(key)`** 1건 + 그 계좌 VI 에 **11 `run:false`** 를 소유 세션으로 보내고, 65 응답 k건을 **`strategies.disabled` 1프레임**으로 접어 보낸다(webapp 킬스위치 비행 창이 첫 `strategies.disabled` 에 닫히므로). `accountNo` 는 `#accountAllowed` 로 대조한다.
- **D-10: 주문 탭에 계좌 선택.** 카드 제목 옆 계좌 필 — **작업대와 같은 부품**(D-13) · **값은 따로 기억**(기본값 = 작업대 계좌, 저장 키 별도 · 기기별). 고른 계좌 주문만 **평탄 목록**(그룹 소제목 제거), 탭 라벨 「주문 N」 = 고른 계좌 건수. 상세창 `/trading/order-log?account=` 는 무변경. Phase 16 **D-21(「계좌 선택 UI 없음 · 계좌별 섹션 세로 반복」)을 주문 탭에서 뒤집는다** — 잔고 탭은 D-21 그대로(세로 반복).
- **D-11: 잔고 탭 소제목도 D-12 형식**(서버키 추가). `AccountPanel` 계좌 전용 모드 머리 수정.
- **D-12: 계좌 라벨 한 벌.** shared `accountLabelOf` 를 「번호 · 상품명 · 서버키」 까지 내는 변형(이름 확정은 플래너)으로 넓혀 ① 상단 줄 셀렉트 옵션 ② /me 현황 · 잔고 소제목 ③ 주문 탭 필 ④ 토스트 계좌 줄 ⑤ 사이드바 소제목(이름 · 서버키만) 이 같은 함수를 읽는다. 계좌번호 마스킹 없음(D2 · S-5 유지).
- **D-13: 계좌 선택 공용 부품.** 지금 `AccountPill`(workbench-status-bar 안)을 `components/trading/account-pill.tsx` 류로 올려 작업대 · /me 주문 탭이 같이 쓴다. props `{accounts, accountNo, onChange, title?}` — 네이티브 `<select>` 유지(`appearance-none` 금지).

### 매매설정 서버별 (AXIS-05 — 채택 목업 ⑤ A)
- **D-14: 서버 세그먼트.** 「상따 기본설정」 제목 아래 **세션이 열린 서버**(그 사용자의 결선 세션 서버키 목록 — 등록만 되고 꺼진 서버는 없음) 세그먼트 `KB120 | KYOBO119`. 라벨은 서버키 그대로. 세그먼트 점 = 그 서버 84 수신 여부; 미수신 서버를 고르면 12행이 흐려지고 칩 「아직 못 받음」(지금 `loading` 상태 재사용 — 편집 · 저장 잠금). **기본 선택 = 마지막으로 고른 서버**(기기별 localStorage `gh-radar:me-settings-server:{userId}` 류), 없거나 그 서버 세션이 닫혔으면 **목록 첫 서버**(relay primary 규칙과 같은 순서 = KB 먼저). 작업대 계좌와 독립. 저장은 고른 서버에만(캡션 「고른 서버에만 저장돼요」). 웹 42 를 다른 서버로 복제하는 기능은 **없다**(2026-10-12 결정 유지).
- **D-14a: relay.** `user.settings` 프레임에 `serverKey` 를 싣고 서버마다 1프레임(캐시 `(userId, serverKey)` · `#fromPrimary` 84 필터 해제 · 43 요청은 Ready 된 세션마다). `user.settings.set` zod 에 `serverKey` **optional** — 부재면 primary(구 탭 관용 · Phase 31 D-14 보정과 같은 결), 있으면 그 세션으로 42. 되싣기(금액 키 부재 · 후매수 최소)는 **그 서버** 84 캐시에서. 재연결 replay(`fanout.ts` 1882)는 서버별 전부. 클라이언트가 「세션 열린 서버 목록」 을 알 길이 지금 없다 — 서버별 `user.settings` 프레임의 `serverKey` 집합이 곧 목록이다(별도 프레임 추가 안 함 · 플래너 재량으로 `state` 프레임에 `sessions[]` 를 넣어도 됨). — **Reversibility:** costly — relay 프레임 · zod · hub 캐시 키 · webapp 훅 전부 서버 축이 생긴다.
- **D-14b: 상따 폼 시딩 = 카드 계좌의 소유 서버 84.** `seedFromUserSettings` · `preBuyWatchFixedOf` 입력을 `userSettingsByServer[card 계좌 serverKey]` 로(계좌 `serverKey` 는 `RelayAccount.serverKey`). 모르면(서버키 없음 · 그 서버 84 미수신) 시딩 생략(0 · 빈칸 — Phase 31 D-12 의 「없으면 추가하지 않는다」 와 같은 결).
- **D-15: 돌파 알림음 토글 → /me 설정 탭 「이 기기」 묶음.** 매매설정 카드 아래 별도 카드(캡션 「이 브라우저(기기)에만 저장돼요」), 저장은 지금 `gh-radar:breakout-tone` localStorage 그대로(서버 · relay 무변경). 작업대 `ToneToggle` DOM 제거, `readTonePref` 소비(돌파 소리 재생)는 유지. 단위 테스트 `tone` describe 이전.

### VI 계좌별 — 마지막 웨이브 (AXIS-01 VI 행 · gh-trade Phase 33 뒤)
- **D-16: 순서.** 웨이브 ①~③(아래 「웨이브」) 은 VI 를 **건드리지 않는다**(지금 VI 행 · relay 그대로 — 작업대 VI 설정 행은 상단 계좌와 무관하게 현행 유지, 「안내 + 옮기기」 임시안은 쓰지 않는다). gh-trade Phase 33 이 fbs(61 `account_no` 상시 · `unregistered` bool append · 21 응답 = 세션 계좌마다 61 1프레임 · 미등록 계좌도 계좌 · 거래소만 채운 프레임 · 56/72/73/33 무변경)를 `sync-relay-schema.sh` + 인박스로 보내면 웨이브 ④ 를 집행한다. **배포 순서 (b):** gh-radar relay 먼저(구 서버 61 = 계좌 1건이라 호환 · 20:00 KST 뒤) → gh-trade 서버(KB120 · 121 · 교보119) → webapp push. relay 준비되면 gh-trade 세션에 알린다.
- **D-17: relay.** `#viTriggers` 키 `(소유키, 계좌, 거래소)` · `#mergeVi` 의 사용자 · 거래소 병합과 `viRunningElsewhere` · `#stopViElsewhere`(서버 간 1건 가드) 제거 · `VI_BROKER="KB"` 원천 한정 해제(`#viSourceOwners` = 그 사용자의 **모든** 결선 세션 · 교보 세션 61/72/73/56 도 받는다) · `vi.set` 세션 = **그 계좌의 소유 세션**(증권사 무관 · `resolveEffectiveOrderServer`). 브라우저 `vi` 프레임에 `accountNo` 를 싣고 계좌 · 거래소마다 1건(`viTriggers` 타입이 `Record<exchange, …>` 에서 `(accountNo, exchange)` 맵으로). `unregistered` 프레임은 그 칸 null. — **Reversibility:** one-way — 웹 `vi` 프레임 모양과 relay 캐시 키가 바뀌는 공개 계약이며, 구 webapp 이 켜진 동안 양쪽 모양을 함께 내는 호환 창이 필요하다(플래너가 `checkpoint:decision`).
- **D-18: 웹.** 작업대 VI 설정 행 = **고른 계좌**의 KRX · NXT 행(없으면 미등록 빈 행 — 그 계좌로 등록). 「옮기기」 흐름(`viMoveTargetOf` · ⑨)은 계좌별 슬롯이면 뜻이 없으므로 제거. /me 현황 VI 행 = 계좌 묶음 안 거래소별. 사이드바 VI 줄 = 계좌 묶음 안. 교보119 VI 실증(UAT)을 이 웨이브 안에 둔다. 같은 종목 여러 슬롯 동시 발주는 서버가 허용(먼저 켠 순).

### 웨이브 · 배포
- **D-19:** ① /me 현황 계좌별 · 주문 탭 계좌 선택 · 잔고 소제목 · 라벨 한 벌 · 공용 필(데이터 변경 없음 · webapp 만) → ② 작업대 계좌 스코프 · 상단 줄 A · 사이드바 계좌 묶음 · 토스트 계좌 줄 · 알림음 이전 · 계좌별 끄기(relay `strategies.disable` 인자 — 작은 relay 변경) → ③ 매매설정 서버별(relay + shared + webapp) → ④ VI 계좌별(gh-trade Phase 33 뒤 · relay 먼저). ①②는 webapp push = 프로덕션. ②의 relay 부분과 ③ · ④ relay 는 20:00 KST 뒤 배포, push 는 relay 뒤([[feedback_deploy_relay_before_push]]). E2E(trading-workbench · a11y aria-live · me · 단위 `workbench-status-bar.test.tsx`)는 각 웨이브에서 새 구조로 갱신.

### Claude's Discretion
- 계좌 1개 사용자: 셀렉트는 그대로(옵션 1개 · 비활성 아님) — 라벨이 곧 「지금 보는 계좌」. 계좌 0개(확인 중)는 지금 문구.
- 사이드바 전략 항목 클릭: 그 카드의 작업대로 이동하면서 **작업대 계좌를 그 카드 계좌로 바꾼다**(D-01 스코프라 안 바꾸면 카드가 안 보인다).
- 계좌 전환 때 열린 시트 · 인라인 편집은 닫는다(카드가 숨겨지므로).
- 낡은 전략 · 옮김 보조 줄의 새 자리(D-06) · 폰 밴드 세그먼트 줄 · 주문 알약 끊김 문구.
- D-12 함수 이름 · D-13 파일 위치 · localStorage 키 이름 · `state` 프레임 `sessions[]` 추가 여부(D-14a).
- 주문 탭 「주문 N」 카운트 산출(지금 `onCountChange` 를 고른 계좌 필터 뒤로).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 채택 목업 (이 phase 의 화면 정본)
- `.planning/phases/32-account-axis/reference/mockup-account-axis.html` — 화면 ① 상단 줄 **A** · ② 사이드바 계좌 묶음 · ③ /me 현황 **A**(소제목 우측 「이 계좌 끄기」) · ④ /me 주문(제목 옆 계좌 필 · 평탄 목록) · ⑤ /me 설정 **A**(서버 세그먼트 · 「이 기기」 알림음). 폰 390 / 데스크톱 1080 · 다크/라이트 · 주문 끊김 상태 토글. UI-SPEC 은 이 목업을 옮긴다.

### gh-trade 계약 · 인박스
- `/Users/alex/repos/gh-trade/docs/inbox/from-gh-radar/261013-vi-per-account.md` — VI (계좌, 거래소) 슬롯 요청(이 세션 발송). gh-trade 답(2026-10-13 세션 메시지): 동시 발주 허용(서버 간 · 서버 안 여러 계좌 · 서버당 제한 없음) · 21 응답 = 계좌마다 61 1프레임 · 61 `account_no` 상시 · `unregistered` bool append(기본 false = 구 서버 호환) · 56/72/73/33 무변경 · 발주 순서 먼저 켠 슬롯부터 · 배포 (b) relay 먼저. fbs 확정은 gh-trade Phase 33 플랜 뒤 `sync-relay-schema.sh` + 인박스 노트.
- `/Users/alex/repos/gh-trade/docs/inbox/from-gh-radar/261012-usersettings-shared-across-servers.md` — 사용자 결정 2026-10-12 「서버별 사용자 설정 저장 유지」(gh-trade 공유 저장 진행 안 함 · 웹 42 전서버 복제 우회 불채택). AXIS-05 의 전제.
- `/Users/alex/repos/gh-trade/server/docs/protocol.md` 31 · 35 · 73행 — 11/21/61 VI 「거래소별 1건」(현행) · 42/84 사용자 설정.
- `docs/inbox/from-gh-trade/README.md` · `CLAUDE.md` 「gh-trade 인박스」 — 인박스 처리 규칙.

### 선행 결정
- `.planning/milestones/v1.0-phases/16-trading-limit-chaser-vi-my-page/16-CONTEXT.md` D-20 · D-21 — /me 구성 · 「계좌 선택 UI 없음 · 계좌별 섹션 세로 반복」(주문 탭에서 뒤집음 · 잔고 탭 유지).
- `.planning/phases/31-limitchaser-amount-unit/31-CONTEXT.md` D-12 · D-13 · D-14(보정) — 새 폼 시딩 · /me 42 12값 전체 교체 · relay optional 되싣기 규약(D-14a 가 서버 축으로 넓힘).
- `.planning/milestones/v1.0-phases/29-dma-multi-server-admin/29-CONTEXT.md` — D-18 VI 원천 KB · 29-51 GC-05 VI 병합(④ 에서 푸는 것) · G-1 계좌별 주문 서버(`resolveEffectiveOrderServer`).
- `.planning/ROADMAP.md` Phase 32 · `.planning/REQUIREMENTS.md` AXIS-01~05 — AXIS-01 토스트 문구는 D-03 으로 수정.
- `webapp/src/styles/globals.css` §2.2b — 상따 화면 본문 폭 4밴드 컨테이너 쿼리(상단 줄 폰 밴드 판정).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `webapp/src/components/trading/workbench/workbench-status-bar.tsx` — `AccountPill`(385~435 · 네이티브 select + 서버키 칩) → D-13 공용 부품의 본체. `quotePillOf`/`orderPillOf`(`lib/quote-state.ts` 106 · 130) 그대로. `ToneToggle`(334~383) → /me 로 이전. `queuedWindowBadgeOf`(`lib/queued-window.ts` 117) 소비처 제거.
- `webapp/src/lib/account-label.ts` `accountLabelOf` — D-12 확장 지점. `webapp/src/lib/trading-layout.ts` 125~178 `readTradingAccount`/`writeTradingAccount`/`pillAccountOf` — 작업대 계좌 저장 · 자동 선택 규칙(주문 탭 · 설정 탭 저장 키는 별도).
- `webapp/src/components/trading/today-orders-card.tsx` `groupJournalRowsByAccount`(410) · 그룹 소제목(529~551) — 평탄 목록으로 바꿀 자리. `order-log-window.tsx` 91 · 117 `?account=` 필터 — 계좌 필터 선례.
- `webapp/src/components/trading/strategy-status-card.tsx` — `StrategyRow`(2줄째 220~232) · VI 행(529~550) · 전체 비활성화(`strategies.disable` 436~450 · 다이얼로그 계좌 나열 604).
- `webapp/src/components/orderbook/account-panel.tsx` 671~714 — 계좌 전용 모드 머리(D-11 서버키 추가).
- `webapp/src/components/layout/app-sidebar.tsx` — `sidebarChasers` · `ViItem` · `StrategyItem`(379~) · `SUB_LIST` → 계좌 묶음 트리.
- `webapp/src/components/me/limit-chaser-defaults.tsx` — `LimitChaserDefaultsSection`(555) · `useUserSettingsSave`(327 · 405 `user.settings.set`) · `usableUserSettingsOf`(269) → 서버 세그먼트 · `serverKey` 전달.
- `webapp/src/lib/limit-chaser.ts` `seedFromUserSettings`(471) · `limit-chaser-form.tsx` 820~829 · 969 · 985~1000 — D-14b 시딩 입력 교체.
- `webapp/src/lib/trading-alerts.ts` `TradingAlert.accountNo`(75~100 「카드 매칭 전용 — 표시하지 않는다」 주석 → D-03 으로 표시) · `cardForAlert`(411~425).

### Established Patterns
- 작업대 데이터는 전부 `useRelayContext()`(`lib/relay-provider.tsx` · `lib/use-relay-socket.ts`): `accounts`(379) · `accountStates`(406) · `limitChasers`(493) · `viTriggers`(325 · 거래소 키) · `viOrders`(551) · `userSettings`(616 · 단일). 계좌 스코프는 소비처 필터, 서버 축은 `userSettings` → `Map<serverKey, …>` 승격.
- 계좌 식별 · 라벨 · 선택 UI 는 네이티브 `<select>` + 마스킹 없음(D2 · S-5). 「값은 서버가 정하고 웹은 표시만」(Phase 25 · 27) — 계좌별 끄기도 relay 가 건별 명령으로 푼다.
- relay hub 캐시 키 규약: 사용자 단위(84 · 76/78 · 77 `#fromPrimary`) vs 소유키 단위(61 VI · 60/64) — `relay/src/hub/subscription-hub.ts` 100~118 표. AXIS-05 는 84 를 소유키(서버) 단위로, ④ 는 VI 를 (소유키, 계좌) 단위로 옮긴다.
- 상단 줄 반응형은 본문 폭 컨테이너 쿼리(`@min-[680px]/wb` · `phoneBand`).

### Integration Points
- relay: `relay/src/hub/subscription-hub.ts` `#userSettings`(1050) · `getUserSettings`(2245) · 84 수신(2649~2655 `#fromPrimary`) · `#onUserSettings`(2850) · `#requestPrimarySnapshot`(2060 · 43) · `#mergeVi`(3376) · `#viSourceOwners`(1468); `relay/src/ws/fanout.ts` 42 라우팅(2117~2137 `#strategySession` 무계좌 = primary) · replay(1882) · `vi.set`(2139~2165 · `#stopViElsewhere` 2445) · `VI_BROKER`(306); `relay/src/ws/protocol.ts` `RelayUserSettingsSetSchema`(426); `relay/src/dma/envelope.ts` `parseUserSettings`(795) · `buildSetUserSettingsReq`(2075).
- shared: `packages/shared/src/relay.ts` `RelayUserSettingsMsg`(1499 · 775~788 주석 「계좌 축이 없다」) · `RelayAccount.serverKey`(943~968) · `RelayViTrigger.accountNo`(579~600) · `RelayOutbound`(1794~1819 — `sessions`/`servers` 프레임 없음).
- E2E: `webapp/e2e/specs/trading-workbench.spec.ts`(statusBar 130 · 창 배지 5080 · 알약 5594 · 토스트 aria-live 1620) · `a11y.spec.ts`(463 · 963~1004) · `me.spec.ts`(603 탭 · 929~948 그룹) · 단위 `workbench-status-bar.test.tsx`(77 배지 116 · tone 187 · AccountPill 310 · 382 · stale 429 · movedFrom 511).

</code_context>

<specifics>
## Specific Ideas

- 사이드바 묶음 모양(사용자 원문): 「aaa 계좌 / - a1 전략 / - a2 전략 / bbb 계좌 / - a3 전략 / - a4 전략」.
- 토스트(사용자 원문): 「토스트는 계좌 상관없이 뜨게 … 터치하면 해당 계좌 작업대로 … 토스트에 계좌표시는 해줘야겠지」.
- 목표(사용자 원문): 「KB의 계좌와 교보의 계좌를 웹앱에서 동시에 컨트롤 … VI도 KB따로 교보 따로」.
- 설정 탭 서버 세그먼트 캡션 「고른 서버에만 저장돼요. 다른 서버는 따로 봐야 해요.」 · 「이 기기」 카드 캡션 「이 브라우저(기기)에만 저장돼요.」(목업 문구).

</specifics>

<deferred>
## Deferred Ideas

- **VI 계좌별 슬롯의 gh-trade 쪽 구현** — gh-trade Phase 33(2026-10-13 착수). 이 phase 웨이브 ④ 의 전제이지 이 phase 의 일이 아니다.
- **잔고 탭 계좌 선택** — 잔고 탭은 D-21(세로 반복) 유지. 주문 탭처럼 바꾸고 싶으면 별도 quick.
- **웹 42 전서버 복제 · gh-trade 공유 저장** — 2026-10-12 결정으로 불채택(재논의 시 인박스 `261012-usersettings-shared-across-servers.md` 부터).

None beyond the above — discussion stayed within phase scope.

</deferred>

---

*Phase: 32-account-axis*
*Context gathered: 2026-10-13*
