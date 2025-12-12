import * as bin from 'typed-binary';
import { BinaryHelper } from '../util';
import { Box } from './Box';
import { BoxSchema } from './BoxSchema';
import { DescriptionBox } from './DescriptionBox';
import { GenericBoxSchema } from './GenericBoxSchema';
import { IBox } from './IBox';

class SuperBoxSchema extends BoxSchema<SuperBox> {
    // Note: This doesn't work due to a circular import.
    // readonly contentBoxes = new GenericBoxSchema();

    readContent(input: bin.ISerialInput, type: string, length: number): SuperBox {
        if (type != SuperBox.typeCode) throw new Error(`SuperBox: Unexpected type ${type}`);

        const box = new SuperBox();

        // read raw content excluding (length, type) header
        const rawContentSchema = bin.u8Array(length - 8);
        box.rawContent = rawContentSchema.read(input);
        input.skipBytes(-(length - 8));

        const end = input.currentByteOffset + length - 8;
        const nestedBoxSchema = new GenericBoxSchema();
        while (input.currentByteOffset < end) {
            const nestedBox = nestedBoxSchema.read(input);
            if (nestedBox instanceof DescriptionBox) {
                box.descriptionBox = nestedBox;
            } else {
                box.contentBoxes.push(nestedBox);
            }
        }
        if (input.currentByteOffset > end)
            throw new Error(
                `SuperBox: Private field data exceeded box length by ${input.currentByteOffset - end} bytes`,
            );

        if (!box.descriptionBox) throw new Error('SuperBox: Missing description box');

        return box;
    }

    writeContent(output: bin.ISerialOutput, value: SuperBox): void {
        if (!value.descriptionBox) throw new Error('SuperBox: Missing description box');

        value.descriptionBox.schema.write(output, value.descriptionBox);
        value.contentBoxes.forEach(box => {
            box.schema.write(output, box);
        });
    }

    measureContent(value: SuperBox, measurer: bin.IMeasurer): bin.IMeasurer {
        if (!value.descriptionBox) throw new Error('SuperBox: Missing description box');

        return measurer.add(
            value.descriptionBox.schema.measure(value.descriptionBox).size + // description box
                value.contentBoxes.reduce((acc, box) => acc + box.schema.measure(box).size, 0),
        );
    }
}

export class SuperBox extends Box {
    public static readonly typeCode = 'jumb';
    public static readonly schema = new SuperBoxSchema();
    public descriptionBox?: DescriptionBox;
    public contentBoxes: IBox[] = [];
    public rawContent: Uint8Array | undefined;
    public uri: string | undefined;

    constructor() {
        super(SuperBox.typeCode, SuperBox.schema);
    }

    public static fromBuffer(buf: Uint8Array): SuperBox {
        const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buf), { endianness: 'big' });
        const box = SuperBox.schema.read(reader);

        const rootURI = 'self#jumbf=';

        // set URI fields on this and nested boxes
        SuperBox.applyURI(box, rootURI);

        return box;
    }

    private static applyURI(box: SuperBox, uri: string) {
        if (box.descriptionBox!.label) {
            box.uri = `${uri}/${box.descriptionBox!.label}`;
        }
        box.contentBoxes.forEach(subBox => {
            if (subBox instanceof SuperBox) SuperBox.applyURI(subBox, box.uri!);
        });
    }

    public toBuffer(skipHeader = true): Uint8Array {
        const buffer = new Uint8Array(this.measureSize());
        const writer = new bin.BufferWriter(buffer.buffer, { endianness: 'big' });
        this.schema.write(writer, this);

        this.rawContent = buffer.subarray(8);
        return skipHeader ? this.rawContent : buffer;
    }

    public measureSize(): number {
        return this.schema.measure(this).size;
    }

    public toString(prefix?: string) {
        let str = `${prefix ?? ''}Superbox ${this.uri ?? ''}`;
        const subPrefix = (prefix ?? '') + '  ';
        if (this.descriptionBox) {
            str += `\n${subPrefix}Description: ${this.descriptionBox.toString()}`;
            if (this.descriptionBox.privateBoxes.length) {
                str += `\n${subPrefix}Private boxes:`;
                for (const box of this.descriptionBox.privateBoxes) {
                    str += '\n' + box.toString(subPrefix + '  ');
                }
            }
        }
        for (const box of this.contentBoxes) {
            str += '\n' + box.toString(subPrefix);
        }
        return str;
    }

    public getByPath(path: string): SuperBox | undefined {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        let node: SuperBox = this;
        for (const part of path.split('/')) {
            const subNode = node.contentBoxes.find(
                box => box instanceof SuperBox && box.descriptionBox?.label === part,
            );
            if (!subNode) return undefined;
            node = subNode as SuperBox;
        }
        return node;
    }

    public getByUUID(uuid: Uint8Array): SuperBox[] {
        return this.contentBoxes
            .filter((box): box is SuperBox => box instanceof SuperBox)
            .filter(box => box.descriptionBox && BinaryHelper.bufEqual(box.descriptionBox.uuid, uuid));
    }
}
