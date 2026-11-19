import { useState } from 'react';
import { iniciales, urlFoto } from '@/lib/fotos';
import { cx } from './index';

/** Foto de perfil redonda; si no hay foto (o no carga) muestra las iniciales. */
export function Avatar({ nombre, foto, size = 56, className }: { nombre: string; foto?: string | null; size?: number; className?: string }) {
  const url = urlFoto(foto);
  const [falla, setFalla] = useState<string | null>(null);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  if (url && falla !== url) {
    return <img src={url} alt={nombre} width={size} height={size} loading="lazy" onError={() => setFalla(url)} style={style}
      className={cx('shrink-0 rounded-full border border-line-strong bg-surface-2 object-cover', className)} />;
  }
  return (
    <span role="img" aria-label={nombre} style={style}
      className={cx('flex shrink-0 select-none items-center justify-center rounded-full border border-line-strong bg-gradient-to-br from-accent/30 to-surface-2 font-semibold text-fg', className)}>
      {iniciales(nombre)}
    </span>
  );
}
