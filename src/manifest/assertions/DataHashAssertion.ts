import { Asset } from '../../asset';
import { Crypto, HashAlgorithm } from '../../crypto';
import * as JUMBF from '../../jumbf';
import { BinaryHelper } from '../../util';
import { Claim } from '../Claim';
import * as raw from '../rawTypes';
import { HashExclusionRange, ValidationStatusCode } from '../types';
import { ValidationError } from '../ValidationError';
import { ValidationResult } from '../ValidationResult';
import { Assertion } from './Assertion';

interface RawDataHashMap {
    exclusions?: HashExclusionRange[];
    alg?: raw.HashAlgorithm;
    hash: Uint8Array;
    pad: Uint8Array;
    pad2?: Uint8Array;
    name?: string;
}

export class DataHashAssertion extends Assertion {
    public algorithm?: HashAlgorithm;
    public name?: string;
    public hash?: Uint8Array;
    public exclusions: HashExclusionRange[] = [];

    public readFromJUMBF(box: JUMBF.IBox): void {
        if (!(box instanceof JUMBF.CBORBox) || !this.uuid || !BinaryHelper.bufEqual(this.uuid, raw.UUIDs.cborAssertion))
            throw new ValidationError(
                ValidationStatusCode.AssertionRequiredMissing,
                this.sourceBox,
                'Data hash assertion has invalid type',
            );

        const content = box.content as RawDataHashMap;

        this.name = content.name;
        this.hash = content.hash;

        const algorithm = Claim.mapHashAlgorithm(content.alg);
        // The CDDL in the specification marks this field as optional but does not mention any defaults so we just
        // assume it has to be present
        if (!algorithm) throw new ValidationError(ValidationStatusCode.AlgorithmUnsupported, this.sourceBox);
        this.algorithm = algorithm;

        if (content.exclusions) {
            for (const exclusion of content.exclusions) {
                if (typeof exclusion.start !== 'number' || typeof exclusion.length !== 'number')
                    throw new ValidationError(ValidationStatusCode.AssertionCBORInvalid, this.sourceBox);
                if (exclusion.start < 0 || exclusion.length < 1)
                    throw new ValidationError(
                        ValidationStatusCode.AssertionRequiredMissing,
                        this.sourceBox,
                        'Data hash has invalid exclusions',
                    );

                this.exclusions.push({
                    start: exclusion.start,
                    length: exclusion.length,
                });
            }

            this.exclusions.sort((a, b) => a.start - b.start);

            // Make sure exclusions don't overlap
            for (let i = 1; i < this.exclusions.length; i++) {
                if (this.exclusions[i - 1].start + this.exclusions[i - 1].length > this.exclusions[i].start)
                    throw new ValidationError(
                        ValidationStatusCode.AssertionRequiredMissing,
                        this.sourceBox,
                        'Data hash has overlapping exclusions',
                    );
            }
        }
    }

    public async validateAgainstAsset(asset: Asset): Promise<ValidationResult> {
        if (!this.hash || !this.algorithm) {
            return ValidationResult.error(ValidationStatusCode.AssertionRequiredMissing, this.sourceBox);
        }

        let hash: Uint8Array;

        if (!this.exclusions.length) {
            hash = await Crypto.digest(await asset.getDataRange(), this.algorithm);
        } else {
            const digest = Crypto.streamingDigest(this.algorithm);

            for (let i = 0; i < this.exclusions.length; i++) {
                const previousEnd = i > 0 ? this.exclusions[i - 1].start + this.exclusions[i - 1].length : 0;
                const length = this.exclusions[i].start - previousEnd;
                if (length > 0) digest.update(await asset.getDataRange(previousEnd, length));
            }

            const endOfLastExclusion =
                this.exclusions[this.exclusions.length - 1].start + this.exclusions[this.exclusions.length - 1].length;
            if (asset.getDataLength() > endOfLastExclusion) {
                digest.update(await asset.getDataRange(endOfLastExclusion));
            }

            hash = await digest.final();
        }

        if (BinaryHelper.bufEqual(this.hash, hash)) {
            return ValidationResult.success(ValidationStatusCode.AssertionDataHashMatch, this.sourceBox);
        } else {
            return ValidationResult.error(ValidationStatusCode.AssertionDataHashMismatch, this.sourceBox);
        }
    }
}
