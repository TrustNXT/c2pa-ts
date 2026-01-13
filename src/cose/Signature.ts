import { AsnConvert } from '@peculiar/asn1-schema';
import { Certificate as ASN1Certificate, Version as ASN1Version } from '@peculiar/asn1-x509';
import {
    AuthorityKeyIdentifierExtension,
    BasicConstraintsExtension,
    ExtendedKeyUsage,
    ExtendedKeyUsageExtension,
    KeyUsageFlags,
    KeyUsagesExtension,
    SubjectKeyIdentifierExtension,
    X509Certificate,
} from '@peculiar/x509';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { Crypto } from '../crypto';
import * as JUMBF from '../jumbf';
import { CBORBox } from '../jumbf';
import { ValidationError, ValidationResult, ValidationStatusCode } from '../manifest';
import { Timestamp, TimestampProvider } from '../rfc3161';
import { BinaryHelper, MalformedContentError } from '../util';
import { Algorithms, CoseAlgorithm } from './Algorithms';
import { Signer } from './Signer';
import { SigStructure } from './SigStructure';
import {
    AdditionalEKU,
    CoseSignature,
    ProtectedBucket,
    TimestampToken,
    TimestampVersion,
    TstContainer,
    UnprotectedBucket,
} from './types';

export class Signature {
    public algorithm?: CoseAlgorithm;
    public certificate?: X509Certificate;
    public chainCertificates: X509Certificate[] = [];
    public rawProtectedBucket?: Uint8Array;
    public signature?: Uint8Array;
    public timestampTokens: TimestampToken[] = [];
    public paddingLength = 0;

    private validatedTimestamp: Date | undefined;
    /**
     * Gets the validated timestamp or falls back to unverified timestamp
     * @returns Date object representing the timestamp, or undefined if no timestamp exists
     */
    public get timestamp() {
        return this.validatedTimestamp ?? this.getTimestampWithoutVerification();
    }

    /**
     * Reads a signature from JUMBF data
     * @param content - The JUMBF content to parse
     * @returns A new Signature instance
     * @throws MalformedContentError if content is malformed
     * @throws ValidationError if algorithm is unsupported
     */
    public static readFromJUMBFData(content: unknown) {
        const signature = new Signature();
        const rawContent = content as CoseSignature;

        let protectedBucket: ProtectedBucket | undefined;
        try {
            protectedBucket = JUMBF.CBORBox.decoder.decode(rawContent[0]) as ProtectedBucket;
        } catch {
            /* empty */
        }
        if (!protectedBucket) throw new MalformedContentError('Malformed protected bucket');
        signature.rawProtectedBucket = rawContent[0];

        const unprotectedBucket = rawContent[1];
        if (!unprotectedBucket) throw new MalformedContentError('Malformed unprotected bucket');

        if (unprotectedBucket.pad) {
            if (unprotectedBucket.pad.some(e => e !== 0)) throw new MalformedContentError('Malformed padding');
            signature.paddingLength = unprotectedBucket.pad.length;
        }

        const algorithm = protectedBucket['1'] ? Algorithms.getAlgorithm(protectedBucket['1']) : undefined;
        if (!algorithm) throw new ValidationError(ValidationStatusCode.AlgorithmUnsupported);
        signature.algorithm = algorithm;

        // Certificates may be stored using either the standardized label 33 or the string x5chain, and they
        // may be in either the protected or the unprotected header – but only one of those
        const x5chainCandidates = [
            protectedBucket['33'],
            protectedBucket.x5chain,
            unprotectedBucket['33'],
            unprotectedBucket.x5chain,
        ].filter(c => c !== undefined);

        if (x5chainCandidates.length !== 1) throw new MalformedContentError('Malformed credentials');
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        let x5chain = x5chainCandidates[0]!;
        if (!Array.isArray(x5chain)) x5chain = [x5chain];

        try {
            signature.certificate = new X509Certificate(x5chain[0] as Uint8Array<ArrayBuffer>);
            if (x5chain.length > 1) {
                signature.chainCertificates = x5chain
                    .slice(1)
                    .map(c => new X509Certificate(c as Uint8Array<ArrayBuffer>));
            }
        } catch {
            throw new MalformedContentError('Malformed credentials');
        }

        signature.signature = rawContent[3];

        signature.timestampTokens.push(
            ...Signature.readTimestamps(protectedBucket.sigTst ?? unprotectedBucket.sigTst, TimestampVersion.V1),
        );
        signature.timestampTokens.push(
            ...Signature.readTimestamps(protectedBucket.sigTst2 ?? unprotectedBucket.sigTst2, TimestampVersion.V2),
        );

        return signature;
    }

