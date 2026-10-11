# Phase 28: 상한가 특징 연동 — gh-trade Phase 27 계약 반영 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-05
**Phase:** 28-limitup-feature-ingest
**Areas discussed:** 실시간 85 표시, kind 15 웹 노출, 보고서 페이지 IA, 적재 파이프라인

사용자가 4영역 전부 선택하며 「목업으로 옵션을 먼저 보여줘」 요청 → 영역마다 HTML 목업(변형 A/B/C)을 먼저 열고 그 안에서 골랐다.

---

## 실시간 85 표시

첫 목업은 Phase 27 목업 틀(종목상세 헤더 + 호가주문 탭)을 재사용했다가 사용자 지적 「상따 카드가 아니라 호가주문창에 붙어있는데? 상따카드로 제대로 보여줘야지」 → 작업대 상따 카드(헤더 LED 칩 · 정보/미체결/잔고 탭 · 10칸 · 좌 호가 | 우 폼) 그대로 다시 만들어 열었다. 종목상세 호가 탭은 Phase 21 D-31 로 삭제된 사실을 확인해 표면은 상따 카드 하나로 정리.

| Option | Description | Selected |
|--------|-------------|----------|
| A 카드 탭 「상한가」 | 정보·미체결·잔고 옆 네 번째 탭, 탭 본문 고정 72px, 카드 높이 불변 | ✓ |
| B 호가 아래 (Recommended) | WinForms 동형 위치, 685 이상 좌 호가 칸 아래 · 폰은 전폭 띠, 카드 +84px | |
| C 탭 아래 전폭 띠 | 정보 10칸 아래 전폭, 모든 폭 같은 자리, 카드 +84px | |

**User's choice:** A (권장 B 를 뒤집음)

| Option | Description | Selected |
|--------|-------------|----------|
| 잠김 전이 때만 (Recommended) | lock_state 0→1 때 한 번 자동 전환 | |
| 자동 전환 없음 | 사용자 클릭만, 탭 제목으로 알림 | ✓ |
| 85 첫 수신 때 | 대상 키가 되면 전환 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 잠김 시간 (Recommended) | 「상한가 · 잠김 43초」(빨강) / 「상한가 · 깨짐」 / 「상한가」 | ✓ |
| 점 하나 | 잠김 중 빨간 점만 | |
| 아무것도 안 붙임 | 항상 「상한가」 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 잠김 칩 추가 (Recommended) | 접힌 카드 요약 칩 옆 「잠김 43초」 칩(잠김 중에만) | ✓ |
| 접히면 안 보임 | 헤더 요약은 계좌 상태만 규칙 유지 | |

**Notes:** 목업을 A 채택 상태(탭 제목 · 접힘 칩 · 폰 축약)로 갱신해 둠. 「더 질문 / 다음 영역」 → 다음 영역.

---

## kind 15 웹 노출

첫 질문에 사용자 「이게 뭐고 어떤식으로 보이는건지 눈으로 보여줘」 → 주문로그 팝업 목업(분당 「상한가특징」 줄, 노출 방식 A/B/C) 작성·열기.

| Option | Description | Selected |
|--------|-------------|----------|
| A 기본 숨김 + 체크 (Recommended) | 시세 집합에 15 추가 + 조립기 분기, 주문로그는 「상한가 특징」 체크를 켜야 보임 | ✓ |
| B 항상 포함 | 시세 이벤트 1·2·10 과 같은 취급 | |
| C 적재만 | RPC·조립기·화면 무변경 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 90일 뒤 삭제 (Recommended) | kind 15 만 90일 | |
| 영구 보관 | 지우지 않음 | |
| 30일 뒤 삭제 | 더 짧게 | ✓ |

---

## 보고서 페이지 IA

보고서 내용 구성은 gh-trade D-20 정본이라 묻지 않고, 위치·접근·탐색·시각 규칙만 순서대로.

| Option | Description | Selected |
|--------|-------------|----------|
| 트레이딩 그룹 아래 (Recommended) | /trading/limitup, DMA 사용자만 | |
| 로그인 전원 독립 페이지 | /limitup 최상위 | |
| 종목상세 안 섹션 | 기존 상한가 이력 섹션 확장 | |
| Other | **최상위 「분석(analytics)」 메뉴를 트레이딩 다음에 두고 그 하위에 「상한가 보고서」** | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| 로그인 전원 (Recommended) | 공개 시세 파생 데이터라 게이트 불필요 | |
| DMA 연결 사용자만 | 트레이딩과 같은 조건 | ✓ |

목업 `mockup-limitup-report.html`(사이드바 「분석 › 상한가 보고서」, 날짜 ‹ ›, 10/02 실측값, 탐색 구조 A/B/C):

| Option | Description | Selected |
|--------|-------------|----------|
| A 한 페이지 세로 (Recommended) | 날짜 하나, KPI→격자→사건 카드(행 탭 시 스크롤)→지문표→어제 결과 | ✓ |
| B 날짜 → 종목 상세 2단계 | 종목별 상세 페이지·URL | |
| C 상단 탭 하루\|사건\|창구 | gh-trade 목업 탭 동형 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 중립색 곡선 (Recommended) | 곡선 --fg, 음영 회색, 관례색은 창구 막대·깨짐·큰 매도에만 | ✓ |
| 파랑 곡선 (목업 현재) | gh-trade 목업 동형, 앱에서는 매도색과 충돌 | |
| 빨강 곡선 | 매수 관례색, 깨짐 ● 와 겹침 | |

**Notes:** 목업을 A·중립색 채택 상태로 갱신.

---

## 적재 파이프라인

| Option | Description | Selected |
|--------|-------------|----------|
| radar-gw rsync→GCS, Cloud Run Job 적재 (Recommended) | tick-archive 동형 운반 + 새 워커 limitup-sync(Scheduler 21:20), 기존 워커 관행 | ✓ |
| radar-gw 에서 바로 적재 | oneshot 이 Node 로 Supabase 적재, 런타임·키·journald 로그 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 큰 표·격자 1년, 작은 표 무기한 (Recommended) | jumps·member_alloc·격자 1년, 나머지 영구 | |
| 전부 90일 | 119 원본과 같은 창, GCS 사본으로 재적재 가능 | ✓ |
| 전부 무기한 | 용량 보며 결정 | |

**마무리 질문:** 「CONTEXT 작성 / 다른 회색 영역 더」 → CONTEXT 작성.

## Claude's Discretion

- 85 브라우저 프레임 이름·스냅샷 캐시·갱신 깜빡임·관측 시각 표기 위치.
- kind 15 체크 상태 기억 · purge 실행 주체 · 부분 인덱스.
- 보고서 빈 날·로딩·날짜 선택 컴포넌트·SVG 축·종목상세 링크.
- 격자 전송 형식 · 적재 이력 표 · GCS 버킷 이름 · 알림 문구 · 공개키 생성 절차 세부.
- 인박스 질문 1(grid 한도)·3(kind 15 경로)·4(85 로그 레벨)·5(GIN) 의 기술 답은 Claude 가 코드 확인으로 작성(CONTEXT 「인박스 질문 5건 답」).

## Deferred Ideas

- 「분석」 메뉴의 다른 하위 페이지.
- 보고서 종목 행 → 종목상세 링크 · 종목상세 섹션에 사건 카드 요약.
- 카드 「상한가」 탭에 오늘 분 단위 이력(kind 15) 표시.
