import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MP3 } from '../src/asset';

// Helper to get fixture paths
const fixturesPath = 'tests/fixtures';
const getFixturePath = (fixture: string) => path.join(fixturesPath, fixture);

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
        const mp3Buffer = fs.readFileSync(getFixturePath('sample1.mp3'));
        const asset = new MP3(mp3Buffer);

        const manifestData = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));

        await asset.ensureManifestSpace(manifestData.length);
        await asset.writeManifestJUMBF(manifestData);

        const retrievedManifest = asset.getManifestJUMBF();
        assert.deepEqual(retrievedManifest, manifestData, 'retrieved manifest should match the original');

        // Verify that the modified asset is still a valid MP3 and contains the manifest
        const modifiedBuffer = await asset.getDataRange();
        const newAsset = new MP3(modifiedBuffer);
        const newRetrievedManifest = newAsset.getManifestJUMBF();
        assert.deepEqual(newRetrievedManifest, manifestData, 'manifest should be present in new asset instance');
    });

    it('should replace an existing manifest with a larger one', async () => {
        const mp3Buffer = fs.readFileSync(getFixturePath('sample1.mp3'));
        let asset = new MP3(mp3Buffer);

        const initialManifest = new Uint8Array([1, 2, 3, 4, 5]);
        await asset.ensureManifestSpace(initialManifest.length);
        await asset.writeManifestJUMBF(initialManifest);

        assert.deepEqual(asset.getManifestJUMBF(), initialManifest);

        const newManifest = new Uint8Array([10, 20, 30, 40, 50, 60, 70]);
        await asset.ensureManifestSpace(newManifest.length);
        await asset.writeManifestJUMBF(newManifest);

        assert.deepEqual(asset.getManifestJUMBF(), newManifest, 'should have the new manifest');

        // Verify in a new instance
        const modifiedBuffer = await asset.getDataRange();
        asset = new MP3(modifiedBuffer);
        assert.deepEqual(asset.getManifestJUMBF(), newManifest, 'new instance should have the new manifest');
    });

    it('should replace an existing manifest with a smaller one', async () => {
        const mp3Buffer = fs.readFileSync(getFixturePath('sample1.mp3'));
        let asset = new MP3(mp3Buffer);

        const initialManifest = new Uint8Array([1, 2, 3, 4, 5, 6, 7]);
        await asset.ensureManifestSpace(initialManifest.length);
        await asset.writeManifestJUMBF(initialManifest);

        assert.deepEqual(asset.getManifestJUMBF(), initialManifest);

        const newManifest = new Uint8Array([10, 20, 30]);
        await asset.ensureManifestSpace(newManifest.length);
        await asset.writeManifestJUMBF(newManifest);

        assert.deepEqual(asset.getManifestJUMBF(), newManifest, 'should have the new manifest');

        // Verify in a new instance
        const modifiedBuffer = await asset.getDataRange();
        asset = new MP3(modifiedBuffer);
        assert.deepEqual(asset.getManifestJUMBF(), newManifest, 'new instance should have the new manifest');
    });

    it('should remove a manifest from an MP3 file', async () => {
        const mp3Buffer = fs.readFileSync(getFixturePath('sample1.mp3'));
        let asset = new MP3(mp3Buffer);

        const manifestData = new Uint8Array([1, 2, 3, 4, 5]);
        await asset.ensureManifestSpace(manifestData.length);
        await asset.writeManifestJUMBF(manifestData);

        assert.ok(asset.getManifestJUMBF(), 'manifest should exist');

        await asset.ensureManifestSpace(0);
        // After ensureManifestSpace(0), the manifest should be gone.
        // The write is not strictly necessary but let's do it for completeness.
        await asset.writeManifestJUMBF(new Uint8Array(0));

        assert.equal(asset.getManifestJUMBF(), undefined, 'manifest should be removed');

        // Verify in a new instance
        const modifiedBuffer = await asset.getDataRange();
        asset = new MP3(modifiedBuffer);
        assert.equal(asset.getManifestJUMBF(), undefined, 'new instance should not have a manifest');
    });
});
