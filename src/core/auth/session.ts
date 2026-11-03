interface UserSession {
  userId: number
  lastActivityAt: number
  isLocked: boolean
  pendingFlow?: string
  flowState?: Record<string, unknown>
}

export class SessionManager {
  private readonly sessions = new Map<number, UserSession>()

  getOrCreate(userId: number): UserSession {
    const existing = this.sessions.get(userId)
    if (existing) return existing
    const session: UserSession = {
      userId,
      lastActivityAt: Date.now(),
      isLocked: false,
    }
    this.sessions.set(userId, session)
    return session
  }

  touch(userId: number): void {
    const session = this.getOrCreate(userId)
    session.lastActivityAt = Date.now()
  }

  lock(userId: number): void {
    const session = this.getOrCreate(userId)
    session.isLocked = true
  }

  unlock(userId: number): void {
    const session = this.getOrCreate(userId)
    session.isLocked = false
  }

  isLocked(userId: number): boolean {
    return this.getOrCreate(userId).isLocked
  }

  setPendingFlow(userId: number, flow: string, state?: Record<string, unknown>): void {
    const session = this.getOrCreate(userId)
    session.pendingFlow = flow
    session.flowState = state ?? {}
  }

  clearFlow(userId: number): void {
    const session = this.getOrCreate(userId)
    delete session.pendingFlow
    delete session.flowState
  }

  getFlowState(userId: number): { flow: string; state: Record<string, unknown> } | null {
    const session = this.getOrCreate(userId)
    if (!session.pendingFlow) return null
    return { flow: session.pendingFlow, state: session.flowState ?? {} }
  }

  checkIdleTimeout(idleMs: number): void {
    const now = Date.now()
    for (const session of this.sessions.values()) {
      if (!session.isLocked && now - session.lastActivityAt > idleMs) {
        session.isLocked = true
      }
    }
  }
}

export const sessionManager = new SessionManager()
