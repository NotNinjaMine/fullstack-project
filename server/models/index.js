'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
// Sequelize loads the mysql2 dialect via a computed require(), which Vercel's
// build-time file tracer can't follow — without this explicit require the
// deployed bundle omits mysql2 entirely and every query fails at runtime.
require('mysql2');
const process = require('process');
const basename = path.basename(__filename);
const db = {};
require('dotenv').config();

// Create sequelize instance using config
const sequelizeOptions = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
    logging: false,
    timezone: '+08:00'
};
if (process.env.VERCEL) {
  // Each serverless invocation can land on a fresh instance with its own pool,
  // so a small max here keeps concurrent invocations from exhausting the
  // database's connection limit.
  sequelizeOptions.pool = { max: 2, min: 0, idle: 5000, acquire: 30000 };
}
if (process.env.DB_SSL === 'true') {
  // Managed MySQL (e.g. TiDB Serverless, PlanetScale) refuses plaintext
  // connections. Local MySQL has no cert to verify against, so this is
  // opt-in rather than always-on.
  sequelizeOptions.dialectOptions = { ssl: { minVersion: 'TLSv1.2' } };
}
let sequelize = new Sequelize(
  process.env.DB_NAME, process.env.DB_USER, process.env.DB_PWD,
  sequelizeOptions
);

fs
  .readdirSync(__dirname)
  .filter(file => {
    return (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js');
  })
  .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
