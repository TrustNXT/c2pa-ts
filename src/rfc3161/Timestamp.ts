import * as asn1js from 'asn1js';
import { AlgorithmIdentifier, MessageImprint, TimeStampReq, TimeStampResp } from 'pkijs';
import { Crypto, HashAlgorithm } from '../crypto';
import { TimestampProvider } from './TimestampProvider';

export class Timestamp {
    private constructor() {}

    private static getOID(algorithm: HashAlgorithm) {
        switch (algorithm) {
            case 'SHA-256':
                return '2.16.840.1.101.3.4.2.1';
            case 'SHA-384':
                return '2.16.840.1.101.3.4.2.2';
            case 'SHA-512':
                return '2.16.840.1.101.3.4.2.3';
        }
    }

    public static async getTimestamp(
        provider: TimestampProvider,
        payload: Uint8Array,
        algorithm: HashAlgorithm = 'SHA-256',
    ): Promise<TimeStampResp | undefined> {
        const request = new TimeStampReq({
            version: 1,
            messageImprint: new MessageImprint({
                hashAlgorithm: new AlgorithmIdentifier({
                    algorithmId: this.getOID(algorithm),
                    algorithmParams: new asn1js.Null(),
                }),
                hashedMessage: new asn1js.OctetString({ valueHex: await Crypto.digest(payload, algorithm) }),
            }),
            certReq: true,
            nonce: new asn1js.Integer({ valueHex: Crypto.getRandomValues(10) }),
        });

        return provider.getSignedTimestamp(request);
    }
}
