---
status: done
from: gh-trade
from_commit: f64061ce
from_branch: master
date: 2026-11-03
fbs_sync_marker: 681fb854
done_commit: e2ad2371
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-03

## 바뀐 것

gh-radar 요청 `docs/inbox/from-gh-radar/261102-tick-viewer-contract.md`(gh-trade 트리)에 대한 **2차 회신 = 가동 통보**다. 1차 회신(`261102-tick-viewer-contract-1.md`)의 계약은 그대로다 — 와이어(StockDMA.fbs·relay·stock-dma) 무변경, 질의 계약·종료코드·16MB·동시 1 무변경.

판정기가 걸린 파일:

- (판정기 0건 — 수동 인계)

### 가동 상태 (11/3 09:53 KST)

- **119 인덱서** `tick-indexer --serve` — 11/2 22:23 KST 설치(배포 커밋 f6f551b4, `bin/tick-indexer` 1 개). 밤사이 날짜 넘김 정상: 11/3 색인 종목 5,505 · 항목 약 1,111만(09:23) · 손상 0 · 쓰기오류 0 · 색인 크기 289M.
- 자원: `CPUAffinity=0` · `Nice=19` · `IOSchedulingClass=3`(idle). 장중 CPU 0.2 %.
- **tickpull 키 등록 완료** — 11/3 사용자가 119 smok95 `authorized_keys` 에 추기의 줄을 그대로 넣었다. 확인: `radar-gw-tickpull` 1줄 · 전체 7줄 · 권한 600 · 기존 줄 무손상. 키 지문 `SHA256:SL4V3R4lsPLoZJyg49d7dW/N5k7sIE3qbvATI+X4j40`(노트 줄에서 직접 계산해 일치), 강제 명령 경로·taskset·nice·ionice 모두 119 에 있다.
- **radar-gw tick-archive** — 11/2 밤 21:30 타이머로 재설치. 첫 회차(11/2 23:32 KST 끝): `uploaded=45 skipped=1611 anomalies=0 failed=0 bytes=3976383864`(11/2 완결 파일). 다음 회차 11/3 21:30 KST — 이때부터 D 회차가 D 의 08 ~ 20시 파일을 올린다.

### 장중 실측 (11/3 09:52 ~ 09:53 KST, 119 smok95 에서 강제 명령과 같은 `taskset -c 0 nice -n 19 ionice -c 3` 로)

from = 11/3 08:00 KST epoch ns, to = 0.

| 질의 | 종료 | 압축 bytes | records | 지연 | has_more | skipped |
|------|---:|---:|---:|---:|---|---:|
| 삼성전자 KR7005930003 KRX | 0 | 7,442,693 | 305,039 | 0.49 s(프로세스 전체) | false | 0 |
| 당일 색인 1위 KR70147B0005 KRX | 0 | 16,516,877 | 565,468 | 0.67 s | **true** | 0 |
| ↳ `next_from_ns` 이어받기 1회 | 0 | 9,116,756 | 315,147 | 275 ms(로그 `ms=`) | false | 0 |
| 삼성전자 KR7005930003 NXT | 0 | 14,350,865 | 582,760 | 1.23 s | false | 0 |
| 같은 하루치 동시 2회 | **75** · 0 | 0 · 16,516,877 | — · 565,468 | 즉시 · 1,607 ms | — · true | — |

- 16MB 근처에서 `has_more=true` → `next_from_ns`(포함 커서)로 이어받아 첫 응답 마지막 레코드 바로 뒤부터 끝까지 받았다. 75 는 `[tick-indexer] [query] 동시 초과 — 75` 로 즉시 끝난다.
- 오전 2시간 만에 삼성 NXT 14MB · 1위 종목 26MB(2회) — **하루치 첫 조회는 대형주도 has_more 로 여러 번 나뉜다**. 5초 증분 조회(from = 마지막 recv_ns + 1)는 한 번에 수십 KB 수준일 것이다.
- 질의 직후 기록기 `[stats]`(09:53:25) KRX·NXT **drops=0 · 버림=0** 유지. 인덱서·기록기 모두 코어 0, 인덱서 CPU 0.2 %.
- 결론: **16MB · 동시 1 그대로 유지**(8MB 로 내릴 이유 없음). 응답 지연은 1초 안팎.

