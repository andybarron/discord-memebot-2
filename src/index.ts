import assert from "node:assert/strict";
import * as discord from "discord.js";
import * as dat from "discord-api-types/v10";
import { MemeClient } from "./meme.ts";

const CREATE_BUTTON_PREFIX = "create_";
const BUILDER_MODAL_PREFIX = "builder_";

function env(key: string): string {
  const value = process.env[key];
  if (typeof value !== "string") {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

const discordClientId = env("DISCORD_CLIENT_ID");
const discordToken = env("DISCORD_TOKEN");
const imgflipUsername = env("IMGFLIP_USERNAME");
const imgflipPassword = env("IMGFLIP_PASSWORD");

const memes = new MemeClient(imgflipUsername, imgflipPassword);

const client = new discord.Client({
  intents: [discord.GatewayIntentBits.Guilds],
});

console.log("logging in...");
await client.login(discordToken);
console.log("OK");

console.log("waiting for ready event...");
await new Promise((resolve) => {
  client.once("ready", resolve);
});
console.log("OK");

assert(client.isReady());

const rest = new discord.REST().setToken(discordToken);

const command = new discord.SlashCommandBuilder()
  .setName("meme")
  .setDescription("Create a meme")
  .addStringOption((opt) =>
    opt
      .setName("template")
      .setDescription("Name of meme template to use")
      .setRequired(true)
      .setAutocomplete(true)
  );

async function handleInteraction(interaction: discord.Interaction) {
  if (interaction.isAutocomplete() && interaction.commandName === "meme") {
    await handleMemeAutocomplete(interaction);
    return;
  }
  if (interaction.isChatInputCommand() && interaction.commandName === "meme") {
    await handleMemeSelection(interaction);
    return;
  }
  if (interaction.isButton()) {
    await handleButton(interaction);
    return;
  }
  if (interaction.isModalSubmit()) {
    await handleModalSubmit(interaction);
    return;
  }
  console.log({ interaction });
}

async function handleModalSubmit(interaction: discord.ModalSubmitInteraction) {
  const customId = interaction.customId;
  if (!customId.startsWith(BUILDER_MODAL_PREFIX)) {
    return;
  }
  const templateId = customId.slice(BUILDER_MODAL_PREFIX.length);
  const template = await memes.getTemplateById(templateId);
  assert(template);
  const captions = Array.from(
    { length: template.boxCount },
    (_, i) => interaction.fields.getTextInputValue(i.toString()).trim() || " "
  );
  const { url } = await memes.createMeme(templateId, captions);

  // button to create another meme with the same template
  const createButton = new discord.ButtonBuilder()
    .setCustomId(CREATE_BUTTON_PREFIX + templateId)
    .setLabel("Reuse this template")
    .setStyle(discord.ButtonStyle.Primary);

  const buttons =
    new discord.ActionRowBuilder<discord.ButtonBuilder>().addComponents(
      createButton
    );

  const embed = new discord.EmbedBuilder().setImage(url).setFooter({
    text: `Created by ${interaction.user.displayName} with /meme`,
    iconURL: interaction.user.avatarURL() ?? undefined,
  });

  await interaction.reply({
    components: [buttons],
    embeds: [embed],
  });
}

async function handleButton(interaction: discord.ButtonInteraction) {
  const buttonId = interaction.customId;
  if (!buttonId.startsWith(CREATE_BUTTON_PREFIX)) {
    return;
  }
  const templateId = buttonId.slice(CREATE_BUTTON_PREFIX.length);
  const template = await memes.getTemplateById(templateId);
  assert(template);

  const { boxCount } = template;
  assert(boxCount > 0);

  const modal = new discord.ModalBuilder()
    .setTitle("Create meme")
    .setCustomId(BUILDER_MODAL_PREFIX + templateId);

  for (let i = 0; i < boxCount; i++) {
    const textInput = new discord.TextInputBuilder()
      .setRequired(false)
      .setCustomId(i.toString())
      .setLabel(`Text box ${i + 1}/${boxCount}`)
      .setStyle(discord.TextInputStyle.Short);
    const row =
      new discord.ActionRowBuilder<discord.TextInputBuilder>().addComponents(
        textInput
      );
    modal.addComponents(row);
  }

  await interaction.showModal(modal);
}

async function handleMemeSelection(
  interaction: discord.ChatInputCommandInteraction
) {
  const selectedTemplateName = interaction.options.getString("template", true);
  const templates = await memes.getTopMemeTemplates();
  const template = templates.find((t) => t.name === selectedTemplateName);
  if (!template) {
    await interaction.reply({
      content: "Invalid template",
      flags: discord.MessageFlags.Ephemeral,
    });
    return;
  }
  const { boxCount, id } = template;
  assert(boxCount > 0);

  const sampleCaptions = Array.from(
    { length: boxCount },
    (_, i) => `Text box ${i + 1}`
  );
  const { url } = await memes.createMeme(id, sampleCaptions);

  const embed = new discord.EmbedBuilder()
    .setImage(url)
    .setTitle(template.name);

  const createButton = new discord.ButtonBuilder()
    .setCustomId(CREATE_BUTTON_PREFIX + id)
    .setLabel("Create meme with this template")
    .setStyle(discord.ButtonStyle.Primary);

  const buttons =
    new discord.ActionRowBuilder<discord.ButtonBuilder>().addComponents(
      createButton
    );

  await interaction.reply({
    embeds: [embed],
    flags: discord.MessageFlags.Ephemeral,
    components: [buttons],
  });
}

async function handleMemeAutocomplete(
  interaction: discord.AutocompleteInteraction
) {
  const input = interaction.options.getFocused();
  const templates = await memes.getTopMemeTemplates();
  const matches = templates.filter((template) =>
    template.name.toLowerCase().includes(input.toLowerCase().trim())
  );
  const replies = matches.map((template) => ({
    name: template.name,
    value: template.name,
  }));
  await interaction.respond(replies.slice(0, 25));
}

console.log("updating slash commands...");
await rest.put(discord.Routes.applicationCommands(discordClientId), {
  body: [command.toJSON()] satisfies dat.RESTPutAPIApplicationCommandsJSONBody,
});
console.log("OK");

client.on("interactionCreate", async (interaction) => {
  try {
    await handleInteraction(interaction);
  } catch (error) {
    console.error(error);
    if (!interaction.isRepliable()) return;
    await interaction.reply({
      content: "Sorry, something went wrong :(",
      flags: discord.MessageFlags.Ephemeral,
    });
  }
});
console.log("listening for interactions");
