import { Box } from './Box';

export class CodestreamBox extends Box {
    public static readonly typeCode = 'jp2c';
    public content?: Uint8Array;

    constructor() {
        super(CodestreamBox.typeCode);
    }

    public parse(buf: Uint8Array) {
        this.content = buf;
    }

    public toString(prefix?: string | undefined): string {
        return `${prefix ?? ''}Codestream content (length ${this.content?.length ?? 0})`;
    }
}
