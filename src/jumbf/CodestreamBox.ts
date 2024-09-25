import * as bin from 'typed-binary';
import { Box } from './Box';
import { BoxSchema } from './BoxSchema';

class CodestreamBoxSchema extends BoxSchema<CodestreamBox> {
    readContent(input: bin.ISerialInput, type: string, length: number): CodestreamBox {
        if (type != CodestreamBox.typeCode) throw new Error(`CodestreamBox: Unexpected type ${type}`);

        const data = bin.u8Array(length - 8).read(input);

        const box = new CodestreamBox();
        box.content = new Uint8Array(data);

        return box;
    }

    writeContent(output: bin.ISerialOutput, value: CodestreamBox): void {
        if (value.content) output.writeSlice(value.content);
    }

    measureContent(value: CodestreamBox, measurer: bin.IMeasurer): bin.IMeasurer {
        return measurer.add(value.content?.length ?? 0);
    }
}

export class CodestreamBox extends Box {
    public static readonly typeCode = 'jp2c';
    public static readonly schema = new CodestreamBoxSchema();
    public content?: Uint8Array;

    constructor() {
        super(CodestreamBox.typeCode, CodestreamBox.schema);
    }

    public toString(prefix?: string): string {
        return `${prefix ?? ''}Codestream content (length ${this.content?.length ?? 0})`;
    }
}
