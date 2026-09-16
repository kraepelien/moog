# Deploying to the NAS

The workflow builds an image, pushes it to GHCR, and asks the NAS to run it.
Nothing here is red/green: the editor holds no session, and two containers
writing the same data folder is the one thing worth avoiding.

## On the NAS, once

Create `/volume1/docker/moog/` and put three things in it:

- `compose.yaml` — copied from the repo root
- `deploy.sh` — copied from `deploy/`
- `.env` — the settings for this machine, see below

Then create the data folder and give it to whoever will own it:

```sh
mkdir -p /volume1/docker/moog/data
```

## `.env`

```sh
MOOG_IMAGE=ghcr.io/kraepelien/moog:latest   # rewritten by deploy.sh each deploy
MOOG_HOST=moog.pomello.se                   # what Traefik routes
MOOG_DATA_DIR=/volume1/docker/moog/data
MOOG_UID=1026                               # see below — must match the folder owner
MOOG_GID=100
```

`MOOG_UID` and `MOOG_GID` matter more than they look. The container writes every
preset and patch as that id; if it does not match the account owning the share,
the files come back unreadable from the NAS and editing them by hand — the reason
they are files at all — stops working. Find the right numbers with:

```sh
ls -n /volume1/docker/moog
```

Synology accounts are usually not 1000, so the default is probably wrong.

## Repository settings

Secrets, which the `oc-pomello` workflow already uses:

- `DEPLOY_SSH_KEY`
- `TS_OAUTH_CLIENT_ID`
- `TS_OAUTH_SECRET`

Variables, so the image is built for the right id:

- `MOOG_UID`
- `MOOG_GID`

## First deploy

Seeding fills the data folder from the bank in the image the first time it runs,
and records which presets it has placed. After that the folder is the truth: a
preset deleted there stays deleted across restarts and redeploys, while a preset
added to the repo in a later build does arrive.
