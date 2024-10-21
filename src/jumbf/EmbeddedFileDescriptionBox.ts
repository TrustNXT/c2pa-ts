import * as bin from 'typed-binary';
import { Box } from './Box';
import { BoxSchema } from './BoxSchema';

class EmbeddedFileDescriptionBoxSchema extends BoxSchema<EmbeddedFileDescriptionBox> {
    readonly flags = bin.byte;
    readonly fileName = bin.string;
    readonly mediaType = bin.string;

    readContent(input: bin.ISerialInput, type: string, length: number): EmbeddedFileDescriptionBox {
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
                (value.mediaType ? this.mediaType.measure(value.mediaType).size : 0) +
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

    public toString(prefix?: string): string {
        let s = `${prefix ?? ''}Embedded file description: ${this.mediaType}`;
        if (this.fileName) s += `, file name: ${this.fileName}`;
        return s;
    }
}
