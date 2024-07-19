import * as bin from 'typed-binary';
import { BinaryHelper } from '../util';
import { Box } from './Box';
import { BoxSchema } from './BoxSchema';

class EmbeddedFileDescriptionBoxSchema extends BoxSchema<EmbeddedFileDescriptionBox> {
    readonly flags = bin.byte;
    readonly fileName = bin.string;
    readonly mediaType = bin.string;

    readContent(
        input: bin.ISerialInput,
        type: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        length: number,
    ): EmbeddedFileDescriptionBox {
        if (type != EmbeddedFileDescriptionBox.typeCode)
            throw new Error(`EmbeddedFileDescriptionBox: Unexpected type ${type}`);

        const flags = this.flags.read(input);

        const box = new EmbeddedFileDescriptionBox();

        box.mediaType = this.mediaType.read(input);
        if (flags & 1) {
            box.fileName = this.fileName.read(input);
        }

        return box;
    }

    writeContent(output: bin.ISerialOutput, value: EmbeddedFileDescriptionBox): void {
        this.flags.write(output, value.fileName ? 1 : 0);
        this.mediaType.write(output, value.mediaType ?? '');
        if (value.fileName) this.fileName.write(output, value.fileName);
    }

    measureContent(value: EmbeddedFileDescriptionBox, measurer: bin.IMeasurer): bin.IMeasurer {
        return measurer.add(
            1 + // flags
                this.mediaType.measure(value.mediaType ?? '').size +
                (value.fileName ? this.fileName.measure(value.fileName).size : 0),
        );
    }
}

export class EmbeddedFileDescriptionBox extends Box {
    public static readonly typeCode = 'bfdb';
    public static readonly schema = new EmbeddedFileDescriptionBoxSchema();
    public mediaType?: string;
    public fileName?: string;

    constructor() {
        super(EmbeddedFileDescriptionBox.typeCode, EmbeddedFileDescriptionBox.schema);
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
