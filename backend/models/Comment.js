module.exports = (sequelize, DataTypes) => {
    const Comment = sequelize.define("Comment", {
        body: { type: DataTypes.STRING(500), allowNull: false },
        authorName: { type: DataTypes.STRING(50), allowNull: false },
        authorRole: { type: DataTypes.ENUM("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN"), allowNull: false }
    }, { tableName: 'request_comments' });

    Comment.associate = (models) => {
        Comment.belongsTo(models.LeaveRequest, { foreignKey: "requestId", onDelete: "cascade" });
        Comment.belongsTo(models.User, { as: "author", foreignKey: "authorId" });
    };
    return Comment;
};
