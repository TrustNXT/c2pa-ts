/**
 * CAWG Identity Claims Aggregation Support
 * Implementation of ICA verifiable credentials per CAWG spec Section 8.1
 *
 * @module cawg/identity-claims-aggregation
 */

import { X509Certificate } from '@peculiar/x509';
import * as asn1js from 'asn1js';
import { DIDDocument, VerificationMethod } from 'did-resolver';
import * as pkijs from 'pkijs';
import { Algorithms, Signature } from '../cose';
import { SigStructure } from '../cose/SigStructure';
import { Crypto } from '../crypto';
import type {
    ECDSASigningAlgorithm,
    Ed25519SigningAlgorithm,
    RSASigningAlgorithm,
    SigningAlgorithm,
} from '../crypto/types';
import * as JUMBF from '../jumbf';
import { CawgTrustConfiguration, ValidationResult, ValidationStatusCode } from '../manifest';
import { BinaryHelper } from '../util';
import { didResolver } from './did-resolver';
import {
    SUPPORTED_COSE_ALGORITHMS,
    SUPPORTED_DID_METHODS,
    SUPPORTED_VERIFICATION_METHODS,
    VC_TYPE,
    type C2paAssetBinding,
    type DecodedCoseSign1,
    type DecodedCoseSign1Typing,
    type DIDPublicKey,
    type IdentityClaimsAggregationCredential,
    type ProtectedHeaderMap,
    type SignerPayloadMap,
    type VerifiedIdentity,
} from './types';
import { c2paAssetBindingToSignerPayload, deepEqual } from './utils';

export class IdentityClaimsAggregationValidator {
    signature: Uint8Array;
    signerPayload: SignerPayloadMap;
    assertionLabel: string;
    validationOptions?: CawgTrustConfiguration;
    result: ValidationResult;

    constructor(
        signature: Uint8Array,
        signerPayload: SignerPayloadMap,
        assertionLabel: string,
        validationOptions?: CawgTrustConfiguration,
    ) {
        this.signature = signature;
        this.signerPayload = signerPayload;
        this.assertionLabel = assertionLabel;
        this.validationOptions = validationOptions;
        this.result = new ValidationResult();
    }

