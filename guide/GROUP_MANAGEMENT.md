# Group & Channel Management Guide
This guide explains how to use the "Group / Channel Management" features in your Admin Dashboard (`/dashboard/moderation`).

## 1. Bot Configuration (Important First Step)

**Before adding the bot to any group**, you must ensure it can read messages. By default, bots cannot see messages in groups.

1.  Open **[@BotFather](https://t.me/BotFather)** in Telegram.
2.  Send the command `/mybots`.
3.  Select your bot from the list.
4.  Click on **Bot Settings**.
5.  Click on **Group Privacy**.
6.  Click **Turn off**.
    *   It should say: *"Group Privacy is now DISABLED."*
7.  *Now* you are ready to add the bot to groups.

## 2. Setting up a Group

Before the bot can manage your group or channel, you must:

1.  **Add the Bot**: Add your bot (e.g., `@YourBotName`) to the Telegram Group or Channel.
2.  **Make Admin**: Promote the bot to be an **Administrator**.
    *   **Required Permissions**:
        *   *Delete Messages* (for link removal)
        *   *Ban Users* (for auto-mute)
        *   *Post Messages* (for welcome messages & scheduled posts)
3.  **Active Message**: Send at least one message in the group *after* adding the bot.
    *   *Why?* The bot needs to receive an event to "see" and register the group in its database. Once registered, it will appear in the dropdown menu on the dashboard.

    *   *Why?* The bot needs to receive an event to "see" and register the group in its database. Once registered, it will appear in the dropdown menu on the dashboard.

## 3. Configuring Moderation

Go to the **Moderation** tab in your Admin Panel.

1.  **Select Destination**: Choose your group or channel from the "Select destination..." dropdown.
    *   *Note: If your group isn't listed, send a message in the group and click "Refresh".*
2.  **Enable Moderation**: Check the "Enable moderation (selected chat)" box.
3.  **Welcome Message**:
    *   Check "Welcome new members".
    *   **Welcome Text**: Enter your custom message. You can use HTML tags (like `<b>bold</b>`) and placeholders:
        *   `{new_member}`: Mentions the new user (e.g., "Welcome @john").
        *   `{new_members}`: Lists all new users if multiple join at once.

    **Examples:**
    *   **Simple:** `Welcome {new_member} to the group! 👋`
    *   **With HTML:** `Hello {new_member}! Welcome to <b>Our Community</b>. Please read the pinned message.`
    *   **With Links:** `Welcome {new_member}! Check out our <a href="https://google.com">Website</a>.`
4.  **Link Removal**:
    *   Check "Delete any link" to automatically remove messages containing URLs (e.g., `http://...`, `www.google.com`).
5.  **Auto-Mute**:
    *   Check "Auto-mute user who posts link" to temporarily restrict users who break the rule.
    *   **Mute Seconds**: Set the duration (default is 3600 seconds = 1 hour).
6.  **Save**: Click the **Save** button to apply changes.

## 4. Scheduled Posts

You can schedule messages to be sent largely in the future.

1.  **Select Destination**: Choose the target group/channel.
2.  **Type**: Select Text, Photo, or Video.
3.  **Content**:
    *   **Text**: Enter the message caption.
    *   **Media**: Click "Upload" to select a file or paste a direct URL.
4.  **Date/Time**: Pick the date and time for the post to be sent.
5.  **Create**: Click "Create Schedule".
6.  **Manage**: View or delete pending posts in the "Jobs" list below.
