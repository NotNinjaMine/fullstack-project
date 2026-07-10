async function writeAudit(
  { action, actorUserId, entityType, entityId, beforeState = null, afterState = null },
  client
) {
  if (!client) {
    throw new Error('auditService.writeAudit requires a DB client (use inside a transaction)');
  }

  await client.query(
    `INSERT INTO audit_log (action, actor_user_id, entity_type, entity_id, before_state, after_state)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      action,
      actorUserId,
      entityType,
      entityId,
      beforeState ? JSON.stringify(beforeState) : null,
      afterState ? JSON.stringify(afterState) : null,
    ]
  );
}

module.exports = { writeAudit };
