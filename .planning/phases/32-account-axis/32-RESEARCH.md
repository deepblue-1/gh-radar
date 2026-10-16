# Phase 32: 계좌 축 정리 - Research

**Researched:** 2026-10-13
**Domain:** webapp 작업대 · /me 계좌 축 재편(표시 · 필터) + relay `user.settings` 서버 축(84 캐시 키 · 42 라우팅) + relay `strategies.disable` 계좌 인자 + (웨이브 ④) relay VI 캐시 (소유키, 계좌, 거래소)
**Confidence:** HIGH (relay · shared · webapp 원본을 이번 세션에 직접 열어 읽었다. gh-trade 서버 동작 2건은 gh-trade 원본 C++ 를 읽어 확인했다. 신규 패키지 0)

## Summary

이번 phase 의 일은 대부분 **이미 있는 데이터를 계좌 · 서버 축으로 다시 거르고 묶는 것**이다. 새 패키지는 없고, DB 와 gh-trade 와이어도 바뀌지 않는다(웨이브 ④ 제외). 웨이브 ①(/me 현황 · 주문 · 잔고 · 라벨 한 벌 · 공용 필)은 webapp 만 바뀐다. 웨이브 ②(작업대 스코프 · 상단 줄 A · 사이드바 묶음 · 토스트 계좌 줄 · 알림음 이전)도 거의 webapp 이다. relay 에서 바뀌는 것은 `strategies.disable` 계좌 인자 하나다. 웨이브 ③(매매설정 서버별)은 relay hub 의 84 캐시를 `userId` 키에서 `(userId, serverKey)` 키로 옮기는 일이다. `#fromPrimary` 84 갈래를 풀고, 43 을 세션마다 보내고, 42 를 지정 서버로 라우팅하고, 재접속 replay 도 서버마다 1프레임씩 내린다. webapp 은 `userSettings` 단일 값을 서버별 Map 으로 올린다. 웨이브 ④(VI 계좌별)는 gh-trade Phase 33 이 끝나야 시작한다. gh-trade 33-RESEARCH 가 와이어를 거의 확정해 두었다(61 `unregistered: bool` vtable 16, 21 → 선언 계좌마다 61 n 프레임).

원본을 읽어 보니 CONTEXT 의 전제와 어긋나는 사실이 있다. 플래너가 반드시 반영해야 한다. **① D-09 「건별 `lc.set`(스위치 off)」 은 끄기가 아니라 등록 삭제다.** gh-trade 서버는 매수 · 매도 · 취소 · 자동매도가 전부 꺼진 Set 을 `crud='D'` 로 바꾼다(`Gateway.cpp:3211-3219`). 그러면 「전체 비활성화」(등록 유지 · 게이트만 내림)와 뜻이 갈린다. 같은 뜻을 내는 서버 경로는 **14 `DisableStrategiesReq(key)` 건별**이다(`DisableOne` — 매수 · 매도 · 후매수 자동 · 취소 · 자동매도를 끄고 등록은 유지한다). **② relay zod 는 모르는 키를 조용히 버린다(strip).** 그래서 새 webapp 이 구 relay 에 `{t:"strategies.disable", accountNo}` 를 보내면 `accountNo` 가 사라지고, 빈 키 = **전부 정지**로 나간다. 미리보기(Vercel 고유 URL)도 운영 relay 를 쓰므로, 이 위험은 배포 순서만으로는 막히지 않는다. **③ webapp 소켓 훅은 `strategies.disable` 을 보내는 순간 「전부 정지 in-flight」 창을 열고 첫 65 에서 닫는다.** 계좌별 끄기가 14 를 N 건 보내면 65 도 N 건 온다. 그러면 두 번째 에코부터 원인 귀속(`killSwitch`)이 빠진다. relay 가 65 를 모아 `strategies.disabled` 1건으로 내야 한다(29-54 N-01 집계기 선례). **④ 폰 밴드 세그먼트를 「아래 줄」 로 보이게 하면 동작하지 않는 조작이 생긴다.** 격자는 wb < 680 에서 `data-cols` 와 무관하게 1열 고정이다. **⑤ 「세션 열린 서버 목록」 은 새 프레임 없이 `state.accounts[].serverKey` 에서 얻을 수 있다.** relay 가 단일 세션에도 모든 계좌에 `serverKey` 를 싣는다.

**Primary recommendation:** 웨이브 순서는 CONTEXT D-19 그대로 따른다. 다만 ② relay `strategies.disable` 계좌 끄기는 「14(key) 건별 + VI `11 run:false` + hub 집계 1건」 으로 만든다. ③ 서버 목록은 `accounts[]` 의 서버키 집합(primary 먼저)에서 얻고, 84 캐시 키는 소유키(`${userId}|${serverKey}`)로 한다. ④ 브라우저 `vi` 프레임은 새 `t`(예: `vi.slot`)로 따로 내고, 구 `vi`(거래소 병합)를 함께 내는 호환 창을 둔다. 이 셋을 플랜의 `checkpoint:decision` 으로 올린다.

**2026-10-16 보정 — /me 계좌 위 선택(CONTEXT D-20~D-25 · UI-SPEC 「2026-10-16 수정」 절 · 목업 ⑥ B).** 사용자가 /me 의 계좌 선택을 「탭 안」 에서 「탭 위 계좌 칩 한 곳」 으로 바꿨다. 네 탭(현황 · 잔고 · 주문 · 설정)이 고른 계좌를 따른다. 이 문서에서 달라지는 것: ① 웨이브 ① 은 「계좌 칩 + 현황 · 잔고 · 주문 고른 계좌」 이고 **공용 필(`account-pill.tsx` 신규)은 필요 없다**(D-25 — 아래 touch map 의 그 행은 무효 · `AccountPill` 은 작업대 안 그대로). ② /me 현황은 계좌 묶음이 아니라 고른 계좌만이며 「이 계좌 끄기」 는 카드 맨 아래 주 버튼, 「전체 비활성화」 는 그 아래 링크(relay 몫 Pattern 3 · Pitfall 1~3 은 그대로). ③ 잔고 탭도 고른 계좌 1벌(`AccountPanel` 계좌 전용 모드 머리 없이 — 16 D-21 전면 뒤집음). ④ 설정 탭의 서버는 **고른 계좌의 `serverKey`** 다 — Pattern 5 「세션 열린 서버 목록」 은 UI 에 더 이상 필요 없고(relay D-14a · hub 84 소유키 캐시 · 42 라우팅 · Pitfall 11~14 는 그대로), 세그먼트 · 서버 기억 키(`gh-radar:me-settings-server`) · 「닫힌 서버 → 첫 서버」 규칙은 사라진다. 비행 중 잠금(Pitfall 12)은 세그먼트가 아니라 **계좌 칩 줄** 에 건다. ⑤ Pitfall 10(목록 밖 계좌 주문)은 칩 목록 = `accounts[]` ∪ 행 계좌로 같은 뜻. ⑥ 기억 키는 /me 하나(예 `gh-radar:me-account:{userId}` · 기본 = 작업대 기억 계좌 → 첫 계좌 · `readTradingAccount`/`pillAccountOf` 재사용 규칙은 그대로). 아래 Validation 표의 AXIS-03 「계좌 묶음 … 소제목」 · AXIS-04 「주문 탭 필」 · AXIS-05 webapp 「세그먼트 · 기억 · 닫힌 서버」 · E2E 「설정 세그먼트 1개」 행은 이 보정대로 읽는다(계좌 칩 기본 선택 · 기억 · 탭 라벨 숫자 · 잔고 1벌 · 설정 서버키 칩 · 캡션). 플래너는 이 보정과 CONTEXT D-20~D-25 · UI-SPEC 수정 절을 원문보다 우선한다.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 작업대 계좌 스코프 (AXIS-01)
- **D-01: 스코프 안 = 카드 격자 · VI 트리거 스트립 · VI 설정 행(④ 뒤) · 공용 패널.** 고른 계좌(`accountNo` 상단 줄 상태)와 `card.accountNo` / `viOrder.accountNo` 가 같은 것만 그린다. 다른 계좌 카드는 **마운트 유지 · 숨김**(에코 · 상태 · 미확인 카운트는 계속 받는다). 새 카드 기본 계좌 기능은 그대로. 계좌를 바꾸면 즉시 바뀐다.
- **D-02: 스코프 밖 = 돌파 스트립(종목 축) · 사이드바.** 단 사이드바 「트레이딩」 아래 전략 목록은 **계좌별 묶음 트리**로 바꾼다 — 계좌 소제목(이름 · 서버키 칩) → VI 줄(켜진 계좌만 · ④ 뒤 계좌별, 그 전엔 지금 VI 줄을 그 VI 의 계좌 묶음에) → 전략 줄(LED 3점). 전략 · VI 가 없는 계좌는 소제목 없음(사이드바는 켜진 것만). 채택 목업 ②.
- **D-03: 토스트는 계좌 무관하게 전부 띄운다.** 두 번째 줄에 「계좌 · 번호 · 이름 · 서버키」(D-12 라벨 한 벌), 터치하면 **그 계좌로 작업대 계좌를 바꾸고** 해당 카드로 간다(기존 `cardForAlert` 매칭). 소리 정책은 종전. — AXIS-01 원문 「토스트만 보이고」 를 뒤집는다(사용자 2026-10-13).
- **D-04: 계좌 1개 사용자 · 사이드바 클릭 전환은 Claude 재량(아래).**

#### 상단 줄 (AXIS-02 — 채택 목업 ① A)
- **D-05: 한 줄 필(A).** 왼쪽 계좌 셀렉트(네이티브 `<select>` 유지 · 옵션 글자 D-12 · 옆 서버키 칩 유지), 이어서 시세 · 주문 상태(LED 점 + 짧은 말 — `quotePillOf`/`orderPillOf` 그대로), 오른쪽 끝 컬럼 세그먼트(1·2·3단). 폰 밴드는 세그먼트가 줄 아래로 내려간다(지금처럼 폰에서 숨기는 규칙은 목업대로 「아래 줄」 로 바꾼다 — 플래너가 §2.2b 밴드 규칙과 맞춘다). 제목 「트레이딩」 h1 유지. — **Reversibility:** reversible.
- **D-06: 뺀다 — 「정규」 배지와 77 예약 창 배지 전부**(`queuedWindowBadgeOf` 소비처 제거 · E2E `workbench-window-badge` 단언 삭제 · 관련 단위 테스트 갱신) · **알림음 토글**(→ D-15) · **반영 시각**(`stat-applied`) · **다시 연결 버튼**(끊김일 때만 주문 알약 안 「다시 연결」 링크 — 목업 「주문 끊김」 상태) · **낡은 전략 · 옮김 보조 줄**(`workbench-stale-strategies` · `workbench-moved-from` — 상단 줄 밖으로: 플래너 재량으로 계좌 셀렉트 아래 한 줄 또는 토스트성 안내, 문구 `WORKBENCH_STATUS_TEXT` 유지). relay 77 수신 · `queuedWindow` 상태는 카드 안 예약 표시가 쓰므로 relay · 리듀서는 무변경.
- **D-07: 남긴다 — 컬럼 수 세그먼트만.**

#### /me 현황 · 주문 (AXIS-03 · AXIS-04 — 채택 목업 ③ A · ④)
- **D-08: 현황 탭 전략 현황을 계좌별 묶음으로.** `accounts[]` 순, **모든 계좌** 소제목(전략 0건은 「등록된 전략 없음」 빈 상태 한 줄). 소제목 「계좌 · 번호 · 상품명 · 서버키」(D-12). 묶음 안: 전략 행(지금 `StrategyRow` · 2줄째 계좌번호는 소제목이 있으니 코드 · 거래소만) → VI 행(④ 전엔 그 VI 의 계좌 묶음에 한 행 · ④ 뒤 계좌당 거래소별). `MeStatusBar` 「상따 N건 · VI · 계좌 N개」 유지.
- **D-09: 전체 비활성화는 둘 다.** 카드 맨 아래 「전체 비활성화」(지금 `strategies.disable` 무인자) 유지 + 각 계좌 소제목 오른쪽 끝 작은 테두리 버튼 「이 계좌 끄기」(목업 ③ A). 계좌별 끄기는 relay `strategies.disable` 에 **`accountNo` 선택 인자** — relay 가 그 계좌의 켜진 상따를 건별 `lc.set`(스위치 off) · 그 계좌 VI 를 `vi.set(run:false)` 로 보낸다(서버 와이어는 세션 단위라 계좌 필터는 relay 몫). 확인 다이얼로그는 지금 것 재사용(계좌 1개 나열). — **Reversibility:** reversible(relay 프레임 optional 인자).
- **D-10: 주문 탭에 계좌 선택.** 카드 제목 옆 계좌 필 — **작업대와 같은 부품**(D-13) · **값은 따로 기억**(기본값 = 작업대 계좌, 저장 키 별도 · 기기별). 고른 계좌 주문만 **평탄 목록**(그룹 소제목 제거), 탭 라벨 「주문 N」 = 고른 계좌 건수. 상세창 `/trading/order-log?account=` 는 무변경. Phase 16 **D-21(「계좌 선택 UI 없음 · 계좌별 섹션 세로 반복」)을 주문 탭에서 뒤집는다** — 잔고 탭은 D-21 그대로(세로 반복).
- **D-11: 잔고 탭 소제목도 D-12 형식**(서버키 추가). `AccountPanel` 계좌 전용 모드 머리 수정.
- **D-12: 계좌 라벨 한 벌.** shared `accountLabelOf` 를 「번호 · 상품명 · 서버키」 까지 내는 변형(이름 확정은 플래너)으로 넓혀 ① 상단 줄 셀렉트 옵션 ② /me 현황 · 잔고 소제목 ③ 주문 탭 필 ④ 토스트 계좌 줄 ⑤ 사이드바 소제목(이름 · 서버키만) 이 같은 함수를 읽는다. 계좌번호 마스킹 없음(D2 · S-5 유지).
- **D-13: 계좌 선택 공용 부품.** 지금 `AccountPill`(workbench-status-bar 안)을 `components/trading/account-pill.tsx` 류로 올려 작업대 · /me 주문 탭이 같이 쓴다. props `{accounts, accountNo, onChange, title?}` — 네이티브 `<select>` 유지(`appearance-none` 금지).

