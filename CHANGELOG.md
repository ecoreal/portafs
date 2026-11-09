# Changelog

All notable changes to portafs are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Nothing yet.

## [0.1.0] — unreleased

Initial release.

### Added

- `portafs check [dir]` audits a directory tree against five portability rules:
  `case-collision`, `windows-reserved` (CON/PRN/AUX/NUL/COM1-9/LPT1-9, with or
  without an extension), `trailing` (trailing space/dot), `path-length`, and
  `unicode` (NFC/NFD pairs). Exit codes: `0` clean, `1` violations found,
  `2` usage or internal error — usable directly as a pre-commit or CI gate.
- `--json` machine-readable report; every violation carries `ruleId`, `path`,
  `detail`, and `hint`. Colored human-readable output by default; `--no-color`
  or a non-empty `NO_COLOR` disables ANSI escapes.
- Git-aware scanning: tracked files only inside a git work tree (local
  `git ls-files`), `--staged` for staged additions/modifications
  (`git diff --cached`), plain filesystem walk outside a repository or when
  git is unavailable.
- `portafs baseline` writes a JSON snapshot of current violations;
  `check --baseline <file>` reports only violations missing from the snapshot,
  enabling gradual adoption in existing repositories.
- `--rule <id>` / `--ignore <id>` filtering, `--max-length <n>` threshold
  override, `--help` / `--version` (exit 0).

### Semantic decisions worth knowing

- The `baseline` command always exits `0` when it writes the snapshot, even if
  it records violations — snapshotting is the success criterion. Exit `1`
  belongs to `check`.
- An NFC/NFD pair is reported by both `unicode` and `case-collision`: the
  rules are independent by design, so the same underlying problem surfaces
  twice instead of either rule silently missing it.
- `path-length` measures the relative path (in UTF-16 code units) against the
  limit and does not add a checkout prefix; deep checkout locations may
  warrant a lower `--max-length`.

[Unreleased]: https://github.com/ecoreal/portafs/compare/0.1.0...HEAD
[0.1.0]: https://github.com/ecoreal/portafs/releases/tag/0.1.0
