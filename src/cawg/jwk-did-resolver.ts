import type {
    DIDResolutionOptions,
    DIDResolutionResult,
    DIDResolver,
    JsonWebKey as DidResolverJsonWebKey,
    ParsedDID,
    Resolvable,
} from 'did-resolver';
import { base64ToBytes } from './utils';

const DID_JWK_METHOD = 'jwk';
const DID_JWK_CONTENT_TYPE = 'application/did+ld+json';

function decodeBase64Url(input: string): Uint8Array {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4;
    const padded = padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`;

    return base64ToBytes(padded);
}

function invalidDidResult(error: string): DIDResolutionResult {
    return {
        didResolutionMetadata: { error },
        didDocument: null,
        didDocumentMetadata: {},
    };
}

function isDidResolverJsonWebKey(value: unknown): value is DidResolverJsonWebKey {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    const candidate = value as { kty?: unknown };
    return typeof candidate.kty === 'string';
}

function parseDidJwk(_did: string, parsed: ParsedDID): DidResolverJsonWebKey | null {
    if (parsed.method !== DID_JWK_METHOD || !parsed.id) {
        return null;
    }

    try {
        const payloadBytes = decodeBase64Url(parsed.id);
        const payloadJson = new TextDecoder().decode(payloadBytes);
        const payload: unknown = JSON.parse(payloadJson);

        if (!isDidResolverJsonWebKey(payload)) {
            return null;
        }

        return payload;
    } catch {
        return null;
    }
}

/**
 * DID resolver for the `did:jwk` method.
 */
const jwkResolver: DIDResolver = (
    did: string,
    parsed: ParsedDID,
    _resolver: Resolvable,
    _options: DIDResolutionOptions,
): Promise<DIDResolutionResult> => {
    const publicKeyJwk = parseDidJwk(did, parsed);
    if (!publicKeyJwk) {
        return Promise.resolve(invalidDidResult('invalidDid'));
    }

    const verificationMethodId = `${did}#0`;

    return Promise.resolve({
        didResolutionMetadata: {
            contentType: DID_JWK_CONTENT_TYPE,
        },
        didDocument: {
            id: did,
            verificationMethod: [
                {
                    id: verificationMethodId,
                    type: 'JsonWebKey2020',
                    controller: did,
                    publicKeyJwk,
                },
            ],
            assertionMethod: [verificationMethodId],
        },
        didDocumentMetadata: {},
    });
};

/**
 * Returns a resolver registry entry for the `did:jwk` method,
 * compatible with `did-resolver`'s `Resolver` constructor.
 *
 * @example
 * ```ts
 * import { Resolver } from 'did-resolver';
 * import { getResolver } from './jwk-did-resolver';
 *
 * const resolver = new Resolver({ ...getResolver() });
 * ```
 */
export function getResolver(): { jwk: DIDResolver } {
    return { jwk: jwkResolver };
}
