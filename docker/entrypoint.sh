#!/bin/sh
set -eu

: "${PORT:=8080}"
: "${RUN_MIGRATIONS_ON_START:=true}"
export PORT

envsubst '$PORT' < /etc/nginx/templates/school.conf.template > /etc/nginx/conf.d/default.conf

mkdir -p \
  /var/www/backend/uploads/profile-images \
  /var/www/storage/uploads \
  /run/nginx \
  /var/log/supervisor
chown -R www-data:www-data /var/www/backend/uploads /var/www/storage

if [ "$RUN_MIGRATIONS_ON_START" = "true" ]; then
  attempt=1
  max_attempts=30
  until php /var/www/backend/migrate.php; do
    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "ERREUR: migrations impossibles après $max_attempts tentatives." >&2
      exit 1
    fi
    echo "Base de données non prête pour les migrations (tentative $attempt/$max_attempts). Nouvelle tentative dans 2 s..."
    attempt=$((attempt + 1))
    sleep 2
  done
fi

exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/school.conf
