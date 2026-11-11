# Phase 41: 한투 뉴스·공시 피드 - Research

**Researched:** 2026-11-11
**Domain:** 외부 공식 API(한국투자증권 Open API `news-title`) 서버측 상주 수집 · Supabase 저장/병합 RPC · Express 묶음 조회 계약 · 웹 네 자리 표시 · home-sync AI 입력 확장
**Confidence:** MEDIUM (코드베이스·실측 표본은 HIGH, 한투 공식 한도·약관 원문은 SPA 라 직접 열람 실패 → 2차 인용·공식 샘플 코드 기준)

## 결정 전제에 영향 (오케스트레이터가 계획 전에 사용자에게 확인할 것)

> 아래 다섯 건은 잠긴 결정(D-01 ~ D-21)을 뒤집지 않지만, 결정이 깔고 있는 전제가 실측·공식 자료와 어긋나거나 확인되지 않은 것이다. 리서처 권고는 사용자 답이 아니다(lessons 2026-09-28).

1. **[보고 필수 · 차단 가능] 한투 약관상 「여러 사용자 화면 표시」가 허용되는지 확인하지 못했다.** KIS Developers 약관·제휴 FAQ 페이지는 JS 렌더링이라 원문을 읽지 못했다. 검색 색인에 잡힌 제휴 안내 문구는 「KIS Developers 로 **고객(제3자)에게 서비스**를 제공하려면 제휴가 필요하고 제휴 대상은 제도권 금융회사(투자일임업·투자자문업)뿐 — 핀테크 불가 · 개인은 자기 매매용으로 직접 신청」 그리고 「거래소(코스콤)가 계약 미체결 법인은 API 로 받은 **시세**를 제휴사 앱 화면에 띄우는 것도 불가하다고 통보」이다 `[CITED: apiportal.koreainvestment.com/provider (검색 색인 요약 · 원문 미열람)]`. 뉴스·공시 **제목**이 「시세」에 해당하는지, gh-radar 사용자(같은 팀 트레이더)가 「제3자」인지는 원문으로 확인 못 했다. 뉴스 제목의 저작권은 각 언론사·인포스탁 등 공급사에 있다(한투가 재판매 계약으로 받는 데이터) `[ASSUMED]`. **권고: 계획은 진행하되, 사용자에게 「한투 고객센터·KIS Developers 문의로 팀 내부 화면 표시가 되는지 확인」을 먼저 묻고, 답이 「불가」면 phase 범위를 바꿔야 한다.** 가장 보수적인 대안은 「한투 키 소유자 본인 계정에서만 표시」인데 D-15 · D-21(gh-trade 여러 클라)과 충돌한다.
2. **D-13 (자료원 · 제목) 중복 제거는 날짜로 묶어야 한다.** 실측 표본에 `(주)엔투텍 공매도 과열종목 지정(공매도 거래 금지 적용)` 같은 시장조치 공시가 있다 — 같은 회사·같은 제목이 **다른 날** 다시 나온다. (자료원, 제목)만으로 영구 중복 제거하면 둘째 날의 진짜 공시가 사라진다. 권고 키 = (제공업체 코드, 정규화 제목, 작성일 KST). 같은 날 수정본만 합친다.
3. **D-12 「제목 일치」는 앞부분 일치까지 넓혀야 한다.** 한투 제목은 길이 상한이 있어 잘린다 — 실측 `[단독] 삼성 사장단, 올트먼 만남 이후... 자필 메시지로 "AI 대전환 결의" [오픈AI,` (끝이 잘림). 최대 65자 관찰. 「정규화 후 같음 또는 짧은 쪽(≥15자)이 긴 쪽의 앞부분 + 작성시각 차 ≤ 12시간」으로 맞추기를 권고 — D-12 의 취지(띄어쓰기·기호 무시) 안이라 판단하지만 경계 규칙이라 한 줄 확인을 권한다.
4. **로드맵 실측 ⑧ 「일련번호 앞 14자리 = 작성일시」는 항상 참이 아니다.** 표본 350건 중 3건(전부 서울경제)은 일련번호 앞 14자리(첫 작성)와 `data_dt`·`data_tm`(갱신 시각)이 다르다 `[VERIFIED: 2026-11-11 실측 result.json 재집계]`. 표시 시각은 `data_dt`+`data_tm` 을 쓴다(일련번호에서 시각을 뽑지 않는다).
5. **D-19(홈 AI 재료) 는 Claude 호출 횟수를 늘릴 수 있다.** home-sync 는 매분(`* 8-19 * * 1-5`) 돌고 「급등코드 + 뉴스 id 집합」 해시가 같으면 Claude 를 건너뛴다(`contentHash.ts`). 한투 글은 수 초 단위로 들어오므로 급등 종목의 top-K 가 더 자주 바뀌어 해시 불일치 → Haiku 호출 증가. Haiku 4.5 단가는 입력 $1 · 출력 $5 / MTok `[CITED: claude-api skill 모델표 2026-10-06]`. 비용 상한을 정하고(예: 하루 호출 수 로그로 배포 전후 비교) 필요하면 「한투 글은 공시만 해시에 넣는다」 같은 완화를 둔다 — D-19 를 바꾸지는 않는다.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**로드맵에서 이미 잠긴 것(재론 금지):**
- 한투 호출은 서버측 배치만 — 화면 진입·클라 조회가 한투 호출을 일으키지 않는다(CLAUDE.md 「공식 API 운영 기준」 · 호출량은 사용자 수와 독립 · 설계 예산 ≤ 공식 한도 75% · 한도 소진 신호 시 그 run 중단 · 출처 항상 표기).
- 한투는 제목만 준다(본문 · URL 없음) → 원문 링크 · 스니펫은 네이버 쪽 기사 몫.
- 공시 = 제공업체 코드 `F`(거래소 공시) · `G`(코스닥 공시).
- 한투 실전 앱키·시크릿은 사용자 보유 → 사용자 `!` 주입(비출력 스크립트 · Secret Manager).
- 로드맵 Goal 의 실측 API 성질 ① ~ ⑨(응답 종목코드 1개만 표시 · 날짜·시각 커서 페이징 · 수정본이 다른 일련번호로 반복 · 제목 검색 무시 · 푸시 없음 등)는 전제다.

**밖:** KRX F000 공시 직수신(한투가 느리면 그때) · 장중 지연 실측 · gh-trade 「따로 뜨는 뉴스·공시 창」(gh-trade 목업 돌파 D) · 전체 최신 흐름(커서) 조회 · 알림음 · gh-trade 매집감지 창/종합매매창 표시 · 뉴스 본문/AI 요약 신설 · 공시 원문(KIND/DART) 링크 생성.

#### 수집 속도 · 전달 방식 (D-01 ~ D-04)
- **D-01: 「전체 최신 글」과 「공시(F · G)」 목록은 한투에 뜬 뒤 10초 안팎에 gh-radar 에 들어온다.** 서버가 5 ~ 10초마다 한투에 묻는다. 사용자 선택(1분 · 3분 안 기각) — 돌파·상따는 공시가 초 단위로 주가에 반영되고 클라도 5 ~ 10초로 조회하므로 서버가 분 단위면 의미가 없다. 귀결: Cloud Run Job + Scheduler(최소 1분)로는 못 맞춘다 → **장중 내내 떠 있는 프로세스**가 필요하다(어디에 둘지는 재량 · 아래).
- **D-02: 빠른 수집 시간대는 평일 `07:00` ~ `20:00` KST.** 장 시작(`08:00`) 전 아침 공시도 빠르게 받는다. 그 밖(밤 · 새벽 · 주말)은 10 ~ 30분에 한 번 느리게 받아, 아침에 켜면 밤사이 글이 이미 들어와 있다. KRX 평일 휴장일은 평일 취급(news-sync `cadence.ts` 와 같음).
- **D-03: gh-trade 전달은 「클라가 5 ~ 10초마다 HTTP 로 조회」.** 「쏴주는」의 뜻을 사용자에게 확인한 결과다. 테마 조회(`GET /api/themes/by-stock`)와 같은 꼴 — 인증 없음 · Express 직접 · 실거래 서버와 `.fbs` 무변경. 열린 연결로 밀기(SSE) · relay → DMA 서버 Broadcast 는 기각. — **Reversibility:** costly — gh-trade 클라가 이 조회 계약에 맞춰 배포된다. 계약을 바꾸면 클라 재배포가 필요하다.
- **D-04: 1차 조회 계약은 「종목 묶음 조회」 하나.** 최대 100코드 → 종목별 최신 N건(기본 기간 D-08) · 글 없는 종목도 빈 배열 · **종목별 마지막 수집 시각(없으면 null)** 포함. gh-trade 의 세 쓰임(돌파 목록 배지용 건수·최신 1건 / 선택 종목 상세 목록 / 상따창 종목 1개 최신)이 이 하나로 된다. 「전체 최신 흐름(수신 순번 커서)」 조회는 1차에서 뺀다(gh-trade-42 동의 — 따로 뜨는 뉴스 창이 범위 밖). 웹 작업대도 같은 조회를 쓴다(D-17 · D-18).

#### 수집 대상 · 기간 (D-05 ~ D-08)
- **D-05: 종목별 보충 조회 대상 = 급등 상위(`top_movers`) + 관심종목(`watchlists`) + 클라가 조회한 종목.** 공시는 전체 목록만으로 종목이 정확히 붙어 오므로, 종목별 조회는 주로 뉴스 빠짐(응답 종목코드가 기사당 1개)을 메우는 용도다. 클라(gh-trade · 웹 작업대)의 종목 묶음 조회는 「이 종목도 모아 달라」는 **등록만** 하고, 한투 호출은 서버가 차례대로 한다. 등록 종목 수에 상한을 둔다(숫자는 재량). 전 종목 순환 · 「급등 상위 + 관심종목만」은 기각.
- **D-06: 새로 등록된 종목은 다음 차례에 먼저 수집한다(목표 10초 안팎).** 응답의 종목별 마지막 수집 시각으로 클라가 「아직 수집 전」과 「수집했는데 글 없음」을 가른다(gh-trade-42 요청). 한동안 조회가 없는 종목은 대상에서 자동으로 빠진다. 종목별 보충 조회가 한 바퀴 도는 주기는 한투 호출 한도를 확인한 뒤 확정한다(목표 1 ~ 3분). 첫 수집까지 걸리는 시간은 gh-trade 인박스 노트에 명시한다.
- **D-07: 종목이 안 붙은 글(전체의 약 60%)은 저장하지 않는다.** 이번 범위의 화면이 전부 종목 단위라 쓸 곳이 없고 「필요한 최소만 저장」 원칙과 맞는다. 나중에 전체 뉴스 창을 만들면 그때부터 저장한다(한투는 1년 전까지 조회되므로 소급 가능). 제목에서 종목명을 찾아 붙이는 안은 기각.
- **D-08: 종목에 붙여 보여 주는 글의 기본 기간은 최근 3일.** 전날 장 마감 뒤 공시와 주말 뉴스가 월요일 아침에도 보인다(휴장일 달력 불필요). 조회하는 쪽이 기간을 바꿔 요청할 수 있다(기본값일 뿐). ⚠ gh-trade 목업의 「어느 안이든 같은 동작」에는 「오늘 것만, 종목당 최근 3건」이라 적혀 있다 — 인박스 노트에 gh-radar 기본이 3일임을 적고, gh-trade 가 기간·건수를 파라미터로 고르게 한다.

