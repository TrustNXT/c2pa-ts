import * as bin from 'typed-binary';
import { IBox } from './IBox';
import * as schemata from './schemata';

/**
 * Intermediate abstract class for JUMBF box schemata
 *
 * In order to implement a schema for a concrete box, implement
 * the three abstract methods. Their implementations should follow
 * the expected code for a `bin.ISchema<T>`. The only difference
 * is when reading, wher the length and type are supplied as
 * additional parameters.
 */
export abstract class BoxSchema<TBox extends IBox> extends bin.Schema<TBox> {
    readonly length = schemata.length;
    readonly type = schemata.type;

    public read(input: bin.ISerialInput): bin.Parsed<TBox> {
        const length = this.length.read(input);
        const type = this.type.read(input);
        return this.readContent(input, type, length);
    }

    public write(output: bin.ISerialOutput, value: bin.Parsed<TBox>): void {
        const length = this.measure(value).size;
        this.length.write(output, length);
        this.type.write(output, value.type);
        this.writeContent(output, value);
    }

    public measure(
        value: bin.Parsed<TBox> | bin.MaxValue,
        measurer: bin.IMeasurer = new bin.Measurer(),
    ): bin.IMeasurer {
        return this.measureContent(value, measurer).add(
            4 + // length
                4, // type
        );
    }

    abstract readContent(input: bin.ISerialInput, type: string, length: number): bin.Parsed<TBox>;
    abstract writeContent(output: bin.ISerialOutput, value: bin.Parsed<TBox>): void;
    abstract measureContent(value: bin.Parsed<TBox> | bin.MaxValue, measurer: bin.IMeasurer): bin.IMeasurer;
}
