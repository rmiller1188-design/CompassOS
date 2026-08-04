function email(value) {
  return String(value || "").trim().toLowerCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function buildIdentityIndex(contacts = []) {
  const byEmail = new Map();
  for (const contact of contacts) {
    if (!contact || contact.isDeleted) continue;
    for (const address of contact.emails || []) {
      const key = email(address);
      if (!key) continue;
      const current = byEmail.get(key) || [];
      current.push({
        accountId: contact.accountId,
        provider: contact.provider,
        providerContactId: contact.providerContactId,
        displayName: contact.displayName || key,
        organization: contact.organization || null,
        jobTitle: contact.jobTitle || null,
      });
      byEmail.set(key, current);
    }
  }
  return byEmail;
}

function relatedMessages(attendeeEmail, messages, limit) {
  return messages
    .filter((message) => {
      const participants = unique([message.from, ...(message.to || []), ...(message.cc || [])].map(email));
      return participants.includes(attendeeEmail);
    })
    .sort((a, b) => new Date(b.receivedAt || b.sentAt) - new Date(a.receivedAt || a.sentAt))
    .slice(0, limit)
    .map((message) => ({
      accountId: message.accountId,
      providerMessageId: message.providerMessageId,
      threadKey: message.threadKey,
      subject: message.subject || "",
      snippet: message.snippet || "",
      from: message.from || null,
      sentAt: message.sentAt,
      receivedAt: message.receivedAt,
    }));
}

export function buildMeetingContext({ event, contacts = [], messages = [], maxMessagesPerAttendee = 5 }) {
  if (!event?.accountId || !event?.providerEventId) throw new TypeError("Normalized event is required");
  const identityIndex = buildIdentityIndex(contacts);
  const attendeeEmails = unique([event.organizer, ...(event.attendees || [])].map(email));
  const attendees = attendeeEmails.map((address) => {
    const identities = identityIndex.get(address) || [];
    return {
      email: address,
      identities,
      displayName: identities[0]?.displayName || address,
      organization: identities.find((item) => item.organization)?.organization || null,
      jobTitle: identities.find((item) => item.jobTitle)?.jobTitle || null,
      recentMessages: relatedMessages(address, messages, maxMessagesPerAttendee),
    };
  });
  const threadKeys = unique(attendees.flatMap((attendee) => attendee.recentMessages.map((message) => message.threadKey)));
  return {
    event: {
      accountId: event.accountId,
      provider: event.provider,
      providerEventId: event.providerEventId,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      organizer: event.organizer || null,
      location: event.location || null,
    },
    attendees,
    threadKeys,
    generatedFrom: {
      contactCount: contacts.length,
      messageCount: messages.length,
      attendeeCount: attendees.length,
    },
  };
}

export function createMeetingPrepBoundary(context) {
  if (!context?.event || !Array.isArray(context.attendees)) throw new TypeError("Meeting context is required");
  return {
    event: context.event,
    people: context.attendees.map((attendee) => ({
      email: attendee.email,
      displayName: attendee.displayName,
      organization: attendee.organization,
      jobTitle: attendee.jobTitle,
      recentConversation: attendee.recentMessages.map((message) => ({
        subject: message.subject,
        snippet: message.snippet,
        receivedAt: message.receivedAt,
      })),
    })),
    provenance: {
      threadKeys: context.threadKeys,
      generatedFrom: context.generatedFrom,
    },
  };
}
