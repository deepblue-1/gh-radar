# Phase 42: 틱뷰어 봉차트·이동평균·수익률 겹쳐보기 - Research

**Researched:** 2026-11-12
**Domain:** 순수 SVG 시계열 차트(React 19 · Next 15) · 브라우저 분봉 집계 · 팀 손익 시계열 · Supabase RPC 한 키 추가
**Confidence:** HIGH(코드 지도 · 자료 모양 · 배포 경로는 이 세션에 파일을 직접 읽어 확인) / MEDIUM(초기 보기 창 적용의 한 프레임 깜박임 · 성능 체감은 실기기 확인 필요)

## Summary

이 phase 는 「무엇」 이 CONTEXT(D-01 ~ D-24)와 UI-SPEC 으로 이미 잠겼다. 남은 것은 「어떻게」 이고, 코드를 읽은 결과 **새 차트는 거의 전부 기존 순수 함수를 그대로 불러 조립할 수 있다.** 핵심 발견은 세 가지다. ① 기존 기하 함수들은 판 경계를 상수가 아니라 `TickPanels` 객체 `p` 로 받는다(`yOfNet` = `p.y2a/y2b`, `teamBucketsOf` = `p.y3a/y3b`, `turnoverPathsOf`·`yOfShare` = `p.y4a/y4b`, `nearestTickCircleOf`·`tickOwnTipOf`·`tickHoverWithOwn`·`yOfTickPrice` = `p.y1a/y1b`). 그래서 봉 차트용 `CandlePanels`(= `TickPanels` + 수익률 판 `yRa/yRb`)를 만들어 넘기면 순매수 · 10분 · 누적 거래대금 판과 원 · 우리 점 · 툴팁 판정이 **고치지 않고** 새 y 위치에서 돈다. ② 서버는 열기 응답 `accum` 을 모양 검사 없이 그대로 넘긴다(`server/src/services/ticks.ts:235`) — D-18 의 「server 스키마 통과」 는 **런타임 변경 0**(shared 타입 한 줄 + 서버 테스트 픽스처만)이고 server 재배포가 필요 없다. ③ 누적 평단 파서는 이미 있다(`webapp/src/lib/accum-chart.ts` `avgPxPointsOf` — 키 없음 · 모양 어긋남이면 `[]`).

새로 짜야 하는 것은 분봉 집계 · 자동 단위 · 이동평균(봉 SMA/EMA · 일 SMA) · 봉/거래대금 경로 · 수익률 시계열(당일 = `teamKpiAt` 를 시각마다 · 누적 = (가격 − 누적 평단) ÷ 누적 평단) · 두 눈금 0% 맞춤 · 가장자리 글자 · 브라우저 기억 · 조작부(스위치 · 봉 단위 메뉴 · 칩 · 더하기 창) · 값 띠 첫 두 칸이다. 성능(성공 기준 7)은 **세션(WeakMap) · 단위당 1회 집계 + 봉 층을 색별 `<path>` 몇 개로 묶어 `useMemo`** 로 지킨다 — 당일 증분은 `appendTickBytes` 가 세션 객체를 통째로 새로 만들기 때문에 「마지막 봉만 갱신」 같은 증분 로직이 필요 없다(새 세션 = 새 캐시 키 · 1분봉 기준 O(N) 한 번).

**Primary recommendation:** `lib/ticks/candle-chart.ts`(치수 · 집계 · 이동평균 · 경로) + `lib/ticks/candle-returns.ts`(수익률 시계열 · 두 눈금) + `lib/ticks/candle-prefs.ts`(기억)를 순수 함수 + 단위 테스트로 먼저 만들고, `components/ticks/candle-chart.tsx` 는 `tick-chart.tsx` 의 조작 골격(제스처 · 터치 살펴보기 · 구간 합계 · 클릭 판정)을 **복제**해 판만 바꾼다. 기존 `tick-chart.tsx` 에는 선택 입력 3개(제목 뒤 노드 · 처음 보기 창 · 보기 창 알림)와 필요 시 `export` 키워드만 더한다.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 그리는 방식 · 비교 방법
- **D-01: 봉 차트는 지금 틱 차트와 같은 순수 SVG 로 직접 그린다.** `lightweight-charts` 기각 — 시간 단위가 1초라 1초 안 여러 체결을 못 찍고, 거래 없는 구간이 붙어 버려 팀 원 · 계단 · 구간 합계 · 값 띠를 전부 다시 짜야 한다. 「둘 다 만들어 비교」 도 기각. 기존 기하 함수(`lib/ticks/tick-chart.ts` · `team-model.ts` · `tick-chart-tip.ts` · `own-model.ts`)는 **가져다 쓰되 고치지 않는다.**
- **D-02: 처음 보이는 차트 = 기존 선 차트, 마지막으로 고른 쪽을 브라우저에 기억.** 다른 사용자는 스위치를 누르기 전까지 변화가 없다. 「늘 기존」 · 「새 차트 기본」 기각.
- **D-03: 운영에 배포하고 틱뷰어 사용자(DMA 매핑 사용자) 모두에게 스위치를 보인다.** 관리자만 · 로컬에서만 기각. — **Reversibility:** reversible — 스위치와 새 파일만 지우면 원래대로(RPC 추가 키는 기존 차트가 읽지 않는다).
- **D-04: 채택 뒤 기존 차트 처리는 이 phase 에서 정하지 않는다.** 두 차트를 나란히 두는 데서 끝. 채택 · 폐기 · 둘 다 유지는 써 본 뒤 별도 작업.
- **D-05: 전환 스위치 자리 = 차트 카드 제목 줄(「타임라인」 글자 옆) 「선 차트 | 봉 차트」.** 봉 차트일 때만 그 옆에 봉 단위 메뉴 · 이동평균 칩이 나온다. 폰 폭에서도 봉 차트를 그린다(조작 줄은 두 줄로 접힘). 화면 맨 위 제목 줄 · 폰은 선 차트만 기각.

#### 가격 판(봉 · 거래대금 · 이동평균)
- **D-06: 봉별 거래대금 막대는 가격 판 안 아래 1/5 에 둔다(목업 A).** 별도 거래량 판 기각. 단위는 금액(거래대금 — 스케치 010 관례). 봉과 같은 상승 빨강 / 하락 파랑 · 흐리게.
- **D-07: 가격 판 높이 160(폰 110).** 봉 128 + 막대 32(폰 88 + 22). 나머지 판 높이는 기존 그대로(순매수 70 · 10분 40 · 누적 거래대금 50 / 폰 50 · 28 · 36).
- **D-08: 봉 차트에는 틱 선을 그리지 않는다(봉만).** 켜고 끄는 버튼 · 늘 같이 기각. 틱 선이 필요하면 선 차트로 바꾼다.
- **D-09: 봉 단위 = 「자동」(기본) + 1 · 5 · 10 · 15 · 30 · 60분.** 제목 줄의 눌러 펼치는 메뉴 하나. 자동 = 보기 창에 맞춰 봉 하나 폭이 4px 이상 되는 가장 작은 단위(확대하면 1분봉으로 내려감) · 지금 단위는 판 제목에 「5분봉(자동)」 처럼 표시. 직접 고르면 그 단위로 고정되고 브라우저에 기억. 사용자 원문 「1, 5, 10, 15, 30, 60분봉 … 다 고를 수 있게」.
- **D-10: 이동평균 선은 자유롭게 더하고 지운다 — 최대 6개.** 선 하나 = 기준(봉 | 일) + 기간(사용자 숫자 입력) + 종류(단순 | 지수 · 선마다 따로). 제목 줄 칩 「단순 5 ×」 「지수 20 ×」 「일 20 ×」 + 「＋」. 칩을 누르면 켜고 끄기, × 는 삭제. 처음 상태 = 단순 5 · 단순 20. 구성은 브라우저에 기억. 「선 3개 고정 · 기간만 바꿈」 · 「전체 단순|지수 전환」 기각. 사용자 원문 「유저가 기간을 입력해서 볼 수 있을까?」.
- **D-11: 일 이동평균선을 넣는다 — N일선 = (앞 N−1 거래일 종가 + 그 시각 가격) ÷ N.** 그 시각에 일봉 차트에서 보이던 값과 같고 장중에 조금씩 움직이는 선. 종가는 이미 있는 `stock_daily_ohlcv`(종목상세 일봉 차트가 쓰는 표)에서 그 날짜 앞 거래일들만 읽는다 — 서버 변경 없음. 「전날까지로 고정」 기각. 사용자 원문 「일 이동평균선 포함하자. 일봉 차트는 안봐도 되고 이동평균선만 볼 수 있으면 돼」 — 여러 날 봉 차트는 만들지 않는다.

#### 수익률 · 누적 평단
- **D-12: 수익률 판을 가격 판 바로 아래에 새로 둔다 — 높이 50(폰 36).** 가격 판에 겹치는 안 기각. 차트 전체 420px(폰 303px · 기존 307 / 222).
- **D-13: 수익률 판 눈금은 둘 — 당일(보라)은 오른쪽, 누적(회색)은 왼쪽.** 순매수 판과 같은 규칙. 0% 선은 두 눈금이 한 줄을 같이 쓴다. 한 눈금 공유 기각(차이가 크면 작은 쪽 선이 납작해짐).
- **D-14: 팀 당일 수익률 선 = 팀 거래정보 패널 「평단 대비 수익률」 과 같은 계산의 시계열.** 실현 + 미실현 · 그 시각 체결가 기준(shared `pnlAt` — 37 D-10 · D-20). 팀 첫 매수 전에는 선이 없다. 정의를 새로 만들지 않는다(38 D-16).
- **D-15: 누적 평단 = 매집감지 보고서 `payload.avg_px` 시계열을 가격 판에 회색 긴 점선으로, 누적 수익률 = (그 시각 가격 − 누적 평단) ÷ 누적 평단(미실현만)을 수익률 판에 회색 선으로.** 과거 날짜 + 매집감지 등록 종목일 때만(37 D-09 승계) — 당일 화면 · 미등록 종목은 두 선과 값 띠의 누적 줄만 빠진다. `avg_px` 는 분 경계마다 점이 생기는 계단이고 `px` 0 = 등록 포지션 없음(선을 끊는다 · 그 구간 누적 수익률도 끊는다) · 2026-10-21 이전 적재 행에는 키가 없다(없으면 미등록과 같게 처리).
- **D-16: 누적 평단이 보이는 가격 범위 밖이면 가격 눈금을 넓히지 않고 가장자리에 「누적 평단 13,772 ▾」(위쪽이면 ▴) 글자만 남긴다.** 눈금 넓히기 · 켜고 끄는 버튼 기각(봉이 납작해짐). 평단과의 거리는 수익률 판 회색 선으로 읽는다.
- **D-17: 기준 차이는 판 제목에 짧게 밝힌다.** 가격 판 제목 「누적 평단(보고서)」 · 수익률 판 제목 「누적 수익률(미실현 …)」 + 차트 카드 아래 작은 글씨 한 줄 「누적 = 매집감지 보고서 값 · 우리 체결 제외」. NXT 화면은 기존 규칙(`cumLegendOf` — 「KRX+NXT 합산」)을 덧붙인다. 당일 평단(틱 재계산 · 우리 체결 포함 — 37 D-12)과 값이 조금 어긋나는 이유가 화면에서 읽혀야 한다.
- **D-18: 틱 열기 RPC 응답 `accum` 에 누적 평단 키 하나를 더한다.** 같은 `limitup_accum_flow` 행의 `payload.avg_px`(`{ t_ms, px }`)를 `pos_net` 옆에 싣는다 + shared `TickOpenResponse` 타입 + server 스키마 통과. 기존 차트는 이 키를 읽지 않는다. 배포 순서 = DB → server → webapp push. — **Reversibility:** reversible — 덧붙이는 키 하나라 지워도 기존 소비자가 없다.

