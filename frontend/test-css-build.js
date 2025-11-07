#!/usr/bin/env node
/**
 * Test script to validate that Tailwind CSS utilities are properly generated
 * This tests the fix for the unstyled HTML issue on Appwrite Sites
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

console.log('🧪 Testing Tailwind CSS Build Output\n');

// Find all CSS files in .next/static
const cssFiles = glob.sync('.next/static/**/*.css');

if (cssFiles.length === 0) {
  console.error('❌ FAIL: No CSS files found in .next/static');
  console.error('   Run `npm run build` first');
  process.exit(1);
}

console.log(`📁 Found ${cssFiles.length} CSS file(s)`);
cssFiles.forEach(file => console.log(`   - ${file}`));
console.log('');

// Read all CSS content
let allCss = '';
cssFiles.forEach(file => {
  allCss += fs.readFileSync(file, 'utf8');
});

console.log(`📊 Total CSS size: ${(allCss.length / 1024).toFixed(2)} KB\n`);

// Test cases: utilities that MUST exist in the generated CSS
const requiredUtilities = [
  // Layout utilities used in page.tsx
  { pattern: /\.mx-auto\b/, name: 'mx-auto (margin auto)' },
  { pattern: /\.w-full\b/, name: 'w-full (width full)' },
  { pattern: /\.max-w-7xl\b/, name: 'max-w-7xl (max width)' },
  { pattern: /\.px-4\b/, name: 'px-4 (padding x)' },
  { pattern: /\.py-6\b/, name: 'py-6 (padding y)' },
  
  // Grid utilities
  { pattern: /\.grid\b/, name: 'grid (display grid)' },
  { pattern: /\.gap-6\b/, name: 'gap-6 (grid gap)' },
  
  // Typography
  { pattern: /\.text-2xl\b/, name: 'text-2xl (font size)' },
  { pattern: /\.text-sm\b/, name: 'text-sm (font size)' },
  { pattern: /\.font-semibold\b/, name: 'font-semibold (font weight)' },
  
  // Responsive utilities
  { pattern: /\.md\\:grid-cols-3\b/, name: 'md:grid-cols-3 (responsive grid)' },
  { pattern: /\.md\\:col-span-2\b/, name: 'md:col-span-2 (responsive span)' },
  
  // Spacing
  { pattern: /\.mt-1\b/, name: 'mt-1 (margin top)' },
  { pattern: /\.mb-6\b/, name: 'mb-6 (margin bottom)' },
];

let passed = 0;
let failed = 0;

console.log('🔍 Testing for required utilities:\n');

requiredUtilities.forEach(({ pattern, name }) => {
  if (pattern.test(allCss)) {
    console.log(`✅ PASS: ${name}`);
    passed++;
  } else {
    console.log(`❌ FAIL: ${name} not found`);
    failed++;
  }
});

console.log('\n' + '='.repeat(60));
console.log(`📈 Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60) + '\n');

if (failed > 0) {
  console.error('❌ TEST FAILED: Missing required Tailwind utilities');
  console.error('   This indicates the Tailwind CSS build is not working correctly.');
  console.error('   The frontend will appear as unstyled HTML in production.\n');
  process.exit(1);
}

console.log('✅ TEST PASSED: All required utilities present');
console.log('   Tailwind CSS is generating utility classes correctly.\n');
process.exit(0);
