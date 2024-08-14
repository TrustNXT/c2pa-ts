import * as JUMBF from '../jumbf';
import {
    ActionAssertion,
    Assertion,
    BMFFHashAssertion,
    CreativeWorkAssertion,
    DataHashAssertion,
    IngredientAssertion,
    MetadataAssertion,
    UnknownAssertion,
} from './assertions';
import { AssertionLabels } from './assertions/AssertionLabels';
import { Claim } from './Claim';
import * as raw from './rawTypes';
import { ManifestComponent, ValidationStatusCode } from './types';
import { ValidationError } from './ValidationError';

export class AssertionStore implements ManifestComponent {
    public readonly label: string = 'c2pa.assertions';
    public assertions: Assertion[] = [];
    public sourceBox: JUMBF.SuperBox | undefined;

    public static read(box: JUMBF.SuperBox, claim: Claim): AssertionStore {
        const assertionStore = new AssertionStore();
        assertionStore.sourceBox = box;

        if (!box.descriptionBox?.label)
            throw new ValidationError(
                ValidationStatusCode.AssertionRequiredMissing,
                box,
                'Assertion store is missing label',
            );
        if (box.descriptionBox.label !== 'c2pa.assertions')
            throw new ValidationError(ValidationStatusCode.ClaimSignatureMissing, box, 'Assertion has invalid label');

        assertionStore.assertions = box.contentBoxes.map(contentBox => this.readAssertion(contentBox, claim));

        return assertionStore;
    }

    private static readAssertion(box: JUMBF.IBox, claim: Claim): Assertion {
        if (!(box instanceof JUMBF.SuperBox))
            throw new ValidationError(ValidationStatusCode.AssertionMissing, box, 'Assertion is not a SuperBox');
        if (!box.descriptionBox?.label)
            throw new ValidationError(ValidationStatusCode.AssertionRequiredMissing, box, 'Assertion is missing label');
        if (!box.contentBoxes.length)
            throw new ValidationError(
                ValidationStatusCode.AssertionRequiredMissing,
                box,
                'Assertion is missing content',
            );

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
        } else if (label.label === AssertionLabels.ingredient) {
            assertion = new IngredientAssertion();
        } else if (AssertionLabels.metadataAssertions.includes(label.label)) {
            assertion = new MetadataAssertion();
        } else {
            assertion = new UnknownAssertion();
        }

        assertion.readFromJUMBF(box, claim);

        return assertion;
    }

    public generateJUMBFBox(claim: Claim): JUMBF.SuperBox {
        const box = new JUMBF.SuperBox();
        box.descriptionBox = new JUMBF.DescriptionBox();
        box.descriptionBox.label = this.label;
        box.descriptionBox.uuid = raw.UUIDs.assertionStore;
        box.contentBoxes = this.assertions.map(assertion => assertion.generateJUMBFBox(claim));

        this.sourceBox = box;
        return box;
    }

    public getHardBindings() {
        return this.assertions.filter(
            assertion => assertion.label && AssertionLabels.hardBindings.includes(assertion.label),
        );
    }

    public getAssertionsByLabel(label: string) {
        return this.assertions.filter(assertion => assertion.label === label);
    }

    public getThumbnailAssertions() {
        return this.assertions.filter(
            assertion =>
                (assertion.label?.startsWith(AssertionLabels.thumbnailPrefix) ?? false) ||
                (assertion.label?.startsWith(AssertionLabels.ingredientThumbnailPrefix) ?? false),
        );
    }
}
