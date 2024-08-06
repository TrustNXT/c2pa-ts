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

        box.contentBoxes.forEach(contentBox => {
            if (!(contentBox instanceof JUMBF.SuperBox))
                throw new ValidationError(
                    ValidationStatusCode.AssertionMissing,
                    box,
                    'Assertion store contains invalid boxes',
                );
            assertionStore.assertions.push(this.readAssertion(contentBox, claim));
        });

        return assertionStore;
    }

    private static readAssertion(box: JUMBF.SuperBox, claim: Claim): Assertion {
        if (!box.descriptionBox?.label)
            throw new ValidationError(ValidationStatusCode.AssertionRequiredMissing, box, 'Assertion is missing label');
        if (!box.contentBoxes.length)
            throw new ValidationError(
                ValidationStatusCode.AssertionRequiredMissing,
                box,
                'Assertion is missing content',
            );

        let label = box.descriptionBox.label;
        let labelSuffix: number | undefined;
        const match = /^(.+)__(\d+)$/.exec(label);
        if (match) {
            label = match[1];
            labelSuffix = Number(match[2]);
        }

        let assertion: Assertion;
        switch (label) {
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

        assertion.sourceBox = box;
        assertion.uuid = box.descriptionBox.uuid;
        assertion.fullLabel = box.descriptionBox.label;
        assertion.label = label;
        assertion.labelSuffix = labelSuffix;

        assertion.readFromJUMBF(box.contentBoxes[0], claim);

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
