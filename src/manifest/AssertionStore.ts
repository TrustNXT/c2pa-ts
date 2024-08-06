import * as JUMBF from '../jumbf';
import { ActionAssertion, Assertion, DataHashAssertion, UnknownAssertion } from './assertions';
import { AssertionLabels } from './assertions/AssertionLabels';
import { BMFFHashAssertion } from './assertions/BMFFHashAssertion';
import { IngredientAssertion } from './assertions/IngredientAssertion';
import { Claim } from './Claim';
import { ManifestComponent, ValidationStatusCode } from './types';
import { ValidationError } from './ValidationError';

export class AssertionStore implements ManifestComponent {
    public assertions: Assertion[] = [];
    public label?: string;
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
        assertionStore.label = box.descriptionBox.label;

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
        switch (label.label) {
            case AssertionLabels.actions:
            case AssertionLabels.actionsV2:
                assertion = new ActionAssertion();
                break;
            case AssertionLabels.bmffV2Hash:
                assertion = new BMFFHashAssertion();
                break;
            case AssertionLabels.dataHash:
                assertion = new DataHashAssertion();
                break;
            case AssertionLabels.ingredient:
                assertion = new IngredientAssertion();
                break;
            default:
                assertion = new UnknownAssertion();
        }

        assertion.readFromJUMBF(box, claim);

        return assertion;
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
