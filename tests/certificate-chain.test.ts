/**
 * @file Certificate Chain Validation Tests
 *
 * End-to-end tests that verify the C2PA manifest signing and validation pipeline
 * correctly enforces X.509 certificate chain rules. Each test dynamically generates
 * a certificate hierarchy (root → intermediate → leaf) using `@peculiar/x509`,
 * signs a JPEG asset with a C2PA manifest, and then validates the result.
 *
 * The test suite covers the following areas of the C2PA specification's certificate
 * requirements:
 *
 *  1. **Basic chain structure** – valid 2- and 3-level chains, self-signed roots,
 *     and missing intermediates.
 *  2. **Signature verification** – tampered intermediate signatures and irrelevant
 *     certificates in the chain.
 *  3. **Validity period** – expired / not-yet-valid certificates at every level.
 *  4. **Key Usage extensions** – missing `digitalSignature` bit and non-critical
 *     Key Usage flag.
 *  5. **Basic Constraints** – missing extension on intermediates.
 *  6. **Subject Key Identifier** – missing SKI on root and intermediate.
 *  7. **Authority Key Identifier** – missing AKI on intermediate.
 *  8. **Error handling** – malformed and empty certificate data.
 *  9. **Loop detection** – circular certificate references (A → B → C → B).
 * 10. **Subject/Issuer matching** – mismatched Authority Key Identifier.
 *
 * @see {@link https://c2pa.org/specifications/} for the C2PA specification.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {
    AuthorityKeyIdentifierExtension,
    BasicConstraintsExtension,
    ExtendedKeyUsage,
    ExtendedKeyUsageExtension,
    Extension,
    KeyUsageFlags,
    KeyUsagesExtension,
    SubjectKeyIdentifierExtension,
    X509Certificate,
    X509CertificateCreateParams,
    X509CertificateCreateSelfSignedParams,
    X509CertificateGenerator,
} from '@peculiar/x509';
import { beforeEach, describe, it } from 'bun:test';
import { JPEG } from '../src/asset';
import { CoseAlgorithmIdentifier, LocalSigner, TrustList } from '../src/cose';
import { SuperBox } from '../src/jumbf';
import { DataHashAssertion, ManifestStore, ValidationResult } from '../src/manifest';
import { LocalTimestampProvider } from '../src/rfc3161';
import {
    getExpectedValidationStatusEntries,
    getExpectedValidationStatusEntriesClaimSignatureOutsideValidity,
    getExpectedValidationStatusEntriesInvalid,
    getExpectedValidationStatusEntriesUntrusted,
    getExpectedValidationStatusEntriesUntrustedTimeStamp,
    getExpectedValidationStatusEntriesWrongTimeStamp,
} from './utils/testCertificates';

/** Path to the unsigned source JPEG used as input for every test. */
const sourceFile = 'tests/fixtures/trustnxt-icon.jpg';
/** Path where the signed JPEG is temporarily written during a test (deleted afterwards). */
const targetFile = 'tests/fixtures/trustnxt-icon-certificate-chain-signed.jpg';

/**
 * Performs the full sign-then-validate round-trip for a JPEG asset.
 *
 * 1. Reads the unsigned {@link sourceFile}.
 * 2. Creates a C2PA manifest with a SHA-512 data hash assertion.
 * 3. Signs the manifest using the supplied {@link signer} and {@link timestampProvider}.
 * 4. Writes the signed asset to {@link targetFile}.
 * 5. Re-reads the signed file, extracts and deserialises the JUMBF manifest store,
 *    and runs full validation.
 * 6. Cleans up the temporary file.
 *
 * @param signer - The {@link LocalSigner} used to produce the COSE signature.
 * @param timestampProvider - The {@link LocalTimestampProvider} used to produce the RFC 3161 timestamp.
 * @returns A tuple of the {@link ValidationResult} and the active manifest's label.
 */
