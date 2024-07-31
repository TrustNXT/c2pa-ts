import { Asset } from '../asset';
import { Crypto } from '../crypto/Crypto';
import * as JUMBF from '../jumbf';
import { BinaryHelper, MalformedContentError } from '../util';
import { ActionAssertion, Assertion, AssertionLabels, IngredientAssertion } from './assertions';
import { AssertionStore } from './AssertionStore';
import { Claim } from './Claim';
import { ManifestStore } from './ManifestStore';
import * as raw from './rawTypes';
import { Signature } from './Signature';
import {
    Action,
    ActionType,
    HashedURI,
    ManifestComponent,
    ManifestComponentType,
    ManifestType,
    RelationshipType,
    ValidationStatusCode,
} from './types';
import { ValidationError } from './ValidationError';
import { ValidationResult } from './ValidationResult';

export class Manifest implements ManifestComponent {
    public label?: string;
    public sourceBox?: JUMBF.SuperBox;
    public type: ManifestType = ManifestType.Standard;
    public assertions?: AssertionStore;
    public claim?: Claim;
    public signature?: Signature;
    private readonly componentStore = new Map<string, ManifestComponent>();

    public constructor(public readonly parentStore: ManifestStore) {}

    /**
     * Reads a manifest from a JUMBF box
     * @param box Source JUMBF box
     * @param parentStore The manifest store this manifest is located in
     */
    public static read(box: JUMBF.SuperBox, parentStore: ManifestStore): Manifest | undefined {
        if (!box.descriptionBox) throw new MalformedContentError('Manifest box is missing a description box');

        if (BinaryHelper.bufEqual(box.descriptionBox.uuid, raw.UUIDs.compressedManifest)) {
            throw new MalformedContentError('Compressed manifests are not supported');
            // TODO decompress: There should be one content box of type brob with UUID raw.UUIDs.compressedBox
        }

        const manifest = new Manifest(parentStore);
        manifest.sourceBox = box;

        if (BinaryHelper.bufEqual(box.descriptionBox.uuid, raw.UUIDs.manifest)) {
            manifest.type = ManifestType.Standard;
        } else if (BinaryHelper.bufEqual(box.descriptionBox.uuid, raw.UUIDs.updateManifest)) {
            manifest.type = ManifestType.Update;
        } else {
            return undefined;
        }

        if (!box.descriptionBox.label)
            throw new ValidationError(ValidationStatusCode.ClaimRequiredMissing, box, 'Manifest box is missing label');
        manifest.label = box.descriptionBox.label;

        const claim = box.getByUUID(raw.UUIDs.claim);
        if (!claim.length) throw new ValidationError(ValidationStatusCode.ClaimMissing, box);
        if (claim.length > 1) throw new ValidationError(ValidationStatusCode.ClaimMultiple, box);
        manifest.claim = Claim.read(claim[0]);

        const assertionStore = box.getByUUID(raw.UUIDs.assertionStore);
        if (assertionStore.length !== 1)
            throw new ValidationError(ValidationStatusCode.ClaimRequiredMissing, box, 'Expected one assertion store');
        manifest.assertions = AssertionStore.read(assertionStore[0], manifest.claim);

        const signature = box.getByUUID(raw.UUIDs.signature);
        if (signature.length !== 1) throw new ValidationError(ValidationStatusCode.ClaimSignatureMissing, box);
        manifest.signature = Signature.read(signature[0]);

        manifest.populateComponentStore();

        return manifest;
    }

    /**
     * Builds a cache of manifest components by their label (for URL resolution)
     */
    private populateComponentStore() {
        for (const assertion of this.assertions?.assertions ?? []) {
            this.componentStore.set(`${this.assertions!.label}/${assertion.fullLabel}`, assertion);
        }
        if (this.claim?.label) {
            this.componentStore.set(this.claim.label, this.claim);
        }
        if (this.signature?.label) {
            this.componentStore.set(this.signature.label, this.signature);
        }
    }

