FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/solver-sdk/package.json packages/solver-sdk/package.json
COPY packages/solvers/package.json packages/solvers/package.json
COPY examples/open-solver/package.json examples/open-solver/package.json
RUN --mount=type=cache,id=cobia-pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm config set fetch-timeout 300000 \
  && pnpm config set fetch-retries 5 \
  && pnpm install --filter @cobia/example-open-solver... --frozen-lockfile
COPY apps/web apps/web
COPY packages packages
COPY examples/open-solver examples/open-solver

CMD ["pnpm", "--filter", "@cobia/example-open-solver", "start"]
