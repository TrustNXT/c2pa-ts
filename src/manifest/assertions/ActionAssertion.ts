import * as JUMBF from '../../jumbf';
import { BinaryHelper } from '../../util';
import { Claim } from '../Claim';
import * as raw from '../rawTypes';
import { Action, ActionReason, ActionType, DigitalSourceType, ValidationStatusCode } from '../types';
import { ValidationError } from '../ValidationError';
import { Assertion } from './Assertion';
import { AssertionLabels } from './AssertionLabels';

interface RawAction {
    action: ActionType | string;
    // `when` currently not implemented
    softwareAgent?: string;
    reason?: ActionReason | string;
    changed?: string;
    instanceID?: string;
    parameters?: {
        [key: string]: unknown;
        ingredient?: raw.HashedURI;
        description?: string;
    };
    digitalSourceType?: DigitalSourceType;
}

interface RawActionsMap {
    actions: RawAction[];
    metadata?: raw.AssertionMetadataMap;
}

interface RawActionV2 {
    action: ActionType | string;
    softwareAgent?: raw.ClaimGeneratorInfo;
    description?: string;
    digitalSourceType?: DigitalSourceType;
    // `when` currently not implemented
    // `changed` currently not implemented
    // `related` currently not implemented
    reason?: ActionReason | string;
    instanceID?: string;
    parameters?: {
        [key: string]: unknown;
        instanceID?: string;
        redacted?: string;
        ingredients?: raw.HashedURI[];
    };
}

interface RawTemplateV2 {
    action: ActionType | string;
    softwareAgent?: raw.ClaimGeneratorInfo;
    description?: string;
    digitalSourceType?: DigitalSourceType;
    icon?: raw.HashedURI; // TODO could also be extURI
    templateParameters?: Record<string, unknown>;
}

interface RawActionsMapV2 {
    actions: RawActionV2[];
    templates?: RawTemplateV2[];
    metadata?: raw.AssertionMetadataMap;
}

export class ActionAssertion extends Assertion {
    public actions: Action[] = [];

    public readContentFromJUMBF(box: JUMBF.IBox, claim: Claim): void {
        if (!(box instanceof JUMBF.CBORBox) || !this.uuid || !BinaryHelper.bufEqual(this.uuid, raw.UUIDs.cborAssertion))
            throw new ValidationError(
                ValidationStatusCode.AssertionRequiredMissing,
                this.sourceBox,
                'Action assertion has invalid type',
            );

        if (this.label === AssertionLabels.actionsV2) {
            const rawContent = box.content as RawActionsMapV2;
            if (!rawContent.actions?.length)
                throw new ValidationError(ValidationStatusCode.AssertionRequiredMissing, this.sourceBox);

            for (const rawAction of rawContent.actions) {
                const action: Action = {
                    action: rawAction.action as ActionType,
                    reason: rawAction.reason,
                    instanceID: rawAction.instanceID,
                    parameters:
                        rawAction.parameters ?
                            {
                                ...rawAction.parameters,
                                ingredients: rawAction.parameters.ingredients?.map(ingredient =>
                                    claim.mapHashedURI(ingredient),
                                ),
                            }
                        :   undefined,
                    digitalSourceType: rawAction.digitalSourceType,
                };

                const template = rawContent.templates?.find(t => t.action === rawAction.action);
                if (template) {
                    action.description = action.description ?? template.description;
                    action.digitalSourceType = action.digitalSourceType ?? template.digitalSourceType;
                }

                this.actions.push(action);
            }
        } else {
            const rawContent = box.content as RawActionsMap;
            if (!rawContent.actions?.length)
                throw new ValidationError(ValidationStatusCode.AssertionRequiredMissing, this.sourceBox);

            for (const rawAction of rawContent.actions) {
                this.actions.push({
                    action: rawAction.action as ActionType,
                    reason: rawAction.reason,
                    instanceID: rawAction.instanceID,
                    parameters:
                        rawAction.parameters ?
                            {
                                ...rawAction.parameters,
                                ingredients:
                                    rawAction.parameters.ingredient ?
                                        [claim.mapHashedURI(rawAction.parameters.ingredient)]
                                    :   [],
                                ingredient: undefined,
                            }
                        :   undefined,
                    digitalSourceType: rawAction.digitalSourceType,
                });
            }
        }
    }
}
