"""A loopback-only fixture. No contact message is delivered during the mobile audit."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlsplit
import json

class LocalSite(SimpleHTTPRequestHandler):
    def do_POST(self):
        path=urlsplit(self.path).path
        if path not in ('/_test/accepted','/_test/rejected'):
            self.send_error(405)
            return
        self.rfile.read(int(self.headers.get('content-length',0)))
        accepted=path.endswith('accepted')
        content=({'ok':True} if accepted else {'errors':[{'field':'email','code':'TYPE_EMAIL'}]})
        body=json.dumps(content).encode('utf-8')
        self.send_response(200 if accepted else 422)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        self.wfile.write(body)

ThreadingHTTPServer(('127.0.0.1',8941),LocalSite).serve_forever()
