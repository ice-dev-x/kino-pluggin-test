const BASE_URL = "https://cuevana3e.pro";

// Helper: sanitizar texto
function cleanText(text) {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]*>/g, "")
    .trim();
}

// Helper: decodificar Base64
function base64Decode(str) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  const cleanStr = (str || '').replace(/[^A-Za-z0-9\+\/\=]/g, '');

  for (let i = 0; i < cleanStr.length;) {
    const enc1 = chars.indexOf(cleanStr.charAt(i++));
    const enc2 = chars.indexOf(cleanStr.charAt(i++));
    const enc3 = chars.indexOf(cleanStr.charAt(i++));
    const enc4 = chars.indexOf(cleanStr.charAt(i++));

    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;

    output += String.fromCharCode(chr1);
    if (enc3 !== 64 && enc3 !== -1) output += String.fromCharCode(chr2);
    if (enc4 !== 64 && enc4 !== -1) output += String.fromCharCode(chr3);
  }
  return output;
}

// ==========================================
// 1. HOME
// ==========================================
export async function home() {
  const res = await kino.fetch(`${BASE_URL}/`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
  });

  if (!res.ok) return [];

  const html = await res.text();
  const items = [];
  const vistos = new Set();
  const aRegex = /<a[^>]+href="([^"]+(?:\/pelicula\/|\/serie\/)[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = aRegex.exec(html)) !== null && items.length < 40) {
    let link = match[1];
    if (link.includes("episodio")) continue;

    const innerHtml = match[2];
    const imgMatch = innerHtml.match(/src=(?:"([^"]+)"|([^ >]+))/i);
    const titleMatch = innerHtml.match(/<h2[^>]*>([^<]+)<\/h2>/i) || innerHtml.match(/alt="([^"]+)"/i);
    const yearMatch = innerHtml.match(/<span class="Year">(\d+)<\/span>/i);

    if (imgMatch && titleMatch && !vistos.has(link)) {
      vistos.add(link);
      let poster = imgMatch[1] || imgMatch[2];
      if (poster.startsWith("//")) poster = "https:" + poster;
      if (poster.startsWith("/")) poster = BASE_URL + poster;

      const isSeries = link.includes("/serie/");
      const slug = link.replace(BASE_URL, "").replace(/[^a-zA-Z0-9_-]/g, "");

      const item = {
        id: slug || ("item-" + items.length),
        ref: link.startsWith("http") ? link : `${BASE_URL}${link}`,
        title: cleanText(titleMatch[1] || titleMatch[2]),
        kind: isSeries ? "series" : "movie",
        poster: poster
      };

      if (yearMatch) item.year = parseInt(yearMatch[1], 10);
      items.push(item);
    }
  }

  return [{ id: "recientes", title: "Recientes en Cuevana", items: items }];
}

// ==========================================
// 2. SEARCH
// ==========================================
export async function search(query) {
  const searchTerm = (query && query.q) ? encodeURIComponent(query.q) : "";
  // Solución aplicada: ruta /explorar y parámetro ?s=
  const targetUrl = `${BASE_URL}/explorar?s=${searchTerm}`;

  const res = await kino.fetch(targetUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
  });

  if (!res.ok) return [];

  const html = await res.text();
  const results = [];
  const vistos = new Set();
  const aRegex = /<a[^>]+href="([^"]+(?:\/pelicula\/|\/serie\/)[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = aRegex.exec(html)) !== null && results.length < 50) {
    let link = match[1];
    if (link.includes("episodio")) continue;

    const innerHtml = match[2];
    const imgMatch = innerHtml.match(/src=(?:"([^"]+)"|([^ >]+))/i);
    const titleMatch = innerHtml.match(/<h[23][^>]*>([^<]+)<\/h[23]>/i) || innerHtml.match(/alt="([^"]+)"/i);
    const yearMatch = innerHtml.match(/<span class="Year">(\d+)<\/span>/i);

    if (imgMatch && titleMatch && !vistos.has(link)) {
      vistos.add(link);
      let poster = imgMatch[1] || imgMatch[2];
      if (poster.startsWith("//")) poster = "https:" + poster;
      
      const isSeries = link.includes("/serie/");
      const slug = link.replace(BASE_URL, "").replace(/[^a-zA-Z0-9_-]/g, "");

      const item = {
        id: slug || ("search-" + results.length),
        ref: link.startsWith("http") ? link : `${BASE_URL}${link}`,
        title: cleanText(titleMatch[1] || titleMatch[2]),
        kind: isSeries ? "series" : "movie",
        poster: poster
      };

      if (yearMatch) item.year = parseInt(yearMatch[1], 10);
      results.push(item);
    }
  }

  return results;
}

