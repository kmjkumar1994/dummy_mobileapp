/**
 * useShareIntent.js
 *
 * Handles Android Share Intent end-to-end:
 *
 *   Cold start delivery (race-condition fix)
 *   ─────────────────────────────────────────
 *   After registering the DeviceEventEmitter listener, we immediately call
 *   NativeModules.ShareIntentModule.getPendingIntent().  This pulls any
 *   intent that MainActivity stored before the JS bridge was ready — the
 *   event that was fired into empty air because no listener existed yet.
 *
 *   Foreground / background delivery
 *   ──────────────────────────────────
 *   DeviceEventEmitter fires while the listener is already registered,
 *   so delivery is immediate.  getPendingIntent() returns null (already
 *   cleared) so there is no double-processing.
 *
 *   Auth guard
 *   ───────────
 *   router.navigate() is deferred until isLoading === false so the
 *   auth redirect in app/index.js cannot overwrite the navigation.
 */

import { useEffect, useRef, useCallback } from 'react';
import { DeviceEventEmitter, NativeModules, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useShareIntentContext } from '../context/ShareIntentContext';
import {
  validateSharedFile,
  copySharedFileToStaging,
  ensureAudioExtensionFromMime,
  extractFileName,
} from '../services/shareIntentService';

// ─── constants ────────────────────────────────────────────────────────────────

const CONVERTER_ROUTE    = '/tabs/tools/audio-converter';
const SHARE_INTENT_EVENT = 'ShareIntentReceived';
const TAG = '[ShareIntent]';

// Navigation retry — waits for auth + navigator to be ready
const NAV_RETRY_INTERVAL_MS  = 150;
const NAV_RETRY_MAX_ATTEMPTS = 40;   // 6 seconds max

// ─── hook ─────────────────────────────────────────────────────────────────────

