# Deploying to the NAS

The workflow builds an image, pushes it to GHCR, and asks the NAS to run it.
Nothing here is red/green: the editor holds no session, and two containers
writing the same data folder is the one thing worth avoiding.

## On the NAS, once

Create `/volume1/docker/moog/` and put three things in it:

- `docker-compose.yml` — copied from the repo root
- `deploy.sh` — copied from `deploy/`
- `.env` — the settings for this machine, see below

Then the data folder, owned by the account the container runs as:

```sh
mkdir -p /volume1/docker/moog/data
chown -R 1027:65536 /volume1/docker/moog/data
```

And the route, copied from `deploy/traefik-moog.yml`:

- `traefik/dynamic/moog.yml`

Traefik reads its file provider here rather than from container labels, so the
route is a file next to `pomello.yml` and this container joins no shared network.
It reaches the editor at `nas-local:10072`, which is the port compose publishes.
Those two numbers are the same value written twice; change one without the other
and the route points at nothing.

## `.env`

```sh
MOOG_IMAGE=ghcr.io/kraepelien/moog:latest   # rewritten by deploy.sh each deploy
MOOG_PORT=10072                             # must match traefik/dynamic/moog.yml
MOOG_DATA_DIR=/volume1/docker/moog/data
MOOG_UID=1027                               # the `docker` account
MOOG_GID=65536                              # the `docker` group

# Sign-in. Leave MOOG_OAUTH_CLIENT_ID empty and the app runs as one local user
# with nothing gated, which is how it ran before there were accounts.
MOOG_OAUTH_CLIENT_ID=
MOOG_OAUTH_CLIENT_SECRET=
MOOG_SESSION_SECRET=                        # any long random string
MOOG_PUBLIC_ORIGIN=https://moog.pomello.se
MOOG_ADMINS=you@example.com                 # comma-separated
```

Anyone with a Google account can sign in and save, so the server keeps five
caps with defaults nobody honest meets: `MOOG_MAX_PATCHES` (2000 each),
`MOOG_MAX_PATCH_BYTES` (65536, against a real patch of about 200),
`MOOG_TRASH_DAYS` (30 before a deleted patch is purged on the daily timer),
`MOOG_WRITES_PER_MINUTE` (120 per person) and `MOOG_SIGN_INS_PER_MINUTE` (10 per
address). Set one in the `.env` only if somebody meets it; over a cap the API
answers 413, and over a rate 429.

`deploy.sh` only rewrites the `MOOG_IMAGE` line, so everything added here by
hand survives a deploy. None of it is in the repo, the image or CI.

## Sign-in, once

In Google Cloud Console: APIs & Services → Credentials → **OAuth client ID** →
Web application, with two redirect URIs:

```
https://moog.pomello.se/api/auth/google/callback
http://localhost:5173/api/auth/google/callback
```

Publish the consent screen rather than leaving it in testing, or only the
accounts listed in the console can sign in — an allowlist by accident.

`MOOG_SESSION_SECRET` can be anything long and random:

```sh
openssl rand -hex 32
```

Changing it signs everybody out, which is the one way to end every session at
once if that is ever wanted. The LAN address cannot sign in: Google will not
register a plain-http redirect for it and a browser will not send a `Secure`
cookie there, so reach the app by hostname.

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

## Ports

`10072` is a guess at a free port; pomello holds `10071`. Check with:

```sh
netstat -tlnp 2>/dev/null | grep 1007
```

If it is taken, change `MOOG_PORT` in `.env` and the url in
`traefik/dynamic/moog.yml` together.

## First deploy

Seeding fills the data folder from the bank in the image the first time it runs,
and records which presets it has placed. After that the folder is the truth: a
preset deleted there stays deleted across restarts and redeploys, while a preset
added to the repo in a later build does arrive.
