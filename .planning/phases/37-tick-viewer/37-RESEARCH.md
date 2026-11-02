# Phase 37: 틱 전문 뷰어 (tick-viewer) - Research

**Researched:** 2026-11-02
**Domain:** 시세 원본 전문(KRX·NXT 멀티캐스트 pcap) 종목 단위 추출 · TS 디코더 이식 · Cloud Run Job 변환 · radar-gw 경유 당일 요청형 · 순수 SVG 재생 뷰어
**Confidence:** HIGH(디코더 · 판정 오라클 · 크기 · 처리량은 이번 세션 실데이터로 실측) / MEDIUM(Supabase 플랜 · GCS Archive 요금 · Cloud Run 성능 환산) / LOW 없음(가정은 Assumptions Log 에)

## Summary

이번 리서치는 gh-trade 정본 코드(`packets.py` · `pcap2parquet.py` · `teamflow.py` · `nxt_runs.py` · `nxt_fixture.py` · `teamflow_accum.py`)를 원문으로 읽었다. 그리고 맥에 남아 있는 **실제 원본**(`~/ticks/team-follow/rawpcap/20261014/*.pcap.zst` KRX 08~15시 3.4GB · `~/ticks/cut-101360/{krx,nxt}-1300.pcap.zst`)과 119 export 사본(`~/ticks/research/export/<D>/`)으로 크기 · 처리량 · 오라클 수치를 직접 쟀다. 판정을 바꾸는 사실 다섯 가지가 나왔다.

1. **CONTEXT D-20 의 골든 수치 일부가 낡았거나 출처가 틀리다.** ① 천일고속 10/14 「실현 +0.27억 · 미실현 +0.03억 · 합계 +0.30억 · 1.12% · 끝 잔량 3,401주」는 `team-flow.md` §5-1 의 옛 예시다. 지금 export `payload.pnl`(2026-10-26 재생성, msg_seq 런 + C0 규칙)은 실현 28,621,939 · 미실현 3,160,411 · 합계 31,782,350 · ret 0.011768 · 끝 잔량 3,406주다. **골든은 문서 예시가 아니라 export 파일 값이다.** ② 「KRX 빅텍 20261022 runs≥2=182 smp=70」은 빅텍이 아니다. **에코앤드림(101360 · KR7101360006) 10/16 13시 컷의 KRX 쪽** 값이다. 이번에 `nxt_runs` 로 다시 돌려 NXT 179/65 · KRX 182/70 을 그대로 재현했다.
2. **팀 계산 범위가 export 두 개에서 다르다.** team_flow(§5-1)는 KRX **G1 · msg_seq 순**이고, accum_flow(매집감지 · 3판 차트의 원천)는 KRX **G1+G4 · (체결시각, msg_seq) 순**이다. 빅텍 10/22 팀 매수는 team_flow 6,695,674,123 원(§7 「66.9억」과 일치), accum_flow 7,310,140,958 원이다. 그래서 판정 · 손익 함수는 범위를 인자로 받아야 하고, 골든도 두 벌이 필요하다.
3. **KRX 는 (종목, 보드)마다 A3·B6·R8 이 순번 하나를 나눠 쓴다.** 실측 결과 천일고속 10/14 G1 은 A3+B6 37,454건 · seq 1..37458 이다. 차이 2 인 빈칸 4곳에 R8 4건(seq 9090 · 9251 · 24866 · 25236)이 정확히 들어간다. 다른 보드(G2 · G3 · G7)는 각자 1부터 다시 센다. 수신 순서에서 인접한 두 행의 seq 가 거꾸로 된 경우는 2%(757/37,454)다. 결론: 「거래소순」은 **보드별 msg_seq 재배열**이고, B9·C3(순번 없음)과 보드 사이 순서는 수신 순서를 그대로 둔다.
4. **크기 · 처리량은 넉넉하다.** Node 24 `zlib.createZstdDecompress` 로 1시간 파일 4.55GB(압축 570MB · 846만 패킷)를 **6.4초**(1.31M pps · RSS 181MB)에 훑었다. 종목·하루 격자 크기(레코드 프레이밍 + zstd -9)는 천일고속 10/14 ≈ **1.0MB**, 한선엔지니어링 10/14(극단) ≈ **6.8MB** 다. 10/14 대상(매집감지 182 ∪ 15%↑ 52 = 216종목, KRX)은 원본 5.6GB → 격자 ≈ 0.3GB/일이다. 90일(≈63거래일)이면 NXT 를 합쳐 **≈ 20~30GB** 다.
5. **당일 경로는 relay 안에 넣으면 안 된다.** relay 컨테이너는 `--memory=384m` 이고 주문 경로다. radar-gw 의 **별도 컨테이너**(tickgw)가 119 ssh 를 맡고, server 가 Direct VPC 로 그 내부 포트를 부르는 것이 기존 선례(server → relay `:8091 /internal/admin/*`)와 같은 꼴이다.

**Primary recommendation:**
- **형식:** 「pcap-ns 레코드 프레이밍(16B 레코드 헤더 + 원본 UDP 페이로드, 전역 헤더 없음) + zstd」 하나를 과거 격자 · 119 당일 응답 · 브라우저 입력에 똑같이 쓴다. 저장은 Supabase Storage 비공개 버킷 + 서명 URL, 브라우저는 `fzstd` 로 직접 푼다.
- **디코더 · 판정:** 디코더와 버스트 · 팀 · 손익 판정은 `packages/shared` 순수 함수로 두고, 파이썬 오라클이 만든 픽스처와 바이트 · 수치 단위로 대조한다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 과거 원본 통독 · 종목 추출 · 대상 판정(15%) · 격자 업로드 · 90일 purge | Cloud Run Job `gh-radar-tick-convert` | Database(격자 메타 · 요청 큐 RPC) · Storage | 4GB/일 스트리밍 · 119 부하 0(D-02~D-04). GCS 는 같은 리전 볼륨 마운트 |
| 당일 119 호출 · 종목별 캐시 · 폴링 일원화 | radar-gw 새 컨테이너 `tickgw` | — | 119(10.16.207.119:22)에 닿는 곳은 radar-gw 뿐이다(VPN). relay 는 주문 경로 + 384MB 상한이라 분리한다 |
| 접근 게이트(DMA 매핑) · 서명 URL · 당일 바이트 중계 · 요청 변환 트리거 | API(server `/api/ticks/*`) | Database RPC(게이트 정본) | D-08 = RPC 안 `dma_visible_accounts` · 403 `DMA_UNMAPPED`(34 D-06 동형) |
| 격자 파일 보관 · 다운로드 | Storage(Supabase 비공개 버킷) | CDN(서명 URL) | Cloud Run egress 를 거치지 않는다(브라우저가 직접 받는다 — limitup-grid 선례) |
| 디코딩 · 인덱스 · 거래소순 재배열 · 버스트/팀/손익 · 호가 재구성 · 차트 모델 | Browser(webapp) | packages/shared(순수 함수) | 사용자마다 선택 틱이 달라 증분 계산은 클라이언트가 한다. 같은 함수를 Job(검증 · 15% 판정)도 쓴다 |
| 20:00 당일 캐시 → 격자 승격 | Cloud Run Job(promote 모드) | tickgw 내부 export | radar-gw 에 Supabase 키를 두지 않는다(D-13 원칙) · relay CPU 무접촉 |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:zlib` zstd (`createZstdDecompress` · `zstdCompressSync`) | Node ≥ 22.15(로컬 24.21.0) | Job 의 pcap.zst 스트리밍 해제 · 격자 zstd 압축 | 의존성 0. Node 22.15/23.8 에 실험(experimental) 기능으로 들어왔다 `[CITED: @types/node zlib.d.ts @since v22.15.0 · eslint-plugin-n 표]`. 로컬에서 실측했다 `[VERIFIED: node -e typeof zlib.createZstdDecompress → function, v24.21.0]` |
| `fzstd` | 0.1.1(2024-03-15) | 브라우저 zstd 해제(스트리밍 `Decompress` · 여러 프레임 이어붙이기) | 순수 JS · 의존성 0. 이번 세션 실측: 6.60MB → 132.3MB 를 276ms(480MB/s)에, 이어붙인 두 프레임을 원샷 · 스트리밍 모두 정확히 풀었다 `[VERIFIED: npm view fzstd version → 0.1.1 · package-legitimacy OK]` |
| `@supabase/supabase-js` | 워커 ^2.49.0 · server ^2.103.0(기존) | RPC · Storage 업로드 · `createSignedUrl(s)` | 기존 의존성이다 `[VERIFIED: workers/limitup-sync/package.json · server/package.json]` |
| Cloud Run Jobs + Cloud Storage 볼륨 마운트(gen2, ro) | — | `gs://gh-trade-tick-archive` 를 파일로 읽는다 | limitup-sync 선례 `--add-volume=…type=cloud-storage,…readonly=true` `[VERIFIED: scripts/deploy-limitup-sync.sh Section 5]` |
| Cloud Run Admin API v2 `jobs.run` + `overrides.containerOverrides[].args` | v2 | 요청 변환(D-03) — server 가 그 종목 인자로 Job 실행 | 공식 REST 다. 권한은 `run.jobs.runWithOverrides` `[CITED: cloud.google.com/run/docs/reference/rest/v2/projects.locations.jobs/run]` |
| OpenSSH client(`ssh` · ControlMaster) | 컨테이너 이미지 패키지(alpine `openssh-client`) | tickgw → 119 강제 명령 호출 | npm ssh 라이브러리 없이, limitpull 과 같은 문법(전용 키 · known_hosts 고정 · BatchMode)으로 쓴다 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `cmdk`(기존) + `useDebouncedSearch`(기존 훅) | webapp 기존 | 종목 검색 피커(D-16 — 전역 검색 재사용) | `GlobalSearch` 는 prop 이 없고 `router.push('/stocks/…')` 고정이다 `[VERIFIED: webapp/src/components/search/global-search.tsx:30-45]`. 그래서 훅 · cmdk 만 재사용하는 새 피커를 만든다 |
| `useChartGestures` · `useChartWidth` · `lib/accum-chart.ts` 상태 없는 헬퍼(기존) | — | 3판 차트 조작 · 축 · 원 · 막대 | 차트 재사용(아래 Pattern 9) |
| gh-trade tickana venv(`server/tools/analysis/.venv`, Python 3.14) | 로컬 | 오라클 픽스처 생성(파이썬 → JSON) | Wave 0 만. CI 에서는 돌리지 않는다(생성물을 커밋한다 — gh-trade `AccumNxtFixtures.h` 선례) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Supabase Storage `tick-grid` | gh-radar 전용 GCS 버킷 + V4 서명 URL | 저장비는 GCS Standard 가 싸다. 그러나 서명은 SA 키나 IAM signBlob 호출이 필요하다(`@google-cloud/storage` 는 Phase 28 에서 `SUS too-new`). 서명을 직접 구현하면 손수 만든 암호 배관이 된다. **Supabase 가 Free 플랜으로 드러나면(1GB 상한) 이 대안으로 간다** |
| zstd 격자 + fzstd | gzip 격자 + `DecompressionStream('gzip')`(limitup-grid 선례 · 의존성 0) | gzip-6 은 zstd-9 보다 45% 크다(천일 1.47MB vs 1.02MB). 그리고 당일 119 응답이 zstd 라서 브라우저는 어차피 zstd 해제기가 필요하다. 해제 경로가 둘이면 시험 범위가 두 배다 |
| 레코드 프레이밍(pcap-ns 레코드 · USER0) | 전체 이더넷 프레임 pcap-ns(tcpdump 그대로) | 원본 프레임은 gzip 기준 +36% 크다(천일 1.95MB vs 1.43MB). 레코드 프레이밍은 압축 크기가 자체 11B 헤더보다 +3~5% 커질 뿐이고, D-21 ② 「pcap-ns 와 같은 프레이밍 제안」을 그대로 지킨다 |
| 단일 통독 + 키별 압축 청크 스테이징 | 2회 통독(1회차 15% 판정 → 2회차 대상만 쓰기) | 2회 통독은 코드가 단순하지만 Archive 꺼내기 요금이 두 배다(≈ $0.21 → $0.42/일). 메모리는 Job 설정으로 싸게 산다 |
| 15% 판정 = pcap A3 직접 | KRX EOD(`stock_daily_ohlcv` high · change) · 키움 매분 스냅 | pcap 직접 판정은 119 배치 탐지와 같은 식이고, 외부 적재 시각에 의존하지 않는다. 이번 실측에서 10/14 pcap 20% 판정 집합(34종목) = export entries(34종목)였다(차집합 0) |
| 별도 컨테이너 tickgw | relay 프로세스에 내장 | 내장하면 배포가 하나 줄지만, relay 384MB 상한 안에 캐시 · ssh 를 넣게 되고 주문 경로와 장애가 엮인다 |
| 고정 행 높이 자체 창 가상화 | `@tanstack/react-virtual` 3.14.25 | 라이브러리는 legitimacy `SUS(too-new — 11-01 게시)`. 행 종류(전문 · 꼬리 줄 · 점선 자리)를 모두 같은 높이로 두면 창 계산이 `floor(scrollTop / H)` 한 줄이다. 측정 · 동적 높이(라이브러리가 푸는 어려운 부분)가 필요 없다 |

**Installation:**
```bash
pnpm --filter @gh-radar/webapp add fzstd@0.1.1
# 새 워크스페이스: workers/tick-convert (limitup-sync 의존성 그대로) · tickgw/ (의존성 0 — node 내장만)
```

**Version verification:** `npm view fzstd version` → `0.1.1` · `npm view @tanstack/react-virtual version` → `3.14.25`(채택 안 함) `[VERIFIED: npm registry 이번 세션]`.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| fzstd | npm | 최신 0.1.1 = 2024-03-15(2년 7개월) | 1,801,220/주 | github.com/101arrowz/fzstd | [OK] (postinstall 없음) | Approved — 단 패키지 이름은 학습 지식에서 나왔으므로 `[ASSUMED]`, 아래 참고 |
| @tanstack/react-virtual | npm | 최신 3.14.25 = 2026-11-01(1일) | 39,240,886/주 | github.com/TanStack/virtual | [SUS] (reason `too-new`) | **권고 경로에서 쓰지 않음**. 대안을 택하면 Flagged — 설치 전 `checkpoint:human-verify` |

`[VERIFIED: gsd-tools query package-legitimacy check --ecosystem npm @tanstack/react-virtual fzstd]` 원문: fzstd `"verdict": "OK"` · `"reasons": []` · `"postinstall": null` / @tanstack/react-virtual `"verdict": "SUS"` · `"reasons": ["too-new"]`.

