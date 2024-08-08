// collection of schemata for serialization of JUMBF boxes

import * as bin from 'typed-binary';
import { Box } from './Box';

// length field of a box
export const length = bin.u32;

// type code schema
//
// The JUMBF type code is a 4-byte string representing the type of a box.
// It is used to identify the type of data being serialized.
class JUMBFTypeCodeSchema extends bin.Schema<string> {
    read(input: bin.ISerialInput): string {
        return String.fromCharCode(input.readByte(), input.readByte(), input.readByte(), input.readByte());
    }

    write(output: bin.ISerialOutput, value: string): void {
        if (value.length != 4) throw new Error('JUMBFTypeCode: Invalid length');
        [0, 1, 2, 3].forEach(i => {
            output.writeByte(value.charCodeAt(i));
        });
    }

    measure(_: string, measurer: bin.IMeasurer = new bin.Measurer()): bin.IMeasurer {
        // The size of the data serialized by this schema
        // doesn't depend on the actual value. It's always 4 bytes.
        return measurer.add(4);
    }
}
export const type = new JUMBFTypeCodeSchema();

// type field for UUIDs
class JUMBFUUIDSchema extends bin.Schema<Uint8Array> {
    read(input: bin.ISerialInput): Uint8Array {
        const uuid = [];
        for (let i = 0; i != 16; i++) {
            uuid.push(input.readByte());
        }
        return new Uint8Array(uuid);
    }

    write(output: bin.ISerialOutput, value: Uint8Array): void {
        if (value.length != 16) throw new Error('JUMBFUUID: Invalid length');
        value.forEach(byte => output.writeByte(byte));
    }

    measure(_: Uint8Array, measurer: bin.IMeasurer = new bin.Measurer()): bin.IMeasurer {
        // The size of the data serialized by this schema
        // doesn't depend on the actual value. It's always 16 bytes.
        return measurer.add(16);
    }
}
export const uuid = new JUMBFUUIDSchema();

// fallback schema
//
// This schema only reads length and type but skips over the actual data.
// TODO: Either implement this (i.e. by storing the data) or remove it
// and treat unknown types as error.
class FallbackBoxSchema extends bin.Schema<Box> {
    readonly length = length;
    readonly type = type;

    read(input: bin.ISerialInput): Box {
        // read the length and type, but just skip over the remaining data
        const length = this.length.read(input);
        const type = this.type.read(input);
        input.skipBytes(length - 8);

        return new Box(type, this);
    }

    write(output: bin.ISerialOutput, value: Box): void {
        // not implemented:
        // - We could (since we know the length), read and store the
        //   data as raw bytes, even without knowing their structure.
        // - However, while reading and ignoring unknown data is okay,
        //   writing it is more problematic.
        // Since the possible use cases are unclear, this isn't
        // implemented at the moment.
        throw new Error('Method not implemented.');
    }

    measure(value: Box, measurer: bin.IMeasurer = new bin.Measurer()): bin.IMeasurer {
        throw new Error('Method not implemented.');
    }
}
export const fallback = new FallbackBoxSchema();
