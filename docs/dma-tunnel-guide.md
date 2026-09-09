# DMA 터널 사용 설명서 — 개발기에서 KB 게이트웨이 직결

개발기(Mac / Windows)가 KB VPN 을 직접 물지 않고 **`10.41.1.120:9100` 에 주소 그대로** 붙게 하는 방법이다.
radar-gw(GCE VM)가 KB VPN 을 상시 물고 있고, 개발기는 그 VM 에 WireGuard 로 붙어 그 세션을 빌린다.

```
개발기 WireGuard ──UDP 51820──▶ radar-gw wg0 ──▶ tun0(KB VPN) ──▶ 10.41.1.120:9100
```

> 🔴 **터널 너머는 실계좌가 걸린 실 게이트웨이다.**
> 이 문서의 확인 절차는 전부 **TCP 연결 성립까지만** 본다. 로그인·주문 프레임을 보내지 않는다 (D-27).
> 터널을 연 뒤 무엇을 보내는지는 사용자 책임이다.

운영 상세(VM 자산·nft 규칙·폴백 설계)는 [infra/relay/README.md §DMA 터널](../infra/relay/README.md) 이 정본이다.
이 문서는 **사용자 관점의 절차**만 다룬다.

---

## 0. 공통 — 시작 전에 알아둘 것

| 항목 | 내용 |
|------|------|
| 필요한 값 2개 | **서버 공개키**(radar-gw 의 wg0 공개키)와 **배정 주소** `10.20.0.<N>`. 관리자에게 받는다. 관리자는 아래 §4 로 확인한다 |
| 내가 주는 값 1개 | 내 기기의 **WireGuard 공개키**(base64 44자). 관리자가 VM 에 등록해야 연결된다. **개인키는 절대 보내지 않는다** |
| 주소 배정 | 기기마다 N 이 달라야 한다. 예: Mac `10.20.0.2`, Windows `10.20.0.3` |
| 닿는 곳 | `10.41.1.120` 의 **9100·22** 두 포트뿐. 다른 주소·포트는 VM 이 막는다. 인터넷·사내 자원은 터널을 켠 채로 그대로 쓴다 |
| 동시 사용 금지 | **KB VPN 직결(openconnect / KB 클라이언트)과 터널을 동시에 켜지 않는다.** `10.41.x` 라우팅이 겹친다 |
| 소비자 설정 | gh-trade `settings.ini` 의 `[DMA] Host=10.41.1.120` 등은 **바꾸지 않는다** |

---

## 1. Mac

Mac 은 별도 WireGuard 앱이 필요 없다. 메뉴바 앱(v3.6)이 `brew wireguard-tools` 로 터널을 직접 켜고 끈다.

### 1-1. 설치 (최초 1회)

```bash
brew install wireguard-tools
bash scripts/install-vpn-menubar.sh
```

설치 스크립트가 순서대로 묻는다.

1. **서버 공개키** — 관리자에게 받은 44자 값을 붙여넣는다.
2. **배정 주소 N** — 예: `2` (→ `10.20.0.2`).

스크립트가 키쌍을 만들어 `KB-DMA.conf`(root 0600)에 넣고, 화면에는 **내 공개키만** 출력한다.
그 값을 관리자에게 전달한다. 재실행해도 키는 다시 만들지 않으며 두 값은 기존 값이 기본으로 뜬다.

값을 나중에 받는 경우: 두 프롬프트를 비워 두면 터널 메뉴만 비활성인 채 나머지(VPN 직결·교보)는 설치된다.
값을 받은 뒤 스크립트를 다시 실행하면 된다.

공개키를 잃어버렸으면 (개인키는 출력되지 않는다):

```bash
sudo sh -c 'sed -n "s/^PrivateKey = //p" /opt/homebrew/etc/wireguard/KB-DMA.conf | wg pubkey'
```

### 1-2. 관리자 등록 대기

관리자가 §4 의 `wg-peer-add` 로 내 공개키를 등록해야 한다. 그 전에는 켜도 핸드셰이크가 되지 않는다.

### 1-3. 사용

메뉴바 `KB ●` 아이콘 → **터널 연결 / 끊기**. 켜지면 글리프가 `◆` 로 바뀐다.

| 메뉴 | 하는 일 |
|------|---------|
| 터널 연결 / 끊기 | `wg-quick up/down` (sudo 면제, 비밀번호 안 묻는다) |
| 터널 선행 점검 | wg-quick 존재 · `KB-DMA.conf` 존재 · sudo 면제 · VM 쪽 VPN(`/healthz` `vpn:true`) · 로컬 KB VPN 충돌. **아무것도 바꾸지 않는다** |
| SSH 명령 복사 | `ssh smok95@10.41.1.120` 을 클립보드로 (터널 중 주소 그대로 접속된다) |

VPN 직결이 켜져 있으면 터널 버튼이 잠긴다(반대도 같다). 한쪽을 끄고 켠다.

### 1-4. 확인

```bash
ifconfig | grep 'inet 10.20.0.'          # 10.20.0.<N> 이 utun 에 붙어 있어야 한다
nc -z -G 5 10.41.1.120 9100 && echo OK   # 도달성만. 로그인·주문 금지
```

### 1-5. 로그 · 제거

| 무엇 | 위치 |
|------|------|
| wg-quick 출력 | `/var/log/kbdma.log` |
| 앱 판정 로그 | `~/Library/Logs/dma-tunnel.log` |
| 제거 | `bash scripts/install-vpn-menubar.sh --uninstall` — 헬퍼·sudo 면제는 지우고 `KB-DMA.conf`(키)는 남긴다 |

---

## 2. Windows

Windows 는 **공식 WireGuard 앱**을 쓴다. 앱 자체가 켜고 끄는 스위치다.

