import assert from 'node:assert/strict';
import { describe, it } from 'bun:test';
import { Crypto, HashAlgorithm, MerkleTree } from '../../src/crypto';

describe('MerkleTree', () => {
    describe('Construction and Building', () => {
        it('should build a tree with a single leaf', async () => {
            const tree = new MerkleTree('SHA-256');
            const data = new Uint8Array([1, 2, 3, 4]);
            await tree.addLeaf(data);

            const result = await tree.build();

            assert.equal(result.count, 1);
            assert.equal(result.hashes.length, 1);
            // For a single leaf, the root is the leaf hash itself
            const expectedHash = await Crypto.digest(data, 'SHA-256');
            assert.deepEqual(result.root, expectedHash);
        });

        it('should build a tree with multiple leaves', async () => {
            const tree = new MerkleTree('SHA-256');
            const chunks = [
                new Uint8Array([1, 2, 3, 4]),
                new Uint8Array([5, 6, 7, 8]),
                new Uint8Array([9, 10, 11, 12]),
                new Uint8Array([13, 14, 15, 16]),
            ];

            for (const chunk of chunks) {
                await tree.addLeaf(chunk);
            }

            const result = await tree.build();

            assert.equal(result.count, 4);
            assert.ok(result.root.length === 32); // SHA-256 produces 32 bytes
            assert.ok(result.hashes.length > 0);
        });

        it('should build a tree with odd number of leaves', async () => {
            const tree = new MerkleTree('SHA-256');
            const chunks = [
                new Uint8Array([1, 2, 3, 4]),
                new Uint8Array([5, 6, 7, 8]),
                new Uint8Array([9, 10, 11, 12]),
            ];

            for (const chunk of chunks) {
                await tree.addLeaf(chunk);
            }

            const result = await tree.build();

            assert.equal(result.count, 3);
            assert.ok(result.root.length === 32);
        });

        it('should add pre-computed leaf hashes', async () => {
            const tree = new MerkleTree('SHA-256');
            const preComputedHash = await Crypto.digest(new Uint8Array([1, 2, 3, 4]), 'SHA-256');

            tree.addLeafHash(preComputedHash);

            const result = await tree.build();
            assert.equal(result.count, 1);
            assert.deepEqual(result.root, preComputedHash);
        });

        it('should reject invalid hash lengths for addLeafHash', () => {
            const tree = new MerkleTree('SHA-256');
            const invalidHash = new Uint8Array([1, 2, 3]); // Too short

            assert.throws(() => tree.addLeafHash(invalidHash), /Invalid hash length/);
        });

        it('should throw when building empty tree', async () => {
            const tree = new MerkleTree('SHA-256');

            await assert.rejects(tree.build(), /Cannot build empty Merkle tree/);
        });

        it('should throw when adding leaves after build', async () => {
            const tree = new MerkleTree('SHA-256');
            await tree.addLeaf(new Uint8Array([1, 2, 3, 4]));
            await tree.build();

            await assert.rejects(tree.addLeaf(new Uint8Array([5, 6, 7, 8])), /Cannot add leaves after tree is built/);
        });

        it('should throw when building twice', async () => {
            const tree = new MerkleTree('SHA-256');
            await tree.addLeaf(new Uint8Array([1, 2, 3, 4]));
            await tree.build();

            await assert.rejects(tree.build(), /Tree already built/);
        });
    });

    describe('Proof Generation and Verification', () => {
        it('should generate and verify a proof for first leaf', async () => {
            const tree = new MerkleTree('SHA-256');
            const chunks = [
                new Uint8Array([1, 2, 3, 4]),
                new Uint8Array([5, 6, 7, 8]),
                new Uint8Array([9, 10, 11, 12]),
                new Uint8Array([13, 14, 15, 16]),
            ];

            for (const chunk of chunks) {
                await tree.addLeaf(chunk);
            }

            const result = await tree.build();
            const proof = await tree.getProof(0);
            const leafHash = await Crypto.digest(chunks[0], 'SHA-256');

            const isValid = await MerkleTree.verify(leafHash, 0, proof, result.root, 'SHA-256');
            assert.ok(isValid);
        });

        it('should generate and verify proofs for all leaves', async () => {
            const tree = new MerkleTree('SHA-256');
            const chunks = [
                new Uint8Array([1, 2, 3, 4]),
                new Uint8Array([5, 6, 7, 8]),
                new Uint8Array([9, 10, 11, 12]),
                new Uint8Array([13, 14, 15, 16]),
            ];

            for (const chunk of chunks) {
                await tree.addLeaf(chunk);
            }

            const result = await tree.build();

            for (let i = 0; i < chunks.length; i++) {
                const proof = await tree.getProof(i);
                const leafHash = await Crypto.digest(chunks[i], 'SHA-256');

                const isValid = await MerkleTree.verify(leafHash, i, proof, result.root, 'SHA-256');
                assert.ok(isValid, `Proof verification failed for leaf ${i}`);
            }
        });

        it('should reject tampered leaf hash', async () => {
            const tree = new MerkleTree('SHA-256');
            const chunks = [new Uint8Array([1, 2, 3, 4]), new Uint8Array([5, 6, 7, 8])];

            for (const chunk of chunks) {
                await tree.addLeaf(chunk);
            }

            const result = await tree.build();
            const proof = await tree.getProof(0);

            // Use wrong data for leaf hash
            const tamperedHash = await Crypto.digest(new Uint8Array([99, 99, 99, 99]), 'SHA-256');

            const isValid = await MerkleTree.verify(tamperedHash, 0, proof, result.root, 'SHA-256');
            assert.ok(!isValid);
        });

        it('should reject wrong leaf index', async () => {
            const tree = new MerkleTree('SHA-256');
            const chunks = [new Uint8Array([1, 2, 3, 4]), new Uint8Array([5, 6, 7, 8])];

            for (const chunk of chunks) {
                await tree.addLeaf(chunk);
            }

            const result = await tree.build();
            const proof = await tree.getProof(0);
            const leafHash = await Crypto.digest(chunks[0], 'SHA-256');

            // Wrong leaf index
            const isValid = await MerkleTree.verify(leafHash, 1, proof, result.root, 'SHA-256');
            assert.ok(!isValid);
        });

        it('should throw for invalid leaf index in getProof', async () => {
            const tree = new MerkleTree('SHA-256');
            await tree.addLeaf(new Uint8Array([1, 2, 3, 4]));
            await tree.build();

            await assert.rejects(tree.getProof(5), /Invalid leaf index/);
            await assert.rejects(tree.getProof(-1), /Invalid leaf index/);
        });

        it('should throw when getting proof before build', async () => {
            const tree = new MerkleTree('SHA-256');
            await tree.addLeaf(new Uint8Array([1, 2, 3, 4]));

            await assert.rejects(tree.getProof(0), /Tree must be built/);
        });
    });

    describe('Leaf Hash Verification', () => {
        it('should verify matching leaf hashes', async () => {
            const algorithm = 'SHA-256' as HashAlgorithm;
            const chunks = [new Uint8Array([1, 2, 3, 4]), new Uint8Array([5, 6, 7, 8])];

            const leafHashes = await Promise.all(chunks.map(c => Crypto.digest(c, algorithm)));
            const storedHashes = await Promise.all(chunks.map(c => Crypto.digest(c, algorithm)));

            const isValid = MerkleTree.verifyLeafHashes(leafHashes, storedHashes);
            assert.ok(isValid);
        });

        it('should reject mismatched leaf hashes', async () => {
            const algorithm = 'SHA-256' as HashAlgorithm;
            const chunks1 = [new Uint8Array([1, 2, 3, 4])];
            const chunks2 = [new Uint8Array([5, 6, 7, 8])];

            const leafHashes = await Promise.all(chunks1.map(c => Crypto.digest(c, algorithm)));
            const storedHashes = await Promise.all(chunks2.map(c => Crypto.digest(c, algorithm)));

            const isValid = MerkleTree.verifyLeafHashes(leafHashes, storedHashes);
            assert.ok(!isValid);
        });

        it('should reject different length arrays', async () => {
            const algorithm = 'SHA-256' as HashAlgorithm;
            const leafHashes = [await Crypto.digest(new Uint8Array([1, 2, 3, 4]), algorithm)];
            const storedHashes = [
                await Crypto.digest(new Uint8Array([1, 2, 3, 4]), algorithm),
                await Crypto.digest(new Uint8Array([5, 6, 7, 8]), algorithm),
            ];

            const isValid = MerkleTree.verifyLeafHashes(leafHashes, storedHashes);
            assert.ok(!isValid);
        });
    });

    describe('Tree Layout', () => {
        it('should compute correct layout for power of 2 leaves', () => {
            const layout = MerkleTree.toLayout(8);
            assert.deepEqual(layout, [8, 4, 2, 1]);
        });

        it('should compute correct layout for non-power of 2 leaves', () => {
            const layout = MerkleTree.toLayout(5);
            assert.deepEqual(layout, [5, 3, 2, 1]);
        });

        it('should compute correct layout for single leaf', () => {
            const layout = MerkleTree.toLayout(1);
            assert.deepEqual(layout, [1]);
        });
    });

    describe('Different Algorithms', () => {
        it('should work with SHA-384', async () => {
            const tree = new MerkleTree('SHA-384');
            await tree.addLeaf(new Uint8Array([1, 2, 3, 4]));

            const result = await tree.build();
            assert.equal(result.root.length, 48); // SHA-384 produces 48 bytes
        });

        it('should work with SHA-512', async () => {
            const tree = new MerkleTree('SHA-512');
            await tree.addLeaf(new Uint8Array([1, 2, 3, 4]));

            const result = await tree.build();
            assert.equal(result.root.length, 64); // SHA-512 produces 64 bytes
        });
    });

    describe('getLeafHashes', () => {
        it('should return a copy of leaf hashes', async () => {
            const tree = new MerkleTree('SHA-256');
            const chunks = [new Uint8Array([1, 2, 3, 4]), new Uint8Array([5, 6, 7, 8])];

            for (const chunk of chunks) {
                await tree.addLeaf(chunk);
            }

            const leafHashes = tree.getLeafHashes();
            assert.equal(leafHashes.length, 2);

            // Verify they're actual hashes of the chunks
            const expectedHash = await Crypto.digest(chunks[0], 'SHA-256');
            assert.deepEqual(leafHashes[0], expectedHash);
        });
    });
});
