# Slash Command Usage Guide

This guide covers all 18 slash commands available in the Build Canada Discord bot.

## 📋 Table of Contents

- [User Commands](#user-commands)
- [Admin Commands](#admin-commands)

---

## User Commands

### `/subscribe`

Subscribe to keyword-based notifications with AI-powered digest summaries.

**Options:**

- `keywords` (required) - Comma-separated keywords (e.g., "rust, web3, backend")
- `cooldown_hours` (optional) - Hours between notifications (1-168, default: 24)
- `dm_enabled` (optional) - Receive notifications via DM (default: true)

**Example:**

```bash
/subscribe keywords:policy,energy cooldown_hours:24 dm_enabled:true
```

---

### `/unsubscribe`

Remove keyword subscriptions from your account. The command auto-suggests the keywords you currently follow, so you can quickly select exact values.

**Subcommands:**

- `keywords` – Provide a comma-separated list of keywords to remove. Autocomplete suggests your current subscriptions.
- `all` – Remove every keyword and delete the subscription.

**Tip:** Run `/my-subscriptions` first to copy/paste keywords or double-check what is active.

**Examples:**

```bash
/unsubscribe keywords keywords:policy,energy
/unsubscribe all
```

---

### `/my-subscriptions`

View your current keyword subscriptions and notification settings.

**Options:** None

**Example:**

```bash
/my-subscriptions
```

---

### `/digest-now`

Generate an instant digest, ignoring cooldown restrictions. Useful for testing or immediate updates.

**Options:**

- `hours` (optional) - Look back this many hours (1-168, default: 24)

**Example:**

```bash
/digest-now hours:48
```

---

### `/digest-history`

Review the most recent digests delivered to you.

**Options:**

- `limit` (optional) - Number of records to show (1-10, default: 5)

**Example:**

```bash
/digest-history limit:5
```

---

### `/ping`

Measure bot latency and uptime. Returns gateway latency, round-trip duration, and uptime since the bot came online.

**Options:** None

**Example:**

```bash
/ping
```

---

### `/botinfo`

Display bot metadata including version, uptime, cached guilds/channels, and developer attribution. Presented in an embed.

**Options:** None

**Example:**

```bash
/botinfo
```

### `/topics trending`

Surface trending topics and hot keywords drawn from indexed discussions.

**Options:** `hours` (optional, default 48), `limit` (optional, default 5)

**Example:** `/topics trending hours:72 limit:3`

**Output:** Lists top curated topics with mention counts, channel hotspots, and rising keywords.

### `/onboarding`

Manage your DM onboarding consent and automated subscriptions.

**Subcommands:**

- `start` - Restart the onboarding DM flow to review consent and pick topics
- `status` - View your current consent status and default topics
- `revoke` - Revoke consent and disable automated DMs

**Example:**

```bash
/onboarding start
/onboarding status
/onboarding revoke
```

### `/subscribe` → Schedule

Set your preferred digest delivery schedule after subscribing.

**Available schedules:**

- Daily Morning (09:00 EST)
- Daily Evening (20:00 EST)
- Twice Weekly (Mon & Thu at 18:00 EST)
- Twice Weekly (Tues & Fri at 18:00 EST)
- Weekly Recap (Monday at 15:00 EST)
- Weekly Recap (Friday at 15:00 EST)
- Manual only (no automatic DMs)

---

### `/where`

Search tagged threads and indexed discussions by topic keyword.

**Options:**

- `topic` (required) - Topic keyword to search for (e.g., grants, funding, ai)
- `limit` (optional) - Maximum number of matches (default: 5)

**Example:**

```bash
/where topic:energy limit:10
/where topic:policy
```

**Output:** Returns threads and messages tagged with the keyword, including hyperlinks and context.

---

### `/thread-tag`

Apply or refresh tags on the current thread for discovery. Use AI to suggest tags or manually specify them.

**Options:**

- `tags` (optional) - Comma-separated tags. Leave blank to request AI suggestions.

**Example:**

```bash
/thread-tag tags:infrastructure,policy,funding
/thread-tag  # (AI will suggest tags)
```

---

### `/todo`

Track lightweight tasks scoped to the current channel or thread.

**Subcommands:**

#### `add` - Add a new todo

- `description` (required) - What needs to get done?
- `assign` (optional) - Assign the task to someone
- `message` (optional) - Optional message link or ID to anchor this task

**Example:**

```bash
/todo add description:Review PR assign:@alice message:https://discord.com/channels/...
```

#### `list` - List open or completed todos

- `status` (optional) - Filter by status (pending, completed, all - default: pending)
- `assigned` (optional) - Only show tasks assigned to this member

**Example:**

```bash
/todo list status:pending
/todo list assigned:@bob
```

#### `done` - Mark a todo as completed

- Select from interactive picker

**Example:**

```bash
/todo done
```

---

### `/remind`

Schedule a follow-up reminder delivered to your DMs or a channel.

**Options:**

- `in_minutes` (optional) - Delay in minutes (5-10,080, default: 60)
- `note` (optional) - Context for the reminder (max 240 characters)
- `channel` (optional) - Deliver reminder in a specific channel instead of DM
- `message_link` (optional) - Message link to include as a quick jump-back

**Example:**

```bash
/remind in_minutes:90 note:"Revisit funding thread" message_link:https://discord.com/channels/.../...
```

---

### `/help`

View comprehensive help and documentation. Includes command overview, usage patterns, and FAQs.

**Options:** None

**Example:**

```bash
/help
```

---

## Admin Commands

### `/admin-config`

Update guild-level automation settings. **Requires Admin permission.**

**Subcommands:**

#### `highlight-channel` - Set the channel that receives ⭐ highlight relays

- `channel` (required) - Channel that should receive highlights

**Example:**

```bash
/admin-config highlight-channel channel:#highlights
```

#### `error-channel` - Set the channel where admin errors will be reported

- `channel` (required) - Channel for error reports

**Example:**

```bash
/admin-config error-channel channel:#bot-errors
```

#### `onboarding-defaults` - Update default onboarding keywords and consent version

- `keywords` (optional) - Comma-separated keywords to auto-subscribe on consent
- `consent_version` (optional) - Consent copy version identifier (e.g., v1.1)

**Example:**

```bash
/admin-config onboarding-defaults keywords:policy,energy,funding consent_version:v2.0
```

---

### `/admin-topics`

Manage curated topic taxonomy used for keyword matching. **Requires Admin permission.**

**Subcommands:**

#### `add` - Add or update a topic

- `slug` (required) - Topic slug (unique, lowercase)
- `keywords` (optional) - Comma-separated keywords
- `bigrams` (optional) - Comma-separated phrases (2-3 words)
- `boost` (optional) - Boost multiplier (default: 1.0)

**Example:**

```bash
/admin-topics add slug:energy keywords:pipeline,hydro,nuclear,grid bigrams:power purchase,natural resources boost:1.2
```

#### `remove` - Remove a topic by slug

- `slug` (required) - Topic slug to remove

**Example:**

```bash
/admin-topics remove slug:deprecated-topic
```

#### `list` - List all curated topics

**Example:**

```bash
/admin-topics list
```

---

### `/admin-channel-weight`

Adjust digest scoring weights for specific channels or threads. **Requires Admin permission.**

Weights range from 0 (mute channel) to 5 (boost channel).

**Subcommands:**

#### `set` - Set a weight multiplier for a channel

- `channel` (required) - Channel or thread to weight
- `multiplier` (required) - Multiplier between 0 (mute) and 5 (boost)

**Example:**

```bash
/admin-channel-weight set channel:#announcements multiplier:2
/admin-channel-weight set channel:#off-topic multiplier:0.5
```

#### `clear` - Remove a custom weight and revert to default

- `channel` (required) - Channel or thread to reset

**Example:**

```bash
/admin-channel-weight clear channel:#announcements
```

#### `list` - List all channels with custom weights

**Example:**

```bash
/admin-channel-weight list
```

---

### `/schedule`

Setup or modify scheduled digest delivery. **Requires Admin permission.**

**Subcommands:**

#### `enable` - Enable or disable scheduled digests

- `enabled` (required) - true/false

**Example:**

```bash
/schedule enable enabled:true
```

#### `cron` - Set cron expression for digest timing

- `cron` (required) - Cron expression (e.g., `0 9 * * *` for 9 AM daily)

**Example:**

```bash
/schedule cron cron:0 9 * * *  # 9 AM daily
/schedule cron cron:0 18 * * 1,4  # 6 PM on Mon & Thu
```

#### `timezone` - Set timezone for cron evaluation

- `timezone` (optional) - Timezone (e.g., "America/New_York", default: UTC)

**Example:**

```bash
/schedule timezone timezone:America/New_York
```

---

### `/unschedule`

Disable scheduled digest delivery. **Requires Admin permission.**

**Options:** None

**Example:**

```bash
/unschedule
```

---

### `/stats`

View comprehensive analytics dashboard. **Requires Admin permission.**

**Displays:**

- Total messages indexed
- Active subscribers
- Keyword distribution
- Digest delivery stats
- API costs and token usage

**Options:** None

**Example:**

```bash
/stats
```

---

## Common Workflows

### 1. **New User Onboarding**

```bash
/onboarding start           # Start consent flow
# Follow DM prompts to select topics and schedule
/my-subscriptions           # Verify settings
```

### 2. **Find Discussions on a Topic**

```bash
/where topic:policy limit:5
# Click links to jump to threads
```

### 3. **Create a Task and Assign It**

```bash
/todo add description:Review deployment assign:@alice
/todo list                  # Verify it was added
```

### 4. **Set Up Scheduled Digests (Admin)**

```bash
/schedule enable enabled:true
/schedule cron cron:0 9 * * *
/schedule timezone timezone:America/New_York
```

### 5. **Tag a Thread for Discovery**

```bash
/thread-tag tags:infrastructure,kubernetes
# Or let AI suggest:
/thread-tag
```

## FAQ

- **How often will I get digest notifications?** Set via `/subscribe cooldown_hours` (default 24 hours, range 1-168).
- **Can I temporarily stop notifications?** Use `/onboarding revoke` or set `/subscribe dm_enabled:false`.
- **How do topics work?** Admins manage curated sets via `/admin-topics`; subscriptions pull matching threads and messages into digests.
- **Can I search message history?** Yes — run `/where topic:keyword` to surface indexed conversations.
- **What timezone should I use for scheduling?** Provide an IANA timezone such as `America/New_York`; UTC is the fallback.
- **How do channel weights affect digests?** Weights multiply digest scores: 2 doubles, 0.5 halves, 0 mutes the channel entirely.

## Need Help?

- Use `/help` to view in-Discord documentation
- React with questions in threads — the bot monitors for follow-ups
- Contact server admins for permission issues or feature requests

