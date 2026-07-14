/**
 * PlaybackBar.js
 *
 * Reusable playback control: play/pause, -10s / +10s buttons, a draggable
 * scrub bar, current/total time labels, and an optional speed toggle.
 * Drives itself off the shared `useAudioPlayer` hook so it can be dropped
 * into any row that represents a playable file.
 *
 * Two layouts:
 *  - size="compact" (default) — everything on one row. Used in list rows
 *    (converter outputs, converted-files entries).
 *  - size="large" — controls (RW/Play/FF/Speed) on their own centered row
 *    with bigger touch targets, slider + time labels on the row below.
 *    Used for the editor's main timeline.
 *
 * ── Why dragging used to fail (fixed here, at the root) ──────────────────────
 *
 * 1. Duration was unknown until the file had actually started loading, i.e.
 *    until you pressed Play once. Before that, the slider's range was
 *    effectively 0-1ms, so dragging looked completely dead. Fixed by having
 *    this component probe the file's duration itself on mount (a silent,
 *    no-playback metadata read) instead of depending on live player state.
 *
 * 2. Inside a ScrollView/FlatList, the parent can steal the touch-move
 *    gesture before the Slider's own gesture responder claims it — a classic
 *    RN nested-responder race. Reactive fixes (disabling scroll only once the
 *    slider reports a drag started) don't reliably work because that event
 *    never fires if the parent won the race first. Fixed by wrapping the
 *    Slider in a View that proactively claims the responder on first touch
 *    (onStartShouldSetResponder / onMoveShouldSetResponderCapture), which
 *    wins the negotiation before the ancestor scroll view gets a chance.
 *
 * `onDragStart`/`onDragEnd` are still exposed so a parent can *also* disable
 * its own scrolling as a second line of defense — harmless to keep, not the
 * primary fix anymore.
 *
 * Usage:
 *   const player = useAudioPlayer();
 *   <PlaybackBar player={player} uri={item.fileUri} color={Colors.primary} />
 *   <PlaybackBar player={player} uri={fileUri} size="large" showSpeed />
 */

