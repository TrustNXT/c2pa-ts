import { CBORBox, IBox, JSONBox } from '../../jumbf';
import { BinaryHelper } from '../../util';
import { Claim } from '../Claim';
import * as raw from '../rawTypes';
import { MetadataEntry, MetadataNamespace, MetadataValue, ValidationStatusCode } from '../types';
import { ValidationError } from '../ValidationError';
import { Assertion } from './Assertion';

// This assertion implements a very simplistic JSON-LD parser/writer. A proper JSON-LD library
// might be better but also introduces more complexity; for now this seems to do well enough.

type JsonLDItem = MetadataValue | { '@list': JsonLDItem[] } | { '@value': JsonLDItem };

interface JsonLDContext {
    '@context': Record<string, string>;
}
type JsonLDMetadata = JsonLDContext & Record<string, JsonLDItem>;

export class MetadataAssertion extends Assertion {
    /**
     * List of metadata entries. If a namespace is used that's not part of the
     * `MetadataNamespace` enum, it should also be added to `namespaceMappings`. */
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
                ValidationStatusCode.AssertionRequiredMissing,
                this.sourceBox,
                'Metadata assertion has invalid type',
            );
        }

        const content = box.content as JsonLDMetadata;
        const mapToPrimitive = (item: JsonLDItem): MetadataValue => {
            if (typeof item === 'object') {
                if ('@value' in item) return mapToPrimitive(item['@value']);
                if ('@list' in item) return item['@list'].map(mapToPrimitive);
            }
            return item as MetadataValue;
        };

        if (!content['@context'])
            throw new ValidationError(
                ValidationStatusCode.AssertionJSONInvalid,
                this.sourceBox,
                'JSON-LD is missing @context',
            );

        for (const key in content) {
            if (key === '@context') {
                const context = content['@context'];
                for (const prefix in context) {
                    this.namespacePrefixes[context[prefix]] = prefix;
                }
                continue;
            }

            let namespace = '';
            let name = key;

            if (key.includes(':')) {
                const parts = key.split(':', 2);
                const prefix = parts[0];
                name = parts[1];

                namespace = content['@context'][prefix];
                if (!namespace)
                    throw new ValidationError(
                        ValidationStatusCode.AssertionJSONInvalid,
                        this.sourceBox,
                        `Missing @context entry for prefix ${namespace}`,
                    );
            } else {
                const slashIndex = key.lastIndexOf('/');
                if (slashIndex !== -1 && slashIndex < key.length - 1) {
                    namespace = key.substring(0, slashIndex);
                    name = key.substring(slashIndex + 1);
                }
            }

            this.entries.push({
                namespace,
                name,
                value: mapToPrimitive(content[key]),
            });
        }
    }

    public generateJUMBFBoxForContent(claim: Claim): IBox {
        const box = new JSONBox();

        const context: Record<string, string> = {};
        for (const entry of this.entries) {
            const namespace = this.namespacePrefixes[entry.namespace];
            if (!namespace) continue;
            if (namespace in context && context[namespace] !== entry.namespace)
                throw new Error(`Duplicate namespace mapping: ${namespace}`);
            context[namespace] = entry.namespace;
        }

        const mapFromPrimitive = (value: MetadataValue): JsonLDItem => {
            if (Array.isArray(value)) return { '@list': value.map(mapFromPrimitive) };
            return value;
        };
        box.content = {
            '@context': context,
            ...this.entries.reduce(
                (acc, entry) => {
                    const prefix = this.namespacePrefixes[entry.namespace];
                    const value = mapFromPrimitive(entry.value);
                    if (prefix) acc[`${prefix}:${entry.name}`] = value;
                    else acc[`${entry.namespace}/${entry.name}`] = value;
                    return acc;
                },
                {} as Record<string, JsonLDItem>,
            ),
        };

        return box;
    }
}
