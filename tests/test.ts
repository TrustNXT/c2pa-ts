import assert from 'node:assert/strict';

function add(a1: number, a2: number): number {
    return a1 + a2;
}

describe('Numerology tests', () => {
    it('checking addition', () => {
        assert.equal(add(1, 2), 3);
    });
});
