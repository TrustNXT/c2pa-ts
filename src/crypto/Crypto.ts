import { CryptoProvider } from './CryptoProvider';
import { HashAlgorithm, SigningAlgorithm, StreamingDigest } from './types';
import { WebCryptoProvider } from './WebCryptoProvider';

export class Crypto {
    public static provider: CryptoProvider = new WebCryptoProvider();

    /**
     * Computes the digest of given data
     * @param data
     * @param algorithm
     */
    public static digest(data: Uint8Array, algorithm: HashAlgorithm): Promise<Uint8Array> {
        return this.provider.digest(data, algorithm);
    }

    /**
     * Returns a streaming digest instance
     * @param algorithm
     */
    public static streamingDigest(algorithm: HashAlgorithm): StreamingDigest {
        return this.provider.streamingDigest(algorithm);
    }

    /**
     * Verifies a cryptographic signature
     * @param payload
     * @param signature
     * @param publicKey DER encoded public key
     * @param algorithm
     */
    public static verifySignature(
        payload: Uint8Array,
        signature: Uint8Array,
        publicKey: Uint8Array,
        algorithm: SigningAlgorithm,
    ): Promise<boolean> {
        return this.provider.verifySignature(payload, signature, publicKey, algorithm);
    }
}
