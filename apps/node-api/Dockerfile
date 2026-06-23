# Multi-stage build for the Node (Express + TypeScript) API.
# Build context must be the repo ROOT so the shared engine is available:
#   docker build -f apps/node-api/Dockerfile -t aipd-node-api .

# --- Stage 1: build the shared engine + the API ----------------------------- #
FROM node:22-bookworm-slim AS build
WORKDIR /repo

# Build the shared engine first (better layer caching).
COPY packages/detector-core-ts/package*.json packages/detector-core-ts/
RUN cd packages/detector-core-ts && npm install
COPY packages/detector-core-ts packages/detector-core-ts
RUN cd packages/detector-core-ts && npm run build

# Install + build the API (resolves "@aicodecheck/detector-core": file:../..).
COPY apps/node-api/package*.json apps/node-api/
RUN cd apps/node-api && npm install
COPY apps/node-api apps/node-api
RUN cd apps/node-api && npm run build

# Prune dev dependencies for the runtime image.
RUN cd apps/node-api && npm prune --omit=dev

# --- Stage 2: runtime ------------------------------------------------------- #
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    WORK_DIR=/tmp/aipd-work

# git is required to clone repositories for analysis.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
# Copy the built engine and the built API with their node_modules.
COPY --from=build /repo/packages/detector-core-ts/dist packages/detector-core-ts/dist
COPY --from=build /repo/packages/detector-core-ts/package.json packages/detector-core-ts/package.json
COPY --from=build /repo/apps/node-api/dist apps/node-api/dist
COPY --from=build /repo/apps/node-api/node_modules apps/node-api/node_modules
COPY --from=build /repo/apps/node-api/package.json apps/node-api/package.json

WORKDIR /repo/apps/node-api

# Run as a non-root user with a writable work dir.
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /tmp/aipd-work \
    && chown -R appuser /tmp/aipd-work /repo
USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
