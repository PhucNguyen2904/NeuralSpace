# NeuralSpace Frontend — Final Integration Guide

## Environment Variables (`.env.local`)
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_NAME=NeuralSpace
NEXT_PUBLIC_WS_PROXY_URL=wss://lab.platform.com
```

## NPM Scripts
- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run typecheck`
- `npm run type-check`
- `npm run test`

## Docker Build
```bash
docker build -t neuralspace-frontend .
docker run --rm -p 3000:3000 neuralspace-frontend
```

## Nginx Reverse Proxy (Next + API + SSE/WebSocket)
```nginx
server {
  listen 80;
  server_name _;

  location / {
    proxy_pass http://frontend:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /api/ {
    proxy_pass http://backend:8000/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600;
    proxy_send_timeout 3600;
    proxy_buffering off;
  }

  location /ws/ {
    proxy_pass http://backend:8000/ws/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }
}
```

## Security Headers
- `Content-Security-Policy`
- `Strict-Transport-Security`
- `X-Frame-Options`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`

## Common Issues

### iframe blocked by CSP
- Ensure `frame-src` in CSP allows Jupyter domain/proxy origin.
- If embedded from another domain, include exact scheme + host.

### SSE connection drops
- Disable proxy buffering (`proxy_buffering off`).
- Increase `proxy_read_timeout`.
- Keep heartbeat from backend active.

### WebSocket 401
- Access token expired.
- Refresh token flow before opening WS.
- Verify proxy forwards auth headers/cookies.
