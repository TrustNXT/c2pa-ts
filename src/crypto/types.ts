export type HashAlgorithm = 'SHA-256' | 'SHA-384' | 'SHA-512';

export type ECDSANamedCurve = 'P-256' | 'P-384' | 'P-521';

export interface ECDSASigningAlgorithm {
    name: 'ECDSA';
    namedCurve: ECDSANamedCurve;
    hash: HashAlgorithm;
}

export interface RSASigningAlgorithm {
    name: 'RSA-PSS';
    saltLength: number;
    hash: HashAlgorithm;
}

export interface Ed25519SigningAlgorithm {
    name: 'Ed25519';
}

export type SigningAlgorithm = ECDSASigningAlgorithm | RSASigningAlgorithm | Ed25519SigningAlgorithm;

export interface StreamingDigest {
    update(data: Uint8Array): void;
    final(): Promise<Uint8Array>;
}
