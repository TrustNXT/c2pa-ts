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

interface Exclusion {
    xpath: string;
    length?: number;
    offset?: number;
    blockSize?: number;
    data?: {
        offset: number;
        value: Uint8Array;
    }[];
    subset?: {
        offset: number;
        length: number;
    }[];
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
        throw new Error('Method not implemented.');
    }

    public async validateAgainstAsset(asset: Asset): Promise<ValidationResult> {
        if (!this.hash || !this.algorithm) {
            return ValidationResult.error(ValidationStatusCode.AssertionCBORInvalid, this.sourceBox);
        }

        if (!(asset instanceof BMFF)) {
            return ValidationResult.error(ValidationStatusCode.AssertionBMFFHashMismatch, this.sourceBox);
        }

        // Handle Merkle tree validation if present
        if (this.merkle?.length) {
            return this.validateMerkleTree(asset);
        }

        // Regular hash validation
        const hash = await this.hashBMFFWithExclusions(asset);
        if (BinaryHelper.bufEqual(hash, this.hash)) {
            return ValidationResult.success(ValidationStatusCode.AssertionBMFFHashMatch, this.sourceBox);
        } else {
            return ValidationResult.error(ValidationStatusCode.AssertionBMFFHashMismatch, this.sourceBox);
        }
    }

    private async validateMerkleTree(asset: BMFF): Promise<ValidationResult> {
        const result = new ValidationResult();

        for (const tree of this.merkle!) {
            // Validate initialization segment if present
            if (tree.initHash) {
                const initSegment = await this.getInitializationSegment(asset, tree.localId);
                const initHash = await Crypto.digest(initSegment, this.algorithm!);
                if (!BinaryHelper.bufEqual(initHash, tree.initHash)) {
                    result.addError(ValidationStatusCode.AssertionBMFFHashMismatch, this.sourceBox);
                    return result;
                }
            }

            // Validate each chunk against Merkle tree
            const chunks = await this.getChunks(asset, tree);
            const leafHashes = await Promise.all(chunks.map(chunk => Crypto.digest(chunk, this.algorithm!)));

            // Verify Merkle tree
            const rootHash = await this.computeMerkleRoot(leafHashes, tree.hashes);
            if (!this.hash || !BinaryHelper.bufEqual(rootHash, this.hash)) {
                result.addError(ValidationStatusCode.AssertionBMFFHashMismatch, this.sourceBox);
                return result;
            }
        }

        return ValidationResult.success(ValidationStatusCode.AssertionBMFFHashMatch, this.sourceBox);
    }

    private async getInitializationSegment(asset: BMFF, trackId: number): Promise<Uint8Array> {
        const initBox = asset.getBoxByPath(`moov/trak${trackId}/moof`);
        if (!initBox) {
            throw new Error('Initialization segment not found');
        }
        return asset.getDataRange(initBox.offset, initBox.size);
    }

    private async getChunks(asset: BMFF, tree: RawMerkleMap): Promise<Uint8Array[]> {
        const chunks: Uint8Array[] = [];
        let offset = 0;

        if (tree.fixedBlockSize) {
            // Fixed size blocks
            for (let i = 0; i < tree.count; i++) {
                chunks.push(await asset.getDataRange(offset, tree.fixedBlockSize));
                offset += tree.fixedBlockSize;
            }
        } else if (tree.variableBlockSizes) {
            // Variable size blocks
            for (const size of tree.variableBlockSizes) {
                chunks.push(await asset.getDataRange(offset, size));
                offset += size;
            }
        }

        return chunks;
    }

    private async computeMerkleRoot(leafHashes: Uint8Array[], treeHashes: Uint8Array[]): Promise<Uint8Array> {
        if (!this.algorithm) {
            throw new Error('No algorithm specified');
        }

        // Build Merkle tree bottom-up
        let currentLevel = leafHashes;
        let treeHashIndex = 0;

        while (currentLevel.length > 1) {
            const nextLevel: Uint8Array[] = [];

            // Process pairs of nodes
            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
                const expectedHash = treeHashes[treeHashIndex++];

                if (!left || !right || !expectedHash) {
                    throw new Error('Invalid Merkle tree data');
                }

                const combined = Buffer.concat([left, right]);
                const nodeHash = await Crypto.digest(combined, this.algorithm);

                if (!BinaryHelper.bufEqual(nodeHash, expectedHash)) {
                    throw new Error('Merkle tree verification failed');
                }

                nextLevel.push(nodeHash);
            }

            currentLevel = nextLevel;
        }

        return currentLevel[0]; // Root hash
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
            throw new Error('No algorithm specified');
        }

        const exclusionRanges: HashExclusionRange[] = [];
        const markers = new Set(asset.getTopLevelBoxes().map(box => box.offset));

        for (const exclusion of this.exclusions) {
            const box = await this.getMatchingBoxForExclusion(exclusion, asset);
            if (!box) continue;

            if (exclusion.blockSize) {
                // v3: Handle variable block sizes
                const startOffset = box.offset + (exclusion.offset ?? 0);
                const length = exclusion.length ?? box.size;
                let currentOffset = startOffset;
                const endOffset = startOffset + length;

                while (currentOffset < endOffset) {
                    const blockLength = Math.min(exclusion.blockSize, endOffset - currentOffset);
                    exclusionRanges.push({
                        start: currentOffset,
                        length: blockLength,
                    });
                    currentOffset += blockLength;
                }
            } else if (exclusion.subset) {
                // v2: Handle subsets
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
                // Handle full box exclusion
                markers.delete(box.offset);
                exclusionRanges.push({
                    start: box.offset + (exclusion.offset ?? 0),
                    length: exclusion.length ?? box.size,
                });
            }
        }

        // Add offset markers for non-excluded boxes
        for (const offset of markers) {
            exclusionRanges.push({
                start: offset,
                length: 0,
                offsetMarker: true,
            });
        }

        return AssertionUtils.hashWithExclusions(asset, exclusionRanges, this.algorithm);
    }
}
