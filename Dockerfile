# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build
WORKDIR /workspace

COPY db/package.json db/package-lock.json ./db/
RUN --mount=type=cache,target=/root/.npm \
    cd db && npm ci
COPY db ./db
RUN cd db && npm run build

COPY auth/package.json auth/package-lock.json ./auth/
RUN --mount=type=cache,target=/root/.npm \
    cd auth && npm ci
COPY auth ./auth
RUN cd auth && npm run build

FROM node:22-bookworm-slim AS runtime
ENV APP_ENV=production
WORKDIR /workspace

RUN groupadd --system --gid 10001 mucyora \
    && useradd --system --uid 10001 --gid mucyora --home /nonexistent mucyora

COPY --from=build --chown=mucyora:mucyora /workspace/db ./db
COPY --from=build --chown=mucyora:mucyora /workspace/auth/package.json /workspace/auth/package-lock.json ./auth/
RUN --mount=type=cache,target=/root/.npm \
    cd auth && npm ci --omit=dev
COPY --from=build --chown=mucyora:mucyora /workspace/auth/dist ./auth/dist

USER mucyora
WORKDIR /workspace/auth
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health/live').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]
