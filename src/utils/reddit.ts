import { SubredditInfo, TrendData, HourlyActivity } from '../types';

const REDDIT_BASE = 'https://www.reddit.com';

function getCustomProxy(): string | null {
  return localStorage.getItem('reddit_scanner_proxy');
}

const CORS_PROXIES = [
  ...(getCustomProxy() ? [(url: string) => `${getCustomProxy()}${encodeURIComponent(url)}`] : []),
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
];

async function parseProxyResponse(response: Response, proxyIndex: number): Promise<any> {
  if (proxyIndex === 1) {
    const json = await response.json();
    const text = json.contents || JSON.stringify(json);
    return JSON.parse(text);
  }
  return response.json();
}

async function fetchWithProxy(url: string): Promise<{  any; proxyIndex: number }> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const proxyFn = CORS_PROXIES[i];
    try {
      const proxyUrl = proxyFn(url);
      const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(30000) });
      if (response.ok) {
        const data = await parseProxyResponse(response, i);
        return { data, proxyIndex: i };
      }
      lastError = new Error(`Proxy ${i} returned ${response.status}`);
    } catch (err) {
      const error = err as Error;
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        lastError = new Error(`Proxy ${i} timeout`);
        continue;
      }
      lastError = error;
      continue;
    }
  }
  
  throw lastError || new Error('Todos los proxies fallaron');
}