#### 매매설정 서버별 (AXIS-05 — 채택 목업 ⑤ A)
- **D-14: 서버 세그먼트.** 「상따 기본설정」 제목 아래 **세션이 열린 서버**(그 사용자의 결선 세션 서버키 목록 — 등록만 되고 꺼진 서버는 없음) 세그먼트 `KB120 | KYOBO119`. 라벨은 서버키 그대로. 세그먼트 점 = 그 서버 84 수신 여부; 미수신 서버를 고르면 12행이 흐려지고 칩 「아직 못 받음」(지금 `loading` 상태 재사용 — 편집 · 저장 잠금). **기본 선택 = 마지막으로 고른 서버**(기기별 localStorage `gh-radar:me-settings-server:{userId}` 류), 없거나 그 서버 세션이 닫혔으면 **목록 첫 서버**(relay primary 규칙과 같은 순서 = KB 먼저). 작업대 계좌와 독립. 저장은 고른 서버에만(캡션 「고른 서버에만 저장돼요」). 웹 42 를 다른 서버로 복제하는 기능은 **없다**(2026-10-12 결정 유지).
- **D-14a: relay.** `user.settings` 프레임에 `serverKey` 를 싣고 서버마다 1프레임(캐시 `(userId, serverKey)` · `#fromPrimary` 84 필터 해제 · 43 요청은 Ready 된 세션마다). `user.settings.set` zod 에 `serverKey` **optional** — 부재면 primary(구 탭 관용 · Phase 31 D-14 보정과 같은 결), 있으면 그 세션으로 42. 되싣기(금액 키 부재 · 후매수 최소)는 **그 서버** 84 캐시에서. 재연결 replay(`fanout.ts` 1882)는 서버별 전부. 클라이언트가 「세션 열린 서버 목록」 을 알 길이 지금 없다 — 서버별 `user.settings` 프레임의 `serverKey` 집합이 곧 목록이다(별도 프레임 추가 안 함 · 플래너 재량으로 `state` 프레임에 `sessions[]` 를 넣어도 됨). — **Reversibility:** costly — relay 프레임 · zod · hub 캐시 키 · webapp 훅 전부 서버 축이 생긴다.
- **D-14b: 상따 폼 시딩 = 카드 계좌의 소유 서버 84.** `seedFromUserSettings` · `preBuyWatchFixedOf` 입력을 `userSettingsByServer[card 계좌 serverKey]` 로(계좌 `serverKey` 는 `RelayAccount.serverKey`). 모르면(서버키 없음 · 그 서버 84 미수신) 시딩 생략(0 · 빈칸 — Phase 31 D-12 의 「없으면 추가하지 않는다」 와 같은 결).
- **D-15: 돌파 알림음 토글 → /me 설정 탭 「이 기기」 묶음.** 매매설정 카드 아래 별도 카드(캡션 「이 브라우저(기기)에만 저장돼요」), 저장은 지금 `gh-radar:breakout-tone` localStorage 그대로(서버 · relay 무변경). 작업대 `ToneToggle` DOM 제거, `readTonePref` 소비(돌파 소리 재생)는 유지. 단위 테스트 `tone` describe 이전.

#### VI 계좌별 — 마지막 웨이브 (AXIS-01 VI 행 · gh-trade Phase 33 뒤)
- **D-16: 순서.** 웨이브 ①~③(아래 「웨이브」) 은 VI 를 **건드리지 않는다**(지금 VI 행 · relay 그대로 — 작업대 VI 설정 행은 상단 계좌와 무관하게 현행 유지, 「안내 + 옮기기」 임시안은 쓰지 않는다). gh-trade Phase 33 이 fbs(61 `account_no` 상시 · `unregistered` bool append · 21 응답 = 세션 계좌마다 61 1프레임 · 미등록 계좌도 계좌 · 거래소만 채운 프레임 · 56/72/73/33 무변경)를 `sync-relay-schema.sh` + 인박스로 보내면 웨이브 ④ 를 집행한다. **배포 순서 (b):** gh-radar relay 먼저(구 서버 61 = 계좌 1건이라 호환 · 20:00 KST 뒤) → gh-trade 서버(KB120 · 121 · 교보119) → webapp push. relay 준비되면 gh-trade 세션에 알린다.
- **D-17: relay.** `#viTriggers` 키 `(소유키, 계좌, 거래소)` · `#mergeVi` 의 사용자 · 거래소 병합과 `viRunningElsewhere` · `#stopViElsewhere`(서버 간 1건 가드) 제거 · `VI_BROKER="KB"` 원천 한정 해제(`#viSourceOwners` = 그 사용자의 **모든** 결선 세션 · 교보 세션 61/72/73/56 도 받는다) · `vi.set` 세션 = **그 계좌의 소유 세션**(증권사 무관 · `resolveEffectiveOrderServer`). 브라우저 `vi` 프레임에 `accountNo` 를 싣고 계좌 · 거래소마다 1건(`viTriggers` 타입이 `Record<exchange, …>` 에서 `(accountNo, exchange)` 맵으로). `unregistered` 프레임은 그 칸 null. — **Reversibility:** one-way — 웹 `vi` 프레임 모양과 relay 캐시 키가 바뀌는 공개 계약이며, 구 webapp 이 켜진 동안 양쪽 모양을 함께 내는 호환 창이 필요하다(플래너가 `checkpoint:decision`).
- **D-18: 웹.** 작업대 VI 설정 행 = **고른 계좌**의 KRX · NXT 행(없으면 미등록 빈 행 — 그 계좌로 등록). 「옮기기」 흐름(`viMoveTargetOf` · ⑨)은 계좌별 슬롯이면 뜻이 없으므로 제거. /me 현황 VI 행 = 계좌 묶음 안 거래소별. 사이드바 VI 줄 = 계좌 묶음 안. 교보119 VI 실증(UAT)을 이 웨이브 안에 둔다. 같은 종목 여러 슬롯 동시 발주는 서버가 허용(먼저 켠 순).

#### 웨이브 · 배포
- **D-19:** ① /me 현황 계좌별 · 주문 탭 계좌 선택 · 잔고 소제목 · 라벨 한 벌 · 공용 필(데이터 변경 없음 · webapp 만) → ② 작업대 계좌 스코프 · 상단 줄 A · 사이드바 계좌 묶음 · 토스트 계좌 줄 · 알림음 이전 · 계좌별 끄기(relay `strategies.disable` 인자 — 작은 relay 변경) → ③ 매매설정 서버별(relay + shared + webapp) → ④ VI 계좌별(gh-trade Phase 33 뒤 · relay 먼저). ①②는 webapp push = 프로덕션. ②의 relay 부분과 ③ · ④ relay 는 20:00 KST 뒤 배포, push 는 relay 뒤([[feedback_deploy_relay_before_push]]). E2E(trading-workbench · a11y aria-live · me · 단위 `workbench-status-bar.test.tsx`)는 각 웨이브에서 새 구조로 갱신.

### Claude's Discretion
- 계좌 1개 사용자: 셀렉트는 그대로(옵션 1개 · 비활성 아님) — 라벨이 곧 「지금 보는 계좌」. 계좌 0개(확인 중)는 지금 문구.
- 사이드바 전략 항목 클릭: 그 카드의 작업대로 이동하면서 **작업대 계좌를 그 카드 계좌로 바꾼다**(D-01 스코프라 안 바꾸면 카드가 안 보인다).
- 계좌 전환 때 열린 시트 · 인라인 편집은 닫는다(카드가 숨겨지므로).
- 낡은 전략 · 옮김 보조 줄의 새 자리(D-06) · 폰 밴드 세그먼트 줄 · 주문 알약 끊김 문구.
- D-12 함수 이름 · D-13 파일 위치 · localStorage 키 이름 · `state` 프레임 `sessions[]` 추가 여부(D-14a).
- 주문 탭 「주문 N」 카운트 산출(지금 `onCountChange` 를 고른 계좌 필터 뒤로).

### Deferred Ideas (OUT OF SCOPE)
- **VI 계좌별 슬롯의 gh-trade 쪽 구현** — gh-trade Phase 33(2026-10-13 착수). 이 phase 웨이브 ④ 의 전제이지 이 phase 의 일이 아니다.
- **잔고 탭 계좌 선택** — 잔고 탭은 D-21(세로 반복) 유지. 주문 탭처럼 바꾸고 싶으면 별도 quick.
- **웹 42 전서버 복제 · gh-trade 공유 저장** — 2026-10-12 결정으로 불채택(재논의 시 인박스 `261012-usersettings-shared-across-servers.md` 부터).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AXIS-01 | 작업대 계좌 선택이 화면 범위다 — 카드 · VI 스트립 · VI 설정 행 · (토스트는 D-03 으로 「전부 + 계좌 줄」) · 새 카드 기본 계좌 유지 | §작업대 스코프(카드 격자 숨김 마운트 · ISIN 단위 경로 4곳 스코프 · `pickAccount` 경유 전환) · Pitfall 5 · 6 · 7 · 웨이브 ④ §VI |
| AXIS-02 | 상단 줄 재설계(정규 배지 · 사운드 토글 · 반영 시각 · 다시 연결 버튼 제거, 목업 A) · 알림음 새 자리 기록 | §상단 줄 A — 지울 것 · 남길 슬롯(`workbench-status-bar` `data-status` 는 다른 spec 5개가 준비 신호로 쓴다) · Pitfall 4 · 8 |
| AXIS-03 | /me 현황 전략 현황 계좌별 묶음(소제목 계좌 · 번호 · 상품명 · 서버키 · VI 행 포함) | §/me 현황 · Pitfall 1(D-09 lc.set=삭제) · 2(구 relay strip) · 3(65 N건) · 계좌 끄기 relay 설계 |
| AXIS-04 | /me 주문 탭 계좌 선택(작업대와 같은 부품 · D-21 뒤집음 기록) | §/me 주문 · Pitfall 10(목록 밖 계좌 행) |
| AXIS-05 | /me 설정 매매설정 서버별 — relay `serverKey` · 84 캐시 `(userId, serverKey)` · `#fromPrimary` 해제 · 42 지정 서버 · 상따 폼 시딩 = 카드 계좌 소유 서버 | §relay 84 서버 축(지점 9곳) · §서버 목록 원천 · Pitfall 11 · 12 · 13 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- 문서 산문과 사용자 대면 문구는 **한글**로 쓴다. 커밋 메시지도 한글이고, **Co-Authored-By 를 넣지 않는다**(사용자 전역 CLAUDE.md 가 시스템 attribution 지시보다 우선). 커밋 전에 메시지를 보여 주고 확인을 받는다. GSD executor 커밋은 GSD 흐름을 따른다.
- 파일 변경은 GSD 명령 흐름 안에서만 한다.
- **상따 화면 반응형은 본문 폭 4밴드 컨테이너 쿼리다.** 표의 정본은 `webapp/src/styles/globals.css` §2.2b 한 곳이다 — **표를 복사하지 마라.** 앱 셸과 사이드바만 뷰포트 브레이크포인트를 쓴다.
- **gh-trade 인박스:** 세션을 시작하면 `docs/inbox/from-gh-trade/` 의 `status: open` 노트를 먼저 읽는다. 처리한 노트는 `status: done` · `done_commit` 을 채우고 경로를 지정해 커밋한다. 웨이브 ④ 는 gh-trade 가 보낼 `YYMMDD-vi-per-account.md` 노트로 시작한다.
- 배포: 프론트는 Vercel, 백엔드는 Cloud Run 이다. **push 가 곧 webapp 프로덕션 배포다.** relay 를 먼저 배포하고 push 는 그 뒤에 한다. relay 배포는 **20:00 KST 이후에만** 한다(장 시간 08:00~20:00).
- 메모리 규칙 중 이번 phase 에 걸리는 것:
  - 서브에이전트 배포는 분류기가 막는다 → executor 는 커밋까지만 하고, 배포는 메인 세션이 한다.
  - 동시 세션에서는 vitest `--maxWorkers=2` · playwright `--workers=1` 로 돌린다.
  - dev 포트는 3100 이다.
  - UI 는 HTML 목업이 먼저다(이미 채택 — 채택 목업이 화면 정본).
  - 손보는 표면 안의 시각 결함은 바로 고친다.
  - 「두 클라 갈림은 WinForms 동형 기본」.
  - 보안검사(secure-phase)는 생략한다(`security_enforcement: false`). nyquist 는 유지한다.
  - 작업은 master 에서 한다.
  - 갭 클로징 재리뷰는 `-R2` 별도 파일로 낸다.
  - 실행 중인 다른 phase 가 있으면 plan-phase 의 STATE 경합에 주의한다.
  - Supabase 는 이번 phase 와 무관하다(DB 변경 없음).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 작업대 계좌 스코프(카드 · VI 스트립 · 공용 패널 필터, 숨김 마운트) | Browser(webapp 작업대) | — | 데이터는 이미 전 계좌가 와 있다(`useRelayContext`). 표시 필터일 뿐이다. 「값은 서버가 정하고 웹은 표시만」 |
