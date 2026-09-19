# Deploying to the NAS

The workflow builds an image, pushes it to GHCR, and asks the NAS to run it.
Nothing here is red/green: the editor holds no session, and two containers
writing the same data folder is the one thing worth avoiding.

## On the NAS, once

Create `/volume1/docker/patchmemory/` and put three things in it:

- `docker-compose.yml` — copied from the repo root
- `deploy.sh` — copied from `deploy/`
- `.env` — the settings for this machine, see below

Then the data folder, owned by the account the container runs as:

```sh
mkdir -p /volume1/docker/patchmemory/data
chown -R 1027:65536 /volume1/docker/patchmemory/data
```

And the route, copied from `deploy/traefik-patchmemory.yml`:

- `traefik/dynamic/patchmemory.yml`

Traefik reads its file provider here rather than from container labels, so the
route is a file next to `pomello.yml` and this container joins no shared network.
It reaches the editor at `nas-local:10072`, which is the port compose publishes.
Those two numbers are the same value written twice; change one without the other
and the route points at nothing.

## `.env`

```sh
PM_IMAGE=ghcr.io/kraepelien/patchmemory:latest  # rewritten by deploy.sh each deploy
PM_PORT=10072                                   # must match the Traefik route
PM_DATA_DIR=/volume1/docker/patchmemory/data
PM_UID=1027                                     # the `docker` account
PM_GID=65536                                    # the `docker` group

# Sign-in. Leave PM_OAUTH_CLIENT_ID empty and the app runs as one local user
# with nothing gated, which is how it ran before there were accounts.
PM_OAUTH_CLIENT_ID=
PM_OAUTH_CLIENT_SECRET=
PM_SESSION_SECRET=                              # any long random string
PM_PUBLIC_ORIGIN=https://patchmemory.app
PM_ADMINS=you@example.com                       # comma-separated; the guest list
```

Every key is read by its exact name, from a file that lives on this machine and
in no repository. A key spelled any other way is not an error and nothing warns
about it: `MOOG_ADMINS` here is a container that comes up with an empty guest
list and admits nobody. The startup line says which it got.

Only the addresses in `PM_ADMINS` can sign in: a Google account that is not
listed is turned away at the callback and no row is written for it. The five
caps below were written for open registration and stay as they are — they cost
nothing against a guest list, and they are what is already there the day the
list comes off. Their defaults are what nobody honest meets:
`PM_MAX_PATCHES` (2000 each),
`PM_MAX_PATCH_BYTES` (65536, against a real patch of about 200),
`PM_TRASH_DAYS` (30 before a deleted patch is purged on the daily timer),
`PM_WRITES_PER_MINUTE` (120 per person) and `PM_SIGN_INS_PER_MINUTE` (10 per
address). Set one in the `.env` only if somebody meets it; over a cap the API
answers 413, and over a rate 429.

Compose hands this whole file to the container as its `env_file`, so a setting
the server grows later belongs here and nowhere else; `docker-compose.yml` names
only what compose itself reads. The one exception is a key the image already
sets: `PORT`, `PM_DATA`, `PM_BANK` and `PM_DIST` are container paths, and
writing one of them here overrides the image and breaks the container.

`deploy.sh` only rewrites the `PM_IMAGE` line, so everything added here by
hand survives a deploy. None of it is in the repo, the image or CI.

## Sign-in, once

In Google Cloud Console: APIs & Services → Credentials → **OAuth client ID** →
Web application, with two redirect URIs:

```
https://patchmemory.app/api/auth/google/callback
http://localhost:5173/api/auth/google/callback
```

Publishing the consent screen rather than leaving it in testing matters less
than it did, since `PM_ADMINS` is an allowlist on purpose now — but leave it
published anyway, so a refusal comes from this app with a message rather than
from Google with a screen nobody can act on.

`PM_SESSION_SECRET` can be anything long and random:

```sh
openssl rand -hex 32
```

Changing it signs everybody out, which is the one way to end every session at
once if that is ever wanted. The LAN address cannot sign in: Google will not
register a plain-http redirect for it and a browser will not send a `Secure`
cookie there, so reach the app by hostname.

`PM_UID` and `PM_GID` matter more than they look. The container writes the
database as that id; if it does not match the account owning the share, the files
come back unreadable from the NAS and reaching them by hand — the reason the
volume is a share at all — stops working.

**1027:65536 is already the default** in the Dockerfile, in `docker-compose.yml`
and in the workflow, so nothing needs setting for this NAS. 65536 is the `docker`
group, which the data folder belongs to — not the `docker` account's primary
group of 100. With 100 the container would match neither the folder's owner nor
its group, list the bank happily, and fail every save. On a different host,
find the right numbers with `ls -n` on the folder and override them.

## Repository settings

Secrets, which the `oc-pomello` workflow already uses:

- `DEPLOY_SSH_KEY`
- `TS_OAUTH_CLIENT_ID`
- `TS_OAUTH_SECRET`

No variables are needed: the id defaults to 1027:65536 everywhere. Set
`PM_UID` and `PM_GID` as repository variables only when deploying somewhere
else.

## Ports

`10072` is a guess at a free port; pomello holds `10071`. Check with:

```sh
netstat -tlnp 2>/dev/null | grep 1007
```

If it is taken, change `PM_PORT` in `.env` and the url in
`traefik/dynamic/patchmemory.yml` together.

## First deploy

Seeding fills the data folder from the bank in the image the first time it runs,
and records which patches it has placed. After that the folder is the truth: a
factory patch deleted there stays deleted across restarts and redeploys, while
one added to the repo in a later build does arrive.