**Packages removed due to [SLOP] verdict:** 없음
**Packages flagged as suspicious [SUS]:** @tanstack/react-virtual(대안 경로 한정)
*fzstd 는 이름을 공식 문서 · Context7 이 아니라 학습 지식으로 찾았다. 규칙상 `[ASSUMED]` 이므로 플래너는 설치 전에 `checkpoint:human-verify` 한 줄(저장소 · 작성자 101arrowz = fflate 작성자 확인)을 넣는다.*

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### 목업 · 스케치 채택 (D-00)
- **D-00: 화면 정본 셋.** ① 스케치 019 **D 종합** — 머리(종목 · 날짜 · KRX|NXT · 공급 배지 · 현재 틱 시각/seq) → 매집감지 3판 차트(가격 선 · 팀 평단 `--up` 점점선 · 팀 주문 원 ≥500만 | 당일 팀 순매수 보라 계단(오른쪽 축) + 누적 순매수 회색 계단(이월 포함 · 왼쪽 회색 축 · 0 포함) | 10분 팀 매수/매도 막대 · VI 띠 · 15:30~16:00 빈 띠 · 장전 음영 · 현재 틱 커서 + 시각 라벨 · 휠/끌기/클릭/`+ − 0`/「1분」「10초」 · 틱이 창 밖이면 창이 따라감 · 주문 원 클릭 = 그 주문 마지막 조각) → 슬라이더 카드(‹ ▶ › · 08~20 슬라이더(5분 거래대금 밀도 · VI 눈금) · 시각 입력 + 점프 · 당일이면 「끝으로」) → HTS 3단(호가 10단 「주 | 금액」 토글(스케치 010 C 축약 · 바닥 줄 총잔량 ↔ 합산 금액 · 바 길이 단위 따름) · 전문 목록 · 이 주문 | 거래대금 | 팀 거래정보). 폰 390: 3판 165px + 슬라이더 카드 + 「호가 | 전문 | 버스트 · 팀」 세그먼트. ② 스케치 020 **A 행 그룹 + 3 둘 다** — 전문 전부 한 행씩, 한 주문은 왼쪽 레일(팀 보라 · 일반 회색) + 둘째 조각부터 시각 흐림 + 닫는 B6 행 앞 「닫는 B6」 점선 칩 + 꼬리 줄 「┗ n조각 k단 · 수량 · 금액 · 지속 · 모양」(모양 칩은 꼬리에만 · 1조각 주문은 그 행) · 70조각도 71행 + 꼬리 · 머리 「수신순 | 거래소순」 토글(**기본 거래소순** = msg_seq 순) + 먼저 온 B6 행 seq 주황 `↕` + 꼬리말(수신순 「↕ 9.0ms 먼저 수신」 · 거래소순 「↕ 수신은 9.0ms 먼저」) + 수신순에서만 msg_seq 제자리 점선 「⋯ 거래소순 자리」 줄 + 머리 「↕ 다음 역전」 · A3 `16,400 +1,064 (1,745만) 매수 · 0/0` · B6 `매도1 16,400 ×283 (464만) 매수1 16,350 ×121 (198만)` · B6 총잔량은 행에서 뺌. ③ 진입 목업 `reference/mockup-ticks-entry.html` **A**(D-16). 키: `←` `→` 한 틱 · `Shift+←/→` 10틱 · `Space` 재생 · 시각 입력 `HH:MM:SS.mmm` + Enter/「점프」.

### 공급 공백 · 과거 변환 범위
- **D-01: D-1 공백은 GCS 업로드를 당일 밤으로 당겨 메운다(gh-trade 요청).** 지금 `tick-archive` 완결 판정은 「이름의 날짜 < 오늘」 이라 D 의 원본이 D+1 22:00 에야 올라와, 어제가 하루 종일 과거 격자에도 당일 인덱서에도 없다. gh-trade 에 완결 판정을 **「같은 줄기의 `.pcap` 짝이 없고 20:30 이후(기록 종료 뒤)」** 로 바꿔 **D 를 D 22:00 에 올리도록** 요청한다(인박스 D-21 ①). 변환 Job 이 그날 밤 돌면 다음날 아침 어제 격자가 있다. 119 요청형은 **오늘만** 덮는다(어제까지 덮는 안 기각 · 공백 수용 기각). — **Reversibility:** costly — gh-trade `tick-archive.sh` 완결 규칙 · 타이머 변경을 요청하는 외부 운영 계약이며, 되돌리면 D-04 Job 시각 · 사용자 안내 문구가 다시 바뀐다.
- **D-02: 밤 변환 대상 = 그날 매집감지에 등록된 모든 종목 + 그날 15% 이상 상승했던 모든 종목(사용자 직접 지정).** 전 종목(기각 · 저장 과다) · 보고서 탐지 종목만(기각) 아님. 「매집감지 등록」 = `limitup_accum_flow` (D, isin) 행(21:00 적재) ∪ 그날 라이브 kind 16 등록(`dma_strategy_events` · 적재 전 보강). 「15% 이상 상승」 = 그날 **고가 기준** 기준가 대비 +15% 이상 — 판정 입력(pcap A3 에서 직접 vs 키움 매분 스냅 vs KRX EOD)은 Claude 재량(아래). KRX·NXT 둘 다(같은 ISIN 이 대상이면 두 거래소 격자 다 만든다).
- **D-03: 그 밖의 종목 과거 날짜는 열 때 요청 변환.** 격자에 없는 (종목, 거래소, 날짜)를 열면 Cloud Run Job 을 **그 종목만** 대상으로 켜고 「변환 중 · 약 N분 · 끝나면 자동으로 열림」 상태 카드(목업 「미변환 종목 고름」) + 취소. 끝나면 격자에 남아 다음부터 바로. GCS Archive 읽기 요금(하루치 pcap 통독)이 그때마다 붙는 것을 받아들인다. 같은 (종목, 날짜) 동시 요청은 Job 하나로 합친다(사용자 수 독립). — **Reversibility:** reversible.
- **D-04: 격자 보존 90일.** 119 원본 회전 · 매집감지 purge 와 같은 기간. 지나면 지우고, 열면 D-03 요청 변환으로 재생성(GCS 원본은 영구). 밤 변환본이 당일 캐시 승격본(D-06)을 덮어쓴다.

### 당일 요청형 호출 규율
- **D-05: 당일 종목을 열면 08:00 부터 지금까지 하루치를 한 번에 요청한다.** 그 뒤는 마지막 recv_ns 이후 증분만. 차트 · 슬라이더가 처음부터 하루 전체를 그린다. 응답 상한에 걸리면 **이어받기**(응답에 `has_more` + `next_from_ns` 류 커서 · 계약 항목 D-21 ②). 슬라이더 주변 시간 창만(기각) · 하루치 + 창 이중 요청(기각).
- **D-06: 새 틱은 자동 폴링 — 탭이 보이고 현재 틱이 끝에 있을 때만.** 5~10초 간격으로 마지막 recv_ns 이후 증분. 사용자가 과거 틱을 보고 있으면 멈추고 목록 끝에 「새 틱 n건」 배지, 「끝으로」 누르면 즉시 증분 1회 + 끝 틱으로. 수동만(기각) · 늘 폴링(기각). 정확한 간격 · 백오프는 리서치.
- **D-07: 119 호출은 서버 캐시로 (종목, 거래소, 날짜) 당 1줄.** gh-radar 서버(또는 relay — 어느 쪽이 radar-gw 를 통해 119 에 닿는지는 리서치)가 받은 원본 바이트를 종목별로 들고 있고, **폴링도 종목당 하나**(브라우저 N 개가 열려도 119 호출은 종목당 동일 — CLAUDE.md 「호출량은 사용자 수와 독립」). 장 마감(20:00) 뒤 그날 캐시는 **그날 격자로 승격**하고, 밤 변환 대상이면 변환본이 덮어쓴다(D-04). — **Reversibility:** reversible.
- **D-08: 접근 = DMA 매핑 사용자만(과거 · 당일 동일).** 매집감지 · 팀 매집 보고서와 같은 게이트 — RPC 안 `dma_visible_accounts` · 403 `DMA_UNMAPPED` · 웹 `DmaGate surface="틱 전문 뷰어"` 표시 장치. 과거만 로그인 전체(기각) · 관리자만(기각).

### 팀 거래정보 범위
- **D-09: 누적 순매수(이월 포함 회색 선)는 있으면 그리고 없으면 당일 선만.** `limitup_accum_flow` (날짜, isin) 행이 있으면 `payload.pos_net` 로 회색 누적 선 + 왼쪽 회색 축(스케치 018 ② 동형). 없으면 보라 당일 선만 · 왼쪽 축 생략 · 범례 「누적 자료 없음(매집감지 미등록)」. 당일 종목은 늘 당일 선만(라이브 kind 16 포지션으로 보강하지 않는다). 전 종목 pos_net export 요청(기각) · 누적 선 제거(기각).
- **D-10: 팀 거래정보 KPI = A3 평균단가법(§5-1) 틱마다.** 당일 팀 순매수(금액 · 수량) · 누적(pos_net 있을 때만 · D-09) · 당일 평단 · 평단 대비 수익률(선택 틱 시점 체결가 기준 미실현 + 실현) — 선택 틱까지의 체결로 계산. 단일가(bs ≠ '1'/'2') 제외 · 상한가 가격 체결 포함(§5-1). 거래대금 = A3 `cum_value`(선택 틱 시점).
- **D-11: 5창구(교보·한국·유진·신한·NH) 표는 선택 틱 시점의 마지막 B9 그대로.** 창구별 누적 매수/매도 수량 · 금액 + 「B9 HH:MM:SS 기준 · ≈1분 해상도」 · 상위 5 밖 창구는 「—」. 추정(배분) 없음 — `member_flow` 배분 재계산(기각) · 표 생략(기각).
- **D-12: 우리(KB·교보 DMA) 체결은 포함하고 캡션만.** A3 만으로 계산 — export `payload.pnl` 과 같은 정의라 golden 대조가 성립한다. 팀 패널 캡션 「우리 체결 포함 · 호가 걸어 둔 팀 주문 미포함(최소치)」. 저널 80 조인으로 「우리」 배지(기각) · 제외 계산(서버 D-07 동형 · 기각).
- **D-13: NXT 도 팀 판정 · 손익을 보인다 — 서버 매집감지 NXT 런 규칙 그대로(사용자 「매집감지 규칙을 따르면 돼」).** 런 = 같은 ISIN 직전 NXT A3 seq + 1 ∧ 같은 bs · 닫는 B6 = 마지막 A3 seq + 1 · 완성 4경로(닫는 B6 · 선착 뒤 늦은 조각 · 새 런 · 200ms) · **팀 = 런 안 한 가격 2조각 이상(SMP 모양)만**(0/0 없음). 정본 gh-trade `docs/features/accum-signal.md` 「NXT 런」 D-01·D-02·D-04 · 파이썬 오라클 `tickana/nxt_fixture.py classify_nxt_team_orders` · 런 분석기 `tickana/nxt_runs.py`. 팀 패널 · 차트 팀 계단 · 주문 원은 NXT 에서도 그린다(같은 ISIN KRX 와 **합산하지 않는다** — 뷰어는 거래소 하나를 보므로 그 거래소 체결만). 주문 묶기만 하고 팀 숨김(기각) · NXT 제외(기각).

### 진입 · 선택 · 연결
- **D-14: 사이드바 「분석」 그룹에 「틱 전문 뷰어」** — 「매집감지 보고서」 다음 · active = prefix `/analytics/ticks` · 사이드바 테스트 · e2e `sidebar-tree` 링크 순서 단언 갱신(Phase 34 D-27 동형).
- **D-15: 기본 날짜 = 평일 08:00~20:00 이면 오늘, 그 밖에는 격자가 있는 최근 날짜.** 오늘 빈 상태 목록 = 오늘 매집감지 등록(라이브 kind 16) + 지금 15% 이상 상승 종목(키움 매분 스냅 `intraday`) 「라이브」 칩 · 과거 빈 상태 목록 = 그 날짜 격자 종목.
- **D-16: 진입 · 빈 상태 = 목업 A(`reference/mockup-ticks-entry.html` · 사용자 검토 2026-11-02).** 머리: 종목 검색(기존 전역 검색 재사용 · 이름/코드 · 제안 행에 그 날짜 준비 상태 칩 「격자 있음 · 변환 필요 · 약 N분 · 오늘 · 라이브」) + 날짜 알약(보고서 동형 ‹ › + 달력) + KRX|NXT 세그먼트. 빈 상태: 「{날짜} 격자 종목 · n종목」 패널 — 등락률순(이름순 토글) · 출처 칩(매집감지 · 15%↑ · 요청 변환 · NXT) · 클릭 = 열기 · 캡션 「목록에 없는 종목은 위 검색으로 — 그 종목만 변환해서 열어요(약 N분)」. 상태 카드 3종 공통: 「변환 중」(주황 · 진행 바 · 취소) · 「당일 · 08:00~지금 하루치 받는 중 · 대기 k건」(빨강 · 진행 바 · 취소) · 「자료 없음」(휴장 · 당일 22:00 전 · 90일 밖 → 「최근 거래일로」 버튼). 로드된 뒤 머리는 019 D 그대로(검색은 머리에 남는다). B 검색창만 · C 최근 본 기각.
- **D-17: 세 보고서(매집감지 · 팀 매집 · 상한가) 펼친 상세 머리에 「틱 보기 ›」 알약.** 그 종목 · 그 날짜 · 의미 있는 시각으로 점프 — 매집감지 = 마지막 사이클 등록 시각(`reg_time_ms`) · 팀 매집 = 상한가 도달 시각(규칙 5 · 없으면 첫 20% 도달) · 상한가 = 첫 상한 도달(`first_upper_ns` · 미도달이면 `t20_ns`). 보고서 종목은 밤 변환 대상(D-02)이라 바로 열린다. 거래소는 KRX 기본.
- **D-18: URL = `/analytics/ticks?isin=&d=YYYYMMDD&ex=KRX|NXT&t=HH:MM:SS.mmm`.** 틱을 옮길 때마다 `history.replaceState`(히스토리 안 쌓임 · 스로틀). 복사해 넘기면 같은 틱 · 새로고침 제자리 · 「틱 보기」 도 같은 꼴. `t` 는 그 시각 이후 첫 틱(수신순 기준)으로 맞춘다. `t` 없으면 과거는 08:00 첫 틱 · 당일은 끝 틱.

