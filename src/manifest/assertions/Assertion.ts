import { Asset } from '../../asset';
import * as JUMBF from '../../jumbf';
import { Claim } from '../Claim';
import { Manifest } from '../Manifest';
import { ManifestComponent, ManifestComponentType, ValidationStatusCode } from '../types';
import { ValidationError } from '../ValidationError';
import { ValidationResult } from '../ValidationResult';

export abstract class Assertion implements ManifestComponent {
    public readonly componentType = ManifestComponentType.Assertion;
    public label?: string;
    public labelSuffix?: number;
    public uuid?: Uint8Array;
    public sourceBox: JUMBF.SuperBox | undefined;

    /**
     * Gets the full label including the optional index
     * @returns The full label string
     */
    public get fullLabel() {
        return this.labelSuffix !== undefined ? `${this.label}__${this.labelSuffix}` : this.label;
    }

    /**
     * Splits the label in the JUMBF box into the actual assertion type identifier and an optional index
     * @param label - The label to split
     * @returns An object containing the label and the optional index
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

    /**
     * Reads an assertion from a JUMBF box
     * @param box - The JUMBF box to read from
     * @param claim - The claim this assertion belongs to
     * @throws ValidationError if the box is invalid
     */
    public readFromJUMBF(box: JUMBF.SuperBox, claim: Claim): void {
        if (!box.descriptionBox?.label)
            throw new ValidationError(ValidationStatusCode.AssertionCBORInvalid, box, 'Assertion is missing label');

        const label = Assertion.splitLabel(box.descriptionBox.label);

        this.sourceBox = box;
        this.uuid = box.descriptionBox.uuid;
        this.label = label.label;
        this.labelSuffix = label.index;

        // delegate further extraction to derived class
        this.readContentFromJUMBF(box.contentBoxes[0], claim);
    }

    /**
     * Reads the assertion content from a JUMBF box
     * @param box - The JUMBF box to read from
     * @param claim - The claim this assertion belongs to
     */
    public abstract readContentFromJUMBF(box: JUMBF.IBox, claim: Claim): void;

    /**
     * Generates a JUMBF box for this assertion
     * @param claim - Optional claim this assertion belongs to
     * @returns The generated JUMBF box
     */
    public generateJUMBFBox(claim?: Claim): JUMBF.SuperBox {
        const box = new JUMBF.SuperBox();

        box.descriptionBox = new JUMBF.DescriptionBox();
        box.descriptionBox.label = this.fullLabel;
        if (this.uuid) box.descriptionBox.uuid = this.uuid;

        box.contentBoxes.push(this.generateJUMBFBoxForContent(claim));

        this.sourceBox = box;
        return box;
    }

    /**
     * Generates a JUMBF box for the assertion content
     * @param claim - Optional claim this assertion belongs to
     * @returns The generated JUMBF box
     */
    public abstract generateJUMBFBoxForContent(claim?: Claim): JUMBF.IBox;

    /**
     * Validates the assertion against an asset
     * @param asset - The asset to validate against
     * @returns Promise resolving to ValidationResult
     */
    public async validateAgainstAsset(asset: Asset): Promise<ValidationResult> {
        return new ValidationResult();
    }

    /**
     * Gets the bytes representation of the assertion
     * @param claim - The claim this assertion belongs to
     * @param rebuild - Whether to rebuild the JUMBF box
     * @returns Uint8Array of bytes or undefined if no source box
     */
    public getBytes(claim: Claim, rebuild = false) {
        if (rebuild) this.generateJUMBFBox(claim);
        return this.sourceBox?.toBuffer();
    }

    /**
     * Reads the assertion data from a JUMBF box
     * @param box - The JUMBF box to read from
     * @returns The assertion data
     * @throws ValidationError if the box is not a CBOR box
     */
    protected static readAssertionData(box: JUMBF.IBox): unknown {
        if (!(box instanceof JUMBF.CBORBox)) {
            throw new ValidationError(ValidationStatusCode.AssertionCBORInvalid, box, 'Expected CBOR box');
        }
        return box.content;
    }

    /**
     * Validates the assertion against a manifest
     * @param manifest - The manifest to validate against
     * @returns Promise resolving to ValidationResult
     */
    public async validate(manifest: Manifest): Promise<ValidationResult> {
        return new ValidationResult();
    }
}
