/**
 * CAWG Identity Assertion Utilities
 * Helper functions for CBOR serialization, hashing, and data transformation
 *
 * @module cawg/utils
 */
import * as cborX from 'cbor-x';
import { Crypto, HashAlgorithm } from '../crypto';
import { Claim } from '../manifest/Claim';
import { BinaryHelper } from '../util';
import type { C2paAssetBinding, HashedUriMap, HashMap, SignerPayloadMap } from './types.js';

/**
 * Serialize claim data using CBOR deterministic encoding
 */
export function serializeClaimData(payload: Claim): Uint8Array {
    // Use deterministic encoding for consistent results
    return cborX.encode(payload);
}

/**
 * Validate that padding contains only zero (0x00) bytes
 */
export function validatePadding(pad: Uint8Array): boolean {
    return pad.every(byte => byte === 0x00);
}

/**
 * Convert CBOR byte strings to base64 for JSON representation
 */
export function bytesToBase64(bytes: Uint8Array): string {
    const bufferCtor = (globalThis as { Buffer?: typeof Buffer }).Buffer;
    if (bufferCtor?.from) {
        return bufferCtor.from(bytes).toString('base64');
    }
    if (typeof globalThis.btoa === 'function') {
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return globalThis.btoa(binary);
    }
    throw new Error('No base64 encoder available in this runtime');
}

/**
 * Convert base64 string to byte array
 */
