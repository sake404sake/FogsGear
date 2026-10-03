from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


class SvgExportHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self) -> None:
        length = int(self.headers.get('Content-Length', '0'))
        if length <= 0 or length > 2_000_000:
            self.send_error(413)
            return
        payload = self.rfile.read(length)
        destination = Path(__file__).parent / 'assets' / 'building-icons.svg'
        destination.write_bytes(payload)
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(b'OK')

    def log_message(self, format: str, *args: object) -> None:
        return


HTTPServer(('127.0.0.1', 8765), SvgExportHandler).serve_forever()