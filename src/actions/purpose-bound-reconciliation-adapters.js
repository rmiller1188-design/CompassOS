import {
  createGmailReconciliationLookup,
  createMicrosoftReconciliationLookup,
  createGoogleCalendarReconciliationLookup,
  createMicrosoftCalendarReconciliationLookup,
} from './provider-reconciliation.js';
import { assertPurposeBoundProviderSession } from './purpose-bound-provider-session.js';

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

function createCapabilityLookup({ provider, kind, fetchImpl }) {
  const factory = provider === 'google'
    ? (kind === 'calendar' ? createGoogleCalendarReconciliationLookup : createGmailReconciliationLookup)
    : (kind === 'calendar' ? createMicrosoftCalendarReconciliationLookup : createMicrosoftReconciliationLookup);

  return async function capabilityLookup({ account, reconciliation, action = null, providerSession }) {
    assertLookupContext({ account, reconciliation, providerSession });
    if (account.provider !== provider) throw new Error(`Purpose-bound ${provider} provider session is required`);

    return providerSession.withAccessToken(async (accessToken) => {
      const lookup = factory({
        fetchImpl,
        tokenResolver: async (resolvedAccount) => {
          if (resolvedAccount?.id !== account.id || resolvedAccount?.provider !== account.provider) {
            throw new Error('Provider lookup attempted credential use for a different account');
          }
          return accessToken;
        },
      });
      return lookup({ account, reconciliation, action });
    });
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
