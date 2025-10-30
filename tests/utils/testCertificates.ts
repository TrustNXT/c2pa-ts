import * as fs from 'node:fs/promises';
import { X509Certificate } from '@peculiar/x509';
import { CoseAlgorithmIdentifier, LocalSigner, Signer } from '../../src/cose';
import { ValidationStatusCode } from '../../src/manifest';
import { LocalTimestampProvider } from '../../src/rfc3161';

export interface TestCertificate {
    name: string;
    certificateFile: string;
    privateKeyFile: string;
    algorithm: CoseAlgorithmIdentifier;
}

export const TEST_CERTIFICATES: TestCertificate[] = [
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

export interface LoadedCertificate {
    signer: Signer;
    timestampProvider: LocalTimestampProvider;
}

export async function loadTestCertificate(certificateInfo: TestCertificate): Promise<LoadedCertificate> {
    // Load the certificate
    const x509Certificate = new X509Certificate(await fs.readFile(certificateInfo.certificateFile));

    // Load and parse the private key
    const privateKeyData = await fs.readFile(certificateInfo.privateKeyFile);
    const base64 = privateKeyData
        .toString()
        .replace(/-{5}(BEGIN|END) .*-{5}/gm, '') // Remove PEM headers
        .replace(/\s/gm, ''); // Remove whitespace
    const privateKey = new Uint8Array(Buffer.from(base64, 'base64'));

    // Create timestamp provider
    const timestampProvider = new LocalTimestampProvider(x509Certificate, privateKey);

    const signer = new LocalSigner(privateKey, certificateInfo.algorithm, x509Certificate);

    return { signer, timestampProvider };
}

// Helper function to generate expected validation status entries for signing tests
export function getExpectedValidationStatusEntries(manifestLabel: string | undefined) {
    return [
        {
            code: ValidationStatusCode.TimeStampTrusted,
            explanation: undefined,
            url: `self#jumbf=/c2pa/${manifestLabel}/c2pa.signature`,
            success: true,
        },
        {
            code: ValidationStatusCode.SigningCredentialTrusted,
            explanation: undefined,
            url: `self#jumbf=/c2pa/${manifestLabel}/c2pa.signature`,
            success: true,
        },
        {
            code: ValidationStatusCode.ClaimSignatureValidated,
            explanation: undefined,
            url: `self#jumbf=/c2pa/${manifestLabel}/c2pa.signature`,
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
            url: `self#jumbf=/c2pa/${manifestLabel}/c2pa.assertions/c2pa.hash.data`,
            success: true,
        },
    ];
}
