import { Thing, WithContext } from 'schema-dts';
import { IBox, JSONBox } from '../../jumbf';
import { BinaryHelper } from '../../util';
import { Claim } from '../Claim';
import * as raw from '../rawTypes';
import { ValidationStatusCode } from '../types';
import { ValidationError } from '../ValidationError';
import { Assertion } from './Assertion';

/**
 * Generic base class for Schema.org based assertions.
 *
 * Subclasses are expected to override `readContentFromJUMBF()` and
 * `generateJUMBFBoxForContent()` and process/set the protected `item` property.
 */
export abstract class SchemaOrgAssertion<T extends Thing> extends Assertion {
    protected item?: T;

    public readContentFromJUMBF(box: IBox, claim: Claim): void {
        if (!(box instanceof JSONBox) || !this.uuid || !BinaryHelper.bufEqual(this.uuid, raw.UUIDs.jsonAssertion))
            throw new ValidationError(
                ValidationStatusCode.AssertionRequiredMissing,
                this.sourceBox,
                'Schema.org assertion has invalid type',
            );

        const content = box.content as WithContext<T>;
        const context = content['@context'];
        if (!context || !/^https?:\/\/schema\.org\/?/.test(context))
            throw new ValidationError(
                ValidationStatusCode.AssertionJSONInvalid,
                this.sourceBox,
                'Schema.org assertion has invalid context',
            );

        this.item = content;
    }

    public generateJUMBFBoxForContent(claim: Claim): IBox {
        if (!this.item) throw new Error('Assertion has no item');

        const box = new JSONBox();
        box.content = Object.assign({ '@context': 'http://schema.org' }, this.item);
        return box;
    }
}
