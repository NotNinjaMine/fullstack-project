require('dotenv').config();

// Central env access with sensible defaults so the server boots even without
// a .env file (SQLite, demo mode). Mirrors the team's convention of reading
// process.env directly, just centralised for clarity.
module.exports = {
  PORT: process.env.APP_PORT || 3001,
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3000',
  APP_SECRET: process.env.APP_SECRET || 'dev_only_secret_change_me',
  TOKEN_EXPIRES_IN: process.env.TOKEN_EXPIRES_IN || '8h',

  DB_DIALECT: process.env.DB_DIALECT || 'sqlite',
  DB_STORAGE: process.env.DB_STORAGE || './data/lms.sqlite',
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: process.env.DB_PORT || 3306,
  DB_USER: process.env.DB_USER || 'root',
  DB_PWD: process.env.DB_PWD || '',
  DB_NAME: process.env.DB_NAME || 'leave',
};
