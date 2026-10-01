import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { afterAll, describe, it } from 'bun:test';
import { JPEG } from '../src/asset';
import { NamedActorRole, SignatureType, VerifiedIdentity, VerifiedIdentityType } from '../src/cawg';
import { Crypto } from '../src/crypto';
import { CBORBox, SuperBox } from '../src/jumbf';
import {
    Assertion,
    AssertionLabels,
    DataHashAssertion,
    IdentityAssertion,
    Manifest,
    ManifestStore,
    ValidationStatusCode,
} from '../src/manifest';
import { loadIdentitySigner, TEST_IDENTITIES } from './utils/test-identity-certificates';
import { loadTestCertificate, TEST_CERTIFICATES } from './utils/testCertificates';

// Location of the image to sign with identity assertion
const sourceFile = 'tests/fixtures/dawn-technology-icon.jpg';
const targetFile = 'tests/fixtures/dawn-technology-icon-signed-with-ica.jpg';

describe('ICA (identity claims aggregation) Signing Tests', function () {
    for (const certificate of TEST_CERTIFICATES) {
        describe(`using ${certificate.name}`, function () {
            let manifest: Manifest | undefined;

            it('add a manifest with ICA (identity claims aggregation) to a JPEG test file', async function () {
                const { signer, timestampProvider } = await loadTestCertificate(certificate);

                // Load the file into a buffer
                const buf = await fs.readFile(sourceFile);
                assert.ok(buf);

                // Ensure it's a JPEG
                assert.ok(await JPEG.canRead(buf));

                // Construct the asset
                const asset = await JPEG.create(buf);

                // Create a new manifest store and append a new manifest
                const manifestStore = new ManifestStore();
                manifest = manifestStore.createManifest({
                    assetFormat: 'image/jpeg',
                    instanceID: 'ica-test-xyz',
                    defaultHashAlgorithm: 'SHA-256',
                    signer,
                });

                const identitySigner = await loadIdentitySigner(TEST_IDENTITIES[0]);
                await IdentityAssertion.create(manifest, asset, signer, timestampProvider, identitySigner);

                // Create the manifest signature
                await manifest.sign(signer, timestampProvider);

                // Write the JUMBF box to the asset
                await asset.writeManifestJUMBF(manifestStore.getBytes());

                // Write the asset to the target file
                await fs.writeFile(targetFile, await asset.getDataRange());
            });

            it('decode verifiedIdentities from the ICA credential in the signed JPEG', async function () {
                if (!manifest) assert.fail('Manifest is not available');

                const buf = await fs.readFile(targetFile).catch(() => undefined);
                if (!buf) return;

                const asset = await JPEG.create(buf);
                const jumbf = await asset.getManifestJUMBF();
                assert.ok(jumbf, 'no JUMBF found');

                const superBox = SuperBox.fromBuffer(jumbf);
                const manifestStore = ManifestStore.read(superBox);
                const activeManifest = manifestStore.getActiveManifest();
                assert.ok(activeManifest, 'no active manifest found');

                const identityAssertion = activeManifest.assertions?.assertions.find(
                    (a: Assertion) => a.label === AssertionLabels.identity,
                );
                assert.ok(identityAssertion instanceof IdentityAssertion, 'no IdentityAssertion found');

                // Decode the COSE_Sign1 structure embedded in the assertion signature
                const coseDecoded = CBORBox.decoder.decode(identityAssertion.signature) as {
                    value: [Uint8Array, unknown, Uint8Array, Uint8Array];
                };
                assert.ok(Array.isArray(coseDecoded.value) && coseDecoded.value.length === 4, 'invalid COSE_Sign1');

                // Payload is the JSON-encoded ICA credential
                const [, , payloadBytes] = coseDecoded.value;
                const credential = JSON.parse(new TextDecoder().decode(payloadBytes)) as {
                    credentialSubject: {
                        verifiedIdentities: VerifiedIdentity[];
                    };
                };

                const verifiedIdentities = credential.credentialSubject.verifiedIdentities;

                assert.ok(
                    Array.isArray(verifiedIdentities) && verifiedIdentities.length > 0,
                    'verifiedIdentities is empty',
                );
                assert.equal(verifiedIdentities[0].type, VerifiedIdentityType.SocialMedia);
                assert.equal(verifiedIdentities[0].name, 'Sample Creator');
                assert.equal(verifiedIdentities[0].username, 'sample-creator');
                assert.equal(verifiedIdentities[0].uri, 'https://example.com/sample-creator');
                assert.equal(verifiedIdentities[0].provider?.name, 'Example Identity Provider');
            });

            it('read and verify the JPEG with ICA (identity claims aggregation) assertion', async function () {
                if (!manifest) assert.fail('Manifest is not available');

                // Load the file into a buffer
                const buf = await fs.readFile(targetFile).catch(() => undefined);
                if (!buf) return;

                // Ensure it's a JPEG
                assert.ok(await JPEG.canRead(buf));

                // Construct the asset
                const asset = await JPEG.create(buf);

                // Extract the C2PA manifest store in binary JUMBF format
                const jumbf = await asset.getManifestJUMBF();
                assert.ok(jumbf, 'no JUMBF found');

                // Deserialize the JUMBF box structure
                const superBox = SuperBox.fromBuffer(jumbf);

                // Construct the manifest store from the JUMBF box
                const manifestStore = ManifestStore.read(superBox);

                // Get the active manifest
                const activeManifest = manifestStore.getActiveManifest();
                assert.ok(activeManifest, 'no active manifest found');

                // Find the ICA (identity claims aggregation) assertion
                const identityAssertion = activeManifest.assertions?.assertions.find(
                    (a: Assertion) => a.label === AssertionLabels.identity,
                );
                assert.ok(identityAssertion, 'ICA (identity claims aggregation) assertion not found');
                assert.ok(identityAssertion instanceof IdentityAssertion, 'assertion is not an IdentityAssertion');

                // Verify ICA (identity claims aggregation) assertion properties
                assert.equal(identityAssertion.signerPayload.sig_type, SignatureType.IdentityClaimsAggregation);
                assert.deepEqual(identityAssertion.signerPayload.role, [NamedActorRole.Creator]);
                assert.equal(identityAssertion.signerPayload.referenced_assertions.length, 1);

                const validationResult = await manifestStore.validate(asset);

                // Check overall validity
                assert.ok(validationResult.isValid, 'Validation result invalid');

                // Verify ICA (identity claims aggregation) assertion is present in the validation
                const identityHashCheck = validationResult.statusEntries.find(
                    e =>
                        e.code === ValidationStatusCode.AssertionHashedURIMatch &&
                        e.url?.includes(AssertionLabels.identity),
                );
                assert.ok(identityHashCheck?.success, 'ICA (identity claims aggregation) assertion hash check failed');
            });
        });
    }

    afterAll(async function () {
        // Delete test file, ignore the case it doesn't exist
        await fs.unlink(targetFile).catch(() => undefined);
    });
});

