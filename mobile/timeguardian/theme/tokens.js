/**
 * tokens.js
 * Time Guardian design tokens — dark theme.
 * All colors as named semantic constants. Never use raw hex outside this file.
 *
 * Font setup (run before building any screen):
 * npx expo install @expo-google-fonts/fraunces @expo-google-fonts/ibm-plex-sans @expo-google-fonts/ibm-plex-mono expo-font
 */

export const TGColors = {
  background   : '#10141F',
  surface      : '#1A2133',
  surfaceRaised: '#212A40',
  line         : '#2B3450',

  gold   : '#C9A227',
  goldDim: '#8C7420',

  sage   : '#7A9B76',
  sageDim: '#4E6B4C',

  clay   : '#C97B63',
  clayDim: '#8C5240',

  night: '#7188B5',

  ink  : '#EDE9DC',
  muted: '#8A93A6',
  faint: '#5B6478',
};

export const TGCategoryColors = {
  work     : TGColors.muted,
  karmayoga: TGColors.gold,
  family   : TGColors.sage,
  self     : TGColors.sage,
  sleep    : TGColors.night,
};

export const TGOutcomeColors = {
  protected: TGColors.sage,
  yielded  : TGColors.clay,
  open     : TGColors.muted,
  exception: TGColors.night,
};

export const TGEnergyColors = {
  1: TGColors.clay,
  2: '#C9874A',
  3: TGColors.muted,
  4: TGColors.sage,
  5: TGColors.gold,
};

export const TGEnergyLabels = {
  1: 'Drained',
  2: 'Low',
  3: 'Steady',
  4: 'Good',
  5: 'Full',
};

export const TGFonts = {
  display    : 'Fraunces_500Medium',
  body       : 'IBMPlexSans_400Regular',
  bodyMedium : 'IBMPlexSans_500Medium',
  bodySemiBold: 'IBMPlexSans_600SemiBold',
  mono       : 'IBMPlexMono_400Regular',
};

export const DAY_LABELS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
