import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { X509Certificate } from '@peculiar/x509';
import { after } from 'mocha';
import * as bin from 'typed-binary';
import { JPEG } from '../src/asset';
import { CoseAlgorithmIdentifier } from '../src/cose';
import { SuperBox } from '../src/jumbf';
import {
    AssertionStore,
    Claim,
    ClaimVersion,
    DataHashAssertion,
    Manifest,
    ManifestStore,
    Signature,
    ValidationStatusCode,
} from '../src/manifest';

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
    this.timeout(0);

    for (const certificate of testCertificates) {
        describe(`using ${certificate.name}`, function () {
            it('add a manifest to a JPEG test file', async function () {
                // load the file into a buffer
                const buf = await fs.readFile(sourceFile);
                assert.ok(buf);

                // ensure it's a JPEG
                assert.ok(JPEG.canRead(buf));

                // construct the asset
                const asset = new JPEG(buf);

                // create a data hash assertion
                const dataHashAssertion = DataHashAssertion.create('SHA-512');

                // create an empty signature
                const signature = Signature.createFromCertificate(
                    new X509Certificate(await fs.readFile(certificate.certificateFile)),
                    certificate.algorithm,
                );

                // create a claim and add the data hash assertion to it
                const claim = new Claim();
                claim.version = ClaimVersion.V1;
                claim.format = 'image/jpeg';
                claim.instanceID = 'aoeu'; // TODO: ....
                claim.defaultAlgorithm = 'SHA-256';
                claim.signatureRef = 'self#jumbf=' + signature.label;

                // create a manifest from the assertion store, claim, and signature
                const manifestStore = new ManifestStore();
                const manifest = new Manifest(manifestStore);
                manifest.label = 'c2pa-ts:urn:uuid:14cd3c1b-3048-45ac-a613-9b497a41528b'; // TODO: Generate this value
                manifest.assertions = new AssertionStore();
                manifest.claim = claim;
                manifest.signature = signature;
                manifest.addAssertion(dataHashAssertion);
                manifestStore.manifests.push(manifest);

                const schema = SuperBox.schema;

                // insert the JUMBF box data into the asset
                const length = schema.measure(manifestStore.generateJUMBFBox()).size;
                await asset.ensureManifestSpace(length);

                // update the hard binding
                await dataHashAssertion.updateWithAsset(asset);

                // create the signature
                const privateKeyData = await fs.readFile(certificate.privateKeyFile);
                const base64 = privateKeyData
                    .toString()
                    .replace(/-{5}(BEGIN|END) .*-{5}/gm, '')
                    .replace(/\s/gm, '');
                const privateKey = Buffer.from(base64, 'base64');

                await manifest.sign(privateKey);

                // check whether the length of the JUMBF changed
                const jumbfBox = manifestStore.generateJUMBFBox();
                const length2 = schema.measure(jumbfBox).size;
                if (length !== length2) {
                    throw new Error('JUMBF length mismatch');
                }

                // write the JUMBF box to the asset
                const buffer = Buffer.alloc(length);
                const writer = new bin.BufferWriter(buffer, { endianness: 'big' });
                schema.write(writer, jumbfBox);
                await asset.writeManifestJUMBF(buffer);

                // write the asset to the target file
                await fs.writeFile(targetFile, await asset.getDataRange());
            });

            it('read and verify the JPEG with manifest', async function () {
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
                        code: ValidationStatusCode.SigningCredentialTrusted,
                        explanation: undefined,
                        url: 'self#jumbf=/c2pa/c2pa-ts:urn:uuid:14cd3c1b-3048-45ac-a613-9b497a41528b/c2pa.signature',
                    },
                    {
                        code: ValidationStatusCode.ClaimSignatureValidated,
                        explanation: undefined,
                        url: 'self#jumbf=/c2pa/c2pa-ts:urn:uuid:14cd3c1b-3048-45ac-a613-9b497a41528b/c2pa.signature',
                    },
                    {
                        code: ValidationStatusCode.AssertionHashedURIMatch,
                        explanation: undefined,
                        url: 'self#jumbf=c2pa.assertions/c2pa.hash.data',
                    },
                    {
                        code: ValidationStatusCode.AssertionDataHashMatch,
                        explanation: undefined,
                        url: 'self#jumbf=/c2pa/c2pa-ts:urn:uuid:14cd3c1b-3048-45ac-a613-9b497a41528b/c2pa.assertions/c2pa.hash.data',
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
