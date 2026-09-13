// Express 4 ignores the promise returned by an `async (req, res) => {}`
// handler, so a rejection (Prisma error, bad JSON.parse, …) never reaches
// the error middleware — the client just waits until it times out. This
// wraps Router/app verb methods once at startup so any rejected handler
// is forwarded to next(err), giving the frontend a proper JSON 500.
// (Express 5 does this natively; this keeps the current express@4 pin.)
import { Router } from 'express'
import type { RequestHandler } from 'express'

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'all', 'use'] as const

function wrap(fn: any): any {
  if (typeof fn !== 'function' || fn.length >= 4) return fn // skip error handlers
  return function wrapped(this: any, req: any, res: any, next: any) {
    try {
      const out = fn.call(this, req, res, next)
      if (out && typeof out.then === 'function') out.catch(next)
      return out
    } catch (err) {
      next(err)
    }
  }
}

function wrapArgs(args: any[]): any[] {
  return args.map(a => (Array.isArray(a) ? a.map(wrap) : wrap(a)))
}

// Router() returns a function whose prototype chain is express's `proto`
// (the same object app.get/post/... delegate to via Router in express 4),
// so patching it once covers every router created afterwards.
// `app.get()` bypasses Router.get and talks to Route directly, so Route's
// prototype is patched too (`Router().route('/')` exposes it).
const routerProto = Object.getPrototypeOf(Router()) as Record<string, any>
const routeProto = Object.getPrototypeOf(Router().route('/__probe__')) as Record<string, any>

function patch(target: Record<string, any>, methods: readonly string[]) {
  for (const m of methods) {
    const orig = target[m]
    if (typeof orig !== 'function' || orig.__asyncWrapped) continue
    const patched = function (this: any, ...args: any[]) {
      return orig.apply(this, wrapArgs(args))
    } as any
    patched.__asyncWrapped = true
    target[m] = patched
  }
}
patch(routerProto, METHODS)
patch(routeProto, METHODS.filter(m => m !== 'use'))

export type { RequestHandler }
