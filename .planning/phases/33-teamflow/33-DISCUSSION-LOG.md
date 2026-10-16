# Phase 33: 팀 매집(teamflow) 보고서 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-16
**Phase:** 33-teamflow
**Areas discussed:** ① 적재 격리(TEAM-01), ② UAT 데이터·인박스, ③ 목록 세부(TEAM-03), ④ 차트 구현(TEAM-04)

---

## ① 적재 격리 (TEAM-01)

| Option | Description | Selected |
|--------|-------------|----------|
| 같은 트랜잭션 | `limitup_commit_day` 에 `limitup_team_flow` 7번째 표 · stage CHECK · purge 한 줄 · 파일 없는 날짜 = 0행 commit | ✓ |
| 별도 RPC 격리 | team_flow stage/commit 분리 · 자체 적재 이력 · 실패 시 상한가 표 무영향 | |

**User's choice:** 같은 트랜잭션
**Notes:** export 쪽이 종목 단위 · 단계 단위 실패를 이미 격리하므로 워커에 남는 실패는 스키마 불일치뿐이고 두 방식 위험이 같다.

| Option | Description | Selected |
|--------|-------------|----------|
| 워커 자동 감지 | manifest 에 team_flow 있는데 `limitup_loads.rows` 에 team_flow 키 없으면 files_sig 같아도 재적재(영구 · 멱등) | ✓ |
| 마이그레이션 일회성 UPDATE | 워커 배포 뒤 files_sig=NULL 한 번 — 마이그레이션→워커 배포 사이 21:20 적재가 끼면 다시 손으로 | |

**User's choice:** 워커 자동 감지

---

## ② UAT 데이터·인박스

| Option | Description | Selected |
|--------|-------------|----------|
| 10/16부터 실물 + 샘플은 픽스처 | 라이브 UAT = 첫 자연 적재 날짜 · 10/14 샘플은 픽스처만 | |
| 샘플을 프로덕션에 수동 적재 | 워커 경로 밖에서 10/14 주입 | |
| gh-trade 에 10/14 재기록 요청 | trade-handoff 로 reexport 요청 | |

**User's choice:** (Other) 「gh-trade 에서 기존 날짜 데이터 다 만들어 줄 거야. 지금 진행하고 있으니까 확인해 봐.」
**Notes:** discuss 도중 인박스 노트 `261016-teamflow-export.md` 가 도착(gh-trade-e0). gh-trade-e0 확인 답: 11일(20260929·0930·1001·1002·1006·1007·1008·1012·1013·1014·1015) 재기록 완료 · 119 에 놓임 · 오늘 21:00 pull → files_sig 변경으로 오늘 밤 옛 워커가 11일 재적재(표 6개 동일) → 워커 배포 뒤 자동 감지로 team_flow 적재. 10/14 라이브 UAT 는 정식 경로. 맥 샘플 34행(sha256 f6656ae2…d897)은 10/14 export 의 team_flow 와 같은 코드 · 같은 입력 — 픽스처로 사용.

---

## ③ 목록 세부 (TEAM-03)

| Option | Description | Selected |
|--------|-------------|----------|
| 팀 순매수 내림차순 | `team_net_val` 큰 순 · 태그로 상한가/미도달 구분 · 정렬 전환 없음 | ✓ |
| 상한가 도달 먼저 → 팀 순매수 | status=limit 그룹 위 | |
| 첫 상한가 시각순 | 상한가 보고서 시간 축 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 종가 등락률 + 고가 보조 | 태그 `last_rate` · 보조줄 `high_rate` · 상한가는 「상한가 HH:MM」 | ✓ |
| 고가 등락률 태그 | 태그 `high_rate` · 종가 보조 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 팀 매집 행이 있는 날짜만 | 빈 날짜는 알약에서 건너뜀 · ?d= 직접 열면 빈 상태 | ✓ |
| 상한가 보고서와 같은 날짜 전부 | 적재된 날짜 전부 · 빈 날짜는 빈 상태 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 부호 + 억 소수 1자리 | +7.0억 · −3.1억 · 비중 정수 % · DB 원 단위 유지 · 웹 변환 | ✓ |
| 상따 화면 축약 규칙 재사용 | 스케치 010 C 만·억 축약 | |

**User's choice:** 위 ✓ 4건. 더 묻기 대신 「다음 영역」 — KPI 합 · 판정 기준 본문 · members null 표시는 Claude 재량.

---

## ④ 차트 구현 (TEAM-04)

| Option | Description | Selected |
|--------|-------------|----------|
| 순수 SVG 손그림 | 스케치 015 코드 이식 · `<title>` 툴팁 · CSS 변수 색 · 번들 추가 0 | ✓ |
| recharts 래퍼(ui/chart.tsx) | 기존 래퍼 · 띠·음영·세로선은 우회 필요 | |
| lightweight-charts | 종목 차트 라이브러리 · 가로 막대·2단 막대·띠 부적합 · hex 변환 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 장 시간 고정축 09:00~15:30 | 39칸 고정 · 빈 버킷 빈 칸 · 잠김 공백 보임 | ✓ |
| 체결 있는 버킷만 이어 붙임 | export 그대로 · 종목마다 축 다름 | |

---

## Claude's Discretion

- 표 · RPC · 라우트 · 파일 · shared 타입 이름.
- 상한가 보고서 부품(KpiStrip · DayGrid · DateNav) 일반화 vs 복제 범위.
- 사이드바 항목 위치 · active 판정 · title · 빈 상태 문구.
- 판정 기준 접힘 본문(team-flow.md §3~§5 요약 하드코딩) · members null · window null 표시.
- 폰 390 차트 폭 · 접힌 표 가로 스크롤 · 보존 90일 · 옛 워커 호환 분기 구현.
- 픽스처 날짜 배치(20261002 와 병합 vs 별도) · E2E · 단위 테스트 구성.
- 로드맵과 어긋난 두 항목은 기존 limitup 패턴을 따른다 — RLS 정책 0개(TO anon, authenticated 아님) · `requireAuth` + RPC 안 DMA 게이트(`requireDmaMapped` 미들웨어 겹치지 않음).

## Deferred Ideas

None — discussion stayed within phase scope.
