#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════
# wg-probe — radar-gw WireGuard 터널(wg0) 1초 주기 **읽기 전용** 측정기
#
# ── 왜 있는가 ───────────────────────────────────────────────────
#   2026-09-16 08:02:01~08:02:12 KST, 약 10.5초 동안 wg0 를 통해 KB DMA
#   게이트웨이(10.41.1.120:9100)에 붙어 있던 클라이언트 2대가 동시에 양방향으로
#   멈췄다. 한쪽은 게이트웨이가 송신 시간초과(500ms)로 절단했고, 다른 쪽은 TCP 는
#   살아남았지만 데이터가 11초 뒤 몰려서 도착했다. 그 사이 나간 신규 매도 주문과
#   취소 요청이 서버에 도달하지 않았다 — **실계좌다.**
#
#   VM 은 이미 결백이 입증됐다: 같은 순간 relay 컨테이너가 tun0(KB VPN)로 계좌
#   델타 8건을 08:02:00.729~08:02:01.027 에 밀리초 단위로 정상 수신했다. relay 는
#   wg0 를 타지 않는다. 즉 VM 도 openconnect 세션도 살아 있었다.
#
#   남은 후보는 **VM↔클라이언트 인터넷 구간**(wg0 데이터패스 또는 GCP 서울↔국내
#   ISP 경로)인데, 당시 그 구간의 연속 측정값이 없어 더 좁히지 못했다.
#   이 프로그램의 목적은 **다음 발생 때 초 단위로 귀속하는 것** 하나뿐이다.
#   사건을 예방하지도, 고치지도 않는다.
#
#   재발 이력(게이트웨이의 `송신 실패/상한(500ms) 초과` 기준): 9/8 1건 ·
#   9/14 8건 · 9/15 4건 · 9/16 1건. 전부 장중 시세 폭주 구간이다.
#
# ── 이 프로그램이 하지 않는 것 (의도적) ─────────────────────────
#   · **아무것도 바꾸지 않는다.** wg0·tun0·nft·iptables·라우팅·openconnect·
#     caddy·relay 컨테이너에 쓰기 명령을 한 줄도 보내지 않는다. 하는 일은
#     `wg show <iface> dump` 읽기 · `/proc/net/dev` 읽기 · ICMP 송신뿐이다.
#   · **상시 기록하지 않는다.** 1초마다 한 줄씩 남기면 하루 17MB 다. 정상
#     구간에는 60초마다 `alive` 한 줄만 남기고, 이상 구간에만 줄을 낸다.
#     그래서 **`alive` 줄의 부재 자체가 「수집기가 죽었다」는 귀속 사실**이 된다.
#   · **피어를 식별할 수 있는 비밀을 남기지 않는다.** 공개키·PSK·엔드포인트
#     주소/포트를 저장하지도 출력하지도 않는다. 식별자는 AllowedIPs 에서 뽑은
#     `10.20.0.N` 하나다. (infra/relay/README.md §검증 명령: 「`wg show` 는
#     공개키를 출력한다. 로그·이슈·문서에 붙여 넣지 말 것 — 공개키도 피어
#     식별자다」) 엔드포인트는 **바뀐 횟수**(`epchg=`)만 센다 — NAT 재바인딩은
#     진단 가치가 있지만 주소는 사생활이다.
#   · **클라이언트 공인 IP 를 찌르지 않는다.** 왕복시간 기준점은 국내 ISP 의
#     공개 DNS 2곳이다.
#
# ── §임계값 표 (이 표가 임계값의 단일 정본이다) ─────────────────
#   README 는 이 표를 **복사하지 않고 위치만 가리킨다.** 표가 둘이 되면 갈라진다.
#   (CLAUDE.md §Conventions)
#
#   | 판정         | 임계값                                   | 근거                                                                                                                                                                                                                                                                                 |
#   |--------------|------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
#   | rx_stall     | rx 무변화 ≥3초 ∧ 같은 창 tx 증가 ≥512B   | **이번 사건의 서명이다** — 한 방향만 멈췄다. 3초는 10.5초의 1/3.5 라 사건 시작 3초 뒤 발화하고 종료까지 여러 줄을 남긴다. 2초로 낮추지 않은 이유: 1Hz 표본은 ±1초 양자화 오차가 있어 2초 기준은 1.x초짜리 실제 공백에도 발화한다. 3초는 **온전한 표본 간격 2개**의 침묵을 보장한다. 512B 하한은 keepalive 전용 트래픽(32B/25초)을 배제한다 — 없으면 유휴 피어가 상시 발화한다 |
#   | tx_stall     | 위의 대칭 (tx 무변화 ≥3초 ∧ rx 증가 ≥512B) | 반대 방향 고장                                                                                                                                                                                                                                                                      |
#   | hs_stale     | 핸드셰이크 경과 >180초 ∧ 최근 60초 내 바이트 이동 있음 | **이번 10.5초 사건을 잡지 못한다.** WireGuard 는 데이터가 흐르면 REKEY_AFTER_TIME(120초) 안팎으로 갱신하므로 10초 공백은 경과를 150초든 180초든 넘기지 못한다. 인계가 제시한 150초는 **이 목적에는 무효한 기준**이다. 그럼에도 남기는 이유는 「터널 완전 사망」이라는 **다른 사건**의 신호이기 때문이고, 180초는 WireGuard 의 REJECT_AFTER_TIME — 그 시점부터 세션 키가 실제로 거부된다. 「최근 활동」 조건이 없으면 keepalive 를 끈 유휴 피어가 영구 발화한다 |
#   | wg_txdrop    | wg0 tx drop 증가 ≥1                      | `/proc/net/dev` 의 wg0 TX drop 누적 **371**(2026-09-16 실측)이 **언제** 늘었는지 모르는 것이 정확히 이 측정기가 푸는 문제다. 1건도 정보이고 폭주는 분당 상한이 막는다                                                                                                                 |
#   | wg_rxdrop    | wg0 rx drop 증가 ≥1                      | 기준선 0                                                                                                                                                                                                                                                                            |
#   | uplink_err   | ens4 rx/tx err·drop 증가 ≥1              | 기준선 전부 0. 상승하면 VM 업링크 쪽 증거                                                                                                                                                                                                                                            |
#   | rtt_high     | 기준점 왕복시간 >50ms 가 2회 연속        | 실측 기준선 KT 2.054ms · LG U+ 4.364ms(2026-09-16). 50ms 는 12~25배로, GCP 서울↔국내 ISP 경로의 정상 지터가 절대 닿지 않으면서 유의미한 경로 열화는 놓치지 않는 자리다. 2회 연속 조건이 단발 잡음을 배제한다                                                                          |
#   | rtt_loss     | 무응답 3회 연속                          | `ping -O` 의 `no answer yet` 줄을 센다                                                                                                                                                                                                                                              |
#   | 생존         | 60초마다 `alive` 한 줄                   | 하루 1,440줄(≈150KB). 상시 기록(하루 17MB)의 1% 미만                                                                                                                                                                                                                                 |
#   | 폭주 상한    | 이상 줄 분당 20줄, 초과분은 `ev=suppressed n=` 한 줄로 요약 | journald 를 태우지 않는다                                                                                                                                                                                                                                                            |
#
#   **에피소드 모델.** 같은 (kind, peer) 이상이 연속되는 동안을 하나의 에피소드로
#   묶어 `open` → `cont`(5초마다) → `close`(지속시간 포함) 세 종류만 낸다.
#   10.5초 사건이면 약 3줄이 남는다 — 초당 한 줄이 아니라.
#   `close` 의 `dur` 은 **에피소드가 열려 있던 시간이 아니라 실제 정지 시간**이다
#   (앵커 시각부터 잰다). 운영자가 알고 싶은 것은 「수신이 11초 멈췄다」이지
#   「경보가 8초 떠 있었다」가 아니다.
#
#   **기준점 2곳은 국내 ISP 여야 한다.** 사건 피어 엔드포인트는 국내 ISP 회선이었고
#   8.8.8.8(1.160ms)·1.1.1.1(1.514ms)은 GCP 에서 사실상 피어링 내부라 국내 경로
#   열화를 보지 못한다. KT(168.126.63.1)·LG U+(164.124.101.2) DNS 를 쓴다.
#
# ── 출력 ───────────────────────────────────────────────────────
#   stdout 에만 쓴다(파일도 `logger` 도 쓰지 않는다). systemd 유닛이
#   `SyslogIdentifier=wg-probe` 로 journald 에 실어 `journalctl -t wg-probe` 로
#   읽힌다. 1Hz 데몬이라 초당 `logger` fork 를 하지 않는 것이 e2-micro 예산의
#   요구다(기존 kbvpn-watchdog/kbvpn-renew 의 `logger -t` 는 10분/주 1회
#   oneshot 이라 fork 비용이 무의미했다 — 같은 패턴을 그대로 쓰면 안 된다).
#   모든 줄은 **개행 없는 단일 줄 `key=value` 공백 구분**이다.
#
# ── 실행 ───────────────────────────────────────────────────────
#   wg-probe                 상시 (systemd 유닛이 쓰는 형태)
#   wg-probe --duration 45   45초 뒤 정상 종료 (검증용 1회성 전경 실행)
#   wg-probe --self-check    오프라인 합성 리플레이 단언. 통과 시 exit 0
#
#   모든 임계값·대상·인터페이스명은 `WG_PROBE_*` 환경변수로 주입할 수 있고
#   기본값은 위 표와 일치한다. 임계값을 낮춰 1회성으로 띄우면 데이터패스를
#   건드리지 않고 판정→출력 경로를 실관측할 수 있다.
#
#   `--self-check` 의 핵심 단언 D1 은 **「이번 10.5초 단방향 정지를 잡는가」**다.
#   못 잡으면 self-check 가 실패한다 — 임계값이 목적을 배반하지 못하게 하는
#   기계 게이트다. 임계값을 고치는 사람은 D1 을 함께 통과시켜야 한다.
#
#   ⚠️ Python 3.11 표준 라이브러리만 쓴다 (VM /usr/bin/python3 = 3.11.2).
#      개발기 Mac 은 3.14 라 로컬 통과가 VM 통과의 증거가 아니다 — VM 에서도
#      `--self-check` 를 돌려야 한다.
# ═══════════════════════════════════════════════════════════════

