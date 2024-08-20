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
import { AssertionLabels } from './AssertionLabels';
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
    public paddingLength = 0;
    public padding2Length = 0;

    public readContentFromJUMBF(box: JUMBF.IBox): void {
        if (!(box instanceof JUMBF.CBORBox) || !this.uuid || !BinaryHelper.bufEqual(this.uuid, raw.UUIDs.cborAssertion))
            throw new ValidationError(
                ValidationStatusCode.AssertionRequiredMissing,
                this.sourceBox,
                'Data hash assertion has invalid type',
            );

        const content = box.content as RawDataHashMap;

        if (content.pad) {
            if (content.pad.some(e => e !== 0))
                throw new ValidationError(
                    ValidationStatusCode.AssertionCBORInvalid,
                    this.sourceBox,
                    'Malformed padding',
                );
            this.paddingLength = content.pad.length;
        }
        if (content.pad2) {
            if (content.pad2.some(e => e !== 0))
                throw new ValidationError(
                    ValidationStatusCode.AssertionCBORInvalid,
                    this.sourceBox,
                    'Malformed padding',
                );
            this.padding2Length = content.pad2.length;
        }

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
        if (!this.algorithm) throw new Error('Assertion has no algorithm');

        const digestLength = Crypto.getDigestLength(this.algorithm);
        if (this.hash && this.hash.length !== digestLength) {
            throw new Error('Mismatch between algorithm and hash length');
        }

        const content: RawDataHashMap = {
            exclusions: this.exclusions,
            alg: Claim.reverseMapHashAlgorithm(this.algorithm),
            hash: this.hash ?? new Uint8Array(digestLength),
            pad: new Uint8Array(this.paddingLength),
        };

        if (this.name) content.name = this.name;
        if (this.padding2Length) content.pad2 = new Uint8Array(this.padding2Length);

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

    public async updateWithAsset(asset: Asset): Promise<void> {
        if (!this.algorithm) throw new Error('Assertion has no algorithm');

        // Measure the size before adding exclusions
        const schema = JUMBF.SuperBox.schema;
        const previousLength = schema.measure(this.generateJUMBFBox()).size;

        this.exclusions = [asset.getHashExclusionRange()];
        this.hash = await AssertionUtils.hashWithExclusions(asset, this.exclusions, this.algorithm);

        // Measure the new length after exclusions are added and adjust padding as necessary
        const adjust = schema.measure(this.generateJUMBFBox()).size - previousLength;
        if (adjust > this.paddingLength) throw new Error('Not enough padding for exclusions');
        this.paddingLength -= adjust;
    }

    public static create(algorithm: HashAlgorithm, initialPaddingLength = 100) {
        const dataHashAssertion = new DataHashAssertion();
        dataHashAssertion.uuid = raw.UUIDs.cborAssertion;
        dataHashAssertion.label = AssertionLabels.dataHash;
        dataHashAssertion.algorithm = algorithm;
        dataHashAssertion.paddingLength = initialPaddingLength;
        return dataHashAssertion;
    }
}
