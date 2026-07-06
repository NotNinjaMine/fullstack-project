module.exports = (sequelize, DataTypes) => {
    const AuditLog = sequelize.define("AuditLog", {
        action: {
            type: DataTypes.STRING(200),
            allowNull: false
        },
        actorName: {
            type: DataTypes.STRING(50),
            allowNull: false
        }
    }, {
        tableName: 'audit_log'
    });

    AuditLog.associate = (models) => {
        AuditLog.belongsTo(models.LeaveRequest, {
            foreignKey: "requestId"
        });
    };

    return AuditLog;
}
