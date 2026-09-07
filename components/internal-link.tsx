import type { AnchorHTMLAttributes, PropsWithChildren } from 'react';

/**
 * Navegación interna con recarga completa. Vinext 1.0.0-beta.5 falla al
 * inicializar el prefetch RSC de next/link en el despliegue de Wrangler.
 */
export function InternalLink({ children, ...props }: PropsWithChildren<AnchorHTMLAttributes<HTMLAnchorElement>>) {
  return <a {...props}>{children}</a>;
}
