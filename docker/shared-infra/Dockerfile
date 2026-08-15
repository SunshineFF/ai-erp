FROM postgres:16-alpine

RUN apk add --no-cache redis supervisor su-exec

COPY supervisord.conf /etc/supervisord.conf
COPY redis.conf.template /etc/redis/redis.conf.template
COPY shared-entrypoint.sh /usr/local/bin/shared-entrypoint.sh

RUN chmod +x /usr/local/bin/shared-entrypoint.sh \
    && mkdir -p /data/redis \
    && chown -R redis:redis /data/redis

EXPOSE 5432 6379

ENTRYPOINT ["/usr/local/bin/shared-entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
