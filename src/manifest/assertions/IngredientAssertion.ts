import { Signature } from '../../cose/Signature';
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

interface RawIngredientMapV1 {
    'dc:title': string;
    'dc:format': string;
    documentID?: string;
    instanceID: string;
    relationship: RelationshipType;
    c2pa_manifest?: raw.HashedURI;
    thumbnail?: raw.HashedURI;
    validationStatus?: ValidationStatusCode[];
    metadata?: raw.AssertionMetadataMap;
}

interface RawIngredientMapV2 extends Omit<RawIngredientMapV1, 'validationStatus' | 'c2pa_manifest'> {
    data?: raw.HashedURI;
    dataTypes?: { type: string; value?: string }[];
    informational_URI?: string;
}

interface RawIngredientMapV3
    extends Omit<RawIngredientMapV2, 'dc:title' | 'dc:format' | 'informational_URI' | 'documentID'> {
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
    claimSignature?: raw.HashedURI;
    informationalURI?: string;
    description?: string;
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
    public metadata?: raw.AssertionMetadataMap;
    public validationStatus?: ValidationStatusCode[];
    public c2pa_manifest?: HashedURI;

    public isV1Compatible(): boolean {
        return (
            this.title !== undefined &&
            this.format !== undefined &&
            this.instanceID !== undefined &&
            this.data === undefined &&
            this.dataTypes === undefined &&
            this.description === undefined &&
            this.informationalURI === undefined &&
            this.validationResults === undefined &&
            this.activeManifest === undefined &&
            this.claimSignature === undefined
        );
    }

    public isV2Compatible(): boolean {
        return (
            this.title !== undefined &&
            this.format !== undefined &&
            this.validationResults === undefined &&
            this.activeManifest === undefined &&
            this.claimSignature === undefined
        );
    }

    public isV3Compatible(): boolean {
        return this.documentID === undefined && this.validationStatus === undefined && this.c2pa_manifest === undefined;
    }

    /**
     * Reads the content of this assertion from a JUMBF box
     * @param box - The JUMBF box to read from
     * @param claim - The claim this assertion belongs to
     * @throws ValidationError if the box is invalid
     */
    public readContentFromJUMBF(box: JUMBF.IBox, claim: Claim): void {
        if (!(box instanceof JUMBF.CBORBox) || !this.uuid || !BinaryHelper.bufEqual(this.uuid, raw.UUIDs.cborAssertion))
            throw new ValidationError(
                ValidationStatusCode.AssertionCBORInvalid,
                this.sourceBox,
                'Ingredient assertion has invalid type',
            );

        const content = box.content as RawIngredientMapV3 & RawIngredientMapV2 & RawIngredientMapV1;

        if (!content.relationship)
            throw new ValidationError(
                ValidationStatusCode.AssertionCBORInvalid,
                this.sourceBox,
                'Ingredient assertion is missing a relationship',
            );

        this.title = content['dc:title'];
        this.format = content['dc:format'];
        this.instanceID = content.instanceID;
        this.relationship = content.relationship;

        if ('activeManifest' in content && content.activeManifest) {
            this.activeManifest = claim.mapHashedURI(content.activeManifest);
        } else if ('c2pa_manifest' in content && content.c2pa_manifest) {
            this.activeManifest = claim.mapHashedURI(content.c2pa_manifest);
        }

        if ('documentID' in content && content.documentID) {
            this.documentID = content.documentID;
        }

        if (content.thumbnail) this.thumbnail = claim.mapHashedURI(content.thumbnail);
        if (content.dataTypes) this.dataTypes = content.dataTypes;
        if (content.claimSignature) this.claimSignature = claim.mapHashedURI(content.claimSignature);
        if (content.validationResults) this.validationResults = content.validationResults;
        if (content.data) this.data = claim.mapHashedURI(content.data);

        if ('informationalURI' in content) {
            this.informationalURI = content.informationalURI;
        } else if ('informational_URI' in content && typeof content.informational_URI === 'string') {
            this.informationalURI = content.informational_URI;
        }

        if (content.description) this.description = content.description;
        if (content.metadata) this.metadata = content.metadata;
    }

    /**
     * Generates a JUMBF box containing this assertion's content
     * @param claim - The claim this assertion belongs to
     * @returns The generated JUMBF box
     * @throws Error if required fields are missing
     */
    public generateJUMBFBoxForContent(claim: Claim): JUMBF.IBox {
        if (!this.relationship) throw new Error('Assertion has no relationship');

        const content: RawIngredientMapV3 | RawIngredientMapV2 | RawIngredientMapV1 = {
            instanceID: this.instanceID!,
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
        if (this.metadata) content.metadata = this.metadata;
        if (this.documentID) (content as RawIngredientMapV2).documentID = this.documentID;
        if (this.validationStatus) (content as RawIngredientMapV1).validationStatus = this.validationStatus;
        if (this.c2pa_manifest)
            (content as RawIngredientMapV1).c2pa_manifest = claim.reverseMapHashedURI(this.c2pa_manifest);

        const box = new JUMBF.CBORBox();
        box.content = content;

        return box;
    }

    /**
     * Validates an ingredient assertion against a manifest
     * @param manifest - The manifest containing this ingredient
     * @returns Promise resolving to ValidationResult
     */
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

    /**
     * Validates a single ingredient's manifest reference
     * @param manifest - The manifest containing this ingredient
     * @throws Error if validation fails
     */
    private async validateIngredient(manifest: Manifest): Promise<void> {
        if (!this.activeManifest) {
            throw new Error('No active manifest reference');
        }

        const store = manifest.parentStore;
        if (!store) {
            throw new Error('Cannot access manifest store');
        }
    }
}
