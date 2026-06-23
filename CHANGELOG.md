# Changelog

All notable changes to Yui are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The section for each released version becomes that GitHub release's notes (see
`.github/workflows/release.yml`), and Yui's in-app updater aggregates every
section newer than the running version, so keep entries user-facing.

## [Unreleased]

## [0.0.6] - 2026-06-23

### Added
- Rename a chat from the sidebar: hover a session and use the rename action to
  set a custom title.
  ([`1bc3b03`](https://github.com/ACAne0320/Yui/commit/1bc3b03f18f42adf4e1f02fbe21c541ab8857d01))

### Changed
- Switching the interface language and the persona Identity/Memory tabs now
  animates with a sliding highlight instead of snapping.
  ([`1ca46eb`](https://github.com/ACAne0320/Yui/commit/1ca46ebbd818b5d8886b8d59181467a206fea43b))

### Fixed
- Switching between sessions no longer briefly flashes the empty new-chat
  screen before the selected conversation loads.
  ([`73c259d`](https://github.com/ACAne0320/Yui/commit/73c259d4295bf7496194aed7b9f2bc4a2a7e6089))

## [0.0.5] - 2026-06-22

### Fixed
- Update checks no longer fail for users behind shared proxies. The in-app
  updater now reads a CDN-served manifest instead of the GitHub API, whose
  per-IP hourly limit shared proxy exit addresses routinely exhausted.

## [0.0.4] - 2026-06-22

### Added
- Persona support with an editable SOUL identity document and cross-session
  memory for global preferences and project-specific context.
- A default SOUL for new profiles, while preserving any existing custom SOUL.

### Changed
- Persona settings are now organized into separate Identity and Memory tabs.

### Fixed
- Development launches now use an isolated profile so they do not modify the
  production profile.

## [0.0.3] - 2026-06-18

### Added
- An "About" section in Settings showing the current version and author, links
  to the repository, releases, and license, and a manual "Check for updates"
  action that opens the update dialog when a release is available.

### Changed
- The in-app updater now shows the combined changelog for every version between
  the installed build and the latest release, instead of only the latest entry.

## [0.0.2] - 2026-06-18

### Added
- In-app updater for macOS: checks GitHub for newer releases, downloads and
  checksum-verifies the update ZIP, then swaps the app bundle and relaunches.

### Fixed
- Restore the login-shell `PATH` for packaged launches so Pi can find tools
  installed in the user's shell environment.
- Keep Pi's agent directory under `YUI_HOME` instead of the default location.

## [0.0.1] - 2026-06-17

### Added
- Initial release: a local-first desktop app and CLI for the Pi coding agent.
