import assert from 'node:assert/strict';
import { describe, it } from 'bun:test';
import type { DIDDocument } from 'did-resolver';
import { JsonWebKey as DidResolverJsonWebKey } from 'did-resolver';
import {
    didResolver,
    IdentityClaimsAggregation,
    NamedActorRole,
    SignatureType,
    SUPPORTED_DID_METHODS,
    VerifiedIdentityType,
    type SignerPayloadMap,
} from '../../src/cawg';
import { IdentityClaimsAggregationValidator } from '../../src/cawg/identity-claims-aggregation-validator';
import { CoseAlgorithmIdentifier } from '../../src/cose';
import { SigStructure } from '../../src/cose/SigStructure';
import { CBORBox } from '../../src/jumbf';
import { AssertionLabels, ValidationResult, ValidationStatusCode } from '../../src/manifest';

type SupportedDidMethod = (typeof SUPPORTED_DID_METHODS)[number];

interface DidFixture {
    issuerDid: string;
    didDocument: DIDDocument;
    coseAlg: CoseAlgorithmIdentifier;
    sign: (payload: Uint8Array) => Promise<Uint8Array>;
}

interface ResolverFixture {
    did: string;
    publicJwk: JsonWebKey;
}

const DID_ERROR_CODES = [
    ValidationStatusCode.IcaInvalidIssuer,
    ValidationStatusCode.IcaDidUnsupportedMethod,
    ValidationStatusCode.IcaDidUnavailable,
    ValidationStatusCode.IcaInvalidDidDocument,
] as const;

function createDidJwk(publicJwk: JsonWebKey): string {
    const canonicalJwk = Object.fromEntries(Object.entries(publicJwk).sort(([a], [b]) => a.localeCompare(b)));
    const didPayload = Buffer.from(JSON.stringify(canonicalJwk), 'utf8').toString('base64url');
    return `did:jwk:${didPayload}`;
}

function base64UrlToBytes(base64Url: string): Uint8Array {
    return new Uint8Array(Buffer.from(base64Url, 'base64url'));
}

function toBase58(bytes: Uint8Array): string {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let value = 0n;

    for (const byte of bytes) {
        value = (value << 8n) + BigInt(byte);
    }

    let encoded = '';
    while (value > 0n) {
        const mod = Number(value % 58n);
        encoded = alphabet[mod] + encoded;
        value /= 58n;
    }

    // Preserve leading zero bytes as leading '1' chars.
    for (const byte of bytes) {
        if (byte !== 0) {
            break;
        }
        encoded = `1${encoded}`;
    }

    return encoded || '1';
}

function createDidKeyFromPublicKeyBytes(publicKeyBytes: Uint8Array): string {
    // did:key for Ed25519 uses multicodec prefix 0xed01 before base58btc encoding.
    const prefixedKeyBytes = new Uint8Array(2 + publicKeyBytes.length);
    prefixedKeyBytes[0] = 0xed;
    prefixedKeyBytes[1] = 0x01;
    prefixedKeyBytes.set(publicKeyBytes, 2);
    return `did:key:z${toBase58(prefixedKeyBytes)}`;
}

async function createResolverFixture(method: Exclude<SupportedDidMethod, 'did:web'>): Promise<ResolverFixture> {
    if (method === 'did:key') {
        const keyPair = await crypto.subtle.generateKey(
            {
                name: 'Ed25519',
            },
            true,
            ['sign', 'verify'],
        );

        const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
        const x = publicJwk.x;

        if (!x) {
            throw new Error('Missing x coordinate on Ed25519 JWK');
        }

        return {
            did: createDidKeyFromPublicKeyBytes(base64UrlToBytes(x)),
            publicJwk,
        };
    }

    const keyPair = await crypto.subtle.generateKey(
        {
            name: 'ECDSA',
            namedCurve: 'P-256',
        },
        true,
        ['sign', 'verify'],
    );
    const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

    return {
        did: createDidJwk(publicJwk),
        publicJwk,
    };
}

