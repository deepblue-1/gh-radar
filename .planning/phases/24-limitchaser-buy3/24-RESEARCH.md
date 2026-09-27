# Phase 24: gh-trade 상따 매수주문 3종 분리(선매수·추가매수·후매수) relay·webapp 반영 - Research

**Researched:** 2026-09-27
**Domain:** FlatBuffers 와이어 재동기화(relay) · 상따 설정 폼 상태 기계(webapp React 19 / Next 15) · 서버 에코 규약 수용
**Confidence:** HIGH (정본 전부를 이번 세션에 직접 읽음 · `--check` 실측 · 기준 테스트 실행) — 단, 아래 「새로 드러난 사실」 4건은 플래너/사용자 확인 필요

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 이미 정해진 것(gh-trade·스케치 009 에서 확정 — 다시 묻지 않는다)
- 와이어 필드·검증·에코: gh-trade 24-CONTEXT **D-01~D-32**, `limit-chaser.md` §9-2 ①~⑧. 특히 D-03(선·추가매수 1회 발주 후 체크 자동 해제, 에코 = enabled ∧ armed) · D-06(선매수 ON 시 6개 자동 체크) · D-10(추가매수 최대≠0 ∧ 최소>최대 거부) · D-13(후매수 발동 시 매도·취소 override 에코) · D-27(후매수 ON 시 매도비율 0 거부) · D-30/31(「최대」 = 최초 포함 총 횟수, 제출값 = 칸 값) · D-32(마스터 OFF 면 세 그룹 에코 OFF).
- 카드 구조 = 스케치 009 **D**(2026-09-27 사용자 확정): 카드 3장 · 제목줄 클릭 = 접기(스위치는 그대로 동작) · 접힌 카드는 요약 줄에 값 전량(줄바꿈 허용) · **기본 전부 접힘**.
- 후매수 상태 칩(제목줄) 「감시 중 / 보유중 / 소진」, 읽기 전용 「발동잔량」 행(없으면 —, 있으면 빨강), 소진이면 체크 OFF + 안내 한 줄. 추가매수 포기 → 체크 OFF + 칩 「포기」(재제출 전까지). 사전 검증 안내는 행 아래 빨간 한 줄(모달 아님).

#### ① 마스터·그룹 스위치 연동
- **D-01:** 마스터(`buyEnabled`) OFF 인 상태에서 그룹 스위치(`preBuyEnabled`·`extraBuyEnabled`·`postBuyEnabled`)를 켜면 **같은 `lc.set` 에 `buyEnabled=true` 도 싣는다**(WinForms 24-06 동형) + 전략 로그 「{선매수|추가매수|후매수} 체크 — 매수주문도 켬」. 끄는 쪽은 D-02 외에는 마스터를 건드리지 않는다. 매수 무장이므로 「감시 중 — 바로 반영」 안내 규약(Phase 20 D-05) 그대로, 추가 확인창 없음.
- **D-02:** **사람이 마지막 켜진 그룹을 끄면 같은 제출에 마스터도 끈다**(세 그룹 OFF ∧ 마스터 ON 을 사람 손으로는 만들지 않는다). 단, **에코 경로는 어떤 제출도 만들지 않는다** — 서버가 발주·포기로 그룹을 자동 해제해 「세 그룹 OFF · 마스터 ON」이 에코되면 그대로 그리고 자동 제출하지 않는다(gh-trade D-11/D-13 정적 게이트 규율). 이 상태의 매수주문 카드 상태 문구는 플래너 재량(「감시 중」과 구분되는 중립 문구 권장).
- **D-03:** 새 그룹(추가매수·후매수)의 주문금액 에코가 0 이면 **그 그룹 스위치만 막고**(사유 「주문금액을 먼저 입력해 주세요」) 최소·최대·반등 등 다른 행은 자유롭게 확정할 수 있다. Phase 20 **D-04a(「—」 + 다른 필드 확정 막음)는 선매수(`buyOrderAmount`)에만** 그대로 적용한다. 금액 0 표시는 「—」 로 통일.
- **D-04:** 새 전략 폼 기본값은 **WinForms 그대로** — 후매수 반등 10% · 최대 3회 · 추가매수 최소/최대 0 · 후매수 하한 0 · 그룹 주문금액은 선매수와 같은 10만원.
- **D-05:** 새 전략에서 마스터를 처음 켤 때 **세 그룹은 전부 OFF** — 살 갈래는 사람이 고른다(선매수 기본 ON 아님). 따라서 마스터 ON 만으로는 D-06 자동 체크가 나가지 않는다. 실무 동선은 D-01 로 그룹을 켜는 것이 곧 마스터 켜기다.

#### ② 선매수 자동 체크(gh-trade D-06) 알림·빈 값
- **D-06:** 선매수 ON 으로 6개(매도주문·매도>잔량추적·매도>체결·취소·취소>체결·취소>잔량추적)가 함께 켜질 때 **전략 로그 한 줄만** 남긴다 — 토스트 없음, 매도 탭 자동 이동·링크 없음. 로그에는 생략된 체크(취소잔량 0·매도 체결수량 0·매도 매수잔량 0)까지 적는다.
- **D-07:** 빈 값 규칙은 gh-trade D-06 그대로(매도가·비교가 0 → 상한가, 취소잔량 0 → 취소 체크 생략+로그, 매도 체결수량 0 → 체결 체크 생략+로그)에 **하나 더**: **매도 매수잔량(구 호가잔량)이 0 이면 매도주문·잔량추적·체결 세 체크를 생략 + 로그**(서버가 매도를 켜지 않으므로 조용한 실패를 미리 피함). 선매수 자체는 켜진다. 선매수를 다시 꺼도 자동 체크된 것은 유지(D-06 gh-trade).
- **D-08:** 자동 체크 트리거는 **사람이 선매수 스위치를 켜는 순간**(D-01 로 마스터가 같이 켜지는 경우 포함)뿐이다. 에코·재접속·다른 단말 변경으로는 나가지 않는다.

#### ③ 라벨·표기
- **D-09:** 라벨을 **WinForms Phase 24 대로 개명**한다 — 매수 「주문가격 · 비교가격」(공통 카드), 매도 「주문가격 · 비교가격 · 매수잔량」(구 매도가격·호가잔량), 취소 「매수잔량」(구 취소잔량). 매도·취소 카드가 둘 다 「매수잔량」을 가지므로 시트 설명문(`desc`)과 접근성 이름으로 구분한다. — **Reversibility:** costly — `lc-fields.ts` 라벨·시트 제목·e2e 셀렉터·테스트 문구·전략 로그 문구가 함께 바뀐다.
- **D-10:** 0 은 **의미어로** 표기 — 추가매수 최대 0 「무제한」 · 최소 0 「1주」 · 후매수 하한 0 「없음」. 접힘 요약 줄도 같은 말. 시트/인라인을 열면 숫자 0 으로 편집한다.
- **D-11:** 후매수 「최대」 행 값 = **「{설정}회 · 남은 {잔여}회」**(`postBuyPhase === 0` 이면 「{설정}회」만). 접힘 요약도 같은 문구. 시트는 최대(설정값)만 편집하고 제출값 = 칸 값(D-30·31 gh-trade). 소진(단계 3)은 「남은 0회」 + 체크 OFF + 안내 한 줄.

#### ④ 상태 표시·로그·이행
- **D-12:** 매수 LED = **마스터 2단계 + 보유중** — `!buyEnabled` 회색 「OFF」 / `buyEnabled ∧ postBuyPhase !== 2` 초록 「감시」 / `buyEnabled ∧ postBuyPhase === 2` **주황 「보유중」**(기존 `--led-latent` 토큰 재사용, 새 토큰 없음). **클릭 불가**(`lc.arm` buy 경로·MsgType 38 제거). 매도·취소 LED 는 Phase 17 D-19~D-21 그대로. `buyWatchSide`·`buyEntryLatched` 의존 제거.
- **D-13:** 전략 로그는 **서버 사유 줄 우선**(`source="LimitChaser"` 원문 그대로, 배지 `[상따]`; `source="SetLimitChaser"` 거부 문구 원문 그대로, §9-2 ②~⑤ 문구를 다듬지 않는다). 클라 합성 전이는 **그룹 스위치 ON/OFF 전이만**(선·추가·후매수 각각, 기존 매수 무장 전이와 같은 결) + D-01/D-02 마스터 동반 전이. 발동·포기·소진·재진입 사유는 서버 줄을 믿고 중복 합성하지 않는다. `postBuyPhase`·`postBuyTriggerQty`·`postBuyReentryLeft`·`extraBuyAbandoned` 변화는 **런타임 에코**로 분류(`RUNTIME_ONLY_SKIP`·`VALUE_COMPARE_SKIP` 확장, 로그 안 남김). 매수 래치 전이 4종(`buyLatched/buyUnlatched`)은 삭제.
- **D-14:** 기존 운영 전략 중 「감시대상 = 매수잔량」 선택분은 **relay 배포 직전 열거(64)로 `buyWatchSide === "1"` 목록을 추출해 사용자에게 보고만** 한다. 웹 안내 배너·일회성 이행 UI 없음 — 배포 뒤 웹은 서버 에코만 그린다(서버가 선매수로 읽는 것은 gh-trade D-24 로 사용자 수용).
- **D-15:** 후매수 발동(`postBuyPhase === 2`) 중에는 **매도주문·매수취소 카드 상태 문구에 「· 후매수 발동」을 덧붙인다**. 행 값은 에코 그대로(발동잔량으로 덮인 값), 편집도 그대로 허용(재제출이 cfg 를 바꾸는 서버 규약대로). 잔량 행에 별도 「발동」 표시는 하지 않는다.

### Claude's Discretion
- 접힘/펼침 상태의 보관 위치·수명(컴포넌트 state 로 충분, 에코 재렌더에 접힘이 풀리지 않을 것), 펼친 뒤 다시 접는 동선.
- 그룹 카드 제목줄의 상태 칩 문구 세부(「감시 중」「꺼짐」「포기」「보유중」「소진」)와 D-02 「마스터 ON · 그룹 없음」 중립 문구.
- 데스크톱 인라인 편집 Tab 순서(Phase 20 D-14 「같은 그룹 다음 항목」을 카드 3장에 어떻게 적용할지).
- 새 shared 타입 필드 이름(camelCase 변환은 기존 규약), 브라우저 프레임 키, 테스트 픽스처.
- `lc-fields.ts` 의 그룹 정의 확장 방식(선매수 안 「☐한방 N건 @가격」 = checkValue 행, 기존 sweep 필드 5개 중 `sweepMinTickCount`·`sweepWatchPrice` 만 노출 유지 여부는 현행 그대로).
- 접힘 요약 줄의 항목 순서·구분자(스케치 009 D 참고: 금액 · 매도잔량 · 체결량 · 한방 / 금액 · 최소 · 최대 / 금액 · 최대 · 최소 · 반등 · 발동잔량).
- relay 테스트 픽스처(`frames.ts`·`fake-gateway`)의 신필드 빌더 형태.

### Deferred Ideas (OUT OF SCOPE)
- 마스터 OFF 시 `post_buy_enabled` 에코 규약 — gh-trade **D-32 로 닫힘**(마스터 OFF 면 OFF). ROADMAP 「열린 것」 첫 항은 해소.
- 소진 푸시(300ms) 전 옛 ON 재제출 창이 웹에서 실제 생기는지 — 실기 검증 항목(리서치/UAT), 결정 아님.
- 후매수 매수잔량에서 내 미체결을 뺀 판정 · 그룹별 비교가격 분리 · 당일 누적 체결량 — gh-trade 24-CONTEXT deferred 그대로(서버 몫).
- 접힘 요약 줄의 항목을 사용자가 고르는 것 — 이번엔 전량 표시 고정.

**추가 범위 판정 (2026-09-27, 사용자 · 오케스트레이터 전달):** 스케치 010(`amount-based-options`, 금액 환산 표기)은 **이 phase 범위 밖**이다. 옵션 필드의 금액 환산은 조사·제안하지 않는다. 화면 정본은 스케치 009 채택안 **D** 다.
</user_constraints>

<phase_requirements>
## Phase Requirements

REQUIREMENTS.md 에 Phase 24 로 매핑된 ID 는 없다(ROADMAP 「Requirements: TBD」). 대신 ROADMAP Phase 24 의 relay ①~④ · webapp ⑤~⑩ 항목이 사실상의 요구사항이다. 플래너는 아래 표를 요구사항 추적표로 쓴다.

| ID(ROADMAP) | 설명 | 이 리서치의 근거 절 |
|----|------|------|
| relay ① | `sync-relay-schema.sh` 재생성 후 커밋 | §relay 1 · Pitfall 1 · 2 |
| relay ② | 빌더 `buy3_schema=1` + C→S 13필드 · `buy_watch_side` 미전송 · S→C 4필드 미전송 · MsgType 38 경로 제거 | §relay 2~4 · Code Examples 1 |
| relay ③ | 에코(60)·열거(64) 파싱 신필드 · `buy_watch_side` 부재 → "0" | §relay 5 · Code Examples 2 |
| relay ④ | 전체 재전송 규칙 유지(S→C 값 되보내지 않음) | Pitfall 6 · 9 |
| webapp ⑤ | 매수 카드 = 공통 + 선·추가·후매수 카드 3장, 감시대상 토글 제거 | §webapp 인벤토리 · 스케치 009 D |
| webapp ⑥ | 후매수 상태(`post_buy_phase`)·발동잔량·잔여 표시 | §webapp 5 · Pitfall 10 |
| webapp ⑦ | 선매수 ON 6개 자동 체크 + 사전 검증(D-10 · D-27) | §webapp 3 · Code Examples 4 |
| webapp ⑧ | `latch-led.tsx` 매수 2단계 + 보유중 | §webapp 6 |
| webapp ⑨ | 서버 거부 문구·사유 줄 전략 로그 매핑 | §서버 문구 원문표 · §webapp 7 |
| webapp ⑩ | 꺼진 옵션 행 글자 흐림 | §webapp 인벤토리(`dimWhenOff`) |
| 테스트 | 빌더 왕복 · 에코 파싱 · 3그룹 렌더 · 자동 체크 · 사전 검증 | Validation Architecture |
| 배포 | gh-trade 서버 → WinForms → relay → webapp push | §배포 · Runtime State Inventory |
</phase_requirements>

## Summary

gh-trade Phase 24 는 서버·와이어·검증·에코 규약을 이미 확정·구현했다(서버 코드 `Gateway.cpp` · `LimitChaser.cpp` 를 이번 세션에 직접 확인). gh-radar 가 할 일은 두 층이다. **relay** 는 생성물을 재생성하고(`--check` 실측: `.ts` 1개 변경 + `.fbs` 사본 갱신), 빌더가 `buy3_schema=1` 과 C→S 13필드를 싣고 `buy_watch_side` 를 싣지 않게 바꾸며, 에코 파서에 17필드(단 `buy_entry_latched` 접근자는 재생성으로 사라진다)를 반영한다. **webapp** 은 매수 탭을 스케치 009 D(공통 카드 + 접이식 그룹 카드 3장)로 재구성하고, 지금은 **한 필드 = 한 전송**인 확정 훅(`useLcFieldCommit`)을 **여러 필드를 한 전송에 싣는** 형태로 넓혀야 한다 — D-01(그룹+마스터), D-02(마지막 그룹+마스터 끄기), D-06/D-07(선매수+6체크+빈 가격 채움)이 전부 다필드 제출이다.

조사 중 CONTEXT 작성 이후의 사실 4건이 새로 드러났다. ① gh-trade 브랜치 팁이 ROADMAP 의 `9fb07d86` 에서 `b066e135` 로 두 커밋 전진했다 — `59bf77aa`(D-32, `.fbs` 주석 변경 → 재생성 대상) · `b066e135`(**WinForms 가 서버 접힘으로 세 그룹이 모두 꺼지면 마스터를 자동으로 끄고 제출** — 웹 D-02 후반 「에코 경로는 제출을 만들지 않는다」와 반대. 사용자는 discuss 에서 이 선택지를 보고 「자동 제출 없음」을 골랐으므로 결정 번복 대상은 아니지만 두 클라 동작이 갈린다는 사실을 기록해야 한다). ② **D-14 의 「relay 배포 직전 열거(64)로 추출」은 순서상 불가능**하다 — 새 서버는 에코·열거에 `buy_watch_side` 를 싣지 않으므로(`Gateway.cpp:3442`), gh-trade 서버 재기동(24-12) 뒤의 64 에는 전 전략이 `"0"` 으로 온다. 추출은 **서버 재기동 전**에 해야 한다. ③ relay 는 `lc.set` 스키마 위반이면 **WebSocket 을 끊는다**(`fanout.ts:1533-1537`) — relay 를 먼저 배포하면 아직 새로고침하지 않은 옛 웹 탭·앱 WebView 가 보내는 `lc.set`(신필드 없음)·`lc.arm latch:"buy"` 가 소켓을 죽인다. ④ 레거시 전략의 에코 `post_buy_rebound_pct` 는 0 이다 — relay 스키마를 서버 규약(1~100)으로 잡으면 그 전략의 **모든** 확정이 소켓 종료 또는 범위 차단에 걸린다.

