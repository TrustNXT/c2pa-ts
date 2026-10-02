import * as fs from 'node:fs/promises';
import { LocalIdentitySigner } from '../../src/cawg';
import { NamedActorRole, SignatureType, VerifiedIdentity, VerifiedIdentityType } from '../../src/cawg/types';
import { CoseAlgorithmIdentifier } from '../../src/cose';
import { ValidationStatusCode } from '../../src/manifest';

export interface TestIdentity {
    name: string;
    privateKeyFile: string;
    algorithm: CoseAlgorithmIdentifier;
    verifiedIdentity: VerifiedIdentity | VerifiedIdentity[];
    issuerDid?: string;
    roles: NamedActorRole[];
    sigType: SignatureType;
}

export const TEST_IDENTITIES: TestIdentity[] = [
    {
        name: 'ES256 sample identity',
        privateKeyFile: 'tests/fixtures/identity/sample_es256.pem',
        algorithm: CoseAlgorithmIdentifier.ES256,
        verifiedIdentity: {
            type: VerifiedIdentityType.SocialMedia,
            name: 'Sample Creator',
            username: 'sample-creator',
            uri: 'https://example.com/sample-creator',
            provider: {
                id: 'https://example.com',
                name: 'Example Identity Provider',
            },
            verifiedAt: new Date().toISOString(),
        },
        sigType: SignatureType.IdentityClaimsAggregation,
        roles: [NamedActorRole.Creator],
    },
    {
        name: 'Ed25519 sample identity',
        privateKeyFile: 'tests/fixtures/identity/sample_ed25519.pem',
        algorithm: CoseAlgorithmIdentifier.Ed25519,
        verifiedIdentity: {
            type: VerifiedIdentityType.SocialMedia,
            name: 'Sample Creator',
            username: 'sample-creator',
            uri: 'https://example.com/sample-creator',
            provider: {
                id: 'https://example.com',
                name: 'Example Identity Provider',
            },
            verifiedAt: new Date().toISOString(),
        },
        sigType: SignatureType.IdentityClaimsAggregation,
        roles: [NamedActorRole.Editor],
    },
];

export async function loadIdentitySigner(testIdentityInfo: TestIdentity): Promise<LocalIdentitySigner> {
    // Load and parse the private key
    const privateKeyData = (await fs.readFile(testIdentityInfo.privateKeyFile)).toString();
    const beginMatch = /-----BEGIN [^-]+-----/.exec(privateKeyData);
    const endMatch = /-----END [^-]+-----/.exec(privateKeyData);

    if (!beginMatch || !endMatch) {
        throw new Error('Invalid PEM format: missing BEGIN or END marker');
    }

    const base64 = privateKeyData
        .replace(/-----BEGIN [^-]+-----/, '')
        .replace(/-----END [^-]+-----/, '')
        .replace(/\s/g, '');

    const privateKey = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    return new LocalIdentitySigner(privateKey, testIdentityInfo.algorithm, testIdentityInfo);
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

export function getExpectedValidationStatusEntriesInvalid(manifestLabel: string | undefined) {
    return [
        {
            code: ValidationStatusCode.TimeStampTrusted,
            explanation: undefined,
            url: `self#jumbf=/c2pa/${manifestLabel}/c2pa.signature`,
            success: true,
        },
        {
            code: ValidationStatusCode.SigningCredentialInvalid,
            explanation: undefined,
            url: `self#jumbf=/c2pa/${manifestLabel}/c2pa.signature`,
            success: false,
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
    ];
}

export function getExpectedValidationStatusEntriesUntrusted(manifestLabel: string | undefined) {
    return [
        {
            code: ValidationStatusCode.TimeStampTrusted,
            explanation: undefined,
            url: `self#jumbf=/c2pa/${manifestLabel}/c2pa.signature`,
            success: true,
        },
        {
            code: ValidationStatusCode.SigningCredentialUntrusted,
            explanation: undefined,
            url: `self#jumbf=/c2pa/${manifestLabel}/c2pa.signature`,
            success: false,
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
    ];
}

export function getExpectedValidationStatusEntriesWrongTimeStamp(manifestLabel: string | undefined) {
    return [
        {
            code: ValidationStatusCode.TimeStampOutsideValidity,
            explanation: 'Timestamp outside signer certificate validity period',
            url: `self#jumbf=/c2pa/${manifestLabel}/c2pa.signature`,
            success: false,
        },
        {
            code: ValidationStatusCode.SigningCredentialExpired,
            explanation: undefined,
            url: `self#jumbf=/c2pa/${manifestLabel}/c2pa.signature`,
            success: false,
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
    ];
}
