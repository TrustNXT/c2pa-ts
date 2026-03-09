import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { describe, it } from 'bun:test';
import { BMFF, createAsset, JPEG, MP3, PNG } from '../src/asset';

const baseDir = 'tests/fixtures';

describe('createAsset', () => {
    it('returns a JPEG asset for a JPEG file', async () => {
        const buf = await fs.readFile(`${baseDir}/trustnxt-icon.jpg`);
        const asset = await createAsset(new Uint8Array(buf));
        assert.ok(asset instanceof JPEG);
        assert.equal(asset.mimeType, 'image/jpeg');
    });

    it('returns a PNG asset for a PNG file', async () => {
        const buf = await fs.readFile(`${baseDir}/trustnxt-icon.png`);
        const asset = await createAsset(new Uint8Array(buf));
        assert.ok(asset instanceof PNG);
        assert.equal(asset.mimeType, 'image/png');
    });

    it('returns a BMFF asset for a HEIC file', async () => {
        const buf = await fs.readFile(`${baseDir}/trustnxt-icon.heic`);
        const asset = await createAsset(new Uint8Array(buf));
        assert.ok(asset instanceof BMFF);
        assert.equal(asset.mimeType, 'image/heic');
    });

    it('returns an MP3 asset for an MP3 file', async () => {
        const buf = await fs.readFile(`${baseDir}/sample1.mp3`);
        const asset = await createAsset(new Uint8Array(buf));
        assert.ok(asset instanceof MP3);
        assert.equal(asset.mimeType, 'audio/mpeg');
    });

    it('returns a JPEG asset when source is a Blob', async () => {
        const buf = await fs.readFile(`${baseDir}/trustnxt-icon.jpg`);
        const blob = new Blob([buf]);
        const asset = await createAsset(blob);
        assert.ok(asset instanceof JPEG);
    });

    it('throws for an unrecognised source', async () => {
        const unknown = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
        await assert.rejects(() => createAsset(unknown), /Unsupported asset type/);
    });
});
