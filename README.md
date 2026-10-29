# Reunião · videochamadas com LiveKit + Python

Site de reunião em Python (Flask) com **webcam**, **microfone**, **compartilhamento de tela** e **chat**,
usando o [LiveKit](https://livekit.io) para transmitir a mídia por WebRTC.

## Funções

- **Lobby:** prévia da câmera, escolha de câmera e microfone, entrar com câmera ou microfone desligados.
- **Salas por link:** `http://seu-site/sala/nome-da-sala`. O botão **Copiar convite** copia o link.
- **Vídeo em grade:** a grade se ajusta ao número de participantes, mostra avatar quando a câmera
  está desligada, destaca quem está falando e indica a qualidade da conexão.
- **Compartilhamento de tela** (com o áudio da aba, quando o navegador permite): a tela vai para o
  destaque e as câmeras ficam numa faixa abaixo. O botão **Layout** alterna entre destaque e grade.
- **Tela cheia da apresentação:** o botão de expandir no canto da tela compartilhada abre o vídeo
  ocupando todo o visor, sem as barras do navegador onde o navegador permite. É o jeito mais
  confortável de acompanhar uma apresentação no celular; `Esc` ou o ✕ volta para a reunião.
- **Fixar participante:** clique no alfinete ou dê dois cliques em um vídeo.
- **Chat** pelo canal de dados do LiveKit, com aviso de mensagem não lida.
- **Participantes:** lista com o estado de câmera, microfone e tela de cada um.
- **Dispositivos:** troca câmera, microfone e alto-falante durante a reunião.
- **Atalhos:** `Ctrl+D` liga/desliga o microfone e `Ctrl+E` liga/desliga a câmera.
- **Código de acesso** opcional para entrar nas salas (`ACCESS_CODE` no `.env`).
- Aviso de reconexão e botão para liberar o áudio quando o navegador bloqueia a reprodução automática.

## Como funciona

```
Navegador ──(1) POST /api/token──▶ Flask (app.py)  → gera JWT com as chaves do LiveKit
    │
    └──(2) WebRTC: áudio, vídeo, tela e chat ──▶ Servidor LiveKit (local ou LiveKit Cloud)
```

O Python **não trafega mídia**: ele só autentica e emite o token. Por isso aguenta muitas salas
com pouco recurso. Quem distribui o vídeo é o servidor LiveKit.

## Rodando localmente

Requisitos: Python 3.10+ e Docker (para o servidor LiveKit local).

```bash
# 1. Servidor LiveKit em modo desenvolvimento (chaves devkey / secret)
docker compose up -d

# 2. Site em Python
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # Windows: copy .env.example .env
python app.py
```

Abra **http://localhost:8000**, entre em uma sala e abra o mesmo link em outra aba ou outro
navegador para testar com duas pessoas.

> Sem Docker? Instale o binário do LiveKit (`brew install livekit`, ou baixe em
> github.com/livekit/livekit/releases) e rode `livekit-server --dev`.

## Usando o LiveKit Cloud (sem servidor próprio)

1. Crie um projeto grátis em https://cloud.livekit.io.
2. Em **Settings › Keys**, gere uma chave.
3. No `.env`:
   ```
   LIVEKIT_URL=wss://seu-projeto.livekit.cloud
   LIVEKIT_API_KEY=APIxxxxxxxx
   LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
   ```
4. Rode `python app.py`. Não é preciso Docker.

## Colocando em produção

- Rode com o servidor Waitress: `python serve.py` (escuta em `0.0.0.0:8000`).
- **Use HTTPS.** Os navegadores só liberam câmera, microfone e compartilhamento de tela em
  `https://` ou em `localhost`. Coloque um proxy (Caddy, Nginx, Cloudflare Tunnel) na frente.
- Com servidor LiveKit próprio, use `wss://` no `LIVEKIT_URL` e libere as portas 7881/TCP e
  7882/UDP, ou o intervalo UDP configurado, no firewall. Veja docs.livekit.io/home/self-hosting.
- Troque `devkey`/`secret` por chaves fortes.

## Deploy no Render

O `render.yaml` já descreve o serviço. No painel do Render, use **New → Blueprint** e escolha
este repositório; ele cria o Web Service com:

- Build: `pip install -r requirements.txt`
- Start: `python serve.py` (Waitress, na porta que o Render injeta em `PORT`)
- Health check: `/health`

Depois preencha as variáveis marcadas como secretas (`LiveKit → Settings → Keys`):

```
LIVEKIT_URL=wss://SEU-PROJETO.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

O `docker-compose.yml` **não** roda no Render: sem um servidor LiveKit acessível por `wss://`
(o LiveKit Cloud tem plano gratuito), o site abre mas o vídeo não conecta.

## Testes

```bash
pip install pytest
python -m pytest tests                  # backend: token, validações, código de acesso

# interface (precisa de Node + Playwright; usa um LiveKit simulado)
python app.py &  node tests/ui_test.js
```

## Estrutura

```
app.py              servidor Flask: páginas e emissão de tokens
serve.py            execução em produção (Waitress)
static/index.html   lobby, sala e diálogos
static/app.js       lógica da reunião (livekit-client v2 via CDN)
static/style.css    visual
docker-compose.yml  servidor LiveKit local
render.yaml         deploy no Render (build, start e variáveis)
tests/              testes do backend e da interface
```
