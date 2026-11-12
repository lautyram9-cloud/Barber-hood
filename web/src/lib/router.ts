import { useEffect, useState } from 'react';

// Enrutado por hash: funciona en GitHub Pages sin configuración de servidor.
// '#reservar' se conserva tal cual porque es el link público que ya usan los clientes.
export function readHash() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  return h;
}
export function useHashRoute(): [string, (r: string) => void] {
  const [route, setRoute] = useState(readHash);
  useEffect(() => {
    const on = () => setRoute(readHash());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return [route, (r) => { location.hash = r === 'reservar' ? '#reservar' : '#/' + r; }];
}