#### 기존 기능 옮기기
- **D-19: 선 차트의 기능을 봉 차트에 처음부터 전부 넣는다.** 확대/이동(휠 · 끌기 · 핀치 · `+ − 전체 1분 10초`) · 현재 틱 커서 · 빈 곳 클릭 시각 점프 · 팀 주문 원(클릭 = 그 주문 · 원 옆 묶음 상자) · VI 띠 · 장전 음영 · 15:30 ~ 16:00 빈 띠 · 우리 체결 ◆ · 근거 ○ · 짝 없음 ◇(클릭 이동 — 38 D-08 · D-10) · Shift+끌기 구간 합계(스케치 028) · 폰 길게 누르기 살펴보기. 「채택 뒤로 미룸」 기각 — 같은 기능이어야 공정하게 비교한다.
- **D-20: 차트 위 값 띠는 4칸 그대로(목업 A).** 첫 칸 = 봉 값(「5분봉 10:15」 · 종가 · 등락률 · 시 · 고 · 저 · 거래대금 + 켜진 이동평균 값들) · 둘째 칸 「당일 팀」 = 순매수 · 매수 · 매도 + 평단 · 수익률 + (누적 자료 있을 때) 누적(이월 포함) · 누적 평단 · 누적 수익률 · 셋째 10분 칸 · 넷째 누적 거래대금 — 뒤 두 칸은 기존 그대로. 「수익률 칸 추가(5칸)」 기각. 마우스 = 그 시각 · 떼면 현재 틱(스케치 028 B 규칙 유지).

#### 조작부 모양 · 전환 동작 (UI 설계 단계 목업 검토 — 2026-11-12)
정본 목업 `reference/mockup-chart-controls.html`. 세부 치수 · 문구 · 상태는 `42-UI-SPEC.md`.
- **D-21: 폰 제목 줄은 언제나 두 줄 — 둘째 줄(봉 단위 · 이동평균 칩 · 「＋」)이 넘치면 옆으로 민다(목업 B · 화면 P1 ~ P3).** 줄바꿈(A) 기각 — 칩 6개면 제목 줄이 4줄까지 늘고 칩을 더하고 지울 때마다 차트 위치가 바뀐다.
- **D-22: 이동평균 더하기 창 = 한 장 양식(목업 A · 화면 P4 ~ P7 · D2 · D3).** 기준(봉 | 일) · 기간 숫자 · 종류(단순 | 지수) 세 칸 + 「더하기」. PC 는 작은 창, 폰은 아래에서 올라오는 시트. 「자주 쓰는 선 버튼 + 직접 넣기」(B) 기각.
- **D-23: 봉 단위 메뉴 = 버튼 아래로 펼쳐지는 목록(목업 A · 화면 P8 · P9 · D4 · D5).** 「자동」 일 때 지금 쓰이는 단위 줄에 「지금」 꼬리표. 폰과 PC 모양이 같다. 기기 기본 고르기 창(B) 기각.
- **D-24: 「선 차트 | 봉 차트」 를 바꿔도 보던 시간 구간(확대 위치)을 그대로 둔다.** 같은 자리를 번갈아 비교하기 위해서다. 「바꾸면 처음 화면으로」 기각. 이를 위해 **기존 선 차트 파일에 선택 입력 2개(처음 보일 구간을 받기 · 바뀐 구간을 알리기)를 더하는 것을 허용한다** — 안 넘기면 지금과 같은 동작이고 기존 테스트는 그대로 통과해야 한다. 성공 기준 1 의 「기존 차트 파일 diff = 스위치 연결부뿐」 은 **「스위치 연결부 + 보기 창을 주고받는 선택 입력 2개」** 로 읽는다. 구간은 브라우저에 저장하지 않는다(화면이 열려 있는 동안만) · 종목 · 날짜가 바뀌면 처음 창.

### Claude's Discretion
- **봉 경계 시각 기준** — 권고: 차트 시간축과 같은 수신 시각으로 묶는다(팀 원 · 커서와 한 축). 단일가(동시호가) 체결을 봉에 넣는 방식 · 거래 없는 구간(15:30 ~ 16:00)은 봉 없음.
- **이동평균 색 6가지** — `--up` · `--down` · `--team` · `--vi` · `--mine` 과 겹치지 않는 hex. 목업의 `--ma5` · `--ma20` · `--ma60` 은 임시값.
- ~~이동평균 추가 창 모양 · 봉 단위 메뉴 모양 · 폰 제목 줄 접힘~~ — UI 설계 단계 목업으로 확정됨 → D-21 ~ D-23.
- **일 기준 이동평균의 종류** — D-11 정의식이 단순 평균이므로 일 기준은 단순만 두는 것을 권고. 종가가 N−1개에 못 미치는 종목(상장 직후)은 그 선을 그리지 않는다. 일 이동평균이 가격 범위 밖일 때는 D-16 과 같은 가장자리 글자 규칙.
- **브라우저 기억 방식**(저장 키 이름 · 읽기 실패 시 기본값으로) · 기억 범위는 종목별이 아니라 전체 공통.
- **코드 구조** — 새 컴포넌트 · 새 기하 모듈의 파일 이름, 기존 모듈에서 export 가 필요한 함수가 있으면 「export 만 더하기」 까지는 허용(동작 변경 금지), 봉 집계 캐시(세션 · 단위당 1회), 수익률 시계열 샘플링 간격.
- **봉 몸통 최대 폭**(목업 14px 상한) · 봉 폭이 좁을 때 위아래 꼬리 선만 그리는 문턱.
- **수익률 판 두 눈금의 0% 맞춤 방식** · 눈금 숫자 자릿수.

> UI-SPEC(approved)이 위 재량 항목 대부분을 「Researcher Decisions 1 ~ 17」 로 이미 메웠다(색 `--ma-1` ~ `--ma-6` · 저장 키 3개 · 몸통 14px/0.7/3px 문턱 · z 공유 0% 맞춤 등). 플래너는 그 값을 그대로 쓴다.

### Deferred Ideas (OUT OF SCOPE)
- **채택 뒤 기존 선 차트 처리** — 새 차트로 교체(기존 파일 · 스위치 삭제) · 둘 다 유지(스위치 정식화) 중 무엇으로 할지는 운영에서 써 본 뒤 별도 작업으로 정한다(D-04).
- **여러 날 봉 차트(일봉 자체) + 날짜별 팀 매집 겹쳐보기** — 사용자가 필요 없다고 함(일 이동평균선으로 충분). 다시 요청이 있을 때만.
</user_constraints>

<phase_requirements>
## Phase Requirements

ROADMAP 의 `Requirements: TBD` — 요구사항 ID 가 매핑되지 않았다. 대신 CONTEXT 가 확정한 성공 기준 7개(플래너가 ROADMAP 의 초안 6개를 이 7개로 고친다)를 `SC-1` ~ `SC-7` 로 부르고 연구 근거를 잇는다.

| ID | Description (CONTEXT 성공 기준) | Research Support |
|----|-------------|------------------|
| SC-1 | 스위치 한 번으로 선 ↔ 봉 · 고른 쪽 기억(처음 선) · 바꿔도 보던 구간 유지 · 선 차트 diff = 스위치 연결부 + 선택 입력 2개 | Pattern 5(보기 창 주고받기) · Pattern 7(기억) · Pitfall 1 · 2 · 3 · 「tick-chart.tsx 변경 범위」 표 |
| SC-2 | 봉 단위 자동 + 1 · 5 · 10 · 15 · 30 · 60 · OHLC · 거래대금 = 그 구간 A3 직접 집계(단위 테스트) · 자동 = 4px 이상 가장 작은 단위 | Pattern 2(1분봉 기반 집계) · Code Example 1 · 2 · Pitfall 4 · 5 |
| SC-3 | 이동평균 최대 6개 · 봉 SMA/EMA · 일 SMA · 정의식 일치 · 모자라면 안 그림 · 구성 기억 | Pattern 3 · Code Example 3 · 일별 종가 조회(Pattern 6) · Pitfall 8 · 9 |
| SC-4 | 팀 원 · 당일 평단 · ◆ ○ 가 봉과 한 시간축 · 당일 수익률 커서 값 = 패널 「평단 대비 수익률」 | Pattern 1(`CandlePanels` 재사용) · Pattern 4(수익률 시계열 = `teamKpiAt`) · Code Example 4 · Pitfall 6 |
| SC-5 | 과거 + 등록 종목이면 누적 평단 · 누적 수익률 · 미등록 · 당일은 그 선만 빠짐 | D-18 경로(마이그레이션 · 타입 · 서버 통과) · `avgPxPointsOf` 재사용 · Code Example 5 · 6 · Pitfall 10 |
| SC-6 | 선 차트 조작 전부 봉 차트에서도 같은 방식 | 「복제할 조작 골격」 표 · Pitfall 11 · 12 |
| SC-7 | 수십만 체결에서도 매끄러움 · 봉 집계 세션 · 단위당 1회 | Pattern 2(WeakMap 캐시) · Pattern 8(색별 path + useMemo) · Pitfall 13 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- 사용자 대면 문장 · 이 문서 서술은 한국어. 범위 물결표는 앞뒤 띄어쓰기(`08:00 ~ 20:00`).
- 커밋 메시지 한글 · Co-Authored-By 넣지 않음 · 커밋 전 메시지 확인(메인 세션 규칙 — 실행자는 경로 지정 커밋만).
- GSD 워크플로 안에서만 파일 변경. 이 phase 는 `/gsd-execute-phase` 로 실행.
- 상따 화면(`/trading/limit-chaser`)의 컨테이너 쿼리 4밴드는 **이 화면과 무관**(UI-SPEC 「반응형 층」 — 틱뷰어는 측정 폭 600 + 뷰포트 768 규칙).
- 데이터 소스 규칙: `stock_daily_ohlcv` 는 자체 적재 표라 스크래핑 5원칙 · 공식 API 기준 모두 해당 없음. 일 이동평균 조회는 사용자 클릭 시 브라우저 → Supabase 읽기 1회(외부 원본 호출 아님).
- 메모리 규칙(이 phase 관련): 배포는 메인 세션에서만(서브에이전트 배포 분류기 차단) · `git push` 가 곧 webapp 운영 배포 · server 는 `deploy-server.sh` 따로 · `supabase db push --linked --yes` 형태 · 동시 세션 테스트는 vitest `--maxWorkers=2` · playwright `--workers=1` · 손보는 표면 안의 시각 결함은 바로 고침 · 보안검사 생략(`security_enforcement: false`) · nyquist 유지.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 분봉 집계 · 자동 단위 · 이동평균 계산 | Browser / Client(순수 함수) | — | 그날 A3 전부가 `TickSession` 메모리에 있다 — 서버 왕복 0 |
| 당일 팀 수익률 시계열 | Browser / Client | — | `session.team.prefix` + shared `pnlAt` 이미 메모리 |
| 누적 평단 시계열 원천 | Database(`limitup_accum_flow.payload.avg_px`) | API(server 그대로 통과) | 이미 적재된 jsonb — RPC 가 한 키 더 실을 뿐 |
| 틱 열기 응답 모양 | API(server `openTick`) | Database(RPC) | server 는 `accum` 을 검사 없이 통과 — 런타임 변경 0 |
| 일별 종가(일 이동평균) | Database(`stock_daily_ohlcv` RLS anon+authenticated SELECT) | Browser(Supabase JS 직접 읽기) | 기존 일봉 차트와 같은 경로 · server 변경 없음(D-11) |
| 차트 종류 · 봉 단위 · 이동평균 구성 기억 | Browser(localStorage) | — | 기기별 · 전체 공통(종목별 아님) |
| 보기 창 유지(D-24) | Browser(뷰어 컴포넌트 ref) | — | 저장소에 남기지 않음 · 화면 메모리만 |

## Standard Stack

