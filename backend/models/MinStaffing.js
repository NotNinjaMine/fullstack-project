module.exports = (sequelize, DataTypes) => {
    // M4 (UC-17): minimum on-duty headcount rules that colour the manpower heatmap.
    // A day is red when on-duty headcount falls below minHeadcount for its scope.
    const MinStaffing = sequelize.define("MinStaffing", {
        scope: {
            type: DataTypes.ENUM("COUNTRY", "TEAM"),
            allowNull: false,
            defaultValue: "TEAM"
        },
        scopeId: {
            // team name when scope=TEAM, country code when scope=COUNTRY
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true
        },
        minHeadcount: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 3
        }
    }, {
        tableName: 'min_staffing'
    });

    return MinStaffing;
}