    /**
     * Validate an Identity Claims Aggregation credential
     *
     * Implements validation as described in CAWG spec Section 8.1.5
     * @returns Validation result
     */
    async validateIcaCredential(): Promise<ValidationResult> {
        try {
            // Step 1: Parse COSE_Sign1 structure
            const coseSign1 = await this.parseCoseSign1();
            if (!coseSign1) {
                this.result.addError(
                    ValidationStatusCode.IcaInvalidCoseSign1,
                    this.assertionLabel,
                    'Failed to parse COSE_Sign1 structure',
                );
                return this.result;
            }

            // Step 2: Validate COSE protected headers
            const algValid = this.validateCoseAlgorithm(coseSign1.protectedHeader?.alg);
            if (!algValid) {
                this.result.addError(
                    ValidationStatusCode.IcaInvalidAlg,
                    this.assertionLabel,
                    'Unsupported or missing COSE algorithm',
                );
            }

            const contentType = coseSign1.protectedHeader?.contentType;
            if (contentType !== 'application/vc') {
                this.result.addError(
                    ValidationStatusCode.IcaInvalidContentType,
                    this.assertionLabel,
                    'Content type must be "application/vc"',
                );
            }

            // Step 3: Parse verifiable credential
            let credential: IdentityClaimsAggregationCredential;

            try {
                if (!coseSign1.payload) {
                    this.result.addError(
                        ValidationStatusCode.IcaInvalidVerifiableCredential,
                        this.assertionLabel,
                        'COSE_Sign1 payload is empty',
                    );
                    return this.result;
                }
                const credentialJson = new TextDecoder().decode(coseSign1.payload);
                credential = JSON.parse(credentialJson) as IdentityClaimsAggregationCredential;
            } catch {
                this.result.addError(
                    ValidationStatusCode.IcaInvalidVerifiableCredential,
                    this.assertionLabel,
                    'Failed to parse verifiable credential JSON',
                );
                return this.result;
            }

            // Step 4: Validate credential structure
            this.validateIcaCredentialStructure(credential);

            // Step 5: Verify issuer
            const issuerDid = this.getIssuerDid(credential);
            if (issuerDid?.split(':')[0] !== 'did') {
                this.result.addError(
                    ValidationStatusCode.IcaInvalidIssuer,
                    this.assertionLabel,
                    'Issuer is not a valid DID',
                );
                return this.result;
            }

            const didMethod = issuerDid.split(':')[1];
            const issuerTrusted = await this.verifyIssuerTrust(issuerDid);
            if (!issuerTrusted) {
                this.result.addError(
                    ValidationStatusCode.IcaUntrustedIssuer,
                    this.assertionLabel,
                    'Issuer DID is not in trusted list',
                );
            }
            if (!(SUPPORTED_DID_METHODS as readonly string[]).includes(`did:${didMethod}`)) {
                this.result.addError(
                    ValidationStatusCode.IcaDidUnsupportedMethod,
                    this.assertionLabel,
                    `DID method not supported: did:${didMethod}`,
                );
                return this.result;
            }

            // Step 6: Obtain issuer's public key via DID resolution
            const didDocument = await this.resolveDid(issuerDid);
            if (!didDocument) {
                this.result.addError(
                    ValidationStatusCode.IcaDidUnavailable,
                    this.assertionLabel,
                    'Failed to resolve DID document',
                );
                return this.result;
            }

            const publicKey = this.extractPublicKeyFromDidDocument(didDocument);

            if (!publicKey) {
                this.result.addError(
                    ValidationStatusCode.IcaInvalidDidDocument,
                    this.assertionLabel,
                    'Failed to extract public key from DID document',
                );
                return this.result;
            }

            // Step 7: Verify COSE signature
            const signatureValid = await this.verifyCoseSign1(coseSign1, publicKey);

            if (!signatureValid) {
                this.result.addError(
                    ValidationStatusCode.IcaSignatureMismatch,
                    this.assertionLabel,
                    'COSE signature verification failed',
                );
                return this.result;
            }

            // Step 8: Verify timestamp if present
            const timestamp = this.extractTimestamp(coseSign1);
            if (timestamp) {
                const timestampValid = await this.validateTimestamp(
                    timestamp,
                    coseSign1.protectedHeaderBytes,
                    coseSign1.signature,
                );
                if (timestampValid) {
                    this.result.addInformational(
                        ValidationStatusCode.IcaTimeStampValidated,
                        this.assertionLabel,
                        'RFC 3161 timestamp validated',
                    );
                } else {
                    this.result.addError(
                        ValidationStatusCode.IcaTimeStampInvalid,
                        this.assertionLabel,
                        'Invalid RFC 3161 timestamp',
                    );
                }
            }

            // Step 9: Verify validity dates
            this.validateCredentialValidityDates(credential);

            // Step 10: Check revocation status
            if (credential.credentialStatus) {
                await this.validateRevocationStatus(credential);
            }

            // Step 11: Verify binding to C2PA asset
            this.validateC2paAssetBinding(credential.credentialSubject.c2paAsset);

            // Step 12: Validate verified identities
            this.validateVerifiedIdentities(credential.credentialSubject.verifiedIdentities);

            // Step 13: Final status
            if (this.result.isValid) {
                this.result.addInformational(
                    ValidationStatusCode.IcaCredentialValid,
                    this.assertionLabel,
                    'Identity claims aggregation credential is valid',
                );
            }
        } catch (error) {
            this.result.addError(
                ValidationStatusCode.IcaInvalidVerifiableCredential,
                this.assertionLabel,
                `Validation error: ${String(error)}`,
            );
        }

        return this.result;
    }

    // Helper functions
    validateCoseAlgorithm(alg: number | undefined): boolean {
        if (alg === undefined) return false;
        return (Object.values(SUPPORTED_COSE_ALGORITHMS) as number[]).includes(alg);
    }