#### 거르기 · 합치기 (D-09 ~ D-14)
- **D-09: 공시는 「파생상품 안내」만 빼고 전부 보인다.** 빼는 것: ELW · ETN · ETF 종목의 글, 그리고 주식 종목에 붙어 오더라도 제목이 ELW 권리행사·상장 안내, 주식선물·옵션 관련 안내인 글(gh-trade-42 가 F000 에서 본 비재료: ELW 권리행사·상장 안내 · ETN·ETF 안내 · 주식선물·옵션 안내 · 시장구분 「파생」). 투자주의·경고 · 단기과열 · 거래정지 같은 시장 조치와 회사 공시는 전부 표시. 「주요 공시만 허용 목록」 안은 기각. 한투 응답에서 무엇으로 가를지(자료원 · 뉴스 대구분 · 종목코드 꼴 · 제목 패턴 · `stocks.security_group`)는 리서치가 정한다 — 스팩·ETN 은 `security_group='주권'` 으로 잘못 분류된 사례가 있다(home-sync `isExcludedProduct` · 이름 패턴 병행).
- **D-10: 수집이 하루 돌아간 뒤 실제 공시 제목을 종류별로 묶은 목록을 사용자에게 한 번 보여 주고, 더 뺄 종류가 있는지 확인받는다.** UAT 항목으로 둔다. 경계가 애매한 종류는 임의로 빼지 않고 이 목록에서 묻는다.
- **D-11: 한투 뉴스는 한투가 붙인 종목 그대로 전부 표시한다.** 「제목에 종목명이 있는 뉴스만」(권고안)과 「배지·한 줄 띠에만 종목명 일치분」은 사용자가 기각했다 — 테마·업종 기사도 보이는 쪽을 택했고, 가끔 엉뚱한 기사(「AI」 기사에 아이에이)가 섞이는 것을 받아들인다. 제목 종목명 필터를 넣지 않는다.
- **D-12: 한투와 네이버에 같은 기사가 있으면 한 줄로 합친다.** 기준: 같은 종목 + 제목 일치(띄어쓰기·기호 차이 무시). 시각은 빠른 쪽, 원문 링크·스니펫은 네이버 것. 네이버가 늦게(장중 3 ~ 9분) 들어오면 그때 링크가 붙는다.
- **D-13: 같은 기사의 수정본이 다른 일련번호로 반복해 와도 한 건만 남긴다**((자료원 · 제목) 중복 제거 — 로드맵 실측 ⑤). 일련번호 멱등은 별도로 지킨다(성공 기준 1).
- **D-14: 거르기·합치기는 gh-radar 에서 한 번만 한다.** gh-trade 클라와 웹은 같은 결과를 받아 받은 대로 그린다.

#### 웹앱 표시 (D-15 ~ D-20) — 목업 `reference/mockup-news-disclosure-web.html` 채택(2026-11-11)
- **D-15: 웹앱에 넣는 자리는 네 곳.** ① 종목 뉴스 목록(종목 상세 뉴스 탭 · 작업대/상따 종목 정보 창 「뉴스·토론」 탭 — 같은 부품) ② 작업대 돌파 목록 ③ 작업대 상따 카드 ④ 홈 급등 요약. ④는 권고하지 않았으나 사용자가 넣기로 했다.
- **D-16: 종목 뉴스 목록은 목업 ① 의 A — 한 목록에 섞기.** 지금의 「관련 뉴스」 목록에 공시·한투 뉴스가 시간순으로 섞이고 줄 앞에 「공시」/「뉴스」 배지. 카드 제목은 「관련 뉴스·공시」. 걸러 보기 칩(B) · 공시 따로 위에(C)는 기각.
- **D-17: 작업대 돌파 목록은 목업 ② 그대로** — gh-trade 돌파 C 와 같은 모양. 접힌 줄의 칩과 펼친 표의 종목명 옆에 「공」「뉴」 배지, 표에서 행을 누르면 표 아래에 그 종목의 글 목록(시각 · 배지 · 제목 · 자료원). 글이 없는 종목은 배지 없음.
- **D-18: 작업대 상따 카드는 목업 ③ 그대로** — gh-trade 상따 1 과 같은 모양. 종목 줄 아래 한 줄 띠에 가장 최근 공시 1건 + 뉴스 1건, 띠를 누르면 최근 3일 글 전부가 아래로 펼쳐진다. 글이 없으면 빈 줄(「최근 3일 뉴스·공시 없음」).
- **D-19: 홈은 「AI 요약의 재료로도 쓰기」.** 홈 급등 이유를 정리하는 AI(home-sync)가 공시·한투 뉴스도 읽어, 요약 문장과 근거 목록 양쪽에 공시가 반영된다(목업 ④). 「카드에 공시 줄만 추가」 · 「이번엔 빼기」는 기각. 모델은 `claude-haiku-4-5` 그대로(사용자가 모델을 물었고 변경 요청은 없었다). 피드 본체(수집 · 조회 · ① ~ ③)와 독립된 마지막 묶음으로 계획한다 — 본체가 먼저 배포될 수 있어야 한다.
- **D-20: 원문 링크가 없는 글(공시 · 네이버에 아직 없는 한투 뉴스)은 제목을 링크가 아닌 글자로 보이고 자료원 이름을 항상 붙인다.** 「↗」는 링크가 있는 줄에만. 자료원(거래소 공시 · 코스닥 공시 · 언론사명) 표기는 어느 화면에서도 빠지지 않는다(운영 기준 5).

#### gh-trade 쪽 화면 (D-21)
- **D-21: 돌파감지 = 「행에 배지 + 창 아래 상세 패널」(gh-trade 목업 돌파 C) · 상따창 = 「종목 줄 아래 한 줄 띠」(상따 1) · 알림음 없음 · 매집감지 창/종합매매창에는 넣지 않음 · ELW/ETN 같은 비재료 공시 제외.** 사용자 원문: 「1. 돌파 C, 상따 1  2. 소리 필요없음, 매집감지창/종합매매창에는 필요없음.  3. ELW/ETN 같은 비재료 공시는 필요없음.」 구현은 gh-trade 몫이고 gh-radar 는 계약(D-04)만 제공한다.

### Claude's Discretion
- **도는 곳:** D-01 의 상주 프로세스를 어디에 둘지(relay VM 옆 컨테이너 · Cloud Run 서비스 상시 1개 · 기타). 고려: 운영 이미지 조상 확인 · relay 배포 규율 · 고정 IP 필요 여부(키움 09.1 선례) · 비용. news-sync(Job)에 얹는 것은 D-01 과 양립하지 않는다.
- **저장 모양:** `news_articles` 확장 vs 새 테이블 + 합치는 뷰/RPC(`url NOT NULL` · `UNIQUE(stock_code, url)` 과 충돌). 조회는 Cloud Run 왕복 비용 때문에 RPC 1회로 묶는다. 보관 기간은 `news_articles` 90일과 맞춘다.
- **예산 숫자:** 한투 공식 호출 한도 · 토큰 수명(1일 · 발급 시 알림톡) 확인 뒤 75% 이하로. `api_usage` 에 서비스 키 추가 · 한도 소진/토큰 만료/장애는 그 run 만 중단하고 로그(무로그 fail-safe 금지).
- **등록 상한 · 만료 시간 · 종목별 한 바퀴 주기**(D-05 · D-06 의 숫자).
- **조회 계약의 이름·필드 표기**(경로 · 파라미터 · 필드명). gh-trade-42 요청 필드: id · 종류(뉴스/공시) · 작성일시(시간대 명시) · 제목 · 자료원 · 종목코드 배열 · url(없으면 null) · gh-radar 수신 시각 · 종목별 마지막 수집 시각. `/api` IP 당 분 200회 제한과 사무실 IP 공유를 감안한 캐시(테마는 60초 — 여기서는 D-01 에 맞게 짧게).
- **웹 갱신:** 작업대 배지·띠는 종목 묶음 조회를 주기적으로(10초 안팎 권장), 종목 뉴스 목록은 진입 시 + 기존 수동 새로고침. 기존 네이버 수동 새로고침 버튼은 한투 호출을 일으키지 않는다.
- **새 글 강조:** gh-trade 목업 「새 항목이 오면 30초 노란 강조(돌파 새 행과 같은 규칙)」와 같게 — 웹 작업대는 기존 돌파 강조 타이머(목록 전체 1개) 규칙을 따른다.
- **홈(D-19) 입력 방식:** 근거 뉴스 타입(`HomeNewsRef.url` 필수)에 링크 없는 공시를 어떻게 실을지, 프롬프트에 공시를 어떻게 구분해 줄지. 환각 방지 규칙(제목·자료원 verbatim)은 유지.

### Deferred Ideas (OUT OF SCOPE)
- **gh-trade 「전체 최신 흐름」 조회**(수신 순번 커서 · 새 글 강조) + **따로 뜨는 「뉴스·공시」 창**(gh-trade 목업 돌파 D) — 2차.
- **KRX F000 공시 직수신** — 한투가 느리다고 느껴질 때.
- **열린 연결(SSE)로 새 글 밀기** — 클라 주기만큼의 지연을 없애고 싶을 때.
- **종목 안 붙은 글 저장 · 전체 뉴스/시황 화면** — 만들 때부터 저장(한투 1년 소급 가능).
- **제목에서 종목명을 찾아 종목 붙이기 · 제목 종목명 필터** — D-11 로 이번엔 하지 않음. 잡음이 문제 되면 재검토.
- **공시 원문 열기**(KIND/DART 주소 만들기) — gh-trade 목업 「더블클릭 = 원문」의 공시 쪽. 주소를 만들 수 있는지부터 확인 필요.
- **gh-trade 매집감지 창 · 종합매매창 표시 · 알림음** — 사용자가 필요 없다고 답함.
- **홈 급등 AI 모델 변경** — 사용자가 모델을 물었을 뿐 변경 요청은 없음.
</user_constraints>

<phase_requirements>
## Phase Requirements

요구사항 ID 매핑 없음(`phase_req_ids` null). 아래는 CONTEXT 「성공 기준 확정」 ① ~ ⑦ 을 SC 번호로 쓴 것이다.

