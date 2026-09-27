# Phase 24: gh-trade 상따 매수주문 3종 분리(선매수·추가매수·후매수) relay·webapp 반영 - Context

**Gathered:** 2026-09-27
**Status:** Ready for planning

<domain>
## Phase Boundary

gh-trade Phase 24(브랜치 `worktree-phase-24-limitchaser-buy3`, 아직 master 미병합)가 확정한 **와이어·검증·에코 규약을 gh-radar 가 그대로 받는다**. 이 phase 는 서버 로직·와이어를 정하지 않는다 — gh-trade 24-CONTEXT D-01~D-32 와 `limit-chaser.md` §9-2 ①~⑧ 이 정본이고, 여기서는 **웹이 그 규약 위에서 어떻게 보이고 움직이는가**만 정한다.

- **relay:** `sync-relay-schema.sh` 재생성(`buy3_schema` + append 17필드, vtable 98~130) → `buildSetLimitChaserReq` 가 `buy3_schema=1` 고정 + C→S 13필드 싣기 · `buy_watch_side` 미전송 · S→C 4필드 미전송 · MsgType 38 전송 경로 제거 → 에코(60)·열거(64) 파싱에 신필드 추가, `buyWatchSide` 에코 부재 → `"0"`.
- **webapp:** 상따 설정 매수 탭 = 스케치 009 **D**(「매수주문」 카드[주문가격·비교가격·마스터 스위치] + 선매수·추가매수·후매수 카드 3장, 제목줄 접기, 접힘 요약 전량 표시, 기본 전부 접힘). 한방체결 카드는 선매수 안 「☐한방 N건 @가격」 행으로 흡수. 감시대상 토글 제거. 매수 LED 3단계 → 마스터 2단계(+보유중). 서버 거부 문구·발주 사유 줄 표시. 꺼진 행 흐림.
- **바꾸지 않는 것:** 리스트 행 문법·시트/인라인 편집·즉시 반영·44px 행·2열 밴드(Phase 20 D-01~D-24), 매도·취소 카드 구조(D-19/D-21/D-22), 래치 LED 매도·취소(Phase 17 D-19~D-22), 전략 키·삭제 규약(매수·매도·취소 게이트 전부 OFF = 삭제).
- **배포 순서(고정):** gh-trade 서버(24-11) → WinForms 클라 발행 → **그 뒤** gh-radar relay → webapp push. 시각은 gh-trade 세션이 SendMessage 로 알린다. 완료 후 gh-trade 에 `buy3_schema=1` 배포 완료 회신.

</domain>

<decisions>
## Implementation Decisions

### 이미 정해진 것(gh-trade·스케치 009 에서 확정 — 다시 묻지 않는다)
- 와이어 필드·검증·에코: gh-trade 24-CONTEXT **D-01~D-32**, `limit-chaser.md` §9-2 ①~⑧. 특히 D-03(선·추가매수 1회 발주 후 체크 자동 해제, 에코 = enabled ∧ armed) · D-06(선매수 ON 시 6개 자동 체크) · D-10(추가매수 최대≠0 ∧ 최소>최대 거부) · D-13(후매수 발동 시 매도·취소 override 에코) · D-27(후매수 ON 시 매도비율 0 거부) · D-30/31(「최대」 = 최초 포함 총 횟수, 제출값 = 칸 값) · D-32(마스터 OFF 면 세 그룹 에코 OFF).
- 카드 구조 = 스케치 009 **D**(2026-09-27 사용자 확정): 카드 3장 · 제목줄 클릭 = 접기(스위치는 그대로 동작) · 접힌 카드는 요약 줄에 값 전량(줄바꿈 허용) · **기본 전부 접힘**.
- 후매수 상태 칩(제목줄) 「감시 중 / 보유중 / 소진」, 읽기 전용 「발동잔량」 행(없으면 —, 있으면 빨강), 소진이면 체크 OFF + 안내 한 줄. 추가매수 포기 → 체크 OFF + 칩 「포기」(재제출 전까지). 사전 검증 안내는 행 아래 빨간 한 줄(모달 아님).

