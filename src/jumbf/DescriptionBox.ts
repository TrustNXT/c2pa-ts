import { BinaryHelper } from '../util';
import { Box } from './Box';
import { BoxReader } from './BoxReader';
import { IBox } from './IBox';

export class DescriptionBox extends Box {
    public static readonly typeCode = 'jumd';
    public uuid?: Uint8Array;
    public requestable?: boolean;
    public label: string | undefined;
    public id: number | undefined;
    public hash: Uint8Array | undefined;
    public privateBoxes: IBox[] = [];

    constructor() {
        super(DescriptionBox.typeCode);
    }

    public parse(buf: Uint8Array) {
        if (buf.length < 17) {
            throw new Error('DescriptionBox: Data too short');
        }

        this.uuid = buf.subarray(0, 16);
        const toggles = buf[16];

        this.requestable = (toggles & 1) === 1;

        buf = buf.subarray(17);

        if ((toggles & 0b10) === 0b10) {
            if (!buf.length) throw new Error('DescriptionBox: Label present but data too short');
            const { string, bytesRead } = BinaryHelper.readNullTerminatedString(buf, 0);
            this.label = string;
            buf = buf.subarray(bytesRead);
        }

        if ((toggles & 0b100) === 0b100) {
            if (buf.length < 4) throw new Error('DescriptionBox: ID present but data too short');
            this.id = BinaryHelper.readUInt32(buf, 0);
            buf = buf.subarray(4);
        }

        if ((toggles & 0b1000) == 0b1000) {
            if (buf.length < 32) throw new Error('DescriptionBox: Signature present but data too short');
            this.hash = buf.subarray(0, 32);
            buf = buf.subarray(32);
        }

        if ((toggles & 0b10000) == 0b10000) {
            if (!buf.length) throw new Error('DescriptionBox: Private field present but data too short');
            while (buf.length > 0) {
                const { box, lBox } = BoxReader.readFromBuffer(buf);
                this.privateBoxes.push(box);
                buf = buf.subarray(lBox);
            }
        }
    }

    public toString(): string {
        const parts: string[] = [];
        if (this.uuid) parts.push(`UUID: ${BinaryHelper.toHexString(this.uuid)}`);
        if (this.requestable) parts.push(`requestable`);
        if (this.hash) parts.push('with hash');
        if (this.label) parts.push(`label: ${this.label}`);
        return parts.join(', ');
    }
}