| ID | Description | Research Support |
|----|-------------|------------------|
| SC-1 | 평일 `07:00` ~ `20:00` 새 글이 10초 안팎 주기로 DB 에 들어오고 같은 글이 두 번 저장되지 않는다 | §도는 곳(장기 실행 Job + 임대) · §수집 루프 · §저장 모양(일련번호 PK + 수정본 키) |
| SC-2 | 종목 조회 시 한투 뉴스·공시와 네이버 뉴스가 시간순 한 목록 · 줄마다 자료원·종류 · 같은 기사 한 줄 + 네이버 링크 | §합치기 규칙(공유 TS 함수) · §조회 RPC |
| SC-3 | gh-trade 가 종목 묶음 조회로 받는다(수집 대상 밖 종목도 비지 않고 「수집 전」 구분) | §조회 계약 `GET /api/news/by-stock` · `collectedAt` |
| SC-4 | 호출량이 사용자 수와 무관 · 일일 호출 수가 카운터에 남고 예산 안 | §예산 숫자 · `api_usage` `kis_news_title` · 등록만 하는 조회 |
| SC-5 | 한투 장애·한도 소진·토큰 만료는 그 run 만 중단 · 네이버 수집과 기존 화면은 그대로 | §오류 분류표 · 새 테이블(`news_articles` 무변경) |
| SC-6 | 웹 네 자리가 목업대로 보인다 | §웹 표시 · 공유 타입 |
| SC-7 | 수집 하루 뒤 공시 종류 목록 확인(D-10) | §D-10 집계 스크립트 · `hidden_reason` 보존 저장 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **공식 API 운영 기준 5개**(한투에 적용): ① 설계 예산 ≤ 공식 한도 75% ② 한도 안 서버측 주기 폴링 허용(장중 포함) ③ 호출량은 사용자 수와 독립 — 사용자 트리거 O(N) 금지 ④ 한도 소진 신호 시 그 run 즉시 중단, 재시도로 두드리지 않음 ⑤ 출처 표기와 원문 링크 항상 노출.
- 새 source 추가 시 「스크래핑 vs 공식 API」 분류 먼저 — 한투 = 공식 API.
- 배포: 프론트 Vercel(`git push` = webapp 프로덕션 배포), 백엔드 Cloud Run. **backend 먼저 · push 나중**(memory feedback_deploy_relay_before_push). 배포 경로는 diff 디렉터리별로(server/ 는 `deploy-server.sh`, 워커는 각 deploy 스크립트, migrations 는 `supabase db push --linked --yes`).
- 상따 화면 반응형은 본문 폭 4밴드 컨테이너 쿼리 — 정본은 `webapp/src/styles/globals.css` 상단 §2.2b. 띠 배치 시 준수.
- gh-trade 인계는 `scripts/trade-handoff.sh <slug>` → 본문 TODO 채움 → 노트 커밋은 gh-trade 세션이.
- GSD 워크플로 안에서만 편집. 커밋 메시지 한글 · Co-Authored-By 금지(사용자 전역 규칙).
- 보안 검사(secure-phase) 생략 — `security_enforcement: false`. nyquist 는 유지.
- 서브에이전트 배포는 분류기 차단 → 배포 단계는 메인 세션. 비밀 주입은 사용자 `!` 비출력 스크립트.
- 테스트는 `vitest run <파일> --maxWorkers=2`(watch 금지 · 동시 세션 메모리 고갈 방지).

## Summary

한투 `news-title`(tr_id `FHKST01011800`)은 공식 샘플 기준 GET + 헤더 `authorization: Bearer` · `appkey` · `appsecret` · `tr_id` · `custtype: P` · `tr_cont` 이고, 응답은 `output` 배열(페이지당 40건)에 `cntt_usiq_srno`(19자리) · `news_ofer_entp_code` · `data_dt` · `data_tm` · `hts_pbnt_titl_cntt` · `news_lrdv_code` · `dorg` · `iscd1..10` · `kor_isnm1..10` 이 온다(2026-11-11 실측 표본 재집계로 확인). 공식 유량은 실전 REST **초당 20건** · 토큰 발급 초당 1건(공지 「API 호출 유량 안내 (REST, 웹소켓) (2025.08.07 기준)」의 2차 인용)이고, 공식 저장소 README 는 토큰 재발급을 「1분당 1회」라 적는다. 토큰은 24시간(실측 `expires_in: 86400`), 6시간 안 재발급은 같은 토큰, **발급할 때마다 알림톡** — 그래서 토큰은 반드시 DB 에 저장해 실행 사이에 재사용해야 한다. 공개된 **일일 호출 한도는 찾지 못했다**(관측 없음 — 「없다」가 아니라 「모른다」).

수집기는 **장기 실행 Cloud Run Job**(한 실행이 `07:00` ~ `20:00` 루프, Scheduler 가 5 ~ 15분마다 깨우고 DB 임대로 중복 실행을 막음)을 권고한다. relay VM(radar-gw)은 실계좌 주문 경로가 사는 공유 호스트라 배포 시각 규율(21:00 이후)·메모리 예산·비밀 확산 위험이 있고, 상시 Cloud Run 서비스는 HTTP 가 필요 없는데 24시간 과금이다. Job 은 기존 워커 선례(배포 스크립트·Scheduler·`api_usage`)를 그대로 쓰고, task timeout 상한이 168시간이라 13시간 실행이 된다. 고정 IP 는 필요 없어 보인다(사용자 터미널에서 IP 등록 없이 48회 성공 · 공식 설정 파일에 IP 항목 없음) — 첫 웨이브에서 Cloud Run 발신으로 1회 확인한다.

저장은 **새 테이블 2개(글 · 글-종목 연결)** + 수집 상태 표 + 토큰 표로 하고 `news_articles` 는 건드리지 않는다(챗봇 news-specialist · news-sync · home-sync 가 그대로 읽음). 조회는 RPC 1회가 종목별 한투 행과 네이버 행을 jsonb 로 돌려주고, **합치기·정렬은 `packages/shared` 의 순수 함수 하나**가 server 와 home-sync 양쪽에서 한다(D-14 「한 번만」 · 단일 정의 · vitest 로 고정). 묶음 조회는 `GET /api/news/by-stock` — 테마 by-stock 꼴을 따르되 영문 포함 6자 코드(`SHORT_CODE_RE`) · 5초 캐시 · **전역 `/api` 분당 200회 제한에서 떼어 낸 전용 제한기**를 권고한다.

**Primary recommendation:** 새 워커 `workers/kis-news-sync`(장기 실행 Job + DB 임대 + DB 토큰) → 새 테이블 `kis_news` · `kis_news_stocks` · `kis_news_targets` · `kis_access_tokens` → RPC `stock_feed_by_codes` 1회 → shared `mergeStockFeed()` → server `GET /api/news/by-stock` + 기존 `/api/stocks/:code/news` 병합 → webapp 네 자리 → (마지막 독립 묶음) home-sync.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 한투 호출(전체 흐름 · F/G · 종목별) | 워커(Cloud Run Job, 장기 실행) | — | 운영 기준 ③: 사용자 요청 경로에서 한투 호출 금지. server 는 한투 클라이언트를 갖지 않는다 |
| 토큰 발급·재사용 | 워커 + DB(`kis_access_tokens`) | — | 발급마다 알림톡 · 1분 1회 제한 → 실행 사이 공유 필요 |
| 수정본 합치기 · 일련번호 멱등 · 파생 안내 표시 여부 | DB(ingest RPC) | 워커(분류 계산) | 원자적 판정은 DB 유일 키, 규칙 계산은 TS(테스트 쉬움) |
| 한투 ↔ 네이버 같은 기사 합치기 · 정렬 | shared 순수 함수 | server · home-sync 가 호출 | D-14 한 번만 · 소비자 둘이 같은 규칙 |
| 종목 묶음 조회 · 대상 등록 | API(Express) + DB(RPC 1회) | — | VPC egress 왕복 비용 → RPC 1회에 읽기+등록 |
| 네 자리 표시 · 새 글 강조 | Browser(webapp) | — | 받은 대로 그린다(D-14) |
| 홈 AI 재료 | 워커(home-sync) | DB RPC 재사용 | D-19 독립 묶음 |

## Standard Stack

