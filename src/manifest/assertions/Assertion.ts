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

    public abstract readFromJUMBF(box: JUMBF.IBox, claim?: Claim): void;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async validateAgainstAsset(asset: Asset): Promise<ValidationResult> {
        return new ValidationResult();
    }
}