import os
import re
import signal
import subprocess
import sys
import threading
import time
from collections import deque

MIN_PY = (3, 11)
if sys.version_info < MIN_PY:
    sys.stdout.write(
        "ev=fatal reason=python_too_old need=%d.%d have=%d.%d\n"
        % (MIN_PY[0], MIN_PY[1], sys.version_info[0], sys.version_info[1])
    )
    sys.stdout.flush()
    raise SystemExit(1)


# ───────────────────────────────────────────────────────────────
# 설정 — 전부 WG_PROBE_* 로 주입 가능. 기본값은 헤더 §임계값 표와 일치한다.
# ───────────────────────────────────────────────────────────────
def _env_str(name, default):
    v = os.environ.get(name)
    return v if v else default


def _env_float(name, default):
    try:
        return float(os.environ[name])
    except (KeyError, ValueError):
        return default


def _env_int(name, default):
    try:
        return int(os.environ[name])
    except (KeyError, ValueError):
        return default


IFACE = _env_str("WG_PROBE_IFACE", "wg0")
UPLINK = _env_str("WG_PROBE_UPLINK", "ens4")
INTERVAL_SEC = _env_float("WG_PROBE_INTERVAL_SEC", 1.0)
STALL_SEC = _env_float("WG_PROBE_STALL_SEC", 3.0)
TX_MIN_BYTES = _env_int("WG_PROBE_TX_MIN_BYTES", 512)
HS_STALE_SEC = _env_float("WG_PROBE_HS_STALE_SEC", 180.0)
HS_ACTIVE_SEC = _env_float("WG_PROBE_HS_ACTIVE_SEC", 60.0)
RTT_HIGH_MS = _env_float("WG_PROBE_RTT_HIGH_MS", 50.0)
RTT_HIGH_N = _env_int("WG_PROBE_RTT_HIGH_N", 2)
RTT_LOSS_N = _env_int("WG_PROBE_RTT_LOSS_N", 3)
RTT_WINDOW = _env_int("WG_PROBE_RTT_WINDOW", 15)
HEARTBEAT_SEC = _env_float("WG_PROBE_HEARTBEAT_SEC", 60.0)
EPISODE_REPEAT_SEC = _env_float("WG_PROBE_EPISODE_REPEAT_SEC", 5.0)
MAX_LINES_PER_MIN = _env_int("WG_PROBE_MAX_LINES_PER_MIN", 20)
RATE_WINDOW_SEC = _env_float("WG_PROBE_RATE_WINDOW_SEC", 60.0)
WG_BIN = _env_str("WG_PROBE_WG_BIN", "/usr/bin/wg")
PING_BIN = _env_str("WG_PROBE_PING_BIN", "/usr/bin/ping")
TARGETS_RAW = _env_str("WG_PROBE_TARGETS", "kt=168.126.63.1,lgu=164.124.101.2")


