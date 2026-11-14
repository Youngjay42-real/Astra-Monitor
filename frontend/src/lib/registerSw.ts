/** Register the lightweight PWA service worker when supported. */
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      // Drop stale v1 workers that cached old HTML without the rocket intro.
      return Promise.all(regs.map((reg) => reg.update()))
    }).finally(() => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        /* Offline shell is best-effort; ignore registration failures. */
      })
    })
  })
}
