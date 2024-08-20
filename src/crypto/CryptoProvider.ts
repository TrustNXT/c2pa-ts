import { HashAlgorithm, SigningAlgorithm, StreamingDigest } from './types';

export interface CryptoProvider {
    digest(data: Uint8Array, algorithm: HashAlgorithm): Promise<Uint8Array>;

    streamingDigest(algorithm: HashAlgorithm): StreamingDigest;

    verifySignature(
        payload: Uint8Array,
        signature: Uint8Array,
        publicKey: Uint8Array,
        algorithm: SigningAlgorithm,
    ): Promise<boolean>;

    sign(payload: Uint8Array, privateKey: Uint8Array, algorithm: SigningAlgorithm): Promise<Uint8Array>;
}
