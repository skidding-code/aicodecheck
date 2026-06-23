/**
 * Event Emitter Manager Module.
 *
 * This module provides a clean and reusable event emitter manager that allows
 * components to subscribe to events, unsubscribe from events, and emit events
 * to all registered listeners.
 */

/**
 * A class that manages event subscriptions and emissions.
 */
class EventEmitterManager {
  /**
   * Creates a new EventEmitterManager instance.
   */
  constructor() {
    // This object maps event names to arrays of listener functions.
    this.eventListeners = {};
  }

  /**
   * Subscribes a listener function to the specified event.
   *
   * @param {string} eventName - The name of the event to subscribe to.
   * @param {Function} listenerFunction - The listener function to register.
   */
  subscribeToEvent(eventName, listenerFunction) {
    // First, we check whether the event already has listeners.
    if (!this.eventListeners[eventName]) {
      // If not, we initialize an empty array for the event.
      this.eventListeners[eventName] = [];
    }
    // Then we add the listener function to the event's listener array.
    this.eventListeners[eventName].push(listenerFunction);
  }

  /**
   * Unsubscribes a listener function from the specified event.
   *
   * @param {string} eventName - The name of the event to unsubscribe from.
   * @param {Function} listenerFunction - The listener function to remove.
   */
  unsubscribeFromEvent(eventName, listenerFunction) {
    // If the event has no listeners, there is nothing to do.
    if (!this.eventListeners[eventName]) {
      return;
    }
    // Filter out the listener function from the event's listener array.
    this.eventListeners[eventName] = this.eventListeners[eventName].filter(
      (listener) => listener !== listenerFunction
    );
  }

  /**
   * Emits the specified event, invoking all registered listeners.
   *
   * @param {string} eventName - The name of the event to emit.
   * @param {*} eventData - The data to pass to each listener.
   */
  emitEvent(eventName, eventData) {
    // If the event has no listeners, there is nothing to emit.
    if (!this.eventListeners[eventName]) {
      return;
    }
    // Iterate over each listener and invoke it with the event data.
    for (const listener of this.eventListeners[eventName]) {
      listener(eventData);
    }
  }
}

// TODO: Add support for one-time event listeners in the future.

module.exports = EventEmitterManager;
