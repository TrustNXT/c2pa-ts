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

    describe('Hashed URIs', () => {
        const hash = new Uint8Array([
            207, 158, 91, 70, 161, 82, 191, 241, 221, 66, 81, 105, 83, 222, 128, 80, 252, 3, 156, 115, 22, 139, 245,
            213, 85, 169, 222, 116, 161, 59, 147, 23,
        ]);

        it('mapping with default algorithm', () => {
            const claim = new Claim();
            claim.defaultAlgorithm = 'SHA-256';

            const hashedURI = {
                algorithm: 'SHA-256' as HashAlgorithm,
                hash: hash,
                uri: 'https://example.com',
            };

            const rawHashedURI = claim.reverseMapHashedURI(hashedURI);

            assert.deepEqual(rawHashedURI, {
                hash: hash,
                url: 'https://example.com',
            });

            const mappedHashedURI = claim.mapHashedURI(rawHashedURI);
            assert.deepEqual(mappedHashedURI, hashedURI);
        });

        it('mapping with non-default algorithm', () => {
            const claim = new Claim();
            claim.defaultAlgorithm = 'SHA-256';

            const hashedURI = {
                algorithm: 'SHA-512' as HashAlgorithm,
                hash: hash,
                uri: 'https://example.com',
            };

            const rawHashedURI = claim.reverseMapHashedURI(hashedURI);

            assert.deepEqual(rawHashedURI, {
                alg: 'sha512',
                hash: hash,
                url: 'https://example.com',
            });

            const mappedHashedURI = claim.mapHashedURI(rawHashedURI);
            assert.deepEqual(mappedHashedURI, hashedURI);
        });
    });
});