### 계약 · 배포
- **D-19: 디코더는 gh-radar 가 TS 로 이식 · pcap2parquet 와 golden 대조.** 태그 2자 + 길이 키로 `LAYOUTS`(A3 186B · B6 590B · R8 116B · B9 414B · C3 400B) 를 옮기고, 맞지 않는 전문은 raw(태그 · 정보구분 · 길이 · recv_ns)로 보존(버리지 않는다 — 전문 목록 「기타」 행). 단위 · `*_ns` · `exchange`/`market` 유도 규칙은 `server/tools/analysis/README.md` 「Parquet 표 스키마」 그대로. 검증 = 같은 pcap 조각을 두 디코더로 돌려 행 수 · 키 열 일치(gh-trade `server/tests/support/RawPacketFixtures.h` 표본 재사용). — **Reversibility:** costly — 격자 파일 형식과 당일 캐시가 이 디코더 출력에 묶이며, 레이아웃 오류는 저장된 격자를 전부 재변환해야 고쳐진다.
- **D-20: 버스트 · 팀 판정 · 손익 계산은 shared 패키지 순수 함수 + 오라클 픽스처.** KRX = `krx-a3-zero-quote.md` §2 묶기 · §3/§4 판정(A ∪ B ∪ C0 · C 일반 · 단일가 제외) · NXT = D-13 — gh-trade 오라클(KRX 빅텍 20261022 · NXT 101360 20261016 13시 컷: NXT runs≥2=179 smp=65 · KRX runs≥2=182 smp=70)과 수치 일치 테스트. 손익 = §5-1 → export `payload.pnl`(10/14 천일고속 실현 +0.27억 · 미실현 +0.03억 · 합계 +0.30억 · 1.12% · 끝 잔량 3,401주)과 골든. 서버 · 웹이 같은 함수를 쓴다(웹은 선택 틱까지 증분 계산).
- **D-21: gh-trade 인박스(`scripts/trade-handoff.sh tick-viewer-contract`)는 플랜 1 로 보내고, 응답을 기다리는 동안 과거 경로를 먼저 만든다.** 항목: ① `tick-archive` 완결 판정 · 업로드를 D 22:00 으로(D-01) ② 119 인덱서 + ssh 강제 명령 계약 — 인자 `isin · exchange · date(오늘만) · from_ns · to_ns`, 응답 = zstd 스트림(레코드 = recv_ns + 거래소 라벨 + 원본 UDP 페이로드 · pcap-ns 와 같은 프레이밍 제안) + 끝 표시 + 상한 초과 시 `has_more`/`next_from_ns` · 동시 1~2건(초과는 429 류 + 대기 안내) · 응답 크기 상한 수치 · 키 등록 줄(`restrict,command=…` · `tickarc`/`limitpull` 동형 전용 사용자 `tickpull` 제안) ③ 「거래소 시각」 열 정의(A3 `trade_time` 과 B6 `proc_time` 이 같은 시계인지 · 뷰어 「거래소순」 은 msg_seq 만 쓴다) ④ NXT 체결의 호가 공백 규칙(NXT A3 에 0/0 이 없을 때 호가 재구성에 영향) ⑤ 변환 Job 서비스 계정에 `gs://gh-trade-tick-archive` objectViewer 바인딩은 gh-radar 가 한다(알림만). 노트 커밋은 gh-trade 세션.
- **D-22: 배포 순서 = DB(격자 메타 표 · RPC · 게이트) → 변환 Job(새 Cloud Run Job + Scheduler · GCS 바인딩) → 서버/relay(당일 경로 · 캐시) → webapp push(= 프로덕션). 당일 경로는 gh-trade 119 인덱서 배포 뒤에만 켠다(그 전엔 「당일 자료 준비 중」 카드).** radar-gw 변경(키 · 유닛)은 20:00 이후 · 「relay 먼저 · push 나중」 원칙.

### Claude's Discretion
- **저장처 · 파일 형식**(Supabase Storage 격자 — `limitup-sync` grid 선례 — vs gh-radar 전용 GCS 버킷 + 서명 URL · 종목·날짜 파일 1개(gzip NDJSON vs 자체 바이너리 vs Parquet) · 브라우저 직접 다운로드 vs 서버 경유). Cloud Run 서버 VPC egress 왕복 비용([[project_cloudrun_egress_roundtrip_cost]])을 리서치가 잰다.
- **변환 Job 설계** — 트리거(22:00 업로드 뒤 23:00 고정 vs 객체 도착 알림) · 4.5GB 스트리밍 메모리 · 대상 선별 순서(첫 패스에서 ISIN 별 고가 · 기준가 계산 뒤 둘째 패스 쓰기 vs 임시 디스크) · 15% 판정 입력(pcap A3 직접 권장 — 기준가 = `px − 부호 × price_change` 최빈값 · 정수 경계 비교 `team-flow.md` §5) · 요청 변환(D-03)의 Job 인자 · 소요 안내 N분 · 중복 합치기.
- **당일 경로 위치**(서버 vs relay) · 증분 폴링 간격(5~10초 안) · 백오프 · 캐시 메모리 상한 · 20:00 승격 시점.
- **호가 재구성**(선택 틱 시점 마지막 B6 · msg_seq 순 · B6 가 없는 구간 처리) · 전문 목록 가상 스크롤(하루 수십만 행) · 슬라이더 5분 밀도 계산 · `t` 점프 이진 탐색.
- **차트 코드 재사용 범위** — `accum-chart.tsx`/`lib/accum-chart.ts`(순수 SVG · `useChartGestures` · `useChartWidth`)를 틱 커서 · 10초 가격 대신 틱 가격 선으로 일반화할지 복제할지.
- **격자 메타 표**(날짜별 종목 목록 · 출처 칩 · 변환 상태 · purge) 스키마 · RPC 모양 · 요청 변환 상태 폴링.
- **키 바인딩 · 재생 속도**(스케치 그대로 `Space` 재생 · 속도는 1×/10×/최대 정도).

### Deferred Ideas (OUT OF SCOPE)
- **「상한가 창 버스트 비율」 2차 표시** — 로드맵이 선택 항목으로 둔 것. 뷰어 1차에는 넣지 않는다.
- **창구별 순매수 배분(`member_flow` 규칙) 뷰어 재계산** — D-11 에서 기각(추정값). 필요하면 export 값을 읽는 별도 작업.
- **우리 체결 「우리」 배지 · 제외 계산** — D-12 기각. 저널 80 조인은 후속.
- **전 종목 매일 변환** — D-02 기각(저장 과다). 요청 변환 사용 빈도 · 비용을 90일 보고 재검토.
- **폰 3판 차트 과함 여부 · 폰 B6 행 잘림** — 스케치 019·020 미결 · 실기기 UAT 에서 본다.
- **B9 · C3 수신 뒤집힘 표현** — 020 은 A3 ↔ B6 만 심었다. 실데이터에서 보이면 같은 `↕` 규칙 적용 여부 결정.
- **KRX+NXT 합산 팀 포지션 보기** — 뷰어는 거래소 하나씩(D-13). 합산 뷰는 별도.
</user_constraints>

<phase_requirements>
## Phase Requirements

REQUIREMENTS.md 에는 이 phase 의 ID 가 없다(ROADMAP `Requirements: TBD`). 그래서 CONTEXT 성공 기준 1~4 에서 ID 를 만들어 제안한다. 플래너는 이 ID 를 그대로 쓰거나 바꿀 수 있다.

| ID | Description | Research Support |
|----|-------------|------------------|
| TICK-01 (SC1) | 목업 채택 정본 3종(019 D · 020 A+3 · 진입 A)대로 화면을 만든다 | Pattern 7~10(목록 · 호가 · 차트 · 진입) · D-00/D-14~D-18 |
| TICK-02 (SC2) | gh-trade 계약 인계(D-21 ①~⑤) · 119 인덱서 배포 뒤 radar-gw 에서 당일 종목 하루치 조회 실측(크기 · 지연 · 이어받기) | Pattern 1(프레이밍 = 계약 제안) · Pattern 12(tickgw) · 「D-21 계약 초안」 |
| TICK-03 (SC3) | 과거 변환 Job — 10/30 선별 종목 변환 시간 · GCS 읽기 비용 실측 · 격자 적재 · 당일 밤 자동 · 요청 변환(그 종목만 · 약 N분) · 90일 purge | Pattern 11(Job) · 크기 · 처리량 실측 · DB 스키마 |
| TICK-04 (SC4) | `/analytics/ticks` — 당일/과거 같은 화면 · DMA 게이트 · 손익 골든(export `payload.pnl`) · 버스트 판정 `classify_orders` 일치(KRX) · NXT 런 오라클 일치 · 세 보고서 「틱 보기」 · URL 딥링크(틱 시각) | Pattern 2~6(디코더 · 순서 · 판정 · 손익) · Validation Architecture 골든 표 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **응답 · 문서 언어는 한국어**(식별자 · 경로 · 로그 원문은 원어). 커밋 메시지는 한글. Co-Authored-By 를 넣지 않는다(사용자 전역 규칙).
- **호출량은 사용자 수와 독립**(공식 API 기준 3 · 스크래핑 원칙 3의 정신) — 119 호출은 (종목, 거래소, 날짜)당 폴러 하나(D-07). 요청 변환도 (종목, 거래소, 날짜)당 Job 하나로 합친다(D-03).
- **실패 신호에 재시도로 두드리지 않는다**(공식 API 기준 4의 정신) — 119 「바쁨」 · 오류는 백오프(Pattern 12). 같은 정신으로 요청 변환에는 하루 상한을 둔다.
- **출처 표기** — 뷰어 머리 공급 배지(「과거 격자 · GCS 원본」/「당일 · 119 요청형」)와 팀 패널 캡션(D-12)이 그 몫이다.
- **배포 환경** — 프론트 Vercel · 백엔드 Cloud Run. radar-gw 는 gh-trade 와 공유하는 호스트다(지우지 말 것 · 변경 전 알림 · 20:00 이후 · `docs/relay-operations.md`). **「relay 먼저 · push 나중」** — push 가 곧 webapp 프로덕션 배포다.
- **gh-trade 인박스** — 세션 시작 때 `docs/inbox/from-gh-trade/` 의 `status: open` 노트를 먼저 읽는다. 요청은 `scripts/trade-handoff.sh <slug>` 로 만든다(D-21 = 플랜 1).
- **GSD 워크플로 강제** — 파일 변경은 GSD 명령 안에서만 한다.
- **메모리 규칙(관련분):** Supabase RPC 는 `REVOKE … FROM PUBLIC` + `FROM anon, authenticated` 를 명시한다 · 새 표 RLS 정책을 만들 때는 `TO anon, authenticated` 둘 다(이 phase 는 정책 0개 = service_role 전용) · lightweight-charts 금지(순수 SVG) · 비밀 주입(Secret Manager · 119 `authorized_keys`)은 사용자가 `!` 로 실행한다 · 서브에이전트는 배포하지 않는다(커밋까지) · 동시 세션에서는 vitest `--maxWorkers=2` · playwright `--workers=1` · 샌드박스는 raw TCP · IAP SSH 를 막는다(radar-gw 스모크는 `dangerouslyDisableSandbox`) · 보안검사(`/gsd-secure-phase`)는 생략하고 nyquist 는 유지한다.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌──────────────────────── 과거 날짜(D-02~D-04) ────────────────────────┐
 gs://gh-trade-tick-archive/raw/{krx,nxt}/<D>/<D>-HHMM[-N].pcap.zst  (ARCHIVE · D+1 22:00 → D-01 뒤 D 22:00)
        │ (Cloud Storage 볼륨 마운트 ro · 같은 리전)
        ▼
 Cloud Run Job gh-radar-tick-convert ── mode=nightly(Scheduler 23:30·01:30) | request(--date --ex --isin…) | promote(20:10)
   ① 대상 후보: RPC(limitup_accum_flow D ∪ kind16 D) ─┐
   ② 시간 파일 순 스트리밍: zstd 해제 → 이더넷/IP/UDP 벗김 → (태그별 ISIN 오프셋) → (isin, 거래소) 키
   ③ 키별 레코드 → 압축 청크 스테이징(메모리) + A3 15% 판정(KRX G1 ∪ NXT G1, 정수 경계)
   ④ 대상 = ①∪③ → 키 청크를 풀어 「pcap-ns 레코드」 zstd-9 한 파일 ─▶ Storage tick-grid/grid/<D>/<EX>/<isin>.ticks.zst
   ⑤ RPC tick_grid_upsert(메타: 출처 칩 · 크기 · 건수 · 등락률) · 요청 큐 finish · 90일 purge(표 + Storage API)
        │
        ▼
 Supabase(DB: tick_grids · tick_convert_requests · RPC 게이트) / Storage(비공개 · 정책 0)
        ▲ RPC 1회 + createSignedUrl 1회                         ▲ 서명 URL 로 직접 다운로드(Cloud Run 무경유)
        │                                                       │
 Browser /analytics/ticks ── GET /api/ticks/{day,today,open} ──▶ server(Cloud Run · requireAuth · 게이트 RPC)
        │      POST /api/ticks/convert ─▶ server ─(RPC 큐 삽입 · 생성자만)─▶ Cloud Run Admin API jobs:run(overrides)
        │      GET  /api/ticks/live?isin&ex&epoch&offset ──▶ server ──(Direct VPC · 공유 비밀)──▶ radar-gw:8092 tickgw
        │                                                                                   │ 키당 폴러 1 · 5초 · 리스 30초
        │                                                                                   │ ssh ControlMaster(tickpull 키)
        │                                                                                   ▼
        │                                                     119 인덱서 강제 명령(isin ex date from_ns to_ns)
        │                                                       → stdout: zstd(pcap-ns 레코드) · stderr: JSON 끝 줄
        ▼
 fzstd 스트리밍 해제 → 레코드 인덱스(typed arrays) → 거래소순 순열 → A3 열 디코딩(즉시) · B6(지연)
   → 주문 묶기/팀/손익(shared 순수 함수) → 3판 차트 · 슬라이더 · 호가 10단 · 전문 목록(고정 높이 창) · 팀 패널
