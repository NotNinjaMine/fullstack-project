require('dotenv').config();
const { assertJwtSecretConfigured } = require('./src/middleware/securityMiddleware');

try {
  assertJwtSecretConfigured();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = require('./src/app');
const { startReminderJob } = require('./src/services/reminderService');
const { startHolidayWarmup } = require('./src/services/holidayService');
const db = require('./src/config/db');

const PORT = Number(process.env.PORT || 3001);

async function boot() {
  try {
    await db.query('SELECT 1');
    console.log('Database connection OK (driver=%s)', db.driver);
  } catch (err) {
    console.error('Database connection failed:', err.message);
    console.error('Check backend/.env then: npm run seed');
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`HR Leave API listening on http://localhost:${PORT}`);
    if (process.env.REMINDER_ENABLED !== 'false') {
      startReminderJob();
    }
    // Warm current year PH; if year ≥ 2030, prefetch rolling +10 years
    if (process.env.HOLIDAY_WARMUP !== 'false') {
      startHolidayWarmup();
    }
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`${signal} received — shutting down`);
    server.close(() => {
      db.pool
        .end()
        .catch(() => {})
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

boot();