### ① 마스터·그룹 스위치 연동
- **D-01:** 마스터(`buyEnabled`) OFF 인 상태에서 그룹 스위치(`preBuyEnabled`·`extraBuyEnabled`·`postBuyEnabled`)를 켜면 **같은 `lc.set` 에 `buyEnabled=true` 도 싣는다**(WinForms 24-06 동형) + 전략 로그 「{선매수|추가매수|후매수} 체크 — 매수주문도 켬」. 끄는 쪽은 D-02 외에는 마스터를 건드리지 않는다. 매수 무장이므로 「감시 중 — 바로 반영」 안내 규약(Phase 20 D-05) 그대로, 추가 확인창 없음.
- **D-02:** **사람이 마지막 켜진 그룹을 끄면 같은 제출에 마스터도 끈다**(세 그룹 OFF ∧ 마스터 ON 을 사람 손으로는 만들지 않는다). 단, **에코 경로는 어떤 제출도 만들지 않는다** — 서버가 발주·포기로 그룹을 자동 해제해 「세 그룹 OFF · 마스터 ON」이 에코되면 그대로 그리고 자동 제출하지 않는다(gh-trade D-11/D-13 정적 게이트 규율). 이 상태의 매수주문 카드 상태 문구는 플래너 재량(「감시 중」과 구분되는 중립 문구 권장).
- **D-03:** 새 그룹(추가매수·후매수)의 주문금액 에코가 0 이면 **그 그룹 스위치만 막고**(사유 「주문금액을 먼저 입력해 주세요」) 최소·최대·반등 등 다른 행은 자유롭게 확정할 수 있다. Phase 20 **D-04a(「—」 + 다른 필드 확정 막음)는 선매수(`buyOrderAmount`)에만** 그대로 적용한다. 금액 0 표시는 「—」 로 통일.
- **D-04:** 새 전략 폼 기본값은 **WinForms 그대로 — 후속분 ② 기본값 표(gh-trade D-33, `limit-chaser.md` §10 표, 2026-09-27 사용자 결정 「표 전부 적용」)**. 고정값: 선매수·추가매수·후매수 주문금액 각 4,000만원 · 후매수 반등 30% · 후매수 최소(하한잔량) 100,000주 · 후매수 최대 3회 · 매도 매수잔량 10주 · 매도 잔량추적 55% · 취소 매수잔량 10주 · 매수/매도 비교가격·주문가격 = 상한가(기존 `seedFromUpperLimit`). 상장주식수 5칸(선매수 매도잔량·체결량 = ×0.3%, 추가매수 최소 = ×0.3% · 최대 = ×3%, 매도 체결 = ×0.3%, 정수 내림)은 D-17 시딩 규칙을 따른다. 시딩 전·모를 때 폴백 = 옛 상수 10,000 / 30,000 / 0 / 0 / 30,000. (옛 D-04 값 10만원 · 10% · 0 은 폐기.)
- **D-05:** 새 전략에서 마스터를 처음 켤 때 **세 그룹은 전부 OFF** — 살 갈래는 사람이 고른다(선매수 기본 ON 아님). 따라서 마스터 ON 만으로는 D-06 자동 체크가 나가지 않는다. 실무 동선은 D-01 로 그룹을 켜는 것이 곧 마스터 켜기다.

### ② 선매수 자동 체크(gh-trade D-06) 알림·빈 값
- **D-06:** 선매수 ON 으로 6개(매도주문·매도>잔량추적·매도>체결·취소·취소>체결·취소>잔량추적)가 함께 켜질 때 **전략 로그 한 줄만** 남긴다 — 토스트 없음, 매도 탭 자동 이동·링크 없음. 로그에는 생략된 체크(취소잔량 0·매도 체결수량 0·매도 매수잔량 0)까지 적는다.
- **D-07:** 빈 값 규칙은 gh-trade D-06 그대로(매도가·비교가 0 → 상한가, 취소잔량 0 → 취소 체크 생략+로그, 매도 체결수량 0 → 체결 체크 생략+로그)에 **하나 더**: **매도 매수잔량(구 호가잔량)이 0 이면 매도주문·잔량추적·체결 세 체크를 생략 + 로그**(서버가 매도를 켜지 않으므로 조용한 실패를 미리 피함). 선매수 자체는 켜진다. 선매수를 다시 꺼도 자동 체크된 것은 유지(D-06 gh-trade).
- **D-08:** 자동 체크 트리거는 **사람이 선매수 스위치를 켜는 순간**(D-01 로 마스터가 같이 켜지는 경우 포함)뿐이다. 에코·재접속·다른 단말 변경으로는 나가지 않는다.

