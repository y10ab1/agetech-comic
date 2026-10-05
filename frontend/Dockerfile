# Next.js 前端正式映像（standalone）。
# build context 必須是 repo 根目錄（需要 shared/tags.json）：
#   docker build -f frontend/Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=... .
FROM node:22-alpine AS deps
WORKDIR /repo/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /repo
COPY shared ./shared
COPY frontend ./frontend
COPY --from=deps /repo/frontend/node_modules ./frontend/node_modules
# NEXT_PUBLIC_* 為 build-time 變數，會被編進前端 bundle
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_USE_MOCK=false
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_USE_MOCK=$NEXT_PUBLIC_USE_MOCK \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo/frontend
# 本機 .env.local 不得混入正式 build
RUN rm -f .env.local .env.development.local && npm run build

FROM node:22-alpine AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=8080
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
# outputFileTracingRoot＝repo 根 → standalone 內的 server 位於 frontend/
COPY --from=build --chown=app:app /repo/frontend/.next/standalone ./
COPY --from=build --chown=app:app /repo/frontend/.next/static ./frontend/.next/static
COPY --from=build --chown=app:app /repo/frontend/public ./frontend/public
USER app
EXPOSE 8080
CMD ["node", "frontend/server.js"]
