const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());

// Enable CORS
app.use(cors({
    origin: process.env.CLIENT_URL
}));

// Simple Route
app.get("/", (req, res) => {
    res.send("Welcome to the Innovare Leave Management System API.");
});

// Routes — MEMBER 1 BUILD.
// Only the routers this deliverable needs are mounted. The AI, reporting,
// coverage-config, holiday, delegation and swap routers (Members 2-5) are not
// part of this build and their files are not shipped here.

// M1: identity, 2FA, sessions, profile, employee accounts
const userRoute = require('./routes/user');
app.use("/user", userRoute);
// M1: announcements, invitations / onboarding
const announcementRoute = require('./routes/announcement');
app.use("/announcement", announcementRoute);
const invitationRoute = require('./routes/invitation');
app.use("/invitation", invitationRoute);
// M1: employee records, staff import, carry-forward, bulk entitlement
const adminRoute = require('./routes/admin');
app.use("/admin", adminRoute);
// Retained dependency (Member 3's router): the HR Admin "Leadership approvals"
// tab reads /leave/pending and writes /leave/:id/decide, and the employee view
// reads /leave/balances. Only those endpoints are exercised by this build.
const leaveRoute = require('./routes/leaveRequest');
app.use("/leave", leaveRoute);
// Retained dependency (Member 3's router): the notification bell in the
// HR Admin and Manager headers.
const notificationRoute = require('./routes/notification');
app.use("/notification", notificationRoute);

const db = require('./models');

// Export app for supertest integration tests (listen only when run directly)
module.exports = app;

if (require.main === module) {
    db.sequelize.sync({ alter: true })
        .then(() => {
            // M3: 24h pending-approval reminder scheduler (setInterval, no node-cron)
            require('./services/notificationService').startReminderScheduler();

            let port = process.env.APP_PORT;
            app.listen(port, () => {
                console.log(`⚡ Server running on http://localhost:${port}`);
                // Make it obvious whether password-reset / invitation emails will
                // actually be delivered, or fall back to demo links.
                const mailer = require('./services/mailer');
                console.log(`✉  ${mailer.mailerStatus()}`);
                const smsSvc = require('./services/sms');
                console.log(`📱 ${smsSvc.smsStatus()}`);
                if (mailer.smtpConfigured()) {
                    // Authenticate now (without sending) so bad credentials or a
                    // blocked port surface here, not on the first reset/invite.
                    mailer.verifyTransport().then((v) => {
                        if (v.ok) {
                            console.log("✉  SMTP connection verified — real emails will be delivered.");
                        } else {
                            console.error(`✉  SMTP check FAILED: ${v.error}`);
                            console.error("✉  Reset/invite links will still be shown in-app so the flow keeps working.");
                        }
                    });
                }
                if (smsSvc.smsConfigured()) {
                    smsSvc.verifySms().then((v) => {
                        if (v.ok) {
                            console.log(`📱 Twilio credentials verified (account ${v.accountStatus}${v.accountType ? `, ${v.accountType}` : ""}).`);
                            if (v.accountType && /trial/i.test(v.accountType)) {
                                console.log("📱 Trial account: SMS can only go to numbers verified in the Twilio Console.");
                            }
                        } else {
                            console.error(`📱 Twilio check FAILED: ${v.error}`);
                            console.error("📱 Phone 2FA codes will be shown in-app instead so login still works.");
                        }
                    });
                }
            });
        })
        .catch((err) => {
            console.log(err);
        });
}