describe('Identity Assertion with Multiple Roles', function () {
    let manifest: Manifest | undefined;
    const targetFileMultiRole = 'tests/fixtures/dawn-technology-icon-signed-multi-role.jpg';

    it('create manifest with identity assertion having multiple roles', async function () {
        const { signer, timestampProvider } = await loadTestCertificate(TEST_CERTIFICATES[0]);

        const buf = await fs.readFile(sourceFile);
        const asset = await JPEG.create(buf);

        const manifestStore = new ManifestStore();
        manifest = manifestStore.createManifest({
            assetFormat: 'image/jpeg',
            instanceID: 'multi-role-test',
            defaultHashAlgorithm: 'SHA-256',
            signer,
        });

        const dataHashAssertion = DataHashAssertion.create('SHA-256');
        manifest.addAssertion(dataHashAssertion);

        const identityAssertion = new IdentityAssertion();
        // Set preliminary values with placeholder hash
        identityAssertion.setSignerPayload(
            [
                {
                    url: `self#jumbf=/c2pa/${manifest.label}/c2pa.assertions/${dataHashAssertion.fullLabel}`,
                    alg: 'sha256',
                    hash: new Uint8Array(32).fill(0), // Placeholder
                },
            ],
            SignatureType.X509Cose,
            [NamedActorRole.Creator, NamedActorRole.Editor, NamedActorRole.Contributor],
        );
        identityAssertion.setSignature(
            new Uint8Array(64).fill(0xbb),
            new Uint8Array(256).fill(0x00),
            undefined,
            manifest,
        );
        manifest.addAssertion(identityAssertion);

        await asset.ensureManifestSpace(manifestStore.measureSize());
        await dataHashAssertion.updateWithAsset(asset);

        const dataHashAssertionBox = dataHashAssertion.generateJUMBFBox(manifest.claim);
        const dataHashAssertionBytes = dataHashAssertionBox.toBuffer(false);
        const dataHashAssertionHash = await Crypto.digest(dataHashAssertionBytes, 'SHA-256');

        // Update with correct hash
        identityAssertion.setSignerPayload(
            [
                {
                    url: `self#jumbf=/c2pa/${manifest.label}/c2pa.assertions/${dataHashAssertion.fullLabel}`,
                    alg: 'sha256',
                    hash: dataHashAssertionHash,
                },
            ],
            SignatureType.X509Cose,
            [NamedActorRole.Creator, NamedActorRole.Editor, NamedActorRole.Contributor],
        );

        identityAssertion.setSignature(
            new Uint8Array(64).fill(0xbb),
            new Uint8Array(256).fill(0x00),
            undefined,
            manifest,
        );

        await manifest.sign(signer, timestampProvider);
        await asset.writeManifestJUMBF(manifestStore.getBytes());
        await fs.writeFile(targetFileMultiRole, await asset.getDataRange());
    });

    it('verify identity assertion with multiple roles', async function () {
        if (!manifest) assert.fail('Manifest is not available');

        const buf = await fs.readFile(targetFileMultiRole);
        const asset = await JPEG.create(buf);
        const jumbf = await asset.getManifestJUMBF();
        assert.ok(jumbf);

        const superBox = SuperBox.fromBuffer(jumbf);
        const manifestStore = ManifestStore.read(superBox);
        const activeManifest = manifestStore.getActiveManifest();
        assert.ok(activeManifest);

        const identityAssertion = activeManifest.assertions?.assertions.find(
            (a: Assertion) => a.label === AssertionLabels.identity,
        );
        assert.ok(identityAssertion instanceof IdentityAssertion);

        // Verify multiple roles
        assert.deepEqual(identityAssertion.signerPayload.role, [
            NamedActorRole.Creator,
            NamedActorRole.Editor,
            NamedActorRole.Contributor,
        ]);
    });

    afterAll(async function () {
        await fs.unlink(targetFileMultiRole).catch(() => undefined);
    });
});

