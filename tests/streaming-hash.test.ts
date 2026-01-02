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
});
