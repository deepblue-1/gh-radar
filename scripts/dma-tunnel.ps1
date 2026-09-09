#Requires -Version 5.1
<#
  dma-tunnel.ps1 (Windows)

  개발기에서 KB DMA 게이트웨이(10.41.1.120:9100)에 **주소 그대로** 붙기 위한 터널.

  경로: 로컬 주소 별칭 10.41.1.120 → ssh -L → IAP → radar-gw → tun0 → 게이트웨이

    왜 127.0.0.1 이 아니라 별칭인가 — 소비자(gh-trade WinForms `settings.ini` 의
    [DMA] Host=10.41.1.120)의 설정을 하나도 바꾸지 않기 위해서다. 목적지 주소를 보존하면
    "터널을 켰다/껐다" 만으로 KB VPN 직결과 동치가 된다.

    왜 gcloud compute ssh 를 쓰지 않는가 — Windows 의 `gcloud compute ssh` 는 PuTTY(plink)
    에 의존하고, batch 모드 host-key 프롬프트에서 스크립트가 멈출 수 있다. 그래서 2단으로 간다:
    ① `gcloud compute start-iap-tunnel` (순수 파이썬 — OS 차이 없음) 로 로컬 포트 ↔ VM 22 을 잇고
    ② 그 포트에 Windows 내장 OpenSSH `ssh.exe` 로 붙어 포워딩을 건다.
    macOS 판(scripts/dma-tunnel.sh)은 1단으로 충분해 형태가 다르다. 계약(종료 코드·상태
    파일·선행 점검 항목)은 양쪽이 동일하다.

  ⚠️ 이 터널 너머는 **실계좌가 걸린 실 게이트웨이**다 (infra/relay/README.md §실서버 라이브 상태).
     이 스크립트는 **TCP 도달성 확인까지만** 한다 — 로그인·주문 프레임을 절대 보내지 않는다 (D-27).

  사용법 (관리자 PowerShell):
    .\scripts\dma-tunnel.ps1              # 터널 개설 후 Ctrl+C 까지 유지
    .\scripts\dma-tunnel.ps1 -Check       # 아무것도 바꾸지 않고 선행 점검만
    .\scripts\dma-tunnel.ps1 -Stop        # 이전 실행이 남긴 별칭·프로세스 정리
    .\scripts\dma-tunnel.ps1 -Verbose     # 하위 프로세스 로그를 콘솔로

  종료 코드: 0 성공 / 1 인자 오류 / 2 선행 점검 실패 / 3 로컬 KB VPN 충돌 /
             4 별칭 추가 실패 / 5 재연결 상한 도달
#>

