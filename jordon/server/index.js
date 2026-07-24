const app = require('./app');
const db = require('./models');
const env = require('./config/env');

// Export the app for tests; only sync + listen when run directly.
module.exports = app;

if (require.main === module) {
  db.sequelize
    .sync({ alter: true })
    .then(() => {
      app.listen(env.PORT, () => {
        console.log(`⚡ M1 API running on http://localhost:${env.PORT} (dialect: ${env.DB_DIALECT})`);
      });
    })
    .catch((err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}
