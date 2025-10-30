import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { MP3 } from '../src/asset';
import { SuperBox } from '../src/jumbf';
import { DataHashAssertion, Manifest, ManifestStore } from '../src/manifest';
import { getExpectedValidationStatusEntries, loadTestCertificate, TEST_CERTIFICATES } from './utils/testCertificates';

const sourceFile = 'tests/fixtures/sample1.mp3';
const targetFile = 'tests/fixtures/sample1-signed.mp3';
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

describe('MP3 Signing Tests', function () {
    this.timeout(5000);

    for (const certificate of TEST_CERTIFICATES) {
        describe(`using ${certificate.name}`, function () {
            let manifest: Manifest | undefined;

            it('add a manifest to an MP3 test file', async function () {
                const { signer, timestampProvider } = await loadTestCertificate(certificate);

                // load the file into a buffer
                const buf = await fsPromises.readFile(sourceFile);
                assert.ok(buf);

                // ensure it's an MP3
                assert.ok(MP3.canRead(buf));

                // construct the asset
                const asset = new MP3(buf);

                // create a new manifest store and append a new manifest
                const manifestStore = new ManifestStore();
                manifest = manifestStore.createManifest({
                    assetFormat: 'audio/mpeg',
                    instanceID: 'mp3-test-123',
                    defaultHashAlgorithm: 'SHA-256',
                    signer,
                });

                // create a data hash assertion
                const dataHashAssertion = DataHashAssertion.create('SHA-512');
                manifest.addAssertion(dataHashAssertion);

                // make space in the asset
                await asset.ensureManifestSpace(manifestStore.measureSize());

                // update the hard binding
                await dataHashAssertion.updateWithAsset(asset);

                // create the signature
                await manifest.sign(signer, timestampProvider);

                // write the JUMBF box to the asset
                await asset.writeManifestJUMBF(manifestStore.getBytes());

                // write the asset to the target file
                await fsPromises.writeFile(targetFile, await asset.getDataRange());
            });

            it('read and verify the MP3 with manifest', async function () {
                if (!manifest) this.skip();

                // load the file into a buffer
                const buf = await fsPromises.readFile(targetFile).catch(() => undefined);
                if (!buf) this.skip();

                // ensure it's an MP3
                assert.ok(MP3.canRead(buf));

                // construct the asset
                const asset = new MP3(buf);

                // extract the C2PA manifest store in binary JUMBF format
                const jumbf = asset.getManifestJUMBF();
                assert.ok(jumbf, 'no JUMBF found');

                // deserialize the JUMBF box structure
                const superBox = SuperBox.fromBuffer(jumbf as Uint8Array<ArrayBuffer>);

                // construct the manifest store from the JUMBF box
                const manifestStore = ManifestStore.read(superBox);

                // validate the asset against the store
                const validationResult = await manifestStore.validate(asset);

                // check individual codes
                assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntries(manifest.label));

                // check overall validity
                assert.ok(validationResult.isValid, 'Validation result invalid');
            });
        });
    }

    after(async function () {
        // delete test file, ignore the case it doesn't exist
        await fsPromises.unlink(targetFile).catch(() => undefined);
    });
});
