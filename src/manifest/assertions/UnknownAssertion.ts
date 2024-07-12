import { IBox } from '../../jumbf';
import { Claim } from '../Claim';
import { Assertion } from './Assertion';

export class UnknownAssertion extends Assertion {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
    public readFromJUMBF(box: IBox, claim?: Claim | undefined): void {}
}
