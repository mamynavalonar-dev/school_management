# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS frontend-build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js postcss.config.js tailwind.config.js ./
COPY public ./public
COPY src ./src
ARG VITE_API_BASE_URL=/api
ARG VITE_WS_URL=/ws
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
RUN npm run build

FROM composer:2 AS php-deps
WORKDIR /app/backend
COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-dev --prefer-dist --no-interaction --no-progress --optimize-autoloader

FROM node:22-bookworm-slim AS ws-deps
WORKDIR /app/backend-ws
COPY backend-ws/package.json backend-ws/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS node-runtime

FROM php:8.3-fpm-bookworm AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       nginx \
       supervisor \
       gettext-base \
       curl \
       ca-certificates \
       libstdc++6 \
    && rm -rf /var/lib/apt/lists/*
RUN docker-php-ext-install pdo_mysql

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node

WORKDIR /var/www
COPY backend ./backend
COPY backend-ws ./backend-ws
COPY --from=php-deps /app/backend/vendor ./backend/vendor
COPY --from=ws-deps /app/backend-ws/node_modules ./backend-ws/node_modules
COPY --from=frontend-build /build/dist ./frontend

COPY docker/nginx.conf.template /etc/nginx/templates/school.conf.template
COPY docker/supervisord.conf /etc/supervisor/conf.d/school.conf
COPY docker/php.ini /usr/local/etc/php/conf.d/school.ini
COPY docker/entrypoint.sh /usr/local/bin/docker-entrypoint-school

RUN chmod +x /usr/local/bin/docker-entrypoint-school \
    && rm -f /etc/nginx/sites-enabled/default /etc/nginx/conf.d/default.conf \
    && mkdir -p \
       /var/www/backend/uploads/profile-images \
       /var/www/storage/uploads \
       /run/nginx \
       /var/log/supervisor \
    && chown -R www-data:www-data /var/www/backend/uploads /var/www/storage

ENV PORT=8080 \
    WS_PORT=3001 \
    REALTIME_INTERNAL_URL=http://127.0.0.1:3001/internal/notify

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/docker-entrypoint-school"]
