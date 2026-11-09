# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | ✅ |

Only the latest minor line receives security fixes.

## Scope

portafs is a local command-line tool that audits file and directory names. Relevant security properties of the current design:

- **No network access.** The tool performs no network I/O of any kind.
- **No code execution from scanned content.** Rules are pure functions over path strings; file contents are never read, and paths are never passed to a shell.
- **JSON output is plain `JSON.stringify`.** Consumers that feed the report into other tools should still validate it on their side, as with any untrusted-ish input (a hostile repository controls its own file names).
- **Baseline files are trusted input.** `check --baseline` parses a JSON snapshot from disk; only point it at files you control.

## Reporting a vulnerability

Please report privately through GitHub's **"Report a vulnerability"** flow on the [Security Advisories page](https://github.com/ecoreal/portafs/security/advisories/new) rather than opening a public issue.

Include what you can of:

- The portafs version (`portafs --version`) and platform.
- A minimal reproduction (repository layout or command line) that triggers the issue.
- What you expected to happen, and what happened instead.
- Any workaround you found.

I aim to acknowledge reports within a few days and will keep you informed of progress. Please allow time for a fix before any public disclosure; credit is happily given if you want it.
