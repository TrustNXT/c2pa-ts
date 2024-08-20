import { id_rsaEncryption, id_RSASSA_PSS } from '@peculiar/asn1-rsa';
import { AsnConvert } from '@peculiar/asn1-schema';
import { AlgorithmIdentifier, SubjectPublicKeyInfo } from '@peculiar/asn1-x509';
import { AsnEcSignatureFormatter } from '@peculiar/x509';
import { CryptoProvider } from './CryptoProvider';
import { HashAlgorithm, SigningAlgorithm, StreamingDigest } from './types';

export class WebCryptoProvider implements CryptoProvider {
    public async digest(data: Uint8Array, algorithm: HashAlgorithm): Promise<Uint8Array> {
        return new Uint8Array(await crypto.subtle.digest(algorithm, data));
    }

    public streamingDigest(algorithm: HashAlgorithm): StreamingDigest {
        const fragments: Uint8Array[] = [];
        return {
            update(data: Uint8Array) {
                fragments.push(data);
            },
            async final() {
                // WebCrypto does not support streaming digests so we need to copy everything into one big buffer
                const hashSource = new Uint8Array(fragments.reduce((acc, cur) => acc + cur.length, 0));
                let offset = 0;
                for (const fragment of fragments) {
                    hashSource.set(fragment, offset);
                    offset += fragment.length;
                }
                return new Uint8Array(await crypto.subtle.digest(algorithm, hashSource));
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

        const key = await crypto.subtle.importKey('spki', publicKey, algorithm, true, ['verify']);

        // Convert ECDSA signature from ASN.1 representation to IEEE P1363 representation if necessary
        if (algorithm.name === 'ECDSA') {
            const curveSize = AsnEcSignatureFormatter.namedCurveSize.get(algorithm.namedCurve);
            if (curveSize && signature.length !== curveSize * 2) {
                const convertedSignature = new AsnEcSignatureFormatter().toWebSignature(algorithm, signature);
                if (convertedSignature) signature = new Uint8Array(convertedSignature);
            }
        }

        return crypto.subtle.verify(algorithm, key, signature, payload);
    }

    public async sign(payload: Uint8Array, privateKey: Uint8Array, algorithm: SigningAlgorithm): Promise<Uint8Array> {
        const key = await crypto.subtle.importKey('pkcs8', privateKey, algorithm, true, ['sign']);
        let signature = await crypto.subtle.sign(algorithm, key, payload);

        // Convert ECDSA signature from IEEE P1363 representation to ASN.1 representation
        if (algorithm.name === 'ECDSA') {
            const convertedSignature = new AsnEcSignatureFormatter().toAsnSignature(algorithm, signature);
            if (convertedSignature) signature = convertedSignature;
        }

        return new Uint8Array(signature);
    }

    public getRandomValues(count: number): Uint8Array {
        const bytes = new Uint8Array(count);
        crypto.getRandomValues(bytes);
        return bytes;
    }
}
