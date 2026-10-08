import { createContext, useContext } from 'react';
import type { OwnerBusiness } from '../api/owner';

export const OwnerBusinessUpdaterContext = createContext<((business: OwnerBusiness) => void) | null>(null);

export function useUpdateOwnerWorkspaceBusiness() {
  return useContext(OwnerBusinessUpdaterContext);
}
