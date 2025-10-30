import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MP3 } from '../src/asset';

const fixturesPath = 'tests/fixtures';
const getFixturePath = (fixture: string) => path.join(fixturesPath, fixture);

async function createAssetWithManifest(manifestData: Uint8Array): Promise<MP3> {
    const mp3Buffer = fs.readFileSync(getFixturePath('sample1.mp3'));
    const asset = new MP3(mp3Buffer);
    await asset.ensureManifestSpace(manifestData.length);
    await asset.writeManifestJUMBF(manifestData);
    return asset;
}

async function verifyManifestInNewInstance(asset: MP3, expectedManifest: Uint8Array | undefined): Promise<void> {
    const modifiedBuffer = await asset.getDataRange();
    const newAsset = new MP3(modifiedBuffer);
    const newRetrievedManifest = newAsset.getManifestJUMBF();
    assert.deepEqual(newRetrievedManifest, expectedManifest, 'manifest should match in new asset instance');
}

describe('MP3', function () {
    it('should identify a valid MP3 file', () => {
        const mp3Buffer = fs.readFileSync(getFixturePath('sample1.mp3'));
        assert.ok(MP3.canRead(mp3Buffer), 'canRead should be true for a valid MP3');

        const notMp3Buffer = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        assert.ok(!MP3.canRead(notMp3Buffer), 'canRead should be false for an invalid MP3');
    });

    it('should read an MP3 file without a manifest', () => {
        const mp3Buffer = fs.readFileSync(getFixturePath('sample1.mp3'));
        const asset = new MP3(mp3Buffer);
        assert.equal(asset.getManifestJUMBF(), undefined, 'should not have a manifest');
    });

    it('should add a manifest to an MP3 file', async () => {
        const manifestData = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));
        const asset = await createAssetWithManifest(manifestData);

        const retrievedManifest = asset.getManifestJUMBF();
        assert.deepEqual(retrievedManifest, manifestData, 'retrieved manifest should match the original');

        await verifyManifestInNewInstance(asset, manifestData);
    });

    it('should replace an existing manifest with a larger one', async () => {
        const initialManifest = new Uint8Array([1, 2, 3, 4, 5]);
        const asset = await createAssetWithManifest(initialManifest);
        assert.deepEqual(asset.getManifestJUMBF(), initialManifest);

        const newManifest = new Uint8Array([10, 20, 30, 40, 50, 60, 70]);
        await asset.ensureManifestSpace(newManifest.length);
        await asset.writeManifestJUMBF(newManifest);

        assert.deepEqual(asset.getManifestJUMBF(), newManifest, 'should have the new manifest');
        await verifyManifestInNewInstance(asset, newManifest);
    });

    it('should replace an existing manifest with a smaller one', async () => {
        const initialManifest = new Uint8Array([1, 2, 3, 4, 5, 6, 7]);
        const asset = await createAssetWithManifest(initialManifest);
        assert.deepEqual(asset.getManifestJUMBF(), initialManifest);

        const newManifest = new Uint8Array([10, 20, 30]);
        await asset.ensureManifestSpace(newManifest.length);
        await asset.writeManifestJUMBF(newManifest);

        assert.deepEqual(asset.getManifestJUMBF(), newManifest, 'should have the new manifest');
        await verifyManifestInNewInstance(asset, newManifest);
    });

    it('should remove a manifest from an MP3 file', async () => {
        const manifestData = new Uint8Array([1, 2, 3, 4, 5]);
        const asset = await createAssetWithManifest(manifestData);
        assert.ok(asset.getManifestJUMBF(), 'manifest should exist');

        await asset.ensureManifestSpace(0);
        await asset.writeManifestJUMBF(new Uint8Array(0));

        assert.equal(asset.getManifestJUMBF(), undefined, 'manifest should be removed');
        await verifyManifestInNewInstance(asset, undefined);
    });
});
