import cbor from 'cbor-js';
import { BinaryHelper } from '../util';
import { Box } from './Box';

export class CBORBox extends Box {
    public static readonly typeCode = 'cbor';
    public content: unknown;
    public rawContent: Uint8Array | undefined;

    constructor() {
        super(CBORBox.typeCode);
    }

    public parse(buf: Uint8Array) {
        this.rawContent = buf;
        try {
            this.content = cbor.decode(BinaryHelper.toArrayBuffer(buf));
        } catch {
            // TODO This needs to be properly reported as a validation error
            throw new Error('CBORBox: Invalid CBOR data');
        }
    }

    public toString(prefix?: string): string {
        return (prefix ?? '') + 'CBOR content';
    }
}
