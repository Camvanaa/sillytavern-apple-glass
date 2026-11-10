# SillyTavern · Apple Glass

Apple-style glass themes for [SillyTavern](https://github.com/SillyTavern/SillyTavern) 1.19.

- **Apple Glass 2**: a restructured UI built only from a theme CSS plus a companion extension, with no SillyTavern source changes. It adds a left sidebar with recent chats across all characters, a settings window that hosts SillyTavern's own panels, a right-hand inspector for character, group and chat settings, a combined “+” menu, a ⌘K / Ctrl K command palette, and an iOS-style phone layout.
- **Apple Glass Dark**: the earlier reskin of SillyTavern's stock layout. It is kept as is, so you can switch back at any time.

## Layout

| Path | Purpose |
|---|---|
| `apple-glass-2.css` | Apple Glass 2 theme CSS (published into the theme JSON's `custom_css`) |
| `apple-theme.css` | Apple Glass Dark theme CSS |
| `splash.css` | Start-up splash (published as `data/_css/user.css`) |
| `extensions/SillyTavern-AppleGlassStyles/` | Companion extension; `shell/` holds the Apple Glass 2 shell (sidebar, capsules, settings window, inspector, palette, phone layout) |
| `data/default-user/themes/` | Theme JSON files |
| `sync-css.sh` | Publishes the CSS into theme JSON and restarts the target container |
| `tools/` | Playwright regression and performance scripts used during development |

## Install

1. Copy `extensions/SillyTavern-AppleGlassStyles/` into SillyTavern's `public/scripts/extensions/third-party/`.
2. Copy `data/default-user/themes/Apple Glass 2.json` (and/or `Apple Glass Dark.json`) into your user's `themes/` folder.
3. In SillyTavern choose **User Settings → Theme → Apple Glass 2**, then hard-refresh the page.

If the new layout ever gets in your way, open SillyTavern with `?classic` appended to the URL. The shell stays off for that session, so you can switch back to another theme.

## Credits

- Icons: [Lucide](https://lucide.dev), ISC License.
- Splash background: Vincentiu Solomon via Wikimedia Commons, CC0 1.0. See `extensions/SillyTavern-AppleGlassStyles/assets/CREDITS.md`.
