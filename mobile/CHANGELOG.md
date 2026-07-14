# Changelog

---

## [Unreleased] — Android Share Intent + Production Fixes

### Overview

Added full Android Share Intent support so users can share audio files directly
from Files, WhatsApp, Telegram, Google Drive, etc. into the app, which then
automatically opens the converter screen with the file pre-loaded.
Also fixed three production issues found during post-implementation audit.

---

## Feature: Android Share Intent

### New Files

#### `mobile/types/shareIntent.js`
- JSDoc type definitions for `SharedFile`, `ShareIntentState`, `ShareIntentContextValue`
- `SUPPORTED_AUDIO_TYPES` — accepted MIME type list
- `MIME_LABELS` — human-readable labels for display
- `MAX_SHARE_FILE_BYTES` — 200 MB size limit constant

#### `mobile/services/shareIntentService.js`
- `parseIntentParams(params)` — extracts URI and MIME from expo-router search params for both `ACTION_SEND` and `ACTION_VIEW` intents
- `validateSharedFile({ uri, mimeType })` — rejects unsupported MIME types with a user-friendly message
- `copySharedFileToStaging(sourceUri, fileName, onProgress)` — copies `content://` or `file://` URI into `cacheDirectory/share_staging/` before upload; required because `content://` permissions expire after the intent is consumed
- `receiveSharedFile(params, onProgress)` — full pipeline: parse → validate → copy → return `SharedFile` object
- `clearStagingDir()` — deletes the entire staging directory
- `clearStagingFile(localUri)` — deletes a single staged file; safety-guarded to only target files inside the staging directory; never throws

#### `mobile/context/ShareIntentContext.js`
- `useReducer`-based global state machine with states: `idle → receiving → ready → processed → error`
- Actions: `startReceiving`, `setSharedFile`, `markProcessed`, `setError`, `clear`
- `processingRef` mutable ref prevents duplicate processing between re-renders
- `isProcessing()` getter for external guards
- `useShareIntentContext()` hook with provider-missing guard

#### `mobile/hooks/useShareIntent.js`
- Watches `useLocalSearchParams()` at the root layout level
- `lastHandledUriRef` dedup guard prevents the same URI from being processed twice (params persist in URL while screen is mounted)
- Calls `receiveSharedFile()` → updates context → navigates to `/tabs/tools/audio-converter`
- Covers cold start, foreground, and background-wake scenarios via `singleTask` launch mode

#### `mobile/components/ShareIntentHandler.js`
- Renderless component that mounts `useShareIntent` at the root layout
- Ensures intent detection runs regardless of which screen is currently active

#### `mobile/plugins/withShareIntentAndroid.js`
- Expo Config Plugin using `withAndroidManifest` from `@expo/config-plugins`
- Injects all `ACTION_SEND` and `ACTION_VIEW` intent filters into `MainActivity`
- Adds `READ_MEDIA_AUDIO` permission (Android 13+)
- Idempotent — checks before inserting, safe to run on repeated `expo prebuild` calls

#### `mobile/SHARE_INTENT_TESTING.md`
- Full test matrix: 10 scenarios covering Files app, WhatsApp, Telegram, Google Drive, cold start, foreground, background, unsupported file, empty file, DocumentPicker coexistence
- ADB command for verifying intent filter registration without opening another app
- Notes on `expo prebuild --clean` safety

---

### Modified Files

#### `mobile/app/_layout.js`
- Wrapped tree in `<ShareIntentProvider>`
- Mounted `<ShareIntentHandler />` inside the provider, above the `<Stack>`

#### `mobile/app/tabs/tools/audio-converter.js`
- Consumes `useShareIntentContext()` — when `shareStatus === 'ready'`, auto-imports `pendingFile` into `selectedFile` state
- Added `stagedUriRef` to track the staged file URI for cleanup
- Added "Importing shared file…" activity indicator banner (shown while `shareStatus === 'receiving'`)
- Added "Shared from another app · {MIME label}" badge on the file card
- Updated pick-area hint text to mention share flow
- `clearSelection` cleans up staged file via `clearStagingFile` before resetting state
- `convertToWav` cleans up staged file after successful upload (file is on server; local staging copy no longer needed)
- `convertOpusToWav` call now passes `selectedFile.mimeType` as fourth argument
- Removed old `useLocalSearchParams` stub (replaced by the context-based flow)

