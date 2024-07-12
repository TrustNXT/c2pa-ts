import { BinaryHelper } from '../util';
import { Box } from './Box';

export class EmbeddedFileDescriptionBox extends Box {
    public static readonly typeCode = 'bfdb';
    public mediaType?: string;
    public fileName?: string;

    constructor() {
        super(EmbeddedFileDescriptionBox.typeCode);
    }

    public parse(buf: Uint8Array) {
        if (buf.length < 2) throw new Error('Embedded file description box too short');

        const hasFileName = buf[0] && 1 === 1;
        if (hasFileName && buf.length < 3) throw new Error('Embedded file description box too short');

        buf = buf.subarray(1);

        if (hasFileName) {
            const { string: s, bytesRead } = BinaryHelper.readNullTerminatedString(buf, 0);
            // If we have already reached to the end we are missing one null terminator
            if (bytesRead === buf.length) throw new Error('Embedded file description box invalid');
            this.mediaType = s;
            buf = buf.subarray(bytesRead);
        }

        const { string: s, bytesRead } = BinaryHelper.readNullTerminatedString(buf, 0);
        // We expect to read all the way to the end
        if (bytesRead !== buf.length) throw new Error('Embedded file description box invalid');
        if (hasFileName) this.fileName = s;
        else this.mediaType = s;
    }

    public toString(prefix?: string | undefined): string {
        let s = `${prefix ?? ''}Embedded file description: ${this.mediaType}`;
        if (this.fileName) s += `, file name: ${this.fileName}`;
        return s;
    }
}
