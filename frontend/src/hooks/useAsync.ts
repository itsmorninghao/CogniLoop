import { useState, useEffect, useCallback, type DependencyList } from 'react'

interface AsyncState<T> {
    data: T | null
    loading: boolean
    error: Error | null
    refetch: () => void
}

export function useAsync<T>(
    fn: () => Promise<T>,
    deps: DependencyList,
): AsyncState<T> {
    const [data, setData] = useState<T | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<Error | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)

    const refetch = useCallback(() => setRefreshKey(k => k + 1), [])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        fn()
            .then(result => { if (!cancelled) { setData(result); setLoading(false) } })
            .catch(err => { if (!cancelled) { setError(err as Error); setLoading(false) } })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, refreshKey])

    return { data, loading, error, refetch }
}