```

### Recommended Project Structure
```
packages/shared/src/ticks/
├── framing.ts        # pcap-ns 레코드 읽기/쓰기(16B 헤더 + 페이로드) · 이더넷 pcap(LINKTYPE 1) 페이로드 벗기기
├── layouts.ts        # LAYOUTS 표(packets.py 데이터 그대로) + import 때 자체검사(check_layout 동형)
├── decode.ts         # uint · price · value22 · dec6 · time12 · str · euckr 필드 파서(Uint8Array, offset)
├── index.ts          # 레코드 인덱스(오프셋 · 태그 · 보드 · seq · recv) + 거래소순 순열
├── orders-krx.ts     # classify_orders 이식(입력 순서 계약 그대로)
├── orders-nxt.ts     # tag_runs + classify_nxt_team_orders 이식
├── pnl.ts            # team_pnl 이식 + 접두(prefix) 상태 배열(선택 틱까지 증분)
├── book.ts           # 선택 틱 → 마지막 B6 인덱스 표 · 10단 재구성
├── density.ts        # 5분 거래대금 밀도 · VI 구간(R8)
└── __fixtures__/     # 오라클 생성물(JSON · .ticks.zst) — 재생성 명령을 머리 주석에
workers/tick-convert/  # limitup-sync 뼈대(config · logger · purge · 종료 코드) + scan · stage · upload
tickgw/                # radar-gw 컨테이너(node 내장만) — ssh 폴러 · 캐시 · /internal/ticks/*
server/src/{routes,services,schemas}/ticks.ts
webapp/src/app/analytics/ticks/page.tsx · components/ticks/* · lib/ticks/*
supabase/migrations/2026110xxxxxxx_tick_viewer.sql · supabase/tests/tick_viewer.test.sql
scripts/deploy-tick-convert.sh · scripts/deploy-tickgw.sh · infra/relay/tickpull/(install.sh · known_hosts 지문 대조)
```

### Pattern 1: 레코드 프레이밍 = 「pcap-ns 레코드」(격자 · 119 응답 · 브라우저 공통)
**What:** 레코드마다 16B 헤더 `<IIII` = `ts_sec · ts_nsec · incl_len · orig_len`(리틀엔디언 · pcap-ns 와 같다) 뒤에 **원본 UDP 페이로드**(전문 1건)를 붙인다. 전역 헤더 24B 는 넣지 않는다. 그래서 여러 응답 · 여러 zstd 프레임을 이어붙여도 그대로 유효한 스트림이다. 거래소 라벨은 파일 · 요청 단위(`exchange` 인자)로 둔다. 전문 자체에도 정보구분 첫 글자로 들어 있다(`'0'`→KRX · `'5'`→NXT).
**Why:** pcap2parquet 와 같은 레코드 헤더라 D-21 ② 「pcap-ns 와 같은 프레이밍」 제안을 그대로 지킨다. 실측 압축 크기(zstd -9)는 천일 10/14 1,015,449B, 자체 11B 헤더 961,966B(+5.6%) 다. 한선 10/14 는 6,814,785B 대 6,604,692B(+3.2%) 다. 전체 이더넷 프레임 pcap 은 gzip 기준 +36% 다. 디버깅이 필요하면 전역 헤더(magic `0xA1B23C4D` · linktype 147 USER0)를 앞에 붙여 tcpdump 로 볼 수 있다.
**Source of truth:** pcap2parquet 의 레코드 순회 `[VERIFIED: gh-trade server/tools/analysis/tickana/pcap2parquet.py:42-43,281-330]` — `_REC = struct.Struct("<IIII")` · `_GHDR = struct.Struct("<IHHiIII")` · `PCAP_MAGIC_NS = 0xA1B23C4D`(:34) · 이더넷 → IPv4(`buf[fr + 12] != 0x08 or buf[fr + 13] != 0x00`) → UDP(`buf[fr + 23] != 17`) → `ihl = (buf[fr + 14] & 0x0F) * 4` · `p = udp + 8` · `q = udp + ulen`.

```typescript
// packages/shared/src/ticks/framing.ts — 형태 예시 (값은 pcap2parquet.py:42-43 · :281-330 에서)
export const REC_HDR = 16;
export interface RecRef { recvNs: bigint; off: number; len: number } // off = 페이로드 시작
export function* records(buf: Uint8Array): Generator<RecRef> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  for (let p = 0; p + REC_HDR <= buf.length; ) {
    const s = dv.getUint32(p, true), ns = dv.getUint32(p + 4, true), incl = dv.getUint32(p + 8, true);
    const end = p + REC_HDR + incl;
    if (end > buf.length) break;                       // 잘린 꼬리 — 다음 청크와 이어 읽는다
    yield { recvNs: BigInt(s) * 1_000_000_000n + BigInt(ns), off: p + REC_HDR, len: incl };
    p = end;
  }
}
```

### Pattern 2: 디코더 = LAYOUTS 를 「데이터」로 옮기고 파이썬 덤프와 대조
**What:** `layouts.ts` 는 (태그, 길이) 키에 필드 목록 `[name, offset, length, kind]` 을 그대로 담는다. 모듈을 읽을 때 `check_layout` 과 같은 자체검사(빈틈 · 겹침 · 합 = 크기 · price 11B · time12 12B)를 돈다. 그리고 **파이썬이 덤프한 LAYOUTS JSON 과 배열이 같은지** 단위 시험으로 확인한다. 손으로 옮길 때 오타가 나면 그 자리에서 잡힌다.
**Discrete values(verbatim):** `[VERIFIED: gh-trade server/tools/analysis/tickana/packets.py:90-275]`
- QuoteHeader(A3·B6·R8 공통): `.add("data_cat", 0, 2, "skip")` · `.add("info_cat", 2, 3, "str")` · `.add("msg_seq", 5, 8, "uint")` · `.add("board_id", 13, 2, "str")`
- A3: `.add("session_id", 15, 2, "str")` · `.add("isin", 17, 12, "str")` · `.add("issue_idx", 29, 6, "uint")` · `.add("trade_time", 35, 12, "time12")` · `.add("price_change_type", 47, 1, "str")` · `.add("price_change", 48, 11, "price")` · `.add("trade_price", 59, 11, "price")` · `.add("trade_qty", 70, 10, "uint")` · `.add("open_price", 80, 11, "price")` · `.add("high_price", 91, 11, "price")` · `.add("low_price", 102, 11, "price")` · `.add("cum_volume", 113, 12, "uint")` · `.add("cum_value", 125, 22, "value22")` · `.add("final_bs_code", 147, 1, "str")  # '1' 매도, '2' 매수` · `.add("lp_hold_qty", 148, 15, "uint")` · `.add("ask1_px", 163, 11, "price")` · `.add("bid1_px", 174, 11, "price")` · `.add("eot", 185, 1, "skip")` → `Layout("a3", "A3", 186, …)`
- B6: `b.add("proc_time", 35, 12, "time12")` · 단계 i: `s = 47 + 46 * (i - 1)` → `ask{i}_px s 11 price` · `bid{i}_px s+11 11 price` · `ask{i}_qty s+22 12 uint` · `bid{i}_qty s+34 12 uint` · `.add("total_ask_qty", 507, 12, "uint")` · `.add("total_bid_qty", 519, 12, "uint")` · `.add("est_price", 531, 11, "price")` · `.add("est_qty", 542, 12, "uint")` · `.add("mid_price", 554, 11, "price")` · `.add("mid_ask_qty", 565, 12, "uint")` · `.add("mid_bid_qty", 577, 12, "uint")` · `.add("eot", 589, 1, "skip")` → `Layout("b6", "B6", 590, …)`
- R8: `.add("isin", 15, 12, "str")` · `.add("issue_idx", 27, 6, "uint")` · `.add("proc_time", 33, 12, "time12")` · `.add("vi_end_time", 45, 9, "str")` · `.add("vi_status", 54, 1, "str")  # '1' 발동, '2' 해제` · `.add("vi_type", 55, 1, "str")  # '1' 정적, '2' 동적, '3' 정적+동적, '4' NXT VI연장` · `.add("base_price_svi", 56, 11, "price")` · `.add("base_price_dvi", 67, 11, "price")` · `.add("trigger_price", 78, 11, "price")` · `.add("disparity_svi", 89, 13, "dec6")` · `.add("disparity_dvi", 102, 13, "dec6")` · `.add("eot", 115, 1, "skip")` → `Layout("r8", "R8", 116, …)`
- B9·C3 헤더 23B: `.add("info_cat", 2, 3, "str")` · `.add("isin", 5, 12, "str")` · `.add("issue_idx", 17, 6, "uint")`. B9 단계 i: `s = 23 + 78 * (i - 1)` → `lv{i}_sell_member s 5 str` · `lv{i}_sell_qty s+5 12 uint` · `lv{i}_sell_value s+17 22 value22` · `lv{i}_buy_member s+39 5 str` · `lv{i}_buy_qty s+44 12 uint` · `lv{i}_buy_value s+56 22 value22` · `b.add("eot", 413, 1, "skip")` → 414B. C3 = 23~398 의 24필드(`sell_arb_rem 23 15 uint` … `prop_buy_nonarb_value 377 22 value22`) + `eot 399` → 400B.
- A0 632B 도 LAYOUTS 에 있다(`Layout("a0", "A0", 632, …)` · `name 54 40 euckr` · `base_px 175 11 price` · `upper_px 232 11 price`). D-19 의 다섯 태그 밖이지만 같은 표로 옮긴다(종목명 · 기준가 · 상한가 확인용). 옛 631B 는 raw 로 남는다.
- 키 규칙: `LAYOUTS[(_lay.tag, _lay.size)] = _lay` — **(태그, 길이)가 정확히 맞을 때만** 디코딩한다(:272-275). 필드 수는 A3 22 · B6 56 · R8 16 · B9 35 · C3 29 · A0 32 다 `[VERIFIED: 파이썬 덤프 이번 세션]`.

**필드 파서 의미(verbatim):** `[VERIFIED: packets.py:285-348]`
- `uint`: 숫자 바이트만 이어 붙인다(비숫자는 건너뛴다).
- `price`: `v = parse_uint(sub[:, 2:11])` · `neg = sub[:, 0] == ord("-")` — 바이트0 부호, 바이트1 미사용, 2..10 숫자.
- `value22`: `'.'` 에서 멈춘 정수부.
- `dec6`: 소수점 뒤 자릿수로 나누고 `'-'` 가 있으면 음수.
- `time12`: `kst_day = (recv_ns + KST_OFFSET_NS) // DAY_NS` · `ns = midnight_utc + (hh*3600 + mm*60 + ss)*1e9 + us*1000` — **날짜는 수신 시각(KST)의 날짜**이고, 비숫자가 하나라도 있으면 null.
- `str`: 128 이상 → `'?'` · NUL → 공백 · 오른쪽 공백 제거.
- `exchange_of`: 정보구분 첫 글자 `'0'`→`"KRX"` · `'5'`→`"NXT"` · 그 밖은 `label.upper()`(:412-423).
- `market_of`: 정보구분 셋째 글자(:426-430).

**지연 디코딩:** 브라우저는 A3 만 열(column) 배열로 즉시 디코딩한다. B6(행의 ~70%)는 커서 호가와 보이는 목록 행만 그때 디코딩한다. 실측 비율은 천일 10/14 A3 10,164 · B6 27,291 · B9 342 · C3 899 · R8 4 다 `[VERIFIED: 이번 세션 per-stock 추출]`.

### Pattern 3: 「거래소순」 = 보드별 msg_seq 재배열(수신 자리 안에서)
**What:** 수신순 인덱스 배열에서 (보드)마다 「그 보드 행들이 차지한 수신 자리 집합」을 구한다. 그 자리에 그 보드 행들을 **msg_seq 오름차순**으로 다시 채운다. B9·C3(순번 없음)과 길이가 안 맞는 raw 행은 수신 자리를 그대로 둔다. O(n log n)(보드별 정렬)이다.
**Why:** 실측 결과 A3·B6·R8 은 (종목, 보드)마다 한 순번을 나눠 쓴다. 천일 10/14 G1 은 37,454행 · seq 1..37458 · 차이 1 이 37,449 · 차이 2 가 4 이고, 그 4칸이 R8 seq 9090 · 9251 · 24866 · 25236 이다. 한선 10/14 G1 은 273,776행에 차이 2 가 4(= R8 4)다. 다른 보드는 각자 1부터 센다(천일 G2 4..8 · G3 170 · G7 1) `[VERIFIED: 이번 세션 seqs.py — ~/ticks/team-follow/rawpcap/20261014 추출]`. 보드 사이에는 공통 순번이 없으므로, 보드 사이 순서를 「거래소순」으로 지어낼 근거가 없다. 그래서 수신 순서를 따른다. 이것이 스케치 020 「⋯ 거래소순 자리」 점선 줄을 그리는 근거이기도 하다.
**주문 묶기와의 관계:** 묶기는 이 순열과 별개로, 파이썬과 같은 입력 순서(Pattern 4)로 한다. 순열은 표시 · 커서 · 호가 재구성에만 쓴다.

### Pattern 4: KRX 주문 묶기 · 팀 판정 = `classify_orders` 를 한 줄씩 옮긴다
**Source of truth(verbatim):** `[VERIFIED: gh-trade tickana/teamflow.py:96-134]`
- 같은 주문: `joined = (np.diff(seq) == 1) & (bs[1:] == bs[:-1])` · isin 열이 있으면 `joined &= isin[1:] == isin[:-1]` · `new[1:] = ~joined` · `oid = np.cumsum(new) - 1`.
- 「입력 순서 계약: 프레임 순서 그대로 본다(정렬하지 않는다)」.
- 종류: `np.select([~continuous, max_same >= 2, (pieces == 1) & last_zz, (n_px >= 2) & last_zz], [KIND_AUCTION, KIND_SMP, KIND_ZZ_ALONE, KIND_ZZ_SWEEP_END], default=KIND_NORMAL)` · `continuous = np.isin(first_bs, ["1", "2"])` · `team = SMP ∪ 0/0 단독 ∪ 0/0 스윕 끝`. 종류 문자열은 `"단일가"` · `"자전거래방지"` · `"0/0 단독"` · `"0/0 스윕 끝"` · `"일반"`(:37-41).
- 0/0: `A["zz"] = (A["a1"] == 0) & (A["b1"] == 0)`(prepare_frame :246-256).

**범위(scope) 두 벌 — 반드시 인자로 받는다:**
| 범위 | 입력 집합 · 순서 | 오라클 | 근거 |
|------|------------------|--------|------|
| `teamflow`(§5-1 손익 골든) | KRX `board_id='G1'` · `order by isin, msg_seq` | `limitup_team_flow.payload.pnl` | `load_day_parquet` `[VERIFIED: teamflow.py:68-86]` |
| `accum`(매집감지 · 3판 차트 · **뷰어 기본**) | KRX `board_id in ('G1','G4')` · `order by isin, trade_time_ns, msg_seq` | `limitup_accum_flow.payload.pnl` · `day_buy_krw` · `day_cum_net` | `load_day_a3` 「KRX msg_seq 는 보드 세션마다 다시 시작해(G4 는 47~ 부터)」 `[VERIFIED: teamflow_accum.py:282-300]` |

뷰어는 08:00~20:00 를 보여 주므로 KRX 기본 범위를 `accum`(G1+G4)으로 둔다. 한 종목 · 한 날짜 · 한 범위 안에서는 isin 이 하나라서 isin 조건이 항상 참이다. 그래도 구현은 파이썬과 같은 식을 둔다.

### Pattern 5: NXT 런 = `tag_runs` + `classify_nxt_team_orders`
**Source of truth(verbatim):** `[VERIFIED: gh-trade tickana/nxt_runs.py:44-76 · nxt_fixture.py:112-134]`
- 입력: `A = A[A["board_id"] == "G1"]` · B6 도 G1 · `M.sort_values(["isin", "msg_seq"], kind="stable")`.
- 런: `same = (A["msg_seq"] == prev_seq + 1) & (A["final_bs_code"] == prev_bs)` — prev 는 「B6 를 건너뛴 직전 A3」(같은 isin 그룹 shift).
- 팀: `if bs not in ("1", "2"): continue` · `maxsame = int(d["trade_price"].value_counts().max())` · `if maxsame < 2: continue` · 값 = 조각 합 · 시각/가격 = 마지막 조각.
- 오라클 실측(이번 세션 재실행): `== nxt: isin=1 A3=3219 B6=8255 runs>=2=179 smp=65 closing_b6_ok=2833/2833 inverted=90/179 all_late=38 …` · `== krx: isin=1 A3=3089 B6=8901 runs>=2=182 smp=70 closing_b6_ok=2687/2687 inverted=84/182 all_late=1 …` — ISIN `KR7101360006`(에코앤드림) `[VERIFIED: nxt_runs 재실행 · ~/ticks/cut-101360/parquet]`.
- **NXT 손익**은 같은 평균단가법을 NXT 팀 주문 조각에 적용한다(D-13). export 에 NXT 손익이 없으므로 골든은 `AccumNxtFixtures.h` 의 NXT 단독 창 기대값으로 한다: `kAccumNxt_Expect` — 13:30~13:40 · NXT 팀 주문 13 · 매수 7,901주/82,023,350원 · 매도 4,632주/49,348,980원 `[VERIFIED: gh-trade server/tests/support/AccumNxtFixtures.h:2350-2354]`.
- 완성 4경로(D-13)는 실시간 송출용이다. 뷰어는 전체(또는 당일 증분) 자료를 가지므로, 판정은 「다음 A3 의 seq ≠ +1 · bs 변경」 또는 「seq = 마지막+1 인 B6 존재」로 닫힌다. 스트림 끝에서 열린 마지막 런만 「진행 중(잠정)」으로 표시한다.

### Pattern 6: 손익 = `team_pnl` 이식 + 접두 상태 배열(선택 틱까지)
**Source of truth(verbatim):** `[VERIFIED: gh-trade tickana/teamflow.py:650-699]` — `T = P[P["team"] & P["bs"].isin(["1", "2"])]` · `T = T.sort_values("t", kind="stable")` · 매수 `hold += q; cost += q*px` · 매도 `m = min(q, hold)`, `avg = cost / hold`, `realized += m*(px-avg)`, `cost -= m*avg`, `hold -= m`, `if hold == 0: cost = 0.0` · `unknown_qty += q - m` · `realized_val = int(round(realized))` · `end_cost_val = int(round(cost))` · `unrealized_val = hold * int(last_px) - end_cost_val` · `ret = total_val / buy_val if buy_val else None`. 키 13개 순서: `buy_val, buy_qty, sell_val, sell_qty, realized_val, realized_qty, unrealized_val, total_val, ret, end_qty, end_cost_val, unknown_sell_qty, unknown_sell_val`.
- `last_px` = 입력 순서 마지막 행의 px(teamflow: msg_seq 순 마지막 · accum: `int(A["px"].iat[-1])` — (t, seq) 순 마지막) `[VERIFIED: teamflow.py:259-277 · teamflow_accum.py:479]`.
- **반올림 함정:** 파이썬 `round()` 는 은행가 반올림(짝수 쪽)이다. JS `Math.round` 는 .5 를 위로 올린다. 경계값에서 1원 어긋날 수 있으므로 `roundHalfEven` 을 따로 쓴다.
- **증분(D-10):** 팀 체결을 pnl 순서로 한 번 돌면서 체결마다 `(hold, cost, realized, buy/sell 합, unknown)` 을 Float64Array 접두 배열에 남긴다. 선택 틱 T → `T 이하 마지막 팀 체결` 이진 탐색 → 미실현 = `hold × (T 시점 마지막 체결가) − cost`. 주문의 팀 여부는 전체 조각으로 정한 최종 분류를 쓴다(조각이 커서 앞뒤로 갈려도 같은 주문이다). 당일 스트림 끝의 열린 주문만 잠정이다.

### Pattern 7: 호가 재구성 · 「t」 점프 · 5분 밀도
- **마지막 B6 표:** 거래소순 순열을 한 번 돌며 `lastB6[k]` = k 이하에서 같은 보드의 마지막 B6 레코드 인덱스(Int32Array)를 만든다. 선택 행이 B9/C3 면 그 앞 마지막 seq 있는 행 기준이다. 커서 → `decodeB6(lastB6[pos])` 10단이다. 보드는 기본 G1 이고, 선택 행의 보드가 G1 이 아니면 그 보드의 B6 를 쓴다. B6 가 아직 없으면(장 시작 전) 「호가 없음」을 보인다. 늘 「호가 기준 seq N · Δms 전」 을 함께 보인다.
- **NXT 0/0 부재:** 호가는 B6 로만 재구성하므로 A3 의 0/0 여부와 무관하다. 실측 NXT 런 2,833개 전부에 닫는 B6(seq = 마지막+1)가 있었다(`closing_b6_ok=2833/2833`). 그래도 계약 ④로 확인한다.
- **「주 | 금액」:** 금액 = 잔량 × 그 단 가격. 바닥 줄은 총잔량(`total_ask_qty`/`total_bid_qty`) ↔ 10단 금액 합이다.
- **`t` 점프(D-18):** URL `HH:MM:SS.mmm`(KST) → epoch ns(BigInt) → 수신순 recv 배열(로드 때 안정 정렬 · 이미 단조면 생략)에서 lower_bound(≥ t) → 그 레코드를 현재 모드의 표시 인덱스로 옮긴다.
- **5분 밀도:** 08:00~20:00 = 144칸. 칸 값 = 그 칸 A3 `px × qty` 합(그 거래소 · 모든 보드 · 단일가 포함)이고, 막대 높이는 √ 또는 log 정규화로 한다. VI 눈금 = R8 `vi_status` `'1'` 발동 · `'2'` 해제 수신 시각이다.

### Pattern 8: 전문 목록 = 고정 높이 창 가상화(자체 훅)
**What:** 표시 항목을 평평한 Int32 배열로 만든다(`kind<<28 | recordIdx`: 전문 행 · 꼬리 줄 · 「⋯ 거래소순 자리」 점선 줄). 모든 항목을 같은 높이 H(데스크톱 22~24px)로 둔다. `first = floor(scrollTop/H)` · `count = ceil(viewportH/H)+overscan` · 위아래 spacer 로 그린다. 선택 이동은 `scrollTop` 을 직접 맞춘다. 한선 10/14 극단(KRX 276,659건)이어도 DOM 은 ~60행이다.
**Why:** 행 높이를 측정할 필요가 없고(라이브러리가 푸는 어려운 부분), 「다음 역전」 · 「끝으로」 · 키 이동 같은 점프는 인덱스 산술이다. 꼬리 줄은 한 줄, 70조각 주문은 71행 + 꼬리 1행 — 020 채택 그대로 고정 높이와 맞는다.

### Pattern 9: 차트 = accum 헬퍼 재사용 + 새 `TickChart`(AccumChart 는 손대지 않는다)
- 그대로 재사용(상태 없는 함수): `xOfView` · `tOfView` · `yOfPrice` · `priceTicksOf` · `priceAxisWidthOf` · `orderRadiusOf` · `orderCirclesOf`류 · `cumRangeOf` · `yOfCum` · `cumTicksOf` · `bucketBarsOf` · `gapBandOf` · `labelRowsOf` · `nearestOrderOf` · `orderGroupOf` · `zoomAt` · `panBy` + 훅 `useChartGestures` · `useChartWidth` `[VERIFIED: webapp/src/lib/accum-chart.ts export 목록 · hooks/use-chart-view.ts]`.
- 그대로는 못 쓰는 것(일반화 또는 새로 쓰기):
  - `dayBoundsOf(t0ms)` 는 「T0 = 09:00 · T1530 · T1600 · T2000」 고정 오프셋이다(:48-50). 뷰어는 08:00 시작이다(장전 음영).
  - `MIN_VIEW_MS = 10 * 60_000`(:32)과 `clampView`/`zoomView` 가 그 상수를 직접 쓴다. 뷰어는 「1분」「10초」 가 필요하다.
  - `ticksOf` 의 `TICK_STEPS` 최소가 5분이다.
  - `AccumChart` 는 `row: AccumDetailRow` · `payload: AccumReportPayload`(10초 칸 `price.idx`)에 묶여 있다.
- **권고:** `useChartView`/`clampView`/`zoomView` 에 `minViewMs` 선택 인자를 더한다(기본값 = 현행 → accum 회귀 0). `lib/tick-chart.ts` 에 08:00 경계 · 1초~3시간 눈금 · **열(픽셀)별 min/max 솎음 가격 선**(보이는 창의 체결만, 열마다 첫 · 최소 · 최대 · 끝 4점)을 둔다. `components/ticks/tick-chart.tsx` 는 AccumChart 레이어 순서를 복제하고, 커서 선 · VI 띠 · 장전 음영만 더한다. 회색 누적 선은 `limitup_accum_flow.payload.pos_net` 이 있을 때만 `posNetPointsOf`/`posNetPathOf` 로 그린다(D-09).
- 색은 globals.css 토큰을 쓴다. lightweight-charts 는 쓰지 않는다(oklch 거부 — 메모리 규칙).

### Pattern 10: 진입 · 연결
- 검색: `GlobalSearch` 는 prop 이 없다. `useDebouncedSearch` + cmdk `Command` 로 `TickStockPicker(onSelect(isin, code, name))` 를 새로 만들고, 제안 행 상태 칩은 `tick_day_for_user` 결과로 칠한다. 검색 응답에 `isin` 이 있다(`packages/shared/src/stock.ts:26,79` 「isin: string | null」).
- 「틱 보기」 시각:
  - 매집감지 = `reg_time_ms`(목록 RPC 평평한 열 · `accum-report.ts:49`).
  - 상한가 = `entry.first_upper_ms ?? t20_ms`(`limitup-report.ts:40,44`).
  - 팀 매집 = `payload.reach.t_ms ?? first_limit_ms`(`teamflow-report.ts:154,174`). 「첫 20% 도달」 폴백은 team_flow 행에 없다 → Open Question 2.
  - 모두 `/analytics/ticks?isin&d&ex=KRX&t=HH:MM:SS.mmm` 이다.
- 사이드바: `NAV_ACCUM` 다음에 `{ href: "/analytics/ticks", label: "틱 전문 뷰어" }` 를 둔다(`app-sidebar.tsx` NAV 상수 · 34 D-27 동형).

### Pattern 11: 변환 Job `gh-radar-tick-convert`(limitup-sync 뼈대)
- **입력:** GCS 볼륨 마운트(ro) `/mnt/tick/raw/<krx|nxt>/<D>/`.
  - 10/30 실측 목록: KRX 24객체 3,608,355,407B(3.36GiB) · NXT 24객체 836,701,697B. 08~20시 파일이 대부분이고 05~06시 파일(A0)은 0.7~2.9MB 다 `[VERIFIED: gcloud storage ls -l gs://gh-trade-tick-archive/raw/{krx,nxt}/20261030/]`.
  - **10/30 시각 집합(준비 판정 근거):** 두 라벨 모두 `20261030-0000` ~ `20261030-2300` 매시 1개(24개 · `-N` 없음). 기록기는 게으른 열기(gh-trade `recorder/README.md:38` — 무수신 시간대엔 파일 없음)지만 멀티캐스트가 밤에도 흘러 매시 파일이 생긴다 — KRX 00~04시 ~53KB · 05시 0.71MB · 06시 2.87MB · 07시 67KB · 08시 15.0MB · 09시 849MB · 18시 58.7MB · **19시 96.8MB · 20시 5.4MB**(마지막 체결 ≈ 18:00 이어도) · 21~23시 25~55KB / NXT 00~04시 ~9.6KB · 05~07시 ~290KB · 08시 168MB · 19시 41.3MB · 20시 2.97MB · 21시 294KB · 22~23시 ~9KB. 그래서 「08~20시 두 라벨 매시 존재」 판정(37-06 `isDayReady`)은 정상일에 참이다 · 한 시각이 영영 없는 날(기록기 정지)만 2일 유예 뒤 `partial` `[VERIFIED: gcloud storage ls -l 2026-11-02 플래너 재확인]`.
  - **업로드 시각(10/30 분 · 10/31 22:00 회차):** KRX 22:00:22 ~ 22:59:48 KST(0900 객체 22:14:50) → NXT 22:59:53 ~ 23:14:22 KST. 시각순 · 라벨순으로 하나씩 올라간다 `[VERIFIED: 같은 목록의 생성 시각]`.
  - 같은 시각에 `-N` 접미 파일이 생길 수 있다(기록기 재기동). 첫 레코드 시각순으로 정렬한다.
  - 읽는 범위 = 05~20시 파일(A0 포함 · 21~23시 제외).
- **스트리밍:** `fs.createReadStream(…, {highWaterMark: 8 MiB}).pipe(zlib.createZstdDecompress())` → pcap-ns 전역 헤더 검사(magic · linktype 1) → 레코드 순회 → 이더넷/IPv4/UDP 벗김 → 태그별 ISIN 오프셋.
  - 오프셋: A3/B6 17 · R8 15 · B9/C3 5 · A0 27 `[VERIFIED: packets.py 레이아웃 — isin 필드 오프셋]`.
  - **길이가 레이아웃과 달라도 같은 태그면 같은 오프셋으로 거른다** — 규격이 바뀌어도 「기타」 행으로 남기 위해서다.
  - 실측: 1시간 파일 846만 패킷을 6.4초 · RSS 181MB 에 처리했다 `[VERIFIED: scan.mjs 이번 세션]`.
- **대상 판정(단일 통독):** 키(isin, 거래소)별 레코드를 64KB 원시 버퍼에 모으고, 차면 `zstdCompressSync(level 1)` 로 압축 청크 목록에 붙인다(메모리 스테이징). 같은 패스에서 A3 15% 를 판정한다.
  - **판정식 = 119 배치 탐지와 같은 체결 단위 정수식:** `pct ∈ {'1','2'} ∧ chg·100 ≥ (px − chg)·15`(KRX G1 · NXT G1 각각 — 어느 쪽이든 참이면 그 ISIN 이 대상) `[VERIFIED: gh-trade tickana/batch.py:209-247 detect_isins — base = px − chg · 상한 '1'·상승 '2' · KRX G1]`.
  - 대상 = DB 등록(①) ∪ 15%. 끝나면 대상 키만 청크를 풀어 zstd-9 한 파일로 다시 압축해 올리고, 나머지는 버린다.
- **메모리 · CPU:** 10/14 KRX 전 종목 원시 페이로드 23.4GB(키 2,840)다 `[VERIFIED: dayscan.py]`. 압축 스테이징 ≈ 7~10% → ~2~3GB(NXT 포함)다. `--cpu=4 --memory=8Gi --task-timeout=3600s --execution-environment=gen2`. 예상 소요는 맥 실측(1.31M pps 단일 스레드)을 Cloud Run vCPU 로 환산해 3~8분이다(SC3 실측 대상).
- **모드:**
  - `nightly`: Scheduler `30 23 * * *` · `30 1 * * *` Asia/Seoul. 최근 10일 중 「08~20시 객체가 두 라벨 모두 있고 아직 변환 안 된」 날짜를 다 한다(catch-up). D-01 전에는 D+1 23:30 에, 뒤에는 D 23:30 에 자동으로 맞는다.
  - `request`: `--date D --ex KRX --isin X[,Y…]` — 스테이징 없이 그 키만 바로 쓴다. 시작할 때 같은 (date, ex) 의 pending 요청을 모두 claim 해 한 통독으로 처리한다.
  - `promote`: Scheduler `10 20 * * 1-5` — tickgw `/internal/ticks/export` 에서 「08:00 부터 끊김 없이 완결」인 키만 받아 `source='promoted'` 로 올린다. 밤 변환본이 덮어쓴다(D-04).
- **ETA(D-03 「약 N분」):** `ETA_s = 40(콜드 스타트) + Σ객체 바이트 / R`. R 초깃값 = 100MB/s(4 vCPU 가정) → KRX ≈ 75초 · NXT ≈ 50초 → 「약 1~2분」. SC3 실측 뒤 R 을 env 로 고친다. 목업 「약 4분」은 가정값이다.
- **비용:** Archive 꺼내기 ≈ $0.05/GB `[CITED: 2brightsparks · nops.io — 공식 표 직접 확인 실패]` → 밤 1회 ≈ 4.2GB ≈ $0.21 · 요청 변환 KRX ≈ $0.17 · NXT ≈ $0.04. 요청 변환 하루 상한 `TICK_REQUEST_DAILY_CAP`(권고 20)을 둔다.
- **권한:** Job SA `gh-radar-tick-convert-sa` 에 `gs://gh-trade-tick-archive` 버킷 단위 `roles/storage.objectViewer`(D-21 ⑤ — gh-trade 에는 알림만) + Secret accessor(service role) + Direct VPC egress(promote 가 tickgw 에 닿게). 실행 SA(server)에 그 Job 단위로 overrides 실행 권한을 준다.

### Pattern 12: 당일 경로 = radar-gw 컨테이너 `tickgw`(relay 와 분리)
- **왜 relay 가 아닌가:** relay 컨테이너는 `--memory=384m` / `--memory-swap=768m` 이다 `[VERIFIED: scripts/deploy-relay.sh:839-840]`. 그리고 주문 경로다. radar-gw 는 e2-small 2GB 이고 gh-trade `tick-archive`(MemoryMax 600M)와 `limitup-pull`(300M)이 같이 산다.
- **배치:** `docker run --network=host --memory=256m --user <tickpull uid> -v /var/lib/tickpull/.ssh:/ssh:ro` · 포트 `:8092` · 방화벽 `tcp:8092 ← 10.10.0.0/26`(기존 `relay-allow-internal-order` `tcp:8091 ← 10.10.0.0/26` 동형 `[VERIFIED: infra/relay/README.md:32 · scripts/setup-relay-iam.sh:301]`).
  - 키 · known_hosts 는 `infra/relay/tickpull/install.sh` 가 limitpull 문법(전용 사용자 · 키는 없을 때만 · 119 호스트키 지문 대조 `SHA256:7s4iOpsEMcJkjLHD9KpGv7TIDXxJj2ip5Na+hU4aiJY` — gh-trade README 2026-10-05 값)으로 만든다.
  - 119 등록 줄은 사용자가 넣는다(`restrict,command="…tick-index-query…" ssh-ed25519 … radar-gw-tickpull`).
  - 공유 비밀은 Secret Manager 새 비밀 하나를 server env 와 tickgw env-file 에 넣는다(deploy-relay.sh tmpfs env-file 패턴).
- **ssh:** `ssh -i /ssh/id_ed25519 -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/ssh/known_hosts -o ControlMaster=auto -o ControlPath=/tmp/tp-%C -o ControlPersist=120 smok95@10.16.207.119 <isin> <ex> <date> <from_ns> <to_ns>`. 연결 하나에서 채널을 다중화한다(5초마다 새 핸드셰이크를 하지 않는다).
- **폴링 · 캐시 규율:**
  - **키(isin, ex, 오늘)당 폴러 1.** server 요청이 오면 30초 리스를 갱신하고, 리스가 끝나면 폴링을 멈춘다. 간격은 5초(±0.5초 지터)다.
  - 119 호출 동시성은 전역 1(계약상 1~2). 키가 여럿이면 순환한다 → 키당 실효 간격 = max(5초, 활성 키 수 × 평균 호출 시간).
  - 활성 키 상한 8을 넘으면 「대기 k건」 상태로 돌려준다(목업 상태 카드).
  - **캐시 = 119 가 준 zstd 프레임 원본 그대로**(풀지 않는다 · 다시 압축하지 않는다 → radar-gw CPU 0) + 끝 줄 JSON 의 `last_recv_ns`. 전체 상한 128MB · LRU · 유휴 15분이면 지운다.
  - 응답 = `{epoch, offset → bytes}`(바이트 오프셋 커서). tickgw 가 재기동하면 epoch 가 바뀌고 클라이언트는 전체를 다시 받는다.
  - 극단 종목 하루치 zstd ≈ 7MB(한선 10/14 기준)다.
- **백오프:**
  - ssh 실패 · 시간 초과 → 그 키 5→10→20→40→60초.
  - 「바쁨」(계약 종료 코드, 권고 75 = EX_TEMPFAIL) → 2초 + 지터로 다시 시도하되 실패로 세지 않는다.
  - 119 도달 불가(VPN) → 전역 60초 차단 + 상태 「당일 자료 지연 · n초 전 마지막 수신」.
- **브라우저 폴링(D-06):** `document.visibilityState === 'visible'` ∧ 커서가 끝일 때만 5초 간격이다. 과거 틱을 보는 중이면 멈추고 「새 틱 n건」 배지를 띄운다. 「끝으로」 = 즉시 1회.
  - 서버는 게이트 판정을 사용자별로 60초 프로세스 메모리에 캐시한다(폴링마다 Supabase 왕복을 하지 않게 — 왕복 비용 메모리 규칙).

### Pattern 13: DB 스키마 · RPC(34 D-06 게이트 동형)
```sql
-- 형태 예시 — 열 이름은 플래너 확정. 정책 0개 = service_role 전용(limitup-grid 선례).
CREATE TABLE public.tick_grids (
  date text NOT NULL, exchange text NOT NULL CHECK (exchange IN ('KRX','NXT')), isin text NOT NULL,
  sources text[] NOT NULL,            -- {'accum','up15','request','promoted'} — 진입 목록 출처 칩
  object_path text NOT NULL, bytes bigint NOT NULL, records integer NOT NULL, a3_count integer NOT NULL,
  first_recv_ms bigint, last_recv_ms bigint, high_rate double precision, last_rate double precision,
  fmt text NOT NULL DEFAULT 'pcapns-rec+zstd/1', created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, exchange, isin));
CREATE TABLE public.tick_convert_requests (
  date text NOT NULL, exchange text NOT NULL, isin text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','running','done','failed','cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(), triggered_at timestamptz, started_at timestamptz,
  finished_at timestamptz, error text, PRIMARY KEY (date, exchange, isin));
```
- 웹용 RPC(전부 `p_user_id uuid` 첫 인자 · 첫 줄 `IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN RETURN jsonb_build_object('access', false)` — `[VERIFIED: supabase/migrations/20261020200100_accum_report_rpc.sql]` 와 같은 문법 · jsonb 스칼라 1회 · SECURITY INVOKER · `REVOKE … FROM PUBLIC` + `FROM anon, authenticated` + `GRANT … TO service_role`):
  - `tick_day_for_user(p_user_id, p_date)` → `{access, dates[], date, rows[](isin · exchange · name · sources · high_rate · last_rate · bytes), requests[]}`
  - `tick_today_for_user(p_user_id)` → 오늘 kind 16 등록 ∪ `stock_quotes` 15%(`high ≥ (price − change_amount) × 1.15`, `stocks.isin` 조인 — `stock_quotes` 에 `high` · `change_amount` 열이 있다 `[VERIFIED: supabase/migrations/20260415120000_split_stocks_master_quotes_movers.sql:31-44]`)
  - `tick_open_for_user(p_user_id, p_date, p_isin, p_ex)` → `{access, grid|null, request|null, accum: {reg_time_ms, pos_net}|null}` — server 는 grid 가 있으면 `createSignedUrl` 1회(TTL 600 — `LIMITUP_GRID_URL_TTL_S = 600` 선례 `[VERIFIED: server/src/services/limitup-report.ts:42]`)
  - `tick_request_convert_for_user(p_user_id, p_date, p_isin, p_ex)` → `INSERT … ON CONFLICT DO NOTHING` + `UPDATE … SET triggered_at = now() WHERE status = 'pending' AND (triggered_at IS NULL OR triggered_at < now() - interval '2 minutes') AND NOT EXISTS (running 같은 date·ex) RETURNING` → `{access, request, should_trigger}` — **should_trigger 를 받은 호출자만** Admin API 를 부른다(사용자 수 독립 · 경쟁 안전)
- Job 용 RPC(service_role): `tick_grid_upsert(jsonb)` · `tick_request_claim(p_date, p_ex)` · `tick_request_finish(…)` · `tick_purge_old(p_keep_days)`(90 — Storage 객체는 워커가 storage API 로 지운다: SQL 로 지우면 파일이 남는다 `[VERIFIED: limitup_retention_storage.sql 머리 주석 · workers/limitup-sync/src/purge.ts]`).
- 버킷 `tick-grid`: `public=false` · `file_size_limit` 52428800(50MB) · `allowed_mime_types` `{'application/zstd'}` · `to_regclass('storage.buckets')` 가드(로컬 pgTAP 이미지에는 storage 스키마가 없다 — 선례 `[VERIFIED: 20261006090300_limitup_retention_storage.sql:85-86 — VALUES ('limitup-grid', 'limitup-grid', false, 10485760, ARRAY['application/gzip'])]`).

### D-21 계약 초안(플랜 1 인박스에 그대로 쓸 제안값)
| # | 항목 | 제안 |
|---|------|------|
| ① | tick-archive 완결 | 「같은 줄기 `.pcap` 없음 ∧ KST ≥ 20:30」 → D 의 08~20시 파일을 D 22:00 회차에 올린다. 21~23시 파일은 다음 회차에 올린다. Job 은 「08~20시 두 라벨 존재」로 준비를 판정한다 |
| ② | 강제 명령 | 인자 `isin(12) exchange(KRX\|NXT) date(오늘 YYYYMMDD — 아니면 거부) from_ns to_ns(epoch ns · to_ns=0 = 지금까지)` · stdout = zstd 프레임(내용 = pcap-ns 레코드 `<IIII>` + UDP 페이로드, 전역 헤더 없음, recv 순) · stderr 마지막 줄 JSON `{"fmt":"pcapns-rec/1","records":N,"first_recv_ns":"…","last_recv_ns":"…","has_more":bool,"next_from_ns":"…"}` · 종료코드 0 정상 · 75 동시 초과(바쁨) · 64 인자 오류 · 응답 상한 압축 16MB(초과 → has_more) · 포함 태그 A3/B6/R8/B9/C3/A0(같은 ISIN 오프셋 규칙, 길이 무관) · 동시 1(최대 2) · 사용자 `tickpull` · 등록 줄 `restrict,command="/usr/bin/taskset -c 0 /usr/bin/nice -n 19 /usr/bin/ionice -c 3 <query>"` |
| ③ | 거래소 시각 | A3 `trade_time` · B6 `proc_time` 이 같은 시계인지 · 뷰어 거래소순은 보드별 msg_seq 만 쓴다(Pattern 3 실측 첨부) · R8 이 같은 순번을 쓰는 실측(천일 10/14) 확인 요청 |
| ④ | NXT 호가 공백 | NXT 런 2,833/2,833 이 닫는 B6 를 가진 실측 첨부 · 공백 구간(단일가 · VI) 규칙 확인 |
| ⑤ | GCS 바인딩 | 변환 Job SA 에 `objectViewer` 를 gh-radar 가 붙인다는 알림 |
| + | 기타 태그 | IA · B2 · C0 · B0 · I2 · B5 · P0 · J0 · M4 중 종목 단위(ISIN 오프셋 있음)이고 뷰어에 쓸 만한 것이 있는지 질문(지금은 격자에서 빠진다) |

### Anti-Patterns to Avoid
- **recv_ns 를 JS number 로 들고 다니기:** epoch ns ≈ 1.79e18 > 2^53 이다. 256ns 단위로 뭉개진다(gh-trade 가 겪은 것 — `nxt_runs.py:50` 주석). BigInt64Array 또는 (ms Number + ns 나머지 Uint32)로 둔다.
- **주문 묶기를 거래소순 순열 위에서 하기:** 파이썬 오라클은 범위별 입력 순서(seq 순 또는 (t, seq) 순)를 그대로 본다. 표시 순열과 섞으면 G4 · 다른 보드에서 골든이 깨진다.
- **AccumChart 를 직접 고치기:** 34-06/07 골든 · RTL 이 묶여 있다. 헬퍼 재사용 + 새 컴포넌트로 간다.
- **tickgw 에서 zstd 를 풀거나 gzip 으로 다시 압축하기:** radar-gw 는 공유 코어 · 주문 relay 와 같은 VM 이다. 바이트를 그대로 넘긴다.
- **요청 변환을 사용자 요청마다 Job 실행:** 큐 + `should_trigger` 원자 판정 없이 부르면, 사용자 N 명 = Archive 통독 N 회가 된다.
- **raw 를 버리기:** (태그, 길이)가 안 맞는 전문은 「기타」 행으로 남긴다(D-19).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| zstd 해제(브라우저) | 자체 zstd 디코더 | `fzstd`(스트리밍 · 여러 프레임 실측 통과) | 엔트로피 디코더 · 사전 · 체크섬 |
| zstd 해제/압축(Node) | wasm 바인딩 · 네이티브 애드온 | `node:zlib` zstd(≥22.15) | 의존성 0 · 스트리밍 · 스레드풀 |
| GCS 읽기 | REST 호출 · `@google-cloud/storage` | Cloud Run 볼륨 마운트(ro) | limitup-sync 선례 · 코드 0 줄 |
| GCS V4 서명 | 직접 서명(HMAC/RSA) | Supabase `createSignedUrl` | 암호 배관 · 키 관리 |
| ssh | npm ssh2 · 소켓 직접 | OpenSSH 클라이언트 + ControlMaster | 호스트키 고정 · 강제 명령 · 다중화가 이미 된다 |
| Job 실행 | Pub/Sub · Workflows · Eventarc | Admin API v2 `jobs:run` + overrides | 한 번의 HTTPS POST |
| 판정 규칙 | 「비슷한」 재해석(200µs 묶기 · 시간 창) | 파이썬 오라클 한 줄씩 이식 + 골든 | 200µs 묶기는 팀 매수를 3~9% 부풀린다(`krx-a3-zero-quote.md` §2) |
| 가상 스크롤의 동적 높이 측정 | 측정 · 보정 로직 | **모든 항목 고정 높이**로 바꾸고 산술 창 | 문제 자체를 없앤다 |

**Key insight:** 이 도메인의 위험은 「계산이 어렵다」가 아니라 **「파이썬 정본과 1원 · 1조각 어긋난다」**다. 이식은 창작이 아니라 번역이다. 순서 계약 · 반올림 · 범위(G1 vs G1+G4)까지 그대로 옮기고, 생성된 골든으로 잠근다.

## Common Pitfalls

### Pitfall 1: 낡은 오라클 수치로 골든을 쓰기
**What goes wrong:** D-20 문면의 천일고속 「+0.27억 · 1.12% · 3,401주」로 테스트를 쓰면 올바른 구현이 실패한다.
**Why:** `team-flow.md` §5-1 예시는 옛 200µs 묶기 시절 값이다. export 는 2026-10-26 msg_seq 런 + C0 규칙으로 다시 만들어졌다.
**How to avoid:** 골든 = `~/ticks/research/export/20261014/team_flow.ndjson.gz` 의 `payload.pnl` 원문(Code Examples 에 전 키). 그리고 같은 날짜 Supabase `limitup_team_flow` 행과 한 번 대조한다.
**Warning signs:** 끝 잔량 3,401 이 기대값으로 들어간 테스트.

### Pitfall 2: G1 만 / G1+G4 를 섞기
**What goes wrong:** 뷰어 차트는 G4 를 포함하는데 손익 KPI 는 G1 만 계산하는 식으로 화면 안에서 숫자가 갈린다. 또는 골든이 한쪽만 통과한다.
**How to avoid:** 범위를 한 상수(`scope`)로 화면 전체에 주입한다. 골든은 두 범위 모두 한다(빅텍 10/22: team_flow buy_val 6,695,674,123 vs accum 7,310,140,958).

### Pitfall 3: KRX msg_seq 보드 재시작
**What goes wrong:** 하루 전체를 msg_seq 하나로 정렬하면 G4(47~ 부터) · G3 · G2 행이 오전 G1 사이에 낀다.
**How to avoid:** 정렬 · 순열 · 호가 표는 언제나 (보드)별로 한다. accum 범위는 (t, seq) 순(teamflow_accum 선례)이다.

### Pitfall 4: Node zstd 가 실험 기능인데 이미지가 22.15 미만
**What goes wrong:** `node:22-alpine` 태그가 옛 22.x 캐시를 받으면 `zlib.createZstdDecompress` 가 없다.
**How to avoid:** Dockerfile 에서 `node:22.15-alpine` 이상(또는 24)으로 고정하고, 기동 때 `typeof zlib.zstdCompressSync === 'function'` 를 검사해 아니면 종료 2. ExperimentalWarning 은 `NODE_OPTIONS=--disable-warning=ExperimentalWarning`.

### Pitfall 5: Cloud Run 파일시스템은 메모리다
**What goes wrong:** 「임시 디스크」 스테이징이 메모리 한도를 넘겨 OOM 이 난다.
**How to avoid:** 스테이징은 처음부터 메모리 압축 청크로 설계하고(Pattern 11), 8Gi 로 시작해 SC3 실측으로 줄인다.

### Pitfall 6: 업로드 진행 중인 날짜를 변환
**What goes wrong:** tick-archive 가 23:14 까지 올리는 중(10/30 실측: KRX 0900 = 13:14:50Z = 22:14:50 KST · 마지막 NXT 2300 = 14:14:22Z = 23:14:22 KST)인데 Job 이 23:00 에 돌면 NXT 시간 파일이 빠진다.
**How to avoid:** 「08~20시 두 라벨 모두 존재」 준비 판정 + 23:30 · 01:30 두 번 실행 + catch-up 10일 · 업로드 전 요청 차단 해제 시각(`tick_upload_retry_at`)도 23:30(23:00 이면 NXT 업로드 중 재요청이 다시 NOT_UPLOADED 로 하루 더 막힌다).

### Pitfall 7: 서명 URL 만료 · 403
**What goes wrong:** 큰 파일을 받는 도중이나 탭을 오래 열어 둔 뒤 다시 받을 때 URL 이 만료된다.
**How to avoid:** limitup-grid 웹 선례대로 4xx 면 `open` 을 한 번 다시 부른다(`use-limitup-grid.ts` 동형).

### Pitfall 8: 파이썬 `round` vs JS `Math.round`
**What goes wrong:** `realized_val` · `end_cost_val` 이 1원 어긋난다.
**How to avoid:** `roundHalfEven` 유틸 + 경계값 단위 시험(x.5 양수/음수).

### Pitfall 9: 당일 마지막 주문의 잠정 분류
**What goes wrong:** 스트림 끝의 열린 주문이 다음 증분에 조각이 붙으면서 「일반 → SMP」로 바뀌고 KPI 가 튄다.
**How to avoid:** 마지막 열린 주문은 「진행 중」 표식을 붙인다. 증분이 도착하면 그 주문부터 다시 분류한다(접두 배열을 그 지점에서 잘라 다시 계산).

### Pitfall 10: 요청 변환 남용 비용
**What goes wrong:** 검색으로 종목을 연달아 고르면 Archive 통독이 N 회 생긴다.
**How to avoid:** 같은 (date, ex) 요청을 한 실행이 묶어 처리하게 한다(claim) · 하루 상한 · 진행 중 실행이 있으면 새로 부르지 않는다(should_trigger) · 취소는 pending 에서만 효과가 있다.

### Pitfall 11: radar-gw 공유 호스트 규칙 위반
**What goes wrong:** 장중 설치 · 키 재생성 · 다른 유닛 접촉.
**How to avoid:** tickgw 설치 · 키 · 방화벽은 20:00 이후에 한다. 설치기는 키가 없을 때만 만든다. gh-trade 에 인박스로 알린다(`docs/relay-operations.md` 「radar-gw 호스트 공유」).

### Pitfall 12: 중복 수신 전문
**What goes wrong:** 같은 (거래소, isin, 보드, seq)가 두 번 기록되면(timeline.dedup 이 따로 있는 이유) 주문 경계가 하나 더 생긴다.
**How to avoid:** 골든 호환을 위해 **판정에서는 제거하지 않는다**(teamflow 도 「중복 제거는 하지 않는다」 `teamflow.py:69-70`). 목록에서는 「중복」 표식만 붙인다.

## Code Examples

### 골든 1 — 천일고속 10/14 export `payload.pnl`(team_flow · KRX G1)
```json
// Source: ~/ticks/research/export/20261014/team_flow.ndjson.gz (manifest finished_at 2026-10-26T14:47:48) — 이번 세션 원문
{"buy_val": 2700694800, "buy_qty": 12573, "sell_val": 2763228250, "sell_qty": 12790,
 "realized_val": 28621939, "realized_qty": 9167, "unrealized_val": 3160411, "total_val": 31782350,
 "ret": 0.011768212387419711, "end_qty": 3406, "end_cost_val": 759783589,
 "unknown_sell_qty": 3623, "unknown_sell_val": 793695100}
// 같은 날 accum_flow payload.pnl 도 바이트 동일(그날 G4 체결 없음). 평평한 열: base 172600 · upper 224000 · last_px 224000
```

### 골든 2 — 빅텍 10/22 두 범위
```json
// team_flow(G1) payload.pnl: {"buy_val": 6695674123, "buy_qty": 1902129, "sell_val": 5903878139, "sell_qty": 1652624,
//   "realized_val": 134813179, "realized_qty": 1647487, "unrealized_val": 11945107, "total_val": 146758286,
//   "ret": 0.021918373460840548, "end_qty": 254642, "end_cost_val": 942962393, "unknown_sell_qty": 5137, "unknown_sell_val": 16353230}
// accum_flow(G1+G4): day_buy_krw 7310140958 · day_sell_krw 6547045394 · payload.pnl.buy_val 7310140958 · end_qty 248547 · total_val 155087926
// Source: ~/ticks/research/export/20261022/{team_flow,accum_flow}.ndjson.gz (finished_at 2026-10-26T15:08:59)
```

### 골든 3 — 에코앤드림 10/16 13시 컷(KRX classify_orders · NXT 런)
```text
# Source: 이번 세션 재실행 — gh-trade venv, ~/ticks/cut-101360/parquet/{a3,b6}/20261016/{krx,nxt}-1300.parquet
KRX classify_orders: base 8200 · upper 10660 · orders 2687 · {'일반': 2561, '자전거래방지': 70, '0/0 단독': 55, '0/0 스윕 끝': 1} · team 126
NXT/KRX nxt_runs: NXT runs>=2=179 smp=65 closing_b6_ok=2833/2833 · KRX runs>=2=182 smp=70 closing_b6_ok=2687/2687
NXT 단독 창 13:30~13:40 (AccumNxtFixtures.h:2350-2354): 팀 주문 13 · 매수 7901주/82,023,350원 · 매도 4632주/49,348,980원
```

### 15% 판정(119 배치 탐지와 같은 정수식)
```typescript
// Source: gh-trade tickana/batch.py:225-247 (base = px − chg · pct ∈ {'1','2'} · KRX G1) — 이식 형태
export function hits15(pct: string, px: number, chg: number): boolean {
  if (pct !== '1' && pct !== '2') return false;
  const base = px - chg;
  return base > 0 && chg * 100 >= base * 15;   // 정수 경계 — 부동소수 비교 금지(team-flow.md §5)
}
```

### 오라클 픽스처 생성(Wave 0 · 맥 전용 · 생성물 커밋)
```bash
# 레이아웃 덤프 — TS layouts.ts 와 배열 동일성 시험의 기대값
cd /Users/alex/repos/gh-trade/server/tools/analysis && .venv/bin/python -I -c \
 "import sys,json;sys.path.insert(0,'.');from tickana.packets import LAYOUTS;print(json.dumps({f'{t}:{s}':[[f.name,f.offset,f.length,f.kind] for f in l.fields] for (t,s),l in LAYOUTS.items()}))" \
 > <gh-radar>/packages/shared/src/ticks/__fixtures__/layouts.json
# 디코더 골든 — 같은 pcap 을 pcap2parquet 로 변환 → 표별 행 수 · 키 열 JSON(TS 는 같은 pcap.zst 를 읽어 비교)
.venv/bin/python -m tickana.pcap2parquet ~/ticks/cut-101360/src/krx/krx-1300.pcap.zst --out /tmp/tickfx --force
.venv/bin/python -m tickana.pcap2parquet <05~20시 원본 1개> --limit 20000 --out /tmp/tickfx-all --force   # 모든 태그 + raw 포함 조각
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 200µs 묶기(앞 조각 0/0 ∧ 같은 방향 ∧ 200µs) | A3 msg_seq 연속 런(빈 번호 = B6 자리) | 2026-10-23 quick-261023-wbd | 팀 매수 −4~−6%(빅텍 72.2억 → 66.9억) — 옛 수치 골든 금지 |
| 팀 = A ∪ B | 팀 = A ∪ B ∪ C0 | 2026-10-24 | `0/0 스윕 끝` 종류 추가 |
| team-flow §5-1 예시 수치 | export 재생성본(2026-10-26) | 2026-10-26 | Pitfall 1 |
| 매집감지 KRX G1 만 | G1+G4(애프터마켓) | 2026-10-19 quick-261019-qqc | 범위 두 벌(Pattern 4) |

**Deprecated/outdated:**
- CONTEXT D-20 의 「KRX 빅텍 20261022 runs≥2=182 smp=70」 표기 → 실제는 에코앤드림 10/16 13시 KRX 컷 값이다. 빅텍 10/22 오라클은 B6 묶기 팀 매수 66.9억(= team_flow buy_val 6,695,674,123)이다.
- 스케치 019/020 의 「한선엔지니어링 101360」 → 101360 은 에코앤드림이다(한선엔지니어링 = 452280 · KR7452280001) `[VERIFIED: ~/ticks/teamflow/master/{kospi,kosdaq}.csv]`. 생성 데이터 라벨일 뿐이라 화면에는 영향이 없다.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | gh-radar Supabase 조직(JX1 — 프로젝트 2개)이 **Pro 플랜**이라 Storage 100GB 가 포함된다 | Standard Stack · Pattern 13 | Free(1GB)면 격자 20~30GB 를 못 담는다 → GCS 대안 · 서명 방식 재설계. **Wave 0 체크포인트: 대시보드 Billing 확인** |
| A2 | GCS Archive 꺼내기 ≈ $0.05/GB(서울) | Pattern 11 | 요청 변환 비용 안내 · 하루 상한 값이 바뀐다. SC3 청구서로 실측 |
| A3 | Cloud Run 4 vCPU 에서 하루 통독 3~8분 · 요청 변환 1~2분 | Pattern 11 | ETA 문구 · task-timeout 조정. SC3 실측 |
| A4 | `node:22-alpine` 현재 태그가 ≥ 22.15 | Pitfall 4 | 이미지 고정으로 해소 |
| A5 | 서버 실행 SA 에 Job 단위로 `run.jobs.runWithOverrides` 를 주는 역할 이름(`roles/run.jobsExecutorWithOverrides` 또는 `roles/run.developer`) | Pattern 11 | IAM 단계에서 확인 |
| A6 | 119 인덱서가 제안 프레이밍 · 종료코드 · stderr JSON 을 받아들인다 | D-21 계약 초안 | gh-trade 응답에 맞춰 framing.ts 어댑터만 바뀐다(격자 형식은 gh-radar 소유) |
| A7 | NXT A3 `price_change` 도 기준가 대비라 15% 정수식이 그대로 맞는다 | Pattern 11 | NXT 단독 급등 종목이 대상에서 빠지거나 더 들어간다 — 요청 변환으로 보완된다 |
| A8 | `fzstd` 패키지 이름(학습 지식 출처) | Package Audit | legitimacy OK · checkpoint:human-verify 1회 |
| A9 | 고정 높이 창 가상화가 폰에서도 충분히 부드럽다(DOM ~60행) | Pattern 8 | 라이브러리(SUS)로 바꾸면 human-verify |
| A10 | 브라우저 메인 스레드 인덱싱(한선급 27만 레코드)이 수십 ms 대 | Pattern 2·7 | UAT 에서 끊김이 보이면 Web Worker 로 옮긴다(순수 함수라 이동이 쉽다) |
| A11 | LINKTYPE 147 = USER0(디버그용 전역 헤더) | Pattern 1 | 디버그 도구만 영향 |

## Open Questions (RESOLVED)

> 다섯 질문 모두 해소 경로가 플랜에 있다(2026-11-02 플래너 revision). Q1 · Q5 는 「사람 답」 으로 닫히는 게이트라 답이 올 때까지 뒤 플랜이 precondition 으로 멈춘다 — 답 자체는 37-01-SUMMARY 가 정본이다.

1. **Supabase 플랜(A1)**
   - What we know: 조직 JX1 에 프로젝트 2개(weeklywine · gh-radar)가 있다 `[VERIFIED: supabase projects list]`. CLI 키체인 토큰이 없어 플랜을 조회하지 못했다(no observation).
   - Recommendation: 플랜 1(또는 DB 플랜) 앞에 `checkpoint:human-verify` — 「Billing = Pro?」. Free 면 GCS 버킷 + server 중계(작은 파일 · 소수 사용자)로 바꾼다.
   - **RESOLVED(게이트 — 사용자 답 대기):** 37-01 Task 2 `checkpoint:decision` 이 「저장처: supabase-storage | gcs-bucket」 를 사용자 답으로 정한다. 37-04 · 37-06 · 37-07 · 37-10 · 37-12 · 37-18 의 `<precondition>` 이 그 줄을 grep 하고, gcs-bucket 이면 그 플랜들을 revision 으로 돌린다.
2. **팀 매집 「틱 보기」의 「첫 20% 도달」 폴백(D-17)**
   - What we know: team_flow 행에는 `payload.reach.t_ms` · `first_limit_ms` · `high_ms` 만 있고, t20 은 `limitup_entries.t20_ms` 에 있다.
   - Recommendation: 팀 매집 상세 RPC 에 `limitup_entries.t20_ms` LEFT JOIN 한 열을 더하는 작은 마이그레이션(DB 웨이브에 같이)으로 한다.
   - **RESOLVED:** 37-11 — `20261102200200_teamflow_report_t20.sql`(`teamflow_report_for_user` 재정의 · 행에 `t20_ms`) + 「틱 보기」 알약 폴백.
3. **NXT 화면의 회색 누적 선(D-09)**
   - What we know: `pos_net` 은 서버 포지션(KRX+NXT 합산) 값이다. D-13 은 「뷰어는 거래소 하나」다.
   - Recommendation: NXT 에서도 그리되 범례를 「매집감지 포지션(KRX+NXT 합산)」으로 한다. UI-SPEC 에서 확정한다.
   - **RESOLVED:** 37-14 — NXT 화면도 회색 누적 선을 그리고 범례 「매집감지 포지션(KRX+NXT 합산)」.
4. **15% 판정에 NXT 를 넣을지(A7)**
   - Recommendation: KRX G1 ∪ NXT G1 합집합(같은 패스라 비용 0). 사용자 이견이 있으면 KRX 만으로 바꾼다.
   - **RESOLVED:** 37-18(nightly `select.ts` — 37-06 에서 분할) — KRX G1 ∪ NXT G1 합집합. 37-01 「가정」 에 드러냈고 이견이 오면 판정 집합만 바꾼다.
5. **IA · B2 · C0 등 기타 태그**
   - 종목 단위인지 알 수 없어 지금은 격자에서 빠진다 → D-21 에 질문을 덧붙인다.
   - **RESOLVED(게이트 — 사용자 답 대기):** 37-01 Task 1 이 gh-trade 인박스 「질문」 으로 묻고, 37-01 Task 2 가 「D-19 범위: 승인 | 거부」(비종목 태그를 격자 · 당일 캐시에서 빼는 해석)를 사용자 답으로 받는다 — 37-06 · 37-18 이 precondition 으로 읽는다. gh-trade 회신이 종목 단위 태그를 알려 오면 37-17 Task 1 이 사용자에게 다시 묻는다(D-19 범위 재검토).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (zlib zstd) | Job · 로컬 시험 | ✓ | 24.21.0(로컬) | Docker 이미지 ≥ 22.15 고정 |
| pnpm | 빌드 · 시험 | ✓ | 11.15.1 | — |
| gh-trade tickana venv(Python 3.14 · pyarrow · duckdb) | 오라클 픽스처 생성 | ✓ | `server/tools/analysis/.venv` | — |
| 로컬 원본 · export(`~/ticks/cut-101360` · `~/ticks/team-follow/rawpcap/20261014` · `~/ticks/research/export`) | 골든 · 크기 실측 | ✓ | 10/14 KRX 08~15 · 10/16 컷 · export 9/29~10/29 | 빅텍 10/22 원본은 GCS 에서(≈ $0.2) |
| gcloud + deployer SA | GCS 목록 · 배포 | ✓ | `~/.config/gcloud/gh-radar-deployer.json` | — |
| `gs://gh-trade-tick-archive` 읽기 | Job · 픽스처 | ✓(deployer 로 ls 성공) | 10/30 KRX 3.36GiB · NXT 0.80GiB | — |
| zstd CLI | 실측 · 디버그 | ✓ | /opt/homebrew/bin/zstd | — |
| Docker 데몬 + pgTAP 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104` | `verify-dma-orders-price-check.sh` | ✗(이번 세션 `docker images` 빈 결과 — 데몬 미기동 추정) | 클라이언트 29.8.2 | 실행 전 Docker Desktop 기동. 없으면 「pgTAP 미실행」을 명시한다(통과 아님) |
| gh CLI 인증 | 저장소 가시성 확인 | ✗ | — | 픽스처는 생성물만 커밋하고 원본 pcap 은 커밋하지 않는다(아래) |
| 119 인덱서 · tickpull 키 | 당일 경로 | ✗(gh-trade 구현 대기) | — | 「당일 자료 준비 중」 카드(D-22) |

**Missing dependencies with no fallback:** 119 인덱서(외부 · D-22 가 이미 그 순서를 정했다).
**Missing dependencies with fallback:** Docker 데몬(기동하면 된다) · Supabase 플랜 미확인(A1 체크포인트).

**픽스처 커밋 정책:** gh-trade 도 원본 pcap 은 커밋하지 않고 생성물(헤더)만 커밋한다. gh-radar 도 ① 레이아웃 JSON ② 작은 레코드 조각(.ticks.zst — 컷 13시 KRX/NXT ≈ 0.5MB 씩 · 천일 10/14 A3-only ≈ 0.2MB) ③ 기대값 JSON 만 커밋한다. 큰 조각(빅텍 10/22 전일)은 `TICK_ORACLE_ROOT` 환경변수가 있을 때만 도는 시험으로 둔다(gh-trade `TEAMFLOW_REGRESSION_ROOT` 동형).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest — shared ^4.1.4 · server · workers ^3 · webapp ^2.1.9(jsdom) · Playwright ^1.59.1 · pgTAP(러너 `scripts/verify-dma-orders-price-check.sh --test`) |
| Config file | `packages/shared`(vitest 기본) · `server/vitest.config.ts`(maxWorkers 2) · `workers/limitup-sync/vitest.config.ts`(새 워커가 복제) · `webapp/vitest.config.ts`(include `src/**/*.test.{ts,tsx}`) · `webapp/playwright.config.ts`(포트 3100) |
| Quick run command | `pnpm --filter @gh-radar/shared exec vitest run src/ticks --maxWorkers=2` |
| Full suite command | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/tick-convert run typecheck && pnpm --filter @gh-radar/tick-convert exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run tests/routes/ticks.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks src/components/ticks --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/ticks-viewer.spec.ts e2e/specs/sidebar-tree.spec.ts --workers=1` + `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_viewer.test.sql` |

