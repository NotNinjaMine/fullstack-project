module.exports = (sequelize, DataTypes) => {
    // Shared reference data: one row per country, drives entitlement bounds
    // (UC-20) and new-account provisioning. Owned by the leave-request vertical;
    // stubbed here (minimal) because Member 1's provisioning/entitlement code
    // depends on it and it wasn't part of this bundle yet — see seed.js.
    const LeavePolicy = sequelize.define("LeavePolicy", {
        country: {
            type: DataTypes.STRING(2),
            allowNull: false,
            unique: true
        },
        countryName: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        annualMin: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        annualMax: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        sickMc: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 14
        },
        sickNoMc: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 60
        }
    }, {
        tableName: 'leave_policies'
    });

    return LeavePolicy;
}