| 계좌 라벨 한 벌(번호 · 상품명 · 서버키) | Browser(`lib/account-label.ts`) | shared(재량) | 지금 `accountLabelOf` 는 webapp `lib` 에 있다(shared 아님 — 아래 §D-12 위치) |
| 계좌별 끄기의 계좌 → 전략 키 · VI 풀이 | API/Backend(relay fanout + hub) | Browser(버튼 · 다이얼로그 · 완료 판정) | 서버 14/11 은 세션 단위다. relay 가 소유 세션 · 캐시를 쥐고 있다(D-09) |
| 84 서버별 캐시 · 42 지정 서버 라우팅 · replay | API/Backend(relay hub · fanout) | — | 서버(게이트웨이)마다 `user_settings.toml` 이 따로 있다. relay 가 (유저, 서버) 세션을 안다 |
| 서버 세그먼트 · 선택 기억 · 미수신 잠금 | Browser(/me 설정) | — | 기기별 localStorage |
| 상따 폼 시딩 서버 선택(카드 계좌 → 소유 서버) | Browser(`limit-chaser-form.tsx`) | — | `RelayAccount.serverKey` 는 표시용 필드지만 relay 소유 뷰에서 나온 값이다(29-36) |
| VI (계좌, 거래소) 슬롯 · 발주 | 외부(gh-trade 서버 · Phase 33) | relay(캐시 키 · 원천 해제) · Browser(행) | 웨이브 ④ |
| 영속 저장 | — | — | **DB 변경 없음.** localStorage 키만 새로 생긴다 |

## Standard Stack

신규 라이브러리는 없다. 기존 스택 그대로다.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod (relay) | 기존 | 인바운드 `serverKey` · `accountNo` 선택 인자 | `RelayUserSettingsSetSchema` · `RelayStrategiesDisableSchema` 패턴 그대로 [VERIFIED: relay/src/ws/protocol.ts:426-457] |
| vitest | relay · shared `^4.1.4` / webapp `^2.1.9` | 단위 · 컴포넌트 | [VERIFIED: package.json 실행 출력] |
| Playwright | 1.59.1 | webapp E2E(진짜 relay + 스텁 게이트웨이) | [VERIFIED: `npx playwright --version` → `Version 1.59.1`] |
| flatc | 25.12.19 | 웨이브 ④ 생성물(gh-trade `sync-relay-schema.sh` 가 고정 · gh-trade 가 돌린다) | [VERIFIED: `flatc --version` → `flatc version 25.12.19`] |

**Installation:** 없음.

## Package Legitimacy Audit

이번 phase 는 외부 패키지를 설치하지 않는다 — 감사 대상 0.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (없음) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## 계약 · 코드 정본 (이번 세션에 직접 읽은 값)

### relay hub — 84 캐시 · primary 전용 · 43
- 캐시 선언은 사용자 단위 1건이다 [VERIFIED: relay/src/hub/subscription-hub.ts:1044-1050]:
  `readonly #userSettings = new Map<string, RelayUserSettingsMsg>();` — 주석 「`userId` → 사용자 설정 **최신 1건**」.
- 머리 표에서 84 는 「primary 전용」 이다 [VERIFIED: subscription-hub.ts:103-104]:
  `84 사용자 설정 · 76/78 돌파 · 77 예약 창    primary 전용   사용자 단위 키 그대로 — 다른 세션 프레임은 debug 드롭` · `요청: 25(계좌) · 24(상따)는 세션마다 Ready 에서, 21 · 34 는 VI 원천 세션마다(21 대기열은 소유 키별), 43 은 primary 세션만.`
- 84 수신 갈래 [VERIFIED: subscription-hub.ts:2649-2656]:
  ```ts
  case MSG.UserSettingsResp: {
    if (!this.#fromPrimary(userId, owner, e.msgType)) return;
    const settings = parseUserSettings(e.env);
    if (settings !== null) this.#onUserSettings(userId, session, settings);
    return;
  }
  ```
  76 · 78 · 77 도 같은 `#fromPrimary` 를 지난다(2629 · 2637 · 2644). **84 갈래 하나만 풀어야 한다.**
- `#fromPrimary` 함수 본체 [VERIFIED: subscription-hub.ts:2726-2733] — `if (this.#primaryOwner(userId) === owner) return true;` 아니면 debug 로그를 남기고 false.
- `#onUserSettings` [VERIFIED: subscription-hub.ts:2850-2854]: `this.#userSettings.set(userId, settings); if (!session.isReady) return; this.#fanout(userId, settings);`
- `getUserSettings(userId)` [VERIFIED: subscription-hub.ts:2245-2247] — `return this.#userSettings.get(userId);`
- 43 요청은 primary 뿐이다 [VERIFIED: subscription-hub.ts:2042-2044 · 2061-2067]: `const primary = owner === this.#primaryOwner(userId);` … `if (primary) this.#requestPrimarySnapshot(userId, session);` — `#requestPrimarySnapshot` 본문은 `session.send(buildGetUserSettingsReq());` 하나다.
- primary 가 바뀌면 84 를 버리고 새 primary 로 43 을 보낸다 [VERIFIED: subscription-hub.ts:1504-1516 · 3817-3829]: `#afterPrimaryChange` 가 `this.#clearPrimaryCaches(userId)` 를 부르고, `#clearPrimaryCaches` 끝줄이 `this.#userSettings.delete(userId);` 다. `#clearCaches(…, wasPrimary)` 도 primary 였을 때만 그 함수를 부른다(3776).
- 소유 키 모양 [VERIFIED: subscription-hub.ts:652-683]: `userPrefix` = `` `${userId}|` `` · `ownerKey` = `` `${userId}|${serverKey}` `` · `ownerPrefix` = `` `${owner}|` `` · `serverKeyOf(session)` = `session.serverKey ?? brokerOf(session)`.

### relay fanout — 42 라우팅 · replay · 세션 맵
- `user.settings.set` 분기 [VERIFIED: relay/src/ws/fanout.ts:2117-2137]: `const session = this.#strategySession(conn, userId, msg.t);`(계좌 없음 → primary) · `const amount = msg.s.postBuyFloorAmount ?? this.#hub.getUserSettings(userId)?.postBuyFloorAmount;` · 둘 다 없으면 `USER_SETTINGS_FLOOR_UNKNOWN_TEXT` 거부 프레임을 보내고 소켓은 유지한다.
- `#strategySession` [VERIFIED: fanout.ts:2371-2384] — `(accountNo !== undefined ? this.#sessions.forAccount(userId, accountNo) : undefined) ?? this.#sessions.primaryOf(userId)` 다음 `#readySession`. **서버키로 세션을 고르는 경로는 지금 없다.**
- 사용자 세션 맵의 키는 서버키다 [VERIFIED: fanout.ts:602-607 · 2956 · 2974]: `sessions: Map<string, EntrySession>` — 주석 「서버 키 → 증권사 세션」 · `entry.sessions.set(session.serverKey, { session, onState: … })`. 그래서 42 지정 서버 세션은 `this.#users.get(userId)?.sessions.get(serverKey)?.session` 으로 찾고 `#readySession` 을 거친다.
- 인증 직후 replay [VERIFIED: fanout.ts:1882-1885]: `const userSettings = this.#hub.getUserSettings(userId); if (userSettings !== undefined) this.#send(conn, userSettings);`
- 「전부 정지」 분기 [VERIFIED: fanout.ts:2180-2204]: `const key = msg.key ?? "";` · 빈 키면 `#allStopTargets` 로 primary 증권사 세션 전부에 14 를 보낸다(2개 이상이면 `#allStop` 집계). 키가 있으면 `#strategySession(conn, userId, msg.t)`(= primary)으로 14(key) 를 보내고 `this.#hub.noteUserDisable(session)` 을 부른다. **키 지정 경로가 primary 세션으로 가므로, 다른 서버 소유 계좌의 키는 엉뚱한 서버로 간다.** 계좌 끄기는 `forAccount` 소유 세션으로 보내야 한다.
- `VI_BROKER` [VERIFIED: fanout.ts:303-307] — `const VI_BROKER = "KB";` · `#viSessionFor` [VERIFIED: fanout.ts:2438-2442] — 소유 세션이 KB 면 그 세션, 아니면 primary.

### relay protocol — zod
- `RelayUserSettingsSetSchema` [VERIFIED: relay/src/ws/protocol.ts:426-446] — `t: z.literal("user.settings.set")`, `s: z.object({ … postBuyFloorAmount: userSettingInt("postBuyFloorAmount").optional(), preBuyWatchAmount: userSettingInt("preBuyWatchAmount").optional(), preBuyAutoAddBuy: z.boolean().optional() })`. 최상위에 `serverKey` 는 없다.
- `RelayStrategiesDisableSchema` [VERIFIED: protocol.ts:454-457] — `t: z.literal("strategies.disable")`, `key: z.string().max(64).optional()`.
- **strip 동작** [VERIFIED: protocol.ts:420 주석] — 「실려 와도 zod 기본 strip 으로 버려진다(엄격 모드 금지 · T-18-07)」. 파싱 실패는 `parseInbound` 가 `null` 을 돌려주고 호출자가 close(4400) 한다 [VERIFIED: protocol.ts:649-678]. 판별자 목록은 `RelayInboundSchema = z.discriminatedUnion("t", […])` 이다 [VERIFIED: protocol.ts:551-565].

### shared — 계약 타입
- `RelayUserSettingsMsg` [VERIFIED: packages/shared/src/relay.ts:1499-1502]: `{ t: "user.settings"; present: boolean } & Omit<RelayUserSettingsValues, "postBuyFloorAmount" | "preBuyWatchAmount" | "preBuyAutoAddBuy"> & { postBuyFloorAmount?: number; preBuyWatchAmount?: number; preBuyAutoAddBuy?: boolean }` — `serverKey` 없음.
- `RelayUserSettingsSetMsg` [VERIFIED: relay.ts:786-789]: `{ t: "user.settings.set"; s: RelayUserSettingsValues }` — 주석 784 「계좌 축이 없다 — 서버가 세션 신원으로 저장한다」.
- `RelayStrategiesDisableMsg` [VERIFIED: relay.ts:807]: `{ t: "strategies.disable"; key?: string }`.
- `RelayAccount.serverKey` [VERIFIED: relay.ts:943-950] — `serverKey?: string;` 주석 「브라우저 **표시용**이다 — 판정 근거가 아니다」.
- `RelayStateMsg` [VERIFIED: relay.ts:971-983] — `t · s · msg? · attempt? · accounts?` 뿐이다. **`sessions[]`/`servers` 필드는 없다.** `RelayOutbound` 합집합에도 서버 목록 프레임이 없다 [VERIFIED: relay.ts:1794-1819].
- `RelayViTrigger` [VERIFIED: relay.ts:579-598] — `accountNo · exchange · orderAmountKrw · checkRate · priceType: "U" · run`. `RelayViTriggerMsg` [VERIFIED: relay.ts:1291-1300] — `{ t: "vi"; x: RelayExchange; cfg: RelayViTrigger | null }`.

### relay — 단일 세션도 모든 계좌에 serverKey 를 싣는다
[VERIFIED: fanout.ts:3060-3091] `#mergedStateFrame`: 세션 1개면 `this.#withAccountExtras(userId, frameOf(primary), () => primary.serverKey)` 이고, 여럿이면 `for (const s of [primary, ...sessions.filter((x) => x !== primary)])` 순으로 계좌를 쌓아 `ownerOf.set(a.accountNo, s.serverKey)` 를 한다. `DmaSession.serverKey` 는 늘 문자열이다 — `this.#serverKey = creds.serverKey ?? creds.broker;` [CITED: relay/src/dma/session.ts:204 — bash 로 읽음]. 그래서 **`accounts[]` 의 서버키 순서는 primary 먼저**다. 다만 소유 계좌가 0 인 세션은 병합에서 빠진다(3067-3069).

### webapp — 상태 · 소비처
- 리듀서 단일 값 [CITED: webapp/src/lib/use-relay-socket.ts:616 · 762 · 811 · 1116-1119 — bash]: `case "user.settings": return { ...state, userSettings: frame };`
- `userSettings` 소비처(테스트 제외 · grep): `components/me/limit-chaser-defaults.tsx`(559 `usableUserSettingsOf(relay.userSettings)` 외) · `components/trading/limit-chaser-form.tsx`(820 · 828 · 951-952 · 969 · 993 · 1281) · `lib/relay-provider.tsx`(388 기본값) · `lib/limit-chaser.ts`(471 `seedFromUserSettings` · 488 `preBuyWatchFixedOf` — 함수 입력은 그대로) · `lib/use-relay-socket.ts`(616 · 762 · 811 · 1119 · 2241). 테스트: `limit-chaser-defaults.test.tsx` · `limit-chaser-form.test.tsx` · `relay-socket.test.ts`. E2E: `me.spec.ts` · `trading-workbench.spec.ts` · 픽스처 `e2e/fixtures/relay.ts`.
- `RelayViTriggers` [VERIFIED: webapp/src/lib/use-relay-socket.ts:325] — `export type RelayViTriggers = Partial<Record<RelayExchange, RelayViTrigger | null>>;` · `VI_EXCHANGES` [VERIFIED: 331] — `["KRX", "NXT"]`.
- `viTriggers` 소비처(웨이브 ④): `app-sidebar.tsx:463,473` · `me-client.tsx:197,272` · `strategy-status-card.tsx:379,402,543` · `trading-workbench.tsx:589,1272,1419,1606-1622` · `vi-settings-rows.tsx:220,240,274`.
- localStorage 키 [VERIFIED: webapp/src/lib/trading-layout.ts:125 · webapp/src/lib/breakout-list.ts:35-37]: `"gh-radar:trading-account:"`(값 `{ v: 1, accountNo }` · 153) · `"gh-radar:breakout-tone"` · `"gh-radar:trading-cols"`.
- 폭 상수 [VERIFIED: trading-layout.ts:35 · trading-workbench.tsx:222]: `WB_PHONE_BAND_BELOW = 700` · `WB_SINGLE_COLUMN_BELOW = 680`.
- `STRATEGIES_DISABLE_ACK_TIMEOUT_MS = 8_000` [VERIFIED: use-relay-socket.ts:173].

