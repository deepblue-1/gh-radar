---
gsd_state_version: "1.0"
milestone: v1.1
milestone_name: 운영 유지보수
current_phase: 43
current_phase_name: 공개매수 · 유상증자 · 합병 공시 텔레그램 알림
status: verifying
stopped_at: Phase 41 complete, ready to verify Phase 43
last_updated: "2026-11-13T11:50:55.330Z"
last_activity: 2026-11-13
last_activity_desc: Phase 41 complete, transitioned to Phase 43
state_head: 3dcc287b18858863b7a85e6c11fa058c86959061
progress:
  total_phases: 14
  completed_phases: 13
  total_plans: 167
  completed_plans: 167
  percent: 93
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-13 after Phase 41)

**Core value:** 트레이더가 급등 종목을 빠르게 포착하고, 해당 종목의 시장 심리를 AI 요약으로 즉시 파악할 수 있어야 한다
**Current focus:** Phase 43 — 공개매수 · 유상증자 · 합병 공시 텔레그램 알림

## Current Position

Phase: 43 — 공개매수 · 유상증자 · 합병 공시 텔레그램 알림
Plan: 9
Status: Phase complete — ready for verification
Phase 41 (한투 뉴스·공시 피드): COMPLETE 2026-11-13 — 14/14 · 배포 11-12(DB 20261112100000 · 20261112200000 + UAT 보정 마이그레이션 4 · kis-news-sync Job · server · webapp) · UAT 11-12 「됐다」 · 하루 뒤 확인 11-13(공시 지연 중앙 3.3초 · 한투 91,179회 · 홈 AI −3%) · Nyquist 빈칸 0 · UI 18/24 · 검증 passed 8/8 · 리뷰 차단 2 · 경고 11 · 참고 19(처분 open — 후속 quick 권고 CR-01 → WR-02 → CR-60)
Phase 39 (매매진단 챗봇): COMPLETE 2026-11-09 — 9/9 · 배포 11-06(DB 20261106100000 · server 00076→00082-bcd · webapp a1136df0·bd3105ec·06333ece·e6879a2d) · gh-trade kind 9 11-06 17:14 · Sys 해제/전부 정지 21:51 · UAT 8/8(사용자 11-09 · ③은 11-09 적재 445행·답변 인용으로 대체) · 검증 passed 5/5 · 리뷰 경고 8 · 참고 5(처분 open) · UI 16/24
Phase 40 (체결 앱 푸시 알림): COMPLETE 2026-11-09 — 13/13 · 배포 11-07(DB · relay 8226fdb2 · server 825382f7 · webapp · iOS 202611071000 · Android 611071006) · 실기기 UAT 11-09 통과 · 검증 passed 5/5 · 리뷰 경고 7 · 참고 6(처분 open) · 후속 8a612976(탭 착지 앱 셸)
Last activity: 2026-11-13 — quick 261113-rn7 완료(공시 알림 OpenDART 키 2개 · 감시 대상 6개 · 아침 전날 확인 — 배포는 키 2 등록 뒤)
Phase 37 (틱 전문 뷰어): COMPLETE 2026-11-04 — 19/19 · 검증 R2 12/12 passed · 리뷰 3라운드 수정 · UAT 3/3 pass(11-04 19:55 따라잡기 · 20:01 마감 마무리 closed 16 · 20:10 승격 16/16 failed 0 · 20:40 late 승격 16/16) · 후속 6dc9b62c(따라잡기 예비분은 보는 종목 있을 때만) · c88dc3ea(캐시 96→192MB · 컨테이너 512m)
Phase 38 (틱뷰어 우리 주문·체결 표시): COMPLETE 2026-11-03 — 10/10 · 배포(DB 20261104100000 17:08 · server 00072-44q · webapp 17:11 · UAT 반영 18:22) · UAT ok(탐색 근거·주문 포함 · 「우리 주문」 탭 스케치 026 A · 호가 기본 금액) · 검증 passed 21/21 · 리뷰 2라운드 15건 전부 수정(R1 9 · R2 6) · 후속 quick 261104-6lh(as-of 헤더 · journal_epoch) 배포(DB 20261104500000 · server 00074 · tickgw bdbe480e · webapp 120ab5eb) · 2026-11-04 장중 틱뷰어 우리 체결 확인 · CLOSED(브랜치 phase-38-own-orders 정리)
Previous: 2026-11-03 - Completed quick task 261103-j4d: 틱뷰어 목록 팀 당일순매수 · 누적순매수 · 당일손익
Earlier: 2026-10-30 — 35-11 완료: quick 261030-d7b 원격 적용(db push 20261030120000 · 20261030200000) · reproject projected 182 errors 0 · 인박스 두 노트 done · push d0a50e17
Phase 36 (계좌별 주문가능 금액): COMPLETE 2026-10-28 — 10/10 · 배포(DB 20261028210000·210100 · relay 640ae663 · webapp 14:49) · UAT 8건(7 pass · WR-04 미룸) · 검증 passed · 리뷰 2라운드 수정

Progress: [█████████░] 93% (13/14 phases · 167/167 plans)

## Accumulated Context

### Roadmap Evolution

