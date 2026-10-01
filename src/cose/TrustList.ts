import { X509Certificate } from '@peculiar/x509';
import { BinaryHelper } from '../util';

export class TrustList {
    private static readonly PEM_CACHE_LIMIT = 8;

    // Parsed certificates are immutable, so results can be cached by PEM content (least recently used, bounded).
    private static readonly pemCache = new Map<string, X509Certificate[]>();

    /**
     * @deprecated Global mutable trust anchors cause race conditions and test flakiness.
     * Use ValidationOptions.trustAnchors parameter in Signature.validate() instead.
     * This property is maintained for backwards compatibility only.
     */
    static trustAnchors: X509Certificate[] = [];

    /**
     * @deprecated Global mutable timestamp trust anchors cause race conditions and test flakiness.
     * Use ValidationOptions.timestampTrustAnchors parameter in Signature.validate() instead.
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
     * @throws Error if the input contains data but none of it could be parsed as a certificate.
     * Individual malformed entries are skipped as long as at least one certificate could be parsed.
     */
    public static parseTrustAnchors(anchors: (string | Uint8Array | X509Certificate)[] = []): X509Certificate[] {
        const out: X509Certificate[] = [];
        let hasContent = false;
        for (const a of anchors) {
            if (typeof a === 'string') {
                hasContent ||= a.trim().length > 0;
                out.push(...this.parsePEM(a));
            } else if (a instanceof Uint8Array) {
                hasContent ||= a.length > 0;
                try {
                    out.push(new X509Certificate(a as unknown as Uint8Array<ArrayBuffer>));
                } catch {
                    /* ignore malformed entries */
                }
            } else if (a instanceof X509Certificate) {
                hasContent = true;
                out.push(a);
            }
        }

        if (hasContent && out.length === 0) {
            throw new Error('None of the provided trust anchors could be parsed as an X.509 certificate');
        }

        return out;
    }

    private static parsePEM(pem: string): X509Certificate[] {
        let certificates = TrustList.pemCache.get(pem);
        if (certificates) {
            // Refresh recency
            TrustList.pemCache.delete(pem);
        } else {
            certificates = [];
            for (const der of this.decodeAllPEMCertificates(pem)) {
                try {
                    // Cast to satisfy peculiar/x509 typing expecting ArrayBuffer
                    certificates.push(new X509Certificate(der as unknown as Uint8Array<ArrayBuffer>));
                } catch {
                    /* ignore malformed entries */
                }
            }
        }
        TrustList.pemCache.set(pem, certificates);
        if (TrustList.pemCache.size > TrustList.PEM_CACHE_LIMIT) {
            TrustList.pemCache.delete(TrustList.pemCache.keys().next().value!);
        }
        return certificates;
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
                out.push(BinaryHelper.base64ToBytes(base64));
            } catch {
                /* ignore invalid blocks */
            }
        }
        return out;
    }
}
