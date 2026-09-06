/**
 * 게이트웨이로 가는 **회선(VPN)** 이 서 있는지 판정한다 — 패킷을 한 개도 보내지 않고.
 *
 * 왜 필요한가:
 *   `/healthz` 의 `vpn` 은 원래 "세션 Ready 여부"에서 파생된 값이었다. 그래서 접속한
 *   사용자가 **하나도 없으면 VPN 이 완전히 죽어 있어도 `ok`/`vpn:true`** 였고, uptime
 *   check 는 200 만 보므로 알림이 영원히 울리지 않았다. 2026-09-06 실장애가 그것이다
 *   (11:41 KST VPN 정지 → 사용자가 직접 발견할 때까지 아무 신호 없음).
 *
 * 왜 능동 프로브를 쓰지 않는가:
 *   게이트웨이로 주기적 TCP connect 를 날리면 아무도 안 쓰는 시간에도 KB 사내망으로
 *   트래픽이 나간다 — D-27(실서버 접속은 사용자 지시가 있을 때만)과 정면으로 어긋난다.
 *   그래서 **로컬 사실만** 본다: `os.networkInterfaces()` 는 순수 syscall 이라 네트워크로
 *   나가는 것이 없고, VPN 이 내려가면 `tun0` 과 그 주소가 사라진다.
 *
 * 판정 방식:
 *   인터페이스 이름(`tun0`)을 찾지 않는다 — 이름은 vpnc/openconnect 설정에 따라 바뀐다.
 *   대신 **게이트웨이와 같은 사내망 대역(/16)에 속한 주소를 가진 인터페이스가 있는가**를
 *   본다. openconnect 가 split-tunnel 로 밀어 주는 대역이 `10.41.0.0/16` 이고 할당 주소가
 *   `10.41.1.124`, 게이트웨이가 `10.41.1.120` 이라 이 조건이 곧 "터널이 서 있다"이다.
 *   VM 의 기본 NIC(`ens4` = 10.10.0.5)는 이 대역 밖이라 오탐이 없다(실측 2026-09-06).
 */
import os from "node:os";

import { logger } from "../logger.js";

/**
 * 사내망 판정 프리픽스 길이(bit).
 *
 * openconnect split-tunnel 의 `CISCO_SPLIT_INC 10.41.0.0/16` 과 같은 값이다. 여기를
 * 좁히면(예: /24) VPN 이 다른 서브넷을 할당했을 때 멀쩡한 터널을 죽었다고 보고한다.
 */
export const VPN_PREFIX_BITS = 16;

/** 점 4개 IPv4 를 uint32 로. 형식이 아니면 `null`. */
function toUint32(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out = (out << 8) | n;
  }
  return out >>> 0;
}

/** 같은 프리픽스에 속하는가. */
function inSamePrefix(a: number, b: number, bits: number): boolean {
  if (bits <= 0) return true;
  const mask = bits >= 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return ((a & mask) >>> 0) === ((b & mask) >>> 0);
}

/** 판정 불가 경고는 프로세스 수명당 1회만 — `/healthz` 는 1분마다 불린다. */
let warnedUnresolvable = false;

/**
 * 게이트웨이로 가는 회선이 서 있는가.
 *
 * @param dmaHost   게이트웨이 주소(`DMA_HOST`). 로컬 mock(127.x)이면 loopback 이 늘
 *                  있으므로 자연히 `true` 가 된다 — mock 배포를 degraded 로 만들지 않는다.
 * @param ifaces    테스트 주입구. 기본값은 실제 인터페이스 목록이다.
 * @returns 같은 사내망 대역의 주소를 가진 인터페이스가 있으면 true
 */
export function isGatewayLinkUp(
  dmaHost: string,
  ifaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): boolean {
  const target = toUint32(dmaHost.trim());
  if (target === null) {
    // 호스트명 기반 설정은 이 방식으로 판정할 수 없다. 여기서 false 로 떨어뜨리면
    // 멀쩡한 배포가 영구 503 이 되므로 통과시키되, 신호가 없다는 사실은 남긴다.
    if (!warnedUnresolvable) {
      warnedUnresolvable = true;
      logger.warn(
        { dmaHost },
        "[LINK] DMA_HOST 가 IPv4 가 아니라 회선 판정을 건너뛴다 — healthz 의 vpn 은 신호가 아니다",
      );
    }
    return true;
  }

  for (const list of Object.values(ifaces)) {
    for (const addr of list ?? []) {
      if (addr.family !== "IPv4") continue;
      const mine = toUint32(addr.address);
      if (mine === null) continue;
      if (inSamePrefix(mine, target, VPN_PREFIX_BITS)) return true;
    }
  }
  return false;
}
