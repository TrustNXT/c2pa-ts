import * as bin from 'typed-binary';
import { C2PASaltBox } from './C2PASaltBox';
import { CBORBox } from './CBORBox';
import { CodestreamBox } from './CodestreamBox';
import { DescriptionBox } from './DescriptionBox';
import { EmbeddedFileBox } from './EmbeddedFileBox';
import { EmbeddedFileDescriptionBox } from './EmbeddedFileDescriptionBox';
import { IBox } from './IBox';
import { JSONBox } from './JSONBox';
import * as schemata from './schemata';
import { SuperBox } from './SuperBox';
import { UUIDBox } from './UUIDBox';

// generic box schema
//
// This generic schema delegates to the appropriate specific schema.
// For that, it either looks at the input stream or simply uses the
// given box's schema.
export class GenericBoxSchema extends bin.Schema<IBox> {
    readonly length = schemata.length;
    readonly type = schemata.type;

    read(input: bin.ISerialInput): IBox {
        // Read the header (length and type) and then rewind to the
        // previous position. This is a bit ugly, because we read some
        // data twice, but unavoidable. Also, it allows us to handle
        // unknown box types, even though we don't do that currently.
        const length = this.length.read(input);
        // There are special (low) values for length but we don't support them
        if (length < 8) {
            throw new Error(`JUMBFGenericBox: Invalid box length ${length}`);
        }
        const type = this.type.read(input);
        input.skipBytes(-8);

        const schema = GenericBoxSchema.getSchema(type);
        return schema.read(input);
    }

    write(output: bin.ISerialOutput, value: IBox): void {
        // delegate to the box's schema
        return value.schema.write(output, value);
    }

    measure(value: IBox, measurer: bin.IMeasurer = new bin.Measurer()): bin.IMeasurer {
        // delegate to the box's schema
        return value.schema.measure(value, measurer);
    }

    private static getSchema(type: string): bin.Schema<IBox> {
        switch (type) {
            case C2PASaltBox.typeCode:
                return C2PASaltBox.schema;
            case CBORBox.typeCode:
                return CBORBox.schema;
            case CodestreamBox.typeCode:
                return CodestreamBox.schema;
            case DescriptionBox.typeCode:
                return DescriptionBox.schema;
            case EmbeddedFileBox.typeCode:
                return EmbeddedFileBox.schema;
            case EmbeddedFileDescriptionBox.typeCode:
                return EmbeddedFileDescriptionBox.schema;
            case JSONBox.typeCode:
                return JSONBox.schema;
            case SuperBox.typeCode:
                return SuperBox.schema;
            case UUIDBox.typeCode:
                return UUIDBox.schema;
            default:
                return schemata.fallback;
        }
    }
}
