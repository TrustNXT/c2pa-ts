import { Signature } from '../../cose/Signature';
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
    'dc:title': string;
    'dc:format': string;
    documentID?: string;
    instanceID?: string;
    relationship: RelationshipType;
    data?: raw.HashedURI;
    c2pa_manifest?: raw.HashedURI;
    thumbnail?: raw.HashedURI;
    validationStatus?: ValidationStatusCode[];
    description?: string;
    informational_URI?: string;
    metadata?: raw.AssertionMetadataMap;
    dataTypes?: { type: string; value?: string }[];
    claimSignature?: raw.HashedURI;
}

interface RawIngredientMapV3
    extends Omit<
        RawIngredientMapV2,
        'validationStatus' | 'dc:title' | 'dc:format' | 'informational_URI' | 'c2pa_manifest'
    > {
    'dc:title'?: string;
    'dc:format'?: string;
    activeManifest?: raw.HashedURI;
    validationResults?: {
        activeManifest: {
            success: raw.StatusMap[];
            informational: raw.StatusMap[];
            failure: raw.StatusMap[];
        };
        ingredientDeltas?: {
            ingredientAssertionURI: string;
            validationDeltas: {
                success: raw.StatusMap[];
                informational: raw.StatusMap[];
                failure: raw.StatusMap[];
            };
        }[];
    };
    informationalURI?: string;
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
    public validationResults?: RawIngredientMapV3['validationResults'];
    public informationalURI?: string;
    public data?: HashedURI;
    public description?: string;

    public readContentFromJUMBF(box: JUMBF.IBox, claim: Claim): void {
        if (!(box instanceof JUMBF.CBORBox) || !this.uuid || !BinaryHelper.bufEqual(this.uuid, raw.UUIDs.cborAssertion))
            throw new ValidationError(
                ValidationStatusCode.AssertionCBORInvalid,
                this.sourceBox,
                'Ingredient assertion has invalid type',
            );

        const content = box.content as RawIngredientMapV3;

        if (!content.relationship) throw new ValidationError(ValidationStatusCode.AssertionCBORInvalid, this.sourceBox);

        this.title = content['dc:title'];
        this.format = content['dc:format'];

        this.documentID = content.documentID;
        this.instanceID = content.instanceID;
        this.relationship = content.relationship;

        if (content.activeManifest) this.activeManifest = claim.mapHashedURI(content.activeManifest);
        if (content.thumbnail) this.thumbnail = claim.mapHashedURI(content.thumbnail);
        if (content.dataTypes) this.dataTypes = content.dataTypes;
        if (content.claimSignature) this.claimSignature = claim.mapHashedURI(content.claimSignature);
        if (content.validationResults) this.validationResults = content.validationResults;
        if (content.data) this.data = claim.mapHashedURI(content.data);
        if (content.informationalURI) this.informationalURI = content.informationalURI;
        if (content.description) this.description = content.description;
    }

    public generateJUMBFBoxForContent(claim: Claim): JUMBF.IBox {
        if (!this.relationship) throw new Error('Assertion has no relationship');

        const content: RawIngredientMapV3 = {
            documentID: this.documentID,
            instanceID: this.instanceID,
            relationship: this.relationship,
        };

        if (this.activeManifest) content.activeManifest = claim.reverseMapHashedURI(this.activeManifest);
        if (this.thumbnail) content.thumbnail = claim.reverseMapHashedURI(this.thumbnail);
        if (this.dataTypes?.length) content.dataTypes = this.dataTypes;
        if (this.claimSignature) content.claimSignature = claim.reverseMapHashedURI(this.claimSignature);
        if (this.validationResults) content.validationResults = this.validationResults;
        if (this.informationalURI) content.informationalURI = this.informationalURI;
        if (this.data) content.data = claim.reverseMapHashedURI(this.data);
        if (this.description) content.description = this.description;
        if (this.title) content['dc:title'] = this.title;
        if (this.format) content['dc:format'] = this.format;

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
                result.addInformational(ValidationStatusCode.IngredientManifestValidated, this.sourceBox);

                if (this.claimSignature) {
                    const ingredientManifest = manifest.parentStore.getManifestByLabel(this.activeManifest.uri);
                    if (ingredientManifest?.claim) {
                        const claimBytes = ingredientManifest.claim.getBytes(ingredientManifest.claim);
                        if (claimBytes) {
                            const signatureComponent = ingredientManifest.getComponentByURL(
                                ingredientManifest.claim.signatureRef,
                            );
                            if (signatureComponent instanceof Signature) {
                                const signatureResult = await signatureComponent.validate(claimBytes);
                                if (signatureResult.isValid) {
                                    result.addInformational(
                                        ValidationStatusCode.IngredientClaimSignatureValidated,
                                        this.sourceBox,
                                    );
                                } else {
                                    result.addError(
                                        ValidationStatusCode.IngredientClaimSignatureMismatch,
                                        this.sourceBox,
                                    );
                                    for (const entry of signatureResult.statusEntries) {
                                        result.addError(entry.code, this.sourceBox, entry.explanation);
                                    }
                                }
                            } else {
                                result.addError(ValidationStatusCode.IngredientClaimSignatureMissing, this.sourceBox);
                            }
                        }
                    }
                }
            } catch (error) {
                if (error instanceof Error) {
                    if (error.message === 'Manifest hash mismatch') {
                        result.addError(ValidationStatusCode.IngredientManifestMismatch, this.sourceBox);
                    } else if (error.message === 'Referenced manifest not found') {
                        result.addError(ValidationStatusCode.IngredientManifestMissing, this.sourceBox);
                    } else {
                        result.addError(ValidationStatusCode.GeneralError, this.sourceBox, error.message);
                    }
                } else {
                    result.addError(ValidationStatusCode.GeneralError, this.sourceBox, String(error));
                }
            }
        } else {
            result.addInformational(ValidationStatusCode.IngredientUnknownProvenance, this.sourceBox);
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
