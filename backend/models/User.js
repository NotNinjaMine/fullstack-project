module.exports = (sequelize, DataTypes) => {
    const User = sequelize.define("User", {
        name: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        email: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        password: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        role: {
            // Two-tier approval: EMPLOYEE -> SUPERVISOR -> MANAGER (no bypass)
            type: DataTypes.ENUM("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN"),
            allowNull: false,
            defaultValue: "EMPLOYEE"
        },
        country: {
            // Drives leave policy + public holiday calendar (10 countries)
            type: DataTypes.STRING(2),
            allowNull: false,
            defaultValue: "SG"
        },
        team: {
            type: DataTypes.STRING(50),
            allowNull: false,
            defaultValue: "Compliance Team A"
        },
        initials: {
            type: DataTypes.STRING(3),
            allowNull: false,
            defaultValue: "??"
        },
        resetTokenHash: {
            // SHA-256 of the single-use password-reset token (never the raw token)
            type: DataTypes.STRING(64),
            allowNull: true
        },
        resetTokenExpires: {
            type: DataTypes.DATE,
            allowNull: true
        },
        // M1 (UC-23): self-service profile + preferences (additive)
        phone: {
            type: DataTypes.STRING(30),
            allowNull: true
        },
        locale: {
            // preferred UI language (e.g. en, zh, th, vi) — drives the i18n switcher
            type: DataTypes.STRING(5),
            allowNull: false,
            defaultValue: "en"
        },
        notifyEmail: {
            // per-user email notification preference (read by the M3 notification service)
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        notifyInApp: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        // M1 (UC-24 / UC-25): account lifecycle + lockout (additive)
        status: {
            // ACTIVE normally; INVITED until an invitation is redeemed (UC-24)
            type: DataTypes.ENUM("ACTIVE", "INVITED", "DEACTIVATED"),
            allowNull: false,
            defaultValue: "ACTIVE"
        },
        failedLoginCount: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        lockedUntil: {
            type: DataTypes.DATE,
            allowNull: true
        },
        // Why the account is locked. FAILED_LOGINS auto-expires after 15 minutes;
        // ADMIN is set when a Manager/HR force-logs someone out and stays until an
        // admin clears it. Both use the same lockedUntil field so they surface in
        // the same "locked accounts" list with the same Unlock button.
        lockReason: {
            type: DataTypes.ENUM("FAILED_LOGINS", "ADMIN"),
            allowNull: true
        },
        // NOTE: email/SMS 2FA is unconditional for every sign-in — the delivery
        // method is chosen at login time and the live challenge lives in the
        // two_factor_challenges table.
        //
        // The AUTHENTICATOR-APP option below (Microsoft Authenticator / Google
        // Authenticator / Authy — any TOTP app) is DIFFERENT: it is opt-in per
        // user because it requires a one-time enrolment (scan a QR code) before
        // it can be offered. These columns hold that enrolment.
        //
        // totpSecret holds the shared TOTP secret ENCRYPTED at rest (AES-256-GCM
        // via services/totpService), never in plaintext. totpPendingSecret holds
        // a not-yet-confirmed secret during setup, promoted to totpSecret only
        // after the user proves they can generate a valid code.
        totpEnabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        totpSecret: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        totpPendingSecret: {
            type: DataTypes.STRING(255),
            allowNull: true
        }
    }, {
        tableName: 'users'
    });

    User.associate = (models) => {
        User.hasMany(models.LeaveRequest, {
            foreignKey: "employeeId",
            onDelete: "cascade"
        });
        User.hasMany(models.LeaveBalance, {
            foreignKey: "userId",
            onDelete: "cascade"
        });
        User.hasMany(models.Notification, {
            foreignKey: "userId",
            onDelete: "cascade"
        });
    };

    return User;
}
