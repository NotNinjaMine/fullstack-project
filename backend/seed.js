// Demo data seeder: npm run seed
// Mirrors the client's mock fixtures (client/src/mocks/data.js) so the two
// backends behave identically. Seeding logic lives in seedData.js so the test
// harness can reuse it.
const db = require('./models');
const { seed } = require('./seedData');

(async () => {
  await db.sequelize.sync({ force: true });
  await seed({ log: console.log });
  console.log('Seed complete.');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
