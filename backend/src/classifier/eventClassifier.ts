import { EventPriority, EventType } from '../models/event.js';

/**
 * Deterministic event classification based on business criticality.
 * PS Requirement: No ML, deterministic mapping.
 */
export function classifyEvent(type: EventType): EventPriority {
  switch (type) {
    case 'PAYMENT':
    case 'ORDER':
      return 'CRITICAL';
    case 'INVENTORY':
      return 'HIGH';
    case 'CLICK':
    case 'LOG':
    default:
      return 'LOW';
  }
}
