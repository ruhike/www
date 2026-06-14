#!/usr/bin/env python3
"""开发服务器，带 no-cache 头防止模块缓存"""
import http.server
import os

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # JS 模块和 JSON 数据不缓存
        path = self.path
        if path.endswith('.js') or path.endswith('.json') or path == '/':
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        super().end_headers()

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = http.server.HTTPServer(('0.0.0.0', 8000), NoCacheHandler)
    print('Server running at http://localhost:8000/ (no-cache mode)')
    server.serve_forever()