#!/bin/sh
set -eu

redis_password="${REDIS_PASSWORD:?REDIS_PASSWORD must be set}"
sed "s/__REDIS_PASSWORD__/${redis_password}/g" /etc/redis/redis.conf.template > /etc/redis/redis.conf
chown redis:redis /etc/redis/redis.conf

exec "$@"
