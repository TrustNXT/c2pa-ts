import { Crypto } from './Crypto';
import { HashAlgorithm } from './types';

/**
 * A Merkle tree implementation for C2PA BMFF hashing.
 *
 * This implementation follows the C2PA specification for Merkle trees:
 * - Leaf nodes are hashes of data chunks
 * - Internal nodes are computed by concatenating left and right child hashes and hashing the result
 * - The tree is built bottom-up from the leaves
 * - For validation, the tree stores all internal node hashes (not just the root)
 *
 * The tree structure is stored in a compact format where:
 * - `hashes` contains all internal node hashes organized by layer
 * - Layer 0 (root) has 1 node, layer 1 has up to 2 nodes, etc.
 *
 * @example
 * ```typescript
 * // Building a Merkle tree during signing
 * const tree = new MerkleTree('SHA-256');
 * for (const chunk of chunks) {
 *   await tree.addLeaf(chunk);
 * }
 * const result = await tree.build();
 * // result.hashes contains all internal nodes for storage in manifest
 * ```
 */
export class MerkleTree {
    private readonly algorithm: HashAlgorithm;
    private readonly leafHashes: Uint8Array[] = [];
    private internalNodes: Uint8Array[] = [];
    private isBuilt = false;

    constructor(algorithm: HashAlgorithm) {
        this.algorithm = algorithm;
    }

    /**
     * Adds a data chunk as a leaf node.
     * The chunk is hashed and the resulting hash is stored.
     * @param data The raw data chunk to add
     */
    public async addLeaf(data: Uint8Array): Promise<void> {
        if (this.isBuilt) {
            throw new Error('Cannot add leaves after tree is built');
        }
        const hash = await Crypto.digest(data, this.algorithm);
        this.leafHashes.push(hash);
    }

    /**
     * Adds a pre-computed hash as a leaf node.
     * Use this when you've already hashed the data externally.
     * @param hash The pre-computed hash to add as a leaf
     */
    public addLeafHash(hash: Uint8Array): void {
        if (this.isBuilt) {
            throw new Error('Cannot add leaves after tree is built');
        }
        const expectedLength = Crypto.getDigestLength(this.algorithm);
        if (hash.length !== expectedLength) {
            throw new Error(`Invalid hash length: expected ${expectedLength}, got ${hash.length}`);
        }
        this.leafHashes.push(hash);
    }

    /**
     * Builds the Merkle tree from the added leaves.
     * After building, no more leaves can be added.
     *
     * @returns An object containing:
     *   - `root`: The Merkle root hash
     *   - `hashes`: All internal node hashes for storage in manifest
     *   - `count`: The number of leaf nodes
     */
    public async build(): Promise<MerkleTreeResult> {
        if (this.isBuilt) {
            throw new Error('Tree already built');
        }
        if (this.leafHashes.length === 0) {
            throw new Error('Cannot build empty Merkle tree');
        }

        this.isBuilt = true;

        // If only one leaf, the root is the leaf hash itself
        if (this.leafHashes.length === 1) {
            this.internalNodes = [this.leafHashes[0]];
            return {
                root: this.leafHashes[0],
                hashes: this.internalNodes,
                count: 1,
            };
        }

        // Build tree bottom-up
        // Start with leaf hashes as the current layer
        let currentLayer = this.leafHashes;
        const allLayers: Uint8Array[][] = [];

        while (currentLayer.length > 1) {
            const nextLayer: Uint8Array[] = [];

            for (let i = 0; i < currentLayer.length; i += 2) {
                const left = currentLayer[i];
                const right = currentLayer[i + 1];

                if (right) {
                    // Concatenate left and right, then hash
                    nextLayer.push(await this.hashPair(left, right));
                } else {
                    // Odd number of nodes: promote the last node unchanged
                    nextLayer.push(left);
                }
            }

            allLayers.push(nextLayer);
            currentLayer = nextLayer;
        }

        // Flatten layers from top to bottom for storage (root first)
        // This matches the C2PA spec format
        this.internalNodes = allLayers.reverse().flat();

        return {
            root: currentLayer[0],
            hashes: this.internalNodes,
            count: this.leafHashes.length,
        };
    }

    /**
     * Gets the leaf hashes (for storage in manifest).
     */
    public getLeafHashes(): Uint8Array[] {
        return [...this.leafHashes];
    }

