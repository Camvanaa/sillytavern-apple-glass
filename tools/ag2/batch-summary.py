#!/usr/bin/env python3
"""Summarise batch-explore stdout JSON files without hiding individual traces."""
import glob, json, os, sys

root = sys.argv[1] if len(sys.argv) > 1 else '/tmp/opencode/ag2-batch'
rows = []
for f in sorted(glob.glob(os.path.join(root, '*.result.json'))):
    try:
        d = json.load(open(f))
    except Exception as e:
        rows.append({'file': f, 'parseError': str(e)})
        continue
    rows.append(d)

issues = []
for r in rows:
    for x in r.get('issues', []) or []:
        sig = '|'.join(x.get('failures', []) or [x.get('actionError', 'unknown')])
        issues.append({'signature': sig, 'file': r.get('path'), 'seed': r.get('seed'), 'step': x.get('step'), 'action': x.get('action')})

summary = {
    'runs': len(rows),
    'runsWithIssues': sum(bool(r.get('issueCount')) for r in rows),
    'totalIssues': len(issues),
    'issueSignatures': {},
    'newErrors': sorted({e for r in rows for e in r.get('newErrors', [])}),
    'maxLongTaskMs': max((r.get('perf', {}).get('longTaskMaxMs', 0) for r in rows), default=0),
    'totalLongTasks': sum(r.get('perf', {}).get('longTaskCount', 0) for r in rows),
    'totalLayoutShift': sum(r.get('perf', {}).get('layoutShiftTotal', 0) for r in rows),
    'issues': issues,
    'runsDetail': [{'path': r.get('path'), 'seed': r.get('seed'), 'steps': r.get('steps'), 'issueCount': r.get('issueCount'),
                    'longTaskMaxMs': r.get('perf', {}).get('longTaskMaxMs'), 'newErrors': r.get('newErrors', [])} for r in rows],
}
for i in issues:
    summary['issueSignatures'][i['signature']] = summary['issueSignatures'].get(i['signature'], 0) + 1
print(json.dumps(summary, ensure_ascii=False, indent=2))
with open(os.path.join(root, 'summary.json'), 'w') as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)
