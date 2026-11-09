# Summarise p2b-search.mjs output files: python3 tools/ag2/p2b-sum.py /tmp/opencode/s-norm.json ...
import json, sys
for f in sys.argv[1:]:
    t = open(f).read()
    try:
        d = json.loads(t[t.index('{'):t.rindex('\n}') + 2])
    except Exception as e:
        print(f, 'PARSE', e, t[-300:]); continue
    print(f, 'lazy', d['lazy'])
    for k, v in d['terms'].items():
        w = v.get('where') or {}; e = v.get('early')
        print(' ', k, '|', v['list'][:3], '| pick', v.get('pick'), '| anim', e and (e.get('anim'), e.get('cssDur')),
              '|', w.get('page'), w.get('row'), w.get('ctl'), w.get('text'), w.get('rect'), 'inView', w.get('inView'), 'onTop', w.get('onTop'))
