# 🧠 War Oracle

<p align="center">
  <img src="https://raw.githubusercontent.com/PHTMGatt/12-React-Portfolio/main/src/assets/photos/War%20Oracle.png" width="900" alt="War Oracle project artwork">
</p>

**War Oracle** is an automated war intelligence bot for **Clash of Clans** clans on Discord.

It monitors active wars, tracks progress in real time, and delivers **clean, non-spammy updates** so leadership always knows what matters — without manual checking.

---

## ⚔️ What War Oracle Does

- 📊 **Live War Status**  
  Current score, stars, destruction, and remaining attacks

- 🚨 **Smart War Alerts**  
  Threshold-based alerts with full deduplication  
  *(no repeat pings, no spam)*

- 📸 **Snapshot Tracking**  
  Stores war states over time to detect meaningful changes

- 🔁 **Automated Polling**  
  Clash of Clans API polled on a fixed interval

- 🧠 **Alert Deduplication**  
  Each alert fires once per condition, per war

---

## 🛠 Built For

- Competitive war clans  
- Leadership and war planners  
- Clean, low-noise Discord servers  
- Fully automated war oversight  

War Oracle speaks **only when it matters**.

---

## 🔗 Invite the Bot

Want War Oracle in your server?  
👉 **[Invite War Oracle](https://discord.com/oauth2/authorize?client_id=1465421621874397298&scope=bot%20applications.commands&permissions=0)**

---

## 🧠 Philosophy

Clans shouldn’t babysit wars.  
**War Oracle watches so you don’t have to.**

---

## 🚀 Run It

**Status:** stable, maintained. Requires Node 18+ (uses built-in `fetch`).

```bash
npm install
npm run deploy-commands   # registers /ping and /war slash commands (guild-scoped)
npm start                 # starts the bot
npm test                  # syntax check (also run by CI)
```

Create a `.env` file (git-ignored) with these variables. Names only here, never commit values:

| Variable | Used for |
| --- | --- |
| `DISCORD_TOKEN` | Bot login (required) |
| `CLIENT_ID`, `GUILD_ID` | Slash command deploy (`deploy-commands.js`) |
| `COC_TOKEN` | Clash of Clans API token |
| `CLAN_TAG` | Clan tag, URL-encoded (`%23ABC123`) |
| `BOT_COMMANDS_CHANNEL_ID` | Optional: lock commands to one channel |
| `WAR_STATUS_CHANNEL_ID` | `/war status` posts here |
| `WAR_ALERTS_CHANNEL_ID` | Threshold alerts post here |
| `WAR_STATS_CHANNEL_ID` | `/war stats` posts here |
| `POLL_SECONDS` | Optional, default `180` |
| `ALERT_MINUTES` | Optional, default `720,120,30` |

`war_snapshot.json` is written at runtime in the working directory.

## ✅ CI

GitHub Actions runs install + syntax check and `npm audit --audit-level=high` on every PR. No secrets needed.

---

Built with **discord.js** and the **Clash of Clans API**.
