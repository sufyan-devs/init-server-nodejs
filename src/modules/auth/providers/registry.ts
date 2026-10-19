import googleProvider from './google';
import type { AuthProviderId, IdentityProvider } from './types';

const providers = new Map<AuthProviderId, IdentityProvider>([
  [googleProvider.id, googleProvider],
]);

const getProvider = (id: AuthProviderId): IdentityProvider | undefined => {
  const provider = providers.get(id);
  if (!provider) return undefined;
  if (!provider.isEnabled()) return undefined;
  return provider;
};

const getEnabledProviderIds = (): AuthProviderId[] =>
  Array.from(providers.values())
    .filter((provider) => provider.isEnabled())
    .map((provider) => provider.id);

export { getProvider, getEnabledProviderIds };
