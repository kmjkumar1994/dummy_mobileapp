/**
 * ShareIntentHandler.js  —  DEBUG BUILD
 *
 * Renderless root-level component that mounts useShareIntent.
 * Logs on mount/unmount so you can confirm it's in the tree.
 */

import { useEffect } from 'react';
import { useShareIntent } from '../hooks/useShareIntent';

export default function ShareIntentHandler() {
  useShareIntent();

  useEffect(() => {
    console.log('[ShareIntent] ShareIntentHandler mounted ✓');
    return () => {
      console.log('[ShareIntent] ShareIntentHandler unmounted');
    };
  }, []);

  return null;
}
