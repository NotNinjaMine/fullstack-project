// Verifies the SMTP settings in .env and optionally sends a real test email.
//   npm run mail:test                     -> connect + authenticate only
//   npm run mail:test you@example.com     -> also send a live test message
require('dotenv').config();
const { smtpConfigured, verifyTransport, sendResetEmail } = require('../services/mailer');

const run = async () => {
    console.log("SMTP settings from .env:");
    console.log(`  SMTP_HOST = ${process.env.SMTP_HOST || "(unset)"}`);
    console.log(`  SMTP_PORT = ${process.env.SMTP_PORT || "(unset, defaults to 587)"}`);
    console.log(`  SMTP_USER = ${process.env.SMTP_USER || "(unset)"}`);
    console.log(`  SMTP_PASS = ${process.env.SMTP_PASS ? "(set)" : "(unset)"}`);
    console.log(`  SMTP_FROM = ${process.env.SMTP_FROM || "(unset, falls back to SMTP_USER)"}`);
    console.log(`  CLIENT_URL = ${process.env.CLIENT_URL || "(unset — links will be relative and unusable)"}`);
    console.log("");

    if (!smtpConfigured()) {
        console.log("✗ SMTP is NOT configured — the app is in demo mode and will only log links.");
        console.log("  Set SMTP_HOST, SMTP_USER and SMTP_PASS in backend/.env to send real email.");
        process.exit(1);
    }

    console.log("Connecting and authenticating…");
    const check = await verifyTransport();
    if (!check.ok) {
        console.log(`✗ SMTP connection failed: ${check.error}`);
        process.exit(1);
    }
    console.log("✓ SMTP connection and credentials are valid.");

    const to = process.argv[2];
    if (!to) {
        console.log("\nNo recipient given, so no test message was sent.");
        console.log("Run `npm run mail:test your.address@example.com` to send one.");
        return;
    }

    console.log(`\nSending a test password-reset email to ${to}…`);
    const result = await sendResetEmail(to, "0".repeat(64), "Test Recipient");
    if (result.ok) {
        console.log(`✓ Sent (message id ${result.messageId}). Check that inbox, including spam.`);
        console.log("  NOTE: the token in this test email is fake, so the link won't reset anything.");
    } else {
        console.log(`✗ Send failed: ${result.error}`);
        process.exit(1);
    }
};

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