[CmdletBinding()]
param(
  [switch]$Check,
  [switch]$Stop
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Continue'

# ───────────────────────────────────────────────────────────────
# 상수 (macOS 판과 동일한 계약)
# ───────────────────────────────────────────────────────────────

$VmName       = 'radar-gw'
$GwAddr       = '10.41.1.120'
$GwPort       = 9100
$ForwardSpec  = '10.41.1.120:9100:10.41.1.120:9100'
$SshTarget    = 'alex@127.0.0.1'
$HealthUrl    = 'https://dma.jx1.io/healthz'
$MaxReconnect = 5
$GcloudCommon = @('--zone=asia-northeast3-a', '--project=gh-radar')

$StateFile    = Join-Path $env:TEMP 'gh-radar-dma-tunnel.state'
$LogFile      = Join-Path $env:TEMP 'gh-radar-dma-tunnel.log'
$ErrLogFile   = Join-Path $env:TEMP 'gh-radar-dma-tunnel.err.log'
# ssh 와 IAP 터널은 각자 다른 파일에 쓴다 — 같은 파일을 두 프로세스가 동시에 잡으면
# Start-Process 의 리다이렉트가 실패한다.
$SshLogFile   = Join-Path $env:TEMP 'gh-radar-dma-tunnel.ssh.log'
$KeyPath      = Join-Path $env:USERPROFILE '.ssh\google_compute_engine'
# IAP 로컬 포트는 실행마다 달라진다. 기본 known_hosts 를 오염시키지 않도록 전용 파일로 분리한다.
$KnownHosts   = Join-Path $env:USERPROFILE '.ssh\known_hosts_radar_gw'

$script:AliasAdded   = $false
$script:AliasIfIndex = $null
$script:SshProc      = $null
$script:IapProc      = $null
$script:Cleaned      = $false

$script:Pass   = 0
$script:Fail   = 0
$script:Failed = @()

if ($Check -and $Stop) {
  Write-Host 'usage: .\scripts\dma-tunnel.ps1 [-Check|-Stop] [-Verbose]' -ForegroundColor Red
  exit 1
}

# ───────────────────────────────────────────────────────────────
# 보고 도구
# ───────────────────────────────────────────────────────────────

function Test-Item {
  param([string]$Name, [scriptblock]$Body)
  Write-Host ("  {0} ... " -f $Name) -NoNewline
  $ok = $false
  try { $ok = [bool](& $Body) } catch { $ok = $false }
  if ($ok) {
    Write-Host 'PASS' -ForegroundColor Green
    $script:Pass++
  } else {
    Write-Host 'FAIL' -ForegroundColor Red
    $script:Fail++
    $script:Failed += $Name
  }
  return $ok
}

function Write-Summary {
  Write-Host ''
  Write-Host '═══════════════════════════════════════'
  Write-Host ("PASS: {0}  FAIL: {1}" -f $script:Pass, $script:Fail)
  if ($script:Fail -gt 0) { Write-Host ("Failed: {0}" -f ($script:Failed -join ', ')) }
}

# ───────────────────────────────────────────────────────────────
# 선행 점검 P1~P8
# ───────────────────────────────────────────────────────────────

function Get-GcloudPath {
  $c = Get-Command gcloud -ErrorAction SilentlyContinue
  if ($null -eq $c) { return $null }
  return $c.Source
}

function Test-P1 { return ($null -ne (Get-GcloudPath)) }

function Test-P2 {
  $acct = & gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>$null
  return -not [string]::IsNullOrWhiteSpace(($acct | Out-String).Trim())
}

function Test-P3 { return ($null -ne (Get-Command ssh.exe -ErrorAction SilentlyContinue)) }

function Test-P4 {
  $status = & gcloud compute instances describe $VmName @GcloudCommon --format='value(status)' 2>$null
  return (($status | Out-String).Trim() -eq 'RUNNING')
}

# VM 쪽 VPN 이 죽어 있으면 터널을 열어도 게이트웨이에 닿지 않는다 → 경고가 아니라 실패다.
# relay 의 DMA 세션이 degraded 면 /healthz 는 503 과 함께 본문을 돌려준다. 우리가 볼 것은
# `vpn` 한 필드뿐이라 상태 코드로 판정하지 않고 본문을 직접 읽는다.
function Test-P5 {
  try {
    $r = Invoke-WebRequest -Uri $HealthUrl -TimeoutSec 10 -UseBasicParsing
    return ($r.Content -match '"vpn"\s*:\s*true')
  } catch {
    $body = $null
    try { $body = (New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } catch { }
    if ($null -ne $body) { return ($body -match '"vpn"\s*:\s*true') }
    return $false
  }
}

# 로컬에서 10.41.1.* 를 가진 주소를 모은다.
function Get-KbLocalAddresses {
  return @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -like '10.41.1.*' })
}

# 우리 별칭의 소유권 표식: 로컬 인터페이스에 붙은 10.41.1.120 그 자체.
# 게이트웨이 **자신의** 주소가 로컬에 배정되는 경우는 우리 말고 없다 — KB VPN 은 클라이언트에
# 풀에서 다른 주소(.124/.126 등)를 준다. PrefixLength/SkipAsSource 는 표시용으로만 쓰고
# 판정에는 넣지 않는다: 표시값으로 판정하면(macOS 판에서 실제로 그랬다) 우리가 만든 별칭을
# 남의 것으로 오판해 정리에서 빠뜨린다.
function Test-OwnAlias {
  param($Addr)
  return ($Addr.IPAddress -eq $GwAddr)
}

