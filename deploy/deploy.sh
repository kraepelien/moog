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

# A non-interactive ssh session on Synology gets a minimal PATH without Docker,
# so this works by hand and fails from CI without it. Same line as pomello's
# deploy.sh, for the same reason.
export PATH="/usr/local/bin:$PATH"

IMAGE="${1:?usage: deploy.sh <image:tag>}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

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

echo "Deploying ${IMAGE}"
docker compose pull
docker compose up -d --remove-orphans

# Wait for the container to report healthy rather than assuming it came up. The
# healthcheck counts the patches in the database, so this also catches a missing
# or unreadable volume, which is the failure most likely to survive a green
# build.
echo -n "Waiting for health"
for _ in $(seq 1 30); do
  state="$(docker inspect --format '{{.State.Health.Status}}' moog 2>/dev/null || echo starting)"
  if [[ "$state" == "healthy" ]]; then
    echo " — healthy"
    docker image prune -f >/dev/null 2>&1 || true
    exit 0
  fi
  echo -n "."
  sleep 2
done

echo " — never became healthy" >&2
docker compose logs --tail=50 moog >&2
exit 1
