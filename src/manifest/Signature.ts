import * as COSE from '../cose';
import * as JUMBF from '../jumbf';
import { MalformedContentError } from '../util';
import * as raw from './rawTypes';
import { ManifestComponent, ValidationStatusCode } from './types';
import { ValidationError } from './ValidationError';
import { ValidationResult } from './ValidationResult';

export class Signature implements ManifestComponent {
    public readonly label: string = 'c2pa.signature';
    public signatureData: unknown;
    public sourceBox?: JUMBF.SuperBox;

    public static read(box: JUMBF.SuperBox): Signature {
        if (!box.contentBoxes.length || !(box.contentBoxes[0] instanceof JUMBF.CBORBox))
            throw new ValidationError(
                ValidationStatusCode.ClaimSignatureMissing,
                box,
                'Signature has invalid content boxes',
            );

        const signature = new Signature();
        signature.sourceBox = box;

        if (box.descriptionBox?.label !== 'c2pa.signature')
            throw new ValidationError(ValidationStatusCode.ClaimSignatureMissing, box, 'Signature has invalid label');

        if (box.contentBoxes[0].tag !== undefined && box.contentBoxes[0].tag !== 18) {
            throw new ValidationError(
                ValidationStatusCode.ClaimSignatureMissing,
                box,
                'Signature has invalid CBOR tag',
            );
        }
        const content = box.contentBoxes[0].content as COSE.CoseSignature;
        if (!Array.isArray(content) || content.length !== 4) {
            throw new ValidationError(
                ValidationStatusCode.ClaimSignatureMissing,
                box,
                'Signature has invalid CBOR content',
            );
        }
        signature.signatureData = content;

        return signature;
    }

    public generateJUMBFBox(): JUMBF.SuperBox {
        const box = new JUMBF.SuperBox();
        box.descriptionBox = new JUMBF.DescriptionBox();
        box.descriptionBox.label = this.label;
        box.descriptionBox.uuid = raw.UUIDs.signature;
        const contentBox = new JUMBF.CBORBox();
        contentBox.tag = 18;
        contentBox.content = this.signatureData;
        box.contentBoxes.push(contentBox);

        this.sourceBox = box;
        return this.sourceBox;
    }

    public async validate(payload: Uint8Array): Promise<ValidationResult> {
        try {
            const sig = COSE.Signature.readFromJUMBFData(this.signatureData);
            return sig.validate(payload, this.sourceBox);
        } catch (e) {
            if (e instanceof MalformedContentError) {
                return ValidationResult.error(ValidationStatusCode.SigningCredentialInvalid, this.sourceBox);
            } else {
                return ValidationResult.fromError(e as Error);
            }
        }
    }
}
