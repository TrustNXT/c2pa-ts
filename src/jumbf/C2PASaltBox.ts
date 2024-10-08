import * as bin from 'typed-binary';
import { BinaryHelper } from '../util';
import { Box } from './Box';
import { BoxSchema } from './BoxSchema';

class C2PASaltBoxSchema extends BoxSchema<C2PASaltBox> {
    readContent(input: bin.ISerialInput, type: string, length: number): C2PASaltBox {
        if (type != C2PASaltBox.typeCode) throw new Error(`C2PASaltBox: Unexpected type ${type}`);
        if (length !== 8 + 16 && length !== 8 + 32) throw new Error(`C2PASaltBox: Unexpected length ${length}`);

        const salt = bin.u8Array(length - 8).read(input);

        const box = new C2PASaltBox();
        box.salt = salt;

        return box;
    }

    writeContent(output: bin.ISerialOutput, value: C2PASaltBox): void {
        if (value.salt) output.writeSlice(value.salt);
    }

    measureContent(value: C2PASaltBox, measurer: bin.IMeasurer): bin.IMeasurer {
        return measurer.add(value.salt?.length ?? 0);
    }
}

export class C2PASaltBox extends Box {
    public static readonly typeCode = 'c2sh';
    public static readonly schema = new C2PASaltBoxSchema();
    public salt?: Uint8Array;

    constructor() {
        super(C2PASaltBox.typeCode, C2PASaltBox.schema);
    }

    public toString(prefix?: string): string {
        return (prefix ?? '') + 'C2PA salt: ' + (this.salt ? BinaryHelper.toHexString(this.salt) : '<empty>');
    }
}
