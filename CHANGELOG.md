# Changelog

All notable changes to Edge Todos are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.0.6] - 2026-05-30

### Added
- Todo rows now support adding images after creation, editable completion timestamps, and per-item text styling for bold/italic/underline/strikethrough, color, highlight, and links.
- New todo composers can be closed with a close button or `Esc`.

### Changed
- New page tabs now get numbered default titles so multiple new pages are distinguishable, and the active page tab has a stronger visual accent.
- Long todo text now wraps in the list instead of being clipped to one line.
- Todo drag sorting now starts from a dedicated row handle.
- The pin button now keeps a docked window visible instead of allowing edge auto-hide.

### Fixed
- Windows: removed the duplicate automatic tray icon so the app shows only the Rust-managed tray icon with the working menu.
- Windows: restored window geometry is clamped to the current monitor and oversized saved windows are reduced to a recoverable widget size.
- Todo Markdown links and style links now open externally instead of navigating the app WebView away from Edge Todos.
- Settings and page-manager panels now close with `Esc` and by clicking the backdrop.
- Moving a resized desktop window now preserves the current outer size during the drag.

## [1.0.5] - 2026-05-28

### Fixed
- Windows: desktop installers now keep the app asset base at `/` during GitHub Actions release builds, preventing installed-app white screens caused by GitHub Pages paths.
- Windows: hidden edge-docked windows now poll the visible reveal strip so hover reveal works after the window moves mostly offscreen.

### Added
- Added a Windows installed-app smoke script that verifies startup/version, real window drag, edge hide/reveal, and basic click/keyboard todo entry.

## [1.0.4] — 2026-05-27

### Changed
- Added AI handoff notes for running the release pipeline end to end.
- Synced package lock metadata with the application version.

## [1.0.1] — 2026-05-16

### Fixed
- Windows: release builds no longer open a terminal window on startup
- Windows: window can now be dragged by clicking any non-interactive area of the title bar

## [1.0.0] — 2026-05-15

### Added
- Mouse leave auto-hide: window hides to screen edge after 1.5 s when docked (F0)
- Drag insertion indicator line for precise todo reordering (F1)
- Priority group collapse/expand toggle (F2)
- Keyboard shortcuts: Ctrl+Enter (first group), Ctrl+N (Nth group) (F3)
- System tray icon with show/quit menu; close button hides to tray (F4)
- Window position and size memory across restarts (F5)
- Native file dialogs for import and export in desktop mode (F6)
- About dialog with version number and MIT license info (F7)
- App icon for Windows and macOS (F8)
- GitHub Actions CI for Windows (.msi) and macOS (.dmg) builds (F9)
- Vitest test suite with 12 passing tests
