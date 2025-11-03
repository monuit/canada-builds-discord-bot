// MARK: - Extractive Summarizer Service
// Deterministic summaries using sentence scoring + MMR selection

import { MessageForSummary } from './OpenAIService';
import { topicService } from './TopicService';

export interface ExtractiveSummaryResult {
  summary: string;
  tokensUsed: { input: number; output: number };
  cost: number;
  selectedIds: string[];
}

interface SentenceDoc {
  id: string;
  author: string;
  original: string;
  normalized: string;
  tokens: string[];
  ngrams: string[];
  tf: Map<string, number>;
  uniqueTokens: Set<string>;
  length: number;
  position: number;
  timestamp: Date;
}

const DECISION_REGEX = /(decide|decided|approve|approved|ship|shipping|shipped|blocked|blocker|eta|owner)/i;

class Summarizer {
  private readonly stopwords = new Set<string>([
    'a', 'about', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
    'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'did',
    'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has',
    'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i',
    'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my', 'myself',
    'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours',
    'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that',
    'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those',
    'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when',
    'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'you', 'your', 'yours', 'yourself',
    'yourselves', 'ai', 'canada', 'builds', 'project', 'team',
  ]);

  summarize(messages: MessageForSummary[], topic: string): ExtractiveSummaryResult {
    if (messages.length === 0) {
      return this.emptyResult();
    }

    const sentences = this.buildSentenceDocs(messages);

    if (sentences.length === 0) {
      return this.emptyResult();
    }

    const topicInfo = topicService.find(topic) ?? null;
    const topicTokens = this.buildTopicTokens(
      topicInfo?.keywords ?? [],
      topicInfo?.bigrams ?? [],
      topic,
    );

    const docFreq = this.buildDocumentFrequency(sentences);
    const scores = sentences.map((sentence, index) =>
      this.computeSentenceScore(sentence, docFreq, sentences.length, topicTokens, index, sentences.length),
    );

    const selected = this.selectByMMR(sentences, scores, 4);

    if (selected.length === 0) {
      return this.fallback(messages);
    }

    const capped = this.enforceCharacterLimit(sentences, selected, 380);
    return this.formatSummary(capped);
  }

  private emptyResult(): ExtractiveSummaryResult {
    return {
      summary: 'No notable discussion captured in this window.',
      tokensUsed: { input: 0, output: 0 },
      cost: 0,
      selectedIds: [],
    };
  }

  private fallback(messages: MessageForSummary[]): ExtractiveSummaryResult {
    const top = messages.slice(0, Math.min(3, messages.length));
    const bullets = top.map(msg => this.formatBullet(msg.content, msg.authorUsername));
    return {
      summary: bullets.join('\n') || 'No notable discussion captured in this window.',
      tokensUsed: { input: 0, output: 0 },
      cost: 0,
      selectedIds: top.map(msg => msg.id),
    };
  }

  private buildSentenceDocs(messages: MessageForSummary[]): SentenceDoc[] {
    const docs: SentenceDoc[] = [];
    let position = 0;

    for (const message of messages) {
      const sanitized = this.stripFormatting(message.content ?? '');
      const originalSentences = this.splitSentences(sanitized);

      for (const sentence of originalSentences) {
        const normalized = this.normalize(sentence);
        if (!normalized) {
          continue;
        }

        const tokens = this.tokenize(normalized).map(token => this.stem(token));
        const filtered = tokens.filter(token =>
          token.length >= 2 && token.length <= 24 && !this.stopwords.has(token),
        );
        const ngrams = this.buildNgrams(filtered);
        const combined = [...filtered, ...ngrams];

        if (combined.length === 0) {
          continue;
        }

        const tf = new Map<string, number>();
        for (const token of combined) {
          tf.set(token, (tf.get(token) ?? 0) + 1);
        }

        docs.push({
          id: message.id,
          author: message.authorUsername,
          original: sentence.trim(),
          normalized,
          tokens: filtered,
          ngrams,
          tf,
          uniqueTokens: new Set(combined),
          length: combined.length,
          position,
          timestamp: message.timestamp,
        });

        position += 1;
      }
    }

    return docs;
  }

