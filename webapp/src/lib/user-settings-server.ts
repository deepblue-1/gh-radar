/**
 * 서버별 84(`user.settings`) 조회 — Phase 32 D-14a · D-14b · D-24 · RESEARCH Pattern 5 · Pitfall 14.
 *
 * 84 는 게이트웨이 서버마다 따로다. 웹 상태 `userSettingsByServer` 는 서버키 → 마지막 84 이고, 키 `""` 칸은
 * 서버키 없는 84(구 relay)다 — 그 값은 primary 서버 것이다(구 relay 는 primary 84 하나만 내린다).
 *
 * 읽는 규칙이 두 벌이고 **일부러 다르다**:
 *  - `/me` 설정 탭(`userSettingsForServer`) — 구 relay 관용이 있다. 고른 서버가 첫 서버(= primary)면 `""` 칸을 그
 *    서버 값으로 본다. 구 relay 의 42 는 primary 로 가므로 보이는 값과 저장 대상이 일치한다.
 *  - 상따 폼 시딩(`userSettingsForAccount`) — 관용이 없다. 카드 계좌의 서버 84 가 없으면 시딩하지 않는다(빈 패치).
 *    primary 84 로 대신 채우면 교보 계좌 카드가 KB 설정으로 시딩된다(Pitfall 14).
 *
 * 둘 다 Map 을 직접 `.get` 하지 않게 하는 단일 출입구다 — 관용 규칙이 여러 곳에 흩어지면 갈린다.
 */
import type { RelayAccount, RelayUserSettingsMsg } from "@gh-radar/shared";

/** 서버키 → 마지막 84. 키 `""` = 서버키 없는 84(구 relay · primary 것). */
export type UserSettingsByServer = ReadonlyMap<string, RelayUserSettingsMsg>;

/**
 * 「첫 서버」 = `accounts[]` 에서 처음 나온 서버키 — relay 가 계좌를 결선 순으로 병합하되 primary 계좌를 먼저 둔다
 * (RESEARCH Pattern 5 · 계약 정본). 서버키를 실은 계좌가 없으면 undefined.
 */
export function firstServerKeyOf(accounts: readonly Pick<RelayAccount, "serverKey">[]): string | undefined {
  for (const a of accounts) if (a.serverKey) return a.serverKey;
  return undefined;
}

/**
 * `/me` 설정 탭이 보는 84 — 고른 계좌의 서버(D-24).
 *  - `serverKey` 가 비면(서버키 없는 계좌 · 구 relay · 목록 밖 계좌) `""` 칸 — 종전 단일 동작.
 *  - 그 서버 칸이 있으면 그 값.
 *  - 없고 그 서버가 첫 서버(primary)면 `""` 칸(구 relay 관용) · 아니면 undefined(= 「불러오는 중」 잠금 · fail-safe).
 *
 * 저장(42)은 같은 `serverKey` 로 간다 — 관용으로 보인 `""` 값도 구 relay 에서는 primary 로 저장되므로 일치한다.
 */
export function userSettingsForServer(
  map: UserSettingsByServer,
  serverKey: string | undefined,
  accounts: readonly Pick<RelayAccount, "serverKey">[],
): RelayUserSettingsMsg | undefined {
  if (!serverKey) return map.get("");
  return map.get(serverKey) ?? (serverKey === firstServerKeyOf(accounts) ? map.get("") : undefined);
}

/**
 * 상따 폼 시딩(`seedFromUserSettings` · `preBuyWatchFixedOf` · 「줄매수도 같이 켜기」)이 보는 84 — 카드 계좌의 서버(D-14b).
 *  - 그 계좌의 `serverKey` 를 모르면(목록 밖 · 구 relay) undefined — `""` 칸이 있어도 쓰지 않는다.
 *  - 있으면 그 서버 칸 · 그 칸이 아직 없으면 undefined. 다른 서버(primary) 값으로 대신 채우지 않는다(Pitfall 14).
 *
 * undefined 는 종전 「84 미수신」 과 같다 — 시딩이 빈 패치다(0 · 빈칸).
 */
export function userSettingsForAccount(
  map: UserSettingsByServer,
  accountNo: string,
  accounts: readonly Pick<RelayAccount, "accountNo" | "serverKey">[],
): RelayUserSettingsMsg | undefined {
  const serverKey = accounts.find((a) => a.accountNo === accountNo)?.serverKey;
  return serverKey ? map.get(serverKey) : undefined;
}