function Get-ForeignKbAddresses {
  return @(Get-KbLocalAddresses | Where-Object { -not (Test-OwnAlias $_) })
}

function Test-P6 { return ((Get-ForeignKbAddresses).Count -eq 0) }

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $pr = New-Object Security.Principal.WindowsPrincipal($id)
  return $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-P8 { return (Test-Path $KeyPath) }

# ───────────────────────────────────────────────────────────────
# 상태 파일 · 정리
# ───────────────────────────────────────────────────────────────

function Write-State {
  $sshPid = ''
  $iapPid = ''
  if ($null -ne $script:SshProc) { $sshPid = $script:SshProc.Id }
  if ($null -ne $script:IapProc) { $iapPid = $script:IapProc.Id }
  $added = '0'
  if ($script:AliasAdded) { $added = '1' }
  $ifIdx = ''
  if ($null -ne $script:AliasIfIndex) { $ifIdx = $script:AliasIfIndex }
  @(
    "ALIAS_ADDED=$added"
    "IFACE=$ifIdx"
    "SSH_PID=$sshPid"
    "IAP_PID=$iapPid"
    "STARTED_AT=$([DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ'))"
  ) | Set-Content -Path $StateFile -Encoding ASCII
}

function Read-State {
  $map = @{}
  if (Test-Path $StateFile) {
    foreach ($line in (Get-Content $StateFile)) {
      if ($line -match '^([A-Z_]+)=(.*)$') { $map[$Matches[1]] = $Matches[2] }
    }
  }
  return $map
}

# 프로세스 트리째 죽인다. gcloud 는 .cmd → python 으로 이어지므로 부모만 죽이면 고아가 남는다.
function Stop-Tree {
  param($ProcId)
  if ([string]::IsNullOrWhiteSpace([string]$ProcId)) { return }
  & taskkill.exe /PID $ProcId /T /F 2>$null | Out-Null
}

# 상태 파일이 없어도(창을 강제 종료한 경우) 명령줄로 잔존 프로세스를 찾는다.
function Stop-Orphans {
  $procs = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $null -ne $_.CommandLine -and (
      $_.CommandLine -like "*$ForwardSpec*" -or
      ($_.CommandLine -like '*start-iap-tunnel*' -and $_.CommandLine -like "*$VmName*")
    ) -and $_.ProcessId -ne $PID
  })
  foreach ($p in $procs) { Stop-Tree $p.ProcessId }
  return $procs.Count
}

function Remove-Alias {
  param($IfIndex)
  try {
    if ($null -ne $IfIndex -and -not [string]::IsNullOrWhiteSpace([string]$IfIndex)) {
      Remove-NetIPAddress -IPAddress $GwAddr -InterfaceIndex $IfIndex -Confirm:$false -ErrorAction Stop
    } else {
      Remove-NetIPAddress -IPAddress $GwAddr -Confirm:$false -ErrorAction Stop
    }
    return $true
  } catch { return $false }
}

function Invoke-Cleanup {
  if ($script:Cleaned) { return }
  $script:Cleaned = $true
  Write-Host ''
  Write-Host '정리 중...'
  if ($null -ne $script:SshProc) { Stop-Tree $script:SshProc.Id }
  if ($null -ne $script:IapProc) { Stop-Tree $script:IapProc.Id }
  Stop-Orphans | Out-Null
  if ($script:AliasAdded) {
    if (Remove-Alias $script:AliasIfIndex) { Write-Host "  주소 별칭 $GwAddr 제거" }
  }
  Remove-Item $StateFile -ErrorAction SilentlyContinue
  Write-Host '  완료'
}

# 콘솔 창을 강제로 닫으면 finally 가 못 돌 수 있다. 그때의 복구 경로는 -Stop 이다.
Register-EngineEvent PowerShell.Exiting -Action { Invoke-Cleanup } | Out-Null

# ───────────────────────────────────────────────────────────────
# -Stop
# ───────────────────────────────────────────────────────────────

