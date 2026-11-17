# Congklak

Realtime two-player congklak with name entry and rankings. No dependencies.

    node server.js      # http://localhost:3000
    node --test         # tests

Env: PORT (default 3000), DATA_DIR (default ./data, holds leaderboard.json).
Deploy: see render.yaml (Render free web service). The free tier has no persistent disk,
so rankings reset when the service restarts.
