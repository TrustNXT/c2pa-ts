import { Asset, BMFF, BMFFBox } from '../../asset';
import { Crypto, HashAlgorithm } from '../../crypto';
import * as JUMBF from '../../jumbf';
import { BinaryHelper } from '../../util';
import { Claim } from '../Claim';
import * as raw from '../rawTypes';
import { HashExclusionRange, ValidationStatusCode } from '../types';
import { ValidationError } from '../ValidationError';
import { ValidationResult } from '../ValidationResult';
import { Assertion } from './Assertion';
import { AssertionLabels } from './AssertionLabels';
import { AssertionUtils } from './AssertionUtils';
import { HashAssertion } from './HashAssertion';

const DEFAULT_ASSERTION_VERSION = 3;

interface DataMap {
    offset: number;
    value: Uint8Array;
}

interface SubsetMap {
    offset: number;
    length: number;
}

interface Exclusion {
    xpath: string;
    length?: number;
    data?: DataMap[];
    subset?: SubsetMap[];
    version?: number;
    flags?: Uint8Array;
    exact?: boolean;
}

interface RawMerkleMap {
    uniqueId: number;
    localId: number;
    count: number;
    alg?: raw.HashAlgorithm;
    initHash?: Uint8Array;
    hashes: Uint8Array[];
    fixedBlockSize?: number;
    variableBlockSizes?: number[];
}

interface RawDataHashMap {
    exclusions?: Exclusion[];
    alg?: raw.HashAlgorithm;
    hash?: Uint8Array;
    merkle?: RawMerkleMap[];
    name?: string;
}

export class BMFFHashAssertion extends Assertion implements HashAssertion {
    private _version: number = DEFAULT_ASSERTION_VERSION;
    public uuid = raw.UUIDs.cborAssertion;

    public exclusions: Exclusion[] = [];
    public algorithm?: HashAlgorithm;
    public hash?: Uint8Array;
    public name: string | undefined;
    public merkle?: RawMerkleMap[] = [];
    public paddingLength = 0;

    constructor(version?: number) {
        super();
        this._version = version ?? DEFAULT_ASSERTION_VERSION;
        this.setLabelBasedOnVersion();
    }

    private setLabelBasedOnVersion() {
        switch (this._version) {
            case 2:
                this.label = AssertionLabels.bmffV2Hash;
                break;
            case 3:
                this.label = AssertionLabels.bmffV3Hash;
                break;
            default:
                throw new Error('Unsupported BMFF hash version');
        }
    }

    /**
     * Gets the version of the assertion based on its label.
     * @returns {number} The version of the assertion.
     */
    public get version(): number {
        return this._version;
    }

    /**
     * Reads content from a JUMBF box and populates the assertion properties.
     * @param box - The JUMBF box containing the assertion data.
     * @throws {ValidationError} If the box is not a valid CBOR box or if the content is invalid.
     */
    public readContentFromJUMBF(box: JUMBF.IBox): void {
        if (!(box instanceof JUMBF.CBORBox) || !this.uuid || !BinaryHelper.bufEqual(this.uuid, raw.UUIDs.cborAssertion))
            throw new ValidationError(
                ValidationStatusCode.AssertionCBORInvalid,
                this.sourceBox,
                'BMFF hash assertion has invalid type',
            );

        const content = box.content as RawDataHashMap;

        this.hash = content.hash;
        this.algorithm = Claim.mapHashAlgorithm(content.alg);
        this.name = content.name;
        this.merkle = content.merkle;

        if (content.exclusions) {
            for (const exclusion of content.exclusions) {
                if (!exclusion.xpath)
                    throw new ValidationError(ValidationStatusCode.AssertionCBORInvalid, this.sourceBox);

                this.exclusions.push(exclusion);
            }
        }
    }

    /**
     * Generates a JUMBF box containing the assertion content.
     * @returns {JUMBF.IBox} The generated JUMBF box.
     */
    public generateJUMBFBoxForContent(): JUMBF.IBox {
        const box = new JUMBF.CBORBox();
        box.content = {
            exclusions: this.exclusions,
            alg: Claim.reverseMapHashAlgorithm(this.algorithm),
            hash: this.hash,
            merkle: this.merkle,
            name: this.name,
            pad: new Uint8Array(this.paddingLength),
        };
        return box;
    }

    /**
     * Validates the assertion against a given asset.
     * @param asset - The asset to validate against.
     * @returns {Promise<ValidationResult>} The result of the validation.
     */
    public async validateAgainstAsset(asset: Asset): Promise<ValidationResult> {
        if (!this.hash || !this.algorithm) {
            return ValidationResult.error(ValidationStatusCode.AssertionCBORInvalid, this.sourceBox);
        }

        if (!(asset instanceof BMFF)) {
            return ValidationResult.error(ValidationStatusCode.AssertionBMFFHashMismatch, this.sourceBox);
        }

        if (this.merkle?.length) {
            return this.validateMerkleTree(asset);
        }

        const hash = await this.hashBMFFWithExclusions(asset);
        if (BinaryHelper.bufEqual(hash, this.hash)) {
            return ValidationResult.success(ValidationStatusCode.AssertionBMFFHashMatch, this.sourceBox);
        } else {
            return ValidationResult.error(ValidationStatusCode.AssertionBMFFHashMismatch, this.sourceBox);
        }
    }

