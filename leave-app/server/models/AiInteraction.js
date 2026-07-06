module.exports = (sequelize, DataTypes) => {
    const AiInteraction = sequelize.define("AiInteraction", {
        feature: {
            // AI-1 parse | AI-2 coverage | AI-3 summary | AI-4 chatbot
            type: DataTypes.STRING(20),
            allowNull: false
        },
        input: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        output: {
            type: DataTypes.TEXT,
            allowNull: false
        }
    }, {
        tableName: 'ai_interactions'
    });

    AiInteraction.associate = (models) => {
        AiInteraction.belongsTo(models.User, {
            foreignKey: "userId"
        });
    };

    return AiInteraction;
}