    /**
     * Generates a Merkle proof for a specific leaf.
     * The proof contains sibling hashes needed to reconstruct the root.
     *
     * @param leafIndex The index of the leaf to generate proof for
     * @returns Array of sibling hashes from leaf to root
     */
    public async getProof(leafIndex: number): Promise<Uint8Array[]> {
        if (!this.isBuilt) {
            throw new Error('Tree must be built before generating proofs');
        }
        if (leafIndex < 0 || leafIndex >= this.leafHashes.length) {
            throw new Error(`Invalid leaf index: ${leafIndex}`);
        }

        const proof: Uint8Array[] = [];
        let currentLayer = this.leafHashes;
        let index = leafIndex;

        while (currentLayer.length > 1) {
            const isRight = index % 2 === 1;
            const siblingIndex = isRight ? index - 1 : index + 1;

            if (siblingIndex < currentLayer.length) {
                proof.push(currentLayer[siblingIndex]);
            }

            // Move to next layer
            const nextLayer: Uint8Array[] = [];
            for (let i = 0; i < currentLayer.length; i += 2) {
                const left = currentLayer[i];
                const right = currentLayer[i + 1];
                if (right) {
                    nextLayer.push(await this.hashPair(left, right));
                } else {
                    nextLayer.push(left);
                }
            }
            currentLayer = nextLayer;
            index = Math.floor(index / 2);
        }

        return proof;
    }

    /**
     * Verifies a Merkle proof for a given leaf hash.
     *
     * @param leafHash The hash of the leaf data
     * @param leafIndex The index of the leaf in the tree
     * @param proof The Merkle proof (sibling hashes)
     * @param root The expected Merkle root
     * @param algorithm The hash algorithm used
     * @returns True if the proof is valid
     */
    public static async verify(
        leafHash: Uint8Array,
        leafIndex: number,
        proof: Uint8Array[],
        root: Uint8Array,
        algorithm: HashAlgorithm,
    ): Promise<boolean> {
        let currentHash = leafHash;
        let index = leafIndex;

        for (const sibling of proof) {
            const isRight = index % 2 === 1;

            if (isRight) {
                // Current is right child, sibling is left
                currentHash = await MerkleTree.hashPairStatic(sibling, currentHash, algorithm);
            } else {
                // Current is left child, sibling is right
                currentHash = await MerkleTree.hashPairStatic(currentHash, sibling, algorithm);
            }

            index = Math.floor(index / 2);
        }

        return bufEqual(currentHash, root);
    }

    /**
     * Verifies leaf hashes against stored internal node hashes.
     * This is the C2PA validation approach where the manifest stores
     * the leaf hashes directly (for direct comparison).
     *
     * @param leafHashes Array of leaf hashes from chunked data
     * @param storedHashes The hashes stored in the manifest
     * @param algorithm The hash algorithm
     * @returns True if all leaf hashes match
     */
    public static verifyLeafHashes(leafHashes: Uint8Array[], storedHashes: Uint8Array[]): boolean {
        if (leafHashes.length !== storedHashes.length) {
            return false;
        }

        for (let i = 0; i < leafHashes.length; i++) {
            if (!bufEqual(leafHashes[i], storedHashes[i])) {
                return false;
            }
        }

        return true;
    }

    /**
     * Computes the tree layout (number of nodes per layer).
     * This matches the C2PA specification's `to_layout` function.
     *
     * @param leafCount Number of leaves
     * @returns Array of node counts per layer (from leaves to root)
     */
    public static toLayout(leafCount: number): number[] {
        const layers: number[] = [leafCount];
        let current = leafCount;

        while (current > 1) {
            current = Math.ceil(current / 2);
            layers.push(current);
        }

        return layers;
    }

    /**
     * Hash two nodes together (left || right).
     */
    private async hashPair(left: Uint8Array, right: Uint8Array): Promise<Uint8Array> {
        const combined = new Uint8Array(left.length + right.length);
        combined.set(left, 0);
        combined.set(right, left.length);
        return Crypto.digest(combined, this.algorithm);
    }

    /**
     * Static version of hashPair for verification.
     */
    private static async hashPairStatic(
        left: Uint8Array,
        right: Uint8Array,
        algorithm: HashAlgorithm,
    ): Promise<Uint8Array> {
        const combined = new Uint8Array(left.length + right.length);
        combined.set(left, 0);
        combined.set(right, left.length);
        return Crypto.digest(combined, algorithm);
    }
}

/**
 * Result of building a Merkle tree.
 */
export interface MerkleTreeResult {
    /** The Merkle root hash */
    root: Uint8Array;
    /** All internal node hashes for storage */
    hashes: Uint8Array[];
    /** Number of leaf nodes */
    count: number;
}

/**
 * Compare two Uint8Arrays for equality.
 */
function bufEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}
