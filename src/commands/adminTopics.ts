// MARK: - Admin Topics Command
// Manage curated topic taxonomy (admin only)

import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { topicService } from '../services/TopicService';
import { logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('admin-topics')
  .setDescription('Manage curated topic taxonomy (admin only)')
  .addSubcommand(sub =>
    sub
      .setName('add')
      .setDescription('Add or update a topic')
      .addStringOption(opt => opt.setName('slug').setDescription('Topic slug (unique)').setRequired(true))
      .addStringOption(opt => opt.setName('keywords').setDescription('Comma-separated keywords').setRequired(false))
      .addStringOption(opt => opt.setName('bigrams').setDescription('Comma-separated bigrams').setRequired(false))
      .addNumberOption(opt => opt.setName('boost').setDescription('Boost multiplier').setRequired(false)),
  )
  .addSubcommand(sub =>
    sub.setName('remove').setDescription('Remove a topic by slug').addStringOption(opt => opt.setName('slug').setDescription('Topic slug').setRequired(true)),
  )
  .addSubcommand(sub => sub.setName('list').setDescription('List curated topics'));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: '❌ Use this command inside a server.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (!interaction.memberPermissions?.has('Administrator')) {
    await interaction.reply({ content: '❌ Administrator permission required.', flags: MessageFlags.Ephemeral });
    return;
  }

  const sub = interaction.options.getSubcommand(true) as 'add' | 'remove' | 'list';

  try {
    if (sub === 'add') {
      const slug = interaction.options.getString('slug', true).toLowerCase();
      const keywordsRaw = interaction.options.getString('keywords') ?? '';
      const bigramsRaw = interaction.options.getString('bigrams') ?? '';
      const boost = interaction.options.getNumber('boost') ?? 1.0;

      const keywords = keywordsRaw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const bigrams = bigramsRaw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const created = await topicService.create({ slug, keywords, bigrams, boost });

      await interaction.reply({ content: `✅ Topic **${created.slug}** saved.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'remove') {
      const slug = interaction.options.getString('slug', true);
      const ok = await topicService.remove(slug);
      if (ok) {
        await interaction.reply({ content: `✅ Topic **${slug}** removed.`, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: `⚠️ Topic **${slug}** not found.`, flags: MessageFlags.Ephemeral });
      }
      return;
    }

    // list
    const topics = topicService.list();
    if (topics.length === 0) {
      await interaction.reply({ content: 'No topics configured yet.', flags: MessageFlags.Ephemeral });
      return;
    }

    const lines = topics.map(t => `• **${t.slug}** — keywords: ${t.keywords.join(', ') || '-'} — boost: ${t.boost}`);
    await interaction.reply({ content: `Curated topics:\n${lines.join('\n')}`, flags: MessageFlags.Ephemeral });
  } catch (error: any) {
    logger.error('admin-topics failed', { guildId: interaction.guildId, error: error.message });
    await interaction.reply({ content: '❌ Could not complete that action.', flags: MessageFlags.Ephemeral });
  }
}
