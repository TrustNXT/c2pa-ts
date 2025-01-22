import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { X509Certificate } from '@peculiar/x509';
import { BMFF } from '../src/asset';
import { CoseAlgorithmIdentifier } from '../src/cose';
import { BMFFHashAssertion, Manifest, ManifestStore } from '../src/manifest';
import { LocalTimestampProvider } from '../src/rfc3161';

const sourceFile = 'tests/fixtures/trustnxt-icon.heic';
const targetFile = 'tests/fixtures/trustnxt-icon-signed.heic';

describe('BMFF Signing Tests', function () {
    this.timeout(5000);

    let manifest: Manifest | undefined;

    it('add a manifest to a BMFF test file', async function () {
        // load the certificate
        const x509Certificate = new X509Certificate(await fs.readFile('tests/fixtures/sample_es256.pem'));

        // load and parse the private key
        const privateKeyData = await fs.readFile('tests/fixtures/sample_es256.key');
        const base64 = privateKeyData
            .toString()
            .replace(/-{5}(BEGIN|END) .*-{5}/gm, '') // Remove PEM headers
            .replace(/\s/gm, ''); // Remove whitespace
        const privateKey = Buffer.from(base64, 'base64');

        const timestampProvider = new LocalTimestampProvider(x509Certificate, privateKey);

        // load and verify the file
        const buf = await fs.readFile(sourceFile);
        assert.ok(BMFF.canRead(buf));
        const asset = new BMFF(buf);

        // create manifest store and manifest
        const manifestStore = new ManifestStore();
        manifest = manifestStore.createManifest({
            assetFormat: 'image/heic',
            instanceID: 'xyzxyz',
            defaultHashAlgorithm: 'SHA-256',
            certificate: x509Certificate,
            signingAlgorithm: CoseAlgorithmIdentifier.ES256,
        });

        // create hash assertion
        const bmffHashAssertion = BMFFHashAssertion.create('SHA-256');
        manifest.addAssertion(bmffHashAssertion);

        // make space in the asset
        await asset.ensureManifestSpace(manifestStore.measureSize());

        // update the hard binding
        await bmffHashAssertion.updateWithAsset(asset);

        // create the signature
        await manifest.sign(privateKey, timestampProvider);

        // write the JUMBF box to the asset
        await asset.writeManifestJUMBF(manifestStore.getBytes());

        // write the asset to the target file
        await fs.writeFile(targetFile, await asset.getDataRange());
    });

    after(async function () {
        // delete test file, ignore if it doesn't exist
        await fs.unlink(targetFile).catch(() => undefined);
    });
});
