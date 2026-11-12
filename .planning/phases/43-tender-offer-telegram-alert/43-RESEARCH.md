# Phase 43: 공개매수 · 유상증자 · 합병 공시 텔레그램 알림 - Research

**Researched:** 2026-11-12
**Domain:** OpenDART 공시검색(`list.json`) 고정 주기 폴링 → Telegram Bot API 단체방 송신 (Cloud Run Job 장기 실행 수집기)
**Confidence:** MEDIUM (코드 선례 · API 계약은 HIGH, 보고서명 실제 표기 · 하루 건수 · 장전 반영 지연은 키가 없어 미실측)

## 요약 (Summary)

이 phase 는 새 코드 덩어리 셋으로 끝난다: ① `workers/kis-news-sync` 를 그대로 복제한 새 수집기(임대 · KST 창 판정 · `api_usage` 묶음 카운터 · 로거 redact · 배포/IAM/스모크/비밀 스크립트), ② 자료원 OpenDART `list.json` 을 두 「감시 대상(watch)」 — 공개매수(`pblntf_detail_ty=D004`) · 주요사항보고서(`pblntf_detail_ty=B001`) — 로 한 바퀴에 한 번씩 부르는 클라이언트, ③ 출력 Telegram `sendMessage` 송신기와 「보냄 상태」 표. 새 npm 패키지는 필요 없다 — kis-news-sync 가 쓰는 `axios` · `pino` · `@supabase/supabase-js` · `dotenv` 만으로 된다.

리서치가 찾은 **사용자에게 먼저 알려야 할 것 두 가지**: (1) D-04 의 글자 규칙 「보고서 이름에 `유상증자` 가 들어간」 은 D-04 가 대상으로 명시한 **「유무상증자결정」 을 놓친다** — 「유무상증자」 는 글자 「유상증자」 를 포함하지 않는다(유·무·상·증·자). 그래서 이름 규칙은 「부분 글자 포함」 이 아니라 **「주요사항보고서( … ) 괄호 안 종류명 허용 목록」**(유상증자결정 · 유무상증자결정 · 회사합병결정 · 회사분할합병결정, 정정 접두 `[ … ]` 는 떼고 비교)으로 구현해야 D-04 의 의도와 정확히 맞는다. (2) 공개매수와 주요사항보고서는 **한 번의 호출로 받을 수 없다** — `pblntf_detail_ty` 는 4자 코드 하나, `pblntf_ty` 는 글자 하나만 받고 D004(지분공시) 와 B001(주요사항보고)은 다른 대분류다. 유형 필터 없는 호출은 하루 전체 공시(지분공시 · 거래소공시 포함)가 섞여 100건 쪽 한계를 넘기 쉽다. 따라서 D-10 의 「한 바퀴 2회 · 하루 약 10,800회」 전제는 그대로 선다.

전달 보장은 Phase 40 `dma_push_claim`(기록 먼저 → 송신, 사실상 최대 1회)과 달리 **「pending → sending → sent」 상태 기계 + 임대 보유자만 송신 + 새 보유자가 남은 sending 을 다시 보냄(최소 1회)** 을 권한다 — 공시 알림은 하루 수 건이라 「드물게 두 번」 보다 「한 건 유실」 이 훨씬 비싸고, 로드맵 성공 기준 5 「다음 실행이 이어서 보낸다」 를 만족하려면 송신 실패 건이 DB 에 남아 있어야 한다. 「(늦은 알림)」 은 「그날 마지막 성공 조회(없으면 `07:00` + 시작 여유 2분) 이후 60초 넘게 비었던 뒤 처음 본 건 · 또는 처음 본 뒤 60초 넘게 지나 보내는 건」 으로 판정하면 정상 아침 시작에는 붙지 않는다.

**Primary recommendation:** `workers/dart-alert` 새 워커를 kis-news-sync 꼴로 복제하고, 감시 대상 2개를 코드 상수 목록(`WATCHES`)으로 두며, B001 은 괄호 종류명 허용 목록으로 거르고, 표 2개(`dart_alerts` · `dart_alert_state`) + RPC 몇 개로 「한 번만 · 이어서 보냄 · 장애 짝 글」 을 DB 가 보장하게 한다.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**로드맵에서 이미 잠긴 것(재론 금지):**
- 자료원은 OpenDART `list.json`. 한투 `news-title` · KIND · DART RSS(`todayRSS.xml`)는 조사에서 기각(로드맵 Goal ① ~ ③).
- OpenDART 는 CLAUDE.md 「공식 API 운영 기준」 대상 — 설계 예산 ≤ 공식 한도 20,000회/일의 75% = **15,000회/일** · 호출량은 사용자 수와 무관한 고정 주기 · 한도 초과 응답(`020`)을 받으면 그 run 중단(재시도로 두드리지 않음) · 알림에 출처(금융감독원 전자공시)와 원문 링크.
- 같은 접수번호는 한 번만 알린다 — 재시작 · 중복 실행 · 같은 응답 반복에도(보낸 접수번호를 DB 에 남긴다).
- `api_usage` 에 KST 날짜별 호출 수를 남긴다.
- 트렐로 카드의 「공개매수 설명회」 = DART 「공개매수설명서」.
- 비밀(OpenDART 인증키 · 텔레그램 봇 토큰 · 방 id) 등록은 사용자가 터미널에서 실행하는 **비출력 스크립트**로(`scripts/setup-kis-secrets.sh` 선례).
- 운영 중 첫 실제 공개매수 건에서 「DART 표기 시각 → 알림 도착」 지연을 기록한다(로드맵 성공 기준 7).

**밖:** 공시 본문 읽기(공개매수 가격 · 기간 · 수량 / 유상증자 규모 · 발행가 / 합병 비율) · 웹앱 표시 · GH Trade 종목 화면 링크 · 유상증자 · 합병 외의 주요사항보고서(무상증자 · 분할 · 주식교환 · 전환사채 · 자사주 · 영업양수도) · 코넥스 · 비상장 · 종류별 방 나누기 · 밤/주말 조회 · gh-trade 클라 연동.

#### 무엇을 알릴지 (D-01 ~ D-05)
- **D-01: 공개매수 유형(`pblntf_detail_ty=D004`)으로 오는 보고서는 전부 알린다.** 신고서 · 설명서 · 정정신고서 · 의견표명서 · 결과보고서와 그 밖에 이 유형으로 올라오는 것 모두. 권고안(신고서 · 정정 · 설명서만) · 「신고서만」은 사용자가 기각했다. 보고서 이름으로 거르지 않는다.
- **D-02: 보고서마다 알림 1건.** 신고서 2 ~ 4분 뒤 따라오는 설명서도 따로 1건 — 묶지 않고, 답글로 붙이지 않고, 무음으로 낮추지 않는다. 신고서 알림이 기다림 없이 바로 간다.
- **D-03: 유상증자 · 합병 결정 공시도 같은 틀로 알린다.** 사용자 원문 「유상증자 합병도 포함하자」. 로드맵 미결 ⑨ 의 답이다.
- **D-04: 유상증자 · 합병은 「보고서 이름에 `유상증자` 또는 `합병` 이 들어간 주요사항보고서」.** 유상증자결정 · 유무상증자결정 · 회사합병결정 · 회사분할합병결정과 그 정정 공시가 대상이다. 무상증자결정 · 회사분할결정 · 주식교환/이전 · 전환사채 · 자사주 · 영업양수도는 알리지 않는다(「주요사항보고서 전부」 · 「무상증자 · 분할 · 주식교환까지」 기각). 알릴 유형과 이름 규칙은 **설정값 목록**으로 둔다 — 나중에 유형을 더할 때 코드 구조를 바꾸지 않는다.
- **D-05: 코스피 · 코스닥 상장사 공시만 알린다.** 코넥스 · 비상장(종목코드 없는 회사)은 보내지 않는다. 공개매수 · 유상증자 · 합병 모두 같은 규칙.

#### 알림에 담을 내용 (D-06 ~ D-09)
- **D-06: 1차는 목록 정보와 원문 링크만.** 공개매수 가격 · 기간 · 수량, 유상증자 규모 · 발행가, 합병 비율 같은 본문 숫자는 넣지 않는다. 「먼저 보내고 숫자는 뒤이어 덧붙이기」 · 「숫자까지 읽은 뒤 한 번에」는 기각 — 운영해 본 뒤 후속으로(Deferred).
- **D-07: 문구는 두 줄.** 사용자가 여섯 줄 초안(권고)을 기각하고 짧은 쪽을 골랐다 — 폰 잠금화면 미리보기에 핵심이 다 보여야 한다.
  - 첫 줄: `📢 {보고서명} — {회사명}({종목코드}) · 제출인 {제출인}`  (예: 「📢 공개매수신고서 — 에스텍(069510) · 제출인 ○○홀딩스」)
  - 둘째 줄: DART 원문 링크 + 출처 표기 「금융감독원 전자공시」
  - 보고서명은 DART 표기 그대로(정정이면 「[기재정정]공개매수신고서」, 유상증자면 「주요사항보고서(유상증자결정)」).
- **D-08: 링크는 DART 원문 하나.** GH Trade 종목 화면 링크는 넣지 않는다(기각).
- **D-09: 웹앱에는 보이지 않는다.** 이 phase 는 텔레그램 알림만. 보낸 기록이 DB 에 남으므로 종목 뉴스·공시 목록에 섞는 일은 나중에 별도 작업으로(Deferred).

#### 언제 · 얼마나 빨리 (D-10 ~ D-13)
- **D-10: 확인 간격은 장전 `07:00` ~ `09:00` 5초, 그 밖 `09:00` ~ `20:00` 10초.** 공개매수(D004)와 주요사항보고서 조회가 한 바퀴에 한 번씩 따로 나간다는 전제로 하루 약 **10,800회**(장전 1,440바퀴 × 2 + 그 밖 3,960바퀴 × 2 · 공식 한도의 54% · 예산 15,000 안). 「하루 종일 10초」 · 「공개매수만 종일 5초(약 14,000회)」는 기각. 로드맵의 「5초 × 평일 = 9,360회」 계산은 공개매수 단독 기준이라 이 숫자로 대체한다.
- **D-11: 확인 시간대는 평일 `07:00` ~ `20:00` KST.** 한투 뉴스·공시 수집(Phase 41 D-02)과 같은 창. 밤 · 주말은 조회하지 않는다(DART 접수가 없는 시간). 평일 공휴일은 평일처럼 돈다 — 휴장일 달력을 쓰지 않는다(Phase 41 D-02 와 같음 · 비용은 빈 응답뿐).
- **D-12: 수집기가 멈췄다 다시 켜지면 그날 접수된 건만 늦게라도 알린다.** 지난 날짜 건은 보내지 않는다(며칠 죽어 있다 살아나도 옛 공시가 쏟아지지 않는다). 늦게 보내는 알림에는 **「(늦은 알림)」** 표시를 붙인다. 「전 영업일 것까지」 · 「놓친 건은 안 보냄」 기각.
- **D-13: 알림 목표는 접수 뒤 30초 안**(로드맵 성공 기준 1 초안 유지 — D-10 간격이면 장전 약 5 ~ 10초, 그 밖 약 10 ~ 15초).

#### 텔레그램 방 · 장애 대응 (D-14 ~ D-17)
- **D-14: 단체방 하나에 전부 보낸다.** 공개매수 · 유상증자 · 합병이 같은 방, 전부 소리 나는 일반 알림. 「종류별 방 나눔」 · 「유증/합병은 무음」 기각. 방 id 는 설정값이다(방을 바꾸거나 늘리기 쉽게).
- **D-15: 기존 팀 단체방에 새 봇을 초대한다.** 사용자가 할 일: ① 텔레그램 BotFather 에서 봇을 만들어 토큰 받기 ② 팀 단체방에 봇 초대. 방 id 찾기와 비밀 등록은 준비된 비출력 스크립트를 터미널에서 한 줄 실행. **시험 알림은 운영자 개인 대화로 먼저** 보내 확인한 뒤 방 id 를 단체방으로 바꾼다 — 시험 글이 팀 대화에 섞이지 않게.
- **D-16: 장애는 이메일 + 단체방 양쪽에 알린다.** 다른 수집기처럼 GCP 알림 정책이 운영자 이메일로 알리고(`ops/alert-*.yaml` 선례), 단체방에도 「⚠ 공시 알림이 멈췄습니다」 를 올려 방 사람 모두가 「지금은 알림이 안 온다」 는 것을 안다. 복구되면 「다시 동작」 을 한 번 올린다. 권고안(운영자 개인 대화로만)은 기각.
- **D-17: 「멈췄습니다」 기준은 시간대 구분 없이 5분.** 확인 시간대(D-11) 안에서 DART 조회가 5분 넘게 성공하지 못하면 알린다. 한 번 알린 뒤 반복해서 올리지 않고, 복구 때 한 번. 하루 한도 초과(`020`)로 그 run 을 멈춘 경우도 같은 장애 글로 알린다. 「장전 1분 · 그 밖 5분」(권고) · 「언제든 2분」 기각.

