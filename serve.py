#!/usr/bin/env python3
import argparse
import os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


def main() -> None:
    parser = argparse.ArgumentParser(description='Serve the Fogs Gear project over HTTP so mobile browsers can load ES modules.')
    parser.add_argument('--host', default='0.0.0.0', help='Host address to bind (default: 0.0.0.0)')
    parser.add_argument('--port', type=int, default=8000, help='Port to bind (default: 8000)')
    parser.add_argument('--directory', default='.', help='Directory to serve (default: current directory)')
    args = parser.parse_args()

    os.chdir(args.directory)
    server = ThreadingHTTPServer((args.host, args.port), SimpleHTTPRequestHandler)
    print(f'Serving {os.getcwd()} at http://{args.host}:{args.port}/')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopping server...')
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
