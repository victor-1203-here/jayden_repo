#!/bin/bash
# Mac: double-click to start the portal. Keep this window open while using it.
cd "$(dirname "$0")"
(sleep 1; open "http://localhost:8765/") &
python3 server.py
