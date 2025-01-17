import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { X509Certificate } from '@peculiar/x509';
import { CoseAlgorithmIdentifier } from '../src/cose';
import { Signature } from '../src/cose/Signature';
import { SigStructure } from '../src/cose/SigStructure';
import { CoseSignature } from '../src/cose/types';
import { Crypto } from '../src/crypto';
import { CBORBox } from '../src/jumbf';
import { ValidationStatusCode } from '../src/manifest';
import { LocalTimestampProvider } from '../src/rfc3161';

describe('Timestamp Tests', () => {
    let signature: Signature;
    let mockTimestampProvider: LocalTimestampProvider;
    let signingPrivateKey: Uint8Array;
    let x509Certificate: X509Certificate;

    beforeEach(async () => {
        // Load test certificate and private key
        x509Certificate = new X509Certificate(await fs.readFile('tests/fixtures/sample_es256.pem'));
        const privateKeyData = await fs.readFile('tests/fixtures/sample_es256.key');
        const base64 = privateKeyData
            .toString()
            .replace(/-{5}(BEGIN|END) .*-{5}/gm, '')
            .replace(/\s/gm, '');
        const privateKey = new Uint8Array(Buffer.from(base64, 'base64'));
        signingPrivateKey = privateKey;

        // Create protected bucket with algorithm and certificate chain
        const protectedBucket = {
            1: CoseAlgorithmIdentifier.ES256,
            33: [x509Certificate.rawData],
        };
        const protectedBytes = CBORBox.encoder.encode(protectedBucket);

        // Create and sign the payload
        const payload = new Uint8Array([1, 2, 3, 4]);
        const sigStructure = new SigStructure('Signature1', protectedBytes, payload);
        const toBeSigned = sigStructure.encode();
        const mockSignature = await Crypto.sign(toBeSigned, privateKey, {
            name: 'ECDSA',
            namedCurve: 'P-256',
            hash: 'SHA-256',
        });

        const mockCoseSignature: CoseSignature = [
            protectedBytes,
            {}, // Unprotected header
            null, // External AAD
            mockSignature,
        ];

        signature = Signature.readFromJUMBFData(mockCoseSignature);
        mockTimestampProvider = new LocalTimestampProvider(x509Certificate, privateKey);
    });

    describe('Timestamp Validation', () => {
        it('should validate timestamp with correct hash algorithm', async () => {
            const payload = new Uint8Array([1, 2, 3, 4]);
            await signature.sign(signingPrivateKey, payload, mockTimestampProvider);

            const result = await signature.validate(payload);

            assert.ok(result.statusEntries.some(e => e.code === ValidationStatusCode.TimeStampTrusted));
            assert.ok(result.isValid);
        });

        it('should validate timestamp within certificate validity period', async () => {
            const payload = new Uint8Array([1, 2, 3, 4]);
            await signature.sign(signingPrivateKey, payload, mockTimestampProvider);

            const result = await signature.validate(payload);

            assert.ok(result.statusEntries.some(e => e.code === ValidationStatusCode.SigningCredentialTrusted));
            assert.ok(result.isValid);
        });

        it('should validate timestamp signature', async () => {
            const payload = new Uint8Array([1, 2, 3, 4]);
            await signature.sign(signingPrivateKey, payload, mockTimestampProvider);

            const result = await signature.validate(payload);

            assert.ok(result.statusEntries.some(e => e.code === ValidationStatusCode.ClaimSignatureValidated));
            assert.ok(result.isValid);
        });

        it('should handle missing timestamp provider', async () => {
            const payload = new Uint8Array([1, 2, 3, 4]);
            await signature.sign(signingPrivateKey, payload);

            const result = await signature.validate(payload);

            assert.ok(!result.statusEntries.some(e => e.code === ValidationStatusCode.TimeStampTrusted));
        });

        it('should handle multiple timestamp tokens', async () => {
            const payload = new Uint8Array([1, 2, 3, 4]);
            await signature.sign(signingPrivateKey, payload, mockTimestampProvider);

            const secondTimestampProvider = new LocalTimestampProvider(x509Certificate, signingPrivateKey);
            await signature.sign(signingPrivateKey, payload, secondTimestampProvider);

            const result = await signature.validate(payload);

            assert.ok(result.statusEntries.some(e => e.code === ValidationStatusCode.TimeStampTrusted));
            assert.ok(result.statusEntries.some(e => e.code === ValidationStatusCode.ClaimSignatureValidated));
            assert.ok(result.isValid);
        });

        it('should validate timestamp matches signed content', async () => {
            const payload = new Uint8Array([1, 2, 3, 4]);
            await signature.sign(signingPrivateKey, payload, mockTimestampProvider);

            const differentPayload = new Uint8Array([5, 6, 7, 8]);
            const result = await signature.validate(differentPayload);

            assert.ok(result.statusEntries.some(e => e.code === ValidationStatusCode.ClaimSignatureMismatch));
            assert.ok(!result.isValid);
        });

        it('should detect corrupted timestamp tokens', async () => {
            const payload = new Uint8Array([1, 2, 3, 4]);

            await signature.sign(signingPrivateKey, payload, mockTimestampProvider);

            const corruptedBucket = {
                1: CoseAlgorithmIdentifier.ES256,
                33: [x509Certificate.rawData],
                sigTst: {
                    tstTokens: [{ val: new Uint8Array([0x30, 0x00]) }], // Invalid ASN.1
                },
            };
            signature.rawProtectedBucket = CBORBox.encoder.encode(corruptedBucket);

            const result = await signature.validate(payload);

            assert.ok(result.statusEntries.some(e => e.code === ValidationStatusCode.TimeStampMismatch));
            assert.ok(!result.isValid);
        });
    });
});
