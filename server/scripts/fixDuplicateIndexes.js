// Maintenance: remove duplicate UNIQUE indexes left behind by sync({ alter: true }).
//
// Why they appear: a column declared `unique: true` (rather than with a stable
// index name) is re-created by Sequelize on every alter-sync, so MySQL collects
// country_2, country_3 ... until it hits "Too many keys specified; max 64 keys
// allowed" and the server refuses to start.
//
// This script keeps the FIRST index for each column signature and drops the rest.
// The models now name their unique constraints, so the duplicates do not return.
//
//   node scripts/fixDuplicateIndexes.js

const db = require('../models');

(async () => {
    const [rows] = await db.sequelize.query(`
        SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS COLS
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME <> 'PRIMARY'
        GROUP BY TABLE_NAME, INDEX_NAME
        ORDER BY TABLE_NAME, INDEX_NAME
    `);

    const keep = new Set();      // "table|cols" already kept
    const drop = [];
    for (const r of rows) {
        const sig = `${r.TABLE_NAME}|${r.COLS}`;
        if (keep.has(sig)) drop.push(r);
        else keep.add(sig);
    }

    if (!drop.length) {
        console.log('No duplicate indexes found — nothing to do.');
        process.exit(0);
    }

    console.log(`Dropping ${drop.length} duplicate index(es)...`);
    let done = 0;
    for (const r of drop) {
        try {
            await db.sequelize.query(`ALTER TABLE \`${r.TABLE_NAME}\` DROP INDEX \`${r.INDEX_NAME}\``);
            done++;
        } catch (err) {
            console.error(`  could not drop ${r.TABLE_NAME}.${r.INDEX_NAME}: ${err.message}`);
        }
    }

    const [after] = await db.sequelize.query(`
        SELECT TABLE_NAME, COUNT(DISTINCT INDEX_NAME) idx
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
        GROUP BY TABLE_NAME HAVING idx > 3 ORDER BY idx DESC
    `);
    console.log(`Dropped ${done}. Tables still holding more than 3 indexes:`);
    after.forEach((r) => console.log(`  ${r.TABLE_NAME}: ${r.idx}`));
    process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
