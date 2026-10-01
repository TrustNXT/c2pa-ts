import { NamedActorRole, SignatureType, VerifiedIdentity } from '../cawg';
import { privateJwkToPublicJwk } from '../cawg/utils';
import { CoseAlgorithmIdentifier } from '../cose/Algorithms';
import { Crypto, ECDSASigningAlgorithm, Ed25519SigningAlgorithm, RSASigningAlgorithm } from '../crypto';
import { BinaryHelper } from '../util/BinaryHelper';
import { IdentitySigner } from './identity-signer';

export interface LocalIdentitySignerOptions {
    readonly verifiedIdentity: VerifiedIdentity | VerifiedIdentity[];
    readonly roles: NamedActorRole[];
    readonly sigType?: SignatureType;
    readonly issuerDid?: string;
}

export class LocalIdentitySigner implements IdentitySigner {
    get signingAlgorithm(): ECDSASigningAlgorithm | RSASigningAlgorithm | Ed25519SigningAlgorithm {
        switch (this.algorithm) {
            case CoseAlgorithmIdentifier.ES256:
                return { name: 'ECDSA', hash: 'SHA-256', namedCurve: 'P-256' };
            case CoseAlgorithmIdentifier.ES384:
                return { name: 'ECDSA', hash: 'SHA-384', namedCurve: 'P-384' };
            case CoseAlgorithmIdentifier.ES512:
                return { name: 'ECDSA', hash: 'SHA-512', namedCurve: 'P-521' };
            case CoseAlgorithmIdentifier.PS256:
                return { name: 'RSA-PSS', hash: 'SHA-256', saltLength: 32 };
            case CoseAlgorithmIdentifier.PS384:
                return { name: 'RSA-PSS', hash: 'SHA-384', saltLength: 48 };
            case CoseAlgorithmIdentifier.PS512:
                return { name: 'RSA-PSS', hash: 'SHA-512', saltLength: 64 };
            case CoseAlgorithmIdentifier.Ed25519:
            default:
                return { name: 'Ed25519' };
        }
    }

    get issuerDid(): Promise<string> {
        if (this.options.issuerDid) {
            return Promise.resolve(this.options.issuerDid);
        } else {
            return this.getDefaultDid();
        }
    }

    get verifiedIdentity(): VerifiedIdentity | VerifiedIdentity[] {
        return this.options.verifiedIdentity;
    }

    get roles(): NamedActorRole[] {
        return this.options.roles;
    }

    get signatureType(): SignatureType {
        return this.options.sigType ?? SignatureType.IdentityClaimsAggregation;
    }

    /**
     * Creates a signer instance using a private key.
     * @param privateKey - Private key in PKCS#8 format
     * @param signingAlgorithm – algorithm identifier
     */
    constructor(
        private readonly privateKey: Uint8Array,
        readonly algorithm: CoseAlgorithmIdentifier,
        private readonly options: LocalIdentitySignerOptions,
    ) {}

    public sign(payload: Uint8Array): Promise<Uint8Array> {
        return Crypto.sign(payload, this.privateKey, this.signingAlgorithm);
    }

    public async getDefaultDid(): Promise<string> {
        const privateKey = await crypto.subtle.importKey(
            'pkcs8',
            new Uint8Array(this.privateKey),
            this.signingAlgorithm,
            true,
            ['sign'],
        );
        const privateJwk = await crypto.subtle.exportKey('jwk', privateKey);
        const publicJwk = privateJwkToPublicJwk(privateJwk);
        const canonicalJwk = Object.fromEntries(Object.entries(publicJwk).sort(([a], [b]) => a.localeCompare(b)));
        const base64 = BinaryHelper.bytesToBase64Url(new TextEncoder().encode(JSON.stringify(canonicalJwk)));
        return `did:jwk:${base64}`;
    }
}
