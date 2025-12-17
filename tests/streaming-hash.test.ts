import { describe, expect, it } from 'bun:test';
import { Crypto } from '../src/crypto';

describe('Streaming Hash Verification', () => {
    it('should produce the same hash for streaming and buffer digest (SHA-256)', async () => {
        const size = 1024 * 1024 + 500; // 1MB + 500 bytes
        const buffer = new Uint8Array(size);
        // Fill with some data
        for (let i = 0; i < size; i++) {
            buffer[i] = i % 256;
        }

        // Standard digest
        const standardHash = await Crypto.digest(buffer, 'SHA-256');

        // Streaming digest
        const streaming = Crypto.streamingDigest('SHA-256');
        const chunkSize = 1024 * 100; // 100KB chunks
        let offset = 0;

        while (offset < size) {
            const end = Math.min(offset + chunkSize, size);
            const chunk = buffer.slice(offset, end);
            streaming.update(chunk);
            offset += chunkSize;
        }

        const streamingHash = await streaming.final();

        expect(streamingHash).toEqual(standardHash);
    });

    it('should produce the same hash for streaming and buffer digest (SHA-384)', async () => {
        const size = 5000;
        const buffer = new Uint8Array(size);
        for (let i = 0; i < size; i++) buffer[i] = (i * 2) % 256;

        const standardHash = await Crypto.digest(buffer, 'SHA-384');
        const streaming = Crypto.streamingDigest('SHA-384');
        streaming.update(buffer);
        const streamingHash = await streaming.final();

        expect(streamingHash).toEqual(standardHash);
    });

    it('should produce the same hash for streaming and buffer digest (SHA-512)', async () => {
        const size = 5000;
        const buffer = new Uint8Array(size);
        for (let i = 0; i < size; i++) buffer[i] = (i * 3) % 256;

        const standardHash = await Crypto.digest(buffer, 'SHA-512');
        const streaming = Crypto.streamingDigest('SHA-512');
        streaming.update(buffer);
        const streamingHash = await streaming.final();

        expect(streamingHash).toEqual(standardHash);
    });
    it('should calculate correct hash using calculateBlobHash', async () => {
        const size = 1024 * 1024;
        const buffer = new Uint8Array(size);
        for (let i = 0; i < size; i++) buffer[i] = i % 256;
        const blob = new Blob([buffer]);

        // Define an exclusion in the middle
        const exclusion = { start: 1000, length: 100 };

        // Standard manual calculation: concat parts before and after
        const part1 = buffer.subarray(0, 1000);
        const part2 = buffer.subarray(1100);
        const combined = new Uint8Array(part1.length + part2.length);
        combined.set(part1);
        combined.set(part2, part1.length);
        const expectedHash = await Crypto.digest(combined, 'SHA-256');

        const blobHash = await Crypto.calculateBlobHash(blob, 'SHA-256', [exclusion]);
        expect(blobHash).toEqual(expectedHash);
    });
});
