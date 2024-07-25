import { BinaryHelper } from '../util';
import { Box } from './Box';
import { BoxReader } from './BoxReader';
import { DescriptionBox } from './DescriptionBox';
import { IBox } from './IBox';

export class SuperBox extends Box {
    public static readonly typeCode = 'jumb';
    public descriptionBox?: DescriptionBox;
    public contentBoxes: IBox[] = [];
    public rawContent: Uint8Array | undefined;
    public uri: string | undefined;

    constructor() {
        super(SuperBox.typeCode);
    }

    public static fromBuffer(buf: Uint8Array): SuperBox {
        const box = BoxReader.readFromBuffer(buf, 'self#jumbf=').box;
        if (!(box instanceof SuperBox)) throw new Error('Outer box is not a JUMBF super box');
        return box;
    }

    public parse(buf: Uint8Array, uriPrefix?: string) {
        this.rawContent = buf;

        while (buf.length > 0) {
            const { box, lBox } = BoxReader.readFromBuffer(buf, this.uri);
            if (box instanceof DescriptionBox) {
                this.descriptionBox = box;
                if (uriPrefix && this.descriptionBox.label) this.uri = uriPrefix + '/' + this.descriptionBox.label;
            } else {
                this.contentBoxes.push(box);
            }
            buf = buf.subarray(lBox);
        }

        if (!this.descriptionBox) throw new Error('Super box is missing description box');
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
