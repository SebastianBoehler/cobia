FROM node:24-bookworm-slim AS build

RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/domain/package.json packages/domain/package.json
COPY packages/solver-sdk/package.json packages/solver-sdk/package.json
COPY packages/solvers/package.json packages/solvers/package.json
COPY examples/open-solver/package.json examples/open-solver/package.json
RUN --mount=type=cache,id=cobia-pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --filter @cobia/example-open-solver... --frozen-lockfile
COPY apps/web/lib apps/web/lib
COPY packages packages
COPY examples/open-solver examples/open-solver
RUN pnpm --filter @cobia/example-open-solver build

FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/domain/package.json packages/domain/package.json
COPY packages/solver-sdk/package.json packages/solver-sdk/package.json
COPY packages/solvers/package.json packages/solvers/package.json
COPY examples/open-solver/package.json examples/open-solver/package.json
RUN --mount=type=cache,id=cobia-pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --filter @cobia/example-open-solver... --prod --frozen-lockfile \
  && rm -rf /root/.cache/node /root/.cache/pnpm
COPY --from=build /app/examples/open-solver/dist examples/open-solver/dist
COPY examples/open-solver/codex examples/open-solver/codex
COPY examples/open-solver/skills examples/open-solver/skills
RUN mkdir -p /auth/codex /var/lib/cobia-solver \
  && chown -R node:node /auth/codex /var/lib/cobia-solver

ENV ANVIL_BIN=/app/examples/open-solver/node_modules/.bin/anvil
USER node
CMD ["node", "examples/open-solver/dist/index.mjs"]
