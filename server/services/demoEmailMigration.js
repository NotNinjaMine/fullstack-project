'use strict';

const { TARGET_DOMAIN, normalize, targetEmailFor } = require('./demoEmailDomain');

const planDemoEmailChanges = (users) => {
    const rows = (users || []).map((user) => ({
        id: Number(user.id),
        email: normalize(user.email),
        status: user.status == null ? 'ACTIVE' : String(user.status).trim().toUpperCase(),
        target: targetEmailFor(user.email)
    }));

    const ownerByEmail = new Map();
    for (const row of rows) {
        if (!row.email) continue;
        const existing = ownerByEmail.get(row.email);
        if (existing && existing !== row.id) {
            throw new Error('Migration aborted: the same normalized email is assigned to multiple users.');
        }
        ownerByEmail.set(row.email, row.id);
    }

    // Only active demo staff are migrated, but collision detection above uses
    // every account. An inactive/invited account can still own a unique email
    // and must therefore block an unsafe target update.
    const changes = rows.filter((row) => row.status === 'ACTIVE' && row.target);
    const sourceByTarget = new Map();
    for (const change of changes) {
        const target = normalize(change.target);
        const existing = sourceByTarget.get(target);
        if (existing && existing !== change.id) {
            throw new Error('Migration aborted: multiple legacy users would map to the same target email.');
        }
        sourceByTarget.set(target, change.id);

        const targetOwner = ownerByEmail.get(target);
        if (targetOwner && targetOwner !== change.id) {
            throw new Error('Migration aborted: a target email address is already assigned to another user.');
        }
    }

    return changes.map(({ id, target }) => ({ id, target }));
};

const migrateActiveLegacyUsers = async ({ User, sequelize }) => {
    let updatedCount = 0;
    await sequelize.transaction(async (transaction) => {
        const users = await User.findAll({
            attributes: ['id', 'email', 'status'],
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        const changes = planDemoEmailChanges(users);
        if (changes.length === 0) return;

        const byId = new Map(users.map((user) => [Number(user.id), user]));
        for (const change of changes) {
            const user = byId.get(change.id);
            if (!user) throw new Error('Migration aborted: a selected user no longer exists.');
            user.email = change.target;
            await user.save({ transaction, fields: ['email'] });
            updatedCount += 1;
        }
    });
    return updatedCount;
};

const countActiveLegacyUsers = async (User) => {
    const users = await User.findAll({
        where: { status: 'ACTIVE' },
        attributes: ['email']
    });
    return users.filter((user) => targetEmailFor(user.email)).length;
};

const verifyNoActiveLegacyUsers = async (User) => {
    const remaining = await countActiveLegacyUsers(User);
    if (remaining !== 0) {
        throw new Error(`Verification failed: ${remaining} active legacy-domain user(s) remain.`);
    }
    return { targetDomain: TARGET_DOMAIN, remaining };
};

module.exports = {
    planDemoEmailChanges,
    migrateActiveLegacyUsers,
    countActiveLegacyUsers,
    verifyNoActiveLegacyUsers
};
