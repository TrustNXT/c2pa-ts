import { HashAlgorithm } from '../crypto';
import * as JUMBF from '../jumbf';
import { Version } from '../util';
import * as raw from './rawTypes';
import { ClaimVersion, HashedURI, ManifestComponent, ValidationStatusCode } from './types';
import { ValidationError } from './ValidationError';

export class Claim implements ManifestComponent {
    public version: ClaimVersion = ClaimVersion.V2;
    public defaultAlgorithm: HashAlgorithm | undefined;
    public instanceID: string | undefined;
    public format: string | undefined;
    public title: string | undefined;
    public assertions: HashedURI[] = [];
    public redactedAssertions: HashedURI[] = [];
    public sourceBox?: JUMBF.SuperBox;
    public signatureRef?: string;
    public claimGeneratorName = Version.productName;
    public claimGeneratorVersion? = Version.productVersion;

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

        claim.title = claimContent['dc:title'];
        claim.instanceID = claimContent.instanceID;

        if (box.descriptionBox.label === 'c2pa.claim.v2') {
            claim.version = ClaimVersion.V2;
            const fullContent = claimContent as raw.ClaimV2;
            claim.claimGeneratorName = fullContent.claim_generator_info?.name;
            claim.claimGeneratorVersion = fullContent.claim_generator_info?.version;
            claim.assertions = fullContent.created_assertions.map(a => claim.mapHashedURI(a));
        } else if (box.descriptionBox.label === 'c2pa.claim') {
            claim.version = ClaimVersion.V1;
            const fullContent = claimContent as raw.ClaimV1;
            claim.format = fullContent['dc:format'];
            if (fullContent.claim_generator_info?.length) {
                claim.claimGeneratorName = fullContent.claim_generator_info[0].name;
                claim.claimGeneratorVersion = fullContent.claim_generator_info[0].version;
            } else {
                claim.claimGeneratorName = fullContent.claim_generator;
                claim.claimGeneratorVersion = undefined;
            }
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
        if (!this.signatureRef) throw new Error('Claim: missing signature');

        const box = new JUMBF.SuperBox();
        box.descriptionBox = new JUMBF.DescriptionBox();
        box.descriptionBox.label = this.label;
        box.descriptionBox.uuid = raw.UUIDs.claim;
        const contentBox = new JUMBF.CBORBox();
        box.contentBoxes.push(contentBox);

        const claimGenerator: raw.ClaimGeneratorInfo = { name: this.claimGeneratorName };
        if (this.claimGeneratorVersion) claimGenerator.version = this.claimGeneratorVersion;

        switch (this.version) {
            case ClaimVersion.V1: {
                if (!this.format) throw new Error('Claim: missing format');

                const content: raw.ClaimV1 = {
                    alg: Claim.reverseMapHashAlgorithm(this.defaultAlgorithm),
                    instanceID: this.instanceID,
                    signature: this.signatureRef,
                    claim_generator:
                        this.claimGeneratorVersion ?
                            `${this.claimGeneratorName}/${this.claimGeneratorVersion}`
                        :   this.claimGeneratorName,
                    claim_generator_info: [claimGenerator],
                    'dc:format': this.format,
                    assertions: this.assertions.map(assertion => this.reverseMapHashedURI(assertion)),
                };

                if (this.title) content['dc:title'] = this.title;

                contentBox.content = content;
                break;
            }
            case ClaimVersion.V2: {
                const content: raw.ClaimV2 = {
                    alg: Claim.reverseMapHashAlgorithm(this.defaultAlgorithm),
                    instanceID: this.instanceID,
                    signature: this.signatureRef,
                    claim_generator_info: claimGenerator,
                    created_assertions: this.assertions.map(assertion => this.reverseMapHashedURI(assertion)),
                };

                if (this.title) content['dc:title'] = this.title;

                contentBox.content = content;
                break;
            }
        }

        // Rebuild the CBOR encoding so we can later get the claim bytes for the signature
        contentBox.generateRawContent();
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

    public getBytes(claim: Claim, rebuild = false): Uint8Array | undefined {
        if (rebuild) this.generateJUMBFBox();
        return (this.sourceBox?.contentBoxes[0] as JUMBF.CBORBox | undefined)?.rawContent;
    }
}
