/**
 * Phase 29 Plan 28 — WR-02. 「진행 중 공유(주기) · 대기 꼬리(즉시)」 적재 조정기 (`TailReload`).
 *
 * 왜 필요한가: 접근 맵 · 서버 레지스트리는 60초 주기로 다시 읽고, Admin 이 역할 강등 · 허용 해제 · 서버 편집을 커밋하면
 * Express 가 그 직후 `/internal/admin/{access,registry}/reload` 로 **즉시 재적재**를 부른다. 종전에는 진행 중 적재가 있으면
 * 그 Promise 를 그대로 돌려줬는데, 그 적재가 커밋 **전에** 시작돼 옛 행을 읽고 있었다면 즉시 재적재도 옛 값으로 끝나고
 * 강등은 다음 주기까지(최대 60초) 반영되지 않는다(D-04 「즉시」 를 확률적으로 깸). 그래서 즉시 재적재는 진행 중 적재가
 * 커밋 전 값을 읽었을 수 있다고 보고 **그 뒤 한 번 더** 읽는다(꼬리). 주기 타이머는 종전처럼 진행 중 적재를 공유한다 —
 * 60초마다 RPC 가 2번이 되면 안 된다.
 *
 * 두 슬롯 규칙: 상태는 **진행**(지금 읽고 있는 적재 1개)과 **대기 꼬리**(아직 시작하지 않은 다음 적재 1개)뿐이다.
 * `now()` 는 진행이 없으면 바로 읽고, 있으면 대기 꼬리(없으면 새로 만든다)를 돌려준다. 진행이 끝나면(성공 · 실패 모두)
 * 대기 꼬리를 진행으로 올려 읽기를 시작하고 대기 슬롯을 비운다. 그래서 꼬리 시작 **전**에 겹친 `now()` 들만 같은 꼬리를
 * 공유하고, 꼬리가 이미 읽는 중에 온 `now()` 는 그 꼬리에 합류하지 않고 다음 대기 꼬리를 받는다. 경합 예: 적재 P 진행 →
 * `now()` A 가 꼬리 T1 대기 → P 끝 · T1 이 v1 을 읽기 시작 → 원천이 v2 로 커밋 → `now()` B. B 가 T1 에 합류하면 v2 를
 * 놓친다 — B 는 T1 뒤의 T2 를 받아 v2 로 풀린다. 이렇게 **커밋 뒤에 요청한 즉시 재적재는 언제나 커밋 뒤에 시작한 읽기의
 * 결과**를 받고, 동시 읽기는 1 · 대기는 최대 1 이다(동시 RPC 가 늘지 않는다).
 *
 * `shared()` 는 진행이 있으면 그 Promise(꼬리를 만들지 않는다), 없으면 바로 읽는다. `close()` 뒤에는 새 적재가 없다 —
 * 아직 시작 안 한 대기 꼬리는 시작하지 않고 진행 적재의 결과로 풀린다(매달린 Promise 금지). close 뒤 진행도 없을 때의
 * 호출은 거부된 Promise 다 — 호출자가 자기 closed 판정으로 먼저 막는다.
 *
 * 쓰는 곳: `AppAccess`(access/app-access.ts) · `ServerRegistry`(registry/registry.ts) · 29-33 계좌별 주문 서버 적재기.
 * 로그는 남기지 않는다(호출자 몫 — 적재 함수가 자기 실패를 기록한다).
 */

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export class TailReload<T> {
  readonly #load: () => Promise<T>;
  /** 진행 슬롯 — 지금 읽고 있는 적재. */
  #running: Promise<T> | null = null;
  /** 대기 꼬리 슬롯 — 진행이 끝나면 시작할 다음 적재 1개. */
  #tail: Deferred<T> | null = null;
  #closed = false;

  constructor(load: () => Promise<T>) {
    this.#load = load;
  }

  /** 지금 읽고 있는 적재가 있는가. */
  get inFlight(): boolean {
    return this.#running !== null;
  }

  /** 즉시 재적재 — 진행이 없으면 바로 읽고, 진행 중이면 그 뒤 대기 꼬리의 결과를 받는다. */
  now(): Promise<T> {
    if (this.#running === null) return this.#start();
    this.#tail ??= deferred<T>();
    return this.#tail.promise;
  }

  /** 주기 재적재 — 진행 중이면 그 Promise 를 공유한다(꼬리를 만들지 않는다). */
  shared(): Promise<T> {
    return this.#running ?? this.#start();
  }

  /** 새 적재 금지. 진행 중 적재는 끝까지 가고, 시작 안 한 대기 꼬리는 그 결과로 풀린다. */
  close(): void {
    this.#closed = true;
  }

  #start(): Promise<T> {
    if (this.#closed) return Promise.reject(new Error("TailReload closed — 새 적재 없음"));
    let p: Promise<T>;
    try {
      p = this.#load();
    } catch (err) {
      p = Promise.reject(err);
    }
    this.#running = p;
    // 정착 처리기를 호출자보다 먼저 건다 — 호출자가 await 에서 깨어날 때 꼬리는 이미 진행 슬롯에 있다.
    p.then(
      () => this.#settle(p),
      () => this.#settle(p),
    );
    return p;
  }

  #settle(finished: Promise<T>): void {
    this.#running = null;
    const tail = this.#tail;
    this.#tail = null;
    if (tail === null) return;
    // 종료 경로 — 대기 꼬리는 시작하지 않고 방금 끝난 적재의 결과로 푼다.
    const next = this.#closed ? finished : this.#start();
    next.then(tail.resolve, tail.reject);
  }
}