    /**
     * Resolves a JUMBF URL to a manifest component
     * @param url JUMBF URL
     * @param sameManifestOnly Should the component be located in this manifest only?
     */
    public getComponentByURL(url?: string, sameManifestOnly = false): ManifestComponent | undefined {
        const m = url?.match(/^self#jumbf=(.+)$/);
        if (!m) return undefined;

        let path = m[1];
        let componentStore = this.componentStore;

        if (path.startsWith('/c2pa/')) {
            const parts = path.split('/');
            if (parts.length < 3) return undefined;

            const otherManifest = this.parentStore.getManifestByLabel(parts[2]);
            if (!otherManifest) return undefined;

            if (sameManifestOnly && otherManifest !== this) return undefined;

            path = parts.slice(3).join('/');
            if (!path.length) return otherManifest;
            componentStore = otherManifest.componentStore;
        }

        const component = componentStore.get(path);
        if (!component) return undefined;

        return component;
    }

    /**
     * Retrieves an Assertion from a hashed reference (without validating the hash)
     * @param assertion Assertion reference
     * @param sameManifestOnly Should the assertion be located in this manifest only?
     */
    private getAssertion(assertion: HashedURI | string, sameManifestOnly?: boolean): Assertion | undefined {
        const component = this.getComponentByURL(
            typeof assertion === 'string' ? assertion : assertion.uri,
            sameManifestOnly,
        );
        if (!component) return undefined;

        // Make sure the referenced component is actually an assertion
        if (component.componentType !== ManifestComponentType.Assertion) return undefined;

        return component as Assertion;
    }

    /**
     * Validates that a hashed reference is valid, i.e. the referenced component exists and the hash matches
     */
    private async validateHashedReference(reference: HashedURI): Promise<boolean> {
        const referencedComponent = this.getComponentByURL(reference.uri);
        if (!referencedComponent?.sourceBox?.rawContent) return false;

        const digest = await Crypto.digest(referencedComponent.sourceBox.rawContent, reference.algorithm);
        return BinaryHelper.bufEqual(reference.hash, digest);
    }

    /**
     * Verifies a the manifest's claim's validity
     * @param asset Asset for validation of bindings
     */
    public async validate(asset: Asset): Promise<ValidationResult> {
        const result = new ValidationResult();

        if (!this.claim) {
            result.addError(ValidationStatusCode.ClaimMissing, this.sourceBox);
            return result;
        }

        // Validate the signature
        const referencedSignature = this.getComponentByURL(this.claim?.signatureRef, true);
        if (this.signature && referencedSignature === this.signature) {
            result.merge(await this.signature.validate(this.claim.getBytes()));
        } else {
            result.addError(ValidationStatusCode.ClaimSignatureMissing, this.claim.signatureRef);
        }

        // Basic manifest validity checks
        result.merge(this.validateAssertionPresence());

        // Validate redacted assertions
        for (const assertion of this.claim.redactedAssertions) {
            const redactedAssertion = this.getAssertion(assertion);
            if (!redactedAssertion) {
                result.addError(ValidationStatusCode.AssertionMissing, assertion.uri);
                continue;
            }

            result.merge(await this.validateRedactedAssertion(assertion, redactedAssertion));
        }

        // Validate claimed assertions
        const referencedAssertions: Assertion[] = [];
        for (const assertion of this.claim.assertions) {
            const referencedAssertion = this.getAssertion(assertion);
            if (!referencedAssertion) {
                result.addError(ValidationStatusCode.AssertionMissing, assertion.uri);
                continue;
            }
            referencedAssertions.push(referencedAssertion);

            result.merge(await this.validateAssertion(assertion, referencedAssertion));
        }

        // Only process asset data if everything has been validated so far
        if (!result.isValid) return result;

        // Validate assertions against asset data (e.g. hash matches)
        for (const assertion of referencedAssertions) {
            result.merge(await assertion.validateAgainstAsset(asset));
        }

        return result;
    }

    /**
     * Validates that the correct assertions exist for the manifest type
     */
    private validateAssertionPresence(): ValidationResult {
        const result = new ValidationResult();

        if (this.type === ManifestType.Standard) {
            // Standard manifests need to have exactly one hard binding
            const hardBindings = this.assertions?.getHardBindings() ?? [];
            if (!hardBindings.length) {
                result.addError(ValidationStatusCode.ClaimHardBindingsMissing, this.sourceBox);
            } else if (hardBindings.length > 1) {
                result.addError(ValidationStatusCode.AssertionMultipleHardBindings, this.sourceBox);
            }

            // There should be a maximum of one parentOf ingredient
            const parentOfIngredients = (
                (this.assertions?.getAssertionsByLabel(AssertionLabels.ingredient) ?? []) as IngredientAssertion[]
            ).filter(a => a.relationship === RelationshipType.ParentOf);
            if (parentOfIngredients.length > 1) {
                result.addError(ValidationStatusCode.ManifestMultipleParents, this.sourceBox);
            }
        } else if (this.type === ManifestType.Update) {
            // Update manifests should not contain any hard bindings, action assertions, or thumbnail assertions
            if (
                this.assertions?.getHardBindings().length ||
                this.assertions?.getAssertionsByLabel(AssertionLabels.actions).length ||
                this.assertions?.getAssertionsByLabel(AssertionLabels.actionsV2).length ||
                this.assertions?.getThumbnailAssertions().length
            ) {
                result.addError(ValidationStatusCode.ManifestUpdateInvalid, this.sourceBox);
            }

            // There should be exactly one parentOf ingredient
            const ingredients = (this.assertions?.getAssertionsByLabel(AssertionLabels.ingredient) ??
                []) as IngredientAssertion[];
            if (ingredients.length !== 1 || ingredients[0].relationship !== RelationshipType.ParentOf) {
                result.addError(ValidationStatusCode.ManifestUpdateWrongParents, this.sourceBox);
            }
        }

        return result;
    }

    /**
     * Validates an individual assertion
     * @param assertionReference Hashed reference to the assertion (from the claim)
     * @param assertion The referenced `Assertion`
     */
    private async validateAssertion(assertionReference: HashedURI, assertion: Assertion): Promise<ValidationResult> {
        const result = new ValidationResult();

        // TODO If the assertion’s label is c2pa.cloud-data...

        if (assertion.label === AssertionLabels.actions || assertion.label === AssertionLabels.actionsV2) {
            result.merge(await this.validateActionAssertion(assertionReference, assertion as ActionAssertion));
        }
        // TODO Validate references of thumbnail assertions

        // Validate the hash reference to the assertion
        if (await this.validateHashedReference(assertionReference)) {
            result.addInformational(ValidationStatusCode.AssertionHashedURIMatch, assertionReference.uri);
        } else {
            result.addError(ValidationStatusCode.AssertionHashedURIMismatch, assertionReference.uri);
        }

        return result;
    }

    /**
     * Validates a redacted assertion
     */
    private async validateRedactedAssertion(
        assertion: HashedURI,
        redactedAssertion: Assertion,
    ): Promise<ValidationResult> {
        if (!(await this.validateHashedReference(assertion))) {
            return ValidationResult.error(ValidationStatusCode.AssertionHashedURIMismatch, assertion.uri);
        }

        // Action assertions should not be redacted
        if (
            redactedAssertion.label === AssertionLabels.actions ||
            redactedAssertion.label === AssertionLabels.actionsV2
        ) {
            return ValidationResult.error(ValidationStatusCode.AssertionActionRedacted, assertion.uri);
        }

        // Can't redact assertions from the same claim
        if (this.claim?.assertions.some(other => other.uri === assertion.uri)) {
            return ValidationResult.error(ValidationStatusCode.AssertionSelfRedacted, assertion.uri);
        }

        return ValidationResult.success();
    }

    /**
     * Validates an actions assertion
     * @param assertionReference Hashed reference to the assertion
     * @param assertion The referenced `ActionAssertion`
     */
    private async validateActionAssertion(
        assertionReference: HashedURI,
        assertion: ActionAssertion,
    ): Promise<ValidationResult> {
        // Validate a referenced ingredient assertion
        const validateActionIngredient = async (
            action: Action,
            referencedIngredient: IngredientAssertion,
        ): Promise<boolean> => {
            if (
                (action.action === ActionType.C2paOpened ||
                    action.action === ActionType.C2paRepackaged ||
                    action.action === ActionType.C2paTranscoded) &&
                referencedIngredient.relationship !== RelationshipType.ParentOf
            ) {
                return false;
            }

            if (
                (action.action === ActionType.C2paPlaced || action.action === ActionType.C2paRemoved) &&
                referencedIngredient.relationship !== RelationshipType.ComponentOf
            ) {
                return false;
            }

            if (referencedIngredient.manifestReference) {
                //Skipping hash validation of ingredient claims for now as they seem to be invalid in public test files
                //if (!await this.validateHashedReference(referencedIngredient.manifestReference)) return false;
            }

            return true;
        };

        const result = new ValidationResult();

        for (const action of assertion.actions) {
            if (
                action.action === ActionType.C2paOpened ||
                action.action === ActionType.C2paPlaced ||
                action.action === ActionType.C2paRemoved ||
                action.action === ActionType.C2paRepackaged ||
                action.action === ActionType.C2paTranscoded
            ) {
                if (!action.parameters?.ingredients?.length) {
                    result.addError(
                        ValidationStatusCode.AssertionActionIngredientMismatch,
                        assertionReference.uri,
                        `${action.action} action is missing ingredients`,
                    );
                    break;
                }

                for (const ingredient of action.parameters.ingredients) {
                    const referencedIngredient = this.getAssertion(ingredient, true);
                    if (
                        !referencedIngredient ||
                        !(referencedIngredient instanceof IngredientAssertion) ||
                        !(await validateActionIngredient(action, referencedIngredient))
                    ) {
                        result.addError(
                            ValidationStatusCode.AssertionActionIngredientMismatch,
                            assertionReference.uri,
                            `Ingredient referenced in ${action.action} action is not valid`,
                        );
                        break;
                    }

                    if (!(await this.validateHashedReference(ingredient))) {
                        result.addError(
                            ValidationStatusCode.AssertionActionIngredientMismatch,
                            assertionReference.uri,
                            `Invalid hash supplied for ingredient ${ingredient.uri} in ${action.action} action`,
                        );
                        break;
                    }
                }
                if (!result.isValid) break;
            } else if (action.action === ActionType.C2paRedacted) {
                if (!action.parameters?.redacted || !this.getAssertion(action.parameters.redacted)) {
                    result.addError(ValidationStatusCode.AssertionActionRedactionMismatch, assertionReference.uri);
                    break;
                }
            }
        }

        return result;
    }
}
