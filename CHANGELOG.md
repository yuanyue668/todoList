# Changelog

All notable changes to Edge Todos are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
