#!/usr/bin/env node
// Executable entry point: hand argv to the CLI and publish the exit code.
// process.exitCode (instead of process.exit) lets stdout flush on its own.
import { run } from '../src/cli.js';

process.exitCode = await run(process.argv.slice(2));
