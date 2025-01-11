import * as JUMBF from '../jumbf';
import {
    ActionAssertion,
    Assertion,
    BMFFHashAssertion,
    CreativeWorkAssertion,
    DataHashAssertion,
    IngredientAssertion,
    MetadataAssertion,
    TrainingAndDataMiningAssertion,
    UnknownAssertion,
} from './assertions';
import { AssertionLabels } from './assertions/AssertionLabels';
import { ThumbnailAssertion } from './assertions/ThumbnailAssertion';
import { Claim } from './Claim';
import * as raw from './rawTypes';
import { ManifestComponent, RelationshipType, ValidationStatusCode } from './types';
import { ValidationError } from './ValidationError';

export class AssertionStore implements ManifestComponent {
    public readonly label: string = 'c2pa.assertions';
    public assertions: Assertion[] = [];
    public sourceBox: JUMBF.SuperBox | undefined;

    /**
     * Reads an assertion store from a JUMBF box
     * @param box - The JUMBF box to read from
     * @param claim - The claim this assertion store belongs to
     * @returns A new AssertionStore instance
     * @throws ValidationError if the box is invalid
     */
    public static read(box: JUMBF.SuperBox, claim: Claim): AssertionStore {
        const assertionStore = new AssertionStore();
        assertionStore.sourceBox = box;

        if (!box.descriptionBox?.label)
            throw new ValidationError(
                ValidationStatusCode.AssertionCBORInvalid,
                box,
                'Assertion store is missing label',
            );
        if (box.descriptionBox.label !== 'c2pa.assertions')
            throw new ValidationError(ValidationStatusCode.ClaimSignatureMissing, box, 'Assertion has invalid label');

        assertionStore.assertions = box.contentBoxes.map(contentBox => this.readAssertion(contentBox, claim));

        return assertionStore;
    }

    /**
     * Reads an assertion from a JUMBF box
     * @param box - The JUMBF box to read from
     * @param claim - The claim this assertion belongs to
     * @returns The created Assertion instance
     * @throws ValidationError if the box is invalid
     */
    private static readAssertion(box: JUMBF.IBox, claim: Claim): Assertion {
        if (!(box instanceof JUMBF.SuperBox))
            throw new ValidationError(ValidationStatusCode.AssertionMissing, box, 'Assertion is not a SuperBox');
        if (!box.descriptionBox?.label)
            throw new ValidationError(ValidationStatusCode.AssertionCBORInvalid, box, 'Assertion is missing label');
        if (!box.contentBoxes.length)
            throw new ValidationError(ValidationStatusCode.AssertionCBORInvalid, box, 'Assertion is missing content');

        // split the label into the actual label and the index
        const label = Assertion.splitLabel(box.descriptionBox.label);

        let assertion: Assertion;
        if (label.label === AssertionLabels.actions || label.label === AssertionLabels.actionsV2) {
            assertion = new ActionAssertion();
        } else if (label.label === AssertionLabels.bmffV2Hash) {
            assertion = new BMFFHashAssertion();
        } else if (label.label === AssertionLabels.creativeWork) {
            assertion = new CreativeWorkAssertion();
        } else if (label.label === AssertionLabels.dataHash) {
            assertion = new DataHashAssertion();
        } else if (
            label.label === AssertionLabels.ingredient ||
            label.label === AssertionLabels.ingredientV2 ||
            label.label === AssertionLabels.ingredientV3
        ) {
            assertion = new IngredientAssertion();
        } else if (AssertionLabels.metadataAssertions.includes(label.label)) {
            assertion = new MetadataAssertion();
        } else if (label.label === AssertionLabels.trainingAndDataMining) {
            assertion = new TrainingAndDataMiningAssertion(false);
        } else if (label.label === AssertionLabels.cawgTrainingAndDataMining) {
            assertion = new TrainingAndDataMiningAssertion(true);
        } else if (
            box.descriptionBox.label.startsWith(AssertionLabels.thumbnailPrefix) ||
            box.descriptionBox.label.startsWith(AssertionLabels.ingredientThumbnailPrefix)
        ) {
            assertion = new ThumbnailAssertion();
        } else {
            assertion = new UnknownAssertion();
        }

        assertion.readFromJUMBF(box, claim);

        return assertion;
    }

    /**
     * Generates a JUMBF box containing the assertion store
     * @param claim - The claim this assertion store belongs to
     * @returns The generated JUMBF box
     */
    public generateJUMBFBox(claim: Claim): JUMBF.SuperBox {
        const box = new JUMBF.SuperBox();
        box.descriptionBox = new JUMBF.DescriptionBox();
        box.descriptionBox.label = this.label;
        box.descriptionBox.uuid = raw.UUIDs.assertionStore;
        box.contentBoxes = this.assertions.map(assertion => assertion.generateJUMBFBox(claim));

        this.sourceBox = box;
        return box;
    }

    /**
     * Gets all hard binding assertions from the store
     * @returns Array of assertions that are considered hard bindings
     */
    public getHardBindings() {
        return this.assertions.filter(
            assertion => assertion.label && AssertionLabels.hardBindings.includes(assertion.label),
        );
    }

    /**
     * Gets assertions by their label
     * @param label - The label to filter by
     * @returns Array of assertions matching the label
     */
    public getAssertionsByLabel(label: string) {
        return this.assertions.filter(assertion => assertion.label === label);
    }

    /**
     * Gets all action assertions from the store
     * @returns Array of ActionAssertion objects
     */
    public getActionAssertions() {
        return this.assertions.filter(assertion => assertion instanceof ActionAssertion);
    }

    /**
     * Gets all thumbnail assertions from the store
     * @returns Array of thumbnail assertions (both claim and ingredient thumbnails)
     */
    public getThumbnailAssertions() {
        return this.assertions.filter(
            assertion =>
                (assertion.label?.startsWith(AssertionLabels.thumbnailPrefix) ?? false) ||
                (assertion.label?.startsWith(AssertionLabels.ingredientThumbnailPrefix) ?? false),
        );
    }

    /**
     * Gets the bytes representation of the assertion store
     * @param claim - The claim this assertion store belongs to
     * @param rebuild - Whether to rebuild the JUMBF box before getting bytes
     * @returns Uint8Array of bytes or undefined if no source box exists
     */
    public getBytes(claim: Claim, rebuild = false) {
        if (rebuild) this.generateJUMBFBox(claim);
        return this.sourceBox?.toBuffer();
    }

    /**
     * Gets ingredient assertions filtered by relationship type
     * @param relationship - The relationship type to filter by
     * @returns Array of IngredientAssertion objects matching the relationship
     */
    public getIngredientsByRelationship(relationship: RelationshipType): IngredientAssertion[] {
        return this.assertions.filter(
            (a): a is IngredientAssertion => a instanceof IngredientAssertion && a.relationship === relationship,
        );
    }
}
