// Outgoing SMS, used for the 2FA "code by phone" option.
//
// Deliberately calls the Twilio REST API with the built-in global fetch instead
// of pulling in the Twilio SDK, so this adds NO new runtime dependency (the
// project's existing constraint). Node 18+ provides fetch globally.
//
// Mirrors services/mailer.js on purpose: same demo-mode behaviour, same
// never-throw contract, same status/diagnostic helpers.
require('dotenv').config();

const smsConfigured = () =>
    !!(process.env.TWILIO_ACCOUNT_SID
        && process.env.TWILIO_AUTH_TOKEN
        && (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID));

// Twilio's numeric error codes are far more useful than its prose. Map the ones
// that actually bite during setup into instructions.
const describeSmsError = (code, message) => {
    switch (Number(code)) {
        case 20003:
            return "Twilio rejected the credentials. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.";
        case 21211:
            return "That phone number is not a valid destination. Use full E.164 format including the country code, e.g. +6591234567.";
        case 21608:
            return "This Twilio account is a trial account, which can only send to VERIFIED numbers. " +
                   "Add the recipient under Twilio Console -> Phone Numbers -> Verified Caller IDs, or upgrade the account.";
        case 21606:
        case 21612:
        case 21659:
            return "The TWILIO_FROM number cannot send to that destination. Confirm the number is SMS-capable and permitted for that country.";
        case 21610:
            return "That recipient has unsubscribed (replied STOP) and cannot be messaged.";
        case 21614:
            return "That destination is not a mobile number capable of receiving SMS.";
        default:
            return message || `Twilio error ${code}.`;
    }
};

// DEMO_SMS_REDIRECT: same idea as DEMO_EMAIL_REDIRECT — send every SMS to ONE
// real number regardless of the account's saved phone. The seeded demo accounts
// carry placeholder numbers (+65912300xx) that nobody owns, and a Twilio trial
// account can only text VERIFIED numbers anyway, so this is what makes a live
// SMS demo possible without editing any account. Leave blank in production.
const demoSmsRedirect = () => (process.env.DEMO_SMS_REDIRECT || "").trim();
const demoSmsRedirectActive = () => !!demoSmsRedirect();

// DEMO_PHONE_PREFIXES: number prefixes that are NOT real handsets. The seeded
// demo accounts carry placeholders (+65912300xx) that nobody owns, so texting
// them would either fail at the provider or silently go nowhere — and because
// the send "succeeded" the on-screen code fallback would be suppressed, locking
// you out of the demo accounts.
//
// Numbers matching these prefixes are never sent to; their code is shown in-app
// instead. Any OTHER number — a real one entered during registration or under
// My account — gets an actual SMS. This is the direct counterpart of
// DEMO_EMAIL_DOMAINS in services/mailer.js, and it is what lets a live account
// and the demo accounts coexist.
const demoPhonePrefixes = () =>
    (process.env.DEMO_PHONE_PREFIXES || "+65912300")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);

const isDemoPhone = (phone) => {
    const n = String(phone || "").replace(/[\s-]/g, "");
    return demoPhonePrefixes().some((p) => n.startsWith(p));
};

// Send an SMS. Never throws. Returns { sent, reason?, error? }.
const sendSms = async (to, body) => {
    if (!smsConfigured()) {
        console.log(`[sms] Twilio not configured (demo mode) - would text ${to}: ${body}`);
        return { sent: false, reason: "no-sms" };
    }
    // Placeholder demo number with no explicit redirect: don't attempt delivery.
    if (isDemoPhone(to) && !demoSmsRedirectActive()) {
        console.log(`[sms] ${to} is a demo placeholder number - not sending; code shown in-app instead`);
        return { sent: false, reason: "demo-phone" };
    }
    const redirect = demoSmsRedirect();
    const actualTo = redirect || to;
    const actualBody = redirect ? `[demo → ${to}] ${body}` : body;
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
    const form = new URLSearchParams({ To: actualTo, Body: actualBody });
    if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
        form.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
    } else {
        form.set("From", process.env.TWILIO_FROM);
    }
    const auth = Buffer
        .from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`)
        .toString("base64");

    try {
        // Guard against a hung request holding the login flow open.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Basic ${auth}`,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: form.toString(),
            signal: controller.signal
        });
        clearTimeout(timer);

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
            const friendly = describeSmsError(payload.code, payload.message);
            console.error(`[sms] FAILED to text ${actualTo}: ${friendly}`);
            return { sent: false, reason: "send-failed", error: friendly };
        }
        console.log(
            redirect
                ? `[sms] sent (for ${to}) -> redirected to ${actualTo} (sid ${payload.sid})`
                : `[sms] sent to ${to} (sid ${payload.sid})`
        );
        return { sent: true, sid: payload.sid, redirectedTo: redirect || null };
    } catch (err) {
        const friendly = err.name === "AbortError"
            ? "Timed out reaching Twilio. Check the server's internet access (outbound HTTPS to api.twilio.com)."
            : err.message;
        console.error(`[sms] FAILED to text ${actualTo}: ${friendly}`);
        return { sent: false, reason: "send-failed", error: friendly };
    }
};

// Credential check that does NOT send a message: fetches the account resource.
const verifySms = async () => {
    if (!smsConfigured()) return { ok: false, reason: "no-sms" };
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`,
            { headers: { Authorization: `Basic ${auth}` }, signal: controller.signal }
        );
        clearTimeout(timer);
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
            return { ok: false, reason: "verify-failed", error: describeSmsError(payload.code, payload.message) };
        }
        return { ok: true, accountStatus: payload.status, accountType: payload.type };
    } catch (err) {
        return {
            ok: false,
            reason: "verify-failed",
            error: err.name === "AbortError"
                ? "Timed out reaching Twilio (outbound HTTPS to api.twilio.com blocked?)."
                : err.message
        };
    }
};

const smsStatus = () => {
    if (!smsConfigured()) {
        return "SMS DISABLED (no TWILIO_* in .env) - phone 2FA codes are shown in-app for the demo";
    }
    const base = `SMS ENABLED via Twilio from ${process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM}`;
    return demoSmsRedirectActive()
        ? `${base}  |  DEMO REDIRECT ON -> ALL texts go to ${demoSmsRedirect()}`
        : base;
};

module.exports = {
    sendSms, verifySms, smsConfigured, smsStatus, describeSmsError,
    demoSmsRedirect, demoSmsRedirectActive, demoPhonePrefixes, isDemoPhone
};
