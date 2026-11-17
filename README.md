---
title: Congklak
emoji: 🌰
colorFrom: yellow
colorTo: red
sdk: docker
app_port: 7860
pinned: false
---

# Congklak

Realtime two-player congklak with name entry and rankings. No dependencies.

    node server.js      # http://localhost:3000
    node --test         # tests

Env: PORT (default 3000), DATA_DIR (default ./data, holds leaderboard.json).
The front matter above and the Dockerfile are for Hugging Face Spaces (free, no card).
Free hosting has no persistent disk, so rankings reset when the service restarts.