- Phase 32 added (2026-10-13): 계좌 축 정리 — 작업대 계좌 스코프 · 상단 줄 재설계 · /me 전략 현황 계좌별 · 주문 탭 계좌 선택 · 매매설정 서버별(relay serverKey). 사용자가 A(quick+phase 2개) 대신 B(phase 1개 · 웨이브 분리)를 택함
- Phase 33 added (2026-10-16): 팀 매집(teamflow) 보고서 — gh-trade `team_flow.ndjson.gz` export 적재(limitup-sync) · 서버 RPC · `/analytics/teamflow` 목록(스케치 014 A 보고서 동형 · 기본 접힘) + 행 펼침 상세(스케치 015 C 차트 + 접힌 표). 열 사전 인박스 `261016-teamflow-export.md` 는 미도착 — 도착 후 대조
- Phase 34 added (2026-10-20): 매집감지(accum) 보고서 — gh-trade Phase 36 `accum_flow.ndjson.gz` export 적재(limitup-sync 선택 파일 일반화) · 목록/상세 분리 RPC · `/analytics/accum` 목록 + 상세 차트(10초 가격 · 팀 주문 · first · 순매수 누적 · 사이클 세로선 · 등록 전 음영) · kind 16 소급 파일 내보내기. 설계는 gh-trade-f4 와 합의(10-20), 열 사전 정본 인박스 `261020-accum-flow-export.md`. quick 대신 phase — teamflow(Phase 33, 9 plans)와 같은 규모
- Phase 35 added (2026-10-27): 발사 경계 지도 어드민 — gh-trade 인박스 `261027-launch-gate-admin.md`(상의 단계). 16:00·09:00:30 발사 결과를 저널 80 kind 17·18 로 받아 DB 쪽 해석(relay 무변경) · 어드민 주문 내역 + 경계 지도 · 백필. 채널 답(A · DB 해석 · 백필 ndjson 풀린 이름)은 gh-trade-cc 에 회신 완료 · 계좌 열 노출은 목업 검토 때 사용자 결정
- Phase 36 added (2026-10-27): 계좌별 주문가능 금액 — gh-trade 인박스 `261027-account-budget.md`(Phase 41 · SYNC 75195b70, 생성물 커밋 b7b25391). 어드민 계좌별 한도(op 6 · 전 서버 fan-out · op 3 뒤 되싣기) + 웹 주문 화면 주문가능 표시(경고만). 계약은 gh-trade-c9 와 합의 완료
- Phase 37 added (2026-11-02): 틱 전문 뷰어 — KRX·NXT 전 종목 틱 단위 전문 재생 `/analytics/ticks`. 공급 두 갈래(gh-trade-ac 합의): 당일 장중 = 119 소형 인덱서 + radar-gw ssh 강제 명령 종목 단위 요청형(기록 1초 + 전송 · gh-trade 구현) · 과거 = `gs://gh-trade-tick-archive` 원본 Cloud Run Job 변환(tickana 디코더 · 119 부하 0). 버스트 = 주문 묶기(msg_seq+1) · 팀 거래정보 = gh-radar 가 A3 에서 §5-1 평균단가법 직접 계산. 목업 A/B/C 먼저(`/gsd-sketch`), 계약은 discuss 뒤 trade-handoff
- Phase 39 added (2026-11-05): 매매진단 챗봇 — gh-trade 인박스 `261105-chatbot-diagnosis-kind9.md`. 기존 팀장 챗봇(Messages API tool use)에 읽기 전용 「주문 진단」 전문가(`claude-opus-5-5` · env `CHAT_DIAGNOSIS_MODEL`, 사용자 결정) 추가 — 저널·전략 이벤트·당일 틱·kind 9 조회, 계좌는 `req.userId` 서버 강제. kind 9 「상태전이」 43칸 매핑(1차 설정 변경 이력 + 자동 꺼짐/켜짐 · `reason_code` 로 사람/서버 구분)을 trade-handoff 로 회신 → gh-trade 구현 뒤 적재. 인박스 질문 답: 도구 호출은 API tool use(CLI·Agent SDK 아님) · 주문 조회 도구는 아직 없음(kind 9 없이 답 가능 범위 = 0) · 지난 날짜 시세는 1차 제외
- Phase 38 added (2026-11-03): 틱뷰어 우리 주문·체결 표시 — `/analytics/ticks` A3 에 우리 팀 계좌 체결 표시 + 조건이 걸린 B6/A3 전문 표시(「이 주문은 이 전문을 보고 나갔다」). 원천 `dma_journal_events`(E) · `dma_strategy_events` kind 3·6. 10/30 실측 짝짓기 401/406(98.8%) · 호가 근거 29/29 · cum_volume 앵커 100/100 을 성공 기준으로. 기록 있는 게이트웨이는 KB120·KYOBO119 뿐. 미결(discuss): 계좌 가시성 · KB121/KYOBO127 포함 · 표시 모양 목업 A/B/C
- Phase 40 added (2026-11-06): 체결 앱 푸시 알림 — 트렐로 「체결시 어플알림」(yP2Q3UkZ) 검토 뒤 텔레그램/카카오 대신 **앱 푸시**로 결정. relay applied 훅에서 첫 체결 1건 + 전량 1건 판정·송신(iOS APNs 직접 · Android FCM v1 · 기존 Firebase 프로젝트), 설정 토글 서버 저장 + 기기 토큰, 송신 로그 멱등(WR-09 재전송 · 커서 재생). D-17(앱 안 Firebase 없음) 은 Android 만 번복. 비용 0원 · 5~7 작업일
- Phase 41 added (2026-11-11): 한투 뉴스·공시 피드 — 트렐로 「키움api 뉴스가져와서 돌파에 띄우기」+「실시간 공시 반영」을 gh-trade-42 와 상의. 키움 REST(공식 명세 337개) · 토스 API(v1.2.28)에 뉴스 없음을 확인, 한국투자증권 `news-title`(tr_id `FHKST01011800`)만 뉴스·공시 제목 제공 → 사용자 결정 「gh-radar 가 한투 API 로 받아 gh-trade 에 제공 · KRX F000 직수신은 느리면 그때 · 장중 실측 생략」. 실측(11-11 21:03): 제목만 · 공시 코드 F/G · 응답 종목코드 1개만 표시 · 날짜·시각 커서 페이징. gh-trade 전달은 HTTP 조회 권고(gh-trade-42) — discuss 에서 확정
- Phase 42 added (2026-11-12): 틱뷰어 봉차트·이동평균·수익률 겹쳐보기 — 사용자가 「1분봉/5분봉 · EMA/SMA · 거래량 · 누적/당일 평단 · 팀 누적/당일 수익률을 매집차트와 겹쳐 보고 싶다」 고 요청, 규모 조사 뒤 세 덩어리(봉 · 이동평균 · 거래량 / 당일 수익률 선 / 누적 평단 · 누적 수익률) 전부 진행으로 결정. 누적 수익률은 미실현 기준. **기존 차트는 건드리지 않고 새 차트를 따로 만들어 전환 스위치로 비교 후 채택 결정**. 누적 평단은 매집감지 보고서 payload `avg_px` 가 이미 있어 틱 열기 RPC 한 키 추가로 닿음(gh-trade 변경 없음). 그리는 방식(순수 SVG 권고 vs lightweight-charts)은 discuss 에서 확정. Phase 41 실행 중에 추가 — STATE 의 현재 위치 · 진행률 칸은 건드리지 않음
- Phase 43 added (2026-11-12): 공개매수 공시 텔레그램 알림 — 트렐로 「전자공시에서 공개매수 뜨면, 텔레그램 알림」(gNcHVLC3) 검토. 한투 `news-title` 공시 피드에는 금감원 보고서류가 오지 않음(운영 DB 공시 1,993건 중 공개매수 0건 · 11-11 에스텍은 DART 07:48 → 한투 첫 관련 글 09:03), KIND 는 DART 보다 0 ~ 1분 늦고 공식 API 없음, DART RSS 는 지분공시 누락 → **OpenDART 공시검색 `pblntf_detail_ty=D004` 고정 주기 폴링**으로 결정. API 반영 지연 실측 0 ~ 수 초(12:45 ~ 13:10 · 8건 · 장전 표본 없음). 공식 API 운영 기준 적용(20,000회/일의 75%). OpenDART 키는 사용자 전달(Secret Manager 미등록) · 텔레그램 봇 토큰 · chat id 미보유. 카드의 「공개매수 설명회」 = 「공개매수설명서」 로 사용자 확정. 미결: 알림 범위 · 실행 자리 · 가격 본문 파싱. Phase 41 실행 중 · Phase 42 discuss 중(다른 세션)에 추가 — STATE 의 현재 위치 · 진행률 칸은 건드리지 않음. `phase.add` 가 한글 제목이라 디렉터리를 `43-` 로 만들어 `43-tender-offer-telegram-alert` 로 바꿈

