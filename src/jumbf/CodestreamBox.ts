import * as bin from 'typed-binary';
import { Box } from './Box';
import { BoxSchema } from './BoxSchema';

class CodestreamBoxSchema extends BoxSchema<CodestreamBox> {
    readContent(input: bin.ISerialInput, type: string, length: number): CodestreamBox {
        if (type != CodestreamBox.typeCode) throw new Error(`CodestreamBox: Unexpected type ${type}`);

        const data = [];
        for (let i = 0; i < length - 8; i++) {
            data.push(input.readByte());
        }

        const box = new CodestreamBox();
        box.content = new Uint8Array(data);

        return box;
    }

    writeContent(output: bin.ISerialOutput, value: CodestreamBox): void {
        if (value.content) {
            value.content.forEach(byte => output.writeByte(byte));
        }
    }

    measureContent(value: CodestreamBox, measurer: bin.IMeasurer): bin.IMeasurer {
        return measurer.add(value.content ? value.content.length : 0);
    }
}

export class CodestreamBox extends Box {
    public static readonly typeCode = 'jp2c';
    public static readonly schema = new CodestreamBoxSchema();
    public content?: Uint8Array;

    constructor() {
        super(CodestreamBox.typeCode, CodestreamBox.schema);
    }

    public parse(buf: Uint8Array) {
        this.content = buf;
    }

    public toString(prefix?: string | undefined): string {
        return `${prefix ?? ''}Codestream content (length ${this.content?.length ?? 0})`;
    }
}
