import * as bin from 'typed-binary';
import { BinaryHelper } from '../util';
import { Box } from './Box';
import { BoxSchema } from './BoxSchema';
import * as schemata from './schemata';

class UUIDBoxSchema extends BoxSchema<UUIDBox> {
    readonly uuid = schemata.uuid;

    readContent(input: bin.ISerialInput, type: string, length: number): UUIDBox {
        if (type != UUIDBox.typeCode) throw new Error(`UUIDBox: Unexpected type ${type}`);

        const uuid = this.uuid.read(input);
        const content = bin.u8Array(length - 4 - 4 - 16).read(input);

        const box = new UUIDBox();

        box.uuid = uuid;
        box.content = content;

        return box;
    }

    writeContent(output: bin.ISerialOutput, value: UUIDBox): void {
        this.uuid.write(output, value.uuid);
        if (value.content) output.writeSlice(value.content);
    }

    measureContent(value: UUIDBox, measurer: bin.IMeasurer): bin.IMeasurer {
        return measurer.add(this.uuid.measure(value.uuid).size + (value.content?.length ?? 0));
    }
}

export class UUIDBox extends Box {
    public static readonly typeCode = 'uuid';
    public static readonly schema = new UUIDBoxSchema();
    public uuid: Uint8Array = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    public content?: Uint8Array;

    constructor() {
        super(UUIDBox.typeCode, UUIDBox.schema);
    }

    public toString(prefix?: string): string {
        let s = `${prefix ?? ''}UUID: ${BinaryHelper.toUUIDString(this.uuid)}`;
        if (this.content) s += `, with content (length ${this.content.length})`;
        return s;
    }
}