def parse_targets(raw):
    """'kt=1.2.3.4,lgu=5.6.7.8' → [('kt','1.2.3.4'), ('lgu','5.6.7.8')]"""
    out = []
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        if "=" in item:
            label, addr = item.split("=", 1)
        else:
            label, addr = item, item
        label = re.sub(r"[^a-z0-9_]", "", label.strip().lower())
        addr = addr.strip()
        if label and addr:
            out.append((label, addr))
    return out


TARGETS = parse_targets(TARGETS_RAW)


# ───────────────────────────────────────────────────────────────
# 파서 — 실측 형식에 맞춘다. self-check 의 P1·P2 가 이 둘을 고정한다.
# ───────────────────────────────────────────────────────────────
class PeerSample:
    __slots__ = ("key", "label", "endpoint", "hs", "rx", "tx")

    def __init__(self, key, label, endpoint, hs, rx, tx):
        self.key = key
        self.label = label
        self.endpoint = endpoint
        self.hs = hs
        self.rx = rx
        self.tx = tx


def parse_wg_dump(text):
    """`wg show <iface> dump` → {공개키: PeerSample}

    첫 행은 인터페이스(4필드: 개인키·공개키·포트·fwmark)이고 피어 행은 8필드다.
    필드 수로 가른다 — 첫 행을 '항상 건너뛴다'로 구현하면 인터페이스 행이 없는
    변종 출력에서 피어를 하나 잃는다.

    라벨은 AllowedIPs 의 첫 항목에서 마스크를 떼어 만든다. 공개키는 dict 키로만
    쓰고 **출력에 절대 싣지 않는다.**
    """
    peers = {}
    order = 0
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        f = line.split("\t") if "\t" in line else line.split()
        if len(f) < 8:
            continue  # 인터페이스 행
        order += 1
        key = f[0]
        endpoint = f[2]
        allowed = f[3]
        label = ""
        if allowed and allowed != "(none)":
            first = allowed.split(",")[0].strip()
            label = first.split("/")[0].strip()
        if not label:
            label = "peer#%d" % order
        try:
            hs = int(f[4])
            rx = int(f[5])
            tx = int(f[6])
        except ValueError:
            continue
        peers[key] = PeerSample(key, label, endpoint, hs, rx, tx)
    return peers


_NETDEV_FIELDS = (
    "rx_bytes", "rx_packets", "rx_errs", "rx_drop",
    "rx_fifo", "rx_frame", "rx_compressed", "rx_multicast",
    "tx_bytes", "tx_packets", "tx_errs", "tx_drop",
    "tx_fifo", "tx_colls", "tx_carrier", "tx_compressed",
)


def parse_proc_net_dev(text):
    """`/proc/net/dev` → {iface: {필드: int}}

    이름과 콜론이 붙어 나올 수 있고(큰 수에서는 콜론과 첫 값도 붙는다)
    공백 분리만으로는 깨진다. 콜론을 먼저 가른다.
    """
    out = {}
    for line in text.splitlines():
        if ":" not in line:
            continue
        name, rest = line.split(":", 1)
        name = name.strip()
        if not name:
            continue
        vals = rest.split()
        if len(vals) < len(_NETDEV_FIELDS):
            continue
        try:
            nums = [int(v) for v in vals[: len(_NETDEV_FIELDS)]]
        except ValueError:
            continue
        out[name] = dict(zip(_NETDEV_FIELDS, nums))
    return out


# ───────────────────────────────────────────────────────────────
# 출력 — 분당 상한이 붙는 이상 줄과, 상한이 없는 생존·시작·종료 줄을 가른다.
# ───────────────────────────────────────────────────────────────
_WS = re.compile(r"\s+")


def scrub(v):
    """값에 공백이 섞이면 key=value 한 줄 형식이 깨진다."""
    return _WS.sub("_", str(v))


def kv(fields):
    return " ".join("%s=%s" % (k, scrub(v)) for k, v in fields)


