import { type X509Certificate } from '@peculiar/x509';
import { type CoseAlgorithmIdentifier } from './Algorithms';

export interface Signer {
    sign(payload: Uint8Array): Promise<Uint8Array>;
    certificate: X509Certificate;
    chainCertificates: X509Certificate[];
    algorithm: CoseAlgorithmIdentifier;
}
