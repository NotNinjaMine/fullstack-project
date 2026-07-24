'use strict';

const fs = require('fs');
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');
const env = require('../config/env');

const basename = path.basename(__filename);
const db = {};

// Dialect-agnostic bootstrap. Defaults to SQLite (zero-infra, runs anywhere);
// set DB_DIALECT=mysql in .env to point at the team's shared MySQL instead —
// the model definitions below are identical across dialects.
let sequelize;
if (env.DB_DIALECT === 'mysql') {
  sequelize = new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PWD, {
    host: env.DB_HOST,
    port: env.DB_PORT,
    dialect: 'mysql',
    logging: false,
    timezone: '+08:00', // SGT — HQ timezone
  });
} else {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: env.DB_STORAGE,
    logging: false,
  });
}

fs.readdirSync(__dirname)
  .filter(
    (file) =>
      file.indexOf('.') !== 0 && file !== basename && file.slice(-3) === '.js'
  )
  .forEach((file) => {
    const model = require(path.join(__dirname, file))(sequelize, DataTypes);
    db[model.name] = model;
  });

Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
