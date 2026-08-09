const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { sequelize, User, Delegation, AuditLog } = require('../models');
const yup = require("yup");
const { validateToken, requireRole } = require('../middlewares/auth');
const { notifyMany } = require('../services/notificationService');
const { isDelegationActive } = require('../services/delegationService');
const { todayISO } = require('../services/businessTime');

/* ---------------- Enhanced: approval delegation ---------------- */

// POST /delegation
router.post("/", validateToken, requireRole("SUPERVISOR", "MANAGER"), async (req, res) => {
    let validationSchema = yup.object({
        toUserId: yup.number().integer().required(),
        startDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required(),
        endDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required(),
        reason: yup.string().trim().max(200).nullable()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const today = todayISO();

        if (data.endDate < data.startDate) {
            return res.status(400).json({ message: "endDate must be on or after startDate." });
        }
        if (data.startDate < today) {
            return res.status(400).json({ message: "startDate must be today or later." });
        }
        if (data.toUserId === req.user.id) {
            return res.status(400).json({ message: "Cannot delegate to yourself." });
        }

        const result = await sequelize.transaction(async (transaction) => {
            // Lock in a deterministic order within this connection. Avoid issuing
            // concurrent queries through a single transaction/connection.
            const fromUser = await User.findByPk(req.user.id, {
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            const toUser = await User.findByPk(data.toUserId, {
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!fromUser || fromUser.status !== "ACTIVE") {
                return { error: "Only an active approver can create a delegation." };
            }
            if (!toUser) {
                return { error: "Delegate user not found." };
            }
            if (toUser.status !== "ACTIVE") {
                return { error: "Delegate must have an ACTIVE account." };
            }
            if (toUser.role !== fromUser.role) {
                return { error: `Delegate must also be a ${fromUser.role}, since approval tiers are role-matched.` };
            }

            // Prevent chains and ambiguous authority: neither party may already
            // participate in another active delegation over the requested range.
            const conflict = await Delegation.findOne({
                where: {
                    active: true,
                    startDate: { [Op.lte]: data.endDate },
                    endDate: { [Op.gte]: data.startDate },
                    [Op.or]: [
                        { fromUserId: fromUser.id },
                        { toUserId: fromUser.id },
                        { fromUserId: toUser.id },
                        { toUserId: toUser.id }
                    ]
                },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (conflict) {
                return { error: "This date range overlaps an active delegation involving either approver." };
            }

            const delegation = await Delegation.create({
                fromUserId: fromUser.id,
                toUserId: toUser.id,
                startDate: data.startDate,
                endDate: data.endDate,
                reason: data.reason || null,
                active: true
            }, { transaction });

            await AuditLog.create({
                requestId: null,
                actorName: fromUser.name,
                action: `Delegated ${fromUser.role} authority to ${toUser.name} (${data.startDate} to ${data.endDate})`.slice(0, 200)
            }, { transaction });

            return { delegation, fromUser, toUser };
        });

        if (result.error) return res.status(400).json({ message: result.error });

        try {
            await notifyMany(
                [result.fromUser.id, result.toUser.id],
                `${result.fromUser.name} delegated ${result.fromUser.role} approvals to ${result.toUser.name} from ${data.startDate} to ${data.endDate}.`,
                {
                    type: "DELEGATION",
                    event: "DELEGATION_CREATED",
                    delegationRole: result.fromUser.role,
                    team: result.fromUser.team,
                    startDate: data.startDate,
                    endDate: data.endDate
                }
            );
        } catch (_) {
            console.error(`[notification] delegation-created delivery failed for delegation ${result.delegation.id}.`);
        }

        res.json(result.delegation);
    }
    catch (err) {
        if (err.errors) {
            return res.status(400).json({ errors: err.errors });
        }
        res.status(400).json({ message: err.message || "Invalid request." });
    }
});

// GET /delegation/mine
router.get("/mine", validateToken, requireRole("SUPERVISOR", "MANAGER"), async (req, res) => {
    const today = todayISO();
    const includeUsers = [
        { model: User, as: "fromUser", attributes: ["id", "name"] },
        { model: User, as: "toUser", attributes: ["id", "name"] }
    ];

    const given = await Delegation.findAll({
        where: { fromUserId: req.user.id },
        include: includeUsers,
        order: [['startDate', 'DESC']]
    });
    const received = await Delegation.findAll({
        where: { toUserId: req.user.id },
        include: includeUsers,
        order: [['startDate', 'DESC']]
    });

    const withEffective = (rows) => rows.map(r => {
        const json = r.toJSON();
        json.effective = isDelegationActive(r, today);
        return json;
    });

    res.json({ given: withEffective(given), received: withEffective(received) });
});

// GET /delegation/candidates
// Only same-role peers are valid delegates: approval tier-matching (canActOn)
// requires the delegate's OWN role to match the pending tier, so a SUPERVISOR
// can only meaningfully delegate to another SUPERVISOR, and a MANAGER to
// another MANAGER. Returning cross-role users here would let someone create a
// delegation that looks successful but can never actually grant access.
router.get("/candidates", validateToken, requireRole("SUPERVISOR", "MANAGER"), async (req, res) => {
    const list = await User.findAll({
        where: {
            role: req.user.role,
            status: "ACTIVE",
            id: { [Op.ne]: req.user.id }
        },
        attributes: ["id", "name", "role", "team"],
        order: [['name', 'ASC']]
    });
    res.json(list);
});

// PUT /delegation/:id/revoke
router.put("/:id/revoke", validateToken, requireRole("SUPERVISOR", "MANAGER"), async (req, res) => {
    const result = await sequelize.transaction(async (transaction) => {
        const d = await Delegation.findByPk(req.params.id, {
            include: [{ model: User, as: "toUser", attributes: ["id", "name"] }],
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!d) return { status: 404 };
        if (d.fromUserId !== req.user.id) return { status: 403 };
        if (!d.active) return { status: 400, message: "Delegation is already inactive." };

        d.active = false;
        d.revokedAt = new Date();
        await d.save({ transaction });
        await AuditLog.create({
            requestId: null,
            actorName: req.user.name,
            action: `Revoked delegation to ${d.toUser?.name || `user ${d.toUserId}`}`.slice(0, 200)
        }, { transaction });
        return { status: 200, delegation: d };
    });

    if (result.status === 404) return res.sendStatus(404);
    if (result.status === 403) return res.sendStatus(403);
    if (result.status !== 200) return res.status(result.status).json({ message: result.message });

    try {
        await notifyMany(
            [req.user.id, result.delegation.toUserId],
            `${req.user.name} revoked the approval delegation effective immediately.`,
            {
                type: "DELEGATION",
                event: "DELEGATION_REVOKED",
                delegationRole: req.user.role,
                team: req.user.team
            }
        );
    } catch (_) {
        console.error(`[notification] delegation-revoked delivery failed for delegation ${result.delegation.id}.`);
    }
    res.json({ message: "Delegation revoked." });
});

module.exports = router;
