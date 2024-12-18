import { Crypto } from '../../crypto';
import * as JUMBF from '../../jumbf';
import { BinaryHelper } from '../../util';
import { Claim } from '../Claim';
import { Manifest } from '../Manifest';
import * as raw from '../rawTypes';
import { HashedURI, RelationshipType, ValidationStatusCode } from '../types';
import { ValidationError } from '../ValidationError';
import { ValidationResult } from '../ValidationResult';
import { Assertion } from './Assertion';
import { AssertionLabels } from './AssertionLabels';

interface RawIngredientMapV2 {
    'dc:title'?: string;
    'dc:format'?: string;
    documentID?: string;
    instanceID?: string;
    relationship: RelationshipType;
    data?: raw.HashedURI;
    activeManifest?: raw.HashedURI;
    thumbnail?: raw.HashedURI;
    validationStatus?: ValidationStatusCode[];
    description?: string;
    informational_URI?: string;
    metadata?: raw.AssertionMetadataMap;
    dataTypes?: { type: string; value?: string }[];
    claimSignature?: raw.HashedURI;
}

export class IngredientAssertion extends Assertion {
    public label = AssertionLabels.ingredient;
    public uuid = raw.UUIDs.cborAssertion;

    public title?: string;
    public format?: string;
    public documentID?: string;
    public instanceID?: string;
    public relationship?: RelationshipType;
    public activeManifest?: HashedURI;
    public thumbnail?: HashedURI;
    public dataTypes?: { type: string; value?: string }[];
    public claimSignature?: HashedURI;
    public validationStatus?: ValidationStatusCode[];

    public readContentFromJUMBF(box: JUMBF.IBox, claim: Claim): void {
        if (!(box instanceof JUMBF.CBORBox) || !this.uuid || !BinaryHelper.bufEqual(this.uuid, raw.UUIDs.cborAssertion))
            throw new ValidationError(
                ValidationStatusCode.AssertionCBORInvalid,
                this.sourceBox,
                'Ingredient assertion has invalid type',
            );

        const content = box.content as RawIngredientMapV2;

        if (!content['dc:title'] || !content['dc:format'] || !content.relationship)
            throw new ValidationError(ValidationStatusCode.AssertionCBORInvalid, this.sourceBox);
        this.title = content['dc:title'];
        this.format = content['dc:format'];
        this.documentID = content.documentID;
        this.instanceID = content.instanceID;

        this.relationship = content.relationship;
        if (content.activeManifest) this.activeManifest = claim.mapHashedURI(content.activeManifest);
        if (content.thumbnail) this.thumbnail = claim.mapHashedURI(content.thumbnail);
        if (content.dataTypes) this.dataTypes = content.dataTypes;
        if (content.claimSignature) this.claimSignature = claim.mapHashedURI(content.claimSignature);
        if (content.validationStatus) this.validationStatus = content.validationStatus;
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
        if (this.activeManifest) content.activeManifest = claim.reverseMapHashedURI(this.activeManifest);
        if (this.thumbnail) content.thumbnail = claim.reverseMapHashedURI(this.thumbnail);
        if (this.dataTypes?.length) content.dataTypes = this.dataTypes;
        if (this.claimSignature) content.claimSignature = claim.reverseMapHashedURI(this.claimSignature);
        if (this.validationStatus?.length) content.validationStatus = this.validationStatus;

        const box = new JUMBF.CBORBox();
        box.content = content;

        return box;
    }

    public override async validate(manifest: Manifest): Promise<ValidationResult> {
        const result = await super.validate(manifest);

        if (!this.relationship) {
            result.addError(ValidationStatusCode.AssertionCBORInvalid, this.sourceBox, 'Missing relationship');
        }

        // Validate ingredient assertions
        if (this.activeManifest) {
            try {
                await this.validateIngredient(manifest);
            } catch {
                result.addError(ValidationStatusCode.IngredientManifestMissing, this.sourceBox);
            }
        }

        return result;
    }

    private async validateIngredient(manifest: Manifest): Promise<void> {
        if (!this.activeManifest) {
            throw new Error('No active manifest reference');
        }

        const store = manifest.parentStore;
        if (!store) {
            throw new Error('Cannot access manifest store');
        }

        const ingredientManifest = store.getManifestByLabel(this.activeManifest.uri);
        if (!ingredientManifest?.claim) {
            throw new Error('Referenced manifest not found');
        }

        const manifestBytes = ingredientManifest.getBytes(ingredientManifest.claim);
        if (!manifestBytes) {
            throw new Error('Cannot get manifest bytes');
        }

        const hash = await Crypto.digest(manifestBytes, this.activeManifest.algorithm);
        if (!BinaryHelper.bufEqual(hash, this.activeManifest.hash)) {
            throw new Error('Manifest hash mismatch');
        }
    }
}
