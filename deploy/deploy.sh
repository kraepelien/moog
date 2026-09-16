#!/usr/bin/env bash
# Copied to the NAS as /volume1/docker/moog/deploy.sh and called by the workflow
# with the image tag to run:
#
#   bash /volume1/docker/moog/deploy.sh ghcr.io/kraepelien/moog:abc1234
#
# Alongside it the folder needs docker-compose.yml from this repo, and a .env
# holding the settings for this machine. It is not red/green on purpose: the
# editor holds no session, and two containers writing the same data folder is the
# one thing genuinely worth avoiding.

set -euo pipefail

IMAGE="${1:?usage: deploy.sh <image:tag>}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

# A non-interactive ssh session on Synology gets a minimal PATH that does not
# include Docker, so running this by hand works and running it from CI fails with
# "docker: command not found". The binary is looked for where the packages put it
# rather than assumed, and its directory is put on PATH so the compose plugin can
# find its own helpers too.
find_docker() {
  if command -v docker >/dev/null 2>&1; then
    command -v docker
    return 0
  fi
  local candidate
  for candidate in \
    /usr/local/bin/docker \
    /volume1/@appstore/ContainerManager/usr/bin/docker \
    /volume1/@appstore/Docker/usr/bin/docker \
    /usr/bin/docker
  do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

if ! DOCKER="$(find_docker)"; then
  echo "docker not found. Looked on PATH and in the usual Synology package" >&2
  echo "locations. Find it with: find / -name docker -type f 2>/dev/null" >&2
  exit 1
fi
PATH="$(dirname "$DOCKER"):$PATH"
export PATH

# Compose is either the v2 subcommand or the old standalone binary, depending on
# how old the package is. Both read docker-compose.yml from this directory.
if "$DOCKER" compose version >/dev/null 2>&1; then
  compose() { "$DOCKER" compose "$@"; }
elif command -v docker-compose >/dev/null 2>&1; then
  compose() { docker-compose "$@"; }
else
  echo "neither 'docker compose' nor 'docker-compose' is available" >&2
  exit 1
fi

if [[ ! -f docker-compose.yml ]]; then
  echo "docker-compose.yml is missing from $HERE" >&2
  exit 1
fi

# The image tag is the only thing that changes between deploys, so it is written
# where compose reads it rather than passed through the environment — that way
# `docker compose up -d` by hand later runs the same image this deployed.
touch .env
if grep -q '^MOOG_IMAGE=' .env; then
  sed -i "s|^MOOG_IMAGE=.*|MOOG_IMAGE=${IMAGE}|" .env
else
  echo "MOOG_IMAGE=${IMAGE}" >> .env
fi

echo "Deploying ${IMAGE} with $DOCKER"
compose pull
compose up -d --remove-orphans

# Wait for the container to report healthy rather than assuming it came up. The
# healthcheck reads the presets folder, so this also catches a missing or
# unreadable volume, which is the failure most likely to survive a green build.
echo -n "Waiting for health"
for _ in $(seq 1 30); do
  state="$("$DOCKER" inspect --format '{{.State.Health.Status}}' moog 2>/dev/null || echo starting)"
  if [[ "$state" == "healthy" ]]; then
    echo " — healthy"
    "$DOCKER" image prune -f >/dev/null 2>&1 || true
    exit 0
  fi
  echo -n "."
  sleep 2
done

echo " — never became healthy" >&2
compose logs --tail=50 moog >&2
exit 1