function Invoke-Stop {
  $found = $false
  $state = Read-State
  if ($state.ContainsKey('SSH_PID')) { Stop-Tree $state['SSH_PID']; $found = $true }
  if ($state.ContainsKey('IAP_PID')) { Stop-Tree $state['IAP_PID']; $found = $true }
  if ((Stop-Orphans) -gt 0) { $found = $true }

  # 상태 파일이 없어도 소유권 표식이 맞으면 우리 잔여물이다.
  foreach ($a in (Get-KbLocalAddresses)) {
    if (Test-OwnAlias $a) {
      if (Remove-Alias $a.InterfaceIndex) { Write-Host "주소 별칭 $GwAddr 제거" }
      $found = $true
    }
  }
  Remove-Item $StateFile -ErrorAction SilentlyContinue
  if ($found) { Write-Host '정리 완료' } else { Write-Host '정리할 잔여물 없음' }
  exit 0
}

# ───────────────────────────────────────────────────────────────
# 별칭 · 터널
# ───────────────────────────────────────────────────────────────

# -SkipAsSource 는 필수다. 이 주소가 나가는 트래픽의 출발지로 선택되면
# (10.41.1.120 은 어디서도 우리에게 돌아오지 않으므로) 로컬 통신이 깨진다.
function Add-Alias {
  foreach ($a in (Get-KbLocalAddresses)) {
    if (Test-OwnAlias $a) {
      # 이전 실행의 잔여물이다. 우리가 만든 것과 구조적으로 구별되지 않으므로 정리 대상으로 이어받는다.
      $script:AliasAdded   = $true
      $script:AliasIfIndex = $a.InterfaceIndex
      Write-Host "주소 별칭 $GwAddr 이미 존재 (이전 실행 잔여물로 간주 — 종료 시 함께 정리)"
      return $true
    }
  }

  # ① 루프백 의사 인터페이스 우선 — 실제 네트워크에 영향이 없다.
  $candidates = @()
  $lo = @(Get-NetAdapter -IncludeHidden -ErrorAction SilentlyContinue |
          Where-Object { $_.InterfaceDescription -like '*Loopback*' })
  foreach ($n in $lo) { $candidates += $n.ifIndex }

  # ② 폴백 — 기본 경로를 가진 활성 어댑터 중 메트릭이 가장 낮은 것.
  $routes = @(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
              Sort-Object RouteMetric)
  foreach ($r in $routes) { $candidates += $r.InterfaceIndex }

  foreach ($idx in $candidates) {
    try {
      New-NetIPAddress -InterfaceIndex $idx -IPAddress $GwAddr -PrefixLength 32 `
        -SkipAsSource $true -ErrorAction Stop | Out-Null
      $script:AliasAdded   = $true
      $script:AliasIfIndex = $idx
      Write-Host "주소 별칭 $GwAddr/32 추가 (InterfaceIndex=$idx, SkipAsSource)"
      return $true
    } catch {
      Write-Verbose ("InterfaceIndex {0} 실패: {1}" -f $idx, $_.Exception.Message)
    }
  }
  Write-Host 'ERROR: 주소 별칭을 추가하지 못했습니다 (관리자 권한으로 실행했는지 확인하세요).' -ForegroundColor Red
  return $false
}

function Get-FreePort {
  for ($p = 12222; $p -lt 12300; $p++) {
    $listener = $null
    try {
      $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $p)
      $listener.Start()
      $listener.Stop()
      return $p
    } catch {
      if ($null -ne $listener) { try { $listener.Stop() } catch { } }
    }
  }
  return 0
}

function Test-PortOpen {
  param([string]$TargetAddr, [int]$TargetPort, [int]$TimeoutMs = 3000)
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect($TargetAddr, $TargetPort, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne($TimeoutMs)) { return $false }
    $client.EndConnect($iar)
    return $true
  } catch {
    return $false
  } finally {
    # TCP connect 후 즉시 close. 프레임을 보내지 않는다 (D-27).
    $client.Close()
  }
}

# gcloud 는 .cmd 라 CreateProcess 로 직접 못 띄운다 → cmd.exe /c 로 감싼다.
function Start-IapTunnel {
  param([int]$LocalPort)
  $gcloud = Get-GcloudPath
  $line = '"{0}" compute start-iap-tunnel {1} 22 --local-host-port=127.0.0.1:{2} {3}' -f `
          $gcloud, $VmName, $LocalPort, ($GcloudCommon -join ' ')
  return Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $line) `
    -NoNewWindow -PassThru -RedirectStandardOutput $LogFile -RedirectStandardError $ErrLogFile
}

function Start-SshForward {
  param([int]$LocalPort)
  $sshArgs = @(
    '-N', '-L', $ForwardSpec,
    '-p', "$LocalPort",
    '-i', "`"$KeyPath`"",
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', "UserKnownHostsFile=`"$KnownHosts`"",
    $SshTarget
  )
  if ($VerbosePreference -eq 'Continue') {
    return Start-Process -FilePath 'ssh.exe' -ArgumentList $sshArgs -NoNewWindow -PassThru
  }
  return Start-Process -FilePath 'ssh.exe' -ArgumentList $sshArgs -NoNewWindow -PassThru `
    -RedirectStandardError $SshLogFile
}

# ───────────────────────────────────────────────────────────────
# main
# ───────────────────────────────────────────────────────────────

if ($Stop) { Invoke-Stop }

Write-Host '═══════════════════════════════════════════════════════════'
Write-Host " DMA 터널 (Windows) — ${GwAddr}:${GwPort} ← radar-gw(IAP) ← 이 기기"
Write-Host '═══════════════════════════════════════════════════════════'
Write-Host ' ⚠️  이 터널 너머는 실계좌가 걸린 실 게이트웨이다.' -ForegroundColor Yellow
Write-Host '     이 스크립트는 TCP 도달성 확인까지만 한다 — 로그인·주문은 하지 않는다.' -ForegroundColor Yellow
Write-Host ''

# --check 는 아무것도 바꾸지 않는다: 별칭도 만들지 않고 프로세스도 띄우지 않는다.
# 그래서 첫 실패에서 멈추지 않고 전 항목을 평가한다 (P6 이 먼저 걸리면 나머지를 못 보므로).
$rc = 0
Write-Host '선행 점검'
if (-not (Test-Item 'P1 gcloud 존재'        { Test-P1 })) { $rc = 2; if (-not $Check) { Write-Summary; exit $rc } }
if (-not (Test-Item 'P2 활성 인증 계정'      { Test-P2 })) { $rc = 2; if (-not $Check) { Write-Summary; exit $rc } }
if (-not (Test-Item 'P3 ssh 클라이언트'      { Test-P3 })) {
  Write-Host '     ↳ 설정 > 앱 > 선택적 기능 > OpenSSH 클라이언트 를 설치하세요.' -ForegroundColor Yellow
  $rc = 2; if (-not $Check) { Write-Summary; exit $rc }
}
if (-not (Test-Item 'P4 VM RUNNING'          { Test-P4 })) { $rc = 2; if (-not $Check) { Write-Summary; exit $rc } }
if (-not (Test-Item 'P5 VM 쪽 VPN 활성'      { Test-P5 })) { $rc = 2; if (-not $Check) { Write-Summary; exit $rc } }
if (-not (Test-Item 'P6 로컬 KB VPN 충돌 없음' { Test-P6 })) {
  Write-Host ''
  Write-Host '  ↳ 이미 KB VPN 으로 직결돼 있어 터널이 불필요하고 라우팅이 겹칩니다.' -ForegroundColor Yellow
  foreach ($a in (Get-ForeignKbAddresses)) {
    Write-Host ("     관측: {0} {1}" -f $a.InterfaceAlias, $a.IPAddress)
  }
  Write-Host '     VPN 을 내리고 다시 실행하세요.' -ForegroundColor Yellow
  Write-Host ''
  $rc = 3; if (-not $Check) { Write-Summary; exit 3 }
}
if (-not (Test-Item 'P7 관리자 권한'         { Test-Admin })) { $rc = 2; if (-not $Check) { Write-Summary; exit $rc } }
if (-not (Test-Item 'P8 SSH 개인키 존재'     { Test-P8 })) {
  Write-Host ''
  Write-Host "  ↳ $KeyPath 이 없습니다. 아래를 한 번 실행하면 gcloud 가 키를 만들고" -ForegroundColor Yellow
  Write-Host '     프로젝트 메타데이터에 등록합니다 (이 스크립트는 GCP 설정을 직접 고치지 않습니다):' -ForegroundColor Yellow
  Write-Host "     gcloud compute ssh $VmName --tunnel-through-iap $($GcloudCommon -join ' ') --command=`"echo ok`""
  Write-Host ''
  $rc = 2; if (-not $Check) { Write-Summary; exit $rc }
}

