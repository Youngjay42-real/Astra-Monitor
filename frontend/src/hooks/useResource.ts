import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '../api/client'

type ReloadOptions = { silent?: boolean }

export function useResource<T>(
  loader: (signal?: AbortSignal) => Promise<T>,
  options?: { pollMs?: number },
) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const active = useRef<AbortController | null>(null)
  const pollMs = options?.pollMs

  const reload = useCallback(async (reloadOptions?: ReloadOptions) => {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    const silent = reloadOptions?.silent === true
    if (!silent) {
      setLoading(true)
      setError('')
    }
    try {
      const result = await loader(controller.signal)
      if (!controller.signal.aborted) {
        setData(result)
        if (silent) setError('')
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorMessage(cause))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [loader])

  useEffect(() => {
    void reload()
    if (!pollMs || pollMs < 1000) {
      return () => active.current?.abort()
    }
    const id = window.setInterval(() => {
      void reload({ silent: true })
    }, pollMs)
    return () => {
      active.current?.abort()
      window.clearInterval(id)
    }
  }, [reload, pollMs])

  return { data, error, loading, reload }
}
