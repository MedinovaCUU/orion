const BASE_URL = import.meta.env.BASE_URL || '/';

export const getPublicAssetUrl = (path: string) => `${BASE_URL}${path.replace(/^\/+/, '')}`;
