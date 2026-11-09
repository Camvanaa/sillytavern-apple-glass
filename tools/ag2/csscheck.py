#!/usr/bin/env python3
"""tools/ag2/csscheck.py — every selector in apple-glass-2.css must start with `html body.ag2`;
braces balanced. Usage: python3 tools/ag2/csscheck.py [file]"""
import re, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'apple-glass-2.css'
s = open(p).read()
body = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
def top_split(sel):
    out, depth, cur = [], 0, ''
    for ch in sel:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == ',' and depth == 0:
            out.append(cur); cur = ''
        else:
            cur += ch
    out.append(cur)
    return [x.strip() for x in out if x.strip()]
bad = []
for m in re.finditer(r'([^{};]+)\{', body):
    sel = m.group(1).strip()
    if sel.startswith('@') or sel in ('from', 'to') or re.match(r'^[\d.%,\s]+$', sel):
        continue
    for part in top_split(sel):
        if not (part.startswith('html body.ag2') or part.startswith('html:has(> body.ag2')):
            bad.append(part[:100])
print('braces', body.count('{'), body.count('}'), 'bad selectors', len(bad))
for b in bad[:20]:
    print('  ', b)
sys.exit(1 if bad or body.count('{') != body.count('}') else 0)
