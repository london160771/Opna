import { apiBaseUrl } from '../lib/config';

export type OwnerBusiness = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
};

export async function getOwnerBusiness(accessToken: string): Promise<OwnerBusiness | null> {
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/owner/business`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) {
    throw new Error('Your session has expired. Please sign in again.');
  }
  if (!response.ok) {
    throw new Error('We could not check your business setup. Try again.');
  }

  const body = await response.json() as { data: OwnerBusiness | null };
  return body.data;
}