### gh-trade 서버 동작(원본 C++ — bash 로 읽음)
- 14 키 지정 = **등록 유지 · 게이트만 내림** [CITED: gh-trade/server/src/trade/strategy/StrategyManager.cpp:400-440]. `DisableOne` 은 사본에서 `buyEnabled · sellEnabled · postBuyAuto · cancelQtyEnabled · cancelTradeEnabled · autoSellEnabled = false` 로 두고 `UpdateConfig` 한다. 맵에 없는 키면 warn 을 남기고 false 다. Gateway 는 키 하나에 60 에코 1건과 65 를 보낸다 [CITED: gh-trade/server/src/net/Gateway.cpp ProcessDisableStrategies — 「key 가 비었으면 일괄, 있으면 그 한 건」]. protocol.md 33행은 `DisableStrategiesReq(14) … 전략 일괄(key="")/단건(key) 비활성화 — 등록 유지` 라고 적는다.
- Set 의 「전부 OFF = 삭제」 [CITED: gh-trade/server/src/net/Gateway.cpp:3211-3219] — `if (cfg.crud != 'D' && !cfg.buyEnabled && !cfg.sellEnabled && !strategy::AnyCancelEnabled(cfg) && !cfg.autoSellEnabled) { … if (!autoLive) cfg.crud = 'D'; }`. webapp 주석도 같은 사실을 적어 둔다(`strategy-status-card.tsx` ⑨ 「세 스위치를 모두 OFF 로 제출하면 서버가 삭제(crud "D")로 정규화한다」).
- `DisableOne` 이 끄는 필드는 webapp `isActiveStrategy` 의 판정 필드와 같다 — `c.buyEnabled || c.sellEnabled || c.cancelQtyEnabled || c.postBuyAuto || c.autoSellEnabled` [CITED: webapp/src/lib/limit-chaser.ts:165-173 — bash]. 그래서 계좌 끄기 뒤 「켜진 전략 0」 으로 수렴한다.

## Architecture Patterns

### System Architecture Diagram

```
                      ┌────────────────────── webapp (브라우저) ───────────────────────┐
 사용자 조작 ─────────▶│ 작업대 상단 줄 A ─ AccountPill(공용) ─ pickAccount ─┐            │
                      │      │                                              ▼            │
                      │      │                      accountNo(작업대 스코프 상태)        │
                      │      │           ┌──────────────┼───────────────┬───────────┐   │
                      │      │           ▼              ▼               ▼           ▼   │
                      │      │   CardGrid(보임=계좌일치 · VI 스트립(viOrders   공용패널   VI 설정 행│
                      │      │    숨김 카드는 마운트)   .accountNo 필터)  (계좌)     (④ 뒤)   │
                      │      │                                                          │
                      │ 토스트(전 계좌 + 계좌 줄) ─ 탭 ─▶ pickAccount(alert.accountNo) → 카드 │
                      │ 사이드바 계좌 묶음 ─ 전략 클릭 ─▶ requestTradingFocus → pickAccount   │
                      │ /me 현황(계좌 묶음) ─ 「이 계좌 끄기」 ─▶ send strategies.disable{accountNo}
                      │ /me 주문(AccountPill · 별도 키) ─▶ journalRows 필터                 │
                      │ /me 설정(서버 세그먼트) ─▶ send user.settings.set{serverKey, s}     │
                      │ 리듀서: user.settings{serverKey} ─▶ userSettingsByServer Map        │
                      └──────────────┬───────────────────────────────▲────────────────────┘
                                     │ wss                           │ 프레임
                      ┌──────────────▼──────────── relay ────────────┴────────────────────┐
                      │ fanout: strategies.disable{accountNo} → forAccount 소유 세션      │
                      │   → 그 계좌 켜진 상따 키마다 14(key) · 그 계좌 켜진 VI 마다 11 run:false│
                      │   → hub 집계(65 N건 → strategies.disabled 1건)                    │
                      │ fanout: user.settings.set{serverKey?} → users.sessions.get(serverKey)│
                      │   (부재 → primary · 있는데 세션 없음/미준비 → 거부 프레임, 소켓 유지) │
                      │ hub: 84(모든 세션) → #userSettings[ownerKey] → user.settings{serverKey}│
                      │      Ready 마다 43 · 세션 교체/분리 = 그 소유키 84 만 폐기            │
                      │ 인증 replay: 서버마다 user.settings 1프레임                       │
                      └──────────────┬────────────────────────────────────────────────────┘
                                     │ TCP (세션 = (유저, 서버))
                    ┌────────────────┴─────────────┐
                    ▼                              ▼
             KB120 게이트웨이                KYOBO119 게이트웨이     (서버마다 user_settings.toml 따로)
```

### Recommended touch map (파일 → 책임)

**웨이브 ① — webapp 만(데이터 변경 없음)**
| 파일 | 변경 |
|------|------|
| `webapp/src/lib/account-label.ts` | D-12 변형 추가(예: `accountFullLabelOf({accountNo, name, serverKey})` → `번호 · 상품명 · 서버키`, 빈 칸 생략). 기존 `accountLabelOf` 는 수동주문 「주문계좌」 행과 글자를 맞추는 계약이 있어 그대로 둔다(quick-261007-h76) |
| `webapp/src/components/trading/account-pill.tsx`(신규) | `AccountPill` 이전(D-13) · props `{accounts, accountNo, onChange, title?}` · 네이티브 `<select>` · 서버키 칩. `data-slot` 은 쓰는 곳마다 다르게(작업대 `workbench-account` 유지 · /me 주문은 새 슬롯) |
| `webapp/src/components/trading/workbench/workbench-status-bar.tsx` | `AccountPill` export 를 새 파일에서 다시 내보내거나 import 를 갱신한다(웨이브 ② 에서 상단 줄 전면 개편) |
| `webapp/src/components/trading/strategy-status-card.tsx` | 계좌 묶음(`accounts[]` 순 · 빈 상태) · `StrategyRow` 2줄째에서 계좌번호 제거 · 그 계좌의 VI 행. 「이 계좌 끄기」 버튼은 relay 가 배포된 뒤라야 켤 수 있으므로 **웨이브 ②**(Pitfall 2) |
| `webapp/src/components/trading/today-orders-card.tsx` · `me-client.tsx` | 제목 옆 공용 필 · 평탄 목록 · `onCountChange` = 고른 계좌 건수 · 새 저장 키(예: `gh-radar:me-orders-account:{userId}`, 기본 = `readTradingAccount(userId)`) |
| `webapp/src/components/orderbook/account-panel.tsx` | 계좌 전용 모드 머리에 서버키(선택 prop `serverKey?` — 4표면 공용이라 선택 필드로) · `me-client.tsx` 가 `acct.serverKey` 를 넘긴다 |
| `webapp/src/lib/orders-api.ts` | 그대로 두거나 `filterJournalRowsByAccount` 를 추가한다(그룹 함수는 order-log 등 다른 소비처를 확인하고 지운다) |

**웨이브 ② — webapp + relay 작은 변경**
| 파일 | 변경 |
|------|------|
| `workbench-status-bar.tsx` | 목업 A: 계좌 필 · 시세 · 주문 · 세그먼트. 지울 것: `queuedWindowBadgeOf` 소비 · `ToneToggle` · `stat-applied` · 「다시 연결」 `Button`(→ 주문 알약 안 링크). **남길 것:** 루트 `data-slot="workbench-status-bar"` + `data-status`(아래 Pitfall 4) · `workbench-dma`(`aria-live`) · `workbench-quote` · `workbench-cols-segment` |
| `trading-workbench.tsx` | 머리줄 재배치 · `useAppliedAt` 제거 · 계좌 필터(`visibleCards`) · ISIN 단위 경로 4곳 스코프(Pitfall 6) · `pickAccount` 를 토스트 · 사이드바 포커스 · `?focus=` 경로에서 부른다(Pitfall 5) · 계좌 전환 때 시트 · 인라인 편집 닫기 · 빈 상태 문구(계좌에 카드 없음) |
| `card-grid.tsx` | 숨김 카드 지원 — `hiddenIds`(또는 `isVisible`) prop. 숨김 카드의 호스트는 `hidden` 주차 노드에 붙이고 포털은 유지한다. 빈 상태 판정은 「보이는 카드 0」 기준이다. 호스트 정리 효과는 **모든** 카드 id 를 present 로 본다(Pattern 2) |
| `vi-trigger-strip.tsx` 호출부 | `activeViOrders.filter(o => o.accountNo === accountNo)` |
| `shared-panels.tsx` | 이미 `accountNo` 축이다 — 무변경 |
| `alert-toasts.tsx` · `lib/trading-alerts.ts` | 계좌 줄(`data-part="account"`)을 그리고 `accounts` 로 이름 · 서버키를 푼다 · `TradingAlert.accountNo` 주석 「표시하지 않는다」 갱신 · 돌파 알림(계좌 없음)은 계좌 줄 없음 |
| `components/layout/app-sidebar.tsx` | `SUB_LIST` 안을 계좌 묶음으로(소제목 = 이름 · 서버키 칩 · `accounts` 필요) · VI 줄은 `viTriggers[ex].accountNo` 의 묶음에 · 목록 밖 계좌 전략은 번호만 있는 소제목으로 |
| `components/me/…` 설정 탭 | 「이 기기」 카드에 `ToneToggle` 이전(로직 그대로 · `data-slot` 재명명 재량) |
| `strategy-status-card.tsx` | 「이 계좌 끄기」 + 다이얼로그 재사용(계좌 1개) · 진행 중 상호 잠금 |
| `relay/src/ws/protocol.ts` · `packages/shared/src/relay.ts` | 계좌 끄기 인바운드(Pitfall 2 결정에 따라 `accountNo` 선택 인자 또는 새 `t`) |
| `relay/src/ws/fanout.ts` · `relay/src/hub/subscription-hub.ts` | 계좌 끄기 분기 · 집계기 확장(Pattern 3) |
| `webapp/src/lib/use-relay-socket.ts` | send 가로채기(2144)가 계좌 끄기도 in-flight 창으로 보도록(새 `t` 를 쓰면 조건을 넓힌다) |

**웨이브 ③ — relay + shared + webapp**
| 파일 | 변경 |
|------|------|
| `packages/shared/src/relay.ts` | `RelayUserSettingsMsg` 에 `serverKey?: string`(새 relay 는 늘 싣는다 · 구 relay 관용) · `RelayUserSettingsSetMsg` 에 `serverKey?: string` |
| `relay/src/ws/protocol.ts` | `RelayUserSettingsSetSchema` 최상위 `serverKey: z.string().min(1).max(<서버키 상한>).optional()` |
| `relay/src/hub/subscription-hub.ts` | 9곳 — Pattern 4 표 |
| `relay/src/ws/fanout.ts` | 42 세션 선택 · 되싣기 캐시 · replay 루프 |
| `relay/tests/helpers/frames.ts` · `fake-gateway.ts` | 필요하면 84 픽스처에 서버 구분 |
| `webapp/src/lib/use-relay-socket.ts` · `relay-provider.tsx` | `userSettings` → `userSettingsByServer: ReadonlyMap<string, RelayUserSettingsMsg>`(키 = `frame.serverKey ?? ""`) · `reset` 이 비운다 |
| `webapp/src/components/me/limit-chaser-defaults.tsx` | 서버 세그먼트 · 기억 키 · 미수신 잠금 · `send({t:"user.settings.set", serverKey, s})` · 비행 중 세그먼트 잠금(Pitfall 12) |
| `webapp/src/components/trading/limit-chaser-form.tsx` | `userSettings` 를 `accounts.find(a => a.accountNo === accountNo)?.serverKey` → `userSettingsByServer.get(…)` 로 바꾼다(820 · 828 · 951 · 993 · 1281) |

**웨이브 ④ — gh-trade Phase 33 뒤** — §웨이브 ④ 절 참조.

### Pattern 1: 계좌 스코프는 「숨김 마운트」 이고, 전환은 `pickAccount` 한 경로로만
**What:** 작업대는 `cards` 전수를 그대로 쥐고 `visible = cards.filter(c => c.accountNo === accountNo || c.accountNo === "")` 만 격자 자리표로 그린다. 숨김 카드도 포털로 마운트된 채 남는다(에코 · 더티 · 결과 모름 잠금 보존 — CardGrid ⑤ 규율).
**Why `pickAccount`:** 계좌 결정 효과 `pillAccountOf(accountNo, accounts, savedAccount)` 는 **저장값이 accounts 안에 있으면 저장값을 이긴다** [VERIFIED: trading-layout.ts:168-177 — `if (saved !== null && accounts.some((a) => a.accountNo === saved)) return saved;`]. 그래서 토스트 · 사이드바가 `setAccountNo(x)` 만 부르면 같은 렌더 사이클 안에 저장 계좌로 되돌아간다. 모든 프로그램 전환은 `pickAccount`(= `setAccountNo` + `setSavedAccount` + `writeTradingAccount`)를 거쳐야 한다 [VERIFIED: trading-workbench.tsx:620-623 효과 · 680-687 `pickAccount`].
**Example:**
```tsx
// trading-workbench.tsx — 사이드바 포커스(757~)와 ?focus= 효과(708~)에서
const hit = limitChasersRef.current.find((c) => c.key === strategyKey(f.isin, f.accountNo, f.exchange));
if (hit !== undefined && hit.accountNo !== accountNoRef.current) pickAccount(hit.accountNo);
// 토스트(openAlert): 카드가 있으면 그 카드 계좌, 없으면 알림 계좌, 둘 다 없으면(돌파) 현재 계좌
const target = hit?.accountNo || a.accountNo || accountNo;
if (target !== accountNo) pickAccount(target);
```

