module.exports = (sequelize, DataTypes) => {
    // M4 (UC-18): restricted leave windows (e.g. year-end close, product launch).
    // A request overlapping a blackout is BLOCKed or auto-flagged for Manager
    // SPECIAL_APPROVAL depending on the period's mode. Scope is COUNTRY or TEAM.
    const BlackoutPeriod = sequelize.define("BlackoutPeriod", {
        scope: {
            type: DataTypes.ENUM("COUNTRY", "TEAM"),
            allowNull: false,
            defaultValue: "COUNTRY"
        },
        scopeId: {
            // country code (e.g. "SG") when scope=COUNTRY, or team name when scope=TEAM
            type: DataTypes.STRING(50),
            allowNull: false
        },
        startDate: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        endDate: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        mode: {
            type: DataTypes.ENUM("BLOCK", "SPECIAL_APPROVAL"),
            allowNull: false,
            defaultValue: "SPECIAL_APPROVAL"
        },
        reason: {
            type: DataTypes.STRING(200),
            allowNull: true
        },
        active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        }
    }, {
        tableName: 'blackout_periods'
    });

    return BlackoutPeriod;
}
