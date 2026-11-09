/**
 * 이 기기 푸시 키 · 기기명 (Phase 40 · D-12 · D-13 · D-15).
 *
 * - **기기 키:** 앱 WebView 의 localStorage 에 둔 소문자 UUID 하나 — server `/api/push-devices/:deviceKey` 와 DB
 *   `dma_push_devices.device_key` CHECK(소문자 UUID)가 같은 꼴을 요구한다. 토큰이 바뀌어도(앱 재설치 전까지) 같은 행을 가리킨다.
 * - **접근 실패:** localStorage 가 막혀도 `getOrCreatePushDeviceKey` 는 값을 돌려준다(저장만 실패) — 같은 탭 안에서는 같은 값을
 *   쓰도록 메모리에 둔다. 저장 실패 기기는 다음 실행에서 새 키가 되고, 남은 옛 행은 토큰 인계 규칙(같은 토큰 → 옛 행 교체)이 지운다.
 * - **기기명:** 사용자가 목록에서 기기를 알아보게 UA 에서 모델 · OS 버전만 뽑는다(80자 — DB CHECK).
 */

export const PUSH_DEVICE_KEY_STORAGE = "gh-radar:push-device-key";

const DEVICE_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** localStorage 저장이 실패한 탭의 키 — 같은 탭 안에서 두 번 불러도 같은 값. */
let memoryKey: string | null = null;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

/** 저장된 이 기기 키 — 없음 · 형식 위반 · 접근 실패면 null(같은 탭에서 저장 실패로 만든 키가 있으면 그 값). */
export function readPushDeviceKey(): string | null {
  try {
    const v = storage()?.getItem(PUSH_DEVICE_KEY_STORAGE) ?? null;
    if (v && DEVICE_KEY_RE.test(v)) return v;
  } catch {
    /* 접근 실패 → 아래 */
  }
  return memoryKey;
}

function newUuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID().toLowerCase();
  // randomUUID 는 보안 출처 전용 — 그 밖에서는 getRandomValues 로 v4 를 만든다.
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** 이 기기 키 — 없으면 만들어 저장한다(저장 실패여도 값은 돌려준다). */
export function getOrCreatePushDeviceKey(): string {
  const existing = readPushDeviceKey();
  if (existing) return existing;
  const key = newUuid();
  try {
    const s = storage();
    if (!s) throw new Error("no_storage");
    s.setItem(PUSH_DEVICE_KEY_STORAGE, key);
  } catch {
    // 저장 실패 — 메모리 키로 이 탭을 이어 간다(저장이 되는 탭에서는 메모리 키가 저장값을 가리지 않게 여기서만 둔다).
    memoryKey = key;
  }
  return key;
}

/**
 * 이 기기 키 버리기(리뷰 WR-07) — 로그아웃 정리(DELETE)가 실패하면 서버에 남은 앞 사용자 행이 이 키를 가리킨다.
 * 키를 버려 다음 사용자가 같은 키로 이어 쓰지 않게 하고, 다음 로그인의 정리(handover)가 같은 토큰의 옛 행을 지우게 한다.
 */
export function discardPushDeviceKey(): void {
  memoryKey = null;
  try {
    storage()?.removeItem(PUSH_DEVICE_KEY_STORAGE);
  } catch {
    /* 접근 실패 — 저장된 키가 없던 탭이다 */
  }
}

/* ── 로그인 뒤 이 폰 정리(handover · 리뷰 WR-07) 표시 ────────────────────────────── */

/** 로그아웃 정리가 실패했다 — 다음 로그인 때 정리를 꼭 돈다. 값 "1". */
export const PUSH_HANDOVER_PENDING_STORAGE = "gh-radar:push-handover-pending";
/** 이 폰에서 정리를 마친 마지막 사용자 id — 다른 사용자가 로그인하면 정리를 돈다. */
export const PUSH_HANDOVER_USER_STORAGE = "gh-radar:push-handover-user";

function readItem(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** 로그아웃 정리 실패 표시 — 다음 로그인의 정리를 강제한다. */
export function markPushHandoverPending(): void {
  try {
    storage()?.setItem(PUSH_HANDOVER_PENDING_STORAGE, "1");
  } catch {
    /* 저장 실패 — 다른 사용자가 로그인하면 사용자 id 비교로 정리는 그래도 돈다 */
  }
}

/** 이 사용자로 정리가 필요한가 — 실패 표시가 있거나 정리를 마친 사용자가 아니면 참. */
export function pushHandoverNeeded(userId: string): boolean {
  return readItem(PUSH_HANDOVER_PENDING_STORAGE) !== null || readItem(PUSH_HANDOVER_USER_STORAGE) !== userId;
}

/** 정리 성공 기록 — 실패 표시를 지우고 이 사용자를 마친 사용자로 남긴다. */
export function recordPushHandover(userId: string): void {
  try {
    const s = storage();
    s?.removeItem(PUSH_HANDOVER_PENDING_STORAGE);
    s?.setItem(PUSH_HANDOVER_USER_STORAGE, userId);
  } catch {
    /* 저장 실패 — 다음 실행에서 한 번 더 정리할 뿐이다(멱등) */
  }
}

const UNKNOWN_DEVICE = "알 수 없는 기기";
const LABEL_MAX = 80;

/**
 * UA → 기기명. Android 「<모델> · Android <버전>」(WebView 의 ` Build/…` 꼬리는 뗀다) · iPhone/iPad 「iPhone · iOS 18.1」
 * (`_` → `.`) · 그 밖 「알 수 없는 기기」. 80자에서 자른다.
 */
export function pushDeviceLabel(ua: string): string {
  const android = /Android (\d+(?:\.\d+)*)(?:;\s*([^;)]+))?/.exec(ua);
  if (android) {
    const version = android[1];
    const model = (android[2] ?? "").replace(/\s+Build\/.*$/, "").trim();
    const label = model && model !== "wv" ? `${model} · Android ${version}` : `Android ${version}`;
    return label.slice(0, LABEL_MAX);
  }
  const apple = /\b(iPhone|iPad)\b.*?\bOS (\d+(?:_\d+)*)/.exec(ua);
  if (apple) {
    return `${apple[1]} · iOS ${apple[2]!.replace(/_/g, ".")}`.slice(0, LABEL_MAX);
  }
  return UNKNOWN_DEVICE;
}
