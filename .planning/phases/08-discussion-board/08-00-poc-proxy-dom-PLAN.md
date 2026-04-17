---
plan: 08-00
phase: 08
type: execute
wave: 0
depends_on: []
requirements: [DISC-01]
files_modified:
  - .planning/phases/08-discussion-board/POC-RESULTS.md
  - workers/discussion-sync/tests/helpers/naver-board-fixtures.ts
autonomous: false
threat_refs: [T-02, T-03, T-04]

must_haves:
  truths:
    - "프록시 서비스 1종(ScraperAPI 권장) 계정이 개설되고 API key 가 발급되어 있다"
    - "대표 5 종목(005930/373220/035720/247540/068270) × 48h 스크래핑 결과가 POC-RESULTS.md 에 기록되어 있다"
    - "실제 네이버 토론방 HTML 최소 2종(005930 활발 / 247540 적당) 이 EUC-KR 또는 UTF-8 byte 형태로 캡처되어 naver-board-fixtures.ts 의 const 로 embed 되어 있다"
    - "cheerio selector (table.type2 tbody tr + td.title > a + nid 추출 regex) 가 캡처된 fixture 로 실증 확인됨 — parseBoardHtml POC 스니펫이 최소 10 items 파싱 성공"
    - "본문(body) 수집 경로가 확정됨 — 옵션 2(상위 5건 상세 페이지 별도 fetch) 채택 또는 대체 근거 기록"
    - "월 프록시 비용 실측이 $100 이내이거나 예산 초과 사유 명시 및 사용자 승인 포함"
  artifacts:
    - path: ".planning/phases/08-discussion-board/POC-RESULTS.md"
      provides: "POC 결과 요약 — 프록시 선정 + DOM selector + body fetch 경로 + 차단율 + 비용 실측 + 한국 인코딩(EUC-KR vs UTF-8)"
      min_lines: 40
      contains: "프록시 서비스"
    - path: "workers/discussion-sync/tests/helpers/naver-board-fixtures.ts"
      provides: "실제 네이버 HTML 샘플 (향후 unit test 의 SoT)"
      min_lines: 20
      exports: ["NAVER_BOARD_HTML_SAMPLE_ACTIVE", "NAVER_BOARD_HTML_SAMPLE_QUIET"]
  key_links:
    - from: "POC-RESULTS.md"
      to: "GCP Secret Manager 에 저장될 PROXY_API_KEY"
      via: "Plan 08-06 setup-discussion-sync-iam.sh 가 생성"
      pattern: "gh-radar-proxy-api-key"
    - from: "naver-board-fixtures.ts"
      to: "Plan 08-02 parseBoardHtml.test.ts"
      via: "vitest fixture import"
      pattern: "NAVER_BOARD_HTML_SAMPLE"
---

<objective>
Wave 0 POC: Phase 8 의 외부 의존성 2개(프록시 서비스 + 네이버 토론방 DOM 구조) 를 실제 트래픽으로 실증하고, 결과를 후속 plan 들(01~06)이 참조할 수 있는 형태로 문서화·코드화한다.

Purpose: CONTEXT D1 이 명시한 "프록시 기반 스크래핑 초기부터 도입" 결정을 실제 서비스 선정으로 구체화, CONTEXT D5/D10 의 body preview 요구를 만족시킬 수 있는 fetch 경로 확정, RESEARCH Pitfall 3 (EUC-KR 인코딩) 의 실측 데이터 수집. 이 plan 없으면 02-worker 의 fetcher/parser 가 추측 기반이 되어 차단·파싱실패 회귀 리스크.

Output: `POC-RESULTS.md` (사람이 읽는 기록) + `naver-board-fixtures.ts` (코드가 import 하는 fixture) + GCP Secret Manager 에 등록할 PROXY_API_KEY (본 plan 에서는 값만 확보, 등록은 06-deploy 에서).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/08-discussion-board/08-CONTEXT.md
@.planning/phases/08-discussion-board/08-RESEARCH.md
@.planning/phases/08-discussion-board/08-VALIDATION.md
@CLAUDE.md
</context>