#### `mobile/app.json`
- Added `android.intentFilters` array — mirrors plugin filters for `expo prebuild` compatibility
- Added `android.permissions` for `READ_EXTERNAL_STORAGE`, `READ_MEDIA_AUDIO`, `WRITE_EXTERNAL_STORAGE`
- Added `./plugins/withShareIntentAndroid` to `plugins` array
- `scheme` set to `audioconverter`

#### `mobile/android/app/src/main/AndroidManifest.xml`
- Added `ACTION_SEND` filters for `audio/*` and `application/octet-stream`
- Added `ACTION_VIEW` filters for `audio/*`, `audio/opus`, `audio/ogg`, `audio/aac`, `audio/mpeg`, `audio/mp4`
- Added `READ_MEDIA_AUDIO` permission
- Added `<queries>` entry for `GET_CONTENT audio/*` (Android 11+ package visibility)

---

### Package Name Fix

**Problem:** `build.gradle` declared `com.yourcompany.fullstackapp` while `app.json` declared `com.yourcompany.audioconverter`. Android uses `applicationId` from `build.gradle` as the real app identity — the share sheet and intent filters would register under the wrong ID.

**Files changed:**

| File | Change |
|---|---|
| `android/app/build.gradle` | `namespace` + `applicationId` → `com.yourcompany.audioconverter` |
| `android/app/src/main/java/com/yourcompany/audioconverter/MainActivity.kt` | Moved from `fullstackapp/`; `package` declaration updated |
| `android/app/src/main/java/com/yourcompany/audioconverter/MainApplication.kt` | Moved from `fullstackapp/`; `package` declaration updated |
| `android/app/src/main/java/com/yourcompany/fullstackapp/MainActivity.kt` | Deleted |
| `android/app/src/main/java/com/yourcompany/fullstackapp/MainApplication.kt` | Deleted |

Package name is now `com.yourcompany.audioconverter` consistently across all five locations.

---

## Fix: Production Issues (Post-Audit)

### Fix #1 — Hardcoded MIME Type During Upload

**File:** `mobile/services/audioConverterService.js`

**Problem:** Every file was uploaded with `mimeType: 'audio/opus'` regardless of actual type.
AAC, MP3, OGG, M4A files were sent to the server with the wrong content-type header.

**Change:** Added `resolveUploadMimeType(mimeType)` helper.
- Accepts all known `audio/*` sub-types explicitly
- Accepts any `audio/` prefixed type as a pass-through
- Falls back to `application/octet-stream` for unknown/missing types

`convertOpusToWav` signature extended with optional `mimeType` parameter.
Upload now uses `resolveUploadMimeType(mimeType)` instead of the hardcoded literal.

**Behaviour after fix:**

| Input | Upload MIME |
|---|---|
| `.opus` | `audio/opus` |
| `.ogg` | `audio/ogg` |
| `.aac` | `audio/aac` |
| `.mp3` | `audio/mpeg` |
| `.m4a` | `audio/mp4` |
| unknown | `application/octet-stream` |

---

### Fix #2 — Filename Base Name Stripping

**File:** `mobile/services/audioConverterService.js`

**Problem:** `getBaseName()` only stripped `.opus` extension.
Input `voice.mp3` produced output filename `voice.mp3_20260618_120000.wav`.

**Change:**
```js
// Before
return fileName.replace(/\.opus$/i, '');

// After
return fileName.replace(/\.[^/.]+$/, '');
```

Generic regex strips any extension. Output filenames are now clean for all input types.

**Examples:**

| Input | Base name | WAV output |
|---|---|---|
| `voice.opus` | `voice` | `voice_18062026_120000.wav` |
| `voice.mp3` | `voice` | `voice_18062026_120000.wav` |
| `audio.aac` | `audio` | `audio_18062026_120000.wav` |
| `recording.m4a` | `recording` | `recording_18062026_120000.wav` |
| `track.ogg` | `track` | `track_18062026_120000.wav` |

Timestamp suffix preserves uniqueness across multiple conversions of the same file.

---

### Fix #3 — Share Staging File Cleanup

**Files:** `mobile/services/shareIntentService.js`, `mobile/app/tabs/tools/audio-converter.js`

**Problem:** `clearStagingDir()` was exported but never called. Files copied into
`cacheDirectory/share_staging/` accumulated indefinitely.

