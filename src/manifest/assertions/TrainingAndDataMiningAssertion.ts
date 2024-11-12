import { CBORBox, IBox } from '../../jumbf';
import { BinaryHelper } from '../../util';
import * as raw from '../rawTypes';
import { TrainingAndDataMiningChoice, TrainingAndDataMiningEntry, ValidationStatusCode } from '../types';
import { ValidationError } from '../ValidationError';
import { Assertion } from './Assertion';
import { AssertionLabels } from './AssertionLabels';

// Early versions of the specification were unclear about whether the individual entries should go into
// the `entries` field or directly into the top level of the payload content. Thus we support reading both.
// See also: https://github.com/creator-assertions/training-and-data-mining-assertion/issues/3
type RawTrainingMiningMap = Record<string, RawEntry> & {
    entries?: Record<string, RawEntry>;
    metadata?: raw.AssertionMetadataMap;
};

interface RawEntry {
    use: TrainingAndDataMiningChoice;
    constraint_info?: string;
}

export class TrainingAndDataMiningAssertion extends Assertion {
    public label: string;
    public uuid = raw.UUIDs.cborAssertion;
    public isCAWG: boolean;

    public entries: Record<string, TrainingAndDataMiningEntry> = {};

    constructor(isCAWG = true) {
        super();
        this.isCAWG = isCAWG;
        this.label = isCAWG ? AssertionLabels.cawgTrainingAndDataMining : AssertionLabels.trainingAndDataMining;
    }

    public readContentFromJUMBF(box: IBox): void {
        if (!(box instanceof CBORBox) || !this.uuid || !BinaryHelper.bufEqual(this.uuid, raw.UUIDs.cborAssertion))
            throw new ValidationError(
                ValidationStatusCode.AssertionRequiredMissing,
                this.sourceBox,
                'Training and Data Mining assertion has invalid type',
            );

        const content = box.content as RawTrainingMiningMap;

        const entries: Record<string, RawEntry> = content.entries ?? content;

        for (const [key, entry] of Object.entries(entries)) {
            if (key === 'metadata') continue;
            if (!entry.use) continue;

            this.entries[key] = {
                choice: entry.use,
                constraintInfo: entry.constraint_info,
            };
        }
    }

    public generateJUMBFBoxForContent(): IBox {
        if (!Object.keys(this.entries).length) throw new Error('Assertion has no entries');

        const rawEntries: Record<string, RawEntry> = {};
        for (const [key, entry] of Object.entries(this.entries)) {
            rawEntries[key] = {
                use: entry.choice,
            };
            if (entry.constraintInfo) rawEntries[key].constraint_info = entry.constraintInfo;
        }

        const box = new CBORBox();
        box.content = { entries: rawEntries };
        return box;
    }
}
