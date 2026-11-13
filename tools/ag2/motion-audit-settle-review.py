"""Offline review only. Never launches a browser or edits original evidence."""
from pathlib import Path
import collections
import hashlib
import json
import math
import re

ROOT = Path('/opt/server-agent/workspace/st-testdata/redesign/motion-audit/runtime')
rows = []
inputs = {}

def load(p):
    raw = p.read_bytes()
    inputs[str(p)] = hashlib.sha256(raw).hexdigest()
    return json.loads(raw)

def signature(f):
    return {k: f[k] for k in ['els', 'body', 'page', 'level'] if k in f}

def running(f):
    finite, nonfinite_unknown = [], []
    for a in f.get('animations', []):
        if a.get('state') != 'running':
            continue
        iterations = a.get('timing', {}).get('iterations')
        numeric = isinstance(iterations, (int, float)) and not isinstance(iterations, bool)
        target = finite if numeric and math.isfinite(iterations) else nonfinite_unknown
        target.append(a)
    return {
        'finiteCount': len(finite),
        'finiteByName': dict(collections.Counter(str(a.get('name')) for a in finite)),
        'nonfiniteOrUnknownCount': len(nonfinite_unknown),
        'nonfiniteOrUnknownByName': dict(collections.Counter(str(a.get('name')) for a in nonfinite_unknown)),
        'faSpinNullIterationsCount': sum(a.get('name') == 'fa-spin' and a.get('timing', {}).get('iterations') is None for a in nonfinite_unknown),
    }

for p in sorted(ROOT.glob('*/result.json')):
    if not re.fullmatch(r'(desktop|phone)-(normal|os|st)(-(extra|repro|visual))?', p.parent.name):
        continue
    result = load(p)
    for step in result['steps']:
        trace_path = p.parent / (step['name'] + '.trace.json')
        if not trace_path.exists():
            continue
        trace = load(trace_path)
        frames = trace['frames']
        final = trace['final']
        t0 = frames[0]['t']
        end_elapsed = final['t'] - t0
        tail = frames[-4:]
        rows.append({
            'run': result['id'], 'sequence': step['name'], 'trace': str(trace_path),
            'originalCheck': step.get('check'), 'originalError': step.get('error'),
            'elapsedFinalMs': end_elapsed,
            'elapsedLastRafMs': frames[-1]['t'] - t0,
            'capCandidate': end_elapsed >= 4500,
            'settleReason': 'not-recorded-cannot-reconstruct',
            'tailFourSignatureEqual': len(tail) == 4 and all(signature(f) == signature(tail[-1]) for f in tail),
            'finalSignatureEqualsLastRaf': signature(final) == signature(frames[-1]),
            'tailRunning': [{'t': f['t'], 'elapsedMs': f['t'] - t0, **running(f)} for f in tail],
            'finalRunning': running(final),
            'rawLastFourFrames': tail, 'rawFinal': final,
        })

def brief(r):
    return {k: v for k, v in r.items() if k not in ['rawLastFourFrames', 'rawFinal']}

caps = [r for r in rows if r['capCandidate']]
b1 = [r for r in rows if r['sequence'] in ['nested-first-real-escape', 'layer-escape-native']]
b2 = [r for r in rows if r['sequence'].startswith('queue-')]
out = {
    'method': {
        'offlineOnly': True,
        'scope': '17 final audit runs; excludes attempts and parent artifacts',
        'predicate': 'frames>=5; elapsed>4500 returns true unconditionally BEFORE stability test; otherwise elapsed>350, last-four {els,body,page,level} equal and no running animation whose live iterations != Infinity',
        'capCandidateRule': 'rawFinal.t - frames[0].t >=4500ms (conservative flag, not proof of actual exit branch)',
        'whyNotExact': 'No wait predicate pass timestamp/branch, action-end timestamp or last poll snapshot was recorded. Snapshot serialization and post-wait evaluate can cross the threshold. Initial screenshot/action duration are inside elapsed.',
        'finiteClassification': 'Only numeric finite iterations count as finite. JSON null iterations can encode Infinity: retain as nonfinite-or-unknown, never coerce to zero. fa-spin null iterations is counted separately and NOT finite.',
        'snapshotCaveat': 'Tail/final computed-style and animation reads are non-atomic; snapshot equality does not certify future stability or queue completion.',
        'steadySuffix': 'Historical filename only: post-wait screenshot, not proof of convergence; screenshots are later than rawFinal.',
    },
    'summary': {
        'reviewedSequences': len(rows), 'capCandidates': len(caps),
        'capCandidatesWithFiniteRunningAtFinal': sum(r['finalRunning']['finiteCount'] > 0 for r in caps),
        'capCandidatesWithUnequalTailFour': sum(not r['tailFourSignatureEqual'] for r in caps),
        'allSequencesWithFiniteRunningAtFinal': sum(r['finalRunning']['finiteCount'] > 0 for r in rows),
        'allSequencesWithUnequalTailFour': sum(not r['tailFourSignatureEqual'] for r in rows),
    },
    'capCandidates': [brief(r) for r in caps],
    'B1': [brief(r) for r in b1], 'B2': [brief(r) for r in b2],
    'sequences': rows,
    'originalEvidenceSha256': inputs,
    'originalEvidenceUnchangedAfterReview': all(hashlib.sha256(Path(p).read_bytes()).hexdigest() == digest for p, digest in inputs.items()),
}
(ROOT / 'settle-review.json').write_text(json.dumps(out, ensure_ascii=False, indent=2))
print(json.dumps(out['summary'], indent=2))
for r in caps:
    print('CAP?', r['run'], r['sequence'], round(r['elapsedFinalMs'], 2), 'tail=', r['tailFourSignatureEqual'], 'last=', r['tailRunning'][-1]['finiteCount'], 'final=', r['finalRunning']['finiteCount'], r['finalRunning']['finiteByName'])
for title, group in [('B1', b1), ('B2', b2)]:
    for r in group:
        print(title, r['run'], r['sequence'], round(r['elapsedFinalMs'], 2), 'cap=', r['capCandidate'], 'tail=', r['tailFourSignatureEqual'], 'finalRun=', r['finalRunning']['finiteCount'], 'check=', r['originalCheck'])
