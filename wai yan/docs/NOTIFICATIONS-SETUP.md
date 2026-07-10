# Email, WhatsApp, Telegram & AI Assistant Setup

Member 3 multi-channel notifications + AI-3 approval assistant.

## 1. Email

Edit `backend/.env`.

### A) GoDaddy domain email (recommended if you bought the domain there)

You need a **mailbox** on the domain (domain alone is not enough). Example: `noreply@yourdomain.com`.

**In GoDaddy**

1. Log in → your domain → **Email** / **Professional Email** (or Workspace Email / Titan).  
2. Create a mailbox, e.g. `noreply@yourdomain.com` or `hr@yourdomain.com`.  
3. Set a strong mailbox password (this is what the app uses, not always your GoDaddy shop login).  
4. Confirm webmail works (send a test to yourself).

**In `backend/.env`**

```env
SMTP_MODE=godaddy
EMAIL_ENABLED=true
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your-mailbox-password
SMTP_FROM="HR Leave System <noreply@yourdomain.com>"
EMAIL_TEST_TO=you@yourdomain.com
```

Official GoDaddy SMTP (Professional Email): host `smtpout.secureserver.net`, SSL, port **465**.  
If port 465 is blocked, try:

```env
SMTP_PORT=587
SMTP_SECURE=false
```

**Microsoft 365 email through GoDaddy** (if your product is M365, not classic Professional Email):

```env
SMTP_MODE=smtp
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your-mailbox-password
SMTP_FROM="HR Leave System <noreply@yourdomain.com>"
```

Test:

```bash
cd backend
npm run test:channels
```

You should see `mode: 'smtp'` or godaddy and a successful send (check `EMAIL_TEST_TO` inbox + spam).

### B) Console only (no real mail)

```env
SMTP_MODE=console
```

### C) Ethereal free test inbox

```env
SMTP_MODE=ethereal
```

### D) Gmail

```env
SMTP_MODE=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-16-char-app-password
SMTP_FROM="HR Leave <you@gmail.com>"
```

---

## 2. AI-3 Assistant (OpenRouter key)

```env
AI_ASSISTANT_ENABLED=true
OPENAI_API_KEY=sk-or-v1-xxxxxxxx          # your OpenRouter key
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=openai/gpt-4o-mini
```

If the key is missing or the API fails, the app **falls back** to the rule engine (still shows a summary card).

Native OpenAI instead of OpenRouter:

```env
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

Test:

```bash
npm run test:channels
```

Look for `generated_by` — model name means LLM worked; `rule_engine_v1` means fallback.

In the UI: open **Approval Queue** → a request → **AI-3 Approval Assistant** card.

---

## 3. WhatsApp

### A) Console (default)

```env
WHATSAPP_PROVIDER=console
WHATSAPP_ENABLED=true
```

Messages log in the terminal. Demo users have placeholder phones (`+659000000x`).

### B) Twilio WhatsApp

1. [Twilio Console](https://console.twilio.com/) → WhatsApp sandbox  
2. Join sandbox from your phone  
3. Set:

```env
WHATSAPP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
WHATSAPP_TEST_TO=+65YOUR_REAL_NUMBER
```

4. Update the user phone in DB (or seed) to **your** E.164 number:

```sql
UPDATE users SET phone = '+65XXXXXXXX' WHERE email = 'bob.supervisor@company.com';
```

### C) Meta WhatsApp Cloud API

```env
WHATSAPP_PROVIDER=meta
WHATSAPP_TOKEN=EAAB...
WHATSAPP_PHONE_NUMBER_ID=123456789
```

Recipient must be allowed/tested in Meta Business Manager.

---

## 4. Telegram (optional)

Telegram is an **optional** alternative channel. If `TELEGRAM_BOT_TOKEN` is unset, or a user has no `telegram_chat_id`, sends are skipped safely. In-app notifications always still work.

### A) Database migration

Existing databases need the new nullable column:

```bash
cd backend
npm run db:migrate
```

This applies `src/db/migrations/004_add_telegram_chat_id.sql` (idempotent). Fresh `npm run seed` already includes `users.telegram_chat_id` in the schema.

### B) Create a bot and set the token

1. Open Telegram and chat with **@BotFather**.
2. Send `/newbot` and follow the prompts.
3. Copy the bot token into `backend/.env` (never commit real tokens):

```env
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
```

If `TELEGRAM_BOT_TOKEN` is empty, Telegram is a no-op.

### C) Get a user’s chat id and save it

1. Ask the staff member to open Telegram and send **`/start`** to your bot.
2. Call the Bot API `getUpdates` (replace the token; do not paste tokens into tickets/logs):

```text
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates
```

3. In the JSON response, find `message.chat.id` (a number or string, e.g. `123456789`).
4. Store it on the user row:

```sql
UPDATE users
SET telegram_chat_id = '123456789'
WHERE email = 'bob.supervisor@company.com';
```

Only users with a non-null `telegram_chat_id` receive Telegram messages.

### D) Test

```bash
cd backend
# optional: TELEGRAM_TEST_CHAT_ID=123456789
npm run test:channels
```

Unit tests (no live Telegram required):

```bash
npm test
```

---

## 5. What fires when

| Event | In-app | Email | WhatsApp | Telegram |
|-------|--------|-------|----------|----------|
| Leave submitted | Supervisor | Yes | Yes | If chat id set |
| Supervisor approved/rejected | Manager | Yes | Yes | If chat id set |
| Final manager decision | Employee | Yes | Yes | If chat id set |
| Cancel pending | Approvers | Yes | Yes | If chat id set |
| Overlap warning | Employee | No | No | No |
| 24h reminder | Approver | Yes | Yes (via notify) | If chat id set |

Bodies stay free of sensitive PII (dates + leave type + link only).

---

## 6. Quick checklist

1. Paste OpenRouter key into `OPENAI_API_KEY`  
2. Set `SMTP_MODE=ethereal` or real Gmail for email demos  
3. Set `WHATSAPP_PROVIDER=console` for logs, or Twilio for real phone  
4. (Optional) Set `TELEGRAM_BOT_TOKEN` + user `telegram_chat_id` after `npm run db:migrate`  
5. `npm run seed` → `npm run dev`  
6. `npm run test:channels`  
7. Apply leave as Alice → check Bob’s channels  
