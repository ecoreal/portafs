# Sample fixture

A small static tree used by the CLI tests after being copied into a
temporary directory. Every name here is deliberately safe to create on
Windows, macOS, and Linux: no reserved device names, no trailing spaces or
dots, no case collisions, and pure ASCII.

This is why no file in this fixture uses a `.js` extension: files under
`test/` are picked up by the test runner's discovery rules, and fixture data
must never be mistaken for a test file.