<tasks>

<task type="checkpoint:decision" gate="blocking">
  <name>Task 1 [DECISION]: 프록시 서비스 선정 (ScraperAPI vs Bright Data vs Oxylabs)</name>
  <files>.planning/phases/08-discussion-board/POC-RESULTS.md</files>
  <read_first>
    - .planning/phases/08-discussion-board/08-RESEARCH.md §"프록시 서비스 비교 매트릭스"
    - .planning/phases/08-discussion-board/08-CONTEXT.md D1 (프록시 초기 도입 명시)
    - CLAUDE.md §"Constraints" (무료 API 우선 원칙 — D1 에서 명시적 예외 승인됨)
  </read_first>
  <decision>
    Phase 8 의 프록시 서비스 1종을 선정한다. 선정된 서비스의 API key 를 확보해 이후 task 에서 실트래픽 테스트에 사용.
  </decision>
  <context>
    RESEARCH §"프록시 서비스 비교 매트릭스" 권장:
    - **default: ScraperAPI** ($49/월 Hobby 100K credits 또는 Startup $149 1M credits) — 진입비용 최저, 단일 endpoint API, 월 비용 예측 가능. body fetch 옵션 2 채택 시 ~862K credits/mo 라 Startup tier 가 안전.
    - POC 실패(차단률 >10% 또는 한국 본문 렌더링 이슈) 시 Bright Data Web Unlocker ($499/월 Growth 또는 PAYG $1.3/1K) 로 전환.
    - 자체 IP rotation 은 개인 프로젝트 규모에서 배제.
  </context>
  <options>
    <option id="option-a">
      <name>ScraperAPI Startup ($149/월, 1M credits)</name>
      <pros>단일 endpoint (`https://api.scraperapi.com/?api_key=&amp;url=`), 운영 오버헤드 최소, 약관에 명시적 스크래핑 허용, 한국 IP 50+ geo 지원, body fetch 옵션 2(862K credits/mo 예상) 수용 가능</pros>
      <cons>한국 IP 풀 품질 MEDIUM (Bright Data 대비), 한국 상세 pricing 미공개</cons>
    </option>
    <option id="option-b">
      <name>ScraperAPI Hobby ($49/월, 100K credits) — body fetch 옵션 1 전환</name>
      <pros>진입비용 최저</pros>
      <cons>144K req/mo (배치만) 도 초과. body fetch 옵션 1(목록만) 강제 → UI-SPEC D5 의 body preview 불가 → 사용자 정책 위배</cons>
    </option>
    <option id="option-c">
      <name>Bright Data Web Unlocker Growth ($499/월)</name>
      <pros>한국 IP 풀 HIGH (주소지 레벨), 97.9% 성공률, 업계 표준</pros>
      <cons>비용 3.3× (MVP 단계 과투자), 여러 endpoint / plan 선택 복잡성, 개인 프로젝트 규모 대비 오버스펙</cons>
    </option>
    <option id="option-d">
      <name>POC 연기 — 먼저 Bright Data 1주 trial 로 실측 후 계약</name>
      <pros>데이터 기반 결정</pros>
      <cons>Phase 8 전체 스케줄 1~2주 지연, Bright Data trial 은 commercial purpose 요구 등 가입 마찰</cons>
    </option>
  </options>
  <resume-signal>Select: option-a / option-b / option-c / option-d</resume-signal>
  <action>
    사용자에게 위 4 옵션을 한글로 제시하고 선택을 받는다. 기본 추천은 **option-a (ScraperAPI Startup $149/월)** — RESEARCH §"프록시 매트릭스" 의 "plan POC 시작" 권장 + body fetch 옵션 2(CONTEXT D5/D10 lock)를 수용할 수 있는 최소 tier. 비용이 부담이면 option-a 로 시작 후 Hobby 사용량이 150K 아래로 안정되면 downgrade.

    선택 후 `.planning/phases/08-discussion-board/POC-RESULTS.md` 최상단 `## 1. 프록시 서비스 선정` 섹션에 다음 기록:
    ```markdown
    ## 1. 프록시 서비스 선정

    **선택:** {option-a | option-b | option-c} — {서비스명 Tier 명}
    **결정일:** 2026-04-17
    **월 예산:** ${N}
    **결정 근거:** {사용자가 선택 시 제공한 사유 요약}
    **대안 시 전환 조건:** {본 서비스 실패 시 어떤 조건으로 Bright Data 로 전환할지 명시 — 예: "차단률 >10% 2일 연속"}
    **약관 확인:** personal/non-commercial project 사용 허용 여부 체크 URL + 복사한 조항 1~2문장
    ```
  </action>
  <verify>
    <automated>test -f .planning/phases/08-discussion-board/POC-RESULTS.md &amp;&amp; grep -q "프록시 서비스 선정" .planning/phases/08-discussion-board/POC-RESULTS.md &amp;&amp; grep -qE "ScraperAPI|Bright Data|Oxylabs" .planning/phases/08-discussion-board/POC-RESULTS.md &amp;&amp; grep -q "약관" .planning/phases/08-discussion-board/POC-RESULTS.md</automated>
  </verify>
  <acceptance_criteria>
    - POC-RESULTS.md 최상단에 `## 1. 프록시 서비스 선정` 섹션 존재
    - 선정된 서비스명 + Tier + 월 예산 (달러 금액) 기록
    - 약관 URL + 복사한 조항 최소 1문장 포함 (RESEARCH Pitfall 1 — commercial use 경계 사전 확인)
    - 대안 전환 조건 명시 (차단률/비용/품질 중 최소 1개 수치 기준)
  </acceptance_criteria>
  <done>사용자가 1개 옵션 선택, POC-RESULTS.md §1 기록 완료, 본 plan 범위에서는 API key 발급 후 로컬 `.env.local` 에 PROXY_API_KEY=... 임시 보관 (GCP Secret Manager 등록은 Plan 08-06 에서)</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2 [MANUAL]: 프록시 실트래픽 POC — 5종목 × 48h × 차단율/비용/DOM 구조 실측</name>
  <files>.planning/phases/08-discussion-board/POC-RESULTS.md, workers/discussion-sync/tests/helpers/naver-board-fixtures.ts</files>
  <read_first>
    - .planning/phases/08-discussion-board/POC-RESULTS.md §1 (Task 1 산출 — 선정된 프록시 서비스 + Tier + 약관)
    - .planning/phases/08-discussion-board/08-RESEARCH.md §"네이버 종목토론방 DOM 구조" (확정 selector 후보 — `table.type2 tbody tr` / `td.title > a` / nid regex)
    - .planning/phases/08-discussion-board/08-RESEARCH.md §"Common Pitfalls" Pitfall 2 (fallback selector) / Pitfall 3 (EUC-KR 인코딩) / Pitfall 6 (body fetch 경로)
    - .planning/phases/08-discussion-board/08-CONTEXT.md D5 (본문 2줄 preview 요구) / D10 (필드 매핑 — body plaintext)
    - CLAUDE.md §"Constraints" (robots.txt 준수, 1~2 req/sec 제한)
  </read_first>
  <what-built>
    Task 1 에서 발급받은 프록시 API key 로 실제 네이버 토론방을 5 종목 × 48h 동안 호출하고, (a) 차단율, (b) DOM 구조, (c) body 수집 경로, (d) 인코딩, (e) 비용 실측을 기록한다.

    이 task 는 외부 서비스 결제 + 실제 HTTP 트래픽 수반 + 주관적 품질 평가(내용 유용성) 때문에 사용자 참여 필수 — 자동화 불가.
  </what-built>
  <how-to-verify>
    사용자가 다음 순서로 직접 실행하고 결과를 POC-RESULTS.md 에 기록:

    **(1) 기본 목록 페이지 fetch 실증 — 5종목 × 2~3회**

    삼성전자(005930), LG에너지솔루션(373220), 카카오(035720), 에코프로(247540), 셀트리온(068270) 5종목 대상.

    ScraperAPI 선택 시 예시 curl:
    ```bash
    PROXY_KEY="발급받은_키"
    for CODE in 005930 373220 035720 247540 068270; do
      curl -s -w "\n[HTTP %{http_code}] %{time_total}s bytes=%{size_download}\n" \
        "https://api.scraperapi.com/?api_key=${PROXY_KEY}&url=https%3A%2F%2Ffinance.naver.com%2Fitem%2Fboard.naver%3Fcode%3D${CODE}&country_code=kr" \
        -o "/tmp/naver-board-${CODE}.html"
      echo "---"
    done
    ```

    **(2) 결과 검증 4가지:**
    - (2a) HTTP 200 비율 — 5/5 성공이어야 통과. 403/429 발생 시 `country_code=kr` 파라미터 추가 또는 premium proxy (credit 10×) 옵션 활용 후 재실측.
    - (2b) HTML 인코딩 — `file /tmp/naver-board-005930.html` 로 charset 확인. EUC-KR 이면 `iconv -f euc-kr -t utf-8 < 파일` 로 변환 후 한글 정상인지 확인. 대부분 프록시가 자동 UTF-8 디코딩하므로 그대로 한글 읽히면 OK.
    - (2c) DOM selector 실증 — `cheerio` 스크립트 또는 Python BeautifulSoup 으로 다음을 파싱:
      ```js
      // /tmp/dom-check.mjs
      import * as cheerio from 'cheerio';
      import { readFileSync } from 'node:fs';
      const html = readFileSync(process.argv[2], 'utf-8');
      const $ = cheerio.load(html);
      const rows = $('table.type2 tbody tr');
      const items = [];
      rows.each((_, el) => {
        const $row = $(el);
        const $link = $row.find('td.title > a');
        const href = $link.attr('href');
        const m = href?.match(/[?&]nid=(\d+)/);
        if (!m) return;
        items.push({
          nid: m[1],
          title: $link.text().trim(),
          author: $row.find('td:nth-child(3)').text().trim(),
          postedRaw: $row.find('td:nth-child(1)').text().trim(),
        });
      });
      console.log(`parsed ${items.length} items`, items.slice(0, 3));
      ```
      ```bash
      pnpm dlx tsx /tmp/dom-check.mjs /tmp/naver-board-005930.html
      ```
      기대: ≥10 items, nid 6~12 자리 숫자, title 비어있지 않음.
    - (2d) body 수집 경로 — 상위 3 게시글의 상세 페이지를 추가 fetch:
      ```bash
      NID="첫 게시글 nid"
      curl -s "https://api.scraperapi.com/?api_key=${PROXY_KEY}&url=https%3A%2F%2Ffinance.naver.com%2Fitem%2Fboard_read.naver%3Fcode%3D005930%26nid%3D${NID}" -o "/tmp/naver-post.html"
      ```
      상세 페이지 DOM 에서 본문 selector(`#body`, `td.view` 중 어느 것) 확인. 본문이 cheerio 로 파싱되면 **옵션 2 (본문 fetch) 채택**. body 가 JS 로드 등으로 접근 불가 시 **옵션 1 (목록만)** 로 CONTEXT D5 제약 재협의 필요.

    **(3) 48h 차단율 관측** — 30분 간격 × 48h (96회) 5종목 동일 호출 후 HTTP 403/429 비율 < 5% 확인. 수동 실행 불가 시 cron + curl 로 자동화하거나, 간단히 1h 간격 × 12시간 (13회) 로 축소 실측해도 허용 (사용자 판단).

    **(4) 비용 실측** — 프록시 대시보드에서 credit 소모량 확인. 예: 5종목 × 48h × (30min 목록 + 3 상세 page) = 5 × 48 × 2 × 4 = 1,920 credits. 월 환산 1,920 × 15 = 28,800 credits → $49 Hobby 수용 or Startup 업그레이드 판단.

    **(5) POC-RESULTS.md §§2~5 기록:**
    ```markdown
    ## 2. HTTP 성공률 / 인코딩
    - 5종목 × 2회 = 10 req, HTTP 200: {10}/10
    - 인코딩: {EUC-KR / UTF-8 / proxy auto-decoded}
    - iconv-lite 도입 필요 여부: {yes / no}

    ## 3. DOM selector 실증 결과
    - 확정 selector:
      - 목록 행: `table.type2 tbody tr`
      - 제목 링크: `td.title > a`
      - 작성자: `td:nth-child(3)`
      - 날짜: `td:nth-child(1)`
      - nid regex: `/[?&]nid=(\d+)/`
    - 파싱된 items per page: 평균 {N} 개
    - fallback selector (DOM 변경 대비):
      - 대안 1: {명시}
      - 대안 2: {명시}

    ## 4. body 수집 경로 확정
    - 채택 옵션: **옵션 2 (상위 5건 별도 fetch)** / 옵션 1 / 옵션 3
    - 근거: {예: 상세페이지 #body selector 로 본문 plaintext 추출 가능}
    - 월 요청량 영향: 배치 {144K/mo} + body {~720K/mo} = 총 {~860K/mo}
    - 프록시 tier 판정: {ScraperAPI Startup 1M credits 수용}

    ## 5. 차단율 관측
    - 관측 기간: 48h (또는 12h 축소)
    - 총 요청: {N}
    - HTTP 403/429: {M} ({M/N*100}%)
    - 목표 <5% 달성 여부: {pass/fail}
    - 미달 시 대응: {premium proxy 10× credit 또는 Bright Data 전환}

    ## 6. 비용 실측
    - POC 기간 credit 소모: {N}
    - 월 환산 예측: {M}
    - 선정 tier 대비 margin: {N%}
    - 판정: {green / yellow / red}
    ```

    **(6) fixture 캡처:**
    활발 종목(005930)과 조용한 종목(247540 또는 068270) 2종의 HTML 목록 페이지 그대로를 TypeScript const 로 embed.

    `workers/discussion-sync/tests/helpers/naver-board-fixtures.ts`:
    ```ts
    // Phase 08 POC — 실제 네이버 토론방 목록 페이지 HTML (2026-04-17 수집)
    // 출처: https://finance.naver.com/item/board.naver?code={CODE}
    // 이 fixture 는 workers/discussion-sync 의 parseBoardHtml.test.ts 가 import.

    export const NAVER_BOARD_HTML_SAMPLE_ACTIVE = `
    <!DOCTYPE html>
    <html><head>...(실제 캡처 HTML — 시크릿 없이 공개 페이지 그대로)...</head>
    <body>
      ...
      <table class="type2"><tbody>
        <tr><td class="gray03 p9 tah">2026.04.17 14:32</td>
            <td class="title"><a href="/item/board_read.naver?code=005930&nid=272617128">실적 기대감</a></td>
            <td>abc****</td><td>123</td><td>5</td><td>1</td></tr>
        ...
      </tbody></table>
    </body></html>
    `;

    export const NAVER_BOARD_HTML_SAMPLE_QUIET = `
    <!DOCTYPE html>
    <html>...(활성도 낮은 종목 실제 HTML)...</html>
    `;
    ```

    HTML byte 가 100KB 넘으면 `.replace(/\n\s+/g, '')` 로 압축 후 embed. (단 체인 parsing 에 영향 없도록 white-space 보존이 중요하다면 그대로 유지.) 용량 문제 있으면 `/tmp` 에 저장하고 fixture 는 fs.readFileSync 로 읽도록 분리해도 무방 (단 이 경우 helpers 파일에서 path resolve + fs 사용).

    **(7) 최종:** POC-RESULTS.md §§1~6 완성 + fixture const 2 export 확정. 사용자가 "approved" 로 resume.
  </how-to-verify>
  <resume-signal>Type "approved" with summary of POC-RESULTS.md §§1~6 + fixture 2종 크기</resume-signal>
  <action>
    사용자에게 `how-to-verify` 내 (1)~(7) 단계를 안내하고, 각 단계 산출물을 POC-RESULTS.md 와 naver-board-fixtures.ts 에 기록하도록 한다.

    단계별 실행 중 장애 발생 시:
    - HTTP 403 지속 → `country_code=kr` 파라미터 추가 재시도 → 여전히 실패 시 Task 1 옵션 변경 (Bright Data 로 전환) 재협의
    - 한글 깨짐 → `iconv-lite` 을 Plan 08-02 worker deps 에 추가 필요 (POC-RESULTS.md 에 명시)
    - DOM selector 0 match → RESEARCH §"네이버 종목토론방 DOM 구조" 의 fallback selector 2~3종 시도
    - body 접근 불가 → CONTEXT D5 (body preview) 재협의 필요 (사용자 결정)
  </action>
  <verify>
    <automated>test -f .planning/phases/08-discussion-board/POC-RESULTS.md &amp;&amp; grep -q "DOM selector 실증" .planning/phases/08-discussion-board/POC-RESULTS.md &amp;&amp; grep -q "body 수집 경로" .planning/phases/08-discussion-board/POC-RESULTS.md &amp;&amp; grep -q "차단율" .planning/phases/08-discussion-board/POC-RESULTS.md &amp;&amp; grep -q "비용 실측" .planning/phases/08-discussion-board/POC-RESULTS.md &amp;&amp; test -f workers/discussion-sync/tests/helpers/naver-board-fixtures.ts &amp;&amp; grep -q "NAVER_BOARD_HTML_SAMPLE_ACTIVE" workers/discussion-sync/tests/helpers/naver-board-fixtures.ts &amp;&amp; grep -q "NAVER_BOARD_HTML_SAMPLE_QUIET" workers/discussion-sync/tests/helpers/naver-board-fixtures.ts</automated>
  </verify>
  <acceptance_criteria>
    - POC-RESULTS.md 에 §§1~6 섹션 모두 존재 (grep으로 확인)
    - §3 DOM selector 실증 결과에 `table.type2 tbody tr` / `td.title > a` / nid regex `/[?&]nid=(\d+)/` 패턴 3종 모두 명시
    - §4 body 수집 경로 확정: "옵션 1" 또는 "옵션 2" 또는 "옵션 3" 중 하나가 채택됨을 `채택 옵션:` 라인으로 명시. **권장: 옵션 2** (CONTEXT D5 body preview 유지).
    - §5 차단율이 숫자(% 형식)로 기록되고 목표(<5%) pass/fail 판정 포함
    - §6 비용 실측이 달러 금액으로 기록되고 tier margin 계산 포함
    - workers/discussion-sync/tests/helpers/naver-board-fixtures.ts 존재 + `NAVER_BOARD_HTML_SAMPLE_ACTIVE` + `NAVER_BOARD_HTML_SAMPLE_QUIET` 2개 export
    - fixture 파일에 실제 HTML 마커 포함: `grep -qE "table.+type2|td.+title" workers/discussion-sync/tests/helpers/naver-board-fixtures.ts` → 1+ match
    - 차단율이 >10% 인 경우 본 plan 을 중단하고 Task 1 옵션 변경으로 re-route (사용자 명시 승인 필요)
  </acceptance_criteria>
  <done>POC-RESULTS.md 6섹션 완성 + fixture 2종 embed + 사용자 "approved" — Plan 08-01/02 가 이 fixture 를 import 하고 POC-RESULTS §3 selector 를 parseBoardHtml 에 1:1 반영할 수 있는 상태</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries (Plan 08-00)

