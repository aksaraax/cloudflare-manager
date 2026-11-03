import { type Context, type MiddlewareFn } from 'telegraf'

const WINDOW_MS = 60_000
const MAX_COMMANDS = 30

const timestamps = new Map<number, number[]>()

export const rateLimitMiddleware: MiddlewareFn<Context> = async (ctx, next) => {
  const userId = ctx.from?.id
  if (!userId) {
    await next()
    return
  }

  const now = Date.now()
  const windowStart = now - WINDOW_MS
  const userTs = (timestamps.get(userId) ?? []).filter((t) => t > windowStart)

  if (userTs.length >= MAX_COMMANDS) {
    const oldestInWindow = userTs[0] ?? now
    const resetInMs = WINDOW_MS - (now - oldestInWindow)
    const resetInSec = Math.ceil(resetInMs / 1000)
    await ctx.reply(`⏳ Too many commands. Please wait ${resetInSec}s.`, {
      parse_mode: 'HTML',
    })
    return
  }

  userTs.push(now)
  timestamps.set(userId, userTs)
  await next()
}