// ==========================================
// 3. EPISODES
// ==========================================
export async function episodes(ref) {
  const res = await kino.fetch(ref, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
  });

  if (!res.ok) throw new Error("No se pudo obtener la serie");
  const html = await res.text();
  
  // 1. Extraemos los links de las temporadas (ej: /temporada-1)
  const seasonRegex = /<a[^>]+href="([^"]+\/temporada-\d+)"/gi;
  const seasonLinks = [];
  let sMatch;
  while ((sMatch = seasonRegex.exec(html)) !== null) {
    let sLink = sMatch[1];
    if (!sLink.startsWith("http")) sLink = BASE_URL + sLink;
    if (!seasonLinks.includes(sLink)) seasonLinks.push(sLink);
  }

  const episodesList = [];
  const vistos = new Set();

  // 2. Si tiene temporadas, entramos a cada una para extraer los capítulos (en paralelo)
  if (seasonLinks.length > 0) {
    const seasonPromises = seasonLinks.map(link => 
      kino.fetch(link).then(r => r.ok ? r.text() : "").catch(() => "")
    );
    const seasonHtmls = await Promise.all(seasonPromises);

    for (const sHtml of seasonHtmls) {
      if (!sHtml) continue;
      const epRegex = /<a[^>]+href="([^"]+\/episodio-\d+x\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let epMatch;
      while ((epMatch = epRegex.exec(sHtml)) !== null) {
        let epRef = epMatch[1];
        if (!epRef.startsWith("http")) epRef = BASE_URL + epRef;
        if (vistos.has(epRef)) continue;
        vistos.add(epRef);

        let season = 1, number = 1;
        const numMatch = epRef.match(/episodio-(\d+)x(\d+)/i);
        if (numMatch) {
          season = parseInt(numMatch[1], 10);
          number = parseInt(numMatch[2], 10);
        }

        const titleMatch = epMatch[2].match(/<span[^>]*>([^<]+)<\/span>/i) || epMatch[2].match(/alt="([^"]+)"/i);
        const imgMatch = epMatch[2].match(/src=(?:"([^"]+)"|([^ >]+))/i);
        let still = imgMatch ? (imgMatch[1] || imgMatch[2]) : undefined;
        if (still && still.startsWith("//")) still = "https:" + still;

        episodesList.push({
          season: season,
          number: number,
          ref: epRef,
          title: titleMatch ? cleanText(titleMatch[1]) : `Episodio ${number}`,
          still: still
        });
      }
    }
  }

  // 3. Si por alguna razón la página no tiene el formato clásico, enviamos un falso positivo para poder reproducir
  if (episodesList.length === 0) {
    episodesList.push({ season: 1, number: 1, ref: ref, title: "Capítulo Único" });
  }

  episodesList.sort((a, b) => (a.season - b.season) || (a.number - b.number));
  return { episodes: episodesList };
}

// ==========================================
// 4. RESOLVE
// ==========================================
export async function resolve(ref) {
  const res = await kino.fetch(ref, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
  });

  if (!res.ok) throw new Error("No se pudo cargar la página");
  const html = await res.text();
  
  const serverRegex = /data-server="([^"]+)"/g;
  const servers = [];
  let match;
  
  while ((match = serverRegex.exec(html)) !== null) {
    servers.push(match[1]);
  }

  if (servers.length === 0) throw new Error("No se encontraron servidores de video");

  const base64Servers = servers.filter(s => s.includes("?v="));
  
  if (base64Servers.length > 0) {
    const rawCode = base64Servers[0].split("?v=")[1];
    let finalUrl = base64Decode(rawCode);

    return {
      url: finalUrl,
      headers: {
        "Referer": BASE_URL,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    };
  }

  throw new Error("No hay servidores compatibles disponibles");
}