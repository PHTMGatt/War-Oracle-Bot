// Single place that reads environment variables. Tokens come from env only, never from files in git.
const path = require('path');
require('dotenv').config();

// Accepts "#ABC123", "%23ABC123" or "ABC123"; returns the URL-encoded tag for the API, or "".
function normalizeClanTag(raw) {
  if (!raw) return '';
  const t = decodeURIComponent(String(raw).trim()).replace(/^#/, '').toUpperCase();
  if (!/^[0289PYLQGRJCUV]{3,12}$/.test(t)) throw new Error(`CLAN_TAG "${raw}" is not a valid clan tag`);
  return '%23' + t;
}

function parseMinutes(raw) {
  return String(raw ?? '720,120,30')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a);
}

function load(env = process.env) {
  const pollSeconds = Number(env.POLL_SECONDS || 180);
  if (!Number.isFinite(pollSeconds) || pollSeconds < 30) throw new Error('POLL_SECONDS must be a number >= 30');
  return {
    discordToken: env.DISCORD_TOKEN || '',
    cocToken: env.COC_TOKEN || '',
    clanTag: normalizeClanTag(env.CLAN_TAG),
    // Optional: register slash commands to one server (instant) instead of globally (up to an hour).
    guildId: env.GUILD_ID || '',
    commandsChannelId: env.BOT_COMMANDS_CHANNEL_ID || '',
    statusChannelId: env.WAR_STATUS_CHANNEL_ID || '',
    alertsChannelId: env.WAR_ALERTS_CHANNEL_ID || '',
    statsChannelId: env.WAR_STATS_CHANNEL_ID || '',
    pollSeconds,
    alertMinutes: parseMinutes(env.ALERT_MINUTES),
    dataDir: env.DATA_DIR || path.join(__dirname, '..', 'data'),
  };
}

module.exports = { load, normalizeClanTag, parseMinutes };