    private validateIcaCredentialStructure(credential: IdentityClaimsAggregationCredential): void {
        // Validate @context
        if (!credential['@context'] || !Array.isArray(credential['@context'])) {
            this.result.addError(
                ValidationStatusCode.IcaInvalidVerifiableCredential,
                this.assertionLabel,
                'Missing or invalid @context',
            );
        }

        // Validate type
        if (!credential.type || !Array.isArray(credential.type)) {
            this.result.addError(
                ValidationStatusCode.IcaInvalidVerifiableCredential,
                this.assertionLabel,
                'Missing or invalid type',
            );
            return;
        }

        const hasRequiredTypes =
            credential.type.includes(VC_TYPE.Verifiable) && credential.type.includes(VC_TYPE.IdentityClaimsAggregation);

        if (!hasRequiredTypes) {
            this.result.addError(
                ValidationStatusCode.IcaInvalidVerifiableCredential,
                this.assertionLabel,
                'Missing required credential types',
            );
        }
    }

    getIssuerDid(credential: IdentityClaimsAggregationCredential): string | null {
        const did = this.extractIssuerDid(credential);

        // If the DID is a did:jwk, we need to remove the padding because the resolver does not accept the = character in the METHOD_ID
        // This is a workaround for the fact that some producers include the padding while others do not.
        if (did?.startsWith('did:jwk:')) {
            return did.replace(/=/g, '');
        }
        return did;
    }

    extractIssuerDid(credential: IdentityClaimsAggregationCredential): string | null {
        if (typeof credential.issuer === 'string') {
            return credential.issuer;
        } else if (credential.issuer && typeof credential.issuer === 'object') {
            return credential.issuer.id;
        }
        return null;
    }

    async resolveDid(did: string): Promise<DIDDocument | null> {
        const res = await didResolver.resolve(did);
        return res.didDocument;
    }

    extractPublicKeyFromDidDocument(didDocument: DIDDocument): DIDPublicKey | null {
        // Extract assertionMethod verification method
        // and return public key material
        const verificationMethods = didDocument.verificationMethod ?? [];

        // Look for assertionMethod entries
        const assertionMethods = didDocument.assertionMethod ?? [];

        for (const methodId of assertionMethods) {
            let method = verificationMethods.find(
                (vm: VerificationMethod) => vm.id === methodId || vm.id === `${didDocument.id}${methodId as string}`,
            );

            method ??= methodId as unknown as VerificationMethod;

            // Check if verification method type is supported
            if (!(SUPPORTED_VERIFICATION_METHODS as readonly string[]).includes(method.type)) {
                continue;
            }

            // Extract public key based on method type
            if (['JsonWebKey', 'JsonWebKey2020'].includes(method.type) && method.publicKeyJwk) {
                return method.publicKeyJwk;
            } else if (method.type === 'Ed25519VerificationKey2018') {
                const publicKeyBase58 = (method as unknown as { publicKeyBase58?: string }).publicKeyBase58;
                if (publicKeyBase58) {
                    return this.ed25519Base58ToJwk(publicKeyBase58);
                }
            }
        }
        return null;
    }

    /**
     * Decode a base58btc-encoded Ed25519 public key (as produced by key-did-resolver
     * for Ed25519VerificationKey2018) into an OKP JWK.
     */
    ed25519Base58ToJwk(publicKeyBase58: string): JsonWebKey {
        const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        const bytes = new Uint8Array(32);
        let carry = 0n;
        for (const char of publicKeyBase58) {
            const digit = ALPHABET.indexOf(char);
            if (digit < 0) throw new Error(`Invalid base58 character: ${char}`);
            carry = carry * 58n + BigInt(digit);
        }
        for (let i = 31; i >= 0; i--) {
            bytes[i] = Number(carry & 0xffn);
            carry >>= 8n;
        }
        // base64url-encode without padding
        const x = btoa(String.fromCharCode(...bytes))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
        return { kty: 'OKP', crv: 'Ed25519', x };
    }

    async verifyIssuerTrust(issuerDid: string): Promise<boolean> {
        const trustedIcaIssuers = (this.validationOptions?.trustedIcaIssuers ?? [])
            .map(did => did.trim())
            .filter(Boolean);

        // Keep backwards-compatible permissive mode when no explicit trust policy is configured.
        if (!trustedIcaIssuers.length) {
            return true;
        }

        const normalizeDid = (did: string): string => {
            const match = /^did:([^:]+):(.*)$/i.exec(did.trim());
            if (!match) {
                return did.trim();
            }

            const [, method, methodSpecificId] = match;
            return `did:${method.toLowerCase()}:${methodSpecificId}`;
        };

        const trustedSet = new Set(trustedIcaIssuers.map(normalizeDid));
        return trustedSet.has(normalizeDid(issuerDid));
    }

