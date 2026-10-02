/**
 * CAWG Identity Assertion Types and Interfaces
 * Implementation of the Creator Assertions Working Group (CAWG) specification v1.2
 *
 * @module cawg/types
 */

/**
 * Hash algorithm and value map used in various CAWG structures
 */
export interface HashMap {
    /** Hash algorithm identifier (e.g., 'sha256', 'sha384', 'sha512') */
    alg: string;
    /** Hash value as byte string */
    hash: Uint8Array;
}

/**
 * Hashed URI map structure referencing C2PA assertions
 */
export interface HashedUriMap {
    /** URI reference to the assertion */
    url: string;
    /** Hash algorithm identifier */
    alg?: string;
    /** Hash value of the assertion */
    hash: Uint8Array;
}

/**
 * Expected countersigner information
 */
export interface ExpectedCountersignerMap {
    /** The signer_payload from another identity assertion minus any expected_countersigners field */
    partial_signer_payload: SignerPayloadMap;
    /** Optional hash of expected identity assertion credentials */
    expected_credentials?: HashMap;
}

/**
 * Named actor roles as defined in CAWG specification
 */
export enum NamedActorRole {
    /** Primary creator/author of the C2PA asset */
    Creator = 'cawg.creator',
    /** Secondary creator/author of the C2PA asset */
    Contributor = 'cawg.contributor',
    /** Editor of the C2PA asset */
    Editor = 'cawg.editor',
    /** Producer of the C2PA asset */
    Producer = 'cawg.producer',
    /** Publisher of the C2PA asset */
    Publisher = 'cawg.publisher',
    /** Supported or sponsored the creation of the C2PA asset */
    Sponsor = 'cawg.sponsor',
    /** Adapted the C2PA asset from a similar work in another language */
    Translator = 'cawg.translator',
}

/**
 * Signer payload map - the core data structure signed by the credential holder
 */
export interface SignerPayloadMap {
    /** Array of referenced assertions */
    referenced_assertions: HashedUriMap[];
    /** Signature type identifier */
    sig_type: SignatureType;
    /** Optional roles describing the named actor's relationship to the C2PA asset */
    role?: NamedActorRole[];
    /** Optional hash of expected partial claim */
    expected_partial_claim?: HashMap;
    /** Optional hash of expected claim generator certificate */
    expected_claim_generator?: HashMap;
    /** Optional array of expected other identity assertion descriptions */
    expected_countersigners?: ExpectedCountersignerMap[];
}

/**
 * Signature type identifiers
 */
export enum SignatureType {
    /** X.509 certificate with COSE signature */
    X509Cose = 'cawg.x509.cose',
    /** Identity claims aggregation credential */
    IdentityClaimsAggregation = 'cawg.identity_claims_aggregation',
}

/**
 * Identity verification types for identity claims aggregation
 */
export enum VerifiedIdentityType {
    /** Government-issued identity document verification */
    DocumentVerification = 'cawg.document_verification',
    /** Web site domain control verification */
    Website = 'cawg.web_site',
    /** Organizational affiliation verification */
    Affiliation = 'cawg.affiliation',
    /** Social media account verification */
    SocialMedia = 'cawg.social_media',
    /** Crypto wallet address verification */
    CryptoWallet = 'cawg.crypto_wallet',
}

/**
 * Identity verification methods
 */
export enum VerificationMethod {
    /** DNS record verification */
    DnsRecord = 'cawg.dns_record',
    /** URI file content verification */
    UriFileVerification = 'cawg.uri_file_verification',
    /** Email verification */
    Email = 'cawg.email',
    /** URI meta tag verification */
    UriMetaTagVerification = 'cawg.uri_meta_tag_verification',
    /** Federated login (e.g., OAuth2) */
    FederatedLogin = 'cawg.federated_login',
}

/**
 * Identity provider details
 */
export interface IdentityProvider {
    /** URI containing information about the identity provider */
    id?: string;
    /** Human-readable name of the identity provider */
    name: string;
}

/**
 * Verified identity entry
 */
export interface VerifiedIdentity {
    /** Type of verification performed */
    type: VerifiedIdentityType;
    /** Optional display name */
    name?: string;
    /** Optional user name */
    username?: string;
    /** Optional address (for crypto wallets) */
    address?: string;
    /** Optional URI */
    uri?: string;
    /** Optional verification method */
    method?: string;
    /** Date and time when the relationship was verified (RFC 3339 format) */
    verifiedAt: string;
    /** Identity provider details */
    provider: IdentityProvider;
}

/**
 * C2PA asset binding in verifiable credential
 */
export interface C2paAssetBinding {
    /** Array of referenced assertions (with base64-encoded hashes) */
    referenced_assertions: {
        url: string;
        alg?: string;
        hash: string;
    }[];
    /** Signature type */
    sig_type: SignatureType;
    /** Optional roles */
    role?: NamedActorRole[];
    /** Optional expected partial claim */
    expected_partial_claim?: {
        alg: string;
        hash: string;
    };
    /** Optional expected claim generator */
    expected_claim_generator?: {
        alg: string;
        hash: string;
    };
    /** Optional expected countersigners */
    expected_countersigners?: {
        partial_signer_payload: Omit<C2paAssetBinding, 'expected_countersigners'>;
        expected_credentials?: {
            alg: string;
            hash: string;
        };
    }[];
}

/**
 * Credential subject for identity claims aggregation
 */
