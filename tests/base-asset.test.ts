import { describe, expect, it } from 'bun:test';
import { BaseAsset } from '../src/asset/BaseAsset';
import { AssetSource } from '../src/asset/types';

class TestAsset extends BaseAsset {
    private constructor(source: AssetSource) {
        super(source);
    }

    public static async create(source: AssetSource): Promise<TestAsset> {
        const asset = new TestAsset(source);
        return asset;
    }
}

describe('BaseAsset (Blob)', () => {
    it('should be able to read data from a Blob', async () => {
        const text = 'Hello, world!';
        const blob = new Blob([text], { type: 'text/plain' });
        const asset = await TestAsset.create(blob);

        expect(asset.getDataLength()).toBe(text.length);

        const data = await asset.getDataRange();
        const decoded = new TextDecoder().decode(data);
        expect(decoded).toBe(text);
    });

    it('should be able to read a range of data', async () => {
        const text = '0123456789';
        const blob = new Blob([text], { type: 'text/plain' });
        const asset = await TestAsset.create(blob);

        const data = await asset.getDataRange(2, 5); // "23456"
        const decoded = new TextDecoder().decode(data);
        expect(decoded).toBe('23456');
    });

    it('should handle large offsets correctly', async () => {
        const text = '0123456789';
        const blob = new Blob([text], { type: 'text/plain' });
        const asset = await TestAsset.create(blob);

        const data = await asset.getDataRange(8, 5); // "89" (truncated)
        const decoded = new TextDecoder().decode(data);
        expect(decoded).toBe('89');
    });
});

describe('BaseAsset (Buffer)', () => {
    it('should be able to read data from a Buffer', async () => {
        const text = 'Hello, world!';
        const buffer = new TextEncoder().encode(text);
        const asset = await TestAsset.create(buffer);

        expect(asset.getDataLength()).toBe(text.length);

        const data = await asset.getDataRange();
        const decoded = new TextDecoder().decode(data);
        expect(decoded).toBe(text);
    });

    it('should be able to read a range of data from Buffer', async () => {
        const text = '0123456789';
        const buffer = new TextEncoder().encode(text);
        const asset = await TestAsset.create(buffer);

        const data = await asset.getDataRange(2, 5);
        const decoded = new TextDecoder().decode(data);
        expect(decoded).toBe('23456');
    });
});
