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

export class BMFFHashAssertion extends Assertion {
    public label = AssertionLabels.bmffV2Hash;
    public uuid = raw.UUIDs.cborAssertion;

    public exclusions: Exclusion[] = [];
    public algorithm?: HashAlgorithm;
    public hash?: Uint8Array;
    public name: string | undefined;
    public merkle?: RawMerkleMap[];

    public setVersion(version: 2 | 3) {
        this.label = version === 3 ? AssertionLabels.bmffV3Hash : AssertionLabels.bmffV2Hash;
    }

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

    public generateJUMBFBoxForContent(): JUMBF.IBox {
        const box = new JUMBF.CBORBox();
        box.content = {
            exclusions: this.exclusions,
            alg: Claim.reverseMapHashAlgorithm(this.algorithm),
            hash: this.hash,
            merkle: this.merkle,
            name: this.name,
        };
        return box;
    }

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

        // The box’s location in the file exactly matches the exclusions-map entry’s xpath field.
        const box = asset.getBoxByPath(exclusion.xpath);
        if (!box) return undefined;

        // If length is specified in the exclusions-map entry, the box’s length exactly matches the exclusions-map entry’s length field.
        if (exclusion.length && box.size !== exclusion.length) return undefined;

        // If version is specified in the exclusions-map entry, the box is a FullBox and the box’s version exactly matches the exclusions-map entry’s version field.
        if (exclusion.version && !('version' in box.payload && box.payload.version === exclusion.version))
            return undefined;

        // If flags (byte array of exactly 3 bytes) is specified in the exclusions-map entry and the box is a FullBox.
        if (exclusion.flags) {
            if (!('flags' in box.payload)) return undefined;

            const boxFlags = box.payload.flags as Uint8Array;
            if (exclusion.flags.length !== 3 || boxFlags.length !== 3) return undefined;

            // If exact is set to true or not specified, the box’s flags (bit(24), i.e., 3 bytes) also exactly matches the exclusions-map entry’s flags field.
            if (exclusion.exact === undefined || exclusion.exact) {
                if (!BinaryHelper.bufEqual(exclusion.flags, boxFlags)) return undefined;
            } else {
                // If exact is set to false, the bitwise-and of the box’s flags (bit(24), i.e., 3 bytes) with the exclusions-map entry’s flags field exactly matches the exclusions-map entry’s flags field.
                for (let i = 0; i < 3; i++) {
                    if ((exclusion.flags[i] & boxFlags[i]) !== exclusion.flags[i]) {
                        return undefined;
                    }
                }
            }
        }

        // If data (array of objects) is specified in the exclusions-map entry, then for each item in the array, the box’s binary data at that item’s relative byte offset field exactly matches that item’s bytes field.
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
            // Validate initialization segment if present
            if (tree.initHash) {
                const initHash = await this.hashInitializationSegment(asset, tree.localId);
                if (!BinaryHelper.bufEqual(initHash, tree.initHash)) {
                    result.addError(ValidationStatusCode.AssertionBMFFHashMismatch, this.sourceBox);
                    return result;
                }
            }

            // Get chunks based on fixedBlockSize or variableBlockSizes
            const chunks = await this.getChunks(asset, tree);
            const leafHashes = await Promise.all(chunks.map(chunk => Crypto.digest(chunk, this.algorithm!)));

            // Verify Merkle tree
            const rootHash = await this.computeMerkleRoot(leafHashes, tree.hashes);
            if (!this.hash || !BinaryHelper.bufEqual(rootHash, this.hash)) {
                result.addError(ValidationStatusCode.AssertionBMFFHashMismatch, this.sourceBox);
                return result;
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
        const track = await this.getTrackById(asset, tree.localId);

        if (!track) {
            throw new ValidationError(
                ValidationStatusCode.AssertionBMFFHashMismatch,
                this.sourceBox,
                'Track not found',
            );
        }

        if (tree.fixedBlockSize) {
            // Fixed size blocks for mdat
            const mdatBox = asset.getBoxByPath('mdat');
            if (!mdatBox) {
                throw new ValidationError(
                    ValidationStatusCode.AssertionBMFFHashMismatch,
                    this.sourceBox,
                    'mdat not found',
                );
            }

            let offset = mdatBox.offset;
            for (let i = 0; i < tree.count; i++) {
                chunks.push(await asset.getDataRange(offset, tree.fixedBlockSize));
                offset += tree.fixedBlockSize;
            }
        } else if (tree.variableBlockSizes) {
            // Variable size blocks based on sample sizes
            let offset = 0;
            for (const size of tree.variableBlockSizes) {
                chunks.push(await asset.getDataRange(offset, size));
                offset += size;
            }
        } else {
            // Fragment-based chunks
            const moofBoxes = asset.getBoxesByPath('moof');
            const mdatBoxes = asset.getBoxesByPath('mdat');

            if (moofBoxes.length !== mdatBoxes.length) {
                throw new ValidationError(
                    ValidationStatusCode.AssertionBMFFHashMismatch,
                    this.sourceBox,
                    'Mismatched moof/mdat count',
                );
            }

            for (let i = 0; i < moofBoxes.length; i++) {
                const fragmentData = await asset.getDataRange(
                    moofBoxes[i].offset,
                    moofBoxes[i].size + mdatBoxes[i].size,
                );
                chunks.push(fragmentData);
            }
        }

        return chunks;
    }

    private async getTrackById(asset: BMFF, trackId: number): Promise<BMFFBox<object> | undefined> {
        const moov = asset.getBoxByPath('moov');
        if (!moov) return undefined;

        const tracks = asset.getBoxesByPath('moov/trak');
        return tracks.find(track => {
            const tkhd = asset.getBoxByPath(`moov/trak[${trackId}]/tkhd`);
            return tkhd && 'trackId' in tkhd.payload && tkhd.payload.trackId === trackId;
        });
    }

    private async computeMerkleRoot(leafHashes: Uint8Array[], treeHashes: Uint8Array[]): Promise<Uint8Array> {
        if (!this.algorithm) {
            throw new Error('No algorithm specified');
        }

        let currentLevel = leafHashes;
        let treeHashIndex = 0;

        while (currentLevel.length > 1) {
            const nextLevel: Uint8Array[] = [];

            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;

                // Verify against provided tree hash
                const expectedHash = treeHashes[treeHashIndex++];
                if (!expectedHash) {
                    throw new ValidationError(
                        ValidationStatusCode.AssertionBMFFHashMismatch,
                        this.sourceBox,
                        'Invalid Merkle tree structure',
                    );
                }

                const combined = Buffer.concat([left, right]);
                const nodeHash = await Crypto.digest(combined, this.algorithm);

                if (!BinaryHelper.bufEqual(nodeHash, expectedHash)) {
                    throw new ValidationError(
                        ValidationStatusCode.AssertionBMFFHashMismatch,
                        this.sourceBox,
                        'Merkle tree verification failed',
                    );
                }

                nextLevel.push(nodeHash);
            }

            currentLevel = nextLevel;
        }

        return currentLevel[0];
    }
}
