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
```
/subscribe keywords:policy,energy cooldown_hours:24 dm_enabled:true
```

---

### `/unsubscribe`
Remove keyword subscriptions from your account.

**Options:**
- `keywords` (optional) - Comma-separated keywords to remove (leave empty to remove all)

**Example:**
```
/unsubscribe keywords:policy
```

---

### `/my-subscriptions`
View your current keyword subscriptions and notification settings.

**Options:** None

**Example:**
```
/my-subscriptions
```

---

### `/digest-now`
Generate an instant digest, ignoring cooldown restrictions. Useful for testing or immediate updates.

**Options:**
- `hours` (optional) - Look back this many hours (1-168, default: 24)

**Example:**
```
/digest-now hours:48
```

---

### `/onboarding`
Manage your DM onboarding consent and automated subscriptions.

**Subcommands:**
- `start` - Restart the onboarding DM flow to review consent and pick topics
- `status` - View your current consent status and default topics
- `revoke` - Revoke consent and disable automated DMs

**Example:**
```
/onboarding start
/onboarding status
/onboarding revoke
```

---

### `/subscribe` → Schedule
Set your preferred digest delivery schedule after subscribing.

Available schedules:
- Daily Morning (09:00 EST)
- Daily Evening (20:00 EST)
- Twice Weekly (Mon & Thu at 18:00 EST)
- Weekly Recap (Monday at 15:00 EST)
- Manual only (no automatic DMs)

---

### `/where`
Search tagged threads and indexed discussions by topic keyword.

**Options:**
- `topic` (required) - Topic keyword to search for (e.g., grants, funding, ai)
- `limit` (optional) - Maximum number of matches (default: 5)

**Example:**
```
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
```
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

Example:
```
/todo add description:Review PR assign:@alice message:https://discord.com/channels/...
```

#### `list` - List open or completed todos
- `status` (optional) - Filter by status (pending, completed, all - default: pending)
- `assigned` (optional) - Only show tasks assigned to this member

Example:
```
/todo list status:pending
/todo list assigned:@bob
```

#### `done` - Mark a todo as completed
- Select from interactive picker

Example:
```
/todo done
```

---

### `/help`
View comprehensive help and documentation. Includes command overview, usage patterns, and FAQs.

**Options:** None

**Example:**
```
/help
```

---

## Admin Commands

### `/admin-config`
Update guild-level automation settings. **Requires Admin permission.**

**Subcommands:**

#### `highlight-channel` - Set the channel that receives ⭐ highlight relays
- `channel` (required) - Channel that should receive highlights

Example:
```
/admin-config highlight-channel channel:#highlights
```

#### `error-channel` - Set the channel where admin errors will be reported
- `channel` (required) - Channel for error reports

Example:
```
/admin-config error-channel channel:#bot-errors
```

#### `onboarding-defaults` - Update default onboarding keywords and consent version
- `keywords` (optional) - Comma-separated keywords to auto-subscribe on consent
- `consent_version` (optional) - Consent copy version identifier (e.g., v1.1)

Example:
```
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

Example:
```
/admin-topics add slug:energy keywords:pipeline,hydro,nuclear,grid bigrams:power purchase,natural resources boost:1.2
```

#### `remove` - Remove a topic by slug
- `slug` (required) - Topic slug to remove

Example:
```
/admin-topics remove slug:deprecated-topic
```

#### `list` - List all curated topics

Example:
```
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

Example:
```
/admin-channel-weight set channel:#announcements multiplier:2
/admin-channel-weight set channel:#off-topic multiplier:0.5
```

#### `clear` - Remove a custom weight and revert to default
- `channel` (required) - Channel or thread to reset

Example:
```
/admin-channel-weight clear channel:#announcements
```

#### `list` - List all channels with custom weights

Example:
```
/admin-channel-weight list
```

---

### `/schedule`
Setup or modify scheduled digest delivery. **Requires Admin permission.**

**Subcommands:**

#### `enable` - Enable or disable scheduled digests
- `enabled` (required) - true/false

Example:
```
/schedule enable enabled:true
```

#### `cron` - Set cron expression for digest timing
- `cron` (required) - Cron expression (e.g., "0 9 * * *" for 9 AM daily)

Example:
```
/schedule cron cron:0 9 * * *  # 9 AM daily
/schedule cron cron:0 18 * * 1,4  # 6 PM on Mon & Thu
```

#### `timezone` - Set timezone for cron evaluation
- `timezone` (optional) - Timezone (e.g., "America/New_York", default: UTC)

Example:
```
/schedule timezone timezone:America/New_York
```

---

### `/unschedule`
Disable scheduled digest delivery. **Requires Admin permission.**

**Options:** None

**Example:**
```
/unschedule
```

---

### `/stats`
View comprehensive analytics dashboard. **Requires Admin permission.**

Displays:
- Total messages indexed
- Active subscribers
- Keyword distribution
- Digest delivery stats
- API costs and token usage

**Options:** None

**Example:**
```
/stats
```

---

## Common Workflows

### 1. **New User Onboarding**
```
/onboarding start           # Start consent flow
# Follow DM prompts to select topics and schedule
/my-subscriptions           # Verify settings
```

### 2. **Find Discussions on a Topic**
```
/where topic:policy limit:5
# Click links to jump to threads
```

### 3. **Create a Task and Assign It**
```
/todo add description:Review deployment assign:@alice
/todo list                  # Verify it was added
```

### 4. **Set Up Scheduled Digests (Admin)**
```
/schedule enable enabled:true
/schedule cron cron:0 9 * * *
/schedule timezone timezone:America/New_York
```

### 5. **Tag a Thread for Discovery**
```
/thread-tag tags:infrastructure,kubernetes
# Or let AI suggest:
/thread-tag
```

---

## FAQ

**Q: How often will I get digest notifications?**
A: Set via `/subscribe cooldown_hours`. Default is 24 hours. Can be 1-168 hours (7 days max).

**Q: Can I temporarily stop notifications?**
A: Yes, use `/onboarding revoke` to disable DMs, or set `/subscribe dm_enabled:false`.

**Q: How do topics work?**
A: Topics are curated keyword sets. Admins manage them via `/admin-topics`. When you subscribe to a keyword, digests include threads/messages matching that topic.

**Q: Can I search message history?**
A: Yes, use `/where topic:keyword`. The bot indexes messages in real-time as they arrive.

**Q: What timezone should I use for scheduling?**
A: Use IANA timezone identifiers: `America/New_York`, `Europe/London`, `Australia/Sydney`, etc. Default is UTC.

**Q: How do channel weights affect digests?**
A: Channel weights multiply the digest score. A weight of 2 doubles importance; 0.5 halves it; 0 mutes the channel entirely.

---

## Need Help?

- Use `/help` to view in-Discord documentation
- React with questions in threads — the bot monitors for follow-ups
- Contact server admins for permission issues or feature requests

