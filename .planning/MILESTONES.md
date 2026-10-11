# Milestones

## v1.0 Launch (Shipped: 2026-10-11)

**Phases completed:** 37 phases, 432 plans, 937 tasks (2026-04-10 → 2026-10-11)
**Closeout type:** override_closeout — 마일스톤 audit(`/gsd-audit-milestone`) 미실행(사용자 결정 · 토큰 절약). Known verification overrides: 196 newly acknowledged (CLI 99 + phase 15/16/25 deferred-items 97건은 표 스팬이라 파일 상단 `## Deferred Items` 섹션으로 일괄 acknowledged), 0 carried forward.

**Delivered:** 상한가 근접 스캐너·뉴스/종목토론 AI 요약·AI 애널리스트 챗봇을 갖춘 종목 정보 웹앱 위에, gh-trade 서버와 DMA relay 로 이어진 실거래 트레이딩 작업대(상따·VI·자동매도·주문로그)와 GH Trade 모바일 앱, 4대 서버 레지스트리·웹 Admin 까지 운영에 올렸다.

**Key accomplishments:**
1. 데이터·백엔드 기반 — KRX 전 종목 일봉(2020~) + 키움 REST 매분 시세 · Supabase 스키마 · Cloud Run Job/Scheduler 수집 파이프라인 (Phase 1~9)
2. 종목 정보 앱 — 상한가 근접 스캐너 · 검색/상세 · Naver 뉴스 수집 · 종목토론방 수집 + Haiku 의미성 분류 · 테마 분류 · 동조 종목 · 상한가 다음날 이력 · 홈 급등 테마 AI 분석 (Phase 5~13)
3. AI 애널리스트 챗봇 — 팀장 + 전문가 5 멀티에이전트 · SSE 스트리밍 · 종목 컨텍스트 대화 (Phase 14)
4. DMA relay + 트레이딩 작업대 — KB/교보 gh-trade 서버 호가 10단 시세 팬아웃·주문 릴레이 · 상따 3종 매수·VI·돌파감지 · 토스식 주문 티켓 · 자동매도 · 주문로그/잔량진행률 · 상한가 특징 보고서 · 시세 공유 연결 (Phase 15~20, 24~28)
5. GH Trade 모바일 앱 — Capacitor Remote-URL 셸 · 네이티브 탭바/Google 로그인 · TestFlight · Firebase APK 테스터 배포 (Phase 21~22)
6. DMA 다중 서버 · 웹 Admin — 서버 레지스트리 4대 · 허용 gmail/역할/DMA 유저·계좌 편집이 relay 관리자 연결(44/86/87)로 즉시 반영 (Phase 29)

### Known Gaps
- **AUTH-01** 이메일/비밀번호 로그인 — Phase 06.2 에서 Deferred(Google OAuth 만). 필요해지면 v1.1 이후 quick 로.
- **Phase 23 GH Trade Play 스토어 내부 테스트** — Play 개발자 인증 미완료로 로드맵에서 제거(2026-10-11). 인증 뒤 새 phase 로 추가. 옛 22-05~22-07 플랜은 git 이력(`7b83f1ec` 이전 `.planning/phases/23-gh-trade-play/from-phase-22/`).
- Phase 29 「두 번째 서버 켜기 전 결정」· KB 계좌별 IP/MAC 설정 보류(R3-01) — v1.1 인박스 작업으로 이월(`docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md`).

**Archive:** [v1.0-ROADMAP.md](./milestones/v1.0-ROADMAP.md) · [v1.0-REQUIREMENTS.md](./milestones/v1.0-REQUIREMENTS.md) · phase 디렉터리 `milestones/v1.0-phases/` · quick 130건 `milestones/v1.0-quick/`
