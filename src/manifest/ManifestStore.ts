import { Asset } from '../asset';
import * as JUMBF from '../jumbf';
import { BinaryHelper } from '../util';
import { Manifest } from './Manifest';
import * as raw from './rawTypes';
import { ValidationStatusCode } from './types';
import { ValidationError } from './ValidationError';
import { ValidationResult } from './ValidationResult';

export class ManifestStore {
    public readonly manifests: Manifest[] = [];
    public sourceBox: JUMBF.SuperBox | undefined;

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
     * Reads a manifest store from a JUMBF structure
     * @param superBox The outer JUMBF super box
     */
    public static read(superBox: JUMBF.SuperBox): ManifestStore {
        const manifestStore = new ManifestStore();
        manifestStore.sourceBox = superBox;

        if (!superBox.descriptionBox || !BinaryHelper.bufEqual(superBox.descriptionBox.uuid, raw.UUIDs.manifestStore))
            throw new ValidationError(
                ValidationStatusCode.ClaimRequiredMissing,
                superBox,
                'Manifest store has wrong UUID',
            );
        if (!superBox.descriptionBox.label)
            throw new ValidationError(
                ValidationStatusCode.ClaimRequiredMissing,
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

        return manifestStore;
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
            return ValidationResult.error(ValidationStatusCode.ClaimRequiredMissing, this.sourceBox);
        }
    }
}