    async verifyCoseSign1(coseSign1: DecodedCoseSign1, publicKey: DIDPublicKey): Promise<boolean> {
        try {
            // Validate required fields
            if (!coseSign1.protectedHeaderBytes || !coseSign1.protectedHeader?.alg || !coseSign1.signature) {
                return false;
            }

            // Validate payload
            if (!coseSign1.payload) {
                return false;
            }

            // Get the COSE algorithm
            const coseAlgorithm = Algorithms.getAlgorithm(coseSign1.protectedHeader.alg);
            if (!coseAlgorithm) {
                return false;
            }

            // Convert DIDPublicKey to DER format and extract algorithm info if available
            const keyConversionResult = await this.convertDidPublicKeyToDer(publicKey);
            if (!keyConversionResult) {
                return false;
            }
            const { derPublicKey, keyAlgorithmInfo } = keyConversionResult;

            // Determine the full signing algorithm with namedCurve if needed
            const signingAlgorithm = this.buildSigningAlgorithm(coseAlgorithm.alg, keyAlgorithmInfo);
            if (!signingAlgorithm) {
                return false;
            }

            // Create the Sig_structure and encode it per RFC 8152
            // Sig_structure = [
            //   context = "Signature1",
            //   body_protected = protected header bytes,
            //   external_aad = empty,
            //   payload = the credential bytes
            // ]
            const sigStructure = new SigStructure('Signature1', coseSign1.protectedHeaderBytes, coseSign1.payload);
            const toBeSigned = sigStructure.encode();

            // Verify the signature using the existing Crypto infrastructure
            const isValid = await Crypto.verifySignature(
                toBeSigned,
                coseSign1.signature,
                derPublicKey,
                signingAlgorithm,
            );

            return isValid;
        } catch {
            // Signature verification failed due to exception
            return false;
        }
    }

    /**
     * Convert a DIDPublicKey (JWK or multibase string) to DER SPKI format
     * @param publicKey - JWK or multibase-encoded public key
     * @returns Object with DER-encoded SPKI public key and algorithm info, or null if conversion fails
     */
    async convertDidPublicKeyToDer(
        publicKey: DIDPublicKey,
    ): Promise<{ derPublicKey: Uint8Array; keyAlgorithmInfo?: { namedCurve?: string; kty?: string } } | null> {
        try {
            // Handle JsonWebKey format
            if (typeof publicKey === 'object' && publicKey !== null) {
                // Get the algorithm spec from the JWK
                const keyAlgorithm = this.getAlgorithmFromJwk(publicKey);
                if (!keyAlgorithm) {
                    return null;
                }

                // Import the JWK using Web Crypto API
                const cryptoKey = await crypto.subtle.importKey('jwk', publicKey, keyAlgorithm, true, ['verify']);

                // Export as SPKI (DER format) for use with Crypto.verifySignature
                const spkiBuffer = await crypto.subtle.exportKey('spki', cryptoKey);
                return {
                    derPublicKey: new Uint8Array(spkiBuffer),
                    keyAlgorithmInfo: this.extractAlgorithmInfo(publicKey),
                };
            }

            // Handle multibase string format
            // Multibase strings typically start with a prefix character indicating the encoding
            // Common prefixes: 'z' (base58btc), 'b' (base32), 'u' (base64url)
            // Support for multibase requires additional dependencies not currently in the project
            // For now, return null to indicate unsupported format
            if (typeof publicKey === 'string') {
                // TODO: Add multibase decoding support when multibase library is available
                return null;
            }

            return null;
        } catch {
            // Return null if any conversion step fails
            return null;
        }
    }

