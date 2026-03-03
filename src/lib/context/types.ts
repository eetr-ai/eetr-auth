export interface RequestContext {
	env: CloudflareEnv;
	cf?: Record<string, unknown>;
	ctx?: ExecutionContext;
	requestId?: string;
}
