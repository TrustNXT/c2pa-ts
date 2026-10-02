import { X509Certificate } from '@peculiar/x509';

/**
 * Options for signature validation.
 *
 * Trust anchors are resolved independently per option: an option that is not provided falls back to the global
 * (deprecated) `TrustList`. Providing only `trustAnchors` therefore still uses `TrustList.timestampTrustAnchors`
 * for timestamp validation, and vice versa. Pass an empty array to explicitly trust nothing.
 */
export interface ValidationOptions {
    /**
     * Trust anchors (root certificates) to use for chain validation.
     * Accepts PEM strings, DER bytes, or X509Certificate instances.
     * If not provided, defaults to TrustList.trustAnchors for backwards compatibility.
     */
    trustAnchors?: (string | Uint8Array | X509Certificate)[];

    /** Dedicated trust anchors for timestamp authority chains */
    timestampTrustAnchors?: (string | Uint8Array | X509Certificate)[];
}

/**
 * Options for validating CAWG identity assertions.
 */
export interface CawgValidationOptions extends ValidationOptions {
    /** Trust configuration  */
    cawg?: CawgTrustConfiguration;
}

/**
 * Configuration for CAWG trust model
 */
export interface CawgTrustConfiguration {
    /** List of X.509 certificate trust anchors */
    trustAnchors?: (string | Uint8Array | X509Certificate)[];
    /** List of trusted identity claims aggregator DIDs */
    trustedIcaIssuers?: string[];
    /** Current time for validation (defaults to now) */
    validationTime?: Date;
    /** TODO List of accepted Extended Key Usage (EKU) OID values */
    // acceptedEkus: string[];
    /** TODO For each EKU, list of accepted Certificate Policy OID values */
    // acceptedCertificatePolicies: Map<string, string[]>;
}