    private async getMatchingBoxForExclusion(exclusion: Exclusion, asset: BMFF): Promise<BMFFBox<object> | undefined> {
        // A box matches an exclusion entry in the exclusions array if and only if all of the following conditions are met:

        // The box's location in the file exactly matches the exclusions-map entry's xpath field.
        const box = asset.getBoxByPath(exclusion.xpath);
        if (!box) return undefined;

        // If length is specified in the exclusions-map entry, the box's length exactly matches the exclusions-map entry's length field.
        if (exclusion.length && box.size !== exclusion.length) return undefined;

        // If version is specified in the exclusions-map entry, the box is a FullBox and the box's version exactly matches the exclusions-map entry's version field.
        if (exclusion.version && !('version' in box.payload && box.payload.version === exclusion.version))
            return undefined;

        // If flags (byte array of exactly 3 bytes) is specified in the exclusions-map entry and the box is a FullBox.
        if (exclusion.flags) {
            if (!('flags' in box.payload)) return undefined;

            const boxFlags = box.payload.flags as Uint8Array;
            if (exclusion.flags.length !== 3 || boxFlags.length !== 3) return undefined;

            // If exact is set to true or not specified, the box's flags (bit(24), i.e., 3 bytes) also exactly matches the exclusions-map entry's flags field.
            if (exclusion.exact === undefined || exclusion.exact) {
                if (!BinaryHelper.bufEqual(exclusion.flags, boxFlags)) return undefined;
            } else {
                // If exact is set to false, the bitwise-and of the box's flags (bit(24), i.e., 3 bytes) with the exclusions-map entry's flags field exactly matches the exclusions-map entry's flags field.
                for (let i = 0; i < 3; i++) {
                    if ((exclusion.flags[i] & boxFlags[i]) !== exclusion.flags[i]) {
                        return undefined;
                    }
                }
            }
        }

        // If data (array of objects) is specified in the exclusions-map entry, then for each item in the array, the box's binary data at that item's relative byte offset field exactly matches that item's bytes field.
        for (const data of exclusion.data ?? []) {
            if (
                !BinaryHelper.bufEqual(
                    data.value,
                    await asset.getDataRange(box.offset + data.offset, data.value.length),
                )
            ) {
                return undefined;
            }
        }

        return box;
    }

    private async hashBMFFWithExclusions(asset: BMFF): Promise<Uint8Array> {
        if (!this.algorithm) {
            throw new ValidationError(
                ValidationStatusCode.AssertionCBORInvalid,
                this.sourceBox,
                'No algorithm specified',
            );
        }

        // For any top-level boxes that aren't excluded in their entirety, an offset marker needs to be added to the hash stream
        const markers = new Set(asset.getTopLevelBoxes().map(box => box.offset));

        const exclusionRanges: HashExclusionRange[] = [];

        for (const exclusion of this.exclusions) {
            const box = await this.getMatchingBoxForExclusion(exclusion, asset);
            if (!box) continue;

            if (exclusion.subset) {
                for (const subset of exclusion.subset) {
                    if (subset.offset > box.size) continue;
                    exclusionRanges.push({
                        start: box.offset + subset.offset,
                        length:
                            subset.length === 0 ?
                                box.size - subset.offset
                            :   Math.min(subset.length, box.size - subset.offset),
                    });
                }
            } else {
                markers.delete(box.offset);

                exclusionRanges.push({
                    start: box.offset,
                    length: box.size,
                });
            }
        }

        for (const marker of markers) {
            exclusionRanges.push({
                start: marker,
                length: 0,
                offsetMarker: true,
            });
        }

        return AssertionUtils.hashWithExclusions(asset, exclusionRanges, this.algorithm);
    }

    private async validateMerkleTree(asset: BMFF): Promise<ValidationResult> {
        const result = new ValidationResult();

        for (const tree of this.merkle!) {
            // Per spec 15.12.2.1: Validate count matches hashes length
            if (tree.count !== tree.hashes.length) {
                return ValidationResult.error(ValidationStatusCode.AssertionBMFFHashMalformed, this.sourceBox);
            }

            // Per spec 15.12.2: For non-fragmented MP4, validate mdat chunks
            const chunks = await this.getChunks(asset, tree);
            if (chunks.length !== tree.count) {
                return ValidationResult.error(ValidationStatusCode.AssertionBMFFHashMalformed, this.sourceBox);
            }

            // Per spec 15.12.2.1: Compare leaf node hashes directly
            const leafHashes = await Promise.all(chunks.map(chunk => Crypto.digest(chunk, this.algorithm!)));
            for (let i = 0; i < leafHashes.length; i++) {
                if (!BinaryHelper.bufEqual(leafHashes[i], tree.hashes[i])) {
                    return ValidationResult.error(ValidationStatusCode.AssertionBMFFHashMismatch, this.sourceBox);
                }
            }

            // Per spec 15.12.2.1: If initHash is present, validate initialization segment
            if (tree.initHash) {
                const initHash = await this.hashInitializationSegment(asset, tree.localId);
                if (!BinaryHelper.bufEqual(initHash, tree.initHash)) {
                    return ValidationResult.error(ValidationStatusCode.AssertionBMFFHashMismatch, this.sourceBox);
                }
            }
        }

        result.addInformational(ValidationStatusCode.AssertionBMFFHashMatch, this.sourceBox);
        return result;
    }

