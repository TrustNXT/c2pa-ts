import assert from 'node:assert/strict';
import { describe, it } from 'bun:test';
import { Crypto, DEFAULT_CHUNK_SIZE, StreamingBMFFSigner } from '../../src/crypto';

describe('StreamingBMFFSigner', () => {
    describe('Construction', () => {
        it('should create with default options', () => {
            const signer = new StreamingBMFFSigner();

            assert.equal(signer.getAlgorithm(), 'SHA-256');
            assert.equal(signer.getChunkCount(), 0);
            assert.equal(signer.getTotalBytesProcessed(), 0);
        });

        it('should create with custom options', () => {
            const signer = new StreamingBMFFSigner({
                algorithm: 'SHA-384',
                chunkSize: 512 * 1024,
                uniqueId: 42,
                localId: 7,
            });

            assert.equal(signer.getAlgorithm(), 'SHA-384');
        });
    });

    describe('Fixed Chunk Size Processing', () => {
        it('should buffer data until chunk size is reached', async () => {
            const signer = new StreamingBMFFSigner({ chunkSize: 100 });

            // Add data smaller than chunk size
            await signer.processChunk(new Uint8Array(50));
            assert.equal(signer.getChunkCount(), 0); // Not yet a full chunk

            // Add more data to exceed chunk size
            await signer.processChunk(new Uint8Array(60));
            assert.equal(signer.getChunkCount(), 1); // Now we have 1 full chunk
            assert.equal(signer.getTotalBytesProcessed(), 110);
        });

        it('should process multiple chunks correctly', async () => {
            const signer = new StreamingBMFFSigner({ chunkSize: 100 });

            // Add exactly 3 chunks worth of data
            await signer.processChunk(new Uint8Array(300));

            assert.equal(signer.getChunkCount(), 3);
            assert.equal(signer.getTotalBytesProcessed(), 300);
        });

        it('should handle remaining data on finalize', async () => {
            const signer = new StreamingBMFFSigner({ chunkSize: 100 });

            await signer.processChunk(new Uint8Array(250));
            assert.equal(signer.getChunkCount(), 2); // 2 full chunks, 50 remaining

            const result = await signer.finalize();

            assert.equal(result.count, 3); // Should now include the remaining 50 bytes
            assert.equal(result.fixedBlockSize, 100);
            assert.ok(result.variableBlockSizes === undefined);
        });

        it('should produce correct hashes for known data', async () => {
            const signer = new StreamingBMFFSigner({ chunkSize: 4 });

            // Two 4-byte chunks
            const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
            await signer.processChunk(data);

            const result = await signer.finalize();

            assert.equal(result.count, 2);
            assert.equal(result.hashes.length, 2);

            // Verify the hashes match expected values
            const expectedHash1 = await Crypto.digest(new Uint8Array([1, 2, 3, 4]), 'SHA-256');
            const expectedHash2 = await Crypto.digest(new Uint8Array([5, 6, 7, 8]), 'SHA-256');

            assert.deepEqual(result.hashes[0], expectedHash1);
            assert.deepEqual(result.hashes[1], expectedHash2);
        });
    });

    describe('Variable Chunk Size Processing', () => {
        it('should treat each processChunk call as a separate leaf', async () => {
            const signer = new StreamingBMFFSigner({ variableChunkSizes: true });

            await signer.processChunk(new Uint8Array(50));
            await signer.processChunk(new Uint8Array(100));
            await signer.processChunk(new Uint8Array(75));

            const result = await signer.finalize();

            assert.equal(result.count, 3);
            assert.ok(result.variableBlockSizes !== undefined);
            assert.deepEqual(result.variableBlockSizes, [50, 100, 75]);
            assert.ok(result.fixedBlockSize === undefined);
        });
    });

    describe('Initialization Segment', () => {
        it('should capture init segment hash separately', async () => {
            const signer = new StreamingBMFFSigner({ chunkSize: 100 });

            // Start init segment
            signer.startInitSegment();
            await signer.processChunk(new Uint8Array([1, 2, 3, 4]));
            await signer.processChunk(new Uint8Array([5, 6, 7, 8]));
            await signer.endInitSegment();

            // Process mdat content
            await signer.processChunk(new Uint8Array(100));

            const result = await signer.finalize();

            assert.ok(result.initHash !== undefined);
            assert.equal(result.initHash.length, 32); // SHA-256
            assert.equal(result.count, 1); // Only mdat content should be in chunks
        });

        it('should throw when ending init segment without starting', async () => {
            const signer = new StreamingBMFFSigner();

            await assert.rejects(signer.endInitSegment(), /Not capturing init segment/);
        });
    });

    describe('Finalization', () => {
        it('should include all required fields in result', async () => {
            const signer = new StreamingBMFFSigner({
                algorithm: 'SHA-256',
                chunkSize: DEFAULT_CHUNK_SIZE,
                uniqueId: 123,
                localId: 456,
            });

            await signer.processChunk(new Uint8Array(100));
            const result = await signer.finalize();

            assert.equal(result.uniqueId, 123);
            assert.equal(result.localId, 456);
            assert.equal(result.count, 1);
            assert.ok(result.hashes.length === 1);
            assert.equal(result.fixedBlockSize, DEFAULT_CHUNK_SIZE);
            // SHA-256 is default, so alg should not be set
            assert.ok(result.alg === undefined);
        });

        it('should include algorithm for non-default hash', async () => {
            const signer = new StreamingBMFFSigner({ algorithm: 'SHA-384' });

            await signer.processChunk(new Uint8Array(100));
            const result = await signer.finalize();

            assert.equal(result.alg, 'sha384');
        });

        it('should throw when processing after finalize', async () => {
            const signer = new StreamingBMFFSigner();

            await signer.processChunk(new Uint8Array(100));
            await signer.finalize();

            await assert.rejects(signer.processChunk(new Uint8Array(100)), /already finalized/);
        });

        it('should throw when finalizing twice', async () => {
            const signer = new StreamingBMFFSigner();

            await signer.processChunk(new Uint8Array(100));
            await signer.finalize();

            await assert.rejects(signer.finalize(), /already finalized/);
        });
    });

    describe('processMdatContent', () => {
        it('should process entire mdat content in fixed chunk mode', async () => {
            const signer = new StreamingBMFFSigner({ chunkSize: 100 });

            const mdatContent = new Uint8Array(350);
            await signer.processMdatContent(mdatContent);

            const result = await signer.finalize();

            assert.equal(result.count, 4); // 3 full chunks + 1 partial
        });

        it('should process entire mdat content in variable chunk mode', async () => {
            const signer = new StreamingBMFFSigner({ variableChunkSizes: true });

            const mdatContent = new Uint8Array(350);
            await signer.processMdatContent(mdatContent);

            const result = await signer.finalize();

            assert.equal(result.count, 1); // One big chunk
            assert.deepEqual(result.variableBlockSizes, [350]);
        });
    });

    describe('Reset', () => {
        it('should reset all state for reuse', async () => {
            const signer = new StreamingBMFFSigner({ chunkSize: 100 });

            await signer.processChunk(new Uint8Array(100));
            await signer.finalize();

            signer.reset();

            // Should be able to use again
            assert.equal(signer.getChunkCount(), 0);
            assert.equal(signer.getTotalBytesProcessed(), 0);

            await signer.processChunk(new Uint8Array(100));
            const result = await signer.finalize();

            assert.equal(result.count, 1);
        });
    });
});
