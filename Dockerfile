FROM node:22-alpine

RUN npm install -g joplin

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

COPY dist/ dist/

ENV JOPLIN_TOKEN=""
ENV JOPLIN_SYNC_TARGET=""
ENV JOPLIN_SYNC_PATH=""
ENV JOPLIN_SYNC_USERNAME=""
ENV JOPLIN_SYNC_PASSWORD=""

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

ENTRYPOINT ["node", "dist/index.js", "--transport", "http"]