### Core (전부 이미 설치 — 새 설치 0)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | ^19.0.0 | 컴포넌트 · `useSyncExternalStore` · `useMemo` | 저장소 기본 [VERIFIED: webapp/package.json:28] |
| next | ^15.0.0 | App Router · `reactStrictMode: true` | [VERIFIED: webapp/package.json:25 · webapp/next.config.ts] |
| 순수 SVG(라이브러리 없음) | — | 봉 · 선 · 판 | D-01 잠금 |
| radix-ui(shadcn `popover` · `sheet` · `input`) | 1.4.3 | 봉 단위 목록 · 더하기 창(팝오버/시트) · 기간 칸 | UI-SPEC Design System [CITED: 42-UI-SPEC.md Component Inventory] |
| lucide-react | 1.8.0 | `ChevronDown` · `Check` 2개 | UI-SPEC [CITED: 42-UI-SPEC.md] |
| @supabase/supabase-js(`@/lib/supabase/client`) | 기존 | 일별 종가 읽기 | `fetchDailyOhlcv` 와 같은 클라이언트 [VERIFIED: webapp/src/lib/daily-ohlcv-api.ts] |
| vitest | ^2.1.9 | 단위 · 컴포넌트 테스트(jsdom) | [VERIFIED: webapp/package.json:55 · webapp/vitest.config.ts] |
| @playwright/test | ^1.59.1 | 실브라우저 e2e(선택) | [VERIFIED: webapp/package.json:40] |
| pgTAP(로컬 일회용 컨테이너) | postgres 17.6.1.104 이미지 | RPC 키 회귀 | `scripts/verify-dma-orders-price-check.sh --test …` [VERIFIED: 스크립트 머리 주석 + `docker image ls`] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 순수 SVG | lightweight-charts | D-01 로 기각(1초 해상도 · 빈 구간 붙음 · oklch 거부) — 검토 대상 아님 |
| shadcn `dropdown-menu` | `Popover` + `role="radiogroup"` | UI-SPEC Researcher Decision 15 — 새 설치 금지 |
| `fetchDailyOhlcv(code, '2Y')` 후 걸러 쓰기 | 새 함수 `fetchPrevCloses(code, ymd, 239)` | 기존 함수는 「오늘 기준 범위」 라 과거 날짜 + 240일선이면 2Y 로도 모자랄 수 있고 수백 행을 더 받는다 → **새 함수 권고**(Pattern 6) |

**Installation:** 없음.

## Package Legitimacy Audit

이 phase 는 외부 패키지를 설치하지 않는다(UI-SPEC Registry Safety: 「새 설치 0」). 감사 대상 없음.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
[틱 열기 GET /api/ticks/open] ──► server openTick ──► RPC tick_open_for_user ──► limitup_accum_flow.payload
        │                         (accum 그대로 통과)        (+ 'avg_px' 한 키 · D-18)
        ▼
 tick-viewer-page ── resp.accum · resp.stock.code · isToday ──► TickViewer (key = session.key)
                                                                   │
            ┌──────────────── chartKind (localStorage · useSyncExternalStore) ───────────────┐
            │                                                                                │
            ▼ 'line'                                                                         ▼ 'candle'
   TickChart(기존 · 선택 입력 3개)                                                 CandleChart(새)
   titleAddon=<ChartKindSwitch/>                                                    titleAddon=<ChartKindSwitch/>
   initialView / onViewChange ◄──── 뷰어 lastViewRef(렌더 없는 ref) ────►            initialView / onViewChange
                                                                                     │
          TickSession(메모리 · 당일은 증분마다 새 객체) ─────────────────────────────────┤
            │ recvOrder · a3Of · a3.px/qty · duplicates · index.recvNs · team(prefix …)    │
            ▼                                                                            ▼
   candleBaseOf(session)  ──WeakMap──► 1분봉 ──► candlesOf(session, unit) ──► 보이는 봉 이분 탐색
            │                                         │
            │                                         ├─► 이동평균(봉 SMA/EMA · 일 SMA ◄── fetchPrevCloses(code, ymd) ◄── stock_daily_ohlcv)
            │                                         └─► 봉 · 거래대금 색별 path(useMemo)
            ├─► dayReturnSeries: 픽셀 열마다 rec → teamKpiAt(team, session, rec).pnl.ret (+ 팀 체결 · 커서 rec)
            ├─► cumAvg: avgPxPointsOf({avg_px}) → 계단 · 끊김 → 누적 수익률 = (가격 − 평단) ÷ 평단
            └─► 기존 함수 재사용(CandlePanels 를 TickPanels 로 넘김):
                 teamDayStairsOf · yOfNet · teamBucketsOf · turnoverPathsOf · viBandsOf · tickCirclesOf ·
                 ownMarksOf · teamAvgPathOf · tickBandAt(셋째 · 넷째 칸) · tickRangeSumOf · tickHoverWithOwn
```

### Recommended Project Structure
```
webapp/src/lib/ticks/
├── candle-chart.ts        # CANDLE_CHART 치수 · candlePanelsOf · candleBaseOf/candlesOf(WeakMap) · autoUnitOf ·
│                          #   visibleCandleRange · candleRangeOf · 봉/거래대금 path · 이동평균(sma/ema/daySma) · MA path(30분 끊김) ·
│                          #   가장자리 글자 배치 · cumAvgPointsOf/cumAvgAt/cumAvgPathOf · candleBandAt
├── candle-returns.ts      # dayReturnSeriesOf · cumReturnSeriesOf · dualZeroScaleOf(z 공유 0% 맞춤) · 눈금 글자
├── candle-prefs.ts        # 저장 키 3개 · parse/validate/serialize · 구독(useSyncExternalStore) · 색 번호 배정
├── daily-closes.ts        # fetchPrevCloses(code, ymd, n) — stock_daily_ohlcv 앞 거래일 종가
└── __tests__/candle-chart.test.ts · candle-returns.test.ts · candle-prefs.test.ts · daily-closes.test.ts
webapp/src/components/ticks/
├── candle-chart.tsx       # 제목 줄 · 판 · 조작(tick-chart.tsx 조작 골격 복제)
├── candle-chart-band.tsx  # 값 띠 A 4칸(첫 · 둘째 칸 새 · 셋째 · 넷째 = tick-chart-band 와 같은 모양)
├── chart-kind-switch.tsx  # 「선 차트 | 봉 차트」
├── candle-unit-menu.tsx   # 봉 단위 Popover + radiogroup
├── candle-ma-chips.tsx    # 칩 · ＋
├── candle-ma-form.tsx     # 더하기 창(팝오버 ↔ 시트)
└── __tests__/candle-chart.test.tsx · tick-chart-view-sync.test.tsx · chart-kind-switch.test.tsx · candle-ma-form.test.tsx · candle-unit-menu.test.tsx
supabase/migrations/<새 타임스탬프>_tick_open_accum_avg_px.sql
supabase/tests/tick_viewer.test.sql   # D 절에 avg_px 단언 추가(plan 수 올림) — 또는 새 파일
packages/shared/src/tick-api.ts       # accum 에 avg_px 한 키
server/tests/routes/ticks.test.ts     # 픽스처에 avg_px — 통과 단언
webapp/src/styles/globals.css · styles/__tests__/tds-tokens.test.ts   # --ma-1 ~ --ma-6
```

### 기존 코드 지도 — 그대로 불러 쓸 수 있는 것(수정 0)

[VERIFIED: 이 세션에 각 파일을 Read]

| 원천 | export | 시그니처(요지) | 봉 차트에서 쓰는 곳 |
|------|--------|----------------|---------------------|
| `lib/ticks/tick-chart.ts:44-52` | `TICK_CHART` | `desktop: { TOP: 7, H1: 104, GAP: 7, H2: 70, H3: 40, H4: 50, LB: 15, H: 307 }` · `phone: { TOP: 0, H1: 72, GAP: 7, H2: 50, H3: 28, H4: 36, LB: 15, H: 222 }` · `R: 52` · `PHONE_MAX_W: 600` · `MIN_VIEW_MS: 10 * SEC` | `R` · `PHONE_MAX_W` · `MIN_VIEW_MS` 만 재사용. 봉 차트 치수는 새 `CANDLE_CHART` |
| `tick-chart.ts:55-77` | `TickPanels` · `tickPanelsOf` | `{ y1a, y1b, y2a, y2b, y3a, y3b, y4a, y4b, H }` | `CandlePanels extends TickPanels` 로 같은 모양을 만들어 기존 함수에 넘긴다(Pattern 1) |
| `tick-chart.ts:88-91` | `tickBoundsOf(ymd)` | `{ T0(08:00), T0900, T1530, T1600, T2000 }` | 봉 경계 기준 T0 · 음영 · 빈 띠 |
| `tick-chart.ts:94-114` | `msOfNs` · `xOfTick` · `tOfTick` · `cursorXOf` | ns→ms · 시각↔x | 그대로 |
| `tick-chart.ts:151` | `tickTicksOf(view, plotW)` | 시각 눈금 | 그대로 |
| `tick-chart.ts:180-217` | `PriceSeries` · `priceSeriesOf(session)` | `{ n, t: Float64Array, px, rec: Int32Array, maxPx }` · WeakMap 캐시 · 가격 0 제외 · **중복 수신 포함** | 축 폭 `priceAxisWidthOf(maxPx)` · 그 시각 가격 · 수익률 열 샘플링의 rec |
| `tick-chart.ts:244` | `priceIdxAt(s, t)` | t 이하 마지막 점 색인 | 수익률 열 샘플링 · 누적 수익률의 가격 |
| `tick-chart.ts:317-340` | `tickPriceRangeOf` · `yOfTickPrice(range, p)` | `yOfTickPrice` = `top = p.y1a + 3` · `h = p.y1b - p.y1a - 6` | `yOfTickPrice(range, { ...P, y1b: 봉 영역 아래 })` 로 봉 영역 y 를 그대로 얻는다 |
| `tick-chart.ts:343-353` | `lastTradeMsOfSession` · `lastRecvMsOf` | — | `useChartView` 입력 · 계단 끝 |
| `tick-chart.ts:366-447` | `yOfNet` · `dayNetRangeOf` · `cumPointsOf(accum, isToday)` · `cumNetRangeOf` · `teamDayStairsOf` · `cumStairsOf` | `p.y2a/y2b` 만 읽음 | 순매수 판 그대로 |
| `tick-chart.ts:450-508` | `TEAM_BUCKETS` · `bucketMaxOfModel` · `teamBucketsOf(model, view, x, T0, p)` | `p.y3a/y3b` | 10분 판 그대로 |
| `tick-chart.ts:517-561` | `viBandsOf` · `teamAvgPathOf(model, x, y, range, endMs)` | y 함수 주입 | VI 띠 · 당일 평단 점점선(봉 영역 y 넘김) |
| `tick-chart.ts:573-751` | `TurnoverSeries` · `turnoverSeriesOf` · `turnoverIdxAt` · `marketCapOf` · `yOfShare` · `turnoverPathsOf(s, view, x, p, plotW, endMs)` | `p.y4a/y4b` · **중복 수신 제외 · 가격/수량 0 제외** | 넷째 판 그대로 · 봉 집계 거름 규칙의 기준 |
| `tick-chart.ts:758-866` | `OWN_MARK_R` · `ownMarksOf(own, session, view, x, y)` · `ownMarkAt` | y 주입 | ◆ ○ ◇ 그대로 |
| `lib/ticks/team-model.ts:152-167` | `teamKpiAt(model, session, rec)` | `lastA3[exPos[rec]]` → `fillsUpTo(prefix, runMaxNs[j])` → `pnlAt(prefix, k, lastPx)` · `{ pnl, avgPx, dayNetVal, dayNetQty, lastPx, k }` | **당일 수익률(D-14)의 유일한 계산원** |
| `team-model.ts:173` | `teamCirclesOf` | — | (원은 `tickCirclesOf` 가 그린다) |
| `lib/ticks/tick-chart-tip.ts:77-117` | `tickCirclesOf(model, view, x, y)` · `nearestTickCircleOf(circles, mx, my, p)` · `tickCircleGroupOf` | `p.y1a/y1b` | 원 · 묶음 |
| `tick-chart-tip.ts:120-138` | `pct2` · `teamAvgAt(model, t)` | — | % 글자 |
| `tick-chart-tip.ts:232-242` | `tickOrderHoverOf` | — | 원 옆 상자 |
| `tick-chart-tip.ts:245-264` | `pct1` · `cumNetAt` | — | 둘째 칸 누적(이월 포함) |
| `tick-chart-tip.ts:306-351` | `tickBandAt(src, t)` → `TickBand` | 10분 칸 · 누적 칸 · 당일 팀 순/매수/매도 · 누적 값 | 셋째 · 넷째 칸 + 둘째 칸 1 · 3줄을 이 결과로 |
| `tick-chart-tip.ts:378-418` | `tickRangeSumOf(session, t0, t1)` | 구간 합계 | Shift+끌기 그대로 |
| `tick-chart-tip.ts:475-528` | `tickOwnTipOf` · `tickHoverWithOwn` | `p.y1a/y1b` | 우리 점 툴팁 |
| `lib/accum-chart.ts:56-60 · 73-75 · 1186-1206` | `clampView` · `priceAxisWidthOf` · `presetOf` · `panBy` · `zoomAt` · `View` · `ChartPreset` | `presetOf('full')` = `{ t0: T0, t1: T2000 }` 고정 | 보기 창 |
| `accum-chart.ts:242-256` | `avgPxPointsOf(payload)` | `{ avg_px }` → `[t, px][]` · 키 없음/모양 어긋남 `[]` · **배열 순서 그대로** | 누적 평단 점(D-15) |
| `accum-chart.ts:464` | `orderRadiusOf` | — | (원 반지름 — `tickCirclesOf` 가 씀) |
| `hooks/use-chart-view.ts:88-196 · 213-331` | `useChartView({ bounds, lastTradeMs, minViewMs })` · `useChartGestures(svgRef, {L, W, R}, ctl, inspectingRef)` | `ctl.view · preset · setPreset · schedule · onKeyDown` | 그대로(수정 금지 — UI-SPEC S1) |
| `hooks/use-chart-width.ts:15-31` | `useChartWidth()` | 첫 그림 640 폴백 → layout effect 측정 | 그대로 |
| `lib/touch-inspect.ts:39 · 124` | `createTouchInspect` · `touchTipTopOf` | — | 폰 길게 누르기 |
| `lib/ticks/tick-format.ts:14 · 38 · 45 · 57` | `MINUS` · `fmtAmountC` · `fmtSignedAmountC` · `fmtQty` | — | 금액 글자 |
| `components/ticks/tick-chart-range.tsx` | `TickChartRange` | 구간 합계 줄 | 그대로 |
| shared `ticks/team-pnl.ts:24-38 · 201-228` | `TeamPnl`(`ret: number \| null` = `total_val / buy_val`) · `fillsUpTo` · `pnlAt` | — | `teamKpiAt` 경유 |

### export 되어 있지 않아 새 파일에서 복제하거나 「export 만 더하기」 할 것

| 원천 | 비공개 항목 | 권고 |
|------|-------------|------|
| `tick-chart.tsx:137-142` | `fmtSpan(ms)` | 새 파일에 복제(6줄) |
| `tick-chart.tsx:145-150` | `cumLegendOf(accum, isToday, hasCum, nxt)` | 봉 차트 캡션 문구가 다르다(UI-SPEC S9 「누적 = 매집감지 보고서 값 · 우리 체결 제외」 · 미등록/포지션 없음 문구만 같음) → 새 함수로 |
| `tick-chart.tsx:153-171 · 179-252` | `OwnDiamond` · `TickGroupBox` | **둘 중 하나 선택(Open Question 1):** ⓐ `tick-chart.tsx` 에 `export` 키워드만 더하기(CONTEXT 재량 「export 만 더하기 허용」) ⓑ 새 파일로 복제(약 95줄). 성공 기준 1 문구를 가장 좁게 읽으면 ⓑ |
| `tick-chart.tsx:122-134 · 174 · 176` | `CLICK_SLOP_PX` · `WRAP_PAD_Y` · `anchorOf` · `KBD` · `sgnCls` · `PX_FMT` | 복제(상수 · 짧은 함수) |
| `tick-chart-band.tsx:19-45` | `Head` · `Row` · `Kv` · `Rest` | UI-SPEC 이 「export 만 더해 재사용」 을 지정 — `tick-chart-band.tsx` 는 동작 변경 없이 `export` 4개 추가 |
| `tick-chart.ts:220-241` | `lowerBoundF` · `upperBoundF` | 복제(봉 시작 시각 이분 탐색) — 또는 `priceIdxAt` 재사용 |
| `accum-chart.ts:269-300` | `avgPxPathOf` 는 export 지만 **`yOfPrice(range)` 가 매집감지 판(`ACCUM_CHART`) 치수에 묶여** 봉 차트에 못 씀 | 같은 계단 · 끊김 규칙을 y 주입형 `cumAvgPathOf` 로 새로 작성(Code Example 5) |

### `tick-chart.tsx` 변경 범위(SC-1 · D-24 · UI-SPEC S1)

[VERIFIED: tick-chart.tsx:98-120 props · 254-267 구조분해 · 645-648 제목 줄]

| 변경 | 위치 | 동작 영향 |
|------|------|-----------|
| props 3개 추가: `titleAddon?: ReactNode` · `initialView?: ChartViewSnap` · `onViewChange?: (v: ChartViewSnap) => void` | `TickChartProps` · 구조분해 | 안 넘기면 없음 |
| `{titleAddon}` 를 `<h2>타임라인</h2>` 바로 뒤에 렌더 | 647-648 사이 | 안 넘기면 `undefined` → 렌더 없음 |
| 마운트 1회 적용 effect · 보기 창 알림 effect | `ctl` 선언 뒤 | 안 넘기면 아무것도 안 함 |
| (선택) `OwnDiamond` · `TickGroupBox` 앞 `export` | 153 · 179 | 동작 무변 |

검증: `git diff --stat webapp/src/components/ticks/tick-chart.tsx` 가 위 범위뿐 · 기존 `tick-chart.test.tsx`(555줄) · `tick-viewer-live.test.tsx` 무수정 통과. 새 props 테스트는 **새 파일**(`tick-chart-view-sync.test.tsx`)에 둔다.

### Pattern 1: `CandlePanels` — 기존 판 함수를 새 y 에서 돌리기
**What:** 봉 차트 판 경계를 `TickPanels` 와 같은 키 이름으로 만들고 수익률 판 키만 더한다. 기존 함수는 `p.y2a` 등 이름으로만 읽으므로 새 위치에서 그대로 돈다.
**When:** 순매수 · 10분 · 누적 거래대금 판, 원 · 우리 점 판정, 툴팁 위치.
```typescript
// 치수: 42-UI-SPEC.md 「봉 차트 치수」 표(검산 420 / 303)
export const CANDLE_CHART = {
  desktop: { TOP: 7, H1: 160, AMT: 32, GAP: 7, HR: 50, H2: 70, H3: 40, H4: 50, LB: 15, H: 420 },
  phone:   { TOP: 0, H1: 110, AMT: 22, GAP: 7, HR: 36, H2: 50, H3: 28, H4: 36, LB: 15, H: 303 },
} as const;

