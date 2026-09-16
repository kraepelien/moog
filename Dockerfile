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
# the bun base image already occupies 1000:1000. Compose overrides this with
# `user:` when the share is owned by something else.
ARG UID=1000
ARG GID=1000

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

# The bank shipped with this image. The active copy lives in the volume; presets
# added here reach an existing install because seeding records which slugs it has
# already placed rather than whether it has run.
COPY --from=build /app/presets ./presets

ENV MOOG_DATA=/data \
    MOOG_PRESETS=/app/presets \
    MOOG_DIST=/app/dist \
    PORT=8080

# Created here so the container starts even with no volume attached; a mount
# takes precedence over it.
RUN mkdir -p /data && chown -R "$UID:$GID" /data

USER ${UID}:${GID}
EXPOSE 8080
VOLUME ["/data"]

# No health endpoint of its own: the preset listing is a real read of the volume,
# so it fails if the mount is missing or unreadable rather than only if the
# process has died.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/presets >/dev/null || exit 1

CMD ["bun", "run", "server/serve.ts"]
