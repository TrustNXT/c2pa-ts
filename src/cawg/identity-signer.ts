import { NamedActorRole, SignatureType, VerifiedIdentity } from '../cawg';
import { Signer } from '../cose/Signer';

export interface IdentitySigner extends Pick<Signer, 'sign' | 'algorithm'> {
    verifiedIdentity: VerifiedIdentity | VerifiedIdentity[];
    roles: NamedActorRole[];
    signatureType: SignatureType;
    issuerDid: Promise<string>;
}
