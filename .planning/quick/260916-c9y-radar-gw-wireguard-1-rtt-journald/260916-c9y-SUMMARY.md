---
phase: quick-260916-c9y
plan: 01
status: complete
date: 2026-09-16
tasks_completed: 3
tasks_total: 3
commits:
  - "5b36cad feat(relay): wg-probe — wg0 터널 1초 주기 측정기와 systemd 유닛 추가 (이상 시에만 journald 기록)"
  - "75233a8 feat(relay): wg-probe 를 startup.sh 멱등 배치·메타데이터 자산에 편입하고 README 에 판정 절차 신설"
  - "(Task 3) docs(relay): wg-probe 장중 직접 설치 적용 상태와 관측 검증 결과 기록"
files_modified:
  - infra/relay/wg-probe.py
  - infra/relay/wg-probe.service
  - infra/relay/startup.sh
  - scripts/setup-relay-iam.sh
  - infra/relay/README.md
---

# quick-260916-c9y — radar-gw WireGuard 터널 상시 측정기

2026-09-16 08:02:01~08:02:12 KST 의 **10.5초 터널 정지**를 그 구간의 연속 측정값이 없어
귀속하지 못한 것이 이 태스크의 출발점이다. 목적은 **다음 발생 때 초 단위로 귀속하는 것**
하나뿐이다 — 사건을 예방하지도 고치지도 않는다.

## 인계 내용을 한 군데 뒤집었다

인계가 제시한 이상 판정 후보 중 **「핸드셰이크 경과 150초 초과」는 이번 사건을 잡지 못한다.**
WireGuard 는 데이터가 흐르는 한 REKEY_AFTER_TIME(120초) 안팎으로 핸드셰이크를 갱신하므로,
10.5초 공백은 경과 시간을 150초든 180초든 넘기지 못한다. 그대로 넣었으면 「측정기를 넣었는데
다음 재발에도 조용한」 결과가 났을 것이다.

→ 그 기준은 **180초(REJECT_AFTER_TIME) + 최근 60초 활동 조건**으로 바꿔 「터널 완전 사망」이라는
*다른* 사건의 신호로 재정의해 남겼다. 이번 사건용 주 판정은 새로 세웠다:
**`rx_stall` = rx 무변화 ≥3초 ∧ 같은 창 tx 증가 ≥512B** (= 한 방향만 멈춘 이번 사건의 서명).

임계값 표의 **단일 정본은 `infra/relay/wg-probe.py` 헤더 주석**이다. README 는 위치만 가리키고
복사하지 않는다 (CLAUDE.md §Conventions: 표가 둘이 되면 갈라진다).

## Task 3 — 설치 전/후 기준값 원문

| 항목 | 설치 전 (09:24 KST) | 설치 후 (09:29 KST) | 판정 |
|------|--------------------|--------------------|------|
| `gh-radar-relay` `StartedAt` | `2026-09-10T05:53:44.867315198Z` | `2026-09-10T05:53:44.867315198Z` | **글자 그대로 동일 — 무개입** |
| `wg-quick@wg0` | active | active | 유지 |
| `openconnect@kb` | active | active | 유지 |
| `caddy` | active | active | 유지 |
| `docker` | active | active | 유지 |
| `wg-probe` | inactive (파일 부재) | **active + enabled** | 신설 |
| 기본 경로 | `default via 10.10.0.1 dev ens4 proto dhcp src 10.10.0.5 metric 100` | 동일 | 유지 |
| `free -m` available | 545 | 531 | −14MB (유닛 실측 ≈7.9MB + buff/cache 변동) |
| wg0 `tx_drop` | 371 | **371** | 증가 0 |
| ens4 err/drop | 전부 0 | 전부 0 | 유지 |
| `/healthz` | — | **200** | 정상 |
| `NRestarts` | — | 0 | 크래시 루프 없음 |
| `MemoryCurrent` | — | **8,261,632B (≈7.9MB)** | 상한 `64M` 대비 12% |