    private static *readTimestamps(container: TstContainer | undefined, version: TimestampVersion) {
        if (!container?.tstTokens?.length) return;
        for (const timestampToken of container.tstTokens) {
            try {
                yield { version, response: pkijs.TimeStampResp.fromBER(timestampToken.val as Uint8Array<ArrayBuffer>) };
            } catch {
                throw new MalformedContentError('Malformed timestamp');
            }
        }
    }

    /**
     * Writes the signature data to JUMBF format
     * @returns CoseSignature array containing the signature data
     * @throws Error if certificate or algorithm is missing
     */
    public writeJUMBFData(): CoseSignature {
        if (!this.certificate) throw new Error('Signature is missing certificate');
        if (!this.algorithm) throw new Error('Signature is missing algorithm');

        // Build the protected bucket containing alg identifier and certificates
        const protectedBucket: ProtectedBucket = {
            '1': this.algorithm.coseIdentifier,
            '33': [
                new Uint8Array(this.certificate.rawData),
                ...this.chainCertificates.map(cert => new Uint8Array(cert.rawData)),
            ],
        };
        this.rawProtectedBucket = JUMBF.CBORBox.encoder.encode(protectedBucket);

        // Build the unprotected bucket containing padding and timestamps
        const unprotectedBucket: UnprotectedBucket = { pad: new Uint8Array(this.paddingLength) };

        const timestampTokensV1 = this.timestampTokens.filter(token => token.version === TimestampVersion.V1);
        if (timestampTokensV1.length) {
            unprotectedBucket.sigTst = {
                tstTokens: timestampTokensV1.map(tst => ({ val: new Uint8Array(tst.response.toSchema().toBER()) })),
            };
        }
        const timestampTokensV2 = this.timestampTokens.filter(token => token.version === TimestampVersion.V2);
        if (timestampTokensV2.length) {
            unprotectedBucket.sigTst2 = {
                tstTokens: timestampTokensV2.map(tst => ({ val: new Uint8Array(tst.response.toSchema().toBER()) })),
            };
        }

        return [
            this.rawProtectedBucket,
            unprotectedBucket,
            null, // External data
            this.signature ?? new Uint8Array(), // Signature
        ];
    }

    /**
     * Signs the provided payload and optionally adds a timestamp
     * @param signer – Signer implementation providing the signature
     * @param payload - Data to be signed
     * @param timestampProvider - Optional provider for RFC3161 timestamp
     * @throws Error if protected bucket, algorithm or certificate is missing
     */
    public async sign(
        signer: Signer,
        payload: Uint8Array,
        timestampProvider?: TimestampProvider,
        timestampVersion: TimestampVersion = TimestampVersion.V2,
    ): Promise<void> {
        if (!this.rawProtectedBucket) throw new Error('Signature is missing protected bucket');
        if (!this.algorithm || !this.certificate) throw new Error('Signature is missing algorithm');

        const toBeSigned = new SigStructure('Signature1', this.rawProtectedBucket, payload).encode();
        this.signature = await signer.sign(toBeSigned);

        this.timestampTokens = [];
        if (timestampProvider) {
            const timestampResponse = await Timestamp.getTimestamp(
                timestampProvider,
                new SigStructure(
                    'CounterSignature',
                    this.rawProtectedBucket,
                    timestampVersion === TimestampVersion.V1 ? payload : CBORBox.encoder.encode(this.signature),
                ).encode(),
            );
            if (timestampResponse)
                this.timestampTokens.push({ version: timestampVersion, response: timestampResponse });
        }
    }

