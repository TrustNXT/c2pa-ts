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
import { AssertionUtils } from './AssertionUtils';

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

    public readContentFromJUMBF(box: JUMBF.IBox): void {
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
        if (this.hash.length !== Crypto.getDigestLength(algorithm)) {
            throw new ValidationError(
                ValidationStatusCode.AssertionCBORInvalid,
                this.sourceBox,
                'mismatch between algorithm and hash length',
            );
        }

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

    public generateJUMBFBoxForContent(): JUMBF.IBox {
        if (!this.hash) throw new Error('Assertion has no hash');
        if (!this.algorithm) throw new Error('Assertion has no algorithm');

        const digestLength = Crypto.getDigestLength(this.algorithm);
        if (this.hash && this.hash.length !== digestLength) {
            throw new Error('Mismatch between algorithm and hash length');
        }

        const content: RawDataHashMap = {
            exclusions: this.exclusions,
            alg: Claim.reverseMapHashAlgorithm(this.algorithm),
            hash: this.hash,
            pad: new Uint8Array(),
        };
        if (this.name) content.name = this.name;

        const box = new JUMBF.CBORBox();
        box.content = content;

        return box;
    }

    public async validateAgainstAsset(asset: Asset): Promise<ValidationResult> {
        if (!this.hash || !this.algorithm) {
            return ValidationResult.error(ValidationStatusCode.AssertionRequiredMissing, this.sourceBox);
        }

        const hash = await AssertionUtils.hashWithExclusions(asset, this.exclusions, this.algorithm);

        if (BinaryHelper.bufEqual(this.hash, hash)) {
            return ValidationResult.success(ValidationStatusCode.AssertionDataHashMatch, this.sourceBox);
        } else {
            return ValidationResult.error(ValidationStatusCode.AssertionDataHashMismatch, this.sourceBox);
        }
    }
}
