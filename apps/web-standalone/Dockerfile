# --- Build stage ----------------------------------------------------------- #
# The build needs the monorepo's shared engine package, so build context must be
# the repo root:
#   docker build -f apps/web-standalone/Dockerfile -t ai-detector-standalone .
FROM node:22-alpine AS build
WORKDIR /repo

# Build the shared engine first (web app depends on it via file: link).
COPY packages/detector-core-ts/package*.json packages/detector-core-ts/
RUN cd packages/detector-core-ts && npm install
COPY packages/detector-core-ts/ packages/detector-core-ts/
RUN cd packages/detector-core-ts && npm run build

# Install + build the standalone web app.
COPY apps/web-standalone/package*.json apps/web-standalone/
RUN cd apps/web-standalone && npm install
COPY apps/web-standalone/ apps/web-standalone/
RUN cd apps/web-standalone && npm run build

# --- Serve stage ----------------------------------------------------------- #
FROM nginx:1.27-alpine AS serve
COPY apps/web-standalone/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web-standalone/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
