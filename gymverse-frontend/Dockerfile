FROM node:24-bookworm-slim AS build
WORKDIR /build/frontend
COPY gymverse-frontend/package.json gymverse-frontend/package-lock.json ./
RUN npm ci --no-fund
COPY gymverse-frontend/ ./
# The browser calls its own origin; Nginx forwards /api to the backend container.
ENV VITE_API_URL=/api
RUN npm run build

FROM nginx:stable-alpine
COPY gymverse-frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/frontend/dist/ /usr/share/nginx/html/
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=10s --start-period=10s --retries=5 CMD wget -T 3 -q --spider http://127.0.0.1/ && wget -T 3 -qO /dev/null http://127.0.0.1/api/health
