# Android Share Intent — Testing Guide

## Prerequisites

This feature requires a **Development Build** (not Expo Go).

```bash
# From the mobile/ directory
npx expo run:android
# or, for a release-signed build via EAS:
eas build --platform android --profile development
```

---

## What Was Added

| File | Purpose |
|------|---------|
| `types/shareIntent.js` | Type definitions, supported MIME list, constants |
| `services/shareIntentService.js` | Parse intent params, validate, copy file to staging |
| `context/ShareIntentContext.js` | Global state machine (idle → receiving → ready → processed) |
| `hooks/useShareIntent.js` | Orchestrates the full flow, triggers navigation |
| `components/ShareIntentHandler.js` | Renderless root-level component that mounts the hook |
| `app/_layout.js` | Adds `<ShareIntentProvider>` + `<ShareIntentHandler>` to root tree |
| `app/tabs/tools/audio-converter.js` | Consumes `ShareIntentContext`, shows shared file UI |
| `android/app/src/main/AndroidManifest.xml` | Full intent filters for ACTION_SEND + ACTION_VIEW |
| `app.json` | Intent filters for `expo prebuild` + `withShareIntentAndroid` plugin |
| `plugins/withShareIntentAndroid.js` | Config plugin — survives `expo prebuild` |

---

## Architecture

```
Android Share Sheet
        │
        ▼
  MainActivity receives intent
        │
        ▼
  expo-router surfaces intent extras as URL search params
        │
        ▼
  ShareIntentHandler (root layout, always mounted)
        │
        ▼
  useShareIntent hook
    ├── parseIntentParams()     ← extract URI + MIME from params
    ├── validateSharedFile()    ← reject unsupported types
    ├── copySharedFileToStaging() ← copy content:// → file:// in cache
    └── navigate to /tabs/tools/audio-converter
        │
        ▼
  audio-converter.js
    └── useShareIntentContext() ← reads pendingFile, auto-imports it
```

---

## Test Scenarios

### 1. Android Files app (cold start)

1. Kill the app completely.
2. Open **Files** app → navigate to a `.opus` or `.ogg` file.
3. Long-press → **Share** (or the 3-dot menu → Share).
4. Select **Tools** (your app) from the share sheet.

**Expected:**
- App launches.
- "Importing shared file…" banner appears briefly.
- Converter screen opens with the file pre-populated.
- File name, size, and "Shared from another app · Opus" badge visible.
- "Convert to WAV" button is enabled.

---

### 2. WhatsApp voice note / audio file

1. Open a WhatsApp conversation with an audio message.
2. Long-press the audio message → **Share**.
3. Select **Tools**.

**Expected:** Same as above. WhatsApp sends a `content://` URI with `audio/ogg` or `audio/mp4`.

---

### 3. Telegram audio file

1. Open a Telegram conversation with an audio file.
2. Tap the file to open it → tap the 3-dot menu → **Share**.
3. Select **Tools**.

**Expected:** Same as above. Telegram typically sends `audio/mpeg` or `audio/ogg`.

---

### 4. Google Drive

1. Open Google Drive → long-press an audio file.
2. Tap the **Share** icon → **Share a copy** (not "Share link").
3. Select **Tools**.

**Expected:** Same as above. Google Drive sends a `content://` URI; the service copies it before the permission window expires.

---

### 5. App already running (foreground share)

1. Open the app and navigate to any screen.
2. Switch to Files/WhatsApp/Telegram via the task switcher.
3. Share an audio file to **Tools**.

**Expected:**
- App comes to foreground.
- Converter screen is pushed onto the navigation stack.
- File is pre-populated.

---

### 6. App in background (background-wake share)

1. Open the app, then press Home (don't kill it).
2. In Files, share an audio file to **Tools**.

**Expected:** Same as foreground share — `singleTask` launch mode ensures the existing activity is reused and the intent is re-delivered.

---

### 7. Unsupported file type

1. Share a `.pdf` or image file to **Tools**.

**Expected:**
- Alert dialog appears: *"Could not import file — Unsupported file type…"*.
- Converter screen is NOT opened.
- User taps OK → state resets to idle.

---

### 8. Empty / corrupt file

1. Share a 0-byte file (e.g., create one with a file manager).

**Expected:**
- Alert: *"The shared file is empty."*

---

### 9. DocumentPicker still works normally

1. Open the converter screen directly (via App Tools → Audio Converter).
2. Tap "Tap to pick audio file".
3. Pick any audio file.

**Expected:** Normal DocumentPicker flow — unchanged from pre-feature behaviour.

---

### 10. Choosing a different file after a share

1. Share an audio file → file is pre-populated in converter.
2. Tap "Choose different file".
3. Pick a different file from DocumentPicker.

**Expected:** DocumentPicker file replaces the shared file. Share intent context is cleared.

---

## Verifying Intent Filters in the APK

```bash
# After building, check what intents the manifest declares:
cd android
./gradlew assembleDebug

# Then inspect the merged manifest:
# android/app/build/intermediates/merged_manifests/debug/AndroidManifest.xml
```

Look for `android.intent.action.SEND` and `android.intent.action.VIEW` entries under `MainActivity`.

---

## Rebuilding After Manifest Changes

If you modify `app.json` intent filters and run `expo prebuild`, the config plugin (`withShareIntentAndroid.js`) will re-apply all intent filters automatically. You do NOT need to manually edit `AndroidManifest.xml` after a prebuild.

```bash
# Regenerate native project from app.json (does NOT delete your android/ folder contents):
npx expo prebuild --platform android --no-install
```

---

## Known Limitations

- **iOS**: Share Intent requires a Share Extension (a separate native target). This implementation is Android-only.
- **Multiple files**: `ACTION_SEND_MULTIPLE` is not handled — only the first URI is used if multiple are somehow delivered.
- **WhatsApp business / some older apps**: May send `application/octet-stream` with no extension. The service accepts these and guesses the extension from the URI if possible.
- **Staging cache**: Copied files are stored in `cache/share_staging/`. Android may clear this on low memory. The staging copy is only needed until the conversion upload completes.
