# Project Retrospective

*마일스톤마다 갱신하는 살아 있는 문서. 교훈은 다음 계획에 반영한다.*

## Milestone: v1.0 — Launch

**Shipped:** 2026-10-11
**Phases:** 37 | **Plans:** 432 | **Tasks:** 937 | **기간:** 2026-04-10 → 2026-10-11 (6개월)

### What Was Built
- 종목 정보 앱(스캐너·검색/상세·뉴스·종목토론·테마·동조·상한가 이력·홈 AI 분석·AI 챗봇)
- DMA relay 와 트레이딩 작업대(상따·VI·자동매도·주문로그·상한가 특징) — gh-trade 서버 계약 append-only 동기화
- GH Trade 모바일 앱(Capacitor) + TestFlight/Firebase 테스터 배포
- DMA 다중 서버 레지스트리 + 웹 Admin 유저 관리

### What Worked
- gh-trade ↔ gh-radar **인박스 노트**(`docs/inbox/`)로 계약 변경을 파일로 주고받은 것 — 세션이 끝나도 남는다.
- FlatBuffers **append-only** 규약 덕에 서버 먼저/relay 먼저 어느 순서로 배포해도 깨지지 않았다.
- UI 는 **HTML 목업 게이트 → 플랜** 순서가 재작업을 크게 줄였다.
- 갭 클로징을 `-R2/-R3` 별도 파일로 라운드를 분리한 것.

### What Was Inefficient
- 마일스톤 하나에 37 phase · quick 130건이 쌓여 ROADMAP 166KB · STATE 129KB — **매 세션 컨텍스트 로딩 비용이 커졌다.** (→ v1.1 은 작게, 주기적으로 마무리)
- 오래된 phase 의 VERIFICATION `human_needed` · UAT `partial` 이 닫히지 않은 채 누적(12/6건) — 마무리 때 일괄 acknowledge 가 필요했다.
- 실기기·실서버 검증(D-25 래치 왕복 · smoke INV-9)이 환경 제약(Xcode 라이선스 · 토큰)으로 여러 라운드 미수행으로 남았다.
- quick SUMMARY 프런트매터 YAML 오류 2건(따옴표·백틱 시작 스칼라)이 도구 스캔을 막았다.

### Patterns Established
- 배포 순서 **DB → relay → 검증 → push**(push = webapp 프로덕션 배포). 백엔드가 막히면 push 하지 않는다.
- 상따 화면 반응형은 뷰포트가 아니라 **본문 폭 컨테이너 쿼리 4밴드**(globals.css 주석이 정본).
- 값·문장(주문로그·상한가 특징·자동매도 상태)은 **gh-trade 서버가 진실 원본**, 웹은 표시만.
- 한국 크롤링 source 는 일 1~2회 배치·24h 캐시·on-demand 금지·429/403 즉시 24h backoff.

### Key Lessons
1. 마일스톤은 작게 자르고 phase 디렉터리·quick 을 주기적으로 아카이브한다(토큰 비용).
2. `human_needed`/`partial` 검증 산출물은 phase 종료 때 닫거나 명시적으로 이월 표기한다.
3. 프런트매터 스칼라가 `'`·`` ` ``·`*` 로 시작하면 큰따옴표로 감싼다.
4. 실기기 검증이 막히면 「미실행」을 그대로 적고 배포 완결과 섞지 않는다.

### Cost Observations
- Model mix: 계측 없음(quality 프로필 · 주로 Opus 급). 챗봇/워커 런타임은 Sonnet 5 · Haiku 4.5.
- Notable: 큰 phase(16 · 46 plans, 29 · 55 plans)는 갭 클로징 3라운드가 붙어 실행 비용의 절반 이상을 차지했다.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 37 | 432 | GSD 도입 · 인박스 노트 · 목업 게이트 · 갭 클로징 라운드 분리 |

### Top Lessons (Verified Across Milestones)

1. (v1.1 이후 누적)