### Pattern 2: CardGrid 숨김 지원 — 호스트 주차
CardGrid 는 카드마다 `display: contents` 호스트를 만들고, 자리표 ref 가 그 호스트를 자기 안으로 옮겨 붙인다. 카드 자체는 `createPortal(renderCard(c), host, c.id)` 다 [CITED: webapp/src/components/trading/workbench/card-grid.tsx ⑤ · 렌더 끝 — bash]. 숨김 카드에는 자리표가 없으므로 호스트를 **보이지 않는 주차 노드**(`<div hidden data-slot="card-parking">`)에 붙인다. 문서에서 떼어 둔 노드여도 React 마운트는 유지된다. 다만 `ResizeObserver` · `scrollIntoView` · 포커스 복원이 문서에 붙어 있다고 가정하는 카드 효과가 있으면 주차 노드 쪽이 안전하다. 바꿔야 할 곳은 셋이다:
1. 사라진 호스트를 치우는 `useLayoutEffect` 의 `present` 를 보이는 id 가 아니라 **모든** 카드 id 로 잡는다. 안 그러면 숨기는 순간 호스트가 지워진다.
2. `cards.length === 0` 빈 상태 판정은 「보이는 카드 0」 으로 바꾼다. 문구는 「이 계좌에 카드가 없어요」 류로 하고 UI-SPEC 이 정한다.
3. ✕ 뒤 포커스 이동은 보이는 순서(`order`)만 본다. 계좌 전환으로 사라진 카드에 포커스를 보내지 않는다.

### Pattern 3: 계좌 끄기(D-09) — relay 가 14(key) 건별 + 11 run:false 를 보내고 65 를 모아 1건으로
**권고 와이어:** `{ t: "strategies.disable", accountNo }`. 단 Pitfall 2 를 보고 새 `t` 를 쓸지 결정한다.
**relay 동작:**
1. `#accountAllowed` 로 계좌가 그 사용자 것인지 확인한다(IDOR — 지금 `strategies.disable` 은 계좌 대조가 없다. 새 인자는 반드시 대조한다).
2. 소유 세션을 `this.#sessions.forAccount(userId, accountNo)` 로 찾는다(primary 아님).
3. hub `getLimitChasers(userId)` 중 `accountNo` 가 같고 「켜진」 것을 고른다. relay 에는 `isActiveStrategy` 가 없다. 같은 술어를 shared 로 올리거나 relay 에 5필드 술어를 둔다(webapp 정의 [CITED: limit-chaser.ts:165-173]). 그 키마다 `buildDisableStrategiesReq(key)` 를 보낸다.
4. 웨이브 ④ 전 hub VI 는 거래소별 병합값이다. `getViTrigger(userId, ex)` 의 `cfg.accountNo === accountNo && cfg.run` 인 거래소마다 그 값 그대로 `run:false` 로 11 을 보낸다(`#viSessionFor` 세션 · `#stopViElsewhere` 의 조립 모양 재사용 [VERIFIED: fanout.ts:2449-2471]).
5. 65 귀속: 키마다 14 를 보내면 그 소유키 FIFO 에 꼬리표가 하나씩 들어간다. `beginAllStop` 집계기는 지금 **세션당 대상 1개**다(`targets: Map<owner, …>`). 「(owner, 순번) 대상 k개」 로 넓히거나 「계좌 끄기 집계」 를 따로 만들어, k 개의 65 를 다 받거나 시한(`HUB_ALL_STOP_COLLECT_MS` 5초)이 지나면 `strategies.disabled { count: 합, viDisabled }` 1건을 낸다. `viDisabled` 는 11 을 보냈는지(또는 그 61 run:false 에코를 봤는지)다.
6. **k = 0 이고 VI 만 켜진 경우**에는 65 가 없다. 그 61 에코(run:false)를 완료 신호로 삼아 `strategies.disabled { count: 0, viDisabled: true }` 1건을 낸다. 「답 0 이면 지어내지 않는다(N-01)」 와 부딪치지 않게, 서버가 보낸 61 을 근거로 한다. 아니면 웹 백스톱(8초)에 맡기는 쪽을 택한다 — 플래너 결정.
**webapp:** 기존 전체 비활성화 카드의 `awaitingAck` · `ackBaseline` · 백스톱을 그대로 쓴다. 두 버튼은 서로 잠근다(하나가 in-flight 면 다른 버튼 disabled).

### Pattern 4: 84 서버 축 — hub 에서 바꿀 9곳
| # | 지점 | 지금 | 바꿀 것 |
|---|------|------|--------|
| 1 | `#userSettings` 선언(1050) | `Map<userId, msg>` | `Map<ownerKey, msg>` — 주석 「소유 키 단위(84 · Phase 32)」 |
| 2 | 머리 표(103-104) · 요청 줄(104) | 84 primary 전용 · 43 primary 만 | 84 = 소유 키 단위 · 43 = 세션마다 |
| 3 | `case MSG.UserSettingsResp`(2649-2656) | `#fromPrimary` 게이트 | 게이트 제거 — **76/78/77 갈래는 그대로**(Pitfall 11) |
| 4 | `#onUserSettings`(2850) | `set(userId, settings)` · 팬아웃 | `set(owner, {...settings, serverKey})` · 팬아웃도 `serverKey` 실은 사본 |
| 5 | `requestStrategySnapshot`(2042-2044) | `if (primary) #requestPrimarySnapshot` | 세션마다 43 |
| 6 | `#afterPrimaryChange`(1515) | 새 primary 로 43 | 84 때문에는 불필요(76/78/77 은 서버 푸시라 43 과 무관) — 지우거나 무해하게 남긴다. **테스트 `hub-multi-session.test.ts:657-676` 의 기대(`kb121.sentTypes` = `[GetUserSettingsReq]`)가 바뀐다** |
| 7 | `#clearPrimaryCaches`(3828) | `#userSettings.delete(userId)` | 이 줄을 지운다(키가 바뀌면 조용한 no-op 가 된다 — 의도해서 지운다) |
| 8 | `#clearCaches(owner)`(3747~) | 84 는 primary 일 때만 | 그 소유 키 84 를 **늘** 지운다(세션 교체 · 분리) — 브라우저 사본은 남는다(Pitfall 13) |
| 9 | `getUserSettings(userId)`(2245) | 사용자 1건 | `getUserSettings(userId, serverKey)` + `getUserSettingsAll(userId)`(replay · 결선 순) — fanout 42 되싣기(2120)와 replay(1884)가 쓴다 |

**fanout 42:**
```ts
// fanout.ts user.settings.set — serverKey 부재 = primary(구 탭 관용 · D-14a)
const target = msg.serverKey === undefined
  ? this.#sessions.primaryOf(userId)
  : this.#users.get(userId)?.sessions.get(msg.serverKey)?.session;
if (msg.serverKey !== undefined && target === undefined) {
  // 지정 서버 세션이 없다 — primary 로 떨어뜨리지 않는다(다른 서버 설정을 덮는다). 거부 프레임 · 소켓 유지.
  this.#send(conn, rejectFrame(USER_SETTINGS_SERVER_GONE_TEXT, "", "", msg.t)); return;
}
const session = this.#readySession(conn, userId, msg.t, target);
if (session === null) return;
const amount = msg.s.postBuyFloorAmount ?? this.#hub.getUserSettings(userId, session.serverKey)?.postBuyFloorAmount;
```
`USER_SETTINGS_SERVER_GONE_TEXT` 는 새 상수다. 이름과 문구는 플래너가 정한다 [ASSUMED].

### Pattern 5: 「세션 열린 서버 목록」 — 새 프레임 없이 `accounts[]` 에서
**권고:** `servers = unique(accounts.map(a => a.serverKey).filter(Boolean))` 를 그 순서대로 쓴다(primary 먼저 — §계약 정본). 세그먼트 점은 `userSettingsByServer.has(serverKey)` 다. 상태 프레임은 늘 통째로 교체되므로 닫힌 세션은 목록에서 자연히 빠진다. 근거:
- `state` 프레임에는 서버 목록 필드가 없다 [VERIFIED: relay.ts:971-983].
- 84 프레임의 `serverKey` 집합만 쓰면 84 를 아직 못 받은 서버가 목록에 아예 없다. 그러면 목업 ⑤ 의 「아직 못 받음」 상태가 나올 수 없다. 리듀서는 84 를 지우지 않으므로 닫힌 서버도 남는다.
- 대안인 `state.sessions[]` 추가는 소유 계좌가 0 인 세션(G-1 — 계좌가 전부 다른 서버로 지정됨)까지 목록에 넣을 수 있다. 하지만 그 서버의 84 는 어느 카드 시딩에도 쓰이지 않는다. 계약 · 테스트 비용만 더한다.
- 구 relay(서버키 없는 84) 관용: 키 `""` 로 저장된 84 는 **목록 첫 서버(= primary)** 것으로 본다. 구 relay 의 42 는 primary 로 가므로 일관된다. 그 밖의 서버는 「아직 못 받음」 으로 잠긴다 — fail-safe 다.

### Anti-Patterns to Avoid
- **계좌 끄기를 `lc.set` 스위치 off 로 구현하기** — 등록이 삭제된다(Pitfall 1).
- **`setAccountNo` 만으로 계좌 전환** — 저장값이 즉시 되돌린다(Pattern 1).
- **`#fromPrimary` 를 통째로 지우기** — 76/78/77 은 사용자 단위 1건이다. 다른 서버의 돌파 · 예약 창이 섞인다(Pitfall 11).
- **지정 서버가 없을 때 42 를 primary 로 떨어뜨리기** — 사용자가 KYOBO119 에 저장한다고 믿는 값이 KB120 을 덮는다.
- **ISIN 단위 조작을 계좌 무관하게 두기** — 다른 계좌의 숨은 카드를 펼치고 「추가했는데 안 보인다」 가 된다(Pitfall 6).
- **상단 줄에서 `data-slot="workbench-status-bar"` · `data-status` 를 없애기** — 다른 spec 5개의 준비 대기가 깨진다(Pitfall 4).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 65 다건 집계 | 웹에서 65 를 세는 카운터 | hub `beginAllStop` 집계기(29-54) 확장 | 꼬리표 FIFO · 대여 · 시한 · 분리 정리가 이미 있다 [VERIFIED: subscription-hub.ts 1294-1377] |
| 계좌 → 소유 세션 | 계좌번호로 서버키 추측 | `this.#sessions.forAccount(userId, accountNo)` | G-1 소유 뷰가 정본이다(29-35) |
| 서버키 → 세션 | 새 색인 | `#users.get(userId).sessions.get(serverKey)` | 맵 키가 이미 서버키다 [VERIFIED: fanout.ts:602-607] |
| 계좌 라벨 | 화면마다 문자열 조립 | `account-label.ts` 한 함수(D-12) | 같은 글자를 사용자가 대조한다(h76) |
| 계좌 저장 · 자동 선택 | 새 규칙 | `readTradingAccount` · `pillAccountOf` 를 키만 바꿔 재사용(주문 탭 · 설정 서버) | 「저장값이 나중 프레임에 도착」 규칙이 이미 들어 있다 |
| 켜진 전략 판정 | relay 에 새 정의 | webapp `isActiveStrategy` 를 shared 로 올려 relay 와 공유(권고) | 정의가 둘이면 「끈다고 했는데 남는다」 가 생긴다 |

**Key insight:** 이 phase 의 데이터는 전부 이미 와 있다. 새 판정을 만들기보다 기존 판정 함수(`forAccount` · `pillAccountOf` · `isActiveStrategy` · 집계기)를 계좌 · 서버 키로 **다시 부르는 것**이 맞다.

## Common Pitfalls

### Pitfall 1: D-09 「건별 lc.set 스위치 off」 는 끄기가 아니라 삭제다
**What goes wrong:** 계좌 끄기가 그 계좌의 상따 등록을 지운다. 「전체 비활성화」(등록 유지)와 뜻이 달라지고, 사용자가 다시 켤 설정이 사라진다.
**Why:** 서버는 매수 · 매도 · 취소 · 자동매도가 전부 꺼진 Set 을 `crud='D'` 로 정규화한다 [CITED: Gateway.cpp:3211-3219].
**How to avoid:** 키마다 14 `DisableStrategiesReq(key)` 를 보낸다(`DisableOne` — 등록 유지) [CITED: StrategyManager.cpp:400-440]. CONTEXT D-09 문구를 「건별 14(key)」 로 바로잡는다. 결정의 핵심(relay 가 계좌 → 건별로 푼다 · optional 인자)은 그대로다.
**Warning signs:** 계좌 끄기 뒤 64/60 에 `crud: "D"` 가 오고, 작업대 카드가 「등록 전」 으로 돌아간다.

### Pitfall 2: 구 relay 는 `accountNo` 를 strip 한다 → 계좌 끄기가 「전부 정지」 가 된다
**What goes wrong:** 새 webapp(Vercel 미리보기나, 순서를 어긴 push)이 구 relay 에 `{t:"strategies.disable", accountNo}` 를 보내면 zod 가 `accountNo` 를 버린다. `key` 부재 = 빈 키라 **모든 계좌의 상따 + VI** 가 꺼진다.
**Why:** 인바운드 스키마는 엄격 모드가 아니다 [VERIFIED: protocol.ts:420 주석 · 454-457].
**How to avoid (택1 — `checkpoint:decision`):**
- (a) **새 `t`**(예: `strategies.disable.account`)를 쓴다. 구 relay 에서는 판별자 불일치 → close(4400) → 재접속이다. 시끄럽지만 아무것도 끄지 않는다(fail-safe). webapp 소켓 훅의 in-flight 가로채기(`msg.t === "strategies.disable"` [CITED: use-relay-socket.ts:2144])도 새 `t` 를 포함하도록 넓힌다. D-09 「`strategies.disable` 에 선택 인자」 의 형식을 바꾸는 것이므로 사용자 확인이 필요하다.
- (b) D-09 그대로 둔다. 「이 계좌 끄기」 버튼은 relay 배포 뒤에만 노출되는 webapp 에 넣는다(웨이브 ② push 는 relay 뒤). 미리보기 URL 에서는 이 버튼을 누르지 않는다는 운영 규칙을 둔다. 사람의 실수를 막는 구조가 없다.
**Warning signs:** relay 로그에 빈 키 14 가 나가고 `strategies.disabled` count 가 계좌 전략 수보다 크다.

