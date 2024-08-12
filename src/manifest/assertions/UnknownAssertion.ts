import * as JUMBF from '../../jumbf';
import { Assertion } from './Assertion';

/**
 * This class is used as a placeholder when the assertion type is
 * unknown or unsupported.
 */
export class UnknownAssertion extends Assertion {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    public readContentFromJUMBF(): void {}

    /**
     * This is not implemented and probably shouldn't be. Reason is,
     * that we simply don't know what's in this box. Since it could
     * contain byte offsets that needs adjustments, we can't work with
     * it and not even serialize it as it is.
     */
    public generateJUMBFBoxForContent(): JUMBF.IBox {
        throw new Error('UnknownAssertion: Serialization not supported.');
    }
}
