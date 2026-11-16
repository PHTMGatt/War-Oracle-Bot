// One command set: war tools (from War Oracle) plus channel safety tools (from Clash Commander).
const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, MessageFlags } = require('discord.js');
const { warStatusEmbed, warStatsEmbed } = require('./war');

const startedAt = Date.now();

const definitions = [
  new SlashCommandBuilder().setName('ping').setDescription('Check that the bot is online'),
  new SlashCommandBuilder()
    .setName('war')
    .setDescription('War tools for Clash of Clans')
    .addSubcommand((s) => s.setName('status').setDescription('Post current war status'))
    .addSubcommand((s) =>
      s
        .setName('alerts')
        .setDescription('Turn war alerts on or off')
        .addStringOption((o) =>
          o.setName('mode').setDescription('on or off').setRequired(true).addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' })
        )
    )
    .addSubcommand((s) => s.setName('stats').setDescription('Post the last saved war snapshot')),
  new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Lock this channel (no sending messages for @everyone)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('cleanup')
    .setDescription('Delete recent bot messages in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addIntegerOption((o) => o.setName('count').setDescription('How many (default 20)').setMinValue(1).setMaxValue(50)),
  new SlashCommandBuilder()
    .setName('whoami')
    .setDescription('Show the bot identity and permissions in this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
].map((c) => c.toJSON());

// Discord already hides these from members without the permission; this is the server-side check.
function requires(interaction, flag) {
  return interaction.memberPermissions?.has(flag) ?? false;
}

function snapshotFile(config) {
  return path.join(config.dataDir, 'war_snapshot.json');
}

// ctx: { config, coc, state: { alertsEnabled }, sendTo(channelId, payload) }
async function handle(interaction, ctx) {
  const { config } = ctx;
  const eph = { flags: MessageFlags.Ephemeral };

  if (config.commandsChannelId && interaction.channelId !== config.commandsChannelId) {
    return interaction.reply({ content: `Use commands in <#${config.commandsChannelId}>.`, ...eph });
  }

  try {
    switch (interaction.commandName) {
      case 'ping': {
        const s = Math.floor((Date.now() - startedAt) / 1000);
        return interaction.reply({ content: `🧙‍♂️ Online. Uptime ${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m.`, ...eph });
      }

      case 'war': {
        await interaction.deferReply(eph);
        const sub = interaction.options.getSubcommand();

        if (sub === 'alerts') {
          const mode = interaction.options.getString('mode', true);
          ctx.state.alertsEnabled = mode === 'on';
          return interaction.editReply(`✅ War alerts are **${mode.toUpperCase()}** (until the bot restarts).`);
        }

        if (sub === 'stats') {
          const file = snapshotFile(config);
          if (!fs.existsSync(file)) return interaction.editReply('⚠️ No snapshot saved yet. Run `/war status` once or wait a few minutes.');
          const target = config.statsChannelId || interaction.channelId;
          await ctx.sendTo(target, { embeds: [warStatsEmbed(JSON.parse(fs.readFileSync(file, 'utf8')))] });
          return interaction.editReply(`✅ Posted in <#${target}>.`);
        }

        // status
        try {
          const war = await ctx.coc.currentWar();
          const target = config.statusChannelId || interaction.channelId;
          await ctx.sendTo(target, { embeds: [warStatusEmbed(war)] });
          return interaction.editReply(`✅ Posted in <#${target}>${war.state === 'notInWar' ? ' (no active war)' : ''}.`);
        } catch (e) {
          if (e.status === 404) return interaction.editReply('⚠️ No active war right now.');
          if (e.status === 403) return interaction.editReply('❌ Clash API refused the key (check the key and its allowed IP).');
          return interaction.editReply(`❌ ${e.message}`);
        }
      }

      case 'lockdown':
      case 'unlock': {
        if (!requires(interaction, PermissionFlagsBits.ManageChannels)) return interaction.reply({ content: 'You need Manage Channels.', ...eph });
        const lock = interaction.commandName === 'lockdown';
        await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: lock ? false : null });
        return interaction.reply({ content: lock ? '🔒 Channel locked.' : '🔓 Channel unlocked.', ...eph });
      }

      case 'cleanup': {
        if (!requires(interaction, PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: 'You need Manage Messages.', ...eph });
        const count = interaction.options.getInteger('count') ?? 20;
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const mine = messages.filter((m) => m.author.id === interaction.client.user.id).first(count);
        const deleted = mine.length ? await interaction.channel.bulkDelete(mine, true) : { size: 0 };
        return interaction.reply({ content: `🧹 Deleted ${deleted.size} of my messages.`, ...eph });
      }

      case 'whoami': {
        if (!requires(interaction, PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: 'You need Manage Server.', ...eph });
        const me = interaction.guild.members.me;
        const perms = new PermissionsBitField(me.permissions).toArray().join(', ');
        return interaction.reply({
          embeds: [
            {
              title: '🤖 Bot identity',
              fields: [
                { name: 'Server', value: interaction.guild.name, inline: true },
                { name: 'Bot', value: me.user.tag, inline: true },
                { name: 'Roles', value: me.roles.cache.map((r) => r.name).join(', ').slice(0, 900) || 'None' },
                { name: 'Permissions', value: perms.slice(0, 900) || 'None' },
              ],
            },
          ],
          ...eph,
        });
      }

      default:
        return interaction.reply({ content: 'Unknown command.', ...eph });
    }
  } catch (err) {
    console.error(`/${interaction.commandName} failed:`, err);
    const msg = 'Something went wrong running that command.';
    if (interaction.deferred || interaction.replied) return interaction.editReply(msg).catch(() => {});
    return interaction.reply({ content: msg, ...eph }).catch(() => {});
  }
}

module.exports = { definitions, handle, snapshotFile };