async function createEcFixture(method: 'did:web' | 'did:jwk'): Promise<DidFixture> {
    const keyPair = await crypto.subtle.generateKey(
        {
            name: 'ECDSA',
            namedCurve: 'P-256',
        },
        true,
        ['sign', 'verify'],
    );

    const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const issuerDid = method === 'did:web' ? 'did:web:issuer.example.com' : createDidJwk(publicJwk);
    const methodId = `${issuerDid}#key-1`;

    return {
        issuerDid,
        didDocument: {
            id: issuerDid,
            verificationMethod: [
                {
                    id: methodId,
                    type: 'JsonWebKey2020',
                    controller: issuerDid,
                    publicKeyJwk: publicJwk as unknown as DidResolverJsonWebKey,
                },
            ],
            assertionMethod: ['#key-1'],
        },
        coseAlg: CoseAlgorithmIdentifier.ES256,
        sign: async payload =>
            new Uint8Array(
                await crypto.subtle.sign(
                    {
                        name: 'ECDSA',
                        hash: 'SHA-256',
                    },
                    keyPair.privateKey,
                    Buffer.from(payload),
                ),
            ),
    };
}

async function createDidKeyFixture(): Promise<DidFixture> {
    const keyPair = await crypto.subtle.generateKey(
        {
            name: 'Ed25519',
        },
        true,
        ['sign', 'verify'],
    );

    const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const x = publicJwk.x;

    if (!x) {
        throw new Error('Missing x coordinate on Ed25519 JWK');
    }

    const publicKeyBase58 = toBase58(base64UrlToBytes(x));
    const issuerDid = `did:key:z${publicKeyBase58}`;
    const methodId = `${issuerDid}#key-1`;

    return {
        issuerDid,
        didDocument: {
            id: issuerDid,
            verificationMethod: [
                {
                    id: methodId,
                    type: 'Ed25519VerificationKey2018',
                    controller: issuerDid,
                    publicKeyBase58,
                },
            ],
            assertionMethod: ['#key-1'],
        },
        coseAlg: CoseAlgorithmIdentifier.Ed25519,
        sign: async payload =>
            new Uint8Array(await crypto.subtle.sign('Ed25519', keyPair.privateKey, Buffer.from(payload))),
    };
}

async function createFixture(method: SupportedDidMethod): Promise<DidFixture> {
    if (method === 'did:key') {
        return createDidKeyFixture();
    }

    return createEcFixture(method);
}

function installDidResolverMock(issuerDid: string, didDocument: DIDDocument): () => void {
    const originalResolve = didResolver.resolve.bind(didResolver);

    didResolver.resolve = async (did: string) => {
        if (did !== issuerDid) {
            return originalResolve(did);
        }

        return {
            didDocument,
            didResolutionMetadata: {},
            didDocumentMetadata: {},
        };
    };

    return () => {
        didResolver.resolve = originalResolve;
    };
}

async function createCoseSign1(
    payload: Uint8Array,
    coseAlg: CoseAlgorithmIdentifier,
    sign: (toBeSigned: Uint8Array) => Promise<Uint8Array>,
): Promise<Uint8Array> {
    const protectedHeaderBytes = CBORBox.encoder.encode({
        1: coseAlg,
        3: 'application/vc',
    });

    const toBeSigned = new SigStructure('Signature1', protectedHeaderBytes, payload).encode();
    const signature = await sign(toBeSigned);

    const cborBox = new CBORBox();
    cborBox.tag = 18;
    cborBox.content = [protectedHeaderBytes, {}, payload, signature];
    cborBox.generateRawContent();
    return cborBox.rawContent!;
}

function tamperSignature(coseSign1: Uint8Array): Uint8Array {
    const decoded = CBORBox.decoder.decode(coseSign1) as {
        value: [Uint8Array, Record<number | string, unknown>, Uint8Array, Uint8Array];
    };

    const [protectedHeaderBytes, unprotectedHeader, payload, signature] = decoded.value;
    const tamperedSignature = signature.slice();

    if (tamperedSignature.length === 0) {
        throw new Error('Cannot tamper empty signature');
    }

    tamperedSignature[0] ^= 0xff;

    const cborBox = new CBORBox();
    cborBox.tag = 18;
    cborBox.content = [protectedHeaderBytes, unprotectedHeader, payload, tamperedSignature];
    cborBox.generateRawContent();

    return cborBox.rawContent!;
}

function makeSignerPayload(): SignerPayloadMap {
    return {
        referenced_assertions: [
            {
                url: 'self#jumbf=c2pa.assertions/c2pa.hash.data',
                hash: new Uint8Array([1, 2, 3, 4]),
            },
        ],
        sig_type: SignatureType.IdentityClaimsAggregation,
        role: [NamedActorRole.Creator],
    };
}

function failedCodes(result: ValidationResult): ValidationStatusCode[] {
    return result.statusEntries.filter(entry => !entry.success).map(entry => entry.code);
}

