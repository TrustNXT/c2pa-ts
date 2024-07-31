import * as bin from 'typed-binary';
import { Box } from './Box';
import { BoxSchema } from './BoxSchema';
import * as schemata from './schemata';

class EmbeddedFileBoxSchema extends BoxSchema<EmbeddedFileBox> {
    readonly length = schemata.length;
    readonly type = schemata.type;

    readContent(input: bin.ISerialInput, type: string, length: number): EmbeddedFileBox {
        if (type != EmbeddedFileBox.typeCode) throw new Error(`EmbeddedFileBox: Unexpected type ${type}`);

        const data = [];
        for (let i = 0; i < length - 8; i++) {
            data.push(input.readByte());
        }

        const box = new EmbeddedFileBox();
        box.content = new Uint8Array(data);

        return box;
    }

    writeContent(output: bin.ISerialOutput, value: EmbeddedFileBox): void {
        if (value.content) {
            value.content.forEach(byte => output.writeByte(byte));
        }
    }

    measureContent(value: EmbeddedFileBox, measurer: bin.IMeasurer): bin.IMeasurer {
        return measurer.add(value.content ? value.content.length : 0);
    }
}

export class EmbeddedFileBox extends Box {
    public static readonly typeCode = 'bidb';
    public static readonly schema = new EmbeddedFileBoxSchema();
    public content?: Uint8Array;

    constructor() {
        super(EmbeddedFileBox.typeCode, EmbeddedFileBox.schema);
    }

    public toString(prefix?: string | undefined): string {
        return `${prefix ?? ''}Embedded file content (length ${this.content?.length ?? 0})`;
    }
}
