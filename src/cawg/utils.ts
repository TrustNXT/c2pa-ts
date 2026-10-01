/**
 * CAWG Identity Assertion Utilities
 * Helper functions for CBOR serialization, hashing, and data transformation
 *
 * @module cawg/utils
 */
import { BinaryHelper } from '../util';
import type { C2paAssetBinding, SignerPayloadMap } from './types.js';

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
