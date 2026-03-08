#!/usr/bin/env bash
set -euo pipefail

# workbook already at root of web worktree
npm ci
npm run build
npm start