### Claude's Discretion
- **도는 곳:** `workers/kis-news-sync` 와 같은 꼴의 **새 수집기**(평일 창 내내 떠 있는 Cloud Run Job · 임대로 중복 실행 방지 · Scheduler 깨우기)로 잡는다. kis-news-sync 루프에 얹기 · radar-gw 상시 프로세스는 권하지 않는다(「한투」 워커에 다른 자료원이 섞임 / 배포 규율이 다름). 리서치에서 더 나은 자리가 나오면 사용자에게 알린 뒤 바꾼다.
- **「멈춤」 을 누가 알아채나(D-16 · D-17):** 죽은 수집기는 스스로 글을 못 올린다. DART 연속 실패는 수집기 자신이, 수집기 자체의 죽음은 밖에서(다음 Scheduler 깨움 실행이 「마지막 성공 조회가 5분 넘게 전」 임을 보고 알림 · 또는 별도 감시) 잡아야 한다. 구조는 재량. 「멈췄다」 글과 「다시 동작」 글이 짝이 맞도록 상태를 DB 에 둔다.
- **텔레그램 전송 실패:** 재시도하고(텔레그램 `429` 는 응답의 대기 시간을 따른다), 끝내 못 보낸 건은 사유와 함께 로그에 남기고 다음 실행이 이어서 보낸다(로드맵 성공 기준 5 · 무로그 실패 금지). 「알림 송신 권리」 는 DB 가 한 번만 주는 꼴(Phase 40 `dma_push_claim` 선례)을 따르되, 보낸 것으로 찍는 시점과 실제 전송 사이의 유실 창을 어떻게 닫을지는 재량. 텔레그램 자체가 안 될 때는 단체방 장애 글도 못 가므로 이메일 알림이 그 경우를 덮어야 한다.
- **「(늦은 알림)」 판정(D-12):** DART 목록에는 접수 시각이 없다(날짜만). 수집기가 뜬 뒤 첫 조회에서 이미 목록에 있던 건 = 늦은 알림 같은 근사를 쓴다. 정상 아침 시작(`07:00` · 목록 비어 있음)에는 붙지 않아야 한다.
- **첫 배포 날 처리:** 배포 순간 그날 이미 올라와 있던 건은 D-12 대로 「(늦은 알림)」 으로 나간다. 유상증자 · 합병은 건수가 많을 수 있으니 첫 배포는 장 시작 전이나 `20:00` 뒤로 잡거나, 기존 건을 알림 없이 「보냄」 으로 채워 두는 스위치를 둔다.
- **제출인 표기:** 주요사항보고서는 제출인이 회사 자신이다 — 회사명과 같으면 「· 제출인 …」 을 생략해도 된다. 공개매수는 제출인(공개매수자)이 핵심 정보라 항상 표기.
- **시장 구분(D-05):** OpenDART 응답의 법인 구분(`corp_cls`)으로 가를지 `stocks` 마스터 대조로 가를지. 스팩은 합병 공시의 당사자라 걸러내지 않는다.
- **표 · 테이블 모양 · 보관 기간 · 예산 env 이름 · `api_usage` 서비스 키 이름 · 임대 TTL.**
- **메시지 서식:** 텔레그램 링크 미리보기 끄기 여부 · 링크를 글자 뒤에 숨길지 주소 그대로 둘지 — 두 줄 원칙(D-07)과 출처 표기만 지키면 된다.

### Deferred Ideas (OUT OF SCOPE)
- **본문 숫자 덧붙이기** — 공개매수 가격 · 기간 · 수량 / 유상증자 규모 · 발행가 / 합병 비율을 알림에 넣기(OpenDART 공시서류원본파일 · 주요사항보고서 주요정보 API). 운영해 본 뒤 후속(D-06).
- **웹앱 표시** — DART 공시를 종목 「관련 뉴스·공시」 목록에 「공시」 배지로 섞기(D-09).
- **알림에 GH Trade 종목 화면 링크**(D-08).
- **알릴 공시 넓히기** — 무상증자 · 회사분할 · 주식교환/이전 · 전환사채 · 자사주 · 대량보유 보고. 유형 목록이 설정값이라(D-04) 예산이 허락하면 더한다.
- **종류별 방 나누기 · 유증/합병 무음**(D-14 에서 기각 — 방이 시끄러우면 재검토).
- **장전 장애 기준 1분**(D-17 에서 기각 — 장전 공개매수를 놓친 사례가 나오면 재검토).
- **gh-trade 클라에 같은 알림 전달.**
</user_constraints>

<phase_requirements>
## Phase Requirements

요구사항 ID 는 없다(ROADMAP `Requirements: TBD`). 로드맵 성공 기준 1 ~ 7 과 CONTEXT D-01 ~ D-17 을 대상으로 삼는다.

| ID | 내용 | 이 리서치의 근거 |
|----|------|------------------|
| SC-1 | 창 안 새 공시 → 30초 안 단체방 알림 1건(회사 · 종목코드 · 보고서명 · 제출인 · 원문 링크 · 출처) | 확인 6(반영 지연) · Pattern 2(바퀴 루프) · Pattern 6(메시지) · Telegram 계약 |
| SC-2 | 같은 접수번호는 한 번만 | Pattern 4(`dart_alerts` PK `rcept_no` + 임대 보유자만 송신 + 상태 기계) |
| SC-3 | 늦게 떠도 그날 건은 보내고 지난 날짜는 안 쏟아냄 | Pattern 3(오늘 날짜로만 조회 · 「(늦은 알림)」 판정) · 지난 날 pending 은 `expired` |
| SC-4 | 하루 호출 ≤ 15,000 · `api_usage` 기록 · `020` 이면 run 중단 | 확인 2 · 「호출 수 계산」 · Pattern 7(020 → 장애 글 + 탐침 1건) |
| SC-5 | 전송 실패 재시도 · 사유 로그 · 다음 실행이 이어서 | Pattern 4 · Telegram 오류 분류표 |
| SC-6 | 수집기 죽음 · DART 연속 실패를 운영자가 앎 | Pattern 5(장애 짝 글) · 이메일 알림 정책 2개 |
| SC-7 | 첫 실제 공개매수 지연 기록 | 확인 6 · `first_seen_at` · `sent_at` 컬럼 · UAT |
| D-01 ~ D-05 | 알릴 범위 · 시장 | 확인 1 · Pattern 1(감시 대상 목록) · `corp_cls` 필터 |
| D-06 ~ D-09 | 두 줄 문구 · 링크 하나 · 웹앱 없음 | Pattern 6 · Telegram HTML 이스케이프 |
| D-10 ~ D-13 | 5초/10초 · 평일 `07:00` ~ `20:00` · 당일만 · 30초 | 「호출 수 계산」 · 확인 4 · Pattern 3 |
| D-14 ~ D-17 | 단체방 하나 · 봇 초대 · 장애 이메일+단체방 · 5분 | Pattern 5 · 확인 7 · 비밀/방 id 절차 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **공식 API 운영 기준(OpenDART 에 적용):** ① 설계 예산 ≤ 공식 일일 한도의 75% ② 한도 안에서 서버측 주기 폴링 허용(장중 포함) ③ 호출량은 사용자 수와 독립 ④ 일일 한도 소진 신호 시 그 run 즉시 중단 · 재시도로 두드리지 않음 — 이후 run 은 단독 탐침 1건으로만 재확인하고 통과하면 자동 재개(news-sync · kis-news-sync 선례) ⑤ 출처 표기와 원문 링크 항상 노출. [VERIFIED: /Users/alex/repos/gh-radar/CLAUDE.md 「공식 API 운영 기준」]
- CLAUDE.md 의 「공식 API 운영 기준」 머리에는 Naver Search API 의 한도 · 카운터 · 소비처 · 예산 · 주기가 적혀 있다. **이 phase 가 OpenDART 를 두 번째 공식 API 로 더하므로 같은 꼴의 짧은 블록(한도 20,000/일 · 예산 15,000 · 카운터 키 · 소비처 · 주기)을 CLAUDE.md 와 `docs/stack.md` 에 더하는 작업을 계획에 넣는다**(새 source 추가 시 분류 점검 지시).
- 배포: 백엔드는 Cloud Run(컨테이너) — 이 phase 는 Cloud Run Job 하나.
- GSD 워크플로 강제 · 커밋 메시지 한글 · Co-Authored-By 금지(사용자 전역 규칙).
- 자동 메모리에서 이 phase 에 걸리는 규칙(모두 [VERIFIED: MEMORY.md 색인]):
  - 비밀 쓰기는 사용자가 `! bash …` 로 실행하는 비출력 스크립트(분류기 차단).
  - 서브에이전트(executor)는 커밋까지만 — 배포 · `supabase db push` 는 메인 세션.
  - 배포 명령은 허용 규칙 접두사 그대로(`supabase db push --linked --yes` 꼴 · 파이프 금지).
  - 워커 배포 스크립트 env: `GCP_PROJECT_ID` + `SUPABASE_URL` 필수.
  - Supabase RPC 는 `REVOKE … FROM anon, authenticated` 명시 · 새 표 RLS.
  - 무로그 fail-safe 금지 — catch 마다 사유 로깅.
  - 동시 세션이면 `vitest --maxWorkers=2`(이미 vitest.config 기본값).
  - 보안 검사(`/gsd-secure-phase`) 생략 · `security_enforcement=false` — 이 문서도 Security Domain 절을 생략한다.

---

## 리서치 확인 7건 (CONTEXT `<specifics>` 1 ~ 7)

### 1. 주요사항보고서 유형 코드 · 보고서명 표기 · D-04 이름 규칙

- **유형 코드:** 주요사항보고서 = `pblntf_detail_ty=B001`(대분류 `B` 「주요사항보고」). 같은 대분류의 `B002` 「주요경영사항신고(자본시장법 이전)」 · `B003` 「최대주주등과의거래신고(자본시장법 이전)」 는 옛 제도라 쓸 일이 없다. [CITED: opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001]
- **공개매수 코드:** `D004` 「공개매수」(대분류 `D` 지분공시 — D001 대량보유 · D002 임원·주요주주 소유 · D003 의결권대리행사권유 · D005 거래계획보고서와 같은 대분류). [CITED: 같은 쪽]
- **보고서명 꼴:** 주요사항보고서는 `주요사항보고서(<종류>)` 꼴이다 — 예 「주요사항보고서(회사합병결정)」(아시아나항공 · NHN 사례가 공개 공시 집계에 이 이름으로 실림 [CITED: stockhub.kr 집계 · AI 요약 사이트라 이름 표기만 참고]). 정정은 앞에 대괄호 꼬리표가 붙는다: OpenDART 문서가 `report_nm` 에 붙을 수 있는 꼬리표로 「기재정정 · 첨부정정 · 첨부추가 · 변경등록 · 연장결정 · 발행조건확정 · 정정명령부과 · 정정제출요구」 를 든다. [CITED: opendart 공시검색 문서 `report_nm` 설명] 실제 표기 예: 「[기재정정]주요사항보고서(회사합병결정)」(SK아이이테크놀로지 사례 [CITED: knowingasset.com 집계 · 원문 대조 필요]).
- **D-04 글자 규칙의 문제(사용자 보고 필요):**
  - **놓치는 것:** 「유무상증자결정」 — 글자 「유상증자」 를 포함하지 않는다(유-무-상-증-자). D-04 가 대상으로 명시한 종류인데 부분 글자 규칙이면 빠진다. [VERIFIED: 문자열 자체 — 「유무상증자」 ⊅ 「유상증자」]
  - **잘못 잡을 위험:** B001 안에서는 낮다. 「합병등종료보고서」 는 `E003`(기타공시)이고 「증권신고(합병등)」 은 `C004`(발행공시)라 B001 조회에 애초에 안 들어온다. [CITED: opendart 코드표 E003 · C004] 「합병등종료보고서 (합병)」 이 실제 DART 이름으로 제출된 사례(2026-11 SNT모티브)도 확인됐다 — B001 이 아니므로 무관. [CITED: specialtimes.co.kr 2026-11 보도] 다만 B001 안에 「합병」 · 「증자」 글자를 품은 다른 종류(예: 자본시장법 개정으로 생기는 새 종류명)가 생기면 부분 글자 규칙은 조용히 범위를 넓힌다.
- **권장 규칙(설정값 목록 · 코드 상수):**
  1. `report_nm` 을 trim · 연속 공백 1칸으로 정리한다(표시는 DART 원문 그대로 — 정리본은 비교용).
  2. 맨 앞의 대괄호 꼬리표를 반복해서 떼어 낸다: `^(\[[^\]]*\]\s*)+`.
  3. 남은 이름이 `^주요사항보고서\s*\((.+)\)$` 에 맞으면 괄호 안 종류명을 꺼내 공백을 지운다.
  4. 종류명이 **허용 목록** `["유상증자결정", "유무상증자결정", "회사합병결정", "회사분할합병결정"]` 중 하나와 **완전히 같으면** 알린다.
  5. 맞지 않았는데 이름에 `증자` 또는 `합병` 이 들어 있으면 **「근접 불일치」 warn 로그**(종류명 · 접수번호, 같은 종류명은 실행당 1번) — 새 표기나 예상 밖 종류가 생기면 사람이 보고 목록에 더한다. 알리지는 않는다.
  - 공개매수(D004)는 이름으로 거르지 않는다(D-01).
  - 무상증자결정 · 회사분할결정 · 주식교환ㆍ이전결정 · 전환사채권발행결정 · 자기주식취득결정 · 영업양수결정 등은 허용 목록에 없으므로 자동으로 빠진다(D-04 제외 목록과 일치).
- **[미실측 — 키 등록 뒤 스모크/첫 운영 건에서 확인]** 최근 한 달 B001 실제 종류명 분포(괄호 안 표기가 위 4개와 글자까지 같은지 · 가운뎃점 「ㆍ」 같은 특수 문자). 탐침(키는 변수로만 · 출력 금지 · 약 15 ~ 30회 호출):
  ```bash
  KEY="$(gcloud secrets versions access latest --secret=gh-radar-opendart-key --project=gh-radar)"; for p in $(seq 1 30); do curl -s "https://opendart.fss.or.kr/api/list.json?crtfc_key=${KEY}&bgn_de=20261013&end_de=20261112&pblntf_detail_ty=B001&page_count=100&page_no=${p}"; sleep 1; done | jq -r 'select(.status=="000") | .list[] | [.rcept_dt,.corp_cls,.report_nm] | @tsv' > /tmp/b001-month.tsv; unset KEY; cut -f3 /tmp/b001-month.tsv | sed -E 's/^(\[[^]]*\])+//' | sort | uniq -c | sort -rn | head -60
  ```
  (`total_page` 를 넘는 쪽은 `013` 으로 비어 돌아오므로 `select(.status=="000")` 로 걸러진다. 계획에서는 이 탐침을 `scripts/dart-alert-report.sh survey` 로 저장소에 두는 것을 권한다.)

