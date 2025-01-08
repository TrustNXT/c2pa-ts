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

const ASSERTION_CREATION_VERSION = 3;

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

interface RawIngredientMapV2 extends Omit<RawIngredientMapV1, 'validationStatus' | 'instanceID'> {
    instanceID?: string;
    data?: raw.HashedURI;
    dataTypes?: { type: string; value?: string }[];
    informational_URI?: string;
    description?: string;
}

interface RawIngredientMapV3
    extends Omit<RawIngredientMapV2, 'dc:title' | 'dc:format' | 'informational_URI' | 'documentID' | 'c2pa_manifest'> {
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
}

export class IngredientAssertion extends Assertion {
    public label = AssertionLabels.ingredient;
    public uuid = raw.UUIDs.cborAssertion;
    public version: number = ASSERTION_CREATION_VERSION;

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

    public static new(title: string, format: string, instanceId: string, documentId?: string): IngredientAssertion {
        const assertion = new IngredientAssertion();
        assertion.version = 1;
        assertion.title = title;
        assertion.format = format;
        assertion.instanceID = instanceId;
        assertion.documentID = documentId;
        return assertion;
    }

    public static newV2(title: string, format: string): IngredientAssertion {
        const assertion = new IngredientAssertion();
        assertion.version = 2;
        assertion.title = title;
        assertion.format = format;
        return assertion;
    }

    public static newV3(relationship: RelationshipType): IngredientAssertion {
        const assertion = new IngredientAssertion();
        assertion.version = 3;
        assertion.relationship = relationship;
        return assertion;
    }

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

    private serializeV1(claim: Claim): RawIngredientMapV1 {
        if (!this.relationship) throw new Error('Assertion has no relationship');

        const content: RawIngredientMapV1 = {
            'dc:title': this.title!,
            'dc:format': this.format!,
            instanceID: this.instanceID!,
            relationship: this.relationship,
        };

        if (this.documentID) content.documentID = this.documentID;
        if (this.c2pa_manifest) content.c2pa_manifest = claim.reverseMapHashedURI(this.c2pa_manifest);
        if (this.thumbnail) content.thumbnail = claim.reverseMapHashedURI(this.thumbnail);
        if (this.validationStatus) content.validationStatus = this.validationStatus;
        if (this.metadata) content.metadata = this.metadata;

        return content;
    }

    private serializeV2(claim: Claim): RawIngredientMapV2 {
        if (!this.relationship) throw new Error('Assertion has no relationship');

        const content: RawIngredientMapV2 = {
            'dc:title': this.title!,
            'dc:format': this.format!,
            instanceID: this.instanceID!,
            relationship: this.relationship,
        };

        if (this.documentID) content.documentID = this.documentID;
        if (this.c2pa_manifest) content.c2pa_manifest = claim.reverseMapHashedURI(this.c2pa_manifest);
        if (this.data) content.data = claim.reverseMapHashedURI(this.data);
        if (this.dataTypes?.length) content.dataTypes = this.dataTypes;
        if (this.thumbnail) content.thumbnail = claim.reverseMapHashedURI(this.thumbnail);
        if (this.description) content.description = this.description;
        if (this.informationalURI) content.informational_URI = this.informationalURI;
        if (this.metadata) content.metadata = this.metadata;

        return content;
    }

    private serializeV3(claim: Claim): RawIngredientMapV3 {
        if (!this.relationship) throw new Error('Assertion has no relationship');

        if ((!this.activeManifest && this.validationResults) || (this.activeManifest && !this.validationResults)) {
            throw new Error('Ingredient has incompatible fields');
        }

        const content: RawIngredientMapV3 = {
            relationship: this.relationship,
        };

        if (this.title) content['dc:title'] = this.title;
        if (this.format) content['dc:format'] = this.format;
        if (this.instanceID) content.instanceID = this.instanceID;
        if (this.validationResults) content.validationResults = this.validationResults;
        if (this.data) content.data = claim.reverseMapHashedURI(this.data);
        if (this.dataTypes?.length) content.dataTypes = this.dataTypes;
        if (this.activeManifest) content.activeManifest = claim.reverseMapHashedURI(this.activeManifest);
        if (this.claimSignature) content.claimSignature = claim.reverseMapHashedURI(this.claimSignature);
        if (this.thumbnail) content.thumbnail = claim.reverseMapHashedURI(this.thumbnail);
        if (this.description) content.description = this.description;
        if (this.informationalURI) content.informationalURI = this.informationalURI;
        if (this.metadata) content.metadata = this.metadata;

        return content;
    }

