/**
 * Merkle Tree Tests with Real MP4 Files
 *
 * These tests validate Merkle tree signing and verification
 * using actual MP4 video files rather than synthetic data.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'bun:test';
import { BMFF } from '../../src/asset';
import { Crypto, MerkleTree, StreamingBMFFSigner } from '../../src/crypto';
import { BMFFHashAssertion } from '../../src/manifest';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');
const TEST_VIDEO_PATH = path.join(FIXTURES_DIR, 'test-video.mp4');

describe('Merkle Tree with MP4 Files', () => {
    describe('StreamingBMFFSigner with MP4', () => {
        it('should stream-sign MP4 mdat content', async () => {
            const mp4Data = new Uint8Array(await fs.readFile(TEST_VIDEO_PATH));
            const asset = await BMFF.create(mp4Data);

            // Get the mdat box
            const mdatBox = asset.getBoxByPath('/mdat');
            assert.ok(mdatBox, 'MP4 should have mdat box');

            // Get mdat content (excluding header)
            const mdatHeaderSize = 8;
            const mdatContent = await asset.getDataRange(
                mdatBox.offset + mdatHeaderSize,
                mdatBox.size - mdatHeaderSize,
            );

            // Use streaming signer
            const signer = new StreamingBMFFSigner({
                algorithm: 'SHA-256',
                chunkSize: 128, // Small chunks for small test file
            });

            await signer.processMdatContent(mdatContent);
            const result = await signer.finalize();

            assert.ok(result.count > 0, 'Should have processed chunks');
            assert.equal(result.hashes.length, result.count, 'Hash count should match chunk count');
            assert.equal(result.fixedBlockSize, 128, 'Block size should be as configured');
        });

        it('should integrate streaming signer with BMFFHashAssertion', async () => {
            const mp4Data = new Uint8Array(await fs.readFile(TEST_VIDEO_PATH));
            const asset = await BMFF.create(mp4Data);

            // Get the mdat box
            const mdatBox = asset.getBoxByPath('/mdat');
            assert.ok(mdatBox, 'MP4 should have mdat box');

            const mdatHeaderSize = 8;
            const mdatContent = await asset.getDataRange(
                mdatBox.offset + mdatHeaderSize,
                mdatBox.size - mdatHeaderSize,
            );

            // Use streaming signer
            const signer = new StreamingBMFFSigner({
                algorithm: 'SHA-256',
                chunkSize: 128,
                uniqueId: 1,
                localId: 1,
            });

            await signer.processMdatContent(mdatContent);
            const signerResult = await signer.finalize();

            // Create assertion and set Merkle data from signer
            const assertion = BMFFHashAssertion.createV3('jumbf manifest', 'SHA-256');
            assertion.setMerkleFromStreamingSigner(signerResult);

            assert.ok(assertion.merkle !== undefined);
            assert.equal(assertion.merkle.length, 1);
            assert.equal(assertion.merkle[0].uniqueId, 1);
            assert.equal(assertion.merkle[0].localId, 1);
            assert.equal(assertion.merkle[0].count, signerResult.count);
        });
    });

    describe('Merkle Proof Verification with MP4 Data', () => {
        it('should generate and verify proofs for MP4 mdat chunks', async () => {
            const mp4Data = new Uint8Array(await fs.readFile(TEST_VIDEO_PATH));
            const asset = await BMFF.create(mp4Data);

            // Get mdat content
            const mdatBox = asset.getBoxByPath('/mdat');
            assert.ok(mdatBox, 'MP4 should have mdat box');

            const mdatHeaderSize = 8;
            const mdatContent = await asset.getDataRange(
                mdatBox.offset + mdatHeaderSize,
                mdatBox.size - mdatHeaderSize,
            );

            // Split into chunks and build Merkle tree
            const chunkSize = 64;
            const chunks: Uint8Array[] = [];
            for (let offset = 0; offset < mdatContent.length; offset += chunkSize) {
                const end = Math.min(offset + chunkSize, mdatContent.length);
                chunks.push(mdatContent.slice(offset, end));
            }

            // Build tree
            const tree = new MerkleTree('SHA-256');
            for (const chunk of chunks) {
                await tree.addLeaf(chunk);
            }
            const treeResult = await tree.build();

            // Verify each chunk with its proof
            for (let i = 0; i < Math.min(chunks.length, 5); i++) {
                // Limit to 5 for performance
                const proof = await tree.getProof(i);
                const leafHash = await Crypto.digest(chunks[i], 'SHA-256');

                const isValid = await MerkleTree.verify(leafHash, i, proof, treeResult.root, 'SHA-256');
                assert.ok(isValid, `Proof should be valid for chunk ${i}`);
            }
        });

        it('should detect tampering in MP4 mdat chunk', async () => {
            const mp4Data = new Uint8Array(await fs.readFile(TEST_VIDEO_PATH));
            const asset = await BMFF.create(mp4Data);

            // Get mdat content
            const mdatBox = asset.getBoxByPath('/mdat');
            assert.ok(mdatBox, 'MP4 should have mdat box');

            const mdatHeaderSize = 8;
            const mdatContent = await asset.getDataRange(
                mdatBox.offset + mdatHeaderSize,
                mdatBox.size - mdatHeaderSize,
            );

            // Split into chunks
            const chunkSize = 64;
            const chunks: Uint8Array[] = [];
            for (let offset = 0; offset < mdatContent.length; offset += chunkSize) {
                const end = Math.min(offset + chunkSize, mdatContent.length);
                chunks.push(mdatContent.slice(offset, end));
            }

            // Build tree
            const tree = new MerkleTree('SHA-256');
            for (const chunk of chunks) {
                await tree.addLeaf(chunk);
            }
            const treeResult = await tree.build();

            // Get proof for first chunk
            const proof = await tree.getProof(0);

            // Try to verify with tampered data
            const tamperedChunk = new Uint8Array(chunks[0].length);
            tamperedChunk.fill(0xff); // All ones
            const tamperedHash = await Crypto.digest(tamperedChunk, 'SHA-256');

            const isValid = await MerkleTree.verify(tamperedHash, 0, proof, treeResult.root, 'SHA-256');
            assert.ok(!isValid, 'Tampered data should fail verification');
        });
    });

    describe('Variable Block Sizes with MP4', () => {
        it('should support variable block sizes in streaming signer', async () => {
            const mp4Data = new Uint8Array(await fs.readFile(TEST_VIDEO_PATH));
            const asset = await BMFF.create(mp4Data);

            const mdatBox = asset.getBoxByPath('/mdat');
            assert.ok(mdatBox, 'MP4 should have mdat box');

            const mdatHeaderSize = 8;
            const mdatContentLength = mdatBox.size - mdatHeaderSize;

            // Use variable chunk sizes
            const signer = new StreamingBMFFSigner({
                algorithm: 'SHA-256',
                variableChunkSizes: true,
            });

            // Process in varying chunk sizes
            const chunkSizes = [100, 200, 150, mdatContentLength - 450]; // Remaining
            let offset = mdatBox.offset + mdatHeaderSize;

            for (const size of chunkSizes) {
                if (offset >= mdatBox.offset + mdatBox.size) break;
                const actualSize = Math.min(size, mdatBox.offset + mdatBox.size - offset);
                const chunk = await asset.getDataRange(offset, actualSize);
                await signer.processChunk(chunk);
                offset += actualSize;
            }

            const result = await signer.finalize();

            assert.ok(result.variableBlockSizes !== undefined, 'Should have variable block sizes');
            assert.ok(result.fixedBlockSize === undefined, 'Should not have fixed block size');
            assert.equal(result.count, result.variableBlockSizes.length, 'Count should match variable sizes count');
        });
    });
});
