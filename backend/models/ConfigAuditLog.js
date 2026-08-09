module.exports = (sequelize, DataTypes) => {
    // M5 (UC-21): system-wide, read-only audit log for configuration and admin
    // actions that are NOT tied to a single leave request (policy edits, weekend
    // config, blackout/min-staffing, announcements, entitlement runs, carry-forward,
    // invitations, session revokes). The existing AuditLog stays request-scoped;
    // the audit-trail viewer merges both. Append-only — no update/delete endpoint.
    const ConfigAuditLog = sequelize.define("ConfigAuditLog", {
        action: {
            type: DataTypes.STRING(200),
            allowNull: false
        },
        actorName: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        entity: {
            // e.g. "leave_policies", "country_working_days", "blackout_periods"
            type: DataTypes.STRING(50),
            allowNull: true
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
        tableName: 'config_audit_log'
    });

    return ConfigAuditLog;
}
