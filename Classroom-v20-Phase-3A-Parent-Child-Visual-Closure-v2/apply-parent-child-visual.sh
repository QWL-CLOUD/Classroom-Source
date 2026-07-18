#!/usr/bin/env bash
set -euo pipefail
python3 "$(cd "$(dirname "$0")" && pwd)/apply-parent-child-visual.py"
