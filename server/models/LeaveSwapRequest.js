module.exports = (sequelize, DataTypes) => {
    // M2 (UC-27): a paired swap of approved leave dates between two same-team
    // employees. On final Manager approval both leave_requests are updated
    // atomically (dates swap, balances unchanged). Expires 48h after proposal
    // if the counterpart does not respond.
    const LeaveSwapRequest = sequelize.define("LeaveSwapRequest", {
        status: {
            type: DataTypes.ENUM(
                "PENDING_ACCEPT", "ACCEPTED", "PENDING_APPROVAL",
                "APPROVED", "REJECTED", "EXPIRED", "DECLINED"
            ),
            allowNull: false,
            defaultValue: "PENDING_ACCEPT"
        },
        // Snapshot of the dates being swapped (so the swap is self-describing)
        proposerStart: { type: DataTypes.DATEONLY, allowNull: false },
        proposerEnd: { type: DataTypes.DATEONLY, allowNull: false },
        counterpartStart: { type: DataTypes.DATEONLY, allowNull: false },
        counterpartEnd: { type: DataTypes.DATEONLY, allowNull: false },
        expiresAt: { type: DataTypes.DATE, allowNull: false },
        supervisorStatus: {
            type: DataTypes.ENUM("PENDING", "APPROVED", "REJECTED"),
            allowNull: false,
            defaultValue: "PENDING"
        }
    }, {
        tableName: 'leave_swap_requests'
    });

    LeaveSwapRequest.associate = (models) => {
        LeaveSwapRequest.belongsTo(models.LeaveRequest, { as: "proposerRequest", foreignKey: "proposerRequestId" });
        LeaveSwapRequest.belongsTo(models.LeaveRequest, { as: "counterpartRequest", foreignKey: "counterpartRequestId" });
        LeaveSwapRequest.belongsTo(models.User, { as: "proposer", foreignKey: "proposerUserId" });
        LeaveSwapRequest.belongsTo(models.User, { as: "counterpart", foreignKey: "counterpartUserId" });
    };

    return LeaveSwapRequest;
};
