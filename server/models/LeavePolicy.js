module.exports = (sequelize, DataTypes) => {
    // Per-country statutory leave policy (HLD §5.3 leave_policies).
    // An employee's country decides BOTH their public-holiday calendar and
    // the min/max annual leave they can be entitled to under local law.
    const LeavePolicy = sequelize.define("LeavePolicy", {
        country: {
            type: DataTypes.STRING(2),
            allowNull: false,
            unique: 'leave_policies_country_unique'
        },
        countryName: {
            type: DataTypes.STRING(40),
            allowNull: false
        },
        annualMin: {
            // Statutory minimum annual leave days (company floor)
            type: DataTypes.INTEGER,
            allowNull: false
        },
        annualMax: {
            // Company ceiling for annual leave in that country
            type: DataTypes.INTEGER,
            allowNull: false
        },
        sickMc: {
            // Sick leave with medical certificate (days/year)
            type: DataTypes.INTEGER,
            allowNull: false
        },
        sickNoMc: {
            // Sick leave without MC (days/year)
            type: DataTypes.INTEGER,
            allowNull: false
        },
        carryForwardMax: {
            // Year-end carry-forward cap (5 for all countries per policy)
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 5
        }
    }, {
        tableName: 'leave_policies'
    });

    return LeavePolicy;
}
