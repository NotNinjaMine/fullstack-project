module.exports = (sequelize, DataTypes) => {
    const Delegation = sequelize.define("Delegation", {
        startDate: { type: DataTypes.DATEONLY, allowNull: false },
        endDate: { type: DataTypes.DATEONLY, allowNull: false },
        reason: { type: DataTypes.STRING(200), allowNull: true },
        active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
    }, { tableName: 'delegations' });

    Delegation.associate = (models) => {
        Delegation.belongsTo(models.User, { as: "fromUser", foreignKey: "fromUserId" });
        Delegation.belongsTo(models.User, { as: "toUser", foreignKey: "toUserId" });
    };
    return Delegation;
};
