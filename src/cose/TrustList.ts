import { X509Certificate } from '@peculiar/x509';

export class TrustList {
    /**
     * @deprecated Global mutable trust anchors cause race conditions and test flakiness.
     * Use ValidationOptions.trustAnchors parameter in Signature.validate() instead.
     * This property is maintained for backwards compatibility only.
     */
    static trustAnchors: X509Certificate[] = [];

    /**
     * @deprecated Global mutable timestamp trust anchors cause race conditions and test flakiness.
     * Use ValidationOptions.tsaTrustAnchors parameter in Signature.validate() instead.
     * This property is maintained for backwards compatibility only.
     */
    static timestampTrustAnchors: X509Certificate[] = [];

    /**
     * @deprecated Global mutable trust anchors cause race conditions and test flakiness.
     * Use ValidationOptions.trustAnchors parameter in Signature.validate() instead.
     * This method is maintained for backwards compatibility only.
     *
     * Configures global trust anchors used for PKI.js chain validation.
     * Accepts PEM strings (single or multiple concatenated certs), DER bytes, or `X509Certificate` instances.
     */
    public static setTrustAnchors(anchors: (string | Uint8Array | X509Certificate)[]): void {
        TrustList.trustAnchors = TrustList.parseTrustAnchors(anchors);
    }

    /**
     * @deprecated Global mutable timestamp trust anchors cause race conditions and test flakiness.
     * Use ValidationOptions.timestampTrustAnchors parameter in Signature.validate() instead.
     * This method is maintained for backwards compatibility only.
     *
     * Configures global timestamp trust anchors used for PKI.js chain validation.
     * Accepts PEM strings (single or multiple concatenated certs), DER bytes, or `X509Certificate` instances.
     */
    public static setTimestampTrustAnchors(anchors: (string | Uint8Array | X509Certificate)[]): void {
        TrustList.timestampTrustAnchors = TrustList.parseTrustAnchors(anchors);
    }

    /**
     * Parses trust anchors from various formats into X509Certificate instances.
     * Accepts PEM strings (single or multiple concatenated certs), DER bytes, or `X509Certificate` instances.
     * @param anchors - Array of trust anchors in various formats
     * @returns Array of parsed X509Certificate instances
     */
    public static parseTrustAnchors(anchors: (string | Uint8Array | X509Certificate)[] = []): X509Certificate[] {
        const out: X509Certificate[] = [];
        for (const a of anchors) {
            if (typeof a === 'string') {
                for (const der of this.decodeAllPEMCertificates(a)) {
                    try {
                        // Cast to satisfy peculiar/x509 typing expecting ArrayBuffer
                        out.push(new X509Certificate(der as unknown as Uint8Array<ArrayBuffer>));
                    } catch {
                        /* ignore malformed entries */
                    }
                }
            } else if (a instanceof Uint8Array) {
                try {
                    out.push(new X509Certificate(a as unknown as Uint8Array<ArrayBuffer>));
                } catch {
                    /* ignore malformed entries */
                }
            } else if (a instanceof X509Certificate) {
                out.push(a);
            }
        }

        return out;
    }

    /**
     * Decodes all PEM `CERTIFICATE` sections from a string into DER bytes.
     */
    private static decodeAllPEMCertificates(pem: string): Uint8Array[] {
        const pattern = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g;
        const out: Uint8Array[] = [];
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(pem)) !== null) {
            const base64 = match[1].replace(/\r?\n|\s/g, '');
            try {
                out.push(this.base64ToBytes(base64));
            } catch {
                /* ignore invalid blocks */
            }
        }
        return out;
    }

    private static base64ToBytes(base64: string): Uint8Array {
        const fromBase64 = (
            Uint8Array as unknown as {
                fromBase64?: (input: string) => Uint8Array;
            }
        ).fromBase64;
        if (typeof fromBase64 === 'function') {
            return fromBase64(base64);
        }

        interface GlobalWithBuffer {
            Buffer?: {
                from: (input: string, encoding: 'base64') => Uint8Array;
            };
        }
        const bufferCtor = (globalThis as GlobalWithBuffer).Buffer;
        if (bufferCtor?.from) {
            return new Uint8Array(bufferCtor.from(base64, 'base64'));
        }

        if (typeof globalThis.atob === 'function') {
            const binary = globalThis.atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        }

        throw new Error('No base64 decoder available in this runtime');
    }
}
