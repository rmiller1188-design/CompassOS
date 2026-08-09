import {
  createGmailReconciliationLookup,
  createMicrosoftReconciliationLookup,
  createGoogleCalendarReconciliationLookup,
  createMicrosoftCalendarReconciliationLookup,
} from './provider-reconciliation.js';
import { assertPurposeBoundProviderSession } from './purpose-bound-provider-session.js';
import { createReconciliationEgressFetch } from './reconciliation-egress-policy.js';
import {
  createReconciliationProviderError,
  normalizeReconciliationProviderLookupError,
} from './reconciliation-provider-errors.js';

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

function assertLookupContext({ account, reconciliation, providerSession }) {
  const provider = requireString(account?.provider, 'Connected account provider');
  const accountId = requireString(account?.id, 'Connected account id');
  const actionId = requireString(reconciliation?.actionId, 'Reconciliation action id');
  assertPurposeBoundProviderSession(providerSession, {
    purpose: 'reconciliation.lookup',
    subjectId: actionId,
    provider,
    accountId,
  });
  return { provider, accountId, actionId };
}

function shouldNormalizeProviderFailure(status) {
  return status === 401 || status === 403 || status === 408 || status === 425 || status === 429 || status >= 500;
}

function createSemanticProviderFetch(guardedFetch) {
  return async function semanticProviderFetch(url, init = {}) {
    const response = await guardedFetch(url, init);
    if (!response?.ok && shouldNormalizeProviderFailure(Number(response?.status || 0))) {
      const payload = await response.json();
      throw createReconciliationProviderError(response, payload);
    }
    return response;
  };
}

function createCapabilityLookup({ provider, kind, fetchImpl }) {
  const factory = provider === 'google'
    ? (kind === 'calendar' ? createGoogleCalendarReconciliationLookup : createGmailReconciliationLookup)
    : (kind === 'calendar' ? createMicrosoftCalendarReconciliationLookup : createMicrosoftReconciliationLookup);
  const guardedFetch = createReconciliationEgressFetch({ provider, kind, fetchImpl });
  const semanticFetch = createSemanticProviderFetch(guardedFetch);

  return async function capabilityLookup({ account, reconciliation, action = null, providerSession }) {
    assertLookupContext({ account, reconciliation, providerSession });
    if (account.provider !== provider) throw new Error(`Purpose-bound ${provider} provider session is required`);

    try {
      return await providerSession.withAccessToken(async (accessToken) => {
        const lookup = factory({
          fetchImpl: semanticFetch,
          tokenResolver: async (resolvedAccount) => {
            if (resolvedAccount?.id !== account.id || resolvedAccount?.provider !== account.provider) {
              throw new Error('Provider lookup attempted credential use for a different account');
            }
            return accessToken;
          },
        });
        return lookup({ account, reconciliation, action });
      });
    } catch (error) {
      throw normalizeReconciliationProviderLookupError(error);
    }
  };
}

export function createPurposeBoundProviderReconciliationLookup({
  googleFetch = globalThis.fetch,
  microsoftFetch = globalThis.fetch,
} = {}) {
  if (typeof googleFetch !== 'function' || typeof microsoftFetch !== 'function') {
    throw new TypeError('Google and Microsoft fetch implementations are required');
  }

  const gmail = createCapabilityLookup({ provider: 'google', kind: 'mail', fetchImpl: googleFetch });
  const microsoftMail = createCapabilityLookup({ provider: 'microsoft', kind: 'mail', fetchImpl: microsoftFetch });
  const googleCalendar = createCapabilityLookup({ provider: 'google', kind: 'calendar', fetchImpl: googleFetch });
  const microsoftCalendar = createCapabilityLookup({ provider: 'microsoft', kind: 'calendar', fetchImpl: microsoftFetch });

  return async function lookup({ account, reconciliation, action = null, providerSession }) {
    const { provider } = assertLookupContext({ account, reconciliation, providerSession });
    const actionType = requireString(action?.actionType || reconciliation?.actionType, 'Reconciliation action type');
    const calendar = actionType.startsWith('calendar.');

    if (provider === 'google') {
      return calendar
        ? googleCalendar({ account, reconciliation, action, providerSession })
        : gmail({ account, reconciliation, action, providerSession });
    }
    if (provider === 'microsoft') {
      return calendar
        ? microsoftCalendar({ account, reconciliation, action, providerSession })
        : microsoftMail({ account, reconciliation, action, providerSession });
    }
    throw new Error(`Unsupported reconciliation provider: ${provider}`);
  };
}