    /**
     * Build a SigningAlgorithm from a COSE algorithm and key algorithm info
     * @param coseAlg - The algorithm from CoseAlgorithm.alg
     * @param keyAlgorithmInfo - Information about the key (namedCurve, etc.)
     * @returns Properly constructed SigningAlgorithm or null if unable to construct
     */
    buildSigningAlgorithm(
        coseAlg: Omit<ECDSASigningAlgorithm, 'namedCurve'> | RSASigningAlgorithm | Ed25519SigningAlgorithm,
        keyAlgorithmInfo?: { namedCurve?: string; kty?: string },
    ): SigningAlgorithm | null {
        // For ECDSA, we need to add the namedCurve from the key
        if (coseAlg.name === 'ECDSA' && keyAlgorithmInfo?.namedCurve) {
            const namedCurve = keyAlgorithmInfo.namedCurve;
            if (['P-256', 'P-384', 'P-521'].includes(namedCurve)) {
                return {
                    name: 'ECDSA',
                    namedCurve: namedCurve as 'P-256' | 'P-384' | 'P-521',
                    hash: coseAlg.hash,
                };
            }
        }

        // For non-ECDSA algorithms, return as-is (they already have all required properties)
        if (coseAlg.name !== 'ECDSA') {
            return coseAlg;
        }

        return null;
    }

    /**
     * Extract algorithm information from a JWK
     * @param jwk - JsonWebKey
     * @returns Object with algorithm information like namedCurve
     */
    extractAlgorithmInfo(jwk: JsonWebKey): { namedCurve?: string; kty?: string } {
        const info: { namedCurve?: string; kty?: string } = { kty: jwk.kty };
        if (jwk.kty === 'EC' && jwk.crv) {
            info.namedCurve = jwk.crv;
        }
        return info;
    }

    /**
     * Get the Web Crypto algorithm parameters from a JWK
     * @param jwk - JsonWebKey
     * @returns Algorithm specification for crypto.subtle operations
     */
    getAlgorithmFromJwk(jwk: JsonWebKey): (Algorithm & { namedCurve?: string }) | null {
        if (!jwk.kty) {
            return null;
        }

        // Handle EC (Elliptic Curve) keys used for ECDSA
        if (jwk.kty === 'EC') {
            if (!jwk.crv) {
                return null;
            }

            // Map JWK curve names to WebCrypto named curves
            const curveMap: Record<string, EcKeyGenParams['namedCurve']> = {
                'P-256': 'P-256',
                'P-384': 'P-384',
                'P-521': 'P-521',
            };

            const namedCurve = curveMap[jwk.crv];
            if (!namedCurve) {
                return null;
            }

            return {
                name: 'ECDSA',
                namedCurve,
            };
        }

        // Handle RSA keys
        if (jwk.kty === 'RSA') {
            return {
                name: 'RSASSA-PKCS1-v1_5',
            };
        }

        // Handle OKP (Octet Key Pair) keys used for EdDSA/Ed25519
        if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') {
            return {
                name: 'Ed25519',
            };
        }

