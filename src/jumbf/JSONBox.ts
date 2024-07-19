import * as bin from 'typed-binary';
import { BinaryHelper } from '../util';
import { Box } from './Box';
import { BoxSchema } from './BoxSchema';
import * as schemata from './schemata';

// TODO: JSON is UTF-8, but we're reading bytes as if they were codepoints here
class JSONBoxSchema extends BoxSchema<JSONBox> {
    readonly length = schemata.length;
    readonly type = schemata.type;

    readContent(input: bin.ISerialInput, type: string, length: number): JSONBox {
        if (type != JSONBox.typeCode) throw new Error(`JSONBox: Unexpected type ${type}`);

        let json = '';
        for (let i = 0; i < length - 8; i++) {
            json += String.fromCharCode(input.readByte());
        }

        const box = new JSONBox();
        try {
            box.content = json == '' ? undefined : JSON.parse(json);
        } catch {
            // TODO This needs to be properly reported as a validation error
            throw new Error('JSONBox: Invalid JSON data');
        }

        return box;
    }

    writeContent(output: bin.ISerialOutput, value: JSONBox): void {
        const json = value.content === undefined ? '' : JSON.stringify(value.content);

        for (let i = 0; i != json.length; i++) output.writeByte(json.charCodeAt(i));
    }

    measureContent(value: JSONBox, measurer: bin.IMeasurer): bin.IMeasurer {
        const json = value.content === undefined ? '' : JSON.stringify(value.content);

        return measurer.add(json.length);
    }
}

export class JSONBox extends Box {
    public static readonly typeCode = 'json';
    public static readonly schema = new JSONBoxSchema();
    public content: unknown;

    constructor() {
        super(JSONBox.typeCode, JSONBox.schema);
    }

    public parse(buf: Uint8Array) {
        try {
            this.content = JSON.parse(BinaryHelper.readString(buf, 0, buf.length));
        } catch {
            // TODO This needs to be properly reported as a validation error
            throw new Error('JSONBox: Invalid JSON data');
        }
    }

    public toString(prefix?: string): string {
        return (prefix ?? '') + 'JSON content';
    }
}