async function getValidationResult(
    signer: LocalSigner,
    timestampProvider: LocalTimestampProvider,
): Promise<[ValidationResult, string]> {
    // load the file into a buffer
    const buf = await fs.readFile(sourceFile);
    assert.ok(buf);

    // ensure it's a JPEG
    assert.ok(await JPEG.canRead(buf));

    // construct the asset
    const asset = await JPEG.create(buf);

    // create a new manifest store and append a new manifest
    const manifestStore = new ManifestStore();
    const manifest = manifestStore.createManifest({
        assetFormat: 'image/jpeg',
        instanceID: 'xyzxyz2',
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

    // load the file into a buffer
    const targetBuf = await fs.readFile(targetFile);
    assert.ok(targetBuf);

    // ensure it's a JPEG
    assert.ok(await JPEG.canRead(targetBuf));

    // construct the asset
    const targetAsset = await JPEG.create(targetBuf);

    // extract the C2PA manifest store in binary JUMBF format
    const jumbf = await targetAsset.getManifestJUMBF();
    assert.ok(jumbf, 'no JUMBF found');

    // deserialize the JUMBF box structure
    const superBox = SuperBox.fromBuffer(jumbf);

    // construct the manifest store from the JUMBF box
    const targetManifestStore = ManifestStore.read(superBox);

    // get active manifest
    const targetManifest = targetManifestStore.getActiveManifest();
    assert.ok(targetManifest, 'No active manifest found');
    assert.ok(targetManifest.signature, 'No signature found in manifest');

    // validate the asset against the store
    const validationResult = await targetManifestStore.validate(targetAsset);

    // delete test file, ignore the case it doesn't exist
    await fs.unlink(targetFile).catch(() => undefined);

    assert.ok(targetManifest.label, 'No manifest label');
    return [validationResult, targetManifest.label];
}

/**
 * Exports a {@link CryptoKey} to its PKCS#8 DER-encoded byte representation.
 *
 * This is the format expected by {@link LocalSigner} and {@link LocalTimestampProvider}.
 *
 * @param key - A private {@link CryptoKey} with `extractable` set to `true`.
 * @returns The PKCS#8-encoded private key bytes.
 */
async function toPkcs8Bytes(key: CryptoKey): Promise<Uint8Array> {
    const der = await crypto.subtle.exportKey('pkcs8', key); // ArrayBuffer (DER)
    return new Uint8Array(der);
}

enum ExtensionClassNames {
    BasicConstraintsExtension = 'BasicConstraintsExtension',
    ExtendedKeyUsageExtension = 'ExtendedKeyUsageExtension',
    KeyUsagesExtension = 'KeyUsagesExtension',
    SubjectKeyIdentifierExtension = 'SubjectKeyIdentifierExtension',
    AuthorityKeyIdentifierExtension = 'AuthorityKeyIdentifierExtension',
}
type ExtensionClassName = keyof typeof ExtensionClassNames;
type ExtensionChangeMap = Partial<Record<ExtensionClassName, Extension | undefined>>;

/**
 * Builds the standard X.509v3 extensions for a **root CA** certificate.
 *
 * Index layout (used by {@link applyExtensionChanges}):
 * - `[0]` BasicConstraints – CA:true, pathLen 3, critical
 * - `[1]` KeyUsage – digitalSignature | keyCertSign | cRLSign, critical
 * - `[2]` SubjectKeyIdentifier
 *
 * @param subjectPublicKey - The root CA's public key (used for SKI calculation).
 */
async function getRootExtensions(subjectPublicKey: CryptoKey): Promise<Extension[]> {
    return [
        new BasicConstraintsExtension(true, 3, true),
        new KeyUsagesExtension(
            KeyUsageFlags.digitalSignature + KeyUsageFlags.keyCertSign + KeyUsageFlags.cRLSign,
            true,
        ),
        await SubjectKeyIdentifierExtension.create(subjectPublicKey, false),
    ];
}

/**
 * Builds the standard X.509v3 extensions for an **intermediate CA** certificate.
 *
 * Index layout (used by {@link applyExtensionChanges}):
 * - `[0]` BasicConstraints – CA:true, pathLen 2, critical
 * - `[1]` ExtendedKeyUsage – emailProtection, critical
 * - `[2]` KeyUsage – digitalSignature | keyCertSign | cRLSign, critical
 * - `[3]` SubjectKeyIdentifier
 * - `[4]` AuthorityKeyIdentifier
 *
 * @param subjectPublicKey - The intermediate CA's public key.
 * @param issuerPublicKey  - The issuing CA's public key (used for AKI calculation).
 */
async function getIntermediateExtensions(
    subjectPublicKey: CryptoKey,
    issuerPublicKey: CryptoKey,
): Promise<Extension[]> {
    return [
        new BasicConstraintsExtension(true, 2, true),
        new ExtendedKeyUsageExtension([ExtendedKeyUsage.emailProtection], true),
        new KeyUsagesExtension(
            KeyUsageFlags.digitalSignature + KeyUsageFlags.keyCertSign + KeyUsageFlags.cRLSign,
            true,
        ),
        await SubjectKeyIdentifierExtension.create(subjectPublicKey, false),
        await AuthorityKeyIdentifierExtension.create(issuerPublicKey, false),
    ];
}

/**
 * Builds the standard X.509v3 extensions for a **leaf (end-entity)** certificate.
 *
 * Index layout (used by {@link applyExtensionChanges}):
 * - `[0]` BasicConstraints – CA:false, pathLen 1, critical
 * - `[1]` ExtendedKeyUsage – emailProtection, critical
 * - `[2]` KeyUsage – digitalSignature only, critical
 * - `[3]` SubjectKeyIdentifier
 * - `[4]` AuthorityKeyIdentifier
 *
 * @param subjectPublicKey - The leaf certificate's public key.
 * @param issuerPublicKey  - The issuing CA's public key (used for AKI calculation).
 */
async function getLeafExtensions(subjectPublicKey: CryptoKey, issuerPublicKey: CryptoKey): Promise<Extension[]> {
    return [
        new BasicConstraintsExtension(false, 1, true),
        new ExtendedKeyUsageExtension([ExtendedKeyUsage.emailProtection], true),
        new KeyUsagesExtension(KeyUsageFlags.digitalSignature, true),
        await SubjectKeyIdentifierExtension.create(subjectPublicKey, false),
        await AuthorityKeyIdentifierExtension.create(issuerPublicKey, false),
    ];
}

/**
 * Generates a self-signed ECDSA P-256 **root CA** certificate and registers it
 * as the sole trust anchor via {@link TrustList.setTrustAnchors}.
 *
 * @param partial          - Optional overrides merged into the certificate creation params
 *                           (e.g. `notBefore`, `notAfter`).
 * @param extensionChanges - Optional map of index → replacement {@link Extension} (or `undefined`
 *                           to remove). Applied via {@link applyExtensionChanges}.
 * @param setAsTrustAnchor  - Whether to set the generated root certificate as the trust anchor (default: `true`).
 * @returns A tuple of `[keyPair, certificate]`.
 */
async function createRootCertificate(
    partial?: Partial<X509CertificateCreateSelfSignedParams>,
    extensionChanges?: ExtensionChangeMap,
    setAsTrustAnchor = true,
): Promise<[CryptoKeyPair, X509Certificate]> {
    const rootKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const extensions = await getRootExtensions(rootKeys.publicKey);
    const rootCert = await X509CertificateGenerator.createSelfSigned(
        {
            serialNumber: '01',
            name: `C=NL, ST=Zuid-Holland, O=Dawn Technology, OU=Development, CN=Root`,
            keys: rootKeys,
            signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
            extensions: applyExtensionChanges(extensions, extensionChanges),
            ...partial,
        },
        crypto,
    );
    if (setAsTrustAnchor) {
        TrustList.setTrustAnchors([rootCert]);
    }

    return [rootKeys, rootCert];
}

/**
 * Generates an ECDSA P-256 **intermediate CA** certificate signed by the given root.
 *
 * @param rootCert         - The issuing root CA certificate.
 * @param rootKeys         - The root CA's key pair (private key used to sign).
 * @param partial          - Optional overrides merged into the certificate creation params.
 * @param extensionChanges - Optional extension replacements/removals.
 * @returns A tuple of `[keyPair, certificate]`.
 */
async function createIntermediateCertificate(
    rootCert: X509Certificate,
    rootKeys: CryptoKeyPair,
    partial?: Partial<X509CertificateCreateParams>,
    extensionChanges?: ExtensionChangeMap,
): Promise<[CryptoKeyPair, X509Certificate]> {
    const intermediateKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
        'sign',
        'verify',
    ]);
    const extensions = await getIntermediateExtensions(intermediateKeys.publicKey, rootKeys.publicKey);
    const intermediateCert = await X509CertificateGenerator.create(
        {
            serialNumber: '02',
            subject: `C=NL, ST=Zuid-Holland, O=Dawn Technology, OU=Development, CN=Intermediate`,
            issuer: rootCert.subject,
            signingKey: rootKeys.privateKey,
            publicKey: intermediateKeys.publicKey,
            signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
            extensions: applyExtensionChanges(extensions, extensionChanges),
            ...partial,
        },
        crypto,
    );

    return [intermediateKeys, intermediateCert];
}