### 2. D004 와 주요사항보고서를 한 번의 호출로 받을 수 있나 → **아니다. 한 바퀴 2회 전제 유지**

- `pblntf_ty` 는 STRING(1) 글자 하나, `pblntf_detail_ty` 는 STRING(4) 코드 하나다. D004 는 대분류 D, B001 은 대분류 B 라 어느 쪽 한 값으로도 둘을 같이 담을 수 없다. [CITED: opendart 공시검색 요청 인자 표]
- `pblntf_ty=D` 로 넓히면 대량보유(D001) · 임원소유(D002)까지 와서 하루 수백 ~ 수천 건이 되어 100건 쪽 한계를 넘는다 — 공개매수 1건을 보려고 여러 쪽을 읽어야 한다. [ASSUMED: 지분공시 하루 건수 규모]
- 유형 필터 없는 호출 1회(전 공시)는 호출 수는 절반이지만, 하루 전체 공시(정기 · 지분 · 거래소 · 펀드 공시까지)가 섞여 분기보고서 마감일 같은 날에는 10초 사이 새 건이 100건을 넘을 수 있고, 같은 날짜 안 정렬 순서가 문서에 없어(확인 5) 「첫 쪽만 보면 새 건이 다 있다」 를 보장할 수 없다. 쪽을 더 읽으면 절약분이 사라진다. **권하지 않는다.**
- 결론: D-10 의 「공개매수 1회 + 주요사항보고서 1회 = 한 바퀴 2회 · 하루 10,800회」 그대로.

### 3. 유상증자 · 합병 알림이 하루 몇 건인가 → **추정 하루 약 3 ~ 10건(정정 포함) · 미실측**

- 공개 집계: 예탁결제원 자료 인용 보도 — 2025년 5월 ~ 11월 6개월 유상증자 코스피 35건 · 코스닥 184건(직전 6개월 50건 · 220건). [CITED: heraldk.com 2025-11-16 「유상증자 80% 이상 줄었다」] → 결정 기준 월 약 37 ~ 45건 · 거래일당 약 2건. 이 수는 발행 완료 기준이라 결정 공시 수와 정확히 같지 않다.
- 정정(`[기재정정]`)이 붙는다: 3자배정 유상증자는 납입일 연기 정정이 잦고, 공모 유상증자는 발행가 확정 정정이 붙는다 — 한 건당 정정 1 ~ 3회로 보면 유상증자만 하루 4 ~ 8건. [ASSUMED]
- 합병결정(스팩 합병 · 계열사 소규모 합병 포함)은 월 10건 안팎 + 정정으로 추정. [ASSUMED]
- 공개매수(D004)는 한 건이 신고서 · 설명서 · 정정 · 의견표명서 · 결과보고서로 5건 이상 나오지만 월 몇 건 수준이다(11월 신고서 4건 — 로드맵 Goal ⑥). [VERIFIED: ROADMAP.md Phase 43 Goal ⑥]
- **사용자 보고 권장:** 「하루 평균 5건 안팎, 많은 날 10건 이상 · 대부분 유상증자와 그 정정」 으로 예상. 시끄러우면 「정정 공시는 빼기」 가 허용 목록 설정 한 줄로 가능하다(D-04 설정값 목록 덕) — 지금 결정할 일은 아니고 첫 주 운영 뒤 판단.
- **[미실측]** 실제 한 달 건수: 확인 1 의 탐침 출력으로 같이 센다 — `awk -F'\t' '$2=="Y"||$2=="K"' /tmp/b001-month.tsv | grep -E '\((유상증자결정|유무상증자결정|회사합병결정|회사분할합병결정)\)' | cut -f1 | sort | uniq -c`.

### 4. DART 접수 시작 · 마감 시각 → **`07:30` ~ `19:00` 제출 가능 · `07:00` ~ `20:00` 창이 덮는다**

- 「현재 전자공시시스템(다트) 전자문서 제출 가능시간은 오전 7시30분부터 오후 7시다.」 · 「오후 6시이후 제출된 서류는 다음날 접수, 공시하고 있다.」 · 증권신고서는 2023-08-01 부터 오후 7시까지 당일 접수로 연장. [CITED: news.bizwatch.co.kr 2023-07-27 기사] 2026 현재 규정 원문은 확인하지 못했다(공지 미발견).
- 로드맵 실측: 11월 공개매수신고서 4건 접수 07:30 · 07:35 · 07:49 · 08:03 — 「07:30 시작」 과 맞는다. [VERIFIED: ROADMAP.md Goal ⑥]
- **따라서 `07:00` ~ `20:00` 창은 제출 가능 시간 전체를 앞뒤 여유를 두고 덮는다.** `07:00` ~ `07:30` 의 조회(하루 720회)는 대개 빈 응답(`013`)이지만 D-10/D-11 이 잠겨 있으므로 그대로 둔다.
- **함정:** 「18시 이후 제출 = 다음날 접수」 이면, 전날 저녁에 낸 서류가 **다음날 날짜로** 다음날 아침 목록에 나타난다. 이 건들이 `07:00` 첫 조회나 `07:30` 전후에 목록에 「갑자기」 생겨도 정상 신규로 보내야 하며(트레이더에겐 처음 보는 공시) 「(늦은 알림)」 을 붙이면 안 된다 — 확인 3 의 「첫 조회에 이미 있던 건 = 늦은 알림」 같은 단순 근사가 여기서 틀린다. Pattern 3 의 판정 규칙이 이 경우를 피한다.
- **[미실측]** 전날 저녁 서류가 다음날 목록에 몇 시에 나타나는지(00:00 인지 07:30 인지). 첫 운영 주에 `dart_alerts.first_seen_at` 이 07:00 ~ 07:30 인 건을 보면 안다.

### 5. 주요사항보고서가 100건을 넘는 날 `page_count` · 정렬 위험 → **같은 날짜 안 순서는 문서에 없다 · `total_count` 로 막는다**

- 인자: `page_count` 1 ~ 100(기본 10 · 최대 100), `page_no` 1 부터, `sort` = `date`(접수일자 · 기본) · `crp`(회사명) · `rpt`(보고서명), `sort_mth` = `asc` · `desc`(기본 `desc`). 응답 머리: `page_no` · `page_count` · `total_count` · `total_page`. [CITED: opendart 공시검색 문서]
- **핵심:** `sort=date` 의 키는 **접수일자(날짜)** 다. 오늘 하루만 조회하면 모든 행의 정렬 키가 같아서 **같은 날짜 안에서 어떤 순서로 오는지는 문서에 없다.** 실측상 최신이 위일 가능성이 크지만(로드맵 ⑤ 실측에서 새 건이 바로 보임) 계약이 아니다. [CITED: 문서에 같은 날짜 내 정렬 규칙 없음 — 「없음」 은 문서 침묵이므로 순서 보장 여부는 ASSUMED]
- **권장 방식(순서에 기대지 않는다):**
  1. 매 바퀴 1쪽(`page_count=100` · `page_no=1`)을 읽는다.
  2. `total_count ≤ 100` 이면 그날 목록 전체가 손에 있다 — 순서 무관, 끝.
  3. `total_count > 100` 이면 **`total_count` 가 지난 바퀴보다 늘었을 때만** 같은 바퀴에서 `page_no=2 … total_page` 를 마저 읽는다(그날 이 유형이 처음 100건을 넘은 뒤에만 생기는 일). 덧붙여 60초마다 한 번은 늘지 않았어도 전 쪽을 다시 읽는다(삭제 1 + 신규 1 이 같은 바퀴에 겹쳐 수가 그대로인 드문 경우의 그물).
  4. 추가 쪽 호출도 `api_usage` 에 센다. 예산 여유 4,200회(15,000 − 10,800)가 이 몫이다.
- D004 는 하루 수 건이라 1쪽으로 늘 충분하다. 같은 규칙을 감시 대상 공통으로 쓰면 된다.
- **[미실측]** B001 하루 건수(전 법인 · 비상장 포함)가 100건을 넘는 날이 실제로 있는지. 확인 1 탐침 출력의 날짜별 수: `cut -f1 /tmp/b001-month.tsv | sort | uniq -c | sort -rn | head` (비상장 `E` 포함 전체 수 — `corp_cls` 필터 전).

### 6. 주요사항보고서 유형의 API 반영 지연 → **미실측 · 운영 첫 건으로 잰다**

- 로드맵 ⑤ 실측(12:45 ~ 13:10 · 새 공시 8건 · 유형 불문): API 와 DART 사이트 최근공시에 같은 순간 보임(차이 −4 ~ +2초) · 719회 오류 0 · 응답 약 120ms. 장전 · 지분공시(D004) · 주요사항보고서(B001) 표본 없음. [VERIFIED: ROADMAP.md Goal ⑤]
- **[미실측 — 첫 운영 건에서 확인]** 기록 장치: `dart_alerts` 에 `first_seen_at`(수집기가 처음 본 시각) · `sent_at`(텔레그램 200 받은 시각) · `telegram_message_id` 를 남긴다. DART 사이트 「오늘의 공시」 는 분 단위 시각을 보여 주므로, 첫 공개매수 · 첫 B001 알림 때 사람이 DART 표기 시각을 적고 아래 쿼리 값과 대조해 phase UAT 에 기록한다(로드맵 SC-7 을 B001 로도 넓힌다):
  ```sql
  select rcept_no, watch, report_nm, first_seen_at at time zone 'Asia/Seoul' as seen_kst,
         sent_at at time zone 'Asia/Seoul' as sent_kst, late
    from public.dart_alerts where rcept_dt = (now() at time zone 'Asia/Seoul')::date order by first_seen_at;
  ```

### 7. 일반 그룹 → 슈퍼그룹 전환 시 방 id 변경 → **400 응답의 `migrate_to_chat_id` 로 그 자리에서 다시 보내고, error 로그로 이메일**

- 일반 그룹이 슈퍼그룹으로 바뀌면 방 id 가 바뀐다(일반 그룹은 음수 id, 슈퍼그룹은 `-100…` 꼴). 옛 id 로 `sendMessage` 하면 HTTP 400 · `ok:false` · `description` 「Bad Request: group chat was upgraded to a supergroup chat」 과 함께 `parameters.migrate_to_chat_id` 가 온다. [CITED: core.telegram.org/bots/api `ResponseParameters.migrate_to_chat_id` 「The group has been migrated to a supergroup with the specified identifier.」] (설명 문구 원문은 커뮤니티 보고 — [ASSUMED])
- **권장 처리:**
  1. 송신기는 응답 본문의 `parameters.migrate_to_chat_id` 가 있으면 **그 id 로 같은 글을 즉시 한 번 다시 보낸다**(유실 0). 텔레그램이 준 값이라 믿어도 된다.
  2. 그 실행이 끝날 때까지 메모리에서 새 id 를 쓴다.
  3. **error 레벨 로그** 「telegram chat migrated — TELEGRAM_CHAT_ID 비밀을 새 방 id 로 바꿀 것」(새 id 는 끝 4자리만) → 로그 일치 알림 정책이 이메일을 보낸다(Pattern 5). 비밀을 고치기 전까지 매 실행 첫 송신마다 같은 일이 반복되므로 조용히 묻히지 않는다.
  4. 방 id 를 DB 에 자동으로 덮어쓰지는 않는다 — 비밀(Secret Manager)이 정본이고, 사용자가 `setup` 스크립트를 다시 돌려 고친다(D-14 「방 id 는 설정값」).
- 방 id 찾기 도우미가 `type` 을 함께 보여 주고, `group`(일반 그룹)이면 「이 방은 나중에 슈퍼그룹으로 바뀌면 id 가 바뀐다 — 위 처리가 덮는다」 를 안내한다.
- 같은 꼴의 「조용히 끊김」 원인들도 같은 error 로그 경로로 보낸다: 403(봇이 방에서 내보내짐 · 방 권한 「관리자만 글쓰기」) · 400 「chat not found」 · 401(토큰 무효). 표는 「API 계약」 절.

---

## 로드맵에서 고칠 줄 (플래너가 패치)

[VERIFIED: /Users/alex/repos/gh-radar/.planning/ROADMAP.md 줄 번호 — 2026-11-12 읽음]