### ③ 라벨·표기
- **D-09:** 라벨을 **WinForms Phase 24 대로 개명**한다 — 매수 「주문가격 · 비교가격」(공통 카드), 매도 「주문가격 · 비교가격 · 매수잔량」(구 매도가격·호가잔량), 취소 「매수잔량」(구 취소잔량). 매도·취소 카드가 둘 다 「매수잔량」을 가지므로 시트 설명문(`desc`)과 접근성 이름으로 구분한다. — **Reversibility:** costly — `lc-fields.ts` 라벨·시트 제목·e2e 셀렉터·테스트 문구·전략 로그 문구가 함께 바뀐다.
- **D-10:** 0 은 **의미어로** 표기 — 추가매수 최대 0 「무제한」 · 최소 0 「1주」 · 후매수 하한 0 「없음」. 접힘 요약 줄도 같은 말. 시트/인라인을 열면 숫자 0 으로 편집한다.
- **D-11:** 후매수 「최대」 행 값 = **「{설정}회 · 남은 {잔여}회」**(`postBuyPhase === 0` 이면 「{설정}회」만). 접힘 요약도 같은 문구. 시트는 최대(설정값)만 편집하고 제출값 = 칸 값(D-30·31 gh-trade). 소진(단계 3)은 「남은 0회」 + 체크 OFF + 안내 한 줄.

### ④ 상태 표시·로그·이행
- **D-12:** 매수 LED = **마스터 2단계 + 보유중** — `!buyEnabled` 회색 「OFF」 / `buyEnabled ∧ postBuyPhase !== 2` 초록 「감시」 / `buyEnabled ∧ postBuyPhase === 2` **주황 「보유중」**(기존 `--led-latent` 토큰 재사용, 새 토큰 없음). **클릭 불가**(`lc.arm` buy 경로·MsgType 38 제거). 매도·취소 LED 는 Phase 17 D-19~D-21 그대로. `buyWatchSide`·`buyEntryLatched` 의존 제거.
- **D-13:** 전략 로그는 **서버 사유 줄 우선**(`source="LimitChaser"` 원문 그대로, 배지 `[상따]`; `source="SetLimitChaser"` 거부 문구 원문 그대로, §9-2 ②~⑤ 문구를 다듬지 않는다). 클라 합성 전이는 **그룹 스위치 ON/OFF 전이만**(선·추가·후매수 각각, 기존 매수 무장 전이와 같은 결) + D-01/D-02 마스터 동반 전이. 발동·포기·소진·재진입 사유는 서버 줄을 믿고 중복 합성하지 않는다. `postBuyPhase`·`postBuyTriggerQty`·`postBuyReentryLeft`·`extraBuyAbandoned` 변화는 **런타임 에코**로 분류(`RUNTIME_ONLY_SKIP`·`VALUE_COMPARE_SKIP` 확장, 로그 안 남김). 매수 래치 전이 4종(`buyLatched/buyUnlatched`)은 삭제.
- **D-14:** 기존 운영 전략 중 「감시대상 = 매수잔량」 선택분은 **gh-trade 24-12 서버 재기동 전에**(리서치 F-2 정정 — 신 서버는 에코·열거에 `buy_watch_side` 를 싣지 않으므로 「relay 배포 직전」은 불가능) 현 서버의 열거(64)로 `buyWatchSide === "1"` 목록을 추출해 사용자에게 보고만 한다. gh-trade-38 확인(2026-09-27): 지금 가동본은 옛 서버라 아무 때나 추출 가능, 24-11/24-12 예고 때 「추출 끝났는지」를 확인 항목으로 넣는다 → 플랜에서는 **첫 웨이브의 독립 태스크**로 둔다. 웹 안내 배너·일회성 이행 UI 없음 — 배포 뒤 웹은 서버 에코만 그린다(서버가 선매수로 읽는 것은 gh-trade D-24 로 사용자 수용).
- **D-15:** 후매수 발동(`postBuyPhase === 2`) 중에는 **매도주문·매수취소 카드 상태 문구에 「· 후매수 발동」을 덧붙인다**. 행 값은 에코 그대로(발동잔량으로 덮인 값), 편집도 그대로 허용(재제출이 cfg 를 바꾸는 서버 규약대로). 잔량 행에 별도 「발동」 표시는 하지 않는다.

