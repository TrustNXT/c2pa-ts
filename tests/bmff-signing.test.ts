import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { afterAll, describe, it } from 'bun:test';
import { BMFF } from '../src/asset';
import { CoseAlgorithmIdentifier } from '../src/cose';
import { SuperBox } from '../src/jumbf';
import { BMFFHashAssertion, Manifest, ManifestStore, ValidationStatusCode } from '../src/manifest';
import { loadTestCertificate } from './utils/testCertificates';

const sourceFile = 'tests/fixtures/trustnxt-icon.heic';
const targetFileV2 = 'tests/fixtures/trustnxt-icon-signed-v2-test.heic';
const targetFileV3 = 'tests/fixtures/trustnxt-icon-signed-v3-test.heic';

describe('BMFF Signing Tests', function () {
    let manifestV2: Manifest | undefined;
    let manifestV3: Manifest | undefined;

    async function signAndVerify(version: 2 | 3) {
        const targetFile = version === 2 ? targetFileV2 : targetFileV3;

        const { signer, timestampProvider } = await loadTestCertificate({
            name: 'ES256 sample certificate',
            certificateFile: 'tests/fixtures/sample_es256.pem',
            privateKeyFile: 'tests/fixtures/sample_es256.key',
            algorithm: CoseAlgorithmIdentifier.ES256,
        });

        // load and verify the file
        const buf = await fs.readFile(sourceFile);
        assert.ok(BMFF.canRead(buf));
        const asset = new BMFF(buf);

        // create manifest store and manifest
        const manifestStore = new ManifestStore();
        const manifest = manifestStore.createManifest({
            assetFormat: 'image/heic',
            instanceID: 'xyzxyz',
            defaultHashAlgorithm: 'SHA-256',
            signer,
        });

        // create hash assertion with appropriate version
        const bmffHashAssertion =
            version === 2 ?
                BMFFHashAssertion.createV2('jumbf manifest', 'SHA-256')
            :   BMFFHashAssertion.createV3('jumbf manifest', 'SHA-256');
        manifest.addAssertion(bmffHashAssertion);

        // make space in the asset
        await asset.ensureManifestSpace(manifestStore.measureSize());

        // update the hard binding
        await bmffHashAssertion.updateWithAsset(asset);

        // create the signature
        await manifest.sign(signer, timestampProvider);

        // write the JUMBF box to the asset
        await asset.writeManifestJUMBF(manifestStore.getBytes());

        // write the asset to the target file
        await fs.writeFile(targetFile, await asset.getDataRange());

        return { manifest, asset: new BMFF(await fs.readFile(targetFile)) };
    }

    it('add a v2 manifest to a BMFF test file', async function () {
        const result = await signAndVerify(2);
        manifestV2 = result.manifest;
    });

    it('add a v3 manifest to a BMFF test file', async function () {
        const result = await signAndVerify(3);
        manifestV3 = result.manifest;
    });

    it('read and verify the BMFF with v2 manifest', async function () {
        if (!manifestV2) return;

        const buf = await fs.readFile(targetFileV2);
        const asset = new BMFF(buf);

        const jumbf = asset.getManifestJUMBF();
        assert.ok(jumbf, 'no JUMBF found');

        const superBox = SuperBox.fromBuffer(jumbf);
        const manifestStore = ManifestStore.read(superBox);
        const validationResult = await manifestStore.validate(asset);

        assert.ok(validationResult.isValid, 'Validation result invalid');
        assert.ok(
            validationResult.statusEntries.some(
                entry => entry.code === ValidationStatusCode.AssertionBMFFHashMatch && entry.success,
            ),
            'BMFF hash validation failed',
        );
    });

    it('read and verify the BMFF with v3 manifest', async function () {
        if (!manifestV3) return;

        const buf = await fs.readFile(targetFileV3);
        const asset = new BMFF(buf);

        const jumbf = asset.getManifestJUMBF();
        assert.ok(jumbf, 'no JUMBF found');

        const superBox = SuperBox.fromBuffer(jumbf);
        const manifestStore = ManifestStore.read(superBox);
        const validationResult = await manifestStore.validate(asset);

        assert.ok(validationResult.isValid, 'Validation result invalid');
        assert.ok(
            validationResult.statusEntries.some(
                entry => entry.code === ValidationStatusCode.AssertionBMFFHashMatch && entry.success,
            ),
            'BMFF hash validation failed',
        );
    });

    afterAll(async function () {
        // delete test files, ignore if they don't exist
        await fs.unlink(targetFileV2).catch(() => undefined);
        await fs.unlink(targetFileV3).catch(() => undefined);
    });
});