Write-Summary

if ($Check) {
  if ($rc -eq 0) { Write-Host "선행 점검 통과 — '.\scripts\dma-tunnel.ps1' 로 터널을 열 수 있습니다." }
  exit $rc
}
if ($rc -ne 0) { exit $rc }

Write-Host ''

try {
  if (-not (Add-Alias)) { exit 4 }
  Write-State

  $attempt = 0
  while ($true) {
    $port = Get-FreePort
    if ($port -eq 0) { Write-Host 'ERROR: 사용 가능한 로컬 포트를 찾지 못했습니다.' -ForegroundColor Red; exit 2 }

    Write-Host "IAP 터널 기동 중 (127.0.0.1:$port → ${VmName}:22)..."
    $script:IapProc = Start-IapTunnel -LocalPort $port
    Write-State

    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
      if (Test-PortOpen '127.0.0.1' $port 3000) { $ready = $true; break }
      if ($script:IapProc.HasExited) { break }
      Start-Sleep -Seconds 1
    }
    if (-not $ready) {
      Write-Host "ERROR: IAP 터널이 열리지 않았습니다. 로그: $ErrLogFile" -ForegroundColor Red
      Get-Content $ErrLogFile -Tail 20 -ErrorAction SilentlyContinue
      exit 2
    }

    Write-Host 'SSH 포워딩 기동 중...'
    $script:SshProc = Start-SshForward -LocalPort $port
    Write-State

    $reachable = $false
    for ($i = 0; $i -lt 30; $i++) {
      if (Test-PortOpen $GwAddr $GwPort 3000) { $reachable = $true; break }
      if ($script:SshProc.HasExited) { break }
      Start-Sleep -Seconds 1
    }
    if (-not $reachable) {
      Write-Host "ERROR: ${GwAddr}:${GwPort} 에 도달하지 못했습니다. 로그: $SshLogFile" -ForegroundColor Red
      Get-Content $SshLogFile -Tail 20 -ErrorAction SilentlyContinue
      exit 2
    }

    Write-Host ''
    Write-Host "✅ 터널 개설 완료 — ${GwAddr}:${GwPort} 로 직접 접속하세요 (설정 변경 불필요)." -ForegroundColor Green
    Write-Host "   로그: $SshLogFile (ssh) · $ErrLogFile (IAP)"
    Write-Host '   Ctrl+C 로 종료하면 별칭까지 정리합니다.'
    Write-Host ''

    $connectedAt = Get-Date
    while (-not $script:SshProc.HasExited -and -not $script:IapProc.HasExited) {
      Start-Sleep -Seconds 2
    }

    # 연결이 60초 이상 유지됐으면 카운터를 리셋한다 (장시간 세션에서 상한이 누적 소진되지 않게).
    if (((Get-Date) - $connectedAt).TotalSeconds -ge 60) { $attempt = 0 }
    $attempt++
    if ($attempt -gt $MaxReconnect) {
      Write-Host "ERROR: 재연결 상한(${MaxReconnect}회) 도달 — 종료합니다." -ForegroundColor Red
      exit 5
    }
    $backoff = [int][Math]::Pow(2, $attempt)
    Write-Host "⚠ 터널이 끊겼습니다. ${backoff}초 후 재연결 ($attempt/$MaxReconnect)" -ForegroundColor Yellow
    Stop-Tree $script:SshProc.Id
    Stop-Tree $script:IapProc.Id
    Start-Sleep -Seconds $backoff
  }
} finally {
  Invoke-Cleanup
}
