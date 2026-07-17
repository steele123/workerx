export const SCOPES = ['upload', 'delete', 'admin'] as const;

export type Scope = (typeof SCOPES)[number];

export type AuthContext = {
	name: string;
	scopes: Set<Scope>;
	via: 'master' | 'api-key' | 'cloudflare-access';
};

export type App = {
	Bindings: Env;
	Variables: {
		auth: AuthContext;
	};
};

export type ShareKind = 'image' | 'file' | 'link';