**Primary recommendation:** relay 는 「신필드 optional + 없으면 거부 프레임(소켓 유지)」으로 구 탭을 막고, `postBuyReboundPct` 스키마는 0~100 + 「`postBuyEnabled` 면 1~100」 조건 검증으로 두며, webapp 은 `useLcFieldCommit` 에 **동반 필드(companions)** 를 추가하는 것부터 시작하라 — 나머지 UI 작업은 그 위에서 기존 행 문법(`lc-fields.ts` · `SettingGroup`)을 확장하면 된다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 세 매수 판정·발동잔량·재진입·소진·포기 | gh-trade 서버 | — | 서버가 진실 원본(gh-trade D-16). 웹은 에코만 그린다 |
| 스키마 재생성(`relay/src/generated/**`) | relay (생성물) | gh-trade 스크립트 | 손편집 금지, `sync-relay-schema.sh` 산출물만(Phase 17 D-01) |
| `buy3_schema=1` 고정 · `buy_watch_side` 미전송 · S→C 미전송 | relay 빌더 | — | 브라우저가 못 바꾸게 relay 가 못박는다(`sweep` 고정 3과 같은 규율) |
| 무장 가드(가격·수량 0 게이트 무장 거부) | relay `#strategyArmable` | webapp `canArmOf`/`armBlockOf` | 마지막 관문 = relay, 첫 관문 = UI. **두 식이 동형**이어야 한다(GC-WR-05) |
| 범위 검증(zod) | relay `protocol.ts` | webapp `lcRangeIssue` | relay 가 범위 위반이면 소켓을 끊으므로 UI 가 먼저 막는다(CR-01) |
| 금액→수량(3벌) | webapp `buyOrderQtyFromAmount` | — | 산출 유일 지점. 역산 금지 |
| 다필드 제출(D-01/D-02/D-06/D-07) | webapp `useLcFieldCommit` | `limit-chaser-form.tsx` | 한 확정 = 한 `lc.set`. 동반 필드는 같은 cfg 에 |
| 접힘/펼침 상태 | webapp 컴포넌트 state | — | 서버 무관·표시 전용(Claude 재량) |
| LED·상태 칩·로그 전이 | webapp 순수 함수(`latchLedStateOf` · `cardGroupStatusOf` · `strategyLogLine`) | — | 판정 근거 = 마지막 서버 에코 하나(D-20) |
| 매수잔량 기준 전략 목록 추출(D-14) | gh-trade 서버 상태 파일 / 사용자 화면 | — | 새 서버 에코엔 근거가 없다(아래 Open Q1) |

## 새로 드러난 사실 (CONTEXT 작성 이후 · 플래너 필독)

### F-1. gh-trade 팁이 전진했다 — 재생성은 **현재 팁**에서 한다
`[VERIFIED: git log, gh-trade worktree]` 브랜치 `worktree-phase-24-limitchaser-buy3` 최근 커밋:
```
b066e135 feat(client): 상따 매수 그룹이 모두 꺼지면 ☐매수주문도 끔 — 사람 해제·서버 접힘 둘 다, 삭제가 될 때는 보내지 않음
59bf77aa fix(24): ☐후매수 에코·저장본을 마스터와 접는다 — 마스터 OFF 면 세 그룹 체크 모두 OFF, 「보유중」은 ON 유지 (D-32)
9fb07d86 feat(client): 상따 창 꺼진 옵션 글자 흐림 — 체크 종속(마스터·선매수·매도·취소)까지, 입력은 유지
```
- `.fbs` 를 마지막으로 고친 커밋은 `59bf77aa`(`git log -1 -- src/protocol/StockDMA.fbs`). SYNC MARKER 의 `server-repo-commit` 은 이 값이 된다. 현재 gh-radar 사본 마커는 `d0c52ecd` / `2026-09-25`.
- **24-11·24-12 는 아직 미실행**(gh-trade ROADMAP: `- [ ] 24-11-PLAN.md — KB 120 전송 … (재기동 없음)` · `- [ ] 24-12-PLAN.md — 20:00 이후 재기동·기동 확인·클라 Release 발행`). 즉 실제 서버 전환 시점은 **24-12 재기동**이다. 팁은 배포 전까지 더 움직일 수 있으므로 relay 재생성 태스크는 「그때의 팁」에서 `--check` 부터 다시 돌린다.

### F-2. WinForms 는 에코 경로에서 마스터를 끈다 — 웹 D-02 와 다르다
`[VERIFIED: git show b066e135, client/Forms/Trading/LimitChaserForm.cs]` `ApplyServerConfig` 끝에서 `if (hadBuyGroup && chkBuyEnabled.Checked && !AnyBuyGroupChecked()) BeginInvoke(new Action(DropMasterAfterServerFold));` — 서버가 그룹을 접어 세 그룹이 모두 꺼지면 **마스터 OFF 를 제출**한다(단 매도·취소도 전부 OFF 면 삭제가 되므로 보내지 않음). 로그 `「서버가 매수 그룹 해제 — 매수 그룹이 모두 꺼져 매수주문도 끔」`.
- 웹 CONTEXT D-02 후반은 사용자가 discuss 에서 「에코 받으면 웹이 마스터 OFF 제출(다른 단말·재접속마다 제출이 튐, 핑퐁 위험)」을 **보고 거절**했다(`24-DISCUSSION-LOG.md:51-57`). 결정 번복 대상이 아니다. 다만 **WinForms 창이 같은 세션에 열려 있으면** WinForms 가 마스터 OFF 를 보내고 그 에코가 웹에 온다 — 웹은 이 에코를 「사용자가 보내지 않은 마스터 OFF」로 받는다(아래 Pitfall 11 `hadOrder` 오귀속).
- 참고: gh-trade `docs/strategy/limit-chaser.md` §10 은 아직 「그룹을 끄는 쪽은 마스터를 건드리지 않는다」라고 적혀 있어 `b066e135` 와 문서가 어긋나 있다(gh-trade 몫).

### F-3. D-14 추출은 gh-trade 서버 재기동 **전**에만 가능하다
`[VERIFIED: gh-trade server/src/net/Gateway.cpp:3442]` 「`// buy_watch_side 는 싣지 않는다 (Phase 24 D-24) — 서버가 더 읽지 않는 값이라 에코에 실을 값이 없다.`」 → 새 서버의 60/64 에는 `buy_watch_side` 슬롯이 없고 relay `fromWireWatchSide("")` 는 `"0"` 을 돌려준다. 배포 순서가 「서버 → WinForms → relay」이므로 **relay 배포 직전의 64 는 이미 새 서버의 열거**다 — `buyWatchSide === "1"` 은 0건이 나온다.
- 추가 근거: 새 서버의 상태 파일 쓰기는 `buy_watch_side` 키를 더 쓰지 않는다(`StrategyStateStore.h:390` 「`// buy_watch_side 는 더 쓰지 않는다 (Phase 24 D-24)`」). 재기동 뒤 첫 저장부터 근거가 파일에서도 사라진다.
- 재기동 때 남는 흔적은 `buyEnabled=true ∧ side '1'` 인 저장분의 WARN 한 줄뿐이다(`StrategyStateStore.h:718-721` 「`[StrategyState] 구파일 매수잔량 기준 상따 매수 꺼짐 isin={} acct={} …`」) — **매수가 꺼져 있던 side '1' 전략은 로그에도 안 남는다.**
- 결론: 추출은 **24-11(바이너리 전송, 재기동 없음)과 24-12(재기동) 사이 또는 그 전**, 옛 서버가 돌 때 해야 한다. 방법은 Open Question 1.

### F-4. relay 먼저 배포하면 구 웹 클라가 소켓을 잃는다
`[VERIFIED: relay/src/ws/fanout.ts:1533-1537]` 「`#reject(conn: Conn, reason: string): void { logger.warn(... "[WS] 프로토콜 위반 — 연결 종료"); ... conn.ws.close(RELAY_WS_CLOSE.BAD_MESSAGE, reason); }`」 — zod 파싱 실패 = 연결 종료. 배포 순서상 relay 가 webapp push 보다 먼저이고(메모리 「relay 먼저·push 나중」), push 뒤에도 **열려 있는 탭·네이티브 앱 WebView 는 새로고침 전까지 옛 JS** 다. 새 스키마가 `preBuyEnabled` 등을 필수로 요구하거나 `lc.arm` 의 `latch` 에서 `"buy"` 를 빼면, 옛 클라의 모든 상따 확정·매수 LED 클릭이 소켓을 끊고(시세·에코·수동주문까지 멈춤) 재접속 → 재확정 → 재종료 루프가 된다. 권장 처리는 Pitfall 3.

## Standard Stack

이 phase 는 **새 패키지를 설치하지 않는다.** 기존 스택만 쓴다.

### Core (기존 — 버전은 이번 세션 실측)
| Library / Tool | Version | Purpose | 근거 |
|---------|---------|---------|--------------|
| flatc | 25.12.19 | 스키마 → TS 생성 | `[VERIFIED: flatc --version]` · 스크립트 고정값 `FLATC_REQUIRED="flatc version 25.12.19"` |
| flatbuffers (npm, relay) | 25.9.23 | 생성 코드 런타임 | `[VERIFIED: relay/node_modules/flatbuffers/package.json]` |
| zod | ^4.0.0 | relay 인바운드 검증 | `[VERIFIED: relay/package.json]` |
| vitest | ^4.1.4 (relay) | relay 단위·통합 | `[VERIFIED: relay/package.json]` |
| vitest + jsdom + @testing-library/react | (webapp) | webapp 단위 | `[VERIFIED: webapp/vitest.config.ts]` |
| Playwright | (webapp) | e2e — 진짜 relay + 가짜 게이트웨이 | `[VERIFIED: webapp/e2e/fixtures/relay.ts]` |
| Node / pnpm | v22.22.0 / 11.15.1 | 런타임·워크스페이스 | `[VERIFIED: node --version · pnpm --version]` |

**Installation:** 없음.

## Package Legitimacy Audit

이 phase 는 외부 패키지를 설치하지 않는다 — 감사 대상 없음.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (없음) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## 와이어 정본 (gh-trade — 인용은 전부 이번 세션 원문)

### SetLimitChaser 말미 17필드
`[VERIFIED: gh-trade server/src/protocol/StockDMA.fbs:570-590]` (주석 일부 절단 — 이름·형·방향·슬롯은 원문 그대로)
```
buy3_schema: ubyte;              // 0 = 구 클라(필드 부재) … 신 클라는 항상 1, 서버 에코도 1 (D-24 판정 정본). vtable 98
pre_buy_enabled: bool;           // 선매수 체크 (양방향) — 에코는 무장과 접힌다(D-03). vtable 100
extra_buy_enabled: bool;         // 추가매수 체크 (양방향) — 에코는 cfg && 무장 && !포기 (D-03/D-08). vtable 102
extra_buy_min_qty: uint;         // 추가매수 최소 매수잔량(주, C→S). 0 = 1주 (D-08). vtable 104
extra_buy_max_qty: uint;         // 추가매수 최대 매수잔량(주, C→S). 0 = 무제한 (D-08). vtable 106
extra_buy_order_amount: uint;    // 추가매수 주문금액(만원) — buy_order_amount 규약(보관·에코만). vtable 108
extra_buy_order_qty: uint;       // 추가매수 주문수량(주, C→S) — 발주 정본. vtable 110
extra_buy_abandoned: bool;       // **S→C 전용** 최대 초과로 포기 (D-08). 요청값은 서버가 읽지 않는다. vtable 112
post_buy_enabled: bool;          // 후매수 체크(양방향) — 에코는 cfg ∧ 마스터 무장 ∧ 단계 ≠ 소진 …
post_buy_rebound_pct: ubyte;     // 후매수 반등률 % (C→S, 1~100). vtable 116
post_buy_floor_qty: uint;        // 후매수 하한잔량(주, C→S). vtable 118
post_buy_reentry: ubyte;         // 후매수 최대 횟수(최초 포함, D-30) — C→S 「최대」 칸. OFF→ON 재무장은 잔여를 이 값으로 다시 싣는다(D-31). vtable 120
post_buy_order_amount: uint;     // 후매수 주문금액(만원) — buy_order_amount 규약(보관·에코만). vtable 122
post_buy_order_qty: uint;        // 후매수 주문수량(주, C→S) — 발주 정본. vtable 124
post_buy_trigger_qty: uint;      // **S→C 전용** 발동잔량(주). 요청값은 서버가 읽지 않는다. vtable 126
post_buy_reentry_left: ubyte;    // **S→C 전용** 재진입 잔여(회). 요청값은 서버가 읽지 않는다. vtable 128
post_buy_phase: ubyte;           // **S→C 전용** 0 꺼짐 / 1 감시 / 2 보유중 / 3 소진. 요청값은 서버가 읽지 않는다. vtable 130
```
- `buy_watch_side: string;` (slot 24, `StockDMA.fbs:394`) 는 **아직 봉인되지 않았다**(D-28 ③ — gh-radar 배포 뒤 후속 봉인). 그래서 재생성 뒤에도 `addBuyWatchSide`·`buyWatchSide()` 접근자가 **남는다**.
- `buy_entry_latched: bool (deprecated);` (`StockDMA.fbs:559`) → 재생성으로 **`buyEntryLatched()` 와 `addBuyEntryLatched` 가 사라진다**.

### 재생성 결과 미리보기 (스크래치에 flatc 로 생성해 diff — gh-radar 무변경)
`[VERIFIED: flatc --ts 로 scratchpad 생성 후 diff]` 변경은 `stock-dma/set-limit-chaser.ts` 한 파일:
- `builder.startObject(47)` → `startObject(64)`
- 삭제: `buyEntryLatched()` · `static addBuyEntryLatched(... addFieldInt8(46, ...))`
- 추가 접근자(이름 원문): `buy3Schema()` `preBuyEnabled()` `extraBuyEnabled()` `extraBuyMinQty()` `extraBuyMaxQty()` `extraBuyOrderAmount()` `extraBuyOrderQty()` `extraBuyAbandoned()` `postBuyEnabled()` `postBuyReboundPct()` `postBuyFloorQty()` `postBuyReentry()` `postBuyOrderAmount()` `postBuyOrderQty()` `postBuyTriggerQty()` `postBuyReentryLeft()` `postBuyPhase()`
- 추가 빌더(필드 인덱스 원문): `addBuy3Schema`(47) `addPreBuyEnabled`(48) `addExtraBuyEnabled`(49) `addExtraBuyMinQty`(50) `addExtraBuyMaxQty`(51) `addExtraBuyOrderAmount`(52) `addExtraBuyOrderQty`(53) `addExtraBuyAbandoned`(54) `addPostBuyEnabled`(55) `addPostBuyReboundPct`(56) `addPostBuyFloorQty`(57) `addPostBuyReentry`(58) `addPostBuyOrderAmount`(59) `addPostBuyOrderQty`(60) `addPostBuyTriggerQty`(61) `addPostBuyReentryLeft`(62) `addPostBuyPhase`(63)
- `generated/stock-dma/msg-type.ts` 는 **무변경** — `ArmBuyLatchReq = 38` 이 생성 enum 에 그대로 남는다(번호 봉인이지 삭제가 아님).

### 서버 문구 원문표 (웹은 다듬지 않는다 — D-13)
`[VERIFIED: gh-trade server/src/net/Gateway.cpp · LimitChaser.cpp]`

