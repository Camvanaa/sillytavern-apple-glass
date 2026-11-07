#!/usr/bin/env python3
"""Summarise tools/perf sink output: medians (min-max) per variant, n = runs."""
import json, statistics as st, sys, os
R = '/tmp/opencode/results/'

def load(n):
    p = R + n + '.jsonl'
    return [json.loads(l) for l in open(p)] if os.path.exists(p) else []

def med(v):
    v = [x for x in v if isinstance(x, (int, float))]
    return f"{st.median(v):.1f} [{min(v):.1f}-{max(v):.1f}] n={len(v)}" if v else '-'

def table(title, rows, keys):
    print('##', title)
    for var, recs in rows.items():
        print(' ', var, {k: med([r.get(k) for r in recs]) for k in keys})

def variant(r):
    return r['run'].split(':', 2)[2] if r['run'].count(':') >= 2 else r['run']

def by(recs, stage):
    out = {}
    for r in recs:
        if r['stage'] == stage:
            out.setdefault(variant(r), []).append(r['data'])
    return out

for sink in sys.argv[1:] or ['cold', 'inter', 'inter2', 'long', 'mobile', 'mobile2']:
    recs = load(sink)
    if not recs:
        continue
    print('=====', sink, len(recs))
    if sink.startswith(('cold', 'mcold')):
        d = by(recs, 'cold')
        table('boot', {k: [x['boot'] for x in v] for k, v in d.items()}, ['readyMs', 'longMs', 'recalcMs', 'layoutMs', 'scriptMs', 'taskMs', 'cls', 'layouts25', 'layoutMs25', 'recalcMs25', 'taskMs25'])
        table('open', {k: [x['open'] for x in v] for k, v in d.items()}, ['firstMs', 'recalcMs', 'layoutMs', 'scriptMs', 'taskMs', 'longMs', 'cls'])
        continue
    for stage in sorted({r['stage'] for r in recs}):
        d = by(recs, stage)
        flat = {}
        for k, v in d.items():
            items = []
            for x in v:
                if isinstance(x, list):
                    items += x
                elif isinstance(x, str):
                    print('  ERR', k, stage, x[:150])
                else:
                    items.append(x)
            flat[k] = items
        s0 = next(iter(flat.values()), [])
        if not s0:
            continue
        if stage in ('sheet', 'rail'):
            for phase in ('open', 'close'):
                table(f'{stage} {phase}', {k: [x[phase] for x in v] for k, v in flat.items()}, ['frames', 'avg', 'max', 'over50', 'layouts', 'layoutMs', 'recalcMs', 'taskMs', 'cpu'])
        elif stage == 'style':
            for sv in ['3', '4', '5', '6', '1', '2', '0']:
                table(f'style {sv}', {k: [x[sv] for x in v if sv in x] for k, v in flat.items()}, ['recalcMs', 'layoutMs', 'taskMs', 'longMs'])
        elif stage.startswith('profile'):
            for k, v in flat.items():
                print('##', stage, k)
                g = {}
                for x in v:
                    for n, ms in x['groups'].items():
                        g.setdefault(n, []).append(ms)
                print('   ', {n: round(st.median(m), 1) for n, m in sorted(g.items(), key=lambda t: -st.median(t[1]))[:9]})
                f = {}
                for x in v:
                    for n, ms in x.get('appleFns', {}).items():
                        f.setdefault(n, []).append(ms)
                print('    apple', {n: round(st.median(m), 2) for n, m in f.items()})
        else:
            keys = [k for k in ['frames', 'avg', 'p95', 'max', 'over34', 'over50', 'taskMs', 'layoutMs', 'recalcMs', 'scriptMs', 'firstMs', 'longMs'] if k in s0[0]]
            table(stage, flat, keys)
            cpu = {k: [x['cpu'].get('total') for x in v if isinstance(x.get('cpu'), dict)] for k, v in flat.items()}
            if any(cpu.values()):
                print('  cpuTotal', {k: med(v) for k, v in cpu.items()})
