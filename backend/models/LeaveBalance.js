module.exports = (sequelize, DataTypes) => {
    // Shared reference data: per-user, per-year balance for a leave type.
    // Owned by the leave-request vertical; stubbed here (minimal) because
    // Member 1's provisioning/entitlement code depends on it — see seed.js.
    const LeaveBalance = sequelize.define("LeaveBalance", {
        leaveType: {
            type: DataTypes.STRING(20),
            allowNull: false
        },
        year: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        entitled: {
            type: DataTypes.DECIMAL(5, 1),
            allowNull: false,
            defaultValue: 0
        },
        carried: {
            type: DataTypes.DECIMAL(5, 1),
            allowNull: false,
            defaultValue: 0
        },
        used: {
            type: DataTypes.DECIMAL(5, 1),
            allowNull: false,
            defaultValue: 0
        }
    }, {
        tableName: 'leave_balances'
    });

    LeaveBalance.associate = (models) => {
        LeaveBalance.belongsTo(models.User, { foreignKey: "userId", onDelete: "cascade" });
    };

    return LeaveBalance;
}