새 외부 패키지 없음. 전부 저장소에 이미 있는 것만 쓴다.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `axios` | ^1.7.0 (news-sync 와 같은 범위) | 한투 REST 호출 | news-sync · server 선례 `[VERIFIED: workers/news-sync/package.json]` |
| `@supabase/supabase-js` | ^2.49.0 | service_role RPC | 워커 공통 |
| `pino` | ^9.0.0 | 구조화 로그(Cloud Logging) | 워커 공통 · redact 패턴 |
| `zod` | (server 기존) | 쿼리 검증 | themes/news 스키마 선례 |
| `vitest` | 워커 ^3 · server ^4.1.4 · shared ^4.1.4 · webapp ^2.1.9 | 테스트 | 기존 |
| pgTAP | 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104` | RPC·유일키 테스트 | 러너 `scripts/verify-dma-orders-price-check.sh --test <file>` (39-VALIDATION 선례) |

`p-limit` 은 필요 없다 — 수집기는 동시성이 아니라 **초당 호출 수 상한(토큰 버킷)** 하나로 돈다.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 장기 실행 Cloud Run Job | radar-gw 컨테이너 | 추가 비용 0 · 고정 IP. 그러나 실계좌 주문 경로 공유 호스트(e2-small 2GB) · 배포 21:00 이후만 · 비밀 확산 · 수집기 버그가 relay 에 번질 수 있음 → 비권고 |
| 장기 실행 Job | Cloud Run 서비스 min=1 + `--no-cpu-throttling` | HTTP 불필요 · 24시간 과금(평일 13시간 Job 대비 약 2.5배 이상) · max-instances 관리 → 비권고 |
| 장기 실행 Job | Cloud Run worker pools | 상시형에 맞지만 GA 여부·가격 확인 못 함 `[ASSUMED]` · 시간대별 켜고 끄기를 따로 해야 함 → 지금은 비권고 |
| 새 테이블 | `news_articles` 확장 | `url NOT NULL` · `UNIQUE(stock_code, url)` 를 풀어야 하고, 네이버 upsert(`onConflict: "stock_code,url"`)·retention·챗봇 news-specialist 가 같이 흔들린다 → 비권고 |

**Installation:** 없음(새 워크스페이스 `workers/kis-news-sync` 는 news-sync 의 `package.json` 의존성 부분집합).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (없음) | — | — | — | — | — | 새 외부 패키지를 설치하지 않는다 |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## 한투 API 사실관계 (리서치 항목 1 · 4 · 11)

### 호출 형태 `[VERIFIED: 공식 저장소 koreainvestment/open-trading-api@3a9be59 examples_user/domestic_stock/domestic_stock_functions.py news_title() · kis_auth.py _url_fetch()]`
- `GET https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/news-title` (실전 도메인 · 포트 9443 `[VERIFIED: kis_devlp.yaml prod 항목]`)
- 헤더: `authorization: Bearer <token>` · `appkey` · `appsecret` · `tr_id: FHKST01011800` · `custtype: P` · `tr_cont`
- 쿼리 8개: `FID_NEWS_OFER_ENTP_CODE` · `FID_COND_MRKT_CLS_CODE` · `FID_INPUT_ISCD` · `FID_TITL_CNTT` · `FID_INPUT_DATE_1` · `FID_INPUT_HOUR_1` · `FID_RANK_SORT_CLS_CODE` · `FID_INPUT_SRNO` — 전부 빈 문자열이면 「전체 최신」.
- 공식 샘플은 응답 헤더 `tr_cont == "M"` 이면 다음 페이지를 부르지만, 실측에서 `tr_cont` 는 빈 값이었고 다음 페이지는 **커서**로 넘긴다: `FID_INPUT_DATE_1=00YYYYMMDD` · `FID_INPUT_HOUR_1=0000HHMMSS` · (선택) `FID_INPUT_SRNO=<마지막 일련번호>` — 실측 `cont_by_cursor` 파라미터 `{'FID_INPUT_DATE_1': '0020261111', 'FID_INPUT_HOUR_1': '0000203954', 'FID_INPUT_SRNO': '2026111120395492795'}` `[VERIFIED: 2026-11-11 실측 result.json]`. 경계 글 1건 겹침(메모리 기록) → 일련번호로 걸러낸다.
- 성공 판정: 본문 `rt_cd == "0"` (실측 `msg_cd: MCA00000` · `msg1: 정상처리 되었습니다.`). 실패는 `rt_cd != "0"` + `msg_cd` · `msg1` `[VERIFIED: kis_auth.py APIResp.isOK]`.

### 응답 필드 (실측 표본 350건 재집계 · 2026-11-11 21:03)
`cntt_usiq_srno`(전부 19자리) · `news_ofer_entp_code` · `data_dt` · `data_tm` · `hts_pbnt_titl_cntt` · `news_lrdv_code` · `dorg` · `iscd1` ~ `iscd10` · `kor_isnm1` ~ `kor_isnm10` `[VERIFIED: result.json 필드 목록]`. 공식 샘플의 `COLUMN_MAPPING` 은 `iscd5` 까지만 적었지만 실제 응답은 10칸이다.
- 종목코드가 붙은 글 140/350(40%) · **2개 이상 붙은 글 0건** · 코드 모양은 전부 숫자 6자리(표본 한정 — 영문 포함 신규 코드 가능성은 열어 둔다).
- `kor_isnm1` 빈 값이 `" "`(공백 1자)로 온다 → trim 필수.
- 공시 표본: `('G','코스닥 공시')` 11건 · `('F','거래소 공시')` 2건. 공시의 `news_lrdv_code` 관찰값: F `01` · `02`, G `01` · `03` · `04`. `03` 은 전부 「공매도 과열종목 지정」(시장조치)이었다. 의미표는 없음 `[ASSUMED: 01=수시공시 계열 · 02=공정공시 · 03=시장조치 · 04=기타/IR 로 보이나 미확인]`.
- 뉴스 쪽 `news_lrdv_code` 는 제공업체마다 체계가 다르다(`H1` · `S5` · `F0` · `S02` 등) — 섹션 코드로 쓸 수 없다.
- **종목별 조회(`FID_INPUT_ISCD=005930`) 응답 40건 중 `iscd1=005930` 은 21건뿐**, 나머지는 `006400` · `000660` 등 다른 코드가 찍혔다. 조회 조건은 「그 종목이 태그된 글」인데 화면 칸에는 다른 태그 하나가 보이는 것으로 해석 → **종목별 조회로 받은 행은 조회한 코드에 반드시 연결**하고, `iscd1..10` 의 코드도 추가로 연결한다(D-11 「한투가 붙인 종목 그대로」와 일치).
- 같은 (자료원, 제목) 반복: 파이낸셜 1건이 4개 일련번호(18:37:06 · 18:37:13 · 19:42:20 · 20:06:39)로 왔다.

### 유량 · 토큰 (리서치 항목 1)
| 항목 | 값 | 근거 |
|------|----|------|
| 실전 REST | 초당 20건 | 공지 「API 호출 유량 안내 (REST, 웹소켓) (2025.08.07 기준)」 post `d0d1a83f-…` 의 2차 인용 `[CITED: velobot-wiki KIS playbook — 공지 원문 미열람]`. 공식 샘플의 실전 대기 `_smartSleep = 0.05`(= 20/s) 와 일치 `[VERIFIED: kis_auth.py changeTREnv]` |
| 모의 REST | 초당 2건 | 같은 공지 2차 인용 · 샘플 `_smartSleep = 0.5` |
| 토큰 발급(`/oauth2/tokenP`) | 초당 1건(공지) · 「1분당 1회 발급」(공식 README §토큰 오류 시) | `[CITED]` · `[VERIFIED: README.md 「토큰 재발급 - 1분당 1회 발급됩니다.」]` |
| 토큰 수명 | 24시간 | 실측 `expires_in: 86400` `[VERIFIED: result.json steps.token]` · 샘플 주석 「유효기간 1일」 |
| 재발급 규칙 | 6시간 안 재발급은 기존 토큰 그대로 · **발급 시 알림톡 무조건 발송** | `[VERIFIED: kis_auth.py 주석 「Token 발급, 유효기간 1일, 6시간 이내 발급시 기존 token값 유지, 발급시 알림톡 무조건 발송」]` |
| 만료 시각 필드 | 응답 `access_token_token_expired` = `"YYYY-MM-DD HH:MM:SS"` (KST) | `[VERIFIED: kis_auth.py save_token strptime]` |
| 일일 호출 한도 | **관측 없음** — 공지 2차 인용·공식 README 어디에도 없음. 「없다」고 단정하지 않는다 | `[ASSUMED]` |
| 장기 미사용 | 3개월 이상 미사용 시 자동 해지 가능 · 신청당 1년 | `[CITED: 2차 인용]` |
| 반복 접속/해지 루프 | IP·앱키 일시 차단 가능(웹소켓 공지 2026-02-24) | `[CITED: 2차 인용]` — REST 에도 「과도한 요청 차단 가능」 문구 |

**오류 코드**(2차 자료 · HTTP 상태값은 미확인 `[ASSUMED]` — 상태값이 아니라 `msg_cd` 로 분류한다):
| `msg_cd` | 뜻 | 수집기 처리 |
|----------|----|-------------|
| `EGW00201` | 초당 거래건수 초과 | 그 틱 중단 · 1초 쉼 · 1분 안 5회 이상이면 빠른 루프 60초 정지 + error 로그. 상한기(아래) 설정 오류 신호이므로 경고 |
| `EGW00121` | 유효하지 않은 토큰 | 토큰 1회 재발급(1분 1회 지킴) → 그래도 실패면 **실행 종료(종료코드 1)** + error 로그 |
| `EGW00123` | 기간이 만료된 토큰 | 위와 같음 |
| `EGW00133` | 토큰 발급 요청 과다(1분 1회) | 재발급 시도 중단 · 61초 뒤 1회만 · 두 번째 실패면 실행 종료 |
| 기타 `rt_cd != 0` · HTTP 5xx · 네트워크 | 장애 | 그 틱만 건너뜀 · 지수 대기(최대 60초) · 원문 `msg_cd`·`msg1`·HTTP 상태 warn 로그 |
| 일일 한도 소진 류(존재 미확인) | — | 모르는 `msg_cd` 가 연속 N회면 「한도 소진 의심」 strike 를 `api_usage` 에 기록하고 그 실행 종료 → 다음 실행은 단독 탐침 1건(news-sync il4 선례) |

### 고정 IP (리서치 항목 4)
필요 없다고 판단 `[ASSUMED · 근거 2개]`: ① 2026-11-11 실측 48회가 사용자 터미널(등록 절차 없음)에서 성공 ② 공식 설정 템플릿 `kis_devlp.yaml` 에 IP 항목이 없음(앱키·시크릿·HTS ID·계좌만) `[VERIFIED: kis_devlp.yaml]`. 키움(09.1)은 IP 등록이 필요해 VPC + Cloud NAT 고정 IP(`gh-radar-static-ip`)를 썼다. **권고:** Job 은 `--network` 없이(home-sync 와 같음 — Supabase 직통이라 왕복도 빠름) 배포하고, Wave 0 스모크에서 Cloud Run 발신 첫 호출을 확인한다. 거부되면 `--network gh-radar-vpc --subnet … --vpc-egress=all-traffic` 한 줄로 NAT 고정 IP 경유로 바꾼다(intraday-sync 선례).

### README 의 `KIS_*` · `kis_tokens` (리서치 항목 11)
**죽은 잔재다.** `kis_tokens` 는 `supabase/migrations/20260514120000_drop_kis_tokens.sql` 이 `DROP TABLE IF EXISTS public.kis_tokens CASCADE;` 로 지웠고 주석이 「D-01: KIS 사용처 0 — workers/ingestion 폐기 + server/src/kis/ 폐기 + packages/shared/src/kis.ts 폐기 후 kis_tokens 테이블 정리」라 적는다 `[VERIFIED: 20260514120000_drop_kis_tokens.sql:2-6,16]`. `workers/` 에 `ingestion` 이 없고 server 에 `src/kis/` 가 없다 `[VERIFIED: ls]`. README 63 ~ 66줄 `KIS_APP_KEY` · `KIS_APP_SECRET` · `KIS_ACCOUNT_NUMBER` · `KIS_BASE_URL` 과 29줄 `workers/ingestion` 은 옛 문서다. **새 토큰 표는 `kis_tokens` 이름을 재사용하지 말고**(마이그레이션 이력 혼동) `kis_access_tokens` 로 만든다. README 정리는 이 phase 의 문서 태스크로 함께 하면 좋다(선택).

### 약관 (리서치 항목 2) — 위 「결정 전제에 영향」 1번. 차단 가능 항목으로 사용자 보고.

## Architecture Patterns

### System Architecture Diagram

```
Cloud Scheduler (*/5 07-19 평일 · */15 그 밖)
        │ jobs:run
        ▼
┌─ kis-news-sync Job 실행 ──────────────────────────────────────────┐
│ ① kis_news_lease(holder, ttl) ── 실패 → 즉시 종료(다른 실행이 돎)   │
│ ② 토큰: kis_access_tokens 읽기 → 만료 1시간 전이면 tokenP 1회      │
│ ③ 모드 판정(KST): 빠른 창 07:00~20:00 평일 → 루프 / 그 밖 → 1회 통과 │
│                                                                     │
│   매 틱(1초)                                                        │
│   ├ 5초마다: 전체 최신 1쪽 ──겹침 없으면 커서로 다음 쪽(상한 5)──┐  │
│   ├ 60초마다: F · G 각 1쪽(안전망)                              │  │
│   ├ 10초마다: kis_news_targets_list() ── 대상(급등100 ∪ 관심 ∪ 등록) │
│   └ 토큰 버킷 2.5/s: 종목별 조회(수집 전 → 오래된 순)            │  │
│            │                                                     │  │
│            ▼   한투 GET news-title (전역 상한 5/s)               │  │
│   분류(TS): 종류 · 정규화 제목 키 · 연결 코드 · 숨김 사유 ◄──────┘  │
│            ▼                                                        │
│   kis_news_ingest(rows, via, queried_code) ─ RPC 1회/쪽             │
│   incr_api_usage('kis_news_title', KST 날짜, n)                     │
│   임대 갱신(30초) · 20:00 지나면 종료                               │
└─────────────────────────────────────────────────────────────────────┘
        │ (Supabase)
        ▼
 kis_news ── kis_news_stocks ── kis_news_targets ── news_articles(네이버, 무변경)
        ▲                                   ▲
        │ stock_feed_by_codes(codes, since, per_source, register) — RPC 1회
        │                                   │ (register=true 면 최근 60초 밖인 코드만 last_requested_at 갱신)
