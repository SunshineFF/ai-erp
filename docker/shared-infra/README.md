# Shared PostgreSQL + Redis Image

This image is intended for local development across multiple projects. It runs PostgreSQL 16 and Redis 7 in one reusable container and persists their data in two named Docker volumes.

## Build and start

```powershell
docker compose build erp-infra
docker compose up -d erp-infra
docker compose ps
```

The reusable image tag is `local/erp-postgres-redis:16-7`.

## Connection endpoints

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- PostgreSQL database: `rubber_erp`
- PostgreSQL user: `erp`
- Redis password: `redis_dev_password`

The current API uses:

```text
DATABASE_URL=postgresql://erp:erp_dev_password@localhost:5432/rubber_erp?schema=public
```

## Reusing from another project

Copy the `erp-infra` service and set the same image tag. Use different host ports or connect from another Compose project through a shared external network. The persistent volumes are named `erp_shared_postgres_data` and `erp_shared_redis_data`.

Do not reuse the same PostgreSQL data volume for unrelated projects unless they intentionally share one database server. Create a separate database per project.

## Persistence

The container can be removed without deleting data:

```powershell
docker compose down
```

Do not use `docker compose down -v` unless the local PostgreSQL and Redis data should be deleted.

## Deployment note

Running two stateful services in one container is a local-development convenience. Production should use separate PostgreSQL and Redis services or managed services so they can be upgraded, monitored, backed up and scaled independently.