### ⑤ 후속분 ② 반영(gh-trade 팁 `b46e1e5f`, 2026-09-27 — 와이어 무변경, `.fbs` 주석 3줄만)
- **D-16:** **☐추가매수 상한가 차단(WinForms §3-1 동형, 사용자 결정 「적용」).** 사람이 추가매수 스위치를 켜는 순간 호가 프레임의 매수1호가(`RelayQuote.bp[0]`)와 폼 비교가격 칸(제출될 `buyWatchPrice`, 에코가 있으면 에코값)이 **둘 다 > 0 이고 같으면** 제출 없이 스위치를 되돌리고 전략 로그 한 줄 `추가매수는 상한가 도달 전에만 켤 수 있습니다 — 매수1호가 == 비교가격`(원문 그대로)만 남긴다. 다이얼로그·토스트 없음. 둘 중 하나라도 0(호가 미수신·비교가 미입력)이면 허용(상한가로 치환하지 않음, 서버 「모름」 단계가 백스톱). D-10·D-27 과 같은 사전 검증 결(행 아래 빨간 한 줄 대신 로그 — WinForms 와 같게 로그만).
- **D-17:** **상장주식수 기반 기본값 시딩 규칙(WinForms `SeedListSharesDefaults` 동형).** 원천은 실시간 호가 프레임 `RelayQuote.ls`(서버 `QuoteState.list_shares`, `quote-grid-10.tsx` 가 이미 시총·1% 표시에 사용) 하나. ① 서버에 그 키의 전략이 있으면(에코 적용됨) 시딩하지 않는다 — 에코 값이 이긴다. ② `ls === 0`(미수신·KB/교보 경로)이면 시딩하지 않고 가드를 남겨 뒤에 오는 프레임이 채운다(폴백 상수 유지). ③ `ls > 0` 이면 **종목(폼)당 1회** 5칸을 정수 내림으로 채우되 사용자가 이 폼에서 손댄 칸은 덮지 않는다. 시딩은 제출을 만들지 않는다(값만 바뀜, 첫 등록 cfg 에 실린다). 추가매수 최소·최대 칸 상한은 uint32 최대.
- **D-18:** 추가매수 포기 사유 줄은 **2종 모두 서버 원문 그대로**(D-13 규율): `추가매수 포기 — 매수1잔량 N > 최대 M`(최대 초과) · `추가매수 포기 — 상한가 이탈(매수1잔량 N < 최소 M)`(D-33 이탈). 에코는 둘 다 `extraBuyEnabled=false ∧ extraBuyAbandoned=true` 한 모양이라 웹 칩 「포기」는 사유를 구분하지 않는다. 클라 합성 문구 없음.
- **D-19:** **두 클라 다름 기록(결정 아님).** WinForms(`b066e135`)는 서버 접힘으로 세 그룹이 모두 꺼진 에코를 받으면 한 박자 뒤 마스터 OFF 를 자동 재제출한다(매도·취소까지 전부 OFF 면 삭제가 되므로 미전송). 웹은 D-02 후반대로 **자동 제출하지 않는다** — 사용자가 discuss 에서 그 선택지를 거절했고 gh-trade-38 도 「서버 규약과 무관」으로 동의(2026-09-27). 사람이 마지막 그룹을 끌 때 마스터도 끄는 것(D-02 전반)은 두 클라 같다.
- **D-20:** **0 은 위임이 아니라 거부다.** 서버에 「가격 0 → 상한가」 규약은 없다(gh-trade-38 확인) — `buy_enabled ∧ (buy_order_price==0 ∨ buy_watch_price==0)` 이면 §9-2 ③ ERROR 로 마스터가 눕고 매도도 같다. 「0 → 상한가」 채움은 (a) 선매수 ON 시 매도가·매도 비교가를 **클라가** 채우는 D-06/D-07 과 (b) 서버 후매수 발동 override(D-13) 두 곳뿐. 따라서 웹은 매수·매도를 켜는 제출에 **명시 상한가 값**을 싣는다(기존 `seedFromUpperLimit` 유지, D-07 의 「0 → 상한가」는 클라 채움으로 읽는다). 후매수 범위 검증(반등 1~100 · 매도비율)은 **후매수 ON 일 때만** — 레거시 전략 에코 `postBuyReboundPct=0` 은 OFF 재제출에서 서버가 통과시킨다(리서치 F-4 와 일치).
- **D-21:** 후매수 체크 에코 = `cfg ∧ 마스터 무장 ∧ 단계 ≠ 소진`(gh-trade D-32) — relay `readLimitChaser` 해석에 이 한 항만 반영. ROADMAP 「열린 것」 첫 항은 닫힘.

