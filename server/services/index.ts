import { systemIdentity } from '../../src/patch/schema.ts'
import type { AuthConfig } from '../identity.ts'
import type { Limits } from '../limits.ts'
import type { Repositories } from '../repositories/index.ts'
import { createAccess } from './access.ts'
import { createArrangementService } from './arrangements.ts'
import { createPatchService, type Identity } from './patches.ts'
import { createTagService } from './tags.ts'

/* A service exists where there are rules to keep in one place — who may write a
   patch, what a tag may be called. A route with no rules of its own reads its
   repository directly rather than going through a service that would only
   forward the call, which is why there is no library or settings service. */

export interface ServiceOptions {
  readonly repositories: Repositories
  readonly config: AuthConfig
  readonly limits: Limits
  readonly identity?: Identity
}

export function createServices({
  repositories,
  config,
  limits,
  identity = systemIdentity,
}: ServiceOptions) {
  return {
    repositories,
    config,
    limits,
    access: createAccess(repositories, config),
    patches: createPatchService(repositories, limits, identity),
    tags: createTagService(repositories),
    arrangements: createArrangementService(repositories, limits, identity),
  }
}

export type Services = ReturnType<typeof createServices>
