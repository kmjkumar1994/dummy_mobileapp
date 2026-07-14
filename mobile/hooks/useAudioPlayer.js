/**
 * useAudioPlayer.js
 *
 * Shared in-app playback for converted audio files (WAV / MP3).
 *
 * Only ONE sound can play at a time across the whole app. This is done with
 * a module-level singleton (activeSound / activeUri) rather than per-component
 * state, so that pressing play on a row in one screen (e.g. audio-converter)
 * correctly stops a file that was left playing on another screen
 * (e.g. converted-files) — and every component using this hook stays in sync
 * via the `listeners` broadcast.
 *
 * Usage:
 *   const player = useAudioPlayer();
 *   player.play(uri)                     // play, or toggle pause/resume if already loaded
 *   player.seek(uri, ms)                 // jump to an absolute position (loads file if needed)
 *   player.seekBy(uri, deltaMs)          // relative jump, e.g. +10000 / -10000 for FF/RW
 *   player.setRate(uri, rate)            // playback speed, e.g. 0.5 / 1 / 1.5 / 2
 *   player.playRange(uri, startMs, endMs) // play only [start,end), auto-pausing at endMs
 *   player.stop(uri)                     // stop + unload
 *
 *   player.playingUri     — uri of the currently loaded file (or null)
 *   player.isPlaying       — is it actively playing right now
 *   player.isLoading       — is a load in progress
 *   player.positionMillis  — current playback position (only meaningful while loaded)
 *   player.durationMillis  — total duration (only meaningful once loaded)
 *   player.rate            — current playback speed multiplier (default 1)
 */

import { useCallback, useEffect, useState } from 'react';
import { Audio } from 'expo-av';

let activeSound = null;
let activeUri = null;
let activeRangeEnd = null; // millis — if set, playback auto-pauses once position reaches this
const listeners = new Set();

function broadcast(update) {
  listeners.forEach((cb) => cb(update));
}

function onStatusUpdate(uri, status) {
  if (!status.isLoaded) return;
  broadcast({
    uri,
    isPlaying: status.isPlaying,
    isLoading: false,
    positionMillis: status.positionMillis || 0,
    durationMillis: status.durationMillis || 0,
    rate: status.rate || 1,
  });

  if (activeRangeEnd != null && status.positionMillis >= activeRangeEnd) {
    activeRangeEnd = null;
    if (activeSound) {
      activeSound.pauseAsync().catch(() => {});
    }
    broadcast({ uri, isPlaying: false });
  }

  if (status.didJustFinish) {
    unloadActive();
  }
}

async function unloadActive() {
  const sound = activeSound;
  const uri = activeUri;
  activeSound = null;
  activeUri = null;
  activeRangeEnd = null;
  if (sound) {
    try {
      await sound.stopAsync();
    } catch {
      // ignore — sound may already be stopped/unloaded
    }
    try {
      await sound.unloadAsync();
    } catch {
      // ignore
    }
  }
  if (uri) {
    broadcast({ uri, isPlaying: false, isLoading: false, positionMillis: 0, durationMillis: 0, rate: 1 });
  }
}

/**
 * Loads `uri` fresh (unloading whatever was active first) and applies
 * `initialStatus` (e.g. { shouldPlay: true, positionMillis: 10000, rate: 1.5 }).
 */
async function loadSound(uri, initialStatus) {
  await unloadActive();
  broadcast({
    uri,
    isPlaying: false,
    isLoading: true,
    positionMillis: initialStatus.positionMillis || 0,
    durationMillis: 0,
    rate: initialStatus.rate || 1,
  });

  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldCorrectPitch: true, ...initialStatus },
      (status) => onStatusUpdate(uri, status)
    );
    activeSound = sound;
    activeUri = uri;
    await sound.setProgressUpdateIntervalMillis(200);
  } catch (err) {
    broadcast({ uri, isPlaying: false, isLoading: false });
    throw err;
  }
}