### Claude's Discretion
- 접힘/펼침 상태의 보관 위치·수명(컴포넌트 state 로 충분, 에코 재렌더에 접힘이 풀리지 않을 것), 펼친 뒤 다시 접는 동선.
- 그룹 카드 제목줄의 상태 칩 문구 세부(「감시 중」「꺼짐」「포기」「보유중」「소진」)와 D-02 「마스터 ON · 그룹 없음」 중립 문구.
- 데스크톱 인라인 편집 Tab 순서(Phase 20 D-14 「같은 그룹 다음 항목」을 카드 3장에 어떻게 적용할지).
- 새 shared 타입 필드 이름(camelCase 변환은 기존 규약), 브라우저 프레임 키, 테스트 픽스처.
- `lc-fields.ts` 의 그룹 정의 확장 방식(선매수 안 「☐한방 N건 @가격」 = checkValue 행, 기존 sweep 필드 5개 중 `sweepMinTickCount`·`sweepWatchPrice` 만 노출 유지 여부는 현행 그대로).
- 접힘 요약 줄의 항목 순서·구분자(스케치 009 D 참고: 금액 · 매도잔량 · 체결량 · 한방 / 금액 · 최소 · 최대 / 금액 · 최대 · 최소 · 반등 · 발동잔량).
- relay 테스트 픽스처(`frames.ts`·`fake-gateway`)의 신필드 빌더 형태.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### gh-trade 정본(서버·와이어·규약 — 이 phase 는 여기서 정한 것을 받기만 한다)
- `/Users/alex/repos/gh-trade/.claude/worktrees/phase-24-limitchaser-buy3/.planning/phases/24-limitchaser-buy3/24-CONTEXT.md` — D-01~D-33(세 매수의 의미·검증·에코·화면 규약; **D-33** = 추가매수 아래 틱 선행·상한가 이탈 포기·기본값 표). gh-trade 팁 `b46e1e5f`(2026-09-27, `9fb07d86` 에서 전진 — `59bf77aa` D-32 · `b066e135` 마스터 자동 끔 · `3860388f`/`1d95f64f` D-33). **위 D-xx 는 이 문서의 D-xx 와 번호가 다르다** — 본 CONTEXT 의 D-xx 는 웹 결정, gh-trade 의 D-xx 는 서버 결정.
- `/Users/alex/repos/gh-trade/.claude/worktrees/phase-24-limitchaser-buy3/docs/strategy/limit-chaser.md` §5(매수 조건 5-1~5-3; **§5-2 추가매수 단계 기계·포기 2종 사유 줄 원문**) · **§9-2(매수 3종 검증·에코 ①~⑧ — 거부 문구 원문·에코 접힘 규칙)** · §10(클라 폼 규약, 24-06 마스터 동반 켬, **D-33 기본값 표**).
- `/Users/alex/repos/gh-trade/.claude/worktrees/phase-24-limitchaser-buy3/server/src/protocol/StockDMA.fbs` `table SetLimitChaser` 말미 — `buy3_schema`(98) ~ `post_buy_phase`(130) 17필드의 의미·방향(C→S / S→C 전용)·이름(`extra_buy_*`).
- `/Users/alex/repos/gh-trade/.claude/worktrees/phase-24-limitchaser-buy3/server/scripts/sync-relay-schema.sh` — relay 생성물 재생성 스크립트(`RELAY=/Users/alex/repos/gh-radar/relay`, flatc 25.12.19 고정). Phase 17 D-01 규약(손편집 금지, `--check` 차이 0).
- `/Users/alex/repos/gh-trade/.claude/worktrees/phase-24-limitchaser-buy3/server/docs/cloud-uat.md` ⑥ · `server/scripts/uat/e2e_limitchaser_buy3.sh` · `inject_b6.py` · `inject_m4.py` — 서버측 UAT 주입 도구(웹 실기 검증 시 재사용).

