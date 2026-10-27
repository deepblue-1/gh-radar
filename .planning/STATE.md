---
gsd_state_version: "1.0"
milestone: v1.1
milestone_name: 운영 유지보수
current_phase: 36
current_phase_name: 계좌별 주문가능 금액
status: executing
stopped_at: Completed 36-04-PLAN.md
last_updated: "2026-10-27T15:24:28.353Z"
last_activity: 2026-10-27
last_activity_desc: Phase 36 execution started
state_head: c1650c8e0456cdbce09b5b0e184f570e222d1ab6
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 74
  completed_plans: 68
  percent: 71
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-21 after Phase 34)

**Core value:** 트레이더가 급등 종목을 빠르게 포착하고, 해당 종목의 시장 심리를 AI 요약으로 즉시 파악할 수 있어야 한다
**Current focus:** Phase 36 — 계좌별 주문가능 금액

## Current Position

Phase: 36 (계좌별 주문가능 금액) — EXECUTING
Plan: 7 of 10
Status: Ready to execute
Last activity: 2026-10-27 — Phase 36 execution started

Progress: [███████░░░] 71% (53/53 plans)

## Accumulated Context

### Roadmap Evolution

- Phase 32 added (2026-10-13): 계좌 축 정리 — 작업대 계좌 스코프 · 상단 줄 재설계 · /me 전략 현황 계좌별 · 주문 탭 계좌 선택 · 매매설정 서버별(relay serverKey). 사용자가 A(quick+phase 2개) 대신 B(phase 1개 · 웨이브 분리)를 택함
- Phase 33 added (2026-10-16): 팀 매집(teamflow) 보고서 — gh-trade `team_flow.ndjson.gz` export 적재(limitup-sync) · 서버 RPC · `/analytics/teamflow` 목록(스케치 014 A 보고서 동형 · 기본 접힘) + 행 펼침 상세(스케치 015 C 차트 + 접힌 표). 열 사전 인박스 `261016-teamflow-export.md` 는 미도착 — 도착 후 대조
- Phase 34 added (2026-10-20): 매집감지(accum) 보고서 — gh-trade Phase 36 `accum_flow.ndjson.gz` export 적재(limitup-sync 선택 파일 일반화) · 목록/상세 분리 RPC · `/analytics/accum` 목록 + 상세 차트(10초 가격 · 팀 주문 · first · 순매수 누적 · 사이클 세로선 · 등록 전 음영) · kind 16 소급 파일 내보내기. 설계는 gh-trade-f4 와 합의(10-20), 열 사전 정본 인박스 `261020-accum-flow-export.md`. quick 대신 phase — teamflow(Phase 33, 9 plans)와 같은 규모
- Phase 35 added (2026-10-27): 발사 경계 지도 어드민 — gh-trade 인박스 `261027-launch-gate-admin.md`(상의 단계). 16:00·09:00:30 발사 결과를 저널 80 kind 17·18 로 받아 DB 쪽 해석(relay 무변경) · 어드민 주문 내역 + 경계 지도 · 백필. 채널 답(A · DB 해석 · 백필 ndjson 풀린 이름)은 gh-trade-cc 에 회신 완료 · 계좌 열 노출은 목업 검토 때 사용자 결정
- Phase 36 added (2026-10-27): 계좌별 주문가능 금액 — gh-trade 인박스 `261027-account-budget.md`(Phase 41 · SYNC 75195b70, 생성물 커밋 b7b25391). 어드민 계좌별 한도(op 6 · 전 서버 fan-out · op 3 뒤 되싣기) + 웹 주문 화면 주문가능 표시(경고만). 계약은 gh-trade-c9 와 합의 완료

### Pending Todos

- Supabase/KIS/Naver 시크릿 로테이션 (채팅에 노출됨) — 사용자 판단 (Naver: 2026-04-17 노출)
- Infra: `gh-radar-deployer` SA key 로테이션 주기 설정 (현재 영구 key)
- DI-03: `news_articles`·`discussions`·`summaries` RLS 가 `TO anon` 만 명시하는지 audit → `TO anon, authenticated` 로 갱신
- DI-04: Vercel production env trailing newline 오염 검증 절차 자동화(`vercel env pull` 후 `tail -c1 | xxd -p` = `0a` 면 오염)

### Blockers/Concerns (v1.1 로 이월)

