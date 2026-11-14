import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '../api/client'

export function useResource<T>(loader: (signal?: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const active = useRef<AbortController | null>(null)
  const reload = useCallback(async () => {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    setLoading(true)
    setError('')
    try { const result = await loader(controller.signal); if (!controller.signal.aborted) setData(result) }
    catch (cause) { if (!controller.signal.aborted) setError(errorMessage(cause)) }
    finally { if (!controller.signal.aborted) setLoading(false) }
  }, [loader])
  useEffect(() => { void reload(); return () => active.current?.abort() }, [reload])
  return { data, error, loading, reload }
}
