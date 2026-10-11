# Phase 16: Trading 메뉴 — 상따·VI 전략 설정 + 종목검색 재편 + My page - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-08 (세션 시작 2026-09-07 밤)
**Phase:** 16-trading-limit-chaser-vi-my-page
**Areas discussed:** 전략 메시지 전송 경로·조작 규율, 다른 단말과 동기화·충돌 규칙, 사이드 메뉴 재편 세부, My page 구성

**사전 합의:** 이미 커밋된 목업 초안 2건(`16-limit-chaser-mockup-draft.html`, `16-vi-trigger-mockup-draft.html`)은 채택안으로 간주하고, Phase 15 결정(세션 모델·allowlist·ISIN·4탭)은 재질의하지 않음.

---

## 전략 메시지 전송 경로·조작 규율

### Q1. 상따/VI 설정 메시지(10/11/14/33) 전송 경로
| Option | Description | Selected |
|--------|-------------|----------|
| wss 직접 (권장) | 인증된 wss 로 올리고 relay 가 변환. 서버 변경 0 | ✓ |
| REST 경유 (주문과 동형) | Cloud Run → relay 내부 HTTP. 감사 기록 자연스럽지만 왕복 무거움 | |
| 혼합 | 값 변경은 wss, 위험 조작만 REST | |

**User's choice:** wss 직접. 추가 의견: "기존의 직접주문도 wss 를 쓰는 게 더 좋지 않을까? 속도도 빠르고"

### Q2. 직접주문(DirectOrderReq 2)도 wss 로 이관할지
| Option | Description | Selected |
|--------|-------------|----------|
| 주문도 wss 로 통일 (Phase 16 포함) | REST 주문 라우트·relay 내부 HTTP 제거, relay 가 dma_orders insert/update | ✓ |
| 전략만 wss, 주문은 REST 유지 | Phase 15 D-08 존중, 이관은 후속 | |
| 주문 wss 추가, REST 는 남김 | 경로 둘 유지(비권장) | |

**User's choice:** 주문도 wss 로 통일.
**Notes:** Phase 15 D-08/D-22/D-24 대체. 15-20(실서버 검증) 미완 상태에서 이관하므로 plan 이 선후를 정한다.

### Q3. 상따 매수/매도 스위치 확인 다이얼로그
| Option | Description | Selected |
|--------|-------------|----------|
| 확인 없음 (WinForms 동일) | 스위치 ON 즉시 반영 | ✓ (변형) |
| 매수 ON 만 확인 (권장) | 매수 무장만 확인 다이얼로그 | |
| 매수·매도 ON 모두 확인 | | |

**User's choice:** "확인 없이 하되, 옵션값 변경은 값 바뀔 때 적용하지 말고 값 변경 시 수정 버튼을 노출해서 그 버튼을 통해 수정되게 하자"
**Notes:** 목업 초안의 「0.3초 자동 반영」 폐기 → 더티 시 수정 버튼. 권장안(매수 ON 확인)은 채택되지 않음.

### Q4. VI 페이지에도 수정 버튼 규칙 적용?
| Option | Description | Selected |
|--------|-------------|----------|
| VI 도 수정 버튼 (권장) | 금액·상승률·계좌 변경 시 수정 버튼, 시작/중지는 확인 | ✓ |
| VI 는 가동 중에만 수정 버튼 | | |
| VI 는 목업대로 자동 반영 유지 | | |

**User's choice:** VI 도 수정 버튼.

---

## 다른 단말과 동기화·충돌 규칙

### Q1. 편집 중 WinForms 변경 에코(60/61) 도착 시 폼 처리
| Option | Description | Selected |
|--------|-------------|----------|
| 편집 중 필드만 보호 (권장) | 더티 필드는 덮지 않고 배지 표시 | |
| 서버값이 항상 이김 | 더티도 덮어쓰고 수정 버튼 사라짐 + 토스트 | ✓ |
| 편집 중에는 에코 보류 | | |

**User's choice:** 서버값이 항상 이김.

### Q2. 페이지 진입·새로고침 시 전략 상태(24/21/34) 취득 주체
| Option | Description | Selected |
|--------|-------------|----------|
| relay 세션 캐시 → 연결 즉시 스냅샷 (권장) | Ready 시 1회 호출·에코로 갱신·인증 즉시 전달(D-37 동형) | ✓ |
| 페이지가 필요할 때 요청 | | |

**User's choice:** relay 세션 캐시.

### Q3. 60 Broadcast 드롭으로 캐시 어긋남 복구
| Option | Description | Selected |
|--------|-------------|----------|
| 재연결 시 + 주기 재조회 (권장) | 예 60초 24 전수열거 대조 | |
| 재연결 시에만 | 서버 dirty 재시도에 의존, 부하 최소 | ✓ |
| 사용자 새로고침 버튼 추가 | | |

