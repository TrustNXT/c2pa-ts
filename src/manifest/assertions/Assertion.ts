import { Asset } from '../../asset';
import * as JUMBF from '../../jumbf';
import { Claim } from '../Claim';
import { ManifestComponent, ManifestComponentType, ValidationStatusCode } from '../types';
import { ValidationError } from '../ValidationError';
import { ValidationResult } from '../ValidationResult';

export abstract class Assertion implements ManifestComponent {
    public readonly componentType = ManifestComponentType.Assertion;
    public label?: string;
    public labelSuffix?: number;
    public uuid?: Uint8Array;
    public sourceBox: JUMBF.SuperBox | undefined;

    public get fullLabel() {
        return this.labelSuffix !== undefined ? `${this.label}__${this.labelSuffix}` : this.label;
    }

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

    public readFromJUMBF(box: JUMBF.SuperBox, claim: Claim): void {
        if (!box.descriptionBox?.label)
            throw new ValidationError(ValidationStatusCode.AssertionRequiredMissing, box, 'Assertion is missing label');

        const label = Assertion.splitLabel(box.descriptionBox.label);

        this.sourceBox = box;
        this.uuid = box.descriptionBox.uuid;
        this.label = label.label;
        this.labelSuffix = label.index;

        // delegate further extraction to derived class
        this.readContentFromJUMBF(box.contentBoxes[0], claim);
    }

    public abstract readContentFromJUMBF(box: JUMBF.IBox, claim: Claim): void;

    public generateJUMBFBox(claim?: Claim): JUMBF.SuperBox {
        const box = new JUMBF.SuperBox();

        box.descriptionBox = new JUMBF.DescriptionBox();
        box.descriptionBox.label = this.fullLabel;
        if (this.uuid) box.descriptionBox.uuid = this.uuid;

        box.contentBoxes.push(this.generateJUMBFBoxForContent(claim));

        this.sourceBox = box;
        return box;
    }

    public abstract generateJUMBFBoxForContent(claim?: Claim): JUMBF.IBox;

    public async validateAgainstAsset(asset: Asset): Promise<ValidationResult> {
        return new ValidationResult();
    }

    public getBytes(claim: Claim, rebuild = false) {
        if (rebuild) this.generateJUMBFBox(claim);
        return this.sourceBox?.toBuffer();
    }
}
