# Hysteria Backend - Docker Image
FROM public.ecr.aws/docker/library/golang:1.25-alpine AS cc-agent-builder

WORKDIR /src/cc-agent

COPY cc-agent/go.mod cc-agent/go.sum ./
RUN go mod download

COPY cc-agent/ ./

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/cc-agent-linux-amd64 .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o /out/cc-agent-linux-arm64 .

FROM public.ecr.aws/docker/library/node:20-alpine

WORKDIR /app

# Устанавливаем системные зависимости (mongodump для бэкапов)
RUN apk add --no-cache mongodb-tools

# Копируем зависимости
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install --omit=dev

# Копируем исходники
COPY . .

# Добавляем локально собранные бинарники cc-agent (источник для SSH preload install)
COPY --from=cc-agent-builder /out /app/artifacts/cc-agent

# После копирования исходников синхронизируем локальные ассеты каскадного билдера
RUN npm run sync:cascade-vendor

# Создаём директории для логов, сертификатов и бэкапов
RUN mkdir -p logs greenlock.d/live greenlock.d/accounts backups && \
    chmod -R 755 greenlock.d backups

# Application port behind a reverse proxy (Coolify/Traefik, Caddy, etc.)
EXPOSE 3000

# Запуск
CMD ["node", "index.js"]
