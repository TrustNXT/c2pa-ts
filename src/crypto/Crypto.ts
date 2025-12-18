import { CryptoProvider } from './CryptoProvider';
import { ECDSANamedCurve, HashAlgorithm, SigningAlgorithm, StreamingDigest } from './types';
import { WebCryptoProvider } from './WebCryptoProvider';

const OIDs = {
    SHA256: '2.16.840.1.101.3.4.2.1',
    SHA384: '2.16.840.1.101.3.4.2.2',
    SHA512: '2.16.840.1.101.3.4.2.3',
    RSAEncryption: '1.2.840.113549.1.1.1',
    SHA256withRSA: '1.2.840.113549.1.1.11',
    SHA384withRSA: '1.2.840.113549.1.1.12',
    SHA512withRSA: '1.2.840.113549.1.1.13',
    ECPublicKey: '1.2.840.10045.2.1',
    ECDSAwithSHA256: '1.2.840.10045.4.3.2',
    ECDSAwithSHA384: '1.2.840.10045.4.3.3',
    ECDSAwithSHA512: '1.2.840.10045.4.3.4',
    SECP256r1: '1.2.840.10045.3.1.7',
    SECP384r1: '1.3.132.0.34',
    SECP521r1: '1.3.132.0.35',
    Ed25519: '1.3.101.112',
};

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
     * Calculates the hash of a Blob with exclusions
     * @param blob
     * @param algorithm
     * @param exclusions
     */
    public static async calculateBlobHash(
        blob: Blob,
        algorithm: HashAlgorithm,
        exclusions: { start: number; length: number }[],
    ): Promise<Uint8Array> {
        const digest = this.streamingDigest(algorithm);
        let pos = 0;

        const updateDigest = async (part: Blob) => {
            digest.update(new Uint8Array(await part.arrayBuffer()));
        };

        for (const ex of [...exclusions].sort((a, b) => a.start - b.start)) {
            if (ex.start > pos) await updateDigest(blob.slice(pos, ex.start));
            pos = ex.start + ex.length;
        }

        if (pos < blob.size) await updateDigest(blob.slice(pos));

        return digest.final();
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

    /**
     * Generates a cryptographic signature
     * @param payload
     * @param privateKey DER encoded private key
     * @param algorithm
     */
    public static sign(payload: Uint8Array, privateKey: Uint8Array, algorithm: SigningAlgorithm): Promise<Uint8Array> {
        return this.provider.sign(payload, privateKey, algorithm);
    }

    /**
     * Returns the digest length for the given algorithm
     * @param algorithm
     */
    public static getDigestLength(algorithm: HashAlgorithm): number {
        switch (algorithm) {
            case 'SHA-256':
                return 32;
            case 'SHA-384':
                return 48;
            case 'SHA-512':
                return 64;
        }
    }

    /**
     * Generates random bytes
     * @param length
     */
    public static getRandomValues(length: number): Uint8Array {
        return this.provider.getRandomValues(length);
    }

    /**
     * Returns a supported hash algorithm from an OID
     */
    public static getHashAlgorithmByOID(oid: string): HashAlgorithm | undefined {
        switch (oid) {
            case OIDs.SHA256:
                return 'SHA-256';
            case OIDs.SHA384:
                return 'SHA-384';
            case OIDs.SHA512:
                return 'SHA-512';
        }
    }

    /**
     * Returns the OID for a hash algorithm
     */
    public static getHashAlgorithmOID(algorithm: HashAlgorithm): string {
        switch (algorithm) {
            case 'SHA-256':
                return OIDs.SHA256;
            case 'SHA-384':
                return OIDs.SHA384;
            case 'SHA-512':
                return OIDs.SHA512;
        }
    }

    /**
     * Returns a supported signature algorithm from an OID
     * @param oid Algorithm OID
     * @param hashAlgorithm The hash algorithm used (required if not included in OID)
     * @param curveOID Named curve OID (required for ECDSA)
     */
    public static getSigningAlgorithmByOID(
        oid: string,
        hashAlgorithm?: HashAlgorithm,
        curveOID?: string,
    ): SigningAlgorithm | undefined {
        const namedCurve = curveOID ? this.getNamedCurveByOID(curveOID) : undefined;

        switch (oid) {
            case OIDs.RSAEncryption:
                if (!hashAlgorithm) throw new Error('Hash algorithm required for RSA');
                return {
                    name: 'RSASSA-PKCS1-v1_5',
                    hash: hashAlgorithm,
                };
            case OIDs.SHA256withRSA:
                return {
                    name: 'RSA-PSS',
                    hash: 'SHA-256',
                    saltLength: 32,
                };
            case OIDs.SHA384withRSA:
                return {
                    name: 'RSA-PSS',
                    hash: 'SHA-384',
                    saltLength: 48,
                };
            case OIDs.SHA512withRSA:
                return {
                    name: 'RSA-PSS',
                    hash: 'SHA-512',
                    saltLength: 64,
                };
            case OIDs.ECPublicKey:
                if (!hashAlgorithm) throw new Error('Hash algorithm required for EC');
                if (!namedCurve) throw new Error('Named curve required for EC');
                return {
                    name: 'ECDSA',
                    namedCurve,
                    hash: hashAlgorithm,
                };
            case OIDs.ECDSAwithSHA256:
                if (!namedCurve) throw new Error('Named curve required for EC');
                return {
                    name: 'ECDSA',
                    namedCurve,
                    hash: 'SHA-256',
                };
            case OIDs.ECDSAwithSHA384:
                if (!namedCurve) throw new Error('Named curve required for EC');
                return {
                    name: 'ECDSA',
                    namedCurve,
                    hash: 'SHA-384',
                };
            case OIDs.ECDSAwithSHA512:
                if (!namedCurve) throw new Error('Named curve required for EC');
                return {
                    name: 'ECDSA',
                    namedCurve,
                    hash: 'SHA-512',
                };
            case OIDs.Ed25519:
                return {
                    name: 'Ed25519',
                };
        }
    }

    /**
     * Returns the OID for a signing algorithm
     */
    public static getSigningAlgorithmOID(algorithm: SigningAlgorithm): string {
        switch (algorithm.name) {
            case 'RSASSA-PKCS1-v1_5':
                return OIDs.RSAEncryption;
            case 'RSA-PSS':
                switch (algorithm.hash) {
                    case 'SHA-256':
                        return OIDs.SHA256withRSA;
                    case 'SHA-384':
                        return OIDs.SHA384withRSA;
                    case 'SHA-512':
                        return OIDs.SHA512withRSA;
                }
            // eslint-disable-next-line no-fallthrough
            case 'ECDSA':
                switch (algorithm.hash) {
                    case 'SHA-256':
                        return OIDs.ECDSAwithSHA256;
                    case 'SHA-384':
                        return OIDs.ECDSAwithSHA384;
                    case 'SHA-512':
                        return OIDs.ECDSAwithSHA512;
                }
            // eslint-disable-next-line no-fallthrough
            case 'Ed25519':
                return OIDs.Ed25519;
        }
    }

    /**
     * Returns an ECDSA named curve from an OID
     */
    public static getNamedCurveByOID(oid: string): ECDSANamedCurve | undefined {
        switch (oid) {
            case OIDs.SECP256r1:
                return 'P-256';
            case OIDs.SECP384r1:
                return 'P-384';
            case OIDs.SECP521r1:
                return 'P-521';
        }
    }

    /**
     * Returns the OID for an ECDSA named curve
     */
    public static getNamedCurveOID(namedCurve: ECDSANamedCurve): string {
        switch (namedCurve) {
            case 'P-256':
                return OIDs.SECP256r1;
            case 'P-384':
                return OIDs.SECP384r1;
            case 'P-521':
                return OIDs.SECP521r1;
        }
    }
}
