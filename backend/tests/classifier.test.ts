import { describe, it, expect } from 'vitest';
import { classifyEvent } from '../src/classifier/eventClassifier.js';

describe('EventClassifier', () => {
  it('deterministically classifies ORDER and PAYMENT as CRITICAL', () => {
    expect(classifyEvent('ORDER')).toBe('CRITICAL');
    expect(classifyEvent('PAYMENT')).toBe('CRITICAL');
  });

  it('classifies INVENTORY as HIGH priority', () => {
    expect(classifyEvent('INVENTORY')).toBe('HIGH');
  });

  it('classifies CLICK and LOG as LOW priority', () => {
    expect(classifyEvent('CLICK')).toBe('LOW');
    expect(classifyEvent('LOG')).toBe('LOW');
  });
});
