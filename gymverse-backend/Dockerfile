# Both Dockerfiles use the repository root as the build context.
FROM node:24-bookworm-slim
WORKDIR /app/gymverse-backend

COPY gymverse-backend/package.json gymverse-backend/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-fund

COPY gymverse-backend/src/ ./src/
COPY gymverse-backend/*.js ./
COPY gymverse-backend/swagger.yaml ./
COPY database/ /app/database/
RUN mkdir -p .mail-outbox backups && chown node:node .mail-outbox backups

ENV NODE_ENV=production
ENV PORT=5000
USER node
EXPOSE 5000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 CMD node -e "fetch('http://127.0.0.1:5000/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Pending migrations must succeed before the API starts; exec forwards signals.
CMD ["sh", "-c", "node migrate.js && exec node src/server.js"]
