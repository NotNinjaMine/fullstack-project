const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.disable('x-powered-by');
// M2 (UC-13): medical certificates are posted as base64 data URLs inside the JSON
// body. Base64 inflates a file by ~33%, so the 5MB attachment cap the UI advertises
// needs roughly 7MB of JSON — well above express.json()'s 100kb default, which
// silently rejected every real MC with an HTML 413 page.
app.use(express.json({ limit: '12mb' }));

// Enable CORS
app.use(cors({
    origin: process.env.CLIENT_URL
}));

const db = require('./models');

if (process.env.VERCEL) {
    // On Vercel there is no long-lived startup phase to run sync() in (each
    // invocation just imports this module), so gate the first request per
    // cold start on it instead. Cached per warm instance; retried if it fails.
    let dbReady = null;
    app.use((req, res, next) => {
        if (!dbReady) {
            dbReady = db.sequelize.sync({ alter: true }).catch((err) => {
                dbReady = null;
                throw err;
            });
        }
        dbReady.then(() => next()).catch(next);
    });
}

// API landing route. Keep this as plain text so opening the backend URL can
// never be mistaken for the React client application.
app.get("/", (req, res) => {
    res
        .status(200)
        .type("text/plain")
        .send("Welcome to the Innovare Leave Management System API.");
});

// Lightweight endpoint for local checks and deployment health probes.
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        service: "Innovare Leave Management System API"
    });
});

// Routes
const userRoute = require('./routes/user');
app.use("/user", userRoute);
const leaveRoute = require('./routes/leaveRequest');
app.use("/leave", leaveRoute);
const holidayRoute = require('./routes/publicHoliday');
app.use("/holiday", holidayRoute);
const aiRoute = require('./routes/ai');
app.use("/ai", aiRoute);
// M3:
const notificationRoute = require('./routes/notification');
app.use("/notification", notificationRoute);
const delegationRoute = require('./routes/delegation');
app.use("/delegation", delegationRoute);
// M4: coverage config (weekend config + blackout periods)
const coverageRoute = require('./routes/coverage');
app.use("/coverage", coverageRoute);
// M5: HR admin, reporting, audit, scheduled reports
const adminRoute = require('./routes/admin');
app.use("/admin", adminRoute);
const reportRoute = require('./routes/report');
app.use("/report", reportRoute);
// M1: announcements, invitations / onboarding
const announcementRoute = require('./routes/announcement');
app.use("/announcement", announcementRoute);
const invitationRoute = require('./routes/invitation');
app.use("/invitation", invitationRoute);
// M2: leave swap
const swapRoute = require('./routes/swap');
app.use("/swap", swapRoute);

// Body-parser failures must answer in the same { message } shape as the routes,
// otherwise the client shows a bare "Submission failed." with nothing to act on.
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
        return res.status(413).json({
            message: "That file is too large to upload. Please attach a document under 5MB."
        });
    }
    if (err && err.type === 'entity.parse.failed') {
        return res.status(400).json({ message: "Malformed request body." });
    }
    if (err) {
        console.error("Unhandled error:", err.message);
        return res.status(500).json({ message: "Something went wrong on the server." });
    }
    return next();
});

// Export app for supertest integration tests (listen only when run directly)
module.exports = app;

if (require.main === module) {
    db.sequelize.sync({ alter: true })
        .then(async () => {
            // Refuse to start with stale demo recipients. This converts the
            // silent `Address not found` failure into an actionable local fix
            // and prevents leave events being sent to legacy domains.
            const { verifyNoActiveLegacyUsers } = require('./services/demoEmailMigration');
            await verifyNoActiveLegacyUsers(db.User);

            // M3: 24h pending-approval reminder scheduler (setInterval, no node-cron)
            require('./services/notificationService').startReminderScheduler();
            require('./services/delegationLifecycleService').startDelegationExpiryScheduler();
            // M5: scheduled-report delivery sweep (setInterval, no node-cron)
            require('./services/reportScheduleService').startReportScheduler();

            const port = Number(process.env.APP_PORT || 3001);
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                throw new Error(`APP_PORT must be a valid port number. Received: ${process.env.APP_PORT}`);
            }

            const clientUrl = new URL(process.env.CLIENT_URL || "http://localhost:3000");
            const clientPort = Number(clientUrl.port || (clientUrl.protocol === "https:" ? 443 : 80));
            if (clientPort === port) {
                throw new Error(
                    `Port conflict: API APP_PORT (${port}) must be different from CLIENT_URL (${clientUrl.origin}). ` +
                    "Use API port 3001 and client port 3000."
                );
            }

            const server = app.listen(port, () => {
                console.log(`⚡ Server running on http://localhost:${port}`);
                console.log(`🌐 Client should run separately on ${clientUrl.origin}`);
                // Make it obvious whether password-reset / invitation emails will
                // actually be delivered, or fall back to demo links.
                const mailer = require('./services/mailer');
                console.log(`✉  ${mailer.mailerStatus()}`);
                if (mailer.smtpConfigured()) {
                    // Authenticate now (without sending) so bad credentials or a
                    // blocked port surface here, not on the first reset/invite.
                    mailer.verifyTransport().then((v) => {
                        if (v.ok) {
                            console.log("✉  SMTP connection verified — real emails will be delivered.");
                        } else {
                            console.error(`✉  SMTP check FAILED: ${v.error}`);
                            console.error("✉  Delivery will fail safely until SMTP is corrected; raw reset/invite tokens are not exposed when email is enabled.");
                        }
                    });
                }
            });

            server.on("error", (err) => {
                if (err && err.code === "EADDRINUSE") {
                    console.error(`Startup failed: port ${port} is already in use.`);
                    console.error("Stop the process using that port, or keep the API on 3001 and the client on 3000.");
                    process.exitCode = 1;
                    return;
                }
                console.error(`Server error: ${err.message}`);
                process.exitCode = 1;
            });
        })
        .catch((err) => {
            console.error(`Startup failed: ${err.message}`);
            if (/legacy-domain user/i.test(String(err.message || ''))) {
                console.error('Run: npm run migrate:demo-emails -- --confirm=wypledu.online');
            }
            process.exitCode = 1;
        });
}