describe('Identity Assertion with Optional Fields', function () {
    let manifest: Manifest | undefined;
    const targetFileOptional = 'tests/fixtures/dawn-technology-icon-signed-optional-fields.jpg';

    it('create manifest with identity assertion with optional fields', async function () {
        const { signer, timestampProvider } = await loadTestCertificate(TEST_CERTIFICATES[0]);

        const buf = await fs.readFile(sourceFile);
        const asset = await JPEG.create(buf);

        const manifestStore = new ManifestStore();
        manifest = manifestStore.createManifest({
            assetFormat: 'image/jpeg',
            instanceID: 'optional-fields-test',
            defaultHashAlgorithm: 'SHA-256',
            signer,
        });

        const dataHashAssertion = DataHashAssertion.create('SHA-256');
        manifest.addAssertion(dataHashAssertion);

        const identityAssertion = new IdentityAssertion();
        // Set preliminary values with placeholder hashes
        identityAssertion.setSignerPayload(
            [
                {
                    url: `self#jumbf=/c2pa/${manifest.label}/c2pa.assertions/${dataHashAssertion.fullLabel}`,
                    alg: 'sha256',
                    hash: new Uint8Array(32).fill(0), // Placeholder
                },
            ],
            SignatureType.X509Cose,
            [NamedActorRole.Publisher],
            {
                expectedPartialClaim: { alg: 'sha256', hash: new Uint8Array(32).fill(0x11) },
                expectedClaimGenerator: { alg: 'sha256', hash: new Uint8Array(32).fill(0x22) },
            },
        );
        const placeholderPad2 = new Uint8Array(128).fill(0x00);
        identityAssertion.setSignature(
            new Uint8Array(64).fill(0xcc),
            new Uint8Array(256).fill(0x00),
            placeholderPad2,
            manifest,
        );
        manifest.addAssertion(identityAssertion);

        await asset.ensureManifestSpace(manifestStore.measureSize());
        await dataHashAssertion.updateWithAsset(asset);

        const dataHashAssertionBox = dataHashAssertion.generateJUMBFBox(manifest.claim);
        const dataHashAssertionBytes = dataHashAssertionBox.toBuffer(false);
        const dataHashAssertionHash = await Crypto.digest(dataHashAssertionBytes, 'SHA-256');

        // Update with correct hash and options
        const expectedPartialClaim = {
            alg: 'sha256',
            hash: new Uint8Array(32).fill(0x11),
        };

        const expectedClaimGenerator = {
            alg: 'sha256',
            hash: new Uint8Array(32).fill(0x22),
        };

        identityAssertion.setSignerPayload(
            [
                {
                    url: `self#jumbf=/c2pa/${manifest.label}/c2pa.assertions/${dataHashAssertion.fullLabel}`,
                    alg: 'sha256',
                    hash: dataHashAssertionHash,
                },
            ],
            SignatureType.X509Cose,
            [NamedActorRole.Publisher],
            {
                expectedPartialClaim,
                expectedClaimGenerator,
            },
        );

        identityAssertion.setSignature(
            new Uint8Array(64).fill(0xcc),
            new Uint8Array(256).fill(0x00),
            placeholderPad2,
            manifest,
        );

        await manifest.sign(signer, timestampProvider);
        await asset.writeManifestJUMBF(manifestStore.getBytes());
        await fs.writeFile(targetFileOptional, await asset.getDataRange());
    });

    it('verify identity assertion with optional fields', async function () {
        if (!manifest) assert.fail('Manifest is not available');

        const buf = await fs.readFile(targetFileOptional);
        const asset = await JPEG.create(buf);
        const jumbf = await asset.getManifestJUMBF();
        assert.ok(jumbf);

        const superBox = SuperBox.fromBuffer(jumbf);
        const manifestStore = ManifestStore.read(superBox);
        const activeManifest = manifestStore.getActiveManifest();
        assert.ok(activeManifest);

        const identityAssertion = activeManifest.assertions?.assertions.find(
            (a: Assertion) => a.label === AssertionLabels.identity,
        );
        assert.ok(identityAssertion instanceof IdentityAssertion);

        // Verify optional fields are present
        assert.ok(identityAssertion.signerPayload.expected_partial_claim);
        assert.equal(identityAssertion.signerPayload.expected_partial_claim.alg, 'sha256');

        assert.ok(identityAssertion.signerPayload.expected_claim_generator);
        assert.equal(identityAssertion.signerPayload.expected_claim_generator.alg, 'sha256');

        // Verify pad2 is present
        assert.ok(identityAssertion.pad2);
        assert.equal(identityAssertion.pad2.length, 128);
    });

    afterAll(async function () {
        await fs.unlink(targetFileOptional).catch(() => undefined);
    });
});