### ④ NXT 보강 실측 — R8·A7·VI 단일가 (1차 회신에서 미실측분)

119 `~/ticks/nxt/20261102-0900.pcap.zst` 한 파일(11/2 09:00 ~ 10:00, 2,417,396 레코드, 읽기 전용 수신 후 맥에서 46-04 스크립트로 셈). NXT A3 500,102 · B6 1,667,281 · **R8 70** · A7 0 · E1 0 · A6 0 · 같은 (종목, 보드, seq) 중복 0.

| 구간 | 런 끝 A3 | B6 | R8 | A7 | 없음 | B6 비율 |
|------|---:|---:|---:|---:|---:|---:|
| 세션 40 메인 | 354,189 | 354,183 | 6 | 0 | 0 | 100.0 % |
| 세션 50 VI 단일가(bs 공백 = 단일가 체결) | 24 | 0 | **24** | 0 | 0 | 0 % |
| 세션 22·24·26 장중단일가 | 0 | — | — | — | — | (이 시간 없음) |

- **NXT R8 70/70** 이 같은 (ISIN, G1) 의 A3·B6 순번 빈칸을 정확히 채웠다(seq−1·seq+1 모두 A3/B6) — KRX 와 같은 꼴이 NXT 에서도 확인됐다(1차의 「추정」 해소).
- **NXT VI 단일가 체결 A3(세션 50) 24/24 는 바로 다음 칸이 B6 가 아니라 R8(VI 해제)** 이다. 메인 세션 런 끝 A3 6건의 다음 칸 R8 은 VI 발동이다. 즉 런 닫기 규칙 「다음 A3 또는 B6 가 오기 전의 모든 칸을 닫힘 후보로, 색인 밖 태그가 차지한 칸은 공백으로」 를 그대로 쓰면 된다 — R8 은 색인 태그라 공백이 아니라 그 칸에 그려진다.
- NXT A7 은 이 시간도 0건 — NXT 는 세션 전환을 A7 이 아니라 B6 세션 필드로만 알린다(1차 15시 파일과 같은 결론).

## gh-radar 가 할 일

- **tickgw 배포 + server `TICKGW_URL` 결선 — 11/3 20:00 KST 이후**(1차 합의대로). 생성물 재동기화·relay 파서·DB 마이그레이션 불필요(와이어 무변경).
- 런 닫기 규칙: NXT VI 단일가 체결 뒤 R8 칸(위 표) — 이미 「색인 태그가 차지한 칸은 그 전문으로」 로 그린다면 추가 작업 없음.
- 실측(radar-gw → 119 하루치 크기·지연·has_more·75)은 37-17 SUMMARY 에 — 위 표와 크게 다르면(지연 수 초 · 75 연속) 인박스로 알려 달라.

## 배포 순서 제약

gh-trade 쪽은 끝났다 — 119 인덱서 가동 · 키 등록 · radar-gw 21:30 타이머 모두 반영. stock-dma·클라 재기동·발행 없음. gh-radar 는 20:00 KST 이후 tickgw 를 켜면 된다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

- radar-gw `tickpull` 에서 `ssh -o BatchMode=yes smok95@10.16.207.119 KR7005930003 KRX <오늘> <08:00 KST epoch ns> 0 | wc -c` → 종료 0 · 위 표와 같은 자릿수. 날짜 ≠ 오늘은 64.
- 119 쪽 흔적: `sudo journalctl -u tick-indexer | grep '\[query\]'` 는 비어 있다(질의 로그는 stderr — tickgw 가 받는다). 119 부하는 gh-trade 가 기록기 `[stats] drops=0` 로 본다.
- ①: 11/4 아침 radar-gw `journalctl -u tick-archive --since yesterday | grep '\[tick-archive\]'` 의 11/3 21:30 회차 요약 줄 + `gcloud storage ls gs://gh-trade-tick-archive/raw/krx/20261103/ | wc -l`.

## 질문

없음. 요청 노트 `261102-tick-viewer-contract.md` 는 이 회신으로 gh-trade 쪽 `status: done` 처리한다. 1차 회신의 질문 2(B2·B0·A7·E1 포함 여부)는 gh-radar 결정 대기 — 넓히기로 하면 새 요청 노트로 보내 달라.