    private async validateTimestamp(
        v1Payload: Uint8Array,
        v2Payload: Uint8Array,
        sourceBox?: JUMBF.IBox,
    ): Promise<ValidationResult> {
        this.validatedTimestamp = undefined;

        const result = new ValidationResult();
        if (!this.timestampTokens.length || !this.rawProtectedBucket) return result;

        // Validate single timestamp requirement per spec v2.1
        if (this.timestampTokens.length > 1) {
            result.addError(ValidationStatusCode.TimeStampMalformed, sourceBox, 'Multiple timestamps are not allowed');
            return result;
        }

        for (const timestamp of this.timestampTokens) {
            if (
                timestamp.response.status.status !== pkijs.PKIStatus.granted &&
                timestamp.response.status.status !== pkijs.PKIStatus.grantedWithMods
            )
                continue;

            try {
                const signedData = new pkijs.SignedData({ schema: timestamp.response.timeStampToken!.content });
                const rawTstInfo = signedData.encapContentInfo.eContent!.getValue();
                const tstInfo = pkijs.TSTInfo.fromBER(rawTstInfo);

                const hashAlgorithm = Crypto.getHashAlgorithmByOID(tstInfo.messageImprint.hashAlgorithm.algorithmId);
                if (!hashAlgorithm) {
                    result.addError(
                        ValidationStatusCode.AlgorithmUnsupported,
                        sourceBox,
                        'Unsupported timestamp hash algorithm',
                    );
                    continue;
                }

                // Validate timestamp falls within signer validity
                if (this.certificate) {
                    if (tstInfo.genTime < this.certificate.notBefore || tstInfo.genTime > this.certificate.notAfter) {
                        result.addError(
                            ValidationStatusCode.TimeStampOutsideValidity,
                            sourceBox,
                            'Timestamp outside signer certificate validity period',
                        );
                        continue;
                    }
                }

                const toBeSigned = new SigStructure(
                    'CounterSignature',
                    this.rawProtectedBucket,
                    timestamp.version === TimestampVersion.V1 ? v1Payload : v2Payload,
                ).encode();

                if (
                    !BinaryHelper.bufEqual(
                        await Crypto.digest(toBeSigned, hashAlgorithm),
                        new Uint8Array(tstInfo.messageImprint.hashedMessage.getValue()),
                    )
                ) {
                    result.addError(ValidationStatusCode.TimeStampMismatch, sourceBox);
                    continue;
                }

                if (!(await this.verifySignedDataSignature(signedData))) {
                    result.addError(ValidationStatusCode.TimeStampMismatch, sourceBox);
                    continue;
                }

                // Validate TSA certificates
                for (const cert of signedData.certificates ?? []) {
                    if (!(cert instanceof pkijs.Certificate)) continue;
                    const x509Cert = new X509Certificate(cert.toSchema().toBER());
                    const certValidation = Signature.validateCertificate(x509Cert, tstInfo.genTime, false);
                    if (certValidation !== ValidationStatusCode.SigningCredentialTrusted) {
                        result.addError(ValidationStatusCode.TimeStampUntrusted, sourceBox);
                        continue;
                    }
                }

                this.validatedTimestamp = tstInfo.genTime;
                result.addInformational(ValidationStatusCode.TimeStampTrusted, sourceBox);
                break;
            } catch {
                result.addError(ValidationStatusCode.TimeStampMalformed, sourceBox);
                continue;
            }
        }

        return result;
    }

