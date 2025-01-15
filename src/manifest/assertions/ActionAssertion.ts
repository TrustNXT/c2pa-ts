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
    softwareAgentIndex?: number;
    description?: string;
    digitalSourceType?: DigitalSourceType;
    // `when` currently not implemented
    // `changes` currently not implemented
    // `related` currently not implemented
    reason?: ActionReason | string;
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
    softwareAgentIndex?: number;
    description?: string;
    digitalSourceType?: DigitalSourceType;
    icon?: raw.HashedURI; // TODO could also be extURI
    templateParameters?: Record<string, unknown>;
}

interface RawActionsMapV2 {
    actions: RawActionV2[];
    templates?: RawTemplateV2[];
    softwareAgents?: raw.ClaimGeneratorInfo[];
    metadata?: raw.AssertionMetadataMap;
}

export class ActionAssertion extends Assertion {
    public label = AssertionLabels.actionsV2;
    public uuid = raw.UUIDs.cborAssertion;

    public actions: Action[] = [];

    public readContentFromJUMBF(box: JUMBF.IBox, claim: Claim): void {
        if (!(box instanceof JUMBF.CBORBox) || !this.uuid || !BinaryHelper.bufEqual(this.uuid, raw.UUIDs.cborAssertion))
            throw new ValidationError(
                ValidationStatusCode.AssertionCBORInvalid,
                this.sourceBox,
                'Action assertion has invalid type',
            );

        if (this.label === AssertionLabels.actionsV2) {
            this.mapActionsV2FromCBORData(box, claim);
        } else {
            this.mapActionsV1FromCBORData(box, claim);
        }
    }

    private mapActionsV1FromCBORData(box: JUMBF.CBORBox, claim: Claim) {
        const rawContent = box.content as RawActionsMap;
        if (!rawContent.actions?.length)
            throw new ValidationError(ValidationStatusCode.AssertionCBORInvalid, this.sourceBox);

        for (const rawAction of rawContent.actions) {
            const action: Action = {
                action: rawAction.action as ActionType,
            };

            if (rawAction.instanceID) action.instanceID = rawAction.instanceID;
            if (rawAction.digitalSourceType)
                action.digitalSourceType = this.fixDigitalSourceType(rawAction.digitalSourceType);
            if (rawAction.softwareAgent) action.softwareAgent = { name: rawAction.softwareAgent };
            if (rawAction.parameters) {
                action.parameters = {
                    ...rawAction.parameters,
                    ingredients:
                        rawAction.parameters.ingredient ? [claim.mapHashedURI(rawAction.parameters.ingredient)] : [],
                };
                delete action.parameters.ingredient;
            }

            this.actions.push(action);
        }
    }

    private mapActionsV2FromCBORData(box: JUMBF.CBORBox, claim: Claim) {
        const rawContent = box.content as RawActionsMapV2;
        if (!rawContent.actions?.length)
            throw new ValidationError(ValidationStatusCode.AssertionCBORInvalid, this.sourceBox);

        for (const rawAction of rawContent.actions) {
            const action: Action = {
                action: rawAction.action as ActionType,
            };

            if (rawAction.reason) action.reason = rawAction.reason;
            if (rawAction.digitalSourceType)
                action.digitalSourceType = this.fixDigitalSourceType(rawAction.digitalSourceType);
            if (rawAction.parameters)
                action.parameters = {
                    ...rawAction.parameters,
                    ingredients: rawAction.parameters.ingredients?.map(ingredient => claim.mapHashedURI(ingredient)),
                };

            if (rawAction.softwareAgent) {
                action.softwareAgent = {
                    name: rawAction.softwareAgent.name,
                    version: rawAction.softwareAgent.version,
                    icon: rawAction.softwareAgent.icon ? claim.mapHashedURI(rawAction.softwareAgent.icon) : undefined,
                    operatingSystem: rawAction.softwareAgent.operating_system,
                };
            } else if (rawAction.softwareAgentIndex !== undefined) {
                const softwareAgent = rawContent.softwareAgents?.[rawAction.softwareAgentIndex];
                if (softwareAgent) {
                    action.softwareAgent = {
                        name: softwareAgent.name,
                        version: softwareAgent.version,
                        icon: softwareAgent.icon ? claim.mapHashedURI(softwareAgent.icon) : undefined,
                        operatingSystem: softwareAgent.operating_system,
                    };
                }
            }

            const template = rawContent.templates?.find(t => t.action === rawAction.action);
            if (template) {
                action.description = action.description ?? template.description;
                action.digitalSourceType = action.digitalSourceType ?? template.digitalSourceType;
            }

            this.actions.push(action);
        }
    }

