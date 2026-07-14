/**
 * ShareIntentContext.js
 *
 * Global state for the Android Share Intent lifecycle.
 *
 * States:
 *   idle        → no file pending
 *   receiving   → copying file from content:// URI into staging
 *   ready       → file is staged and waiting for the converter screen to pick it up
 *   processed   → converter screen consumed the file (safe to clear)
 *   error       → something went wrong (error message available)
 *
 * The context is intentionally minimal — UI logic lives in useShareIntent.
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
} from 'react';

// ─── context ─────────────────────────────────────────────────────────────────

const ShareIntentContext = createContext(null);

// ─── reducer ─────────────────────────────────────────────────────────────────

const ACTIONS = {
  RECEIVING:  'RECEIVING',
  SET_FILE:   'SET_FILE',
  PROCESSED:  'PROCESSED',
  SET_ERROR:  'SET_ERROR',
  CLEAR:      'CLEAR',
};

const initialState = {
  pendingFile: null,
  status: 'idle',      // 'idle' | 'receiving' | 'ready' | 'processed' | 'error'
  error: null,
};

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.RECEIVING:
      return { ...state, status: 'receiving', error: null };

    case ACTIONS.SET_FILE:
      return {
        pendingFile: action.payload,
        status: 'ready',
        error: null,
      };

    case ACTIONS.PROCESSED:
      // Keep the file reference until explicitly cleared so the screen can
      // still display the file name after import.
      return { ...state, status: 'processed' };

    case ACTIONS.SET_ERROR:
      return {
        ...state,
        status: 'error',
        error: action.payload,
      };

    case ACTIONS.CLEAR:
      return { ...initialState };

    default:
      return state;
  }
}

// ─── provider ────────────────────────────────────────────────────────────────

export function ShareIntentProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Guard against duplicate processing when the component re-renders between
  // the time a share intent is received and when it's consumed by the screen.
  const processingRef = useRef(false);

  const startReceiving = useCallback(() => {
    processingRef.current = true;
    dispatch({ type: ACTIONS.RECEIVING });
  }, []);

  const setSharedFile = useCallback((file) => {
    processingRef.current = false;
    dispatch({ type: ACTIONS.SET_FILE, payload: file });
  }, []);

  const markProcessed = useCallback(() => {
    dispatch({ type: ACTIONS.PROCESSED });
  }, []);

  const setError = useCallback((message) => {
    processingRef.current = false;
    dispatch({ type: ACTIONS.SET_ERROR, payload: message });
  }, []);

  const clear = useCallback(() => {
    processingRef.current = false;
    dispatch({ type: ACTIONS.CLEAR });
  }, []);

  const isProcessing = useCallback(() => processingRef.current, []);

  const value = {
    // state
    pendingFile: state.pendingFile,
    status:      state.status,
    error:       state.error,
    hasFile:     state.status === 'ready' && state.pendingFile !== null,
    // actions
    startReceiving,
    setSharedFile,
    markProcessed,
    setError,
    clear,
    isProcessing,
  };

  return (
    <ShareIntentContext.Provider value={value}>
      {children}
    </ShareIntentContext.Provider>
  );
}

// ─── hook ────────────────────────────────────────────────────────────────────

export function useShareIntentContext() {
  const ctx = useContext(ShareIntentContext);
  if (!ctx) {
    throw new Error('useShareIntentContext must be used within a ShareIntentProvider');
  }
  return ctx;
}
