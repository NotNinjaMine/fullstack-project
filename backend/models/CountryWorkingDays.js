module.exports = (sequelize, DataTypes) => {
    // M4 (UC-29): per-country weekend configuration. Feeds the working-day &
    // holiday-aware leave calculation (calculationService / coverage.js). Default
    // is Sat-Sun for every country; HR adjusts only where the company differs.
    // Stored as a JSON map of weekday -> working(boolean). At least one working
    // day must remain (enforced in the route, never a full-week weekend).
    const CountryWorkingDays = sequelize.define("CountryWorkingDays", {
        country: {
            type: DataTypes.STRING(2),
            allowNull: false,
            unique: true
        },
        // { mon:true, tue:true, wed:true, thu:true, fri:true, sat:false, sun:false }
        workingDays: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: {
                mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false
            }
        }
    }, {
        tableName: 'country_working_days'
    });

    return CountryWorkingDays;
}
