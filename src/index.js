// War Oracle: Clash of Clans war intelligence + channel safety tools in one Discord bot.
const fs = require('fs');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { load } = require('./config');
const { createClient } = require('./coc');
const { dueThresholds, alertEmbed } = require('./war');
const commands = require('./commands');

function main() {
  const config = load();
  if (!config.discordToken) {
    console.error('DISCORD_TOKEN is not set. Put it in .env or the process environment.');
    process.exit(1);
  }
  if (!config.cocToken || !config.clanTag) console.warn('COC_TOKEN or CLAN_TAG missing: war commands and alerts are disabled.');

  fs.mkdirSync(config.dataDir, { recursive: true });
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const coc = createClient({ token: config.cocToken, clanTag: config.clanTag });
  const state = { alertsEnabled: true };
  const fired = new Set();

  const sendTo = async (channelId, payload) => (await client.channels.fetch(channelId)).send(payload);

  let polling = false;
  async function pollWar() {
    if (!state.alertsEnabled || !config.cocToken || !config.clanTag || polling) return;
    polling = true;
    try {
      const war = await coc.currentWar();
      fs.writeFileSync(commands.snapshotFile(config), JSON.stringify(war, null, 2), 'utf8');
      const due = dueThresholds({ war, clanTag: config.clanTag, thresholds: config.alertMinutes, fired });
      if (due.length && !config.alertsChannelId) console.warn('WAR_ALERTS_CHANNEL_ID not set: alerts due but nowhere to post.');
      else for (const t of due) await sendTo(config.alertsChannelId, { embeds: [alertEmbed(war, t)] });
    } catch (e) {
      if (e.status !== 404) console.warn('War poll failed:', e.message);
    } finally {
      polling = false;
    }
  }

  client.once(Events.ClientReady, async () => {
    console.log(`War Oracle online as ${client.user.tag}`);
    try {
      if (config.guildId) await (await client.guilds.fetch(config.guildId)).commands.set(commands.definitions);
      else await client.application.commands.set(commands.definitions);
      console.log('Slash commands registered');
    } catch (err) {
      console.error('Could not register slash commands:', err.message);
    }
    pollWar();
    setInterval(pollWar, config.pollSeconds * 1000);
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (interaction.isChatInputCommand()) commands.handle(interaction, { config, coc, state, sendTo });
  });

  client.login(config.discordToken);
}

if (require.main === module) main();