| 줄 | 지금 | 고칠 내용 |
|----|------|-----------|
| 73 | 체크리스트 한 줄 「공개매수신고서 · 공개매수설명서가 접수되면 … `pblntf_detail_ty=D004` 로 … 폴링」 | 공개매수 유형 전부 + 유상증자 · 합병 주요사항보고서(`B001`) · 두 줄 문구 · 원문 링크 |
| 670 | 제목 「Phase 43: 공개매수 공시 텔레그램 알림」 | 예: 「공개매수 · 유상증자 · 합병 공시 텔레그램 알림」(디렉터리 이름은 그대로) |
| 672 | Goal 첫 문장 「공개매수신고서가 DART 에 접수되면」 · 운영 분류 괄호 「(5초 주기 × 평일 07:00 ~ 20:00 = 9,360회)」 | 공개매수 · 유상증자 · 합병 · 「장전 5초 · 그 밖 10초 × 2유형 = 약 10,800회」 |
| 674 | `Requirements: TBD` | 요구사항 ID 를 만들지 않으면 그대로 두되 「CONTEXT D-01 ~ D-17」 참조 |
| 675 | 「Success Criteria (초안 — discuss 에서 확정)」 | 「(확정 2026-11-12)」 |
| 676 | SC-1 「새 공개매수신고서」 · 항목 목록 | 「공개매수 유형 보고서 · 유상증자/합병 결정 주요사항보고서(코스피 · 코스닥)」 · 두 줄 문구 |
| 679 | SC-4 「15,000회 이하」 | 설계 약 10,800회(54%) · 상한 15,000 명시 |
| 681 | SC-6 「생존 표시 · 알림 방식은 discuss」 | 이메일 + 단체방 「⚠ 멈췄습니다」/「다시 동작」 · 5분 기준(D-16 · D-17) |
| 682 | SC-7 공개매수만 | 첫 B001 알림도 같이 기록 |
| 685 | 「미결 결정(discuss 에서)」 ② ~ ⑨ | 「CONTEXT D-01 ~ D-17 이 답」 한 줄로 |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| DART 고정 주기 조회 · 거르기 · 메시지 조립 | 백엔드 워커(Cloud Run Job) | — | 서버측 배치 · 사용자 수와 무관(운영 기준 ③). server · webapp 은 관여하지 않는다 |
| 「한 번만」 · 이어서 보냄 · 장애 짝 상태 | Database(Supabase 표 + RPC) | 워커 | 재시작 · 중복 실행에도 같은 판정이 나와야 하므로 정본은 DB(Phase 40 D-07 와 같은 이유) |
| 중복 실행 방지 | Database(임대 RPC) | Cloud Scheduler | kis-news-sync 와 같은 임대 + 5분 깨움 |
| 호출 수 · 예산 | Database(`api_usage`) | 워커(메모리 묶음) | 기존 카운터 재사용 |
| 텔레그램 송신 | 백엔드 워커 → Telegram Bot API | — | 봇 토큰은 워커 SA 만 접근 |
| 운영자 이메일 장애 알림 | GCP Cloud Monitoring | Cloud Logging | 텔레그램이 죽은 경우까지 덮는 독립 경로 |
| 비밀 · 방 id | Secret Manager | 사용자 `!` 스크립트 | 비출력 등록 |

## Standard Stack

### Core (모두 이미 저장소에 있음 — 새 설치 없음)
| Library | Version (설치본) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| axios | 1.15.0 | OpenDART · Telegram HTTP | kis-news-sync 와 같은 HTTP 클라이언트 — 오류 분류 · `safeErrorFields` 꼴 재사용 [VERIFIED: workers/kis-news-sync/node_modules/axios/package.json] |
| pino | 9.14.0 | JSON 로그 + redact | Cloud Logging `jsonPayload.level` 로 알림 정책이 건다 [VERIFIED: 같은 방법] |
| @supabase/supabase-js | 2.103.2 | 서비스롤 RPC · 표 | 다른 워커와 같음 [VERIFIED: 같은 방법] |
| dotenv | 16.6.1 | 로컬 실행 env | `config.ts` 첫 줄 [VERIFIED: 같은 방법] |
| vitest | 3.2.4 (dev) | 단위 · 가짜 시계 테스트 | 기존 워커 테스트 틀 [VERIFIED: 같은 방법] |
| Node 22 (alpine) | `node:22-alpine` | 런타임 | kis-news-sync Dockerfile 과 같음 [VERIFIED: workers/kis-news-sync/Dockerfile] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| axios | Node 내장 `fetch` | 의존성 0 이지만 kis-news-sync 의 `safeErrorFields`/`isAxiosError` 꼴과 갈라진다. 같은 저장소 안 일관성을 택한다 |
| 직접 호출 | `node-telegram-bot-api` · `telegraf` · `grammy` | `sendMessage` 한 메서드만 쓰므로 SDK 는 과하다(폴링 · 웹훅 · 미들웨어 불필요). 새 패키지 = 새 공급망 위험 |
| 새 워커 | kis-news-sync 루프에 흐름 추가 | 「한투」 워커에 다른 자료원 · 비밀 · 출력이 섞이고 한쪽 장애가 다른 쪽을 끈다. **새 워커 유지(CONTEXT 재량 기본값 그대로 — 더 나은 자리 없음)** |
| 새 워커 | radar-gw 상시 프로세스 | 배포 · 로그 · 알림 경로가 Cloud Run 워커들과 다르고 VM 재부팅 · 네트워크 장애(서울 엣지 끊김 메모리)에 묶인다. 이점 없음 |

**Installation:** 새 워크스페이스 패키지 `workers/dart-alert` 의 `package.json` 에 kis-news-sync 와 같은 의존성 목록을 적고 `pnpm install`(lockfile 의 기존 버전 재사용 · 새 패키지 다운로드 없음).

## Package Legitimacy Audit

이 phase 는 **새 외부 패키지를 설치하지 않는다** — 새 워크스페이스는 이미 lockfile 에 있는 `axios` · `pino` · `@supabase/supabase-js` · `dotenv` · `tsx` · `typescript` · `vitest` · `@types/node` 만 쓴다(kis-news-sync `package.json` 과 같은 목록). 텔레그램 SDK 는 넣지 않는다.

| Package | Registry | Verdict | Disposition |
|---------|----------|---------|-------------|
| (새 패키지 없음) | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Cloud Scheduler  "*/5 7-19 * * 1-5" (Asia/Seoul)
      │  5분마다 jobs:run (OAuth)
      ▼
Cloud Run Job gh-radar-dart-alert  ── 실행 시작 ──► 임대 RPC ─ 못 잡음 ─► 종료 0 (다른 실행이 도는 중)
      │ 잡음
      ▼
 시작 점검: 오늘 strike? ─ 예 ─► 탐침 1회 ─ 실패 ─► 장애 열림 유지 · 종료 1
      │                                  └ 성공 ─► 계속
      │ 마지막 성공 조회가 5분 넘게 전? ─ 예 ─► 장애 열기(DB 원자) ─► 「⚠ 멈췄습니다」 송신
      ▼
 ┌──────────── 바퀴 (장전 5초 · 그 밖 10초 · KST 20:00 이면 끝) ────────────┐
 │  OpenDART list.json  D004 (오늘) ─┐                                       │
 │  OpenDART list.json  B001 (오늘) ─┤─► status 000/013 = 성공 · 그 밖 = 분류 │
 │                                   ▼                                       │
 │        corp_cls ∈ {Y,K} · stock_code 있음 · 감시 대상 규칙                │
 │                                   ▼                                       │
 │        처음 보는 접수번호? (메모리 집합) ─ 예 ─► 새 건 넣기 RPC            │
 │                                   │         (PK rcept_no · late 판정)     │
 │                                   ▼                                       │
 │        송신 차례 RPC(pending→sending, 임대 보유자만) ─► Telegram sendMessage │
 │              200 ─► sent · 429 ─► retry_after 대기 · 400 migrate ─► 새 id 재송신 │
 │              그 밖 ─► pending 으로 되돌림 + 사유 · 오래되면 error 로그     │
 │        장애 열림 중 첫 성공 ─► 장애 닫기(DB 원자) ─► 「다시 동작」          │
 │  30초마다: 임대 연장 + last_ok 기록 · 10초마다: api_usage 묶음 더하기      │
 └───────────────────────────────────────────────────────────────────────────┘
      │ 020 · 자체 예산 소진 · 키 오류(010/011/012/901) ─► strike 기록 · 장애 열기 · 종료 1
      ▼
 Cloud Logging (pino JSON) ─► 알림 정책 ① 실행 실패 수 > 0  ② error 로그 일치 ─► 운영자 이메일
```

### Recommended Project Structure
```
workers/dart-alert/
├── src/
│   ├── index.ts            # Job 진입점 — kis-news-sync index.ts 복제(holder · SIGTERM · 종료 코드)
│   ├── config.ts           # env 계약(비밀 3 · 예산 상한 15,000 · 모드 auto|probe|seed|test-send)
│   ├── logger.ts           # pino + redact(crtfc_key · botToken · url · 헤더 · config)
│   ├── watches.ts          # 감시 대상 목록 상수(D-04 「설정값 목록」) + 거르기 순수 함수
│   ├── cadence.ts          # KST 창 · 바퀴 간격(5초/10초/창 밖 null) · 호출 수 계산
│   ├── apiUsage.ts         # kis-news-sync apiUsage.ts 복제(서비스 키만 다름)
│   ├── collector.ts        # 바퀴 루프 · 임대 · 예산 · 장애 판정 · late 판정
│   ├── dart/client.ts      # list.json 호출 · status 분류 · 쪽 넘김(total_count)
│   ├── telegram/client.ts  # sendMessage · 오류 분류(429 · migrate · 403 · 401)
│   ├── message.ts          # 두 줄 HTML 문구 · 이스케이프 · 제출인 생략 규칙 · 장애 글
│   └── services/supabase.ts
├── tests/                  # 아래 Validation Architecture 의 파일들 + fixtures/
├── Dockerfile · package.json · tsconfig.json · vitest.config.ts   # kis-news-sync 복제
supabase/migrations/2026111xxxxxxx_dart_alert.sql   # 표 2 · RPC 5 ~ 6 · 권한
supabase/tests/dart_alert.test.sql                  # pgTAP
scripts/deploy-dart-alert.sh · setup-dart-alert-iam.sh · setup-dart-alert-secrets.sh
scripts/smoke-dart-alert.sh · telegram-find-chat.sh · dart-alert-report.sh(survey · stats)
ops/alert-dart-alert-failure.yaml · ops/alert-dart-alert-error-log.yaml
```
(이름은 재량 권고 — `dart-alert` 대신 `disclosure-alert` 등도 가능. 아래는 이 이름으로 쓴다.)

### Pattern 1: 감시 대상 목록 = 설정값 (D-04 · D-05)

**What:** 조회 인자와 거르기 규칙을 데이터로 둔다. 바퀴 루프는 목록을 순서대로 돈다. 유형을 더하면 목록에 한 줄 + 예산 테스트가 하루 호출 수를 다시 계산해 15,000 을 넘으면 실패한다.
```typescript
// workers/dart-alert/src/watches.ts — 제안 (이름 · 키는 재량)
export interface Watch {
  id: "tender_offer" | "rights_merger";
  /** list.json 인자 — 유형 하나 */
  pblntfDetailTy: "D004" | "B001";
  /** 송신 우선순위(작을수록 먼저) */
  priority: number;
  /** null = 이름으로 거르지 않음(D-01) */
  b001Kinds: readonly string[] | null;
}
export const WATCHES: readonly Watch[] = [
  { id: "tender_offer",  pblntfDetailTy: "D004", priority: 0, b001Kinds: null },
  { id: "rights_merger", pblntfDetailTy: "B001", priority: 1,
    b001Kinds: ["유상증자결정", "유무상증자결정", "회사합병결정", "회사분할합병결정"] },
];
/** D-05: corp_cls 는 Y(유가) · K(코스닥)만, 종목코드 6자리 필수. 스팩은 K 라 그대로 통과 */
export const ALLOWED_CORP_CLS = new Set(["Y", "K"]);
const TAGS = /^(\[[^\]]*\]\s*)+/;
const B001 = /^주요사항보고서\s*\((.+)\)$/;
export function b001Kind(reportNm: string): string | null {
  const name = reportNm.trim().replace(/\s+/g, " ").replace(TAGS, "");
  const m = B001.exec(name);
  return m ? m[1].replace(/\s+/g, "") : null;
}
```
- `corp_cls` 는 응답에 실린 값으로 가른다(재량 「시장 구분」 의 답): 접수 시점 DART 값이 정본이고 왕복이 없다. `stocks` 마스터 대조는 불필요. `corp_cls` 요청 인자는 값 하나만 받으므로(문서 「Y(유가), K(코스닥), N(코넥스), E(기타)」 · 커뮤니티 「복수조건 불가」) 요청에서 거르면 호출이 2배가 된다 — 응답에서 거른다. [CITED: opendart 문서 · algolab.co.kr]
- 공개매수 목록 행의 회사 = **대상회사**(종목코드 · 법인구분이 대상회사 것), `flr_nm` = 제출인(신고서 · 설명서는 공개매수자, 의견표명서는 대상회사 자신). [VERIFIED: ROADMAP Goal ④ 「대상회사 종목코드 · 보고서명 · 제출인 · 접수번호가 실린다」 — 의견표명서 제출인은 ASSUMED]

### Pattern 2: 바퀴 루프 (kis-news-sync 걸음 루프 단순화)

**What:** 걸음(200ms) 루프 대신 「다음 바퀴 시각」 고정 간격. 바퀴 시작 시각을 간격의 배수로 잡아(시작 대 시작) 하루 호출 수가 산수대로 나온다.
- 간격 함수: KST 분 m 이 `420 ≤ m < 540` → 5,000ms · `540 ≤ m < 1200` → 10,000ms · 그 밖 · 주말 → null(끝). kis-news-sync `cadence.ts` 의 +9h · `getUTC*` 방식 그대로(TZ 비의존). [VERIFIED: workers/kis-news-sync/src/pipeline/cadence.ts:25-35 「const KST_OFFSET_MS = 9 * 3_600_000;」 · 「return t.getUTCHours() * 60 + t.getUTCMinutes();」]
- 한 바퀴 = 감시 대상 순서대로 각 1회(+필요 시 추가 쪽) → 새 건 넣기 → 송신 차례 → 다음 바퀴까지 abortable sleep(kis-news-sync `abortableSleep` 복제 · index.ts:38-50).
- 임대: kis-news-sync 값 그대로 — 「export const LEASE_TTL_S = 90;」 · 「export const LEASE_RENEW_MS = 30_000;」 [VERIFIED: workers/kis-news-sync/src/collector.ts:48-49]. 연장 RPC 가 `last_ok_at`(감시 대상별) 도 같이 적는다(왕복 추가 0).
- 사용량: 「export const USAGE_FLUSH_MS = 10_000;」 [VERIFIED: collector.ts:55] 와 `UsageCounter`(apiUsage.ts:86-108) 복제 — 호출마다 RPC 를 부르지 않고 10초 묶음. 하루 RPC 약 4,700회(창 46,800초 ÷ 10).
- **호출 수 계산(테스트로 고정):** 장전 7,200초 ÷ 5 = 1,440바퀴, 그 밖 39,600초 ÷ 10 = 3,960바퀴, 합 5,400바퀴 × 감시 대상 2 = **10,800회**(공식 20,000 의 54%). 남는 4,200회가 추가 쪽 · 탐침 몫. 예산 env 기본값 15,000 · 설정 검증 상한 15,000(넘으면 시작 안 함 — kis-news-sync `intEnv` 꼴 · config.ts:52-61).

### Pattern 3: 「(늦은 알림)」 판정 (D-12)

**What:** 「덮지 못한 시간」 을 잰다. 처음 본 순간 그 감시 대상의 **커버 기준점**에서 지금까지가 60초를 넘으면 늦은 건이다.
- 커버 기준점 = 그 감시 대상의 **오늘(KST) 마지막 성공 조회 시각**(DB `last_ok_at` · 메모리 값 우선). 오늘 성공 조회가 없으면 **`07:00` + 시작 여유 120초**(Scheduler 07:00 발화 → Job 기동 30 ~ 60초를 흡수).
- `late = (지금 − 커버 기준점) > 60초` — 정상 바퀴(5초/10초)는 절대 안 걸리고, 수집기 교대(임대 TTL 90초 + 다음 깨움까지)는 늘 걸린다.
- 추가로 **송신 지연 규칙**: 보내는 순간 `지금 − first_seen_at > 60초` 이면(텔레그램 장애로 미뤄진 건) 역시 「(늦은 알림)」.
- 정상 아침: 07:00 첫 바퀴 → 기준점 = 07:02 → 07:00 ~ 07:02 사이 첫 조회는 늦지 않음 → 전날 저녁 서류가 07:30 에 나타나도 바로 전 바퀴가 성공이었으므로 늦지 않음(확인 4 함정 회피).
- 09:30 에 처음 뜬 실행(아침 장애): 기준점 07:02 → 그날 이미 있던 건 전부 「(늦은 알림)」.
- 장중 재배포(실행 취소 → 다음 깨움이 임대 인계): 인계 사이에 들어온 건만 「(늦은 알림)」.
- 지난 날짜: 조회 자체가 `bgn_de = end_de = 오늘(KST)` 라 지난 날 건은 오지 않는다. DB 에 남은 지난 날 `pending`/`sending` 은 시작 때 `expired` 로 닫는다(보내지 않음).
- **첫 배포 스위치:** `DART_ALERT_MODE=seed` 1회 실행 — 그날 목록을 읽어 맞는 건을 `seeded` 상태로 넣고 **송신 0** 으로 끝난다. 장중 첫 배포면 이것을 먼저 돌린 뒤 Scheduler 를 켠다(아니면 D-12 대로 그날 건이 「(늦은 알림)」 으로 나간다). 권장 배포 시각은 평일 `20:00` 뒤 또는 `07:00` 전 — 그러면 seed 가 필요 없다.

### Pattern 4: 「한 번만」 + 「이어서 보냄」 상태 기계 (SC-2 · SC-5)

**What:** 표 `dart_alerts` 의 PK 가 `rcept_no` 다 — 같은 접수번호는 한 행뿐(넣기 RPC 는 `ON CONFLICT DO NOTHING` 하고 **새로 들어간 행만** 돌려준다). 송신 권리는 상태 전이로 준다.

```
(새 건) ─ 넣기 ─► pending ─ 차례 RPC(임대 보유자) ─► sending ─ 200 ─► sent
                     ▲                                 │
                     └──── 실패(사유 · 다음 시도 시각) ─┘
   seed 모드 ─► seeded(보내지 않음)      지난 날짜 pending/sending ─► expired