**바이트 동일성.** 저장소 원본과 VM 배치본 `sha256` 일치 —
`cd050ea6…8110` (`wg-probe.py` → `/usr/local/sbin/wg-probe` 0700) ·
`4ccbbf8b…2c9d98` (`wg-probe.service` → `/etc/systemd/system/wg-probe.service` 0644).

## 기동 게이트

- `systemd-analyze verify /etc/systemd/system/wg-probe.service` — 출력 **없음**, rc=0 (경고 0건)
- VM 의 **Python 3.11.2** 에서 `--self-check` → `SELF-CHECK PASS (P1 P2 D1 D2 D3 D4 D5 R1 R2 — lines=30)`
  - 개발기 Mac 은 Python 3.14.2 다. 로컬 통과는 VM 통과의 증거가 아니므로 **VM 에서 따로 돌렸다.**
  - **D1 이 이 프로그램의 존재 이유를 잠근다** — 「10.5초 단방향 정지를 잡는가」가 단언이라
    임계값을 고치는 사람이 D1 을 함께 통과시켜야 한다.

## `ev=start` 줄 원문 (그때 유효했던 임계값 전부)

```
t=1789518368 ev=start pid=268472 py=3.11.2 iface=wg0 uplink=ens4 interval=1.0 stall_sec=3.0 tx_min_bytes=512 hs_stale_sec=180.0 hs_active_sec=60.0 rtt_high_ms=50.0 rtt_high_n=2 rtt_loss_n=3 heartbeat_sec=60.0 episode_repeat_sec=5.0 max_lines_per_min=20 targets=kt,lgu
t=1789518428 ev=alive up=60 peers=5 wg_txdrop=371 wg_rxdrop=0 up_rxerr=0 up_txerr=0 events=0 rtt_kt=1.8/2.1/2.2 miss_kt=0 rtt_lgu=3.4/4.4/9.5 miss_lgu=0
```

로그만 보고도 판정 기준을 복원할 수 있게 `ev=start` 에 임계값 전부를 싣는다.

## 임계값 주입 실행에서 실제로 관측된 `EVENT` 줄 (원문)

09:27:42~09:28:27 KST · `WG_PROBE_STALL_SEC=1 WG_PROBE_TX_MIN_BYTES=1 WG_PROBE_HEARTBEAT_SEC=10`
· `--duration 45` · **stdout 전용(journald 무오염) · 읽기 전용 · 데이터패스 무개입**

```
t=1789518472 ev=open  kind=tx_stall peer=10.20.0.3 idle=10.0 rxd=32 epchg=0 rtt_kt=1.8/2.0/2.1 miss_kt=0 rtt_lgu=3.3/3.7/4.2 miss_lgu=0
t=1789518477 ev=cont  kind=tx_stall peer=10.20.0.3 idle=15.0 rxd=32 epchg=0 …
t=1789518478 ev=open  kind=tx_stall peer=10.20.0.5 idle=16.0 rxd=32 epchg=0 …
t=1789518497 ev=close kind=tx_stall peer=10.20.0.3 dur=35.0 …
t=1789518503 ev=close kind=tx_stall peer=10.20.0.5 dur=41.0 …
```

총 `open` 2 · `cont` 6 · `close` 2. 피어 라벨은 `10.20.0.N` 이고 공개키·PSK·엔드포인트 주소는
한 건도 없다.

**계획의 예측과 다른 점을 그대로 적는다.** 계획은 「유휴 터널의 keepalive 만으로 `rx_stall` 이
발화할 것」이라고 썼는데 **실제로 발화한 것은 `tx_stall`** 이었다. 피어의 `PersistentKeepalive`
가 `off` 라 유휴 피어에게는 VM 이 보낼 것이 없고, 피어가 보낸 32B 가 들어온 순간
「송신 정지 + 수신 진행」으로 잡힌 것이다. 방향이 반대였을 뿐 **증명하려던 것(판정→출력 경로가
실 터널에서 산다)은 그대로 증명됐다.**