┌───────┴───────────────┐        ┌──────────┴──────────────┐
│ server                │        │ home-sync (D-19 · 마지막)│
│ GET /api/news/by-stock│        │ loadSurges → 같은 RPC    │
│ GET /api/stocks/:c/news│       │ → mergeStockFeed         │
│ → mergeStockFeed(shared)│      │ → 프롬프트 [공시] 라벨   │
│ → 5초 캐시 · 전용 제한기│      └──────────────────────────┘
└───────┬───────────────┘
        ▼
 gh-trade 클라(10초 · 100코드 청크)   webapp ① 종목 뉴스 목록 ② 돌파 배지·상세 ③ 상따 띠 ④ 홈
```

### Recommended Project Structure
```
workers/kis-news-sync/
├── src/index.ts            # 진입점: 임대 → 토큰 → 모드 → 루프/1회
├── src/config.ts           # env (KIS_APPKEY · KIS_APPSECRET · KIS_NEWS_MAX_RPS · KIS_NEWS_DAILY_BUDGET …)
├── src/kis/client.ts       # axios 인스턴스 · 헤더 · rt_cd/msg_cd 판정 · 오류 클래스
├── src/kis/token.ts        # kis_access_tokens 재사용/발급(1분 1회 가드)
├── src/kis/newsTitle.ts    # 1쪽 호출 · 커서 페이징(겹침 종료 · 쪽 상한)
├── src/pipeline/cadence.ts # 빠른 창 판정(news-sync cadence 의 +9h getUTC* 방식)
├── src/pipeline/classify.ts# 종류 · 숨김 사유 · 연결 코드(순수)
├── src/pipeline/scheduler.ts # 토큰 버킷 · 종목 우선순위 큐(순수 · 시계 주입)
├── src/pipeline/ingest.ts  # RPC 호출
├── src/apiUsage.ts         # news-sync 사본(서비스 키만 다름)
└── tests/ (fixtures/kis-news-title-sample.json — 실측 표본 사본)
packages/shared/src/stock-feed.ts   # 타입 + newsTitleKey() + mergeStockFeed()
supabase/migrations/2026111x_kis_news_tables.sql · _kis_news_rpcs.sql
supabase/tests/kis_news.test.sql
server/src/routes/news-by-stock.ts · schemas/news-by-stock.ts
scripts/deploy-kis-news-sync.sh · setup-kis-news-sync-iam.sh · smoke-kis-news-sync.sh
scripts/kis-disclosure-kinds.sql (D-10 집계)
```

### Pattern 1: 장기 실행 Job + DB 임대 (도는 곳 · 리서치 항목 5)
**What:** Scheduler 가 빠른 창에서 5분마다 Job 을 깨운다. 실행은 먼저 임대 RPC 를 부르고, 살아 있는 임대가 있으면 즉시 0 으로 끝난다(비용 수 초). 임대를 잡은 실행은 20:00 까지 루프를 돌며 30초마다 임대를 연장한다(TTL 90초). 실행이 죽으면 늦어도 다음 깨움(≤ 5분 + TTL)에서 다른 실행이 이어받는다.
**Why:** D-01 의 「장중 내내 떠 있는 프로세스」를 기존 Job 체계로 만든다. Cloud Run Job task timeout 상한은 168시간 `[CITED: docs.cloud.google.com/run/docs/configuring/task-timeout]` 이라 13시간 실행이 된다. 한 Scheduler 발화마다 새 실행이 생기므로 **임대 없이는 중복 수집 · 토큰 중복 발급(알림톡 폭탄)** 이 난다.
**설정 권고:** `--task-timeout=14h`(빠른 창 13시간 + 여유) · `--max-retries=0`(재시작은 Scheduler 깨움이 맡는다 — retry 는 같은 실행 안에서 즉시 재기동이라 크래시 루프가 된다) · `--parallelism=1` · `--cpu=1 --memory=512Mi`. 비용 추정: 1 vCPU × 46,800초 × 평일 약 22일 ≈ 103만 vCPU·초 → 월 약 $20 안팎 `[ASSUMED: Cloud Run Jobs 단가 tier 1 $0.000018/vCPU·s 기억값]`.
**대안 비교 요약:** radar-gw(비용 0 · 주문 경로 공유 위험 · 배포 21:00 이후만 — `deploy-tickgw.sh` 의 `daytime_blocked` 선례) / 상시 서비스(24시간 과금) / worker pools(미확인). Job 이 위험·비용·선례 균형이 가장 좋다.

### Pattern 2: 수집 루프 숫자 (리서치 항목 7)
| 흐름 | 주기 | 하루 호출(평일 빠른 창 46,800초) |
|------|------|------|
| 전체 최신 1쪽 | 5초 | 9,360 (+ 넘침 쪽 5% 가정 ≈ 9,800) |
| F · G 안전망 | 각 60초 | 1,560 |
| 종목별 | 토큰 버킷 2.5/s(대상 T 개를 계속 순환) | 117,000 |
| 느린 창(평일 11시간 · 15분마다 피드 되감기 + 대상 1바퀴, T≈300) | — | ≈ 13,000 |
| **평일 합계** | | **≈ 14만** |
- **한 바퀴 주기 = T / 2.5초.** T=150 → 60초, T=300 → 120초, T=450 → 180초. D-06 목표 1 ~ 3분 → **T 상한 450**(급등 100 + 관심종목 + 등록 상한 200 + 여유). 450 을 넘으면 warn 로그.
- **새 등록 종목:** 우선순위 큐 맨 앞 → 다음 버킷 토큰(≤ 0.4초) + 대상 재적재 주기(10초) → **첫 수집까지 최대 약 10 ~ 15초**. 이 숫자를 gh-trade 노트에 적는다.
- **설계 상한:** 전역 토큰 버킷 `KIS_NEWS_MAX_RPS=5`(공식 20/s 의 25% · 운영 기준 ① 75% = 15/s 보다 훨씬 아래). 평상시 실사용 ≈ 2.7/s.
- **일일 가드:** `KIS_NEWS_DAILY_BUDGET=200000` — 공식 일일 한도가 아니라(관측 없음) **폭주 방지 자체 상한**이다. 80% 도달 시 warn, 초과 시 그 실행 종료 + error. 카운터 `api_usage` service `kis_news_title`(KST 날짜 키), strike 마커 `kis_news_title_quota_strike`(news-sync `QUOTA_STRIKE_SERVICE` 선례 — service 는 CHECK 없는 자유 text 라 마이그레이션 불필요 `[VERIFIED: workers/news-sync/src/apiUsage.ts:12-21 주석 「service 는 CHECK 없는 자유 text 라 마이그레이션이 필요 없다」]`).
- **카운터 증가는 쪽마다 1회 RPC 대신 배치로**: 루프 안에서 메모리에 모았다가 10초마다 `incr_api_usage` 1회(왕복 절약). 가드는 메모리 값 + 마지막 DB 값으로 판정.
- **등록:** 상한 200(최근 요청순) · 10분 동안 조회가 없으면 대상에서 빠짐 · 등록 쓰기는 같은 코드에 60초당 1회까지.
- **느린 창:** 각 실행은 피드를 마지막 본 일련번호까지 커서로 되감기(상한 30쪽) + 대상 1바퀴 후 종료. 보관 정리(90일 · 1일 지난 등록 행)는 하루 첫 느린 실행(20:00 이후)에서.

### Pattern 3: 저장 모양 (리서치 항목 6)
```sql
-- 글 1건 = 행 1개. 일련번호 멱등 + 같은 날 수정본 1건.
CREATE TABLE public.kis_news (
  srno          text PRIMARY KEY,                 -- cntt_usiq_srno (첫 수신분)
  provider_code text NOT NULL,                    -- news_ofer_entp_code
  source        text NOT NULL,                    -- dorg (예: '거래소 공시' · '연합뉴스')
  kind          text NOT NULL CHECK (kind IN ('news','disclosure')),  -- F/G → disclosure
  category      text,                             -- news_lrdv_code
  title         text NOT NULL,
  title_key     text NOT NULL,                    -- shared newsTitleKey()
  written_at    timestamptz NOT NULL,             -- data_dt+data_tm (KST) — 수정본이면 LEAST
  written_date  date NOT NULL,                    -- KST 날짜 (수정본 키)
  received_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_code, title_key, written_date)
);
CREATE TABLE public.kis_news_stocks (
  srno          text NOT NULL REFERENCES public.kis_news(srno) ON DELETE CASCADE,
  stock_code    text NOT NULL,
  via           text NOT NULL CHECK (via IN ('feed','stock')),
  hidden_reason text,                             -- NULL=표시 · 'etp' · 'derivative_notice'
  written_at    timestamptz NOT NULL,             -- 조회 인덱스용 사본
  PRIMARY KEY (stock_code, srno)
);
CREATE INDEX ON public.kis_news_stocks (stock_code, written_at DESC) WHERE hidden_reason IS NULL;
CREATE TABLE public.kis_news_targets (            -- 등록 + 종목별 마지막 수집 시각
  stock_code text PRIMARY KEY,
  last_requested_at timestamptz,                  -- 클라 조회(등록)
  last_collected_at timestamptz                   -- 종목별 조회 성공 시각 → 응답 collectedAt
);
CREATE TABLE public.kis_news_state (              -- 1행: 임대 · 피드 커서 · feedAt
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  lease_holder text, lease_until timestamptz, feed_at timestamptz, last_srno text
);
CREATE TABLE public.kis_access_tokens (           -- kiwoom_tokens 꼴
  token_type text PRIMARY KEY, access_token text NOT NULL,
  expires_at timestamptz NOT NULL, fetched_at timestamptz NOT NULL DEFAULT now()
);
```
- **ingest RPC**(`kis_news_ingest(p_rows jsonb, p_via text, p_queried_code text)` · plpgsql · 행 단위): srno 가 있으면 연결만 추가 → 없고 (provider, title_key, written_date) 가 있으면 **수정본**: `written_at = LEAST(...)` 후 기존 srno 에 연결 → 둘 다 없으면 insert. `p_queried_code` 가 있으면 `kis_news_targets.last_collected_at = now()` 도 같은 호출에서. 반환 `{inserted, revisions, linked}` 를 로그에 남긴다. **`ON CONFLICT` 한 대상만 받는 PostgREST upsert 로는 유일키 두 개를 못 다룬다** → RPC 필수.
- `stock_code` 에 `stocks` FK 를 걸지 않는다(종목 마스터 재적재·상폐 cascade 로 공시가 사라지는 것 방지). 대신 수집기가 `stocks` 마스터(10분마다 재적재)에 없는 코드는 연결하지 않고 개수만 로그(news-sync `targets.ts` 의 FK 사전 차단 정신).
- RLS: 다섯 표 모두 `ENABLE ROW LEVEL SECURITY` + 정책 0 + `REVOKE ALL … FROM anon, authenticated`(웹은 Express 경유만 읽음). RPC 는 `REVOKE ALL ON FUNCTION … FROM PUBLIC; REVOKE ALL … FROM anon, authenticated; GRANT EXECUTE … TO service_role;` 세 줄 `[VERIFIED: memory feedback_supabase_rpc_revoke — 자동 GRANT 가 PUBLIC REVOKE 를 덮어씀]`.
- 보관: `DELETE FROM kis_news WHERE written_at < now() - interval '90 days'`(cascade) — news-sync `runRetention(supabase, 90)` 과 같은 기간.

### Pattern 4: 조회 RPC 1회 (핫패스)
`stock_feed_by_codes(p_codes text[], p_since timestamptz, p_per_source int, p_register boolean) RETURNS jsonb`
- 반환: `{ "feed_at": …, "stocks": [ { "code", "collected_at", "kis": [ {srno, kind, source, title, title_key, written_at, received_at, codes[]} ], "naver": [ {id, title, description, source, url, published_at, created_at} ] } ] }` — jsonb 단일 값이라 db-max-rows(1000)에 잘리지 않는다 `[VERIFIED: memory project_cloudrun_egress_roundtrip_cost]`.
- 종목·출처별 최신 `p_per_source` 건(`row_number() OVER (PARTITION BY stock_code ORDER BY written_at DESC)`)만 — 삼성전자처럼 3일에 수백 건인 종목을 100개 묶음으로 부르면 커진다. server 는 `min(limit × 2 + 10, 200)` 을 넘긴다.
- `p_register` 가 참이면 같은 함수 안에서 `INSERT … ON CONFLICT (stock_code) DO UPDATE SET last_requested_at = now() WHERE kis_news_targets.last_requested_at IS NULL OR kis_news_targets.last_requested_at < now() - interval '60 seconds'` — 읽기와 등록이 왕복 1회.
- **다른 RPC 의 jsonb 래퍼를 안에서 부르지 않는다**(lessons 2026-11-04). 원 테이블을 부분 인덱스로 직접 읽는다. 배포 직후 해당 GET 지연을 Cloud Run 요청 로그로 1회 확인.
- VOLATILE(쓰기 포함) · `SET search_path = public` · `statement_timeout` 은 service_role 기본값(20260611130000) 안.

### Pattern 5: 합치기 규칙 — shared 순수 함수 하나 (리서치 항목 9)
```typescript
// packages/shared/src/stock-feed.ts — 규칙의 단일 정의(server · home-sync 공용). [제안 코드]
export function newsTitleKey(title: string): string {
  return title.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}
