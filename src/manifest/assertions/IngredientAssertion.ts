import * as JUMBF from '../../jumbf';
import { BinaryHelper } from '../../util';
import { Claim } from '../Claim';
import * as raw from '../rawTypes';
import { HashedURI, RelationshipType, ValidationStatusCode } from '../types';
import { ValidationError } from '../ValidationError';
import { Assertion } from './Assertion';
import { AssertionLabels } from './AssertionLabels';

interface RawIngredientMapV2 {
    'dc:title': string;
    'dc:format': string;
    documentID?: string;
    instanceID?: string;
    relationship: RelationshipType;
    data?: raw.HashedURI;
    c2pa_manifest?: raw.HashedURI;
    thumbnail?: raw.HashedURI;
    validationStatus?: {
        code: ValidationStatusCode;
        url?: string;
        explanation?: string;
        success?: boolean;
    }[];
    description?: string;
    informational_URI?: string;
    metadata?: raw.AssertionMetadataMap;
}

export class IngredientAssertion extends Assertion {
    public label = AssertionLabels.ingredient;
    public uuid = raw.UUIDs.cborAssertion;

    public title?: string;
    public format?: string;
    public documentID?: string;
    public instanceID?: string;
    public relationship?: RelationshipType;
    public manifestReference?: HashedURI;
    public thumbnailReference?: HashedURI;

    public readContentFromJUMBF(box: JUMBF.IBox, claim: Claim): void {
        if (!(box instanceof JUMBF.CBORBox) || !this.uuid || !BinaryHelper.bufEqual(this.uuid, raw.UUIDs.cborAssertion))
            throw new ValidationError(
                ValidationStatusCode.AssertionRequiredMissing,
                this.sourceBox,
                'Ingredient assertion has invalid type',
            );

        const content = box.content as RawIngredientMapV2;

        if (!content['dc:title'] || !content['dc:format'] || !content.relationship)
            throw new ValidationError(ValidationStatusCode.AssertionRequiredMissing, this.sourceBox);
        this.title = content['dc:title'];
        this.format = content['dc:format'];
        this.documentID = content.documentID;
        this.instanceID = content.instanceID;

        this.relationship = content.relationship;
        if (content.c2pa_manifest) this.manifestReference = claim.mapHashedURI(content.c2pa_manifest);
        if (content.thumbnail) this.thumbnailReference = claim.mapHashedURI(content.thumbnail);
    }

    public generateJUMBFBoxForContent(claim: Claim): JUMBF.IBox {
        if (!this.title) throw new Error('Assertion has no title');
        if (!this.format) throw new Error('Assertion has no format');
        if (!this.relationship) throw new Error('Assertion has no relationship');

        const content: RawIngredientMapV2 = {
            'dc:title': this.title,
            'dc:format': this.format,
            documentID: this.documentID,
            instanceID: this.instanceID,
            relationship: this.relationship,
        };
        if (this.manifestReference) content.c2pa_manifest = claim.reverseMapHashedURI(this.manifestReference);
        if (this.thumbnailReference) content.thumbnail = claim.reverseMapHashedURI(this.thumbnailReference);

        const box = new JUMBF.CBORBox();
        box.content = content;

        return box;
    }
}