| 경로 | lv / source | 원문 | 근거 |
|---|---|---|---|
| §9-2 ② 구 클라 매수잔량 | ERROR / `SetLimitChaser` | `매수잔량 기준 상따 매수는 더 이상 지원하지 않습니다 — 매수를 켜지 않았습니다(매도·취소 설정은 저장됨). 프로그램을 업데이트한 뒤 다시 설정하세요` | `Gateway.cpp:57-59` `kLegacyBidSideRejectMessage` |
| §9-2 ③ 공통 | ERROR / `SetLimitChaser` | `매수 설정이 불완전합니다(매수가/비교가 0) — 매수를 켜지 않았습니다` | `Gateway.cpp` 매수 검증 ① |
| §9-2 ③ 선매수 | ERROR / `SetLimitChaser` | `선매수 설정이 불완전합니다(주문수량 0) — 선매수를 켜지 않았습니다` | 같은 파일 |
| §9-2 ④ 추가매수 | ERROR / `SetLimitChaser` | `추가매수 설정이 불완전합니다(최소 > 최대) — 추가매수를 켜지 않았습니다` · `추가매수 설정이 불완전합니다(주문수량 0) — 추가매수를 켜지 않았습니다` | `limit-chaser.md:2458-2459` |
| §9-2 ⑤ 후매수 | ERROR / `SetLimitChaser` | `후매수 설정이 불완전합니다(주문수량 0) — 후매수를 켜지 않았습니다` · `…(반등률 1~100) — …` · `…(매도비율 0) — …` · `…(매도비율 1~100 밖) — …` | `limit-chaser.md:2460-2466` |
| §9-2 ⑤ WARN(새 등록만) | WARN | `후매수: 매도비율이 100% 미만이라 잔고가 0 이 되지 않아 재진입이 반복되지 않습니다` | `limit-chaser.md:2467` |
| §9-2 ⑥ MsgType 38 | ERROR / `ArmBuyLatchReq` | `매수 진입 래치는 폐기됐습니다(Phase 24) — 클라이언트를 업데이트하세요` | `Gateway.cpp:914-915` |
| 사유 줄(발주 없음) | INFO / `LimitChaser` | `추가매수 포기 — 매수1잔량 N > 최대 M` · `후매수 재진입 — 잔여 k회, 발동잔량 재계산` · `후매수 소진 — 잔여 0회` | `LimitChaser.cpp:3358-3365` |
| 사유 줄(발주) | INFO / `LimitChaser` | `매수 N주 @가격 — 후매수 — 매수1잔량 N > 발동잔량 T` · `… — 추가매수 — 매수1잔량 N ≤ 최대 M`(최대 0 이면 ` (최대 무제한)`) | `LimitChaser.cpp:3320-3326 · 3368-3374` (`<행위> <수량>주 @<가격> — <사유>`) |

- 기존 배지 판정 `serverMsgBadge` 는 `"LimitChaser"` → `[상따]`, 그 밖은 `[서버]` + 원문 `src` 괄호(`packages/shared/src/strategy-display.ts:84-88`). `SetLimitChaser` 거부는 지금도 `[서버] 서버가 거부했어요 (SetLimitChaser) — {m}` 으로 원문 그대로 뜬다 — **이 phase 에서 고칠 것 없음**(D-13 충족). `ArmBuyLatchReq` source 도 같은 경로로 원문이 뜬다.

### 에코 규약 핵심(§9-2 ⑧) — 웹이 기대해야 할 값
`[VERIFIED: gh-trade Gateway.cpp:3530-3561]`
- `buy3_schema` = 항상 1 · `buy_enabled` = cfg ∧ 마스터 무장(**발주로 접히지 않음**) · `pre_buy_enabled` = cfg ∧ 선매수 무장(발주로 접힘) · `extra_buy_enabled` = cfg ∧ 무장 ∧ !포기 · `post_buy_enabled` = cfg ∧ 마스터 무장 ∧ 단계 ≠ 소진(자기 게이트와 접지 않음 — 「보유중」에도 ON) · S→C 3값 원값 · `post_buy_reentry` = **cfg 원값(설정값)**.
- 후매수 발동(단계 2) 뒤 에코: `sell_enabled`·`cancel_qty_enabled` ON, 매도 호가잔량(`sell_watch_qty`)·취소잔량(`cancel_watch_qty`) = 발동잔량, 매도가·매도 비교가 0 이었으면 상한가(`limit-chaser.md` §5-3 표).

### 재무장 규칙(웹 D-11 이 기대는 서버 규칙)
`[VERIFIED: gh-trade LimitChaser.cpp:1036-1054]` 「`!nowArmed` → 단계 Off, 잔여는 `reentryChanged` 일 때만 = cfg · `!wasArmed`(OFF→ON) → 잔여 = cfg.postBuyReentry, 발동잔량 0, 단계 Watch · ON→ON ∧ `reentryChanged` → 잔여 = cfg」. `reentryChanged = !prev || prev->postBuyReentry != cfg.postBuyReentry`.
- 따라서 웹이 ON→ON 재제출에 **에코의 `postBuyReentry`(설정값)를 그대로** 실으면 잔여는 건드려지지 않는다(Pitfall 9 안전).

## Architecture Patterns

### System Architecture Diagram

```
 [사람: 그룹 스위치/값/체크]                      [gh-trade 서버]
          │                                              ▲   │
          ▼                                              │   │ 60 에코(즉답 + 300ms 푸시)
 LimitChaserForm ──commit(field, value, companions)──┐   │   │ 64 열거 · 54 ServerMessage
   │  (D-01 마스터 동반 · D-02 마스터 끔                │   │   │
   │   D-06/07 자동 체크 조립: 순수 함수)               ▼   │   ▼
   │                              useLcFieldCommit(직렬화·대기열·판정)
   │                                       │ buildCfg(values) → cfg(RelayLimitChaserInput)
   │                                       │   ├ buyOrderQty / extraBuyOrderQty / postBuyOrderQty = 금액→수량
   │                                       │   └ S→C 4 · buy3Schema · buyWatchSide 는 **없음**
   │                                       ▼
   │                               send({t:"lc.set", cfg}) ── wss ──▶ relay fanout
   │                                                                   │ zod(RelayLcSetSchema) ─ 위반 → 소켓 종료(!)
   │                                                                   │ 구 탭(신필드 없음) → 거부 프레임(권장)
   │                                                                   │ #strategyArmable(그룹별 무장 가드)
   │                                                                   ▼
   │                                               buildSetLimitChaserReq: buy3_schema=1 고정,
   │                                               C→S 13필드, buy_watch_side 미전송 ──TCP──▶ 게이트웨이
   │                                                                                           │
   │   ◀── lc / lc.snap ── hub 캐시 ◀── readLimitChaser(60·64 공용 파서, 신필드 17-1) ◀─────────┘
   ▼
 server prop 갱신 → formFromServer(서버가 이긴다) → 행/요약줄/칩/LED(latchLedStateOf)
                  → strategy-card: isRuntimeOnlyEcho? → 무동작 / strategyLogLine → 전략 로그
                  → 54 ServerMessage → serverMessageLogLine(원문, [상따]/[서버] 배지)
```

### Recommended Project Structure (변경 파일 지도)
```
relay/src/generated/                 # 재생성(스크립트 산출물만) — set-limit-chaser.ts + StockDMA.fbs 사본
relay/src/dma/envelope.ts            # 빌더·파서·ArmLatchMsgType·toWireWatchSide 제거
relay/src/dma/msg-type.ts            # MSG.ArmBuyLatchReq 제거(권장) + 주석 「38 봉인」
relay/src/ws/protocol.ts             # lc.set 신필드 · buyWatchSide 제거 · lc.arm "buy" 처리
relay/src/ws/fanout.ts               # ARM_LATCH_MSG_TYPE buy 제거 · #strategyArmable 그룹별 · 구 탭 거부
relay/tests/helpers/frames.ts        # FakeLimitChaserInput 신필드 · addBuyEntryLatched 제거
relay/tests/helpers/fake-gateway.ts  # readSetLimitChaserRequest(신설 권장) · ArmBuy 제거
packages/shared/src/relay.ts         # RelayLimitChaser 신필드 · SERVER_ONLY 확장 · Input Omit · RelayLcArmMsg
webapp/src/lib/limit-chaser.ts       # 기본값 · formFromServer · 금액→수량 3벌 · DIRTY_COMPARED_FIELDS
webapp/src/components/trading/lc/lc-fields.ts        # 그룹 재구성 · 행 종류 · 라벨 개명
webapp/src/components/trading/lc/setting-group.tsx   # 접기·요약줄·칩 · valueText · 읽기 전용 행
webapp/src/components/trading/lc/use-lc-field-commit.ts  # companions · 게이트 필드 집합
webapp/src/components/trading/limit-chaser-form.tsx  # 조립·사전 검증·자동 체크
webapp/src/components/trading/latch-led.tsx          # 매수 2단계 + 보유중
webapp/src/components/trading/strategy-log.tsx       # 전이 집합·skip 집합
webapp/src/components/trading/card/strategy-card.tsx # lc.arm buy 경로 · hadOrder · 발동 override 귀속
webapp/src/components/trading/card/card-body.tsx     # cardGroupStatusOf 확장(D-02 · D-15)
webapp/src/test-fixtures/limit-chaser.ts (신설 권장) # RelayLimitChaser 공용 픽스처(14곳 인라인 팩토리 대체)
```

---

### relay 1 — 스키마 재동기화 (ROADMAP ①)

- 스크립트 경로는 **`server/scripts/sync-relay-schema.sh`** 다(ROADMAP 의 `./scripts/…` 는 `server/` 기준 상대경로). 스크립트가 `cd "$(dirname "$0")/.."` 로 `server/` 로 이동한다.
- `--check` 는 **비변경**이다 — 생성은 `mktemp -d` 에만 하고, `CHECK_ONLY=true` 면 대조·보고 뒤 `exit 0` 한다(스크립트 `[5/5]` 절). 이번 세션 실측 `[VERIFIED: 실행 출력]`:
  ```
  [3/5] 가드 2: flatc 버전 확인
        flatc version 25.12.19
  [4/5] 생성: flatc --ts (임시 디렉토리)
        생성 49 개 (.ts, stock-dma/ 포함)
  [5/5] 대조: 반영하면 무엇이 바뀌는지만 보고 (gh-radar 파일 무변경)
        신규/변경 예정  : 1 개
        삭제 예정       : 없음
        .fbs 사본       : 갱신 예정
  ```
- 실행 명령(반영):
  `cd /Users/alex/repos/gh-trade/.claude/worktrees/phase-24-limitchaser-buy3/server && RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh`
  → gh-radar `relay/src/generated/stock-dma/set-limit-chaser.ts` + `relay/src/generated/StockDMA.fbs` 두 파일이 바뀐다. **커밋은 gh-radar 쪽에서** 한다(스크립트는 커밋하지 않는다).
- ★ **재생성 커밋은 단독으로 typecheck 가 깨진다** — `buyEntryLatched()`·`addBuyEntryLatched` 가 사라져 `envelope.ts:2061`(`buyEntryLatched: t.buyEntryLatched()`)과 `relay/tests/helpers/frames.ts:720`(`SetLimitChaser.addBuyEntryLatched(...)`)이 컴파일 오류가 된다. 재생성 + 그 두 사용처 제거 + shared `RelayLimitChaser.buyEntryLatched` 제거를 **같은 태스크(같은 커밋)** 에 묶어야 build_command 가 초록이다(Phase 17 D-01 「생성물은 같은 커밋」 규약과도 맞다).

### relay 2 — `buildSetLimitChaserReq` 현재 모양 (ROADMAP ②)

`[VERIFIED: relay/src/dma/envelope.ts:1173-1268]`
- 조립은 `startSetLimitChaser` + 이름 있는 `addXxx` 개별 호출(위치 인자 `createSetLimitChaser` 금지 — T-16-05). 문자열 6종을 테이블 열기 전에 만든다: `isinOff, accountNoOff, marketOff, crudOff, buyWatchSideOff, exchangeOff`(:1216-1221).
- `const buyWatchSide = toWireWatchSide(cfg.buyWatchSide);`(:1194) · `SetLimitChaser.addBuyWatchSide(b, buyWatchSideOff);`(:1233) — **이 두 줄과 `buyWatchSideOff` 를 지운다.** `toWireWatchSide`(:924-929)와 `RelayLcWatchSide` 입력 의존도 함께 제거.
- 고정값 패턴: `LC_FIXED_SWEEP_RECALC_ENABLED = true` · `LC_FIXED_SWEEP_MIN_COUNT = 0` · `LC_FIXED_SWEEP_MIN_RATE = 0`(:1156-1161). **`LC_FIXED_BUY3_SCHEMA = 1` 을 같은 결로 추가**하고 `SetLimitChaser.addBuy3Schema(b, LC_FIXED_BUY3_SCHEMA)` 를 무조건 싣는다(입력 타입에 두지 않는다 — 브라우저가 0 을 보내 구 클라 경로를 여는 것을 구조적으로 막는다).
- 추가할 C→S 13필드: `addPreBuyEnabled` · `addExtraBuyEnabled` · `addExtraBuyMinQty`(uint) · `addExtraBuyMaxQty`(uint) · `addExtraBuyOrderAmount`(uint) · `addExtraBuyOrderQty`(uint) · `addPostBuyEnabled` · `addPostBuyReboundPct`(**ubyte** → `toWireUByte`) · `addPostBuyFloorQty`(uint) · `addPostBuyReentry`(**ubyte** → `toWireUByte`) · `addPostBuyOrderAmount`(uint) · `addPostBuyOrderQty`(uint). (13 = 12 + `buy3_schema`)
- 부르지 않는 것: `addExtraBuyAbandoned` · `addPostBuyTriggerQty` · `addPostBuyReentryLeft` · `addPostBuyPhase`(S→C 4) · `addBuyWatchSide`.
- 주석 「클라 입력 29 + relay 해석 1 + 클라 고정 3 = 33 필드」(:1136) 갱신: 입력 29 − `buyWatchSide` + 신 C→S 12 = 40, + market 1 + 고정 4(sweep 3 + buy3Schema) = 45.

### relay 3 — MsgType 38 경로 (ROADMAP ②)

`[VERIFIED: relay/src/dma/msg-type.ts:111-115]` 「`ArmSellLatchReq: 36,` … `ArmCancelLatchReq: 37,` … `ArmBuyLatchReq: 38,`」 · `[VERIFIED: envelope.ts:1427-1430]` 「`export type ArmLatchMsgType = | typeof MSG.ArmSellLatchReq | typeof MSG.ArmCancelLatchReq | typeof MSG.ArmBuyLatchReq;`」 · `[VERIFIED: fanout.ts:167-171]` 「`const ARM_LATCH_MSG_TYPE: Record<RelayLcArmMsg["latch"], ArmLatchMsgType> = { sell: MSG.ArmSellLatchReq, cancel: MSG.ArmCancelLatchReq, buy: MSG.ArmBuyLatchReq, };`」 · `[VERIFIED: protocol.ts:246-250]` 「`latch: z.enum(["sell", "cancel", "buy"]),`」 · `[VERIFIED: packages/shared/src/relay.ts:510-511]` 「`latch: "sell" | "cancel" | "buy";`」
- 권장: `MSG` 에서 `ArmBuyLatchReq` 를 빼고 `ArmLatchMsgType` 을 36|37 로 좁힌다 → relay 가 38 을 **조립할 수 없음이 컴파일 타임에 보장**된다. `ARM_LATCH_MSG_TYPE` 의 `Record` 키도 `RelayLcArmMsg["latch"]` 에서 `"buy"` 를 빼면 자동으로 컴파일 에러가 짚어 준다.
- 단 **zod `latch` enum 에서 `"buy"` 를 바로 빼면 구 탭이 매수 LED 를 누를 때 소켓이 끊긴다**(F-4). 권장: 스키마는 `"buy"` 를 받아 두고, `lc.arm` 분기에서 `latch === "buy"` 면 게이트웨이로 보내지 않고 `rejectFrame("매수 진입 래치는 폐기됐어요 — 화면을 새로고침해 주세요", "", "")` 로 답한다(shared 계약 `RelayLcArmMsg.latch` 는 `"sell" | "cancel"` 로 좁히고, relay 내부 스키마만 관용). 이 한시 관용은 「buy_watch_side 봉인 후속」과 함께 걷는다.
- 영향 테스트: `relay/src/dma/__tests__/codec.test.ts:202-233`(17-01 재동기화 6종 이름 대조 — `MSG.ArmBuyLatchReq` 를 이름으로 적어 둠) · `relay/tests/helpers/fake-gateway.ts:369-373`(arm 요청 집합) · `relay/tests/ws-latch.test.ts:239-242 · 368-381 · 447-453 · 492 · 539`(buy 갈래). `INBOUND_MSG_TYPES.size` 25 는 무변경(38 은 C→S).

### relay 4 — 무장 가드 `#strategyArmable` 을 그룹별로 (마지막 관문)

`[VERIFIED: relay/src/ws/fanout.ts:1207-1259]` 현재 식: 「`cfg.buyEnabled && (cfg.buyOrderPrice === 0 || cfg.buyOrderQty === 0) ? "buy" : cfg.sellEnabled && (cfg.sellOrderPrice === 0 || cfg.sellWatchQty === 0) ? "sell" : cfg.sweepEnabled && (cfg.sweepWatchPrice === 0 || cfg.buyOrderPrice === 0 || cfg.buyOrderQty === 0) ? "sweep" : null;`」
- ★ **그대로 두면 정상 전략이 거부된다**: 마스터 ON + 후매수만 ON + 선매수 금액 0(레거시 또는 사용자가 선매수 금액을 비움) → `buyOrderQty === 0` → 전 프레임 거부. 서버 규약은 「매수가·비교가 0 → 마스터」, 「그룹 주문수량 0 → 그 그룹」이다(§9-2 ③④⑤).
- 권장 식(서버 §9-2 ③~⑤ 와 동형, UI `canArmOf` 와 동형으로 함께 고친다):
  - `buy`: `cfg.buyEnabled && (cfg.buyOrderPrice === 0 || cfg.buyWatchPrice === 0)` ※ 비교가 0 도 서버가 마스터를 눕힌다
  - `preBuy`: `cfg.buyEnabled && cfg.preBuyEnabled && cfg.buyOrderQty === 0`
  - `extraBuy`: `cfg.buyEnabled && cfg.extraBuyEnabled && cfg.extraBuyOrderQty === 0`
  - `postBuy`: `cfg.buyEnabled && cfg.postBuyEnabled && cfg.postBuyOrderQty === 0`
  - `sweep`: `cfg.preBuyEnabled && cfg.sweepEnabled && (cfg.sweepWatchPrice === 0 || …)` — 한방은 이제 선매수의 하위 체크다. 선매수가 꺼져 있으면 한방은 판정되지 않으므로 막을 이유가 없다(Claude 재량 — UI 쪽 식과 반드시 같이).
  - `sell`: 현행 유지.
  - `#isTeardown`(:1100-1104, 게이트 4종 = `buyEnabled·sellEnabled·cancelQtyEnabled·cancelTradeEnabled`)은 **무변경** — 서버 5단계 정규화가 마스터를 본다(§9 「둘 다 OFF 정규화 … `buy_enabled`(마스터)를 본다」).
