type Subscriber = (event: { timestamp: number }) => void;

const subscribers = new Set<Subscriber>();

export function subscribeAdminNotificationEvents(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

export function publishAdminNotificationCreated(): void {
  if (subscribers.size === 0) return;
  const event = { timestamp: Date.now() };
  for (const subscriber of subscribers) {
    try {
      subscriber(event);
    } catch (error) {
      console.error("Admin notification event subscriber error:", error);
    }
  }
}
