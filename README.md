# Side Quests

A party game for friend groups: everyone writes side quests, the deck gets dealt out at random, and players race the clock to complete as many as they can, proving each one with a photo. The lobby votes on the proof and crowns a winner.

Runs on **iOS, Android and the web** from one codebase.

**Play now, no install:** [side-quests.letsaskai.workers.dev](https://side-quests.letsaskai.workers.dev/)

## Run it yourself

Needs [Node 24+](https://nodejs.org/) and `cloudflared` (`brew install cloudflared`, or see [docs/run-on-a-phone.md](docs/run-on-a-phone.md) for other OSes).

```sh
git clone https://github.com/r-magnus/side-quests.git
cd side-quests
npm install
npm run party
```

Builds the app, starts the server, prints a QR code — everyone scans it and plays in their phone's browser. `npm run party:local` skips the tunnel if you're all on the same Wi-Fi.

## Layout

```
packages/game/   Shared rules, types, wire protocol (+ tests)
server/          Cloudflare Worker — lobbies, AI quests, photos
app/             Expo app — iOS, Android, web
```

## More

- **Develop, test, go on a real phone, deploy your own instance:** [docs/](docs/), starting with [run-on-a-phone.md](docs/run-on-a-phone.md)
- **AI quests/ratings:** optional `OPENAI_API_KEY` in `server/.env` (see `server/.env.example`) — works fine without one

---

Built by [@sugarfig](https://github.com/sugarfig), [@r-magnus](https://github.com/r-magnus), [@jingpeng7527](https://github.com/jingpeng7527), and [@aaccaa19](https://github.com/aaccaa19) for the Unwrap Hackathon, 2026.

MIT License © 2026 Ryan Magnuson — see [LICENSE](LICENSE).
