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
        }
    }, {
        tableName: 'users'
    });

    User.associate = (models) => {
        // LeaveRequest / Notification belong to other members' verticals and
        // aren't part of this bundle yet — guard so the registry still loads.
        if (models.LeaveRequest) {
            User.hasMany(models.LeaveRequest, {
                foreignKey: "employeeId",
                onDelete: "cascade"
            });
        }
        if (models.LeaveBalance) {
            User.hasMany(models.LeaveBalance, {
                foreignKey: "userId",
                onDelete: "cascade"
            });
        }
        if (models.Notification) {
            User.hasMany(models.Notification, {
                foreignKey: "userId",
                onDelete: "cascade"
            });
        }
    };

    return User;
}
