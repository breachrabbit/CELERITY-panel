# Hysteria Backend - Docker Image
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

# Создаём директории для логов, сертификатов и бэкапов
RUN mkdir -p logs greenlock.d/live greenlock.d/accounts backups && \
    chmod -R 755 greenlock.d backups

# Application port behind a reverse proxy (Coolify/Traefik, Caddy, etc.)
EXPOSE 3000

# Запуск
CMD ["node", "index.js"]