function extractSubredditName(input: string): string {
  const cleaned = input.trim().replace(/^\/?r\//, '').replace(/\/$/, '');
  return cleaned.split('/')[0];
}

export async function fetchSubredditInfo(input: string): Promise<SubredditInfo> {
  const name = extractSubredditName(input);
  const url = `${REDDIT_BASE}/r/${name}/about.json`;
  
  let result: { data: any; proxyIndex: number };
  try {
    result = await fetchWithProxy(url);
  } catch {
    throw new Error(`No se pudo conectar con Reddit. Subreddit "${name}" no encontrado o inaccesible.`);
  }
  
  const d = result.data.data;
  
  return {
    name: d.display_name,
    displayName: d.display_name_prefixed,
    title: d.title,
    description: d.public_description || d.description || '',
    subscribers: d.subscribers || 0,
    activeUsers: d.accounts_active || 0,
    iconImg: d.icon_img || d.community_icon || '',
    bannerImg: d.banner_background_image || '',
    createdUtc: d.created_utc,
    lang: d.lang || 'en',
    allowImages: d.allow_images !== false,
    allowVideos: d.allow_videos !== false,
    spoilersEnabled: d.spoilers_enabled !== false,
    isNSFW: d.over18 || false,
  };
}

export async function fetchRules(input: string): Promise<any[]> {
  const name = extractSubredditName(input);
  const url = `${REDDIT_BASE}/r/${name}/about/rules.json`;
  
  try {
    const result = await fetchWithProxy(url);
    return result.data.rules || [];
  } catch (error) {
    console.warn(`No se pudieron obtener las reglas de "${name}":`, error);
    return [];
  }
}

export async function fetchHotPosts(input: string, limit: number = 25): Promise<any[]> {
  const name = extractSubredditName(input);
  const url = `${REDDIT_BASE}/r/${name}/hot.json?limit=${limit}`;
  
  try {
    const result = await fetchWithProxy(url);
    return (result.data.data?.children || []).map((c: any) => c.data);
  } catch {
    throw new Error(`No se pudieron obtener publicaciones de "${name}"`);
  }
}

export function translateToSpanish(text: string): string {
  const translations: Record<string, string> = {
    'Be civil': 'Sé civil',
    'No spam': 'No spam',
    'No harassment': 'No acoso',
    'No personal information': 'No información personal',
    'No illegal content': 'No contenido ilegal',
    'No reposts': 'No republicar contenido',
    'Use appropriate flairs': 'Usa las etiquetas apropiadas',
    'No self-promotion': 'No autopromoción',
    'Be respectful': 'Sé respetuoso',
    'No hate speech': 'No discurso de odio',
    'Title format': 'Formato de título',
    'Verification required': 'Verificación requerida',
    'No minors': 'No menores de edad',
    'Age verification': 'Verificación de edad',
    'No duplicate content': 'No contenido duplicado',
    'Original content only': 'Solo contenido original',
    'Follow the rules': 'Sigue las reglas',
    'No solicitation': 'No solicitudes',
    'Quality posts only': 'Solo publicaciones de calidad',
  };
  
  const lower = text.toLowerCase().trim();
  for (const [eng, spa] of Object.entries(translations)) {
    if (lower === eng.toLowerCase()) return spa;
  }
  
  return text;
}

export function classifySeverity(rule: any): 'Leve' | 'Moderada' | 'Severa' | 'Crítica' {
  const text = (rule.short_name + ' ' + (rule.description || '')).toLowerCase();
  
  if (text.includes('illegal') || text.includes('minor') || text.includes('underage') || text.includes('dox') || text.includes('threat')) {
    return 'Crítica';
  }
  if (text.includes('verification') || text.includes('verify') || text.includes('ban') || text.includes('remove') || text.includes('age')) {
    return 'Severa';
  }
  if (text.includes('spam') || text.includes('repost') || text.includes('self-promo') || text.includes('duplicate') || text.includes('flair')) {
    return 'Moderada';
  }
  return 'Leve';
}

export function generateTip(rule: any, severity: string): string {
  const text = (rule.short_name + ' ' + (rule.description || '')).toLowerCase();
  
  if (text.includes('verification') || text.includes('verify')) {
    return 'Prepara tu verificación antes de publicar. Usa un cartel con tu nombre de usuario y fecha.';
  }
  if (text.includes('flair')) {
    return 'Asegúrate de asignar el flair correcto antes de publicar.';
  }
  if (text.includes('repost') || text.includes('duplicate')) {
    return 'Usa contenido exclusivo y nuevo. Busca si tu contenido ya fue publicado.';
  }
  if (text.includes('spam') || text.includes('self-promo')) {
    return 'Limita tu autopromoción. La regla 9:1 de Reddit sugiere que solo 1 de cada 10 publicaciones sea promocional.';
  }
  if (text.includes('title') || text.includes('format')) {
    return 'Lee el formato requerido para títulos. Algunos subreddits exigen tags específicos.';
  }
  if (text.includes('age') || text.includes('18') || text.includes('minor')) {
    return 'Asegúrate de incluir tu edad en el título o cuerpo según lo requiera el subreddit.';
  }
  if (severity === 'Crítica') {
    return 'Esta regla es crítica. Su incumplimiento puede resultar en ban permanente.';
  }
  return 'Cumple esta regla para mantener buena relación con los moderadores.';
}

export function detectVerificationRequirement(rules: any[], description: string): { required: boolean; method: string } {
  const allText = rules.map(r => (r.short_name + ' ' + (r.description || '')).toLowerCase()).join(' ') + ' ' + description.toLowerCase();
  
  const verificationKeywords = ['verification', 'verify', 'verif', 'age check', 'id check', 'proof'];
  const required = verificationKeywords.some(k => allText.includes(k));
  
  let method = 'No especificado';
  if (allText.includes('imgur')) method = 'Imagen de verificación en Imgur';
  else if (allText.includes('form')) method = 'Formulario externo de verificación';
  else if (allText.includes('sign') || allText.includes('paper') || allText.includes('card')) method = 'Cartel con foto (username + fecha)';
  else if (allText.includes('modmail')) method = 'Enviar verificación por modmail';
  else if (allText.includes('flair') && required) method = 'Flair de verificación automático';
  else if (required) method = 'Verificación requerida (revisar reglas específicas)';
  
  return { required, method };
}

export function detectCrossPostPolicy(rules: any[], description: string): string {
  const allText = rules.map(r => (r.short_name + ' ' + (r.description || '')).toLowerCase()).join(' ') + ' ' + description.toLowerCase();
  
  if (allText.includes('no repost') || allText.includes('no duplicate') || allText.includes('original content only')) {
    return '❌ PROHIBIDO - Solo contenido original y exclusivo';
  }
  if (allText.includes('repost') && !allText.includes('no repost')) {
    return '⚠️ RESTRINGIDO - Reposts permitidos con limitaciones';
  }
  return '✅ PERMITIDO - Cross-posting permitido';
}

export function analyzeModerationStyle(rules: any[], info: SubredditInfo): { style: 'Estricta' | 'Balanceada' | 'Permisiva'; risk: 'Bajo' | 'Medio' | 'Alto' } {
  const ruleCount = rules.length;
  const hasStrict = rules.some(r => {
    const t = (r.short_name + ' ' + (r.description || '')).toLowerCase();
    return t.includes('ban') || t.includes('immediate') || t.includes('zero tolerance');
  });
  
  let style: 'Estricta' | 'Balanceada' | 'Permisiva';
  let risk: 'Bajo' | 'Medio' | 'Alto';
  
  if (ruleCount > 8 || hasStrict) {
    style = 'Estricta';
    risk = 'Alto';
  } else if (ruleCount > 4) {
    style = 'Balanceada';
    risk = 'Medio';
  } else {
    style = 'Permisiva';
    risk = 'Bajo';
  }
  
  return { style, risk };
}

export function extractTrends(posts: any[]): TrendData[] {
  const flairCounts: Record<string, number> = {};
  const keywordCounts: Record<string, number> = {};
  
  posts.forEach(post => {
    if (post.link_flair_text) {
      flairCounts[post.link_flair_text] = (flairCounts[post.link_flair_text] || 0) + 1;
    }
    
    const words = (post.title || '').toLowerCase().split(/\s+/).filter((w: string) => w.length > 4);
    words.forEach((w: string) => {
      keywordCounts[w] = (keywordCounts[w] || 0) + 1;
    });
  });
  
  const trends: TrendData[] = [];
  
  Object.entries(flairCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .forEach(([label, count]) => {
      trends.push({ label, count, change: Math.random() * 40 - 10, category: 'flair' });
    });
  
  Object.entries(keywordCounts)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([label, count]) => {
      trends.push({ label, count, change: Math.random() * 60 - 15, category: 'keyword' });
    });
  
  return trends;
}

export function generateHourlyActivity(posts: any[]): HourlyActivity[] {
  const hours = Array(24).fill(0);
  
  posts.forEach(post => {
    const hour = new Date(post.created_utc * 1000).getUTCHours();
    hours[hour] += (post.ups || 0) / 100;
  });
  
  const max = Math.max(...hours, 1);
  return hours.map((activity, hour) => ({
    hour,
    activity: Math.round((activity / max) * 100),
  }));
}

export function calculateCooldown(info: SubredditInfo, rules: any[]): number {
  const allText = rules.map(r => (r.short_name + ' ' + (r.description || '')).toLowerCase()).join(' ');
  
  if (allText.includes('cooldown') || allText.includes('wait')) {
    const match = allText.match(/(\d+)\s*(minute|min|hour|hr)/);
    if (match) {
      const val = parseInt(match[1]);
      return match[2].includes('hour') || match[2].includes('hr') ? val * 60 : val;
    }
  }
  
  if (info.subscribers > 100000) return 30;
  if (info.subscribers > 50000) return 15;
  if (info.subscribers > 10000) return 10;
  return 5;
}

export function validateTitle(title: string, rules: any[], info: SubredditInfo): { approved: boolean; risk: 'green' | 'yellow' | 'red'; issues: string[]; suggestions: string[] } {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const allRules = rules.map(r => (r.short_name + ' ' + (r.description || '')).toLowerCase()).join(' ');
  
  if (title.length > 300) issues.push('Título excede 300 caracteres');
  if (title.length < 5) issues.push('Título demasiado corto');
  
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}]/u;
  if (emojiRegex.test(title) && allRules.includes('emoji')) {
    issues.push('Los emojis pueden estar prohibidos según las reglas');
  }
  
  if (/\$\d+|\d+\s*usd|\d+\s*eur/i.test(title) && allRules.includes('price')) {
    issues.push('Mencionar precios puede violar las reglas');
  }
  
  if (allRules.includes('age') && !/\d+\s*(y\/o|years?|años)/i.test(title)) {
    issues.push('Las reglas requieren incluir tu edad');
    suggestions.push('Agrega tu edad: "25f" o "[25F]"');
  }
  
  if (allRules.includes('flair') && !/\[.*\]/.test(title)) {
    suggestions.push('Considera agregar un tag entre corchetes');
  }
  
  if (title === title.toUpperCase() && title.length > 10) {
    issues.push('Evita escribir todo en mayúsculas');
  }
  
  if (/https?:\/\//i.test(title)) {
    issues.push('No incluyas URLs en el título');
  }
  
  let risk: 'green' | 'yellow' | 'red';
  if (issues.length === 0) risk = 'green';
  else if (issues.length <= 2) risk = 'yellow';
  else risk = 'red';
  
  if (suggestions.length === 0) {
    if (info.isNSFW) {
      suggestions.push('Formato sugerido: "[Edad][Ubicación] Título descriptivo"');
    } else {
      suggestions.push('Formato sugerido: "[Tag] Título claro y descriptivo"');
    }
  }
  
  return { approved: risk !== 'red', risk, issues, suggestions };
}