### Pitfall 3: 65 가 N 건 오면 웹의 「전부 정지」 에코 귀속이 첫 65 에서 끊긴다
**What goes wrong:** 소켓 훅은 `strategies.disable` 을 보내면 `killSwitchInFlight` 를 세우고, `strategies.disabled` 하나에 내린다 [CITED: use-relay-socket.ts:896 · 1130 · 2144-2160]. 계좌 끄기가 14 를 k 건 보내고 relay 가 65 를 k 건 그대로 팬아웃하면, 두 번째 키부터 60 에코가 `killSwitch` 원인 없이 도착한다. 카드는 그 에코를 「발주로 게이트 소진」 으로 읽는다(Pitfall 10 계열).
**How to avoid:** relay 가 k 개의 65 를 모아 `strategies.disabled` 1건으로 낸다(Pattern 3). 서버는 키별 60 에코를 65 앞에 보내므로, 마지막 65 뒤의 집계 1건이 오기 전에 모든 에코가 도착해 있다.
**Warning signs:** 단위 테스트에서 `framesOf("strategies.disabled")` 가 1 보다 크다.

### Pitfall 4: `workbench-status-bar` 슬롯 · `data-status` 는 다른 spec 의 준비 신호다
**What goes wrong:** 상단 줄을 새로 짜면서 루트 슬롯 이름이나 `data-status` 를 바꾸면 `a11y.spec.ts`(345 · 388 · 609 · 691 · 733 · 899) · `order-log.spec.ts`(100 · 568) · `unfilled-progress.spec.ts:79` · `stock-detail-tabs.spec.ts:354` · `trading-workbench.spec.ts:130` 의 「`data-status` = ready 대기」 가 전부 시간 초과로 깨진다 [VERIFIED: grep 결과 — e2e/specs/*.ts].
**How to avoid:** 새 한 줄 필의 루트에 `data-slot="workbench-status-bar" data-status={status}` 를 그대로 둔다. `workbench-dma`(`aria-live="polite"` — a11y 463)와 `workbench-quote` 도 둔다. 지울 단언은 `trading-workbench.spec.ts` 1730-1731(`stat-applied`) · 5080-5091(`workbench-window-badge`)과, 단위 `workbench-status-bar.test.tsx` 의 116(77 배지) · 92-106(반영 시각) · 153(다시 연결 버튼) · 187-232(tone → /me 로 이전)다.

### Pitfall 5: 프로그램 계좌 전환은 저장 계좌에 되돌려진다
Pattern 1 참조. 토스트 탭 · 사이드바 전략 클릭 · `?focus=` 마운트 소비 세 경로 모두 `pickAccount` 를 거친다. 계좌 전환은 사용자 기억(`writeTradingAccount`)을 바꾼다 — 이것이 의도된 동작인지 UI-SPEC 에 한 줄 적는다 [ASSUMED: 의도된 동작으로 봄].

### Pitfall 6: ISIN 단위 경로가 계좌를 모른다 → 숨은 카드를 펼친다
**What goes wrong:** `isinFocusCardOf` · `focusCard` · `ensureIsinCard`(= `addCard` · `pickHolding`) · `cardIsins`(StockAddBar · BreakoutStrip 「이미 카드 있음」) · `cardForAlert` ②③ 폴백이 **계좌와 무관하게** 같은 ISIN 카드를 고른다 [VERIFIED: trading-workbench.tsx:339-341 `isinFocusCardOf` 원문 `cards.find((c) => c.isin === isin && c.open) ?? cards.find((c) => c.isin === isin)`]. 그래서 종목을 추가하면 다른 계좌의 숨은 카드가 펼쳐지고, 화면에는 아무것도 안 생긴다.
**How to avoid:** 이 경로들은 `visibleCards`(현재 계좌)로 한정한다. 카드 키 충돌 규칙(같은 전략 키 카드 1장 · T-18-94)만 전수로 본다. `cardForAlert` 는 계좌가 있는 알림이면 ① 정확 일치가 이긴다. 돌파(계좌 없음)는 현재 계좌 카드를 먼저 고른다.
**Warning signs:** 「종목 추가 → 아무 일 없음」, 돌파 클릭 → 계좌 전환 없이 빈 화면.

### Pitfall 7: 폰 밴드 세그먼트 「아래 줄」 은 동작하지 않는 조작이다
**What goes wrong:** D-05 는 폰 밴드에서 세그먼트를 줄 아래로 내린다. 그런데 격자는 wb < 680 이면 저장된 단 수와 무관하게 1열이다 [VERIFIED: trading-workbench.tsx:216-222 · CITED: card-grid.tsx `COLS_CLASS` 의 `@min-[680px]/wb:` 리터럴]. 목업 폰 390(wb ≈ 374)의 「1단|2단|3단」 은 눌러도 아무것도 바뀌지 않는다. 지금 단위 테스트(179)와 a11y 계약은 「폰 밴드에서는 세그먼트가 DOM 에서 빠진다 — 접근성 트리 · 탭 체인에도 없다」 다.
**How to avoid:** UI-SPEC/플래너가 고른다 — (a) wb < 680 은 종전대로 DOM 에서 뺀다. 「아래 줄」 은 680 이상에서 내용이 넘쳐 flex-wrap 으로 내려가는 경우로 해석한다(권고). (b) 사용자에게 「폰에서 단 수 무의미」 를 확인한다. §2.2b 표는 바꾸지 않는다 — 680 은 「격자 열 수 경계」 문단의 값이다.

### Pitfall 8: `queuedWindowBadgeOf` 가 죽은 코드가 된다
`queuedWindowBadgeOf` 의 소비처는 상태줄 하나다(grep). 상태줄을 지우면 `lib/queued-window.ts:117` 함수와 `src/lib/__tests__/queued-window.test.ts` 의 배지 케이스가 남는다. 지우는 쪽을 권고한다 — `queuedWindow` 상태 · 77 수신 · 카드 예약 표시(`affordanceOf`)는 D-06 대로 둔다. 남겨 두면 다음 사람이 「정규」 배지를 되살릴 근거로 읽는다.

### Pitfall 9: 숨김 카드도 시세 구독 예산을 쓴다
D-01 대로 숨김 카드를 마운트해 두면 그 카드의 (ISIN, 거래소) 구독도 유지된다 — 지금과 같은 수다. 구독 한도(`sub.limit`)는 늘지도 줄지도 않는다. 다만 「다른 계좌로 바꾸면 구독이 줄 것」 이라는 기대를 UI-SPEC 에 적지 않는다.

### Pitfall 10: 주문 탭 필이 목록 밖 계좌 주문을 숨긴다
`groupJournalRowsByAccount` 는 「목록에 없는 계좌… 는 버리지 않고 뒤에 붙인다… 기록된 주문을 화면이 숨기지 않는다」 를 계약으로 갖는다 [CITED: webapp/src/lib/orders-api.ts:114-145 — bash]. 필 옵션이 `accounts[]` 뿐이면 그 행은 볼 길이 없다. 필 옵션을 `accounts[]` ∪ 「행에만 있는 계좌」(이름 `""`)로 만든다. 공용 필은 `accounts` 를 그대로 받으므로, 호출부가 합집합 목록을 넘긴다.

### Pitfall 11: `#fromPrimary` 는 84 갈래만 푼다
76/78(돌파 above 집합) · 77(예약 창)은 서버 푸시이고 사용자 단위 1건이다. 이 셋까지 풀면 KB · 교보 두 서버의 돌파 집합과 창 상태가 같은 키에서 덮어쓰기 경쟁을 한다. 테스트 `hub-multi-session.test.ts` 262-330 「primary 전용 — VI 61 · 72/73 · 84 · 76/78 · 77」 은 84 만 떼어 「서버별」 describe 로 옮기고, 나머지 단언은 유지한다.

### Pitfall 12: /me 저장 기계는 단일 84 를 전제한다
`useUserSettingsSave` 는 「비행 1건 · 행당 대기열 · 84 가 오면 새 캐시로 재조립 · 다른 탭 84 플래시」 를 **한 84 참조의 변화**로 판정한다 [CITED: limit-chaser-defaults.tsx 327-503 — bash]. 비행 중에 서버를 바꾸면 성공 판정이 엉뚱한 서버의 84 를 보거나, 대기열이 다른 서버 값으로 재조립된다.
**How to avoid:** (a) 비행 · 대기가 있으면 세그먼트를 잠근다(권고 — 3초 상한이 이미 있다). 또는 (b) 섹션 본문을 `key={serverKey}` 로 다시 마운트하고 비행을 버린다. 54 거부는 서버키를 싣지 않는다. 그래도 「비행 1건」 규칙이 있어 귀속은 유지된다.

### Pitfall 13: 세션이 닫혀도 브라우저 84 사본은 남는다
hub 는 세션 분리 때 그 소유키 84 를 지우지만 브라우저에 「지움」 프레임을 보내지 않는다(77/84 규율 — 모르면 안 보낸다). 그래서 서버 목록은 84 Map 의 키가 아니라 `accounts[]` 에서 만든다(Pattern 5). Map 에 남은 닫힌 서버 값은 쓰이지 않는다.

### Pitfall 14: 시딩 — 서버키를 모르면 84 를 쓰지 않는다
D-14b: 카드 계좌의 `serverKey` 가 없거나 그 서버 84 가 아직 없으면 `seedFromUserSettings(undefined)` = `{}` 다(빈 패치 — 종전 「84 미수신」 과 같다). primary 84 로 대신 채우지 않는다 — 교보 계좌 카드가 KB 설정으로 시딩된다. `preBuyWatchFixedOf` · 「줄매수도 같이 켜기」(1281)도 같은 서버 84 를 본다.

### Pitfall 15: 배포 · push 경계
- 웨이브 ① 은 webapp 만 바뀌므로 push(= 프로덕션)로 끝난다.
- 웨이브 ② 의 relay 부분(계좌 끄기)은 20:00 KST 뒤에 배포한다 → 그 뒤에 push 한다. 계좌 끄기 버튼이 relay 보다 먼저 나가면 Pitfall 2 가 생긴다.
- 웨이브 ③ 도 relay 를 먼저 배포한다. 구 webapp 은 `serverKey` 를 보내지 않으므로 primary 로 간다 — 종전 동작이고 호환된다. 구 webapp 리듀서는 84 프레임의 여분 필드 `serverKey` 를 무시하고 `userSettings` 를 마지막 프레임으로 덮는다. **relay 가 서버마다 84 를 내기 시작하면 구 webapp /me 는 「마지막에 온 서버」 값을 보인다.** 그 상태에서 저장하면 primary 로 간다 — 보이는 값과 저장 대상이 다를 수 있다. 구 webapp 이 살아 있는 시간을 최소화한다: relay 배포 직후 바로 push 한다(20:00 뒤 같은 세션). 또는 relay 가 구 탭 관용으로 primary 84 를 **마지막에** 다시 보내게 한다(replay 순서 = primary 마지막) [ASSUMED: 관용책 — 플래너 판단].
- 메모리: executor 는 커밋까지만 한다. relay · Vercel 배포는 메인 세션이 한다. 배포 직전 `git status -sb` 로 다른 세션의 커밋을 확인한다.

### Pitfall 16: 동시 세션 테스트 · 메모리
메모리 「Mac 멈춤 = 동시 세션 테스트 메모리 고갈」: vitest 는 `--maxWorkers=2`, playwright 는 `--workers=1` 로 돌린다. 전체 회귀는 한 세션만 돌린다.

## Code Examples

### relay — 84 소유키 캐시 · 팬아웃
```ts
// subscription-hub.ts (권고 모양)
readonly #userSettings = new Map<string, RelayUserSettingsMsg>(); // key = ownerKey(userId, serverKey)

case MSG.UserSettingsResp: {
  // Phase 32 — 84 는 서버(소유 키) 단위다. 76/78/77 은 여전히 #fromPrimary.
  const settings = parseUserSettings(e.env);
  if (settings !== null) this.#onUserSettings(userId, owner, session, settings);
  return;
}

#onUserSettings(userId: string, owner: string, session: HubSession, settings: RelayUserSettingsMsg): void {
  const msg = { ...settings, serverKey: serverKeyOf(session) };
  this.#userSettings.set(owner, msg);
  if (!session.isReady) return;
  this.#fanout(userId, msg);
}

getUserSettings(userId: string, serverKey: string): RelayUserSettingsMsg | undefined {
  return this.#userSettings.get(ownerKey(userId, serverKey));
}
getUserSettingsAll(userId: string): RelayUserSettingsMsg[] {
  const out: RelayUserSettingsMsg[] = [];
  for (const owner of this.#sessions.keys()) {           // 결선 순
    if (!owner.startsWith(userPrefix(userId))) continue;
    const s = this.#userSettings.get(owner);
    if (s !== undefined) out.push(s);
  }
  return out;
}
```

### webapp — 리듀서 · 서버 목록
```ts
// use-relay-socket.ts
case "user.settings": {
  const next = new Map(state.userSettingsByServer);
  next.set(frame.serverKey ?? "", frame);   // "" = 구 relay(서버키 없음) → primary 로 해석
  return { ...state, userSettingsByServer: next };
}

// limit-chaser-defaults.tsx
const servers = useMemo(() => {
  const seen: string[] = [];
  for (const a of accounts) if (a.serverKey && !seen.includes(a.serverKey)) seen.push(a.serverKey);
  return seen;                                // primary 먼저(relay 병합 순)
}, [accounts]);
const settingsOf = (sk: string) =>
  userSettingsByServer.get(sk) ?? (sk === servers[0] ? userSettingsByServer.get("") : undefined);
```

## 웨이브 ④ — VI 계좌별 (gh-trade Phase 33 뒤 · 계획만 세우고 집행은 막아 둔다)

### 입력(gh-trade 33-RESEARCH · 33-CONTEXT 에서 확정 중)
- `SetVITrigger` 말미에 `unregistered: bool`(**vtable 16**) append. S→C 전용이고 기본 false = 등록됨이라 구 서버와 호환된다 [CITED: gh-trade/.planning/phases/33-vi-per-account/33-RESEARCH.md:154 · 164-170].
- 21(거래소 키)의 응답은 **선언 계좌마다 61 1프레임**이다. 등록된 계좌는 설정을, 미등록 계좌는 `account_no` · `exchange` 만 채운 `unregistered=true` 프레임을 받는다. 빈 Envelope 는 선언 계좌가 0 일 때만 온다 [CITED: 33-CONTEXT D-06 · D-07]. Set/정리 에코는 바뀐 슬롯만 1프레임씩 온다(D-08). 56/72/73/33 은 무변경이다(D-09).
- 열린 질문: 선언 밖 등록 슬롯도 덧붙일지(33-RESEARCH:642 권고 「덧붙인다(초집합)」) — relay 는 소유 뷰 밖 계좌 프레임을 버리면 된다.
- 인계는 gh-trade 가 `sync-relay-schema.sh`(별도 gh-radar 커밋 — `relay/src/generated/`) + `radar-handoff.sh vi-per-account` 인박스 노트 + SendMessage 로 한다. 현재 relay 마커는 `server-repo-commit: 8d56ea53` 이다 [VERIFIED: relay/src/generated/StockDMA.fbs:1-7 — bash 로 읽음].

### relay 변경 지점(현행 코드 지도)
| 지점 | 현행 [VERIFIED: subscription-hub.ts] | 웨이브 ④ |
|------|------|------|
| `#viTriggers` 키 | `viTriggerKey(owner, exchange)` = `` `${owner}|${exchange}` `` (776-778) | `` `${owner}|${accountNo}|${exchange}` `` — `ownerPrefix` 정리(`#clearViOwner` 3447)는 그대로 동작 |
| `#onViTrigger`(3314-3363) | 빈 61 → FIFO 머리 거래소 · 소유 뷰 밖 계좌 → 그 칸 null | `unregistered` → (계좌, 거래소) null · 소유 뷰 밖 → **버림**(칸 오염 없음) · 빈 Envelope → FIFO 를 소비하되 캐시하지 않는다(구 서버: 그 세션 소유 계좌 전부 그 거래소 null — 아래 호환) |
| `#mergeVi`(3376-3407) · `#emitVi` · `#viEmitted` | 사용자 · 거래소 병합(켜짐 우선 · 마지막 에코 · 3상태) | 새 슬롯 프레임은 병합하지 않는다. **구 `vi` 프레임은 호환 창 동안 같은 병합 규칙을 슬롯 위에서 계산해 계속 낸다** |
| `viRunningElsewhere`(2197-2210) · fanout `#stopViElsewhere`(2449-2471) | 서버 간 거래소당 1건 가드 | 제거(D-17) |
| `#viSourceOwners`(1468-1477) · `PRIMARY_BROKER = "KB"`(673) · `#fromViSource` | KB 세션만 원천 | 모든 결선 세션 |
| fanout `VI_BROKER`(307) · `#viSessionFor`(2438) | 소유 세션이 KB 일 때만 | 소유 세션 그대로(증권사 무관) |
| `parseViTrigger`(envelope.ts:2776) | 빈 61 → `cfg: null` | `unregistered()` → `{ cfg: null, slot: { accountNo, exchange } }` |
| replay(fanout 1864-1867) | 거래소 2프레임 | 슬롯 전량 + (호환 창) 구 거래소 2프레임 |

### 호환 창 — 권고: 새 프레임 `t`
**문제:** 구 webapp 리듀서는 `case "vi"` 에서 `frame.x` 로만 칸을 고른다 [CITED: use-relay-socket.ts:1068-1081 — `return { ...state, viTriggers: { ...state.viTriggers, [frame.x]: frame.cfg } };`]. 기존 `vi` 프레임에 `accountNo` 를 싣고 계좌마다 1건씩 보내면, 구 webapp 의 거래소 칸이 **마지막에 온 계좌 값**으로 덮인다. 가동 중인 VI 가 「중지」 로 보일 수 있다.
**권고:** 슬롯 프레임은 새 `t`(예: `{ t: "vi.slot", a: accountNo, x, cfg }`)로 낸다. 구 리듀서는 모르는 `t` 를 무시한다(「알 수 없는 `t` 는 무시한다 … T-15-41」 — 1132 default). 기존 `vi`(거래소 병합값)는 구 webapp 이 사라질 때까지 함께 낸다. 새 webapp 은 `vi.slot` 만 읽는다. 구 `vi` 송출을 언제 걷을지는 후속 quick 으로 남긴다. 이것이 D-17 의 `checkpoint:decision`(one-way) 내용이다.
**구 gh-trade 서버 창**(relay 배포 → 서버 배포 사이): 21 에 한 프레임만 온다(등록 계좌 하나 또는 빈 Envelope). 이 기간에는 구 webapp 이 운영 중이므로 구 `vi` 병합 프레임만 정확하면 된다. 슬롯 캐시 공백(다른 계좌 = 모름)은 새 webapp push 전에 메워진다(서버 배포 뒤 21 재조회 = 재접속 Ready).
**webapp:** `RelayViTriggers` → `ReadonlyMap<`${accountNo}|${exchange}`, RelayViTrigger | null>`(키 부재 = 모름) · `viAnyRunning` · `viSummaryText` · 사이드바 VI 줄 · /me VI 행 · `ViSettingsRows`(고른 계좌 KRX · NXT 2행) · `viMoveTargetOf`/옮기기 흐름과 그 테스트를 제거한다.
**플랜 형태:** 웨이브 ④ 플랜 머리에 `checkpoint:human-verify`(gh-trade 인박스 노트 도착 · `--check` 차이에 `unregistered` · 생성물 커밋 확인)를 두고, 다음에 `checkpoint:decision`(호환 프레임 모양)을 둔다. relay 배포(20:00 뒤) → gh-trade 에 알림 → gh-trade 서버 배포 확인 → webapp push 순서는 메인 세션이 맡는다. 교보119 VI 실증 UAT 를 포함한다(D-18).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 상단 줄 계좌 = 「신규 카드의 기본 계좌」 | 상단 줄 계좌 = 작업대 **스코프** | Phase 32 | `ACCOUNT_PILL_TITLE` 문구(「새로 추가하는 카드의 기본 계좌예요 · 이미 있는 카드는 자기 계좌를 유지해요」 [VERIFIED: workbench-status-bar.tsx:92-93])가 거짓이 된다 → 문구를 바꾼다(D-13 `title?`) · 단위 310-327 갱신 |
| /me 주문 = 계좌별 섹션 세로 반복(16 D-21) | 계좌 필 + 평탄 목록 | Phase 32 D-10 | 잔고 탭은 D-21 유지 |
| 84 = primary 원천 1건 | 84 = 서버별 | Phase 32 D-14a | 구 탭 42(서버키 없음) = primary 관용 |
| VI = 세션 · 거래소 1슬롯, KB 원천 | (계좌, 거래소) 슬롯, 모든 세션 | gh-trade 33 + 웨이브 ④ | 옮기기 흐름 제거 |

**Deprecated/outdated:** `queuedWindowBadgeOf`(소비처 0 — Pitfall 8) · `useAppliedAt` · `ToneToggle` 의 작업대 자리 · `viMoveTargetOf`(④).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 계좌 전환(토스트 · 사이드바)은 작업대 기억 계좌(`writeTradingAccount`)도 바꾸는 것이 의도된 동작이다 | Pitfall 5 | 사용자가 「잠깐 본 계좌」 가 기억으로 남는 것을 원치 않으면 저장 없는 전환 규칙(세션 우선값)을 따로 만들어야 한다 |
| A2 | 42 지정 서버 세션이 없을 때의 새 거부 문구 · 상수 이름 | Pattern 4 | 문구만 바뀐다 |
| A3 | 구 webapp 관용으로 relay replay 에서 primary 84 를 마지막에 보내는 순서 트릭 | Pitfall 15 | 안 하면 relay → push 사이 수 분 동안 구 /me 가 다른 서버 값을 보일 수 있다(저장은 primary) |
| A4 | VI-only 계좌 끄기 완료를 61 에코로 판정해 집계 1건을 낸다 | Pattern 3 | 택하지 않으면 웹 백스톱(8초) 「반영을 확인하지 못했어요」 가 뜬다 |
| A5 | 서버 목록은 `accounts[]` 서버키 집합으로 충분하다(소유 계좌 0 세션 제외) | Pattern 5 | 소유 계좌 0 서버의 설정을 웹에서 편집해야 하면 `state.sessions[]` 를 추가해야 한다 |
| A6 | 웹 E2E 하네스는 단일 게이트웨이 · 단일 세션이다. 다중 서버는 relay `fanout-multi-session.test.ts` 와 라이브 UAT 로 증명한다 | Validation | 웹에서 2서버 세그먼트를 E2E 로 보려면 픽스처에 `DMA_KYOBO_HOST/PORT` 두 번째 스텁을 붙이는 Wave 0 작업이 필요하다 |

## Open Questions

1. **D-09 형식 보정(Pitfall 1 · 2 · 3) — 사용자 확인 필요**
   - What we know: lc.set 전부 OFF = 삭제다. 14(key) 가 등록 유지 끄기다. 구 relay 는 `accountNo` 를 strip 해 전부 정지로 바꾼다.
   - What's unclear: 새 `t` 로 갈지(fail-safe), `strategies.disable{accountNo}` 를 유지하고 배포 규율로 막을지.
   - Recommendation: 「14(key) 건별 + 11 run:false + 집계 1건」 은 확정으로 보고, 와이어 형식만 `checkpoint:decision` 으로 묻는다. 권고는 새 `t` 다.
   - **RESOLVED (2026-10-13 · plan-phase · 사용자 결정): 새 메시지 타입**(예 `strategies.disable.account` · `{accountNo}`) 채택. CONTEXT D-09 「보정」 항에 기록 — 플래너는 `checkpoint:decision` 없이 그대로 계획한다.
2. **폰 밴드 세그먼트(Pitfall 7)**
   - Recommendation: wb < 680 은 DOM 에서 빼는 종전 규칙을 유지한다. 목업의 「아래 줄」 은 680 이상에서 넘칠 때 줄바꿈하는 것으로 해석한다. UI-SPEC 에서 사용자 확인 한 줄.
3. **웨이브 ① 의 /me VI 행 위치(미등록 · 두 거래소가 다른 계좌)**
   - What we know: ④ 전 VI 는 거래소별 1건이고 `cfg.accountNo` 가 있다.
   - Recommendation: 등록된(켜짐/꺼짐) 거래소는 그 `cfg.accountNo` 묶음에 둔다. 미등록 거래소는 어느 묶음에도 행을 만들지 않는다. 다만 목업은 모든 묶음에 「VI 자동매수 중지」 행을 보인다 — UI-SPEC 에서 확정한다.
4. **서버키 zod 상한** — 서버키 형식 정본(레지스트리 · admin 스키마)을 찾아 같은 상수를 쓴다. 지금 이 세션에서는 확인하지 않았다.
5. **gh-trade 33 선언 밖 등록 슬롯 덧붙임 여부**(33-RESEARCH:642) — relay 는 소유 뷰 밖 프레임을 버리므로 어느 쪽이든 안전하다. 인계 노트를 받을 때 확인한다.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | 전 워크스페이스 | ✓ | v24.21.0 | — |
| pnpm | 빌드 · 테스트 | ✓ | 11.15.1 | — |
| Playwright | webapp E2E | ✓ | 1.59.1 | — |
| flatc | 웨이브 ④ 생성물(gh-trade 가 돌린다) | ✓ | 25.12.19 | — |
| gcloud | relay 배포(메인 세션) | ✓ | SDK 558.0.0 | — |
| vercel CLI | 미리보기 · 수동 배포(메인 세션) | ✓ | 59.11.7 | — |
| gh-trade Phase 33 완료 | 웨이브 ④ | ✗(진행 중 — 33-RESEARCH · VALIDATION 커밋까지) | — | 웨이브 ④ 는 blocked 로 계획한다 |

**Missing dependencies with no fallback:** gh-trade Phase 33 fbs 확정 + 인박스 노트 → 웨이브 ④ 만 막힌다.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.x(relay · shared) · vitest 2.1.9(webapp) · Playwright 1.59.1(webapp E2E — 진짜 relay + 스텁 게이트웨이 · 단일 세션) |
| Config file | `relay/vitest.config.ts` · `packages/shared/vitest.config.ts` · `webapp/vitest.config.ts` · `webapp/playwright.config.ts` |
| Quick run command | relay: `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay exec vitest run tests/hub-multi-session.test.ts tests/fanout-multi-session.test.ts tests/protocol.test.ts tests/ws-autosell.test.ts --maxWorkers=2` · webapp: `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/workbench-status-bar.test.tsx src/components/trading/__tests__/strategy-status-card.test.tsx src/components/trading/__tests__/today-orders-card.test.tsx src/components/trading/__tests__/card-grid.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx src/components/trading/__tests__/alert-toasts.test.tsx src/components/layout/__tests__/app-sidebar.test.tsx src/components/me/__tests__/limit-chaser-defaults.test.tsx src/lib/__tests__/relay-socket.test.ts --maxWorkers=2` |
| Full suite command | config `build_command`(`pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck`) → `pnpm --filter @gh-radar/shared exec vitest run && pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test` |
| E2E | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/me.spec.ts e2e/specs/a11y.spec.ts e2e/specs/sidebar-tree.spec.ts -g "P32" --workers=1`(새 케이스는 `P32-` 접두로 묶는다) |

기준선 실측(이번 세션): relay `hub-multi-session` + `fanout-multi-session` + `protocol` + `ws-autosell` **163 passed** · webapp `workbench-status-bar` + `limit-chaser-defaults` + `relay-socket` **226 passed**.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AXIS-01 | 계좌 전환 → 보이는 카드 = 그 계좌 · 숨김 카드 마운트 유지(더티 · 결과 모름 잠금 보존) · 빈 상태 = 보이는 0 · 호스트 정리 = 전수 | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/card-grid.test.tsx --maxWorkers=2` | ✅ 파일 · ❌ 케이스 |
| AXIS-01 | ISIN 단위 경로 4곳 스코프 · `cardForAlert` 계좌 우선 · `pickAccount` 경유 전환(저장값 되돌림 없음) · VI 스트립 계좌 필터 | unit/component | `… vitest run src/components/trading/__tests__/trading-workbench.test.tsx src/lib/__tests__/trading-layout.test.ts --maxWorkers=2` | ✅ · ❌ 케이스 |
| AXIS-01 | 토스트 계좌 줄(번호 · 이름 · 서버키) · 돌파 = 줄 없음 · 탭 → 계좌 전환 + 카드 | component + e2e | `… vitest run src/components/trading/__tests__/alert-toasts.test.tsx` · `playwright … -g "P32-toast" --workers=1` | ✅ · ❌ |
| AXIS-01 | 사이드바 계좌 묶음(켜진 것만 · 소제목 이름 · 서버키 · VI 줄 그 계좌 묶음) · 클릭 → 계좌 전환 | component + e2e | `… vitest run src/components/layout/__tests__/app-sidebar.test.tsx` · `playwright e2e/specs/sidebar-tree.spec.ts --workers=1` | ✅ · ❌ |
| AXIS-02 | 상단 줄 A — 배지 · tone · 반영 시각 · 다시 연결 버튼 없음 · 끊김일 때 주문 알약 안 「다시 연결」 링크 · `workbench-status-bar[data-status]` 유지 · `workbench-dma` aria-live | component + e2e | `… vitest run src/components/trading/__tests__/workbench-status-bar.test.tsx` · `playwright e2e/specs/a11y.spec.ts e2e/specs/trading-workbench.spec.ts -g "P32-top\|aria-live" --workers=1` | ✅ · ❌(갱신) |
| AXIS-02 | 알림음 /me 설정 「이 기기」 카드 — 기본 꺼짐 · 켜기 저장 `gh-radar:breakout-tone` · 클릭 안 `resumeToneContext` · 차단 시 「클릭해 활성화」 | component | `… vitest run src/components/me/__tests__/…`(tone describe 이전) | ❌ Wave 0(이전) |
| AXIS-03 | /me 현황 계좌 묶음 `accounts[]` 순 · 빈 계좌 「등록된 전략 없음」 · 소제목 라벨 · 2줄째 계좌번호 없음 · VI 행 위치 | component + e2e | `… vitest run src/components/trading/__tests__/strategy-status-card.test.tsx` · `playwright e2e/specs/me.spec.ts -g "P32-status" --workers=1` | ✅ · ❌ |
| AXIS-03 | 계좌 끄기 relay — 소유 세션으로 14(key) k건 · 켜진 VI 11 run:false · 다른 계좌 키 0 · 계좌 대조(남의 계좌 거부) · 65 k건 → `strategies.disabled` 1건 · (선택) VI-only 61 완료 | unit + integration | `pnpm --filter @gh-radar/relay exec vitest run tests/hub-multi-session.test.ts tests/fanout-multi-session.test.ts tests/protocol.test.ts --maxWorkers=2` | ✅ · ❌ |
| AXIS-03 | 계좌 끄기 E2E — 확인 → 게이트웨이 14(key) · 60 에코 → 그 계좌 묶음에서 빠짐 · 다른 계좌 유지 | e2e | `playwright e2e/specs/me.spec.ts -g "P32-disable" --workers=1` | ✅ · ❌ |
| AXIS-04 | 주문 탭 필 — 기본 = 작업대 계좌 · 별도 키 저장 · 평탄 목록 · 「주문 N」 = 고른 계좌 건수 · 목록 밖 계좌 옵션 | component + e2e | `… vitest run src/components/trading/__tests__/today-orders-card.test.tsx src/components/trading/__tests__/me-client.test.tsx` · `playwright e2e/specs/me.spec.ts -g "P32-orders\|PEY-2" --workers=1` | ✅ · ❌(me 9 · 10 · PEY-2 갱신) |
| AXIS-04 | D-21 뒤집음 기록 — CONTEXT/PROJECT 결정 로그 | doc check | `grep -n "D-21" .planning/phases/32-account-axis/32-CONTEXT.md` | ✅ |
| AXIS-05 | hub — 84 를 어느 세션이 보내든 그 소유키 캐시 · 프레임에 serverKey · 43 세션마다 · 세션 분리 = 그 서버 84 만 폐기 · primary 변경이 84 를 지우지 않음 · 76/78/77 은 primary 전용 유지 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/hub-multi-session.test.ts tests/hub.test.ts --maxWorkers=2` | ✅ · ❌(262-390 · 600-676 · 818-830 · 997-1010 갱신) |
| AXIS-05 | fanout — 42 serverKey → 그 세션 · 부재 → primary · 서버 없음/미준비 → 거부 프레임 · 소켓 유지 · 되싣기 = 그 서버 84 · replay 서버별 n프레임 | integration | `… vitest run tests/fanout-multi-session.test.ts tests/ws-autosell.test.ts --maxWorkers=2` | ✅ · ❌ |
| AXIS-05 | zod — `serverKey` 선택 · 형식 위반 거부 · 부재 통과 | unit | `… vitest run tests/protocol.test.ts` | ✅ · ❌ |
| AXIS-05 | webapp — 리듀서 Map(키 `""` 관용) · 세그먼트(accounts 서버 순 · 점 = 84 수신) · 기억 · 닫힌 서버 → 첫 서버 · 미수신 잠금 · 42 `serverKey` · 비행 중 세그먼트 잠금 · 시딩 = 카드 계좌 소유 서버 84 · 모르면 빈 패치 | unit + component | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/relay-socket.test.ts src/components/me/__tests__/limit-chaser-defaults.test.tsx src/components/trading/__tests__/limit-chaser-form.test.tsx src/lib/__tests__/limit-chaser.test.ts --maxWorkers=2` | ✅ · ❌ |
| AXIS-05 | E2E(단일 세션) — /me 설정 세그먼트 1개 · 저장 → 게이트웨이 42 · 84 → 플래시(P27-M1 · P31-5 회귀) | e2e | `playwright e2e/specs/me.spec.ts -g "P27-M1\|P31-5\|P32-settings" --workers=1` | ✅ · ❌ |
| AXIS-05 | 라이브 — relay 배포 뒤 KB120 · KYOBO119 에서 서로 다른 값이 보인다 · 각 서버 저장이 그 서버에만 반영된다 | manual | 배포 뒤 사람 확인(Cloud Logging `relay_docker` 42 송신 서버키 · 화면) | — |
| AXIS-01(④) | relay 슬롯 캐시 · unregistered · 소유 뷰 밖 버림 · KB 한정 해제 · 가드 제거 · 구 `vi` 병합 + 새 `vi.slot` 동시 송출 · replay | unit + integration | `… vitest run tests/hub-multi-session.test.ts tests/fanout-multi-session.test.ts src/dma/__tests__/envelope.test.ts --maxWorkers=2` | ✅ · ❌(④ — blocked) |
| AXIS-01(④) | 작업대 VI 행 = 고른 계좌 · 옮기기 없음 · /me · 사이드바 계좌별 VI | component + e2e | `… vitest run src/components/trading/__tests__/vi-settings-rows.test.tsx` · `playwright … -g "P32-vi" --workers=1` | ✅ · ❌(④) |
| AXIS-01(④) | 교보119 VI 실증 | manual UAT | gh-trade 서버 배포 뒤 | — |

### Sampling Rate
- **Per task commit:** 그 워크스페이스의 quick 명령(위 표의 파일 단위 · `--maxWorkers=2`)
- **Per wave merge:** Full suite command(+ `build_command` 타입체크 — `userSettings` → Map 승격, `RelayViTriggers` 교체는 컴파일 오류가 1차 안전망이다)
- **Phase gate:** Full suite green + E2E P32 · 회귀(`trading-workbench` · `me` · `a11y` · `sidebar-tree` · `order-log` · `unfilled-progress` · `stock-detail-tabs` — `workbench-status-bar[data-status]` 대기 사용 spec) green 뒤 `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `webapp/src/components/me/__tests__/` — tone 테스트를 옮길 파일(`workbench-status-bar.test.tsx` 187-232 이전)
- [ ] `relay/tests/helpers/frames.ts` — `buildUserSettingsFrame` 그대로 쓴다(서버는 세션이 정한다). 계좌 끄기용 64 픽스처는 두 계좌 · 두 서버 소유 조합으로 만든다
- [ ] (선택) `webapp/e2e/fixtures/relay.ts` 다중 서버 옵션 — 두 번째 스텁 게이트웨이 + `DMA_KYOBO_HOST/PORT` + 접근 맵 KYOBO 행. 없으면 다중 서버는 relay 통합 테스트와 라이브 UAT 로 증명한다(A6)
- [ ] (④) `relay/tests/helpers/frames.ts` · `fake-gateway.ts` — 61 `unregistered` 빌드 · 21 응답 n 프레임 · 생성물 동기화 뒤

## Security Domain

`security_enforcement: false`(config · 메모리 「보안검사 안 함」) — ASVS 섹션은 생략한다. 단 구조적 방어 두 개는 기능 요구로 남긴다.
- 계좌 끄기의 `accountNo` 는 `#accountAllowed`(`session.allowedAccounts`)로 대조한다. IDOR 방어다 — 지금 `strategies.disable` 은 계좌 대조를 건너뛴다(계좌 필드가 없어서).
- 42 지정 `serverKey` 는 **그 사용자 entry 의 세션 맵**에서만 찾는다(`#users.get(userId)`). 남의 세션에 닿을 경로가 없다.

## Sources

### Primary (HIGH confidence — 이번 세션 Read/실행)
- `relay/src/hub/subscription-hub.ts` 80-219 · 935-1069 · 1100-1189 · 1430-1529 · 1985-2079 · 2140-2259 · 2590-2749 · 2835-2874 · 2940-2996 · 3280-3464 · 3700-3860
- `relay/src/ws/fanout.ts` 1830-1908 · 1940-2229 · 2360-2509 · 3040-3119 (+ 295-360 · 590-680 bash)
- `relay/src/ws/protocol.ts` 300-479 · 540-694
- `packages/shared/src/relay.ts` 575-604 · 706-995 · 1288-1309 · 1495-1514 · 1556-1575 · 1790-1825
- `webapp/src/components/trading/workbench/workbench-status-bar.tsx` 전체 · `trading-workbench.tsx` 215-224 · 400-429 · 600-694 · 700-774 · 1100-1519
- `webapp/src/lib/trading-layout.ts` 30-37 · 120-179 · `breakout-list.ts` 28-39 · `use-relay-socket.ts` 170-175 · 322-333
- 실행: relay 4파일 163 passed · webapp 3파일 226 passed · `flatc --version` · `npx playwright --version` · `gsd-tools init.phase-op 32`

### Secondary (MEDIUM — bash 로 읽은 원본 · 인용)
- webapp `card-grid.tsx` · `alert-toasts.tsx` · `lib/trading-alerts.ts` · `strategy-status-card.tsx` · `today-orders-card.tsx` · `lib/orders-api.ts:114-145` · `account-panel.tsx` 660-720 · `app-sidebar.tsx` 330-560 · `limit-chaser-defaults.tsx` 1-60 · 260-420 · `limit-chaser-form.tsx` 810-1000 · `lib/limit-chaser.ts` 165-173 · 455-490 · `lib/use-relay-socket.ts` 505-530 · 885-900 · 1060-1135 · 1145-1185 · 2140-2160 · `globals.css` §2.2b 288-404 · e2e 슬롯 grep
- gh-trade `server/src/net/Gateway.cpp`(ProcessDisableStrategies · 3200-3225) · `server/src/trade/strategy/StrategyManager.cpp:400-440` · `server/docs/protocol.md:33 · 76`
- gh-trade `.planning/phases/33-vi-per-account/33-CONTEXT.md` · `33-RESEARCH.md`(relay 인계 · vtable 16 · n 프레임)

### Tertiary (LOW)
- 없음

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 신규 패키지 0, 버전은 실행으로 확인했다
- Architecture: HIGH — 바꿀 지점을 줄 번호로 직접 읽었다. 서버 목록 원천(Pattern 5)은 추론이지만 계약 근거가 있다
- Pitfalls: HIGH — 1 · 2 · 3 · 4 · 6 · 7 은 원본 코드와 gh-trade C++ 로 확인했다. 15(구 webapp 창)는 코드 근거 + 운영 추정
- 웨이브 ④: MEDIUM — gh-trade 33 이 아직 플랜 단계다(vtable 16 · n 프레임은 리서치 권고값)

**Research date:** 2026-10-13
**Valid until:** 웨이브 ①~③ 은 2026-11-12(30일) · 웨이브 ④ 는 gh-trade 인박스 노트를 받는 즉시 재확인