- 기존 테스트 `relay/tests/fanout.test.ts:1129 · 1307-1310 · 1389 · 1411`(`gate: "buy"` 로그 단언)이 식 변경 영향권이다.

### relay 5 — 파서 `readLimitChaser` (ROADMAP ③)

`[VERIFIED: relay/src/dma/envelope.ts:1995-2071]` 60 단건(`parseLimitChaserEcho` :2081-2093)과 64 목록(`parseLimitChaserList` :2106-2130)이 **같은 `readLimitChaser`** 를 쓴다 — 신필드는 여기 한 곳에만 추가하면 두 경로가 함께 갱신된다(갈리지 않게 하는 기존 설계).
- `buyWatchSide: fromWireWatchSide(t.buyWatchSide() ?? ""),`(:2022) — 유지하면 새 서버 에코에서 늘 `"0"`. ROADMAP ③ 「빈 값 → "0"」 그대로. `fromWireWatchSide`(:1773-1775) 는 남긴다.
- `buyEntryLatched: t.buyEntryLatched(),`(:2061) — **삭제**(접근자 소멸).
- 추가: `buy3Schema: t.buy3Schema()` (권장 — WinForms 처럼 구 서버 경고 근거) 및 신필드 16개 전부 읽는다. S→C 4필드도 **읽는다**(「보내지 않는 것」 ≠ 「읽지 않는 것」 — Pitfall 6 기존 규율).
- 기존 단언 `expect(Object.keys(item!)).toHaveLength(40);`(`envelope.test.ts:1495`) → 활성 필드 수 재계산: 39 − 1(`buyEntryLatched`) + 17 = **55 + key = 56**(`buyWatchSide` 를 파싱에 남기는 경우).

### shared 계약 (`packages/shared/src/relay.ts`)

`[VERIFIED: packages/shared/src/relay.ts:105 · 136-255 · 262-286 · 309-316]`
- `RelayLcWatchSide = "0" | "1"`(:105) — `RelayLimitChaser.buyWatchSide` 에만 남긴다(읽기 전용, 「새 서버는 늘 "0"」 주석). **`RelayLimitChaserInput` 에서는 `Omit`** 해 브라우저가 싣지 못하게 한다.
- `buyEntryLatched: boolean;`(:246 부근) 삭제 + `LIMIT_CHASER_SERVER_LATCH_FIELDS`(:275-277 — 원문 「`"sellEntryLatched", "cancelEntryLatched", "buyEntryLatched",`」)에서 제거.
- 신 S→C 4필드(`extraBuyAbandoned` · `postBuyTriggerQty` · `postBuyReentryLeft` · `postBuyPhase`)는 D-13 에 따라 **런타임 에코**다 → `LIMIT_CHASER_SERVER_COUNTER_FIELDS`(:262-266)에 합치거나 새 `LIMIT_CHASER_SERVER_RUNTIME_FIELDS` 를 만들어 `SERVER_ONLY` 에 합친다. 어느 쪽이든 `RelayLimitChaserInput` 의 `Omit<…, LimitChaserServerOnlyField …>` 가 자동으로 뺀다.
- `buy3Schema` — `RelayLimitChaser` 에는 두고 Input 에서는 Omit(빌더 고정).
- `webapp/src/components/trading/__tests__/strategy-log.test.tsx:184-185` 「`LIMIT_CHASER_SERVER_ONLY_FIELDS 는 정확히 6개이고 COUNTER(3) ∪ LATCH(3) 와 같다`」 → 개수 단언 갱신 대상.
- shared 는 `dist` 가 **git 추적 대상이 아니다** — relay·webapp typecheck 전에 `pnpm --filter @gh-radar/shared build` 필수(config `build_command` 첫 단계가 이미 그렇게 돼 있다).

### relay 6 — 인바운드 스키마 `RelayLcSetSchema`

`[VERIFIED: relay/src/ws/protocol.ts:139-181]` 현재 `buyWatchSide: z.enum(["0", "1"]),`(:150) · `sellOrderRatio: z.number().int().min(1).max(100),` · `sellQtyTrackRatio: z.number().int().min(1).max(90),` · `buyOrderAmount: UIntSchema,`.
- 추가(권장 범위):
  - `preBuyEnabled` · `extraBuyEnabled` · `postBuyEnabled`: `z.boolean()`
  - `extraBuyMinQty` · `extraBuyMaxQty` · `extraBuyOrderAmount` · `extraBuyOrderQty` · `postBuyFloorQty` · `postBuyOrderAmount` · `postBuyOrderQty`: `UIntSchema`
  - `postBuyReentry`: `UByteSchema`(0~255 — 0 은 D-30 「한 번도 안 산다」로 **유효**)
  - `postBuyReboundPct`: **`z.number().int().min(0).max(100)`** + `.superRefine` 로 `postBuyEnabled ⇒ 1~100` (Pitfall 4 — 레거시 에코 0 을 소켓 종료로 만들지 않기)
  - (선택) `extraBuyMinQty ≤ extraBuyMaxQty` 조건을 zod 로 막지 **말 것** — 서버 규약은 「그 그룹만 눕히고 ERROR」이고, zod 로 막으면 소켓이 끊긴다. UI 사전 검증(D-10)이 첫 관문이다.
- `buyWatchSide` 제거: `z.object` 는 미지 키를 떨어뜨리므로 구 탭이 실어 보내도 통과한다(무해).
- **구 탭 관용(F-4)**: 신필드 13개를 필수로 두면 구 탭 프레임이 zod 에서 실패 → 소켓 종료. 권장은 신필드를 `.optional()` 로 두고 fanout `lc.set` 분기에서 「`preBuyEnabled === undefined`(=구 클라)」면 게이트웨이로 보내지 않고 거부 프레임 `「새 버전으로 새로고침해 주세요 — 매수 설정 방식이 바뀌었어요」`(문구는 UI-SPEC 재량)을 돌려주는 것이다. 이렇게 하면 소켓이 살아 있어 시세·수동주문은 계속 된다. 대안(구 탭 프레임을 `buy3_schema=0` 레거시로 중계)은 ROADMAP 의 「`buy3_schema=1` 고정」과 충돌하므로 권하지 않는다.

---

### webapp 인벤토리 (ui-phase · 플래너가 인용할 현재 심볼)

#### `webapp/src/components/trading/lc/lc-fields.ts` (293줄) — 필드 스펙 단일 원천
`[VERIFIED: lc-fields.ts:22-104 · 106-159 · 161-226 · 228-293]`
- 타입: `LcNumField`(값 필드 14종 — `'buyOrderPrice' | 'buyOrderAmount' | 'buyWatchPrice' | 'buyWatchQty' | 'buyMinTradeQty' | 'sweepMinTickCount' | 'sweepWatchPrice' | 'sellOrderPrice' | 'sellOrderRatio' | 'sellWatchPrice' | 'sellWatchQty' | 'sellQtyTrackRatio' | 'sellMinTradeQty' | 'cancelWatchQty'`) · `LcBoolField`(`'buyTradeQtyEnabled' | 'sellQtyTrackEnabled' | 'sellTradeQtyEnabled' | 'cancelTradeEnabled' | 'cancelQtyTrackEnabled'`) · `LcUnit = Exclude<PadUnit, '회'>` · `LcRange` · `LcRowSpec` · `LcGate = 'buyEnabled' | 'sweepEnabled' | 'sellEnabled' | 'cancelQtyEnabled'` · `LcStatusKey = 'buy' | 'sweep' | 'sell' | 'cancel'` · `LcGroupSpec`.
- 행 종류(`LcRowSpec.kind`) 원문: `'value'` · `'checkValue'` · `'check'` · `'watch'` · `'derived'`(`label: '잔량추적 기준선'`).
- `LcGroupSpec` 필드: `slot: 'buy-price' | 'buy' | 'sweep' | 'sell-price' | 'sell' | 'cancel'` · `title?: '매수주문' | '한방체결' | '매도주문' | '매수취소'` · `ariaLabel?` · `hint?` · `gate?` · `statusKey?` · `dimWhenOff: boolean` · `rows`.
- 현행 매수 그룹: `buy-price`(매수가격 `lc-buy-order-price`, 주문금액 `lc-buy-order-amount`) → `buy`(매수주문 게이트: 비교가격 `lc-buy-watch-price`, `watch`, 잔량 `lc-buy-watch-qty`, 체결 checkValue `lc-buy-trade`/`lc-buy-min-trade-qty`) → `sweep`(한방체결 게이트: 호가변경 `lc-sweep-tick` range 0~255, 한방가격 `lc-sweep-watch-price`).
- 함수: `lcRowById(id)` · `lcRowByField(field)` · `lcNavigableRows(slot)`(Tab 순서 — 같은 그룹 안만) · `lcRangeIssue(values)`(전송 직전 범위 방어선) · `LC_SWITCH_LABEL`(`'매수주문 켜기'` 등 — e2e·a11y 가 이 이름으로 스위치를 찾는다: `a11y.spec.ts:375`, `trading-workbench.spec.ts:464`).
- **이 phase 의 변경 방향**: `kind: 'watch'` 삭제 · 그룹 슬롯 신설(예: `'buy-common'` 또는 기존 `'buy'` 재정의, `'pre-buy'`, `'extra-buy'`, `'post-buy'`) · `title` 유니온 확장(`'선매수' | '추가매수' | '후매수'`) · `LcGate` 에 `'preBuyEnabled' | 'extraBuyEnabled' | 'postBuyEnabled'` 추가, `'sweepEnabled'` 는 게이트에서 **체크(LcBoolField)** 로 이동 · `LcNumField` 에 신 값 필드 8개(`extraBuyOrderAmount · extraBuyMinQty · extraBuyMaxQty · postBuyOrderAmount · postBuyReentry · postBuyFloorQty · postBuyReboundPct` 및 선매수 금액은 기존 `buyOrderAmount`) · 읽기 전용 「발동잔량」 행(`derived` 확장 — 현재 `label` 이 `'잔량추적 기준선'` 리터럴 하나라 유니온을 넓혀야 함) · `range`: `postBuyReboundPct` {1,100}(단 Pitfall 4 참고) · `postBuyReentry` {0,255}.
- `'회'` 단위: `LcUnit` 이 `'회'` 를 **명시적으로 뺀다**(수동주문 조각 수 전용). 후매수 「최대 N회」에 `'회'` 를 쓰려면 Pitfall 12 를 먼저 풀어야 한다.
- 슬롯 이름 `data-slot="lc-group-{slot}"` 은 e2e 앵커다(`trading-workbench.spec.ts:2483-2488` 이 `lc-group-buy`·`lc-group-sell` 헤더 높이를 잰다).

#### `webapp/src/components/trading/lc/setting-group.tsx` (603줄) — 행 조각
`[VERIFIED: setting-group.tsx:37-42 · 118-200 · 250-313 · 316-366 · 368-510 · 513-592 · 594-603]`
- 내보내는 것: `SettingUnit = '원' | '주' | '만원' | '%' | '건'` · `formatSettingValue(value, unit)` · `SettingRow`(`value: number | null` — `null` 이면 `'—'`) · `FailureBubble` · `SettingGroup`(`spec · statusText · on · switchNode · children`, `dim = spec.dimWhenOff && on === false` → 행 컨테이너 `opacity-45`) · `GroupSwitch`(`id? · label · checked · disabled? · onCheckedChange · failureText?`) · `CheckValueRow`(값 1개까지) · `WatchTargetRow` · `DerivedRow({label, value, unit})`.
- 상태 문구 색: `statusText === '감시 중' ? 'text-[var(--led-armed)]' : 'text-[var(--muted-fg)]'`(:298) — 「보유중」·「소진」·「포기」 칩 색은 새 규칙이 필요(주황은 `--led-latent` 재사용, D-12).
- 행 기하 불변식: 44px(`ROW_BOX` `min-h-[44px]`), 말줄임 금지, 폭 판정은 컨테이너 쿼리 `@min-[700px]/lc:` 만(파일 머리 주석).
- **이 phase 의 확장 필요**: ① 제목줄 클릭 = 접기(스위치 클릭은 전파 차단) + 쉐브런 ② 접힘 요약 줄(줄바꿈 허용, `kv` 조각 · 꺼진 항목 흐림) ③ 상태 **칩**(현재는 텍스트) ④ `SettingRow`/`CheckValueRow` 에 **`valueText?: string`**(D-10 「무제한/1주/없음」, D-11 「3회 · 남은 2회」, 한방 「3건 @12,990원」) ⑤ 발동잔량 읽기 전용 행(빨강 값) ⑥ 사전 검증 안내 한 줄(행 아래, 빨강, 모달 아님).

#### `webapp/src/components/trading/limit-chaser-form.tsx` (1091줄) — 배선
`[VERIFIED: limit-chaser-form.tsx:124-125 · 141-147 · 156-208 · 267-287 · 303-310 · 313-315 · 486-500 · 510-523 · 645-652 · 810-821 · 823-852 · 866-885]`
- `GATE_KEYS = ['buyEnabled', 'sweepEnabled', 'sellEnabled'] as const`(:124) · `ARM_BLOCKED_TEXT`(:141-147, 5문구) · `GATE_LABEL`(:156-160) · `armBlockedTextOf` · `armBlockedGroupsOf` · `canArmOf`(:267-287 — `buy = buyOrderPrice > 0 && buyQty > 0`, `sell = sellOrderPrice > 0 && sellWatchQty > 0`, `sweep = sweepWatchPrice > 0 && buy`) · `armBlockOf`(:303-310) · `BUY_COLUMN_GATES = ['buyEnabled', 'sweepEnabled']` · `buildCfg`(:486-500 — `buyOrderQty: buyOrderQtyFromAmount(values.buyOrderAmount, values.buyOrderPrice)`, 고정 3) · `commitToggle(field, value)`(:645-652 — **한 필드만**) · `renderRow`(`case 'watch'` :810-821) · `renderGroup`(:823-852) · `pane(side, groups, reasons)`(:866-885, 열 머리 · 사유 패널).
- 파일 머리 ② 3 「★ **발주할 수 없는 전략은 무장되지 않는다**(WR-06)」 규율 → 그룹 게이트 3개가 `GATE_KEYS` 에 들어가고 사유 패널(`lc-arm-blocked-panel`)이 그 사유를 낸다. D-03 「새 그룹 금액 0 → 그 그룹 스위치만 막음」은 이 사유 경로의 새 항목이다.

