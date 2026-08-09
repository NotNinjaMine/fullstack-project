'use strict';

// Explicit, idempotent development-data migration.
// Run only with:
//   npm run migrate:demo-emails -- --confirm=wypledu.online
//
// It updates ACTIVE users on the legacy Innovare demo domains while preserving
// IDs and relationships. It never runs in test/production and aborts on
// normalized-email or target-address collisions.
require('dotenv').config();

const { TARGET_DOMAIN, LEGACY_DOMAINS, normalize, targetEmailFor } = require('../services/demoEmailDomain');
const {
    migrateActiveLegacyUsers,
    verifyNoActiveLegacyUsers
} = require('../services/demoEmailMigration');
const db = require('../models');
const { User, sequelize } = db;

const hasConfirmation = () => process.argv.includes(`--confirm=${TARGET_DOMAIN}`);

async function migrateDemoEmails() {
    const environment = normalize(process.env.NODE_ENV || 'development');
    if (environment === 'production' || environment === 'test') {
        throw new Error(`Refusing demo email migration in NODE_ENV=${environment}.`);
    }
    if (!hasConfirmation()) {
        throw new Error(
            `Confirmation required. Run: npm run migrate:demo-emails -- --confirm=${TARGET_DOMAIN}`
        );
    }

    const updatedCount = await migrateActiveLegacyUsers({ User, sequelize });
    await verifyNoActiveLegacyUsers(User);

    console.log(`Demo staff email migration complete. Updated rows: ${updatedCount}.`);
    console.log('Active legacy-domain rows remaining: 0.');
}

if (require.main === module) {
    migrateDemoEmails()
        .then(() => sequelize.close())
        .catch(async (error) => {
            console.error(error.message);
            try { await sequelize.close(); } catch (_) { /* no-op */ }
            process.exit(1);
        });
}

module.exports = { targetEmailFor, migrateDemoEmails, LEGACY_DOMAINS, TARGET_DOMAIN };
