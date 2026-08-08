module.exports = (sequelize, DataTypes) => {
    const LeaveBalance = sequelize.define("LeaveBalance", {
        leaveType: {
            type: DataTypes.ENUM("annual", "sick_mc", "sick_nomc"),
            allowNull: false
        },
        year: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        entitled: {
            type: DataTypes.DECIMAL(4, 1),
            allowNull: false,
            defaultValue: 0
        },
        carried: {
            // Year-end cron caps carry-forward at 5 days (SGT 31 Dec 23:59)
            type: DataTypes.DECIMAL(4, 1),
            allowNull: false,
            defaultValue: 0
        },
        used: {
            type: DataTypes.DECIMAL(4, 1),
            allowNull: false,
            defaultValue: 0
        }
    }, {
        tableName: 'leave_balances'
    });

    LeaveBalance.associate = (models) => {
        LeaveBalance.belongsTo(models.User, {
            foreignKey: "userId"
        });
    };

    return LeaveBalance;
}