export interface CandlePanels extends TickPanels {
  /** 봉 영역 아래 = y1b − AMT(거래대금 막대 위끝). */
  yCb: number;
  /** 수익률 판. */
  yRa: number;
  yRb: number;
}

export function candlePanelsOf(d: (typeof CANDLE_CHART)['desktop'] | (typeof CANDLE_CHART)['phone']): CandlePanels {
  const y1a = d.TOP;
  const y1b = y1a + d.H1;
  const yRa = y1b + d.GAP;
  const yRb = yRa + d.HR;
  const y2a = yRb + d.GAP;
  const y2b = y2a + d.H2;
  const y3a = y2b + d.GAP;
  const y3b = y3a + d.H3;
  const y4a = y3b + d.GAP;
  const y4b = y4a + d.H4;
  return { y1a, y1b, yCb: y1b - d.AMT, yRa, yRb, y2a, y2b, y3a, y3b, y4a, y4b, H: y4b + d.LB };
}
// 봉 영역 y = yOfTickPrice(range, { ...P, y1b: P.yCb })  — 위아래 3px 규칙 그대로(UI-SPEC 「판 안 여백」)
// 원 · 우리 점 판정 = nearestTickCircleOf(circles, mx, my, P) — P.y1a/y1b = 가격 판 전체(막대 포함)
```

### Pattern 2: 분봉 집계 — 1분봉 한 번 → 상위 단위는 1분봉에서
**What:** 세션당 한 번 수신순 A3 를 훑어 1분봉(최대 720칸)을 만들고, 5 · 10 · 15 · 30 · 60분봉은 1분봉을 묶는다. 모든 단위가 08:00 정시에 맞물린다(60분봉 = 정시 시작 · UI-SPEC S5).
**거름 규칙 = `turnoverSeriesOf` 와 같다:** `a3Of[r] ≥ 0` · `duplicates[r] !== 1` · `px > 0` · `qty > 0`. 이러면 봉 거래대금 합 = 넷째 판 누적 거래대금 증가분 = 구간 합계 `tv` 와 같은 수가 된다(세 숫자가 서로 맞는다). [VERIFIED: tick-chart.ts:612-618]
**경계:** `k = floor((recvMs − T0) / 60_000)` · `0 ≤ k < 720` 밖은 버린다(T0 = 08:00 KST). KST 오프셋이 정시 단위라 벽시계 경계와 같다.
**캐시:** `WeakMap<TickSession, { base: Candles; byUnit: Map<CandleUnit, Candles> }>`. 당일 증분은 `appendTickBytes` 가 **세션을 처음부터 다시 만들어 새 객체를 돌려주므로**(tick-session.ts:345-358) 새 키로 자연히 다시 집계된다 — 「마지막 봉만 갱신」 로직 불필요. UI-SPEC S5 의 「당일 화면은 마지막 봉만 새 틱으로 갱신」 은 결과(사용자에게 보이는 것) 기준으로 이 방식이 만족한다.
**정확성:** 가격 · 수량이 정수 원 · 정수 주라 Σ(px × qty) 는 2^53 아래에서 정확 — 1분봉 합을 다시 더해도 직접 합과 비트까지 같다(단위 테스트에서 `toBe` 로 비교 가능).

### Pattern 3: 이동평균 — 그날 봉만 · 모자라면 null
- 봉 SMA N: `i ≥ N−1` 일 때 `Σ c[i−N+1..i] / N`(누적합 배열로 O(n)).
- 봉 EMA N: `α = 2 / (N + 1)` · `ema[N−1] = SMA(앞 N)` · `ema[i] = α·c[i] + (1−α)·ema[i−1]` · 그 전 null.
- 일 SMA N(D-11): `prevCloses` = 보는 날짜 **앞** 거래일 종가 오름차순(최대 239개) · 길이 < N−1 이면 선 전체 null · 아니면 `S = Σ 마지막 N−1개` · `v[i] = (S + c[i]) / N`.
- 경로: 봉 가운데 x 를 잇되 이웃 봉 시작 간격 > 30분이면 끊음(UI-SPEC Researcher Decision 9) · 봉 영역으로 클립.
- 결과를 `Float64Array`(null = NaN)로 `(session, unit, 선 정의, prevCloses)` 마다 메모.

### Pattern 4: 당일 수익률 시계열 — `teamKpiAt` 를 시각마다(D-14 · SC-4)
**What:** 패널 「평단 대비 수익률」 = `teamKpiAt(session.team, session, cursorRec).pnl?.ret`(tick-team-panel.tsx:76 · 95). 선도 **같은 함수**를 rec 마다 부른다.
- 샘플: 그림 폭 열 c 마다 `t_c = view.t0 + (c+1)/cols × span` → `i = priceIdxAt(series, t_c)` → `rec = series.rec[i]`(앞 열과 같으면 건너뜀) + 보기 창 안 팀 체결 rec(`team.fills[k].rec`) + **커서 rec**(커서 x 에서 선이 패널 값을 정확히 지나게).
- 각 점 값 = `teamKpiAt(team, session, rec).pnl?.ret ?? null` · x = 그 rec 수신 ms · null 이면 끊김(팀 첫 매수 전 · 매도만 있어 `buy_val` 0).
- 값 띠(마우스 · 커서): 떼면 `teamKpiAt(team, session, cursorRec)` 그대로(= 패널 · 비트까지 같음) · 마우스 시각 t 면 `rec = series.rec[priceIdxAt(series, t)]`.
- 비용: `teamKpiAt` = 이분 탐색(BigInt) + 객체 1개 — 열 ≤ 약 2,000 · 렌더당 1ms 미만 [ASSUMED]. `useMemo([session, view.t0, view.t1, plotW, cursorRec])` 로 마우스 이동 재렌더에서는 다시 안 센다.
- **정의 주의:** `ret = total_val / buy_val`(실현 + 미실현 ÷ 누적 매수 금액 · team-pnl.ts:117-128) — `(가격 − 평단) ÷ 평단` 이 아니다. 누적 수익률(D-15)은 후자다. 두 선의 정의가 다르다는 것을 테스트 이름 · 주석에 남긴다.

### Pattern 5: 보기 창 주고받기(D-24)
```typescript
// 공용 타입(새 파일 예: lib/ticks/chart-view-sync.ts — tick-chart.tsx 가 import)
export interface ChartViewSnap { t0: number; t1: number; preset: ChartPreset | null }

