<div align="center">

# portafs

_Audit any repo for filenames that break on other platforms — case collisions, Windows reserved names, long paths, and Unicode traps — before they break a teammate's checkout or CI._

[![node](https://img.shields.io/badge/node-%3E%3D18.17-blue)](package.json)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**`node bin/portafs.js check`** — one command, zero dependencies, exit code you can gate on.

</div>

`portafs` ("portable FS") is a command-line health check for file and directory names. A repository that works on your machine can still be impossible to check out somewhere else: `README.md` and `readme.md` cannot coexist on Windows or macOS, a file named `aux.c` collides with a DOS device name, `report .md` loses its trailing space, and `café.md` written in NFC and NFD looks like two spellings of one file. portafs finds all of that in one command, before it reaches a teammate or a CI runner.

Real output from a repository containing `README.md`, `readme.md`, and `aux.c` (exit code `1`):

```text
portafs v0.1.0 — cross-platform filename audit
target: /tmp/portafs-demo
mode: filesystem
paths: 3


case-collision (2) — Paths differing only by letter case collide on case-insensitive file systems.
  README.md
    differs only by letter case from: readme.md
    hint: Rename so every name inside a directory is unique regardless of letter case — case-insensitive file systems (Windows, macOS by default) cannot store both.
  readme.md
    differs only by letter case from: README.md
    hint: Rename so every name inside a directory is unique regardless of letter case — case-insensitive file systems (Windows, macOS by default) cannot store both.

windows-reserved (1) — Windows reserves device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9) even with an extension, e.g. aux.c.
  aux.c
    uses reserved Windows device name: "aux.c"
    hint: Windows cannot create files or folders named after devices (CON, PRN, AUX, NUL, COM1-9, LPT1-9) — with or without an extension. Choose a different name.

summary: 3 violation(s) across 2 rule(s) in 3 path(s)
```

## Install

portafs is **not on npm yet** — the package and the public repository ship with the first release. Until then, run it from a source checkout:

```sh
git clone https://github.com/ecoreal/portafs
cd portafs
node bin/portafs.js check
```

Once the package is published, this section becomes `npm install -g portafs` (or one-shot `npx portafs check`). The examples in this README call the tool `portafs`; from a checkout, substitute `node bin/portafs.js`.

Requires Node.js ≥ 18.17 (matches the [`engines`](package.json) field). No install step, no config file, no network access.

## Usage

### Quick start

```sh
portafs check                 # audit the current directory (git-aware)
portafs check path/to/repo    # audit another directory
portafs check --json          # machine-readable report for scripts
portafs check --staged        # pre-commit: only what is staged right now
```

From a source checkout, run these as `node bin/portafs.js …` until the npm release (see [Install](#install)).

### Git-aware scanning

- **Default** — inside a git work tree, portafs runs `git ls-files` locally and audits tracked files only. Untracked content such as `node_modules`, build output, and caches is out of scope automatically, and files staged for the next commit are included. Directory names are reconstructed from tracked paths, so folder-level problems are caught too.
- **`--staged`** — audits only additions and modifications in the index (`git diff --cached`), exactly what a pre-commit hook wants. Staged deletions are not audited.
- **Outside a repository** (or when git is unavailable) — falls back to a plain directory walk that includes every file and folder. Symlinks are listed but never followed; unreadable directories are skipped instead of failing the scan.

### Baseline workflow

Old repository, new gate: record what already exists, then fail only on regressions.

```sh
portafs baseline                                 # writes .portafs-baseline.json (always exits 0, even with violations)
portafs check --baseline .portafs-baseline.json  # exit 0 until something new appears
```

- Commit the snapshot file so everyone and CI see the same baseline.
- Two violations count as "the same" when their rule id and path match; changing details do not reopen known violations.
- Fix violations and rerun `portafs baseline` to shrink the snapshot. When it reaches zero, drop the `--baseline` flag and enforce everything.

### Pre-commit hook

```sh
#!/bin/sh
# until the npm release, point the hook at your portafs checkout
node /path/to/portafs/bin/portafs.js check --staged
```

### CI

```yaml
- uses: actions/checkout@v4
- run: node bin/portafs.js check --json   # after the npm release: npx portafs check --json
```

### CLI reference

```
portafs check [dir] [options]
portafs baseline [dir] [options]
```

| Option | Meaning |
| --- | --- |
| `--json` | Print a machine-readable JSON report instead of text. |
| `--rule <id>` | Run only the given rule (repeatable). Valid ids: `case-collision`, `windows-reserved`, `trailing`, `path-length`, `unicode`. |
| `--ignore <id>` | Skip the given rule (repeatable). |
| `--staged` | Audit staged files only (git mode; falls back to a full scan outside a repository). |
| `--baseline <file>` | Check mode: report only violations missing from the snapshot. |
| `--output <file>` | Baseline mode: snapshot destination (default `.portafs-baseline.json`). |
| `--max-length <n>` | Path length limit for the `path-length` rule (default 260; counts the relative path only — lower it for deep checkout locations). |
| `--no-color` | Disable ANSI colors. A non-empty `NO_COLOR` environment variable does the same. |
| `-h`, `--help` | Show help (exit 0). |
| `--version` | Print the version (exit 0). |

Exit codes: `0` clean (or nothing new beyond the baseline) — the `baseline` command also exits `0` when it writes the snapshot, even if it records violations; `1` violations found (`check` only); `2` usage or internal error.

Run `portafs --help` for the built-in reference shown above plus a one-line summary of every rule.

### JSON report

`--json` prints a single `JSON.parse`-able document; every violation carries `ruleId`, `path`, `detail`, and `hint` (excerpt from the demo repository above):

```json
{
  "tool": "portafs",
  "version": "0.1.0",
  "target": "/tmp/portafs-demo",
  "mode": "filesystem",
  "pathCount": 3,
  "summary": { "violations": 3, "byRule": { "case-collision": 2, "windows-reserved": 1 } },
  "violations": [
    {
      "ruleId": "windows-reserved",
      "path": "aux.c",
      "detail": "uses reserved Windows device name: \"aux.c\"",
      "hint": "Windows cannot create files or folders named after devices ..."
    }
  ]
}
```

`mode` is `filesystem`, `git-tracked`, or `git-staged`. When `--baseline` is used, a `baseline` object with the snapshot file and its known-violation count is added and `violations` lists only the new ones.

## What it scans

Every relative path — files **and** directories — is checked by five rules:

| id | what it catches |
| --- | --- |
| `case-collision` | Paths that differ only by letter case (`README.md` vs `readme.md`), including folders. Case-insensitive file systems (Windows, macOS by default) cannot store both. |
| `windows-reserved` | Components named `CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, or `LPT1-9` — including with an extension (`aux.c`). Windows cannot create them, as files or as folders. |
| `trailing` | Components ending with a space or a dot (`x `, `y.`). Windows strips those on creation, so the checkout will not match the repository. |
| `path-length` | Relative paths longer than the limit (default 260, adjustable with `--max-length`). Windows path handling fails once the checkout prefix is added; the limit itself counts the relative path only, so deep checkout locations may warrant a lower value. |
| `unicode` | Distinct paths that share one NFC form (`café.md` in NFC and NFD). They are two files on Linux but can collapse into one elsewhere. |

Scope notes:

- In git mode the scan covers tracked (or staged) files; ancestor directory names are derived from them, so a reserved or case-colliding **folder** is flagged even though git only lists files.
- Rules are pure functions of the path list — no filesystem access, no heuristics on file content. portafs never reads file contents, only names.
- Selection is built in: `--rule` narrows, `--ignore` skips, and every violation ships with a `hint` explaining the fix.

## Why

Several tools touch file names; none of them audit a repository for **cross-platform portability** as a first-class concern. This table is meant to be fair — each alternative is good at its own job:

| Approach | What it targets | Portability rules built in | Where a problem surfaces |
| --- | --- | --- | --- |
| **portafs** | filename portability across platforms | case collisions, reserved names, trailing space/dot, path length, NFC/NFD | in CI or pre-commit, on the author's machine, before push |
| [ls-lint](https://github.com/loeffel-io/ls-lint) | naming conventions (case styles, regex) | — | in CI |
| ESLint [`unicorn/filename-case`](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/filename-case.md) / Biome [`useFilenamingConvention`](https://biomejs.dev/linter/rules/use-filenaming-convention/) | naming style for linted JS/TS files | — | lint run |
| git built-ins ([`core.protectNTFS`](https://git-scm.com/docs/git-config#Documentation/git-config.txt-coreprotectNTFS), checkout errors) | keeping checkouts valid on Windows | reserved names, trailing space/dot, invalid characters; case collisions surface as checkout failures | at checkout time, on whoever clones next |
| [`sanitize-filename`](https://www.npmjs.com/package/sanitize-filename) & [`filename-reserved-regex`](https://github.com/sindresorhus/filename-reserved-regex) | constructing safe names in application code | reserved names / invalid characters for generated names | at runtime, per generated name — not a repository audit |

In short:

- **Convention linters** (ls-lint, ESLint, Biome) check that names follow your style guide. A repo can pass every naming convention and still contain `aux.c` or an NFC/NFD pair.
- **git built-ins** protect the cloner, which means the problem is discovered on the victim's machine, after the push — usually by a teammate on another platform. `core.protectNTFS` also only covers the Windows-specific name rules.
- **Sanitizer libraries** help code that *generates* names; they don't audit what's already committed.
- Regex-based linters can approximate some portability checks with custom rules; portafs ships the five classes above out of the box, with a JSON report, exit-code gating, and a baseline mode for adoption.

## Development

```sh
git clone https://github.com/ecoreal/portafs
cd portafs
npm test        # node --test, no arguments, fully offline
```

- **Zero runtime dependencies** — Node.js ≥ 18.17 standard library only (`node:test` for the suite).
- Fixtures are built at runtime in the OS temp directory; the suite never touches your home directory or the network, so it runs identically on Linux, macOS, and Windows (CI verifies all three).
- Adding a rule: create `src/rules/<id>.js` exporting `{ id, description, hint, run(paths, options) -> violations[] }`, register it in [`src/rules/index.js`](src/rules/index.js), add tests in `test/`, and update the rules table here plus `USAGE` in [`src/cli.js`](src/cli.js). See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

## Roadmap

Ideas, in no particular order — nothing here is implemented yet:

- [ ] Ignore patterns (globs) and a config file, so teams can encode exceptions without `--ignore` flags
- [ ] More rules: Windows-invalid characters (`< > : " \| ? *`), 8.3 short-name collisions, control characters
- [ ] GitHub Annotations / SARIF output so violations show up inline in pull requests
- [ ] A `--fix` mode that prints ready-to-run `git mv` commands
- [ ] Integrations: husky / lefthook snippets, a pre-commit framework hook, a GitHub Action

Have an opinion on priorities? [Open an issue](https://github.com/ecoreal/portafs/issues) or +1 an existing one.

## License

[MIT](LICENSE) © Jerry Lee (ecoreal)
