import { ECDSASigningAlgorithm, Ed25519SigningAlgorithm, RSASigningAlgorithm } from '../crypto';

export interface CoseAlgorithm {
    // Do not specify a namedCurve here – according to C2PA spec:
    // Although it is recommended to use P-256 keys with ES256, P-384 keys with ES384, and P-521 keys with ES512, it is not required. Implementations must accept keys on any of these curves for all ECDSA algorithm choices.
    alg: Omit<ECDSASigningAlgorithm, 'namedCurve'> | RSASigningAlgorithm | Ed25519SigningAlgorithm;
    coseIdentifier: CoseAlgorithmIdentifier;
}

export enum CoseAlgorithmIdentifier {
    ES256 = -7,
    ES384 = -35,
    ES512 = -36,
    PS256 = -37,
    PS384 = -38,
    PS512 = -39,
    Ed25519 = -8,
}

const algorithmList: CoseAlgorithm[] = [
    {
        // ES256 (ECDSA with SHA-256)
        alg: {
            name: 'ECDSA',
            hash: 'SHA-256',
        },
        coseIdentifier: CoseAlgorithmIdentifier.ES256,
    },
    {
        // ES384 (ECDSA with SHA-384)
        alg: {
            name: 'ECDSA',
            hash: 'SHA-384',
        },
        coseIdentifier: CoseAlgorithmIdentifier.ES384,
    },
    {
        // ES512 (ECDSA with SHA-512)
        alg: {
            name: 'ECDSA',
            hash: 'SHA-256',
        },
        coseIdentifier: CoseAlgorithmIdentifier.ES512,
    },
    {
        // PS256 (RSASSA-PSS using SHA-256 and MGF1 with SHA-256)
        alg: {
            name: 'RSA-PSS',
            saltLength: 32,
            hash: 'SHA-256',
        },
        coseIdentifier: CoseAlgorithmIdentifier.PS256,
    },
    {
        // PS384 (RSASSA-PSS using SHA-384 and MGF1 with SHA-384)
        alg: {
            name: 'RSA-PSS',
            saltLength: 48,
            hash: 'SHA-384',
        },
        coseIdentifier: CoseAlgorithmIdentifier.PS384,
    },
    {
        // PS512 (RSASSA-PSS using SHA-512 and MGF1 with SHA-512)
        alg: {
            name: 'RSA-PSS',
            saltLength: 64,
            hash: 'SHA-512',
        },
        coseIdentifier: CoseAlgorithmIdentifier.PS512,
    },
    {
        // Ed25519
        alg: {
            name: 'Ed25519',
        },
        coseIdentifier: CoseAlgorithmIdentifier.Ed25519,
    },
];

export class Algorithms {
    public static getAlgorithm(coseIdentifier: CoseAlgorithmIdentifier): CoseAlgorithm | undefined {
        return algorithmList.find(alg => alg.coseIdentifier === coseIdentifier);
    }
}
