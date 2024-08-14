import * as bin from 'typed-binary';
import { Box } from './Box';
import { BoxSchema } from './BoxSchema';
import * as schemata from './schemata';

class JSONBoxSchema extends BoxSchema<JSONBox> {
    readonly length = schemata.length;
    readonly type = schemata.type;

    readContent(input: bin.ISerialInput, type: string, length: number): JSONBox {
        if (type != JSONBox.typeCode) throw new Error(`JSONBox: Unexpected type ${type}`);

        const payloadLength = length - 8;
        const jsonBuffer = new Uint8Array(payloadLength);
        for (let i = 0; i < payloadLength; i++) {
            jsonBuffer[i] = input.readByte();
        }
        const json = new TextDecoder().decode(jsonBuffer);

        const box = new JSONBox();
        try {
            box.content = json == '' ? undefined : JSON.parse(json);
        } catch {
            // TODO This needs to be properly reported as a validation error
            throw new Error('JSONBox: Invalid JSON data');
        }

        return box;
    }

    private encodeContent(value: JSONBox): Uint8Array {
        if (!value.content) return new Uint8Array(0);
        return new TextEncoder().encode(JSON.stringify(value.content));
    }

    writeContent(output: bin.ISerialOutput, value: JSONBox): void {
        const jsonBuffer = this.encodeContent(value);
        for (let i = 0; i != jsonBuffer.length; i++) output.writeByte(jsonBuffer[i]);
    }

    measureContent(value: JSONBox, measurer: bin.IMeasurer): bin.IMeasurer {
        // We need to do the entire encoding twice (once to measure, once to write) which is
        // not ideal but unavoidable without rather complicated caching and the resulting
        // invalidation handling.
        return measurer.add(this.encodeContent(value).length);
    }
}

export class JSONBox extends Box {
    public static readonly typeCode = 'json';
    public static readonly schema = new JSONBoxSchema();
    public content: unknown;

    constructor() {
        super(JSONBox.typeCode, JSONBox.schema);
    }

    public toString(prefix?: string): string {
        if (this.content === undefined) return (prefix ?? '') + 'JSON content (empty)';

        try {
            const s = JSON.stringify(this.content, (key: string, value) => {
                if (value instanceof Uint8Array) {
                    // represent as JSON array, not as JSON object
                    return [...value];
                }
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                return value;
            });
            return (prefix ?? '') + 'JSON content ' + s;
        } catch {
            return (prefix ?? '') + 'JSON content (unserializable)';
        }
    }
}
