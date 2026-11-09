# Contributing to portafs

Thanks for your interest in improving portafs. Bug reports, documentation fixes, new rules, and tooling ideas are all welcome. This guide covers what you need to know to work on the codebase.

## Ways to contribute

- **Report a bug** — use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml) and include the `--json` output of the failing run.
- **Propose a feature** — use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml). Check the [Roadmap](README.md#roadmap) first; an item may already be planned.
- **Improve the docs** — `README.md` and `README.zh-CN.md` are kept in sync; if you change one, mirror the change in the other.
- **Fix or extend code** — see the workflow below.

## Development setup

Requirements: Node.js ≥ 18.17 and npm. There are no dependencies to install — the project uses only the Node.js standard library.

```sh
git clone https://github.com/ecoreal/portafs
cd portafs
npm test        # node --test, fully offline
```

The suite builds all fixtures at runtime in the OS temp directory and never touches your home directory or the network.

> The npm package and the public GitHub repository ship with the first release. Until then, this guide applies to your local copy of the source; the clone command above works once the repository is published.

## Project conventions

- **Zero runtime dependencies.** New functionality should be built on the Node.js standard library. Adding a dependency is a decision to discuss in an issue first, not a pull request detail.
- **ESM.** The package is `"type": "module"`; use `import`/`export`.
- **Rules are pure.** A rule is a function of the path list only: `run(paths, options) -> Violation[]`, where a violation is `{ ruleId, path, detail, hint }`. Rules never read the filesystem, never shell out, and never look at file contents. This is what keeps them testable and identical on every platform (see `src/rules/index.js` for the registry and contract).
- **Determinism over cleverness.** Output order follows the rule registry, not flag order; report shapes are stable because scripts consume them.
- **Both READMEs stay in sync.** English is primary, Chinese mirrors it. CLI copy (help text, errors) is English only, matching the tool's actual output.

## Adding a rule

1. Create `src/rules/<id>.js` exporting `{ id, description, hint, run }`.
2. Register it in the `RULES` array in `src/rules/index.js` (position defines output order).
3. Add tests in `test/` — rules are pure, so tests are plain data-in/data-out and should cover: what is flagged, what is deliberately *not* flagged, and option handling.
4. Update the rules table in `README.md` **and** `README.zh-CN.md`, plus the `Rules:` section of `USAGE` in `src/cli.js`.

A rule that cannot be explained in one hint sentence is probably two rules.

## Submitting changes

1. Fork, create a topic branch.
2. Make the change with tests. A fix without a test that fails before it is hard to accept.
3. Run `npm test` and include the result in the PR description.
4. If the change is user-visible (CLI flags, output schema, exit codes, rule behavior), describe it under **Unreleased** in `CHANGELOG.md`.
5. Keep pull requests focused — one behavior per PR reads better in review.

Commit messages: no strict format is enforced, but a short imperative summary line plus context in the body works well.

## Reporting security issues

Please do not open public issues for security reports — see [SECURITY.md](SECURITY.md).

## Licensing

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE) that covers the project.
