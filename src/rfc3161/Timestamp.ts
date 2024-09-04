import * as asn1js from 'asn1js';
import { AlgorithmIdentifier, MessageImprint, TimeStampReq, TimeStampResp } from 'pkijs';
import { Crypto, HashAlgorithm } from '../crypto';
import { TimestampProvider } from './TimestampProvider';

export class Timestamp {
    private constructor() {}

    public static async getTimestamp(
        provider: TimestampProvider,
        payload: Uint8Array,
        algorithm: HashAlgorithm = 'SHA-256',
    ): Promise<TimeStampResp | undefined> {
        const request = new TimeStampReq({
            version: 1,
            messageImprint: new MessageImprint({
                hashAlgorithm: new AlgorithmIdentifier({
                    algorithmId: Crypto.getHashAlgorithmOID(algorithm),
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
