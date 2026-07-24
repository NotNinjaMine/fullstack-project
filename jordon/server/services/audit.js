const { ConfigAuditLog } = require('../models');

// Append-only audit helper (UC DoD: every state-changing admin action logs).
const configAudit = (actorName, action, entity = null, entityId = null, before = null, after = null) =>
  ConfigAuditLog.create({ actorName, action, entity, entityId, before, after });

module.exports = { configAudit };
