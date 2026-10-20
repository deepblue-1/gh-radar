"""팀(A3) 주문 → 창구 귀속 가능성: 주문이 든 스윕 구간에서 그 방향 증분이 주문 수량 이상인 팀 창구가 몇 개인가."""
import sys, numpy as np, pandas as pd
sys.path.insert(0, '.')
from tickana import teamflow as tf
date = sys.argv[1]; isins = sys.argv[2:]
A0, B0 = tf.load_day_parquet('/Users/alex/ticks/teamflow/parquet', date)
for isin in isins:
    A = A0[A0['isin'] == isin]; B = B0[B0['isin'] == isin].sort_values('recv_ns').reset_index(drop=True)
    P, base, upper = tf.prepare_frame(A)
    tb = B.recv_ns.to_numpy(); nI = len(B)
    inc = {}
    for s in ('buy', 'sell'):
        for m in tf.TEAM:
            kq = np.full(nI, np.nan)
            for lv in range(1, 6):
                hit = (B[f'lv{lv}_{s}_member'] == m).to_numpy(); kq[hit] = B[f'lv{lv}_{s}_qty'].to_numpy()[hit]
            d = np.full(nI + 1, np.nan); d[1:nI] = np.diff(kq)   # NaN = 모름
            inc[(s, m)] = d
    T = P[P.team & P.bs.isin(['1', '2'])].groupby('oid').agg(t=('t', 'last'), q=('qty', 'sum'), bs=('bs', 'first'))
    T = T[P.loc[P.team].groupby('oid')['px'].max().reindex(T.index) < upper]   # 상한가 가격 제외
    k = np.searchsorted(tb, T.t.to_numpy(), side='left')
    tot = {'1': 0, 'unk': 0, 'many': 0, 'none': 0}
    for (q, bs), kk in zip(T[['q', 'bs']].itertuples(index=False), k):
        s = 'buy' if bs == '2' else 'sell'
        vals = [inc[(s, m)][kk] for m in tf.TEAM]
        fit = [v for v in vals if not np.isnan(v) and v >= q]
        unk = any(np.isnan(v) for v in vals)
        key = '1' if len(fit) == 1 and not unk else ('many' if len(fit) > 1 else ('unk' if unk else 'none'))
        tot[key] += q
    allq = sum(tot.values())
    print(isin, len(T), 'orders', {k: f'{v/allq:.0%}' for k, v in tot.items()})
