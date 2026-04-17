# Phase 8: Discussion Board — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 08-discussion-board
**Areas discussed:** 스크래핑 & 캐싱, 차단/실패 UX, 표시 항목 & 더보기, 정렬·필터

---

## 영역 1: 스크래핑 & 캐싱 전략

### Q1-1 수집 주체 구성
| Option | Description | Selected |
|--------|-------------|----------|
| A. server route only (순수 on-demand) | 법적 리스크 최소화, 사용자 진입/새로고침 시만 | |
| B. route + watchlist 종목 저빈도 배치 | watchlist만 1시간 pre-fetch | |
| C. route + worker 하이브리드 | bulk-polling 금지로 부적절 | |

**User's choice (follow-up):** Bright Data 등 프록시 기반 + 1h 배치 + on-demand route (follow-up Q1a 옵션 C)
**Notes:** "이건 테스트를 해봐야 결정할 수 있을거 같은데? 이왕이면 스캐너/watchlist 종목들에 대해 1시간 주기로 수집하고 싶은데. + 종목진입/새로고침시에 업데이트 하고싶고. bright data같은 스크래핑 솔루션 사용도 가능할거같고."

### Q1-1a (follow-up) 아키텍처 확정
| Option | Description | Selected |
|--------|-------------|----------|
| A. Phase 7 패턴 복제 (Job + Scheduler 1h + on-demand) | ~200종목 타겟, 프록시 Plan POC | |
| B. MVP on-demand only, 배치 Phase 8.1로 분리 | | |
| C. 처음부터 Bright Data 급 프록시 + 1h 배치 | 비용 감수, 안정성 우선 | ✓ |

**User's choice:** C
**Notes:** "왼전부터 Bright Data 같은 프록시 기반 + 1h 배치" — CLAUDE.md "무료 API 우선" 원칙과 상충하지만 명시적 예외 승인.

### Q1-1b (follow-up) 배치 타겟 범위
| Option | Description | Selected |
|--------|-------------|----------|
| A. top_movers ∪ watchlists (~200종목) | Phase 7 뉴스와 동일 | ✓ |
| B. watchlists만 (~50~100) | 리스크 최소화 | |
| C. top_movers만 (~100) | 시장 트렌드 중심 | |

**User's choice:** A

### Q1-1c (follow-up) POC 초점
| Option | Description | Selected |
|--------|-------------|----------|
| A. 차단 감지 (403/429 빈도) | | |
| B. HTML 구조 안정성 | | |
| C. 제품 품질 테스트 | 대표 종목 1~2주 운영 → 트레이더 유용성 | ✓ |

**User's choice:** C

### Q1-2 캐싱 TTL
| Option | Description | Selected |
|--------|-------------|----------|
| A. 5분 | 신선도 우선 | |
| B. 10분 (추천) | ROADMAP 상한, 법적·부하 최소 | ✓ |
| C. 7분 | 중간값 | |

**User's choice:** B

### Q1-3 캐시 저장소
| Option | Description | Selected |
|--------|-------------|----------|
| A. Supabase discussions.scraped_at (row-level TTL) | 단일 진실, 추가 인프라 없음 | ✓ |
| B. Upstash Redis | 별도 인프라, 오버 엔지니어링 가능성 | |

**User's choice:** A

### Q1-4 mount 시 자동 fetch
| Option | Description | Selected |
|--------|-------------|----------|
| A. 자동 fetch (뉴스 동일) | 캐시 재사용으로 네이버 호출 최소화 | ✓ |
| B. 버튼 수동만 | 최대 보수 | |

**User's choice:** A

---

## 영역 2: 차단/실패 UX

### Q2-1 프록시까지 실패, 캐시 있음 (Stale)
| Option | Description | Selected |
|--------|-------------|----------|
| A. 캐시 노출 + "X분 전" 배지 + 재시도 버튼 | 정보 연속성 + 신뢰 배지 | ✓ |
| B. 캐시 숨김 + 조용한 에러 | 정확도 우선 | |
| C. 캐시 노출 + 배지 없음 | 미니멀 | |

**User's choice:** A

### Q2-2 완전 실패 (캐시 없음)
| Option | Description | Selected |
|--------|-------------|----------|
| A. "토론방을 불러올 수 없어요" + 재시도 | 사용자 친화, 차단 언급 없음 | ✓ |
| B. 안내 + 네이버 외부 링크 이탈 | | |
| C. Phase 9 placeholder 톤 | 실패 거의 없다는 전제 | |

**User's choice:** A

