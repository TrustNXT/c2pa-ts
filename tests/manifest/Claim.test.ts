import assert from 'node:assert/strict';
import { HashAlgorithm } from '../../src/crypto';
import { Claim } from '../../src/manifest';

describe('Claim Tests', function () {
    this.timeout(0);

    describe('Algorithms', () => {
        it('mapping names', () => {
            for (const algo of ['SHA-256', 'SHA-384', 'SHA-512']) {
                const rawAlgo = Claim.reverseMapHashAlgorithm(algo as HashAlgorithm);
                const mappedAlgo = Claim.mapHashAlgorithm(rawAlgo);
                assert.equal(mappedAlgo, algo);
            }
        });
    });
});
