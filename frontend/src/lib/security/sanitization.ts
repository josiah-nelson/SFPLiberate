/**
 * Input Sanitization
 *
 * Prevents XSS attacks and data corruption by sanitizing user inputs
 * before storage and display.
 */

import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize plain text input (removes all HTML)
 */
export function sanitizeText(input: string, maxLength?: number): string {
  if (!input) return '';

  // Remove all HTML tags
  let sanitized = DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });

  // Trim whitespace
  sanitized = sanitized.trim();

  // Apply max length if specified
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}

/**
 * Sanitize HTML content (allows safe HTML tags)
 */
export function sanitizeHTML(input: string, maxLength?: number): string {
  if (!input) return '';

  // Allow safe HTML tags for rich text
  let sanitized = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href', 'title', 'target'],
    ALLOWED_URI_REGEXP: /^https?:\/\//,
    // Prevent target=_blank without noopener/noreferrer
    SAFE_FOR_TEMPLATES: true
  });

  // Ensure all external links have security attributes
  sanitized = sanitized.replace(
    /<a\s+([^>]*href=["']https?:\/\/[^"']+["'][^>]*)>/gi,
    (match, attrs) => {
      if (!attrs.includes('target=')) {
        attrs += ' target="_blank"';
      }
      if (!attrs.includes('rel=')) {
        attrs += ' rel="noopener noreferrer"';
      }
      return `<a ${attrs}>`;
    }
  );

  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}

/**
 * Sanitize and validate email address
 */
export function sanitizeEmail(email: string): string {
  if (!email) return '';

  // Remove whitespace and convert to lowercase
  const sanitized = email.trim().toLowerCase();

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(sanitized)) {
    throw new Error('Invalid email format');
  }

  return sanitized;
}

/**
 * Sanitize module data for storage
 */
export interface SanitizedModuleData {
  name: string;
  vendor?: string;
  model?: string;
  serial?: string;
  comments?: string;
}

export function sanitizeModuleData(data: any): SanitizedModuleData {
  return {
    name: sanitizeText(data.name, 255),
    vendor: data.vendor ? sanitizeText(data.vendor, 100) : undefined,
    model: data.model ? sanitizeText(data.model, 100) : undefined,
    serial: data.serial ? sanitizeText(data.serial, 100) : undefined,
    comments: data.comments ? sanitizeHTML(data.comments, 1000) : undefined,
  };
}

/**
 * Sanitize community submission data
 */
export interface SanitizedCommunityData extends SanitizedModuleData {
  wavelength?: string;
  maxDistance?: string;
  linkType?: string;
  formFactor?: string;
  connectorType?: string;
}

export function sanitizeCommunityData(data: any): SanitizedCommunityData {
  return {
    ...sanitizeModuleData(data),
    wavelength: data.wavelength ? sanitizeText(data.wavelength, 50) : undefined,
    maxDistance: data.maxDistance ? sanitizeText(data.maxDistance, 50) : undefined,
    linkType: data.linkType ? sanitizeText(data.linkType, 50) : undefined,
    formFactor: data.formFactor ? sanitizeText(data.formFactor, 50) : undefined,
    connectorType: data.connectorType ? sanitizeText(data.connectorType, 50) : undefined,
  };
}

/**
 * Escape SQL-like wildcards (for search queries)
 */
export function escapeSQLWildcards(input: string): string {
  return input.replace(/[%_]/g, '\\$&');
}

/**
 * Validate and sanitize URL
 */
export function sanitizeURL(url: string): string {
  if (!url) return '';

  // Only allow HTTP(S) URLs
  const urlRegex = /^https?:\/\/.+/i;
  if (!urlRegex.test(url)) {
    throw new Error('Invalid URL format. Only HTTP and HTTPS URLs are allowed');
  }

  return DOMPurify.sanitize(url, { ALLOWED_TAGS: [] });
}

/**
 * Strip dangerous characters from filenames
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return '';

  // Remove path traversal attempts
  let sanitized = filename.replace(/\.\./g, '');

  // Remove special characters except dots, dashes, underscores
  sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Limit length
  if (sanitized.length > 255) {
    const ext = sanitized.split('.').pop();
    const name = sanitized.substring(0, 255 - (ext ? ext.length + 1 : 0));
    sanitized = ext ? `${name}.${ext}` : name;
  }

  return sanitized;
}
