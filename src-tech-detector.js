export function detectTech(html, headers = {}, urls = []) {
  const h = html.toLowerCase();
  const stack = [];
  const signals = [];

  const rules = [
    { name: 'WordPress', test: () => h.includes('wp-content') || h.includes('wp-includes'), icon: 'WP' },
    { name: 'Next.js', test: () => h.includes('__next') || h.includes('/_next/'), icon: '▲' },
    { name: 'Nuxt', test: () => h.includes('__nuxt') || h.includes('/_nuxt/'), icon: 'ν' },
    { name: 'React', test: () => h.includes('react') && (h.includes('data-reactroot') || h.includes('__react')), icon: '⚛' },
    { name: 'Vue.js', test: () => h.includes('vue') && (h.includes('data-v-') || h.includes('__vue__')), icon: 'V' },
    { name: 'Angular', test: () => h.includes('ng-version') || h.includes('angular'), icon: 'A' },
    { name: 'Svelte', test: () => h.includes('svelte'), icon: 'S' },
    { name: 'Shopify', test: () => h.includes('cdn.shopify.com') || h.includes('shopify'), icon: '🛒' },
    { name: 'Wix', test: () => h.includes('wix.com') || h.includes('parastorage'), icon: 'W' },
    { name: 'Squarespace', test: () => h.includes('squarespace'), icon: '□' },
    { name: 'Drupal', test: () => h.includes('drupal') || h.includes('/sites/default/'), icon: 'D' },
    { name: 'Joomla', test: () => h.includes('joomla') || h.includes('/components/com_'), icon: 'J' },
    { name: 'Laravel', test: () => h.includes('laravel') || urls.some(u => u.includes('.php')), icon: 'L' },
    { name: 'PHP', test: () => urls.some(u => u.endsWith('.php')) || h.includes('.php'), icon: 'PHP' },
    { name: 'GraphQL', test: () => h.includes('graphql') || urls.some(u => u.includes('graphql')), icon: '◈' },
    { name: 'Tailwind CSS', test: () => h.includes('tailwind') || /--tw-/.test(html), icon: 'T' },
    { name: 'Bootstrap', test: () => h.includes('bootstrap'), icon: 'B' },
    { name: 'jQuery', test: () => h.includes('jquery'), icon: '$' },
    { name: 'Cloudflare', test: () => (headers['server'] || '').includes('cloudflare') || headers['cf-ray'], icon: '☁' },
    { name: 'AWS', test: () => (headers['server'] || '').includes('Amazon') || h.includes('amazonaws'), icon: 'AWS' },
    { name: 'Vercel', test: () => (headers['server'] || '').includes('Vercel') || headers['x-vercel-id'], icon: '▲' },
    { name: 'Netlify', test: () => headers['x-nf-request-id'] || h.includes('netlify'), icon: 'N' },
    { name: 'Firebase', test: () => h.includes('firebase'), icon: '🔥' },
    { name: 'Stripe', test: () => h.includes('stripe.com') || h.includes('js.stripe'), icon: '💳' }
  ];

  for (const rule of rules) {
    if (rule.test()) {
      stack.push({ name: rule.name, icon: rule.icon });
      signals.push(rule.name);
    }
  }

  const server = headers['server'] || headers['x-powered-by'] || 'unknown';
  const cms = stack.find(s => ['WordPress', 'Shopify', 'Drupal', 'Joomla', 'Wix', 'Squarespace'].includes(s.name));

  return {
    stack,
    signals: [...new Set(signals)],
    server,
    cms: cms?.name || null,
    framework: stack.find(s => ['Next.js', 'Nuxt', 'React', 'Vue.js', 'Angular', 'Svelte'].includes(s.name))?.name || null,
    count: stack.length
  };
}

export default { detectTech };
