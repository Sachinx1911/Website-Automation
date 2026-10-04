#!/bin/bash
# Double-click this file in Finder to start CurrentFlow AI.
cd "$(dirname "$0")"
if [ ! -d .venv ]; then python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt; fi
.venv/bin/pip install -q -r requirements.txt
exec .venv/bin/python dashboard.py
