import { useState, useCallback } from 'react';

/**
 * Generic hook for making API calls with loading and error state management.
 * @param {Function} apiFunction - The async API function to call
 * @returns {{ execute, loading, error, data, reset }}
 */
export function useApi(apiFunction) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const execute = useCallback(
    async (...args) => {
      try {
        setLoading(true);
        setError(null);
        const result = await apiFunction(...args);
        setData(result);
        return result;
      } catch (err) {
        const message = err.message || 'An unexpected error occurred';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [apiFunction]
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(null);
  }, []);

  return { execute, loading, error, data, reset };
}
