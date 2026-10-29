import warnings

import jwt
import pytest

import app as server


@pytest.fixture()
def client():
    server.app.config["TESTING"] = True
    return server.app.test_client()


def test_token_has_livekit_claims(client):
    r = client.post("/api/token", json={"name": "João Pedro", "room": "Equipe Semanal"})
    assert r.status_code == 200
    data = r.get_json()
    assert data["room"] == "equipe-semanal"
    assert data["url"] == server.LIVEKIT_URL
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # segredo de desenvolvimento curto
        claims = jwt.decode(data["token"], server.LIVEKIT_API_SECRET, algorithms=["HS256"])
    assert claims["iss"] == server.LIVEKIT_API_KEY
    assert claims["sub"] == data["identity"] and claims["sub"].startswith("joao-pedro-")
    assert claims["name"] == "João Pedro"
    assert claims["video"]["room"] == "equipe-semanal"
    assert claims["video"]["roomJoin"] and claims["video"]["canPublish"] and claims["video"]["canPublishData"]
    assert claims["exp"] > claims["nbf"]


def test_identities_are_unique(client):
    a = client.post("/api/token", json={"name": "Ana", "room": "sala"}).get_json()["identity"]
    b = client.post("/api/token", json={"name": "Ana", "room": "sala"}).get_json()["identity"]
    assert a != b


@pytest.mark.parametrize("body", [{"name": "", "room": "sala"}, {"name": "Ana", "room": ""}, {"name": "Ana", "room": "!"}, {}])
def test_rejects_invalid_input(client, body):
    assert client.post("/api/token", json=body).status_code == 400


def test_access_code(client, monkeypatch):
    monkeypatch.setattr(server, "ACCESS_CODE", "1234")
    assert client.get("/api/config").get_json()["requiresCode"] is True
    assert client.post("/api/token", json={"name": "Ana", "room": "sala"}).status_code == 403
    assert client.post("/api/token", json={"name": "Ana", "room": "sala", "code": "1234"}).status_code == 200


def test_pages(client):
    for path, status in [("/", 200), ("/sala/minha-sala", 200), ("/static/app.js", 200), ("/api/nada", 404)]:
        with client.get(path) as r:
            assert r.status_code == status
            if path.startswith("/sala/"):
                assert "Entrar na reunião" in r.get_data(as_text=True)
