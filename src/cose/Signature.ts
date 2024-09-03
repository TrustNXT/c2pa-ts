import * as asn1RSA from '@peculiar/asn1-rsa';
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
import { PKIStatus, SignedData, TimeStampResp, TSTInfo } from 'pkijs';
import { Crypto, ECDSANamedCurve, HashAlgorithm, SigningAlgorithm } from '../crypto';
import * as JUMBF from '../jumbf';
import { ValidationError, ValidationResult, ValidationStatusCode } from '../manifest';
import { Timestamp, TimestampProvider } from '../rfc3161';
import { BinaryHelper, MalformedContentError } from '../util';
import { Algorithms, CoseAlgorithm } from './Algorithms';
import { SigStructure } from './SigStructure';
import { AdditionalEKU, CoseSignature, ProtectedBucket, UnprotectedBucket } from './types';

export class Signature {
    public algorithm?: CoseAlgorithm;
    public certificate?: X509Certificate;
    public chainCertificates: X509Certificate[] = [];
    public rawProtectedBucket?: Uint8Array;
    public signature?: Uint8Array;
    public timeStampResponses: TimeStampResp[] = [];
    public paddingLength = 0;

    private validatedTimestamp: Date | undefined;
    public get timestamp() {
        return this.validatedTimestamp ?? this.getTimestampWithoutVerification();
    }

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
        const x5chain = x5chainCandidates[0]!;

        try {
            signature.certificate = new X509Certificate(x5chain[0]);
            if (x5chain.length > 1) {
                signature.chainCertificates = x5chain.slice(1).map(c => new X509Certificate(c));
            }
        } catch {
            throw new MalformedContentError('Malformed credentials');
        }

        signature.signature = rawContent[3];

        const sigTst = protectedBucket.sigTst ?? unprotectedBucket.sigTst;
        if (sigTst?.tstTokens?.length) {
            for (const timestampToken of sigTst.tstTokens) {
                try {
                    signature.timeStampResponses.push(TimeStampResp.fromBER(timestampToken.val));
                } catch {
                    throw new MalformedContentError('Malformed timestamp');
                }
            }
        }

