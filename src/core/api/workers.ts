import { ApiError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { withRetry } from '../utils/retry.js'
import { getClient } from './client.js'

export interface WorkerRoute {
  id: string
  pattern: string
  enabled: boolean
}

export interface WorkerInfo {
  id: string
  name: string
  createdOn: string
  modifiedOn: string
  routes: WorkerRoute[]
}

export function mapRoute(r: Record<string, unknown>): WorkerRoute {
  return {
    id: String(r['id'] ?? ''),
    pattern: String(r['pattern'] ?? ''),
    enabled: r['script'] !== undefined && r['script'] !== null && r['script'] !== '',
  }
}

function mapWorker(w: Record<string, unknown>, routes: WorkerRoute[] = []): WorkerInfo {
  const nameOrId = String(w['id'] ?? w['script_name'] ?? '')
  return {
    id: nameOrId,
    name: nameOrId,
    createdOn: String(w['created_on'] ?? ''),
    modifiedOn: String(w['modified_on'] ?? ''),
    routes,
  }
}

export async function listWorkers(apiToken: string, accountId: string): Promise<WorkerInfo[]> {
  return withRetry(async () => {
    try {
      const client = getClient(apiToken)
      const result = await client.workers.scripts.list({ account_id: accountId })
      const raw = Array.isArray(result)
        ? result
        : ((result as unknown as { result: unknown[] }).result ?? [])
      return (raw as Record<string, unknown>[]).map((w) => mapWorker(w))
    } catch (err) {
      throw new ApiError(
        'WORKERS_LIST_FAILED',
        `Failed to list workers for account ${accountId}`,
        undefined,
        undefined,
        err,
      )
    }
  })
}

export async function getWorker(
  apiToken: string,
  accountId: string,
  workerName: string,
): Promise<WorkerInfo> {
  return withRetry(async () => {
    try {
      const client = getClient(apiToken)
      const scriptResult = await client.workers.scripts.get(workerName, {
        account_id: accountId,
      })
      const rawScript = scriptResult as unknown as Record<string, unknown>
      return mapWorker({ ...rawScript, id: workerName }, [])
    } catch (err) {
      throw new ApiError(
        'WORKER_GET_FAILED',
        `Failed to get worker ${workerName}`,
        undefined,
        undefined,
        err,
      )
    }
  })
}

export async function deleteWorker(
  apiToken: string,
  accountId: string,
  workerName: string,
): Promise<void> {
  await withRetry(async () => {
    try {
      const client = getClient(apiToken)
      await client.workers.scripts.delete(workerName, { account_id: accountId })
      logger.info('worker deleted', { accountId, workerName })
    } catch (err) {
      throw new ApiError(
        'WORKER_DELETE_FAILED',
        `Failed to delete worker ${workerName}`,
        undefined,
        undefined,
        err,
      )
    }
  })
}

export async function enableWorkerRoute(
  apiToken: string,
  zoneId: string,
  routeId: string,
): Promise<void> {
  await withRetry(async () => {
    try {
      const client = getClient(apiToken)
      const existing = await client.get<unknown, { result: Record<string, unknown> }>(
        `/zones/${zoneId}/workers/routes/${routeId}`,
      )
      const existingRaw = existing.result ?? {}
      await client.put(`/zones/${zoneId}/workers/routes/${routeId}`, {
        body: {
          pattern: String(existingRaw['pattern'] ?? ''),
          script: String(existingRaw['script'] ?? ''),
        },
      })
      logger.info('worker route enabled', { zoneId, routeId })
    } catch (err) {
      throw new ApiError(
        'WORKER_ROUTE_ENABLE_FAILED',
        `Failed to enable worker route ${routeId}`,
        undefined,
        undefined,
        err,
      )
    }
  })
}

export async function disableWorkerRoute(
  apiToken: string,
  zoneId: string,
  routeId: string,
): Promise<void> {
  await withRetry(async () => {
    try {
      const client = getClient(apiToken)
      const existing = await client.get<unknown, { result: Record<string, unknown> }>(
        `/zones/${zoneId}/workers/routes/${routeId}`,
      )
      const existingRaw = existing.result ?? {}
      await client.put(`/zones/${zoneId}/workers/routes/${routeId}`, {
        body: {
          pattern: String(existingRaw['pattern'] ?? ''),
          script: null,
        },
      })
      logger.info('worker route disabled', { zoneId, routeId })
    } catch (err) {
      throw new ApiError(
        'WORKER_ROUTE_DISABLE_FAILED',
        `Failed to disable worker route ${routeId}`,
        undefined,
        undefined,
        err,
      )
    }
  })
}

export async function deployWorker(
  apiToken: string,
  accountId: string,
  workerName: string,
  scriptContent: string,
): Promise<void> {
  await withRetry(async () => {
    try {
      const client = getClient(apiToken)
      const fileName = `${workerName}.mjs`
      const scriptFile = new File([scriptContent], fileName, {
        type: 'application/javascript+module',
      })
      await client.workers.scripts.update(workerName, {
        account_id: accountId,
        metadata: {
          main_module: fileName,
        },
        files: [scriptFile],
      } as Parameters<typeof client.workers.scripts.update>[1])
      logger.info('worker deployed', { accountId, workerName })
    } catch (err) {
      throw new ApiError(
        'WORKER_DEPLOY_FAILED',
        `Failed to deploy worker ${workerName}`,
        undefined,
        undefined,
        err,
      )
    }
  })
}
