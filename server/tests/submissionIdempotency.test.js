const { normalizeSubmissionKey } = require('../services/submissionIdempotency');

describe('leave submission idempotency keys', () => {
    test('accepts UUID-style and opaque safe keys', () => {
        expect(normalizeSubmissionKey('6d3ac182-bd9b-49f8-a23c-c0f8040c57bb'))
            .toBe('6d3ac182-bd9b-49f8-a23c-c0f8040c57bb');
        expect(normalizeSubmissionKey('leave:employee-7:attempt_0001'))
            .toBe('leave:employee-7:attempt_0001');
    });

    test('treats an omitted key as an ordinary backward-compatible request', () => {
        expect(normalizeSubmissionKey(undefined)).toBeNull();
        expect(normalizeSubmissionKey('')).toBeNull();
    });

    test.each(['short', 'contains spaces 123456', 'bad\nheader-1234567890'])
    ('rejects unsafe key %j', (key) => {
        expect(() => normalizeSubmissionKey(key)).toThrow(/16–80 safe characters/i);
    });
});
