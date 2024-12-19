import { X509Certificate } from '@peculiar/x509';
import { Asset } from '../asset';
import { CoseAlgorithmIdentifier } from '../cose';
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
    public urn?: string;
    private readonly componentStore = new Map<string, ManifestComponent>();
    private readonly hashedReferences: HashedURI[] = [];

    public constructor(public readonly parentStore: ManifestStore) {}

    public initialize(
        claimVersion: ClaimVersion,
        assetFormat: string | undefined,
        instanceID: string,
        defaultHashAlgorithm: HashAlgorithm | undefined,
        certificate: X509Certificate,
        signingAlgorithm: CoseAlgorithmIdentifier,
        chainCertificates: X509Certificate[] | undefined,
    ): void {
        this.assertions = new AssertionStore();

        this.signature = Signature.createFromCertificate(certificate, signingAlgorithm, chainCertificates);

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
        const bytes = referencedComponent?.getBytes(this.claim);
        if (!bytes) return false;

        const digest = await Crypto.digest(bytes, reference.algorithm);
        return BinaryHelper.bufEqual(reference.hash, digest);
    }

    /**
     * Calculates the hash for the hashed reference based on the referenced component
     */
    public async updateHashedReference(reference: HashedURI): Promise<void> {
        if (!this.claim) throw new Error('Manifest must have a claim');

        const referencedComponent = this.getComponentByURL(reference.uri);
        if (!referencedComponent) throw new Error(`Invalid hash reference to ${reference.uri}`);

        reference.hash = await Crypto.digest(referencedComponent.getBytes(this.claim, true)!, reference.algorithm);
    }

    /**
     * Verifies a the manifest's claim's validity
     * @param asset Asset for validation of bindings
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

        // Only process asset data if everything has been validated so far
        if (!result.isValid) return result;

        // Validate assertions against asset data (e.g. hash matches)
        for (const assertion of referencedAssertions) {
            result.merge(await assertion.validateAgainstAsset(asset));
        }

        //result.merge(await this.validateManifestRelationships());
        result.merge(await this.validateIngredients());

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
                // Enable hash validation of ingredient claims
                if (!(await this.validateHashedReference(referencedIngredient.activeManifest))) {
                    return false;
                }
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

        // For standard manifests, either c2pa.created or c2pa.opened must be present
        if (this.type === ManifestType.Standard) {
            const hasCreated = assertion.actions.some(a => a.action === ActionType.C2paCreated);
            const hasOpened = assertion.actions.some(a => a.action === ActionType.C2paOpened);

            if (!hasCreated && !hasOpened) {
                result.addError(
                    ValidationStatusCode.AssertionActionMalformed,
                    assertionReference.uri,
                    'Standard manifest must contain either c2pa.created or c2pa.opened action',
                );
            }

            // Check for redacted assertions in ingredients
            const ingredients = assertion.actions
                .filter(a => a.parameters?.ingredients)
                .flatMap(a => a.parameters!.ingredients!);

            for (const ingredient of ingredients) {
                const ingredientAssertion = this.getAssertion(ingredient, true);
                if (
                    ingredientAssertion instanceof IngredientAssertion &&
                    ingredientAssertion.validationResults?.activeManifest.failure.some(
                        status => status.code === ValidationStatusCode.AssertionNotRedacted,
                    )
                ) {
                    result.addError(ValidationStatusCode.AssertionNotRedacted, ingredient.uri); // Use ingredient.uri here
                    break;
                }
            }
        }

        // Allow multiple action assertions in 2.1+
        if (this.claim?.version && this.claim?.version >= ClaimVersion.V2) {
            return result;
        }

        // Check for multiple action assertions
        const actionAssertions = this.assertions?.getAssertionsByLabel(AssertionLabels.actions) ?? [];
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
     * Appends an assertion to the manifest's assertion store and adds a reference to the claim.
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
     */
    public createHashedReference(label: string, hashAlgorithm: HashAlgorithm | undefined = undefined): HashedURI {
        // TODO: It would be better to pass in a ManifestComponent here instead of the label and have the
        // ManifestComponent know its own URL. (We already do some of that during JUMBF box generation but
        // not in the component itself before a JUMBF box has been created.)

        if (!this.claim) throw new Error('Manifest does not have claim');

        if (!hashAlgorithm && !this.claim.defaultAlgorithm) throw new Error('Missing algorithm');
        const algorithm = hashAlgorithm ?? this.claim.defaultAlgorithm!;

        const uri = {
            uri: `self#jumbf=${label}`,
            hash: new Uint8Array(Crypto.getDigestLength(algorithm)),
            algorithm,
        };

        this.hashedReferences.push(uri);

        return uri;
    }

    /**
     * Prepares the manifest for signing and fills in the signature using the provided private key
     * @param privateKey Private key in PKCS#8 format
     * @param timestampProvider An optional timestamp provider to add an RFC3161 timestamp
     */
    public async sign(privateKey: Uint8Array, timestampProvider?: TimestampProvider): Promise<void> {
        if (!this.claim) throw new Error('Manifest does not have claim');
        if (!this.signature) throw new Error('Manifest does not have signature');

        this.populateComponentStore();

        for (const reference of this.hashedReferences) {
            await this.updateHashedReference(reference);
        }

        await this.signature.sign(privateKey, this.claim.getBytes(this.claim, true)!, timestampProvider);
    }

    public getBytes(claim?: Claim): Uint8Array | undefined {
        if (!claim && !this.claim) {
            return undefined;
        }
        return this.sourceBox?.toBuffer();
    }

    private async validateManifestRelationships(): Promise<ValidationResult> {
        const result = new ValidationResult();

        // Check for orphaned manifests
        const parentIngredients = this.assertions?.getIngredientsByRelationship(RelationshipType.ParentOf) ?? [];
        if (parentIngredients.length === 0) {
            result.addError(ValidationStatusCode.ManifestUnreferenced, this.sourceBox);
        }

        return result;
    }

    private async validateIngredients(): Promise<ValidationResult> {
        const result = new ValidationResult();
        const ingredients = this.assertions?.getAssertionsByLabel(AssertionLabels.ingredient) ?? [];

        for (const ingredient of ingredients) {
            if (ingredient instanceof IngredientAssertion) {
                result.merge(await ingredient.validate(this));
            }
        }

        return result;
    }
}
