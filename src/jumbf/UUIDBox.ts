import { BinaryHelper } from '../util';
import { Box } from './Box';

export class UUIDBox extends Box {
    public static readonly typeCode = 'uuid';
    public uuid: Uint8Array = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    public content?: Uint8Array;

    constructor() {
        super(UUIDBox.typeCode);
    }

    public parse(buf: Uint8Array) {
        if (buf.length < 16) throw new Error('UUIDBox: Data too short');

        this.uuid = buf.subarray(0, 16);
        this.content = buf.subarray(16);
    }

    public toString(prefix?: string | undefined): string {
        let s = `${prefix ?? ''}UUID: ${BinaryHelper.toUUIDString(this.uuid)}`;
        if (this.content) s += `, with content (length ${this.content.length})`;
        return s;
    }
}