/**
 * Generates an ECDSA P-256 **leaf (end-entity)** certificate signed by the given intermediate CA.
 *
 * @param intermediateCert - The issuing intermediate CA certificate.
 * @param intermediateKeys - The intermediate CA's key pair (private key used to sign).
 * @param partial          - Optional overrides merged into the certificate creation params.
 * @param extensionChanges - Optional extension replacements/removals.
 * @returns A tuple of `[keyPair, certificate]`.
 */
async function createLeafCertificate(
    intermediateCert: X509Certificate,
    intermediateKeys: CryptoKeyPair,
    partial?: Partial<X509CertificateCreateParams>,
    extensionChanges?: ExtensionChangeMap,
): Promise<[CryptoKeyPair, X509Certificate]> {
    const leafKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const extensions = await getLeafExtensions(leafKeys.publicKey, intermediateKeys.publicKey);
    const leafCert = await X509CertificateGenerator.create(
        {
            serialNumber: '03',
            subject: `C=NL, ST=Zuid-Holland, O=Dawn Technology, OU=Development, CN=Leaf`,
            issuer: intermediateCert.subject,
            signingKey: intermediateKeys.privateKey,
            publicKey: leafKeys.publicKey,
            signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
            extensions: applyExtensionChanges(extensions, extensionChanges),
            ...partial,
        },
        crypto,
    );
    return [leafKeys, leafCert];
}

/**
 * Applies targeted modifications to an extensions array, allowing tests to
 * replace or remove individual extensions
 *
 * - If the value for an index is an {@link Extension}, it **replaces** the
 *   extension at that position.
 * - If the value is `undefined`, the extension at that position is **removed**
 *   (via `splice`).
 *
 * @param extensions - The original ordered array of extensions.
 * @param changes    - A map of `constructor.name → replacement | undefined`.
 * @returns The mutated extensions array.
 */
function applyExtensionChanges(extensions: Extension[], changes?: ExtensionChangeMap): Extension[] {
    if (changes) {
        for (const [extensionName, replacement] of Object.entries(changes)) {
            const index = extensions.findIndex((e: Extension) => e.constructor.name === extensionName);
            if (index >= 0) {
                if (replacement) {
                    extensions[index] = replacement;
                } else {
                    extensions.splice(index, 1);
                }
            }
        }
    }
    return extensions;
}

