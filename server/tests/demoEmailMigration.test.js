const {
    targetEmailFor,
    TARGET_DOMAIN
} = require('../services/demoEmailDomain');
const { planDemoEmailChanges } = require('../services/demoEmailMigration');

describe('demo staff email migration mapping', () => {
    test.each([
        ['somchai@innovare.com', `somchai@${TARGET_DOMAIN}`],
        ['Marcus@Innovare.com', `marcus@${TARGET_DOMAIN}`],
        ['weiling@innovare.example.test', `weiling@${TARGET_DOMAIN}`]
    ])('maps %s while preserving the local part', (source, expected) => {
        expect(targetEmailFor(source)).toBe(expected);
    });

    test('ignores already-migrated and unrelated addresses', () => {
        expect(targetEmailFor(`somchai@${TARGET_DOMAIN}`)).toBeNull();
        expect(targetEmailFor('unit@example.test')).toBeNull();
    });

    test('plans an in-place ID-preserving update for active legacy rows', () => {
        expect(planDemoEmailChanges([
            { id: 4, email: 'kumar@innovare.example.test' },
            { id: 6, email: 'diana@wypledu.online' }
        ])).toEqual([{ id: 4, target: 'kumar@wypledu.online' }]);
    });

    test('aborts instead of creating a duplicate when the target address already belongs to another user', () => {
        expect(() => planDemoEmailChanges([
            { id: 4, email: 'kumar@innovare.example.test' },
            { id: 99, email: 'kumar@wypledu.online' }
        ])).toThrow(/target email address is already assigned/i);
    });



    test('inactive legacy rows are not migrated, while their target ownership still protects uniqueness', () => {
        expect(planDemoEmailChanges([
            { id: 4, email: 'old@innovare.com', status: 'DEACTIVATED' },
            { id: 6, email: 'active@innovare.com', status: 'ACTIVE' }
        ])).toEqual([{ id: 6, target: 'active@wypledu.online' }]);

        expect(() => planDemoEmailChanges([
            { id: 4, email: 'kumar@innovare.com', status: 'ACTIVE' },
            { id: 99, email: 'kumar@wypledu.online', status: 'DEACTIVATED' }
        ])).toThrow(/target email address is already assigned/i);
    });

    test('aborts when two differently-cased legacy rows normalize to one target', () => {
        expect(() => planDemoEmailChanges([
            { id: 4, email: 'Kumar@Innovare.com' },
            { id: 5, email: 'kumar@innovare.example.test' }
        ])).toThrow(/multiple legacy users would map to the same target/i);
    });
});
