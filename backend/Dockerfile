# Travel & Tourism — customer backend. No dependencies to install.
FROM node:22-alpine
WORKDIR /app
COPY . .
# BACKEND_ENV defaults to production so an unconfigured container refuses to start (config.mjs lists what is
# missing) instead of running in development mode. Override with BACKEND_ENV=staging for a staging deployment.
ENV NODE_ENV=production BACKEND_ENV=production BACKEND_HOST=0.0.0.0 BACKEND_PORT=8930
# Configuration comes from the runtime environment (see .env.example); the
# image contains no secrets. Mount persistent volumes at the database and
# storage paths you configure (BACKEND_DATABASE_PATH, BACKEND_STORAGE_DIR).
USER node
EXPOSE 8930
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:${BACKEND_PORT}/health || exit 1
CMD ["sh", "-c", "node --no-warnings=ExperimentalWarning migrate.mjs && node --no-warnings=ExperimentalWarning server.mjs"]