**User's choice:** 재연결 시에만.

### Q4. 상따 전략 삭제(crud D) 규칙
| Option | Description | Selected |
|--------|-------------|----------|
| 스위치 둘 다 OFF = 삭제 (WinForms 동일) | 목업대로, 별도 버튼 없음 | ✓ |
| 명시 삭제 버튼 (확인) (권장) | 둘 다 OFF 는 비활성 유지, 삭제는 버튼 | |
| 둘 다 지원 | | |

**User's choice:** 스위치 둘 다 OFF = 삭제.

---

## 사이드 메뉴 재편 세부

### Q1. 기존 라우트 경로
| Option | Description | Selected |
|--------|-------------|----------|
| 기존 URL 유지, 라벨만 변경 (권장) | /scanner 라벨 「상승률 상위」, 신규 /trading/*, /me | ✓ |
| 그룹 경로로 이전 + 리다이렉트 | /search/* 로 이동, 301 | |

**User's choice:** 기존 URL 유지.

### Q2. 그룹 접힘 동작
| Option | Description | Selected |
|--------|-------------|----------|
| 항상 펼침, 접기 없음 (권장) | 그룹 헤더 = 소제목 | ✓ |
| 현재 경로 그룹만 펼침 | | |
| 사용자 토글 기억(localStorage) | | |

**User's choice:** 항상 펼침.

### Q3. 상따 등록 전략 목록 위치
| Option | Description | Selected |
|--------|-------------|----------|
| 사이드바에 나열 (목업대로) (권장) | 전략별 링크 /trading/limit-chaser/[key] + 상태 배지 | ✓ |
| 사이드바에는 개수 배지만 | | |
| 목록은 My page 에만 | | |

**User's choice:** 사이드바에 나열.

### Q4. 모바일 내비게이션
| Option | Description | Selected |
|--------|-------------|----------|
| drawer 그대로, 트리 동일 (권장) | | ✓ |
| 하단 탭바 추가 | 범위 커짐 | |

**User's choice:** drawer 그대로.

---

## My page 구성

### Q1. /me 구성
| Option | Description | Selected |
|--------|-------------|----------|
| 전략 현황 → 미체결 → 잔고 (로드맵 3종) (권장) | 전체 비활성화 버튼 포함, account-panel 재사용 | ✓ |
| 3종 + 오늘 주문 이력(dma_orders) | | |
| 단순화: 전략 현황만, 잔고·미체결은 링크 | | |

**User's choice:** 로드맵 3종.

### Q2. 계좌 2개 이상일 때 잔고·미체결
| Option | Description | Selected |
|--------|-------------|----------|
| 계좌 선택 탭/드롭다운, 한 번에 1계좌 (권장) | | |
| 전 계좌 합산 표, 계좌 열 표시 | | |
| 계좌별 섹션 세로 반복 | | ✓ |

**User's choice:** 계좌별 섹션 세로 반복.

### Q3. DMA 매핑 없음·비로그인 사용자
| Option | Description | Selected |
|--------|-------------|----------|
| 페이지 규격 유지 + 안내 빈상태 (권장) | 사이드바 항목은 노출 | |
| 사이드바에서 숨김 | 직접 URL 진입은 빈상태 | ✓ |

**User's choice:** 사이드바에서 숨김.

### Q4. wss 연결 범위
| Option | Description | Selected |
|--------|-------------|----------|
| 앱 전역 1연결 (로그인 시 항상) (권장) | AppShell 프로바이더, 사이드바 숨김·전략 목록 원천, 호가주문 탭 공유 | ✓ |
| 트레이딩·My page·호가주문에서만 | 매핑 판정은 별도 REST | |

**User's choice:** 앱 전역 1연결.

---

## Claude's Discretion

wss 메시지 스키마·상관키, relay 전략 캐시 구조, 주문 wss 타임아웃·중복 방지, dma_orders 출처 컬럼, 사이드바 배지 상태·문구, 전략 로그 원천, 15:40 자동 비활성화 표시, 수정 미적용 이탈 경고, VI 마감알림 구현, 수량 산출 표시, 종목 선택 진입·기본값, 계좌 기본값·비번 필드, REST 제거 순서·env/방화벽 정리, 라우트 파일 구조. (CONTEXT.md §Claude's Discretion 참조)

## Deferred Ideas

오늘 주문 이력 표, 명시 삭제 버튼, 주기 재조회/수동 재동기화, 편집 중 필드 보호, 그룹 접힘·하단 탭바, 매핑 없는 사용자 안내 페이지(자격증명 UI 와 함께), 단건 비활성화 UI, VI NXT, 거래원·정정/IOC/FOK/시장가·서버측 한도, relay 내부 HTTP 완전 제거.