    private async verifySignedDataSignature(signedData: pkijs.SignedData): Promise<boolean> {
        if (!signedData.signerInfos.length) return false;
        const signerInfo = signedData.signerInfos[0];

        // Find the certificate referenced by sid
        let certificate = signedData.certificates?.[0];
        if (signerInfo.sid instanceof pkijs.IssuerAndSerialNumber) {
            const sid = signerInfo.sid;
            certificate = signedData.certificates?.find(
                cert =>
                    cert instanceof pkijs.Certificate &&
                    cert.issuer.isEqual(sid.issuer) &&
                    cert.serialNumber.isEqual(sid.serialNumber),
            );
        }
        if (!(certificate instanceof pkijs.Certificate)) return false;

        const signerHashAlgorithm = Crypto.getHashAlgorithmByOID(signerInfo.digestAlgorithm.algorithmId);
        if (!signerHashAlgorithm) return false;

        let payload = signedData.encapContentInfo.eContent?.getValue();
        if (!payload) return false;

        // If there are signedAttrs, they are signed and not the payload itself...
        if (signerInfo.signedAttrs) {
            // ...but the messageDigest attribute in the signedAttrs needs to match the payload
            const messageDigest = signerInfo.signedAttrs.attributes.find(attr => attr.type === '1.2.840.113549.1.9.4')
                ?.values?.[0] as asn1js.OctetString;

            if (
                !messageDigest?.valueBlock?.valueHexView?.length ||
                !BinaryHelper.bufEqual(
                    new Uint8Array(messageDigest.getValue()),
                    await Crypto.digest(new Uint8Array(payload), signerHashAlgorithm),
                )
            ) {
                return false;
            }

            payload = Signature.encodeSignedAttributes(signerInfo.signedAttrs.attributes);
        }

        let namedCurveOID: string | undefined = undefined;
        if (
            certificate.subjectPublicKeyInfo.algorithm.algorithmParams &&
            'getValue' in certificate.subjectPublicKeyInfo.algorithm.algorithmParams
        ) {
            namedCurveOID = (
                certificate.subjectPublicKeyInfo.algorithm.algorithmParams as asn1js.ObjectIdentifier
            ).getValue();
        }

        const signingAlgorithm = Crypto.getSigningAlgorithmByOID(
            certificate.subjectPublicKeyInfo.algorithm.algorithmId,
            signerHashAlgorithm,
            namedCurveOID,
        );
        if (!signingAlgorithm) return false;

        return Crypto.verifySignature(
            new Uint8Array(payload),
            new Uint8Array(signerInfo.signature.getValue()),
            new Uint8Array(certificate.subjectPublicKeyInfo.toSchema().toBER()),
            signingAlgorithm,
        );
    }

    private getTimestampWithoutVerification(): Date | undefined {
        for (const timestamp of this.timestampTokens) {
            if (
                timestamp.response.status.status !== pkijs.PKIStatus.granted &&
                timestamp.response.status.status !== pkijs.PKIStatus.grantedWithMods
            )
                continue;
            try {
                const signedData = new pkijs.SignedData({
                    schema: timestamp.response.timeStampToken!.content as unknown,
                });
                const tstInfo = pkijs.TSTInfo.fromBER(signedData.encapContentInfo.eContent!.getValue());
                return tstInfo.genTime;
            } catch {
                return undefined;
            }
        }
        return undefined;
    }

    /**
     * Encodes a set of CMS signed attributes according to DER encoding rules as specified in RFC 5652 section 5.4.
     * @param attributes – set of attributes
     * @returns DER encoded SignedAttributes structure
     */
    public static encodeSignedAttributes(attributes: pkijs.Attribute[]): ArrayBuffer {
        // In DER encoding, attributes need to be ordered by their encoded value
        const attributesWithEncodedValue = attributes.map(attr => ({
            attribute: attr,
            encodedValue: new Uint8Array(attr.toSchema().toBER()),
        }));

        attributesWithEncodedValue.sort((a, b) => {
            const aBytes = a.encodedValue;
            const bBytes = b.encodedValue;

            // 1. Compare bytes up to the shortest length
            const len = Math.min(aBytes.length, bBytes.length);
            for (let i = 0; i < len; i++) {
                if (aBytes[i] !== bBytes[i]) {
                    return aBytes[i] - bBytes[i];
                }
            }

            // 2. If one is a prefix of the other, the shorter one comes first
            return aBytes.length - bBytes.length;
        });

        // Create a new temporary SignedAndUnsignedAttributes structure with the sorted attributes
        const signedAttrs = new pkijs.SignedAndUnsignedAttributes({
            attributes: attributesWithEncodedValue.map(attr => attr.attribute),
            type: 0,
        });

        // Usually, the SignedAttributes schema has a context-specific tag of [0], however for message digest
        // calculation, this needs to be changed to the default universal SET tag.
        const asnSequence = signedAttrs.toSchema();
        asnSequence.idBlock.tagClass = 1;
        asnSequence.idBlock.tagNumber = 17;
        return asnSequence.toBER();
    }

