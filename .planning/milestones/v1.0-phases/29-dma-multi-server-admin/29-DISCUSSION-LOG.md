# Phase 29: DMA 다중 서버 · 웹 Admin 유저 관리 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-06
**Phase:** 29-dma-multi-server-admin
**Areas discussed:** 허용 gmail · 역할 모델, 진실 원본 · 비밀번호 · 반영 경로, 서버 레지스트리 · 전환 · 배포 단계, Admin 화면 구조와 흐름

---

## 허용 gmail · 역할 모델

| Option | Description | Selected |
|--------|-------------|----------|
| 로그인 뒤 전면 차단 | 미허용 gmail 은 앱 어디서든 「승인 대기」 화면만, middleware 1곳 판정, 가입 흔적 남음 | ✓ |
| 로그인 자체 거부 | Auth Hook/callback 에서 세션 생성 거부, 사전 등록 필수 | |
| 트레이딩·Admin 표면만 게이트 | 공개 페이지는 누구나, dma-gate 확장 | |

**User's choice:** 로그인 뒤 전면 차단

| Option | Description | Selected |
|--------|-------------|----------|
| admin · trader 2단 | 테마 운영자 권한 admin 에 흡수, 최소 구성 | |
| admin · trader · viewer 3단 | viewer = 트레이딩 표면 없이 스캐너·뉴스·분석만 | ✓ |
| 역할 없음 · 허용 목록 + Admin 목록 | 역할 열 없이 표 2개 | |

**User's choice:** admin · trader · viewer 3단

| Option | Description | Selected |
|--------|-------------|----------|
| 사전 등록 + 가입 대기 둘 다 | 표 키는 이메일, 승인 대기 목록에서 역할 골라 승인 | ✓ |
| 가입 대기에서만 승인 | 표 키는 auth.users id | |
| 사전 등록만 | 가입 대기 목록 없음 | |

**User's choice:** 사전 등록 + 가입 대기 둘 다

| Option | Description | Selected |
|--------|-------------|----------|
| 즉시 — 다음 요청부터 차단 + relay wss 끊김 | middleware 매 요청 판정, relay 가 표 읽어 wss 종료, DMA 세션 유예 후 종료 | ✓ |
| 다음 로그인부터 | 열린 탭·relay 세션 그대로 | |
| 즉시 차단하되 relay 세션 유지 | 웹만 막고 소켓은 스스로 끊길 때까지 | |

**User's choice:** 즉시 — 다음 요청부터 차단 + relay wss 끊김

---

## 진실 원본 · 비밀번호 · 반영 경로

| Option | Description | Selected |
|--------|-------------|----------|
| DB 가 의도 · 서버 87 은 반영 상태 | 서버별 「반영됨/미반영/서버에만 있음」 칩, 꺼진 서버도 편집 가능, 「다시 반영」 | ✓ |
| 서버 87 이 진실 · DB 는 연결·비밀만 | 드리프트 개념 없음, 꺼진 서버 유저는 안 보임 | |
| 둘 다 저장 · 충돌은 묻는다 | 매번 Admin 에게 확인 | |

**User's choice:** DB 가 의도 · 서버 87 은 반영 상태

| Option | Description | Selected |
|--------|-------------|----------|
| Admin 이 입력 · 저장 후 재표시 없음 | 확인 칸 1개, 「변경」 만 가능 | ✓ |
| 자동 생성 · 1회만 표시 | relay 가 난수 생성 | |
| 입력 또는 생성 선택 · 보기 토글 | 복호화 API 필요 | |

**User's choice:** Admin 이 입력 · 저장 후 재표시 없음

| Option | Description | Selected |
|--------|-------------|----------|
| 서버→relay HTTP 요청/응답 + 87 은 DB 표로 | 주문 D-22 경로 동형, 서버별 결과 배열, Admin 화면 wss 없이 동작 | ✓ |
| 기존 relay wss 에 admin 프레임 추가 | 실시간성 좋으나 DMA 세션 없는 admin 예외 경로 필요 | |
| DB 쓰기 → relay 감시 → 결과 표 | 요청 경로 없음, 응답 지연 | |

**User's choice:** 서버→relay HTTP 요청/응답 + 87 은 DB 표로

| Option | Description | Selected |
|--------|-------------|----------|
| 열린 세션 유지 · 다음 로그인부터 새 비밀 | 암호문만 교체, 전략·미체결 영향 0 | ✓ |
| relay 사용자 세션 즉시 재로그인 | 새 비밀 즉시 검증 | |
| 변경 자체를 세션 없을 때만 허용 | 라이브 세션 있으면 막음 | |

**User's choice:** 열린 세션 유지 · 다음 로그인부터 새 비밀

---

## 서버 레지스트리 · 전환 · 배포 단계

| Option | Description | Selected |
|--------|-------------|----------|
| 주소는 env · 역할 플래그는 DB | host/port 배포 env, 주문/시세/enabled 만 DB | |
| 전부 DB 표 | host/port/플래그 모두 dma_servers, 재배포 없이 서버 추가, 안전 기본값 재설계 필요 | ✓ |
| 전부 env · 전환은 재배포 | Admin 에서 못 바꿈 | |

**User's choice:** 전부 DB 표
**Notes:** 안전 기본값(로컬 relay 가 운영 DB 레지스트리로 실서버에 붙지 않게) 재설계는 플래너 재량으로 CONTEXT D-09 에 고정.

