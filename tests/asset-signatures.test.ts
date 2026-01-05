import assert from 'node:assert/strict';
import { describe, it } from 'bun:test';
import { JPEG, MP3, PNG } from '../src/asset';

describe('Asset signatures', () => {
    it('JPEG.canRead detects JPEG signature', async () => {
        assert.equal(await JPEG.canRead(new Uint8Array([0xff, 0xd8, 0x00])), true);
        assert.equal(await JPEG.canRead(new Uint8Array([0xff, 0xd7])), false);
    });

    it('PNG.canRead detects PNG signature', async () => {
        assert.equal(await PNG.canRead(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])), true);
        assert.equal(await PNG.canRead(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00])), false);
    });

    it('MP3.canRead detects ID3 signature and frame sync', async () => {
        assert.equal(await MP3.canRead(new Uint8Array([0x49, 0x44, 0x33, 0x00])), true); // "ID3"
        assert.equal(await MP3.canRead(new Uint8Array([0xff, 0xfb, 0x00])), true); // frame sync
        assert.equal(await MP3.canRead(new Uint8Array([0x00, 0x01, 0x02])), false);
    });
});

describe('peek then load (Blob)', () => {
    it('JPEG.create does not fully load invalid Blob', async () => {
        const blob = new Blob([new Uint8Array([0x00, 0x00, 0x00, 0x00])]);
        await assert.rejects(() => JPEG.create(blob), /Not a JPEG file/);
    });

    it('PNG.create does not fully load invalid Blob', async () => {
        const blob = new Blob([new Uint8Array([0x00, 0x00, 0x00, 0x00])]);
        await assert.rejects(() => PNG.create(blob), /Not a PNG file/);
    });

    it('MP3.create does not fully load invalid Blob', async () => {
        const blob = new Blob([new Uint8Array([0x00, 0x00, 0x00, 0x00])]);
        await assert.rejects(() => MP3.create(blob), /Not a valid MP3 file/);
    });
});