describe('Identity Assertion expected_claim_generator Validation', function () {
    const targetFileCorrect = 'tests/fixtures/dawn-technology-icon-signed-ecg-correct.jpg';
    const targetFileWrong = 'tests/fixtures/dawn-technology-icon-signed-ecg-wrong.jpg';
    let certHash: Uint8Array | undefined;

    afterAll(async function () {
        await fs.unlink(targetFileCorrect).catch(() => undefined);
        await fs.unlink(targetFileWrong).catch(() => undefined);
    });

    it('signs with correct expected_claim_generator hash', async function () {
        const { signer, timestampProvider } = await loadTestCertificate(TEST_CERTIFICATES[0]);

        certHash = await Crypto.digest(new Uint8Array(signer.certificate.rawData), 'SHA-256');

        const buf = await fs.readFile(sourceFile);
        assert.ok(buf);
        assert.ok(await JPEG.canRead(buf));

        const asset = await JPEG.create(buf);

        const manifestStore = new ManifestStore();
        const manifest = manifestStore.createManifest({
            assetFormat: 'image/jpeg',
            instanceID: 'ecg-correct-test',
            defaultHashAlgorithm: 'SHA-256',
            signer,
        });

        const dataHashAssertion = DataHashAssertion.create('SHA-256');
        manifest.addAssertion(dataHashAssertion);

        const identityAssertion = new IdentityAssertion();
        identityAssertion.setSignerPayload(
            [{ url: `self#jumbf=c2pa.assertions/c2pa.hash.data`, hash: new Uint8Array(32).fill(0x00) }],
            SignatureType.X509Cose,
            [NamedActorRole.Creator],
            { expectedClaimGenerator: { alg: 'sha256', hash: new Uint8Array(32).fill(0x00) } },
        );
        identityAssertion.setSignature(
            new Uint8Array(64).fill(0xdd),
            new Uint8Array(256).fill(0x00),
            undefined,
            manifest,
        );
        manifest.addAssertion(identityAssertion);

        await asset.ensureManifestSpace(manifestStore.measureSize());
        await dataHashAssertion.updateWithAsset(asset);

        // First signing pass to populate claim assertion hashes
        await manifest.sign(signer, timestampProvider);

        assert(manifest.claim, 'Manifest claim missing after signing');

        const hardBindingRef = manifest.claim.assertions.find(
            ref => ref.uri === `self#jumbf=c2pa.assertions/${dataHashAssertion.fullLabel}`,
        );
        assert(hardBindingRef, 'Hard binding reference not found in claim assertions');

        // Second pass: correct hard binding hash + correct certificate hash as expected_claim_generator
        identityAssertion.setSignerPayload(
            [{ url: hardBindingRef.uri, hash: hardBindingRef.hash }],
            SignatureType.X509Cose,
            [NamedActorRole.Creator],
            { expectedClaimGenerator: { alg: 'sha256', hash: certHash } },
        );

        await manifest.sign(signer, timestampProvider);
        await asset.writeManifestJUMBF(manifestStore.getBytes());
        await fs.writeFile(targetFileCorrect, await asset.getDataRange());
    });

    it('validates correct expected_claim_generator does not emit mismatch', async function () {
        if (!certHash) return;

        const buf = await fs.readFile(targetFileCorrect).catch(() => undefined);
        if (!buf) return;

        const asset = await JPEG.create(buf);
        const jumbf = await asset.getManifestJUMBF();
        assert.ok(jumbf, 'no JUMBF found');

        const superBox = SuperBox.fromBuffer(jumbf);
        const manifestStore = ManifestStore.read(superBox);

        const activeManifest = manifestStore.getActiveManifest();
        assert.ok(activeManifest, 'no active manifest found');

        const identityAssertion = activeManifest.assertions?.assertions.find(
            (a: Assertion) => a.label === AssertionLabels.identity,
        );
        assert.ok(identityAssertion instanceof IdentityAssertion, 'no IdentityAssertion found');
        assert.ok(identityAssertion.signerPayload.expected_claim_generator, 'expected_claim_generator field missing');
        assert.equal(identityAssertion.signerPayload.expected_claim_generator.alg, 'sha256');
        assert.equal(identityAssertion.signerPayload.expected_claim_generator.hash.length, 32);

        const validationResult = await manifestStore.validate(asset);

        const ecgMismatch = validationResult.statusEntries.find(
            e => e.code === ValidationStatusCode.IdentityExpectedClaimGeneratorMismatch,
        );
        assert.ok(
            !ecgMismatch,
            `expected_claim_generator should not emit mismatch for correct hash, but got: ${ecgMismatch?.code}`,
        );
    });

    it('signs with wrong expected_claim_generator hash', async function () {
        const { signer, timestampProvider } = await loadTestCertificate(TEST_CERTIFICATES[0]);

        const buf = await fs.readFile(sourceFile);
        const asset = await JPEG.create(buf);

        const manifestStore = new ManifestStore();
        const manifest = manifestStore.createManifest({
            assetFormat: 'image/jpeg',
            instanceID: 'ecg-wrong-test',
            defaultHashAlgorithm: 'SHA-256',
            signer,
        });

        const dataHashAssertion = DataHashAssertion.create('SHA-256');
        manifest.addAssertion(dataHashAssertion);

        // Deliberately wrong hash — all 0xff bytes, clearly not a certificate hash
        const wrongHash = new Uint8Array(32).fill(0xff);

        const identityAssertion = new IdentityAssertion();
        identityAssertion.setSignerPayload(
            [{ url: `self#jumbf=c2pa.assertions/c2pa.hash.data`, hash: new Uint8Array(32).fill(0x00) }],
            SignatureType.X509Cose,
            [NamedActorRole.Creator],
            { expectedClaimGenerator: { alg: 'sha256', hash: wrongHash } },
        );
        identityAssertion.setSignature(
            new Uint8Array(64).fill(0xdd),
            new Uint8Array(256).fill(0x00),
            undefined,
            manifest,
        );
        manifest.addAssertion(identityAssertion);

        await asset.ensureManifestSpace(manifestStore.measureSize());
        await dataHashAssertion.updateWithAsset(asset);

        await manifest.sign(signer, timestampProvider);

        assert(manifest.claim, 'Manifest claim missing after signing');

        const hardBindingRef = manifest.claim.assertions.find(
            ref => ref.uri === `self#jumbf=c2pa.assertions/${dataHashAssertion.fullLabel}`,
        );
        assert(hardBindingRef, 'Hard binding reference not found in claim assertions');

        identityAssertion.setSignerPayload(
            [{ url: hardBindingRef.uri, hash: hardBindingRef.hash }],
            SignatureType.X509Cose,
            [NamedActorRole.Creator],
            { expectedClaimGenerator: { alg: 'sha256', hash: wrongHash } },
        );

        await manifest.sign(signer, timestampProvider);
        await asset.writeManifestJUMBF(manifestStore.getBytes());
        await fs.writeFile(targetFileWrong, await asset.getDataRange());
    });
});