    public generateJUMBFBoxForContent(claim: Claim): JUMBF.IBox {
        const box = new JUMBF.CBORBox();
        switch (this.label) {
            case AssertionLabels.actions:
                box.content = this.mapActionsV1ToCBORData(claim);
                break;
            case AssertionLabels.actionsV2:
                box.content = this.mapActionsV2ToCBORData(claim);
                break;
            default:
                throw new Error('Invalid assertion label');
        }
        return box;
    }

    private mapActionsV1ToCBORData(claim: Claim): RawActionsMap {
        return {
            actions: this.actions.map(action => {
                const res: RawAction = { action: action.action };
                if (action.parameters) {
                    res.parameters = {};
                    for (const [name, value] of Object.entries(action.parameters)) {
                        if (value === undefined) continue;
                        if (name === 'ingredients') continue;
                        res.parameters[name] = value;
                    }

                    if (action.parameters.ingredients && action.parameters.ingredients.length !== 0) {
                        if (action.parameters.ingredients.length !== 1)
                            throw new Error('Multiple ingredients not supported');
                        const hashedURI = action.parameters.ingredients[0];
                        res.parameters.ingredient = {
                            hash: hashedURI.hash,
                            url: hashedURI.uri,
                        };
                        if (hashedURI.algorithm !== claim.defaultAlgorithm)
                            res.parameters.ingredient.alg = Claim.reverseMapHashAlgorithm(hashedURI.algorithm);
                    }
                }
                if (action.digitalSourceType) res.digitalSourceType = action.digitalSourceType;
                if (action.instanceID) res.instanceID = action.instanceID;
                if (action.softwareAgent) {
                    res.softwareAgent = action.softwareAgent.name;
                    if (action.softwareAgent.version) res.softwareAgent += ' ' + action.softwareAgent.version;
                }
                return res;
            }),
            // TODO: metadata
        };
    }

    private mapActionsV2ToCBORData(claim: Claim): RawActionsMapV2 {
        return {
            actions: this.actions.map(action => {
                const res: RawActionV2 = { action: action.action };
                if (action.reason) res.reason = action.reason;
                if (action.parameters) {
                    res.parameters = {};
                    for (const [name, value] of Object.entries(action.parameters)) {
                        if (name === 'ingredients') continue;
                        res.parameters[name] = value;
                    }

                    if (action.parameters.ingredients) {
                        res.parameters.ingredients = action.parameters.ingredients.map(hashedURI =>
                            claim.reverseMapHashedURI(hashedURI),
                        );
                    }
                }
                if (action.digitalSourceType) res.digitalSourceType = action.digitalSourceType;
                if (action.softwareAgent) {
                    const softwareAgent: raw.ClaimGeneratorInfo = {
                        name: action.softwareAgent.name,
                    };
                    if (action.softwareAgent.version) softwareAgent.version = action.softwareAgent.version;
                    if (action.softwareAgent.icon)
                        softwareAgent.icon = claim.reverseMapHashedURI(action.softwareAgent.icon);
                    if (action.softwareAgent.operatingSystem)
                        softwareAgent.operating_system = action.softwareAgent.operatingSystem;
                    res.softwareAgent = softwareAgent;
                }
                return res;
            }),
            // TODO: templates
            // TODO: metadata
        };
    }

    /**
     * Some implementations prefix digital source type values with https, convert those to http
     */
    private fixDigitalSourceType(digitalSourceType: DigitalSourceType): DigitalSourceType {
        if (digitalSourceType.startsWith('https://cv.iptc.org/')) {
            return ('http:' + digitalSourceType.substring('https:'.length)) as DigitalSourceType;
        }
        return digitalSourceType;
    }
}
