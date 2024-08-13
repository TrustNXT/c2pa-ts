import { HashAlgorithm } from '../crypto';
import * as JUMBF from '../jumbf';
import * as raw from './rawTypes';
import { ClaimVersion, HashedURI, ManifestComponent, ValidationStatusCode } from './types';
import { ValidationError } from './ValidationError';

export class Claim implements ManifestComponent {
    public version: ClaimVersion = ClaimVersion.V2;
    public defaultAlgorithm: HashAlgorithm | undefined;
    public instanceID: string | undefined;
    public format: string | undefined;
    public assertions: HashedURI[] = [];
    public redactedAssertions: HashedURI[] = [];
    public sourceBox?: JUMBF.SuperBox;
    public signatureRef?: string;

    public get label(): string {
        return this.version === ClaimVersion.V2 ? 'c2pa.claim.v2' : 'c2pa.claim';
    }

    public static read(box: JUMBF.SuperBox) {
        if (!box.contentBoxes.length || !(box.contentBoxes[0] instanceof JUMBF.CBORBox))
            throw new ValidationError(ValidationStatusCode.ClaimRequiredMissing, box, 'Claim has invalid content box');

        const claim = new Claim();
        claim.sourceBox = box;

        if (!box.descriptionBox?.label)
            throw new ValidationError(ValidationStatusCode.ClaimRequiredMissing, box, 'Claim is missing label');

        const claimContent = box.contentBoxes[0].content as raw.Claim;

        if (claimContent.alg) {
            claim.defaultAlgorithm = Claim.mapHashAlgorithm(claimContent.alg);
            if (!claim.defaultAlgorithm) throw new ValidationError(ValidationStatusCode.AlgorithmUnsupported, box);
        }

        if (box.descriptionBox.label === 'c2pa.claim.v2') {
            claim.version = ClaimVersion.V2;
            const fullContent = claimContent as raw.ClaimV2;
            claim.instanceID = fullContent.instanceID;
            claim.assertions = fullContent.created_assertions.map(a => claim.mapHashedURI(a));
        } else if (box.descriptionBox.label === 'c2pa.claim') {
            claim.version = ClaimVersion.V1;
            const fullContent = claimContent as raw.ClaimV1;
            claim.instanceID = fullContent.instanceID;
            claim.format = fullContent['dc:format'];
            claim.assertions = fullContent.assertions.map(a => claim.mapHashedURI(a));
        } else {
            throw new ValidationError(ValidationStatusCode.ClaimRequiredMissing, box, 'Claim has invalid label');
        }

        claim.signatureRef = claimContent.signature;
        claim.redactedAssertions = claimContent.redacted_assertions?.map(a => claim.mapHashedURI(a)) ?? [];

        return claim;
    }

    public generateJUMBFBox(): JUMBF.SuperBox {
        if (!this.instanceID) throw new Error('Claim: missing instanceID');

        const box = new JUMBF.SuperBox();
        box.descriptionBox = new JUMBF.DescriptionBox();
        box.descriptionBox.label = this.label;
        box.descriptionBox.uuid = raw.UUIDs.claim;
        const contentBox = new JUMBF.CBORBox();
        box.contentBoxes.push(contentBox);
        switch (this.version) {
            case ClaimVersion.V1:
                if (!this.format) throw new Error('Claim: missing format');

                contentBox.content = {
                    alg: Claim.reverseMapHashAlgorithm(this.defaultAlgorithm),
                    instanceID: this.instanceID,
                    signature: this.signatureRef,
                    // TODO: we should define our own generator name including a version,
                    // like 'make_test_images/0.16.1 c2pa-rs/0.16.1'
                    claim_generator: 'c2pa-ts',
                    'dc:format': this.format,
                    assertions: this.assertions.map(assertion => this.reverseMapHashedURI(assertion)),
                } as raw.ClaimV1;
                break;
            case ClaimVersion.V2:
                contentBox.content = {
                    alg: Claim.reverseMapHashAlgorithm(this.defaultAlgorithm),
                    instanceID: this.instanceID,
                    signature: this.signatureRef,
                    claim_generator_info: {
                        name: 'c2pa-ts',
                    } as raw.ClaimGeneratorInfo,
                    created_assertions: this.assertions.map(assertion => this.reverseMapHashedURI(assertion)),
                } as raw.ClaimV2;
                break;
        }

        this.sourceBox = box;
        return this.sourceBox;
    }

    public static mapHashAlgorithm(alg: raw.HashAlgorithm | undefined): HashAlgorithm | undefined {
        switch (alg) {
            case 'sha256':
                return 'SHA-256';
            case 'sha384':
                return 'SHA-384';
            case 'sha512':
                return 'SHA-512';
            default:
                return undefined;
        }
    }

    public static reverseMapHashAlgorithm(alg: HashAlgorithm | undefined): raw.HashAlgorithm | undefined {
        switch (alg) {
            case 'SHA-256':
                return 'sha256';
            case 'SHA-384':
                return 'sha384';
            case 'SHA-512':
                return 'sha512';
            default:
                return undefined;
        }
    }

    public mapHashedURI(hashedURI: raw.HashedURI): HashedURI {
        const algorithm = Claim.mapHashAlgorithm(hashedURI.alg) ?? this.defaultAlgorithm;
        if (!algorithm) throw new ValidationError(ValidationStatusCode.AlgorithmUnsupported, hashedURI.url);

        return {
            uri: hashedURI.url,
            hash: hashedURI.hash,
            algorithm,
        };
    }

    public reverseMapHashedURI(hashedURI: HashedURI): raw.HashedURI {
        if (hashedURI.algorithm === this.defaultAlgorithm) {
            // don't store the algorithm redundantly if it's the default
            return {
                url: hashedURI.uri,
                hash: hashedURI.hash,
            };
        } else {
            return {
                url: hashedURI.uri,
                hash: hashedURI.hash,
                alg: Claim.reverseMapHashAlgorithm(hashedURI.algorithm),
            };
        }
    }

    public getBytes(): Uint8Array {
        return (this.sourceBox!.contentBoxes[0] as JUMBF.CBORBox).rawContent!;
    }
}
