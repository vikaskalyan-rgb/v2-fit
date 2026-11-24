/** Looks for a newer copy of the app and switches to it, without waiting for the "Update available" popup. */
export type UpdateResult = 'updating' | 'latest' | 'unsupported'

export async function checkForUpdate(): Promise<UpdateResult> {
  if (!('serviceWorker' in navigator)) return 'unsupported'
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return 'unsupported'
  await reg.update().catch(() => undefined)
  // A new version may still be installing: give it a few seconds.
  for (let i = 0; i < 20 && !reg.waiting && reg.installing; i++) await new Promise((r) => setTimeout(r, 400))
  if (!reg.waiting) return 'latest'
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true })
  reg.waiting.postMessage({ type: 'SKIP_WAITING' })
  setTimeout(() => location.reload(), 3000)   // safety net if the browser never fires controllerchange
  return 'updating'
}

/** Last resort: throws away the saved app files and downloads them again. Your data (workouts, meals, weights) is not touched. */
export async function forceRefresh(): Promise<void> {
  const regs = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : []
  await Promise.all(regs.map((r) => r.unregister()))
  if ('caches' in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)))
  location.reload()
}
