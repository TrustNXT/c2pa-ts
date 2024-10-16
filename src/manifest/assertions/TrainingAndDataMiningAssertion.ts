import { CBORBox, IBox } from '../../jumbf';
import { BinaryHelper } from '../../util';
import * as raw from '../rawTypes';
import { TrainingAndDataMiningChoice, TrainingAndDataMiningEntry, ValidationStatusCode } from '../types';
import { ValidationError } from '../ValidationError';
import { Assertion } from './Assertion';
import { AssertionLabels } from './AssertionLabels';

type RawTrainingMiningMap =
    | Record<string, RawEntry>
    | {
          metadata?: raw.AssertionMetadataMap;
      };

interface RawEntry {
    use: TrainingAndDataMiningChoice;
    constraint_info?: string;
}

export class TrainingAndDataMiningAssertion extends Assertion {
    public label = AssertionLabels.trainingAndDataMining;
    public uuid = raw.UUIDs.cborAssertion;

    public entries: Record<string, TrainingAndDataMiningEntry> = {};

    public readContentFromJUMBF(box: IBox): void {
        if (!(box instanceof CBORBox) || !this.uuid || !BinaryHelper.bufEqual(this.uuid, raw.UUIDs.cborAssertion))
            throw new ValidationError(
                ValidationStatusCode.AssertionRequiredMissing,
                this.sourceBox,
                'Training and Data Mining assertion has invalid type',
            );

        const content = box.content as RawTrainingMiningMap;

        for (const [key, value] of Object.entries(content)) {
            if (key === 'metadata') continue;

            const entry = value as RawEntry;
            if (!entry.use) continue;

            this.entries[key] = {
                choice: entry.use,
                constraintInfo: entry.constraint_info,
            };
        }
    }

    public generateJUMBFBoxForContent(): IBox {
        const entryKeys = Object.keys(this.entries).filter(key => key !== 'metadata');
        if (!entryKeys.length) throw new Error('Assertion has no entries');

        const content: Record<string, RawEntry> = {};
        for (const key of entryKeys) {
            const entry = this.entries[key];
            content[key] = {
                use: entry.choice,
                constraint_info: entry.constraintInfo,
            };
        }

        const box = new CBORBox();
        box.content = content;
        return box;
    }
}
