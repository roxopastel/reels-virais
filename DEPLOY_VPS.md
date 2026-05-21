# Deploy em VPS

Este projeto fica pronto para rodar em uma VPS com Docker + Nginx.

## Arquivos sensiveis

Crie um `.env.production` na VPS, sem commitar:

```bash
GEMINI_API_KEY=sua_chave_nova
GEMINI_MODEL=gemini-3.5-flash
```

## Subir com Docker Compose

```bash
cd /opt/direct-viral
docker compose up -d --build
docker compose logs -f direct-viral
```

Health check:

```bash
curl http://127.0.0.1:3000/api/health
```

## Nginx

Copie `deploy/nginx/direct-viral.conf` para:

```bash
/etc/nginx/sites-available/direct-viral
```

Edite `server_name`, depois:

```bash
ln -s /etc/nginx/sites-available/direct-viral /etc/nginx/sites-enabled/direct-viral
nginx -t
systemctl reload nginx
```

Com Certbot:

```bash
certbot --nginx -d seu-dominio.com
```

## Systemd opcional

```bash
cp deploy/systemd/direct-viral.service /etc/systemd/system/direct-viral.service
systemctl daemon-reload
systemctl enable --now direct-viral
```

## Observacoes

- O site roda na porta local `3000`.
- O Nginx expoe a aplicacao em `80/443`.
- O Dockerfile ja instala `ffmpeg`, deixando o terreno pronto para render server-side.
- A chave antiga do Gemini e a chave SSH expostas no chat devem ser rotacionadas.
