import * as bin from 'typed-binary';
import { BinaryHelper } from '../util';
import { Box } from './Box';
import { BoxReader } from './BoxReader';
import { BoxSchema } from './BoxSchema';
import { GenericBoxSchema } from './GenericBoxSchema';
import { IBox } from './IBox';
import * as schemata from './schemata';

class DescriptionBoxSchema extends BoxSchema<DescriptionBox> {
    readonly uuid = schemata.uuid;
    readonly toggles = bin.byte;
    readonly label = bin.string;
    readonly id = bin.u32;
    readonly hash = bin.arrayOf(bin.byte, 32);
    // Note: This doesn't work due to a circular import.
    // readonly privateBoxes = new GenericBoxSchema();

    readContent(input: bin.ISerialInput, type: string, length: number): DescriptionBox {
        if (type != DescriptionBox.typeCode) throw new Error(`DescriptionBox: Unexpected type ${type}`);
        const end = input.currentByteOffset + length - 8;

        const box = new DescriptionBox();
        box.uuid = this.uuid.read(input);
        const toggles = this.toggles.read(input);
        box.requestable = (toggles & 1) === 1;
        if ((toggles & 0b10) === 0b10) {
            box.label = this.label.read(input);
        }
        if ((toggles & 0b100) === 0b100) {
            box.id = this.id.read(input);
        }
        if ((toggles & 0b1000) == 0b1000) {
            box.hash = new Uint8Array(this.hash.read(input));
        }
        if ((toggles & 0b10000) == 0b10000) {
            const nestedBoxSchema = new GenericBoxSchema();
            while (input.currentByteOffset < end) {
                const nestedBox = nestedBoxSchema.read(input);
                box.privateBoxes.push(nestedBox);
            }
            if (input.currentByteOffset > end)
                throw new Error(
                    `DescriptionBox: Private field data exceeded box length by ${input.currentByteOffset - end} bytes`,
                );
        }

        return box;
    }

    writeContent(output: bin.ISerialOutput, value: DescriptionBox): void {
        this.uuid.write(output, value.uuid);
        const toggles =
            (value.requestable ? 1 : 0) +
            (value.label ? 0b10 : 0) +
            (value.id ? 0b100 : 0) +
            (value.hash ? 0b1000 : 0) +
            (value.privateBoxes.length ? 0b10000 : 0);
        this.toggles.write(output, toggles);
        if (value.label) this.label.write(output, value.label);
        if (value.id) this.id.write(output, value.id);
        if (value.hash) this.hash.write(output, Array.from(value.hash));
        value.privateBoxes.forEach(box => {
            box.schema.write(output, box);
        });
    }

    measureContent(value: DescriptionBox, measurer: bin.IMeasurer): bin.IMeasurer {
        return measurer.add(
            this.uuid.measure(value.uuid).size +
                1 + // toggles
                (value.label ? value.label.length + 1 : 0) +
                (value.id ? 4 : 0) +
                (value.hash ? 32 : 0) +
                value.privateBoxes.reduce((acc, box) => acc + box.schema.measure(box).size, 0),
        );
    }
}

export class DescriptionBox extends Box {
    public static readonly typeCode = 'jumd';
    public static readonly schema = new DescriptionBoxSchema();
    public uuid: Uint8Array = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    public requestable?: boolean;
    public label: string | undefined;
    public id: number | undefined;
    public hash: Uint8Array | undefined;
    public privateBoxes: IBox[] = [];

    constructor() {
        super(DescriptionBox.typeCode, DescriptionBox.schema);
    }

    public parse(buf: Uint8Array) {
        if (buf.length < 17) {
            throw new Error('DescriptionBox: Data too short');
        }

        this.uuid = buf.subarray(0, 16);
        const toggles = buf[16];

        this.requestable = (toggles & 1) === 1;

        buf = buf.subarray(17);

        if ((toggles & 0b10) === 0b10) {
            if (!buf.length) throw new Error('DescriptionBox: Label present but data too short');
            const { string, bytesRead } = BinaryHelper.readNullTerminatedString(buf, 0);
            this.label = string;
            buf = buf.subarray(bytesRead);
        }

        if ((toggles & 0b100) === 0b100) {
            if (buf.length < 4) throw new Error('DescriptionBox: ID present but data too short');
            this.id = BinaryHelper.readUInt32(buf, 0);
            buf = buf.subarray(4);
        }

        if ((toggles & 0b1000) == 0b1000) {
            if (buf.length < 32) throw new Error('DescriptionBox: Signature present but data too short');
            this.hash = buf.subarray(0, 32);
            buf = buf.subarray(32);
        }

        if ((toggles & 0b10000) == 0b10000) {
            if (!buf.length) throw new Error('DescriptionBox: Private field present but data too short');
            while (buf.length > 0) {
                const { box, lBox } = BoxReader.readFromBuffer(buf);
                this.privateBoxes.push(box);
                buf = buf.subarray(lBox);
            }
        }
    }

    public toString(): string {
        const parts: string[] = [`UUID: ${BinaryHelper.toUUIDString(this.uuid)}`];
        if (this.requestable) parts.push(`requestable`);
        if (this.hash) parts.push('with hash');
        if (this.label) parts.push(`label: ${this.label}`);
        return parts.join(', ');
    }
}
