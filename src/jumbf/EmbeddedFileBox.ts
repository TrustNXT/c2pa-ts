import * as bin from 'typed-binary';
import { Box } from './Box';
import { BoxSchema } from './BoxSchema';
import * as schemata from './schemata';

class EmbeddedFileBoxSchema extends BoxSchema<EmbeddedFileBox> {
    readonly length = schemata.length;
    readonly type = schemata.type;

    readContent(input: bin.ISerialInput, type: string, length: number): EmbeddedFileBox {
        if (type != EmbeddedFileBox.typeCode) throw new Error(`EmbeddedFileBox: Unexpected type ${type}`);

        const data = bin.u8Array(length - 8).read(input);

        const box = new EmbeddedFileBox();
        box.content = data;

        return box;
    }

    writeContent(output: bin.ISerialOutput, value: EmbeddedFileBox): void {
        if (value.content) output.writeSlice(value.content);
    }

    measureContent(value: EmbeddedFileBox, measurer: bin.IMeasurer): bin.IMeasurer {
        return measurer.add(value.content?.length ?? 0);
    }
}

export class EmbeddedFileBox extends Box {
    public static readonly typeCode = 'bidb';
    public static readonly schema = new EmbeddedFileBoxSchema();
    public content?: Uint8Array;

    constructor() {
        super(EmbeddedFileBox.typeCode, EmbeddedFileBox.schema);
    }

    public toString(prefix?: string): string {
        return `${prefix ?? ''}Embedded file content (length ${this.content?.length ?? 0})`;
    }
}
