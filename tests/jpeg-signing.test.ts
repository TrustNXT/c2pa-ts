import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { after } from 'mocha';
import { JPEG } from '../src/asset';
import { SuperBox } from '../src/jumbf';
import { DataHashAssertion, Manifest, ManifestStore } from '../src/manifest';
import { getExpectedValidationStatusEntries, loadTestCertificate, TEST_CERTIFICATES } from './utils/testCertificates';

// location of the image to sign
const sourceFile = 'tests/fixtures/trustnxt-icon.jpg';
// location of the signed image
const targetFile = 'tests/fixtures/trustnxt-icon-signed.jpg';

describe('Functional Signing Tests', function () {
    this.timeout(5000);

    for (const certificate of TEST_CERTIFICATES) {
        describe(`using ${certificate.name}`, function () {
            let manifest: Manifest | undefined;

            it('add a manifest to a JPEG test file', async function () {
                const { signer, timestampProvider } = await loadTestCertificate(certificate);

                // load the file into a buffer
                const buf = await fs.readFile(sourceFile);
                assert.ok(buf);

                // ensure it's a JPEG
                assert.ok(JPEG.canRead(buf));

                // construct the asset
                const asset = new JPEG(buf);

                // create a new manifest store and append a new manifest
                const manifestStore = new ManifestStore();
                manifest = manifestStore.createManifest({
                    assetFormat: 'image/jpeg',
                    instanceID: 'xyzxyz',
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
                await fs.writeFile(targetFile, await asset.getDataRange());
            });

            it('read and verify the JPEG with manifest', async function () {
                if (!manifest) this.skip();

                // load the file into a buffer
                const buf = await fs.readFile(targetFile).catch(() => undefined);
                if (!buf) this.skip();

                // ensure it's a JPEG
                assert.ok(JPEG.canRead(buf));

                // construct the asset
                const asset = new JPEG(buf);

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
        await fs.unlink(targetFile).catch(() => undefined);
    });
});
