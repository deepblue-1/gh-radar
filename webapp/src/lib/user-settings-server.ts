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
 *
 * 버스트 판정 비율(84 `burstRatioPct` · quick-261102-epl)의 해석도 여기 한 곳이다 — `burstRatioPctOf`(1~100 이면 그 값 · 아니면
 * 「모름」 undefined → /me 42 조립은 싣지 않는다) · `burstRatioThresholdOf`(그 값 또는 내장 70 → /me 표시 · 상따 호가 사다리 기준).
 * 위험도 기준(84 `sellRiskPct` · quick-261103-n1s)도 같은 꼴이다 — `sellRiskPctOf`(1~999 · 아니면 undefined) · `sellRiskPctOrDefaultOf`
 * (그 값 또는 80).
 */
import {
  SELL_RISK_PCT_DEFAULT,
  USER_SETTINGS_RANGES,
  type RelayAccount,
  type RelayUserSettingsMsg,
} from "@gh-radar/shared";

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

/**
 * 버스트 판정 비율의 **내장 기본값** % — 84 `burstRatioPct` 가 0(구 서버 · 슬롯 부재) · 범위 밖 · 미수신일 때 쓴다
 * (gh-trade protocol 84 「부재 = 0 → 클라 내장 70」 · WinForms 동형 · quick-261101-t7c).
 *
 * /me 표시와 상따 호가 사다리 기준이 이 상수 하나를 읽는다 — 다른 파일에 70 을 다시 적지 않는다.
 */
export const BURST_RATIO_DEFAULT_PCT = 70;

/**
 * 84 의 버스트 판정 비율 — 정수이고 `USER_SETTINGS_RANGES.burstRatioPct`(1~100) 안이면 그 값, 아니면 undefined(「모름」).
 * 0(구 서버 · 슬롯 부재) · 키 부재(옛 relay) · 범위 밖 · 84 미수신이 모두 undefined 다 — 42 에는 싣지 않는다(부재 = 서버 저장값
 * 유지 · 0 은 서버가 범위 밖으로 42 전체를 거부한다 · gh-trade quick-261101-t7c).
 */
export function burstRatioPctOf(us: Pick<RelayUserSettingsMsg, "burstRatioPct"> | undefined): number | undefined {
  const v = us?.burstRatioPct;
  const r = USER_SETTINGS_RANGES.burstRatioPct;
  return typeof v === "number" && Number.isInteger(v) && v >= r.min && v <= r.max ? v : undefined;
}

/** 버스트 판정 기준 — `burstRatioPctOf` 값, 「모름」 이면 `BURST_RATIO_DEFAULT_PCT`(70). /me 표시와 호가 사다리 기준이 읽는다. */
export function burstRatioThresholdOf(us: Pick<RelayUserSettingsMsg, "burstRatioPct"> | undefined): number {
  return burstRatioPctOf(us) ?? BURST_RATIO_DEFAULT_PCT;
}

/**
 * 84 의 ☐위험도 기준 % — 정수이고 `USER_SETTINGS_RANGES.sellRiskPct`(1~999) 안이면 그 값, 아니면 undefined(「모름」 ·
 * quick-261103-n1s). 0(구 서버 · 슬롯 부재) · 키 부재 · 범위 밖 · 84 미수신이 모두 undefined 다 — 42 에는 싣지 않는다
 * (`burstRatioPctOf` 와 같은 규칙 · 서버는 0 을 범위 밖으로 42 전체를 거부한다).
 */
export function sellRiskPctOf(us: Pick<RelayUserSettingsMsg, "sellRiskPct"> | undefined): number | undefined {
  const v = us?.sellRiskPct;
  const r = USER_SETTINGS_RANGES.sellRiskPct;
  return typeof v === "number" && Number.isInteger(v) && v >= r.min && v <= r.max ? v : undefined;
}

/** ☐위험도 기준 표시값 — `sellRiskPctOf` 값, 「모름」 이면 `SELL_RISK_PCT_DEFAULT`(80). /me 표시가 읽는다. */
export function sellRiskPctOrDefaultOf(us: Pick<RelayUserSettingsMsg, "sellRiskPct"> | undefined): number {
  return sellRiskPctOf(us) ?? SELL_RISK_PCT_DEFAULT;
}
