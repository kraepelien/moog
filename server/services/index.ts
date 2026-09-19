import { systemIdentity } from '@patch/schema.ts'
import type { AuthConfig } from '@server/identity.ts'
import type { Limits } from '@server/limits.ts'
import type { OpsLog } from '@server/ops.ts'
import type { Repositories } from '@server/repositories/index.ts'
import { createAccess } from './access.ts'
import { createArrangementService } from './arrangements.ts'
import { createPatchService, type Identity } from './patches.ts'
import { createTagService } from './tags.ts'
import { createUserService } from './users.ts'

/* A service exists where there are rules to keep in one place — who may write a
   patch, what a tag may be called. A route with no rules of its own reads its
   repository directly rather than going through a service that would only
   forward the call, which is why there is no library or settings service. */

export interface ServiceOptions {
  readonly repositories: Repositories
  readonly config: AuthConfig
  readonly limits: Limits
  readonly identity?: Identity
  readonly ops: OpsLog
}

export function createServices({
  repositories,
  config,
  limits,
  identity = systemIdentity,
  ops,
}: ServiceOptions) {
  return {
    repositories,
    config,
    limits,
    /* Not a service: there are no rules here, only a record the route reads. */
    ops,
    access: createAccess(repositories, config),
    patches: createPatchService(repositories, limits, identity),
    tags: createTagService(repositories),
    arrangements: createArrangementService(repositories, limits, identity),
    users: createUserService(repositories, config),
  }
}

export type Services = ReturnType<typeof createServices>