  private stripFormatting(content: string): string {
    return content
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]+`/g, ' ')
      .replace(/^>.*$/gm, ' ')
      .replace(/https?:\/\/\S+/gi, ' [link] ')
      .replace(/<@!?\d+>/g, ' member ')
      .replace(/<#[^>]+>/g, ' channel ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private splitSentences(content: string): string[] {
    const sentences: string[] = [];
    let buffer = '';

    for (const part of content.split(/([.!?])/)) {
      buffer += part;
      if (/[.!?]/.test(part)) {
        const trimmed = buffer.trim();
        if (trimmed.length > 0) {
          sentences.push(trimmed);
        }
        buffer = '';
      }
    }

    const tail = buffer.trim();
    if (tail.length > 0) {
      sentences.push(tail);
    }

    return sentences;
  }

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\[\]\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private tokenize(text: string): string[] {
    return text.split(/[^a-z0-9\[\]]+/).filter(Boolean);
  }

  private stem(token: string): string {
    if (token.length <= 4) {
      return token;
    }
    if (token.endsWith('ing') || token.endsWith('ers')) {
      return token.slice(0, -3);
    }
    if (token.endsWith('ed') || token.endsWith('es')) {
      return token.slice(0, -2);
    }
    if (token.endsWith('s') && token.length > 3) {
      return token.slice(0, -1);
    }
    return token;
  }

  private buildNgrams(tokens: string[]): string[] {
    const ngrams: string[] = [];
    for (let i = 0; i < tokens.length - 1; i++) {
      ngrams.push(`${tokens[i]}_${tokens[i + 1]}`);
    }
    for (let i = 0; i < tokens.length - 2; i++) {
      ngrams.push(`${tokens[i]}_${tokens[i + 1]}_${tokens[i + 2]}`);
    }
    return ngrams;
  }

  private buildDocumentFrequency(docs: SentenceDoc[]): Map<string, number> {
    const df = new Map<string, number>();
    for (const doc of docs) {
      for (const token of doc.uniqueTokens) {
        df.set(token, (df.get(token) ?? 0) + 1);
      }
    }
    return df;
  }

  private buildTopicTokens(keywords: string[], bigrams: string[], topic: string): Set<string> {
    const tokens = new Set<string>();
    [...keywords, ...bigrams, topic].forEach(entry => {
      this.tokenize(entry.toLowerCase()).forEach(token => tokens.add(this.stem(token)));
    });
    return tokens;
  }

  private computeSentenceScore(
    doc: SentenceDoc,
    docFreq: Map<string, number>,
    totalDocs: number,
    topicTokens: Set<string>,
    index: number,
    total: number,
  ): number {
    let score = 0;

    for (const [token, count] of doc.tf.entries()) {
      const tf = count / doc.length;
      const df = docFreq.get(token) ?? 1;
      const idf = Math.log((totalDocs + 1) / (df + 1)) + 1;
      const topicBoost = topicTokens.has(token) ? 1.2 : 1;
      score += tf * idf * topicBoost;
    }

    if (index <= 2) {
      score += 0.2;
    }

    const hasDecision = DECISION_REGEX.test(doc.normalized);
    if (hasDecision) {
      score += 0.6;
      if (index >= total - 2) {
        score += 0.3;
      }
    }

    if (/\d/.test(doc.original)) {
      score += 0.2;
    }

    if (doc.normalized.includes('[link]')) {
      score += 0.2;
    }

    return score;
  }

  private selectByMMR(docs: SentenceDoc[], scores: number[], maxItems: number): number[] {
    const lambda = 0.72;
    const selected: number[] = [];
    const candidates = scores
      .map((score, index) => ({ index, score }))
      .sort((a, b) => b.score - a.score)
      .map(item => item.index);

    while (candidates.length > 0 && selected.length < maxItems) {
      let bestIndex = candidates[0];
      let bestScore = -Infinity;

      for (const candidate of candidates) {
        const relevance = scores[candidate];
        const redundancy = this.maxSimilarity(docs[candidate], selected.map(idx => docs[idx]));
        const mmr = lambda * relevance - (1 - lambda) * redundancy;

        if (mmr > bestScore) {
          bestScore = mmr;
          bestIndex = candidate;
        }
      }

      selected.push(bestIndex);
      const removeIdx = candidates.indexOf(bestIndex);
      candidates.splice(removeIdx, 1);
    }

    return selected.sort((a, b) => a - b);
  }

  private maxSimilarity(doc: SentenceDoc, others: SentenceDoc[]): number {
    if (others.length === 0) {
      return 0;
    }

    let max = 0;
    for (const other of others) {
      const overlap = [...doc.uniqueTokens].filter(token => other.uniqueTokens.has(token)).length;
      const union = new Set([...doc.uniqueTokens, ...other.uniqueTokens]).size || 1;
      const similarity = overlap / union;
      if (similarity > max) {
        max = similarity;
      }
    }
    return max;
  }

  private enforceCharacterLimit(docs: SentenceDoc[], selected: number[], limit: number): SentenceDoc[] {
    const chosen: SentenceDoc[] = [];
    let total = 0;

    for (const index of selected) {
      const candidate = docs[index];
      const projected = total + candidate.original.length;
      if (chosen.length >= 4) {
        break;
      }
      if (projected > limit && chosen.length > 0) {
        break;
      }
      chosen.push(candidate);
      total = projected;
    }

    return chosen;
  }

  private formatSummary(sentences: SentenceDoc[]): ExtractiveSummaryResult {
    const bullets = sentences.map(sentence =>
      this.formatBullet(sentence.original, sentence.author),
    );

    return {
      summary: bullets.join('\n') || 'No notable discussion captured in this window.',
      tokensUsed: { input: 0, output: 0 },
      cost: 0,
      selectedIds: sentences.map(sentence => sentence.id),
    };
  }

  private formatBullet(sentence: string, author: string): string {
    const trimmed = sentence.replace(/\s+/g, ' ').trim();
    const preview = trimmed.length > 180 ? `${trimmed.slice(0, 177)}…` : trimmed;
    return `• ${author}: ${preview}`;
  }
}

export const summarizer = new Summarizer();
