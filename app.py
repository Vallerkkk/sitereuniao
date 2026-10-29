"""
Reunião - servidor web em Python para videochamadas com LiveKit.

Responsabilidades do backend:
  * servir a interface web (pasta ./static);
  * emitir tokens de acesso (JWT) do LiveKit para cada participante.

O tráfego de áudio, vídeo e tela passa diretamente entre o navegador e o
servidor LiveKit (self-hosted ou LiveKit Cloud); este app nunca toca na mídia.
"""
from __future__ import annotations

import os
import re
import secrets
import time
import unicodedata
import warnings
from pathlib import Path

import jwt
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

LIVEKIT_URL = os.getenv("LIVEKIT_URL", "ws://localhost:7880")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "devkey")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "secret")
TOKEN_TTL_HOURS = float(os.getenv("TOKEN_TTL_HOURS", "6"))
# Código opcional exigido para entrar em qualquer sala (deixe vazio para desativar).
ACCESS_CODE = os.getenv("ACCESS_CODE", "").strip()

ROOM_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")
NAME_MAX = 40

app = Flask(__name__, static_folder=str(BASE_DIR / "static"), static_url_path="/static")


# ---------------------------------------------------------------- utilidades
def _slug(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()


def slugify(text: str) -> str:
    """Identidade legível a partir do nome do participante."""
    return _slug(text)[:24].strip("-") or "convidado"


def normalize_room(room: str) -> str:
    """'Equipe Semanal' -> 'equipe-semanal'; texto sem letras/números vira ''."""
    return _slug(room)[:63].strip("-")


def create_token(identity: str, name: str, room: str, *, ttl_hours: float = TOKEN_TTL_HOURS) -> str:
    """Gera um token de acesso no formato exigido pelo LiveKit (JWT HS256).

    Mesmo formato produzido por livekit.api.AccessToken: o emissor é a API key,
    o subject é a identidade do participante e as permissões ficam em `video`.
    """
    now = int(time.time())
    claims = {
        "iss": LIVEKIT_API_KEY,
        "sub": identity,
        "jti": identity,
        "name": name,
        "nbf": now - 10,
        "exp": now + int(ttl_hours * 3600),
        "video": {
            "room": room,
            "roomJoin": True,
            "canPublish": True,
            "canSubscribe": True,
            "canPublishData": True,
            "canUpdateOwnMetadata": True,
        },
    }
    with warnings.catch_warnings():
        # O segredo de desenvolvimento do LiveKit ("secret") é curto; em produção use o do seu projeto.
        warnings.simplefilter("ignore")
        return jwt.encode(claims, LIVEKIT_API_SECRET, algorithm="HS256")


# ---------------------------------------------------------------- páginas
@app.get("/")
@app.get("/sala/<room>")
def index(room: str | None = None):
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/config")
def config():
    return jsonify({"livekitUrl": LIVEKIT_URL, "requiresCode": bool(ACCESS_CODE)})


@app.post("/api/token")
def token():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()[:NAME_MAX]
    room = normalize_room(str(data.get("room", "")))

    if not name:
        return jsonify({"error": "Informe seu nome."}), 400
    if not ROOM_RE.match(room):
        return jsonify({"error": "Nome de sala inválido. Use letras, números e hífens."}), 400
    if ACCESS_CODE and not secrets.compare_digest(str(data.get("code", "")), ACCESS_CODE):
        return jsonify({"error": "Código de acesso incorreto."}), 403

    identity = f"{slugify(name)}-{secrets.token_hex(3)}"
    return jsonify({
        "token": create_token(identity, name, room),
        "url": LIVEKIT_URL,
        "room": room,
        "identity": identity,
    })


@app.get("/health")
def health():
    return {"ok": True}


@app.errorhandler(404)
def not_found(_):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Não encontrado."}), 404
    return send_from_directory(app.static_folder, "index.html"), 404


if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    print(f"Reunião rodando em http://{host}:{port}  ·  LiveKit: {LIVEKIT_URL}")
    if LIVEKIT_API_SECRET == "secret":
        print("Aviso: usando as chaves de desenvolvimento (devkey/secret). Troque no .env para produção.")
    app.run(host=host, port=port, debug=os.getenv("DEBUG") == "1")