**Changes:**

`shareIntentService.js`:
- `clearStagingDir()` — added `console.log` on success and `console.warn` on failure
- `clearStagingFile(localUri)` — new function; deletes a single staged file
  - Safety guard: only deletes URIs that start with `SHARE_STAGING_DIR`; silently skips anything outside
  - Never throws — logs warnings; conversion flow is never interrupted by cleanup failure

`audio-converter.js`:
- Imported `clearStagingFile`
- Added `stagedUriRef = useRef(null)` to track the current staged file URI
- On share import: `stagedUriRef.current = pendingFile.uri`
- `convertToWav` — calls `clearStagingFile(stagedUriRef.current)` after successful upload (file is on the server; staging copy no longer needed)
- `clearSelection` (user cancels) — calls `clearStagingFile(stagedUriRef.current)` before resetting state

**Cleanup is NOT triggered on WAV conversion failure** — intentional, so the user can retry without re-sharing the file.

---

---

## Fix: Share Intent Navigation Timing (Cold Start)

**Commit title:**
```
fix(shareIntent): retry router.navigate on cold start until navigator is ready
```

### Problem

After the `DeviceEventEmitter` fix, the `DeviceEventEmitter` was delivering the file correctly but the app still opened to the home screen instead of Audio Converter.

**Root cause:** On cold start, `router.navigate(CONVERTER_ROUTE)` was called immediately after `setSharedFile()`. At that point the React Navigation stack is not yet mounted — the call is silently dropped and the user lands on whatever screen the app initialises to.

On foreground/background intents this was not a problem because the navigator was already running.

### What Was Fixed

**`mobile/hooks/useShareIntent.js`** — replaced single `router.push()` call with a `navigateToConverter()` helper that:

