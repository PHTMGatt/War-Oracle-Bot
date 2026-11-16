// Pure war logic: remaining attacks, embeds, and which alert thresholds are due.
const { EmbedBuilder } = require('discord.js');

function relTime(isoLike) {
  // CoC times look like 20261116T043000.000Z; Date() cannot parse that directly.
  const d = parseTime(isoLike);
  return d ? `<t:${Math.floor(d.getTime() / 1000)}:R>` : 'N/A';
}

function parseTime(value) {
  if (!value) return null;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z$/.exec(value);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function remainingAttacks(war) {
  const apm = war.attacksPerMember ?? 0;
  const remaining = (war.clan?.members ?? [])
    .map((m) => ({ name: m.name, left: Math.max(0, apm - (Array.isArray(m.attacks) ? m.attacks.length : 0)) }))
    .filter((x) => x.left > 0)
    .sort((a, b) => b.left - a.left || a.name.localeCompare(b.name));
  const total = remaining.reduce((s, x) => s + x.left, 0);
  return { apm, remaining, total };
}

function listText(remaining, suffix, empty) {
  if (!remaining.length) return empty;
  return remaining
    .slice(0, 25)
    .map((x) => `• **${x.name}**: ${x.left} ${suffix}`)
    .join('\n');
}

function warStatusEmbed(war) {
  const state = war.state ?? 'UNKNOWN';
  const { apm, remaining, total } = remainingAttacks(war);
  const timing =
    state === 'preparation' || state === 'PREPARATION'
      ? `War starts: ${relTime(war.startTime)}`
      : `War ends: ${relTime(war.endTime)}`;
  return new EmbedBuilder()
    .setTitle(`⚔️ War Status: ${war.clan?.name ?? 'Your Clan'} vs ${war.opponent?.name ?? 'Opponent'}`)
    .setDescription(`**State:** ${state}\n**${timing}**`)
    .addFields(
      { name: 'Remaining attacks', value: `${total}`, inline: true },
      { name: 'Attacks per member', value: `${apm}`, inline: true },
      { name: 'Who still has attacks', value: listText(remaining, 'left', '✅ Everyone has used all attacks.') }
    );
}

function warStatsEmbed(war) {
  const members = war.clan?.members ?? [];
  const { remaining } = remainingAttacks(war);
  const used = members.reduce((s, m) => s + (Array.isArray(m.attacks) ? m.attacks.length : 0), 0);
  return new EmbedBuilder()
    .setTitle(`🧮 War Stats (latest snapshot): ${war.clan?.name ?? 'Your Clan'} vs ${war.opponent?.name ?? 'Opponent'}`)
    .setDescription(`**State:** ${war.state ?? 'UNKNOWN'}`)
    .addFields(
      { name: 'Clan stars', value: `${war.clan?.stars ?? 0}`, inline: true },
      { name: 'Destruction', value: `${Number(war.clan?.destructionPercentage ?? 0).toFixed(2)}%`, inline: true },
      { name: 'Attacks used', value: `${used}`, inline: true },
      { name: 'Missed attacks', value: listText(remaining, 'missed', '✅ No missed attacks (in snapshot).') }
    );
}

function warId(clanTag, war) {
  return `${clanTag}_${war.startTime || war.preparationStartTime || 'unknown'}`;
}

// Thresholds (minutes) that are due now and not fired yet. Mutates `fired` so each alert is once per war.
function dueThresholds({ war, clanTag, thresholds, fired, now = Date.now() }) {
  if (war.state !== 'inWar' && war.state !== 'IN_WAR') return [];
  const end = parseTime(war.endTime);
  if (!end) return [];
  const minutesLeft = (end.getTime() - now) / 60000;
  if (!remainingAttacks(war).remaining.length) return [];
  const id = warId(clanTag, war);
  const due = [];
  for (const t of thresholds) {
    const key = `${id}:${t}`;
    if (minutesLeft <= t && !fired.has(key)) {
      fired.add(key);
      due.push(t);
    }
  }
  return due;
}

function alertEmbed(war, threshold) {
  const { remaining } = remainingAttacks(war);
  return new EmbedBuilder()
    .setTitle(`🚨 War Alert: ${Math.round(threshold)}m left`)
    .setDescription(`Time left: ${relTime(war.endTime)}\n\n**Still has attacks:**\n${listText(remaining, 'left', '')}`);
}

module.exports = { parseTime, relTime, remainingAttacks, warStatusEmbed, warStatsEmbed, warId, dueThresholds, alertEmbed };