export function useAudioPlayer() {
  const [state, setState] = useState({
    uri: null,
    isPlaying: false,
    isLoading: false,
    positionMillis: 0,
    durationMillis: 0,
    rate: 1,
  });

  useEffect(() => {
    const onUpdate = (update) => {
      setState((prev) => ({ ...prev, ...update }));
    };
    listeners.add(onUpdate);
    return () => listeners.delete(onUpdate);
  }, []);

  /** Play `uri`. If it's already loaded, this toggles pause/resume instead. */
  const play = useCallback(async (uri) => {
    if (!uri) return;
    activeRangeEnd = null;

    if (activeUri === uri && activeSound) {
      try {
        const status = await activeSound.getStatusAsync();
        if (!status.isLoaded) return;
        if (status.isPlaying) {
          await activeSound.pauseAsync();
          broadcast({ uri, isPlaying: false, isLoading: false });
        } else {
          await activeSound.playAsync();
          broadcast({ uri, isPlaying: true, isLoading: false });
        }
      } catch {
        await unloadActive();
      }
      return;
    }

    await loadSound(uri, { shouldPlay: true });
  }, []);

  /** Jump to an absolute position in milliseconds. Loads the file first if needed. */
  const seek = useCallback(async (uri, positionMillis) => {
    if (!uri) return;
    activeRangeEnd = null;
    const target = Math.max(0, Math.round(positionMillis));

    if (activeUri === uri && activeSound) {
      try {
        await activeSound.setPositionAsync(target);
        broadcast({ uri, positionMillis: target });
      } catch {
        // ignore — a stray seek on a sound mid-teardown isn't worth surfacing
      }
      return;
    }

    await loadSound(uri, { shouldPlay: true, positionMillis: target });
  }, []);

  /** Relative jump — positive to fast-forward, negative to rewind. */
  const seekBy = useCallback(async (uri, deltaMillis) => {
    if (!uri) return;
    activeRangeEnd = null;

    if (activeUri === uri && activeSound) {
      try {
        const status = await activeSound.getStatusAsync();
        if (!status.isLoaded) return;
        const duration = status.durationMillis || Number.MAX_SAFE_INTEGER;
        const target = Math.min(Math.max(0, (status.positionMillis || 0) + deltaMillis), duration);
        await activeSound.setPositionAsync(target);
        broadcast({ uri, positionMillis: target });
      } catch {
        // ignore
      }
      return;
    }

    // Not currently loaded — start playback at the offset (from 0).
    const start = Math.max(0, deltaMillis);
    await loadSound(uri, { shouldPlay: true, positionMillis: start });
  }, []);

  /** Set playback speed, e.g. 0.5 / 1 / 1.5 / 2. Loads the file (paused) if needed. */
  const setRate = useCallback(async (uri, rate) => {
    if (!uri) return;

    if (activeUri === uri && activeSound) {
      try {
        await activeSound.setRateAsync(rate, true);
        broadcast({ uri, rate });
      } catch {
        // ignore
      }
      return;
    }

    await loadSound(uri, { shouldPlay: false, rate });
  }, []);

  /**
   * Play only the [startMillis, endMillis) window, auto-pausing once it's
   * reached. Always restarts from startMillis, even if already playing.
   * Used to preview a single edited segment before saving.
   */
  const playRange = useCallback(async (uri, startMillis, endMillis) => {
    if (!uri) return;
    activeRangeEnd = Math.max(0, endMillis);
    const start = Math.max(0, startMillis);

    if (activeUri === uri && activeSound) {
      try {
        await activeSound.setPositionAsync(start);
        await activeSound.playAsync();
        broadcast({ uri, isPlaying: true, positionMillis: start });
      } catch {
        await loadSound(uri, { shouldPlay: true, positionMillis: start });
      }
      return;
    }

    await loadSound(uri, { shouldPlay: true, positionMillis: start });
  }, []);

  const stop = useCallback(async (uri) => {
    if (!uri || activeUri === uri) {
      await unloadActive();
    }
  }, []);

  return {
    playingUri: state.uri,
    isPlaying: state.isPlaying,
    isLoading: state.isLoading,
    positionMillis: state.positionMillis,
    durationMillis: state.durationMillis,
    rate: state.rate,
    play,
    seek,
    seekBy,
    setRate,
    playRange,
    stop,
  };
}
