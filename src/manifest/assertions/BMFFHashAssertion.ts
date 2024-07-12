import { Asset, BMFF } from '../../asset';
import { HashAlgorithm } from '../../crypto';
import * as JUMBF from '../../jumbf';
import { BinaryHelper } from '../../util';
import { Claim } from '../Claim';
import * as raw from '../rawTypes';
import { HashExclusionRange, ValidationStatusCode } from '../types';
import { ValidationError } from '../ValidationError';
import { ValidationResult } from '../ValidationResult';
import { Assertion } from './Assertion';
import { AssertionUtils } from './AssertionUtils';

interface Exclusion {
    xpath: string;
    length?: number;
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
}

interface RawDataHashMap {
    exclusions?: Exclusion[];
    alg?: raw.HashAlgorithm;
    hash?: Uint8Array;
    merkle?: RawMerkleMap[];
    name?: string;
}

export class BMFFHashAssertion extends Assertion {
    public exclusions: Exclusion[] = [];
    public algorithm?: HashAlgorithm;
    public hash?: Uint8Array;
    public name: string | undefined;

    public readFromJUMBF(box: JUMBF.IBox): void {
        if (!(box instanceof JUMBF.CBORBox) || !this.uuid || !BinaryHelper.bufEqual(this.uuid, raw.UUIDs.cborAssertion))
            throw new ValidationError(
                ValidationStatusCode.AssertionRequiredMissing,
                this.sourceBox,
                'BMFF hash assertion has invalid type',
            );

        const content = box.content as RawDataHashMap;

        this.hash = content.hash;
        this.algorithm = Claim.mapHashAlgorithm(content.alg);
        this.name = content.name;

        if (content.exclusions) {
            for (const exclusion of content.exclusions) {
                if (!exclusion.xpath)
                    throw new ValidationError(ValidationStatusCode.AssertionCBORInvalid, this.sourceBox);

                this.exclusions.push(exclusion);
            }
        }
    }

    public async validateAgainstAsset(asset: Asset): Promise<ValidationResult> {
        // TODO Merkle hashing is currently not implemented

        if (!this.hash || !this.algorithm) {
            return ValidationResult.error(ValidationStatusCode.AssertionRequiredMissing, this.sourceBox);
        }

        if (!(asset instanceof BMFF)) {
            return ValidationResult.error(ValidationStatusCode.AssertionBMFFHashMismatch, this.sourceBox);
        }

        // For any top-level boxes that aren't excluded in their entirety, an offset marker needs to be added to the hash stream
        const markers = new Set(asset.getTopLevelBoxes().map(box => box.offset));

        const exclusionRanges: HashExclusionRange[] = [];
        exclusionLoop: for (const exclusion of this.exclusions) {
            // A box matches an exclusion entry in the exclusions array if and only if all of the following conditions are met:

            // The box’s location in the file exactly matches the exclusions-map entry’s xpath field.
            const box = asset.getBoxByPath(exclusion.xpath);
            if (!box) continue;

            // If length is specified in the exclusions-map entry, the box’s length exactly matches the exclusions-map entry’s length field.
            if (exclusion.length && box.size !== exclusion.length) continue;

            // If version is specified in the exclusions-map entry, the box is a FullBox and the box’s version exactly matches the exclusions-map entry’s version field.
            if (exclusion.version && !('version' in box.payload && box.payload.version === exclusion.version)) continue;

            // If flags (byte array of exactly 3 bytes) is specified in the exclusions-map entry and the box is a FullBox.
            if (exclusion.flags) {
                if (!('flags' in box.payload)) continue;

                const boxFlags = box.payload.flags as Uint8Array;
                if (exclusion.flags.length !== 3 || boxFlags.length !== 3) continue;

                // If exact is set to true or not specified, the box’s flags (bit(24), i.e., 3 bytes) also exactly matches the exclusions-map entry’s flags field.
                if (exclusion.exact === undefined || exclusion.exact) {
                    if (!BinaryHelper.bufEqual(exclusion.flags, boxFlags)) continue;
                } else {
                    // If exact is set to false, the bitwise-and of the box’s flags (bit(24), i.e., 3 bytes) with the exclusions-map entry’s flags field exactly matches the exclusions-map entry’s flags field.
                    for (let i = 0; i < 3; i++) {
                        if ((exclusion.flags[i] & boxFlags[i]) !== exclusion.flags[i]) {
                            continue exclusionLoop;
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
                    continue exclusionLoop;
                }
            }

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

        const hash = await AssertionUtils.hashWithExclusions(asset, exclusionRanges, this.algorithm);

        if (BinaryHelper.bufEqual(hash, this.hash)) {
            return ValidationResult.success(ValidationStatusCode.AssertionBMFFHashMatch, this.sourceBox);
        } else {
            return ValidationResult.error(ValidationStatusCode.AssertionBMFFHashMismatch, this.sourceBox);
        }
    }
}
