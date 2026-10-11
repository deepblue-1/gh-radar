---
gsd_state_version: "1.0"
milestone: v1.1
milestone_name: 운영 유지보수
current_phase: 30
current_phase_name: 인박스 KB 계좌별 주문자 IP/MAC
status: executing
stopped_at: Phase 30 UI-SPEC approved
last_updated: "2026-10-11T06:03:58.107Z"
last_activity: 2026-10-11
last_activity_desc: Phase 30 execution started
state_head: 901861e35977c999bcbbe9827d194fbba1f2789f
progress:
  total_phases: 2
  completed_phases: 0
  total_plans: 7
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-11 after v1.1 milestone start)

**Core value:** 트레이더가 급등 종목을 빠르게 포착하고, 해당 종목의 시장 심리를 AI 요약으로 즉시 파악할 수 있어야 한다
**Current focus:** Phase 30 — 인박스 KB 계좌별 주문자 IP/MAC

## Current Position

Phase: 30 (인박스 KB 계좌별 주문자 IP/MAC) — EXECUTING
Plan: 1 of 7
Status: Executing Phase 30
Last activity: 2026-10-11 — Phase 30 execution started

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

**Resume file:** .planning/phases/30-kb-ip-mac/30-UI-SPEC.md

Last session: 2026-10-11T05:15:19.704Z
Stopped at: Phase 30 UI-SPEC approved
Next: CLAUDE.md 다이어트(DOCS-01, `/gsd-quick`) → `/gsd-discuss-phase 30`

## Operator Next Steps

- `/gsd-quick` 로 CLAUDE.md 다이어트(DOCS-01)
- `/gsd-discuss-phase 30` — 인박스 KB 계좌별 주문자 IP/MAC
