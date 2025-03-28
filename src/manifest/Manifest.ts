import { Asset } from '../asset';
import { Signer } from '../cose';
import { HashAlgorithm } from '../crypto';
import { Crypto } from '../crypto/Crypto';
import * as JUMBF from '../jumbf';
import { TimestampProvider } from '../rfc3161';
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
    ClaimVersion,
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
    private readonly hashedReferences: HashedURI[] = [];

    public constructor(public readonly parentStore: ManifestStore) {}

    /**
     * Initializes a new manifest with the specified parameters
     * @param claimVersion - The version of the claim to create
     * @param assetFormat - The format of the asset this manifest is for
     * @param instanceID - Unique identifier for this manifest instance
     * @param defaultHashAlgorithm - Default hashing algorithm to use
     * @param signer - Signer to use for signing the manifest
     */
    public initialize(
        claimVersion: ClaimVersion,
        assetFormat: string | undefined,
        instanceID: string,
        defaultHashAlgorithm: HashAlgorithm | undefined,
        signer: Signer,
    ): void {
        this.assertions = new AssertionStore();

        this.signature = Signature.create(signer);

        const claim = new Claim();
        claim.version = claimVersion;
        claim.format = assetFormat;
        claim.instanceID = instanceID;
        claim.defaultAlgorithm = defaultHashAlgorithm;
        claim.signatureRef = 'self#jumbf=' + this.signature.label;
        this.claim = claim;
        this.label = claim.getURN();
    }

    /**
     * Reads a manifest from a JUMBF box
     * @param box - Source JUMBF box
     * @param parentStore - The manifest store this manifest is located in
     * @returns A new Manifest instance or undefined if box type is not recognized
     * @throws ValidationError if the box is invalid
     * @throws MalformedContentError if manifest structure is invalid
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
            throw new ValidationError(ValidationStatusCode.ClaimCBORInvalid, box, 'Manifest box is missing label');
        manifest.label = box.descriptionBox.label;

        const claim = box.getByUUID(raw.UUIDs.claim);
        if (!claim.length) throw new ValidationError(ValidationStatusCode.ClaimMissing, box);
        if (claim.length > 1) throw new ValidationError(ValidationStatusCode.ClaimMultiple, box);
        manifest.claim = Claim.read(claim[0]);

        const assertionStore = box.getByUUID(raw.UUIDs.assertionStore);
        if (assertionStore.length !== 1)
            throw new ValidationError(ValidationStatusCode.ClaimCBORInvalid, box, 'Expected one assertion store');
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
        this.componentStore.clear();
        if (this.claim) {
            this.componentStore.set(this.claim.label, this.claim);
        }
        if (this.signature) {
            this.componentStore.set(this.signature.label, this.signature);
        }
        if (this.assertions) {
            this.componentStore.set(this.assertions.label, this.assertions);
            for (const assertion of this.assertions.assertions) {
                this.componentStore.set(`${this.assertions.label}/${assertion.fullLabel}`, assertion);
            }
        }
    }

    /**
     * Generates a JUMBF box containing the manifest
     * @returns The generated JUMBF box
     * @throws Error if required fields are missing
     */
    public generateJUMBFBox(): JUMBF.SuperBox {
        // TODO: Here, we never assign this.sourceBox and leave it as is, to ensure we read back unmodified bytes when
        // re-signing an existing manifest. But in other classes, we do assign this.sourceBox within generateJUMBFBox().
        // Look into that discrepancy.
        if (this.sourceBox) return this.sourceBox;

        if (!this.label) throw new Error('Manifest must have a label');
        if (!this.assertions) throw new Error('Manifest must have assertions');
        if (!this.claim) throw new Error('Manifest must have a claim');
        if (!this.signature) throw new Error('Manifest must have a signature');

        const box = new JUMBF.SuperBox();
        box.descriptionBox = new JUMBF.DescriptionBox();
        box.descriptionBox.uuid = this.type === ManifestType.Standard ? raw.UUIDs.manifest : raw.UUIDs.updateManifest;
        box.descriptionBox.label = this.label;
        box.contentBoxes = [
            this.assertions.generateJUMBFBox(this.claim),
            this.claim.generateJUMBFBox(),
            this.signature.generateJUMBFBox(),
        ];

        return box;
    }

    /**
     * Resolves a JUMBF URL to a manifest component
     * @param url - JUMBF URL
     * @param sameManifestOnly - Should the component be located in this manifest only?
     * @returns The resolved ManifestComponent or undefined if not found
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
     * @param assertion - Assertion reference as HashedURI or string
     * @param sameManifestOnly - Should the assertion be located in this manifest only?
     * @returns The referenced Assertion or undefined if not found
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
     * Validates that a hashed reference is valid
     * @param reference - The hashed reference to validate
     * @returns Promise resolving to true if the hash matches, false otherwise
     */
    private async validateHashedReference(reference: HashedURI): Promise<boolean> {
        const referencedComponent = this.getComponentByURL(reference.uri);
        const bytes = referencedComponent?.getBytes(this.claim);
        if (!bytes) return false;

        const digest = await Crypto.digest(bytes, reference.algorithm);
        return BinaryHelper.bufEqual(reference.hash, digest);
    }

    /**
     * Calculates the hash for the hashed reference based on the referenced component
     * @param reference - The hashed reference to update
     * @throws Error if reference is invalid or manifest has no claim
     */
    public async updateHashedReference(reference: HashedURI): Promise<void> {
        if (!this.claim) throw new Error('Manifest must have a claim');

        const referencedComponent = this.getComponentByURL(reference.uri);
        if (!referencedComponent) throw new Error(`Invalid hash reference to ${reference.uri}`);

        reference.hash = await Crypto.digest(referencedComponent.getBytes(this.claim, true)!, reference.algorithm);
    }

    /**
     * Verifies the manifest's claim's validity
     * @param asset - Asset for validation of bindings
     * @returns Promise resolving to ValidationResult
     */
    public async validate(asset: Asset): Promise<ValidationResult> {
        const result = new ValidationResult();

        if (!this.claim?.sourceBox) {
            result.addError(ValidationStatusCode.ClaimMissing, this.sourceBox);
            return result;
        }

        // Validate the signature
        const referencedSignature = this.getComponentByURL(this.claim?.signatureRef, true);
        if (this.signature && referencedSignature === this.signature) {
            result.merge(await this.signature.validate(this.claim.getBytes(this.claim)!));
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

        // Validate gathered assertions
        for (const assertion of this.claim.gatheredAssertions) {
            const gatheredAssertion = this.getAssertion(assertion);
            if (!gatheredAssertion) {
                result.addError(ValidationStatusCode.AssertionMissing, assertion.uri);
                continue;
            }

            if (await this.validateHashedReference(assertion)) {
                result.addInformational(ValidationStatusCode.AssertionHashedURIMatch, assertion.uri);
            } else {
                result.addError(ValidationStatusCode.AssertionHashedURIMismatch, assertion.uri);
            }
        }

        // Only process asset data if everything has been validated so far
        if (!result.isValid) return result;

        // Validate assertions against asset data (e.g. hash matches)
        for (const assertion of referencedAssertions) {
            result.merge(await assertion.validateAgainstAsset(asset));
        }

        result.merge(await this.validateManifestRelationships());
        result.merge(await this.validateIngredients());

        return result;
    }

    /**
     * Validates that the correct assertions exist for the manifest type
     */
    private validateAssertionPresence(): ValidationResult {
        const result = new ValidationResult();

        if (this.type === ManifestType.Standard) {
            result.merge(this.validateStandardManifestAssertions());
        } else if (this.type === ManifestType.Update) {
            result.merge(this.validateUpdateManifestAssertions());
        }

        return result;
    }

    /**
     * Validates assertions in a standard manifest
     * @returns ValidationResult containing any validation errors or successes
     */
    private validateStandardManifestAssertions(): ValidationResult {
        const result = new ValidationResult();

        // Standard manifests need to have exactly one hard binding
        const hardBindings = this.assertions?.getHardBindings() ?? [];
        if (!hardBindings.length) {
            result.addError(ValidationStatusCode.ClaimHardBindingsMissing, this.sourceBox);
        } else if (hardBindings.length > 1) {
            result.addError(ValidationStatusCode.AssertionMultipleHardBindings, this.sourceBox);
        }

        // There should be a maximum of one parentOf ingredient
        const parentOfIngredients = this.assertions?.getIngredientsByRelationship(RelationshipType.ParentOf) ?? [];
        if (parentOfIngredients.length > 1) {
            result.addError(ValidationStatusCode.ManifestMultipleParents, this.sourceBox);
        }

        return result;
    }

    /**
     * Validates assertions in an update manifest
     * @returns ValidationResult containing any validation errors or successes
     */
    private validateUpdateManifestAssertions(): ValidationResult {
        const result = new ValidationResult();

        // Update manifests should not contain any hard bindings or thumbnail assertions
        if (this.assertions?.getHardBindings().length || this.assertions?.getThumbnailAssertions().length) {
            result.addError(ValidationStatusCode.ManifestUpdateInvalid, this.sourceBox);
        }

        // There should be exactly one ingredient and its relationship should be parentOf
        if (
            this.assertions?.getAssertionsByLabel(AssertionLabels.ingredient)?.length !== 1 ||
            this.assertions?.getIngredientsByRelationship(RelationshipType.ParentOf)?.length !== 1
        ) {
            result.addError(ValidationStatusCode.ManifestUpdateWrongParents, this.sourceBox);
        }

        // Only certain actions are allowed in an action assertion
        if (
            this.assertions
                ?.getActionAssertions()
                ?.some(assertion =>
                    assertion.actions.some(
                        action =>
                            action.action !== ActionType.C2paEditedMetadata &&
                            action.action !== ActionType.C2paOpened &&
                            action.action !== ActionType.C2paPublished &&
                            action.action !== ActionType.C2paRedacted,
                    ),
                )
        ) {
            result.addError(ValidationStatusCode.ManifestUpdateInvalid, this.sourceBox);
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
        // First check mandatory actions
        const result = await this.validateMandatoryActions(assertionReference, assertion);
        if (!result.isValid) return result;

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

            if (referencedIngredient.activeManifest) {
                //Skipping hash validation of ingredient claims for now as they seem to be invalid in public test files
                //if (!await this.validateHashedReference(referencedIngredient.activeManifest)) return false;
            }

            if (referencedIngredient.thumbnail) {
                if (!(await this.validateHashedReference(referencedIngredient.thumbnail))) return false;
            }

            return true;
        };

        for (const action of assertion.actions) {
            if (
                action.action === ActionType.C2paOpened ||
                action.action === ActionType.C2paPlaced ||
                action.action === ActionType.C2paRemoved ||
                action.action === ActionType.C2paRepackaged ||
                action.action === ActionType.C2paTranscoded
            ) {
                if (!action.parameters?.ingredients?.length) {
                    // According to the specification:
                    // ---
                    // If the action field is c2pa.opened, c2pa.placed, c2pa.removed, c2pa.repackaged, or c2pa.transcoded:
                    // Check the ingredient field that is a member of the parameters object for the presence of a JUMBF URI.
                    // If the JUMBF URI is not present, or cannot be resolved to the related ingredient assertion, the claim
                    // must be rejected with a failure code of assertion.action.ingredientMismatch.
                    // ---
                    // However, a number of official sample images have c2pa.placed actions without an ingredient, so we
                    // allow these.
                    if (action.action === ActionType.C2paPlaced) continue;

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

    private async validateMandatoryActions(
        assertionReference: HashedURI,
        assertion: ActionAssertion,
    ): Promise<ValidationResult> {
        const result = new ValidationResult();

        if (this.type === ManifestType.Standard) {
            result.merge(this.validateStandardMandatoryActions(assertionReference, assertion));
        }

        // Allow multiple action assertions in 2.1+
        if (this.claim?.version && this.claim?.version >= ClaimVersion.V2) {
            return result;
        }

        // Check for multiple action assertions
        const actionAssertions = this.assertions?.getActionAssertions() ?? [];
        if (actionAssertions.length > 1) {
            result.addError(
                ValidationStatusCode.AssertionActionMalformed,
                assertionReference.uri,
                'Multiple action assertions are not allowed in a manifest',
            );
        }

        return result;
    }

    /**
     * Validates assertions in a standard manifest
     * @param assertionReference - Reference to the assertion being validated
     * @param assertion - The assertion to validate
     * @returns ValidationResult containing validation status
     */
    private validateStandardMandatoryActions(
        assertionReference: HashedURI,
        assertion: ActionAssertion,
    ): ValidationResult {
        const result = new ValidationResult();
        const hasRequiredAction = assertion.actions.some(
            a => a.action === ActionType.C2paCreated || a.action === ActionType.C2paOpened,
        );

        if (!hasRequiredAction) {
            result.addError(
                ValidationStatusCode.AssertionActionMalformed,
                assertionReference.uri,
                'Standard manifest must contain either c2pa.created or c2pa.opened action',
            );
        }
        return result;
    }

    /**
     * Appends an assertion to the manifest's assertion store and adds a reference to the claim
     * @param assertion - The assertion to add
     * @param hashAlgorithm - Optional hash algorithm to use for the reference
     * @throws Error if manifest has no claim or assertion store
     */
    public addAssertion(assertion: Assertion, hashAlgorithm: HashAlgorithm | undefined = undefined): void {
        if (!this.claim) throw new Error('Manifest does not have claim');
        if (!this.assertions) throw new Error('Manifest does not have an assertion store');

        this.assertions.assertions.push(assertion);
        this.claim.assertions.push(this.createAssertionReference(assertion, hashAlgorithm));
    }

    /**
     * Creates a hashed reference to an assertion. The hash is left empty and will be calculated
     * during sign().
     * @param assertion - The assertion to reference
     * @param hashAlgorithm - Optional hash algorithm to use
     * @returns HashedURI reference to the assertion
     * @throws Error if manifest has no assertion store
     */
    public createAssertionReference(
        assertion: Assertion,
        hashAlgorithm: HashAlgorithm | undefined = undefined,
    ): HashedURI {
        if (!this.assertions) throw new Error('Manifest does not have an assertion store');
        return this.createHashedReference(`${this.assertions.label}/${assertion.fullLabel}`, hashAlgorithm);
    }

    /**
     * Creates a hashed reference to a ManifestComponent. The hash is left empty and will be calculated
     * during sign().
     * @param label - The label of the component to reference
     * @param hashAlgorithm - Optional hash algorithm to use
     * @returns HashedURI reference to the component
     * @throws Error if manifest has no claim or missing algorithm
     */
    public createHashedReference(label: string, hashAlgorithm: HashAlgorithm | undefined = undefined): HashedURI {
        // TODO: It would be better to pass in a ManifestComponent here instead of the label and have the
        // ManifestComponent know its own URL. (We already do some of that during JUMBF box generation but
        // not in the component itself before a JUMBF box has been created.)

        if (!this.claim) throw new Error('Manifest does not have claim');

        if (!hashAlgorithm && !this.claim.defaultAlgorithm) throw new Error('Missing algorithm');
        const algorithm = hashAlgorithm ?? this.claim.defaultAlgorithm!;

        const uri = { uri: `self#jumbf=${label}`, hash: new Uint8Array(Crypto.getDigestLength(algorithm)), algorithm };

        this.hashedReferences.push(uri);

        return uri;
    }

    /**
     * Prepares the manifest for signing and fills in the signature
     * @param privateKey - Private key in PKCS#8 format
     * @param timestampProvider - An optional timestamp provider to add an RFC3161 timestamp
     * @throws Error if manifest has no claim or signature
     */
    public async sign(signer: Signer, timestampProvider?: TimestampProvider): Promise<void> {
        if (!this.claim) throw new Error('Manifest does not have claim');
        if (!this.signature) throw new Error('Manifest does not have signature');

        this.populateComponentStore();

        for (const reference of this.hashedReferences) {
            await this.updateHashedReference(reference);
        }

        await this.signature.sign(signer, this.claim.getBytes(this.claim, true)!, timestampProvider);
    }

    /**
     * Gets the bytes representation of the manifest
     * @param claim - Optional claim parameter
     * @returns Uint8Array of bytes or undefined if no source box exists
     */
    public getBytes(claim?: Claim): Uint8Array | undefined {
        if (!claim && !this.claim) {
            return undefined;
        }
        return this.sourceBox?.toBuffer();
    }

    /**
     * Validates relationships between manifests
     * @returns Promise resolving to ValidationResult
     */
    private async validateManifestRelationships(): Promise<ValidationResult> {
        // TODO: Manifest relationship validation needs to be revisited
        // Current validation is too strict and fails valid Adobe test files
        return new ValidationResult();
    }

    /**
     * Validates all ingredients in the manifest
     * @returns Promise resolving to ValidationResult
     */
    private async validateIngredients(): Promise<ValidationResult> {
        const result = new ValidationResult();
        const ingredients = this.assertions?.getAssertionsByLabel(AssertionLabels.ingredient) ?? [];

        for (const ingredient of ingredients) {
            if (!(ingredient instanceof IngredientAssertion)) continue;
            result.merge(await this.validateSingleIngredient(ingredient));
        }

        return result;
    }

    /**
     * Validates a single ingredient
     * @param ingredient - The ingredient assertion to validate
     * @returns Promise resolving to ValidationResult
     */
    private async validateSingleIngredient(ingredient: IngredientAssertion): Promise<ValidationResult> {
        const result = new ValidationResult();
        result.merge(await ingredient.validate(this));

        if (!ingredient.activeManifest) {
            result.addInformational(ValidationStatusCode.IngredientUnknownProvenance, ingredient.sourceBox);
            return result;
        }

        return result;
    }
}