| Boundary | Description |
|----------|-------------|
| POC curl → 프록시 서비스 | PROXY_API_KEY 를 파라미터로 전달 — shell history / log 남지 않도록 주의 |
| 프록시 → 네이버 | 외부 HTTP, 응답은 untrusted HTML |
| POC 파일 → 코드베이스 | fixture 에 민감 정보(쿠키/세션 등) 누출 금지 — 공개 페이지 HTML 만 저장 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03 | Information Disclosure | PROXY_API_KEY | mitigate | curl command line 실행 시 `set +o history` 또는 환경변수 export 후 `"${PROXY_KEY}"` 인용 사용. POC-RESULTS.md 에 key 값 절대 기록 금지 — 대시보드 참조 경로만 문서화. GCP Secret Manager 등록은 Plan 08-06 에서. |
| T-04 | Tampering (log injection) | POC curl 응답 HTML | mitigate | HTML 은 fixture 파일에 const string 으로만 저장. shell pipe 로 logger 에 직접 흘리지 않음. 네이버 작성자 닉네임이 HTML 에 escape 된 상태 그대로 const 에 embed. |
| T-02 | Tampering (XSS in fixture) | naver-board-fixtures.ts embed HTML | mitigate | fixture 는 vitest runner 에서만 import — 런타임 `dangerouslySetInnerHTML` 경로 없음. DOM 은 cheerio 가 파싱 (JS eval 없음). |
</threat_model>

