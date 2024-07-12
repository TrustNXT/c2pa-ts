import { BinaryHelper } from '../util';
import { Box } from './Box';

export class UUIDBox extends Box {
    public static readonly typeCode = 'uuid';
    public uuid?: Uint8Array;
    public content?: Uint8Array;

    constructor() {
        super(UUIDBox.typeCode);
    }

    public parse(buf: Uint8Array) {
        this.content = buf;
    }

    public toString(prefix?: string | undefined): string {
        let s = `${prefix ?? ''}UUID ${this.uuid ? BinaryHelper.toHexString(this.uuid) : '<empty>'}`;
        if (this.content) s += `, with content (length ${this.content.length})`;
        return s;
    }
}