- **[Phase 29] 두 번째 서버(KB121 · KYOBO127) 켜기 전 결정.** 운영은 지정 0 · 두 번째 서버 꺼짐이라 잠복. 켜기 전에 R3-03 부팅 창 백스톱 · R3-05 무동작 대여 미승격 · R3-06 VI 끄기 에코 미확인 수정, 51 OrderResp 계좌 필터 공백 수용 여부, 실서버 실증. 정본 `milestones/v1.0-phases/29-dma-multi-server-admin/29-53-SUMMARY.md` 「켜기 전 결정」. v1.1 밖(v1.2+ ADMIN-NEXT).
- **[Phase 30 후속 · 비차단] KB 주문자 IP/MAC.** R3-01 보류 권고는 해제(30-07 · relay:2234a1b5 · 인박스 261010 done). 남은 것: ① KB121 에 gh-trade 261011(공유 계좌 IP/MAC 전파) 배포 여부 확인 — KB121 켤 때 공유 계좌 저장 1회 확인 ② 주문 전문(TCHODR1000 orderInfo · macAddr)에 설정값이 실리는지 회선 관측 없음(gh-trade 단위 테스트 `test_kb_endpoint_race.cpp` 만) — KB 담당 주문번호 조회 · KB120 패킷 캡처 · gh-trade 값 없는 출처 진단 로그 중 택1. 정본 `phases/30-kb-ip-mac/30-07-SUMMARY.md` 「Next Phase Readiness」.
- **Phase 17 승계 실기 관측 2건.** ① D-25 래치 36/37/38 왕복·76/77/78 드롭 0 미관측(WINDOWS #17 — `sudo xcodebuild -license` 동의 뒤 gh-trade HEAD 빌드 또는 장중 LED 관측). ② smoke `INV-9` 프로덕션 첫 실행 미수행(`SMOKE_AUTH_TOKEN` 필요). TRADE-04·05 는 그래서 Pending 유지.
- **`/healthz` 알림 정책 — 사용자 결정 대기.** 게이트웨이가 끊기면 세션 생성 5분 뒤 503 상시화. 후보 4개는 v1.0 phase 16 `deferred-items.md` §16-35.
- **WINDOWS.md open 4건** — #9·#10·#11(Phase 16 승계 · 상따 밴드 전이점·체결가 7자 예산) · #17(D-25).
- **[Phase 34 후속 · 비차단] 코드 리뷰 11건(WARNING 5 · INFO 6) 수정 완료 2026-10-21** — `/gsd-code-review 34 --fix --all`, 건별 커밋 df59036f..a14652be. 정본 `phases/34-accum/34-REVIEW-FIX.md` · `34-REVIEW-DISPOSITION.md`. limitup-sync 워커 76d32a7a 재배포 · 스모크 14/14. UI 리뷰 WARNING 5건(다시 시도 터치 대상 · 흐림 범위 · 스켈레톤 · KPI 합 결측 「—」 · 상태 안내 `--faint` 대비)도 2026-10-21 수정(UI-SPEC 개정 동반).
- **[Phase 34 결정 2026-10-21] 10/1~10/16 시뮬레이션 소급 표기 안 함.** gh-trade 가 「모델 판정」 으로 소급한 10개 날짜(1001 1002 1006 1007 1008 1012 1013 1014 1015 1016)는 표식 없이 일반 보고서로 보인다(사용자 결정 — 표기 불필요).
- **[Phase 34 결정 2026-10-21] 10/19 · 10/20 도 모델 판정 · 서버 재기동 있는 날은 앞으로도 모델 판정.** 서버 재기동이 미등록 누적을 지워 사이클 · 등록 후 순매수가 왜곡된다(10/20 녹십자엠에스 12:15 재기동 → cycle 1 재등록 +8.02억 vs 하루 −0.56억). 10/1~10/20 은 gh-trade quick-261021-3rf 가 모델로 재생성(+ payload.avg_px · G4 msg_seq 정렬 버그 873fdd32 수정 — day_* · payload 전부 바뀜), 07:04 수동 운반 · 적재 · 스모크 10/19 63행 · 10/20 51행 14/14. 재기동 날 자동 모델 판정은 gh-trade 인박스 `261021-accum-restart-day-model.md` 로 요청(open).

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
| 261012-qld | gh-trade 261012 반영 — 상따 후매수 「최대」 칸 · 소진 안내 삭제 · 줄매수 자동 힌트 정리 · lc.set 재진입 255 고정 | 2026-10-12 | e14695c2 | [261012-qld-gh-trade-261012](./quick/261012-qld-gh-trade-261012/) |
| 5 | /me 상따 기본값 「후매수 최대」 행 삭제 — gh-trade 261012 후속 | 2026-10-12 | 028d9e63 | — |
| 261012-u04 | gh-trade 261012 선매수 매도잔량 기본값·줄매수도 같이 켜기 웹 반영 (UserSettings 2필드 · /me 선매수 카드 · 2열 열 고정 · 상따 폼 시딩/동반 제출) | 2026-10-12 | 6a628d3b | [261012-u04-gh-trade-261012](./quick/261012-u04-gh-trade-261012/) |
| 7 | vpn-menubar v3.8: 게이트웨이↔직접 접속(KB VPN·교보) 상호배제 해제 · SSH 명령 복사 메뉴 제거 (스크립트는 gitignore 개인 파일, 문서 2곳 커밋 51e62904) | 2026-10-14 | 51e62904 | — |
| 261016-miy | intraday-sync 60s 타임아웃 실패 해소 — STEP2 quotes UPDATE RPC 일괄화 + 알림 조건 완화(10분 3건) | 2026-10-16 | e44cf64f | [261016-miy-intraday-sync-60s-step2-quotes-update-rp](./quick/261016-miy-intraday-sync-60s-step2-quotes-update-rp/) |
| 261016-udz | Phase 32 UI 리뷰 Top 3 — 계좌 칩 화살표·Home/End 가 선택까지(WAI-ARIA radio · IN-02) · UI-SPEC 32-15 작업대 칩 절·옛 셀렉트 무효 · 간격 1곳 4배수(pt-1)·7곳 예외 근거 명시 | 2026-10-16 | 1ad9d4fb | [261016-udz-phase-32-ui-top-3-ui-spec-4](./quick/261016-udz-phase-32-ui-top-3-ui-spec-4/) |
| 261017-bwt | Phase 32 UI 리뷰 잔여 — 간격 7곳 4배수(공용 짝 VI 다이얼로그·ChoiceRow·마이크로 배지 동행) · 끄기 버튼 --destructive 면 카드·다이얼로그 일치 · 「끄기」 어휘 통일 · 잠긴 칩 개별 aria-disabled·title · VI 스트립 scopeAccount 게이트(IN-05) | 2026-10-17 | bdceac07 | [261017-bwt-phase-32-ui-7-4-destructive-in-05](./quick/261017-bwt-phase-32-ui-7-4-destructive-in-05/) |
| 261017-daz | IN-04 — relay 가 VI 슬롯 캐시를 지울 때 브라우저에 vi.slot.clear 송신(다른 세션이 알면 vi.slot re-assert · closeAll 무프레임) · resyncUser 지움 순서 수정 · 웹 리듀서 키 삭제 → 사이드바 VI·이 계좌 끄기·VI 행이 사실을 따름 | 2026-10-17 | f45302f7 | [261017-daz-in-04-relay-vi-vislots](./quick/261017-daz-in-04-relay-vi-vislots/) |
| 261018-qob | 87 로 세션 선언에서 빠진 계좌의 VI 슬롯을 hub 캐시에서 지우고 vi.slot.clear 팬아웃(다른 세션이 알면 re-assert) — #clearViOwner 와 #dropViSlots 헬퍼 공유 · 미준비 세션도 지움 · 21 재요청은 Ready 때만 | 2026-10-18 | ab86af3d | [261018-qob-87-hub-vi-vi-slot-clear](./quick/261018-qob-87-hub-vi-vi-slot-clear/) |
| 261018-rfy | 매집감지(kind 16) 수용 — shared 시세 집합 16 · 조회 RPC · 주문로그 래퍼 16 제외 · purge 30일 · isin 별 최신 읽기 RPC(같은 분 quote-primary 우선) · GET /api/accum-signals · relay 리듀서 별도 목록 · /trading 작업대 「매집」 패널(돌파 동형) · 인박스 done | 2026-10-18 | 89947e7f | [261018-rfy-accum-signal](./quick/261018-rfy-accum-signal/) |
| 261019-j1w | 매집감지 매도 조기 경보 · 오늘 매수 평단 수용 — relay 생성물 재생성(776320af) · shared kind 16 sellWarn · sellWarns · 행 종류 5 · 작업대 「매집」 패널 주황 「매도경보」 배지(목업 A) · 인박스 2건 done | 2026-10-19 | 2021cd24 | [261019-j1w-accum-sell-warn](./quick/261019-j1w-accum-sell-warn/) |
| 261018-j17 | 팀 매집 보고서 거래원별 순매수(행렬 표 · 하루 억) + 팀 당일 손익(목록 열 · 상세 줄) | 2026-10-20 | c5716097 | [261018-j17-teamflow-broker-net-buy](./quick/261018-j17-teamflow-broker-net-buy/) |
| 16 | Phase 34 UI 리뷰 WARNING 5건 — 페이지 다시 시도 min-h-8 · 흐림은 종목·결과·금액 칸만 · 상세 스켈레톤 실제 배치 · KPI 합 결측 「—」 · 상태 안내 --muted-fg(UI-SPEC 개정) | 2026-10-21 | 76d32a7a | — |
| 261021-amg | 매집감지 상세 가격 차트 팀 평단 선 — payload.avg_px 계단 · --up 점점선 · 0 끊김 · 범례 「팀 평단」 | 2026-10-21 | 3aaf6c36 | [261021-amg-accum-chart-team-avg-price-line](./quick/261021-amg-accum-chart-team-avg-price-line/) |
| 18 | 작업대 매집감지 gh-trade 동형 — 청산 행 먼저 청산한 순 · 06:00 이월 탈락/만료 종료 행 제외 · 팀 수익률 열 | 2026-10-21 | b7c28659 | — |
| 19 | 매집감지 보고서 목록 「팀 당일 손익」 열(하루 순매수 다음) — 목록 RPC 에 payload.pnl 동봉 | 2026-10-21 | 8d8b117c | — |
| 261022-ozx | 매집 패널 NXT 순매수 열 — kind 16 error/remaining_volume(gh-trade Phase 37 인계) | 2026-10-22 | 72fd4ce7 | [261022-ozx-nxt-kind-16-error-remaining-volume](./quick/261022-ozx-nxt-kind-16-error-remaining-volume/) |
| 21 | 매집감지 보고서 차트 마우스 툴팁(gh-trade 동형) · 팀 주문 원이 가격 선 위에 오게 | 2026-10-23 | 46d56b02 | — |
| 261024-uov | 매집 패널 매집 종료(4) — 그날 청산 행 있을 때만 회색 청산(값=청산 행) · 복원 RPC 청산 행 동반 · 라벨 | 2026-10-24 | da978c13 | [261024-uov-end-reason-4-rpc-end1](./quick/261024-uov-end-reason-4-rpc-end1/) |
| 261025-fac | 매집감지 상세 누적 판 — 포지션 순매수(pos_net·이월 포함) 주인공 보라 계단 + 그날 누적 회색 보조(스케치 017 B) | 2026-10-25 | f88226e4 | [261025-fac-pos-net-017-b](./quick/261025-fac-pos-net-017-b/) |
| 261025-uf2 | 매집감지 당일 축 기반 — kind 16 파서 당일 칸·day=·recent=(조각) · accum_flow 열 4개 마이그레이션 | 2026-10-25 | 2cf5e807 | [261025-uf2-kind-16-day-recent-accum-flow-4-261025-a](./quick/261025-uf2-kind-16-day-recent-accum-flow-4-261025-a/) |
| 261026-01h | 매집감지 당일 축 UI — 작업대 B(당일 주인공·누적/전날 보조) · 보고서 당일 축(누적 왼쪽 회색 축) · 500만원 | 2026-10-26 | 7956414d | [261026-01h-ui-b-500](./quick/261026-01h-ui-b-500/) |
| 261026-0ty | 매집감지 보고서 서버 기준 당일 값 — pos_day_avg_px 열 · payload.pos_day 주선 · 팀 평단(당일) | 2026-10-26 | d9a6c3aa | [261026-0ty-accum-flow-pos-day-avg-px-payload-pos-da](./quick/261026-0ty-accum-flow-pos-day-avg-px-payload-pos-da/) |

## Session Continuity

**Resume file:** None

Last session: 2026-10-27T15:24:28.265Z
Stopped at: Completed 36-04-PLAN.md
Next: 새 작업은 `/gsd-phase add` 또는 `/gsd-quick` — `/gsd-complete-milestone` 은 사용자 지시 전까지 하지 않음

## Operator Next Steps

- 마일스톤 v1.1 은 계속 — 새 작업은 `/gsd-phase add` 또는 `/gsd-quick` (마일스톤 종료는 사용자 지시 때만)

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
| Phase 33 P01 | 23min | 2 tasks | 24 files |
| Phase 33 P02 | 8 min | 3 tasks | 8 files |
| Phase 33 P03 | 11 min | 3 tasks | 11 files |
| Phase 33 P04 | 17min | 2 tasks | 5 files |
| Phase 33 P05 | 13min | 3 tasks | 9 files |
| Phase 33 P06 | 9 min | 2 tasks | 8 files |
| Phase 33 P07 | 25min | 2 tasks | 2 files |
| Phase 33 P09 | 6 min | 2 tasks | 3 files |
| Phase 34 P01 | 6min | 1 tasks | 8 files |
| Phase 34 P02 | 5min | 2 tasks | 4 files |
| Phase 34 P13 | 8min | 1 tasks | 16 files |
| Phase 34 P03 | 4min | 2 tasks | 4 files |
| Phase 34 P04 | 7min | 2 tasks | 9 files |
| Phase 34 P05 | 4min | 3 tasks | 3 files |
| Phase 34 P06 | 11min | 3 tasks | 11 files |
| Phase 34 P07 | 9min | 2 tasks | 9 files |
| Phase 34 P08 | 6min | 2 tasks | 8 files |
| Phase 34 P09 | 4min | 2 tasks | 5 files |
| Phase 34 P10 | 12min | 3 tasks | 5 files |
| Phase 35 P04 | 10 min | 2 tasks | 3 files |
| Phase 35 P05 | 5 min | 3 tasks | 8 files |
| Phase 35 P06 | 13 min | 2 tasks | 11 files |
| Phase 35 P07 | 8 min | 2 tasks | 4 files |
| Phase 35 P08 | 14 min | 3 tasks | 9 files |
| Phase 36 P01 | 6 min | 1 tasks | 15 files |
| Phase 36 P10 | 5min | 2 tasks | 10 files |
| Phase 36 P02 | 10min | 2 tasks | 14 files |
| Phase 36 P03 | 16min | 3 tasks | 9 files |
| Phase 36 P06 | 8min | 2 tasks | 8 files |
| Phase 36 P04 | 15min | 3 tasks | 13 files |

## Decisions

- [Phase 32]: /me 는 탭 위 계좌 칩 한 곳이 현황 · 잔고 · 주문 · 설정 네 탭을 거른다 — 선택은 작업대와 따로 기기별 기억(`gh-radar:me-account:{userId}`) · Phase 16 D-21 전면 뒤집음(D-20~D-23)
- [Phase 32]: /me 현황은 「이 계좌 끄기」(relay `strategies.disable.account`)만 — 「전체 비활성화」 는 primary 세션만 끄는 불일치로 웹에서 제거, relay 무인자 경로는 무변경(D-27)
- [Phase 32]: 매매설정은 서버별 — relay `serverKey` · hub 84 캐시 `(userId, serverKey)` · `#fromPrimary` 해제 · 지정 서버 세션 없으면 primary 로 떨어뜨리지 않고 거부(D-24 · D-14a)
- [Phase 32]: 작업대 상단 줄의 계좌 선택은 32-15 에서 `<select>` 대신 `MeAccountChips` 재사용(사용자 지시) — UI-SPEC S1 · S10 은 미갱신(32-UI-REVIEW 1순위)
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
- [Phase 33]: 33-01: TeamflowDetail 은 버튼 id 를 labelledBy prop 으로 받는다(day-grid↔detail import 순환 회피 · LimitupEventCard 동형 · aria-labelledby 값 동일)
- [Phase 33]: 33-01: 팀 매집 행 그리드는 최종 7열 템플릿 · 이 플랜은 1·2·3·7열만 — xl 열 머리 · 20% 아래/위 · 매수 중 팀 · 미니막대는 33-03 가산
- [Phase 33]: 33-01: pgTAP 러너 이미지 public.ecr.aws/supabase/postgres:17.6.1.104 사용자 승인으로 로컬 보유 — 마이그레이션 2개 SQL 실행 검증은 33-02 Task 2
- [Phase 33]: 33-02: 워커 D-03 재적재 감지 = manifest 에 team_flow 가 있고 이력 rows.team_flow ≠ manifest rows(키 없음 포함)이면 files_sig 같아도 재적재 · 로그 reason new|files_sig|team_flow_backfill — 수동 files_sig NULL 대체
- [Phase 33]: 33-02: pgTAP 3파일(limitup_load 218 · teamflow_report 28 · limitup_report 54) 로컬 일회용 컨테이너 실행 통과 — 33-01 마이그레이션 수정 0
- [Phase 33]: 33-03: 억 반올림을 Math.round 로 통일 — fmtEok(−5,000,000) = 0.0억 골든(RESEARCH A4) · fmtRate 는 대칭 반올림 유지
- [Phase 33]: 33-03: 차트 픽셀 기하는 lib/teamflow-chart.ts 순수 함수(stripBarsOf · chartWidthOf 640 폴백) — 33-05 · 33-06 이 덧붙인다
- [Phase 33]: 33-04: 백스톱 T3 한 줄 판정 = 태그·셰브론 top 8px 안 + 이름 줄과 세로 겹침(종목 칸이 이름+코드 두 줄 묶음이라 top 8px 기준은 배치와 불일치)
- [Phase 33]: 33-04: 사이드바 「팀 매집」 = 분석 하위 상한가 보고서 다음 · 레일 전용 아이콘 없음 · diff 12줄 최소
- [Phase 33]: 33-05: 상세 차트 폭은 useChartWidth(ResizeObserver · 폴백 640) → 순수 기하 함수 → viewBox 1:1 · 접힘은 TeamflowToggle 공용(닫히면 언마운트) — 33-06 10분 차트 · 10분 표가 재사용
- [Phase 33]: 33-05: 상세 section 안에서 <i> 금지(33-01 RTL (j) 요약 태그 제거 증거) — 범례 견본은 span · bandChartOf 0 값 막대 폭 0(behavior 정본)
- [Phase 33]: 33-06: key 93(종가 단일가)은 bucketSlotsOf 가 슬롯 38(15:20 칸)에 합산 — 10분 표는 원자료 그대로(key 92 · 93 · 범위 밖 각자 행) · window 띠는 슬롯 38 이 창에 들면 key 93 행 포함
- [Phase 33]: 33-07: 상세 배치 E2E 는 블록 래퍼(teamflow-bands ↔ teamflow-members)끼리 top 을 비교하고, 거래원 오른쪽 칸 여부만 svg 로 잰다
- [Phase 33]: 33-07: 전 워크스페이스 회귀 게이트 green(worker 108 · server 521 · webapp 4234 · E2E 25 · pgTAP 218/28/54) — 33-08 배포 전제 충족 · 두 자리 억 왼쪽 축 글자는 33-09 UAT 관찰
- [Phase 33]: 33-09: 인박스 261016 done_commit = 5d6e2499(배포 이미지 태그 · 병합) — 회신에 순수 Phase 33 마지막 코드 커밋 bc489782 병기
- [Phase 33]: 33-09: 「상한가 도달」 KPI 는 종가 상한가만 셈 — 사용자 답 「이대로 둠」(라벨 유지)
- [Phase 34]: 34-01: accum_flow stage 청크 1행 — 최대 행 json ≈ 224KB 가 증명된 insert 본문 ≈ 293KB 안에 드는 유일한 값
- [Phase 34]: 34-01: 재적재 감지는 team_flow 그대로 · OPTIONAL_FILES 참조로만 교체(일반화는 34-03)
- [Phase 34]: 34-01: accum_detail_for_user 는 행 없으면 {access:true,row:null} 200
- [Phase 34]: 34-02: 소급 줄 정수 칸은 null/비숫자를 0 으로 — 23키 항상 실음(키 빠지면 gh-trade bad=)
- [Phase 34]: 34-13: 매집감지 상세는 access:true 응답만 query-cache(accum-detail:{date}:{isin} · 만료 없음 · row:null 포함) · 진행 중 요청 합침 · 실패 비캐시. 펼친 상세 첫 렌더는 캐시에서 동기 초기화
- [Phase 34]: 34-13: 목록 열 머리 · 행 sr 설명은 34-04 가 열을 채울 때 함께 — 34-13 은 7열 템플릿 위 종목 · 상태 배지 · 셰브론만
- [Phase 34]: 34-03: 재적재 감지를 OPTIONAL_FILES 순회 backfillTbls 로 일반화 — reason `<표들>_backfill`(표 하나면 기존 문자열 그대로) · 격자 생략 · 실패 시 unpublish 생략
- [Phase 34]: 34-03: 탐지 0 거래일 manifest 는 코드 변경 없이 그대로 적재(테스트로 잠금) · backfill 로그 객체는 표별 { tbl, prev, manifest } 배열
- [Phase 34]: 34-04: 카드 소제목·캡션을 AccumDayGrid 로 옮김(열 머리와 한 곳) · section aria-labelledby 는 페이지 유지
- [Phase 34]: 34-04: 합성 목록 행 등록 시각은 since_date 기준 KST ms · 상한가+last_rate null = 「상한가」 · 미도달+last_rate null = none 「—」
- [Phase 34]: 34-05: D-03 팀 매집 단언은 team_flow 행 있는 날짜를 함께 적재해 dates 정확 비교로 강화(빈 배열 우연 통과 방지)
- [Phase 34]: 34-06: 상세 차트 시각 눈금은 KST 자정 기준 정렬(2h = 10·12·…·20) · 세로선/라벨은 창 안 것만 clipPath 밖에 그린다
- [Phase 34]: 34-06: 「팀 체결 없음」 은 판마다 해당 배열 기준(누적 = day_cum_net · 10분 = buckets) · shadeOf 는 첫 사이클 since 가 그날과 다르면 null
- [Phase 34]: 34-07: 제스처는 schedule(fn) 하나로 대기 창에 합성 → 프레임당 setState 1회 · 창 불변이면 false 를 돌려 휠을 페이지로 넘긴다(ctrlKey 는 늘 preventDefault)
- [Phase 34]: 34-07: 확대 폭은 [10분, 하루] 로 먼저 자른 정확한 값 — 10분 창에서 더 확대해도 창이 밀리지 않고 넘김
- [Phase 34]: 34-07: 키보드는 Alt·Ctrl·Meta 조합을 처리하지 않는다(⌘= · ⌘0 브라우저 확대 보존) · 끌기 방향은 목업 C(내용을 잡아 끈다)
- [Phase 34]: 34-08: 사이클 표 # = cycles 나온 순서(CR-01) · 수량 둘 다 null 「—」 · 판정 기준 본문 1 은 조각 배열(thresholdPartsOf)이 정본 · pnlOf 인자를 Pick<TeamflowPayload,'pnl'> 로 넓혀 매집감지 공용
- [Phase 34]: 34-09: e2e 목은 목록(pathname ===)과 상세(startsWith …/)를 URL 판정 함수로 분리 — glob * 가 / 를 넘지 않음(Pitfall 9) · sidebar-tree 403 루프도 같은 판정
- [Phase 34]: 34-09: 합성 최악값 행 ISIN KR790000AC99 · 상세는 한선 payload + 최악값 평평한 열 · accumDetailFixtureOf synthetic 옵션으로 34-10 합성 상세 주입
- [Phase 34]: 34-10: 매집감지 누적 축 글자는 0 과 세로 12px 미만인 끝값을 뺀다(cumTicksOf · 0 글자 우선)
- [Phase 34]: 34-10: 전 워크스페이스 회귀 · pgTAP 4파일 green — 34-11 배포 전제 충족(server admin-dma ECONNRESET 2건은 단독 재실행 85/85)
- [Phase 35]: 35-04: kind 17·18 해석은 dma_strategy_apply 재정의 안 kind 한정 예외 서브블록 — 원문 INSERT 는 블록 밖, 17·18 은 rows 제외(relay 무변경 · ws 누설 0), 실패는 errors[{seq, error}]
- [Phase 35]: 35-04: 사용자 경로 차단은 json 래퍼 · 주문 타임라인 2곳(NOT IN (17, 18)) — 원천 SETOF dma_strategy_events_for_user 와 kind 15·16 purge 는 그대로
- [Phase 35]: 35-04: launch_project_event 는 Wave A no-op 스텁 — 35-10 이 같은 시그니처로 정식 매핑을 넣고 launch_reproject() 1회(applied_at · seq 순 · 멱등)
- [Phase 35]: 35-05: 발사 어드민 라우트는 경로 한정 관문(/launch) + adminServersRouter 뒤 · adminRouter 앞 마운트 — /launch · /users · /servers 모두 역할 조회 1회(supertest 기록)
- [Phase 35]: 35-05: server 는 발사 RPC jsonb 를 변환 없이 Launch*Response 로 통과 · 모양 검사는 assertArrays(객체 + 키 3개 배열) 하나 — 계산은 웹 shared(D-20)
- [Phase 35]: 35-06: 발사 카드 모델은 머리 우선 · 조각 폴백 — q16 경계는 머리 gate_lo/hi, 둘 다 null 이면 shared launchDaysOf 그날 1개 · 결과 수는 언제나 탭 조각(표와 같은 수) · n0930 오프셋/다음 오프셋은 N 머리만
- [Phase 35]: 35-06: fetchLaunchOrders/Map 은 같은 경로 진행 중 요청만 합친다(캐시 없음) — 개발 StrictMode 이중 effect 로 첫 진입 요청이 2건 되는 것 방지 · /admin/launch 탭은 AVAILABLE_TABS(['orders'])만 그리고 35-08 이 'map' 을 더한다
- [Phase 35]: 35-07: 경계 지도 축 넓음/좁음 경계는 값 폭 40µs(플랜 span>100 으로는 첨부 4축 불일치) · 축 중심은 아래 중앙값(core 비지 않게)
- [Phase 35]: 35-07: 축 밖 점은 끝 고정 + ◂/▸ · title 「축 밖」 · 축 밖 다음 오프셋은 점선 대신 「▸ 다음 Xµs」 · 리본 칸 ≤ 그림 폭
- [Phase 35]: 35-08: 경계 지도 요약 카드 = shared launchPanelStatsOf(min_accept · max_reject) + mapNextOffsetOf(최신 머리) · null 이면 「—」 — 상수 없음
- [Phase 35]: 35-08: 발사 기준 세그먼트는 LaunchFireSeg 하나를 두 탭이 공유(같은 ?fire 키) · ?range 10d 기본 · 탭 · 칩 · 세그먼트 전환은 다른 쿼리 보존
- [Phase 36]: 36-01: /me 는 priceOf 미전달 — 시세 미구독 표면이라 시장가 매수 미체결은 0 으로 센다(D-11 재량, 인박스 규칙)
- [Phase 36]: 36-01: 예수금은 relay #mergeAccountState 델타에서 budgetKrw: next.budgetKrw 로 무조건 덮는다(0=해제 포함) · 웹 mergeAccount 는 ...next 라 무변경
- [Phase 36]: 36-10: costs 색인은 그 DMA 유저 행 우선 · 없으면 같은 계좌 다른 유저 행(예수금·비용률은 서버 계좌 단위 값 — IP/MAC 색인과 다름)
- [Phase 36]: 36-10: liveBudgetKrw 0 은 해제 정당값 — null 일 때만 87 폴백
- [Phase 36]: 36-10: registeredServersOf 를 꺼내 summarizeOrderEndpoint·summarizeAccountCosts 가 공유 — 둘 다 resolveEffectiveOrderServer 호출(GC-06)
- [Phase 36]: 36-02: 의도에 없는 계좌의 op 6/7 라우트는 409 NO_SUCH_ACCOUNT(기존 계좌 라우트 매핑 · 플랜 404 문구 정정)
- [Phase 36]: 36-02: op 6/7 은 setAccountCost 로 그 계좌 active 등록 서버마다 44 1건 · dma_admin_results 기록 없음(#answerBy record:false · keysOf)
- [Phase 36]: 36-02: 87 AdminAccount budgetKrw · feePpm · sellTaxPpm 은 늘 키를 둔다(구 서버 0) · planner · sink 에는 들어가지 않는다
- [Phase 36]: 36-03: 어드민 비용 행 「변경 없음」 판정은 개요 값(summarizeAccountCosts) 기준 — 실패 뒤 재시도가 접히지 않게
- [Phase 36]: 36-03: 어드민 예수금 행 배치는 카드 폭 컨테이너 쿼리(@container/cost · 464px) — 440px 시트에서 뷰포트 sm 은 줄 끝 「·」 매달림
- [Phase 36]: 36-03: 비용 결과 칩은 users.toml 반영 칩과 별개 줄 — onResults · BusyLines 무접촉(D-04) · 실패 낱말은 새 키 costFailed
- [Phase 36]: 36-06: 주문 표면 주문가능은 useAvailableKrw(webapp/src/lib/use-available-krw.ts) 한 훅 — holdingQuotePrice(KRX→NXT)도 여기로 옮겨 잔고 평가와 공유(작업대 재수출)
- [Phase 36]: 36-06: 주문가능 경고는 비차단 표시층 — 수동 폼 판정 제외 = 선택 미체결 매도(selected) · 시간외종가 · 주문금액 0 / 상따 합은 화면 표시값(레거시 선매수 금액 「—」 = 0)
- [Phase 36]: 36-04: account-costs 의 op 5 응답 87 은 AdminConn 캐시(currentSnapshot)로 받는다 — 서버당 15초 · 비행 공유 · 최대 800ms 대기 뒤 캐시 읽기
- [Phase 36]: 36-04: op 3 뒤 되싣기 출처 = 같은 계좌 다른 active · 켜진 등록 서버 중 resolveEffectiveOrderServer(지정 → 기본 → 단일) · 없으면 레지스트리 순 첫 서버 · removing 서버 제외 · 실패는 비치명 warn