// 같은 기사 판정(같은 종목 문맥에서): 키가 같거나, 짧은 쪽 키가 15자 이상이고 긴 쪽의 앞부분이며,
// |작성시각 차| ≤ 12시간. → 시각 = 빠른 쪽 · url/description = 네이버 · source = 한투 dorg(한글 언론사명)
// · id = 먼저 수신된 쪽(kis:<srno> | naver:<uuid>) → 네이버 링크가 늦게 붙어도 id 불변(새 글 강조 오작동 방지).
// 정렬: 시각 desc, 같은 시각이면 공시 먼저.
```
- 정규화는 `\p{L}\p{N}` 만 남긴다 — 한글·영문·숫자·한자(韓)는 남고 따옴표(‘’“”) · 말줄임(… / ...) · 괄호 · 공백은 빠진다. 네이버 제목은 이미 `stripHtml` 로 엔티티가 풀린 상태 `[VERIFIED: server/src/routes/news.ts mapToNewsRow → stripHtml(item.title)]`.
- 「(정정)」 접두는 정규화 뒤 `정정…` 으로 남아 원 공시와 다른 키가 된다 → 정정 공시는 별개 줄로 보인다(gh-trade 목업 「정정 공시는 제목 앞 (정정) 그대로」와 일치).
- 12시간 창은 「[표] 외국인 순매수 상위」 같은 매일 같은 제목의 오병합을 막는다.

### Pattern 6: 파생상품 안내 거르기 (리서치 항목 3 · D-09)
판정은 수집기 TS(`classify.ts`)에서 연결 행마다 `hidden_reason` 을 계산해 **저장은 하되 조회에서 뺀다** — D-10 에서 규칙을 바꾸면 UPDATE 로 소급되고, 「뺀 것」 목록도 사용자에게 보일 수 있다.
1. **연결 코드가 ETP** → `'etp'`: `stocks.security_group IN ('ETF','ETN','ELW')` 또는 종목명 `/ETN|ETF|ELW|인버스|레버리지/i` — home-sync `isExcludedProduct` 와 같은 규칙(재사용 권고: 그 함수를 shared 로 옮기거나 같은 상수를 공유) `[VERIFIED: workers/home-sync/src/pipeline/loadSurges.ts:103 「const EXCLUDED_SECURITY_GROUPS = new Set(["ETF", "ETN", "ELW"]);」 · :110 「const EXCLUDED_NAME_PATTERN = /ETN|ETF|ELW|인버스|레버리지/i;」]`. ELW 는 master-sync 가 `/etp/elw_bydd_trd` 로 `security_group='ELW'` 적재 `[VERIFIED: workers/master-sync/src/krx/fetchEtpBaseInfo.ts:7-9 · 39-40]`. 스팩은 빼지 않는다(D-09 대상 아님 · `isExcludedProduct` 도 의도적으로 제외).
2. **공시(F/G) 제목이 파생 안내** → `'derivative_notice'`: `/ELW|주식워런트|ETN|상장지수|ETF|주식선물|주식옵션|선물[·ㆍ]?옵션|파생상품/` `[ASSUMED — 실제 제목 표본 없음 · D-10 에서 확정]`. 뉴스(언론사) 제목에는 적용하지 않는다(D-09 는 공시 규칙).
3. `news_lrdv_code` · `FID_COND_MRKT_CLS_CODE` 로 가르는 길은 의미표가 없어 쓰지 않는다 `[ASSUMED]`. 코드 모양만으로는 못 가른다 — ETF 코드는 일반 종목과 같은 숫자 6자리 대역이다.

### Pattern 7: 조회 계약 (리서치 항목 8)
```
GET /api/news/by-stock?codes=005930,0011T0,…&days=3&limit=20
- codes: 쉼표 · 1~100 · 각 /^[0-9A-Z]{6}$/ (SHORT_CODE_RE — 2025~ 영문 포함 코드) · 중복은 한 번 · 위반 400
  (themes by-stock 은 /^\d{6}$/ 라 영문 코드를 400 으로 거른다 — 여기서는 따르지 않는다)
- days: 1~7 clamp · 기본 3 (D-08) · limit: 1~100 clamp · 기본 20 (종목당)
- 인증 없음 · Cache-Control: public, max-age=5 · 코드집합+days+limit 별 5초 메모리 캐시(진행 중 promise 공유)
200 {
  "asOf": "2026-11-12T09:15:03.120+09:00",
  "feedAt": "2026-11-12T09:15:00.512+09:00",          // 전체 흐름 마지막 성공 시각 · 수집기 생존 표시(없으면 null)
  "stocks": [                                          // 입력 순서 · 글 없는 코드도 포함
    { "code": "005930",
      "collectedAt": "2026-11-12T09:14:10.000+09:00",  // 종목별 조회 마지막 성공(없으면 null = 아직 수집 전)
      "count": 12,                                     // 기간 안 합친 뒤 건수(상한 200)
      "items": [
        { "id": "kis:2026111209143512345", "kind": "disclosure",
          "publishedAt": "2026-11-12T09:14:35+09:00", "title": "삼성전자(주) …",
          "source": "거래소 공시", "stockCodes": ["005930"], "url": null,
          "receivedAt": "2026-11-12T09:14:41.230+09:00" } ] } ] }
```
- 시각은 전부 `+09:00` 오프셋 명시(gh-trade 「시간대 명시」 · .NET 4.0 `DateTime` 파싱 친화).
- **전역 제한기에서 떼어 낸다:** 현재 `/api` 전체가 IP 당 분 200회(`windowMs: 60_000` · `limit: 200` `[VERIFIED: server/src/middleware/rate-limit.ts:6-7]`, `app.use("/api", apiRateLimiter())` `[VERIFIED: server/src/app.ts:126]`). 사무실 클라 10대가 10초 주기면 이 라우트만 분 60회 × (100코드 청크 수) — 웹 작업대·테마·유통주식 조회와 합치면 200 을 넘어 **사무실 전체가 429** 를 맞는다. `skip` 에 이 경로를 더하고 라우트 전용 제한기(예: IP 당 분 600회)를 건다. 응답은 5초 캐시라 DB 부담은 작다.
- 기존 `GET /api/stocks/:code/news` 와 `POST …/refresh` 도 같은 RPC + `mergeStockFeed` 로 바꾼다(refresh 는 네이버만 부르고 **응답 목록은 합친 목록** — 안 바꾸면 새로고침 뒤 공시가 사라진다). `NewsListQuery` 의 days 상한 7 · limit 100 · `before` 커서는 유지 `[VERIFIED: server/src/schemas/news.ts — days 「if (v > 7) return 7;」]`.

### Pattern 8: home-sync 입력 (리서치 항목 10 · D-19)
- `loadSurges` 3단계(뉴스 로드)를 `stock_feed_by_codes(codes, newsWindowCutoff, 50, false)` 로 바꾸고 `mergeStockFeed` 결과를 쓴다(청크 200 · 1000행 절단 회피는 jsonb 라 자연 해결).
- `NewsRow` 에 `kind` 추가 · `url: string | null`. top-K(기본 `newsPerStock` 5 `[VERIFIED: workers/home-sync/src/config.ts:46]`) 정렬: **공시 최대 2건 먼저** → 종목명 일치 → 최신. 
- 프롬프트 줄: `[N] [공시] 012340 (주)가람전자 단일판매ㆍ공급계약체결 (코스닥 공시 15:15)` — 시스템 프롬프트에 「`[공시]` 줄은 거래소·코스닥 공시 제목이다. 재료 근거로 우선한다」 한 줄 추가. `newsRefs` 는 여전히 **인덱스만**, 워커가 verbatim 해석(`resolveNewsRefs`) — 환각 방지 규칙 불변.
- `HomeNewsRef` 확장(하위호환): `url: string | null` · `kind?: "news" | "disclosure"` · `publishedAt?: string`. 현재 정의는 `url: string` `[VERIFIED: packages/shared/src/home.ts:21-28 「/** 원문 URL (출처 표기 — 5원칙 #5) */ url: string;」]`. 옛 스냅샷은 `kind` 없음 → 뉴스로 취급.
- **URL 기준 중복 제거 두 곳을 고친다**: 워커 `dedupeNewsByUrl`(`seen.has(ref.url)`) 와 웹 `NewsBlock` 의 `dedupeByUrl` — url 이 null 인 공시가 전부 한 건으로 뭉친다. 키 = `url ?? \`${source}|${title}\``.
- 로그: `CLUSTER_MAX_TOKENS = 8192` `[VERIFIED: clusterSurges.ts:44]` 는 출력 상한이라 입력 증가에는 영향이 적지만 memory feedback_silent_failure_max_tokens 규칙대로 `stop_reason`·`output_tokens`·입력 줄 수 로그를 유지하고, 배포 전후 하루 Claude 호출 수(「content unchanged」 로그 비율)를 비교한다.

