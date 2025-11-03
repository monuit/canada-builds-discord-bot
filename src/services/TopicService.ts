// MARK: - Topic Service
// CRUD + cache for curated topic taxonomy

import { Topic, ITopic } from '../models/Topic';
import { logger } from '../utils/logger';

class TopicService {
  private cache = new Map<string, ITopic>();

  async initialize(): Promise<void> {
    const all = await Topic.find({}).limit(500).exec();
    for (const t of all) {
      this.cache.set(t.slug, t);
    }
    logger.info('TopicService initialized', { count: this.cache.size });

    if (this.cache.size === 0) {
      await this.seedDefaults();
    }
  }

  async seedDefaults(): Promise<void> {
    const defaults: Array<Partial<ITopic>> = [
      {
        slug: 'policy',
        keywords: ['policy', 'bill', 'regulation', 'legislation', 'permit', 'permitting', 'ministerial'],
        bigrams: ['environmental assessment', 'impact assessment', 'public consultation'],
        boost: 1.2,
      },
      {
        slug: 'energy',
        keywords: ['pipeline', 'transmission', 'grid', 'hydro', 'nuclear', 'uranium', 'oil', 'lng', 'gas'],
        bigrams: ['natural resources', 'power purchase'],
        boost: 1.1,
      },
      {
        slug: 'builder-mp',
        keywords: ['builder-mp', 'milestone', 'release', 'deploy', 'rollback', 'bugfix'],
        bigrams: ['feature flag', 'release notes'],
        boost: 1.3,
      },
    ];

    for (const def of defaults) {
      try {
        const created = await Topic.findOneAndUpdate({ slug: def.slug }, { $set: def }, { upsert: true, new: true });
        this.cache.set(created.slug, created);
      } catch (err) {
        logger.warn('Failed to seed topic', { slug: def.slug, err });
      }
    }

    logger.info('TopicService seeded defaults', { seeded: defaults.length });
  }

  list(): ITopic[] {
    return Array.from(this.cache.values());
  }

  async create(topic: { slug: string; keywords?: string[]; bigrams?: string[]; boost?: number }): Promise<ITopic> {
    const normalized = topic.slug.toLowerCase();
    const created = await Topic.findOneAndUpdate(
      { slug: normalized },
      {
        $set: {
          keywords: topic.keywords ?? [],
          bigrams: topic.bigrams ?? [],
          boost: topic.boost ?? 1.0,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          slug: normalized,
          createdAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    this.cache.set(created.slug, created);
    logger.info('Topic saved', { slug: created.slug });
    return created;
  }

  async remove(slug: string): Promise<boolean> {
    const normalized = slug.toLowerCase();
    const res = await Topic.findOneAndDelete({ slug: normalized }).exec();
    if (res) {
      this.cache.delete(normalized);
      logger.info('Topic removed', { slug: normalized });
      return true;
    }
    return false;
  }

  async refresh(slug: string): Promise<ITopic | null> {
    const normalized = slug.toLowerCase();
    const doc = await Topic.findOne({ slug: normalized }).exec();
    if (doc) this.cache.set(normalized, doc);
    return doc;
  }

  find(slug: string): ITopic | null {
    return this.cache.get(slug.toLowerCase()) ?? null;
  }
}

export const topicService = new TopicService();
