import { X509Certificate } from '@peculiar/x509';
import * as asn1js from 'asn1js';
import {
    AlgorithmIdentifier,
    Certificate,
    ContentInfo,
    EncapsulatedContentInfo,
    IssuerAndSerialNumber,
    PKIStatus,
    PKIStatusInfo,
    SignedData,
    SignerInfo,
    TimeStampReq,
    TimeStampResp,
    TSTInfo,
} from 'pkijs';
import { Crypto, HashAlgorithm } from '../crypto';
import { TimestampProvider } from './TimestampProvider';

/** Dummy TSA policy OID from the TrustNXT space */
const DUMMY_POLICY_OID = '1.3.6.1.4.1.63572.999.999.999';

/**
 * Timestamp provider that creates a signed timestamp based on the local machine's current time
 * and the supplied certificate and private key.
 *
 * @remarks
 * This is mostly intended for local testing.
 */
export class LocalTimestampProvider implements TimestampProvider {
    private readonly certificate: Certificate;
    private readonly chainCertificates: Certificate[];

    public constructor(
        certificate: X509Certificate,
        public readonly privateKey: Uint8Array,
        chainCertificates: X509Certificate[] = [],
    ) {
        // Re-read certificates as pkijs.Certificate
        this.certificate = Certificate.fromBER(certificate.rawData);
        this.chainCertificates = chainCertificates.map(c => Certificate.fromBER(c.rawData));
    }

    public async getSignedTimestamp(request: TimeStampReq) {
        const serialNumber = Crypto.getRandomValues(10);

        const tstInfo = new TSTInfo({
            version: 1,
            policy: request.reqPolicy ?? DUMMY_POLICY_OID,
            messageImprint: request.messageImprint,
            serialNumber: new asn1js.Integer({ valueHex: serialNumber }),
            genTime: new Date(),
            ordering: true,
            nonce: request.nonce,
        });

        let namedCurveOID: string | undefined = undefined;
        if (
            this.certificate.subjectPublicKeyInfo.algorithm.algorithmParams &&
            'getValue' in this.certificate.subjectPublicKeyInfo.algorithm.algorithmParams
        ) {
            namedCurveOID = (
                this.certificate.subjectPublicKeyInfo.algorithm.algorithmParams as asn1js.ObjectIdentifier
            ).getValue();
        }

        let hashAlgorithm: HashAlgorithm = 'SHA-256';
        const signatureAlgorithm = Crypto.getSigningAlgorithmByOID(
            this.certificate.subjectPublicKeyInfo.algorithm.algorithmId,
            hashAlgorithm,
            namedCurveOID,
        );
        if (!signatureAlgorithm) throw new Error('Unsupported signature algorithm');
        if ('hash' in signatureAlgorithm) hashAlgorithm = signatureAlgorithm.hash;

        const payload = new Uint8Array(tstInfo.toSchema().toBER());
        const signature = await Crypto.sign(payload, this.privateKey, signatureAlgorithm);

        const signatureAlgorithmIdentifier = new AlgorithmIdentifier({
            algorithmId: Crypto.getSigningAlgorithmOID(signatureAlgorithm),
            algorithmParams: new asn1js.Null(),
        });
        if ('namedCurve' in signatureAlgorithm) {
            signatureAlgorithmIdentifier.algorithmParams = new asn1js.ObjectIdentifier({
                value: Crypto.getNamedCurveOID(signatureAlgorithm.namedCurve),
            });
        }

        const encapContentInfo = new EncapsulatedContentInfo({
            eContentType: '1.2.840.113549.1.9.16.1.4', // "tSTInfo" content type
        });
        // Passing eContent to the EncapsulatedContentInfo constructor causes it to be split into 64 kB chunks,
        // thereby converting it into a "constructed" octet string instead of a "primitive" octet string. Some
        // timestamp response parsers expect DER encoded content here only, which disallows constructed strings.
        // To work around this, we set the eContent _after_ constructing the EncapsulatedContentInfo to ensure
        // that it remains untouched. This is fine for our use case as our content (TSTInfo) will always be
        // small enough for a primitive string.
        encapContentInfo.eContent = new asn1js.OctetString({ valueHex: payload.buffer });

        const cmsSigned = new SignedData({
            version: 3,
            encapContentInfo,
            signerInfos: [
                new SignerInfo({
                    version: 1,
                    sid: new IssuerAndSerialNumber({
                        issuer: this.certificate.issuer,
                        serialNumber: this.certificate.serialNumber,
                    }),
                    digestAlgorithm: new AlgorithmIdentifier({
                        algorithmId: Crypto.getHashAlgorithmOID(hashAlgorithm),
                        algorithmParams: new asn1js.Null(),
                    }),
                    signatureAlgorithm: signatureAlgorithmIdentifier,
                    signature: new asn1js.OctetString({ valueHex: signature }),
                }),
            ],
            certificates: [this.certificate, ...this.chainCertificates],
        });

        return new TimeStampResp({
            status: new PKIStatusInfo({ status: PKIStatus.granted }),
            timeStampToken: new ContentInfo({
                schema: new ContentInfo({
                    contentType: ContentInfo.SIGNED_DATA,
                    content: cmsSigned.toSchema(true) as unknown,
                }).toSchema(),
            }),
        });
    }
}