### Anti-Patterns to Avoid
- **server 에 한투 클라이언트를 두기:** 묶음 조회·종목 페이지가 한투를 부르는 순간 운영 기준 ③ 위반. server 에는 한투 env·비밀을 바인딩하지 않는다(정적 검사로 고정).
- **실행마다 토큰 발급:** 알림톡이 실행 수만큼 간다. DB 토큰 재사용 · 만료 1시간 전에만 재발급 · 발급은 임대 보유 실행만.
- **`news_articles` 에 url 없는 행 넣기:** 네이버 upsert `onConflict: "stock_code,url"`, retention, 챗봇 news-specialist, home-sync 가 같이 깨진다.
- **(자료원, 제목) 영구 유일키:** 다음 날 같은 제목 공시 소실(위 전제 2).
- **themes by-stock 의 `/^\d{6}$/` 복사:** 영문 포함 신규 코드(예 `0011T0`)가 400 `[VERIFIED: packages/shared/src/stockCode.ts:21 「export const SHORT_CODE_RE = /^[0-9A-Z]{6}$/;」]`.
- **무로그 catch:** 모든 한투 실패는 `msg_cd` · `msg1` · HTTP 상태를 원문 그대로 남긴다(첫 실제 발생에서 HTTP 상태 형태 확인용).
- **Job `--max-retries` 로 재시작:** 결정적 버그면 즉시 크래시 루프 → 토큰·호출 낭비. 재시작은 Scheduler 깨움 + 임대가 한다.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 일일 호출 카운터 | 새 카운터 표 | `api_usage` + `incr_api_usage` RPC | 원자 증가 · KST 날짜 키 · 선례 |
| 빠른 창 시각 판정 | `Date#getHours`(호스트 TZ) | news-sync `cadence.ts` 의 +9h `getUTC*` 방식 | 컨테이너 TZ 무관 |
| 대상 집합 | 새 쿼리 | `loadTargets`(top_movers 최신 scan ∪ watchlists ∪ stocks 검증) 논리를 RPC 로 | `code` 컬럼명 함정(stock_code 아님) 등 이미 해결 |
| ETP 판정 | 새 규칙 | `isExcludedProduct` 규칙 공유 | 570127 ETN 오분류 실사례 대응 포함 |
| 묶음 조회 캐시 | 새 캐시 | themes `getThemesByStock` 의 WeakMap+진행 중 promise 패턴 | 동시 요청 중복 방지 · 실패 미캐시 |
| 비밀 주입 | Claude 가 Secret 쓰기 | 사용자 `! bash <비출력 스크립트>` | 분류기 차단 · 값 비노출 |
| 토큰 저장 | 파일/메모리 | `kiwoom_tokens` 꼴 표 | 실행 간 공유 |

## Common Pitfalls

### Pitfall 1: 알림톡 폭탄 · 토큰 1분 1회
**What goes wrong:** 실행 시작마다 `tokenP` → 사용자 휴대폰에 알림톡 수십 통, 1분 안 두 번째 발급은 `EGW00133`.
**How to avoid:** DB 토큰 재사용 · 만료 1시간 전 재발급 · 발급은 임대 보유자만 · 발급 실패 후 61초 대기 1회.
**Warning signs:** 하루 발급 로그가 2회 이상.

### Pitfall 2: 종목별 조회 행의 종목 연결 누락
**What goes wrong:** `iscd1` 만 믿고 연결하면 005930 조회 결과의 절반(다른 코드 표시분)이 005930 목록에서 빠진다(실측 21/40).
**How to avoid:** 조회 코드 + `iscd1..10` 둘 다 연결(`via='stock'`).

### Pitfall 3: 피드 넘침
**What goes wrong:** 15:30 · 18:00 공시 몰림에 5초 사이 40건 초과 → 1쪽만 보면 누락.
**How to avoid:** 1쪽에 마지막 본 일련번호가 없으면 커서로 다음 쪽(상한 5쪽, 넘으면 warn) + F/G 60초 안전망.
**Warning signs:** 「page cap reached」 로그.

### Pitfall 4: 수정본 키의 날짜 경계 · 되감기 순서
**What goes wrong:** 되감기는 최신 → 과거 순이라 수정본이 원본보다 먼저 들어온다 → 「먼저 들어온 것 유지」면 늦은 시각이 남는다.
**How to avoid:** 수정본 병합 시 `written_at = LEAST(...)`(D-12 「시각은 빠른 쪽」과 같은 원칙).

### Pitfall 5: 사무실 IP 공유 429
**What goes wrong:** gh-trade 여러 대 + 웹 작업대가 같은 공인 IP → 전역 200/분 초과 → 테마·시세 조회까지 막힘.
**How to avoid:** 전용 제한기 · gh-trade 에 「10초 · 100코드 청크 · 배지용은 `limit=3`」 권고.

### Pitfall 6: url null 이 깨는 곳
**What goes wrong:** `NewsItem` 의 `<a href={article.url}>`, `NewsBlock`·`dedupeNewsByUrl` 의 url 키, `key={item.url}` React 키 중복.
**How to avoid:** 링크 없는 줄은 `<span>`(D-20) · 키는 `id` · 중복 제거 키 `url ?? source|title`.

### Pitfall 7: 반쪽 배포
**What goes wrong:** webapp push 가 먼저 나가면 새 화면이 옛 server 의 `NewsArticle[]` 를 받는다. home-sync 를 먼저 내면 새 RPC 가 없어 실패.
**How to avoid:** 순서 = migrations → 워커 Job(+Scheduler) → server(`deploy-server.sh` · 운영 `APP_VERSION` 이 내 빌드의 조상인지 확인) → 검증 curl → `git push`(webapp) → (마지막 묶음) home-sync. 비밀은 그 전에 사용자 `!` 주입.

### Pitfall 8: home-sync 비용 증가 (위 전제 5)
**How to avoid:** 배포 전후 Claude 호출 수 비교 · 필요 시 해시 입력 완화.

### Pitfall 9: `kor_isnm` 공백 · 코드 대소문자
`kor_isnm1` 빈 값이 `" "` · 코드도 trim · 대문자 확인 후 `SHORT_CODE_RE` 통과분만.

## Code Examples

### 한투 1쪽 호출 (공식 샘플 헤더 · 실측 커서)
```typescript
// Source: koreainvestment/open-trading-api kis_auth.py _url_fetch + news_title() · 실측 cont_by_cursor
const res = await http.get("/uapi/domestic-stock/v1/quotations/news-title", {
  headers: {
    authorization: `Bearer ${token}`, appkey, appsecret,
    tr_id: "FHKST01011800", custtype: "P", tr_cont: "",
  },
  params: {
    FID_NEWS_OFER_ENTP_CODE: provider ?? "", FID_COND_MRKT_CLS_CODE: "",
    FID_INPUT_ISCD: code ?? "", FID_TITL_CNTT: "",
    FID_INPUT_DATE_1: cursor ? `00${cursor.date}` : "",   // 00YYYYMMDD
    FID_INPUT_HOUR_1: cursor ? `0000${cursor.time}` : "", // 0000HHMMSS
    FID_RANK_SORT_CLS_CODE: "", FID_INPUT_SRNO: cursor?.srno ?? "",
  },
  validateStatus: () => true,               // 상태값과 무관하게 rt_cd/msg_cd 로 분류
});
if (res.data?.rt_cd !== "0") throw new KisApiError(res.status, res.data?.msg_cd, res.data?.msg1);
```

### 작성 시각
```typescript
// data_dt "20261111" + data_tm "210335" (KST) → ISO. 일련번호에서 시각을 뽑지 않는다(표본 3/350 불일치).
const writtenAt = new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}+09:00`);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| KIS ingestion 워커 + `kis_tokens` | 키움 REST + `kiwoom_tokens` | Phase 09.1 (2026-05) | 이번 phase 는 한투를 **뉴스 전용**으로 새로 들인다 — 옛 코드·표는 없음 |
| Cloud Run Job task timeout 24시간 | 168시간 | 2024-11 preview → 현재 문서 기준 | 13시간 실행 가능 |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 팀 내부 여러 사용자 화면 표시가 약관상 허용된다(확인 못 함) | 결정 전제 1 | phase 범위 재설계 |
| A2 | 한투 REST 에 공개 일일 한도가 없다 | 유량 | 하루 14만 호출이 차단될 수 있음 → 일일 가드·strike 로 완화 |
| A3 | 초당 20건이 앱키 단위이고 사용자가 같은 키를 다른 데서 쓰지 않는다 | 유량 | `EGW00201` 빈발 → 전용 키 권고 |
| A4 | 고정 IP 등록이 필요 없다 | 고정 IP | Cloud Run 발신 거부 → NAT 경유로 1줄 전환 |
| A5 | 오류의 HTTP 상태 형태(500/401 등) | 오류표 | 분류는 msg_cd 로 하므로 영향 작음 |
| A6 | 파생 안내 제목 패턴 · `news_lrdv_code` 의미 | Pattern 6 | 걸러야 할 글이 보이거나 반대 → D-10 UAT 로 교정 · hidden_reason 소급 UPDATE |
| A7 | 장중 피드량이 5초당 40건을 거의 넘지 않는다 | Pattern 2 | 넘침 쪽 호출 증가 → 로그로 첫날 확인 |
| A8 | Cloud Run Jobs 단가(월 $20 안팎) | Pattern 1 | 비용 추정 오차 |
| A9 | Cloud Run worker pools 의 GA·가격 | Alternatives | 대안 비교만 영향 |
| A10 | 한투 뉴스 제목 저작권이 공급사에 있다 | 결정 전제 1 | 약관 판단에 포함 |

## Open Questions

1. **약관(A1)** — 무엇을 아는가: 제3자 서비스는 제휴 필요 · 제휴는 제도권 금융사만(검색 요약). 모르는 것: 팀 내부 표시가 「제3자」인지, 뉴스 제목이 「시세」인지. 권고: 계획 전 사용자 확인(한투 문의).
2. **앱키 전용 여부(A3)** — 사용자가 같은 앱키로 다른 프로그램(자동매매 등)을 돌리는지. 권고: 이 수집기 전용 앱키(계좌당 신청) 권고 · 아니면 `KIS_NEWS_MAX_RPS` 를 3 으로.
3. **일일 한도(A2)** — 첫 운영일 api_usage 수치와 오류 로그로 확인.
4. **파생 안내 실제 제목(A6)** — D-10 UAT 에서 `scripts/kis-disclosure-kinds.sql`(회사명 앞부분을 걷어 낸 제목 패턴별 건수 · hidden_reason 별) 결과로 확정.
5. **Cloud Run 발신 허용(A4)** — Wave 0 스모크 1회.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | 빌드·테스트 | ✓ | v24.21.0 (로컬) | — |
| pnpm | 워크스페이스 | ✓ | 11.15.1 | — |
| gcloud | Job·Scheduler·Secret 배포 | ✓ | 592.0.0 | — |
| Supabase CLI | migrations push | ✓ | 2.75.0 | — |
| Docker | pgTAP 러너 · 이미지 빌드 | ✓ | 29.8.2 | — |
| 한투 실전 앱키·시크릿 | 수집기 | ✗ (사용자 보유 · 저장소·Secret Manager 에 없음) | — | 없음 — 사용자 `!` 비출력 스크립트로 Secret `gh-radar-kis-appkey` · `gh-radar-kis-appsecret` 생성(메인 세션 · 배포 전 체크포인트) |
| 한투 API 도달(Cloud Run 발신 :9443) | 수집기 | 미확인 | — | VPC + NAT 고정 IP 경유 |

