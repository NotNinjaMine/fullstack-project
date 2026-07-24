module.exports = (sequelize, DataTypes) => {
  // Read-only audit trail for configuration/admin actions that aren't tied to a
  // single leave request (invitations, entitlement runs, announcements, session
  // revokes). Append-only — no update/delete endpoint. Every M1 state-changing
  // admin action writes one row (DoD: "every state-changing action audits").
  const ConfigAuditLog = sequelize.define(
    'ConfigAuditLog',
    {
      action: { type: DataTypes.STRING(200), allowNull: false },
      actorName: { type: DataTypes.STRING(120), allowNull: false },
      entity: { type: DataTypes.STRING(50), allowNull: true },
      entityId: { type: DataTypes.STRING(50), allowNull: true },
      before: { type: DataTypes.JSON, allowNull: true },
      after: { type: DataTypes.JSON, allowNull: true },
    },
    { tableName: 'config_audit_log' }
  );

  return ConfigAuditLog;
};