주의(34-VALIDATION 승계): server · webapp `test` 스크립트는 watch / passWithNoTests 라 쓰지 않는다 — 반드시 `exec vitest run <파일>`. 동시 세션이 있으면 `--maxWorkers=2` · `--workers=1` 을 지킨다. Playwright webServer 타임아웃이면 `rm -rf webapp/.next`. pgTAP 러너 exit 3 = 미실행이다(통과 아님).

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TICK-04 · D-19 | TS LAYOUTS = 파이썬 덤프(필드 · 오프셋 · 길이 · 종류) · 자체검사 | unit(골든 JSON) | `pnpm --filter @gh-radar/shared exec vitest run src/ticks/layouts.test.ts --maxWorkers=2` | ❌ Wave 0 |
| TICK-04 · D-19 | 같은 pcap 조각에서 표별 행 수 · 키 열(recv_ns · msg_seq · board · isin · 가격 · 수량 · bs · a1/b1 · trade_time_ns · cum_value · B6 40칸 · R8 · B9 · C3 · raw tag/info_cat/length)이 pcap2parquet 출력과 일치 | unit(골든 · 컷 13시 + 20,000패킷 무필터 조각) | `… vitest run src/ticks/decode.golden.test.ts` | ❌ Wave 0 |
| TICK-04 · D-19 | 프레이밍 왕복(이더넷 pcap → 레코드 → 같은 페이로드 · recv_ns BigInt 정확) · 잘린 꼬리 · 여러 zstd 프레임 이어붙이기 | unit | `… vitest run src/ticks/framing.test.ts` | ❌ Wave 0 |
| TICK-04 · D-20 | KRX classify_orders 일치 — 컷 13시 주문 2,687 · 종류 분포 · 주문별 oid/kind 전부 + 천일 10/14 전일 주문별 | unit(골든) | `… vitest run src/ticks/orders-krx.golden.test.ts` | ❌ Wave 0 |
| TICK-04 · D-13/D-20 | NXT 런 179/65 · KRX 런 182/70 · closing_b6_ok · NXT 단독 창 팀 주문 13 · 7,901주/82,023,350 · 4,632주/49,348,980 | unit(골든) | `… vitest run src/ticks/orders-nxt.golden.test.ts` | ❌ Wave 0 |
| TICK-04 · D-10/D-20 | team_pnl 13키 = 천일 10/14 export(G1) · (선택) 빅텍 10/22 G1 · G1+G4 · 반올림 짝수 · 접두 배열 끝값 = 전체값 | unit(골든 · 빅텍은 `TICK_ORACLE_ROOT` 있을 때만) | `… vitest run src/ticks/pnl.golden.test.ts` | ❌ Wave 0 |
| TICK-04 | 거래소순 순열(보드별 seq · B9/C3 자리 유지) · lastB6 표 · t lower_bound · 5분 밀도 · VI 구간 | unit | `… vitest run src/ticks/index.test.ts src/ticks/book.test.ts src/ticks/density.test.ts` | ❌ |
| TICK-03 · D-02 | 15% 정수식(경계 = 정확히 +15% 포함) · 대상 = 등록 ∪ 15% · 10/14 20% 집합 = entries 34 | unit + 골든(dayscan 결과 JSON) | `pnpm --filter @gh-radar/tick-convert exec vitest run tests/select.test.ts --maxWorkers=2` | ❌ |
| TICK-03 | 스캔 → 스테이징 → 대상 파일 바이트 = 단일 종목 직접 추출 바이트(작은 합성 pcap) · 준비 판정 · catch-up · 요청 claim 묶음 · purge 90일 · 종료 코드 | unit(가짜 Supabase · 임시 디렉터리) | `… vitest run tests/scan.test.ts tests/dispatch.test.ts tests/purge.test.ts` | ❌ |
| TICK-03 · D-03/D-08 | RPC 게이트(access:false) · should_trigger 원자성(두 번째 호출 false) · 표 정책 0 · EXECUTE service_role 만 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_viewer.test.sql` | ❌ |
| TICK-04 · D-08 | `/api/ticks/*` requireAuth · 403 DMA_UNMAPPED · open = RPC 1 + 서명 1 · convert 는 should_trigger 일 때만 Admin API 호출 · live 프록시 바이트 그대로 · 게이트 캐시 60초 | integration(supertest · 가짜 Supabase · 가짜 tickgw) | `pnpm --filter @gh-radar/server exec vitest run tests/routes/ticks.test.ts --maxWorkers=2` | ❌ |
| TICK-02 · D-05~D-07 | tickgw: 키당 폴러 1(동시 브라우저 N → 119 호출 1) · 리스 만료 정지 · 백오프 · 바쁨 · LRU 상한 · epoch/offset · 끝 줄 JSON 파싱 | unit(가짜 ssh 프로세스) | `pnpm --filter @gh-radar/tickgw exec vitest run --maxWorkers=2` | ❌ |
| TICK-01 · D-00/D-16 | 진입 상태 카드 3종 · 목록 정렬/칩 · 검색 피커 칩 · 호가 「주 \| 금액」 · 전문 행 레일/꼬리/점선 자리 · 키(← → Shift Space) · URL replaceState | RTL | `pnpm --filter @gh-radar/webapp exec vitest run src/components/ticks src/lib/ticks --maxWorkers=2` | ❌ |
| TICK-04 · D-14/D-17/D-18 | 사이드바 순서 · 세 보고서 「틱 보기」 href · 딥링크 새로고침 제자리 · DmaGate | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/ticks-viewer.spec.ts e2e/specs/sidebar-tree.spec.ts --workers=1` | ❌(sidebar-tree 는 있음 · 단언 갱신) |
| TICK-02/03 | radar-gw 하루치 조회 실측 · 10/30 변환 시간 · 비용 · 당일 밤 자동 · 20:10 승격 | manual(라이브 스모크 · 사용자 승인 · 20:00 이후) | 플랜 스모크 체크리스트 | — |

### Sampling Rate
- **Per task commit:** 그 태스크 범위의 `exec vitest run <파일>`(shared 골든은 1초대).
- **Per wave merge:** Full suite(위) — 전체 회귀는 한 세션만.
- **Phase gate:** Full suite green + pgTAP ok(또는 「pgTAP 미실행」 명시) → 배포(D-22 순서) → 라이브 스모크 → `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `packages/shared/src/ticks/__fixtures__/layouts.json` — 파이썬 LAYOUTS 덤프(Code Examples 명령)
- [ ] 디코더 골든: 컷 13시 KRX/NXT `.ticks.zst` + pcap2parquet 기대 JSON · 20,000패킷 무필터 조각(모든 태그 + raw)
- [ ] 판정 골든: 컷 13시 classify_orders 주문별 JSON · nxt_runs 요약 · AccumNxtFixtures NXT 단독 창 기대값 JSON
- [ ] 손익 골든: 천일 10/14 KRX G1 A3-only `.ticks.zst` + team_flow `payload.pnl` 원문 · (선택) 빅텍 10/22 GCS 추출 → `TICK_ORACLE_ROOT` 전용
- [ ] 15% 골든: 10/14 dayscan JSON(키별 hi · base · 20% 집합 = entries)
- [ ] `workers/tick-convert/vitest.config.ts` · `tickgw/vitest.config.ts`(limitup-sync 복제 · maxWorkers 2)
- [ ] `supabase/tests/tick_viewer.test.sql`(pgTAP)
- [ ] Supabase 플랜 확인 체크포인트(A1) · fzstd human-verify(A8)

## Security Domain

`.planning/config.json` `workflow.security_enforcement: false`(그리고 메모리 「보안검사 안 함」) — 이 절은 생략한다. 접근 게이트(D-08)는 기능 요구로 Validation 표에 들어 있다.

## Sources

### Primary (HIGH confidence)
- gh-trade `server/tools/analysis/tickana/packets.py`(LAYOUTS · 파서 :90-442) · `pcap2parquet.py`(:34-43 · :281-330) · `teamflow.py`(:31-41 · :68-134 · :142-145 · :246-318 · :650-699) · `nxt_runs.py`(:1-76) · `nxt_fixture.py`(:94-134) · `teamflow_accum.py`(:273-300 · :455-515) · `batch.py`(:209-247) · `accum_backfill.py`(:1-215 GCS fetch 선례) — 전부 이번 세션 원문
- gh-trade `docs/analysis/krx-a3-zero-quote.md` · `team-flow.md`(§3~§13) · `docs/features/accum-signal.md`(:40-120) · `server/tools/analysis/README.md` · `server/tools/archive/README.md` · `server/tests/support/{RawPacketFixtures.h,AccumNxtFixtures.h}`
- gh-radar `webapp/src/lib/accum-chart.ts` · `hooks/use-chart-view.ts` · `use-chart-width.ts` · `components/analytics/accum-chart.tsx` · `components/orderbook/orderbook-ladder.tsx` · `components/search/global-search.tsx` · `server/src/services/{limitup-report,relay-admin-client}.ts` · `workers/limitup-sync/src/{grid,purge}.ts` · `scripts/{deploy-limitup-sync,deploy-relay}.sh` · `docs/relay-operations.md` · `infra/relay/limitup-pull/*` · `supabase/migrations/{20261020200100_accum_report_rpc,20261006090300_limitup_retention_storage,20260415120000_split_stocks_master_quotes_movers}.sql`
- 이번 세션 실측: `scan.mjs`(Node zstd 1.31M pps) · `extract*.py` · `dayscan.py` · `seqs.py`(보드별 seq) · 압축 비교 · `fz.mjs`/`multi.mjs`(fzstd 속도 · 다중 프레임) · `nxt_runs`/`classify_orders` 재실행 · export 원문 · `gcloud storage ls -l`
- npm registry(`npm view`) · `gsd-tools query package-legitimacy check`

### Secondary (MEDIUM confidence)
- [Cloud Run Admin API v2 jobs.run](https://docs.cloud.google.com/run/docs/reference/rest/v2/projects.locations.jobs/run) · [v1 namespaces.jobs.run(runWithOverrides 권한)](https://docs.cloud.google.com/run/docs/reference/rest/v1/namespaces.jobs/run) · [Execute jobs](https://docs.cloud.google.com/run/docs/execute/jobs)
- Node zlib zstd 도입 버전: [@types/node zlib.d.ts](https://app.unpkg.com/@types/node@26.6.4/files/zlib.d.ts) · [eslint-plugin-n zlib 표](https://app.unpkg.com/eslint-plugin-n@17.23.2/files/lib/unsupported-features/node-builtins-modules/zlib.js) · [nodejs commit a3ca7f37a2](https://github.com/nodejs/node/commit/a3ca7f37a2)
- Supabase 요금 · 한도: [supabase.com/pricing](https://supabase.com/pricing.md) · [jetadmin 2026 가이드](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/)

### Tertiary (LOW confidence — 검증 필요 표시)
- GCS Archive 꺼내기 요금 $0.05/GB: [2brightsparks 가이드](https://www.2brightsparks.com/resources/articles/cloud-archive-storage-classes-guide.html) · [nops.io](https://www.nops.io/blog/google-cloud-storage-pricing/) — 공식 표는 직접 확인하지 못했다(WebFetch 잘림) → SC3 청구 실측

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 의존성 1개(fzstd)만 추가하고, 성능 · 정확성(다중 프레임)을 실측했다. Node zstd 는 로컬에서 확인했고, 이미지 버전 고정은 플래너 과제다.
- Architecture: HIGH(디코더 · 순서 · 판정 · 형식 · 크기) / MEDIUM(Cloud Run 소요 환산 · tickgw 운영 수치 — 119 계약 응답 전)
- Pitfalls: HIGH — 오라클 수치 불일치 · 범위 차이 · seq 재시작은 실데이터로 확인했다.

**Research date:** 2026-11-02
**Valid until:** 2026-11-16(gh-trade 판정 규칙이 주 단위로 바뀌는 중 — 골든은 생성 명령으로 다시 만든다)