    /**
     * Validates the signature against a payload
     * @param payload - The payload to validate against
     * @param sourceBox - Optional JUMBF box for error context
     * @returns Promise resolving to ValidationResult
     */
    public async validate(payload: Uint8Array, sourceBox?: JUMBF.IBox): Promise<ValidationResult> {
        if (!this.certificate || !this.rawProtectedBucket || !this.signature || !this.algorithm) {
            return ValidationResult.error(ValidationStatusCode.SigningCredentialInvalid, sourceBox);
        }

        const result = new ValidationResult();

        result.merge(await this.validateTimestamp(payload, CBORBox.encoder.encode(this.signature), sourceBox));
        const timestamp = this.validatedTimestamp ?? new Date();

        let code = Signature.validateCertificate(this.certificate, timestamp, true);
        if (code === ValidationStatusCode.SigningCredentialTrusted) {
            for (const chainCertificate of this.chainCertificates) {
                code = Signature.validateCertificate(chainCertificate, timestamp, false);
                if (code !== ValidationStatusCode.SigningCredentialTrusted) break;
            }
        }
        if (code === ValidationStatusCode.SigningCredentialTrusted) result.addInformational(code, sourceBox);
        else result.addError(code, sourceBox);

        try {
            const toBeSigned = new SigStructure('Signature1', this.rawProtectedBucket, payload).encode();

            if (
                await Crypto.verifySignature(
                    toBeSigned,
                    this.signature,
                    new Uint8Array(this.certificate.publicKey.rawData),
                    Algorithms.getCryptoAlgorithm(this.algorithm, this.certificate)!,
                )
            ) {
                result.addInformational(ValidationStatusCode.ClaimSignatureValidated, sourceBox);
            } else {
                result.addError(ValidationStatusCode.ClaimSignatureMismatch, sourceBox);
            }
        } catch {
            result.addError(ValidationStatusCode.ClaimSignatureMismatch, sourceBox);
        }

        return result;
    }

    private static validateCertificate(
        certificate: X509Certificate,
        validityTimestamp: Date,
        isUsedForManifestSigning: boolean,
    ): ValidationStatusCode {
        // TODO Actually verify the certificate chain

        const rawCertificate = AsnConvert.parse(certificate.rawData, ASN1Certificate).tbsCertificate;

        // TODO verify OCSP

        // Check various fields required by the C2PA specification
        if (rawCertificate.version !== ASN1Version.v3) return ValidationStatusCode.SigningCredentialInvalid;
        if (rawCertificate.issuerUniqueID !== undefined || rawCertificate.subjectUniqueID !== undefined)
            return ValidationStatusCode.SigningCredentialInvalid;

        if (certificate.subject === certificate.issuer) {
            // If self signed, disallow for manifest signing
            if (isUsedForManifestSigning) return ValidationStatusCode.SigningCredentialInvalid;
        } else {
            // If not self signed, the authority key identifier extension must be present
            if (!certificate.getExtension(AuthorityKeyIdentifierExtension))
                return ValidationStatusCode.SigningCredentialInvalid;
        }

        // Check key usage extensions
        const keyUsageError = this.validateCertificateKeyUsage(certificate, isUsedForManifestSigning);
        if (keyUsageError) return keyUsageError;

        if (isUsedForManifestSigning) {
            // Check for allowed signature algorithm
            const algorithmError = this.validateCertificateAlgorithm(certificate);
            if (algorithmError) return algorithmError;
        }

        // Check timestamp
        if (certificate.notBefore >= validityTimestamp || certificate.notAfter <= validityTimestamp)
            return ValidationStatusCode.SigningCredentialExpired;

        return ValidationStatusCode.SigningCredentialTrusted;
    }

