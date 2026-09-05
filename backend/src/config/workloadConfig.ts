import { EventType, EventPriority, WorkloadScenario } from '../models/event.js';

export { WorkloadScenario };

export interface EventDistributionPercentages {
  PAYMENT: number;
  ORDER: number;
  INVENTORY: number;
  CLICK: number;
  LOG: number;
}

export interface PriorityDistributionPercentages {
  CRITICAL: number;
  HIGH: number;
  LOW: number;
}

export interface WorkloadDistributionConfig {
  name: string;
  scenario: WorkloadScenario;
  description: string;
  dominantPriority: EventPriority;
  eventDistribution: EventDistributionPercentages;
  priorityDistribution: PriorityDistributionPercentages;
}

export const WORKLOAD_CONFIGS: Record<WorkloadScenario, WorkloadDistributionConfig> = {
  CRITICAL_HEAVY: {
    name: 'Critical Heavy',
    scenario: 'CRITICAL_HEAVY',
    description: 'Majority CRITICAL (ORDER + PAYMENT dominate at 60%)',
    dominantPriority: 'CRITICAL',
    eventDistribution: {
      PAYMENT: 30,
      ORDER: 30,
      INVENTORY: 20,
      CLICK: 10,
      LOG: 10,
    },
    priorityDistribution: {
      CRITICAL: 60,
      HIGH: 20,
      LOW: 20,
    },
  },
  HIGH_HEAVY: {
    name: 'High Heavy',
    scenario: 'HIGH_HEAVY',
    description: 'Majority HIGH (INVENTORY dominates at 60%)',
    dominantPriority: 'HIGH',
    eventDistribution: {
      PAYMENT: 10,
      ORDER: 10,
      INVENTORY: 60,
      CLICK: 10,
      LOG: 10,
    },
    priorityDistribution: {
      CRITICAL: 20,
      HIGH: 60,
      LOW: 20,
    },
  },
  LOW_HEAVY: {
    name: 'Low Heavy',
    scenario: 'LOW_HEAVY',
    description: 'Majority LOW (CLICK + LOG dominate at 60%)',
    dominantPriority: 'LOW',
    eventDistribution: {
      PAYMENT: 10,
      ORDER: 10,
      INVENTORY: 20,
      CLICK: 30,
      LOG: 30,
    },
    priorityDistribution: {
      CRITICAL: 20,
      HIGH: 20,
      LOW: 60,
    },
  },
};

export const DEFAULT_WORKLOAD_SCENARIO: WorkloadScenario = 'LOW_HEAVY';

export function isValidWorkloadScenario(scenario: any): scenario is WorkloadScenario {
  return scenario === 'CRITICAL_HEAVY' || scenario === 'HIGH_HEAVY' || scenario === 'LOW_HEAVY';
}

/**
 * Samples an EventType randomly according to the given workload scenario's event distribution.
 */
export function sampleEventTypeForScenario(scenario: WorkloadScenario): EventType {
  const config = WORKLOAD_CONFIGS[scenario] || WORKLOAD_CONFIGS[DEFAULT_WORKLOAD_SCENARIO];
  const dist = config.eventDistribution;

  // Cumulative distribution thresholds (0 to 100)
  const roll = Math.random() * 100;
  let cumulative = 0;

  cumulative += dist.PAYMENT;
  if (roll < cumulative) return 'PAYMENT';

  cumulative += dist.ORDER;
  if (roll < cumulative) return 'ORDER';

  cumulative += dist.INVENTORY;
  if (roll < cumulative) return 'INVENTORY';

  cumulative += dist.CLICK;
  if (roll < cumulative) return 'CLICK';

  return 'LOG';
}
