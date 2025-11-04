# Build Canada Discord Bot

AI-powered community assistant for Build Canada. It combines personalized digests, consent-aware onboarding, AI topic discovery, highlight relays, and lightweight productivity tooling.

## Features

- **Consent-Driven Onboarding** – DM-based flow records explicit consent, stores preferences in Mongo, and supports one-click revoke.
- **AI Thread Tagging & Search** – OpenAI suggestions keep thread metadata fresh and searchable through `/thread-tag` and `/where`.
- **Highlight Relays** – Star reactions mirror notable posts into a configured showcase channel with live star counts.
- **Task Tracking** – Channel/thread-scoped todos with `/todo` commands, partial ID completion, and formatted summaries.
- **Digest Notifications** – Subscription-driven digests routed through the message indexer, cron manager, and DM delivery stack.
- **Guild Inventory Tracking** – Automatic scans capture channels, threads (including archived), and members with subscription status snapshots.
- **Admin Controls** – Guild-level defaults for onboarding, highlight channels, and moderation tools via `/admin-config`.
- **Observability & Error Routing** – Structured logging plus error notifier surfacing DM failures and onboarding issues.

## Discord Configuration

1. Enable the following **Privileged Gateway Intents**:
   - `Server Members`
   - `Message Content`
   - `Guild Message Reactions`
2. Under **OAuth2 → URL Generator** include scopes `bot` and `applications.commands`. Use [/add me](https://discord.com/oauth2/authorize?client_id=1434775201433780236&permissions=275414846528&integration_type=0&scope=bot+applications.commands) for a preconfigured invite.
3. Required permissions when inviting the bot:
   - `View Channels`
   - `Send Messages`
   - `Send Messages in Threads`
   - `Manage Webhooks`
   - `Add Reactions`
   - `Manage Threads`
   - `Read Message History`
4. After onboarding the bot, give it access to:
   - A highlight/showcase channel (for ⭐ relays)
   - An error notification channel (configured previously)

## Prerequisites

- Node.js 18+
- MongoDB Atlas (or local MongoDB)
- OpenAI API key with access to GPT-5-nano
- Discord bot token configured with the intents above

## Setup

```bash
# Install dependencies
npm install

# Copy example environment and populate secrets
cp .env.example .env

# Run the bot in watch mode
npm run dev

# Compile for production
npm run build
```

### Docker Compose

Run the bot and MongoDB locally with a single command:

```bash
cp .env.example .env            # populate Discord + OpenAI secrets
docker compose up --build       # starts bot + mongo:6 locally
```

The compose stack exposes port `3000` for health checks and maps MongoDB to `localhost:27017`. Update `MONGODB_URI` in `.env` if you change the database name or credentials.

Key environment variables:

| Variable | Description |
| --- | --- |
| `DISCORD_TOKEN` | Discord bot token |
| `DISCORD_CLIENT_ID` | Application/client ID |
| `DISCORD_GUILD_ID` | Default guild for command registration |
| `DISCORD_OWNER_IDS` | Comma-separated user IDs that bypass admin permission checks |
| `MONGODB_URI` | MongoDB connection string |
| `OPENAI_API_KEY` | OpenAI API key |
| `ERROR_CHANNEL_ID` | (Optional) channel for `ErrorNotifier` overrides |
| `INVENTORY_SCAN_CRON` | (Optional) cron expression for nightly inventory refresh (default `0 4 * * *`) |

## Highlight Relay Workflow

1. A member reacts to a message with ⭐.
2. `BookmarkRelayService` checks permissions and guild config, then mirrors the post into the highlight channel.
3. Additional ⭐ reactions update the embed star count; removing the final ⭐ deletes the highlight.

## Onboarding Data Lifecycle

1. `OnboardingManager` opens a DM with consent details using `OnboardingPromptBuilder`.
2. Responses are persisted in `OnboardingSession` documents with TTL-based expiry.
3. Consent decisions update the `ConsentLedger`, triggering auto-subscriptions and message index refreshes.
4. Revocation disables DM digests and clears default keyword subscriptions.

## Guild Inventory Lifecycle

1. `GuildInventoryService` runs a one-time full scan on startup (and automatically reboots if previous inventory collections are empty), capturing channels, threads, and members.
2. Event listeners record new channels, threads, and members without reprocessing existing records.
3. A nightly cron (default 04:00 UTC) refreshes metadata, paginates archived threads, and marks them with the `archived` flag.
4. Inventory data is stored in `GuildChannelIndex`, `GuildMemberIndex`, and `GuildInventoryState`, allowing downstream reports on unsubscribed vs. subscribed members.

## Project Layout

```text
src/
  commands/                # Slash command handlers
   models/                  # Mongo schemas (ConsentLedger, ThreadTag, Task, etc.)
      GuildChannelIndex.ts   # Channel and thread inventory records
      GuildMemberIndex.ts    # Member inventory with subscription flags
      GuildInventoryState.ts # Scan checkpoints and nightly cron config
  services/
    onboarding/            # Prompt builder & status formatter
   BookmarkRelayService   # Star highlight mirroring
    ConsentService         # Consent ledger utility helpers
    OnboardingManager      # Core onboarding workflow
      GuildInventoryService  # Channel/thread/member inventory scans
    ThreadTagService       # AI/manual tagging and embeds
    SearchService          # Topic and message discovery
    TodoManager            # Task CRUD and formatting
    GuildFeatureConfigService # Guild-level settings cache
    ... existing services (CronManager, DigestGenerator, etc.)
   utils/                   # Logger, rate limiter, color hashing
```

## Testing & Quality Gates

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Unit tests (Vitest)
npm test

```

Unit tests cover onboarding formatting utilities and additional suites should extend coverage as new business logic ships.

## Deployment

The project ships with a `railway.toml` file. For Railway or similar platforms:

1. Set environment variables (Discord token, Mongo URI, OpenAI key, intents configuration flags).
2. Ensure build command `npm run build` runs before `npm start`.
3. Configure health checks to hit the express endpoint exposed in `src/health.ts`.

## Support

For bug reports or feature requests, open an issue on GitHub or reach out to the Build Canada maintainers.
│   ├── OpenAIService     # GPT-4o-mini integration