import React, { useCallback, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';

const SKIP_MS = 10000;
const SPEED_CYCLE = [1, 1.5, 2, 0.5];

function formatTime(ms) {
  if (!ms || ms < 0 || !isFinite(ms)) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatRate(rate) {
  const r = rate || 1;
  return `${r}x`;
}

export default function PlaybackBar({
  player,
  uri,
  color = '#3B82F6',
  trackColor = '#E2E8F0',
  disabled = false,
  size = 'compact',
  showSpeed = false,
  knownDurationMillis = 0,
  onDragStart,
  onDragEnd,
}) {
  const isActive  = player.playingUri === uri;
  const isPlaying = isActive && player.isPlaying;
  const isLoading = isActive && player.isLoading;
  const rate      = isActive ? (player.rate || 1) : 1;

  // ── self-probe duration so the slider has a real range immediately, ────────
  // ── even before the file has ever been played ───────────────────────────────
  const [probedDurationMillis, setProbedDurationMillis] = useState(0);
  useEffect(() => {
    let mounted = true;
    if (knownDurationMillis > 0 || !uri) return undefined; // caller already knows it
    (async () => {
      let sound = null;
      try {
        const result = await Audio.Sound.createAsync({ uri }, { shouldPlay: false });
        sound = result.sound;
        const dur = result.status?.durationMillis || 0;
        if (mounted && dur > 0) setProbedDurationMillis(dur);
      } catch {
        // ignore — falls back to whatever the live player reports once loaded
      } finally {
        if (sound) {
          try { await sound.unloadAsync(); } catch { /* ignore */ }
        }
      }
    })();
    return () => { mounted = false; };
  }, [uri, knownDurationMillis]);

  const fallbackDuration = knownDurationMillis || probedDurationMillis;
  const duration = isActive ? (player.durationMillis || fallbackDuration) : fallbackDuration;

  // While the user is actively dragging, show the drag value instead of the
  // broadcasted position so the thumb doesn't jump/fight the finger.
  const [dragValue, setDragValue] = useState(null);
  const position = dragValue != null ? dragValue : (isActive ? player.positionMillis : 0);
  const sliderMax = duration > 0 ? duration : 1;

  const handlePlayPause = useCallback(() => {
    player.play(uri);
  }, [player, uri]);

  const handleRewind = useCallback(() => {
    player.seekBy(uri, -SKIP_MS);
  }, [player, uri]);

  const handleForward = useCallback(() => {
    player.seekBy(uri, SKIP_MS);
  }, [player, uri]);

  const handleSlidingStart = useCallback(() => {
    onDragStart?.();
  }, [onDragStart]);

  const handleSlidingComplete = useCallback((value) => {
    setDragValue(null);
    player.seek(uri, value);
    onDragEnd?.();
  }, [player, uri, onDragEnd]);

  const handleCycleSpeed = useCallback(() => {
    const idx = SPEED_CYCLE.indexOf(rate);
    const next = SPEED_CYCLE[(idx + 1) % SPEED_CYCLE.length];
    player.setRate(uri, next);
  }, [player, uri, rate]);

  const large = size === 'large';
  const playSize = large ? 34 : 18;
  const skipSize = large ? 24 : 16;
  const btnStyle = large ? styles.iconBtnLarge : styles.iconBtn;
  const playBtnStyle = large ? styles.playBtnLarge : styles.playBtn;

  // Claims the touch gesture immediately on contact so an ancestor
  // ScrollView/FlatList can't intercept the drag before the Slider does.
  const responderProps = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onStartShouldSetResponderCapture: () => true,
    onMoveShouldSetResponderCapture: () => true,
  };

  const renderSlider = (sliderStyle) => (
    <View style={styles.sliderWrap} {...responderProps}>
      <Slider
        style={sliderStyle}
        minimumValue={0}
        maximumValue={sliderMax}
        value={Math.min(position, sliderMax)}
        minimumTrackTintColor={color}
        maximumTrackTintColor={trackColor}
        thumbTintColor={color}
        disabled={disabled}
        onSlidingStart={handleSlidingStart}
        onValueChange={setDragValue}
        onSlidingComplete={handleSlidingComplete}
      />
    </View>
  );

  const controls = (
    <View style={large ? styles.controlsRowLarge : styles.row}>
      <TouchableOpacity
        onPress={handleRewind}
        disabled={disabled}
        style={btnStyle}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="play-back" size={skipSize} color={color} />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handlePlayPause}
        disabled={disabled || isLoading}
        style={playBtnStyle}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        {isLoading
          ? <ActivityIndicator size="small" color={color} />
          : <Ionicons name={isPlaying ? 'pause' : 'play'} size={playSize} color={color} />}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleForward}
        disabled={disabled}
        style={btnStyle}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="play-forward" size={skipSize} color={color} />
      </TouchableOpacity>

      {showSpeed ? (
        <TouchableOpacity
          onPress={handleCycleSpeed}
          disabled={disabled}
          style={styles.speedBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={[styles.speedText, { color }]}>{formatRate(rate)}</Text>
        </TouchableOpacity>
      ) : null}

      {!large ? (
        <>
          <Text style={styles.time}>{formatTime(position)}</Text>
          {renderSlider(styles.slider)}
          <Text style={styles.time}>{formatTime(duration)}</Text>
        </>
      ) : null}
    </View>
  );

  if (!large) {
    return <View style={styles.container}>{controls}</View>;
  }

  return (
    <View style={styles.container}>
      {controls}
      <View style={styles.sliderRowLarge}>
        <Text style={styles.time}>{formatTime(position)}</Text>
        {renderSlider(styles.sliderLarge)}
        <Text style={styles.time}>{formatTime(duration)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  playBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  sliderWrap: {
    flex: 1,
  },
  slider: {
    flex: 1,
    height: 32,
    marginHorizontal: 4,
  },
  time: {
    fontSize: 11,
    color: '#64748B',
    minWidth: 34,
    textAlign: 'center',
  },

  // ── large layout ──────────────────────────────────────────────────────────
  controlsRowLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingVertical: 6,
  },
  iconBtnLarge: {
    padding: 10,
  },
  playBtnLarge: {
    padding: 10,
    width: 56,
    alignItems: 'center',
  },
  speedBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    minWidth: 46,
    alignItems: 'center',
  },
  speedText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sliderRowLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  sliderLarge: {
    flex: 1,
    height: 36,
    marginHorizontal: 6,
  },
});
