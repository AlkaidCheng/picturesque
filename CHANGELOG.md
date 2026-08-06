# Changelog

All notable changes to Picturesque will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Export Blink comparisons as looping animated GIFs, individually or in ZIP
  archives. (#3)

### Changed

- Run local development and production builds through Vite. (#1)
- Validate types, tests, and production builds together with `npm run check`.
  (#1)

### Fixed

- Name ZIP exports after the project, compared collections, and comparison
  mode to prevent collisions between different batches. (#5)

## [0.1.0] - 2026-08-04

### Added

- Local-first projects with multiple named image collections.
- Pair mapping and collection-to-collection comparison selection.
- Side-by-side, overlay, wipe, difference, and blink comparison modes.
- Per-image alignment, framing, color, and opacity controls.
- PNG, JPEG, batch, and ZIP export workflows.
- Browser storage and portable project files.

### Changed

- Renamed the application from Frame Match to Picturesque while preserving
  compatibility with existing saved projects and browser data.

[Unreleased]: https://github.com/AlkaidCheng/picturesque/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/AlkaidCheng/picturesque/releases/tag/v0.1.0
