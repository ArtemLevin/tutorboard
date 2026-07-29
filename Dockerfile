FROM node:24.13.0-alpine3.23 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

ARG BUILD_REVISION=unknown
ARG BUILD_VERSION=0.1.0
ENV VITE_APP_STAGE=production \
    VITE_BASE_PATH=/board/ \
    VITE_BOARD_API_BASE_URL=/api/v1 \
    VITE_FEATURE_DEV_DIAGNOSTICS=false \
    VITE_FEATURE_DOCUMENT_SNAPSHOTS=true \
    VITE_FEATURE_GEOMETRY_PROMPT=true \
    VITE_FEATURE_SERVER_SYNC=true
RUN npm run build \
    && printf '%s\n' \
      "{\"version\":\"${BUILD_VERSION}\",\"revision\":\"${BUILD_REVISION}\"}" \
      > dist/build.json

FROM nginxinc/nginx-unprivileged:1.28.0-alpine3.21

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