```
- **유실 창 닫기:** `sending` 으로 바꾼 뒤 프로세스가 죽으면 그 행은 `sending` 으로 남는다. 임대는 한 실행만 가지므로, **새로 임대를 잡은 실행은 시작 때 오늘의 `sending` 을 `pending` 으로 되돌려 다시 보낸다**(최소 1회). 대가: 텔레그램이 200 을 준 뒤 DB 에 `sent` 를 적기 전(약 100ms) 죽었다면 같은 글이 두 번 간다 — 드물고 「유실」 보다 싸다. 되돌린 행은 `attempts` 와 `last_error='reclaimed_after_takeover'` 로 흔적을 남기고 warn 로그 「possible duplicate」.
- Phase 40 과의 차이: `dma_push_claim` 은 기록(`dma_push_log` · `outcome 'sent'`)을 먼저 하고 송신한다 — 사실상 최대 1회(실패는 `dma_push_deliveries` 에 남고 다시 보내지 않음). [VERIFIED: supabase/migrations/20261107100000_dma_push_tables.sql:94-107 「outcome text NOT NULL CHECK (outcome IN ('sent', 'stale', 'suppressed'))」 · 「CONSTRAINT dma_push_log_chain_stage_key UNIQUE (gateway, trade_date, account_no, chain_key, stage)」] 공시 알림은 하루 수 건 · 이어서 보내기가 성공 기준이라 최소 1회가 맞다.
- **재시도:** 실패 행은 `next_attempt_at = now + min(60초, 5초 × 2^(attempts−1))`. 429 는 `retry_after` 초 동안 그 방 송신 전체를 멈춘다. 같은 날 안에서는 포기하지 않는다(창 끝 `20:00` 에 남은 건은 다음 날 아침 `expired` — 그날 밤 이메일이 이미 갔다).
- **로그:** 실패마다 warn(상태 · `error_code` · `description` 앞 200자 — 토큰 · URL 없음). 한 건이 `first_seen_at` 뒤 120초 넘게 못 나가면 **error 한 번**(→ 이메일 · 텔레그램 장애를 덮는 경로).
- **송신 속도:** 같은 방에 1초 간격 이상 · 60초 창 안 최대 18건(텔레그램 단체방 분당 20건 한계 아래). 우선순위: 공개매수 먼저, 그다음 `first_seen_at` 순.

**권장 표 · RPC 모양(재량 — 이름은 제안):**
```sql
CREATE TABLE public.dart_alerts (
  rcept_no            text        PRIMARY KEY CHECK (rcept_no ~ '^[0-9]{14}$'),
  watch               text        NOT NULL,                 -- 'tender_offer' | 'rights_merger' (CHECK 없이 — 감시 대상 추가 시 마이그레이션 불필요)
  rcept_dt            date        NOT NULL,
  corp_cls            text        NOT NULL,
  corp_name           text        NOT NULL,
  stock_code          text        NOT NULL,
  report_nm           text        NOT NULL,
  flr_nm              text        NOT NULL,
  late                boolean     NOT NULL DEFAULT false,
  status              text        NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','sending','sent','seeded','expired')),
  attempts            integer     NOT NULL DEFAULT 0,
  next_attempt_at     timestamptz NOT NULL DEFAULT now(),
  last_error          text        CHECK (length(last_error) <= 300),
  claimed_by          text,
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz,
  telegram_message_id bigint
);
CREATE INDEX ON public.dart_alerts (rcept_dt, status, next_attempt_at);

CREATE TABLE public.dart_alert_state (           -- 1행
  id             smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  lease_holder   text,
  lease_until    timestamptz,
  last_ok        jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {"tender_offer": "…Z", "rights_merger": "…Z"}
  outage_since   timestamptz,                          -- null = 장애 아님
  outage_reason  text,
  outage_notice  text CHECK (outage_notice IN ('pending','sent','failed')), -- 「멈췄습니다」 송신 상태
  recover_notice text CHECK (recover_notice IN ('pending','sent'))         -- 「다시 동작」 송신 상태
);
```
RPC(모두 `SECURITY INVOKER` · `search_path` 고정 · `REVOKE ALL … FROM PUBLIC` + `FROM anon, authenticated` + `GRANT EXECUTE … TO service_role` — kis-news-sync 마이그레이션 89-91줄 꼴 [VERIFIED: supabase/migrations/20261112200000_kis_news_collector.sql:89-91 「REVOKE ALL ON FUNCTION public.kis_news_lease_acquire(text, integer) FROM PUBLIC;」 · 「… FROM anon, authenticated;」 · 「GRANT EXECUTE … TO service_role;」]):
1. `dart_alert_lease(p_holder, p_ttl_seconds, p_last_ok jsonb)` → boolean — kis `kis_news_lease_acquire` 본문(60-87줄) + 내 임대일 때 `last_ok` 병합. 새로 잡은 순간(남의 만료 임대 · 빈 임대에서 넘어올 때) 오늘의 `sending` → `pending` 되돌림 · 지난 날 `pending/sending` → `expired`.
2. `dart_alert_release(p_holder)` → boolean.
3. `dart_alert_insert(p_holder, p_items jsonb, p_seed boolean)` → jsonb(새로 들어간 행) — 임대 보유자 확인 · `ON CONFLICT (rcept_no) DO NOTHING RETURNING`.
4. `dart_alert_claim(p_holder, p_limit)` → jsonb — 오늘 · `pending` · `next_attempt_at <= now()` 를 우선순위 순으로 `sending` + `claimed_by` + `attempts+1`.
5. `dart_alert_mark(p_holder, p_rcept_no, p_ok, p_message_id, p_error, p_retry_in_s)` → boolean — `sending` 이고 내가 잡은 행만.
6. `dart_alert_outage(p_holder, p_action text, p_reason text)` → jsonb — `open`(닫혀 있을 때만 열고 true) · `close`(열려 있을 때만 닫고 「멈췄습니다」 가 `sent` 였는지 돌려줌) · `notice`(송신 결과 기록). 원자적이라 두 실행이 동시에 판정해도 글은 한 번.

### Pattern 5: 장애 짝 글 + 이메일 (D-16 · D-17)

- **수집기가 살아 있고 DART 가 실패:** 감시 대상 중 하나라도 「커버 기준점에서 5분」 넘게 성공이 없으면 → `outage open` 이 true 를 돌려준 실행만 「⚠ 공시 알림이 멈췄습니다 — HH:MM 부터 DART 조회 실패(사유 한 줄). 복구되면 알려 드립니다.」 송신 + **error 로그**(→ 이메일). 그 뒤에는 반복하지 않는다. 다음 성공 바퀴에서 `outage close` → 「멈췄습니다」 가 실제로 나갔으면 「✅ 공시 알림 다시 동작 — HH:MM ~ HH:MM 사이 공시는 「(늦은 알림)」 으로 보냅니다」 1회.
- **수집기 자체가 죽음:** 다음 Scheduler 깨움(≤ 5분)의 실행이 임대 TTL(90초) 만료 뒤 임대를 잡고, 시작 점검에서 「오늘 커버 기준점이 5분 넘게 전」 이면 같은 `outage open` → 글 → 첫 바퀴 성공 → 「다시 동작」. 죽은 시간이 5분 + 90초 안팎이라 대개 「멈췄습니다」 · 「다시 동작」 이 몇 초 간격으로 붙어 나온다 — D-16 문자 그대로의 짝이다. (선택: 같은 실행 안에서 열고 바로 닫힌 경우 한 글 「⚠ HH:MM ~ HH:MM 공시 알림이 멈췄다가 다시 동작합니다」 로 합치는 변형 — 시끄러움 감소. 플래너가 사용자에게 한 줄 확인할 만함.)
- **`020` · 자체 예산 소진 · 키 오류:** 같은 `outage open`(사유 「하루 조회 한도 초과」 등) → strike 기록(`api_usage` service `opendart_list_quota_strike` · kis 의 `recordQuotaStrike` 꼴) → 종료 1. 다음 깨움은 strike 가 있으면 **탐침 1회**만 → 성공하면 재개 + `close`. 운영 기준 ④ 그대로.
- **짝 일관성 규칙:** 「다시 동작」 은 「멈췄습니다」 가 `sent` 였을 때만 보낸다. 텔레그램도 죽어 「멈췄습니다」 를 못 보냈으면 복구 때 아무것도 보내지 않는다(이메일이 이미 갔음).
- **창 경계:** 장애 판정은 창 안에서만. `20:00` 에 열린 채 끝나면 다음 날 첫 성공에 「다시 동작」.
- **이메일(GCP 알림 정책 2개):**
  - ① `ops/alert-dart-alert-failure.yaml` — `run.googleapis.com/job/completed_execution_count` · `result = "failed"` > 0(limitup · tick-convert 와 같은 꼴). 설정 오류 · 020 · 키 오류 · 예외 · OOM 을 잡는다. [VERIFIED: ops/alert-limitup-sync-failure.yaml 「AND metric.type = "run.googleapis.com/job/completed_execution_count"」 · 「AND metric.labels.result = "failed"」]
  - ② `ops/alert-dart-alert-error-log.yaml` — `conditionMatchedLog` · `resource.labels.job_name = "gh-radar-dart-alert" AND jsonPayload.level >= 50` · `notificationRateLimit` 필수(discussion-sync 꼴). 종료 0 으로 계속 도는 동안의 장애(DART 실패 · 텔레그램 실패 · 방 이동)를 잡는다. [VERIFIED: ops/alert-discussion-sync-source-failure.yaml 「conditionMatchedLog:」 · 「AND (jsonPayload.level >= 50 OR textPayload:"[discussion-sync] fatal")」 · 「notificationRateLimit: period: 3600s」] 로그 일치 정책은 `notificationRateLimit` 이 필수이고 정책당 하루 사건 20건 상한이 있다. [CITED: Datadog GCP alert policy 문서 · cloud.google.com/logging/docs/alerting/troubleshooting] 한 정책에 두 조건 종류를 섞을 수 있는지는 확인 못 해 파일을 둘로 나눈다. [ASSUMED]
  - 배포 스크립트 Section 「알림 정책」 은 `deploy-limitup-sync.sh` 158-188줄 update-or-create · `NOTIFICATION_CHANNEL_ID` 정규화를 두 파일에 반복. [VERIFIED: scripts/deploy-limitup-sync.sh:158-188]
  - **덮지 못하는 것(문서화만):** Scheduler 가 일시정지 · 삭제되어 실행 자체가 안 생기는 경우. 다른 워커도 같은 한계 — 받아들인다.

### Pattern 6: 두 줄 메시지 (D-07)

- `parse_mode: "HTML"` + 링크를 글자 뒤에 숨긴다 → 둘째 줄이 짧다. HTML 은 `<` · `>` · `&` 세 글자만 엔티티로 바꾸면 된다. [CITED: core.telegram.org/bots/api Formatting options 「All `<`, `>` and `&` symbols that are not a part of a tag or an HTML entity must be replaced」] MarkdownV2 는 `[` `]` `(` `)` `-` `.` 등 18자를 모두 이스케이프해야 해 보고서명(「[기재정정]주요사항보고서(유상증자결정)」)에서 실수하기 쉽다 — 쓰지 않는다. [CITED: 같은 문서 MarkdownV2 목록]
- 회사명에 `&` 가 실제로 있다(예: F&F) — 이스케이프 안 하면 400 「can't parse entities」. [ASSUMED: 오류 문구]
- `link_preview_options: { is_disabled: true }` — DART 미리보기 카드가 두 줄 원칙을 깬다. [CITED: LinkPreviewOptions `is_disabled`]
- `disable_notification` 은 넣지 않는다(D-14 전부 소리).
- 첫 줄: `📢 {late ? "(늦은 알림) " : ""}{report_nm} — {corp_name}({stock_code}){filer}` · `filer` = 공개매수는 항상 ` · 제출인 {flr_nm}`, B001 은 `flr_nm` 을 공백 · 「(주)」 · 「주식회사」 를 떼고 비교해 회사명과 같으면 생략. 「(늦은 알림)」 을 앞에 두는 이유: 잠금화면에서 줄 끝이 잘린다.
- 둘째 줄: `<a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo={rcept_no}">DART 원문</a> · 금융감독원 전자공시` — 원문 링크 꼴은 문서의 `rcept_no` 설명 그대로. [CITED: opendart 문서 「https://dart.fss.or.kr/dsaf001/main.do?rcpNo=접수번호」]
- 텍스트 상한 4,096자 — 두 줄이면 무관. [CITED: sendMessage `text` 「1-4096 characters after entities parsing」]

