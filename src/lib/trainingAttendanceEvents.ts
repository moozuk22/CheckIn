type Subscriber = (event: { trainingDate: string; timestamp: number }) => void;

const subscribers = new Set<Subscriber>();

export function subscribeTrainingAttendanceEvents(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

export function publishTrainingAttendanceUpdated(trainingDate: string): void {
  if (subscribers.size === 0) {
    return;
  }
  const event = { trainingDate, timestamp: Date.now() };
  for (const subscriber of subscribers) {
    try {
      subscriber(event);
    } catch (error) {
      console.error("Training attendance event subscriber error:", error);
    }
  }
}