class Emitter:
    def __init__(self, sink, wallclock=time.time,
                 limit=MAX_LINES_PER_MIN, window=RATE_WINDOW_SEC):
        self.sink = sink
        self.wallclock = wallclock
        self.limit = limit
        self.window = window
        self._win_start = None
        self._count = 0
        self._suppressed = 0

    def _line(self, fields):
        self.sink("t=%d %s" % (int(self.wallclock()), kv(fields)))

    def plain(self, fields):
        """생존·시작·종료 — 상한 없음. 이 줄이 눌리면 귀속 근거가 사라진다."""
        self._line(fields)

    def event(self, now, fields):
        """이상 줄 — 분당 상한을 받는다."""
        if self._win_start is None or (now - self._win_start) >= self.window:
            self.flush()
            self._win_start = now
            self._count = 0
        if self._count < self.limit:
            self._count += 1
            self._line(fields)
        else:
            self._suppressed += 1

    def flush(self):
        if self._suppressed:
            n = self._suppressed
            self._suppressed = 0
            self._line((("ev", "suppressed"), ("n", n)))


# ───────────────────────────────────────────────────────────────
# 왕복시간 — 지속 ping 프로세스 1개/대상. 초당 fork 0회.
# ───────────────────────────────────────────────────────────────
_RE_TIME = re.compile(r"time[=<]\s*([0-9.]+)\s*ms")
_RE_NOANS = re.compile(r"no answer yet for icmp_seq")


class PingReader:
    """`ping -i 1 -O -n <ip>` 를 띄우고 stdout 을 데몬 스레드로 읽는다.

    `-O` 는 응답이 제때 안 오면 그 자리에서 `no answer yet ...` 을 찍는다 —
    이것이 있어야 정지 구간이 1초 해상도로 보인다(없으면 요약에서만 드러난다).
    """

    def __init__(self, label, addr, note):
        self.label = label
        self.addr = addr
        self.note = note  # note(kind, fields) — 재기동 기록용
        self.samples = deque(maxlen=RTT_WINDOW)  # (ok: bool, ms: float|None)
        self.miss_streak = 0
        self.high_streak = 0
        self.restarts = 0
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._proc = None
        self._thread = threading.Thread(target=self._run, daemon=True)

    def start(self):
        self._thread.start()

    def stop(self):
        self._stop.set()
        p = self._proc
        if p is not None and p.poll() is None:
            try:
                p.terminate()
            except OSError:
                pass

    def _spawn(self):
        return subprocess.Popen(
            [PING_BIN, "-n", "-O", "-i", "1", self.addr],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )

    def _run(self):
        while not self._stop.is_set():
            try:
                self._proc = self._spawn()
            except OSError:
                # ping 이 아예 없거나 못 띄운다 — 측정기를 죽이지 않는다.
                self.note("ping_spawn_fail", (("target", self.label),))
                return
            for line in self._proc.stdout:
                if self._stop.is_set():
                    break
                self._ingest(line)
            if self._stop.is_set():
                break
            # 프로세스가 죽었다. 5초 뒤 1회 재기동한다 — 즉시 되던지지 않는다.
            self.restarts += 1
            self.note("ping_restart",
                      (("target", self.label), ("n", self.restarts)))
            if self._stop.wait(5.0):
                break

    def _ingest(self, line):
        m = _RE_TIME.search(line)
        if m:
            try:
                ms = float(m.group(1))
            except ValueError:
                return
            with self._lock:
                self.samples.append((True, ms))
                self.miss_streak = 0
                if ms > RTT_HIGH_MS:
                    self.high_streak += 1
                else:
                    self.high_streak = 0
            return
        if _RE_NOANS.search(line):
            with self._lock:
                self.samples.append((False, None))
                self.miss_streak += 1
                self.high_streak = 0

    def summary(self):
        """(요약문자열, 무응답수) — 최근 RTT_WINDOW 표본 기준."""
        with self._lock:
            vals = [ms for ok, ms in self.samples if ok and ms is not None]
            miss = sum(1 for ok, _ in self.samples if not ok)
        if not vals:
            return "na", miss
        return ("%.1f/%.1f/%.1f" % (min(vals), sum(vals) / len(vals), max(vals)),
                miss)

    def conditions(self):
        with self._lock:
            high = self.high_streak >= RTT_HIGH_N
            loss = self.miss_streak >= RTT_LOSS_N
            hs, ms_ = self.high_streak, self.miss_streak
        out = []
        if high:
            out.append(("rtt_high", (("target", self.label), ("n", hs))))
        if loss:
            out.append(("rtt_loss", (("target", self.label), ("n", ms_))))
        return out


class NoPings:
    """ping 이 없을 때의 널 구현 — 측정기는 wg 측정만으로 계속 돈다."""

    targets = ()

    def suffix(self):
        return ()

    def conditions(self):
        return []

    def stop(self):
        pass


class PingSet:
    def __init__(self, readers):
        self.readers = readers
        self.targets = tuple(r.label for r in readers)

    def suffix(self):
        out = []
        for r in self.readers:
            s, miss = r.summary()
            out.append(("rtt_" + r.label, s))
            out.append(("miss_" + r.label, miss))
        return tuple(out)

    def conditions(self):
        out = []
        for r in self.readers:
            out.extend(r.conditions())
        return out

    def stop(self):
        for r in self.readers:
            r.stop()