export function base64ToBytes(base64: string | Uint8Array | number[]): Uint8Array {
    // If input is already a number array, convert directly to Uint8Array
    let base64String: string;
    if (Array.isArray(base64)) {
        base64String = new TextDecoder().decode(new Uint8Array(base64));
    } else if (base64 instanceof Uint8Array) {
        base64String = new TextDecoder().decode(base64);
    } else {
        base64String = base64;
    }

    const bufferCtor = (globalThis as { Buffer?: typeof Buffer }).Buffer;
    if (bufferCtor?.from) {
        return new Uint8Array(bufferCtor.from(base64String, 'base64'));
    }

    if (typeof globalThis.atob === 'function') {
        const binary = globalThis.atob(base64String);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    throw new Error('No base64 decoder available in this runtime');
}

/**
 * Convert byte array to base64url string
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
    return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Convert signer_payload to C2PA asset binding format for verifiable credentials
 * Converts CBOR byte strings to base64
 */
export function signerPayloadToC2paAssetBinding(payload: SignerPayloadMap): C2paAssetBinding {
    return {
        referenced_assertions: payload.referenced_assertions.map(ra => ({
            url: ra.url,
            ...(ra.alg && { alg: ra.alg }),
            hash: BinaryHelper.bytesToBase64(ra.hash),
        })),
        sig_type: payload.sig_type,
        ...(payload.role && { role: payload.role }),
        ...(payload.expected_partial_claim && {
            expected_partial_claim: {
                alg: payload.expected_partial_claim.alg,
                hash: BinaryHelper.bytesToBase64(payload.expected_partial_claim.hash),
            },
        }),
        ...(payload.expected_claim_generator && {
            expected_claim_generator: {
                alg: payload.expected_claim_generator.alg,
                hash: BinaryHelper.bytesToBase64(payload.expected_claim_generator.hash),
            },
        }),
        ...(payload.expected_countersigners && {
            expected_countersigners: payload.expected_countersigners.map(ec => ({
                partial_signer_payload: signerPayloadToC2paAssetBinding(ec.partial_signer_payload),
                ...(ec.expected_credentials && {
                    expected_credentials: {
                        alg: ec.expected_credentials.alg,
                        hash: BinaryHelper.bytesToBase64(ec.expected_credentials.hash),
                    },
                }),
            })),
        }),
    };
}

/**
 * Convert C2PA asset binding to signer_payload format
 * Converts base64 strings to CBOR byte arrays
 */
export function c2paAssetBindingToSignerPayload(binding: C2paAssetBinding): SignerPayloadMap {
    return {
        referenced_assertions: binding.referenced_assertions.map(ra => ({
            url: ra.url,
            ...(ra.alg && { alg: ra.alg }),
            hash: base64ToBytes(ra.hash),
        })),
        sig_type: binding.sig_type,
        ...(binding.role && { role: binding.role }),
        ...(binding.expected_partial_claim && {
            expected_partial_claim: {
                alg: binding.expected_partial_claim.alg,
                hash: base64ToBytes(binding.expected_partial_claim.hash),
            },
        }),
        ...(binding.expected_claim_generator && {
            expected_claim_generator: {
                alg: binding.expected_claim_generator.alg,
                hash: base64ToBytes(binding.expected_claim_generator.hash),
            },
        }),
        ...(binding.expected_countersigners && {
            expected_countersigners: binding.expected_countersigners.map(ec => ({
                partial_signer_payload: c2paAssetBindingToSignerPayload(ec.partial_signer_payload),
                ...(ec.expected_credentials && {
                    expected_credentials: {
                        alg: ec.expected_credentials.alg,
                        hash: base64ToBytes(ec.expected_credentials.hash),
                    },
                }),
            })),
        }),
    };
}

/**
 * Check if two hash maps are equal
 */
export function hashMapsEqual(a: HashMap, b: HashMap): boolean {
    if (a.alg !== b.alg) return false;
    if (a.hash.length !== b.hash.length) return false;
    return a.hash.every((byte, i) => byte === b.hash[i]);
}

/**
 * Check if two hashed URI maps are equal
 */
export function hashedUriMapsEqual(a: HashedUriMap, b: HashedUriMap): boolean {
    if (a.url !== b.url) return false;
    if (a.alg !== b.alg) return false;
    if (a.hash.length !== b.hash.length) return false;
    return a.hash.every((byte, i) => byte === b.hash[i]);
}

/**
 * Find duplicates in an array of hashed URI maps
 */
export function findDuplicateReferences(references: HashedUriMap[]): HashedUriMap[] {
    const seen = new Set<string>();
    const duplicates: HashedUriMap[] = [];

    for (const ref of references) {
        const key = `${ref.url}:${ref.alg}:${bytesToBase64(ref.hash)}`;
        if (seen.has(key)) {
            duplicates.push(ref);
        } else {
            seen.add(key);
        }
    }

    return duplicates;
}

/**
 * Check if an assertion is a hard binding assertion
 */
export function isHardBindingAssertion(assertionLabel: string): boolean {
    return (
        assertionLabel === 'c2pa.hash.data' ||
        assertionLabel === 'c2pa.hash.bmff' ||
        assertionLabel === 'c2pa.hash.boxes'
    );
}

/**
 * Extract assertion label from JUMBF URI
 * Example: "self#jumbf=c2pa/uuid/c2pa.assertions/c2pa.hash.data" -> "c2pa.hash.data"
 */
export function extractAssertionLabel(jumbfUri: string): string | null {
    const match = /c2pa\.assertions\/([^/]+)$/.exec(jumbfUri);
    return match ? match[1] : null;
}

/**
 * Helper: Compute cryptographic hash
 */
export async function computeHash(data: Uint8Array, algorithm: string): Promise<Uint8Array> {
    const algorithmMap: Record<string, HashAlgorithm> = {
        sha256: 'SHA-256',
        sha384: 'SHA-384',
        sha512: 'SHA-512',
    };

    const webCryptoAlg = algorithmMap[algorithm.toLowerCase()];
    if (!webCryptoAlg) {
        throw new Error(`Unsupported hash algorithm: ${algorithm}`);
    }

    const hashBuffer = await Crypto.digest(data, webCryptoAlg);
    return new Uint8Array(hashBuffer);
}

/**
 * Helper: Compare two byte arrays
 */
export function arrayEquals(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    return a.every((byte, i) => byte === b[i]);
}

/**
 * Helper: Deep equality check
 */
export function deepEqual(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;

    if (a instanceof Uint8Array || b instanceof Uint8Array) {
        return a instanceof Uint8Array && b instanceof Uint8Array && BinaryHelper.bufEqual(a, b);
    }

    if (Array.isArray(a) || Array.isArray(b)) {
        return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
    }

    if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
        const objA = a as Record<string, unknown>;
        const objB = b as Record<string, unknown>;
        // Keys met waarde undefined tellen als afwezig, net als bij JSON.
        const keysA = Object.keys(objA).filter(k => objA[k] !== undefined);
        const keysB = Object.keys(objB).filter(k => objB[k] !== undefined);
        return keysA.length === keysB.length && keysA.every(k => k in objB && deepEqual(objA[k], objB[k]));
    }

    return false;
}

/**
 * Helper: Check if Uint8Array does not exist or is empty
 */
export function isEmptyOrMissing(data: Uint8Array | null | undefined): boolean {
    return !data || data.length === 0;
}

/**
 * Convert a private JWK to a public JWK by removing private key parameters
 */
export function privateJwkToPublicJwk({ kty, crv, x, y, n, e }: JsonWebKey): JsonWebKey {
    return { ...{ kty, crv, x, y, n, e } };
}
