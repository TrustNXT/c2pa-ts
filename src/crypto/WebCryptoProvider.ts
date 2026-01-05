import { sha256, sha384, sha512 } from '@noble/hashes/sha2.js';
import { id_rsaEncryption, id_RSASSA_PSS } from '@peculiar/asn1-rsa';
import { AsnConvert } from '@peculiar/asn1-schema';
import { AlgorithmIdentifier, SubjectPublicKeyInfo } from '@peculiar/asn1-x509';
import { AsnEcSignatureFormatter } from '@peculiar/x509';
import { CryptoProvider } from './CryptoProvider';
import { HashAlgorithm, SigningAlgorithm, StreamingDigest } from './types';

export class WebCryptoProvider implements CryptoProvider {
    public async digest(data: Uint8Array, algorithm: HashAlgorithm): Promise<Uint8Array> {
        return new Uint8Array(await crypto.subtle.digest(algorithm, data as BufferSource));
    }

    public streamingDigest(algorithm: HashAlgorithm): StreamingDigest {
        let hash: { update(data: Uint8Array): void; digest(): Uint8Array };

        switch (algorithm) {
            case 'SHA-256':
                hash = sha256.create();
                break;
            case 'SHA-384':
                hash = sha384.create();
                break;
            case 'SHA-512':
                hash = sha512.create();
                break;
            default:
                throw new Error(`Unsupported hash algorithm: ${algorithm as string}`);
        }

        return {
            update(data: Uint8Array) {
                hash.update(data);
            },
            async final() {
                return new Uint8Array(hash.digest());
            },
        };
    }

    public async verifySignature(
        payload: Uint8Array,
        signature: Uint8Array,
        publicKey: Uint8Array,
        algorithm: SigningAlgorithm,
    ): Promise<boolean> {
        // Convert RSA-PSS keys to RSA-PKCS1
        const asnSpki = AsnConvert.parse(publicKey, SubjectPublicKeyInfo);
        if (asnSpki.algorithm.algorithm === id_RSASSA_PSS) {
            asnSpki.algorithm = new AlgorithmIdentifier({
                algorithm: id_rsaEncryption,
                parameters: null,
            });
            publicKey = new Uint8Array(AsnConvert.serialize(asnSpki));
        }

        const key = await crypto.subtle.importKey('spki', publicKey as BufferSource, algorithm, true, ['verify']);

        // Convert ECDSA signature from ASN.1 representation to IEEE P1363 representation if necessary
        if (algorithm.name === 'ECDSA') {
            const curveSize = AsnEcSignatureFormatter.namedCurveSize.get(algorithm.namedCurve);
            if (curveSize && signature.length !== curveSize * 2) {
                const convertedSignature = new AsnEcSignatureFormatter().toWebSignature(
                    algorithm,
                    signature as BufferSource,
                );
                if (convertedSignature) signature = new Uint8Array(convertedSignature);
            }
        }

        return crypto.subtle.verify(algorithm, key, signature as BufferSource, payload as BufferSource);
    }

    public async sign(payload: Uint8Array, privateKey: Uint8Array, algorithm: SigningAlgorithm): Promise<Uint8Array> {
        const key = await crypto.subtle.importKey('pkcs8', privateKey as BufferSource, algorithm, true, ['sign']);
        return new Uint8Array(await crypto.subtle.sign(algorithm, key, payload as BufferSource));
    }

    public getRandomValues(count: number): Uint8Array {
        const bytes = new Uint8Array(count);
        crypto.getRandomValues(bytes);
        return bytes;
    }
}
