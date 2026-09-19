# ── Stage 1: build the panel ──────────────────────────────────────────────────
FROM oven/bun:1.3-alpine AS build
WORKDIR /app

# Dependencies first, so a source-only change does not reinstall them.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM oven/bun:1.3-alpine
WORKDIR /app

# Runs as a non-root id matching whoever owns the volume on the NAS, or every
# file the app writes comes back owned by root and cannot be edited from the
# host — which is the whole point of keeping patches as files.
#
# The id is used numerically and no account is created for it. Docker does not
# need a passwd entry to run as a uid, and creating one here would fail anyway:
# the bun base image already occupies 1000:1000.
#
# Defaults to the Synology `docker` account, 1027, with the `docker` group,
# 65536 — the group the data folder belongs to, not that account's primary group
# of 100. Matching the folder's group is what gives the container write access;
# with gid 100 it would match neither owner nor group, fall through to "other",
# list the bank happily and fail every save. Override both for a different
# host.
ARG UID=1027
ARG GID=65536

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server

# The server runs as TypeScript, not a bundle, so its imports are resolved at
# startup — and several of them cross into src/ for the patch schema, the
# instrument list and the tag rules. Without this the process exits on the first
# require and the healthcheck never passes.
COPY --from=build /app/src ./src

# Those crossing imports are written as aliases (@patch/schema.ts), and Bun maps
# them by reading `paths` out of the tsconfig as it boots. The alias map is a
# runtime dependency of the server, not build tooling: without it every crossing
# import is an unresolved bare specifier and the container crashloops.
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/tsconfig.paths.json ./tsconfig.paths.json

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

# The bank shipped with this image, seeded into the database on a first start,
# so a patch added here reaches an existing install without overwriting one an
# administrator has corrected.
COPY --from=build /app/bank ./bank

ENV PM_DATA=/data \
    PM_BANK=/app/bank \
    PM_DIST=/app/dist \
    PORT=8080

# Created here so the container starts even with no volume attached; a mount
# takes precedence over it.
RUN mkdir -p /data && chown -R "$UID:$GID" /data

USER ${UID}:${GID}
EXPOSE 8080
VOLUME ["/data"]

# /api/health queries the database rather than only answering, so a missing or
# unreadable volume fails it rather than only a dead process. It stays open when
# the rest of the API is gated behind sign-in.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null || exit 1

CMD ["bun", "run", "server/serve.ts"]
