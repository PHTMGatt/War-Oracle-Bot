require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if War Oracle is online"),

  new SlashCommandBuilder()
    .setName("war")
    .setDescription("War tools for Clash of Clans")
    .addSubcommand(sub =>
      sub.setName("status").setDescription("Post current war status in #war-status")
    )
    .addSubcommand(sub =>
      sub
        .setName("alerts")
        .setDescription("Turn war alerts on/off (posts in #war-alerts)")
        .addStringOption(opt =>
          opt
            .setName("mode")
            .setDescription("on/off")
            .setRequired(true)
            .addChoices(
              { name: "on", value: "on" },
              { name: "off", value: "off" }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName("stats").setDescription("Post last saved snapshot in #war-stats")
    ),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("Deploying slash commands...");
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("✅ Slash commands deployed.");
  } catch (error) {
    console.error("❌ Failed to deploy commands:", error);
  }
})();
