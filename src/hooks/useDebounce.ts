/**
 * useDebounce.ts - Debounce Hook
 * 
 * Delays the update of a value until it has stopped changing for a specified duration.
 * Used to stabilize renderQualityScale during rapid zoom changes.
 * 
 * Sprint 2.1: High-Fidelity Hybrid Zoom
 */

import { useState, useEffect } from 'react';

/**
 * Returns a debounced version of the input value.
 * The debounced value only updates after the input has been stable for `delayMs`.
 * 
 * @param value - The value to debounce
 * @param delayMs - Delay in milliseconds before updating
 * @returns The debounced value
 * 
 * @example
 * const debouncedScale = useDebounce(scale, 150);
 */
export function useDebounce<T>(value: T, delayMs: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        // Set up a timer to update the debounced value after the delay
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delayMs);

        // Cleanup: cancel the timer if value changes before delay expires
        return () => {
            clearTimeout(handler);
        };
    }, [value, delayMs]);

    return debouncedValue;
}