### Q2-3 Rate 방어 장치
| Option | Description | Selected |
|--------|-------------|----------|
| A. per-stock 30초 쿨다운 + 개인 IP rate limit | 뉴스와 동일 | ✓ |
| B. + 전역 프록시 예산 카운터 | 비용 방어 강화 | |
| C. per-stock만, 전역은 운영 중 대응 | MVP | |

**User's choice:** A
**Notes:** Planner에서 전역 프록시 예산 카운터 추가 검토 권장(Claude's Discretion).

---

## 영역 3: 표시 항목 & 더보기 페이지

### Q3-1 상세 Card 표시 개수
| Option | Description | Selected |
|--------|-------------|----------|
| A. 5개 (뉴스와 동일) | 시각적 균형 | ✓ |
| B. 10개 | 정보 밀도 ↑ | |
| C. 7개 | 절충 | |

**User's choice:** A

### Q3-2 표시 필드
| Option | Description | Selected |
|--------|-------------|----------|
| A. 제목 + 절대시간 | 단순 | |
| B. 제목 + 시간 + 조회수/댓글수 | 열기 신호 | |
| C. 제목 + 시간 + 작성자 | | |
| D. 제목 + 시간 + 작성자 + 조회/댓글 | 정보 풀셀 | |

**User's choice (freeform):** 제목 + 절대시간 + 작성자 + 본문 2줄로
**Notes:** 본문 2줄 미리보기는 discussions.body plaintext + CSS line-clamp-2 로 처리 (CONTEXT D5). 조회수/댓글수 스키마 미존재 → deferred.

### Q3-3 원문 링크 행동
| Option | Description | Selected |
|--------|-------------|----------|
| A. 새 탭으로 네이버 URL | target=_blank rel=noopener | ✓ |
| B. 확인 모달 먼저 | 사용자 경험 마찰 | |

**User's choice:** A

### Q3-4 `/discussions` 전체 페이지 신설
| Option | Description | Selected |
|--------|-------------|----------|
| A. 신설 — 최근 7일 최대 50건 | 뉴스 R2 패턴 대칭 | ✓ |
| B. 신설 불요 — 네이버 외부 링크 | 얕은 UX | |
| C. 신설 — 상세 개수의 2배 | 가벼운 확장 | |

**User's choice:** A

---

## 영역 4: 정렬·필터 정책

### Q4-1 기본 정렬
| Option | Description | Selected |
|--------|-------------|----------|
| A. 최신순 (posted_at DESC) | 뉴스와 동일, 직관적 | ✓ |
| B. 인기순 (조회수) | 열기 신호 | |
| C. 탭 최신/인기 | MVP 면적 증가 | |

**User's choice:** A

### Q4-2 스팸/광고 필터
| Option | Description | Selected |
|--------|-------------|----------|
| A. 제목 <5자 또는 URL 포함 제외 | 최소 휴리스틱 | ✓ |
| B. 필터링 없음 | 투명성 우선 | |
| C. 도메인 블랙리스트 + 키워드 매칭 | 과도한 부담 | |

**User's choice:** A

### Q4-3 시간 범위
| Option | Description | Selected |
|--------|-------------|----------|
| A. 상세 7일, 전체 7일 (뉴스 동일) | 일관성 | |
| B. 상세 24시간, 전체 7일 | 스코프 차별화 | ✓ |
| C. 시간 범위 없음 | 단순 | |

**User's choice:** B
**Notes:** 상세 Card는 "오늘 이 종목에 무슨 일이 있었나" 신호에 집중, 전체 페이지는 주간 탐색.

---

## Claude's Discretion

- 프록시 서비스 최종 선정 (Bright Data / ScraperAPI / 자체 rotation) — POC 결과로 Plan 단계 결정
- cheerio selector 구체
- HTML strip 라이브러리
- 네이버 post URL `nid` 추출
- `posted_at` 포맷 변환
- 작성자 닉네임 마스킹
- `discussions` UPSERT 동작 (DO NOTHING vs DO UPDATE SET scraped_at)
- Retention cleanup 실행 방식
- 프록시 예산 카운터 저장소
- 섹션 컴포넌트 공통 추상화
- `/discussions` 페이지 Next.js server/client 경계
- 테스트 범위
- Dockerfile/deploy 세부

## Deferred Ideas

- Phase 9 AI 요약/센티먼트 (DISC-02)
- 인기순/조회수 정렬 (스키마 미도입)
- 작성자 필터/팔로우
- 댓글 스레드
- 실시간 새 글 푸시 (v2)
- 자유 키워드 검색
- 이미지/첨부 썸네일
- `/discussions` 페이지네이션
- 배치 주기 가변 (장중/장외 분리)
- 스팸 필터 고도화 (Phase 9 AI로 흡수)
- 섹션 컴포넌트 공통 추상화
- Redis 캐싱 도입