- Uses `router.navigate()` instead of `router.push()` — navigate is idempotent (won't stack duplicates if already on the screen)
- Wraps the call in a `setInterval` retry loop that attempts every **100 ms** for up to **3 seconds** (30 attempts)
- On foreground/background intents the navigator is already ready so the push succeeds on the first attempt — no delay
- On cold start it retries until the navigator accepts the call, then clears the interval immediately
- If all retries are exhausted the file is still in `ShareIntentContext` — the converter screen will pick it up automatically if the user navigates there manually

### End-to-End Flow After Fix

```
User taps Share → selects app
        ↓
MainActivity.kt fires DeviceEventEmitter "ShareIntentReceived"
        ↓
useShareIntent validates + stages file → setSharedFile() [context status = ready]
        ↓
navigateToConverter() starts retry loop
        ↓
Navigator mounts (cold start) or already ready (foreground)
        ↓
router.navigate('/tabs/tools/audio-converter') succeeds
        ↓
Audio Converter screen mounts
        ↓
useEffect sees shareStatus === 'ready' → setSelectedFile(pendingFile)
        ↓
Source file section populated with file name, size, MIME badge
Convert to WAV button enabled — user taps once to convert
```

### Files Changed

| File | Change |
|---|---|
| `mobile/hooks/useShareIntent.js` | Added `navigateToConverter()` with retry loop; replaced `router.push` with `router.navigate` |

### Files Unchanged
`MainActivity.kt`, `ShareIntentContext.js`, `ShareIntentHandler.js`, `app/_layout.js`, `audio-converter.js` — all untouched.

---

## Fix: Share Intent Not Delivering File to App (Root Cause Fix)

**Commit title:**
```
fix(android): read EXTRA_STREAM via native DeviceEventEmitter, replace broken useLocalSearchParams approach
```

### Problem

The app appeared correctly in the Android share sheet (intent filters were registered and working), but tapping the app did nothing — the converter screen opened empty with no file selected.

**Root cause:** `useLocalSearchParams()` in expo-router only contains URL query parameters from deep links. When Android delivers a share intent (`ACTION_SEND`), the file URI is placed in the native intent extra `Intent.EXTRA_STREAM` — a raw Android API that expo-router never parses or exposes to JS. The hook was looking for `params['android.intent.extra.STREAM']` in the URL, which is always empty on a share intent. The entire detection pipeline silently returned `null` on every share.

### What Was Fixed

#### `android/app/src/main/java/com/yourcompany/audioconverter/MainActivity.kt`
- Added `onCreate` override — calls `handleShareIntent(intent)` on cold start
- Added `onNewIntent` override — calls `handleShareIntent(intent)` when app is already running (foreground or background wake)
- `handleShareIntent` reads `Intent.EXTRA_STREAM` (for `ACTION_SEND`) or `intent.data` (for `ACTION_VIEW`) from the native Android intent
- Emits a `"ShareIntentReceived"` event to JS via `DeviceEventEmitter` with payload `{ uri, mimeType }`
- Cold-start safe: if the React bridge is not yet ready, queues the emit via `addReactInstanceEventListener` so the event fires as soon as JS is loaded
- Handles Android 13+ `getParcelableExtra` API change with a version-guarded call

#### `mobile/hooks/useShareIntent.js`
- Replaced `useLocalSearchParams()` + `parseIntentParams()` approach entirely
- Now uses `DeviceEventEmitter.addListener("ShareIntentReceived", handler)` — the correct JS API for events emitted from native Android Kotlin code
- Handler validates MIME, extracts filename, copies file to staging, updates context, navigates to converter
- All existing dedup logic (`lastHandledUriRef`) and error handling preserved
- Subscription is cleaned up on unmount via `subscription.remove()`

#### `mobile/services/shareIntentService.js`
- Exported `extractFileName(uri)` — previously private, now accessible to the hook directly
- Exported `ensureAudioExtensionFromMime(name, mimeType)` — thin wrapper over existing internal function
- No behaviour changes to existing functions

### Why This Approach

`DeviceEventEmitter` is the standard React Native bridge for native-to-JS events. Using it directly in `MainActivity.kt` requires zero additional dependencies, is fully compatible with Expo SDK 51 / RN 0.74, survives `expo prebuild`, and gives complete control over all three lifecycle cases (cold start, foreground, background). Third-party libraries like `react-native-receive-sharing-intent` wrap this same mechanism but add maintenance risk and version-compatibility uncertainty.

### Files Changed

| File | Type | Change |
|---|---|---|
| `android/…/MainActivity.kt` | Native (Kotlin) | Added intent reading + DeviceEventEmitter emit |
| `mobile/hooks/useShareIntent.js` | JS | Replaced useLocalSearchParams with DeviceEventEmitter listener |
| `mobile/services/shareIntentService.js` | JS | Exported extractFileName + ensureAudioExtensionFromMime |

### Files Unchanged
All other files — `ShareIntentContext.js`, `ShareIntentHandler.js`, `app/_layout.js`, `audio-converter.js`, `audioConverterService.js`, `AndroidManifest.xml`, `app.json` — are untouched.

### Rebuild Required
`MainActivity.kt` is a native file. A full rebuild is required:
```bash
# From mobile/
expo run:android
# or
eas build --platform android --profile development
```

---

## Architecture Notes

- FFmpeg runs server-side; the mobile client uploads the source file and downloads the result. No on-device FFmpeg.
- The share intent flow produces a `file://` URI in `share_staging/` before the upload. `audioConverterService.resolveUploadUri()` passes `file://` URIs straight through — no double-copy.
- `expo prebuild --clean` is safe: the config plugin re-applies all intent filters to the freshly generated manifest. All JS files are unaffected by prebuild.
- This feature requires a Development Build (`expo run:android` or EAS). It does not work in Expo Go.



---

## Fix: Cold-Start Race Condition — Share Intent Never Reaches JS

**Commit title:**
```
fix(android): store pending intent in native module, pull after listener registers to fix cold-start race
```

### Problem

On cold start the `DeviceEventEmitter.emit("ShareIntentReceived")` fired from `addReactInstanceEventListener` at the moment the React bridge became ready — but the JS `DeviceEventEmitter.addListener` in `useShareIntent` only registers *after* the React component tree mounts (~100–300ms later). The event fired into empty air. No file. App opened to Home page.

On foreground/background intents this was not a problem (listener already registered), so the bug only manifested on cold start.

### Root Cause (exact location)

- `MainActivity.kt` — `emitShareIntent()` called inside `onReactContextInitialized`, which fires before `ShareIntentHandler` mounts
- `hooks/useShareIntent.js` — `DeviceEventEmitter.addListener` registers too late; misses the cold-start emit

### Fix — Files Changed

#### New: `android/…/ShareIntentModule.kt`
- New `ReactContextBaseJavaModule` named `ShareIntentModule`
- Companion object holds `@Volatile var pendingUri` and `pendingMimeType`
- Single `@ReactMethod fun getPendingIntent(promise: Promise)` — returns stored URI+MIME as a JS-readable map, then **clears** both vars so data cannot be delivered twice
- Exposed to JS as `NativeModules.ShareIntentModule`

#### New: `android/…/ShareIntentPackage.kt`
- `ReactPackage` implementation that registers `ShareIntentModule`
- Required for React Native to expose the module to JS

#### Modified: `android/…/MainApplication.kt`
- `getPackages()` now returns `PackageList(this).packages + ShareIntentPackage()`
- Previously returned `PackageList(this).packages` only — module was not registered

#### Modified: `android/…/MainActivity.kt`
- Dual-delivery strategy:
  - **Always** stores URI+MIME into `ShareIntentModule.pendingUri / pendingMimeType` (Path B — JS pull)
  - If bridge is ready: also emits `DeviceEventEmitter` immediately (Path A — push, foreground)
  - If bridge not ready: queues emit via `addReactInstanceEventListener` as backup (Path A delayed)
- Both paths share a dedup guard in JS so only one delivery occurs regardless of which path wins

#### Modified: `mobile/hooks/useShareIntent.js`
- After registering `DeviceEventEmitter` listener, immediately calls `NativeModules.ShareIntentModule.getPendingIntent()`
- If a pending intent exists (cold start), processes it through the same `processSharePayload()` pipeline
- `lastHandledUriRef` dedup guard prevents double-processing if both push and pull deliver the same URI
- Navigation (`router.navigate`) now reads `authLoadingRef` — waits for `isLoading === false` before pushing so `app/index.js` auth redirect cannot overwrite the navigation
- Added `useAuth` import to access `isLoading`

### End-to-End Flow After Fix

```
Cold start:
  MainActivity.onCreate → stores URI in ShareIntentModule.pendingUri
  → addReactInstanceEventListener queues emit
  → React bridge ready → emit fires (may miss JS listener)
  → ShareIntentHandler mounts → listener registers
  → getPendingIntent() called → finds stored URI → processSharePayload()
  → file staged → context status=ready → nav retry loop starts
  → authLoading=false → router.navigate('/tabs/tools/audio-converter')
  → screen mounts → useEffect imports file → Convert button enabled

Foreground/background:
  onNewIntent → stores URI → bridge already ready → emit fires
  → JS listener already registered → handleShareEvent() fires immediately
  → same pipeline → navigation instant (attempt #1)
```

---

## Fix: Auth Redirect Overwrites Share Intent Navigation

**Commit title:**
```
fix(navigation): defer router.navigate until auth isLoading=false
```

### Problem

On cold start, `app/index.js` renders `<LoadingScreen>` while `isLoading === true`, then redirects to `/tabs/home` when auth resolves. If `router.navigate('/tabs/tools/audio-converter')` fired during `isLoading`, the subsequent `/tabs/home` redirect overwrote it.

### Fix

`hooks/useShareIntent.js` — navigation retry loop checks `authLoadingRef.current` on every interval tick. Skips the `router.navigate()` call while auth is still loading. Once `isLoading` becomes `false`, the next tick fires the navigation successfully.

No other files changed for this fix.

---

## Feature: "View Converted Files" Link on Audio Converter Screen

**Commit title:**
```
feat(ui): add View Converted Files link at bottom of Audio Converter screen
```

### What Was Added

`mobile/app/tabs/tools/audio-converter.js`

A tappable link row at the bottom of the scroll view, below the Pipeline card:

```
📂  View converted files  ›
```

- Folder icon + label + chevron, all in `Colors.primary` (purple)
- Tapping calls `router.push('/tabs/tools/converted-files')`
- Sits at the bottom of the screen so it's visible after using the converter
- Does not affect any other UI or conversion logic

**Changes in this file:**
1. Added `import { useRouter } from 'expo-router'`
2. Added `const router = useRouter()` inside the component
3. Added `<TouchableOpacity>` link between Pipeline card and `</ScrollView>`
4. Added `convertedFilesLink` and `convertedFilesLinkText` styles

---

## Debug: Added Share Intent Logging

**Commit title:**
```
debug(shareIntent): add checkpoint logging across native and JS layers
```

### Logging Added

**`MainActivity.kt`** — `android.util.Log.d(TAG, ...)` at every step:
- `onCreate` / `onNewIntent` — logs action, type, data
- URI extraction result
- React context readiness
- `emitShareIntent` call confirmation

**`hooks/useShareIntent.js`** — `console.log` at 8 checkpoints:
- CHECKPOINT 1: raw event received
- CHECKPOINT 2: dedup guards
- CHECKPOINT 3: MIME validation
- CHECKPOINT 4: filename extraction
- CHECKPOINT 5: staging copy
- CHECKPOINT 6: SharedFile object built
- CHECKPOINT 7: context updated
- CHECKPOINT 8: navigation started

**`components/ShareIntentHandler.js`** — mount/unmount confirmation log

**How to read logs:**
```bash
# Native (Kotlin)
adb logcat | findstr ShareIntent

# JS (Metro console)
Filter by: [ShareIntent]
```

---

## Fix: EAS Build Strips Share Intent Native Code (Production Build Broken)

**Commit title:**
```
fix(plugin): make share intent EAS-safe by patching MainActivity and MainApplication via config plugin
```

### Problem

Share intent worked on local builds (`expo run:android`) but was completely broken on EAS builds. Tapping the app in the share sheet opened the app but nothing happened — no file, no navigation to the converter.

**Root cause:** EAS Build runs `expo prebuild --clean` before compiling, which regenerates `MainActivity.kt` and `MainApplication.kt` from Expo's default templates. This overwrote all handwritten share intent code:

| File | What EAS did |
|---|---|
| `MainActivity.kt` | Regenerated — `handleShareIntent`, `onNewIntent`, `emitShareIntent` all gone |
| `MainApplication.kt` | Regenerated — `ShareIntentPackage()` registration gone |
| `ShareIntentModule.kt` | Survived (not a regenerated file) |
| `ShareIntentPackage.kt` | Survived (not a regenerated file) |

Result: intent filters in the manifest (app appeared in share sheet) ✅ but no code reading `EXTRA_STREAM` or emitting to JS ❌.

### Fix

**`plugins/withShareIntentAndroid.js`** — completely rewritten using the correct `@expo/config-plugins` APIs:

| Part | API | What it does |
|---|---|---|
| 1 | `withAndroidManifest` | Injects `ACTION_SEND` + `ACTION_VIEW` intent filters + `READ_MEDIA_AUDIO` permission |
| 2 | `withMainActivity` | Replaces `MainActivity.kt` contents with full share intent implementation |
| 3 | `withMainApplication` | Replaces `MainApplication.kt` contents with `ShareIntentPackage()` registered |
| 4 | `withMainActivity` (timing hook) | Writes `ShareIntentModule.kt` and `ShareIntentPackage.kt` if missing in a fresh clone |

All four parts are **idempotent** — sentinel string checks prevent double-patching on repeated prebuild runs.

**`app.json`** — removed `intentFilters` array. It was being processed by both Expo's built-in handler AND the plugin simultaneously, producing broken duplicate entries with doubled namespace prefixes (`android.intent.action.android.intent.action.SEND`). The plugin is now the single source of truth for all intent filters.

### Result

`expo prebuild` and EAS Build now write the same `MainActivity.kt`, `MainApplication.kt`, `ShareIntentModule.kt`, `ShareIntentPackage.kt`, and `AndroidManifest.xml` as the local hand-edited versions. Both local and EAS builds behave identically.

### Files Changed

| File | Change |
|---|---|
| `plugins/withShareIntentAndroid.js` | Rewritten — uses `withMainActivity` + `withMainApplication` instead of fragile `fs` write via `withAppBuildGradle` |
| `app.json` | Removed `android.intentFilters` array — plugin is now sole owner of intent filters |

### Verification

```
expo prebuild --platform android --no-install
```

After prebuild, all checks pass:
- `MainActivity.kt` contains `handleShareIntent` ✅
- `MainActivity.kt` stores `ShareIntentModule.pendingUri` ✅
- `MainApplication.kt` registers `ShareIntentPackage()` ✅
- `ShareIntentModule.kt` exists ✅
- `ShareIntentPackage.kt` exists ✅
- `AndroidManifest.xml` contains `android.intent.action.SEND` ✅
- No doubled-prefix duplicates in manifest ✅
- Gradle build: `BUILD SUCCESSFUL` ✅
