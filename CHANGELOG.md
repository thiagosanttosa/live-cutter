# Changelog

User-facing changes are recorded here. Versions follow Semantic Versioning (`MAJOR.MINOR.PATCH`).

## [0.1.0] - Unreleased

### Added

- Local YouTube metadata lookup and authorized interval clipping to MP4.
- Persistent clip history, output settings, quality preferences and file naming.
- Windows x64 NSIS packaging with bundled yt-dlp, FFmpeg and FFprobe.
- Local system diagnostics for bundled tools and the configured output folder.
- Manual application update UI with signature verification kept enabled; the feed remains unconfigured.

### Fixed

- Require an MP4 major brand and remux QuickTime MOV sources before saving them with an `.mp4` extension.
- Restrict production navigation to the packaged entry page and IPC to its main frame.
- Keep Vite localhost HMR permissions out of the production Content Security Policy.
- Validate SemVer and keep the package lock version aligned during packaging.

### Validation

- Added MOV-to-MP4 regression coverage, navigation/frame checks, and missing-tool clip error tests.
- Integration outcomes and unverified scenarios are recorded in `docs/VALIDACAO-FINAL.md`.

### Notes

- This is an unreleased development version; the installed package is not yet a public update-enabled baseline.
- Application updates are not available until a public release repository and a code-signing certificate are configured.