describe('Identity Assertion Reference Verification', function () {
    it('should correctly hash and reference data hash assertion', async function () {
        const { signer } = await loadTestCertificate(TEST_CERTIFICATES[0]);

        const buf = await fs.readFile(sourceFile);
        const asset = await JPEG.create(buf);

        const manifestStore = new ManifestStore();
        const manifest = manifestStore.createManifest({
            assetFormat: 'image/jpeg',
            instanceID: 'reference-test',
            defaultHashAlgorithm: 'SHA-256',
            signer,
        });

        const dataHashAssertion = DataHashAssertion.create('SHA-256');
        manifest.addAssertion(dataHashAssertion);

        await asset.ensureManifestSpace(manifestStore.measureSize());
        await dataHashAssertion.updateWithAsset(asset);

        // Calculate the hash of the data hash assertion
        const dataHashAssertionBox = dataHashAssertion.generateJUMBFBox(manifest.claim);
        const dataHashAssertionBytes = dataHashAssertionBox.toBuffer(false);
        const dataHashAssertionHash = await Crypto.digest(dataHashAssertionBytes, 'SHA-256');

        // Verify the hash is valid
        assert.ok(dataHashAssertionHash instanceof Uint8Array);
        assert.equal(dataHashAssertionHash.length, 32);

        // Create identity assertion with the reference
        const identityAssertion = new IdentityAssertion();
        identityAssertion.setSignerPayload(
            [
                {
                    url: `self#jumbf=/c2pa/${manifest.label}/c2pa.assertions/${dataHashAssertion.fullLabel}`,
                    alg: 'sha256',
                    hash: dataHashAssertionHash,
                },
            ],
            SignatureType.X509Cose,
            [NamedActorRole.Creator],
        );

        // Verify the referenced assertion URL is correctly formatted
        assert.ok(identityAssertion.signerPayload.referenced_assertions[0].url.startsWith('self#jumbf=/c2pa/'));
        assert.ok(identityAssertion.signerPayload.referenced_assertions[0].url.includes('c2pa.assertions'));
        assert.ok(identityAssertion.signerPayload.referenced_assertions[0].url.includes('c2pa.hash.data'));
    });
});