export interface IdentityClaimsCredentialSubject {
    /** Optional DID identifier */
    id?: string;
    /** Array of verified identities */
    verifiedIdentities: VerifiedIdentity[];
    /** Binding to C2PA asset */
    c2paAsset: C2paAssetBinding;
}

/**
 * Base for Identity claims aggregation verifiable credential (ICA-VC) and Verifiable Credential (VC)
 */
export interface VerifiableCredential {
    /** JSON-LD context */
    '@context': string[];
    /** Credential types */
    type: string[];
    /** Issuer identifier (DID) */
    issuer: string | { id: string };
    /** Valid from date (VC 2.0) */
    validFrom?: string;
    /** Issuance date (VC 1.1) */
    issuanceDate?: string;
    /** Optional expiration date (VC 1.1) */
    expirationDate?: string;
    /** Optional valid until date (VC 2.0) */
    validUntil?: string;
    /** Credential subject */
    credentialSubject: IdentityClaimsCredentialSubject;
    /** Optional credential status (for revocation) */
    credentialStatus?: CredentialStatus | CredentialStatus[];
    /** Optional credential schema */
    credentialSchema?: {
        id: string;
        type: string;
    }[];
}

/**
 * Identity claims aggregation verifiable credential
 */
export type IdentityClaimsAggregationCredential = VerifiableCredential;

/**
 * Placeholder assertion for reserving space during C2PA manifest creation
 */
export interface PlaceholderAssertion {
    /** Size in bytes that the placeholder must occupy */
    size: number;
    /** Label for the assertion */
    label: string;
}

/**
 * Natural language string - can be a simple string or language map
 */
export type NaturalLanguageString = string | Record<string, string>;

/**
 * Trust decision outcomes
 */
export enum TrustDecision {
    /** Trust relationship verified through established roots of trust */
    Trusted = 'trusted',
    /** No trust relationship verified, but well-formed */
    WellFormed = 'well-formed',
    /** Credential was revoked at the time of signing */
    Revoked = 'revoked',
}
/**
 * Base type for credentialStatus (VC Data Model v2.0)
 */
export interface CredentialStatus {
    /** URI identifying the status entry */
    id: string;
    /** Type of status method (e.g., "StatusList2021Entry") */
    type: string;
}

/**
 * Example: StatusList2021Entry (commonly used)
 */
export interface StatusList2021Entry extends CredentialStatus {
    /** Type of status list entry */
    type: 'StatusList2021Entry';
    /** Purpose of the status list entry */
    statusPurpose: 'revocation' | 'suspension';
    /** Index of the status list entry */
    statusListIndex: string;
    /** URL to the status list credential */
    statusListCredential: string;
}

/**
 * COSE header labels according RFC 8152
 * 1  = alg
 * 3  = content type
 * 33 = x5chain
 */
export interface ProtectedHeaderMap {
    '1': number; // alg
    '3'?: string | number; // contentType
    '33': Uint8Array | Uint8Array[]; // x5chain (single cert of chain)
    [key: string]: unknown;
}

export type DecodedCoseSign1Typing = [Uint8Array, Record<number | string, unknown>, Uint8Array | null, Uint8Array];
export interface DecodedCoseSign1 {
    protectedHeader: {
        alg: number;
        contentType?: string | number;
        x5chain: Uint8Array | Uint8Array[];
        [key: string]: unknown;
    };
    unprotectedHeader: Record<number | string, unknown>;
    protectedHeaderBytes: Uint8Array;
    payload: Uint8Array | null;
    signature: Uint8Array;
}

export type DIDPublicKey = JsonWebKey | string;

/**
 * W3C Verifiable Credentials contexts
 */
export const VC_CONTEXT = {
    /** VC Data Model v1.1 */
    V1_1: 'https://www.w3.org/2018/credentials/v1',
    /** VC Data Model v2.0 */
    V2_0: 'https://www.w3.org/ns/credentials/v2',
    /** CAWG Identity Claims Aggregation context */
    CAWG: 'https://cawg.io/identity/1.1/ica/context/',
} as const;

/**
 * VC Types
 */
export const VC_TYPE = {
    Verifiable: 'VerifiableCredential',
    IdentityClaimsAggregation: 'IdentityClaimsAggregationCredential',
} as const;

/**
 * Schema URLs
 */
export const SCHEMA_URL = {
    VC1_1: 'https://cawg.io/identity/1.1/ica/schema/vc1.1/',
    VC2_0: 'https://cawg.io/identity/1.1/ica/schema/vc2.0/',
} as const;

/**
 * Supported DID methods
 */
export const SUPPORTED_DID_METHODS = ['did:web', 'did:key', 'did:jwk'] as const;

/**
 * Supported DID verification methods
 */
export const SUPPORTED_VERIFICATION_METHODS = ['JsonWebKey', 'JsonWebKey2020', 'Ed25519VerificationKey2018'] as const;

/**
 * Supported COSE algorithms for ICA
 */
export const SUPPORTED_COSE_ALGORITHMS = {
    ES256: -7, // ECDSA with SHA-256
    ES384: -35, // ECDSA with SHA-384
    ES512: -36, // ECDSA with SHA-512
    PS256: -37, // RSASSA-PSS with SHA-256
    PS384: -38, // RSASSA-PSS with SHA-384
    PS512: -39, // RSASSA-PSS with SHA-512
    EdDSA: -8, // EdDSA (Ed25519 only)
} as const;
