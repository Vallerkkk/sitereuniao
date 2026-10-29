"""Executa o site com o servidor de produção Waitress (Windows, Linux e macOS)."""
import os

from waitress import serve

from app import LIVEKIT_URL, app

if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    print(f"Reunião (produção) em http://{host}:{port}  ·  LiveKit: {LIVEKIT_URL}")
    serve(app, host=host, port=port, threads=8)
