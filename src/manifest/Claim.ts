import { v4 as uuidv4 } from 'uuid';
import { Crypto, HashAlgorithm } from '../crypto';
import * as JUMBF from '../jumbf';
import { Version } from '../util';
import * as raw from './rawTypes';
import {
    C2PA_URN_PREFIX_V1,
    C2PA_URN_PREFIX_V2,
    ClaimVersion,
    HashedURI,
    ManifestComponent,
    ValidationStatusCode,
} from './types';
import { ValidationError } from './ValidationError';

export class Claim implements ManifestComponent {
    private _version: ClaimVersion = ClaimVersion.V2;
    private _label = 'c2pa.claim.v2';

    public defaultAlgorithm: HashAlgorithm | undefined;
    public instanceID: string | undefined;
    public format: string | undefined;
    public title: string | undefined;
    public assertions: HashedURI[] = [];
    public redactedAssertions: HashedURI[] = [];
    public gatheredAssertions: HashedURI[] = [];
    public sourceBox?: JUMBF.SuperBox;
    public signatureRef?: string;
    public claimGeneratorName = Version.productName;
    public claimGeneratorVersion? = Version.productVersion;
    public claimGeneratorInfo?: string;
    public versionReason?: string;

    /**
     * Gets the version of the claim
     * @returns The claim version
     */
    public get version(): ClaimVersion {
        return this._version;
    }

    /**
     * Sets the version of the claim and updates the label accordingly
     * @param value - The new claim version
     */
    public set version(value: ClaimVersion) {
        this._version = value;
        this._label = this.version === ClaimVersion.V2 ? 'c2pa.claim.v2' : 'c2pa.claim';
    }

    /**
     * Gets the label for this claim
     * @returns The claim label string
     */
    public get label(): string {
        return this._label;
    }

    /**
     * Reads a claim from a JUMBF box
     * @param box - The JUMBF box to read from
     * @returns A new Claim instance
     * @throws ValidationError if the box is invalid or has unsupported algorithm
     */
    public static read(box: JUMBF.SuperBox) {
        if (!box.contentBoxes.length || !(box.contentBoxes[0] instanceof JUMBF.CBORBox))
            throw new ValidationError(ValidationStatusCode.ClaimCBORInvalid, box, 'Claim has invalid content box');

        const claim = new Claim();
        claim.sourceBox = box;

        if (!box.descriptionBox?.label)
            throw new ValidationError(ValidationStatusCode.ClaimCBORInvalid, box, 'Claim is missing label');

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
            claim.gatheredAssertions = fullContent.gathered_assertions?.map(a => claim.mapHashedURI(a)) ?? [];
            claim.redactedAssertions = fullContent.redacted_assertions?.map(a => claim.mapHashedURI(a)) ?? [];
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
            throw new ValidationError(ValidationStatusCode.ClaimCBORInvalid, box, 'Claim has invalid label');
        }

        claim.signatureRef = claimContent.signature;
        claim.redactedAssertions = claimContent.redacted_assertions?.map(a => claim.mapHashedURI(a)) ?? [];

        return claim;
    }

    /**
     * Generates a JUMBF box containing the claim
     * @returns The generated JUMBF box
     * @throws Error if required fields are missing
     */
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
                    gathered_assertions: this.gatheredAssertions.map(assertion => this.reverseMapHashedURI(assertion)),
                    redacted_assertions: this.redactedAssertions.map(assertion => this.reverseMapHashedURI(assertion)),
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

    /**
     * Maps a raw hash algorithm string to internal HashAlgorithm type
     * @param alg - The raw hash algorithm string
     * @returns The mapped HashAlgorithm or undefined if not supported
     */
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

    /**
     * Maps internal HashAlgorithm type to raw hash algorithm string
     * @param alg - The HashAlgorithm to map
     * @returns The raw hash algorithm string or undefined if not supported
     */
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

    /**
     * Maps a raw HashedURI to internal HashedURI type
     * @param hashedURI - The raw HashedURI to map
     * @returns The mapped HashedURI
     * @throws ValidationError if algorithm is unsupported
     */
    public mapHashedURI(hashedURI: raw.HashedURI): HashedURI {
        const algorithm = Claim.mapHashAlgorithm(hashedURI.alg) ?? this.defaultAlgorithm;
        if (!algorithm) throw new ValidationError(ValidationStatusCode.AlgorithmUnsupported, hashedURI.url);

        return {
            uri: hashedURI.url,
            hash: hashedURI.hash,
            algorithm,
        };
    }

    /**
     * Maps internal HashedURI type to raw HashedURI
     * @param hashedURI - The HashedURI to map
     * @returns The raw HashedURI
     */
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

    /**
     * Gets the bytes representation of the claim
     * @param claim - The claim to get bytes for
     * @param rebuild - Whether to rebuild the JUMBF box before getting bytes
     * @returns Uint8Array of bytes or undefined if no source box exists
     */
    public getBytes(claim: Claim, rebuild = false): Uint8Array | undefined {
        if (rebuild) this.generateJUMBFBox();
        return (this.sourceBox?.contentBoxes[0] as JUMBF.CBORBox | undefined)?.rawContent;
    }

    /**
     * Generates a URN for the claim based on its version
     * For v1: urn:uuid:{uuid}
     * For v2: urn:c2pa:{uuid}[:{generatorInfo}][:{versionReason}]
     * @returns The generated URN string
     */
    public getURN(): string {
        const uuid = uuidv4({ random: Crypto.getRandomValues(16) });

        switch (this.version) {
            case ClaimVersion.V1: {
                return `${C2PA_URN_PREFIX_V1}${uuid}`;
            }
            case ClaimVersion.V2: {
                let urn = `${C2PA_URN_PREFIX_V2}${uuid}`;
                if (this.claimGeneratorInfo || this.versionReason) {
                    urn += `:${this.claimGeneratorInfo ?? ''}`;
                }
                if (this.versionReason) {
                    urn += `:${this.versionReason}`;
                }
                return urn;
            }
        }
    }
}