    private static validateCertificateKeyUsage(
        certificate: X509Certificate,
        isUsedForManifestSigning: boolean,
    ): ValidationStatusCode | undefined {
        const basicConstraints = certificate.getExtension(BasicConstraintsExtension);
        const keyUsages = certificate.getExtension(KeyUsagesExtension);
        const extendedKeyUsages = certificate.getExtension(ExtendedKeyUsageExtension);

        // Key usage extension must be present and marked as critical
        if (!keyUsages?.critical) return ValidationStatusCode.SigningCredentialInvalid;

        // If this certificate is used for claim signatures it needs to have the proper key usage flag
        if (isUsedForManifestSigning && !(keyUsages.usages & KeyUsageFlags.digitalSignature))
            return ValidationStatusCode.SigningCredentialInvalid;

        // The certificate signing key usage may only be present for CA certificates
        if (keyUsages.usages & KeyUsageFlags.keyCertSign && !basicConstraints?.ca)
            return ValidationStatusCode.SigningCredentialInvalid;

        if (!basicConstraints?.ca) {
            // Non-CA certificates have extended key usage (EKU) requirements
            if (!extendedKeyUsages) return ValidationStatusCode.SigningCredentialInvalid;

            // EKU type "any" is not allowed
            if (extendedKeyUsages?.usages.includes(AdditionalEKU.any))
                return ValidationStatusCode.SigningCredentialInvalid;

            // Certificates that are used for claim signatures need to have certain EKUs
            if (isUsedForManifestSigning) {
                // TODO Configuration store EKU validation currently not implemented
                if (
                    !extendedKeyUsages.usages.includes(ExtendedKeyUsage.emailProtection) &&
                    !extendedKeyUsages.usages.includes(AdditionalEKU.documentSigning)
                ) {
                    return ValidationStatusCode.SigningCredentialInvalid;
                }
            }

            // Certificates that have the time stamping or OCSP signing EKU must not be valid for any other usage
            if (
                extendedKeyUsages.usages.includes(ExtendedKeyUsage.timeStamping) &&
                extendedKeyUsages.usages.length !== 1
            )
                return ValidationStatusCode.SigningCredentialInvalid;
            if (
                extendedKeyUsages.usages.includes(ExtendedKeyUsage.ocspSigning) &&
                extendedKeyUsages.usages.length !== 1
            )
                return ValidationStatusCode.SigningCredentialInvalid;
        } else {
            // CA certificates must have the Subject Key Identifier extension
            if (!certificate.getExtension(SubjectKeyIdentifierExtension))
                return ValidationStatusCode.SigningCredentialInvalid;
        }

        return undefined;
    }

    private static validateCertificateAlgorithm(certificate: X509Certificate): ValidationStatusCode | undefined {
        const signatureAlgorithm = certificate.signatureAlgorithm;
        if (
            signatureAlgorithm.name !== 'RSASSA-PKCS1-v1_5' &&
            signatureAlgorithm.name !== 'RSA-PSS' &&
            signatureAlgorithm.name !== 'ECDSA' &&
            signatureAlgorithm.name !== 'Ed25519'
        ) {
            return ValidationStatusCode.AlgorithmUnsupported;
        }

        // All signature algorithms except Ed25519 require specific hash algorithms
        if (
            signatureAlgorithm.name !== 'Ed25519' &&
            signatureAlgorithm.hash.name !== 'SHA-256' &&
            signatureAlgorithm.hash.name !== 'SHA-384' &&
            signatureAlgorithm.hash.name !== 'SHA-512'
        ) {
            return ValidationStatusCode.AlgorithmUnsupported;
        }

        // Check parameters for specific public key algorithms
        const pubKeyAlgorithm = certificate.publicKey.algorithm;

        if (pubKeyAlgorithm.name === 'RSASSA-PKCS1-v1_5' || pubKeyAlgorithm.name === 'RSA-PSS') {
            // RSA keys require minimum modulus length
            if ((pubKeyAlgorithm as RsaHashedKeyAlgorithm).modulusLength < 2048) {
                return ValidationStatusCode.SigningCredentialInvalid;
            }
        } else if (pubKeyAlgorithm.name === 'ECDSA') {
            // ECDSA keys require specific curves
            const curve = (pubKeyAlgorithm as EcKeyAlgorithm).namedCurve;
            if (curve !== 'P-256' && curve !== 'P-384' && curve !== 'P-521') {
                return ValidationStatusCode.SigningCredentialInvalid;
            }
        }
        // Any other public key algorithms are valid as certificates but will fail when used for signature
        // creation/validation as there aren't any matching allowed COSE algorithms

        return undefined;
    }
}
