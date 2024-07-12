import { BinaryHelper } from '../util';
import { Box } from './Box';

export class C2PASaltBox extends Box {
    public static readonly typeCode = 'c2sh';
    public salt?: Uint8Array;

    constructor() {
        super(C2PASaltBox.typeCode);
    }

    public parse(buf: Uint8Array) {
        if (buf.length !== 16 && buf.length !== 32) throw new Error('C2PASaltBox: Invalid length');
        this.salt = buf;
    }

    public toString(prefix?: string | undefined): string {
        return (prefix ?? '') + 'C2PA salt: ' + (this.salt ? BinaryHelper.toHexString(this.salt) : '<empty>');
    }
}
