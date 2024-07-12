import { BinaryHelper } from '../util';
import { Box } from './Box';

export class JSONBox extends Box {
    public static readonly typeCode = 'json';
    public content: unknown;

    constructor() {
        super(JSONBox.typeCode);
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