// 두 차트 공통 — ctl = useChartView(...) 뒤
const initRef = useRef(initialView);           // 마운트 때 값만(그 뒤 바뀌어도 다시 적용 안 함)
const appliedRef = useRef(initialView == null || initialView.preset === 'full');
useLayoutEffect(() => {
  const iv = initRef.current;
  if (appliedRef.current || iv == null) return;
  appliedRef.current = true;                    // StrictMode 이중 실행 방어
  if (iv.preset !== null) ctl.setPreset(iv.preset);   // 동기 commit
  else ctl.schedule(() => ({ t0: iv.t0, t1: iv.t1 })); // clampView(10초 · 08:00 ~ 20:00)가 자른다
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
useEffect(() => {
  if (!onViewChange || !appliedRef.current) return;   // 적용 전 기본 창(full)으로 덮어쓰지 않게
  onViewChange({ t0: view.t0, t1: view.t1, preset: ctl.preset });
}, [view, ctl.preset, onViewChange]);
```
- 뷰어는 `lastViewRef = useRef<ChartViewSnap | null>(null)` 에 두고(렌더 없음 · 휠마다 뷰어 재렌더 금지 — UI-SPEC S1) `onViewChange` 는 `useCallback` 로 고정.
- 종목 · 날짜 · 거래소가 바뀌면 `TickViewer` 가 `key={session.key}`(= `${date}|${ex}|${isin}`)로 다시 마운트돼 ref 가 자동으로 비워진다(tick-viewer-page.tsx:625 · 681 · tick-session.ts:150-152). 당일 증분은 같은 key 라 유지 · 409 epoch 재수신만 `generation` 이 올라 다시 마운트(기존 동작과 같음).
- `presetOf('full')` 은 `{ T0, T2000 }` 고정이라(accum-chart.ts:1192) 「전체」 를 이름으로 넘기면 받는 쪽은 아무것도 안 해도 된다(기본이 full).

### Pattern 6: 일별 종가 — 앞 거래일 N−1 개만
```typescript
// lib/ticks/daily-closes.ts — fetchDailyOhlcv 와 같은 클라이언트 · 같은 정지 행 처리
export async function fetchPrevCloses(code: string, ymd: string, n: number, signal?: AbortSignal): Promise<number[]> {
  const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;   // TickSession.date = 'YYYYMMDD'
  let q = createClient()
    .from('stock_daily_ohlcv')
    .select('date, close')
    .eq('code', code)
    .lt('date', iso)                       // 그날(장중 intraday upsert 행 포함)은 뺀다
    .order('date', { ascending: false })   // 정렬 명시(PostgREST 기본 순서 없음 — daily-ohlcv-api Pitfall 7)
    .limit(n);
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => Number(r.close)).filter((c) => c > 0).reverse(); // 오름차순 · close 0 행 제외
}
```
- 권한: `stock_daily_ohlcv` SELECT 정책 `TO anon, authenticated USING (true)` [VERIFIED: supabase/migrations/20260515163000_fix_stock_daily_ohlcv_rls_authenticated.sql]. 이후 마이그레이션에 이 표의 정책 · 권한 변경 없음(grep).
- 열 타입 `date date` · `close numeric(20,2)` → JS 에서 문자열로 올 수 있어 `Number()` [VERIFIED: 20260512120000_create_stock_daily_ohlcv.sql].
- 종목 코드: `TickOpenResponse.stock.code` — 지금 `TickViewer` 에 내려가지 않는다 → `tick-viewer-page.tsx` 두 곳(625 · 681 근처)에 `stockCode={view.resp.stock?.code ?? null}` 추가 필요.
- 호출 시점: 일 칩이 하나라도 있을 때(켜짐 · 꺼짐 무관 권고 — 켜고 끌 때 다시 안 받게) · **항상 239개 한 번**(최대 기간 240 − 1)이면 칩을 더해도 다시 안 받는다. `(code, ymd)` 마다 1회 · 실패는 캡션 줄(UI-SPEC S9) · 받는 중은 선 없음 · 캡션 없음(UI-SPEC E6 unresolved 의 플래너 가정 채택 권고).

### Pattern 7: 브라우저 기억 — 순수 read/write + 구독
저장소 관례: 키 접두 `gh-radar:` · 순수 함수 파일 + `useSyncExternalStore`(서버 스냅숏 = 기본값) · 쓰기 실패 조용히 무시. [VERIFIED: webapp/src/lib/sidebar-collapse.ts:17 `export const SIDEBAR_COLLAPSED_KEY = 'gh-radar:sidebar-collapsed';` · 46-57 try/catch · 60-65 구독 · hooks/use-sidebar-collapsed.ts `useSyncExternalStore(subscribe, get, () => false)`]
키(UI-SPEC S10 결정): `gh-radar:tick-chart-kind`(`"line" | "candle"`) · `gh-radar:tick-candle-unit`(`"auto" | "1" | "5" | "10" | "15" | "30" | "60"`) · `gh-radar:tick-candle-ma`(`{ v: 1, lines: [{ base: "bar" | "day", n, kind: "sma" | "ema", on, color }] }`) [CITED: 42-UI-SPEC.md S10]
```typescript
// getSnapshot 은 같은 원문이면 같은 객체를 돌려줘야 한다(아니면 useSyncExternalStore 무한 재렌더)
let lastRaw: string | null | undefined;
let lastVal: MaConfig = DEFAULT_MA;
export function readMaConfig(): MaConfig {
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(MA_KEY); } catch { return DEFAULT_MA; }
  if (raw === lastRaw) return lastVal;
  lastRaw = raw;
  lastVal = raw === null ? DEFAULT_MA : parseMaConfig(raw);   // 항목 단위 검사 · [] 존중 · 7번째부터 버림 · 색 재배정
  return lastVal;
}
```

### Pattern 8: 봉 층은 색별 path 몇 개 + `useMemo`
선 차트는 마우스가 1px 움직일 때마다 컴포넌트 전체를 다시 그린다(tick-chart.tsx:524-525 · 「viewBox 1px 당 많아야 한 번」). 봉 차트에서 봉마다 `<rect>`·`<line>` 을 만들면 1분봉 하루 전체 = 720 × 3 요소를 매 픽셀 재생성한다. **오름 몸통 · 내림 몸통 · 오름 꼬리 · 내림 꼬리 · 오름 막대 · 내림 막대 = path 6개**를 `useMemo([candles, view.t0, view.t1, L, xr, range.lo, range.hi, P])` 로 만든다(몸통 `M x,y h w v h h −w Z` 이어 붙임 · 꼬리 `M x,y1 V y2`). 이동평균 · 수익률 경로도 같은 방식으로 메모. 마우스 재렌더에서는 세로선 · 점 · 띠만 바뀐다.

### 복제할 조작 골격(SC-6 · D-19)

`tick-chart.tsx` 의 아래 덩어리를 거의 그대로 `candle-chart.tsx` 로 옮기고 판 상수만 `P`(CandlePanels)로 바꾼다. [VERIFIED: tick-chart.tsx 해당 줄]

| 덩어리 | 원 위치 | 바꿀 것 |
|--------|---------|---------|
| 폭 · 보기 창 · 제스처 · 잠금 ref | 268-290 | `phone` 판정에 `CANDLE_CHART` · `L = priceAxisWidthOf(series.maxPx)` 그대로 |
| 터치 살펴보기 · touchmove 비수동 리스너 | 297-326 | 그대로 |
| 구간 합계 상태 · Esc · 알약 | 328-352 · 471-488 · 965-1002 | 알약 y 기준 `P.y2a − 15` → 수익률 판 위(`P.yRa − 15`) 권고 |
| 커서 따라가기 effect | 362-375 | 그대로 |
| pickAt · inPlot · tAt · 터치 앵커 | 424-447 | `inPlot` 하단 = `P.y4b` · 가격 판 판정 = `P.y1a/y1b` |
| 호버 세로선 · 값 점 | 457-469 · 1004-1030 | 점에 수익률 판 당일/누적 · 가격 판 = 그 봉 종가(UI-SPEC S7) |
| pointer down/move/up · click · ownHitOf · goOwn | 490-621 | 그대로 |
| 키(`+ − 0`) · zoomTo · zoomBy · 확대 버튼 5개 | 623-694 | 버튼 클래스 폰 `h-8 min-w-7 px-1`(UI-SPEC S4) |
| 툴팁 상자 위치 | 1192-1221 | `P.H` 그대로 |

### Anti-Patterns to Avoid
- **두 차트를 다 마운트하고 하나를 숨기기:** 숨은 쪽 `useChartWidth` 가 0 → 640 폴백 · 두 배 렌더 · 제스처 리스너 이중. 조건부 렌더 + D-24 입력으로 창을 넘긴다.
- **`useChartView` 에 초기 창 인자 추가:** UI-SPEC S1 이 훅 수정 금지. 마운트 effect 로 적용한다.
- **봉 집계에 `priceSeriesOf` 재사용:** 수량이 없고 중복 수신을 포함한다(tick-chart.ts:196-213). 거래대금이 넷째 판과 어긋난다.
- **당일 수익률을 `(가격 − teamAvgAt) ÷ 평단` 으로 계산:** 패널(`ret = total ÷ buy_val`)과 다른 수가 된다 — SC-4 실패.
- **기존 data-slot(`tick-chart` · `tick-chart-svg` 등) 재사용:** 기존 단위 · e2e 셀렉터(`[data-slot="tick-chart-svg"]` 높이 307 단언 등)가 봉 차트를 잡을 수 있다. 새 차트는 `candle-*` 접두를 쓴다.
- **`avgPxPathOf` 직접 호출:** 매집감지 판 y(`ACCUM_CHART`)로 그려 위치가 틀린다.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 팀 손익 · 수익률 | 평균단가법 재구현 | `teamKpiAt` → shared `pnlAt`(은행가 반올림 · 파이썬 골든 일치) | 정의 분기 = SC-4 실패 · 골든 테스트 이탈 |
| 누적 평단 점 파싱 | `payload.avg_px` 직접 읽기 | `avgPxPointsOf` | 키 없음 · 길이 불일치 · 비유한 수 방어 + 같은 ms 두 점 순서 보존이 이미 있다 |
| 누적(이월 포함) 값 · 끊김 | 계단 재계산 | `cumPointsOf` · `cumNetAt` · `cumStairsOf` | cycle · end 끊김 규칙 |
| 보기 창 · 휠 · 핀치 · rAF 합치기 | 새 제스처 훅 | `useChartView` · `useChartGestures` | passive 휠 · pointer capture · 넘김 규칙 |
| 시각 눈금 · 축 폭 | 새 눈금 | `tickTicksOf` · `priceAxisWidthOf` | 두 차트 x 축 · 축 폭이 같아야 전환 때 안 튄다 |
| 원 · 묶음 · 우리 점 판정과 툴팁 | 새 판정 | `tickCirclesOf` · `nearestTickCircleOf` · `tickOrderHoverOf` · `ownMarksOf` · `ownMarkAt` · `tickHoverWithOwn` | Phase 38 D-08 · D-10 · D-16 규칙 |
| 구간 합계 | 새 합산 | `tickRangeSumOf` · `TickChartRange` | 스케치 028 ③ 규칙 · 넷째 판과 같은 수 |
| 팝오버 ↔ 시트 갈림 | 새 미디어 쿼리 훅 | `push-alert-bell.tsx` 패턴(`DESKTOP_QUERY = "(min-width: 768px)"` · `useSyncExternalStore` · `isNativeApp` 마운트 뒤 판정 · 열림 상태 하나) | [VERIFIED: push-alert-bell.tsx:38-63 · 77-147] |
| 금액 · % 글자 | 새 포맷터 | `fmtAmountC` · `fmtSignedAmountC` · `pct1` · `pct2` | 스케치 010 C 축약 |

**Key insight:** 이 phase 의 위험은 「새 계산을 만드는 것」 이 아니라 「기존 계산과 다른 수를 화면에 내는 것」 이다. 패널 · 넷째 판 · 구간 합계와 같은 함수를 부르면 세 숫자가 구조적으로 맞는다.

## Runtime State Inventory

리네임 · 마이그레이션 phase 가 아니다(덧붙이기만). 확인 결과:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `limitup_accum_flow.payload.avg_px` — 이미 적재(2026-10-21 이후 행). 새 저장 없음 | 없음(읽기만) |
| Live service config | 없음 — Vercel · Cloud Run env 변경 없음 | 없음 |
| OS-registered state | 없음 | 없음 |
| Secrets/env vars | 없음 — 새 키 · 새 비밀 없음 | 없음 |
| Build artifacts | `packages/shared` 타입 변경 → `pnpm --filter @gh-radar/shared build` 후 webapp/server 타입 검사(설정 `build_command`) | 빌드 순서만 |
| 브라우저 저장소(사용자 기기) | 새 키 3개 — 옛 값 없음 · 되돌리기 시 남아도 무해 | 없음 |

## Common Pitfalls

### Pitfall 1: 처음 보기 창이 한 프레임 「하루 전체」 로 보였다 바뀐다
**What goes wrong:** `useChartView` 초기 상태는 늘 `presetOf('full')`(use-chart-view.ts:98-101) · 숫자 창은 `schedule`(rAF) 경유라 첫 그림 뒤에 적용될 수 있다.
**How to avoid:** `useLayoutEffect` 에서 적용(Pattern 5) · 프리셋이면 `setPreset`(동기 commit). 깜박임이 실기기에서 거슬리면 `appliedRef` 가 false 인 동안 SVG 에 `visibility:hidden` 을 거는 정도로 막는다(훅 수정 금지 범위 안). [ASSUMED — rAF 와 React 19 커밋 순서에 따라 깜박임 유무가 달라 실기기 확인 필요]
**Warning signs:** 전환 직후 봉이 하루 전체로 잠깐 납작해졌다 펴짐.

### Pitfall 2: 마운트 직후 알림이 기억한 창을 덮어쓴다
**What goes wrong:** 새 차트가 마운트되면 `view` = full 인 상태로 `onViewChange` effect 가 먼저 돌아 뷰어 ref 를 full 로 덮는다. 사용자가 그 프레임 안에 다시 전환하면 창을 잃는다.
**How to avoid:** `appliedRef` 가 true 가 된 뒤에만 알린다(Pattern 5).

### Pitfall 3: StrictMode 이중 effect
**What goes wrong:** `reactStrictMode: true`(next.config.ts) — 개발 모드에서 마운트 effect 가 두 번. `schedule` 은 같은 창이면 false 라 무해하지만 `setPreset` · 알림 · `fetchPrevCloses` 가 두 번 돈다.
**How to avoid:** ref 플래그 · `AbortController` 정리 함수.

### Pitfall 4: 봉 집계 거름 규칙이 넷째 판과 다르다
**What goes wrong:** 중복 수신(`duplicates[r] === 1`)을 넣으면 봉 거래대금 합이 누적 거래대금 판 · 구간 합계보다 커진다.
**How to avoid:** `turnoverSeriesOf` 와 같은 네 조건(Pattern 2). 단위 테스트 오라클도 같은 규칙으로 직접 합산.

### Pitfall 5: 08:00 이전 · 20:00 이후 수신 체결
**What goes wrong:** `k < 0` 이나 `k ≥ 720` 을 그대로 쓰면 배열 밖 쓰기.
**How to avoid:** 범위 밖은 버린다(차트 창 자체가 `clampView` 로 08:00 ~ 20:00 밖을 못 보인다).

### Pitfall 6: 수익률 선과 패널 값이 1틱 어긋남
**What goes wrong:** 패널은 커서 rec 의 **거래소순** 마지막 A3(`lastA3[exPos[rec]]`)로 자르고, 선이 수신 시각 열의 마지막 A3 rec 만 쓰면 커서 x 에서 이웃 rec 값이 보인다.
**How to avoid:** 커서 rec 를 샘플에 넣고, 값 띠는 커서일 때 `teamKpiAt(team, session, cursorRec)` 를 그대로(Pattern 4). 테스트: 패널 `data-slot="tick-team-ret"` 글자 = 봉 차트 값 띠 수익률 글자(같은 `fmtRet` 규칙 · 소수 2자리).

### Pitfall 7: `teamKpiAt` 평단 vs `teamAvgAt` 평단
**What goes wrong:** 선 차트 띠 「평단」 은 `teamAvgAt`(수신 시각 `fillMs` 자르기 · tick-chart-tip.ts:127-138), 패널 「당일 평단」 은 `teamKpiAt.avgPx`(거래소 시각 `runMaxNs` 자르기). 같은 시각에서 드물게 다르다.
**How to avoid:** 봉 차트 띠 둘째 칸 「평단 · 수익률」 은 둘 다 `teamKpiAt`(패널과 같은 쌍) 권고 · 가격 판 점점선은 기존 `teamAvgPathOf` 그대로. Open Question 3 로 플래너 확인.

### Pitfall 8: 일 이동평균이 그날 행을 포함
**What goes wrong:** `stock_daily_ohlcv` 에는 장중 intraday upsert 행이 있다(마이그레이션 `20260514120200_intraday_upsert_close_rpc.sql`). `lte(date)` 면 오늘 종가(진행 중)를 「앞 거래일」 로 센다.
**How to avoid:** `.lt('date', 보는 날짜)`.

### Pitfall 9: `useSyncExternalStore` 스냅숏 불안정
**What goes wrong:** `getSnapshot` 이 호출마다 `JSON.parse` 새 객체를 주면 React 가 무한 재렌더 경고/루프.
**How to avoid:** 원문 문자열 캐시(Pattern 7). 같은 탭 쓰기는 리스너 집합으로 알림(storage 이벤트는 다른 탭만 오고, 관례상 탭 간 동기화는 안 함 — sidebar-collapse.ts 머리 주석).

### Pitfall 10: `avg_px` 키 없음 = JSON null
**What goes wrong:** `a.payload->'avg_px'` 는 키가 없으면 SQL NULL → `jsonb_build_object` 가 `"avg_px": null` 을 싣는다(키는 있고 값 null). 2026-10-21 이전 행 · 매집감지 미등록(accum 자체 null) · 당일 화면 세 경우가 모두 「누적 평단 없음」 이어야 한다.
**How to avoid:** `cumAvgPointsOf(accum, isToday)` = `isToday || accum == null ? [] : avgPxPointsOf({ avg_px: accum.avg_px })` — `avgPxPointsOf` 가 null · 비객체 · 배열 아님을 `[]` 로 흡수(accum-chart.ts:243-246). `px ≤ 0` 은 끊김(D-15).

### Pitfall 11: 키 가로채기 — 메뉴 · 양식 안에서 Space · ← →
**What goes wrong:** `useTickCursor` 는 window keydown 에서 ← → · Shift+] [ · Space 를 가로챈다. 입력 칸(`INPUT`)과 `BUTTON`/`A`/`role="button"` 은 건너뛰지만 `role="radio"` 인 `div` 에서 Space 를 누르면 재생이 토글된다. [VERIFIED: use-tick-cursor.ts:68-80 · 259-275]
**How to avoid:** 봉 단위 목록 줄은 `<button role="radio">`(tagName BUTTON → Space 는 버튼 몫) · ↑ ↓ 는 `preventDefault`. 기간 칸은 `Input` 이라 안전.

### Pitfall 12: 포털 이벤트 버블
**What goes wrong:** React 합성 이벤트는 포털(팝오버 · 시트)에서도 React 조상으로 버블된다. 더하기 창을 차트 래퍼(`onKeyDown` = `+ − 0` 확대) 안에서 렌더하면 기간 칸에 「0」 을 칠 때 「하루 전체」 가 눌린다.
**How to avoid:** 조작부 컴포넌트는 제목 줄(래퍼 밖)에서 렌더 — 선 차트 구조와 같다(키 핸들러는 `data-slot="tick-chart-wrap"` div 에만).

### Pitfall 13: 매 픽셀 재렌더에서 봉 요소 재생성
Pattern 8. 확인: 1분봉 고정 + 하루 전체 + 마우스 이동에서 프레임 저하 없는지 실기기(SC-7).

### Pitfall 14: 동시 세션 마이그레이션 · `db push` 가 남의 것까지 민다
**What goes wrong:** Phase 41 · 43 세션이 같은 저장소에 마이그레이션을 커밋해 두었다면 `supabase db push --linked --yes` 가 그것까지 운영에 적용한다. 타임스탬프가 겹치면 순서도 꼬인다.
**How to avoid:** 실행 시점에 `ls supabase/migrations | tail` 로 가장 늦은 번호보다 뒤(지금 최신 = `20261112340000_stock_title_aliases.sql`)로 짓고, 배포 직전 `supabase migration list --linked` 로 보류 중인 것이 이 파일 하나뿐인지 확인. 남의 것이 섞여 있으면 메인 세션에서 사용자 확인.

### Pitfall 15: `CREATE OR REPLACE FUNCTION` 은 적지 않은 속성을 기본값으로
**What goes wrong:** `STABLE` · `SECURITY INVOKER` · `SET search_path` 를 빠뜨리면 기본값(VOLATILE 등)으로 바뀐다(저장소 선례 주석 — 20261020200000_limitup_accum_flow.sql 「Pitfall 2」).
**How to avoid:** 20261103210000 본문을 통째로 복사해 한 줄만 바꾸고 COMMENT · REVOKE · GRANT 도 다시 적는다(메모리: Supabase auto-grant 가 `REVOKE FROM PUBLIC` 을 덮으니 `anon, authenticated` 명시).

## Code Examples

### 1. 1분봉 집계(세션당 1회)
```typescript
// 거름 = turnoverSeriesOf(tick-chart.ts:612-618) · 경계 = tickBoundsOf(date).T0(08:00)
export type CandleUnit = 1 | 5 | 10 | 15 | 30 | 60;
export const CANDLE_UNITS: readonly CandleUnit[] = [1, 5, 10, 15, 30, 60];
export interface Candles {
  unit: CandleUnit;
  n: number;
  t0: Float64Array;   // 봉 시작 ms
  o: Float64Array; h: Float64Array; l: Float64Array; c: Float64Array;
  amt: Float64Array;  // Σ px × qty
}
const MIN_MS = 60_000;
const DAY_MIN = 720;