| Option | Description | Selected |
|--------|-------------|----------|
| 기존 세션 유지 · 새 로그인부터 새 서버 | 미체결·전략 보존, 「재접속하면 적용」 배지 | ✓ |
| 즉시 이동 — 끊고 새 서버 재로그인 | 예전 서버 미체결은 웹에서 안 보임 | |
| 세션 있으면 전환 거부 | 누가 붙어 있는지 보여 주고 막음 | |

**User's choice:** 기존 세션 유지 · 새 로그인부터 새 서버

| Option | Description | Selected |
|--------|-------------|----------|
| 새 연결 먼저 열고 재구독 끝나면 예전 연결 닫기 | make-before-break, 공백 거의 없음 | |
| 예전 연결 닫고 새 연결 열기 | break-then-make, 연결 1개 불변, 전환 중 배지 적색 + 캐시, 실패면 되돌림 | ✓ |
| 전환은 장 밖에서만 허용 | 장중 전환 차단 | |

**User's choice:** 예전 연결 닫고 새 연결 열기

| Option | Description | Selected |
|--------|-------------|----------|
| 2단계 — 레지스트리·허용역할 먼저, Admin 쓰기·role2 나중 | 단계별 롤백 | |
| 1회 빅뱅 — gh-trade 서버 배포 뒤 한 번에 | 호환 코드 없음, 장 마감 후 한 번 | ✓ |
| 3단계 — 세션·전환을 따로 | 가장 보수적 | |

**User's choice:** 1회 빅뱅 — gh-trade 서버 배포 뒤 한 번에

---

## Admin 화면 구조와 흐름

| Option | Description | Selected |
|--------|-------------|----------|
| /admin 한 페이지 · 상단 탭 「사용자 \| 서버」 | 사이드바 항목 1개 | |
| 사이드바 하위 2항목 /admin/users · /admin/servers | 「분석 › 상한가 보고서」 패턴 | ✓ |
| 사용자 페이지 하나 · 서버 전환은 상단 띠 | 서버 주소 편집은 띠 안 시트 | |

**User's choice:** 사이드바 하위 2항목

| Option | Description | Selected |
|--------|-------------|----------|
| A 시트 | 폰 바텀시트 · 데스크톱 우측 패널, 목록 유지 | ✓ |
| B 상세 페이지 /admin/users/[id] | 라우트 분리 | |
| C 아코디언 | 행 펼침 인라인 편집 | |

**User's choice:** A 시트 (처음 텍스트 옵션으로 물었을 때 「목업으로 보여줘」 → `reference/mockup-admin-users.html` 열고 채택)

| Option | Description | Selected |
|--------|-------------|----------|
| 필드별 즉시 저장 · 결과 칩 인라인 | 각 변경이 한 요청, 「저장」 버튼 없음 | ✓ |
| 하단 「저장」 일괄 · 결과 요약 토스트 | 부분 반영 상태 생김 | |
| 즉시 저장하되 위험 작업은 확인 다이얼로그 | 삭제·비밀 변경만 확인 | |

**User's choice:** 필드별 즉시 저장 · 결과 칩 인라인 (유저 삭제 · 마지막 계좌 제거는 확인 1회 — Claude 재량으로 보완)

| Option | Description | Selected |
|--------|-------------|----------|
| A 한 시트 · 역할 따라 DMA 섹션 펼침 | 버튼 1개가 허용 표 + DMA 유저 + 첫 계좌 | ✓ |
| B 2단계 · 웹 유저 먼저 → DMA 연결 | DMA 없는 trader 잠깐 존재 | |
| C 항상 전체 폼 · viewer 만 DMA 선택 | 시트가 늘 길다 | |

**User's choice:** A 한 시트 (「디자인 관련은 목업으로 먼저 보여주고 고르게 해줘」 → `reference/mockup-admin-user-create.html` 열고 채택)

| Option | Description | Selected |
|--------|-------------|----------|
| A 증권사 그룹 카드 | 카드 안 역할 라디오 · 사용 토글 · 상태 칩 | ✓ |
| B 표 한 장 | 열에 라디오, 폰은 행 카드 | |
| C 상단 역할 띠 + 서버 목록 | 드롭다운 3개 | |

**User's choice:** A 증권사 그룹 카드 (`reference/mockup-admin-servers.html` 열고 채택)

---

## Claude's Discretion

- 새 DB 표 · RPC · 87 적재 표 · 기존 표 파생 방식 · 마이그레이션 순서.
- theme_admins 통합 · 승인 대기 차단 페이지 문구/레이아웃.
- relay 레지스트리 재적재 · admin 연결 상태기계 · (유저,서버) 세션 키 · healthz 확장 · 안전 기본값 게이트 형태.
- Express admin 라우트 · relay HTTP 계약 · 감사 로그 최소형.
- 테스트 구성 · 미가동 서버 초기 상태 · 관찰자 정원 배분.

## Deferred Ideas

- Admin 감사 로그 화면.
- BUSY 해소 도우미(Admin 이 전략·미체결 정리).
- 서버 추가 시 네트워크 자동화.

## 세션 중 들어온 외부 입력

- gh-trade-0d 세션(2026-10-06): DeleteUser(op 2) 는 연결이 붙어 있어도 BUSY 아님 · BUSY 는 계좌 상태로만 · SetAccount branch/trader 변경은 BUSY 조건 시 9 거부. CONTEXT 확정 항목에 반영. gh-trade Phase 29 worktree `phase-29-admin-users` 개시, 다음 통보는 프로토콜 플랜 커밋 직후 인박스 노트 + sync 결과.
