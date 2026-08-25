# Reef Log for Windows

A single `ReefLog.exe` that opens the app in its own window — no browser chrome,
its own icon, pinnable to the taskbar, and copyable to a USB stick.

It loads the **published site** rather than a bundled copy, so it updates itself
exactly as the phone and browser installs do. Without that, every change would
mean building and downloading a new executable. The service worker caches the
site on first run, so it opens offline afterwards.

## Building it

You need the .NET SDK once. It requires an administrator prompt, so run it
yourself:

```bash
winget install Microsoft.DotNet.SDK.8
```

Then:

```bash
powershell -ExecutionPolicy Bypass -File .\desktop\build.ps1
```

The executable lands in `desktop\dist\ReefLog.exe`.

| Flag | Effect |
|---|---|
| *(none)* | Self-contained, ~60–70 MB. Runs on any Windows 10/11 PC with nothing installed. |
| `-Framework` | ~2 MB, but the target machine needs the .NET 8 runtime. |
| `-Output <path>` | Build somewhere else, e.g. straight to your Desktop. |

## Two things to expect

**A SmartScreen warning on first run.** The exe is unsigned, so Windows shows
"Windows protected your PC" — choose *More info*, then *Run anyway*. Only a code
signing certificate removes this, and those are a paid yearly subscription.

**Its own separate log.** WebView2 keeps its own storage profile, so this window
has a different IndexedDB from Edge and from your phone. Anything entered here
stays here. Use **Settings → Export backup** and **Import backup** to move data
between them, or set up cloud sync so they share one log.

That last point is the real reason to think twice about this build: it turns two
copies of your data into three. The Edge install (address bar → ⊞ Install) gives
you the same window, icon, Start menu entry and taskbar pin without adding
another silo — the only thing it does not give you is a file you can carry.

## Requirements

- **Building:** .NET SDK 8
- **Running:** Windows 10 1809 or newer, and the Edge WebView2 runtime, which is
  preinstalled on Windows 11 and on anything with Edge. The app says so plainly
  if it is missing.
