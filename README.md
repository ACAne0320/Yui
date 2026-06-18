<p align="center">
  <img src="assets/yui-readme-banner.png" alt="Yui banner with centered app icon" width="100%">
</p>

# Yui

[简体中文](README.zh-CN.md)

Yui is a local-first, extensible personal assistant who lives on your own
computer. Talk to her in a quiet desktop window and she helps you get things
done.

<p align="center">
  <img src="assets/new-chat.png" alt="Yui desktop new chat screen" width="100%">
</p>

## Vision

Yui wants to be a project where anyone can shape an assistant that truly knows
them — one that, over time, becomes genuinely yours. Here's where we're heading:

- **New abilities, just by asking.** Describe something you wish she could do —
  "show my API balance on the Desktop page" — and Yui writes the extension for
  you, no coding required.
- **A memory that makes her yours.** She remembers your preferences, your
  projects, and the little things, growing more personal with every conversation.
- **A presence, not just a window.** Yui will have moods and expressions, and a
  desktop companion (a 桌宠 / desktop pet) who lives on your screen — so she
  feels like someone who's *with* you, not a tool you open and close.
- **Truly local, truly yours.** No accounts, no cloud lock-in; your data, your
  memories, and your assistant stay with you.

## Try it

> Early development build — unsigned and un-notarized, so expect rough edges.

**macOS** — download the latest `.dmg` from the
[Releases page](https://github.com/ACAne0320/Yui/releases). Because the build
isn't signed yet, macOS quarantines it and blocks the first launch. Clear the
Gatekeeper warning by removing the quarantine flag:

```bash
xattr -dr com.apple.quarantine /Applications/Yui.app
```

**Run from source** (any platform) — requires Node.js 22.12+ and pnpm:

```bash
pnpm install
pnpm desktop:dev
```

Her profile lives in `~/.yui` by default (set `YUI_HOME` to use another
folder).

## Acknowledgments

Yui stands on the shoulders of [Pi](https://github.com/earendil-works/pi). Pi
quietly powers her conversations, tools, and extensions underneath. Thank you
for building such a capable, embeddable foundation!

## License

[MIT](LICENSE) © 2026 ACAne0320
