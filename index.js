require("dotenv").config();
const { Client, GatewayIntentBits, Events, EmbedBuilder } = require("discord.js");
const fs = require("fs");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ===== ENV =====
const BOT_COMMANDS_CHANNEL_ID = process.env.BOT_COMMANDS_CHANNEL_ID;
const WAR_STATUS_CHANNEL_ID = process.env.WAR_STATUS_CHANNEL_ID;
const WAR_ALERTS_CHANNEL_ID = process.env.WAR_ALERTS_CHANNEL_ID;
const WAR_STATS_CHANNEL_ID = process.env.WAR_STATS_CHANNEL_ID;

const POLL_SECONDS = Number(process.env.POLL_SECONDS || 180);
const ALERT_MINUTES = (process.env.ALERT_MINUTES || "720,120,30")
  .split(",")
  .map(x => Number(x.trim()))
  .filter(n => !Number.isNaN(n))
  .sort((a, b) => b - a);

const SNAPSHOT_FILE = "war_snapshot.json";

// Alerts toggle (in-memory; survives until bot restarts)
let alertsEnabled = true;

// Keep track so we don’t spam the same threshold repeatedly
const fired = new Set(); // key = warId:threshold

// ===== CoC API =====
async function cocCurrentWar() {
  const url = `https://api.clashofclans.com/v1/clans/${process.env.CLAN_TAG}/currentwar`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.COC_TOKEN}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`CoC API ${res.status}: ${text.slice(0, 160)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function relTime(isoLike) {
  const d = new Date(isoLike);
  return isNaN(d.getTime()) ? isoLike : `<t:${Math.floor(d.getTime() / 1000)}:R>`;
}

function parseTime(isoLike) {
  const d = new Date(isoLike);
  return isNaN(d.getTime()) ? null : d;
}

function warId(war) {
  return `${process.env.CLAN_TAG}_${war.startTime || war.preparationStartTime || "unknown"}`;
}

async function sendTo(channelId, payload) {
  const ch = await client.channels.fetch(channelId);
  return ch.send(payload);
}

function computeRemainingList(war) {
  const apm = war.attacksPerMember ?? 0;
  const members = war.clan?.members ?? [];

  const remaining = members
    .map(m => {
      const used = Array.isArray(m.attacks) ? m.attacks.length : 0;
      const left = Math.max(0, apm - used);
      return { name: m.name, left };
    })
    .filter(x => x.left > 0)
    .sort((a, b) => b.left - a.left || a.name.localeCompare(b.name));

  const totalRemaining = remaining.reduce((s, x) => s + x.left, 0);

  const list = remaining.length
    ? remaining.slice(0, 25).map(x => `• **${x.name}** — ${x.left} left`).join("\n")
    : "✅ Everyone has used all attacks.";

  return { remaining, totalRemaining, apm, list };
}

// ===== Builders =====
async function buildWarStatusEmbed() {
  const war = await cocCurrentWar();

  const state = war.state ?? "UNKNOWN";
  const clan = war.clan?.name ?? "Your Clan";
  const opp = war.opponent?.name ?? "Opponent";

  const { totalRemaining, apm, list } = computeRemainingList(war);

  const timing =
    state === "PREPARATION"
      ? `War starts: ${war.startTime ? relTime(war.startTime) : "N/A"}`
      : `War ends: ${war.endTime ? relTime(war.endTime) : "N/A"}`;

  const embed = new EmbedBuilder()
    .setTitle(`⚔️ War Status — ${clan} vs ${opp}`)
    .setDescription(`**State:** ${state}\n**${timing}**`)
    .addFields(
      { name: "Remaining attacks", value: `${totalRemaining}`, inline: true },
      { name: "Attacks per member", value: `${apm}`, inline: true },
      { name: "Who still has attacks", value: list }
    );

  return { war, embed };
}

function buildStatsEmbedFromSnapshot(snapshot) {
  const war = snapshot;

  const clan = war.clan?.name ?? "Your Clan";
  const opp = war.opponent?.name ?? "Opponent";
  const state = war.state ?? "UNKNOWN";

  const { apm } = computeRemainingList(war);
  const members = war.clan?.members ?? [];
  const attacksUsed = members.reduce((s, m) => s + (Array.isArray(m.attacks) ? m.attacks.length : 0), 0);

  const stars = war.clan?.stars ?? 0;
  const destruction = war.clan?.destructionPercentage ?? 0;

  const missed = members
    .map(m => {
      const used = Array.isArray(m.attacks) ? m.attacks.length : 0;
      const left = Math.max(0, apm - used);
      return { name: m.name, left };
    })
    .filter(x => x.left > 0);

  const missedList = missed.length
    ? missed.slice(0, 25).map(x => `• **${x.name}** — ${x.left} missed`).join("\n")
    : "✅ No missed attacks (in snapshot).";

  const embed = new EmbedBuilder()
    .setTitle(`🧮 War Stats (Latest Snapshot) — ${clan} vs ${opp}`)
    .setDescription(`**State:** ${state}`)
    .addFields(
      { name: "Clan stars", value: `${stars}`, inline: true },
      { name: "Destruction", value: `${Number(destruction).toFixed(2)}%`, inline: true },
      { name: "Attacks used", value: `${attacksUsed}`, inline: true },
      { name: "Missed attacks", value: missedList }
    );

  return embed;
}

// ===== Poller =====
async function pollWar() {
  if (!alertsEnabled) return;
  if (!process.env.COC_TOKEN) return;

  let war;
  try {
    war = (await buildWarStatusEmbed()).war;
  } catch (e) {
    if (e.status === 404) return; // no war
    return;
  }

  // Save snapshot always (so /war stats has something)
  try {
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(war, null, 2), "utf8");
  } catch {}

  // Only alert during IN_WAR
  if (war.state !== "IN_WAR") return;

  const end = parseTime(war.endTime);
  if (!end) return;

  const minutesLeft = (end.getTime() - Date.now()) / 60000;

  const { remaining, list } = computeRemainingList(war);
  if (!remaining.length) return;

  const id = warId(war);

  for (const threshold of ALERT_MINUTES) {
    if (minutesLeft <= threshold) {
      const key = `${id}:${threshold}`;
      if (fired.has(key)) continue;

      fired.add(key);

      const embed = new EmbedBuilder()
        .setTitle(`🚨 War Alert — ${Math.round(threshold)}m left`)
        .setDescription(`Time left: ${relTime(war.endTime)}\n\n**Still has attacks:**\n${list}`);

      await sendTo(WAR_ALERTS_CHANNEL_ID, { embeds: [embed] });
    }
  }
}

// ===== Discord lifecycle =====
client.once(Events.ClientReady, () => {
  console.log(`🟢 War Oracle online as ${client.user.tag}`);
  setInterval(pollWar, POLL_SECONDS * 1000);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // Lock commands to bot-commands
  if (BOT_COMMANDS_CHANNEL_ID && interaction.channelId !== BOT_COMMANDS_CHANNEL_ID) {
    return interaction.reply({
      content: `Use commands in <#${BOT_COMMANDS_CHANNEL_ID}>.`,
      ephemeral: true,
    });
  }

  // /ping
  if (interaction.commandName === "ping") {
    return interaction.reply({ content: "🧙‍♂️ War Oracle is online.", ephemeral: true });
  }

  // /war ...
  if (interaction.commandName === "war") {
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();

    // /war alerts on|off
    if (sub === "alerts") {
      const mode = interaction.options.getString("mode", true);
      alertsEnabled = mode === "on";
      return interaction.editReply(`✅ War alerts are **${mode.toUpperCase()}**.`);
    }

    // /war stats
    if (sub === "stats") {
      if (!fs.existsSync(SNAPSHOT_FILE)) {
        return interaction.editReply("⚠️ No snapshot saved yet. Wait a few minutes or run `/war status` once.");
      }
      const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
      const embed = buildStatsEmbedFromSnapshot(snapshot);
      await sendTo(WAR_STATS_CHANNEL_ID, { embeds: [embed] });
      return interaction.editReply(`✅ Posted in <#${WAR_STATS_CHANNEL_ID}>.`);
    }

    // /war status
    if (sub === "status") {
      try {
        const { war, embed } = await buildWarStatusEmbed();
        await sendTo(WAR_STATUS_CHANNEL_ID, { embeds: [embed] });

        // Friendly message when not in war
        if (String(war.state).toLowerCase() === "notinwar") {
          return interaction.editReply(`✅ Posted in <#${WAR_STATUS_CHANNEL_ID}> (no active war).`);
        }
        return interaction.editReply(`✅ Posted in <#${WAR_STATUS_CHANNEL_ID}>.`);
      } catch (e) {
        if (e.status === 404) return interaction.editReply("⚠️ No active war right now.");
        return interaction.editReply(`❌ ${e.message}`);
      }
    }

    return interaction.editReply("⚠️ Unknown subcommand.");
  }
});

client.login(process.env.DISCORD_TOKEN);