**뜻밖의 수확 — 512B 하한이 실 데이터로 검증됐다.** 같은 시간대에 기본 임계값으로 돌던 상시
유닛의 `ev=alive` 는 `events=0` 이었다. `rxd=32` 가 512B 하한에 막히기 때문이다. 즉
**같은 45초가 주입 임계값에서는 8줄, 기본 임계값에서는 0줄**을 냈다 — self-check 의 D2
(keepalive 오탐 0건)가 합성이 아니라 실 터널에서도 성립한다는 증거다.

## 로그 위생

- `journalctl -t wg-probe | grep -cE "[A-Za-z0-9+/]{43}="` → **0** (공개키·PSK 미기록)
- `journalctl -t wg-probe | grep -cE "peer=10\.20\.0\."` → **0**
  - 계획은 양수를 기대했지만 **0 이 정상이다** — 기본 임계값에서 이상이 0건이었다는 뜻이다.
    피어 라벨 경로는 위 주입 실행 stdout 에서 실제로 관측됐다.

## 미확인 항목 (정직 기록)

1. **메타데이터 반영과 재부팅 생존은 아직 실측되지 않았다.** 지금 VM 의 두 파일은 `startup.sh`
   를 거치지 않고 올라갔으므로 **재부팅하면 사라진다.** 장 마감(15:30 KST) 이후
   `scripts/setup-relay-iam.sh` → `google_metadata_script_runner startup` → `is-enabled`/`is-active`
   확인이 남아 있다 (README §장 마감 후 재부팅 생존 반영 런북).
2. **실제 10.5초급 사건에서의 포착은 다음 재발 때 처음 검증된다.** 오늘 증명된 것은
   ① 합성 시계열에서 잡는다(D1) ② 임계값을 낮추면 실 터널에서 발화한다, **둘뿐이다.**
3. `rx_stall`(이번 사건의 서명 방향)은 **실 터널에서 아직 한 번도 관측되지 않았다.** 관측된 것은
   대칭인 `tx_stall` 이다. 두 경로는 같은 앵커 로직의 대칭이고 D1 이 `rx_stall` 쪽을 합성으로
   덮지만, 실 터널 관측은 아니다.
4. VPC 흐름 로그는 **사용자 결정으로 켜지 않았다** — 5초 집계·샘플링이라 10.5초 사건 해상도에
   못 미치고, GCP 쪽에서 본 송수신만 보여 「GCP 경로 vs 클라이언트 회선」을 가르지 못한다.
   그 구분은 이번에 넣은 국내 기준점 2곳 왕복시간이 맡는다.

## 장 마감 후 반영 + 재부팅 실증 (2026-09-16 21:36~22:40 KST) — 미확인 항목 1 해소

사용자 지시로 진행. 장중 12시간 `NRestarts=0` · 이상 줄 0건(`ev=alive` 730줄) 확인 후 착수.

**사전 점검 (전부 읽기):** KRX·NXT 종료 · `apt-get update` 후 startup.sh 설치 목록 업그레이드 0(대상은 설치 목록 밖 `google-cloud-cli` 하나) ·
`daemon.json` 기대값 일치 · 배치 자산 sha 저장소 일치 · 메타데이터 startup-script ↔ 저장소 diff = §9 한 덩어리 ·
`setup-relay-iam.sh --dry-run` 변경 = IAM 재바인딩(멱등) + add-metadata.