### 이 phase 의 화면 정본
- `.planning/sketches/009-limitchaser-buy3-card/README.md` + `index.html` — 채택안 **D**(카드 3장 + 접기 + 요약 전량), 서버 에코 시뮬(후매수 단계·포기·매도비율 0). ⚠ findings 스킬로 포장되지 않았다(`/gsd-sketch --wrap-up` 미실행) — README 를 직접 읽는다.
- `.planning/phases/24-limitchaser-buy3/reference/winforms-limitchaser-options-2026-09-27.png` — WinForms 상따 창(라벨 개명 근거: 매도 「주문가격·비교가격·매수잔량」, 취소 「매수잔량」; 흐림 규약).
- `.planning/ROADMAP.md` Phase 24 항목 — relay ①~④ · webapp ⑤~⑩ · 테스트 · 배포 순서 · 열린 것.

### 이어받는 웹 규약(바꾸지 않는다)
- `.planning/phases/20-toss-order-ticket/20-CONTEXT.md` — D-01(리스트 행·카드·스위치) · D-04(즉시 반영) · D-04a(주문금액 0) · D-05~D-07(반영 중·실패·에코 충돌) · D-12~D-14c(시트/인라인) · D-19~D-24(그룹 구성·44px·체크 행·시트 버튼 문구). 매수 탭의 D-19 가격 섹션·D-02/D-02a 감시대상 토글은 이 phase 로 **대체**된다.
- `.planning/phases/17-gh-trade-led/17-CONTEXT.md` — D-01(스키마 동기화 스크립트) · D-04(`lc.arm`) · D-05(`readLimitChaser` S→C 필드 규율) · D-19~D-23(래치 LED 규칙·칩 표기·배치·로그 전이). 매수 LED 규칙과 `lc.arm` buy 경로는 이 phase 로 **대체**된다.
- `webapp/src/styles/globals.css` 상단 주석 §2.2b — 4밴드 컨테이너 쿼리 경계(본문 700·830·992). 뷰포트 분기 신설 금지.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `relay/src/dma/envelope.ts` `buildSetLimitChaserReq`(1173~) · `readLimitChaser`(1995~) — 신필드 추가 지점. `toWireWatchSide`/`fromWireWatchSide` 는 에코 부재 → `"0"` 만 남긴다. `relay/src/dma/msg-type.ts` `ArmBuyLatchReq: 38` · `relay/src/ws/fanout.ts` `lc.arm` 래치→msg_type 표(170) · `relay/src/ws/protocol.ts` `lc.arm` zod(247) — buy 갈래 제거.
- `packages/shared/src/relay.ts` `RelayLimitChaser`(~39필드) — 신필드 13+4 추가, `buyWatchSide`·`buyEntryLatched` 봉인 주석.
- `webapp/src/components/trading/lc/lc-fields.ts` — 그룹·행 정의 한 곳(D-19 Phase 20). 행 종류 `value`·`checkValue`·`check`·`watch`·`derived` — `watch` 삭제, 선매수/추가매수/후매수 그룹 추가, 읽기 전용 행(발동잔량) 은 `derived` 결.
- `webapp/src/components/trading/lc/setting-group.tsx` `SettingGroup`·`GroupSwitch` — 제목줄 접기·요약 줄은 여기 확장.
- `webapp/src/components/trading/limit-chaser-form.tsx` — `GATE_KEYS`·`GATE_LABEL`·사유 패널(`canArm*`)·`commitToggle` — 그룹 스위치 3개 + D-01/D-02 마스터 동반 규칙 + D-07 자동 체크 조립 지점. `webapp/src/components/trading/lc/use-lc-field-commit.ts` — 즉시 반영 훅.
- `webapp/src/lib/limit-chaser.ts` — `defaultLimitChaserForm`(D-04 기본값) · `formFromServer` · `DIRTY_COMPARED_FIELDS` · `crudOf`/`isDeleteIntent`(삭제 규약 불변) · `isLimitChaserServerMessage`/`isLimitChaserSetRejection`(거부 표시 경로, 문구 원문) · `isLimitChaserArmRejection`(buy 갈래 제거).
- `webapp/src/components/trading/latch-led.tsx` — 매수 갈래(`buyWatchSide`·`buyEntryLatched`) → D-12 2단계+보유중. `__tests__/latch-led.test.tsx` 규칙 표 갱신.
- `webapp/src/components/trading/strategy-log.tsx` — `VALUE_COMPARE_SKIP`·`RUNTIME_ONLY_SKIP`·전이 집합(`buyLatched` 4종 삭제, 그룹 전이 추가) · 서버 메시지 배지(`[상따]`).
- `webapp/src/components/trading/card/strategy-card.tsx` — `lc.arm` in-flight 창(buy 제거), 카드 헤더 dot LED.