# ───────────────────────────────────────────────────────────────
# 판정기 — 한 틱분의 표본을 받아 에피소드를 열고 닫는다.
# 라이브 루프와 self-check 가 **같은 코드**를 탄다. 그래야 self-check 가
# 증명하는 것이 실제로 도는 것과 같아진다.
# ───────────────────────────────────────────────────────────────
class Detector:
    def __init__(self, emitter, rtt_suffix=lambda: (), rtt_conditions=lambda: []):
        self.em = emitter
        self.rtt_suffix = rtt_suffix
        self.rtt_conditions = rtt_conditions
        self.peers = {}
        self.netdev_prev = {}
        self.episodes = {}
        self.events_since_alive = 0

    # -- 이상 줄 한 개 --------------------------------------------------
    def _emit_event(self, now, ev, kind, subject, extra):
        fields = [("ev", ev), ("kind", kind), ("peer", subject)]
        fields.extend(extra)
        fields.extend(self.rtt_suffix())
        self.em.event(now, tuple(fields))
        self.events_since_alive += 1

    def once(self, now, kind, extra):
        self._emit_event(now, "once", kind, "-", extra)

    # -- 한 틱 ----------------------------------------------------------
    def tick(self, now, wall, peers, netdev):
        active = {}

        for key, s in peers.items():
            st = self.peers.get(key)
            if st is None:
                # 첫 관측. 델타를 낼 수 없으므로 앵커만 세우고 넘어간다.
                # last_move 를 None 으로 두는 것이 중요하다 — now 로 두면
                # 갓 보인 유휴 피어가 hs_stale 의 「최근 활동」 조건을 통과해
                # 거짓 발화한다.
                self.peers[key] = {
                    "label": s.label, "rx": s.rx, "tx": s.tx, "hs": s.hs,
                    "endpoint": s.endpoint, "epchg": 0,
                    "rx_anchor_t": now, "rx_anchor_tx": s.tx,
                    "tx_anchor_t": now, "tx_anchor_rx": s.rx,
                    "last_move": None,
                }
                continue

            if s.endpoint != st["endpoint"]:
                st["epchg"] += 1
                st["endpoint"] = s.endpoint  # 주소는 저장만 하고 출력하지 않는다

            rx_moved = s.rx != st["rx"]
            tx_moved = s.tx != st["tx"]
            if rx_moved:
                st["rx_anchor_t"] = now
                st["rx_anchor_tx"] = s.tx
            if tx_moved:
                st["tx_anchor_t"] = now
                st["tx_anchor_rx"] = s.rx
            if rx_moved or tx_moved:
                st["last_move"] = now

            st["rx"], st["tx"], st["hs"], st["label"] = s.rx, s.tx, s.hs, s.label

            rx_idle = now - st["rx_anchor_t"]
            tx_since = s.tx - st["rx_anchor_tx"]
            if rx_idle >= STALL_SEC and tx_since >= TX_MIN_BYTES:
                active[("rx_stall", s.label)] = {
                    "t0": st["rx_anchor_t"],
                    "extra": (("idle", "%.1f" % rx_idle), ("txd", tx_since),
                              ("epchg", st["epchg"])),
                }

            tx_idle = now - st["tx_anchor_t"]
            rx_since = s.rx - st["tx_anchor_rx"]
            if tx_idle >= STALL_SEC and rx_since >= TX_MIN_BYTES:
                active[("tx_stall", s.label)] = {
                    "t0": st["tx_anchor_t"],
                    "extra": (("idle", "%.1f" % tx_idle), ("rxd", rx_since),
                              ("epchg", st["epchg"])),
                }

            if s.hs > 0:
                age = wall - s.hs
                recent = st["last_move"] is not None and (now - st["last_move"]) <= HS_ACTIVE_SEC
                if age > HS_STALE_SEC and recent:
                    active[("hs_stale", s.label)] = {
                        "t0": now,
                        "extra": (("hs_age", int(age)),),
                    }

        for kind, extra in self.rtt_conditions():
            label = dict(extra).get("target", "-")
            active[(kind, label)] = {"t0": now, "extra": extra}

        # 에피소드 닫기 — 조건이 사라진 것부터.
        for k in list(self.episodes):
            if k not in active:
                ep = self.episodes.pop(k)
                kind, subject = k
                self._emit_event(now, "close", kind, subject,
                                 (("dur", "%.1f" % (now - ep["t0"])),))

        # 열기 / 이어가기
        for k, info in active.items():
            kind, subject = k
            ep = self.episodes.get(k)
            if ep is None:
                self.episodes[k] = {"t0": info["t0"], "last": now}
                self._emit_event(now, "open", kind, subject, info["extra"])
            elif (now - ep["last"]) >= EPISODE_REPEAT_SEC:
                ep["last"] = now
                self._emit_event(now, "cont", kind, subject, info["extra"])

        # 순간 사건 — 카운터 증가분. 에피소드가 아니라 한 줄로 끝난다.
        self._netdev(now, netdev)

    def _netdev(self, now, netdev):
        prev, self.netdev_prev = self.netdev_prev, netdev
        wg_prev, wg_cur = prev.get(IFACE), netdev.get(IFACE)
        if wg_prev and wg_cur:
            for field, kind in (("tx_drop", "wg_txdrop"), ("rx_drop", "wg_rxdrop")):
                d = wg_cur[field] - wg_prev[field]
                if d > 0:
                    self.once(now, kind,
                              (("d", d), ("total", wg_cur[field]), ("iface", IFACE)))
        up_prev, up_cur = prev.get(UPLINK), netdev.get(UPLINK)
        if up_prev and up_cur:
            for field in ("rx_errs", "tx_errs", "rx_drop", "tx_drop"):
                d = up_cur[field] - up_prev[field]
                if d > 0:
                    self.once(now, "uplink_err",
                              (("which", field), ("d", d),
                               ("total", up_cur[field]), ("iface", UPLINK)))


# ───────────────────────────────────────────────────────────────
# 라이브 루프
# ───────────────────────────────────────────────────────────────
_stop_flag = threading.Event()


def _on_signal(signum, _frame):
    _stop_flag.set()


def read_wg_dump():
    r = subprocess.run([WG_BIN, "show", IFACE, "dump"],
                       capture_output=True, text=True, timeout=5)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or "rc=%d" % r.returncode).strip())
    return r.stdout


def read_proc_net_dev():
    with open("/proc/net/dev", "r") as fh:
        return fh.read()