    /**
     * Generates a JUMBF box containing this assertion's content
     * @param claim - The claim this assertion belongs to
     * @returns The generated JUMBF box
     * @throws Error if required fields are missing
     */
    public generateJUMBFBoxForContent(claim: Claim): JUMBF.IBox {
        let content;
        switch (this.version) {
            case 1:
                content = this.serializeV1(claim);
                break;
            case 2:
                content = this.serializeV2(claim);
                break;
            case 3:
                content = this.serializeV3(claim);
                break;
            default:
                throw new Error('Unsupported ingredient version');
        }

        const box = new JUMBF.CBORBox();
        box.content = content;
        return box;
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

        const content = box.content;

        // Determine version based on fields present
        if (this.isV3Content(content)) {
            this.version = 3;
            this.readV3Content(content, claim);
        } else if (this.isV2Content(content)) {
            this.version = 2;
            this.readV2Content(content, claim);
        } else {
            this.version = 1;
            this.readV1Content(content as RawIngredientMapV1, claim);
        }
    }

    private isV3Content(content: unknown): content is RawIngredientMapV3 {
        return (
            typeof content === 'object' &&
            content !== null &&
            'relationship' in content &&
            !('documentID' in content) &&
            !('validationStatus' in content) &&
            !('c2pa_manifest' in content) &&
            ('validationResults' in content || 'activeManifest' in content || 'claimSignature' in content)
        );
    }

    private isV2Content(content: unknown): content is RawIngredientMapV2 {
        return (
            typeof content === 'object' &&
            content !== null &&
            'dc:title' in content &&
            'dc:format' in content &&
            !('validationResults' in content) &&
            !('activeManifest' in content) &&
            !('claimSignature' in content) &&
            ('data' in content || 'dataTypes' in content || 'informational_URI' in content || 'description' in content)
        );
    }

    private readV1Content(content: RawIngredientMapV1, claim: Claim): void {
        if (!content.relationship) {
            throw new ValidationError(
                ValidationStatusCode.AssertionCBORInvalid,
                this.sourceBox,
                'Ingredient assertion is missing a relationship',
            );
        }

        // Mandatory fields
        this.title = content['dc:title'];
        this.format = content['dc:format'];
        this.instanceID = content.instanceID;
        this.relationship = content.relationship;

        // Optional fields
        if (content.documentID) this.documentID = content.documentID;
        if (content.c2pa_manifest) this.c2pa_manifest = claim.mapHashedURI(content.c2pa_manifest);
        if (content.thumbnail) this.thumbnail = claim.mapHashedURI(content.thumbnail);
        if (content.validationStatus) this.validationStatus = content.validationStatus;
        if (content.metadata) this.metadata = content.metadata;
    }

    private readV2Content(content: RawIngredientMapV2, claim: Claim): void {
        if (!content.relationship) {
            throw new ValidationError(
                ValidationStatusCode.AssertionCBORInvalid,
                this.sourceBox,
                'Ingredient assertion is missing a relationship',
            );
        }

        // Mandatory fields
        this.title = content['dc:title'];
        this.format = content['dc:format'];
        this.relationship = content.relationship;

        // Optional fields
        if (content.instanceID) this.instanceID = content.instanceID;
        if (content.documentID) this.documentID = content.documentID;
        if (content.data) this.data = claim.mapHashedURI(content.data);
        if (content.dataTypes) this.dataTypes = content.dataTypes;
        if (content.thumbnail) this.thumbnail = claim.mapHashedURI(content.thumbnail);
        if (content.description) this.description = content.description;
        if (content.informational_URI) this.informationalURI = content.informational_URI;
        if (content.metadata) this.metadata = content.metadata;
    }

    private readV3Content(content: RawIngredientMapV3, claim: Claim): void {
        if (!content.relationship) {
            throw new ValidationError(
                ValidationStatusCode.AssertionCBORInvalid,
                this.sourceBox,
                'Ingredient assertion is missing a relationship',
            );
        }

        // Check for incompatible fields
        if (
            (!content.activeManifest && content.validationResults) ||
            (content.activeManifest && !content.validationResults)
        ) {
            throw new ValidationError(
                ValidationStatusCode.AssertionCBORInvalid,
                this.sourceBox,
                'Ingredient has incompatible fields',
            );
        }

        // Mandatory field
        this.relationship = content.relationship;

        // Optional fields
        if (content['dc:title']) this.title = content['dc:title'];
        if (content['dc:format']) this.format = content['dc:format'];
        if (content.instanceID) this.instanceID = content.instanceID;
        if (content.validationResults) this.validationResults = content.validationResults;
        if (content.data) this.data = claim.mapHashedURI(content.data);
        if (content.dataTypes) this.dataTypes = content.dataTypes;
        if (content.activeManifest) this.activeManifest = claim.mapHashedURI(content.activeManifest);
        if (content.claimSignature) this.claimSignature = claim.mapHashedURI(content.claimSignature);
        if (content.thumbnail) this.thumbnail = claim.mapHashedURI(content.thumbnail);
        if (content.description) this.description = content.description;
        if (content.informationalURI) this.informationalURI = content.informationalURI;
        if (content.metadata) this.metadata = content.metadata;
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
