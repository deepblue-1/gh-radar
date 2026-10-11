---
gsd_state_version: "1.0"
milestone: v1.1
milestone_name: 운영 유지보수
current_phase: 31
current_phase_name: 인박스 상따 금액 단위
status: executing
stopped_at: Completed 31-02-PLAN.md
last_updated: "2026-10-11T14:19:55.874Z"
last_activity: 2026-10-11
last_activity_desc: Phase 31 execution started
state_head: 02442cfe8312a04e7b61da8ebcbf9b453362c87d
progress:
  total_phases: 2
  completed_phases: 0
  total_plans: 15
  completed_plans: 8
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-11 after v1.1 milestone start)

**Core value:** 트레이더가 급등 종목을 빠르게 포착하고, 해당 종목의 시장 심리를 AI 요약으로 즉시 파악할 수 있어야 한다
**Current focus:** Phase 31 — 인박스 상따 금액 단위

## Current Position

Phase: 31 (인박스 상따 금액 단위) — EXECUTING
Plan: 3 of 8
Status: Ready to execute
Last activity: 2026-10-11 — Phase 31 execution started

Progress: [░░░░░░░░░░] 0%

## Accumulated Context

### Pending Todos

- Supabase/KIS/Naver 시크릿 로테이션 (채팅에 노출됨) — 사용자 판단 (Naver: 2026-04-17 노출)
- Infra: `gh-radar-deployer` SA key 로테이션 주기 설정 (현재 영구 key)
- DI-03: `news_articles`·`discussions`·`summaries` RLS 가 `TO anon` 만 명시하는지 audit → `TO anon, authenticated` 로 갱신
- DI-04: Vercel production env trailing newline 오염 검증 절차 자동화(`vercel env pull` 후 `tail -c1 | xxd -p` = `0a` 면 오염)

### Blockers/Concerns (v1.1 로 이월)

- **[Phase 29] 두 번째 서버(KB121 · KYOBO127) 켜기 전 결정.** 운영은 지정 0 · 두 번째 서버 꺼짐이라 잠복. 켜기 전에 R3-03 부팅 창 백스톱 · R3-05 무동작 대여 미승격 · R3-06 VI 끄기 에코 미확인 수정, 51 OrderResp 계좌 필터 공백 수용 여부, 실서버 실증. 정본 `milestones/v1.0-phases/29-dma-multi-server-admin/29-53-SUMMARY.md` 「켜기 전 결정」. v1.1 밖(v1.2+ ADMIN-NEXT).
- **[Phase 29 → Phase 30] KB 운영 서버 계좌별 IP/MAC 설정 보류 (R3-01).** relay 가 op 3 에 되싣는 IP/MAC 은 87 캐시라 relay 밖에서 설정한 값을 다음 웹 계좌 편집이 지울 수 있다. 수정(계획 직전 op 5 재조회) · 웹 IP/MAC 입력칸 · 인박스 질문 3개를 Phase 30 에서 함께 — `docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md` (status open).
- **[인박스 → Phase 31] 상따 금액 단위** — `docs/inbox/from-gh-trade/261011-limitchaser-amount-unit.md` (status open · 호환이라 급하지 않음). `lc.set` 재제출 때 금액 8필드 되싣기 · 「만(주)」 표시 도입 여부 결정. gh-trade `feature/limitchaser-amount-unit` master 병합 · 서버 배포 뒤에 되싣기 실증 가능.
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

## Session Continuity

**Resume file:** None

Last session: 2026-10-11T14:19:55.851Z
Stopped at: Completed 31-02-PLAN.md
Next: CLAUDE.md 다이어트(DOCS-01, `/gsd-quick`) → `/gsd-discuss-phase 30`

## Operator Next Steps

- `/gsd-quick` 로 CLAUDE.md 다이어트(DOCS-01)
- `/gsd-discuss-phase 30` — 인박스 KB 계좌별 주문자 IP/MAC

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 30 P01 | 7 min | 3 tasks | 8 files |
| Phase 30 P02 | 5 min | 3 tasks | 6 files |
| Phase 30 P03 | 5 min | 3 tasks | 8 files |
| Phase 30 P04 | 6 min | 3 tasks | 2 files |
| Phase 30 P05 | 4 min | 2 tasks | 2 files |
| Phase 30 P06 | 13 min | 2 tasks | 3 files |
| Phase 31 P01 | 21 min | 3 tasks | 25 files |
| Phase 31 P02 | 6min | 2 tasks | 6 files |

## Decisions

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
- [Phase 31]: 31-02: 두 줄 행 아래 줄은 RowSubLine 한 곳(setting-group export) — 행 3종 · 인라인 편집기 공용, 판정은 호출부 lc-fields.ts
- [Phase 31]: 31-02: 시트 상태 줄 ⑤ 환산 안내(hint)는 ①잠금 ②반영 실패 ③경고 ④다른 단말 뒤 · armedNotice 면 같은 줄 둘째 줄(StatusLine.armedLine)에 「감시 중」
