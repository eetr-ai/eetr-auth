export interface SiteAdminApiClientsRepository {
	listClientRowIds(): Promise<string[]>;
	setClientRowIds(ids: string[]): Promise<void>;
}
