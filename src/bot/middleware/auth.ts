import { type Context, type MiddlewareFn } from 'telegraf'
import { isAllowed, hashUserId } from '../../core/auth/whitelist.js'
import { logger } from '../../core/utils/logger.js'

export const authMiddleware: MiddlewareFn<Context> = async (ctx, next) => {
  const userId = ctx.from?.id
  if (!userId) {
    logger.warn('auth: message without user id dropped')
    return
  }
  if (!isAllowed(userId)) {
    logger.warn('auth: unauthorized access attempt', { userHash: hashUserId(userId) })
    return
  }
  await next()
}
