import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { X509Certificate } from '@peculiar/x509';
import { after } from 'mocha';
import { JPEG } from '../src/asset';
import { CoseAlgorithmIdentifier } from '../src/cose';
import { SuperBox } from '../src/jumbf';
import { DataHashAssertion, Manifest, ManifestStore, ValidationStatusCode } from '../src/manifest';
import { LocalTimestampProvider } from '../src/rfc3161';

// location of the image to sign
const sourceFile = 'tests/fixtures/trustnxt-icon.jpg';
// location of the signed image
const targetFile = 'tests/fixtures/trustnxt-icon-signed.jpg';

const testCertificates = [
    {
        name: 'ES256 sample certificate',
        certificateFile: 'tests/fixtures/sample_es256.pem',
        privateKeyFile: 'tests/fixtures/sample_es256.key',
        algorithm: CoseAlgorithmIdentifier.ES256,
    },
    {
        name: 'Ed25519 sample certificate',
        certificateFile: 'tests/fixtures/sample_ed25519.pem',
        privateKeyFile: 'tests/fixtures/sample_ed25519.key',
        algorithm: CoseAlgorithmIdentifier.Ed25519,
    },
];

describe('Functional Signing Tests', function () {
    this.timeout(5000);

    for (const certificate of testCertificates) {
        describe(`using ${certificate.name}`, function () {
            let manifest: Manifest | undefined;

            it('add a manifest to a JPEG test file', async function () {
                // load the certificate
                const x509Certificate = new X509Certificate(await fs.readFile(certificate.certificateFile));

                // load the private key
                const privateKeyData = await fs.readFile(certificate.privateKeyFile);
                const base64 = privateKeyData
                    .toString()
                    .replace(/-{5}(BEGIN|END) .*-{5}/gm, '')
                    .replace(/\s/gm, '');
                const privateKey = Buffer.from(base64, 'base64');

                // initialize a local timestamp provider using the same certificate
                const timestampProvider = new LocalTimestampProvider(x509Certificate, privateKey);

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
                    certificate: x509Certificate,
                    signingAlgorithm: certificate.algorithm,
                });

                // create a data hash assertion
                const dataHashAssertion = DataHashAssertion.create('SHA-512');
                manifest.addAssertion(dataHashAssertion);

                // make space in the asset
                await asset.ensureManifestSpace(manifestStore.measureSize());

                // update the hard binding
                await dataHashAssertion.updateWithAsset(asset);

                // create the signature
                await manifest.sign(privateKey, timestampProvider);

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
                const superBox = SuperBox.fromBuffer(jumbf);

                // construct the manifest store from the JUMBF box
                const manifestStore = ManifestStore.read(superBox);

                // validate the asset against the store
                const validationResult = await manifestStore.validate(asset);

                // check individual codes
                assert.deepEqual(validationResult.statusEntries, [
                    {
                        code: ValidationStatusCode.TimeStampTrusted,
                        explanation: undefined,
                        url: `self#jumbf=/c2pa/${manifest.label}/c2pa.signature`,
                        success: true,
                    },
                    {
                        code: ValidationStatusCode.SigningCredentialTrusted,
                        explanation: undefined,
                        url: `self#jumbf=/c2pa/${manifest.label}/c2pa.signature`,
                        success: true,
                    },
                    {
                        code: ValidationStatusCode.ClaimSignatureValidated,
                        explanation: undefined,
                        url: `self#jumbf=/c2pa/${manifest.label}/c2pa.signature`,
                        success: true,
                    },
                    {
                        code: ValidationStatusCode.AssertionHashedURIMatch,
                        explanation: undefined,
                        url: 'self#jumbf=c2pa.assertions/c2pa.hash.data',
                        success: true,
                    },
                    {
                        code: ValidationStatusCode.AssertionDataHashMatch,
                        explanation: undefined,
                        url: `self#jumbf=/c2pa/${manifest.label}/c2pa.assertions/c2pa.hash.data`,
                        success: true,
                    },
                ]);

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