### Pattern 7: 비밀 · 방 id 절차 (D-15)

1. 사용자: BotFather 로 봇 생성 → 토큰. **봇과 1:1 대화를 열고 「시작(Start)」 을 누른다** — 봇은 먼저 대화를 시작하지 않은 사용자에게 글을 보낼 수 없다(개인 대화 시험 알림의 전제). [ASSUMED]
2. 사용자: `~/.config/gh-radar/dart-alert.env`(권한 600)에 `OPENDART_API_KEY=` · `TELEGRAM_BOT_TOKEN=` 두 줄.
3. 사용자: 팀 단체방에 봇 초대. 봇이 방에 더해지면 `my_chat_member` 업데이트가 생기고 이것은 `getUpdates` 기본값에 포함된다(기본 제외는 `chat_member` · `message_reaction` · `message_reaction_count`). 프라이버시 모드는 보내기에 영향이 없다. [CITED: core.telegram.org/bots/api `allowed_updates` 설명 · `my_chat_member`]
4. `! bash scripts/telegram-find-chat.sh` — 토큰을 파일에서 읽어 `getUpdates` 를 부르고 **방 id · type · 제목/사용자명만** 출력(토큰 · 원본 JSON 출력 금지). 업데이트는 24시간만 보관되므로 초대 직후 실행. 새 봇은 웹훅이 없어 `getUpdates` 가 동작한다(웹훅이 있으면 동작 안 함). [CITED: getUpdates 「This method will not work if an outgoing webhook is set up」 · 「will not be kept longer than 24 hours」]
5. 사용자: env 파일에 `TELEGRAM_CHAT_ID=<개인 대화 id>` 추가 → `! GCP_PROJECT_ID=gh-radar bash scripts/setup-dart-alert-iam.sh`(SA · Secret 껍데기 3개 · Accessor) → `! bash scripts/setup-dart-alert-secrets.sh`(값 3개 · `setup-kis-secrets.sh` 복제 — 첫 `=` 에서만 자르기 · 따옴표 벗기기 · 같은 값 SKIP · 출력은 OK/SKIP/ERROR 줄만 [VERIFIED: scripts/setup-kis-secrets.sh:95-113 · 168-182]). 방 id 는 음수 · 짧아서 `MIN_LEN=16` 검사를 그대로 쓰면 안 된다 — 키별 검사(`^-?[0-9]+$`)로 바꾼다.
6. 메인 세션 배포 → `gcloud run jobs execute gh-radar-dart-alert --update-env-vars=DART_ALERT_MODE=test-send --wait` → 개인 대화에 시험 글.
7. env 파일의 `TELEGRAM_CHAT_ID` 를 단체방 id 로 바꿔 `setup-dart-alert-secrets.sh` 재실행(다음 실행부터 `:latest` 를 읽는다).

### Anti-Patterns to Avoid
- **「첫 조회에 이미 있던 건 = 늦은 알림」 단순 근사:** 아침 07:30 전후에 나타나는 전날 저녁 서류 · 07:00 Job 기동 지연에 오판한다 → Pattern 3 의 커버 기준점 방식.
- **부분 글자 규칙 「유상증자 포함」:** 유무상증자결정을 놓친다 → 괄호 종류명 허용 목록.
- **`013` 을 오류로 취급:** 07:00 ~ 07:30 · 공개매수 없는 날은 늘 `013`(조회된 데이터 없음). 오류로 세면 매일 아침 「멈췄습니다」 가 나간다. `013` = 성공 + 빈 목록. [CITED: opendart 상태 코드 「013 조회된 데이타가 없습니다」 · algolab.co.kr 「공시 없는 날마다 봇을 멈춥니다」]
- **HTTP 상태로만 성공 판정:** OpenDART 는 오류도 JSON `status` 로 준다(HTTP 200 으로 오는 것으로 보이나 계약 문서 없음). Telegram 은 4xx/5xx 에도 `ok:false` JSON 본문을 준다. 두 클라이언트 모두 axios `validateStatus: () => true` 로 받아 본문으로 분류한다. [ASSUMED: OpenDART 오류의 HTTP 상태]
- **URL · 요청 설정 로그:** OpenDART 키는 쿼리 `crtfc_key=` 에, 봇 토큰은 경로 `/bot<token>/` 에 있다 — axios 오류 객체의 `config.url` · `config.params` · `request` 에 실린다. 로그는 `safeErrorFields` 꼴 안전 필드만, 로거 redact 에 `url` · `params` · `crtfc_key` · `botToken` · `dartApiKey` · `telegramBotToken` 추가.
- **Telegram SDK 의 폴링 시작:** SDK 기본 폴링이 `getUpdates` 를 계속 불러 방 id 도우미와 충돌한다 — SDK 안 씀.
- **Job `--max-retries` > 0:** 같은 실행 안 즉시 재기동 = 020 뒤 두드림 · 장애 글 반복. kis-news-sync 처럼 0. [VERIFIED: scripts/deploy-kis-news-sync.sh:292 「--max-retries=0 \」]

## API 계약 정리

### OpenDART `GET https://opendart.fss.or.kr/api/list.json` [CITED: opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001]

| 인자 | 이 phase 값 | 비고 |
|------|-------------|------|
| `crtfc_key` | 비밀 | 40자 |
| `bgn_de` · `end_de` | 오늘 KST `YYYYMMDD` 둘 다 | `corp_code` 없으면 검색 기간 3개월 상한 |
| `pblntf_detail_ty` | `D004` 또는 `B001` | 코드 하나 |
| `last_reprt_at` | `N`(기본 · 명시) | `Y` 면 최종 보고서만 — 정정 전 원본이 빠질 수 있음 |
| `corp_cls` | 보내지 않음 | 값 하나만 받음 — 응답에서 Y/K 거름 |
| `sort` · `sort_mth` | `date` · `desc`(기본) | 같은 날짜 안 순서는 미정 — 확인 5 |
| `page_no` · `page_count` | 1 · 100 | 최대 100 |

응답: `status` · `message` · `page_no` · `page_count` · `total_count` · `total_page` · `list[]`(`corp_cls` · `corp_name` · `corp_code` · `stock_code`(상장사만) · `report_nm` · `rcept_no`(14자리) · `flr_nm` · `rcept_dt` · `rm`(유 · 코 · 채 · 넥 · 공 · 연 · 정 · 철)).

| status | 뜻(문서) | 이 phase 처리 |
|--------|----------|---------------|
| `000` | 정상 | 성공 |
| `013` | 조회된 데이터 없음 | **성공 · 빈 목록** |
| `020` | 요청 제한 초과(「요청 제한을 초과하였습니다.」 · 일반적으로 20,000건 이상) | 장애 열기 · strike · 종료 1 · 다음 깨움 탐침 1회 |
| `010` · `011` · `012` · `901` | 미등록 키 · 사용 불가 키 · 허용 안 된 IP · 개인정보 보유기간 만료 키 | 장애 열기 · error · 종료 1(재시도로 안 풀림). `012` 면 고정 IP 경로(VPC egress) 검토 |
| `100` · `101` | 잘못된 값 · 부적절한 접근 | 코드 버그 — error · 종료 1 |
| `800` | 시스템 점검 | 일시 장애 — 다음 바퀴 계속(5분 넘으면 장애 글) |
| `900` · HTTP 5xx · 네트워크 · 타임아웃 · JSON 깨짐 | 정의되지 않은 오류 등 | 일시 장애 — 다음 바퀴 계속 |
| 그 밖 모르는 코드 | — | 일시 장애로 보되 연속 5회면 kis 처럼 strike 의심 · 종료 1 |

- 분당 호출 제한 · IP 차단 규칙은 공개 문서에서 찾지 못했다. 이 phase 의 최대 속도는 분당 24회(5초 × 2)라 문제될 가능성은 낮다. [ASSUMED]
- 호출 수는 실패 호출까지 센다(kis 「실패한 호출도 센다」 · collector.ts:439-449).

### Telegram `POST https://api.telegram.org/bot<token>/sendMessage` [CITED: core.telegram.org/bots/api · bots/faq]

본문: `{ chat_id, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }`. 응답 `{ ok, result: { message_id … } }` 또는 `{ ok:false, error_code, description, parameters? }` — `error_code` 내용은 「바뀔 수 있다」 고 문서가 경고하므로 분류는 `parameters` 우선, 그다음 `error_code`.

| 응답 | 분류 | 처리 |
|------|------|------|
| `ok:true` | 성공 | `sent` · `message_id` 저장 |
| `parameters.retry_after` (보통 429) | 속도 제한 | 그 초만큼 이 방 송신 전체 멈춤 → 재시도 |
| `parameters.migrate_to_chat_id` (400) | 방 이동 | 새 id 로 즉시 재송신 · 메모리 교체 · error 로그 |
| 401 | 토큰 무효 | error · 송신 중단(수집은 계속) · 행은 pending 유지 |
| 403 (봇이 방에서 나감 · 글쓰기 권한 없음) · 400 chat not found | 방 설정 문제 | error · pending 유지 · 백오프 최대 60초 |
| 400 can't parse entities | 코드 버그(이스케이프) | error · 그 행만 `parse_mode` 없이 평문으로 1회 재시도 권장 |
| 5xx · 네트워크 · 타임아웃 | 일시 장애 | 백오프 재시도 |

- 속도 한계: 한 방에 초당 1건 이상 피할 것 · 단체방은 분당 20건까지 · 넘으면 429. [CITED: core.telegram.org/bots/faq 「In a group, bots are not be able to send more than 20 messages per minute.」]
- Bot API 최신판 10.4(2026-11-09). `sendMessage` 기본 인자는 오래 안정적이다. [CITED: core.telegram.org/bots/api Recent changes]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 중복 실행 방지 | 새 잠금 방식 | kis `kis_news_lease_acquire` 본문 복제(TTL 90 · 연장 30초) | 이미 운영 검증 · SIGTERM · 인계 규칙 동일 |
| 호출 수 카운터 | 새 표 | `api_usage` + `incr_api_usage` · `UsageCounter` 10초 묶음 | 서비스 키만 추가 · CHECK 없는 자유 text 라 마이그레이션 불필요 [VERIFIED: supabase/migrations/20260417120000_api_usage.sql:11-17 「service text NOT NULL」 · 「PRIMARY KEY (service, usage_date)」 · :23 「CREATE OR REPLACE FUNCTION incr_api_usage(p_service text, p_date date, p_amount int)」] |
| 「한 번만」 판정 | 메모리 집합 · 파일 | DB PK `rcept_no` + 상태 전이 RPC | 재시작 · 동시 실행에도 같은 결과 |
| KST 시각 계산 | `TZ` env · 라이브러리 | +9h · `getUTC*`(cadence.ts) | 컨테이너 TZ 비의존 |
| 비밀 등록 | 대화형 입력 · 에이전트 실행 | `setup-kis-secrets.sh` 복제 | base64 `=` 잘림 함정 이미 해결(95-113줄 주석) |
| 이메일 알림 | 자체 SMTP | GCP 알림 정책 yaml + 기존 이메일 채널 | 텔레그램 장애와 독립 |
| Telegram 클라이언트 | SDK | axios 한 함수 | 메서드 1개 · 폴링 충돌 회피 |
| HTML 이스케이프 | 정규식 덕지덕지 | `&` → `&amp;` 먼저, 그다음 `<` · `>` 세 줄 | 순서가 틀리면 이중 이스케이프 |

