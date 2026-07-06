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
const userRoute = require('./routes/user');
app.use("/user", userRoute);
const leaveRoute = require('./routes/leaveRequest');
app.use("/leave", leaveRoute);
const holidayRoute = require('./routes/publicHoliday');
app.use("/holiday", holidayRoute);
const aiRoute = require('./routes/ai');
app.use("/ai", aiRoute);

const db = require('./models');
db.sequelize.sync({ alter: true })
    .then(() => {
        let port = process.env.APP_PORT;
        app.listen(port, () => {
            console.log(`⚡ Server running on http://localhost:${port}`);
        });
    })
    .catch((err) => {
        console.log(err);
    });