export function useShareIntent() {
  const router = useRouter();
  const { isLoading: authLoading } = useAuth();

  const {
    status,
    error,
    hasFile,
    pendingFile,
    startReceiving,
    setSharedFile,
    setError,
    clear,
    isProcessing,
  } = useShareIntentContext();

  const lastHandledUriRef = useRef(null);
  const navRetryTimerRef  = useRef(null);

  // Keep a ref to authLoading so the nav retry closure always reads fresh value
  const authLoadingRef = useRef(authLoading);
  useEffect(() => { authLoadingRef.current = authLoading; }, [authLoading]);

  // ── navigation ─────────────────────────────────────────────────────────────
  const navigateToConverter = useCallback(() => {
    if (navRetryTimerRef.current) {
      clearInterval(navRetryTimerRef.current);
      navRetryTimerRef.current = null;
    }

    let attempts = 0;
    console.log(`${TAG} Navigation retry loop starting → ${CONVERTER_ROUTE}`);

    navRetryTimerRef.current = setInterval(() => {
      attempts++;

      // Wait until auth state is resolved so index.js redirect doesn't win
      if (authLoadingRef.current) {
        console.log(`${TAG} Nav attempt #${attempts} — auth still loading, waiting…`);
        return;
      }

      try {
        router.navigate(CONVERTER_ROUTE);
        console.log(`${TAG} Navigation accepted on attempt #${attempts} ✓`);
        clearInterval(navRetryTimerRef.current);
        navRetryTimerRef.current = null;
      } catch (e) {
        console.log(`${TAG} Navigation attempt #${attempts} not ready: ${e?.message}`);
      }

      if (attempts >= NAV_RETRY_MAX_ATTEMPTS) {
        console.warn(`${TAG} Navigation gave up after ${attempts} attempts. File stays in context.`);
        clearInterval(navRetryTimerRef.current);
        navRetryTimerRef.current = null;
      }
    }, NAV_RETRY_INTERVAL_MS);
  }, [router]);

  // ── core pipeline ──────────────────────────────────────────────────────────
  /**
   * Process a raw { uri, mimeType } payload from either:
   *   - DeviceEventEmitter (foreground/background)
   *   - getPendingIntent() pull (cold start)
   */
  const processSharePayload = useCallback(async ({ uri: rawUri, mimeType: rawMime }) => {
    console.log(`${TAG} processSharePayload  uri=${rawUri}  mime="${rawMime}"`);

    if (!rawUri) {
      console.warn(`${TAG} No URI — aborting`);
      return;
    }

    // Dedup guard
    if (lastHandledUriRef.current === rawUri) {
      console.log(`${TAG} Duplicate URI — already handled`);
      return;
    }
    if (isProcessing()) {
      console.log(`${TAG} Another share in flight — skipping`);
      return;
    }

    lastHandledUriRef.current = rawUri;
    startReceiving();

    try {
      // 1. Validate
      const validationError = validateSharedFile({ uri: rawUri, mimeType: rawMime });
      if (validationError) throw new Error(validationError);
      console.log(`${TAG} Validation passed ✓`);

      // 2. Filename
      const rawName     = extractFileName(rawUri);
      const nameWithExt = ensureAudioExtensionFromMime(rawName, rawMime);
      console.log(`${TAG} File name: ${nameWithExt}`);

      // 3. Stage file
      console.log(`${TAG} Staging from: ${rawUri}`);
      const { localUri, size } = await copySharedFileToStaging(rawUri, nameWithExt);
      console.log(`${TAG} Staged → ${localUri}  (${size} bytes)`);

      // 4. Build SharedFile
      const mimeType = rawMime || guessMimeFromName(nameWithExt);
      const sharedFile = {
        uri:      localUri,
        name:     nameWithExt,
        mimeType: mimeType || 'application/octet-stream',
        size,
        source:   'share',
      };
      console.log(`${TAG} SharedFile ready:`, JSON.stringify(sharedFile));

      // 5. Store in context
      setSharedFile(sharedFile);
      console.log(`${TAG} Context → status=ready`);

      // 6. Navigate (auth-aware retry)
      navigateToConverter();

    } catch (err) {
      console.error(`${TAG} Pipeline error: ${err?.message}`);
      lastHandledUriRef.current = null;
      setError(err?.message || 'Could not import the shared file.');
      Alert.alert(
        'Could not import file',
        err?.message || 'Could not import the shared file.',
        [{ text: 'OK', onPress: () => { lastHandledUriRef.current = null; clear(); } }],
        { cancelable: true },
      );
    }
  }, [isProcessing, startReceiving, setSharedFile, setError, clear, navigateToConverter]);

  // ── DeviceEventEmitter handler (foreground / background) ──────────────────
  const handleShareEvent = useCallback((event) => {
    console.log(`${TAG} DeviceEventEmitter fired:`, JSON.stringify(event));
    processSharePayload({
      uri:      event?.uri      || null,
      mimeType: event?.mimeType || '',
    });
  }, [processSharePayload]);

  // ── listener registration + cold-start pull ────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    // 1. Register live listener first
    console.log(`${TAG} Registering DeviceEventEmitter listener`);
    const subscription = DeviceEventEmitter.addListener(SHARE_INTENT_EVENT, handleShareEvent);
    console.log(`${TAG} Listener registered ✓`);

    // 2. Pull any intent that arrived before this listener existed (cold start)
    const ShareIntentModule = NativeModules.ShareIntentModule;
    if (ShareIntentModule?.getPendingIntent) {
      console.log(`${TAG} Calling getPendingIntent() for cold-start data`);
      ShareIntentModule.getPendingIntent()
        .then((pending) => {
          if (pending?.uri) {
            console.log(`${TAG} Cold-start pending intent found: uri=${pending.uri}`);
            // The DeviceEventEmitter may have already delivered this via the
            // addReactInstanceEventListener path.  processSharePayload's dedup
            // guard (lastHandledUriRef) ensures we don't process it twice.
            processSharePayload({
              uri:      pending.uri,
              mimeType: pending.mimeType || '',
            });
          } else {
            console.log(`${TAG} No cold-start pending intent`);
          }
        })
        .catch((e) => {
          console.warn(`${TAG} getPendingIntent error: ${e?.message}`);
        });
    } else {
      console.warn(`${TAG} ShareIntentModule not found — rebuild required`);
    }

    return () => {
      console.log(`${TAG} Removing listener`);
      subscription.remove();
      if (navRetryTimerRef.current) {
        clearInterval(navRetryTimerRef.current);
        navRetryTimerRef.current = null;
      }
    };
  }, [handleShareEvent, processSharePayload]);

  // ── public API ─────────────────────────────────────────────────────────────
  const dismiss = useCallback(() => {
    lastHandledUriRef.current = null;
    clear();
  }, [clear]);

  return { status, error, hasFile, pendingFile, dismiss };
}

// ─── local helper ─────────────────────────────────────────────────────────────

function guessMimeFromName(fileName) {
  const ext = (fileName || '').toLowerCase().split('.').pop();
  const map = {
    opus: 'audio/opus',
    ogg:  'audio/ogg',
    aac:  'audio/aac',
    mp3:  'audio/mpeg',
    mp4:  'audio/mp4',
    m4a:  'audio/mp4',
    wav:  'audio/wav',
  };
  return map[ext] || null;
}