def threshold_fields():
    return (
        ("iface", IFACE), ("uplink", UPLINK),
        ("interval", INTERVAL_SEC), ("stall_sec", STALL_SEC),
        ("tx_min_bytes", TX_MIN_BYTES), ("hs_stale_sec", HS_STALE_SEC),
        ("hs_active_sec", HS_ACTIVE_SEC), ("rtt_high_ms", RTT_HIGH_MS),
        ("rtt_high_n", RTT_HIGH_N), ("rtt_loss_n", RTT_LOSS_N),
        ("heartbeat_sec", HEARTBEAT_SEC), ("episode_repeat_sec", EPISODE_REPEAT_SEC),
        ("max_lines_per_min", MAX_LINES_PER_MIN),
        ("targets", ",".join(l for l, _ in TARGETS)),
    )


def run_live(duration=None):
    em = Emitter(sink=lambda s: print(s, flush=True))

    pending_notes = []

    def note(kind, fields):
        pending_notes.append((kind, fields))

    if os.path.exists(PING_BIN) and TARGETS:
        readers = [PingReader(label, addr, note) for label, addr in TARGETS]
        for r in readers:
            r.start()
        pings = PingSet(readers)
    else:
        em.plain((("ev", "warn"), ("reason", "no_ping_binary"), ("path", PING_BIN)))
        pings = NoPings()

    det = Detector(em, rtt_suffix=pings.suffix, rtt_conditions=pings.conditions)

    start_mono = time.monotonic()
    em.plain((("ev", "start"), ("pid", os.getpid()),
              ("py", "%d.%d.%d" % sys.version_info[:3])) + threshold_fields())

    next_tick = start_mono
    next_alive = start_mono + HEARTBEAT_SEC
    last_wg_fail = 0.0
    peers_seen = 0

    try:
        while not _stop_flag.is_set():
            now = time.monotonic()
            wall = time.time()

            while pending_notes:
                kind, fields = pending_notes.pop(0)
                det.once(now, kind, fields)

            try:
                peers = parse_wg_dump(read_wg_dump())
                peers_seen = len(peers)
            except Exception as exc:  # 측정기는 죽지 않는다.
                peers = {}
                if now - last_wg_fail >= 60.0:
                    last_wg_fail = now
                    det.once(now, "wg_read_fail", (("err", exc),))

            try:
                netdev = parse_proc_net_dev(read_proc_net_dev())
            except OSError:
                netdev = {}

            det.tick(now, wall, peers, netdev)

            if now >= next_alive:
                wg = netdev.get(IFACE, {})
                up = netdev.get(UPLINK, {})
                em.plain((
                    ("ev", "alive"),
                    ("up", int(now - start_mono)),
                    ("peers", peers_seen),
                    ("wg_txdrop", wg.get("tx_drop", "na")),
                    ("wg_rxdrop", wg.get("rx_drop", "na")),
                    ("up_rxerr", up.get("rx_errs", "na")),
                    ("up_txerr", up.get("tx_errs", "na")),
                    ("events", det.events_since_alive),
                ) + pings.suffix())
                det.events_since_alive = 0
                next_alive += HEARTBEAT_SEC

            if duration is not None and (now - start_mono) >= duration:
                break

            # 절대 스케줄 — sleep(1) 누적은 드리프트한다. 밀린 틱은 건너뛴다.
            next_tick += INTERVAL_SEC
            now2 = time.monotonic()
            while next_tick <= now2:
                next_tick += INTERVAL_SEC
            if _stop_flag.wait(next_tick - now2):
                break
    finally:
        pings.stop()
        em.flush()
        em.plain((("ev", "stop"), ("up", int(time.monotonic() - start_mono))))
    return 0


# ───────────────────────────────────────────────────────────────
# self-check — 오프라인 합성 리플레이. 데이터패스를 건드리지 않는다.
#
# D1 이 이 프로그램의 존재 이유를 잠근다: 임계값이 이번 10.5초 단방향 정지를
# 잡지 못하면 여기서 실패한다.
# ───────────────────────────────────────────────────────────────
def _fakekey(c):
    return (c * 43) + "="


# RFC 5737 문서화 대역만 쓴다 — 실제 피어의 공인 IP 를 저장소에 넣지 않는다.
_FAKE_ENDPOINTS = (
    "203.0.113.11:51001",
    "198.51.100.22:51002",
    "198.51.100.22:51003",
    "198.51.100.22:51004",
    "198.51.100.22:51005",
)
_FAKE_PEERKEYS = tuple(_fakekey(c) for c in "ABCDE")
_FAKE_PSK = _fakekey("Z")
_FAKE_IFKEYS = (_fakekey("I"), _fakekey("J"))

_PROC_SAMPLE = """Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 1234 12 0 0 0 0 0 0 1234 12 0 0 0 0 0 0
  ens4: 8844707944 20074114    0    0    0     0          0         0 7729049385 19566479    0    0    0     0       0          0
   wg0: 411645716 4692008    0    0    0     0          0         0 5441735212 11517392    0  371    0     0       0          0
"""


def _dump_text(rows):
    """rows: [(hs, rx, tx)] 5개 → 실측 형식 그대로의 dump 문자열."""
    lines = ["%s %s 51820 off" % _FAKE_IFKEYS]
    for i, (hs, rx, tx) in enumerate(rows):
        lines.append("%s %s %s 10.20.0.%d/32 %d %d %d off" % (
            _FAKE_PEERKEYS[i], _FAKE_PSK, _FAKE_ENDPOINTS[i], i + 2, hs, rx, tx))
    return "\n".join(lines) + "\n"


def _netdev(tx_drop=371, rx_drop=0, up_rx_errs=0, up_tx_errs=0):
    d = parse_proc_net_dev(_PROC_SAMPLE)
    d[IFACE]["tx_drop"] = tx_drop
    d[IFACE]["rx_drop"] = rx_drop
    d[UPLINK]["rx_errs"] = up_rx_errs
    d[UPLINK]["tx_errs"] = up_tx_errs
    return d