    private async hashInitializationSegment(asset: BMFF, trackId: number): Promise<Uint8Array> {
        const exclusions = await this.getInitSegmentExclusions(asset);
        return AssertionUtils.hashWithExclusions(asset, exclusions, this.algorithm!);
    }

    private async getInitSegmentExclusions(asset: BMFF): Promise<HashExclusionRange[]> {
        const exclusions: HashExclusionRange[] = [];

        for (const exclusion of this.exclusions) {
            if (exclusion.xpath === '/uuid' || exclusion.xpath === '/ftyp' || exclusion.xpath === '/moov[1]/pssh') {
                const box = await this.getMatchingBoxForExclusion(exclusion, asset);
                if (box) {
                    exclusions.push({
                        start: box.offset,
                        length: box.size,
                    });
                }
            }
        }

        return exclusions;
    }

    private async getChunks(asset: BMFF, tree: RawMerkleMap): Promise<Uint8Array[]> {
        const chunks: Uint8Array[] = [];
        const mdatBox = asset.getBoxByPath('/mdat');

        if (!mdatBox) {
            throw new ValidationError(ValidationStatusCode.AssertionBMFFHashMismatch, this.sourceBox, 'mdat not found');
        }

        // Per spec 15.12.2: Handle fixed and variable size blocks
        if (tree.fixedBlockSize) {
            let offset = mdatBox.payloadOffset;
            for (let i = 0; i < tree.count; i++) {
                chunks.push(await asset.getDataRange(offset, tree.fixedBlockSize));
                offset += tree.fixedBlockSize;
            }
        } else if (tree.variableBlockSizes) {
            let offset = mdatBox.payloadOffset;
            for (const size of tree.variableBlockSizes) {
                chunks.push(await asset.getDataRange(offset, size));
                offset += size;
            }
        }

        return chunks;
    }

    /**
     * Updates the assertion with hash and exclusion data from the given asset
     * @param asset - The asset to generate the hash from
     * @throws {Error} If the asset is not a BMFF asset or if the algorithm is not set
     */
    public async updateWithAsset(asset: Asset): Promise<void> {
        if (!this.algorithm) {
            throw new Error('Assertion has no algorithm');
        }

        if (!(asset instanceof BMFF)) {
            throw new Error('Asset must be a BMFF asset');
        }

        // Measure the size before adding exclusions
        const previousLength = this.generateJUMBFBox().measureSize();

        const exclusionRange = asset.getHashExclusionRange();

        const uuidBox = asset.getBoxByPath('/uuid');
        if (!uuidBox) {
            throw new Error('UUID box not found');
        }

        this.exclusions = [
            {
                xpath: '/uuid',
                length: exclusionRange.length,
                data: [
                    {
                        offset: 8,
                        value: uuidBox.userType!,
                    },
                ],
            },
            {
                xpath: '/ftyp',
            },
            {
                xpath: '/mfra',
            },
        ];

        this.name = 'jumbf manifest';
        this.hash = await this.hashBMFFWithExclusions(asset);

        // Measure the new length after exclusions are added and adjust padding as necessary
        const adjust = this.generateJUMBFBox().measureSize() - previousLength;

        if (adjust > this.paddingLength)
            throw new Error(
                `Not enough padding for exclusions, adjust padding length to ${this.paddingLength + adjust}`,
            );
        this.paddingLength -= adjust;
    }

    /**
     * Creates a new BMFFHashAssertion with the given algorithm and version 2
     * @param algorithm - The hash algorithm to use
     * @returns {BMFFHashAssertion} The new BMFFHashAssertion
     */
    public static createV2(algorithm: HashAlgorithm) {
        const bmffHashAssertion = new BMFFHashAssertion(2);
        bmffHashAssertion.algorithm = algorithm;
        bmffHashAssertion.paddingLength = 242;
        return bmffHashAssertion;
    }

    /**
     * Creates a new BMFFHashAssertion with the given algorithm and version 3
     * @param algorithm - The hash algorithm to use
     * @returns {BMFFHashAssertion} The new BMFFHashAssertion
     */
    public static createV3(algorithm: HashAlgorithm) {
        const bmffHashAssertion = new BMFFHashAssertion(3);
        bmffHashAssertion.algorithm = algorithm;
        bmffHashAssertion.paddingLength = 242;
        return bmffHashAssertion;
    }
}
