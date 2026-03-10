# AI Agent — CLI Usage and Integration Examples

This document provides practical, copy‑paste examples for using the AI Agent CLI to trigger tools directly (WhatsApp, Email) and explains important behaviors like WhatsApp authentication and sandboxing.

## Quick Start

- Install globally (optional, local works too):

```bash
npm i -g @faiez-codko/ai-agent
```

- Configure provider and integrations:

```bash
ai-agent setup
```

Follow the guided prompts for:
- AI Provider (OpenAI/Gemini/Compatible)
- Email credentials (SMTP/IMAP or Gmail with App Password)
- WhatsApp trigger and group settings

## WhatsApp Integration

### Authenticate (QR)

```bash
ai-agent integration setup whatsapp
```

- The terminal shows a QR code; scan with WhatsApp.  
- After pairing, the agent stores credentials in your home directory.

### Send Text Message (CLI)

```bash
ai-agent whatsapp --to "923161234567" --message "hey hello from cli"
```

### Send Media (CLI)

```bash
ai-agent whatsapp --to "923161234567" --media "./image.png" --caption "optional caption"
```

- If `--caption` is omitted, `--message` is used as the caption when `--media` is provided.
- Supported types inferred automatically by extension (image/video/audio/document). Override with `--type image|video|audio|document`.

### Send via Tool Call (JSON Payload)

```bash
ai-agent call whatsapp_send_message --payload @payload.json
```

`payload.json`:

```json
{ "to": "923161234567", "message": "hey hello from cli" }
```

Media:

```bash
ai-agent call whatsapp_send_media --payload @payload.json
```

`payload.json`:

```json
{
  "to": "923161234567",
  "mediaPath": "./image.png",
  "caption": "optional caption",
  "mediaType": "auto"
}
```

## Email

### Configure Email

Run:

```bash
ai-agent setup
```

- Choose “Email Integration”
- Provide credentials:
  - Gmail: use an App Password
  - Custom SMTP/IMAP: host/port/tls and SMTP host/port

### Send Email (CLI)

```bash
ai-agent email --to "demo@example.com" --subject "test" --body "test"
```

With attachments:

```bash
ai-agent email --to "demo@example.com" --subject "test" --body "test" --attach "./a.pdf" "./b.png"
```

### Send via Tool Call (JSON Payload)

```bash
ai-agent call send_email --payload @payload.json
```

`payload.json`:

```json
{
  "to": "demo@example.com",
  "subject": "test",
  "body": "test",
  "attachments": ["./a.pdf", "./b.png"]
}
```

## Tool Invocation Notes

- Prefer `--payload @file.json` to avoid shell quoting issues.
- When sending media via WhatsApp:
  - Local file paths are read as buffers.
  - URLs are passed through for Baileys to fetch.
  - Common mimetypes are inferred automatically.

## WhatsApp Behavior: Triggering

- The agent only responds when:
  - You mention the configured trigger (e.g., `@ai`), or
  - You reply to the bot’s message, or
  - You are in “note to self” with the bot.
- Messages that are only numbers or contain `{{ ... }}` templates do not trigger a response unless replying to the bot or in note‑to‑self.
- Untagged messages are stored as context only; the bot does not reply.

## Sandbox & Safe Mode (WhatsApp)

- File‑based tools invoked via WhatsApp run inside a per‑chat sandbox directory:
  - `.agent/wa_<jid>/sandbox`
- Paths are automatically coerced into the sandbox. Operations outside the sandbox return “Access denied.”
- Commands run in the sandbox; file operations require confirmation under Safe Mode unless the integration provides an approval callback.

## Troubleshooting

- “WhatsApp is not authenticated”:
  - Run `ai-agent integration setup whatsapp` and scan the QR.
- “Cannot read properties of undefined (reading 'attrs')” when sending media:
  - Ensure the media path exists and the extension matches the content (e.g., `.jpg`, `.mp4`, `.pdf`).
- Email sends fail:
  - Verify SMTP host/port and credentials in `ai-agent setup`.
  - For Gmail, use App Password (not normal password).

## References

- CLI entrypoint: `index.js`
- WhatsApp client: `src/integrations/whatsapp_client.js`
- WhatsApp tools: `src/tools/whatsapp.js`
- Email tools: `src/tools/email.js`
- Tools router and sandboxing: `src/tools/index.js`

