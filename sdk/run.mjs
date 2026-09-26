import path from 'path';
import { pathToFileURL } from 'url';

// Simulador de la API global 'kino'
global.kino = {
  apiVersion: 1,
  appVersion: "1.42.0",
  lang: "es-CO",
  log: console.log,
  storage: {
    get: () => null,
    set: () => {},
    remove: () => {}
  },
  fetch: async (url, options = {}) => {
    console.log(`\x1b[90m[kino.fetch] Petición a: ${url}\x1b[0m`);
    // Usamos el fetch nativo de Node.js
    const res = await fetch(url, options);
    return {
      ok: res.ok,
      status: res.status,
      url: res.url,
      headers: res.headers,
      text: () => res.text(),
      json: () => res.json()
    };
  }
};

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Uso: node sdk/run.mjs ./plugin.js <home|search|episodes|resolve> [argumento]");
  process.exit(1);
}

// Convertimos la ruta local a una URL válida de tipo file:// para que Windows no falle
const pluginPath = path.resolve(args[0]);
const pluginUrl = pathToFileURL(pluginPath).href;
const capability = args[1];
const extraArg = args[2];

try {
  // Importar dinámicamente usando la URL del archivo
  const plugin = await import(pluginUrl);
  
  if (typeof plugin[capability] !== 'function') {
    console.error(`Error: Tu plugin no exporta la función '${capability}'`);
    process.exit(1);
  }

  console.log(`\nEjecutando capability: ${capability}...\n`);
  
  let result;
  if (capability === 'search') {
    result = await plugin.search({ q: extraArg });
  } else if (capability === 'home') {
    result = await plugin.home();
  } else if (capability === 'episodes' || capability === 'resolve') {
    if (!extraArg) throw new Error(`La función ${capability} requiere un argumento <ref>`);
    result = await plugin[capability](extraArg);
  }

  // Imprimir el resultado en formato JSON legible
  console.log("\n=== RESULTADO ===");
  console.log(JSON.stringify(result, null, 2));

} catch (error) {
  console.error("\n=== ERROR CRÍTICO ===");
  console.error(error);
}