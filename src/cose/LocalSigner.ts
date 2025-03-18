import { X509Certificate } from '@peculiar/x509';
import { Crypto } from '../crypto';
import { Algorithms } from './Algorithms';
import { Signer } from './Signer';

export class LocalSigner implements Signer {
    /**
     * Creates a signer instance using a certificate and given private key.
     * @param privateKey - Private key in PKCS#8 format
     * @param algorithm – COSE algorithm identifier matching the private key
     * @param certificate – The X.509 certificate to use for signing
     * @param chainCertificates – Additional certificates to include in the certificate chain
     */
    public constructor(
        private privateKey: Uint8Array,
        public algorithm: COSEAlgorithmIdentifier,
        public certificate: X509Certificate,
        public chainCertificates: X509Certificate[] = [],
    ) {}

    public async sign(payload: Uint8Array): Promise<Uint8Array> {
        return await Crypto.sign(
            payload,
            this.privateKey,
            Algorithms.getCryptoAlgorithm(Algorithms.getAlgorithm(this.algorithm), this.certificate)!,
        );
    }
}