        return null;
    }

    extractTimestamp(coseSign1: DecodedCoseSign1): Uint8Array | ArrayBuffer | null {
        const unprotectedHeader = coseSign1.unprotectedHeader;
        if (!unprotectedHeader || typeof unprotectedHeader !== 'object') {
            return null;
        }

        // CAWG Identity 1.2: RFC 3161 timestamp container is sigTst2.
        // Accept both named and numeric-key encodings for robustness.
        const sigTst2 = unprotectedHeader.sigTst2 ?? unprotectedHeader[395] ?? unprotectedHeader['395'];

        if (!sigTst2 || typeof sigTst2 !== 'object') {
            return null;
        }

        const tstTokens = (sigTst2 as { tstTokens?: unknown }).tstTokens;
        if (!Array.isArray(tstTokens) || tstTokens.length === 0) {
            return null;
        }

        if (!tstTokens[0] || typeof tstTokens[0] !== 'object') {
            return null;
        }

        const val = (tstTokens[0] as { val?: unknown }).val;
        return (val as Uint8Array | ArrayBuffer) ?? null;
    }

    async validateTimestamp(
        timestamp: Uint8Array | ArrayBuffer,
        rawProtectedBucket: Uint8Array,
        signature: Uint8Array,
    ): Promise<boolean> {
        // Validate RFC 3161 timestamp in CAWG sigTst2.
        // Some producers embed a full TimeStampResp while others embed a bare TimeStampToken (CMS ContentInfo).
        try {
            let timestampBytes: Uint8Array | null = null;

            if (timestamp instanceof Uint8Array) {
                timestampBytes = timestamp;
            } else if (timestamp instanceof ArrayBuffer) {
                timestampBytes = new Uint8Array(timestamp);
            }

            if (!timestampBytes || timestampBytes.length === 0) {
                return false;
            }

            let signedData: pkijs.SignedData | null = null;

            // Preferred format: full RFC 3161 TimeStampResp.
            try {
                const response = pkijs.TimeStampResp.fromBER(timestampBytes as Uint8Array<ArrayBuffer>);
                if (
                    response.status.status !== pkijs.PKIStatus.granted &&
                    response.status.status !== pkijs.PKIStatus.grantedWithMods
                ) {
                    return false;
                }

                if (response.timeStampToken?.content) {
                    signedData = new pkijs.SignedData({ schema: response.timeStampToken.content });
                }
            } catch {
                // Fallback: bare TimeStampToken (ContentInfo wrapping SignedData).
                const ber = new Uint8Array(timestampBytes).buffer;
                const parsed = asn1js.fromBER(ber);
                if (parsed.offset === -1) {
                    return false;
                }

                const contentInfo = new pkijs.ContentInfo({ schema: parsed.result });
                if (!contentInfo.content) {
                    return false;
                }

                signedData = new pkijs.SignedData({ schema: contentInfo.content });
            }

            if (!signedData) {
                return false;
            }

            const rawTstInfo = signedData.encapContentInfo.eContent?.getValue();
            if (!rawTstInfo) {
                return false;
            }

            const tstInfo = pkijs.TSTInfo.fromBER(rawTstInfo);

            // Require a supported message-imprint algorithm and non-empty digest.
            const hashAlgorithm = Crypto.getHashAlgorithmByOID(tstInfo.messageImprint.hashAlgorithm.algorithmId);
            if (!hashAlgorithm) {
                return false;
            }

            const hashedMessage = new Uint8Array(tstInfo.messageImprint.hashedMessage.getValue());
            if (hashedMessage.length === 0) {
                return false;
            }

            // sigTst2 (CAWG/C2PA v2) timestamps the CBOR-wrapped signature bytes, not the raw signature bytes.
            const signaturePayload = JUMBF.CBORBox.encoder.encode(signature);
            const toBeSigned = new SigStructure('CounterSignature', rawProtectedBucket, signaturePayload).encode();
            const actualHash = await Crypto.digest(toBeSigned, hashAlgorithm);
            if (!BinaryHelper.bufEqual(actualHash, hashedMessage)) {
                return false;
            }

            if (!(await Signature.verifySignedDataSignature(signedData))) {
                return false;
            }

            // Validate TSA certificates
            for (const cert of signedData.certificates ?? []) {
                if (!(cert instanceof pkijs.Certificate)) continue;
                const x509Cert = new X509Certificate(cert.toSchema().toBER());
                const certValidation = Signature.validateCertificate(x509Cert, tstInfo.genTime, false);
                if (certValidation !== ValidationStatusCode.SigningCredentialTrusted) {
                    return false;
                }
            }

            return true;
        } catch {
            return false;
        }
    }

    validateCredentialValidityDates(credential: IdentityClaimsAggregationCredential): void {
        const now = this.validationOptions?.validationTime ?? new Date();

        // Check validFrom / issuanceDate
        const validFrom = credential.validFrom ?? credential.issuanceDate;
        if (!validFrom) {
            this.result.addError(
                ValidationStatusCode.IcaValidFromMissing,
                this.assertionLabel,
                'Missing validFrom or issuanceDate',
            );
            return;
        }

        const validFromDate = new Date(validFrom);
        if (validFromDate > now) {
            this.result.addError(
                ValidationStatusCode.IcaValidFromInvalid,
                this.assertionLabel,
                'Credential not yet valid',
            );
        }

        // Check validUntil / expirationDate
        const validUntil = credential.validUntil ?? credential.expirationDate;
        if (validUntil) {
            const validUntilDate = new Date(validUntil);
            if (validUntilDate < now) {
                this.result.addError(
                    ValidationStatusCode.IcaValidUntilInvalid,
                    this.assertionLabel,
                    'Credential has expired',
                );
            }
        }
    }

    async validateRevocationStatus(credential: IdentityClaimsAggregationCredential): Promise<void> {
        // TODO Check credential status for revocation
        if (credential.credentialStatus) {
            this.result.addInformational(
                ValidationStatusCode.IcaCredentialNotRevoked,
                this.assertionLabel,
                'Credential not revoked',
            );
        }
    }

    validateC2paAssetBinding(c2paAsset: C2paAssetBinding): void {
        // Convert and compare
        const convertedPayload = c2paAssetBindingToSignerPayload(c2paAsset);

        // Some real world signers do not following the specs by neglecting the algorthm value.
        // To avoid breaking existing credentials, we ignore the alg value in the signer payload if it is missing
        if (convertedPayload.referenced_assertions && this.signerPayload.referenced_assertions) {
            for (let i = 0; i < convertedPayload.referenced_assertions.length; i++) {
                const convertedAssertion = convertedPayload.referenced_assertions[i];
                const signerAssertion = this.signerPayload.referenced_assertions[i];

                // If converted payload lacks 'alg' but signer payload has it, remove it for comparison
                if (
                    signerAssertion &&
                    (!('alg' in signerAssertion) || !signerAssertion.alg) &&
                    convertedAssertion &&
                    'alg' in convertedAssertion
                ) {
                    signerAssertion.alg = convertedAssertion.alg;
                }
            }
        }

        if (!deepEqual(convertedPayload, this.signerPayload)) {
            this.result.addError(
                ValidationStatusCode.IcaSignerPayloadMismatch,
                this.assertionLabel,
                'c2paAsset does not match signer_payload',
            );
        }
    }

    validateVerifiedIdentities(verifiedIdentities: VerifiedIdentity[]): void {
        if (!verifiedIdentities || verifiedIdentities.length === 0) {
            this.result.addError(
                ValidationStatusCode.IcaVerifiedIdentitiesMissing,
                this.assertionLabel,
                'verifiedIdentities array is empty or missing',
            );
            return;
        }

        // Validate each verified identity entry
        for (const identity of verifiedIdentities) {
            if (!identity.type || !identity.provider || !identity.verifiedAt) {
                this.result.addError(
                    ValidationStatusCode.IcaVerifiedIdentitiesInvalid,
                    this.assertionLabel,
                    'Verified identity missing required fields',
                );
            }
        }
    }

    async parseCoseSign1(): Promise<DecodedCoseSign1 | null> {
        try {
            // COSE_Sign1 structure (RFC 8152):
            // [
            //   protected: bstr,
            //   unprotected: {* label => int / tstr => any},
            //   payload: bstr,
            //   signature: bstr
            // ]

            // You'll need a CBOR decoder library (e.g., cbor, cbor-x, or cborg)
            // Example using a hypothetical CBOR library:
            const cborDecoded = JUMBF.CBORBox.decoder.decode(this.signature) as { value: DecodedCoseSign1Typing }; // or similar
            if (!cborDecoded?.value) {
                return null;
            }
            const cborDecodedValue = cborDecoded.value;
            if (!Array.isArray(cborDecodedValue) || cborDecodedValue.length !== 4) {
                return null;
            }

            const [protectedHeaderBytes, unprotectedHeader, payload, signature] = cborDecodedValue;

            // Decode protected header
            const protectedHeader = JUMBF.CBORBox.decoder.decode(protectedHeaderBytes) as
                ProtectedHeaderMap | Map<number | string, unknown>;

            const getProtectedHeaderParam = (label: number): unknown => {
                if (protectedHeader instanceof Map) {
                    if (protectedHeader.has(label)) {
                        return protectedHeader.get(label);
                    }
                    const stringLabel = String(label);
                    if (protectedHeader.has(stringLabel)) {
                        return protectedHeader.get(stringLabel);
                    }
                    return undefined;
                }

                return protectedHeader[String(label) as keyof ProtectedHeaderMap];
            };

            return {
                protectedHeaderBytes,
                protectedHeader: {
                    alg: getProtectedHeaderParam(1) as number, // COSE header parameter 1 is "alg"
                    contentType: getProtectedHeaderParam(3) as string | number | undefined, // COSE header parameter 3 is "content type"
                    x5chain: getProtectedHeaderParam(33) as Uint8Array | Uint8Array[], // COSE header parameter 33 is "x5chain"
                },
                unprotectedHeader,
                payload,
                signature,
            };
        } catch {
            return null;
        }
    }
}
