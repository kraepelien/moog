# Deploying to the NAS

The workflow builds an image, pushes it to GHCR, and asks the NAS to run it.
Nothing here is red/green: the editor holds no session, and two containers
writing the same data folder is the one thing worth avoiding.

## On the NAS, once

Create `/volume1/docker/moog/` and put three things in it:

- `docker-compose.yml` — copied from the repo root
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
MOOG_UID=1027                               # the `docker` account
MOOG_GID=65536                              # the `docker` group
```

`MOOG_UID` and `MOOG_GID` matter more than they look. The container writes every
preset and patch as that id; if it does not match the account owning the share,
the files come back unreadable from the NAS and editing them by hand — the reason
they are files at all — stops working.

**1027:65536 is already the default** in the Dockerfile, in `docker-compose.yml`
and in the workflow, so nothing needs setting for this NAS. 65536 is the `docker`
group, which the data folder belongs to — not the `docker` account's primary
group of 100. With 100 the container would match neither the folder's owner nor
its group, list every preset happily, and fail every save. On a different host,
find the right numbers with `ls -n` on the folder and override them.

## Repository settings

Secrets, which the `oc-pomello` workflow already uses:

- `DEPLOY_SSH_KEY`
- `TS_OAUTH_CLIENT_ID`
- `TS_OAUTH_SECRET`

No variables are needed: the id defaults to 1027:65536 everywhere. Set
`MOOG_UID` and `MOOG_GID` as repository variables only when deploying somewhere
else.

## First deploy

Seeding fills the data folder from the bank in the image the first time it runs,
and records which presets it has placed. After that the folder is the truth: a
preset deleted there stays deleted across restarts and redeploys, while a preset
added to the repo in a later build does arrive.
