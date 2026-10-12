---
gsd_state_version: "1.0"
milestone: v1.1
milestone_name: 운영 유지보수
current_phase: 31
status: completed
stopped_at: Phase 31 complete — 마일스톤 v1.1 계속(종료 안 함)
last_updated: "2026-10-12T08:59:45.789Z"
last_activity: 2026-10-12
last_activity_desc: Phase 31 complete
state_head: 3fb8ecbd070c5d499768c546fcaba9184992a8d0
progress:
  total_phases: 2
  completed_phases: 2
  total_plans: 17
  completed_plans: 17
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-12 after Phase 31)

**Core value:** 트레이더가 급등 종목을 빠르게 포착하고, 해당 종목의 시장 심리를 AI 요약으로 즉시 파악할 수 있어야 한다
**Current focus:** v1.1 운영 유지보수 상시 — 다음 phase 미정(마일스톤 종료 안 함)

## Current Position

Phase: 31
Plan: Not started
Status: 로드맵 phase 전부 완료 · 마일스톤 v1.1 계속(새 phase 추가 또는 quick)
Last activity: 2026-10-12 — Completed quick task 261012-oif: 상따카드 4건(쉐브런 · 기준선 행 · 매수취소 접이식 · 버스트 취소)

Progress: [██████████] 100% (17/17 plans)

## Accumulated Context

### Pending Todos

- Supabase/KIS/Naver 시크릿 로테이션 (채팅에 노출됨) — 사용자 판단 (Naver: 2026-04-17 노출)
- Infra: `gh-radar-deployer` SA key 로테이션 주기 설정 (현재 영구 key)
- DI-03: `news_articles`·`discussions`·`summaries` RLS 가 `TO anon` 만 명시하는지 audit → `TO anon, authenticated` 로 갱신
- DI-04: Vercel production env trailing newline 오염 검증 절차 자동화(`vercel env pull` 후 `tail -c1 | xxd -p` = `0a` 면 오염)

### Blockers/Concerns (v1.1 로 이월)

