import * as JUMBF from '../../jumbf';
import { BinaryHelper } from '../../util';
import { Claim } from '../Claim';
import * as raw from '../rawTypes';
import { ThumbnailType, ValidationStatusCode } from '../types';
import { ValidationError } from '../ValidationError';
import { Assertion } from './Assertion';
import { AssertionLabels } from './AssertionLabels';

export class ThumbnailAssertion extends Assertion {
    public uuid = raw.UUIDs.embeddedFile;
    public thumbnailType = ThumbnailType.Claim;
    public mimeType?: string;
    public content?: Uint8Array;

    public readFromJUMBF(box: JUMBF.SuperBox, claim: Claim): void {
        if (!box.descriptionBox?.label)
            throw new ValidationError(ValidationStatusCode.AssertionRequiredMissing, box, 'Assertion is missing label');

        if (box.descriptionBox.label.startsWith(AssertionLabels.thumbnailPrefix)) {
            this.thumbnailType = ThumbnailType.Claim;
        } else if (box.descriptionBox.label.startsWith(AssertionLabels.ingredientThumbnailPrefix)) {
            this.thumbnailType = ThumbnailType.Ingredient;
        } else {
            throw new ValidationError(
                ValidationStatusCode.AssertionRequiredMissing,
                box,
                'Thumbnail assertion has invalid label',
            );
        }

        this.sourceBox = box;
        this.uuid = box.descriptionBox.uuid;
        this.label = box.descriptionBox.label;

        if (!this.uuid || !BinaryHelper.bufEqual(this.uuid, raw.UUIDs.embeddedFile))
            throw new ValidationError(
                ValidationStatusCode.AssertionRequiredMissing,
                this.sourceBox,
                'Thumbnail assertion has invalid type',
            );

        const descriptionBox = box.contentBoxes.find(
            (box): box is JUMBF.EmbeddedFileDescriptionBox => box instanceof JUMBF.EmbeddedFileDescriptionBox,
        );
        const contentBox = box.contentBoxes.find(
            (box): box is JUMBF.EmbeddedFileBox => box instanceof JUMBF.EmbeddedFileBox,
        );
        if (!descriptionBox?.mediaType || !contentBox?.content?.length)
            throw new ValidationError(
                ValidationStatusCode.AssertionRequiredMissing,
                box,
                'Thumbnail assertion is missing file content or description',
            );

        this.content = contentBox.content;
        this.mimeType = descriptionBox.mediaType;
    }

    public generateJUMBFBox(): JUMBF.SuperBox {
        if (!this.content || !this.mimeType) throw new Error('Thumbnail assertion is missing content or type');

        const box = new JUMBF.SuperBox();

        box.descriptionBox = new JUMBF.DescriptionBox();
        box.descriptionBox.label = this.fullLabel;
        if (this.uuid) box.descriptionBox.uuid = this.uuid;

        const descriptionBox = new JUMBF.EmbeddedFileDescriptionBox();
        descriptionBox.mediaType = this.mimeType;
        box.contentBoxes.push(descriptionBox);

        const contentBox = new JUMBF.EmbeddedFileBox();
        contentBox.content = this.content;
        box.contentBoxes.push(contentBox);

        this.sourceBox = box;
        return box;
    }

    /**
     * Creates a new thumbnail assertion
     * @param imageType Image format type (without `image/`)
     * @param content Binary thumbnail content
     * @param thumbnailType Thumbnail type (claim or ingredient)
     * @param suffix Optional suffix for ingredient thumbnails
     */
    public static create(
        imageType: string,
        content: Uint8Array,
        thumbnailType: ThumbnailType,
        suffix?: string,
    ): ThumbnailAssertion {
        const assertion = new ThumbnailAssertion();
        assertion.mimeType = `image/${imageType}`;
        assertion.content = content;
        assertion.thumbnailType = thumbnailType;
        if (thumbnailType === ThumbnailType.Claim) {
            if (suffix) throw new Error('Suffix is not allowed for claim thumbnails');
            assertion.label = AssertionLabels.thumbnailPrefix + imageType;
        } else {
            assertion.label =
                AssertionLabels.ingredientThumbnailPrefix + (suffix ? '_' + suffix : '') + '.' + imageType;
        }
        return assertion;
    }

    // These are not used because we override readFromJUMBF() and generateJUMBFBox()
    public readContentFromJUMBF(): void {
        throw new Error('Method not implemented.');
    }
    public generateJUMBFBoxForContent(): JUMBF.IBox {
        throw new Error('Method not implemented.');
    }
}
