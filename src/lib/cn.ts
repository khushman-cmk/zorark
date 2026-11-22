import { clsx, type ClassValue } from "clsx";

/**
 * Joins class names.
 *
 * Deliberately just clsx: this project has no `tailwind-merge`, and the
 * components here are written so that conflicting utilities never reach the
 * same element, which is what twMerge would exist to untangle.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