**Key insight:** 이 phase 의 어려움은 HTTP 호출이 아니라 「언제 보냈다고 믿을 수 있나 · 언제 멈췄다고 말할 수 있나」 다. 그 판정은 전부 DB 원자 연산(PK · 상태 전이 · 장애 열기/닫기)으로 내린다.

## Common Pitfalls

### Pitfall 1: 유무상증자결정 누락
**What goes wrong:** 「`유상증자` 포함」 규칙이 「주요사항보고서(유무상증자결정)」 을 거른다.
**How to avoid:** 괄호 종류명 완전 일치 허용 목록 + 근접 불일치 warn.
**Warning signs:** 근접 불일치 로그에 「유무상증자결정」 이 찍힌다(허용 목록이 맞으면 안 찍힘).

### Pitfall 2: `013` 을 장애로 셈
**What goes wrong:** 매일 07:05 「⚠ 멈췄습니다」.
**How to avoid:** `013` = 성공. 단위 테스트에 07:00 ~ 07:30 빈 응답 시나리오.

### Pitfall 3: 아침 「(늦은 알림)」 오판
**What goes wrong:** 07:00 Job 기동이 60초 넘게 걸리거나 전날 저녁 서류가 아침 목록에 나타나면 정상 건에 「(늦은 알림)」.
**How to avoid:** 커버 기준점 = 오늘 마지막 성공 · 없으면 07:00 + 120초.

### Pitfall 4: 비밀이 로그로 샘
**What goes wrong:** axios 오류를 통째로 로그 → `config.url` 에 `crtfc_key=` · `/bot<token>/`.
**How to avoid:** `safeErrorFields` 안전 필드만 · redact 경로 추가 · 로거 테스트가 키 · 토큰 문자열이 출력에 없음을 단언.

### Pitfall 5: 100건 넘는 날 새 건 누락
**What goes wrong:** 1쪽만 읽고 「새 건 없음」.
**How to avoid:** `total_count > 100` 이고 늘었으면 전 쪽 · 60초마다 전 쪽.

### Pitfall 6: 방 id 변경 · 봇 강퇴로 조용히 끊김
**What goes wrong:** 400 · 403 을 warn 만 하고 계속 → 아무도 모름.
**How to avoid:** migrate 자동 재송신 + error · 403/401/chat not found → error(→ 이메일) · pending 유지.

### Pitfall 7: 장중 재배포가 바로 안 바뀜
**What goes wrong:** 도는 실행이 옛 이미지로 20:00 까지 간다(임대 보유).
**How to avoid:** kis 배포 스크립트 머리말 그대로 — 즉시 바꾸려면 도는 실행 취소 → 다음 깨움이 인계(그 사이 건은 「(늦은 알림)」). [VERIFIED: scripts/deploy-kis-news-sync.sh:45-48]

### Pitfall 8: 첫 배포 날 알림 폭탄
**What goes wrong:** 장중 첫 배포 → 그날 유상증자 · 합병 수 건이 한꺼번에 「(늦은 알림)」.
**How to avoid:** 20:00 뒤 배포 또는 `DART_ALERT_MODE=seed` 먼저.

### Pitfall 9: 방 id 검증을 토큰 검사로 재사용
**What goes wrong:** `setup-kis-secrets.sh` 의 `MIN_LEN=16` · 공백 검사가 음수 방 id(예 `-1001234567890` 은 14자)를 「너무 짧다」 로 거부.
**How to avoid:** 키별 검사 함수.

### Pitfall 10: 개인 대화 시험이 403
**What goes wrong:** 운영자가 봇과 대화를 시작하지 않아 「bot can't initiate conversation」.
**How to avoid:** D-15 절차 1 에 「봇과 대화 시작」 을 넣는다.

## Code Examples

### OpenDART 호출 · 분류 (kis `client.ts` 꼴)
```typescript
// Source: kis-news-sync src/kis/client.ts 구조 + opendart 상태 코드표
export type DartErrorKind = "quota" | "key" | "bug" | "transient" | "unknown";
const KIND_BY_STATUS: Readonly<Record<string, DartErrorKind>> = {
  "020": "quota", "010": "key", "011": "key", "012": "key", "901": "key",
  "100": "bug", "101": "bug", "800": "transient", "900": "transient",
};
export async function fetchListPage(http: AxiosInstance, key: string, q: {
  detailTy: string; day: string; pageNo: number;
}): Promise<{ total: number; totalPage: number; rows: DartRow[] }> {
  const res = await http.get("/api/list.json", {
    params: { crtfc_key: key, bgn_de: q.day, end_de: q.day, pblntf_detail_ty: q.detailTy,
              last_reprt_at: "N", page_no: q.pageNo, page_count: 100 },
    validateStatus: () => true,
  });
  const body = res.data as { status?: string; message?: string; total_count?: number; total_page?: number; list?: DartRow[] };
  if (res.status >= 500 || res.status === 0) throw new DartApiError(res.status, null, "transient");
  if (body?.status === "013") return { total: 0, totalPage: 0, rows: [] };
  if (body?.status !== "000") throw new DartApiError(res.status, body?.status ?? null,
                                                      KIND_BY_STATUS[body?.status ?? ""] ?? "unknown");
  return { total: Number(body.total_count ?? 0), totalPage: Number(body.total_page ?? 0), rows: body.list ?? [] };
}
// 오류 객체 · 로그에는 status · code · message 만 — params(crtfc_key) · url 은 절대 싣지 않는다
```

### Telegram 송신 (오류 분류)
```typescript
// Source: core.telegram.org/bots/api ResponseParameters · sendMessage
export function htmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
export async function sendMessage(http: AxiosInstance, token: string, chatId: string, text: string) {
  const res = await http.post(`/bot${token}/sendMessage`, {
    chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true },
  }, { validateStatus: () => true, timeout: 10_000 });
  const b = res.data as { ok?: boolean; result?: { message_id?: number }; error_code?: number;
    description?: string; parameters?: { retry_after?: number; migrate_to_chat_id?: number } };
  if (b?.ok === true) return { kind: "ok" as const, messageId: b.result?.message_id ?? null };
  if (b?.parameters?.migrate_to_chat_id) return { kind: "migrated" as const, to: String(b.parameters.migrate_to_chat_id) };
  if (b?.parameters?.retry_after) return { kind: "rate" as const, retryAfterS: b.parameters.retry_after };
  const code = b?.error_code ?? res.status;
  const parse = code === 400 && /can't parse entities/i.test(b?.description ?? "");   // 이스케이프 버그 → 평문 1회 재시도
  const kind = parse ? "parse" : code === 401 ? "token" : code === 403 || code === 400 ? "chat" : "transient";
  return { kind, code, description: (b?.description ?? "").slice(0, 200) } as const;
}
```

### 하루 호출 수 단언(테스트)
```typescript
// cadence 함수로 평일 하루를 1초 단위로 돌려 바퀴 수 × WATCHES.length 를 센다
let laps = 0;
for (let t = kst(2026, 11, 16, 7, 0); t < kst(2026, 11, 16, 20, 0); ) { const iv = lapIntervalMs(new Date(t))!; laps++; t += iv; }
expect(laps).toBe(5_400);
expect(laps * WATCHES.length).toBe(10_800);
expect(laps * WATCHES.length).toBeLessThanOrEqual(15_000);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `disable_web_page_preview` | `link_preview_options: { is_disabled: true }` | Bot API 7.0(2023-12) | 옛 인자는 하위호환이지만 새 코드는 새 인자 [CITED: core.telegram.org/bots/api — `link_preview_options` 존재 확인 · 변경 시점은 ASSUMED] |
| DART 18시 마감 일괄 | 증권신고서 19시까지 당일 접수 | 2023-08-01 | `20:00` 창 끝으로 충분 [CITED: bizwatch 2023-07-27] |

**Deprecated/outdated:** 로드맵 Goal 의 「9,360회」 계산(공개매수 단독) — D-10 의 10,800회로 대체.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 유상증자 · 합병 알림 하루 약 3 ~ 10건(정정 포함) | 확인 3 | 훨씬 많으면 단체방이 시끄러움 → 정정 제외 등 범위 재론 |
| A2 | B001 의 실제 종류명이 「유상증자결정 · 유무상증자결정 · 회사합병결정 · 회사분할합병결정」 과 글자까지 같다 | 확인 1 · Pattern 1 | 다르면 해당 종류 전부 누락 — 근접 불일치 로그로 첫날 드러남 · 탐침으로 사전 확인 |
| A3 | 같은 날짜 안 정렬 순서는 계약이 아님(최신이 위일 가능성은 높음) | 확인 5 | 보수적 가정이라 틀려도 손해 없음(추가 쪽 호출만) |
| A4 | B001 하루 전체(비상장 포함) 건수가 대개 100 미만 | 확인 5 | 넘는 날이 잦으면 추가 쪽 호출로 예산 여유 4,200 소모 |
| A5 | OpenDART 오류가 HTTP 200 + JSON `status` 로 온다 | Anti-Patterns · 계약 | `validateStatus` 로 둘 다 처리하므로 위험 낮음 |
| A6 | 분당 호출 제한 · IP 차단 규칙 없음(또는 분당 24회로는 안 걸림) | 계약 | 걸리면 `020`/`012` 류로 드러나 장애 글 + 이메일 |
| A7 | 「18시 이후 제출 = 다음날 접수」 규칙이 2026 에도 유효 | 확인 4 | 무관 — 창이 넓고 판정이 시각 비의존 |
| A8 | 개인 대화 시험 전에 봇과 대화를 시작해야 함 · 오류 문구 | Pattern 7 · Pitfall 10 | 절차 한 줄 |
| A9 | 일반 그룹 → 슈퍼그룹 전환 오류 문구 「group chat was upgraded to a supergroup chat」 | 확인 7 | 분류는 `parameters.migrate_to_chat_id` 로 하므로 문구 무관 |
| A10 | 로그 일치 알림 정책에 지표 조건을 섞을 수 없음 | Pattern 5 | 섞을 수 있어도 파일 둘은 무해 |
| A11 | 의견표명서 · 결과보고서의 `flr_nm` · 법인구분이 대상회사 기준 | Pattern 1 | 제출인 표기만 달라짐 |
| A12 | `link_preview_options` 도입 시점(Bot API 7.0) | State of the Art | 없음 |
| A13 | 지분공시(D 대분류 전체) 하루 수백 ~ 수천 건 | 확인 2 | 결론(2회 유지)은 같음 |

## Open Questions (RESOLVED)

1. **장애 짝 글 합치기(선택)**
   - What we know: 수집기가 죽었다 인계되면 「멈췄습니다」 · 「다시 동작」 이 몇 초 간격으로 붙어 나간다.
   - What's unclear: 사용자가 두 글을 원하는지 한 글(「HH:MM ~ HH:MM 멈췄다가 다시 동작」)을 원하는지.
   - Recommendation: 기본은 D-16 문자 그대로 두 글. 플래너가 한 줄 확인 질문으로 넣을 만함.
   - RESOLVED: 두 글로 둔다(D-16 문자 그대로 · 합치지 않음) — 실행 전에 사용자가 뒤집을 수 있는 가정으로 기록(→ 43-06-PLAN.md objective 「가정」 · must_haves 세 번째 truth · Task 1).
2. **단체방 연결 확인 글**
   - What we know: D-15 는 시험 글을 개인 대화로만 보낸다. 단체방 권한(「관리자만 글쓰기」)은 첫 실제 알림 때야 드러난다.
   - Recommendation: 방 id 전환 직후 단체방에 「공시 알림 봇이 연결되었습니다(공개매수 · 유상증자 · 합병)」 소개 글 1건을 `test-send` 로 보내는 것을 사용자에게 물어본다.
   - RESOLVED: 자동 소개 글은 올리지 않고, 방 id 전환 직후 확인 글 1건을 보낼지 사용자에게 묻는다(고를 때만 `test-send`) (→ 43-08-PLAN.md objective 「가정」 · Task 2 지시 8).
3. **보관 기간**
   - What we know: 하루 수 건 · 1년 약 2,000 ~ 3,000행. D-09 후속(웹앱 표시)이 이 기록을 쓸 수 있다.
   - Recommendation: 정리 작업 없이 보관(재량 「보관 기간」 의 답). 필요해지면 후속에서.
   - RESOLVED: 정리(삭제) 작업 없이 보관한다 — `dart_alerts` 에 지우는 RPC · 정리 Job 을 만들지 않고 마이그레이션 머리 주석에 보관 방침을 적는다(→ 43-01-PLAN.md Task 2 · must_haves 「보관」 truth).
4. **모바일 원문 링크**
   - What we know: 문서의 원문 링크는 데스크톱 뷰어(`dart.fss.or.kr/dsaf001/main.do?rcpNo=`)다.
   - Recommendation: D-08 「DART 원문 하나」 대로 이 링크. 폰에서 불편하다는 피드백이 오면 후속.
   - RESOLVED: 데스크톱 원문 뷰어 `https://dart.fss.or.kr/dsaf001/main.do?rcpNo={접수번호}` 하나만 쓴다(모바일 전용 주소 없음 · D-08) — 트레이서 테스트가 이 주소를 글자 그대로 단언한다(→ 43-01-PLAN.md Task 1 `DART_VIEWER_URL` · must_haves D-08 truth).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | 빌드 · 테스트 | ✓ | v24.21.0(로컬) · 이미지 node:22 | — |
