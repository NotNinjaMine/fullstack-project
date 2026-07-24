module.exports = (sequelize, DataTypes) => {
    // Shared reference data: append-only audit trail for HR/admin config
    // changes (announcements, invitations, bulk entitlement, ...). Owned by
    // the HR-admin vertical; stubbed here (minimal) because Member 1's
    // invitation/entitlement code writes to it.
    const ConfigAuditLog = sequelize.define("ConfigAuditLog", {
        actorName: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        action: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        entity: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        entityId: {
            type: DataTypes.STRING(50),
            allowNull: true
        },
        before: {
            type: DataTypes.JSON,
            allowNull: true
        },
        after: {
            type: DataTypes.JSON,
            allowNull: true
        }
    }, {
        tableName: 'config_audit_logs'
    });

    return ConfigAuditLog;
}
