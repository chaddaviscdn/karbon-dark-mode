<p align="center">
  <img src="icons/icon128.png" width="96" alt="Karbon Dark Mode icon" />
</p>

<h1 align="center">Karbon Dark Mode</h1>

<p align="center">
  A one-click dark mode for <a href="https://karbonhq.com">Karbon</a> (app2.karbonhq.com).<br/>
  Click the moon, flip the switch, and the whole app goes dark — triage, email
  threads (any sender's HTML), the compose editor, Work boards, My Week,
  Contacts, work items, modals, and search.
</p>

<p align="center">
  Brought to you by <a href="https://automationtown.io">automationtown.io</a> ·
  <a href="https://automationtown.io/karbondark">Landing page</a>
</p>

---

## Install

Karbon Dark Mode is a Chrome extension you load unpacked (it isn't in the
Chrome Web Store):

1. **Download** — grab `karbon-dark-mode.zip` from the
   [latest release](https://github.com/chaddaviscdn/karbon-dark-mode/releases/latest),
   then unzip it somewhere permanent (Chrome reads the folder from disk, so
   don't delete it afterwards). Or clone:
   ```
   git clone https://github.com/chaddaviscdn/karbon-dark-mode.git
   ```
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the unzipped folder.
5. Pin **Karbon Dark Mode** from the puzzle-piece menu, open Karbon, click
   the moon icon, and flip the switch.

The toggle applies to all open Karbon tabs instantly — no reload needed —
and your preference syncs with your Chrome profile.

## How it works

Karbon's app is a mix of a newer React shell and older Ember pages, and its
internal dark theme only covers part of the surface. So instead of fighting
that, the extension keeps Karbon in its normal light mode and applies **one
uniform, softened inversion** at the page level (`invert(0.93)
hue-rotate(180deg)` — the hue rotation keeps blues blue), then re-inverts
images, videos, and avatars so they keep their true colors.

Because everything in Karbon is designed for light mode, everything gets
exactly one inversion — including HTML email bodies from any sender, which is
where most dark-mode attempts fall apart.

- `content.js` toggles a `karbon-ext-dark` class on `<html>` and keeps it
  applied (via MutationObserver) when the app rewrites classes during
  navigation.
- `dark.css` holds the inversion rules, all keyed off that class, so it's
  completely inert when the toggle is off.
- `popup.html` / `popup.js` are the toggle, wired through
  `chrome.storage.sync`.

No analytics, no network requests, no data collection. The only permission is
`storage` (to remember the toggle), and it only runs on
`https://app2.karbonhq.com/*`.

## Troubleshooting

- **An element shows wrong colors** — if a container sets a decorative inline
  `background-image` and also holds text, the media re-invert rule can catch
  it. Add a `filter: invert(0.93) hue-rotate(180deg)` rule for its class in
  `dark.css`.
- **A natively-dark element looks light** — it's being inverted like
  everything else. Add a `filter: invert(1) hue-rotate(180deg)` rule for its
  container in `dark.css` (and `filter: none` for media inside it).
- The Analytics landing page is a dark-designed marketing page, so under
  inversion it appears light. Cosmetic only.

## License

[MIT](LICENSE) © 2026 Chad Davis / AutomationTown

*Not affiliated with or endorsed by Karbon. "Karbon" and the Karbon logo are
trademarks of Karbon, Inc.*