| pnpm | 워크스페이스 | ✓ | 11.15.1 | — |
| Docker | 이미지 빌드 · pgTAP 러너 | ✓ | 29.8.2 | — |
| Supabase Postgres 이미지 | pgTAP 러너 | ✓ | `public.ecr.aws/supabase/postgres:17.6.1.104` 로컬 존재 | — |
| gcloud | 배포 · 비밀 · 알림 정책 | ✓ | 592.0.0 | — |
| jq · curl | 탐침 · 도우미 스크립트 | ✓ | jq 1.7.1 | — |
| OpenDART 인증키 | 실호출 · 탐침 | ✗(Secret Manager 미등록 · 사용자 보유) | — | 사용자가 `setup-dart-alert-secrets.sh` 로 등록 — 등록 전에는 fixture 테스트만 |
| Telegram 봇 토큰 · 방 id | 송신 | ✗(미보유) | — | 사용자 BotFather · 초대 후 등록 |
| GCP 이메일 알림 채널 | 알림 정책 | ✓(다른 워커가 사용 중 — `NOTIFICATION_CHANNEL_ID`) | — | — |

**Missing dependencies with no fallback:** 없음(키 · 토큰은 사용자 단계로 계획에 넣는다).
**Missing dependencies with fallback:** OpenDART 키 · 봇 토큰 — 등록 전까지 단위 · pgTAP · self-test 로 개발 진행.

## Validation Architecture

> `workflow.nyquist_validation: true` [VERIFIED: .planning/config.json]

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4(워커) · pgTAP(Supabase Postgres 17.6.1.104 일회용 컨테이너) · bash `--self-test` |
| Config file | `workers/dart-alert/vitest.config.ts`(kis-news-sync 복제 · maxWorkers 기본 2) — Wave 0 에서 생성 |
| Quick run command | `pnpm --filter @gh-radar/dart-alert test` |
| Full suite command | `pnpm --filter @gh-radar/dart-alert typecheck && pnpm --filter @gh-radar/dart-alert test && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dart_alert.test.sql && bash scripts/deploy-dart-alert.sh --self-test` |

pgTAP 러너 사용법: 「bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_orders_modified.test.sql」 꼴 · 원격 DB 접촉 0. [VERIFIED: scripts/verify-dma-orders-price-check.sh:16-17]

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| D-01 · D-04 · D-05 | D004 는 이름 무관 통과 · B001 허용 목록(정정 꼬리표 포함 · 유무상증자결정 포함) · 제외 종류 거부 · `corp_cls` N/E 거부 · 종목코드 없음 거부 · 근접 불일치 판정 | unit | `pnpm --filter @gh-radar/dart-alert exec vitest run tests/watches.test.ts` | ❌ Wave 0 |
| D-07 · D-08 | 두 줄 문구 · HTML 이스케이프(F&F · `<`) · 「(늦은 알림)」 앞 배치 · 제출인 생략 규칙(B001 만) · 원문 링크 꼴 · 장애 글 2종 | unit | `… vitest run tests/message.test.ts` | ❌ |
| D-10 · D-11 · SC-4 | 간격 함수(06:59 null · 07:00 5초 · 08:59:59 5초 · 09:00 10초 · 19:59:59 10초 · 20:00 null · 토/일 null) · 하루 10,800회 · ≤ 15,000 | unit | `… vitest run tests/cadence.test.ts` | ❌ |
| D-11 | 배포 스크립트 Scheduler 배열 1주 × 1440분 = 평일 07:00 ~ 19:55 5분마다만 · 창 밖 발화 0 · `--task-timeout=14h` ≥ 13시간 | unit | `… vitest run tests/schedule.test.ts` | ❌ |
| SC-4 · 운영 기준 ④ | 상태 코드 fixture(000 · 013 · 020 · 010 · 011 · 012 · 901 · 100 · 800 · 900 · HTTP 503 · 타임아웃 · 깨진 JSON) 분류 · 추가 쪽 규칙(total_count 100/101/증가/60초) | unit | `… vitest run tests/dartClient.test.ts` | ❌ |
| SC-5 · 확인 7 | Telegram fixture(ok · 429 retry_after · 400 migrate · 401 · 403 · 400 parse entities · 5xx · 네트워크) 분류 | unit | `… vitest run tests/telegram.test.ts` | ❌ |
| SC-1 ~ SC-6 · D-12 · D-16 · D-17 | 가짜 시계 13시간 수집기: 임대 못 잡으면 호출 0 · 하루 호출 수 · 정상 07:00 시작 late=false · 09:30 시작 late=true · 인계 late=true · 전날 저녁 서류 07:30 등장 late=false · DART 5분 실패 → 「멈췄습니다」 1회 · 복구 「다시 동작」 1회 · 「멈췄습니다」 실패 시 「다시 동작」 없음 · 020 → 장애 + strike + 종료 1 · strike 있으면 탐침 1회 · 자체 예산 소진 · seed 모드 송신 0 · 텔레그램 실패 → 다음 바퀴 재시도 · 120초 미송신 error 1회 · 송신 간격 · 공개매수 우선 · SIGTERM 정리 | unit(가짜 시계) | `… vitest run tests/collector.test.ts` | ❌ |
| 비밀 비노출 | `crtfc_key` · 봇 토큰 · `url` · axios `config` 가 로그 출력에 없음 | unit | `… vitest run tests/logger.test.ts` | ❌ |
| 설정 계약 | 필수 비밀 누락 → 이름만 담은 오류 · 예산 > 15,000 거부 · 모드 값 검증 | unit | `… vitest run tests/config.test.ts` | ❌ |
| SC-2 · SC-5 (DB) | 같은 rcept_no 두 번 넣기 → 1행 · 넣기는 새 행만 반환 · claim 은 오늘 pending · 남의 임대면 0 · mark 는 내 sending 만 · 새 보유자가 오늘 sending 되돌림 · 지난 날 expired · 장애 open 은 한 번만 true · close 는 open 때만 · 「멈췄습니다」 미발송이면 close 가 알림 불필요 반환 · anon/authenticated 표 · RPC 접근 거부 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dart_alert.test.sql` | ❌ |
| 배포 계약 | Scheduler 배열 · `--task-timeout=14h` · `--max-retries=0` · 예산 env ≤ 15,000 · 알림 정책 파일 2개 존재 | bash | `bash scripts/deploy-dart-alert.sh --self-test` | ❌ |
| 비밀 스크립트 | 방 id 음수 허용 · 값 미출력(출력 줄 OK/SKIP/ERROR 만) | bash(수동 점검 + `--help`) | `bash scripts/setup-dart-alert-secrets.sh --help` | ❌ |
| SC-1 · D-15 | 실제 텔레그램 도착(개인 대화 → 단체방) | **manual/UAT** | `gcloud run jobs execute gh-radar-dart-alert --region=asia-northeast3 --update-env-vars=DART_ALERT_MODE=test-send --wait` 후 사람이 확인 | — |
| SC-1 · SC-4 | 실키 탐침 1바퀴 「probe ok」 | smoke(배포 후) | `bash scripts/smoke-dart-alert.sh` | ❌ |
| SC-7 · 확인 6 | 첫 실제 공개매수 · 첫 B001 지연 기록 | **manual/UAT** | 확인 6 의 SQL + DART 사이트 시각 대조 | — |
| 확인 1 · 3 · 5 | 한 달 종류명 · 건수 · 100건 초과 일수 | **manual(키 등록 뒤 1회)** | 확인 1 탐침 / `scripts/dart-alert-report.sh survey` | ❌ |
| SC-6 이메일 | 알림 정책 실제 발화 | **manual(선택)** | 정책 생성 확인 `gcloud alpha monitoring policies list --filter='displayName~dart-alert'` | — |

### Sampling Rate
- **Per task commit:** `pnpm --filter @gh-radar/dart-alert test`(관련 파일만이면 `vitest run tests/<file>`)
- **Per wave merge:** Full suite(위 명령 · pgTAP 포함)
- **Phase gate:** Full suite green + 스모크 PASS + UAT(test-send 개인 대화 · 단체방) 뒤 `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `workers/dart-alert/{package.json,tsconfig.json,vitest.config.ts,Dockerfile}` — kis-news-sync 복제 · 패키지 이름 `@gh-radar/dart-alert`
- [ ] `workers/dart-alert/tests/fixtures/` — `list-d004-000.json` · `list-b001-000.json`(정정 꼬리표 · 유무상증자 · 무상증자 · 회사분할 · 코넥스 · 비상장 행 섞음) · `list-013.json` · `list-020.json` · `list-010.json` · `list-total-150-page1.json`/`page2.json` · `tg-ok.json` · `tg-429.json` · `tg-400-migrate.json` · `tg-403.json` · `tg-401.json` · `tg-400-parse.json`
  - fixture 의 `report_nm` 은 확인 1 탐침 뒤 실제 표기로 한 번 맞춘다(그 전엔 문서 · 공개 사례 표기)
- [ ] `supabase/tests/dart_alert.test.sql` — pgTAP(kis_news_collector.test.sql 꼴)
- [ ] 프레임워크 설치 불필요(기존 vitest · pgTAP 러너)

## Security Domain

`security_enforcement: false`(.planning/config.json) — 절 생략. 비밀 취급 규칙(비출력 등록 · 로그 redact · 표 서비스롤 전용 · RPC REVOKE)은 위 Pattern 4 · 7 · Pitfall 4 에 반영했다.

## Sources

### Primary (HIGH confidence)
- 저장소 파일(이 세션에서 Read/cat): `workers/kis-news-sync/src/{index,config,apiUsage,logger,collector}.ts` · `src/pipeline/cadence.ts` · `src/kis/client.ts` · `tests/schedule.test.ts` · `Dockerfile` · `package.json`; `supabase/migrations/20261112200000_kis_news_collector.sql` · `20261112100000_kis_news_feed.sql`(87-116) · `20260417120000_api_usage.sql` · `20261107100000_dma_push_tables.sql`(94-122) · `20261107100100_dma_push_claim.sql`(머리 주석); `scripts/deploy-kis-news-sync.sh` · `setup-kis-secrets.sh` · `setup-kis-news-sync-iam.sh` · `smoke-kis-news-sync.sh` · `deploy-limitup-sync.sh`(158-198) · `verify-dma-orders-price-check.sh`(머리); `ops/alert-limitup-sync-failure.yaml` · `alert-tick-convert-failure.yaml` · `alert-discussion-sync-source-failure.yaml`; `.planning/ROADMAP.md`(670-690 · 73); 43-CONTEXT.md; 40-CONTEXT.md.
- OpenDART 공시검색 개발가이드 — https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001 (요청 인자 · 코드표 A/B/C/D/E/I · 응답 필드 · 상태 코드 · 원문 링크 꼴)
- Telegram Bot API — https://core.telegram.org/bots/api (응답 형식 · ResponseParameters · sendMessage · Formatting options · LinkPreviewOptions · getUpdates · Update.my_chat_member · Recent changes 10.4)
- Telegram Bots FAQ — https://core.telegram.org/bots/faq (속도 한계)

### Secondary (MEDIUM confidence)
- [비즈워치 2023-07-27 — DART 제출 가능 시간 · 증권신고서 19시 연장](https://news.bizwatch.co.kr/article/market/2023/07/26/0014)
- [헤럴드경제 2025-11-16 — 유상증자 건수(예탁결제원)](https://www.heraldk.com/article/2025111616583542448)
- [AlgoLab — OpenDART list.json 실전 코드(013 처리 · corp_cls 복수 불가 · status 분기)](https://algolab.co.kr/blog/dart-preliminary-earnings-disclosure-bot-filter-2026)
- [Cloud Logging 로그 기반 알림 문제 해결](https://cloud.google.com/logging/docs/alerting/troubleshooting) · [Datadog GCP alert policy 리소스 문서](https://docs.datadoghq.com/infrastructure/resource_catalog/gcp_monitoring_alert_policy/)

### Tertiary (LOW confidence — 표기 참고만)
- [stockhub.kr — 「주요사항보고서(회사합병결정)」 표기 사례](https://stockhub.kr/news/news_8af8cfc5ccd3) · [knowingasset.com — 「[기재정정]주요사항보고서(회사합병결정)」 사례](https://www.knowingasset.com/app/calendar/13812) · [specialtimes.co.kr — 「합병등종료보고서 (합병)」 제출 보도](https://www.specialtimes.co.kr/news/articleView.html?idxno=482679)
- 슈퍼그룹 전환 오류 커뮤니티 보고: [Home Assistant 커뮤니티](https://community.home-assistant.io/t/nodered-telegram-stopped-working-supergroup/709847) · [Netdata 커뮤니티](https://community.netdata.cloud/t/telegram-notifications-not-working/3458)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 새 패키지 없음 · 전부 저장소 선례
- Architecture: HIGH(임대 · 카운터 · 배포 꼴은 운영 중 선례) / MEDIUM(전달 상태 기계 · 장애 짝 · late 판정은 새 설계 — pgTAP · 가짜 시계 테스트로 고정)
- API 계약: HIGH(OpenDART · Telegram 공식 문서) / LOW(같은 날짜 안 정렬 · 오류 HTTP 상태 · 분당 제한)
- 데이터 규모 · 표기: LOW — 키 없이 미실측(확인 1 · 3 · 5 · 6)

**[미실측] 목록:** 확인 1(B001 실제 종류명) · 확인 3(하루 건수) · 확인 4 일부(전날 저녁 서류가 다음날 몇 시에 보이나) · 확인 5(100건 초과 일수) · 확인 6(B001 · 장전 · D004 반영 지연)

**Research date:** 2026-11-12
**Valid until:** 2026-12-12(OpenDART · Telegram 계약은 안정적 · 건수 추정은 탐침으로 갱신)