function buildBase(session: TickSession): Candles {
  const { T0 } = tickBoundsOf(session.date);
  const { recvOrder, a3Of, a3, index, duplicates } = session;
  const t0 = new Float64Array(DAY_MIN), o = new Float64Array(DAY_MIN), h = new Float64Array(DAY_MIN);
  const l = new Float64Array(DAY_MIN), c = new Float64Array(DAY_MIN), amt = new Float64Array(DAY_MIN);
  let n = 0;
  let lastK = -1;
  for (let p = 0; p < recvOrder.length; p++) {
    const r = recvOrder[p]!;
    const j = a3Of[r]!;
    if (j < 0 || duplicates[r] === 1) continue;
    const px = a3.px[j]!;
    const q = a3.qty[j]!;
    if (!(px > 0) || !(q > 0)) continue;
    const k = Math.floor((msOfNs(index.recvNs[r]!) - T0) / MIN_MS);
    if (k < 0 || k >= DAY_MIN) continue;
    if (k !== lastK) {           // 수신순이라 k 는 단조 증가
      t0[n] = T0 + k * MIN_MS; o[n] = px; h[n] = px; l[n] = px; c[n] = px; amt[n] = 0;
      n += 1; lastK = k;
    }
    const i = n - 1;
    if (px > h[i]!) h[i] = px;
    if (px < l[i]!) l[i] = px;
    c[i] = px;
    amt[i]! += px * q;
  }
  const s = (a: Float64Array) => a.subarray(0, n);
  return { unit: 1, n, t0: s(t0), o: s(o), h: s(h), l: s(l), c: s(c), amt: s(amt) };
}
// 상위 단위: 1분봉 i 의 칸 = floor((t0[i] − T0) / (unit × MIN_MS)) — 같은 칸이면 h/l max/min · c = 마지막 · amt 합 · o = 첫
```

### 2. 자동 단위(D-09)
```typescript
export function autoUnitOf(span: number, plotW: number): CandleUnit {
  for (const u of CANDLE_UNITS) if (((u * MIN_MS) / span) * plotW >= 4) return u;
  return 60;
}
```

### 3. 봉 SMA · EMA · 일 SMA
```typescript
export function smaOf(c: Float64Array, N: number): Float64Array {
  const out = new Float64Array(c.length).fill(Number.NaN);
  let s = 0;
  for (let i = 0; i < c.length; i++) {
    s += c[i]!;
    if (i >= N) s -= c[i - N]!;
    if (i >= N - 1) out[i] = s / N;
  }
  return out;
}
export function emaOf(c: Float64Array, N: number): Float64Array {
  const out = new Float64Array(c.length).fill(Number.NaN);
  if (c.length < N) return out;
  const a = 2 / (N + 1);
  let s = 0;
  for (let i = 0; i < N; i++) s += c[i]!;
  let e = s / N;
  out[N - 1] = e;
  for (let i = N; i < c.length; i++) out[i] = e = a * c[i]! + (1 - a) * e;
  return out;
}
export function daySmaOf(c: Float64Array, prevCloses: readonly number[], N: number): Float64Array {
  const out = new Float64Array(c.length).fill(Number.NaN);
  if (prevCloses.length < N - 1) return out;           // 상장 직후 · 자료 부족 = 그리지 않음
  let S = 0;
  for (let k = prevCloses.length - (N - 1); k < prevCloses.length; k++) S += prevCloses[k]!;
  for (let i = 0; i < c.length; i++) out[i] = (S + c[i]!) / N;
  return out;
}
```
> 부동소수 비교: SMA 누적합은 직접 평균과 마지막 비트가 다를 수 있다 — 테스트는 `toBeCloseTo(v, 9)`.

### 4. 당일 수익률 샘플(SC-4)
```typescript
export function dayReturnPointsOf(
  session: TickSession, view: View, plotW: number, cursorRec: number,
): { t: number; v: number | null }[] {
  const s = priceSeriesOf(session);
  const team = session.team;
  const recs = new Set<number>();
  const cols = Math.max(1, Math.ceil(plotW));
  const span = view.t1 - view.t0 || 1;
  let prev = -2;
  for (let col = 0; col < cols; col++) {
    const i = priceIdxAt(s, view.t0 + ((col + 1) / cols) * span);
    if (i >= 0 && i !== prev) recs.add(s.rec[i]!);
    prev = i;
  }
  for (const f of team.fills) {
    const ms = msOfNs(session.index.recvNs[f.rec]!);
    if (ms >= view.t0 && ms <= view.t1) recs.add(f.rec);
  }
  if (cursorRec >= 0) recs.add(cursorRec);
  return [...recs]
    .map((rec) => ({ t: msOfNs(session.index.recvNs[rec]!), v: teamKpiAt(team, session, rec).pnl?.ret ?? null }))
    .sort((a, b) => a.t - b.t);
}
```

### 5. 누적 평단 점 · 계단 경로(y 주입)
```typescript
export function cumAvgPointsOf(accum: TickOpenResponse['accum'] | null | undefined, isToday: boolean): PricePoint[] {
  if (isToday || accum == null) return [];
  return avgPxPointsOf({ avg_px: accum.avg_px } as Pick<AccumReportPayload, 'avg_px'>);
}
// 경로 = avgPxPathOf(accum-chart.ts:269-300) 규칙 그대로(T0 전 점은 T0 에 붙임 · px ≤ 0 이면 닫고 끊음 · 끝 = max(endMs, 마지막 점))
// 다만 y 는 봉 영역 y 함수를 받고, 클램프 대신 「한 점도 범위 안에 없으면 가장자리 글자」(D-16 · UI-SPEC S5)
```

### 6. 마이그레이션(D-18)
```sql
-- supabase/migrations/<20261112340000 보다 뒤>_tick_open_accum_avg_px.sql
-- tick_open_for_user — accum 에 avg_px(누적 평단 계단 · payload.avg_px 그대로)를 더한다 (Phase 42 D-18).
-- 나머지 계약은 20261103210000 그대로. server 는 accum 을 그대로 넘기므로 재배포가 필요 없다(services/ticks.ts openTick).
BEGIN;
CREATE OR REPLACE FUNCTION public.tick_open_for_user(p_user_id uuid, p_date text, p_isin text, p_ex text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_blocked boolean;
BEGIN
  -- (20261103210000 본문 그대로 — 아래 accum 한 줄만 다름)
  ...
    'accum', (SELECT jsonb_build_object('reg_time_ms', a.reg_time_ms, 'pos_net', a.payload->'pos_net',
                                        'avg_px', a.payload->'avg_px')
                FROM public.limitup_accum_flow a
               WHERE a.date = p_date AND a.isin = p_isin),
  ...
END;
$$;
COMMENT ON FUNCTION public.tick_open_for_user(uuid, text, text, text) IS '… + accum.avg_px(Phase 42 D-18) …';
REVOKE EXECUTE ON FUNCTION public.tick_open_for_user(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_open_for_user(uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_open_for_user(uuid, text, text, text) TO service_role;
COMMIT;
```
현재 정의 원문 [VERIFIED: supabase/migrations/20261103210000_tick_open_listing_shares.sql:48-50]:
`'accum', (SELECT jsonb_build_object('reg_time_ms', a.reg_time_ms, 'pos_net', a.payload->'pos_net')` · `FROM public.limitup_accum_flow a` · `WHERE a.date = p_date AND a.isin = p_isin),`
— 이 함수를 다시 정의한 마이그레이션은 `20261102200000_tick_viewer.sql` 과 이 파일 둘뿐(그 뒤 `tick_open_for_user` 를 언급하는 3개 파일은 주석 · 다른 함수) [VERIFIED: grep `FUNCTION public.tick_open_for_user(p_user_id`].

shared 타입 현재 원문 [VERIFIED: packages/shared/src/tick-api.ts:140]: `accum: { reg_time_ms: number | null; pos_net: unknown } | null;`
→ `accum: { reg_time_ms: number | null; pos_net: unknown; avg_px?: unknown } | null;` 권고(`pos_net` 과 같은 `unknown` · 옛 응답 호환 위해 선택 키 · 방어는 `avgPxPointsOf`).
보고서 payload 원문 [VERIFIED: packages/shared/src/accum-report.ts:193]: `avg_px?: { t_ms: number[]; px: number[] };`
서버 통과 원문 [VERIFIED: server/src/services/ticks.ts:235]: `accum: (out.accum ?? null) as TickOpenResponse["accum"],` — `checkOpenShape`(86-101)는 accum 을 보지 않는다.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 판별 툴팁 | 고정 띠 4칸(`tickBandAt`) | 스케치 028 B · 2026-11-04 | 봉 차트도 같은 띠 틀 |
| 당일 자동 폴링 | 「최신 받기」 버튼 증분 · 세션 통째 재생성 | 2026-11-03 | 봉 캐시는 세션 WeakMap 이면 충분 |
| 순매수 판 50 | 70(폰 50) | 스케치 028 ④ | 봉 차트 순매수 판 높이도 70/50(D-07) |

**Deprecated/outdated:** ROADMAP Phase 42 성공 기준 초안 6개 — CONTEXT 의 7개로 교체(플래너 몫).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 마운트 `useLayoutEffect` 에서 `schedule` 로 창을 적용하면 깜박임이 없거나 한 프레임 이하다 | Pitfall 1 · Pattern 5 | 전환 때 순간 깜박임 — 숨김 처리 한 줄로 보완 가능 |
| A2 | 열 ≤ 약 2,000 번 `teamKpiAt` 호출이 렌더당 1ms 미만이다 | Pattern 4 | 확대/이동 끊김 — 메모 키 조정 · 샘플 간격 2px 로 완화 |
| A3 | 1분봉 기반 + 색별 path 6개 구성이면 하루 수십만 체결 종목에서도 선 차트와 체감 같다 | Pattern 2 · 8 · SC-7 | 끊김 — 실기기(폰 포함) 확인이 최종 판정 |
| A4 | A3 가격 · 수량이 정수라 거래대금 합이 float64 에서 정확하다 | Pattern 2 | 테스트를 `toBeCloseTo` 로 바꾸면 됨(위험 낮음) |
| A5 | NXT 화면의 일 이동평균도 KRX 일봉 종가(`stock_daily_ohlcv`)로 계산해도 된다 | Pattern 6 | 사용자가 NXT 종가 기준을 원하면 자료원이 없다 — 캡션으로 밝히거나 NXT 에서 일 선을 끌지 확인 필요 |

## Open Questions (RESOLVED)

> 2026-11-12 플래너 revision 에서 다섯 질문 모두 해소 — 질문마다 아래 **RESOLVED** 줄이 채택한 답과 담당 플랜을 가리킨다. 채택 답의 플랜 정본은 `42-01-PLAN.md` 「실행 환경 메모」 12. 미해소 질문 없음.

1. **`OwnDiamond` · `TickGroupBox` — `tick-chart.tsx` 에 `export` 만 더할까, 새 파일로 복제할까?**
   - What we know: CONTEXT 재량이 「export 만 더하기」 를 허용, 성공 기준 1 문구는 「스위치 연결부 + 선택 입력 2개」.
   - Recommendation: `export` 키워드 2개 추가(동작 무변 · 중복 95줄 회피). 검증 시 diff 에 `export` 두 단어가 보이는 것을 「허용된 export 만 더하기」 로 기록. 사용자가 엄격 해석을 원하면 복제.
   - **RESOLVED: `export` 만 더하기(복제 아님).** 42-01 Task 1 ⑨ 가 두 함수 앞에 `export` 를 붙이고, 42-01 · 42-08 · 42-11 의 `tick-chart.tsx` diff 범위 게이트가 이 두 단어를 허용 줄로 둔다.
2. **일 칩이 꺼져 있을 때도 종가를 받을까?**
   - Recommendation: 일 칩이 하나라도 「있으면」(켜짐 무관) 239개 1회 — 켜고 끌 때 요청 0.
   - **RESOLVED: 일 칩이 하나라도 있으면(켜짐 무관) 앞 거래일 종가 239개를 (종목 코드, 날짜)마다 한 번만 받는다** — 켜고 끌 때 요청 0. 조회 함수 · 훅은 42-03(`fetchPrevCloses` · `usePrevCloses`), 결선은 42-10.
3. **값 띠 둘째 칸 「평단」 의 계산원** — `teamKpiAt.avgPx`(패널과 같음) vs `teamAvgAt`(선 차트 띠 · 점점선과 같음).
   - Recommendation: 패널과 같은 `teamKpiAt`(수익률과 한 쌍). 가격 판 점점선은 기존 그대로.
   - **RESOLVED: 값 띠의 「평단 · 수익률」 은 둘 다 `teamKpiAt`(팀 거래정보 패널과 같은 쌍).** 가격 판 당일 평단 점점선은 기존 `teamAvgPathOf` 그대로. 수익률 점은 42-02, 값 띠는 42-06.
4. **NXT 화면 일 이동평균**(A5) — KRX 일봉 종가로 그려도 되는지.
   - Recommendation: 그대로 그리고 카드 아래 캡션에 따로 밝히지 않음(일 선은 「일봉 차트 값」 의 뜻이 우선). 실행 중 사용자 확인 1회.
   - **RESOLVED: NXT 화면에서도 일 이동평균을 KRX 일봉 종가(`stock_daily_ohlcv`)로 그린다** — 캡션에 따로 밝히지 않는다. 가정 A5 로 42-10 에 기록하고, 42-11 Task 3 UAT 12번 질문으로 사용자에게 확인받는다(답이 「빼 달라」 면 후속 quick — 이 phase 의 구현은 그대로).
5. **`stock` 이 null(종목 마스터 없음)일 때 일 칩** — 코드가 없어 조회 불가.
   - Recommendation: 「일 {N} — 지난 거래일 종가가 모자라 그리지 않아요」 와 같은 캡션으로 처리(새 문구 만들지 않음).
   - **RESOLVED: 기존 「일 {N} — 지난 거래일 종가가 모자라 그리지 않아요」 캡션을 그대로 쓴다(새 문구 없음).** 종가 조회는 하지 않는다. 캡션은 42-06, 결선(코드 없음 → 조회 안 함)은 42-10.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | 빌드 · 테스트 | ✓ | v24.21.0 | — |
| pnpm | 워크스페이스 | ✓ | 11.15.1 | — |
| Docker + `public.ecr.aws/supabase/postgres:17.6.1.104` | pgTAP 러너 | ✓(이미지 로컬 있음) | — | — |
| Supabase CLI | `supabase db push --linked --yes` · `migration list --linked` | ✓ | 2.75.0 | — |
| gcloud(server 배포) | — | 확인 안 함 | — | **server 재배포 불필요**(런타임 변경 0) |
| Vercel(git push) | webapp 배포 | 기존 경로 | — | 수동 `vercel deploy --prebuilt`(메모리) |

**Missing dependencies with no fallback:** 없음.
**확인한 명령:** `pnpm exec vitest --run src/lib/ticks/__tests__/tick-chart.test.ts --maxWorkers=2`(cwd `webapp/`) → 32 passed · 1.02s(2026-11-12 21:01).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^2.1.9(jsdom · globals · setup `tests/setup.ts`) · pgTAP(일회용 컨테이너) · Playwright ^1.59.1(선택) |
| Config file | `webapp/vitest.config.ts`(maxWorkers 기본 2) · `server/vitest.config.ts` · `webapp/playwright.config.ts`(baseURL 3100) |
| Quick run command | `cd webapp && pnpm exec vitest --run src/lib/ticks/__tests__/candle-chart.test.ts --maxWorkers=2` |
| Ticks suite | `cd webapp && pnpm exec vitest --run src/lib/ticks src/components/ticks src/styles --maxWorkers=2` |
| Full suite command | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest --run --maxWorkers=2` + `pnpm --filter @gh-radar/server exec vitest --run tests/routes/ticks.test.ts --maxWorkers=2` |
| DB | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_viewer.test.sql` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC-1 | 기억 키 parse · 기본 「line」 · 쓰기 실패 무시 · 빈 배열 존중 · 항목 단위 거름 · 색 재배정 | unit | `vitest --run src/lib/ticks/__tests__/candle-prefs.test.ts` | ❌ Wave 0 |
| SC-1 | 스위치 누르면 봉 차트 · 다시 선 차트 · 보던 창 유지(onViewChange → initialView) · 종목 바뀌면(key) 처음 창 | component | `vitest --run src/components/ticks/__tests__/chart-kind-switch.test.tsx` | ❌ Wave 0 |
| SC-1 | `TickChart` 새 props: 안 주면 기존과 같음 · `initialView` 마운트 1회 · `onViewChange` 호출 · `titleAddon` 렌더 | component | `vitest --run src/components/ticks/__tests__/tick-chart-view-sync.test.tsx` | ❌ Wave 0 |
| SC-1 | 기존 선 차트 테스트 무수정 통과 | regression | `vitest --run src/components/ticks/__tests__/tick-chart.test.tsx src/lib/ticks/__tests__/tick-chart.test.ts src/lib/ticks/__tests__/tick-chart-tip.test.ts src/components/ticks/__tests__/tick-viewer-live.test.tsx` | ✅ |
| SC-1 | 선 차트 파일 diff 범위 | manual/script | `git diff --stat <phase 시작>.. -- webapp/src/components/ticks/tick-chart.tsx` 검토 | — |
| SC-2 | 1 · 5 · 10 · 15 · 30 · 60분 OHLC · 거래대금 = 직접 집계(중복 · 가격 0 · 수량 0 · 08:00 전 제외) · 빈 분 봉 없음 · 단일가 포함 | unit | `vitest --run src/lib/ticks/__tests__/candle-chart.test.ts -t 집계` | ❌ Wave 0 |
| SC-2 | 자동 단위 = 4px 이상 가장 작은 단위 · 없으면 60 | unit | 같은 파일 `-t 자동` | ❌ Wave 0 |
| SC-2 | 캐시: 같은 세션 · 단위 → 같은 객체(=== ) · 새 세션 → 새 집계 | unit | 같은 파일 `-t 캐시` | ❌ Wave 0 |
| SC-3 | SMA · EMA · 일 SMA 정의식(`toBeCloseTo`) · 봉 수 < N 앞 구간 NaN · 종가 < N−1 이면 전부 NaN · 30분 공백 끊김 | unit | `vitest --run src/lib/ticks/__tests__/candle-chart.test.ts -t 이동평균` | ❌ Wave 0 |
| SC-3 | `fetchPrevCloses` 질의 모양(`lt` · 내림차순 · limit · reverse · close 0 제외) | unit(supabase mock) | `vitest --run src/lib/ticks/__tests__/daily-closes.test.ts` | ❌ Wave 0 |
| SC-3 | 더하기 창 검증(2 ~ 240 · 같은 선 · 일+지수 불가 · 6개 상한 aria-disabled) | component | `vitest --run src/components/ticks/__tests__/candle-ma-form.test.tsx` | ❌ Wave 0 |
| SC-4 | 수익률 점 값 = `teamKpiAt(...).pnl.ret` · 커서 rec 포함 · 첫 매수 전 null | unit | `vitest --run src/lib/ticks/__tests__/candle-returns.test.ts` | ❌ Wave 0 |
| SC-4 | 봉 차트 값 띠 수익률 글자 = `TickTeamPanel` `[data-slot="tick-team-ret"]` 글자(같은 세션 · 같은 커서) | component | `vitest --run src/components/ticks/__tests__/candle-chart.test.tsx -t 패널` | ❌ Wave 0 |
| SC-4 | 원 · ◆ ○ 가 봉 차트 가격 판 안에 그려짐(data-slot 개수) | component | 같은 파일 `-t 겹침` | ❌ Wave 0 |
| SC-5 | `cumAvgPointsOf`: 당일 [] · accum null [] · avg_px null/없음 [] · px 0 끊김 · T0 전 점 | unit | `candle-chart.test.ts -t 누적` | ❌ Wave 0 |
| SC-5 | RPC: avg_px 없는 행 → `accum->'avg_px'` = JSON null · 있는 행 → payload 그대로 · pos_net 불변 · 권한 불변 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_viewer.test.sql` | ✅ 파일 있음 · 단언 추가 필요 |
| SC-5 | server 가 accum.avg_px 를 그대로 넘김 | unit | `pnpm --filter @gh-radar/server exec vitest --run tests/routes/ticks.test.ts --maxWorkers=2` | ✅ 픽스처 수정 |
| SC-6 | 빈 곳 클릭 → onSeekMs · 원 클릭 → onJumpRec · ◆ 클릭 → onOwnJump · Shift+끌기 → 구간 줄 · 확대 버튼 · `+ − 0` | component | `candle-chart.test.tsx -t 조작` | ❌ Wave 0 |
| SC-6 | 폰 길게 누르기 · 휠/핀치 체감 · 폰 제목 줄 가로 밀기 | manual | 실기기 390 · 데스크톱 | — |
| SC-7 | 캐시 1회(위) + 하루 수십만 체결 실기기 체감 | unit + manual | — | — |
| (토큰) | `--ma-1` ~ `--ma-6` 라이트/다크 정의 · oklch 없음 · 기대값 | unit | `vitest --run src/styles/__tests__/tds-tokens.test.ts` | ✅ 수정 |

### Sampling Rate
- **Per task commit:** 그 task 의 테스트 파일 하나(`--maxWorkers=2`).
- **Per wave merge:** Ticks suite + `pnpm --filter @gh-radar/webapp run typecheck`(shared 바뀐 wave 는 shared build 먼저).
- **Phase gate:** Full suite + pgTAP + server ticks 테스트 green → `/gsd-verify-work`. Playwright 는 다른 세션과 겹치지 않을 때 `--workers=1` 로만(선택 — 기존 `ticks-viewer.spec.ts` 「차트 — … 데스크톱 307」 회귀 확인용).

### Wave 0 Gaps
- [ ] `webapp/src/lib/ticks/__tests__/candle-chart.test.ts` — SC-2 · SC-3 · SC-5(픽스처 `@/test-fixtures/tick-synth` `synthSession` · `a3Msg` · `synthNs`(13:00 KST + ms) 재사용)
- [ ] `webapp/src/lib/ticks/__tests__/candle-returns.test.ts` — SC-4(team-model.test 의 팀 하루 재사용)
- [ ] `webapp/src/lib/ticks/__tests__/candle-prefs.test.ts` — SC-1 · SC-3 기억
- [ ] `webapp/src/lib/ticks/__tests__/daily-closes.test.ts` — supabase 클라이언트 mock
- [ ] `webapp/src/components/ticks/__tests__/tick-chart-view-sync.test.tsx` · `chart-kind-switch.test.tsx` · `candle-chart.test.tsx` · `candle-ma-form.test.tsx` · `candle-unit-menu.test.tsx`
- [ ] `supabase/tests/tick_viewer.test.sql` D 절 단언 추가 + `plan(138)` 증가
- Framework install: 없음

## Security Domain

`workflow.security_enforcement: false`(`.planning/config.json`) · 메모리 「보안검사 안 함」 — 이 절은 생략한다. 참고로 권한 경계는 바뀌지 않는다(RPC 는 계속 service_role 전용 · `stock_daily_ohlcv` 는 기존 공개 읽기).

## 배포 순서(D-18 · 메모리 규칙)

1. **DB:** 메인 세션에서 `supabase migration list --linked` 로 보류 목록 확인(Pitfall 14) → `supabase db push --linked --yes`. 확인: 과거 등록 종목 하나로 RPC 응답에 `accum.avg_px` 가 보이는지(SQL 편집기 또는 웹 개발도구 네트워크 탭).
2. **server:** 런타임 변경 없음(`accum` 그대로 통과 · shared 는 타입만) → **재배포 생략 가능.** `server/` 디렉터리 diff 가 테스트 파일뿐인지 확인(메모리 「배포 경로는 diff 디렉터리별로 대조」). server 소스를 건드렸다면 그때만 `scripts/deploy-server.sh`(필수 env `GCP_PROJECT_ID` · `SUPABASE_URL` · `CORS_ALLOWED_ORIGINS` — 라이브 Cloud Run env 에서 · 배포 전 운영 이미지가 내 빌드의 조상인지 확인).
3. **webapp:** `git push`(= Vercel 운영 배포). DB 가 먼저 나가 있어야 누적 평단이 보인다 — 순서가 뒤집혀도 키가 없을 뿐 깨지지 않는다(`avgPxPointsOf` 방어).
- 실행자(서브에이전트)는 커밋까지만 — 배포는 메인 세션(메모리 「서브에이전트 배포는 분류기 차단」).

## Sources

### Primary (HIGH confidence — 이 세션에 직접 읽음)
- `webapp/src/lib/ticks/tick-chart.ts`(전체) · `team-model.ts`(전체) · `tick-chart-tip.ts`(전체) · `tick-session.ts`(전체)
- `webapp/src/components/ticks/tick-chart.tsx`(전체) · `tick-chart-band.tsx`(전체) · `tick-viewer.tsx`(전체) · `tick-viewer-page.tsx:600-697` · `tick-team-panel.tsx:1-130`
- `webapp/src/hooks/use-chart-view.ts` · `use-chart-width.ts` · `webapp/src/lib/accum-chart.ts:25-84 · 225-384 · 1170-1212`
- `packages/shared/src/ticks/team-pnl.ts`(전체) · `tick-api.ts:100-175` · `accum-report.ts:160-200` · `ticks/record-index.ts:199-219`
- `supabase/migrations/20261103210000_tick_open_listing_shares.sql`(전체) · `supabase/tests/tick_viewer.test.sql:1-150`
- `server/src/services/ticks.ts:60-238` · `server/tests/routes/ticks.test.ts:230-275`
- `webapp/src/lib/daily-ohlcv-api.ts` · `supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql` · `20260515163000_fix_stock_daily_ohlcv_rls_authenticated.sql`
- `webapp/src/lib/sidebar-collapse.ts` · `hooks/use-sidebar-collapsed.ts` · `components/me/push-alert-bell.tsx:27-147` · `lib/ticks/use-tick-cursor.ts:60-80 · 250-275`
- `webapp/vitest.config.ts` · `webapp/next.config.ts` · `webapp/package.json` · `scripts/verify-dma-orders-price-check.sh` 머리 주석
- `.planning/phases/42-tick-chart-candle-overlay/42-CONTEXT.md` · `42-UI-SPEC.md`(전체)

### Secondary
- `.planning/ROADMAP.md` Phase 42 절 · `.planning/STATE.md`

### Tertiary
- 없음(외부 웹 자료 불필요 — 새 라이브러리 없음)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 새 설치 0 · 전부 저장소 안 확인
- Architecture: HIGH — 재사용 함수 시그니처 · 판 경계 키 이름 · 서버 통과를 원문으로 확인
- Pitfalls: HIGH(1 · 6 · 10 · 11 · 14 · 15 코드 근거) / MEDIUM(1 깜박임 · 13 성능은 실기기)

**Research date:** 2026-11-12
**Valid until:** 2026-12-12(코드 지도는 Phase 41 · 43 이 이 파일들을 건드리지 않는 동안 유효 — 실행 전 `git log -- webapp/src/components/ticks webapp/src/lib/ticks` 로 변경 여부 한 번 확인)