#### `webapp/src/components/trading/lc/use-lc-field-commit.ts` (606줄) — 확정 상태 기계
`[VERIFIED: use-lc-field-commit.ts:93-113 · 129 · 132-142 · 148-152 · 177-190 · 312-357 · 427-481]`
- `LC_GATE_FIELDS = ['buyEnabled', 'sweepEnabled', 'sellEnabled', 'cancelQtyEnabled']`(:129) — 미등록 전략에서도 전송(등록)할 수 있는 필드. 끄는 방향 판정 `isGateField(field) && value === false`.
- `LC_COMMIT_TEXT`(:132-142) — `amountRequired: '주문금액을 먼저 입력해 주세요'` 등(D-03 사유 문구가 이미 있음 — 재사용).
- `lcAmountBlockOf(amountRequired, field, value)`(:148-152) — 서버가 선매수 금액을 모르면(`buyOrderAmount === 0`) 금액 외 확정을 막는다(D-04a). D-03 에 따라 **선매수 전용으로 유지**.
- `Pending { field, value, kind, prevValue }`(:177-183) · `sendNow`: `const next = { ...base, [p.field]: p.value };`(:317) — **다필드 불가의 원인**. 성공 판정 `server[inf.field] === inf.value`(:442).
- 이 훅은 거부·타임아웃·끊김·고아 장벽(CR-02)·대기열·늦은 에코를 이미 정교하게 다룬다 — **새 훅을 만들지 말고 Pending 에 `companions` 를 더하는 확장**이 맞다(Don't Hand-Roll).

#### `webapp/src/lib/limit-chaser.ts` (495줄)
`[VERIFIED: limit-chaser.ts:56-66 · 89-92 · 101-107 · 153-175 · 209-216 · 249-282 · 301-331]`
- `LimitChaserFormValues = Omit<RelayLimitChaserInput, 'isin' | 'accountNo' | 'exchange' | 'crud' | 'buyOrderQty' | 'sweepRecalcEnabled' | 'sweepMinCount' | 'sweepMinRate'>` — 신 파생 필드 `extraBuyOrderQty` · `postBuyOrderQty` 도 Omit 에 추가해야 한다(수량은 `buildCfg` 가 산출 — 역산 금지 규율의 연장).
- `buyOrderQtyFromAmount(amountManwon, price)` — 3벌이 **이 한 함수**를 쓴다(WinForms `QtyFromAmount` 동형 — `limit-chaser.md` §10 「금액 → 수량 3벌」).
- `isActiveStrategy`(`buyEnabled || sellEnabled || cancelQtyEnabled`) · `isDeleteIntent`/`crudOf`(게이트 4종) — **무변경**(서버 정규화가 마스터 기준).
- `DIRTY_COMPARED_FIELDS`(:153-175) — Phase 20 이후 **사용처가 자기 함수 `dirtyFieldsOf` 와 테스트뿐**(grep 확인). `satisfies readonly (keyof LimitChaserFormValues)[]` 라 `'buyWatchSide'`(:158) 를 타입에서 빼는 순간 컴파일 에러로 짚인다 → 목록 갱신(신 설정 필드 추가, `buyWatchSide` 제거).
- `defaultLimitChaserForm()`(:249-282) — D-04 기본값 추가 대상. `buyWatchSide: '0'` 삭제.
- `formFromServer(server, prev)`(:301-331) — 신필드 매핑 추가. **새 그룹 금액은 `buyOrderAmount` 와 달리 에코 0 을 그대로 쓴다**(D-03: 0 이면 「—」 + 그룹 스위치 차단. `prev` 로 메우면 클라 기본 10만원이 사용자가 고르지 않은 금액으로 둔갑한다).
- `isLimitChaserArmRejection`(:484-495) — `lc.arm` 이 sell/cancel 만 남아도 판정 로직 자체는 유지. 주석의 「36/37/38」 갱신.

#### `webapp/src/components/trading/latch-led.tsx` (340줄)
`[VERIFIED: latch-led.tsx]` `LatchLedKind = "buy" | "sell" | "cancel"` · `LatchLedTone = "off" | "latent" | "armed"` · `LatchLedLabel = "OFF" | "대기" | "감시"` · `TOOLTIPS.buy.{on, off, askSide}` · `latchLedStateOf(kind, server)` · `DOT_CLASS`(latent = `--led-latent`).
- 매수 갈래 현재 식: `!server.buyEnabled` → OFF, `server.buyWatchSide !== "1"` → armed·비클릭·`askSide` 툴팁, 그 외 `buyEntryLatched` 로 3단계.
- 바뀔 식(D-12): `!buyEnabled` → `{tone:"off", label:"OFF"}` · `postBuyPhase === 2` → `{tone:"latent", clickable:false, label:"보유중", tooltip: …}` · 그 외 `{tone:"armed", clickable:false, label:"감시"}`. `LatchLedLabel` 유니온에 `"보유중"` 추가. `TOOLTIPS.buy` 3문구 삭제, 보유중 툴팁 후보 = WinForms 원문 `후매수 보유중 — 산 물량이 전부 정리되면 다시 감시(남은 횟수 0 이면 소진)` `[CITED: gh-trade docs/strategy/limit-chaser.md §10 LED 표]`.
- 소비처 자동 추종: `card-header.tsx:307 · 322`(칩·점) · `app-sidebar.tsx:118`(라벨 텍스트 `"{이름} {label}"`) · `card-body.tsx` `cardGroupStatusOf` · `workbench-status-bar.tsx`. **`cardGroupStatusOf` 는 `tone === 'armed' ? '감시 중' : '무장 · 대기'` 로 매수 문구를 짓는다** — 보유중(latent)이 「무장 · 대기」로 잘못 읽히므로 같이 고쳐야 한다(Pitfall 13).
- 테스트: `__tests__/latch-led.test.tsx` 의 `describe("latchLedStateOf — 매수 LED (ShowBuyServerQty :1027)")`(:193~) · `describe("툴팁 원문 — 17-RESEARCH §2 의 C# 리터럴 3종")`(:259) 규칙 표 교체.

#### `webapp/src/components/trading/strategy-log.tsx` (445줄)
`[VERIFIED: strategy-log.tsx]` `StrategyTransition` 닫힌 유니온 16종(`buyLatched`·`buyUnlatched` 포함) · `TRANSITION_TEXT`/`TRANSITION_ORDER`(테스트가 두 표의 집합 동일성을 단언) · `VALUE_COMPARE_SKIP = {buyEnabled, sellEnabled, cancelQtyEnabled, cancelTradeEnabled, ...LIMIT_CHASER_SERVER_ONLY_FIELDS, crud, key, name, code}` · `RUNTIME_ONLY_SKIP = {...LIMIT_CHASER_SERVER_COUNTER_FIELDS, name, code}` · `limitChaserValuesChanged` · `isRuntimeOnlyEcho` · `strategyLogLine(prev, next, {hadOrder})` · `serverMessageLogLine`.
- D-13 반영: `buyLatched`/`buyUnlatched` 삭제 · 그룹 전이 6종 추가(예 `preBuyOn/preBuyOff/extraBuyOn/extraBuyOff/postBuyOn/postBuyOff`) · `VALUE_COMPARE_SKIP` 에 `preBuyEnabled·extraBuyEnabled·postBuyEnabled`(게이트 축) + `buy3Schema` · 신 S→C 4필드는 `SERVER_ONLY` 경유로 자동 포함(런타임).
- 「매수 무장/매수 발주 — 무장 해제」(`buyArmed`/`buyFired`/`buyDisarmed`)는 이제 **마스터 전이**다 — 마스터는 발주로 접히지 않으므로 `buyFired`(「발주」) 추론이 거의 늘 틀린다(Pitfall 11).

#### `webapp/src/components/trading/card/strategy-card.tsx` (1016줄)
`[VERIFIED: strategy-card.tsx:407-413 · 414-503 · 613-641]` 에코 처리: 키 일치 에코 = 답 신호(`acceptAnswer`) · `isRuntimeOnlyEcho` 면 무동작 · `hadOrder = cause !== null ? false : sent === null ? true : sent.buyEnabled === true` · `setFired` · 다른 단말 배너(`sent === null && limitChaserValuesChanged(prev, server)`) · `handleArm(kind)` → `send({t:"lc.arm", key, latch: kind})`(:629-641, `latchLedStateOf(...).clickable` 재확인 후). 매수 LED 가 늘 비클릭이 되면 `handleArm` 은 sell/cancel 만 보낸다(코드 변경은 타입 좁힘 정도).

#### 테스트 파일 구조(현행)
- `__tests__/limit-chaser-form.test.tsx`(88 it) — `vi.mock('@/lib/relay-provider')` 로 `send` 스텁, `echo(over)` 인라인 팩토리(RelayLimitChaser 전 필드 리터럴), `rerender(<LimitChaserForm server=… serverAnswerSeq=… />)` 로 에코 흉내, `row(id)` = `[data-lc-field="…"]`. 머리 주석의 ①~⑭ 규칙 목록이 describe 단위다(⑧ 감시대상 → 교체 대상).
- `lc/__tests__/use-lc-field-commit.test.tsx`(120 it) · `lc/__tests__/setting-group.test.tsx`(38 it, ①~⑧ describe — ⑤ `WatchTargetRow` 삭제 대상) · `lc/__tests__/inline-navigation.test.tsx` · `lc/__tests__/lc-tracer.test.tsx` · `__tests__/latch-led.test.tsx`(24) · `__tests__/strategy-log.test.tsx`(32) · `__tests__/card-body.test.tsx`(24) · `__tests__/strategy-card-flow.test.tsx`(42 — ⑲-7 등 buyWatchSide 갈래).
- **인라인 `RelayLimitChaser` 팩토리가 최소 14개 파일에 흩어져 있다**(grep `buyWatchSide:` — app-sidebar · use-lc-field-commit · lc-tracer · card-body · strategy-card-flow · card-header · strategy-badge · inline-navigation · strategy-card · strategy-log · strategy-status-card · isin-labels · strategy-log-feed · limit-chaser-form · latch-led 등). 신 필수 필드 17개를 추가하면 `pnpm --filter @gh-radar/webapp run typecheck`(tsconfig `include: src/**/*` — 테스트 포함)가 전부 깨진다 → Wave 0 에 공용 픽스처를 만들고 치환하는 것이 싸다.

---

### webapp 1 — 다필드 확정(companions) 설계

- 대상 사건: D-01(그룹 ON + 마스터 ON) · D-02(마지막 그룹 OFF + 마스터 OFF — 매도·취소도 전부 꺼져 있으면 결과적으로 `crudOf` = `'D'` 삭제가 된다 — WinForms 도 사람 해제일 때는 삭제로 보낸다(`b066e135` 사람 갈래)) · D-06/D-07(선매수 ON + 최대 6체크 + 매도가·매도비교가 0 → 상한가).
- 권장 형태: `commit(field, value, kind, companions?: Partial<LimitChaserFormValues>)` → `Pending.companions` → `sendNow` 에서 `next = { ...base, ...companions, [field]: value }` · 토글 낙관 표시·되돌림도 companions 포함 · 성공 판정은 **주 필드만**(`server[field] === value`) — 동반 필드는 서버가 부분 거부할 수 있고(예: 매도 검증 실패 → `sell_enabled=false` + ERROR 원문이 로그에 뜬다) 그것은 주 필드 실패가 아니다.
- 무장 가드: `armBlockOf(next)` 가 동반 필드를 포함해 판정한다. D-07 의 「빈 값이면 그 체크 생략」이 바로 이 가드를 통과시키기 위한 사전 조립이다(주의: D-07 의 「서버가 매도를 켜지 않으므로」는 부정확 — 서버는 `sellWatchQty` 0 으로 매도를 눕히지 않는다(§9 ② 조건에 없음). 실제로 막는 쪽은 **relay `#strategyArmable`**(`sellEnabled && sellWatchQty === 0` → 전 프레임 거부)과 웹 `canArmOf` 다. 결론(생략)은 같고, 생략하지 않으면 **선매수 ON 제출 전체가 relay 에서 거부된다**).
- 자동 체크 조립은 순수 함수로(예 `preBuyAutoChecksOf(values, upperLimit) → { companions, turnedOn: string[], skipped: string[] }`) — WinForms `AutoCheckExitForPreBuy` 의 사유 문구가 좋은 기준이다(`[VERIFIED: gh-trade client/Forms/Trading/LimitChaserForm.cs:5421-5510]` — `매도주문(매도비율 0)` · `매도주문(매도 비교가격/매도가격 0 — 상한가 미수신)` · `매도주문(매도 호가잔량 0)` · `매도>잔량추적(잔량추적 비율 0)` · `매도>체결(매도 체결수량 0)` · `취소:잔량(취소잔량 0)` · `취소:잔량(매도 비교가격 0)` · `취소>체결(매도 체결수량 0)` · `취소>잔량추적(취소잔량 0)` 등, 켠 것 `선매수 자동 체크 — 켬: …`). 웹 D-07 은 여기에 「매도 매수잔량 0 → 매도주문·잔량추적·체결 3개 생략」을 더한다. 로그 문구 확정은 UI-SPEC 몫.
- 전략 로그 한 줄(D-06)은 **전송 성공 뒤**에 남긴다(보냄 ≠ 반영 규율 — `strategy-log.tsx` 파일 머리 ① 「보냈다는 사실은 쌓지 않는다」). 성공 판정 시점(`successSeq`)에 폼이 쌓아 둔 자동 체크 요약을 한 줄로 내보내는 방식이 기존 규율과 맞다.
- `LC_GATE_FIELDS` 갱신: `preBuyEnabled` · `extraBuyEnabled` · `postBuyEnabled` 추가(미등록 전략에서 그룹 ON = D-01 로 마스터가 같이 켜지는 **등록**이다), `sweepEnabled` 는 **제거 권장**(선매수 안 체크가 됐고, 미등록에서 한방만 켜 보내면 게이트 4종 OFF → 서버가 `'D'` 로 정규화 = 존재하지 않는 키의 철거 프레임).

### webapp 2 — 금액·수량 3벌과 D-03/D-04a 경계
- 선매수: 기존 D-04a 그대로(`amountRequired` = 서버 `buyOrderAmount === 0` → 금액 외 확정 차단, 끄기는 허용).
- 추가·후매수: 에코 금액 0 → 행 「—」, **그 그룹 스위치만** 켜는 방향 차단(사유 `LC_COMMIT_TEXT.amountRequired`), 다른 행 확정 자유. 이때 cfg 의 `extraBuyOrderAmount/Qty` 는 0/0 그대로 실린다(서버 값과 같으므로 조용한 변경 없음).
- 새 전략(server 없음): 세 금액 모두 10(만원) 기본값(D-04) → 첫 등록 cfg 에 실려 에코로 돌아온다.

### webapp 3 — 사전 검증(D-10 · D-27)
- D-10: `extraBuyEnabled` 켜는 방향 ∧ `extraBuyMaxQty !== 0 ∧ extraBuyMinQty > extraBuyMaxQty` → 차단 + 행 아래 빨간 한 줄. WinForms 원문 `추가매수의 최소 잔량이 최대 잔량보다 큽니다 — 최대를 0(무제한) 으로 하거나 최소를 낮추세요.` `[CITED: limit-chaser.md §10 표]` (웹 문구는 UI-SPEC 재량).
- D-27: `postBuyEnabled` 켜는 방향 ∧ `sellOrderRatio === 0` → 차단. **단 relay zod 가 `sellOrderRatio` 를 1~100 으로 강제**하므로(`protocol.ts` `sellOrderRatio: z.number().int().min(1).max(100)`) 웹이 0 을 보낼 수는 없다 — 0 은 레거시 에코로만 들어온다(그때는 `lcRangeIssue` 가 이미 모든 확정을 막는다). 즉 D-27 차단은 사실상 「레거시 에코 0」 방어이고, 문구가 사용자를 매도비율 칸으로 안내해야 한다. WinForms 원문 `후매수는 매도비율이 필요합니다 — 매도비율을 1~100% 로 입력하세요.`
- 이 둘은 **켜는 방향에만** 건다(끄기 허용 — T-16-44). 이미 켜진 그룹의 최소/최대를 역전시키는 값 확정도 막을지는 플래너 결정(서버는 「그 그룹만 눕히고 ERROR」 — 막지 않아도 안전하나 조용한 OFF 가 된다 → 막는 쪽 권장).

### webapp 4 — 접기(D) 상태
- 접힘 state 는 폼(또는 그룹) 컴포넌트 `useState` 로 충분하고 **에코 재렌더에 초기화되지 않게** 키를 안정적으로(그룹 slot) 둔다. `LimitChaserForm` 은 `resetSeq`(삭제 시 remount)로만 초기화된다 — 그때 접힘이 기본(전부 접힘)으로 돌아가는 것은 자연스럽다.
- ★ **접힌 카드의 행은 언마운트하지 말고 CSS 로 숨길 것**을 권한다 — 폼 머리 ① 「탭은 CSS 숨김, 언마운트하지 않는다(나가 있던 확정·열린 편집기가 사라진다)」와 같은 이유. 단 숨긴 행은 `display:none` 이라 testing-library `getByRole` 에서 빠지고 e2e 에서 비가시다 → **기존 테스트·e2e 가 `lc-buy-watch-qty` 등을 바로 찾는 곳은 전부 「펼치기」 조작이 선행돼야 한다**(Pitfall 14).
- 편집 중(인라인 편집기 열림·시트 열림) 제목줄을 눌러 접으면? — 편집을 먼저 끝내거나(취소) 접기를 막는 규칙이 필요(UI-SPEC 결정 항목).

### webapp 5 — 후매수 표시
- `postBuyPhase` 원문 의미 `0 꺼짐 / 1 감시 / 2 보유중 / 3 소진` → 칩(D 스케치: `감시 중`(초록) · `보유중`(주황) · `소진`/`꺼짐`(중립)). 주의: 소진이면 에코 `postBuyEnabled` 가 **false** 로 접혀 오고 단계는 3 이다 — 스위치 OFF + 칩 「소진」 + 안내 한 줄이 동시에 서야 한다.
- 「최대」 행 = `{post_buy_reentry}회 · 남은 {post_buy_reentry_left}회`(단계 0 이면 설정만). 편집·제출은 설정값(`postBuyReentry`)만.
- 「발동잔량」 = `post_buy_trigger_qty`, 0 이면 「—」, 값이 있으면 빨강. WinForms 는 0 이면 **빈 회색 칸**(「—」 없음)이지만 웹 CONTEXT 는 「—」로 확정.
- D-15: `postBuyPhase === 2` 동안 매도주문·매수취소 카드 상태 문구 꼬리 「· 후매수 발동」 — `cardGroupStatusOf` 확장.

### webapp 6 — 상태 문구(`cardGroupStatusOf`)
`[VERIFIED: card/card-body.tsx:107-142]` 현재 반환 `CardGroupStatus { buy, sweep, sell, cancel }`. 필요한 것: `buy`(마스터 — D-02 「세 그룹 OFF · 마스터 ON」 중립 문구, 재량) · `preBuy` · `extraBuy`(포기 = `extraBuyAbandoned`) · `postBuy`(단계) · `sell`/`cancel` 에 D-15 꼬리. `sweep` 키는 한방이 체크가 되면 불필요. `fired` 인자(발주 완료 · 무장 해제)는 마스터가 발주로 접히지 않으므로 의미를 잃는다(Pitfall 11).

### Anti-Patterns to Avoid
- **새 확정 훅을 만들기**: 거부/타임아웃/고아 장벽/대기열/늦은 에코 판정이 20-REVIEW 여러 라운드를 거친 코드다. companions 확장으로 끝낸다.
- **에코를 받아 자동 제출**(마스터 OFF 등): D-02 후반 · D-08 · 정적 게이트 규율 위반.
- **S→C 값 되보내기**: `postBuyReentryLeft` 를 「최대」 칸 값으로 제출 — WinForms 는 칸에 잔여를 쓰지만 웹 D-11 은 설정값을 제출한다. 둘을 섞지 말 것.
- **서버 문구 파싱**: `isLimitChaserSetRejection` 은 `m` 을 읽지 않는다 — 신 거부 문구도 파싱해 필드에 매핑하려 하지 말 것(D-13).
- **뷰포트 브레이크포인트 신설**: 접힘/요약 줄도 `@min-[700px]/lc:` 등 컨테이너 쿼리만(globals.css §2.2b 정본).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 생성 코드 갱신 | 손으로 `set-limit-chaser.ts` 에 접근자 추가 | `server/scripts/sync-relay-schema.sh` | 슬롯 인덱스(47~63)·기본값을 flatc 가 보장. 손편집은 다음 동기화에 소실 |
| 테이블 조립 | `createSetLimitChaser(…64 인자…)` | 이름 있는 `addXxx` | 위치 인자는 한 칸 밀려도 컴파일된다(T-16-05) |
| 다필드 전송 | 새 전송 경로·새 상태 기계 | `useLcFieldCommit` + companions | 직렬화·거부 판정·고아 장벽 재구현 = 회귀 위험 |
| 금액→수량 | 그룹별 식 3벌 | `buyOrderQtyFromAmount` 1개 | 역산 금지·유일 지점 규율 |
| 무장 판정 | 컴포넌트마다 조건문 | `canArmOf` ↔ relay `#strategyArmable` 동형 | 첫 관문·마지막 관문이 갈리면 「지운 줄 알았는데 남는」 류 결함 |
| LED/칩/로그 판정 | 렌더 안 조건 | `latchLedStateOf` · `cardGroupStatusOf` · `strategyLogLine` 순수 함수 | 판정 지점 하나 · 테스트 가능 |
| 게이트웨이 요청 디코드(테스트) | 테스트마다 수동 flatbuffers 읽기 | `fake-gateway.ts` 에 `readSetLimitChaserRequest` 1개 신설 | `readViSetRequest` 선례. e2e·통합이 같은 디코더 |
| 픽스처 | 14개 파일 인라인 팩토리에 17필드씩 | 공용 `makeLimitChaser(over)` | 필드 추가가 한 곳 변경으로 끝난다 |

**Key insight:** 이 phase 의 난이도는 새 UI 가 아니라 **이미 있는 안전장치(무장 가드·범위 가드·에코 판정·로그 skip)를 새 필드에 빠짐없이 넓히는 것**이다. 한 곳이라도 빠지면 「소켓 종료」「조용한 거부」「가짜 다른 단말 배너」로 돌아온다.

## Runtime State Inventory

> 이 phase 는 와이어 스키마 이행(migration)이다.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | gh-trade `log/strategy_state.toml`(KB 120 서버) — 구파일의 `buy_watch_side` 키. 새 서버는 읽기만 하고(`pre_buy_enabled` 키 없는 구파일 폴백) 쓰지 않는다(`StrategyStateStore.h:390 · 709-723`). gh-radar DB(Supabase)에는 상따 설정이 저장되지 않는다(relay hub 는 메모리 캐시) — `dma_journal*` 은 주문 기록뿐(`relay/src/journal/types.ts`) | **D-14 추출은 gh-trade 24-12 재기동 전에**(F-3). gh-radar 쪽 데이터 이행 없음 |
| Live service config | relay 컨테이너(GCE `radar-gw`, `scripts/deploy-relay.sh`) — 새 이미지로 교체. `DMA_HOST` 는 무주입 보존(deploy-relay.sh 머리 주석 「명시 주입 > 실행 중인 컨테이너 값 보존 > 127.0.0.1」). Vercel webapp — push 가 곧 배포 | relay 배포(20:00 KST 이후) → smoke → push. 롤백 `bash scripts/deploy-relay.sh --rollback <이미지 태그>` |
| OS-registered state | 없음 — relay 는 Docker restart 정책만, 새 등록 없음(deploy 스크립트 확인) | None |
| Secrets/env vars | 없음 — 새 비밀·env 키 없음. 컨테이너 비밀 4종(`deploy-relay.sh` 머리) 무변경 | None |
| Build artifacts | ① `packages/shared/dist`(git 비추적 — 로컬·CI 빌드 필수) ② relay Docker 이미지 태그(롤백 대상 기록) ③ **이미 열려 있는 브라우저 탭 · 네이티브 앱 WebView 의 옛 JS 번들**(새로고침 전까지 구 계약으로 `lc.set`/`lc.arm buy` 를 보낸다 — F-4) ④ `relay/src/generated/StockDMA.fbs` 사본 SYNC MARKER(`server-repo-commit` → `59bf77aa` 예상) | ①② 빌드·배포 절차에 포함 ③ relay 관용 처리(Pitfall 3) + 배포 후 사용자에게 앱/탭 새로고침 안내 ④ 재생성으로 자동 |

## Common Pitfalls

### Pitfall 1: 재생성 커밋 단독으로는 빌드가 깨진다
**What goes wrong:** `buyEntryLatched()`/`addBuyEntryLatched` 소멸로 `envelope.ts:2061` · `frames.ts:720` 컴파일 실패.
**How to avoid:** 재생성 + 두 사용처 + shared 타입 제거를 한 태스크로. 태스크 검증에 `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && … typecheck:tests`.
**Warning signs:** `Property 'buyEntryLatched' does not exist on type 'SetLimitChaser'`.

### Pitfall 2: 기본값 필드는 버퍼에 없다 — 「부재」 단언은 vtable 로
**What goes wrong:** `addFieldInt8(voffset, value, defaultValue)` 는 `value != defaultValue` 일 때만 쓴다(`[VERIFIED: relay/node_modules/flatbuffers/mjs/builder.js:176-181]` 「`if (this.force_defaults || value != defaultValue) { this.addInt8(value); this.slot(voffset); }`」). 그래서 `pre_buy_enabled=false` 를 싣는 것과 안 싣는 것은 **같은 바이트**이고, S→C 4필드 「미전송」을 접근자(`postBuyPhase() === 0`)로만 단언하면 「실었지만 0」과 구분되지 않는다.
**How to avoid:** 부재 단언은 `bb.__offset(bb_pos, 112/126/128/130) === 0`(vtable 슬롯 없음)으로. `buy_watch_side` 부재는 `t.buyWatchSide() === null` 로 충분(문자열은 기본값이 없다). `buy3_schema=1` 은 기본값(0)과 달라 반드시 기록된다.
**Warning signs:** 「미전송」 테스트가 빌더에 `addPostBuyPhase(b, 0)` 를 넣어도 통과한다.

### Pitfall 3: relay 배포 뒤 구 탭·앱 WebView 가 소켓을 죽인다
**What goes wrong:** F-4. 신필드 필수 스키마 · `latch` enum 에서 `"buy"` 삭제 → 구 클라 프레임마다 `ws.close(BAD_MESSAGE)`.
**How to avoid:** 신필드 `.optional()` + fanout 에서 부재 시 거부 프레임(소켓 유지) · `lc.arm latch:"buy"` 는 스키마 관용 + 거부 프레임. 거부 프레임 문구는 「새로고침」 안내. 통합 테스트로 「구 형태 `lc.set` → 게이트웨이 수신 0 + 거부 프레임 1 + 소켓 OPEN」을 단언.
**Warning signs:** relay 로그 `[WS] 프로토콜 위반 — 연결 종료` 급증.

### Pitfall 4: 레거시 에코 `postBuyReboundPct = 0` 이 모든 확정을 막는다
**What goes wrong:** Phase 24 전에 등록된 전략의 에코는 신필드가 전부 0 이다(부재 → 기본값). relay 스키마를 `min(1)` 로 두면 소켓 종료, 웹 `lcRangeIssue` 에 range {1,100} 을 두면 **그 전략의 모든 필드 확정이 「반등 · 1% 이상」으로 막힌다**(lcRangeIssue 는 cfg 전체를 본다 — `lc-fields.ts:281-293`).
**How to avoid:** relay: 0~100 + `postBuyEnabled ⇒ 1~100`. 웹: `postBuyReboundPct` 의 1~100 은 「후매수 켜는 방향」 사전 검증과 시트 입력 범위에만 두고, `lcRangeIssue`(전 cfg 방어선)에는 0~100 으로. 같은 이유로 `postBuyReentry` 0 허용.
**Warning signs:** 레거시 전략에서 비교가격 하나 고쳐도 「반등」 범위 오류.

### Pitfall 5: `#strategyArmable` 가 선매수 수량으로 전체를 거부한다
relay 4 참고. 웹 `canArmOf` 와 **같은 커밋**에서 그룹별로 바꾼다. 테스트: 「마스터 ON · 후매수만 ON · 선매수 금액 0 → 게이트웨이 도달」.

### Pitfall 6: S→C 값이 cfg 로 새어 나간다
**What goes wrong:** `LimitChaserFormValues` 가 `RelayLimitChaserInput` 에서 파생되므로, shared 에서 신 S→C 필드를 `SERVER_ONLY` 에 넣지 않으면 폼 타입·`formFromServer`·cfg 로 흘러 **되보내진다**. 서버는 읽지 않지만(§9-2 ⑦) 「왕복하는 값」 착각 + 에코-폼 비교 오염(Pitfall 6 원 규율).
**How to avoid:** 4필드를 `LIMIT_CHASER_SERVER_*` 에 넣어 Omit 이 자동으로 빼게. 빌더 테스트에서 vtable 부재 단언.

### Pitfall 7: `buyWatchSide` 는 타입에서 지워도 구 탭은 보낸다
Input 에서 Omit 하고 zod 에서 키를 빼면 `z.object` 가 떨어뜨린다(무해). 빌더에 `addBuyWatchSide` 가 남아 있지 않은지만 단언하면 된다.

### Pitfall 8: 발동 override 에코가 「다른 단말에서 변경됐어요」로 뜬다
**What goes wrong:** 후매수 발동 에코는 `sellWatchQty`·`cancelWatchQty`(= 발동잔량)·`sellWatchPrice`·`sellOrderPrice`(0 이었으면 상한가)를 바꾼다. 이 필드들은 `VALUE_COMPARE_SKIP` 밖이라 `limitChaserValuesChanged` 가 true → `sent === null` 이면 카드가 배너 + 로그 「다른 단말에서 변경됐어요」, 로그에 「서버 반영 완료」도 붙는다.
**How to avoid:** `prev.postBuyPhase !== 2 && next.postBuyPhase === 2`(발동 전이) 에코는 override 필드 변화를 서버 발동으로 귀속(배너·valuesApplied 생략). 서버 사유 줄 `후매수 — 매수1잔량 N > 발동잔량 T` 가 이미 말한다(D-13 중복 합성 금지와도 합치). 재진입(2→1)에서 cfg 로 되돌아가는 에코도 같은 처리.
**Warning signs:** UAT C-4 에서 배너가 뜬다.

### Pitfall 9: 「최대」 제출값과 WinForms 의 잔여 되싣기
**What goes wrong:** WinForms 는 단계 ≠ 0 이면 칸에 **잔여**를 쓰고 재제출에 잔여를 `post_buy_reentry` 로 싣는다(`limit-chaser.md` §10 「「최대」 칸 = 기준선 칸 규약」). 웹 D-11 은 **설정값**을 싣는다. 결과: ① 웹 ON→ON 재제출은 서버 잔여를 건드리지 않는다(`reentryChanged` false — 안전) ② 사람이 후매수를 껐다 켜면 WinForms 는 잔여부터 이어 세고 웹은 설정값으로 **다시 센다**(서버 규칙상 OFF→ON = 잔여 ← 제출값) ③ WinForms 가 같은 전략을 재제출하면 cfg `post_buy_reentry` 가 잔여값으로 바뀌어 웹의 「설정」 표시도 그 값이 된다.
**How to avoid:** D-11 은 사용자 확정이므로 그대로 구현하되 ②를 UI-SPEC 안내 문구·Open Question 2 로 사용자 확인. ON→ON 에서 웹이 에코 `postBuyReentry` 를 그대로 싣는지 테스트로 고정.

### Pitfall 10: 소진 상태의 세 신호가 한 번에 서야 한다
에코: `postBuyEnabled=false`(D-31 접힘) · `postBuyPhase=3` · `postBuyReentryLeft=0`. 스위치만 보면 「꺼짐」, 단계만 보면 「소진」. 칩은 단계로, 스위치는 에코로, 안내 한 줄은 단계 3 일 때. 다시 켜면 OFF→ON 이라 설정값부터 센다(웹 D-11).

### Pitfall 11: `hadOrder`/`fired`/`buyFired` 가 마스터에서 거짓말을 한다
**What goes wrong:** `strategy-card.tsx` 는 매수 게이트가 꺼진 이유를 「내 요청에 `buyEnabled:false` 가 있었나」로만 가른다(`hadOrder = … sent === null ? true : …`). 이제 마스터는 발주로 접히지 않으므로, 마스터 OFF 에코의 원인은 사람(다른 단말 · WinForms `b066e135` 자동 끔)·15:40·킬 스위치뿐이다 — 그런데 `sent === null` 이면 「매수 발주 — 무장 해제」 로그 + `fired` 배지(「발주됨」)가 선다.
**How to avoid:** 마스터 전이는 「매수주문 꺼짐/켜짐」으로만 쓰고 `buyFired` 추론을 마스터에서 떼어낸다. 발주 사실은 서버 사유 줄(`[상따] … 매수 N주 @…`)이 말한다. My page 배지(`strategyBadgesOf` — `hadOrder` 시 `fired`)는 CONTEXT 「배지 무변경」이지만 입력(`fired`)이 바뀌므로 결과가 달라진다 — 플래너가 `fired` 를 어떻게 세울지(그룹 접힘 기준으로 옮기거나 폐기) 정해야 한다.

### Pitfall 12: 키패드 `'회'` 단위는 0 을 거부한다
**What goes wrong:** `padIssue` 의 `if (unit === '회') { if (v < 1) return '1회 이상 입력해 주세요'; … }`(`[VERIFIED: webapp/src/lib/numpad.ts:223-228]`)는 수동주문 조각 수 규칙이다. 후매수 「최대」에 `'회'` 를 그대로 쓰면 D-30 의 유효값 0 을 넣을 수 없다. `LcUnit` 도 `'회'` 를 뺀다.
**How to avoid:** `'회'` 의 `v < 1` 규칙을 `ctx.maxPieces !== undefined` 일 때만 적용하도록 좁히거나, 상따 전용 단위를 둔다(재량). 칩 `회: [set(1), set(3), set(5), set(10)]` 은 그대로 써도 무방.

### Pitfall 13: `cardGroupStatusOf` 가 보유중을 「무장 · 대기」로 읽는다
`stage = latchLedStateOf(kind, led).tone === 'armed' ? '감시 중' : '무장 · 대기'` — 매수 LED 가 latent(보유중)가 되면 매수 상태 문구가 「무장 · 대기」가 된다. 새 규칙으로 교체.

### Pitfall 14: 「기본 전부 접힘」이 기존 테스트·e2e 를 대량으로 깬다
`lc-buy-watch-qty`(→ 선매수 「매도잔량」)·`lc-sweep-*` 를 바로 찾는 vitest(`limit-chaser-form.test.tsx` 등)·e2e(`trading-workbench.spec.ts:229 · 467-468 · 756-792 · 873 · 1001 · 2399` 등)가 접힌 카드 뒤로 숨는다. 테스트 헬퍼에 「그룹 펼치기」를 두고, e2e 폭 측정(P20-3, `:2267-2320`)은 펼친 상태에서 신 행(최악값 「999,999,999주」·「3회 · 남은 3회」·「3건 @1,274,000원」)을 포함해 다시 잰다.

### Pitfall 15: D-02 의 「마스터 끔」이 삭제가 될 수 있다
마지막 그룹 OFF + 마스터 OFF 에서 매도·취소 게이트까지 꺼져 있으면 `crudOf` = `'D'` → 서버 삭제. WinForms 도 사람 해제는 삭제로 보낸다(서버 접힘 경로만 삭제를 피함). 의도된 동작이지만 테스트로 고정하고, 삭제 후 폼 remount(`resetSeq`) 경로가 도는지 확인.

### Pitfall 16: 매도비율 0 · 잔량추적 비율 0 레거시 에코
`sellOrderRatio`/`sellQtyTrackRatio` 는 이미 relay zod 1~100/1~90 이라 레거시 0 이면 `lcRangeIssue` 가 모든 확정을 막는다(기존 동작 — 새 결함 아님). D-27 사전 검증 문구가 그 상황을 안내하게 두면 된다.

## Code Examples

### 1. relay 빌더 — 신필드 조립 (권장 골격)
```typescript
// Source: relay/src/dma/envelope.ts 현행 패턴(:1223-1265) + 재생성 빌더 이름(스크래치 flatc 산출물 확인)
export const LC_FIXED_BUY3_SCHEMA = 1; // 신 클라 판정 정본(gh-trade D-24) — 입력으로 받지 않는다

// … 문자열은 테이블 열기 전에(buyWatchSideOff 는 더 만들지 않는다)
SetLimitChaser.startSetLimitChaser(b);
// … 기존 addXxx 들(addBuyWatchSide 줄 삭제) …
SetLimitChaser.addBuy3Schema(b, LC_FIXED_BUY3_SCHEMA);
SetLimitChaser.addPreBuyEnabled(b, cfg.preBuyEnabled);
SetLimitChaser.addExtraBuyEnabled(b, cfg.extraBuyEnabled);
SetLimitChaser.addExtraBuyMinQty(b, toWireUint(cfg.extraBuyMinQty, "extraBuyMinQty"));
SetLimitChaser.addExtraBuyMaxQty(b, toWireUint(cfg.extraBuyMaxQty, "extraBuyMaxQty"));
SetLimitChaser.addExtraBuyOrderAmount(b, toWireUint(cfg.extraBuyOrderAmount, "extraBuyOrderAmount"));
SetLimitChaser.addExtraBuyOrderQty(b, toWireUint(cfg.extraBuyOrderQty, "extraBuyOrderQty"));
// extra_buy_abandoned — S→C 전용. 싣지 않는다.
SetLimitChaser.addPostBuyEnabled(b, cfg.postBuyEnabled);
SetLimitChaser.addPostBuyReboundPct(b, toWireUByte(cfg.postBuyReboundPct, "postBuyReboundPct"));
SetLimitChaser.addPostBuyFloorQty(b, toWireUint(cfg.postBuyFloorQty, "postBuyFloorQty"));
SetLimitChaser.addPostBuyReentry(b, toWireUByte(cfg.postBuyReentry, "postBuyReentry"));
SetLimitChaser.addPostBuyOrderAmount(b, toWireUint(cfg.postBuyOrderAmount, "postBuyOrderAmount"));
SetLimitChaser.addPostBuyOrderQty(b, toWireUint(cfg.postBuyOrderQty, "postBuyOrderQty"));
// post_buy_trigger_qty · post_buy_reentry_left · post_buy_phase — S→C 전용. 싣지 않는다.
const table = SetLimitChaser.endSetLimitChaser(b);
```

### 2. 빌더 부재 단언 (테스트)
```typescript
// Source: flatbuffers builder.js:176-181 (기본값이면 슬롯을 쓰지 않는다) — 부재는 vtable 로 본다
const t = readLc(lcInput());
expect(t.buy3Schema()).toBe(1);
expect(t.buyWatchSide()).toBeNull();                 // 문자열 슬롯 부재
const slotAbsent = (vt: number) => (t as any).bb.__offset((t as any).bb_pos, vt) === 0;
for (const vt of [112, 126, 128, 130]) expect(slotAbsent(vt)).toBe(true); // S→C 4필드
```

### 3. 확정 훅 companions (골격)
```typescript
// Source: use-lc-field-commit.ts:177-183 · 312-357 현행 구조의 최소 확장
interface Pending {
  field: LcFieldKey;
  value: unknown;
  kind: LcCommitKind;
  prevValue: unknown;
  /** 같은 lc.set 에 함께 실을 필드(D-01 마스터 · D-06 자동 체크). 성공 판정은 주 필드만. */
  companions?: Partial<LimitChaserFormValues>;
  /** 되돌림용 — companions 키들의 확정 직전 값. */
  prevCompanions?: Partial<LimitChaserFormValues>;
}
// sendNow:  const next = { ...base, ...(p.companions ?? {}), [p.field]: p.value };
// showToggle 낙관 표시·되돌림은 companions 까지 함께.
```

### 4. 선매수 자동 체크 조립 (순수 함수 골격)
```typescript
// Source: gh-trade LimitChaserForm.cs AutoCheckExitForPreBuy(:5421-) 동형 + 웹 D-07(매도 매수잔량 0 → 3개 생략)
export function preBuyAutoChecksOf(v: LimitChaserFormValues, upper: number) {
  const c: Partial<LimitChaserFormValues> = {};
  const on: string[] = []; const skipped: string[] = [];
  const sellWatchPrice = v.sellWatchPrice || upper;   // 0 → 상한가(모르면 0 그대로)
  const sellOrderPrice = v.sellOrderPrice || upper;
  if (sellWatchPrice !== v.sellWatchPrice) c.sellWatchPrice = sellWatchPrice;
  if (sellOrderPrice !== v.sellOrderPrice) c.sellOrderPrice = sellOrderPrice;
  const sellQtyOk = v.sellWatchQty > 0;               // 웹 D-07
  // 매도주문 · 매도>잔량추적 · 매도>체결 · 취소:잔량 · 취소>체결 · 취소>잔량추적 — 이미 켜진 것은 건드리지 않는다
  // … 사유 문구는 UI-SPEC 확정 …
  return { companions: c, turnedOn: on, skipped };
}
```

### 5. 매수 LED (D-12)
```typescript
// Source: latch-led.tsx 현행 latchLedStateOf 매수 갈래 교체
if (!server.buyEnabled) return OFF_STATE;
if (server.postBuyPhase === 2) {
  return { tone: "latent", clickable: false, label: "보유중", tooltip: BUY_HOLDING_TOOLTIP };
}
return { tone: "armed", clickable: false, label: "감시", tooltip: null };
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 매수 = 단일 게이트 + 감시대상 라디오(`buy_watch_side` 0/1) | 마스터 `buy_enabled` + 선·추가·후매수 3게이트 | gh-trade Phase 24 (2026-09-26~27) | 폼·LED·로그·무장 가드 재구성 |
| 매수 진입 래치 3단계 + `lc.arm buy`(38) | 삭제(D-25), 38 봉인·수신 시 ERROR | 같음 | 매수 LED 클릭 불가 |
| 에코 `buy_enabled` 가 발주로 접힘 | 마스터는 접히지 않음, 선·추가매수 그룹이 접힘 | 같음 | `hadOrder`/`fired` 추론 재설계 |
| `buy3_schema` 부재 = 유일한 클라 | 부재(0) = 구 클라 → 「선매수만」, side "1" 은 거부(D-28) | 같음 | relay 가 1 을 싣기 전까지 웹은 구 클라 |

**Deprecated/outdated:**
- `RelayLimitChaser.buyEntryLatched`, `RelayLcArmMsg.latch "buy"`, `MSG.ArmBuyLatchReq`, `toWireWatchSide`, `WatchTargetRow`, `LcRowSpec kind 'watch'`, `TRANSITION buyLatched/buyUnlatched`, 매수 LED 툴팁 3종.
- `buy_watch_side` 슬롯 자체는 gh-radar 배포 뒤 gh-trade 가 봉인한다(D-28 ③ 후속) — 그때 `buyWatchSide()` 접근자도 사라지므로 relay 파서의 `buyWatchSide` 줄은 **다음 재동기화에서 또 지워야 한다**(지금 `RelayLimitChaser.buyWatchSide` 를 남긴다면).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 구 탭 관용은 「신필드 optional + 거부 프레임」이 최선이다(레거시 중계보다) | relay 6 · Pitfall 3 | 사용자가 레거시 중계를 원하면 relay 빌더에 분기 추가 |
| A2 | 한방(sweep) 무장 가드를 선매수 ON 일 때만 걸어도 안전하다 | relay 4 | 서버가 선매수 OFF 에서도 sweep 을 평가한다면(문서상 아님) 가드 누락 — 현 문서 §5-1 은 선매수 게이트 전제 |
| A3 | 웹 e2e 외에, gh-trade mock 서버(VM `cloud-verify.sh serve`)에 로컬 relay(`DMA_HOST=<VM> ./dev.sh --with-relay`)를 붙여 `inject_b6.py` 로 웹 UAT 를 할 수 있다 | Validation · UAT | mock 의 `users.toml` 계정과 relay 가 Supabase `dma_credentials` 로 보내는 로그인 id 가 달라 로그인/계좌 선언이 안 될 수 있다 — 사전 확인 필요 |
| A4 | 발동 전이(단계 →2) 에코를 override 귀속으로 처리하면 사용자가 원하는 로그 모양이 된다 | Pitfall 8 | 사용자가 매도·취소 값 변화 로그를 원할 수도 — UI-SPEC 확인 |
| A5 | 레거시 전략의 신필드 에코는 전부 0/false 다(서버가 구파일 폴백으로 `preBuyEnabled` 만 채움) | Pitfall 4 | 서버가 다른 기본값을 채운다면 범위 문제가 사라질 뿐(안전 방향) |

## Open Questions

1. **D-14 추출을 누가·언제·어떻게 하나 (F-3)**
   - What we know: 새 서버는 `buy_watch_side` 를 에코·열거·저장 어디에도 내지 않는다. 재기동 WARN 은 「매수 켜진 side 1」만 남긴다. relay 에는 전략 덤프 엔드포인트가 없다(`/healthz` 뿐).
   - What's unclear: 24-12 재기동 전 추출 담당(gh-trade 세션 vs gh-radar).
   - Recommendation: gh-trade 세션에 **24-12 재기동 전** `log/strategy_state.toml` 에서 `type='L'` ∧ `buy_watch_side = "1"` 항목 목록(종목·계좌·거래소·buy_enabled)을 읽기 전용으로 뽑아 달라고 SendMessage 로 요청(계좌 마스킹). 대안: 재기동 전 사용자가 웹 화면에서 감시대상 토글 「매수잔량」인 전략을 직접 확인. D-14 문구 「relay 배포 직전 열거(64)」를 「gh-trade 재기동 전」으로 정정하는 것을 사용자에게 확인.

2. **후매수 껐다 켜기 = 설정값부터 다시 세기(웹) vs 잔여 이어 세기(WinForms)** (Pitfall 9)
   - Recommendation: D-11 대로 구현하고 UI-SPEC 안내에 명시. 사용자가 WinForms 동형을 원하면 OFF→ON 제출 시 「단계 ≠ 0 이던 직전 에코의 잔여」를 싣는 예외가 필요(결정 번복 사안이라 플래너가 임의로 하지 말 것).

3. **WinForms 의 에코 경로 마스터 자동 끔(`b066e135`)을 사용자에게 알릴지** (F-2)
   - Recommendation: 결정 번복 아님 — 「두 클라 동작 차이」로 SUMMARY/UAT 에 기록. 웹 로그가 그 에코를 「발주」로 오표시하지 않게 Pitfall 11 처리.

4. **구 탭 거부 프레임 문구·방식** (Pitfall 3) — UI-SPEC 에서 문구 확정, relay 는 방식(A1)만.

5. **한방 행 모양** — 스케치 D 는 「☐한방 3건 @12,990원」 한 행이지만 값 필드가 둘(`sweepMinTickCount` 건 · `sweepWatchPrice` 원)이다. 한 행에 값 버튼 둘 vs 두 행(체크 행 + 「한방 가격」 행). UI-SPEC 결정 항목.

6. **접힌 카드에서 편집 중일 때 접기** — 편집 취소 후 접기 / 접기 금지. UI-SPEC 결정 항목.

7. **웹 UAT 경로** (A3) — 자동은 Playwright(가짜 게이트웨이)로 충분히 덮고, 실서버 흐름(발동잔량 변화·재진입)은 gh-trade VM mock + 로컬 relay 로 가능한지 계획 단계에서 relay/README 「mock 게이트웨이 기동」 절과 대조해 확인.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| flatc | relay 재생성 | ✓ | 25.12.19(고정값과 일치) | — |
| gh-trade worktree(phase-24) | 재생성 정본 | ✓ | 팁 `b066e135` | — |
| Node | relay/webapp | ✓ | v22.22.0 (relay engines `>=22`) | — |
| pnpm | 워크스페이스 | ✓ | 11.15.1 | — |
| python3 | gh-trade 주입기(`inject_b6.py`·`inject_m4.py`) — VM 에서 실행 | ✓(로컬) | 3.14.2 | 주입기는 VM 위에서 돈다(TTL 0 · 맥에서 쏘면 닿지 않음 — cloud-uat ⑥ 전제 5) |
| gcloud / IAP SSH | relay 배포 | 미확인(이번 세션 비실행) | — | 메모리 「gh-radar Deployer SA」 키 경로 사용 |
| gh-trade mock 서버(VM `cloud-verify.sh serve`) | 선택적 웹 실기 UAT | 미확인 | — | Playwright 가짜 게이트웨이 |

**기준선 실측** `[VERIFIED: 이번 세션 실행]`: relay `pnpm --filter @gh-radar/relay run test` → **28 files / 630 tests passed (6.2s)**. webapp 상따 관련 `vitest --run src/components/trading src/lib/__tests__/limit-chaser.test.ts` → **33 files / 1110 tests passed (21s)**.

**Missing dependencies with no fallback:** 없음.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4 (relay: node · webapp: jsdom + @testing-library/react) · Playwright(webapp e2e — 진짜 relay + 가짜 게이트웨이) |
| Config file | `relay/vitest.config.ts` · `webapp/vitest.config.ts`(include `src/**/*.test.{ts,tsx}`) · `webapp/playwright.config.ts` |
| Quick run command | `pnpm --filter @gh-radar/relay run test -- src/dma/__tests__/envelope.test.ts` / `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/lc src/components/trading/__tests__/limit-chaser-form.test.tsx` |
| Full suite command | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck` (build_command) + `pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test` (test_command) |
| E2E | `pnpm --filter @gh-radar/webapp run test:e2e -- e2e/specs/trading-workbench.spec.ts`(3100 포트·8090 relay — 단일 워커) |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| relay ① | 재생성물 == flatc 출력 | 스크립트 | `…/server/scripts/sync-relay-schema.sh --check` → 「신규/변경 예정 : 0 개」·「.fbs 사본 : 최신」 | ✅ 스크립트 |
| relay ② | 빌더: `buy3Schema()===1` · 신 C→S 12필드 왕복 · `buyWatchSide()===null` · vtable 112/126/128/130 부재 | unit | `pnpm --filter @gh-radar/relay run test -- src/dma/__tests__/envelope.test.ts` | ✅ 파일(케이스 추가) |
| relay ② | 38 조립 불가(타입) · `lc.arm buy` → 게이트웨이 0 · 거부 프레임 · 소켓 유지 | integration | `pnpm --filter @gh-radar/relay run test -- tests/ws-latch.test.ts` | ✅(갱신) |
| relay ② | 구 형태 `lc.set`(신필드 없음) → 게이트웨이 0 · 거부 프레임 · 소켓 OPEN | integration | `… -- tests/fanout.test.ts` | ✅(케이스 추가) |
| relay ② | `#strategyArmable` 그룹별(후매수만 ON + 선매수 수량 0 → 통과 / 추가매수 ON + 수량 0 → 거부) | integration | `… -- tests/fanout.test.ts` | ✅(갱신) |
| relay ③ | 에코 파싱: 신 17필드(−1) · 발동 override(sell/cancel 값) · 소진 접힘(`postBuyEnabled=false ∧ phase 3`) · 부재 `buyWatchSide` → "0" · 키 수 56 | unit | `… -- src/dma/__tests__/envelope.test.ts` | ✅(갱신) |
| relay ③ | 64 목록 원소도 같은 파서(신필드 포함) | unit | 같음(`buildLimitChaserListRespFrame`) | ✅ |
| relay 스키마 | `postBuyReboundPct` 0 허용 · `postBuyEnabled ∧ 0` 거부 · `postBuyReentry` 0~255 | unit | `… -- src/ws/__tests__/protocol.test.ts tests/protocol.test.ts` | ✅(케이스 추가) |
| webapp ⑤ | 3그룹 렌더(슬롯·제목·스위치 라벨) · 기본 전부 접힘 · 요약 줄 전량 · 제목줄 클릭 = 접기(스위치 제외) · 에코 재렌더에 접힘 유지 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/limit-chaser-form.test.tsx src/components/trading/lc/__tests__/setting-group.test.tsx` | ✅(대폭 갱신) |
| webapp D-01/D-02 | 그룹 ON → cfg `buyEnabled:true` 동반 1회 전송 · 마지막 그룹 OFF → 마스터 OFF 동반(삭제 경로 포함) · 에코로 세 그룹 OFF → 전송 0 | unit | 같은 파일 + `lc/__tests__/use-lc-field-commit.test.tsx` | ✅(케이스 추가) |
| webapp ⑦ | 선매수 ON 자동 체크: 켤 것/생략할 것(매도 매수잔량 0 → 3개 생략 · 취소잔량 0 · 체결수량 0 · 상한가 채움 · 상한가 모름) · 에코·재접속 트리거 0 · 끄기는 6체크 유지 | unit | 순수 함수 테스트 + 폼 테스트 | ❌ Wave 0(신 순수 함수) |
| webapp ⑦ | 사전 검증 D-10 · D-27 · D-03 금액 0 그룹 스위치만 차단 | unit | 폼 테스트 | ✅(케이스 추가) |
| webapp ⑥ | 후매수 칩 0/1/2/3 · 「최대」 「3회 · 남은 2회」 · 발동잔량 「—」/빨강 · 소진 안내 · ON→ON cfg `postBuyReentry` = 에코 설정값 | unit | 폼 + `lc-fields` 테스트 | ✅(추가) |
| webapp ⑧ | LED: OFF/감시/보유중, 클릭 불가, 툴팁 | unit | `vitest --run src/components/trading/__tests__/latch-led.test.tsx` | ✅(규칙 표 교체) |
| webapp ⑨ | 로그: 그룹 전이 6종 · 마스터 동반 문구 · 런타임 4필드 무로그 · 발동 override 에코에 배너 없음 · 서버 원문 표시 | unit | `vitest --run src/components/trading/__tests__/strategy-log.test.tsx src/components/trading/__tests__/strategy-card-flow.test.tsx` | ✅(갱신) |
| webapp ⑩ | 꺼진 그룹 행 흐림(`opacity-45`)·편집 가능 | unit | setting-group 테스트 ② | ✅ |
| webapp D-09 | 라벨 개명(매도 「주문가격·비교가격·매수잔량」 · 취소 「매수잔량」) · 접근성 이름 구분 | unit + e2e | 폼 테스트 · `trading-workbench.spec.ts` · `a11y.spec.ts` | ✅(갱신) |
| e2e | 가짜 게이트웨이가 받은 SetLimitChaserReq 디코드: `buy3_schema=1`, 그룹·마스터 동반 | e2e | `pnpm --filter @gh-radar/webapp run test:e2e -- e2e/specs/trading-workbench.spec.ts` | ❌ Wave 0(`readSetLimitChaserRequest` 디코더) |
| e2e 폭 | 폰 390·768·1280 에서 신 행 최악값 넘침 0 (P20-3 확장) | e2e | 같음 | ✅(갱신) |
| 배포 후 | relay healthz · 실세션 lc.snap 수신 · (가능하면) 실전략 1건 확정 에코 | manual/smoke | `bash scripts/smoke-relay.sh` | ✅ |

### Sampling Rate
- **Per task commit:** 해당 패키지 quick run + 그 패키지 typecheck.
- **Per wave merge:** build_command + test_command 전체.
- **Phase gate:** 전체 + Playwright `trading-workbench.spec.ts` · `a11y.spec.ts` 초록 → `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `webapp/src/test-fixtures/limit-chaser.ts`(이름 재량) — `makeLimitChaser(over)` 공용 픽스처, 14+ 인라인 팩토리 치환(신 필수 필드로 typecheck 가 깨지기 전에)
- [ ] `relay/tests/helpers/fake-gateway.ts` — `readSetLimitChaserRequest(msgType, payload)` 디코더(`buy3Schema`, 신필드, `buyWatchSide` null 여부)
- [ ] `relay/tests/helpers/frames.ts` — `FakeLimitChaserInput` 신필드(S→C 포함)·`addBuyEntryLatched` 제거·`buy3Schema` 기본 1(구 서버 흉내는 0)
- [ ] 선매수 자동 체크 순수 함수 + 테스트 파일
- [ ] 폼 테스트 헬퍼 「그룹 펼치기」

## Security Domain

> `security_enforcement` 키는 config 에 없음 → 활성으로 간주.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no(무변경) | relay 기존 토큰 검증 |
| V3 Session Management | no(무변경) | — |
| V4 Access Control | yes | 계좌 대조 `session.allowedAccounts`(lc.set/lc.arm 공통 — 무변경, 신필드가 우회하지 않음을 확인) |
| V5 Input Validation | yes | zod `RelayLcSetSchema`(신필드 범위) · relay `toWireUint/UByte` 표현 범위 · 무장 가드 `#strategyArmable` |
| V6 Cryptography | no | — |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 브라우저가 `buy3_schema=0`/`buy_watch_side="1"` 를 실어 구 클라 경로를 여는 것 | Tampering | 입력 타입에 두지 않고 빌더가 1 고정 · `addBuyWatchSide` 호출 제거 |
| S→C 값 위조 전송(포기 해제·단계 조작 시도) | Tampering | 빌더가 싣지 않음 + 서버도 읽지 않음(§9-2 ⑦) — 이중 |
| 수량 0 인 게이트 무장(영원히 발주 안 하는 「무장」 표시) | Spoofing(상태 오인) | UI `canArmOf` + relay `#strategyArmable` 그룹별 동형 |
| 범위 밖 값으로 소켓 종료 유도(자기 DoS) | DoS | UI `lcRangeIssue` 선차단 · 레거시 0 허용 범위(Pitfall 4) · 구 탭 거부 프레임(Pitfall 3) |
| 38 재사용 | Tampering | `MSG` 에서 제거 · `ArmLatchMsgType` 36|37 · 번호 재사용 금지 주석 |
| 실서버·실계좌 리터럴 유출(테스트·문서) | Information Disclosure | 기존 D-27 규율 — 가짜 게이트웨이 `127.0.0.1`, `SAMPLE_ACCOUNT_NO` 만 |

## 배포 (고정 순서 · 운영 제약)

1. gh-trade: 24-11(바이너리 전송, 재기동 없음) → **[여기 전에 D-14 추출 — F-3]** → 24-12(20:00 이후 재기동 · WinForms Release 발행). 시각은 gh-trade 세션 `gh-trade-38` 이 SendMessage 로 알린다.
2. gh-radar relay: `GCP_PROJECT_ID=gh-radar SUPABASE_URL=… NOTIFICATION_CHANNEL_ID=… bash scripts/deploy-relay.sh`(메모리 「워커 배포 스크립트 env」 — `NOTIFICATION_CHANNEL_ID` 없으면 알림 정책 단계만 실패) → `bash scripts/smoke-relay.sh` → `/healthz` 확인. `DMA_HOST` 는 주입하지 않는다(보존). **20:00 KST 이후**(메모리 「장 시간 08:00~20:00」). 롤백: `bash scripts/deploy-relay.sh --rollback <직전 태그>`.
3. webapp: `git push`(= Vercel 프로덕션 배포). **relay 가 막히면 push 하지 않는다**(메모리 「배포는 relay 먼저·push 나중」). push 전 `git status -sb` 재확인(메모리 「동시 세션 커밋 경합」).
4. 사용자에게 열린 탭·앱 새로고침 안내(F-4), gh-trade 에 `buy3_schema=1` 배포 완료 회신(→ `buy_watch_side` 봉인 후속).
- **중간 창 주의:** 서버 재기동 ~ relay 배포 사이에는 옛 relay(= 구 클라, `buy3_schema` 없음)가 동작한다. 새 서버 에코엔 `buy_watch_side` 가 없어 옛 웹 폼의 감시대상이 전부 「매도잔량」으로 보이고, 이때 옛 웹에서 매수를 켜면 서버는 「선매수만 켠 등록」으로 받는다(화면에 보인 것과는 일치). 창을 짧게(같은 저녁) 유지하고, 그 사이 웹 상따 매수 조작을 삼가도록 안내 권장.

## Project Constraints (from CLAUDE.md)

- 커뮤니케이션·산출물 한글(메모리). 커밋 메시지 한글 · 커밋 전 메시지 확인 · Co-Authored-By 넣지 않기 · 커밋 후 push(사용자 전역 CLAUDE.md) — 단 **webapp push = 프로덕션 배포**이므로 relay 배포 전 push 금지(메모리 우선).
- GSD 워크플로우 경유 편집(프로젝트 CLAUDE.md) · GSD 단계 경계마다 멈춤(메모리).
- 상따 화면 반응형 = 본문 폭 4밴드 컨테이너 쿼리, 정본 `webapp/src/styles/globals.css` §2.2b — 표 복사 금지, 뷰포트 분기 신설 금지.
- 실서버 IP·실계좌 리터럴을 코드·테스트·문서에 적지 않는다(relay D-27).
- UI 는 HTML 목업 먼저 · 목업 검토 답 전 커밋 금지(메모리) — 스케치 009 D 로 충족, 나머지는 `/gsd-ui-phase 24`.
- 손보는 표면 안의 시각 결함은 바로 고치기(메모리).
- 병렬 Wave 는 worktree 분리 또는 순차(메모리) — config `parallelization: false`.

## Sources

### Primary (HIGH confidence — 이번 세션 직접 열람)
- gh-trade worktree `server/src/protocol/StockDMA.fbs:368-590` — SetLimitChaser 전 필드·봉인·append 17필드
- gh-trade `server/src/net/Gateway.cpp:57-59 · 905-916 · 1840-1935 · 1935-2090 · 3440-3561` — 구 클라 판정·검증·거부 문구·에코 조립
- gh-trade `server/src/trade/strategy/LimitChaser.cpp:1015-1075 · 3300-3375` — 후매수 재무장 규칙·사유 줄 문구
- gh-trade `server/src/trade/state/StrategyStateStore.h:390 · 705-735` — 구파일 폴백
- gh-trade `docs/strategy/limit-chaser.md` §5(818-1068) · §9 · §9-2(2441-2483) · §10(2485-2665)
- gh-trade `.planning/phases/24-limitchaser-buy3/24-CONTEXT.md` D-01~D-32
- gh-trade `server/scripts/sync-relay-schema.sh`(전문) + `--check` 실행 출력
- gh-trade `server/docs/cloud-uat.md` ⑥ · `server/scripts/uat/e2e_limitchaser_buy3.sh` · `inject_b6.py` · `inject_m4.py` 머리 주석
- gh-trade `git log`/`git show b066e135` · `client/Forms/Trading/LimitChaserForm.cs` `AutoCheckExitForPreBuy`
- gh-radar relay: `src/dma/envelope.ts` · `src/dma/msg-type.ts` · `src/ws/protocol.ts` · `src/ws/fanout.ts` · `tests/helpers/frames.ts` · `tests/helpers/fake-gateway.ts` · `src/dma/__tests__/{envelope,codec}.test.ts` · `node_modules/flatbuffers/mjs/builder.js`
- gh-radar shared: `packages/shared/src/relay.ts` · `strategy-display.ts`
- gh-radar webapp: `lc/lc-fields.ts` · `lc/setting-group.tsx` · `lc/use-lc-field-commit.ts` · `limit-chaser-form.tsx` · `latch-led.tsx` · `strategy-log.tsx` · `card/strategy-card.tsx` · `card/card-body.tsx` · `strategy-badge.tsx` · `lib/limit-chaser.ts` · `lib/numpad.ts` · `e2e/fixtures/relay.ts` · `vitest.config.ts` · `tsconfig.json`
- `.planning/sketches/009-limitchaser-buy3-card/README.md` · `index.html`(D 변형 코드)
- flatc 로 스크래치 생성한 `set-limit-chaser.ts` 와 현행 diff

### Secondary (MEDIUM)
- 없음(외부 문서 조회 불필요 — 전부 저장소 정본)

### Tertiary (LOW)
- A3(VM mock + 로컬 relay 웹 UAT 경로) — relay/README 절 제목만 확인, 절차 미검증

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 신규 패키지 없음, 버전 실측
- Architecture(relay): HIGH — 생성물 diff·빌더·파서·가드 전부 원문 확인
- Architecture(webapp): HIGH(현재 구조) / MEDIUM(companions 설계는 권장안)
- Pitfalls: HIGH — 각 항목 근거 줄 확인. F-3·F-4 는 순서·코드로 직접 도출
- UAT 경로(A3): LOW

**Research date:** 2026-09-27
**Valid until:** gh-trade 팁이 `b066e135` 에서 더 움직이면 재생성 대상·F-2 재확인(`--check` 재실행). 그 외 30일.

## Addendum — 후속분 ② (gh-trade 팁 `b46e1e5f`, 2026-09-27 · gh-trade-38 답변 반영)

**팁 전진:** `b066e135` → `3860388f`(D-33 서버 단계 기계) → `1d95f64f`(WinForms 상한가 차단·기본값 표) → `7a1b5165`(문서) → `b46e1e5f`(quick 정리). `.fbs` 는 주석 3줄만(`extra_buy_min_qty`/`max_qty` 기본값 주석, `extra_buy_abandoned` 포기 2종 주석) — **와이어·vtable 무변경**. `--check` 재실측(2026-09-27): 신규/변경 1개(`set-limit-chaser.ts`) + `.fbs` 사본 갱신 예정 — 본문 결론 그대로.

**gh-trade-38 확인(코드 기준):**
1. 상장주식수 원천 = 서버 `QuoteState.list_shares` 하나(KB·교보 TR 경로 0). 웹 대응 필드 `RelayQuote.ls`(`packages/shared/src/relay.ts`), 사용처 `webapp/src/components/trading/card/quote-grid-10.tsx:167,172`(`formatMarketCap`/`formatOnePercentShares`). WinForms `SeedListSharesDefaults` 규칙 = CONTEXT D-17.
2. 추가매수 차단 비교 = 캐시 매수1호가(웹 `RelayQuote.bp[0]`) vs 폼 비교가격 칸(제출될 `buyWatchPrice`). `bid1 > 0 ∧ watch > 0 ∧ bid1 == watch` 일 때만 차단, 0 이면 허용(치환 없음). → CONTEXT D-16.
3. **서버에 「가격 0 → 상한가」 규약 없음** — `buy_enabled ∧ (order_price==0 ∨ watch_price==0)` 은 §9-2 ③ ERROR(마스터 눕힘), 매도도 같다. 「0 → 상한가」는 클라 D-06 채움과 서버 후매수 발동 override 두 곳뿐. 웹 `seedFromUpperLimit`(`webapp/src/lib/limit-chaser.ts:234`)가 이미 명시값을 채우므로 구조 변경 없음 — 단 `upperLimit` 미수신(0) 상태에서 매수·매도를 켜는 제출은 거부된다는 점을 사전 검증·안내에 반영(본문 webapp 2 절 보강). → CONTEXT D-20.
4. 후매수 검증 5항은 전부 `postBuyEnabled &&` 조건 — OFF 재제출의 `post_buy_rebound_pct=0` 통과. 본문 F-4/A5 확정(assumption → verified).
5. `limit-chaser.md` §10 낡은 문장(「그룹 끄는 쪽은 마스터 무접촉」)은 gh-trade 가 정정(미커밋, 다음 push). 현 규칙 = CONTEXT D-19.

**D-14 추출 창:** 120 가동본은 Phase 24 전 서버라 열거(64)에 `buy_watch_side` 가 살아 있다 → 지금 아무 때나 추출 가능, 24-11/24-12 예고 때 gh-trade 가 「추출 끝났는지」를 확인 항목으로 넣는다. 플랜: 첫 웨이브 독립 태스크(relay 열거 파서 + 로그인 세션으로 64 요청 → `buyWatchSide === "1"` 키 목록 보고).

**새 웹 작업(본문 대비 추가):** ① 기본값 표 교체 + `ls` 시딩 훅(폼당 1회 · 손댄 칸 제외 · 서버 전략 있으면 생략) ② 추가매수 스위치 사전 검증에 상한가 차단 추가(호가 프레임을 폼에 넘기는 배선 — `card-body.tsx` 가 `quote` 를 이미 들고 있다) ③ 전략 로그 원문 사유 줄 2종은 D-13 경로 그대로(추가 코드 없음).

**Valid until:** gh-trade 팁이 `b46e1e5f` 에서 더 움직이면 `--check` 재실행. 그 외 30일.