### Established Patterns
- 에코의 `*Enabled` 는 설정값이 아니라 **무장 상태**(cfg ∧ armed) — 신 그룹도 같다(`preBuyEnabled` 접힘, `extraBuyEnabled` 접힘 ∧ !포기, `postBuyEnabled` 마스터·소진 접힘). 「에코가 이긴다」(Phase 18 D-27) 는 목록 표시에 적용, 시트 입력값은 유지(Phase 20 D-07).
- S→C 전용 필드는 요청에 싣지 않는다(Phase 17 D-05 규율) — `extraBuyAbandoned`·`postBuyTriggerQty`·`postBuyReentryLeft`·`postBuyPhase`.
- 한 필드 확정 = 전략 전체 1회 전송(Phase 20 D-04). 전체 재전송이라 S→C 값을 되보내지 않는 것이 ON→ON 무접촉의 전제(ROADMAP ④).
- 에코 경로는 제출을 만들지 않는다(정적 게이트) — D-02 후반.
- 서버 거부·사유는 원문 표시, 문구 파싱 금지(Phase 17 D-08/D-09, `strategy-log` D-36).
- 생성물(`relay/src/generated/**`)은 스크립트로만, 같은 커밋(Phase 17 D-01).

### Integration Points
- gh-trade 트리에서 `RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh` → `relay/src/generated/stock-dma/set-limit-chaser.ts` + `.fbs` 사본(--check 실측 2026-09-27: 변경 1개).
- relay `envelope.test.ts` MSG↔생성 enum 대조·`codec.test.ts` 왕복 — 신 클라 바이트에 `buy3_schema=1` · 신필드 · `buy_watch_side` 부재 단언.
- webapp 상따 화면(`/trading/limit-chaser/[key]`, 작업대 카드 본문 `card-body.tsx`) 매수 탭 · 상태줄 LED · 전략 로그 · My page 전략 현황(배지 무변경).
- 배포: `scripts/deploy-relay.sh`(DMA_HOST 무주입 보존) → `smoke-relay.sh` → webapp push. 20:00 KST 이후, 사용자 확인 후(Phase 17 D-26 · 메모리 「relay 먼저·push 나중」).

</code_context>

<specifics>
## Specific Ideas

- 접힌 카드 요약 줄이 「한눈에 값 확인」의 전부다 — 폰 390 에서 매수 탭이 한 화면에 들어와야 한다(스케치 009 채택 이유).
- 두 클라(WinForms·웹)가 같은 손동작에 같은 결과를 내야 한다 — 마스터 동반 켬(D-01)·라벨 개명(D-09)·기본값(D-04)은 전부 그 원칙에서 나왔다.
- 「매수잔량 기준」 전략 이행은 사람이 다시 설정하면 끝난다 — 웹은 이행 로직을 갖지 않는다(D-14).
- 서버가 이미 말하는 것을 클라가 다시 말하지 않는다 — 발동·포기·소진 사유 줄은 원문 하나(D-13).

</specifics>

<deferred>
## Deferred Ideas

- 마스터 OFF 시 `post_buy_enabled` 에코 규약 — gh-trade **D-32 로 닫힘**(마스터 OFF 면 OFF). ROADMAP 「열린 것」 첫 항은 해소.
- 소진 푸시(300ms) 전 옛 ON 재제출 창이 웹에서 실제 생기는지 — 실기 검증 항목(리서치/UAT), 결정 아님.
- 후매수 매수잔량에서 내 미체결을 뺀 판정 · 그룹별 비교가격 분리 · 당일 누적 체결량 — gh-trade 24-CONTEXT deferred 그대로(서버 몫).
- 접힘 요약 줄의 항목을 사용자가 고르는 것 — 이번엔 전량 표시 고정.

None else — discussion stayed within phase scope.

</deferred>

---

*Phase: 24-limitchaser-buy3*
*Context gathered: 2026-09-27*
