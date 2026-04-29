# Photo Bingo

One-time recreation/event photo bingo app.

## Run locally

```bash
npm start
```

Open:

```text
http://localhost:3000
```

If port 3000 is already in use:

```bash
PORT=3001 npm start
```

## Temporary public sharing with Cloudflare Tunnel

```bash
cloudflared tunnel --url http://localhost:3001
```

Share the generated `trycloudflare.com` URL with participants.

## Data

- `data/board.json`: bingo square text
- `data/submissions.json`: participant submissions, ignored by Git
- `uploads/`: uploaded photos, ignored by Git

Uploaded photos and participant submissions are intentionally excluded from GitHub.
