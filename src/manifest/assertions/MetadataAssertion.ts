import { CBORBox, IBox, JSONBox } from '../../jumbf';
import { BinaryHelper } from '../../util';
import { Claim } from '../Claim';
import * as raw from '../rawTypes';
import { MetadataEntry, MetadataNamespace, MetadataValue, ValidationStatusCode } from '../types';
import { ValidationError } from '../ValidationError';
import { Assertion } from './Assertion';
import { AssertionLabels } from './AssertionLabels';

type JsonLDItem =
    | string
    | number
    | JsonLDItem[]
    | { '@list': JsonLDItem[] }
    | { '@value': JsonLDItem }
    | { [key: string]: JsonLDItem };

interface JsonLDContext {
    '@context': Record<string, string>;
}
type JsonLDMetadata = JsonLDContext & Record<string, JsonLDItem>;

/**
 * JSON-LD based metadata assertion.
 *
 * This assertion implements a very simplistic JSON-LD parser/writer. A proper JSON-LD library
 * might be better but also introduces more complexity; for now this seems to do well enough.
 */
export class MetadataAssertion extends Assertion {
    public label = AssertionLabels.metadata;
    public uuid = raw.UUIDs.jsonAssertion;

    /**
     * List of metadata entries. If a namespace is used that's not part of the
     * `MetadataNamespace` enum, it should also be added to `namespaceMappings`.
     */
    public entries: MetadataEntry[] = [];

    /**
     * Mapping of namespaces to their abbreviated prefix for JSON-LD use.
     * Pre-populated with recommended values but can be changed as needed.
     */
    public namespacePrefixes: Record<MetadataNamespace | string, string> = {
        [MetadataNamespace.CameraRaw]: 'cameraRaw',
        [MetadataNamespace.DublinCore]: 'dc',
        [MetadataNamespace.Exif]: 'exif',
        [MetadataNamespace.ExifEx_1_0]: 'exifEX',
        [MetadataNamespace.ExifEx_2_32]: 'exifEX',
        [MetadataNamespace.IPTCCore]: 'iptc',
        [MetadataNamespace.IPTCExtension]: 'iptcEX',
        [MetadataNamespace.PDF]: 'pdf',
        [MetadataNamespace.PLUS]: 'plus',
        [MetadataNamespace.Photoshop]: 'photoshop',
        [MetadataNamespace.TIFF]: 'tiff',
        [MetadataNamespace.XMPBasic]: 'xmp',
        [MetadataNamespace.XMPDynamicMedia]: 'xmpDM',
        [MetadataNamespace.XMPMediaManagement]: 'xmpMM',
        [MetadataNamespace.XMPPagedText]: 'xmpPT',
    };

    public readContentFromJUMBF(box: IBox, claim: Claim): void {
        if (
            !this.uuid ||
            // Earlier versions of the specification didn't explicitly specify a JSON box so the JSON-LD
            // could actually be serialized into a CBOR box
            !(
                (BinaryHelper.bufEqual(this.uuid, raw.UUIDs.jsonAssertion) && box instanceof JSONBox) ||
                (BinaryHelper.bufEqual(this.uuid, raw.UUIDs.cborAssertion) && box instanceof CBORBox)
            )
        ) {
            throw new ValidationError(
                ValidationStatusCode.AssertionMissing,
                this.sourceBox,
                'Metadata assertion has invalid type',
            );
        }

        const content = box.content as JsonLDMetadata;

        const context = content['@context'];
        if (!context)
            throw new ValidationError(
                ValidationStatusCode.AssertionJSONInvalid,
                this.sourceBox,
                'JSON-LD is missing @context',
            );

        for (const prefix in context) {
            this.namespacePrefixes[context[prefix]] = prefix;
        }

        const splitKey = (key: string) => {
            let namespace = '';
            let name = key;

            if (key.includes(':')) {
                const parts = key.split(':', 2);
                const prefix = parts[0];
                name = parts[1];

                namespace = content['@context'][prefix];
                // If prefix is not in @context, use it as the namespace directly
                // This allows handling of non-standard metadata keys like "QuickTime:Duration"
                if (!namespace) {
                    namespace = prefix;
                }
            } else {
                const slashIndex = key.lastIndexOf('/');
                if (slashIndex !== -1 && slashIndex < key.length - 1) {
                    namespace = key.substring(0, slashIndex);
                    name = key.substring(slashIndex + 1);
                }
            }

            return { namespace, name };
        };

        const mapValue = (item: JsonLDItem, expectedNamespace: string): MetadataValue => {
            if (typeof item === 'object' && !Array.isArray(item)) {
                // Turn @value into just the value
                if ('@value' in item) return mapValue(item['@value'], expectedNamespace);

                // Turn @list into array
                if ('@list' in item)
                    return (item['@list'] as JsonLDItem[]).map(val => mapValue(val, expectedNamespace));

                // Map subobjects, removing namespace prefix
                const obj = item as Record<string, JsonLDItem>;
                const retObj: Record<string, MetadataValue> = {};
                for (const key in obj) {
                    if (key.startsWith('@')) continue;

                    const { namespace, name } = splitKey(key);
                    if (namespace !== expectedNamespace)
                        throw new ValidationError(
                            ValidationStatusCode.AssertionJSONInvalid,
                            this.sourceBox,
                            'Subobject contains key from different namespace',
                        );

                    retObj[name] = mapValue(obj[key], expectedNamespace);
                }
                return retObj;
            }
            return item as MetadataValue;
        };

        for (const key in content) {
            if (key === '@context') continue;

            const { namespace, name } = splitKey(key);

            this.entries.push({
                namespace,
                name,
                value: mapValue(content[key], namespace),
            });
        }
    }

    public generateJUMBFBoxForContent(): IBox {
        const box = new JSONBox();

        const context: Record<string, string> = {};
        for (const entry of this.entries) {
            const namespace = this.namespacePrefixes[entry.namespace];
            if (!namespace) continue;
            if (namespace in context && context[namespace] !== entry.namespace)
                throw new Error(`Duplicate namespace mapping: ${namespace}`);
            context[namespace] = entry.namespace;
        }

        const buildKey = (namespace: string, name: string) => {
            const prefix = this.namespacePrefixes[namespace];
            if (prefix) return `${prefix}:${name}`;
            return `${namespace}/${name}`;
        };

        const mapValue = (value: MetadataValue, namespace: string): JsonLDItem => {
            // Turn array into @list
            if (Array.isArray(value)) return { '@list': value.map(val => mapValue(val, namespace)) };

            // Map subojects, prepending the namespace prefix to keys
            if (typeof value === 'object') {
                const obj: Record<string, JsonLDItem> = {};
                for (const key in value) obj[buildKey(namespace, key)] = mapValue(value[key], namespace);
                return obj;
            }
            return value;
        };

        box.content = {
            '@context': context,
            ...this.entries.reduce(
                (acc, entry) => {
                    acc[buildKey(entry.namespace, entry.name)] = mapValue(entry.value, entry.namespace);
                    return acc;
                },
                {} as Record<string, JsonLDItem>,
            ),
        };

        return box;
    }
}
