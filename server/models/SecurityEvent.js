module.exports = (sequelize, DataTypes) => {
    // M1 (UC-25): personal security log. Every login, logout, failed attempt,
    // password change, and session revoke is recorded here and retained for the
    // year. Also drives the 3-strikes / 15-minute lockout (counted in code).
    const SecurityEvent = sequelize.define("SecurityEvent", {
        eventType: {
            type: DataTypes.ENUM(
                "LOGIN", "LOGOUT", "FAILED_LOGIN", "PASSWORD_CHANGE", "SESSION_REVOKED", "LOCKED", "UNLOCKED",
                // M1 (2FA): second-step login events
                "TWO_FACTOR_CHALLENGED", "TWO_FACTOR_SUCCESS", "TWO_FACTOR_FAILED",
                "TWO_FACTOR_ENABLED", "TWO_FACTOR_DISABLED", "TWO_FACTOR_RESET"
            ),
            allowNull: false
        },
        ipAddress: {
            type: DataTypes.STRING(64),
            allowNull: true
        },
        success: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        }
    }, {
        tableName: 'security_events'
    });

    SecurityEvent.associate = (models) => {
        SecurityEvent.belongsTo(models.User, { foreignKey: "userId", onDelete: "cascade" });
    };

    return SecurityEvent;
}
