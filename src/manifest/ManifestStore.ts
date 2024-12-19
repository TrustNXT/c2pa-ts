import { X509Certificate } from '@peculiar/x509';
import { Asset } from '../asset';
import { CoseAlgorithmIdentifier } from '../cose';
import { HashAlgorithm } from '../crypto';
import * as JUMBF from '../jumbf';
import { BinaryHelper } from '../util';
import { AssertionStore } from './AssertionStore';
import { Manifest } from './Manifest';
import * as raw from './rawTypes';
import { ClaimVersion, ValidationStatusCode } from './types';
import { ValidationError } from './ValidationError';
import { ValidationResult } from './ValidationResult';

export class ManifestStore {
    public readonly manifests: Manifest[] = [];
    public sourceBox: JUMBF.SuperBox | undefined;

    /**
     * Appends a new manifest containing a claim, an assertion store, and a signature holder
     */
    public createManifest(options: {
        claimVersion?: ClaimVersion;
        assetFormat: string;
        instanceID: string;
        defaultHashAlgorithm?: HashAlgorithm;
        certificate: X509Certificate;
        signingAlgorithm: CoseAlgorithmIdentifier;
        chainCertificates?: X509Certificate[];
    }): Manifest {
        const manifest = new Manifest(this);
        manifest.assertions = new AssertionStore();
        this.manifests.push(manifest);

        manifest.initialize(
            options.claimVersion ?? ClaimVersion.V1,
            options.assetFormat,
            options.instanceID,
            options.defaultHashAlgorithm,
            options.certificate,
            options.signingAlgorithm,
            options.chainCertificates,
        );

        return manifest;
    }

    /**
     * Calculates the size (in bytes) of the serialized manifest store
     */
    public measureSize(): number {
        return this.generateJUMBFBox().measureSize();
    }

    /**
     * Serializes the manifest store into a buffer
     */
    public getBytes(): Uint8Array {
        return this.generateJUMBFBox().toBuffer(false);
    }

    /**
     * Retrieves the active manifest (the last one in the store)
     */
    public getActiveManifest(): Manifest | undefined {
        return this.manifests.length ? this.manifests[this.manifests.length - 1] : undefined;
    }

    /**
     * Retrieves a manifest by its label
     * @param label
     */
    public getManifestByLabel(label: string): Manifest | undefined {
        for (let i = this.manifests.length - 1; i >= 0; i--) {
            if (this.manifests[i].label === label) return this.manifests[i];
        }
    }

    /**
     * Retrieves manifests by instance ID
     * @param instanceId
     */
    public getManifestsByInstanceId(instanceId?: string): Manifest[] {
        if (!instanceId) return [];
        return this.manifests.filter(m => m.claim?.instanceID === instanceId);
    }

    /**
     * Reads a manifest store from a JUMBF structure
     * @param superBox The outer JUMBF super box
     */
    public static read(superBox: JUMBF.SuperBox): ManifestStore {
        const manifestStore = new ManifestStore();
        manifestStore.sourceBox = superBox;

        if (!superBox.descriptionBox || !BinaryHelper.bufEqual(superBox.descriptionBox.uuid, raw.UUIDs.manifestStore))
            throw new ValidationError(
                ValidationStatusCode.ManifestUnreferenced,
                superBox,
                'Manifest store has wrong UUID',
            );
        if (!superBox.descriptionBox.label)
            throw new ValidationError(
                ValidationStatusCode.ManifestUnreferenced,
                superBox,
                'Manifest store box is missing the label',
            );

        superBox.contentBoxes
            .filter((box): box is JUMBF.SuperBox => box instanceof JUMBF.SuperBox)
            .forEach(box => {
                const manifest = Manifest.read(box, manifestStore);
                if (!manifest) return;
                manifestStore.manifests.push(manifest);
            });

        try {
            manifestStore.verifyUniqueLabels();
        } catch (err) {
            if (err instanceof ValidationError) throw err;
            const message = err instanceof Error ? err.message : String(err);
            throw new ValidationError(ValidationStatusCode.ManifestUnreferenced, superBox, message);
        }

        return manifestStore;
    }

    public generateJUMBFBox(): JUMBF.SuperBox {
        this.verifyUniqueLabels();

        const box = new JUMBF.SuperBox();
        box.descriptionBox = new JUMBF.DescriptionBox();
        box.descriptionBox.uuid = raw.UUIDs.manifestStore;
        box.descriptionBox.label = 'c2pa';
        box.contentBoxes = this.manifests.map(manifest => manifest.generateJUMBFBox());

        this.sourceBox = box;
        return box;
    }

    /**
     * Validates the active manifest
     * @param asset Asset for validation of bindings
     */
    public async validate(asset: Asset): Promise<ValidationResult> {
        const activeManifest = this.getActiveManifest();
        if (activeManifest) {
            return activeManifest.validate(asset);
        } else {
            return ValidationResult.error(ValidationStatusCode.ClaimCBORInvalid, this.sourceBox);
        }
    }

    /**
     * verify that all manifest labels are set and unique
     */
    private verifyUniqueLabels(): void {
        this.manifests
            .map(manifest => manifest.label)
            .reduce((labels, label, index) => {
                if (!label) throw new Error(`No label in manifest ${index}`);
                if (labels.has(label)) throw new Error(`Duplicate label ${label} in manifest ${index}`);
                return labels.add(label);
            }, new Set<string>());
    }
}
