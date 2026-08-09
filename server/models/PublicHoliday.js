module.exports = (sequelize, DataTypes) => {
    const PublicHoliday = sequelize.define("PublicHoliday", {
        country: {
            type: DataTypes.STRING(2),
            allowNull: false
        },
        date: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        name: {
            type: DataTypes.STRING(80),
            allowNull: false
        }
    }, {
        tableName: 'public_holidays'
    });

    return PublicHoliday;
}