**Missing dependencies with no fallback:** 한투 키 주입(사용자 작업) — 블로킹 체크포인트.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest — 새 워커 ^3(news-sync 와 같음) · server ^4.1.4(node) · shared ^4.1.4 · webapp ^2.1.9(jsdom) + pgTAP(러너 `scripts/verify-dma-orders-price-check.sh --test` · 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104`) |
| Config file | `server/vitest.config.ts` · `packages/shared/vitest.config.ts` · `webapp/vitest.config.ts`(maxWorkers 기본 2) · 새 `workers/kis-news-sync/vitest.config.ts`(Wave 0) |
| Quick run command | `pnpm --filter @gh-radar/kis-news-sync exec vitest run tests/<file>.test.ts --maxWorkers=2` |
| Full suite command | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/kis-news-sync exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run --maxWorkers=2 && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/kis_news.test.sql` (+ D-19 묶음 때 `pnpm --filter @gh-radar/home-sync exec vitest run --maxWorkers=2`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC-1 | 같은 srno 두 번 → 1행 · 같은 날 같은 (업체, 제목키) 다른 srno → 1행 · written_at=LEAST · 다음 날 같은 제목 → 2행 · 조회 코드 연결 · last_collected_at 갱신 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/kis_news.test.sql` | ❌ W0 |
| SC-1 | 커서 페이징(겹침 종료 · 쪽 상한 · 경계 1건 겹침 제거) · 빠른 창 판정(07:00 · 20:00 경계 · 토/일) · 토큰 버킷/우선순위(새 등록 먼저) · 표본 픽스처 분류 | unit | `pnpm --filter @gh-radar/kis-news-sync exec vitest run tests/newsTitle.test.ts tests/cadence.test.ts tests/scheduler.test.ts tests/classify.test.ts --maxWorkers=2` | ❌ W0 |
| SC-1 | 임대: 살아 있는 임대면 두 번째 실행 즉시 종료 · TTL 지나면 인수 | pgTAP + unit | 위 pgTAP 파일 + `tests/index.test.ts` | ❌ W0 |
| SC-2 | 제목키(공백·기호·…/... · 한자) · 앞부분 일치(≥15자) · 12시간 창 · 시각 빠른 쪽 · 링크/스니펫 네이버 · id 안정 · 정렬(같은 시각 공시 먼저) · 정정 공시 별개 | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/stock-feed.test.ts --maxWorkers=2` | ❌ W0 |
| SC-2 | `/api/stocks/:code/news` · refresh 응답이 합친 목록 | route(supertest + supabase mock) | `pnpm --filter @gh-radar/server exec vitest run tests/routes/news.test.ts --maxWorkers=2` | ✅ (케이스 추가) |
| SC-3 | by-stock: 101코드·형식 오류 400 · 영문 코드 허용 · 입력 순서 · 글 없는 코드 빈 배열 · collectedAt null · `+09:00` · Cache-Control · 캐시 · RPC 1회 · register=true · 전용 제한기 | route | `pnpm --filter @gh-radar/server exec vitest run tests/routes/news-by-stock.test.ts --maxWorkers=2` | ❌ W0 |
| SC-3 | 계약 드리프트: server 응답과 webapp 이 같은 shared 타입 | typecheck | `pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/server run typecheck` | ✅ |
| SC-4 | server 에 한투 호출 경로 없음 | 정적 | `! grep -rn "koreainvestment\|FHKST01011800\|KIS_APP" server/src` | ✅ (명령) |
| SC-4 | 카운터 증가 · 일일 가드 초과 시 실행 종료 · 80% warn | unit | `… vitest run tests/apiUsage.test.ts tests/budget.test.ts` | ❌ W0 |
| SC-5 | 오류 분류(EGW00201/00121/00123/00133/5xx/네트워크/모르는 코드 연속) → 동작 · 로그에 msg_cd·msg1·status | unit | `… vitest run tests/classifyError.test.ts tests/token.test.ts` | ❌ W0 |
| SC-5 | `news_articles`·news-sync 무변경 | 정적 | `git diff --stat <phase 시작>..HEAD -- workers/news-sync supabase/migrations/2026041*` 가 비어 있음 | ✅ |
| SC-6 | NewsItem: 배지 「공시」/「뉴스」 · url null 이면 링크 아님 · ↗ 는 링크 줄만 · 자료원 항상 | RTL | `pnpm --filter @gh-radar/webapp exec vitest run src/components/stock/__tests__ --maxWorkers=2` | ✅ (케이스 추가) |
| SC-6 | 돌파 띠 배지·행 펼침 목록 · 상따 띠(최근 공시1+뉴스1 · 빈 줄 문구 · 펼침) · 30초 강조는 목록 타이머 1개 | RTL | `… vitest run src/components/trading --maxWorkers=2` | ✅ (케이스 추가) |
| SC-6 | 홈 NewsBlock: 공시 null url 중복 뭉침 없음 · 배지 · 시각 | RTL | `… vitest run src/components/home --maxWorkers=2` | ✅ (케이스 추가) |
| SC-6 | 목업 일치(폭 390 · PC · 상따 4밴드) | manual UAT | 목업 대조 | — |
| SC-7 | D-10 공시 종류 목록 | manual UAT + SQL | `scripts/kis-disclosure-kinds.sql` 결과를 사용자에게 제시 | ❌ W0 |
| D-19 | 프롬프트 `[공시]` 라벨 · 인덱스→verbatim · url null 중복 제거 · top-K 공시 우선 · stop_reason 로그 | unit | `pnpm --filter @gh-radar/home-sync exec vitest run src/ai/prompt.test.ts src/ai/clusterSurges.test.ts src/pipeline/loadSurges.test.ts --maxWorkers=2` | ✅ (케이스 추가) |

### Sampling Rate
- **Per task commit:** 그 태스크 파일 단위 `exec vitest run <파일> --maxWorkers=2` · DB 태스크는 pgTAP 1파일
- **Per wave merge:** 건드린 패키지 `exec vitest run --maxWorkers=2` + pgTAP — 전체 회귀는 한 세션만(동시 세션 메모리 규칙)
- **Phase gate:** Full suite green + `workflow.build_command` + 배포 후 운영 확인(아래)

### 운영 확인(수동 · 배포 뒤)
- 평일 빠른 창에서 `kis_news.received_at - written_at` 분포(중앙값 ≤ 15초 목표) · `api_usage` `kis_news_title` 당일 값 · 실행 로그 「lease acquired」 1개만.
- `curl 'https://<server>/api/news/by-stock?codes=005930,000660'` 응답 형태 · 지연(Cloud Run 요청 로그) · 전용 제한기 헤더.

### Wave 0 Gaps
- [ ] `workers/kis-news-sync/` 패키지 골격 + `vitest.config.ts` + `tests/fixtures/kis-news-title-sample.json` — 실측 표본 사본(경로 `/private/tmp/claude-501/-Users-alex-repos-gh-radar/624f3f4a-60d7-4c2f-9aba-8650f5425380/scratchpad/kis-probe/result.json` · 토큰·키 문자열 0건 확인함 · 세션 임시 경로라 사라지기 전에 저장소로 옮길 것)
- [ ] `supabase/tests/kis_news.test.sql`
- [ ] `packages/shared/src/__tests__/stock-feed.test.ts`
- [ ] `server/tests/routes/news-by-stock.test.ts`
- [ ] `scripts/kis-disclosure-kinds.sql`
- [ ] 스모크: Cloud Run 발신 한투 1회(키 주입 뒤 · `scripts/smoke-kis-news-sync.sh`)

## Security Domain

`security_enforcement: false` — 이 phase 는 보안 검사 섹션을 생략한다(사용자 결정 · memory feedback_no_security_review). 비밀 위생(값 비출력 · Secret Manager · RLS 정책 0 + REVOKE)은 위 패턴에 포함했다.

## Sources

### Primary (HIGH confidence)
- 저장소 직접 열람(이번 세션): `workers/news-sync/src/{index,apiUsage,config,retention}.ts` · `pipeline/{cadence,targets}.ts` · `server/src/routes/{themes,news}.ts` · `schemas/{themes,news}.ts` · `middleware/rate-limit.ts` · `app.ts` · `mappers/news.ts` · `packages/shared/src/{stockCode,news,home}.ts` · `workers/home-sync/src/{config.ts,pipeline/loadSurges.ts,pipeline/contentHash.ts,ai/prompt.ts,ai/clusterSurges.ts}` · `webapp/src/components/{stock/news-item.tsx,home/news-block.tsx}` · migrations `20260413120000` · `20260417120000` · `20260417120200` · `20260514120000` · `20260514120100` · `scripts/deploy-{server,news-sync,home-sync,tickgw}.sh` · `infra/relay/README.md` · `scripts/trade-handoff.sh` · gh-trade `docs/inbox/from-gh-radar/README.md`
- 한투 공식 저장소 `koreainvestment/open-trading-api` @3a9be59: `examples_user/domestic_stock/domestic_stock_functions.py` (news_title) · `examples_user/kis_auth.py` · `examples_llm/domestic_stock/news_title/{news_title,chk_news_title}.py` · `kis_devlp.yaml` · `README.md`
- 2026-11-11 실측 원본 `result.json`(세션 스크래치 · 재집계)

### Secondary (MEDIUM confidence)
- [KIS Open API → Vellab playbook](https://velobot-wiki.pages.dev/article/finance/kis-open-api-vellab-live-trading-integration-playbook/) — 공지 「API 호출 유량 안내 (2025.08.07 기준)」 2차 인용
- [AlgoLab KIS 오류 코드 (2026-05-25)](https://algolab.co.kr/blog/kis-api-error-codes) — EGW00201/00121/00123/00133
- [Cloud Run task timeout 문서](https://docs.cloud.google.com/run/docs/configuring/task-timeout) — 168시간
- [KIS Developers 제휴 안내](https://apiportal.koreainvestment.com/provider) · [제휴 FAQ](https://apiportal.koreainvestment.com/provider-faq) — 검색 색인 요약만(SPA 원문 미열람)

### Tertiary (LOW confidence)
- [인프런 EGW00201 질의](https://www.inflearn.com/community/questions/1825942/api-오류-egw00201-초당-거래건수를-초과) · [wikidocs 453543](https://wikidocs.net/453543)(403) — 모의 한도 수치 상충
- [Cloud Run worker pools GA 기사](https://machineherald-io.pages.dev/article/2026-05/20-google-cloud-run-worker-pools-reach-ga-with-open-source-crema-autoscaler-and-blackwell-gpu-support) — 미확인

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 새 패키지 없음, 전부 저장소 선례
- Architecture: MEDIUM-HIGH — 저장·조회·합치기는 코드 근거, 도는 곳은 공식 문서 + 비용 추정(ASSUMED)
- 한투 사실관계: MEDIUM — 필드·커서·토큰은 실측·공식 샘플, 유량은 공지 2차 인용, 일일 한도·약관은 미확인
- Pitfalls: HIGH — 대부분 실측 표본·코드에서 직접 도출

**Research date:** 2026-11-11
**Valid until:** 2026-12-11 (한투 공지·약관 변동 가능 — 약관은 계획 전 확인)