describe('DID resolver (no mock)', () => {
    for (const method of SUPPORTED_DID_METHODS.filter(
        (candidate): candidate is Exclude<SupportedDidMethod, 'did:web'> => candidate !== 'did:web',
    )) {
        it(`resolves ${method} using real did resolver`, async () => {
            const fixture = await createResolverFixture(method);
            const result = await didResolver.resolve(fixture.did);

            assert.ok(
                !result.didResolutionMetadata.error,
                result.didResolutionMetadata.error ?? 'Unknown DID resolution error',
            );
            assert.ok(result.didDocument, 'expected DID document from resolver');
            assert.equal(result.didDocument?.id, fixture.did);

            const verificationMethods = result.didDocument?.verificationMethod;
            assert.ok(Array.isArray(verificationMethods) && verificationMethods.length > 0);

            if (method === 'did:key') {
                assert.ok(
                    verificationMethods.some(vm => 'publicKeyBase58' in vm || 'publicKeyMultibase' in vm),
                    'expected did:key verification method with key material',
                );
            } else {
                const didJwkMethod = verificationMethods.find(
                    vm => 'publicKeyJwk' in vm && typeof vm.publicKeyJwk === 'object' && vm.publicKeyJwk,
                );
                assert.ok(didJwkMethod, 'expected did:jwk verification method with publicKeyJwk');
                assert.equal((didJwkMethod.publicKeyJwk as JsonWebKey).kty, fixture.publicJwk.kty);
            }
        });
    }
});

describe('DID validation', () => {
    for (const method of SUPPORTED_DID_METHODS) {
        it(`validates issuer DID resolution and signature for ${method}`, async () => {
            const fixture = await createFixture(method);
            const signerPayload = makeSignerPayload();

            const credential = IdentityClaimsAggregation.createIcaCredential(
                fixture.issuerDid,
                {
                    type: VerifiedIdentityType.Website,
                    uri: 'https://issuer.example.com',
                    provider: { name: 'Example Provider' },
                    verifiedAt: new Date().toISOString(),
                },
                signerPayload,
                new Date(),
            );

            const payload = new TextEncoder().encode(JSON.stringify(credential));
            const coseSign1 = await createCoseSign1(payload, fixture.coseAlg, fixture.sign);
            const restoreDidResolver = installDidResolverMock(fixture.issuerDid, fixture.didDocument);

            try {
                const icaValidator = new IdentityClaimsAggregationValidator(
                    coseSign1,
                    signerPayload,
                    AssertionLabels.identity,
                );
                const result = await icaValidator.validateIcaCredential();
                const errors = failedCodes(result);

                for (const code of DID_ERROR_CODES) {
                    assert.ok(!errors.includes(code), `unexpected failure code: ${code}`);
                }

                assert.ok(!errors.includes(ValidationStatusCode.IcaSignatureMismatch));
                assert.equal(result.isValid, true, `expected validation success but got: ${errors.join(', ')}`);
            } finally {
                restoreDidResolver();
            }
        });

        it(`reports signature mismatch for tampered COSE signature for ${method}`, async () => {
            const fixture = await createFixture(method);
            const signerPayload = makeSignerPayload();

            const credential = IdentityClaimsAggregation.createIcaCredential(
                fixture.issuerDid,
                {
                    type: VerifiedIdentityType.Website,
                    uri: 'https://issuer.example.com',
                    provider: { name: 'Example Provider' },
                    verifiedAt: new Date().toISOString(),
                },
                signerPayload,
                new Date(),
            );

            const payload = new TextEncoder().encode(JSON.stringify(credential));
            const validCoseSign1 = await createCoseSign1(payload, fixture.coseAlg, fixture.sign);
            const tamperedCoseSign1 = tamperSignature(validCoseSign1);
            const restoreDidResolver = installDidResolverMock(fixture.issuerDid, fixture.didDocument);

            try {
                const icaValidator = new IdentityClaimsAggregationValidator(
                    tamperedCoseSign1,
                    signerPayload,
                    AssertionLabels.identity,
                );
                const result = await icaValidator.validateIcaCredential();
                const errors = failedCodes(result);

                for (const code of DID_ERROR_CODES) {
                    assert.ok(!errors.includes(code), `unexpected failure code: ${code}`);
                }

                assert.ok(
                    errors.includes(ValidationStatusCode.IcaSignatureMismatch),
                    `expected signature mismatch, got: ${errors.join(', ')}`,
                );
            } finally {
                restoreDidResolver();
            }
        });
    }
});
