import { describe, expect, it } from 'bun:test';
import { BlobAsset } from '../src/asset/BlobAsset';

class TestBlobAsset extends BlobAsset {}

describe('BlobAsset', () => {
    it('should be able to read data from a Blob', async () => {
        const text = 'Hello, world!';
        const blob = new Blob([text], { type: 'text/plain' });
        const asset = new TestBlobAsset(blob);

        expect(asset.getDataLength()).toBe(text.length);
        expect(asset.mimeType).toContain('text/plain');

        const data = await asset.getDataRange();
        const decoded = new TextDecoder().decode(data);
        expect(decoded).toBe(text);
    });

    it('should be able to read a range of data', async () => {
        const text = '0123456789';
        const blob = new Blob([text], { type: 'text/plain' });
        const asset = new TestBlobAsset(blob);

        const data = await asset.getDataRange(2, 5); // "23456"
        const decoded = new TextDecoder().decode(data);
        expect(decoded).toBe('23456');
    });

    it('should handle large offsets correctly', async () => {
        const text = '0123456789';
        const blob = new Blob([text], { type: 'text/plain' });
        const asset = new TestBlobAsset(blob);

        const data = await asset.getDataRange(8, 5); // "89" (truncated)
        const decoded = new TextDecoder().decode(data);
        expect(decoded).toBe('89');
    });
});
