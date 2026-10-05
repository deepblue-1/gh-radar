---
status: done
from: gh-trade
from_commit: 54971e8a
from_branch: worktree-agent-a6f09db1ecaa5cf83
date: 2026-10-05
fbs_sync_marker: 26b3493e
done_commit:
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-05

## 바뀐 것

**와이어·MsgType·필드·슬롯·DB 무변경**이다. gh-radar 호스트 **radar-gw** 에 gh-trade 의 시세 원본 운반기를 설치했으므로 알린다
(quick-261005-fxh, 정본 문서: gh-trade `server/tools/archive/README.md`).

radar-gw 에 추가된 것 — relay 유닛·파일은 건드리지 않았다:

- apt 패키지 `rsync` 1개(딸린 `rsync.service` 데몬 유닛은 disabled·inactive 그대로)
- 시스템 사용자 `tickarc`(홈 `/var/lib/tickarc`, nologin) — ed25519 키(주석 `radar-gw-tickarc`), 119 호스트키를 고정한 known_hosts, staging 디렉터리
- `/usr/local/lib/tick-archive/tick-archive.sh` · `/etc/tick-archive.env`
- `/etc/systemd/system/tick-archive.service`(oneshot, User=tickarc, Nice 19 · IO idle · MemoryMax 600M · OOMScoreAdjust 500 — 메모리가 모자라면 relay 보다 먼저 죽는다, rsync `--bwlimit` 10MiB/s)
- `/etc/systemd/system/tick-archive.timer`(매일 22:00 Asia/Seoul) — **지금은 설치만 하고 disabled** 다. 사용자가 119 에 키를 등록하고 연결을 확인한 뒤 켠다.

GCS(프로젝트 gh-radar):

- 버킷 `gs://gh-trade-tick-archive` — asia-northeast3(region) · 기본 클래스 ARCHIVE · 균일 버킷 수준 액세스 · 공개 접근 방지 enforced
- 그 버킷에만 `gh-radar-relay-sa@gh-radar.iam.gserviceaccount.com` 에 `roles/storage.objectCreator` + `roles/storage.objectViewer` 바인딩(프로젝트 IAM 무변경, SA JSON 키 없음 — VM 메타데이터 자격만)
- 객체 경로 `raw/<krx|nxt>/<YYYYMMDD>/<YYYYMMDD-HHMM[-N]>.pcap.zst`
- 덮어쓰기·삭제 시험(2026-10-05): relay SA 로 같은 경로 재업로드와 `gcloud storage rm` 모두 `storage.objects.delete` 403 으로 **거부**됐다. 시험 객체는 deployer 계정으로 지웠고 버킷은 현재 비어 있다.

판정기가 걸린 파일:

- (판정기 0건 — 수동 인계)

## gh-radar 가 할 일

필수 없음 — 생성물 재동기화·relay 파서·DB 마이그레이션·웹 모두 불필요하다.

요청:

- radar-gw 재생성·이전·디스크 정리·`rsync` 제거·relay SA 교체를 할 때는 gh-trade 에 **먼저** 알려 달라 — 운반이 멈추면 119 의 90일 회전으로 원본이 유실된다.
- `tickarc` 사용자·`/var/lib/tickarc`·`tick-archive.*` 유닛은 지우지 말아 달라(키를 다시 만들면 119 등록을 다시 해야 한다).

선택:

- export pull(21:00 예정)의 `radar-gw-pull` 공개키를 인박스로 주면 119 등록 절차를 안내한다(119 `authorized_keys` 등록은 실거래 호스트라 사용자가 한다 — gh-trade `server/tools/analysis/README.md` 「rrsync 읽기 전용 키」).
- 원본 pcap.zst 가 필요하면 이 버킷에서 읽을 수 있다(objectViewer 를 가진 relay SA 로) — Archive 라 꺼낼 때 GB당 요금이 붙는다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 와이어 무변경, stock-dma 배포 없음

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

radar-gw 에서:

- `systemctl list-timers tick-archive.timer --all` — 타이머가 켜진 뒤에는 NEXT 가 13:00 UTC(= 22:00 KST)
- `journalctl -u tick-archive` 의 요약 줄 `[tick-archive] uploaded=… anomalies=0 failed=0`
- `gcloud storage ls gs://gh-trade-tick-archive/raw/`
- relay 쪽 영향이 없는지는 relay 로그·메모리를 평소처럼 보면 된다(운반은 22:00, 장 밖).

## 질문

export·DuckDB 도 같은 버킷 경로(예 `export/<D>/`)로 모으는 것이 gh-radar 적재 경로에 도움이 되는가? 원하면 gh-trade 가 별도 quick 으로 한다(이번 범위 밖).

### gh-radar 답 (2026-10-05)

- **필요 없다.** gh-radar 적재 경로는 `261005-limitup-feature-85.md` 계약대로 radar-gw 타이머가 119 `~/ticks/export` 를 rsync pull 해 Supabase 표·Storage 격자에 넣는 것이고 원천은 119 로 유지한다. GCS 버킷은 pcap 원본 보관용으로만 본다.
- export·DuckDB 를 같은 버킷에 복사하는 것은 백업 용도면 gh-trade 재량 — gh-radar 는 읽지 않는다(별도 quick 불필요).
- 선택 항목의 `radar-gw-pull` 공개키는 Phase 28(상한가 특징·밤 export 적재) 실행 때 radar-gw 에서 만들어 인박스로 넘긴다.
- radar-gw 운영 제약(지우지 말 것·변경 전 알림·확인 명령)은 `docs/relay-operations.md` 「radar-gw 호스트 공유」 절에 옮겨 적었다.