class _Harness:
    """합성 시계 + 줄 수집. 라이브와 같은 Detector/Emitter 를 돌린다."""

    def __init__(self, base_wall=1789516000):
        self.lines = []
        self.wall = float(base_wall)
        self.em = Emitter(sink=self.lines.append, wallclock=lambda: self.wall)
        self.det = Detector(self.em)

    def tick(self, now, peers_text, netdev, wall=None):
        self.wall = float(wall) if wall is not None else self.wall
        self.det.tick(now, self.wall, parse_wg_dump(peers_text), netdev)

    def events(self, ev=None, kind=None):
        out = []
        for line in self.lines:
            f = dict(tok.split("=", 1) for tok in line.split() if "=" in tok)
            if ev is not None and f.get("ev") != ev:
                continue
            if kind is not None and f.get("kind") != kind:
                continue
            out.append(f)
        return out


def self_check():
    failures = []
    all_lines = []

    def check(cond, msg):
        if not cond:
            failures.append(msg)

    # ── P1: wg dump 파서 ───────────────────────────────────────
    rows = [(1789515547, 100, 200), (1789515621, 300, 400), (1789515584, 500, 600),
            (1789515626, 700, 800), (1789371572, 900, 1000)]
    peers = parse_wg_dump(_dump_text(rows))
    labels = sorted(p.label for p in peers.values())
    check(len(peers) == 5, "P1: 피어 5개를 못 뽑았다 (got %d)" % len(peers))
    check(labels == ["10.20.0.%d" % n for n in range(2, 7)],
          "P1: 라벨이 AllowedIPs 기반이 아니다 (%s)" % labels)
    one = [p for p in peers.values() if p.label == "10.20.0.2"][0]
    check(one.hs == 1789515547 and one.rx == 100 and one.tx == 200,
          "P1: hs/rx/tx 정수 파싱 실패")
    noalw = parse_wg_dump(
        "%s %s 51820 off\n%s %s 203.0.113.9:1 (none) 0 1 2 off\n"
        % (_FAKE_IFKEYS + (_FAKE_PEERKEYS[0], _FAKE_PSK)))
    check([p.label for p in noalw.values()] == ["peer#1"],
          "P1: AllowedIPs 없는 피어가 peer#N 으로 안 떨어진다")

    # ── P2: /proc/net/dev 파서 ────────────────────────────────
    nd = parse_proc_net_dev(_PROC_SAMPLE)
    check(nd[IFACE]["tx_drop"] == 371 and nd[IFACE]["rx_drop"] == 0,
          "P2: wg0 드롭 파싱 실패 (%s)" % nd.get(IFACE))
    check(nd[UPLINK]["rx_errs"] == 0 and nd[UPLINK]["tx_errs"] == 0,
          "P2: ens4 오류 파싱 실패")

    # ── D1 (핵심): 10.5초 단방향 정지를 잡는가 ─────────────────
    # 10.20.0.4 의 rx 가 t=5.0~15.5 동안 고정, 같은 구간 tx 는 4000B/s 증가.
    # 표본은 0.5초 간격(= 사건이 틱 경계에 맞지 않는 실제 상황을 흉내낸다).
    h = _Harness()
    rx_base, tx_base = 1_000_000, 2_000_000
    t = 0.0
    while t <= 20.0 + 1e-9:
        rows = []
        for idx in range(5):
            if idx == 2:  # 10.20.0.4
                frozen = 5.0 < t <= 15.5
                rx = rx_base + int((5.0 if frozen else t) * 8000)
                tx = tx_base + int(t * 4000)
            else:
                rx = rx_base + int(t * 8000)
                tx = tx_base + int(t * 4000)
            rows.append((int(h.wall) - 30, rx, tx))
        h.tick(t, _dump_text(rows), _netdev(), wall=1789516000 + t)
        t += 0.5
    all_lines.extend(h.lines)

    opens = h.events(ev="open", kind="rx_stall")
    conts = h.events(ev="cont", kind="rx_stall")
    closes = h.events(ev="close", kind="rx_stall")
    check(len(opens) == 1,
          "D1: rx_stall open 이 정확히 1개여야 한다 (got %d) — 10.5초 사건을 못 잡거나 중복 발화한다"
          % len(opens))
    if opens:
        check(opens[0]["peer"] == "10.20.0.4",
              "D1: 엉뚱한 피어에서 발화했다 (%s)" % opens[0]["peer"])
    check(len(conts) >= 1, "D1: cont 가 한 줄도 없다 (got %d)" % len(conts))
    check(len(closes) == 1, "D1: close 가 정확히 1개여야 한다 (got %d)" % len(closes))
    if closes:
        dur = float(closes[0]["dur"])
        check(10.0 <= dur <= 11.5,
              "D1: close 의 dur 이 실제 정지시간(10.5초)과 안 맞는다 (got %.1f)" % dur)
    others = [e for e in h.events(ev="open") if e["peer"] != "10.20.0.4"]
    check(not others,
          "D1: 정지하지 않은 피어에서도 발화했다 (%s)" % [e["peer"] for e in others])

    # ── D2: keepalive 오탐 없음 ────────────────────────────────
    # rx 60초 고정 + tx 가 25초마다 32B 만 증가 → 512B 하한에 막혀 이벤트 0건.
    h2 = _Harness()
    t = 0.0
    while t <= 60.0 + 1e-9:
        tx = tx_base + 32 * int(t // 25)
        rows = [(int(h2.wall) - 30, rx_base, tx)] * 1
        rows = rows + [(int(h2.wall) - 30, rx_base + int(t * 8000),
                        tx_base + int(t * 8000))] * 4
        h2.tick(t, _dump_text(rows), _netdev(), wall=1789516000 + t)
        t += 1.0
    all_lines.extend(h2.lines)
    ev2 = [e for e in h2.events() if e.get("ev") in ("open", "cont", "close", "once")
           and e.get("peer") == "10.20.0.2"]
    check(not ev2,
          "D2: keepalive 전용 트래픽(32B/25초)에서 오탐이 났다 — 512B 하한이 일하지 않는다 (%s)"
          % [e.get("kind") for e in ev2])

    # ── D3: 핸드셰이크 노후 ────────────────────────────────────
    h3 = _Harness()
    for i in range(6):
        t = float(i)
        wall = 1789516000 + t
        rows = [(int(wall) - 200, rx_base + i * 9000, tx_base + i * 9000)] * 5
        h3.tick(t, _dump_text(rows), _netdev(), wall=wall)
    all_lines.extend(h3.lines)
    hs_opens = h3.events(ev="open", kind="hs_stale")
    check(len(hs_opens) == 5,
          "D3: 움직이는 피어 5개 전부에서 hs_stale 이 떠야 한다 (got %d)" % len(hs_opens))

    h3b = _Harness()
    for i in range(6):
        t = float(i)
        wall = 1789516000 + t
        rows = [(int(wall) - 200, rx_base, tx_base)] * 5  # 완전 유휴
        h3b.tick(t, _dump_text(rows), _netdev(), wall=wall)
    all_lines.extend(h3b.lines)
    check(not h3b.events(kind="hs_stale"),
          "D3: 유휴 피어에서 hs_stale 이 떴다 — 「최근 활동」 조건이 일하지 않는다")

    # ── D4: 드롭 증가 ─────────────────────────────────────────
    h4 = _Harness()
    for i, drop in enumerate((371, 371, 372)):
        t = float(i)
        wall = 1789516000 + t
        rows = [(int(wall) - 30, rx_base + i * 9000, tx_base + i * 9000)] * 5
        h4.tick(t, _dump_text(rows), _netdev(tx_drop=drop), wall=wall)
    all_lines.extend(h4.lines)
    drops = h4.events(ev="once", kind="wg_txdrop")
    check(len(drops) == 1, "D4: wg_txdrop 이 정확히 1건이어야 한다 (got %d)" % len(drops))
    if drops:
        check(drops[0].get("d") == "1", "D4: d=1 이 아니다 (%s)" % drops[0].get("d"))
        check(drops[0].get("total") == "372", "D4: total=372 가 아니다")

    # ── D5: 폭주 상한 ─────────────────────────────────────────
    # 0.1초 간격 200틱(=20초, 한 창 안)에 드롭을 매 틱 1씩 올려 200건을 유발한다.
    h5 = _Harness()
    for i in range(201):
        t = i * 0.1
        wall = 1789516000 + t
        rows = [(int(wall) - 30, rx_base + i * 9000, tx_base + i * 9000)] * 5
        h5.tick(t, _dump_text(rows), _netdev(tx_drop=371 + i), wall=wall)
    h5.em.flush()
    all_lines.extend(h5.lines)
    once5 = h5.events(ev="once")
    supp5 = h5.events(ev="suppressed")
    check(len(once5) <= MAX_LINES_PER_MIN,
          "D5: 분당 상한(%d)을 넘겨 %d줄이 나갔다" % (MAX_LINES_PER_MIN, len(once5)))
    check(len(supp5) == 1,
          "D5: suppressed 요약이 정확히 1줄이어야 한다 (got %d)" % len(supp5))
    if supp5:
        check(int(supp5[0]["n"]) > 0, "D5: suppressed n 이 0이다")

    # ── R1 (필수): redaction ──────────────────────────────────
    blob = "\n".join(all_lines)
    secrets = list(_FAKE_PEERKEYS) + list(_FAKE_IFKEYS) + [_FAKE_PSK]
    for s in secrets:
        check(s not in blob, "R1: 출력에 키가 새어나갔다 (%s...)" % s[:6])
    for ep in _FAKE_ENDPOINTS:
        addr = ep.split(":")[0]
        check(ep not in blob, "R1: 출력에 엔드포인트가 새어나갔다 (%s)" % ep)
        check(addr not in blob, "R1: 출력에 엔드포인트 주소가 새어나갔다 (%s)" % addr)
    check(not re.search(r"[A-Za-z0-9+/]{43}=", blob),
          "R1: 출력에 base64 44자 키 패턴이 있다")

    # ── R2: 형식 ──────────────────────────────────────────────
    for line in all_lines:
        if "\n" in line or "\r" in line:
            check(False, "R2: 줄에 개행이 들어 있다")
            break
        for tok in line.split(" "):
            if not tok:
                continue
            if not re.match(r"^[a-z_][a-z0-9_]*=\S*$", tok):
                check(False, "R2: key=value 형식이 아닌 토큰 (%r in %r)" % (tok, line))
                break
        else:
            continue
        break

    if failures:
        for f in failures:
            print("SELF-CHECK FAIL: %s" % f)
        print("SELF-CHECK FAILED (%d)" % len(failures))
        return 1
    print("SELF-CHECK PASS (P1 P2 D1 D2 D3 D4 D5 R1 R2 — lines=%d)" % len(all_lines))
    return 0


# ───────────────────────────────────────────────────────────────
def main(argv):
    args = argv[1:]
    if "--self-check" in args:
        return self_check()
    duration = None
    if "--duration" in args:
        i = args.index("--duration")
        try:
            duration = float(args[i + 1])
        except (IndexError, ValueError):
            print("ev=fatal reason=bad_duration")
            return 64
    signal.signal(signal.SIGTERM, _on_signal)
    signal.signal(signal.SIGINT, _on_signal)
    return run_live(duration)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
