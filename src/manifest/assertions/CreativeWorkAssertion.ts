import { CreativeWork } from 'schema-dts';
import { IBox } from '../../jumbf';
import { Claim } from '../Claim';
import { ValidationStatusCode } from '../types';
import { ValidationError } from '../ValidationError';
import { SchemaOrgAssertion } from './SchemaOrgAssertion';

export class CreativeWorkAssertion extends SchemaOrgAssertion<CreativeWork> {
    public creativeWork: CreativeWork = {
        '@type': 'CreativeWork',
    };

    public readContentFromJUMBF(box: IBox, claim: Claim): void {
        super.readContentFromJUMBF(box, claim);

        if (this.item?.['@type'] !== 'CreativeWork')
            throw new ValidationError(
                ValidationStatusCode.AssertionJSONInvalid,
                this.sourceBox,
                'Creative work assertion has invalid item type',
            );
        this.creativeWork = this.item;
    }

    public generateJUMBFBoxForContent(claim: Claim): IBox {
        if (this.creativeWork['@type'] !== 'CreativeWork') throw new Error('CreativeWork object has invalid type');
        this.item = this.creativeWork;
        return super.generateJUMBFBoxForContent(claim);
    }
}
