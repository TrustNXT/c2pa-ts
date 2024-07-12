import { Box } from './Box';

export class EmbeddedFileBox extends Box {
    public static readonly typeCode = 'bidb';
    public content?: Uint8Array;

    constructor() {
        super(EmbeddedFileBox.typeCode);
    }

    public parse(buf: Uint8Array) {
        this.content = buf;
    }

    public toString(prefix?: string | undefined): string {
        return `${prefix ?? ''}Embedded file content (length ${this.content?.length ?? 0})`;
    }
}
