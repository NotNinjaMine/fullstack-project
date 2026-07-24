const express = require('express');
const cors = require('cors');
const env = require('./config/env');

// Express app (no listen here) so tests can import it and drive it directly.
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors({ origin: env.CLIENT_URL }));

app.get('/', (req, res) => {
  res.send('Innovare Leave Management System API — Member 1 (Platform, Identity & Self-Service).');
});

// Member 1 routes. The employee-leave / approval / HR-analytics verticals mount
// their own routers here when the full team backend is assembled.
app.use('/user', require('./routes/user'));
app.use('/announcement', require('./routes/announcement'));
app.use('/invitation', require('./routes/invitation'));
app.use('/admin', require('./routes/admin'));

module.exports = app;