        return signature;
    }

    public writeJUMBFData(): CoseSignature {
        if (!this.certificate) throw new Error('Signature is missing certificate');
        if (!this.algorithm) throw new Error('Signature is missing algorithm');

        const protectedBucket: ProtectedBucket = {
            '1': this.algorithm.coseIdentifier,
            '33': [
                new Uint8Array(this.certificate.rawData),
                ...this.chainCertificates.map(cert => new Uint8Array(cert.rawData)),
            ],
        };
        this.rawProtectedBucket = JUMBF.CBORBox.encoder.encode(protectedBucket);

        const unprotectedBucket: UnprotectedBucket = {
            pad: new Uint8Array(this.paddingLength),
        };
        if (this.timeStampResponses.length) {
            unprotectedBucket.sigTst = {
                tstTokens: this.timeStampResponses.map(tst => ({
                    val: new Uint8Array(tst.toSchema().toBER()),
                })),
            };
        }

        return [
            this.rawProtectedBucket,
            unprotectedBucket,
            null, // External data
            this.signature ?? new Uint8Array(), // Signature
        ];
    }

    public async sign(
        privateKey: Uint8Array,
        payload: Uint8Array,
        timestampProvider?: TimestampProvider,
    ): Promise<void> {
        if (!this.rawProtectedBucket) throw new Error('Signature is missing protected bucket');
        if (!this.algorithm || !this.certificate) throw new Error('Signature is missing algorithm');

        const toBeSigned = new SigStructure('Signature1', this.rawProtectedBucket, payload).encode();
        this.signature = await Crypto.sign(toBeSigned, privateKey, this.getSigningAlgorithm()!);

        this.timeStampResponses = [];
        if (timestampProvider) {
            const timestampResponse = await Timestamp.getTimestamp(
                timestampProvider,
                new SigStructure('CounterSignature', this.rawProtectedBucket, payload).encode(),
            );
            if (timestampResponse) this.timeStampResponses.push(timestampResponse);
        }
    }

    private async getTimestamp(payload: Uint8Array): Promise<Date | undefined> {
        if (!this.timeStampResponses.length || !this.rawProtectedBucket) return undefined;

        const toBeSigned = new SigStructure('CounterSignature', this.rawProtectedBucket, payload).encode();

        for (const timestamp of this.timeStampResponses) {
            if (timestamp.status.status !== PKIStatus.granted && timestamp.status.status !== PKIStatus.grantedWithMods)
                continue;

            try {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const signedData = new SignedData({ schema: timestamp.timeStampToken!.content });
                const tstInfo = TSTInfo.fromBER(signedData.encapContentInfo.eContent!.valueBlock.valueHexView);

                let hashAlgorithm: HashAlgorithm;
                switch (tstInfo.messageImprint.hashAlgorithm.algorithmId) {
                    case asn1RSA.id_sha256:
                        hashAlgorithm = 'SHA-256';
                        break;
                    case asn1RSA.id_sha384:
                        hashAlgorithm = 'SHA-384';
                        break;
                    case asn1RSA.id_sha512:
                        hashAlgorithm = 'SHA-512';
                        break;
                    default:
                        // algorithm.unsupported
                        continue;
                }

                if (
                    !BinaryHelper.bufEqual(
                        await Crypto.digest(toBeSigned, hashAlgorithm),
                        tstInfo.messageImprint.hashedMessage.valueBlock.valueHexView,
                    )
                ) {
                    // timeStamp.untrusted
                    continue;
                }

                // TODO More thorough validation:
                // - Validate each certificate (otherwise: timeStamp.untrusted)
                // - Configure trusted list (otherwise: timeStamp.untrusted)
                // - Check that attested timestamp falls within signer validity (otherwise: timeStamp.outsideValidity)
                return tstInfo.genTime;
            } catch {
                continue;
            }
        }

        return undefined;
    }

    private getTimestampWithoutVerification(): Date | undefined {
        for (const timestamp of this.timeStampResponses) {
            if (timestamp.status.status !== PKIStatus.granted && timestamp.status.status !== PKIStatus.grantedWithMods)
                continue;
            try {
                const signedData = new SignedData({ schema: timestamp.timeStampToken!.content as unknown });
                const tstInfo = TSTInfo.fromBER(signedData.encapContentInfo.eContent!.valueBlock.valueHexView);
                return tstInfo.genTime;
            } catch {
                return undefined;
            }
        }
        return undefined;
    }

    public async validate(payload: Uint8Array, sourceBox?: JUMBF.IBox): Promise<ValidationResult> {
        if (!this.certificate || !this.rawProtectedBucket || !this.signature || !this.algorithm) {
            return ValidationResult.error(ValidationStatusCode.SigningCredentialInvalid, sourceBox);
        }

        const result = new ValidationResult();

        let timestamp = await this.getTimestamp(payload);
        if (timestamp) {
            result.addInformational(ValidationStatusCode.TimeStampTrusted, sourceBox);
            this.validatedTimestamp = timestamp;
        } else {
            timestamp = new Date();
            this.validatedTimestamp = undefined;
        }

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
                    this.getSigningAlgorithm()!,
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

    private getSigningAlgorithm(): SigningAlgorithm | undefined {
        if (!this.algorithm || !this.certificate) return undefined;

        if (this.algorithm.alg.name === 'ECDSA') {
            return {
                ...this.algorithm.alg,
                namedCurve: (this.certificate.publicKey.algorithm as EcKeyAlgorithm).namedCurve as ECDSANamedCurve,
            };
        }
        return this.algorithm.alg;
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

        // Check for allowed signature algorithm
        const algorithmError = this.validateCertificateAlgorithm(certificate);
        if (algorithmError) return algorithmError;

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
            // Non-CA certificates must have the Subject Key Identifier extension
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
