import { Asset } from '../../asset';
import * as JUMBF from '../../jumbf';
import { Claim } from '../Claim';
import { ManifestComponent, ManifestComponentType } from '../types';
import { ValidationResult } from '../ValidationResult';

export abstract class Assertion implements ManifestComponent {
    public readonly componentType = ManifestComponentType.Assertion;
    public label?: string;
    public labelSuffix?: number;
    public fullLabel?: string;
    public uuid?: Uint8Array;
    public sourceBox: JUMBF.SuperBox | undefined;

    /**
     * the label in the JUMBF box contains both the actual assertion type identifier
     * and an optional index, this utility method splits the two
     */
    public static splitLabel(label: string): { label: string; index?: number } {
        const match = /^(.+)__(\d+)$/.exec(label);
        if (match) {
            return { label: match[1], index: Number(match[2]) };
        } else {
            return {
                label: label,
                index: undefined,
            };
        }
    }

    public abstract readFromJUMBF(box: JUMBF.IBox, claim: Claim): void;

    public async validateAgainstAsset(asset: Asset): Promise<ValidationResult> {
        return new ValidationResult();
    }
}
