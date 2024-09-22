export type Bindings = {
	SITE_URL: string;
	/**
	 * The access key for mutating the storage.
	 */
	ACCESS_KEY: string;
	STORAGE: R2Bucket;
	/**
	 * How long should the object live in the storage. (in seconds)
	 */
	OBJECT_LIFETIME?: number;
	KV: KVNamespace;
};
