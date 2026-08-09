'use strict';

require('dotenv').config();
const db = require('../models');
const { verifyNoActiveLegacyUsers } = require('../services/demoEmailMigration');

async function main() {
    await db.sequelize.authenticate();
    await verifyNoActiveLegacyUsers(db.User);
    console.log('Demo staff email verification passed. Active legacy-domain rows: 0.');
}

if (require.main === module) {
    main()
        .then(() => db.sequelize.close())
        .catch(async (error) => {
            console.error(error.message);
            try { await db.sequelize.close(); } catch (_) { /* no-op */ }
            process.exit(1);
        });
}