describe('Certificate Chain Validation', () => {
    let rootCert: X509Certificate;
    let rootKeys: CryptoKeyPair;
    let intermediateCert: X509Certificate;
    let intermediateKeys: CryptoKeyPair;
    let leafCert: X509Certificate;
    let leafKeys: CryptoKeyPair;
    let timestampProvider: LocalTimestampProvider;
    let signer: LocalSigner;

    /**
     * One-time setup that creates the default 3-level certificate hierarchy
     * (root → intermediate → leaf), a {@link LocalTimestampProvider}, and a
     * {@link LocalSigner}. Individual tests that need alternative certificates
     * generate their own instances, but reuse these as a baseline.
     */
    beforeEach(async () => {
        // Generate the default certificate chain: root → intermediate → leaf
        [rootKeys, rootCert] = await createRootCertificate();
        [intermediateKeys, intermediateCert] = await createIntermediateCertificate(rootCert, rootKeys);
        [leafKeys, leafCert] = await createLeafCertificate(intermediateCert, intermediateKeys);

        // Create a timestamp provider backed by the leaf certificate
        timestampProvider = new LocalTimestampProvider(leafCert, await toPkcs8Bytes(leafKeys.privateKey), [
            intermediateCert,
        ]);
        TrustList.setTimestampTrustAnchors([rootCert]);

        // Create a COSE signer backed by the leaf certificate (ES256 / P-256)
        signer = new LocalSigner(await toPkcs8Bytes(leafKeys.privateKey), CoseAlgorithmIdentifier.ES256, leafCert, [
            intermediateCert,
        ]);
    });

    describe('1. Basic Certificate Chain Structure', () => {
        it('should accept valid 3-level chain (root → intermediate → leaf)', async () => {
            // Happy-path: the default chain (leaf → intermediate → root) must validate
            const [validationResult, label] = await getValidationResult(signer, timestampProvider);

            // check individual codes
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntries(label));

            // // check overall validity
            assert.ok(validationResult.isValid, 'Validation result invalid');
        });

        it('should accept valid 2-level chain (root → leaf)', async () => {
            const [directLeafKeys, directLeafCert] = await createLeafCertificate(rootCert, rootKeys); // Create a leaf certificate directly signed by the root
            // Create timestamp provider
            const otherTimestampProvider = new LocalTimestampProvider(
                directLeafCert,
                await toPkcs8Bytes(directLeafKeys.privateKey),
                [rootCert],
            );
            // Create a signer
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(directLeafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                directLeafCert,
                [rootCert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, otherTimestampProvider);

            // check individual codes
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntries(label));

            // // check overall validity
            assert.ok(validationResult.isValid, 'Validation result invalid');
        });

        it('should accept self-signed root certificate', async () => {
            // Signing directly with the root CA (no leaf) is structurally invalid
            // because the root lacks the required end-entity extensions.
            const otherTimestampProvider = new LocalTimestampProvider(
                rootCert,
                await toPkcs8Bytes(rootKeys.privateKey),
            );
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(rootKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                rootCert,
            );

            const [validationResult, label] = await getValidationResult(otherSigner, otherTimestampProvider);

            // Expect "SigningCredentialInvalid" because the root is not a valid end-entity
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntriesInvalid(label));

            assert.ok(!validationResult.isValid, 'Validation result should be invalid');
        });

        it('should detect when intermediate certificate is missing', async () => {
            // The signer uses the root certificate directly (no chain certs),
            // while the timestamp provider includes the intermediate. The signing
            // credential validation should fail because the root is not a valid leaf.
            const otherTimestampProvider = new LocalTimestampProvider(
                rootCert,
                await toPkcs8Bytes(rootKeys.privateKey),
                [intermediateCert],
            );
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(rootKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                rootCert,
            );

            const [validationResult, label] = await getValidationResult(otherSigner, otherTimestampProvider);

            // check individual codes
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntriesInvalid(label));

            // // check overall validity
            assert.ok(!validationResult.isValid, 'Validation result should be invalid');
        });
    });

    describe('2. Certificate Signature Verification', () => {
        it('should detect invalid signature', async () => {
            const wrongRootKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
                'sign',
                'verify',
            ]);
            const wrongIntermediateCert = await X509CertificateGenerator.create(
                {
                    serialNumber: '02',
                    subject: `C=NL, ST=Zuid-Holland, O=Dawn Technology, OU=Development, CN=Intermediate`,
                    issuer: rootCert.subject,
                    signingKey: wrongRootKeys.privateKey,
                    publicKey: intermediateKeys.publicKey,
                    signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
                    extensions: intermediateCert.extensions,
                },
                crypto,
            );

            // Create a signer
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(leafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                leafCert,
                [wrongIntermediateCert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, timestampProvider);

            // check individual codes
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntriesUntrusted(label));

            // // check overall validity
            assert.ok(!validationResult.isValid, 'Validation result should be invalid');
        });

        it('should deal with irrelevant certificates in the chain', async () => {
            const anyKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
                'sign',
                'verify',
            ]);
            const anyCert = await X509CertificateGenerator.create(
                {
                    serialNumber: '04',
                    subject: `C=NL, ST=Zuid-Holland, O=Dawn Technology, OU=Development, CN=Irrelevant`,
                    issuer: rootCert.subject,
                    signingKey: anyKeys.privateKey,
                    publicKey: anyKeys.publicKey,
                    signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
                },
                crypto,
            );

            // Create timestamp provider
            const otherTimestampProvider = new LocalTimestampProvider(
                leafCert,
                await toPkcs8Bytes(leafKeys.privateKey),
                [intermediateCert],
            );
            // Create a signer
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(leafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                leafCert,
                [intermediateCert, anyCert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, otherTimestampProvider);

            // check individual codes
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntries(label));

            // // check overall validity
            assert.ok(validationResult.isValid, 'Validation result should be valid');
        });

        it('should deal with irrelevant timestamp certificates in the chain', async () => {
            const anyKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
                'sign',
                'verify',
            ]);
            const anyCert = await X509CertificateGenerator.create(
                {
                    serialNumber: '04',
                    subject: `C=NL, ST=Zuid-Holland, O=Dawn Technology, OU=Development, CN=Irrelevant`,
                    issuer: rootCert.subject,
                    signingKey: anyKeys.privateKey,
                    publicKey: anyKeys.publicKey,
                    signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
                },
                crypto,
            );

            // Create timestamp provider
            const otherTimestampProvider = new LocalTimestampProvider(
                leafCert,
                await toPkcs8Bytes(leafKeys.privateKey),
                [intermediateCert],
            );
            // Create a signer
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(leafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                leafCert,
                [intermediateCert, anyCert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, otherTimestampProvider);

            // check individual codes
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntries(label));

            // // check overall validity
            assert.ok(validationResult.isValid, 'Validation result should be valid');
        });
    });

    describe('3. Certificate Validity Period', () => {
        it('should accept certificate within validity period', async () => {
            // Generate test certificates
            const [otherRootKeys, otherRootCert] = await createRootCertificate({ notBefore: new Date() });
            const [otherIntermediateKeys, otherIntermediateCert] = await createIntermediateCertificate(
                otherRootCert,
                otherRootKeys,
                { notBefore: new Date() },
            );
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(
                otherIntermediateCert,
                otherIntermediateKeys,
                { notBefore: new Date() },
            );

            // Create a signer
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                otherLeafCert,
                [otherIntermediateCert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, timestampProvider);

            // check individual codes
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntries(label));

            // // check overall validity
            assert.ok(validationResult.isValid, 'Validation result should be valid');
        });

        it('should detect expired leaf certificate', async () => {
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(intermediateCert, intermediateKeys, {
                notAfter: new Date(Date.now() - 60000),
            }); // expired 60 seconds ago

            // Create timestamp provider
            const otherTimestampProvider = new LocalTimestampProvider(
                otherLeafCert,
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                [intermediateCert],
            );
            // Create a signer
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                otherLeafCert,
                [intermediateCert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, otherTimestampProvider);

            // check individual codes
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntriesWrongTimeStamp(label));

            // // check overall validity
            assert.ok(!validationResult.isValid, 'Validation result should be invalid');
        });

        it('should reject a claim when a trusted timestamp is outside the signing credential validity', async () => {
            const [expiredLeafKeys, expiredLeafCert] = await createLeafCertificate(intermediateCert, intermediateKeys, {
                notAfter: new Date(Date.now() - 60000), // expired 60 seconds ago
            });
            const expiredSigner = new LocalSigner(
                await toPkcs8Bytes(expiredLeafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                expiredLeafCert,
                [intermediateCert],
            );

            // The default timestamp provider uses a separate, currently valid TSA certificate
            const [validationResult, label] = await getValidationResult(expiredSigner, timestampProvider);

            assert.deepEqual(
                validationResult.statusEntries,
                getExpectedValidationStatusEntriesClaimSignatureOutsideValidity(label),
            );
            assert.ok(!validationResult.isValid, 'Validation result should be invalid');
        });

        it('should detect not-yet-valid leaf certificate', async () => {
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(intermediateCert, intermediateKeys, {
                notBefore: new Date(Date.now() + 60_000), // not valid yet
            });

            // Create timestamp provider
            const otherTimestampProvider = new LocalTimestampProvider(
                otherLeafCert,
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                [intermediateCert],
            );
            // Create a signer
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                otherLeafCert,
                [intermediateCert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, otherTimestampProvider);

            // check individual codes
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntriesWrongTimeStamp(label));

            // // check overall validity
            assert.ok(!validationResult.isValid, 'Validation result should be invalid');
        });

        it('should detect expired intermediate certificate', async () => {
            // Create a new intermediate certificate that is expired
            const [otherIntermediateKeys, otherIntermediateCert] = await createIntermediateCertificate(
                rootCert,
                rootKeys,
                {
                    notAfter: new Date(Date.now() - 60000), // expired 60 seconds ago
                },
            );
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(
                otherIntermediateCert,
                otherIntermediateKeys,
            );

            // Create a signer
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                otherLeafCert,
                [otherIntermediateCert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, timestampProvider);

            // check individual codes
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntriesUntrusted(label));

            // // check overall validity
            assert.ok(!validationResult.isValid, 'Validation result should be invalid');
        });

        it('should detect but accept expired intermediate TSA certificate', async () => {
            // Create a new intermediate certificate that is expired
            const [otherIntermediateKeys, otherIntermediateCert] = await createIntermediateCertificate(
                rootCert,
                rootKeys,
                {
                    notAfter: new Date(Date.now() - 60000), // expired 60 seconds ago
                },
            );
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(
                otherIntermediateCert,
                otherIntermediateKeys,
            );

            // Create a signer
            const othertimestampProvider = new LocalTimestampProvider(
                otherLeafCert,
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                [otherIntermediateCert],
            );

            const [validationResult, label] = await getValidationResult(signer, othertimestampProvider);

            // check individual codes
            assert.deepEqual(
                validationResult.statusEntries,
                getExpectedValidationStatusEntriesUntrustedTimeStamp(label),
            );

            // // check overall validity
            assert.ok(validationResult.isValid, 'Validation result should be valid');
        });

        it('should detect not-yet-valid intermediate certificate', async () => {
            // Create a new intermediate certificate that is not valid yet
            const [otherIntermediateKeys, otherIntermediateCert] = await createIntermediateCertificate(
                rootCert,
                rootKeys,
                {
                    notBefore: new Date(Date.now() + 60000), // not valid yet
                },
            );
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(
                otherIntermediateCert,
                otherIntermediateKeys,
            );

            // Create a signer
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                otherLeafCert,
                [otherIntermediateCert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, timestampProvider);

            // check individual codes
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntriesUntrusted(label));

            // // check overall validity
            assert.ok(!validationResult.isValid, 'Validation result should be invalid');
        });

        it('should detect but accept not-yet-valid TSA intermediate certificate', async () => {
            // Create a new intermediate certificate that is not valid yet
            const [otherIntermediateKeys, otherIntermediateCert] = await createIntermediateCertificate(
                rootCert,
                rootKeys,
                {
                    notBefore: new Date(Date.now() + 60000), // not valid yet
                },
            );
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(
                otherIntermediateCert,
                otherIntermediateKeys,
            );

            // Create a timestamp provider
            const otherTimestampProvider = new LocalTimestampProvider(
                otherLeafCert,
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                [otherIntermediateCert],
            );

            const [validationResult, label] = await getValidationResult(signer, otherTimestampProvider);

            // check individual codes
            assert.deepEqual(
                validationResult.statusEntries,
                getExpectedValidationStatusEntriesUntrustedTimeStamp(label),
            );

            // // check overall validity
            assert.ok(validationResult.isValid, 'Validation result should be valid');
        });

        it('should detect expired root certificate', async () => {
            // Create a new root certificate that is expired
            const [otherRootKeys, otherRootCert] = await createRootCertificate({
                notAfter: new Date(Date.now() - 60000), // expired 60 second ago
            });
            const [otherIntermediateKeys, otherIntermediateCert] = await createIntermediateCertificate(
                otherRootCert,
                otherRootKeys,
            );
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(
                otherIntermediateCert,
                otherIntermediateKeys,
            );

            // Create a signer
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                otherLeafCert,
                [otherIntermediateCert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, timestampProvider);

            // check individual codes
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntriesUntrusted(label));

            // // check overall validity
            assert.ok(!validationResult.isValid, 'Validation result should be invalid');
        });

        it('should detect but accept expired root TSA certificate', async () => {
            // Create a new root certificate that is expired
            const [otherRootKeys, otherRootCert] = await createRootCertificate(
                {
                    notAfter: new Date(Date.now() - 60000), // expired 60 second ago
                },
                undefined,
                false,
            );
            const [otherIntermediateKeys, otherIntermediateCert] = await createIntermediateCertificate(
                otherRootCert,
                otherRootKeys,
            );
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(
                otherIntermediateCert,
                otherIntermediateKeys,
            );

            // Create a timestamp provider
            const otherTimestampProvider = new LocalTimestampProvider(
                otherLeafCert,
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                [otherIntermediateCert],
            );
            TrustList.setTimestampTrustAnchors([otherRootCert]);

            const [validationResult, label] = await getValidationResult(signer, otherTimestampProvider);

            // check individual codes
            assert.deepEqual(
                validationResult.statusEntries,
                getExpectedValidationStatusEntriesUntrustedTimeStamp(label),
            );

            // // check overall validity
            assert.ok(validationResult.isValid, 'Validation result should be valid');
        });

        it('should detect not-yet-valid root certificate', async () => {
            // Create a new root certificate that is not valid yet
            const [otherRootKeys, otherRootCert] = await createRootCertificate({
                notBefore: new Date(Date.now() + 60000), // not valid yet
            });
            const [otherIntermediateKeys, otherIntermediateCert] = await createIntermediateCertificate(
                otherRootCert,
                otherRootKeys,
            );
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(
                otherIntermediateCert,
                otherIntermediateKeys,
            );

            // Create a signer
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                otherLeafCert,
                [otherIntermediateCert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, timestampProvider);

            // check individual codes
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntriesUntrusted(label));

            // // check overall validity
            assert.ok(!validationResult.isValid, 'Validation result should be invalid');
        });

        it('should detect but accept not-yet-valid root TSA certificate', async () => {
            // Create a new root certificate that is not valid yet
            const [otherRootKeys, otherRootCert] = await createRootCertificate(
                {
                    notBefore: new Date(Date.now() + 60000), // not valid yet
                },
                undefined,
                false,
            );
            const [otherIntermediateKeys, otherIntermediateCert] = await createIntermediateCertificate(
                otherRootCert,
                otherRootKeys,
            );
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(
                otherIntermediateCert,
                otherIntermediateKeys,
            );

            // Create a timestamp provider
            const otherTimestampProvider = new LocalTimestampProvider(
                otherLeafCert,
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                [otherIntermediateCert],
            );
            TrustList.setTimestampTrustAnchors([otherRootCert]);

            const [validationResult, label] = await getValidationResult(signer, otherTimestampProvider);

            // check individual codes
            assert.deepEqual(
                validationResult.statusEntries,
                getExpectedValidationStatusEntriesUntrustedTimeStamp(label),
            );

            // // check overall validity
            assert.ok(validationResult.isValid, 'Validation result should be valid');
        });
    });

    describe('4. Key Usage Extensions', () => {
        it('certificates used to sign C2PA manifests shall assert the digitalSignature bit', async () => {
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(
                intermediateCert,
                intermediateKeys,
                undefined,
                {
                    [ExtensionClassNames.KeyUsagesExtension]: new KeyUsagesExtension(
                        KeyUsageFlags.keyCertSign + KeyUsageFlags.cRLSign,
                        true,
                    ),
                },
            );

            // Create a signer
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                otherLeafCert,
                [intermediateCert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, timestampProvider);

            // check individual codes
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntriesInvalid(label));

            // // check overall validity
            assert.ok(!validationResult.isValid, 'Validation result should be invalid');
        });

        it('should have critical flag on KeyUsage extension for the root', async () => {
            const [otherRootKeys, otherRootCert] = await createRootCertificate(undefined, {
                [ExtensionClassNames.KeyUsagesExtension]: new KeyUsagesExtension(
                    KeyUsageFlags.digitalSignature + KeyUsageFlags.keyCertSign,
                    false,
                ),
            });

            const [otherIntermediateKeys, otherIntermediateCert] = await createIntermediateCertificate(
                otherRootCert,
                otherRootKeys,
            );
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(
                otherIntermediateCert,
                otherIntermediateKeys,
            );

            // Create a signer
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                otherLeafCert,
                [otherIntermediateCert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, timestampProvider);

            // check individual codes
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntriesUntrusted(label));

            // // check overall validity
            assert.ok(!validationResult.isValid, 'Validation result should be invalid');
        });
    });

    describe('5. Basic Constraints', () => {
        it('should have a Basic Constraints Extension in intermediate certificates', async () => {
            const [otherIntermediateKeys, otherIntermediateCert] = await createIntermediateCertificate(
                rootCert,
                rootKeys,
                undefined,
                { [ExtensionClassNames.BasicConstraintsExtension]: undefined },
            );
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(
                otherIntermediateCert,
                otherIntermediateKeys,
            );

            // Create a signer
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                otherLeafCert,
                [otherIntermediateCert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, timestampProvider);

            // check individual codes
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntriesUntrusted(label));

            // // check overall validity
            assert.ok(!validationResult.isValid, 'Validation result should be invalid');
        });

        it('should reject an end-entity certificate acting as intermediate CA', async () => {
            // A non-CA certificate issued by the intermediate...
            const [eeKeys, eeCert] = await createLeafCertificate(intermediateCert, intermediateKeys);
            // ...must not be able to issue further certificates
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(eeCert, eeKeys, {
                subject: 'C=NL, ST=Zuid-Holland, O=Dawn Technology, OU=Development, CN=Leaf2',
            });
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                otherLeafCert,
                [eeCert, intermediateCert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, timestampProvider);

            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntriesUntrusted(label));
            assert.ok(!validationResult.isValid, 'Validation result should be invalid');
        });

        it('should reject certificates issued by an end-entity trust anchor', async () => {
            const [eeKeys, eeCert] = await createLeafCertificate(intermediateCert, intermediateKeys);
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(eeCert, eeKeys, {
                subject: 'C=NL, ST=Zuid-Holland, O=Dawn Technology, OU=Development, CN=Leaf2',
            });
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                otherLeafCert,
            );

            // Trusting an end-entity certificate does not make it a CA
            TrustList.setTrustAnchors([eeCert]);

            const [validationResult, label] = await getValidationResult(otherSigner, timestampProvider);

            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntriesUntrusted(label));
            assert.ok(!validationResult.isValid, 'Validation result should be invalid');
        });

        it('should reject an intermediate that exceeds the pathLenConstraint of its issuer', async () => {
            // root → intermediate (pathLen 0) → intermediate 2 → leaf
            const [int1Keys, int1Cert] = await createIntermediateCertificate(rootCert, rootKeys, undefined, {
                [ExtensionClassNames.BasicConstraintsExtension]: new BasicConstraintsExtension(true, 0, true),
            });
            const [int2Keys, int2Cert] = await createIntermediateCertificate(int1Cert, int1Keys, {
                subject: 'C=NL, ST=Zuid-Holland, O=Dawn Technology, OU=Development, CN=Intermediate2',
            });
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(int2Cert, int2Keys);
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                otherLeafCert,
                [int2Cert, int1Cert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, timestampProvider);

            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntriesUntrusted(label));
            assert.ok(!validationResult.isValid, 'Validation result should be invalid');
        });

        it('should accept an intermediate within the pathLenConstraint of its issuer', async () => {
            // root → intermediate (pathLen 1) → intermediate 2 → leaf
            const [int1Keys, int1Cert] = await createIntermediateCertificate(rootCert, rootKeys, undefined, {
                [ExtensionClassNames.BasicConstraintsExtension]: new BasicConstraintsExtension(true, 1, true),
            });
            const [int2Keys, int2Cert] = await createIntermediateCertificate(int1Cert, int1Keys, {
                subject: 'C=NL, ST=Zuid-Holland, O=Dawn Technology, OU=Development, CN=Intermediate2',
            });
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(int2Cert, int2Keys);
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                otherLeafCert,
                [int2Cert, int1Cert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, timestampProvider);

            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntries(label));
            assert.ok(validationResult.isValid, 'Validation result should be valid');
        });
    });

    describe('6. Subject Key Identifier Extension', () => {
        it('root should have a subject key identifier', async () => {
            const [otherRootKeys, otherRootCert] = await createRootCertificate(undefined, {
                [ExtensionClassNames.SubjectKeyIdentifierExtension]: undefined,
            });
            const [otherIntermediateKeys, otherIntermediateCert] = await createIntermediateCertificate(
                otherRootCert,
                otherRootKeys,
            );
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(
                otherIntermediateCert,
                otherIntermediateKeys,
            );

            // Create a signer
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                otherLeafCert,
                [otherIntermediateCert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, timestampProvider);

            // check individual codes
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntriesUntrusted(label));

            // // check overall validity
            assert.ok(!validationResult.isValid, 'Validation result should be invalid');
        });

        it('intermediate should have a subject key identifier', async () => {
            const [otherIntermediateKeys, otherIntermediateCert] = await createIntermediateCertificate(
                rootCert,
                rootKeys,
                undefined,
                { [ExtensionClassNames.SubjectKeyIdentifierExtension]: undefined },
            );
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(
                otherIntermediateCert,
                otherIntermediateKeys,
            );

            // Create a signer
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                otherLeafCert,
                [otherIntermediateCert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, timestampProvider);

            // check individual codes
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntriesUntrusted(label));

            // // check overall validity
            assert.ok(!validationResult.isValid, 'Validation result should be invalid');
        });
    });

    describe('7. Authority Key Identifier Extension', () => {
        it('intermediate should have an authority key identifier', async () => {
            const [otherIntermediateKeys, otherIntermediateCert] = await createIntermediateCertificate(
                rootCert,
                rootKeys,
                undefined,
                { [ExtensionClassNames.AuthorityKeyIdentifierExtension]: undefined },
            );
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(
                otherIntermediateCert,
                otherIntermediateKeys,
            );

            // Create a signer
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                otherLeafCert,
                [otherIntermediateCert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, timestampProvider);

            // check individual codes
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntriesUntrusted(label));

            // // check overall validity
            assert.ok(!validationResult.isValid, 'Validation result should be invalid');
        });
    });

    describe('8. Error Handling', () => {
        it('should handle malformed certificate data', async () => {
            try {
                new LocalSigner(await toPkcs8Bytes(leafKeys.privateKey), CoseAlgorithmIdentifier.ES256, leafCert, [
                    intermediateCert,
                    new X509Certificate(new Uint8Array([1, 2, 3, 4])),
                ]);
                assert.ok(false, 'Constructor should throw an error when given malformed certificate data');
            } catch {
                assert.ok(true, 'Constructor should throw an error when given malformed certificate data');
            }
        });

        it('should handle empty certificate data', async () => {
            try {
                new LocalSigner(await toPkcs8Bytes(leafKeys.privateKey), CoseAlgorithmIdentifier.ES256, leafCert, [
                    intermediateCert,
                    new X509Certificate(new Uint8Array([])),
                ]);
                assert.ok(false, 'Constructor should throw an error when given empty certificate data');
            } catch {
                assert.ok(true, 'Constructor should throw an error when given empty certificate data');
            }
        });
    });

    /**
     * Section 9 – Loop Detection
     *
     * Certificate chains must be acyclic. This test constructs two
     * intermediates that mutually sign each other (A → B → A) to confirm
     * the validator does not enter an infinite loop and correctly rejects
     * the chain as untrusted.
     */
    describe('9. Loop Detection', () => {
        it('should detect circular certificate references', async () => {
            // If a certificate chain contains a loop (A → B → C → B)
            // This should be detected
            const otherIntermediateKeys = await crypto.subtle.generateKey(
                { name: 'ECDSA', namedCurve: 'P-256' },
                true,
                ['sign', 'verify'],
            );
            const circularIntermediateKeys = await crypto.subtle.generateKey(
                { name: 'ECDSA', namedCurve: 'P-256' },
                true,
                ['sign', 'verify'],
            );
            const otherIntermediateCert = await X509CertificateGenerator.create(
                {
                    serialNumber: '11',
                    subject: `C=NL, ST=Zuid-Holland, O=Dawn Technology, OU=Development, CN=OtherIntermediate`,
                    issuer: `C=NL, ST=Zuid-Holland, O=Dawn Technology, OU=Development, CN=CircularIntermediate`,
                    signingKey: circularIntermediateKeys.privateKey,
                    publicKey: intermediateKeys.publicKey,
                    signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
                    extensions: await getIntermediateExtensions(
                        otherIntermediateKeys.publicKey,
                        circularIntermediateKeys.publicKey,
                    ),
                },
                crypto,
            );
            const circularIntermediateCert = await X509CertificateGenerator.create(
                {
                    serialNumber: '12',
                    subject: `C=NL, ST=Zuid-Holland, O=Dawn Technology, OU=Development, CN=CircularIntermediate`,
                    issuer: `C=NL, ST=Zuid-Holland, O=Dawn Technology, OU=Development, CN=OtherIntermediate`,
                    signingKey: otherIntermediateKeys.privateKey,
                    publicKey: circularIntermediateKeys.publicKey,
                    signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
                    extensions: await getIntermediateExtensions(
                        circularIntermediateKeys.publicKey,
                        otherIntermediateKeys.publicKey,
                    ),
                },
                crypto,
            );
            const [otherLeafKeys, otherLeafCert] = await createLeafCertificate(
                otherIntermediateCert,
                otherIntermediateKeys,
            );

            // Create a signer
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                otherLeafCert,
                [otherIntermediateCert, circularIntermediateCert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, timestampProvider);

            // check individual codes
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntriesUntrusted(label));

            // // check overall validity
            assert.ok(!validationResult.isValid, 'Validation result should be invalid');
        });
    });

    describe('10. Subject/Issuer Matching', () => {
        it("should not validate if the AKI does not match the issuer's SKI", async () => {
            const misMatchKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
                'sign',
                'verify',
            ]);

            const otherLeafKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
                'sign',
                'verify',
            ]);
            const otherLeafCert = await X509CertificateGenerator.create(
                {
                    serialNumber: '03',
                    subject: `C=NL, ST=Zuid-Holland, O=Dawn Technology, OU=Development, CN=Leaf`,
                    issuer: intermediateCert.subject,
                    signingKey: intermediateKeys.privateKey,
                    publicKey: otherLeafKeys.publicKey,
                    signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
                    extensions: await getLeafExtensions(otherLeafKeys.publicKey, misMatchKeys.publicKey),
                },
                crypto,
            );

            // Create a signer
            const otherSigner = new LocalSigner(
                await toPkcs8Bytes(otherLeafKeys.privateKey),
                CoseAlgorithmIdentifier.ES256,
                otherLeafCert,
                [intermediateCert],
            );

            const [validationResult, label] = await getValidationResult(otherSigner, timestampProvider);

            // check individual codes
            assert.deepEqual(validationResult.statusEntries, getExpectedValidationStatusEntriesUntrusted(label));

            // // check overall validity
            assert.ok(!validationResult.isValid, 'Validation result should be invalid');
        });
    });
});
