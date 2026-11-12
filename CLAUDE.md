<!-- GSD:project-start source:PROJECT.md -->
## Project

**gh-radar**

한국 주식 트레이더를 위한 실시간 종목 정보 웹앱. 상한가에 근접한 종목을 실시간으로 스캔하고, 관심 종목의 뉴스와 네이버 종목토론방 정보를 AI가 요약하여 제공한다.

**Core Value:** 트레이더가 급등 종목을 빠르게 포착하고, 해당 종목의 시장 심리를 AI 요약으로 즉시 파악할 수 있어야 한다.

### Constraints

- **Budget**: 무료 API 활용 우선, API 호출 비용 최소화
- **데이터 갱신**: 실시간이 이상적이나, API 제한 시 1분 간격 폴링 허용
- **배포 환경**: 프론트 Vercel, 백엔드 Cloud Run (컨테이너 기반)
- **법적**: 크롤링 시 robots.txt 준수, API 이용약관 준수
<!-- GSD:project-end -->

<!-- GSD:stack-start source:docs/stack.md -->
## 데이터 소스 운영 기준

스택 선정 근거·대안 비교·판례 상세·설치 명령·출처 링크는 `docs/stack.md`. 여기는 매 세션 지켜야 할 운영 규칙만 둔다.

### 스크래핑 source 운영 5원칙 (Naver 종목토론방 등)

보수적 운영의 근거는 형사가 아니라 **민사 DB제작자 권리 침해(대법원 2017다224395) 회피**다 — 판례 요약은 `docs/stack.md`.

**Operational 5 rules — 모든 한국 크롤링 (Naver 종목토론방 포함) 에 적용.**

1. **일 1~2회 배치 캡.** 장중 실시간 폴링 금지. 배치 잡 (Cloud Run Job + Scheduler) 만 허용. 사용자 트래픽에 비례하는 호출량은 "체계적 수집" 으로 해석될 위험이 있으므로 사용자 수와 분리된 고정 배치만 사용.

2. **24h 캐싱 + 콘텐츠 해시 변경 감지 시에만 갱신.** Supabase 에 fetch 결과를 저장하고 24시간 TTL. 재방문 시 원본 페이지의 콘텐츠 해시 (또는 last-modified, etag) 가 바뀐 경우에만 갱신 호출. 동일 콘텐츠 재크롤링은 비용 / 법적 양면에서 순손실.

3. **사용자 클릭 시 on-demand fetch 금지.** 종목 상세 페이지 진입이 백엔드 원본 fetch 를 트리거하면 안 됨. 서버측 배치가 미리 채워둔 캐시만 읽음. 사용자 수가 N 일 때 호출량이 O(N) 이 되는 패턴 전면 금지. (= "서버측 배치만, on-demand 금지" 원칙)

4. **HTTP 429 / 403 감지 시 즉시 24h backoff.** 429 (rate-limit) 또는 403 (access denied) 응답이 한 번이라도 관측되면 해당 source 전체에 대해 24시간 동안 새 호출을 차단하고 알림을 띄움. 자동 재시도 / 지수 backoff 으로 두드리지 않음 — 차단 신호는 명시 차단으로 해석.

5. **출처 표기 + 부분 캐싱 (전체 DB 덤프 보관 금지).** 캐시 / 요약 / 표시에 원본 URL + 출처명을 항상 함께 노출. DB 에는 표시·요약에 필요한 최소 필드만 저장 (전체 본문·전체 게시판 덤프 불가). 핵심 가치는 "AI 요약 + 컨텍스트" 이지 "원본 데이터의 재배포" 가 아님 — 민사 DB권 침해의 핵심 요건인 "상당한 부분 복제" 를 구조적으로 회피.

> 이 5원칙은 **스크래핑 source** (Naver 종목토론방 및 향후 추가될 스크래핑 source) 에 적용한다. 공식 쿼터가 공개된 API (Naver Search API 등) 는 아래 "공식 API 운영 기준" 을 따른다. 새 source 추가 시 먼저 둘 중 어느 쪽인지 분류하고, 해당 기준을 만족하는 운영 설계를 점검할 것.

### 공식 API 운영 기준 (Naver Search API 등)

- **공식 한도:** 앱(Client ID) 당 25,000 호출/일. 본 프로젝트 카운터는 `api_usage` service `naver_search_news` (KST 날짜 키). `display` 최대 100, `start` 최대 1000.
- **소비처:** `workers/news-sync` (주 소비). server `POST /api/stocks/:code/news/refresh` 가 같은 Client ID · 같은 카운터를 공유한다 (스로틀된 수동 새로고침).
- **예산:** news-sync `NEWS_SYNC_DAILY_BUDGET` 18,750 (공식 25,000 의 75%). server `NAVER_DAILY_BUDGET` 24,500 은 별도 가드.
- **수집 주기:** 평일 08:00~20:00 KST 3분 단일 잡 — 급등 상위 30 + 관심종목 매회, 나머지 top_movers 3조 순환 (종목당 9분). 평일 00·02·04·06·22시, 주말 2시간마다 전체 대상. 예상 ≈15.5K/일 (~62%).

**공식 API 운영 기준 — 공식 쿼터가 공개된 API (Naver Search API 등) 에 적용.**

1. **설계 예산은 공식 일일 한도의 75% 이하.**
2. **한도 안에서 서버측 주기 배치 폴링 허용 (장중 포함).**
3. **호출량은 사용자 수와 독립.** 사용자 트리거로 O(N) 호출이 생기는 패턴 금지 (예외: 기존 스로틀된 수동 새로고침).
4. **일일 한도 소진 신호 시 해당 run 즉시 중단, 재시도로 두드리지 않음.** news-sync 는 이후 run 을 단독 탐침 호출 1건으로만 재확인하고, 통과하면 자동 재개한다 (오판으로 하루 수집이 꺼지는 것 방지).
5. **출처 표기와 원문 링크를 항상 노출.**
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

- **상따 화면(`/trading/limit-chaser`)의 반응형은 뷰포트가 아니라 본문 폭 4밴드 컨테이너 쿼리다.** 밴드 표와 경계 3개(본문 685 · 830 · 992)의 실측 근거는 `webapp/src/styles/globals.css` 상단 주석(§2.2b)이 정본이다. 여기에 표를 복사하지 마라 — 표가 둘이 되면 갈라진다. 앱 셸·사이드바는 여전히 뷰포트 브레이크포인트다.
<!-- GSD:conventions-end -->

## gh-trade 인박스

- **세션·작업을 시작하면 `docs/inbox/from-gh-trade/` 의 `status: open` 노트부터 읽는다.** gh-trade 가 넘긴 계약(StockDMA.fbs · relay) 변경이다. 처리하면 노트의 `status: done` 과 `done_commit` 을 채워 경로를 지정해 커밋한다. 형식은 그 디렉터리 `README.md` 가 정본이다.
- **gh-trade 에 일을 요청할 때**(서버 동작 · StockDMA.fbs 필드 · 주문로그 · 배포): `scripts/trade-handoff.sh <slug>` 가 `<gh-trade>/docs/inbox/from-gh-radar/YYMMDD-<slug>.md` 를 만든다 → 본문 TODO 를 채운다 → ListAgents 로 찾은 gh-trade 세션에 경로를 SendMessage(보조 — 파일이 정본). 노트 커밋은 처리하는 gh-trade 세션이 한다. 형식 정본은 gh-trade `docs/inbox/from-gh-radar/README.md`, 전문은 gh-trade `docs/ops/workflow.md` ⑦.

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