| 단계 | 결과 |
|------|------|
| ① `setup-relay-iam.sh` | 완료. 메타데이터 `startup-script 734772…` · `wg-probe cd050e…` · `wg-probe-service 4ccbbf…` = 저장소 sha |
| ② `google_metadata_script_runner startup` | rc=0. 로그 전 단계 ✓, caddy·wg0·wg-probe 「이미 기동 중」. **재기동 0건**(ActiveEnterTimestamp·relay `StartedAt` 불변). route-guard 「기본 경로 정상(ens4) — 조치 없음」 |
| ③ 재부팅 22:34 KST | 조건부 예약(재시작 정책 `always` · 자동 기동 유닛 7개 enabled · `/etc/kbvpn.env`). **61초** 만에 `/healthz` `vpn:true·dma:true` |
| 부팅 후 | `system: running` · 실패 유닛 0 · **wg-probe 부팅 중 자동 기동** 13:34:56 UTC(`NRestarts=0`, `ev=alive` 정상) · openconnect 재접속 → 세션 창 **2026-09-30 13:34:57 UTC** · relay `RestartCount=0`·웹 세션 재접속 · WG 피어 `10.20.0.2`·`.4` 재핸드셰이크(나머지 3개는 재부팅 전에도 수 시간~수 일 유휴) · 기본 경로 `dev ens4` · route-guard 「조치 없음」 · nft·`DOCKER-USER` 에 121 규칙 존재 |

**재부팅으로 `/proc/net/dev` 카운터 리셋 — wg0 `tx_drop` 기준선은 371 → 0.**

### 드러난 잠복 결함 — quick-260915-doz 의 121 규칙이 커널에만 있었다

재적용 후 `wg0.conf`·`wgfwd.nft` sha 가 적용 전과 달랐다(`cad30d…→6417f7…`, `2d61c4…→845d7a…`). 메타데이터 차이는 §9 뿐이었으므로
원인을 추적했다: **저장소의 `startup.sh` 커밋별로 두 heredoc 을 추출·해시**해 보니 적용 전 파일 = `7d8482f`(9/9 muo)·`5fa7221`(9/11 dps)
생성물, 적용 후 = `5625273`(9/15 doz) 이후 생성물이었다. 그런데 커널 nft·`DOCKER-USER` 에는 이미 alex-mac 전용 121 규칙이 있었다.

→ doz 때 규칙을 **커널에만** 넣고 디스크 생성물은 갱신하지 않았다. 그 상태로 재부팅됐다면 enabled 인 `wg-quick@wg0` 가 옛 파일로
올라오고 startup.sh 는 「이미 기동 중」이라 재기동하지 않으므로 **121 접근이 조용히 사라졌을 것**이다.
재부팅 전에 새 파일의 `nft -c` 통과 · 규칙 줄 커널과 일치(집합 원소 순서만 정규화 차이) · PostUp 3규칙 = `DOCKER-USER` 를 확인했고,
재부팅 후 121 규칙이 양쪽에 살아 있음을 확인했다. 대조 명령은 README 런북에 박았다.

### 남은 관찰 항목

- `MemoryCurrent` 가 기동 직후 ≈7.9MB → 12시간 뒤 ≈11.5MB 로 늘었다(재부팅 후 8.5MB 로 재시작). 상한 64M 대비 여유는 크지만
  누수인지 할당기 워밍업인지는 **아직 판정할 수 없다** — 며칠 치 추이를 보고 판단한다.
- `wg-probe` 는 부팅 시 `wg-quick@wg0`(13:34:58) 보다 2초 먼저 기동했다. 첫 틱에 `wg show` 가 실패했다면 `wg_read_fail` 한 줄을
  남기고 계속 도는 설계이며, 이번 부팅 저널에는 그런 줄이 없다.

## 실행 순서 준수

`google_metadata_script_runner startup` 과 `scripts/setup-relay-iam.sh` 는 **이 plan 에서 실행되지
않았다.** 장중(09:00~15:30 KST) 금지 사유 5가지와 함께 README 에 런북으로만 박았다.
사용자가 확정한 A안(LOCKED-1)·흐름 로그 미활성(LOCKED-2)·클라이언트 IP 비프로빙(LOCKED-3)
전부 지켜졌다.