### 2-1. 설치 (최초 1회)

1. <https://www.wireguard.com/install/> 에서 Windows 설치 파일을 받아 설치한다.
2. 앱에서 **터널 추가 ▾ → 빈 터널 추가**(Add empty tunnel). 개인키·공개키가 자동 생성되고 화면 위에 **공개키**가 보인다.
3. 이름을 `KB-DMA` 로 하고 내용을 아래처럼 채운다. 자동 생성된 `PrivateKey` 줄은 그대로 둔다.

```ini
[Interface]
PrivateKey = (앱이 만든 값 그대로)
Address = 10.20.0.<N>/32

[Peer]
PublicKey = <서버 공개키>
Endpoint = dma.jx1.io:51820
AllowedIPs = 10.41.1.120/32
PersistentKeepalive = 25
```

4. 저장하고 화면의 **공개키**(44자)를 관리자에게 전달한다. 개인키는 보내지 않는다.

> 템플릿 파일 [infra/relay/wireguard/client.conf.template](../infra/relay/wireguard/client.conf.template) 을 채워
> **가져오기(Import)** 해도 된다. 채운 파일은 저장소에 넣지 않는다.

### 2-2. 관리자 등록 대기

관리자가 §4 로 등록하면 그 뒤로는 앱에서 켜기만 하면 된다.

### 2-3. 사용

앱에서 `KB-DMA` 선택 → **활성화**. 끌 때는 **비활성화**.
"최근 핸드셰이크" 에 시간이 뜨면 연결된 것이다.
로그인 시 자동 연결을 원하면 터널 편집 창의 해당 옵션을 켠다.

### 2-4. 확인 (PowerShell)

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object IPAddress -like '10.20.0.*'   # 배정 주소가 보여야 한다
Test-NetConnection 10.41.1.120 -Port 9100        # TcpTestSucceeded : True 면 OK. 로그인·주문 금지
```

### 2-5. 예전 스크립트와 겹치지 않게

`scripts/dma-tunnel.ps1`(IAP 폴백)은 로컬에 `10.41.1.120` 별칭을 붙인다. WireGuard 와 **같이 쓰면 라우팅이 충돌**한다.
WireGuard 를 쓰기 전에 잔여물이 없는지 한 번 정리한다.

```powershell
.\scripts\dma-tunnel.ps1 -Stop      # 관리자 PowerShell
```

---

## 3. 문제 해결

| 증상 | 원인 · 조치 |
|------|-------------|
| 핸드셰이크가 아예 안 뜬다 (Mac: 주소는 붙는데 `nc` 실패 / Win: 최근 핸드셰이크 없음) | ① 관리자가 내 공개키를 아직 등록하지 않음 → §4 ② 이 망이 **UDP 51820 을 막음** → §5 폴백 |
| Mac 터널 버튼이 비활성 | 선행 점검 메뉴로 어느 항목이 FAIL 인지 본다. `KB-DMA.conf` 없음 → 설치 스크립트 재실행해 두 값 입력. sudo 면제 없음 → 설치 스크립트 재실행 |
| 터널 버튼이 잠겨 있다 | KB VPN 직결이 켜져 있다. 직결을 끄고 다시 |
| 주소는 붙었는데 `9100` 만 안 된다 | VM 쪽 VPN 이 죽었을 수 있다. 관리자가 `curl -s https://dma.jx1.io/healthz` 의 `vpn` 값 확인 → README §VPN 조작 |
| Windows 에서 `10.41.1.120` 이 다른 데로 간다 | `dma-tunnel.ps1` 별칭 잔여물. `-Stop` 으로 정리 |
| 잘 되다가 끊긴다 | Mac: 메뉴에서 다시 켠다(재연결 대행 앱이 없다). Win: 앱이 스스로 재접속한다. VM 의 KB VPN 은 14일 롤링 갱신이라 관리자 쪽 이슈일 수 있다 |

---

## 4. 관리자 — 피어 등록 · 확인

radar-gw 에 IAP SSH 로 들어가서 실행한다(`roles/iap.tunnelResourceAccessor` 필요).

```bash
# 서버 공개키 (사용자에게 줄 값)
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a \
  --command='sudo wg show wg0 public-key'

# 피어 등록 — 이름은 영숫자/._- , 주소 N 은 2~254, 중복 주소·중복 키는 거부된다
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a \
  --command='sudo /usr/local/sbin/wg-peer-add <이름> <사용자 공개키> 10.20.0.<N>'

# 현재 피어와 마지막 핸드셰이크
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a \
  --command='sudo wg show wg0'
```

피어를 지울 때는 VM 의 `/etc/wireguard/peers.conf` 에서 해당 `[Peer]` 블록을 지우고
`sudo wg set wg0 peer <공개키> remove` 로 즉시 반영한다.

---

## 5. 폴백 — UDP 51820 이 막힌 망

사내 방화벽·일부 호텔/공용 Wi-Fi 는 UDP 를 막는다. 그때만 IAP 경유 스크립트를 쓴다.
gcloud 로그인(`gcloud auth login`)이 필요하고, WireGuard 터널은 **끈 상태**여야 한다.

| OS | 명령 |
|----|------|
| Mac | `bash scripts/dma-tunnel.sh --check` 로 점검 후 `bash scripts/dma-tunnel.sh` (Ctrl+C 로 종료, 잔여물은 `--stop`) |
| Windows | 관리자 PowerShell 에서 `.\scripts\dma-tunnel.ps1 -Check` 후 `.\scripts\dma-tunnel.ps1` (잔여물은 `-Stop`) |

동작 원리와 선행 점검 항목은 README §DMA 터널 → B 를 본다.
