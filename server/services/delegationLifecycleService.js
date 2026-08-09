const { Op } = require("sequelize");
const { sequelize, Delegation, User, AuditLog } = require("../models");
const { todayISO } = require("./businessTime");
const { notifyMany } = require("./notificationService");

const runExpiredDelegationNotifications = async (now = new Date()) => {
    const today = todayISO(now);
    const candidates = await Delegation.findAll({
        where: { active: true, endDate: { [Op.lt]: today } },
        attributes: ["id"]
    });

    let expired = 0;
    for (const candidate of candidates) {
        const result = await sequelize.transaction(async (transaction) => {
            const delegation = await Delegation.findByPk(candidate.id, {
                include: [
                    { model: User, as: "fromUser", attributes: ["id", "name", "role", "team"] },
                    { model: User, as: "toUser", attributes: ["id", "name", "role", "team"] }
                ],
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!delegation || !delegation.active || delegation.endDate >= today) return null;

            delegation.active = false;
            delegation.expiryNotifiedAt = now;
            await delegation.save({ transaction });
            await AuditLog.create({
                requestId: null,
                actorName: "System",
                action: `Delegation expired: ${delegation.fromUser?.name || delegation.fromUserId} to ${delegation.toUser?.name || delegation.toUserId}`.slice(0, 200)
            }, { transaction });
            return delegation;
        });
        if (!result) continue;

        const message = `Approval delegation from ${result.fromUser?.name || "an approver"} to ${result.toUser?.name || "the delegate"} has expired.`;
        await notifyMany(
            [result.fromUserId, result.toUserId],
            message,
            {
                type: "DELEGATION",
                event: "DELEGATION_EXPIRED",
                delegationRole: result.fromUser?.role,
                team: result.fromUser?.team,
                startDate: result.startDate,
                endDate: result.endDate
            }
        ).catch(() => {
            console.error(`[notification] delegation expiry delivery failed for delegation ${result.id}.`);
        });
        expired++;
    }
    return expired;
};

let schedulerStarted = false;
const startDelegationExpiryScheduler = () => {
    if (schedulerStarted) return;
    schedulerStarted = true;
    setTimeout(() => runExpiredDelegationNotifications().catch(() => {}), 10 * 1000);
    setInterval(() => runExpiredDelegationNotifications().catch(() => {}), 60 * 60 * 1000);
};

module.exports = { runExpiredDelegationNotifications, startDelegationExpiryScheduler };
