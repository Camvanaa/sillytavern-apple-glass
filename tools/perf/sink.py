#!/usr/bin/env python3
"""POST sink for perf runs: POST /<name> appends the body as one line to results/<name>.jsonl"""
import http.server, os, re, sys
ROOT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/opencode/results'
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        name = re.sub(r'[^A-Za-z0-9_.-]', '_', self.path.strip('/')) or 'out'
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        with open(os.path.join(ROOT, name + '.jsonl'), 'ab') as f:
            f.write(body.replace(b'\n', b' ') + b'\n')
        self.send_response(204); self.end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', 8798), H).serve_forever()