### Pending Todos

- Supabase/KIS/Naver 시크릿 로테이션 (채팅에 노출됨) — 사용자 판단 (Naver: 2026-04-17 노출)
- Infra: `gh-radar-deployer` SA key 로테이션 주기 설정 (현재 영구 key)
- DI-03: `news_articles`·`discussions`·`summaries` RLS 가 `TO anon` 만 명시하는지 audit → `TO anon, authenticated` 로 갱신
- DI-04: Vercel production env trailing newline 오염 검증 절차 자동화(`vercel env pull` 후 `tail -c1 | xxd -p` = `0a` 면 오염)

### Blockers/Concerns (v1.1 로 이월)

- **[Phase 39 후속 · 비차단] 매매진단 리뷰 13건(경고 8 · 참고 5) 수정 완료 2026-11-09** — `/gsd-code-review 39 --fix --all`, 건별 커밋 a6c153bb..d5e5fa0c · server 00089-cbn(70a32dcd) · webapp Vercel Ready. 운영 관찰: WR-04 늦은 레코드 여유 60초가 수신 지연을 덮는지 · WR-06 멈춘 하위 요청 연결이 남는지 · WR-07 병렬 진단 2회 Opus 비용. 정본 `phases/39-trade-diagnosis-chatbot/39-REVIEW-FIX.md` · `39-REVIEW-DISPOSITION.md`.
- **[Phase 40 후속 · 비차단] 체결 푸시 리뷰 경고 7건 open.** 운영 영향이 큰 것은 WR-04(FCM 404·NOT_FOUND 를 모두 토큰 만료로 보고 기기 행 삭제 — `FCM_PROJECT_ID` 오설정 시 Android 전부 삭제) · WR-07(로그아웃 정리 실패 시 같은 폰 다음 사용자에게 앞 사용자 체결 알림). 나머지는 응답 유실·종료 시 묶음 소실(WR-01·02) · RPC 시간 상한 없음(WR-03) · 자동매도 완료 수치 경합(WR-05) · 토스트 숨김 공백(WR-06). 정본 `phases/40-fill-push-notification/40-REVIEW.md` · 처분 `40-REVIEW-DISPOSITION.md`.
- **[Phase 29] 두 번째 서버(KB121 · KYOBO127) 켜기 전 결정.** 운영은 지정 0 · 두 번째 서버 꺼짐이라 잠복. 켜기 전에 R3-03 부팅 창 백스톱 · R3-05 무동작 대여 미승격 · R3-06 VI 끄기 에코 미확인 수정, 51 OrderResp 계좌 필터 공백 수용 여부, 실서버 실증. 정본 `milestones/v1.0-phases/29-dma-multi-server-admin/29-53-SUMMARY.md` 「켜기 전 결정」. v1.1 밖(v1.2+ ADMIN-NEXT). **+ 예수금 갈림(Phase 36 D-03):** 체결 조정이 서버마다 따로 가므로 두 서버 동시 운영 전 서버 간 예수금 동기화 결정 필요(공유 계좌 반영 범위 WR-04 미룸과 함께 — 36-UAT Deferred).
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
| 261028-ggj | 매집 차트 닿는 원 묶음 툴팁(gh-trade 261028 규칙 1~6) + 모바일 길게 누르기 툴팁 | 2026-10-28 | b1f7a10f | [261028-ggj-accum-chart-group-tooltip-touch](./quick/261028-ggj-accum-chart-group-tooltip-touch/) |
| 28 | 매집 차트 묶음 판정 가로 ± 5px (gh-trade 261028-accum-chart-group-x5) | 2026-10-28 | f8edd816 | — |
| 29 | 발사 주문 내역 체결 수량 — launch_orders_for_admin 이 dma_account_orders 를 order_no 로 join | 2026-10-30 | e40a4233 | — |
| 261030-d7b | 발사 A 재확인 회차(09:00:29) 덮어쓰기 — launch_pieces/heads PK 에 fire_base · 주문 내역 A KRX 09:00:00~09:00:30 회차 표시 | 2026-10-30 | 2a81523f | [261030-d7b-launch-a-recheck-fire-base-key](./quick/261030-d7b-launch-a-recheck-fire-base-key/) |
| 261030-dz7 | 경계지도 16:00 뒤탐침 표시 — 삼각형 · 경계 계산 포함(가격거부=열림 · E127 제외) · 지도 RPC probe/round/result_code | 2026-10-30 | 030e39d2 | [261030-dz7-launch-map-tail-probe](./quick/261030-dz7-launch-map-tail-probe/) |
| 32 | 홈 급등 종목 클릭 시 종목상세 뉴스토론 탭(?tab=news)으로 착지 | 2026-10-30 | 652c7f86 | — |
| 261030-kpg | 상따 SetLimitChaser change_mask 전환 — relay buy3_schema 6 · 웹 손댐 추적 (gh-trade Phase 44) | 2026-10-30 | f890ee8a | [261030-kpg-setlimitchaser-change-mask-relay-buy3-sc](./quick/261030-kpg-setlimitchaser-change-mask-relay-buy3-sc/) |
| 34 | 어드민 계좌 예수금 칸 편집·표시를 만원 → 원 단위로 | 2026-10-30 | (이 커밋) | — |
| 261101-0r3 | 위험도 분자 변경 반영 — relay 85 스키마 재생성 · limit_vol_qty 디코드 · 상따 위험도 새 식 · 보고서 risk_* 20261102 경계 (gh-trade 261031) | 2026-11-01 | 1ef9a8fe | [261101-0r3-relay-85-risk-20261102-gh-trade-261031](./quick/261101-0r3-relay-85-risk-20261102-gh-trade-261031/) |
| 261101-owf | 상따 카드 85 창구행 셋째 칸 깨짐확률 → 「최대체결 X.X억」 — relay upper_max_fill 디코드 · 오늘 검정/지난 날 회색+툴팁 · 폰 「최대 X.X억」 (gh-trade nbu WinForms 동형) | 2026-11-01 | (이 커밋) | [261101-owf-85-x-x-gh-trade-nbu-winforms](./quick/261101-owf-85-x-x-gh-trade-nbu-winforms/) |
| 261101-okd | 상따 SOR 전환 — relay buy3_schema 7 (sor_buy·sor_sell) · 웹 ○SOR 매수·매도 (D-06 동반 · NXT 미거래 잠금) · 키별 에코 맵 (gh-trade Phase 45) | 2026-11-01 | 4e46a359 | [261101-okd-sor-relay-buy3-schema-7-sor-gh-trade-pha](./quick/261101-okd-sor-relay-buy3-schema-7-sor-gh-trade-pha/) |
| 261102-epl | 버스트 비율 판정 반영 — relay 59 brp · 84/42 burstRatioPct(42 는 1~100 만) · 상따 호가 「버스트 NN%」/회색 「NN%」 · /me 「판정 비율」 칸 · 주문로그 「버스트 상한가 NN%」 (gh-trade t7c · enc) | 2026-11-02 | a441b9be | [261102-epl-relay-burst-ratio-pct-nn-me-gh-trade-t7c](./quick/261102-epl-relay-burst-ratio-pct-nn-me-gh-trade-t7c/) |
| 261102-f1x | 85 upper_max_fill_auction 반영 — 생성물 재동기화 · relay 85 매핑 · 창구 셋째 칸·툴팁 앞말 「단일가」/「최대」 (gh-trade quick-261102-f1x · WinForms 동형) | 2026-11-02 | 4b2f8828 | — |
| 261103-j4d | 틱뷰어 목록 팀 당일순매수 · 누적순매수 · 당일손익(격자 변환 때 계산 · 스케치 023 B) | 2026-11-03 | 5d1ebc87 | [261103-j4d-tick-list-team-day-net-pnl](./quick/261103-j4d-tick-list-team-day-net-pnl/) |
| 261103-fast | 틱뷰어 Shift+] [ — 다음/이전 팀 주문 첫 A3 조각(맨 [ ] 는 38 우리 체결) · gsd-fast | 2026-11-03 | 3549aff3 | — |
| 261103-n1s | 상따 매도 ☐위험도 [N]% — relay buy3_schema 8 · 비트 52·53 · UserSettings sell_risk_pct · 웹 매도주문 위험도 행 · 위험도(합) · /me 위험도 기준 (gh-trade 인박스 261103-sell-risk · WinForms 동형) | 2026-11-03 | 10701459 | [261103-n1s-sell-risk-buy3-schema-8-gh-trade-261103](./quick/261103-n1s-sell-risk-buy3-schema-8-gh-trade-261103/) |
| 261103-pei | 발사 주문 내역 대기열 순번 · 앞 물량(16:00 접수 때 정확 · 마감 때 추정 · 09:00 체결 순번) — 틱 변환이 계산해 DB 저장 · 목업 027 A | 2026-11-03 | f944bfc3 | [261103-pei-launch-order-queue-position](./quick/261103-pei-launch-order-queue-position/) |
| 261104-6lh | Phase 38 리뷰 후속: tickgw as-of 헤더로 당일 대기 판정 · RPC fills journal_epoch 키 | 2026-11-04 | 7c51f4df | [261104-6lh-phase-38-tickgw-as-of-rpc-fills-journal-](./quick/261104-6lh-phase-38-tickgw-as-of-rpc-fills-journal-/) |
| 261104-n9h | 틱뷰어 목록 — 오늘 목록 팀 3열(매집감지 kind 16 · 손익 ≈ 추정) + 시가·고가 열(등락률은 종가/현재가 기준) | 2026-11-04 | 9da0dafb | [261104-n9h-tick-list-today-team-cols-open-high-3](./quick/261104-n9h-tick-list-today-team-cols-open-high-3/) |
| 261104-n7i | 발사 주문 대기열 당일 자동 계산(launch-live) — tickgw 당일 틱으로 16:01·16:03·16:10 · 09:01·09:03 계산 · live 표식(밤 nightly 가 덮음) · 웹 「HH:MM 기준」 | 2026-11-04 | e9b4df39 | [261104-n7i-launch-live](./quick/261104-n7i-launch-live/) |
| 261104-nxs | 작업대 매집감지 목록 — relay 95 AccumPriceBatch 현재가 원천(95 없는 종목만 구독 폴백) + 등락률·당일 순매수 최소~최대 필터 · 전부 보기 · 필터 밖 N | 2026-11-04 | 7737c8cb | [261104-nxs-relay-95-accumpricebatch](./quick/261104-nxs-relay-95-accumpricebatch/) |
| 48 | 작업대 매집 줄 /api/accum-signals 50~92초 — dma_accum_signals_for_user_json kind 16 부분 인덱스 직접 읽기(반환·규칙 불변) | 2026-11-04 | c70564db | — |
| 261104-umt | 틱뷰어 타임라인 차트 — 스케치 028 채택안 구현(고정 띠 통합 툴팁 · 묶음 표 · Shift+끌기 구간 합계 · 순매수 판 매수/매도 누적 거울선 · 판 높이 70) | 2026-11-04 | 3cabd115 | [261104-umt-tick-timeline-sketch028](./quick/261104-umt-tick-timeline-sketch028/) |
| 50 | 틱뷰어 전문 목록: 차트·화살표·우리 주문 탐색으로 찾은 전문을 가운데로 스크롤(목록 안 행 클릭은 제자리) | 2026-11-05 | 38be7f93 | — |
| 51 | 상따 ☐위험도 3초 래치 반영(gh-trade aa331275) — 선·줄매수 자동 체크가 ☐위험도도 켬(매도주문 켜짐일 때 · C# 동형) · 위험도 도움말 문구 · OFF 사유 주석 | 2026-11-05 | 41033add | — |
| 261106-ldl | 유통주식수 야간 배치(JOB_MODE=float) + 공개 엔드포인트 2종(GET /api/stocks/float · /:code/float) | 2026-11-06 | bc11d0c0 | [261106-ldl-stock-float](./quick/261106-ldl-stock-float/) |
| 261106-lwu | 어드민 「계좌」 메뉴(등록·수정·삭제) + 사용자별 계좌 연결(고르기 A) + 사이드바 My page↔Admin 순서 | 2026-11-06 | 32725b88 | [261106-lwu-admin-accounts](./quick/261106-lwu-admin-accounts/) |
| 261106-ntl | 계좌 메뉴에서 예수금·수수료·매도세·주문자 IP/MAC 설정(연결 사용자 팬아웃) · 사용자 카드 읽기 전용 · 사이드바 Admin 하위 순서 | 2026-11-06 | 32bca9e5 | [261106-ntl-account-costs](./quick/261106-ntl-account-costs/) |
| 261106-p8h | 발사 대기열 마감 때 취소 추정을 우리 주문로그(dma_account_orders)로 바로잡기 — launch_queue_inputs alive · fifoReplay protect · queueLevelValuesOf | 2026-11-06 | 0e91d7a5 | [261106-p8h-launch-queue-alive](./quick/261106-p8h-launch-queue-alive/) |
| 261106-pnl | 매매손익 어드민(/admin/pnl) 계좌별만(계정별 · 「미상」 제거) · 일자 행 기본 닫힘 — gsd-fast | 2026-11-06 | (fix(admin-pnl) 커밋) | — |
| 261106-t8k | 어드민 e2e 새 UI 기준 정비 — admin.spec·sidebar-tree 수정 · 계좌 화면 admin-accounts.spec 신설(IP/MAC·예수금/수수료 이동) | 2026-11-06 | 765a3b22 | [261106-t8k-e2e-admin-e2e-ui](./quick/261106-t8k-e2e-admin-e2e-ui/) |
| 261107-fbj | /me 탭 순서 · 설정 탭 매매 설정만 · 계정 카드 매매 알림 종(스케치 030 A) · 돌파 알림음 끔 · 앱 하단 탭바 제거 · 앱 /trading 공용 패널 복원 | 2026-11-07 | b8ce4b3a | [261107-fbj-mypage-push-bell-remove-app-tabbar](./quick/261107-fbj-mypage-push-bell-remove-app-tabbar/) |
| 261107-olr | 앱 주문로그 착지(푸시 탭)를 앱 셸로 감싸 막다른 화면 해소 — gsd-fast | 2026-11-07 | 8a612976 | — |
| 261107-iep | 어드민 발사 서버별 보기 — 서버 칩(KB120·교보119·교보112) · 주문 내역/경계 지도/계획 고치기 서버별 · 교보112 계획 대상 추가 | 2026-11-07 | 930dd236 | [261107-iep-admin-launch-per-server-view](./quick/261107-iep-admin-launch-per-server-view/) |
| 261107-jhk | 러쉬 주문 상단 정리 — 메뉴·제목 개명 · 탭→서버 칩→날짜+발사 한 줄 · 설명·출처·범위 글 삭제 | 2026-11-07 | c0a96bf0 | [261107-jhk-admin-launch-header-redesign](./quick/261107-jhk-admin-launch-header-redesign/) |
| 261107-l7w | 뒤탐침 개수(0~10)·간격(1~100µs) 어드민 설정 — 서버별·발사별 · 이력 표 · 지도 예정 뒤탐침 · relay 와이어 대기(gh-trade Phase 47 인계 뒤 연결) · 범례 09:00:30 | 2026-11-07 | 91472266 | [261107-l7w-admin-launch-tail-probe-setting](./quick/261107-l7w-admin-launch-tail-probe-setting/) |
| 261107-moq | 어드민 「서버에만 있음」 계좌 카드 — 이 사용자에 연결 · 서버에서 빼기(목업 B) · 교보112 복사 시작 재발 방지 | 2026-11-07 | 55b69d6a | [261107-moq-admin-server-only-account](./quick/261107-moq-admin-server-only-account/) |
| 261107-oom | tick-convert 밤 변환 OOM 수정(gsd-fast) — Job 16Gi · KeyStager.take 순간 메모리 절반 | 2026-11-07 | ffb52008 | — |
| 261109-dz1 | 매매 알림(앱 푸시) 계좌별 켜고 끄기 — 끈 계좌 표 · claim 기기 제외 · API · 시트 「받을 계좌」(스케치 031 A) | 2026-11-09 | 843a0140 | [261109-dz1-push-account-toggle](./quick/261109-dz1-push-account-toggle/) |
| 261109-sbs | 모바일·앱 사이드바 드로어 스크롤 수정(gsd-fast) — 드로어 안 래퍼에 overflow-y-auto · overscroll-contain | 2026-11-09 | 8c48c85e | — |
| 261109-fr1 | 터치 화면 파란 포커스 링 전역 제거 · 모바일 드로어 자동 포커스를 드로어 자신으로(맨 위에서 열림) · 닫기 X 띠(gsd-fast) | 2026-11-09 | d220e490 | — |
| 261109-kyn | 교보 09:00:30 N 발사시각 어드민 칸 하나로(gsd-fast · 인박스 261109-kyobo-n-single-field) — 코스피·코스닥 공통 값(N/K) · 저장 op 8 K→Q 두 번 · 갈라짐 안내 · KB 그대로 | 2026-11-09 | cad36b55 | — |
| 261109-sej | 주문로그 하루치 조회 RPC 직접 읽기 — 장중 8~70초 → 0.3초(앱 알림 탭 착지 「불러오지 못했어요」) · 운영 적용 20261109200000(gsd-fast) | 2026-11-09 | 22b1d41e | — |
| 261109-kzk | 팀 매집 보고서 팀 순매수 = 틱뷰어 당일순매수(tick_grids 조인 · 폴백 * 표식 · 하루 합계 이름 구별) | 2026-11-09 | c096d205 | [261109-kzk-teamflow-team-net-uses-tick-viewer-day-n](./quick/261109-kzk-teamflow-team-net-uses-tick-viewer-day-n/) |
| 261109-tn6 | 매집감지 Phase 48 반영 — 하루 판정 종료·즉시 종료 회색 행 · rule_version · relay 동기화 | 2026-11-09 | 198d49f8 | [261109-tn6-accum-phase-48-handoff-day-net-rules](./quick/261109-tn6-accum-phase-48-handoff-day-net-rules/) |
| 72 | 매집 복원 RPC 속도 개선 — 좁은 열 선택 후 PK 되짚기(7.2초 → 1.05초 · 결과 불변) | 2026-11-09 | 6809abb7 | — |
| 73 | 뉴스 자료원 한글 언론사 이름 매핑(gh-trade 요청 · 응답 시점 변환) | 2026-11-12 | 803fe83a | — |
| 74 | 재료 없는 한투 자동 기사 숨김(시세 한 줄 · 시황 · 상위 N종목 목록 → auto_market · 소급 포함) | 2026-11-12 | 8907a59a | — |
| 75 | 수급 자동 기사 숨김(소급 2차) + 시황 기사 제외(응답 시점 · shared isMarketSummaryTitle) | 2026-11-12 | 0bc17a9d | — |
| 76 | 네이버 뉴스는 제목에 종목명 있는 기사만(조회 함수가 상한 전에 거름 · 한투 뉴스는 그대로) | 2026-11-12 | 95607989 | — |
| 77 | 한투 제공처 I(자료원 「공시」 주식선물 가격제한폭 안내)를 공시로 분류해 숨김 · 소급 192건 | 2026-11-12 | ab229f6b | — |
| 78 | 네이버 뉴스 종목명 조건에 별칭 표 18개(에스엠 SM엔터 · NAVER 네이버 · 신한지주 신한금융 등) | 2026-11-12 | 2affd1f2 | — |
| 79 | 네이버 뉴스 수집 대상에 시가총액 상위 보통주 50 추가(cap 등급 장중 30분 순환) — 급등 목록에서 빠진 NAVER · 현대차 · 카카오 수집 멈춤 해결, 마지막 기사 시각 종목당 1건 조회 — **사용자 요청으로 되돌림(fcf01053)** | 2026-11-12 | 7273b187 | — |
| 261112-tlw | 러쉬주문 09:00:30 주문 내역에 개장차익 손익 표시 — 묶음마다 「종목별 손익」 표(종목 · 손익 · 잔여 · 방향 · 매수/매도 체결) + 카드 「손익」 줄 · gh-trade 개장차익 화면과 같은 식(체결 순서 재생 · 왕복 0.22%) · 주문 내역 RPC 에 fills 키 | 2026-11-12 | 01e60455 | [261112-tlw-09-00-30-launch-openarb-pnl](./quick/261112-tlw-09-00-30-launch-openarb-pnl/) |
| 81 | 매집 복원 RPC 인덱스화 — 부분 인덱스 2개(종목별 최신 · 복원 묶음) + 종목 건너뛰기 · 종목별 조회로 재작성. 결과 불변(운영 36건 전후 동일 · pgTAP 37건). 운영 직접 호출 1서버 0.85초 → 0.14초 · 2서버 1.45초 → 0.25초 · 3서버 2.05초 → 0.33초 | 2026-11-12 | 3d63e619 | — |
| 261112-w2q | 상따 작업대 미체결에 VI 자동주문 표시 — 서버 UnfilledState.origin(gh-trade 204e505d) 재동기화 · relay toUnfilledOrigin · VI 행만 주황 「VI」 배지 + 연주황 행(목업 B) | 2026-11-12 | 4e79fc15 | [261112-w2q-vi-unfilled-origin-vi](./quick/261112-w2q-vi-unfilled-origin-vi/) |
| 83 | 261112-w2q 후속 — 작업대 테스트 허용 카드 prop 목록에 originOf 추가(카드에 unfilledOriginOf 를 넘기며 깨짐) | 2026-11-12 | d236b8af | — |
| 84 | 종목 묶음 조회(by-stock) 공시 보장 — 기간 안 최신 공시 3건을 뉴스와 따로 싣기(gh-trade 인박스 261113) · 홈 AI 도 2건 보장 | 2026-11-13 | e762eb75 | — |
| 261113-iez | 공시 알림 감시 대상 추가 — 수시공시 I001(최대주주변경 · 양수도 · 경영권변경 · 단일판매 · 주식소각 · 투자판단, 30초) · 임원 거래계획 D005(60초) · B001 자기주식취득 · 주식교환, 새 종류 원본만 | 2026-11-13 | e8c19ca6 | [261113-iez-dart-alert-i001-d005-b001-2](./quick/261113-iez-dart-alert-i001-d005-b001-2/) |
| 261113-rn7 | 공시 알림 OpenDART 키 2개(공개매수 종일 5초 · 수시공시 10초 · 나머지 30초) · 감시 대상 6개(거래소 시장조치 I003 · 최대주주 소유주식 변동 I004 · 배당 · 투자유의 추가) · 아침 전날 확인 | 2026-11-13 | 3dcc287b | [261113-rn7-dart-alert-two-keys-cadence-and-new-kind](./quick/261113-rn7-dart-alert-two-keys-cadence-and-new-kind/) |

## Session Continuity

**Resume file:** .planning/phases/42-tick-chart-candle-overlay/42-UI-SPEC.md

Last session: 2026-11-12T11:50:45.524Z
Stopped at: Phase 41 complete, ready to verify Phase 43

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
| Phase 35 P12 | 8min | 3 tasks | 5 files |
| Phase 35 P13 | 6min | 2 tasks | 6 files |
| Phase 35 P14 | 10min | 3 tasks | 13 files |
| Phase 35 P15 | 21min | 3 tasks | 11 files |
| Phase 35 P10 | 25min | 3 tasks | 8 files |
| Phase 35 P16 | 7min | 3 tasks | 11 files |
| Phase 35 P17 | 8min | 2 tasks | 7 files |
| Phase 35 P19 | 5min | 2 tasks | 5 files |
| Phase 36 P01 | 6 min | 1 tasks | 15 files |
| Phase 36 P10 | 5min | 2 tasks | 10 files |
| Phase 36 P02 | 10min | 2 tasks | 14 files |
| Phase 36 P03 | 16min | 3 tasks | 9 files |
| Phase 36 P06 | 8min | 2 tasks | 8 files |
| Phase 36 P04 | 15min | 3 tasks | 13 files |
| Phase 36 P05 | 10min | 2 tasks | 11 files |
| Phase 36 P07 | 9min | 2 tasks | 9 files |
| Phase 36 P08 | 26min | 3 tasks | 15 files |
| Phase 38 P01 | 9 min | 1 tasks | 14 files |
| Phase 38 P02 | 6min | 2 tasks | 12 files |
| Phase 38 P03 | 5min | 2 tasks | 2 files |
| Phase 38 P04 | 13min | 2 tasks | 9 files |
| Phase 38 P05 | 5min | 2 tasks | 3 files |
| Phase 38 P06 | 14 min | 2 tasks | 10 files |
| Phase 38 P07 | 10 min | 2 tasks | 7 files |
| Phase 38 P08 | 12 min | 2 tasks | 11 files |
| Phase 38 P09 | 13min | 2 tasks | 4 files |

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
- [Phase 35]: 35-12: 이력 읽기 RPC = 조합별 최근 N ∪ 마지막 ok(jsonb 1값) · launch_plan_changes 는 service_role SELECT/INSERT 만
- [Phase 35]: 35-12: validateLaunchPlanDraft 검사 순서 = 개수 → 칸마다(정수 → 범위) → 순서 · badIdx/idx 0부터 · LAUNCH_PLAN_LIMITS 잠정(35-19 대조)
- [Phase 35]: 35-13: 발사 계획 GET 은 relay 실패(미설정·못 닿음·비200·모양 위반·누락 서버)를 서버별 offline 200 으로 접고, PUT 은 어떤 결과든 이력 1행 · 기록 실패는 200 change null + logger.error
- [Phase 35]: 35-14: 계획 상태는 LaunchMapTab 소유 · 탭 진입 1회 GET /plan · 404=absent 면 계획 기능 숨김(35-08 그대로)
- [Phase 35]: 35-14: panelPlanOf 가 패널 계획 정본 — 「계획 고치기」 비활성 = plan.source !== 'server' · 마지막 변경은 server 일 때만
- [Phase 35]: 35-14: LaunchGateChart next → planLines(조각마다 점선 data-idx) + children 슬롯 · launchAxisOf(values, marks, fire)
- [Phase 35]: 35-15: 편집 상태는 지도 탭 LaunchPlanEdit 한 곳(draft 원문 · valid 마지막 유효 값) — 미리보기 선·표는 valid 만
- [Phase 35]: 35-15: 저장 결과·저장 중은 칸 키(gateway|market|fire)로 묶는다 · 실패여도 응답 plan·change 로 계획 상태 갱신(재조회 없음)
- [Phase 35]: 35-15: 바꿀 실선 굵기 2 · 번호는 행 아래(목업 정본) · 조각 칸 104px(−3000 잘림 실측)
- [Phase 35]: 35-10: kind 17·18 정식 매핑 — 노트 전용 4칸(base_cum·error_volume·remaining_volume·plan_rev) 매핑 안 함(사용자 결정 2026-10-28) · next_offset_us = cond_threshold 직접(A2 폴백 없음)
- [Phase 35]: 35-10: launch_pieces.result_code 는 rc= 원문(0101·0515·E127·F083) · 백필 표기(101·515·0)와 다름 · fire_at_us = fire= KST epoch µs
- [Phase 35]: 35-16: ADMIN_OP 8·9 만 · 6·7 자리는 phase-36 병합 세션 몫
- [Phase 35]: 35-16: 94 는 request_id 로만 짝짓는다 — op 8 뒤 94 · 늦은 94 는 debug 후 버림 · op 8/9 는 87 대기 판정 밖
- [Phase 35]: 35-16: 94 updated_at 빈 값 허용 · entries 원소 null = 프레임 파손
- [Phase 35]: 35-17: 발사 계획 조회 · 저장은 서버 키 단위 LaunchPlanService(dispatcher 밖) — offline 은 isReady 로만, 레지스트리 없음 · 꺼짐은 skipped 단일 문구
- [Phase 35]: 35-17: PUT 은 조회(전) → op 8 → 조회(후) 같은 FIFO · 후 조회는 저장 끝 + 5초 ≤ 마감(도착+10초)일 때만 · relay zod 는 구조만(순서 · 범위는 gh-trade code 1)
- [Phase 35]: 35-17: Phase 36 갈래 ③ — phase-36 브랜치는 커밋 완료 · master 미병합. 병합 때 admin-api import · interpretAdminResult 유니온(1~9) · admin.test it.each 3곳 양쪽 살림
- [Phase 35]: 35-19: 16:00 학습 줄 판정 = correction_before · after · step_us 중 하나라도 non-null 이면 옛 라벨, 아니면 「다음 발사 계획 첫 조각」 + next_offset_us
- [Phase 35]: 35-19: D-34 LAUNCH_PLAN_LIMITS 정식 노트(119/120 서버 설정값)와 일치 — 값·테스트 무변경, JSDoc 만
- [Phase 35]: 35-19(fix 노트): 「서버 미지원」 은 code 1 + 「알 수 없는 명령입니다」 일 때만 · Q16 시각 목록 폭 ≤ 500µs 클라 검증(LAUNCH_PLAN_LIMITS.maxSpanUs)
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
- [Phase 36]: 36-05 D-15(one-way): 저널 손익 4키 avg_price · fee_krw · tax_krw · realized_pnl_krw = dma_journal_events bigint NOT NULL DEFAULT 0 열 이름(사용자 「승인 (권장)」) · 평단 모르는 매도 정본은 인박스 「추가」 4번
- [Phase 36]: 36-07: /me 매매손익 응답 dma_user_ids 는 항상 [] (T-19-08 · D-08 — 트레이더 RPC 는 dma_user_id 비노출)
- [Phase 36]: 36-07: 매매손익 집계 SQL 은 내부 조립 함수 dma_pnl_daily_build(me|user|account) 한 벌 — for_user · for_admin 은 얇은 래퍼(권한 3줄 셋 다)
- [Phase 36]: 36-08: 펼침 기본 복원은 리셋 키 없이 로딩 상태로 — 기간·묶음·계좌 변경 시 카드가 다시 서며 첫 묶음 첫 행만 열림
- [Phase 36]: 36-08: usePnlReport 상태를 만든 키와 함께 둬 키 변경 첫 렌더는 곧바로 loading(이전 응답을 새 라벨로 비추지 않음)
- [Phase 36]: 36-08: /admin/pnl 문서 제목은 서버 metadata 정본 — router.replace 가 루트 제목으로 되돌림
- [Phase 36]: 36-08: 계좌별 증권사 배지 = KB 게이트웨이 하나라도 있으면 KB · BROKER_LABEL export 로 같은 낱말 한 벌
- [Phase 38]: 38-01: 어드민 판정은 RPC tick_own_for_user 안 dma_app_access_map() role 조회 — 분기 인자 없음(인자 4개 고정)
- [Phase 38]: 38-01: 우리 체결 짝짓기는 브라우저 shared matchOwnFills · own 조회 실패(동기 throw 포함)는 우리 층만 비우고 콘솔 경고 한 줄
- [Phase 38]: 38-02: own1030 오라클 픽스처는 창 격자(원본 레코드 순서 보존 필터) + 생성기 안 원본=창 짝짓기 동일성 자기검사 · 저널 JSON 키는 README 규칙대로 전부 알파벳 정렬
- [Phase 38]: 38-02: 10/30 원본 격자 5종목에 같은 (board, seq) 중복 A3 0건 — 중복 제외 시 수치 = 단언 수치(236/165/5/108)라 Open Q4 는 이 데이터로 판별 불가 · 규칙은 probe 그대로
- [Phase 38]: 38-03: tick_own_for_user 를 pgTAP 52 단언으로 잠금 — 레지스트리 UPDATE 만으로 KB121 켜면 체결·이벤트·주문·servers 자동 포함 · KYOBO119 끄면 빠짐(끄기는 CHECK 때문에 is_order_server=false 동반)
- [Phase 38]: 38-03: /api/ticks/own 은 RPC 인자 키 정확히 4개(p_user_id·p_date·p_isin·p_ex) — 쿼리에 p_all_accounts·user_id·account_no 를 더해도 무시됨을 supertest 로 잠금 · 서버에 어드민·가시성 판정 없음(정본 RPC)
- [Phase 38]: 38-04: 우리 줄 자리 = 수신순 lowerBoundRecv 슬롯(두 순열 공통) ROW 앞 · 다조각 묶음 사이면 그 꼬리 뒤로 민다 · own 없으면 항목 바이트 동일
- [Phase 38]: 38-04: 둘째 레일 = 주문별 [주문 줄 · 체결 자리] 구간 차분 배열 · 실선 우선 · 팀/일반 3px 레일은 시각 칸으로 · 우리 줄 선택은 (줄, rec) 기억 + 커서 일치 파생
- [Phase 38]: 38-05: 호가 근거 시작 자리는 lowerBoundRecv 에 µs 내림 경계 + 루프 안 probe 식 수신 ms 로 [g − 3000, g + 50] 재검사 — 소수 gw 에도 BigInt 예외 없음 · 경계는 probe 와 같다
- [Phase 38]: 38-05: 체결 근거 단건 후보 2개 이상(중복 수신 포함)이면 단건 아님 → 구간 (before, after] 규칙 — probe 「정확히 1개」 그대로 · 10/30 분포 a3 2 · range 9 · none 2
- [Phase 38]: 38-06: 체결통보(ev_kind 3) 근거 = 같은 게이트웨이 · 계좌의 gw ≤ 이벤트 gw ∧ 가격 · 수량 일치 우리 체결 중 마지막 것의 짝 A3 — 그 체결이 짝 없으면 근거 없음(Open Q3 UAT 대상)
- [Phase 38]: 38-06: 되돌아가기 알약은 주문 묶기 키(gateway|order_no) + 화면 범위(isin|d|ex)로 기억 · 주문 줄 선택 순서 = 주문 줄 → 첫 짝 체결 → 짝 없음 줄 · 카드 근거 줄은 evidenceTextOf 머리 「근거 」 만 뺀다
- [Phase 38]: 38-07: 차트 ○ 는 evidenceRec 하나에 한 점 — OwnMark.orderIds 로 근거가 같은 주문마다 툴팁 줄 · 클릭 되돌아가기는 첫 주문
- [Phase 38]: 38-07: 가격 판 범위는 우리 점으로 넓히지 않음(팀 원과 같은 규칙) · 판 밖 점은 툴팁 · 묶음에서도 뺌 — 판 끝 붙이기 필요 여부는 UAT 확인
- [Phase 38]: 38-08: 우리 체결 알약 › 로 A3 대상에 갈 때 뷰어가 고른 줄(ownPick)을 푼다 — 짝 없음 줄의 기준 전문이 다음 대상이면 현재 자리가 줄에 묶여 › 가 맴돈다
- [Phase 38]: 38-08: 당일 최신 받기는 use-tick-live refresh() 가 요청을 시작했을 때(true)만 ownRefreshKey +1 — epoch 다시 받는 중엔 refreshing 이 false 라 그 플래그로는 own 만 느는 틈이 있었다
- [Phase 38]: 38-09: useTickOwn 진행 중 요청 공유는 컴포넌트 ref(모듈 캐시 아님) — 개발 StrictMode 정리→재실행만 묶어 열기 1회, 재마운트·refreshKey 는 새 요청
- [Phase 38]: 38-09: e2e mockTickApi 기본 own = tickOwnFixture(컷 13시 KRX 유도 합성) — 37 절도 우리 층 켜진 화면으로 회귀, 404 경로는 실패 내성 테스트가 명시
