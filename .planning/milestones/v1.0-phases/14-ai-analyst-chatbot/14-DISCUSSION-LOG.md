# Phase 14: AI 애널리스트 챗봇 (멀티에이전트) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 14-ai-analyst-chatbot
**Areas discussed:** 접근/히스토리 아키텍처, 멀티에이전트 진행 UX, 답변 콘텐츠/근거 표현, 대화 관리 + 비용/제한

---

## 접근/히스토리 아키텍처

### 비로그인 사용자 접근

| Option | Description | Selected |
|--------|-------------|----------|
| 로그인 필수 (Recommended) | FAB/입력창 클릭 시 로그인 유도. 비용 통제·히스토리 저장 일관 | ✓ |
| 비로그인 체험 허용 | 임시 대화(저장 없음), IP 기반 엄격 제한 | |
| FAB 자체 숨김 | 비로그인에게 미노출 | |

### 히스토리 읽기/쓰기 주체

| Option | Description | Selected |
|--------|-------------|----------|
| 서버 JWT 검증 신설 (Recommended) | Supabase access token 전달 → 서버 getUser() 검증 후 로드/저장 전담 | ✓ |
| 웹앱 RLS 직접 + 서버 무상태 | 웹앱이 히스토리를 payload로 전송 (위변조 가능) | |
| 하이브리드 | 서버 쓰기 / 웹앱 읽기 이원화 | |

### 종목상세 챗의 기존 대화 처리

| Option | Description | Selected |
|--------|-------------|----------|
| 최근 대화 자동 이어가기 (Recommended) | 해당 종목 최근 대화 자동 오픈 + '새 대화' 버튼 | ✓ |
| 항상 새 대화 | 매번 빈 대화 시작 | |
| 열 때 선택 | 목록 먼저 표시 | |

**Notes:** 대화 삭제/보존 정책, 동시 요청 처리, 메시지 길이 제한 → Claude 재량.

---

## 멀티에이전트 진행 UX

### 생성 중 진행 표시

| Option | Description | Selected |
|--------|-------------|----------|
| 에이전트별 단계 표시 (Recommended) | "테마 전문가 분석 중…" 등 현재 전문가 라벨 표시 | ✓ |
| 타이핑 인디케이터만 | 점 3개 애니메이션만 | |
| 전문가 중간출력 스트리밍 | 전문가 분석 텍스트 실시간 노출 | |

### 전문가 개별 의견 노출

| Option | Description | Selected |
|--------|-------------|----------|
| 팀장 종합만 (Recommended) | 단일 종합 답변, 의견 충돌은 본문 언급 | ✓ |
| 전문가 카드 접기식 | 답변 하단 접기 카드 | |
| 참여 전문가 배지만 | "분석 참여: 테마·뉴스" 배지 | |

### 생성 중 새 질문/시트 닫기

| Option | Description | Selected |
|--------|-------------|----------|
| 중단 버튼 + 새 질문 시 자동 중단 (Recommended) | interrupt 패턴, 시트 닫아도 서버 완료 후 저장 | ✓ |
| 입력 잠금 | 완료까지 입력 비활성 | |

**Notes:** 에이전트 실패/타임아웃 표시 → Claude 재량 (일부 실패 시 가용 의견으로 답변 + 고지 예상).

---

## 답변 콘텐츠/근거 표현

### 종목 언급 표현

| Option | Description | Selected |
|--------|-------------|----------|
| 미니 종목 카드 삽입 (Recommended) | 종목명+현재가+등락률 인라인 카드, 클릭 시 종목상세 | ✓ |
| 종목상세 링크만 | 텍스트 링크 변환 | |
| 플레인 텍스트 | 변환 없음 | |

### 뉴스/자료 근거 표기

| Option | Description | Selected |
|--------|-------------|----------|
| 출처 링크 인용 (Recommended) | DB 뉴스 verbatim(제목+출처+URL) + 웹서치 citations | ✓ |
| 출처명만 표기 | 링크 없음 | |
| 답변 하단 출처 목록 | 말미 참고자료 섹션 | |

### 마크다운 렌더링

| Option | Description | Selected |
|--------|-------------|----------|
| 풀 마크다운 (Recommended) | 표/리스트/헤딩/볼드 | ✓ |
| 라이트 변환 | bold/링크/줄바꿈만 | |

### 차트 임베드 (free-text)

**User's choice:** "이미 차트 라이브러리가 있으니까 필요시 이걸 사용하자" → 기존 lightweight-charts(Phase 09.2) 재사용, 필요 시 미니 가격차트 삽입.

---

## 대화 관리 + 비용/제한

### 사용자당 질문 제한

| Option | Description | Selected |
|--------|-------------|----------|
| 일 30턴 + 동시 1개 (Recommended) | 하루 30턴 KST 리셋 | |
| 분당 제한만 | 10분 10턴 식 단기 제한 | |
| 제한 없음(v1) | 글로벌 IP rate limit(200/분)만 의존 | ✓ |

**Notes:** 사용자가 권장안 대신 무제한 선택 — 개인 프로젝트 규모, 사용자별 quota는 deferred.

### 웹서치 전문가 호출

| Option | Description | Selected |
|--------|-------------|----------|
| 팀장 판단 (Recommended) | 속보/공시성 질문에만 위임, DB로 답 가능하면 미호출 | ✓ |
| 항상 호출 | 모든 질문에 포함 | |
| 사용자 토글 | 입력창 옆 스위치 | |

### 대화 목록 UI 위치

| Option | Description | Selected |
|--------|-------------|----------|
| /chat 페이지에서만 (Recommended) | 전체 목록+종목 필터는 페이지, 시트는 현재 대화만 | ✓ |
| 시트에도 목록 | 시트 상단 전환 드롭다운 | |

---

## Claude's Discretion

- conversations/messages 정확 스키마, 대화 제목 자동 생성, 보존 정책, 메시지 길이 제한
- 동시성 가드 세부(busy/interrupt/턴 상한), 에이전트 실패/타임아웃 처리
- 오케스트레이션 구현 형태(전문가=tool vs fan-out), SSE 이벤트 정확 스펙, 모델 config 키, 면책 문구

## Deferred Ideas

- 사용자별 일일 quota (비용 증가 시)
- 비로그인 체험 모드
- 전문가 의견 개별 카드 노출
- FAB 시트 내 대화 전환 UI