- **[Phase 29] 두 번째 서버(KB121 · KYOBO127) 켜기 전 결정.** 운영은 지정 0 · 두 번째 서버 꺼짐이라 잠복. 켜기 전에 R3-03 부팅 창 백스톱 · R3-05 무동작 대여 미승격 · R3-06 VI 끄기 에코 미확인 수정, 51 OrderResp 계좌 필터 공백 수용 여부, 실서버 실증. 정본 `milestones/v1.0-phases/29-dma-multi-server-admin/29-53-SUMMARY.md` 「켜기 전 결정」. v1.1 밖(v1.2+ ADMIN-NEXT).
- **[Phase 30 후속 · 비차단] KB 주문자 IP/MAC.** R3-01 보류 권고는 해제(30-07 · relay:2234a1b5 · 인박스 261010 done). 남은 것: ① KB121 에 gh-trade 261011(공유 계좌 IP/MAC 전파) 배포 여부 확인 — KB121 켤 때 공유 계좌 저장 1회 확인 ② 주문 전문(TCHODR1000 orderInfo · macAddr)에 설정값이 실리는지 회선 관측 없음(gh-trade 단위 테스트 `test_kb_endpoint_race.cpp` 만) — KB 담당 주문번호 조회 · KB120 패킷 캡처 · gh-trade 값 없는 출처 진단 로그 중 택1. 정본 `phases/30-kb-ip-mac/30-07-SUMMARY.md` 「Next Phase Readiness」.
- **[Phase 31 후속 · 비차단] 리뷰 R3 Info 4건 open** — R3-IN-01(IN-05 폼 변경 테스트 미고정) · R3-IN-02(armBlockOf 주석이 ☐줄매수 켜진 조합에서 거짓) · R3-IN-03(8필드 모두 0 인 에코는 관용 유지) · R3-IN-04(UI-SPEC 230 · 31-04-PLAN 38 「금액끼리」 문구). 정본 `phases/31-limitchaser-amount-unit/31-REVIEW-DISPOSITION-R3.md`. R3-WR-01 은 b977002f 로 고침.
- **Phase 17 승계 실기 관측 2건.** ① D-25 래치 36/37/38 왕복·76/77/78 드롭 0 미관측(WINDOWS #17 — `sudo xcodebuild -license` 동의 뒤 gh-trade HEAD 빌드 또는 장중 LED 관측). ② smoke `INV-9` 프로덕션 첫 실행 미수행(`SMOKE_AUTH_TOKEN` 필요). TRADE-04·05 는 그래서 Pending 유지.
- **`/healthz` 알림 정책 — 사용자 결정 대기.** 게이트웨이가 끊기면 세션 생성 5분 뒤 503 상시화. 후보 4개는 v1.0 phase 16 `deferred-items.md` §16-35.
- **WINDOWS.md open 4건** — #9·#10·#11(Phase 16 승계 · 상따 밴드 전이점·체결가 7자 예산) · #17(D-25).

### Deferred Items

v1.0 마무리(2026-10-11)에서 acknowledged 처리한 열린 산출물 — 개별 항목은 아카이브 파일의 `audit_acknowledged` / `status: acknowledged` 마커가 정본:

| Category | 건수 | 위치 |
|----------|------|------|
| debug_sessions | 4 | `.planning/debug/` (discussion-sync-pagination · relay-ws-order-unmatched-notice · trading-cpu-260923 · turbopack-dailyohlcv-resolve) |
| uat_gaps | 6 | v1.0-phases 06.1 · 08.1 · 10 · 13 · 14 · 17 |
| verification_gaps | 12 | v1.0-phases 06.1 · 06.2 · 08.1 · 10 · 13 · 14 · 16(R1·R2) · 20(R2) · 24(R2·R3) · 29(R2) |
| quick_tasks | 30 | v1.0-quick (status unknown/checkpoint-pending/missing — 전부 완료된 작업) |
| deferred_items | 144 | v1.0-phases 04 · 06.2 · 07 · 08 · 10 · 15(14) · 16(80) · 25(3) 등 — 15/16/25 는 파일 상단 `## Deferred Items` 섹션으로 일괄 |

### Quick Tasks Completed

v1.0 quick 130건: `.planning/milestones/v1.0-quick/README.md`. 이전 이력: [STATE-ARCHIVE.md](./STATE-ARCHIVE.md#quick-tasks-completed)

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261011-j87 | CLAUDE.md 다이어트 — 스택 표·법적 판례·설치 참조·출처 링크를 docs/ 로 옮기고 운영 5원칙·공식 API 기준·인박스·컨벤션만 요약 유지 | 2026-10-11 | 8b9a911d | [261011-j87-claude-md-docs-5-api](./quick/261011-j87-claude-md-docs-5-api/) |
| 261012-mig | 상따 줄매수 「최소 > 최대」·「최대 0주」 차단을 C# addBuyLive(☐줄매수 ∨ ☐자동)·제출 주 비교로 정렬 — gh-trade 인박스 261012-phase32-review-fix-wr06-in07 | 2026-10-12 | 708c4772 | [261012-mig-lc-extrabuy-minmax-parity](./quick/261012-mig-lc-extrabuy-minmax-parity/) |
| 261012-oif | 상따카드 4건 — 쉐브런 lc 360↑ 표시 · 매도 잔량추적 기준선 행 삭제 · 매수취소 접이식 · 버스트 취소 매수주문 이동 | 2026-10-12 | 3fb8ecbd | [261012-oif-lc-card-tweaks](./quick/261012-oif-lc-card-tweaks/) |

## Session Continuity

**Resume file:** None

Last session: 2026-10-12T17:45:00+09:00
Stopped at: Phase 31 complete (UAT 4/4 · 재검증 R2 passed · R3-WR-01 수정) — 마일스톤 v1.1 계속
Next: 새 작업은 `/gsd-phase add` 또는 `/gsd-quick` — `/gsd-complete-milestone` 은 사용자 지시 전까지 하지 않음

## Operator Next Steps

- 마일스톤 v1.1 은 계속 — 새 작업은 `/gsd-phase add` 또는 `/gsd-quick` (마일스톤 종료는 사용자 지시 때만)
- 선택: Phase 31 리뷰 R3-IN-01~04 정리(quick)

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 30 P01 | 7 min | 3 tasks | 8 files |
| Phase 30 P02 | 5 min | 3 tasks | 6 files |
| Phase 30 P03 | 5 min | 3 tasks | 8 files |
| Phase 30 P04 | 6 min | 3 tasks | 2 files |
| Phase 30 P05 | 4 min | 2 tasks | 2 files |
| Phase 30 P06 | 13 min | 2 tasks | 3 files |
| Phase 30 P08 | 7min | 3 tasks | 6 files |
| Phase 30 P09 | 9 min | 3 tasks | 9 files |
| Phase 30 P07 | 3 min | 3 tasks | 2 files |
| Phase 31 P01 | 21 min | 3 tasks | 25 files |
| Phase 31 P02 | 6min | 2 tasks | 6 files |
| Phase 31 P03 | 13 min | 2 tasks | 12 files |
| Phase 31 P04 | 19min | 3 tasks | 11 files |
| Phase 31 P05 | 14min | 3 tasks | 6 files |
| Phase 31 P06 | 22min | 3 tasks | 8 files |
| Phase 31 P07 | 47 min | 3 tasks | 9 files |

## Decisions

- [Phase 31]: 금액 확정 성공 = 짝 판정(에코 주 = 보낸 주 ∧ (에코 금액 = 보낸 금액 ∨ 금액을 모르는 서버의 0)) · 금액을 아는 서버의 모호한 에코(주 일치 · 금액 0)는 거부 대신 LC_REJECT_ECHO_GRACE_MS 유예(R3-WR-01 · b977002f)
- [Phase 31]: 구 탭 `lc.set`(금액 부재)은 relay 가 최신 에코 원값으로 금액을 되싣는다 — 주 · 비교가가 어긋난 쌍만 0(WR-01 · `#withEchoAmounts`)
- [Phase 30]: 30-01: PUT body 최상위 orderEndpoint(KB 만 · 구조/길이만 · 형식 검사 없음 · DB 미저장) → relay reconcileUser override → 등록 서버 전부 op 3
- [Phase 30]: 30-01: op 1(계좌)·op 3 직전 op 5 재조회 · 재조회 실패면 그 서버 44 0건(fail closed) — R3-01 해제
- [Phase 30]: 30-01: R3-02 폴백 — 의도/override > 이 유저 87 > 같은 87 다른 유저 IP/MAC > 빈 문자열, 다른 유저에 op 없음(D-11)
- [Phase 30]: [30-02] sameValues 는 의도 IP/MAC 이 정규화에 성공하면 정규화값, 실패하면 원문으로 87 과 비교 — gh-trade op 3 멱등과 같아 code 13 경로 유지(의도 필드 없으면 비교 제외 · GC-02)
- [Phase 30]: [30-02] orderEndpoints 는 의도 계좌의 active 등록 서버 전부에 채운다(증권사 무관) · null = 87 모름/계좌 없음 · 87 전용 {} — KB 만 그리는 판단은 화면 몫
- [Phase 30]: [30-02] summarizeOrderEndpoint 출처 = resolveEffectiveOrderServer(웹 OrderServerControl 과 같은 입력) ?? 레지스트리 순 첫 active · 값 모르면 값 아는 첫 서버 · 불일치는 값 아는 다른 등록 서버(꺼진 서버 포함)
- [Phase 30]: [30-03] relay GET /order-endpoints 는 켜진 서버 중 87 캐시(currentSnapshot)가 있는 서버만 키를 둔다 — 꺼짐 · 파이프라인 없음 · 재접속 중은 키 없음 = 확인 전
- [Phase 30]: [30-03] Express GET /users 는 RPC 와 relay order-endpoints 를 Promise.all 병렬 — relay 없음·비200·모양 위반·throw 는 null(확인 전) · warn 에 status 만 · 개요 200 유지
- [Phase 30]: [30-03] Express PUT 계좌 감사 줄은 orderEndpoint set/clear 플래그만(값 없음) — 두 칸 모두 빈 값이면 clear
- [Phase 30]: 30-04: 편집 저장 결과 줄 err 문구는 서버 message 원문 우선(없으면 칩 낱말) · 편집 저장 칩은 source edit 로 BusyLines 에서 뺀다
- [Phase 30]: 30-04: 토글 PUT 이름 = editSave.value 새 이름 ?? 개요 이름(releaseOn: account) — 이름 저장 직후 재조회 전 토글 경합 방지
- [Phase 30]: 30-05: 저장 본문 조립은 editSaveBodyOf 순수 함수 — 정규화는 바뀜·변경 없음 비교에만, 보내는 IP/MAC 은 입력 원문 trim(D-07)
- [Phase 30]: 30-05: D-10 불일치는 지금 props 기준 — 계좌명만 바꿔도 불일치면 orderEndpoint 를 실어 등록 서버를 맞춘다
- [Phase 30]: 30-05: 「변경 없음」 은 요청 0 · 편집 닫힘 · 읽기 카드 IP/MAC 줄 아래 NOTE, 다음 「편집」 때 지운다
- [Phase 30]: 30-06: 계좌 카드 제목줄 말줄임은 계좌명만 — 계좌번호 span shrink-0 (폰 390 backstop 이 40자 이름에 계좌번호가 「11…」 로 잘리는 것을 잡음)
- [Phase 30]: 30-06: e2e 목 PUT accounts 는 shared normalizeOrderIp/Mac 로 서버 정규화를 흉내(규칙 한 벌) · 이름 · IP/MAC 만 반영 · 형식/짝 오류는 서버마다 code 13
- [Phase 30]: 30-08: IP/MAC 표시 표기(D-17)는 렌더 자리 전용 shared formatOrderIp/Mac(형식 밖 원문 · 왕복 항등) — 전송 · summarize · relay · server 는 정규화값
- [Phase 30]: 30-08: editSaveBodyOf 「보낼지」 는 칸 값 · 초깃값(표시 표기) 양쪽 정규화 비교 · 저장 버튼 「바뀜」 은 원문 비교 그대로
- [Phase 30]: 30-09: 공유 계좌 판정은 shared findSharedAccountHolders 한 벌(개요 데이터만 · 증권사 · 정규화 계좌번호 · 상대 active 등록 ∪ serverOnlyOn 과 이 계좌 저장 서버의 겹침) — 웹은 KB 편집 모드 안내 줄만, 동시 반영은 gh-trade op 3 전파 몫
- [Phase 30]: 30-09: code 7 은 특수 처리 없이 결과 줄 「<서버> 실패: <서버 원문>」 — gh-trade 46a10ce9 의 넓힌 문구도 웹 변경 없음 · relay/server 무변경(30-07 은 webapp push 만)
- [Phase 30]: 30-07: 인박스 261010 닫힘(done_commit 5687c282) — ① code 7 넓혀 달라 + 공유 계좌 IP/MAC 동시 반영(gh-trade 261011 · KB120 배포 · 사용자 확인, KB121 은 gh-trade 배포 여부 확인 필요) ② 원문 전송 · 표시는 사람이 읽는 표기 ③ ipconfig /all 수기 입력 · KB IP/MAC 설정 보류 권고 해제(relay:2234a1b5)
- [Phase 30]: 30-07: 주문 전문(TCHODR1000 orderInfo · macAddr) IP/MAC 회선 관측은 열린 후속(비차단) — KB 담당 주문번호 조회 · KB120 패킷 캡처(gh-trade) · gh-trade 값 없는 출처 진단 로그 중 택1
- [Phase 31]: 31-02: 두 줄 행 아래 줄은 RowSubLine 한 곳(setting-group export) — 행 3종 · 인라인 편집기 공용, 판정은 호출부 lc-fields.ts
- [Phase 31]: 31-02: 시트 상태 줄 ⑤ 환산 안내(hint)는 ①잠금 ②반영 실패 ③경고 ④다른 단말 뒤 · armedNotice 면 같은 줄 둘째 줄(StatusLine.armedLine)에 「감시 중」
- [Phase 31]: 31-03: 구 탭 11값 user.settings.set 의 후매수 최소는 relay 가 그 사용자 마지막 84 캐시에서 되싣고, 캐시가 없으면 저장하지 않고 비종료 거부(USER_SETTINGS_FLOOR_UNKNOWN_TEXT · 소켓 유지)
- [Phase 31]: 31-03: 42 조립기는 봉인 post_buy_floor_qty 를 입력 무관 0 으로 싣는다 — 입력 타입은 그대로(구 탭 호환)
- [Phase 31]: 31-03: /me 는 금액 키가 없는 84(구 relay)를 미수신과 같게 접는다(usableUserSettingsOf · 같은 객체 참조)
- [Phase 31]: 31-04: 제출 주 산출은 lcSubmitQtyOf(values, 금액 키, server, price?) 한 함수 — buildCfg 8쌍 루프 · 무장 판정 · 자동 체크 공용(31-01 SELL_WATCH_PAIR 일반화)
- [Phase 31]: 31-04: 상장주식수 시딩은 만원 · 매수 비교가 0 이면 가드 미소진(C# 순서 — 서버 전략이면 먼저 소진) · 매도 비교가 0 이면 매도 체결만 생략
- [Phase 31]: 31-04: 수량 칸 위 줄은 0 도 「0만」 — 의미어(무제한 · 1주 · 없음)는 lcAmountZeroWordOf(요약 · 31-06 아래 줄)
- [Phase 31]: 주문로그 ⑦ 수량 토큰은 shared lc-amount 서식 3함수(formatManwon · formatQtyAmt · qtyAmt) 한 벌 — 주문 줄만 「{금액(주)} @{가격}」, 나머지 제자리 교체
- [Phase 31]: kind 1·2 시세 수량은 서버 ev_price(상한가)로만 환산 — 0 이면 종전 숫자(캐시 폴백 없음 · AMT-04)
- [Phase 31]: 31-06: 등록 차단 문장은 ARM_BLOCKED_TEXT 한 곳 · armBlockOf 순서 1~8(C# 동형) — 패널(buyPriceReasonOf)도 비교가 0 금액 판정을 주문가격 0 보다 먼저 본다
- [Phase 31]: 31-06: 수량 칸 시트 · 인라인 잠금은 validateCommit 맨 앞 amountLockTextOf 한 곳 · 두 줄 행 아래 줄 · 시트 안내 주는 qtyForSubmit(buildCfg 와 같은 값)
- [Phase 31]: 31-06: 새 폼 후매수 최소 = 84 postBuyFloorAmount(키 부재 · 범위 밖 폴백 0)