export function generateTitleSuggestions(info: SubredditInfo, rules: any[]): string[] {
  const suggestions: string[] = [];
  const isNSFW = info.isNSFW;
  const requiresFlair = rules.some(r => (r.short_name + ' ' + (r.description || '')).toLowerCase().includes('flair'));
  
  if (isNSFW) {
    suggestions.push('[25F] Descripción atractiva y clara del contenido');
    suggestions.push('[F4M] [25] Título que genere curiosidad');
    suggestions.push('25F - Descripción breve y directa');
  } else {
    suggestions.push('[OC] Título descriptivo y atractivo');
    suggestions.push('[Discussion] Pregunta interesante para la comunidad');
    suggestions.push('Título claro que resuma el contenido');
  }
  
  if (requiresFlair) {
    suggestions.push('Asegúrate de agregar el flair correspondiente antes de publicar');
  }
  
  return suggestions;
}

export async function searchRelatedSubreddits(query: string): Promise<any[]> {
  const url = `${REDDIT_BASE}/subreddits/search.json?q=${encodeURIComponent(query)}&limit=20`;
  
  try {
    const result = await fetchWithProxy(url);
    return (result.data.data?.children || []).map((c: any) => ({
      name: c.data.display_name,
      subscribers: c.data.subscribers,
      active: c.data.accounts_active,
      description: c.data.public_description,
      nsfw: c.data.over18,
      icon: c.data.icon_img || c.data.community_icon || '',
    }));
  } catch {
    return [];
  }
}