<verification>
- `test -f .planning/phases/08-discussion-board/POC-RESULTS.md`
- `grep -qE "ScraperAPI|Bright Data" .planning/phases/08-discussion-board/POC-RESULTS.md`
- `grep -q "table.type2" .planning/phases/08-discussion-board/POC-RESULTS.md` (DOM selector 확정)
- `grep -qE "옵션 [1-3]" .planning/phases/08-discussion-board/POC-RESULTS.md` (body fetch 경로 확정)
- `test -f workers/discussion-sync/tests/helpers/naver-board-fixtures.ts`
- `grep -q "NAVER_BOARD_HTML_SAMPLE_ACTIVE" workers/discussion-sync/tests/helpers/naver-board-fixtures.ts`
- `grep -q "NAVER_BOARD_HTML_SAMPLE_QUIET" workers/discussion-sync/tests/helpers/naver-board-fixtures.ts`
</verification>

<success_criteria>
- 프록시 서비스 1종 선정 + API key 로컬 확보 + 월 예산 명시
- 대표 5 종목 HTTP 성공률 100% (또는 차단 해결 후 재측정 통과)
- DOM selector 3종 (행/제목/날짜) + nid regex 실증 완료
- body 수집 경로 확정 (권장 옵션 2)
- 월 차단율 < 5%, 월 비용 예측치 달러 기록
- 실제 HTML 2종이 fixture const 로 embed 됨 — Plan 08-02 의 parseBoardHtml.test.ts 가 이 fixture 로 ≥10 items 파싱 가능
</success_criteria>

<output>
After completion, create `.planning/phases/08-discussion-board/08-00-SUMMARY.md`:
- 선정된 프록시 서비스 + tier + 월 예산
- body fetch 경로 확정 (옵션 번호 + 근거)
- fixture 크기 (active/quiet 각 KB)
- 차단율 / 비용 실측값
- 후속 plan 에 영향: iconv-lite 도입 여부, Premium credit 필요 여부, DOM fallback selector 필요 여부
</output>
