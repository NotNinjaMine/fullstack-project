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

// Routes
// M1: identity, announcements, invitations / onboarding, HR admin slices
const userRoute = require('./routes/user');
app.use("/user", userRoute);
const announcementRoute = require('./routes/announcement');
app.use("/announcement", announcementRoute);
const invitationRoute = require('./routes/invitation');
app.use("/invitation", invitationRoute);
const adminRoute = require('./routes/admin');
app.use("/admin", adminRoute);

// TODO: mount the other members' routes here once their files land —
// leaveRequest (M2), publicHoliday/ai (M?), notification/delegation (M3),
// coverage (M4), report (M5), swap (M2). Left out for now so the server can
// actually boot with only Member 1's slice in place.

const db = require('./models');

// Export app for supertest integration tests (listen only when run directly)
module.exports = app;

if (require.main === module) {
    db.sequelize.sync({ alter: true })
        .then(() => {
            // TODO: re-enable once these land — M3's 24h pending-approval reminder
            // scheduler and M5's scheduled-report delivery sweep.
            // require('./services/notificationService').startReminderScheduler();
            // require('./services/reportScheduleService').startReportScheduler();

            let port = process.env.APP_PORT;
            app.listen(port, () => {
                console.log(`⚡ Server running on http://localhost:${port}`);
            });
        })
        .catch((err) => {
            console.log(err);
        });
}
