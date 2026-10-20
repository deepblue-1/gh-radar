"""연구용 — 한 종목·일의 다섯 창구 B9 증분을 등락 구간·10분 버킷에 배분하고, 팀(A3) 주문을 창구에 귀속할 수 있는지 잰다.
실행: cd gh-trade/server/tools/analysis && .venv/bin/python <this> 20261014 KR7000650002 out.json"""
import json, sys
import numpy as np, pandas as pd
sys.path.insert(0, '.')
from tickana import teamflow as tf
from tickana.packets import DAY_NS, KST_OFFSET_NS, NS_PER_SEC

date, isin, out = sys.argv[1], sys.argv[2], sys.argv[3]
A, B = tf.load_day_parquet('/Users/alex/ticks/teamflow/parquet', date)
A = A[A['isin'] == isin]; B = B[B['isin'] == isin].sort_values('recv_ns').reset_index(drop=True)
P, base, upper = tf.prepare_frame(A)
px = P.px.to_numpy(); t = P.t.to_numpy(); qty = P.qty.to_numpy()
tb = B.recv_ns.to_numpy(); nI = len(B)
gaps = np.diff(tb) / 1e9
print('sweeps', nI, 'gap median s', round(float(np.median(gaps)), 1), 'p90', round(float(np.percentile(gaps, 90)), 1))

# 체결 → 그 체결을 담는 스윕 구간 k (tb[k-1] < t <= tb[k])
iv = np.searchsorted(tb, t, side='left')
vol_iv = np.bincount(iv, weights=qty, minlength=nI + 1)

def band_label(p):
    if p >= upper: return '상한가 가격'
    r = p * 100
    for lbl, lo, hi in [('28%~상한 미만', 28, None), ('25~28%', 25, 28), ('20~25%', 20, 25), ('15~20%', 15, 20),
                        ('10~15%', 10, 15), ('5~10%', 5, 10), ('0~5%', 0, 5)]:
        if r >= base * (100 + lo): return lbl
    return '0% 미만'
blab = np.array([band_label(p) for p in px], dtype=object)
bkey = ((t + KST_OFFSET_NS) % DAY_NS) // (10 * 60 * NS_PER_SEC)

res = {'bands': {}, 'buckets': {}, 'day': {}, 'cover_bands': {}, 'cover_buckets': {}}
for m in tf.TEAM:
    name = tf.TEAM_SHORT[m]
    w = {}; okt = np.ones(len(P), dtype=bool)
    for s in ('buy', 'sell'):
        kv = np.full(nI, np.nan)
        for lv in range(1, 6):
            hit = (B[f'lv{lv}_{s}_member'] == m).to_numpy()
            kv[hit] = B[f'lv{lv}_{s}_value'].to_numpy()[hit]
        ok = np.zeros(nI + 1, dtype=bool)          # 구간 k 증분을 아는가 = 스윕 k-1 · k 둘 다 상위 5 안
        ok[1:nI] = ~np.isnan(kv[1:]) & ~np.isnan(kv[:-1])
        inc = np.zeros(nI + 1); inc[1:nI] = np.where(ok[1:nI], np.nan_to_num(np.diff(kv)), 0)
        w[s] = inc[iv] * qty / np.where(vol_iv[iv] > 0, vol_iv[iv], 1)
        okt &= ok[iv]
        res['day'].setdefault(name, {})[s] = None if np.isnan(kv[-1]) else int(kv[-1])
    net = w['buy'] - w['sell']
    kq = pd.Series(np.where(okt, qty, 0))
    for key, grp, cov in (('bands', blab, 'cover_bands'), ('buckets', bkey, 'cover_buckets')):
        sums = pd.Series(net).groupby(grp).sum().round().astype(int)
        c = kq.groupby(grp).sum() / pd.Series(qty).groupby(grp).sum()
        res[key][name] = {str(k): (int(v) if c[k] >= 0.5 else None) for k, v in sums.items()}
        res[cov][name] = {str(k): round(float(v), 2) for k, v in c.items()}

# 팀 주문 귀속 가능성: 팀 매수 주문(연속, team) 의 금액이 그 스윕 구간의 창구별 매수 증분 중 몇 창구에 들어갈 수 있나
T = P[P.team & (P.bs == '2')].groupby('oid').agg(t=('t', 'last'), q=('qty', 'sum'), v=('px', 'max'))
print('team buy orders', len(T))
json.dump(res, open(out, 'w'), ensure_ascii=False, indent=1)
print(json.dumps(res['bands'], ensure_ascii=False))
