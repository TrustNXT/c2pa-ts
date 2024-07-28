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
        const content = [];
        for (let i = 0; i != length - 4 - 4 - 16; i++) {
            content.push(input.readByte());
        }
        const box = new UUIDBox();

        box.uuid = uuid;
        box.content = new Uint8Array(content);

        return box;
    }

    writeContent(output: bin.ISerialOutput, value: UUIDBox): void {
        this.uuid.write(output, value.uuid);
        value.content?.forEach(byte => output.writeByte(byte));
    }

    measureContent(value: UUIDBox, measurer: bin.IMeasurer): bin.IMeasurer {
        return measurer.add(this.uuid.measure(value.uuid).size + (value.content ? value.content.length : 0));
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

    public toString(prefix?: string | undefined): string {
        let s = `${prefix ?? ''}UUID: ${BinaryHelper.toUUIDString(this.uuid)}`;
        if (this.content) s += `, with content (length ${this.content.length})`;
        return s;
    }
}
